import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileUp,
  RadioTower,
  RefreshCw,
  Unlink,
  CircleHelp,
  ExternalLink,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UnitSystem } from "@/types/app-settings";
import type { SessionData } from "@/types/session";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";
const ENDPOINT = `${API_BASE}/api/upload/gpx`;
const ENABLE_STRAVA_IMPORT = import.meta.env.VITE_ENABLE_STRAVA_IMPORT === "true";

const SPORTS = [
  { value: "ultimate", label: "Ultimate" },
  { value: "soccer", label: "Soccer" },
  { value: "basketball", label: "Basketball" },
  { value: "tennis", label: "Tennis" },
  { value: "squash", label: "Squash" },
  { value: "running", label: "Running" },
];

type SegmentationMode = "auto" | "distance" | "time" | "manual";

const SEGMENTATION_MODES: Array<{ value: SegmentationMode; label: string }> = [
  { value: "auto", label: "Auto detect" },
  { value: "distance", label: "Distance splits" },
  { value: "time", label: "Time splits" },
  { value: "manual", label: "Manual review" },
];

const GPX_EXPORT_GUIDES = [
  {
    id: "strava",
    label: "Strava",
    title: "Export GPX from Strava",
    note: "Works best from the Strava website. You can export your own GPS activities individually.",
    sourceUrl: "https://support.strava.com/hc/en-us/articles/216918437-Exporting-your-Data-and-Bulk-Export",
    steps: [
      "Open strava.com in a browser and go to the activity you want to review.",
      "Use the activity actions menu and choose Export GPX. If you see Export Original instead, that file is usually a FIT file and works too.",
      "Upload the downloaded .gpx or .fit file to PointTracer.",
    ],
  },
  {
    id: "garmin",
    label: "Garmin",
    title: "Export GPX or FIT from Garmin Connect",
    note: "Use Garmin Connect on the web for the cleanest file export flow.",
    sourceUrl: "https://support.garmin.com/",
    steps: [
      "Open connect.garmin.com and select the activity from Activities.",
      "Open the activity settings menu and choose Export to GPX or Export Original.",
      "Upload the downloaded .gpx or original .fit file to PointTracer.",
    ],
  },
  {
    id: "apple",
    label: "Apple",
    title: "Use an Apple workout route",
    note: "Apple's built-in Health export is not a simple GPX/FIT download, so this path often needs an exporter app or a synced service.",
    sourceUrl: "https://support.apple.com/guide/iphone/share-your-health-data-iph27f6325b2/ios",
    steps: [
      "If your Apple Watch workout is synced to Strava, Garmin, or COROS, export the file from that service instead.",
      "If you keep workouts only in Apple Health, use a HealthKit export app that can save the workout as GPX or FIT.",
      "Upload the exported .gpx or .fit file to PointTracer. Avoid uploading Apple's full Health XML archive directly.",
    ],
  },
  {
    id: "coros",
    label: "COROS",
    title: "Export from COROS",
    note: "COROS activity exports are available from the workout details/share flow.",
    sourceUrl: "https://support.coros.com/",
    steps: [
      "Open the COROS app and choose the workout you want to review.",
      "Use the share/export action and select GPX or FIT when available.",
      "Save the file to your device, then upload it to PointTracer.",
    ],
  },
] as const;

const METERS_PER_MILE = 1609.344;
const METERS_PER_KILOMETER = 1000;
// Mirrors MAX_FILE_SIZE_BYTES in backend/app/main.py.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface UploadPanelProps {
  onUploaded: (data: SessionData) => void;
  units: UnitSystem;
}

interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;
  pointtracer_sport: string;
  start_date: string | null;
  distance_m: number | null;
  moving_time_s: number | null;
  elapsed_time_s: number | null;
  has_heartrate?: boolean;
  has_gps_hint?: boolean;
  unsupported_reason?: string | null;
}

