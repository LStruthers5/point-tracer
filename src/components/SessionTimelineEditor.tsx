import { useMemo, useState } from "react";
import { Pause, Pencil, Play, Plus, RotateCcw, Scissors, Target, Trash2 } from "lucide-react";
import type { SessionPoint, SessionSegment, SessionSummary } from "@/types/session";
import type { UnitSystem } from "@/types/app-settings";
import type {
  MapColorMode,
  MapDisplayOptions,
  MapGradientMode,
  MapHeatmapMode,
  MapLineColor,
  MapTraceMode,
} from "@/types/map-display";
import { getMapSpeedGradientStops, MAP_LINE_COLORS } from "@/types/map-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaceGraph } from "@/components/PaceGraph";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration, formatDistance, formatTimeRange } from "@/lib/format";

interface SessionTimelineEditorProps {
  points: SessionPoint[];
  segments: SessionSegment[];
  summary: SessionSummary;
  selectedId: number | null;
  hoveredId: number | null;
  playheadIdx: number;
  totalPoints: number;
  playing: boolean;
  displayOptions: MapDisplayOptions;
  units: UnitSystem;
  showPaceGraph: boolean;
  showHeartRateChart: boolean;
  manualSegmentIds: Set<number>;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSeek: (idx: number) => void;
  onGraphHover: (idx: number | null) => void;
  onGraphSelect: (idx: number) => void;
  onDisplayOptionsChange: (options: MapDisplayOptions) => void;
  onFocusSelected: () => void;
  onDeleteSelected: () => void;
  onUpdateSegment: (segmentId: number, startIdx: number, endIdx: number, label?: string) => void;
  onAddSegmentAtPlayhead: (startIdx: number, endIdx: number, label?: string) => void;
  onSplitSelected: () => void;
}

