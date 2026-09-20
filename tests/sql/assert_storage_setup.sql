-- Asserção de setup de Storage. Falha com exceção (e código de saída != 0) se
-- qualquer bucket exigido pelo produto estiver ausente ou público.
--
-- Roda com:  npx supabase db query --local -f tests/sql/assert_storage_setup.sql
--
-- É um bloco DO único de propósito: `supabase db query -f` não aceita mais de
-- um comando por arquivo ("cannot insert multiple commands into a prepared
-- statement"). Por isso a listagem final sai por RAISE NOTICE em vez de SELECT.
--
-- Existe porque três sessões seguidas de teste ponta a ponta (01/09, 03/09 e
-- 06/09/2026) morreram no primeiro upload do PDF por causa de um bucket criado
-- à mão no Dashboard, que não sobrevive a um `db reset`. O dump de schema do
-- Supabase cobre só o schema `public` — buckets e policies de Storage ficam de
-- fora dele, então nenhum diff de migration pegaria essa regressão. Esta
-- asserção é a rede que falta.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'generated-recursos') THEN
    RAISE EXCEPTION 'bucket generated-recursos AUSENTE — o upload do PDF falha com Bucket not found';
  END IF;

  IF (SELECT public FROM storage.buckets WHERE id = 'generated-recursos') IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'bucket generated-recursos NAO e privado — recursos de clientes ficariam publicos';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Service role gerencia o bucket generated-recursos'
  ) THEN
    RAISE EXCEPTION 'policy de service role para generated-recursos AUSENTE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'evidencias') THEN
    RAISE EXCEPTION 'bucket evidencias AUSENTE — regressao da migration do radar';
  END IF;

  IF (SELECT public FROM storage.buckets WHERE id = 'evidencias') IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'bucket evidencias NAO e privado';
  END IF;

  RAISE NOTICE 'buckets OK: %', (
    SELECT string_agg(id || ' (privado)', ', ' ORDER BY id)
    FROM storage.buckets WHERE public = FALSE
  );
END
$$;
