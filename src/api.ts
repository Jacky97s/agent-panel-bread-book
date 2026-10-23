import type { RecipeDiff } from './lib/diff.js';
import type { Leaven, Recipe, Schedule } from './lib/types.js';

export type AgentPreset = 'mock' | 'claude-code' | 'codex' | 'gemini';

export type Meta = {
  preset: AgentPreset;
  locked: boolean;
  subscription: boolean;
};

export type RecipeSummary = {
  id: string;
  title: string;
  summary: string;
  tag: string;
  yieldLabel: string;
  hydration: number;
  totalFlourG: number;
  leaven: 'yeast' | 'levain';
  highlight: 'new' | 'edited' | null;
};

export type RecipeResponse = {
  recipe: Recipe;
  highlight: RecipeDiff | null;
};

async function read<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || '請求失敗');
  return body;
}

export function fetchMeta(): Promise<Meta> {
  return fetch('/api/meta').then((response) => read<Meta>(response));
}

export function fetchRecipes(): Promise<{ revision: number; recipes: RecipeSummary[] }> {
  return fetch('/api/recipes').then((response) =>
    read<{ revision: number; recipes: RecipeSummary[] }>(response),
  );
}

export function fetchRecipe(id: string): Promise<RecipeResponse> {
  return fetch(`/api/recipes/${id}`).then((response) => read<RecipeResponse>(response));
}

export function dismissHighlight(id: string): Promise<void> {
  return fetch(`/api/recipes/${id}/dismiss`, { method: 'POST' }).then((response) =>
    read<{ ok: boolean }>(response),
  ).then(() => undefined);
}

export type RecipeOp =
  | { op: 'setTotalFlour'; totalFlourG: number }
  | { op: 'setHydration'; targetHydration: number }
  | { op: 'setRoomTemp'; roomTempC: number }
  | { op: 'setSchedule'; schedule: Schedule | null }
  | { op: 'setLeaven'; leaven: Leaven }
  | { op: 'setIngredientPercent'; id: string; percent: number }
  | { op: 'setIngredientGrams'; id: string; grams: number };

export function updateRecipe(id: string, op: RecipeOp): Promise<Recipe> {
  return fetch(`/api/recipes/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(op),
  })
    .then((response) => read<{ recipe: Recipe }>(response))
    .then((body) => body.recipe);
}

export function switchAgent(preset: AgentPreset): Promise<void> {
  return fetch('/api/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ preset }),
  }).then((response) => read<{ ok: boolean }>(response)).then(() => undefined);
}
