import { scoreTier, cn } from '@/lib/utils';

const TIER_COLOR: Record<'high' | 'mid' | 'low', string> = {
  high: 'var(--color-success)',
  mid: '#d97706',
  low: 'var(--color-muted-foreground)',
};

/** The match score as a small ring rather than a flat number badge — it is
 * the one figure on a card worth a glance before anything else. */
export function ScoreRing({ score, className }: { score: number; className?: string }) {
  const size = 34;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, score)) / 100) * c;
  const tier = scoreTier(score);

  return (
    <div className={cn('relative shrink-0 grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TIER_COLOR[tier]}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[10px] font-bold tabular-nums">{score}</span>
    </div>
  );
}
