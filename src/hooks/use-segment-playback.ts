import { useCallback, useEffect, useRef, useState } from "react";

const BASE_TICK_MS = 80;

export interface SegmentPlaybackState {
  playing: boolean;
  idx: number;
  speed: number;
  totalPoints: number;
}

export function useSegmentPlayback(
  totalPoints: number,
  segmentKey: string | number | null,
  defaultSpeed = 1,
) {
  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState(defaultSpeed);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Reset when segment changes
  useEffect(() => {
    clearTimer();
    setPlaying(false);
    setIdx(0);
    setSpeed(defaultSpeed);
  }, [defaultSpeed, segmentKey]);

  useEffect(() => () => clearTimer(), []);

  // Manage interval based on playing/speed
  useEffect(() => {
    clearTimer();
    if (!playing || totalPoints < 2) return;

    intervalRef.current = setInterval(
      () => {
        setIdx((prev) => {
          const next = prev + 1;
          if (next >= totalPoints - 1) {
            clearTimer();
            setPlaying(false);
            return totalPoints - 1;
          }
          return next;
        });
      },
      Math.max(16, BASE_TICK_MS / speed),
    );

    return clearTimer;
  }, [playing, speed, totalPoints]);

  const play = useCallback(() => {
    if (totalPoints < 2) return;
    setIdx((prev) => (prev >= totalPoints - 1 ? 0 : prev));
    setPlaying(true);
  }, [totalPoints]);

  const pause = useCallback(() => setPlaying(false), []);
  const restart = useCallback(() => {
    setIdx(0);
    if (totalPoints >= 2) setPlaying(true);
  }, [totalPoints]);
  const seek = useCallback(
    (next: number) => {
      setIdx(Math.max(0, Math.min(totalPoints - 1, Math.round(next))));
    },
    [totalPoints],
  );

  return { playing, idx, speed, setSpeed, play, pause, restart, seek };
}
