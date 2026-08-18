import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { getCaseIdFromUrl } from '../lib/caseId';
import { submitForm, assertResponseOk } from '../lib/api';
import PageShell from '../components/PageShell';

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
  telefone: string; // stored as digits-only
  cpf: string; // stored as digits-only
  cnh: string;

  cep: string; // stored as digits-only
  endereco: string;

  // auto-filled via CEP (no inputs)
  cidade: string;
  estado: string;

  orgaoAutuador: string;
  notificacaoPenalidade: string;
  especieDocumento: string;
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

function toIsoFromDatetimeLocal(datetimeLocal: string): string | null {
  if (!datetimeLocal) return null;
  const date = new Date(datetimeLocal);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

const INITIAL_FORM: FormData = {
  nomeCompleto: '',
  email: '',
  telefone: '',
  cpf: '',
  cnh: '',

  cep: '',
  endereco: '',

  cidade: '',
  estado: '',

  orgaoAutuador: '',
  notificacaoPenalidade: '',
  especieDocumento: '',
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

const Form = () => {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Enviado com sucesso: o formulário sai de cena e entra o recibo.
  const [recibo, setRecibo] = useState<{ caseId: string; email: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ViaCEP lookup controls (no UI required; used to avoid repeated lookups / races)
  const lastCepLookupRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const caseId = getCaseIdFromUrl();

    let token = localStorage.getItem('form_token');
    if (!token) {
      token = uuidv4();
      localStorage.setItem('form_token', token);
    }

    const stripeSessionId = localStorage.getItem('stripe_session_id');

    setFormData(prev => ({
      ...prev,
      form_token: token!,
      case_id: caseId ?? prev.case_id,
      stripe_session_id: stripeSessionId ?? prev.stripe_session_id
    }));
  }, []);

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

    debounceRef.current = window.setTimeout(async () => {
      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`, {
          method: 'GET',
          signal: controller.signal
        });

        if (!res.ok) {
          setErrors(prev => ({ ...prev, cep: `Erro ao buscar CEP (HTTP ${res.status})` }));
          return;
        }

        const json: ViaCepResponse = await res.json();

        if (json.erro) {
          setErrors(prev => ({ ...prev, cep: 'CEP não encontrado.' }));
          return;
        }

        lastCepLookupRef.current = cepDigits;

        setFormData(prev => ({
          ...prev,
          cidade: json.localidade || '',
          estado: (json.uf || '').toUpperCase()
        }));

        // clear CEP error if any
        setErrors(prev => (prev.cep ? { ...prev, cep: '' } : prev));
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setErrors(prev => ({ ...prev, cep: 'Erro ao buscar CEP. Tente novamente.' }));
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

  // Ordem dos campos na tela, para levar o foco ao primeiro erro de cima para
  // baixo — num formulário deste tamanho, avisar sem apontar não ajuda.
  const FIELD_ORDER = [
    'nomeCompleto', 'cpf', 'email', 'telefone', 'cep', 'endereco',
    'placa', 'renainf', 'orgaoAutuador', 'autoInfracao',
    'notificacaoPenalidade', 'dataHora', 'localSentido', 'justificativa'
  ];

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Required fields
    if (!formData.nomeCompleto.trim()) newErrors.nomeCompleto = 'Nome completo é obrigatório';
    if (!formData.email.trim()) newErrors.email = 'Email é obrigatório';
    if (!formData.telefone.trim()) newErrors.telefone = 'Telefone é obrigatório';
    if (!formData.cpf.trim()) newErrors.cpf = 'CPF é obrigatório';
    if (!formData.cep.trim()) newErrors.cep = 'CEP é obrigatório';
    if (!formData.endereco.trim()) newErrors.endereco = 'Endereço é obrigatório';
    if (!formData.orgaoAutuador.trim()) newErrors.orgaoAutuador = 'Órgão Autuador é obrigatório';
    if (!formData.placa.trim()) newErrors.placa = 'Placa é obrigatória';
    if (!formData.localSentido.trim()) newErrors.localSentido = 'Local da infração é obrigatório';
    if (!formData.dataHora.trim()) newErrors.dataHora = 'Data e hora são obrigatórias';
    if (!formData.justificativa.trim()) newErrors.justificativa = 'Justificativa é obrigatória';

    // Email validation
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    // CPF validation (11 digits)
    const cpfDigits = onlyDigits(formData.cpf);
    if (formData.cpf && cpfDigits.length !== 11) {
      newErrors.cpf = 'CPF deve ter 11 dígitos';
    }

    // CEP validation (8 digits)
    const cepDigits = onlyDigits(formData.cep);
    if (formData.cep && cepDigits.length !== 8) {
      newErrors.cep = 'CEP deve ter 8 dígitos';
    }

    // Placa validation (Mercosul format)
    const placaClean = formData.placa.toUpperCase().replace(/\s+/g, '');
    if (formData.placa && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placaClean)) {
      newErrors.placa = 'Placa deve estar no formato Mercosul (ex: ABC1D23)';
    }

    // At least one identification number required
    if (!formData.autoInfracao.trim() && !formData.renainf.trim() && !formData.notificacaoPenalidade.trim()) {
      const msg = 'Preencha pelo menos um: Nº do auto, RENAINF ou Nº da notificação';
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

      // auto-filled via CEP (no inputs)
      cidade: data.cidade.trim() || null,
      estado: data.estado.trim() || null,

      orgao_autuador: data.orgaoAutuador.trim() || null,
      numero_auto: data.autoInfracao.toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
      notificacao_penalidade: data.notificacaoPenalidade.toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
      data_infracao: toIsoFromDatetimeLocal(data.dataHora),
      local_infracao: data.localSentido.trim() || null,
      placa: data.placa.toUpperCase().replace(/\s+/g, '') || null,

      renainf: data.renainf.toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
      especie_documento: data.especieDocumento.trim() || null,
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

    if (!validateForm()) {
      setMessage({ type: 'error', text: 'Por favor, corrija os erros no formulario.' });
      return;
    }

    const caseId = formData.case_id || getCaseIdFromUrl();
    if (!caseId) {
      setMessage({
        type: 'error',
        text: 'Nao encontramos seu case_id. Refaca o checkout ou use o link de retorno apos o pagamento.'
      });
      return;
    }

    if (!formData.stripe_session_id) {
      setMessage({
        type: 'error',
        text: 'Nao encontramos sua sessao de pagamento. Refaca o checkout.'
      });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const normalizedData = normalizeData({
        ...formData,
        case_id: caseId
      });

      const response = await submitForm(normalizedData);
      await assertResponseOk(response);

      setRecibo({ caseId, email: normalizedData.email });
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
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Erro ao enviar formulario. Tente novamente em alguns instantes.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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

    setFormData(prev => ({ ...prev, [name]: value }));
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

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/" className="btn btn--solid">
                Voltar ao início
              </Link>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

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
                  maxLength={40}
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

              <div>
                <span className="form-label">Cidade / UF</span>
                <p className="form-readonly" aria-live="polite">
                  {formData.cidade
                    ? `${formData.cidade} · ${formData.estado}`
                    : 'Preenchido pelo CEP'}
                </p>
              </div>

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
                  aria-describedby={errors.placa ? 'err-placa' : undefined}
                />
                {errors.placa && <p className="form-error" id="err-placa">{errors.placa}</p>}
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
                  aria-invalid={Boolean(errors.renainf)}
                  aria-describedby={errors.renainf ? 'err-renainf' : undefined}
                />
                {errors.renainf && <p className="form-error" id="err-renainf">{errors.renainf}</p>}
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
                  aria-invalid={Boolean(errors.notificacaoPenalidade)}
                  aria-describedby="hint-identificadores"
                />
              </div>

              <p
                className={`form-field--wide ${errors.autoInfracao ? 'form-error' : 'form-hint'}`}
                id="hint-identificadores"
              >
                {errors.autoInfracao
                  ? errors.autoInfracao
                  : 'Preencha ao menos um destes três: nº do auto, nº da notificação ou o RENAINF do bloco anterior.'}
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
                  required
                  aria-invalid={Boolean(errors.dataHora)}
                  aria-describedby={errors.dataHora ? 'err-dataHora' : undefined}
                />
                {errors.dataHora && (
                  <p className="form-error" id="err-dataHora">{errors.dataHora}</p>
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
                  aria-describedby="hint-descricao"
                />
                <p className="form-hint" id="hint-descricao">
                  Copie como está escrito no papel.
                </p>
              </div>

              <div>
                <label className="form-label" htmlFor="especieDocumento">
                  Espécie do documento
                </label>
                <input
                  type="text"
                  id="especieDocumento"
                  name="especieDocumento"
                  value={formData.especieDocumento}
                  onChange={handleInputChange}
                  className="form-input"
                />
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
                />
              </div>

              <div>
                <label className="form-label" htmlFor="velocidade_permitida">
                  Velocidade permitida (km/h)
                </label>
                <input
                  type="number"
                  id="velocidade_permitida"
                  name="velocidade_permitida"
                  value={formData.velocidade_permitida}
                  onChange={handleInputChange}
                  className="form-input form-input--code"
                  inputMode="numeric"
                  min="0"
                />
              </div>

              <div>
                <label className="form-label" htmlFor="velocidade_aferida">
                  Velocidade aferida (km/h)
                </label>
                <input
                  type="number"
                  id="velocidade_aferida"
                  name="velocidade_aferida"
                  value={formData.velocidade_aferida}
                  onChange={handleInputChange}
                  className="form-input form-input--code"
                  inputMode="numeric"
                  min="0"
                />
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
              placeholder="Conte com suas palavras. Quanto mais concreto, melhor a peça — datas, distâncias, sinalização, o que você viu."
              required
              aria-invalid={Boolean(errors.justificativa)}
              aria-describedby={errors.justificativa ? 'err-justificativa' : 'hint-justificativa'}
            />
            {errors.justificativa ? (
              <p className="form-error" id="err-justificativa">{errors.justificativa}</p>
            ) : (
              <p className="form-hint" id="hint-justificativa">
                É este texto que a IA usa para montar a defesa.
              </p>
            )}
          </fieldset>

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
        </form>
        </div>
      </div>
    </PageShell>
  );
};

export default Form;
