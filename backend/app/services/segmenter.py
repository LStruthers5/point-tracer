from __future__ import annotations

import io
import math
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import gpxpy


EARTH_RADIUS_M = 6_371_000


@dataclass(frozen=True)
class ResetArea:
    lat: float
    lon: float


@dataclass(frozen=True)
class SegmenterOptions:
    pause_speed_mps: float = 0.7
    min_pause_s: float = 45.0
    min_gap_pause_s: float = 20.0
    min_short_pause_s: float = 20.0
    short_pause_speed_mps: float = 0.35
    restart_speed_mps: float = 0.9
    restart_window_points: int = 5
    restart_min_active_points: int = 3
    restart_max_scan_s: float = 90.0
    min_gameplay_segment_s: float = 20.0
    tail_start_fraction: float = 0.82
    tail_walk_speed_mps: float = 1.2
    min_active_points: int = 6
    reset_area: ResetArea | None = None
    reset_area_pause_distance_m: float = 12.0
    debug: bool = False


@dataclass(frozen=True)
class SegmentationPlan:
    ranges: list[tuple[int, int]]
    method_type: str
    notes: str
    debug: dict[str, Any] | None = None


@dataclass(frozen=True)
class SegmenterSignals:
    """
    Container for derived segmentation signals.
    Later multiplayer-aware signals can be added here without replacing the
    single-player heuristic splitter.
    """

    points: list[dict[str, Any]]
    reset_area: ResetArea | None = None


@dataclass(frozen=True)
class PauseBoundary:
    start_idx: int
    end_idx: int
    active_end_idx: int
    next_active_start_idx: int
    duration_s: float
    source: str


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance between two lat/lon points in meters."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def rolling_median(values: list[float | None], window: int = 7) -> list[float | None]:
    """Simple centered rolling median that ignores None values."""
    if window < 1:
        raise ValueError("window must be >= 1")

    half = window // 2
    out: list[float | None] = []

    for i in range(len(values)):
        start = max(0, i - half)
        end = min(len(values), i + half + 1)
        chunk = [v for v in values[start:end] if v is not None]

        if not chunk:
            out.append(None)
        else:
            out.append(float(statistics.median(chunk)))

    return out


def infer_sport(filename: str) -> str:
    name = filename.lower()
    if any(token in name for token in ["tennis", "racket", "racquet"]):
        return "tennis"
    if any(token in name for token in ["ultimate", "disc", "frisbee"]):
        return "ultimate"
    if any(token in name for token in ["run", "running", "marathon"]):
        return "running"
    return "unknown"


def compute_bbox(points: list[dict[str, Any]]) -> dict[str, float]:
    lats = [p["lat"] for p in points]
    lons = [p["lon"] for p in points]

    return {
        "min_lat": round(min(lats), 7),
        "min_lon": round(min(lons), 7),
        "max_lat": round(max(lats), 7),
        "max_lon": round(max(lons), 7),
    }


def parse_gpx_bytes(file_bytes: bytes) -> list[dict[str, Any]]:
    """
    Parse GPX bytes into a flat list of raw trackpoints.
    Each point includes lat, lon, time, and elevation if available.
    """
    gpx = gpxpy.parse(io.BytesIO(file_bytes))

    raw_points: list[dict[str, Any]] = []

    for track in gpx.tracks:
        for segment in track.segments:
            for pt in segment.points:
                if pt.time is None:
                    continue

                raw_points.append(
                    {
                        "lat": float(pt.latitude),
                        "lon": float(pt.longitude),
                        "ele": float(pt.elevation) if pt.elevation is not None else None,
                        "time": pt.time,
                    }
                )

    if len(raw_points) < 2:
        raise ValueError("GPX file does not contain enough timed trackpoints.")

    raw_points.sort(key=lambda p: p["time"])
    return raw_points


