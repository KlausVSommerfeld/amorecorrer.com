-- Testes de borda de verificar_medidor() — Fase 3 de PLANO-verificacao-radar-inmetro.md
-- Rodar com: npx supabase test db
--
-- Se `supabase test db` falhar ao baixar a imagem pg_prove (o helper de
-- credenciais do Docker quebra sob WSL: "error getting credentials"), o mesmo
-- teste roda direto no psql, que também entende TAP:
--
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres -Xqt \
--     -f - < supabase/tests/verificar_medidor_test.sql | grep -E '^ *(not )?ok'
--
-- Falha é qualquer linha começando com `not ok`.
--
-- O seed é derivado do instrumento real da §1.3 (Est Rio Grande Px1096), cujos
-- laudos são 20/12/2021, 03/01/2023, 12/07/2024 e 01/10/2025, cada um com 12
-- meses de validade — e cuja lacuna entre jan/2024 e jul/2024 é o caso que
-- mais quebra implementação aqui.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(24);

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
INSERT INTO radar_snapshots (id, uf, source_url, sha256, record_count)
VALUES ('11111111-1111-1111-1111-111111111111', 'RJ',
        'https://servicos.rbmlq.gov.br/dados-abertos/RJ/medidores.json', 'sha-seed', 1971);

INSERT INTO radar_instruments (id, municipio, local_via, tipo_medidor, proprietario, snapshot_id)
VALUES
  ('inst_a', 'RIO DE JANEIRO', 'Est Rio Grande Px1096', 'Fixo', 'CONSILUX', '11111111-1111-1111-1111-111111111111'),
  ('inst_b', 'ARARUAMA',       'RJ-124 A1, KM 7,6',     'Fixo', 'SPLICE',   '11111111-1111-1111-1111-111111111111'),
  ('inst_c', 'CACHOEIRAS DE MACACU', 'RJ 116 KM 21,5',  'Fixo', 'PERKONS',  '11111111-1111-1111-1111-111111111111'),
  ('inst_d', 'ARARUAMA',       'RJ106 KM 84,8',         'Fixo', 'CLD',      '11111111-1111-1111-1111-111111111111'),
  ('inst_e', 'ARARUAMA',       'RJ106 KM 85,7',         'Fixo', 'CLD',      '11111111-1111-1111-1111-111111111111'),
  ('inst_f', 'SAO GONCALO',    'BR 101 km 316+400',     'Fixo', 'SITRAN',   '11111111-1111-1111-1111-111111111111'),
  ('inst_g', 'RIO DE JANEIRO', 'Rua Doutor Satamini',   'Fixo', 'TALENTECH','11111111-1111-1111-1111-111111111111'),
  ('inst_h', 'RIO DE JANEIRO', 'R DOUTOR SATAMINI PX69A','Fixo','TALENTECH','11111111-1111-1111-1111-111111111111'),
  ('inst_i', 'RIO DE JANEIRO', 'Est Cafunda Px 2125',   'Fixo', 'CONSILUX', '11111111-1111-1111-1111-111111111111');

INSERT INTO radar_faixas (instrument_id, numero_faixa, numero_inmetro, numero_serie, sentido, velocidade_nominal)
VALUES
  ('inst_a', '1', '14117709', '2000065', 'Est Pau Fome', 40),
  ('inst_a', '2', '14117709', '2000065', 'Est Tindiba',  40),
  ('inst_b', '1', '14100001', '3000001', 'Crescente',    60),
  ('inst_c', '1', '14100002', '3000002', 'Decrescente',  80),
  ('inst_d', '1', '14100003', '3000003', '',             NULL),
  ('inst_e', '1', '14100004', '3000004', 'CENTRO',       40),
  ('inst_f', '1', '14100005', '3000005', 'Centro',       60),
  ('inst_g', '1', '14100006', '9999999', 'Norte',        40),
  ('inst_h', '1', '14100007', '9999999', 'Sul',          40),
  ('inst_i', '1', '14100008', '3000006', 'Leste',        50);

-- inst_a: os quatro laudos reais, FORA de ordem cronológica de propósito
INSERT INTO radar_verificacoes (instrument_id, origem, numero_certificado, numero_ensaio, ano, data_laudo, data_validade, tipo_servico, resultado)
VALUES
  ('inst_a','historico','13785621','478', 2024,'2024-07-12','2025-07-11','Periódica','Aprovado'),
  ('inst_a','historico','13780552','12',  2023,'2023-01-03','2024-01-02','Periódica','Aprovado'),
  ('inst_a','historico','13773206','1024',2021,'2021-12-20','2022-12-19','Periódica','Aprovado'),
  ('inst_a','historico','13785998','737', 2025,'2025-10-01','2026-09-30','Periódica','Aprovado'),
  ('inst_a','topo',     '',        NULL,  2026,'2026-08-28','2027-08-27',NULL,        'Aprovado'),
  -- inst_b: sem histórico, só o par do topo, vigente (um dos 297 da §1.4.11)
  ('inst_b','topo',     '',        NULL,  2026,'2026-01-10','2027-01-09',NULL,        'Aprovado'),
  -- inst_c: sem histórico, par do topo vencido
  ('inst_c','topo',     '',        NULL,  2020,'2020-01-01','2020-12-31',NULL,        'Aprovado'),
  -- inst_e: par do topo cobrindo, mas UltimoResultado 'Reparado'
  ('inst_e','topo',     '',        NULL,  2026,'2026-01-10','2027-01-09',NULL,        'Reparado'),
  -- inst_f: histórico com 'Pendente' cobrindo a data
  ('inst_f','historico','13790001','9',   2026,'2026-01-10','2027-01-09','Periódica','Pendente'),
  -- inst_i: histórico E topo cobrindo a MESMA data
  ('inst_i','historico','13790002','10',  2026,'2026-01-10','2027-01-09','Periódica','Aprovado'),
  ('inst_i','topo',     '',        NULL,  2026,'2026-01-10','2027-01-09',NULL,        'Aprovado');
