import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';
import { logger } from './utils/logger';
import { startScheduler } from './cron/scheduler';

async function main(): Promise<void> {
  logger.info('Starting SkyPulse MCP server', {
    version: '1.0.0',
    nodeEnv: process.env.NODE_ENV ?? 'development',
  });

  const server = createServer();
  const transport = new StdioServerTransport();

  // Start cron scheduler (only in production to avoid double scheduling in dev)
  if (process.env.NODE_ENV !== 'test') {
    startScheduler();
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    await server.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully');
    await server.close();
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
    process.exit(1);
  });

  await server.connect(transport);
  logger.info('SkyPulse MCP server running on stdio transport');
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: String(err) });
  process.exit(1);
});
