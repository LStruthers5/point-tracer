export type CourtTemplate = "generic" | "soccer" | "basketball" | "ultimate" | "tennis" | "squash";

export interface MarkingPolyline {
  points: Array<{ xM: number; yM: number }>;
}

/**
 * A field zone, defined as a band along the field's length (the width/x-axis,
 * normalized 0..1 from one end to the other). Used for time-in-zone analytics.
 */
export interface FieldZone {
  id: string;
  label: string;
  /** Start of the band along the length axis (0 = x-min end, 1 = x-max end). */
  uMin: number;
  /** End of the band along the length axis. */
  uMax: number;
}

export interface CourtTemplateSpec {
  label: string;
  description: string;
  /** Width along the x-axis (left-right at rotation=0) in meters. */
  widthM: number;
  /** Height along the y-axis (up-down at rotation=0) in meters. */
  heightM: number;
  markings: MarkingPolyline[];
  /** Sport-specific zones along the length axis, ordered x-min → x-max. */
  zones?: FieldZone[];
}

// ---------------------------------------------------------------------------
// Field zones (per sport) — bands along the length axis (x), ordered x-min→x-max.
// Direction follows how the user placed/rotated the field on the map.
// ---------------------------------------------------------------------------

const soccerZones: FieldZone[] = [
  { id: "third-a", label: "End third", uMin: 0, uMax: 1 / 3 },
  { id: "third-mid", label: "Middle third", uMin: 1 / 3, uMax: 2 / 3 },
  { id: "third-b", label: "Far third", uMin: 2 / 3, uMax: 1 },
];

// Ultimate end zones are 18 m of a 100 m field = 0.18 at each end.
const ultimateZones: FieldZone[] = [
  { id: "endzone-a", label: "End zone", uMin: 0, uMax: 0.18 },
  { id: "central", label: "Central field", uMin: 0.18, uMax: 0.82 },
  { id: "endzone-b", label: "Far end zone", uMin: 0.82, uMax: 1 },
];

const basketballZones: FieldZone[] = [
  { id: "half-a", label: "Backcourt", uMin: 0, uMax: 0.5 },
  { id: "half-b", label: "Frontcourt", uMin: 0.5, uMax: 1 },
];

const tennisZones: FieldZone[] = [
  { id: "half-a", label: "Near half", uMin: 0, uMax: 0.5 },
  { id: "half-b", label: "Far half", uMin: 0.5, uMax: 1 },
];

const squashZones: FieldZone[] = [
  { id: "front", label: "Front court", uMin: 0, uMax: 0.5 },
  { id: "back", label: "Back court", uMin: 0.5, uMax: 1 },
];

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function circlePoints(
  cxM: number,
  cyM: number,
  rM: number,
  steps = 48,
): Array<{ xM: number; yM: number }> {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const rad = (i / steps) * 2 * Math.PI;
    return { xM: cxM + rM * Math.cos(rad), yM: cyM + rM * Math.sin(rad) };
  });
}

/** Arc from startDeg to endDeg (inclusive), sweeping linearly — handles the full range. */
function arcPoints(
  cxM: number,
  cyM: number,
  rM: number,
  startDeg: number,
  endDeg: number,
  steps = 32,
): Array<{ xM: number; yM: number }> {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const deg = startDeg + t * (endDeg - startDeg);
    const rad = (deg * Math.PI) / 180;
    return { xM: cxM + rM * Math.cos(rad), yM: cyM + rM * Math.sin(rad) };
  });
}

function line(
  ...coords: Array<[number, number]>
): MarkingPolyline {
  return { points: coords.map(([xM, yM]) => ({ xM, yM })) };
}

// ---------------------------------------------------------------------------
// Soccer — FIFA standard 105 m × 68 m
// x range: [-52.5, 52.5]  y range: [-34, 34]
// ---------------------------------------------------------------------------

const soccerMarkings: MarkingPolyline[] = [
  // Center line
  line([0, -34], [0, 34]),
  // Center circle
  { points: circlePoints(0, 0, 9.15) },
  // Center spot (tiny circle)
  { points: circlePoints(0, 0, 0.4, 12) },

  // Left penalty area (open toward end line)
  line([-52.5, -20.16], [-36, -20.16], [-36, 20.16], [-52.5, 20.16]),
  // Left goal area
  line([-52.5, -9.16], [-47, -9.16], [-47, 9.16], [-52.5, 9.16]),
  // Left penalty spot
  { points: circlePoints(-41.5, 0, 0.4, 12) },
  // Left penalty arc (outside penalty area; basket from penalty spot, excluding the box portion)
  // Arc center at penalty spot (-41.5, 0), r=9.15, visible from roughly ±131° of the center-facing side
  // The penalty box ends at x=-36; arc intersection: yM = ±sqrt(9.15²-(−41.5−(−36))²) = ±sqrt(83.72−30.25) = ±7.31
  // Angles at those intersection points from (-41.5, 0): atan2(7.31, 5.5) ≈ 53° and atan2(-7.31, 5.5) ≈ -53°
  { points: arcPoints(-41.5, 0, 9.15, -53, 53) },

  // Right penalty area
  line([52.5, -20.16], [36, -20.16], [36, 20.16], [52.5, 20.16]),
  // Right goal area
  line([52.5, -9.16], [47, -9.16], [47, 9.16], [52.5, 9.16]),
  // Right penalty spot
  { points: circlePoints(41.5, 0, 0.4, 12) },
  // Right penalty arc
  { points: arcPoints(41.5, 0, 9.15, 127, 233) },
];

// ---------------------------------------------------------------------------
// Basketball — FIBA standard 28 m × 15 m
// x range: [-14, 14]  y range: [-7.5, 7.5]
// Basket at x = ±(14 − 1.575) = ±12.425, y = 0
// ---------------------------------------------------------------------------

