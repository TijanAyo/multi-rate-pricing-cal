import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';

import { ApiError } from '../common/http/api-error';
import {
  toDocumentSummaryView,
  type DocumentSummaryView,
} from '../documents/documents.presenter';
import { Document } from '../documents/entities/document.entity';
import type { SummaryQueryDto } from './dto/summary-query.dto';

export interface SummaryReport {
  from: string;
  to: string;
  documentCount: number;
  totalGrandTotal: string;
  totalTax: string;
  totalDiscount: string;
  totalSubtotal: string;
  /** The rows the aggregates are made of, so the two can be checked by eye. */
  documents: DocumentSummaryView[];
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Document)
    private readonly documents: Repository<Document>,
  ) {}

  /**
   * Aggregates the STORED, already-rounded document totals.
   *
   * It deliberately does not call @pricing/calc. Re-deriving the amounts here
   * would be a second implementation that could drift from the first; summing
   * the same values the documents themselves display makes "report totals match
   * the documents in range" true by construction rather than by coincidence.
   */
  async summary(userId: string, query: SummaryQueryDto): Promise<SummaryReport> {
    const { from, to } = query;

    if (from > to) {
      throw ApiError.badRequest(
        'INVALID_DATE_RANGE',
        'The start of the range must not be after its end.',
        'from',
      );
    }

    const where = {
      userId,
      issueDate: Between(from, to),
      deletedAt: IsNull(),
      ...(query.status ? { status: query.status } : {}),
    };

    // Two queries over the same predicate. The aggregate is done in SQL so the
    // report stays O(1) in payload as the document count grows; the rows are
    // fetched for display and for the reconciliation check.
    const [totals, documents] = await Promise.all([
      this.documents
        .createQueryBuilder('document')
        .select('COUNT(*)', 'documentCount')
        .addSelect('COALESCE(SUM(document.subtotal), 0)', 'totalSubtotal')
        .addSelect('COALESCE(SUM(document.total_discount), 0)', 'totalDiscount')
        .addSelect('COALESCE(SUM(document.total_tax), 0)', 'totalTax')
        .addSelect('COALESCE(SUM(document.grand_total), 0)', 'totalGrandTotal')
        .where('document.user_id = :userId', { userId })
        .andWhere('document.issue_date BETWEEN :from AND :to', { from, to })
        .andWhere('document.deleted_at IS NULL')
        .andWhere(query.status ? 'document.status = :status' : '1=1', {
          status: query.status,
        })
        .getRawOne<RawTotals>(),
      this.documents.find({ where, order: { issueDate: 'DESC', createdAt: 'DESC' } }),
    ]);

    return {
      from,
      to,
      documentCount: Number(totals?.documentCount ?? 0),
      // `SUM` over `numeric` comes back as a string from the pg driver, which
      // is exactly what we want — it is passed through untouched.
      totalSubtotal: money(totals?.totalSubtotal),
      totalDiscount: money(totals?.totalDiscount),
      totalTax: money(totals?.totalTax),
      totalGrandTotal: money(totals?.totalGrandTotal),
      documents: documents.map(toDocumentSummaryView),
    };
  }
}

interface RawTotals {
  documentCount: string;
  totalSubtotal: string;
  totalDiscount: string;
  totalTax: string;
  totalGrandTotal: string;
}

/** Normalises a numeric sum to a canonical 2dp string ('0' -> '0.00'). */
function money(value: string | undefined): string {
  if (!value) return '0.00';
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}
