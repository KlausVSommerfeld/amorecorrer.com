# Velocidade considerada e a tese de enquadramento — Design

*Escrito em 30/09/2026. Decidido em conversa com o Klaus na mesma data.*

## 1. O problema, e por que este desenho existe

Na verificação real da base legal do CTB (29/09/2026), com **97 km/h aferidos num limite de 80**, a
peça sustentou que o caso "*não se amolda ao inciso I do art. 218 do CTB, mas sim ao inciso II*" — um
enquadramento **mais grave** (infração grave, em vez de média). É argumentar **contra o cliente**.

A causa é um dado que falta. Nos autos de radar vêm a velocidade **medida** e a **considerada** — a
medida menos a tolerância —, e o enquadramento do art. 218 (I até 20% acima; II acima de 20% até 50%;
III acima de 50%) sai da **considerada**. O formulário coleta só a aferida; o modelo fez a conta sobre
ela (97/80 = 21,25%) e "descobriu" o inciso II.

O plano do radar chegou a prever um campo `velocidadeConsiderada` na Fase 4 e o descartou como
"duplicata semântica" de `velocidade_aferida`. **Não era**: são números diferentes, e o descarte foi
um engano.

A regra da tolerância vem de resolução do CONTRAN, que **não está na base normativa e não foi
conferida**. Por isso o sistema **não calcula a tolerância**: o cliente copia a considerada que já vem
impressa no auto.

**O que o desenho entrega:** a peça nunca sustenta um enquadramento mais grave que o do auto, e,
quando os números do próprio auto favorecem o cliente, ela os usa — pede a desclassificação para o
inciso correto ou o arquivamento por inconsistência.

## 2. Decisões travadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Correção | **Campo novo + conta feita pelo código** | Decisão do Klaus. Foi a conta do modelo que errou o lado da tese; o código decide, o modelo redige. |
| Onde fica a conta | **`pipeline/velocidade.py`, módulo puro** | Segue o padrão do radar (`verificacao.py`). Gravar o resultado no banco criaria uma segunda fonte da verdade, errada se o cliente reenviar corrigindo a velocidade. Misturar na `base_legal` juntaria o que o CTB diz com o que o caso mostra. |
| Sem a velocidade considerada | **Nenhum bloco, e a peça não discute percentual** | Nada é adivinhado; a regra geral do prompt protege. |
| Casos neutros (inciso do auto bate, é mais leve, ou não informado) | **Silêncio** | Lição do radar: um bloco dizendo "não discuta" fez o modelo discutir o tema em duas rodadas seguidas. |
| Proteção geral | **`REGRA_ENQUADRAMENTO` em toda peça** | Cobre os casos silenciosos e os sem considerada, e proíbe o modelo de calcular percentual — a causa do erro. |
| Tolerância | **Não calculada pelo sistema** | Vem de resolução do CONTRAN não conferida (risco 3 do plano do radar). |
| Campo obrigatório? | **Opcional** | Nem toda multa é de velocidade, nem todo auto é de radar. |
| `dup_guard` | **Fora** | Mesma regra dos outros dados da autuação. |

**Escopo negativo, explícito.** Não entram: calcular a tolerância; a velocidade *regulamentada* como
campo à parte (ela é a `velocidade_permitida`); enquadramentos de velocidade fora do art. 218; qualquer
mudança na base legal, na conferência de citações, no radar ou no contrato do 202.

## 3. O dado

**Formulário (`src/pages/Form.tsx`):**

- Campo **"Vel. considerada"** (`velocidade_considerada`, no estado e no banco) ao lado de "Vel.
  permitida" e "Vel. aferida": a linha passa de duas para três colunas no desktop e empilha no celular.
- Opcional; só dígitos e teto de 400 km/h, como as irmãs.
- **Validação nova:** considerada **maior** que a aferida (as duas preenchidas) → erro no campo:
  *"A velocidade considerada não pode ser maior que a aferida. Confira os números no auto."* A regra
  vive num módulo puro, `src/lib/velocidade.ts` (`consideradaMaiorQueAferida(aferida, considerada)
  -> boolean`), testado com `node --test`, como o `medidor.ts` da Fase 4.
- **Dica** sob a linha: *"No auto de radar vêm a velocidade medida e a considerada, que já desconta a
  tolerância. Copie as duas como estão."* Genérica; o Klaus confirma com um auto real.
- `normalizeData`: `velocidade_considerada` como inteiro ou `null`, igual às outras duas.

**Banco:** migration nova, `supabase/migrations/20260930000000_velocidade_considerada.sql`:
`ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS velocidade_considerada integer;` — anulável, sem
default, com `COMMENT` explicando que é a velocidade que o auto usa para o enquadramento.

**Edge `form-submit`:** `velocidade_considerada: norm.velocidade_considerada ?? null` em
`updateFields`. Fora do `dup_guard`.

**Deploy:** a migration sobe **antes** da Edge.

## 4. A conta — `pipeline/velocidade.py`

Módulo puro. **`bloco_velocidade(case: dict, enquadramento: str | None) -> Bloco | None`**, onde
`enquadramento` é a citação reconhecida pela `base_legal` (ex.: `"art. 218, III"`) e `Bloco` tem
`texto: str` e `situacao: str` (para o log).

**Só age com as três coisas:** `velocidade_permitida`, `velocidade_considerada` (inteiros positivos,
aceitos também como string de dígitos) e um enquadramento no **art. 218**. Faltando qualquer uma →
`None`.

