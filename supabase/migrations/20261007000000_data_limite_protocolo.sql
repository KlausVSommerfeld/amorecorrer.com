-- Data-limite de protocolo — spec docs/superpowers/specs/2026-10-07-questionario-de-triagem-design.md
--
-- O cliente informa, no questionário ou no formulário, a data-limite impressa na
-- notificação (defesa prévia ou recurso). O e-mail passa a dizer "protocole até
-- dd/mm/aaaa". `date`, e não `timestamptz`: é uma data de calendário impressa no
-- papel, não um instante (mesmo raciocínio de data_infracao).
--
-- Deploy: sobe ANTES da Edge que grava a coluna.

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS data_limite_protocolo date;

COMMENT ON COLUMN public.form_submissions.data_limite_protocolo IS
  'Data-limite impressa na notificação (defesa prévia ou recurso), informada pelo cliente no questionário ou no formulário. Usada no e-mail ("protocole até dd/mm/aaaa"). NULL em casos anteriores ao campo e quando a Edge recebe valor inválido.';
