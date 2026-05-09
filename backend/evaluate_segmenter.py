from __future__ import annotations

import argparse
import html
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import Any

from app.services.segmenter import segment_gpx_bytes


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURE_ROOT = REPO_ROOT / "segmenter_fixtures" / "frisbee"
DEFAULT_REPORT_ROOT = REPO_ROOT / "backend" / "debug_reports" / "frisbee"


@dataclass(frozen=True)
class Boundary:
    segment_id: int
    start_time: datetime
    end_time: datetime


@dataclass(frozen=True)
class Match:
    expected: Boundary
    predicted: Boundary
    start_error_s: float
    end_error_s: float

    @property
    def average_error_s(self) -> float:
        return (self.start_error_s + self.end_error_s) / 2


@dataclass(frozen=True)
class ActivityResult:
    name: str
    expected_count: int
    predicted_count: int
    matches: list[Match]
    report_path: Path | None = None
    error: str | None = None

    @property
    def count_error(self) -> int:
        return self.predicted_count - self.expected_count

    @property
    def missed_segments(self) -> int:
        return max(0, self.expected_count - len(self.matches))

    @property
    def extra_segments(self) -> int:
        return max(0, self.predicted_count - len(self.matches))

    @property
    def average_start_error_s(self) -> float:
        return average([match.start_error_s for match in self.matches])

    @property
    def average_end_error_s(self) -> float:
        return average([match.end_error_s for match in self.matches])

    @property
    def average_boundary_error_s(self) -> float:
        return average([match.average_error_s for match in self.matches])

    @property
    def score(self) -> float:
        total_segments = max(self.expected_count, self.predicted_count, 1)
        count_score = len(self.matches) / total_segments
        boundary_score = max(0.0, 1.0 - self.average_boundary_error_s / 300.0)
        return 100.0 * count_score * boundary_score


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate the current segmenter against corrected boundary fixtures.",
    )
    parser.add_argument(
        "--fixtures",
        type=Path,
        default=DEFAULT_FIXTURE_ROOT,
        help=f"Fixture root to evaluate. Default: {DEFAULT_FIXTURE_ROOT}",
    )
    parser.add_argument(
        "--sport",
        default=None,
        help="Optional sport override. Defaults to each fixture JSON sport, then ultimate.",
    )
    parser.add_argument(
        "--reports",
        type=Path,
        default=DEFAULT_REPORT_ROOT,
        help=f"Directory for SVG debug reports. Default: {DEFAULT_REPORT_ROOT}",
    )
    parser.add_argument(
        "--no-reports",
        action="store_true",
        help="Skip writing visual debug reports.",
    )
    args = parser.parse_args()

    report_root = None if args.no_reports else args.reports
    results = evaluate_fixture_root(args.fixtures, sport_override=args.sport, report_root=report_root)
    print_results(results, args.fixtures, report_root=report_root)


def evaluate_fixture_root(
    fixture_root: Path,
    sport_override: str | None = None,
    report_root: Path | None = DEFAULT_REPORT_ROOT,
) -> list[ActivityResult]:
    if not fixture_root.exists():
        raise SystemExit(f"Fixture root does not exist: {fixture_root}")

    fixture_dirs = sorted(path for path in fixture_root.iterdir() if path.is_dir())
    if not fixture_dirs:
        raise SystemExit(f"No fixture folders found under: {fixture_root}")

    if report_root is not None:
        report_root.mkdir(parents=True, exist_ok=True)

    return [
        evaluate_fixture(path, sport_override=sport_override, report_root=report_root)
        for path in fixture_dirs
    ]


