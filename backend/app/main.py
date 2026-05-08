from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.services.segmenter import ResetArea, segment_gpx_bytes


app = FastAPI(
    title="PointSplit Backend",
    version="0.1.0",
    description="Upload GPX files, segment them heuristically, and return SessionData JSON.",
)

# Adjust this once you know your frontend dev URL exactly.
# Common Vite default is http://localhost:5173
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


ALLOWED_EXTENSIONS = {".gpx"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


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
            detail=f"Unsupported file type '{extension}'. Only .gpx is supported right now.",
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
        session_data = segment_gpx_bytes(
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
            detail="Unexpected error while processing GPX file.",
        ) from exc
