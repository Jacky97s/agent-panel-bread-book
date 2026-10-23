import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { diffRecipes } from './diff.js';
import {
  createFocacciaDraft,
  fermentFactor,
  normalizeRecipe,
  parseFocacciaRequest,
  setIngredientPercent,
  setRoomTemp,
  setTargetHydration,
  setTotalFlour,
} from './formula.js';
import { buildTimeline, parseBakeRequest } from './schedule.js';
import { buildSeedRecipes } from './seeds.js';
import type { Recipe } from './types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const now = new Date('2026-10-23T07:47:00Z');

function flourGrams(recipe: Recipe): number {
  return recipe.ingredients
    .filter((item) => item.group === 'flour')
    .reduce((sum, item) => sum + (item.grams ?? 0), 0);
}

function flourPercent(recipe: Recipe): number {
  return recipe.ingredients
    .filter((item) => item.group === 'flour')
    .reduce((sum, item) => sum + item.percent, 0);
}

function row(recipe: Recipe, id: string) {
  const found = recipe.ingredients.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe('baker’s percentages', () => {
  it('parses a leftover-flour focaccia request', () => {
    expect(parseFocacciaRequest('用剩下的 300g 麵粉做 75% 含水的佛卡夏')).toEqual({
      totalFlourG: 300,
      targetHydration: 75,
    });
    expect(parseFocacciaRequest('明天晚上 7 點要出爐')).toBeNull();
  });

  it('builds a 300g focaccia whose water hits 75% hydration', () => {
    const recipe = createFocacciaDraft({
      totalFlourG: 300,
      targetHydration: 75,
      roomTempC: 26,
      leaven: 'yeast',
      bakeAt: '2026-10-24T19:00:00+08:00',
    });
    expect(flourGrams(recipe)).toBe(300);
    expect(flourPercent(recipe)).toBe(100);
    expect(row(recipe, 'water').grams).toBe(225);
    expect(recipe.hydration).toBe(75);
    expect(recipe.schedule).toEqual({ anchorKind: 'bake', anchor: '2026-10-24T19:00:00+08:00' });
  });

  it('puts levain flour and water inside the 100% and the hydration', () => {
    const recipe = createFocacciaDraft({
      totalFlourG: 300,
      targetHydration: 75,
      roomTempC: 24,
      leaven: 'levain',
      bakeAt: '2026-10-24T19:00:00+08:00',
    });
    expect(row(recipe, 'preferment-flour').percent).toBe(10);
    expect(row(recipe, 'preferment-water').percent).toBe(10);
    expect(row(recipe, 'bread-flour').percent).toBe(90);
    expect(flourPercent(recipe)).toBe(100);
    expect(flourGrams(recipe)).toBe(300);
    expect(recipe.hydration).toBe(75);
    expect(row(recipe, 'water').grams).toBe(195);
    expect(recipe.ingredients.some((item) => item.group === 'yeast')).toBe(false);
  });

  it('rescales every gram when total flour changes and keeps percents', () => {
    const [focaccia] = buildSeedRecipes();
    const scaled = setTotalFlour(focaccia, 1000);
    expect(row(scaled, 'bread-flour').grams).toBe((row(focaccia, 'bread-flour').grams ?? 0) * 2);
    expect(row(scaled, 'water').grams).toBe((row(focaccia, 'water').grams ?? 0) * 2);
    expect(row(scaled, 'salt').percent).toBe(row(focaccia, 'salt').percent);
    expect(scaled.hydration).toBe(focaccia.hydration);
  });

  it('repairs an agent draft that sets whole wheat to 30% and leaves the other numbers wrong', () => {
    const country = buildSeedRecipes()[1];
    const broken = {
      ...country,
      wholeWheatPercent: 30,
      ingredients: country.ingredients.map((item) => {
        if (item.id === 'whole-wheat') return { ...item, percent: 10, grams: 1 };
        if (item.id === 'bread-flour') return { ...item, percent: 90, grams: 999 };
        return { ...item, grams: 3 };
      }),
    };
    const fixed = normalizeRecipe(broken);
    expect(row(fixed, 'whole-wheat').percent).toBe(30);
    expect(row(fixed, 'rye').percent).toBe(5);
    expect(row(fixed, 'preferment-flour').percent).toBe(10);
    expect(row(fixed, 'bread-flour').percent).toBe(55);
    expect(flourPercent(fixed)).toBe(100);
    expect(flourGrams(fixed)).toBe(500);
    expect(fixed.hydration).toBeCloseTo(78, 1);
    expect(row(fixed, 'whole-wheat').grams).toBe(150);
    expect(fixed).not.toHaveProperty('wholeWheatPercent');
  });

  it('adds a whole-wheat row when the recipe did not have one', () => {
    const focaccia = buildSeedRecipes()[0];
    const fixed = normalizeRecipe({ ...focaccia, wholeWheatPercent: 30 });
    expect(row(fixed, 'whole-wheat').percent).toBe(30);
    expect(row(fixed, 'bread-flour').percent).toBe(70);
    expect(flourGrams(fixed)).toBe(500);
    expect(fixed.hydration).toBeCloseTo(78, 1);
  });

  it('keeps tangzhong water at five times its flour and solves milk for the target', () => {
    const milk = buildSeedRecipes()[2];
    expect(row(milk, 'tz-flour').percent).toBe(5);
    expect(row(milk, 'tz-water').percent).toBe(25);
    expect(row(milk, 'bread-flour').percent).toBe(95);
    expect(row(milk, 'milk').percent).toBeCloseTo(50, 1);
    expect(flourGrams(milk)).toBe(450);
    expect(milk.hydration).toBeCloseTo(81.35, 1);
    const richer = setTargetHydration(milk, 85);
    expect(row(richer, 'tz-water').percent).toBe(25);
    expect(row(richer, 'milk').percent).toBeGreaterThan(50);
    expect(richer.hydration).toBeCloseTo(85, 1);
  });

  it('editing a flour percent updates the balance flour and not the hydration', () => {
    const country = buildSeedRecipes()[1];
    const edited = setIngredientPercent(country, 'whole-wheat', 30);
    expect(row(edited, 'whole-wheat').percent).toBe(30);
    expect(row(edited, 'bread-flour').percent).toBe(55);
    expect(edited.hydration).toBeCloseTo(country.hydration ?? 0, 1);
  });

  it('is idempotent, including a second pass over the saved shape', () => {
    for (const recipe of buildSeedRecipes()) {
      expect(normalizeRecipe(recipe)).toEqual(recipe);
      expect(normalizeRecipe(normalizeRecipe(recipe))).toEqual(recipe);
    }
  });

  it('matches the JSON files shipped under data/recipes', () => {
    for (const recipe of buildSeedRecipes()) {
      const onDisk = JSON.parse(
        readFileSync(path.join(root, 'data/recipes', `${recipe.id}.json`), 'utf8'),
      ) as Recipe;
      expect(onDisk).toEqual(recipe);
    }
  });
});

describe('fermentation schedule', () => {
  it('reads tomorrow evening as 19:00 Asia/Taipei on the next calendar day', () => {
    expect(parseBakeRequest('明天晚上 7 點要出爐，幫我排時間', now)).toEqual({
      anchorKind: 'bake',
      anchor: '2026-10-24T19:00:00+08:00',
    });
  });

  it('schedules backwards from the bake time', () => {
    const country = buildSeedRecipes()[1];
    const timeline = buildTimeline(country.steps, country.schedule, now);
    expect(timeline.totalMin).toBe(1100);
    expect(timeline.bakeOut).toBe('2026-10-25T00:00:00.000Z');
    expect(timeline.start).toBe('2026-10-24T05:40:00.000Z');
    expect(timeline.entries[0]?.start).toBe(timeline.start);
    expect(timeline.entries.at(-1)?.end).toBe(timeline.bakeOut);
  });

  it('schedules forwards from a start time', () => {
    const focaccia = buildSeedRecipes()[0];
    const timeline = buildTimeline(focaccia.steps, focaccia.schedule, now);
    expect(timeline.totalMin).toBe(255);
    expect(timeline.start).toBe('2026-10-24T01:00:00.000Z');
    expect(timeline.bakeOut).toBe('2026-10-24T05:15:00.000Z');
  });

  it('shortens fermentation in a warm room and leaves the bake and the cold retard alone', () => {
    const focaccia = buildSeedRecipes()[0];
    expect(fermentFactor({ ...focaccia, roomTempC: 28 })).toBeCloseTo(2 ** -0.4, 5);
    const warm = setRoomTemp(focaccia, 28);
    expect(warm.steps.find((step) => step.id === 'bulk')?.durationMin).toBe(114);
    expect(warm.steps.find((step) => step.id === 'proof')?.durationMin).toBe(34);
    expect(warm.steps.find((step) => step.id === 'bake')?.durationMin).toBe(25);
    const country = setRoomTemp(buildSeedRecipes()[1], 20);
    expect(country.steps.find((step) => step.id === 'bulk')?.durationMin).toBe(317);
    expect(country.steps.find((step) => step.id === 'cold')?.durationMin).toBe(720);
    expect(country.steps.find((step) => step.id === 'bake')?.durationMin).toBe(45);
  });

  it('slows a yeast baseline when the dough switches to levain', () => {
    const recipe = createFocacciaDraft({
      totalFlourG: 300,
      targetHydration: 75,
      roomTempC: 24,
      leaven: 'levain',
      bakeAt: '2026-10-24T19:00:00+08:00',
    });
    expect(recipe.steps.find((step) => step.id === 'bulk')?.durationMin).toBe(264);
    expect(recipe.steps.find((step) => step.id === 'bake')?.durationMin).toBe(25);
  });

  it('applies a schedule phrase and highlights the rows that moved', () => {
    const country = buildSeedRecipes()[1];
    const scheduled = normalizeRecipe({
      ...country,
      scheduleRequest: '明天晚上 7 點要出爐，幫我排時間',
    }, now);
    expect(scheduled.schedule?.anchor).toBe('2026-10-24T19:00:00+08:00');
    expect(scheduled.schedule?.anchorKind).toBe('bake');
    const diff = diffRecipes(country, scheduled);
    expect(diff.scheduleChanged).toBe(true);
    expect(diff.ingredientIds).toEqual([]);

    const wheat = normalizeRecipe({ ...country, wholeWheatPercent: 30 });
    const wheatDiff = diffRecipes(country, wheat);
    expect(wheatDiff.ingredientIds).toContain('whole-wheat');
    expect(wheatDiff.ingredientIds).toContain('bread-flour');
    expect(wheatDiff.ingredientIds).not.toContain('salt');
  });
});
