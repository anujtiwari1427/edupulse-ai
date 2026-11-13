import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from '../LandingPage';

describe('LandingPage', () => {
  it('renders hero copy, 3D studio controls/fallback, workspace CTA, and interactive mockup tabs', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', {
        name: /Turn your textbooks into exam-ready papers in minutes/i,
      })
    ).toBeInTheDocument();

    expect(screen.getAllByRole('link', { name: /Open Workspace/i }).length).toBeGreaterThan(0);

    // Verify graceful 3D fallback renders cleanly in jsdom without WebGL errors
    const fallback = screen.getByTestId('studio-3d-fallback');
    expect(fallback).toBeInTheDocument();

    // Test interactive 3D studio control dock
    await user.click(screen.getByRole('button', { name: /MSBSHSE/i }));
    await user.click(screen.getByRole('button', { name: /Explode/i }));
    expect(within(fallback).getByText(/EXPLODED ARCHITECTURE/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Set B$/i }));
    expect(within(fallback).getByText('SET B')).toBeInTheDocument();

    // Test Blueprint Math & Showcase interactive tabs
    await user.click(screen.getByRole('button', { name: /Blueprint Math/i }));
    expect(screen.getByText(/Validated Blueprint Total/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Sets A \/ B \/ C/i }));
    expect(
      screen.getByText(/Anti-copying parallel sets with aligned answer keys/i)
    ).toBeInTheDocument();
  });
});
