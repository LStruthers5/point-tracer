import type {
  MultiplayerParticipant,
  MultiplayerSessionData,
  SessionPoint,
} from "@/types/session";

export type ParticipantPlaybackStatus =
  | "before_start"
  | "after_end"
  | "gap"
  | "nearest"
  | "interpolated";

export interface ParticipantPlaybackPoint {
  participantId: string;
  label: string;
  status: ParticipantPlaybackStatus;
  point: SessionPoint | null;
  previousIdx: number | null;
  nextIdx: number | null;
  sampleGapMs: number | null;
}

export interface MultiplayerPlaybackSnapshot {
  sharedTime: string;
  elapsed_s: number;
  participants: ParticipantPlaybackPoint[];
}

interface PlaybackLookupOptions {
  maxInterpolationGapMs?: number;
  nearestToleranceMs?: number;
}

const DEFAULT_MAX_INTERPOLATION_GAP_MS = 15_000;
const DEFAULT_NEAREST_TOLERANCE_MS = 2_500;

export function getMultiplayerPlaybackSnapshot(
  session: MultiplayerSessionData,
  elapsedSeconds: number,
  options: PlaybackLookupOptions = {},
): MultiplayerPlaybackSnapshot {
  const startMs = Date.parse(session.playback.start_time);
  const durationMs = Math.max(0, session.playback.duration_s * 1000);
  const elapsedMs = clamp(elapsedSeconds * 1000, 0, durationMs);
  const sharedMs = startMs + elapsedMs;

  return {
    sharedTime: new Date(sharedMs).toISOString(),
    elapsed_s: Math.round((elapsedMs / 1000) * 1000) / 1000,
    participants: session.participants.map((participant) =>
      getParticipantPointAtTime(participant, sharedMs, options),
    ),
  };
}

export function getParticipantPointAtTime(
  participant: MultiplayerParticipant,
  sharedTimeMs: number,
  options: PlaybackLookupOptions = {},
): ParticipantPlaybackPoint {
  const points = participant.points;
  const maxInterpolationGapMs =
    options.maxInterpolationGapMs ?? DEFAULT_MAX_INTERPOLATION_GAP_MS;
  const nearestToleranceMs = options.nearestToleranceMs ?? DEFAULT_NEAREST_TOLERANCE_MS;

  if (points.length === 0) {
    return emptyParticipantState(participant, "gap");
  }

  const firstMs = Date.parse(points[0].t);
  const lastMs = Date.parse(points[points.length - 1].t);

  if (sharedTimeMs < firstMs) {
    return edgeParticipantState(participant, "before_start", points[0], 0);
  }

  if (sharedTimeMs > lastMs) {
    const lastIdx = points.length - 1;
    return edgeParticipantState(participant, "after_end", points[lastIdx], lastIdx);
  }

  const nextIdx = findFirstPointAtOrAfter(points, sharedTimeMs);
  const previousIdx = Math.max(0, nextIdx - 1);
  const previous = points[previousIdx];
  const next = points[nextIdx] ?? previous;
  const previousMs = Date.parse(previous.t);
  const nextMs = Date.parse(next.t);

  if (previousIdx === nextIdx || previousMs === nextMs) {
    return {
      participantId: participant.participant_id,
      label: participant.label,
      status: "nearest",
      point: previous,
      previousIdx,
      nextIdx,
      sampleGapMs: 0,
    };
  }

  const sampleGapMs = nextMs - previousMs;
  const nearest =
    Math.abs(sharedTimeMs - previousMs) <= Math.abs(nextMs - sharedTimeMs) ? previous : next;
  const nearestIdx = nearest === previous ? previousIdx : nextIdx;
  const nearestMs = nearest === previous ? previousMs : nextMs;

  if (sampleGapMs > maxInterpolationGapMs) {
    if (Math.abs(sharedTimeMs - nearestMs) <= nearestToleranceMs) {
      return {
        participantId: participant.participant_id,
        label: participant.label,
        status: "nearest",
        point: nearest,
        previousIdx: nearestIdx,
        nextIdx: nearestIdx,
        sampleGapMs,
      };
    }
    return {
      participantId: participant.participant_id,
      label: participant.label,
      status: "gap",
      point: null,
      previousIdx,
      nextIdx,
      sampleGapMs,
    };
  }

  const ratio = clamp((sharedTimeMs - previousMs) / sampleGapMs, 0, 1);
  return {
    participantId: participant.participant_id,
    label: participant.label,
    status: "interpolated",
    point: interpolatePoint(previous, next, sharedTimeMs, ratio),
    previousIdx,
    nextIdx,
    sampleGapMs,
  };
}

function interpolatePoint(
  previous: SessionPoint,
  next: SessionPoint,
  sharedTimeMs: number,
  ratio: number,
): SessionPoint {
  const heartRate =
    typeof previous.heart_rate_bpm === "number" && typeof next.heart_rate_bpm === "number"
      ? lerp(previous.heart_rate_bpm, next.heart_rate_bpm, ratio)
      : previous.heart_rate_bpm ?? next.heart_rate_bpm;

  return {
    lat: lerp(previous.lat, next.lat, ratio),
    lon: lerp(previous.lon, next.lon, ratio),
    x_m: lerp(previous.x_m, next.x_m, ratio),
    y_m: lerp(previous.y_m, next.y_m, ratio),
    t: new Date(sharedTimeMs).toISOString(),
    speed_mps: lerp(previous.speed_mps, next.speed_mps, ratio),
    speed_smooth_mps: lerp(previous.speed_smooth_mps, next.speed_smooth_mps, ratio),
    ...(typeof heartRate === "number" ? { heart_rate_bpm: heartRate } : {}),
  };
}

function findFirstPointAtOrAfter(points: SessionPoint[], timeMs: number) {
  let low = 0;
  let high = points.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (Date.parse(points[mid].t) < timeMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function emptyParticipantState(
  participant: MultiplayerParticipant,
  status: ParticipantPlaybackStatus,
): ParticipantPlaybackPoint {
  return {
    participantId: participant.participant_id,
    label: participant.label,
    status,
    point: null,
    previousIdx: null,
    nextIdx: null,
    sampleGapMs: null,
  };
}

function edgeParticipantState(
  participant: MultiplayerParticipant,
  status: "before_start" | "after_end",
  point: SessionPoint,
  index: number,
): ParticipantPlaybackPoint {
  return {
    participantId: participant.participant_id,
    label: participant.label,
    status,
    point,
    previousIdx: index,
    nextIdx: index,
    sampleGapMs: null,
  };
}

function lerp(start: number, end: number, ratio: number) {
  return start + (end - start) * ratio;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
