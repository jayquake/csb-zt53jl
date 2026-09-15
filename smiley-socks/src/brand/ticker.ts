/*
 * One animation loop for the whole page.
 *
 * A dozen faces on the home page means a dozen animated things; a dozen
 * requestAnimationFrame loops would mean a dozen wake-ups per frame on a
 * phone. Everything subscribes to this instead, so there is exactly one loop,
 * and it stops itself when nothing is listening or the tab is in the
 * background.
 */

type Subscriber = (elapsedMs: number) => void;

const subscribers = new Set<Subscriber>();
let frame: number | null = null;
let startedAt = 0;
let elapsed = 0;

function tick(now: number) {
  // Time is accumulated rather than read from the clock, so a backgrounded tab
  // resumes where it left off instead of jumping forward by however long the
  // user was away.
  elapsed += Math.min(100, now - startedAt);
  startedAt = now;
  frame = requestAnimationFrame(tick);
  for (const fn of subscribers) fn(elapsed);
}

function start() {
  if (frame !== null || subscribers.size === 0) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  startedAt = performance.now();
  frame = requestAnimationFrame(tick);
}

function stop() {
  if (frame === null) return;
  cancelAnimationFrame(frame);
  frame = null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
}

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  start();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) stop();
  };
}

/** True when the visitor has asked for less movement. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
