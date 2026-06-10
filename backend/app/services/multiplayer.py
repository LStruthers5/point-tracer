from __future__ import annotations

import math
from datetime import datetime
from pathlib import Path
from typing import Any

from app.services.segmenter import (
    EARTH_RADIUS_M,
    compute_bbox,
    haversine_m,
    parse_fit_bytes,
    parse_gpx_bytes,
    rolling_median,
)


SUPPORTED_EXTENSIONS = {".gpx", ".fit"}


def build_multiplayer_session(
    activities: list[tuple[bytes, str, str | None]],
    *,
    sport: str,
) -> dict[str, Any]:
    """
    Build a shared-timeline multiplayer session from timestamped activities.

    Each participant keeps their own raw timing and point stream, but all x/y
    coordinates are projected against one shared origin so later replay layers
    can render multiple players in the same local meter space.
    """
    sources: list[dict[str, Any]] = []
    for index, (file_bytes, filename, label) in enumerate(activities, start=1):
        raw_points = parse_activity_points(file_bytes, filename)
        sources.append(
            {
                "label": label.strip() if label and label.strip() else f"Player {index}",
                "source_file": filename,
                "raw_points": raw_points,
            }
        )

    return build_multiplayer_session_from_sources(sources, sport=sport)


def build_multiplayer_session_from_sources(
    sources: list[dict[str, Any]],
    *,
    sport: str,
) -> dict[str, Any]:
    """
    Build a shared multiplayer session from already-parsed participant sources.

    This keeps the multiplayer builder usable for both the original multi-file
    upload path and the incremental "add player to current session" flow.
    """
    if len(sources) < 2:
        raise ValueError("At least two activities are required for multiplayer replay.")

    parsed: list[dict[str, Any]] = []
    for index, source in enumerate(sources, start=1):
        raw_points = source.get("raw_points")
        if not isinstance(raw_points, list) or len(raw_points) < 2:
            raise ValueError("Each multiplayer participant needs timed GPS trackpoints.")
        parsed.append(
            {
                "participant_id": f"p{index}",
                "label": str(source.get("label") or f"Player {index}").strip()
                or f"Player {index}",
                "source_file": str(source.get("source_file") or ""),
                "raw_points": sorted(raw_points, key=lambda point: point["time"]),
            }
        )

    all_points = [point for participant in parsed for point in participant["raw_points"]]
    if len(all_points) < 2:
        raise ValueError("Multiplayer replay requires timed GPS trackpoints.")

    origin_lat = sum(point["lat"] for point in all_points) / len(all_points)
    origin_lon = sum(point["lon"] for point in all_points) / len(all_points)
    shared_start = min(point["time"] for point in all_points)
    shared_end = max(point["time"] for point in all_points)

    participants = [
        build_participant(
            participant["participant_id"],
            participant["label"],
            participant["source_file"],
            participant["raw_points"],
            sport=sport,
            origin_lat=origin_lat,
            origin_lon=origin_lon,
            shared_start=shared_start,
        )
        for participant in parsed
    ]

    participant_points = [
        point for participant in participants for point in participant["points"]
    ]

    return {
        "session_type": "multiplayer",
        "sport": sport,
        "participant_count": len(participants),
        "summary": {
            "start_time": shared_start.isoformat(),
            "end_time": shared_end.isoformat(),
            "duration_s": round((shared_end - shared_start).total_seconds(), 3),
            "duration_min": round((shared_end - shared_start).total_seconds() / 60, 2),
            "trackpoint_count": len(participant_points),
            "bbox": compute_bbox(participant_points),
            "origin": {
                "lat": round(origin_lat, 7),
                "lon": round(origin_lon, 7),
            },
        },
        "playback": {
            "clock": "shared_timestamp",
            "start_time": shared_start.isoformat(),
            "end_time": shared_end.isoformat(),
            "duration_s": round((shared_end - shared_start).total_seconds(), 3),
            "position_strategy": "interpolate_between_neighboring_points",
        },
        "participants": participants,
    }


def multiplayer_sources_from_session(session: dict[str, Any]) -> list[dict[str, Any]]:
    session_type = session.get("session_type")
    if session_type == "multiplayer":
        participants = session.get("participants")
        if not isinstance(participants, list):
            raise ValueError("Existing multiplayer session is missing participants.")
        return [
            {
                "label": str(participant.get("label") or f"Player {index}"),
                "source_file": str(participant.get("source_file") or ""),
                "raw_points": raw_points_from_serialized_points(participant.get("points")),
            }
            for index, participant in enumerate(participants, start=1)
            if isinstance(participant, dict)
        ]

    return [
        {
            "label": str(session.get("activity_name") or session.get("source_file") or "Player 1"),
            "source_file": str(session.get("source_file") or ""),
            "raw_points": raw_points_from_serialized_points(session.get("points")),
        }
    ]


