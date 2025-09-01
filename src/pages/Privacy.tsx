import { Link } from 'react-router-dom';

const Privacy = () => {
  return (
    <div className="min-h-screen py-12 bg-background">
      <div className="container max-w-4xl mx-auto">
        <div className="bg-card rounded-lg shadow-lg p-8">
          <div className="mb-8">
            <Link to="/" className="text-primary hover:text-primary-dark transition-colors">
              ← Voltar ao início
            </Link>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold mb-8">Política de Privacidade</h1>

          <div className="prose prose-gray max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Informações Gerais</h2>
              <p>
                Esta Política de Privacidade descreve como a Amo Recorrer coleta, 
                utiliza e protege suas informações pessoais em conformidade com a 
                Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. Dados Coletados</h2>
              <p>Coletamos os seguintes tipos de informações:</p>
              
              <h3 className="text-lg font-semibold mt-6 mb-3">2.1 Dados Pessoais</h3>
              <ul className="list-disc list-inside space-y-2">
                <li>Nome completo</li>
                <li>CPF e CNH</li>
                <li>E-mail e telefone</li>
                <li>Endereço completo</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-3">2.2 Dados do Veículo e Infração</h3>
              <ul className="list-disc list-inside space-y-2">
                <li>Placa do veículo</li>
                <li>Dados do auto de infração</li>
                <li>Informações sobre a penalidade</li>
                <li>Justificativa do recurso</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-3">2.3 Dados Técnicos</h3>
              <ul className="list-disc list-inside space-y-2">
                <li>Endereço IP</li>
                <li>Dados de navegação</li>
                <li>Cookies técnicos</li>
                <li>Token de identificação da sessão</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. Finalidade do Tratamento</h2>
              <p>Utilizamos seus dados para:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Gerar o documento de recurso personalizado</li>
                <li>Processar o pagamento via Stripe</li>
                <li>Enviar o PDF por e-mail</li>
                <li>Fornecer suporte ao cliente</li>
                <li>Cumprir obrigações legais</li>
                <li>Melhorar nossos serviços</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Base Legal</h2>
              <p>O tratamento dos seus dados se baseia em:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Execução de contrato:</strong> Para prestação do serviço contratado</li>
                <li><strong>Legítimo interesse:</strong> Para melhorias do serviço e segurança</li>
                <li><strong>Cumprimento de obrigação legal:</strong> Quando exigido por lei</li>
                <li><strong>Consentimento:</strong> Para comunicações promocionais (quando aplicável)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Compartilhamento de Dados</h2>
              <p>Seus dados podem ser compartilhados com:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Stripe:</strong> Para processamento de pagamentos</li>
                <li><strong>Provedores de e-mail:</strong> Para entrega dos documentos</li>
                <li><strong>Serviços de hosting:</strong> Para funcionamento da plataforma</li>
                <li><strong>Autoridades:</strong> Quando exigido por lei</li>
              </ul>
              <p className="mt-4">
                <strong>Não vendemos</strong> seus dados pessoais para terceiros.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Retenção de Dados</h2>
              <p>Mantemos seus dados pelo período necessário para:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Prestação do serviço contratado</li>
                <li>Cumprimento de obrigações legais (até 5 anos)</li>
                <li>Exercício de direitos em processos judiciais</li>
                <li>Finalidades específicas mediante consentimento</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. Segurança</h2>
              <p>Implementamos medidas de segurança como:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Criptografia de dados em trânsito e repouso</li>
                <li>Controle de acesso restrito</li>
                <li>Monitoramento de segurança</li>
                <li>Backups seguros</li>
                <li>Atualizações regulares de segurança</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. Seus Direitos</h2>
              <p>Você tem direito a:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Acesso:</strong> Saber quais dados temos sobre você</li>
                <li><strong>Retificação:</strong> Corrigir dados incorretos</li>
                <li><strong>Eliminação:</strong> Solicitar exclusão dos dados</li>
                <li><strong>Portabilidade:</strong> Receber seus dados em formato estruturado</li>
                <li><strong>Oposição:</strong> Se opor ao tratamento em certas situações</li>
                <li><strong>Revisão:</strong> Solicitar revisão de decisões automatizadas</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">9. Cookies</h2>
              <p>
                Utilizamos cookies técnicos necessários para o funcionamento do site, 
                incluindo controle de sessão e timer promocional. Estes cookies não 
                coletam informações pessoais identificáveis.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">10. Alterações na Política</h2>
              <p>
                Esta política pode ser atualizada periodicamente. Mudanças significativas 
                serão comunicadas através do nosso site ou por e-mail.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">11. Contato e Exercício de Direitos</h2>
              <p>
                Para exercer seus direitos ou esclarecer dúvidas sobre esta política:
              </p>
              <ul className="list-none space-y-2">
                <li>📧 Email: {import.meta.env.VITE_CONTACT_EMAIL}</li>
                <li>📱 WhatsApp: <a href={import.meta.env.VITE_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-dark">Clique aqui</a></li>
              </ul>
              <p className="mt-4">
                Responderemos sua solicitação em até 15 dias úteis, conforme a LGPD.
              </p>
            </section>

            <div className="text-sm text-muted-foreground mt-8 pt-8 border-t border-border">
              <p>Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Privacy;