import { useState, type ReactNode } from 'react';
import { elapsedMs } from '../engine/countdown';
import type { BrowserApp } from '../app/browser';
import type { TimerSnapshot } from '../app/timerStore';
import { useAllSessions } from '../app/useAllSessions';
import { startOfDay, summarizeDay } from '../stats/day';
import { computeRange, type RangeStats } from '../stats/range';
import { DayColumns } from './DayColumns';
import { formatDuration, plural } from './format';
import { Heatmap } from './Heatmap';
import { Segmented } from './Segmented';

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];
const RANGE_KEY = 'epoch.statsRange';

const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const dayLong = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const weekdayName = (weekday: number) => weekdayLong.format(new Date(2026, 0, 4 + weekday)); // 4 Jan 2026 is a Sunday

function readRange(): Range {
  try {
    const saved = Number(localStorage.getItem(RANGE_KEY));
    return (RANGES as readonly number[]).includes(saved) ? (saved as Range) : 30;
  } catch {
    return 30;
  }
}

export function StatsScreen({ app, snapshot }: { app: BrowserApp; snapshot: TimerSnapshot }) {
  const [range, setRange] = useState<Range>(readRange);
  const history = useAllSessions(app);
  const { state, now } = snapshot;

  const choose = (r: Range) => {
    setRange(r);
    try {
      localStorage.setItem(RANGE_KEY, String(r));
    } catch {
      // A remembered range is a convenience only.
    }
  };

  const sessions = history.status === 'ready' ? history.data : history.status === 'error' ? (history.lastGood ?? []) : [];
  const loaded = history.status !== 'loading';
  // Today's figure is the same one the Timer screen shows, running session included.
  const c = state.countdown;
  const liveFocusMs = state.phase === 'focus' && c.status !== 'idle' ? elapsedMs(c, now) : 0;
  const today = sessions.filter((s) => s.startedAt >= startOfDay(now));
  const stats = computeRange(sessions, now, range, summarizeDay(today, liveFocusMs).focusedMs);
  const rangeLabel = `in the last ${range} days`;

  return (
    <>
      <header className="title-row title-row-split">
        <div>
          <h1>Stats</h1>
          <p className="subline">{loaded ? finding(stats, range) : ' '}</p>
        </div>
        <Segmented
          label="Period"
          options={RANGES.map((r) => ({ value: r, label: `${r} days` }))}
          value={range}
          onChange={choose}
        />
      </header>

      {history.status === 'error' && (
        <p className="notice notice-top" role="status">
          Couldn't read your history from this browser.{' '}
          <button type="button" className="btn-inline" onClick={history.reload}>
            Try again
          </button>
        </p>
      )}

      <div className="grid">
        <section className="panel kpis" aria-label={`Totals ${rangeLabel}`}>
          <dl className="figures figures-kpi">
            <Kpi label="Focused" loaded={loaded} value={formatDuration(stats.focusedMs)}>
              <Delta now={stats.focusedMs} before={stats.previous?.focusedMs} range={range} format={formatDuration} />
            </Kpi>
            <Kpi label="Daily average" loaded={loaded} value={formatDuration(stats.dailyAverageMs)}>
              {stats.countedDays < range && sessions.some((s) => s.phase === 'focus') ? (
                <span className="delta">over {plural(stats.countedDays, 'day')} of history</span>
              ) : (
                <Delta now={stats.dailyAverageMs} before={stats.previous?.dailyAverageMs} range={range} format={formatDuration} />
              )}
            </Kpi>
            <Kpi
              label="Completed"
              loaded={loaded}
              value={
                <>
                  {stats.completed}
                  <span className="unit"> {stats.completed === 1 ? 'session' : 'sessions'}</span>
                </>
              }
            >
              <Delta now={stats.completed} before={stats.previous?.completed} range={range} format={String} />
            </Kpi>
            <Kpi
              label="Current streak"
              loaded={loaded}
              value={
                <>
                  {stats.currentStreak}
                  <span className="unit"> {stats.currentStreak === 1 ? 'day' : 'days'}</span>
                </>
              }
            >
              <span className="delta">
                {today.some((s) => s.phase === 'focus' && s.completed)
                  ? 'Today counted'
                  : stats.currentStreak > 0
                    ? 'Finish a session today to extend it'
                    : 'Finish a session today to start one'}
              </span>
            </Kpi>
          </dl>
        </section>

        <section className="panel span-8 chart-panel" aria-labelledby="daily-title">
          <header className="panel-head">
            <h2 id="daily-title" className="panel-title">
              Focus per day
            </h2>
            <span className="panel-meta num">
              {stats.dailyAverageMs > 0 && (
                <>
                  <i className="swatch swatch-reference" aria-hidden="true" />
                  Average {formatDuration(stats.dailyAverageMs)} ·{' '}
                </>
              )}
              Last {range} days
            </span>
          </header>
          <DayColumns totals={stats.days} average={stats.dailyAverageMs} label={`Focus time per day ${rangeLabel}`} />
        </section>

        <section className="panel span-4" aria-labelledby="weekday-title">
          <header className="panel-head">
            <h2 id="weekday-title" className="panel-title">
              By weekday
            </h2>
            <span className="panel-meta">Average per day</span>
          </header>
          <WeekdayList stats={stats} />
        </section>

        <section className="panel span-8" aria-labelledby="hours-title">
          <header className="panel-head">
            <h2 id="hours-title" className="panel-title">
              When you focus
            </h2>
            <span className="panel-meta">Last {range} days</span>
          </header>
          <Heatmap matrix={stats.matrix} rangeLabel={rangeLabel} />
        </section>

        <section className="panel span-4" aria-labelledby="sessions-stats-title">
          <header className="panel-head">
            <h2 id="sessions-stats-title" className="panel-title">
              Sessions
            </h2>
            <span className="panel-meta">Last {range} days</span>
          </header>
          <Completion stats={stats} />
          <dl className="kv">
            <div>
              <dt>Average session</dt>
              <dd className="num">{stats.completed + stats.stoppedEarly ? formatDuration(stats.averageSessionMs) : '—'}</dd>
            </div>
            <div>
              <dt>Best day</dt>
              <dd className="num">
                {stats.bestDay ? `${dayLong.format(stats.bestDay.day)} · ${formatDuration(stats.bestDay.focusedMs)}` : '—'}
              </dd>
            </div>
            <div>
              <dt>Days with focus</dt>
              <dd className="num">
                {stats.activeDays} <span className="unit">of {stats.countedDays}</span>
              </dd>
            </div>
            <div>
              <dt>Longest streak</dt>
              <dd className="num">{plural(stats.longestStreak, 'day')}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}

/** The one line under the title: the period's total and its strongest weekday. */
function finding(stats: RangeStats, range: number): string {
  if (stats.focusedMs === 0) return `No focus time in the last ${range} days yet. Finished sessions show up here.`;
  const best = stats.weekdays.reduce((a, b) => (b.averageMs > a.averageMs ? b : a));
  return `${formatDuration(stats.focusedMs)} focused in the last ${range} days, most on ${weekdayName(best.weekday)}s`;
}

function Kpi(props: { label: string; value: ReactNode; loaded: boolean; children: ReactNode }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd className="num">{props.loaded ? props.value : <span className="skeleton" />}</dd>
      <dd className="kpi-note">{props.loaded ? props.children : null}</dd>
    </div>
  );
}

