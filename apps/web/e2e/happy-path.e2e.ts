import { expect, test } from '@playwright/test';

// The Phase 1 happy path: connect a (mock) PDI, open the VIP caller scenario, check the work,
// and see all four layers report. The mock PDI serves the scenario's correct solution.
test('connect a PDI, check the VIP caller alert, see all four layers', async ({ page }) => {
  await test.step('connect the PDI through OAuth', async () => {
    await page.goto('/settings');
    await expect(page.getByTestId('redirect-uri')).toHaveText(
      'http://localhost:3100/api/pdi/oauth/callback',
    );
    await page.getByLabel('Instance name').fill('dev12345');
    await page.getByLabel('OAuth client ID').fill('mock-client');
    await page.getByLabel('OAuth client secret').fill('mock-secret');
    await page.getByRole('button', { name: 'Save and connect' }).click();

    await expect(page).toHaveURL(/\/settings\?connected=1/);
    await expect(page.getByText('Your PDI is connected.')).toBeVisible();
    await expect(page.getByTestId('health-report')).toHaveAttribute('data-status', 'OK');
  });

  await test.step('open the scenario and reveal a hint', async () => {
    await page.goto('/lab');
    await page.getByTestId('scenario-vip-caller-alert').click();
    await expect(page.getByRole('heading', { name: 'VIP caller alert' })).toBeVisible();
    await page.getByRole('button', { name: 'Show hint 1 of 4' }).click();
    await expect(page.getByTestId('hint')).toHaveCount(1);
  });

  await test.step('check my work and see every layer', async () => {
    await page.getByRole('button', { name: 'Check my work' }).click();
    await expect(page).toHaveURL(/\/lab\/vip-caller-alert\/attempts\//);
    await expect(page.getByTestId('attempt-status')).toHaveAttribute('data-status', 'PASSED', {
      timeout: 60_000,
    });

    const layerStatus = (layer: string) =>
      page.getByTestId(`layer-${layer}`).getByTestId('layer-status');
    await expect(layerStatus('STRUCTURE')).toHaveAttribute('data-status', 'PASSED');
    await expect(layerStatus('STATIC')).toHaveAttribute('data-status', 'PASSED');
    await expect(layerStatus('FUNCTIONAL')).toHaveAttribute('data-status', 'PASSED');
    await expect(layerStatus('REVIEW')).toHaveAttribute('data-status', 'COMPLETED');
    await expect(page.getByTestId('review-feedback')).toContainText(
      'What a CTA review board would challenge',
    );
  });

  await test.step('the dashboard counts the completed scenario', async () => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('stat-completed')).toHaveText('1 of 1');
  });
});
