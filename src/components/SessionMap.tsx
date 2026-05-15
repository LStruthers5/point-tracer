import { useEffect, useState } from "react";
import type { SessionPoint, SessionSegment } from "@/types/session";
import type { MapBasemapStyle, MapDisplayOptions } from "@/types/map-display";
import type { MapElement } from "@/types/map-elements";
import type { ThemeMode, UnitSystem } from "@/types/app-settings";

interface SessionMapProps {
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
}

type SessionMapClientComponent = React.ComponentType<SessionMapProps>;

export function SessionMap(props: SessionMapProps) {
  const [MapComponent, setMapComponent] = useState<SessionMapClientComponent | null>(null);

  useEffect(() => {
    let mounted = true;

    import("./SessionMapClient").then((mod) => {
      if (mounted) {
        setMapComponent(() => mod.SessionMapClient);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!MapComponent) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-border/30 bg-card">
        <p className="text-sm text-muted-foreground">Loading map…</p>
      </div>
    );
  }

  return <MapComponent {...props} />;
}
