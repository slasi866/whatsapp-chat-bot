import { Hono } from 'hono';
import type { Env, Tenant } from '../types';
import { type AuthVars, authenticate, requireAdmin, requireTenantAccess } from '../middleware/auth';
import { encryptSecret, generateApiKey, sha256Hex } from '../lib/crypto';
import { newId, nowSeconds } from '../lib/ids';
import {
  getTenantById,
  getTenantToken,
  invalidateTenantCache,
  publicTenant,
} from '../lib/tenants';
import { deleteDocument, getDocument, ingestDocument, retrieve } from '../lib/rag';
import { getDailyUsage, getMonthlyUsage } from '../lib/usage';
import { complete } from '../lib/llm';
import { appendMessage, setConversationStatus } from '../lib/conversations';
import { createWhatsAppClient, isWithinServiceWindow } from '../lib/whatsapp';
import type { Conversation } from '../types';

const admin = new Hono<{ Bindings: Env; Variables: AuthVars }>();

/**
 * Auth is mounted on the paths that exist rather than on everything. Mounting
 * it on '*' meant a typo in a URL came back as 401, sending an integrator
 * hunting for a credential problem when the real fault was the path.
 */
admin.use('/me', authenticate);
admin.use('/tenants', authenticate);
admin.use('/tenants/*', authenticate);
admin.use('/diagnostics/*', authenticate);

/** Clamped paging. Callers that send nothing keep the previous behaviour. */
function paging(c: { req: { query: (key: string) => string | undefined } }, fallback: number, max: number) {
  const limit = Math.min(max, Math.max(1, Number(c.req.query('limit')) || fallback));
  const offset = Math.max(0, Number(c.req.query('offset')) || 0);
  // One extra row is fetched so "is there more" needs no second count query.
  return { limit, offset, probe: limit + 1 };
}

function page<T>(rows: T[], limit: number, offset: number) {
  const hasMore = rows.length > limit;
  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    has_more: hasMore,
    next_offset: hasMore ? offset + limit : null,
  };
}

const PLANS: Record<string, number> = { starter: 1000, growth: 5000, scale: 25000 };

/** Models the platform will actually route to. */
const MODELS = new Set(['pesat-flash', 'pesat-pro', 'pesat-lite']);

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;
const PHONE_PATTERN = /^[0-9]{8,20}$/;

/**
 * Field length ceilings. Without these a 5000-character company name reaches
 * both the system prompt on every reply and every table cell in the console.
 */
const MAX = {
  name: 120,
  slug: 48,
  persona: 4000,
  greeting: 600,
  fallback_message: 600,
  business_hours: 500,
  wa_phone_number_id: 64,
  wa_business_id: 64,
  model: 64,
  language: 8,
} as const;

const MAX_QUOTA = 10_000_000;

/**
 * Observed delay before a freshly upserted vector becomes queryable in
 * Vectorize. Measured at 26 to 41 seconds on the free plan.
 */
const INDEX_LAG_SECONDS = 45;

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * WhatsApp wants a bare international number. People type "+62 812-3456" or
 * "0812 3456", so accept those shapes and normalise rather than rejecting and
 * generating a support ticket. A leading zero is read as the Indonesian
 * trunk prefix.
 */
function normalizePhone(value: unknown): string | null {
  const raw = str(value);
  if (raw === null) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return '';
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
}

/**
 * Validates the fields a caller supplied. Returns a message naming the first
 * offending field, or null when everything checks out. Invalid values are
 * rejected outright rather than silently dropped, which previously made a
 * typo look like "no editable fields supplied".
 */
