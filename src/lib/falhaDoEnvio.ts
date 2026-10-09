/**
 * O que o usuário lê quando o envio falha. O erro cru — `Request failed: 500 …`
 * seguido do corpo da resposta — dizia o problema do servidor, nunca o do
 * usuário, e vazava detalhes de infraestrutura na tela.
 */
export function mensagemDeFalha(status: number): string {
  if (status === 409) {
    return 'Este caso já foi finalizado. Se você não recebeu o PDF, fale com a gente com o número do caso em mãos.';
  }
  if (status === 404) {
    return 'Não localizamos este pedido. Confira se você abriu o link que veio depois do pagamento.';
  }
  if (status === 413) {
    return 'O texto ficou grande demais. Encurte o campo "O que aconteceu?" e envie de novo.';
  }
  if (status === 429) {
    return 'Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.';
  }
  if (status === 400 || status === 401 || status === 403) {
    return 'O envio foi recusado. Recarregue a página pelo link do pagamento e tente de novo.';
  }
  // A form-submit gravou os dados, mas a entrega ao pipeline falhou e o caso
  // voltou a `pending`: um novo clique tenta de novo (spec 2026-10-09).
  if (status === 503) {
    return 'Recebemos seus dados, mas não conseguimos começar a gerar a sua peça agora. Tente de novo em um minuto.';
  }
  return 'Nossos servidores não responderam agora. Seus dados continuam aqui — tente de novo.';
}
