import postgresPlugin from 'vite-plugin-db';
export default postgresPlugin({
    seed: {
        type: 'sql-script',
        path: 'db/init.sql',
    },
    referrer: 'create-tanstack',
    dotEnvKey: 'DATABASE_URL',
});
