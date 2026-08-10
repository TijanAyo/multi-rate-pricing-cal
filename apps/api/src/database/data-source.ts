import { config } from 'dotenv';
import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../config/typeorm.config';

// The TypeORM CLI runs outside Nest, so it loads the env file itself.
config({ path: process.env.ENV_FILE ?? '.env' });

export default new DataSource(buildDataSourceOptions());
