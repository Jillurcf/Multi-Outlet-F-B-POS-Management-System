import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT}`);
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`${signal} received, closing API`);

  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  server.close(async () => {
    try {
      await prisma.$disconnect();
      clearTimeout(forceExit);
      process.exit(0);
    } catch (error) {
      console.error('Failed to close database connection', error);
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
