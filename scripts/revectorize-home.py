"""Rebuild traced Home artwork as clean, smooth vector layers.

The Home stickers were traced from a 1365 x 1024 bitmap, which left faceted
edges, notches, stray slivers in near-identical colours and blobby halftone
dots. This script takes a high-resolution render of a traced SVG and:

1. snaps every pixel to a small palette (the SVG's own fill colours, merged),
2. absorbs specks and slivers into the surrounding colour,
3. stacks one layer per colour (outermost first, each layer reaching a
   little under the layers above it, so no seams can open between colours),
4. smooths each layer with a Gaussian and traces it at sub-pixel precision,
5. turns small round blobs into exact circles (halftone dots),
6. writes smooth cubic paths in the original viewBox.

Usage:
  python3 scripts/revectorize-home.py <render.png> <source.svg> <out.svg> \
      [--scale 6] [--sigma 1.2] [--palette "#..,#.."] [--speck 12] [--dots 0]

The render must be the source SVG drawn at --scale pixels per viewBox unit
with a transparent background (any browser can produce it).
"""
import argparse
import re

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("render")
    p.add_argument("source")
    p.add_argument("out")
    p.add_argument("--scale", type=float, default=6, help="render pixels per viewBox unit")
    p.add_argument("--sigma", type=float, default=1.2, help="edge smoothing, in viewBox units")
    p.add_argument("--merge", type=float, default=30, help="RGB distance under which fill colours merge")
    p.add_argument("--speck", type=float, default=12, help="pieces smaller than this area (units²) are absorbed")
    p.add_argument("--palette", default="", help="comma-separated hex colours to snap to (default: merged SVG fills)")
    p.add_argument("--dots", type=float, default=0, help="max dot diameter (units) to snap to circles; 0 = off")
    p.add_argument("--tolerance", type=float, default=0.08, help="path simplification, in viewBox units")
    p.add_argument("--drop", default="", help="comma-separated hex colours to remove (after merging)")
    p.add_argument("--outline-around", default="", help="HEX:WIDTH — redraw the darkest colour as an outline of WIDTH units around that colour")
    p.add_argument("--halo", action="store_true", help="remove everything outside the darkest colour's outline (sticker paper border)")
    p.add_argument("--keep-last", action="store_true", help="copy the source SVG's last <path> (e.g. a clean label) on top")
    p.add_argument("--recolor", default="", help="comma-separated FROM=TO hex pairs applied to the output palette")
    return p.parse_args()


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def palette_from_svg(svg, merge):
    """Merge the SVG's fill colours into clusters weighted by how often they occur."""
    fills = [hex_rgb(c) for c in re.findall(r'fill="(#[0-9A-Fa-f]{6})"', svg)]
    clusters = []  # [sum_rgb, count]
    for c in fills:
        for cl in clusters:
            if np.linalg.norm(cl[0] / cl[1] - c) < merge:
                cl[0] += c
                cl[1] += 1
                break
        else:
            clusters.append([c.copy(), 1])
    return np.array([s / n for s, n in clusters])


def label_pixels(rgba, palette):
    alpha = rgba[..., 3] / 255.0
    rgb = rgba[..., :3].astype(float)
    # Un-premultiply anti-aliased edges against nothing: use straight colour.
    opaque = alpha > 0.5
    labels = np.full(alpha.shape, -1, int)
    px = rgb[opaque]
    nearest = np.empty(len(px), int)
    for start in range(0, len(px), 1 << 18):
        chunk = px[start:start + (1 << 18)]
        nearest[start:start + len(chunk)] = ((chunk[:, None, :] - palette[None, :, :]) ** 2).sum(-1).argmin(1)
    labels[opaque] = nearest
    return labels


