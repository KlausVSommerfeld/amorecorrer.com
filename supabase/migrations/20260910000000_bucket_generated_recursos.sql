-- ---------------------------------------------------------------------------
-- Versiona o bucket privado `generated-recursos`, até aqui criado à mão no
-- Dashboard. Pendência 14 do PROGRESSO.md.
--
-- É onde o pipeline guarda o PDF do recurso (worker.py:upload_pdf_to_storage).
-- Como não vivia em migration nenhuma, toda stack recriada do zero quebrava no
-- primeiro upload com `Bucket not found` — aconteceu em 01/09, 03/09 e
-- 06/09/2026, três sessões seguidas de teste ponta a ponta. Em 06/09 ficou
-- literal: depois de um `db reset`, o `evidencias` (que vem por migration)
-- estava lá e este tinha sumido.
--
-- Entra como migration NOVA em vez de dentro da baseline porque a baseline se
-- declara um retrato congelado do schema — e porque assim isto roda tanto num
-- remoto reconstruído quanto num remoto que só receba `db push`.
--
-- ATENÇÃO ao que a policy abaixo faz e ao que ela NÃO faz: `service_role` tem
-- `rolbypassrls = true` (conferido no projeto remoto em 08/09/2026), então ela
-- não é o que permite o upload do worker — quem permite é a linha em
-- storage.buckets. Prova empírica: o bucket funcionou por semanas nas sessões
-- de 01/09 e 03/09 sem policy nenhuma. Ela fica por simetria com o bucket
-- `evidencias` e como defesa em profundidade. O que torna o bucket privado é
-- não existir policy para `anon` — não esta.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-recursos', 'generated-recursos', FALSE)
ON CONFLICT (id) DO NOTHING;

-- CREATE POLICY não aceita IF NOT EXISTS, e o Dashboard pode ter criado
-- policies com outros nomes — derrubamos apenas a de nome canônico, para a
-- migration ser reaplicável sem apagar configuração alheia.
DROP POLICY IF EXISTS "Service role gerencia o bucket generated-recursos" ON storage.objects;

CREATE POLICY "Service role gerencia o bucket generated-recursos"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'generated-recursos')
  WITH CHECK (bucket_id = 'generated-recursos');
