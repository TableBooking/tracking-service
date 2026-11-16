import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
import { readFileSync } from 'node:fs';
export function ssl() {
  return process.env.DB_SSL_ENABLED === 'false'
    ? false
    : {
        rejectUnauthorized: true,
        ...(process.env.DB_SSL_CA_PATH
          ? { ca: readFileSync(process.env.DB_SSL_CA_PATH, 'utf8') }
          : {}),
      };
}
