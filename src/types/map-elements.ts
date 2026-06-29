import type { CourtTemplate } from "@/lib/court-templates";

export type { CourtTemplate };

export type MapElementType = "field" | "bench" | "focal";

export interface MapElementBase {
  id: string;
  type: MapElementType;
  label: string;
}

export interface FieldZone {
  id: string;
  label: string;
  /** Normalized rectangle bounds across field width/height. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  color?: string;
}

export interface FieldZoneSet {
  id: string;
  label: string;
  prompt?: string;
  zones: FieldZone[];
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
  zoneSet?: FieldZoneSet;
}

export interface PinMapElement extends MapElementBase {
  type: "bench" | "focal";
  position: {
    lat: number;
    lon: number;
  };
}

export type MapElement = FieldMapElement | PinMapElement;
