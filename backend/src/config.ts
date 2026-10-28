import { resolve } from 'node:path';
import { z } from 'zod';

const configSchema = z.object({
	PORT: z.coerce.number().int().min(0).max(65535).default(3000),
	HOST: z.string().min(1).default('0.0.0.0'),
	LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
	DATABASE_URL: z.string().min(1).default('./data/app.db'),
	MIGRATIONS_DIR: z.string().min(1).optional(),
	CLINIC_TIMEZONE: z.string().min(1).default('America/Argentina/Buenos_Aires').refine(isValidTimeZone, {
		message: 'Unknown IANA time zone',
	}),
	// An empty value (as in `.env.example`) means "no assistant".
	AI_GATEWAY_API_KEY: z
		.string()
		.optional()
		.transform(v => v || undefined),
	AI_MODEL: z.string().min(1).default('anthropic/claude-haiku-5.5'),
});

export type Config = {
	port: number;
	host: string;
	logLevel: z.infer<typeof configSchema>['LOG_LEVEL'];
	databaseUrl: string;
	migrationsDir: string;
	clinicTimezone: string;
	aiGatewayApiKey: string | undefined;
	aiModel: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const parsed = configSchema.parse(env);
	return {
		port: parsed.PORT,
		host: parsed.HOST,
		logLevel: parsed.LOG_LEVEL,
		databaseUrl: parsed.DATABASE_URL,
		migrationsDir: parsed.MIGRATIONS_DIR ?? resolve(process.cwd(), 'drizzle'),
		clinicTimezone: parsed.CLINIC_TIMEZONE,
		aiGatewayApiKey: parsed.AI_GATEWAY_API_KEY,
		aiModel: parsed.AI_MODEL,
	};
}

function isValidTimeZone(timeZone: string) {
	try {
		new Intl.DateTimeFormat('en', { timeZone });
		return true;
	} catch {
		return false;
	}
}
