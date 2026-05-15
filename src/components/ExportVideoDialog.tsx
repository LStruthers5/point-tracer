import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { UnitSystem } from "@/types/app-settings";
import type { MapBasemapStyle, MapDisplayOptions } from "@/types/map-display";
import {
  getMapSpeedGradientStops,
  MAP_LINE_COLORS,
} from "@/types/map-display";
import type { FieldMapElement, MapElement, PinMapElement } from "@/types/map-elements";
import type { SessionData, SessionPoint, SessionSegment } from "@/types/session";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDuration, formatSpeed } from "@/lib/format";

const EXPORT_WIDTH = 720;
const EXPORT_HEIGHT = 1280;
const EXPORT_FPS = 30;
const EXPORT_BASE_TICK_MS = 80;
const EXPORT_INTRO_SECONDS = 2;
const TILE_SIZE = 512;
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY as string | undefined;
const EXPORT_SPEEDS = [0.5, 1, 1.5, 2];
const EXPORT_CORE_CELL_METERS = 24;
const EXPORT_MIME_CANDIDATES = [
  { mimeType: "video/mp4;codecs=avc1.42E01E", extension: "mp4", label: "MP4" },
  { mimeType: "video/mp4", extension: "mp4", label: "MP4" },
  { mimeType: "video/webm;codecs=vp9", extension: "webm", label: "WebM" },
  { mimeType: "video/webm", extension: "webm", label: "WebM" },
] as const;

const BASEMAP_URLS: Record<MapBasemapStyle, string> = {
  street: `https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${MAPTILER_KEY ?? ""}`,
  satellite: `https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY ?? ""}`,
  dark: `https://api.maptiler.com/maps/dataviz-v4-dark/{z}/{x}/{y}.png?key=${MAPTILER_KEY ?? ""}`,
};

interface ExportVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: SessionData;
  displayOptions: MapDisplayOptions;
  basemapStyle: MapBasemapStyle;
  units: UnitSystem;
  selectedSegment: SessionSegment | null;
  mapElements: MapElement[];
  exportMode?: "session" | "segment";
}

interface ExportTimeline {
  pointIndices: number[];
  range: {
    startIdx: number;
    endIdx: number;
  };
  segments: SessionSegment[];
}

interface ExportViewport {
  zoom: number;
  center: PointXY;
  points: PointXY[];
}

interface PointXY {
  x: number;
  y: number;
}

interface ExportBbox {
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
}

type ExportEncoding = (typeof EXPORT_MIME_CANDIDATES)[number];

