import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('FG-101: mobile checkout pay CTA must not be intercepted by fixed banner', async ({ page }) => {
  await page.goto('/checkout?plan=growth&fault=checkout-mobile-overlap');
  const payBtn = page.locator('#stripe-pay-button');
  await expect(payBtn).toBeVisible();
  await payBtn.scrollIntoViewIfNeeded();

  const hitTarget = await payBtn.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const topEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return topEl?.closest('button')?.id ?? topEl?.id ?? topEl?.tagName ?? 'none';
  });

  expect(hitTarget).toBe('stripe-pay-button');
  await payBtn.click({ timeout: 3000 });
});
