"""Replace traced button lettering and remove gray tracing debris from the swan.
Usage: python3 scripts/clean-home-labels.py ORIGINAL_SVG_DIR OUTPUT_DIR GLYPH_EXPORTER
The original directory is preserved, so this operation is repeatable.
"""
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as E

E.register_namespace('', 'http://www.w3.org/2000/svg')
NS = '{http://www.w3.org/2000/svg}'
source, output = map(Path, sys.argv[1:3])
exporter = sys.argv[3]
labels = {
    'new': ('New Game', (450, 480, 856, 554), (460, 489, 385, 55), '#ffdf30', '#a2092c', '12'),
    'continue': ('Continue', (546, 638, 786, 687), (551, 644, 230, 39), '#101015', '#101015', '1'),
    'recent': ('Recent Games', (498, 767, 823, 817), (508, 777, 305, 32), '#ffffff', '#0754ea', '8'),
}

def bounds(element):
    values = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', element.get('d', ''))]
    tx, ty = map(float, re.findall(r'-?\d+(?:\.\d+)?', element.get('transform', 'translate(0,0)')))
    return (min(values[::2])+tx, min(values[1::2])+ty,
            max(values[::2])+tx, max(values[1::2])+ty)

for name, (text, region, rect, fill, stroke, width) in labels.items():
    tree = E.parse(source / f'{name}.svg')
    root = tree.getroot()
    removed = 0
    for element in list(root):
        if not element.get('d'):
            continue
        x, y, xx, yy = bounds(element)
        if x >= region[0] and y >= region[1] and xx <= region[2] and yy <= region[3]:
            root.remove(element)
            removed += 1
    path = subprocess.check_output([exporter, text, *map(str, rect)], text=True)
    E.SubElement(root, NS+'path', {
        'd': path, 'fill': fill, 'stroke': stroke, 'stroke-width': width,
        'stroke-linejoin': 'round', 'paint-order': 'stroke fill',
    })
    tree.write(output / f'{name}.svg', encoding='unicode')
    print(f'{name}: replaced {removed} traced text fragments with font contours')

tree = E.parse(source / 'swan.svg')
root = tree.getroot()
removed = 0
for index, element in enumerate(list(root)):
    color = element.get('fill', '')
    if not color.startswith('#') or index in (0, 2, 4):
        continue
    x, y, xx, yy = bounds(element)
    if x > 215 and yy < 682:
        continue  # Keep the flower's small center and petal highlights.
    rgb = [int(color[i:i+2], 16) for i in (1, 3, 5)]
    # Keep the white body, wing, broad wing line and colored decoration.
    # Tiny neutral patches are the original bitmap's antialiasing/texture debris.
    if min(rgb) > 100 and max(rgb)-min(rgb) < 22:
        root.remove(element)
        removed += 1
tree.write(output / 'swan.svg', encoding='unicode')
print(f'swan: removed {removed} neutral tracing fragments')
