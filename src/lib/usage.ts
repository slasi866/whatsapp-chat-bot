import type { Env, Tenant } from '../types';
import { utcDay } from './ids';

export interface UsageTotals {
  messages: number;
  input_tokens: number;
  output_tokens: number;
  embedding_tokens: number;
}

function monthPrefix(): string {
  return utcDay().slice(0, 7);
}

/**
 * Claims one message against the tenant's monthly allowance before any work is
 * done, then reports whether the claim fit inside the quota.
 *
 * Checking first and incrementing later let two concurrent messages both see
 * room at the limit and both go through. Incrementing first closes that: the
 * caller that pushes the counter past the quota is the one that gets refused,
 * and it hands the slot back.
 */
export async function claimMessageQuota(
  env: Env,
  tenant: Tenant,
): Promise<{ allowed: boolean; used: number }> {
  const row = await env.DB.prepare(
    `INSERT INTO usage_daily (tenant_id, day, messages) VALUES (?, ?, 1)
     ON CONFLICT (tenant_id, day) DO UPDATE SET messages = messages + 1
     RETURNING (SELECT COALESCE(SUM(messages), 0) FROM usage_daily
                WHERE tenant_id = ? AND day LIKE ?) AS used`,
  )
    .bind(tenant.id, utcDay(), tenant.id, `${monthPrefix()}%`)
    .first<{ used: number }>();

  const used = row?.used ?? 0;
  if (used <= tenant.monthly_quota) return { allowed: true, used };

  // Over the line, so give the slot back rather than leaving the counter
  // inflated by every rejected attempt.
  await env.DB.prepare(
    'UPDATE usage_daily SET messages = MAX(0, messages - 1) WHERE tenant_id = ? AND day = ?',
  )
    .bind(tenant.id, utcDay())
    .run();
  return { allowed: false, used: used - 1 };
}

/** Records token spend for a message whose quota slot was already claimed. */
export async function recordTokens(
  env: Env,
  tenantId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO usage_daily (tenant_id, day, messages, input_tokens, output_tokens)
     VALUES (?, ?, 0, ?, ?)
     ON CONFLICT (tenant_id, day) DO UPDATE SET
       input_tokens = input_tokens + excluded.input_tokens,
       output_tokens = output_tokens + excluded.output_tokens`,
  )
    .bind(tenantId, utcDay(), inputTokens, outputTokens)
    .run();
}

/**
 * Embedding spend, from both document ingest and every retrieval. Billed
 * separately from replies, so it is counted separately rather than folded into
 * the input tokens of a message it does not belong to.
 */
export async function recordEmbeddingTokens(
  env: Env,
  tenantId: string,
  tokens: number,
): Promise<void> {
  if (tokens <= 0) return;
  await env.DB.prepare(
    `INSERT INTO usage_daily (tenant_id, day, messages, embedding_tokens)
     VALUES (?, ?, 0, ?)
     ON CONFLICT (tenant_id, day) DO UPDATE SET
       embedding_tokens = embedding_tokens + excluded.embedding_tokens`,
  )
    .bind(tenantId, utcDay(), tokens)
    .run();
}

export async function getMonthlyUsage(env: Env, tenantId: string): Promise<UsageTotals> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(messages), 0) AS messages,
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens,
            COALESCE(SUM(embedding_tokens), 0) AS embedding_tokens
     FROM usage_daily WHERE tenant_id = ? AND day LIKE ?`,
  )
    .bind(tenantId, `${monthPrefix()}%`)
    .first<UsageTotals>();
  return row ?? { messages: 0, input_tokens: 0, output_tokens: 0, embedding_tokens: 0 };
}

export async function getDailyUsage(env: Env, tenantId: string, days: number) {
  const result = await env.DB.prepare(
    `SELECT day, messages, input_tokens, output_tokens, embedding_tokens
     FROM usage_daily WHERE tenant_id = ? ORDER BY day DESC LIMIT ?`,
  )
    .bind(tenantId, days)
    .all();
  return result.results;
}
