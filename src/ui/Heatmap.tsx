// Focus time by weekday and hour: one hue, stepping from the panel's own
// raised tone to the full accent. Hours with no focus on any day are trimmed
// from the ends, keeping at least eight hours.

import { formatDuration } from './format';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STEPS = [0.25, 0.5, 0.75, 1];
const MIN_HOURS = 8;
const hourLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });

export function hourWindow(matrix: number[][]): { from: number; to: number } {
  const active = [...Array(24).keys()].filter((h) => matrix.some((row) => (row[h] ?? 0) > 0));
  let from = active.length ? active[0]! : 8;
  let to = active.length ? active[active.length - 1]! + 1 : 16;
  if (to - from < MIN_HOURS) {
    // Widen into the later hours, and back into earlier ones only at midnight.
    to = Math.min(24, from + MIN_HOURS);
    from = Math.min(from, to - MIN_HOURS);
  }
  return { from, to };
}

/** The colour step (0 = empty, 1-4) for a cell's share of the busiest cell. */
export function level(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return STEPS.findIndex((s) => value / max <= s) + 1;
}

export function Heatmap({ matrix, rangeLabel }: { matrix: number[][]; rangeLabel: string }) {
  const { from, to } = hourWindow(matrix);
  const hours = [...Array(to - from).keys()].map((i) => from + i);
  const max = Math.max(...matrix.flat());
  const label = (h: number) => hourLabel.format(new Date(2026, 0, 5, h));

  return (
    <figure className="heatmap" aria-label={`Focus time by weekday and hour, ${rangeLabel}`}>
      <div className="heat-grid" style={{ gridTemplateColumns: `2.5rem repeat(${hours.length}, minmax(0, 1fr))` }}>
        {matrix.map((row, d) => (
          <div key={DAYS[d]} className="heat-row">
            <span className="heat-day">{DAYS[d]}</span>
            {hours.map((h) => (
              <span
                key={h}
                className={`heat-cell level-${level(row[h] ?? 0, max)}`}
                title={`${DAYS[d]} ${label(h)}: ${formatDuration(row[h] ?? 0)} ${rangeLabel}`}
              />
            ))}
          </div>
        ))}
        <span />
        {hours.map((h, i) => (
          <span key={h} className="heat-hour num" aria-hidden="true">
            {i % 3 === 0 ? label(h) : ''}
          </span>
        ))}
      </div>
      <figcaption className="heat-legend">
        <span>Less</span>
        {[1, 2, 3, 4].map((l) => (
          <i key={l} className={`heat-cell level-${l}`} aria-hidden="true" />
        ))}
        <span>More</span>
        <span className="heat-max num">{max > 0 ? `busiest hour ${formatDuration(max)}` : ''}</span>
      </figcaption>
    </figure>
  );
}
