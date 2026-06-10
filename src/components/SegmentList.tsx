import { useMemo, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Search } from "lucide-react";
import type { SessionSegment } from "@/types/session";
import type { UnitSystem } from "@/types/app-settings";
import { formatDuration, formatDistance, formatSpeed, formatTimeRange } from "@/lib/format";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SegmentSort = "start" | "duration" | "distance" | "speed";
type SortDirection = "asc" | "desc";

interface SegmentListProps {
  segments: SessionSegment[];
  selectedId: number | null;
  hoveredId: number | null;
  units?: UnitSystem;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
}

export function SegmentList({
  segments,
  selectedId,
  hoveredId,
  units = "metric",
  onSelect,
  onHover,
}: SegmentListProps) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SegmentSort>("start");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const visibleSegments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return [...segments]
      .filter((seg) => {
        if (!normalizedQuery) return true;

        return [
          seg.label,
          formatDuration(seg.duration_s),
          formatDistance(seg.distance_m, units),
          formatSpeed(seg.mean_speed_mps, units),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        const direction = sortDirection === "asc" ? 1 : -1;
        const first = getSortValue(a, sortBy);
        const second = getSortValue(b, sortBy);

        return (first - second) * direction;
      });
  }, [query, segments, sortBy, sortDirection, units]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Segments
        </div>
        <div className="text-[10px] font-mono text-muted-foreground">
          {visibleSegments.length}/{segments.length}
        </div>
      </div>
      <div className="space-y-2 pb-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find segment"
            aria-label="Find segment"
            className="h-8 rounded-lg border-border/70 bg-secondary/35 pl-8 text-xs"
          />
        </div>
        <div className="flex gap-2">
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SegmentSort)}>
            <SelectTrigger
              aria-label="Sort segments by"
              className="h-8 rounded-lg border-border/70 bg-secondary/35 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start">Start time</SelectItem>
              <SelectItem value="duration">Duration</SelectItem>
              <SelectItem value="distance">Distance</SelectItem>
              <SelectItem value="speed">Avg speed</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
            aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
            title={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-secondary/35 text-muted-foreground transition-colors hover:text-foreground"
          >
            {sortDirection === "asc" ? (
              <ArrowDownAZ className="h-3.5 w-3.5" />
            ) : (
              <ArrowUpAZ className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      {visibleSegments.length === 0 ? (
        <div className="glass-card rounded-xl p-4 text-center text-xs text-muted-foreground">
          No matching segments
        </div>
      ) : null}
      {visibleSegments.map((seg, index) => (
        <button
          key={seg.segment_id}
          onClick={() => onSelect(seg.segment_id)}
          onMouseEnter={() => onHover(seg.segment_id)}
          onMouseLeave={() => onHover(null)}
          style={{ animationDelay: `${index * 35}ms` }}
          className={`segment-card segment-animate w-full text-left glass-card rounded-xl p-3.5 cursor-pointer transition-all ${
            selectedId === seg.segment_id ? "active" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-foreground">{seg.label}</span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {seg.point_count} pts
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{formatDuration(seg.duration_s)}</span>
            <span className="text-border">•</span>
            <span>{formatDistance(seg.distance_m, units)}</span>
          </div>
          <div className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
            {formatTimeRange(seg.start_time, seg.end_time)}
          </div>
        </button>
      ))}
    </div>
  );
}

function getSortValue(segment: SessionSegment, sortBy: SegmentSort): number {
  if (sortBy === "duration") return segment.duration_s;
  if (sortBy === "distance") return segment.distance_m;
  if (sortBy === "speed") return segment.mean_speed_mps;

  return new Date(segment.start_time).getTime();
}
