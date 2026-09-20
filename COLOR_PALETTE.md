# Color Palette — Amo Recorrer

Este arquivo documenta a paleta de cores do site (tokens CSS custom properties). Ele foi atualizado para refletir a paleta extraída do ícone `public/favicon-v2-64.png` e as alterações foram aplicadas em `src/index.css`.

> Fonte de verdade: `src/index.css` (blocos `:root` e `.dark`). O Tailwind resolve tokens como `hsl(var(--primary))` conforme `tailwind.config.ts`.

---

## Paleta extraída do favicon

As 8 cores dominantes extraídas (ordem: mais frequente → menos frequente):

| # | HEX | RGB | HSL |
|--:|:---:|:---:|:---:|
| 1 | #FFFFFF | (255,255,255) | 0 0% 100% |
| 2 | #186048 | (24,96,72) | 160 60% 23.5% |
| 3 | #186030 | (24,96,48) | 140 60% 23.5% |
| 4 | #006030 | (0,96,48) | 150 100% 18.8% |
| 5 | #D83030 | (216,48,48) | 0 68.3% 51.8% |
| 6 | #A8C0A8 | (168,192,168) | 120 16% 70.6% |
| 7 | #F0F0D8 | (240,240,216) | 60 44.4% 89.4% |
| 8 | #609078 | (96,144,120) | 150 20% 47.1% |

Esses valores foram usados como base para reesquematizar os tokens do site.

---

## Mapeamento aplicado (resumo)

As variáveis CSS em `src/index.css` foram ajustadas para seguir a paleta acima. Resumo das substituições mais relevantes:

- Primary (brand): `--primary` → 160 60% 23.5% (≈ #186048)
  - `--primary-foreground` → 0 0% 100% (branco)
  - `--primary-light` → 150 20% 47.1% (≈ #609078)
  - `--primary-dark` → 160 60% 18.8% (≈ #006030)

- Secondary: `--secondary` → 150 20% 47.1% (≈ #609078)
  - `--secondary-light` → 120 16% 70.6% (≈ #A8C0A8)

- Accent / Muted: `--accent` / `--muted` → tons pálidos (#F0F0D8 / HSL 60 44.4% 89.4%)

- Destructive (erros): `--destructive` → 0 68.3% 51.8% (≈ #D83030)

- Ring / focus: alinhado ao `--primary` para consistência visual.

Observação: mantive tokens de `success`, `warning` e outros onde estavam adequados, alterando apenas os que fazem sentido para a nova identidade (primary/secondary/accent/destructive/muted).

---

## Paleta — Light (`:root`) (principalmente usada)

| Token | HSL | HEX | Observações |
|---|---:|---:|---|
| --background | 0 0% 100% | #FFFFFF | Fundo claro |
| --foreground | 0 0% 13.3% | #222222 | Texto principal |
| --primary | 160 60% 23.5% | #186048 | Brand (do favicon) |
| --primary-foreground | 0 0% 100% | #FFFFFF | — |
| --primary-light | 150 20% 47.1% | #609078 | — |
| --primary-dark | 160 60% 18.8% | #006030 | — |
| --secondary | 150 20% 47.1% | #609078 | — |
| --secondary-foreground | 0 0% 100% | #FFFFFF | — |
| --secondary-light | 120 16% 70.6% | #A8C0A8 | — |
| --muted | 60 44.4% 89.4% | #F0F0D8 | Neutro pálido |
| --muted-foreground | 150 20% 47.1% | #609078 | — |
| --accent | 60 44.4% 89.4% | #F0F0D8 | — |
| --accent-foreground | 160 60% 23.5% | #186048 | — |
| --destructive | 0 68.3% 51.8% | #D83030 | — |
| --destructive-foreground | 0 0% 100% | #FFFFFF | — |
| --border / --input | 214.3 31.8% 91.4% | #E6EEF6 | — |
| --ring | 160 60% 23.5% | #186048 | — |

---

## Paleta — Dark (`.dark`)

No modo escuro mantive a estratégia de contraste: fundo escuro, textos claros, e o `--primary` adaptado para garantir leitura. Valores principais (resumo):

| Token | HSL | HEX |
|---|---:|---:|
| --background | 222.2 84% 4.9% | #020817 |
| --foreground | 210 40% 98% | #F8FAFC |
| --primary | 120 16% 70.6% | #A8C0A8 (usado como brand claro no dark) |
| --primary-foreground | 160 60% 23.5% | #186048 |
| --secondary | 150 20% 47.1% | #609078 |
| --muted | 217.2 32.6% 17.5% | #1E293B |
| --destructive | 0 62.8% 30.6% | #7F1D1D |

---

## Uso rápido (Tailwind)

No `tailwind.config.ts` os tokens já são mapeados para `hsl(var(--...))`. Exemplos:

- `bg-primary` → `hsl(var(--primary))`
- `text-primary-foreground` → `hsl(var(--primary-foreground))`
- `border-input` → `hsl(var(--input))`

Alterações foram aplicadas diretamente em `src/index.css`; para mudar a paleta edite as HSLs lá.

---

## Próximos passos recomendados

- (opcional) Gerar uma página de preview visual (`public/palette-preview.html` ou rota `/palette`) com amostras e classes Tailwind. Útil para validação visual.
- (opcional) Ajustar saturação/claridade de `--primary` para acesso de contraste e teste com componentes reais.
- Atualizar `COLOR_PALETTE.md` novamente se fizer ajustes finos.

---

Arquivo atualizado automaticamente a partir da extração do favicon e das modificações em `src/index.css` — Nov 02, 2025.
