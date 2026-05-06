import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { SessionPoint, SessionSegment, SegmentBbox } from "@/types/session";

const DEFAULT_ZOOM = 17;
const SESSION_FIT_MAX_ZOOM = 18;
const FOCUSED_FIT_MAX_ZOOM = 22;
const MAP_MAX_ZOOM = 22;
const TILE_NATIVE_MAX_ZOOM = 20;

interface SessionMapClientProps {
  points: SessionPoint[];
  segments: SessionSegment[];
  selectedSegmentId: number | null;
  hoveredSegmentId: number | null;
  showFullRoute: boolean;
  playbackIdx?: number | null;
  sessionPlaybackIdx?: number | null;
  playbackActive?: boolean;
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
}: SessionMapClientProps) {
  const fullRoute = points.map((p) => [p.lat, p.lon] as [number, number]);

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

  const playbackTrail =
    showFullRoute && sessionPlaybackIdx != null && sessionPlaybackIdx >= 1
      ? points.slice(0, sessionPlaybackIdx + 1).map((p) => [p.lat, p.lon] as [number, number])
      : selectedSeg && playbackIdx != null && playbackIdx >= 1
        ? points
            .slice(selectedSeg.start_idx, selectedSeg.start_idx + playbackIdx + 1)
            .map((p) => [p.lat, p.lon] as [number, number])
        : null;

  const playbackPoint =
    showFullRoute && sessionPlaybackIdx != null
      ? points[sessionPlaybackIdx]
      : selectedSeg && playbackIdx != null
        ? points[selectedSeg.start_idx + playbackIdx]
        : null;

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

        {showFullRoute && (
          <Polyline
            positions={fullRoute}
            pathOptions={{ color: "oklch(0.5 0.02 250)", weight: 2, opacity: 0.4 }}
          />
        )}

        {!showFullRoute &&
          segments
            .filter((s) => s.segment_id !== activeId)
            .map((s) => (
              <Polyline
                key={s.segment_id}
                positions={points
                  .slice(s.start_idx, s.end_idx + 1)
                  .map((p) => [p.lat, p.lon] as [number, number])}
                pathOptions={{ color: "oklch(0.4 0.02 250)", weight: 2, opacity: 0.25 }}
              />
            ))}

        {segmentRoute && (
          <Polyline
            positions={segmentRoute}
            pathOptions={{
              color: "#58bf79",
              weight: 4,
              opacity: playbackTrail ? 0.35 : 0.9,
            }}
          />
        )}

        {playbackTrail && playbackTrail.length >= 2 && (
          <Polyline
            positions={playbackTrail}
            pathOptions={{ color: "#58bf79", weight: 5, opacity: 1 }}
          />
        )}

        {playbackPoint && (
          <CircleMarker
            center={[playbackPoint.lat, playbackPoint.lon]}
            radius={6}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: "#58bf79",
              fillOpacity: 1,
            }}
            className={playbackActive ? "pulse-glow" : ""}
          />
        )}
      </MapContainer>
    </div>
  );
}
