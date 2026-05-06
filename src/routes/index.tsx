import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useSessionData } from "@/hooks/use-session-data";
import { SessionSidebar } from "@/components/SessionSidebar";
import { SegmentList } from "@/components/SegmentList";
import { AnalyticsCards } from "@/components/AnalyticsCards";
import { EditControls } from "@/components/EditControls";
import { MultiPlayerPanel } from "@/components/MultiPlayerPanel";
import { SessionMap } from "@/components/SessionMap";
import { UploadPanel } from "@/components/UploadPanel";
import { PlaybackControls } from "@/components/PlaybackControls";
import { useSegmentPlayback } from "@/hooks/use-segment-playback";
import type { SessionData } from "@/types/session";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "PointTracer — GPS Session Review" },
      { name: "description", content: "Premium GPS session analysis for point-based sports" },
    ],
  }),
});

function Index() {
  const { data: demoData, loading, error } = useSessionData();
  const [data, setData] = useState<SessionData | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<number | null>(null);
  const [showFullRoute, setShowFullRoute] = useState(true);

  // Seed with demo data on first load
  useEffect(() => {
    if (demoData && !data) setData(demoData);
  }, [demoData, data]);

  const handleUploaded = (next: SessionData) => {
    setData(next);
    setSelectedSegmentId(null);
    setHoveredSegmentId(null);
    setShowFullRoute(true);
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading session…</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-destructive text-sm">Failed to load session: {error}</p>
      </div>
    );
  }

  const selectedSegment = data.segments.find((s) => s.segment_id === selectedSegmentId) ?? null;
  const selectedIndex = useMemo(
    () => data.segments.findIndex((s) => s.segment_id === selectedSegmentId),
    [data.segments, selectedSegmentId],
  );
  const totalPoints = selectedSegment
    ? selectedSegment.end_idx - selectedSegment.start_idx + 1
    : 0;

  const playback = useSegmentPlayback(totalPoints, selectedSegmentId);

  const handleSelectSegment = (id: number) => {
    setSelectedSegmentId((prev) => (prev === id ? null : id));
    if (id !== selectedSegmentId) setShowFullRoute(false);
  };

  const goToSegment = (offset: number) => {
    if (selectedIndex < 0) return;
    const next = data.segments[selectedIndex + offset];
    if (next) {
      setSelectedSegmentId(next.segment_id);
      setShowFullRoute(false);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-sm font-bold tracking-wide text-foreground">PointTracer</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowFullRoute(true);
              setSelectedSegmentId(null);
            }}
            className={`text-[11px] px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              showFullRoute
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Session
          </button>
          <button
            onClick={() => setShowFullRoute(false)}
            className={`text-[11px] px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              !showFullRoute
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Focus Segment
          </button>
        </div>
      </header>

      <UploadPanel onUploaded={handleUploaded} />

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-64 flex flex-col gap-3 p-3 overflow-y-auto border-r border-border/30">
          <SessionSidebar
            activityName={data.activity_name}
            sport={data.sport}
            summary={data.summary}
            segmentCount={data.segments.length}
          />
          <SegmentList
            segments={data.segments}
            selectedId={selectedSegmentId}
            hoveredId={hoveredSegmentId}
            onSelect={handleSelectSegment}
            onHover={setHoveredSegmentId}
          />
        </aside>

        {/* Center map + bottom panels */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 p-3 pb-0">
            <SessionMap
              points={data.points}
              segments={data.segments}
              selectedSegmentId={selectedSegmentId}
              hoveredSegmentId={hoveredSegmentId}
              showFullRoute={showFullRoute}
              playbackIdx={selectedSegment ? playback.idx : null}
              playbackActive={playback.playing}
            />
          </div>
          <div className="p-3 space-y-3">
            <PlaybackControls
              segment={selectedSegment}
              hasPrev={selectedIndex > 0}
              hasNext={selectedIndex >= 0 && selectedIndex < data.segments.length - 1}
              playing={playback.playing}
              idx={playback.idx}
              totalPoints={totalPoints}
              speed={playback.speed}
              onPlay={playback.play}
              onPause={playback.pause}
              onRestart={playback.restart}
              onPrev={() => goToSegment(-1)}
              onNext={() => goToSegment(1)}
              onSeek={playback.seek}
              onSpeedChange={playback.setSpeed}
            />
            <AnalyticsCards segment={selectedSegment} />
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <EditControls />
              </div>
              <div className="flex-1">
                <MultiPlayerPanel />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
            <div className="flex gap-3">
              <div className="flex-1">
                <EditControls />
              </div>
              <div className="flex-1">
                <MultiPlayerPanel />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
