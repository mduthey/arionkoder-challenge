import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '~/db/schema';

export function createDb(url: string) {
	if (url !== ':memory:') {
		mkdirSync(dirname(url), { recursive: true });
	}
	const sqlite = new Database(url);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');
	return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;
