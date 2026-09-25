-- Verificação do medidor no fluxo do recurso
-- Fase 5 de PLANO-verificacao-radar-inmetro.md · spec:
-- docs/superpowers/specs/2026-09-24-verificacao-medidor-no-fluxo-design.md
--
-- 1. form_submissions.verificacao_medidor — o objeto devolvido por
--    verificar_medidor(), gravado pela Edge `form-submit` antes do
--    attempt_dispatch. Os dois "vazios" significam coisas diferentes:
--      NULL                              -> a verificação nunca rodou
--      {"status":"nao_aplicavel", ...}   -> rodou e não se aplicava, ou falhou
--
-- 2. verificar_medidor() recriada com UMA condição trocada: o aviso de número
--    de certificado ausente saía só para origem 'topo'. Na carga de 22/09/2026,
--    81 das 7.814 verificações de origem 'historico' também vieram sem número,
--    e a peça poderia afirmar vigência sem número e sem ressalva.
--
-- Deploy: sobe ANTES da Edge que grava a coluna.

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS verificacao_medidor jsonb;

COMMENT ON COLUMN public.form_submissions.verificacao_medidor IS
  'Resultado de verificar_medidor() gravado no envio do formulário. NULL = nunca verificado; status nao_aplicavel = sem números do medidor ou verificação indisponível.';

