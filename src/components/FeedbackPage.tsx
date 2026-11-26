import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { FEEDBACK_CATEGORIES, submitFeedback, type FeedbackCategory } from '../services/feedbackService';

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
    <main className="min-h-full p-4 sm:p-8" style={{ background: 'var(--page-bg)' }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-7">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 4v-4z" />
            </svg>
          </div>
          <h1 className="text-left text-2xl font-bold my-0" style={{ color: 'var(--text-primary)' }}>
            Share feedback
          </h1>
          <p className="mt-2 text-sm sm:text-base" style={{ color: 'var(--text-muted)' }}>
            Found a bug, have a feature idea, or want to share what is working well? I’d love to hear it.
          </p>
        </div>

        {status === 'sent' ? (
          <div
            className="rounded-2xl border p-6 sm:p-8 shadow-sm text-center"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
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
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border p-5 sm:p-6 shadow-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="space-y-5">
              <div>
                <label htmlFor="feedback-category" className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  What is this about?
                </label>
                <select
                  id="feedback-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  {FEEDBACK_CATEGORIES.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="feedback-message" className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Your feedback
                </label>
                <textarea
                  id="feedback-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  required
                  rows={8}
                  maxLength={MAX_MESSAGE_LENGTH}
                  placeholder="Tell me what’s working, what feels confusing, a bug you ran into, or an idea that would make DayChart better. For bugs, include what you expected and what happened."
                  className="w-full resize-y rounded-lg border px-3 py-3 text-sm leading-6 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                {message.length > MAX_MESSAGE_LENGTH * 0.8 && (
                  <p className="mt-1 text-xs text-right" style={{ color: 'var(--text-muted)' }}>
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

              {user?.email && (
                <label className="flex items-start gap-3 text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={followUp}
                    onChange={(event) => setFollowUp(event.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-blue-600"
                  />
                  <span>
                    It’s okay to follow up with me at <span className="font-semibold">{user.email}</span>
                  </span>
                </label>
              )}
            </div>

            {status === 'error' && (
              <div
                role="alert"
                className="mt-5 rounded-lg px-3 py-2.5 text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}
              >
                {error}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {user ? 'Sent with your account so I can see what you’re seeing.' : 'Sent anonymously. Sign in if you’d like a reply.'}
              </p>
              <button
                type="submit"
                disabled={!message.trim() || status === 'sending'}
                className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold border-none disabled:opacity-50 disabled:cursor-not-allowed"
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
    </main>
  );
}
