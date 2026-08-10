import { IsEnum, IsOptional } from 'class-validator';

import { IsCalendarDate } from '../../common/validators/is-calendar-date.validator';
import { DocumentStatus } from '../../documents/entities/document-status.enum';

export class SummaryQueryDto {
  /** Inclusive lower bound on issue date. */
  @IsCalendarDate({ message: '"from" must be a calendar date in YYYY-MM-DD form.' })
  from!: string;

  /** Inclusive upper bound on issue date. */
  @IsCalendarDate({ message: '"to" must be a calendar date in YYYY-MM-DD form.' })
  to!: string;

  /**
   * Optional narrowing. Omitted, the report covers BOTH drafts and finalized
   * documents — the assignment asks for "number of documents" without
   * qualification, and silently dropping drafts would make a user's own
   * document list disagree with their report.
   */
  @IsOptional()
  @IsEnum(DocumentStatus, { message: "Status must be 'draft' or 'finalized'." })
  status?: DocumentStatus;
}
