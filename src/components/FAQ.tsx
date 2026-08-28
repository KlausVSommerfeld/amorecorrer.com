import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';

/**
 * Antes era um `useState` à mão com uma seta `↓` literal, sem semântica de
 * teclado. O Accordion do shadcn (Radix) já é dependência do projeto e traz
 * `aria-expanded`, navegação por teclado e o chevron em traço fino.
 */
const PERGUNTAS = [
  {
    pergunta: 'Quais dados preciso fornecer?',
    resposta:
      'Seus dados pessoais (nome, e-mail, telefone, CPF e endereço) e os dados do auto de infração: órgão autuador, número do auto, placa do veículo, local, data e hora da infração e o artigo do CTB.',
  },
  {
    pergunta: 'Como recebo o recurso?',
    resposta:
      'Em PDF A4 no seu e-mail, pronto para imprimir e protocolar no órgão autuador.',
  },
  {
    pergunta: 'O pagamento é seguro?',
    resposta:
      'O pagamento é processado pela Stripe, que segue o padrão PCI DSS. Os dados do cartão não passam por este site.',
  },
  {
    pergunta: 'Quanto tempo demora para receber?',
    resposta:
      'Alguns minutos. A peça é redigida e formatada assim que você envia o formulário — não há fila nem análise manual.',
  },
  {
    pergunta: 'O recurso tem garantia de aprovação?',
    resposta:
      'Não. O serviço monta o documento com base no que você informa e na legislação do CTB. A decisão é do órgão autuador e depende das circunstâncias de cada caso.',
  },
];

const FAQ = () => (
  <section className="section" aria-labelledby="faq-titulo">
    <div className="container">
      <div className="section__head mx-auto max-w-3xl">
        <span className="eyebrow">Antes de pagar</span>
        <h2 id="faq-titulo" className="section__title">Perguntas frequentes</h2>
      </div>

      <Accordion type="single" collapsible className="faq">
        {PERGUNTAS.map(({ pergunta, resposta }) => (
          <AccordionItem key={pergunta} value={pergunta} className="faq__item">
            <AccordionTrigger className="faq__question">{pergunta}</AccordionTrigger>
            <AccordionContent className="faq__answer">{resposta}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  </section>
);

export default FAQ;