-- inst_d: nenhuma verificação — nem histórico, nem topo. Os 14 casos reais.

-- ---------------------------------------------------------------------------
-- Bordas de data no instrumento canônico
-- ---------------------------------------------------------------------------
SELECT is((verificar_medidor('2000065', NULL, '2024-07-12'))->>'status', 'comprovado_valido',
          'borda inferior inclusiva: o próprio dia do laudo');
SELECT is((verificar_medidor('2000065', NULL, '2025-07-11'))->>'status', 'comprovado_valido',
          'borda superior inclusiva: o próprio dia da validade');
SELECT is((verificar_medidor('2000065', NULL, '2025-07-12'))->>'status', 'nao_comprovado',
          'um dia após vencer, antes do laudo de out/2025');
SELECT is((verificar_medidor('2000065', NULL, '2024-03-01'))->>'status', 'nao_comprovado',
          'dentro da lacuna jan/2024 -> jul/2024');
SELECT is((verificar_medidor('2000065', NULL, '2022-06-01'))->>'status', 'comprovado_valido',
          'coberto pelo certificado de dez/2021');
SELECT is((verificar_medidor('2000065', NULL, '2010-01-01'))->>'status', 'nao_comprovado',
          'anterior a todo o histórico, mas o instrumento existe');

-- ---------------------------------------------------------------------------
-- O par do topo — o erro que a versão anterior do plano cometia
-- ---------------------------------------------------------------------------
SELECT is((verificar_medidor('3000001', NULL, '2026-06-01'))->>'status', 'comprovado_valido',
          'Historico vazio + par do topo cobrindo a data: NAO e sem_registro');
SELECT is((verificar_medidor('3000001', NULL, '2026-06-01'))#>>'{certificado_vigente,origem}', 'topo',
          'e a origem da prova e o topo do registro');
SELECT ok((verificar_medidor('3000001', NULL, '2026-06-01'))#>'{certificado_vigente,numero}' = 'null'::jsonb,
          'sem numero de certificado: a base nao fornece na origem topo');
SELECT ok((verificar_medidor('3000001', NULL, '2026-06-01'))->>'avisos' LIKE '%não o número do certificado%',
          'e o aviso registra isso, para a peca nao citar numero inexistente');

SELECT is((verificar_medidor('3000002', NULL, '2026-06-01'))->>'status', 'nao_comprovado',
          'par do topo existe mas nao cobre a data');
SELECT is((verificar_medidor('3000004', NULL, '2026-06-01'))->>'status', 'nao_comprovado',
          'UltimoResultado "Reparado" e indeterminado, NUNCA reprovado');
SELECT is((verificar_medidor('3000003', NULL, '2026-06-01'))->>'status', 'sem_registro',
          'sem historico E sem par do topo: os 14 casos reais, nao os 311');
SELECT is((verificar_medidor('3000005', NULL, '2026-06-01'))->>'status', 'nao_comprovado',
          'Resultado "Pendente" cobrindo a data: nunca reprovado');

-- Havendo os dois, prefere o histórico, que é quem tem número
SELECT is((verificar_medidor('3000006', NULL, '2026-06-01'))#>>'{certificado_vigente,origem}', 'historico',
          'historico e topo cobrindo a mesma data: prefere o do historico');
SELECT is((verificar_medidor('3000006', NULL, '2026-06-01'))#>>'{certificado_vigente,numero}', '13790002',
          'e por isso o numero do certificado vem preenchido');

-- ---------------------------------------------------------------------------
-- Não localizado e ambíguo
-- ---------------------------------------------------------------------------
SELECT is((verificar_medidor('nao_existe_nenhum', NULL, '2026-06-01'))->>'status', 'sem_registro',
          'serie inexistente');
SELECT is((verificar_medidor('nao_existe_nenhum', NULL, '2026-06-01'))->>'metodo_match', 'nenhum',
          'e o metodo_match diz que nada casou');
SELECT is((verificar_medidor('9999999', NULL, '2026-06-01'))->>'status', 'ambiguo',
          'mesma serie em instrumentos distintos: as 2 colisoes reais do RJ');
SELECT is(jsonb_array_length((verificar_medidor('9999999', NULL, '2026-06-01'))->'instrumentos_candidatos'), 2,
          'e devolve TODOS os candidatos, sem escolher em silencio');

-- ---------------------------------------------------------------------------
-- Confiança, método e avisos
-- ---------------------------------------------------------------------------
SELECT is((verificar_medidor('2000065', NULL, '2024-07-12'))->>'confianca', 'alta',
          'match por numero de serie tem confianca alta');
SELECT is((verificar_medidor(NULL, '14117709', '2024-07-12'))->>'metodo_match', 'numero_inmetro',
          'cascata: sem serie, cai no numero INMETRO');
SELECT is((verificar_medidor(NULL, NULL, '2024-07-12', 'Rio de Janeiro', 'Estrada Rio Grande 1096'))->>'confianca', 'baixa',
          'match por municipio+endereco e SEMPRE confianca baixa');
SELECT is((verificar_medidor('2000065', NULL, NULL))->>'status', 'nao_aplicavel',
          'sem data da infracao nao ha o que julgar');

SELECT * FROM finish();
ROLLBACK;
