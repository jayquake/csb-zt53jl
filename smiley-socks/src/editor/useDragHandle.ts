/*
 * Dragging, done once.
 *
 * Three things here are load-bearing on a phone:
 *
 *  - Pointer Events with pointer capture. One code path for finger, stylus and
 *    mouse, and capture means a fast drag that outruns the handle keeps
 *    tracking instead of dropping the moment the finger leaves the 44px dot.
 *  - getScreenCTM().inverse() to convert client coordinates into SVG user
 *    space. The preview is fluid — its on-screen size changes with the
 *    viewport, browser zoom and text scaling — so any drag built on pixel
 *    deltas would drift the moment the layout is not 1:1.
 *  - Moves are coalesced onto one animation frame. A finger can emit pointer
 *    events faster than React can re-render a face; without this, a quick pull
 *    queues renders it can never catch up on.
 */

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

export interface Point {
  x: number;
  y: number;
}

/** Convert a client point into the SVG's own coordinate system. */
export function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export interface DragOptions {
  svgRef: RefObject<SVGSVGElement | null>;
  onDragStart?(id: string): void;
  onDrag(id: string, point: Point): void;
  onDragEnd?(id: string): void;
}

export function useDragHandle({ svgRef, onDragStart, onDrag, onDragEnd }: DragOptions) {
  const frame = useRef<number | null>(null);
  const queued = useRef<{ id: string; point: Point } | null>(null);
  const dragging = useRef<string | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    const next = queued.current;
    queued.current = null;
    if (next) onDrag(next.id, next.point);
  }, [onDrag]);

  const schedule = useCallback(
    (id: string, point: Point) => {
      queued.current = { id, point };
      if (frame.current === null) frame.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const handlers = useCallback(
    (id: string) => ({
      onPointerDown: (e: ReactPointerEvent<SVGElement>) => {
        // Stop the browser turning the drag into a scroll or a text selection.
        // touch-action: none in CSS covers touch; this covers the rest.
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = id;
        onDragStart?.(id);
        const svg = svgRef.current;
        if (svg) onDrag(id, clientToSvg(svg, e.clientX, e.clientY));
      },
      onPointerMove: (e: ReactPointerEvent<SVGElement>) => {
        if (dragging.current !== id) return;
        const svg = svgRef.current;
        if (!svg) return;
        // Read the coordinates now — by the time the frame runs, the event is
        // long gone.
        schedule(id, clientToSvg(svg, e.clientX, e.clientY));
      },
      onPointerUp: (e: ReactPointerEvent<SVGElement>) => {
        if (dragging.current !== id) return;
        dragging.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        if (frame.current !== null) {
          cancelAnimationFrame(frame.current);
          flush();
        }
        onDragEnd?.(id);
      },
      onPointerCancel: (e: ReactPointerEvent<SVGElement>) => {
        if (dragging.current !== id) return;
        dragging.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        onDragEnd?.(id);
      },
    }),
    [flush, onDrag, onDragEnd, onDragStart, schedule, svgRef],
  );

  return { handlers, activeId: dragging };
}
