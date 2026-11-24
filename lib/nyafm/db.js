// Database layer. Uses Turso (hosted SQLite) in production, a local file when developing.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scrobbles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  artist TEXT NOT NULL,
  track TEXT NOT NULL,
  album TEXT NOT NULL DEFAULT '',
  album_artist TEXT NOT NULL DEFAULT '',
  duration INTEGER,
  source TEXT NOT NULL DEFAULT '',
  UNIQUE(user_id, ts, artist, track)
);
CREATE INDEX IF NOT EXISTS ix_scrobbles_user_ts ON scrobbles(user_id, ts DESC);
CREATE INDEX IF NOT EXISTS ix_scrobbles_artist ON scrobbles(user_id, artist COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS now_playing (
  user_id INTEGER PRIMARY KEY,
  artist TEXT NOT NULL, track TEXT NOT NULL, album TEXT NOT NULL DEFAULT '',
  duration INTEGER, started_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS loved (
  user_id INTEGER NOT NULL, artist TEXT NOT NULL COLLATE NOCASE, track TEXT NOT NULL COLLATE NOCASE,
  ts INTEGER NOT NULL, PRIMARY KEY(user_id, artist, track)
);
CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY, user_id INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS web_sessions (
  sid TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS artwork (
  key TEXT PRIMARY KEY, url TEXT, fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS play_counts (
  user_id INTEGER NOT NULL, key TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(user_id, key)
);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY, json TEXT NOT NULL
);
`;

let client = null;
let ready = null;

async function getClient() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL || process.env.NYAFM_DB_URL || 'file:nyafm.db';
  // The web client is pure HTTP (no native code) — perfect for serverless.
  const mod = url.startsWith('file:') ? await import('@libsql/client') : await import('@libsql/client/web');
  client = mod.createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return client;
}

export async function init() {
  if (!ready) {
    ready = (async () => {
      const c = await getClient();
      await c.executeMultiple(SCHEMA);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

export async function all(sql, args = []) {
  await init();
  return (await client.execute({ sql, args })).rows;
}

export async function one(sql, args = []) {
  return (await all(sql, args))[0] || null;
}

export async function scalar(sql, args = []) {
  const r = await one(sql, args);
  return r ? Object.values(r)[0] : null;
}

export async function run(sql, args = []) {
  await init();
  return client.execute({ sql, args });
}

/** Run many statements in one round-trip / transaction. Returns ResultSet[]. */
export async function batch(stmts) {
  await init();
  if (!stmts.length) return [];
  return client.batch(stmts, 'write');
}
