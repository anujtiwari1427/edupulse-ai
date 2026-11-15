import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/src/features/storage/db';
import { repository } from '@/src/features/storage/repository';
import {
  startIngestionJob,
  validateUploadFile,
} from '@/src/features/ingestion/ingestion-service';
import { LibraryPage } from '../LibraryPage';

describe('Library & Ingestion Pipeline', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('validates upload file size and extension', () => {
    const empty = new File([], 'empty.pdf', { type: 'application/pdf' });
    expect(() => validateUploadFile(empty)).toThrow(/empty/i);

    const unsupported = new File(['abc'], 'notes.exe', { type: 'application/octet-stream' });
    expect(() => validateUploadFile(unsupported)).toThrow(/Unsupported file format/i);

    const valid = new File(['Chapter 1: Matter\nSolids and liquids.'], 'chapter1.txt', {
      type: 'text/plain',
    });
    expect(() => validateUploadFile(valid)).not.toThrow();
  });

  it('requires copyright confirmation and ingests TXT textbook + CSV bank into Dexie', async () => {
    const textbookFile = new File(
      ['Chapter 1: Light\nReflection and refraction of light through lenses and mirrors.'],
      'light.txt',
      { type: 'text/plain' }
    );

    await expect(
      startIngestionJob({
        file: textbookFile,
        title: 'Class 10 Physics',
        board: 'CBSE',
        classLevel: 10,
        subject: 'Science',
        language: 'en',
        sourceType: 'textbook',
        ocrEnabled: false,
        copyrightConfirmed: false,
      })
    ).rejects.toThrow(/educational-use rights/i);

    const { bookId } = await startIngestionJob({
      file: textbookFile,
      title: 'Class 10 Physics',
      board: 'CBSE',
      classLevel: 10,
      subject: 'Science',
      language: 'en',
      sourceType: 'textbook',
      ocrEnabled: false,
      copyrightConfirmed: true,
    });

    await waitFor(
      async () => {
        const book = await repository.libraryRepo.getBook(bookId);
        expect(book?.status).toBe('ready');
      },
      { timeout: 8000 }
    );

    const chapters = await repository.libraryRepo.listChapters(bookId);
    const chunks = await repository.libraryRepo.listAllChunks(bookId);
    expect(chapters.length).toBeGreaterThanOrEqual(1);
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    const csvFile = new File(
      [
        'question,type,marks,options,answer,difficulty,bloom,topic\n' +
          '"What is the SI unit of refractive index?",very_short,1,,No unit (dimensionless),easy,remember,Optics',
      ],
      'optics-bank.csv',
      { type: 'text/csv' }
    );

    const bankJob = await startIngestionJob({
      file: csvFile,
      title: 'Optics Bank',
      board: 'CBSE',
      classLevel: 10,
      subject: 'Science',
      language: 'en',
      sourceType: 'question_bank',
      ocrEnabled: false,
      copyrightConfirmed: true,
    });

    await waitFor(async () => {
      const book = await repository.libraryRepo.getBook(bankJob.bookId);
      expect(book?.status).toBe('ready');
    });

    const questions = await repository.libraryRepo.listQuestions();
    expect(questions.some((q) => q.text.includes('refractive index'))).toBe(true);
  });

  it('renders LibraryPage empty state, loads sample library, and searches chunks locally', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/No textbooks or question banks uploaded yet/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Load Sample Class 10 Library/i }));

    await waitFor(() => {
      expect(screen.getByText(/NCERT Class 10 Science/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Search Textbook Chunks/i }));
    const searchBox = await screen.findByPlaceholderText(/Search concepts/i);
    await user.type(searchBox, 'ferrous');
    expect(searchBox).toHaveValue('ferrous');

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveTextContent(
        /Thermal decomposition of ferrous sulphate crystals/i
      );
    });
  });
});
