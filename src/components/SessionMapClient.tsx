import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Pane, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { SessionPoint, SessionSegment, SegmentBbox } from "@/types/session";
import type { MapDisplayOptions } from "@/types/map-display";
import { getMapSpeedGradientStops, MAP_LINE_COLORS } from "@/types/map-display";
import type { UnitSystem } from "@/types/app-settings";
import { formatSpeed } from "@/lib/format";

const DEFAULT_ZOOM = 17;
const SESSION_FIT_MAX_ZOOM = 18;
const FOCUSED_FIT_MAX_ZOOM = 22;
const MAP_MAX_ZOOM = 22;
const TILE_NATIVE_MAX_ZOOM = 20;
const STREAK_POINTS = 48;

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
  showInactiveSegments: boolean;
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
  showInactiveSegments,
  reducedAnimation,
}: SessionMapClientProps) {
  const fullRoute = points.map((p) => [p.lat, p.lon] as [number, number]);
  const lineColor = MAP_LINE_COLORS[displayOptions.lineColor];

  const activeId = hoveredSegmentId ?? selectedSegmentId;
  const activeSeg = segments.find((s) => s.segment_id === activeId);
  const selectedSeg = segments.find((s) => s.segment_id === selectedSegmentId);
  const focused = Boolean(activeSeg && !showFullRoute);

  const segmentRoute = activeSeg
    ? points
        .slice(activeSeg.start_idx, activeSeg.end_idx + 1)
        .map((p) => [p.lat, p.lon] as [number, number])
    : null;

  const bbox: SegmentBbox =
    focused && activeSeg
      ? activeSeg.bbox
      : {
          min_lat: Math.min(...points.map((p) => p.lat)),
          min_lon: Math.min(...points.map((p) => p.lon)),
          max_lat: Math.max(...points.map((p) => p.lat)),
          max_lon: Math.max(...points.map((p) => p.lon)),
        };

  const playbackTrailPoints =
    showFullRoute && sessionPlaybackIdx != null && sessionPlaybackIdx >= 1
      ? getSessionTrailPoints(points, sessionPlaybackIdx, displayOptions.traceMode)
      : selectedSeg && playbackIdx != null && playbackIdx >= 1
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
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          maxZoom={MAP_MAX_ZOOM}
          maxNativeZoom={TILE_NATIVE_MAX_ZOOM}
        />

        <FitBounds bbox={bbox} focused={focused} />

        {showFullRoute &&
        displayOptions.traceMode !== "streak" &&
        displayOptions.colorMode === "speed" ? (
          <SpeedGradientRoute
            points={points}
            weight={2}
            opacity={playbackActive && displayOptions.traceMode === "fade" ? 0.12 : 0.35}
            displayOptions={displayOptions}
          />
        ) : showFullRoute && displayOptions.traceMode !== "streak" ? (
          <Polyline
            positions={fullRoute}
            pathOptions={{
              color: lineColor,
              weight: 2,
              opacity: playbackActive && displayOptions.traceMode === "fade" ? 0.12 : 0.35,
            }}
          />
        ) : null}

        {!showFullRoute &&
          showInactiveSegments &&
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

        {segmentRoute && (
          <Polyline
            positions={segmentRoute}
            pathOptions={{
              color: lineColor,
              weight: 4,
              opacity: playbackTrail ? 0.35 : 0.9,
            }}
          />
        )}

        {playbackTrailPoints && displayOptions.colorMode === "speed" ? (
          <SpeedGradientRoute
            points={playbackTrailPoints}
            weight={5}
            opacity={1}
            displayOptions={displayOptions}
          />
        ) : playbackTrail && playbackTrail.length >= 2 ? (
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

      {playbackPoint ? (
        <div className="pointer-events-none absolute right-4 top-4 z-[900] w-40 space-y-2">
          <div className="rounded-xl border border-border/55 bg-background/85 px-3 py-2 shadow-lg backdrop-blur">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Current pace
            </div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">
              {formatNullableSpeed(currentSpeedMps, units)}
            </div>
          </div>
          {displayOptions.colorMode === "speed" ? (
            <MapSpeedLegend displayOptions={displayOptions} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getSessionTrailPoints(
  points: SessionPoint[],
  playheadIdx: number,
  traceMode: MapDisplayOptions["traceMode"],
) {
  if (traceMode !== "streak") return points.slice(0, playheadIdx + 1);

  return points.slice(Math.max(0, playheadIdx - STREAK_POINTS), playheadIdx + 1);
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
