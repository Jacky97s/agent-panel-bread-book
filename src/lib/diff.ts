import { roundTo } from './formula.js';
import type { Recipe } from './types.js';

export type IngredientChange = {
  id: string;
  name: string;
  previousPercent: number | null;
  previousGrams: number | null;
  percent: number;
  grams: number;
};

export type RecipeDiff = {
  ingredientIds: string[];
  changes: IngredientChange[];
  scheduleChanged: boolean;
  added: boolean;
};

export function diffRecipes(previous: Recipe | null, next: Recipe): RecipeDiff {
  if (!previous) {
    const changes = next.ingredients.map((item) => ({
      id: item.id,
      name: item.name,
      previousPercent: null,
      previousGrams: null,
      percent: item.percent,
      grams: item.grams ?? 0,
    }));
    return {
      ingredientIds: changes.map((change) => change.id),
      changes,
      scheduleChanged: next.schedule !== null,
      added: true,
    };
  }
  const changes: IngredientChange[] = [];
  for (const item of next.ingredients) {
    const old = previous.ingredients.find((row) => row.id === item.id);
    const percentChanged = !old || roundTo(old.percent, 2) !== roundTo(item.percent, 2);
    const gramsChanged = !old || roundTo(old.grams ?? 0, 1) !== roundTo(item.grams ?? 0, 1);
    const nameChanged = !old || old.name !== item.name;
    if (!percentChanged && !gramsChanged && !nameChanged) continue;
    changes.push({
      id: item.id,
      name: item.name,
      previousPercent: old ? old.percent : null,
      previousGrams: old ? (old.grams ?? null) : null,
      percent: item.percent,
      grams: item.grams ?? 0,
    });
  }
  const scheduleChanged =
    JSON.stringify(previous.schedule) !== JSON.stringify(next.schedule) ||
    previous.steps.length !== next.steps.length ||
    previous.steps.some((step, index) => step.durationMin !== next.steps[index]?.durationMin);
  return {
    ingredientIds: changes.map((change) => change.id),
    changes,
    scheduleChanged,
    added: false,
  };
}
