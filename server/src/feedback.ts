import express from 'express';
import { createHash } from 'crypto';
import * as admin from 'firebase-admin';

const FEEDBACK_CATEGORIES = [
  'General feedback',
  'Feature request',
  'Bug report',
  'Something I like',
] as const;

type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number];

const MAX_MESSAGE_LENGTH = 5000;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const CATEGORY_COLORS: Record<FeedbackCategory, number> = {
  'General feedback': 0x2563eb,
  'Feature request': 0xa78bfa,
  'Bug report': 0xef4444,
  'Something I like': 0x34d399,
};

interface FeedbackContext {
  route?: string;
  theme?: string;
  viewport?: string;
  timezone?: string;
}

interface FeedbackUser {
  uid: string;
  email?: string;
}

// Auth is optional for feedback — guests can submit too
async function getOptionalUser(req: express.Request): Promise<FeedbackUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

function truncate(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

function sanitizeContext(raw: unknown): FeedbackContext {
  if (!raw || typeof raw !== 'object') return {};
  const ctx = raw as Record<string, unknown>;
  return {
    route: truncate(ctx.route, 100),
    theme: truncate(ctx.theme, 20),
    viewport: truncate(ctx.viewport, 20),
    timezone: truncate(ctx.timezone, 60),
  };
}

/**
 * Fixed-window rate limit keyed by uid (signed in) or hashed IP (guest).
 * Returns false when the limit has been reached.
 */
async function checkRateLimit(db: admin.firestore.Firestore, key: string): Promise<boolean> {
  const ref = db.collection('feedbackRateLimits').doc(key);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.data() as { count: number; windowStart: number } | undefined;

    if (!data || now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { count: 1, windowStart: now });
      return true;
    }

    if (data.count >= RATE_LIMIT_MAX) return false;

    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}

async function notifyDiscord(feedback: {
  id: string;
  category: FeedbackCategory;
  message: string;
  user: FeedbackUser | null;
  followUp: boolean;
  context: FeedbackContext;
  userAgent?: string;
}) {
  const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const from = feedback.user
    ? `${feedback.user.email ?? 'No email'} (${feedback.user.uid})`
    : 'Guest';
  const { route, theme, viewport, timezone } = feedback.context;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Never let user-submitted text ping @everyone or roles
      allowed_mentions: { parse: [] },
      embeds: [{
        title: feedback.category,
        description: feedback.message.slice(0, 4000),
        color: CATEGORY_COLORS[feedback.category],
        fields: [
          { name: 'From', value: from, inline: true },
          { name: 'Follow up?', value: feedback.followUp ? 'Yes' : 'No', inline: true },
          {
            name: 'Context',
            value: [
              route && `Route: ${route}`,
              theme && `Theme: ${theme}`,
              viewport && `Viewport: ${viewport}`,
              timezone && `Timezone: ${timezone}`,
              feedback.userAgent && `UA: ${feedback.userAgent.slice(0, 200)}`,
            ].filter(Boolean).join('\n') || 'None',
          },
        ],
        footer: { text: `Feedback ID: ${feedback.id}` },
        timestamp: new Date().toISOString(),
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed with status ${response.status}`);
  }
}

export function createFeedbackRouter(db: admin.firestore.Firestore) {
  const router = express.Router();

  router.post('/api/feedback', async (req, res) => {
    try {
      const { category, message, followUp, website, context } = req.body ?? {};

      // Honeypot: real users never fill this hidden field. Pretend success so bots move on.
      if (typeof website === 'string' && website.length > 0) {
        res.json({ ok: true });
        return;
      }

      if (!FEEDBACK_CATEGORIES.includes(category)) {
        res.status(400).json({ error: 'Please choose a valid category.' });
        return;
      }

      const trimmedMessage = typeof message === 'string' ? message.trim() : '';
      if (!trimmedMessage) {
        res.status(400).json({ error: 'Feedback message is required.' });
        return;
      }
      if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
        res.status(400).json({ error: `Feedback must be under ${MAX_MESSAGE_LENGTH} characters.` });
        return;
      }

      const user = await getOptionalUser(req);
      const rateLimitKey = user
        ? `uid_${user.uid}`
        : `ip_${createHash('sha256').update(req.ip ?? 'unknown').digest('hex').slice(0, 32)}`;

      if (!(await checkRateLimit(db, rateLimitKey))) {
        res.status(429).json({ error: 'You’ve sent a lot of feedback recently. Please try again in a bit.' });
        return;
      }

      const sanitizedContext = sanitizeContext(context);
      const userAgent = truncate(req.headers['user-agent'], 500);
      const wantsFollowUp = followUp === true && !!user?.email;

      const ref = await db.collection('feedback').add({
        category,
        message: trimmedMessage,
        uid: user?.uid ?? null,
        email: wantsFollowUp ? user?.email : null,
        followUp: wantsFollowUp,
        context: sanitizedContext,
        userAgent: userAgent ?? null,
        status: 'new',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Feedback is already saved, so a Discord outage shouldn't fail the request
      try {
        await notifyDiscord({
          id: ref.id,
          category,
          message: trimmedMessage,
          user,
          followUp: wantsFollowUp,
          context: sanitizedContext,
          userAgent,
        });
      } catch (error) {
        console.error('Discord feedback notification error:', error);
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Feedback error:', error);
      res.status(500).json({ error: 'Failed to send feedback. Please try again.' });
    }
  });

  return router;
}
