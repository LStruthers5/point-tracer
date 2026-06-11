import type { MapElement, PinMapElement } from "@/types/map-elements";
import type { SessionPoint, SessionSegment } from "@/types/session";
import type { UnitSystem } from "@/types/app-settings";
import { formatDuration, formatDistance, formatSpeed } from "@/lib/format";
import {
  buildSegmentPerformanceInsights,
  elementToSessionXY,
  findSegmentInsight,
  getRecoveryScoreFromStats,
} from "@/lib/recovery-performance";
import { FieldZoneStats } from "@/components/FieldZoneStats";

interface AnalyticsCardsProps {
  segment: SessionSegment | null;
  points?: SessionPoint[];
  segments?: SessionSegment[];
  mapElements?: MapElement[];
  units?: UnitSystem;
}

export function AnalyticsCards({
  segment,
  points = [],
  segments = [],
  mapElements = [],
  units = "metric",
}: AnalyticsCardsProps) {
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
    { label: "Distance", value: formatDistance(segment.distance_m, units) },
    { label: "Avg Speed", value: formatSpeed(segment.mean_speed_mps, units) },
    { label: "Trackpoints", value: String(segment.point_count) },
  ];
  const recoveryStats = getRecoveryStats(segment);
  const restPoint = mapElements.find((element): element is PinMapElement => element.type === "bench");
  const restXY = restPoint ? elementToSessionXY(restPoint.position, points) : null;
  const insight = findSegmentInsight(
    buildSegmentPerformanceInsights(points, segments, restXY),
    segment.segment_id,
  );
  const segmentPoints = points.slice(segment.start_idx, segment.end_idx + 1);

  return (
    <div className="space-y-3">
    <div className="glass-card rounded-2xl p-5 space-y-4">
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
      {recoveryStats.length > 0 ? (
        <div className="rounded-xl border border-red-400/25 bg-red-500/5 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-red-400/90">
                Heart-rate recovery
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Simple recovery stats from the end of this segment to the next segment start.
              </div>
            </div>
            {segment.recovery_stats?.hr_drop_bpm != null &&
            segment.recovery_stats?.recovery_rate_bpm_per_min != null ? (
              <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-right">
                <div className="text-[10px] uppercase tracking-wider text-red-400/80">
                  Recovery score
                </div>
                <div className="font-mono text-lg font-bold text-red-300">
                  {insight?.recoveryScore ?? getRecoveryScore(segment)}
                </div>
              </div>
            ) : null}
          </div>
          {insight ? (
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-background/55 p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Recovery type
                </div>
                <div className="mt-1 text-sm font-bold text-red-300">
                  {insight.recoveryType ?? "--"}
                </div>
              </div>
              <div className="rounded-lg bg-background/55 p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Next effort
                </div>
                <div className="mt-1 text-sm font-bold text-red-300">
                  {formatScoreBand(insight.nextPerformanceScore, insight.nextPerformanceBand)}
                </div>
              </div>
              <div className="rounded-lg bg-background/55 p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Fatigue signal
                </div>
                <div className="mt-1 text-sm font-bold text-red-300">
                  {insight.fatigueFlag ? "Needs attention" : "Stable"}
                </div>
              </div>
              {insight.recoveryExplanation ? (
                <div className="sm:col-span-3 text-xs leading-relaxed text-muted-foreground">
                  {insight.recoveryExplanation} Short low-movement recovery can help preserve repeated
                  high-intensity efforts when the window is brief.
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-5">
            {recoveryStats.map((s) => (
              <div key={s.label} className="rounded-lg bg-background/55 p-3 text-center">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </div>
                <div className="mt-1 text-sm font-bold text-red-300">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
    <FieldZoneStats points={segmentPoints} sessionPoints={points} mapElements={mapElements} />
    </div>
  );
}

function getRecoveryStats(segment: SessionSegment) {
  const recovery = segment.recovery_stats;
  if (!recovery && !segment.heart_rate_stats) return [];

  return [
    recovery?.hr_end_bpm != null || segment.heart_rate_stats?.end_bpm != null
      ? { label: "HR end", value: formatBpm(recovery?.hr_end_bpm ?? segment.heart_rate_stats?.end_bpm ?? null) }
      : null,
    recovery?.hr_next_start_bpm != null
      ? { label: "Next start", value: formatBpm(recovery.hr_next_start_bpm) }
      : null,
    recovery?.hr_drop_bpm != null
      ? { label: "HR drop", value: `${Math.round(recovery.hr_drop_bpm)} bpm` }
      : null,
    recovery?.recovery_duration_s != null
      ? { label: "Window", value: formatDuration(recovery.recovery_duration_s) }
      : null,
    recovery?.recovery_rate_bpm_per_min != null
      ? { label: "Rate", value: `${recovery.recovery_rate_bpm_per_min.toFixed(1)} bpm/min` }
      : null,
  ].filter((stat): stat is { label: string; value: string } => stat !== null);
}

function getRecoveryScore(segment: SessionSegment) {
  return getRecoveryScoreFromStats(segment) ?? "--";
}

function formatBpm(value: number | null) {
  if (value == null) return "--";
  return `${Math.round(value)} bpm`;
}

function formatScoreBand(score: number | null, band: string | null) {
  if (score === null || !band) return "--";
  return `${score} · ${band}`;
}
