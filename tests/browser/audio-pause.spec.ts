import { expect, test } from '@playwright/test';

test('opening the cookbook while paused keeps Web Audio suspended', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始开餐 →', exact: true }).click();
  await page.getByRole('button', { name: '准备好了，开餐！' }).click();
  const audio = async () => JSON.parse((await page.locator('#game-debug').textContent())!).audio;
  await expect.poll(async () => (await audio()).playing).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await audio()).context).toBe('suspended');
  await page.getByRole('button', { name: '料理手册', exact: true }).click();
  await expect(page.getByRole('heading', { name: '六道拿手料理' })).toBeVisible();
  await page.waitForTimeout(150);
  expect((await audio()).context).toBe('suspended');
  await page.getByRole('button', { name: '返回厨房', exact: true }).click();
  await expect.poll(async () => (await audio()).context).toBe('running');
});
