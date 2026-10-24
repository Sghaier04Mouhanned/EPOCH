"""Synthesise Epoch's end-of-phase ring as a WAV file.

One strike of a small bell: a warm hum an octave below, the strike tone and
its octave (each a pair of slightly detuned tones, which gives a real bell
its gentle shimmer), and a few inharmonic overtones that fade fast and give
the strike its brightness. Each partial decays on its own, with a short
attack so playback never starts with a click. Standard library only, and the
output is deterministic, so regenerating gives byte-identical files.
"""

from __future__ import annotations

import argparse
import math
import struct
import wave
from dataclasses import dataclass
from pathlib import Path

SAMPLE_RATE = 22_050  # the highest partial is under 8 kHz, below the 11 kHz limit
PEAK = 0.6  # about -4.4 dBFS: present without being harsh
ATTACK_S = 0.004
FADE_OUT_S = 0.35

# (frequency ratio, relative amplitude, decay time constant in seconds, shimmer in Hz)
PARTIALS = [
    (0.5, 0.18, 2.4, 0.0),  # hum
    (1.0, 1.0, 1.8, 1.2),  # strike tone
    (2.0, 0.30, 1.1, 1.7),  # octave
    (2.76, 0.22, 0.7, 0.0),  # bell overtones: bright, gone quickly
    (5.40, 0.10, 0.25, 0.0),
    (8.93, 0.04, 0.10, 0.0),
]


@dataclass(frozen=True)
class Note:
    freq: float
    start: float
    duration: float
    gain: float = 1.0


# One ring for every phase change, so it reads as Epoch's sound rather than a signal to decode.
SOUNDS: dict[str, list[Note]] = {
    "ring": [Note(880.0, 0.0, 3.0)],
}


def bell(note: Note, sample_rate: int = SAMPLE_RATE) -> list[float]:
    n = int(note.duration * sample_rate)
    attack = max(1, int(ATTACK_S * sample_rate))
    fade = max(1, int(FADE_OUT_S * sample_rate))
    out = []
    for i in range(n):
        t = i / sample_rate
        s = 0.0
        for ratio, amp, decay, shimmer in PARTIALS:
            f = note.freq * ratio
            tone = math.sin(2 * math.pi * f * t)
            if shimmer:
                tone = (tone + math.sin(2 * math.pi * (f + shimmer) * t)) / 2
            s += amp * math.exp(-t / decay) * tone
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
