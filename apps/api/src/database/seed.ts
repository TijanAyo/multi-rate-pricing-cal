import 'reflect-metadata';

import { calculateDocument, type LineInput } from '@pricing/calc';
import * as bcrypt from 'bcryptjs';
import type { DataSource, EntityManager } from 'typeorm';

import { DiscountType } from '../documents/entities/discount-type.enum';
import { DocumentStatus } from '../documents/entities/document-status.enum';
import { Document } from '../documents/entities/document.entity';
import { LineItem } from '../documents/entities/line-item.entity';
import { User } from '../users/entities/user.entity';
import dataSource from './data-source';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'Password123!';

interface SeedLine {
  description: string;
  quantity: number;
  unitPrice: string;
  discountType?: DiscountType;
  discountValue?: string;
  taxPercent?: string;
}

interface SeedDocument {
  title: string;
  customer: string;
  issueDate: string;
  status: DocumentStatus;
  lines: SeedLine[];
}

const SEED_DOCUMENTS: SeedDocument[] = [
  {
    // The assignment's worked example, verbatim. Opening this document should
    // show 450.00 / 40.00 / 11.50 / 421.50 — the published expected totals.
    title: 'Sample document (assignment worked example)',
    customer: 'Acme Corp',
    issueDate: '2026-08-01',
    status: DocumentStatus.DRAFT,
    lines: [
      {
        description: 'Widget A',
        quantity: 2,
        unitPrice: '100.00',
        discountType: DiscountType.PERCENT,
        discountValue: '10',
        taxPercent: '5',
      },
      { description: 'Widget B', quantity: 1, unitPrice: '50.00', taxPercent: '5' },
      {
        description: 'Service fee',
        quantity: 1,
        unitPrice: '200.00',
        discountType: DiscountType.FIXED,
        discountValue: '20',
      },
    ],
  },
  {
    title: 'Website redesign',
    customer: 'Alden & Co',
    issueDate: '2026-07-14',
    status: DocumentStatus.FINALIZED,
    lines: [
      { description: 'Discovery & scoping', quantity: 10, unitPrice: '150.00' },
      {
        description: 'UI design (5 screens)',
        quantity: 1,
        unitPrice: '4200.00',
        discountType: DiscountType.FIXED,
        discountValue: '200',
        taxPercent: '8',
      },
      {
        description: 'Frontend build',
        quantity: 1,
        unitPrice: '6800.00',
        discountType: DiscountType.PERCENT,
        discountValue: '5',
        taxPercent: '8',
      },
    ],
  },
  {
    title: 'Q3 support retainer',
    customer: 'Nordfjell Logistics',
    issueDate: '2026-08-01',
    status: DocumentStatus.DRAFT,
    lines: [
      { description: 'Monthly retainer', quantity: 3, unitPrice: '1200.00' },
      {
        description: 'Emergency hours',
        quantity: 4,
        unitPrice: '95.00',
        discountType: DiscountType.PERCENT,
        discountValue: '10',
      },
    ],
  },
  {
    title: 'Brand identity package',
    customer: 'Marlowe Studio',
    // Deliberately in a different month, so a narrowed report range visibly
    // excludes it rather than appearing to do nothing.
    issueDate: '2026-06-22',
    status: DocumentStatus.FINALIZED,
    lines: [
      { description: 'Logo suite', quantity: 1, unitPrice: '2400.00', taxPercent: '5' },
      {
        description: 'Brand guidelines',
        quantity: 1,
        unitPrice: '1600.00',
        discountType: DiscountType.FIXED,
        discountValue: '100',
        taxPercent: '5',
      },
    ],
  },
];

async function seed(source: DataSource): Promise<void> {
  await source.transaction(async (manager) => {
    const user = await upsertDemoUser(manager);

    // Idempotent: re-running the seed replaces the demo data rather than
    // stacking duplicates on top of it.
    const existing = await manager.find(Document, {
      where: { userId: user.id },
      withDeleted: true,
    });
    if (existing.length > 0) {
      await manager.delete(Document, { userId: user.id });
      console.log(`Removed ${existing.length} existing document(s) for ${DEMO_EMAIL}.`);
    }

    for (const spec of SEED_DOCUMENTS) {
      await insertDocument(manager, user.id, spec);
    }
  });
}

async function upsertDemoUser(manager: EntityManager): Promise<User> {
  const existing = await manager.findOne(User, { where: { email: DEMO_EMAIL } });
  if (existing) return existing;

  const user = manager.create(User, {
    email: DEMO_EMAIL,
    passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
  });
  return manager.save(User, user);
}

async function insertDocument(
  manager: EntityManager,
  userId: string,
  spec: SeedDocument,
): Promise<void> {
  const inputs: LineInput[] = spec.lines.map((line) => ({
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discount:
      line.discountType && line.discountValue !== undefined
        ? { type: line.discountType, value: line.discountValue }
        : null,
    taxPercent: line.taxPercent ?? null,
  }));

  // The seed runs its amounts through the SAME module the API uses, so seeded
  // rows are indistinguishable from ones a user created by hand. Hard-coding
  // the numbers here would let the fixtures drift from the real behaviour.
  const totals = calculateDocument(inputs);

  const document = manager.create(Document, {
    userId,
    title: spec.title,
    customer: spec.customer,
    issueDate: spec.issueDate,
    status: spec.status,
    subtotal: totals.subtotal,
    totalDiscount: totals.totalDiscount,
    totalTax: totals.totalTax,
    grandTotal: totals.grandTotal,
    lineItems: spec.lines.map((line, index) =>
      manager.create(LineItem, {
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        position: index,
        discountType: line.discountType ?? null,
        discountValue: line.discountValue ?? null,
        taxPercent: line.taxPercent ?? null,
        subtotal: totals.lines[index]!.subtotal,
        discountAmount: totals.lines[index]!.discountAmount,
        taxAmount: totals.lines[index]!.taxAmount,
        lineTotal: totals.lines[index]!.lineTotal,
      }),
    ),
  });

  await manager.save(Document, document);

  console.log(
    `  ${spec.title.padEnd(46)} ${spec.status.padEnd(10)} grand total ${totals.grandTotal}`,
  );
}

async function main(): Promise<void> {
  const source = await dataSource.initialize();
  try {
    console.log(`Seeding ${DEMO_EMAIL} ...`);
    await seed(source);
    console.log(`\nDone. Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } finally {
    await source.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
