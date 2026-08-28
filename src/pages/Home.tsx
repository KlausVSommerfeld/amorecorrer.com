import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Countdown from '../components/Countdown';
import NotificacaoHero from '../components/NotificacaoHero';
import Masthead from '../components/Masthead';
import ComoFunciona from '../components/ComoFunciona';
import RecursoPreview from '../components/RecursoPreview';
import FAQ from '../components/FAQ';
import Rodape from '../components/Rodape';
import { createCheckout, CheckoutError, type CheckoutErrorCode } from '../lib/checkout';
import { getCaseIdFromUrl } from '../lib/caseId';
import { usePromoExpirada } from '../hooks/use-promo';
import { PRECO_CHEIO, precoVigente } from '../lib/preco';

/**
 * Teto de espera do checkout. Acima disso a rede provavelmente morreu em
 * silêncio: sem este relógio, o botão fica travado em "Abrindo pagamento…"
 * indefinidamente e o usuário não tem como sair do estado.
 */
const TIMEOUT_CHECKOUT_MS = 15000;

const SUPORTE_URL = import.meta.env.VITE_WHATSAPP_URL as string | undefined;

/** Qual dos três CTAs disparou a ação — o erro aparece junto de quem foi clicado. */
type CheckoutOrigem = 'hero' | 'closer' | 'barra';

type CheckoutEstado =
  | { fase: 'ocioso' }
  | { fase: 'enviando'; origem: CheckoutOrigem }
  | { fase: 'erro'; origem: CheckoutOrigem; mensagem: string; tentativas: number };

/**
 * Uma frase por causa. Nenhuma delas mostra status HTTP, corpo de resposta ou
 * nome de variável: o técnico vai para o console, o usuário recebe o que
 * aconteceu e o que fazer.
 */
const MENSAGEM_POR_CAUSA: Record<CheckoutErrorCode, string> = {
  config: 'O pagamento está indisponível no momento.',
  offline: 'Parece que você está sem internet.',
  timeout: 'O pagamento demorou demais para responder.',
  server: 'O sistema de pagamento não respondeu como esperado.',
  response: 'O sistema de pagamento não devolveu o link de pagamento.',
  unknown: 'Algo deu errado no caminho.'
};

function mensagemDaFalha(erro: unknown): string {
  if (erro instanceof DOMException && erro.name === 'TimeoutError') {
    return MENSAGEM_POR_CAUSA.timeout;
  }
  if (erro instanceof CheckoutError) {
    return MENSAGEM_POR_CAUSA[erro.code] ?? MENSAGEM_POR_CAUSA.unknown;
  }
  return MENSAGEM_POR_CAUSA.unknown;
}

/** O campo de preço do documento, usado no hero e na faixa de fechamento. */
const CampoPreco = ({ expirado }: { expirado: boolean }) => (
  <div className="offer__cell">
    <span className="eyebrow block">
      {expirado ? 'Preço' : 'Preço promocional'}
    </span>
    <span className="price mt-1 block">
      {!expirado && <s className="price__from">{PRECO_CHEIO}</s>}
      {precoVigente(expirado)}
    </span>
  </div>
);

/**
 * O que o usuário precisa saber antes de pagar, e não depois. A ressalva vinha
 * colapsada no FAQ e repetida no rodapé — depois dos dois botões de compra.
 * Contra um despachante que promete resultado, dizer isto antes é argumento.
 */
const AvisoDeCompra = ({
  expirado,
  comLista = false
}: {
  expirado: boolean;
  comLista?: boolean;
}) => (
  <div className="flex flex-col items-start gap-3">
    <p className="cta-aviso">
      Sem garantia de deferimento: quem decide é o órgão autuador.
    </p>
    <p className="cta-nota">
      Pagamento único de {precoVigente(expirado)} via Stripe, sem cadastro. Depois
      você preenche o formulário e o PDF chega no e-mail que informar ali.
    </p>
    {comLista && (
      <div className="field">
        <span className="field__label">Você vai precisar de</span>
        <span className="field__value max-w-[46ch] text-sm sm:text-base">
          CPF · endereço · nº do auto · placa · data · artigo do CTB
        </span>
      </div>
    )}
  </div>
);

