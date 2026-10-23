import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeRecipe } from '../src/lib/formula.js';
import { buildSeedRecipes } from '../src/lib/seeds.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'data/recipes');

await mkdir(directory, { recursive: true });
for (const recipe of buildSeedRecipes()) {
  await writeFile(path.join(directory, `${recipe.id}.json`), serializeRecipe(recipe));
}
