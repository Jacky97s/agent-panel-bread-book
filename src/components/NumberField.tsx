import { useEffect, useRef, useState } from 'react';
import { formatNumber } from '../lib/formula.js';

export function NumberField({
  value,
  digits = 2,
  label,
  readOnly = false,
  onCommit,
}: {
  value: number;
  digits?: number;
  label: string;
  readOnly?: boolean;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(() => formatNumber(value, digits));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(formatNumber(value, digits));
  }, [value, digits]);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      readOnly={readOnly}
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        focused.current = false;
        const next = Number(text);
        if (!Number.isFinite(next)) {
          setText(formatNumber(value, digits));
          return;
        }
        if (next !== value) onCommit(next);
        else setText(formatNumber(value, digits));
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
