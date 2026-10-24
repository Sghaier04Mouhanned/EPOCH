import struct
import zlib

from epoch_tools.icons import ACCENT, GROUND, ICONS, TRACK, favicon_svg, main, png, render


def decode(data: bytes) -> tuple[int, int, list[bytes]]:
    """Width, height and RGB rows of a PNG written by `png` (filter 0, one IDAT)."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    width, height = struct.unpack(">II", data[16:24])
    idat = data.index(b"IDAT")
    length = struct.unpack(">I", data[idat - 4 : idat])[0]
    raw = zlib.decompress(data[idat + 4 : idat + 4 + length])
    stride = 1 + width * 3
    return width, height, [raw[i * stride + 1 : (i + 1) * stride] for i in range(height)]


def pixel(rows: list[bytes], x: int, y: int) -> tuple[int, ...]:
    return tuple(rows[y][x * 3 : x * 3 + 3])


def test_draws_the_mark_in_the_app_colours():
    size = 192
    rows = render(size, 0.72)
    outer = size * 0.72 / 2
    ring = outer * 7 / 8.25  # ring centre radius, from the 18-unit mark
    c = size // 2
    assert pixel(rows, 2, 2) == GROUND  # corner
    assert pixel(rows, c, c) == GROUND  # centre of the ring
    # 45 degrees clockwise from 12 o'clock is inside the accent quarter...
    d = round(ring / 2**0.5)
    assert pixel(rows, c + d, c - d) == ACCENT
    # ...and the opposite side is the plain track.
    assert pixel(rows, c - d, c + d) == TRACK


def test_edges_are_anti_aliased():
    rows = render(192, 0.72)
    colours = {pixel(rows, x, y) for y in range(192) for x in range(192)}
    assert len(colours) > 10  # blended edge pixels, not just three flat colours


def test_png_is_valid_and_reproducible():
    data = png(render(48, 0.72))
    width, height, rows = decode(data)
    assert (width, height, len(rows)) == (48, 48, 48)
    assert data == png(render(48, 0.72))


def test_cli_writes_every_icon_and_the_favicon(tmp_path):
    main(["--out", str(tmp_path)])
    for name, size, _ in ICONS:
        width, height, _rows = decode((tmp_path / "icons" / name).read_bytes())
        assert (width, height) == (size, size)
    assert (tmp_path / "favicon.svg").read_text(encoding="utf-8") == favicon_svg()