CREATE OR REPLACE FUNCTION public.verificar_medidor(
  p_numero_serie   text DEFAULT NULL,
  p_numero_inmetro text DEFAULT NULL,
  p_data_infracao  date DEFAULT NULL,
  p_municipio      text DEFAULT NULL,
  p_local          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_ids            text[] := '{}';
  v_metodo         text   := 'nenhum';
  v_confianca      text   := 'alta';
  v_status         text;
  v_avisos         text[] := '{}';
  v_inst           record;
  v_cert           record;
  v_tem_verif      boolean;
  v_instrumento    jsonb  := NULL;
  v_candidatos     jsonb  := NULL;
  v_certificado    jsonb  := NULL;
  v_proximos       jsonb  := '[]'::jsonb;
  v_evidencia      jsonb  := NULL;
  v_classificacao  text;
BEGIN
  -- Sem data não há o que julgar: a pergunta é sempre "vigente NAQUELE dia".
  IF p_data_infracao IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'nao_aplicavel', 'confianca', 'baixa', 'metodo_match', 'nenhum',
      'instrumento', NULL, 'certificado_vigente', NULL,
      'certificados_proximos', '[]'::jsonb, 'evidencia', NULL,
      'avisos', to_jsonb(ARRAY['data da infração ausente — verificação não realizada'])
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Match em cascata: para no primeiro critério que devolver alguma coisa.
  -- -------------------------------------------------------------------------
  IF btrim(coalesce(p_numero_serie, '')) <> '' THEN
    SELECT array_agg(DISTINCT instrument_id) INTO v_ids
      FROM radar_faixas WHERE numero_serie = btrim(p_numero_serie);
    IF coalesce(array_length(v_ids, 1), 0) > 0 THEN
      v_metodo := 'numero_serie';
    END IF;
  END IF;

  IF v_metodo = 'nenhum' AND btrim(coalesce(p_numero_inmetro, '')) <> '' THEN
    SELECT array_agg(DISTINCT instrument_id) INTO v_ids
      FROM radar_faixas WHERE numero_inmetro = btrim(p_numero_inmetro);
    IF coalesce(array_length(v_ids, 1), 0) > 0 THEN
      v_metodo := 'numero_inmetro';
    END IF;
  END IF;

  -- Fallback fraco: só serve para apresentar candidatos a um revisor humano.
  -- LocalVerificacao é abreviado e não-canônico ("Est Rio Grande Px1096"),
  -- e a notificação escreve o mesmo lugar de outro jeito. Ver §2.3.
  IF v_metodo = 'nenhum'
     AND btrim(coalesce(p_municipio, '')) <> ''
     AND btrim(coalesce(p_local, '')) <> '' THEN
    SELECT array_agg(DISTINCT id) INTO v_ids
      FROM radar_instruments
     WHERE upper(radar_unaccent_imutavel(municipio)) = upper(radar_unaccent_imutavel(btrim(p_municipio)))
       AND similarity(local_via_norm, upper(radar_unaccent_imutavel(btrim(p_local)))) > 0.45;
    IF coalesce(array_length(v_ids, 1), 0) > 0 THEN
      v_metodo    := 'local_municipio';
      v_confianca := 'baixa';
      v_avisos    := array_append(v_avisos, 'correspondência por município e semelhança de endereço: não usar como tese sem revisão humana');
    END IF;
  END IF;

  -- -------------------------------------------------------------------------
  -- Nenhum candidato.
  -- -------------------------------------------------------------------------
  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object(
      'status', 'sem_registro', 'confianca', 'baixa', 'metodo_match', 'nenhum',
      'instrumento', NULL, 'certificado_vigente', NULL,
      'certificados_proximos', '[]'::jsonb, 'evidencia', NULL,
      'avisos', to_jsonb(array_append(v_avisos, 'instrumento não localizado na base pública do INMETRO'))
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Mais de um instrumento: devolver TODOS, nunca escolher em silêncio.
  -- -------------------------------------------------------------------------
  IF array_length(v_ids, 1) > 1 THEN
    SELECT jsonb_agg(jsonb_build_object(
             'instrument_id', i.id, 'municipio', i.municipio, 'local_via', i.local_via,
             'tipo_medidor', i.tipo_medidor, 'proprietario', i.proprietario))
      INTO v_candidatos
      FROM radar_instruments i WHERE i.id = ANY(v_ids);

    RETURN jsonb_build_object(
      'status', 'ambiguo', 'confianca', 'baixa', 'metodo_match', v_metodo,
      'instrumento', NULL, 'instrumentos_candidatos', v_candidatos,
      'certificado_vigente', NULL, 'certificados_proximos', '[]'::jsonb,
      'evidencia', NULL,
      'avisos', to_jsonb(array_append(v_avisos, format('%s instrumentos distintos casaram com os dados informados', array_length(v_ids, 1))))
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Um instrumento. Resolver o status.
  -- -------------------------------------------------------------------------
  SELECT * INTO v_inst FROM radar_instruments WHERE id = v_ids[1];

  SELECT jsonb_build_object(
           'instrument_id', v_inst.id, 'municipio', v_inst.municipio,
           'local_via', v_inst.local_via, 'tipo_medidor', v_inst.tipo_medidor,
           'proprietario', v_inst.proprietario,
           'velocidade_nominal', (SELECT max(f.velocidade_nominal) FROM radar_faixas f WHERE f.instrument_id = v_inst.id),
           'sentido', (SELECT string_agg(DISTINCT nullif(f.sentido, ''), ' / ') FROM radar_faixas f WHERE f.instrument_id = v_inst.id))
    INTO v_instrumento;

  SELECT jsonb_build_object(
           'fonte_url', s.source_url, 'snapshot_id', s.id,
           'sha256', s.sha256, 'capturado_em', s.fetched_at)
    INTO v_evidencia
    FROM radar_snapshots s WHERE s.id = v_inst.snapshot_id;

  SELECT EXISTS (SELECT 1 FROM radar_verificacoes v WHERE v.instrument_id = v_inst.id)
    INTO v_tem_verif;

  -- Certificado cobrindo a data. Havendo mais de um, prefere o do histórico
  -- (é o único que traz número); no empate, o laudo mais recente.
  SELECT * INTO v_cert
    FROM radar_verificacoes v
   WHERE v.instrument_id = v_inst.id
     AND p_data_infracao BETWEEN v.data_laudo AND v.data_validade
   ORDER BY (v.origem = 'historico') DESC, v.data_laudo DESC
   LIMIT 1;

  IF FOUND THEN
    v_classificacao := radar_classificar_resultado(v_cert.resultado);
    v_status := CASE v_classificacao
                  WHEN 'conforme'     THEN 'comprovado_valido'
                  WHEN 'nao_conforme' THEN 'reprovado'
                  ELSE 'nao_comprovado'
                END;

    v_certificado := jsonb_build_object(
      'origem', v_cert.origem,
      'numero', nullif(v_cert.numero_certificado, ''),
      'numero_ensaio', v_cert.numero_ensaio,
      'data_laudo', v_cert.data_laudo,
      'data_validade', v_cert.data_validade,
      'tipo_servico', v_cert.tipo_servico,
      'resultado', v_cert.resultado);

    IF nullif(v_cert.numero_certificado, '') IS NULL THEN
      v_avisos := array_append(v_avisos, 'a base pública informa a verificação, mas não o número do certificado');
    END IF;
  ELSIF v_tem_verif THEN
    v_status := 'nao_comprovado';
  ELSE
    -- Histórico vazio E sem par do topo válido: os 14 casos reais do RJ,
    -- não os 311. Ver §1.4.11 do plano.
    v_status := 'sem_registro';
  END IF;

  -- Certificados imediatamente anterior e posterior: é o que deixa o revisor
  -- humano enxergar o tamanho da lacuna.
  SELECT coalesce(jsonb_agg(x.j ORDER BY x.data_laudo), '[]'::jsonb) INTO v_proximos FROM (
    (SELECT v.data_laudo, jsonb_build_object('posicao','anterior','origem',v.origem,
              'numero', nullif(v.numero_certificado,''), 'data_laudo', v.data_laudo,
              'data_validade', v.data_validade, 'resultado', v.resultado) AS j
       FROM radar_verificacoes v
      WHERE v.instrument_id = v_inst.id AND v.data_validade < p_data_infracao
      ORDER BY v.data_validade DESC LIMIT 1)
    UNION ALL
    (SELECT v.data_laudo, jsonb_build_object('posicao','posterior','origem',v.origem,
              'numero', nullif(v.numero_certificado,''), 'data_laudo', v.data_laudo,
              'data_validade', v.data_validade, 'resultado', v.resultado) AS j
       FROM radar_verificacoes v
      WHERE v.instrument_id = v_inst.id AND v.data_laudo > p_data_infracao
      ORDER BY v.data_laudo ASC LIMIT 1)
  ) x;

  IF v_status IN ('nao_comprovado', 'sem_registro') THEN
    v_confianca := 'baixa';
    v_avisos := array_append(v_avisos, 'ausência de certificado na base pública não comprova ausência de verificação');
  END IF;

  RETURN jsonb_build_object(
    'status', v_status, 'confianca', v_confianca, 'metodo_match', v_metodo,
    'instrumento', v_instrumento, 'certificado_vigente', v_certificado,
    'certificados_proximos', v_proximos, 'evidencia', v_evidencia,
    'avisos', to_jsonb(v_avisos));
END;
$$;

COMMENT ON FUNCTION public.verificar_medidor(text, text, date, text, text) IS
  'Verificação metrológica de medidor de velocidade no RJ. Ver Fase 3 de PLANO-verificacao-radar-inmetro.md.';

REVOKE ALL ON FUNCTION public.verificar_medidor(text, text, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_medidor(text, text, date, text, text) TO service_role;
