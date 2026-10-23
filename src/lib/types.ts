export type LeavenKind = 'yeast' | 'levain';

export type IngredientGroup =
  | 'flour'
  | 'water'
  | 'milk'
  | 'egg'
  | 'salt'
  | 'fat'
  | 'sugar'
  | 'yeast'
  | 'other';

export type StepKind =
  | 'mix'
  | 'autolyse'
  | 'bulk'
  | 'fold'
  | 'bench'
  | 'shape'
  | 'proof'
  | 'cold'
  | 'bake'
  | 'rest';

export type IngredientRole = 'dough' | 'preferment' | 'tangzhong';

export type Ingredient = {
  id: string;
  name: string;
  group: IngredientGroup;
  /** Baker's percent of total flour. Total flour, including preferment flour, is 100. */
  percent: number;
  /** Filled by normalize. Input grams are ignored. */
  grams?: number;
  /** Absorbs the remainder so flour sums to 100, or so hydration hits the target. */
  balance?: boolean;
  /** Forces percent to lockRatio times the referenced row. */
  locksTo?: string;
  lockRatio?: number;
  role?: IngredientRole;
  /** Overrides the group default, as a fraction of this row's weight that counts as water. */
  waterFraction?: number;
};

export type Leaven =
  | { kind: 'yeast'; name: string; percent: number }
  | { kind: 'levain'; name: string; inoculation: number; starterHydration: number };

export type Step = {
  id: string;
  name: string;
  kind: StepKind;
  /** Duration at baselineTempC for baselineLeaven. This is the source of truth. */
  baselineMin: number;
  /** Filled by normalize from the baseline, room temperature, and leaven. */
  durationMin?: number;
  notes?: string;
};

export type Schedule = {
  anchorKind: 'start' | 'bake';
  /** ISO 8601 timestamp. Bake anchors are the moment the loaf comes out of the oven. */
  anchor: string;
};

export type Recipe = {
  version: 1;
  id: string;
  title: string;
  summary: string;
  tag: string;
  yieldLabel: string;
  totalFlourG: number;
  targetHydration: number;
  hydration?: number;
  leaven: Leaven;
  baselineTempC: number;
  baselineLeaven: LeavenKind;
  roomTempC: number;
  ingredients: Ingredient[];
  steps: Step[];
  schedule: Schedule | null;
};

/** Fields an agent may set. normalize consumes them and strips them from the file. */
export type RecipeInput = Recipe & {
  wholeWheatPercent?: number;
  scheduleRequest?: string;
};

export type TimelineEntry = {
  stepId: string;
  name: string;
  kind: StepKind;
  durationMin: number;
  notes?: string;
  start: string;
  end: string;
};

export type Timeline = {
  entries: TimelineEntry[];
  start: string;
  bakeOut: string;
  totalMin: number;
  anchorKind: 'start' | 'bake';
};

export type RecipeSummary = {
  id: string;
  title: string;
  summary: string;
  tag: string;
  yieldLabel: string;
  hydration: number;
  totalFlourG: number;
  leaven: LeavenKind;
  highlight: 'new' | 'edited' | null;
};

export type AgentPreset = 'mock' | 'claude-code' | 'codex' | 'gemini';
