from __future__ import annotations

import argparse
import math
import random
import struct
import zlib
from pathlib import Path


Color = tuple[int, int, int, int]
Point = tuple[float, float]
Style = tuple[Color, Color, Color, Color]
CofactorSiteMode = str


FILL_COLOR: Color = (88, 203, 154, 255)
OUTLINE_COLOR: Color = (25, 92, 80, 255)
GROOVE_COLOR: Color = (19, 54, 61, 255)
HIGHLIGHT_COLOR: Color = (142, 235, 193, 255)
ENZYME_FILL_COLOR: Color = (127, 111, 219, 255)
ENZYME_OUTLINE_COLOR: Color = (55, 47, 130, 255)
ENZYME_GROOVE_COLOR: Color = (37, 33, 92, 255)
ENZYME_HIGHLIGHT_COLOR: Color = (183, 174, 246, 255)
COLOR_PAIRS: tuple[tuple[Color, Color], ...] = (
    ((88, 203, 154, 255), (127, 111, 219, 255)),
    ((94, 201, 235, 255), (238, 126, 126, 255)),
    ((252, 193, 96, 255), (98, 184, 230, 255)),
    ((160, 219, 99, 255), (222, 112, 198, 255)),
    ((250, 143, 92, 255), (92, 198, 179, 255)),
    ((185, 141, 236, 255), (239, 205, 91, 255)),
)
ALLOSTERIC_SITE_RADIUS_RATIO = 0.075
ALLOSTERIC_SITE_RING_RATIO = 0.016
COFACTOR_SITE_RADIUS_RATIO = 0.066
COFACTOR_SITE_RING_RATIO = 0.014
ALLOSTERIC_ASSET_FILL: Color = (231, 68, 72, 255)
COFACTOR_ASSET_FILL: Color = (62, 205, 112, 255)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def lerp(a: float, b: float, amount: float) -> float:
    return a + (b - a) * amount


def mix_color(a: Color, b: Color, amount: float) -> Color:
    return (
        round(lerp(a[0], b[0], amount)),
        round(lerp(a[1], b[1], amount)),
        round(lerp(a[2], b[2], amount)),
        round(lerp(a[3], b[3], amount)),
    )


def make_style(fill: Color) -> Style:
    outline = mix_color(fill, (0, 0, 0, 255), 0.58)
    edge = mix_color(fill, (0, 0, 0, 255), 0.72)
    highlight = mix_color(fill, (255, 255, 255, 255), 0.34)
    return fill, outline, edge, highlight


def choose_styles(rng: random.Random) -> tuple[Style, Style]:
    substrate_fill, enzyme_fill = rng.choice(COLOR_PAIRS)
    return make_style(substrate_fill), make_style(enzyme_fill)


def catmull_rom(p0: Point, p1: Point, p2: Point, p3: Point, t: float) -> Point:
    t2 = t * t
    t3 = t2 * t
    x = 0.5 * (
        (2 * p1[0])
        + (-p0[0] + p2[0]) * t
        + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
        + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
    )
    y = 0.5 * (
        (2 * p1[1])
        + (-p0[1] + p2[1]) * t
        + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
        + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
    )
    return x, y


def blend_pixel(image: bytearray, width: int, x: int, y: int, color: Color) -> None:
    if x < 0 or y < 0 or x >= width:
        return

    index = (y * width + x) * 4
    if index < 0 or index + 3 >= len(image):
        return

    src_r, src_g, src_b, src_a = color
    if src_a == 255:
        image[index : index + 4] = bytes(color)
        return

    dst_r, dst_g, dst_b, dst_a = image[index : index + 4]
    alpha = src_a / 255
    inv_alpha = 1 - alpha
    out_a = src_a + dst_a * inv_alpha
    if out_a <= 0:
        image[index : index + 4] = b"\x00\x00\x00\x00"
        return

    image[index] = round(src_r * alpha + dst_r * inv_alpha)
    image[index + 1] = round(src_g * alpha + dst_g * inv_alpha)
    image[index + 2] = round(src_b * alpha + dst_b * inv_alpha)
    image[index + 3] = round(out_a)


