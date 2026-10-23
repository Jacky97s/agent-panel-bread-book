import { buildTimeline, formatClock, formatDuration, formatTaipei, inputValueToTaipeiISO, toTaipeiInputValue } from '../lib/schedule.js';
import type { Recipe, Schedule } from '../lib/types.js';

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
  const anchorValue = recipe.schedule
    ? toTaipeiInputValue(recipe.schedule.anchor)
    : toTaipeiInputValue(mode === 'bake' ? timeline.bakeOut : timeline.start);

  return (
    <section className="card" aria-labelledby="timeline-heading">
      <div className="card-head">
        <h2 id="timeline-heading">發酵時程</h2>
        <p>
          {mode === 'bake' ? '從出爐時間倒推。' : '從開始時間往後排。'}
          室溫只改自解、一次發酵、二次發酵；冷藏與烘烤不動。
        </p>
      </div>
      {scheduleChanged ? <p className="diff-banner">時程已依新的出爐時間重排。</p> : null}
      <div className="schedule-controls">
        <div className="modes" role="group" aria-label="排程方向">
          <button
            type="button"
            aria-pressed={mode === 'start'}
            onClick={() =>
              onSchedule({
                anchorKind: 'start',
                anchor: inputValueToTaipeiISO(toTaipeiInputValue(timeline.start)) ?? recipe.schedule?.anchor ?? '',
              })
            }
          >
            從開始順推
          </button>
          <button
            type="button"
            aria-pressed={mode === 'bake'}
            onClick={() =>
              onSchedule({
                anchorKind: 'bake',
                anchor: inputValueToTaipeiISO(toTaipeiInputValue(timeline.bakeOut)) ?? recipe.schedule?.anchor ?? '',
              })
            }
          >
            指定出爐
          </button>
        </div>
        <label>
          {mode === 'bake' ? '出爐時間' : '開始時間'}
          <input
            type="datetime-local"
            aria-label={mode === 'bake' ? '出爐時間' : '開始時間'}
            value={anchorValue}
            onChange={(event) => {
              const anchor = inputValueToTaipeiISO(event.target.value);
              if (!anchor) return;
              onSchedule({ anchorKind: mode, anchor });
            }}
          />
        </label>
      </div>
      <p className="timeline-summary">
        <span>{formatTaipei(timeline.start)} 開始</span>
        <span>{formatDuration(timeline.totalMin)}</span>
        <span>{formatTaipei(timeline.bakeOut)} 出爐</span>
      </p>
      <ol className="timeline">
        {timeline.entries.map((entry) => (
          <li key={entry.stepId}>
            <time dateTime={entry.start}>{formatClock(entry.start)}</time>
            <div>
              <strong>{entry.name}</strong>
              <span>{formatDuration(entry.durationMin)}</span>
              {recipe.steps.find((step) => step.id === entry.stepId)?.notes ? (
                <small>{recipe.steps.find((step) => step.id === entry.stepId)?.notes}</small>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
