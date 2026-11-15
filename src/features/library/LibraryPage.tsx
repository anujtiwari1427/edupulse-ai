import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BookOpen,
  Edit3,
  FilePlus2,
  ListTree,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { db } from '@/src/features/storage/db';
import { repository } from '@/src/features/storage/repository';
import { loadSampleClass10Library } from '@/src/features/storage/sample-data';
import {
  cancelIngestionJob,
  resumeIngestionJob,
  skipOcrAndFinishJob,
} from '@/src/features/ingestion/ingestion-service';
import {
  LocalBM25Index,
} from '@/src/features/ingestion/search-index';
import { isAIConfigured } from '@/src/features/generation/ai-providers';
import { aiAutoTagQuestions } from '@/src/features/generation/generation-service';
import { getErrorMessage } from '@/src/lib/errors';
import type {
  BloomLevel,
  BookRecord,
  ChapterRecord,
  ChunkRecord,
  DifficultyLevel,
  JobRecord,
  QuestionRecord,
} from '@/src/lib/zod-schemas';
import { useUIStore } from '@/src/app/store';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  Drawer,
  EmptyState,
  Input,
  MetaLine,
  Modal,
  Progress,
  Select,
  type DataColumn,
} from '@/src/components/ui';
import { UploadDocumentModal } from './UploadDocumentModal';
import { ChapterManagerModal } from './ChapterManagerModal';
import { QuestionEditorModal } from './QuestionEditorModal';
import { QuickGeneratePaperModal } from './QuickGeneratePaperModal';

const EMPTY_BOOKS: BookRecord[] = [];
const EMPTY_QUESTIONS: QuestionRecord[] = [];
const EMPTY_CHAPTERS: ChapterRecord[] = [];
const EMPTY_CHUNKS: ChunkRecord[] = [];
const EMPTY_JOBS: JobRecord[] = [];

