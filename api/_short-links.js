"use strict";

const zlib = require("zlib");

const SHORT_PATH_PREFIX = process.env.SHORT_LINK_PATH_PREFIX || "/s";
const FALLBACK_CODE_PREFIX = process.env.SHORT_LINK_FALLBACK_PREFIX || "x";
const MAX_SHORT_CODE_LENGTH = 4096;
const MAX_DESTINATION_LENGTH = 2048;
const SHORT_CODE_PATTERN = new RegExp(`^[A-Za-z0-9_-]{5,${MAX_SHORT_CODE_LENGTH}}$`);

module.exports = {
  createInternalShortUrl,
  extractRequestOrigin,
  isUrlForRequestHost,
  isValidHttpUrl,
  normalizeShortCode,
  resolveShortCode,
};

async function createInternalShortUrl(req, longUrl) {
  if (!isValidHttpUrl(longUrl)) {
    throw new Error("INVALID_URL");
  }

  const destination = toLocalDestination(longUrl, req);
  const code = encodeFallbackCode(destination);
  return buildShortUrl(req, code);
}

async function resolveShortCode(code) {
  const normalized = normalizeShortCode(code);
  if (!normalized) {
    return "";
  }

  return decodeFallbackCode(normalized);
}

function isValidHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeShortCode(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return SHORT_CODE_PATTERN.test(trimmed) ? trimmed : "";
}

function isUrlForRequestHost(url, req) {
  if (!isValidHttpUrl(url)) {
    return false;
  }

  const origin = extractRequestOrigin(req);
  if (!origin) {
    return false;
  }

  try {
    const parsedTarget = new URL(url);
    const parsedOrigin = new URL(origin);
    return parsedTarget.host === parsedOrigin.host;
  } catch {
    return false;
  }
}

function toLocalDestination(url, req) {
  if (!isUrlForRequestHost(url, req)) {
    throw new Error("URL_HOST_MISMATCH");
  }

  const parsed = new URL(url);
  const pathname = parsed.pathname && parsed.pathname.startsWith("/") ? parsed.pathname : "/";
  return `${pathname}${parsed.search}${parsed.hash}`;
}

function extractRequestOrigin(req) {
  const hostHeader = readHeader(req, ["x-forwarded-host", "host"]);
  if (!hostHeader) {
    return "";
  }

  const protoHeader = readHeader(req, ["x-forwarded-proto"]);
  const host = hostHeader.split(",")[0].trim();
  const rawProto = protoHeader ? protoHeader.split(",")[0].trim().toLowerCase() : "https";
  const protocol = rawProto === "http" || rawProto === "https" ? rawProto : "https";

  if (!host) {
    return "";
  }

  return `${protocol}://${host}`;
}

function readHeader(req, keys) {
  if (!req || !req.headers || typeof req.headers !== "object") {
    return "";
  }

  for (const key of keys) {
    const value = req.headers[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function buildShortUrl(req, code) {
  const origin = extractRequestOrigin(req);
  if (!origin) {
    throw new Error("REQUEST_ORIGIN_UNAVAILABLE");
  }

  const basePath = SHORT_PATH_PREFIX.startsWith("/") ? SHORT_PATH_PREFIX : `/${SHORT_PATH_PREFIX}`;
  return `${origin}${basePath}/${code}`;
}

function encodeFallbackCode(destination) {
  if (!isValidRelativeDestination(destination)) {
    throw new Error("INVALID_DESTINATION");
  }

  const compressed = zlib.deflateRawSync(Buffer.from(destination, "utf8"));
  const token = compressed.toString("base64url");
  const code = `${FALLBACK_CODE_PREFIX}${token}`;

  if (!normalizeShortCode(code)) {
    throw new Error("SHORT_CODE_GENERATION_FAILED");
  }

  return code;
}

function decodeFallbackCode(code) {
  if (typeof code !== "string" || !code.startsWith(FALLBACK_CODE_PREFIX)) {
    return "";
  }

  const token = code.slice(FALLBACK_CODE_PREFIX.length);
  if (!token || token.length > MAX_SHORT_CODE_LENGTH) {
    return "";
  }

  try {
    const compressed = Buffer.from(token, "base64url");
    const destination = zlib.inflateRawSync(compressed).toString("utf8");
    return isValidRelativeDestination(destination) ? destination : "";
  } catch {
    return "";
  }
}

function isValidRelativeDestination(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_DESTINATION_LENGTH ||
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//")
  ) {
    return false;
  }

  try {
    const parsed = new URL(trimmed, "https://example.com");
    return parsed.host === "example.com";
  } catch {
    return false;
  }
}
