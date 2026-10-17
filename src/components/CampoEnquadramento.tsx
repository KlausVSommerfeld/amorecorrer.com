/*
 * Campo do enquadramento (spec 2026-10-15, §4.2): busca na tabela da SENATRAN,
 * cartão do item escolhido, ou texto livre para quem não achar. A lista vem num
 * arquivo à parte, baixado só quando o campo aparece; sem ela, texto livre.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { buscarEnquadramentos, type Enquadramento } from '../lib/enquadramentos';

let lista: Promise<Enquadramento[]> | null = null;

/** Uma vez por página; falha não fica guardada (o próximo campo tenta de novo). */
function carregarLista(): Promise<Enquadramento[]> {
  lista ??= import('../data/enquadramentos.json')
    .then((m) => m.default as Enquadramento[])
    .catch((e) => {
      lista = null;
      throw e;
    });
  return lista;
}

type Modo = 'busca' | 'escolhido' | 'livre';

const modoDe = (amparo: string, codigo: string, atual: Modo): Modo =>
  codigo ? 'escolhido' : amparo ? 'livre' : atual === 'escolhido' ? 'busca' : atual;

type Props = {
  /** id do controle principal: o foco do primeiro erro do formulário chega aqui. */
  id: string;
  rotulo: string;
  amparo: string;
  codigo: string;
  aoMudar: (amparo: string, codigo: string) => void;
};

