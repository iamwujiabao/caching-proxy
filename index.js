#!/usr/bin/env node
/**
 * index.js  –  caching-proxy CLI entry point
 *
 * Usage:
 *   caching-proxy --port <number> --origin <url>
 *   caching-proxy --clear-cache
 *   caching-proxy --help
 */

'use strict';

const { createServer } = require('./server');
const cache            = require('./cache');

// ──────────────────────────────────────────────
// Minimal arg parser (no external dependencies)
// ──────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      // Boolean flag if next arg is missing or starts with '--'
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++; // consume value
      }
    }
  }
  return args;
}

// ──────────────────────────────────────────────
// Help text
// ──────────────────────────────────────────────
function printHelp() {
  console.log(`
Usage:
  caching-proxy --port <number> --origin <url>
  caching-proxy --clear-cache

Options:
  --port <number>   Port for the proxy server to listen on
  --origin <url>    URL of the upstream server to proxy
  --clear-cache     Delete all cached responses and exit
  --help            Show this help message

Examples:
  caching-proxy --port 3000 --origin http://dummyjson.com
  caching-proxy --clear-cache

Response Headers:
  X-Cache: HIT    – response was served from the local cache
  X-Cache: MISS   – response was fetched from the origin server

Cache Location:
  .proxy-cache/   (in the current working directory)
`);
}

// ──────────────────────────────────────────────
// Validation helpers
// ──────────────────────────────────────────────
function validatePort(raw) {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 1 || n > 65535) {
    return null;
  }
  return n;
}

function validateOrigin(raw) {
  try {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return raw;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || Object.keys(args).length === 0) {
    printHelp();
    process.exit(0);
  }

  // ── --clear-cache ─────────────────────────
  if (args['clear-cache']) {
    cache.clear();
    process.exit(0);
  }

  // ── --port + --origin ──────────────────────
  if (!args.port && !args.origin) {
    console.error('Error: You must supply --port and --origin, or --clear-cache.');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  const port = validatePort(args.port);
  if (!port) {
    console.error(`Error: --port must be a valid port number (1-65535), got: "${args.port}"`);
    process.exit(1);
  }

  if (!args.origin) {
    console.error('Error: --origin is required.');
    process.exit(1);
  }

  const origin = validateOrigin(args.origin);
  if (!origin) {
    console.error(`Error: --origin must be a valid http/https URL, got: "${args.origin}"`);
    process.exit(1);
  }

  createServer({ port, origin });
}

main();
