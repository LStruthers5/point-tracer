import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { UnitSystem } from "@/types/app-settings";
import type { MapElement, PinMapElement } from "@/types/map-elements";
import type { SessionPoint, SessionSegment } from "@/types/session";
import { formatDistance, formatDuration, formatSpeed } from "@/lib/format";
import {
  buildSegmentPerformanceInsights,
  findSegmentInsight,
  type SegmentPerformanceInsight,
  type XYPoint,
} from "@/lib/recovery-performance";

const NEAR_POINT_METERS = 10;
const COLUMN_STORAGE_KEY = "pointtracer.analyticsColumns.v2";

interface SegmentAnalyticsPanelProps {
  points: SessionPoint[];
  segments: SessionSegment[];
  mapElements: MapElement[];
  units: UnitSystem;
  onFocusSegment?: (segmentId: number) => void;
}

interface SegmentSplitStat {
  segment: SessionSegment;
  insight: SegmentPerformanceInsight | null;
  topSpeedMps: number;
  avgFocalDistanceM: number | null;
  maxFocalDistanceM: number | null;
  timeNearFocalS: number | null;
  percentNearFocal: number | null;
  focalVisits: number | null;
  avgSpeedNearFocalMps: number | null;
  restBeforeSegmentS: number | null;
  timeNearRestS: number | null;
  percentNearRest: number | null;
  restVisits: number | null;
  avgRestDistanceM: number | null;
  hrEndBpm: number | null;
  hrNextStartBpm: number | null;
  hrDropBpm: number | null;
  recoveryDurationS: number | null;
  recoveryRateBpmPerMin: number | null;
  recoveryScore: number | null;
}

type FocalColumnKey =
  | "timeNearFocalS"
  | "percentNearFocal"
  | "focalVisits"
  | "avgSpeedNearFocalMps"
  | "avgFocalDistanceM"
  | "maxFocalDistanceM";

type RestColumnKey =
  | "restBeforeSegmentS"
  | "timeNearRestS"
  | "percentNearRest"
  | "restVisits"
  | "avgRestDistanceM";

type RecoveryColumnKey =
  | "recoveryScore"
  | "hrEndBpm"
  | "hrNextStartBpm"
  | "hrDropBpm"
  | "recoveryDurationS"
  | "recoveryRateBpmPerMin";

interface AnalyticsColumnSettings {
  focal: FocalColumnKey;
  rest: RestColumnKey;
  recovery: RecoveryColumnKey;
}

const DEFAULT_COLUMN_SETTINGS: AnalyticsColumnSettings = {
  focal: "percentNearFocal",
  rest: "restBeforeSegmentS",
  recovery: "recoveryScore",
};

const FOCAL_COLUMN_OPTIONS: Array<{ key: FocalColumnKey; label: string }> = [
  { key: "timeNearFocalS", label: "Time near focal" },
  { key: "percentNearFocal", label: "% near focal" },
  { key: "focalVisits", label: "Focal visits" },
  { key: "avgSpeedNearFocalMps", label: "Avg speed near focal" },
  { key: "avgFocalDistanceM", label: "Average distance from focal" },
  { key: "maxFocalDistanceM", label: "Maximum distance from focal" },
];

const REST_COLUMN_OPTIONS: Array<{ key: RestColumnKey; label: string }> = [
  { key: "restBeforeSegmentS", label: "Rest before segment" },
  { key: "timeNearRestS", label: "Time near rest" },
  { key: "percentNearRest", label: "% near rest" },
  { key: "restVisits", label: "Rest visits" },
  { key: "avgRestDistanceM", label: "Average distance from rest" },
];

const RECOVERY_COLUMN_OPTIONS: Array<{ key: RecoveryColumnKey; label: string }> = [
  { key: "recoveryScore", label: "Recovery score" },
  { key: "hrDropBpm", label: "HR recovery drop" },
  { key: "recoveryRateBpmPerMin", label: "Recovery rate" },
  { key: "recoveryDurationS", label: "Recovery duration" },
  { key: "hrEndBpm", label: "HR at segment end" },
  { key: "hrNextStartBpm", label: "HR before next segment" },
];

