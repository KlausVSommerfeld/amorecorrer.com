import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Countdown from '../components/Countdown';
import NotificacaoHero from '../components/NotificacaoHero';
import Masthead from '../components/Masthead';
import ComoFunciona from '../components/ComoFunciona';
import RecursoPreview from '../components/RecursoPreview';
import FAQ from '../components/FAQ';
import Rodape from '../components/Rodape';
import { createCheckout } from '../lib/checkout';
import { getCaseIdFromUrl } from '../lib/caseId';
import { usePromo } from '../hooks/use-promo';

const PRECO_PROMO = 'R$ 19,99';
const PRECO_CHEIO = 'R$ 39,99';

/** O campo de preço do documento, usado no hero e na faixa de fechamento. */
const CampoPreco = ({ expirado }: { expirado: boolean }) => (
  <div className="offer__cell">
    <span className="eyebrow block">
      {expirado ? 'Preço' : 'Preço promocional'}
    </span>
    <span className="price mt-1 block">
      {!expirado && <s className="price__from">{PRECO_CHEIO}</s>}
      {expirado ? PRECO_CHEIO : PRECO_PROMO}
    </span>
  </div>
);

const Home = () => {
  const { isExpired: isPromoExpired } = usePromo();
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const [showStickyCta, setShowStickyCta] = useState(false);

  useEffect(() => {
    // Detect and store case_id from URL if present
    getCaseIdFromUrl();
  }, []);

  // O CTA fixo do mobile só entra depois que o do hero sai por cima da tela.
  useEffect(() => {
    const update = () => {
      const target = heroCtaRef.current;
      if (!target) return;
      setShowStickyCta(target.getBoundingClientRect().bottom < 0);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const handlePaymentClick = async () => {
    try {
      await createCheckout(isPromoExpired ? 'full' : 'promo');
    } catch (err: unknown) {
      let message = 'Erro ao criar checkout';
      if (err instanceof Error) {
        message += ': ' + err.message;
      } else if (typeof err === 'string') {
        message += ': ' + err;
      }
      alert(message);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero — a réplica do auto e a resposta */}
      <header className="hero">
        <div className="container">
          <Masthead />

          <div className="hero__grid">
            <div className="hero__head">
              <p className="eyebrow">Notificação de autuação → recurso</p>
              <h1 className="hero__title">Sua multa tem resposta.</h1>
            </div>

            <NotificacaoHero className="hero__figure" />

            <div className="hero__body">
              <p className="hero__lead">
                Você preenche os dados do auto. A IA redige a defesa. O PDF chega
                no seu e-mail, pronto para protocolar.
              </p>

              <div className="offer">
                <CampoPreco expirado={isPromoExpired} />

                {!isPromoExpired && (
                  <div className="offer__cell">
                    <span className="eyebrow block">Prazo da promoção</span>
                    <span className="mt-1 block">
                      <Countdown />
                    </span>
                  </div>
                )}
              </div>

              <div ref={heroCtaRef} className="flex flex-col items-start gap-3">
                <button
                  onClick={handlePaymentClick}
                  className="btn btn--solid px-8 py-4 text-lg"
                >
                  Gerar meu recurso
                </button>
                <p className="note">
                  Pagamento via Stripe · Sem cadastro · Entrega por e-mail
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <ComoFunciona />

      <RecursoPreview />

      {/* Fechamento: a última chance de comprar antes do FAQ. */}
      <section className="closer on-green">
        <div className="container flex flex-col items-start gap-6">
          <span className="eyebrow">Pagamento único</span>
          <h2 className="closer__title">Sua multa não vai responder sozinha.</h2>

          <div className="offer">
            <CampoPreco expirado={isPromoExpired} />
          </div>

          <button
            onClick={handlePaymentClick}
            className="btn btn--inverse px-8 py-4 text-lg"
          >
            Gerar meu recurso
          </button>

          <p className="text-sm text-paper">
            Depois do pagamento você cai direto no{' '}
            <Link to="/form" className="underline hover:no-underline">
              formulário
            </Link>
            .
          </p>
        </div>
      </section>

      <FAQ />

      <Rodape />

      {/* CTA fixo no rodapé da viewport — só mobile, e só depois do hero. */}
      {showStickyCta && (
        <>
          <div className="cta-bar md:hidden">
            <div>
              <span className="eyebrow block">Preço</span>
              <span className="price text-xl">
                {isPromoExpired ? PRECO_CHEIO : PRECO_PROMO}
              </span>
            </div>
            <button
              onClick={handlePaymentClick}
              className="btn btn--solid whitespace-nowrap"
            >
              Gerar meu recurso
            </button>
          </div>
          {/* Reserva a altura da barra para que ela não cubra o rodapé. */}
          <div aria-hidden="true" className="h-20 md:hidden" />
        </>
      )}
    </div>
  );
};

export default Home;