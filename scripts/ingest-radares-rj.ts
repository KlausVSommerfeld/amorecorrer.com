// Carga manual dos radares do RJ. Ver:
//   docs/superpowers/specs/2026-09-22-carga-manual-radares-rj-design.md
//
// Roda da máquina do Klaus porque o servidor do RBMLQ recusa o IP de saída da
// Supabase (§5.1.2 do plano do radar / pendência 21 do PROGRESSO.md).
//
//   npm run radar:ingest -- --dry-run    # não escreve nada, dispensa credencial
//   npm run radar:ingest                 # carga real, pede confirmação
//   npm run radar:ingest -- --yes        # carga real, sem prompt
//   npm run radar:ingest -- --force      # reprocessa mesmo que o sha256 já exista
//   npm run radar:ingest:prod            # carga real contra produção (só .env)

import { createInterface } from 'node:readline/promises'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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
// Reprocessar bytes idênticos é legítimo quando o BUG estava em nós, não na
// fonte — foi o que aconteceu com `proprietario` em 22/09/2026.
const FORCAR = args.has('--force')

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

function clienteSupabase(): { db: SupabaseClient; ref: string; url: string } {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY. ' +
        'Rode com --dry-run para conferir a fonte sem credencial.',
    )
  }
  const ref = new URL(url).hostname.split('.')[0]
  return { db: createClient(url, key, { auth: { persistSession: false } }), ref, url }
}

/**
 * Confirma o destino em voz alta. É a guarda contra o erro mais caro disponível
 * aqui — gravar no projeto errado —, e custa uma linha.
 */
