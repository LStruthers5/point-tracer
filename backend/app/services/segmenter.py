from __future__ import annotations

import io
import math
import statistics
from pathlib import Path
from typing import Any

import gpxpy


EARTH_RADIUS_M = 6_371_000


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


def enrich_points(raw_points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Add derived fields:
    - dt_s
    - dist_m
    - speed_mps
    - x_m / y_m local coordinates
    - speed_smooth_mps
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

        enriched.append(
            {
                **point,
                "dt_s": dt_s,
                "dist_m": dist_m,
                "speed_mps": speed_mps,
                "x_m": x_m,
                "y_m": y_m,
            }
        )

    smoothed = rolling_median([p["speed_mps"] for p in enriched], window=7)

    for i, value in enumerate(smoothed):
        enriched[i]["speed_smooth_mps"] = 0.0 if value is None else value

    return enriched


def split_segments(
    points: list[dict[str, Any]],
    pause_speed_mps: float = 0.7,
    min_pause_s: float = 45.0,
    min_active_points: int = 6,
) -> list[tuple[int, int]]:
    """
    Split the session into active movement segments by detecting long low-speed windows.
    This returns only the active segments, not the pauses themselves.
    """
    pause_runs: list[tuple[int, int]] = []
    in_run = False
    run_start = 0

    for i, point in enumerate(points):
        is_pause = point["speed_smooth_mps"] < pause_speed_mps

        if is_pause and not in_run:
            in_run = True
            run_start = i

        next_is_pause = False
        if i < len(points) - 1:
            next_is_pause = points[i + 1]["speed_smooth_mps"] < pause_speed_mps

        if in_run and (i == len(points) - 1 or not next_is_pause):
            run_end = i
            duration_s = (
                points[run_end]["time"] - points[run_start]["time"]
            ).total_seconds()

            if duration_s >= min_pause_s:
                pause_runs.append((run_start, run_end))

            in_run = False

    segments: list[tuple[int, int]] = []
    prev_end = 0

    for start, end in pause_runs:
        active_start = prev_end
        active_end = start - 1

        if active_end - active_start + 1 >= min_active_points:
            segments.append((active_start, active_end))

        prev_end = end + 1

    if len(points) - prev_end >= min_active_points:
        segments.append((prev_end, len(points) - 1))

    if not segments:
        segments = [(0, len(points) - 1)]

    return segments


def build_session_data(
    points: list[dict[str, Any]],
    source_file: str,
    sport: str | None = None,
) -> dict[str, Any]:
    if not points:
        raise ValueError("No points available to build session data.")

    sport = sport
    segments = split_segments(points)

    total_dist_m = sum(p["dist_m"] for p in points)
    duration_min = (
        points[-1]["time"] - points[0]["time"]
    ).total_seconds() / 60.0

    session_points = [
        {
            "lat": round(p["lat"], 7),
            "lon": round(p["lon"], 7),
            "x_m": round(p["x_m"], 2),
            "y_m": round(p["y_m"], 2),
            "t": p["time"].isoformat(),
            "speed_mps": round(p["speed_mps"], 3),
            "speed_smooth_mps": round(p["speed_smooth_mps"], 3),
        }
        for p in points
    ]

    session_segments: list[dict[str, Any]] = []

    for segment_id, (start_idx, end_idx) in enumerate(segments, start=1):
        seg_points_raw = points[start_idx : end_idx + 1]
        seg_points_view = session_points[start_idx : end_idx + 1]

        duration_s = (
            seg_points_raw[-1]["time"] - seg_points_raw[0]["time"]
        ).total_seconds()
        distance_m = sum(p["dist_m"] for p in seg_points_raw)
        mean_speed_mps = distance_m / duration_s if duration_s > 0 else 0.0

        session_segments.append(
            {
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
        )

    return {
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
            "type": "heuristic_pause_split_v1",
            "notes": (
                "Segments are created by detecting long low-speed windows and "
                "splitting active movement periods around them."
            ),
        },
        "segments": session_segments,
        "points": session_points,
    }


def segment_gpx_bytes(file_bytes: bytes, filename: str, sport:str) -> dict[str, Any]:
    """
    Main entry point for the backend upload flow.
    Accepts GPX bytes and returns a SessionData-shaped dictionary.
    """
    raw_points = parse_gpx_bytes(file_bytes)
    enriched_points = enrich_points(raw_points)
    return build_session_data(enriched_points, source_file=filename, sport=sport)