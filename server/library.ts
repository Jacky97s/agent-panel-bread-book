import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { diffRecipes, type RecipeDiff } from '../src/lib/diff.js';
import { FormulaError, isRecipeId, normalizeRecipe, serializeRecipe } from '../src/lib/formula.js';
import type { Recipe, RecipeSummary } from '../src/lib/types.js';

export class RecipeLibrary {
  readonly recipesDir: string;
  private readonly seedsDir: string;
  private snapshots = new Map<string, Recipe>();
  private highlights = new Map<string, RecipeDiff>();
  private selfWrite = new Set<string>();
  private revision = 0;
  private chain: Promise<void> = Promise.resolve();
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(dataDir: string, seedsDir: string) {
    this.recipesDir = path.join(dataDir, 'recipes');
    this.seedsDir = seedsDir;
  }

  async open(): Promise<void> {
    await mkdir(this.recipesDir, { recursive: true });
    if (path.resolve(this.seedsDir) !== path.resolve(this.recipesDir)) {
      const seeds = await readdir(this.seedsDir).catch(() => [] as string[]);
      for (const file of seeds) {
        if (!file.endsWith('.json') && file !== 'SCHEMA.md') continue;
        const target = path.join(this.recipesDir, file);
        try {
          await readFile(target);
        } catch {
          await writeFile(target, await readFile(path.join(this.seedsDir, file)));
        }
      }
    }
    await this.refresh(false);
    this.watcher = watch(this.recipesDir, () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        void this.refresh(true);
      }, 40);
    });
  }

  close() {
    this.watcher?.close();
    if (this.timer) clearTimeout(this.timer);
  }

  refresh(fromDiskEvent: boolean): Promise<void> {
    this.chain = this.chain
      .then(() => this.refreshNow(fromDiskEvent))
      .catch((error: unknown) => {
        console.error(error);
      });
    return this.chain;
  }

  list(): { revision: number; recipes: RecipeSummary[] } {
    const order = ['focaccia', 'country-sourdough', 'milk-bread'];
    const recipes = [...this.snapshots.values()]
      .map((recipe) => this.summary(recipe))
      .sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return a.title.localeCompare(b.title, 'zh-Hant');
      });
    return { revision: this.revision, recipes };
  }

  get(id: string): { recipe: Recipe; highlight: RecipeDiff | null } | null {
    const recipe = this.snapshots.get(id);
    if (!recipe) return null;
    return { recipe, highlight: this.highlights.get(id) ?? null };
  }

  async save(recipe: Recipe): Promise<Recipe> {
    const normalized = normalizeRecipe(recipe);
    this.selfWrite.add(normalized.id);
    this.snapshots.set(normalized.id, normalized);
    this.highlights.delete(normalized.id);
    await writeFile(this.file(normalized.id), serializeRecipe(normalized));
    this.revision += 1;
    return normalized;
  }

  dismiss(id: string) {
    this.highlights.delete(id);
  }

  private summary(recipe: Recipe): RecipeSummary {
    const diff = this.highlights.get(recipe.id);
    let highlight: RecipeSummary['highlight'] = null;
    if (diff?.added) highlight = 'new';
    else if (diff && (diff.ingredientIds.length > 0 || diff.scheduleChanged)) highlight = 'edited';
    return {
      id: recipe.id,
      title: recipe.title,
      summary: recipe.summary,
      tag: recipe.tag,
      yieldLabel: recipe.yieldLabel,
      hydration: recipe.hydration ?? recipe.targetHydration,
      totalFlourG: recipe.totalFlourG,
      leaven: recipe.leaven.kind,
      highlight,
    };
  }

  private async refreshNow(fromDiskEvent: boolean) {
    const files = (await readdir(this.recipesDir)).filter((file) => file.endsWith('.json'));
    const seen = new Set<string>();
    let changed = false;
    for (const file of files) {
      const id = file.replace(/\.json$/, '');
      if (!isRecipeId(id)) continue;
      seen.add(id);
      const full = path.join(this.recipesDir, file);
      const onDisk = await readFile(full, 'utf8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(onDisk) as unknown;
      } catch {
        continue;
      }
      let normalized: Recipe;
      try {
        normalized = normalizeRecipe(parsed);
      } catch (error) {
        if (error instanceof FormulaError) continue;
        throw error;
      }
      if (normalized.id !== id) continue;
      const canonical = serializeRecipe(normalized);
      const own = this.selfWrite.delete(id);
      if (onDisk !== canonical) {
        this.selfWrite.add(id);
        await writeFile(full, canonical);
        changed = true;
      }
      if (!fromDiskEvent) {
        this.selfWrite.delete(id);
        this.snapshots.set(id, normalized);
        this.highlights.delete(id);
        continue;
      }
      if (own) {
        this.snapshots.set(id, normalized);
        continue;
      }
      const previous = this.snapshots.get(id);
      if (!previous || serializeRecipe(previous) !== canonical) {
        this.highlights.set(id, diffRecipes(previous ?? null, normalized));
        this.snapshots.set(id, normalized);
        changed = true;
      }
    }
    for (const id of [...this.snapshots.keys()]) {
      if (!seen.has(id)) {
        this.snapshots.delete(id);
        this.highlights.delete(id);
        changed = true;
      }
    }
    if (changed) this.revision += 1;
  }

  private file(id: string): string {
    return path.join(this.recipesDir, `${id}.json`);
  }
}
