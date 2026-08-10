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

describe('Documents (e2e)', () => {
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

  const createSampleDocument = async (issueDate = '2026-08-01') => {
    const response = await api()
      .post('/api/documents')
      .set(auth(user))
      .send({
        title: 'Sample document',
        customer: 'Acme Corp',
        issueDate,
        lineItems: SAMPLE_LINE_ITEMS,
      })
      .expect(201);
    return response.body.data;
  };

  describe('calculation correctness', () => {
    it('stores the assignment sample totals exactly', async () => {
      const document = await createSampleDocument();

      expect(document).toMatchObject(SAMPLE_TOTALS);
      expect(document.status).toBe('draft');

      const [widgetA, widgetB, serviceFee] = document.lineItems;

      expect(widgetA).toMatchObject({
        subtotal: '200.00',
        discountAmount: '20.00',
        afterDiscount: '180.00',
        taxAmount: '9.00', // 5% of 180, not of 200
        lineTotal: '189.00',
      });
      expect(widgetB).toMatchObject({
        subtotal: '50.00',
        discountAmount: '0.00',
        taxAmount: '2.50',
        lineTotal: '52.50',
      });
      expect(serviceFee).toMatchObject({
        subtotal: '200.00',
        discountAmount: '20.00',
        taxAmount: '0.00',
        lineTotal: '180.00',
      });
    });

    it('emits every money value as a string, never a JSON number', async () => {
      const document = await createSampleDocument();

      for (const field of ['subtotal', 'totalDiscount', 'totalTax', 'grandTotal']) {
        expect(typeof document[field]).toBe('string');
      }
      for (const line of document.lineItems) {
        for (const field of ['unitPrice', 'subtotal', 'discountAmount', 'lineTotal']) {
          expect(typeof line[field]).toBe('string');
        }
      }
    });

    it('recomputes the totals when a line item changes', async () => {
      const document = await createSampleDocument();
      const lineId = document.lineItems[0].id;

      // Drop Widget A's discount: its line total becomes 200 + 5% = 210.00.
      const updated = await api()
        .patch(`/api/documents/${document.id}/line-items/${lineId}`)
        .set(auth(user))
        .send({ discount: null })
        .expect(200);

      expect(updated.body.data.lineItems[0]).toMatchObject({
        discountAmount: '0.00',
        taxAmount: '10.00',
        lineTotal: '210.00',
      });
      expect(updated.body.data).toMatchObject({
        totalDiscount: '20.00', // only the service fee's $20 remains
        totalTax: '12.50',
        grandTotal: '442.50',
      });
    });

    it('recomputes the totals when a line item is removed', async () => {
      const document = await createSampleDocument();
      const serviceFeeId = document.lineItems[2].id;

      const updated = await api()
        .delete(`/api/documents/${document.id}/line-items/${serviceFeeId}`)
        .set(auth(user))
        .expect(200);

      expect(updated.body.data.lineItems).toHaveLength(2);
      expect(updated.body.data).toMatchObject({
        subtotal: '250.00',
        totalDiscount: '20.00',
        totalTax: '11.50',
        grandTotal: '241.50',
      });
    });

    it('never lets a client dictate an amount', async () => {
      // grandTotal is a computed column; offering one should be refused rather
      // than silently ignored.
      await api()
        .post('/api/documents')
        .set(auth(user))
        .send({
          title: 'Forged',
          customer: 'Acme',
          issueDate: '2026-08-01',
          grandTotal: '0.01',
        })
        .expect(400);
    });
  });

  describe('validation', () => {
    it.each([
      [
        'a quantity below 1',
        { description: 'X', quantity: 0, unitPrice: '10.00' },
        'quantity',
      ],
      [
        'a negative unit price',
        { description: 'X', quantity: 1, unitPrice: '-1.00' },
        'unitPrice',
      ],
      [
        'a discount percent above 100',
        {
          description: 'X',
          quantity: 1,
          unitPrice: '10.00',
          discount: { type: 'percent', value: '101' },
        },
        'discount.value',
      ],
      [
        'a fixed discount larger than the line subtotal',
        {
          description: 'X',
          quantity: 1,
          unitPrice: '10.00',
          discount: { type: 'fixed', value: '11' },
        },
        'discount.value',
      ],
      [
        'a negative tax percent',
        { description: 'X', quantity: 1, unitPrice: '10.00', taxPercent: '-1' },
        'taxPercent',
      ],
    ])('rejects %s with a specific field', async (_label, lineItem, expectedField) => {
      const document = await createSampleDocument();

      const response = await api()
        .post(`/api/documents/${document.id}/line-items`)
        .set(auth(user))
        .send(lineItem)
        .expect(400);

      expect(response.body.error.field).toBe(expectedField);
      expect(response.body.error.code).toBeTruthy();
      expect(response.body.error.message).toBeTruthy();
    });

    it('reports the fixed-discount rejection with its own code', async () => {
      const document = await createSampleDocument();

      const response = await api()
        .post(`/api/documents/${document.id}/line-items`)
        .set(auth(user))
        .send({
          description: 'Over-discounted',
          quantity: 1,
          unitPrice: '10.00',
          discount: { type: 'fixed', value: '11' },
        })
        .expect(400);

      // Policy is reject, not clamp — see README.
      expect(response.body.error.code).toBe('DISCOUNT_EXCEEDS_SUBTOTAL');
    });

    it('rejects an issue date that is not a bare calendar date', async () => {
      await api()
        .post('/api/documents')
        .set(auth(user))
        .send({ title: 'T', customer: 'C', issueDate: '2026-02-31' })
        .expect(400);

      await api()
        .post('/api/documents')
        .set(auth(user))
        .send({ title: 'T', customer: 'C', issueDate: '2026-08-01T00:00:00Z' })
        .expect(400);
    });
  });

  describe('finalize and immutability', () => {
    it('refuses to finalize a document with no line items', async () => {
      const empty = await api()
        .post('/api/documents')
        .set(auth(user))
        .send({ title: 'Empty', customer: 'Nobody', issueDate: '2026-08-01' })
        .expect(201);

      const response = await api()
        .post(`/api/documents/${empty.body.data.id}/finalize`)
        .set(auth(user))
        .expect(400);

      expect(response.body.error.code).toBe('NO_LINE_ITEMS');
    });

    it('rejects EVERY mutation once finalized', async () => {
      const document = await createSampleDocument();
      const lineId = document.lineItems[0].id;

      const finalized = await api()
        .post(`/api/documents/${document.id}/finalize`)
        .set(auth(user))
        .expect(200);
      expect(finalized.body.data.status).toBe('finalized');

      // The stored amounts must survive the transition untouched.
      expect(finalized.body.data).toMatchObject(SAMPLE_TOTALS);

      // Built lazily and run one at a time: each `api()` call opens its own
      // ephemeral listener, so creating them all up front races the teardown.
      const mutations = [
        () => api().patch(`/api/documents/${document.id}`).send({ title: 'Renamed' }),
        () =>
          api()
            .post(`/api/documents/${document.id}/line-items`)
            .send({ description: 'Sneaky', quantity: 1, unitPrice: '1.00' }),
        () =>
          api()
            .patch(`/api/documents/${document.id}/line-items/${lineId}`)
            .send({ quantity: 99 }),
        () => api().delete(`/api/documents/${document.id}/line-items/${lineId}`),
      ];

      for (const mutation of mutations) {
        const response = await mutation().set(auth(user)).expect(403);
        expect(response.body.error.code).toBe('DOCUMENT_FINALIZED');
      }

      // And nothing actually changed.
      const reread = await api()
        .get(`/api/documents/${document.id}`)
        .set(auth(user))
        .expect(200);
      expect(reread.body.data).toMatchObject(SAMPLE_TOTALS);
      expect(reread.body.data.title).toBe('Sample document');
      expect(reread.body.data.lineItems).toHaveLength(3);
    });

    it('refuses to finalize twice', async () => {
      const document = await createSampleDocument();

      await api().post(`/api/documents/${document.id}/finalize`).set(auth(user)).expect(200);

      const response = await api()
        .post(`/api/documents/${document.id}/finalize`)
        .set(auth(user))
        .expect(400);

      expect(response.body.error.code).toBe('ALREADY_FINALIZED');
    });
  });

  describe('duplicate', () => {
    it('copies a finalized document into an editable draft with equal totals', async () => {
      const document = await createSampleDocument();
      await api().post(`/api/documents/${document.id}/finalize`).set(auth(user)).expect(200);

      const copy = (
        await api()
          .post(`/api/documents/${document.id}/duplicate`)
          .set(auth(user))
          .expect(201)
      ).body.data;

      expect(copy.id).not.toBe(document.id);
      expect(copy.status).toBe('draft');
      expect(copy.title).toBe('Sample document (copy)');
      // Recomputed from the copied inputs, yet identical — which is the point.
      expect(copy).toMatchObject(SAMPLE_TOTALS);
      expect(copy.lineItems).toHaveLength(3);

      // The copy is genuinely editable, and the original stays frozen.
      await api()
        .patch(`/api/documents/${copy.id}`)
        .set(auth(user))
        .send({ title: 'Edited copy' })
        .expect(200);
      await api()
        .patch(`/api/documents/${document.id}`)
        .set(auth(user))
        .send({ title: 'Nope' })
        .expect(403);
    });
  });

  describe('ownership', () => {
    it("returns 404 — not 403 — for another user's document", async () => {
      const document = await createSampleDocument();
      const stranger = await signUp(app);

      // 404 rather than 403 so the API never confirms that an id exists.
      const response = await api()
        .get(`/api/documents/${document.id}`)
        .set(auth(stranger))
        .expect(404);
      expect(response.body.error.code).toBe('DOCUMENT_NOT_FOUND');

      await api()
        .patch(`/api/documents/${document.id}`)
        .set(auth(stranger))
        .send({ title: 'Hijacked' })
        .expect(404);
      await api()
        .post(`/api/documents/${document.id}/finalize`)
        .set(auth(stranger))
        .expect(404);
      await api().delete(`/api/documents/${document.id}`).set(auth(stranger)).expect(404);
    });

    it("keeps another user's documents out of the list", async () => {
      await createSampleDocument();
      const stranger = await signUp(app);

      const response = await api().get('/api/documents').set(auth(stranger)).expect(200);
      expect(response.body.data).toEqual([]);
    });

    it('rejects an unauthenticated request', async () => {
      const response = await api().get('/api/documents').expect(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('soft delete', () => {
    it('removes a document from every read path', async () => {
      const document = await createSampleDocument();

      await api().delete(`/api/documents/${document.id}`).set(auth(user)).expect(204);
      await api().get(`/api/documents/${document.id}`).set(auth(user)).expect(404);

      const list = await api().get('/api/documents').set(auth(user)).expect(200);
      expect(list.body.data.map((d: { id: string }) => d.id)).not.toContain(document.id);
    });
  });
});
