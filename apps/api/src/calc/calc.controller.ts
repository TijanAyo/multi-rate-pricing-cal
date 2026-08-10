import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { calculateDocument, type DocumentResult, type LineInput } from '@pricing/calc';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';

import { toMoneyString } from '../common/validators/is-money-string.validator';
import { CreateLineItemDto } from '../documents/dto/line-item.dto';

export class PreviewDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLineItemDto)
  lineItems!: CreateLineItemDto[];
}

@Controller('calc')
export class CalcController {
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: PreviewDto): DocumentResult {
    const inputs: LineInput[] = dto.lineItems.map((line) => ({
      quantity: line.quantity,
      unitPrice: toMoneyString(line.unitPrice),
      discount: line.discount
        ? { type: line.discount.type, value: toMoneyString(line.discount.value) }
        : null,
      taxPercent: line.taxPercent == null ? null : toMoneyString(line.taxPercent),
    }));

    return calculateDocument(inputs);
  }
}
