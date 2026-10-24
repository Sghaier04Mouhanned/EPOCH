import json
from datetime import UTC, date, datetime
from pathlib import Path

from epoch_tools.stats import MIN, Session, as_json, js_round, load, main, render, report

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
TODAY = date(2026, 10, 24)


def at(d: int, h: int = 10, m: int = 0) -> int:
    return int(datetime(2026, 10, d, h, m, tzinfo=UTC).timestamp() * 1000)


def focus(start: int, minutes: int = 25, completed: bool = True, paused: int = 0) -> Session:
    return Session(
        "focus", start, start + (minutes + paused) * MIN, 25 * MIN, minutes * MIN, completed
    )


def test_matches_the_contract_shared_with_the_app():
    """The TypeScript tests check the same file (tests/statsContract.test.ts)."""
    sessions, skipped = load(FIXTURES / "sample-backup.json")
    expected = json.loads((FIXTURES / "sample-stats-30d.json").read_text(encoding="utf-8"))
    assert skipped == 0
    assert as_json(report(sessions, TODAY, 30, UTC)) == expected


def test_averages_only_over_days_since_history_began():
    r = report([focus(at(23)), focus(at(24))], TODAY, 30, UTC)
    assert (r.counted_days, r.daily_average_ms) == (2, 25 * MIN)


def test_streaks_follow_the_app_rules():
    days = [focus(at(d)) for d in (10, 11, 12, 13, 22, 23)]
    r = report(days, TODAY, 30, UTC)
    # Nothing done today yet, so the current streak counts back from yesterday.
    assert (r.current_streak, r.longest_streak) == (2, 4)
    assert report([focus(at(24), 10, completed=False)], TODAY, 7, UTC).current_streak == 0


def test_spreads_a_paused_session_across_hours():
    r = report([focus(at(24, 10, 50), 30, paused=10)], TODAY, 7, UTC)
    assert round(r.hour_ms[10]) == 7.5 * MIN and round(r.hour_ms[11]) == 22.5 * MIN


def test_rounds_like_javascript():
    assert [js_round(x) for x in (0.5, 1.5, 2.5, -0.5)] == [1, 2, 3, 0]


def test_report_text_reads_like_the_app():
    sessions, _ = load(FIXTURES / "sample-backup.json")
    text = render(report(sessions, TODAY, 30, UTC), ascii_only=True)
    assert "Focused          63 h 48 m" in text
    assert "143 completed, 21 stopped early (87% as planned)" in text
    assert "Sun  ########################" in text


def test_empty_period_and_bad_files(tmp_path, capsys):
    assert "No focus time" in render(report([], TODAY, 30, UTC))
    bad = tmp_path / "other.json"
    bad.write_text('{"app": "other"}', encoding="utf-8")
    assert main([str(bad)]) == 1
    assert "not an Epoch backup" in capsys.readouterr().err