def draw_disc_on_opaque(
    image: bytearray,
    size: int,
    center: Point,
    radius: float,
    color: Color,
) -> None:
    min_x = math.floor(center[0] - radius)
    max_x = math.ceil(center[0] + radius)
    min_y = math.floor(center[1] - radius)
    max_y = math.ceil(center[1] + radius)

    for y in range(min_y, max_y + 1):
        py = y + 0.5
        for x in range(min_x, max_x + 1):
            px = x + 0.5
            if math.hypot(px - center[0], py - center[1]) > radius:
                continue
            if x < 0 or y < 0 or x >= size or y >= size:
                continue
            if image[(y * size + x) * 4 + 3] == 0:
                continue
            blend_pixel(image, size, x, y, color)


def draw_disc(
    image: bytearray,
    size: int,
    center: Point,
    radius: float,
    color: Color,
) -> None:
    min_x = math.floor(center[0] - radius)
    max_x = math.ceil(center[0] + radius)
    min_y = math.floor(center[1] - radius)
    max_y = math.ceil(center[1] + radius)

    for y in range(min_y, max_y + 1):
        py = y + 0.5
        for x in range(min_x, max_x + 1):
            px = x + 0.5
            if math.hypot(px - center[0], py - center[1]) > radius:
                continue
            if x < 0 or y < 0 or x >= size or y >= size:
                continue
            blend_pixel(image, size, x, y, color)


def clear_disc(image: bytearray, size: int, center: Point, radius: float) -> None:
    min_x = math.floor(center[0] - radius)
    max_x = math.ceil(center[0] + radius)
    min_y = math.floor(center[1] - radius)
    max_y = math.ceil(center[1] + radius)

    for y in range(min_y, max_y + 1):
        py = y + 0.5
        for x in range(min_x, max_x + 1):
            px = x + 0.5
            if x < 0 or y < 0 or x >= size or y >= size:
                continue
            if math.hypot(px - center[0], py - center[1]) > radius:
                continue

            index = (y * size + x) * 4
            image[index : index + 4] = b"\x00\x00\x00\x00"


def regular_polygon(center: Point, radius: float, sides: int, rotation: float = 0) -> list[Point]:
    return [
        (
            center[0] + math.cos(rotation + math.tau * index / sides) * radius,
            center[1] + math.sin(rotation + math.tau * index / sides) * radius,
        )
        for index in range(sides)
    ]


def point_in_polygon(point: Point, polygon: list[Point]) -> bool:
    inside = False
    x, y = point
    previous_x, previous_y = polygon[-1]

    for current_x, current_y in polygon:
        if (current_y > y) != (previous_y > y):
            slope_x = (previous_x - current_x) * (y - current_y) / (previous_y - current_y) + current_x
            if x < slope_x:
                inside = not inside
        previous_x, previous_y = current_x, current_y

    return inside


def draw_polygon_on_opaque(
    image: bytearray,
    size: int,
    polygon: list[Point],
    color: Color,
) -> None:
    min_x = math.floor(min(point[0] for point in polygon))
    max_x = math.ceil(max(point[0] for point in polygon))
    min_y = math.floor(min(point[1] for point in polygon))
    max_y = math.ceil(max(point[1] for point in polygon))

    for y in range(min_y, max_y + 1):
        py = y + 0.5
        for x in range(min_x, max_x + 1):
            px = x + 0.5
            if x < 0 or y < 0 or x >= size or y >= size:
                continue
            if image[(y * size + x) * 4 + 3] == 0:
                continue
            if not point_in_polygon((px, py), polygon):
                continue

            blend_pixel(image, size, x, y, color)


def draw_polygon(
    image: bytearray,
    size: int,
    polygon: list[Point],
    color: Color,
) -> None:
    min_x = math.floor(min(point[0] for point in polygon))
    max_x = math.ceil(max(point[0] for point in polygon))
    min_y = math.floor(min(point[1] for point in polygon))
    max_y = math.ceil(max(point[1] for point in polygon))

    for y in range(min_y, max_y + 1):
        py = y + 0.5
        for x in range(min_x, max_x + 1):
            px = x + 0.5
            if x < 0 or y < 0 or x >= size or y >= size:
                continue
            if not point_in_polygon((px, py), polygon):
                continue

            blend_pixel(image, size, x, y, color)


