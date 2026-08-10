import type { DataSourceOptions } from 'typeorm';

/**
 * Single source of truth for connection options, shared by the Nest module and
 * the standalone CLI DataSource so migrations always run against the same
 * schema definition the app uses.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to apps/api/.env.');
  }

  // Managed Postgres (Neon) requires TLS but presents a chain Node does not
  // ship a root for; verification is relaxed only outside local development.
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    type: 'postgres',
    url,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    // Never true. The schema is owned by the migrations in database/migrations,
    // which are part of the deliverable and the only safe path in production.
    synchronize: false,
    logging: process.env.TYPEORM_LOGGING === 'true',
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  };
}