export function LibraryPage() {
  const addToast = useUIStore((s) => s.addToast);

  const books = useLiveQuery(() => repository.libraryRepo.listBooks(), [], EMPTY_BOOKS);
  const questions = useLiveQuery(() => repository.libraryRepo.listQuestions(), [], EMPTY_QUESTIONS);
  const chapters = useLiveQuery(() => db.chapters.orderBy('order').toArray(), [], EMPTY_CHAPTERS);
  const chunks = useLiveQuery(() => db.chunks.toArray(), [], EMPTY_CHUNKS);
  const jobs = useLiveQuery(() => repository.jobsRepo.listJobs(), [], EMPTY_JOBS);
  const settings = useLiveQuery(() => repository.settingsRepo.get(), []);

  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);
  const [uploadType, setUploadType] = React.useState<'textbook' | 'question_bank'>('textbook');
  const [chapterManagerBook, setChapterManagerBook] = React.useState<BookRecord | null>(null);
  const [quickGenOpen, setQuickGenOpen] = React.useState(false);
  const [quickGenBook, setQuickGenBook] = React.useState<BookRecord | null>(null);
  const [editingQuestion, setEditingQuestion] = React.useState<QuestionRecord | null>(null);
  const [questionModalOpen, setQuestionModalOpen] = React.useState(false);
  const [deleteBookTarget, setDeleteBookTarget] = React.useState<BookRecord | null>(null);
  const [loadingSample, setLoadingSample] = React.useState(false);
  const [aiTagging, setAiTagging] = React.useState(false);

  // Filters & bulk selection
  const [filterBookId, setFilterBookId] = React.useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = React.useState<string>('all');
  const [filterType, setFilterType] = React.useState<string>('all');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [bulkDifficulty, setBulkDifficulty] = React.useState<DifficultyLevel>('medium');
  const [bulkBloom, setBulkBloom] = React.useState<BloomLevel>('understand');

  // Chunk search drawer
  const [chunkDrawerOpen, setChunkDrawerOpen] = React.useState(false);
  const [chunkQuery, setChunkQuery] = React.useState('');

  const chunkIndex = React.useMemo(() => {
    const idx = new LocalBM25Index();
    idx.indexChunks(chunks);
    return idx;
  }, [chunks]);

  const questionIndex = React.useMemo(() => {
    const idx = new LocalBM25Index();
    idx.indexQuestions(questions);
    return idx;
  }, [questions]);

  const chunkHits = React.useMemo(
    () => (chunkQuery.trim() ? chunkIndex.searchChunks(chunkQuery, { limit: 15 }) : []),
    [chunkIndex, chunkQuery]
  );

  const filteredQuestions = React.useMemo(() => {
    return questions.filter((q) => {
      if (filterBookId !== 'all' && q.bookId !== filterBookId) return false;
      if (filterDifficulty !== 'all' && q.difficulty !== filterDifficulty) return false;
      if (filterType !== 'all' && q.type !== filterType) return false;
      return true;
    });
  }, [questions, filterBookId, filterDifficulty, filterType]);

  const chapterMap = React.useMemo(
    () => new Map(chapters.map((c) => [c.id, c.title])),
    [chapters]
  );

  const handleLoadSample = async () => {
    setLoadingSample(true);
    try {
      const res = await loadSampleClass10Library();
      addToast({
        title: 'Sample Class 10 Science library loaded',
        description: `Added NCERT sample chapters and ${res.questionsAdded} questions.`,
        variant: 'success',
      });
    } finally {
      setLoadingSample(false);
    }
  };

  const handleBulkTagApply = async (
    patch: Partial<Pick<QuestionRecord, 'difficulty' | 'bloom'>>
  ) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const count = await repository.libraryRepo.bulkUpdateQuestions(ids, patch);
    addToast({ title: `Updated ${count} question(s)`, variant: 'success' });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const removed = await repository.libraryRepo.bulkDeleteQuestions(ids);
    setSelectedIds(new Set());
    addToast({
      title: `Deleted ${removed.length} question(s)`,
      variant: 'default',
      actionLabel: 'Undo',
      onAction: () => {
        void repository.libraryRepo.saveQuestions(removed);
      },
    });
  };

  const handleBulkAiTag = async () => {
    if (!settings || !isAIConfigured(settings)) {
      addToast({
        title: 'AI provider not configured',
        description: 'Add a BYOK key in Settings → AI Provider to use AI-assisted tagging.',
        variant: 'warning',
      });
      return;
    }
    const targets = questions.filter((q) => selectedIds.has(q.id));
    if (targets.length === 0) return;
    setAiTagging(true);
    try {
      const updatedCount = await aiAutoTagQuestions(targets, settings);
      addToast({
        title: `AI-tagged ${updatedCount} question(s)`,
        variant: 'success',
      });
    } catch (err) {
      addToast({ title: 'AI tagging failed', description: getErrorMessage(err), variant: 'danger' });
    } finally {
      setAiTagging(false);
    }
  };

  const handleConfirmDeleteBook = async () => {
    if (!deleteBookTarget) return;
    await repository.libraryRepo.deleteBook(deleteBookTarget.id);
    addToast({ title: `Removed "${deleteBookTarget.title}"`, variant: 'default' });
    setDeleteBookTarget(null);
  };

  const columns: DataColumn<QuestionRecord>[] = [
    {
      key: 'text',
      header: 'Question',
      sortValue: (q) => q.text,
      render: (q) => (
        <div className="max-w-md space-y-0.5">
          <div className="line-clamp-2 text-xs font-medium text-[var(--text-primary)]">{q.text}</div>
          <MetaLine
            items={[
              q.chapterId ? chapterMap.get(q.chapterId) : null,
              q.topic,
              q.sourcePage ? `Page ${q.sourcePage}` : null,
              q.origin.toUpperCase(),
            ]}
          />
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortValue: (q) => q.type,
      render: (q) => (
        <span className="inline-flex items-center rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          {q.type.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'difficulty',
      header: 'Difficulty',
      sortValue: (q) => q.difficulty,
      render: (q) => (
        <Badge
          tone={
            q.difficulty === 'easy'
              ? 'success'
              : q.difficulty === 'hard'
                ? 'danger'
                : 'warning'
          }
          dot
        >
          {q.difficulty}
        </Badge>
      ),
    },
    {
      key: 'bloom',
      header: 'Bloom',
      sortValue: (q) => q.bloom,
      render: (q) => (
        <Badge tone="brand">
          {q.bloom}
        </Badge>
      ),
    },
    {
      key: 'marks',
      header: 'Marks',
      align: 'right',
      sortValue: (q) => q.marks,
      render: (q) => (
        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
          {q.marks}M
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (q) => (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Edit question"
          onClick={() => {
            setEditingQuestion(q);
            setQuestionModalOpen(true);
          }}
        >
          <Edit3 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  const bm25SearchFilter = React.useCallback(
    (q: QuestionRecord, query: string) => {
      const hits = questionIndex.searchQuestions(query, 200);
      if (hits.some((h) => h.id === q.id)) return true;
      return (
        q.text.toLowerCase().includes(query) ||
        q.topic.toLowerCase().includes(query) ||
        q.answer.toLowerCase().includes(query)
      );
    },
    [questionIndex]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Textbook &amp; Question Library
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Upload PDFs, DOCX, or EPUBs, manage detected chapters, and review tagged questions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setChunkDrawerOpen(true)}
            leftIcon={<Search className="h-3.5 w-3.5" />}
          >
            Search Textbook Chunks
          </Button>
          {books.length > 0 && (
            <Button
              size="sm"
              onClick={() => {
                setQuickGenBook(null);
                setQuickGenOpen(true);
              }}
              leftIcon={<Sparkles className="h-3.5 w-3.5 text-indigo-200" />}
            >
              Generate Paper from Chapters
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              setUploadType('textbook');
              setUploadModalOpen(true);
            }}
            leftIcon={<Upload className="h-4 w-4" />}
          >
            Upload File
          </Button>
        </div>
      </div>

      {/* Active & Resumable Jobs Panel */}
      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ingestion &amp; Indexing Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.slice(0, 5).map((job) => (
              <div
                key={job.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {job.title}
                    </span>
                    <Badge
                      tone={
                        job.status === 'completed'
                          ? 'success'
                          : job.status === 'failed'
                            ? 'danger'
                            : job.status === 'paused'
                              ? 'warning'
                              : 'brand'
                      }
                    >
                      {job.status}
                    </Badge>
                  </div>
                  <Progress
                    value={job.progress}
                    label={
                      job.errorMessage
                        ? job.errorMessage
                        : `${job.processedItems} / ${job.totalItems} items`
                    }
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {job.status === 'running' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => void skipOcrAndFinishJob(job.id)}
                        leftIcon={<Zap className="h-3.5 w-3.5" />}
                        title="Skip OCR and finish indexing immediately with digital text"
                      >
                        Skip OCR &amp; Finish
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void cancelIngestionJob(job.id)}
                        leftIcon={<Pause className="h-3.5 w-3.5" />}
                      >
                        Pause
                      </Button>
                    </>
                  )}
                  {(job.status === 'paused' || job.status === 'failed') && job.checkpoint && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => void skipOcrAndFinishJob(job.id)}
                        leftIcon={<Zap className="h-3.5 w-3.5" />}
                        title="Skip OCR and finish indexing immediately with digital text"
                      >
                        Skip OCR &amp; Finish
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void resumeIngestionJob(job.id)}
                        leftIcon={<Play className="h-3.5 w-3.5" />}
                      >
                        Resume
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Dismiss task"
                    onClick={() => void repository.jobsRepo.deleteJob(job.id)}
                    title="Dismiss or cancel task"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Books & Sources Shelf */}
      {books.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="No textbooks or question banks uploaded yet"
          description="Upload a PDF, DOCX, or EPUB textbook, or load the NCERT Class 10 Science starter pack."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Button
                size="sm"
                onClick={() => {
                  setUploadType('textbook');
                  setUploadModalOpen(true);
                }}
                leftIcon={<Upload className="h-3.5 w-3.5" />}
              >
                Upload Textbook
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={loadingSample}
                onClick={() => void handleLoadSample()}
                leftIcon={<Sparkles className="h-3.5 w-3.5" />}
              >
                Load Sample Class 10 Library
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {books.map((book) => {
            const bookChapterCount = chapters.filter((c) => c.bookId === book.id).length;
            return (
              <Card key={book.id} hoverable className="group">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/50 shadow-xs">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-base font-bold text-[var(--text-primary)] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate transition-colors">
                          {book.title}
                        </div>
                        <MetaLine
                          className="mt-1"
                          items={[
                            book.board,
                            `Class ${book.classLevel}`,
                            book.subject,
                            `${book.pageCount} pages`,
                            book.sourceType === 'textbook'
                              ? `${bookChapterCount} chapters · ${book.chunkCount} chunks`
                              : `${book.chunkCount} items`,
                          ]}
                        />
                      </div>
                    </div>
                    <Badge
                      tone={
                        book.status === 'ready'
                          ? 'success'
                          : book.status === 'error'
                            ? 'danger'
                            : 'brand'
                      }
                      dot
                    >
                      {book.status}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-hairline)]">
                    {book.status === 'processing' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                        onClick={async () => {
                          const matchedJob = jobs.find((j) => {
                            if (!j.checkpoint) return false;
                            try {
                              return (JSON.parse(j.checkpoint) as { bookId?: string }).bookId === book.id;
                            } catch {
                              return false;
                            }
                          });
                          if (matchedJob) {
                            await skipOcrAndFinishJob(matchedJob.id);
                          } else {
                            await repository.libraryRepo.saveBook({
                              ...book,
                              status: 'ready',
                              updatedAt: Date.now(),
                            });
                          }
                        }}
                        leftIcon={<Zap className="h-3.5 w-3.5 text-amber-500" />}
                        title="Finish indexing immediately without waiting for OCR"
                      >
                        ⚡ Finish Indexing
                      </Button>
                    )}
                    {book.sourceType === 'textbook' && (
                      <>
                        <Button
                          size="sm"
                          disabled={book.status === 'processing'}
                          onClick={() => {
                            setQuickGenBook(book);
                            setQuickGenOpen(true);
                          }}
                          leftIcon={<FilePlus2 className="h-3.5 w-3.5" />}
                        >
                          Generate Paper
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setChapterManagerBook(book)}
                          leftIcon={<ListTree className="h-3.5 w-3.5" />}
                        >
                          Chapter Manager ({bookChapterCount})
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteBookTarget(book)}
                      leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Question Bank Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Question Bank ({filteredQuestions.length})</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setUploadType('question_bank');
                setUploadModalOpen(true);
              }}
              leftIcon={<Upload className="h-3.5 w-3.5" />}
            >
              Import Bank
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingQuestion(null);
                setQuestionModalOpen(true);
              }}
              leftIcon={<Plus className="h-3.5 w-3.5" />}
            >
              Add Question
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              value={filterBookId}
              onValueChange={setFilterBookId}
              ariaLabel="Filter by source"
              options={[
                { value: 'all', label: 'All Sources' },
                ...books.map((b) => ({ value: b.id, label: b.title })),
              ]}
            />
            <Select
              value={filterType}
              onValueChange={setFilterType}
              ariaLabel="Filter by type"
              options={[
                { value: 'all', label: 'All Types' },
                { value: 'mcq', label: 'MCQ' },
                { value: 'assertion_reason', label: 'Assertion-Reason' },
                { value: 'very_short', label: 'Very Short' },
                { value: 'short', label: 'Short Answer' },
                { value: 'long', label: 'Long Answer' },
                { value: 'case_study', label: 'Case Study' },
              ]}
            />
            <Select
              value={filterDifficulty}
              onValueChange={setFilterDifficulty}
              ariaLabel="Filter by difficulty"
              options={[
                { value: 'all', label: 'All Difficulties' },
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
            />
          </div>

          <DataTable
            rows={filteredQuestions}
            columns={columns}
            getRowId={(q) => q.id}
            searchPlaceholder="BM25 search across question text, topic, and answers…"
            searchFilter={bm25SearchFilter}
            selectable
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            bulkActions={
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={bulkDifficulty}
                  onValueChange={(v) => setBulkDifficulty(v as DifficultyLevel)}
                  ariaLabel="Bulk difficulty"
                  className="h-8 w-28 text-xs"
                  options={[
                    { value: 'easy', label: 'Easy' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'hard', label: 'Hard' },
                  ]}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleBulkTagApply({ difficulty: bulkDifficulty })}
                >
                  Set Difficulty
                </Button>
                <Select
                  value={bulkBloom}
                  onValueChange={(v) => setBulkBloom(v as BloomLevel)}
                  ariaLabel="Bulk Bloom"
                  className="h-8 w-32 text-xs"
                  options={[
                    { value: 'remember', label: 'Remember' },
                    { value: 'understand', label: 'Understand' },
                    { value: 'apply', label: 'Apply' },
                    { value: 'analyze', label: 'Analyze' },
                    { value: 'evaluate', label: 'Evaluate' },
                    { value: 'create', label: 'Create' },
                  ]}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleBulkTagApply({ bloom: bulkBloom })}
                >
                  Set Bloom
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={aiTagging}
                  onClick={() => void handleBulkAiTag()}
                  leftIcon={<Sparkles className="h-3.5 w-3.5" />}
                >
                  AI Tag
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void handleBulkDelete()}
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                >
                  Delete
                </Button>
              </div>
            }
            emptyState={
              <EmptyState
                icon={<BookOpen className="h-5 w-5" />}
                title="No matching questions"
                description="Import a question bank, add a question manually, or clear your active filters."
              />
            }
          />
        </CardContent>
      </Card>

      {/* Modals & Chunk Search Drawer */}
      <UploadDocumentModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        defaultBoard={settings?.defaultBoard}
        defaultClassLevel={settings?.defaultClassLevel}
        defaultSubject={settings?.defaultSubject}
        defaultLanguage={settings?.language}
        initialSourceType={uploadType}
      />

      <ChapterManagerModal
        book={chapterManagerBook}
        open={Boolean(chapterManagerBook)}
        onOpenChange={(open) => !open && setChapterManagerBook(null)}
      />

      <QuickGeneratePaperModal
        open={quickGenOpen}
        onOpenChange={setQuickGenOpen}
        initialBook={quickGenBook}
      />

      <QuestionEditorModal
        open={questionModalOpen}
        onOpenChange={setQuestionModalOpen}
        initialQuestion={editingQuestion}
        chapters={chapters}
      />

      <Modal
        open={Boolean(deleteBookTarget)}
        onOpenChange={(open) => !open && setDeleteBookTarget(null)}
        title="Delete textbook and linked items?"
        description="This removes the uploaded file, detected chapters, chunks, and linked questions from local IndexedDB."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteBookTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => void handleConfirmDeleteBook()}>
              Delete Book
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Are you sure you want to remove{' '}
          <strong className="text-[var(--text-primary)]">{deleteBookTarget?.title}</strong>?
        </p>
      </Modal>

      <Drawer
        open={chunkDrawerOpen}
        onOpenChange={setChunkDrawerOpen}
        title="Search Indexed Textbook Chunks"
        description={`Offline BM25 search across ${chunks.length} indexed chunks.`}
      >
        <div className="space-y-4">
          <Input
            value={chunkQuery}
            onChange={(e) => setChunkQuery(e.target.value)}
            placeholder="Search concepts (e.g., exothermic, pH scale, heart)…"
            leftAdornment={<Search className="h-4 w-4" />}
          />

          {chunkQuery.trim() === '' ? (
            <p className="text-xs text-[var(--text-muted)]">
              Type a keyword or syllabus term to search across all indexed chapters locally.
            </p>
          ) : chunkHits.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              No matching textbook chunks found for &ldquo;{chunkQuery}&rdquo;.
            </p>
          ) : (
            <div className="space-y-3">
              {chunkHits.map((hit) => (
                <div
                  key={hit.id}
                  className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 space-y-1.5"
                >
                  <MetaLine
                    items={[
                      chapterMap.get(hit.chapterId) ?? hit.chapterId,
                      `Page ${hit.pageNumber}`,
                    ]}
                  />
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed">{hit.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