function validateTenantFields(body: Record<string, unknown>): string | null {
  for (const [field, limit] of Object.entries(MAX)) {
    const value = body[field];
    if (typeof value === 'string' && value.trim().length > limit) {
      return `${field} melebihi ${limit} karakter`;
    }
  }

  const slug = str(body.slug);
  if (slug && !SLUG_PATTERN.test(slug)) {
    return 'slug hanya boleh huruf kecil, angka, dan tanda hubung';
  }

  if ('plan' in body) {
    const plan = str(body.plan);
    if (!plan || !(plan in PLANS)) return `plan harus salah satu dari ${Object.keys(PLANS).join(', ')}`;
  }

  if ('model' in body) {
    const model = str(body.model);
    // An empty model means "follow the platform default", so it stays legal.
    if (model && !MODELS.has(model)) return `model harus salah satu dari ${[...MODELS].join(', ')}`;
  }

  if ('status' in body && body.status !== 'active' && body.status !== 'suspended') {
    return 'status harus active atau suspended';
  }

  if ('monthly_quota' in body) {
    const quota = body.monthly_quota;
    if (typeof quota !== 'number' || !Number.isInteger(quota) || quota < 0 || quota > MAX_QUOTA) {
      return `monthly_quota harus bilangan bulat antara 0 dan ${MAX_QUOTA}`;
    }
  }

  const escalation = normalizePhone(body.escalation_number);
  if (escalation && !PHONE_PATTERN.test(escalation)) {
    return 'escalation_number harus berisi 8 sampai 20 digit angka';
  }

  if ('business_hours' in body && str(body.business_hours)) {
    try {
      JSON.parse(str(body.business_hours) as string);
    } catch {
      return 'business_hours harus JSON yang valid';
    }
  }

  return null;
}

/** Loads the tenant named in the path, after requireTenantAccess has run. */
async function loadTenant(env: Env, tenantId: string): Promise<Tenant | null> {
  return getTenantById(env, tenantId);
}

// --- Session -------------------------------------------------------------

/**
 * Tells the dashboard which panel to draw. A tenant key holder has no way to
 * learn its own tenant id otherwise, so this is what makes a single frontend
 * work for both the platform owner and a client.
 */
admin.get('/me', async (c) => {
  const role = c.get('role');
  if (role === 'admin') return c.json({ role, tenant: null });
  const tenant = c.get('tenant');
  return c.json({ role, tenant: tenant ? publicTenant(tenant) : null });
});

// --- Tenants -------------------------------------------------------------

