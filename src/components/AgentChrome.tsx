import { useAgentState } from '@agent-panel/react';
import { useEffect, useState } from 'react';
import { fetchMeta, switchAgent, type AgentPreset, type Meta } from '../api.js';

const OPTIONS: { value: AgentPreset; label: string }[] = [
  { value: 'mock', label: '示範代理' },
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'gemini', label: 'Gemini CLI' },
];

export function AgentChrome() {
  const panel = useAgentState();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetchMeta()
      .then(setMeta)
      .catch(() => setError('讀不到代理程式狀態'));
  }, []);
  if (!panel.open || !meta) return null;
  return (
    <div className={`agent-chrome${meta.subscription ? ' has-note' : ''}`}>
      <label>
        代理程式
        <select
          aria-label="代理程式"
          value={meta.preset}
          disabled={meta.locked || switching}
          onChange={(event) => {
            const preset = event.target.value as AgentPreset;
            setSwitching(true);
            void switchAgent(preset).catch((reason: unknown) => {
              setSwitching(false);
              setError(reason instanceof Error ? reason.message : '切換失敗');
            });
          }}
        >
          {OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {meta.locked ? <p>由啟動指令指定，這次不會在面板裡切換。</p> : null}
      {switching ? <p>正在切換，頁面會重新載入。</p> : null}
      {meta.subscription ? <p className="sub-note">本次使用你自己的訂閱，額外 API 費用 $0</p> : null}
      {error ? <p className="chrome-error">{error}</p> : null}
    </div>
  );
}
