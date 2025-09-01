import { useState } from 'react';

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: "Quais dados preciso fornecer?",
      answer: "Você precisa fornecer seus dados pessoais (nome, email, telefone, CPF, endereço) e os dados do auto de infração (órgão autuador, número do auto, placa do veículo, local, data/hora da infração, etc.)."
    },
    {
      question: "Como recebo o recurso?",
      answer: "O recurso será enviado por e-mail em formato PDF A4, pronto para imprimir e protocolar junto ao órgão competente."
    },
    {
      question: "O pagamento é seguro?",
      answer: "Sim, todos os pagamentos são processados pela Stripe, que segue os mais altos padrões de segurança PCI DSS para proteção de dados financeiros."
    },
    {
      question: "Quanto tempo demora para receber?",
      answer: "Após o pagamento e preenchimento do formulário, o recurso é gerado automaticamente pela nossa IA e enviado por e-mail em alguns minutos."
    },
    {
      question: "O recurso tem garantia de aprovação?",
      answer: "Nosso serviço automatiza a criação do documento com base nas informações fornecidas, seguindo a legislação do CTB. O resultado depende das circunstâncias específicas de cada caso."
    }
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="py-16 bg-muted/30">
      <div className="container">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          Perguntas Frequentes
        </h2>
        
        <div className="max-w-3xl mx-auto space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full px-6 py-4 text-left bg-card hover:bg-accent transition-colors duration-200 flex justify-between items-center"
              >
                <span className="font-semibold">{faq.question}</span>
                <span className={`transform transition-transform duration-200 ${
                  openIndex === index ? 'rotate-180' : ''
                }`}>
                  ↓
                </span>
              </button>
              {openIndex === index && (
                <div className="px-6 py-4 bg-background border-t border-border">
                  <p className="text-muted-foreground">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;