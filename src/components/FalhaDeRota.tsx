import { Component, type ErrorInfo, type ReactNode } from 'react';
import PageShell from './PageShell';

const SUPORTE_URL = import.meta.env.VITE_WHATSAPP_URL as string | undefined;

/**
 * Lê o `case_id` direto da URL, sem depender de nada que já tenha falhado.
 * Nesta tela ele é a informação mais valiosa que existe: o usuário pagou, o
 * aplicativo quebrou, e este número é o que permite achar o pedido dele.
 */
function caseIdDaUrl(): string | null {
  try {
    const daUrl = new URLSearchParams(window.location.search).get('case_id');
    if (daUrl) return daUrl;
    return localStorage.getItem('case_id');
  } catch {
    return null;
  }
}

type Props = { children: ReactNode };
type State = { falhou: boolean; recarregando: boolean };

/**
 * Rede de segurança das rotas assíncronas.
 *
 * Sem ela, um `import()` que falha derruba a árvore inteira e o usuário fica
 * com **a tela em branco** — medido: 1 nó no `<body>`, nada clicável. E o lugar
 * onde isso acontece é o pior possível: `/form` é onde se chega **depois de
 * pagar**. O caso não é hipotético — basta um deploy enquanto o usuário está no
 * Stripe para o `index.html` em cache apontar para um chunk que não existe mais.
 *
 * A recuperação de verdade para esse caso é recarregar, porque só isso busca um
 * `index.html` novo com os nomes de arquivo novos. Quem tenta primeiro é o
 * `lazyComRetentativa` em `App.tsx`; se ainda assim falhar, esta tela aparece
 * com o número do caso à mão.
 */
class FalhaDeRota extends Component<Props, State> {
  state: State = { falhou: false, recarregando: false };

  static getDerivedStateFromError(): State {
    return { falhou: true, recarregando: false };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // O técnico vai para o console; o usuário recebe o que aconteceu e o que fazer.
    console.error('Falha ao carregar a rota:', erro, info.componentStack);
  }

  private recarregar = () => {
    this.setState({ recarregando: true });
    window.location.reload();
  };

  render() {
    if (!this.state.falhou) return this.props.children;

    const caseId = caseIdDaUrl();

    return (
      <PageShell>
        {/* O `PageShell` não traz container — cada página põe o seu, e sem ele
            o cartão encostava na borda esquerda da tela. */}
        <div className="container">
          <div role="alert" className="error-message error-message--surface max-w-2xl">
            <p className="font-semibold">Não conseguimos carregar esta página.</p>
            {/* Nenhuma causa é afirmada: esta rede pega tanto o chunk que não
                chegou quanto qualquer erro de renderização, e prometer um motivo
                que o sistema não sabe é pior do que não dar motivo nenhum. */}
            <p className="mt-1 text-sm leading-snug text-foreground">
              Pode ter sido a conexão, uma atualização do site no meio do caminho,
              ou algo que não previmos. Se você já pagou,{' '}
              <strong>a cobrança está registrada</strong> — nada se perdeu.
            </p>

            {caseId && (
              <div className="field mt-4 border-t border-rule">
                <span className="field__label">Número do caso</span>
                <span className="field__value break-all">{caseId}</span>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={this.recarregar}
                disabled={this.state.recarregando}
                className={`btn ${this.state.recarregando ? 'btn--disabled' : 'btn--solid'}`}
              >
                {this.state.recarregando ? 'Recarregando…' : 'Recarregar a página'}
              </button>
              {SUPORTE_URL && (
                <a
                  href={SUPORTE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-foreground underline underline-offset-2"
                >
                  Falar com a gente
                </a>
              )}
            </div>
          </div>
        </div>
      </PageShell>
    );
  }
}

export default FalhaDeRota;