export function SessionTimelineEditor({
  points,
  segments,
  summary,
  selectedId,
  hoveredId,
  playheadIdx,
  totalPoints,
  playing,
  displayOptions,
  units,
  showPaceGraph,
  showHeartRateChart,
  manualSegmentIds,
  onSelect,
  onHover,
  onPlay,
  onPause,
  onRestart,
  onSeek,
  onGraphHover,
  onGraphSelect,
  onDisplayOptionsChange,
  onFocusSelected,
  onUpdateSegment,
  onDeleteSelected,
  onAddSegmentAtPlayhead,
  onSplitSelected,
}: SessionTimelineEditorProps) {
  const [editorMode, setEditorMode] = useState<"add" | "edit" | null>(null);
  const [draftStartIdx, setDraftStartIdx] = useState(0);
  const [draftEndIdx, setDraftEndIdx] = useState(0);
  const [draftLabel, setDraftLabel] = useState("");
  const selectedSegment = segments.find((segment) => segment.segment_id === selectedId) ?? null;
  const canSplitSelected = Boolean(
    selectedSegment &&
    selectedSegment.point_count >= 4 &&
    playheadIdx > selectedSegment.start_idx &&
    playheadIdx < selectedSegment.end_idx,
  );
  const totalDurationMs = Math.max(
    1,
    new Date(summary.end_time).getTime() - new Date(summary.start_time).getTime(),
  );
  const playheadTimeMs = points[playheadIdx]
    ? new Date(points[playheadIdx].t).getTime()
    : new Date(summary.start_time).getTime();
  const playheadProgress = clamp01(
    (playheadTimeMs - new Date(summary.start_time).getTime()) / totalDurationMs,
  );
  const currentTime = Math.max(0, (playheadTimeMs - new Date(summary.start_time).getTime()) / 1000);
  const editContext = useMemo(
    () =>
      getEditContext({
        mode: editorMode,
        playheadIdx,
        selectedSegment,
        segments,
        totalPoints,
      }),
    [editorMode, playheadIdx, selectedSegment, segments, totalPoints],
  );

  const openAddEditor = () => {
    const context = getEditContext({
      mode: "add",
      playheadIdx,
      selectedSegment,
      segments,
      totalPoints,
    });
    setDraftStartIdx(context.startIdx);
    setDraftEndIdx(context.endIdx);
    setDraftLabel("");
    setEditorMode("add");
  };

  const openEditEditor = () => {
    if (!selectedSegment) return;
    setDraftStartIdx(selectedSegment.start_idx);
    setDraftEndIdx(selectedSegment.end_idx);
    setDraftLabel(selectedSegment.label);
    setEditorMode("edit");
  };

  const applyEditor = () => {
    const startIdx = Math.min(draftStartIdx, draftEndIdx);
    const endIdx = Math.max(draftStartIdx, draftEndIdx);
    if (endIdx <= startIdx) return;

    if (editorMode === "add") {
      onAddSegmentAtPlayhead(startIdx, endIdx, draftLabel.trim());
    } else if (editorMode === "edit" && selectedSegment) {
      onUpdateSegment(selectedSegment.segment_id, startIdx, endIdx, draftLabel.trim());
    }

    setEditorMode(null);
  };

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Session Timeline
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatTimeRange(summary.start_time, summary.end_time)}</span>
            <span className="text-border">•</span>
            <span>{formatDuration(summary.duration_min * 60)}</span>
            <span className="text-border">•</span>
            <span>{segments.length} suggested segments</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
            {formatDuration(currentTime)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openAddEditor}
            title="Open a focused editor around the current playhead"
            className="h-8 gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add segment
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSplitSelected}
            disabled={!canSplitSelected}
            className="h-8 gap-1.5 text-xs"
          >
            <Scissors className="h-3.5 w-3.5" />
            Split at playhead
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[8.5rem_1fr] sm:items-center">
        <div className="flex items-center gap-2">
          <IconButton onClick={onRestart} label="Restart full activity">
            <RotateCcw className="h-4 w-4" />
          </IconButton>
          <button
            type="button"
            onClick={playing ? onPause : onPlay}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:brightness-110 active:scale-95"
            aria-label={playing ? "Pause full activity" : "Play full activity"}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>
        </div>

        <div className="relative h-20 overflow-hidden border border-border/60 bg-secondary/25">
          <div className="absolute inset-x-0 top-6 h-7 bg-muted/50" />
          <div className="absolute inset-x-0 top-6 z-50 h-7">
            {segments.map((segment) => {
              const startOffset =
                new Date(segment.start_time).getTime() - new Date(summary.start_time).getTime();
              const segmentDuration =
                new Date(segment.end_time).getTime() - new Date(segment.start_time).getTime();
              const left = Math.max(0, Math.min(100, (startOffset / totalDurationMs) * 100));
              const width = Math.max(
                0.35,
                Math.min(100 - left, (segmentDuration / totalDurationMs) * 100),
              );
              const active = selectedId === segment.segment_id;
              const hovered = hoveredId === segment.segment_id;

              return (
                <button
                  key={segment.segment_id}
                  type="button"
                  onClick={() => onSelect(segment.segment_id)}
                  onMouseEnter={() => onHover(segment.segment_id)}
                  onMouseLeave={() => onHover(null)}
                  aria-label={`Select ${segment.label}`}
                  title={`${segment.label} · ${formatDuration(
                    segment.duration_s,
                  )} · ${formatDistance(segment.distance_m, units)}`}
                  className={`absolute top-0 h-7 cursor-pointer border-x-2 border-y transition-colors ${
                    active
                      ? "z-20 border-primary bg-primary/80 shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.22)]"
                      : hovered
                        ? "z-10 border-primary/75 bg-primary/55"
                        : "border-primary/45 bg-primary/30 hover:bg-primary/45"
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  <span className="sr-only">{segment.label}</span>
                </button>
              );
            })}
          </div>

          <div
            className="pointer-events-none absolute top-2 bottom-2 z-30 w-px bg-foreground shadow-[0_0_10px_var(--glow)]"
            style={{ left: `${playheadProgress * 100}%` }}
          >
            <div className="absolute -left-1.5 -top-1 h-3 w-3 rotate-45 border border-primary bg-background" />
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(1, totalPoints - 1)}
            step={1}
            value={playheadIdx}
            onChange={(event) => onSeek(Number(event.target.value))}
            aria-label="Full activity playhead"
            className="absolute inset-x-0 bottom-0 z-10 h-full cursor-ew-resize opacity-0"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div className="min-h-16 rounded-xl bg-secondary/35 p-3">
          {selectedSegment ? (
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {selectedSegment.label}
                  </div>
                  {getSegmentExplanationTags(selectedSegment, manualSegmentIds).map((tag) => (
                    <ExplanationTag key={tag}>{tag}</ExplanationTag>
                  ))}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {formatTimeRange(selectedSegment.start_time, selectedSegment.end_time)}
                  </span>
                  <span>{formatDuration(selectedSegment.duration_s)}</span>
                  <span>{formatDistance(selectedSegment.distance_m, units)}</span>
                  <span>{selectedSegment.point_count} pts</span>
                </div>
              </div>
              <div className="flex items-center gap-2 md:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onFocusSelected}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Target className="h-3.5 w-3.5" />
                  Focus
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openEditEditor}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onDeleteSelected}
                  className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Select a suggested segment</div>
          )}
        </div>
        <div className="grid min-w-40 grid-cols-2 gap-2 rounded-xl bg-secondary/35 p-3 text-center">
          <Metric label="Points" value={String(summary.trackpoint_count)} />
          <Metric label="Distance" value={formatDistance(summary.distance_m, units)} />
        </div>
      </div>

      <div className="mt-3 grid gap-2 border-t border-border/50 pt-3 sm:grid-cols-4">
        <OptionSelect
          label="Trace"
          value={displayOptions.traceMode}
          onValueChange={(traceMode) =>
            onDisplayOptionsChange({ ...displayOptions, traceMode: traceMode as MapTraceMode })
          }
          items={[
            { value: "full", label: "Full trace" },
            { value: "streak", label: "Streak" },
            { value: "none", label: "No trace" },
            { value: "heatmap", label: "Heatmap" },
          ]}
        />
        {displayOptions.traceMode === "heatmap" ? (
          <OptionSelect
            label="Heatmap"
            value={displayOptions.heatmapMode}
            onValueChange={(heatmapMode) =>
              onDisplayOptionsChange({
                ...displayOptions,
                heatmapMode: heatmapMode as MapHeatmapMode,
              })
            }
            items={[
              { value: "occupancy", label: "Occupancy" },
              { value: "speed", label: "Speed by area" },
            ]}
          />
        ) : null}
        <OptionSelect
          label="Color"
          value={displayOptions.lineColor}
          onValueChange={(lineColor) =>
            onDisplayOptionsChange({ ...displayOptions, lineColor: lineColor as MapLineColor })
          }
          items={[
            { value: "green", label: "Green" },
            { value: "cyan", label: "Cyan" },
            { value: "amber", label: "Amber" },
            { value: "rose", label: "Rose" },
          ]}
        />
        {displayOptions.traceMode !== "heatmap" ? (
          <>
            <OptionSelect
              label="Line mode"
              value={displayOptions.colorMode}
              onValueChange={(colorMode) =>
                onDisplayOptionsChange({ ...displayOptions, colorMode: colorMode as MapColorMode })
              }
              items={[
                { value: "solid", label: "Solid" },
                { value: "speed", label: "Speed gradient" },
              ]}
            />
            <OptionSelect
              label="Gradient"
              value={displayOptions.gradientMode}
              onValueChange={(gradientMode) =>
                onDisplayOptionsChange({
                  ...displayOptions,
                  gradientMode: gradientMode as MapGradientMode,
                })
              }
              items={[
                { value: "multi", label: "Multicolor" },
                { value: "single", label: "Single color" },
              ]}
            />
          </>
        ) : null}
      </div>

      {showPaceGraph && points.length > 1 ? (
        <div className="mt-3">
          <PaceGraph
            points={points}
            startIdx={0}
            endIdx={points.length - 1}
            segmentHighlights={segments}
            selectedStartIdx={selectedSegment?.start_idx}
            selectedEndIdx={selectedSegment?.end_idx}
            playheadIdx={playheadIdx}
            units={units}
            showHeartRate={showHeartRateChart}
            onHoverPoint={onGraphHover}
            onSelectPoint={onGraphSelect}
          />
        </div>
      ) : null}

      <SegmentRangeDialog
        mode={editorMode}
        open={editorMode !== null}
        points={points}
        segments={segments}
        selectedSegment={selectedSegment}
        contextStartIdx={editContext.startIdx}
        contextEndIdx={editContext.endIdx}
        playheadIdx={playheadIdx}
        draftStartIdx={draftStartIdx}
        draftEndIdx={draftEndIdx}
        draftLabel={draftLabel}
        displayOptions={displayOptions}
        showPaceGraph={showPaceGraph}
        showHeartRateChart={showHeartRateChart}
        units={units}
        onGraphHover={onGraphHover}
        onGraphSelect={onGraphSelect}
        onDraftStartChange={(idx) => {
          setDraftStartIdx(idx);
          if (draftEndIdx <= idx) setDraftEndIdx(Math.min(editContext.endIdx, idx + 1));
        }}
        onDraftEndChange={(idx) => {
          setDraftEndIdx(idx);
          if (draftStartIdx >= idx) setDraftStartIdx(Math.max(editContext.startIdx, idx - 1));
        }}
        onDraftLabelChange={setDraftLabel}
        onOpenChange={(open) => {
          if (!open) setEditorMode(null);
        }}
        onApply={applyEditor}
      />
    </div>
  );
}

function SegmentRangeDialog({
  mode,
  open,
  points,
  segments,
  selectedSegment,
  contextStartIdx,
  contextEndIdx,
  playheadIdx,
  draftStartIdx,
  draftEndIdx,
  draftLabel,
  displayOptions,
  showPaceGraph,
  showHeartRateChart,
  units,
  onDraftStartChange,
  onDraftEndChange,
  onDraftLabelChange,
  onGraphHover,
  onGraphSelect,
  onOpenChange,
  onApply,
}: {
  mode: "add" | "edit" | null;
  open: boolean;
  points: SessionPoint[];
  segments: SessionSegment[];
  selectedSegment: SessionSegment | null;
  contextStartIdx: number;
  contextEndIdx: number;
  playheadIdx: number;
  draftStartIdx: number;
  draftEndIdx: number;
  draftLabel: string;
  displayOptions: MapDisplayOptions;
  showPaceGraph: boolean;
  showHeartRateChart: boolean;
  units: UnitSystem;
  onGraphHover: (idx: number | null) => void;
  onGraphSelect: (idx: number) => void;
  onDraftStartChange: (idx: number) => void;
  onDraftEndChange: (idx: number) => void;
  onDraftLabelChange: (label: string) => void;
  onOpenChange: (open: boolean) => void;
  onApply: () => void;
}) {
  const draftStart = Math.min(draftStartIdx, draftEndIdx);
  const draftEnd = Math.max(draftStartIdx, draftEndIdx);
  const canApply = draftEnd > draftStart;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[2000] max-w-3xl border-border/70 bg-card">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit segment" : "Add segment"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Adjust the selected segment inside its surrounding timeline context."
              : "Place a new segment in the focused gap around the current playhead."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatPointTime(points[contextStartIdx])}</span>
            <span className="text-border">to</span>
            <span>{formatPointTime(points[contextEndIdx])}</span>
            <span className="text-border">•</span>
            <span>Playhead {formatPointTime(points[playheadIdx])}</span>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Segment name
            </span>
            <Input
              value={draftLabel}
              onChange={(event) => onDraftLabelChange(event.target.value)}
              placeholder={mode === "edit" ? selectedSegment?.label ?? "Segment name" : "Segment name"}
              className="h-9 rounded-xl border-border/70 bg-secondary/35 text-sm"
            />
          </label>

          <SegmentMiniMap
            points={points}
            contextStartIdx={contextStartIdx}
            contextEndIdx={contextEndIdx}
            draftStartIdx={draftStart}
            draftEndIdx={draftEnd}
            displayOptions={displayOptions}
          />

          {showPaceGraph ? (
            <PaceGraph
              points={points}
              startIdx={contextStartIdx}
              endIdx={contextEndIdx}
              selectedStartIdx={draftStart}
              selectedEndIdx={draftEnd}
              playheadIdx={playheadIdx}
              units={units}
              showHeartRate={false}
              onHoverPoint={onGraphHover}
              onSelectPoint={onGraphSelect}
            />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <RangeControl
              label="Start"
              value={draftStartIdx}
              min={contextStartIdx}
              max={Math.max(contextStartIdx, draftEndIdx - 1)}
              point={points[draftStartIdx]}
              onChange={onDraftStartChange}
            />
            <RangeControl
              label="End"
              value={draftEndIdx}
              min={Math.min(contextEndIdx, draftStartIdx + 1)}
              max={contextEndIdx}
              point={points[draftEndIdx]}
              onChange={onDraftEndChange}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onApply} disabled={!canApply}>
            {mode === "edit" ? "Apply edit" : "Add segment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  point,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  point?: SessionPoint;
  onChange: (idx: number) => void;
}) {
  return (
    <label className="space-y-2 rounded-xl bg-secondary/35 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {formatPointTime(point)} · #{value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={clampIndex(value, min, max)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
      />
    </label>
  );
}

function SegmentMiniMap({
  points,
  contextStartIdx,
  contextEndIdx,
  draftStartIdx,
  draftEndIdx,
  displayOptions,
}: {
  points: SessionPoint[];
  contextStartIdx: number;
  contextEndIdx: number;
  draftStartIdx: number;
  draftEndIdx: number;
  displayOptions: MapDisplayOptions;
}) {
  const contextPoints = points.slice(contextStartIdx, contextEndIdx + 1);
  const draftPoints = points.slice(draftStartIdx, draftEndIdx + 1);
  const showSpeedGradient = displayOptions.colorMode === "speed";
  const boundsPoints = contextPoints.length > 1 ? contextPoints : draftPoints;
  const minX = Math.min(...boundsPoints.map((point) => point.x_m));
  const maxX = Math.max(...boundsPoints.map((point) => point.x_m));
  const minY = Math.min(...boundsPoints.map((point) => point.y_m));
  const maxY = Math.max(...boundsPoints.map((point) => point.y_m));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const toSvgPoint = (point: SessionPoint) => {
    const x = 8 + ((point.x_m - minX) / width) * 84;
    const y = 92 - ((point.y_m - minY) / height) * 84;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  const contextPath = contextPoints.map(toSvgPoint).join(" ");
  const draftPath = draftPoints.map(toSvgPoint).join(" ");
  const draftSegments = draftPoints.slice(1).map((point, index) => ({
    key: `${draftPoints[index].t}-${point.t}-${index}`,
    from: getSvgPoint(draftPoints[index], minX, minY, width, height),
    to: getSvgPoint(point, minX, minY, width, height),
    color: miniMapSpeedColor(point.speed_smooth_mps ?? point.speed_mps, displayOptions),
  }));
  const startPoint = draftPoints[0];
  const endPoint = draftPoints[draftPoints.length - 1];

  return (
    <div className="grid gap-3 md:grid-cols-[1.35fr_1fr]">
      <div className="overflow-hidden rounded-xl border border-border/55 bg-background/60">
        <svg
          viewBox="0 0 100 100"
          role="img"
          aria-label="Proposed segment map preview"
          className="h-44 w-full"
        >
          <rect width="100" height="100" fill="currentColor" className="text-secondary/35" />
          {contextPath ? (
            <polyline
              points={contextPath}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary/25"
            />
          ) : null}
          {showSpeedGradient && draftSegments.length ? (
            draftSegments.map((segment) => (
              <line
                key={segment.key}
                x1={segment.from.x}
                y1={segment.from.y}
                x2={segment.to.x}
                y2={segment.to.y}
                stroke={segment.color}
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))
          ) : draftPath ? (
            <polyline
              points={draftPath}
              fill="none"
              stroke="currentColor"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            />
          ) : null}
          {startPoint ? (
            <MapDot point={startPoint} minX={minX} minY={minY} width={width} height={height} />
          ) : null}
          {endPoint ? (
            <MapDot point={endPoint} minX={minX} minY={minY} width={width} height={height} end />
          ) : null}
        </svg>
      </div>
      <div className="rounded-xl bg-secondary/30 p-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Proposed segment
        </div>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          <div>Start {formatPointTime(startPoint)}</div>
          <div>End {formatPointTime(endPoint)}</div>
          <div>{draftPoints.length} points selected</div>
        </div>
      </div>
    </div>
  );
}

function getSvgPoint(
  point: SessionPoint,
  minX: number,
  minY: number,
  width: number,
  height: number,
) {
  return {
    x: 8 + ((point.x_m - minX) / width) * 84,
    y: 92 - ((point.y_m - minY) / height) * 84,
  };
}

function MapDot({
  point,
  minX,
  minY,
  width,
  height,
  end,
}: {
  point: SessionPoint;
  minX: number;
  minY: number;
  width: number;
  height: number;
  end?: boolean;
}) {
  const cx = 8 + ((point.x_m - minX) / width) * 84;
  const cy = 92 - ((point.y_m - minY) / height) * 84;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={end ? 2.7 : 2.2}
      fill="currentColor"
      stroke="white"
      strokeWidth="1.4"
      className={end ? "text-primary" : "text-background"}
    />
  );
}

function miniMapSpeedColor(speedMps: number, displayOptions: MapDisplayOptions) {
  const t = Math.max(0, Math.min(1, speedMps / 7));
  const stops = getMapSpeedGradientStops(displayOptions);

  if (stops.length < 2) return stops[0] ?? MAP_LINE_COLORS[displayOptions.lineColor];

  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  return mixHex(stops[index], stops[index + 1], scaled - index);
}

function mixHex(from: string, to: string, amount: number) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = Math.max(0, Math.min(1, amount));
  const mixed = a.map((channel, index) => Math.round(channel + (b[index] - channel) * t));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16));
}

function OptionSelect({
  label,
  value,
  items,
  onValueChange,
}: {
  label: string;
  value: string;
  items: Array<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-8 rounded-lg border-border/70 bg-secondary/35 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function IconButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-secondary/60 hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}

function ExplanationTag({ children }: { children: string }) {
  return (
    <span className="rounded border border-border/60 bg-background/45 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function getSegmentExplanationTags(segment: SessionSegment, manualSegmentIds: Set<number>) {
  if (manualSegmentIds.has(segment.segment_id) || isManualSegment(segment)) return ["Manual"];

  return ["Auto-detected"];
}

function isManualSegment(segment: SessionSegment) {
  return /\bmanual\b/i.test(segment.label) || /\b[A-B]\b/.test(segment.label);
}

function getEditContext({
  mode,
  playheadIdx,
  selectedSegment,
  segments,
  totalPoints,
}: {
  mode: "add" | "edit" | null;
  playheadIdx: number;
  selectedSegment: SessionSegment | null;
  segments: SessionSegment[];
  totalPoints: number;
}) {
  if (totalPoints <= 1) return { startIdx: 0, endIdx: 0 };

  if (mode === "add" && segments.length === 0) {
    return { startIdx: 0, endIdx: totalPoints - 1 };
  }

  if (mode === "edit" && selectedSegment) {
    const ordered = [...segments].sort((a, b) => a.start_idx - b.start_idx);
    const index = ordered.findIndex((segment) => segment.segment_id === selectedSegment.segment_id);
    const previous = index > 0 ? ordered[index - 1] : null;
    const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;

    return {
      startIdx: Math.max(0, previous ? previous.end_idx - 8 : selectedSegment.start_idx - 24),
      endIdx: Math.min(totalPoints - 1, next ? next.start_idx + 8 : selectedSegment.end_idx + 24),
    };
  }

  const previous = [...segments]
    .filter((segment) => segment.end_idx < playheadIdx)
    .sort((a, b) => b.end_idx - a.end_idx)[0];
  const next = [...segments]
    .filter((segment) => segment.start_idx > playheadIdx)
    .sort((a, b) => a.start_idx - b.start_idx)[0];

  return {
    startIdx: Math.max(0, previous ? previous.end_idx : 0),
    endIdx: Math.min(totalPoints - 1, next ? next.start_idx : totalPoints - 1),
  };
}

function clampIndex(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function formatPointTime(point?: SessionPoint) {
  if (!point) return "--:--";

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(point.t));
}
