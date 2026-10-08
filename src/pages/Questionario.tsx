import { useEffect, useRef, useState, type ReactNode } from 'react';
import PageShell from '../components/PageShell';
import AjudaSemVersao from '../components/questionario/AjudaSemVersao';
import PrazoVencido from '../components/questionario/PrazoVencido';
import Resumo from '../components/questionario/Resumo';
import { DEFESA_PREVIA, ESTAGIOS } from '../lib/estagios';
import {
  CHAVE_ATUAL, RESPOSTAS_VAZIAS, armazenamentoDoNavegador, diasAteDataLimite, erroDoPasso,
  gravarRespostas, lerRespostas, telaInicial, type RespostasQuestionario, type Tela,
} from '../lib/questionario';
const TITULOS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Em que estágio está o seu caso?',
  2: 'Qual é a data-limite que consta da sua notificação?',
  3: 'Era você quem dirigia o veículo no momento da infração?',
  4: 'A multa é de radar, por excesso de velocidade?',
  5: 'Você quer contar o que aconteceu?',
};
const digitos = (v: string) => v.replace(/\D/g, '').slice(0, 3);

const Opcao = ({ nome, valor, atual, rotulo, descricao, invalido, aoEscolher, extra, id }: {
  nome: string; valor: string; atual: string; rotulo: string; descricao?: string; invalido: boolean
  aoEscolher: (v: string) => void; extra?: ReactNode; id?: string
}) => (
  <label className="choice">
    <input type="radio" className="choice__input" id={id} name={nome} value={valor} checked={atual === valor}
      onChange={() => aoEscolher(valor)} aria-invalid={invalido} />
    <span>
      <span className="choice__name">{rotulo}{extra}</span>
      {descricao && <span className="choice__desc">{descricao}</span>}
    </span>
  </label>
);

