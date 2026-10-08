const SUPORTE_URL = import.meta.env.VITE_WHATSAPP_URL as string | undefined;

/**
 * A falha do checkout, no lugar do `alert()` nativo. Fundo opaco porque este
 * bloco também aparece sobre a faixa verde, onde o vermelho translúcido embaça.
 */
const FalhaCheckout = ({
  mensagem,
  tentativas,
  aoTentarDeNovo
}: {
  mensagem: string;
  tentativas: number;
  aoTentarDeNovo: () => void;
}) => (
  <div role="alert" className="error-message error-message--surface w-full max-w-md">
    <p className="font-semibold">Não foi possível abrir o pagamento.</p>
    <p className="mt-1 text-sm leading-snug text-foreground">
      {mensagem} Nada foi cobrado.
    </p>
    <div className="mt-3 flex flex-wrap items-center gap-4">
      <button type="button" onClick={aoTentarDeNovo} className="btn btn--ghost">
        Tentar de novo
      </button>
      {/* Só depois da segunda falha seguida: antes disso, tentar de novo resolve. */}
      {tentativas >= 2 && SUPORTE_URL && (
        <a
          href={SUPORTE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-foreground underline underline-offset-2"
        >
          Falar com a gente
        </a>
      )}
    </div>
  </div>
);


export default FalhaCheckout;
