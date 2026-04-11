import { useState, useRef, useEffect, useCallback } from 'react';
import type { TimeBlock } from '../types/schedule';
import { sendMessage, getUsage, RateLimitError } from '../services/aiService';
import type { ChatMessage, UsageInfo } from '../services/aiService';
import { formatTo12Hour } from '../utils/timeUtils';
import { auth } from '../firebase';
import { resendVerificationEmail } from '../auth';
import { createCheckoutSession } from '../services/billingService';

/** Simple markdown-to-JSX renderer for AI responses */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} className="list-disc list-inside space-y-1 my-1">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  const formatInline = (str: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    // Match **bold**, `code`, and plain text
    const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(str.slice(lastIndex, match.index));
      }
      if (match[2]) {
        parts.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
      } else if (match[3]) {
        parts.push(
          <code key={key++} className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 py-0.5 rounded text-xs">
            {match[3]}
          </code>
        );
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < str.length) {
      parts.push(str.slice(lastIndex));
    }
    return parts;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      flushList();
      const level = headerMatch[1].length;
      const cls = level === 1
        ? 'text-base font-bold mt-3 mb-1'
        : level === 2
        ? 'text-sm font-bold mt-2 mb-1'
        : 'text-sm font-semibold mt-2 mb-0.5';
      elements.push(<div key={`h-${i}`} className={cls}>{formatInline(headerMatch[2])}</div>);
      continue;
    }

    // List items (- or *)
    const listMatch = line.match(/^[\-\*]\s+(.+)$/);
    if (listMatch) {
      listItems.push(<li key={`li-${i}`}>{formatInline(listMatch[1])}</li>);
      continue;
    }

    // Numbered list items
    const numListMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numListMatch) {
      flushList();
      elements.push(
        <div key={`nl-${i}`} className="ml-2 my-0.5">{formatInline(line)}</div>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      flushList();
      elements.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    // Plain paragraph
    flushList();
    elements.push(<div key={`p-${i}`} className="my-0.5">{formatInline(line)}</div>);
  }

  flushList();
  return elements;
}

export interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  timeBlocks?: TimeBlock[];
  timestamp: Date;
}

interface AIAssistantProps {
  timeBlocks: TimeBlock[];
  onApplySchedule: (timeBlocks: TimeBlock[]) => void;
  messages: DisplayMessage[];
  setMessages: React.Dispatch<React.SetStateAction<DisplayMessage[]>>;
}