async function confirmarDestino(ref: string, url: string): Promise<void> {
  log(`\n  DESTINO: ${url}`)
  log(`  project ref: ${ref}`)
  if (SEM_PROMPT) {
    log('  --yes passado; seguindo sem perguntar.\n')
    return
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const resposta = await rl.question(`\n  Gravar no projeto "${ref}"? [s/N] `)
  rl.close()
  if (resposta.trim().toLowerCase() !== 's') {
    throw new Error('cancelado pelo operador')
  }
}

/**
 * Idempotência com uma correção sobre a Fase 2 do plano.
 *
 * O plano manda sair se (uf, sha256) já existe em radar_snapshots. Sozinha, essa
 * regra tem um buraco: se a carga falhar no meio, o snapshot já estará gravado e
 * toda re-execução vira no-op, deixando as tabelas incompletas para sempre — e
 * em silêncio. Por isso comparamos também o record_count com o count real.
 */
async function jaCarregado(db: SupabaseClient, sha: string, esperado: number): Promise<boolean> {
  if (FORCAR) {
    log('\n  --force: pulando a checagem de idempotência.')
    return false
  }

  const { data, error } = await db
    .from('radar_snapshots')
    .select('id, record_count')
    .eq('uf', UF_ALVO)
    .eq('sha256', sha)
    .maybeSingle()
  if (error) throw new Error(`consulta a radar_snapshots falhou: ${error.message}`)
  if (!data) return false

  const { count, error: erroCount } = await db
    .from('radar_instruments')
    .select('id', { count: 'exact', head: true })
  if (erroCount) throw new Error(`contagem de radar_instruments falhou: ${erroCount.message}`)

  if (count === esperado) {
    log(`\n  snapshot ${data.id} já carregado, com ${count} instrumentos. Nada a fazer.`)
    return true
  }
  log(
    `\n  snapshot já existe (${data.id}), mas radar_instruments tem ${count} linhas ` +
      `contra ${esperado} esperadas — carga anterior incompleta. Reprocessando.`,
  )
  return false
}

/**
 * Um upsert em lote com duas linhas de mesma PK falha com "ON CONFLICT DO UPDATE
 * command cannot affect row a second time" — erro duro, que aborta o lote.
 * Medido em 22/09: zero colisões no arquivo real. Isto é seguro contra mudança
 * da fonte, não remendo para defeito conhecido.
 */
function dedupePorChave<T>(linhas: T[], chave: (l: T) => string, rotulo: string): T[] {
  const vistas = new Map<string, T>()
  for (const l of linhas) vistas.set(chave(l), l)
  const removidas = linhas.length - vistas.size
  if (removidas > 0) log(`  ⚠ ${removidas} linha(s) duplicada(s) de ${rotulo} removida(s) do lote`)
  return [...vistas.values()]
}

async function enviarEmLotes<T>(
  db: SupabaseClient,
  tabela: string,
  linhas: T[],
  onConflict: string,
  ignoreDuplicates: boolean,
): Promise<void> {
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE)
    const { error } = await db.from(tabela).upsert(lote as never, { onConflict, ignoreDuplicates })
    if (error) {
      throw new Error(`upsert em ${tabela} (lote ${i / LOTE + 1}) falhou: ${error.message}`)
    }
    log(`  ${tabela}: ${Math.min(i + LOTE, linhas.length)}/${linhas.length}`)
  }
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

  const { db, ref, url } = clienteSupabase()
  await confirmarDestino(ref, url)

  if (await jaCarregado(db, sha, n.instruments.length)) {
    log(`\nNada a fazer. ${Date.now() - t0} ms\n`)
    return
  }

  // A ordem daqui para baixo é imposta pelas FKs:
  // snapshot -> instruments -> faixas / verificações.
  const dia = new Date().toISOString().slice(0, 10)
  const caminho = `radares/${UF_ALVO}/${dia}-${sha.slice(0, 12)}.json`

  log(`\n→ upload de ${caminho} para o bucket ${BUCKET}`)
  const { error: erroUpload } = await db.storage
    .from(BUCKET)
    .upload(caminho, bytes, { contentType: 'application/json', upsert: true })
  if (erroUpload) throw new Error(`upload para o Storage falhou: ${erroUpload.message}`)

  log('→ upsert em radar_snapshots')
  // upsert, e não insert: num reprocessamento (--force) os bytes são os mesmos,
  // e UNIQUE(uf, sha256) recusaria um insert.
  const { data: snap, error: erroSnap } = await db
    .from('radar_snapshots')
    .upsert({
      uf: UF_ALVO,
      source_url: FONTE,
      last_modified: lastModified,
      sha256: sha,
      storage_path: caminho,
      bytes: bytes.byteLength,
      record_count: n.instruments.length,
    }, { onConflict: 'uf,sha256' })
    .select('id')
    .single()
  if (erroSnap || !snap) throw new Error(`insert em radar_snapshots falhou: ${erroSnap?.message}`)

  const snapshotId = snap.id as string
  log(`  snapshot_id: ${snapshotId}`)

  // As linhas foram normalizadas com o id fictício; agora recebem o verdadeiro.
  for (const i of n.instruments) i.snapshot_id = snapshotId

  log('→ upserts')
  await enviarEmLotes(
    db,
    'radar_instruments',
    dedupePorChave(n.instruments, (i) => i.id, 'radar_instruments'),
    'id',
    false,
  )
  await enviarEmLotes(
    db,
    'radar_faixas',
    dedupePorChave(n.faixas, (f) => `${f.instrument_id}|${f.numero_faixa}|${f.sentido}`, 'radar_faixas'),
    'instrument_id,numero_faixa,sentido',
    false,
  )
  await enviarEmLotes(
    db,
    'radar_verificacoes',
    dedupePorChave(
      n.verificacoes,
      (v) => `${v.instrument_id}|${v.origem}|${v.numero_certificado}|${v.data_laudo}`,
      'radar_verificacoes',
    ),
    'instrument_id,origem,numero_certificado,data_laudo',
    true, // histórico metrológico é imutável: duplicata é no-op, não atualização
  )

  log(`\n✓ Carga concluída em ${Date.now() - t0} ms.\n`)
}

main().catch((erro) => {
  console.error('\n✗ FALHOU:', erro instanceof Error ? erro.message : erro)
  process.exitCode = 1
})
