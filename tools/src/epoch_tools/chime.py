"""Synthesise Epoch's end-of-phase chimes as WAV files.

Each chime is a few bell-like notes: a fundamental plus slightly inharmonic
partials, each with its own exponential decay, and a short attack so playback
never starts with a click. Standard library only, and the output is
deterministic, so regenerating the files gives byte-identical results.
"""

from __future__ import annotations

import argparse
import math
import struct
import wave
from dataclasses import dataclass
from pathlib import Path

SAMPLE_RATE = 44_100
PEAK = 0.7  # about -3 dBFS, leaves headroom for the browser mixer
ATTACK_S = 0.005
FADE_OUT_S = 0.05

# (frequency ratio, relative amplitude, decay time constant in seconds)
PARTIALS = [(1.0, 1.0, 0.9), (2.0, 0.45, 0.5), (3.01, 0.22, 0.3), (4.2, 0.1, 0.18)]


@dataclass(frozen=True)
class Note:
    freq: float
    start: float
    duration: float
    gain: float = 1.0


SOUNDS: dict[str, list[Note]] = {
    # Rising pair: focus is over, time for a break.
    "focus-complete": [Note(880.0, 0.0, 1.6), Note(1318.51, 0.18, 1.8, 0.8)],
    # Single lower tone: break is over, back to work.
    "break-complete": [Note(659.25, 0.0, 1.8)],
}


def bell(note: Note, sample_rate: int = SAMPLE_RATE) -> list[float]:
    n = int(note.duration * sample_rate)
    attack = max(1, int(ATTACK_S * sample_rate))
    fade = max(1, int(FADE_OUT_S * sample_rate))
    out = []
    for i in range(n):
        t = i / sample_rate
        s = sum(
            amp * math.exp(-t / decay) * math.sin(2 * math.pi * note.freq * ratio * t)
            for ratio, amp, decay in PARTIALS
        )
        env = min(1.0, i / attack, (n - 1 - i) / fade)
        out.append(s * env * note.gain)
    return out


def render(notes: list[Note], sample_rate: int = SAMPLE_RATE) -> list[float]:
    length = max(int((n.start + n.duration) * sample_rate) for n in notes)
    mix = [0.0] * length
    for note in notes:
        offset = int(note.start * sample_rate)
        for i, s in enumerate(bell(note, sample_rate)):
            mix[offset + i] += s
    return normalize(mix)


def normalize(samples: list[float], peak: float = PEAK) -> list[float]:
    loudest = max(abs(s) for s in samples)
    if loudest == 0:
        return samples
    return [s * peak / loudest for s in samples]


def write_wav(path: Path, samples: list[float], sample_rate: int = SAMPLE_RATE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = b"".join(struct.pack("<h", round(s * 32767)) for s in samples)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(frames)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=Path("public/sounds"), help="output directory")
    args = parser.parse_args(argv)
    for name, notes in SOUNDS.items():
        path = args.out / f"{name}.wav"
        write_wav(path, render(notes))
        print(f"wrote {path} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
