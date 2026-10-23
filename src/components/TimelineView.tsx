import {
  buildTimeline,
  formatClock,
  formatDay,
  formatDuration,
  formatTaipei,
  inputValueToTaipeiISO,
  taipeiISOFromDate,
  toTaipeiInputValue,
} from '../lib/schedule.js';
import type { Recipe, Schedule, TimelineEntry } from '../lib/types.js';

export function TimelineView({
  recipe,
  scheduleChanged,
  onSchedule,
}: {
  recipe: Recipe;
  scheduleChanged: boolean;
  onSchedule: (schedule: Schedule) => void;
}) {
  const timeline = buildTimeline(recipe.steps, recipe.schedule);
  const mode = recipe.schedule?.anchorKind ?? 'start';
  const anchorLabel = mode === 'bake' ? '出爐時間' : '開始時間';
  const anchorValue = toTaipeiInputValue(
    recipe.schedule?.anchor ?? (mode === 'bake' ? timeline.bakeOut : timeline.start),
  );
  const days = groupByDay(timeline.entries);

  return (
    <section className="slip" aria-labelledby="timeline-heading">
      <div className="card-head">
        <h2 id="timeline-heading">發酵時程</h2>
        <p>
          {mode === 'bake' ? '從出爐時間倒推。' : '從開始時間往後排。'}
          室溫只改自解、一次發酵、二次發酵，冷藏與烘烤不動。
        </p>
      </div>
      {scheduleChanged ? <p className="diff-banner">時程已依新的出爐時間重排。</p> : null}
      <div className="schedule-controls">
        <div className="modes" role="group" aria-label="排程方向">
          <button
            type="button"
            aria-pressed={mode === 'start'}
            onClick={() =>
              onSchedule({ anchorKind: 'start', anchor: taipeiISOFromDate(new Date(timeline.start)) })
            }
          >
            從開始順推
          </button>
          <button
            type="button"
            aria-pressed={mode === 'bake'}
            onClick={() =>
              onSchedule({ anchorKind: 'bake', anchor: taipeiISOFromDate(new Date(timeline.bakeOut)) })
            }
          >
            指定出爐
          </button>
        </div>
        <label>
          {anchorLabel}
          <input
            type="datetime-local"
            aria-label={anchorLabel}
            value={anchorValue}
            onChange={(event) => {
              const anchor = inputValueToTaipeiISO(event.target.value);
              if (anchor) onSchedule({ anchorKind: mode, anchor });
            }}
          />
        </label>
      </div>
      {days.map(({ day, entries }) => (
        <div className="timeline-day" key={day}>
          <h3>{day}</h3>
          <ol className="timeline">
            {entries.map((entry) => (
              <li key={entry.stepId}>
                <time dateTime={entry.start}>{formatClock(entry.start)}</time>
                <span className="step-name">{entry.name}</span>
                <span className="leader" aria-hidden="true" />
                <span className="step-duration">{formatDuration(entry.durationMin)}</span>
                {entry.notes ? <small>{entry.notes}</small> : null}
              </li>
            ))}
          </ol>
        </div>
      ))}
      <p className="timeline-total">
        <span>{formatTaipei(timeline.bakeOut)} 出爐</span>
        <span>共 {formatDuration(timeline.totalMin)}</span>
      </p>
    </section>
  );
}

function groupByDay(entries: TimelineEntry[]): { day: string; entries: TimelineEntry[] }[] {
  const days: { day: string; entries: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    const day = formatDay(entry.start);
    if (days.at(-1)?.day !== day) days.push({ day, entries: [] });
    days.at(-1)!.entries.push(entry);
  }
  return days;
}
