import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createAgentServer } from '@agent-panel/server';
import { createBreadCapability } from './capability.js';
import { RecipeLibrary } from './library.js';
import { createBreadAgent } from './mock-agent.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('bread agent', () => {
  it('asks three question cards, then writes a normalized focaccia', async () => {
    const harness = await start();
    try {
      const created = await post(harness.base, '/sessions', { capabilityId: 'bread-book' });
      const posted = await fetch(`${harness.base}/sessions/${created.id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: '用剩下的 300g 麵粉做 75% 含水的佛卡夏' }),
      });
      expect(posted.status).toBe(202);
      await answer(harness, created.id, '室溫大約幾度？', { roomTemp: '26' });
      await answer(harness, created.id, '用酸種還是即溶酵母？', { leaven: 'yeast' });
      await answer(harness, created.id, '想什麼時候出爐？', { bakeAt: '明天晚上 7 點出爐' });
      const permission = await waitFor(harness.events, (event) => event.type === 'permission');
      const allowed = await fetch(`${harness.base}/sessions/${created.id}/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: permission.requestId, kind: 'permission', optionId: 'allow' }),
      });
      expect(allowed.status).toBe(200);
      await waitFor(harness.events, (event) => event.type === 'result');
      const recipe = await waitForRecipe(harness.library, 'leftover-focaccia');
      expect(recipe.totalFlourG).toBe(300);
      expect(recipe.hydration).toBe(75);
      expect(recipe.roomTempC).toBe(26);
      expect(recipe.leaven.kind).toBe('yeast');
      expect(recipe.schedule?.anchorKind).toBe('bake');
      expect(recipe.schedule?.anchor.endsWith('19:00:00+08:00')).toBe(true);
      const flour = recipe.ingredients
        .filter((item) => item.group === 'flour')
        .reduce((sum, item) => sum + (item.grams ?? 0), 0);
      expect(flour).toBe(300);
      expect(recipe).not.toHaveProperty('wholeWheatPercent');
    } finally {
      await harness.stop();
    }
  });

  it('edits whole wheat through the normalizer and schedules backwards', async () => {
    const harness = await start();
    try {
      const created = await post(harness.base, '/sessions', { capabilityId: 'bread-book' });
      await send(harness, created.id, '改成全麥三成', 'country-sourdough');
      await allow(harness, created.id);
      await waitFor(harness.events, (event) => event.type === 'result' && event.stopReason === 'end_turn');
      const wheat = await waitForRecipe(
        harness.library,
        'country-sourdough',
        (recipe) => recipe.ingredients.find((item) => item.id === 'whole-wheat')?.percent === 30,
      );
      const bread = wheat.ingredients.find((item) => item.id === 'bread-flour');
      expect(bread?.percent).toBe(55);
      const flour = wheat.ingredients
        .filter((item) => item.group === 'flour')
        .reduce((sum, item) => sum + (item.grams ?? 0), 0);
      expect(flour).toBe(500);

      harness.events.splice(0, harness.events.length);
      const again = await post(harness.base, '/sessions', { capabilityId: 'bread-book' });
      await send(harness, again.id, '明天晚上 7 點要出爐，幫我排時間', 'country-sourdough');
      await allow(harness, again.id);
      await waitFor(harness.events, (event) => event.type === 'result');
      const scheduled = await waitForRecipe(
        harness.library,
        'country-sourdough',
        (recipe) => recipe.schedule?.anchor.endsWith('19:00:00+08:00') === true,
      );
      expect(scheduled.schedule?.anchorKind).toBe('bake');
      expect(scheduled.schedule?.anchor.endsWith('19:00:00+08:00')).toBe(true);
      expect(scheduled.ingredients.find((item) => item.id === 'whole-wheat')?.percent).toBe(30);
    } finally {
      await harness.stop();
    }
  });
});

async function start() {
  const data = await mkdtemp(path.join(tmpdir(), 'bread-book-'));
  dirs.push(data);
  const library = new RecipeLibrary(data, path.join(root, 'data', 'recipes'));
  await library.open();
  const agent = createAgentServer({
    cwd: root,
    writableRoots: [library.recipesDir],
    agent: { app: createBreadAgent() },
    capabilities: [createBreadCapability(library.recipesDir, () => library.refresh(true))],
  });
  const http = createServer((req, res) => {
    void agent.handle(req, res);
  });
  agent.attach(http);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const port = (http.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}/__agent`;
  const socket = new WebSocket(`ws://127.0.0.1:${port}/__agent/ws`);
  const events: { type: string; requestId?: string; message?: string; stopReason?: string }[] = [];
  await new Promise<void>((resolve) => socket.once('open', resolve));
  socket.on('message', (data) => {
    const message = JSON.parse(String(data)) as { type: string; events?: unknown[] };
    if (message.type === 'hello') return;
    events.push(message);
  });
  return {
    base,
    events,
    library,
    stop: async () => {
      socket.close();
      library.close();
      await agent.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

async function post(base: string, pathname: string, body: unknown): Promise<{ id: string }> {
  const response = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as { id: string };
}

async function send(
  harness: { base: string },
  id: string,
  text: string,
  recipeId: string,
) {
  const response = await fetch(`${harness.base}/sessions/${id}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, context: { recipeId } }),
  });
  expect(response.status).toBe(202);
}

async function answer(
  harness: { base: string; events: { type: string; requestId?: string; message?: string }[] },
  id: string,
  message: string,
  content: Record<string, string>,
) {
  const question = await waitFor(
    harness.events,
    (event) => event.type === 'question' && event.message === message,
  );
  const response = await fetch(`${harness.base}/sessions/${id}/respond`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: question.requestId, kind: 'question', action: 'accept', content }),
  });
  expect(response.status).toBe(200);
}

async function allow(
  harness: { base: string; events: { type: string; requestId?: string }[] },
  id: string,
) {
  const permission = await waitFor(harness.events, (event) => event.type === 'permission');
  const response = await fetch(`${harness.base}/sessions/${id}/respond`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: permission.requestId, kind: 'permission', optionId: 'allow' }),
  });
  expect(response.status).toBe(200);
}

async function waitForRecipe(
  library: RecipeLibrary,
  id: string,
  ready: (recipe: import('../src/lib/types.js').Recipe) => boolean = () => true,
): Promise<import('../src/lib/types.js').Recipe> {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    await library.refresh(true);
    const found = library.get(id);
    if (found && ready(found.recipe)) return found.recipe;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`missing recipe ${id}`);
}

async function waitFor<T extends { type: string }>(events: T[], match: (event: T) => boolean): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const found = events.find(match);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`timed out waiting among ${events.map((event) => event.type).join(',')}`);
}
