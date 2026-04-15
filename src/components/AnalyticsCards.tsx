import type { SessionSegment } from "@/types/session";
import { formatDuration, formatDistance, formatSpeed } from "@/lib/format";

interface AnalyticsCardsProps {
  segment: SessionSegment | null;
}

export function AnalyticsCards({ segment }: AnalyticsCardsProps) {
  if (!segment) {
    return (
      <div className="glass-card rounded-2xl p-5">
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
          Segment Analytics
        </div>
        <p className="text-sm text-muted-foreground">Select a segment to view analytics</p>
      </div>
    );
  }

  const stats = [
    { label: "Duration", value: formatDuration(segment.duration_s) },
    { label: "Distance", value: formatDistance(segment.distance_m) },
    { label: "Avg Speed", value: formatSpeed(segment.mean_speed_mps) },
    { label: "Trackpoints", value: String(segment.point_count) },
  ];

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
        {segment.label} Analytics
      </div>
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-secondary/50 rounded-xl p-3 text-center">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {s.label}
            </div>
            <div className="text-base font-bold text-foreground mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
