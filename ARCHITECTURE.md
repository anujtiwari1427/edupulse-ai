# Architecture — EduPulse AI

## 1. Local-First Principles

EduPulse AI operates as a **static offline-capable SPA + PWA** (`vite-plugin-pwa`). There is no application backend database, no authentication service, and no content telemetry.

- **Primary store**: `Dexie` (`EduPulseDB` in `src/features/storage/db.ts`) backed by IndexedDB with versioned tables:
  `books`, `chapters`, `chunks`, `files`, `questions`, `blueprints`, `templates`, `papers`, `paperVersions`, `exports`, `settings`, `jobs`, `backupMeta`, `fsHandles`.
- **Single data-access layer**: `createRepository(db)` (`src/features/storage/repository.ts`) wraps all reads/writes with Zod runtime validation (`src/lib/zod-schemas.ts`). React components subscribe reactively via `useLiveQuery` using read-only queries and trigger mutations only through `repository`.
- **Disk mirroring**: `folder-sync.ts` stores a `FileSystemDirectoryHandle` in `fsHandles` and mirrors originals, paper JSON, and exports into `/Textbooks`, `/QuestionBanks`, `/Papers`, and `/Exports` when permission is granted.

---

## 2. Module Layout

```text
src/
  app/            AppShell navigation, Zustand UI store (toast/save indicator), 404 view
  components/ui/  Accessible Radix + Tailwind v4 design system primitives
  features/
    landing/      Public marketing page (zero Dexie/PDF/DOCX bundle weight)
    onboarding/   First-run language, board, folder sync, and sample library wizard
    dashboard/    Real storage quota telemetry, backup reminders, recent drafts
    library/      Document upload modal, Chapter Manager, Question Bank & bulk editor
    ingestion/    Chunker, chapter detector, question parser, MiniSearch BM25, OCR & job runner
    blueprint/    Pure blueprint math & validation engine, BlueprintEditor, TemplatesPage
    generation/   BYOK AI REST clients (Gemini/OpenAI/Anthropic/Proxy), selection & Set A/B/C engine
    editor/       Split PaperEditorPage, immutable paper-editor-ops, BankSwapModal, SavedPapersPage
    export/       pdf-lib + @pdf-lib/fontkit (Noto Sans + Devanagari TTF), docx, JSON, export service
    settings/     School profile/logo, storage & ZIP backup/restore, AI key config, i18n, theme
  lib/            Utilities, AppError, redacted logger, Zod schemas, i18next (en/hi/mr)
  workers/        Comlink Web Worker for PDF.js, Mammoth DOCX, and EPUB extraction
```

---

## 3. Data & Processing Flows

### Document Ingestion
1. User drops PDF/DOCX/EPUB/TXT in `UploadDocumentModal`.
2. Raw `Blob` is saved to `db.files` and mirrored to `/Textbooks` or `/QuestionBanks` if folder sync is active.
3. `ingestion.worker.ts` extracts per-page text (`pdfjs-dist` v6, `mammoth`, `jszip`). Scanned pages below the text density threshold trigger client-side `tesseract.js` OCR (`eng`, `eng+hin`, `eng+mar`) with per-page checkpoint persistence in `db.jobs` and `AbortController` cancellation.
4. `chapter-detector.ts` + `chunker.ts` produce chapter ranges and 500–800 token overlapping chunks; `question-parser.ts` splits PYQ/question-bank uploads and deduplicates via normalized SHA-256 hash + Jaccard token similarity.

### Paper Generation & Parallel Sets
1. `calculateBlueprintSummary` validates marks math, difficulty splits (`easy + medium + hard = 100`), Bloom targets, and choice rules.
2. `generateQuestionPaperJob` selects bank items matching section filters and difficulty buckets without duplicates, then optionally queries the teacher's configured AI provider using top-k `MiniSearch` BM25 chunks from selected chapters with automatic JSON schema repair on malformed responses.
3. `generateParallelSets` creates deterministic permutations for Sets **A**, **B**, and **C** (preserving primary/OR pairs together and permuting MCQ options while keeping Answer Key option labels synchronized via `resolvePaperForSet`).

### Print-Ready PDF & Editable DOCX Export
- **PDF (`pdf-exporter.ts`)**: Uses `pdf-lib` + `@pdf-lib/fontkit` with locally bundled `/public/fonts/NotoSans-*.ttf` and `/public/fonts/NotoSansDevanagari-*.ttf` (precached by Workbox for 100% offline use). Script-run segmentation dynamically switches between Latin and Devanagari fonts with symbol fallback handling and optional school logo embedding.
- **DOCX (`docx-exporter.ts`)**: Builds structured `.docx` documents (`docx`) with school header tables, general instructions, section choice rules, 2-column MCQ tables, and tabular Answer Keys + Marking Schemes.
