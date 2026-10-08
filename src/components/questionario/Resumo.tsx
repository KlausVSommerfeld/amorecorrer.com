import Countdown from '../Countdown';
import FalhaCheckout from '../FalhaCheckout';
import { useCheckout } from '../../hooks/use-checkout';
import { usePromoExpirada } from '../../hooks/use-promo';
import { diagnostico } from '../../lib/diagnostico';
import { DEFESA_PREVIA, ESTAGIOS, RECURSO_JARI } from '../../lib/estagios';
import { PRECO_CHEIO, precoVigente } from '../../lib/preco';
import { armazenamentoDoNavegador, diasAteDataLimite, textoDoPrazo, vincularAoCaso, type RespostasQuestionario } from '../../lib/questionario';

const GARANTIAS_COMUNS = [
  'Os pontos só vão para a sua CNH se a decisão final for contra você (art. 290).',
  'O licenciamento e a transferência do veículo não ficam bloqueados por ela enquanto o processo corre (art. 284, § 3º).',
];
const GARANTIAS: Record<string, string[]> = {
  [DEFESA_PREVIA]: ['A multa ainda não foi aplicada: ela só pode ser depois que a defesa for julgada (art. 282).', ...GARANTIAS_COMUNS],
  [RECURSO_JARI]: [
    'O recurso suspende a penalidade até ser julgado (art. 285).',
    ...GARANTIAS_COMUNS,
    'Você pode pagar a multa com 20% de desconto até o vencimento e recorrer mesmo assim; se o recurso for aceito, o valor volta corrigido (arts. 284, § 2º, e 286, § 2º).',
  ],
};

const Resumo = ({ r, aoRevisar, aoVencer }: { r: RespostasQuestionario; aoRevisar: () => void; aoVencer: () => void }) => {
  const expirado = usePromoExpirada();
  const { estado, enviando, iniciar } = useCheckout((caseId) => vincularAoCaso(armazenamentoDoNavegador(), caseId, r));
  // O resumo pode ficar aberto até depois da meia-noite do último dia: o prazo é
  // conferido de novo no clique, e vencido não vende (spec §2; revisão final).
  const pagar = () => {
    if ((diasAteDataLimite(r.data_limite, new Date()) ?? -1) < 0) aoVencer();
    else iniciar();
  };
  const dias = diasAteDataLimite(r.data_limite, new Date()) ?? 0;
  const d = diagnostico(r);
  const nomeEstagio = ESTAGIOS.find((e) => e.valor === r.estagio)?.nome ?? '';

  return (
    <div className="max-w-[62ch]">
      <section className="field mb-6">
        <span className="field__label">Seu caso</span>
        <span className="field__value">
          {nomeEstagio} · {textoDoPrazo(dias, r.data_limite)}
        </span>
      </section>

      <section className="mb-6" aria-labelledby="resumo-pedidos">
        <h2 id="resumo-pedidos" className="fieldset__name">O que a defesa vai pedir</h2>
        <p className="mt-2">{d.texto}</p>
        {d.destaque && <p className="mt-2 font-semibold">{d.destaque}</p>}
        {d.complemento && <p className="mt-2">{d.complemento}</p>}
      </section>

      <section className="mb-6" aria-labelledby="resumo-garantias">
        <h2 id="resumo-garantias" className="fieldset__name">O que a lei garante a quem recorre dentro do prazo</h2>
        <ul className="mt-2 list-disc pl-5">
          {(GARANTIAS[r.estagio] ?? GARANTIAS_COMUNS).map((g) => <li key={g}>{g}</li>)}
        </ul>
      </section>

      <section className="offer mb-4">
        <div className="offer__cell">
          <span className="eyebrow block">{expirado ? 'Preço' : 'Preço promocional'}</span>
          <span className="price mt-1 block">
            {!expirado && <s className="price__from">{PRECO_CHEIO}</s>}
            {precoVigente(expirado)}
          </span>
        </div>
        {!expirado && (
          <div className="offer__cell">
            <span className="eyebrow block">Prazo da promoção</span>
            <span className="mt-1 block"><Countdown /></span>
          </div>
        )}
      </section>

      <div className="flex flex-col items-start gap-3">
        <button type="button" onClick={pagar} disabled={enviando} aria-busy={enviando}
          className={`btn ${enviando ? 'btn--disabled' : 'btn--solid'} px-8 py-4 text-lg`}>
          {enviando ? 'Abrindo pagamento…' : 'Ir para o pagamento'}
        </button>
        <button type="button" className="text-sm underline underline-offset-2" onClick={aoRevisar}>Revisar respostas</button>
        {estado.fase === 'erro' && (
          <FalhaCheckout mensagem={estado.mensagem} tentativas={estado.tentativas} aoTentarDeNovo={pagar} />
        )}
        <p className="form-hint">O resultado depende da análise do órgão; nenhuma defesa tem resultado garantido.</p>
      </div>
    </div>
  );
};

export default Resumo;
