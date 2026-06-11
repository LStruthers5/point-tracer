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
  onlySegmentedActivity: boolean;
  lineColorMode: LineColorMode;
  lineColor: MapLineColor;
  showPaceGraph: boolean;
  showHeartRateChart: boolean;
  reducedAnimation: boolean;
  /** Opt-in: share corrected segmentations (incl. the activity GPS track) to improve the model. */
  shareTrainingData: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  units: "imperial",
  theme: "dark",
  defaultPlaybackSpeed: 1,
  defaultTraceMode: "full",
  heatmapMode: "occupancy",
  onlySegmentedActivity: false,
  lineColorMode: "solid",
  lineColor: "green",
  showPaceGraph: true,
  showHeartRateChart: true,
  reducedAnimation: false,
  shareTrainingData: false,
};
