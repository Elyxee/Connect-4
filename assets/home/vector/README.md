# Home vector artwork

Derived from ../reference/source.png, the Figma Home bitmap (frame 16:1420). Full connected color paths are traced with VTracer, then grouped by illustration without clipping. Original paper and corner background paths are excluded; the new SVG water backdrop is independent. Motion dashes belonging to the chips travel with the chip assets.

Vector curves improve scaling and avoid the old raster cutout seams; the original bitmap remains the reference for color and detail. The conversion is an approximation of that source, not newly recovered photographic detail.

v46 uses complete stickers for dragging: the swan comes from the existing full swan reference (mirrored to face left), both edge chips reuse the complete red chip, and the speech bubble/lightning have complete vector contours. The bulb's cut ray is repaired. Every SVG contains the full silhouette with padding and uses `meet`, never `slice`. Previous edge artwork is retained in `../reference/pre-drag-v45/`. `scripts/complete-home-art.py` documents the preparation.

`src/home-drag.js` owns normalized, in-memory drag offsets and stacking order. A drag suppresses its release click; the next intentional tap works normally. Offsets reset only when entering the game. The viewport may crop a sticker intentionally placed at its edge, but the underlying illustration remains complete.

Motion is CSS in src/style.css. The SVG water animation is paused on hidden pages and for reduced-motion preferences by src/home-motion.js.

## v49 clean rebuild
The traced SVGs (kept in `../reference/vector-v47/`) had faceted edges, notches,
stray slivers in near-identical colours and blobby halftone dots.
`scripts/rebuild-home-art.sh` rebuilds them with `scripts/revectorize-home.py`:
each illustration is snapped to its own small palette, specks are absorbed,
one smooth layer per colour is traced (outermost first, so no seams), and
halftone blobs become exact circles. Button labels keep their font contours.
The logo uses five flat colours and stronger smoothing; the logo and New button
have the former CSS `saturate(1.14) contrast(1.025)` baked into their colours.
The swan's flower outline, cut flat by its source bitmap, is redrawn round, and
its white paper border is removed. `bolt.svg` and `bubble.svg` were already
clean and are unchanged.

The water behind the stickers is drawn by `src/home-flow.js` (WebGL); the SVG
water in index.html remains as the fallback.
