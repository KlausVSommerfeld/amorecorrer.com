# Enquadramento por lista, com a tabela de códigos da SENATRAN — Design

*Escrito em 15/10/2026. Decidido em conversa com o Klaus no mesmo dia. Resolve dois itens do
`PENDENCIAS.md`: "Enquadramento escolhido numa lista com busca" (sessão de 15/10/2026) e "Tabela de
códigos de enquadramento" (sessão de 29/09/2026).*

## 1. O problema

O enquadramento chega hoje como texto livre, no passo 4 do questionário e no formulário ("Copie como está
na notificação"). Três falhas vêm daí:

- **Texto que não é enquadramento.** No `CASO_363f15e6…` (15/10/2026), "Artigo 5" virou o art. 5º. A
  branch `fix/achados-dos-casos` restringiu o pipeline aos arts. 162–255, mas o texto livre continua
  aceitando qualquer coisa.
- **Código no lugar do artigo.** Muitas notificações imprimem o código da infração ("7455-0", "745-50")
  ao lado da descrição. O pipeline não traduz código: o caso fica sem enquadramento e a peça sai só com o
  rito.
- **Grafias que o diagnóstico precisa adivinhar.** "inciso 2", "inc. II", "218, 2" — o `parse_ref` e o
  `diagnostico.ts` mantêm uma gramática para elas.

## 2. Decisões travadas

- **Lista completa, extraída do PDF oficial** (abordagem A). Fonte: Anexo IV — *Tabela de Códigos de
  Enquadramentos das Infrações* — da Portaria SENATRAN nº 354/2022, na versão "Anexos Retificados"
  publicada no site da SENATRAN (`Portaria3542022AnexoN4.pdf`, 135 páginas, `sha256` começando por
  `81bceadbc1e48b84`). Essa versão já traz os códigos das portarias 1.230/2022, 1.477/2022 e 4/2023
  (conferido: 7749-1, 7757-1, 7773-1, 7781-1, 7765-0 e 6068-5 estão nela). Falta a **Portaria SENATRAN
  nº 423/2024** (códigos 7790-0, 7803-0, 7811-0 e 7820-0, arts. 165-B, 165-C e 165-D), transcrita à
  parte. Nenhuma alteração de 2025 ou 2026 foi encontrada na busca de 15/10/2026.
- **Quem não achar, digita.** A opção "Não encontro na lista" abre o campo de texto livre, gravado como
  hoje. Ninguém fica travado, e o que está no papel é preservado.
- **A peça cita só o CTB.** A tabela traduz código em dispositivo; a portaria nunca entra na peça (a
  `conferencia.py` continua recusando "portaria").
- **Só infrações de quem dirige ou é dono.** A lista oferece apenas códigos cujo dispositivo está nos
  arts. 162–255 — a mesma trava do pipeline. Os códigos de órgão público e de obra (arts. 93–95) ficam
  fora.
- **Escolher na lista grava o dispositivo canônico.** `amparo_legal` recebe "art. 218, I" (forma que o
  pipeline e o diagnóstico sempre reconhecem) e uma coluna nova, `codigo_enquadramento`, recebe "7455-0".

## 3. A tabela

### 3.1 Arquivos

Pasta nova `enquadramentos/` na raiz:

| Arquivo | Papel |
|---|---|
| `Portaria3542022AnexoN4.pdf` | a fonte, guardada byte a byte (`-text` no `.gitattributes`, como o `.htm` do CTB) |
| `alteracoes.json` | os códigos de portarias posteriores ao anexo (hoje, só a 423/2024), cada um com a portaria e a data; e `conferido_em`, a data da última busca por alterações |
| `enquadramentos_parser.py` | o extrator |
| `test_enquadramentos_parser.py` | os testes do extrator |
| `saida/enquadramentos.json` | a tabela completa, gerada |
| `README.md` | como atualizar |

O extrator gera também `src/data/enquadramentos.json`, a cópia enxuta que o site usa (§4.1).

### 3.2 O extrator

`python enquadramentos_parser.py` (de dentro de `enquadramentos/`, com `pypdf==5.1.0` fora do venv, como
o `ctb_parser.py` faz com as dependências dele) lê o Anexo IV e produz, por linha:

| Campo | Exemplo | Origem |
|---|---|---|
| `codigo` | `"7455-0"` | colunas CÓDIGO e DESDOB. |
| `descricao` | `"Transitar em velocidade superior à máxima permitida em até 20%"` | DESCRIÇÃO DA INFRAÇÃO (RESUMIDA), com as quebras de linha do PDF desfeitas |
| `amparo` | `"218, I"` | AMPARO CTB, como está |
| `dispositivo` | `"art. 218, I"` | o `amparo` resolvido contra o `ctb.json` |
| `infrator` | `"Condutor"` | INFRATOR |
| `gravidade` | `"média"` | GRAVIDADE normalizada (`"4 - Média"` → `média`; `"SDD - Gravíss 3X"` → `gravíssima`) |
| `origem` | `"Portaria SENATRAN 354/2022, Anexo IV (retificado)"` | o anexo ou a portaria de `alteracoes.json` |

No PDF, cada linha começa por quatro dígitos, um espaço e um dígito (`7455 0`). As células quebram em
várias linhas de texto; o extrator junta tudo até o começo da linha seguinte e separa as colunas pelas
âncoras conhecidas: o amparo (número de artigo do CTB, talvez com inciso, parágrafo e alínea), o infrator
(`Condutor`, `Proprietário`, `PF ou PJ`, `PF`, `PJ`, `Serv público`, `Embarcador`, `Transportador`) e a
gravidade (`<pontos> - <natureza>`, `SDD - Gravíss[ <n>X]` ou `---`). As páginas dos Anexos I a III e V
a VI são ignoradas: a leitura começa no título "ANEXO IV" e termina no "ANEXO V".

### 3.3 Conferência — nada é adivinhado

Cada linha passa por três verificações:

1. o `amparo` vira um dispositivo **vigente** do `ctb.json` (pelo `consulta.parse_ref` e
   `ctb.dispositivo`);
2. a `gravidade` bate com a natureza que o CTB dá ao dispositivo (`base_legal.natureza`), quando o CTB a
   tem;
3. o `amparo` é só CTB: "c/c" com outra norma (como o 6068-5, "209 c/c art. 17, § 5º, da Lei 13.103")
   reprova.

Linha que falha vai para `rejeitados`, com o motivo, e o extrator imprime a lista. A linha não some: o
teste fixa o número exato de rejeições esperadas e os códigos de cada motivo. Linhas fora dos arts.
162–255 não são rejeitadas — ficam na tabela completa com `na_lista: false`.

### 3.4 Formato de `saida/enquadramentos.json`

```json
{
  "meta": {
    "fonte": "Portaria3542022AnexoN4.pdf",
    "fonte_sha256": "81bceadbc1e48b84…",
    "alteracoes_conferidas_em": "2026-10-15",
    "ctb_sha256": "…",
    "total": 0,
    "na_lista": 0
  },
  "enquadramentos": [
    {"codigo": "7455-0", "descricao": "…", "amparo": "218, I", "dispositivo": "art. 218, I",
     "infrator": "Condutor", "gravidade": "média", "origem": "…", "na_lista": true}
  ],
  "rejeitados": [
    {"codigo": "6068-5", "amparo": "209 c/c …", "motivo": "amparo com outra norma"}
  ]
}
```

O `ctb_sha256` amarra a tabela à versão do CTB contra a qual foi conferida.

### 3.5 Testes do extrator

- linhas conhecidas saem certas: 7455-0, 7463-0 e 7471-0 (art. 218, I a III), um código com vários
  desdobramentos, um com alínea, um da 423/2024;
- o total de linhas lidas bate com a contagem de começos de linha (`^\d{4} \d`) no texto do Anexo IV;
- as rejeições são exatamente as esperadas, por código e motivo;
- todo código de `na_lista: true` tem dispositivo nos arts. 162–255;
- `src/data/enquadramentos.json` é exatamente a projeção de `saida/enquadramentos.json` (§4.1).

## 4. O campo de escolha

### 4.1 Os dados no site

`src/data/enquadramentos.json` é uma lista só com os itens `na_lista: true`, cada um com `codigo`,
`descricao`, `dispositivo` e `gravidade`. O site o carrega por `import()` dinâmico, num arquivo à parte,
baixado só quando o campo aparece — a home não paga nada. Estimativa: uns 50 KB, cerca de 12 KB
comprimidos.

### 4.2 `CampoEnquadramento`

Um componente usado no passo 4 do questionário e no formulário. Três estados:

- **Busca.** Um campo de texto com a lista de resultados embaixo (padrão *combobox*: `role="combobox"`,
  `aria-expanded`, `aria-activedescendant`, setas e Enter no teclado, Esc fecha). No celular, a lista
  ocupa a largura toda. Cada resultado mostra o código em mono, a descrição, "art. 218, I" e a gravidade.
  No fim da lista, sempre, "Não encontro na lista".
- **Escolhido.** Um cartão com código, descrição e dispositivo, a frase "Confira se é a mesma descrição
  da sua notificação" e o botão "Trocar", que volta à busca e apaga a escolha.
- **Texto livre.** O campo de hoje ("Copie como está na notificação…"), com um link "Voltar à lista".

Segue o design system: rótulo `.form-label`, campo `.form-input`, código em `font-mono`, cartão no padrão
de `.field`, erro por `aria-invalid`. Os pares de cor novos passam por conferência de contraste AA nos
dois temas.

### 4.3 A busca

Uma função pura, `buscarEnquadramentos(termo, itens)`, em `src/lib/enquadramentos.ts`:

- **Código** — tirando tudo que não é dígito, cinco dígitos são código + desdobramento: "7455-0",
  "745-50" e "74550" dão `7455-0`. Quatro dígitos ("7455") dão todos os desdobramentos do código.
- **Artigo** — um a três dígitos, talvez com letra ("218", "165-A", "165a"), dão os itens do artigo.
- **Palavras** — sem distinguir maiúsculas e acentos, todas as palavras precisam aparecer na descrição
  ("velocidade 20").
- **Ordem** — o formato do termo decide o tipo de busca (código, artigo ou palavras; nas palavras, um
  código escrito no meio também vale); os resultados saem pelo código, no máximo 30.

A leitura de código é a mesma do pipeline (§6.1), garantida por `tests/compartilhados/codigos.json`.

### 4.4 O que se grava

| Escolha | `amparo_legal` | `codigo_enquadramento` |
|---|---|---|
| item da lista | `"art. 218, I"` | `"7455-0"` |
| texto livre | o que foi digitado | `""` |

No questionário, `RespostasQuestionario` ganha `codigo_enquadramento: string`. Rascunho antigo, sem a
chave, é lido com ela vazia (hoje `lerRespostas` recusa rascunho com chave faltando — essa regra ganha a
exceção) e abre no modo texto livre com o que já estava escrito. `versao_formato` continua 1. No
formulário, o estado ganha `codigoEnquadramento`, que vem do questionário e vai no POST como
`codigo_enquadramento`. Ao abrir o formulário com um `codigo_enquadramento` que exista na lista, o campo
abre no estado "Escolhido"; com código desconhecido ou vazio, no texto livre.

O diagnóstico não muda: passa a receber o dispositivo canônico sempre que o cliente escolhe da lista.

## 5. Banco e Edge

- **Migration nova** (`supabase/migrations/20261016000000_codigo_enquadramento.sql`):
  `ALTER TABLE public.form_submissions ADD COLUMN codigo_enquadramento text;` — nulável, sem default. O
  schema passa a doze migrations. A RLS fechada não muda (coluna nova em tabela já fechada).
- **`form-submit`**: `codigoEnquadramento(valor)` em `campos.ts` aceita só `^\d{4}-\d$`; qualquer outra
  coisa vira `null`, e o envio nunca é recusado por causa do campo. Fica fora do `dup_guard`, como os
  outros campos da triagem. A Edge não confere o código contra a tabela (não a tem); código desconhecido é
  ignorado pelo pipeline.
- A coluna `artigo_ctb`, sempre gravada `null`, fica como está.

## 6. Pipeline

### 6.1 Código vira dispositivo

`base_legal.py` carrega `enquadramentos.json` (caminho em `ENQUADRAMENTOS_JSON`; padrão
`enquadramentos/saida/enquadramentos.json` a partir da raiz; no contêiner, `/app/enquadramentos.json`,
copiado pelo `Dockerfile.pipeline`). **Sem a tabela, o pipeline não sobe** — como as fontes da peça: um
caso sem tradução de código seria uma peça pior sem aviso.

`montar_base(c, amparo_legal, codigo_enquadramento=None, …)` resolve o enquadramento nesta ordem, parando
no primeiro que der um dispositivo vigente nos arts. 162–255:

1. o `amparo_legal`, como hoje;
2. o `codigo_enquadramento`, pela tabela;
3. um código escrito no `amparo_legal` ("7455-0", "745-50", "74550"), pela tabela.

Nada disso muda a trava: dispositivo fora dos arts. 162–255 continua levando só o rito. O worker passa o
`codigo_enquadramento` do caso; a advertência continua decidida pelo `base.enquadramento`.

### 6.2 A peça

- O quadro de campos do auto (`peca.campos`) ganha a linha **"Código da infração"** quando houver código
  — o `codigo_enquadramento` do caso ou, sem ele, o código lido do `amparo_legal` (passo 3 de §6.1),
  formatado `7455-0` e só se existir na tabela. Sem código, a linha não aparece (não vira `________`).
- `codigo_enquadramento` entra em `CAMPOS_INTERNOS` (`pipeline/prompt.py`): não vai cru ao modelo, que
  continua recebendo o enquadramento pela base.

## 7. Sincronia

| O que pode divergir | Quem pega |
|---|---|
| a cópia do site e a tabela completa | teste Python do extrator (§3.5) |
| a leitura de código no site e no pipeline | `tests/compartilhados/codigos.json`, rodado por `src/lib/enquadramentos.test.ts` e por um teste do pipeline |
| a tabela e o CTB | o extrator confere gravidade e dispositivo contra o `ctb.json`; o `ctb_sha256` em `meta`; um teste do pipeline reprova tabela conferida contra outro `ctb.json` |

## 8. Manutenção

O `CLAUDE.md` ganha, em "Armadilhas conhecidas", **"Atualizar a tabela de enquadramentos"**: baixar o
anexo novo (se a SENATRAN republicar) ou acrescentar os códigos da portaria nova em `alteracoes.json`,
atualizar `conferido_em`, rodar o extrator e os testes. E, na entrada "Atualizar o CTB", a nota de que o
extrator de enquadramentos precisa rodar de novo depois.

## 9. Fora do escopo

- mostrar a advertência no resumo do questionário — possível agora, porque a gravidade é conhecida antes
  do pagamento; fica no `PENDENCIAS.md`;
- ler a notificação por OCR;
- tirar a coluna `artigo_ctb`.

## 10. Deploy (do Klaus)

1. `npx supabase db push` (a migration);
2. `npx supabase functions deploy form-submit`;
3. reconstruir o contêiner do pipeline (`--build`), conferindo antes se há caso em `generating`.

A ordem importa: a coluna precisa existir antes da `form-submit` nova gravar nela — na ordem inversa,
todo envio do formulário falharia no insert. O site só deve ir com o campo novo depois dos três passos.