/** A change against the previous period: more focus is good, so up is green and down is red. */
function Delta(props: { now: number; before?: number; range: number; format: (n: number) => string }) {
  // Nothing to compare with yet: a grey dash where the change would be.
  if (props.before === undefined) return <span className="delta" aria-label="No earlier period to compare">—</span>;
  const diff = props.now - props.before;
  const vs = `vs previous ${props.range} days`;
  // Compare what is displayed, so "+0 m" can't appear in colour.
  if (props.format(Math.abs(diff)) === props.format(0)) return <span className="delta">Same as previous {props.range} days</span>;
  return (
    <span className="delta">
      <span className={diff > 0 ? 'positive' : 'negative'}>
        {diff > 0 ? '+' : '−'}
        {props.format(Math.abs(diff))}
      </span>{' '}
      {vs}
    </span>
  );
}

function WeekdayList({ stats }: { stats: RangeStats }) {
  const max = Math.max(...stats.weekdays.map((w) => w.averageMs));
  return (
    <ol className="barlist">
      {stats.weekdays.map((w) => (
        <li key={w.weekday} className={max > 0 && w.averageMs === max ? 'is-best' : undefined}>
          <span className="barlist-label">{weekdayName(w.weekday)}</span>
          <span className="barlist-value num">{w.count ? formatDuration(w.averageMs) : '—'}</span>
          <span className="barlist-track" aria-hidden="true">
            <span style={{ width: max > 0 ? `${(w.averageMs / max) * 100}%` : 0 }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function Completion({ stats }: { stats: RangeStats }) {
  const total = stats.completed + stats.stoppedEarly;
  const share = total ? stats.completed / total : 0;
  return (
    <div className="completion">
      <div className="completion-head">
        <span>Finished as planned</span>
        <span className="num completion-value">{total ? `${Math.round(share * 100)}%` : '—'}</span>
      </div>
      <div
        className="track"
        role="progressbar"
        aria-label="Sessions finished as planned"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
      >
        <div className="fill fill-focus" style={{ clipPath: `inset(0 ${100 - share * 100}% 0 0 round 999px)` }} />
      </div>
      <div className="ends num">
        <span>{stats.completed} completed</span>
        <span>{stats.stoppedEarly} stopped early</span>
      </div>
    </div>
  );
}
