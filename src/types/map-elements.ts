import type { CourtTemplate } from "@/lib/court-templates";

export type { CourtTemplate };

export type MapElementType = "field" | "bench" | "focal";

export interface MapElementBase {
  id: string;
  type: MapElementType;
  label: string;
}

export interface FieldMapElement extends MapElementBase {
  type: "field";
  center: {
    lat: number;
    lon: number;
  };
  widthM: number;
  heightM: number;
  rotationDeg: number;
  /** Sport-specific court/field template. Undefined = generic blank field. */
  template?: CourtTemplate;
}

export interface PinMapElement extends MapElementBase {
  type: "bench" | "focal";
  position: {
    lat: number;
    lon: number;
  };
}

export type MapElement = FieldMapElement | PinMapElement;
