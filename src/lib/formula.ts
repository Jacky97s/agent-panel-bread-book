import { parseBakeRequest } from './schedule.js';
import type {
  Ingredient,
  IngredientGroup,
  Leaven,
  LeavenKind,
  Recipe,
  RecipeInput,
  Step,
  StepKind,
} from './types.js';

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

/** Share of an ingredient's weight that counts as water. Oil is 0; butter overrides this. */
export const DEFAULT_WATER_FRACTION: Record<IngredientGroup, number> = {
  flour: 0,
  water: 1,
  milk: 0.87,
  egg: 0.75,
  salt: 0,
  fat: 0,
  sugar: 0,
  yeast: 0,
  other: 0,
};

const FERMENT_KINDS = new Set<StepKind>(['autolyse', 'bulk', 'proof']);
const LEAVEN_SLOWDOWN = 2.2;
const STEP_KINDS = new Set<StepKind>([
  'mix',
  'autolyse',
  'bulk',
  'fold',
  'bench',
  'shape',
  'proof',
  'cold',
  'bake',
  'rest',
]);
const GROUPS = new Set<IngredientGroup>([
  'flour',
  'water',
  'milk',
  'egg',
  'salt',
  'fat',
  'sugar',
  'yeast',
  'other',
]);

export function serializeRecipe(recipe: Recipe): string {
  return `${JSON.stringify(recipe, null, 2)}\n`;
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatNumber(value: number, digits = 2): string {
  return Number(roundTo(value, digits).toFixed(digits)).toString();
}

export function waterFractionOf(ingredient: Pick<Ingredient, 'group' | 'waterFraction'>): number {
  if (typeof ingredient.waterFraction === 'number') return ingredient.waterFraction;
  return DEFAULT_WATER_FRACTION[ingredient.group];
}

export function normalizeRecipe(input: unknown, now = new Date()): Recipe {
  const recipe = coerceRecipe(input);
  applyIntents(recipe, now);
  ensureLeavenRows(recipe);
  rebalanceFlour(recipe);
  applyLocks(recipe);
  solveHydration(recipe);
  applyDurations(recipe);
  assignGrams(recipe);
  tweakWaterGrams(recipe);
  recipe.hydration = computeHydration(recipe);
  return freezeRecipe(recipe);
}

export function setTotalFlour(recipe: Recipe, totalFlourG: number): Recipe {
  return normalizeRecipe({ ...structuredClone(recipe), totalFlourG });
}

export function setTargetHydration(recipe: Recipe, targetHydration: number): Recipe {
  return normalizeRecipe({ ...structuredClone(recipe), targetHydration });
}

export function setRoomTemp(recipe: Recipe, roomTempC: number): Recipe {
  return normalizeRecipe({ ...structuredClone(recipe), roomTempC });
}

export function setSchedule(recipe: Recipe, schedule: Recipe['schedule']): Recipe {
  return normalizeRecipe({ ...structuredClone(recipe), schedule });
}

export function setLeaven(recipe: Recipe, leaven: Leaven): Recipe {
  return normalizeRecipe({ ...structuredClone(recipe), leaven });
}

export function setIngredientPercent(recipe: Recipe, id: string, percent: number): Recipe {
  const next = structuredClone(recipe);
  const row = next.ingredients.find((item) => item.id === id);
  if (!row) throw new FormulaError('找不到這個材料');
  assertEditable(row);
  row.percent = percent;
  if (row.group === 'yeast' && next.leaven.kind === 'yeast') {
    next.leaven = { ...next.leaven, percent };
  }
  const projected = structuredClone(next);
  ensureLeavenRows(projected);
  rebalanceFlour(projected);
  applyLocks(projected);
  if (row.balance && waterFractionOf(row) > 0) {
    const same = projected.ingredients.find((item) => item.id === row.id);
    if (same) same.percent = row.percent;
  }
  next.targetHydration = projectHydration(projected);
  return normalizeRecipe(next);
}

export function setIngredientGrams(recipe: Recipe, id: string, grams: number): Recipe {
  if (recipe.totalFlourG <= 0) throw new FormulaError('總麵粉要大於 0');
  return setIngredientPercent(recipe, id, (grams / recipe.totalFlourG) * 100);
}

export function parseFocacciaRequest(
  text: string,
): { totalFlourG: number; targetHydration: number } | null {
  if (!/佛卡夏|focaccia/i.test(text)) return null;
  const flour = text.match(/(\d+(?:\.\d+)?)\s*(?:g|克)/i);
  const hydration =
    text.match(/(\d+(?:\.\d+)?)\s*%\s*含水/) ?? text.match(/含水[^\d%]{0,8}(\d+(?:\.\d+)?)\s*%/);
  if (!flour || !hydration) return null;
  return { totalFlourG: Number(flour[1]), targetHydration: Number(hydration[1]) };
}

export function createFocacciaDraft(input: {
  totalFlourG: number;
  targetHydration: number;
  roomTempC: number;
  leaven: LeavenKind;
  bakeAt: string;
}): Recipe {
  const yeast = input.leaven === 'yeast';
  const leaven: Leaven = yeast
    ? { kind: 'yeast', name: '即溶酵母', percent: 0.7 }
    : { kind: 'levain', name: '酸種酵種', inoculation: 20, starterHydration: 100 };
  return normalizeRecipe({
    version: 1,
    id: 'leftover-focaccia',
    title: '剩粉佛卡夏',
    summary: `用 ${formatNumber(input.totalFlourG, 1)} 克麵粉做的佛卡夏，目標含水 ${formatNumber(input.targetHydration, 2)}%。室溫 ${input.roomTempC}°C。`,
    tag: '佛卡夏',
    yieldLabel: '一盤',
    totalFlourG: input.totalFlourG,
    targetHydration: input.targetHydration,
    leaven,
    baselineTempC: 24,
    baselineLeaven: 'yeast',
    roomTempC: input.roomTempC,
    ingredients: [
      {
        id: 'bread-flour',
        name: '高筋麵粉',
        group: 'flour',
        percent: 100,
        balance: true,
        role: 'dough',
      },
      {
        id: 'water',
        name: '水',
        group: 'water',
        percent: input.targetHydration,
        balance: true,
        role: 'dough',
      },
      { id: 'salt', name: '鹽', group: 'salt', percent: 2.4, role: 'dough' },
      { id: 'oil', name: '橄欖油', group: 'fat', percent: 5, role: 'dough' },
      ...(yeast
        ? [{ id: 'yeast', name: '即溶酵母', group: 'yeast' as const, percent: 0.7, role: 'dough' as const }]
        : []),
    ],
    steps: focacciaSteps(),
    schedule: { anchorKind: 'bake', anchor: input.bakeAt },
  });
}

export function isEditableRow(row: Ingredient): boolean {
  if (row.role === 'preferment' || row.locksTo) return false;
  if (row.group === 'flour' && row.balance) return false;
  return true;
}

function assertEditable(row: Ingredient) {
  if (!isEditableRow(row)) throw new FormulaError('這一列由配方計算，不能直接改');
}

function applyIntents(recipe: RecipeInput, now: Date) {
  if (typeof recipe.wholeWheatPercent === 'number') {
    applyWholeWheat(recipe, recipe.wholeWheatPercent);
  }
  if (typeof recipe.scheduleRequest === 'string' && recipe.scheduleRequest.trim()) {
    const schedule = parseBakeRequest(recipe.scheduleRequest, now);
    if (schedule) recipe.schedule = schedule;
  }
  delete recipe.wholeWheatPercent;
  delete recipe.scheduleRequest;
}

function applyWholeWheat(recipe: Recipe, percent: number) {
  const share = clamp(percent, 0, 100);
  let row = recipe.ingredients.find(
    (item) => item.group === 'flour' && (item.id === 'whole-wheat' || item.name.includes('全麥')),
  );
  if (!row) {
    row = {
      id: 'whole-wheat',
      name: '全麥麵粉',
      group: 'flour',
      percent: share,
      role: 'dough',
    };
    const balanceIndex = recipe.ingredients.findIndex((item) => item.group === 'flour' && item.balance);
    const insertAt = balanceIndex >= 0 ? balanceIndex : recipe.ingredients.length;
    recipe.ingredients.splice(insertAt, 0, row);
  }
  row.percent = share;
  row.balance = false;
  row.group = 'flour';
}

function ensureLeavenRows(recipe: Recipe) {
  recipe.ingredients = recipe.ingredients.filter((item) => item.role !== 'preferment');
  if (recipe.leaven.kind === 'levain') {
    recipe.ingredients = recipe.ingredients.filter((item) => item.group !== 'yeast');
    const flourPercent = roundTo(
      (recipe.leaven.inoculation * 100) / (100 + recipe.leaven.starterHydration),
      2,
    );
    const waterPercent = roundTo(recipe.leaven.inoculation - flourPercent, 2);
    const flour: Ingredient = {
      id: 'preferment-flour',
      name: '酵種麵粉',
      group: 'flour',
      percent: flourPercent,
      role: 'preferment',
    };
    const water: Ingredient = {
      id: 'preferment-water',
      name: '酵種的水',
      group: 'water',
      percent: waterPercent,
      role: 'preferment',
    };
    const lastFlour = findLastIndex(recipe.ingredients, (item) => item.group === 'flour');
    recipe.ingredients.splice(lastFlour >= 0 ? lastFlour + 1 : 0, 0, flour);
    const liquidAt = recipe.ingredients.findIndex(
      (item) => item.group === 'water' || item.group === 'milk',
    );
    recipe.ingredients.splice(liquidAt >= 0 ? liquidAt : recipe.ingredients.length, 0, water);
    return;
  }
  const percent = recipe.leaven.percent;
  const existing = recipe.ingredients.find((item) => item.group === 'yeast');
  if (existing) {
    existing.percent = percent;
    existing.name = recipe.leaven.name || existing.name;
    return;
  }
  recipe.ingredients.push({
    id: 'yeast',
    name: recipe.leaven.name || '即溶酵母',
    group: 'yeast',
    percent,
    role: 'dough',
  });
}

function rebalanceFlour(recipe: Recipe) {
  const flours = recipe.ingredients.filter((item) => item.group === 'flour');
  if (flours.length === 0) throw new FormulaError('配方至少要有一種麵粉');
  let balance = flours.find((item) => item.balance && item.role !== 'preferment');
  if (!balance) {
    balance = flours.find((item) => item.role !== 'preferment') ?? flours[0];
    if (!balance) throw new FormulaError('配方至少要有一種麵粉');
  }
  for (const flour of flours) flour.balance = flour.id === balance.id;
  const fixed = flours.filter((item) => item.id !== balance.id && item.role === 'preferment');
  const flexible = flours.filter((item) => item.id !== balance.id && item.role !== 'preferment');
  let fixedSum = roundTo(
    fixed.reduce((sum, item) => sum + item.percent, 0),
    2,
  );
  if (fixedSum > 100) {
    const scale = 100 / fixedSum;
    for (const item of fixed) item.percent = roundTo(item.percent * scale, 2);
    fixedSum = roundTo(
      fixed.reduce((sum, item) => sum + item.percent, 0),
      2,
    );
  }
  const room = roundTo(100 - fixedSum, 2);
  let flexSum = flexible.reduce((sum, item) => sum + item.percent, 0);
  if (flexSum > room && flexSum > 0) {
    const scale = room / flexSum;
    for (const item of flexible) item.percent = roundTo(item.percent * scale, 2);
    flexSum = flexible.reduce((sum, item) => sum + item.percent, 0);
  }
  balance.percent = roundTo(100 - fixedSum - flexSum, 2);
  const drift = roundTo(
    100 -
      flours.reduce((sum, item) => sum + item.percent, 0),
    2,
  );
  balance.percent = roundTo(Math.max(0, balance.percent + drift), 2);
}

function applyLocks(recipe: Recipe) {
  for (const item of recipe.ingredients) {
    if (!item.locksTo || typeof item.lockRatio !== 'number') continue;
    const source = recipe.ingredients.find((row) => row.id === item.locksTo);
    if (!source) continue;
    item.percent = roundTo(source.percent * item.lockRatio, 2);
  }
}

function solveHydration(recipe: Recipe) {
  const balance = waterBalance(recipe);
  if (!balance) return;
  const fraction = waterFractionOf(balance);
  if (fraction <= 0) return;
  const others = recipe.ingredients
    .filter((item) => item.id !== balance.id)
    .reduce((sum, item) => sum + item.percent * waterFractionOf(item), 0);
  const need = (recipe.targetHydration - others) / fraction;
  balance.percent = roundTo(Math.max(0, need), 2);
}

function applyDurations(recipe: Recipe) {
  const factor = fermentFactor(recipe);
  for (const step of recipe.steps) {
    if (!FERMENT_KINDS.has(step.kind)) {
      step.durationMin = step.baselineMin;
      continue;
    }
    step.durationMin = Math.max(1, Math.round(step.baselineMin * factor));
  }
}

export function fermentFactor(recipe: Pick<Recipe, 'baselineTempC' | 'roomTempC' | 'baselineLeaven' | 'leaven'>): number {
  const temperature = 2 ** ((recipe.baselineTempC - recipe.roomTempC) / 10);
  if (recipe.baselineLeaven === recipe.leaven.kind) return temperature;
  const leaven = recipe.leaven.kind === 'levain' ? LEAVEN_SLOWDOWN : 1 / LEAVEN_SLOWDOWN;
  return temperature * leaven;
}

function assignGrams(recipe: Recipe) {
  const flours = recipe.ingredients.filter((item) => item.group === 'flour');
  const balance = flours.find((item) => item.balance) ?? flours[0];
  let used = 0;
  for (const flour of flours) {
    if (balance && flour.id === balance.id) continue;
    flour.grams = roundTo((flour.percent / 100) * recipe.totalFlourG, 1);
    used += flour.grams;
  }
  if (balance) balance.grams = roundTo(recipe.totalFlourG - used, 1);
  for (const item of recipe.ingredients) {
    if (item.group === 'flour') continue;
    item.grams = roundTo((item.percent / 100) * recipe.totalFlourG, 1);
  }
}

function tweakWaterGrams(recipe: Recipe) {
  const balance = waterBalance(recipe);
  if (!balance) return;
  const fraction = waterFractionOf(balance);
  if (fraction <= 0) return;
  const others = recipe.ingredients
    .filter((item) => item.id !== balance.id)
    .reduce((sum, item) => sum + (item.grams ?? 0) * waterFractionOf(item), 0);
  const desired = (recipe.targetHydration / 100) * recipe.totalFlourG;
  balance.grams = roundTo(Math.max(0, (desired - others) / fraction), 1);
  balance.percent = roundTo((balance.grams / recipe.totalFlourG) * 100, 2);
}

function computeHydration(recipe: Recipe): number {
  if (recipe.totalFlourG <= 0) return 0;
  const water = recipe.ingredients.reduce(
    (sum, item) => sum + (item.grams ?? 0) * waterFractionOf(item),
    0,
  );
  return roundTo((water / recipe.totalFlourG) * 100, 2);
}

function projectHydration(recipe: Recipe): number {
  return roundTo(
    recipe.ingredients.reduce((sum, item) => sum + item.percent * waterFractionOf(item), 0),
    2,
  );
}

function waterBalance(recipe: Recipe): Ingredient | undefined {
  return recipe.ingredients.find((item) => item.balance && waterFractionOf(item) > 0 && !item.locksTo);
}

function freezeRecipe(recipe: Recipe): Recipe {
  const frozen: Recipe = {
    version: 1,
    id: recipe.id,
    title: recipe.title,
    summary: recipe.summary,
    tag: recipe.tag,
    yieldLabel: recipe.yieldLabel,
    totalFlourG: roundTo(recipe.totalFlourG, 1),
    targetHydration: roundTo(recipe.targetHydration, 2),
    hydration: roundTo(recipe.hydration ?? 0, 2),
    leaven: recipe.leaven.kind === 'yeast'
      ? { kind: 'yeast', name: recipe.leaven.name, percent: roundTo(recipe.leaven.percent, 2) }
      : {
          kind: 'levain',
          name: recipe.leaven.name,
          inoculation: roundTo(recipe.leaven.inoculation, 2),
          starterHydration: roundTo(recipe.leaven.starterHydration, 2),
        },
    baselineTempC: recipe.baselineTempC,
    baselineLeaven: recipe.baselineLeaven,
    roomTempC: recipe.roomTempC,
    ingredients: recipe.ingredients.map(freezeIngredient),
    steps: recipe.steps.map(freezeStep),
    schedule: recipe.schedule
      ? { anchorKind: recipe.schedule.anchorKind, anchor: recipe.schedule.anchor }
      : null,
  };
  return frozen;
}

function freezeIngredient(item: Ingredient): Ingredient {
  const next: Ingredient = {
    id: item.id,
    name: item.name,
    group: item.group,
    percent: roundTo(item.percent, 2),
    grams: roundTo(item.grams ?? 0, 1),
  };
  if (item.balance) next.balance = true;
  if (item.locksTo) next.locksTo = item.locksTo;
  if (typeof item.lockRatio === 'number') next.lockRatio = item.lockRatio;
  if (item.role) next.role = item.role;
  if (typeof item.waterFraction === 'number') next.waterFraction = item.waterFraction;
  return next;
}

function freezeStep(step: Step): Step {
  const next: Step = {
    id: step.id,
    name: step.name,
    kind: step.kind,
    baselineMin: step.baselineMin,
    durationMin: step.durationMin ?? step.baselineMin,
  };
  if (step.notes) next.notes = step.notes;
  return next;
}

function coerceRecipe(input: unknown): RecipeInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FormulaError('配方必須是 JSON 物件');
  }
  const raw = input as Record<string, unknown>;
  const id = requireSlug(raw.id, '配方 id');
  const title = requireText(raw.title, '配方需要標題');
  const totalFlourG = requireNumber(raw.totalFlourG, '總麵粉');
  if (totalFlourG <= 0 || totalFlourG > 100_000) throw new FormulaError('總麵粉超出範圍');
  const ingredients = coerceIngredients(raw.ingredients);
  const steps = coerceSteps(raw.steps);
  const leaven = coerceLeaven(raw.leaven, ingredients);
  const baselineTempC = optionalNumber(raw.baselineTempC, 24);
  const roomTempC = optionalNumber(raw.roomTempC, baselineTempC);
  if (roomTempC < -5 || roomTempC > 45) throw new FormulaError('室溫超出範圍');
  const baselineLeaven = raw.baselineLeaven === 'levain' || raw.baselineLeaven === 'yeast'
    ? raw.baselineLeaven
    : leaven.kind;
  const draft: RecipeInput = {
    version: 1,
    id,
    title,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    tag: typeof raw.tag === 'string' ? raw.tag : '',
    yieldLabel: typeof raw.yieldLabel === 'string' ? raw.yieldLabel : '',
    totalFlourG,
    targetHydration: optionalNumber(raw.targetHydration, Number.NaN),
    leaven,
    baselineTempC,
    baselineLeaven,
    roomTempC,
    ingredients,
    steps,
    schedule: coerceSchedule(raw.schedule),
  };
  if (typeof raw.wholeWheatPercent === 'number') draft.wholeWheatPercent = raw.wholeWheatPercent;
  if (typeof raw.scheduleRequest === 'string') draft.scheduleRequest = raw.scheduleRequest;
  if (!Number.isFinite(draft.targetHydration)) {
    const preview = structuredClone(draft);
    ensureLeavenRows(preview);
    applyLocks(preview);
    draft.targetHydration = projectHydration(preview);
  }
  return draft;
}

