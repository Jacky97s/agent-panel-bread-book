import { normalizeRecipe } from './formula.js';
import type { Recipe, Step } from './types.js';

export function buildSeedRecipes(): Recipe[] {
  return [focaccia(), countrySourdough(), milkBread()];
}

function focaccia(): Recipe {
  return normalizeRecipe({
    version: 1,
    id: 'focaccia',
    title: '佛卡夏',
    summary: '高含水、多橄欖油，在烤盤裡發酵後直接進烤箱。時間以 24°C、即溶酵母為基準。',
    tag: '佛卡夏',
    yieldLabel: '一盤',
    totalFlourG: 500,
    targetHydration: 78,
    leaven: { kind: 'yeast', name: '即溶酵母', percent: 0.8 },
    baselineTempC: 24,
    baselineLeaven: 'yeast',
    roomTempC: 24,
    ingredients: [
      { id: 'bread-flour', name: '高筋麵粉', group: 'flour', percent: 100, balance: true, role: 'dough' },
      { id: 'water', name: '水', group: 'water', percent: 78, balance: true, role: 'dough' },
      { id: 'salt', name: '鹽', group: 'salt', percent: 2.5, role: 'dough' },
      { id: 'yeast', name: '即溶酵母', group: 'yeast', percent: 0.8, role: 'dough' },
      { id: 'oil', name: '橄欖油', group: 'fat', percent: 5, role: 'dough' },
    ],
    steps: [
      { id: 'mix', name: '攪拌', kind: 'mix', baselineMin: 15, notes: '水、油、鹽與酵母拌勻，不需出膜。' },
      { id: 'bulk', name: '一次發酵', kind: 'bulk', baselineMin: 150, notes: '中間用油手摺兩次。' },
      { id: 'pan', name: '倒入烤盤、指壓', kind: 'shape', baselineMin: 20 },
      { id: 'proof', name: '二次發酵', kind: 'proof', baselineMin: 45 },
      { id: 'bake', name: '烘烤', kind: 'bake', baselineMin: 25, notes: '230°C，出爐前再淋一點油與鹽花。' },
    ],
    schedule: { anchorKind: 'start', anchor: '2026-10-24T09:00:00+08:00' },
  });
}

function countrySourdough(): Recipe {
  return normalizeRecipe({
    version: 1,
    id: 'country-sourdough',
    title: '鄉村酸種',
    summary: '一成全麥、半成黑麥，酵種接種兩成。冷藏一整夜，隔天早上出爐。',
    tag: '鄉村麵包',
    yieldLabel: '一顆',
    totalFlourG: 500,
    targetHydration: 78,
    leaven: { kind: 'levain', name: '酸種酵種', inoculation: 20, starterHydration: 100 },
    baselineTempC: 24,
    baselineLeaven: 'levain',
    roomTempC: 24,
    ingredients: [
      { id: 'bread-flour', name: '高筋麵粉', group: 'flour', percent: 75, balance: true, role: 'dough' },
      { id: 'whole-wheat', name: '全麥麵粉', group: 'flour', percent: 10, role: 'dough' },
      { id: 'rye', name: '黑麥麵粉', group: 'flour', percent: 5, role: 'dough' },
      { id: 'water', name: '水', group: 'water', percent: 68, balance: true, role: 'dough' },
      { id: 'salt', name: '鹽', group: 'salt', percent: 2.2, role: 'dough' },
    ],
    steps: countrySteps(),
    schedule: { anchorKind: 'bake', anchor: '2026-10-25T08:00:00+08:00' },
  });
}

function milkBread(): Recipe {
  return normalizeRecipe({
    version: 1,
    id: 'milk-bread',
    title: '湯種牛奶麵包',
    summary: '湯種用掉 5% 麵粉，水是湯種麵粉的五倍。牛奶補上其餘水分，烤成一條吐司。',
    tag: '吐司',
    yieldLabel: '一條吐司',
    totalFlourG: 450,
    targetHydration: 81.35,
    leaven: { kind: 'yeast', name: '即溶酵母', percent: 1.6 },
    baselineTempC: 24,
    baselineLeaven: 'yeast',
    roomTempC: 24,
    ingredients: [
      { id: 'tz-flour', name: '高筋麵粉（湯種）', group: 'flour', percent: 5, role: 'tangzhong' },
      { id: 'bread-flour', name: '高筋麵粉', group: 'flour', percent: 95, balance: true, role: 'dough' },
      {
        id: 'tz-water',
        name: '水（湯種）',
        group: 'water',
        percent: 25,
        role: 'tangzhong',
        locksTo: 'tz-flour',
        lockRatio: 5,
      },
      { id: 'milk', name: '牛奶', group: 'milk', percent: 50, balance: true, role: 'dough' },
      { id: 'egg', name: '蛋', group: 'egg', percent: 15, role: 'dough' },
      { id: 'sugar', name: '糖', group: 'sugar', percent: 12, role: 'dough' },
      { id: 'salt', name: '鹽', group: 'salt', percent: 1.8, role: 'dough' },
      { id: 'yeast', name: '即溶酵母', group: 'yeast', percent: 1.6, role: 'dough' },
      { id: 'butter', name: '無鹽奶油', group: 'fat', percent: 10, role: 'dough', waterFraction: 0.16 },
    ],
    steps: [
      { id: 'tangzhong', name: '煮湯種', kind: 'mix', baselineMin: 8, notes: '麵粉與水加熱到 65°C，攪成糊。' },
      { id: 'cool', name: '湯種放涼', kind: 'rest', baselineMin: 25 },
      { id: 'mix', name: '攪拌主麵團', kind: 'mix', baselineMin: 18, notes: '奶油最後加，攪到擴展階段。' },
      { id: 'bulk', name: '一次發酵', kind: 'bulk', baselineMin: 60 },
      { id: 'shape', name: '分割滾圓、入模', kind: 'shape', baselineMin: 20 },
      { id: 'proof', name: '最終發酵', kind: 'proof', baselineMin: 50 },
      { id: 'bake', name: '烘烤', kind: 'bake', baselineMin: 30, notes: '170°C。' },
    ],
    schedule: { anchorKind: 'start', anchor: '2026-10-24T08:00:00+08:00' },
  });
}

function countrySteps(): Step[] {
  return [
    { id: 'autolyse', name: '自解', kind: 'autolyse', baselineMin: 40, notes: '麵粉與水先拌勻，鹽和酵種先不放。' },
    { id: 'mix', name: '拌入酵種與鹽', kind: 'mix', baselineMin: 15 },
    { id: 'bulk', name: '一次發酵', kind: 'bulk', baselineMin: 240, notes: '每隔一段時間摺一次，共三到四次。' },
    { id: 'bench', name: '預整型休息', kind: 'bench', baselineMin: 25 },
    { id: 'shape', name: '整型', kind: 'shape', baselineMin: 15 },
    { id: 'cold', name: '冷藏最終發酵', kind: 'cold', baselineMin: 720, notes: '4°C。這段不隨室溫調整。' },
    { id: 'bake', name: '烘烤', kind: 'bake', baselineMin: 45, notes: '荷蘭鍋 230°C，後半開蓋。' },
  ];
}
