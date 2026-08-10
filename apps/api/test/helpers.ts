import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/http/validation-exception.factory';

/**
 * Boots the application with the SAME global pipes, filters and interceptors as
 * `main.ts`. Tests that ran without them would prove nothing about the envelope
 * or the validation behaviour a real client sees.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.init();
  return app;
}

export interface TestUser {
  email: string;
  token: string;
  id: string;
}

let userCounter = 0;

/** Registers a fresh user so tests never contend over the same rows. */
export async function signUp(app: INestApplication): Promise<TestUser> {
  const email = `e2e-${Date.now()}-${userCounter++}@example.com`;

  const response = await request(app.getHttpServer() as App)
    .post('/api/auth/signup')
    .send({ email, password: 'Password123!' })
    .expect(201);

  return {
    email,
    id: response.body.data.user.id,
    token: response.body.data.accessToken,
  };
}

export const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

/** The assignment's worked example, as a request payload. */
export const SAMPLE_LINE_ITEMS = [
  {
    description: 'Widget A',
    quantity: 2,
    unitPrice: '100.00',
    discount: { type: 'percent', value: '10' },
    taxPercent: '5',
  },
  { description: 'Widget B', quantity: 1, unitPrice: '50.00', taxPercent: '5' },
  {
    description: 'Service fee',
    quantity: 1,
    unitPrice: '200.00',
    discount: { type: 'fixed', value: '20' },
  },
];

export const SAMPLE_TOTALS = {
  subtotal: '450.00',
  totalDiscount: '40.00',
  totalTax: '11.50',
  grandTotal: '421.50',
};
