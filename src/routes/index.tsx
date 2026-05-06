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
import { SessionTimelineEditor } from "@/components/SessionTimelineEditor";
import { useSegmentPlayback } from "@/hooks/use-segment-playback";
import type { SessionData, SessionPoint, SessionSegment } from "@/types/session";

const EMPTY_SEGMENTS: SessionSegment[] = [];

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

  const segments = data?.segments ?? EMPTY_SEGMENTS;
  const selectedSegment = segments.find((s) => s.segment_id === selectedSegmentId) ?? null;
  const selectedIndex = useMemo(
    () => segments.findIndex((s) => s.segment_id === selectedSegmentId),
    [segments, selectedSegmentId],
  );
  const totalPoints = selectedSegment ? selectedSegment.end_idx - selectedSegment.start_idx + 1 : 0;
  const sessionTotalPoints = data?.points.length ?? 0;
  const sessionPlayback = useSegmentPlayback(sessionTotalPoints, data?.source_file ?? null);
  const playheadSegment =
    segments.find(
      (segment) =>
        sessionPlayback.idx >= segment.start_idx && sessionPlayback.idx <= segment.end_idx,
    ) ?? null;
  const mapSelectedSegmentId = showFullRoute
    ? (selectedSegmentId ?? playheadSegment?.segment_id ?? null)
    : selectedSegmentId;

  const playback = useSegmentPlayback(totalPoints, selectedSegmentId);

  const handleUploaded = (next: SessionData) => {
    setData(next);
    setSelectedSegmentId(null);
    setHoveredSegmentId(null);
    setShowFullRoute(true);
    sessionPlayback.seek(0);
    sessionPlayback.pause();
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

  const handleSelectSegment = (id: number) => {
    setSelectedSegmentId((prev) => (prev === id ? null : id));
    if (id !== selectedSegmentId) setShowFullRoute(false);
  };

  const handleSelectTimelineSegment = (id: number) => {
    setSelectedSegmentId((prev) => (prev === id ? null : id));
    const next = segments.find((segment) => segment.segment_id === id);
    if (next && id !== selectedSegmentId) sessionPlayback.seek(next.start_idx);
    setShowFullRoute(true);
  };

  const splitSelectedSegment = () => {
    if (!data || !selectedSegment || selectedSegment.point_count < 4) return;

    const splitIdx = sessionPlayback.idx;
    if (splitIdx <= selectedSegment.start_idx || splitIdx >= selectedSegment.end_idx) return;

    const nextId = Math.max(...data.segments.map((segment) => segment.segment_id)) + 1;
    const first = buildSegmentFromRange({
      points: data.points,
      source: selectedSegment,
      startIdx: selectedSegment.start_idx,
      endIdx: splitIdx,
      id: selectedSegment.segment_id,
      label: `${selectedSegment.label} A`,
    });
    const second = buildSegmentFromRange({
      points: data.points,
      source: selectedSegment,
      startIdx: splitIdx + 1,
      endIdx: selectedSegment.end_idx,
      id: nextId,
      label: `${selectedSegment.label} B`,
    });

    setData({
      ...data,
      segments: data.segments.flatMap((segment) =>
        segment.segment_id === selectedSegment.segment_id ? [first, second] : [segment],
      ),
    });
    setSelectedSegmentId(first.segment_id);
    setHoveredSegmentId(null);
    setShowFullRoute(true);
  };

  const goToSegment = (offset: number) => {
    if (selectedIndex < 0) return;
    const next = segments[selectedIndex + offset];
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
              selectedSegmentId={mapSelectedSegmentId}
              hoveredSegmentId={hoveredSegmentId}
              showFullRoute={showFullRoute}
              playbackIdx={selectedSegment ? playback.idx : null}
              sessionPlaybackIdx={showFullRoute ? sessionPlayback.idx : null}
              playbackActive={showFullRoute ? sessionPlayback.playing : playback.playing}
            />
          </div>
          <div className="p-3 space-y-3">
            {showFullRoute ? (
              <SessionTimelineEditor
                segments={data.segments}
                summary={data.summary}
                selectedId={selectedSegmentId}
                hoveredId={hoveredSegmentId}
                playheadIdx={sessionPlayback.idx}
                totalPoints={sessionTotalPoints}
                playing={sessionPlayback.playing}
                onSelect={handleSelectTimelineSegment}
                onHover={setHoveredSegmentId}
                onPlay={sessionPlayback.play}
                onPause={sessionPlayback.pause}
                onRestart={sessionPlayback.restart}
                onSeek={sessionPlayback.seek}
                onSplitSelected={splitSelectedSegment}
              />
            ) : (
              <>
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
              </>
            )}
            {showFullRoute ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <MultiPlayerPanel />
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function buildSegmentFromRange({
  points,
  source,
  startIdx,
  endIdx,
  id,
  label,
}: {
  points: SessionPoint[];
  source: SessionSegment;
  startIdx: number;
  endIdx: number;
  id: number;
  label: string;
}): SessionSegment {
  const range = points.slice(startIdx, endIdx + 1);
  const startPoint = points[startIdx];
  const endPoint = points[endIdx];
  const durationS =
    startPoint && endPoint
      ? Math.max(0, (new Date(endPoint.t).getTime() - new Date(startPoint.t).getTime()) / 1000)
      : 0;
  const distanceM = calculateDistanceMeters(range);

  return {
    ...source,
    segment_id: id,
    label,
    start_idx: startIdx,
    end_idx: endIdx,
    start_time: startPoint?.t ?? source.start_time,
    end_time: endPoint?.t ?? source.end_time,
    duration_s: durationS,
    distance_m: distanceM,
    mean_speed_mps: durationS > 0 ? distanceM / durationS : 0,
    point_count: Math.max(0, endIdx - startIdx + 1),
    bbox: {
      min_lat: Math.min(...range.map((point) => point.lat)),
      min_lon: Math.min(...range.map((point) => point.lon)),
      max_lat: Math.max(...range.map((point) => point.lat)),
      max_lon: Math.max(...range.map((point) => point.lon)),
    },
  };
}

function calculateDistanceMeters(points: SessionPoint[]): number {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    const dx = point.x_m - previous.x_m;
    const dy = point.y_m - previous.y_m;
    return total + Math.sqrt(dx * dx + dy * dy);
  }, 0);
}
