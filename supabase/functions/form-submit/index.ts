// form-submit: grava o formulário e entrega o caso ao pipeline pelo módulo
// compartilhado (supabase/functions/_shared/entrega.ts, spec 2026-10-09).
// Uses Deno.serve and @supabase/supabase-js@2.x
// Import from bare specifier, assuming deno.json imports: "@supabase/supabase-js": "jsr:@supabase/supabase-js@2"
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  AVISO_INDISPONIVEL,
  AVISO_SEM_DADOS,
  VERIFICACAO_TIMEOUT_MS,
  entradaDaVerificacao,
  linhaDoLog,
  naoAplicavel,
  type Verificacao,
} from "./verificacao.ts";
import { clienteConduzia, dataLimiteProtocolo } from "./campos.ts";
import { entregar, statusDoFormulario, type DepsEntrega } from "../_shared/entrega.ts";

const MAX_BODY_BYTES = 64 * 1024; // 64KB
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // requests per IP per window
const rateLimits = new Map();

// CORS headers - permitir todos os domínios
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-Client-Info',
};

function json(data: unknown, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...headers
    }
  });
}

function bad(msg: string, status = 400, headers = {}) {
  return json({
    ok: false,
    error: msg
  }, status, {
    ...corsHeaders,
    ...headers
  });
}