interface StravaStatus {
  connected: boolean;
  configured?: boolean;
  athlete?: {
    firstname?: string;
    lastname?: string;
    username?: string;
  };
  missing_scopes?: string[];
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
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaStatus, setStravaStatus] = useState<StravaStatus | null>(null);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaActivities, setStravaActivities] = useState<StravaActivity[]>([]);
  const [stravaPage, setStravaPage] = useState(1);
  const [stravaHasMore, setStravaHasMore] = useState(false);
  const [showStravaPicker, setShowStravaPicker] = useState(false);
  const [stravaImportingId, setStravaImportingId] = useState<number | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const distanceUnitLabel = units === "metric" ? "km" : "mi";
  const distanceUnitMeters = units === "metric" ? METERS_PER_KILOMETER : METERS_PER_MILE;

  useEffect(() => {
    setSplitDistance("1");
  }, [units]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stravaParam = params.get("strava");
    const stravaError = params.get("strava_error");
    if (!ENABLE_STRAVA_IMPORT) {
      if (stravaParam || stravaError) {
        window.history.replaceState({}, "", window.location.pathname);
      }
      return;
    }
    if (stravaParam === "scope_error") {
      setError(
        'Strava connection was declined due to missing permissions. Click "Connect Strava" again and accept all requested scopes.',
      );
    } else if (stravaError === "access_denied") {
      setError(
        "Strava denied the connection. If PointTracer has reached its athlete limit, the app owner needs to request expanded access from Strava.",
      );
    } else if (stravaError) {
      setError(stravaError);
    }
    if (stravaParam) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    void refreshStravaStatus(stravaParam === "connected");
  }, []);

  const buildSegmentationForm = () => {
    const form = new FormData();
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

    return form;
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please choose a .gpx or .fit file first.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `${truncate(file.name, 22)} is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is 10 MB.`,
      );
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const form = buildSegmentationForm();
      form.append("file", file);

      const res = await fetchOrExplain(ENDPOINT, { method: "POST", body: form });
      if (!res.ok) {
        throw new Error(await readError(res, "Upload failed"));
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

  const refreshStravaStatus = async (loadActivities = false) => {
    if (!ENABLE_STRAVA_IMPORT) return;
    try {
      const res = await fetch(`${API_BASE}/api/strava/status`);
      if (!res.ok) return;
      const data = (await res.json()) as StravaStatus;
      const connected = Boolean(data.connected);
      setStravaConnected(connected);
      setStravaStatus(data);
      if (connected && loadActivities) {
        await loadStravaActivities(1, true);
      }
    } catch {
      // Strava is optional; keep local upload available if status cannot load.
    }
  };

  const loadStravaActivities = async (page = 1, replace = true) => {
    if (!ENABLE_STRAVA_IMPORT) return;
    setStravaLoading(true);
    setError(null);
    try {
      const res = await fetchOrExplain(`${API_BASE}/api/strava/activities?page=${page}&per_page=20`);
      if (res.status === 429) {
        throw new Error("Strava rate limit reached. Too many requests — try again in a few minutes.");
      }
      if (!res.ok) {
        throw new Error(await readError(res, "Could not load Strava activities"));
      }
      const data = (await res.json()) as {
        activities?: StravaActivity[];
        page?: number;
        has_more?: boolean;
      };
      setStravaActivities((current) =>
        replace ? data.activities ?? [] : [...current, ...(data.activities ?? [])],
      );
      setStravaPage(data.page ?? page);
      setStravaHasMore(Boolean(data.has_more));
      setShowStravaPicker(true);
      setStravaConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Strava activities");
    } finally {
      setStravaLoading(false);
    }
  };

  const disconnectStrava = async () => {
    if (!ENABLE_STRAVA_IMPORT) return;
    setStravaLoading(true);
    setError(null);
    try {
      const res = await fetchOrExplain(`${API_BASE}/api/strava/disconnect`, { method: "POST" });
      if (!res.ok) {
        throw new Error(await readError(res, "Could not disconnect Strava"));
      }
      setStravaConnected(false);
      setStravaStatus({ connected: false });
      setStravaActivities([]);
      setShowStravaPicker(false);
      setSuccess(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect Strava");
    } finally {
      setStravaLoading(false);
    }
  };

  const handleStravaImport = async (activity: StravaActivity) => {
    if (!ENABLE_STRAVA_IMPORT) return;
    if (activity.has_gps_hint === false) {
      setError(activity.unsupported_reason ?? "This Strava activity does not appear to include GPS data.");
      return;
    }
    setStravaImportingId(activity.id);
    setError(null);
    setSuccess(false);
    try {
      const form = buildSegmentationForm();
      if (activity.pointtracer_sport && activity.pointtracer_sport !== "unknown") {
        form.set("sport", activity.pointtracer_sport);
      }
      const res = await fetchOrExplain(`${API_BASE}/api/strava/import/${activity.id}`, {
        method: "POST",
        body: form,
      });
      if (res.status === 429) {
        throw new Error("Strava rate limit reached. Too many requests — try again in a few minutes.");
      }
      if (!res.ok) {
        throw new Error(await readError(res, "Strava import failed"));
      }
      const data = (await res.json()) as SessionData;
      onUploaded(data);
      setSuccess(true);
      setShowStravaPicker(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Strava import failed");
    } finally {
      setStravaImportingId(null);
    }
  };

  return (
    <div className="relative z-30 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/40 bg-card/30">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mr-1">
        <FileUp className="w-3.5 h-3.5" />
        Upload GPX/FIT
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
        accept=".gpx,.fit,application/gpx+xml"
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
        {file ? truncate(file.name, 22) : "Choose .gpx/.fit"}
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

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={() => setTutorialOpen(true)}
      >
        <CircleHelp className="w-3.5 h-3.5" />
        Get a file
      </Button>

      {ENABLE_STRAVA_IMPORT && (stravaStatus?.configured !== false || stravaConnected) ? (
        <>
          <div className="h-6 w-px bg-border/50 mx-1" />

          <Button
            type="button"
            variant={stravaConnected ? "outline" : "secondary"}
            size="sm"
            className="h-8 border-amber-500/45 bg-amber-500/15 text-xs font-semibold text-amber-700 hover:border-amber-500 hover:bg-amber-500/25 hover:text-amber-800 dark:bg-amber-500/20 dark:text-amber-100 dark:hover:border-amber-400 dark:hover:bg-amber-500/25 dark:hover:text-amber-50"
            disabled={stravaLoading || loading}
            onClick={() => {
              if (stravaConnected) {
                void loadStravaActivities(1, true);
              } else {
                window.location.href = `${API_BASE}/api/strava/connect`;
              }
            }}
          >
            {stravaLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : stravaConnected ? (
              <RefreshCw className="w-3.5 h-3.5" />
            ) : (
              <RadioTower className="w-3.5 h-3.5" />
            )}
            {stravaConnected ? "Strava activities" : "Connect Strava"}
          </Button>

          {stravaConnected ? (
            <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {formatAthleteName(stravaStatus?.athlete) ?? "Strava connected"}
            </div>
          ) : null}
        </>
      ) : null}

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

      <GpxTutorialDialog open={tutorialOpen} onOpenChange={setTutorialOpen} />

      {ENABLE_STRAVA_IMPORT && showStravaPicker && (
        <div className="w-full rounded-xl border border-amber-500/25 bg-background/95 p-3 shadow-lg shadow-amber-950/10">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-500">
                Recent Strava activities
              </div>
              <div className="text-xs text-muted-foreground">
                Choose one of your own Strava activities to import into the normal review flow.
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500"
                disabled={stravaLoading}
                onClick={() => void loadStravaActivities(1, true)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500"
                disabled={stravaLoading}
                onClick={() => void disconnectStrava()}
              >
                <Unlink className="h-3.5 w-3.5" />
                Disconnect
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs hover:bg-amber-500/10 hover:text-amber-500"
                onClick={() => setShowStravaPicker(false)}
              >
                Close
              </Button>
            </div>
          </div>
          <div className="grid max-h-64 gap-2 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
            {stravaLoading && stravaActivities.length === 0 ? (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-muted-foreground">
                <Loader2 className="mb-2 h-4 w-4 animate-spin text-amber-500" />
                Loading recent activities…
              </div>
            ) : null}
            {stravaActivities.length === 0 && !stravaLoading ? (
              <div className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                No recent Strava activities were returned. Try reconnecting if this looks wrong.
              </div>
            ) : null}
            {stravaActivities.map((activity) => (
              <button
                key={activity.id}
                type="button"
                className="rounded-lg border border-border/60 bg-card/60 p-3 text-left transition hover:border-amber-500/80 hover:bg-amber-500/10 focus-visible:border-amber-500/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={stravaImportingId !== null || activity.has_gps_hint === false}
                onClick={() => void handleStravaImport(activity)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {activity.name}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {activity.sport_type} · {formatActivityDate(activity.start_date)}
                    </div>
                  </div>
                  {stravaImportingId === activity.id ? (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-500" />
                  ) : null}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{formatDistance(activity.distance_m, units)}</span>
                  <span>{formatDuration(activity.moving_time_s ?? activity.elapsed_time_s)}</span>
                  <span>{formatSportMapping(activity.pointtracer_sport)}</span>
                  {activity.has_heartrate ? <span className="text-amber-500">HR</span> : null}
                </div>
                {activity.has_gps_hint === false ? (
                  <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-500">
                    Missing GPS streams for map review.
                  </div>
                ) : null}
              </button>
            ))}
          </div>
          {stravaHasMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 h-8 w-full border-amber-500/35 text-xs hover:bg-amber-500/10 hover:text-amber-500"
              disabled={stravaLoading}
              onClick={() => void loadStravaActivities(stravaPage + 1, false)}
            >
              {stravaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Load more activities
            </Button>
          ) : null}
          <div className="mt-2.5 text-center text-[10px] text-muted-foreground/60">
            Powered by{" "}
            <a
              href="https://www.strava.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-500/80 hover:text-amber-500"
            >
              Strava
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function GpxTutorialDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[2400] max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Get your GPX or FIT file</DialogTitle>
          <DialogDescription>
            PointTracer reads .gpx and .fit files from your own workouts. Pick the place your
            activity already lives, export it, then upload the downloaded file here.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="strava" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
            {GPX_EXPORT_GUIDES.map((guide) => (
              <TabsTrigger key={guide.id} value={guide.id} className="text-xs">
                {guide.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {GPX_EXPORT_GUIDES.map((guide) => (
            <TabsContent key={guide.id} value={guide.id} className="mt-4 space-y-4">
              <div className="rounded-xl border border-border/60 bg-card/45 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{guide.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{guide.note}</p>
                  </div>
                  <a
                    href={guide.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border/60 px-2.5 text-xs font-medium text-foreground transition hover:bg-accent"
                  >
                    Official help
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>

                <ol className="mt-4 space-y-2 text-sm text-foreground">
                  {guide.steps.map((step, index) => (
                    <li key={step} className="flex gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span className="leading-6">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

async function fetchOrExplain(input: string, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error(
      "Could not reach the PointTracer server. It may be starting up — try again in a few seconds.",
    );
  }
}

async function readError(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `${fallback} (${response.status})`;
  }
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    if (typeof parsed.detail === "string") {
      return `${fallback} (${response.status}): ${parsed.detail}`;
    }
  } catch {
    // Fall through to raw text.
  }
  return `${fallback} (${response.status}): ${text}`;
}

function formatActivityDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDistance(distanceM: number | null, units: UnitSystem) {
  if (typeof distanceM !== "number" || !Number.isFinite(distanceM)) {
    return "No distance";
  }
  if (units === "metric") {
    return `${(distanceM / METERS_PER_KILOMETER).toFixed(2)} km`;
  }
  return `${(distanceM / METERS_PER_MILE).toFixed(2)} mi`;
}

function formatDuration(seconds: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return "No duration";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m`;
}

function formatAthleteName(athlete: StravaStatus["athlete"] | undefined) {
  if (!athlete) return null;
  const name = [athlete.firstname, athlete.lastname].filter(Boolean).join(" ").trim();
  return name || athlete.username || "Strava connected";
}

function formatSportMapping(sport: string | undefined) {
  if (!sport || sport === "unknown") return "Sport fallback";
  if (sport === "ultimate") return "PointTracer: Ultimate";
  return `PointTracer: ${sport.charAt(0).toUpperCase()}${sport.slice(1)}`;
}
