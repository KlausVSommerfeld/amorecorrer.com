ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS notificacao_penalidade text,
  ADD COLUMN IF NOT EXISTS especie_documento text,
  ADD COLUMN IF NOT EXISTS marca_modelo_especie text,
  ADD COLUMN IF NOT EXISTS expedida_em text,
  ADD COLUMN IF NOT EXISTS descricao_infracao text,
  ADD COLUMN IF NOT EXISTS amparo_legal text,
  ADD COLUMN IF NOT EXISTS justificativa text,
  ADD COLUMN IF NOT EXISTS renainf text;
