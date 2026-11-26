import { auth } from '../firebase';

// API base URL: Railway in production, local dev server otherwise
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const FEEDBACK_CATEGORIES = [
  'General feedback',
  'Feature request',
  'Bug report',
  'Something I like',
] as const;

export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number];

export interface FeedbackInput {
  category: FeedbackCategory;
  message: string;
  followUp: boolean;
  // Honeypot field — should always be empty for real users
  website: string;
}

function getFeedbackContext() {
  return {
    route: window.location.pathname + window.location.hash,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/**
 * Submit feedback. Signed-in users send their token so feedback is linked to their account;
 * guests can submit anonymously.
 */
export const submitFeedback = async (input: FeedbackInput): Promise<void> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const user = auth.currentUser;
  if (user) {
    headers['Authorization'] = `Bearer ${await user.getIdToken()}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/feedback`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...input, context: getFeedbackContext() }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to send feedback. Please try again.');
  }
};