def enrich_points(
    raw_points: list[dict[str, Any]],
    reset_area: ResetArea | None = None,
) -> list[dict[str, Any]]:
    """
    Add derived fields:
    - dt_s
    - dist_m
    - speed_mps
    - x_m / y_m local coordinates
    - speed_smooth_mps
    - reset_area_distance_m, when a reset area is provided
    """
    lat0 = sum(p["lat"] for p in raw_points) / len(raw_points)
    lon0 = sum(p["lon"] for p in raw_points) / len(raw_points)

    enriched: list[dict[str, Any]] = []

    for i, point in enumerate(raw_points):
        prev = raw_points[i - 1] if i > 0 else None

        if prev is None:
            dt_s = None
            dist_m = 0.0
            speed_mps = 0.0
        else:
            dt_s = (point["time"] - prev["time"]).total_seconds()

            if dt_s is None or dt_s <= 0:
                dt_s = None
                dist_m = 0.0
                speed_mps = 0.0
            else:
                dist_m = haversine_m(
                    prev["lat"],
                    prev["lon"],
                    point["lat"],
                    point["lon"],
                )
                speed_mps = dist_m / dt_s

        x_m = math.radians(point["lon"] - lon0) * EARTH_RADIUS_M * math.cos(math.radians(lat0))
        y_m = math.radians(point["lat"] - lat0) * EARTH_RADIUS_M

        enriched_point = {
            **point,
            "dt_s": dt_s,
            "dist_m": dist_m,
            "speed_mps": speed_mps,
            "x_m": x_m,
            "y_m": y_m,
        }

        if reset_area is not None:
            enriched_point["reset_area_distance_m"] = haversine_m(
                point["lat"],
                point["lon"],
                reset_area.lat,
                reset_area.lon,
            )

        enriched.append(enriched_point)

    smoothed = rolling_median([p["speed_mps"] for p in enriched], window=7)

    for i, value in enumerate(smoothed):
        enriched[i]["speed_smooth_mps"] = 0.0 if value is None else value

    return enriched


def build_segmenter_signals(
    raw_points: list[dict[str, Any]],
    options: SegmenterOptions,
) -> SegmenterSignals:
    return SegmenterSignals(
        points=enrich_points(raw_points, reset_area=options.reset_area),
        reset_area=options.reset_area,
    )


def find_meaningful_restart_idx(
    points: list[dict[str, Any]],
    start_idx: int,
    options: SegmenterOptions,
) -> int:
    """
    Move past tiny post-pause repositioning until speed sustains again.
    If no stronger restart appears quickly, keep the original index.
    """
    if start_idx >= len(points):
        return start_idx

    scan_start_time = points[start_idx]["time"]
    max_start = len(points) - options.restart_window_points

    for idx in range(start_idx, max_start + 1):
        elapsed_s = (points[idx]["time"] - scan_start_time).total_seconds()
        if elapsed_s > options.restart_max_scan_s:
            break

        window = points[idx : idx + options.restart_window_points]
        active_points = sum(
            1
            for point in window
            if point["speed_smooth_mps"] >= options.restart_speed_mps
        )
        if active_points >= options.restart_min_active_points:
            return idx

    return start_idx


def suppress_non_gameplay_segments(
    points: list[dict[str, Any]],
    segments: list[tuple[int, int]],
    options: SegmenterOptions,
) -> tuple[list[tuple[int, int]], list[dict[str, Any]]]:
    suppressed: list[dict[str, Any]] = []
    kept: list[tuple[int, int]] = []
    total_duration_s = max(
        1.0,
        (points[-1]["time"] - points[0]["time"]).total_seconds(),
    )
    main_center_x, main_center_y, main_radius_m = estimate_main_activity_footprint(points)

    for start, end in segments:
        segment_points = points[start : end + 1]
        duration_s = (points[end]["time"] - points[start]["time"]).total_seconds()
        distance_m = sum(point["dist_m"] for point in segment_points)
        mean_speed_mps = distance_m / duration_s if duration_s > 0 else 0.0
        start_fraction = (
            (points[start]["time"] - points[0]["time"]).total_seconds()
            / total_duration_s
        )
        outside_fraction = fraction_outside_main_activity(
            segment_points,
            main_center_x,
            main_center_y,
            main_radius_m,
        )
        reason = None

        if (
            start_fraction < options.tail_start_fraction
            and duration_s < options.min_gameplay_segment_s
            and distance_m < 30.0
        ):
            reason = "suppressed_short_post_pause_motion"
        elif (
            start_fraction >= options.tail_start_fraction
            and mean_speed_mps <= options.tail_walk_speed_mps
            and outside_fraction >= 0.35
        ):
            reason = "suppressed_late_off_field_tail"

        if reason:
            suppressed.append(
                {
                    "start_idx": start,
                    "end_idx": end,
                    "start_time": points[start]["time"].isoformat(),
                    "end_time": points[end]["time"].isoformat(),
                    "duration_s": round(duration_s, 1),
                    "distance_m": round(distance_m, 1),
                    "mean_speed_mps": round(mean_speed_mps, 3),
                    "outside_main_activity_fraction": round(outside_fraction, 3),
                    "reason": reason,
                }
            )
        else:
            kept.append((start, end))

    return kept, suppressed


