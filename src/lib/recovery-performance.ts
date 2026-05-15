import type { SessionPoint, SessionSegment } from "@/types/session";

export interface XYPoint {
  x: number;
  y: number;
}

export type RecoveryType =
  | "Passive recovery"
  | "Low-intensity active recovery"
  | "Active recovery"
  | "Incomplete recovery";

export type PerformanceBand = "Preserved" | "Slightly degraded" | "Clearly degraded";

export interface SegmentPerformanceInsight {
  segmentId: number;
  recoveryType: RecoveryType | null;
  recoveryScore: number | null;
  recoveryExplanation: string | null;
  recoveryAvgSpeedMps: number | null;
  recoveryDistanceM: number | null;
  recoveryNearRestPercent: number | null;
  performanceScore: number | null;
  performanceBand: PerformanceBand | null;
  performanceExplanation: string | null;
  nextPerformanceScore: number | null;
  nextPerformanceBand: PerformanceBand | null;
  fatigueFlag: boolean;
}

interface Baseline {
  meanSpeedMps: number;
  topSpeedMps: number;
}

const STRONG_HR_DROP_BPM = 35;
const STRONG_RECOVERY_RATE_BPM_PER_MIN = 14;
const USEFUL_RECOVERY_WINDOW_S = 120;

export function buildSegmentPerformanceInsights(
  points: SessionPoint[],
  segments: SessionSegment[],
  restXY: XYPoint | null = null,
) {
  const baseline = buildPerformanceBaseline(points, segments);
  const rawInsights = segments.map((segment, index) => {
    const recoveryWindow = getRecoveryWindow(points, segments, index);
    const recoveryType = classifyRecovery(segment, recoveryWindow, restXY);
    const recoveryScore = scoreRecovery(segment, recoveryType);
    const performanceScore = baseline ? scorePerformance(points, segment, baseline) : null;
    const performanceBand = performanceScore === null ? null : bandPerformance(performanceScore);

    return {
      segmentId: segment.segment_id,
      recoveryType,
      recoveryScore,
      recoveryExplanation: explainRecoveryType(recoveryType),
      recoveryAvgSpeedMps: recoveryWindow ? averageSpeed(recoveryWindow) : null,
      recoveryDistanceM: recoveryWindow ? cumulativeDistance(recoveryWindow) : null,
      recoveryNearRestPercent:
        recoveryWindow && restXY ? percentNearPoint(recoveryWindow, restXY) : null,
      performanceScore,
      performanceBand,
      performanceExplanation:
        performanceScore === null
          ? null
          : `Compared with the early-session speed baseline for this activity.`,
      nextPerformanceScore: null,
      nextPerformanceBand: null,
      fatigueFlag: false,
    } satisfies SegmentPerformanceInsight;
  });

  return rawInsights.map((insight, index) => {
    const nextInsight = rawInsights[index + 1];
    const fatigueFlag =
      (insight.recoveryScore !== null && insight.recoveryScore < 45) ||
      (nextInsight?.performanceScore != null &&
        nextInsight.performanceScore < 75);

    return {
      ...insight,
      nextPerformanceScore: nextInsight?.performanceScore ?? null,
      nextPerformanceBand: nextInsight?.performanceBand ?? null,
      fatigueFlag,
    };
  });
}

export function findSegmentInsight(
  insights: SegmentPerformanceInsight[],
  segmentId: number | null | undefined,
) {
  if (segmentId == null) return null;
  return insights.find((insight) => insight.segmentId === segmentId) ?? null;
}

export function getRecoveryScoreFromStats(segment: SessionSegment) {
  return scoreRecovery(segment, null);
}

