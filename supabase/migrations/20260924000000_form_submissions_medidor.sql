-- Dados do medidor de velocidade no formulário
-- Fase 4 de PLANO-verificacao-radar-inmetro.md
--
-- Três números que a notificação de radar pode trazer e que o cliente copia no
-- formulário. São a chave de entrada da RPC `verificar_medidor` (Fase 5): sem
-- número de série, a verificação cai no match fraco por município + local.
--
-- Todos opcionais: NULL é o estado normal de uma multa que não é de radar, ou
-- de uma notificação que não imprime o número. Sem DEFAULT e sem CHECK — quem
-- normaliza é a Edge `form-submit` (e antes dela `src/lib/medidor.ts`).
--
-- Deploy: esta migration sobe ANTES da Edge que grava as colunas. Na ordem
-- inversa, o INSERT de `form-submit` falha por coluna inexistente e derruba
-- todo envio de formulário.

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS medidor_numero_serie       text,
  ADD COLUMN IF NOT EXISTS medidor_numero_inmetro     text,
  ADD COLUMN IF NOT EXISTS medidor_numero_certificado text;

COMMENT ON COLUMN public.form_submissions.medidor_numero_serie IS
  'Nº de série do medidor, como na notificação: caixa alta, sem espaços. Hífen, barra e zero à esquerda são preservados — na base do RJ, FSC-S3924 e FSCS3924 são aparelhos distintos.';
COMMENT ON COLUMN public.form_submissions.medidor_numero_inmetro IS
  'Nº INMETRO do medidor, só dígitos.';
COMMENT ON COLUMN public.form_submissions.medidor_numero_certificado IS
  'Nº do certificado de verificação informado na notificação, só dígitos. Serve à conferência humana; verificar_medidor não o usa como chave.';
