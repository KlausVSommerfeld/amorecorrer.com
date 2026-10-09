/*
 * Entrega do caso ao pipeline — spec
 * docs/superpowers/specs/2026-10-09-entrega-unica-ao-pipeline-design.md.
 *
 * Usado pela `form-submit` e pela `stripe-webhook`. Quem consegue reservar o
 * caso (`reservar_entrega`, a trava atômica `pending → generating` no banco)
 * faz o POST assinado; o outro disparo recebe a reserva vazia e desiste. Se o
 * POST falha, `devolver_entrega` volta o caso a `pending` para uma nova
 * tentativa — o Stripe reenvia o evento (500 da webhook) ou o cliente clica de
 * novo (503 da form-submit).
 *
 * Sem imports, como o `form-submit/verificacao.ts`: roda no Deno da Edge e no
 * `node --test` do `npm run radar:test`. O cliente do Supabase e o `fetch`
 * entram como dependências.
 */

export type Origem = "formulario" | "webhook";
export type ResultadoEntrega = "entregue" | "nada_a_fazer" | "falhou";

// O pipeline responde 202 antes de qualquer trabalho (o `main.py` só confere a
// assinatura e agenda). Dez segundos são folga para túnel e cold start; sem
// limite nenhum, um pipeline pendurado segurava a Edge até ela morrer.
export const ENTREGA_TIMEOUT_MS = 10_000;

type RespostaRpc = { data: unknown; error: unknown };

export type DepsEntrega = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RespostaRpc>;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  env: (nome: string) => string | undefined;
  log?: (nivel: "info" | "error", etapa: string, detalhes: Record<string, unknown>) => void;
};

function logPadrao(nivel: "info" | "error", etapa: string, detalhes: Record<string, unknown>) {
  if (nivel === "error") console.error(`[entrega] ${etapa}`, detalhes);
  else console.info(`[entrega] ${etapa}`, detalhes);
}

function descreverErro(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    const partes = [e.message, e.code, e.details, e.hint].filter((p) => typeof p === "string");
    if (partes.length > 0) return partes.join(" | ");
    try {
      return JSON.stringify(e);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

function primeiraLinha(data: unknown): Record<string, unknown> | null {
  const linha = Array.isArray(data) ? data[0] : data;
  return typeof linha === "object" && linha !== null ? (linha as Record<string, unknown>) : null;
}

// Variável presente mas vazia (ou só espaço) conta como ausente: `fetch("")`
// não é uma entrega. O valor volta como está: o segredo assina sem aparar,
// porque o Express e o pipeline conferem com o valor cru.
function primeiraDefinida(deps: DepsEntrega, ...nomes: string[]): string | null {
  for (const nome of nomes) {
    const valor = deps.env(nome);
    if (valor && valor.trim()) return valor;
  }
  return null;
}

export async function hmacSha256Hex(segredo: string, mensagem: string): Promise<string> {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    enc.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, enc.encode(mensagem));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function statusDoFormulario(resultado: ResultadoEntrega): number {
  return resultado === "falhou" ? 503 : 200;
}

export function statusDoWebhook(resultado: ResultadoEntrega): number {
  return resultado === "falhou" ? 500 : 200;
}

export async function entregar(
  deps: DepsEntrega,
  caseId: string,
  origem: Origem,
): Promise<ResultadoEntrega> {
  const log = deps.log ?? logPadrao;
  const base = { case_id: caseId, origem };

  let reserva: RespostaRpc;
  try {
    reserva = await deps.rpc("reservar_entrega", { p_case_id: caseId });
  } catch (err) {
    log("error", "reserva_falhou", { ...base, erro: descreverErro(err) });
    return "falhou";
  }
  if (reserva.error) {
    // Sem chave não há o que devolver: o caso continua `pending`.
    log("error", "reserva_falhou", { ...base, erro: descreverErro(reserva.error) });
    return "falhou";
  }

  const linha = primeiraLinha(reserva.data);
  const dispatchKey = typeof linha?.dispatch_key === "string" ? linha.dispatch_key : null;
  if (!linha || !dispatchKey) {
    // Não é erro: ainda não pago, ainda sem formulário, ou já em curso/encerrado.
    log("info", "nada_a_fazer", base);
    return "nada_a_fazer";
  }
  const contexto = { ...base, dispatch_key: dispatchKey };

  const devolver = async () => {
    try {
      const r = await deps.rpc("devolver_entrega", { p_dispatch_key: dispatchKey });
      if (r.error) {
        // O caso fica em `generating`, sem nova tentativa: precisa de gente.
        log("error", "devolucao_falhou", { ...contexto, erro: descreverErro(r.error) });
      } else {
        log("info", "devolvido", { ...contexto, devolvido: primeiraLinha(r.data)?.devolvido === true });
      }
    } catch (err) {
      log("error", "devolucao_falhou", { ...contexto, erro: descreverErro(err) });
    }
  };

  // Daqui em diante o caso está reservado (`generating`): qualquer exceção
  // inesperada também devolve, senão o caso ficaria preso sem nova tentativa.
  try {
    return await postarAoPipeline(deps, log, caseId, linha, dispatchKey, contexto, devolver);
  } catch (err) {
    log("error", "falha_inesperada", { ...contexto, erro: descreverErro(err) });
    await devolver();
    return "falhou";
  }
}

async function postarAoPipeline(
  deps: DepsEntrega,
  log: NonNullable<DepsEntrega["log"]>,
  caseId: string,
  linha: Record<string, unknown>,
  dispatchKey: string,
  contexto: Record<string, unknown>,
  devolver: () => Promise<void>,
): Promise<ResultadoEntrega> {
  const url = primeiraDefinida(deps, "DISPATCH_PIPELINE_URL", "N8N_WEBHOOK_URL");
  if (!url) {
    log("error", "pipeline_url_ausente", contexto);
    await devolver();
    return "falhou";
  }
  const segredo = primeiraDefinida(deps, "DISPATCH_PIPELINE_HMAC_SECRET", "N8N_HMAC_SECRET");

  // JSON.stringify já é compacto: é exatamente o texto que o pipeline confere.
  const corpo = JSON.stringify({ case_id: caseId, email: linha.email, dispatch_key: dispatchKey });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": dispatchKey,
  };
  if (segredo) headers["X-Signature"] = await hmacSha256Hex(segredo, corpo);

  let res: Response;
  try {
    res = await deps.fetch(url, {
      method: "POST",
      headers,
      body: corpo,
      signal: AbortSignal.timeout(ENTREGA_TIMEOUT_MS),
    });
  } catch (err) {
    log("error", "pipeline_inalcancavel", { ...contexto, erro: descreverErro(err) });
    await devolver();
    return "falhou";
  }

  if (res.status === 202) {
    log("info", "entregue", { ...contexto, status: 202 });
    return "entregue";
  }

  if (res.ok) {
    // Caminho legado: pipeline síncrono, quem confirma é a Edge.
    try {
      const conf = await deps.rpc("confirm_dispatch", { dispatch_key: dispatchKey, success: true });
      if (conf.error) log("error", "confirm_dispatch_falhou", { ...contexto, erro: descreverErro(conf.error) });
    } catch (err) {
      log("error", "confirm_dispatch_falhou", { ...contexto, erro: descreverErro(err) });
    }
    log("info", "entregue", { ...contexto, status: res.status });
    return "entregue";
  }

  const texto = await res.text().catch(() => "");
  log("error", "pipeline_recusou", { ...contexto, status: res.status, corpo: texto.slice(0, 500) });
  await devolver();
  return "falhou";
}
