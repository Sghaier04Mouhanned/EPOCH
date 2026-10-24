import { useEffect, type ReactNode } from 'react';
import { elapsedMs, remainingMs } from '../engine/countdown';
import { upcoming } from '../engine/schedule';
import type { BrowserApp } from '../app/browser';
import { useDaySessions } from '../app/useDaySessions';
import type { TimerSnapshot } from '../app/timerStore';
import { dailyTotals, startOfDay, streakDays, summarizeDay } from '../stats/day';
import { DayStrip, type LiveBlock } from './DayStrip';
import { PHASE_LABEL, formatCountdown, formatDay, formatDuration, formatTime, plural } from './format';
import { WeekChart } from './WeekChart';

const LIST_LIMIT = 5;

export function TimerScreen({ app, snapshot }: { app: BrowserApp; snapshot: TimerSnapshot }) {
  const { store } = app;
  const { state, settings, now } = snapshot;
  const c = state.countdown;
  const plan = upcoming(state, settings, now, 4);
  const next = plan[1]!;
  const left = remainingMs(c, now);
  const progress = c.status === 'idle' ? 0 : elapsedMs(c, now) / c.durationMs;
  const isFocus = state.phase === 'focus';

  const primary =
    c.status === 'running'
      ? { label: 'Pause', run: store.pause }
      : c.status === 'paused'
        ? { label: 'Resume', run: store.resume }
        : { label: isFocus ? 'Start focus' : 'Start break', run: store.start };

  // Space starts, pauses and resumes, unless a control has focus (it handles Space itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('button, a, input, select, textarea, [contenteditable]')) return;
      e.preventDefault();
      primary.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const position = isFocus
    ? `Session ${state.completedInCycle + 1} of ${settings.longBreakEvery}`
    : state.phase === 'longBreak'
      ? `Cycle of ${plural(settings.longBreakEvery, 'session')} done`
      : `${plural(state.completedInCycle, 'session')} done this cycle`;
  const status =
    c.status === 'running'
      ? `ends at ${formatTime(c.endsAt)}`
      : c.status === 'paused'
        ? 'paused'
        : `${PHASE_LABEL[next.phase].toLowerCase()} next`;

  return (
    <>
      <header className="title-row">
        <h1>{PHASE_LABEL[state.phase]}</h1>
        <p className="subline">
          {position} · {status}
        </p>
      </header>

      <div className="grid">
        <section className="panel countdown" aria-label="Countdown">
          <p className={`digits num${c.status === 'paused' ? ' is-paused' : ''}`} role="timer" aria-live="off">
            {formatCountdown(left)}
          </p>

          <div className="progress">
            <div
              className="track"
              role="progressbar"
              aria-label={`${PHASE_LABEL[state.phase]} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <div className={`fill ${isFocus ? 'fill-focus' : 'fill-break'}`} style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="ends num">
              <span>{c.status === 'idle' ? 'Not started' : `Started ${formatTime(c.startedAt)}`}</span>
              <span>
                {c.status === 'idle' ? formatDuration(c.durationMs) : `Ends ${formatTime(plan[0]!.endsAt)}`}
              </span>
            </div>
          </div>

          <div className="controls">
            <button type="button" className="btn btn-primary" onClick={primary.run} aria-keyshortcuts="Space">
              {primary.label}
            </button>
            <button type="button" className="btn btn-secondary" onClick={store.skip}>
              Skip to {PHASE_LABEL[next.phase].toLowerCase()}
            </button>
            {c.status !== 'idle' && (
              <button type="button" className="btn btn-text" onClick={store.reset}>
                Reset
              </button>
            )}
            <span className="hint">Space to {primary.label.toLowerCase().replace(/ (focus|break)$/, '')}</span>
          </div>
        </section>

        <section className="panel upnext" aria-labelledby="upnext-title">
          <h2 id="upnext-title" className="panel-title">
            Up next
          </h2>
          <ol className="rows">
            {plan.map((p, i) => (
              <li key={p.startsAt} className={`row-card${i === 0 ? ' is-current' : ''}`}>
                <i className={`dot ${p.phase === 'focus' ? 'dot-focus' : 'dot-break'}`} aria-hidden="true" />
                <span className="row-main">
                  <span className="row-label">
                    {PHASE_LABEL[p.phase]}
                    {p.focusNumber !== undefined && <span className="row-meta"> {p.focusNumber} of {settings.longBreakEvery}</span>}
                  </span>
                  <span className="row-sub">{i === 0 ? (c.status === 'idle' ? 'Ready' : 'Now') : formatDuration(p.durationMs)}</span>
                </span>
                <span className="row-time num">
                  {formatTime(p.startsAt)}–{formatTime(p.endsAt)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <HistoryPanels app={app} snapshot={snapshot} />
      </div>
    </>
  );
}

function HistoryPanels({ app, snapshot }: { app: BrowserApp; snapshot: TimerSnapshot }) {
  const { state, now } = snapshot;
  const history = useDaySessions(app, now);
  const c = state.countdown;
  const dayStart = startOfDay(now);

  const live: LiveBlock | undefined =
    c.status === 'idle' || c.startedAt < dayStart
      ? undefined
      : {
          startedAt: c.startedAt,
          elapsedEnd: c.status === 'running' ? Math.min(now, c.endsAt) : now,
          endsAt: c.status === 'running' ? c.endsAt : now + c.remainingMs,
          isFocus: state.phase === 'focus',
        };
  const liveFocusMs = state.phase === 'focus' && c.status !== 'idle' ? elapsedMs(c, now) : 0;

  const data = history.status === 'ready' ? history.data : history.status === 'error' ? history.lastGood : undefined;
  const today = data?.today ?? [];
  // One variable for today's focus time: the figure, today's column and the week total all read it.
  const summary = summarizeDay(today, liveFocusMs);
  const streak = data ? streakDays(data.recent, now) : 0;
  const week = dailyTotals(data?.recent ?? [], now, 7, summary.focusedMs);
  const weekTotal = week.reduce((sum, d) => sum + d.focusedMs, 0);
  const latest = [...today].reverse().slice(0, LIST_LIMIT);
  const figure = (value: ReactNode) => (data ? value : <span className="skeleton" />);

  return (
    <>
      <section className="panel today" aria-labelledby="today-title">
        <header className="panel-head">
          <h2 id="today-title" className="panel-title">
            Today
          </h2>
          <span className="panel-meta">{formatDay(now)}</span>
        </header>

        <dl className="figures">
          <div>
            <dt>Focused</dt>
            <dd className="num">{figure(formatDuration(summary.focusedMs))}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd className="num">
              {figure(
                <>
                  {summary.completed}
                  <span className="unit"> {summary.completed === 1 ? 'session' : 'sessions'}</span>
                </>,
              )}
            </dd>
          </div>
          <div>
            <dt>Stopped early</dt>
            <dd className="num">{figure(summary.stoppedEarly)}</dd>
          </div>
          <div>
            <dt>Streak</dt>
            <dd className="num">
              {figure(
                <>
                  {streak}
                  <span className="unit"> {streak === 1 ? 'day' : 'days'}</span>
                </>,
              )}
            </dd>
          </div>
        </dl>

        <DayStrip sessions={today} live={live} now={now} dayStart={dayStart} />

        {history.status === 'error' && (
          <p className="notice" role="status">
            Couldn't read your history from this browser. The timer still works and keeps saving.
          </p>
        )}
      </section>

      <section className="panel sessions" aria-labelledby="sessions-title">
        <header className="panel-head">
          <h2 id="sessions-title" className="panel-title">
            Sessions today
          </h2>
          {today.length > 0 && (
            <a className="link" href="#/stats">
              {today.length > LIST_LIMIT ? `View all ${today.length}` : 'View in stats'}
            </a>
          )}
        </header>
        {history.status === 'loading' ? (
          <ul className="session-list" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="session">
                <span className="skeleton wide" />
              </li>
            ))}
          </ul>
        ) : latest.length === 0 ? (
          <p className="empty">No sessions yet today. Each one you finish or stop appears here and on the timeline.</p>
        ) : (
          <ul className="session-list">
            {latest.map((s) => (
              <li key={`${s.startedAt}-${s.phase}`} className="session">
                <span className="session-phase">
                  <i className={`dot ${s.phase === 'focus' ? 'dot-focus' : 'dot-break'}`} aria-hidden="true" />
                  {PHASE_LABEL[s.phase]}
                </span>
                <span className="session-time num">
                  {formatTime(s.startedAt)}–{formatTime(s.endedAt)}
                </span>
                <span className="session-length num">
                  {formatDuration(s.actualMs)}
                  {!s.completed && <span className="session-note">stopped early</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel week-panel" aria-labelledby="week-title">
        <header className="panel-head">
          <h2 id="week-title" className="panel-title">
            Last 7 days
          </h2>
          <span className="panel-meta num">{data ? `${formatDuration(weekTotal)} focused` : ''}</span>
        </header>
        <WeekChart totals={week} />
      </section>
    </>
  );
}
