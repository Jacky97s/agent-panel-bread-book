import type { IngredientChange } from '../lib/diff.js';
import { formatNumber, isEditableRow } from '../lib/formula.js';
import type { Ingredient, Leaven, Recipe } from '../lib/types.js';
import { NumberField } from './NumberField.js';

const GROUP_LABEL: Record<Ingredient['group'], string> = {
  flour: '麵粉',
  water: '水',
  milk: '牛奶',
  egg: '蛋',
  salt: '鹽',
  fat: '油脂',
  sugar: '糖',
  yeast: '酵母',
  other: '其他',
};

export function FormulaTable({
  recipe,
  changes,
  selected,
  onToggle,
  onTotalFlour,
  onPercent,
  onGrams,
  onHydration,
  onRoomTemp,
  onLeaven,
}: {
  recipe: Recipe;
  changes: Map<string, IngredientChange>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onTotalFlour: (grams: number) => void;
  onPercent: (id: string, percent: number) => void;
  onGrams: (id: string, grams: number) => void;
  onHydration: (value: number) => void;
  onRoomTemp: (value: number) => void;
  onLeaven: (leaven: Leaven) => void;
}) {
  const flourPercent = recipe.ingredients
    .filter((item) => item.group === 'flour')
    .reduce((sum, item) => sum + item.percent, 0);
  const flourGrams = recipe.ingredients
    .filter((item) => item.group === 'flour')
    .reduce((sum, item) => sum + (item.grams ?? 0), 0);
  const hydration = recipe.hydration ?? recipe.targetHydration;
  const hydrationGap = Math.abs(hydration - recipe.targetHydration) > 0.2;

  return (
    <section className="card" aria-labelledby="formula-heading">
      <div className="card-head formula-head">
        <div>
          <h2 id="formula-heading">烘焙百分比</h2>
          <p>總麵粉是 100%。改下面的總麵粉，每一列的克數一起縮放。</p>
        </div>
        <p className="hydration">
          <strong>{formatNumber(hydration, 2)}%</strong>
          <span>
            {hydrationGap
              ? `實際含水 ${formatNumber(hydration, 2)}%，目標 ${formatNumber(recipe.targetHydration, 2)}%。其他液體已經高過目標。`
              : '含水率含水、酵種的水、牛奶 87%、蛋 75%、奶油 16%。油不算水。'}
          </span>
        </p>
      </div>
      <div className="controls">
        <label>
          總麵粉
          <span className="control">
            <NumberField
              value={recipe.totalFlourG}
              digits={1}
              label="總麵粉"
              onCommit={onTotalFlour}
            />
            <span>克</span>
          </span>
        </label>
        <label>
          目標含水
          <span className="control">
            <NumberField
              value={recipe.targetHydration}
              label="目標含水率"
              onCommit={onHydration}
            />
            <span>%</span>
          </span>
        </label>
        <label>
          室溫
          <span className="control">
            <NumberField
              value={recipe.roomTempC}
              digits={1}
              label="室溫"
              onCommit={onRoomTemp}
            />
            <span>°C</span>
          </span>
        </label>
        <LeavenFields recipe={recipe} onLeaven={onLeaven} />
      </div>
      <table className="formula">
        <caption className="sr-only">烘焙百分比與克數</caption>
        <thead>
          <tr>
            <th scope="col">選取</th>
            <th scope="col">材料</th>
            <th scope="col">%</th>
            <th scope="col">克</th>
          </tr>
        </thead>
        <tbody>
          {recipe.ingredients.map((item) => {
            const change = changes.get(item.id);
            const editable = isEditableRow(item);
            return (
              <tr
                key={item.id}
                className={[change ? 'row-changed' : '', selected.has(item.id) ? 'row-selected' : '']
                  .filter(Boolean)
                  .join(' ')}
                data-changed={change ? 'true' : 'false'}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('input, label')) return;
                  onToggle(item.id);
                }}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    aria-label={`選取${item.name}`}
                    onChange={() => onToggle(item.id)}
                  />
                </td>
                <td>
                  <span className="ingredient-name">{item.name}</span>
                  <span className="ingredient-meta">
                    {GROUP_LABEL[item.group]}
                    {item.role === 'preferment' ? ' · 由酵種算出' : ''}
                    {item.role === 'tangzhong' ? ' · 湯種' : ''}
                    {item.balance && item.group === 'flour' ? ' · 補滿 100%' : ''}
                    {item.balance && item.group !== 'flour' ? ' · 用來對齊含水' : ''}
                    {change?.previousPercent === null ? ' · 新增' : ''}
                  </span>
                </td>
                <td>
                  {change && change.previousPercent !== null ? (
                    <s className="diff-old">{formatNumber(change.previousPercent, 2)}</s>
                  ) : null}
                  <NumberField
                    value={item.percent}
                    label={`${item.name}百分比`}
                    readOnly={!editable}
                    onCommit={(value) => onPercent(item.id, value)}
                  />
                </td>
                <td>
                  {change && change.previousGrams !== null ? (
                    <s className="diff-old">{formatNumber(change.previousGrams, 1)}</s>
                  ) : null}
                  <NumberField
                    value={item.grams ?? 0}
                    digits={1}
                    label={`${item.name}重量`}
                    readOnly={!editable}
                    onCommit={(value) => onGrams(item.id, value)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <td>麵粉合計</td>
            <td>{formatNumber(flourPercent, 2)}%</td>
            <td>{formatNumber(flourGrams, 1)} 克</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function LeavenFields({
  recipe,
  onLeaven,
}: {
  recipe: Recipe;
  onLeaven: (leaven: Leaven) => void;
}) {
  const leaven = recipe.leaven;
  return (
    <div className="leaven">
      <label>
        發酵
        <select
          aria-label="發酵方式"
          value={leaven.kind}
          onChange={(event) => {
            if (event.target.value === 'yeast') {
              onLeaven({ kind: 'yeast', name: '即溶酵母', percent: 0.8 });
              return;
            }
            onLeaven({ kind: 'levain', name: '酸種酵種', inoculation: 20, starterHydration: 100 });
          }}
        >
          <option value="yeast">即溶酵母</option>
          <option value="levain">酸種</option>
        </select>
      </label>
      {leaven.kind === 'yeast' ? (
        <label>
          酵母
          <span className="control">
            <NumberField
              value={leaven.percent}
              label="酵母百分比"
              onCommit={(percent) => onLeaven({ ...leaven, percent })}
            />
            <span>%</span>
          </span>
        </label>
      ) : (
        <>
          <label>
            接種
            <span className="control">
              <NumberField
                value={leaven.inoculation}
                label="酵種接種百分比"
                onCommit={(inoculation) => onLeaven({ ...leaven, inoculation })}
              />
              <span>%</span>
            </span>
          </label>
          <label>
            酵種含水
            <span className="control">
              <NumberField
                value={leaven.starterHydration}
                label="酵種含水率"
                onCommit={(starterHydration) => onLeaven({ ...leaven, starterHydration })}
              />
              <span>%</span>
            </span>
          </label>
        </>
      )}
    </div>
  );
}
