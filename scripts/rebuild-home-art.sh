#!/bin/zsh
# Rebuilds assets/home/vector from the traced originals in
# assets/home/reference/vector-v47 (see scripts/revectorize-home.py).
# Needs Python with numpy/scipy/scikit-image/Pillow and Playwright.
set -e
ROOT=${0:A:h:h}
SRC=$ROOT/assets/home/reference/vector-v47
OUT=$ROOT/assets/home/vector
TMP=$(mktemp -d)
RV=(python3 $ROOT/scripts/revectorize-home.py)
render() { node $ROOT/scripts/render-svg.cjs "$@"; }

# Buttons: rebuild the body only; the clean font label is copied back on top.
mkdir -p $TMP/body
for b in new continue recent; do
  python3 -c "import re,sys;s=open(sys.argv[1]).read();print(s.replace(re.findall(r'<path\b[^>]*/>',s)[-1],''))" $SRC/$b.svg > $TMP/body/$b.svg
done
render $TMP/body 6 $TMP/body/{new,continue,recent}.svg
for b in new continue recent; do
  $RV $TMP/body/$b.png $SRC/$b.svg $OUT/$b.svg --scale 6 --sigma 1.0 --tolerance 0.35 --merge 26 --speck 6 --dots 10 --keep-last
done

# Stickers: merged palette, halftone blobs snapped to circles.
stickers=(bulb controller burst chip-red chip-gold chip-bottom heart star-left star-bottom new-rays-left new-rays-right logo-rays-left logo-rays-right)
render $TMP 6 $SRC/${^stickers}.svg
for n in $stickers; do
  merge=26; [[ $n == burst ]] && merge=36
  $RV $TMP/$n.png $SRC/$n.svg $OUT/$n.svg --scale 6 --sigma 1.0 --tolerance 0.35 --merge $merge --speck 6 --dots 12
done
cp $OUT/chip-red.svg $OUT/chip-edge.svg
cp $OUT/chip-red.svg $OUT/chip-corner.svg

# Logo: five flat colours, stronger smoothing.
render $TMP 6 $SRC/logo.svg
$RV $TMP/logo.png $SRC/logo.svg $OUT/logo.svg --scale 6 --sigma 2.2 --tolerance 0.3 --palette "#FB0A61,#101015,#F8D825,#FDF0EE,#F5A21C" --speck 12

# Swan: complete the flower outline cut by the source bitmap, drop the paper halo.
render $TMP 2 $SRC/swan.svg
$RV $TMP/swan.png $SRC/swan.svg $OUT/swan.svg --scale 2 --sigma 3 --tolerance 1.0 --merge 30 --speck 60 --outline-around "#F87EAA:11" --halo

# The logo and New button used CSS filter: saturate(1.14) contrast(1.025).
# Bake it into their colours instead (values measured in Chrome), so the
# artwork renders as plain vectors.
python3 - $OUT <<'PY'
import re, sys
baked = dict(p.split("=") for p in (
    "#101015=#0D0D13,#A2092C=#B40029,#E9085A=#FF005D,#F5A21C=#FFA105,#F7D539=#FFD821,#F8075D=#FF0060,"
    "#F8D825=#FFDB0A,#FA1D68=#FF136A,#FB0A61=#FF0064,#FB357A=#FF2B7C,#FBD41F=#FFD702,#FC5B95=#FF5498,"
    "#FCD3E0=#FFD4E2,#FD9ABD=#FF97C0,#FDEAF2=#FFEBF4,#FDF0EE=#FFF2EF,#FFDF30=#FFE215").split(","))
for name in ("logo", "new"):
    path = f"{sys.argv[1]}/{name}.svg"
    svg = re.sub(r'((?:fill|stroke)=")(#[0-9A-Fa-f]{6})', lambda m: m.group(1) + baked.get(m.group(2).upper(), m.group(2)), open(path).read())
    open(path, "w").write(svg)
PY
rm -rf $TMP
echo "Rebuilt $OUT"
