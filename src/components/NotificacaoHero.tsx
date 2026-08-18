/**
 * Assinatura do hero: a réplica de uma notificação de autuação recebendo, por
 * cima, a primeira página do recurso — e o carimbo.
 *
 * A sequência de carregamento roda uma única vez, no load, encadeada pelos
 * delays declarados em `tailwind.config.ts`: o auto assenta (180ms), a folha
 * do recurso desliza (240ms), o carimbo cai (200ms). Todas as animações usam
 * `fill-mode: both`, então a guarda global de `prefers-reduced-motion` em
 * `src/index.css` entrega o estado final sem movimento.
 *
 * Os dados são um exemplo. Nenhum deles vem do usuário.
 */

type NotificacaoHeroProps = {
  className?: string;
};

const NotificacaoHero = ({ className = '' }: NotificacaoHeroProps) => (
  <figure className={`notice ${className}`}>
    <figcaption className="sr-only">
      Exemplo: uma notificação de autuação por excesso de velocidade, no valor de
      R$ 293,47, coberta pela primeira página do recurso gerado e pelo carimbo
      &ldquo;recurso protocolado&rdquo;.
    </figcaption>

    <div className="notice__auto animate-notice-settle">
      <span className="notice__flag" aria-hidden="true" />

      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="eyebrow block">Órgão autuador</span>
          <span className="field__value">DETRAN · RJ</span>
        </div>
        <span className="eyebrow whitespace-nowrap">Nº E1234567</span>
      </div>

      <hr className="rule" />

      <p className="notice__title">
        Notificação
        <br />
        de autuação
      </p>

      <hr className="rule" />

      <div className="grid grid-cols-2 gap-x-4">
        <div className="field">
          <span className="field__label">Placa</span>
          <span className="field__value tracking-widest">ABC1D23</span>
        </div>
        <div className="field">
          <span className="field__label">Data e hora</span>
          <span className="field__value">12/03 14:07</span>
        </div>
      </div>

      <hr className="rule" />

      <div className="field">
        <span className="field__label">Infração</span>
        <span className="field__value">Art. 218, II</span>
        <span className="notice__desc">
          Velocidade superior à máxima em até 20%
        </span>
      </div>

      <hr className="rule" />

      <div className="grid grid-cols-2 gap-x-4">
        <div className="field">
          <span className="field__label">Valor</span>
          <span className="notice__valor">R$ 293,47</span>
        </div>
        <div className="field">
          <span className="field__label">Prazo de defesa</span>
          <span className="notice__valor">30 dias</span>
        </div>
      </div>
    </div>

    <div className="notice__resposta animate-sheet-slide">
      <span className="eyebrow block text-primary">Recurso administrativo</span>

      <p className="notice__peca mt-2 pb-2">
        Ilustríssimo Senhor Presidente da JARI — o requerente, já qualificado,
        vem apresentar recurso contra a autuação em epígrafe, com fundamento no
        art. 281 do Código de Trânsito Brasileiro…
      </p>

      <span className="stamp notice__stamp animate-stamp-drop" aria-hidden="true">
        Recurso protocolado
      </span>
    </div>
  </figure>
);

export default NotificacaoHero;
