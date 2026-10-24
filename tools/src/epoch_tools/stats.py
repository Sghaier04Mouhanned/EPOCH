"""Print a study report from an Epoch backup file.

Reads the JSON file that Settings > Backup downloads and computes the same
figures as the app's Stats screen, by the same rules (src/stats/range.ts):
days are local calendar days, the daily average counts only days since your
history began, and the streak survives a today with nothing done yet. A
contract test in both languages checks the two agree on the sample history.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta, tzinfo
from pathlib import Path

MIN = 60_000
HOUR = 60 * MIN
PHASES = {"focus", "shortBreak", "longBreak"}
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@dataclass(frozen=True)
class Session:
    phase: str
    started_at: int
    ended_at: int
    planned_ms: int
    actual_ms: int
    completed: bool


@dataclass
class Report:
    today: date
    days: int
    focused_ms: int
    completed: int
    stopped_early: int
    active_days: int
    counted_days: int
    daily_average_ms: int
    current_streak: int
    longest_streak: int
    average_session_ms: int
    best_day: tuple[date, int] | None
    weekday_average_ms: list[int]  # Monday first
    hour_ms: list[float] = field(default_factory=lambda: [0.0] * 24)


def js_round(x: float) -> int:
    """Math.round from JavaScript (halves go up), so averages match the app's."""
    return math.floor(x + 0.5)


def is_number(x: object) -> bool:
    return isinstance(x, int | float) and not isinstance(x, bool) and math.isfinite(x)


