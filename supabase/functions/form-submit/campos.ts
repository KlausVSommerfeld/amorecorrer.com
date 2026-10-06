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
