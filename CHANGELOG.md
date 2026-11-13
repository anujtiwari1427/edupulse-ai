# Changelog

## Phase 4 — Paper Editor, Multilingual PDF/DOCX Exports & Verification
- Added offline print-ready PDF exporter (`pdf-lib` + `@pdf-lib/fontkit`) with locally bundled Noto Sans & Noto Sans Devanagari fonts, school logo embedding, internal `OR` formatting, and synchronized Set A/B/C Answer Key & Marking Scheme PDFs.
- Added editable DOCX exporter (`docx`) for both Question Papers and Answer Keys, plus Zod-validated portable JSON export/import.
- Built interactive Split `PaperEditorPage` (`/app/editor/:paperId`) with live A4 preview, Set A/B/C and Question Paper/Answer Key toggles, inline editing, HTML5 drag-and-drop and keyboard reordering, Question Bank Swap modal, Manual Question modal, single-question AI regeneration, Undo/Redo stack (`Ctrl+Z` / `Ctrl+Shift+Z`), live marks divergence warnings, debounced local autosave, and named version snapshots.
- Upgraded `SavedPapersPage` (`/app/papers`) with search, status filtering (`draft`/`finalized`/`archived`), JSON import, paper duplication, quick export menu, and Version History Drawer with one-click restore.
- Added unit tests for exporters and editor operations, `axe-core` accessibility verification, Playwright Chromium E2E test suite, and project documentation (`README.md`, `ARCHITECTURE.md`).

## Phase 3 — Blueprint Engine, Templates & Grounded Paper Generation
- Built pure blueprint math/validation engine (`blueprint-engine.ts`), `BlueprintEditor`, and `TemplatesPage` with CBSE, ICSE, and Maharashtra SSC patterns.
- Implemented BYOK AI REST clients (Gemini, OpenAI, Anthropic, custom proxy) and 4-step `CreatePaperPage` wizard with BM25 context retrieval, JSON auto-repair, deduplication, and Set A/B/C generation.

## Phase 2 — Web Worker Ingestion, OCR & Question Bank Library
- Built Comlink Web Worker (`ingestion.worker.ts`) for PDF, DOCX, EPUB, and TXT extraction, `tesseract.js` scanned-page OCR (`eng`, `hin`, `mar`), chapter detection, chunking, and `MiniSearch` BM25 indexing.
- Built `LibraryPage`, `UploadDocumentModal`, `ChapterManagerModal`, and `QuestionEditorModal` with bulk tagging and deduplication.

## Phase 1 — Local-First Foundation, Dexie Storage, Design System & Shell
- Configured strict TypeScript, Tailwind CSS v4 design tokens, VitePWA offline shell, i18next (`en`, `hi`, `mr`), Dexie schema + Zod validation, File System Access folder sync, ZIP backup/restore, `LandingPage`, `DashboardPage`, `SettingsPage`, and sample Class 10 Science pack.
