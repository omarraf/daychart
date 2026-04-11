import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Firebase Admin with service account for Firestore access
const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT)
  : undefined;

admin.initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID,
  ...(serviceAccount && { credential: admin.credential.cert(serviceAccount) }),
});

const db = admin.firestore();

// Usage limits by tier
const USAGE_LIMITS = {
  free: 25,      // 25 total messages, no reset
  premium: 500,  // 500 messages per month
} as const;

type UserTier = keyof typeof USAGE_LIMITS;

interface UserUsage {
  tier: UserTier;
  aiMessageCount: number;
  aiMessageResetDate?: admin.firestore.Timestamp;
  stripeCustomerId?: string;
  subscriptionId?: string;
}

/**
 * Get or create usage document for a user
 */
async function getUserUsage(uid: string): Promise<UserUsage> {
  const ref = db.collection('userUsage').doc(uid);
  const doc = await ref.get();

  if (!doc.exists) {
    const defaults: UserUsage = {
      tier: 'free',
      aiMessageCount: 0,
    };
    await ref.set(defaults);
    return defaults;
  }

  return doc.data() as UserUsage;
}

/**
 * Check if a premium user's monthly count should be reset
 */
function shouldResetMonthlyCount(usage: UserUsage): boolean {
  if (usage.tier !== 'premium' || !usage.aiMessageResetDate) return false;
  return usage.aiMessageResetDate.toDate() < new Date();
}

/**
 * Get next month's reset date (1st of next month)
 */
function getNextResetDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

/**
 * Check rate limit and increment usage. Returns remaining count or throws.
 */
async function checkAndIncrementUsage(uid: string): Promise<{ remaining: number; limit: number; tier: UserTier }> {
  const ref = db.collection('userUsage').doc(uid);

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);

    let usage: UserUsage;
    if (!doc.exists) {
      usage = { tier: 'free', aiMessageCount: 0 };
    } else {
      usage = doc.data() as UserUsage;
    }

    const limit = USAGE_LIMITS[usage.tier];

    // Reset monthly count for premium users if needed
    if (usage.tier === 'premium' && shouldResetMonthlyCount(usage)) {
      usage.aiMessageCount = 0;
      usage.aiMessageResetDate = admin.firestore.Timestamp.fromDate(getNextResetDate());
    }

    if (usage.aiMessageCount >= limit) {
      throw new Error(
        usage.tier === 'free'
          ? 'FREE_LIMIT_REACHED'
          : 'PREMIUM_LIMIT_REACHED'
      );
    }

    const newCount = usage.aiMessageCount + 1;
    transaction.set(ref, {
      ...usage,
      aiMessageCount: newCount,
    }, { merge: true });

    return {
      remaining: limit - newCount,
      limit,
      tier: usage.tier,
    };
  });
}

