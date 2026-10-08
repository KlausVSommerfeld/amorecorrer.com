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
 */
export function dataLimiteProtocolo(valor: unknown): string | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
    ? valor
    : null;
}
