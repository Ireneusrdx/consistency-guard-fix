import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownProps {
  id?: string;
  label?: string;
  /** Screen-reader label when no visible label is used. */
  ariaLabel?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
}

/**
 * Fully custom dropdown — the native <select> popup is OS-rendered (white on
 * Windows) and breaks the dark theme. This renders its own themed menu:
 * dark card, readable contrast, keyboard navigable (arrows/enter/escape).
 */
export const Dropdown = forwardRef<HTMLButtonElement, DropdownProps>(function Dropdown(
  { id, label, ariaLabel, value, options, onChange, placeholder, disabled, error, className },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const selectId = id ?? `dropdown-${autoId.replace(/:/g, '')}`;
  const selected = options.find((o) => o.value === value);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  // Keep the active option visible while navigating.
  useEffect(() => {
    if (open) {
      listRef.current
        ?.querySelector(`[data-index="${activeIndex}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onButtonKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
      setOpen(true);
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) choose(opt.value);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {label && (
        <label
          htmlFor={selectId}
          className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-200"
        >
          {label}
        </label>
      )}
      <button
        ref={ref}
        type="button"
        id={selectId}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onButtonKeyDown}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm',
          'border-stone-700 bg-stone-900 text-stone-100',
          'hover:border-stone-500',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500',
          'disabled:pointer-events-none disabled:opacity-50',
          error && 'border-red-400 dark:border-red-500',
          !selected && 'text-stone-400 dark:text-stone-500',
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder ?? 'Select…'}</span>
        <svg
          aria-hidden="true"
          className={cn(
            'h-4 w-4 shrink-0 text-stone-400 transition-transform dark:text-stone-500',
            open && 'rotate-180',
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={label ?? ariaLabel ?? 'Options'}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-stone-700 bg-stone-900 p-1 shadow-xl shadow-black/40"
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-stone-500">No options</div>
          )}
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isActive = i === activeIndex;
            return (
              <div
                key={opt.value || `opt-${i}`}
                role="option"
                aria-selected={isSelected}
                data-index={i}
                onClick={() => choose(opt.value)}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm',
                  isActive ? 'bg-stone-600 text-white' : 'text-stone-200',
                  isSelected && !isActive && 'text-white',
                )}
              >
                <span className={cn('truncate', isSelected && 'font-medium')}>{opt.label}</span>
                {isSelected && (
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
});
