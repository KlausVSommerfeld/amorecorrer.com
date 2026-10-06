-- Condutor do veículo — spec docs/superpowers/specs/2026-10-05-relato-e-condutor-design.md
--
-- O teste ponta a ponta de 05/10/2026 produziu uma peça que dizia "conduzido por
-- <cliente>" sem que o formulário perguntasse quem dirigia. Numa defesa prévia,
-- isso pode custar ao cliente a indicação do condutor (CTB, art. 257, § 7º).
-- A resposta NÃO vai escrita na peça: escolhe, em código, a regra sobre a
-- direção no prompt e o aviso de indicação do condutor no e-mail.
--
-- Deploy: sobe ANTES da Edge que grava a coluna.

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS cliente_conduzia boolean;

COMMENT ON COLUMN public.form_submissions.cliente_conduzia IS
  'Resposta do cliente a "Era você quem dirigia o veículo?". Não vai escrita na peça: escolhe a regra sobre a direção no prompt e o aviso de indicação do condutor no e-mail. NULL só em casos anteriores ao campo; o pipeline o trata como "não".';
