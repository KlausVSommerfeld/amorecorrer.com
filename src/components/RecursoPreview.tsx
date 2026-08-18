/**
 * "O que você recebe" mostrando o produto em vez de descrevê-lo: a primeira
 * página da peça, em serifa, cortada no meio por máscara.
 *
 * O texto é um exemplo — está rotulado como tal no rodapé da folha — e cita o
 * art. 280 do CTB, que relaciona os elementos obrigatórios do auto de infração.
 */

const RecursoPreview = () => (
  <section className="section section--paper">
    <div className="container">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16">
        <div className="doc">
          <div className="doc__page">
            <p className="doc__heading">
              Excelentíssimo Senhor Presidente da Junta Administrativa de
              Recursos de Infrações — JARI
            </p>

            <p className="doc__meta">
              Auto nº E1234567 · Placa ABC1D23 · Art. 218, II, do CTB
            </p>

            <p className="doc__section">I — Dos fatos</p>
            <p className="doc__body">
              O Recorrente foi autuado em 12 de março, às 14h07, por suposta
              infração ao art. 218, inciso II, do Código de Trânsito Brasileiro,
              atribuindo-se-lhe a condução do veículo acima em velocidade
              superior à máxima permitida para a via.
            </p>

            <p className="doc__section">II — Do direito</p>
            <p className="doc__body">
              O art. 280 do CTB relaciona os elementos que devem constar do auto
              de infração. A falta de qualquer um deles compromete a validade da
              autuação e cerceia a defesa do condutor, que fica impedido de
              conhecer com precisão os fatos que lhe são imputados.
            </p>
          </div>

          <p className="doc__caption">Exemplo — trecho de uma peça gerada</p>
        </div>

        <div>
          <div className="section__head">
            <span className="eyebrow">O que você recebe</span>
            <h2 className="section__title">Um documento, não um resumo.</h2>
            <p className="section__lead">
              A peça sai formatada em A4 com a fundamentação do CTB, no mesmo
              formato que o órgão autuador espera receber no protocolo.
            </p>
          </div>

          <dl className="max-w-md">
            <div className="field border-t border-rule">
              <dt className="field__label">Arquivo</dt>
              <dd className="field__value">PDF A4, pronto para imprimir</dd>
            </div>
            <div className="field border-t border-rule">
              <dt className="field__label">Entrega</dt>
              <dd className="field__value">Por e-mail, minutos após o envio</dd>
            </div>
            <div className="field border-y border-rule">
              <dt className="field__label">No corpo do e-mail</dt>
              <dd className="field__value">Órgão, placa, data/hora e artigo</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </section>
);

export default RecursoPreview;
