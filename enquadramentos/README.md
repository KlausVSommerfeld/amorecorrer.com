# enquadramentos/

Tabela de Códigos de Enquadramentos das Infrações — Anexo IV da Portaria SENATRAN
nº 354/2022 — conferida contra o CTB. Spec:
`docs/superpowers/specs/2026-10-15-enquadramento-por-lista-design.md`.

| Arquivo | Papel |
|---|---|
| `Portaria3542022AnexoN4.pdf` | a fonte ("Anexos Retificados", site da SENATRAN), byte a byte |
| `alteracoes.json` | códigos de portarias posteriores ao anexo e a data da última busca por alterações |
| `enquadramentos_parser.py` | o extrator |
| `saida/enquadramentos.json` | a tabela completa, gerada (lida pelo pipeline) |
| `../src/data/enquadramentos.json` | a lista do site, gerada |

## Atualizar

1. Procure portarias da SENATRAN que alterem o Anexo IV depois de `conferido_em`
   (em `alteracoes.json`). Para cada uma, acrescente os códigos em `codigos`, com a
   portaria em `origem`. Se a SENATRAN republicar o anexo consolidado, troque o PDF
   e esvazie de `alteracoes.json` o que ele já trouxer.
2. Atualize `conferido_em`.
3. Rode o extrator e os testes:
   ```bash
   PYTHONPATH="$HOME/.cache/amorecorrer-pdftext" python3 enquadramentos_parser.py
   PYTHONPATH="$HOME/.cache/amorecorrer-pdftext:$HOME/.cache/ctb-testdeps" python3 -m pytest -q
   ```
   Os totais e as rejeições fixados em `test_enquadramentos_parser.py` mudam junto:
   confira cada rejeição nova antes de atualizar o teste.
4. Depois de atualizar o CTB (`CTB-compilado_files/`), rode o extrator de novo: o
   `test_tabela_enquadramentos` do pipeline reprova tabela conferida contra outro CTB.