def evaluate_fixture(
    fixture_dir: Path,
    sport_override: str | None = None,
    report_root: Path | None = DEFAULT_REPORT_ROOT,
) -> ActivityResult:
    source_gpx = fixture_dir / "source.gpx"
    corrected_json = fixture_dir / "corrected_boundaries.json"

    try:
        if not source_gpx.exists():
            raise FileNotFoundError(f"Missing {source_gpx.name}")
        if not corrected_json.exists():
            raise FileNotFoundError(f"Missing {corrected_json.name}")

        corrected = json.loads(corrected_json.read_text())
        expected = load_boundaries(corrected.get("segments", []))
        sport = sport_override or corrected.get("sport") or "ultimate"
        predicted_session = segment_gpx_bytes(
            file_bytes=source_gpx.read_bytes(),
            filename=corrected.get("source_file") or source_gpx.name,
            sport=sport,
            debug=False,
        )
        predicted = load_boundaries(predicted_session.get("segments", []))
        matches = match_boundaries(expected, predicted)
        report_path = None
        if report_root is not None:
            report_path = report_root / f"{fixture_dir.name}.svg"
            write_debug_report(
                report_path=report_path,
                activity_name=fixture_dir.name,
                points=predicted_session.get("points", []),
                expected=expected,
                predicted=predicted,
                matches=matches,
            )

        return ActivityResult(
            name=fixture_dir.name,
            expected_count=len(expected),
            predicted_count=len(predicted),
            matches=matches,
            report_path=report_path,
        )
    except Exception as exc:
        return ActivityResult(
            name=fixture_dir.name,
            expected_count=0,
            predicted_count=0,
            matches=[],
            error=str(exc),
        )


def load_boundaries(raw_segments: list[dict[str, Any]]) -> list[Boundary]:
    boundaries: list[Boundary] = []

    for index, segment in enumerate(raw_segments, start=1):
        boundaries.append(
            Boundary(
                segment_id=int(segment.get("segment_id") or index),
                start_time=parse_time(segment["start_time"]),
                end_time=parse_time(segment["end_time"]),
            )
        )

    return boundaries


def match_boundaries(expected: list[Boundary], predicted: list[Boundary]) -> list[Match]:
    pair_candidates: list[tuple[float, int, int, Match]] = []

    for expected_index, expected_boundary in enumerate(expected):
        for predicted_index, predicted_boundary in enumerate(predicted):
            start_error_s = seconds_between(
                predicted_boundary.start_time,
                expected_boundary.start_time,
            )
            end_error_s = seconds_between(
                predicted_boundary.end_time,
                expected_boundary.end_time,
            )
            match = Match(
                expected=expected_boundary,
                predicted=predicted_boundary,
                start_error_s=start_error_s,
                end_error_s=end_error_s,
            )
            pair_candidates.append(
                (start_error_s + end_error_s, expected_index, predicted_index, match)
            )

    pair_candidates.sort(key=lambda candidate: candidate[0])
    used_expected: set[int] = set()
    used_predicted: set[int] = set()
    matches: list[Match] = []

    for _, expected_index, predicted_index, match in pair_candidates:
        if expected_index in used_expected or predicted_index in used_predicted:
            continue

        used_expected.add(expected_index)
        used_predicted.add(predicted_index)
        matches.append(match)

    matches.sort(key=lambda match: match.expected.start_time)
    return matches


def print_results(
    results: list[ActivityResult],
    fixture_root: Path,
    report_root: Path | None = DEFAULT_REPORT_ROOT,
) -> None:
    print(f"Segmenter evaluation fixtures: {fixture_root}")
    print(f"Activities: {len(results)}")
    if report_root is not None:
        print(f"Debug reports: {report_root}")
    print()

    successful = [result for result in results if result.error is None]
    failed = [result for result in results if result.error is not None]

    for result in results:
        print_activity_result(result)

    print("Aggregate")
    print("---------")
    if successful:
        print(f"Evaluated activities: {len(successful)}/{len(results)}")
        print(f"Expected segments: {sum(result.expected_count for result in successful)}")
        print(f"Predicted segments: {sum(result.predicted_count for result in successful)}")
        print(f"Total count error: {sum(result.count_error for result in successful):+d}")
        print(
            "Average start boundary error: "
            f"{format_seconds(average([result.average_start_error_s for result in successful]))}"
        )
        print(
            "Average end boundary error: "
            f"{format_seconds(average([result.average_end_error_s for result in successful]))}"
        )
        print(
            "Average total boundary error: "
            f"{format_seconds(average([result.average_boundary_error_s for result in successful]))}"
        )
        print(f"Average score: {average([result.score for result in successful]):.1f}/100")
        print(f"Missed segments: {sum(result.missed_segments for result in successful)}")
        print(f"Extra segments: {sum(result.extra_segments for result in successful)}")
    else:
        print("No fixtures evaluated successfully.")

    if failed:
        print()
        print("Failed fixtures")
        print("---------------")
        for result in failed:
            print(f"- {result.name}: {result.error}")