def absorb_specks(labels, min_area_px):
    """Reassign connected pieces smaller than min_area_px to the nearest larger colour region."""
    out = labels.copy()
    small = np.zeros(labels.shape, bool)
    for lab in np.unique(labels):
        if lab < 0:
            continue
        comp, n = ndimage.label(labels == lab)
        if n == 0:
            continue
        sizes = np.bincount(comp.ravel())
        tiny = sizes < min_area_px
        tiny[0] = False
        small |= tiny[comp]
    if small.any():
        # Each speck pixel takes the label of the nearest pixel that is not a speck.
        idx = ndimage.distance_transform_edt(small, return_distances=False, return_indices=True)
        out[small] = labels[idx[0][small], idx[1][small]]
    return out


def contour_to_path(points, tol):
    """Closed subpixel contour → smooth cubic path through simplified points."""
    pts = measure.approximate_polygon(points, tolerance=tol)
    if len(pts) > 2 and np.allclose(pts[0], pts[-1]):
        pts = pts[:-1]
    n = len(pts)
    if n < 3:
        return ""
    # Smooth curve through the points. Each tangent follows the neighbours'
    # direction but is scaled to its own segment, so a long straight run next
    # to short segments never overshoots into a loop or a needle.
    def unit(v):
        norm = np.hypot(*v)
        return v / norm if norm else v

    out = [f"M{pts[0][0]:.1f} {pts[0][1]:.1f}"]
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        seg = np.hypot(*(p2 - p1))
        c1 = p1 + unit(p2 - p0) * seg / 3
        c2 = p2 - unit(p3 - p1) * seg / 3
        out.append(f"C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}")
    return "".join(out) + "Z"


def trace(mask_float, scale, vb, tol):
    padded = np.pad(mask_float, 2)
    paths = []
    for c in measure.find_contours(padded, 0.5):
        if len(c) < 8:
            continue
        xy = np.column_stack([(c[:, 1] - 2) / scale + vb[0], (c[:, 0] - 2) / scale + vb[1]])
        d = contour_to_path(xy, tol)
        if d:
            paths.append(d)
    return "".join(paths)


