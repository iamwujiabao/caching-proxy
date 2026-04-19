# caching-proxy

A lightweight CLI caching proxy server built with zero external dependencies. It sits between your HTTP client and an origin server, forwarding requests on the first call and serving subsequent identical requests straight from a local file cache.

## Features

- Forwards requests to any `http://` or `https://` origin
- Caches `GET` and `HEAD` responses to disk — survives process restarts
- Returns an `X-Cache: HIT` or `X-Cache: MISS` header on every response
- One command to wipe the entire cache
- No `npm install` required — only Node.js built-ins

## Requirements

- Node.js v14 or later

## Installation

Clone or download the project, then install the CLI globally:

```bash
npm install -g .
```

This adds `caching-proxy` to your PATH so you can run it from anywhere.

## Usage

### Start the proxy server

```bash
caching-proxy --port <number> --origin <url>
```

| Flag | Description |
|------|-------------|
| `--port` | Port the proxy server listens on (1–65535) |
| `--origin` | Base URL of the upstream server to proxy |

**Example:**

```bash
caching-proxy --port 3000 --origin http://dummyjson.com
```

The proxy starts on port 3000. Any request to `http://localhost:3000/<path>` is forwarded to `http://dummyjson.com/<path>`.

### Clear the cache

```bash
caching-proxy --clear-cache
```

Deletes all cached entries and removes the `.proxy-cache/` directory.

### Help

```bash
caching-proxy --help
```

## How it works

```
Client ──► caching-proxy ──► Origin server
                │                  │
           Cache HIT?         Fetch & store
                │                  │
           Return cached ◄─── Return response
           response               +
           (X-Cache: HIT)    (X-Cache: MISS)
```

On the first request to a URL the proxy fetches the response from the origin, writes it to disk, and returns it to the client with `X-Cache: MISS`. On every subsequent request to the same URL, the response is read from disk and returned with `X-Cache: HIT` — no network call is made.

Only `GET` and `HEAD` requests are cached, since they are the only safe, idempotent HTTP methods. `POST`, `PUT`, `DELETE`, and other mutating methods are always forwarded to the origin and never stored.

## Cache storage

Responses are stored under `.proxy-cache/` in the directory where you run the command. Each entry is a JSON file named after the SHA-256 hash of the request method and URL:

```
.proxy-cache/
├── a2e999…7d.json    # GET http://dummyjson.com/products/1
└── b790be…8a.json    # GET http://dummyjson.com/posts/1
```

Each file contains the status code, response headers, and body (Base64-encoded to support binary content):

```json
{
  "statusCode": 200,
  "headers": {
    "content-type": "application/json",
    "x-cache": "MISS"
  },
  "body": "eyJpZCI6MSwi..."
}
```

Responses with status codes outside the `2xx`–`3xx` range (e.g. `404`, `500`) are not cached.

## X-Cache header

Every response from the proxy includes an `X-Cache` header:

```
X-Cache: HIT    # Served from local cache
X-Cache: MISS   # Fetched from the origin server
```

## Example session

```bash
# Start the proxy
caching-proxy --port 3000 --origin http://dummyjson.com

# First request — fetches from origin
curl -i http://localhost:3000/products/1
# X-Cache: MISS

# Same request again — served from cache
curl -i http://localhost:3000/products/1
# X-Cache: HIT

# Different path — fetches from origin
curl -i http://localhost:3000/users/1
# X-Cache: MISS

# Clear everything
caching-proxy --clear-cache
# ✔  Cache cleared. 2 entries removed.
```

## Project structure

```
caching-proxy/
├── package.json
└── src/
    ├── index.js    # CLI entry point — argument parsing and validation
    ├── server.js   # HTTP proxy server
    └── cache.js    # File-based cache engine (read / write / clear)
```

## Error handling

| Situation | Behaviour |
|-----------|-----------|
| Origin server unreachable | Returns `502 Bad Gateway` with the error message |
| Invalid `--port` value | Exits with a descriptive error before starting |
| Invalid `--origin` URL | Exits with a descriptive error before starting |
| `--clear-cache` with no cache | Prints a notice and exits cleanly |

## License

MIT