export default function AIAssistant({ timeBlocks, onApplySchedule, messages, setMessages }: AIAssistantProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [emailVerified, setEmailVerified] = useState(true);
  const [isResending, setIsResending] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Check email verification status
  useEffect(() => {
    const user = auth.currentUser;
    if (user && !user.emailVerified) {
      setEmailVerified(false);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Fetch usage on mount
  useEffect(() => {
    getUsage()
      .then((data) => {
        setUsage(data);
        if (data.remaining <= 0) setRateLimited(true);
      })
      .catch(() => { /* user may not be signed in yet */ });
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    const userMessage: DisplayMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Build chat history for API (exclude the initial greeting)
    const chatHistory: ChatMessage[] = messages
      .filter((_, i) => i > 0) // skip greeting
      .map((m) => ({ role: m.role, content: m.content }));
    chatHistory.push({ role: 'user', content: trimmed });

    try {
      const response = await sendMessage(chatHistory, timeBlocks);

      const assistantMessage: DisplayMessage = {
        role: 'assistant',
        content: response.message,
        timeBlocks: response.timeBlocks,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Update usage from response
      if (response.usage) {
        setUsage(response.usage);
        if (response.usage.remaining <= 0) setRateLimited(true);
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        setRateLimited(true);
        setError(err.message);
        // Refresh usage
        getUsage().then(setUsage).catch(() => {});
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Something went wrong';
        setError(errorMsg);
        const errorMessage: DisplayMessage = {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${errorMsg}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApplySchedule = (blocks: TimeBlock[]) => {
    if (confirm('This will replace your current schedule with the AI-generated one. Continue?')) {
      onApplySchedule(blocks);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Schedule applied! Switch to the Schedule Editor to see your new time blocks.',
          timestamp: new Date(),
        },
      ]);
    }
  };

  const suggestions = [
    'Create a productive morning routine',
    'Plan a balanced work day',
    'Help me optimize my current schedule',
    'Suggest a study schedule',
  ];

  const inputBox = (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about your schedule..."
        rows={1}
        className="w-full resize-none bg-transparent text-gray-900 dark:text-gray-100 px-4 pt-3.5 pb-2 text-sm focus:outline-none placeholder-gray-400 dark:placeholder-gray-500 max-h-32"
        style={{ minHeight: '44px' }}
        disabled={isLoading}
      />
      <div className="flex justify-end px-3 pb-2.5">
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="p-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );

  const isEmptyState = messages.length <= 1;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-gray-950">
      {isEmptyState ? (
        /* ── Empty / initial state ── */
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-8 tracking-tight">
            How can I help?
          </h1>

          <div className="w-full max-w-xl">
            {!emailVerified ? (
              <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-3">Verify your email to start chatting</p>
            ) : rateLimited ? (
              <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-3">
                {usage?.tier === 'free' ? 'Upgrade to Premium to continue chatting' : 'Message limit reached. Resets on the 1st.'}
              </p>
            ) : inputBox}

            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="px-3.5 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Free tier usage indicator */}
            {usage && usage.tier === 'free' && (
              <p className="mt-3 text-xs text-center text-gray-400 dark:text-gray-500">{usage.used} / {usage.limit} free messages used</p>
            )}
          </div>
        </div>
      ) : (
        /* ── Active chat state ── */
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
            {messages.slice(1).map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'
                  }`}
                >
                  <div className="text-sm leading-relaxed">
                    {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                  </div>

                  {/* Schedule Preview */}
                  {msg.timeBlocks && msg.timeBlocks.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Suggested Schedule
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {msg.timeBlocks.length} block{msg.timeBlocks.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {msg.timeBlocks.map((block, j) => (
                          <div
                            key={j}
                            className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2"
                          >
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: block.color }}
                            />
                            <span className="font-medium text-gray-700 dark:text-gray-200 flex-1 truncate">
                              {block.label}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                              {formatTo12Hour(block.startTime)} - {formatTo12Hour(block.endTime)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => handleApplySchedule(msg.timeBlocks!)}
                        className="mt-3 w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Apply This Schedule
                      </button>
                    </div>
                  )}

                  <div className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mx-4 sm:mx-6 mb-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 flex-shrink-0">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs text-red-700 dark:text-red-400 flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Email Verification Banner */}
          {!emailVerified && (
            <div className="mx-4 sm:mx-6 mb-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex-shrink-0">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Verify your email to use AI</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Check your inbox for a verification link.</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={async () => {
                        setIsResending(true);
                        try {
                          await resendVerificationEmail();
                          alert('Verification email sent! Check your inbox and spam folder.');
                        } catch {
                          alert('Failed to send verification email. Please try again.');
                        } finally {
                          setIsResending(false);
                        }
                      }}
                      disabled={isResending}
                      className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                    >
                      {isResending ? 'Sending...' : 'Resend Email'}
                    </button>
                    <button
                      onClick={() => {
                        const user = auth.currentUser;
                        if (user) {
                          user.reload().then(() => user.getIdToken(true)).then(() => {
                            if (user.emailVerified) {
                              setEmailVerified(true);
                            } else {
                              alert('Email not yet verified. Please check your inbox.');
                            }
                          });
                        }
                      }}
                      className="px-3 py-1.5 bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-300 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-700 hover:bg-amber-50 transition-colors"
                    >
                      I've Verified
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Upgrade Prompt */}
          {rateLimited && (
            <div className="mx-4 sm:mx-6 mb-2 px-4 py-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl flex-shrink-0">
              <p className="text-sm font-semibold text-purple-900 dark:text-purple-200">
                {usage?.tier === 'free' ? "Free plan limit reached" : 'Monthly limit reached'}
              </p>
              <p className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">
                {usage?.tier === 'free' ? 'Upgrade to Premium to keep using AI.' : 'Resets on the 1st of next month.'}
              </p>
              {usage?.tier === 'free' && (
                <button
                  onClick={async () => {
                    setIsCheckingOut(true);
                    try { await createCheckoutSession(); }
                    catch (err) { alert(err instanceof Error ? err.message : 'Failed to start checkout'); }
                    finally { setIsCheckingOut(false); }
                  }}
                  disabled={isCheckingOut}
                  className="mt-2 px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-sm disabled:opacity-50"
                >
                  {isCheckingOut ? 'Redirecting...' : 'Upgrade to Premium'}
                </button>
              )}
            </div>
          )}

          {/* Input Area */}
          <div className="px-4 sm:px-6 py-3 flex-shrink-0">
            {!emailVerified ? (
              <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-2">Verify your email to start chatting</p>
            ) : rateLimited ? (
              <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-2">
                {usage?.tier === 'free' ? 'Upgrade to Premium to continue chatting' : 'Message limit reached. Resets on the 1st.'}
              </p>
            ) : inputBox}

            {/* Free tier usage indicator */}
            {usage && usage.tier === 'free' && !rateLimited && (
              <p className="mt-2 text-xs text-center text-gray-400 dark:text-gray-500">{usage.used} / {usage.limit} free messages used</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