function coerceIngredients(value: unknown): Ingredient[] {
  if (!Array.isArray(value) || value.length === 0) throw new FormulaError('配方需要材料');
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new FormulaError('材料格式不對');
    }
    const raw = entry as Record<string, unknown>;
    const group = raw.group;
    if (typeof group !== 'string' || !GROUPS.has(group as IngredientGroup)) {
      throw new FormulaError('材料類別不對');
    }
    const percent = requireNumber(raw.percent, '百分比');
    const ingredient: Ingredient = {
      id: typeof raw.id === 'string' && raw.id.trim() ? slug(raw.id) : `row-${index + 1}`,
      name: requireText(raw.name, '材料需要名稱'),
      group: group as IngredientGroup,
      percent,
    };
    if (raw.balance === true) ingredient.balance = true;
    if (typeof raw.locksTo === 'string') ingredient.locksTo = slug(raw.locksTo);
    if (typeof raw.lockRatio === 'number') ingredient.lockRatio = raw.lockRatio;
    if (raw.role === 'dough' || raw.role === 'preferment' || raw.role === 'tangzhong') {
      ingredient.role = raw.role;
    }
    if (typeof raw.waterFraction === 'number') ingredient.waterFraction = raw.waterFraction;
    return ingredient;
  });
}

function coerceSteps(value: unknown): Step[] {
  if (!Array.isArray(value) || value.length === 0) throw new FormulaError('配方需要步驟');
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new FormulaError('步驟格式不對');
    }
    const raw = entry as Record<string, unknown>;
    const kind = raw.kind;
    if (typeof kind !== 'string' || !STEP_KINDS.has(kind as StepKind)) {
      throw new FormulaError('步驟種類不對');
    }
    const baselineMin = optionalNumber(raw.baselineMin, optionalNumber(raw.durationMin, Number.NaN));
    if (!Number.isFinite(baselineMin) || baselineMin <= 0) throw new FormulaError('步驟需要時間');
    const step: Step = {
      id: typeof raw.id === 'string' && raw.id.trim() ? slug(raw.id) : `step-${index + 1}`,
      name: requireText(raw.name, '步驟需要名稱'),
      kind: kind as StepKind,
      baselineMin: Math.round(baselineMin),
    };
    if (typeof raw.notes === 'string' && raw.notes.trim()) step.notes = raw.notes.trim();
    return step;
  });
}