def main():
    a = parse_args()
    svg = open(a.source).read()
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).replace(",", " ").split()]
    rgba = np.array(Image.open(a.render).convert("RGBA"))
    palette = np.array([hex_rgb(h) for h in a.palette.split(",")]) if a.palette else palette_from_svg(svg, a.merge)
    labels = label_pixels(rgba, palette)
    labels = absorb_specks(labels, a.speck * a.scale * a.scale)
    if not a.palette:
        # Each colour becomes the median of its pixels: the flat colour that
        # dominates the region, not an average dulled by shading fragments.
        rgb = rgba[..., :3]
        palette = np.array([np.median(rgb[labels == i], axis=0) if (labels == i).any() else palette[i] for i in range(len(palette))])

    darkest = int(palette.sum(1).argmin())
    if a.outline_around:
        colour, width = a.outline_around.split(":")
        idx = int(np.linalg.norm(palette - hex_rgb(colour), axis=1).argmin())
        w = float(width) * a.scale
        dist = ndimage.distance_transform_edt(labels != idx)
        labels[(dist <= w) & (labels != idx)] = darkest
        # Ink above the region (e.g. an outline cut flat by the source bitmap's
        # edge) is trimmed back to a round outline of the same width.
        ys, xs = np.nonzero(labels == idx)
        above = np.zeros(labels.shape, bool)
        above[: int(ys.min() + w), max(0, int(xs.min() - w)): int(xs.max() + w) + 1] = True
        labels[above & (dist > w) & (labels == darkest)] = -1
    if a.halo:
        ink = labels == darkest
        closed = ndimage.binary_closing(ink, iterations=int(2 * a.scale))
        inside = ndimage.binary_fill_holes(closed)
        labels[~inside & ~ink & (labels >= 0)] = -1

    drop = [hex_rgb(h) for h in a.drop.split(",") if h]
    for c in drop:
        idx = int(np.linalg.norm(palette - c, axis=1).argmin())
        labels[labels == idx] = -1

    sigma = a.sigma * a.scale
    circles = []
    if a.dots:
        # Small, compact, isolated blobs become exact circles of equal area.
        for lab in np.unique(labels):
            if lab < 0:
                continue
            comp, n = ndimage.label(labels == lab)
            found = []
            for i, sl in enumerate(ndimage.find_objects(comp), start=1):
                h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
                if max(h, w) / a.scale > a.dots * 1.6:
                    continue
                pad = 3
                box = (slice(max(0, sl[0].start - pad), sl[0].stop + pad), slice(max(0, sl[1].start - pad), sl[1].stop + pad))
                piece = comp[box] == i
                area = piece.sum()
                diam = 2 * np.sqrt(area / np.pi)
                if diam / a.scale > a.dots or max(h, w) > 1.6 * min(h, w) or area < 0.6 * h * w * np.pi / 4:
                    continue
                ring = ndimage.binary_dilation(piece, iterations=2) & ~piece
                around = labels[box][ring]
                values, counts = np.unique(around, return_counts=True)
                if counts.max() < 0.85 * around.size:
                    continue  # touches several colours: a shading fragment, not a dot
                cy, cx = ndimage.center_of_mass(piece)
                found.append((box, piece, (box[1].start + cx + 0.5) / a.scale + vb[0], (box[0].start + cy + 0.5) / a.scale + vb[1], diam / 2 / a.scale))
            if len(found) < 5:
                continue  # a halftone pattern has many dots; a lone blob keeps its shape
            for box, piece, cx, cy, r in found:
                circles.append((lab, cx, cy, r))
                labels[box][piece] = -2  # hole that the circle fills; treated as "above"

    present = [lab for lab in np.unique(labels) if lab >= 0]
    # Stack outer colours first (outline, shadow) and inner ones last, so each
    # edge is anti-aliased once over a solid layer: no seams between colours.
    depth_map = ndimage.distance_transform_edt(np.pad(labels != -1, 1))[1:-1, 1:-1]
    depth = {lab: float(depth_map[labels == lab].mean()) for lab in present}
    order = sorted(present, key=lambda lab: depth[lab])

    body = []
    margin = 2 * sigma + 3
    for i, lab in enumerate(order):
        region = labels == lab
        above = labels == -2
        for upper in order[i + 1:]:
            above |= labels == upper
        # Extend each colour a little under the colours drawn above it: their
        # edges then sit on solid paint (no seams), without re-tracing shapes
        # that are far away.
        layer = region | ((ndimage.distance_transform_edt(~region) <= margin) & above)
        smooth = ndimage.gaussian_filter(layer.astype(float), sigma, mode="constant")
        d = trace(smooth, a.scale, vb, a.tolerance)
        if d:
            r, g, b = (int(round(v)) for v in palette[lab])
            body.append(f'<path fill="#{r:02X}{g:02X}{b:02X}" fill-rule="evenodd" d="{d}"/>')
    for lab, cx, cy, r in circles:
        rr, gg, bb = (int(round(v)) for v in palette[lab])
        body.append(f'<circle fill="#{rr:02X}{gg:02X}{bb:02X}" cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}"/>')

    if a.recolor:
        for pair in a.recolor.split(","):
            src, dst = pair.split("=")
            body = [line.replace(f'fill="{src.upper()}"', f'fill="{dst.upper()}"') for line in body]
    if a.keep_last:
        body.append(re.findall(r"<path\b[^>]*/>", svg)[-1])
    view = " ".join(f"{v:g}" for v in vb)
    with open(a.out, "w") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" preserveAspectRatio="xMidYMid meet">\n')
        f.write("\n".join(body))
        f.write("\n</svg>\n")
    print(f"{a.out}: {len(order)} layers, {len(circles)} circles, palette {len(palette)}")


if __name__ == "__main__":
    main()
