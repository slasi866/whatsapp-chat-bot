#!/usr/bin/env bash
# Creates every Cloudflare resource this Worker binds to, then writes the two
# generated ids straight into wrangler.toml.
#
# Safe to re-run: existing resources are left alone and their ids are read back
# from the account. Run it after `wrangler login` switches to a different
# account, which is the case where hand-editing the ids goes wrong.
set -euo pipefail

cd "$(dirname "$0")/.."

CONFIG="wrangler.toml"
DB_NAME="pesat-wa-bot"
KV_TITLE="CACHE"
INDEX="pesat-kb"

echo "==> Account"
npx wrangler whoami 2>&1 | grep -E "associated with the email|│ [A-Za-z]" | head -3

# Wrangler caches the account id per project. After switching logins the cache
# still points at the previous account, and every call fails with an
# authentication error against an id the new credentials cannot reach.
if [ -f node_modules/.cache/wrangler/wrangler-account.json ]; then
  rm -f node_modules/.cache/wrangler/wrangler-account.json
  echo "    cleared stale account cache"
fi

echo "==> D1 database"
npx wrangler d1 create "$DB_NAME" >/dev/null 2>&1 || echo "    (already exists)"
# The list output is JSON; pull the uuid that sits next to our database name.
DB_ID=$(npx wrangler d1 list --json 2>/dev/null |
  node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
      const start = raw.indexOf("[");
      const rows = JSON.parse(raw.slice(start));
      const row = rows.find((r) => r.name === process.argv[1]);
      process.stdout.write(row ? row.uuid : "");
    });
  ' "$DB_NAME")
[ -n "$DB_ID" ] || { echo "!! could not resolve the D1 database id"; exit 1; }
echo "    id: $DB_ID"

echo "==> KV namespace"
npx wrangler kv namespace create "$KV_TITLE" >/dev/null 2>&1 || echo "    (already exists)"
KV_ID=$(npx wrangler kv namespace list 2>/dev/null |
  node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
      const start = raw.indexOf("[");
      const rows = JSON.parse(raw.slice(start));
      const row = rows.find((r) => r.title === process.argv[1]);
      process.stdout.write(row ? row.id : "");
    });
  ' "$KV_TITLE")
[ -n "$KV_ID" ] || { echo "!! could not resolve the KV namespace id"; exit 1; }
echo "    id: $KV_ID"

echo "==> Queues"
npx wrangler queues create wa-inbound >/dev/null 2>&1 || echo "    (wa-inbound already exists)"
npx wrangler queues create wa-inbound-dlq >/dev/null 2>&1 ||
  echo "    (wa-inbound-dlq already exists)"

echo "==> Vectorize index"
# 1024 dimensions matches the @cf/baai/bge-m3 embedding model.
npx wrangler vectorize create "$INDEX" --dimensions=1024 --metric=cosine >/dev/null 2>&1 ||
  echo "    (already exists)"
# Without this metadata index the per-tenant filter cannot be applied, and one
# client's bot could answer from another client's documents.
npx wrangler vectorize create-metadata-index "$INDEX" \
  --property-name=tenant_id --type=string >/dev/null 2>&1 || echo "    (already exists)"

echo "==> Writing ids into $CONFIG"
node -e '
  const fs = require("fs");
  const [file, dbId, kvId] = process.argv.slice(1);
  let text = fs.readFileSync(file, "utf8");

  const before = text;
  text = text.replace(/^database_id = ".*"$/m, `database_id = "${dbId}"`);
  // The bare `id =` line belongs to the kv_namespaces block; the vectorize and
  // d1 blocks use index_name and database_id instead.
  text = text.replace(/^id = ".*"$/m, `id = "${kvId}"`);

  if (text === before) {
    console.error("!! nothing was substituted; check the config by hand");
    process.exit(1);
  }
  fs.writeFileSync(file, text);
' "$CONFIG" "$DB_ID" "$KV_ID"

grep -nE '^database_id = |^id = ' "$CONFIG" | sed 's/^/    /'

cat <<'NOTE'

==> Next steps
  1. npm run db:migrate          apply the schema to the new database
  2. npx wrangler deploy         needs a verified account and a registered
                                 workers.dev subdomain
  3. Set the five secrets listed in .dev.vars.example, for example:
       printf '%s' "$VALUE" | npx wrangler secret put LLM_API_KEY
     Secrets belong to a Worker in one account, so switching accounts means
     setting them again.
NOTE
