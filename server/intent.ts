import { parseBakeRequest } from '../src/lib/schedule.js';
import { parseFocacciaRequest } from '../src/lib/formula.js';
import type { Schedule } from '../src/lib/types.js';

export type TurnPlan =
  | { kind: 'focaccia'; totalFlourG: number; targetHydration: number }
  | { kind: 'whole-wheat' }
  | { kind: 'schedule'; schedule: Schedule }
  | { kind: 'help' };

export function userUtterance(prompt: string): string {
  const marker = '</agent-panel-capability>';
  const index = prompt.lastIndexOf(marker);
  return (index >= 0 ? prompt.slice(index + marker.length) : prompt).trim();
}

export function planTurn(utterance: string, now = new Date()): TurnPlan {
  const focaccia = parseFocacciaRequest(utterance);
  if (focaccia) return { kind: 'focaccia', ...focaccia };
  if (/全麥/.test(utterance) && /三成|30\s*%|百分之三十/.test(utterance)) {
    return { kind: 'whole-wheat' };
  }
  const schedule = parseBakeRequest(utterance, now);
  if (schedule && /出爐|排時間|排程/.test(utterance)) return { kind: 'schedule', schedule };
  return { kind: 'help' };
}

export function explicitRoomTemp(utterance: string): number | null {
  const match = utterance.match(/室溫\s*(\d{1,2})|(\d{1,2})\s*°\s*C|(\d{1,2})\s*度/i);
  const value = Number(match?.[1] ?? match?.[2] ?? match?.[3]);
  if (!Number.isFinite(value) || value < 0 || value > 45) return null;
  return value;
}

export function explicitLeaven(utterance: string): 'yeast' | 'levain' | null {
  const levain = /酸種/.test(utterance);
  const yeast = /即溶酵母|商業酵母|乾酵母/.test(utterance);
  if (levain === yeast) return null;
  return levain ? 'levain' : 'yeast';
}
