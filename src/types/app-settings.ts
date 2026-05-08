import type { MapHeatmapMode, MapLineColor, MapTraceMode } from "@/types/map-display";

export type UnitSystem = "metric" | "imperial";
export type ThemeMode = "dark" | "light";
export type LineColorMode = "solid" | "multi-gradient" | "single-gradient";

export interface AppSettings {
  units: UnitSystem;
  theme: ThemeMode;
  defaultPlaybackSpeed: number;
  defaultTraceMode: MapTraceMode;
  heatmapMode: MapHeatmapMode;
  showInactiveSegments: boolean;
  lineColorMode: LineColorMode;
  lineColor: MapLineColor;
  showPaceGraph: boolean;
  reducedAnimation: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  units: "imperial",
  theme: "dark",
  defaultPlaybackSpeed: 1,
  defaultTraceMode: "full",
  heatmapMode: "occupancy",
  showInactiveSegments: true,
  lineColorMode: "solid",
  lineColor: "green",
  showPaceGraph: true,
  reducedAnimation: false,
};
