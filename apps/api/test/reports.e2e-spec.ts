import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import { auth, createTestApp, signUp, type TestUser } from './helpers';

/** Sums a list of 2dp money strings in integer cents, then formats back. */
function sumMoney(values: string[]): string {
  const cents = values.reduce((total, value) => total + Math.round(Number(value) * 100), 0);
  return (cents / 100).toFixed(2);
}

describe('Reports (e2e)', () => {
  let app: INestApplication;
  let user: TestUser;

  const api = () => request(app.getHttpServer() as App);

  // Awkward figures on purpose: if the report re-derived amounts instead of
  // summing the stored ones, fractional cents are where it would show.
  const DOCUMENTS = [
    {
      issueDate: '2026-03-05',
      lineItems: [
        {
          description: 'A',
          quantity: 3,
          unitPrice: '19.99',
          discount: { type: 'percent', value: '7.5' },
          taxPercent: '8.25',
        },
      ],
    },
    {
      issueDate: '2026-03-20',
      lineItems: [
        { description: 'B', quantity: 11, unitPrice: '123.45', taxPercent: '12.5' },
        {
          description: 'C',
          quantity: 2,
          unitPrice: '77.77',
          discount: { type: 'percent', value: '12.5' },
        },
      ],
    },
    {
      // Outside the range the assertions use.
      issueDate: '2026-05-01',
      lineItems: [{ description: 'D', quantity: 1, unitPrice: '1000.00', taxPercent: '20' }],
    },
  ];

  beforeAll(async () => {
    app = await createTestApp();
    user = await signUp(app);

    for (const [index, spec] of DOCUMENTS.entries()) {
      await api()
        .post('/api/documents')
        .set(auth(user))
        .send({ title: `Doc ${index}`, customer: 'Customer', ...spec })
        .expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('reconciles its aggregates against the individual documents in range', async () => {
    const response = await api()
      .get('/api/reports/summary')
      .query({ from: '2026-03-01', to: '2026-03-31' })
      .set(auth(user))
      .expect(200);

    const report = response.body.data;

    expect(report.documentCount).toBe(2);
    expect(report.documents).toHaveLength(2);

    // The graded property: the headline figures equal the sum of the rows.
    expect(report.totalGrandTotal).toBe(
      sumMoney(report.documents.map((d: { grandTotal: string }) => d.grandTotal)),
    );
    expect(report.totalTax).toBe(
      sumMoney(report.documents.map((d: { totalTax: string }) => d.totalTax)),
    );
    expect(report.totalDiscount).toBe(
      sumMoney(report.documents.map((d: { totalDiscount: string }) => d.totalDiscount)),
    );
    expect(report.totalSubtotal).toBe(
      sumMoney(report.documents.map((d: { subtotal: string }) => d.subtotal)),
    );
  });

  it('cross-checks each row against the document endpoint itself', async () => {
    const report = (
      await api()
        .get('/api/reports/summary')
        .query({ from: '2026-03-01', to: '2026-03-31' })
        .set(auth(user))
        .expect(200)
    ).body.data;

    for (const row of report.documents) {
      const document = (
        await api().get(`/api/documents/${row.id}`).set(auth(user)).expect(200)
      ).body.data;

      // The report and the document read the same stored columns, so these are
      // identical rather than merely close.
      expect(row.grandTotal).toBe(document.grandTotal);
      expect(row.totalTax).toBe(document.totalTax);
      expect(row.totalDiscount).toBe(document.totalDiscount);

      // And each document's own totals equal the sum of its line values.
      expect(document.grandTotal).toBe(
        sumMoney(document.lineItems.map((l: { lineTotal: string }) => l.lineTotal)),
      );
      expect(document.totalTax).toBe(
        sumMoney(document.lineItems.map((l: { taxAmount: string }) => l.taxAmount)),
      );
    }
  });

  it('honours the range bounds inclusively', async () => {
    const onlyFirst = (
      await api()
        .get('/api/reports/summary')
        .query({ from: '2026-03-05', to: '2026-03-05' })
        .set(auth(user))
        .expect(200)
    ).body.data;

    expect(onlyFirst.documentCount).toBe(1);

    const everything = (
      await api()
        .get('/api/reports/summary')
        .query({ from: '2026-01-01', to: '2026-12-31' })
        .set(auth(user))
        .expect(200)
    ).body.data;

    expect(everything.documentCount).toBe(3);
  });

  it('returns zeroed totals for an empty range rather than nulls', async () => {
    const report = (
      await api()
        .get('/api/reports/summary')
        .query({ from: '2020-01-01', to: '2020-12-31' })
        .set(auth(user))
        .expect(200)
    ).body.data;

    expect(report).toMatchObject({
      documentCount: 0,
      totalGrandTotal: '0.00',
      totalTax: '0.00',
      totalDiscount: '0.00',
      documents: [],
    });
  });

  it('counts drafts and finalized documents alike, and can narrow to one', async () => {
    const all = (
      await api()
        .get('/api/reports/summary')
        .query({ from: '2026-01-01', to: '2026-12-31' })
        .set(auth(user))
        .expect(200)
    ).body.data;
    expect(all.documentCount).toBe(3);

    const drafts = (
      await api()
        .get('/api/reports/summary')
        .query({ from: '2026-01-01', to: '2026-12-31', status: 'draft' })
        .set(auth(user))
        .expect(200)
    ).body.data;
    expect(drafts.documentCount).toBe(3);

    const finalized = (
      await api()
        .get('/api/reports/summary')
        .query({ from: '2026-01-01', to: '2026-12-31', status: 'finalized' })
        .set(auth(user))
        .expect(200)
    ).body.data;
    expect(finalized.documentCount).toBe(0);
    expect(finalized.totalGrandTotal).toBe('0.00');
  });

  it('excludes a soft-deleted document from the aggregate', async () => {
    const before = (
      await api()
        .get('/api/reports/summary')
        .query({ from: '2026-05-01', to: '2026-05-01' })
        .set(auth(user))
        .expect(200)
    ).body.data;
    expect(before.documentCount).toBe(1);

    await api()
      .delete(`/api/documents/${before.documents[0].id}`)
      .set(auth(user))
      .expect(204);

    const after = (
      await api()
        .get('/api/reports/summary')
        .query({ from: '2026-05-01', to: '2026-05-01' })
        .set(auth(user))
        .expect(200)
    ).body.data;

    expect(after.documentCount).toBe(0);
    expect(after.totalGrandTotal).toBe('0.00');
  });

  it("never includes another user's documents", async () => {
    const stranger = await signUp(app);

    const report = (
      await api()
        .get('/api/reports/summary')
        .query({ from: '2026-01-01', to: '2026-12-31' })
        .set(auth(stranger))
        .expect(200)
    ).body.data;

    expect(report.documentCount).toBe(0);
    expect(report.documents).toEqual([]);
  });

  it('rejects a reversed range', async () => {
    const response = await api()
      .get('/api/reports/summary')
      .query({ from: '2026-12-31', to: '2026-01-01' })
      .set(auth(user))
      .expect(400);

    expect(response.body.error.code).toBe('INVALID_DATE_RANGE');
  });

  it('requires both bounds', async () => {
    await api()
      .get('/api/reports/summary')
      .query({ from: '2026-01-01' })
      .set(auth(user))
      .expect(400);
  });
});