admin.post('/tenants', requireAdmin, async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const name = str(body.name);
  const slug = str(body.slug);
  if (!name || !slug) {
    return c.json({ error: 'name and slug are required' }, 400);
  }

  const invalid = validateTenantFields(body);
  if (invalid) return c.json({ error: invalid }, 400);

  const plan = str(body.plan) ?? 'starter';
  const quota = typeof body.monthly_quota === 'number' ? body.monthly_quota : PLANS[plan] ?? 1000;

  const accessToken = str(body.wa_access_token);
  const tokenEnc = accessToken ? await encryptSecret(accessToken, c.env.ENCRYPTION_KEY) : null;

  // Returned once, never recoverable afterwards.
  const apiKey = generateApiKey();
  const id = newId('tnt');
  const at = nowSeconds();

  try {
    await c.env.DB.prepare(
      `INSERT INTO tenants (id, name, slug, wa_phone_number_id, wa_business_id, wa_token_enc,
         api_key_hash, status, plan, monthly_quota, model, persona, language, greeting,
         fallback_message, escalation_number, business_hours, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        name,
        slug,
        str(body.wa_phone_number_id),
        str(body.wa_business_id),
        tokenEnc,
        await sha256Hex(apiKey),
        plan,
        quota,
        str(body.model),
        str(body.persona) ?? '',
        str(body.language) ?? 'id',
        str(body.greeting),
        str(body.fallback_message),
        normalizePhone(body.escalation_number),
        str(body.business_hours),
        at,
        at,
      )
      .run();
  } catch (error) {
    const message = String(error);
    if (message.includes('UNIQUE')) {
      return c.json({ error: 'slug or wa_phone_number_id already in use' }, 409);
    }
    throw error;
  }

  const tenant = await getTenantById(c.env, id);
  return c.json({ tenant: tenant && publicTenant(tenant), api_key: apiKey }, 201);
});

admin.get('/tenants', requireAdmin, async (c) => {
  const { limit, offset, probe } = paging(c, 50, 200);
  const result = await c.env.DB.prepare(
    'SELECT * FROM tenants ORDER BY created_at DESC LIMIT ? OFFSET ?',
  )
    .bind(probe, offset)
    .all<Tenant>();
  const { items, has_more, next_offset } = page(result.results, limit, offset);
  return c.json({ tenants: items.map(publicTenant), has_more, next_offset });
});

admin.get('/tenants/:tenantId', requireTenantAccess, async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('tenantId'));
  if (!tenant) return c.json({ error: 'Not found' }, 404);
  const usage = await getMonthlyUsage(c.env, tenant.id);
  return c.json({ tenant: publicTenant(tenant), usage_this_month: usage });
});

const EDITABLE = [
  'name',
  'model',
  'persona',
  'language',
  'greeting',
  'fallback_message',
  'escalation_number',
  'business_hours',
  'wa_phone_number_id',
  'wa_business_id',
] as const;

admin.patch('/tenants/:tenantId', requireTenantAccess, async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('tenantId'));
  if (!tenant) return c.json({ error: 'Not found' }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));

  const invalid = validateTenantFields(body);
  if (invalid) return c.json({ error: invalid }, 400);

  // Commercial fields are admin-only, so a tenant sending them gets told why
  // rather than the misleading "no editable fields supplied".
  if (c.get('role') !== 'admin') {
    const forbidden = ['plan', 'monthly_quota', 'status'].filter((field) => field in body);
    if (forbidden.length) {
      return c.json(
        { error: `${forbidden.join(', ')} hanya bisa diubah oleh admin platform` },
        403,
      );
    }
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const field of EDITABLE) {
    if (field in body) {
      sets.push(`${field} = ?`);
      values.push(
        field === 'escalation_number' ? normalizePhone(body[field]) : str(body[field]),
      );
    }
  }
  if (str(body.wa_access_token)) {
    sets.push('wa_token_enc = ?');
    values.push(await encryptSecret(str(body.wa_access_token) as string, c.env.ENCRYPTION_KEY));
  }
  // Plan, quota, and status are commercial settings, so tenants cannot edit them.
  if (c.get('role') === 'admin') {
    if (str(body.plan)) {
      sets.push('plan = ?');
      values.push(str(body.plan));
    }
    if (typeof body.monthly_quota === 'number') {
      sets.push('monthly_quota = ?');
      values.push(body.monthly_quota);
    }
    if (body.status === 'active' || body.status === 'suspended') {
      sets.push('status = ?');
      values.push(body.status);
    }
  }

  if (sets.length === 0) return c.json({ error: 'No editable fields supplied' }, 400);

  sets.push('updated_at = ?');
  values.push(nowSeconds(), tenant.id);

  await c.env.DB.prepare(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
  await invalidateTenantCache(c.env, tenant);

  const updated = await getTenantById(c.env, tenant.id);
  return c.json({ tenant: updated && publicTenant(updated) });
});

admin.post('/tenants/:tenantId/rotate-key', requireAdmin, async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('tenantId'));
  if (!tenant) return c.json({ error: 'Not found' }, 404);

  const apiKey = generateApiKey();
  await c.env.DB.prepare('UPDATE tenants SET api_key_hash = ?, updated_at = ? WHERE id = ?')
    .bind(await sha256Hex(apiKey), nowSeconds(), tenant.id)
    .run();
  await invalidateTenantCache(c.env, tenant);
  return c.json({ api_key: apiKey });
});

admin.delete('/tenants/:tenantId', requireAdmin, async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('tenantId'));
  if (!tenant) return c.json({ error: 'Not found' }, 404);

  // Vectorize is outside the D1 cascade, so its vectors are removed per document.
  const documents = await c.env.DB.prepare('SELECT id FROM documents WHERE tenant_id = ?')
    .bind(tenant.id)
    .all<{ id: string }>();
  for (const document of documents.results) {
    await deleteDocument(c.env, tenant.id, document.id);
  }

  await c.env.DB.prepare('DELETE FROM tenants WHERE id = ?').bind(tenant.id).run();
  await invalidateTenantCache(c.env, tenant);
  return c.json({ deleted: true });
});

// --- Knowledge base ------------------------------------------------------

admin.post('/tenants/:tenantId/documents', requireTenantAccess, async (c) => {
  const tenantId = c.req.param('tenantId');
  if (!(await loadTenant(c.env, tenantId))) return c.json({ error: 'Not found' }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const title = str(body.title);
  const content = str(body.content);
  if (!title || !content) return c.json({ error: 'title and content are required' }, 400);

  const result = await ingestDocument(c.env, tenantId, title, content, str(body.source));
  return c.json(
    {
      ...result,
      // Vectorize processes upserts asynchronously, measured at roughly half
      // a minute. Without saying so, a client tests retrieval immediately,
      // sees nothing, and concludes the upload failed.
      searchable_after_seconds: result.deduplicated ? 0 : INDEX_LAG_SECONDS,
    },
    result.deduplicated ? 200 : 201,
  );
});

admin.get('/tenants/:tenantId/documents', requireTenantAccess, async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT id, title, source, chunk_count, created_at FROM documents
     WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200`,
  )
    .bind(c.req.param('tenantId'))
    .all();
  return c.json({ documents: result.results });
});

