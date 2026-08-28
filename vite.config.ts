import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * As fontes são auto-hospedadas e só são descobertas depois que o CSS baixa e
 * é analisado. Num celular em rede lenta isso as fazia chegar ~1,9s após o
 * início, e o `font-display: swap` do @fontsource refluía a página inteira
 * quando elas trocavam: medido, dois deslocamentos de 0,1836 cada — CLS de
 * 0,367, quase quatro vezes o limite de 0,1.
 *
 * Este plugin lê o CSS emitido no build, acha os arquivos das duas famílias que
 * pintam a primeira dobra e injeta `<link rel="preload">` no `index.html`, para
 * que baixem em paralelo com o CSS em vez de depois dele. Só as faces latinas
 * usadas acima da dobra entram: pré-carregar as 25 faces seria trocar um
 * problema por outro.
 */
function preloadCritico(): Plugin {
  const criticas = [
    /archivo-latin-wght-normal-[^.]*\.woff2$/,
    /ibm-plex-mono-latin-400-normal-[^.]*\.woff2$/,
  ];

  return {
    name: "preload-critico",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const fontes = Object.keys(bundle).filter((f) =>
        criticas.some((re) => re.test(f))
      );
      const html = Object.values(bundle).find(
        (a) => a.type === "asset" && a.fileName === "index.html"
      );
      if (!html || html.type !== "asset" || fontes.length === 0) return;

      // O chunk do formulário entra como `prefetch`, não `preload`: prioridade
      // mínima, baixado quando sobra rede, sem executar nada. Quem volta do
      // Stripe já pago encontra os bytes no cache em vez de esperar por eles.
      const formulario = Object.keys(bundle).find((f) =>
        /assets\/Form-[^.]*\.js$/.test(f)
      );

      const links = [
        ...fontes.map(
          (f) =>
            `    <link rel="preload" href="/${f}" as="font" type="font/woff2" crossorigin />`
        ),
        ...(formulario
          ? [`    <link rel="prefetch" href="/${formulario}" as="script" crossorigin />`]
          : []),
      ].join("\n");

      html.source = String(html.source).replace(
        "</head>",
        `${links}\n  </head>`
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
  },
  plugins: [react(), preloadCritico()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
