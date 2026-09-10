import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { getCaseIdFromUrl } from '../lib/caseId';
import { submitForm } from '../lib/api';
import PageShell from '../components/PageShell';

/** O envio dispara a Edge Function, que por sua vez chama o pipeline. É mais
 *  lento que o checkout — 20s antes de desistir, não 15. */
const TIMEOUT_ENVIO_MS = 20000;
const SUPORTE_URL = import.meta.env.VITE_WHATSAPP_URL as string | undefined;

/** `form-submit` recusa corpos acima de 64 KB. A justificativa é o único campo
 *  livre grande; o teto abaixo mantém o payload inteiro com folga sobrando. */
const MAX_JUSTIFICATIVA = 4000;

/** Rascunho por caso: quem pagou não pode perder o formulário por um refresh. */
const RASCUNHO_PREFIXO = 'rascunho_form_';
const RECIBO_PREFIXO = 'recibo_';

/** Dita a regra dos três identificadores num lugar só: dica e erro leem daqui. */
const REGRA_IDENTIFICADORES =
  'Preencha ao menos um destes três: nº do auto, nº da notificação ou o RENAINF do bloco anterior.';

type ViaCepResponse = {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string; // cidade
  uf: string; // estado (UF)
  erro?: boolean;
};

interface FormData {
  nomeCompleto: string;
  email: string;
  emailConfirma: string;
  telefone: string; // stored as digits-only
  cpf: string; // stored as digits-only
  cnh: string;

  cep: string; // stored as digits-only
  endereco: string;

  // auto-filled via CEP — editável quando a consulta falha
  cidade: string;
  estado: string;

  orgaoAutuador: string;
  notificacaoPenalidade: string;
  estagio: string;
  autoInfracao: string;
  expedidaEm: string;
  placa: string;
  marcaModeloEspecie: string;
  localSentido: string;
  dataHora: string;
  renainf: string;
  descricaoInfracao: string;
  amparoLegal: string;
  justificativa: string;
  velocidade_permitida: string;
  velocidade_aferida: string;

  form_token: string;
  case_id: string;
  stripe_session_id: string;
}

/** As duas peças que o produto redige. O valor vai para `especie_documento` —
 *  coluna que já existe, já atravessa a Edge Function e já entra no contexto
 *  que o pipeline monta para o modelo. Enquanto o estágio era um campo de texto
 *  livre que ninguém preenchia, a peça saía sem saber a quem se endereçar. */
