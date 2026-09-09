import type { Env } from '../types';
import { nowSeconds } from '../lib/ids';

/**
 * Scheduled clean-up.
 *
 * Both tables here are written on every inbound message and nothing ever
 * removed rows, so on a 5 GB database they were the only two that grow without
 * bound. Deletes are batched because a single unbounded DELETE on a large
 * table is what turns a maintenance job into an outage.
 */

const BATCH = 2000;
const MAX_BATCHES = 25;

async function deleteOlderThan(
  env: Env,
  table: 'messages' | 'processed_messages',
  cutoff: number,
): Promise<number> {
  let removed = 0;
  for (let round = 0; round < MAX_BATCHES; round++) {
    const result = await env.DB.prepare(
      `DELETE FROM ${table} WHERE rowid IN (
         SELECT rowid FROM ${table} WHERE created_at < ? LIMIT ${BATCH}
       )`,
    )
      .bind(cutoff)
      .run();

    const changes = result.meta.changes ?? 0;
    removed += changes;
    if (changes < BATCH) break;
  }
  return removed;
}

export async function runRetention(env: Env): Promise<void> {
  const now = nowSeconds();

  const messageDays = Number(env.MESSAGE_RETENTION_DAYS) || 90;
  const messages = await deleteOlderThan(env, 'messages', now - messageDays * 86400);

  // Deduplication only has to outlive Meta's retry window, which is hours, so
  // these rows are kept far more briefly than transcripts.
  const dedupeDays = Number(env.DEDUPE_RETENTION_DAYS) || 3;
  const processed = await deleteOlderThan(env, 'processed_messages', now - dedupeDays * 86400);

  console.info(
    `retention swept messages=${messages} (older than ${messageDays}d) ` +
      `processed_messages=${processed} (older than ${dedupeDays}d)`,
  );
}
