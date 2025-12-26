import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface CountdownTimerProps {
  startTime: string; // ISO string
  onComplete?: () => void;
}

interface TimeRemaining {
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function getTimeRemaining(startTime: string): TimeRemaining {
  const now = new Date();
  const target = new Date(startTime);
  const diff = target.getTime() - now.getTime();

  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, total: 0 };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { hours, minutes, seconds, total: diff };
}

export function CountdownTimer({ startTime, onComplete }: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(() =>
    getTimeRemaining(startTime)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getTimeRemaining(startTime);
      setTimeRemaining(remaining);

      if (remaining.total <= 0 && onComplete) {
        onComplete();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, onComplete]);

  const { hours, minutes, seconds, total } = timeRemaining;

  if (total <= 0) {
    return (
      <div className="flex items-center justify-center gap-2 text-green-500 font-bold animate-pulse">
        <Clock className="w-5 h-5" />
        <span>BATTLE BEGINS NOW!</span>
      </div>
    );
  }

  // Color changes based on time remaining
  const isUrgent = hours === 0 && minutes < 5;
  const isWarning = hours === 0 && minutes < 30;
  
  const textColor = isUrgent 
    ? 'text-red-500' 
    : isWarning 
    ? 'text-orange-500' 
    : 'text-blue-400';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Clock className="w-4 h-4" />
        <span>Battle begins in</span>
      </div>
      <div className={`flex items-center gap-1 font-mono text-2xl sm:text-3xl font-bold ${textColor} ${isUrgent ? 'animate-pulse' : ''}`}>
        <div className="flex flex-col items-center">
          <span className="text-3xl sm:text-4xl">{hours.toString().padStart(2, '0')}</span>
          <span className="text-xs text-muted-foreground">HRS</span>
        </div>
        <span className="text-2xl sm:text-3xl pb-4">:</span>
        <div className="flex flex-col items-center">
          <span className="text-3xl sm:text-4xl">{minutes.toString().padStart(2, '0')}</span>
          <span className="text-xs text-muted-foreground">MIN</span>
        </div>
        <span className="text-2xl sm:text-3xl pb-4">:</span>
        <div className="flex flex-col items-center">
          <span className="text-3xl sm:text-4xl">{seconds.toString().padStart(2, '0')}</span>
          <span className="text-xs text-muted-foreground">SEC</span>
        </div>
      </div>
    </div>
  );
}
