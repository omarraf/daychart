import type { CorsOptions } from 'cors';

const allowedOrigins = new Set([
  'https://daychart.fyi',
  'https://www.daychart.fyi',
  'http://localhost:5173',
  'http://localhost:5174',
]);

const configuredUrls = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ALLOWED_ORIGINS || '').split(','),
];

for (const configuredUrl of configuredUrls) {
  if (!configuredUrl?.trim()) continue;

  const url = new URL(configuredUrl.trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Frontend CORS URLs must use HTTP or HTTPS');
  }
  allowedOrigins.add(url.origin);
}

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin) || /\.vercel\.app$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
