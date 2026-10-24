"""Generate a realistic sample history as an Epoch backup file.

Used to develop and screenshot the interface with believable data, and as a
fixture for tests. The output is deterministic for a given seed and end date.
It follows the same rules as the app's engine: a long break after every
fourth completed focus session, a skipped focus not counting toward it.

Timestamps are written as if the study days were in UTC; the app's dev seed
re-reads their wall-clock times in the browser's own time zone.
"""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

MIN = 60_000

DEFAULT_SETTINGS = {
    "focusMinutes": 25,
    "shortBreakMinutes": 5,
    "longBreakMinutes": 15,
    "longBreakEvery": 4,
    "autoStartBreaks": False,
    "autoStartFocus": False,
}


@dataclass
class Session:
    phase: str
    startedAt: int  # noqa: N815 - matches the backup format
    endedAt: int  # noqa: N815
    plannedMs: int  # noqa: N815
    actualMs: int  # noqa: N815
    completed: bool


class Day:
    """Simulates one study day, block by block, like someone pressing Start."""

    def __init__(self, rng: random.Random, start: datetime, settings: dict) -> None:
        self.rng = rng
        self.t = int(start.timestamp() * 1000)
        self.settings = settings
        self.in_cycle = 0
        self.sessions: list[Session] = []

    def _run(self, phase: str, planned_min: int, stop_after_min: float | None = None) -> None:
        planned = planned_min * MIN
        actual = planned if stop_after_min is None else int(stop_after_min * MIN)
        paused = 0
        if phase == "focus" and self.rng.random() < 0.12:
            paused = self.rng.randint(2, 7) * MIN
        start = self.t
        end = start + actual + paused
        self.sessions.append(Session(phase, start, end, planned, actual, stop_after_min is None))
        # A short pause before pressing Start again.
        self.t = end + self.rng.randint(0, 150) * 1000

    def focus_block(self, count: int) -> None:
        for _ in range(count):
            if self.rng.random() < 0.13:
                self._run("focus", self.settings["focusMinutes"], self.rng.uniform(6, 20))
                self._run("shortBreak", self.settings["shortBreakMinutes"])
                continue
            self._run("focus", self.settings["focusMinutes"])
            self.in_cycle += 1
            if self.in_cycle >= self.settings["longBreakEvery"]:
                self._run("longBreak", self.settings["longBreakMinutes"])
                self.in_cycle = 0
            elif self.rng.random() < 0.08:
                # Cut the break short to get back to work.
                self._run("shortBreak", self.settings["shortBreakMinutes"], self.rng.uniform(1, 4))
            else:
                self._run("shortBreak", self.settings["shortBreakMinutes"])

    def gap(self, minutes: int) -> None:
        self.t += minutes * MIN


def generate(end: date, days: int = 21, seed: int = 7, settings: dict | None = None) -> dict:
    settings = settings or DEFAULT_SETTINGS
    rng = random.Random(seed)
    sessions: list[Session] = []
    for offset in range(days - 1, -1, -1):
        day = end - timedelta(days=offset)
        # Rest days, but never in the last five, so the sample has a streak.
        if offset >= 5 and rng.random() < 0.18:
            continue
        start = datetime(day.year, day.month, day.day, 8, 0, tzinfo=UTC)
        sim = Day(rng, start + timedelta(minutes=rng.randint(20, 100)), settings)
        sim.focus_block(rng.randint(3, 6))
        sim.gap(rng.randint(45, 80))  # lunch
        sim.focus_block(rng.randint(2, 5))
        if rng.random() < 0.35:
            sim.gap(rng.randint(90, 180))  # evening review
            sim.focus_block(rng.randint(1, 3))
        sessions.extend(sim.sessions)

    return {
        "app": "epoch",
        "version": 1,
        "exportedAt": datetime(end.year, end.month, end.day, 23, 0, tzinfo=UTC)
        .isoformat()
        .replace("+00:00", "Z"),
        "settings": settings,
        "sessions": [{"id": f"{s.startedAt}-{s.phase}", **asdict(s)} for s in sessions],
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=Path("fixtures/sample-backup.json"))
    parser.add_argument("--end", type=date.fromisoformat, default=date(2026, 10, 24))
    parser.add_argument("--days", type=int, default=21)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args(argv)

    backup = generate(args.end, args.days, args.seed)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(backup, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {args.out} ({len(backup['sessions'])} sessions over {args.days} days)")


if __name__ == "__main__":
    main()
