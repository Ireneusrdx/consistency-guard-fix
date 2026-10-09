/**
 * SampleDataBanner — slim dismissible notice shown when the visible
 * evaluations include seeded "[Sample data]" rows. Keeps preview data
 * honest: it never masquerades as live model output.
 */
import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Icon } from './ui';

const STORAGE_KEY = 'cg_sample_banner_dismissed';
export const SAMPLE_TAG = '[Sample data]';

export function hasSampleData(items: Array<{ summary?: string | null }>): boolean {
  return items.some((e) => e.summary?.startsWith(SAMPLE_TAG));
}

export default function SampleDataBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  const dismiss = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-xl border border-amber-200/70 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <Icon name="info" className="h-4 w-4 shrink-0" />
      <p className="flex-1">
        <span className="font-semibold">Sample data.</span> These results were generated for preview — run a live
        evaluation to replace them with real data.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss sample data notice"
        className="rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-900/40"
      >
        <XMarkIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
