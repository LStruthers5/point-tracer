import type { SessionSegment } from "@/types/session";
import { formatDuration, formatDistance, formatTimeRange } from "@/lib/format";

interface SegmentListProps {
  segments: SessionSegment[];
  selectedId: number | null;
  hoveredId: number | null;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
}

export function SegmentList({ segments, selectedId, hoveredId, onSelect, onHover }: SegmentListProps) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground px-1 mb-2">
        Segments
      </div>
      {segments.map((seg) => (
        <button
          key={seg.segment_id}
          onClick={() => onSelect(seg.segment_id)}
          onMouseEnter={() => onHover(seg.segment_id)}
          onMouseLeave={() => onHover(null)}
          className={`segment-card w-full text-left glass-card rounded-xl p-3.5 cursor-pointer transition-all ${
            selectedId === seg.segment_id ? "active" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-foreground">{seg.label}</span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {seg.point_count} pts
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{formatDuration(seg.duration_s)}</span>
            <span className="text-border">•</span>
            <span>{formatDistance(seg.distance_m)}</span>
          </div>
          <div className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
            {formatTimeRange(seg.start_time, seg.end_time)}
          </div>
        </button>
      ))}
    </div>
  );
}
