import type { Schedule, Step, Timeline, TimelineEntry } from './types.js';

export const TAIPEI = 'Asia/Taipei';

export type CalendarDate = { year: number; month: number; day: number };

export type TaipeiParts = CalendarDate & { hour: number; minute: number };

export function taipeiParts(date: Date): TaipeiParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TAIPEI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

export function taipeiISO(date: CalendarDate, hour: number, minute: number): string {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${date.year}-${month}-${day}T${hh}:${mm}:00+08:00`;
}

export function toTaipeiInputValue(iso: string): string {
  return taipeiISOFromDate(new Date(iso)).slice(0, 16);
}

export function taipeiISOFromDate(date: Date): string {
  const parts = taipeiParts(date);
  return taipeiISO(parts, parts.hour, parts.minute);
}

export function inputValueToTaipeiISO(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (hour > 23 || minute > 59) return null;
  return taipeiISO(
    { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) },
    hour,
    minute,
  );
}

/**
 * Reads a bake-time phrase such as "明天晚上 7 點要出爐".
 * The anchor is the moment the bread comes out of the oven, in Asia/Taipei.
 */
export function parseBakeRequest(text: string, now = new Date()): Schedule | null {
  const wantsSchedule = /出爐|烤好|烘好|排時間|排程/.test(text);
  const tomorrow = /明天|翌日/.test(text);
  const dayAfter = /後天/.test(text);
  const tonight = /今晚|今天|今夜/.test(text);
  const evening = /晚上|傍晚|黃昏|pm/i.test(text);
  const morning = /早上|上午|清晨|am/i.test(text);
  const noon = /中午/.test(text);

  let hour: number | null = null;
  let minute = 0;
  const clock = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  const named = text.match(/(\d{1,2})\s*點(?:\s*(\d{1,2})\s*分)?/);
  if (clock) {
    hour = Number(clock[1]);
    minute = Number(clock[2]);
  } else if (named) {
    hour = Number(named[1]);
    minute = named[2] ? Number(named[2]) : 0;
  }
  if (hour !== null) {
    if (noon && hour < 11) hour += 12;
    if (evening && hour < 12) hour += 12;
    if (morning && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
  }
  if (!wantsSchedule && hour === null) return null;
  if (hour === null) {
    if (evening) hour = 19;
    else if (morning) hour = 8;
    else if (noon) hour = 12;
    else return null;
  }

  const today = taipeiParts(now);
  let offset = 0;
  if (dayAfter) offset = 2;
  else if (tomorrow) offset = 1;
  let date = addDays(today, offset);
  if (offset === 0 && !tonight) {
    const passed = hour < today.hour || (hour === today.hour && minute <= today.minute);
    if (passed) date = addDays(today, 1);
  }
  return { anchorKind: 'bake', anchor: taipeiISO(date, hour, minute) };
}

export function stepMinutes(step: Pick<Step, 'durationMin' | 'baselineMin'>): number {
  return step.durationMin ?? step.baselineMin;
}

export function totalMinutes(steps: Pick<Step, 'durationMin' | 'baselineMin'>[]): number {
  return steps.reduce((sum, step) => sum + stepMinutes(step), 0);
}

export function buildTimeline(
  steps: Pick<Step, 'id' | 'name' | 'kind' | 'durationMin' | 'baselineMin'>[],
  schedule: Schedule | null,
  now = new Date(),
): Timeline {
  const totalMin = totalMinutes(steps);
  let startMs = now.getTime();
  let anchorKind: Schedule['anchorKind'] = 'start';
  if (schedule) {
    const anchorMs = Date.parse(schedule.anchor);
    if (Number.isFinite(anchorMs)) {
      anchorKind = schedule.anchorKind;
      startMs = schedule.anchorKind === 'bake' ? anchorMs - totalMin * 60_000 : anchorMs;
    }
  }
  const entries: TimelineEntry[] = [];
  let cursor = startMs;
  for (const step of steps) {
    const durationMin = stepMinutes(step);
    const end = cursor + durationMin * 60_000;
    entries.push({
      stepId: step.id,
      name: step.name,
      kind: step.kind,
      durationMin,
      start: new Date(cursor).toISOString(),
      end: new Date(end).toISOString(),
    });
    cursor = end;
  }
  return {
    entries,
    start: new Date(startMs).toISOString(),
    bakeOut: new Date(startMs + totalMin * 60_000).toISOString(),
    totalMin,
    anchorKind,
  };
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} 小時 ${rest} 分`;
  if (hours) return `${hours} 小時`;
  return `${rest} 分`;
}

export function formatTaipei(iso: string): string {
  return new Intl.DateTimeFormat('zh-Hant-TW', {
    timeZone: TAIPEI,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat('zh-Hant-TW', {
    timeZone: TAIPEI,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}
