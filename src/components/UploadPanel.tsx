import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { UnitSystem } from "@/types/app-settings";
import type { SessionData } from "@/types/session";

const ENDPOINT = "http://127.0.0.1:8000/api/upload/gpx";

const SPORTS = [
  { value: "ultimate", label: "Ultimate" },
  { value: "tennis", label: "Tennis" },
  { value: "running", label: "Running" },
];

type SegmentationMode = "auto" | "distance" | "time" | "manual";

const SEGMENTATION_MODES: Array<{ value: SegmentationMode; label: string }> = [
  { value: "auto", label: "Auto detect" },
  { value: "distance", label: "Distance splits" },
  { value: "time", label: "Time splits" },
  { value: "manual", label: "Manual review" },
];

const METERS_PER_MILE = 1609.344;
const METERS_PER_KILOMETER = 1000;

interface UploadPanelProps {
  onUploaded: (data: SessionData) => void;
  units: UnitSystem;
}

export function UploadPanel({ onUploaded, units }: UploadPanelProps) {
  const [sport, setSport] = useState<string>("ultimate");
  const [segmentationMode, setSegmentationMode] = useState<SegmentationMode>("auto");
  const [splitDistance, setSplitDistance] = useState("1");
  const [splitDurationMinutes, setSplitDurationMinutes] = useState("1");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const distanceUnitLabel = units === "metric" ? "km" : "mi";
  const distanceUnitMeters = units === "metric" ? METERS_PER_KILOMETER : METERS_PER_MILE;

  useEffect(() => {
    setSplitDistance("1");
  }, [units]);

  const handleUpload = async () => {
    if (!file) {
      setError("Please choose a .gpx file first.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("sport", sport);
      form.append("segmentation_mode", segmentationMode);

      if (segmentationMode === "distance") {
        const distance = Number(splitDistance);
        if (!Number.isFinite(distance) || distance <= 0) {
          throw new Error("Split distance must be greater than 0.");
        }
        form.append("split_distance_m", String(distance * distanceUnitMeters));
      }

      if (segmentationMode === "time") {
        const durationMinutes = Number(splitDurationMinutes);
        if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
          throw new Error("Split time must be greater than 0.");
        }
        form.append("split_duration_s", String(durationMinutes * 60));
      }

      const res = await fetch(ENDPOINT, { method: "POST", body: form });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Upload failed (${res.status}) ${text}`.trim());
      }
      const data = (await res.json()) as SessionData;
      onUploaded(data);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-30 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/40 bg-card/30">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mr-1">
        <FileUp className="w-3.5 h-3.5" />
        Upload GPX
      </div>

      <Select value={sport} onValueChange={setSport} disabled={loading}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[2400]">
          {SPORTS.map((s) => (
            <SelectItem key={s.value} value={s.value} className="text-xs">
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/45 px-2 py-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Segments
        </span>
        <Select
          value={segmentationMode}
          onValueChange={(value) => setSegmentationMode(value as SegmentationMode)}
          disabled={loading}
        >
          <SelectTrigger className="h-7 w-36 border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[2400]">
            {SEGMENTATION_MODES.map((mode) => (
              <SelectItem key={mode.value} value={mode.value} className="text-xs">
                {mode.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {segmentationMode === "distance" ? (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Every
            <input
              type="number"
              min="0.01"
              step="0.1"
              value={splitDistance}
              onChange={(event) => setSplitDistance(event.target.value)}
              disabled={loading}
              className="h-7 w-16 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
            />
            {distanceUnitLabel}
          </label>
        ) : null}

        {segmentationMode === "time" ? (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Every
            <input
              type="number"
              min="0.1"
              step="0.5"
              value={splitDurationMinutes}
              onChange={(event) => setSplitDurationMinutes(event.target.value)}
              disabled={loading}
              className="h-7 w-16 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
            />
            min
          </label>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml"
        className="hidden"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setSuccess(false);
          setError(null);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
      >
        {file ? truncate(file.name, 22) : "Choose .gpx"}
      </Button>

      <Button
        type="button"
        size="sm"
        className="h-8 text-xs"
        onClick={handleUpload}
        disabled={loading || !file}
      >
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            <Upload className="w-3.5 h-3.5" />
            Upload
          </>
        )}
      </Button>

      {error && (
        <div className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}
      {success && !error && (
        <div className="flex items-center gap-1.5 text-[11px] text-primary">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Session loaded
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
