import { Link } from 'react-router-dom';
import { Mail, MessageCircle } from 'lucide-react';

/**
 * Rodapé enxuto. Os contatos só aparecem se a variável de ambiente existir —
 * antes, sem `VITE_WHATSAPP_URL`, o link ia para a string "undefined".
 * O aviso legal saiu do cinza a 70% de opacidade para o papel do talão, que
 * passa AA sobre o verde (`band-paper`: o creme pertence à faixa, não à página,
 * e por isso não escurece junto com o papel no tema escuro).
 */
const Rodape = () => {
  const whatsapp = import.meta.env.VITE_WHATSAPP_URL;
  const email = import.meta.env.VITE_CONTACT_EMAIL;

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="flex flex-col gap-4">
            <span className="footer__brand">Amo Recorrer</span>
            <p className="max-w-[46ch] text-band-paper">
              Recursos de multa redigidos por IA e entregues em PDF, sem cadastro
              e com pagamento único.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <span className="eyebrow text-band-paper">Contato</span>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="footer__link"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                WhatsApp
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="footer__link">
                <Mail className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                {email}
              </a>
            )}
          </div>
        </div>

        <p className="footer__legal mt-10">
          <strong>Aviso legal:</strong> o serviço gera o documento a partir das
          informações que você fornece e da legislação de trânsito. Não há
          garantia de deferimento — a decisão é do órgão autuador. Amo Recorrer
          não presta consultoria jurídica nem representa o recorrente perante o
          órgão.
        </p>

        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} Amo Recorrer</span>
          <span className="flex gap-5">
            <Link to="/terms">Termos</Link>
            <Link to="/privacy">Privacidade</Link>
          </span>
        </div>
      </div>
    </footer>
  );
};

export default Rodape;
