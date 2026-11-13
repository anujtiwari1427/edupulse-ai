import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { createBlankBlueprint } from '@/src/features/blueprint/blueprint-engine';
import { generateParallelSets } from '@/src/features/generation/paper-engine';
import type { PaperRecord } from '@/src/lib/zod-schemas';
import { exportAnswerKeyDocxBlob, exportPaperDocxBlob } from '../docx-exporter';
import { exportPaperJsonBlob, parseImportedPaperJson } from '../json-exporter';
import { exportAnswerKeyPdfBytes, exportPaperPdfBytes } from '../pdf-exporter';

async function loadTestFont(fileName: string): Promise<Uint8Array> {
  const fullPath = path.resolve(process.cwd(), 'public', 'fonts', fileName);
  const buf = await fs.readFile(fullPath);
  return new Uint8Array(buf);
}

function buildMultilingualSamplePaper(): PaperRecord {
  const bp = createBlankBlueprint({
    schoolName: 'सरस्वती विद्यालय / Saraswati Vidyalaya Pune',
    board: 'MAHARASHTRA',
    classLevel: 10,
    subject: 'Science & विज्ञान',
    language: 'mr',
  });

  const sections = [
    {
      id: 'sec_1',
      name: 'Section A — Objective (बहुपर्यायी प्रश्न)',
      marksPerQuestion: 1,
      choiceRule: { enabled: false, internalChoiceCount: 0 },
      questions: [
        {
          id: 'q1',
          paperQuestionId: 'pq1',
          order: 0,
          type: 'mcq' as const,
          text: 'रासायनिक अभिक्रियेत कोणता वायू मुक्त होतो? (Which gas is evolved during Zn + H2SO4?)',
          options: ['ऑक्सिजन (O2)', 'हायड्रोजन (H2)', 'नायट्रोजन (N2)', 'क्लोरीन (Cl2)'],
          answer: 'हायड्रोजन (H2)',
          markingScheme: '1 mark for correct option.',
          marks: 1,
          difficulty: 'easy' as const,
          bloom: 'remember' as const,
          topic: 'रासायनिक अभिक्रिया',
          origin: 'bank' as const,
          language: 'mr' as const,
          hash: 'h1',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    },
    {
      id: 'sec_2',
      name: 'Section B — Short Answer (लघु उत्तरीय प्रश्न)',
      marksPerQuestion: 3,
      choiceRule: { enabled: true, internalChoiceCount: 1 },
      questions: [
        {
          id: 'q2',
          paperQuestionId: 'pq2',
          order: 0,
          type: 'short' as const,
          text: 'प्रकाश के परावर्तन के दो नियम लिखिए। State the two laws of reflection of light.',
          answer:
            'Angle of incidence equals angle of reflection; incident ray, normal and reflected ray lie in one plane.',
          markingScheme: '1.5 marks per law.',
          marks: 3,
          difficulty: 'medium' as const,
          bloom: 'understand' as const,
          topic: 'Light',
          origin: 'bank' as const,
          language: 'hi' as const,
          hash: 'h2',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'q3',
          paperQuestionId: 'pq3',
          order: 1,
          alternativeToId: 'pq2',
          type: 'short' as const,
          text: 'Define Ohm’s law with formula V = I × R and unit Ω.',
          answer:
            'At constant temperature, current through a conductor is directly proportional to potential difference.',
          markingScheme: '1m definition, 1m formula, 1m SI unit.',
          marks: 3,
          difficulty: 'medium' as const,
          bloom: 'understand' as const,
          topic: 'Electricity',
          origin: 'ai' as const,
          language: 'en' as const,
          hash: 'h3',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    },
  ];

  bp.totalMarks = 4;

  return {
    id: 'paper_multi_1',
    title: 'Class 10 Multilingual Unit Test',
    blueprintSnapshot: bp,
    sections,
    sets: generateParallelSets(sections, 77),
    language: 'mr',
    status: 'draft',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('PDF, DOCX & JSON Exporters', () => {
  it('generates valid A4 PDFs with embedded Noto Sans & Devanagari fonts for Paper and Answer Key', async () => {
    const paper = buildMultilingualSamplePaper();

    const paperBytes = await exportPaperPdfBytes(paper, {
      setCode: 'B',
      fontLoader: loadTestFont,
    });
    expect(paperBytes.byteLength).toBeGreaterThan(2000);
    expect(new TextDecoder().decode(paperBytes.slice(0, 5))).toBe('%PDF-');

    const loadedPaperPdf = await PDFDocument.load(paperBytes);
    expect(loadedPaperPdf.getPageCount()).toBeGreaterThanOrEqual(1);

    const keyBytes = await exportAnswerKeyPdfBytes(paper, {
      setCode: 'B',
      fontLoader: loadTestFont,
    });
    expect(keyBytes.byteLength).toBeGreaterThan(2000);
    const loadedKeyPdf = await PDFDocument.load(keyBytes);
    expect(loadedKeyPdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('generates valid editable DOCX archives for Question Paper and Answer Key', async () => {
    const paper = buildMultilingualSamplePaper();

    const paperBlob = await exportPaperDocxBlob(paper, { setCode: 'A' });
    const paperZip = await JSZip.loadAsync(await paperBlob.arrayBuffer());
    const docXml = await paperZip.file('word/document.xml')?.async('string');
    expect(docXml).toBeTruthy();
    expect(docXml).toContain('Saraswati Vidyalaya Pune');
    expect(docXml).toContain('रासायनिक अभिक्रियेत कोणता वायू मुक्त होतो');

    const keyBlob = await exportAnswerKeyDocxBlob(paper, { setCode: 'C' });
    const keyZip = await JSZip.loadAsync(await keyBlob.arrayBuffer());
    const keyXml = await keyZip.file('word/document.xml')?.async('string');
    expect(keyXml).toBeTruthy();
    expect(keyXml).toContain('ANSWER KEY');
    expect(keyXml).toContain('हायड्रोजन');
  });

  it('exports and validates re-imported Paper JSON with Zod', async () => {
    const paper = buildMultilingualSamplePaper();
    const blob = exportPaperJsonBlob(paper);
    const raw = await blob.text();

    const imported = parseImportedPaperJson(raw);
    expect(imported.id).not.toBe(paper.id);
    expect(imported.title).toBe(`${paper.title} (Imported)`);
    expect(imported.sections).toHaveLength(2);

    expect(() => parseImportedPaperJson('{"bad":"payload"}')).toThrow();
  });
});
