import json
from datetime import UTC, date, datetime, timedelta

from epoch_tools.sample import MIN, generate, main

END = date(2026, 10, 24)


def test_is_deterministic():
    assert generate(END) == generate(END)
    assert generate(END, seed=1) != generate(END, seed=2)


def test_sessions_are_ordered_and_never_overlap():
    sessions = generate(END)["sessions"]
    for a, b in zip(sessions, sessions[1:], strict=False):
        assert a["endedAt"] <= b["startedAt"]


def test_each_session_is_internally_consistent():
    for s in generate(END)["sessions"]:
        assert s["id"] == f"{s['startedAt']}-{s['phase']}"
        assert s["endedAt"] - s["startedAt"] >= s["actualMs"]  # pauses only add wall time
        assert 0 < s["actualMs"] <= s["plannedMs"]
        assert s["completed"] == (s["actualMs"] == s["plannedMs"])


def test_long_break_follows_every_fourth_completed_focus_of_a_day():
    sessions = generate(END)["sessions"]
    by_day: dict[str, list[dict]] = {}
    for s in sessions:
        day = datetime.fromtimestamp(s["startedAt"] / 1000, UTC).date().isoformat()
        by_day.setdefault(day, []).append(s)
    for day_sessions in by_day.values():
        done = 0
        for s in day_sessions:
            if s["phase"] == "focus" and s["completed"]:
                done += 1
            if s["phase"] == "longBreak":
                assert done == 4
                done = 0


def test_last_five_days_form_a_streak():
    sessions = generate(END)["sessions"]
    days = {
        datetime.fromtimestamp(s["startedAt"] / 1000, UTC).date()
        for s in sessions
        if s["phase"] == "focus" and s["completed"]
    }
    assert all(END - timedelta(days=i) in days for i in range(5))


def test_cli_writes_a_backup(tmp_path):
    out = tmp_path / "backup.json"
    main(["--out", str(out), "--days", "3"])
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["app"] == "epoch" and data["version"] == 1
    assert data["sessions"] and all(s["plannedMs"] % MIN == 0 for s in data["sessions"])
