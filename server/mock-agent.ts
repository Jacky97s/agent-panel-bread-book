import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { type AgentApp, type AgentContext, agent, methods, ndJsonStream } from '@agentclientprotocol/sdk';
import { createFocacciaDraft } from '../src/lib/formula.js';
import { parseBakeRequest } from '../src/lib/schedule.js';
import type { LeavenKind, Recipe } from '../src/lib/types.js';
import { explicitLeaven, explicitRoomTemp, planTurn, userUtterance } from './intent.js';

type PromptCtx = { client: AgentContext };

export function createBreadAgent(): AgentApp {
  return agent({ name: 'bread-book-demo' })
    .onRequest(methods.agent.initialize, async (ctx) => ({
      protocolVersion: ctx.params.protocolVersion,
      agentInfo: { name: 'bread-book-demo', version: '0.1.0' },
    }))
    .onRequest(methods.agent.session.new, async () => ({
      sessionId: Math.random().toString(16).slice(2, 14),
    }))
    .onNotification(methods.agent.session.cancel, async () => {})
    .onRequest(methods.agent.session.prompt, async (ctx) => {
      const full = ctx.params.prompt
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('\n');
      const utterance = userUtterance(full);
      const sessionId = ctx.params.sessionId;
      const plan = planTurn(utterance);
      if (plan.kind === 'focaccia') {
        const wrote = await writeFocaccia(ctx, sessionId, full, utterance, plan);
        return { stopReason: wrote ? 'end_turn' : 'cancelled' };
      }
      if (plan.kind === 'whole-wheat' || plan.kind === 'schedule') {
        const file = field(full, 'selected recipe file');
        if (!file) {
          await say(ctx, sessionId, '請先在左邊點一份配方，我才知道要改哪一本。');
          return { stopReason: 'end_turn' };
        }
        const current = await readRecipe(ctx, sessionId, file);
        if (!current) {
          await say(ctx, sessionId, '這份配方讀不到。');
          return { stopReason: 'end_turn' };
        }
        const next =
          plan.kind === 'whole-wheat'
            ? { ...current, wholeWheatPercent: 30 }
            : { ...current, schedule: plan.schedule };
        const wrote = await writeRecipe(
          ctx,
          sessionId,
          file,
          next,
          plan.kind === 'whole-wheat'
            ? '全麥改成三成。高筋會補滿 100%，克數由配方本重算。'
            : '出爐時間記下來了。時程會從出爐時間倒推，發酵長短仍由室溫決定。',
        );
        return { stopReason: wrote ? 'end_turn' : 'cancelled' };
      }
      await say(
        ctx,
        sessionId,
        '我可以幫你：用指定克數和含水做佛卡夏、把選到的配方改成全麥三成，或照出爐時間把時程倒推回來。',
      );
      return { stopReason: 'end_turn' };
    });
}

async function writeFocaccia(
  ctx: PromptCtx,
  sessionId: string,
  full: string,
  utterance: string,
  plan: { totalFlourG: number; targetHydration: number },
): Promise<boolean> {
  const recipesDir = field(full, 'recipes directory');
  if (!recipesDir) {
    await say(ctx, sessionId, '找不到配方資料夾。');
    return false;
  }
  await say(ctx, sessionId, '先確認三件事，再寫這份佛卡夏。');
  const room = explicitRoomTemp(utterance) ?? (await askRoom(ctx, sessionId));
  if (room === null) return false;
  const leaven = explicitLeaven(utterance) ?? (await askLeaven(ctx, sessionId));
  if (!leaven) return false;
  const known = parseBakeRequest(utterance);
  const bakeAt = known?.anchor ?? (await askBake(ctx, sessionId));
  if (!bakeAt) return false;
  const recipe = createFocacciaDraft({
    totalFlourG: plan.totalFlourG,
    targetHydration: plan.targetHydration,
    roomTempC: room,
    leaven,
    bakeAt,
  });
  return writeRecipe(
    ctx,
    sessionId,
    path.join(recipesDir, `${recipe.id}.json`),
    recipe,
    `寫好了：${recipe.totalFlourG} 克麵粉、含水 ${recipe.hydration}%。克數與時程由配方本核算。`,
  );
}

async function askRoom(ctx: PromptCtx, sessionId: string): Promise<number | null> {
  const value = await ask(ctx, sessionId, '室溫大約幾度？', 'roomTemp', '室溫', [
    { value: '18', label: '18°C，偏涼' },
    { value: '22', label: '22°C' },
    { value: '26', label: '26°C，偏暖' },
    { value: '30', label: '30°C，很暖' },
  ]);
  const room = Number(value);
  return Number.isFinite(room) ? room : null;
}