/**
 * A falha do checkout, no lugar do `alert()` nativo. Fundo opaco porque este
 * bloco também aparece sobre a faixa verde, onde o vermelho translúcido embaça.
 */
const FalhaCheckout = ({
  mensagem,
  tentativas,
  aoTentarDeNovo
}: {
  mensagem: string;
  tentativas: number;
  aoTentarDeNovo: () => void;
}) => (
  <div role="alert" className="error-message error-message--surface w-full max-w-md">
    <p className="font-semibold">Não foi possível abrir o pagamento.</p>
    <p className="mt-1 text-sm leading-snug text-foreground">
      {mensagem} Nada foi cobrado.
    </p>
    <div className="mt-3 flex flex-wrap items-center gap-4">
      <button type="button" onClick={aoTentarDeNovo} className="btn btn--ghost">
        Tentar de novo
      </button>
      {/* Só depois da segunda falha seguida: antes disso, tentar de novo resolve. */}
      {tentativas >= 2 && SUPORTE_URL && (
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
);

const Home = () => {
  // Só o booleano: a home não precisa do segundo, e assinar `msLeft` a
  // re-renderizava inteira a cada tique.
  const isPromoExpired = usePromoExpirada();
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const [showStickyCta, setShowStickyCta] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutEstado>({ fase: 'ocioso' });

  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const montadoRef = useRef(true);
  /**
   * Trava de reentrância. Precisa ser ref, não estado: os dois toques de um
   * duplo clique caem no mesmo tick, antes do React re-renderizar, e um teste
   * com `checkout.fase` deixou as duas chamadas passarem — dois `case_id`,
   * duas sessões Stripe.
   */
  const emVooRef = useRef(false);
  // Falhas seguidas. Zera no sucesso; a partir da segunda, oferecemos suporte.
  const tentativasRef = useRef(0);

  useEffect(() => {
    // Detect and store case_id from URL if present
    getCaseIdFromUrl();
  }, []);

  /**
   * O CTA fixo entra quando o do hero não está em tela — dos dois lados.
   *
   * `bottom < 0` é o caso comum: o botão do hero subiu e saiu. `top > altura` é
   * o celular deitado: medido em 844×390, o botão do hero nasce a 453px numa
   * dobra de 390px, ou seja, já começa fora da tela. Só com a primeira metade
   * da condição, a barra só acendia depois de o usuário rolar por cima de um
   * botão que ele nunca chegou a ver — uma faixa inteira de rolagem sem nenhum
   * CTA visível, justamente no caso que a guarda de `max-height` no CSS existe
   * para cobrir.
   *
   * Foi tentado com `IntersectionObserver` e não serve: ele só reporta quando a
   * interseção MUDA, e os dois casos acima são ambos `isIntersecting: false`.
   * Numa rolagem instantânea de um para o outro — âncora, ou recarga com a
   * posição restaurada — nenhum callback dispara e a barra nunca aparece.
   * Medido: com rolagem gradual funcionava, com salto não.
   */
  useEffect(() => {
    let agendado = false;

    const avaliar = () => {
      agendado = false;
      const alvo = heroCtaRef.current;
      if (!alvo) return;
      const caixa = alvo.getBoundingClientRect();
      setShowStickyCta(caixa.bottom < 0 || caixa.top > window.innerHeight);
    };

    // No máximo uma leitura de layout por quadro.
    const agendar = () => {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(avaliar);
    };

    avaliar();
    window.addEventListener('scroll', agendar, { passive: true });
    window.addEventListener('resize', agendar);
    return () => {
      window.removeEventListener('scroll', agendar);
      window.removeEventListener('resize', agendar);
    };
  }, []);

  // Requisição pendente não sobrevive à saída da página (o link do formulário
  // desmonta a Home): aborta o fetch e mata o relógio.
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const iniciarCheckout = useCallback(
    async (origem: CheckoutOrigem) => {
      // O `disabled` do botão barra o segundo toque só depois do render; esta
      // trava barra no mesmo tick. Cada chamada que passa cria um `case_id` e
      // uma sessão Stripe a mais.
      if (emVooRef.current) return;
      emVooRef.current = true;

      setCheckout({ fase: 'enviando', origem });

      const controller = new AbortController();
      abortRef.current = controller;

      // O relógio vale para a operação inteira, não só para o `fetch`: antes
      // dele `createCheckout` ainda espera a sessão anônima e os headers do
      // Supabase Auth, que o `signal` não alcança. Sem esta corrida, um Auth
      // pendurado trava o botão em "Abrindo pagamento…" para sempre.
      const expirou = new Promise<never>((_, reject) => {
        timeoutRef.current = window.setTimeout(() => {
          controller.abort(new DOMException('Tempo esgotado', 'TimeoutError'));
          reject(new DOMException('Tempo esgotado', 'TimeoutError'));
        }, TIMEOUT_CHECKOUT_MS);
      });

      try {
        await Promise.race([
          createCheckout(isPromoExpired ? 'full' : 'promo', {
            signal: controller.signal
          }),
          expirou
        ]);
        // Sucesso é sair da página. O botão fica em "Abrindo pagamento…" de
        // propósito até o navegador navegar: nada de voltar a "clicável".
        tentativasRef.current = 0;
      } catch (erro) {
        // Só a falha destrava: no sucesso o navegador está saindo da página, e
        // reabrir o botão nesse intervalo é convidar uma segunda sessão Stripe.
        emVooRef.current = false;

        // Abortado pela desmontagem: não há mais interface para avisar.
        if (!montadoRef.current) return;
        if (erro instanceof DOMException && erro.name === 'AbortError') return;

        tentativasRef.current += 1;
        setCheckout({
          fase: 'erro',
          origem,
          mensagem: mensagemDaFalha(erro),
          tentativas: tentativasRef.current
        });
      } finally {
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        abortRef.current = null;
      }
    },
    [isPromoExpired]
  );

  const enviando = checkout.fase === 'enviando';
  const erroEm = (origem: CheckoutOrigem) =>
    checkout.fase === 'erro' && checkout.origem === origem ? checkout : null;

  const erroHero = erroEm('hero');
  const erroCloser = erroEm('closer');
  const erroBarra = erroEm('barra');

  return (
    <div className="min-h-screen">
      {/* O `<header>` é só o masthead: antes ele embrulhava o hero inteiro, e
          com isso o `<h1>` da página ficava dentro do banner — o título do
          conteúdo morando na moldura. */}
      <header className="hero__top">
        <div className="container">
          <a href="#conteudo" className="skip">
            Pular para o conteúdo
          </a>
          <Masthead />
        </div>
      </header>

      {/* Sem `<main>`, a lista de landmarks de um leitor de tela oferecia só
          banner, nav e rodapé: as cinco seções da página ficavam fora de
          qualquer região. Cada uma agora se nomeia pelo próprio título, o que
          também desambigua os três botões "Gerar meu recurso" na lista de
          controles. */}
      <main id="conteudo">
        <section className="hero" aria-labelledby="hero-titulo">
          <div className="container">
            <div className="hero__grid">
              <div className="hero__head">
                <p className="eyebrow">Notificação de autuação → recurso</p>
                <h1 id="hero-titulo" className="hero__title">Sua multa tem resposta.</h1>
              </div>

              <NotificacaoHero className="hero__figure" />

              <div className="hero__body">
                <p className="hero__lead">
                  Você preenche os dados do auto. A IA redige a defesa. O PDF chega
                  no seu e-mail, pronto para protocolar.
                </p>

                <div className="offer">
                  <CampoPreco expirado={isPromoExpired} />

                  {/* Expirada, a célula não some: some o motivo do preço ter
                      mudado. O usuário que voltou depois do almoço merece ler
                      o que aconteceu, não descobrir um número diferente. */}
                  <div className="offer__cell">
                    <span className="eyebrow block">
                      {isPromoExpired ? 'Promoção de lançamento' : 'Prazo da promoção'}
                    </span>
                    <span className="mt-1 block">
                      {isPromoExpired ? (
                        <span className="field__value">Encerrada</span>
                      ) : (
                        <Countdown />
                      )}
                    </span>
                  </div>
                </div>

                <div ref={heroCtaRef} className="flex w-full flex-col items-start gap-3">
                  <button
                    type="button"
                    onClick={() => iniciarCheckout('hero')}
                    disabled={enviando}
                    aria-busy={enviando}
                    className={`btn ${enviando ? 'btn--disabled' : 'btn--solid'} px-8 py-4 text-lg`}
                  >
                    {enviando ? 'Abrindo pagamento…' : 'Gerar meu recurso'}
                  </button>
                  <AvisoDeCompra expirado={isPromoExpired} comLista />
                  {erroHero && (
                    <FalhaCheckout
                      mensagem={erroHero.mensagem}
                      tentativas={erroHero.tentativas}
                      aoTentarDeNovo={() => iniciarCheckout('hero')}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <ComoFunciona />

        <RecursoPreview />

        {/* O FAQ vem antes do fechamento: o sobretítulo dele diz "Antes de pagar",
            e depois dos dois CTAs isso era literalmente falso. É também onde a
            ressalva de garantia é explicada por extenso. */}
        <FAQ />

        {/* Fechamento: a última chance de comprar, agora com as dúvidas já lidas. */}
        <section className="closer on-green" aria-labelledby="fechamento-titulo">
          <div className="container flex flex-col items-start gap-6">
            <span className="eyebrow">Pagamento único</span>
            <h2 id="fechamento-titulo" className="closer__title">
              Sua multa não vai responder sozinha.
            </h2>

            <div className="offer">
              <CampoPreco expirado={isPromoExpired} />
            </div>

            <button
              type="button"
              onClick={() => iniciarCheckout('closer')}
              disabled={enviando}
              aria-busy={enviando}
              className={`btn ${enviando ? 'btn--disabled' : 'btn--inverse'} px-8 py-4 text-lg`}
            >
              {enviando ? 'Abrindo pagamento…' : 'Gerar meu recurso'}
            </button>

            {erroCloser && (
              <FalhaCheckout
                mensagem={erroCloser.mensagem}
                tentativas={erroCloser.tentativas}
                aoTentarDeNovo={() => iniciarCheckout('closer')}
              />
            )}

            <AvisoDeCompra expirado={isPromoExpired} />

            <p className="cta-nota">
              Depois do pagamento você cai direto no{' '}
              <Link to="/form" className="underline hover:no-underline">
                formulário
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <Rodape />

      {/* CTA fixo no rodapé da viewport — só mobile, e só depois do hero. */}
      {showStickyCta && (
        <>
          <div className="cta-bar">
            {erroBarra ? (
              // Não cabe o bloco inteiro numa barra de 73px: aqui a falha vira
              // uma linha, e o próprio botão vira o "tentar de novo".
              <p role="alert" className="text-sm leading-snug text-destructive">
                Não foi possível abrir o pagamento. Nada foi cobrado.
              </p>
            ) : (
              <div>
                {/* Mesmo rótulo do hero: a barra dizia só "Preço" enquanto a
                    oferta acima dizia "Preço promocional", para o mesmo valor. */}
                <span className="eyebrow block">
                  {isPromoExpired ? 'Preço' : 'Preço promocional'}
                </span>
                <span className="price text-xl">{precoVigente(isPromoExpired)}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => iniciarCheckout('barra')}
              disabled={enviando}
              aria-busy={enviando}
              className={`btn ${enviando ? 'btn--disabled' : 'btn--solid'} whitespace-nowrap`}
            >
              {enviando ? 'Abrindo…' : erroBarra ? 'Tentar de novo' : 'Gerar meu recurso'}
            </button>
          </div>
          <div aria-hidden="true" className="cta-bar__espacador" />
        </>
      )}
    </div>
  );
};

export default Home;
