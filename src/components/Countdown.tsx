import { usePromo } from '../hooks/use-promo';

const pad = (value: number) => value.toString().padStart(2, '0');

/**
 * Prazo da promoção. Mono tabular no vermelho da paleta, sem pulso: o dígito
 * muda a cada segundo, o layout não treme. Quem decide o que aparece depois do
 * fim do prazo é a página — aqui o componente simplesmente sai de cena.
 */
const Countdown = () => {
  const { msLeft, isExpired } = usePromo();

  if (isExpired) return null;

  const totalSeconds = Math.floor(msLeft / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    <time
      className="countdown"
      dateTime={`PT${minutes}M${seconds}S`}
      aria-label={`Faltam ${minutes} minutos e ${seconds} segundos`}
    >
      {pad(minutes)}:{pad(seconds)}
    </time>
  );
};

export default Countdown;