def print_activity_result(result: ActivityResult) -> None:
    print(result.name)
    print("-" * len(result.name))

    if result.error:
        print(f"ERROR: {result.error}")
        print()
        return

    print(f"Expected segments: {result.expected_count}")
    print(f"Predicted segments: {result.predicted_count}")
    print(f"Count error: {result.count_error:+d}")
    print(f"Matched segments: {len(result.matches)}")
    print(f"Missed segments: {result.missed_segments}")
    print(f"Extra segments: {result.extra_segments}")
    print(f"Average start boundary error: {format_seconds(result.average_start_error_s)}")
    print(f"Average end boundary error: {format_seconds(result.average_end_error_s)}")
    print(f"Average total boundary error: {format_seconds(result.average_boundary_error_s)}")
    print(f"Score: {result.score:.1f}/100")
    if result.report_path:
        print(f"Debug report: {result.report_path}")
    print()


def write_debug_report(
    report_path: Path,
    activity_name: str,
    points: list[dict[str, Any]],
    expected: list[Boundary],
    predicted: list[Boundary],
    matches: list[Match],
) -> None:
    if not points:
        report_path.write_text(empty_report(activity_name))
        return

    start_time = parse_time(points[0]["t"])
    end_time = parse_time(points[-1]["t"])
    duration_s = max(1.0, (end_time - start_time).total_seconds())
    speeds = [float(point.get("speed_smooth_mps") or point.get("speed_mps") or 0.0) for point in points]
    max_speed = max(1.0, *speeds)
    width = 1200
    height = 520
    plot_left = 90
    plot_right = 1160
    timeline_top = 72
    timeline_height = 34
    predicted_top = 130
    graph_top = 220
    graph_bottom = 450
    plot_width = plot_right - plot_left
    match_lines = build_match_lines(matches, start_time, duration_s, plot_left, plot_width)
    speed_path = build_speed_path(points, start_time, duration_s, max_speed, plot_left, plot_width, graph_top, graph_bottom)
    x_ticks = build_report_time_ticks(duration_s)

    svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520">',
        "<style>",
        "text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#334155}",
        ".muted{fill:#64748b;font-size:13px}.label{font-size:14px;font-weight:700}",
        ".title{font-size:22px;font-weight:800}.axis{stroke:#cbd5e1;stroke-width:1}",
        ".grid{stroke:#e2e8f0;stroke-width:1}.speed{fill:none;stroke:#2563eb;stroke-width:2}",
        ".expected{fill:#22c55e;opacity:.72}.predicted{fill:#f97316;opacity:.72}",
        ".expected-line{stroke:#15803d;stroke-width:1.5;opacity:.85}",
        ".predicted-line{stroke:#c2410c;stroke-width:1.5;opacity:.85}",
        ".match{stroke:#94a3b8;stroke-width:1;opacity:.45}",
        "</style>",
        "<rect width='1200' height='520' fill='#f8fafc'/>",
        f"<text x='40' y='38' class='title'>{xml(activity_name)}</text>",
        "<text x='40' y='64' class='muted'>Corrected boundaries vs current segmenter output</text>",
        "<text x='40' y='94' class='label'>Corrected</text>",
        "<text x='40' y='152' class='label'>Predicted</text>",
        f"<line x1='{plot_left}' y1='185' x2='{plot_right}' y2='185' class='axis'/>",
    ]

    for tick in x_ticks:
        x = plot_left + (tick / duration_s) * plot_width
        svg.append(f"<line x1='{x:.1f}' y1='70' x2='{x:.1f}' y2='{graph_bottom}' class='grid'/>")
        svg.append(f"<text x='{x:.1f}' y='204' text-anchor='middle' class='muted'>{format_elapsed(tick)}</text>")

    svg.extend(render_segments(expected, start_time, duration_s, plot_left, plot_width, timeline_top, timeline_height, "expected"))
    svg.extend(render_segments(predicted, start_time, duration_s, plot_left, plot_width, predicted_top, timeline_height, "predicted"))
    svg.extend(match_lines)
    svg.append("<text x='40' y='236' class='label'>Speed</text>")
    svg.append(f"<line x1='{plot_left}' y1='{graph_bottom}' x2='{plot_right}' y2='{graph_bottom}' class='axis'/>")
    svg.append(f"<line x1='{plot_left}' y1='{graph_top}' x2='{plot_left}' y2='{graph_bottom}' class='axis'/>")

    for ratio in (0.25, 0.5, 0.75, 1.0):
        y = graph_bottom - ratio * (graph_bottom - graph_top)
        speed_kmh = max_speed * ratio * 3.6
        svg.append(f"<line x1='{plot_left}' y1='{y:.1f}' x2='{plot_right}' y2='{y:.1f}' class='grid'/>")
        svg.append(f"<text x='{plot_left - 10}' y='{y + 4:.1f}' text-anchor='end' class='muted'>{speed_kmh:.0f} km/h</text>")

    svg.append(f"<path d='{speed_path}' class='speed'/>")
    svg.extend(render_boundary_lines(expected, start_time, duration_s, plot_left, plot_width, graph_top, graph_bottom, "expected-line"))
    svg.extend(render_boundary_lines(predicted, start_time, duration_s, plot_left, plot_width, graph_top, graph_bottom, "predicted-line"))
    svg.append("<rect x='890' y='28' width='250' height='74' rx='12' fill='white' stroke='#cbd5e1'/>")
    svg.append("<rect x='910' y='48' width='18' height='12' class='expected'/>")
    svg.append("<text x='936' y='59' class='muted'>Corrected segments</text>")
    svg.append("<rect x='910' y='76' width='18' height='12' class='predicted'/>")
    svg.append("<text x='936' y='87' class='muted'>Predicted segments</text>")
    svg.append("</svg>")
    report_path.write_text("\n".join(svg) + "\n")


