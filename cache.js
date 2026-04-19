/**
 * cache.js
 * File-based cache store. Each cached entry is saved as a JSON file
 * under .cache/ so the cache survives across process restarts and
 * can be cleared with --clear-cache.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// Store the cache directory relative to the user's cwd so it is easy
// to locate and inspect.
const CACHE_DIR = path.join(process.cwd(), '.proxy-cache');

/**
 * Turn a request into a stable cache key (SHA-256 of method + url).
 */
function buildKey(method, url) {
  return crypto
    .createHash('sha256')
    .update(`${method.toUpperCase()}:${url}`)
    .digest('hex');
}

/**
 * Ensure the cache directory exists.
 */
function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Return the file path for a given cache key.
 */
function keyToFile(key) {
  return path.join(CACHE_DIR, `${key}.json`);
}

/**
 * Retrieve a cached entry or null if it does not exist.
 * @param {string} method  HTTP method
 * @param {string} url     Full URL string
 * @returns {{ statusCode: number, headers: object, body: string } | null}
 */
function get(method, url) {
  const file = keyToFile(buildKey(method, url));
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Persist a response into the cache.
 * @param {string} method
 * @param {string} url
 * @param {{ statusCode: number, headers: object, body: string }} entry
 */
function set(method, url, entry) {
  ensureDir();
  const file = keyToFile(buildKey(method, url));
  fs.writeFileSync(file, JSON.stringify(entry, null, 2), 'utf8');
}

/**
 * Delete every cached file and remove the cache directory.
 */
function clear() {
  if (!fs.existsSync(CACHE_DIR)) {
    console.log('Cache directory does not exist – nothing to clear.');
    return;
  }

  const files = fs.readdirSync(CACHE_DIR);
  let count = 0;
  for (const f of files) {
    fs.unlinkSync(path.join(CACHE_DIR, f));
    count++;
  }
  fs.rmdirSync(CACHE_DIR);
  console.log(`✔  Cache cleared. ${count} entr${count === 1 ? 'y' : 'ies'} removed.`);
}

/**
 * Return a quick human-readable summary of what is currently cached.
 */
function stats() {
  if (!fs.existsSync(CACHE_DIR)) return { entries: 0, sizeBytes: 0 };
  const files = fs.readdirSync(CACHE_DIR);
  const sizeBytes = files.reduce((acc, f) => {
    try { return acc + fs.statSync(path.join(CACHE_DIR, f)).size; } catch { return acc; }
  }, 0);
  return { entries: files.length, sizeBytes };
}

module.exports = { get, set, clear, stats, CACHE_DIR };
