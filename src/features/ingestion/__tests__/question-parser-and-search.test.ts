import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { fuzzyTokenSimilarity, parseQuestionBankText } from '../question-parser';
import { extractEpubPages } from '../epub-parser';
import { LocalBM25Index } from '../search-index';

describe('Question Bank Parser, Dedupe, EPUB & BM25 Search', () => {
  it('parses numbered PYQ text with MCQ options, marks, answers, and deduplication', async () => {
    const raw = `
Q.1 Which gas turns lime water milky? [1 Mark]
(a) Oxygen
(b) Carbon dioxide
(c) Nitrogen
(d) Hydrogen
Ans: (b)

Q.2 Explain why respiration is an exothermic process and write the balanced equation. [3 Marks]
Ans: Glucose combines with oxygen in cells to release energy (ATP), CO2 and water.

Q.3 Which gas turns lime water milky? [1 Mark]
(a) Oxygen
(b) Carbon dioxide
(c) Nitrogen
(d) Hydrogen
Ans: (b)
`;

    const result = await parseQuestionBankText(raw, { language: 'en' });
    expect(result.parsed).toHaveLength(2);
    expect(result.duplicatesSkipped).toBe(1);

    expect(result.parsed[0]).toMatchObject({
      type: 'mcq',
      marks: 1,
      answer: 'Carbon dioxide',
    });
    expect(result.parsed[0]?.options).toHaveLength(4);

    expect(result.parsed[1]).toMatchObject({
      type: 'short',
      marks: 3,
      bloom: 'understand',
    });
  });

  it('parses CSV question bank imports and computes fuzzy similarity', async () => {
    const csv = `question,type,marks,options,answer,difficulty,bloom,topic
"What is the pH of pure water at 25C?",mcq,1,"5|7|9|11",7,easy,remember,pH Scale
"State Ohm's law and write its formula.",very_short,2,,V = IR,medium,understand,Electricity`;

    const result = await parseQuestionBankText(csv);
    expect(result.parsed).toHaveLength(2);
    expect(result.parsed[0]?.options).toEqual(['5', '7', '9', '11']);
    expect(result.parsed[1]?.topic).toBe('Electricity');

    expect(
      fuzzyTokenSimilarity(
        'State Ohms law and write its mathematical formula',
        'State Ohms law and write its formula'
      )
    ).toBeGreaterThan(0.8);
  });

  it('extracts ordered pages from an EPUB archive via JSZip', async () => {
    const zip = new JSZip();
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`
    );
    zip.file(
      'OEBPS/content.opf',
      `<package><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`
    );
    zip.file(
      'OEBPS/ch1.xhtml',
      `<html><body><h1>Chapter 1: Heredity</h1><p>Traits are passed across generations.</p></body></html>`
    );

    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    const pages = await extractEpubPages(buf);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.text).toContain('Chapter 1: Heredity');
    expect(pages[0]?.text).toContain('Traits are passed');
  });

  it('indexes chunks and questions in MiniSearch BM25 and filters by chapterId', () => {
    const index = new LocalBM25Index();
    index.indexChunks([
      {
        id: 'chk1',
        bookId: 'b1',
        chapterId: 'ch1',
        pageNumber: 4,
        chunkIndex: 0,
        text: 'Thermal decomposition of ferrous sulphate yields ferric oxide.',
        tokenEstimate: 12,
        language: 'en',
      },
      {
        id: 'chk2',
        bookId: 'b1',
        chapterId: 'ch2',
        pageNumber: 12,
        chunkIndex: 1,
        text: 'Phenolphthalein turns pink in basic solutions above pH 8.',
        tokenEstimate: 12,
        language: 'en',
      },
    ]);

    const hits = index.searchChunks('ferrous sulphate', { chapterId: 'ch1' });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.pageNumber).toBe(4);
    expect(index.searchChunks('ferrous sulphate', { chapterId: 'ch2' })).toHaveLength(0);
  });
});
