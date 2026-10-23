import { expect, test } from '@playwright/test';

test('scales a recipe, then the mock agent asks questions and highlights an edit', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '麵包配方本' })).toBeVisible();
  const list = page.locator('.recipe-list');
  await expect(list.getByRole('button', { name: /佛卡夏/ })).toBeVisible();
  await expect(list.getByRole('button', { name: /鄉村酸種/ })).toBeVisible();
  await expect(list.getByRole('button', { name: /湯種牛奶麵包/ })).toBeVisible();

  await list.getByRole('button', { name: /鄉村酸種/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: '鄉村酸種' })).toBeVisible();
  const total = page.getByLabel('總麵粉');
  await total.fill('1000');
  await total.press('Enter');
  await expect(page.getByLabel('高筋麵粉重量')).toHaveValue('750');
  await expect(page.getByLabel('全麥麵粉重量')).toHaveValue('100');

  await page.getByRole('button', { name: 'Agent' }).click();
  const message = page.getByLabel('Message');
  await message.fill('用剩下的 300g 麵粉做 75% 含水的佛卡夏');
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  await page.getByText('室溫大約幾度？').waitFor();
  await page.getByLabel('26°C，偏暖').check();
  await page.getByRole('button', { name: 'Send answers' }).click();
  await page.getByText('用酸種還是即溶酵母？').waitFor();
  await page.getByLabel('即溶酵母').check();
  await page.getByRole('button', { name: 'Send answers' }).click();
  await page.getByText('想什麼時候出爐？').waitFor();
  await page.getByLabel('明天晚上 7 點').check();
  await page.getByRole('button', { name: 'Send answers' }).click();
  await page.getByRole('button', { name: '允許' }).click();

  await expect(list.getByRole('button', { name: /剩粉佛卡夏/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '剩粉佛卡夏' })).toBeVisible();
  await expect(page.getByLabel('總麵粉')).toHaveValue('300');
  await expect(page.locator('.hydration strong')).toHaveText('75%');
  await expect(page.locator('[data-changed="true"]').first()).toBeVisible();

  await list.getByRole('button', { name: /鄉村酸種/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: '鄉村酸種' })).toBeVisible();
  await page.getByLabel('選取全麥麵粉').check();
  await message.fill('改成全麥三成');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: '允許' }).click();
  await expect(page.getByText('助手改了')).toBeVisible();
  await expect(page.getByLabel('全麥麵粉百分比')).toHaveValue('30');
  await expect(page.getByLabel('高筋麵粉百分比')).toHaveValue('55');
  await expect(page.locator('tr[data-changed="true"]')).toHaveCount(2);
});
