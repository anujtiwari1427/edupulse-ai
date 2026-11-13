import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/src/features/storage/db';
import { ensureBuiltInTemplatesSeeded, repository } from '@/src/features/storage/repository';
import { CreatePaperPage } from '../CreatePaperPage';

describe('CreatePaperPage 4-Step Wizard', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureBuiltInTemplatesSeeded();
  });

  it('walks through Source -> Blueprint -> Review -> Offline Bank Generation', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CreatePaperPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(/Your local Library has no uploaded books yet/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Load Sample Class 10 Library/i }));

    await waitFor(() => {
      expect(screen.getByText(/NCERT Class 10 Science/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Next: Blueprint & Template/i }));
    expect(await screen.findByText(/Start From a Board Template/i)).toBeInTheDocument();

    // Verify live summary card renders marks
    expect(screen.getByText(/Live Blueprint Summary/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Next: Review & Estimate/i }));
    expect(await screen.findByText(/Running in Offline \/ Bank-Only mode/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Generate Question Paper/i }));

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /Open in Paper Editor/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const papers = await repository.papersRepo.listPapers();
    expect(papers.length).toBeGreaterThanOrEqual(2);
  });
});
