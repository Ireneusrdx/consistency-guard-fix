import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { cn } from '../lib/utils';

/**
 * Rich text renderer: Markdown (bold, headings, lists, tables, code) plus
 * LaTeX math ($…$ inline, $$…$$ block) via KaTeX — all themed for the dark UI.
 * Use everywhere model output, claims, or report prose is displayed so raw
 * markdown characters (**x**, ###, | tables |) never leak into the UI.
 */
export function Markdown({ children, className }: { children: string | undefined | null; className?: string }) {
  return (
    <div className={cn('cg-markdown', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ ...props }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0" {...props} />,
          strong: ({ ...props }) => <strong className="font-semibold text-stone-100" {...props} />,
          h1: ({ ...props }) => <h1 className="mb-2 mt-4 text-lg font-semibold text-stone-100 first:mt-0" {...props} />,
          h2: ({ ...props }) => <h2 className="mb-2 mt-4 text-base font-semibold text-stone-100 first:mt-0" {...props} />,
          h3: ({ ...props }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold text-stone-100 first:mt-0" {...props} />,
          h4: ({ ...props }) => <h4 className="mb-1 mt-2 text-sm font-semibold text-stone-200 first:mt-0" {...props} />,
          ul: ({ ...props }) => <ul className="my-2 list-disc space-y-1 pl-5" {...props} />,
          ol: ({ ...props }) => <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />,
          li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
          blockquote: ({ ...props }) => (
            <blockquote className="my-2 border-l-2 border-stone-600 pl-3 text-stone-400" {...props} />
          ),
          code: ({ className: cls, ...props }) => (
            <code
              className={cn('rounded bg-stone-800 px-1.5 py-0.5 font-mono text-[0.85em] text-stone-200', cls)}
              {...props}
            />
          ),
          pre: ({ ...props }) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-stone-900 p-3 text-sm leading-relaxed" {...props} />
          ),
          table: ({ ...props }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm" {...props} />
            </div>
          ),
          thead: ({ ...props }) => <thead className="bg-stone-800/60" {...props} />,
          th: ({ ...props }) => (
            <th className="border border-stone-700 px-3 py-1.5 text-left font-semibold text-stone-200" {...props} />
          ),
          td: ({ ...props }) => <td className="border border-stone-700 px-3 py-1.5 text-stone-300" {...props} />,
          a: ({ ...props }) => <a className="text-blue-400 underline hover:text-blue-300" {...props} />,
          hr: ({ ...props }) => <hr className="my-3 border-stone-700" {...props} />,
        }}
      >
        {children ?? ''}
      </ReactMarkdown>
    </div>
  );
}
