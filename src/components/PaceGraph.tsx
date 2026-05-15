import { useMemo, useState } from "react";
import type { UnitSystem } from "@/types/app-settings";
import type { SessionPoint, SessionSegment } from "@/types/session";
import { formatDistance, formatSpeed, formatTime } from "@/lib/format";

interface PaceGraphProps {
  points: SessionPoint[];
  startIdx: number;
  endIdx: number;
  selectedStartIdx?: number;
  selectedEndIdx?: number;
  segmentHighlights?: SessionSegment[];
  playheadIdx?: number;
  units?: UnitSystem;
  showHeartRate?: boolean;
  onHoverPoint?: (idx: number | null) => void;
  onSelectPoint?: (idx: number) => void;
}

const VIEWBOX_WIDTH = 720;
const SPEED_VIEWBOX_HEIGHT = 190;
const STACKED_VIEWBOX_HEIGHT = 320;
const SPEED_PLOT = {
  left: 62,
  right: 704,
  top: 14,
  bottom: 152,
};
const HR_PLOT = {
  left: 62,
  right: 704,
  top: 180,
  bottom: 292,
};

export function PaceGraph({
  points,
  startIdx,
  endIdx,
  selectedStartIdx,
  selectedEndIdx,
  segmentHighlights = [],
  playheadIdx,
  units = "metric",
  showHeartRate = true,
  onHoverPoint,
  onSelectPoint,
}: PaceGraphProps) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const range = useMemo(() => points.slice(startIdx, endIdx + 1), [endIdx, points, startIdx]);
  const graph = useMemo(() => buildGraph(range, startIdx, units), [range, startIdx, units]);
  const hasHeartRate = showHeartRate && graph.hrLinePoints != null;
  const viewBoxHeight = hasHeartRate ? STACKED_VIEWBOX_HEIGHT : SPEED_VIEWBOX_HEIGHT;
  const selectedStart = selectedStartIdx != null ? points[selectedStartIdx] : null;
  const selectedEnd = selectedEndIdx != null ? points[selectedEndIdx] : null;
  const selectedLeft = selectedStart ? graph.toX(selectedStart) : null;
  const selectedRight = selectedEnd ? graph.toX(selectedEnd) : null;
  const playhead = playheadIdx != null ? points[playheadIdx] : null;
  const hovered = hoverX == null ? null : graph.nearestPoint(hoverX);
  const highlightedRanges = segmentHighlights
    .map((segment) =>
      getRangeHighlight({
        points,
        graph,
        rangeStartIdx: startIdx,
        rangeEndIdx: endIdx,
        segmentStartIdx: segment.start_idx,
        segmentEndIdx: segment.end_idx,
      }),
    )
    .filter((range): range is { left: number; width: number } => range !== null);

  return (
    <div className="rounded-xl border border-border/55 bg-background/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Pace graph
        </span>
        <span className="text-[10px] text-muted-foreground">
          {hasHeartRate ? "Speed + heart rate" : "Speed higher"}
        </span>
      </div>

      <div className={`relative w-full ${hasHeartRate ? "h-80" : "h-52"}`}>
        <div
          className="pointer-events-none absolute left-0 -translate-y-1/2 -rotate-90 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
          style={{ top: hasHeartRate ? "25%" : "50%" }}
        >
          Speed {units === "imperial" ? "mph" : "km/h"}
        </div>
        {hasHeartRate ? (
          <div className="pointer-events-none absolute left-0 top-[73%] -translate-y-1/2 -rotate-90 text-[10px] font-medium uppercase tracking-wider text-red-400/85">
            HR bpm
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Time
        </div>

        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${viewBoxHeight}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={hasHeartRate ? "Speed and heart rate over time" : "Speed over time"}
          className={`h-full w-full ${onSelectPoint ? "cursor-crosshair" : ""}`}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
            const x = ratio * VIEWBOX_WIDTH;
            const nearest = graph.nearestPoint(x);
            setHoverX(x);
            onHoverPoint?.(nearest?.absoluteIdx ?? null);
          }}
          onMouseLeave={() => {
            setHoverX(null);
            onHoverPoint?.(null);
          }}
          onClick={() => {
            if (hovered) onSelectPoint?.(hovered.absoluteIdx);
          }}
        >
          {graph.yTicks.map((tick) => (
            <line
              key={`y-grid-${tick.value}`}
              x1={SPEED_PLOT.left}
              y1={tick.y}
              x2={SPEED_PLOT.right}
              y2={tick.y}
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-border/70 dark:text-border/80"
            />
          ))}
          {graph.xTicks.map((tick) => (
            <line
              key={`x-grid-${tick.value}`}
              x1={tick.x}
              y1={SPEED_PLOT.top}
              x2={tick.x}
              y2={hasHeartRate ? HR_PLOT.bottom : SPEED_PLOT.bottom}
              stroke="currentColor"
              strokeWidth="0.45"
              className="text-border/45 dark:text-border/65"
            />
          ))}
          <line
            x1={SPEED_PLOT.left}
            y1={SPEED_PLOT.bottom}
            x2={SPEED_PLOT.right}
            y2={SPEED_PLOT.bottom}
            stroke="currentColor"
            strokeWidth="0.8"
            className="text-border dark:text-border/90"
          />
          <line
            x1={SPEED_PLOT.left}
            y1={SPEED_PLOT.top}
            x2={SPEED_PLOT.left}
            y2={SPEED_PLOT.bottom}
            stroke="currentColor"
            strokeWidth="0.8"
            className="text-border dark:text-border/90"
          />
          {graph.yTicks.map((tick) => (
            <text
              key={`y-label-${tick.value}`}
              x={SPEED_PLOT.left - 8}
              y={tick.y + 3.5}
              textAnchor="end"
              className="fill-muted-foreground text-[9px] font-medium dark:fill-slate-300"
            >
              {tick.label}
            </text>
          ))}
          {graph.xTicks.map((tick) => (
            <text
              key={`x-label-${tick.value}`}
              x={tick.x}
              y={(hasHeartRate ? HR_PLOT.bottom : SPEED_PLOT.bottom) + 17}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px] font-medium dark:fill-slate-300"
            >
              {tick.label}
            </text>
          ))}
          {highlightedRanges.map((range, index) => (
            <g key={`segment-highlight-${index}`}>
              <rect
                x={range.left}
                y={SPEED_PLOT.top}
                width={range.width}
                height={SPEED_PLOT.bottom - SPEED_PLOT.top}
                fill="currentColor"
                className="text-primary/7"
              />
              {hasHeartRate ? (
                <rect
                  x={range.left}
                  y={HR_PLOT.top}
                  width={range.width}
                  height={HR_PLOT.bottom - HR_PLOT.top}
                  fill="currentColor"
                  className="text-red-400/8"
                />
              ) : null}
            </g>
          ))}
          {selectedLeft != null && selectedRight != null ? (
            <>
              <rect
                x={Math.min(selectedLeft, selectedRight)}
                y={SPEED_PLOT.top}
                width={Math.max(1, Math.abs(selectedRight - selectedLeft))}
                height={SPEED_PLOT.bottom - SPEED_PLOT.top}
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="0.7"
                className="text-primary/30"
              />
              {hasHeartRate ? (
                <rect
                  x={Math.min(selectedLeft, selectedRight)}
                  y={HR_PLOT.top}
                  width={Math.max(1, Math.abs(selectedRight - selectedLeft))}
                  height={HR_PLOT.bottom - HR_PLOT.top}
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="0.7"
                  className="text-red-400/24"
                />
              ) : null}
            </>
          ) : null}
          {graph.linePoints ? (
            <polyline
              points={graph.linePoints}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            />
          ) : null}
          {playhead ? (
            <line
              x1={graph.toX(playhead)}
              y1={SPEED_PLOT.top}
              x2={graph.toX(playhead)}
              y2={hasHeartRate ? HR_PLOT.bottom : SPEED_PLOT.bottom}
              stroke="currentColor"
              strokeWidth="1.15"
              className="text-foreground"
            />
          ) : null}
          {hovered ? (
            <>
              <line
                x1={hovered.x}
                y1={SPEED_PLOT.top}
                x2={hovered.x}
                y2={hasHeartRate ? HR_PLOT.bottom : SPEED_PLOT.bottom}
                stroke="currentColor"
                strokeWidth="1"
                className="text-foreground/80"
              />
              <circle
                cx={hovered.x}
                cy={hovered.y}
                r="3.5"
                fill="currentColor"
                stroke="white"
                strokeWidth="1.3"
                className="text-primary"
              />
            </>
          ) : null}
          {hasHeartRate ? (
            <>
              {graph.hrTicks.map((tick) => (
                <line
                  key={`hr-grid-${tick.value}`}
                  x1={HR_PLOT.left}
                  y1={tick.y}
                  x2={HR_PLOT.right}
                  y2={tick.y}
                  stroke="currentColor"
                  strokeWidth="0.45"
                  className="text-red-400/20"
                />
              ))}
              <line
                x1={HR_PLOT.left}
                y1={HR_PLOT.bottom}
                x2={HR_PLOT.right}
                y2={HR_PLOT.bottom}
                stroke="currentColor"
                strokeWidth="0.8"
                className="text-red-400/35"
              />
              <line
                x1={HR_PLOT.left}
                y1={HR_PLOT.top}
                x2={HR_PLOT.left}
                y2={HR_PLOT.bottom}
                stroke="currentColor"
                strokeWidth="0.8"
                className="text-red-400/35"
              />
              {graph.hrTicks.map((tick) => (
                <text
                  key={`hr-label-${tick.value}`}
                  x={HR_PLOT.left - 8}
                  y={tick.y + 3.5}
                  textAnchor="end"
                  className="fill-red-400/80 text-[9px] font-medium"
                >
                  {tick.label}
                </text>
              ))}
              <polyline
                points={graph.hrLinePoints ?? ""}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.35"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-red-400"
              />
              {hovered?.hrY != null ? (
                <circle
                  cx={hovered.x}
                  cy={hovered.hrY}
                  r="3.5"
                  fill="currentColor"
                  stroke="white"
                  strokeWidth="1.3"
                  className="text-red-400"
                />
              ) : null}
            </>
          ) : null}
        </svg>

        {hovered ? (
          <GraphTooltip
            hovered={hovered}
            units={units}
            alignRight={hovered.x > VIEWBOX_WIDTH / 2}
          />
        ) : null}
      </div>
    </div>
  );
}

