import { auth } from '../firebase';
import type { TimeBlock } from '../types/schedule';

// API base URL: Railway in production, local dev server otherwise
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UsageInfo {
  tier: 'free' | 'premium';
  used: number;
  limit: number;
  remaining: number;
}

export interface AIMessageResponse {
  message: string;
  timeBlocks?: TimeBlock[];
  usage?: UsageInfo;
}

export class RateLimitError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Get the current user's Firebase auth token for API requests
 */
async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in to use the AI assistant.');
  }
  const tokenResult = await user.getIdTokenResult();
  if (tokenResult.claims.email_verified !== true) {
    await user.reload();
    return user.getIdToken(true);
  }
  return tokenResult.token;
}

/**
 * Fetch the user's current AI usage info
 */
export const getUsage = async (): Promise<UsageInfo> => {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/api/ai/usage`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch usage info');
  }

  return response.json();
};

/**
 * Send a message to the AI assistant via backend proxy
 */
export const sendMessage = async (
  messages: ChatMessage[],
  currentTimeBlocks: TimeBlock[]
): Promise<AIMessageResponse> => {
  const token = await getAuthToken();

  try {
    const response = await fetch(`${API_BASE_URL}/api/ai/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages,
        timeBlocks: currentTimeBlocks,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);

      if (response.status === 401) {
        throw new Error('Please sign in to use the AI assistant.');
      }

      if (response.status === 403) {
        throw new Error(errorData?.error || 'Please verify your email before using the AI assistant.');
      }

      if (response.status === 429) {
        throw new RateLimitError(
          errorData?.error || 'Rate limit reached.',
          errorData?.code || 'LIMIT_REACHED',
        );
      }

      throw new Error(
        errorData?.error || `API request failed with status ${response.status}`
      );
    }

    const data = await response.json();

    // Add client-side IDs and order to returned time blocks
    const enrichedBlocks = data.timeBlocks?.map(
      (block: { startTime: string; endTime: string; label: string; color: string }, index: number) => ({
        id: crypto.randomUUID(),
        startTime: block.startTime,
        endTime: block.endTime,
        label: block.label,
        color: block.color || '#60a5fa',
        order: index,
      })
    );

    return {
      message: data.message,
      timeBlocks: enrichedBlocks,
      usage: data.usage,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to communicate with AI assistant');
  }
};
