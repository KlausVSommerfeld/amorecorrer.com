import { Link } from 'react-router-dom';

/** O topo da notificação: quem emite à esquerda, os avisos à direita. */
const Masthead = () => (
  <div className="masthead">
    <Link to="/" className="masthead__brand">
      Amo Recorrer
    </Link>
    <nav className="masthead__links">
      <Link to="/terms">Termos</Link>
      <Link to="/privacy">Privacidade</Link>
    </nav>
  </div>
);

export default Masthead;