function getAllowedOrigins() {
  const env = Deno.env.get("ORIGIN_WHITELIST") ?? "";
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

function originAllowed(origin: string | null) {
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return false;
  return origin !== null && allowed.includes(origin);
}

function buildCorsHeaders(origin: string | null) {
  const allowed = getAllowedOrigins();
  const allowOrigin = origin && allowed.includes(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, X-Client-Info"
  };
}

function normalizePayload(p: Record<string, unknown>) {
  const norm = { ...p };
  if (typeof norm.email === "string") norm.email = norm.email.trim().toLowerCase();
  
  const digitsOnly = (v: unknown) => (v || "").toString().replace(/\D/g, "") || null;
  if ("telefone" in norm) norm.telefone = digitsOnly(norm.telefone);
  if ("cpf" in norm) norm.cpf = digitsOnly(norm.cpf);
  if ("cep" in norm) norm.cep = digitsOnly(norm.cep);
  if ("placa" in norm && typeof norm.placa === "string")
    norm.placa = norm.placa.toUpperCase().replace(/\s+/g, "") || null;

  // Medidor de velocidade: as mesmas regras de `src/lib/medidor.ts`, conferidas
  // contra a base do INMETRO no RJ. No nº de série, hífen, barra e zero à
  // esquerda são parte do número (`FSC-S3924` e `FSCS3924` são aparelhos
  // distintos); INMETRO e certificado são só dígitos.
  if ("medidor_numero_serie" in norm)
    norm.medidor_numero_serie = (norm.medidor_numero_serie || "").toString().toUpperCase().replace(/\s+/g, "") || null;
  if ("medidor_numero_inmetro" in norm) norm.medidor_numero_inmetro = digitsOnly(norm.medidor_numero_inmetro);
  if ("medidor_numero_certificado" in norm)
    norm.medidor_numero_certificado = digitsOnly(norm.medidor_numero_certificado);
  
  for (const k of Object.keys(norm)) {
    if (typeof norm[k] === "string") norm[k] = norm[k].trim();
  }
  // `stripe_session_id`, se vier, é ignorado: a sessão é a do caso (spec 2026-10-09).
  return norm;
}

function enforceRateLimit(ip: string | null) {
  if (!ip) return;
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(ip, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) throw new Error("Too many requests");
  rateLimits.set(ip, entry);
}

async function sha256Hex(input: string) {
  const enc = new TextEncoder();
  const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatDispatchError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    const message = typeof e.message === "string" ? e.message : null;
    const code = typeof e.code === "string" ? e.code : null;
    const details = typeof e.details === "string" ? e.details : null;
    const hint = typeof e.hint === "string" ? e.hint : null;

    const parts = [message, code, details, hint].filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");

    try {
      return JSON.stringify(e);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

Deno.serve(async (req) => {
  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  const origin = req.headers.get("origin");
  const corsHeadersForOrigin = buildCorsHeaders(origin);

  if (
    req.method !== "POST" ||
    (req.headers.get("content-type") || "").indexOf("application/json") !== 0
  ) {
    return bad("Method/Content-Type not allowed", 405, corsHeadersForOrigin);
  }

  if (!originAllowed(origin)) {
    return bad("Origin not allowed", 403, corsHeadersForOrigin);
  }

  // Optional: Validate bearer token for additional security
  // Uncomment to enforce authentication
  /*
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return bad("Missing or invalid Authorization header", 401, corsHeadersForOrigin);
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  // Validate token using Supabase
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return bad("Server not configured", 500, corsHeadersForOrigin);
  }
  
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  
  if (authError || !user) {
    return bad("Invalid authentication token", 401, corsHeadersForOrigin);
  }
  */

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
  try {
    enforceRateLimit(ip);
  } catch {
    return bad("Rate limit exceeded", 429, corsHeadersForOrigin);
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return bad("Payload too large", 413, corsHeadersForOrigin);
  }

  let raw;
  try {
    raw = await req.json();
  } catch (_e) {
    return bad("Invalid JSON", 400, corsHeadersForOrigin);
  }

  const required = ["case_id", "form_token", "nome", "email"];
  for (const k of required) {
    if (!raw[k]) return bad(`Missing field: ${k}`, 400, corsHeadersForOrigin);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return bad("Server not configured", 500, corsHeadersForOrigin);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  });

  const norm = normalizePayload(raw);
  const depsEntrega: DepsEntrega = {
    rpc: (fn, args) => supabase.rpc(fn, args),
    fetch: (url, init) => fetch(url, init),
    env: (nome) => Deno.env.get(nome),
  };
  const MENSAGEM_ENTREGA_FALHOU =
    "Recebemos seus dados, mas não conseguimos começar a gerar a sua peça agora. Tente de novo em um minuto.";

  try {
    const { data: existingCase, error: caseErr } = await supabase
      .from("form_submissions")
      .select("case_id,document_status,dup_guard,stripe_session_id,email")
      .eq("case_id", norm.case_id)
      .maybeSingle();

    if (caseErr) {
      console.error("DB lookup error:", caseErr);
      return bad("DB error", 500, corsHeadersForOrigin);
    }

    // A sessão de pagamento é a do próprio caso, lida pelo servidor. O
    // `stripe_session_id` que o navegador manda é ignorado desde 09/10/2026: o
    // CASO_6b03e11a… chegou com a sessão de outro caso (spec 2026-10-09).
    let sessaoDoCaso: string | null = null;

    if (!existingCase) {
      // Atualiza stripe_sessions: status = 'complete', payment_at = agora
      const { data: sessionRow, error: sessionErr } = await supabase
        .from("stripe_sessions")
        .update({ status: "complete" })
        .eq("case_id", norm.case_id)
        .select("id,case_id")
        .limit(1)
        .maybeSingle();

      if (sessionErr) {
        console.error("Stripe session update error:", sessionErr);
        return bad("DB error", 500, corsHeadersForOrigin);
      }
      if (!sessionRow) {
        return bad("case_id inválido", 404, corsHeadersForOrigin);
      }
      sessaoDoCaso = typeof sessionRow.id === "string" ? sessionRow.id : null;
    }

    if (existingCase && ["completed", "failed"].includes(existingCase.document_status)) {
      return bad("Caso já finalizado", 409, corsHeadersForOrigin);
    }

    // Calculate dup_guard to detect duplicate submissions
    //
    // O hash cobre só a identidade de quem envia, não o conteúdo da autuação:
    // data, local, velocidades e justificativa ficam de fora — e os três campos
    // do medidor também, pela mesma regra (decidido na Fase 4 do plano do radar).
    const dupSource = {
      case_id: norm.case_id,
      form_token: norm.form_token,
      nome: norm.nome,
      email: norm.email,
      telefone: norm.telefone ?? null,
      cpf: norm.cpf ?? null,
      renainf: norm.renainf ?? null,
      cnh: norm.cnh ?? null,
      placa: norm.placa ?? null
    };
    const dup_guard = await sha256Hex(JSON.stringify(dupSource));

    // Reenvio idêntico: os dados não mudam, mas a entrega é tentada de novo —
    // é assim que o cliente que recebeu o 503 dispara a nova tentativa. Num
    // caso em `generating` ou encerrado a reserva volta vazia e nada acontece.
    // (A duplicata por `stripe_session_id` saiu: dependia do valor do navegador.)
    if (existingCase && existingCase.dup_guard === dup_guard) {
      const resultado = await entregar(depsEntrega, String(norm.case_id), "formulario");
      if (resultado === "falhou") {
        return bad(MENSAGEM_ENTREGA_FALHOU, statusDoFormulario(resultado), corsHeadersForOrigin);
      }
      return json(
        {
          ok: true,
          message: "Duplicate submission (no-op)",
          dup_guard
        },
        200,
        corsHeadersForOrigin
      );
    }

    const updateFields = {
      case_id: norm.case_id,
      form_token: norm.form_token,
      nome: norm.nome,
      email: norm.email,
      telefone: norm.telefone ?? null,
      cpf: norm.cpf ?? null,
      endereco: norm.endereco ?? null,
      cidade: norm.cidade ?? null,
      estado: norm.estado ?? null,
      cep: norm.cep ?? null,
      placa: norm.placa ?? null,
      renainf: norm.renainf ?? null,
      cnh: norm.cnh ?? null,
      data_infracao: norm.data_infracao ?? null,
      numero_auto: norm.numero_auto ?? null,
      notificacao_penalidade: norm.notificacao_penalidade ?? null,
      local_infracao: norm.local_infracao ?? null,
      especie_documento: norm.especie_documento ?? null,
      marca_modelo_especie: norm.marca_modelo_especie ?? null,
      expedida_em: norm.expedida_em ?? null,
      descricao_infracao: norm.descricao_infracao ?? null,
      velocidade_permitida: norm.velocidade_permitida ?? null,
      velocidade_aferida: norm.velocidade_aferida ?? null,
      velocidade_considerada: norm.velocidade_considerada ?? null,
      medidor_numero_serie: norm.medidor_numero_serie ?? null,
      medidor_numero_inmetro: norm.medidor_numero_inmetro ?? null,
      medidor_numero_certificado: norm.medidor_numero_certificado ?? null,
      orgao_autuador: norm.orgao_autuador ?? null,
      artigo_ctb: norm.artigo_ctb ?? null,
      amparo_legal: norm.amparo_legal ?? null,
      justificativa: norm.justificativa ?? null,
      // Fora do dup_guard (o hash cobre só a identidade de quem envia): um
      // reenvio que mude só esta resposta é duplicata, como a justificativa.
      cliente_conduzia: clienteConduzia(norm.cliente_conduzia),
      // Também fora do dup_guard, pela mesma regra.
      data_limite_protocolo: dataLimiteProtocolo(norm.data_limite_protocolo),
      dup_guard,
      updated_at: new Date().toISOString()
    };

    // INSERT e UPDATE separados de propósito — aqui havia um `.upsert()`.
    //
    // `document_status` é NOT NULL e SEM DEFAULT desde 09/09/2026: quem cria a
    // linha declara o estado, em vez de herdá-lo de uma regra invisível no
    // schema. Isso exige as duas coisas ao mesmo tempo: a INSERÇÃO precisa
    // informar a coluna, e o UPDATE precisa NÃO tocá-la — reescrever 'pending'
    // por cima de um caso já em 'generating' (a guarda de 409 acima só barra
    // 'completed' e 'failed') reabriria a reserva
    // (reservar_entrega) e o worker mandaria um SEGUNDO e-mail ao cliente.
    //
    // Um `.upsert()` não consegue as duas: o ramo de INSERT é sempre montado,
    // então omitir a coluna resulta em 23502 (not-null violation) mesmo quando
    // a linha já existe e o que vai rodar é o DO UPDATE.
    let updated: unknown = null;
    let upsertErr: { code?: string; message?: string } | null = null;

    if (existingCase) {
      const r = await supabase
        .from("form_submissions")
        .update(updateFields)
        .eq("case_id", norm.case_id)
        .select("*")
        .single();
      updated = r.data;
      upsertErr = r.error;
    } else {
      const r = await supabase
        .from("form_submissions")
        .insert({ ...updateFields, document_status: "pending", stripe_session_id: sessaoDoCaso })
        .select("*")
        .single();
      updated = r.data;
      upsertErr = r.error;

      // Corrida de duplo envio: outra requisição inseriu a linha entre o SELECT
      // e este INSERT. O `.upsert()` anterior absorvia isso em silêncio; aqui
      // refazemos como UPDATE, que é o mesmo efeito e continua sem tocar em
      // document_status.
      if (r.error?.code === "23505") {
        const retry = await supabase
          .from("form_submissions")
          .update(updateFields)
          .eq("case_id", norm.case_id)
          .select("*")
          .single();
        updated = retry.data;
        upsertErr = retry.error;
      }
    }

    if (upsertErr) {
      console.error("DB update error:", upsertErr);
      return bad("DB upsert error", 500, corsHeadersForOrigin);
    }

    // Verificação do medidor de velocidade — Fase 5 do plano do radar.
    //
    // ANTES da entrega, para o pipeline já ler o caso com ela. Nada
    // aqui pode derrubar o envio: toda falha vira `nao_aplicavel` e é só
    // logada. O UPDATE não toca document_status (ver o comentário do INSERT
    // acima: reescrevê-lo manda um segundo e-mail ao cliente).
    try {
      const entrada = entradaDaVerificacao(norm);
      let verificacao: Verificacao = naoAplicavel(AVISO_SEM_DADOS);

      if (entrada) {
        const { data, error } = await supabase
          .rpc("verificar_medidor", entrada)
          .abortSignal(AbortSignal.timeout(VERIFICACAO_TIMEOUT_MS));
        if (error || !data) {
          console.error("[radar] verificar_medidor_falhou", {
            case_id: norm.case_id,
            error: error ? formatDispatchError(error) : "resposta vazia"
          });
          verificacao = naoAplicavel(AVISO_INDISPONIVEL);
        } else {
          verificacao = data as Verificacao;
        }
      }

      const { error: colunaErr } = await supabase
        .from("form_submissions")
        .update({ verificacao_medidor: verificacao })
        .eq("case_id", norm.case_id);
      if (colunaErr) {
        console.error("[radar] gravar_verificacao_falhou", {
          case_id: norm.case_id,
          error: formatDispatchError(colunaErr)
        });
      }

      // Também para `nao_aplicavel`: a calibração precisa saber quantos casos
      // chegam sem os números do medidor.
      const { error: logErr } = await supabase
        .from("radar_consultas_log")
        .upsert(linhaDoLog(String(norm.case_id), entrada, verificacao), { onConflict: "case_id" });
      if (logErr) {
        console.error("[radar] log_consulta_falhou", {
          case_id: norm.case_id,
          error: formatDispatchError(logErr)
        });
      }
    } catch (err) {
      console.error("[radar] verificacao_excecao", {
        case_id: norm.case_id,
        error: err instanceof Error ? err.message : String(err)
      });
    }

    // Entrega ao pipeline (spec 2026-10-09): a reserva atômica no banco decide
    // quem entrega. Sem pagamento confirmado ainda, ela volta vazia e quem
    // entrega é a `stripe-webhook`, quando o pagamento chegar.
    const resultado = await entregar(depsEntrega, String(norm.case_id), "formulario");
    if (resultado === "falhou") {
      return bad(MENSAGEM_ENTREGA_FALHOU, statusDoFormulario(resultado), corsHeadersForOrigin);
    }

    return json(
      {
        ok: true,
        form: updated
      },
      200,
      corsHeadersForOrigin
    );
  } catch (_e) {
    console.error("Handler error:", _e);
    if (_e instanceof Error && _e.message === "Too many requests") {
      return bad("Rate limit exceeded", 429, corsHeadersForOrigin);
    }
    return bad("Internal server error", 500, corsHeadersForOrigin);
  }
});