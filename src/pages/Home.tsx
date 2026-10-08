import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Countdown from '../components/Countdown';
import NotificacaoHero from '../components/NotificacaoHero';
import Masthead from '../components/Masthead';
import ComoFunciona from '../components/ComoFunciona';
import RecursoPreview from '../components/RecursoPreview';
import FAQ from '../components/FAQ';
import Rodape from '../components/Rodape';
import { getCaseIdFromUrl } from '../lib/caseId';
import { usePromoExpirada } from '../hooks/use-promo';
import { PRECO_CHEIO, precoVigente } from '../lib/preco';




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
      Pagamento único de {precoVigente(expirado)} via Stripe, sem cadastro. Antes,
      cinco perguntas rápidas mostram o que a sua defesa vai pedir; depois do pagamento,
      você completa os dados e o PDF chega no e-mail que informar.
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


const Home = () => {
  // Só o booleano: a home não precisa do segundo, e assinar `msLeft` a
  // re-renderizava inteira a cada tique.
  const isPromoExpired = usePromoExpirada();
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const [showStickyCta, setShowStickyCta] = useState(false);

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
                  <Link to="/questionario" className="btn btn--solid px-8 py-4 text-lg">
                    Gerar meu recurso
                  </Link>
                  <AvisoDeCompra expirado={isPromoExpired} comLista />
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

            <Link to="/questionario" className="btn btn--inverse px-8 py-4 text-lg">
              Gerar meu recurso
            </Link>

            <AvisoDeCompra expirado={isPromoExpired} />

            <p className="cta-nota">Antes do pagamento, cinco perguntas rápidas sobre o seu caso.</p>
          </div>
        </section>
      </main>

      <Rodape />

      {/* CTA fixo no rodapé da viewport — só mobile, e só depois do hero. */}
      {showStickyCta && (
        <>
          <div className="cta-bar">
            <div>
              {/* Mesmo rótulo do hero: a barra dizia só "Preço" enquanto a
                  oferta acima dizia "Preço promocional", para o mesmo valor. */}
              <span className="eyebrow block">
                {isPromoExpired ? 'Preço' : 'Preço promocional'}
              </span>
              <span className="price text-xl">{precoVigente(isPromoExpired)}</span>
            </div>
            <Link to="/questionario" className="btn btn--solid whitespace-nowrap">
              Gerar meu recurso
            </Link>
          </div>
          <div aria-hidden="true" className="cta-bar__espacador" />
        </>
      )}
    </div>
  );
};

export default Home;
