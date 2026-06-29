import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crosshair, Map as MapIcon, Pin, Plus, X } from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Pane,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type {
  MultiplayerSessionData,
  SessionPoint,
  SessionSegment,
  SegmentBbox,
} from "@/types/session";
import type {
  MapBasemapStyle,
  MapDisplayOptions,
  MapLineColor,
  MapTraceMode,
  MultiplayerParticipantDisplayOptions,
} from "@/types/map-display";
import type {
  CourtTemplate,
  FieldMapElement,
  FieldZone,
  MapElement,
  MapElementType,
  PinMapElement,
} from "@/types/map-elements";
import { COURT_TEMPLATES } from "@/lib/court-templates";
import { buildZoneSetFromPrompt, getDefaultZoneSet } from "@/lib/field-zones";
import {
  getMapSingleColorGradientStops,
  getMapSpeedGradientStops,
  MAP_LINE_COLORS,
} from "@/types/map-display";
import type { ThemeMode, UnitSystem } from "@/types/app-settings";
import { formatSpeed } from "@/lib/format";
import { getMultiplayerPlaybackSnapshot } from "@/lib/multiplayer-playback";

const DEFAULT_ZOOM = 17;
const SESSION_FIT_MAX_ZOOM = 18;
const FOCUSED_FIT_MAX_ZOOM = 22;
const MAP_MAX_ZOOM = 22;
const TILE_NATIVE_MAX_ZOOM = 20;
const STREAK_POINTS = 48;
const STREAK_LEAD_IN_POINTS = 36;
const STREAK_START_PREVIEW_MAX_POINTS = 44;
const STREAK_START_PREVIEW_SOLID_SECONDS = 8;
const STREAK_START_PREVIEW_FADE_SECONDS = 38;
const STREAK_START_PREVIEW_MAX_METERS = 70;
const HEATMAP_CELL_PX = 14;
const HEATMAP_REFERENCE_ZOOM = 18;
const HEATMAP_MIN_CELL_PX = 7;
const HEATMAP_MAX_CELL_PX = 18;
const HEATMAP_MIN_BLUR_PX = 3;
const HEATMAP_MAX_BLUR_PX = 7;
const CORE_BBOX_CELL_METERS = 24;

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY as string | undefined;
const MAPTILER_ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>';
const BASEMAPS: Record<
  MapBasemapStyle,
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
  mapElements: MapElement[];
  onMapElementsChange: (elements: MapElement[]) => void;
  basemapStyle: MapBasemapStyle | null;
  onBasemapStyleChange: (style: MapBasemapStyle | null) => void;
  sport?: string;
  multiplayerSession?: MultiplayerSessionData | null;
  multiplayerElapsedSeconds?: number | null;
  multiplayerDisplayOptions?: Record<string, MultiplayerParticipantDisplayOptions>;
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
  mapElements,
  onMapElementsChange,
  basemapStyle: selectedBasemapStyle,
  onBasemapStyleChange,
  sport,
  multiplayerSession = null,
  multiplayerElapsedSeconds = null,
  multiplayerDisplayOptions = {},
}: SessionMapClientProps) {
  const themedBasemapStyle = theme === "dark" ? "dark" : "street";
  const [elementPickerOpen, setElementPickerOpen] = useState(false);
  const [placingElementType, setPlacingElementType] = useState<MapElementType | null>(null);
  const [placingTemplate, setPlacingTemplate] = useState<CourtTemplate | undefined>(undefined);
  const [selectedMapElementId, setSelectedMapElementId] = useState<string | null>(null);
  const suppressNextMapClickRef = useRef(false);
  const basemapStyle = selectedBasemapStyle ?? themedBasemapStyle;
  const selectedMapElement = mapElements.find((element) => element.id === selectedMapElementId);

  const multiplayerPoints = useMemo(
    () => multiplayerSession?.participants.flatMap((participant) => participant.points) ?? [],
    [multiplayerSession],
  );
  const segmentedPoints = useMemo(() => getSegmentedPoints(points, segments), [points, segments]);
  const mapDataPoints =
    multiplayerPoints.length > 0
      ? multiplayerPoints
      : onlySegmentedActivity && segmentedPoints.length > 0
        ? segmentedPoints
        : points;
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
      ? getSessionTrailPoints(points, segments, sessionPlaybackIdx, displayOptions.traceMode)
      : selectedSeg && playbackIdx != null && playbackIdx >= 1 && routeMode.showPlaybackTrail
        ? getFocusedTrailPoints(points, selectedSeg, playbackIdx, displayOptions.traceMode)
        : null;
  const playbackTrail = playbackTrailPoints?.map((p) => [p.lat, p.lon] as [number, number]) ?? null;

  const multiplayerSnapshot =
    multiplayerSession && multiplayerElapsedSeconds != null
      ? getMultiplayerPlaybackSnapshot(multiplayerSession, multiplayerElapsedSeconds)
      : null;

  const playbackPoint = multiplayerSnapshot
    ? null
    : showFullRoute && sessionPlaybackIdx != null
      ? points[sessionPlaybackIdx]
      : selectedSeg && playbackIdx != null
        ? points[selectedSeg.start_idx + playbackIdx]
        : null;
  const currentSpeedMps = playbackPoint?.speed_smooth_mps ?? playbackPoint?.speed_mps ?? null;
  const showSpeedLegend = displayOptions.colorMode === "speed" && routeMode.showSpeedLegend;
  const showHeatmapLegend = routeMode.showHeatmap;
  const availableBasemapStyles = useMemo(
    () => ["street", "satellite", "dark"] as MapBasemapStyle[],
    [],
  );

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <MapContainer
        center={[mapDataPoints[0]?.lat ?? 0, mapDataPoints[0]?.lon ?? 0]}
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

        <MapElementPlacementHandler
          placingType={placingElementType}
          onPlace={(lat, lon) => {
            const nextElement = createMapElement(placingElementType, lat, lon, placingTemplate);
            onMapElementsChange([...mapElements, nextElement]);
            setSelectedMapElementId(nextElement.id);
            setPlacingElementType(null);
            setPlacingTemplate(undefined);
            setElementPickerOpen(false);
          }}
          onDeselect={() => {
            if (suppressNextMapClickRef.current) {
              suppressNextMapClickRef.current = false;
              return;
            }
            setSelectedMapElementId(null);
          }}
        />

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

        {multiplayerSession ? (
          <MultiplayerReplayOverlay
            session={multiplayerSession}
            elapsedSeconds={multiplayerElapsedSeconds ?? 0}
            defaultTraceMode={displayOptions.traceMode}
            displayOptions={displayOptions}
            heatmapMode={displayOptions.heatmapMode}
            theme={theme}
            participantDisplayOptions={multiplayerDisplayOptions}
          />
        ) : showFullRoute && routeMode.showFullRoute && displayOptions.colorMode === "speed" ? (
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
              weight: 1.6,
              opacity: 0.32,
            }}
          />
        ) : null}

        {displayOptions.traceMode === "streak" && !playbackActive && !playbackTrail ? (
          <StreakStartPreview
            points={points}
            segments={showFullRoute ? segments : selectedSeg ? [selectedSeg] : []}
            lineColor={lineColor}
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
                pathOptions={{ color: lineColor, weight: 1.5, opacity: 0.22 }}
              />
            ))}

        {segmentRoute && routeMode.showFocusedSegmentRoute && (
          <Polyline
            positions={segmentRoute}
            pathOptions={{
              color: lineColor,
              weight: 3.2,
              opacity: playbackTrail ? 0.35 : 0.9,
            }}
          />
        )}

        {playbackTrailPoints &&
        routeMode.showPlaybackTrail &&
        displayOptions.colorMode === "speed" ? (
          <SpeedGradientRoute
            points={playbackTrailPoints}
            weight={4}
            opacity={1}
            displayOptions={displayOptions}
          />
        ) : playbackTrail && routeMode.showPlaybackTrail && playbackTrail.length >= 2 ? (
          <Polyline
            positions={playbackTrail}
            pathOptions={{ color: lineColor, weight: 4, opacity: 1 }}
          />
        ) : null}

        {playbackPoint && (
          <Pane name="playback-marker" style={{ zIndex: 700 }}>
            <CircleMarker
              center={[playbackPoint.lat, playbackPoint.lon]}
              radius={9}
              pathOptions={{
                color: "#ffffff",
                weight: 3.2,
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
                weight: 1.6,
                fillOpacity: 0,
                opacity: 0.5,
              }}
            />
          </Pane>
        )}

        <MapElementsOverlay
          elements={mapElements}
          selectedId={selectedMapElementId}
          onSelect={setSelectedMapElementId}
          onElementInteraction={() => {
            suppressNextMapClickRef.current = true;
          }}
          onChange={onMapElementsChange}
        />
      </MapContainer>

      {(elementPickerOpen || placingElementType) && (
        <div className="pointer-events-none absolute inset-0 z-[920] bg-black/35 backdrop-blur-[1px]" />
      )}

      {elementPickerOpen ? (
        <MapElementPicker
          sport={sport}
          onSelect={(type, template) => {
            setPlacingTemplate(template);
            setPlacingElementType(type);
            setElementPickerOpen(false);
          }}
          onClose={() => setElementPickerOpen(false)}
        />
      ) : null}

      {placingElementType ? (
        <div className="pointer-events-none absolute left-1/2 top-16 z-[940] -translate-x-1/2 rounded-lg border border-white/15 bg-background/90 px-2.5 py-1.5 text-[10px] font-medium text-foreground shadow-xl backdrop-blur">
          Click the map to place{" "}
          {placingTemplate
            ? COURT_TEMPLATES[placingTemplate].label.toLowerCase()
            : MAP_ELEMENT_LABELS[placingElementType].toLowerCase()}
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-4 top-4 z-[900] w-32 space-y-1.5">
        {playbackPoint ? (
          <div className="rounded-lg border border-border/55 bg-background/85 px-2.5 py-1.5 shadow-lg backdrop-blur">
            <div className="text-[8px] font-medium uppercase tracking-wider text-muted-foreground">
              Current pace
            </div>
            <div className="mt-0.5 font-mono text-[11px] font-semibold text-foreground">
              {formatNullableSpeed(currentSpeedMps, units)}
            </div>
          </div>
        ) : null}
        {showSpeedLegend ? <MapSpeedLegend displayOptions={displayOptions} /> : null}
        {showHeatmapLegend ? <HeatmapLegend displayOptions={displayOptions} /> : null}
        <button
          type="button"
          onClick={() => {
            setElementPickerOpen(true);
            setPlacingElementType(null);
          }}
          className="pointer-events-auto flex w-full items-center justify-center gap-1 rounded-lg border border-border/55 bg-background/85 px-2.5 py-1.5 text-[10px] font-semibold text-foreground shadow-lg backdrop-blur transition hover:border-primary/70"
        >
          <Plus className="h-3 w-3" />
          Add element
        </button>
      </div>

      <BasemapStyleControl
        value={basemapStyle}
        styles={availableBasemapStyles}
        hasApiKey={Boolean(MAPTILER_KEY)}
        onChange={onBasemapStyleChange}
      />

      {selectedMapElement?.type === "field" ? (
        <FieldZoneEditor
          element={selectedMapElement}
          onChange={(nextElement) => {
            onMapElementsChange(
              mapElements.map((element) => (element.id === nextElement.id ? nextElement : element)),
            );
          }}
          onDelete={() => {
            onMapElementsChange(
              mapElements.filter((element) => element.id !== selectedMapElement.id),
            );
            setSelectedMapElementId(null);
          }}
        />
      ) : selectedMapElement ? (
        <button
          type="button"
          onClick={() => {
            onMapElementsChange(
              mapElements.filter((element) => element.id !== selectedMapElement.id),
            );
            setSelectedMapElementId(null);
          }}
          className="absolute left-4 top-32 z-[900] rounded-lg border border-destructive/35 bg-background/90 px-2.5 py-1.5 text-[10px] font-semibold text-destructive shadow-lg backdrop-blur transition hover:bg-destructive/10"
        >
          Delete marker
        </button>
      ) : null}
    </div>
  );
}

