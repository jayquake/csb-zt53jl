/*
 * The reel.
 *
 * Straight off the back of an envelope: a row of the same face drawn over and
 * over with the mouth and eyes changed a little each time, playing back as one
 * face moving. The strip is the frames, the big one is the playhead.
 */

import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { FaceSvg } from '../brand/Face';
import { useFaceAnimation, useOnScreen } from '../brand/AnimatedFace';
import { templateById, type Template } from '../brand/templates';

/** A day, roughly. Not a mood scale — an order that reads like hours passing. */
const REEL = ['relieved', 'silly', 'queasy', 'sly', 'curious', 'melancholy', 'shy', 'unbothered'];

export function Reel() {
  const frames = REEL.map((id) => templateById(id)).filter(Boolean) as Template[];
  const stage = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(stage);
  const { face, index } = useFaceAnimation(
    {
      faces: frames.map((f) => f.face),
      dwellMs: 1500,
      morphMs: 560,
      blink: true,
      boil: 0.85,
    },
    onScreen,
  );
  const current = frames[index] ?? frames[0];

  return (
    <section className="reel">
      <h2 className="section__title">One face, all day</h2>
      <p className="section__lede">
        Same face, redrawn. Nobody holds one expression from morning to night, and the sock you pick is
        whichever frame you're on.
      </p>

      <div className="reel__stage" ref={stage}>
        <div className="reel__playhead">
          <FaceSvg face={face} className="reel__big" title="A face moving through the moods of one day" />
          {/* The caption changes every couple of seconds — announcing it would
              make a screen reader talk over everything else on the page. */}
          <p className="reel__caption" aria-hidden="true">
            <strong>{current.name}</strong> — {current.blurb}
          </p>
        </div>

        <ol className="reel__strip">
          {frames.map((f, i) => (
            <li key={f.id} className={`reel__frame${i === index ? ' is-on' : ''}`}>
              <Link to={`/studio?start=${f.id}`} className="reel__framelink" aria-label={`${f.name} — open in studio`}>
                <FaceSvg face={f.face} className="reel__framefaces" title={f.name} />
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