// CORS - allow your frontend origins
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://localhost:5173',
      'http://localhost:5174',
    ];

    // Add explicit frontend URL if set
    if (process.env.FRONTEND_URL) {
      allowed.push(process.env.FRONTEND_URL);
    }

    // Allow any Vercel preview deployment
    if (!origin || allowed.includes(origin) || /\.vercel\.app$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Stripe webhook needs raw body — must be before express.json()
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Types
interface TimeBlock {
  startTime: string;
  endTime: string;
  label: string;
  color: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are a helpful AI scheduling assistant for DayChart, a visual time-blocking app. You help users plan their day by creating and discussing schedules.

When the user asks you to create or suggest a schedule, you MUST respond with a JSON block containing time blocks. Use this exact format embedded in your response:

\`\`\`schedule
[
  {
    "startTime": "HH:MM",
    "endTime": "HH:MM",
    "label": "Activity Name",
    "color": "#hexcolor"
  }
]
\`\`\`

Rules for time blocks:
- Times must be in 24-hour "HH:MM" format, snapped to 5-minute increments (e.g., "07:00", "09:30", "14:15")
- Time blocks must NOT overlap
- Use these colors: #f87171 (red), #60a5fa (blue), #34d399 (green), #fbbf24 (yellow), #a78bfa (purple), #fb923c (orange), #a3e635 (lime), #f472b6 (pink), #38bdf8 (sky), #c084fc (violet)
- Give each block a concise, descriptive label
- Cover the full day if the user asks for a full schedule, or just the requested portion

When NOT creating a schedule, just respond conversationally about time management, productivity tips, or answer questions about their current schedule.

If the user shares their current schedule, analyze it and provide helpful feedback.`;

function formatScheduleContext(timeBlocks: TimeBlock[]): string {
  if (timeBlocks.length === 0) {
    return 'The user currently has no time blocks in their schedule.';
  }

  const sorted = [...timeBlocks].sort((a, b) => {
    const [aH, aM] = a.startTime.split(':').map(Number);
    const [bH, bM] = b.startTime.split(':').map(Number);
    return aH * 60 + aM - (bH * 60 + bM);
  });

  const lines = sorted.map(
    (b) => `- ${b.startTime} to ${b.endTime}: ${b.label}`
  );

  return `The user's current schedule:\n${lines.join('\n')}`;
}

function parseScheduleFromResponse(text: string): TimeBlock[] | null {
  const scheduleMatch = text.match(/```schedule\s*\n([\s\S]*?)\n```/);
  if (!scheduleMatch) return null;

  try {
    const parsed = JSON.parse(scheduleMatch[1]);
    if (!Array.isArray(parsed)) return null;

    return parsed.map(
      (block: { startTime: string; endTime: string; label: string; color: string }) => ({
        startTime: block.startTime,
        endTime: block.endTime,
        label: block.label,
        color: block.color || '#60a5fa',
      })
    );
  } catch {
    return null;
  }
}

function stripScheduleBlock(text: string): string {
  return text.replace(/```schedule\s*\n[\s\S]*?\n```/g, '').trim();
}

// Verify Firebase auth token from Authorization header
async function verifyAuth(req: express.Request): Promise<{ uid: string; emailVerified: boolean }> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const token = authHeader.split('Bearer ')[1];
  const decoded = await admin.auth().verifyIdToken(token);

  // Google sign-in users are always verified; check email_verified for email/password users
  const emailVerified = decoded.email_verified ?? false;

  return { uid: decoded.uid, emailVerified };
}

// Get user's AI usage info
app.get('/api/ai/usage', async (req, res) => {
  try {
    const { uid } = await verifyAuth(req);
    const usage = await getUserUsage(uid);
    const limit = USAGE_LIMITS[usage.tier];

    res.json({
      tier: usage.tier,
      used: usage.aiMessageCount,
      limit,
      remaining: Math.max(0, limit - usage.aiMessageCount),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('authorization')) {
      res.status(401).json({ error: 'Unauthorized. Please sign in.' });
      return;
    }
    res.status(500).json({ error: 'Failed to fetch usage info' });
  }
});

// AI message endpoint
app.post('/api/ai/message', async (req, res) => {
  try {
    // Verify user is authenticated and email is verified
    const { uid, emailVerified } = await verifyAuth(req);

    if (!emailVerified) {
      res.status(403).json({
        error: 'Please verify your email before using the AI assistant.',
        code: 'EMAIL_NOT_VERIFIED',
      });
      return;
    }

    // Check rate limit and increment usage
    let usageInfo: { remaining: number; limit: number; tier: UserTier };
    try {
      usageInfo = await checkAndIncrementUsage(uid);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'FREE_LIMIT_REACHED') {
          res.status(429).json({
            error: 'You\'ve used all 25 free AI messages. Upgrade to Premium for more.',
            code: 'FREE_LIMIT_REACHED',
          });
          return;
        }
        if (error.message === 'PREMIUM_LIMIT_REACHED') {
          res.status(429).json({
            error: 'You\'ve reached your monthly message limit. It will reset on the 1st.',
            code: 'PREMIUM_LIMIT_REACHED',
          });
          return;
        }
      }
      throw error;
    }

    const { messages, timeBlocks } = req.body as {
      messages: ChatMessage[];
      timeBlocks: TimeBlock[];
    };

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    const claudeApiKey = process.env.CLAUDE_API_KEY;
    if (!claudeApiKey) {
      res.status(500).json({ error: 'AI service not configured' });
      return;
    }

    const scheduleContext = formatScheduleContext(timeBlocks || []);

    const client = new Anthropic({ apiKey: claudeApiKey });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: `${SYSTEM_PROMPT}\n\n${scheduleContext}`,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    });

    const assistantText =
      response.content[0].type === 'text'
        ? response.content[0].text
        : 'Sorry, I could not generate a response.';

    const parsedBlocks = parseScheduleFromResponse(assistantText);
    const displayMessage = stripScheduleBlock(assistantText);

    res.json({
      message:
        displayMessage ||
        (parsedBlocks ? "Here's a schedule I created for you:" : assistantText),
      timeBlocks: parsedBlocks || undefined,
      usage: {
        remaining: usageInfo.remaining,
        limit: usageInfo.limit,
        tier: usageInfo.tier,
      },
    });
  } catch (error) {
    console.error('AI endpoint error:', error);

    if (error instanceof Error && error.message.includes('authorization')) {
      res.status(401).json({ error: 'Unauthorized. Please sign in.' });
      return;
    }

    res.status(500).json({ error: 'Failed to communicate with AI assistant' });
  }
});

