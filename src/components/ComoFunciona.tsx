/**
 * A trilha: cinco etapas de uma sequência real (pagar → preencher → redigir →
 * formatar → entregar), costuradas por um filete contínuo. A numeração se
 * justifica porque a ordem é informação — não é enfeite.
 */

import { precoVigente } from '../lib/preco';
import { usePromoExpirada } from '../hooks/use-promo';

const etapas = (preco: string) => [
  {
    titulo: 'Pagamento',
    descricao: `Você paga ${preco} no Stripe e volta direto para o formulário.`,
  },
  {
    titulo: 'Formulário',
    descricao: 'Preenche os dados do auto: placa, órgão autuador, artigo do CTB e o que aconteceu.',
  },
  {
    titulo: 'Redação',
    descricao: 'A IA redige a peça em linguagem jurídica, com a fundamentação do CTB.',
  },
  {
    titulo: 'Formatação',
    descricao: 'O texto vira um PDF A4, com cabeçalho, numeração e rodapé.',
  },
  {
    titulo: 'Entrega',
    descricao: 'O PDF chega no seu e-mail, pronto para imprimir e protocolar.',
  },
];

const ComoFunciona = () => {
  // O preço da etapa 01 acompanha a oferta. Cravado em texto fixo, ele
  // continuava anunciando o promocional depois de a promoção expirar.
  const isExpired = usePromoExpirada();
  const ETAPAS = etapas(precoVigente(isExpired));

  return (
  <section className="section" aria-labelledby="como-funciona-titulo">
    <div className="container">
      <div className="section__head">
        <span className="eyebrow">Do pagamento ao protocolo</span>
        <h2 id="como-funciona-titulo" className="section__title">Como funciona</h2>
        <p className="section__lead">
          Cinco etapas, sem cadastro e sem conversa. A única parte que depende de
          você é o formulário.
        </p>
      </div>

      <ol className="track">
        {ETAPAS.map((etapa, i) => (
          <li key={etapa.titulo} className="track__step">
            <span className="track__marker" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="track__body">
              <h3 className="track__title">{etapa.titulo}</h3>
              <p className="track__desc">{etapa.descricao}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  </section>
  );
};

export default ComoFunciona;
