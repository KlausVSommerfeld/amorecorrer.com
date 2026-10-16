-- Código da Tabela de Enquadramentos (Anexo IV da Portaria SENATRAN 354/2022)
-- escolhido na lista do questionário ou do formulário: "7455-0". Spec
-- docs/superpowers/specs/2026-10-15-enquadramento-por-lista-design.md, §5.
-- Nulável e sem default: texto livre e casos antigos ficam sem código. A tabela
-- já é fechada à chave anônima (20261012000000_rls_fechada); coluna nova não muda isso.
ALTER TABLE public.form_submissions ADD COLUMN codigo_enquadramento text;

COMMENT ON COLUMN public.form_submissions.codigo_enquadramento IS
  'Código da tabela de enquadramentos da SENATRAN escolhido na lista ("7455-0"); null no texto livre.';
