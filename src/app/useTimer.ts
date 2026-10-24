import { useSyncExternalStore } from 'react';
import type { TimerSnapshot, TimerStore } from './timerStore';

export function useTimer(store: TimerStore): TimerSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
