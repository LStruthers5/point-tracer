import type { SessionSummary } from "@/types/session";
import { formatDuration, formatDistance } from "@/lib/format";

interface SessionSidebarProps {
  activityName: string;
  sport: string;
  summary: SessionSummary;
  segmentCount: number;
}

export function SessionSidebar({ activityName, sport, summary, segmentCount }: SessionSidebarProps) {
  return (
    <div className="glass-card rounded-2xl p-5 space-y-5">
      <div>
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">
          Session
        </div>
        <h1 className="text-xl font-bold text-foreground">{activityName}</h1>
        <span className="inline-block mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
          {sport.replace(/_/g, " ")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Duration" value={formatDuration(summary.duration_min * 60)} />
        <StatCard label="Distance" value={formatDistance(summary.distance_m)} />
        <StatCard label="Segments" value={String(segmentCount)} />
        <StatCard label="Trackpoints" value={summary.trackpoint_count.toLocaleString()} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/50 rounded-xl p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-bold text-foreground mt-0.5">{value}</div>
    </div>
  );
}
