import wave

import pytest

from epoch_tools.chime import PEAK, SAMPLE_RATE, SOUNDS, Note, main, render


def test_render_length_covers_the_last_note():
    samples = render([Note(440.0, 0.0, 0.5), Note(660.0, 0.25, 0.5)])
    assert len(samples) == int(0.75 * SAMPLE_RATE)


def test_render_is_normalised_without_clipping():
    for notes in SOUNDS.values():
        samples = render(notes)
        assert abs(max(samples, key=abs)) == pytest.approx(PEAK)


def test_starts_and_ends_silent_so_playback_does_not_click():
    for notes in SOUNDS.values():
        samples = render(notes)
        assert abs(samples[0]) < 1e-3
        assert abs(samples[-1]) < 1e-3


def test_cli_writes_valid_deterministic_wavs(tmp_path):
    main(["--out", str(tmp_path / "a")])
    main(["--out", str(tmp_path / "b")])
    for name in SOUNDS:
        a, b = tmp_path / "a" / f"{name}.wav", tmp_path / "b" / f"{name}.wav"
        assert a.read_bytes() == b.read_bytes()
        with wave.open(str(a)) as w:
            assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, SAMPLE_RATE)
            assert w.getnframes() > SAMPLE_RATE  # longer than a second
