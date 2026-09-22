// Retry com backoff, para uma fonte que se comporta mal.
//
// Medido em 22/09/2026 contra servicos.rbmlq.gov.br: o mesmo arquivo de 3,66 MB
// levou 1,5 s, 11,8 s, 27,7 s, 40,9 s e 46,9 s em execuções seguidas, e uma
// delas morreu no meio do corpo — o undici reporta isso como
// `TypeError: terminated`. O servidor é IIS 7.5 e já tem histórico: recusa o IP
// de saída da Supabase e derrubou o handshake TLS do runtime do Deno.
//
// O tempo é injetável para que os testes não dependam de relógio nem de rede.

export interface OpcoesRetry {
  /** Total de tentativas, incluindo a primeira. `1` desliga o retry. */
  tentativas: number
  /** Quanto esperar ANTES da tentativa n+1, em ms. Recebe o número da que falhou. */
  esperaMs: (tentativa: number) => number
  dormir?: (ms: number) => Promise<void>
  aoFalhar?: (tentativa: number, erro: unknown) => void
}

const dormirDeVerdade = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Roda `tarefa` até ter sucesso ou esgotar `tentativas`, esperando entre elas.
 * Esgotado, propaga o ÚLTIMO erro — não um erro sintético, para não apagar a
 * causa real do que aconteceu.
 */
export async function comRetry<T>(tarefa: () => Promise<T>, opts: OpcoesRetry): Promise<T> {
  const dormir = opts.dormir ?? dormirDeVerdade
  let ultimoErro: unknown

  for (let n = 1; n <= opts.tentativas; n++) {
    try {
      return await tarefa()
    } catch (erro) {
      ultimoErro = erro
      opts.aoFalhar?.(n, erro)
      if (n < opts.tentativas) {
        await dormir(opts.esperaMs(n))
      }
    }
  }
  throw ultimoErro
}
