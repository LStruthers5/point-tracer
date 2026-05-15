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
}

export interface PinMapElement extends MapElementBase {
  type: "bench" | "focal";
  position: {
    lat: number;
    lon: number;
  };
}

export type MapElement = FieldMapElement | PinMapElement;
