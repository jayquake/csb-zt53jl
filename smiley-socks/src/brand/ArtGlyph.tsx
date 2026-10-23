/*
 * Recolouring a reference drawing to the current ink, outside SVG.
 *
 * The parametric renderer never had this problem — `stroke="currentColor"`
 * means a face just inherits whatever ink the sock (or the page, in dark
 * mode) is using. A reference-sheet drawing is a flat raster image with its
 * own baked-in colour, so without help it stays that fixed colour forever:
 * near-invisible on a dark sock, near-invisible in dark mode, wrong on
 * anything but the exact tone it was cleaned to.
 *
 * `feFlood flood-color="currentColor"` looks like the obvious fix for this
 * inside SVG, and doesn't work — a filter primitive isn't part of the
 * element it's applied to, so browsers don't resolve currentColor through
 * it (checked directly; it renders as a fixed colour regardless of ink).
 * Sock.tsx's own `<image>` uses a `<mask>` instead, which doesn't have that
 * problem. This component is the same idea for plain HTML `<img>` contexts
 * — a template chip, a gallery card — where there's no SVG `<mask>` to
 * reach for: the drawing becomes a CSS mask, and `currentColor` fills the
 * shape it cuts out.
 */

export function ArtGlyph({ src, className }: { src: string; className?: string }) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}
