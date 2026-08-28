import { Link } from 'react-router-dom';
import AlternarTema from './AlternarTema';

/** O topo da notificação: quem emite à esquerda, os avisos à direita. */
const Masthead = () => (
  <div className="masthead">
    <Link to="/" className="masthead__brand">
      Amo Recorrer
    </Link>
    <nav className="masthead__links" aria-label="Institucional">
      <Link to="/terms">Termos</Link>
      <Link to="/privacy">Privacidade</Link>
      <AlternarTema />
    </nav>
  </div>
);

export default Masthead;
