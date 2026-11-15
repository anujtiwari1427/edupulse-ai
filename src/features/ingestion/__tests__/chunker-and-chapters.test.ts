import { describe, expect, it } from 'vitest';
import { chunkPages, estimateTokens } from '../chunker';
import {
  detectChaptersFromPages,
  mergeChapters,
  reassignChunksToChapters,
  renameChapter,
  splitChapterAtPage,
  updateChapterRange,
} from '../chapter-detector';
import type { ChapterRecord } from '@/src/lib/zod-schemas';

describe('Document Chunker & Chapter Manager', () => {
  it('estimates tokens for Latin and Devanagari text', () => {
    expect(estimateTokens('Chemical equations must be balanced.')).toBeGreaterThan(4);
    expect(estimateTokens('रासायनिक अभिक्रिया और समीकरण संतुलित होने चाहिए।')).toBeGreaterThan(6);
  });

  it('chunks multi-page chapters within 500-800 token ceiling and preserves overlap', () => {
    const longSentence =
      'Photosynthesis converts light energy into chemical energy inside chloroplasts using carbon dioxide and water. ';
    const pageText = Array.from({ length: 45 }, () => longSentence).join('');
    const pages = [
      { pageNumber: 1, text: pageText },
      { pageNumber: 2, text: pageText },
    ];
    const chapters: ChapterRecord[] = [
      {
        id: 'ch1',
        bookId: 'b1',
        order: 1,
        title: 'Chapter 1: Life Processes',
        startPage: 1,
        endPage: 2,
        topics: [],
      },
    ];

    const chunks = chunkPages(pages, chapters, { bookId: 'b1', language: 'en' });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i]!.tokenEstimate).toBeGreaterThanOrEqual(480);
      expect(chunks[i]!.tokenEstimate).toBeLessThanOrEqual(800);
      expect(chunks[i]!.chapterId).toBe('ch1');
    }
  });

  it('detects chapters from outline or text headings (including Devanagari)', () => {
    const pages = [
      { pageNumber: 1, text: 'Chapter 1: Chemical Reactions\nBalanced equations...' },
      { pageNumber: 2, text: 'More details on combination reactions.' },
      { pageNumber: 3, text: 'अध्याय 2: अम्ल, क्षारक एवं लवण\npH scale overview' },
      { pageNumber: 4, text: 'Neutralisation examples.' },
    ];

    const detected = detectChaptersFromPages(pages);
    expect(detected).toHaveLength(2);
    expect(detected[0]).toMatchObject({ order: 1, startPage: 1, endPage: 2 });
    expect(detected[1]).toMatchObject({ order: 2, startPage: 3, endPage: 4 });

    const fromOutline = detectChaptersFromPages(pages, [
      { title: 'Unit I: Chemistry', pageNumber: 1 },
      { title: 'Unit II: Biology', pageNumber: 3 },
    ]);
    expect(fromOutline).toHaveLength(2);
    expect(fromOutline[0]?.title).toBe('Unit I: Chemistry');
  });

  it('supports rename, split, merge, range edit, and chunk reassignment in Chapter Manager', () => {
    const initial: ChapterRecord[] = [
      { id: 'c1', bookId: 'b1', order: 1, title: 'Ch 1', startPage: 1, endPage: 10, topics: [] },
      { id: 'c2', bookId: 'b1', order: 2, title: 'Ch 2', startPage: 11, endPage: 20, topics: [] },
    ];

    const renamed = renameChapter(initial, 'c1', 'Chemical Reactions');
    expect(renamed[0]?.title).toBe('Chemical Reactions');

    const split = splitChapterAtPage(renamed, 'c1', 6, 'Types of Reactions');
    expect(split).toHaveLength(3);
    expect(split[0]).toMatchObject({ startPage: 1, endPage: 5 });
    expect(split[1]).toMatchObject({ title: 'Types of Reactions', startPage: 6, endPage: 10 });

    const adjusted = updateChapterRange(split, split[1]!.id, 6, 11);
    expect(adjusted[1]?.endPage).toBe(11);

    const chunks = [
      {
        id: 'k1',
        bookId: 'b1',
        chapterId: 'old',
        pageNumber: 7,
        chunkIndex: 0,
        text: 'Decomposition reaction',
        tokenEstimate: 10,
        language: 'en' as const,
      },
    ];
    const reassigned = reassignChunksToChapters(chunks, adjusted);
    expect(reassigned[0]?.chapterId).toBe(split[1]!.id);

    const merged = mergeChapters(split, 'c1', 'next');
    expect(merged).toHaveLength(2);
    expect(merged[0]?.endPage).toBe(10);
  });

  it('rejects bogus DTP printer bookmarks (PRILIM, TEXT, COVER NO. 3) and falls back to TOC', () => {
    const bogusOutline = [
      { title: 'COVER NO. 1', pageNumber: 1 },
      { title: 'PRILIM', pageNumber: 3 },
      { title: 'TEXT', pageNumber: 11 },
      { title: 'COVER NO. 3', pageNumber: 147 },
    ];

    const pages = [
      { pageNumber: 1, text: 'Cover Page' },
      { pageNumber: 2, text: 'National Anthem & Preface' },
      {
        pageNumber: 3,
        text: `INDEX
No. Chapter Name Page No.
1. Sets ......................... 1
2. Real Numbers ................. 19
3. Polynomials .................. 36
4. Ratio and Proportion ......... 58`,
      },
      ...Array.from({ length: 7 }, (_, i) => ({ pageNumber: 4 + i, text: `Front matter page ${4 + i}` })),
      { pageNumber: 11, text: '1. Sets\nBasic concepts of sets and Venn diagrams' },
      { pageNumber: 29, text: '2. Real Numbers\nIrrational numbers and surds' },
      { pageNumber: 46, text: '3. Polynomials\nDegree of polynomial and factorization' },
      { pageNumber: 68, text: '4. Ratio and Proportion\nDirect and inverse proportion' },
      { pageNumber: 147, text: 'Back Cover' },
    ];

    const detected = detectChaptersFromPages(pages, bogusOutline);
    expect(detected.length).toBeGreaterThanOrEqual(4);
    // Must NOT contain PRILIM, TEXT, or COVER
    const titles = detected.map((d) => d.title.toUpperCase());
    expect(titles).not.toContain('PRILIM');
    expect(titles).not.toContain('TEXT');
    expect(titles).not.toContain('COVER NO. 3');

    expect(detected[0]?.title).toBe('Sets');
    expect(detected[0]?.startPage).toBe(11);
    expect(detected[1]?.title).toBe('Real Numbers');
    expect(detected[1]?.startPage).toBe(29);
  });

  it('detects Marathi Balbharati TOC with अनुक्रमणिका', () => {
    const pages = [
      { pageNumber: 1, text: 'मुखपृष्ठ' },
      {
        pageNumber: 2,
        text: `अनुक्रमणिका
क्र. पाठाचे नाव पृष्ठ क्र.
१. संच ...................... १
२. वास्तव संख्या .............. १९
३. बहुपदी ................... ३६`,
      },
      ...Array.from({ length: 8 }, (_, i) => ({ pageNumber: 3 + i, text: `प्रस्तावना पान ${3 + i}` })),
      { pageNumber: 11, text: '१. संच\nसंच संकल्पना व वेन आकृत्या' },
      { pageNumber: 29, text: '२. वास्तव संख्या\nअपरिमेय संख्या' },
      { pageNumber: 46, text: '३. बहुपदी\nबहुपदींची कोटी' },
    ];

    const detected = detectChaptersFromPages(pages);
    expect(detected).toHaveLength(3);
    expect(detected[0]?.title).toBe('संच');
    expect(detected[0]?.startPage).toBe(11);
    expect(detected[1]?.title).toBe('वास्तव संख्या');
  });

  it('detects multi-section 10th History & Political Science textbook TOC', () => {
    const pages = [
      { pageNumber: 1, text: 'History and Political Science Standard X' },
      {
        pageNumber: 3,
        text: `INDEX
Part 1 : History
1. Historiography : Development in the West ....... 1
2. Historiography : Indian Tradition ............. 7
3. Applied History ............................... 15
Part 2 : Political Science
1. Working of the Constitution .................. 75
2. The Electoral Process ......................... 83`,
      },
      ...Array.from({ length: 7 }, (_, i) => ({ pageNumber: 4 + i, text: `Prelim ${4 + i}` })),
      { pageNumber: 11, text: '1. Historiography : Development in the West\nHistorical research...' },
      { pageNumber: 17, text: '2. Historiography : Indian Tradition\nAncient traditions...' },
      { pageNumber: 25, text: '3. Applied History\nPublic history...' },
      { pageNumber: 85, text: '1. Working of the Constitution\nDemocratic governance...' },
      { pageNumber: 93, text: '2. The Electoral Process\nElection commission...' },
    ];

    const detected = detectChaptersFromPages(pages);
    expect(detected).toHaveLength(5);
    expect(detected[0]?.title).toContain('Historiography : Development in the West');
    expect(detected[0]?.startPage).toBe(11);
    expect(detected[3]?.title).toContain('Working of the Constitution');
    expect(detected[3]?.startPage).toBe(85);
  });
});