function FieldZoneEditor({
  element,
  onChange,
  onDelete,
}: {
  element: FieldMapElement;
  onChange: (element: FieldMapElement) => void;
  onDelete: () => void;
}) {
  const [prompt, setPrompt] = useState(
    element.zoneSet?.prompt ?? "left lane, middle stack, right lane and end zones",
  );
  const defaultZoneSet = getDefaultZoneSet(element.template);
  const zones = element.zoneSet?.zones ?? [];

  useEffect(() => {
    setPrompt(element.zoneSet?.prompt ?? "left lane, middle stack, right lane and end zones");
  }, [element.id, element.zoneSet?.prompt]);

  return (
    <div className="absolute left-3 top-20 z-[900] w-[min(calc(100%-1.5rem),22rem)] rounded-xl border border-border/65 bg-background/94 p-3 text-foreground shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Field zones
          </div>
          <div className="mt-0.5 text-sm font-semibold">{element.label}</div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-destructive/35 px-2 py-1 text-[10px] font-semibold text-destructive transition hover:bg-destructive/10"
        >
          Delete
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {defaultZoneSet ? (
          <button
            type="button"
            onClick={() => onChange({ ...element, zoneSet: defaultZoneSet })}
            className="rounded-md border border-primary/35 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary transition hover:bg-primary/15"
          >
            Sport preset
          </button>
        ) : null}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...element,
              zoneSet: buildZoneSetFromPrompt("left lane, middle, right lane", element.template),
            })
          }
          className="rounded-md border border-border/70 px-2 py-1 text-[10px] font-semibold text-foreground transition hover:bg-secondary"
        >
          Lane thirds
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...element, zoneSet: undefined })}
          className="rounded-md border border-border/70 px-2 py-1 text-[10px] font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          Clear
        </button>
      </div>

      <label className="mt-3 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Describe layout
      </label>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={3}
        className="mt-1.5 w-full resize-none rounded-lg border border-border/65 bg-background/80 px-2.5 py-2 text-xs leading-relaxed text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60"
        placeholder="Try: zones: handler reset, middle stack, deep space"
      />
      <button
        type="button"
        onClick={() =>
          onChange({ ...element, zoneSet: buildZoneSetFromPrompt(prompt, element.template) })
        }
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/14 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
      >
        <Plus className="h-3.5 w-3.5" />
        Generate zones
      </button>

      {zones.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {zones.map((zone) => (
            <span
              key={zone.id}
              className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              style={{ borderColor: zone.color ? `${zone.color}88` : undefined }}
            >
              {zone.label}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-border/55 bg-secondary/35 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
          Add zones to compare time, distance, and speed by field area.
        </div>
      )}
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

const MULTIPLAYER_COLORS: MapLineColor[] = ["cyan", "amber", "rose", "green"];

function MultiplayerReplayOverlay({
  session,
  elapsedSeconds,
  defaultTraceMode,
  displayOptions,
  heatmapMode,
  theme,
  participantDisplayOptions,
}: {
  session: MultiplayerSessionData;
  elapsedSeconds: number;
  defaultTraceMode: MapTraceMode;
  displayOptions: MapDisplayOptions;
  heatmapMode: MapDisplayOptions["heatmapMode"];
  theme: ThemeMode;
  participantDisplayOptions: Record<string, MultiplayerParticipantDisplayOptions>;
}) {
  const snapshot = getMultiplayerPlaybackSnapshot(session, elapsedSeconds);

  return (
    <>
      {session.participants.map((participant, index) => {
        const options = participantDisplayOptions[participant.participant_id];
        const lineColor =
          options?.lineColor ?? MULTIPLAYER_COLORS[index % MULTIPLAYER_COLORS.length];
        const color = MAP_LINE_COLORS[lineColor];
        const traceMode = options?.traceMode ?? defaultTraceMode;
        const label = options?.label?.trim() || participant.label;
        const showLabel = options?.showLabel ?? true;
        const isVisible = options?.visible ?? true;
        if (!isVisible) return null;

        const current = snapshot.participants.find(
          (state) => state.participantId === participant.participant_id,
        );
        const activePoint = current?.point;
        const previousIdx = current?.previousIdx ?? null;
        const showHeatmap = traceMode === "heatmap";
        const isEdgePaused = current?.status === "before_start" || current?.status === "after_end";
        const isInternalGap = current?.status === "gap";
        const showRouteContext =
          traceMode !== "none" && !showHeatmap && !isEdgePaused && !isInternalGap;
        const showFullContext = traceMode === "full";
        const showStreak = traceMode === "streak";
        const routePoints =
          showRouteContext && participant.points.length >= 2
            ? getMultiplayerRoutePoints(
                participant.points,
                previousIdx,
                showFullContext,
                showStreak,
              )
            : [];

        return (
          <Pane
            key={participant.participant_id}
            name={`multiplayer-${participant.participant_id}`}
            style={{ zIndex: 680 + index }}
          >
            {showHeatmap ? (
              <HeatmapCanvas
                points={participant.points}
                mode={heatmapMode}
                lineColor={lineColor}
                theme={theme}
              />
            ) : null}
            {routePoints.length >= 2 ? (
              displayOptions.colorMode === "speed" ? (
                <SpeedGradientRoute
                  points={routePoints}
                  weight={showStreak ? 4 : 2.2}
                  opacity={showStreak ? 0.95 : 0.32}
                  displayOptions={{ ...displayOptions, lineColor }}
                />
              ) : (
                <Polyline
                  positions={routePoints.map((point) => [point.lat, point.lon] as [number, number])}
                  pathOptions={{
                    color,
                    weight: showStreak ? 4 : 2.2,
                    opacity: showStreak ? 0.95 : 0.32,
                  }}
                />
              )
            ) : null}
            {activePoint ? (
              <>
                <CircleMarker
                  center={[activePoint.lat, activePoint.lon]}
                  radius={8}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 3,
                    fillColor: color,
                    fillOpacity: isEdgePaused ? 0.58 : 1,
                    opacity: isEdgePaused ? 0.72 : 1,
                  }}
                >
                  {showLabel ? (
                    <Tooltip permanent direction="top" offset={[0, -10]} opacity={0.95}>
                      <span className="text-[10px] font-semibold">{label}</span>
                    </Tooltip>
                  ) : null}
                </CircleMarker>
                <CircleMarker
                  center={[activePoint.lat, activePoint.lon]}
                  radius={13}
                  pathOptions={{
                    color,
                    weight: 1.6,
                    fillOpacity: 0,
                    opacity: isEdgePaused ? 0.2 : current.status === "interpolated" ? 0.55 : 0.35,
                  }}
                />
              </>
            ) : null}
          </Pane>
        );
      })}
    </>
  );
}

