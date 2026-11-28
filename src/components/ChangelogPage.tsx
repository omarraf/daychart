import { CHANGELOG, type ChangeType } from '../constants/changelog';

const TYPE_STYLES: Record<ChangeType, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  improved: { label: 'Improved', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  fixed: { label: 'Fixed', className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
};

function formatWeekOf(weekOf: string) {
  // Parse as a local date so the day doesn't shift across time zones
  const [year, month, day] = weekOf.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `Week of ${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })}`;
}

export default function ChangelogPage() {
  return (
    <div className="rounded-lg border divide-y" style={{ borderColor: 'var(--border)' }}>
      {CHANGELOG.map((week, index) => (
        // Latest week starts open; older weeks collapsed
        <details key={week.weekOf} open={index === 0} className="group" style={{ borderColor: 'var(--border)' }}>
          <summary className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden hover:bg-black/[0.03] dark:hover:bg-white/5">
            <span className="min-w-0">
              <time dateTime={week.weekOf} className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {formatWeekOf(week.weekOf)}
              </time>
              <span className="block text-sm font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>
                {week.title}
              </span>
            </span>
            <svg
              className="w-4 h-4 flex-shrink-0 transition-transform group-open:rotate-180"
              style={{ color: 'var(--text-muted)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <ul className="list-none space-y-2.5 px-4 pb-4 pt-1">
            {week.changes.map((change) => (
              <li key={change.text} className="flex items-start gap-2.5 text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                <span className={`mt-0.5 w-[4.5rem] flex-shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold leading-4 ${TYPE_STYLES[change.type].className}`}>
                  {TYPE_STYLES[change.type].label}
                </span>
                <span>{change.text}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
