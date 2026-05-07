from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.services.segmenter import ResetArea, segment_gpx_bytes


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the heuristic segmenter locally and print debug metrics.",
    )
    parser.add_argument("gpx", type=Path, help="Path to a GPX file")
    parser.add_argument("--sport", default="unknown", help="Sport label to pass to the segmenter")
    parser.add_argument(
        "--reset-area",
        nargs=2,
        type=float,
        metavar=("LAT", "LON"),
        help="Optional reset-area point, for example the middle of a tennis baseline",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the full SessionData JSON including segmentation_debug",
    )
    args = parser.parse_args()

    reset_area = (
        ResetArea(lat=args.reset_area[0], lon=args.reset_area[1])
        if args.reset_area
        else None
    )
    session = segment_gpx_bytes(
        file_bytes=args.gpx.read_bytes(),
        filename=args.gpx.name,
        sport=args.sport,
        reset_area=reset_area,
        debug=True,
    )

    if args.json:
        print(json.dumps(session, indent=2))
        return

    debug = session.get("segmentation_debug", {})
    pause_windows = debug.get("pause_windows", [])
    accepted = [window for window in pause_windows if window.get("accepted")]

    print(f"Activity: {session['activity_name']}")
    print(f"Sport: {session['sport']}")
    print(f"Trackpoints: {session['summary']['trackpoint_count']}")
    print(f"Segments: {len(session['segments'])}")
    print(f"Pause windows: {len(pause_windows)} candidates, {len(accepted)} accepted")
    print(f"Thresholds: {json.dumps(debug.get('thresholds', {}), sort_keys=True)}")

    if debug.get("reset_area"):
        print(f"Reset area: {json.dumps(debug['reset_area'], sort_keys=True)}")

    print("\nSegments")
    for segment in session["segments"]:
        reset_stats = segment.get("reset_area_stats")
        reset_summary = ""
        if reset_stats:
            reset_summary = (
                f" | reset min/mean/end "
                f"{reset_stats['min_distance_m']}m/"
                f"{reset_stats['mean_distance_m']}m/"
                f"{reset_stats['end_distance_m']}m"
            )

        print(
            f"- #{segment['segment_id']} {segment['start_idx']}..{segment['end_idx']} "
            f"{segment['duration_s']}s {segment['distance_m']}m "
            f"{segment['point_count']} pts{reset_summary}"
        )

    print("\nPause candidates")
    for window in pause_windows:
        print(
            f"- {window['start_idx']}..{window['end_idx']} "
            f"{window['duration_s']}s accepted={window['accepted']} "
            f"speed_pts={window['speed_pause_points']} "
            f"reset_pts={window['reset_pause_points']} "
            f"reason={window['reason']}"
        )


if __name__ == "__main__":
    main()
