from __future__ import annotations

import json
import os
import secrets
import ssl
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from app.services.segmenter import (
    ResetArea,
    SegmenterOptions,
    build_segmenter_signals,
    build_segmentation_plan,
    build_session_data,
)

try:
    import certifi
except ImportError:  # pragma: no cover - local fallback when dependency is absent.
    certifi = None


STRAVA_API_BASE = "https://www.strava.com/api/v3"
STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
REQUIRED_SCOPES = {"read", "activity:read", "activity:read_all"}
STREAM_KEYS = [
    "time",
    "latlng",
    "distance",
    "heartrate",
    "velocity_smooth",
    "moving",
    "altitude",
    "cadence",
    "temp",
]


@dataclass
class StravaToken:
    access_token: str
    refresh_token: str
    expires_at: int
    scope: str
    athlete: dict[str, Any] | None = None


_token: StravaToken | None = None
_oauth_state: str | None = None
_token_loaded = False
_env_loaded = False


def build_authorization_url() -> str:
    client_id = get_env("STRAVA_CLIENT_ID")
    redirect_uri = get_env("STRAVA_REDIRECT_URI")
    global _oauth_state
    _oauth_state = secrets.token_urlsafe(24)

    query = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "approval_prompt": "auto",
            "scope": ",".join(["read", "activity:read", "activity:read_all"]),
            "state": _oauth_state,
        }
    )
    return f"{STRAVA_AUTH_URL}?{query}"


def exchange_code_for_token(
    code: str,
    state: str | None,
    *,
    accepted_scope: str | None = None,
) -> StravaToken:
    if not code:
        raise StravaError("Missing Strava OAuth code.")
    if not _oauth_state or state != _oauth_state:
        raise StravaError("Invalid Strava OAuth state. Please try connecting again.")
    if accepted_scope is not None:
        verify_required_scopes(accepted_scope)

    payload = {
        "client_id": get_env("STRAVA_CLIENT_ID"),
        "client_secret": get_env("STRAVA_CLIENT_SECRET"),
        "code": code,
        "grant_type": "authorization_code",
    }
    response = request_json(STRAVA_TOKEN_URL, method="POST", payload=payload, auth=False)
    token = token_from_response(response)
    if not token.scope and accepted_scope is not None:
        token.scope = accepted_scope
    verify_required_scopes(token.scope)
    set_token(token)
    return token


def is_configured() -> bool:
    load_backend_env()
    return all(
        os.environ.get(name)
        for name in ("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REDIRECT_URI")
    )


def get_connection_status() -> dict[str, Any]:
    token = get_token()
    if token is None:
        return {
            "connected": False,
            "configured": is_configured(),
            "required_scopes": sorted(REQUIRED_SCOPES),
            "storage": "local_sqlite",
        }

    if token.expires_at <= int(datetime.now().timestamp()) + 60:
        try:
            token = refresh_token(token.refresh_token)
        except StravaError:
            pass

    missing = sorted(REQUIRED_SCOPES - parse_scopes(token.scope))
    return {
        "connected": not missing,
        "configured": is_configured(),
        "athlete": token.athlete,
        "athlete_id": athlete_id_from_token(token),
        "scope": token.scope,
        "expires_at": token.expires_at,
        "missing_scopes": missing,
        "required_scopes": sorted(REQUIRED_SCOPES),
        "storage": "local_sqlite",
    }


def fetch_recent_activities(page: int = 1, per_page: int = 20) -> dict[str, Any]:
    token = require_valid_token()
    bounded_page = max(1, page)
    bounded_per_page = min(max(1, per_page), 50)
    activities = api_get(
        "/athlete/activities",
        token.access_token,
        query={"per_page": str(bounded_per_page), "page": str(bounded_page)},
    )
    if not isinstance(activities, list):
        raise StravaError("Unexpected Strava activities response.")
    return {
        "activities": [summarize_activity(activity) for activity in activities],
        "page": bounded_page,
        "per_page": bounded_per_page,
        "has_more": len(activities) == bounded_per_page,
    }


