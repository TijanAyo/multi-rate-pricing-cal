import { Controller, Get, Query } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { ReportsService, type SummaryReport } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SummaryQueryDto,
  ): Promise<SummaryReport> {
    return this.reportsService.summary(user.id, query);
  }
}
