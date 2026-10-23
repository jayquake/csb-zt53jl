/*
 * A face that moves: the animation pipeline wired to the shared ticker and to
 * whether the thing is actually on screen.
 */

import { startTransition, useEffect, useRef, useState } from 'react';
import { faceAt, BOIL_FPS, type AnimationSpec, type ReelFrame } from './animation';
import { prefersReducedMotion, subscribe } from './ticker';
import { FaceSvg } from './Face';

/**
 * Drive a face from the shared clock.
 *
 * React renders are throttled to a frame rate, not to rAF: a morph is smooth
 * enough at 24fps, and a face that is only wobbling needs no more than the
 * boil's own 8fps. On the home page that is the difference between ~12 and
 * ~700 renders a second.
 */
export function useFaceAnimation(spec: AnimationSpec, active = true): ReelFrame {
  const still = faceAt({ ...spec, blink: false, boil: 0 }, 0);
  const [frame, setFrame] = useState<ReelFrame>(still);
  const specRef = useRef(spec);
  specRef.current = spec;

  const moving = spec.faces.length > 1;
  const fps = moving ? 24 : BOIL_FPS;

  useEffect(() => {
    // A visitor who has asked for reduced motion gets the first pose, held.
    if (!active || prefersReducedMotion()) {
      setFrame(faceAt({ ...specRef.current, blink: false, boil: 0 }, 0));
      return;
    }
    let last = -Infinity;
    const interval = 1000 / fps;
    return subscribe((elapsed) => {
      if (elapsed - last < interval) return;
      last = elapsed;
      // Low priority: this fires continuously for as long as the face is on
      // screen, and nothing about it is urgent. Marking it a transition lets
      // a real interaction elsewhere on the page — clicking a link, say —
      // preempt it instead of the animation's own next tick winning the race
      // every time and the interaction never getting a frame to land in.
      startTransition(() => {
        setFrame(faceAt(specRef.current, elapsed));
      });
    });
  }, [active, fps]);

  return frame;
}

/** True once the element has been on screen — used to keep off-screen faces still. */
export function useOnScreen<T extends Element>(ref: React.RefObject<T | null>): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '80px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return visible;
}

export function AnimatedFace({
  spec,
  className,
  title,
  padding,
}: {
  spec: AnimationSpec;
  className?: string;
  title?: string;
  padding?: number;
}) {
  const wrap = useRef<HTMLSpanElement>(null);
  const onScreen = useOnScreen(wrap);
  const { face } = useFaceAnimation(spec, onScreen);

  return (
    <span ref={wrap} className="animface">
      <FaceSvg face={face} className={className} title={title} padding={padding} />
    </span>
  );
}
