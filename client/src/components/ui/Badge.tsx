import type * as React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-[#e2e2e8] text-[#46464b] dark:bg-stone-800 dark:text-stone-200',
  success: 'bg-[#d0e9ce] text-[#374c36] dark:bg-emerald-900/40 dark:text-emerald-300',
  warning: 'bg-[#f4e1b7] text-[#524622] dark:bg-amber-900/40 dark:text-amber-300',
  error: 'bg-[#f9dcd7] text-[#58413e] dark:bg-red-900/40 dark:text-red-300',
  info: 'bg-[#d7e4f5] text-[#3c4856] dark:bg-sky-900/40 dark:text-sky-300',
};

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
