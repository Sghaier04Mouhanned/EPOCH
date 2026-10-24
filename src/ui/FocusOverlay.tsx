// While a focus session runs, the countdown fills the whole window with one
// control: Pause. Pausing (or the session ending) returns the normal screen.

import { useEffect, useRef } from 'react';
import { remainingMs } from '../engine/countdown';
import type { PomodoroState } from '../engine/pomodoro';
import type { TimerStore } from '../app/timerStore';
import { Digits } from './Digits';
import { formatCountdown } from './format';

export const isFocusRunning = (state: PomodoroState) =>
  state.phase === 'focus' && state.countdown.status === 'running';

export function FocusOverlay(props: { store: TimerStore; state: PomodoroState; now: number; leaving: boolean }) {
  const { store, state, now, leaving } = props;
  const pause = useRef<HTMLButtonElement>(null);
  const time = formatCountdown(remainingMs(state.countdown, now));

  // Take focus and stop the page behind from scrolling; give both back on the way out.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // No focus ring for this programmatic move (a mouse click on Start should not leave one).
    pause.current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    document.body.classList.add('is-locked');
    return () => {
      document.body.classList.remove('is-locked');
      previous?.focus({ preventScroll: true });
    };
  }, []);

  // Space pauses. On the focused button the browser already turns Space into a click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      store.pause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  return (
    <div
      className={`focus-overlay${leaving ? ' is-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Focus session"
    >
      <p className={`focus-digits${time.length > 5 ? ' has-hours' : ''}`} role="timer" aria-live="off" aria-label={time}>
        <Digits value={time} />
      </p>
      <button ref={pause} type="button" className="btn btn-primary focus-pause" onClick={store.pause} aria-keyshortcuts="Space">
        Pause
      </button>
    </div>
  );
}
