# CTB estruturado para consulta por IA

Converte o texto compilado do **Código de Trânsito Brasileiro** (Lei nº 9.503/1997), publicado em
<https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm>, em arquivos que a IA consegue
consultar com precisão ao redigir petições e recursos de multa.

## Estrutura

```
ctb/
├── l9503compilado.htm      # fonte oficial salva do Planalto (windows-1252, não editar)
├── ctb_parser.py           # HTML → estrutura (Python ≥ 3.10, bs4 + lxml)
├── consulta.py             # recuperação por dispositivo + montagem do contexto (só stdlib)
├── tests/                  # pytest: casos sintéticos + integração com o HTML real
└── saida/
    ├── ctb.json            # artigos → dispositivos → notas, com status e metadados
    ├── ctb.md              # texto integral limpo (~320 mil caracteres)
    ├── ctb_chunks.jsonl    # 1 registro por artigo e por definição (RAG / busca por id)
    ├── ctb_infracoes.json  # 173 blocos: dispositivo → natureza, penalidade, medida administrativa
    ├── ctb_definicoes.json # Anexo I (121 termos)
    └── parser_warnings.txt # correções automáticas aplicadas (auditoria)
```

## Como rodar

```bash
pip install beautifulsoup4 lxml pytest
python ctb_parser.py l9503compilado.htm --out saida
python -m pytest -q                       # 41 testes

python consulta.py disp "218, III"        # dispositivo + ascendentes + sanção
python consulta.py art 280
python consulta.py infracao "230, V"
python consulta.py def "via arterial"
python consulta.py busca "equipamento hábil"
python consulta.py contexto "218, III" > contexto.md   # bloco pronto para o prompt
```

No pipeline (FastAPI):

```python
from consulta import CTB
ctb = CTB.carregar("ctb/saida/ctb.json")          # carregar uma vez no startup
contexto = ctb.contexto_peticao(
    enquadramentos=["218, III"],                   # campo "amparo legal" do auto
    processuais=None,                              # None = padrão (arts. 90, 257, 280–290)
    extras=["80"],
)
```

`contexto_peticao` devolve Markdown (~23 mil caracteres para o art. 218) com: o dispositivo enquadrado
e sua sanção, o artigo completo, os artigos de rito e prazos (280–290, 257, 90) e as definições do
Anexo I citadas no enquadramento (ex.: "vias arteriais" → VIA ARTERIAL). Referências aceitas:
`art. 218, III`, `218 III`, `280 § 2º`, `2, parágrafo único`, `29, III, c`, `7º-A`.

### Instrução sugerida para o prompt

> Use exclusivamente a base normativa fornecida. Cite dispositivos no formato da chave `citacao`
> (ex.: "art. 281, § 1º, II"). Não cite dispositivos marcados como REVOGADO, VETADO ou SEM EFEITO.
> Se a data da infração for anterior à lei indicada em "Redação dada/Incluído pela", sinalize que a
> redação aplicável pode ser diferente.

## Decisões de tratamento

| Situação no HTML do Planalto | Tratamento |
|---|---|
| Notas "(Redação dada pela Lei …)", "(Incluído…)", "(Vide…)" | Removidas do texto, guardadas em `notas` com tipo e URL |
| Nota riscada (MP que perdeu eficácia) | `sem_efeito: true`; o dispositivo continua vigente (ex.: art. 139-A, I e IV) |
| Dispositivo incluído só por MP caduca | status `sem_efeito` (art. 268-A, § 8º) |
| "(VETADO)" / "(Revogado…)" sem texto | status `vetado` / `revogado` |
| `<p></font>§ 2º …` (texto fora do `<p>`) | Documento linearizado inteiro; nada depende de `<p>` bem formado |
| Marcadores vazios ("I - " sem texto) | Removidos e registrados em `parser_warnings.txt` |
| Definições coladas na mesma linha do Anexo I | Separadas (RODOVIA/SEMI-REBOQUE, etc.) |
| Sanção após vários incisos (ex.: art. 230, I–VI) | Um bloco cobre todos os incisos do grupo; incisos vetados ficam de fora |

**Validação:** todos os 1.554 trechos extraídos existem literalmente no HTML (comparação sem
considerar espaços), e a cobertura por palavras está completa, exceto cabeçalho institucional e
rótulos normalizados (`§ 2o` → `§ 2º`).

## Limitações

- **Só a redação atual.** O compilado não traz redações anteriores. Para infrações antigas, confira
  a vigência da lei alteradora (princípio *tempus regit actum*).
- **Anexo II (sinalização)** existe apenas em PDF no Planalto e não está incluído.
- **Resoluções do CONTRAN** (ex.: Res. 798/2020, sobre medidores de velocidade) e a tabela de códigos
  de enquadramento (código da infração no auto → dispositivo do CTB) não fazem parte do CTB. Para usá-las,
  gere bases separadas.
- O status é inferido do texto e das notas; os casos ambíguos aparecem como `SEM TEXTO` (hoje só o
  art. 282-A, § 5º).

## Atualização

O Planalto altera o compilado a cada nova lei. Para atualizar, salve a página de novo
(Ctrl+S → "Página da Web, somente HTML", ou `curl -o l9503compilado.htm <URL>` fora do sandbox) e rode
o parser e os testes. O `sha256` e a data ficam em `ctb.json → meta`; a data de obtenção vem da data de
modificação do arquivo.
