import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { fakeGatewayOptions, modelCalls, callText, setModel } from './fake-gateway.mjs';

const runtime = await startRuntime(fakeGatewayOptions);
const id = (s) => `[data-testid="${s}"]`;

async function send(page, text) {
  const before = await page.locator(`${id('message')}[data-role="assistant"]`).count();
  await page.locator(id('composer-input')).fill(text);
  await page.locator(id('send-button')).click();
  await expect(page.locator(`${id('message')}[data-role="assistant"]`)).toHaveCount(before + 1);
}

try {
  const owner = await (await runtime.context('owner')).newPage();
  const member = await (await runtime.context('member')).newPage();

  // F001: with no model set up, the composer gives way to the setup message.
  await setModel(runtime, false);
  await owner.goto('/');
  await runtime.assertBackLink(owner);
  await owner.locator(id('composer-input')).fill('Hello');
  await owner.locator(id('send-button')).click();
  await expect(owner.locator(id('ai-setup'))).toContainText('Choose a default AI model in your Gateway.');
  await expect(owner.locator(id('composer-input'))).toHaveCount(0);
  await owner.reload();
  await expect(owner.locator(id('ai-setup'))).toBeVisible();
  await setModel(runtime, true);
  await owner.locator(id('retry-ai')).click();
  await expect(owner.locator(id('composer-input'))).toBeVisible();

  // F002: standing instructions and memory notes.
  await owner.goto('/memory');
  await owner.locator(id('instructions-input')).fill('Answer as a friendly pastry chef. Keep lists short.');
  await owner.locator(id('instructions-save')).click();
  await expect(owner.getByText('Instructions saved')).toBeVisible();
  for (const note of ['I run a small bakery on Mill Lane.', 'Temporary note to remove']) {
    await owner.locator(id('memory-input')).fill(note);
    await owner.locator(id('memory-add')).click();
    await expect(owner.locator(id('memory-item')).filter({ hasText: note })).toBeVisible();
  }
  const temp = owner.locator(id('memory-item')).filter({ hasText: 'Temporary note to remove' });
  await temp.locator(id('memory-edit')).click();
  await owner.locator(id('memory-edit-input')).fill('We close on Mondays.');
  await owner.locator(id('memory-edit-save')).click();
  await expect(owner.locator(id('memory-item')).filter({ hasText: 'We close on Mondays.' })).toBeVisible();
  await owner.locator(id('memory-input')).fill('Delete me');
  await owner.locator(id('memory-add')).click();
  await owner.locator(id('memory-item')).filter({ hasText: 'Delete me' }).locator(id('memory-delete')).click();
  await expect(owner.locator(id('memory-item')).filter({ hasText: 'Delete me' })).toHaveCount(0);
  await owner.reload();
  await expect(owner.locator(id('instructions-input'))).toHaveValue('Answer as a friendly pastry chef. Keep lists short.');

  // F001: a new chat with an attached text file.
  await owner.goto('/');
  await owner.locator(id('attach-input')).setInputFiles({ name: 'prices.csv', mimeType: 'text/csv', buffer: Buffer.from('item,price\nsourdough,5.50\nrye,4.20\n') });
  await expect(owner.locator(id('attachment-chip'))).toContainText('prices.csv');
  await owner.locator(id('composer-input')).fill('Plan a weekend bread menu from my price list');
  await Promise.all([owner.waitForURL(/\/chats\/[^/]+$/), owner.locator(id('send-button')).click()]);
  await expect(owner.locator(`${id('message')}[data-role="assistant"]`)).toHaveCount(1);
  await expect(owner.locator(`${id('message')}[data-role="user"]`).first()).toContainText('prices.csv');
  await expect(owner.locator('h1')).toHaveText('Weekend bread menu');
  const chatUrl = owner.url();
  const chatId = chatUrl.split('/').pop();
  let calls = await modelCalls(runtime);
  let reply = calls.filter((c) => !/Write a short title/.test(callText(c))).at(-1);
  expect(callText(reply)).toContain('Answer as a friendly pastry chef.');
  expect(callText(reply)).toContain('I run a small bakery on Mill Lane.');
  expect(callText(reply)).toContain('We close on Mondays.');
  expect(callText(reply)).toContain('sourdough,5.50');

  // Later turns see earlier ones; regenerate; edit the last message.
  await send(owner, 'Which loaf should lead on Saturday?');
  calls = await modelCalls(runtime);
  expect(callText(calls.at(-1))).toContain('Plan a weekend bread menu from my price list');
  const lastReply = owner.locator(`${id('message')}[data-role="assistant"]`).last();
  const firstText = await lastReply.innerText();
  await owner.locator(id('regenerate-button')).click();
  await expect(owner.locator(`${id('message')}[data-role="assistant"]`).last()).not.toHaveText(firstText);
  await expect(owner.locator(`${id('message')}[data-role="assistant"]`)).toHaveCount(2);
  await owner.locator(id('edit-last-button')).click();
  await owner.locator(id('edit-input')).fill('Which loaf should lead on Sunday?');
  await owner.locator(id('edit-save')).click();
  await expect(owner.locator(`${id('message')}[data-role="user"]`).last()).toContainText('Which loaf should lead on Sunday?');
  await expect(owner.locator(`${id('message')}[data-role="user"]`)).toHaveCount(2);
  await expect(owner.locator(`${id('message')}[data-role="assistant"]`)).toHaveCount(2);
  await expect(owner.getByText('Which loaf should lead on Saturday?')).toHaveCount(0);
  await owner.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(owner.url()).origin });
  await owner.locator(id('copy-reply')).last().click();
  await expect(owner.getByText('Copied')).toBeVisible();

  // Save a memory note from a message.
  await owner.locator(`${id('message')}[data-role="user"]`).last().locator(id('remember-button')).click();
  await owner.locator(id('remember-input')).fill('Sunday is our busiest day.');
  await owner.locator(id('remember-save')).click();
  await expect(owner.getByText('Saved to memory')).toBeVisible();

  // Rename, star, search.
  await owner.locator(id('rename-button')).click();
  await owner.locator(id('rename-input')).fill('Weekend bread plan');
  await owner.locator(id('rename-save')).click();
  await expect(owner.locator('h1')).toHaveText('Weekend bread plan');
  await owner.locator(id('star-button')).click();
  await expect(owner.locator(id('star-button'))).toHaveAttribute('aria-pressed', 'true');

  // F004: an artifact opens beside the chat; change by asking, by hand, restore.
  await send(owner, 'Now make a landing page for the bakery');
  await owner.locator(id('artifact-card')).last().click();
  const panel = owner.locator(id('artifact-panel'));
  await expect(panel.locator(id('artifact-title'))).toHaveText('Bakery landing page');
  await expect(panel.frameLocator(id('artifact-frame')).locator('h1')).toHaveText('Fresh loaves every morning');
  await expect(panel.locator(id('artifact-frame'))).toHaveAttribute('sandbox', 'allow-scripts');
  await panel.locator(id('artifact-ask-input')).fill('Please change the headline');
  await panel.locator(id('artifact-ask-send')).click();
  await expect(panel.locator(id('artifact-version'))).toContainText('Version 2 of 2');
  await expect(panel.frameLocator(id('artifact-frame')).locator('h1')).toHaveText('Baked before sunrise');
  await panel.locator(id('artifact-edit-button')).click();
  const edited = (await panel.locator(id('artifact-editor')).inputValue()).replace('Baked before sunrise', 'Warm bread, open at seven');
  await panel.locator(id('artifact-editor')).fill(edited);
  await panel.locator(id('artifact-save')).click();
  await expect(panel.locator(id('artifact-version'))).toContainText('Version 3 of 3');
  await expect(panel.frameLocator(id('artifact-frame')).locator('h1')).toHaveText('Warm bread, open at seven');
  await panel.locator(id('artifact-version-item')).filter({ hasText: 'Version 1' }).click();
  await expect(panel.frameLocator(id('artifact-frame')).locator('h1')).toHaveText('Fresh loaves every morning');
  await panel.locator(id('artifact-restore')).click();
  await expect(panel.locator(id('artifact-version'))).toContainText('Version 4 of 4');
  const artifactHref = await panel.locator(id('artifact-download')).getAttribute('href');
  const download = await runtime.fetch(artifactHref, { role: 'owner' });
  expect(download.status).toBe(200);
  expect(download.headers.get('content-disposition')).toContain('attachment');
  expect(await download.text()).toContain('Fresh loaves every morning');
  await owner.goto('/artifacts');
  await expect(owner.locator(id('artifact-row')).filter({ hasText: 'Bakery landing page' })).toBeVisible();
  await owner.locator(id('artifact-row')).filter({ hasText: 'Bakery landing page' }).getByRole('link').first().click();
  await expect(owner.locator(id('artifact-frame'))).toBeVisible();

  // Chat list: starred, recent, search.
  await owner.goto('/');
  await expect(owner.locator(id('starred-list'))).toContainText('Weekend bread plan');
  await owner.locator(id('composer-input')).fill('List questions for our flour supplier');
  await Promise.all([owner.waitForURL(/\/chats\/[^/]+$/), owner.locator(id('send-button')).click()]);
  await expect(owner.locator('h1')).toHaveText('Supplier questions');
  await owner.goto('/');
  await expect(owner.locator(id('recent-list'))).toContainText('Supplier questions');
  await owner.locator(id('chat-search')).fill('supplier');
  await expect(owner.locator(id('chat-row'))).toHaveCount(1);
  await expect(owner.locator(id('chat-row'))).toContainText('Supplier questions');
  await owner.locator(id('chat-search')).fill('');
  // Delete a chat.
  await owner.locator(id('chat-row')).filter({ hasText: 'Supplier questions' }).getByRole('link').click();
  await owner.locator(id('delete-chat-button')).click();
  await Promise.all([owner.waitForURL((u) => u.pathname === '/'), owner.getByRole('button', { name: 'Delete chat' }).click()]);
  await expect(owner.locator(id('chat-row')).filter({ hasText: 'Supplier questions' })).toHaveCount(0);

  // F005: share a snapshot of the chat with the organization.
  await owner.goto(chatUrl);
  await owner.locator(id('share-chat-button')).click();
  const shareUrl = await owner.locator(id('share-link')).inputValue();
  expect(new URL(shareUrl).hostname).toBe(runtime.hostname);
  await owner.keyboard.press('Escape');
  await send(owner, 'One more idea for Monday');
  await member.goto(new URL(shareUrl).pathname);
  await expect(member.locator(id('shared-message')).first()).toContainText('Plan a weekend bread menu');
  await expect(member.getByText('One more idea for Monday')).toHaveCount(0);
  await expect(member.locator(id('composer-input'))).toHaveCount(0);
  await Promise.all([member.waitForURL(/\/chats\/[^/]+$/), member.locator(id('continue-chat-button')).click()]);
  await expect(member.locator(`${id('message')}[data-role="user"]`).first()).toContainText('Plan a weekend bread menu');
  await send(member, 'Could we add a gluten-free option?');
  await owner.goto('/shares');
  const shareRow = owner.locator(id('share-row')).filter({ hasText: 'Weekend bread plan' });
  await expect(shareRow).toBeVisible();
  await shareRow.locator(id('revoke-share')).click();
  await owner.getByRole('button', { name: 'Revoke link' }).click();
  await expect(owner.locator(id('share-row')).filter({ hasText: 'Weekend bread plan' })).toHaveCount(0);
  await member.goto(new URL(shareUrl).pathname);
  await expect(member.locator(id('share-missing'))).toBeVisible();

  // Artifact share.
  await owner.goto(chatUrl);
  await owner.locator(id('artifact-card')).last().click();
  await owner.locator(id('artifact-share')).click();
  const artifactShare = await owner.locator(id('share-link')).inputValue();
  await member.goto(new URL(artifactShare).pathname);
  await expect(member.frameLocator(id('artifact-frame')).locator('h1')).toHaveText('Fresh loaves every morning');

  // F003: projects with instructions, knowledge and sharing.
  await owner.goto('/projects');
  await owner.locator(id('new-project-button')).click();
  await owner.locator(id('project-name')).fill('Spring menu launch');
  await owner.locator(id('project-description')).fill('Seasonal bakes for April and May');
  await owner.locator(id('project-instructions')).fill('Prices are in pounds. Mention allergens for every bake.');
  await Promise.all([owner.waitForURL(/\/projects\/[^/]+$/), owner.locator(id('project-create')).click()]);
  const projectPath = new URL(owner.url()).pathname;
  await owner.locator(id('knowledge-paste-button')).click();
  await owner.locator(id('knowledge-title')).fill('Supplier list');
  await owner.locator(id('knowledge-content')).fill('Flour: Northern Mills. Butter: Dale Dairy.');
  await owner.locator(id('knowledge-save')).click();
  await expect(owner.locator(id('knowledge-item')).filter({ hasText: 'Supplier list' })).toBeVisible();
  await owner.locator(id('knowledge-upload')).setInputFiles({ name: 'allergens.md', mimeType: 'text/markdown', buffer: Buffer.from('# Allergens\nHot cross buns contain egg and milk.') });
  await expect(owner.locator(id('knowledge-item')).filter({ hasText: 'allergens.md' })).toBeVisible();
  await owner.locator(id('knowledge-paste-button')).click();
  await owner.locator(id('knowledge-title')).fill('Old notes');
  await owner.locator(id('knowledge-content')).fill('Outdated.');
  await owner.locator(id('knowledge-save')).click();
  await owner.locator(id('knowledge-item')).filter({ hasText: 'Old notes' }).locator(id('knowledge-delete')).click();
  await expect(owner.locator(id('knowledge-item')).filter({ hasText: 'Old notes' })).toHaveCount(0);
  await owner.locator(id('composer-input')).fill('Draft three spring bakes');
  await Promise.all([owner.waitForURL(/\/chats\/[^/]+$/), owner.locator(id('send-button')).click()]);
  await expect(owner.locator(`${id('message')}[data-role="assistant"]`)).toHaveCount(1);
  calls = await modelCalls(runtime);
  reply = calls.filter((c) => !/Write a short title/.test(callText(c))).at(-1);
  expect(callText(reply)).toContain('Mention allergens for every bake.');
  expect(callText(reply)).toContain('Northern Mills');
  expect(callText(reply)).toContain('Hot cross buns contain egg and milk.');
  await owner.goto(projectPath);
  await expect(owner.locator(id('project-chat-row'))).toHaveCount(1);

  // Private until shared.
  await member.goto('/projects');
  await expect(member.locator(id('project-row')).filter({ hasText: 'Spring menu launch' })).toHaveCount(0);
  await owner.locator(id('share-project-button')).click();
  await owner.locator(id('share-member-select')).click();
  await owner.getByRole('option', { name: /member@example\.test/ }).click();
  await owner.locator(id('share-role-select')).click();
  await owner.getByRole('option', { name: 'Can view' }).click();
  await owner.locator(id('share-add')).click();
  await expect(owner.locator(id('project-member-row')).filter({ hasText: 'member@example.test' })).toContainText('Can view');
  await owner.keyboard.press('Escape');
  await member.goto('/projects');
  await member.locator(id('project-row')).filter({ hasText: 'Spring menu launch' }).getByRole('link').click();
  await expect(member.locator(id('knowledge-item')).filter({ hasText: 'Supplier list' })).toBeVisible();
  await expect(member.locator(id('edit-project-button'))).toHaveCount(0);
  await expect(member.locator(id('project-chat-row'))).toHaveCount(0);
  await member.locator(id('composer-input')).fill('Which spring bake is cheapest?');
  await Promise.all([member.waitForURL(/\/chats\/[^/]+$/), member.locator(id('send-button')).click()]);
  await expect(member.locator(`${id('message')}[data-role="assistant"]`)).toHaveCount(1);
  calls = await modelCalls(runtime);
  reply = calls.filter((c) => !/Write a short title/.test(callText(c))).at(-1);
  expect(callText(reply)).toContain('Northern Mills');
  expect(callText(reply)).not.toContain('Answer as a friendly pastry chef.');
  // Raise to can edit; the member changes the instructions.
  await owner.goto(projectPath);
  await owner.locator(id('share-project-button')).click();
  await owner.locator(id('project-member-row')).filter({ hasText: 'member@example.test' }).locator(id('member-role-select')).click();
  await owner.getByRole('option', { name: 'Can edit' }).click();
  await expect(owner.locator(id('project-member-row')).filter({ hasText: 'member@example.test' })).toContainText('Can edit');
  await owner.keyboard.press('Escape');
  await member.goto(projectPath);
  await member.locator(id('edit-project-button')).click();
  await member.locator(id('project-instructions')).fill('Prices are in pounds. Mention allergens and vegan swaps.');
  await member.locator(id('project-save')).click();
  await expect(member.locator(id('project-instructions-view'))).toContainText('vegan swaps');
  await expect(member.locator(id('archive-project-button'))).toHaveCount(0);
  await expect(member.locator(id('project-chat-row'))).toHaveCount(1);
  // Whole organization.
  await owner.goto('/projects');
  await owner.locator(id('new-project-button')).click();
  await owner.locator(id('project-name')).fill('Shop opening hours');
  await Promise.all([owner.waitForURL(/\/projects\/[^/]+$/), owner.locator(id('project-create')).click()]);
  const orgProject = new URL(owner.url()).pathname;
  await owner.locator(id('share-project-button')).click();
  await owner.locator(id('org-visible-switch')).click();
  await expect(owner.locator(id('org-visible-switch'))).toHaveAttribute('aria-checked', 'true');
  await owner.keyboard.press('Escape');
  await member.goto('/projects');
  await expect(member.locator(id('project-row')).filter({ hasText: 'Shop opening hours' })).toBeVisible();
  // Archive and delete.
  await owner.goto(orgProject);
  await owner.locator(id('archive-project-button')).click();
  await expect(owner.locator(id('archived-badge'))).toBeVisible();
  await owner.locator(id('delete-project-button')).click();
  await Promise.all([owner.waitForURL((u) => u.pathname === '/projects'), owner.getByRole('button', { name: 'Delete project' }).click()]);
  await expect(owner.locator(id('project-row')).filter({ hasText: 'Shop opening hours' })).toHaveCount(0);

  // Delete an artifact.
  await owner.goto('/');
  await owner.locator(id('composer-input')).fill('Make a landing page for the cafe corner');
  await Promise.all([owner.waitForURL(/\/chats\/[^/]+$/), owner.locator(id('send-button')).click()]);
  await expect(owner.locator(id('artifact-card'))).toHaveCount(1);
  await owner.goto('/artifacts');
  const rows = owner.locator(id('artifact-row'));
  const count = await rows.count();
  await rows.first().locator(id('artifact-delete')).click();
  await owner.getByRole('button', { name: 'Delete artifact' }).click();
  await expect(rows).toHaveCount(count - 1);

  // Phone-sized smoke.
  const phone = await (await runtime.context('member', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto('/');
  await expect(phone.locator(id('composer-input'))).toBeVisible();
  await expect(phone.getByRole('link', { name: 'Projects' })).toBeVisible();
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // End on the chat with its artifact open.
  await owner.goto(chatUrl);
  await owner.locator(id('artifact-card')).first().click();
  await expect(owner.locator(id('artifact-panel')).frameLocator(id('artifact-frame')).locator('h1')).toHaveText('Fresh loaves every morning');
  await runtime.assertBackLink(owner);
  await runtime.screenshot(owner);
  console.log('behavior: ok');
} finally {
  await runtime.close();
}