const ESTAGIOS = [
  {
    valor: 'Notificação de autuação — defesa prévia',
    nome: 'Defesa da autuação',
    descricao:
      'O papel diz "notificação de autuação". A multa ainda não foi aplicada e a peça vai para o próprio órgão autuador.'
  },
  {
    valor: 'Notificação de penalidade — recurso à JARI',
    nome: 'Recurso à JARI',
    descricao:
      'O papel diz "notificação de penalidade" e traz o valor a pagar. A peça vai para a Junta Administrativa de Recursos de Infrações.'
  }
] as const;

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function formatTelefone(digitsOnlyValue: string) {
  const d = onlyDigits(digitsOnlyValue).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatCPF(digitsOnlyValue: string) {
  const d = onlyDigits(digitsOnlyValue).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatCEP(digitsOnlyValue: string) {
  const d = onlyDigits(digitsOnlyValue).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Dígitos verificadores do CPF. Só o comprimento não bastava: "111.111.111-11"
 *  passava, e um CPF errado numa peça protocolada é defeito do documento. */
function cpfValido(digits: string): boolean {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const digito = (fatia: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < fatia.length; i += 1) soma += Number(fatia[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return (
    digito(digits.slice(0, 9), 10) === Number(digits[9]) &&
    digito(digits.slice(0, 10), 11) === Number(digits[10])
  );
}

/**
 * `datetime-local` entrega a hora no relógio do usuário ("2026-03-12T21:07").
 * Passar por `toISOString()` convertia para UTC, e toda infração depois das 21h
 * em BRT era gravada no dia seguinte — a data errada na peça. Enviamos a string
 * local, sem fuso.
 *
 * Continua obrigatório depois de `data_infracao` virar `timestamp` sem fuso, em
 * 09/09/2026: a coluna guarda o relógio de parede impresso na notificação, não
 * um instante. Mandar UTC daqui reintroduziria o mesmo desvio, agora de 3h na
 * hora em vez de um dia na data.
 */
function toLocalIso(datetimeLocal: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(datetimeLocal || '');
  if (!m) return null;
  const [, ano, mes, dia, hora, minuto] = m;
  const data = new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora), Number(minuto));
  if (Number.isNaN(data.getTime())) return null;
  return `${ano}-${mes}-${dia}T${hora}:${minuto}:00`;
}

/**
 * Valor de `max` do campo de data: uma infração não acontece no futuro.
 *
 * O "agora" que importa é o do BRASIL, não o do aparelho. Com o relógio local,
 * um motorista com o celular em fuso a oeste era BARRADO ao informar uma
 * infração legítima de horas atrás — "não pode estar no futuro" — e em fuso a
 * leste o campo aceitava hora futura. Medido em 09/09/2026: com o aparelho em
 * Honolulu o `max` saía 7h atrás do agora brasileiro.
 *
 * `sv-SE` não é capricho: é o locale que formata como `YYYY-MM-DD HH:mm`, que é
 * exatamente o que o `datetime-local` espera depois de trocar o espaço por `T`.
 * `hourCycle: 'h23'` evita que meia-noite vire "24:00" em engines que usam h24.
 */
function agoraParaInput(): string {
  const brasilAgora = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date());
  return brasilAgora.replace(' ', 'T');
}

/**
 * O que o usuário lê quando o envio falha. O erro cru — `Request failed: 500 …`
 * seguido do corpo da resposta — dizia o problema do servidor, nunca o do
 * usuário, e vazava detalhes de infraestrutura na tela.
 */
function mensagemDeFalha(status: number): string {
  if (status === 409) {
    return 'Este caso já foi finalizado. Se você não recebeu o PDF, fale com a gente com o número do caso em mãos.';
  }
  if (status === 404) {
    return 'Não localizamos este pedido. Confira se você abriu o link que veio depois do pagamento.';
  }
  if (status === 413) {
    return 'O texto ficou grande demais. Encurte o campo "O que aconteceu?" e envie de novo.';
  }
  if (status === 429) {
    return 'Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.';
  }
  if (status === 400 || status === 401 || status === 403) {
    return 'O envio foi recusado. Recarregue a página pelo link do pagamento e tente de novo.';
  }
  return 'Nossos servidores não responderam agora. Seus dados continuam aqui — tente de novo.';
}

const INITIAL_FORM: FormData = {
  nomeCompleto: '',
  email: '',
  emailConfirma: '',
  telefone: '',
  cpf: '',
  cnh: '',

  cep: '',
  endereco: '',

  cidade: '',
  estado: '',

  orgaoAutuador: '',
  notificacaoPenalidade: '',
  estagio: '',
  autoInfracao: '',
  expedidaEm: '',
  placa: '',
  marcaModeloEspecie: '',
  localSentido: '',
  dataHora: '',
  renainf: '',
  descricaoInfracao: '',
  amparoLegal: '',
  justificativa: '',
  velocidade_permitida: '',
  velocidade_aferida: '',

  form_token: '',
  case_id: '',
  stripe_session_id: ''
};

/** Campos de sistema nunca entram no rascunho: eles vêm da URL e do checkout. */
const CAMPOS_DE_SISTEMA = ['form_token', 'case_id', 'stripe_session_id'] as const;

/** Há algo digitado? Campos de sistema não contam — eles vêm da URL. */
function temConteudo(dados: Partial<FormData>): boolean {
  return Object.entries(dados).some(
    ([chave, valor]) =>
      !(CAMPOS_DE_SISTEMA as readonly string[]).includes(chave) && Boolean(valor)
  );
}

function lerRascunho(caseId: string): Partial<FormData> | null {
  try {
    const cru = localStorage.getItem(RASCUNHO_PREFIXO + caseId);
    if (!cru) return null;
    const dados = JSON.parse(cru) as Record<string, unknown>;
    const limpo: Record<string, string> = {};
    for (const [chave, valor] of Object.entries(dados)) {
      if (chave in INITIAL_FORM && typeof valor === 'string') limpo[chave] = valor;
    }
    for (const chave of CAMPOS_DE_SISTEMA) delete limpo[chave];
    return limpo as Partial<FormData>;
  } catch {
    return null;
  }
}

function gravarRascunho(caseId: string, dados: FormData) {
  try {
    const copia: Record<string, string> = { ...dados };
    for (const chave of CAMPOS_DE_SISTEMA) delete copia[chave];
    localStorage.setItem(RASCUNHO_PREFIXO + caseId, JSON.stringify(copia));
  } catch {
    /* cota estourada ou storage bloqueado: o rascunho é conveniência, não requisito */
  }
}

function apagarRascunho(caseId: string) {
  try {
    localStorage.removeItem(RASCUNHO_PREFIXO + caseId);
  } catch {
    /* idem */
  }
}

// Ordem dos campos na tela, para levar o foco ao primeiro erro de cima para
// baixo — num formulário deste tamanho, avisar sem apontar não ajuda.
const FIELD_ORDER = [
  'nomeCompleto', 'cpf', 'email', 'emailConfirma', 'telefone', 'cep', 'cidade', 'endereco',
  'placa', 'renainf', 'estagio', 'orgaoAutuador', 'autoInfracao',
  'notificacaoPenalidade', 'dataHora', 'localSentido',
  'velocidade_permitida', 'velocidade_aferida', 'justificativa'
];

const Form = () => {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Falha de rede/servidor no envio. Fica ao lado do botão, não no topo: a
  // falha acontece depois de rolar o formulário inteiro.
  const [falha, setFalha] = useState<{ texto: string; tentativas: number } | null>(null);
  // Enviado com sucesso: o formulário sai de cena e entra o recibo.
  const [recibo, setRecibo] = useState<{ caseId: string; email: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // O rascunho existe? Só então oferecemos apagá-lo.
  const [temRascunho, setTemRascunho] = useState(false);
  // ViaCEP fora do ar, CEP não encontrado ou correção manual pedida pelo usuário.
  const [cidadeManual, setCidadeManual] = useState(false);
  // Só depois do efeito de montagem sabemos se o pedido é válido.
  const [pronto, setPronto] = useState(false);

  // ViaCEP lookup controls (no UI required; used to avoid repeated lookups / races)
  const lastCepLookupRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Trava de reentrância: `isSubmitting` só desabilita o botão no render
  // seguinte, e dois cliques rápidos cabem antes dele. Um ref é lido no mesmo
  // tick — foi assim que o clique triplo no checkout deixou de abrir três
  // sessões no Stripe.
  const enviandoRef = useRef(false);
  const envioAbortRef = useRef<AbortController | null>(null);
  const envioTimeoutRef = useRef<number | null>(null);
  const falhaRef = useRef<HTMLDivElement>(null);

  // Guardas do rascunho: gravar só depois de restaurar, senão o primeiro render
  // sobrescreve o que estava salvo com o formulário vazio.
  const restauradoRef = useRef(false);
  const rascunhoTimerRef = useRef<number | null>(null);

  const maxDataHora = useMemo(agoraParaInput, []);

  /**
   * O `datetime-local` desenha a data no locale do **navegador**, não no `lang`
   * da página: num aparelho em inglês o campo pede `mm/dd/yyyy` e o motorista
   * brasileiro digita o dia no lugar do mês — data errada na peça, sem aviso.
   * Devolvemos o que entendemos, por extenso, para o erro ficar visível.
   */
  const dataPorExtenso = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(formData.dataHora || '');
    if (!m) return null;
    const [, ano, mes, dia, hora, minuto] = m;
    const data = new Date(Number(ano), Number(mes) - 1, Number(dia));
    if (Number.isNaN(data.getTime())) return null;
    const escrita = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(data);
    return `${escrita}, ${hora}h${minuto}`;
  }, [formData.dataHora]);

  useEffect(() => {
    const caseId = getCaseIdFromUrl();

    /*
     * O `form_token` identifica esta tentativa de envio para o `dup_guard` do
     * backend. Guardá-lo é o que faz um F5 continuar sendo o mesmo envio — mas
     * com armazenamento bloqueado o acesso **lança**, e sem guarda isso derrubava
     * a página de quem já pagou. Sem armazenamento, o token vale só para esta
     * sessão de página: o envio funciona igual, apenas a deduplicação entre
     * recargas deixa de existir.
     */
    let token: string | null = null;
    try {
      token = localStorage.getItem('form_token');
      if (!token) {
        token = uuidv4();
        localStorage.setItem('form_token', token);
      }
    } catch {
      token = token || uuidv4();
    }

    let stripeSessionId: string | null = null;
    try {
      stripeSessionId = localStorage.getItem('stripe_session_id');
    } catch {
      stripeSessionId = null;
    }

    // Um envio bem-sucedido que sobreviva a um F5: sem conta de usuário, o
    // número do caso na tela é o único comprovante que a pessoa tem.
    if (caseId) {
      try {
        const salvo = localStorage.getItem(RECIBO_PREFIXO + caseId);
        if (salvo) {
          const dados = JSON.parse(salvo) as { caseId?: string; email?: string };
          if (dados.caseId && dados.email) {
            setRecibo({ caseId: dados.caseId, email: dados.email });
            setPronto(true);
            return;
          }
        }
      } catch {
        /* recibo ilegível: segue para o formulário */
      }
    }

    const rascunho = caseId ? lerRascunho(caseId) : null;
    if (rascunho && temConteudo(rascunho)) setTemRascunho(true);

    setFormData(prev => ({
      ...prev,
      ...(rascunho ?? {}),
      form_token: token!,
      case_id: caseId ?? prev.case_id,
      stripe_session_id: stripeSessionId ?? prev.stripe_session_id
    }));

    restauradoRef.current = true;
    setPronto(true);
  }, []);

  // Grava o rascunho com folga: digitar não pode escrever no storage a cada tecla.
  useEffect(() => {
    if (!restauradoRef.current || !formData.case_id || recibo) return;

    if (rascunhoTimerRef.current) window.clearTimeout(rascunhoTimerRef.current);
    rascunhoTimerRef.current = window.setTimeout(() => {
      // Formulário vazio não é rascunho: sem esta guarda, o mount já gravava e o
      // aviso "rascunho guardado" aparecia antes do primeiro caractere.
      if (!temConteudo(formData)) {
        apagarRascunho(formData.case_id);
        setTemRascunho(false);
        return;
      }
      gravarRascunho(formData.case_id, formData);
      setTemRascunho(true);
    }, 600);

    return () => {
      if (rascunhoTimerRef.current) window.clearTimeout(rascunhoTimerRef.current);
    };
  }, [formData, recibo]);

  // Fechar a aba no meio do preenchimento é o pior desfecho possível para quem
  // já pagou. O rascunho cobre o refresh; o aviso cobre o fechamento acidental.
  useEffect(() => {
    if (recibo) return;

    const aoSair = (e: BeforeUnloadEvent) => {
      if (!temConteudo(formData) || enviandoRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [formData, recibo]);

  // Cancela o envio pendente se a página sair do ar no meio dele.
  useEffect(
    () => () => {
      envioAbortRef.current?.abort();
      if (envioTimeoutRef.current) window.clearTimeout(envioTimeoutRef.current);
    },
    []
  );

  // Auto-fill cidade/estado via CEP (no inputs)
  useEffect(() => {
    const cepDigits = onlyDigits(formData.cep).slice(0, 8);

    // cleanup previous debounce
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // abort previous in-flight lookup
    abortRef.current?.abort();
    abortRef.current = null;

    // if CEP incomplete, invalidate cache and return
    if (cepDigits.length !== 8) {
      lastCepLookupRef.current = null;
      return;
    }

    // if already looked up this exact CEP, do nothing
    if (lastCepLookupRef.current === cepDigits) return;

    // Sem rede, a consulta só devolveria um erro genérico: abre o preenchimento
    // manual direto.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setCidadeManual(true);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      // O ViaCEP é um serviço público de terceiros, sem SLA: sem teto de tempo,
      // o campo ficava preso em "Preenchido pelo CEP" para sempre.
      const expira = window.setTimeout(() => controller.abort(), 8000);

      try {
        const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`, {
          method: 'GET',
          signal: controller.signal
        });

        if (!res.ok) {
          setCidadeManual(true);
          setErrors(prev => ({ ...prev, cep: '' }));
          return;
        }

        const json: ViaCepResponse = await res.json();

        if (json.erro) {
          setErrors(prev => ({ ...prev, cep: 'CEP não encontrado. Confira o número.' }));
          setCidadeManual(true);
          return;
        }

        lastCepLookupRef.current = cepDigits;
        setCidadeManual(false);

        setFormData(prev => ({
          ...prev,
          cidade: json.localidade || '',
          estado: (json.uf || '').toUpperCase()
        }));

        // clear CEP error if any
        setErrors(prev => (prev.cep ? { ...prev, cep: '' } : prev));
      } catch (e: unknown) {
        if ((e as { name?: string })?.name === 'AbortError') return;
        // A consulta é conveniência, não requisito: em vez de barrar o
        // formulário, devolvemos os dois campos para o usuário.
        setCidadeManual(true);
      } finally {
        window.clearTimeout(expira);
      }
    }, 450);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [formData.cep]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    /*
     * Campo vazio não devolve "X é obrigatório": o rótulo já traz o asterisco e
     * o cabeçalho já explica o que ele significa, então repetir isso é gastar a
     * única linha disponível para não dizer nada. Cada mensagem diz **o que
     * fazer** — e, nos campos do auto, **de onde copiar**, que é a informação
     * que o usuário de fato não tem. O vocabulário é o do rótulo visível: quem
     * lê "O que aconteceu?" na tela não pode receber um erro sobre
     * "justificativa".
     */
    if (!formData.nomeCompleto.trim())
      newErrors.nomeCompleto = 'Escreva seu nome completo, sem abreviar.';
    if (!formData.email.trim())
      newErrors.email = 'Informe o e-mail onde você quer receber o PDF.';
    if (!formData.telefone.trim())
      newErrors.telefone = 'Informe um telefone com DDD.';
    if (!formData.cpf.trim()) newErrors.cpf = 'Informe seu CPF.';
    if (!formData.cep.trim())
      newErrors.cep = 'Informe o CEP — cidade e estado vêm dele.';
    if (!formData.endereco.trim())
      newErrors.endereco = 'Informe rua, número e bairro.';
    if (!formData.estagio) newErrors.estagio = 'Escolha o estágio do seu caso.';
    if (!formData.orgaoAutuador.trim())
      newErrors.orgaoAutuador = 'Copie o órgão autuador do topo da notificação.';
    if (!formData.placa.trim()) newErrors.placa = 'Informe a placa do veículo.';
    if (!formData.localSentido.trim())
      newErrors.localSentido = 'Copie o local e o sentido da via, como está na notificação.';
    if (!formData.dataHora.trim())
      newErrors.dataHora = 'Informe a data e a hora que estão na notificação.';
    if (!formData.justificativa.trim())
      newErrors.justificativa = 'Conte o que aconteceu: é esta parte que a peça vai defender.';

    // Email validation
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Confira o e-mail: parece faltar o @ ou o domínio.';
    }

    // O PDF vai para este endereço e não existe segunda via self-service: um
    // caractere errado aqui perde o produto inteiro, sem aviso e sem retorno.
    if (formData.email && !newErrors.email) {
      if (!formData.emailConfirma.trim()) {
        newErrors.emailConfirma = 'Digite o e-mail de novo, para conferirmos.';
      } else if (
        formData.emailConfirma.trim().toLowerCase() !== formData.email.trim().toLowerCase()
      ) {
        newErrors.emailConfirma = 'Os dois e-mails estão diferentes. Confira qual está certo.';
      }
    }

    // CPF: comprimento e dígitos verificadores
    const cpfDigits = onlyDigits(formData.cpf);
    if (formData.cpf && cpfDigits.length !== 11) {
      newErrors.cpf = 'O CPF tem 11 dígitos. Confira se não faltou nenhum.';
    } else if (formData.cpf && !cpfValido(cpfDigits)) {
      newErrors.cpf = 'Este CPF não é válido. Confira os números.';
    }

    /*
     * Telefone: só existia `.trim()`, então "(11) 9" passava e ia gravado. É o
     * único canal de contato quando o e-mail digitado errado devolve a mensagem
     * — deixar entrar um número impossível é perder o cliente que mais precisa
     * de suporte. Dez dígitos (fixo) ou onze (celular), com DDD.
     */
    const telDigits = onlyDigits(formData.telefone);
    if (formData.telefone && (telDigits.length < 10 || telDigits.length > 11)) {
      newErrors.telefone = 'O telefone tem 10 ou 11 dígitos com o DDD, como (11) 99999-9999.';
    }

    // CEP validation (8 digits)
    const cepDigits = onlyDigits(formData.cep);
    if (formData.cep && cepDigits.length !== 8) {
      newErrors.cep = 'O CEP tem 8 dígitos, como 01310-100.';
    }

    // Cidade e UF: a consulta pode ter falhado, então o valor precisa existir de
    // qualquer origem antes do envio.
    if (!formData.cidade.trim()) newErrors.cidade = 'Informe a cidade.';
    if (!/^[A-Za-z]{2}$/.test(formData.estado.trim()))
      newErrors.estado = 'A UF tem duas letras, como SP.';

    // Placa: aceita Mercosul (ABC1D23) e o formato antigo (ABC1234), que
    // continua válido em todo veículo ainda não transferido.
    const placaClean = formData.placa.toUpperCase().replace(/\s+/g, '');
    if (formData.placa && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placaClean)) {
      newErrors.placa = 'A placa tem o formato ABC1D23 ou ABC1234.';
    }

    /*
     * Velocidade: campos livres de dígitos, sem teto. "999" ia inteiro para a
     * peça — "velocidade aferida de 999 km/h" desmoraliza o documento diante do
     * órgão. 400 km/h é folgado o bastante para qualquer caso real e barra o
     * dígito repetido sem querer.
     */
    for (const campo of ['velocidade_permitida', 'velocidade_aferida'] as const) {
      const bruto = formData[campo].trim();
      if (bruto && Number(bruto) > 400) {
        newErrors[campo] = 'Confira este valor: acima de 400 km/h não passa por um caso real.';
      }
    }

    // Data e hora: nada de infração no futuro.
    if (formData.dataHora && formData.dataHora > maxDataHora) {
      newErrors.dataHora = 'A data da infração não pode estar no futuro. Confira o dia e o mês.';
    }

    if (formData.justificativa.length > MAX_JUSTIFICATIVA) {
      // Dizer o teto não ajuda quem já passou dele; o que resolve é o quanto
      // sobra para cortar.
      const excedente = formData.justificativa.length - MAX_JUSTIFICATIVA;
      newErrors.justificativa = `O texto passou do limite em ${excedente} ${
        excedente === 1 ? 'caractere' : 'caracteres'
      }. Corte um pouco e envie de novo.`;
    }

    // At least one identification number required
    if (!formData.autoInfracao.trim() && !formData.renainf.trim() && !formData.notificacaoPenalidade.trim()) {
      /*
       * Mesma frase da dica que já está sob os três campos, palavra por palavra:
       * a dica descreve a regra melhor do que qualquer reformulação (ela até
       * localiza o RENAINF, que mora no bloco anterior), e escrever uma segunda
       * versão só criaria dois vocabulários para a mesma exigência. O que muda
       * no erro é a cor, o `aria-invalid` e o foco — não o texto.
       */
      const msg = REGRA_IDENTIFICADORES;
      newErrors.autoInfracao = msg;
      newErrors.renainf = msg;
      newErrors.notificacaoPenalidade = msg;
    }

    setErrors(newErrors);

    const primeiro = FIELD_ORDER.find(campo => newErrors[campo]);
    if (primeiro) document.getElementById(primeiro)?.focus();

    return Object.keys(newErrors).length === 0;
  };

  const normalizeData = (data: FormData) => {
    const vPermitida = data.velocidade_permitida.trim() ? parseInt(data.velocidade_permitida, 10) : NaN;
    const vAferida = data.velocidade_aferida.trim() ? parseInt(data.velocidade_aferida, 10) : NaN;

    return {
      case_id: data.case_id,
      form_token: data.form_token,
      stripe_session_id: data.stripe_session_id || null,

      nome: data.nomeCompleto.trim(),
      email: data.email.trim().toLowerCase(),

      telefone: onlyDigits(data.telefone) || null,
      cpf: onlyDigits(data.cpf) || null,
      cnh: data.cnh.trim() || null,

      cep: onlyDigits(data.cep) || null,
      endereco: data.endereco.trim() || null,

      cidade: data.cidade.trim() || null,
      estado: data.estado.trim().toUpperCase() || null,

      orgao_autuador: data.orgaoAutuador.trim() || null,
      numero_auto: data.autoInfracao.toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
      notificacao_penalidade: data.notificacaoPenalidade.toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
      data_infracao: toLocalIso(data.dataHora),
      local_infracao: data.localSentido.trim() || null,
      placa: data.placa.toUpperCase().replace(/\s+/g, '') || null,

      renainf: data.renainf.toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
      especie_documento: data.estagio || null,
      marca_modelo_especie: data.marcaModeloEspecie.trim() || null,
      expedida_em: data.expedidaEm.trim() || null,
      descricao_infracao: data.descricaoInfracao.trim() || null,
      amparo_legal: data.amparoLegal.trim() || null,
      justificativa: data.justificativa.trim() || null,

      velocidade_permitida: Number.isFinite(vPermitida) ? vPermitida : null,
      velocidade_aferida: Number.isFinite(vAferida) ? vAferida : null,

      artigo_ctb: null
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ler o ref, não o estado: o estado ainda é `false` para o segundo clique.
    if (enviandoRef.current) return;

    if (!validateForm()) {
      setFalha(null);
      setMessage({ type: 'error', text: 'Alguns campos precisam de correção. Marcamos cada um deles abaixo.' });
      return;
    }

    const caseId = formData.case_id || getCaseIdFromUrl();
    if (!caseId) {
      setMessage({
        type: 'error',
        text: 'Não localizamos o seu pedido. Abra de novo o link que apareceu depois do pagamento.'
      });
      return;
    }

    if (!formData.stripe_session_id) {
      setMessage({
        type: 'error',
        text: 'Não localizamos o seu pagamento neste navegador. Abra o formulário pelo link que veio depois de pagar.'
      });
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setFalha(prev => ({
        texto: 'Você está sem conexão. Seus dados continuam guardados aqui.',
        tentativas: (prev?.tentativas ?? 0) + 1
      }));
      return;
    }

    enviandoRef.current = true;
    setIsSubmitting(true);
    setMessage(null);
    setFalha(null);

    const controller = new AbortController();
    envioAbortRef.current = controller;

    // O `signal` só alcança o `fetch`. Antes dele, `submitForm` aguarda a
    // sessão anônima do Supabase — se a autenticação travar, o botão ficaria
    // em "Enviando…" para sempre. A corrida cobre a operação inteira.
    const expirou = new Promise<never>((_, reject) => {
      envioTimeoutRef.current = window.setTimeout(() => {
        controller.abort(new DOMException('Tempo esgotado', 'TimeoutError'));
        reject(new DOMException('Tempo esgotado', 'TimeoutError'));
      }, TIMEOUT_ENVIO_MS);
    });

    try {
      const normalizedData = normalizeData({ ...formData, case_id: caseId });

      const response = await Promise.race([
        submitForm(normalizedData, { signal: controller.signal }),
        expirou
      ]);

      if (!response.ok) {
        // O corpo da resposta é diagnóstico de servidor: fica no console, não na tela.
        const detalhe = await response.text().catch(() => '');
        console.error('form-submit falhou:', response.status, detalhe);
        setFalha(prev => ({
          texto: mensagemDeFalha(response.status),
          tentativas: (prev?.tentativas ?? 0) + 1
        }));
        return;
      }

      apagarRascunho(caseId);
      setTemRascunho(false);

      const comprovante = { caseId, email: normalizedData.email };
      try {
        localStorage.setItem(RECIBO_PREFIXO + caseId, JSON.stringify(comprovante));
      } catch {
        /* sem storage o recibo ainda aparece nesta sessão */
      }

      setRecibo(comprovante);
      window.scrollTo({ top: 0 });

      setFormData(prev => ({
        ...INITIAL_FORM,
        form_token: prev.form_token,
        case_id: prev.case_id,
        stripe_session_id: prev.stripe_session_id
      }));
      setErrors({});
    } catch (error) {
      console.error('Form submission error:', error);
      const nome = (error as { name?: string })?.name;
      const texto =
        nome === 'TimeoutError' || nome === 'AbortError'
          ? 'O envio demorou demais para responder. Seus dados continuam aqui — tente de novo.'
          : 'Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.';
      setFalha(prev => ({ texto, tentativas: (prev?.tentativas ?? 0) + 1 }));
    } finally {
      if (envioTimeoutRef.current) {
        window.clearTimeout(envioTimeoutRef.current);
        envioTimeoutRef.current = null;
      }
      envioAbortRef.current = null;
      enviandoRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Leva o foco para a falha assim que ela aparece: ela nasce fora da tela em
  // formulários longos, logo acima do botão que o usuário acabou de clicar.
  useEffect(() => {
    if (falha) falhaRef.current?.focus();
  }, [falha]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    // Clear error when user starts typing
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));

    // Field-specific normalization (store clean values in state)
    if (name === 'telefone') {
      setFormData(prev => ({ ...prev, telefone: onlyDigits(value).slice(0, 11) }));
      return;
    }
    if (name === 'cpf') {
      setFormData(prev => ({ ...prev, cpf: onlyDigits(value).slice(0, 11) }));
      return;
    }
    if (name === 'cep') {
      const cepDigits = onlyDigits(value).slice(0, 8);

      // if user changes CEP, invalidate last lookup and clear cidade/estado
      if (lastCepLookupRef.current && lastCepLookupRef.current !== cepDigits) {
        lastCepLookupRef.current = null;
        setFormData(prev => ({ ...prev, cep: cepDigits, cidade: '', estado: '' }));
      } else {
        setFormData(prev => ({ ...prev, cep: cepDigits }));
      }
      return;
    }
    if (name === 'placa') {
      setFormData(prev => ({ ...prev, placa: value.toUpperCase().replace(/\s+/g, '') }));
      return;
    }
    if (name === 'estado') {
      setFormData(prev => ({
        ...prev,
        estado: value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2)
      }));
      return;
    }
    // `type="number"` ainda aceita "e", "+" e "-" digitados.
    if (name === 'velocidade_permitida' || name === 'velocidade_aferida') {
      setFormData(prev => ({ ...prev, [name]: onlyDigits(value).slice(0, 3) }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const descartarRascunho = () => {
    if (!formData.case_id) return;
    apagarRascunho(formData.case_id);
    setTemRascunho(false);
    setFormData(prev => ({
      ...INITIAL_FORM,
      form_token: prev.form_token,
      case_id: prev.case_id,
      stripe_session_id: prev.stripe_session_id
    }));
    setErrors({});
    setCidadeManual(false);
    lastCepLookupRef.current = null;
  };

  if (recibo) {
    return (
      <PageShell>
        <div className="container">
          <div className="recibo">
            <span className="eyebrow block">Protocolo interno</span>
            <h1 className="page__title mt-2">Recebemos seus dados.</h1>

            <p className="mt-4 max-w-[60ch] text-muted-foreground">
              A peça está sendo redigida agora. Quando ficar pronta, o PDF sai
              para o seu e-mail — não é preciso deixar esta página aberta.
            </p>

            <dl className="mt-8">
              <div className="field border-t border-rule">
                <dt className="field__label">Número do caso</dt>
                <dd className="recibo__protocolo">{recibo.caseId}</dd>
              </div>
              <div className="field border-t border-rule">
                <dt className="field__label">Vai chegar em</dt>
                <dd className="field__value break-all">{recibo.email}</dd>
              </div>
              <div className="field border-y border-rule">
                <dt className="field__label">Prazo</dt>
                <dd className="field__value">Alguns minutos</dd>
              </div>
            </dl>

            <p className="mt-6 max-w-[60ch] text-sm text-muted-foreground">
              Não chegou? Confira a caixa de spam e a lixeira antes de falar com
              a gente — e tenha o número do caso à mão, é por ele que
              encontramos o seu pedido.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Link to="/" className="btn btn--solid">
                Voltar ao início
              </Link>
              {SUPORTE_URL && (
                <a
                  href={SUPORTE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-foreground underline underline-offset-2"
                >
                  Falar com a gente
                </a>
              )}
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  // O pedido não veio pelo caminho do pagamento. Dizer isso agora vale mais que
  // deixar a pessoa preencher trinta campos para descobrir no botão de enviar.
  const pedidoIncompleto =
    pronto && (!formData.case_id || !formData.stripe_session_id);

  return (
    <PageShell bottomSpacer>
      <div className="container">
        <div className="max-w-4xl">
        <div className="page__head">
          <div className="progress">
            <span>Passo 2 de 2</span>
            <span className="progress__bar" aria-hidden="true">
              <span className="progress__fill" style={{ width: '50%' }} />
            </span>
            <span className="progress__done">Pagamento confirmado</span>
          </div>

          <h1 className="page__title">Os dados do auto</h1>
          <p className="max-w-[58ch] text-muted-foreground">
            Copie do papel, de cima para baixo. Os blocos abaixo seguem a mesma
            ordem da notificação de autuação. Campos com{' '}
            <span className="text-destructive">*</span> são obrigatórios.
          </p>

          {formData.case_id && (
            <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground">
              Nº do caso <span className="text-foreground">{formData.case_id}</span>
            </p>
          )}
        </div>

        {pedidoIncompleto && (
          <div className="error-message error-message--surface mb-6" role="alert">
            <p className="font-semibold">Não encontramos o seu pagamento neste navegador.</p>
            <p className="mt-1 text-sm leading-snug text-foreground">
              Abra o formulário pelo link que apareceu depois do pagamento, no
              mesmo aparelho e navegador. Se você já pagou e o link se perdeu,
              fale com a gente — a cobrança está registrada.
            </p>
            {SUPORTE_URL && (
              <a
                href={SUPORTE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm text-foreground underline underline-offset-2"
              >
                Falar com a gente
              </a>
            )}
          </div>
        )}

        {message && (
          <div
            className={`mb-6 ${message.type === 'success' ? 'success-message' : 'error-message'}`}
            role="alert"
            aria-live="polite"
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* ---- Identificação ---- */}
          <fieldset className="fieldset">
            <legend className="fieldset__legend">
              <span className="fieldset__name">Identificação</span>
              <span className="fieldset__rule" aria-hidden="true" />
            </legend>

            <div className="form-grid">
              <div className="form-field--wide">
                <label className="form-label" htmlFor="nomeCompleto">
                  Nome completo *
                </label>
                <input
                  type="text"
                  id="nomeCompleto"
                  name="nomeCompleto"
                  value={formData.nomeCompleto}
                  onChange={handleInputChange}
                  className="form-input"
                  autoComplete="name"
                  /* 40 caracteres cortavam nomes brasileiros inteiros — e o nome
                     truncado ia impresso na peça. A coluna é `text`, sem teto. */
                  maxLength={120}
                  required
                  aria-invalid={Boolean(errors.nomeCompleto)}
                  aria-describedby={errors.nomeCompleto ? 'err-nomeCompleto' : undefined}
                />
                {errors.nomeCompleto && (
                  <p className="form-error" id="err-nomeCompleto">{errors.nomeCompleto}</p>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="cpf">
                  CPF *
                </label>
                <input
                  type="text"
                  id="cpf"
                  name="cpf"
                  value={formatCPF(formData.cpf)}
                  onChange={handleInputChange}
                  placeholder="000.000.000-00"
                  className="form-input form-input--code"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  aria-invalid={Boolean(errors.cpf)}
                  aria-describedby={errors.cpf ? 'err-cpf' : undefined}
                />
                {errors.cpf && <p className="form-error" id="err-cpf">{errors.cpf}</p>}
              </div>

              <div>
                <label className="form-label" htmlFor="cnh">
                  CNH
                </label>
                <input
                  type="text"
                  id="cnh"
                  name="cnh"
                  value={formData.cnh}
                  onChange={handleInputChange}
                  className="form-input form-input--code"
                  inputMode="numeric"
                  maxLength={20}
                />
              </div>

              <div>
                <label className="form-label" htmlFor="email">
                  E-mail *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="form-input"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={160}
                  required
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'err-email' : 'hint-email'}
                />
                {errors.email ? (
                  <p className="form-error" id="err-email">{errors.email}</p>
                ) : (
                  <p className="form-hint" id="hint-email">É para cá que o PDF vai.</p>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="emailConfirma">
                  Repita o e-mail *
                </label>
                <input
                  type="email"
                  id="emailConfirma"
                  name="emailConfirma"
                  value={formData.emailConfirma}
                  onChange={handleInputChange}
                  className="form-input"
                  inputMode="email"
                  /* `email`, não `off`: o campo coleta o e-mail do próprio usuário,
                     e o SC 1.3.5 (AA) exige que esse propósito seja legível por
                     máquina — `off` justamente esconde. O `off` estava aqui para
                     impedir o autopreenchimento "esvaziar" a conferência, mas o
                     argumento não se sustenta: se o navegador preenche os dois
                     com o mesmo endereço guardado, o usuário não digitou e não
                     havia erro de digitação a pegar. A conferência existe para
                     quem digita, e para esse continua valendo inteira. */
                  autoComplete="email"
                  maxLength={160}
                  required
                  aria-invalid={Boolean(errors.emailConfirma)}
                  aria-describedby={errors.emailConfirma ? 'err-emailConfirma' : 'hint-emailConfirma'}
                />
                {errors.emailConfirma ? (
                  <p className="form-error" id="err-emailConfirma">{errors.emailConfirma}</p>
                ) : (
                  <p className="form-hint" id="hint-emailConfirma">
                    Não há segunda via automática: uma letra errada e o PDF não chega.
                  </p>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="telefone">
                  Telefone *
                </label>
                <input
                  type="tel"
                  id="telefone"
                  name="telefone"
                  value={formatTelefone(formData.telefone)}
                  onChange={handleInputChange}
                  placeholder="(11) 99999-9999"
                  className="form-input form-input--code"
                  inputMode="numeric"
                  autoComplete="tel"
                  required
                  aria-invalid={Boolean(errors.telefone)}
                  aria-describedby={errors.telefone ? 'err-telefone' : undefined}
                />
                {errors.telefone && (
                  <p className="form-error" id="err-telefone">{errors.telefone}</p>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="cep">
                  CEP *
                </label>
                <input
                  type="text"
                  id="cep"
                  name="cep"
                  value={formatCEP(formData.cep)}
                  onChange={handleInputChange}
                  placeholder="00000-000"
                  className="form-input form-input--code"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  required
                  aria-invalid={Boolean(errors.cep)}
                  aria-describedby={errors.cep ? 'err-cep' : undefined}
                />
                {errors.cep && <p className="form-error" id="err-cep">{errors.cep}</p>}
              </div>

              {/* A busca por CEP é conveniência: quando ela falha — e o ViaCEP é
                  serviço de terceiros sem SLA — os dois campos voltam a ser do
                  usuário, em vez de travar o formulário. */}
              {cidadeManual || errors.cidade || errors.estado ? (
                <div className="grid grid-cols-[1fr_5rem] gap-x-3">
                  <div>
                    <label className="form-label" htmlFor="cidade">
                      Cidade *
                    </label>
                    <input
                      type="text"
                      id="cidade"
                      name="cidade"
                      value={formData.cidade}
                      onChange={handleInputChange}
                      className="form-input"
                      autoComplete="address-level2"
                      maxLength={80}
                      required
                      aria-invalid={Boolean(errors.cidade)}
                      aria-describedby={errors.cidade ? 'err-cidade' : undefined}
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="estado">
                      UF *
                    </label>
                    <input
                      type="text"
                      id="estado"
                      name="estado"
                      value={formData.estado}
                      onChange={handleInputChange}
                      className="form-input form-input--code uppercase"
                      autoComplete="address-level1"
                      maxLength={2}
                      required
                      aria-invalid={Boolean(errors.estado)}
                    />
                  </div>
                  {(errors.cidade || errors.estado) && (
                    <p className="form-error col-span-2" id="err-cidade">
                      {errors.cidade || errors.estado}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <span className="form-label">Cidade / UF</span>
                  <p className="form-readonly" aria-live="polite">
                    {formData.cidade
                      ? `${formData.cidade} · ${formData.estado}`
                      : 'Preenchido pelo CEP'}
                  </p>
                  <button
                    type="button"
                    className="form-hint underline underline-offset-2"
                    onClick={() => setCidadeManual(true)}
                  >
                    Preencher à mão
                  </button>
                </div>
              )}

              <div className="form-field--wide">
                <label className="form-label" htmlFor="endereco">
                  Endereço completo *
                </label>
                <input
                  type="text"
                  id="endereco"
                  name="endereco"
                  value={formData.endereco}
                  onChange={handleInputChange}
                  className="form-input"
                  autoComplete="street-address"
                  maxLength={200}
                  required
                  aria-invalid={Boolean(errors.endereco)}
                  aria-describedby={errors.endereco ? 'err-endereco' : undefined}
                />
                {errors.endereco && (
                  <p className="form-error" id="err-endereco">{errors.endereco}</p>
                )}
              </div>
            </div>
          </fieldset>

          {/* ---- Veículo ---- */}
          <fieldset className="fieldset">
            <legend className="fieldset__legend">
              <span className="fieldset__name">Veículo</span>
              <span className="fieldset__rule" aria-hidden="true" />
            </legend>

            <div className="form-grid">
              <div>
                <label className="form-label" htmlFor="placa">
                  Placa *
                </label>
                <input
                  type="text"
                  id="placa"
                  name="placa"
                  value={formData.placa}
                  onChange={handleInputChange}
                  placeholder="ABC1D23"
                  className="form-input form-input--code uppercase"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={7}
                  required
                  aria-invalid={Boolean(errors.placa)}
                  aria-describedby={errors.placa ? 'err-placa' : 'hint-placa'}
                />
                {errors.placa ? (
                  <p className="form-error" id="err-placa">{errors.placa}</p>
                ) : (
                  <p className="form-hint" id="hint-placa">Mercosul ou o formato antigo.</p>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="renainf">
                  Código RENAINF
                </label>
                <input
                  type="text"
                  id="renainf"
                  name="renainf"
                  value={formData.renainf}
                  onChange={handleInputChange}
                  className="form-input form-input--code"
                  maxLength={30}
                  aria-invalid={Boolean(errors.renainf)}
                  /* A explicação da regra é uma só, e vive sob os outros dois
                     campos — repeti-la aqui imprimiria a mesma frase duas vezes
                     na tela. O leitor de tela chega nela pelo mesmo id. */
                  aria-describedby="hint-identificadores"
                />
              </div>

              <div className="form-field--wide">
                <label className="form-label" htmlFor="marcaModeloEspecie">
                  Marca / modelo / espécie
                </label>
                <input
                  type="text"
                  id="marcaModeloEspecie"
                  name="marcaModeloEspecie"
                  value={formData.marcaModeloEspecie}
                  onChange={handleInputChange}
                  className="form-input"
                  maxLength={120}
                />
              </div>
            </div>
          </fieldset>

          {/* ---- Autuação ---- */}
          <fieldset className="fieldset">
            <legend className="fieldset__legend">
              <span className="fieldset__name">Autuação</span>
              <span className="fieldset__rule" aria-hidden="true" />
            </legend>

            {/* O estágio abre o bloco porque decide a peça inteira: a quem ela é
                endereçada e qual artigo do CTB a fundamenta. */}
            <fieldset className="mb-5">
              <legend className="form-label">Em que estágio está o seu caso? *</legend>
              <div className="choice-group" role="radiogroup" aria-describedby="hint-estagio">
                {ESTAGIOS.map((estagio, i) => (
                  <label className="choice" key={estagio.valor}>
                    <input
                      type="radio"
                      className="choice__input"
                      id={i === 0 ? 'estagio' : undefined}
                      name="estagio"
                      value={estagio.valor}
                      checked={formData.estagio === estagio.valor}
                      onChange={handleInputChange}
                      aria-invalid={Boolean(errors.estagio)}
                    />
                    <span>
                      <span className="choice__name">{estagio.nome}</span>
                      <span className="choice__desc">{estagio.descricao}</span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.estagio ? (
                <p className="form-error" id="hint-estagio">{errors.estagio}</p>
              ) : (
                <p className="form-hint" id="hint-estagio">
                  Está escrito no alto do papel que você recebeu.
                </p>
              )}
            </fieldset>

            <div className="form-grid">
              <div className="form-field--wide">
                <label className="form-label" htmlFor="orgaoAutuador">
                  Órgão autuador *
                </label>
                <input
                  type="text"
                  id="orgaoAutuador"
                  name="orgaoAutuador"
                  value={formData.orgaoAutuador}
                  onChange={handleInputChange}
                  placeholder="DETRAN · RJ"
                  className="form-input"
                  maxLength={120}
                  required
                  aria-invalid={Boolean(errors.orgaoAutuador)}
                  aria-describedby={errors.orgaoAutuador ? 'err-orgaoAutuador' : undefined}
                />
                {errors.orgaoAutuador && (
                  <p className="form-error" id="err-orgaoAutuador">{errors.orgaoAutuador}</p>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="autoInfracao">
                  Nº do auto de infração
                </label>
                <input
                  type="text"
                  id="autoInfracao"
                  name="autoInfracao"
                  value={formData.autoInfracao}
                  onChange={handleInputChange}
                  className="form-input form-input--code"
                  maxLength={30}
                  aria-invalid={Boolean(errors.autoInfracao)}
                  aria-describedby="hint-identificadores"
                />
              </div>

              <div>
                <label className="form-label" htmlFor="notificacaoPenalidade">
                  Nº da notificação de penalidade
                </label>
                <input
                  type="text"
                  id="notificacaoPenalidade"
                  name="notificacaoPenalidade"
                  value={formData.notificacaoPenalidade}
                  onChange={handleInputChange}
                  className="form-input form-input--code"
                  maxLength={30}
                  aria-invalid={Boolean(errors.notificacaoPenalidade)}
                  aria-describedby="hint-identificadores"
                />
              </div>

              <p
                className={`form-field--wide ${errors.autoInfracao ? 'form-error' : 'form-hint'}`}
                id="hint-identificadores"
              >
                {REGRA_IDENTIFICADORES}
              </p>

              <div>
                <label className="form-label" htmlFor="dataHora">
                  Data e hora da infração *
                </label>
                <input
                  type="datetime-local"
                  id="dataHora"
                  name="dataHora"
                  value={formData.dataHora}
                  onChange={handleInputChange}
                  className="form-input form-input--code"
                  max={maxDataHora}
                  required
                  aria-invalid={Boolean(errors.dataHora)}
                  aria-describedby={errors.dataHora ? 'err-dataHora' : 'eco-dataHora'}
                />
                {errors.dataHora ? (
                  <p className="form-error" id="err-dataHora">{errors.dataHora}</p>
                ) : (
                  <p className="form-hint font-mono text-foreground" id="eco-dataHora" aria-live="polite">
                    {dataPorExtenso ?? 'Dia, mês, ano e hora que estão no papel.'}
                  </p>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="expedidaEm">
                  NA ou NP expedida em
                </label>
                <input
                  type="text"
                  id="expedidaEm"
                  name="expedidaEm"
                  value={formData.expedidaEm}
                  onChange={handleInputChange}
                  className="form-input"
                  maxLength={60}
                />
              </div>

              <div className="form-field--wide">
                <label className="form-label" htmlFor="localSentido">
                  Local e sentido da via *
                </label>
                <input
                  type="text"
                  id="localSentido"
                  name="localSentido"
                  value={formData.localSentido}
                  onChange={handleInputChange}
                  className="form-input"
                  maxLength={200}
                  required
                  aria-invalid={Boolean(errors.localSentido)}
                  aria-describedby={errors.localSentido ? 'err-localSentido' : undefined}
                />
                {errors.localSentido && (
                  <p className="form-error" id="err-localSentido">{errors.localSentido}</p>
                )}
              </div>

              <div className="form-field--wide">
                <label className="form-label" htmlFor="descricaoInfracao">
                  Descrição da infração
                </label>
                <input
                  type="text"
                  id="descricaoInfracao"
                  name="descricaoInfracao"
                  value={formData.descricaoInfracao}
                  onChange={handleInputChange}
                  className="form-input"
                  maxLength={300}
                  aria-describedby="hint-descricao"
                />
                <p className="form-hint" id="hint-descricao">
                  Copie como está escrito no papel.
                </p>
              </div>

              <div>
                <label className="form-label" htmlFor="amparoLegal">
                  Amparo legal da autuação
                </label>
                <input
                  type="text"
                  id="amparoLegal"
                  name="amparoLegal"
                  value={formData.amparoLegal}
                  onChange={handleInputChange}
                  placeholder="Art. 218, II, do CTB"
                  className="form-input"
                  maxLength={120}
                />
              </div>

              <div className="grid grid-cols-2 gap-x-3">
                <div>
                  <label className="form-label" htmlFor="velocidade_permitida">
                    Vel. permitida
                  </label>
                  <input
                    type="text"
                    id="velocidade_permitida"
                    name="velocidade_permitida"
                    value={formData.velocidade_permitida}
                    onChange={handleInputChange}
                    className="form-input form-input--code"
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="km/h"
                    aria-invalid={Boolean(errors.velocidade_permitida)}
                    aria-describedby={
                      errors.velocidade_permitida ? 'err-velocidade_permitida' : undefined
                    }
                  />
                  {errors.velocidade_permitida && (
                    <p className="form-error" id="err-velocidade_permitida">
                      {errors.velocidade_permitida}
                    </p>
                  )}
                </div>
                <div>
                  <label className="form-label" htmlFor="velocidade_aferida">
                    Vel. aferida
                  </label>
                  <input
                    type="text"
                    id="velocidade_aferida"
                    name="velocidade_aferida"
                    value={formData.velocidade_aferida}
                    onChange={handleInputChange}
                    className="form-input form-input--code"
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="km/h"
                    aria-invalid={Boolean(errors.velocidade_aferida)}
                    aria-describedby={
                      errors.velocidade_aferida ? 'err-velocidade_aferida' : undefined
                    }
                  />
                  {errors.velocidade_aferida && (
                    <p className="form-error" id="err-velocidade_aferida">
                      {errors.velocidade_aferida}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </fieldset>

          {/* ---- Sua versão ---- */}
          <fieldset className="fieldset">
            <legend className="fieldset__legend">
              <span className="fieldset__name">Sua versão</span>
              <span className="fieldset__rule" aria-hidden="true" />
            </legend>

            <label className="form-label" htmlFor="justificativa">
              O que aconteceu? *
            </label>
            <textarea
              id="justificativa"
              name="justificativa"
              value={formData.justificativa}
              onChange={handleInputChange}
              rows={5}
              className="form-input"
              maxLength={MAX_JUSTIFICATIVA}
              placeholder="Conte com suas palavras. Quanto mais concreto, melhor a peça — datas, distâncias, sinalização, o que você viu."
              required
              aria-invalid={Boolean(errors.justificativa)}
              aria-describedby={errors.justificativa ? 'err-justificativa' : 'hint-justificativa'}
            />
            <div className="flex items-start justify-between gap-4">
              {errors.justificativa ? (
                <p className="form-error" id="err-justificativa">{errors.justificativa}</p>
              ) : (
                <p className="form-hint" id="hint-justificativa">
                  É este texto que a IA usa para montar a defesa.
                </p>
              )}
              {/* Só quando o teto se aproxima: um contador permanente vira ruído. */}
              {formData.justificativa.length > MAX_JUSTIFICATIVA * 0.75 && (
                <p className="form-counter" aria-live="polite">
                  {formData.justificativa.length} / {MAX_JUSTIFICATIVA}
                </p>
              )}
            </div>
          </fieldset>

          {falha && (
            <div
              ref={falhaRef}
              tabIndex={-1}
              role="alert"
              className="error-message error-message--surface mt-5"
            >
              <p className="font-semibold">Não conseguimos enviar.</p>
              <p className="mt-1 text-sm leading-snug text-foreground">{falha.texto}</p>
              {/* Só depois da segunda falha seguida: antes disso, tentar de novo resolve. */}
              {falha.tentativas >= 2 && SUPORTE_URL && (
                <a
                  href={SUPORTE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm text-foreground underline underline-offset-2"
                >
                  Falar com a gente
                </a>
              )}
            </div>
          )}

          <div className="form-actions">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`btn ${isSubmitting ? 'btn--disabled' : 'btn--solid'} px-8 py-4 text-lg`}
            >
              {isSubmitting ? 'Enviando…' : 'Enviar e gerar recurso'}
            </button>
            <p className="note">Você recebe o PDF por e-mail</p>
          </div>

          {temRascunho && (
            <p className="form-rascunho">
              <span>Rascunho guardado neste aparelho.</span>{' '}
              <button type="button" onClick={descartarRascunho} className="underline underline-offset-2">
                Limpar
              </button>
            </p>
          )}
        </form>
        </div>
      </div>
    </PageShell>
  );
};

export default Form;
