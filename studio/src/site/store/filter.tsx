'use client';

import { Children, isValidElement, useState } from 'react';

/** Category buttons over a product grid; each child carries data-cat. */
export function CategoryFilter({ categories, className, children }: { categories: string[]; className: string; children: React.ReactNode }) {
  const [active, setActive] = useState('');
  const items = Children.toArray(children).filter((c) => !active || (isValidElement(c) && (c.props as Record<string, unknown>)['data-cat'] === active));
  return (
    <div className="flex flex-col gap-6">
      <div role="group" aria-label="Categories" className="flex flex-wrap gap-2">
        {['', ...categories].map((c) => (
          <button
            key={c || 'all'}
            type="button"
            aria-pressed={active === c}
            onClick={() => setActive(c)}
            className={`min-h-10 cursor-pointer rounded-site-button border px-4 text-[0.9em] font-semibold ${
              active === c ? 'border-site-primary bg-site-primary text-site-on-primary' : 'border-current/20 hover:border-current/50'
            }`}
          >
            {c || 'All'}
          </button>
        ))}
      </div>
      <div className={className}>{items}</div>
    </div>
  );
}
