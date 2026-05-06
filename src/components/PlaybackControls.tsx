import type { SessionSegment } from "@/types/session";
import { Slider } from "@/components/ui/slider";
import { formatDuration } from "@/lib/format";

interface PlaybackControlsProps {
  segment: SessionSegment | null;
  hasPrev: boolean;
  hasNext: boolean;
  playing: boolean;
  idx: number;
  totalPoints: number;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (idx: number) => void;
  onSpeedChange: (speed: number) => void;
}

const SPEEDS = [0.5, 1, 1.5, 2, 4];

export function PlaybackControls({
  segment,
  hasPrev,
  hasNext,
  playing,
  idx,
  totalPoints,
  speed,
  onPlay,
  onPause,
  onRestart,
  onPrev,
  onNext,
  onSeek,
  onSpeedChange,
}: PlaybackControlsProps) {
  if (!segment) {
    return (
      <div className="glass-card rounded-2xl p-5">
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
          Playback
        </div>
        <p className="text-sm text-muted-foreground">
          Select a segment to review playback
        </p>
      </div>
    );
  }

  const progress = totalPoints > 1 ? idx / (totalPoints - 1) : 0;
  const currentTime = segment.duration_s * progress;

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-primary pulse-glow shrink-0" />
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground truncate">
            Playback · {segment.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md transition-colors cursor-pointer ${
                speed === s
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <IconButton onClick={onPrev} disabled={!hasPrev} label="Previous segment">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M6 5h2v14H6V5zm3.5 7l8.5 6V6l-8.5 6z" />
          </svg>
        </IconButton>

        <IconButton onClick={onRestart} label="Restart segment">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
            <path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round" />
            <path d="M3 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>

        <button
          onClick={playing ? onPause : onPlay}
          className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </button>

        <IconButton onClick={onNext} disabled={!hasNext} label="Next segment">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M16 5h2v14h-2V5zM6 18l8.5-6L6 6v12z" />
          </svg>
        </IconButton>

        <div className="flex-1 flex items-center gap-3 min-w-0">
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
            {formatDuration(currentTime)}
          </span>
          <Slider
            value={[idx]}
            min={0}
            max={Math.max(1, totalPoints - 1)}
            step={1}
            onValueChange={(v) => onSeek(v[0])}
            className="flex-1"
          />
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
            {formatDuration(segment.duration_s)}
          </span>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground/80 hover:text-foreground hover:bg-secondary/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}