def clear_polygon(image: bytearray, size: int, polygon: list[Point]) -> None:
    min_x = math.floor(min(point[0] for point in polygon))
    max_x = math.ceil(max(point[0] for point in polygon))
    min_y = math.floor(min(point[1] for point in polygon))
    max_y = math.ceil(max(point[1] for point in polygon))

    for y in range(min_y, max_y + 1):
        py = y + 0.5
        for x in range(min_x, max_x + 1):
            px = x + 0.5
            if x < 0 or y < 0 or x >= size or y >= size:
                continue
            if not point_in_polygon((px, py), polygon):
                continue

            index = (y * size + x) * 4
            image[index : index + 4] = b"\x00\x00\x00\x00"


def cut_allosteric_site(image: bytearray, size: int, outline_color: Color) -> None:
    site_center = (size * 0.11, size * 0.5)
    site_radius = size * ALLOSTERIC_SITE_RADIUS_RATIO
    ring_width = max(2, size * ALLOSTERIC_SITE_RING_RATIO)
    draw_disc_on_opaque(image, size, site_center, site_radius + ring_width, outline_color)
    clear_disc(image, size, site_center, site_radius)


def cut_cofactor_site(image: bytearray, size: int, outline_color: Color) -> None:
    site_center = (size * 0.29, size * 0.28)
    site_radius = size * COFACTOR_SITE_RADIUS_RATIO
    ring_width = max(2, size * COFACTOR_SITE_RING_RATIO)
    rotation = math.pi / 6
    ring = regular_polygon(site_center, site_radius + ring_width, 6, rotation)
    hole = regular_polygon(site_center, site_radius, 6, rotation)
    draw_polygon_on_opaque(image, size, ring, outline_color)
    clear_polygon(image, size, hole)


def should_cut_cofactor_site(rng: random.Random, mode: CofactorSiteMode) -> bool:
    if mode == "always":
        return True
    if mode == "never":
        return False
    return rng.random() < 0.38


def draw_line_segment_on_opaque(
    image: bytearray,
    size: int,
    start: Point,
    end: Point,
    radius: float,
    color: Color,
) -> None:
    distance = math.hypot(end[0] - start[0], end[1] - start[1])
    steps = max(1, math.ceil(distance / max(radius * 0.45, 1)))
    for step in range(steps + 1):
        t = step / steps
        point = (lerp(start[0], end[0], t), lerp(start[1], end[1], t))
        draw_disc_on_opaque(image, size, point, radius, color)


def to_world(center: Point, direction: Point, normal: Point, u: float, v: float) -> Point:
    return (
        center[0] + direction[0] * u + normal[0] * v,
        center[1] + direction[1] * u + normal[1] * v,
    )


def build_split_profile(
    rng: random.Random,
    center: Point,
    radius: float,
) -> tuple[list[Point], list[Point], Point, Point]:
    angle = -math.pi / 2
    direction = (math.cos(angle), math.sin(angle))
    normal = (-direction[1], direction[0])
    half_length = radius * 1.08
    center_offset = rng.uniform(radius * 0.2, radius * 0.42)
    segment_count = rng.randint(7, 11)
    curviness = rng.uniform(0.42, 0.82)
    controls: list[Point] = []

    for index in range(segment_count + 1):
        progress = index / segment_count
        u = lerp(-half_length, half_length, progress)
        end_fade = math.sin(progress * math.pi)
        jagged_offset = rng.uniform(-radius * 0.14, radius * 0.14) * end_fade
        wave_offset = (
            math.sin(progress * math.tau * rng.uniform(0.7, 1.7) + rng.uniform(0, math.tau))
            * radius
            * 0.035
            * end_fade
        )
        v = center_offset + jagged_offset + wave_offset
        controls.append((u, v))

    sampled: list[Point] = []
    for index in range(len(controls) - 1):
        p0 = controls[max(index - 1, 0)]
        p1 = controls[index]
        p2 = controls[index + 1]
        p3 = controls[min(index + 2, len(controls) - 1)]
        steps = 5 + round(curviness * 8)
        local_curve = clamp(curviness + rng.uniform(-0.12, 0.12), 0.18, 0.94)

        for step in range(steps):
            t = step / steps
            straight = (lerp(p1[0], p2[0], t), lerp(p1[1], p2[1], t))
            curved = catmull_rom(p0, p1, p2, p3, t)
            sampled.append(
                (
                    lerp(straight[0], curved[0], local_curve),
                    lerp(straight[1], curved[1], local_curve),
                )
            )

    sampled.append(controls[-1])
    sampled.sort(key=lambda point: point[0])
    world_points = [to_world(center, direction, normal, u, v) for u, v in sampled]
    return sampled, world_points, direction, normal