def render_segments(
    boundaries: list[Boundary],
    start_time: datetime,
    duration_s: float,
    plot_left: int,
    plot_width: int,
    y: int,
    height: int,
    class_name: str,
) -> list[str]:
    elements = []
    for boundary in boundaries:
        x1 = time_to_x(boundary.start_time, start_time, duration_s, plot_left, plot_width)
        x2 = time_to_x(boundary.end_time, start_time, duration_s, plot_left, plot_width)
        width = max(2, x2 - x1)
        elements.append(f"<rect x='{x1:.1f}' y='{y}' width='{width:.1f}' height='{height}' rx='4' class='{class_name}'/>")
    return elements


def render_boundary_lines(
    boundaries: list[Boundary],
    start_time: datetime,
    duration_s: float,
    plot_left: int,
    plot_width: int,
    top: int,
    bottom: int,
    class_name: str,
) -> list[str]:
    elements = []
    for boundary in boundaries:
        for value in (boundary.start_time, boundary.end_time):
            x = time_to_x(value, start_time, duration_s, plot_left, plot_width)
            elements.append(f"<line x1='{x:.1f}' y1='{top}' x2='{x:.1f}' y2='{bottom}' class='{class_name}'/>")
    return elements


def build_match_lines(
    matches: list[Match],
    start_time: datetime,
    duration_s: float,
    plot_left: int,
    plot_width: int,
) -> list[str]:
    elements = []
    for match in matches:
        expected_mid = midpoint_time(match.expected)
        predicted_mid = midpoint_time(match.predicted)
        x1 = time_to_x(expected_mid, start_time, duration_s, plot_left, plot_width)
        x2 = time_to_x(predicted_mid, start_time, duration_s, plot_left, plot_width)
        elements.append(f"<line x1='{x1:.1f}' y1='106' x2='{x2:.1f}' y2='130' class='match'/>")
    return elements


