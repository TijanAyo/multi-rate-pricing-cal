import { Injectable } from '@nestjs/common';
import { calculateDocument, type LineInput } from '@pricing/calc';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { toMoneyString } from '../common/validators/is-money-string.validator';
import { ApiError } from '../common/http/api-error';
import type {
  CreateDocumentDto,
  ListDocumentsQueryDto,
  UpdateDocumentDto,
} from './dto/document.dto';
import type { CreateLineItemDto, UpdateLineItemDto } from './dto/line-item.dto';
import { DocumentStatus } from './entities/document-status.enum';
import { Document } from './entities/document.entity';
import { LineItem } from './entities/line-item.entity';

@Injectable()
export class DocumentsService {
  constructor(private readonly dataSource: DataSource) {}

  // ── reads ────────────────────────────────────────────────────────────────

  async findAll(userId: string, query: ListDocumentsQueryDto): Promise<Document[]> {
    return this.documents().find({
      where: {
        userId,
        ...(query.status ? { status: query.status } : {}),
      },
      order: { issueDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, documentId: string): Promise<Document> {
    return this.findOwnedOrThrow(this.dataSource.manager, userId, documentId);
  }

  // ── document lifecycle ───────────────────────────────────────────────────

  async create(userId: string, dto: CreateDocumentDto): Promise<Document> {
    return this.dataSource.transaction(async (manager) => {
      const document = manager.create(Document, {
        userId,
        title: dto.title,
        customer: dto.customer,
        issueDate: dto.issueDate,
        status: DocumentStatus.DRAFT,
        lineItems: (dto.lineItems ?? []).map((line, index) =>
          manager.create(LineItem, { ...this.toLineColumns(line), position: index }),
        ),
      });

      this.recalculate(document);
      return manager.save(Document, document);
    });
  }

  async update(userId: string, documentId: string, dto: UpdateDocumentDto): Promise<Document> {
    return this.dataSource.transaction(async (manager) => {
      const document = await this.findOwnedForUpdate(manager, userId, documentId);
      this.assertEditable(document);

      if (dto.title !== undefined) document.title = dto.title;
      if (dto.customer !== undefined) document.customer = dto.customer;
      if (dto.issueDate !== undefined) document.issueDate = dto.issueDate;

      // Metadata cannot change any amount, but recalculating unconditionally
      // means there is exactly one way for a document to be saved — no path
      // where a future edit forgets to refresh the totals.
      this.recalculate(document);
      return manager.save(Document, document);
    });
  }

  async remove(userId: string, documentId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const document = await this.findOwnedForUpdate(manager, userId, documentId);
      // Soft delete, so the row survives for audit while dropping out of every
      // ordinary query — including the summary report.
      await manager.softRemove(Document, document);
    });
  }

  async finalize(userId: string, documentId: string): Promise<Document> {
    return this.dataSource.transaction(async (manager) => {
      const document = await this.findOwnedForUpdate(manager, userId, documentId);

      if (document.status === DocumentStatus.FINALIZED) {
        throw ApiError.badRequest(
          'ALREADY_FINALIZED',
          'This document has already been finalized.',
        );
      }

      if (document.lineItems.length === 0) {
        throw ApiError.badRequest(
          'NO_LINE_ITEMS',
          'A document must have at least one line item before it can be finalized.',
        );
      }

      // Stretch goal: refuse to freeze a document that contains a bad line.
      // Once finalized it can never be corrected, so this is the last chance to
      // catch a row that predates a validation rule.
      for (const line of document.lineItems) {
        if (line.quantity < 1) {
          throw ApiError.badRequest(
            'INVALID_LINE_ON_FINALIZE',
            `Line "${line.description}" has a quantity below 1 and cannot be finalized.`,
          );
        }
        if (Number(line.unitPrice) < 0) {
          throw ApiError.badRequest(
            'INVALID_LINE_ON_FINALIZE',
            `Line "${line.description}" has a negative unit price and cannot be finalized.`,
          );
        }
      }

      // Recompute one last time so the frozen amounts are provably current.
      this.recalculate(document);
      document.status = DocumentStatus.FINALIZED;
      return manager.save(Document, document);
    });
  }

  /**
   * Stretch goal: copy a document (finalized or draft) into a fresh draft.
   *
   * Only the INPUTS are copied — quantity, price, discount rule, tax rule. The
   * amounts are then recomputed from scratch, so every stored figure in the
   * system traces back to @pricing/calc rather than to another row.
   */
  async duplicate(userId: string, documentId: string): Promise<Document> {
    return this.dataSource.transaction(async (manager) => {
      const source = await this.findOwnedOrThrow(manager, userId, documentId);

      const copy = manager.create(Document, {
        userId,
        title: `${source.title} (copy)`,
        customer: source.customer,
        issueDate: today(),
        status: DocumentStatus.DRAFT,
        lineItems: source.lineItems
          .slice()
          .sort(byPosition)
          .map((line, index) =>
            manager.create(LineItem, {
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountType: line.discountType,
              discountValue: line.discountValue,
              taxPercent: line.taxPercent,
              position: index,
            }),
          ),
      });

      this.recalculate(copy);
      return manager.save(Document, copy);
    });
  }

  // ── line items ───────────────────────────────────────────────────────────
  // Each returns the whole document: a line change moves the document totals,
  // so returning only the line would leave the client's totals stale.

  async addLineItem(
    userId: string,
    documentId: string,
    dto: CreateLineItemDto,
  ): Promise<Document> {
    return this.mutateLines(userId, documentId, (document, manager) => {
      const nextPosition =
        document.lineItems.reduce((max, line) => Math.max(max, line.position), -1) + 1;

      document.lineItems.push(
        manager.create(LineItem, { ...this.toLineColumns(dto), position: nextPosition }),
      );
    });
  }

  async updateLineItem(
    userId: string,
    documentId: string,
    lineItemId: string,
    dto: UpdateLineItemDto,
  ): Promise<Document> {
    return this.mutateLines(userId, documentId, (document) => {
      const line = document.lineItems.find((candidate) => candidate.id === lineItemId);
      if (!line) {
        throw ApiError.notFound('LINE_ITEM_NOT_FOUND', 'This line item does not exist.');
      }

      if (dto.description !== undefined) line.description = dto.description;
      if (dto.quantity !== undefined) line.quantity = dto.quantity;
      if (dto.unitPrice !== undefined) line.unitPrice = toMoneyString(dto.unitPrice);

      // `null` clears the rule; `undefined` leaves it alone.
      //
      // Tested against `undefined` rather than with the `in` operator: under
      // ES2022 class-field semantics every declared property exists on the
      // instance, so `'taxPercent' in dto` is true even when the client never
      // sent it — which would silently wipe the tax rule on any other edit.
      if (dto.discount !== undefined) {
        const discount = dto.discount;
        line.discountType = discount ? discount.type : null;
        line.discountValue = discount ? toMoneyString(discount.value) : null;
      }
      if (dto.taxPercent !== undefined) {
        line.taxPercent = dto.taxPercent === null ? null : toMoneyString(dto.taxPercent);
      }
    });
  }

  async removeLineItem(
    userId: string,
    documentId: string,
    lineItemId: string,
  ): Promise<Document> {
    return this.mutateLines(userId, documentId, async (document, manager) => {
      const line = document.lineItems.find((candidate) => candidate.id === lineItemId);
      if (!line) {
        throw ApiError.notFound('LINE_ITEM_NOT_FOUND', 'This line item does not exist.');
      }

      document.lineItems = document.lineItems.filter(
        (candidate) => candidate.id !== lineItemId,
      );
      // Removed for real rather than soft-deleted: a line item has no meaning
      // outside its document, and the document itself is what gets soft-deleted.
      await manager.delete(LineItem, { id: lineItemId });
    });
  }

  // ── the shared write path ────────────────────────────────────────────────

  /**
   * The single funnel every line-item mutation passes through: load with a
   * lock, refuse if finalized, mutate, recalculate, save.
   *
   * Keeping it in one place is what guarantees the stored totals can never go
   * stale — there is no way to write a line item without recalculating.
   */
  private async mutateLines(
    userId: string,
    documentId: string,
    mutate: (document: Document, manager: EntityManager) => void | Promise<void>,
  ): Promise<Document> {
    return this.dataSource.transaction(async (manager) => {
      const document = await this.findOwnedForUpdate(manager, userId, documentId);
      this.assertEditable(document);

      await mutate(document, manager);

      this.recalculate(document);
      return manager.save(Document, document);
    });
  }

  /**
   * Runs the shared calculation module over the document's line inputs and
   * writes the results onto the entities.
   *
   * This is the ONLY place any amount is ever assigned. The API does not accept
   * a client-supplied total anywhere, which is what makes the server the source
   * of truth rather than a place the client's arithmetic is stored.
   */
  private recalculate(document: Document): void {
    const lines = document.lineItems.slice().sort(byPosition);

    const inputs: LineInput[] = lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount:
        line.discountType && line.discountValue !== null
          ? { type: line.discountType, value: line.discountValue }
          : null,
      taxPercent: line.taxPercent,
    }));

    // A CalculationError thrown here carries its own code, field and lineIndex,
    // which the global exception filter turns into a specific 400.
    const result = calculateDocument(inputs);

    lines.forEach((line, index) => {
      const computed = result.lines[index]!;
      line.subtotal = computed.subtotal;
      line.discountAmount = computed.discountAmount;
      line.taxAmount = computed.taxAmount;
      line.lineTotal = computed.lineTotal;
    });

    document.subtotal = result.subtotal;
    document.totalDiscount = result.totalDiscount;
    document.totalTax = result.totalTax;
    document.grandTotal = result.grandTotal;
  }

  /** Refuses any write to a finalized document. Called on every write path. */
  private assertEditable(document: Document): void {
    if (document.status === DocumentStatus.FINALIZED) {
      throw ApiError.forbidden(
        'DOCUMENT_FINALIZED',
        'This document is finalized and can no longer be modified.',
      );
    }
  }

  /**
   * 404 — never 403 — when the document belongs to someone else, so the API
   * cannot be used to discover which document ids exist.
   */
  private async findOwnedOrThrow(
    manager: EntityManager,
    userId: string,
    documentId: string,
  ): Promise<Document> {
    const document = await manager.findOne(Document, { where: { id: documentId, userId } });
    if (!document) {
      throw ApiError.notFound('DOCUMENT_NOT_FOUND', 'This document does not exist.');
    }
    document.lineItems = (document.lineItems ?? []).slice().sort(byPosition);
    return document;
  }

  /**
   * Same as above but takes a row-level write lock, so two concurrent edits —
   * or an edit racing a finalize — serialise instead of interleaving and
   * leaving the stored totals inconsistent with the lines.
   */
  private async findOwnedForUpdate(
    manager: EntityManager,
    userId: string,
    documentId: string,
  ): Promise<Document> {
    const document = await manager.findOne(Document, {
      where: { id: documentId, userId },
      lock: { mode: 'pessimistic_write' },
      // A lock cannot be taken across the eager left join, so line items are
      // loaded separately below.
      relations: {},
      loadEagerRelations: false,
    });

    if (!document) {
      throw ApiError.notFound('DOCUMENT_NOT_FOUND', 'This document does not exist.');
    }

    document.lineItems = await manager.find(LineItem, {
      where: { documentId: document.id },
      order: { position: 'ASC' },
    });

    return document;
  }

  private documents(): Repository<Document> {
    return this.dataSource.getRepository(Document);
  }

  /** Maps a validated DTO onto the entity's input columns. */
  private toLineColumns(dto: CreateLineItemDto): Partial<LineItem> {
    return {
      description: dto.description,
      quantity: dto.quantity,
      unitPrice: toMoneyString(dto.unitPrice),
      discountType: dto.discount ? dto.discount.type : null,
      discountValue: dto.discount ? toMoneyString(dto.discount.value) : null,
      taxPercent: dto.taxPercent == null ? null : toMoneyString(dto.taxPercent),
    };
  }
}

const byPosition = (a: LineItem, b: LineItem): number => a.position - b.position;

/** Today as a bare calendar date, matching the `date` column's format. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
