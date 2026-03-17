import {AwsRegion} from '@remotion/lambda';
import {z} from 'zod';

const serverEnvSchema = z.object({
	REMOTION_AWS_BUCKET_NAME: z.string(),
	REMOTION_AWS_REGION: z.custom<AwsRegion>(),
	OPENAI_API_KEY: z.string().optional(),
	REMOTION_AWS_TRANSFER_ACCELERATION: z.string().optional(),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let _cachedServerEnv: ServerEnv | null = null;
let _validationError: Error | null = null;

const getServerEnv = (): ServerEnv | null => {
	if (_cachedServerEnv) {
		return _cachedServerEnv;
	}

	if (_validationError) {
		return null;
	}

	try {
		_cachedServerEnv = serverEnvSchema.parse(process.env);
		return _cachedServerEnv;
	} catch (error) {
		_validationError = error as Error;
		// eslint-disable-next-line no-console
		console.warn(
			'Server environment variables not configured:',
			error instanceof Error ? error.message : error,
		);
		return null;
	}
};

export const requireServerEnv = (): ServerEnv => {
	const env = getServerEnv();
	if (!env) {
		throw new Error(
			'Environment variables are not configured. Please copy .env.example to .env and configure the required values.',
		);
	}
	return env;
};
