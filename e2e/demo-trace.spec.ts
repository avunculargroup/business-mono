import { expect, test } from '@playwright/test';

/**
 * The trace replay transport, walked in a real browser.
 *
 * The component tests cover the state machine. What they cannot cover is
 * timer-driven playback: jsdom runs with fake or real timers under a test
 * runner's control, and "does Play actually advance on its own" is a question
 * about a real event loop.
 */

const REPLAY = '/agents/run/variant-gate-web';

async function open(page: import('@playwright/test').Page) {
  await page.goto(REPLAY);
}

test.describe('the transport', () => {
  test('starts before the run and steps through it', async ({ page }) => {
    await open(page);
    await expect(page.getByText(/^step 0 of \d+$/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Step back/ })).toBeDisabled();

    await page.getByRole('button', { name: /Step forward/ }).click();
    await expect(page.getByText(/^step 1 of \d+$/)).toBeVisible();
  });

  test('advances on its own once playing, and stops when paused', async ({ page }) => {
    // The one thing only a browser can answer. A replay whose Play button does
    // nothing would pass every component test.
    await open(page);
    await page.getByRole('button', { name: /^Play/ }).click();

    await expect(page.getByText(/^step [2-9]\d* of \d+$/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Pause/ }).click();
    const paused = await page.getByText(/^step \d+ of \d+$/).textContent();
    await page.waitForTimeout(2_000);

    expect(await page.getByText(/^step \d+ of \d+$/).textContent()).toBe(paused);
  });

  test('steps back across the gate boundary', async ({ page }) => {
    // The phase's named verify item. Position is a step index rather than a
    // timer offset precisely so that going back across the suspend is the same
    // operation as going forward.
    await open(page);

    const suspend = page.locator('li', { hasText: 'gate3 — suspended' }).first();
    const forward = page.getByRole('button', { name: /Step forward/ });
    const back = page.getByRole('button', { name: /Step back/ });

    // Forward until the suspend is the current step.
    for (let i = 0; i < 12; i += 1) {
      await forward.click();
      if ((await suspend.getAttribute('aria-current')) === 'step') break;
    }
    await expect(suspend).toHaveAttribute('aria-current', 'step');

    await back.click();
    await expect(suspend).not.toHaveAttribute('aria-current', 'step');

    await forward.click();
    await expect(suspend).toHaveAttribute('aria-current', 'step');
  });

  test('offers a replay at the end rather than a dead Play button', async ({ page }) => {
    await open(page);
    const forward = page.getByRole('button', { name: /Step forward/ });

    for (let i = 0; i < 20; i += 1) {
      if (await forward.isDisabled()) break;
      await forward.click();
    }

    await expect(forward).toBeDisabled();
    await page.getByRole('button', { name: /Replay/ }).click();
    await expect(page.getByText(/^step 0 of \d+$/)).toBeVisible();
  });
});

test.describe('what the replay states about itself', () => {
  test('says the bundle was authored rather than recorded', async ({ page }) => {
    // The value of a trace over a mockup is that it is a real run. Until one has
    // been recorded, the page has to say so — and this fails the day someone
    // swaps in a recorded bundle without updating the copy, which is the
    // correct time to be told.
    await open(page);

    await expect(page.getByText(/Authored against the workflow source/)).toBeVisible();
    await expect(page.getByText(/no client data was in scope/)).toHaveCount(0);
  });

  test('shows the real elapsed time separately from the replay length', async ({ page }) => {
    // The gate waited hours. Collapsing that into the replay's own duration
    // would erase the most interesting fact about the run.
    await open(page);

    await expect(page.getByText('4h 12m')).toBeVisible();
    // The label and the value share one element, so the assertion has to match
    // the whole string rather than the number on its own.
    await expect(page.getByText(/Replay length\d+ seconds/)).toBeVisible();
  });

  test('draws the boundary between the committed payload and the agent', async ({ page }) => {
    await open(page);

    await expect(
      page.getByText(/Everything above was computed and committed/),
    ).toBeVisible();
  });
});