**A conta**, exata (`fractions.Fraction`, sem arredondar antes de comparar), com os limites do texto do
art. 218:

- `excesso = (considerada − permitida) / permitida × 100`;
- inciso **I**: `0 < excesso ≤ 20`; **II**: `20 < excesso ≤ 50`; **III**: `excesso > 50`.

**Situações:**

| `situacao` | Quando | Bloco |
|---|---|---|
| `sem_infracao` | considerada ≤ permitida | Os próprios números do auto não mostram infração: velocidade considerada X km/h, máxima permitida Y km/h. **Instrução:** requerer o arquivamento do auto por inconsistência, nos termos do art. 281, § 1º, I. |
| `desclassificacao` | inciso do auto informado e **mais grave** que o da conta | Com a velocidade considerada de X km/h sobre a máxima de Y km/h, o excesso é de Z%, que corresponde ao inciso N do art. 218; o auto enquadrou a conduta no inciso M. **Instrução:** requerer a desclassificação para o inciso N e, subsidiariamente, o arquivamento por inconsistência (art. 281, § 1º, I). |
| (nenhuma → `None`) | inciso do auto igual ao da conta; mais leve que o da conta; ou não informado ("art. 218") | — |

O inciso do auto sai da citação do enquadramento (`"art. 218, III"` → `III`); ordem de gravidade
I < II < III. Percentual no texto com **uma casa decimal e vírgula** (`"21,3%"`); velocidades como
inteiros.

As duas teses citam só dispositivos que já estão na base normativa (os incisos do art. 218, que é o
enquadramento, e o art. 281, que está no rito): a conferência de citações não muda.

## 5. O prompt e o worker

**`REGRA_ENQUADRAMENTO`** (em `pipeline/prompt.py`), em **toda** peça:

> *" Nunca sustente que a conduta se enquadra em dispositivo, inciso ou gravidade mais severos do que
> os indicados no auto, e não calcule percentuais de excesso de velocidade: use apenas o que vier no
> bloco sobre o enquadramento, quando houver."*

**Ordem do system prompt:** `SYSTEM_PROMPT_BASE` + `REGRA_BASE_LEGAL` + `REGRA_ENQUADRAMENTO`
(+ `REGRA_SEM_ENQUADRAMENTO`) (+ `REGRAS_RADAR`).

**Worker (`run_dispatch_pipeline`)**, depois de `montar_base`:

```
bloco = bloco_velocidade(case, base.enquadramento)
usuario = contexto do caso
        + ("\n\n" + bloco.texto se houver bloco)
        + "\n\n" + base.texto
```

Log: `velocidade case_id=… situacao=<sem_infracao|desclassificacao|nenhuma>`. Velocidade não é dado
pessoal.

**Não muda:** `build_case_context`, `base_legal`, `conferencia`, o radar, o contrato do 202.

## 6. Testes

| Onde | O que prova |
|---|---|
| `pipeline/test_velocidade.py` | cada situação da §4; limites exatos — 20% cravado é I, 20% + ε é II, 50% cravado é II, 50% + ε é III; considerada **igual** à permitida → `sem_infracao`; considerada abaixo → `sem_infracao`; auto III com conta II → `desclassificacao`; auto I com conta II → `None`; auto igual → `None`; "art. 218" sem inciso → `None`; fora do 218 → `None`; campo ausente, zero ou não numérico → `None`; formato "21,3%"; aceita "90" como string |
| `pipeline/test_prompt.py` | `REGRA_ENQUADRAMENTO` em toda peça, na ordem da §5 |
| `src/lib/velocidade.test.ts` | `consideradaMaiorQueAferida`: maior → true; igual/menor → false; algum vazio → false |

**Verificação local** (Supabase + `functions serve` + Vite): envio com a considerada e sem ela; o
valor gravado no banco; a mensagem de erro com considerada maior que a aferida.

**Verificação real** (DeepSeek e as funções do worker, até o PDF):

1. **O caso que falhou:** aferida 97, considerada 90, limite 80, auto "Art. 218, I" — a peça não
   sustenta o inciso II nem calcula percentual.
2. Auto "Art. 218, III", aferida 125, considerada 118, limite 80 (excesso 47,5% → II) — a peça pede a
   desclassificação para o inciso II.
3. Considerada 78, limite 80 — a peça pede o arquivamento pelo art. 281, § 1º, I.
4. Sem considerada, aferida 97, limite 80, auto "Art. 218, I" — a peça não fala em percentual nem em
   outro inciso.

PDFs abertos e conferidos.

## 7. Deploy e documentação

- **Deploy** (Klaus, no terminal dele, nesta ordem): `db push` da migration; `functions deploy
  form-submit`; publicar o front (que já tem a Fase 4 pendente). O pipeline só chega ao cliente com o
  #11.
- **`CLAUDE.md`**: invariante — a peça nunca sustenta enquadramento mais grave que o do auto; o
  percentual é calculado pelo código, sobre a velocidade **considerada**.
- **`PENDENCIAS.md`**: sai "A peça pode argumentar contra o cliente na velocidade"; entra "confirmar
  com um auto real a dica do campo 'considerada'".
- **`PROGRESSO.md`**: entrada da sessão, registrando também que o descarte do `velocidadeConsiderada`
  na Fase 4 foi um engano.

## 8. Critério de pronto

- `python3 -m unittest test_verificacao test_prompt test_peca test_base_legal test_conferencia
  test_velocidade` verde; `npm run radar:test` verde; build verde; lint no baseline.
- Verificação local e as 4 verificações reais da §6 conferidas, com PDFs abertos.
