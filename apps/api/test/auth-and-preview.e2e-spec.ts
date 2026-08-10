import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import {
  auth,
  createTestApp,
  SAMPLE_LINE_ITEMS,
  SAMPLE_TOTALS,
  signUp,
  type TestUser,
} from './helpers';

describe('Auth and preview (e2e)', () => {
  let app: INestApplication;
  let user: TestUser;

  const api = () => request(app.getHttpServer() as App);

  beforeAll(async () => {
    app = await createTestApp();
    user = await signUp(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('auth', () => {
    it('signs a user in with the password they registered', async () => {
      const response = await api()
        .post('/api/auth/login')
        .send({ email: user.email, password: 'Password123!' })
        .expect(200);

      expect(response.body.data.accessToken).toBeTruthy();
      expect(response.body.data.user.email).toBe(user.email);
      // The hash must never leave the server.
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('gives the same answer for a wrong password and an unknown account', async () => {
      const wrongPassword = await api()
        .post('/api/auth/login')
        .send({ email: user.email, password: 'not-the-password' })
        .expect(401);

      const unknownAccount = await api()
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'Password123!' })
        .expect(401);

      // Identical responses, so the endpoint cannot be used to discover which
      // emails are registered.
      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(unknownAccount.body.error).toEqual(wrongPassword.body.error);
    });

    it('refuses a duplicate registration', async () => {
      const response = await api()
        .post('/api/auth/signup')
        .send({ email: user.email, password: 'Password123!' })
        .expect(409);

      expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
      expect(response.body.error.field).toBe('email');
    });

    it('rejects a short password with a specific message', async () => {
      const response = await api()
        .post('/api/auth/signup')
        .send({ email: 'short@example.com', password: 'abc' })
        .expect(400);

      expect(response.body.error.field).toBe('password');
      expect(response.body.error.message).toMatch(/8 characters/);
    });

    it('matches an email case-insensitively', async () => {
      await api()
        .post('/api/auth/login')
        .send({ email: user.email.toUpperCase(), password: 'Password123!' })
        .expect(200);
    });

    it('rejects a garbage token', async () => {
      await api()
        .get('/api/auth/me')
        .set({ Authorization: 'Bearer not-a-real-token' })
        .expect(401);
    });
  });

  describe('POST /calc/preview', () => {
    it('returns the same totals the persisted document would store', async () => {
      const preview = (
        await api()
          .post('/api/calc/preview')
          .set(auth(user))
          .send({ lineItems: SAMPLE_LINE_ITEMS })
          .expect(200)
      ).body.data;

      expect(preview).toMatchObject(SAMPLE_TOTALS);

      // The point of the endpoint: preview and saved values come from the same
      // module, so they cannot disagree.
      const saved = (
        await api()
          .post('/api/documents')
          .set(auth(user))
          .send({
            title: 'Cross-check',
            customer: 'Acme',
            issueDate: '2026-08-01',
            lineItems: SAMPLE_LINE_ITEMS,
          })
          .expect(201)
      ).body.data;

      expect(saved.subtotal).toBe(preview.subtotal);
      expect(saved.totalDiscount).toBe(preview.totalDiscount);
      expect(saved.totalTax).toBe(preview.totalTax);
      expect(saved.grandTotal).toBe(preview.grandTotal);

      saved.lineItems.forEach((line: { lineTotal: string }, index: number) => {
        expect(line.lineTotal).toBe(preview.lines[index].lineTotal);
      });
    });

    it('handles an empty basket', async () => {
      const response = await api()
        .post('/api/calc/preview')
        .set(auth(user))
        .send({ lineItems: [] })
        .expect(200);

      expect(response.body.data).toMatchObject({
        subtotal: '0.00',
        grandTotal: '0.00',
      });
    });

    it('reports a bad line with its index, so the UI can highlight the row', async () => {
      const response = await api()
        .post('/api/calc/preview')
        .set(auth(user))
        .send({
          lineItems: [
            { description: 'Fine', quantity: 1, unitPrice: '10.00' },
            {
              description: 'Broken',
              quantity: 1,
              unitPrice: '10.00',
              discount: { type: 'fixed', value: '50' },
            },
          ],
        })
        .expect(400);

      expect(response.body.error.code).toBe('DISCOUNT_EXCEEDS_SUBTOTAL');
      expect(response.body.error.lineIndex).toBe(1);
    });

    it('requires authentication', async () => {
      await api().post('/api/calc/preview').send({ lineItems: [] }).expect(401);
    });
  });

  describe('response envelope', () => {
    it('wraps success in { data } and failure in { error }', async () => {
      const success = await api().get('/api/documents').set(auth(user)).expect(200);
      expect(Object.keys(success.body)).toEqual(['data']);

      const failure = await api().get('/api/documents').expect(401);
      expect(Object.keys(failure.body)).toEqual(['error']);
      expect(failure.body.error).toHaveProperty('code');
      expect(failure.body.error).toHaveProperty('message');
    });

    it('exposes an unauthenticated health check', async () => {
      const response = await api().get('/api/health').expect(200);
      expect(response.body.data.status).toBe('ok');
    });
  });
});
