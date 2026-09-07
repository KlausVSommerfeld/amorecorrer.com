-- Verificação do medidor de velocidade (INMETRO/RBMLQ) — escopo: RJ
-- Fase 1 de PLANO-verificacao-radar-inmetro.md
--
-- Quatro tabelas de dados públicos (CC0) alimentadas por um snapshot diário do
-- arquivo de dados abertos do RJ, mais um log de consultas por caso.
-- A identidade do pedido neste sistema é o case_id — nunca um uuid de submissão.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- unaccent() é STABLE, não IMMUTABLE, porque depende do dicionário de busca.
-- Colunas geradas exigem IMMUTABLE. Este wrapper fixa o dicionário e assume a
-- imutabilidade — se o dicionário `unaccent` mudar, local_via_norm precisa ser
-- recalculada. Na prática ele não muda.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.radar_unaccent_imutavel(entrada text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, entrada)
$$;

COMMENT ON FUNCTION public.radar_unaccent_imutavel(text) IS
  'Wrapper IMMUTABLE de unaccent, para uso em coluna gerada. Ver Fase 1 do plano.';

-- ---------------------------------------------------------------------------
-- radar_snapshots — a prova. Um por captura do arquivo do RJ.
-- ---------------------------------------------------------------------------
CREATE TABLE public.radar_snapshots (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  uf char(2) NOT NULL DEFAULT 'RJ',
  fetched_at timestamp with time zone NOT NULL DEFAULT NOW(),
  source_url text NOT NULL,
  last_modified text,
  sha256 text NOT NULL,
  storage_path text,
  bytes integer,
  record_count integer,
  -- Poda: o arquivo sai do Storage, a linha fica. Ver política de retenção.
  pruned_at timestamp with time zone,

  CONSTRAINT radar_snapshots_uf_sha_key UNIQUE (uf, sha256)
);

COMMENT ON TABLE public.radar_snapshots IS
  'Capturas do arquivo de dados abertos do INMETRO. UNIQUE(uf, sha256) é o que torna a ingestão idempotente.';
COMMENT ON COLUMN public.radar_snapshots.pruned_at IS
  'Preenchido quando o arquivo foi apagado do Storage pela retenção. A linha nunca é apagada.';

CREATE INDEX radar_snapshots_uf_fetched_idx ON public.radar_snapshots (uf, fetched_at DESC);

