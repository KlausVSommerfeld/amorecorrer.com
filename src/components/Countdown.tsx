import { useState, useEffect } from 'react';

const TIMER_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

const Countdown = () => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    // Get or set promo expiration time
    const getPromoExpiration = () => {
      const stored = sessionStorage.getItem('promo_expires_at');
      if (stored) {
        return parseInt(stored);
      } else {
        const expiresAt = Date.now() + TIMER_DURATION;
        sessionStorage.setItem('promo_expires_at', expiresAt.toString());
        return expiresAt;
      }
    };

    const expiresAt = getPromoExpiration();
    
    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, expiresAt - now);
      
      if (remaining === 0) {
        setIsExpired(true);
      }
      
      setTimeLeft(remaining);
    };

    // Update immediately
    updateTimer();

    // Update every second
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (isExpired) {
    return (
      <div className="timer-highlight bg-muted text-muted-foreground">
        Promoção encerrada
      </div>
    );
  }

  return (
    <div className="timer-highlight animate-pulse">
      ⏰ {formatTime(timeLeft)}
    </div>
  );
};

export default Countdown;