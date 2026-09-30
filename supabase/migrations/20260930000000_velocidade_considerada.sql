-- Velocidade considerada — spec docs/superpowers/specs/2026-09-30-velocidade-considerada-design.md
--
-- Nos autos de radar vêm a velocidade MEDIDA e a CONSIDERADA (a medida menos a
-- tolerância); o enquadramento do art. 218 (I, II, III) sai da considerada. Sem
-- ela, a IA fez a conta sobre a aferida (97/80 = 21,25%) e sustentou o inciso
-- II — mais grave — contra o cliente (29/09/2026). A Fase 4 do radar descartou
-- este campo como "duplicata" de velocidade_aferida: foi um engano.
--
-- Deploy: sobe ANTES da Edge que grava a coluna.

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS velocidade_considerada integer;

COMMENT ON COLUMN public.form_submissions.velocidade_considerada IS
  'Velocidade considerada impressa no auto (a medida menos a tolerância), em km/h; é a que define o inciso do art. 218. NULL quando não informada.';