const Questionario = () => {
  const arm = useRef(armazenamentoDoNavegador()).current;
  const [r, setR] = useState<RespostasQuestionario>(() => lerRespostas(arm, CHAVE_ATUAL) ?? RESPOSTAS_VAZIAS);
  // Quem volta (do Stripe, do /cancel, de outra aba) continua de onde parou (spec §6.1).
  const [tela, setTela] = useState<Tela>(() => telaInicial(r, new Date()));
  const [erro, setErro] = useState<string | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { gravarRespostas(arm, CHAVE_ATUAL, r); }, [arm, r]);
  useEffect(() => { window.scrollTo(0, 0); tituloRef.current?.focus(); }, [tela]);

  const mudar = (campo: keyof RespostasQuestionario, valor: string) => {
    setErro(null);
    setR((atual) => ({ ...atual, [campo]: valor }) as RespostasQuestionario);
  };

  const continuar = () => {
    if (typeof tela !== 'number') return;
    const e = erroDoPasso(tela, r);
    if (e) { setErro(e); return; }
    if (tela === 2 && (diasAteDataLimite(r.data_limite, new Date()) ?? 0) < 0) { setTela('vencido'); return; }
    if (tela === 4 && r.multa_de_radar === 'nao') {
      setR((a) => ({ ...a, velocidade_permitida: '', velocidade_aferida: '', velocidade_considerada: '' }));
    }
    setTela(tela === 5 ? 'resumo' : ((tela + 1) as Tela));
  };
  const voltar = () => { setErro(null); if (typeof tela === 'number' && tela > 1) setTela((tela - 1) as Tela); };

  const invalido = Boolean(erro);
  const titulo =
    tela === 'resumo' ? 'O que a sua defesa vai pedir' : tela === 'vencido' ? 'Prazo' : TITULOS[tela];

  return (
    <PageShell>
      <div className="container">
        <div className="max-w-3xl">
          <div className="page__head">
            {typeof tela === 'number' && (
              <div className="progress">
                <span>Passo {tela} de 5</span>
                <span className="progress__bar" aria-hidden="true">
                  <span className="progress__fill" style={{ width: `${tela * 20}%` }} />
                </span>
              </div>
            )}
            <h1 ref={tituloRef} tabIndex={-1} className="page__title">{titulo}</h1>
          </div>

          {tela === 'resumo' && <Resumo r={r} aoRevisar={() => setTela(1)} aoVencer={() => setTela('vencido')} />}
          {tela === 'vencido' && <PrazoVencido estagio={r.estagio} aoCorrigir={() => setTela(2)} />}

          {typeof tela === 'number' && (
            <form onSubmit={(e) => { e.preventDefault(); continuar(); }} noValidate>
              {tela === 1 && (
                <div className="choice-group" role="radiogroup" aria-invalid={invalido}>
                  {ESTAGIOS.map((e, i) => (
                    <Opcao key={e.valor} id={i === 0 ? 'q-campo' : undefined} nome="estagio" valor={e.valor}
                      atual={r.estagio} rotulo={e.nome} descricao={e.descricao} invalido={invalido}
                      aoEscolher={(v) => mudar('estagio', v)} />
                  ))}
                  <p className="form-hint">Está escrito no alto do papel que você recebeu.</p>
                </div>
              )}

              {tela === 2 && (
                <div>
                  <input type="date" id="q-campo" className="form-input max-w-xs" value={r.data_limite}
                    onChange={(e) => mudar('data_limite', e.target.value)} aria-invalid={invalido}
                    aria-describedby="q-dica" />
                  <p className="form-hint" id="q-dica">
                    {r.estagio === DEFESA_PREVIA
                      ? 'Na notificação de autuação, é a data-limite para apresentar defesa prévia ou indicar o condutor.'
                      : 'Na notificação de penalidade, é a data-limite para recorrer — a mesma do vencimento da multa.'}
                  </p>
                </div>
              )}

              {tela === 3 && (
                <div className="choice-group" role="radiogroup" aria-invalid={invalido}>
                  <Opcao id="q-campo" nome="cliente_conduzia" valor="sim" atual={r.cliente_conduzia} rotulo="Sim, eu dirigia"
                    invalido={invalido} aoEscolher={(v) => mudar('cliente_conduzia', v)} />
                  <Opcao nome="cliente_conduzia" valor="nao" atual={r.cliente_conduzia} rotulo="Não, outra pessoa dirigia"
                    invalido={invalido} aoEscolher={(v) => mudar('cliente_conduzia', v)} />
                  {r.cliente_conduzia === 'nao' && r.estagio === DEFESA_PREVIA && (
                    <div className="note mt-4">
                      <p className="font-semibold">Indique quem dirigia.</p>
                      <p className="mt-1">
                        Você tem até 30 dias, contados da notificação da autuação, para indicar ao órgão de
                        trânsito o condutor, pelo meio que consta da notificação. Sem a indicação, a
                        responsabilidade pela infração passa a ser sua (art. 257, § 7º, do CTB). A indicação
                        é feita à parte e não substitui a defesa.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {tela === 4 && (
                <div>
                  <div className="choice-group" role="radiogroup" aria-invalid={invalido}>
                    <Opcao id="q-campo" nome="multa_de_radar" valor="sim" atual={r.multa_de_radar} rotulo="Sim"
                      invalido={invalido} aoEscolher={(v) => mudar('multa_de_radar', v)} />
                    <Opcao nome="multa_de_radar" valor="nao" atual={r.multa_de_radar} rotulo="Não"
                      invalido={invalido} aoEscolher={(v) => mudar('multa_de_radar', v)} />
                  </div>
                  <label className="form-label mt-5" htmlFor="q-amparo">Enquadramento (amparo legal)</label>
                  <input id="q-amparo" type="text" className="form-input" maxLength={120} placeholder="Art. 218, II, do CTB"
                    value={r.amparo_legal} onChange={(e) => mudar('amparo_legal', e.target.value)} />
                  <p className="form-hint">Copie como está na notificação, no campo do enquadramento ou do amparo legal.</p>
                  {r.multa_de_radar === 'sim' && (
                    <div className="mt-4 grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-3">
                      {([
                        ['velocidade_permitida', 'Vel. permitida'],
                        ['velocidade_aferida', 'Vel. aferida'],
                        ['velocidade_considerada', 'Vel. considerada'],
                      ] as const).map(([campo, rotulo]) => (
                        <div key={campo}>
                          <label className="form-label" htmlFor={`q-${campo}`}>{rotulo}</label>
                          <input id={`q-${campo}`} inputMode="numeric" className="form-input" placeholder="km/h"
                            value={r[campo]} onChange={(e) => mudar(campo, digitos(e.target.value))} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tela === 5 && (
                <div className="choice-group" role="radiogroup" aria-invalid={invalido}>
                  <Opcao id="q-campo" nome="versao" valor="propria" atual={r.versao} rotulo="Quero contar o que aconteceu"
                    invalido={invalido} aoEscolher={(v) => mudar('versao', v)} />
                  {r.versao === 'propria' && (
                    <div className="mb-3">
                      <p className="form-hint" id="q-guia">
                        Algumas perguntas que ajudam: havia placa de velocidade no trecho? Você conhece a via?
                        Houve alguma emergência? Conte só o que você viveu ou viu, com as suas palavras — se
                        não tiver certeza de algo, diga isso.
                      </p>
                      <textarea className="form-input" rows={5} maxLength={4000} aria-describedby="q-guia"
                        aria-label="O que aconteceu" value={r.justificativa}
                        onChange={(e) => mudar('justificativa', e.target.value)} />
                    </div>
                  )}
                  <Opcao nome="versao" valor="sem_versao" atual={r.versao}
                    rotulo="Não tenho uma versão própria — quero a defesa pelos dados do auto"
                    invalido={invalido} aoEscolher={(v) => mudar('versao', v)} />
                  <AjudaSemVersao />
                </div>
              )}

              {erro && <p className="form-error mt-3" role="alert">{erro}</p>}

              <div className="mt-6 flex flex-wrap gap-4">
                <button type="submit" className="btn btn--solid">Continuar</button>
                {tela > 1 && <button type="button" className="btn btn--ghost" onClick={voltar}>Voltar</button>}
              </div>
            </form>
          )}
        </div>
      </div>
    </PageShell>
  );
};

export default Questionario;
