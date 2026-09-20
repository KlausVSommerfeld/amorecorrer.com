import { lazy, Suspense, type ComponentType } from "react";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import PageShell from "./components/PageShell";
import FalhaDeRota from "./components/FalhaDeRota";

/**
 * `React.lazy` com recuperação para o modo de falha real das rotas assíncronas:
 * o `index.html` em cache aponta para um chunk que o deploy novo já apagou.
 *
 * Uma retentativa cobre a oscilação de rede. Se ela também falhar, recarregar é
 * a única coisa que resolve de verdade — só assim vem um `index.html` novo, com
 * os nomes de arquivo novos. A marca em `sessionStorage` garante que isso
 * aconteça **uma vez por chunk**: sem ela, um chunk realmente ausente viraria um
 * laço de recarga infinito, que é pior que a tela de erro.
 */
function lazyComRetentativa<T extends ComponentType<unknown>>(
  importar: () => Promise<{ default: T }>,
  nome: string
) {
  return lazy(async () => {
    const marca = `recarga_chunk_${nome}`;
    try {
      return await importar();
    } catch (primeiraFalha) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      try {
        return await importar();
      } catch (segundaFalha) {
        let jaRecarregou = false;
        try {
          jaRecarregou = sessionStorage.getItem(marca) === '1';
          if (!jaRecarregou) sessionStorage.setItem(marca, '1');
        } catch {
          // sessionStorage bloqueado: sem marca, não arriscamos o laço.
          jaRecarregou = true;
        }
        if (!jaRecarregou) {
          window.location.reload();
          // Devolve uma promessa que nunca resolve: a página está indo embora.
          return new Promise<{ default: T }>(() => {});
        }
        throw segundaFalha;
      }
    }
  });
}

/**
 * A home é a porta de entrada e vai no chunk inicial. Todo o resto é assíncrono:
 * o formulário sozinho pesa 58 KB de fonte e era baixado por quem nunca clicou
 * em "Gerar meu recurso".
 *
 * O formulário é a única rota com prefetch, e ele é obrigatório: o usuário chega
 * lá **vindo do Stripe, já tendo pagado**, e é o pior momento possível para
 * esperar um download. Quem aquece é um `<link rel="prefetch">` injetado no
 * build (ver `vite.config.ts`), não um `import()` daqui: `import()` baixa **e
 * executa** o módulo, e medido num celular a 4× de CPU isso custou 298ms de TBT
 * na primeira dobra. O `prefetch` deixa os bytes no cache do navegador em
 * prioridade mínima e não roda uma linha até a navegação acontecer.
 */
const Form = lazyComRetentativa(() => import("./pages/Form"), "form");
const Cancel = lazyComRetentativa(() => import("./pages/Cancel"), "cancel");
const Terms = lazyComRetentativa(() => import("./pages/Terms"), "terms");
const Privacy = lazyComRetentativa(() => import("./pages/Privacy"), "privacy");
const NotFound = lazyComRetentativa(() => import("./pages/NotFound"), "notfound");

/**
 * Fallback de rota. Com o prefetch acima ele quase nunca aparece; quando
 * aparecer, mantém o casco da página no lugar em vez de piscar a tela em branco.
 * Sem spinner: o sistema não tem essa linguagem.
 */
const Carregando = () => (
  <PageShell>
    <p className="note" role="status">
      Carregando…
    </p>
  </PageShell>
);

const Rotas = () => (
  <FalhaDeRota>
    <Suspense fallback={<Carregando />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/form" element={<Form />} />
        <Route path="/cancel" element={<Cancel />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  </FalhaDeRota>
);

/**
 * `attribute="class"` casa com `darkMode: ["class"]` do Tailwind, e
 * `disableTransitionOnChange` evita que os ~40 elementos com `transition-colors`
 * animem a troca de tema em conjunto — a alternância é uma mudança de estado,
 * não uma animação. Quem aplica a classe antes da primeira pintura é o script
 * inline do index.html; este provider assume dali em diante.
 */
const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <BrowserRouter>
      <Rotas />
    </BrowserRouter>
  </ThemeProvider>
);

export default App;