function coerceLeaven(value: unknown, ingredients: Ingredient[]): Leaven {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const raw = value as Record<string, unknown>;
    if (raw.kind === 'levain') {
      return {
        kind: 'levain',
        name: typeof raw.name === 'string' ? raw.name : '酸種酵種',
        inoculation: optionalNumber(raw.inoculation, 20),
        starterHydration: optionalNumber(raw.starterHydration, 100),
      };
    }
    if (raw.kind === 'yeast') {
      return {
        kind: 'yeast',
        name: typeof raw.name === 'string' ? raw.name : '即溶酵母',
        percent: optionalNumber(raw.percent, 0.8),
      };
    }
  }
  const yeast = ingredients.find((item) => item.group === 'yeast');
  return { kind: 'yeast', name: yeast?.name ?? '即溶酵母', percent: yeast?.percent ?? 0.8 };
}

function coerceSchedule(value: unknown): Recipe['schedule'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if ((raw.anchorKind !== 'start' && raw.anchorKind !== 'bake') || typeof raw.anchor !== 'string') {
    return null;
  }
  if (!Number.isFinite(Date.parse(raw.anchor))) return null;
  return { anchorKind: raw.anchorKind, anchor: raw.anchor };
}

function requireSlug(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new FormulaError(`${label} 不正確`);
  const id = slug(value);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new FormulaError(`${label} 不正確`);
  return id;
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function requireText(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new FormulaError(message);
  return value.trim();
}

function requireNumber(value: unknown, label: string): number {
  const number = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(number)) throw new FormulaError(`${label} 必須是數字`);
  return number;
}

function optionalNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) return index;
  }
  return -1;
}

export function focacciaSteps(): Step[] {
  return [
    { id: 'mix', name: '攪拌', kind: 'mix', baselineMin: 15, notes: '水、油、鹽與酵母拌勻，不需出膜。' },
    { id: 'bulk', name: '一次發酵', kind: 'bulk', baselineMin: 120, notes: '中間摺兩次。' },
    { id: 'pan', name: '倒入烤盤、指壓', kind: 'shape', baselineMin: 15 },
    { id: 'proof', name: '二次發酵', kind: 'proof', baselineMin: 40 },
    { id: 'bake', name: '烘烤', kind: 'bake', baselineMin: 25, notes: '230°C，最後淋一點油。' },
  ];
}
