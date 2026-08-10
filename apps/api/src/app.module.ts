import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CalcModule } from './calc/calc.module';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { buildDataSourceOptions } from './config/typeorm.config';
import { DocumentsModule } from './documents/documents.module';
import { HealthController } from './health.controller';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: buildDataSourceOptions }),
    UsersModule,
    AuthModule,
    DocumentsModule,
    CalcModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Authentication is global and must be waived per-route with @Public(),
    // so a new endpoint added without any decorator fails closed.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