def import_activity(
    activity_id: int,
    *,
    sport: str | None = None,
    segmentation_mode: str,
    split_distance_m: float | None = None,
    split_duration_s: float | None = None,
    reset_area: ResetArea | None = None,
) -> dict[str, Any]:
    token = require_valid_token()
    activity = api_get(f"/activities/{activity_id}", token.access_token)
    streams = api_get(
        f"/activities/{activity_id}/streams",
        token.access_token,
        query={
            "keys": ",".join(STREAM_KEYS),
            "key_by_type": "true",
        },
    )
    if not isinstance(activity, dict) or not isinstance(streams, dict):
        raise StravaError("Unexpected Strava activity response.")

    raw_points = streams_to_raw_points(activity, streams)
    normalized_sport = sport or map_strava_sport(activity.get("sport_type") or activity.get("type"))
    options = SegmenterOptions(reset_area=reset_area)
    signals = build_segmenter_signals(raw_points, options)
    apply_strava_stream_overrides(signals.points, raw_points)
    plan = build_segmentation_plan(
        signals,
        options,
        mode=segmentation_mode,
        split_distance_m=split_distance_m,
        split_duration_s=split_duration_s,
    )
    session = build_session_data(
        signals,
        source_file=f"strava-{activity_id}",
        sport=normalized_sport,
        options=options,
        segmentation_plan=plan,
    )
    session["activity_name"] = activity.get("name") or session["activity_name"]
    session["source_file"] = f"strava-{activity_id}"
    session["strava_activity"] = {
        "id": activity_id,
        "name": activity.get("name"),
        "sport_type": activity.get("sport_type") or activity.get("type"),
        "pointtracer_sport": normalized_sport,
        "start_date": activity.get("start_date"),
    }
    return session


def apply_strava_stream_overrides(
    points: list[dict[str, Any]],
    raw_points: list[dict[str, Any]],
) -> None:
    for point, raw_point in zip(points, raw_points, strict=False):
        velocity = raw_point.get("strava_velocity_smooth_mps")
        if velocity is not None:
            point["speed_smooth_mps"] = float(velocity)


def require_valid_token() -> StravaToken:
    token = get_token()
    if token is None:
        raise StravaAuthError("Strava is not connected.")
    verify_required_scopes(token.scope)
    if token.expires_at <= int(datetime.now().timestamp()) + 60:
        token = refresh_token(token.refresh_token)
    return token


def refresh_token(refresh_token_value: str) -> StravaToken:
    payload = {
        "client_id": get_env("STRAVA_CLIENT_ID"),
        "client_secret": get_env("STRAVA_CLIENT_SECRET"),
        "grant_type": "refresh_token",
        "refresh_token": refresh_token_value,
    }
    response = request_json(STRAVA_TOKEN_URL, method="POST", payload=payload, auth=False)
    token = token_from_response(response)
    existing_token = get_token()
    if not token.scope and existing_token is not None:
        token.scope = existing_token.scope
    if token.athlete is None and existing_token is not None:
        token.athlete = existing_token.athlete
    verify_required_scopes(token.scope)
    set_token(token)
    return token


def streams_to_raw_points(activity: dict[str, Any], streams: dict[str, Any]) -> list[dict[str, Any]]:
    time_stream = stream_data(streams, "time")
    latlng_stream = stream_data(streams, "latlng")
    if not time_stream or not latlng_stream:
        raise StravaError(
            "This Strava activity is missing GPS/time streams, so it cannot be opened on the map yet."
        )

    start = parse_strava_datetime(activity.get("start_date"))
    heart_rates = stream_data(streams, "heartrate")
    altitude = stream_data(streams, "altitude")
    velocity = stream_data(streams, "velocity_smooth")
    cadence = stream_data(streams, "cadence")
    moving = stream_data(streams, "moving")
    temp = stream_data(streams, "temp")

    raw_points: list[dict[str, Any]] = []
    count = min(len(time_stream), len(latlng_stream))
    for index in range(count):
        latlng = latlng_stream[index]
        if not isinstance(latlng, list | tuple) or len(latlng) < 2:
            continue

        point: dict[str, Any] = {
            "lat": float(latlng[0]),
            "lon": float(latlng[1]),
            "ele": optional_float_at(altitude, index),
            "time": start + timedelta(seconds=float(time_stream[index])),
        }
        heart_rate = optional_float_at(heart_rates, index)
        if heart_rate is not None:
            point["heart_rate_bpm"] = heart_rate
        speed = optional_float_at(velocity, index)
        if speed is not None:
            point["strava_velocity_smooth_mps"] = speed
        cadence_value = optional_float_at(cadence, index)
        if cadence_value is not None:
            point["cadence"] = cadence_value
        temp_value = optional_float_at(temp, index)
        if temp_value is not None:
            point["temp_c"] = temp_value
        if moving and index < len(moving):
            point["moving"] = bool(moving[index])
        raw_points.append(point)

    if len(raw_points) < 2:
        raise StravaError("Strava activity does not contain enough usable GPS points.")

    raw_points.sort(key=lambda point: point["time"])
    return raw_points


