import { shekels } from '@/lib/utils';
import type { PricePoint } from '@/lib/types';

/** A price trend indicator, not a chart — deliberately small so it reads at a
 * glance without competing with the price itself. */
export function Sparkline({ history }: { history?: PricePoint[] }) {
  if (!history || history.length < 2) return null;

  const prices = history.map((h) => h.priceIls);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const width = 260;
  const height = 34;

  const points = prices
    .map((price, i) => {
      const x = (i / (prices.length - 1)) * width;
      const y = height - 4 - ((price - min) / range) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const dropped = prices[prices.length - 1] < prices[0];

  return (
    <svg
      className="block mt-2 w-full max-w-[160px] h-6 opacity-85"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Price history: ${shekels(prices[0])} to ${shekels(prices[prices.length - 1])}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke={dropped ? 'var(--color-success)' : 'var(--color-muted-foreground)'}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
