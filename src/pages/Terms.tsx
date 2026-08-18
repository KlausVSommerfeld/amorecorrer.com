import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell';

const Terms = () => {
  return (
    <PageShell>
      <div className="container">
        <div className="legal">

          <div className="page__head">
            <span className="eyebrow">Documento</span>
            <h1 className="page__title">Termos de uso</h1>
          </div>

          <div className="space-y-2">
            <section>
              <h2 className="legal__h2">1. Aceite dos Termos</h2>
              <p>
                Ao utilizar os serviços da Amo Recorrer, você concorda com estes Termos de Uso. 
                Se não concordar com qualquer parte destes termos, não utilize nossos serviços.
              </p>
            </section>

            <section>
              <h2 className="legal__h2">2. Descrição do Serviço</h2>
              <p>
                A Amo Recorrer oferece um serviço automatizado de geração de recursos de multa 
                de trânsito. Nosso sistema utiliza inteligência artificial para criar documentos 
                jurídicos com base nas informações fornecidas pelo usuário.
              </p>
              <p>
                <strong>Importante:</strong> Este serviço automatiza apenas a criação do documento. 
                O resultado do recurso depende das circunstâncias específicas de cada caso e da 
                análise do órgão competente.
              </p>
            </section>

            <section>
              <h2 className="legal__h2">3. Responsabilidades do Usuário</h2>
              <ul className="legal__list">
                <li>Fornecer informações verdadeiras e precisas</li>
                <li>Verificar a exatidão dos dados antes do envio</li>
                <li>Utilizar o documento gerado conforme a legislação</li>
                <li>Protocolar o recurso dentro dos prazos legais</li>
                <li>Não utilizar o serviço para fins fraudulentos ou ilegais</li>
              </ul>
            </section>

            <section>
              <h2 className="legal__h2">4. Limitações de Responsabilidade</h2>
              <p>
                A Amo Recorrer não garante a aprovação dos recursos gerados. Nossa responsabilidade 
                se limita à entrega do documento conforme as informações fornecidas.
              </p>
              <p>
                Não nos responsabilizamos por:
              </p>
              <ul className="legal__list">
                <li>Decisões dos órgãos de trânsito</li>
                <li>Perdas de prazo para protocolo</li>
                <li>Informações incorretas fornecidas pelo usuário</li>
                <li>Problemas de conectividade ou entrega de e-mail</li>
              </ul>
            </section>

            <section>
              <h2 className="legal__h2">5. Política de Pagamento</h2>
              <p>
                O pagamento é processado via Stripe antes da geração do documento. 
                Após a confirmação do pagamento, o usuário será redirecionado ao formulário.
              </p>
              <p>
                <strong>Política de Reembolso:</strong> Devido à natureza digital e instantânea 
                do serviço, não oferecemos reembolsos após a entrega do documento.
              </p>
            </section>

            <section>
              <h2 className="legal__h2">6. Propriedade Intelectual</h2>
              <p>
                Todo o conteúdo e tecnologia da Amo Recorrer são protegidos por direitos autorais. 
                É proibida a reprodução ou redistribuição sem autorização expressa.
              </p>
            </section>

            <section>
              <h2 className="legal__h2">7. Modificações nos Termos</h2>
              <p>
                Reservamo-nos o direito de modificar estes termos a qualquer momento. 
                As alterações entram em vigor imediatamente após a publicação.
              </p>
            </section>

            <section>
              <h2 className="legal__h2">8. Lei Aplicável</h2>
              <p>
                Estes termos são regidos pela legislação brasileira. Qualquer disputa 
                será resolvida no foro da comarca competente.
              </p>
            </section>

            <section>
              <h2 className="legal__h2">9. Contato</h2>
              <p>
                Para dúvidas sobre estes termos, entre em contato:
              </p>
              <ul className="legal__list legal__list--plain">
                <li>📧 Email: {import.meta.env.VITE_CONTACT_EMAIL}</li>
                <li>📱 WhatsApp: <a href={import.meta.env.VITE_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" >Clique aqui</a></li>
              </ul>
            </section>

            <div className="mt-10 border-t border-rule pt-6 text-sm">
              <p>Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default Terms;