admin.delete('/tenants/:tenantId/documents/:documentId', requireTenantAccess, async (c) => {
  const removed = await deleteDocument(
    c.env,
    c.req.param('tenantId'),
    c.req.param('documentId'),
  );
  return removed ? c.json({ deleted: true }) : c.json({ error: 'Not found' }, 404);
});

/** Retrieval preview, so a tenant can see what the bot would read. */
admin.post('/tenants/:tenantId/search', requireTenantAccess, async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const query = str(body.query);
  if (!query) return c.json({ error: 'query is required' }, 400);
  const tenantId = c.req.param('tenantId');
  const chunks = await retrieve(c.env, tenantId, query);

  // Distinguish "nothing matches this question" from "the index has not
  // caught up with a document uploaded moments ago". They look identical to
  // the caller but mean opposite things.
  let indexing = false;
  if (chunks.length === 0) {
    const newest = await c.env.DB.prepare(
      'SELECT MAX(created_at) AS created_at FROM documents WHERE tenant_id = ?',
    )
      .bind(tenantId)
      .first<{ created_at: number | null }>();
    const age = newest?.created_at ? nowSeconds() - newest.created_at : null;
    indexing = age !== null && age < INDEX_LAG_SECONDS * 3;
  }

  return c.json({ chunks, indexing });
});

// --- Conversations and human handover ------------------------------------

admin.get('/tenants/:tenantId/conversations', requireTenantAccess, async (c) => {
  const status = c.req.query('status');
  const { limit, offset, probe } = paging(c, 50, 200);
  const base = `SELECT id, contact_wa_id, contact_name, status, last_inbound_at,
                       last_message_at, agent_read_at, created_at
                FROM conversations WHERE tenant_id = ?`;
  const statement = status
    ? c.env.DB.prepare(
        `${base} AND status = ? ORDER BY last_message_at DESC LIMIT ? OFFSET ?`,
      ).bind(c.req.param('tenantId'), status, probe, offset)
    : c.env.DB.prepare(`${base} ORDER BY last_message_at DESC LIMIT ? OFFSET ?`).bind(
        c.req.param('tenantId'),
        probe,
        offset,
      );
  const result = await statement.all();
  const { items, has_more, next_offset } = page(result.results, limit, offset);
  return c.json({ conversations: items, has_more, next_offset });
});

/** Full stored text of a document, so the console can show it without a re-upload. */
admin.get('/tenants/:tenantId/documents/:documentId', requireTenantAccess, async (c) => {
  const document = await getDocument(
    c.env,
    c.req.param('tenantId'),
    c.req.param('documentId'),
  );
  return document ? c.json({ document }) : c.json({ error: 'Not found' }, 404);
});

