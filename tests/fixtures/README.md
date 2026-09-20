# Fixture do PSIE/INMETRO — medidores de velocidade do RJ

`medidores_RJ.json` — **23 registros escolhidos a dedo** do arquivo de dados abertos do Rio de Janeiro,
para os testes das Fases 2 e 3 de `PLANO-verificacao-radar-inmetro.md`.

## Procedência

| | |
|---|---|
| Fonte | `https://servicos.rbmlq.gov.br/dados-abertos/RJ/medidores.json` |
| Licença | Creative Commons CC0 |
| Baixado em | 2026-09-03 |
| `Last-Modified` | `Tue, 01 Sep 2026 00:12:26 GMT` |
| Arquivo íntegro | 3.661.867 bytes, 1.971 registros |
| sha256 do íntegro | `4dcb3d35ee37cd60122d660319b00be215a49759b0f371cd59f4a6fde648fb9b` |

**O arquivo íntegro não vai para o git** (3,66 MB, regenerado na origem). Só este recorte é versionado.
Os registros estão **exatamente como vieram** — nenhum campo foi editado, nem para anonimizar: são dados
públicos de equipamentos, sem informação pessoal.

## O que cada registro cobre

Ordenados pelo caso que justificam. A coluna "usado por" aponta o teste que **precisa** dele.

| Município · local | Caso que cobre | Usado por |
|---|---|---|
| RIO DE JANEIRO · Est Rio Grande Px1096 | o registro canônico da §1.3 — **`Historico` fora de ordem cronológica** | `normalize` (ordenação), Fase 3 (bordas de data) |
| ARARUAMA · RJ-124 A1, KM 7,6 | `Historico: []` **+ par do topo vigente** (um dos 297 da §1.4.11) | Fase 3 → `comprovado_valido` com `origem: topo` |
| CACHOEIRAS DE MACACU · RJ 116 KM 21,5 | `Historico: []` + par do topo **vencido** | Fase 3 → `nao_comprovado` |
| ARARUAMA · RJ106 KM 84,8 | `Historico: []` **e sem par válido** (um dos 14) | Fase 3 → `sem_registro` **real** |
| ARARUAMA · RJ-106 KM 86,0 | histórico + **`DataValidade` vazia no topo** (um dos 119 da §1.4.12) | `normalize` → nenhuma linha `origem: topo` |
| ARARUAMA · RJ106 KM 85,7 | `UltimoResultado: "Reparado"` com `Historico: []` | Fase 3 → `nao_comprovado`, nunca `reprovado` |
| ARARUAMA · RJ-124A1 KM 6,3 | `UltimoResultado: "Reparado"` **com** histórico | `classificarResultado` → indeterminado |
| ARARUAMA · RJ-124A1 KM 7,1 | `Resultado: "Reprovado"` no histórico | Fase 3 → `reprovado` |
| SÃO GONÇALO · BR 101 km 316+400 | `Resultado: "Pendente"` — **existe 1 em todo o RJ** | Fase 3 → `nao_comprovado`, nunca `reprovado` |
| RIO DE JANEIRO · 071/R5 - Av Brasil km 7,6 | `TipoServico: ""` | `normalize` não quebra |
| RIO DE JANEIRO · Av das Americas próx ao nº 4 | `TipoServico: "Fiscalização"` — **existe 1 em todo o RJ** | `normalize` não quebra |
| RIO DE JANEIRO · Rodovia Presidente Dutra km… | `VelocidadeNominal: "0"` | `parseIntOrNull` → `null`, não 0 km/h |
| SÃO JOSÉ DO NORTE · `1'` | **registro sem `Faixas`** — existe 1 em todo o RJ | `normalize` não quebra |
| ARARUAMA · RJ-106 KM 86,0 (2º) | certificado com **duração 0 dias** (dado inválido; há 42 no RJ) | decidir descartar ou aceitar janela de 1 dia |
| RIO DE JANEIRO · Rua Doutor Satamini próximo… | **`NumeroSerie` colidindo** entre instrumentos — par 1 | Fase 3 → `ambiguo` |
| RIO DE JANEIRO · R DOUTOR SATAMINI PX69A | idem, par 1 | Fase 3 → `ambiguo` |
| RIO DE JANEIRO · ESTRADA DE TUBIACANGA S/N | **`NumeroSerie` colidindo** — par 2 | Fase 3 → `ambiguo` |
| RIO DE JANEIRO · Av Embaixador Abelardo Bueno | idem, par 2 | Fase 3 → `ambiguo` |
| ANGRA DOS REIS · BR-101 KM 472+300 | `Sentido` em **CAIXA ALTA** | normalização `unaccent`+`upper` |
| ANGRA DOS REIS · BR 101 km 455,22 | `Sentido` em **Caixa Mista** | idem — mesmas ruas, grafias diferentes |
| RIO DE JANEIRO · Rodovia Presidente Dutra km… (2º) | `TipoMedidor: "Estático ou Portátil"` (32 no RJ) | cobertura do tipo minoritário |
| ANGRA DOS REIS · BR-101 KM 470+300 | `LocalVerificacao` no formato rodovia+km | §2.3 — match por endereço é fraco |
| RIO DE JANEIRO · Est Cafundá Px 2125 | caso comum, histórico longo | caminho feliz |

## Divergências em relação ao plano

1. **São 23 registros, não 20.** O plano pedia 20; os casos `ambiguo` exigem **quatro** registros (dois
   pares de colisão de `NumeroSerie`), e cortar para caber no número redondo deixaria um teste sem fixture.
   O número não tinha razão técnica; a cobertura tem.

2. **O único registro sem `Faixas` do RJ é lixo de cadastro.** `Municipio: "SÃO JOSÉ DO NORTE"` — cidade do
   **Rio Grande do Sul** — com `SiglaUf: "RJ"`, `LocalVerificacao: "1'"`, sem faixas e sem histórico. Não é
   um radar: é uma linha errada na base. Serve como teste de robustez do `normalize`, mas **não deve ser
   usado como exemplo de instrumento válido**, e reforça que a ingestão precisa tolerar lixo sem abortar.
