// Focus per day as columns on a round time scale, today's column in the one
// data hue. Seven days get weekday names; longer ranges get a date every few
// columns, always ending on today.

import type { DayTotal } from '../stats/day';
import { formatDuration } from './format';

const MIN = 60_000;
const STEPS = [15, 30, 60, 120, 180, 240].map((m) => m * MIN);
const MAX_TICKS = 6;
const MAX_DATE_LABELS = 6;
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

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

export function DayColumns({ totals, average, label }: { totals: DayTotal[]; average?: number; label: string }) {
  const max = Math.max(...totals.map((t) => t.focusedMs), average ?? 0);
  const { step, top } = scale(max);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const last = totals.length - 1;
  const byWeekday = totals.length <= 7;
  const every = Math.ceil(totals.length / MAX_DATE_LABELS);
  const name = (t: DayTotal, i: number) =>
    i === last ? 'Today' : byWeekday ? weekday.format(t.day) : shortDate.format(t.day);

  return (
    <figure className="week" aria-label={label}>
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
          <ol className="week-bars" style={{ gridTemplateColumns: `repeat(${totals.length}, minmax(0, 1fr))` }}>
            {totals.map((t, i) => (
              <li key={t.day} title={`${name(t, i)}: ${formatDuration(t.focusedMs)}`}>
                <span
                  className={i === last ? 'bar bar-today' : 'bar'}
                  style={{ height: `${(t.focusedMs / top) * 100}%` }}
                />
                <span className="sr-only">
                  {name(t, i)}: {formatDuration(t.focusedMs)}
                </span>
              </li>
            ))}
          </ol>
          {average !== undefined && average > 0 && (
            <div className="reference" style={{ bottom: `${(average / top) * 100}%` }} aria-hidden="true" />
          )}
        </div>
      </div>
      <div className="week-days" style={{ gridTemplateColumns: `repeat(${totals.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {totals.map((t, i) => (
          <span key={t.day} className={i === last ? 'is-today' : undefined}>
            {byWeekday || (last - i) % every === 0 ? name(t, i) : ''}
          </span>
        ))}
      </div>
    </figure>
  );
}