function buildGraph(range: SessionPoint[], startIdx: number, units: UnitSystem) {
  const first = range[0];
  const last = range[range.length - 1];
  const startMs = first ? new Date(first.t).getTime() : 0;
  const endMs = last ? new Date(last.t).getTime() : startMs + 1;
  const durationMs = Math.max(1, endMs - startMs);
  const speeds = range.map(getPointSpeed);
  const heartRates = range
    .map((point) => point.heart_rate_bpm)
    .filter((value): value is number => typeof value === "number");
  const speedFactor = units === "imperial" ? 2.236936 : 3.6;
  const maxDisplaySpeed = Math.max(1, ...speeds.map((speed) => speed * speedFactor));
  const yMaxDisplay = niceCeil(maxDisplaySpeed);
  const yMaxMps = yMaxDisplay / speedFactor;
  const hrMin = heartRates.length > 0 ? Math.floor(Math.min(...heartRates) / 5) * 5 : 0;
  const hrMax = heartRates.length > 0 ? Math.ceil(Math.max(...heartRates) / 5) * 5 : 0;
  const hrRange = Math.max(10, hrMax - hrMin);
  const hrYMin = Math.max(0, hrMin - 5);
  const hrYMax = hrYMin + hrRange + 10;
  const yTicks = buildSpeedTicks(yMaxDisplay, units).map((value) => ({
    value,
    label: formatTickNumber(value),
    y: toYForSpeed(value / speedFactor, yMaxMps),
  }));
  const hrTicks = buildHeartRateTicks(hrYMin, hrYMax).map((value) => ({
    value,
    label: String(value),
    y: toYForHeartRate(value, hrYMin, hrYMax),
  }));
  const xTicks = buildTimeTicks(durationMs).map((value) => ({
    value,
    label: formatElapsedTick(value),
    x: SPEED_PLOT.left + (value / (durationMs / 1000)) * (SPEED_PLOT.right - SPEED_PLOT.left),
  }));
  const cumulativeMeters = buildCumulativeMeters(range);
  const toX = (point: SessionPoint) =>
    SPEED_PLOT.left +
    ((new Date(point.t).getTime() - startMs) / durationMs) *
      (SPEED_PLOT.right - SPEED_PLOT.left);
  const toY = (point: SessionPoint) => {
    return toYForSpeed(getPointSpeed(point), yMaxMps);
  };
  const toHrY = (point: SessionPoint) =>
    point.heart_rate_bpm == null ? null : toYForHeartRate(point.heart_rate_bpm, hrYMin, hrYMax);
  const plotted = range.map((point, index) => ({
    point,
    index,
    absoluteIdx: startIdx + index,
    x: toX(point),
    y: toY(point),
    hrY: toHrY(point),
    distanceM: cumulativeMeters[index] ?? 0,
  }));
  const hrLinePoints = plotted
    .filter((plot) => plot.hrY != null)
    .map(({ x, hrY }) => `${x.toFixed(2)},${(hrY ?? 0).toFixed(2)}`)
    .join(" ");

  return {
    linePoints: plotted.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
    hrLinePoints: hrLinePoints.length > 0 ? hrLinePoints : null,
    xTicks,
    yTicks,
    hrTicks,
    toX,
    nearestPoint: (x: number) => {
      if (plotted.length === 0) return null;

      return plotted.reduce(
        (nearest, candidate) =>
          Math.abs(candidate.x - x) < Math.abs(nearest.x - x) ? candidate : nearest,
        plotted[0],
      );
    },
  };
}

