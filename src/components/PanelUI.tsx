import type { ReactNode, SelectHTMLAttributes } from 'react';

// Shared building blocks for content inside AppDialog panels, so Settings, Schedules
// and Feedback share the same type scale, spacing and controls.

export function PanelSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold my-0" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {description && (
        <p className="text-sm mt-1 mb-0" style={{ color: 'var(--text-muted)' }}>{description}</p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
      {children}
    </label>
  );
}

// Native select with a custom chevron: the browser's default arrow sits flush against the edge
export function SelectField({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`w-full h-10 appearance-none rounded-lg border pl-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4"
        style={{ color: 'var(--text-muted)' }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}