def estimate_main_activity_footprint(points: list[dict[str, Any]]) -> tuple[float, float, float]:
    center_x = statistics.median(point["x_m"] for point in points)
    center_y = statistics.median(point["y_m"] for point in points)
    distances = [
        math.hypot(point["x_m"] - center_x, point["y_m"] - center_y)
        for point in points
    ]
    return center_x, center_y, percentile(distances, 85) * 1.35


def fraction_outside_main_activity(
    points: list[dict[str, Any]],
    center_x: float,
    center_y: float,
    main_radius_m: float,
) -> float:
    if not points:
        return 0.0

    outside = sum(
        1
        for point in points
        if math.hypot(point["x_m"] - center_x, point["y_m"] - center_y)
        > main_radius_m
    )
    return outside / len(points)


def percentile(values: list[float], percent: float) -> float:
    if not values:
        return 0.0

    ordered = sorted(values)
    rank = (len(ordered) - 1) * percent / 100
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return ordered[int(rank)]

    weight = rank - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def split_segments(
    signals: SegmenterSignals,
    options: SegmenterOptions,
) -> tuple[list[tuple[int, int]], dict[str, Any] | None]:
    """
    Split the session into active movement segments by detecting long low-speed windows.
    This returns only the active segments, not the pauses themselves.
    """
    points = signals.points
    pause_boundaries: list[PauseBoundary] = []
    pause_candidates: list[dict[str, Any]] = []
    in_run = False
    run_start = 0

    for i in range(1, len(points)):
        gap_s = points[i].get("dt_s")
        if gap_s is None or gap_s < options.min_gap_pause_s:
            continue

        pause_boundaries.append(
            PauseBoundary(
                start_idx=i - 1,
                end_idx=i,
                active_end_idx=i - 1,
                next_active_start_idx=find_meaningful_restart_idx(points, i, options),
                duration_s=gap_s,
                source="gps_gap",
            )
        )
        pause_candidates.append(
            {
                "start_idx": i - 1,
                "end_idx": i,
                "start_time": points[i - 1]["time"].isoformat(),
                "end_time": points[i]["time"].isoformat(),
                "duration_s": round(gap_s, 1),
                "accepted": True,
                "speed_pause_points": 0,
                "reset_pause_points": 0,
                "source": "gps_gap",
                "reason": "accepted_missing_reading_gap",
            }
        )

    for i, point in enumerate(points):
        speed_pause = point["speed_smooth_mps"] < options.pause_speed_mps
        reset_distance = point.get("reset_area_distance_m")
        reset_pause = (
            reset_distance is not None
            and reset_distance <= options.reset_area_pause_distance_m
            and point["speed_smooth_mps"] < options.pause_speed_mps * 1.5
        )
        is_pause = speed_pause or reset_pause

        if is_pause and not in_run:
            in_run = True
            run_start = i

        next_is_pause = False
        if i < len(points) - 1:
            next_point = points[i + 1]
            next_reset_distance = next_point.get("reset_area_distance_m")
            next_speed_pause = next_point["speed_smooth_mps"] < options.pause_speed_mps
            next_reset_pause = (
                next_reset_distance is not None
                and next_reset_distance <= options.reset_area_pause_distance_m
                and next_point["speed_smooth_mps"] < options.pause_speed_mps * 1.5
            )
            next_is_pause = next_speed_pause or next_reset_pause

        if in_run and (i == len(points) - 1 or not next_is_pause):
            run_end = i
            duration_s = (
                points[run_end]["time"] - points[run_start]["time"]
            ).total_seconds()
            run_points = points[run_start : run_end + 1]
            speed_pause_points = sum(
                1
                for p in run_points
                if p["speed_smooth_mps"] < options.pause_speed_mps
            )
            reset_pause_points = sum(
                1
                for p in run_points
                if p.get("reset_area_distance_m") is not None
                and p["reset_area_distance_m"] <= options.reset_area_pause_distance_m
                and p["speed_smooth_mps"] < options.pause_speed_mps * 1.5
            )
            max_speed_mps = max(p["speed_smooth_mps"] for p in run_points)
            accepted = duration_s >= options.min_pause_s
            short_pause = (
                duration_s >= options.min_short_pause_s
                and max_speed_mps <= options.short_pause_speed_mps
            )
            if short_pause:
                accepted = True

            pause_candidates.append(
                {
                    "start_idx": run_start,
                    "end_idx": run_end,
                    "start_time": points[run_start]["time"].isoformat(),
                    "end_time": points[run_end]["time"].isoformat(),
                    "duration_s": round(duration_s, 1),
                    "accepted": accepted,
                    "speed_pause_points": speed_pause_points,
                    "reset_pause_points": reset_pause_points,
                    "max_speed_mps": round(max_speed_mps, 3),
                    "source": "low_speed_window",
                    "reason": (
                        "accepted_pause_window"
                        if duration_s >= options.min_pause_s
                        else "accepted_short_still_pause"
                        if accepted
                        else "rejected_below_min_pause_s"
                    ),
                }
            )

            if accepted:
                pause_boundaries.append(
                    PauseBoundary(
                        start_idx=run_start,
                        end_idx=run_end,
                        active_end_idx=run_start - 1,
                        next_active_start_idx=find_meaningful_restart_idx(
                            points,
                            run_end + 1,
                            options,
                        ),
                        duration_s=duration_s,
                        source="low_speed_window",
                    )
                )

            in_run = False

    pause_boundaries.sort(key=lambda boundary: boundary.active_end_idx)
    segments: list[tuple[int, int]] = []
    prev_end = 0

    for boundary in pause_boundaries:
        if boundary.next_active_start_idx <= prev_end:
            continue

        active_start = prev_end
        active_end = boundary.active_end_idx

        if active_end - active_start + 1 >= options.min_active_points:
            segments.append((active_start, active_end))

        prev_end = max(prev_end, boundary.next_active_start_idx)

    if len(points) - prev_end >= options.min_active_points:
        segments.append((prev_end, len(points) - 1))

    if not segments:
        segments = [(0, len(points) - 1)]

    segments, suppressed_segments = suppress_non_gameplay_segments(
        points,
        segments,
        options,
    )
    if not segments:
        segments = [(0, len(points) - 1)]

    debug = None
    if options.debug:
        debug = {
            "thresholds": {
                "pause_speed_mps": options.pause_speed_mps,
                "min_pause_s": options.min_pause_s,
                "min_gap_pause_s": options.min_gap_pause_s,
                "min_short_pause_s": options.min_short_pause_s,
                "short_pause_speed_mps": options.short_pause_speed_mps,
                "restart_speed_mps": options.restart_speed_mps,
                "restart_window_points": options.restart_window_points,
                "restart_min_active_points": options.restart_min_active_points,
                "restart_max_scan_s": options.restart_max_scan_s,
                "min_gameplay_segment_s": options.min_gameplay_segment_s,
                "tail_start_fraction": options.tail_start_fraction,
                "tail_walk_speed_mps": options.tail_walk_speed_mps,
                "min_active_points": options.min_active_points,
                "reset_area_pause_distance_m": options.reset_area_pause_distance_m,
            },
            "reset_area": (
                {"lat": signals.reset_area.lat, "lon": signals.reset_area.lon}
                if signals.reset_area
                else None
            ),
            "pause_windows": pause_candidates,
            "accepted_pause_windows": [
                {
                    "start_idx": boundary.start_idx,
                    "end_idx": boundary.end_idx,
                    "next_active_start_idx": boundary.next_active_start_idx,
                    "duration_s": round(boundary.duration_s, 1),
                    "source": boundary.source,
                }
                for boundary in pause_boundaries
            ],
            "suppressed_segments": suppressed_segments,
            "candidate_segments": [
                {
                    "start_idx": start,
                    "end_idx": end,
                    "point_count": end - start + 1,
                    "start_time": points[start]["time"].isoformat(),
                    "end_time": points[end]["time"].isoformat(),
                }
                for start, end in segments
            ],
        }

    return segments, debug


