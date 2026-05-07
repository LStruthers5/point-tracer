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
  left: 42,
  right: 704,
  top: 14,
  bottom: 154,
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
  const graph = useMemo(() => buildGraph(range, startIdx), [range, startIdx]);
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
          Speed
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
          {[0.25, 0.5, 0.75].map((tick) => (
            <line
              key={tick}
              x1={PLOT.left}
              y1={PLOT.bottom - (PLOT.bottom - PLOT.top) * tick}
              x2={PLOT.right}
              y2={PLOT.bottom - (PLOT.bottom - PLOT.top) * tick}
              stroke="currentColor"
              strokeWidth="0.45"
              className="text-border/55"
            />
          ))}
          {[0.25, 0.5, 0.75].map((tick) => (
            <line
              key={`x-${tick}`}
              x1={PLOT.left + (PLOT.right - PLOT.left) * tick}
              y1={PLOT.top}
              x2={PLOT.left + (PLOT.right - PLOT.left) * tick}
              y2={PLOT.bottom}
              stroke="currentColor"
              strokeWidth="0.35"
              className="text-border/35"
            />
          ))}
          <line
            x1={PLOT.left}
            y1={PLOT.bottom}
            x2={PLOT.right}
            y2={PLOT.bottom}
            stroke="currentColor"
            strokeWidth="0.8"
            className="text-border"
          />
          <line
            x1={PLOT.left}
            y1={PLOT.top}
            x2={PLOT.left}
            y2={PLOT.bottom}
            stroke="currentColor"
            strokeWidth="0.8"
            className="text-border"
          />
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
              strokeWidth="1.55"
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

function buildGraph(range: SessionPoint[], startIdx: number) {
  const first = range[0];
  const last = range[range.length - 1];
  const startMs = first ? new Date(first.t).getTime() : 0;
  const endMs = last ? new Date(last.t).getTime() : startMs + 1;
  const durationMs = Math.max(1, endMs - startMs);
  const speeds = range.map(getPointSpeed);
  const maxSpeed = Math.max(1, ...speeds);
  const cumulativeMeters = buildCumulativeMeters(range);
  const toX = (point: SessionPoint) =>
    PLOT.left + ((new Date(point.t).getTime() - startMs) / durationMs) * (PLOT.right - PLOT.left);
  const toY = (point: SessionPoint) => {
    return PLOT.bottom - (getPointSpeed(point) / maxSpeed) * (PLOT.bottom - PLOT.top);
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