def stream_data(streams: dict[str, Any], key: str) -> list[Any]:
    stream = streams.get(key)
    if isinstance(stream, dict) and isinstance(stream.get("data"), list):
        return stream["data"]
    return []


def optional_float_at(values: list[Any], index: int) -> float | None:
    if index >= len(values):
        return None
    try:
        if values[index] is None:
            return None
        return float(values[index])
    except (TypeError, ValueError):
        return None


def summarize_activity(activity: dict[str, Any]) -> dict[str, Any]:
    sport_type = activity.get("sport_type") or activity.get("type") or "activity"
    has_gps_hint = activity_has_gps_hint(activity)
    return {
        "id": activity.get("id"),
        "name": activity.get("name") or "Untitled activity",
        "sport_type": sport_type,
        "pointtracer_sport": map_strava_sport(sport_type),
        "start_date": activity.get("start_date"),
        "distance_m": activity.get("distance"),
        "moving_time_s": activity.get("moving_time"),
        "elapsed_time_s": activity.get("elapsed_time"),
        "has_heartrate": activity.get("has_heartrate"),
        "has_gps_hint": has_gps_hint,
        "unsupported_reason": (
            None
            if has_gps_hint
            else "This activity may not include GPS data. PointTracer needs GPS + time streams for map review."
        ),
    }


def activity_has_gps_hint(activity: dict[str, Any]) -> bool:
    if activity.get("start_latlng") or activity.get("end_latlng"):
        return True
    activity_map = activity.get("map")
    if isinstance(activity_map, dict) and activity_map.get("summary_polyline"):
        return True
    return False


def map_strava_sport(value: Any) -> str:
    sport = str(value or "").strip().lower().replace("_", " ")
    if not sport:
        return "unknown"

    if any(token in sport for token in ["squash", "racquetball"]):
        return "squash"
    if any(token in sport for token in ["tennis", "pickleball", "badminton", "racquet"]):
        return "tennis"
    if any(token in sport for token in ["ultimate", "frisbee", "disc"]):
        return "ultimate"
    if any(token in sport for token in ["run", "trail run", "virtual run"]):
        return "running"
    if any(token in sport for token in ["soccer", "football", "futsal", "field hockey", "rugby", "lacrosse"]):
        return "soccer"
    if any(token in sport for token in ["basketball", "netball"]):
        return "basketball"
    return "unknown"


def api_get(path: str, access_token: str, query: dict[str, str] | None = None) -> Any:
    url = f"{STRAVA_API_BASE}{path}"
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    return request_json(url, headers={"Authorization": f"Bearer {access_token}"})


