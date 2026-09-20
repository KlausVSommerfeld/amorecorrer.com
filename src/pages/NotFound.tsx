import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import PageShell from "../components/PageShell";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <PageShell>
      <div className="container">
        <div className="page__head">
          <span className="eyebrow">Erro 404</span>
          <h1 className="page__title">Esta página não existe.</h1>
          <p className="max-w-[56ch] text-muted-foreground">
            O endereço <span className="font-mono text-foreground">{location.pathname}</span>{' '}
            não corresponde a nenhuma página do site. Se você veio de um link
            nosso, ele está desatualizado.
          </p>
        </div>

        <Link to="/" className="btn btn--solid">
          Ir para o início
        </Link>
      </div>
    </PageShell>
  );
};

export default NotFound;
