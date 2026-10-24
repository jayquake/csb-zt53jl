import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-medium',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-foreground border-accent-foreground/20',
        score: 'bg-success/15 text-success border-success/30 font-bold',
        source: 'bg-transparent text-muted-foreground border-border',
        warn: 'bg-destructive/15 text-destructive border-destructive/30',
        ok: 'bg-success/15 text-success border-success/30',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
