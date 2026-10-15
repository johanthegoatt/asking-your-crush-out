"use strict";

const zlib = require("zlib");

const SHORT_PATH_PREFIX = process.env.SHORT_LINK_PATH_PREFIX || "/s";
const FALLBACK_CODE_PREFIX = process.env.SHORT_LINK_FALLBACK_PREFIX || "x";
// Compact codes carry the card payload as raw separated fields instead of
// base64 JSON, which roughly halves the code length.
const COMPACT_CODE_PREFIX = "y";
const COMPACT_FIELDS = ["v", "t", "f", "m", "a", "s"];
const FIELD_SEPARATOR = "\u001f";
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

  const compact = encodeCompactCode(destination);
  if (compact) {
    return compact;
  }

  const compressed = zlib.deflateRawSync(Buffer.from(destination, "utf8"));
  const token = compressed.toString("base64url");
  const code = `${FALLBACK_CODE_PREFIX}${token}`;

  if (!normalizeShortCode(code)) {
    throw new Error("SHORT_CODE_GENERATION_FAILED");
  }

  return code;
}

function encodeCompactCode(destination) {
  const parsed = new URL(destination, "https://example.com");
  const keys = Array.from(parsed.searchParams.keys());
  if (parsed.hash || keys.length !== 1 || keys[0] !== "p") {
    return "";
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parsed.searchParams.get("p"), "base64url").toString("utf8"));
  } catch {
    return "";
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }
  const extraKeys = Object.keys(payload).filter((key) => !COMPACT_FIELDS.includes(key));
  const values = COMPACT_FIELDS.map((key) => String(payload[key] ?? ""));
  if (extraKeys.length || values.some((value) => value.includes(FIELD_SEPARATOR) || value.includes("\n"))) {
    return "";
  }

  const text = `${parsed.pathname}\n${values.join(FIELD_SEPARATOR)}`;
  const code = `${COMPACT_CODE_PREFIX}${zlib.deflateRawSync(Buffer.from(text, "utf8")).toString("base64url")}`;
  return normalizeShortCode(code) ? code : "";
}

function decodeCompactCode(code) {
  try {
    const text = zlib.inflateRawSync(Buffer.from(code.slice(COMPACT_CODE_PREFIX.length), "base64url")).toString("utf8");
    const newline = text.indexOf("\n");
    if (newline < 0) {
      return "";
    }
    const values = text.slice(newline + 1).split(FIELD_SEPARATOR);
    if (values.length !== COMPACT_FIELDS.length) {
      return "";
    }
    const payload = {};
    COMPACT_FIELDS.forEach((key, index) => {
      payload[key] = key === "a" ? Number(values[index]) || 0 : values[index];
    });
    const token = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const destination = `${text.slice(0, newline)}?p=${token}`;
    return isValidRelativeDestination(destination) ? destination : "";
  } catch {
    return "";
  }
}

function decodeFallbackCode(code) {
  if (typeof code === "string" && code.startsWith(COMPACT_CODE_PREFIX)) {
    return decodeCompactCode(code);
  }

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