function getMultiplayerRoutePoints(
  points: SessionPoint[],
  previousIdx: number | null,
  showFullContext: boolean,
  showStreak: boolean,
) {
  if (showFullContext || previousIdx == null) {
    return points;
  }

  if (!showStreak) {
    return points.slice(0, previousIdx + 1);
  }

  return points.slice(Math.max(0, previousIdx - STREAK_POINTS + 1), previousIdx + 1);
}

const MAP_ELEMENT_LABELS: Record<MapElementType, string> = {
  field: "Field overlay",
  bench: "Rest area",
  focal: "Focal point",
};

function MapElementPlacementHandler({
  placingType,
  onPlace,
  onDeselect,
}: {
  placingType: MapElementType | null;
  onPlace: (lat: number, lon: number) => void;
  onDeselect: () => void;
}) {
  useMapEvents({
    click(event) {
      if (!placingType) {
        onDeselect();
        return;
      }
      onPlace(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

function sportToCourtTemplate(sport: string): CourtTemplate | null {
  const s = sport.toLowerCase();
  if (s === "soccer") return "soccer";
  if (s === "basketball") return "basketball";
  if (s === "ultimate") return "ultimate";
  if (s === "tennis") return "tennis";
  if (s === "squash") return "squash";
  return null;
}

function MapElementPicker({
  sport,
  onSelect,
  onClose,
}: {
  sport?: string;
  onSelect: (type: MapElementType, template?: CourtTemplate) => void;
  onClose: () => void;
}) {
  const matchedTemplate = sport ? sportToCourtTemplate(sport) : null;
  const templatesToShow: CourtTemplate[] = matchedTemplate
    ? [matchedTemplate, "generic"]
    : (["soccer", "basketball", "ultimate", "tennis", "squash", "generic"] as CourtTemplate[]);

  const gridCols =
    templatesToShow.length <= 3
      ? "sm:grid-cols-3"
      : templatesToShow.length <= 4
        ? "sm:grid-cols-4"
        : "sm:grid-cols-6";

  return (
    <div className="absolute inset-0 z-[940] flex items-center justify-center p-6">
      <div className="relative w-full max-w-3xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-2 -top-12 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-background/90 text-foreground shadow-xl backdrop-blur transition hover:bg-secondary"
          aria-label="Close map element picker"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-white/50">
          Court &amp; field
        </div>
        <div className={`mb-4 grid grid-cols-2 gap-3 ${gridCols}`}>
          {templatesToShow.map((template) => {
            const spec = COURT_TEMPLATES[template];
            return (
              <button
                key={template}
                type="button"
                onClick={() => onSelect("field", template)}
                className="group flex flex-col items-center justify-center rounded-2xl border border-white/15 bg-background/88 px-3 py-4 text-center shadow-2xl backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/70 hover:bg-background/95"
              >
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/35 bg-primary/12 transition group-hover:bg-primary/18">
                  <CourtIcon template={template} className="h-5 w-5 text-primary" />
                </div>
                <div className="text-[11px] font-semibold leading-tight text-foreground">
                  {spec.label}
                </div>
                <div className="mt-1 text-[9px] leading-snug text-muted-foreground">
                  {spec.widthM}×{spec.heightM} m
                </div>
              </button>
            );
          })}
        </div>

        <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-white/50">
          Marker
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MapElementCard
            type="focal"
            title="Focal Point"
            description="Mark a tactical anchor point."
            onSelect={(type) => onSelect(type)}
          />
          <MapElementCard
            type="bench"
            title="Rest Area"
            description="Mark a bench or sideline area."
            onSelect={(type) => onSelect(type)}
          />
        </div>
      </div>
    </div>
  );
}

function CourtIcon({ template, className }: { template: CourtTemplate; className?: string }) {
  // Simple SVG representations of each court/field shape
  if (template === "soccer") {
    return (
      <svg
        viewBox="0 0 20 14"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1" y="1" width="18" height="12" rx="0.5" />
        <line x1="10" y1="1" x2="10" y2="13" />
        <circle cx="10" cy="7" r="2.5" />
        <rect x="1" y="4" width="3" height="6" />
        <rect x="16" y="4" width="3" height="6" />
      </svg>
    );
  }
  if (template === "basketball") {
    return (
      <svg
        viewBox="0 0 20 12"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1" y="1" width="18" height="10" rx="0.5" />
        <line x1="10" y1="1" x2="10" y2="11" />
        <circle cx="10" cy="6" r="2" />
        <rect x="1" y="3.5" width="5" height="5" />
        <rect x="14" y="3.5" width="5" height="5" />
      </svg>
    );
  }
  if (template === "ultimate") {
    return (
      <svg
        viewBox="0 0 20 10"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1" y="1" width="18" height="8" rx="0.5" />
        <line x1="4.5" y1="1" x2="4.5" y2="9" />
        <line x1="15.5" y1="1" x2="15.5" y2="9" />
      </svg>
    );
  }
  if (template === "tennis") {
    return (
      <svg
        viewBox="0 0 20 12"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1" y="1" width="18" height="10" rx="0.5" />
        <line x1="10" y1="1" x2="10" y2="11" />
        <line x1="1" y1="3" x2="19" y2="3" />
        <line x1="1" y1="9" x2="19" y2="9" />
        <line x1="4" y1="3" x2="4" y2="9" />
        <line x1="16" y1="3" x2="16" y2="9" />
      </svg>
    );
  }
  if (template === "squash") {
    return (
      <svg
        viewBox="0 0 14 20"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1" y="1" width="12" height="18" rx="0.5" />
        {/* short line */}
        <line x1="1" y1="8" x2="13" y2="8" />
        {/* half court line */}
        <line x1="7" y1="8" x2="7" y2="19" />
        {/* service box line */}
        <line x1="1" y1="12.5" x2="13" y2="12.5" />
      </svg>
    );
  }
  // generic
  return <MapIcon className={className ?? "h-5 w-5"} />;
}

function MapElementCard({
  type,
  title,
  description,
  onSelect,
}: {
  type: MapElementType;
  title: string;
  description: string;
  onSelect: (type: MapElementType) => void;
}) {
  const Icon = type === "field" ? MapIcon : type === "focal" ? Crosshair : Pin;

  return (
    <button
      type="button"
      onClick={() => onSelect(type)}
      className="group flex min-h-40 flex-col items-center justify-center rounded-2xl border border-white/15 bg-background/88 p-5 text-center shadow-2xl backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/70 hover:bg-background/95"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/35 bg-primary/12 text-primary transition group-hover:bg-primary/18">
        <Icon className="h-8 w-8" />
      </div>
      <div className="text-lg font-semibold text-foreground">{title}</div>
      <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</div>
    </button>
  );
}

function createMapElement(
  type: MapElementType | null,
  lat: number,
  lon: number,
  template?: CourtTemplate,
): MapElement {
  const id = `map-element-${Date.now()}`;

  if (type === "field") {
    const spec = COURT_TEMPLATES[template ?? "generic"];
    return {
      id,
      type: "field",
      label: spec.label,
      center: { lat, lon },
      widthM: spec.widthM,
      heightM: spec.heightM,
      rotationDeg: 0,
      template,
      zoneSet: getDefaultZoneSet(template),
    };
  }

  const pinType = type ?? "focal";
  return {
    id,
    type: pinType,
    label: MAP_ELEMENT_LABELS[pinType],
    position: { lat, lon },
  };
}

function MapElementsOverlay({
  elements,
  selectedId,
  onSelect,
  onElementInteraction,
  onChange,
}: {
  elements: MapElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onElementInteraction: () => void;
  onChange: (elements: MapElement[]) => void;
}) {
  const map = useMap();
  const [version, setVersion] = useState(0);
  const container = map.getContainer();
  const size = map.getSize();

  useEffect(() => {
    const refresh = () => setVersion((current) => current + 1);
    map.on("move zoom resize", refresh);
    return () => {
      map.off("move zoom resize", refresh);
    };
  }, [map]);

  const updateElement = (nextElement: MapElement) => {
    onChange(elements.map((element) => (element.id === nextElement.id ? nextElement : element)));
  };

  return createPortal(
    <svg
      key={version}
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 660 }}
      width={size.x}
      height={size.y}
    >
      {elements.map((element) =>
        element.type === "field" ? (
          <FieldElementShape
            key={element.id}
            element={element}
            map={map}
            selected={element.id === selectedId}
            onSelect={onSelect}
            onElementInteraction={onElementInteraction}
            onChange={updateElement}
          />
        ) : (
          <PinElementShape
            key={element.id}
            element={element}
            map={map}
            selected={element.id === selectedId}
            onSelect={onSelect}
            onElementInteraction={onElementInteraction}
            onChange={updateElement}
          />
        ),
      )}
    </svg>,
    container,
  );
}

function FieldElementShape({
  element,
  map,
  selected,
  onSelect,
  onElementInteraction,
  onChange,
}: {
  element: FieldMapElement;
  map: ReturnType<typeof useMap>;
  selected: boolean;
  onSelect: (id: string | null) => void;
  onElementInteraction: () => void;
  onChange: (element: FieldMapElement) => void;
}) {
  const center = map.latLngToContainerPoint([element.center.lat, element.center.lon]);
  const metersPerPixel = getMetersPerPixel(element.center.lat, map.getZoom());
  const widthPx = element.widthM / metersPerPixel;
  const heightPx = element.heightM / metersPerPixel;
  const corners = getRotatedRectPoints(center.x, center.y, widthPx, heightPx, element.rotationDeg);
  const topCenter = rotatePoint(
    center.x,
    center.y - heightPx / 2 - 34,
    center.x,
    center.y,
    element.rotationDeg,
  );
  const zones = element.zoneSet?.zones ?? [];

  const startDrag = (
    event: React.PointerEvent,
    mode: "move" | "resize" | "rotate",
    cornerIndex = 0,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onElementInteraction();
    onSelect(element.id);
    const startClient = { x: event.clientX, y: event.clientY };
    const startCenter = { x: center.x, y: center.y };
    const startElement = element;

    const handleMove = (moveEvent: PointerEvent) => {
      if (mode === "move") {
        const nextCenter = map.containerPointToLatLng([
          startCenter.x + moveEvent.clientX - startClient.x,
          startCenter.y + moveEvent.clientY - startClient.y,
        ]);
        onChange({
          ...startElement,
          center: { lat: nextCenter.lat, lon: nextCenter.lng },
        });
        return;
      }

      const pointer = clientToContainerPoint(map, moveEvent.clientX, moveEvent.clientY);
      const currentCenter = map.latLngToContainerPoint([
        startElement.center.lat,
        startElement.center.lon,
      ]);

      if (mode === "rotate") {
        const angle =
          (Math.atan2(pointer.y - currentCenter.y, pointer.x - currentCenter.x) * 180) / Math.PI;
        onChange({ ...startElement, rotationDeg: angle + 90 });
        return;
      }

      const draggedLocal = rotatePoint(
        pointer.x,
        pointer.y,
        currentCenter.x,
        currentCenter.y,
        -startElement.rotationDeg,
      );
      const oppositeCorner = getRectCornerLocal(
        (cornerIndex + 2) % 4,
        startElement.widthM / metersPerPixel,
        startElement.heightM / metersPerPixel,
      );
      const draggedCorner = getRectCornerLocal(
        cornerIndex,
        startElement.widthM / metersPerPixel,
        startElement.heightM / metersPerPixel,
      );
      const minSizePx = 8 / metersPerPixel;
      const directionX = Math.sign(draggedCorner.x - oppositeCorner.x) || 1;
      const directionY = Math.sign(draggedCorner.y - oppositeCorner.y) || 1;
      const adjustedDraggedLocal = {
        x:
          oppositeCorner.x +
          directionX *
            Math.max(minSizePx, Math.abs(draggedLocal.x - currentCenter.x - oppositeCorner.x)),
        y:
          oppositeCorner.y +
          directionY *
            Math.max(minSizePx, Math.abs(draggedLocal.y - currentCenter.y - oppositeCorner.y)),
      };
      const nextCenterLocal = {
        x: (oppositeCorner.x + adjustedDraggedLocal.x) / 2,
        y: (oppositeCorner.y + adjustedDraggedLocal.y) / 2,
      };
      const nextCenterPoint = rotatePoint(
        currentCenter.x + nextCenterLocal.x,
        currentCenter.y + nextCenterLocal.y,
        currentCenter.x,
        currentCenter.y,
        startElement.rotationDeg,
      );
      const nextCenterLatLng = map.containerPointToLatLng([nextCenterPoint.x, nextCenterPoint.y]);
      const nextWidth = Math.max(
        8,
        Math.abs(adjustedDraggedLocal.x - oppositeCorner.x) * metersPerPixel,
      );
      const nextHeight = Math.max(
        8,
        Math.abs(adjustedDraggedLocal.y - oppositeCorner.y) * metersPerPixel,
      );

      onChange({
        ...startElement,
        center: { lat: nextCenterLatLng.lat, lon: nextCenterLatLng.lng },
        widthM: nextWidth,
        heightM: nextHeight,
      });
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const markings =
    element.template && element.template !== "generic"
      ? COURT_TEMPLATES[element.template].markings
      : [];

  return (
    <g>
      <polygon
        points={corners.map((point) => `${point.x},${point.y}`).join(" ")}
        className="pointer-events-auto cursor-move"
        fill="rgba(255,255,255,0.08)"
        stroke="rgba(255,255,255,0.95)"
        strokeWidth={4.5}
        strokeLinejoin="round"
        onPointerDown={(event) => startDrag(event, "move")}
      />
      {zones.map((zone) => {
        const zoneCorners = getZoneRectPoints(zone, center, widthPx, heightPx, element.rotationDeg);
        const labelPoint = getZoneLabelPoint(zone, center, widthPx, heightPx, element.rotationDeg);

        return (
          <g key={zone.id}>
            <polygon
              points={zoneCorners.map((point) => `${point.x},${point.y}`).join(" ")}
              fill={hexToRgba(zone.color ?? "#22c55e", selected ? 0.2 : 0.13)}
              stroke={hexToRgba(zone.color ?? "#22c55e", selected ? 0.75 : 0.45)}
              strokeWidth={selected ? 1.4 : 0.9}
              className="pointer-events-none"
            />
            {selected ? (
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none text-[10px] font-semibold"
                fill="rgba(255,255,255,0.9)"
                stroke="rgba(3,7,18,0.72)"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {zone.label}
              </text>
            ) : null}
          </g>
        );
      })}
      {markings.map((marking, i) => (
        <polyline
          key={i}
          points={marking.points
            .map(({ xM, yM }) => {
              const p = rotatePoint(
                center.x + xM / metersPerPixel,
                center.y + yM / metersPerPixel,
                center.x,
                center.y,
                element.rotationDeg,
              );
              return `${p.x},${p.y}`;
            })
            .join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.80)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none"
        />
      ))}
      <polygon
        points={corners.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke={selected ? "rgba(5,10,20,0.75)" : "rgba(255,255,255,0.55)"}
        strokeWidth={selected ? 1 : 2}
        strokeDasharray={selected ? "6 4" : "none"}
      />
      {selected
        ? corners.map((point, index) => (
            <circle
              key={`${element.id}-${index}`}
              cx={point.x}
              cy={point.y}
              r={6}
              className="pointer-events-auto cursor-nwse-resize"
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth={2.5}
              onPointerDown={(event) => startDrag(event, "resize", index)}
            />
          ))
        : null}
      {selected ? (
        <>
          <line
            x1={center.x}
            y1={center.y}
            x2={topCenter.x}
            y2={topCenter.y}
            stroke="rgba(245,158,11,0.95)"
            strokeWidth={1.6}
          />
          <rect
            x={topCenter.x - 6}
            y={topCenter.y - 6}
            width={10}
            height={10}
            className="pointer-events-auto cursor-grab"
            fill="#f59e0b"
            stroke="#ffffff"
            strokeWidth={1.6}
            transform={`rotate(${element.rotationDeg} ${topCenter.x} ${topCenter.y})`}
            onPointerDown={(event) => startDrag(event, "rotate")}
          />
        </>
      ) : null}
    </g>
  );
}

function PinElementShape({
  element,
  map,
  selected,
  onSelect,
  onElementInteraction,
  onChange,
}: {
  element: PinMapElement;
  map: ReturnType<typeof useMap>;
  selected: boolean;
  onSelect: (id: string | null) => void;
  onElementInteraction: () => void;
  onChange: (element: PinMapElement) => void;
}) {
  const point = map.latLngToContainerPoint([element.position.lat, element.position.lon]);
  const isBench = element.type === "bench";
  const fill = isBench ? "#1d4ed8" : "#dc2626";

  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onElementInteraction();
    onSelect(element.id);

    const handleMove = (moveEvent: PointerEvent) => {
      const pointer = clientToContainerPoint(map, moveEvent.clientX, moveEvent.clientY);
      const next = map.containerPointToLatLng([pointer.x, pointer.y]);
      onChange({ ...element, position: { lat: next.lat, lon: next.lng } });
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  return (
    <g className="pointer-events-auto cursor-move" onPointerDown={startDrag}>
      <circle cx={point.x} cy={point.y} r={10} fill="#ffffff" opacity={0.94} />
      <circle cx={point.x} cy={point.y} r={6} fill={fill} opacity={0.98} />
      {isBench ? (
        <circle
          cx={point.x}
          cy={point.y}
          r={selected ? 15 : 12}
          fill="none"
          stroke="#ffffff"
          strokeWidth={selected ? 2.5 : 1.75}
          opacity={selected ? 0.9 : 0.55}
        />
      ) : (
        <>
          <circle
            cx={point.x}
            cy={point.y}
            r={selected ? 15 : 12}
            fill="none"
            stroke="#ffffff"
            strokeWidth={selected ? 2.5 : 1.75}
            opacity={selected ? 0.9 : 0.55}
          />
          <circle
            cx={point.x}
            cy={point.y}
            r={selected ? 20 : 16}
            fill="none"
            stroke={fill}
            strokeWidth={1.6}
            opacity={selected ? 0.6 : 0.32}
          />
        </>
      )}
    </g>
  );
}

function clientToContainerPoint(map: ReturnType<typeof useMap>, clientX: number, clientY: number) {
  const rect = map.getContainer().getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function getMetersPerPixel(lat: number, zoom: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

function getRectCornerLocal(cornerIndex: number, width: number, height: number) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];

  return corners[cornerIndex] ?? corners[0];
}

function getRotatedRectPoints(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  rotationDeg: number,
) {
  return [
    rotatePoint(centerX - width / 2, centerY - height / 2, centerX, centerY, rotationDeg),
    rotatePoint(centerX + width / 2, centerY - height / 2, centerX, centerY, rotationDeg),
    rotatePoint(centerX + width / 2, centerY + height / 2, centerX, centerY, rotationDeg),
    rotatePoint(centerX - width / 2, centerY + height / 2, centerX, centerY, rotationDeg),
  ];
}

function getZoneRectPoints(
  zone: FieldZone,
  center: { x: number; y: number },
  width: number,
  height: number,
  rotationDeg: number,
) {
  const left = center.x + (zone.x0 - 0.5) * width;
  const right = center.x + (zone.x1 - 0.5) * width;
  const top = center.y + (zone.y0 - 0.5) * height;
  const bottom = center.y + (zone.y1 - 0.5) * height;

  return [
    rotatePoint(left, top, center.x, center.y, rotationDeg),
    rotatePoint(right, top, center.x, center.y, rotationDeg),
    rotatePoint(right, bottom, center.x, center.y, rotationDeg),
    rotatePoint(left, bottom, center.x, center.y, rotationDeg),
  ];
}

function getZoneLabelPoint(
  zone: FieldZone,
  center: { x: number; y: number },
  width: number,
  height: number,
  rotationDeg: number,
) {
  return rotatePoint(
    center.x + ((zone.x0 + zone.x1) / 2 - 0.5) * width,
    center.y + ((zone.y0 + zone.y1) / 2 - 0.5) * height,
    center.x,
    center.y,
    rotationDeg,
  );
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

function hexToRgba(hex: string, alpha: number) {
  const parsed = parseHexColor(hex);
  if (!parsed) return `rgba(34,197,94,${alpha})`;
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${alpha})`;
}

function BasemapStyleControl({
  value,
  styles,
  hasApiKey,
  onChange,
}: {
  value: MapBasemapStyle;
  styles: MapBasemapStyle[];
  hasApiKey: boolean;
  onChange: (style: MapBasemapStyle) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute bottom-4 left-4 z-[900]">
      <div className="relative">
        <button
          type="button"
          className="rounded-lg border border-border/55 bg-background/85 px-2.5 py-1.5 text-[10px] font-semibold text-foreground shadow-lg backdrop-blur transition hover:border-primary/70"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label="Choose map style"
        >
          {BASEMAPS[value].label}
        </button>

        {open ? (
          <div className="absolute bottom-full left-0 mb-2 w-32 overflow-hidden rounded-lg border border-border/55 bg-background/95 p-1 shadow-xl backdrop-blur">
            {styles.map((style) => (
              <button
                key={style}
                type="button"
                className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[10px] font-medium transition ${
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
              <div className="border-t border-border/60 px-2.5 py-1.5 text-[8px] leading-snug text-muted-foreground">
                Set VITE_MAPTILER_API_KEY to load MapTiler tiles.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StreakStartPreview({
  points,
  segments,
  lineColor,
}: {
  points: SessionPoint[];
  segments: SessionSegment[];
  lineColor: string;
}) {
  return (
    <>
      {segments.flatMap((segment) => {
        const previewPoints = getSegmentStartPreviewPoints(points, segment);
        if (previewPoints.length < 2) return [];

        return previewPoints.slice(1).map((point, index) => {
          const previous = previewPoints[index];
          const elapsedS = getElapsedSeconds(previewPoints[0], point);
          const fadeProgress = Math.max(
            0,
            (elapsedS - STREAK_START_PREVIEW_SOLID_SECONDS) /
              Math.max(1, STREAK_START_PREVIEW_FADE_SECONDS - STREAK_START_PREVIEW_SOLID_SECONDS),
          );
          const progress = Math.min(1, fadeProgress);
          const opacity = Math.max(0.72, 0.98 - progress * 0.2);
          const weight = Math.max(2.1, 5.1 - Math.min(1, fadeProgress) * 2.2);
          const branchColor = mixColor(lineColor, "#ffffff", progress * 0.82);

          return (
            <Polyline
              key={`streak-start-${segment.segment_id}-${index}`}
              positions={[
                [previous.lat, previous.lon],
                [point.lat, point.lon],
              ]}
              pathOptions={{
                color: branchColor,
                weight,
                opacity,
              }}
            />
          );
        });
      })}
      {segments.map((segment) => {
        const startPoint = points[segment.start_idx];
        if (!startPoint) return null;

        return (
          <CircleMarker
            key={`streak-start-marker-${segment.segment_id}`}
            center={[startPoint.lat, startPoint.lon]}
            radius={5}
            pathOptions={{
              color: "#ffffff",
              weight: 2.5,
              fillColor: lineColor,
              fillOpacity: 1,
              opacity: 1,
            }}
          />
        );
      })}
    </>
  );
}

function getSegmentStartPreviewPoints(points: SessionPoint[], segment: SessionSegment) {
  const startPoint = points[segment.start_idx];
  if (!startPoint) return [];

  const preview = [startPoint];
  const startTime = new Date(startPoint.t).getTime();
  let distanceM = 0;

  for (
    let index = segment.start_idx + 1;
    index <= segment.end_idx && preview.length < STREAK_START_PREVIEW_MAX_POINTS;
    index += 1
  ) {
    const point = points[index];
    const previous = points[index - 1];
    if (!point || !previous) break;

    const elapsedS = (new Date(point.t).getTime() - startTime) / 1000;
    distanceM += Math.hypot(point.x_m - previous.x_m, point.y_m - previous.y_m);

    if (
      elapsedS > STREAK_START_PREVIEW_FADE_SECONDS ||
      distanceM > STREAK_START_PREVIEW_MAX_METERS
    ) {
      break;
    }

    preview.push(point);
  }

  return preview;
}

function getElapsedSeconds(start: SessionPoint, point: SessionPoint) {
  return (new Date(point.t).getTime() - new Date(start.t).getTime()) / 1000;
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
  const normalized = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function getSessionTrailPoints(
  points: SessionPoint[],
  segments: SessionSegment[],
  playheadIdx: number,
  traceMode: MapDisplayOptions["traceMode"],
) {
  if (traceMode === "none" || traceMode === "heatmap") return null;
  if (traceMode !== "streak") return points.slice(0, playheadIdx + 1);

  const containing = segments.find(
    (segment) => playheadIdx >= segment.start_idx && playheadIdx <= segment.end_idx,
  );
  const tailLength = getDynamicStreakLength(segments, playheadIdx);
  const startIdx = containing ? containing.start_idx : 0;
  return points.slice(Math.max(startIdx, playheadIdx - tailLength + 1), playheadIdx + 1);
}

function getFocusedTrailPoints(
  points: SessionPoint[],
  selectedSegment: SessionSegment,
  playbackIdx: number,
  traceMode: MapDisplayOptions["traceMode"],
) {
  const endIdx = selectedSegment.start_idx + playbackIdx;
  if (traceMode === "none" || traceMode === "heatmap") return null;
  if (traceMode !== "streak") return points.slice(selectedSegment.start_idx, endIdx + 1);

  const tailLength = Math.min(
    STREAK_POINTS,
    Math.max(
      3,
      Math.round(3 + Math.min(1, playbackIdx / STREAK_LEAD_IN_POINTS) * (STREAK_POINTS - 3)),
    ),
  );
  return points.slice(Math.max(selectedSegment.start_idx, endIdx - tailLength + 1), endIdx + 1);
}

function getDynamicStreakLength(segments: SessionSegment[], playheadIdx: number) {
  const containing = segments.find(
    (segment) => playheadIdx >= segment.start_idx && playheadIdx <= segment.end_idx,
  );
  if (containing) {
    const progressFromStart = playheadIdx - containing.start_idx;
    return Math.min(
      STREAK_POINTS,
      Math.max(
        3,
        Math.round(
          3 + Math.min(1, progressFromStart / STREAK_LEAD_IN_POINTS) * (STREAK_POINTS - 3),
        ),
      ),
    );
  }

  const nextSegment = segments.find((segment) => segment.start_idx > playheadIdx);
  if (!nextSegment) return STREAK_POINTS;

  const pointsUntilStart = nextSegment.start_idx - playheadIdx;
  if (pointsUntilStart > STREAK_LEAD_IN_POINTS) return STREAK_POINTS;

  return Math.max(
    3,
    Math.round(3 + (pointsUntilStart / STREAK_LEAD_IN_POINTS) * (STREAK_POINTS - 3)),
  );
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

function buildHeatmapCells(points: SessionPoint[], map: ReturnType<typeof useMap>, cellPx: number) {
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
    <div className="rounded-lg border border-border/55 bg-background/85 px-2.5 py-1.5 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[8px] font-medium uppercase tracking-wider text-muted-foreground">
          {isSpeed ? "Speed heat" : "Occupancy heat"}
        </span>
        <span className="text-[8px] text-muted-foreground">Tint</span>
      </div>
      <div
        className="mt-1.5 h-1.5 rounded-full border border-white/15"
        style={{ background: gradient }}
      />
      <div className="mt-1 flex items-center justify-between text-[8px] text-muted-foreground">
        <span>{isSpeed ? "Slow" : "Brief"}</span>
        <span>{isSpeed ? "Fast" : "Frequent"}</span>
      </div>
    </div>
  );
}

function getBrightHeatmapGradientStops(lineColor: MapLineColor) {
  const [light, base, dark] = getMapSingleColorGradientStops(lineColor);

  return [mixHex(light, base, 0.28), mixHex(light, base, 0.74), mixHex(base, dark, 0.38)];
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
    <div className="rounded-lg border border-border/55 bg-background/85 px-2.5 py-1.5 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[8px] font-medium uppercase tracking-wider text-muted-foreground">
          Speed color
        </span>
        <span className="text-[8px] text-muted-foreground">
          {displayOptions.gradientMode === "single" ? "Tint" : "Range"}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 rounded-full border border-white/15"
        style={{ background: gradient }}
      />
      <div className="mt-1 flex items-center justify-between text-[8px] text-muted-foreground">
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
