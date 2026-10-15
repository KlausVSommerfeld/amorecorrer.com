/**
 * `cliente_conduzia` — "Era você quem dirigia o veículo?" (spec
 * docs/superpowers/specs/2026-10-05-relato-e-condutor-design.md, §3.3).
 *
 * Só booleano de verdade passa. Qualquer outra coisa vira null, e o envio nunca
 * é recusado por causa deste campo: o formulário já exige a resposta, e no
 * pipeline null tem o mesmo efeito de "não" (a peça não atribui a direção).
 */
export function clienteConduzia(valor: unknown): boolean | null {
  return typeof valor === "boolean" ? valor : null;
}

/**
 * `data_limite_protocolo` — a data-limite impressa na notificação (spec
 * docs/superpowers/specs/2026-10-07-questionario-de-triagem-design.md, §6.4).
 * Só 'AAAA-MM-DD' que seja data de calendário válida passa; o resto vira null,
 * e o envio nunca é recusado por causa deste campo.
 *
 * Também vira null a data fora da faixa (15/10/2026): antes do dia da infração
 * (quando `dataInfracao` traz um dia legível) ou mais de um ano depois de hoje.
 * Prazo real é de 30 a 60 dias da notificação; o teto conta de hoje, não da
 * infração, porque a notificação de penalidade pode chegar mais de um ano depois.
 * O formulário aplica a mesma regra (`src/lib/questionario.ts`).
 */
export function dataLimiteProtocolo(valor: unknown, dataInfracao: unknown, agora: Date = new Date()): string | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  const teto = new Date(Date.UTC(agora.getUTCFullYear() + 1, agora.getUTCMonth(), agora.getUTCDate()));
  if (d > teto) return null;
  const diaDaInfracao = typeof dataInfracao === "string" ? /^\d{4}-\d{2}-\d{2}/.exec(dataInfracao)?.[0] : undefined;
  if (diaDaInfracao && valor < diaDaInfracao) return null;
  return valor;
}
