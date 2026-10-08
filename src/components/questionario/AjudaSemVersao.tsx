import { useId, useState } from 'react';

/**
 * O "?" da opção sem versão (spec 2026-10-07, §4.5). É um botão de mostrar e
 * esconder (`aria-expanded`), não um popover: funciona com toque e teclado sem
 * dependência nova, e fica fora do `<label>` da opção, para abrir a explicação
 * sem marcar a escolha.
 */
const AjudaSemVersao = () => {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  return (
    <div className="mt-1 mb-2">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((a) => !a)}
        className="inline-flex items-center gap-2 text-sm underline underline-offset-2"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border font-mono text-xs no-underline"
        >
          ?
        </span>
        O que muda com esta escolha
      </button>
      <p id={id} hidden={!aberto} className="form-hint mt-2 max-w-[60ch]">
        Sem uma versão própria, a defesa se apoia só nos dados do auto: o enquadramento, os números, a
        consistência do auto e os requisitos que a lei exige dele. Quando você não sabe dizer o que levou
        à autuação, essa costuma ser a escolha mais segura: um relato vago ou incerto não ajuda e pode
        enfraquecer a defesa.
      </p>
    </div>
  );
};

export default AjudaSemVersao;