def build_speed_path(
    points: list[dict[str, Any]],
    start_time: datetime,
    duration_s: float,
    max_speed: float,
    plot_left: int,
    plot_width: int,
    graph_top: int,
    graph_bottom: int,
) -> str:
    commands = []
    for index, point in enumerate(points):
        point_time = parse_time(point["t"])
        speed = float(point.get("speed_smooth_mps") or point.get("speed_mps") or 0.0)
        x = time_to_x(point_time, start_time, duration_s, plot_left, plot_width)
        y = graph_bottom - (speed / max_speed) * (graph_bottom - graph_top)
        commands.append(f"{'M' if index == 0 else 'L'} {x:.1f} {y:.1f}")
    return " ".join(commands)


def build_report_time_ticks(duration_s: float) -> list[int]:
    step = pick_report_time_step(duration_s / 6)
    ticks = [0]
    value = step

    while value < duration_s:
        ticks.append(round(value))
        value += step

    rounded_duration = round(duration_s)
    if rounded_duration - ticks[-1] < step * 0.45 and len(ticks) > 1:
        ticks[-1] = rounded_duration
    elif ticks[-1] != rounded_duration:
        ticks.append(rounded_duration)

    return ticks[:8]


def pick_report_time_step(raw_step_s: float) -> int:
    steps = [30, 60, 120, 300, 600, 900, 1800, 3600]
    return next((step for step in steps if step >= raw_step_s), steps[-1])


def time_to_x(
    value: datetime,
    start_time: datetime,
    duration_s: float,
    plot_left: int,
    plot_width: int,
) -> float:
    elapsed_s = (value - start_time).total_seconds()
    clamped = max(0.0, min(duration_s, elapsed_s))
    return plot_left + (clamped / duration_s) * plot_width


def midpoint_time(boundary: Boundary) -> datetime:
    return boundary.start_time + (boundary.end_time - boundary.start_time) / 2


def format_elapsed(seconds: float) -> str:
    seconds = round(seconds)
    if seconds < 60:
        return f"{seconds}s"

    minutes = seconds // 60
    remaining_seconds = seconds % 60
    if minutes < 60:
        return (
            f"{minutes}m"
            if remaining_seconds == 0
            else f"{minutes}:{remaining_seconds:02d}"
        )

    hours = minutes // 60
    remaining_minutes = minutes % 60
    return f"{hours}h" if remaining_minutes == 0 else f"{hours}h {remaining_minutes}m"


def xml(value: object) -> str:
    return html.escape(str(value), quote=True)


def empty_report(activity_name: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="180" '
        'viewBox="0 0 800 180">'
        '<rect width="800" height="180" fill="#f8fafc"/>'
        f'<text x="32" y="48" font-size="22" font-family="sans-serif">{xml(activity_name)}</text>'
        '<text x="32" y="86" font-size="14" font-family="sans-serif" fill="#64748b">'
        "No points available for this debug report."
        "</text></svg>\n"
    )


def parse_time(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def seconds_between(left: datetime, right: datetime) -> float:
    return abs((left - right).total_seconds())


def average(values: list[float]) -> float:
    return mean(values) if values else 0.0


def format_seconds(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"

    minutes = seconds / 60
    return f"{minutes:.1f}m"


if __name__ == "__main__":
    main()