// 3-point arc: radius 6.75 m from basket, corners at y = ±6.6 (0.9 m from sideline ±7.5)
// Left arc: basket at (-12.425, 0), arc from ~102° to ~-102° through 0° (center-court side)
// Right arc: mirror
const leftBasketX = -12.425;
const bballArcR = 6.75;
const bballCornerY = 6.6;
const bballCornerX = leftBasketX - Math.sqrt(bballArcR ** 2 - bballCornerY ** 2); // ≈ -13.84
const bballStartDeg = (Math.atan2(bballCornerY, bballCornerX - leftBasketX) * 180) / Math.PI; // ≈ 102°

const basketballMarkings: MarkingPolyline[] = [
  // Half-court line
  line([0, -7.5], [0, 7.5]),
  // Center circle
  { points: circlePoints(0, 0, 1.8) },

  // Left key (paint) — three sides, open toward end line
  line([-14, -2.45], [-8.2, -2.45], [-8.2, 2.45], [-14, 2.45]),
  // Left free throw semi-circle (center-court side)
  { points: arcPoints(-8.2, 0, 1.8, -90, 90) },
  // Left corner 3-point straights (short lines from end line to arc)
  line([-14, bballCornerY], [bballCornerX, bballCornerY]),
  line([-14, -bballCornerY], [bballCornerX, -bballCornerY]),
  // Left 3-point arc
  { points: arcPoints(leftBasketX, 0, bballArcR, bballStartDeg, -bballStartDeg) },

  // Right key
  line([14, -2.45], [8.2, -2.45], [8.2, 2.45], [14, 2.45]),
  // Right free throw semi-circle (center-court side)
  { points: arcPoints(8.2, 0, 1.8, 90, 270) },
  // Right corner 3-point straights
  line([14, bballCornerY], [-bballCornerX, bballCornerY]),
  line([14, -bballCornerY], [-bballCornerX, -bballCornerY]),
  // Right 3-point arc
  { points: arcPoints(-leftBasketX, 0, bballArcR, 180 - bballStartDeg, 180 + bballStartDeg) },
];

// ---------------------------------------------------------------------------
// Ultimate frisbee — 100 m × 37 m total
// Playing field: 64 m.  End zones: 18 m each end.
// x range: [-50, 50]  y range: [-18.5, 18.5]
// End zone lines at x = ±32 (50 − 18 = 32)
// ---------------------------------------------------------------------------

const ultimateMarkings: MarkingPolyline[] = [
  // Left end zone line
  line([-32, -18.5], [-32, 18.5]),
  // Right end zone line
  line([32, -18.5], [32, 18.5]),
];

// ---------------------------------------------------------------------------
// Tennis doubles — 23.77 m × 10.97 m (doubles)
// x range: [-11.885, 11.885]  y range: [-5.485, 5.485]
// Singles: y = ±4.115  Service line: x = ±6.4  Center service line: y = 0
// ---------------------------------------------------------------------------

const tennisMarkings: MarkingPolyline[] = [
  // Net (at center)
  line([0, -5.485], [0, 5.485]),
  // Singles sidelines
  line([-11.885, -4.115], [11.885, -4.115]),
  line([-11.885, 4.115], [11.885, 4.115]),
  // Service lines (6.4 m each side from net)
  line([-6.4, -4.115], [-6.4, 4.115]),
  line([6.4, -4.115], [6.4, 4.115]),
  // Center service line
  line([-6.4, 0], [6.4, 0]),
];

// ---------------------------------------------------------------------------
// Squash — WSF standard 9.75 m × 6.4 m
// x axis = length (front→back), y axis = width
// x range: [-4.875, 4.875]  y range: [-3.2, 3.2]
// Short line at x = 0.615 (4.26 m from back wall)
// Service box line at x = 2.215 (1.6 m behind short line)
// Half court line: x=[0.615, 4.875] at y=0
// ---------------------------------------------------------------------------

const squashMarkings: MarkingPolyline[] = [
  // Short line (full width)
  line([0.615, -3.2], [0.615, 3.2]),
  // Half court line (from short line to back wall)
  line([0.615, 0], [4.875, 0]),
  // Service box line (1.6 m behind short line, full width of service court)
  line([2.215, -3.2], [2.215, 3.2]),
];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const COURT_TEMPLATES: Record<CourtTemplate, CourtTemplateSpec> = {
  generic: {
    label: "Generic Field",
    description: "Blank field — freely resize and label.",
    widthM: 92,
    heightM: 42,
    markings: [],
  },
  squash: {
    label: "Squash Court",
    description: "WSF standard 9.75 m × 6.4 m with short line and service boxes.",
    widthM: 9.75,
    heightM: 6.4,
    markings: squashMarkings,
    zones: squashZones,
  },
  soccer: {
    label: "Soccer Field",
    description: "FIFA standard 105 m × 68 m with penalty areas and center circle.",
    widthM: 105,
    heightM: 68,
    markings: soccerMarkings,
    zones: soccerZones,
  },
  basketball: {
    label: "Basketball Court",
    description: "FIBA 28 m × 15 m with key, 3-point lines, and free throw arcs.",
    widthM: 28,
    heightM: 15,
    markings: basketballMarkings,
    zones: basketballZones,
  },
  ultimate: {
    label: "Ultimate Field",
    description: "100 m × 37 m with 18 m end zones.",
    widthM: 100,
    heightM: 37,
    markings: ultimateMarkings,
    zones: ultimateZones,
  },
  tennis: {
    label: "Tennis Court",
    description: "Doubles 23.77 m × 10.97 m with service boxes and singles lines.",
    widthM: 23.77,
    heightM: 10.97,
    markings: tennisMarkings,
    zones: tennisZones,
  },
};
