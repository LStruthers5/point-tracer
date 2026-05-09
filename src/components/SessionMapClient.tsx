import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Pane, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { SessionPoint, SessionSegment, SegmentBbox } from "@/types/session";
import type { MapDisplayOptions, MapLineColor } from "@/types/map-display";
import {
  getMapSingleColorGradientStops,
  getMapSpeedGradientStops,
  MAP_LINE_COLORS,
} from "@/types/map-display";
import type { ThemeMode, UnitSystem } from "@/types/app-settings";
import { formatSpeed } from "@/lib/format";

const DEFAULT_ZOOM = 17;
const SESSION_FIT_MAX_ZOOM = 18;
const FOCUSED_FIT_MAX_ZOOM = 22;
const MAP_MAX_ZOOM = 22;
const TILE_NATIVE_MAX_ZOOM = 20;
const STREAK_POINTS = 48;
const HEATMAP_CELL_PX = 14;
const HEATMAP_REFERENCE_ZOOM = 18;
const HEATMAP_MIN_CELL_PX = 7;
const HEATMAP_MAX_CELL_PX = 18;
const HEATMAP_MIN_BLUR_PX = 3;
const HEATMAP_MAX_BLUR_PX = 7;
const CORE_BBOX_CELL_METERS = 24;

type BasemapStyle = "street" | "satellite" | "dark";

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY as string | undefined;
const MAPTILER_ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>';
const BASEMAPS: Record<
  BasemapStyle,
  { label: string; url: string; attribution: string; format: "png" | "jpg" }
> = {
  street: {
    label: "Street",
    url: `https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${MAPTILER_KEY ?? ""}`,
    attribution: MAPTILER_ATTRIBUTION,
    format: "png",
  },
  satellite: {
    label: "Satellite",
    url: `https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY ?? ""}`,
    attribution: MAPTILER_ATTRIBUTION,
    format: "jpg",
  },
  dark: {
    label: "Dark",
    url: `https://api.maptiler.com/maps/dataviz-v4-dark/{z}/{x}/{y}.png?key=${MAPTILER_KEY ?? ""}`,
    attribution: MAPTILER_ATTRIBUTION,
    format: "png",
  },
};

interface SessionMapClientProps {
  points: SessionPoint[];
  segments: SessionSegment[];
  selectedSegmentId: number | null;
  hoveredSegmentId: number | null;
  showFullRoute: boolean;
  playbackIdx?: number | null;
  sessionPlaybackIdx?: number | null;
  playbackActive?: boolean;
  displayOptions: MapDisplayOptions;
  units: UnitSystem;
  theme: ThemeMode;
  onlySegmentedActivity: boolean;
  reducedAnimation: boolean;
}

function FitBounds({ bbox, focused }: { bbox: SegmentBbox; focused: boolean }) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(
      [
        [bbox.min_lat, bbox.min_lon],
        [bbox.max_lat, bbox.max_lon],
      ],
      {
        padding: focused ? [12, 12] : [40, 40],
        maxZoom: focused ? FOCUSED_FIT_MAX_ZOOM : SESSION_FIT_MAX_ZOOM,
      },
    );
  }, [map, bbox.min_lat, bbox.min_lon, bbox.max_lat, bbox.max_lon, focused]);

  return null;
}