// ── Stripe Billing ──────────────────────────────────────────────────────────

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/**
 * Create a Stripe Checkout session for upgrading to premium.
 * Requires: STRIPE_SECRET_KEY, STRIPE_PRICE_ID env vars on Railway.
 */
app.post('/api/billing/checkout', async (req, res) => {
  try {
    if (!stripe) {
      res.status(500).json({ error: 'Billing not configured' });
      return;
    }

    const { uid, emailVerified } = await verifyAuth(req);
    if (!emailVerified) {
      res.status(403).json({ error: 'Please verify your email first.' });
      return;
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      res.status(500).json({ error: 'Billing not configured' });
      return;
    }

    // Get or create Stripe customer
    const usage = await getUserUsage(uid);
    let customerId = usage.stripeCustomerId;

    if (!customerId) {
      // Get user email from Firebase Auth
      const userRecord = await admin.auth().getUser(uid);
      const customer = await stripe.customers.create({
        email: userRecord.email,
        metadata: { firebaseUid: uid },
      });
      customerId = customer.id;

      // Save Stripe customer ID
      await db.collection('userUsage').doc(uid).set(
        { stripeCustomerId: customerId },
        { merge: true }
      );
    }

    // Determine redirect URLs
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}?billing=success`,
      cancel_url: `${frontendUrl}?billing=cancel`,
      metadata: { firebaseUid: uid },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    if (error instanceof Error && error.message.includes('authorization')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

/**
 * Stripe webhook — handles subscription lifecycle events.
 * Requires: STRIPE_WEBHOOK_SECRET env var on Railway.
 */
app.post('/api/billing/webhook', async (req, res) => {
  if (!stripe) {
    res.status(500).send('Billing not configured');
    return;
  }

  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    res.status(500).send('Webhook not configured');
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res.status(400).send('Webhook signature verification failed');
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = session.metadata?.firebaseUid;
        if (uid && session.subscription) {
          await db.collection('userUsage').doc(uid).set({
            tier: 'premium',
            aiMessageCount: 0,
            aiMessageResetDate: admin.firestore.Timestamp.fromDate(getNextResetDate()),
            stripeCustomerId: session.customer as string,
            subscriptionId: session.subscription as string,
          }, { merge: true });
          console.log(`User ${uid} upgraded to premium`);
        }
        break;
      }

      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const snapshot = await db.collection('userUsage')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          if (subscription.status === 'active' || subscription.status === 'trialing') {
            await doc.ref.set({ tier: 'premium' }, { merge: true });
          } else {
            // Cancelled, unpaid, past_due, etc.
            await doc.ref.set({
              tier: 'free',
              subscriptionId: admin.firestore.FieldValue.delete(),
            }, { merge: true });
            console.log(`User ${doc.id} downgraded to free (subscription ${subscription.status})`);
          }
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).send('Webhook processing error');
  }
});

/**
 * Get billing status for the current user.
 */
app.get('/api/billing/status', async (req, res) => {
  try {
    const { uid } = await verifyAuth(req);
    const usage = await getUserUsage(uid);

    const result: {
      tier: UserTier;
      hasSubscription: boolean;
      subscriptionId?: string;
    } = {
      tier: usage.tier,
      hasSubscription: !!usage.subscriptionId,
    };

    if (usage.subscriptionId) {
      result.subscriptionId = usage.subscriptionId;
    }

    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('authorization')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.status(500).json({ error: 'Failed to fetch billing status' });
  }
});

/**
 * Create a Stripe Customer Portal session for managing subscription.
 */
app.post('/api/billing/portal', async (req, res) => {
  try {
    if (!stripe) {
      res.status(500).json({ error: 'Billing not configured' });
      return;
    }

    const { uid } = await verifyAuth(req);
    const usage = await getUserUsage(uid);

    if (!usage.stripeCustomerId) {
      res.status(400).json({ error: 'No billing account found' });
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const session = await stripe.billingPortal.sessions.create({
      customer: usage.stripeCustomerId,
      return_url: frontendUrl,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Portal error:', error);
    if (error instanceof Error && error.message.includes('authorization')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

app.listen(PORT, () => {
  console.log(`DayChart API server running on port ${PORT}`);
  console.log(`Stripe configured: ${!!stripe}`);
  console.log(`Stripe Price ID set: ${!!process.env.STRIPE_PRICE_ID}`);
  console.log(`Firebase Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
});
