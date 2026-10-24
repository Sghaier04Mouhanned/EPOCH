// Focus per day for the last seven days: columns on a round time scale, with
// today's column in the one data hue.

import type { DayTotal } from '../stats/day';
import { formatDuration } from './format';

const MIN = 60_000;
const STEPS = [15, 30, 60, 120, 180, 240].map((m) => m * MIN);
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

const MAX_TICKS = 6;

/**
 * The finest round step that keeps the axis to six ticks or fewer, with the
 * top tick above the tallest column (so it never touches the plot's edge).
 */
export function scale(max: number): { step: number; top: number } {
  for (const step of STEPS) {
    const top = (Math.floor(max / step) + 1) * step;
    if (top / step + 1 <= MAX_TICKS) return { step, top };
  }
  const step = STEPS[STEPS.length - 1]!;
  return { step, top: (Math.floor(max / step) + 1) * step };
}

function tickLabel(ms: number): string {
  if (ms === 0) return '0';
  return ms % (60 * MIN) === 0 ? `${ms / (60 * MIN)} h` : formatDuration(ms);
}

export function WeekChart({ totals }: { totals: DayTotal[] }) {
  const max = Math.max(...totals.map((t) => t.focusedMs));
  const { step, top } = scale(max);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const lastIndex = totals.length - 1;

  return (
    <figure className="week" aria-label="Focus time on each of the last seven days">
      <div className="week-plot">
        <div className="week-ticks num" aria-hidden="true">
          {ticks.map((v) => (
            <span key={v} style={{ bottom: `${(v / top) * 100}%` }}>
              {tickLabel(v)}
            </span>
          ))}
        </div>
        <div className="week-area">
          {ticks.map((v) => (
            <i key={v} className={v === 0 ? 'gridline baseline' : 'gridline'} style={{ bottom: `${(v / top) * 100}%` }} />
          ))}
          <ol className="week-bars">
            {totals.map((t, i) => (
              <li key={t.day} title={`${weekday.format(t.day)}: ${formatDuration(t.focusedMs)}`}>
                <span
                  className={i === lastIndex ? 'bar bar-today' : 'bar'}
                  style={{ height: `${(t.focusedMs / top) * 100}%` }}
                />
                <span className="sr-only">
                  {i === lastIndex ? 'Today' : weekday.format(t.day)}: {formatDuration(t.focusedMs)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="week-days" aria-hidden="true">
        {totals.map((t, i) => (
          <span key={t.day} className={i === lastIndex ? 'is-today' : undefined}>
            {i === lastIndex ? 'Today' : weekday.format(t.day)}
          </span>
        ))}
      </div>
    </figure>
  );
}