function toYForSpeed(speedMps: number, maxSpeedMps: number) {
  return SPEED_PLOT.bottom - (speedMps / Math.max(0.1, maxSpeedMps)) * (SPEED_PLOT.bottom - SPEED_PLOT.top);
}

function toYForHeartRate(bpm: number, minBpm: number, maxBpm: number) {
  const ratio = (bpm - minBpm) / Math.max(1, maxBpm - minBpm);
  return HR_PLOT.bottom - ratio * (HR_PLOT.bottom - HR_PLOT.top);
}

function getRangeHighlight({
  points,
  graph,
  rangeStartIdx,
  rangeEndIdx,
  segmentStartIdx,
  segmentEndIdx,
}: {
  points: SessionPoint[];
  graph: ReturnType<typeof buildGraph>;
  rangeStartIdx: number;
  rangeEndIdx: number;
  segmentStartIdx: number;
  segmentEndIdx: number;
}) {
  const start = Math.max(rangeStartIdx, segmentStartIdx);
  const end = Math.min(rangeEndIdx, segmentEndIdx);
  if (end < start) return null;

  const startPoint = points[start];
  const endPoint = points[end];
  if (!startPoint || !endPoint) return null;

  const left = Math.max(SPEED_PLOT.left, Math.min(graph.toX(startPoint), graph.toX(endPoint)));
  const right = Math.min(SPEED_PLOT.right, Math.max(graph.toX(startPoint), graph.toX(endPoint)));
  return {
    left,
    width: Math.max(1, right - left),
  };
}