def split_by_distance(
    points: list[dict[str, Any]],
    split_distance_m: float,
    min_points: int = 2,
) -> list[tuple[int, int]]:
    if split_distance_m <= 0:
        raise ValueError("split_distance_m must be greater than 0.")

    segments: list[tuple[int, int]] = []
    start_idx = 0
    distance_in_segment = 0.0

    for idx in range(1, len(points)):
        distance_in_segment += points[idx]["dist_m"]

        if distance_in_segment >= split_distance_m and idx - start_idx + 1 >= min_points:
            segments.append((start_idx, idx))
            start_idx = idx + 1
            distance_in_segment = 0.0

    if start_idx < len(points):
        if len(points) - start_idx >= min_points:
            segments.append((start_idx, len(points) - 1))
        elif segments:
            previous_start, _ = segments[-1]
            segments[-1] = (previous_start, len(points) - 1)

    return segments


def split_by_time(
    points: list[dict[str, Any]],
    split_duration_s: float,
    min_points: int = 2,
) -> list[tuple[int, int]]:
    if split_duration_s <= 0:
        raise ValueError("split_duration_s must be greater than 0.")

    segments: list[tuple[int, int]] = []
    start_idx = 0
    segment_start_time = points[0]["time"]

    for idx in range(1, len(points)):
        elapsed_s = (points[idx]["time"] - segment_start_time).total_seconds()

        if elapsed_s >= split_duration_s and idx - start_idx + 1 >= min_points:
            segments.append((start_idx, idx))
            start_idx = idx + 1
            if start_idx < len(points):
                segment_start_time = points[start_idx]["time"]

    if start_idx < len(points):
        if len(points) - start_idx >= min_points:
            segments.append((start_idx, len(points) - 1))
        elif segments:
            previous_start, _ = segments[-1]
            segments[-1] = (previous_start, len(points) - 1)

    return segments


