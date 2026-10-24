// Today as a time axis, with each session drawn at its real start and length.
// Positioned HTML rather than SVG, so labels keep their size at every width.

import type { SessionRecord } from '../engine/pomodoro';
import { formatTime } from './format';
import { useWidth } from './useWidth';

export interface LiveBlock {
  startedAt: number;
  /** Time counted down so far, drawn solid; the rest of the plan is dashed. */
  elapsedEnd: number;
  endsAt: number;
  isFocus: boolean;
}

type Kind = 'focus' | 'early' | 'break' | 'planned';

const KIND_LABEL: Record<Kind, string> = {
  focus: 'Focus',
  early: 'Stopped early',
  break: 'Break',
  planned: 'Planned',
};

const HOUR = 3_600_000;
const MIN_SPAN = 6 * HOUR;
/** Room one time label needs, e.g. "12:00 PM" at 12px plus air. */
const LABEL_PX = 76;

function kindOf(s: SessionRecord): Kind {
  if (s.phase !== 'focus') return 'break';
  return s.completed ? 'focus' : 'early';
}

/** The visible window: whole hours around the day's sessions and now, at least six hours wide. */
export function axisRange(sessions: SessionRecord[], now: number, live: LiveBlock | undefined, dayStart: number) {
  const dayEnd = dayStart + 24 * HOUR;
  const starts = [now, ...sessions.map((s) => s.startedAt), ...(live ? [live.startedAt] : [])];
  const ends = [now, ...sessions.map((s) => s.endedAt), ...(live ? [live.endsAt] : [])];
  let from = Math.max(dayStart, Math.floor(Math.min(...starts) / HOUR) * HOUR);
  let to = Math.min(dayEnd, Math.ceil(Math.max(...ends) / HOUR) * HOUR);
  if (to - from < MIN_SPAN) {
    to = Math.min(dayEnd, from + MIN_SPAN);
    from = Math.max(dayStart, to - MIN_SPAN);
  }
  return { from, to };
}

export function DayStrip(props: {
  sessions: SessionRecord[];
  live?: LiveBlock;
  now: number;
  dayStart: number;
}) {
  const { sessions, live, now, dayStart } = props;
  const { from, to } = axisRange(sessions, now, live, dayStart);
  const span = to - from;
  const x = (t: number) => `${((Math.min(Math.max(t, from), to) - from) / span) * 100}%`;
  const w = (a: number, b: number) => `${(Math.max(0, Math.min(b, to) - Math.max(a, from)) / span) * 100}%`;

  // As many hourly labels as fit; a coarser whole-hour step when they don't.
  const [ref, width] = useWidth<HTMLElement>();
  const hours = span / HOUR;
  const fit = width > 0 ? Math.max(2, Math.floor(width / LABEL_PX)) : 8;
  const step = [1, 2, 3, 4, 6].find((h) => Math.floor(hours / h) + 1 <= fit) ?? 6;
  const ticks: number[] = [];
  for (let t = from; t <= to; t += step * HOUR) ticks.push(t);

  const kinds = new Set<Kind>(sessions.map(kindOf));
  if (live?.isFocus) kinds.add('focus');
  if (live && !live.isFocus) kinds.add('break');
  if (live) kinds.add('planned');

  return (
    <figure ref={ref} className="strip" aria-label="Today's sessions on a timeline">
      {kinds.size > 0 && (
        <figcaption className="legend">
          {(['focus', 'early', 'break', 'planned'] as const)
            .filter((k) => kinds.has(k))
            .map((k) => (
              <span key={k}>
                <i className={`swatch block-${k}`} aria-hidden="true" />
                {KIND_LABEL[k]}
              </span>
            ))}
        </figcaption>
      )}
      <div className="strip-track">
        {sessions.map((s) => (
          <span
            key={`${s.startedAt}-${s.phase}`}
            className={`block block-${kindOf(s)}`}
            style={{ left: x(s.startedAt), width: w(s.startedAt, s.endedAt) }}
            title={`${KIND_LABEL[kindOf(s)]} · ${formatTime(s.startedAt)}–${formatTime(s.endedAt)}`}
          />
        ))}
        {live && (
          <>
            <span
              className="block block-planned"
              style={{ left: x(live.startedAt), width: w(live.startedAt, live.endsAt) }}
            />
            <span
              className={`block ${live.isFocus ? 'block-focus' : 'block-break'}`}
              style={{ left: x(live.startedAt), width: w(live.startedAt, live.elapsedEnd) }}
            />
          </>
        )}
        <span className="now-line" style={{ left: x(now) }} aria-hidden="true" />
      </div>
      <div className="strip-axis num" aria-hidden="true">
        {ticks.map((t, i) => (
          <span
            key={t}
            style={{ left: x(t) }}
            className={i === 0 ? 'first' : i === ticks.length - 1 && t === to ? 'last' : undefined}
          >
            {formatTime(t)}
          </span>
        ))}
      </div>
    </figure>
  );
}
