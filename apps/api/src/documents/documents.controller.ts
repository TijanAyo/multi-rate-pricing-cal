import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { DocumentsService } from './documents.service';
import {
  toDocumentSummaryView,
  toDocumentView,
  type DocumentSummaryView,
  type DocumentView,
} from './documents.presenter';
import {
  CreateDocumentDto,
  ListDocumentsQueryDto,
  UpdateDocumentDto,
} from './dto/document.dto';
import { CreateLineItemDto, UpdateLineItemDto } from './dto/line-item.dto';

/**
 * Every handler scopes to the authenticated user. There is no admin path and no
 * way to read another user's document — ownership is a WHERE clause on every
 * query, not a check that could be forgotten.
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDocumentsQueryDto,
  ): Promise<DocumentSummaryView[]> {
    const documents = await this.documentsService.findAll(user.id, query);
    return documents.map(toDocumentSummaryView);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentView> {
    return toDocumentView(await this.documentsService.findOne(user.id, id));
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDocumentDto,
  ): Promise<DocumentView> {
    return toDocumentView(await this.documentsService.create(user.id, dto));
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
  ): Promise<DocumentView> {
    return toDocumentView(await this.documentsService.update(user.id, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.documentsService.remove(user.id, id);
  }

  /**
   * A dedicated endpoint rather than `PATCH { status: 'finalized' }`: this is a
   * state transition with validation and side effects, and keeping it off the
   * generic edit route means status cannot be flipped as if it were a field.
   */
  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  async finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentView> {
    return toDocumentView(await this.documentsService.finalize(user.id, id));
  }

  @Post(':id/duplicate')
  async duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentView> {
    return toDocumentView(await this.documentsService.duplicate(user.id, id));
  }

  // ── line items ───────────────────────────────────────────────────────────
  // All three return the full document, because any line change moves the
  // document totals and the client needs the fresh figures.

  @Post(':id/line-items')
  async addLineItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLineItemDto,
  ): Promise<DocumentView> {
    return toDocumentView(await this.documentsService.addLineItem(user.id, id, dto));
  }

  @Patch(':id/line-items/:lineItemId')
  async updateLineItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineItemId', ParseUUIDPipe) lineItemId: string,
    @Body() dto: UpdateLineItemDto,
  ): Promise<DocumentView> {
    return toDocumentView(
      await this.documentsService.updateLineItem(user.id, id, lineItemId, dto),
    );
  }

  @Delete(':id/line-items/:lineItemId')
  @HttpCode(HttpStatus.OK)
  async removeLineItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineItemId', ParseUUIDPipe) lineItemId: string,
  ): Promise<DocumentView> {
    return toDocumentView(
      await this.documentsService.removeLineItem(user.id, id, lineItemId),
    );
  }
}
