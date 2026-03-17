import {
	CopyObjectCommand,
	DeleteObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

function getClient(): S3Client {
	const endpoint = process.env.STORAGE_ENDPOINT;
	const region = process.env.STORAGE_REGION ?? "auto";
	const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
	const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;

	if (!endpoint || !accessKeyId || !secretAccessKey) {
		throw new Error(
			"R2 env vars are not set (STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY)",
		);
	}

	return new S3Client({
		region,
		endpoint,
		credentials: { accessKeyId, secretAccessKey },
		// Required for R2: disable host-style bucket addressing
		forcePathStyle: true,
	});
}

function getBucket(): string {
	const bucket = process.env.STORAGE_BUCKET;
	if (!bucket) throw new Error("STORAGE_BUCKET env var is not set");
	return bucket;
}

/**
 * Fetch a file from `sourceUrl` and upload it to R2 at `storageKey`.
 * Returns the public URL of the stored object.
 */
export async function uploadFromUrl(
	sourceUrl: string,
	storageKey: string,
	contentType?: string,
): Promise<string> {
	const response = await fetch(sourceUrl);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch asset from ${sourceUrl}: ${response.status} ${response.statusText}`,
		);
	}

	const body = await response.arrayBuffer();
	const resolvedContentType =
		contentType ??
		response.headers.get("content-type") ??
		"application/octet-stream";

	await getClient().send(
		new PutObjectCommand({
			Bucket: getBucket(),
			Key: storageKey,
			Body: Buffer.from(body),
			ContentType: resolvedContentType,
		}),
	);

	return getPublicUrl(storageKey);
}

/**
 * Returns the public CDN URL for a given storage key.
 */
export function getPublicUrl(storageKey: string): string {
	const baseUrl = process.env.STORAGE_PUBLIC_URL;
	if (!baseUrl) throw new Error("STORAGE_PUBLIC_URL env var is not set");
	return `${baseUrl.replace(/\/$/, "")}/${storageKey}`;
}

/**
 * Upload a Buffer directly to R2 at `storageKey`.
 * Returns the public URL of the stored object.
 */
export async function uploadBuffer(
	body: Buffer,
	storageKey: string,
	contentType: string,
): Promise<string> {
	await getClient().send(
		new PutObjectCommand({
			Bucket: getBucket(),
			Key: storageKey,
			Body: body,
			ContentType: contentType,
		}),
	);
	return getPublicUrl(storageKey);
}

/**
 * Copies an object within the same R2 bucket.
 * Returns the public URL of the new object.
 */
export async function copyObject(
	sourceKey: string,
	destKey: string,
): Promise<string> {
	const bucket = getBucket();
	await getClient().send(
		new CopyObjectCommand({
			Bucket: bucket,
			CopySource: `${bucket}/${sourceKey}`,
			Key: destKey,
		}),
	);
	return getPublicUrl(destKey);
}

/**
 * Deletes an object from R2. Resolves silently even if the key doesn't exist.
 */
export async function deleteObject(storageKey: string): Promise<void> {
	await getClient().send(
		new DeleteObjectCommand({
			Bucket: getBucket(),
			Key: storageKey,
		}),
	);
}
