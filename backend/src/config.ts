import { z } from 'zod';

const configSchema = z.object({
	PORT: z.coerce.number().int().min(0).max(65535).default(3000),
	HOST: z.string().min(1).default('0.0.0.0'),
	LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = {
	port: number;
	host: string;
	logLevel: z.infer<typeof configSchema>['LOG_LEVEL'];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const parsed = configSchema.parse(env);
	return {
		port: parsed.PORT,
		host: parsed.HOST,
		logLevel: parsed.LOG_LEVEL,
	};
}
