/*
 * The editing canvas: the face at working size with its grab points on top.
 *
 * The handles are the whole interaction. Sliders would have been less code and
 * a worse product — you should be able to pull a mouth into a frown with a
 * thumb and watch the sock update, not hunt for "mouth curve: -0.42".
 *
 * Every handle is also a real focusable control with arrow-key nudging, so the
 * same edits are possible without a pointer at all.
 */

import { useCallback, useRef, useState } from 'react';
import { FaceGlyph } from '../brand/Face';
import { clampFace, FACE_BOX, type FaceParams } from '../brand/face';
import { nudge, visibleHandles, type Handle } from './handles';
import { useDragHandle } from './useDragHandle';

const PAD = 26;
/** Big enough that the 44px minimum target is met even on a small phone. */
const HIT_RADIUS = 22;

export function FaceEditor({
  face,
  base,
  onChange,
}: {
  face: FaceParams;
  /** The template this design started from — what "reset" means. */
  base: FaceParams;
  onChange(next: FaceParams): void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // Drag callbacks are created once and read the latest props from refs — the
  // hook memoises its handlers, and a new callback every render would defeat it.
  const latest = useRef({ face, base, onChange });
  latest.current = { face, base, onChange };

  const lastTap = useRef<{ id: string; at: number }>({ id: '', at: 0 });

  const handleById = useCallback(
    (id: string): Handle | undefined => visibleHandles(latest.current.face).find((h) => h.id === id),
    [],
  );

  const { handlers } = useDragHandle({
    svgRef,
    onDragStart: useCallback(
      (id: string) => {
        setActive(id);
        const h = handleById(id);
        setHint(h ? `${h.label} — ${h.hint}` : null);

        // Double-tap a handle to put that feature back. 380ms is long enough
        // to be reachable with a thumb and short enough not to fire between
        // two deliberate separate drags.
        const now = Date.now();
        if (lastTap.current.id === id && now - lastTap.current.at < 380 && h) {
          const { face: current, base: template, onChange: emit } = latest.current;
          emit(clampFace(h.reset(current, template)));
          lastTap.current = { id: '', at: 0 };
        } else {
          lastTap.current = { id, at: now };
        }
      },
      [handleById],
    ),
    onDrag: useCallback(
      (id: string, point: { x: number; y: number }) => {
        const h = handleById(id);
        if (!h) return;
        const { face: current, onChange: emit } = latest.current;
        emit(clampFace(h.drag(current, point)));
      },
      [handleById],
    ),
    onDragEnd: useCallback(() => setActive(null), []),
  });

  const onKeyDown = (h: Handle) => (e: React.KeyboardEvent<SVGGElement>) => {
    const step = e.shiftKey ? 8 : 2;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      onChange(clampFace(nudge(h, face, move[0], move[1])));
      setHint(`${h.label} — ${h.hint}`);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange(clampFace(h.reset(face, base)));
      setHint(`${h.label} reset`);
    }
  };

  const handles = visibleHandles(face);

  return (
    <div className="editor">
      <svg
        ref={svgRef}
        className="editor__canvas"
        viewBox={`${-PAD} ${-PAD} ${FACE_BOX + PAD * 2} ${FACE_BOX + PAD * 2}`}
        // Without this a drag scrolls the page on touch instead of moving the
        // handle. It is the single most important line in the editor.
        style={{ touchAction: 'none' }}
        aria-label="Face editor. Each control can also be moved with the arrow keys."
      >
        {/* Clean, deliberately: the editing canvas is where you aim at
            handles, and a wandering chalk edge makes that guesswork. The
            preview above it shows the finish. */}
        <g className="editor__face">
          <FaceGlyph face={face} finish="clean" />
        </g>

        {handles.map((h) => {
          const at = h.at(face);
          const isActive = active === h.id;
          return (
            <g
              key={h.id}
              className={`handle${isActive ? ' handle--active' : ''}`}
              tabIndex={0}
              role="button"
              aria-label={`${h.label}. ${h.hint}. Arrow keys to move, Enter to reset.`}
              onKeyDown={onKeyDown(h)}
              onFocus={() => setHint(`${h.label} — ${h.hint}`)}
              onBlur={() => setHint(null)}
              {...handlers(h.id)}
            >
              {/* Invisible, generous target. The visible dot stays small so it
                  never competes with the face itself. */}
              <circle cx={at.x} cy={at.y} r={HIT_RADIUS} fill="transparent" />
              <circle className="handle__ring" cx={at.x} cy={at.y} r={isActive ? 11 : 8} />
              <circle className="handle__dot" cx={at.x} cy={at.y} r={isActive ? 5.5 : 4} />
            </g>
          );
        })}
      </svg>

      <p className="editor__hint" aria-live="polite">
        {hint ?? 'Grab any dot and pull. Double-tap a dot to put that feature back.'}
      </p>
    </div>
  );
}
