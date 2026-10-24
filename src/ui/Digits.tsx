// A countdown that never jiggles: each character sits centred in its own
// fixed-width slot. Tabular figures would do the same job, but Inter's
// tabular "1" carries a foot serif that reads as a typewriter at large sizes.
// The slots are hidden from assistive technology; the element with
// role="timer" around them carries the time as its label.

export function Digits({ value, className }: { value: string; className?: string }) {
  return (
    <span className={`digits-slots ${className ?? ''}`} aria-hidden="true">
      {[...value].map((ch, i) => (
        <span key={i} className={ch === ':' ? 'slot slot-colon' : 'slot'}>
          {ch}
        </span>
      ))}
    </span>
  );
}
