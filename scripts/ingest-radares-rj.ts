// Carga manual dos radares do RJ. Ver:
//   docs/superpowers/specs/2026-09-22-carga-manual-radares-rj-design.md
//
// Roda da máquina do Klaus porque o servidor do RBMLQ recusa o IP de saída da
// Supabase (§5.1.2 do plano do radar / pendência 21 do PROGRESSO.md).
//
//   npm run radar:ingest -- --dry-run    # não escreve nada, dispensa credencial
//   npm run radar:ingest                 # carga real, pede confirmação
//   npm run radar:ingest -- --yes        # carga real, sem prompt

import { UF_ALVO, normalize } from './lib/psie.ts'
import { comRetry } from './lib/retry.ts'
import type { FaixaRow, InstrumentRow, PsieRecord, VerificacaoRow } from './lib/psie.ts'

const FONTE = `https://servicos.rbmlq.gov.br/dados-abertos/${UF_ALVO}/medidores.json`
// O e-mail do plano (contato@amorecorrer.com) não existe — pendência 25. Este existe.
const USER_AGENT = 'amorecorrer.com/1.0 (+amorecorrer@gmail.com)'
const BUCKET = 'evidencias'
const LOTE = 500

// Sanidade: o RJ tem 1.971 registros. Queda abaixo disso é arquivo truncado na
// origem, e carregar um arquivo truncado não apagaria nada, mas registraria um
// snapshot mentiroso como prova.
const MINIMO_REGISTROS = 1500
const MINIMO_COM_FAIXAS = 0.8

// A fonte é instável: medido em 22/09, o mesmo arquivo levou de 1,5 s a 46,9 s
// em execuções seguidas, e uma delas morreu no meio do corpo. Ver lib/retry.ts.
const TENTATIVAS = 4

const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const SEM_PROMPT = args.has('--yes')

function log(...partes: unknown[]): void {
  console.log(...partes)
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function baixarFonte(): Promise<{ bytes: Uint8Array; lastModified: string | null }> {
  log(`→ GET ${FONTE}`)
  return comRetry(
    async () => {
      const t0 = Date.now()
      const resp = await fetch(FONTE, { headers: { 'User-Agent': USER_AGENT } })
      if (!resp.ok) {
        throw new Error(`fonte respondeu ${resp.status} ${resp.statusText}`)
      }
      // O corpo é lido aqui dentro de propósito: é no meio do corpo que a
      // conexão costuma morrer, e fora do retry a falha escaparia.
      const bytes = new Uint8Array(await resp.arrayBuffer())
      log(`  ${bytes.byteLength.toLocaleString('pt-BR')} bytes em ${Date.now() - t0} ms`)
      return { bytes, lastModified: resp.headers.get('last-modified') }
    },
    {
      tentativas: TENTATIVAS,
      esperaMs: (n) => n * 3000,
      aoFalhar: (n, erro) => {
        const msg = erro instanceof Error ? erro.message : String(erro)
        const resta = TENTATIVAS - n
        log(`  ⚠ tentativa ${n}/${TENTATIVAS} falhou (${msg})` + (resta > 0 ? `; esperando ${n * 3}s` : ''))
      },
    },
  )
}

/** Aborta antes de qualquer escrita se o arquivo não parecer o arquivo. */
function conferirSanidade(registros: unknown): PsieRecord[] {
  if (!Array.isArray(registros)) {
    throw new Error('corpo não parseia como array')
  }
  if (registros.length < MINIMO_REGISTROS) {
    throw new Error(
      `só ${registros.length} registros; mínimo ${MINIMO_REGISTROS}. Arquivo truncado na origem?`,
    )
  }
  const comFaixas = registros.filter(
    (r) => Array.isArray((r as PsieRecord).Faixas) && (r as PsieRecord).Faixas!.length > 0,
  ).length
  const proporcao = comFaixas / registros.length
  if (proporcao < MINIMO_COM_FAIXAS) {
    throw new Error(
      `só ${(proporcao * 100).toFixed(1)}% dos registros têm faixas; mínimo ${MINIMO_COM_FAIXAS * 100}%`,
    )
  }
  return registros as PsieRecord[]
}

async function normalizarTudo(registros: PsieRecord[], snapshotId: string) {
  const instruments: InstrumentRow[] = []
  const faixas: FaixaRow[] = []
  const verificacoes: VerificacaoRow[] = []
  let descartes = 0

  for (const r of registros) {
    const n = await normalize(r, snapshotId)
    instruments.push(n.instrument)
    faixas.push(...n.faixas)
    verificacoes.push(...n.verificacoes)
    descartes += n.descartes
  }
  return { instruments, faixas, verificacoes, descartes }
}

function relatorio(n: Awaited<ReturnType<typeof normalizarTudo>>): void {
  const hist = n.verificacoes.filter((v) => v.origem === 'historico').length
  const topo = n.verificacoes.filter((v) => v.origem === 'topo').length
  log('')
  log('  instrumentos .............. ' + n.instruments.length.toLocaleString('pt-BR'))
  log('  faixas .................... ' + n.faixas.length.toLocaleString('pt-BR'))
  log('  verificações (histórico) .. ' + hist.toLocaleString('pt-BR'))
  log('  verificações (topo) ....... ' + topo.toLocaleString('pt-BR'))
  log('  verificações (total) ...... ' + n.verificacoes.length.toLocaleString('pt-BR'))
  log('  descartes por data ........ ' + n.descartes.toLocaleString('pt-BR'))
  log('')
}

async function main(): Promise<void> {
  const t0 = Date.now()
  log(`\n=== Carga de radares ${UF_ALVO} ${DRY_RUN ? '(DRY RUN — nada será gravado)' : ''}\n`)

  const { bytes, lastModified } = await baixarFonte()
  const sha = await sha256Hex(bytes)
  log(`  sha256: ${sha}`)
  log(`  Last-Modified: ${lastModified ?? '(ausente)'}`)

  const registros = conferirSanidade(JSON.parse(new TextDecoder().decode(bytes)))
  log(`  sanidade: OK (${registros.length} registros)`)

  // No dry-run o snapshot_id é fictício: nada será gravado.
  const n = await normalizarTudo(registros, '00000000-0000-4000-8000-000000000000')
  relatorio(n)

  if (DRY_RUN) {
    log(`Dry run concluído em ${Date.now() - t0} ms. Nada foi gravado.\n`)
    return
  }

  throw new Error('carga real ainda não implementada — ver Task 5')
}

main().catch((erro) => {
  console.error('\n✗ FALHOU:', erro instanceof Error ? erro.message : erro)
  process.exitCode = 1
})
