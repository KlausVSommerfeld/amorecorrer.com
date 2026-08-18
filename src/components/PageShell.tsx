import type { ReactNode } from 'react';
import Masthead from './Masthead';
import Rodape from './Rodape';

type PageShellProps = {
  children: ReactNode;
  /** Espaço extra no fim da página, para a barra fixa do mobile não cobrir nada. */
  bottomSpacer?: boolean;
};

/**
 * O casco das páginas internas: mesmo topo e mesmo rodapé da home, para que
 * formulário, retorno e páginas legais não pareçam outro site.
 */
const PageShell = ({ children, bottomSpacer = false }: PageShellProps) => (
  <div className="page">
    <header className="container">
      <Masthead />
    </header>

    <main className="page__main">{children}</main>

    <Rodape />

    {bottomSpacer && <div aria-hidden="true" className="h-20 md:hidden" />}
  </div>
);

export default PageShell;
