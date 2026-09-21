# Connect 4Live

Open `index.html` through a local HTTP server to run the current app. The project is a static PWA; its existing game, clock, Orbit, notes, and Home logic live in `src/`.

| Directory | Contents |
| --- | --- |
| `src/` | Running JavaScript and stylesheet |
| `assets/figma/` | Board and interface artwork from the current Figma design; earlier variants in `reference/` |
| `assets/home/vector/` | Home artwork loaded by the app |
| `assets/home/reference/` | Original Home export and earlier raster cutouts |
| `assets/clock/`, `assets/modules/`, `assets/fonts/` | Module art and font files |
| `assets/reference/` | Older or unused source images, chips, and design reference PDF |
| `scripts/` | Artwork preparation script |
| `tests/` | Game logic and browser checks |
| `backups/`, `previews/` | Earlier snapshot and visual recordings |

`index.html`, `manifest.json`, and `sw.js` remain at the root because they are browser/PWA entry points. `PRD.md` remains at the root for easy access; some implementation paths in it describe an earlier version of the project.
