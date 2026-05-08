import { useMemo, useState } from "react";
import type { UnitSystem } from "@/types/app-settings";
import type { SessionPoint } from "@/types/session";
import { formatDistance, formatSpeed, formatTime } from "@/lib/format";

interface PaceGraphProps {
  points: SessionPoint[];
  startIdx: number;
  endIdx: number;
  selectedStartIdx?: number;
  selectedEndIdx?: number;
  playheadIdx?: number;
  units?: UnitSystem;
  onHoverPoint?: (idx: number | null) => void;
  onSelectPoint?: (idx: number) => void;
}

const VIEWBOX_WIDTH = 720;
const VIEWBOX_HEIGHT = 190;
const PLOT = {
  left: 62,
  right: 704,
  top: 14,
  bottom: 152,
};

export function PaceGraph({
  points,
  startIdx,
  endIdx,
  selectedStartIdx,
  selectedEndIdx,
  playheadIdx,
  units = "metric",
  onHoverPoint,
  onSelectPoint,
}: PaceGraphProps) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const range = useMemo(() => points.slice(startIdx, endIdx + 1), [endIdx, points, startIdx]);
  const graph = useMemo(() => buildGraph(range, startIdx, units), [range, startIdx, units]);
  const selectedStart = selectedStartIdx != null ? points[selectedStartIdx] : null;
  const selectedEnd = selectedEndIdx != null ? points[selectedEndIdx] : null;
  const selectedLeft = selectedStart ? graph.toX(selectedStart) : null;
  const selectedRight = selectedEnd ? graph.toX(selectedEnd) : null;
  const playhead = playheadIdx != null ? points[playheadIdx] : null;
  const hovered = hoverX == null ? null : graph.nearestPoint(hoverX);

  return (
    <div className="rounded-xl border border-border/55 bg-background/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Pace graph
        </span>
        <span className="text-[10px] text-muted-foreground">Speed higher</span>
      </div>

      <div className="relative h-52 w-full">
        <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Speed {units === "imperial" ? "mph" : "km/h"}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Time
        </div>

        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Speed over time"
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
              x1={PLOT.left}
              y1={tick.y}
              x2={PLOT.right}
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
              y1={PLOT.top}
              x2={tick.x}
              y2={PLOT.bottom}
              stroke="currentColor"
              strokeWidth="0.45"
              className="text-border/45 dark:text-border/65"
            />
          ))}
          <line
            x1={PLOT.left}
            y1={PLOT.bottom}
            x2={PLOT.right}
            y2={PLOT.bottom}
            stroke="currentColor"
            strokeWidth="0.8"
            className="text-border dark:text-border/90"
          />
          <line
            x1={PLOT.left}
            y1={PLOT.top}
            x2={PLOT.left}
            y2={PLOT.bottom}
            stroke="currentColor"
            strokeWidth="0.8"
            className="text-border dark:text-border/90"
          />
          {graph.yTicks.map((tick) => (
            <text
              key={`y-label-${tick.value}`}
              x={PLOT.left - 8}
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
              y={PLOT.bottom + 17}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px] font-medium dark:fill-slate-300"
            >
              {tick.label}
            </text>
          ))}
          {selectedLeft != null && selectedRight != null ? (
            <rect
              x={Math.min(selectedLeft, selectedRight)}
              y={PLOT.top}
              width={Math.max(1, Math.abs(selectedRight - selectedLeft))}
              height={PLOT.bottom - PLOT.top}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="0.7"
              className="text-primary/20"
            />
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
              y1={PLOT.top}
              x2={graph.toX(playhead)}
              y2={PLOT.bottom}
              stroke="currentColor"
              strokeWidth="1.15"
              className="text-foreground"
            />
          ) : null}
          {hovered ? (
            <>
              <line
                x1={hovered.x}
                y1={PLOT.top}
                x2={hovered.x}
                y2={PLOT.bottom}
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
  const speedFactor = units === "imperial" ? 2.236936 : 3.6;
  const maxDisplaySpeed = Math.max(1, ...speeds.map((speed) => speed * speedFactor));
  const yMaxDisplay = niceCeil(maxDisplaySpeed);
  const yMaxMps = yMaxDisplay / speedFactor;
  const yTicks = buildSpeedTicks(yMaxDisplay, units).map((value) => ({
    value,
    label: formatTickNumber(value),
    y: toYForSpeed(value / speedFactor, yMaxMps),
  }));
  const xTicks = buildTimeTicks(durationMs).map((value) => ({
    value,
    label: formatElapsedTick(value),
    x: PLOT.left + (value / (durationMs / 1000)) * (PLOT.right - PLOT.left),
  }));
  const cumulativeMeters = buildCumulativeMeters(range);
  const toX = (point: SessionPoint) =>
    PLOT.left + ((new Date(point.t).getTime() - startMs) / durationMs) * (PLOT.right - PLOT.left);
  const toY = (point: SessionPoint) => {
    return toYForSpeed(getPointSpeed(point), yMaxMps);
  };
  const plotted = range.map((point, index) => ({
    point,
    index,
    absoluteIdx: startIdx + index,
    x: toX(point),
    y: toY(point),
    distanceM: cumulativeMeters[index] ?? 0,
  }));

  return {
    linePoints: plotted.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
    xTicks,
    yTicks,
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
  return PLOT.bottom - (speedMps / Math.max(0.1, maxSpeedMps)) * (PLOT.bottom - PLOT.top);
}

function GraphTooltip({
  hovered,
  units,
  alignRight,
}: {
  hovered: {
    point: SessionPoint;
    x: number;
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
