import { Module } from '@nestjs/common';

import { CalcController } from './calc.controller';

@Module({
  controllers: [CalcController],
})
export class CalcModule {}