export function SessionMapClient({
  points,
  segments,
  selectedSegmentId,
  hoveredSegmentId,
  showFullRoute,
  playbackIdx = null,
  sessionPlaybackIdx = null,
  playbackActive = false,
  displayOptions,
  units,
  theme,
  onlySegmentedActivity,
  reducedAnimation,
}: SessionMapClientProps) {
  const themedBasemapStyle = theme === "dark" ? "dark" : "street";
  const [basemapOverride, setBasemapOverride] = useState<BasemapStyle | null>(null);
  const basemapStyle = basemapOverride ?? themedBasemapStyle;

  const segmentedPoints = useMemo(
    () => getSegmentedPoints(points, segments),
    [points, segments],
  );
  const mapDataPoints =
    onlySegmentedActivity && segmentedPoints.length > 0 ? segmentedPoints : points;
  const fullRoute = mapDataPoints.map((p) => [p.lat, p.lon] as [number, number]);
  const lineColor = MAP_LINE_COLORS[displayOptions.lineColor];
  const basemap = BASEMAPS[basemapStyle];
  const routeMode = getRouteDisplayMode(displayOptions.traceMode);

  const activeId = hoveredSegmentId ?? selectedSegmentId;
  const activeSeg = segments.find((s) => s.segment_id === activeId);
  const selectedSeg = segments.find((s) => s.segment_id === selectedSegmentId);
  const focused = Boolean(activeSeg && !showFullRoute);

  const segmentRoute = activeSeg
    ? points
        .slice(activeSeg.start_idx, activeSeg.end_idx + 1)
        .map((p) => [p.lat, p.lon] as [number, number])
    : null;
  const rawBbox = getRawBbox(mapDataPoints);
  const coreBbox = getCoreActivityBbox(mapDataPoints) ?? rawBbox;

  const bbox: SegmentBbox = focused && activeSeg ? activeSeg.bbox : coreBbox;

  const playbackTrailPoints =
    showFullRoute && sessionPlaybackIdx != null && sessionPlaybackIdx >= 1
      ? getSessionTrailPoints(points, sessionPlaybackIdx, displayOptions.traceMode)
      : selectedSeg && playbackIdx != null && playbackIdx >= 1 && routeMode.showPlaybackTrail
        ? points.slice(selectedSeg.start_idx, selectedSeg.start_idx + playbackIdx + 1)
        : null;
  const playbackTrail = playbackTrailPoints?.map((p) => [p.lat, p.lon] as [number, number]) ?? null;

  const playbackPoint =
    showFullRoute && sessionPlaybackIdx != null
      ? points[sessionPlaybackIdx]
      : selectedSeg && playbackIdx != null
        ? points[selectedSeg.start_idx + playbackIdx]
        : null;
  const currentSpeedMps = playbackPoint?.speed_smooth_mps ?? playbackPoint?.speed_mps ?? null;
  const showSpeedLegend = displayOptions.colorMode === "speed" && routeMode.showSpeedLegend;
  const showHeatmapLegend = routeMode.showHeatmap;
  const showMapOverlay = Boolean(playbackPoint || showSpeedLegend || showHeatmapLegend);
  const availableBasemapStyles = useMemo(() => ["street", "satellite", "dark"] as BasemapStyle[], []);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <MapContainer
        center={[points[0]?.lat ?? 0, points[0]?.lon ?? 0]}
        zoom={DEFAULT_ZOOM}
        maxZoom={MAP_MAX_ZOOM}
        className="h-full w-full"
        zoomControl={true}
        attributionControl={true}
      >
        <TileLayer
          key={basemapStyle}
          url={basemap.url}
          attribution={basemap.attribution}
          maxZoom={MAP_MAX_ZOOM}
          maxNativeZoom={TILE_NATIVE_MAX_ZOOM}
          tileSize={512}
          zoomOffset={-1}
          minZoom={1}
          crossOrigin={true}
        />

        <FitBounds bbox={bbox} focused={focused} />

        {routeMode.showHeatmap ? (
          <HeatmapCanvas
            points={
              showFullRoute || !activeSeg
                ? mapDataPoints
                : points.slice(activeSeg.start_idx, activeSeg.end_idx + 1)
            }
            mode={displayOptions.heatmapMode}
            lineColor={displayOptions.lineColor}
            theme={theme}
          />
        ) : null}

        {showFullRoute && routeMode.showFullRoute && displayOptions.colorMode === "speed" ? (
          <SpeedGradientRoute
            points={mapDataPoints}
            weight={2}
            opacity={0.35}
            displayOptions={displayOptions}
          />
        ) : showFullRoute && routeMode.showFullRoute ? (
          <Polyline
            positions={fullRoute}
            pathOptions={{
              color: lineColor,
              weight: 2,
              opacity: 0.35,
            }}
          />
        ) : null}

        {!showFullRoute &&
          routeMode.showInactiveSegments &&
          !onlySegmentedActivity &&
          segments
            .filter((s) => s.segment_id !== activeId)
            .map((s) => (
              <Polyline
                key={s.segment_id}
                positions={points
                  .slice(s.start_idx, s.end_idx + 1)
                  .map((p) => [p.lat, p.lon] as [number, number])}
                pathOptions={{ color: lineColor, weight: 2, opacity: 0.25 }}
              />
            ))}

        {segmentRoute && routeMode.showFocusedSegmentRoute && (
          <Polyline
            positions={segmentRoute}
            pathOptions={{
              color: lineColor,
              weight: 4,
              opacity: playbackTrail ? 0.35 : 0.9,
            }}
          />
        )}

        {playbackTrailPoints &&
        routeMode.showPlaybackTrail &&
        displayOptions.colorMode === "speed" ? (
          <SpeedGradientRoute
            points={playbackTrailPoints}
            weight={5}
            opacity={1}
            displayOptions={displayOptions}
          />
        ) : playbackTrail && routeMode.showPlaybackTrail && playbackTrail.length >= 2 ? (
          <Polyline
            positions={playbackTrail}
            pathOptions={{ color: lineColor, weight: 5, opacity: 1 }}
          />
        ) : null}

        {playbackPoint && (
          <Pane name="playback-marker" style={{ zIndex: 700 }}>
            <CircleMarker
              center={[playbackPoint.lat, playbackPoint.lon]}
              radius={9}
              pathOptions={{
                color: "#ffffff",
                weight: 4,
                fillColor: lineColor,
                fillOpacity: 1,
                opacity: 1,
              }}
              className={playbackActive && !reducedAnimation ? "pulse-glow" : ""}
            />
            <CircleMarker
              center={[playbackPoint.lat, playbackPoint.lon]}
              radius={14}
              pathOptions={{
                color: lineColor,
                weight: 2,
                fillOpacity: 0,
                opacity: 0.5,
              }}
            />
          </Pane>
        )}
      </MapContainer>

      {showMapOverlay ? (
        <div className="pointer-events-none absolute right-4 top-4 z-[900] w-40 space-y-2">
          {playbackPoint ? (
            <div className="rounded-xl border border-border/55 bg-background/85 px-3 py-2 shadow-lg backdrop-blur">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Current pace
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">
                {formatNullableSpeed(currentSpeedMps, units)}
              </div>
            </div>
          ) : null}
          {showSpeedLegend ? <MapSpeedLegend displayOptions={displayOptions} /> : null}
          {showHeatmapLegend ? <HeatmapLegend displayOptions={displayOptions} /> : null}
        </div>
      ) : null}

      <BasemapStyleControl
        value={basemapStyle}
        styles={availableBasemapStyles}
        hasApiKey={Boolean(MAPTILER_KEY)}
        onChange={setBasemapOverride}
      />
    </div>
  );
}

