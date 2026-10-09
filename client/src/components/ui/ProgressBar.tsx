import { cn } from '../../lib/utils';

export interface ProgressBarProps {
  value: number;
  label?: string;
  tone?: 'primary' | 'success' | 'warning' | 'error';
}

const toneStyles: Record<NonNullable<ProgressBarProps['tone']>, string> = {
  primary: 'bg-[#25252a]',
  success: 'bg-[#7f977e]',
  warning: 'bg-[#9f8f68]',
  error: 'bg-[#a58b86]',
};

export function ProgressBar({ value, label, tone = 'primary' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div>
      {label && (
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="text-stone-600 dark:text-stone-300">{label}</span>
          <span className="font-medium text-stone-700 dark:text-stone-200">
            {Math.round(pct)}%
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
        className="h-2 w-full rounded-full bg-[#e2e2e8] dark:bg-stone-800"
      >
        <div
          className={cn('h-2 rounded-full transition-all', toneStyles[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
