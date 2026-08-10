import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { DiscountType } from '../entities/discount-type.enum';
import { IsMoneyString } from '../../common/validators/is-money-string.validator';

/**
 * The discount RULE the user supplies: one value plus a type tag.
 *
 * Modelling it this way — rather than as separate `discountPercent` and
 * `discountFixed` fields — means "percent and fixed at the same time" cannot be
 * expressed, so it never has to be validated against.
 */
export class DiscountDto {
  @IsEnum(DiscountType, { message: "Discount type must be 'percent' or 'fixed'." })
  type!: DiscountType;

  @IsMoneyString({ message: 'Discount value must be a number.' })
  value!: string;
}

export class CreateLineItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Description is required.' })
  @MaxLength(255)
  description!: string;

  @IsInt({ message: 'Quantity must be a whole number.' })
  @Min(1, { message: 'Quantity must be at least 1.' })
  quantity!: number;

  @IsMoneyString({ message: 'Unit price must be a number.' })
  unitPrice!: string;

  /**
   * `null` clears the discount. Absent leaves it untouched on a PATCH and means
   * "no discount" on a create.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  @Transform(({ value }) => (value === null || value === '' ? null : value))
  discount?: DiscountDto | null;

  @IsOptional()
  @IsMoneyString({ message: 'Tax percent must be a number.' })
  @Transform(({ value }) => (value === null || value === '' ? null : value))
  taxPercent?: string | null;
}

export class UpdateLineItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Description cannot be empty.' })
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsInt({ message: 'Quantity must be a whole number.' })
  @Min(1, { message: 'Quantity must be at least 1.' })
  quantity?: number;

  @IsOptional()
  @IsMoneyString({ message: 'Unit price must be a number.' })
  unitPrice?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountDto)
  @Transform(({ value }) => (value === null || value === '' ? null : value))
  discount?: DiscountDto | null;

  @IsOptional()
  @IsMoneyString({ message: 'Tax percent must be a number.' })
  @Transform(({ value }) => (value === null || value === '' ? null : value))
  taxPercent?: string | null;
}
