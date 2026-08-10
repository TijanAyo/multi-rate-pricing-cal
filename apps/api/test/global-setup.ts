import { config } from 'dotenv';
import { Client } from 'pg';
import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../src/config/typeorm.config';

/**
 * Creates the test database if it does not exist, then brings it up to the
 * latest migration.
 *
 * Running the real migrations — rather than `synchronize: true` — means the
 * tests exercise the same schema production gets, including the partial unique
 * index and the check constraints that `synchronize` would happily skip.
 */
export default async function globalSetup(): Promise<void> {
  config({ path: '.env' });

  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to apps/api/.env.');
  }

  const testUrl =
    process.env.TEST_DATABASE_URL ?? baseUrl.replace(/\/([^/?]+)(\?|$)/, '/pricing_test$2');
  const testDatabaseName = new URL(testUrl).pathname.slice(1);

  // Connect to the maintenance database to issue CREATE DATABASE, which cannot
  // run inside the database it is creating.
  const admin = new Client({ connectionString: baseUrl.replace(/\/[^/?]+(\?|$)/, '/postgres$1') });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      testDatabaseName,
    ]);
    if (rowCount === 0) {
      // Identifier cannot be parameterised; the name is derived from our own
      // connection string, not from user input.
      await admin.query(`CREATE DATABASE "${testDatabaseName}"`);
    }
  } finally {
    await admin.end();
  }

  process.env.DATABASE_URL = testUrl;
  process.env.NODE_ENV = 'test';

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