export function SegmentAnalyticsPanel({
  points,
  segments,
  mapElements,
  units,
  onFocusSegment,
}: SegmentAnalyticsPanelProps) {
  const [columnSettings, setColumnSettings] = useState<AnalyticsColumnSettings>(() =>
    loadColumnSettings(),
  );
  const restPoint = mapElements.find((element): element is PinMapElement => element.type === "bench");
  const focalPoint = mapElements.find((element): element is PinMapElement => element.type === "focal");
  const restXY = restPoint ? elementToSessionXY(restPoint.position, points) : null;
  const focalXY = focalPoint ? elementToSessionXY(focalPoint.position, points) : null;
  const segmentPointMask = buildSegmentPointMask(points.length, segments);
  const performanceInsights = useMemo(
    () => buildSegmentPerformanceInsights(points, segments, restXY),
    [points, restXY, segments],
  );
  const splitStats = useMemo(
    () => buildSplitStats(points, segments, restXY, focalXY, performanceInsights),
    [focalXY, performanceInsights, points, restXY, segments],
  );
  const restSummary = restXY ? buildRestSummary(points, segmentPointMask, restXY) : null;
  const focalSummary = focalXY ? buildFocalSummary(points, focalXY) : null;
  const recoverySummary = buildRecoverySummary(splitStats);
  const hasRecoveryStats = splitStats.some((stat) => stat.hrEndBpm !== null || stat.hrDropBpm !== null);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnSettings));
  }, [columnSettings]);

  return (
    <section className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Split Analytics
          </div>
          <h3 className="mt-1 text-lg font-semibold text-foreground">Segment review table</h3>
        </div>
        <div className="text-xs text-muted-foreground">
          Positional metrics use a {formatDistance(NEAR_POINT_METERS, units)} near-point radius.
        </div>
      </div>

      {restSummary || focalSummary || recoverySummary ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {restSummary ? (
            <AnalyticsSummaryCard
              title={restPoint?.label ?? "Rest area"}
              subtitle="Reset behavior between segments"
              stats={[
                { label: "Time near rest", value: formatDuration(restSummary.timeNearRestS) },
                { label: "% time near rest", value: formatPercent(restSummary.percentNonSegmentNearRest) },
                { label: "Rest visits", value: String(restSummary.restVisits) },
              ]}
            />
          ) : null}
          {focalSummary ? (
            <AnalyticsSummaryCard
              title={focalPoint?.label ?? "Focal point"}
              subtitle="Positioning relative to tactical anchor"
              stats={[
                { label: "% time near focal", value: formatPercent(focalSummary.percentNearFocal) },
                { label: "Focal visits", value: String(focalSummary.focalVisits) },
                { label: "Avg speed near focal", value: formatNullableSpeed(focalSummary.avgSpeedNearFocalMps, units) },
              ]}
            />
          ) : null}
          {recoverySummary ? (
            <AnalyticsSummaryCard
              title="Recovery and preservation"
              subtitle="How recovery behavior connects to the next effort"
              tone="heart"
              stats={[
                { label: "Avg recovery score", value: formatNullableScore(recoverySummary.avgRecoveryScore) },
                { label: "Avg performance", value: formatNullableScore(recoverySummary.avgPerformanceScore) },
                { label: "Most common recovery", value: recoverySummary.primaryRecoveryType },
                { label: "Fatigue trend", value: recoverySummary.fatigueTrend },
              ]}
            />
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-secondary/35 px-4 py-3 text-sm text-muted-foreground">
          Place a focal point or rest area on the map to unlock positional analytics. Core split
          stats are still available below.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead className="bg-secondary/50 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <Th>Segment</Th>
              <Th>Duration</Th>
              <Th>Distance</Th>
              <Th>Top speed</Th>
              <Th>Avg speed</Th>
              <Th>Performance</Th>
              {hasRecoveryStats ? <Th>Recovery type</Th> : null}
              {focalXY ? (
                <ConfigurableTh
                  label={labelForOption(FOCAL_COLUMN_OPTIONS, columnSettings.focal)}
                  value={columnSettings.focal}
                  options={FOCAL_COLUMN_OPTIONS}
                  onChange={(focal) => setColumnSettings((current) => ({ ...current, focal }))}
                />
              ) : null}
              {restXY ? (
                <ConfigurableTh
                  label={labelForOption(REST_COLUMN_OPTIONS, columnSettings.rest)}
                  value={columnSettings.rest}
                  options={REST_COLUMN_OPTIONS}
                  onChange={(rest) => setColumnSettings((current) => ({ ...current, rest }))}
                />
              ) : null}
              {hasRecoveryStats ? (
                <ConfigurableTh
                  label={labelForOption(RECOVERY_COLUMN_OPTIONS, columnSettings.recovery)}
                  value={columnSettings.recovery}
                  options={RECOVERY_COLUMN_OPTIONS}
                  onChange={(recovery) =>
                    setColumnSettings((current) => ({ ...current, recovery }))
                  }
                />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {splitStats.length > 0 ? (
              splitStats.map((stat) => (
                <tr
                  key={stat.segment.segment_id}
                  className={`border-t border-border/60 transition ${
                    onFocusSegment ? "cursor-pointer hover:bg-primary/5" : ""
                  }`}
                  onClick={() => onFocusSegment?.(stat.segment.segment_id)}
                  title={onFocusSegment ? `Open ${stat.segment.label} in Focus Segment` : undefined}
                >
                  <Td>
                    <div className="font-semibold text-foreground">{stat.segment.label}</div>
                    <div className="text-xs text-muted-foreground">{stat.segment.point_count} pts</div>
                  </Td>
                  <Td>{formatDuration(stat.segment.duration_s)}</Td>
                  <Td>{formatDistance(stat.segment.distance_m, units)}</Td>
                  <Td>{formatSpeed(stat.topSpeedMps, units)}</Td>
                  <Td>{formatSpeed(stat.segment.mean_speed_mps, units)}</Td>
                  <Td>{formatPerformance(stat.insight)}</Td>
                  {hasRecoveryStats ? <Td>{stat.insight?.recoveryType ?? "--"}</Td> : null}
                  {focalXY ? <Td>{formatFocalMetric(stat, columnSettings.focal, units)}</Td> : null}
                  {restXY ? <Td>{formatRestMetric(stat, columnSettings.rest, units)}</Td> : null}
                  {hasRecoveryStats ? (
                    <Td className="font-semibold text-red-300">
                      {formatRecoveryMetric(stat, columnSettings.recovery)}
                    </Td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-5 text-sm text-muted-foreground" colSpan={9}>
                  No segments yet. Add segments from the timeline to populate split analytics.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AnalyticsSummaryCard({
  title,
  subtitle,
  stats,
  tone = "default",
}: {
  title: string;
  subtitle: string;
  stats: Array<{ label: string; value: string }>;
  tone?: "default" | "heart";
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === "heart"
          ? "border-red-400/25 bg-red-500/5"
          : "border-border/60 bg-secondary/35"
      }`}
    >
      <div className={`text-sm font-semibold ${tone === "heart" ? "text-red-300" : "text-foreground"}`}>
        {title}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{stat.label}</div>
            <div className={`mt-1 text-sm font-semibold ${tone === "heart" ? "text-red-300" : "text-foreground"}`}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

function ConfigurableTh<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ key: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <th className="px-4 py-3 font-semibold">
      <label className="group relative inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-transparent px-1 py-0.5 pr-5 transition hover:border-border/70 hover:bg-background/70">
        <span>{label}</span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-lg bg-transparent opacity-0 outline-none"
          aria-label={`Choose ${label} metric`}
          title="Change visible metric"
        >
          {options.map((option) => (
            <option key={option.key} value={option.key} className="bg-card text-foreground">
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-1 text-[10px] text-muted-foreground/70 transition group-hover:text-foreground">
          v
        </span>
      </label>
    </th>
  );
}

function Td({ children, className = "text-muted-foreground" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

function buildSplitStats(
  points: SessionPoint[],
  segments: SessionSegment[],
  restXY: XYPoint | null,
  focalXY: XYPoint | null,
  performanceInsights: SegmentPerformanceInsight[],
): SegmentSplitStat[] {
  return segments.map((segment) => {
    const insight = findSegmentInsight(performanceInsights, segment.segment_id);
    const segmentPoints = points.slice(segment.start_idx, segment.end_idx + 1);
    const previousSegment = [...segments]
      .reverse()
      .find((candidate) => candidate.end_idx < segment.start_idx) ?? null;
    const beforeSegmentStartIdx = previousSegment ? previousSegment.end_idx + 1 : 0;
    const beforeSegmentPoints = points.slice(beforeSegmentStartIdx, segment.start_idx);
    const focalNearS = focalXY ? timeNearPoint(segmentPoints, focalXY) : null;
    const restBeforeS = restXY ? timeNearPoint(beforeSegmentPoints, restXY) : null;
    const restNearS = restXY ? timeNearPoint(segmentPoints, restXY) : null;

    return {
      segment,
      insight,
      topSpeedMps: maxSpeed(segmentPoints),
      avgFocalDistanceM: focalXY ? averageDistance(segmentPoints, focalXY) : null,
      maxFocalDistanceM: focalXY ? maxDistance(segmentPoints, focalXY) : null,
      timeNearFocalS: focalNearS,
      percentNearFocal:
        focalNearS !== null && segment.duration_s > 0 ? focalNearS / segment.duration_s : null,
      focalVisits: focalXY
        ? countNearVisits(segmentPoints, focalXY, { minDurationS: 2, mergeGapS: 6 })
        : null,
      avgSpeedNearFocalMps: focalXY ? averageSpeedNearPoint(segmentPoints, focalXY) : null,
      restBeforeSegmentS: restBeforeS,
      timeNearRestS: restNearS,
      percentNearRest: restNearS !== null && segment.duration_s > 0 ? restNearS / segment.duration_s : null,
      restVisits: restXY
        ? countNearVisits(beforeSegmentPoints, restXY, { minDurationS: 8, mergeGapS: 20 })
        : null,
      avgRestDistanceM: restXY ? averageDistance(segmentPoints, restXY) : null,
      hrEndBpm: segment.recovery_stats?.hr_end_bpm ?? segment.heart_rate_stats?.end_bpm ?? null,
      hrNextStartBpm: segment.recovery_stats?.hr_next_start_bpm ?? null,
      hrDropBpm: segment.recovery_stats?.hr_drop_bpm ?? null,
      recoveryDurationS: segment.recovery_stats?.recovery_duration_s ?? null,
      recoveryRateBpmPerMin: segment.recovery_stats?.recovery_rate_bpm_per_min ?? null,
      recoveryScore: insight?.recoveryScore ?? null,
    };
  });
}

function buildRestSummary(points: SessionPoint[], segmentPointMask: boolean[], restXY: XYPoint) {
  const totalNonSegmentS = sumPointDurations(points, (_, index) => !segmentPointMask[index]);
  const timeNearRestS = sumPointDurations(
    points,
    (point, index) => !segmentPointMask[index] && distanceTo(point, restXY) <= NEAR_POINT_METERS,
  );
  const restVisits = countNearVisits(points, restXY, {
    minDurationS: 8,
    mergeGapS: 20,
    includePoint: (_, index) => !segmentPointMask[index],
  });

  return {
    timeNearRestS,
    percentNonSegmentNearRest: totalNonSegmentS > 0 ? timeNearRestS / totalNonSegmentS : 0,
    restVisits,
  };
}

function buildFocalSummary(points: SessionPoint[], focalXY: XYPoint) {
  const totalSessionS = sumPointDurations(points, () => true);
  const timeNearFocalS = timeNearPoint(points, focalXY);
  const nearFocalSpeeds = points
    .filter((point) => distanceTo(point, focalXY) <= NEAR_POINT_METERS)
    .map((point) => point.speed_smooth_mps ?? point.speed_mps ?? 0);

  return {
    percentNearFocal: totalSessionS > 0 ? timeNearFocalS / totalSessionS : 0,
    focalVisits: countNearVisits(points, focalXY, { minDurationS: 2, mergeGapS: 6 }),
    avgSpeedNearFocalMps: nearFocalSpeeds.length > 0 ? average(nearFocalSpeeds) : null,
  };
}

function buildRecoverySummary(splitStats: SegmentSplitStat[]) {
  const recoveryStats = splitStats.filter(
    (stat) => stat.hrDropBpm !== null && stat.recoveryRateBpmPerMin !== null,
  );
  if (recoveryStats.length === 0) return null;

  const recoveryScores = recoveryStats
    .map((stat) => stat.insight?.recoveryScore ?? null)
    .filter((score): score is number => score !== null);
  const performanceScores = splitStats
    .map((stat) => stat.insight?.performanceScore ?? null)
    .filter((score): score is number => score !== null);
  const recoveryTypeCounts = countRecoveryTypes(recoveryStats);
  const fatigueFlags = splitStats.filter((stat) => stat.insight?.fatigueFlag).length;
  const avgPerformanceScore = performanceScores.length > 0 ? average(performanceScores) : null;

  return {
    avgRecoveryScore: recoveryScores.length > 0 ? Math.round(average(recoveryScores)) : null,
    avgPerformanceScore: avgPerformanceScore === null ? null : Math.round(avgPerformanceScore),
    primaryRecoveryType: recoveryTypeCounts[0]?.type ?? "Mixed",
    fatigueTrend:
      fatigueFlags >= Math.max(2, Math.ceil(splitStats.length * 0.25))
        ? "Building"
        : avgPerformanceScore !== null && avgPerformanceScore < 80
          ? "Performance fading"
          : "Stable",
  };
}

function formatFocalMetric(stat: SegmentSplitStat, key: FocalColumnKey, units: UnitSystem) {
  switch (key) {
    case "timeNearFocalS":
      return formatNullableDuration(stat.timeNearFocalS);
    case "percentNearFocal":
      return formatNullablePercent(stat.percentNearFocal);
    case "focalVisits":
      return formatNullableCount(stat.focalVisits);
    case "avgSpeedNearFocalMps":
      return formatNullableSpeed(stat.avgSpeedNearFocalMps, units);
    case "avgFocalDistanceM":
      return formatNullableDistance(stat.avgFocalDistanceM, units);
    case "maxFocalDistanceM":
      return formatNullableDistance(stat.maxFocalDistanceM, units);
  }
}

function formatRestMetric(stat: SegmentSplitStat, key: RestColumnKey, units: UnitSystem) {
  switch (key) {
    case "restBeforeSegmentS":
      return formatNullableDuration(stat.restBeforeSegmentS);
    case "timeNearRestS":
      return formatNullableDuration(stat.timeNearRestS);
    case "percentNearRest":
      return formatNullablePercent(stat.percentNearRest);
    case "restVisits":
      return formatNullableCount(stat.restVisits);
    case "avgRestDistanceM":
      return formatNullableDistance(stat.avgRestDistanceM, units);
  }
}

function formatRecoveryMetric(stat: SegmentSplitStat, key: RecoveryColumnKey) {
  switch (key) {
    case "recoveryScore":
      return formatNullableScore(stat.recoveryScore);
    case "hrEndBpm":
      return formatNullableBpm(stat.hrEndBpm);
    case "hrNextStartBpm":
      return formatNullableBpm(stat.hrNextStartBpm);
    case "hrDropBpm":
      return formatNullableBpmDelta(stat.hrDropBpm);
    case "recoveryDurationS":
      return formatNullableDuration(stat.recoveryDurationS);
    case "recoveryRateBpmPerMin":
      return formatNullableRecoveryRate(stat.recoveryRateBpmPerMin);
  }
}

function formatPerformance(insight: SegmentPerformanceInsight | null) {
  if (insight?.performanceScore == null || !insight.performanceBand) return "--";
  return `${insight.performanceScore} · ${insight.performanceBand}`;
}

function countRecoveryTypes(splitStats: SegmentSplitStat[]) {
  const counts = new Map<string, number>();
  splitStats.forEach((stat) => {
    const type = stat.insight?.recoveryType;
    if (!type) return;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

function labelForOption<T extends string>(options: Array<{ key: T; label: string }>, value: T) {
  return options.find((option) => option.key === value)?.label ?? options[0]?.label ?? "Metric";
}

function loadColumnSettings(): AnalyticsColumnSettings {
  if (typeof localStorage === "undefined") return DEFAULT_COLUMN_SETTINGS;

  try {
    const stored = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!stored) return DEFAULT_COLUMN_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<AnalyticsColumnSettings>;
    return {
      focal: isFocalColumnKey(parsed.focal) ? parsed.focal : DEFAULT_COLUMN_SETTINGS.focal,
      rest: isRestColumnKey(parsed.rest) ? parsed.rest : DEFAULT_COLUMN_SETTINGS.rest,
      recovery: isRecoveryColumnKey(parsed.recovery)
        ? parsed.recovery
        : DEFAULT_COLUMN_SETTINGS.recovery,
    };
  } catch {
    return DEFAULT_COLUMN_SETTINGS;
  }
}

function isFocalColumnKey(value: unknown): value is FocalColumnKey {
  return FOCAL_COLUMN_OPTIONS.some((option) => option.key === value);
}

function isRestColumnKey(value: unknown): value is RestColumnKey {
  return REST_COLUMN_OPTIONS.some((option) => option.key === value);
}

function isRecoveryColumnKey(value: unknown): value is RecoveryColumnKey {
  return RECOVERY_COLUMN_OPTIONS.some((option) => option.key === value);
}

function elementToSessionXY(position: { lat: number; lon: number }, points: SessionPoint[]): XYPoint | null {
  const origin = points[0];
  if (!origin) return null;

  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = Math.max(
    1,
    Math.cos((origin.lat * Math.PI) / 180) * metersPerDegreeLat,
  );

  return {
    x: origin.x_m + (position.lon - origin.lon) * metersPerDegreeLon,
    y: origin.y_m + (position.lat - origin.lat) * metersPerDegreeLat,
  };
}

function buildSegmentPointMask(pointCount: number, segments: SessionSegment[]) {
  const mask = new Array<boolean>(pointCount).fill(false);
  segments.forEach((segment) => {
    const start = clampIndex(segment.start_idx, pointCount);
    const end = clampIndex(segment.end_idx, pointCount);
    for (let index = start; index <= end; index += 1) mask[index] = true;
  });
  return mask;
}

function clampIndex(index: number, pointCount: number) {
  return Math.min(Math.max(index, 0), Math.max(0, pointCount - 1));
}

function maxSpeed(points: SessionPoint[]) {
  if (points.length === 0) return 0;
  return Math.max(...points.map((point) => point.speed_smooth_mps ?? point.speed_mps ?? 0));
}

function averageDistance(points: SessionPoint[], target: XYPoint | null) {
  if (!target || points.length === 0) return 0;
  return average(points.map((point) => distanceTo(point, target)));
}

function maxDistance(points: SessionPoint[], target: XYPoint | null) {
  if (!target || points.length === 0) return 0;
  return Math.max(...points.map((point) => distanceTo(point, target)));
}

function distanceTo(point: SessionPoint, target: XYPoint) {
  return Math.hypot(point.x_m - target.x, point.y_m - target.y);
}

function timeNearPoint(points: SessionPoint[], target: XYPoint | null) {
  if (!target) return 0;
  return sumPointDurations(points, (point) => distanceTo(point, target) <= NEAR_POINT_METERS);
}

function countNearVisits(
  points: SessionPoint[],
  target: XYPoint | null,
  options: {
    minDurationS: number;
    mergeGapS: number;
    includePoint?: (point: SessionPoint, index: number) => boolean;
  },
) {
  if (!target) return 0;
  let visits = 0;
  let visitStart: SessionPoint | null = null;
  let lastNearPoint: SessionPoint | null = null;

  const closeVisit = () => {
    if (!visitStart || !lastNearPoint) return;
    if (secondsBetween(visitStart, lastNearPoint) >= options.minDurationS) visits += 1;
    visitStart = null;
    lastNearPoint = null;
  };

  points.forEach((point, index) => {
    const included = options.includePoint ? options.includePoint(point, index) : true;
    const isNear = included && distanceTo(point, target) <= NEAR_POINT_METERS;

    if (isNear) {
      if (
        lastNearPoint &&
        secondsBetween(lastNearPoint, point) > options.mergeGapS
      ) {
        closeVisit();
      }
      visitStart ??= point;
      lastNearPoint = point;
      return;
    }

    if (lastNearPoint && secondsBetween(lastNearPoint, point) > options.mergeGapS) {
      closeVisit();
    }
  });

  closeVisit();
  return visits;
}

function averageSpeedNearPoint(points: SessionPoint[], target: XYPoint | null) {
  if (!target) return null;
  const speeds = points
    .filter((point) => distanceTo(point, target) <= NEAR_POINT_METERS)
    .map((point) => point.speed_smooth_mps ?? point.speed_mps ?? 0);
  if (speeds.length === 0) return null;
  return average(speeds);
}

function sumPointDurations(
  points: SessionPoint[],
  predicate: (point: SessionPoint, index: number) => boolean,
) {
  return points.reduce((total, point, index) => {
    if (!predicate(point, index)) return total;
    const nextPoint = points[index + 1];
    if (!nextPoint) return total;
    return total + Math.max(0, secondsBetween(point, nextPoint));
  }, 0);
}

function secondsBetween(start: SessionPoint, end: SessionPoint) {
  return (new Date(end.t).getTime() - new Date(start.t).getTime()) / 1000;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatNullableDuration(seconds: number | null) {
  if (seconds === null) return "--";
  return formatDuration(seconds);
}

function formatNullableDistance(meters: number | null, units: UnitSystem) {
  if (meters === null) return "--";
  return formatDistance(meters, units);
}

function formatNullableSpeed(mps: number | null, units: UnitSystem) {
  if (mps === null) return "--";
  return formatSpeed(mps, units);
}

function formatNullableScore(value: number | null) {
  if (value === null) return "--";
  return String(value);
}

function formatNullableBpm(value: number | null) {
  if (value === null) return "--";
  return `${Math.round(value)} bpm`;
}

function formatNullableBpmDelta(value: number | null) {
  if (value === null) return "--";
  return formatBpmDelta(value);
}

function formatBpmDelta(value: number) {
  if (value >= 0) return `${Math.round(value)} bpm`;
  return `+${Math.abs(Math.round(value))} bpm`;
}

function formatNullableRecoveryRate(value: number | null) {
  if (value === null) return "--";
  return formatRecoveryRate(value);
}

function formatRecoveryRate(value: number) {
  if (value >= 0) return `${value.toFixed(1)} bpm/min`;
  return `+${Math.abs(value).toFixed(1)} bpm/min`;
}

function formatNullablePercent(value: number | null) {
  if (value === null) return "--";
  return formatPercent(value);
}

function formatNullableCount(value: number | null) {
  if (value === null) return "--";
  return String(value);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