def build_segmentation_plan(
    signals: SegmenterSignals,
    options: SegmenterOptions,
    mode: str,
    split_distance_m: float | None = None,
    split_duration_s: float | None = None,
) -> SegmentationPlan:
    normalized_mode = mode.strip().lower().replace("-", "_")

    if normalized_mode == "auto":
        ranges, debug = split_segments(signals, options)
        return SegmentationPlan(
            ranges=ranges,
            method_type="heuristic_pause_split_v4",
            notes=(
                "Segments are created by detecting low-speed pause windows, "
                "short stillness windows, and missing-reading gaps, then "
                "delaying post-pause restarts until movement meaningfully "
                "resumes. Optional reset-area distance can support pause "
                "detection when supplied."
            ),
            debug=debug,
        )

    if normalized_mode == "distance":
        if split_distance_m is None:
            raise ValueError("split_distance_m is required for distance segmentation.")

        return SegmentationPlan(
            ranges=split_by_distance(signals.points, split_distance_m),
            method_type="distance_splits",
            notes=(
                "Segments are created at approximately every "
                f"{round(split_distance_m, 1)} meters."
            ),
        )

    if normalized_mode == "time":
        if split_duration_s is None:
            raise ValueError("split_duration_s is required for time segmentation.")

        return SegmentationPlan(
            ranges=split_by_time(signals.points, split_duration_s),
            method_type="time_splits",
            notes=(
                "Segments are created at approximately every "
                f"{round(split_duration_s, 1)} seconds."
            ),
        )

    if normalized_mode == "manual":
        return SegmentationPlan(
            ranges=[],
            method_type="manual_review",
            notes=(
                "No suggested segments were created; use the editor to create "
                "boundaries manually."
            ),
        )

    raise ValueError(f"Unsupported segmentation mode '{mode}'.")


