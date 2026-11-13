import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { resolvePaperForSet } from '@/src/features/generation/paper-engine';
import type { PaperRecord } from '@/src/lib/zod-schemas';

export interface DocxExportOptions {
  setCode?: 'A' | 'B' | 'C';
  logoBytes?: Uint8Array;
  logoMimeType?: string;
}

const FONT_NAME = 'Noto Sans';

function buildHeaderParagraphs(
  paper: PaperRecord,
  setCode: 'A' | 'B' | 'C',
  subtitleTag?: string,
  logoBytes?: Uint8Array,
  logoMimeType?: string
): Array<Paragraph | Table> {
  const { header, totalMarks } = paper.blueprintSnapshot;
  const elements: Array<Paragraph | Table> = [];

  if (logoBytes && logoBytes.length > 0) {
    const imgType =
      logoMimeType === 'image/png'
        ? 'png'
        : logoMimeType === 'image/jpeg' || logoMimeType === 'image/jpg'
          ? 'jpg'
          : undefined;
    if (imgType) {
      elements.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              type: imgType,
              data: logoBytes,
              transformation: { width: 52, height: 52 },
            }),
          ],
          spacing: { after: 80 },
        })
      );
    }
  }

  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: header.schoolName || 'SCHOOL EXAMINATION PAPER',
          bold: true,
          size: 28,
          font: FONT_NAME,
        }),
      ],
      spacing: { after: 60 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: header.examTitle,
          bold: true,
          size: 24,
          font: FONT_NAME,
        }),
      ],
      spacing: { after: subtitleTag ? 60 : 120 },
    })
  );

  if (subtitleTag) {
    elements.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: subtitleTag,
            bold: true,
            size: 22,
            font: FONT_NAME,
          }),
        ],
        spacing: { after: 120 },
      })
    );
  }

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 6, color: '333333' },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: '333333' },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${header.board}  |  Class ${header.classLevel}  |  ${header.subject}${
                      header.examDate ? `  |  ${header.examDate}` : ''
                    }`,
                    bold: true,
                    size: 20,
                    font: FONT_NAME,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 6, color: '333333' },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: '333333' },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `SET ${setCode}  |  Time: ${header.durationMinutes} min  |  Max Marks: ${totalMarks}`,
                    bold: true,
                    size: 20,
                    font: FONT_NAME,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  elements.push(metaTable);
  return elements;
}

export async function exportPaperDocxBlob(
  paper: PaperRecord,
  options: DocxExportOptions = {}
): Promise<Blob> {
  const setCode = options.setCode ?? 'A';
  const children: Array<Paragraph | Table> = [
    ...buildHeaderParagraphs(paper, setCode, undefined, options.logoBytes, options.logoMimeType),
  ];

  if (paper.blueprintSnapshot.header.generalInstructions.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'General Instructions:', bold: true, size: 21, font: FONT_NAME }),
        ],
        spacing: { before: 160, after: 60 },
      })
    );
    paper.blueprintSnapshot.header.generalInstructions.forEach((inst, idx) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${idx + 1}. ${inst}`, size: 19, font: FONT_NAME })],
          indent: { left: 260 },
          spacing: { after: 40 },
        })
      );
    });
  }

  const resolvedSections = resolvePaperForSet(paper, setCode);

  for (const section of resolvedSections) {
    const attemptHint =
      section.choiceRule.enabled && section.choiceRule.attemptCount && section.choiceRule.totalCount
        ? ` (Attempt any ${section.choiceRule.attemptCount} of ${section.choiceRule.totalCount})`
        : '';

    const sectionMarks =
      section.choiceRule.enabled && section.choiceRule.attemptCount
        ? section.choiceRule.attemptCount * section.marksPerQuestion
        : section.questions.filter((q) => !q.alternativeToId).length * section.marksPerQuestion;

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${section.name}${attemptHint}   [${sectionMarks} Marks]`,
            bold: true,
            size: 23,
            font: FONT_NAME,
          }),
        ],
        spacing: { before: 240, after: 100 },
      })
    );

    if (section.instructions) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: section.instructions, italics: true, size: 19, font: FONT_NAME }),
          ],
          spacing: { after: 100 },
        })
      );
    }

    for (const q of section.questions) {
      if (q.alternativeToId) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'OR', bold: true, size: 19, font: FONT_NAME })],
            spacing: { before: 60, after: 60 },
          })
        );
      }

      const qNum = q.alternativeToId ? '    ' : `${q.displayNumber}. `;
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: qNum, bold: true, size: 21, font: FONT_NAME }),
            new TextRun({ text: `${q.text}  `, size: 21, font: FONT_NAME }),
            new TextRun({ text: `[${q.marks}]`, bold: true, size: 20, font: FONT_NAME }),
          ],
          spacing: { before: 80, after: q.resolvedOptions ? 40 : 120 },
        })
      );

      if (q.resolvedOptions && q.resolvedOptions.length === 4) {
        const labels = ['(a)', '(b)', '(c)', '(d)'];
        children.push(
          new Table({
            width: { size: 95, type: WidthType.PERCENTAGE },
            indent: { size: 320, type: WidthType.DXA },
            rows: [0, 2].map(
              (base) =>
                new TableRow({
                  children: [0, 1].map(
                    (offset) =>
                      new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        borders: {
                          top: { style: BorderStyle.NONE },
                          bottom: { style: BorderStyle.NONE },
                          left: { style: BorderStyle.NONE },
                          right: { style: BorderStyle.NONE },
                        },
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${labels[base + offset]} ${q.resolvedOptions![base + offset] ?? ''}`,
                                size: 19,
                                font: FONT_NAME,
                              }),
                            ],
                          }),
                        ],
                      })
                  ),
                })
            ),
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `${paper.blueprintSnapshot.header.subject} · Set ${setCode}  |  Page `,
                    size: 18,
                    font: FONT_NAME,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    font: FONT_NAME,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function exportAnswerKeyDocxBlob(
  paper: PaperRecord,
  options: DocxExportOptions = {}
): Promise<Blob> {
  const setCode = options.setCode ?? 'A';
  const children: Array<Paragraph | Table> = [
    ...buildHeaderParagraphs(
      paper,
      setCode,
      `ANSWER KEY & MARKING SCHEME — SET ${setCode}`,
      options.logoBytes,
      options.logoMimeType
    ),
  ];

  const resolvedSections = resolvePaperForSet(paper, setCode);

  for (const section of resolvedSections) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: section.name, bold: true, size: 22, font: FONT_NAME })],
        spacing: { before: 220, after: 100 },
      })
    );

    const rows = [
      new TableRow({
        tableHeader: true,
        children: ['Q.No.', 'Answer / Value Points', 'Marking Scheme', 'Marks'].map(
          (heading, colIdx) =>
            new TableCell({
              width: {
                size: colIdx === 0 ? 12 : colIdx === 3 ? 10 : 39,
                type: WidthType.PERCENTAGE,
              },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: heading, bold: true, size: 19, font: FONT_NAME })],
                }),
              ],
            })
        ),
      }),
      ...section.questions.map((q) => {
        const qLabel = q.alternativeToId ? `Q${q.displayNumber} (OR)` : `Q${q.displayNumber}`;
        const answerDisplay = q.resolvedAnswerLabel ?? q.answer;
        const schemeText = [
          q.markingScheme || 'Award marks for key steps and scientific accuracy.',
          `(${q.topic} · ${q.difficulty} · ${q.bloom})`,
        ].join(' ');

        return new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: qLabel, bold: true, size: 19, font: FONT_NAME })],
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: answerDisplay, size: 19, font: FONT_NAME })],
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: schemeText, size: 18, font: FONT_NAME })],
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: `${q.marks}`, bold: true, size: 19, font: FONT_NAME }),
                  ],
                }),
              ],
            }),
          ],
        });
      }),
    ];

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows,
      })
    );
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}