def split_value_at(profile: list[Point], u: float) -> float:
    if u <= profile[0][0]:
        return profile[0][1]
    if u >= profile[-1][0]:
        return profile[-1][1]

    low = 0
    high = len(profile) - 1
    while high - low > 1:
        mid = (low + high) // 2
        if profile[mid][0] <= u:
            low = mid
        else:
            high = mid

    u0, v0 = profile[low]
    u1, v1 = profile[high]
    amount = (u - u0) / (u1 - u0)
    return lerp(v0, v1, amount)


def tint_color(base: Color, highlight: Color, point: Point, center: Point, radius: float) -> Color:
    hx = center[0] - radius * 0.24
    hy = center[1] - radius * 0.28
    strength = 1 - math.hypot(point[0] - hx, point[1] - hy) / (radius * 0.55)
    if strength <= 0:
        return base

    amount = clamp(strength * 0.38, 0, 0.38)
    return (
        round(lerp(base[0], highlight[0], amount)),
        round(lerp(base[1], highlight[1], amount)),
        round(lerp(base[2], highlight[2], amount)),
        255,
    )


def draw_split_edge(
    image: bytearray,
    size: int,
    points: list[Point],
    line_width: float,
    color: Color,
) -> None:
    for start, end in zip(points, points[1:]):
        draw_line_segment_on_opaque(image, size, start, end, line_width / 2, color)


def render_split_piece(
    size: int,
    seed: int | None,
    piece: str,
    show_split_edge: bool,
    line_width: int,
    cofactor_site: CofactorSiteMode,
) -> bytearray:
    rng = random.Random(seed)
    scale = 4
    render_size = size * scale
    image = bytearray(render_size * render_size * 4)
    center = (render_size / 2, render_size / 2)
    radius = render_size * 0.39
    outline_width = render_size * 0.028
    split_width = max(1, line_width * scale)
    substrate_style, enzyme_style = choose_styles(rng)
    profile, split_points, direction, normal = build_split_profile(rng, center, radius)
    keep_upper_side = piece == "substrate"

    if piece == "substrate":
        fill, outline, edge, highlight = substrate_style
    else:
        fill, outline, edge, highlight = enzyme_style

    for y in range(render_size):
        py = y + 0.5
        for x in range(render_size):
            px = x + 0.5
            dx = px - center[0]
            dy = py - center[1]
            circle_distance = math.hypot(dx, dy)
            if circle_distance > radius:
                continue

            u = dx * direction[0] + dy * direction[1]
            v = dx * normal[0] + dy * normal[1]
            split_v = split_value_at(profile, u)
            on_piece = v >= split_v if keep_upper_side else v < split_v
            if not on_piece:
                continue

            color = tint_color(fill, highlight, (px, py), center, radius)
            if circle_distance >= radius - outline_width:
                color = outline

            blend_pixel(image, render_size, x, y, color)

    if show_split_edge:
        draw_split_edge(image, render_size, split_points, split_width, edge)

    if piece == "enzyme":
        cut_allosteric_site(image, render_size, outline)
        if should_cut_cofactor_site(rng, cofactor_site):
            cut_cofactor_site(image, render_size, outline)

    return downsample(image, render_size, size, scale)


def downsample(image: bytearray, source_size: int, target_size: int, factor: int) -> bytearray:
    output = bytearray(target_size * target_size * 4)
    area = factor * factor

    for y in range(target_size):
        for x in range(target_size):
            totals = [0, 0, 0, 0]
            for sy in range(factor):
                source_y = y * factor + sy
                for sx in range(factor):
                    source_x = x * factor + sx
                    index = (source_y * source_size + source_x) * 4
                    totals[0] += image[index]
                    totals[1] += image[index + 1]
                    totals[2] += image[index + 2]
                    totals[3] += image[index + 3]

            output_index = (y * target_size + x) * 4
            output[output_index : output_index + 4] = bytes(
                round(channel / area) for channel in totals
            )

    return output


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    checksum = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", checksum)


