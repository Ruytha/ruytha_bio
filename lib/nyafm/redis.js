// Tiny Upstash Redis REST client (no dependencies). Works on Vercel, Netlify and Node.
// Env: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  (or Vercel's KV_REST_API_URL + KV_REST_API_TOKEN)
const url = () => (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

export const useRedis = () => !!url();
export const P = () => process.env.NYAFM_REDIS_PREFIX ?? 'nyafm:'; // keeps NyaFM's keys apart from anything else in your DB

const enc = (args) => args.map((a) => (typeof a === 'string' ? a : String(a)));

async function post(path, body) {
  const r = await fetch(url() + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok && !Array.isArray(j)) throw new Error(`Upstash: ${j.error || r.status}`);
  return j;
}

/** Run one command: await cmd('HGET', key, field) */
export async function cmd(...args) {
  const j = await post('', enc(args));
  if (j.error) throw new Error(`Upstash: ${j.error}`);
  return j.result;
}

/** Run many commands in one HTTP request. Returns results in order. */
export async function pipe(cmds) {
  const out = [];
  for (let i = 0; i < cmds.length; i += 500) {
    const j = await post('/pipeline', cmds.slice(i, i + 500).map(enc));
    if (!Array.isArray(j)) throw new Error(`Upstash: ${j.error}`);
    for (const x of j) {
      if (x.error) throw new Error(`Upstash: ${x.error}`);
      out.push(x.result);
    }
  }
  return out;
}

/** HGETALL flat array -> object */
export const toObj = (arr) => {
  const o = {};
  if (Array.isArray(arr) && arr.length && Array.isArray(arr[0])) arr.forEach(([k, v]) => (o[k] = v));
  else if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  else if (arr && typeof arr === 'object') Object.assign(o, arr);
  return o;
};

// Lua helpers so a whole batch costs one command, not hundreds.
export const LUA_HSETNX_MANY = `local r = {} for i = 1, #ARGV, 2 do r[#r+1] = redis.call('HSETNX', KEYS[1], ARGV[i], ARGV[i+1]) end return r`;
export const LUA_HINCR_MANY = `for i = 1, #ARGV, 2 do local v = redis.call('HINCRBY', KEYS[1], ARGV[i], ARGV[i+1]) if v <= 0 then redis.call('HDEL', KEYS[1], ARGV[i]) end end return 1`;
