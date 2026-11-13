# EduPulse AI — Local-First Question Paper Studio

**EduPulse AI** is a local-first web application built for school teachers in India (**CBSE**, **ICSE**, and **Maharashtra State Board**, Classes 1–12) in English, Hindi (हिन्दी), and Marathi (मराठी).

Teachers upload textbooks and question banks, build or customize an exam blueprint, generate a balanced question paper + answer key + marking scheme (with parallel Sets A/B/C), refine it in an interactive split editor, and export print-ready **PDF** (with embedded Noto Sans & Noto Sans Devanagari fonts) and editable **DOCX** files.

---

## Local-First Privacy Guarantee

- **Zero backend database & zero accounts**: All uploaded PDFs/DOCX/EPUB/text files, extracted chapters and chunks, question banks, blueprints, generated papers, version snapshots, and settings reside strictly inside your browser's IndexedDB (`Dexie`).
- **Optional local folder auto-sync**: In Chrome and Edge, teachers can link an `EduPulse Library` folder on disk via the File System Access API so originals, paper JSON, and exports are automatically saved to `/Textbooks`, `/QuestionBanks`, `/Papers`, and `/Exports`.
- **Backup & Restore**: Every browser supports one-click ZIP backups and Zod-validated restores (Merge or Overwrite).
- **BYOK AI only**: You choose whether to run **100% offline** (Bank-Only mode) or connect your own Gemini, OpenAI, Anthropic, or custom proxy key. Only minimal retrieved textbook snippets are sent during AI generation or bulk tagging.

---

## Core Workflow

1. **Upload (`/app/library`)**: Upload textbook or question bank files (`PDF`, `DOCX`, `EPUB`, `TXT`) with Web Worker extraction, scanned-page OCR (`tesseract.js` for `eng`, `hin`, `mar`), chapter boundary management, and local BM25 (`MiniSearch`) indexing.
2. **Blueprint (`/app/templates` & `/app/create`)**: Pick a built-in CBSE, ICSE, or Maharashtra SSC template or design custom sections with choice rules (*Attempt any X of Y* or *Internal OR choices*), difficulty percentages, Bloom's taxonomy targets, and chapter scope.
3. **Generate (`/app/create`)**: Deterministic bank selection + deduplication + optional textbook-grounded AI generation with schema auto-repair and automatic Set A/B/C shuffling.
4. **Edit (`/app/editor/:paperId`)**: Interactive split editor with live A4 preview, Set A/B/C and Answer Key switcher, inline editing, drag-and-drop & keyboard reordering, Bank Swap modal, single-question AI regeneration, Undo/Redo (`Ctrl+Z` / `Ctrl+Shift+Z`), debounced local autosave, and named version snapshots.
5. **Export & Saved Papers (`/app/papers`)**: Export Question Paper PDF, Answer Key & Marking Scheme PDF, editable DOCX files, or portable JSON; duplicate papers, search/filter by status, and restore earlier version snapshots.

---

## Scripts

```bash
npm install
npm run dev          # Start local dev server on port 3000
npm run lint         # Strict TypeScript check (tsc --noEmit) + ESLint
npm run test         # Run Vitest unit & accessibility tests
npm run build        # Build static PWA bundle in dist/
npm run test:e2e     # Run Playwright Chromium end-to-end test against preview server
```

---

## Known Limitations

- **Scanned PDF OCR quality**: Browser-based `tesseract.js` (`eng`, `hin`, `mar`) runs offline via WebAssembly/CDN tessdata on first run; heavily skewed or handwritten scans may require manual correction in the Chapter/Question editor.
- **File System Access API**: Direct folder auto-sync works in Chromium browsers (Chrome, Edge); Firefox and Safari fall back cleanly to automatic file downloads and full ZIP backups.
- **Embeddings search**: Currently uses fast deterministic local BM25 (`MiniSearch`) indexing; optional client-side vector embeddings are intentionally deferred to keep initial download footprint and RAM low on school laptops.
- **Browser storage limits**: Very large scanned textbook libraries are constrained by browser IndexedDB origin quota; use the Dashboard/Settings storage meter and ZIP backup reminders.
