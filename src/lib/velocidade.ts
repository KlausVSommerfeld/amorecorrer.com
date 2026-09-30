/*
 * Velocidade considerada (spec 2026-09-30): é a medida menos a tolerância, e é
 * sobre ela que o auto enquadra o art. 218. Num auto real ela nunca passa da
 * aferida — se passar, é erro de digitação.
 */
export function consideradaMaiorQueAferida(aferida: string, considerada: string): boolean {
  const a = aferida.trim()
  const c = considerada.trim()
  if (!a || !c) return false
  const na = Number(a)
  const nc = Number(c)
  if (!Number.isFinite(na) || !Number.isFinite(nc)) return false
  return nc > na
}