admin.get('/tenants/:tenantId/conversations/:conversationId/messages', requireTenantAccess, async (c) => {
  const tenantId = c.req.param('tenantId');
  const conversationId = c.req.param('conversationId');
  const { limit, offset, probe } = paging(c, 200, 500);

  // Newest first so paging walks backwards through history, then reversed so
  // the caller still receives them in reading order.
  const result = await c.env.DB.prepare(
    `SELECT role, content, wa_message_id, created_at FROM messages
     WHERE conversation_id = ? AND tenant_id = ?
     ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
  )
    .bind(conversationId, tenantId, probe, offset)
    .all();

  const { items, has_more, next_offset } = page(result.results, limit, offset);

  // Opening a thread is what marks it read; this endpoint is the only way the
  // console reads one.
  await c.env.DB.prepare(
    'UPDATE conversations SET agent_read_at = ? WHERE id = ? AND tenant_id = ?',
  )
    .bind(nowSeconds(), conversationId, tenantId)
    .run();

  return c.json({ messages: items.reverse(), has_more, next_offset });
});

async function loadConversation(
  env: Env,
  tenantId: string,
  conversationId: string,
): Promise<Conversation | null> {
  return env.DB.prepare('SELECT * FROM conversations WHERE id = ? AND tenant_id = ?')
    .bind(conversationId, tenantId)
    .first<Conversation>();
}

admin.post('/tenants/:tenantId/conversations/:conversationId/takeover', requireTenantAccess, async (c) => {
  const conversation = await loadConversation(
    c.env,
    c.req.param('tenantId'),
    c.req.param('conversationId'),
  );
  if (!conversation) return c.json({ error: 'Not found' }, 404);
  await setConversationStatus(c.env, conversation.id, 'human');
  return c.json({ status: 'human' });
});

admin.post('/tenants/:tenantId/conversations/:conversationId/release', requireTenantAccess, async (c) => {
  const conversation = await loadConversation(
    c.env,
    c.req.param('tenantId'),
    c.req.param('conversationId'),
  );
  if (!conversation) return c.json({ error: 'Not found' }, 404);
  await setConversationStatus(c.env, conversation.id, 'bot');
  return c.json({ status: 'bot' });
});

/** Lets a human agent reply from the dashboard through the tenant's number. */
admin.post('/tenants/:tenantId/conversations/:conversationId/send', requireTenantAccess, async (c) => {
  const tenantId = c.req.param('tenantId');
  const tenant = await loadTenant(c.env, tenantId);
  if (!tenant?.wa_phone_number_id) return c.json({ error: 'Tenant has no WhatsApp number' }, 400);

  const conversation = await loadConversation(c.env, tenantId, c.req.param('conversationId'));
  if (!conversation) return c.json({ error: 'Not found' }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const text = str(body.text);
  if (!text) return c.json({ error: 'text is required' }, 400);

  if (!isWithinServiceWindow(conversation.last_inbound_at)) {
    return c.json(
      {
        error:
          'Outside the 24-hour WhatsApp service window. Send an approved template instead of free text.',
      },
      409,
    );
  }

  const token = await getTenantToken(c.env, tenant);
  const whatsapp = createWhatsAppClient(c.env, tenant.wa_phone_number_id, token);
  const waId = await whatsapp.sendText(conversation.contact_wa_id, text);
  await appendMessage(c.env, conversation, { role: 'agent', content: text, waMessageId: waId });

  return c.json({ sent: true, wa_message_id: waId });
});

// --- Leads and usage -----------------------------------------------------

admin.get('/tenants/:tenantId/leads', requireTenantAccess, async (c) => {
  const { limit, offset, probe } = paging(c, 50, 200);
  const result = await c.env.DB.prepare(
    'SELECT * FROM leads WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
  )
    .bind(c.req.param('tenantId'), probe, offset)
    .all();
  const { items, has_more, next_offset } = page(result.results, limit, offset);
  return c.json({ leads: items, has_more, next_offset });
});

/**
 * Checks whether the configured model endpoint actually honours tool calling.
 * Escalation and lead capture both depend on it, and when a router silently
 * ignores tools they fail quietly, which is the worst way for them to fail.
 */
admin.get('/diagnostics/llm', requireAdmin, async (c) => {
  const model = c.req.query('model') || c.env.DEFAULT_MODEL;
  const started = Date.now();
  try {
    const result = await complete(
      c.env,
      model,
      [
        {
          role: 'system',
          content:
            'You are a WhatsApp assistant. When a customer asks for a human, call escalate_to_human.',
        },
        { role: 'user', content: 'Saya mau bicara dengan orangnya saja, bukan bot.' },
      ],
      true,
    );
    return c.json({
      model,
      reachable: true,
      tool_calling: result.toolCalls.length > 0,
      tools_called: result.toolCalls.map((call) => call.function.name),
      finish_reason: result.finishReason,
      reply_preview: result.text.slice(0, 200),
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      elapsed_ms: Date.now() - started,
    });
  } catch (error) {
    return c.json(
      {
        model,
        reachable: false,
        tool_calling: false,
        error: error instanceof Error ? error.message : String(error),
        elapsed_ms: Date.now() - started,
      },
      502,
    );
  }
});

admin.get('/tenants/:tenantId/usage', requireTenantAccess, async (c) => {
  const tenantId = c.req.param('tenantId');
  const tenant = await loadTenant(c.env, tenantId);
  if (!tenant) return c.json({ error: 'Not found' }, 404);

  const [month, daily] = await Promise.all([
    getMonthlyUsage(c.env, tenantId),
    getDailyUsage(c.env, tenantId, 30),
  ]);
  return c.json({
    plan: tenant.plan,
    monthly_quota: tenant.monthly_quota,
    this_month: month,
    remaining: Math.max(0, tenant.monthly_quota - month.messages),
    daily,
  });
});

export default admin;
