import { describe, expect, it } from 'vitest';
import { explicitLeaven, explicitRoomTemp, planTurn, userUtterance } from './intent.js';

const now = new Date('2026-10-23T07:47:00Z');

describe('turn planning', () => {
  it('keeps the user sentence separate from the capability block', () => {
    const prompt = `<agent-panel-capability>\n酸種或即溶酵母\n</agent-panel-capability>\n\n改成全麥三成`;
    expect(userUtterance(prompt)).toBe('改成全麥三成');
    expect(planTurn(userUtterance(prompt), now).kind).toBe('whole-wheat');
  });

  it('plans the three demo requests', () => {
    expect(planTurn('用剩下的 300g 麵粉做 75% 含水的佛卡夏', now)).toEqual({
      kind: 'focaccia',
      totalFlourG: 300,
      targetHydration: 75,
    });
    expect(planTurn('改成全麥三成', now).kind).toBe('whole-wheat');
    expect(planTurn('明天晚上 7 點要出爐，幫我排時間', now)).toEqual({
      kind: 'schedule',
      schedule: { anchorKind: 'bake', anchor: '2026-10-24T19:00:00+08:00' },
    });
  });

  it('reads details the user already gave', () => {
    const text = '用 300g 麵粉做 75% 含水的佛卡夏，室溫 26 度，即溶酵母，明天晚上 7 點出爐';
    expect(explicitRoomTemp(text)).toBe(26);
    expect(explicitLeaven(text)).toBe('yeast');
    expect(planTurn(text, now).kind).toBe('focaccia');
  });
});
