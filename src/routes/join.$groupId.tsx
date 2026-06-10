import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Info, Loader2, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

export const Route = createFileRoute("/join/$groupId")({
  component: JoinPage,
});

interface GroupStatus {
  session_type?: string;
  participant_count?: number;
  sport?: string;
}

function JoinPage() {
  const { groupId } = Route.useParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [status, setStatus] = useState<GroupStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/group/${groupId}`);
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error();
        const data = (await res.json()) as GroupStatus;
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setJoining(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("participant_label", labelFromFilename(file.name));
      const res = await fetch(`${API_BASE}/api/group/${groupId}/join`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        throw new Error(await readError(res));
      }
      // Success — open the combined replay in the main app.
      window.location.assign(`/?group=${groupId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join this replay.");
      setJoining(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const athleteCount =
    status?.session_type === "multiplayer" ? (status.participant_count ?? 1) : 1;
  const sportLabel = status?.sport && status.sport !== "unknown" ? status.sport : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="3" fill="currentColor" className="text-primary" />
            <circle
              cx="8"
              cy="8"
              r="5.5"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeDasharray="2.5 2"
              className="text-primary/60"
            />
          </svg>
          <span className="text-base font-bold tracking-wide text-foreground">PointTracer</span>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-xl backdrop-blur">
          {statusLoading ? (
            <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Loading invite…</span>
            </div>
          ) : notFound ? (
            <div className="py-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h1 className="mt-4 text-xl font-bold text-foreground">Invite not found</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This invite link is invalid or has expired. Ask whoever shared it to send a new one.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <a href="/">Go to PointTracer</a>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
                <Users className="h-3.5 w-3.5" />
                Shared replay
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                Join this multiplayer replay
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {athleteCount === 1
                  ? "1 athlete is waiting. Add your activity to sync your trace onto the shared timeline."
                  : `${athleteCount} athletes are on this replay. Add your activity to join them.`}
                {sportLabel ? (
                  <>
                    {" "}
                    Sport: <span className="text-foreground">{sportLabel.replace(/_/g, " ")}</span>.
                  </>
                ) : null}
              </p>

              <div className="mt-4 flex gap-2.5 rounded-xl border border-border/60 bg-secondary/30 p-3 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  Per Strava's API rules, you can only use your{" "}
                  <strong className="text-foreground">own</strong> data. Export your matching
                  activity from Strava (open it → ⋯ menu → <em>Export GPX</em>) or use the .gpx/.fit
                  from your watch, then upload it below. Your file stays tied to this shared replay.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".gpx,.fit,application/gpx+xml"
                className="hidden"
                onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                className="mt-5 h-11 w-full gap-2 text-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={joining}
              >
                {joining ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Joining replay…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload my activity & join
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              {error ? (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function labelFromFilename(filename: string) {
  return (
    filename
      .replace(/\.(gpx|fit)$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Player"
  );
}

async function readError(response: Response) {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // fall through
  }
  return `Could not join this replay (${response.status}).`;
}