async function askLeaven(ctx: PromptCtx, sessionId: string): Promise<LeavenKind | null> {
  const value = await ask(ctx, sessionId, '用酸種還是即溶酵母？', 'leaven', '發酵', [
    { value: 'levain', label: '酸種酵種' },
    { value: 'yeast', label: '即溶酵母' },
  ]);
  return value === 'levain' || value === 'yeast' ? value : null;
}

async function askBake(ctx: PromptCtx, sessionId: string): Promise<string | null> {
  const value = await ask(ctx, sessionId, '想什麼時候出爐？', 'bakeAt', '出爐時間', [
    { value: '今晚 7 點出爐', label: '今晚 7 點' },
    { value: '明天早上 8 點出爐', label: '明天早上 8 點' },
    { value: '明天晚上 7 點出爐', label: '明天晚上 7 點' },
  ]);
  if (!value) return null;
  return parseBakeRequest(value)?.anchor ?? null;
}

async function ask(
  ctx: PromptCtx,
  sessionId: string,
  message: string,
  name: string,
  title: string,
  options: { value: string; label: string }[],
): Promise<string | null> {
  const answer = await ctx.client.request(methods.client.elicitation.create, {
    mode: 'form',
    sessionId,
    message,
    requestedSchema: {
      type: 'object',
      required: [name],
      properties: {
        [name]: {
          type: 'string',
          title,
          oneOf: options.map((option) => ({ const: option.value, title: option.label })),
        },
      },
    },
  });
  if (answer.action !== 'accept' || !answer.content || typeof answer.content !== 'object') return null;
  const value = (answer.content as Record<string, unknown>)[name];
  return typeof value === 'string' && value ? value : null;
}

async function readRecipe(ctx: PromptCtx, sessionId: string, file: string): Promise<Recipe | null> {
  try {
    const result = await ctx.client.request(methods.client.fs.readTextFile, { sessionId, path: file });
    return JSON.parse(result.content) as Recipe;
  } catch {
    return null;
  }
}

async function writeRecipe(
  ctx: PromptCtx,
  sessionId: string,
  file: string,
  recipe: unknown,
  done: string,
): Promise<boolean> {
  const content = `${JSON.stringify(recipe, null, 2)}\n`;
  await ctx.client.notify(methods.client.session.update, {
    sessionId,
    update: {
      sessionUpdate: 'tool_call',
      toolCallId: `write-${path.basename(file)}`,
      title: `寫入 ${path.basename(file)}`,
      name: 'write',
      kind: 'edit',
      status: 'pending',
      locations: [{ path: file }],
    },
  });
  const permission = await ctx.client.request(methods.client.session.requestPermission, {
    sessionId,
    toolCall: {
      toolCallId: `write-${path.basename(file)}`,
      title: `寫入 ${path.basename(file)}`,
      name: 'write',
      kind: 'edit',
      status: 'pending',
      locations: [{ path: file }],
    },
    options: [
      { optionId: 'allow', name: '允許', kind: 'allow_once' },
      { optionId: 'reject', name: '拒絕', kind: 'reject_once' },
    ],
  });
  const outcome = permission.outcome;
  const allowed = outcome.outcome === 'selected' && outcome.optionId === 'allow';
  if (!allowed) {
    await say(ctx, sessionId, '沒有寫入，配方維持原樣。');
    return false;
  }
  await ctx.client.request(methods.client.fs.writeTextFile, { sessionId, path: file, content });
  await ctx.client.notify(methods.client.session.update, {
    sessionId,
    update: {
      sessionUpdate: 'tool_call_update',
      toolCallId: `write-${path.basename(file)}`,
      status: 'completed',
    },
  });
  await say(ctx, sessionId, done);
  return true;
}

async function say(ctx: PromptCtx, sessionId: string, text: string) {
  await ctx.client.notify(methods.client.session.update, {
    sessionId,
    update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
  });
}

function field(text: string, label: string): string {
  return text.match(new RegExp(`^${label}: (.+)$`, 'm'))?.[1]?.trim() ?? '';
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry && entry === fileURLToPath(import.meta.url)) {
  const stream = ndJsonStream(
    Writable.toWeb(process.stdout),
    Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
  );
  createBreadAgent().connect(stream);
}
