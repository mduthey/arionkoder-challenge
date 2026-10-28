import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db } from '~/db/client';

export function runMigrations(db: Db, migrationsFolder: string) {
	migrate(db, { migrationsFolder });
}
