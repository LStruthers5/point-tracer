import type { CourtTemplate } from "@/lib/court-templates";
import type { FieldMapElement, FieldZone, FieldZoneSet } from "@/types/map-elements";
import type { SessionPoint } from "@/types/session";

const ZONE_COLORS = [
  "#22c55e",
  "#38bdf8",
  "#f59e0b",
  "#f472b6",
  "#a78bfa",
  "#fb7185",
  "#2dd4bf",
  "#eab308",
];

export interface FieldZoneStat {
  zone: FieldZone;
  timeS: number;
  distanceM: number;
  avgSpeedMps: number | null;
  topSpeedMps: number | null;
  pointCount: number;
  percentZoneTime: number;
}

export interface FieldZoneStats {
  fieldLabel: string;
  zoneSetLabel: string;
  totalZoneTimeS: number;
  zones: FieldZoneStat[];
}

export function getDefaultZoneSet(template?: CourtTemplate): FieldZoneSet | undefined {
  if (template === "ultimate") {
    return withZoneDefaults({
      id: "ultimate-lanes",
      label: "Ultimate lanes",
      zones: [
        { id: "left-end-zone", label: "Left end zone", x0: 0, x1: 0.18, y0: 0, y1: 1 },
        { id: "left-lane", label: "Left lane", x0: 0.18, x1: 0.82, y0: 0, y1: 1 / 3 },
        { id: "middle-stack", label: "Middle stack", x0: 0.18, x1: 0.82, y0: 1 / 3, y1: 2 / 3 },
        { id: "right-lane", label: "Right lane", x0: 0.18, x1: 0.82, y0: 2 / 3, y1: 1 },
        { id: "right-end-zone", label: "Right end zone", x0: 0.82, x1: 1, y0: 0, y1: 1 },
      ],
    });
  }

  if (template === "soccer") {
    return buildLengthThirdsZoneSet("Soccer thirds", [
      "Defensive third",
      "Middle third",
      "Attacking third",
    ]);
  }

  if (template === "basketball") {
    return buildLengthThirdsZoneSet("Court thirds", ["Backcourt", "Middle", "Frontcourt"]);
  }

  return undefined;
}

export function buildZoneSetFromPrompt(prompt: string, template?: CourtTemplate): FieldZoneSet {
  const normalized = prompt.trim();
  const lower = normalized.toLowerCase();
  const customLabels = extractCustomLabels(normalized);

  if (customLabels.length >= 2) {
    return buildEqualZoneSet(
      "Custom zones",
      customLabels,
      lower.includes("horizontal") || lower.includes("sideline"),
    );
  }

  const wantsEndZones = lower.includes("end zone") || lower.includes("endzone");
  const wantsLanes =
    lower.includes("lane") ||
    lower.includes("left") ||
    lower.includes("right") ||
    lower.includes("middle stack") ||
    lower.includes("third");

  if (template === "ultimate" && (wantsEndZones || wantsLanes)) {
    const zones: FieldZone[] = [];
    if (wantsEndZones) {
      zones.push(
        { id: "left-end-zone", label: "Left end zone", x0: 0, x1: 0.18, y0: 0, y1: 1 },
        { id: "right-end-zone", label: "Right end zone", x0: 0.82, x1: 1, y0: 0, y1: 1 },
      );
    }
    if (wantsLanes) {
      zones.push(
        { id: "left-lane", label: "Left lane", x0: 0.18, x1: 0.82, y0: 0, y1: 1 / 3 },
        { id: "middle-stack", label: "Middle stack", x0: 0.18, x1: 0.82, y0: 1 / 3, y1: 2 / 3 },
        { id: "right-lane", label: "Right lane", x0: 0.18, x1: 0.82, y0: 2 / 3, y1: 1 },
      );
    }

    return withZoneDefaults({
      id: "prompt-ultimate",
      label: "Prompt zones",
      prompt: normalized,
      zones,
    });
  }

  if (lower.includes("quarter")) {
    return buildEqualZoneSet(
      "Quarter lanes",
      ["Far left", "Left middle", "Right middle", "Far right"],
      true,
      normalized,
    );
  }

  if (lower.includes("half")) {
    return buildEqualZoneSet("Halves", ["Left half", "Right half"], true, normalized);
  }

  if (lower.includes("attacking") || lower.includes("defensive") || lower.includes("length")) {
    return buildLengthThirdsZoneSet(
      "Length thirds",
      ["Defensive third", "Middle third", "Attacking third"],
      normalized,
    );
  }

  if (wantsLanes) {
    return buildEqualZoneSet(
      "Lane thirds",
      ["Left lane", "Middle", "Right lane"],
      true,
      normalized,
    );
  }

  return (
    getDefaultZoneSet(template) ??
    buildEqualZoneSet("Lane thirds", ["Left lane", "Middle", "Right lane"], true, normalized)
  );
}

