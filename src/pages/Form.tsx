import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface FormData {
  nomeCompleto: string;
  email: string;
  telefone: string;
  cpf: string;
  cnh: string;
  cep: string;
  endereco: string;
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
  form_token: string;
}

const Form = () => {
  const [formData, setFormData] = useState<FormData>({
    nomeCompleto: '',
    email: '',
    telefone: '',
    cpf: '',
    cnh: '',
    cep: '',
    endereco: '',
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
    form_token: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // Get or create form token
    let token = localStorage.getItem('form_token');
    if (!token) {
      token = uuidv4();
      localStorage.setItem('form_token', token);
    }
    setFormData(prev => ({ ...prev, form_token: token! }));
  }, []);

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
    const cpfDigits = formData.cpf.replace(/\D/g, '');
    if (formData.cpf && cpfDigits.length !== 11) {
      newErrors.cpf = 'CPF deve ter 11 dígitos';
    }

    // CEP validation (8 digits)
    const cepDigits = formData.cep.replace(/\D/g, '');
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
      newErrors.autoInfracao = 'Preencha pelo menos um: Nº do auto, RENAINF ou Nº da notificação';
      newErrors.renainf = 'Preencha pelo menos um: Nº do auto, RENAINF ou Nº da notificação';
      newErrors.notificacaoPenalidade = 'Preencha pelo menos um: Nº do auto, RENAINF ou Nº da notificação';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const normalizeData = (data: FormData) => {
    return {
      ...data,
      email: data.email.trim().toLowerCase(),
      telefone: data.telefone.replace(/\D/g, ''),
      cpf: data.cpf.replace(/\D/g, ''),
      cep: data.cep.replace(/\D/g, ''),
      placa: data.placa.toUpperCase().replace(/\s+/g, ''),
      autoInfracao: data.autoInfracao.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      renainf: data.renainf.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      notificacaoPenalidade: data.notificacaoPenalidade.toUpperCase().replace(/[^A-Z0-9]/g, '')
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setMessage({ type: 'error', text: 'Por favor, corrija os erros no formulário.' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const normalizedData = normalizeData(formData);
      
      // Send form data to Supabase Edge Function `form-submit` instead of n8n webhook
      const response = await fetch(import.meta.env.VITE_FORM_SUBMIT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(normalizedData)
      });

      if (response.ok) {
        setMessage({
          type: 'success',
          text: 'Recebemos seus dados. Se o pagamento já foi concluído, sua petição será gerada e enviada por e-mail. Caso ainda não tenha pago, finalize o pagamento para liberar a geração.'
        });
        // Clear form
        setFormData(prev => ({
          nomeCompleto: '', email: '', telefone: '', cpf: '', cnh: '', cep: '', endereco: '',
          orgaoAutuador: '', notificacaoPenalidade: '', especieDocumento: '', autoInfracao: '',
          expedidaEm: '', placa: '', marcaModeloEspecie: '', localSentido: '', dataHora: '',
          renainf: '', descricaoInfracao: '', amparoLegal: '', justificativa: '', form_token: prev.form_token
        }));
        setErrors({});
      } else {
        throw new Error('Erro no servidor');
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Erro ao enviar formulário. Tente novamente em alguns instantes.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const formatTelefone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };

  const formatCPF = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const formatCEP = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.replace(/(\d{5})(\d{3})/, '$1-$2');
  };

  return (
    <div className="min-h-screen py-12 bg-background">
      <div className="container max-w-4xl mx-auto">
        <div className="bg-card rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              Formulário de Recurso
            </h1>
            <p className="text-muted-foreground">
              Preencha todos os dados para gerar seu recurso de multa
            </p>
          </div>

          {message && (
            <div className={`mb-6 ${message.type === 'success' ? 'success-message' : 'error-message'}`} 
                 role="alert" aria-live="polite">
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
                  />
                  {errors.nomeCompleto && (
                    <p className="text-destructive text-sm mt-1">{errors.nomeCompleto}</p>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="email">Email *</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className={`form-input ${errors.email ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.email && (
                    <p className="text-destructive text-sm mt-1">{errors.email}</p>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="telefone">Telefone *</label>
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
                  {errors.telefone && (
                    <p className="text-destructive text-sm mt-1">{errors.telefone}</p>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="cpf">CPF *</label>
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
                  {errors.cpf && (
                    <p className="text-destructive text-sm mt-1">{errors.cpf}</p>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="cnh">CNH</label>
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
                  <label className="form-label" htmlFor="cep">CEP *</label>
                  <input
                    type="text"
                    id="cep"
                    name="cep"
                    value={formatCEP(formData.cep)}
                    onChange={handleInputChange}
                    placeholder="00000-000"
                    className={`form-input ${errors.cep ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.cep && (
                    <p className="text-destructive text-sm mt-1">{errors.cep}</p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="form-label" htmlFor="endereco">Endereço Completo *</label>
                  <input
                    type="text"
                    id="endereco"
                    name="endereco"
                    value={formData.endereco}
                    onChange={handleInputChange}
                    className={`form-input ${errors.endereco ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.endereco && (
                    <p className="text-destructive text-sm mt-1">{errors.endereco}</p>
                  )}
                </div>
              </div>
            </section>

            {/* Dados do Auto de Infração */}
            <section>
              <h2 className="text-2xl font-semibold mb-4 text-primary">Dados do Auto de Infração</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label" htmlFor="orgaoAutuador">Órgão Autuador *</label>
                  <input
                    type="text"
                    id="orgaoAutuador"
                    name="orgaoAutuador"
                    value={formData.orgaoAutuador}
                    onChange={handleInputChange}
                    className={`form-input ${errors.orgaoAutuador ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.orgaoAutuador && (
                    <p className="text-destructive text-sm mt-1">{errors.orgaoAutuador}</p>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="placa">Placa do Veículo *</label>
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
                  {errors.placa && (
                    <p className="text-destructive text-sm mt-1">{errors.placa}</p>
                  )}
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
                  {errors.autoInfracao && (
                    <p className="text-destructive text-sm mt-1">{errors.autoInfracao}</p>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="renainf">Código RENAINF</label>
                  <input
                    type="text"
                    id="renainf"
                    name="renainf"
                    value={formData.renainf}
                    onChange={handleInputChange}
                    className={`form-input ${errors.renainf ? 'border-destructive' : ''}`}
                  />
                  {errors.renainf && (
                    <p className="text-destructive text-sm mt-1">{errors.renainf}</p>
                  )}
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
                  <label className="form-label" htmlFor="dataHora">Data e Hora da Infração *</label>
                  <input
                    type="datetime-local"
                    id="dataHora"
                    name="dataHora"
                    value={formData.dataHora}
                    onChange={handleInputChange}
                    className={`form-input ${errors.dataHora ? 'border-destructive' : ''}`}
                    required
                  />
                  {errors.dataHora && (
                    <p className="text-destructive text-sm mt-1">{errors.dataHora}</p>
                  )}
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
                  {errors.localSentido && (
                    <p className="text-destructive text-sm mt-1">{errors.localSentido}</p>
                  )}
                </div>

                <div>
                  <label className="form-label" htmlFor="marcaModeloEspecie">Marca/Modelo/Espécie</label>
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
                  <label className="form-label" htmlFor="especieDocumento">Espécie do Documento</label>
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
                  <label className="form-label" htmlFor="expedidaEm">NA ou NP Expedida em</label>
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
                  <label className="form-label" htmlFor="descricaoInfracao">Descrição da Infração</label>
                  <input
                    type="text"
                    id="descricaoInfracao"
                    name="descricaoInfracao"
                    value={formData.descricaoInfracao}
                    onChange={handleInputChange}
                    className="form-input"
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
                  <label className="form-label" htmlFor="justificativa">Justificativa *</label>
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
                  {errors.justificativa && (
                    <p className="text-destructive text-sm mt-1">{errors.justificativa}</p>
                  )}
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