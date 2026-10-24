// A segmented switch: equal-width options and one highlight that slides to
// the chosen one. The selection is shown by brightness, never by the accent.

export function Segmented<T extends string | number>(props: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { options, value } = props;
  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={props.label}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        className="segmented-highlight"
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          transform: `translateX(${options.findIndex((o) => o.value === value) * 100}%)`,
        }}
        aria-hidden="true"
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
