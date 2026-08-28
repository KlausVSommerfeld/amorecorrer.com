# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Três perfis confirmados, todos pessoa física, todos com a notificação de autuação na mão:

1. **Motorista comum, multa avulsa.** Levou uma multa isolada, não tem conhecimento jurídico e parte do princípio de que recorrer dá trabalho demais. Compra uma vez e talvez nunca mais.
2. **Motorista de app / profissional** (Uber, 99, iFood, entregador, caminhoneiro). O carro é a renda; a multa é custo recorrente e a pontuação ameaça a CNH. É o perfil com maior chance de voltar.
3. **Motorista em risco de suspensão.** Já acumulou pontos e recorre por necessidade, não por economia. A urgência é o motor da compra.

Situação de uso comum aos três: sozinho, com prazo curto, diante de um documento que não entende — frequentemente no celular.

**Fora do escopo hoje:** frotas e gestores de multas corporativas não são público-alvo. Nada foi construído para volume.

## Product Purpose

Transformar uma notificação de autuação numa peça de recurso pronta para protocolar, em minutos, sem intermediário humano.

Sucesso é o usuário receber o PDF A4 no e-mail e conseguir protocolar no órgão autuador dentro do prazo. Sucesso **não** é a multa ser cancelada — a decisão é do órgão autuador e não está sob controle do produto.

## Positioning

Uma peça de recurso redigida por IA a partir do caso concreto e da legislação do CTB, por R$ 19,99, entregue em minutos.

Três razões de escolha confirmadas, contra despachante, advogado ou modelo grátis da internet:

- **Preço.** R$ 19,99 contra os R$ 150–400 de um despachante — barato o bastante para não exigir uma segunda consideração.
- **Velocidade.** Minutos, não dias. Sem fila, sem análise manual, sem esperar retorno de ninguém.
- **Fundamentação.** A peça sai do caso informado e do artigo do CTB aplicável, não de um template preenchido com achar-e-substituir.

**Não é o argumento principal:** "sem cadastro, sem conversa" é um fato do produto (ticket único, nenhuma conta de usuário), e pode ser dito como característica — mas não foi eleito como a razão pela qual alguém compra. Não construir a comunicação em cima dele.

## Operating Context

- **O documento adversário é a notificação de autuação:** campos rotulados, códigos, número do auto, placa, órgão autuador, artigo do CTB. É o objeto físico que o usuário tem em mãos ao chegar no site, e o vocabulário que ele já está lendo.
- **A ordem é fixa:** paga primeiro (Stripe), preenche o formulário depois. Não há conta, login nem área do cliente; a identidade do pedido é o `case_id` (`CASO_<uuid>`), gerado no servidor no checkout.
- **Dados exigidos no formulário:** pessoais (nome, e-mail, telefone, CPF, endereço) e do auto (órgão autuador, número do auto, placa, local, data e hora, artigo do CTB), mais a versão do usuário sobre o ocorrido.
- **Duas peças, conforme o estágio do caso.** O produto gera tanto a **defesa prévia** (protocolada no próprio órgão autuador) quanto o **recurso à JARI** (contra a penalidade já aplicada). Consequências obrigatórias: o formulário precisa coletar o estágio, e a home precisa dizer isso explicitamente. Hoje o hero pareia os dois lado a lado (`PRAZO DE DEFESA · 30 dias` sob uma peça endereçada à JARI com fundamento no art. 281), o que pode levar o usuário a protocolar a peça errada no lugar errado e perder o prazo.
- **A entrega é um e-mail com PDF A4**, para imprimir e protocolar. O produto termina no e-mail: protocolar é ato do usuário, e o prazo legal é responsabilidade dele.
- O produto não acompanha o processo, não notifica prazos e não informa o resultado.

## Capabilities and Constraints

