import { FaceSvg } from '../brand/Face';
import { TEMPLATES } from '../brand/templates';

/**
 * The shelf of starting faces. Horizontally scrollable on a phone with
 * scroll-snap, so it works as a thumb flick rather than a grid that pushes the
 * preview off screen.
 */
export function TemplateStrip({
  value,
  onPick,
}: {
  value: string | null;
  onPick(id: string): void;
}) {
  return (
    <div className="strip">
      <div className="strip__scroll" role="radiogroup" aria-label="Starting face">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value === t.id}
            className={`strip__item${value === t.id ? ' is-on' : ''}`}
            onClick={() => onPick(t.id)}
          >
            <FaceSvg face={t.face} className="strip__face" title={`${t.name}: ${t.blurb}`} />
            <span className="strip__name">{t.name}</span>
          </button>
        ))}
      </div>
      <p className="strip__hint">
        Start somewhere close, then pull it around. Nothing here is the finished thing.
      </p>
    </div>
  );
}
