// A countdown that never jiggles: each character sits centred in its own
// fixed-width slot. Tabular figures would do the same job, but Inter's
// tabular "1" carries a foot serif that reads as a typewriter at large sizes.
// A digit that just changed is a new element with the "rolls" class, so it
// drops into place (CSS); nothing animates on the first render. The slots are
// hidden from assistive technology; the element with role="timer" around them
// carries the time.

import { useEffect, useRef } from 'react';

export function Digits({ value, className }: { value: string; className?: string }) {
  const previous = useRef(value);
  const before = previous.current;
  useEffect(() => {
    previous.current = value;
  });

  return (
    <span className={`digits-slots ${className ?? ''}`} aria-hidden="true">
      {[...value].map((ch, i) => {
        const changed = before.length === value.length && before[i] !== ch;
        return (
          <span key={i} className={ch === ':' ? 'slot slot-colon' : 'slot'}>
            <span key={ch} className={changed ? 'slot-char rolls' : 'slot-char'}>
              {ch}
            </span>
          </span>
        );
      })}
    </span>
  );
}
