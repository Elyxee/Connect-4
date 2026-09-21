Home artwork exported from Figma VOsZQWTZfP040v7s6faP2O, frame 16:1420, bitmap 20:1426. reference/source.png is the exact original. Decorative and button layers are preserved in reference/, with matching sampled paper behind them for animation. No artwork was redrawn.

v39: animated cutouts have transparent paper margins and a sharpened 2x sampling copy. This does not add source detail. Main in-game logos use SVG contours traced from their original PNGs.

## v42 contour cleanup
All 22 Home illustrations use independently scalable SVG paths with matching curve refinement (see ../../scripts/refine-home-vectors.py). The small dark path at source (1157,588.7) incorrectly assigned to the controller has been removed; the burst already includes its complete outline. No paper patch covers the repair. This cleans the original tracing; it does not claim to recover photographic detail missing from the original bitmap.

## v44 lettering and swan edges
The three button labels now use clean Avenir Next Heavy glyph outlines rather than traced bitmap lettering. The SVGs contain paths, so no font installation is required at runtime. Button artwork and label positions are preserved. Neutral gray tracing fragments were removed from the swan while retaining its white body, wing line, black outlines, and colored decoration. The four previous SVGs are preserved in reference/vector-v43/. Reproduction tools: scripts/home-label-path.m and scripts/clean-home-labels.py at the project root.
