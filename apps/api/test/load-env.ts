import { config } from 'dotenv';

config({ path: '.env' });

/**
 * Tests run against a dedicated database so a failed run can never leave debris
 * in the development one. `TEST_DATABASE_URL` overrides it for CI.
 */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  (process.env.DATABASE_URL ?? '').replace(/\/([^/?]+)(\?|$)/, '/pricing_test$2');

process.env.JWT_SECRET ??= 'test-secret';
process.env.NODE_ENV = 'test';