def build_session_data(
    signals: SegmenterSignals,
    source_file: str,
    options: SegmenterOptions,
    sport: str | None = None,
    segmentation_plan: SegmentationPlan | None = None,
) -> dict[str, Any]:
    points = signals.points
    if not points:
        raise ValueError("No points available to build session data.")

    sport = sport
    plan = segmentation_plan or build_segmentation_plan(signals, options, mode="auto")
    segments = plan.ranges
    debug = plan.debug

    total_dist_m = sum(p["dist_m"] for p in points)
    duration_min = (
        points[-1]["time"] - points[0]["time"]
    ).total_seconds() / 60.0

    session_points = []

    for p in points:
        session_point = {
            "lat": round(p["lat"], 7),
            "lon": round(p["lon"], 7),
            "x_m": round(p["x_m"], 2),
            "y_m": round(p["y_m"], 2),
            "t": p["time"].isoformat(),
            "speed_mps": round(p["speed_mps"], 3),
            "speed_smooth_mps": round(p["speed_smooth_mps"], 3),
        }

        if "reset_area_distance_m" in p:
            session_point["reset_area_distance_m"] = round(
                p["reset_area_distance_m"],
                2,
            )

        session_points.append(session_point)

    session_segments: list[dict[str, Any]] = []

    for segment_id, (start_idx, end_idx) in enumerate(segments, start=1):
        seg_points_raw = points[start_idx : end_idx + 1]
        seg_points_view = session_points[start_idx : end_idx + 1]

        duration_s = (
            seg_points_raw[-1]["time"] - seg_points_raw[0]["time"]
        ).total_seconds()
        distance_m = sum(p["dist_m"] for p in seg_points_raw)
        mean_speed_mps = distance_m / duration_s if duration_s > 0 else 0.0
        reset_distances = [
            p["reset_area_distance_m"]
            for p in seg_points_raw
            if "reset_area_distance_m" in p
        ]

        session_segment = {
            "segment_id": segment_id,
            "label": f"Segment {segment_id}",
            "start_idx": start_idx,
            "end_idx": end_idx,
            "start_time": seg_points_raw[0]["time"].isoformat(),
            "end_time": seg_points_raw[-1]["time"].isoformat(),
            "duration_s": round(duration_s, 1),
            "distance_m": round(distance_m, 1),
            "mean_speed_mps": round(mean_speed_mps, 3),
            "point_count": len(seg_points_raw),
            "bbox": compute_bbox(seg_points_view),
        }
        if reset_distances:
            session_segment["reset_area_stats"] = {
                "min_distance_m": round(min(reset_distances), 1),
                "mean_distance_m": round(
                    sum(reset_distances) / len(reset_distances),
                    1,
                ),
                "start_distance_m": round(reset_distances[0], 1),
                "end_distance_m": round(reset_distances[-1], 1),
            }

        session_segments.append(session_segment)

    session_data = {
        "activity_name": Path(source_file).stem,
        "source_file": source_file,
        "sport": sport,
        "summary": {
            "start_time": points[0]["time"].isoformat(),
            "end_time": points[-1]["time"].isoformat(),
            "duration_min": round(duration_min, 1),
            "trackpoint_count": len(points),
            "distance_m": round(total_dist_m, 1),
            "bbox": compute_bbox(session_points),
        },
        "segmentation_method": {
            "type": plan.method_type,
            "notes": plan.notes,
            "reset_area_enabled": options.reset_area is not None,
        },
        "segments": session_segments,
        "points": session_points,
    }

    if debug is not None:
        session_data["segmentation_debug"] = debug

    return session_data


def segment_gpx_bytes(
    file_bytes: bytes,
    filename: str,
    sport: str,
    *,
    reset_area: ResetArea | None = None,
    debug: bool = False,
    segmentation_mode: str = "auto",
    split_distance_m: float | None = None,
    split_duration_s: float | None = None,
) -> dict[str, Any]:
    """
    Main entry point for the backend upload flow.
    Accepts GPX bytes and returns a SessionData-shaped dictionary.
    """
    raw_points = parse_gpx_bytes(file_bytes)
    options = SegmenterOptions(reset_area=reset_area, debug=debug)
    signals = build_segmenter_signals(raw_points, options)
    segmentation_plan = build_segmentation_plan(
        signals,
        options,
        mode=segmentation_mode,
        split_distance_m=split_distance_m,
        split_duration_s=split_duration_s,
    )
    return build_session_data(
        signals,
        source_file=filename,
        sport=sport,
        options=options,
        segmentation_plan=segmentation_plan,
    )
