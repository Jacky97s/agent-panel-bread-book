import { AgentDock, AgentPanelRoot, useAgentState, useCapability } from '@agent-panel/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dismissHighlight, fetchMeta, fetchRecipe, fetchRecipes, updateRecipe, type Meta } from './api.js';
import { AgentChrome } from './components/AgentChrome.js';
import { FormulaTable } from './components/FormulaTable.js';
import { TimelineView } from './components/TimelineView.js';
import type { IngredientChange, RecipeDiff } from './lib/diff.js';
import { formatNumber } from './lib/formula.js';
import type { Leaven, Recipe, RecipeSummary, Schedule } from './lib/types.js';

const PROMPTS = [
  { label: '用剩粉做佛卡夏', text: '用剩下的 300g 麵粉做 75% 含水的佛卡夏' },
  { label: '改成全麥三成', text: '改成全麥三成' },
  { label: '明晚七點出爐', text: '明天晚上 7 點要出爐，幫我排時間' },
];

export function App() {
  return (
    <AgentPanelRoot>
      <Shell />
    </AgentPanelRoot>
  );
}

function Shell() {
  const panel = useAgentState();
  const assistant = useCapability('bread-book');
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [highlight, setHighlight] = useState<RecipeDiff | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const known = useRef(new Set<string>());
  const primed = useRef(false);
  const recipeIdRef = useRef<string | null>(null);
  recipeIdRef.current = recipeId;

  const applyList = useCallback((next: RecipeSummary[]) => {
    setRecipes(next);
    let nextId = recipeIdRef.current;
    if (!primed.current) {
      for (const item of next) known.current.add(item.id);
      primed.current = true;
    } else {
      for (const item of next) {
        if (!known.current.has(item.id) && item.highlight === 'new') {
          nextId = item.id;
          location.hash = item.id;
        }
        known.current.add(item.id);
      }
    }
    if (!nextId || !next.some((item) => item.id === nextId)) {
      const hashed = location.hash.replace('#', '');
      nextId = hashed && next.some((item) => item.id === hashed) ? hashed : (next[0]?.id ?? null);
    }
    recipeIdRef.current = nextId;
    setRecipeId(nextId);
  }, []);

  const loadRecipe = useCallback(async (id: string) => {
    const detail = await fetchRecipe(id);
    if (recipeIdRef.current !== id) return;
    if (document.activeElement?.closest('[data-editor]')) return;
    setRecipe(detail.recipe);
    setHighlight(detail.highlight);
  }, []);

  const reload = useCallback(async () => {
    const body = await fetchRecipes();
    applyList(body.recipes);
    const id = recipeIdRef.current;
    if (id) await loadRecipe(id);
  }, [applyList, loadRecipe]);

  useEffect(() => {
    void fetchMeta()
      .then(setMeta)
      .catch(() => undefined);
    void fetchRecipes()
      .then((body) => applyList(body.recipes))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '讀不到配方'));
  }, [applyList]);

  useEffect(() => {
    if (!recipeId) return;
    setSelected(new Set());
    void loadRecipe(recipeId).catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : '讀不到配方'),
    );
  }, [recipeId, loadRecipe]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.activeElement?.closest('[data-editor]')) return;
      void reload().catch(() => undefined);
    }, 1500);
    return () => clearInterval(timer);
  }, [reload]);

  const results = panel.items.filter((item) => item.kind === 'result').length;
  useEffect(() => {
    if (results) void reload().catch(() => undefined);
  }, [results, reload]);

  const changes = useMemo(() => {
    const map = new Map<string, IngredientChange>();
    for (const change of highlight?.changes ?? []) map.set(change.id, change);
    return map;
  }, [highlight]);

  const selectedRows = useMemo(
    () => recipe?.ingredients.filter((item) => selected.has(item.id)) ?? [],
    [recipe, selected],
  );

  const context = useMemo(() => {
    if (!recipe) return { recipeId: '' };
    return {
      recipeId: recipe.id,
      file: `data/recipes/${recipe.id}.json`,
      ingredientIds: selectedRows.map((item) => item.id).join(','),
      selection: selectedRows.map((item) => `${item.name}（${item.id}）`).join('、'),
    };
  }, [recipe, selectedRows]);

  const banner = highlight?.added
    ? '這份配方是助手剛寫的，黃底列是它放進來的材料。'
    : highlight && highlight.changes.length > 0
      ? `助手改了 ${highlight.changes.length} 列，劃掉的是原本的數字。`
      : null;

  async function commit(op: Parameters<typeof updateRecipe>[1]) {
    if (!recipe) return;
    try {
      const next = await updateRecipe(recipe.id, op);
      setRecipe(next);
      setHighlight(null);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '沒有寫入');
    }
  }

  const shellClass = [
    'shell',
    panel.open ? 'agent-open' : '',
    meta?.subscription && panel.open ? 'has-sub-note' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass}>
      <aside className="sidebar">
        <h1 className="wordmark">麵包配方本</h1>
        <p className="sidebar-note">以烘焙百分比記配方。改總麵粉，所有克數一起縮放。</p>
        <ul className="recipe-list">
          {recipes.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={item.id === recipeId}
                onClick={() => {
                  location.hash = item.id;
                  setRecipeId(item.id);
                }}
              >
                <span className="recipe-title">
                  {item.title}
                  {item.highlight === 'new' ? <em>新</em> : null}
                  {item.highlight === 'edited' ? <em>已改</em> : null}
                </span>
                <span className="recipe-meta">
                  {item.tag}，含水 {formatNumber(item.hydration, 2)}%，
                  {item.leaven === 'levain' ? '酸種' : '酵母'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="prompts">
          <h2>交給助手</h2>
          <p className="selection-note">
            {selectedRows.length > 0
              ? `會一併送出：${selectedRows.map((item) => item.name).join('、')}`
              : recipe
                ? `會一併送出整份「${recipe.title}」。`
                : '先選一份配方。'}
          </p>

          {PROMPTS.map((prompt) => (
            <button
              key={prompt.text}
              type="button"
              disabled={assistant.running}
              onClick={() => void assistant.run(prompt.text, context)}
            >
              {prompt.label}
            </button>
          ))}
        </div>
      </aside>
      <main className="workspace" data-editor>
        {recipe ? (
          <div className="sheet" key={recipe.id}>
            <header className="recipe-hero">
              <h2>{recipe.title}</h2>
              <p>
                {recipe.tag === recipe.title ? '' : `${recipe.tag}，`}
                {recipe.yieldLabel}。{recipe.summary}
              </p>
            </header>
            {error ? <p className="error">{error}</p> : null}
            {banner ? (
              <div className="diff-banner">
                <p>{banner}</p>
                <button type="button" onClick={() => void clearHighlight(recipe.id)}>
                  知道了
                </button>
              </div>
            ) : null}
            <div className="columns">
              <FormulaTable
                recipe={recipe}
                changes={changes}
                selected={selected}
                onToggle={(id) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onTotalFlour={(totalFlourG) => void commit({ op: 'setTotalFlour', totalFlourG })}
                onPercent={(id, percent) => void commit({ op: 'setIngredientPercent', id, percent })}
                onGrams={(id, grams) => void commit({ op: 'setIngredientGrams', id, grams })}
                onHydration={(targetHydration) => void commit({ op: 'setHydration', targetHydration })}
                onRoomTemp={(roomTempC) => void commit({ op: 'setRoomTemp', roomTempC })}
                onLeaven={(leaven: Leaven) => void commit({ op: 'setLeaven', leaven })}
              />
              <TimelineView
                recipe={recipe}
                scheduleChanged={Boolean(highlight?.scheduleChanged)}
                onSchedule={(schedule: Schedule) => void commit({ op: 'setSchedule', schedule })}
              />
            </div>
          </div>
        ) : (
          <p className="empty">{error ?? '還沒有配方。'}</p>
        )}
      </main>
      {meta ? <AgentChrome meta={meta} /> : null}
      <AgentDock capabilityId="bread-book" context={context} />
    </div>
  );

  function clearHighlight(id: string) {
    setHighlight(null);
    return dismissHighlight(id).catch(() => undefined);
  }
}