export function ExportVideoDialog({
  open,
  onOpenChange,
  data,
  displayOptions,
  basemapStyle,
  units,
  selectedSegment,
  mapElements,
  exportMode = "session",
}: ExportVideoDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tileCacheRef = useRef(new Map<string, Promise<HTMLImageElement | null>>());
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [prepStatus, setPrepStatus] = useState("Preparing export scene…");
  const [exportSpeed, setExportSpeed] = useState(1);
  const [exportBasemapStyle, setExportBasemapStyle] = useState<MapBasemapStyle>(basemapStyle);
  const [showMapElements, setShowMapElements] = useState(true);
  const [segmentsOnly, setSegmentsOnly] = useState(false);
  const [includedSegmentIds, setIncludedSegmentIds] = useState<Set<number>>(
    () => new Set(data.segments.map((segment) => segment.segment_id)),
  );
  const exportTimeline = useMemo(
    () => buildExportTimeline(data, selectedSegment, exportMode, segmentsOnly, includedSegmentIds),
    [data, exportMode, includedSegmentIds, segmentsOnly, selectedSegment],
  );
  const exportRenderPoints = useMemo(
    () => exportTimeline.pointIndices.map((index) => data.points[index]).filter(Boolean),
    [data.points, exportTimeline],
  );
  const exportViewport = useMemo(
    () => buildViewport(exportRenderPoints),
    [exportRenderPoints],
  );
  const canExport = exportTimeline.pointIndices.length > 1 && (!segmentsOnly || includedSegmentIds.size > 0);
  const exportEncoding = getPreferredExportEncoding();
  const exportDurationSeconds = getExportDurationSeconds(exportTimeline, exportSpeed);

  useEffect(() => {
    if (!open) {
      setExportBasemapStyle(basemapStyle);
      return;
    }
    setExportBasemapStyle(basemapStyle);
  }, [basemapStyle, open]);

  useEffect(() => {
    if (!open) {
      setIncludedSegmentIds(new Set(data.segments.map((segment) => segment.segment_id)));
      return;
    }
    setIncludedSegmentIds(new Set(data.segments.map((segment) => segment.segment_id)));
  }, [data.segments, open]);

  useEffect(() => {
    let cancelled = false;
    const prepare = async () => {
      setPrepStatus("Preparing export scene…");
      if (MAPTILER_KEY) {
        await preloadBasemapTiles(exportViewport, exportBasemapStyle, tileCacheRef.current);
      }
      if (!cancelled) {
        setPrepStatus(
          `Ready: ${exportTimeline.pointIndices.length.toLocaleString()} replay points, ${exportTimeline.segments.length} segments.`,
        );
      }
    };

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [exportBasemapStyle, exportTimeline, exportViewport]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    void drawExportFrame({
      context,
      data,
      displayOptions,
      basemapStyle: exportBasemapStyle,
      units,
      timeline: exportTimeline,
      framePointIdx: exportTimeline.pointIndices[0] ?? exportTimeline.range.startIdx,
      introFrame: true,
      viewport: exportViewport,
      tileCache: tileCacheRef.current,
      mapElements,
      showMapElements,
    });
  }, [data, displayOptions, exportBasemapStyle, exportTimeline, mapElements, open, showMapElements, units]);

  const startExport = async () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    if (!("MediaRecorder" in window) || !("captureStream" in canvas)) {
      setStatus("Video export is not supported in this browser yet.");
      return;
    }
    if (!exportEncoding) {
      setStatus("This browser cannot encode MP4 or WebM from the export canvas.");
      return;
    }

    setRecording(true);
    setProgress(0);
    setStatus(`Preparing ${exportEncoding.label} replay…`);

    const stream = canvas.captureStream(EXPORT_FPS);
    const recorder = new MediaRecorder(stream, { mimeType: exportEncoding.mimeType });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start();
    setStatus("Rendering export frames…");

    const frameCount = Math.max(1, Math.ceil(exportDurationSeconds * EXPORT_FPS));
    for (let frame = 0; frame < frameCount; frame += 1) {
      const elapsedSeconds = frame / EXPORT_FPS;
      const framePointIdx = getExportFramePointIdx(exportTimeline, elapsedSeconds, exportSpeed);
      const introFrame = elapsedSeconds < EXPORT_INTRO_SECONDS;

      await drawExportFrame({
        context,
        data,
        displayOptions,
        basemapStyle: exportBasemapStyle,
        units,
        timeline: exportTimeline,
        framePointIdx,
        introFrame,
        viewport: exportViewport,
        tileCache: tileCacheRef.current,
        mapElements,
        showMapElements,
      });
      setProgress(Math.round((frame / Math.max(1, frameCount - 1)) * 100));
      await wait(1000 / EXPORT_FPS);
    }

    recorder.stop();
    await stopped;

    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: exportEncoding.mimeType });
    downloadBlob(
      blob,
      `pointtracer-${slugify(data.activity_name)}-${segmentsOnly ? "segments" : exportMode}.${exportEncoding.extension}`,
    );
    setProgress(100);
    setStatus(
      exportEncoding.extension === "mp4"
        ? "Export complete as MP4."
        : "Export complete as WebM. MP4 export is the target, but this browser did not expose MP4 recording.",
    );
    setRecording(false);
  };

  return (
    <Dialog open={open} onOpenChange={recording ? undefined : onOpenChange}>
      <DialogContent className="z-[3000] max-w-5xl gap-4">
        <DialogHeader>
          <DialogTitle>Export vertical replay</DialogTitle>
          <DialogDescription>
            Creates a clean 9:16 PointTracer replay from the current map and trace settings.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[minmax(0,360px)_minmax(360px,1fr)]">
          <div className="mx-auto overflow-hidden rounded-[28px] border border-border/70 bg-black p-2 shadow-2xl">
            <canvas
              ref={canvasRef}
              width={EXPORT_WIDTH}
              height={EXPORT_HEIGHT}
              className="aspect-[9/16] w-[270px] rounded-[22px] bg-black"
            />
          </div>

          <div className="flex max-h-[72vh] flex-col justify-between gap-4 overflow-y-auto rounded-2xl border border-border/60 bg-card/70 p-4">
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Format
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  Vertical 9:16 {exportEncoding?.extension === "mp4" ? "MP4" : "MP4 target"}
                </div>
                {exportEncoding?.extension !== "mp4" ? (
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                    Your browser does not currently expose MP4 canvas recording, so this export will fall
                    back to WebM until MP4 encoding is available.
                  </p>
                ) : null}
              </div>
              {!MAPTILER_KEY ? (
                <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-200">
                  Set <span className="font-mono">VITE_MAPTILER_API_KEY</span> for MapTiler basemap
                  tiles in exports. The replay still renders the activity overlay without it.
                </p>
              ) : null}
              <p className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-2 text-xs leading-relaxed text-amber-200">
                Most fitness apps cap uploaded videos at about 30 seconds. Estimated export length:{" "}
                <span className="font-semibold">{formatDuration(exportDurationSeconds)}</span>.
              </p>
              <p className="rounded-lg border border-border/55 bg-background/45 p-2 text-[10px] leading-relaxed text-muted-foreground">
                {prepStatus}
              </p>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Map type
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {(["street", "satellite", "dark"] as MapBasemapStyle[]).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setExportBasemapStyle(style)}
                      disabled={recording}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize transition ${
                        exportBasemapStyle === style
                          ? "border-primary/70 bg-primary/16 text-primary"
                          : "border-border/60 bg-background/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Export speed
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {EXPORT_SPEEDS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => setExportSpeed(speed)}
                      disabled={recording}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                        exportSpeed === speed
                          ? "border-primary/70 bg-primary/16 text-primary"
                          : "border-border/60 bg-background/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                  Uses the same point-step timing as live playback, scaled for export.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setShowMapElements((current) => !current)}
                  disabled={recording}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    showMapElements
                      ? "border-primary/60 bg-primary/12 text-foreground"
                      : "border-border/60 bg-background/50 text-muted-foreground"
                  }`}
                >
                  <div className="text-xs font-semibold">Map elements</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {showMapElements ? "Shown in export" : "Hidden from export"}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setSegmentsOnly((current) => !current)}
                  disabled={recording}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    segmentsOnly
                      ? "border-primary/60 bg-primary/12 text-foreground"
                      : "border-border/60 bg-background/50 text-muted-foreground"
                  }`}
                >
                  <div className="text-xs font-semibold">Export segments only</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {segmentsOnly ? "Skips non-segment gaps" : "Includes full timeline"}
                  </div>
                </button>
              </div>

              {segmentsOnly ? (
                <div className="rounded-xl border border-border/60 bg-background/45 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Included segments
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setIncludedSegmentIds(new Set(data.segments.map((segment) => segment.segment_id)))
                      }
                      disabled={recording}
                      className="text-[10px] font-semibold text-primary"
                    >
                      Select all
                    </button>
                  </div>
                  <div className="grid max-h-36 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                    {data.segments.map((segment, index) => {
                      const selected = includedSegmentIds.has(segment.segment_id);
                      return (
                        <button
                          key={segment.segment_id}
                          type="button"
                          onClick={() => {
                            setIncludedSegmentIds((current) => {
                              const next = new Set(current);
                              if (next.has(segment.segment_id)) next.delete(segment.segment_id);
                              else next.add(segment.segment_id);
                              return next;
                            });
                          }}
                          disabled={recording}
                          className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                            selected
                              ? "border-primary/60 bg-primary/12 text-foreground"
                              : "border-border/55 bg-background/40 text-muted-foreground"
                          }`}
                        >
                          <span className="font-semibold">{segment.label || `Segment ${index + 1}`}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              {status ? (
                <div className="text-xs text-muted-foreground">
                  {status} {recording ? `${progress}%` : null}
                </div>
              ) : null}
              <Button type="button" onClick={startExport} disabled={recording || !canExport} className="w-full gap-2">
                {recording ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {recording ? "Exporting…" : "Export video"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

async function drawExportFrame({
  context,
  data,
  displayOptions,
  basemapStyle,
  units,
  timeline,
  framePointIdx,
  introFrame,
  viewport,
  tileCache,
  mapElements,
  showMapElements,
}: {
  context: CanvasRenderingContext2D;
  data: SessionData;
  displayOptions: MapDisplayOptions;
  basemapStyle: MapBasemapStyle;
  units: UnitSystem;
  timeline: ExportTimeline;
  framePointIdx: number;
  introFrame: boolean;
  viewport: ExportViewport;
  tileCache: Map<string, Promise<HTMLImageElement | null>>;
  mapElements: MapElement[];
  showMapElements: boolean;
}) {
  const currentPoint = data.points[framePointIdx] ?? data.points[timeline.range.startIdx];
  const activeSegment = timeline.segments.find(
    (segment) => framePointIdx >= segment.start_idx && framePointIdx <= segment.end_idx,
  );

  drawBaseBackground(context, basemapStyle);
  await drawBasemapTiles(context, viewport, basemapStyle, tileCache);
  drawMapShade(context);
  drawTrace(context, data.points, timeline, framePointIdx, viewport, displayOptions, {
    activeSegment,
    introFrame,
  });
  if (showMapElements) drawMapElements(context, mapElements, viewport);
  drawPlayerMarker(context, currentPoint, viewport, MAP_LINE_COLORS[displayOptions.lineColor]);
  drawExportChrome(context, {
    data,
    currentPoint,
    timeline,
    activeSegment,
    framePointIdx,
    units,
  });
}

function buildViewport(points: SessionPoint[]): ExportViewport {
  const safePoints = points.length > 0 ? points : [];
  const coreBbox = getCoreActivityBbox(safePoints) ?? getRawBbox(safePoints);
  const framingPoints =
    coreBbox && safePoints.length >= 12
      ? safePoints.filter((point) => pointInBbox(point, coreBbox))
      : safePoints;
  const projectedAtZoom = framingPoints.map((point) => projectLatLon(point.lat, point.lon, 18));
  const bounds = getProjectedBounds(projectedAtZoom);
  const fitWidth = EXPORT_WIDTH * 0.9;
  const fitHeight = EXPORT_HEIGHT * 0.8;
  const scale = Math.min(
    fitWidth / Math.max(1, bounds.maxX - bounds.minX),
    fitHeight / Math.max(1, bounds.maxY - bounds.minY),
  );
  const zoom = Math.max(3, Math.min(20, 18 + Math.floor(Math.log2(scale))));
  const scaleToZoom = 2 ** (zoom - 18);
  const pointsAtZoom = projectedAtZoom.map((point) => ({
    x: point.x * scaleToZoom,
    y: point.y * scaleToZoom,
  }));
  const nextBounds = getProjectedBounds(pointsAtZoom);

  return {
    zoom,
    center: {
      x: (nextBounds.minX + nextBounds.maxX) / 2,
      y: (nextBounds.minY + nextBounds.maxY) / 2,
    },
    points: pointsAtZoom,
  };
}

async function drawBasemapTiles(
  context: CanvasRenderingContext2D,
  viewport: ExportViewport,
  basemapStyle: MapBasemapStyle,
  tileCache: Map<string, Promise<HTMLImageElement | null>>,
) {
  if (!MAPTILER_KEY) return;

  const { topLeft, minTileX, maxTileX, minTileY, maxTileY } = getBasemapTileBounds(viewport);

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      const image = await loadTile(basemapStyle, viewport.zoom, tileX, tileY, tileCache);
      if (!image) continue;
      context.drawImage(
        image,
        tileX * TILE_SIZE - topLeft.x,
        tileY * TILE_SIZE - topLeft.y,
        TILE_SIZE,
        TILE_SIZE,
      );
    }
  }
}

async function preloadBasemapTiles(
  viewport: ExportViewport,
  basemapStyle: MapBasemapStyle,
  tileCache: Map<string, Promise<HTMLImageElement | null>>,
) {
  if (!MAPTILER_KEY) return;
  const { minTileX, maxTileX, minTileY, maxTileY } = getBasemapTileBounds(viewport);
  const loads: Promise<HTMLImageElement | null>[] = [];

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      loads.push(loadTile(basemapStyle, viewport.zoom, tileX, tileY, tileCache));
    }
  }

  await Promise.all(loads);
}

function getBasemapTileBounds(viewport: ExportViewport) {
  const topLeft = {
    x: viewport.center.x - EXPORT_WIDTH / 2,
    y: viewport.center.y - EXPORT_HEIGHT / 2,
  };

  return {
    topLeft,
    minTileX: Math.floor(topLeft.x / TILE_SIZE) - 1,
    maxTileX: Math.floor((topLeft.x + EXPORT_WIDTH) / TILE_SIZE) + 1,
    minTileY: Math.floor(topLeft.y / TILE_SIZE) - 1,
    maxTileY: Math.floor((topLeft.y + EXPORT_HEIGHT) / TILE_SIZE) + 1,
  };
}

function drawTrace(
  context: CanvasRenderingContext2D,
  points: SessionPoint[],
  timeline: ExportTimeline,
  framePointIdx: number,
  viewport: ExportViewport,
  displayOptions: MapDisplayOptions,
  playbackContext: {
    activeSegment: SessionSegment | undefined;
    introFrame: boolean;
  },
) {
  if (playbackContext.introFrame) {
    drawExportStreakStartPreview(context, points, timeline.segments, timeline.range, viewport, displayOptions);
    return;
  }

  if (displayOptions.traceMode === "none") return;

  if (displayOptions.traceMode === "heatmap") {
    drawExportHeatmap(
      context,
      timeline.pointIndices.map((index) => points[index]).filter(Boolean),
      viewport,
      displayOptions,
    );
    return;
  }

  const timelinePosition = Math.max(0, timeline.pointIndices.indexOf(framePointIdx));
  const trailLength =
    displayOptions.traceMode === "streak"
      ? getExportStreakPointLength(timeline, framePointIdx, playbackContext.activeSegment)
      : timeline.pointIndices.length;
  const trailStartIdx =
    displayOptions.traceMode === "streak" && playbackContext.activeSegment
      ? playbackContext.activeSegment.start_idx
      : timeline.range.startIdx;
  const trailIndices =
    displayOptions.traceMode === "streak"
      ? timeline.pointIndices.slice(Math.max(0, timelinePosition - trailLength + 1), timelinePosition + 1)
          .filter((index) => index >= trailStartIdx)
      : timeline.pointIndices.slice(0, timelinePosition + 1);
  const basePoints = timeline.pointIndices.map((index) => points[index]).filter(Boolean);
  const trailPoints = trailIndices.map((index) => points[index]).filter(Boolean);

  if (displayOptions.traceMode === "streak" && playbackContext.activeSegment) {
    const contextPoints = points.slice(
      playbackContext.activeSegment.start_idx,
      playbackContext.activeSegment.end_idx + 1,
    );
    drawPath(context, contextPoints, viewport, {
      color: MAP_LINE_COLORS[displayOptions.lineColor],
      width: 6,
      alpha: 0.24,
      speedGradient: displayOptions.colorMode === "speed",
      displayOptions,
    });
  }

  if (displayOptions.traceMode === "full") {
    drawPath(context, basePoints, viewport, {
      color: MAP_LINE_COLORS[displayOptions.lineColor],
      width: 5,
      alpha: 0.22,
      speedGradient: false,
      displayOptions,
    });
  }

  drawPath(context, trailPoints, viewport, {
    color: MAP_LINE_COLORS[displayOptions.lineColor],
    width: 10,
    alpha: 0.96,
    speedGradient: displayOptions.colorMode === "speed",
    displayOptions,
  });
}

function drawMapElements(
  context: CanvasRenderingContext2D,
  elements: MapElement[],
  viewport: ExportViewport,
) {
  if (!elements.length) return;

  for (const element of elements) {
    if (element.type === "field") {
      drawExportFieldElement(context, element, viewport);
    } else {
      drawExportPinElement(context, element, viewport);
    }
  }
}

function drawExportFieldElement(
  context: CanvasRenderingContext2D,
  element: FieldMapElement,
  viewport: ExportViewport,
) {
  const corners = getFieldElementScreenCorners(element, viewport);

  context.save();
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  corners.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
  context.fillStyle = "rgba(255,255,255,0.08)";
  context.fill();
  context.shadowColor = "rgba(0,0,0,0.35)";
  context.shadowBlur = 12;
  context.strokeStyle = "rgba(255,255,255,0.9)";
  context.lineWidth = 5;
  context.stroke();
  context.shadowBlur = 0;

  context.restore();
}

function getFieldElementScreenCorners(element: FieldMapElement, viewport: ExportViewport) {
  return getFieldElementCornerLatLngs(element).map((corner) =>
    pointToScreen(projectLatLon(corner.lat, corner.lon, viewport.zoom), viewport),
  );
}

function getFieldElementCornerLatLngs(element: FieldMapElement) {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = Math.max(
    1,
    Math.cos((element.center.lat * Math.PI) / 180) * metersPerDegreeLat,
  );
  const halfWidth = element.widthM / 2;
  const halfHeight = element.heightM / 2;

  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map((corner) => {
    const rotated = rotatePoint(corner.x, corner.y, 0, 0, element.rotationDeg);
    return {
      lat: element.center.lat - rotated.y / metersPerDegreeLat,
      lon: element.center.lon + rotated.x / metersPerDegreeLon,
    };
  });
}

function drawExportPinElement(
  context: CanvasRenderingContext2D,
  element: PinMapElement,
  viewport: ExportViewport,
) {
  const point = pointToScreen(projectLatLon(element.position.lat, element.position.lon, viewport.zoom), viewport);
  const fill = element.type === "bench" ? "#1d4ed8" : "#dc2626";

  context.save();
  context.shadowColor = "rgba(0,0,0,0.36)";
  context.shadowBlur = 14;
  context.fillStyle = "rgba(255,255,255,0.94)";
  context.beginPath();
  context.arc(point.x, point.y, 16, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.fillStyle = fill;
  context.beginPath();
  context.arc(point.x, point.y, 9, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = withAlpha(fill, 0.55);
  context.lineWidth = 4;
  context.beginPath();
  context.arc(point.x, point.y, 24, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawPath(
  context: CanvasRenderingContext2D,
  points: SessionPoint[],
  viewport: ExportViewport,
  options: {
    color: string;
    width: number;
    alpha: number;
    speedGradient: boolean;
    displayOptions: MapDisplayOptions;
  },
) {
  if (points.length < 2) return;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = options.width;
  context.globalAlpha = options.alpha;

  if (!options.speedGradient) {
    context.strokeStyle = options.color;
    context.beginPath();
    points.forEach((point, index) => {
      const screen = pointToScreen(projectLatLon(point.lat, point.lon, viewport.zoom), viewport);
      if (index === 0) context.moveTo(screen.x, screen.y);
      else context.lineTo(screen.x, screen.y);
    });
    context.stroke();
    context.restore();
    return;
  }

  const maxSpeed = Math.max(0.1, ...points.map(getPointSpeed));
  const stops = getMapSpeedGradientStops(options.displayOptions);
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const from = pointToScreen(projectLatLon(previous.lat, previous.lon, viewport.zoom), viewport);
    const to = pointToScreen(projectLatLon(point.lat, point.lon, viewport.zoom), viewport);
    context.strokeStyle = pickGradientColor(stops, getPointSpeed(point) / maxSpeed);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  context.restore();
}

function drawExportHeatmap(
  context: CanvasRenderingContext2D,
  points: SessionPoint[],
  viewport: ExportViewport,
  displayOptions: MapDisplayOptions,
) {
  if (points.length === 0) return;
  const color = MAP_LINE_COLORS[displayOptions.lineColor];
  const maxSpeed = Math.max(0.1, ...points.map(getPointSpeed));
  const speedStops = getMapSpeedGradientStops(displayOptions);

  context.save();
  context.globalCompositeOperation = "source-over";
  points.forEach((point) => {
    const screen = pointToScreen(projectLatLon(point.lat, point.lon, viewport.zoom), viewport);
    const heatColor =
      displayOptions.heatmapMode === "speed"
        ? pickGradientColor(speedStops, getPointSpeed(point) / maxSpeed)
        : color;
    const gradient = context.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, 52);
    gradient.addColorStop(0, withAlpha(heatColor, 0.36));
    gradient.addColorStop(0.6, withAlpha(heatColor, 0.2));
    gradient.addColorStop(1, withAlpha(heatColor, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(screen.x, screen.y, 52, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

function drawExportStreakStartPreview(
  context: CanvasRenderingContext2D,
  points: SessionPoint[],
  segments: SessionSegment[],
  range: { startIdx: number; endIdx: number },
  viewport: ExportViewport,
  displayOptions: MapDisplayOptions,
) {
  const visibleSegments = segments.filter(
    (segment) => segment.end_idx >= range.startIdx && segment.start_idx <= range.endIdx,
  );
  const lineColor = MAP_LINE_COLORS[displayOptions.lineColor];

  context.save();
  for (const segment of visibleSegments) {
    const previewPoints = getExportSegmentStartPreviewPoints(points, segment);
    if (previewPoints.length < 2) continue;

    for (let index = 1; index < previewPoints.length; index += 1) {
      const previous = previewPoints[index - 1];
      const point = previewPoints[index];
      const elapsedS = getElapsedSeconds(previewPoints[0], point);
      const fadeProgress = Math.max(0, (elapsedS - 8) / 30);
      const progress = Math.min(1, fadeProgress);
      const from = pointToScreen(projectLatLon(previous.lat, previous.lon, viewport.zoom), viewport);
      const to = pointToScreen(projectLatLon(point.lat, point.lon, viewport.zoom), viewport);

      context.strokeStyle = mixColor(lineColor, "#ffffff", progress * 0.82);
      context.globalAlpha = Math.max(0.7, 0.98 - progress * 0.22);
      context.lineWidth = Math.max(4, 11 - progress * 4);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }

    const startPoint = points[segment.start_idx];
    if (startPoint) {
      const screen = pointToScreen(projectLatLon(startPoint.lat, startPoint.lon, viewport.zoom), viewport);
      context.globalAlpha = 1;
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(screen.x, screen.y, 12, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = lineColor;
      context.beginPath();
      context.arc(screen.x, screen.y, 7, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function getExportSegmentStartPreviewPoints(points: SessionPoint[], segment: SessionSegment) {
  const startPoint = points[segment.start_idx];
  if (!startPoint) return [];

  const preview = [startPoint];
  const startTime = new Date(startPoint.t).getTime();
  let distanceM = 0;

  for (let index = segment.start_idx + 1; index <= segment.end_idx && preview.length < 44; index += 1) {
    const point = points[index];
    const previous = points[index - 1];
    if (!point || !previous) break;

    const elapsedS = (new Date(point.t).getTime() - startTime) / 1000;
    distanceM += Math.hypot(point.x_m - previous.x_m, point.y_m - previous.y_m);
    if (elapsedS > 38 || distanceM > 70) break;
    preview.push(point);
  }

  return preview;
}

function drawPlayerMarker(
  context: CanvasRenderingContext2D,
  point: SessionPoint | undefined,
  viewport: ExportViewport,
  color: string,
) {
  if (!point) return;
  const screen = pointToScreen(projectLatLon(point.lat, point.lon, viewport.zoom), viewport);
  context.save();
  context.shadowColor = "rgba(0,0,0,0.45)";
  context.shadowBlur = 22;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(screen.x, screen.y, 24, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.fillStyle = color;
  context.beginPath();
  context.arc(screen.x, screen.y, 14, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = withAlpha(color, 0.45);
  context.lineWidth = 5;
  context.beginPath();
  context.arc(screen.x, screen.y, 34, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawExportChrome(
  context: CanvasRenderingContext2D,
  {
    data,
    currentPoint,
    timeline,
    activeSegment,
    framePointIdx,
    units,
  }: {
    data: SessionData;
    currentPoint: SessionPoint | undefined;
    timeline: ExportTimeline;
    activeSegment: SessionSegment | undefined;
    framePointIdx: number;
    units: UnitSystem;
  },
) {
  const start = data.points[timeline.pointIndices[0] ?? timeline.range.startIdx];
  const elapsedS =
    currentPoint && start
      ? Math.max(0, (new Date(currentPoint.t).getTime() - new Date(start.t).getTime()) / 1000)
      : 0;
  const speed = currentPoint ? getPointSpeed(currentPoint) : 0;
  const segmentLabel = activeSegment?.label || "Session replay";
  const timelinePosition = Math.max(0, timeline.pointIndices.indexOf(framePointIdx));

  context.save();
  drawPill(context, EXPORT_WIDTH - 236, 34, 190, 58, "PointTracer", "rgba(2,6,23,0.78)", "#ffffff", "right");
  drawSegmentBadge(context, 42, 42, segmentLabel, activeSegment);
  drawMetricCard(context, 42, EXPORT_HEIGHT - 184, "Speed", formatSpeed(speed, units));
  drawMetricCard(context, EXPORT_WIDTH - 292, EXPORT_HEIGHT - 184, "Elapsed", formatDuration(elapsedS));

  context.fillStyle = "rgba(255,255,255,0.72)";
  context.fillRect(42, EXPORT_HEIGHT - 76, EXPORT_WIDTH - 84, 8);
  context.fillStyle = "#58bf79";
  context.fillRect(
    42,
    EXPORT_HEIGHT - 76,
    (EXPORT_WIDTH - 84) * (timelinePosition / Math.max(1, timeline.pointIndices.length - 1)),
    8,
  );
  context.restore();
}

function drawSegmentBadge(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  activeSegment: SessionSegment | undefined,
) {
  roundedRect(context, x, y, 330, 92, 30);
  context.fillStyle = activeSegment ? "rgba(2,6,23,0.84)" : "rgba(2,6,23,0.72)";
  context.fill();
  context.strokeStyle = activeSegment ? "rgba(88,191,121,0.55)" : "rgba(255,255,255,0.16)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = activeSegment ? "#58bf79" : "rgba(226,232,240,0.68)";
  context.beginPath();
  context.arc(x + 30, y + 28, 7, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(226,232,240,0.72)";
  context.font = "700 18px Inter, system-ui, sans-serif";
  context.fillText(activeSegment ? "NOW PLAYING" : "EXPORT REPLAY", x + 48, y + 35);
  context.fillStyle = "#ffffff";
  context.font = "900 32px Inter, system-ui, sans-serif";
  context.fillText(trimCanvasLabel(context, label, 260), x + 30, y + 72);
}

function drawMetricCard(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  value: string,
) {
  roundedRect(context, x, y, 250, 104, 28);
  context.fillStyle = "rgba(2,6,23,0.78)";
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.16)";
  context.stroke();
  context.fillStyle = "rgba(226,232,240,0.78)";
  context.font = "600 22px Inter, system-ui, sans-serif";
  context.fillText(label.toUpperCase(), x + 28, y + 36);
  context.fillStyle = "#ffffff";
  context.font = "800 38px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText(value, x + 28, y + 78);
}

function drawPill(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  background: string,
  color: string,
  align: "left" | "right",
) {
  roundedRect(context, x, y, width, height, height / 2);
  context.fillStyle = background;
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.16)";
  context.stroke();
  context.fillStyle = color;
  context.font = "800 24px Inter, system-ui, sans-serif";
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillText(label, align === "right" ? x + width - 24 : x + 24, y + height / 2);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
}

function drawBaseBackground(context: CanvasRenderingContext2D, style: MapBasemapStyle) {
  const gradient = context.createLinearGradient(0, 0, 0, EXPORT_HEIGHT);
  if (style === "satellite") {
    gradient.addColorStop(0, "#1e3a2c");
    gradient.addColorStop(1, "#0f1f18");
  } else if (style === "street") {
    gradient.addColorStop(0, "#e9f1f7");
    gradient.addColorStop(1, "#d8e3ec");
  } else {
    gradient.addColorStop(0, "#020617");
    gradient.addColorStop(1, "#111827");
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
}

function drawMapShade(context: CanvasRenderingContext2D) {
  const gradient = context.createLinearGradient(0, 0, 0, EXPORT_HEIGHT);
  gradient.addColorStop(0, "rgba(2,6,23,0.18)");
  gradient.addColorStop(0.5, "rgba(2,6,23,0.02)");
  gradient.addColorStop(1, "rgba(2,6,23,0.34)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function buildExportTimeline(
  data: SessionData,
  selectedSegment: SessionSegment | null,
  exportMode: "session" | "segment",
  segmentsOnly: boolean,
  includedSegmentIds: Set<number>,
): ExportTimeline {
  if (segmentsOnly) {
    return buildTimelineFromSegments(
      data,
      data.segments.filter((segment) => includedSegmentIds.has(segment.segment_id)),
      { startIdx: 0, endIdx: Math.max(0, data.points.length - 1) },
    );
  }

  if (exportMode === "segment" && selectedSegment) {
    return buildTimelineFromSegments(data, [selectedSegment], {
      startIdx: selectedSegment.start_idx,
      endIdx: selectedSegment.end_idx,
    });
  }

  const fullRange = { startIdx: 0, endIdx: Math.max(0, data.points.length - 1) };
  return {
    range: fullRange,
    pointIndices: rangeToIndices(fullRange.startIdx, fullRange.endIdx),
    segments: data.segments,
  };
}

function buildTimelineFromSegments(
  data: SessionData,
  segments: SessionSegment[],
  fallbackRange: { startIdx: number; endIdx: number },
): ExportTimeline {
  const sortedSegments = [...segments].sort((a, b) => a.start_idx - b.start_idx);
  const pointSet = new Set<number>();
  for (const segment of sortedSegments) {
    for (
      let index = Math.max(0, segment.start_idx);
      index <= Math.min(data.points.length - 1, segment.end_idx);
      index += 1
    ) {
      pointSet.add(index);
    }
  }
  const pointIndices = [...pointSet].sort((a, b) => a - b);

  if (pointIndices.length === 0) {
    return {
      range: fallbackRange,
      pointIndices: [],
      segments: [],
    };
  }

  return {
    range: {
      startIdx: pointIndices[0],
      endIdx: pointIndices[pointIndices.length - 1],
    },
    pointIndices,
    segments: sortedSegments,
  };
}

function rangeToIndices(startIdx: number, endIdx: number) {
  const indices: number[] = [];
  for (let index = startIdx; index <= endIdx; index += 1) {
    indices.push(index);
  }
  return indices;
}

function getExportDurationSeconds(timeline: ExportTimeline, speed: number) {
  const pointCount = Math.max(1, timeline.pointIndices.length);
  const playbackSeconds = ((pointCount - 1) * EXPORT_BASE_TICK_MS) / 1000 / Math.max(0.1, speed);
  return EXPORT_INTRO_SECONDS + playbackSeconds;
}

function getExportFramePointIdx(
  timeline: ExportTimeline,
  elapsedSeconds: number,
  speed: number,
) {
  if (elapsedSeconds < EXPORT_INTRO_SECONDS) return timeline.pointIndices[0] ?? timeline.range.startIdx;
  const playbackSeconds = elapsedSeconds - EXPORT_INTRO_SECONDS;
  const pointOffset = Math.round((playbackSeconds * 1000 * Math.max(0.1, speed)) / EXPORT_BASE_TICK_MS);
  const index = Math.max(0, Math.min(timeline.pointIndices.length - 1, pointOffset));
  return timeline.pointIndices[index] ?? timeline.range.startIdx;
}

function getPreferredExportEncoding(): ExportEncoding | null {
  if (typeof MediaRecorder === "undefined") return null;
  return EXPORT_MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType)) ?? null;
}

function getExportStreakPointLength(
  timeline: ExportTimeline,
  framePointIdx: number,
  activeSegment: SessionSegment | undefined,
) {
  const maxLength = 56;
  const minLength = 5;

  if (activeSegment) {
    const segmentProgress = Math.max(0, framePointIdx - activeSegment.start_idx);
    return Math.round(minLength + Math.min(1, segmentProgress / 36) * (maxLength - minLength));
  }

  const nextSegment = timeline.segments.find((segment) => segment.start_idx > framePointIdx);
  if (!nextSegment) return maxLength;
  const pointsUntilStart = Math.max(0, nextSegment.start_idx - framePointIdx);
  if (pointsUntilStart > 36) return maxLength;
  return Math.round(minLength + (pointsUntilStart / 36) * (maxLength - minLength));
}

function projectLatLon(lat: number, lon: number, zoom: number): PointXY {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function pointToScreen(point: PointXY, viewport: ExportViewport): PointXY {
  return {
    x: point.x - viewport.center.x + EXPORT_WIDTH / 2,
    y: point.y - viewport.center.y + EXPORT_HEIGHT / 2,
  };
}

function rotatePoint(x: number, y: number, centerX: number, centerY: number, rotationDeg: number) {
  const angle = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - centerX;
  const dy = y - centerY;
  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
}

function midpoint(a: PointXY, b: PointXY): PointXY {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function getProjectedBounds(points: PointXY[]) {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function getCoreActivityBbox(points: SessionPoint[]): ExportBbox | null {
  if (points.length < 12) return null;

  const origin = points[0];
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = Math.max(1, Math.cos((origin.lat * Math.PI) / 180) * metersPerDegreeLat);
  const cells = new Map<
    string,
    { gridX: number; gridY: number; count: number; points: SessionPoint[] }
  >();

  for (const point of points) {
    const gridX = Math.round(((point.lon - origin.lon) * metersPerDegreeLon) / EXPORT_CORE_CELL_METERS);
    const gridY = Math.round(((point.lat - origin.lat) * metersPerDegreeLat) / EXPORT_CORE_CELL_METERS);
    const key = `${gridX}:${gridY}`;
    const existing = cells.get(key);

    if (existing) {
      existing.count += 1;
      existing.points.push(point);
    } else {
      cells.set(key, { gridX, gridY, count: 1, points: [point] });
    }
  }

  const seed = [...cells.values()].sort((a, b) => b.count - a.count)[0];
  if (!seed) return null;

  const minCount = Math.max(2, Math.ceil(seed.count * 0.18));
  const visited = new Set<string>();
  const queue = [seed];
  const componentPoints: SessionPoint[] = [];

  while (queue.length) {
    const cell = queue.shift();
    if (!cell) continue;

    const key = `${cell.gridX}:${cell.gridY}`;
    if (visited.has(key) || cell.count < minCount) continue;

    visited.add(key);
    componentPoints.push(...cell.points);

    for (let y = -1; y <= 1; y += 1) {
      for (let x = -1; x <= 1; x += 1) {
        if (x === 0 && y === 0) continue;
        const neighbor = cells.get(`${cell.gridX + x}:${cell.gridY + y}`);
        if (neighbor && !visited.has(`${neighbor.gridX}:${neighbor.gridY}`)) {
          queue.push(neighbor);
        }
      }
    }
  }

  if (componentPoints.length < Math.max(20, points.length * 0.08)) {
    return getQuantileBbox(points);
  }

  return expandBbox(getRawBbox(componentPoints), 22);
}

function getRawBbox(points: SessionPoint[]): ExportBbox | null {
  if (points.length === 0) return null;
  return {
    min_lat: Math.min(...points.map((point) => point.lat)),
    min_lon: Math.min(...points.map((point) => point.lon)),
    max_lat: Math.max(...points.map((point) => point.lat)),
    max_lon: Math.max(...points.map((point) => point.lon)),
  };
}

function getQuantileBbox(points: SessionPoint[]): ExportBbox | null {
  if (points.length < 8) return null;

  const lats = points.map((point) => point.lat).sort((a, b) => a - b);
  const lons = points.map((point) => point.lon).sort((a, b) => a - b);

  return expandBbox(
    {
      min_lat: quantile(lats, 0.08),
      min_lon: quantile(lons, 0.08),
      max_lat: quantile(lats, 0.92),
      max_lon: quantile(lons, 0.92),
    },
    22,
  );
}

function expandBbox(bbox: ExportBbox | null, paddingMeters: number): ExportBbox | null {
  if (!bbox) return null;
  const centerLat = (bbox.min_lat + bbox.max_lat) / 2;
  const latPadding = paddingMeters / 111_320;
  const lonPadding = paddingMeters / Math.max(1, Math.cos((centerLat * Math.PI) / 180) * 111_320);

  return {
    min_lat: bbox.min_lat - latPadding,
    min_lon: bbox.min_lon - lonPadding,
    max_lat: bbox.max_lat + latPadding,
    max_lon: bbox.max_lon + lonPadding,
  };
}

function pointInBbox(point: SessionPoint, bbox: ExportBbox) {
  return point.lat >= bbox.min_lat && point.lat <= bbox.max_lat && point.lon >= bbox.min_lon && point.lon <= bbox.max_lon;
}

function quantile(values: number[], q: number) {
  if (values.length === 0) return 0;
  const pos = (values.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return values[base + 1] === undefined ? values[base] : values[base] + rest * (values[base + 1] - values[base]);
}

function getElapsedSeconds(start: SessionPoint, point: SessionPoint) {
  return (new Date(point.t).getTime() - new Date(start.t).getTime()) / 1000;
}

function loadTile(
  style: MapBasemapStyle,
  zoom: number,
  x: number,
  y: number,
  tileCache: Map<string, Promise<HTMLImageElement | null>>,
) {
  const tileCount = 2 ** zoom;
  const wrappedX = ((x % tileCount) + tileCount) % tileCount;
  if (y < 0 || y >= tileCount) return Promise.resolve(null);
  const url = BASEMAP_URLS[style]
    .replace("{z}", String(zoom))
    .replace("{x}", String(wrappedX))
    .replace("{y}", String(y));

  if (!tileCache.has(url)) {
    tileCache.set(
      url,
      new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = url;
      }),
    );
  }

  return tileCache.get(url) ?? Promise.resolve(null);
}

function pickGradientColor(stops: string[], ratio: number) {
  if (stops.length === 0) return "#58bf79";
  const clamped = Math.max(0, Math.min(1, ratio));
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const amount = scaled - index;
  return mixColor(stops[index], stops[index + 1], amount);
}

function mixColor(fromHex: string, toHex: string, amount: number) {
  const from = parseHexColor(fromHex);
  const to = parseHexColor(toHex);
  if (!from || !to) return fromHex;
  const mix = (fromValue: number, toValue: number) =>
    Math.round(fromValue + (toValue - fromValue) * Math.max(0, Math.min(1, amount)));
  return `rgb(${mix(from.r, to.r)}, ${mix(from.g, to.g)}, ${mix(from.b, to.b)})`;
}

function parseHexColor(hex: string) {
  const normalized = hex.replace("#", "");
  if (!/^[\da-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function withAlpha(hex: string, alpha: number) {
  const color = parseHexColor(hex);
  if (!color) return hex;
  return `rgba(${color.r},${color.g},${color.b},${alpha})`;
}

function trimCanvasLabel(context: CanvasRenderingContext2D, label: string, maxWidth: number) {
  if (context.measureText(label).width <= maxWidth) return label;
  let next = label;
  while (next.length > 3 && context.measureText(`${next}…`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}…`;
}

function getPointSpeed(point: SessionPoint) {
  return point.speed_smooth_mps ?? point.speed_mps ?? 0;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}
