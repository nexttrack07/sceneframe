import { neon } from '@neondatabase/serverless';
let client;
export async function getClient() {
    if (!process.env.VITE_DATABASE_URL) {
        return undefined;
    }
    if (!client) {
        client = await neon(process.env.VITE_DATABASE_URL);
    }
    return client;
}
