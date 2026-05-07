export type MapTraceMode = "full" | "fade" | "streak";
export type MapColorMode = "solid" | "speed";
export type MapGradientMode = "multi" | "single";
export type MapLineColor = "green" | "cyan" | "amber" | "rose";

export interface MapDisplayOptions {
  traceMode: MapTraceMode;
  colorMode: MapColorMode;
  gradientMode: MapGradientMode;
  lineColor: MapLineColor;
}

export const MAP_LINE_COLORS: Record<MapLineColor, string> = {
  green: "#58bf79",
  cyan: "#38bdf8",
  amber: "#f59e0b",
  rose: "#fb7185",
};

const MAP_LINE_DARK_COLORS: Record<MapLineColor, string> = {
  green: "#166534",
  cyan: "#0e7490",
  amber: "#92400e",
  rose: "#9f1239",
};

export function getMapSpeedGradientStops(options: MapDisplayOptions) {
  if (options.gradientMode === "single") {
    return ["#f8fafc", MAP_LINE_COLORS[options.lineColor], MAP_LINE_DARK_COLORS[options.lineColor]];
  }

  return ["#38bdf8", "#58bf79", "#f59e0b", "#ef4444"];
}
