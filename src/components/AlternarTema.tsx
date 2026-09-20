import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';

/**
 * Alternância de tema no masthead.
 *
 * Um botão, não um menu: só existem dois destinos, e o rótulo nomeia para onde
 * o clique leva ("Escuro" / "Claro"), não onde o usuário está. A preferência do
 * sistema é o ponto de partida; o clique passa a valer sobre ela e fica gravado.
 *
 * O `montado` evita o pisca: até o efeito rodar, o cliente ainda não sabe qual
 * tema está valendo, e um rótulo chutado apareceria errado por um quadro. O
 * espaço reservado tem a mesma largura do botão, para o cabeçalho não pular.
 * Quem decide a classe antes da primeira pintura é o script inline no
 * `index.html` — sem ele, quem usa o sistema no escuro veria o site claro
 * durante o carregamento.
 */
const AlternarTema = () => {
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  if (!montado) {
    // Reserva o espaço do botão para o cabeçalho não pular quando ele nascer.
    return <span className="theme-toggle w-4 sm:w-[5.5rem]" aria-hidden="true" />;
  }

  const escuro = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(escuro ? 'light' : 'dark')}
      className="theme-toggle"
    >
      {escuro ? (
        <Sun className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <Moon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
      )}
      {/* Abaixo de 640px o rótulo sai da tela mas continua sendo o nome
          acessível do botão: com ele visível, os links do masthead caíam para
          uma segunda linha e comiam 33px da primeira dobra do celular. */}
      <span className="sr-only sm:not-sr-only">{escuro ? 'Claro' : 'Escuro'}</span>
    </button>
  );
};

export default AlternarTema;
