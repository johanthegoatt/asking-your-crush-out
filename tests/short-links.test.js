const test = require("node:test");
const assert = require("node:assert/strict");

const { isValidHttpUrl, normalizeShortCode, extractRequestOrigin, isUrlForRequestHost } = require("../api/_short-links");

test("isValidHttpUrl accepts http and https", () => {
  assert.equal(isValidHttpUrl("https://example.com"), true);
  assert.equal(isValidHttpUrl("http://example.com/path"), true);
  assert.equal(isValidHttpUrl("ftp://example.com"), false);
});

test("normalizeShortCode strips invalid values", () => {
  assert.equal(normalizeShortCode("abc_12"), "abc_12");
  assert.equal(normalizeShortCode("bad code"), "");
  assert.equal(normalizeShortCode("a"), "");
});

test("extractRequestOrigin reads forwarded headers", () => {
  const req = {
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "alphonso-portfolio.vercel.app",
    },
  };
  assert.equal(extractRequestOrigin(req), "https://alphonso-portfolio.vercel.app");
});

test("isUrlForRequestHost enforces same host", () => {
  const req = {
    headers: {
      host: "alphonso-portfolio.vercel.app",
      "x-forwarded-proto": "https",
    },
  };
  assert.equal(isUrlForRequestHost("https://alphonso-portfolio.vercel.app/path", req), true);
  assert.equal(isUrlForRequestHost("https://example.com/path", req), false);
});

test("shorten returns a short URL", async () => {
  const handler = require("../api/shorten");
  const req = {
    method: "POST",
    headers: {
      host: "example.com",
      "x-forwarded-proto": "https",
    },
    body: {
      url: "https://example.com/hello",
    },
    query: {},
  };
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.body.shortUrl, "string");
  assert.match(res.body.shortUrl, /^https:\/\/example\.com\/s\/[A-Za-z0-9_-]{5,}$/);
});

test("resolve redirects correctly using generated short code", async () => {
  const shorten = require("../api/shorten");
  const resolve = require("../api/resolve");

  const shortenReq = {
    method: "POST",
    headers: {
      host: "example.com",
      "x-forwarded-proto": "https",
    },
    body: {
      url: "https://example.com/path/to/date?step=1#plan",
    },
    query: {},
  };
  const shortenRes = createMockResponse();
  await shorten(shortenReq, shortenRes);

  assert.equal(shortenRes.statusCode, 200);
  const code = shortenRes.body.shortUrl.split("/s/")[1];
  assert.equal(Boolean(code), true);

  const resolveReq = {
    method: "GET",
    headers: {},
    query: { code },
  };
  const resolveRes = createMockResponse();

  await resolve(resolveReq, resolveRes);

  assert.equal(resolveRes.statusCode, 307);
  assert.equal(resolveRes.headers.location, "/path/to/date?step=1#plan");
});

test("shorten rejects non-POST requests with 405 and Allow header", async () => {
  const handler = require("../api/shorten");
  const req = {
    method: "GET",
    headers: {},
    query: {},
    body: {},
  };
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "POST, OPTIONS");
  assert.deepEqual(res.body, { error: "Method not allowed. Use POST." });
});

test("resolve rejects unsupported methods with 405 and Allow header", async () => {
  const handler = require("../api/resolve");
  const req = {
    method: "POST",
    headers: {},
    query: {},
  };
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "GET, HEAD, OPTIONS");
  assert.deepEqual(res.body, { error: "Method not allowed. Use GET." });
});

function createMockResponse() {
  const headers = {};
  let statusCode = 200;
  let body;

  return {
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    setHeader(name, value) {
      headers[name] = value;
      headers[String(name).toLowerCase()] = value;
      return this;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    end(payload) {
      body = payload;
      return this;
    },
  };
}