- Web, pt-BR, Brasil. Quatro runtimes encadeados pelo `case_id` (React/Vite, Edge Functions Deno, API Express, pipeline FastAPI com DeepSeek + reportlab + SMTP), detalhados em `CLAUDE.md`. Pagamento por Stripe.
- **Ticket único:** R$ 19,99 promocional, R$ 39,99 cheio. A faixa é decidida por um prazo de 30 minutos em `sessionStorage`, no navegador — não é verificável no servidor. Decisão consciente, registrada em `CLAUDE.md`.
- **Sem conta de usuário.** Não existe histórico, segunda via self-service nem área logada.
- **Nenhuma garantia de aprovação.** O serviço não é escritório de advocacia e não presta consultoria jurídica personalizada. Isso já está declarado no FAQ e nos Termos, e precisa continuar visível **antes** do pagamento, não como letra miúda depois.
- Responsabilidade contratual do usuário (Termos): veracidade dos dados e protocolo dentro do prazo.
- LGPD: o formulário coleta CPF e endereço completo; existe página de Privacidade.
- A fila do pipeline não é durável (`BackgroundTasks` do FastAPI): um caso pode ficar preso em `generating` sem retry automático. Não prometer SLA rígido de entrega.
- **Contato:** o rodapé expõe WhatsApp e e-mail, ambos condicionados a variáveis de ambiente (`VITE_WHATSAPP_URL`, `VITE_CONTACT_EMAIL`) e ambos definidos em `.env.production` — sem a variável, o link simplesmente não renderiza.
- **Indefinido, a decidir:** política de reembolso e de segunda via, e o nível de suporte prometido nesses canais.

## Brand Commitments

- Nome **Amo Recorrer**, domínio `amorecorrer.com`.
- **A paleta é vinculante.** Ela foi extraída do favicon (`public/favicon-v2-64.png`) e está documentada em `COLOR_PALETTE.md`; nenhum matiz novo entra. Restrição declarada explicitamente pelo Klaus.
- Voz: direta, curta, afirmativa, sem juridiquês e sem promessa de resultado. A copy vigente é a referência ("Sua multa tem resposta.", "Sua multa não vai responder sozinha.").
- A direção visual em vigor ("Notificação e Resposta") e seus tokens estão registrados em `CLAUDE.md` e `src/index.css`.

## Evidence on Hand

**Pré-lançamento: nenhuma venda, nenhum cliente, nenhum recurso deferido.**

Portanto é proibido afirmar ou insinuar: número de usuários, recursos gerados, taxa de sucesso, depoimentos, avaliações, selos, logos de imprensa, parceiros ou qualquer prova social. Persuadir pelo mecanismo, pelo preço e pelo próprio documento.

Ativos reais disponíveis:
- Favicon/identidade (`public/favicon-v2*`) e a paleta derivada (`COLOR_PALETTE.md`).
- O PDF que o pipeline realmente produz (`pipeline/`) — o único "produto" exibível e verdadeiro.
- Texto legal próprio em `/terms` e `/privacy`.
- Stripe em produção (integração real, ainda sem transação de cliente).

Não existem: fotografias próprias, clientes citáveis, dados de conversão.

## Product Principles

1. **Sem prova social inventada.** Enquanto for pré-lançamento, todo número, depoimento ou selo está fora.
2. **O documento é o produto.** Mostrar a peça e o que ela contém vale mais que adjetivos sobre ela.
3. **Honestidade sobre o resultado é argumento, não risco.** "Sem garantia de aprovação" aparece antes do pagamento, dito com clareza.
4. **O caminho pagou → preencheu → recebeu não admite desvio.** Nada que se acrescente pode aumentar o atrito de quem já pagou.
5. **Quem chega está com pressa e com prazo.** Toda superfície precisa funcionar no celular, em leitura apressada, para alguém que não conhece o vocabulário do CTB.

## Accessibility & Inclusion

- Público amplo e não técnico, uso predominantemente em celular, leitura sob pressa e estresse.
- Contraste WCAG AA verificado numericamente já é prática estabelecida no projeto (duas falhas reais corrigidas em Ago/2026) e deve continuar sendo condição de commit.
- Idioma único: pt-BR. Nenhum requisito de i18n.
