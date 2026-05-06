import { Pause, Play, RotateCcw, Scissors } from "lucide-react";
import type { SessionSegment, SessionSummary } from "@/types/session";
import { Button } from "@/components/ui/button";
import { formatDuration, formatDistance, formatTimeRange } from "@/lib/format";

interface SessionTimelineEditorProps {
  segments: SessionSegment[];
  summary: SessionSummary;
  selectedId: number | null;
  hoveredId: number | null;
  playheadIdx: number;
  totalPoints: number;
  playing: boolean;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSeek: (idx: number) => void;
  onSplitSelected: () => void;
}

export function SessionTimelineEditor({
  segments,
  summary,
  selectedId,
  hoveredId,
  playheadIdx,
  totalPoints,
  playing,
  onSelect,
  onHover,
  onPlay,
  onPause,
  onRestart,
  onSeek,
  onSplitSelected,
}: SessionTimelineEditorProps) {
  const selectedSegment = segments.find((segment) => segment.segment_id === selectedId) ?? null;
  const canSplitSelected = Boolean(
    selectedSegment &&
    selectedSegment.point_count >= 4 &&
    playheadIdx > selectedSegment.start_idx &&
    playheadIdx < selectedSegment.end_idx,
  );
  const playheadProgress = totalPoints > 1 ? playheadIdx / (totalPoints - 1) : 0;
  const currentTime = summary.duration_min * 60 * playheadProgress;
  const totalDurationMs = Math.max(
    1,
    new Date(summary.end_time).getTime() - new Date(summary.start_time).getTime(),
  );

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Session Timeline
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatTimeRange(summary.start_time, summary.end_time)}</span>
            <span className="text-border">•</span>
            <span>{formatDuration(summary.duration_min * 60)}</span>
            <span className="text-border">•</span>
            <span>{segments.length} suggested segments</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
            {formatDuration(currentTime)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSplitSelected}
            disabled={!canSplitSelected}
            className="h-8 gap-1.5 text-xs"
          >
            <Scissors className="h-3.5 w-3.5" />
            Split at playhead
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[8.5rem_1fr] sm:items-center">
        <div className="flex items-center gap-2">
          <IconButton onClick={onRestart} label="Restart full activity">
            <RotateCcw className="h-4 w-4" />
          </IconButton>
          <button
            type="button"
            onClick={playing ? onPause : onPlay}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:brightness-110 active:scale-95"
            aria-label={playing ? "Pause full activity" : "Play full activity"}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>
        </div>

        <div className="relative h-20 border border-border/60 bg-secondary/25">
          <div className="absolute inset-x-0 top-7 h-5 bg-muted/50" />
          <div className="absolute inset-x-0 top-7 h-5">
            {segments.map((segment) => {
              const startOffset =
                new Date(segment.start_time).getTime() - new Date(summary.start_time).getTime();
              const segmentDuration =
                new Date(segment.end_time).getTime() - new Date(segment.start_time).getTime();
              const left = Math.max(0, Math.min(100, (startOffset / totalDurationMs) * 100));
              const width = Math.max(
                0.35,
                Math.min(100 - left, (segmentDuration / totalDurationMs) * 100),
              );
              const active = selectedId === segment.segment_id;
              const hovered = hoveredId === segment.segment_id;

              return (
                <button
                  key={segment.segment_id}
                  type="button"
                  onClick={() => onSelect(segment.segment_id)}
                  onMouseEnter={() => onHover(segment.segment_id)}
                  onMouseLeave={() => onHover(null)}
                  aria-label={`Select ${segment.label}`}
                  title={`${segment.label} · ${formatDuration(
                    segment.duration_s,
                  )} · ${formatDistance(segment.distance_m)}`}
                  className={`absolute top-0 h-5 border-x-2 border-y transition-all ${
                    active
                      ? "z-20 border-primary bg-primary/80 shadow-[0_0_18px_var(--glow)]"
                      : hovered
                        ? "z-10 border-primary/75 bg-primary/55"
                        : "border-primary/45 bg-primary/30 hover:bg-primary/45"
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  <span className="sr-only">{segment.label}</span>
                </button>
              );
            })}
          </div>

          <div
            className="pointer-events-none absolute top-2 bottom-2 z-30 w-px bg-foreground shadow-[0_0_10px_var(--glow)]"
            style={{ left: `${playheadProgress * 100}%` }}
          >
            <div className="absolute -left-1.5 -top-1 h-3 w-3 rotate-45 border border-primary bg-background" />
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(1, totalPoints - 1)}
            step={1}
            value={playheadIdx}
            onChange={(event) => onSeek(Number(event.target.value))}
            aria-label="Full activity playhead"
            className="absolute inset-x-0 bottom-0 z-40 h-full cursor-ew-resize opacity-0"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div className="min-h-16 rounded-xl bg-secondary/35 p-3">
          {selectedSegment ? (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {selectedSegment.label}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{formatTimeRange(selectedSegment.start_time, selectedSegment.end_time)}</span>
                <span>{formatDuration(selectedSegment.duration_s)}</span>
                <span>{formatDistance(selectedSegment.distance_m)}</span>
                <span>{selectedSegment.point_count} pts</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Select a suggested segment</div>
          )}
        </div>
        <div className="grid min-w-40 grid-cols-2 gap-2 rounded-xl bg-secondary/35 p-3 text-center">
          <Metric label="Points" value={String(summary.trackpoint_count)} />
          <Metric label="Distance" value={formatDistance(summary.distance_m)} />
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-secondary/60 hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}
