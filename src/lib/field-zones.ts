import type { FieldMapElement } from "@/types/map-elements";
import type { SessionPoint } from "@/types/session";
import { COURT_TEMPLATES, type FieldZone } from "@/lib/court-templates";

const METERS_PER_DEG_LAT = 111_320;
// Ignore gaps larger than this between consecutive points (pauses / dropouts)
// so a single long stop doesn't dominate the zone time.
const MAX_GAP_SECONDS = 30;

export interface ZoneBreakdownEntry {
  id: string;
  label: string;
  seconds: number;
  /** Share of on-field time, 0..1. */
  fraction: number;
}

export interface FieldZoneBreakdown {
  zones: ZoneBreakdownEntry[];
  onFieldSeconds: number;
  offFieldSeconds: number;
  /** On-field share of total tracked time, 0..1. */
  onFieldFraction: number;
}

/**
 * Project a session point into the field's normalized local frame.
 * `u` runs 0→1 along the field length (x-axis at rotation 0); `v` runs 0→1
 * across the width. Values outside [0,1] are off the field. The session
 * origin must be the full session's first point, since x_m/y_m are measured
 * from there.
 */
function projectToField(
  point: SessionPoint,
  field: FieldMapElement,
  origin: SessionPoint,
): { u: number; v: number } {
  const mPerLon = Math.max(
    1,
    Math.cos((origin.lat * Math.PI) / 180) * METERS_PER_DEG_LAT,
  );
  // Field center expressed in the same x_m/y_m frame as the points.
  const fieldX = origin.x_m + (field.center.lon - origin.lon) * mPerLon;
  const fieldY = origin.y_m + (field.center.lat - origin.lat) * METERS_PER_DEG_LAT;

  const dx = point.x_m - fieldX;
  const dy = point.y_m - fieldY;

  // Un-rotate by the field's rotation to recover field-aligned axes.
  const theta = (field.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;

  return {
    u: localX / field.widthM + 0.5,
    v: localY / field.heightM + 0.5,
  };
}

function zoneFor(u: number, v: number, zones: FieldZone[]): FieldZone | null {
  if (v < 0 || v > 1 || u < 0 || u > 1) return null;
  for (const zone of zones) {
    if (u >= zone.uMin && u <= zone.uMax) return zone;
  }
  return null;
}

/**
 * Compute time-in-zone for a slice of points against a placed field overlay.
 * `slicePoints` is the range to analyze (e.g. a segment); `sessionOrigin` is
 * the full session's first point (the x_m/y_m reference). Returns null when the
 * field has no sport template / zones, or there isn't enough data.
 */
export function computeFieldZoneBreakdown(
  slicePoints: SessionPoint[],
  field: FieldMapElement,
  sessionOrigin: SessionPoint,
): FieldZoneBreakdown | null {
  const template = field.template;
  if (!template) return null;
  const zones = COURT_TEMPLATES[template].zones;
  if (!zones || zones.length === 0 || slicePoints.length < 2) return null;

  const seconds: Record<string, number> = {};
  for (const zone of zones) seconds[zone.id] = 0;
  let offFieldSeconds = 0;

  for (let i = 0; i < slicePoints.length - 1; i += 1) {
    const point = slicePoints[i];
    const next = slicePoints[i + 1];
    const dt = (new Date(next.t).getTime() - new Date(point.t).getTime()) / 1000;
    if (!Number.isFinite(dt) || dt <= 0 || dt > MAX_GAP_SECONDS) continue;

    const { u, v } = projectToField(point, field, sessionOrigin);
    const zone = zoneFor(u, v, zones);
    if (zone) {
      seconds[zone.id] += dt;
    } else {
      offFieldSeconds += dt;
    }
  }

  const onFieldSeconds = zones.reduce((total, zone) => total + seconds[zone.id], 0);
  const totalSeconds = onFieldSeconds + offFieldSeconds;
  if (onFieldSeconds <= 0) return null;

  return {
    zones: zones.map((zone) => ({
      id: zone.id,
      label: zone.label,
      seconds: seconds[zone.id],
      fraction: onFieldSeconds > 0 ? seconds[zone.id] / onFieldSeconds : 0,
    })),
    onFieldSeconds,
    offFieldSeconds,
    onFieldFraction: totalSeconds > 0 ? onFieldSeconds / totalSeconds : 0,
  };
}

/** First field element that has a sport template, if any. */
export function findSportField(
  mapElements: Array<{ type: string }>,
): FieldMapElement | null {
  for (const element of mapElements) {
    if (
      element.type === "field" &&
      (element as FieldMapElement).template &&
      (element as FieldMapElement).template !== "generic"
    ) {
      return element as FieldMapElement;
    }
  }
  return null;
}