export function elementToSessionXY(
  position: { lat: number; lon: number },
  points: SessionPoint[],
): XYPoint | null {
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

function buildPerformanceBaseline(points: SessionPoint[], segments: SessionSegment[]): Baseline | null {
  if (segments.length === 0) return null;
  const baselineCount = Math.max(1, Math.min(4, Math.ceil(segments.length * 0.25)));
  const candidates = segments.slice(0, baselineCount);
  const meanSpeeds = candidates
    .map((segment) => segment.mean_speed_mps)
    .filter((value) => Number.isFinite(value) && value > 0);
  const topSpeeds = candidates
    .map((segment) => maxSpeed(points.slice(segment.start_idx, segment.end_idx + 1)))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (meanSpeeds.length === 0 || topSpeeds.length === 0) return null;

  return {
    meanSpeedMps: median(meanSpeeds),
    topSpeedMps: median(topSpeeds),
  };
}

function scorePerformance(points: SessionPoint[], segment: SessionSegment, baseline: Baseline) {
  const topSpeedMps = maxSpeed(points.slice(segment.start_idx, segment.end_idx + 1));
  if (baseline.meanSpeedMps <= 0 || baseline.topSpeedMps <= 0) return null;

  const avgRatio = segment.mean_speed_mps / baseline.meanSpeedMps;
  const topRatio = topSpeedMps / baseline.topSpeedMps;
  const score = (avgRatio * 0.6 + topRatio * 0.4) * 100;
  return Math.round(clamp(score, 0, 130));
}

function bandPerformance(score: number): PerformanceBand {
  if (score >= 90) return "Preserved";
  if (score >= 75) return "Slightly degraded";
  return "Clearly degraded";
}

function scoreRecovery(segment: SessionSegment, recoveryType: RecoveryType | null) {
  const recovery = segment.recovery_stats;
  if (
    !recovery?.hr_drop_bpm ||
    !recovery.recovery_rate_bpm_per_min ||
    recovery.hr_drop_bpm <= 0 ||
    recovery.recovery_rate_bpm_per_min <= 0
  ) {
    return null;
  }

  const dropScore = clamp(recovery.hr_drop_bpm / STRONG_HR_DROP_BPM, 0, 1);
  const rateScore = clamp(recovery.recovery_rate_bpm_per_min / STRONG_RECOVERY_RATE_BPM_PER_MIN, 0, 1);
  const durationScore = clamp(recovery.recovery_duration_s / USEFUL_RECOVERY_WINDOW_S, 0, 1);
  let score = (dropScore * 0.45 + rateScore * 0.35 + durationScore * 0.2) * 100;

  if (recoveryType === "Incomplete recovery") score = Math.min(score, 45);
  if (recoveryType === "Active recovery" && recovery.recovery_duration_s < 90) score = Math.min(score, 85);

  return Math.round(score);
}

function classifyRecovery(
  segment: SessionSegment,
  recoveryWindow: SessionPoint[] | null,
  restXY: XYPoint | null,
): RecoveryType | null {
  const durationS = segment.recovery_stats?.recovery_duration_s ?? null;
  if (!recoveryWindow || durationS === null || durationS <= 0) return null;

  const avgSpeedMps = averageSpeed(recoveryWindow);
  const distanceM = cumulativeDistance(recoveryWindow);
  const restPercent = restXY ? percentNearPoint(recoveryWindow, restXY) : 0;
  const hrDrop = segment.recovery_stats?.hr_drop_bpm ?? null;

  if (durationS < 15 || (hrDrop !== null && hrDrop <= 2)) {
    return "Incomplete recovery";
  }

  if (restPercent >= 0.5 || (avgSpeedMps < 0.35 && distanceM < 25)) {
    return "Passive recovery";
  }

  if (avgSpeedMps < 1.25 || distanceM / Math.max(1, durationS) < 1.25) {
    return "Low-intensity active recovery";
  }

  return "Active recovery";
}

function explainRecoveryType(type: RecoveryType | null) {
  switch (type) {
    case "Passive recovery":
      return "Very low movement, often near the rest area when one is placed.";
    case "Low-intensity active recovery":
      return "Some easy movement during the recovery window without much sustained pace.";
    case "Active recovery":
      return "The recovery window still contained meaningful movement.";
    case "Incomplete recovery":
      return "The next effort started quickly or HR barely dropped before it.";
    default:
      return null;
  }
}

function getRecoveryWindow(points: SessionPoint[], segments: SessionSegment[], index: number) {
  const segment = segments[index];
  const nextSegment = segments[index + 1];
  if (!segment || !nextSegment) return null;

  const start = Math.min(segment.end_idx + 1, points.length);
  const end = Math.max(start, Math.min(nextSegment.start_idx, points.length));
  const window = points.slice(start, end);
  return window.length > 0 ? window : null;
}

function maxSpeed(points: SessionPoint[]) {
  if (points.length === 0) return 0;
  return Math.max(...points.map((point) => point.speed_smooth_mps ?? point.speed_mps ?? 0));
}

function averageSpeed(points: SessionPoint[]) {
  if (points.length === 0) return 0;
  return average(points.map((point) => point.speed_smooth_mps ?? point.speed_mps ?? 0));
}

function cumulativeDistance(points: SessionPoint[]) {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    return total + Math.hypot(point.x_m - previous.x_m, point.y_m - previous.y_m);
  }, 0);
}

function percentNearPoint(points: SessionPoint[], target: XYPoint) {
  const totalS = sumPointDurations(points, () => true);
  if (totalS <= 0) return 0;
  const nearS = sumPointDurations(points, (point) => distanceTo(point, target) <= 10);
  return nearS / totalS;
}

function distanceTo(point: SessionPoint, target: XYPoint) {
  return Math.hypot(point.x_m - target.x, point.y_m - target.y);
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

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
