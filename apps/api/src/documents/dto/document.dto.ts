import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { IsCalendarDate } from '../../common/validators/is-calendar-date.validator';

import { DocumentStatus } from '../entities/document-status.enum';
import { CreateLineItemDto } from './line-item.dto';

export class CreateDocumentDto {
  @IsString()
  @IsNotEmpty({ message: 'Title is required.' })
  @MaxLength(255)
  title!: string;

  @IsString()
  @IsNotEmpty({ message: 'Customer is required.' })
  @MaxLength(255)
  customer!: string;

  @IsCalendarDate({ message: 'Issue date must be a calendar date in YYYY-MM-DD form.' })
  issueDate!: string;

  /** Optional: a document can be created empty and filled in line by line. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLineItemDto)
  lineItems?: CreateLineItemDto[];
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Title cannot be empty.' })
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Customer cannot be empty.' })
  @MaxLength(255)
  customer?: string;

  @IsOptional()
  @IsCalendarDate({ message: 'Issue date must be a calendar date in YYYY-MM-DD form.' })
  issueDate?: string;

  // `status` is deliberately absent. Finalizing is a state transition with
  // validation and side effects, so it goes through POST /:id/finalize rather
  // than being flippable through the generic edit route.
}

export class ListDocumentsQueryDto {
  @IsOptional()
  @IsEnum(DocumentStatus, { message: "Status must be 'draft' or 'finalized'." })
  status?: DocumentStatus;
}