export function buildFieldZoneStats(
  points: SessionPoint[],
  field: FieldMapElement,
): FieldZoneStats | null {
  const zones = field.zoneSet?.zones ?? [];
  if (points.length < 2 || zones.length === 0) return null;

  const stats = zones.map((zone) => ({
    zone,
    timeS: 0,
    distanceM: 0,
    topSpeedMps: null as number | null,
    pointCount: 0,
  }));

  points.slice(0, -1).forEach((point, index) => {
    const nextPoint = points[index + 1];
    if (!nextPoint) return;

    const local = pointToFieldNormalized(point, field);
    const stat = stats.find(({ zone }) => isPointInZone(local, zone));
    if (!stat) return;

    const durationS = Math.max(0, secondsBetween(point, nextPoint));
    const distanceM = Math.hypot(nextPoint.x_m - point.x_m, nextPoint.y_m - point.y_m);
    const speed =
      point.speed_smooth_mps ?? point.speed_mps ?? (durationS > 0 ? distanceM / durationS : 0);

    stat.timeS += durationS;
    stat.distanceM += distanceM;
    stat.topSpeedMps = stat.topSpeedMps === null ? speed : Math.max(stat.topSpeedMps, speed);
    stat.pointCount += 1;
  });

  const totalZoneTimeS = stats.reduce((sum, stat) => sum + stat.timeS, 0);

  return {
    fieldLabel: field.label,
    zoneSetLabel: field.zoneSet?.label ?? "Field zones",
    totalZoneTimeS,
    zones: stats.map((stat) => ({
      ...stat,
      avgSpeedMps: stat.timeS > 0 ? stat.distanceM / stat.timeS : null,
      percentZoneTime: totalZoneTimeS > 0 ? stat.timeS / totalZoneTimeS : 0,
    })),
  };
}

function buildLengthThirdsZoneSet(label: string, labels: string[], prompt?: string): FieldZoneSet {
  return withZoneDefaults({
    id: slugify(label),
    label,
    prompt,
    zones: labels.map((zoneLabel, index) => ({
      id: slugify(zoneLabel),
      label: zoneLabel,
      x0: index / labels.length,
      x1: (index + 1) / labels.length,
      y0: 0,
      y1: 1,
    })),
  });
}

function buildEqualZoneSet(
  label: string,
  labels: string[],
  splitAcrossWidth: boolean,
  prompt?: string,
): FieldZoneSet {
  const limitedLabels = labels.slice(0, 12);

  return withZoneDefaults({
    id: slugify(label),
    label,
    prompt,
    zones: limitedLabels.map((zoneLabel, index) => {
      const start = index / limitedLabels.length;
      const end = (index + 1) / limitedLabels.length;
      return {
        id: slugify(zoneLabel),
        label: zoneLabel,
        x0: splitAcrossWidth ? 0 : start,
        x1: splitAcrossWidth ? 1 : end,
        y0: splitAcrossWidth ? start : 0,
        y1: splitAcrossWidth ? end : 1,
      };
    }),
  });
}

function withZoneDefaults(zoneSet: FieldZoneSet): FieldZoneSet {
  return {
    ...zoneSet,
    zones: zoneSet.zones.slice(0, 12).map((zone, index) => {
      const x0 = clamp01(Math.min(zone.x0, zone.x1));
      const x1 = clamp01(Math.max(zone.x0, zone.x1));
      const y0 = clamp01(Math.min(zone.y0, zone.y1));
      const y1 = clamp01(Math.max(zone.y0, zone.y1));
      return {
        ...zone,
        id: zone.id || slugify(zone.label),
        x0,
        x1,
        y0,
        y1,
        color: zone.color ?? ZONE_COLORS[index % ZONE_COLORS.length],
      };
    }),
  };
}

function pointToFieldNormalized(point: SessionPoint, field: FieldMapElement) {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = Math.max(
    1,
    Math.cos((field.center.lat * Math.PI) / 180) * metersPerDegreeLat,
  );
  const eastM = (point.lon - field.center.lon) * metersPerDegreeLon;
  const southM = (field.center.lat - point.lat) * metersPerDegreeLat;
  const angle = (-field.rotationDeg * Math.PI) / 180;
  const localX = eastM * Math.cos(angle) - southM * Math.sin(angle);
  const localY = eastM * Math.sin(angle) + southM * Math.cos(angle);

  return {
    x: localX / field.widthM + 0.5,
    y: localY / field.heightM + 0.5,
  };
}

function isPointInZone(point: { x: number; y: number }, zone: FieldZone) {
  return point.x >= zone.x0 && point.x <= zone.x1 && point.y >= zone.y0 && point.y <= zone.y1;
}

function extractCustomLabels(prompt: string) {
  const match = prompt.match(/(?:zones?|areas?|lanes?)\s*:\s*(.+)$/i);
  if (!match) return [];

  return match[1]
    .split(/,|\/|\band\b/gi)
    .map((label) => label.trim())
    .filter((label) => label.length >= 2 && label.length <= 32)
    .slice(0, 12);
}

function secondsBetween(start: SessionPoint, end: SessionPoint) {
  const seconds = (new Date(end.t).getTime() - new Date(start.t).getTime()) / 1000;
  return Number.isFinite(seconds) ? seconds : 0;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
