import { useEffect } from "react";
import type { MapElement } from "@/types/map-elements";
import type { SessionPoint } from "@/types/session";
import { COURT_TEMPLATES } from "@/lib/court-templates";
import { computeFieldZoneBreakdown, findSportField } from "@/lib/field-zones";
import { formatDuration } from "@/lib/format";
import { track } from "@/lib/analytics";

interface FieldZoneStatsProps {
  /** Points to analyze (a segment slice or the whole session). */
  points: SessionPoint[];
  /** Full session points — the x_m/y_m origin reference. */
  sessionPoints: SessionPoint[];
  mapElements: MapElement[];
}

export function FieldZoneStats({ points, sessionPoints, mapElements }: FieldZoneStatsProps) {
  const field = findSportField(mapElements);
  const origin = sessionPoints[0];
  const breakdown = field && origin ? computeFieldZoneBreakdown(points, field, origin) : null;
  const template = field?.template ?? null;
  const hasBreakdown = Boolean(breakdown);

  // Persona signal: the user actually saw zone analytics (not just placed a field).
  useEffect(() => {
    if (hasBreakdown && template) track("field_zone_viewed", { template });
  }, [hasBreakdown, template]);

  if (!field || !breakdown) return null;

  const sportLabel = field.template ? COURT_TEMPLATES[field.template].label : "Field";

  return (
    <div className="glass-card rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Field zones
        </div>
        <div className="text-[10px] text-muted-foreground">{sportLabel}</div>
      </div>

      <div className="space-y-2.5">
        {breakdown.zones.map((zone) => {
          const pct = Math.round(zone.fraction * 100);
          return (
            <div key={zone.id}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-foreground">{zone.label}</span>
                <span className="font-mono text-muted-foreground">
                  {pct}% · {formatDuration(Math.round(zone.seconds))}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary/60">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.max(pct, zone.fraction > 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border/40 pt-2 text-[10px] leading-snug text-muted-foreground">
        Time on the placed {sportLabel.toLowerCase()}, split along its length. Zone direction
        follows how you positioned and rotated the field.
        {breakdown.onFieldFraction < 0.999 ? (
          <> {Math.round((1 - breakdown.onFieldFraction) * 100)}% of tracked time was off the field.</>
        ) : null}
      </div>
    </div>
  );
}
