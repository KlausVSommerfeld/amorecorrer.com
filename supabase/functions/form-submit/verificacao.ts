/*
 * Verificação do medidor de velocidade no envio do formulário — Fase 5 de
 * PLANO-verificacao-radar-inmetro.md (spec em
 * docs/superpowers/specs/2026-09-24-verificacao-medidor-no-fluxo-design.md).
 *
 * Só lógica pura, sem imports: roda no Deno da Edge e no `node --test` do
 * `npm run radar:test` (o Deno não está instalado no WSL). Quem fala com o
 * banco é o `index.ts`.
 */

export const AVISO_SEM_DADOS = "dados do medidor não informados — verificação não realizada";
export const AVISO_INDISPONIVEL = "verificação indisponível";

// A verificação nunca pode derrubar o envio nem segurá-lo: o cliente pagou
// pela peça, não pela verificação.
export const VERIFICACAO_TIMEOUT_MS = 3000;

export type EntradaVerificacao = {
  p_numero_serie: string | null;
  p_numero_inmetro: string | null;
  p_data_infracao: string | null;
  // Sempre null: o formulário não tem município da infração (`cidade` é o
  // endereço do cliente), e extrair de `localSentido` seria chute.
  p_municipio: null;
  p_local: null;
};

export type Verificacao = {
  status: string;
  confianca: string;
  metodo_match: string;
  avisos: string[];
  [chave: string]: unknown;
};

export type LinhaDoLog = {
  case_id: string;
  consultado_em: string;
  entrada: EntradaVerificacao | null;
  resultado: Verificacao;
  status: string | null;
  confianca: string | null;
  metodo_match: string | null;
  revisado_por: null;
  revisado_em: null;
};

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/*
 * Sem nº de série NEM nº INMETRO, não se consulta: a RPC devolveria
 * `sem_registro` com "instrumento não localizado na base pública" — falso,
 * porque não houve busca.
 */
export function entradaDaVerificacao(norm: Record<string, unknown>): EntradaVerificacao | null {
  const serie = texto(norm.medidor_numero_serie);
  const inmetro = texto(norm.medidor_numero_inmetro);
  if (!serie && !inmetro) return null;

  // `data_infracao` é o relógio de parede do papel ("2026-09-01T23:30:00"),
  // sem fuso. O dia são os 10 primeiros caracteres — converter para Date
  // deslocaria a data em 3h e mudaria o dia de quem foi multado à noite.
  const data = texto(norm.data_infracao);
  const dia = data && /^\d{4}-\d{2}-\d{2}/.test(data) ? data.slice(0, 10) : null;

  return {
    p_numero_serie: serie,
    p_numero_inmetro: inmetro,
    p_data_infracao: dia,
    p_municipio: null,
    p_local: null,
  };
}

/* O objeto de quando não houve verificação, no mesmo formato do contrato. */
export function naoAplicavel(aviso: string): Verificacao {
  return {
    status: "nao_aplicavel",
    confianca: "baixa",
    metodo_match: "nenhum",
    instrumento: null,
    certificado_vigente: null,
    certificados_proximos: [],
    evidencia: null,
    avisos: [aviso],
  };
}

/*
 * Uma linha por caso (`case_id` é UNIQUE em radar_consultas_log). A revisão
 * humana é zerada de propósito: uma consulta nova, com dados novos, invalida o
 * que foi revisado sobre os anteriores.
 */
export function linhaDoLog(
  caseId: string,
  entrada: EntradaVerificacao | null,
  resultado: Verificacao,
  agora: Date = new Date(),
): LinhaDoLog {
  return {
    case_id: caseId,
    consultado_em: agora.toISOString(),
    entrada,
    resultado,
    status: resultado.status ?? null,
    confianca: resultado.confianca ?? null,
    metodo_match: resultado.metodo_match ?? null,
    revisado_por: null,
    revisado_em: null,
  };
}