def raw_points_from_serialized_points(points: Any) -> list[dict[str, Any]]:
    if not isinstance(points, list) or len(points) < 2:
        raise ValueError("Existing session must include timed GPS points.")

    raw_points: list[dict[str, Any]] = []
    for point in points:
        if not isinstance(point, dict):
            continue
        lat = point.get("lat")
        lon = point.get("lon")
        timestamp = point.get("t")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            continue
        if not isinstance(timestamp, str):
            continue

        raw_point: dict[str, Any] = {
            "lat": float(lat),
            "lon": float(lon),
            "time": parse_iso_datetime(timestamp),
        }
        heart_rate = point.get("heart_rate_bpm")
        if isinstance(heart_rate, (int, float)):
            raw_point["heart_rate_bpm"] = float(heart_rate)
        raw_points.append(raw_point)

    if len(raw_points) < 2:
        raise ValueError("Existing session must include at least two usable timed GPS points.")
    return sorted(raw_points, key=lambda point: point["time"])


def parse_iso_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def parse_activity_points(file_bytes: bytes, filename: str) -> list[dict[str, Any]]:
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError("Only .gpx and .fit files are supported for multiplayer replay.")
    if extension == ".fit":
        return parse_fit_bytes(file_bytes)
    return parse_gpx_bytes(file_bytes)


def build_participant(
    participant_id: str,
    label: str,
    source_file: str,
    raw_points: list[dict[str, Any]],
    *,
    sport: str,
    origin_lat: float,
    origin_lon: float,
    shared_start: datetime,
) -> dict[str, Any]:
    points = enrich_shared_points(raw_points, origin_lat=origin_lat, origin_lon=origin_lon)
    first_time = raw_points[0]["time"]
    last_time = raw_points[-1]["time"]

    return {
        "participant_id": participant_id,
        "label": label,
        "source_file": source_file,
        "sport": sport,
        "summary": {
            "start_time": first_time.isoformat(),
            "end_time": last_time.isoformat(),
            "duration_s": round((last_time - first_time).total_seconds(), 3),
            "time_offset_s": round((first_time - shared_start).total_seconds(), 3),
            "trackpoint_count": len(points),
            "distance_m": round(sum(point["dist_m"] for point in points), 2),
            "bbox": compute_bbox(points),
        },
        "points": [serialize_participant_point(point) for point in points],
    }


def enrich_shared_points(
    raw_points: list[dict[str, Any]],
    *,
    origin_lat: float,
    origin_lon: float,
) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []

    for index, point in enumerate(raw_points):
        previous = raw_points[index - 1] if index > 0 else None
        if previous is None:
            dt_s = None
            dist_m = 0.0
            speed_mps = 0.0
        else:
            dt_s = (point["time"] - previous["time"]).total_seconds()
            if dt_s <= 0:
                dt_s = None
                dist_m = 0.0
                speed_mps = 0.0
            else:
                dist_m = haversine_m(
                    previous["lat"],
                    previous["lon"],
                    point["lat"],
                    point["lon"],
                )
                speed_mps = dist_m / dt_s

        x_m = (
            math.radians(point["lon"] - origin_lon)
            * EARTH_RADIUS_M
            * math.cos(math.radians(origin_lat))
        )
        y_m = math.radians(point["lat"] - origin_lat) * EARTH_RADIUS_M
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

    smoothed = rolling_median([point["speed_mps"] for point in enriched], window=7)
    for index, value in enumerate(smoothed):
        enriched[index]["speed_smooth_mps"] = 0.0 if value is None else value

    return enriched


def serialize_participant_point(point: dict[str, Any]) -> dict[str, Any]:
    serialized = {
        "lat": round(point["lat"], 7),
        "lon": round(point["lon"], 7),
        "x_m": round(point["x_m"], 2),
        "y_m": round(point["y_m"], 2),
        "t": point["time"].isoformat(),
        "speed_mps": round(point["speed_mps"], 3),
        "speed_smooth_mps": round(point["speed_smooth_mps"], 3),
    }
    heart_rate = point.get("heart_rate_bpm")
    if isinstance(heart_rate, (int, float)):
        serialized["heart_rate_bpm"] = round(float(heart_rate), 1)
    return serialized