-- ---------------------------------------------------------------------------
-- radar_instruments — um por equipamento. O id é derivado (ver §5.3 do plano).
-- ---------------------------------------------------------------------------
CREATE TABLE public.radar_instruments (
  id text NOT NULL PRIMARY KEY,
  uf char(2) NOT NULL DEFAULT 'RJ',
  municipio text,
  local_via text,
  local_via_norm text GENERATED ALWAYS AS (
    upper(public.radar_unaccent_imutavel(local_via))
  ) STORED,
  tipo_medidor text,
  proprietario text,
  -- O par do topo do registro: é uma verificação, e não está no Historico em
  -- 297 dos 311 instrumentos sem histórico. Ver §1.4.11 do plano.
  data_ultima_verificacao date,
  data_validade date,
  ultimo_resultado text,
  snapshot_id uuid REFERENCES public.radar_snapshots(id),
  updated_at timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX radar_instruments_municipio_idx ON public.radar_instruments (municipio);
CREATE INDEX radar_instruments_local_norm_trgm_idx
  ON public.radar_instruments USING gin (local_via_norm extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- radar_faixas — as faixas do equipamento. numero_serie é quase uma PK natural
-- no RJ (2 colisões em 1.976), e é por ele que a consulta casa o caso.
-- ---------------------------------------------------------------------------
CREATE TABLE public.radar_faixas (
  instrument_id text NOT NULL REFERENCES public.radar_instruments(id) ON DELETE CASCADE,
  numero_faixa text NOT NULL DEFAULT '',
  numero_inmetro text,
  numero_serie text,
  -- Sentido é texto livre e pode vir vazio; entra no PK, então não pode ser NULL.
  sentido text NOT NULL DEFAULT '',
  velocidade_nominal integer,

  CONSTRAINT radar_faixas_pkey PRIMARY KEY (instrument_id, numero_faixa, sentido)
);

COMMENT ON COLUMN public.radar_faixas.velocidade_nominal IS
  'NULL quando a origem traz "0" — 32 faixas no RJ. Nunca interpretar como limite de 0 km/h.';

CREATE INDEX radar_faixas_numero_serie_idx ON public.radar_faixas (numero_serie);
CREATE INDEX radar_faixas_numero_inmetro_idx ON public.radar_faixas (numero_inmetro);

-- ---------------------------------------------------------------------------
-- radar_verificacoes — o histórico metrológico. Duas origens:
--   'historico' — uma entrada do array Historico, com número de certificado;
--   'topo'      — o par DataUltimaVerificacao/DataValidade, SEM número.
-- Ignorar a origem 'topo' classificaria errado 297 instrumentos. Ver §1.4.11.
-- ---------------------------------------------------------------------------
CREATE TABLE public.radar_verificacoes (
  instrument_id text NOT NULL REFERENCES public.radar_instruments(id) ON DELETE CASCADE,
  origem text NOT NULL,
  -- Vazio quando origem = 'topo': a fonte não fornece o número nesse caso.
  numero_certificado text NOT NULL DEFAULT '',
  numero_ensaio text,
  ano integer,
  data_laudo date NOT NULL,
  data_validade date NOT NULL,
  tipo_servico text,
  resultado text,

  CONSTRAINT radar_verificacoes_pkey
    PRIMARY KEY (instrument_id, origem, numero_certificado, data_laudo),
  CONSTRAINT radar_verificacoes_origem_check
    CHECK (origem = ANY(ARRAY['historico', 'topo']))
);

CREATE INDEX radar_verificacoes_vigencia_idx
  ON public.radar_verificacoes (data_laudo, data_validade);

-- ---------------------------------------------------------------------------
-- radar_consultas_log — auditoria por caso. Contém dados de caso: sem acesso
-- para anon. Amarrado por case_id, a identidade que atravessa os 4 runtimes.
-- ---------------------------------------------------------------------------
CREATE TABLE public.radar_consultas_log (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text NOT NULL REFERENCES public.form_submissions(case_id) ON DELETE CASCADE,
  consultado_em timestamp with time zone NOT NULL DEFAULT NOW(),
  entrada jsonb,
  resultado jsonb,
  status text,
  confianca text,
  metodo_match text,
  revisado_por text,
  revisado_em timestamp with time zone,

  CONSTRAINT radar_consultas_log_case_id_key UNIQUE (case_id)
);

-- A retenção precisa achar, rápido, quais snapshots são prova de uma peça já
-- entregue — esses nunca são podados.
CREATE INDEX radar_consultas_log_snapshot_idx
  ON public.radar_consultas_log ((resultado -> 'evidencia' ->> 'snapshot_id'));

-- ---------------------------------------------------------------------------
-- RLS
-- As quatro tabelas de dados são públicas por natureza (CC0), mas somente
-- leitura para anon/authenticated. O log de consultas não é público.
-- ---------------------------------------------------------------------------
ALTER TABLE public.radar_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_instruments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_faixas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_verificacoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_consultas_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Radar snapshots são legíveis publicamente"
  ON public.radar_snapshots FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY "Service role gerencia radar_snapshots"
  ON public.radar_snapshots FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Radar instruments são legíveis publicamente"
  ON public.radar_instruments FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY "Service role gerencia radar_instruments"
  ON public.radar_instruments FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Radar faixas são legíveis publicamente"
  ON public.radar_faixas FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY "Service role gerencia radar_faixas"
  ON public.radar_faixas FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Radar verificações são legíveis publicamente"
  ON public.radar_verificacoes FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY "Service role gerencia radar_verificacoes"
  ON public.radar_verificacoes FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- radar_consultas_log: nenhuma policy para anon. RLS ligada sem policy = sem acesso.
CREATE POLICY "Service role gerencia radar_consultas_log"
  ON public.radar_consultas_log FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ---------------------------------------------------------------------------
-- Storage: bucket privado de evidências, criado AQUI e não pelo Dashboard.
-- O generated-recursos é criado à mão e por isso toda stack recriada do zero
-- quebra no primeiro upload (pendência 14 do PROGRESSO.md). Não repetir.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidencias', 'evidencias', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service role gerencia o bucket evidencias"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'evidencias')
  WITH CHECK (bucket_id = 'evidencias');
