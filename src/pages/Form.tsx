import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getCaseIdFromUrl } from '../lib/caseId';
import { submitForm, assertResponseOk } from '../lib/api';

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

      setMessage({
        type: 'success',
        text: 'Recebemos seus dados. Se o pagamento ja foi concluido, sua peticao sera gerada e enviada por e-mail. Caso ainda nao tenha pago, finalize o pagamento para liberar a geracao.'
      });

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

  return (
    <div className="min-h-screen py-12 bg-background">
      <div className="container max-w-4xl mx-auto">
        <div className="bg-card rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Formulário de Recurso</h1>
            <p className="text-muted-foreground">Preencha todos os dados para gerar seu recurso de multa</p>
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

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Dados Pessoais */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">Dados Pessoais</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label" htmlFor="nomeCompleto">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    id="nomeCompleto"
                    name="nomeCompleto"
                    value={formData.nomeCompleto}
                    onChange={handleInputChange}
                    className={`form-input ${errors.nomeCompleto ? 'border-destructive' : ''}`}
                    required
                    maxLength={40}
                  />
                  {errors.nomeCompleto && <p className="text-destructive text-sm mt-1">{errors.nomeCompleto}</p>}
                </div>

                <div>
                  <label className="form-label" htmlFor="email">
                    Email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className={`form-input ${errors.email ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.email && <p className="text-destructive text-sm mt-1">{errors.email}</p>}
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
                    className={`form-input ${errors.telefone ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.telefone && <p className="text-destructive text-sm mt-1">{errors.telefone}</p>}
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
                    className={`form-input ${errors.cpf ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.cpf && <p className="text-destructive text-sm mt-1">{errors.cpf}</p>}
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
                    className="form-input"
                  />
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
                    className={`form-input ${errors.cep ? 'border-destructive' : ''}`}
                    required
                    inputMode="numeric"
                  />
                  {errors.cep && <p className="text-destructive text-sm mt-1">{errors.cep}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="form-label" htmlFor="endereco">
                    Endereço Completo *
                  </label>
                  <input
                    type="text"
                    id="endereco"
                    name="endereco"
                    value={formData.endereco}
                    onChange={handleInputChange}
                    className={`form-input ${errors.endereco ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.endereco && <p className="text-destructive text-sm mt-1">{errors.endereco}</p>}
                </div>
              </div>
            </section>

            {/* Dados do Auto de Infração */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">Dados do Auto de Infração</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label" htmlFor="orgaoAutuador">
                    Órgão Autuador *
                  </label>
                  <input
                    type="text"
                    id="orgaoAutuador"
                    name="orgaoAutuador"
                    value={formData.orgaoAutuador}
                    onChange={handleInputChange}
                    className={`form-input ${errors.orgaoAutuador ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.orgaoAutuador && <p className="text-destructive text-sm mt-1">{errors.orgaoAutuador}</p>}
                </div>

                <div>
                  <label className="form-label" htmlFor="placa">
                    Placa do Veículo *
                  </label>
                  <input
                    type="text"
                    id="placa"
                    name="placa"
                    value={formData.placa}
                    onChange={handleInputChange}
                    placeholder="ABC1D23"
                    className={`form-input ${errors.placa ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.placa && <p className="text-destructive text-sm mt-1">{errors.placa}</p>}
                </div>

                <div>
                  <label className="form-label" htmlFor="autoInfracao">
                    Nº do Auto de Infração *
                  </label>
                  <input
                    type="text"
                    id="autoInfracao"
                    name="autoInfracao"
                    value={formData.autoInfracao}
                    onChange={handleInputChange}
                    className={`form-input ${errors.autoInfracao ? 'border-destructive' : ''}`}
                  />
                  {errors.autoInfracao && <p className="text-destructive text-sm mt-1">{errors.autoInfracao}</p>}
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
                    className={`form-input ${errors.renainf ? 'border-destructive' : ''}`}
                  />
                  {errors.renainf && <p className="text-destructive text-sm mt-1">{errors.renainf}</p>}
                </div>

                <div>
                  <label className="form-label" htmlFor="notificacaoPenalidade">
                    Nº da Notificação de Penalidade
                  </label>
                  <input
                    type="text"
                    id="notificacaoPenalidade"
                    name="notificacaoPenalidade"
                    value={formData.notificacaoPenalidade}
                    onChange={handleInputChange}
                    className={`form-input ${errors.notificacaoPenalidade ? 'border-destructive' : ''}`}
                  />
                  {errors.notificacaoPenalidade && (
                    <p className="text-destructive text-sm mt-1">{errors.notificacaoPenalidade}</p>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="dataHora">
                    Data e Hora da Infração *
                  </label>
                  <input
                    type="datetime-local"
                    id="dataHora"
                    name="dataHora"
                    value={formData.dataHora}
                    onChange={handleInputChange}
                    className={`form-input ${errors.dataHora ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.dataHora && <p className="text-destructive text-sm mt-1">{errors.dataHora}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="form-label" htmlFor="localSentido">
                    Local da Infração / Sentido da Via *
                  </label>
                  <input
                    type="text"
                    id="localSentido"
                    name="localSentido"
                    value={formData.localSentido}
                    onChange={handleInputChange}
                    className={`form-input ${errors.localSentido ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.localSentido && <p className="text-destructive text-sm mt-1">{errors.localSentido}</p>}
                </div>

                <div>
                  <label className="form-label" htmlFor="marcaModeloEspecie">
                    Marca/Modelo/Espécie
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

                <div>
                  <label className="form-label" htmlFor="especieDocumento">
                    Espécie do Documento
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
                  <label className="form-label" htmlFor="expedidaEm">
                    NA ou NP Expedida em
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

                <div>
                  <label className="form-label" htmlFor="descricaoInfracao">
                    Descrição da Infração
                  </label>
                  <input
                    type="text"
                    id="descricaoInfracao"
                    name="descricaoInfracao"
                    value={formData.descricaoInfracao}
                    onChange={handleInputChange}
                    className="form-input"
                  />
                </div>

                <div>
                  <label className="form-label" htmlFor="velocidade_permitida">
                    Velocidade Permitida (km/h)
                  </label>
                  <input
                    type="number"
                    id="velocidade_permitida"
                    name="velocidade_permitida"
                    value={formData.velocidade_permitida}
                    onChange={handleInputChange}
                    className="form-input"
                    min="0"
                  />
                </div>

                <div>
                  <label className="form-label" htmlFor="velocidade_aferida">
                    Velocidade Aferida (km/h)
                  </label>
                  <input
                    type="number"
                    id="velocidade_aferida"
                    name="velocidade_aferida"
                    value={formData.velocidade_aferida}
                    onChange={handleInputChange}
                    className="form-input"
                    min="0"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="form-label" htmlFor="amparoLegal">
                    Amparo Legal para Aplicação da Autuação
                  </label>
                  <input
                    type="text"
                    id="amparoLegal"
                    name="amparoLegal"
                    value={formData.amparoLegal}
                    onChange={handleInputChange}
                    className="form-input"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="form-label" htmlFor="justificativa">
                    Justificativa *
                  </label>
                  <textarea
                    id="justificativa"
                    name="justificativa"
                    value={formData.justificativa}
                    onChange={handleInputChange}
                    rows={4}
                    className={`form-input ${errors.justificativa ? 'border-destructive' : ''}`}
                    placeholder="Descreva os motivos pelos quais você acredita que a multa deve ser cancelada..."
                    required
                  />
                  {errors.justificativa && <p className="text-destructive text-sm mt-1">{errors.justificativa}</p>}
                </div>
              </div>
            </section>

            <div className="text-center pt-6">
              <button
                type="submit"
                disabled={isSubmitting}
                className={`${isSubmitting ? 'btn-disabled' : 'btn-primary'} text-lg px-8 py-4`}
              >
                {isSubmitting ? 'Enviando...' : '📤 Enviar Dados e Gerar Recurso'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Form;
