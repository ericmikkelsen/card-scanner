## Project snapshot
- Vite + TypeScript single-page app with one main flow (scanner at /) and a secondary library view at /library/.
- Custom element `card-reader` (Shadow DOM + adopted styles) drives the scan flow; plain DOM elsewhere (no framework).
- Storage is IndexedDB via `src/db.ts` with store `cards`; blob images are kept alongside metadata.

## Build/run
- Install deps then `npm run dev` for local dev (Vite); `npm run build` runs `tsc` then `vite build`.
- No tests or lint configured; TypeScript is `strict` but allows unused vars/params.

## Chrome AI / model handling
- Uses Chrome LanguageModel API; the helper in `src/model-downloader.ts` checks availability, downloads, and signals readiness (hides the Download button, shows reader controls).
- `addCardReaderBtn` spawns additional `card-reader` instances; initial reader is added once the model is ready.
- If `LanguageModel` is missing, the UI is disabled with an error message—preserve this guard when changing flow.

## Scanner flow (src/card-reader.ts)
- Handles image input from file chooser or live camera capture (mirrored preview, cropped to card ratio) before moving to the process phase.
- `processCard()` calls `LanguageModel.create()` with a text+image prompt and a JSON schema; response is parsed to `CardData` and normalized mana costs.
- Rendered form allows edits before saving; save persists via `db.saveCard`, then shows a success state with “scan another” or link to library.
- Uses Shadow DOM; styles imported inline from `src/card-reader.css` and applied through a constructed `CSSStyleSheet`.

## Storage contract (src/db.ts)
- `SavedCard` shape: id, name, manaCost string[], type, subtype, text, flavor, power/toughness (nullable), imageBlob, createdAt.
- Object store keyed by `id`; indexes on `name` and `createdAt`; `getAllCards` returns newest-first (reverse on read).
- IDs are generated `card_<timestamp>_<random>`—reuse this or ensure uniqueness if overriding.

## Library view (src/library.ts + library/index.html)
- On DOMContentLoaded: fetches all cards, shows loading/empty states, and renders a card grid using `URL.createObjectURL` for images.
- Search box filters in-memory list across name/type/subtype; count updates live.
- Delete uses modal confirmation and event delegation on the grid; keeps filtered lists in sync with deletions.

## Conventions and guardrails
- Keep DOM IDs/classes stable: main page uses `downloadModelBtn`, `modelStatus`, `readerControls`, `readerList`; library uses `cards-container`, `empty-state`, `delete-modal`, etc.
- Use `escapeHtml` helpers already present when injecting user-provided text (library rendering and card-reader form values).
- Maintain comma-separated mana cost UX; normalization trims empty entries and expects symbols like "{U}".
- Prefer additions in TypeScript under `src/`; HTML pages are thin shells pointing to module entrypoints.

## Extending safely
- When adding new AI prompts or schema, keep `expectedInputs/Outputs` and `responseConstraint` aligned; degrade gracefully if `LanguageModel` is absent.
- If altering storage, bump `DB_VERSION` and add migrations in `onupgradeneeded` without breaking existing data.
- For new UI around camera, ensure media tracks are stopped on teardown to avoid leaks.
