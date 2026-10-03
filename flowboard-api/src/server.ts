import { buildApp } from './app.js';
import { EnvironmentError, loadEnv } from './config/env.js';

async function main(): Promise<void> {
  let env;
  try {
    env = loadEnv();
  } catch (error) {
    if (error instanceof EnvironmentError) {
      // The logger is not configured yet, so this one line goes to stderr directly.
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const app = await buildApp(env);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'shutting down');
      void app.close().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
  }

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error) {
    app.log.fatal({ err: error }, 'failed to start the API');
    process.exit(1);
  }
}

await main();