function GraphTooltip({
  hovered,
  units,
  alignRight,
}: {
  hovered: {
    point: SessionPoint;
    x: number;
    hrY: number | null;
    distanceM: number;
    absoluteIdx: number;
  };
  units: UnitSystem;
  alignRight: boolean;
}) {
  const leftPercent = (hovered.x / VIEWBOX_WIDTH) * 100;

  return (
    <div
      className="pointer-events-none absolute top-8 w-44 rounded-lg border border-border/70 bg-card/95 p-2 text-xs shadow-lg backdrop-blur"
      style={{
        left: `${leftPercent}%`,
        transform: alignRight ? "translateX(-100%)" : "translateX(0)",
      }}
    >
      <div className="font-mono text-[11px] font-semibold text-foreground">
        {formatTime(hovered.point.t)}
      </div>
      <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
        <div>
          Speed{" "}
          <span className="font-mono text-foreground">
            {formatSpeed(getPointSpeed(hovered.point), units)}
          </span>
        </div>
        <div>
          Distance{" "}
          <span className="font-mono text-foreground">
            {formatDistance(hovered.distanceM, units)}
          </span>
        </div>
        {hovered.point.heart_rate_bpm != null ? (
          <div>
            Heart rate{" "}
            <span className="font-mono text-red-400">
              {Math.round(hovered.point.heart_rate_bpm)} bpm
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getPointSpeed(point: SessionPoint) {
  return point.speed_smooth_mps ?? point.speed_mps ?? 0;
}

function buildCumulativeMeters(points: SessionPoint[]) {
  let total = 0;

  return points.map((point, index) => {
    if (index > 0) {
      const previous = points[index - 1];
      const dx = point.x_m - previous.x_m;
      const dy = point.y_m - previous.y_m;
      total += Math.sqrt(dx * dx + dy * dy);
    }

    return total;
  });
}

function buildSpeedTicks(maxSpeed: number, units: UnitSystem) {
  const targetTicks = units === "imperial" ? 5 : 6;
  const step = niceStep(maxSpeed / Math.max(1, targetTicks - 1));
  const top = Math.max(step, Math.ceil(maxSpeed / step) * step);
  const ticks: number[] = [];

  for (let value = 0; value <= top + step * 0.25; value += step) {
    ticks.push(roundTickValue(value));
  }

  return ticks.slice(0, 6);
}

function buildTimeTicks(durationMs: number) {
  const durationS = Math.max(1, durationMs / 1000);
  const step = pickTimeStep(durationS / 6);
  const ticks: number[] = [];
  const roundedDuration = Math.round(durationS);

  for (let value = 0; value <= durationS + step * 0.25; value += step) {
    ticks.push(Math.round(value));
  }

  if (ticks[ticks.length - 1] !== roundedDuration) {
    const previousTick = ticks[ticks.length - 1] ?? 0;
    const closeToPreviousTick = roundedDuration - previousTick < step * 0.45;

    if (closeToPreviousTick && ticks.length > 1) {
      ticks[ticks.length - 1] = roundedDuration;
    } else {
      ticks.push(roundedDuration);
    }
  }

  return ticks.slice(0, 7);
}

function buildHeartRateTicks(minBpm: number, maxBpm: number) {
  const step = maxBpm - minBpm > 50 ? 20 : 10;
  const ticks: number[] = [];
  const start = Math.ceil(minBpm / step) * step;

  for (let value = start; value <= maxBpm + step * 0.25; value += step) {
    ticks.push(value);
  }

  if (ticks.length > 4) {
    return ticks.filter((_, index) => index % 2 === 0).slice(0, 4);
  }

  return ticks.slice(0, 4);
}

function niceCeil(value: number) {
  const step = niceStep(value / 5);
  return Math.ceil(value / step) * step;
}

function niceStep(rawStep: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rawStep, 0.001)));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 2.5) return 2.5 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function pickTimeStep(rawStepS: number) {
  const steps = [10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
  return steps.find((step) => step >= rawStepS) ?? steps[steps.length - 1];
}

function formatElapsedTick(seconds: number) {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds === 0
      ? `${minutes}m`
      : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

function formatTickNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function roundTickValue(value: number) {
  return Math.round(value * 10) / 10;
}
