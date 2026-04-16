import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from './server';
import { logger } from './utils/logger';
import { startScheduler } from './cron/scheduler';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function main(): Promise<void> {
  logger.info('Starting SkyPulse MCP server', {
    version: '1.0.0',
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: PORT,
  });

  const app = express();
  const transports: Record<string, SSEServerTransport> = {};

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'skypulse', version: '1.0.0' });
  });

  // SSE connection endpoint — each GET opens a new MCP session
  app.get('/sse', async (_req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    const sessionId = transport.sessionId;
    if (!sessionId) {
      res.status(500).send('Failed to initialize session');
      return;
    }
    transports[sessionId] = transport;
    const server = createServer();
    res.on('close', () => {
      delete transports[sessionId];
    });
    await server.connect(transport);
  });

  // Message posting endpoint — clients send JSON-RPC messages here
  app.post('/messages', async (req, res) => {
    const sessionId = req.query['sessionId'] as string;
    const transport = transports[sessionId];
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(400).send('Unknown session');
    }
  });

  // Start cron scheduler (only in production to avoid double scheduling in dev)
  if (process.env.NODE_ENV !== 'test') {
    startScheduler();
  }

  const httpServer = app.listen(PORT, () => {
    logger.info(`SkyPulse MCP server listening on port ${PORT}`, {
      sse: `http://localhost:${PORT}/sse`,
      health: `http://localhost:${PORT}/health`,
    });
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down gracefully');
    httpServer.close(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: String(err) });
  process.exit(1);
});
