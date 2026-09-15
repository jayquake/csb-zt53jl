/*
 * The small shared controls. All of them are chip-shaped and at least 44px
 * tall, because every one of them is used with a thumb first and a mouse
 * second.
 */

export interface Choice {
  id: string;
  name: string;
  blurb?: string;
}

/** Tabs across the top of the studio sheet: Face / Sock / Photo / Text. */
export function SegmentedTabs({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Choice[];
  value: string;
  onChange(id: string): void;
  label: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={value === t.id}
          aria-controls={`panel-${t.id}`}
          className={`segmented__tab${value === t.id ? ' is-on' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}

/**
 * A row of mutually exclusive options. Buttons with aria-checked rather than
 * real radios: the hit areas are big and the styling stays identical across
 * browsers, and the semantics are carried properly by the radiogroup role.
 */
export function ChoiceRow({
  label,
  options,
  value,
  onChange,
  columns,
  swatch,
}: {
  label: string;
  options: Choice[];
  value: string;
  onChange(id: string): void;
  columns?: boolean;
  swatch?(option: Choice): React.ReactNode;
}) {
  const selected = options.find((o) => o.id === value);
  return (
    <div className="choice">
      <div className="choice__head">
        <span className="choice__label">{label}</span>
        {selected?.blurb && <span className="choice__blurb">{selected.blurb}</span>}
      </div>
      <div className={`choice__row${columns ? ' choice__row--grid' : ''}`} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            className={`chip${value === o.id ? ' is-on' : ''}`}
            onClick={() => onChange(o.id)}
          >
            {swatch?.(o)}
            <span>{o.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange(next: number): void;
  label: string;
}) {
  return (
    <div className="stepper">
      <button type="button" className="stepper__btn" onClick={() => onChange(value - 1)} aria-label={`One fewer ${label}`}>
        −
      </button>
      <span className="stepper__value" aria-live="polite">
        {value}
      </span>
      <button type="button" className="stepper__btn" onClick={() => onChange(value + 1)} aria-label={`One more ${label}`}>
        +
      </button>
    </div>
  );
}
