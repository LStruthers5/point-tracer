import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FolderOpen, Maximize2, Pause, Play, RotateCcw, Trash2, X } from "lucide-react";
import { useSessionData } from "@/hooks/use-session-data";
import { SessionSidebar } from "@/components/SessionSidebar";
import { SegmentList } from "@/components/SegmentList";
import { AnalyticsCards } from "@/components/AnalyticsCards";
import { EditControls } from "@/components/EditControls";
import { MultiPlayerPanel } from "@/components/MultiPlayerPanel";
import { SessionMap } from "@/components/SessionMap";
import { UploadPanel } from "@/components/UploadPanel";
import { PlaybackControls } from "@/components/PlaybackControls";
import { PaceGraph } from "@/components/PaceGraph";
import { SettingsMenu } from "@/components/SettingsMenu";
import { SegmentAnalyticsPanel } from "@/components/SegmentAnalyticsPanel";
import { SessionTimelineEditor } from "@/components/SessionTimelineEditor";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Slider } from "@/components/ui/slider";
import { useSegmentPlayback } from "@/hooks/use-segment-playback";
import type { MapBasemapStyle, MapDisplayOptions } from "@/types/map-display";
import type { MapElement } from "@/types/map-elements";
import { DEFAULT_APP_SETTINGS, type AppSettings, type LineColorMode } from "@/types/app-settings";
import type { SessionData, SessionPoint, SessionSegment } from "@/types/session";
import { formatDuration } from "@/lib/format";

const EMPTY_SEGMENTS: SessionSegment[] = [];
const SETTINGS_STORAGE_KEY = "pointtracer.settings.v1";
const ACTIVITY_LIBRARY_STORAGE_KEY = "pointtracer.activityLibrary.v1";

