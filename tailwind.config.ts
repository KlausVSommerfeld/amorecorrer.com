import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	// O container do core plugin gera uma regra `.container` que colide com a
	// definida em src/index.css (@layer components). Duas regras de mesmo nome,
	// vencedor decidido pela ordem do arquivo. Fica só a do index.css.
	corePlugins: {
		container: false
	},
	theme: {
		extend: {
			fontFamily: {
				// Archivo: grotesca institucional/de sinalização — display e UI.
				display: ['"Archivo Variable"', 'system-ui', 'sans-serif'],
				sans: ['"Archivo Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
				// IBM Plex Mono: placa, artigo do CTB, nº do auto, case_id, cronômetro.
				mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
				// Source Serif 4: só dentro do documento gerado e citações do CTB.
				serif: ['"Source Serif 4"', 'Georgia', 'serif']
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				rule: 'hsl(var(--rule))',
				stamp: 'hsl(var(--stamp))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				paper: {
					DEFAULT: 'hsl(var(--paper))',
					foreground: 'hsl(var(--paper-foreground))'
				},
				// A faixa verde (fechamento e rodapé) e o material claro sobre ela.
				// Separada de `primary` porque no tema escuro a faixa continua verde
				// enquanto o botão clareia — ver o comentário em src/index.css.
				band: {
					DEFAULT: 'hsl(var(--band))',
					deep: 'hsl(var(--band-deep))',
					ink: 'hsl(var(--band-ink))',
					paper: 'hsl(var(--band-paper))'
				},
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
					light: 'hsl(var(--primary-light))',
					dark: 'hsl(var(--primary-dark))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
					light: 'hsl(var(--secondary-light))',
					dark: 'hsl(var(--secondary-dark))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				// Sequência de carregamento do hero: a notificação assenta, a folha
				// do recurso desliza por cima, o carimbo cai. Uma vez, no load.
				'notice-settle': {
					from: { opacity: '0', transform: 'translateY(-8px) rotate(-1.5deg)' },
					to: { opacity: '1', transform: 'translateY(0) rotate(-1.5deg)' }
				},
				'sheet-slide': {
					from: { opacity: '0', transform: 'translateY(24px)' },
					to: { opacity: '1', transform: 'translateY(0)' }
				},
				// O carimbo é um impacto, não um objeto desacelerando — e o gesto
				// já está inteiro nos keyframes: cai grande e torto (1.6, -12°),
				// bate e comprime abaixo do tamanho final (0.96), assenta (1.0).
				// A curva antiga somava `y1 = 1.4` **por cima** disso: dois
				// overshoots empilhados, que é o que faz uma animação soar a mola
				// de brinquedo em vez de borracha em papel. Agora cada trecho tem
				// a sua desaceleração e a compressão vem só da geometria.
				'stamp-drop': {
					'0%': {
						opacity: '0',
						transform: 'scale(1.6) rotate(-12deg)',
						// Queda: exponencial, chega rápido e freia no contato.
						animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)'
					},
					'70%': {
						opacity: '1',
						transform: 'scale(0.96) rotate(-6deg)',
						// Recuperação da compressão: mais curta e mais suave.
						animationTimingFunction: 'cubic-bezier(0.33, 1, 0.68, 1)'
					},
					'100%': { opacity: '1', transform: 'scale(1) rotate(-6deg)' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'notice-settle': 'notice-settle 180ms ease-out both',
				'sheet-slide': 'sheet-slide 240ms cubic-bezier(.2,.7,.3,1) 180ms both',
				// Sem função de tempo no atalho: quem manda são as declaradas por keyframe.
				'stamp-drop': 'stamp-drop 200ms linear 420ms both'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
