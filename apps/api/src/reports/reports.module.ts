import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Document } from '../documents/entities/document.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([Document])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
