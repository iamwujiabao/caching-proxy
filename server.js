/**
 * server.js
 * Creates and starts the HTTP caching proxy server.
 */

'use strict';

const http  = require('http');
const https = require('https');
const { URL } = require('url');

const cache = require('./cache');

// Headers that should not be blindly forwarded to the client as-is
// because they would conflict with our own response construction.
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
]);

/**
 * Forward a client request to the origin and return the collected response.
 * @returns {Promise<{ statusCode: number, headers: object, body: Buffer }>}
 */
function fetchFromOrigin(originBase, req) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(req.url, originBase);
    const isHttps   = targetUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    // Copy safe headers from incoming request
    const forwardHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'host') {
        forwardHeaders[k] = v;
      }
    }
    forwardHeaders['host'] = targetUrl.host;

    const options = {
      hostname: targetUrl.hostname,
      port:     targetUrl.port || (isHttps ? 443 : 80),
      path:     targetUrl.pathname + targetUrl.search,
      method:   req.method,
      headers:  forwardHeaders,
    };

    const proxyReq = transport.request(options, (proxyRes) => {
      const chunks = [];
      proxyRes.on('data', (chunk) => chunks.push(chunk));
      proxyRes.on('end', () => {
        resolve({
          statusCode: proxyRes.statusCode,
          headers:    proxyRes.headers,
          body:       Buffer.concat(chunks),
        });
      });
    });

    proxyReq.on('error', reject);

    // Pipe request body (for POST/PUT etc.)
    req.pipe(proxyReq);
  });
}

/**
 * Build and start the proxy server.
 * @param {{ port: number, origin: string }} options
 */
function createServer({ port, origin }) {
  // Normalise origin – strip trailing slash
  const originBase = origin.replace(/\/$/, '');

  const server = http.createServer(async (req, res) => {
    const fullUrl = `${originBase}${req.url}`;
    const label   = `${req.method} ${req.url}`;

    // Only cache safe/idempotent methods
    const cacheable = ['GET', 'HEAD'].includes(req.method.toUpperCase());

    if (cacheable) {
      const hit = cache.get(req.method, fullUrl);
      if (hit) {
        console.log(`  CACHE HIT  → ${label}`);
        res.writeHead(hit.statusCode, {
          ...hit.headers,
          'x-cache': 'HIT',
        });
        res.end(Buffer.from(hit.body, 'base64'));
        return;
      }
    }

    // Cache miss – fetch from origin
    console.log(`  CACHE MISS → ${label}  (fetching from ${originBase})`);

    try {
      const upstream = await fetchFromOrigin(originBase, req);

      // Strip hop-by-hop headers before forwarding
      const outHeaders = {};
      for (const [k, v] of Object.entries(upstream.headers)) {
        if (!HOP_BY_HOP.has(k.toLowerCase())) {
          outHeaders[k] = v;
        }
      }
      outHeaders['x-cache'] = 'MISS';

      res.writeHead(upstream.statusCode, outHeaders);
      res.end(upstream.body);

      // Persist to cache only for successful cacheable requests
      if (cacheable && upstream.statusCode >= 200 && upstream.statusCode < 400) {
        cache.set(req.method, fullUrl, {
          statusCode: upstream.statusCode,
          headers:    outHeaders,
          body:       upstream.body.toString('base64'),
        });
      }
    } catch (err) {
      console.error(`  ERROR      → ${label}:`, err.message);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`Bad Gateway: ${err.message}`);
    }
  });

  server.listen(port, () => {
    const { entries, sizeBytes } = cache.stats();
    console.log('');
    console.log('┌─────────────────────────────────────────────┐');
    console.log('│           Caching Proxy Server              │');
    console.log('├─────────────────────────────────────────────┤');
    console.log(`│  Listening on  : http://localhost:${port}      │`);
    console.log(`│  Forwarding to : ${originBase.padEnd(26)} │`);
    console.log(`│  Cache entries : ${String(entries).padEnd(26)} │`);
    console.log(`│  Cache size    : ${(sizeBytes / 1024).toFixed(1).padEnd(23)} KB │`);
    console.log('└─────────────────────────────────────────────┘');
    console.log('');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down gracefully…');
    server.close(() => process.exit(0));
  });

  return server;
}

module.exports = { createServer };
