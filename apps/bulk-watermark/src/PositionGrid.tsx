import { useId } from 'react';
import type { Anchor } from './layout';

const ROWS = ['Top', 'Middle', 'Bottom'] as const;
const COLS = ['left', 'centre', 'right'] as const;

export function PositionGrid({ value, onChange, disabled }: { value: Anchor; onChange: (a: Anchor) => void; disabled?: boolean }) {
  const name = useId();
  return (
    <fieldset disabled={disabled}>
      <legend>Position{disabled ? ' (not used when tiling)' : ''}</legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 44px)', gap: 4 }} className="seg">
        {([0, 1, 2] as const).flatMap((row) =>
          ([0, 1, 2] as const).map((col) => (
            <label key={`${row}${col}`} style={{ display: 'block' }}>
              <input
                type="radio"
                name={name}
                checked={value.row === row && value.col === col}
                onChange={() => onChange({ row, col })}
                aria-label={`${ROWS[row]} ${COLS[col]}`}
              />
              <span style={{ display: 'block', width: 44, height: 44, padding: 0, textAlign: 'center', lineHeight: '42px' }} aria-hidden="true">
                {value.row === row && value.col === col ? '●' : '○'}
              </span>
            </label>
          )),
        )}
      </div>
    </fieldset>
  );
}
