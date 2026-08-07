#!/usr/bin/env node
/**
 * RuythaCloud sync script
 * ------------------------
 * Runs on YOUR PC (not on Vercel). Polls your private Vercel Blob store
 * every POLL_INTERVAL_MS, and copies any file it hasn't seen before into
 * DEST_FOLDER. This is what turns "files uploaded on the website" into
 * "files sitting in a folder on my computer" — Vercel itself can never
 * reach your machine directly, so this script is the other half of that
 * bridge.
 *
 * Setup:
 *   1. npm install            (installs @vercel/blob, already in package.json)
 *   2. Set BLOB_READ_WRITE_TOKEN in this shell's env, or in a .env file
 *      loaded however you like (this script reads process.env directly).
 *   3. node scripts/sync-cloud.js
 *      — or —
 *      npm run sync-cloud
 *
 * Leave it running (e.g. in a terminal, a tmux session, or as a background
 * service / scheduled task) and it'll keep pulling new uploads down.
 */

const fs = require("fs");
const path = require("path");
const { list } = require("@vercel/blob");

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const DEST_FOLDER = process.env.RUYTHACLOUD_DEST || path.join(process.env.HOME || process.env.USERPROFILE || ".", "RuythaCloud");
const STATE_FILE = path.join(__dirname, ".sync-state.json");
const POLL_INTERVAL_MS = 15_000;

if (!TOKEN) {
  console.error("Missing BLOB_READ_WRITE_TOKEN. Set it before running this script.");
  process.exit(1);
}

fs.mkdirSync(DEST_FOLDER, { recursive: true });

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { seen: [] };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function downloadBlob(blob) {
  // Private blobs require the token on every read. If your @vercel/blob
  // version exposes a dedicated `get`/`download` helper, feel free to swap
  // it in here — this plain authenticated fetch works against the same
  // private URL and is the most version-stable approach.
  const res = await fetch(blob.downloadUrl || blob.url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to download ${blob.pathname}: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const destPath = path.join(DEST_FOLDER, blob.pathname.replace(/[\\/]/g, "_"));
  fs.writeFileSync(destPath, buffer);
  return destPath;
}

async function syncOnce(state) {
  const { blobs } = await list({ token: TOKEN, limit: 200 });

  for (const blob of blobs) {
    if (state.seen.includes(blob.pathname)) continue;

    try {
      const dest = await downloadBlob(blob);
      state.seen.push(blob.pathname);
      saveState(state);
      console.log(`[${new Date().toLocaleTimeString()}] synced: ${blob.pathname} -> ${dest}`);
    } catch (err) {
      console.error(`[${new Date().toLocaleTimeString()}] failed to sync ${blob.pathname}:`, err.message);
    }
  }
}

async function main() {
  console.log(`RuythaCloud sync running. Watching for new uploads, saving into: ${DEST_FOLDER}`);
  const state = loadState();

  // First pass immediately, then on an interval.
  await syncOnce(state).catch((err) => console.error("Sync error:", err.message));
  setInterval(() => {
    syncOnce(state).catch((err) => console.error("Sync error:", err.message));
  }, POLL_INTERVAL_MS);
}

main();
