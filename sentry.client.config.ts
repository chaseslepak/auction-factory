// Sentry (client) — silently no-op if SENTRY_DSN isn't set so shipping
// without a DSN configured is safe.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
    // Only send events for real users (skip local dev noise).
    beforeSend(event) {
      if (event.request?.url?.includes('localhost')) return null;
      return event;
    },
  });
}