interface LocalActivityRecord {
  id: string;
  activity_name: string;
  source_file: string;
  sport: string;
  segmentation_mode: string;
  uploaded_at: string;
  updated_at: string;
  edited_manually: boolean;
  manual_segment_ids: number[];
  map_display_options: MapDisplayOptions;
  map_elements: MapElement[];
  session: SessionData;
}

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
  const [graphPreviewIdx, setGraphPreviewIdx] = useState<number | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [selectedBasemapStyle, setSelectedBasemapStyle] = useState<MapBasemapStyle | null>(null);
  const [manualSegmentIds, setManualSegmentIds] = useState<Set<number>>(() => new Set());
  const [mapElements, setMapElements] = useState<MapElement[]>([]);
  const [activityLibrary, setActivityLibrary] = useState<LocalActivityRecord[]>(() =>
    loadActivityLibrary(),
  );
  const [activeActivityId, setActiveActivityId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const mapDisplayOptions = useMemo(() => settingsToMapDisplayOptions(settings), [settings]);
  const focusAnalyticsRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollFocusAnalyticsRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", settings.theme === "light");
    root.classList.toggle("dark", settings.theme === "dark");
    root.classList.toggle("reduced-motion", settings.reducedAnimation);
  }, [settings.reducedAnimation, settings.theme]);

  useEffect(() => {
    if (showFullRoute || !shouldScrollFocusAnalyticsRef.current) return;

    const timeout = window.setTimeout(() => {
      focusAnalyticsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      shouldScrollFocusAnalyticsRef.current = false;
    }, 50);

    return () => window.clearTimeout(timeout);
  }, [showFullRoute, selectedSegmentId]);

  useEffect(() => {
    if (!mapExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMapExpanded(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mapExpanded]);

  // Seed with demo data on first load
  useEffect(() => {
    if (demoData && !data) setData(demoData);
  }, [demoData, data]);

  useEffect(() => {
    if (!data || !activeActivityId) return;

    const timeout = window.setTimeout(() => {
      setActivityLibrary((current) => {
        const next = upsertActivityRecord(
          current,
          buildActivityRecord({
            data,
            id: activeActivityId,
            existing: current.find((record) => record.id === activeActivityId),
            manualSegmentIds,
            mapDisplayOptions,
            mapElements,
          }),
        );
        persistActivityLibrary(next);
        return next;
      });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [activeActivityId, data, manualSegmentIds, mapDisplayOptions, mapElements]);

  const segments = data?.segments ?? EMPTY_SEGMENTS;
  const selectedSegment = segments.find((s) => s.segment_id === selectedSegmentId) ?? null;
  const selectedIndex = useMemo(
    () => segments.findIndex((s) => s.segment_id === selectedSegmentId),
    [segments, selectedSegmentId],
  );
  const totalPoints = selectedSegment ? selectedSegment.end_idx - selectedSegment.start_idx + 1 : 0;
  const sessionTotalPoints = data?.points.length ?? 0;
  const sessionPlayback = useSegmentPlayback(
    sessionTotalPoints,
    data?.source_file ?? null,
    settings.defaultPlaybackSpeed,
  );
  const effectiveSessionIdx = graphPreviewIdx ?? sessionPlayback.idx;
  const playheadSegment =
    segments.find(
      (segment) =>
        effectiveSessionIdx >= segment.start_idx && effectiveSessionIdx <= segment.end_idx,
    ) ?? null;
  const mapSelectedSegmentId = showFullRoute
    ? (selectedSegmentId ?? playheadSegment?.segment_id ?? null)
    : selectedSegmentId;

  const playback = useSegmentPlayback(
    totalPoints,
    selectedSegmentId,
    settings.defaultPlaybackSpeed,
  );
  const focusedPreviewOffset =
    selectedSegment &&
    graphPreviewIdx != null &&
    graphPreviewIdx >= selectedSegment.start_idx &&
    graphPreviewIdx <= selectedSegment.end_idx
      ? graphPreviewIdx - selectedSegment.start_idx
      : null;

  const updateMapDisplayOptions = (options: MapDisplayOptions) => {
    setSettings((current) => ({
      ...current,
      defaultTraceMode: options.traceMode,
      heatmapMode: options.heatmapMode,
      lineColor: options.lineColor,
      lineColorMode: mapDisplayOptionsToLineColorMode(options),
    }));
  };

  const handleUploaded = (next: SessionData) => {
    const id = `${slugify(next.activity_name)}-${Date.now()}`;
    const record = buildActivityRecord({
      data: next,
      id,
      manualSegmentIds: new Set(),
      mapDisplayOptions,
      mapElements: [],
    });
    const nextLibrary = upsertActivityRecord(activityLibrary, record);

    persistActivityLibrary(nextLibrary);
    setActivityLibrary(nextLibrary);
    setActiveActivityId(id);
    setData(next);
    setSelectedSegmentId(null);
    setHoveredSegmentId(null);
    setGraphPreviewIdx(null);
    setManualSegmentIds(new Set());
    setMapElements([]);
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
    setGraphPreviewIdx(null);
    setSelectedSegmentId((prev) => (prev === id ? null : id));
    if (id !== selectedSegmentId) {
      shouldScrollFocusAnalyticsRef.current = true;
      setShowFullRoute(false);
    }
  };

  const handleSelectTimelineSegment = (id: number) => {
    setGraphPreviewIdx(null);
    setSelectedSegmentId((prev) => (prev === id ? null : id));
    const next = segments.find((segment) => segment.segment_id === id);
    if (next && id !== selectedSegmentId) sessionPlayback.seek(next.start_idx);
    setShowFullRoute(true);
  };

  const splitSelectedSegment = () => {
    if (!data || !selectedSegment || selectedSegment.point_count < 4) return;

    const splitIdx = Math.round(sessionPlayback.idx);
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
    setManualSegmentIds((current) => new Set([...current, first.segment_id, second.segment_id]));
    setSelectedSegmentId(first.segment_id);
    setHoveredSegmentId(null);
    setGraphPreviewIdx(null);
    setShowFullRoute(true);
  };

  const updateSegmentRange = (segmentId: number, startIdx: number, endIdx: number, label?: string) => {
    if (!data) return;
    const segment = data.segments.find((candidate) => candidate.segment_id === segmentId);
    if (!segment || endIdx <= startIdx) return;

    const updated = buildSegmentFromRange({
      points: data.points,
      source: segment,
      startIdx,
      endIdx,
      id: segment.segment_id,
      label: label?.trim() || segment.label,
    });

    setData({
      ...data,
      segments: data.segments
        .map((candidate) => (candidate.segment_id === segmentId ? updated : candidate))
        .sort((a, b) => a.start_idx - b.start_idx),
    });
    setManualSegmentIds((current) => new Set([...current, segmentId]));
    setSelectedSegmentId(segmentId);
    setHoveredSegmentId(null);
    setGraphPreviewIdx(null);
    setShowFullRoute(true);
    sessionPlayback.seek(endIdx);
  };

  const focusSelectedSegment = () => {
    if (!selectedSegment) return;
    setGraphPreviewIdx(null);
    shouldScrollFocusAnalyticsRef.current = true;
    setShowFullRoute(false);
  };

  const focusSegmentFromOverview = (segmentId: number) => {
    const segment = segments.find((candidate) => candidate.segment_id === segmentId);
    if (!segment) return;
    setGraphPreviewIdx(null);
    setSelectedSegmentId(segmentId);
    shouldScrollFocusAnalyticsRef.current = true;
    setShowFullRoute(false);
    playback.seek(0);
    playback.pause();
  };

  const deleteSelectedSegment = () => {
    if (!data || !selectedSegment) return;

    setData({
      ...data,
      segments: data.segments.filter(
        (segment) => segment.segment_id !== selectedSegment.segment_id,
      ),
    });
    setSelectedSegmentId(null);
    setHoveredSegmentId(null);
    setGraphPreviewIdx(null);
    setManualSegmentIds((current) => {
      const next = new Set(current);
      next.delete(selectedSegment.segment_id);
      return next;
    });
  };

  const addSegmentAtPlayhead = (startIdx: number, endIdx: number, label?: string) => {
    if (!data || data.points.length < 2) return;
    if (endIdx <= startIdx) return;

    const nextId =
      data.segments.length > 0
        ? Math.max(...data.segments.map((segment) => segment.segment_id)) + 1
        : 1;
    const newSegment = buildSegmentFromRange({
      points: data.points,
      source: data.segments[0] ?? createFallbackSegment(data.points),
      startIdx,
      endIdx,
      id: nextId,
      label: label?.trim() || `Segment ${nextId}`,
    });

    setData({
      ...data,
      segments: [...data.segments, newSegment].sort((a, b) => a.start_idx - b.start_idx),
    });
    setManualSegmentIds((current) => new Set([...current, nextId]));
    setSelectedSegmentId(nextId);
    setHoveredSegmentId(null);
    setGraphPreviewIdx(null);
    setShowFullRoute(true);
    sessionPlayback.seek(endIdx);
  };

  const goToSegment = (offset: number) => {
    if (selectedIndex < 0) return;
    const next = segments[selectedIndex + offset];
    if (next) {
      setSelectedSegmentId(next.segment_id);
      setGraphPreviewIdx(null);
      shouldScrollFocusAnalyticsRef.current = true;
      setShowFullRoute(false);
    }
  };

  const seekSessionGraphPoint = (idx: number) => {
    sessionPlayback.seek(idx);
  };

  const seekFocusGraphPoint = (idx: number) => {
    if (!selectedSegment) return;
    if (idx < selectedSegment.start_idx || idx > selectedSegment.end_idx) return;

    playback.seek(idx - selectedSegment.start_idx);
  };

  const openLocalActivity = (record: LocalActivityRecord) => {
    setActiveActivityId(record.id);
    setData(record.session);
    setSelectedSegmentId(null);
    setHoveredSegmentId(null);
    setGraphPreviewIdx(null);
    setManualSegmentIds(new Set(record.manual_segment_ids));
    setMapElements(record.map_elements ?? []);
    setShowFullRoute(true);
    setMapExpanded(false);
    setSettings((current) => ({
      ...current,
      defaultTraceMode: record.map_display_options.traceMode,
      heatmapMode: record.map_display_options.heatmapMode,
      lineColor: record.map_display_options.lineColor,
      lineColorMode: mapDisplayOptionsToLineColorMode(record.map_display_options),
    }));
    sessionPlayback.seek(0);
    sessionPlayback.pause();
  };

  const deleteLocalActivity = (id: string) => {
    const next = activityLibrary.filter((record) => record.id !== id);
    persistActivityLibrary(next);
    setActivityLibrary(next);
    if (id === activeActivityId) setActiveActivityId(null);
  };

  const exportCorrectedBoundaries = () => {
    if (!data) return;

    const payload = {
      activity_name: data.activity_name,
      source_file: data.source_file,
      sport: data.sport,
      exported_at: new Date().toISOString(),
      summary: {
        start_time: data.summary.start_time,
        end_time: data.summary.end_time,
        duration_min: data.summary.duration_min,
        trackpoint_count: data.summary.trackpoint_count,
        distance_m: data.summary.distance_m,
      },
      segments: data.segments.map((segment) => ({
        segment_id: segment.segment_id,
        label: segment.label,
        start_time: segment.start_time,
        end_time: segment.end_time,
        start_idx: segment.start_idx,
        end_idx: segment.end_idx,
      })),
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `corrected-boundaries-${slugify(data.activity_name)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
              setGraphPreviewIdx(null);
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
            onClick={() => {
              setShowFullRoute(false);
              setGraphPreviewIdx(null);
              shouldScrollFocusAnalyticsRef.current = true;
            }}
            className={`text-[11px] px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              !showFullRoute
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Focus Segment
          </button>
          <ActivityLibraryMenu
            records={activityLibrary}
            activeId={activeActivityId}
            onOpen={openLocalActivity}
            onDelete={deleteLocalActivity}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportCorrectedBoundaries}
            disabled={!data}
            title="Export current edited segment boundaries as JSON"
            className="h-8 gap-1.5 text-xs text-muted-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <SettingsMenu settings={settings} onChange={setSettings} />
        </div>
      </header>

      <UploadPanel onUploaded={handleUploaded} units={settings.units} />

      <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
        <ResizablePanel defaultSize="18rem" minSize="14rem" maxSize="34rem">
          <aside className="flex h-full flex-col gap-3 overflow-y-auto border-r border-border/30 p-3">
            <SessionSidebar
              activityName={data.activity_name}
              sport={data.sport}
              summary={data.summary}
              segmentCount={data.segments.length}
              units={settings.units}
            />
            <SegmentList
              segments={data.segments}
              selectedId={selectedSegmentId}
              hoveredId={hoveredSegmentId}
              units={settings.units}
              onSelect={handleSelectSegment}
              onHover={setHoveredSegmentId}
            />
          </aside>
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-border/40" />
        <ResizablePanel minSize="28rem">
          <main className="h-full overflow-hidden">
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel defaultSize="68%" minSize="18rem">
                <div className="relative h-full p-3 pb-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMapExpanded(true)}
                    className="absolute left-1/2 top-6 z-[950] h-8 -translate-x-1/2 gap-1.5 bg-background/85 text-xs shadow-lg backdrop-blur"
                    title="Expand map playback"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Expand
                  </Button>
                  <SessionMap
                    points={data.points}
                    segments={data.segments}
                    selectedSegmentId={mapSelectedSegmentId}
                    hoveredSegmentId={hoveredSegmentId}
                    showFullRoute={showFullRoute}
                    playbackIdx={selectedSegment ? (focusedPreviewOffset ?? playback.idx) : null}
                    sessionPlaybackIdx={showFullRoute ? effectiveSessionIdx : null}
                    playbackActive={showFullRoute ? sessionPlayback.playing : playback.playing}
                    displayOptions={mapDisplayOptions}
                    units={settings.units}
                    theme={settings.theme}
                    onlySegmentedActivity={settings.onlySegmentedActivity}
                    reducedAnimation={settings.reducedAnimation}
                    mapElements={mapElements}
                    onMapElementsChange={setMapElements}
                    basemapStyle={selectedBasemapStyle}
                    onBasemapStyleChange={setSelectedBasemapStyle}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle className="bg-border/40" />
              <ResizablePanel defaultSize="32%" minSize="9rem">
                <div className="h-full overflow-y-auto p-3 space-y-3">
                  {showFullRoute ? (
                    <>
                      <SessionTimelineEditor
                        points={data.points}
                        segments={data.segments}
                        summary={data.summary}
                        selectedId={selectedSegmentId}
                        hoveredId={hoveredSegmentId}
                        playheadIdx={sessionPlayback.idx}
                        totalPoints={sessionTotalPoints}
                        playing={sessionPlayback.playing}
                        displayOptions={mapDisplayOptions}
                        units={settings.units}
                        showPaceGraph={settings.showPaceGraph}
                        showHeartRateChart={settings.showHeartRateChart}
                        manualSegmentIds={manualSegmentIds}
                        onSelect={handleSelectTimelineSegment}
                        onHover={setHoveredSegmentId}
                        onPlay={sessionPlayback.play}
                        onPause={sessionPlayback.pause}
                        onRestart={sessionPlayback.restart}
                        onSeek={sessionPlayback.seek}
                        onGraphHover={setGraphPreviewIdx}
                        onGraphSelect={seekSessionGraphPoint}
                        onDisplayOptionsChange={updateMapDisplayOptions}
                        onFocusSelected={focusSelectedSegment}
                        onUpdateSegment={updateSegmentRange}
                        onDeleteSelected={deleteSelectedSegment}
                        onAddSegmentAtPlayhead={addSegmentAtPlayhead}
                        onSplitSelected={splitSelectedSegment}
                      />
                      <SegmentAnalyticsPanel
                        points={data.points}
                        segments={data.segments}
                        mapElements={mapElements}
                        units={settings.units}
                        onFocusSegment={focusSegmentFromOverview}
                      />
                    </>
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
                      <div ref={focusAnalyticsRef} className="scroll-mt-3">
                        <AnalyticsCards
                          segment={selectedSegment}
                          points={data.points}
                          segments={data.segments}
                          mapElements={mapElements}
                          units={settings.units}
                        />
                      </div>
                      {settings.showPaceGraph && selectedSegment ? (
                        <PaceGraph
                          points={data.points}
                          startIdx={selectedSegment.start_idx}
                          endIdx={getFocusGraphEndIdx(data.segments, selectedIndex, data.points.length)}
                          selectedStartIdx={selectedSegment.start_idx}
                          selectedEndIdx={selectedSegment.end_idx}
                          playheadIdx={selectedSegment.start_idx + playback.idx}
                          units={settings.units}
                          showHeartRate={settings.showHeartRateChart}
                          onHoverPoint={setGraphPreviewIdx}
                          onSelectPoint={seekFocusGraphPoint}
                        />
                      ) : null}
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => {
                            if (!selectedSegment) return;
                            setGraphPreviewIdx(null);
                            setShowFullRoute(true);
                            sessionPlayback.seek(selectedSegment.start_idx);
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Back to Session View
                        </Button>
                      </div>
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
              </ResizablePanel>
            </ResizablePanelGroup>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>

      {mapExpanded ? (
        <div className="fixed inset-0 z-[1200] flex flex-col bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Expanded map
              </div>
              <div className="truncate text-lg font-semibold text-foreground">
                {showFullRoute ? data.activity_name : (selectedSegment?.label ?? "Focus Segment")}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMapExpanded(false)}
              className="h-9 gap-1.5"
            >
              <X className="h-4 w-4" />
              Exit
            </Button>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/40">
            <SessionMap
              points={data.points}
              segments={data.segments}
              selectedSegmentId={mapSelectedSegmentId}
              hoveredSegmentId={hoveredSegmentId}
              showFullRoute={showFullRoute}
              playbackIdx={selectedSegment ? (focusedPreviewOffset ?? playback.idx) : null}
              sessionPlaybackIdx={showFullRoute ? effectiveSessionIdx : null}
              playbackActive={showFullRoute ? sessionPlayback.playing : playback.playing}
              displayOptions={mapDisplayOptions}
              units={settings.units}
              theme={settings.theme}
              onlySegmentedActivity={settings.onlySegmentedActivity}
              reducedAnimation={settings.reducedAnimation}
              mapElements={mapElements}
              onMapElementsChange={setMapElements}
              basemapStyle={selectedBasemapStyle}
              onBasemapStyleChange={setSelectedBasemapStyle}
            />

            <ExpandedMapPlaybackControls
              label={showFullRoute ? "Session playback" : (selectedSegment?.label ?? "Segment playback")}
              playing={showFullRoute ? sessionPlayback.playing : playback.playing}
              idx={showFullRoute ? sessionPlayback.idx : playback.idx}
              totalPoints={showFullRoute ? sessionTotalPoints : totalPoints}
              durationS={showFullRoute ? data.summary.duration_min * 60 : (selectedSegment?.duration_s ?? 0)}
              onPlay={showFullRoute ? sessionPlayback.play : playback.play}
              onPause={showFullRoute ? sessionPlayback.pause : playback.pause}
              onRestart={showFullRoute ? sessionPlayback.restart : playback.restart}
              onSeek={showFullRoute ? sessionPlayback.seek : playback.seek}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ExpandedMapPlaybackControls({
  label,
  playing,
  idx,
  totalPoints,
  durationS,
  onPlay,
  onPause,
  onRestart,
  onSeek,
}: {
  label: string;
  playing: boolean;
  idx: number;
  totalPoints: number;
  durationS: number;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSeek: (idx: number) => void;
}) {
  const canScrub = totalPoints > 1;
  const progress = canScrub ? idx / (totalPoints - 1) : 0;
  const currentTime = durationS * progress;

  return (
    <div className="absolute inset-x-4 bottom-4 z-[950] rounded-2xl border border-border/55 bg-background/88 p-3 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {formatDuration(currentTime)} / {formatDuration(durationS)}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRestart}
          disabled={!canScrub}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-foreground/80 transition hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Restart playback"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={playing ? onPause : onPlay}
          disabled={!canScrub}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={playing ? "Pause playback" : "Play playback"}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <Slider
          value={[idx]}
          min={0}
          max={Math.max(1, totalPoints - 1)}
          step={1}
          disabled={!canScrub}
          onValueChange={(value) => onSeek(value[0])}
          className="flex-1"
        />
      </div>
    </div>
  );
}

function getFocusGraphEndIdx(segments: SessionSegment[], selectedIndex: number, pointCount: number) {
  if (selectedIndex < 0) return Math.max(0, pointCount - 1);
  const selected = segments[selectedIndex];
  const next = segments[selectedIndex + 1];
  if (!selected) return Math.max(0, pointCount - 1);
  if (!next) return selected.end_idx;
  return Math.min(Math.max(selected.end_idx, next.start_idx), Math.max(0, pointCount - 1));
}

function ActivityLibraryMenu({
  records,
  activeId,
  onOpen,
  onDelete,
}: {
  records: LocalActivityRecord[];
  activeId: string | null;
  onOpen: (record: LocalActivityRecord) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Library
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="z-[2200] w-80 rounded-2xl border-border/70 bg-card p-3 shadow-2xl"
      >
        <div className="mb-3">
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Activity library
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Uploaded activities autosave locally in this browser.
          </div>
        </div>

        {records.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-secondary/35 px-3 py-4 text-center text-xs text-muted-foreground">
            Upload an activity to add it here.
          </div>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {records.map((record) => (
              <div
                key={record.id}
                className="flex items-center gap-2 rounded-xl border border-border/45 bg-secondary/30 p-2"
              >
                <button
                  type="button"
                  onClick={() => onOpen(record)}
                  className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition hover:bg-background/70"
                >
                  <div className="flex items-center gap-2">
                    <div className="truncate text-xs font-semibold text-foreground">
                      {record.activity_name}
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary">
                      {record.sport}
                    </span>
                    {record.id === activeId ? (
                      <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary">
                        Open
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground">
                    Autosaved {formatSavedAt(record.updated_at)} ·{" "}
                    {record.session.segments.length} segments
                  </div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground/80">
                    {record.edited_manually ? "Edited manually" : "Auto-detected"} ·{" "}
                    {record.source_file || "No source file"}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(record.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete local activity ${record.activity_name}`}
                  title="Delete local activity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function createFallbackSegment(points: SessionPoint[]): SessionSegment {
  return buildSegmentFromRange({
    points,
    source: {
      segment_id: 0,
      label: "Segment",
      start_idx: 0,
      end_idx: Math.max(0, points.length - 1),
      start_time: points[0]?.t ?? "",
      end_time: points.at(-1)?.t ?? "",
      duration_s: 0,
      distance_m: 0,
      mean_speed_mps: 0,
      point_count: points.length,
      bbox: {
        min_lat: Math.min(...points.map((point) => point.lat)),
        min_lon: Math.min(...points.map((point) => point.lon)),
        max_lat: Math.max(...points.map((point) => point.lat)),
        max_lon: Math.max(...points.map((point) => point.lon)),
      },
    },
    startIdx: 0,
    endIdx: Math.max(0, points.length - 1),
    id: 0,
    label: "Segment",
  });
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

function buildActivityRecord({
  data,
  id,
  existing,
  manualSegmentIds,
  mapDisplayOptions,
  mapElements,
}: {
  data: SessionData;
  id: string;
  existing?: LocalActivityRecord;
  manualSegmentIds: Set<number>;
  mapDisplayOptions: MapDisplayOptions;
  mapElements: MapElement[];
}): LocalActivityRecord {
  const now = new Date().toISOString();

  return {
    id,
    activity_name: data.activity_name,
    source_file: data.source_file,
    sport: data.sport,
    segmentation_mode: data.segmentation_method.type,
    uploaded_at: existing?.uploaded_at ?? now,
    updated_at: now,
    edited_manually: manualSegmentIds.size > 0 || Boolean(existing?.edited_manually),
    manual_segment_ids: [...manualSegmentIds],
    map_display_options: mapDisplayOptions,
    map_elements: mapElements,
    session: data,
  };
}

function upsertActivityRecord(records: LocalActivityRecord[], record: LocalActivityRecord) {
  return [record, ...records.filter((candidate) => candidate.id !== record.id)];
}

function loadActivityLibrary(): LocalActivityRecord[] {
  if (typeof localStorage === "undefined") return [];

  try {
    const stored =
      localStorage.getItem(ACTIVITY_LIBRARY_STORAGE_KEY) ??
      localStorage.getItem("pointtracer.reviewedSessions.v1");
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.map(normalizeActivityRecord).filter(isLocalActivityRecord);
  } catch {
    return [];
  }
}

function persistActivityLibrary(records: LocalActivityRecord[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ACTIVITY_LIBRARY_STORAGE_KEY, JSON.stringify(records));
}

function normalizeActivityRecord(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;

  const record = value as Partial<LocalActivityRecord> & { saved_at?: string };

  return {
    ...record,
    uploaded_at: record.uploaded_at ?? record.saved_at ?? new Date().toISOString(),
    updated_at: record.updated_at ?? record.saved_at ?? new Date().toISOString(),
    map_elements: record.map_elements ?? [],
  };
}

function isLocalActivityRecord(value: unknown): value is LocalActivityRecord {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<LocalActivityRecord>;
  return Boolean(
    typeof candidate.id === "string" &&
      typeof candidate.activity_name === "string" &&
      typeof candidate.uploaded_at === "string" &&
      typeof candidate.updated_at === "string" &&
      candidate.session &&
      Array.isArray(candidate.session.points) &&
    Array.isArray(candidate.session.segments) &&
      Array.isArray(candidate.manual_segment_ids) &&
      Array.isArray(candidate.map_elements ?? []) &&
      candidate.map_display_options,
  );
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function loadSettings(): AppSettings {
  if (typeof localStorage === "undefined") return DEFAULT_APP_SETTINGS;

  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return DEFAULT_APP_SETTINGS;

    const storedSettings = JSON.parse(stored) as Partial<AppSettings> & {
      showInactiveSegments?: boolean;
    };
    const parsed = { ...DEFAULT_APP_SETTINGS, ...storedSettings } as AppSettings;
    if ((parsed.defaultTraceMode as string) === "fade") parsed.defaultTraceMode = "full";
    if ("showInactiveSegments" in storedSettings && !("onlySegmentedActivity" in storedSettings)) {
      parsed.onlySegmentedActivity = false;
    }
    return parsed;
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

function settingsToMapDisplayOptions(settings: AppSettings): MapDisplayOptions {
  return {
    traceMode: settings.defaultTraceMode,
    colorMode: settings.lineColorMode === "solid" ? "solid" : "speed",
    gradientMode: settings.lineColorMode === "single-gradient" ? "single" : "multi",
    lineColor: settings.lineColor,
    heatmapMode: settings.heatmapMode,
  };
}

function mapDisplayOptionsToLineColorMode(options: MapDisplayOptions): LineColorMode {
  if (options.colorMode === "solid") return "solid";
  return options.gradientMode === "single" ? "single-gradient" : "multi-gradient";
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "activity"
  );
}