def load(path: Path) -> tuple[list[Session], int]:
    """Sessions from a backup file, and how many entries were unreadable (as the app skips them)."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("app") != "epoch":
        raise ValueError("This is not an Epoch backup.")
    if data.get("version") != 1:
        raise ValueError(f"Unsupported backup version: {data.get('version')}.")
    sessions, skipped = [], 0
    for s in data.get("sessions", []):
        ok = (
            isinstance(s, dict)
            and s.get("phase") in PHASES
            and all(is_number(s.get(k)) for k in ("startedAt", "endedAt", "plannedMs", "actualMs"))
            and s["endedAt"] >= s["startedAt"]
            and s["plannedMs"] > 0
            and s["actualMs"] >= 0
            and isinstance(s.get("completed"), bool)
        )
        if not ok:
            skipped += 1
            continue
        sessions.append(
            Session(
                s["phase"],
                s["startedAt"],
                s["endedAt"],
                s["plannedMs"],
                s["actualMs"],
                s["completed"],
            )
        )
    return sorted(sessions, key=lambda s: s.started_at), skipped


def local(ms: float, tz: tzinfo | None) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz)


def report(sessions: list[Session], today: date, days: int, tz: tzinfo | None = None) -> Report:
    focus = [s for s in sessions if s.phase == "focus"]
    start = today - timedelta(days=days - 1)
    in_range = [s for s in focus if start <= local(s.started_at, tz).date() <= today]

    per_day: dict[date, int] = {}
    for s in focus:
        d = local(s.started_at, tz).date()
        per_day[d] = per_day.get(d, 0) + s.actual_ms
    range_days = [start + timedelta(days=i) for i in range(days)]
    focused = sum(per_day.get(d, 0) for d in range_days)

    first_ever = min((local(s.started_at, tz).date() for s in focus), default=today)
    count_from = max(start, first_ever)
    counted_days = max(1, (today - count_from).days + 1)

    weekday_avg = []
    for wd in range(7):
        matching = [d for d in range_days if d >= count_from and d.weekday() == wd]
        total = sum(per_day.get(d, 0) for d in matching)
        weekday_avg.append(js_round(total / len(matching)) if matching else 0)

    hours = [0.0] * 24
    for s in in_range:
        span = s.ended_at - s.started_at
        if span <= 0 or s.actual_ms <= 0:
            continue
        t = s.started_at
        while t < s.ended_at:
            dt = local(t, tz)
            next_hour = dt.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
            slice_end = min(int(next_hour.timestamp() * 1000), s.ended_at)
            hours[dt.hour] += (slice_end - t) / span * s.actual_ms
            t = slice_end

    done_days = {local(s.started_at, tz).date() for s in focus if s.completed}
    day = today if today in done_days else today - timedelta(days=1)
    current = 0
    while day in done_days:
        current += 1
        day -= timedelta(days=1)
    longest = run = 0
    prev = None
    for d in sorted(done_days):
        run = run + 1 if prev is not None and d - prev == timedelta(days=1) else 1
        longest = max(longest, run)
        prev = d

    best = max(
        ((d, per_day[d]) for d in range_days if per_day.get(d, 0) > 0),
        key=lambda x: x[1],
        default=None,
    )
    completed = sum(1 for s in in_range if s.completed)
    return Report(
        today=today,
        days=days,
        focused_ms=focused,
        completed=completed,
        stopped_early=len(in_range) - completed,
        active_days=sum(1 for d in range_days if per_day.get(d, 0) > 0),
        counted_days=counted_days,
        daily_average_ms=js_round(focused / counted_days),
        current_streak=current,
        longest_streak=longest,
        average_session_ms=js_round(sum(s.actual_ms for s in in_range) / len(in_range))
        if in_range
        else 0,
        best_day=best,
        weekday_average_ms=weekday_avg,
        hour_ms=hours,
    )


def duration(ms: float) -> str:
    """Whole minutes as the app shows them: "25 m", "1 h 05 m"."""
    minutes = int(max(0, ms) // MIN)
    h, m = divmod(minutes, 60)
    return f"{h} h {m:02d} m" if h else f"{m} m"


def plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def bar(value: float, peak: float, width: int, full: str) -> str:
    return full * (round(value / peak * width) if peak else 0)


def render(r: Report, skipped: int = 0, ascii_only: bool = False) -> str:
    full = "#" if ascii_only else "█"
    start = r.today - timedelta(days=r.days - 1)
    lines = [f"Epoch: the last {r.days} days ({start:%d %b} to {r.today:%d %b %Y})", ""]
    if r.focused_ms == 0:
        lines.append("No focus time in this period.")
        return "\n".join(lines)

    total = r.completed + r.stopped_early
    history = f" over {plural(r.counted_days, 'day')} of history" if r.counted_days < r.days else ""
    lines += [
        f"  Focused          {duration(r.focused_ms)}",
        f"  Daily average    {duration(r.daily_average_ms)}{history}",
        f"  Sessions         {r.completed} completed, {r.stopped_early} stopped early"
        f" ({js_round(r.completed / total * 100)}% as planned)",
        f"  Average session  {duration(r.average_session_ms)}",
        f"  Days with focus  {r.active_days} of {r.counted_days}",
        f"  Streak           {plural(r.current_streak, 'day')} now,"
        f" longest {plural(r.longest_streak, 'day')}",
    ]
    if r.best_day:
        lines.append(f"  Best day         {r.best_day[0]:%a %d %b}, {duration(r.best_day[1])}")

    peak = max(r.weekday_average_ms)
    lines += ["", "By weekday (average per day)"]
    for name, ms in zip(WEEKDAYS, r.weekday_average_ms, strict=True):
        lines.append(f"  {name[:3]}  {bar(ms, peak, 24, full):<24}  {duration(ms):>9}")

    top = sorted(range(24), key=lambda h: r.hour_ms[h], reverse=True)[:5]
    top = sorted(h for h in top if r.hour_ms[h] > 0)
    hour_peak = max(r.hour_ms)
    lines += ["", "Busiest hours (total in the period)"]
    for h in top:
        ms = r.hour_ms[h]
        lines.append(f"  {h:02d}:00  {bar(ms, hour_peak, 24, full):<24}  {duration(ms):>9}")
    if skipped:
        lines += ["", f"{plural(skipped, 'unreadable entry')} in the file were skipped."]
    return "\n".join(lines)


def as_json(r: Report) -> dict:
    return {
        "today": r.today.isoformat(),
        "days": r.days,
        "focusedMs": r.focused_ms,
        "completed": r.completed,
        "stoppedEarly": r.stopped_early,
        "activeDays": r.active_days,
        "countedDays": r.counted_days,
        "dailyAverageMs": r.daily_average_ms,
        "currentStreak": r.current_streak,
        "longestStreak": r.longest_streak,
        "averageSessionMs": r.average_session_ms,
        "bestDay": {"date": r.best_day[0].isoformat(), "focusedMs": r.best_day[1]}
        if r.best_day
        else None,
        "weekdayAverageMs": r.weekday_average_ms,
        "hourMs": [round(ms) for ms in r.hour_ms],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("backup", type=Path, help="a backup file from Settings > Backup")
    parser.add_argument("--days", type=int, default=30, help="length of the period (default 30)")
    parser.add_argument(
        "--today", type=date.fromisoformat, help="last day of the period, YYYY-MM-DD"
    )
    parser.add_argument("--json", action="store_true", help="print the figures as JSON")
    parser.add_argument(
        "--utc", action="store_true", help="read times in UTC, not this computer's zone"
    )
    args = parser.parse_args(argv)

    try:
        sessions, skipped = load(args.backup)
    except (OSError, ValueError) as e:
        print(f"epoch-stats: {e}", file=sys.stderr)
        return 1
    r = report(sessions, args.today or date.today(), args.days, UTC if args.utc else None)
    if args.json:
        print(json.dumps(as_json(r), indent=1))
    else:
        encoding = sys.stdout.encoding or "ascii"
        print(render(r, skipped, ascii_only="█".encode(encoding, "replace") == b"?"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