const CampoEnquadramento = ({ id, rotulo, amparo, codigo, aoMudar }: Props) => {
  const [itens, setItens] = useState<Enquadramento[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [modo, setModo] = useState<Modo>(() => modoDe(amparo, codigo, 'busca'));
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const campoRef = useRef<HTMLInputElement>(null);
  const trocarRef = useRef<HTMLButtonElement>(null);
  const listaId = useId();
  const dicaId = useId();

  useEffect(() => {
    let vivo = true;
    carregarLista().then(
      (l) => vivo && setItens(l),
      () => vivo && setFalhou(true),
    );
    return () => {
      vivo = false;
    };
  }, []);

  // Valores trocados de fora (rascunho restaurado, "apagar rascunho") mudam o modo.
  useEffect(() => {
    setModo((m) => modoDe(amparo, codigo, m));
  }, [amparo, codigo]);

  const escolhido = useMemo(
    () => itens?.find((i) => i.codigo === codigo && i.dispositivo === amparo) ?? null,
    [itens, codigo, amparo],
  );

  // Código que não está na lista, ou que não bate com o amparo: sai o código, fica o texto.
  useEffect(() => {
    if (codigo && (falhou || (itens && !escolhido))) aoMudar(amparo, '');
  }, [codigo, falhou, itens, escolhido, amparo, aoMudar]);

  const resultados = useMemo(() => (itens ? buscarEnquadramentos(termo, itens) : []), [itens, termo]);
  const naoEncontroIdx = resultados.length;
  const mostrarLista = aberto && termo.trim() !== '';

  const focar = () => requestAnimationFrame(() => campoRef.current?.focus());
  const escolher = (i: Enquadramento) => {
    aoMudar(i.dispositivo, i.codigo);
    setModo('escolhido');
    setTermo('');
    setAberto(false);
    // O campo some ao virar cartão: sem isto, o foco do teclado cairia no topo da página.
    requestAnimationFrame(() => trocarRef.current?.focus());
  };
  // Texto digitado e não escolhido é o que está no papel: vira texto livre ao sair do
  // campo ou no Enter com a lista fechada, em vez de sumir (revisão final).
  const guardarTermo = () => {
    if (termo.trim()) aoMudar(termo.trim(), '');
  };
  const naoEncontro = () => {
    aoMudar(termo.trim(), '');
    setModo('livre');
    setAberto(false);
    focar();
  };
  const trocar = () => {
    aoMudar('', '');
    setModo('busca');
    setTermo('');
    focar();
  };
  const voltarALista = () => {
    setTermo(amparo);
    aoMudar('', '');
    setModo('busca');
    setAberto(true);
    focar();
  };

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    const total = resultados.length + 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) => (a + 1) % total);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) => (a - 1 + total) % total);
    } else if (e.key === 'Enter' && mostrarLista) {
      e.preventDefault();
      // Com a lista ainda chegando, a única opção é "Não encontro": o Enter de quem
      // digita rápido não pode mandar para o texto livre (visto no navegador).
      if (!itens) return;
      if (ativo < resultados.length) escolher(resultados[ativo]);
      else naoEncontro();
    } else if (e.key === 'Enter' && termo.trim()) {
      e.preventDefault();
      guardarTermo();
    } else if (e.key === 'Escape') {
      setAberto(false);
    }
  };

  if (falhou || modo === 'livre') {
    return (
      <div>
        <label className="form-label" htmlFor={id}>{rotulo}</label>
        <input ref={campoRef} id={id} type="text" className="form-input" maxLength={120}
          placeholder="Art. 218, II, do CTB" value={amparo} aria-describedby={dicaId}
          onChange={(e) => aoMudar(e.target.value, '')} />
        <p className="form-hint" id={dicaId}>
          Copie como está na notificação, no campo do enquadramento ou do amparo legal.
        </p>
        {!falhou && (
          <button type="button" className="enq__acao" onClick={voltarALista}>Voltar à lista</button>
        )}
      </div>
    );
  }

  if (modo === 'escolhido') {
    return (
      <div>
        <span className="form-label">{rotulo}</span>
        <div className="enq__escolhido">
          <span className="enq__codigo">{codigo}</span>
          <span className="enq__descricao">{escolhido?.descricao ?? ''}</span>
          <span className="enq__dispositivo">
            {amparo}{escolhido ? ` · ${escolhido.gravidade}` : ''}
          </span>
        </div>
        <p className="form-hint">Confira se é a mesma descrição da sua notificação.</p>
        <button ref={trocarRef} type="button" id={id} className="enq__acao" onClick={trocar}>Trocar</button>
      </div>
    );
  }

  return (
    <div className="enq">
      <label className="form-label" htmlFor={id}>{rotulo}</label>
      <input ref={campoRef} id={id} type="text" className="form-input" role="combobox"
        aria-expanded={mostrarLista} aria-controls={listaId} aria-autocomplete="list"
        aria-activedescendant={mostrarLista ? `${listaId}-${ativo}` : undefined}
        aria-describedby={dicaId} autoComplete="off" placeholder="745-50, 218 ou velocidade"
        value={termo} onKeyDown={teclas} onFocus={() => setAberto(true)}
        onBlur={() => {
          setAberto(false);
          guardarTermo();
        }}
        onChange={(e) => {
          setTermo(e.target.value);
          setAtivo(0);
          setAberto(true);
        }} />
      {mostrarLista && (
        <ul className="enq__lista" id={listaId} role="listbox" aria-label={rotulo}>
          {!itens && <li className="enq__vazio" role="presentation">Carregando a lista…</li>}
          {resultados.map((i, n) => (
            <li key={i.codigo} id={`${listaId}-${n}`} role="option" aria-selected={n === ativo}
              className="enq__opcao" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(i)}>
              <span className="enq__codigo">{i.codigo}</span>
              <span className="enq__descricao">{i.descricao}</span>
              <span className="enq__dispositivo">{i.dispositivo} · {i.gravidade}</span>
            </li>
          ))}
          <li id={`${listaId}-${naoEncontroIdx}`} role="option" aria-selected={ativo === naoEncontroIdx}
            className="enq__opcao enq__opcao--livre" onMouseDown={(e) => e.preventDefault()}
            onClick={naoEncontro}>
            Não encontro na lista
          </li>
        </ul>
      )}
      <p className="form-hint" id={dicaId}>
        Digite o código, o artigo ou palavras da descrição, como estão na notificação.
      </p>
      <button type="button" className="enq__acao" onClick={naoEncontro}>Não encontro na lista</button>
    </div>
  );
};

export default CampoEnquadramento;
