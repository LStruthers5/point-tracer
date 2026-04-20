import { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { SessionPoint, SessionSegment, SegmentBbox } from "@/types/session";

interface SessionMapClientProps {
  points: SessionPoint[];
  segments: SessionSegment[];
  selectedSegmentId: number | null;
  hoveredSegmentId: number | null;
  showFullRoute: boolean;
}

function FitBounds({ bbox }: { bbox: SegmentBbox }) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(
      [
        [bbox.min_lat, bbox.min_lon],
        [bbox.max_lat, bbox.max_lon],
      ],
      { padding: [40, 40], maxZoom: 18 }
    );
  }, [map, bbox.min_lat, bbox.min_lon, bbox.max_lat, bbox.max_lon]);

  return null;
}

export function SessionMapClient({
  points,
  segments,
  selectedSegmentId,
  hoveredSegmentId,
  showFullRoute,
}: SessionMapClientProps) {
  const fullRoute = points.map((p) => [p.lat, p.lon] as [number, number]);

  const activeId = hoveredSegmentId ?? selectedSegmentId;
  const activeSeg = segments.find((s) => s.segment_id === activeId);

  const segmentRoute = activeSeg
    ? points
        .slice(activeSeg.start_idx, activeSeg.end_idx + 1)
        .map((p) => [p.lat, p.lon] as [number, number])
    : null;

  const bbox: SegmentBbox =
    activeSeg && !showFullRoute
      ? activeSeg.bbox
      : {
          min_lat: Math.min(...points.map((p) => p.lat)),
          min_lon: Math.min(...points.map((p) => p.lon)),
          max_lat: Math.max(...points.map((p) => p.lat)),
          max_lon: Math.max(...points.map((p) => p.lon)),
        };

  const [animating, setAnimating] = useState(false);
  const [animIdx, setAnimIdx] = useState(0);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAnimation = useCallback(() => {
    if (!segmentRoute || segmentRoute.length < 2) return;

    setAnimating(true);
    setAnimIdx(2);

    if (animRef.current) clearInterval(animRef.current);

    animRef.current = setInterval(() => {
      setAnimIdx((prev) => {
        if (prev >= (segmentRoute?.length ?? 0)) {
          if (animRef.current) clearInterval(animRef.current);
          setAnimating(false);
          return prev;
        }
        return prev + 1;
      });
    }, 80);
  }, [segmentRoute]);

  useEffect(() => {
    return () => {
      if (animRef.current) clearInterval(animRef.current);
    };
  }, []);

  useEffect(() => {
    setAnimating(false);
    setAnimIdx(0);
    if (animRef.current) clearInterval(animRef.current);
  }, [activeId]);

  const animatedRoute =
    animating && segmentRoute ? segmentRoute.slice(0, animIdx) : null;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <MapContainer
        center={[points[0]?.lat ?? 0, points[0]?.lon ?? 0]}
        zoom={17}
        className="h-full w-full"
        zoomControl={true}
        attributionControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />

        <FitBounds bbox={bbox} />

        {showFullRoute && (
          <Polyline
            positions={fullRoute}
            pathOptions={{
              color: "oklch(0.5 0.02 250)",
              weight: 2,
              opacity: 0.4,
            }}
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
                pathOptions={{
                  color: "oklch(0.4 0.02 250)",
                  weight: 2,
                  opacity: 0.25,
                }}
              />
            ))}

        {segmentRoute && !animating && (
          <Polyline
            positions={segmentRoute}
            pathOptions={{
              color: "#58bf79",
              weight: 4,
              opacity: 0.9,
            }}
          />
        )}

        {animatedRoute && animatedRoute.length >= 2 && (
          <Polyline
            positions={animatedRoute}
            pathOptions={{
              color: "#58bf79",
              weight: 4,
              opacity: 1,
            }}
          />
        )}
      </MapContainer>

      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
        {activeSeg && (
          <button
            onClick={startAnimation}
            disabled={animating}
            className={`glass-card cursor-pointer rounded-xl px-3 py-2 text-xs font-medium text-foreground transition-all hover:border-primary/30 ${
              animating ? "pulse-glow" : ""
            }`}
          >
            {animating ? "▶ Playing…" : "▶ Play"}
          </button>
        )}
      </div>
    </div>
  );
}