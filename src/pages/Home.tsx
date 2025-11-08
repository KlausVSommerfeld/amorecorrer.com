import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Countdown from '../components/Countdown';
import FAQ from '../components/FAQ';
import { createCheckout } from '../lib/checkout';

const Home = () => {
  const [isPromoExpired, setIsPromoExpired] = useState(false);

  useEffect(() => {
    const checkPromoStatus = () => {
      const stored = sessionStorage.getItem('promo_expires_at');
      if (stored) {
        const expiresAt = parseInt(stored);
        const now = Date.now();
        setIsPromoExpired(now >= expiresAt);
      }
    };

    checkPromoStatus();
    const interval = setInterval(checkPromoStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  // Recuperação do case_id: exemplo usando localStorage, pode ser adaptado conforme fluxo real
  const getCaseId = () => {
    // Exemplo: buscar case_id do localStorage, sessionStorage, ou contexto
    // Ajuste conforme sua lógica real
    return localStorage.getItem('case_id') || '';
  };

  const handlePaymentClick = async () => {
    if (isPromoExpired) return;
    const caseId = getCaseId();
    if (!caseId) {
      alert('ID do caso não encontrado. Por favor, preencha o formulário primeiro.');
      return;
    }
    try {
      await createCheckout(caseId);
    } catch (err: any) {
      alert('Erro ao criar checkout: ' + (err?.message || err));
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="hero-gradient py-20 text-white">
        <div className="container text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Recurso de multa em minutos.
          </h1>
          <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto leading-relaxed">
            Preencha um formulário. Nossa IA monta sua defesa e enviamos o PDF por e-mail.
          </p>
          
          <div className="mb-8">
            <div className="text-lg mb-4">
              <span className="line-through text-primary-light">De R$ 39,99</span>
              <span className="text-3xl font-bold ml-4">por R$ 19,99</span>
            </div>
            <div className="flex justify-center items-center gap-4 flex-wrap">
              <span className="text-lg">Promoção válida por:</span>
              <Countdown />
            </div>
          </div>

          <div className="space-y-4">
            {!isPromoExpired ? (
              <button
                onClick={handlePaymentClick}
                className="btn-primary text-lg px-8 py-4 inline-block"
              >
                🚀 Garantir preço e iniciar
              </button>
            ) : (
              <button className="btn-disabled text-lg px-8 py-4 inline-block cursor-not-allowed">
                Promoção encerrada - tente novamente mais tarde
              </button>
            )}
            <p className="text-sm opacity-90">
              Processamento seguro via Stripe
            </p>
          </div>
        </div>
      </section>

      {/* Como Funciona */}
      <section className="py-16">
        <div className="container">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Como Funciona - 5 Passos Simples
          </h2>
          
          <div className="grid md:grid-cols-5 gap-8 max-w-6xl mx-auto">
            {[
              {
                step: "1",
                title: "Pagamento",
                description: "Pague R$ 19,99 via Stripe. Após sucesso, você será redirecionado ao formulário."
              },
              {
                step: "2",
                title: "Formulário",
                description: "Preencha o formulário com seus dados pessoais e informações do auto de infração."
              },
              {
                step: "3",
                title: "IA Jurídica",
                description: "Nossa IA especializada redige a peça seguindo o CTB e linguagem jurídica formal."
              },
              {
                step: "4",
                title: "Formatação",
                description: "Higienização e formatação A4 com título e rodapé automáticos."
              },
              {
                step: "5",
                title: "Entrega",
                description: "PDF no seu e-mail, pronto para imprimir e protocolar."
              }
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* O que você recebe */}
      <section className="py-16 bg-accent/20">
        <div className="container">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            O Que Você Recebe
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center p-6 bg-card rounded-lg shadow-md">
              <div className="text-4xl mb-4">📄</div>
              <h3 className="text-xl font-semibold mb-3">PDF A4 do Recurso</h3>
              <p className="text-muted-foreground">Documento completo e formatado, pronto para protocolar</p>
            </div>
            
            <div className="text-center p-6 bg-card rounded-lg shadow-md">
              <div className="text-4xl mb-4">💻</div>
              <h3 className="text-xl font-semibold mb-3">HTML da Peça (Opcional)</h3>
              <p className="text-muted-foreground">Versão digital para consulta online</p>
            </div>
            
            <div className="text-center p-6 bg-card rounded-lg shadow-md">
              <div className="text-4xl mb-4">📧</div>
              <h3 className="text-xl font-semibold mb-3">E-mail com Resumo</h3>
              <p className="text-muted-foreground">Dados do órgão, placa, data/hora e artigo do CTB</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Checkout */}
      <section className="py-16 bg-secondary text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Pronto para Começar?
          </h2>
          <p className="text-xl mb-8">
            Aproveite o preço promocional válido apenas por tempo limitado.
          </p>
          
          {!isPromoExpired ? (
            <button
              onClick={handlePaymentClick}
              className="btn-primary bg-white text-secondary hover:bg-gray-100 text-lg px-8 py-4 mb-4"
            >
              💳 Pagar R$ 19,99
            </button>
          ) : (
            <button className="btn-disabled text-lg px-8 py-4 mb-4">
              Promoção encerrada - tente novamente mais tarde
            </button>
          )}
          
          <p className="text-sm opacity-90">
            Após pagamento aprovado, você será redirecionado ao{' '}
            <Link to="/form" className="underline hover:no-underline">
              formulário
            </Link>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <FAQ />

      {/* Footer */}
      <footer className="bg-primary text-white py-12">
        <div className="container">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold mb-4">Amo Recorrer</h3>
            <p className="text-primary-foreground/80 max-w-2xl mx-auto">
              Automatização inteligente para recursos de multa. 
              Tecnologia jurídica ao seu alcance.
            </p>
          </div>
          
          <div className="flex flex-col md:flex-row justify-center items-center gap-6 mb-8">
            <a 
              href={import.meta.env.VITE_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary-light transition-colors"
            >
              📱 WhatsApp
            </a>
            <a 
              href={`mailto:${import.meta.env.VITE_CONTACT_EMAIL}`}
              className="hover:text-primary-light transition-colors"
            >
              ✉️ {import.meta.env.VITE_CONTACT_EMAIL}
            </a>
          </div>
          
          <div className="text-center text-sm text-primary-foreground/70">
            <p className="mb-4">
              <strong>Aviso Legal:</strong> Serviço automatiza a geração do documento com base nas informações fornecidas. 
              Leia os <Link to="/terms" className="underline hover:no-underline">Termos</Link> e a{' '}
              <Link to="/privacy" className="underline hover:no-underline">Política de Privacidade</Link>.
            </p>
            <p>&copy; {new Date().getFullYear()} Amo Recorrer. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;