def request_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    auth: bool = True,
) -> Any:
    request_headers = {"Accept": "application/json", **(headers or {})}
    data = None
    if payload is not None:
        data = urllib.parse.urlencode(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/x-www-form-urlencoded"

    request = urllib.request.Request(url, data=data, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=20, context=ssl_context()) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if exc.code == 429:
            raise StravaRateLimitError(
                "Strava rate limit reached. Too many requests — try again in a few minutes."
            ) from exc
        if auth and exc.code == 401:
            raise StravaAuthError("Strava authorization expired. Please reconnect Strava.") from exc
        raise StravaError(f"Strava API request failed ({exc.code}): {body}") from exc
    except urllib.error.URLError as exc:
        raise StravaError(f"Could not reach Strava: {exc.reason}") from exc


def ssl_context() -> ssl.SSLContext | None:
    if certifi is None:
        return None
    return ssl.create_default_context(cafile=certifi.where())


def token_from_response(response: dict[str, Any]) -> StravaToken:
    try:
        return StravaToken(
            access_token=str(response["access_token"]),
            refresh_token=str(response["refresh_token"]),
            expires_at=int(response["expires_at"]),
            scope=str(response.get("scope", "")),
            athlete=response.get("athlete"),
        )
    except KeyError as exc:
        raise StravaError("Strava token response was missing required fields.") from exc


def parse_strava_datetime(value: Any) -> datetime:
    if not isinstance(value, str):
        raise StravaError("Strava activity is missing start_date.")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def verify_required_scopes(scope: str) -> None:
    missing = REQUIRED_SCOPES - parse_scopes(scope)
    if missing:
        raise StravaScopeError(
            "Strava authorization is missing required scopes: " + ", ".join(sorted(missing))
        )


def parse_scopes(scope: str) -> set[str]:
    return {item.strip() for item in scope.replace(",", " ").split() if item.strip()}


def get_env(name: str) -> str:
    load_backend_env()
    value = os.environ.get(name)
    if not value:
        raise StravaConfigError(f"{name} is not configured.")
    return value


def get_frontend_redirect_url(status: str, message: str | None = None) -> str:
    load_backend_env()
    base = os.environ.get("POINTTRACER_FRONTEND_URL", "http://localhost:5173")
    query = {"strava": status}
    if message:
        query["strava_error"] = message
    return f"{base.rstrip('/')}?{urllib.parse.urlencode(query)}"


def load_backend_env() -> None:
    global _env_loaded
    if _env_loaded:
        return
    _env_loaded = True

    env_path = backend_env_path()
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def backend_env_path() -> Path:
    return Path(__file__).resolve().parents[2] / ".env"


def set_token(token: StravaToken) -> None:
    global _token
    _token = token
    persist_token(token)


def get_token() -> StravaToken | None:
    global _token_loaded
    if not _token_loaded:
        _token_loaded = True
        load_persisted_token()
    return _token


def disconnect() -> None:
    global _token
    _token = None
    with connect_token_db() as connection:
        connection.execute("delete from strava_tokens")


def load_persisted_token() -> None:
    global _token
    with connect_token_db() as connection:
        row = connection.execute(
            """
            select access_token, refresh_token, expires_at, scope, athlete_json
            from strava_tokens
            order by updated_at desc
            limit 1
            """
        ).fetchone()
    if row is None:
        return
    athlete = json.loads(row[4]) if row[4] else None
    _token = StravaToken(
        access_token=row[0],
        refresh_token=row[1],
        expires_at=int(row[2]),
        scope=row[3],
        athlete=athlete,
    )


def persist_token(token: StravaToken) -> None:
    athlete_id = athlete_id_from_token(token)
    with connect_token_db() as connection:
        connection.execute(
            """
            insert into strava_tokens (
                id,
                athlete_id,
                access_token,
                refresh_token,
                expires_at,
                scope,
                athlete_json,
                updated_at
            )
            values (1, ?, ?, ?, ?, ?, ?, ?)
            on conflict(id) do update set
                athlete_id = excluded.athlete_id,
                access_token = excluded.access_token,
                refresh_token = excluded.refresh_token,
                expires_at = excluded.expires_at,
                scope = excluded.scope,
                athlete_json = excluded.athlete_json,
                updated_at = excluded.updated_at
            """,
            (
                athlete_id,
                token.access_token,
                token.refresh_token,
                token.expires_at,
                token.scope,
                json.dumps(token.athlete or {}),
                datetime.now().isoformat(),
            ),
        )


def connect_token_db() -> sqlite3.Connection:
    path = token_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.execute(
        """
        create table if not exists strava_tokens (
            id integer primary key,
            athlete_id integer,
            access_token text not null,
            refresh_token text not null,
            expires_at integer not null,
            scope text not null,
            athlete_json text,
            updated_at text not null
        )
        """
    )
    return connection


def token_db_path() -> Path:
    configured = os.environ.get("STRAVA_TOKEN_DB_PATH")
    if configured:
        return Path(configured).expanduser()
    return Path(__file__).resolve().parents[2] / ".local" / "strava_tokens.sqlite3"


def athlete_id_from_token(token: StravaToken) -> int | None:
    athlete = token.athlete
    if not isinstance(athlete, dict):
        return None
    value = athlete.get("id")
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


class StravaError(Exception):
    pass


class StravaAuthError(StravaError):
    pass


class StravaConfigError(StravaError):
    pass


class StravaScopeError(StravaError):
    pass


class StravaRateLimitError(StravaError):
    pass
