from __future__ import annotations

import os
import json
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.services.segmenter import ResetArea, segment_activity_bytes
from app.services.multiplayer import (
    build_multiplayer_session_from_sources,
    multiplayer_sources_from_session,
    parse_activity_points,
)
from app.services import strava


strava.load_backend_env()


def get_cors_origins() -> list[str]:
    defaults = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
    ]
    configured = os.environ.get("POINTTRACER_CORS_ORIGINS", "")
    frontend_url = os.environ.get("POINTTRACER_FRONTEND_URL", "")
    values = [
        origin.strip().rstrip("/")
        for origin in configured.split(",")
        if origin.strip()
    ]
    if frontend_url.strip():
        values.append(frontend_url.strip().rstrip("/"))
    return sorted(set(defaults + values))


app = FastAPI(
    title="PointSplit Backend",
    version="0.1.0",
    description="Upload GPX files, segment them heuristically, and return SessionData JSON.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


ALLOWED_EXTENSIONS = {".gpx", ".fit"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_EXISTING_SESSION_BYTES = 25 * 1024 * 1024  # 25 MB


async def read_existing_multiplayer_sources(
    existing_session_json: str | None,
    existing_session_file: UploadFile | None,
) -> list[dict]:
    payload: str | None = existing_session_json

    if existing_session_file is not None:
        try:
            payload_bytes = await existing_session_file.read()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Failed to read existing session payload.") from exc

        if not payload_bytes:
            raise HTTPException(status_code=400, detail="Existing session payload is empty.")

        if len(payload_bytes) > MAX_EXISTING_SESSION_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    "Existing session payload is too large. "
                    f"Max size is {MAX_EXISTING_SESSION_BYTES // (1024 * 1024)} MB."
                ),
            )

        try:
            payload = payload_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise HTTPException(
                status_code=400,
                detail="Existing session payload must be UTF-8 JSON.",
            ) from exc

    if not payload:
        return []

    try:
        existing_session = json.loads(payload)
        if not isinstance(existing_session, dict):
            raise ValueError("Existing session payload must be an object.")
        return multiplayer_sources_from_session(existing_session)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail="Existing session payload must be valid JSON.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/upload/gpx")
async def upload_gpx(
    file: UploadFile = File(...),
    sport: str = Form(...),
    segmentation_mode: str = Form(default="auto"),
    split_distance_m: float | None = Form(default=None),
    split_duration_s: float | None = Form(default=None),
    reset_area_lat: float | None = Form(default=None),
    reset_area_lon: float | None = Form(default=None),
    debug: bool = Form(default=False),
) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must have a filename.")

    extension = Path(file.filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{extension}'. Only .gpx and .fit are supported right now.",
        )

    normalized_sport = sport.strip().lower()
    if not normalized_sport:
        raise HTTPException(status_code=400, detail="Sport is required.")

    normalized_segmentation_mode = segmentation_mode.strip().lower()
    if normalized_segmentation_mode not in {"auto", "distance", "time", "manual"}:
        raise HTTPException(status_code=400, detail="Unsupported segmentation mode.")

    if normalized_segmentation_mode == "distance" and (
        split_distance_m is None or split_distance_m <= 0
    ):
        raise HTTPException(
            status_code=400,
            detail="split_distance_m must be greater than 0 for distance splits.",
        )

    if normalized_segmentation_mode == "time" and (
        split_duration_s is None or split_duration_s <= 0
    ):
        raise HTTPException(
            status_code=400,
            detail="split_duration_s must be greater than 0 for time splits.",
        )

    if (reset_area_lat is None) != (reset_area_lon is None):
        raise HTTPException(
            status_code=400,
            detail="reset_area_lat and reset_area_lon must be provided together.",
        )

    reset_area = (
        ResetArea(lat=reset_area_lat, lon=reset_area_lon)
        if reset_area_lat is not None and reset_area_lon is not None
        else None
    )

    try:
        file_bytes = await file.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Failed to read uploaded file.") from exc

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is too large. Max size is {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB.",
        )

    try:
        session_data = segment_activity_bytes(
            file_bytes=file_bytes,
            filename=file.filename,
            sport=normalized_sport,
            reset_area=reset_area,
            debug=debug,
            segmentation_mode=normalized_segmentation_mode,
            split_distance_m=split_distance_m,
            split_duration_s=split_duration_s,
        )
        return session_data

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unexpected error while processing activity file.",
        ) from exc


