import type { IncomingMessage, ServerResponse } from 'node:http';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  FormulaError,
  setIngredientGrams,
  setIngredientPercent,
  setLeaven,
  setRoomTemp,
  setSchedule,
  setTargetHydration,
  setTotalFlour,
} from '../src/lib/formula.js';
import type { Leaven, Recipe, Schedule } from '../src/lib/types.js';
import type { RecipeLibrary } from './library.js';

export type AgentPreset = 'mock' | 'claude-code' | 'codex' | 'gemini';

const PRESETS = new Set<AgentPreset>(['mock', 'claude-code', 'codex', 'gemini']);

export function isPreset(value: unknown): value is AgentPreset {
  return typeof value === 'string' && PRESETS.has(value as AgentPreset);
}

export function subscriptionFor(preset: AgentPreset): boolean {
  return preset === 'claude-code' || preset === 'codex';
}

export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  library: RecipeLibrary,
  options: {
    preset: AgentPreset;
    locked: boolean;
    agentFile: string;
    onSwitch?: (preset: AgentPreset) => void;
  },
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://local');
  if (!url.pathname.startsWith('/api/')) return false;
  const method = req.method ?? 'GET';
  try {
    if (method === 'GET' && url.pathname === '/api/meta') {
      return json(res, 200, {
        preset: options.preset,
        locked: options.locked,
        subscription: subscriptionFor(options.preset),
      });
    }
    if (method === 'POST' && url.pathname === '/api/agent') {
      if (options.locked) return json(res, 409, { error: '代理程式由啟動指令指定' });
      const body = await readJson(req);
      if (!isPreset(body.preset)) return json(res, 400, { error: '未知的代理程式' });
      await writeFile(options.agentFile, `${JSON.stringify({ preset: body.preset }, null, 2)}\n`);
      json(res, 200, { ok: true, preset: body.preset });
      options.onSwitch?.(body.preset);
      return true;
    }
    if (method === 'GET' && url.pathname === '/api/recipes') {
      await library.refresh(true);
      return json(res, 200, library.list());
    }
    const recipeMatch = /^\/api\/recipes\/([a-z0-9][a-z0-9-]{0,63})(\/dismiss)?$/.exec(url.pathname);
    if (!recipeMatch) return json(res, 404, { error: '找不到' });
    const id = recipeMatch[1] ?? '';
    if (method === 'POST' && recipeMatch[2] === '/dismiss') {
      library.dismiss(id);
      return json(res, 200, { ok: true });
    }
    if (method === 'GET') {
      await library.refresh(true);
      const found = library.get(id);
      if (!found) return json(res, 404, { error: '找不到配方' });
      return json(res, 200, found);
    }
    if (method === 'PUT') {
      const current = library.get(id);
      if (!current) return json(res, 404, { error: '找不到配方' });
      const body = await readJson(req);
      const next = applyOp(current.recipe, body);
      return json(res, 200, { recipe: await library.save(next), highlight: null });
    }
    return json(res, 404, { error: '找不到' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof FormulaError || message === 'invalid json' ? 400 : 500;
    return json(res, status, { error: message });
  }
}

function applyOp(recipe: Recipe, body: Record<string, unknown>): Recipe {
  switch (body.op) {
    case 'setTotalFlour':
      return setTotalFlour(recipe, numberField(body, 'totalFlourG'));
    case 'setHydration':
      return setTargetHydration(recipe, numberField(body, 'targetHydration'));
    case 'setRoomTemp':
      return setRoomTemp(recipe, numberField(body, 'roomTempC'));
    case 'setSchedule':
      return setSchedule(recipe, scheduleField(body.schedule));
    case 'setLeaven':
      return setLeaven(recipe, leavenField(body.leaven));
    case 'setIngredientPercent':
      return setIngredientPercent(recipe, idField(body), numberField(body, 'percent'));
    case 'setIngredientGrams':
      return setIngredientGrams(recipe, idField(body), numberField(body, 'grams'));
    default:
      throw new FormulaError('不支援的修改');
  }
}

function numberField(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new FormulaError('需要數字');
  return value;
}

function idField(body: Record<string, unknown>): string {
  if (typeof body.id !== 'string' || !body.id.trim()) throw new FormulaError('需要材料');
  return body.id;
}

function scheduleField(value: unknown): Schedule | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FormulaError('時程不正確');
  const raw = value as Record<string, unknown>;
  if ((raw.anchorKind !== 'start' && raw.anchorKind !== 'bake') || typeof raw.anchor !== 'string') {
    throw new FormulaError('時程不正確');
  }
  return { anchorKind: raw.anchorKind, anchor: raw.anchor };
}

function leavenField(value: unknown): Leaven {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FormulaError('發酵方式不正確');
  const raw = value as Record<string, unknown>;
  if (raw.kind === 'yeast' && typeof raw.name === 'string' && typeof raw.percent === 'number') {
    return { kind: 'yeast', name: raw.name, percent: raw.percent };
  }
  if (
    raw.kind === 'levain' &&
    typeof raw.name === 'string' &&
    typeof raw.inoculation === 'number' &&
    typeof raw.starterHydration === 'number'
  ) {
    return {
      kind: 'levain',
      name: raw.name,
      inoculation: raw.inoculation,
      starterHydration: raw.starterHydration,
    };
  }
  throw new FormulaError('發酵方式不正確');
}

function json(res: ServerResponse, status: number, body: unknown): boolean {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
  return true;
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          reject(new Error('invalid json'));
          return;
        }
        resolve(value as Record<string, unknown>);
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

export function agentFileFor(dataDir: string): string {
  return path.join(dataDir, 'agent.json');
}
