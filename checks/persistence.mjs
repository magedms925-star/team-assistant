import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { fakeGatewayOptions } from './fake-gateway.mjs';

const runtime = await startRuntime(fakeGatewayOptions);
const id = (s) => `[data-testid="${s}"]`;
try {
  let page = await (await runtime.context('owner')).newPage();
  await page.goto('/memory');
  await page.locator(id('instructions-input')).fill('Reply in British English.');
  await page.locator(id('instructions-save')).click();
  await expect(page.getByText('Instructions saved')).toBeVisible();
  await page.locator(id('memory-input')).fill('Our oven holds twelve loaves.');
  await page.locator(id('memory-add')).click();
  await expect(page.locator(id('memory-item'))).toHaveCount(1);
  await page.goto('/projects');
  await page.locator(id('new-project-button')).click();
  await page.locator(id('project-name')).fill('Summer fair stall');
  await page.locator(id('project-instructions')).fill('Keep costs under two hundred pounds.');
  await Promise.all([page.waitForURL(/\/projects\/[^/]+$/), page.locator(id('project-create')).click()]);
  const project = new URL(page.url()).pathname;
  await page.goto('/');
  await page.locator(id('composer-input')).fill('Make a landing page for the bakery');
  await Promise.all([page.waitForURL(/\/chats\/[^/]+$/), page.locator(id('send-button')).click()]);
  await expect(page.locator(id('artifact-card'))).toHaveCount(1);
  const chat = new URL(page.url()).pathname;

  await runtime.restart();

  page = await (await runtime.context('owner')).newPage();
  await page.goto('/memory');
  await expect(page.locator(id('instructions-input'))).toHaveValue('Reply in British English.');
  await expect(page.locator(id('memory-item'))).toContainText('Our oven holds twelve loaves.');
  await page.goto(project);
  await expect(page.locator(id('project-instructions-view'))).toContainText('Keep costs under two hundred pounds.');
  await page.goto(chat);
  await expect(page.locator(`${id('message')}[data-role="user"]`)).toContainText('Make a landing page for the bakery');
  await expect(page.locator(`${id('message')}[data-role="assistant"]`)).toHaveCount(1);
  await page.locator(id('artifact-card')).first().click();
  await expect(page.locator(id('artifact-panel')).frameLocator(id('artifact-frame')).locator('h1')).toHaveText('Fresh loaves every morning');
  console.log('persistence: ok');
} finally {
  await runtime.close();
}