@app.post("/api/upload/multiplayer")
async def upload_multiplayer(
    files: list[UploadFile] = File(...),
    sport: str = Form(default="unknown"),
    participant_labels: list[str] | None = Form(default=None),
    existing_session_json: str | None = Form(default=None),
    existing_session_file: UploadFile | None = File(default=None),
) -> dict:
    existing_sources = await read_existing_multiplayer_sources(
        existing_session_json,
        existing_session_file,
    )

    total_participants = len(existing_sources) + len(files)
    if total_participants < 2:
        raise HTTPException(
            status_code=400,
            detail="Add one .gpx or .fit file to the loaded session, or upload at least two files.",
        )
    if total_participants > 8:
        raise HTTPException(
            status_code=400,
            detail="Multiplayer replay currently supports up to 8 participants.",
        )

    normalized_sport = sport.strip().lower() or "unknown"
    sources = list(existing_sources)

    for index, file in enumerate(files):
        if not file.filename:
            raise HTTPException(status_code=400, detail="Every uploaded file must have a filename.")

        extension = Path(file.filename).suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{extension}'. Only .gpx and .fit are supported right now.",
            )

        try:
            file_bytes = await file.read()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to read {file.filename}.") from exc

        if not file_bytes:
            raise HTTPException(status_code=400, detail=f"{file.filename} is empty.")

        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"{file.filename} is too large. Max size is {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB.",
            )

        label = participant_labels[index] if participant_labels and index < len(participant_labels) else None
        try:
            raw_points = parse_activity_points(file_bytes, file.filename)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        sources.append(
            {
                "label": label.strip() if label and label.strip() else None,
                "source_file": file.filename,
                "raw_points": raw_points,
            }
        )

    try:
        return build_multiplayer_session_from_sources(sources, sport=normalized_sport)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unexpected error while processing multiplayer activity files.",
        ) from exc


@app.get("/api/strava/connect")
def connect_strava() -> RedirectResponse:
    try:
        return RedirectResponse(strava.build_authorization_url())
    except strava.StravaConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/strava/callback")
def strava_callback(
    code: str | None = None,
    state: str | None = None,
    scope: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    if error:
        return RedirectResponse(strava.get_frontend_redirect_url("error", error))

    try:
        strava.exchange_code_for_token(code or "", state, accepted_scope=scope)
        return RedirectResponse(strava.get_frontend_redirect_url("connected"))
    except strava.StravaScopeError as exc:
        return RedirectResponse(strava.get_frontend_redirect_url("scope_error", str(exc)))
    except strava.StravaError as exc:
        return RedirectResponse(strava.get_frontend_redirect_url("error", str(exc)))


@app.get("/api/strava/status")
def strava_status() -> dict:
    return strava.get_connection_status()


@app.get("/api/strava/activities")
def strava_activities(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=50),
) -> dict:
    try:
        return strava.fetch_recent_activities(page=page, per_page=per_page)
    except strava.StravaAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except strava.StravaScopeError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except strava.StravaError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/strava/disconnect")
def disconnect_strava() -> dict:
    strava.disconnect()
    return {"connected": False}


@app.post("/api/strava/import/{activity_id}")
async def import_strava_activity(
    activity_id: int,
    sport: str = Form(default=""),
    segmentation_mode: str = Form(default="auto"),
    split_distance_m: float | None = Form(default=None),
    split_duration_s: float | None = Form(default=None),
    reset_area_lat: float | None = Form(default=None),
    reset_area_lon: float | None = Form(default=None),
) -> dict:
    normalized_sport = sport.strip().lower() or None

    normalized_segmentation_mode = segmentation_mode.strip().lower()
    if normalized_segmentation_mode not in {"auto", "distance", "time", "manual"}:
        raise HTTPException(status_code=400, detail="Unsupported segmentation mode.")

    if normalized_segmentation_mode == "distance" and (
        split_distance_m is None or split_distance_m <= 0
    ):
        raise HTTPException(
            status_code=400,
            detail="split_distance_m must be greater than 0 for distance splits.",
        )

    if normalized_segmentation_mode == "time" and (
        split_duration_s is None or split_duration_s <= 0
    ):
        raise HTTPException(
            status_code=400,
            detail="split_duration_s must be greater than 0 for time splits.",
        )

    if (reset_area_lat is None) != (reset_area_lon is None):
        raise HTTPException(
            status_code=400,
            detail="reset_area_lat and reset_area_lon must be provided together.",
        )

    reset_area = (
        ResetArea(lat=reset_area_lat, lon=reset_area_lon)
        if reset_area_lat is not None and reset_area_lon is not None
        else None
    )

    try:
        return strava.import_activity(
            activity_id,
            sport=normalized_sport,
            segmentation_mode=normalized_segmentation_mode,
            split_distance_m=split_distance_m,
            split_duration_s=split_duration_s,
            reset_area=reset_area,
        )
    except strava.StravaAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except strava.StravaScopeError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except strava.StravaError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
