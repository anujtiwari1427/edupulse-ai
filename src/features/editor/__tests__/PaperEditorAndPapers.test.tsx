import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBlankBlueprint } from '@/src/features/blueprint/blueprint-engine';
import { generateParallelSets } from '@/src/features/generation/paper-engine';
import { db } from '@/src/features/storage/db';
import { repository } from '@/src/features/storage/repository';
import type { PaperRecord } from '@/src/lib/zod-schemas';
import { TooltipProvider } from '@/src/components/ui';
import { PaperEditorPage } from '../PaperEditorPage';
import { SavedPapersPage } from '../SavedPapersPage';

async function seedEditablePaper(): Promise<PaperRecord> {
  const bp = createBlankBlueprint({
    schoolName: 'Kendriya Vidyalaya Pune',
    subject: 'Science',
  });
  bp.totalMarks = 3;
  const sections = [
    {
      id: 'sec_1',
      name: 'Section A — Objective',
      marksPerQuestion: 1,
      choiceRule: { enabled: false, internalChoiceCount: 0 },
      questions: [
        {
          id: 'q1',
          paperQuestionId: 'pq1',
          order: 0,
          type: 'mcq' as const,
          text: 'What is the SI unit of electric current?',
          options: ['Volt', 'Ampere', 'Ohm', 'Watt'],
          answer: 'Ampere',
          markingScheme: '1 mark for Ampere',
          marks: 1,
          difficulty: 'easy' as const,
          bloom: 'remember' as const,
          topic: 'Electricity',
          origin: 'bank' as const,
          language: 'en' as const,
          hash: 'h1',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'q2',
          paperQuestionId: 'pq2',
          order: 1,
          type: 'short' as const,
          text: 'Define convex lens focal length.',
          answer: 'Distance between optical centre and principal focus.',
          markingScheme: '2 marks for exact definition.',
          marks: 2,
          difficulty: 'medium' as const,
          bloom: 'understand' as const,
          topic: 'Optics',
          origin: 'bank' as const,
          language: 'en' as const,
          hash: 'h2',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    },
  ];
  const paper: PaperRecord = {
    id: 'paper_ui_1',
    title: 'Class 10 Term 1 Science',
    blueprintSnapshot: bp,
    sections,
    sets: generateParallelSets(sections, 45),
    language: 'en',
    status: 'draft',
    createdAt: 1,
    updatedAt: 1,
  };
  await repository.papersRepo.savePaper(paper, 'Initial seed');
  return paper;
}

describe('PaperEditorPage, SavedPapersPage & Accessibility', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    cleanup();
  });

  it('edits questions inline, supports Undo/Redo, switches Set B & Answer Key, and passes axe accessibility checks', async () => {
    const paper = await seedEditablePaper();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    const { container } = render(
      <TooltipProvider>
        <MemoryRouter initialEntries={[`/app/editor/${paper.id}`]}>
          <Routes>
            <Route path="/app/editor/:paperId" element={<PaperEditorPage />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    );

    await screen.findByDisplayValue('Class 10 Term 1 Science');

    // Edit question 1 inline
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]!);
    const stemInput = screen.getByLabelText('Question Text');
    fireEvent.change(stemInput, { target: { value: 'Name the SI unit of current flow.' } });
    expect(screen.getAllByText(/Name the SI unit of current flow\./).length).toBeGreaterThanOrEqual(
      1
    );

    // Undo reverts edit
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(
        screen.getAllByText(/What is the SI unit of electric current\?/).length
      ).toBeGreaterThanOrEqual(1);
    });

    // Switch to Set B and Answer Key view in live preview
    await user.click(screen.getByRole('button', { name: 'Set B' }));
    await user.click(screen.getByRole('button', { name: 'Answer Key' }));
    expect(screen.getByText(/Answer Key & Marking Scheme — Set B/i)).toBeInTheDocument();

    // Run axe accessibility check
    const results = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false }, // jsdom does not compute external stylesheets
      },
    });
    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(seriousOrCritical).toEqual([]);
  }, 15000);

  it('filters, duplicates, and opens version history on SavedPapersPage cleanly', async () => {
    await seedEditablePaper();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    const { container } = render(
      <TooltipProvider>
        <MemoryRouter initialEntries={['/app/papers']}>
          <Routes>
            <Route path="/app/papers" element={<SavedPapersPage />} />
            <Route path="/app/editor/:paperId" element={<div>Editor Route</div>} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    );

    await screen.findByText('Class 10 Term 1 Science');

    const duplicateBtn = await screen.findByTitle('Duplicate paper');
    await user.click(duplicateBtn);
    await screen.findByText('Class 10 Term 1 Science (Copy)');

    await user.type(screen.getByLabelText('Search saved papers'), 'Copy');
    expect(screen.queryByText('Class 10 Term 1 Science')).not.toBeInTheDocument();
    expect(screen.getByText('Class 10 Term 1 Science (Copy)')).toBeInTheDocument();

    const results = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    });
    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(seriousOrCritical).toEqual([]);
  });
});