function getSegmentedPoints(points: SessionPoint[], segments: SessionSegment[]) {
  if (!segments.length) return [];

  const included = new Set<number>();
  for (const segment of segments) {
    for (let idx = segment.start_idx; idx <= segment.end_idx; idx += 1) {
      included.add(idx);
    }
  }

  return points.filter((_, index) => included.has(index));
}

function BasemapStyleControl({
  value,
  styles,
  hasApiKey,
  onChange,
}: {
  value: BasemapStyle;
  styles: BasemapStyle[];
  hasApiKey: boolean;
  onChange: (style: BasemapStyle) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute bottom-4 left-4 z-[900]">
      <div className="relative">
        <button
          type="button"
          className="rounded-xl border border-border/55 bg-background/85 px-3 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur transition hover:border-primary/70"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label="Choose map style"
        >
          {BASEMAPS[value].label}
        </button>

        {open ? (
          <div className="absolute bottom-full left-0 mb-2 w-36 overflow-hidden rounded-xl border border-border/55 bg-background/95 p-1 shadow-xl backdrop-blur">
            {styles.map((style) => (
              <button
                key={style}
                type="button"
                className={`block w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                  style === value
                    ? "bg-primary/18 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                onClick={() => {
                  onChange(style);
                  setOpen(false);
                }}
              >
                {BASEMAPS[style].label}
              </button>
            ))}
            {!hasApiKey ? (
              <div className="border-t border-border/60 px-3 py-2 text-[10px] leading-snug text-muted-foreground">
                Set VITE_MAPTILER_API_KEY to load MapTiler tiles.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getSessionTrailPoints(
  points: SessionPoint[],
  playheadIdx: number,
  traceMode: MapDisplayOptions["traceMode"],
) {
  if (traceMode === "none" || traceMode === "heatmap") return null;
  if (traceMode !== "streak") return points.slice(0, playheadIdx + 1);

  return points.slice(Math.max(0, playheadIdx - STREAK_POINTS), playheadIdx + 1);
}

function getRouteDisplayMode(traceMode: MapDisplayOptions["traceMode"]) {
  return {
    showFullRoute: traceMode === "full",
    showFocusedSegmentRoute: traceMode !== "none" && traceMode !== "heatmap",
    showInactiveSegments: traceMode !== "none" && traceMode !== "heatmap",
    showPlaybackTrail: traceMode !== "none" && traceMode !== "heatmap",
    showHeatmap: traceMode === "heatmap",
    showSpeedLegend: traceMode !== "none" && traceMode !== "heatmap",
  };
}

function getRawBbox(points: SessionPoint[]): SegmentBbox {
  return {
    min_lat: Math.min(...points.map((p) => p.lat)),
    min_lon: Math.min(...points.map((p) => p.lon)),
    max_lat: Math.max(...points.map((p) => p.lat)),
    max_lon: Math.max(...points.map((p) => p.lon)),
  };
}

function getCoreActivityBbox(points: SessionPoint[]): SegmentBbox | null {
  if (points.length < 12) return null;

  const origin = points[0];
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = Math.max(
    1,
    Math.cos((origin.lat * Math.PI) / 180) * metersPerDegreeLat,
  );
  const cells = new Map<
    string,
    { gridX: number; gridY: number; count: number; points: SessionPoint[] }
  >();

  for (const point of points) {
    const gridX = Math.round(
      ((point.lon - origin.lon) * metersPerDegreeLon) / CORE_BBOX_CELL_METERS,
    );
    const gridY = Math.round(
      ((point.lat - origin.lat) * metersPerDegreeLat) / CORE_BBOX_CELL_METERS,
    );
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

  return expandBbox(getRawBbox(componentPoints), 18);
}

function getQuantileBbox(points: SessionPoint[]): SegmentBbox | null {
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
    18,
  );
}

function expandBbox(bbox: SegmentBbox, paddingMeters: number): SegmentBbox {
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

function HeatmapCanvas({
  points,
  mode,
  lineColor,
  theme,
}: {
  points: SessionPoint[];
  mode: MapDisplayOptions["heatmapMode"];
  lineColor: MapLineColor;
  theme: ThemeMode;
}) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.zIndex = "420";
    canvas.style.pointerEvents = "none";
    canvas.style.mixBlendMode = "normal";
    container.appendChild(canvas);

    const draw = () => {
      const size = map.getSize();
      const scale = window.devicePixelRatio || 1;
      canvas.width = size.x * scale;
      canvas.height = size.y * scale;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;

      const context = canvas.getContext("2d");
      if (!context) return;

      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, size.x, size.y);
      context.globalCompositeOperation = "source-over";

      const detail = getHeatmapDetail(map.getZoom());
      drawUnifiedHeatmap(
        context,
        buildHeatmapCells(points, map, detail.cellPx),
        size,
        mode,
        lineColor,
        detail,
      );
    };

    draw();
    map.on("move zoom resize", draw);

    return () => {
      map.off("move zoom resize", draw);
      canvas.remove();
    };
  }, [lineColor, map, mode, points, theme]);

  return null;
}

interface HeatmapCell {
  x: number;
  y: number;
  gridX: number;
  gridY: number;
  count: number;
  speedSum: number;
}

interface HeatmapDetail {
  cellPx: number;
  blurPx: number;
  radiusBasePx: number;
  radiusRangePx: number;
}

function getHeatmapDetail(zoom: number): HeatmapDetail {
  const zoomDelta = HEATMAP_REFERENCE_ZOOM - zoom;
  const detailBoost = Math.max(0, Math.min(1.8, zoomDelta / 3));
  const cellPx = Math.max(
    HEATMAP_MIN_CELL_PX,
    Math.min(HEATMAP_MAX_CELL_PX, HEATMAP_CELL_PX - detailBoost * 4),
  );
  const blurPx = Math.max(
    HEATMAP_MIN_BLUR_PX,
    Math.min(HEATMAP_MAX_BLUR_PX, 6 - detailBoost * 1.7),
  );

  return {
    cellPx,
    blurPx,
    radiusBasePx: 14 + detailBoost * 2,
    radiusRangePx: 20 + detailBoost * 3,
  };
}

function buildHeatmapCells(
  points: SessionPoint[],
  map: ReturnType<typeof useMap>,
  cellPx: number,
) {
  const cells = new Map<string, HeatmapCell>();

  for (const point of points) {
    const projected = map.latLngToContainerPoint([point.lat, point.lon]);
    const cellX = Math.round(projected.x / cellPx);
    const cellY = Math.round(projected.y / cellPx);
    const key = `${cellX}:${cellY}`;
    const existing = cells.get(key);
    const speed = point.speed_smooth_mps ?? point.speed_mps ?? 0;

    if (existing) {
      existing.count += 1;
      existing.speedSum += speed;
    } else {
      cells.set(key, {
        x: cellX * cellPx,
        y: cellY * cellPx,
        gridX: cellX,
        gridY: cellY,
        count: 1,
        speedSum: speed,
      });
    }
  }

  return [...cells.values()];
}

function drawUnifiedHeatmap(
  context: CanvasRenderingContext2D,
  cells: HeatmapCell[],
  size: { x: number; y: number },
  mode: MapDisplayOptions["heatmapMode"],
  lineColor: MapLineColor,
  detail: HeatmapDetail,
) {
  if (!cells.length || size.x <= 0 || size.y <= 0) return;

  const heatmapStops = getBrightHeatmapGradientStops(lineColor);
  const densityCanvas = document.createElement("canvas");
  densityCanvas.width = size.x;
  densityCanvas.height = size.y;
  const densityContext = densityCanvas.getContext("2d");
  if (!densityContext) return;

  const maxCount = Math.max(1, ...cells.map((cell) => cell.count));

  for (const cell of cells) {
    const strength = Math.sqrt(cell.count / maxCount);
    const radius = detail.radiusBasePx + strength * detail.radiusRangePx;
    const alpha = 0.16 + strength * 0.6;
    const gradient = densityContext.createRadialGradient(cell.x, cell.y, 0, cell.x, cell.y, radius);
    gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
    gradient.addColorStop(0.44, `rgba(0, 0, 0, ${alpha * 0.62})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    densityContext.fillStyle = gradient;
    densityContext.beginPath();
    densityContext.arc(cell.x, cell.y, radius, 0, Math.PI * 2);
    densityContext.fill();
  }

  const smoothCanvas = document.createElement("canvas");
  smoothCanvas.width = size.x;
  smoothCanvas.height = size.y;
  const smoothContext = smoothCanvas.getContext("2d");
  if (!smoothContext) return;

  smoothContext.filter = `blur(${detail.blurPx}px)`;
  smoothContext.drawImage(densityCanvas, 0, 0);
  smoothContext.filter = "none";

  const densityData = smoothContext.getImageData(0, 0, size.x, size.y);
  const maxAlpha = getMaxAlpha(densityData.data);
  if (maxAlpha <= 0) return;

  const densityScale = getDensityScale(densityData.data, maxAlpha);

  drawUnifiedHeatmapShadow(context, densityData, size, heatmapStops[2], maxAlpha, densityScale);
  drawHeatmapBands(
    context,
    densityData,
    size,
    cells,
    mode,
    heatmapStops,
    maxAlpha,
    densityScale,
    detail.cellPx,
  );
}

function drawUnifiedHeatmapShadow(
  context: CanvasRenderingContext2D,
  densityData: ImageData,
  size: { x: number; y: number },
  shadowColor: string,
  maxAlpha: number,
  densityScale: DensityScale,
) {
  const [r, g, b] = hexToRgb(shadowColor);
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = size.x;
  shadowCanvas.height = size.y;
  const shadowContext = shadowCanvas.getContext("2d");
  if (!shadowContext) return;

  const shadowImage = shadowContext.createImageData(size.x, size.y);

  for (let index = 0; index < densityData.data.length; index += 4) {
    const density = densityData.data[index + 3] / maxAlpha;
    if (density < densityScale.footprint) continue;

    const alpha = Math.round(smoothStep(densityScale.footprint, densityScale.used, density) * 58);
    shadowImage.data[index] = r;
    shadowImage.data[index + 1] = g;
    shadowImage.data[index + 2] = b;
    shadowImage.data[index + 3] = alpha;
  }

  shadowContext.putImageData(shadowImage, 0, 0);

  context.save();
  context.filter = "blur(8px)";
  context.globalAlpha = 0.58;
  context.drawImage(shadowCanvas, 2, 4);
  context.restore();
}

function drawHeatmapBands(
  context: CanvasRenderingContext2D,
  densityData: ImageData,
  size: { x: number; y: number },
  cells: HeatmapCell[],
  mode: MapDisplayOptions["heatmapMode"],
  heatmapStops: string[],
  maxAlpha: number,
  densityScale: DensityScale,
  cellPx: number,
) {
  const cellIndex = new Map(cells.map((cell) => [`${cell.gridX}:${cell.gridY}`, cell]));
  const maxSpeed = Math.max(1, ...cells.map((cell) => cell.speedSum / cell.count));
  const renderCanvas = document.createElement("canvas");
  renderCanvas.width = size.x;
  renderCanvas.height = size.y;
  const renderContext = renderCanvas.getContext("2d");
  if (!renderContext) return;

  const image = renderContext.createImageData(size.x, size.y);

  for (let index = 0; index < densityData.data.length; index += 4) {
    const density = densityData.data[index + 3] / maxAlpha;
    if (density < densityScale.footprint) continue;

    const pixel = index / 4;
    const x = pixel % size.x;
    const y = Math.floor(pixel / size.x);
    const intensity =
      mode === "occupancy"
        ? occupancyBandIntensity(density, densityScale)
        : speedBandIntensity(x, y, cellIndex, maxSpeed, cellPx);
    const color = heatmapColor(intensity, heatmapStops);
    const [r, g, b] = hexToRgb(color);
    const alpha = Math.round(Math.min(0.96, 0.36 + Math.pow(density, 0.62) * 0.6) * 255);

    image.data[index] = r;
    image.data[index + 1] = g;
    image.data[index + 2] = b;
    image.data[index + 3] = alpha;
  }

  renderContext.putImageData(image, 0, 0);
  context.drawImage(renderCanvas, 0, 0);
}

interface DensityScale {
  footprint: number;
  used: number;
  strong: number;
  hot: number;
}

function getMaxAlpha(data: Uint8ClampedArray) {
  let max = 0;
  for (let index = 3; index < data.length; index += 4) {
    max = Math.max(max, data[index]);
  }
  return max;
}

function getDensityScale(data: Uint8ClampedArray, maxAlpha: number): DensityScale {
  const densities: number[] = [];

  for (let index = 3; index < data.length; index += 4) {
    const density = data[index] / maxAlpha;
    if (density > 0.025) densities.push(density);
  }

  if (!densities.length) {
    return { footprint: 0.06, used: 0.24, strong: 0.54, hot: 0.88 };
  }

  densities.sort((a, b) => a - b);

  const footprint = Math.min(0.18, Math.max(0.045, quantile(densities, 0.12)));
  const used = Math.max(footprint + 0.06, Math.min(0.42, quantile(densities, 0.45)));
  const strong = Math.max(used + 0.08, Math.min(0.72, quantile(densities, 0.72)));
  const hot = Math.max(strong + 0.08, quantile(densities, 0.89));

  return {
    footprint,
    used,
    strong,
    hot: Math.min(0.98, hot),
  };
}

function occupancyBandIntensity(density: number, scale: DensityScale) {
  if (density >= scale.hot) return 0.96;
  if (density >= scale.strong) return 0.7;
  if (density >= scale.used) return 0.43;
  return 0.14;
}

function speedBandIntensity(
  x: number,
  y: number,
  cellIndex: Map<string, HeatmapCell>,
  maxSpeed: number,
  cellPx: number,
) {
  const cellX = Math.round(x / cellPx);
  const cellY = Math.round(y / cellPx);
  const cell = cellIndex.get(`${cellX}:${cellY}`);
  const speedRatio = cell ? cell.speedSum / cell.count / maxSpeed : 0.12;

  if (speedRatio >= 0.78) return 0.96;
  if (speedRatio >= 0.5) return 0.7;
  if (speedRatio >= 0.24) return 0.42;
  return 0.16;
}

function smoothStep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function quantile(sortedValues: number[], percentile: number) {
  if (!sortedValues.length) return 0;

  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.round((sortedValues.length - 1) * percentile)),
  );
  return sortedValues[index];
}

function heatmapColor(t: number, stops: string[]) {
  const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  return mixHex(stops[index], stops[index + 1], scaled - index);
}

function HeatmapLegend({ displayOptions }: { displayOptions: MapDisplayOptions }) {
  const stops = getBrightHeatmapGradientStops(displayOptions.lineColor);
  const gradient = `linear-gradient(90deg, ${stops.join(", ")})`;
  const isSpeed = displayOptions.heatmapMode === "speed";

  return (
    <div className="rounded-xl border border-border/55 bg-background/85 px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {isSpeed ? "Speed heat" : "Occupancy heat"}
        </span>
        <span className="text-[10px] text-muted-foreground">Tint</span>
      </div>
      <div
        className="mt-2 h-2 rounded-full border border-white/15"
        style={{ background: gradient }}
      />
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{isSpeed ? "Slow" : "Brief"}</span>
        <span>{isSpeed ? "Fast" : "Frequent"}</span>
      </div>
    </div>
  );
}

function getBrightHeatmapGradientStops(lineColor: MapLineColor) {
  const [light, base, dark] = getMapSingleColorGradientStops(lineColor);

  return [
    mixHex(light, base, 0.28),
    mixHex(light, base, 0.74),
    mixHex(base, dark, 0.38),
  ];
}

function hexToRgba(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function SpeedGradientRoute({
  points,
  weight,
  opacity,
  displayOptions,
}: {
  points: SessionPoint[];
  weight: number;
  opacity: number;
  displayOptions: MapDisplayOptions;
}) {
  if (points.length < 2) return null;

  return (
    <>
      {points.slice(1).map((point, index) => {
        const previous = points[index];
        return (
          <Polyline
            key={`${previous.t}-${point.t}-${index}`}
            positions={[
              [previous.lat, previous.lon],
              [point.lat, point.lon],
            ]}
            pathOptions={{
              color: speedColor(point.speed_smooth_mps ?? point.speed_mps, displayOptions),
              weight,
              opacity,
            }}
          />
        );
      })}
    </>
  );
}

function MapSpeedLegend({ displayOptions }: { displayOptions: MapDisplayOptions }) {
  const stops = getMapSpeedGradientStops(displayOptions);
  const gradient = `linear-gradient(90deg, ${stops.join(", ")})`;

  return (
    <div className="rounded-xl border border-border/55 bg-background/85 px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Speed color
        </span>
        <span className="text-[10px] text-muted-foreground">
          {displayOptions.gradientMode === "single" ? "Tint" : "Range"}
        </span>
      </div>
      <div
        className="mt-2 h-2 rounded-full border border-white/15"
        style={{ background: gradient }}
      />
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Slow</span>
        <span>Fast</span>
      </div>
    </div>
  );
}

function speedColor(speedMps: number, displayOptions: MapDisplayOptions) {
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

function formatNullableSpeed(speedMps: number | null, units: UnitSystem) {
  if (speedMps == null || !Number.isFinite(speedMps)) {
    return units === "imperial" ? "-- mph" : "-- km/h";
  }

  return formatSpeed(speedMps, units);
}
