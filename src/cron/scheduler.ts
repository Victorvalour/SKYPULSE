import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { ingestT100ForPeriod } from '../ingestion/dotT100.js';
import { invalidatePattern } from '../cache/redis.js';

/**
 * Cron job schedule:
 *
 *  - Weekly (Sunday 2am UTC): Check for new T-100 releases and ingest
 *  - Daily (6am UTC): Scan for new route announcements
 *
 * After any ingestion, affected route_changes are recomputed and cache is invalidated.
 */

export function startScheduler(): void {
  logger.info('Starting cron scheduler');

  // ── Weekly T-100 ingestion ──────────────────────────────────────────────────
  // Every Sunday at 02:00 UTC
  cron.schedule('0 2 * * 0', async () => {
    logger.info('Cron: Starting weekly T-100 ingestion check');
    try {
      const now = new Date();
      // T-100 data lags 3-6 months; try to ingest the most recent available
      // quarter (approximately 4 months ago)
      const targetDate = new Date(now.getFullYear(), now.getMonth() - 4, 1);
      await ingestT100ForPeriod(
        targetDate.getFullYear(),
        targetDate.getMonth() + 1
      );
      await invalidatePattern('skypulse:*');
      logger.info('Cron: T-100 ingestion complete, cache invalidated');
    } catch (err) {
      logger.error('Cron: T-100 ingestion failed', { error: String(err) });
    }
  });

  // ── Daily announcement scan ─────────────────────────────────────────────────
  // Every day at 06:00 UTC
  cron.schedule('0 6 * * *', async () => {
    logger.info('Cron: Starting daily announcement scan');
    try {
      const feedUrl = process.env.ANNOUNCEMENT_FEED_URL;
      if (!feedUrl) {
        logger.info('Cron: ANNOUNCEMENT_FEED_URL not configured, skipping');
        return;
      }
      // Dynamic import to avoid circular dependency at startup
      const { fetchAnnouncementFeed, insertAnnouncement } = await import(
        '../ingestion/announcements.js'
      );
      const records = await fetchAnnouncementFeed(feedUrl);
      for (const record of records) {
        await insertAnnouncement(record);
      }
      logger.info(`Cron: Ingested ${records.length} announcements`);
      await invalidatePattern('skypulse:*');
    } catch (err) {
      logger.error('Cron: Announcement scan failed', { error: String(err) });
    }
  });

  logger.info('Cron scheduler started', {
    jobs: ['weekly T-100 (Sun 02:00 UTC)', 'daily announcements (06:00 UTC)'],
  });
}