def write_png(path: Path, width: int, height: int, pixels: bytearray) -> None:
    rows = bytearray()
    stride = width * 4
    for y in range(height):
        rows.append(0)
        start = y * stride
        rows.extend(pixels[start : start + stride])

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    data = b"".join(
        (
            b"\x89PNG\r\n\x1a\n",
            png_chunk(b"IHDR", header),
            png_chunk(b"IDAT", zlib.compress(bytes(rows), level=9)),
            png_chunk(b"IEND", b""),
        )
    )
    path.write_bytes(data)


def render_substrate(size: int, seed: int | None, show_split_edge: bool, line_width: int) -> bytearray:
    return render_split_piece(size, seed, "substrate", show_split_edge, line_width, "never")


def render_enzyme(
    size: int,
    seed: int | None,
    show_split_edge: bool,
    line_width: int,
    cofactor_site: CofactorSiteMode = "auto",
) -> bytearray:
    return render_split_piece(size, seed, "enzyme", show_split_edge, line_width, cofactor_site)


def render_allosteric_asset(size: int) -> tuple[int, bytearray]:
    asset_size = max(8, round(size * ALLOSTERIC_SITE_RADIUS_RATIO * 2))
    scale = 4
    render_size = asset_size * scale
    image = bytearray(render_size * render_size * 4)
    center = (render_size / 2, render_size / 2)
    radius = render_size * 0.47
    outline = mix_color(ALLOSTERIC_ASSET_FILL, (0, 0, 0, 255), 0.34)
    highlight = mix_color(ALLOSTERIC_ASSET_FILL, (255, 255, 255, 255), 0.32)

    draw_disc(image, render_size, center, radius, outline)
    draw_disc(image, render_size, center, radius * 0.82, ALLOSTERIC_ASSET_FILL)
    draw_disc(
        image,
        render_size,
        (center[0] - radius * 0.25, center[1] - radius * 0.3),
        radius * 0.22,
        highlight,
    )
    return asset_size, downsample(image, render_size, asset_size, scale)


def render_cofactor_asset(size: int) -> tuple[int, bytearray]:
    asset_size = max(8, round(size * COFACTOR_SITE_RADIUS_RATIO * 2))
    scale = 4
    render_size = asset_size * scale
    image = bytearray(render_size * render_size * 4)
    center = (render_size / 2, render_size / 2)
    radius = render_size * 0.47
    rotation = math.pi / 6
    outline = mix_color(COFACTOR_ASSET_FILL, (0, 0, 0, 255), 0.36)
    highlight = mix_color(COFACTOR_ASSET_FILL, (255, 255, 255, 255), 0.32)

    draw_polygon(image, render_size, regular_polygon(center, radius, 6, rotation), outline)
    draw_polygon(
        image,
        render_size,
        regular_polygon(center, radius * 0.82, 6, rotation),
        COFACTOR_ASSET_FILL,
    )
    draw_disc(
        image,
        render_size,
        (center[0] - radius * 0.2, center[1] - radius * 0.25),
        radius * 0.18,
        highlight,
    )
    return asset_size, downsample(image, render_size, asset_size, scale)


def output_paths(asset: str, output: str) -> list[tuple[str, Path]]:
    path = Path(output)
    names = {
        "substrate": "substrate.png",
        "enzyme": "enzyme.png",
    }

    if asset == "both":
        if path.suffix.lower() == ".png":
            return [
                ("substrate", path.with_name(f"{path.stem}_substrate.png")),
                ("enzyme", path.with_name(f"{path.stem}_enzyme.png")),
            ]
        return [
            ("substrate", path / names["substrate"]),
            ("enzyme", path / names["enzyme"]),
        ]

    if path.suffix.lower() == ".png":
        return [(asset, path)]
    return [(asset, path / names[asset])]


def render_asset(
    asset: str,
    size: int,
    seed: int,
    show_split_edge: bool,
    line_width: int,
    cofactor_site: CofactorSiteMode,
) -> bytearray:
    if asset == "substrate":
        return render_substrate(size, seed, show_split_edge, line_width)
    return render_enzyme(size, seed, show_split_edge, line_width, cofactor_site)


