"""Draw Epoch's app icons and favicon from one geometry.

The mark is the same as the one in the app's top bar: a ring with its first
quarter (12 to 3 o'clock) in the accent, round-capped. PNGs are rendered with
the standard library only, anti-aliased by supersampling the pixels the ring's
edges cross, and written byte-for-byte reproducibly.
"""

from __future__ import annotations

import argparse
import math
import struct
import zlib
from pathlib import Path

GROUND = (0x01, 0x01, 0x02)  # --ground
TRACK = (0x2A, 0x2C, 0x31)  # --raised-2
ACCENT = (0x5E, 0x6A, 0xD2)  # --accent
FAVICON_TRACK = "#3e3e44"  # visible on light and dark browser tabs

# In the app's 18-unit mark: ring radius 7, stroke 2.5.
RING_RADIUS = 7 / 18
STROKE = 2.5 / 18
SAMPLES = 4  # per axis, for edge pixels

# name, size in px, mark diameter as a share of the canvas
ICONS = [
    ("icon-192.png", 192, 0.72),
    ("icon-512.png", 512, 0.72),
    ("icon-maskable-512.png", 512, 0.56),  # inside the 80% safe zone of maskable icons
    ("apple-touch-icon.png", 180, 0.66),
]


def coverage(x: float, y: float, cx: float, cy: float, r: float, w: float) -> tuple[bool, bool]:
    """(on the ring, on the accent arc) for one sample point."""
    dx, dy = x - cx, y - cy
    on_ring = abs(math.hypot(dx, dy) - r) <= w / 2
    angle = math.atan2(dx, -dy)  # clockwise from 12 o'clock
    on_arc = on_ring and 0 <= angle <= math.pi / 2
    # Round caps at 12 and 3 o'clock.
    on_arc = on_arc or math.hypot(dx, dy + r) <= w / 2 or math.hypot(dx - r, dy) <= w / 2
    return on_ring or on_arc, on_arc


def blend(parts: tuple[tuple[tuple[int, int, int], int], ...]) -> tuple[int, ...]:
    """Average colours weighted by how many samples each covered."""
    total = sum(weight for _, weight in parts)
    return tuple(round(sum(c[i] * weight for c, weight in parts) / total) for i in range(3))


def render(size: int, mark_share: float) -> list[bytes]:
    """RGB rows of the icon."""
    cx = cy = size / 2
    r = size * mark_share / 2 * (RING_RADIUS / (RING_RADIUS + STROKE / 2))
    w = r * STROKE / RING_RADIUS
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            d = math.hypot(px + 0.5 - cx, py + 0.5 - cy)
            if abs(d - r) > w / 2 + 1.5:
                row += bytes(GROUND)
                continue
            ring = arc = 0
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    on_ring, on_arc = coverage(
                        px + (sx + 0.5) / SAMPLES, py + (sy + 0.5) / SAMPLES, cx, cy, r, w
                    )
                    ring += on_ring and not on_arc
                    arc += on_arc
            row += bytes(blend(((GROUND, SAMPLES**2 - ring - arc), (TRACK, ring), (ACCENT, arc))))
        rows.append(bytes(row))
    return rows


def png(rows: list[bytes]) -> bytes:
    height, width = len(rows), len(rows[0]) // 3

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    raw = b"".join(b"\x00" + row for row in rows)  # filter type 0 per row
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def favicon_svg() -> str:
    """The same mark as a scalable favicon, with a transparent ground."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">'
        f'<circle cx="9" cy="9" r="7" fill="none" stroke="{FAVICON_TRACK}" stroke-width="2.5"/>'
        '<path d="M9 2 A7 7 0 0 1 16 9" fill="none" stroke="#5e6ad2" stroke-width="2.5"'
        ' stroke-linecap="round"/></svg>\n'
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=Path("public"), help="the app's public folder")
    args = parser.parse_args(argv)
    icons = args.out / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    for name, size, share in ICONS:
        path = icons / name
        path.write_bytes(png(render(size, share)))
        print(f"wrote {path} ({size}x{size})")
    (args.out / "favicon.svg").write_text(favicon_svg(), encoding="utf-8", newline="\n")
    print(f"wrote {args.out / 'favicon.svg'}")


if __name__ == "__main__":
    main()
