# Copilot Instructions

- Purpose: browser-only Magic card scanner built with Vite + TypeScript custom elements; main entry is [src/main.ts](src/main.ts) imported by [index.html](index.html).
- Dev commands: `npm install`, `npm run dev` (Vite), `npm run build` (tsc then Vite). No tests configured.
- Page wiring: [index.html](index.html) renders the `.js-card-scanner` container with `<take-photo>`, `<rect-photo>`, `<make-card>` children; [src/card-scanner-manager.ts](src/card-scanner-manager.ts) instantiates automatically on DOM ready and wires events between the children.
- Event flow contracts (emit/listen, keep shapes stable):
  - `<take-photo>` emits `photoCaptured` with `{ blob, timestamp }` when capture completes. Controlled via start/stop/capture buttons; see [src/take-photo.ts](src/take-photo.ts).
  - `<rect-photo>` exposes `setPhoto(blob|url)` and emits `photoCropped` with `{ blob, width, height }` after finalize; cropping rectangle is adjusted via handles/buttons; see [src/rect-photo.ts](src/rect-photo.ts).
  - `<make-card>` exposes `setImage(blob)` and emits `cardDataExtracted` with a `CardData` map (currently only `name`); see [src/make-card.ts](src/make-card.ts).
  - The manager relays `photoCaptured -> setPhoto -> photoCropped -> setImage -> cardDataExtracted`, then re-emits `cardProcessed` from the container for external listeners.
- AI integration: `<make-card>` uses the Chrome AI Prompt API (`ai.languageModel` / `ai.prompt`). Gated by availability check and download workflow; errors surface via in-component status/error UI. Use Chrome Canary with experimental flags when exercising this code.
- UI patterns: every component attaches a shadow DOM and renders via `innerHTML` template with inline styles; prefer extending existing markup/styles rather than mutating the host page. Keep buttons/status copy concise and descriptive.
- Image handling: camera capture and crop/export use canvas + `toBlob('image/jpeg', 0.95)`. Maintain blob-based handoff between components instead of data URLs to avoid memory bloat.
- Adding features: if introducing new pipeline steps, either add a new custom element and subscribe in the manager, or extend existing CustomEvents with backward-compatible details. Keep scroll behavior when handing off between steps (`scrollIntoView` in manager).
- Optional uploader: `<card-reader>` (not mounted on the page) provides a drag/drop/file-input preview for static images; useful for future workflows. Styles are module-scoped via CSSStyleSheet adoption; see [src/card-reader.ts](src/card-reader.ts) and [src/card-reader.css](src/card-reader.css).
- Styling: global styles live in [src/style.css](src/style.css); component styles are scoped inside shadow DOM. Avoid introducing non-scoped global styles unless they belong to the app shell.
- TypeScript config/build target: esnext via [vite.config.ts](vite.config.ts); keep DOM types and avoid Node-only APIs in browser code.
- Error handling conventions: surface user-facing issues via per-component status/error elements (`updateStatus`, `showError` helpers). Avoid unhandled rejections from async camera/AI calls; wrap in try/catch and keep UI responsive while `isProcessing` locks controls.
- Extensibility points: hook external code to container-level `cardProcessed` or to individual component events. Provide `reset()` or data getters on the manager rather than reaching into child shadows.
- Browser assumptions: designed for modern browsers; camera requires HTTPS and user permission; AI features depend on Chrome experimental APIs.

Feel free to iterate—if any of these instructions feel incomplete or unclear, let me know what to refine.
