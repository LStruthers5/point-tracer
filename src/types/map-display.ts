export type MapTraceMode = "full" | "streak" | "none" | "heatmap";
export type MapColorMode = "solid" | "speed";
export type MapGradientMode = "multi" | "single";
export type MapLineColor = "green" | "cyan" | "amber" | "rose";
export type MapHeatmapMode = "occupancy" | "speed";
export type MapBasemapStyle = "street" | "satellite" | "dark";

export interface MapDisplayOptions {
  traceMode: MapTraceMode;
  colorMode: MapColorMode;
  gradientMode: MapGradientMode;
  lineColor: MapLineColor;
  heatmapMode: MapHeatmapMode;
}

export interface MultiplayerParticipantDisplayOptions {
  visible: boolean;
  label: string;
  showLabel: boolean;
  traceMode: MapTraceMode;
  lineColor: MapLineColor;
}

export const MAP_LINE_COLORS: Record<MapLineColor, string> = {
  green: "#58bf79",
  cyan: "#38bdf8",
  amber: "#f59e0b",
  rose: "#fb7185",
};

export const MAP_LINE_LIGHT_COLORS: Record<MapLineColor, string> = {
  green: "#dcfce7",
  cyan: "#cffafe",
  amber: "#fef3c7",
  rose: "#ffe4e6",
};

export const MAP_LINE_DARK_COLORS: Record<MapLineColor, string> = {
  green: "#166534",
  cyan: "#0e7490",
  amber: "#92400e",
  rose: "#9f1239",
};

export function getMapSingleColorGradientStops(lineColor: MapLineColor) {
  return [
    MAP_LINE_LIGHT_COLORS[lineColor],
    MAP_LINE_COLORS[lineColor],
    MAP_LINE_DARK_COLORS[lineColor],
  ];
}

export function getMapSpeedGradientStops(options: MapDisplayOptions) {
  if (options.gradientMode === "single") {
    return getMapSingleColorGradientStops(options.lineColor);
  }

  return ["#38bdf8", "#58bf79", "#f59e0b", "#ef4444"];
}
