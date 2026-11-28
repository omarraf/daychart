// Release notes shown in the "What's new" popup, one entry per week. Newest first.
// Add a week at the top; `weekOf` is that week's Sunday as YYYY-MM-DD.
// Keep it to changes users would notice, not small polish.

export type ChangeType = 'new' | 'improved' | 'fixed';

export interface ChangelogWeek {
  weekOf: string;
  title: string;
  changes: { type: ChangeType; text: string }[];
}

export const CHANGELOG: ChangelogWeek[] = [
  {
    weekOf: '2026-11-22',
    title: 'Live mode, feedback, and a cleaner dial',
    changes: [
      { type: 'new', text: 'Live mode: turn on Live to see a moving time hand, what you should be doing right now, and a countdown to what is next.' },
      { type: 'new', text: 'Send bugs, ideas and praise straight from the app with the new feedback form.' },
      { type: 'new', text: 'Schedules, Settings and Feedback open as popups, so you never leave your chart.' },
      { type: 'new', text: 'Your schedule name now shows under the toolbar. Click it to switch schedules.' },
      { type: 'improved', text: 'Labels on the dial follow the curve, fit inside their block, and are never upside down. Short blocks get their labels shown inside the ring.' },
      { type: 'improved', text: 'Schedules list: click a card to open it, star one to make it your default.' },
      { type: 'improved', text: 'A cleaner start and end time picker with an AM/PM switch.' },
    ],
  },
];

// Changes whenever a new week is added, which is what re-shows the unread dot
export const LATEST_CHANGELOG_ID = CHANGELOG[0]?.weekOf ?? '';
