import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { fakeGatewayOptions, modelCalls, callText, rewriteServerCalls } from './fake-gateway.mjs';

const runtime = await startRuntime(fakeGatewayOptions);
const id = (s) => `[data-testid="${s}"]`;
const one = async (sql, ...args) => (await (await runtime.database()).prepare(sql).bind(...args).first());

async function newChat(page, text) {
  await page.goto('/');
  await page.locator(id('composer-input')).fill(text);
  await Promise.all([page.waitForURL(/\/chats\/[^/]+$/), page.locator(id('send-button')).click()]);
  await expect(page.locator(`${id('message')}[data-role="assistant"]`)).toHaveCount(1);
  return new URL(page.url()).pathname.split('/').pop();
}

try {
  // X001: every page is members-only; the Gateway signs people in.
  await runtime.assertPrivateAccess(['/', '/projects', '/artifacts', '/memory', '/shares']);
  for (const path of ['/login', '/signin', '/sign-in', '/signup', '/logout']) {
    const res = await runtime.fetch(path, { role: 'member' });
    const body = await res.text();
    expect(body).not.toMatch(/type="password"/i);
  }
  const home = await runtime.fetch('/', { role: 'member' });
  expect(await home.text()).not.toMatch(/type="password"|Sign in with|Log in/i);

  const owner = await (await runtime.context('owner')).newPage();
  const member = await (await runtime.context('member')).newPage();

  // The owner's private things.
  await owner.goto('/memory');
  await owner.locator(id('instructions-input')).fill('Owner-only instruction: speak like a sea captain.');
  await owner.locator(id('instructions-save')).click();
  await expect(owner.getByText('Instructions saved')).toBeVisible();
  await owner.locator(id('memory-input')).fill('Owner secret recipe ratio 3:2');
  await owner.locator(id('memory-add')).click();
  await expect(owner.locator(id('memory-item'))).toHaveCount(1);
  const ownerChat = await newChat(owner, 'Make a landing page for the bakery');
  await owner.locator(id('artifact-card')).first().click();
  const download = await owner.locator(id('artifact-download')).getAttribute('href');
  const artifactId = (await one('select id from artifacts where owner_id = ?', 'owner')).id;
  await owner.goto('/projects');
  await owner.locator(id('new-project-button')).click();
  await owner.locator(id('project-name')).fill('Owner private plans');
  await owner.locator(id('project-instructions')).fill('Private project instruction.');
  await Promise.all([owner.waitForURL(/\/projects\/[^/]+$/), owner.locator(id('project-create')).click()]);
  const privateProject = new URL(owner.url()).pathname;
  await owner.locator(id('knowledge-paste-button')).click();
  await owner.locator(id('knowledge-title')).fill('Margins');
  await owner.locator(id('knowledge-content')).fill('Confidential margin table.');
  await owner.locator(id('knowledge-save')).click();
  await expect(owner.locator(id('knowledge-item'))).toHaveCount(1);
  const knowledgeHref = await owner.locator(id('knowledge-item')).getByRole('link').getAttribute('href');

  // Members cannot read another member's chats, artifacts, memory or private projects.
  await member.goto(`/chats/${ownerChat}`);
  await expect(member.locator(id('not-found'))).toBeVisible();
  await expect(member.getByText('Make a landing page for the bakery')).toHaveCount(0);
  await member.goto(`/artifacts/${artifactId}`);
  await expect(member.locator(id('not-found'))).toBeVisible();
  expect((await runtime.fetch(download, { role: 'member' })).status).toBe(404);
  expect((await runtime.fetch(download, { role: 'outsider' })).status).toBeGreaterThanOrEqual(400);
  expect((await runtime.fetch(download)).status).toBeGreaterThanOrEqual(400);
  expect((await runtime.fetch(download, { role: 'owner' })).status).toBe(200);
  expect((await runtime.fetch(knowledgeHref, { role: 'member' })).status).toBe(404);
  expect((await runtime.fetch(knowledgeHref, { role: 'owner' })).status).toBe(200);
  await member.goto('/');
  await expect(member.locator(id('chat-row'))).toHaveCount(0);
  await member.goto('/artifacts');
  await expect(member.locator(id('artifact-row'))).toHaveCount(0);
  await member.goto('/memory');
  await expect(member.locator(id('memory-item'))).toHaveCount(0);
  await expect(member.locator(id('instructions-input'))).toHaveValue('');
  await member.goto(privateProject);
  await expect(member.locator(id('not-found'))).toBeVisible();
  await member.goto('/projects');
  await expect(member.locator(id('project-row'))).toHaveCount(0);

  // The owner's instructions and memory never reach the member's model calls.
  const memberChat = await newChat(member, 'Tell me about the weekend menu');
  const calls = await modelCalls(runtime);
  const last = calls.filter((c) => !/Write a short title/.test(callText(c))).at(-1);
  expect(callText(last)).not.toContain('sea captain');
  expect(callText(last)).not.toContain('3:2');

  // Members cannot change another member's objects, even by sending the other's id.
  await member.goto(`/chats/${memberChat}`);
  await rewriteServerCalls(member, memberChat, ownerChat);
  await member.locator(id('rename-button')).click();
  await member.locator(id('rename-input')).fill('Hijacked');
  await member.locator(id('rename-save')).click();
  await member.waitForTimeout(500);
  await member.unroute('**/_serverFn/**');
  await member.keyboard.press('Escape');
  expect((await one('select title from chats where id = ?', ownerChat)).title).not.toBe('Hijacked');
  await rewriteServerCalls(member, memberChat, ownerChat);
  await member.locator(id('delete-chat-button')).click();
  await member.getByRole('button', { name: 'Delete chat' }).click();
  await member.waitForTimeout(500);
  await member.unroute('**/_serverFn/**');
  expect(await one('select id from chats where id = ?', ownerChat)).not.toBeNull();

  // Member's own project, then attempts on the owner's private project.
  await member.goto('/projects');
  await member.locator(id('new-project-button')).click();
  await member.locator(id('project-name')).fill('Member project');
  await Promise.all([member.waitForURL(/\/projects\/[^/]+$/), member.locator(id('project-create')).click()]);
  const memberProject = new URL(member.url()).pathname.split('/').pop();
  const ownerProject = privateProject.split('/').pop();
  await rewriteServerCalls(member, memberProject, ownerProject);
  await member.locator(id('edit-project-button')).click();
  await member.locator(id('project-instructions')).fill('Overwritten');
  await member.locator(id('project-save')).click();
  await member.waitForTimeout(500);
  await member.unroute('**/_serverFn/**');
  expect((await one('select instructions from projects where id = ?', ownerProject)).instructions).toBe('Private project instruction.');

  // Shared as "can view": the member reads and chats, but cannot change or delete.
  await owner.goto(privateProject);
  await owner.locator(id('share-project-button')).click();
  await owner.locator(id('share-member-select')).click();
  await owner.getByRole('option', { name: /member@example\.test/ }).click();
  await owner.locator(id('share-role-select')).click();
  await owner.getByRole('option', { name: 'Can view' }).click();
  await owner.locator(id('share-add')).click();
  await expect(owner.locator(id('project-member-row')).filter({ hasText: 'member@example.test' })).toBeVisible();
  await owner.keyboard.press('Escape');
  await member.goto(privateProject);
  await expect(member.locator(id('knowledge-item'))).toHaveCount(1);
  await expect(member.locator(id('edit-project-button'))).toHaveCount(0);
  await expect(member.locator(id('delete-project-button'))).toHaveCount(0);
  await expect(member.locator(id('share-project-button'))).toHaveCount(0);
  // The owner's chat inside the project stays private to the owner.
  await owner.locator(id('composer-input')).fill('Owner project chat about margins');
  await Promise.all([owner.waitForURL(/\/chats\/[^/]+$/), owner.locator(id('send-button')).click()]);
  await member.goto(privateProject);
  await expect(member.locator(id('project-chat-row'))).toHaveCount(0);
  // Admin-only: a non-admin who doesn't own the project cannot delete or archive it.
  await member.goto(`/projects/${memberProject}`);
  await rewriteServerCalls(member, memberProject, ownerProject);
  await member.locator(id('archive-project-button')).click();
  await member.waitForTimeout(500);
  await member.locator(id('delete-project-button')).click();
  await member.getByRole('button', { name: 'Delete project' }).click();
  await member.waitForTimeout(500);
  await member.unroute('**/_serverFn/**');
  const still = await one('select archived from projects where id = ?', ownerProject);
  expect(still).not.toBeNull();
  expect(still.archived).toBeFalsy();
  // An admin may delete a project shared with them.
  await member.goto('/projects');
  await member.locator(id('new-project-button')).click();
  await member.locator(id('project-name')).fill('Member shares with admin');
  await Promise.all([member.waitForURL(/\/projects\/[^/]+$/), member.locator(id('project-create')).click()]);
  const shared = new URL(member.url()).pathname;
  await member.locator(id('share-project-button')).click();
  await member.locator(id('share-member-select')).click();
  await member.getByRole('option', { name: /owner@example\.test/ }).click();
  await member.locator(id('share-add')).click();
  await expect(member.locator(id('project-member-row'))).toHaveCount(1);
  await owner.goto(shared);
  await owner.locator(id('delete-project-button')).click();
  await Promise.all([owner.waitForURL((u) => u.pathname === '/projects'), owner.getByRole('button', { name: 'Delete project' }).click()]);
  expect(await one('select id from projects where id = ?', shared.split('/').pop())).toBeNull();

  // Share links: members only, revocable only by their creator or an admin.
  await owner.goto(`/chats/${ownerChat}`);
  await owner.locator(id('share-chat-button')).click();
  const shareUrl = new URL(await owner.locator(id('share-link')).inputValue());
  expect(shareUrl.hostname).toBe(runtime.hostname);
  const sharePath = shareUrl.pathname;
  expect(sharePath).toMatch(/^\/s\//);
  expect((await runtime.fetch(sharePath)).status).not.toBe(200);
  expect((await runtime.fetch(sharePath, { role: 'outsider' })).status).not.toBe(200);
  expect((await runtime.fetch(sharePath, { role: 'member' })).status).toBe(200);
  const shareId = sharePath.split('/').pop();
  await member.goto('/shares');
  await expect(member.locator(id('share-row'))).toHaveCount(0);
  // The member revokes a share of their own with the owner's share id swapped in.
  await member.goto(`/chats/${memberChat}`);
  await member.locator(id('share-chat-button')).click();
  const memberShare = new URL(await member.locator(id('share-link')).inputValue()).pathname.split('/').pop();
  await member.goto('/shares');
  await rewriteServerCalls(member, memberShare, shareId);
  await member.locator(id('revoke-share')).click();
  await member.getByRole('button', { name: 'Revoke link' }).click();
  await member.waitForTimeout(500);
  await member.unroute('**/_serverFn/**');
  expect((await one('select revoked_at from shares where id = ?', shareId)).revoked_at).toBeNull();
  await member.goto(sharePath);
  await expect(member.locator(id('shared-message')).first()).toBeVisible();
  console.log('authorization: ok');
} finally {
  await runtime.close();
}
