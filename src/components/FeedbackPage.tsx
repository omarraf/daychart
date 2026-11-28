import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { FEEDBACK_CATEGORIES, submitFeedback, type FeedbackCategory } from '../services/feedbackService';
import { FieldLabel, SelectField } from './PanelUI';

const MAX_MESSAGE_LENGTH = 5000;

type SubmitStatus = 'idle' | 'sending' | 'sent' | 'error';

interface FeedbackPageProps {
  user: User | null;
}

export default function FeedbackPage({ user }: FeedbackPageProps) {
  const [category, setCategory] = useState<FeedbackCategory>('General feedback');
  const [message, setMessage] = useState('');
  const [followUp, setFollowUp] = useState(true);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('sending');
    setError('');

    try {
      await submitFeedback({
        category,
        message: message.trim(),
        followUp: !!user?.email && followUp,
        website,
      });
      setStatus('sent');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send feedback. Please try again.');
      setStatus('error');
    }
  };

  const resetForm = () => {
    setCategory('General feedback');
    setStatus('idle');
  };

  return (
    <div>
      <p className="mt-0 mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
        Found a bug, have a feature idea, or want to share what is working well? I’d love to hear it.
      </p>

      {status === 'sent' ? (
        <div className="py-6 text-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(52,211,153,0.15)', color: '#10b981' }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold my-0" style={{ color: 'var(--text-primary)' }}>
            Thanks for the feedback!
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            {user?.email && followUp
              ? `I read every message and may follow up at ${user.email}.`
              : 'I read every message, and it really helps shape DayChart.'}
          </p>
          <button
            type="button"
            onClick={resetForm}
            className="mt-5 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold border-none"
          >
            Send more feedback
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="relative">
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="feedback-category">What is this about?</FieldLabel>
              <SelectField
                id="feedback-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
              >
                {FEEDBACK_CATEGORIES.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </SelectField>
            </div>

            <div>
              <FieldLabel htmlFor="feedback-message">Your feedback</FieldLabel>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                required
                rows={5}
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder="What’s working, what’s confusing, or what would make DayChart better? For bugs, include what you expected and what happened."
                className="block w-full resize-y rounded-lg border px-3 py-2.5 text-sm leading-relaxed placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              {message.length > MAX_MESSAGE_LENGTH * 0.8 && (
                <p className="mt-1 mb-0 text-xs text-right" style={{ color: 'var(--text-muted)' }}>
                  {message.length} / {MAX_MESSAGE_LENGTH}
                </p>
              )}
            </div>

            {/* Honeypot — hidden from real users, bots tend to fill it */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
              <label htmlFor="feedback-website">Website</label>
              <input
                id="feedback-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>

          </div>

          {status === 'error' && (
            <div
              role="alert"
              className="mt-4 rounded-lg px-3 py-2.5 text-sm"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}
            >
              {error}
            </div>
          )}

          <div className="mt-5 flex flex-col-reverse sm:flex-row sm:items-center gap-3 sm:justify-between">
            {user?.email ? (
              <label className="flex items-center gap-2 text-xs cursor-pointer min-w-0" style={{ color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={followUp}
                  onChange={(event) => setFollowUp(event.target.checked)}
                  className="w-3.5 h-3.5 flex-shrink-0 accent-blue-600"
                />
                <span className="truncate">
                  Okay to follow up at <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{user.email}</span>
                </span>
              </label>
            ) : (
              <p className="my-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                Sent anonymously. Sign in if you’d like a reply.
              </p>
            )}
            <button
              type="submit"
              disabled={!message.trim() || status === 'sending'}
              className="h-10 flex-shrink-0 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-lg text-sm font-semibold border-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'sending' ? 'Sending…' : 'Send feedback'}
              {status !== 'sending' && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
