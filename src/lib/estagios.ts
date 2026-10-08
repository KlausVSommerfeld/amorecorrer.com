/** As duas peças que o produto redige. O `valor` vai para `especie_documento` e
 *  tem de bater byte a byte com DEFESA_PREVIA e RECURSO_JARI de pipeline/peca.py
 *  (`estagios.test.ts` confere): é por ele que a peça escolhe o destinatário. */
export const DEFESA_PREVIA = 'Notificação de autuação — defesa prévia'
export const RECURSO_JARI = 'Notificação de penalidade — recurso à JARI'

export const ESTAGIOS = [
  {
    valor: DEFESA_PREVIA,
    nome: 'Defesa da autuação',
    descricao:
      'O papel diz "notificação de autuação". A multa ainda não foi aplicada e a peça vai para o próprio órgão autuador.'
  },
  {
    valor: RECURSO_JARI,
    nome: 'Recurso à JARI',
    descricao:
      'O papel diz "notificação de penalidade" e traz o valor a pagar. A peça vai para a Junta Administrativa de Recursos de Infrações.'
  }
] as const
