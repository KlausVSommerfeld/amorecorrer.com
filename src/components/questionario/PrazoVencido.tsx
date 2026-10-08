import { Link } from 'react-router-dom';
import { RECURSO_JARI } from '../../lib/estagios';

/** Spec 2026-10-07, §4.7: não vende a peça de um estágio cujo prazo passou. */
const PrazoVencido = ({ estagio, aoCorrigir }: { estagio: string; aoCorrigir: () => void }) => (
  <div className="max-w-[62ch]" role="alert">
    {estagio === RECURSO_JARI ? (
      <>
        <h2 className="page__title">O prazo para recorrer à JARI passou.</h2>
        <p className="mt-3">
          Um recurso apresentado fora do prazo não suspende a multa e é arquivado (art. 285, §§ 1º e
          5º), então não vamos cobrar por uma peça que não teria efeito. Confira a data com atenção: se
          você digitou errado, volte e corrija.
        </p>
      </>
    ) : (
      <>
        <h2 className="page__title">O prazo da defesa prévia passou, mas o processo não acabou.</h2>
        <p className="mt-3">
          Quando a multa for aplicada, você vai receber a notificação de penalidade, com um prazo novo
          — de pelo menos 30 dias — para recorrer à JARI (art. 282, § 4º). Volte aqui quando ela
          chegar: o recurso apresentado dentro do prazo suspende a penalidade até ser julgado.
        </p>
      </>
    )}
    <div className="mt-6 flex flex-wrap gap-4">
      <button type="button" className="btn btn--solid" onClick={aoCorrigir}>Corrigir a data</button>
      <Link to="/" className="btn btn--ghost">Voltar ao início</Link>
    </div>
  </div>
);

export default PrazoVencido;
