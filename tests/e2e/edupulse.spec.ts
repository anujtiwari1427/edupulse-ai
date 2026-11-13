import { expect, test } from '@playwright/test';

test.describe('EduPulse AI End-to-End Local-First Workflow', () => {
  test('Landing -> Workspace -> Sample Library -> Create Paper -> Split Editor -> PDF/DOCX Export -> Reload Persistence', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // 1. Public Landing Page
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page
      .getByRole('link', { name: /Open Workspace/i })
      .first()
      .click();

    // 2. Wait for Onboarding modal, dismiss it cleanly, then load Sample Class 10 Library
    await expect(page).toHaveURL(/\/app/);
    const onboardingDialog = page.getByRole('dialog', { name: /Welcome to EduPulse AI/i });
    await expect(onboardingDialog).toBeVisible({ timeout: 10000 });
    await onboardingDialog.getByRole('button', { name: /Skip for now/i }).click();
    await expect(onboardingDialog).toBeHidden({ timeout: 10000 });

    await page
      .getByRole('button', { name: /Load Sample Class 10 Library/i })
      .first()
      .click();
    await expect(page.getByText(/Sample Class 10 Science library loaded/i)).toBeVisible({
      timeout: 10000,
    });

    // 3. Navigate to Create Paper Wizard -> Step through -> Generate Offline Bank Paper
    await page
      .getByRole('link', { name: /Create Question Paper/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/app\/create/);
    await expect(page.getByRole('heading', { name: /Create Question Paper/i })).toBeVisible();
    await page.getByRole('button', { name: /Next: Blueprint/i }).click();
    await page.getByRole('button', { name: /Next: Review & Estimate/i }).click();
    await page.getByRole('button', { name: /Generate Question Paper/i }).click();

    // Wait for completion and open editor
    await expect(page.getByRole('button', { name: /Open in Paper Editor/i })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: /Open in Paper Editor/i }).click();
    await expect(page).toHaveURL(/\/app\/editor\//);

    // 4. Edit title, switch Set B & Answer Key, trigger PDF & DOCX download
    const titleInput = page.getByLabel('Paper title');
    await expect(titleInput).toBeVisible();
    await titleInput.fill('E2E Verified Class 10 Science');

    // Wait for debounced autosave indicator
    await expect(page.getByText(/Saved locally/i)).toBeVisible({ timeout: 8000 });

    await page.getByRole('button', { name: 'Set B' }).click();
    await page.getByRole('button', { name: 'Answer Key' }).click();
    await expect(page.getByText(/Answer Key & Marking Scheme — Set B/i)).toBeVisible();

    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await page.getByRole('button', { name: 'Export' }).click();
        await page.getByRole('menuitem', { name: /Question Paper PDF/i }).click();
      })(),
    ]);
    expect(pdfDownload.suggestedFilename()).toMatch(/-SetB\.pdf$/);

    const [docxDownload] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await page.getByRole('button', { name: 'Export' }).click();
        await page.getByRole('menuitem', { name: /Question Paper DOCX/i }).click();
      })(),
    ]);
    expect(docxDownload.suggestedFilename()).toMatch(/-SetB\.docx$/);

    // 5. Reload browser and verify IndexedDB persistence
    await page.reload();
    await expect(page.getByLabel('Paper title')).toHaveValue('E2E Verified Class 10 Science');
    await expect(page.getByRole('dialog', { name: /Welcome to EduPulse AI/i })).toBeHidden();

    // Verify Saved Papers lists the persisted paper
    await page
      .getByRole('link', { name: /Saved Papers/i })
      .first()
      .click();
    await expect(page.getByText('E2E Verified Class 10 Science')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
