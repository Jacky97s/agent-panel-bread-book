import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Capability } from '@agent-panel/core';

export const CAPABILITY_ID = 'bread-book';

const SYSTEM_PROMPT = `你是麵包配方本的助手。只用繁體中文回覆。
你只能寫入 recipes directory 裡的 *.json。不要改 SCHEMA.md，不要寫別的路徑。
不要自己算克數、含水率或時間軸。程式會重算並覆蓋 grams、hydration、durationMin。

百分率以總麵粉為 100，總麵粉包含酵種麵粉。
麵粉要有一列 balance:true，其餘麵粉寫百分比，程式把 balance 補到 100。
液體要有一列 balance:true（水或牛奶）。程式依 targetHydration 反推它。
含水率會計入：水、酵種的水、牛奶（87%）、蛋（75%）、奶油（16%）。油不算水。
湯種的水若有 locksTo 與 lockRatio，程式會維持那個倍數。

資訊不夠時先用表單提問，不要猜。用剩下的麵粉做佛卡夏時，先問三件事：
室溫（18、22、26 或 30）、酸種還是即溶酵母、想什麼時候出爐。問完再寫新檔。
檔名與 id 用小寫英數和連字號。

把全麥改成三成：只設定 wholeWheatPercent 為 30，不要手改每一列的克數。
使用者說幾點出爐：寫 scheduleRequest 為使用者的原話，或寫 schedule.anchorKind 為 "bake"、anchor 為帶 +08:00 的時間。順推則 anchorKind 為 "start"。
改總麵粉只改 totalFlourG。改含水只改 targetHydration。
步驟只寫 baselineMin（基準是 baselineTempC 與 baselineLeaven），不要寫 durationMin。
只改上下文裡選到的那份配方。`;

export function createBreadCapability(
  recipesDir: string,
  onComplete: () => Promise<void>,
): Capability {
  return {
    id: CAPABILITY_ID,
    label: '麵包配方本',
    systemPromptAppend: SYSTEM_PROMPT,
    writableRoots: [recipesDir],
    allowedTools: ['write'],
    buildContext: async (ctx) => {
      const lines = [
        `recipes directory: ${recipesDir}`,
        'timezone: Asia/Taipei',
        `now: ${new Date().toISOString()}`,
        'Write percents, totalFlourG, targetHydration, wholeWheatPercent, or scheduleRequest. Grams are recomputed.',
      ];
      const recipeId = typeof ctx.recipeId === 'string' ? ctx.recipeId : '';
      if (/^[a-z0-9][a-z0-9-]{0,63}$/.test(recipeId)) {
        const file = path.join(recipesDir, `${recipeId}.json`);
        lines.push(`selected recipe file: ${file}`);
        lines.push(await readFile(file, 'utf8').catch(() => ''));
      }
      if (typeof ctx.ingredientIds === 'string' && ctx.ingredientIds.trim()) {
        lines.push(`selected ingredient ids: ${ctx.ingredientIds.trim()}`);
      }
      return lines;
    },
    onComplete: async () => {
      await onComplete();
    },
  };
}
