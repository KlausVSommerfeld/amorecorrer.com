/*
 * A sessão está paga depois deste evento? Sem imports, para o `node --test`.
 *
 * Não basta "acabou de ser promovida a paid": num evento que o Stripe reenvia
 * (porque a entrega falhou e a webhook respondeu 500) o status já é `paid`, a
 * promoção não acontece — e é justamente aí que a nova tentativa de entrega
 * tem de rodar (spec 2026-10-09, §5.1). Caso já entregue ou encerrado não
 * corre risco: a reserva volta vazia.
 */
export function sessaoPaga(promovidoPara: string | null, statusAnterior: string | null): boolean {
  return promovidoPara === "paid" || statusAnterior === "paid";
}