def write_asset_outputs(
    asset: str,
    output: Path,
    size: int,
    seed: int,
    show_split_edge: bool,
    line_width: int,
    cofactor_site: CofactorSiteMode,
) -> None:
    for asset_name, asset_output in output_paths(asset, str(output)):
        asset_output.parent.mkdir(parents=True, exist_ok=True)
        pixels = render_asset(
            asset_name,
            size,
            seed,
            show_split_edge,
            line_width,
            cofactor_site,
        )
        write_png(asset_output, size, size, pixels)
        print(f"Wrote {asset_output}")


def seed_for_index(base_seed: int | None, index: int) -> int:
    if base_seed is None:
        return random.randrange(1 << 32)
    return base_seed + index


def write_site_assets(output: Path, size: int, include_cofactor: bool) -> None:
    output.mkdir(parents=True, exist_ok=True)

    allosteric_size, allosteric_pixels = render_allosteric_asset(size)
    allosteric_output = output / "allosteric_inhibitor.png"
    write_png(allosteric_output, allosteric_size, allosteric_size, allosteric_pixels)
    print(f"Wrote {allosteric_output}")

    if include_cofactor:
        cofactor_size, cofactor_pixels = render_cofactor_asset(size)
        cofactor_output = output / "cofactor.png"
        write_png(cofactor_output, cofactor_size, cofactor_size, cofactor_pixels)
        print(f"Wrote {cofactor_output}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate transparent procedural enzyme and substrate PNG assets."
    )
    parser.add_argument(
        "--asset",
        choices=("both", "substrate", "enzyme"),
        default="both",
        help="Which asset to generate.",
    )
    parser.add_argument(
        "--output",
        default=".",
        help="Output directory, or a PNG file when generating one asset.",
    )
    parser.add_argument("--size", type=int, default=256, help="Output width and height.")
    parser.add_argument("--seed", type=int, default=None, help="Seed for repeatable assets.")
    parser.add_argument(
        "--count",
        type=int,
        default=1,
        help="Number of seeded asset sets to generate.",
    )
    parser.add_argument(
        "--line-width",
        type=int,
        default=12,
        help="Width of the matching split edge in output pixels.",
    )
    parser.add_argument(
        "--no-line",
        action="store_true",
        help="Hide the dark outline along the matching split edge.",
    )
    parser.add_argument(
        "--cofactor-site",
        choices=("auto", "always", "never"),
        default="auto",
        help=(
            "Control the extra hexagonal cofactor pocket on enzymes. "
            "Auto adds it to some seeded enzymes."
        ),
    )
    parser.add_argument(
        "--split-cofactor-output",
        action="store_true",
        help=(
            "Generate two folder families under --output: with_cofactors and "
            "without_cofactors."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.size < 16:
        raise SystemExit("--size must be at least 16 pixels")
    if args.line_width < 1:
        raise SystemExit("--line-width must be at least 1 pixel")
    if args.count < 1:
        raise SystemExit("--count must be at least 1")

    output = Path(args.output)
    if (args.count > 1 or args.split_cofactor_output) and output.suffix.lower() == ".png":
        raise SystemExit("--output must be a directory when using --count or --split-cofactor-output")

    if args.split_cofactor_output:
        write_site_assets(output, args.size, include_cofactor=True)
    elif args.count > 1:
        write_site_assets(output, args.size, include_cofactor=args.cofactor_site != "never")

    for index in range(args.count):
        seed = seed_for_index(args.seed, index)
        set_output = output if args.count == 1 else output / f"set_{index + 1}"

        if args.split_cofactor_output:
            set_name = f"set_{index + 1}"
            write_asset_outputs(
                args.asset,
                output / "without_cofactors" / set_name,
                args.size,
                seed,
                not args.no_line,
                args.line_width,
                "never",
            )
            write_asset_outputs(
                args.asset,
                output / "with_cofactors" / set_name,
                args.size,
                seed,
                not args.no_line,
                args.line_width,
                "always",
            )
        else:
            write_asset_outputs(
                args.asset,
                set_output,
                args.size,
                seed,
                not args.no_line,
                args.line_width,
                args.cofactor_site,
            )


if __name__ == "__main__":
    main()
