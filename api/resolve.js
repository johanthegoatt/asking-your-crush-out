"use strict";

const { normalizeShortCode, resolveShortCode } = require("./_short-links");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  const code = normalizeShortCode(extractCode(req));
  if (!code) {
    return res.status(400).json({ error: "Invalid short-link code." });
  }

  try {
    const destination = await resolveShortCode(code);
    if (!destination) {
      return res.status(404).json({ error: "Short link not found." });
    }

    res.setHeader("Location", destination);
    return res.status(307).end();
  } catch {
    return res.status(500).json({ error: "Could not resolve short link." });
  }
};

function extractCode(req) {
  if (req.query && typeof req.query.code === "string") {
    return req.query.code.trim();
  }

  if (req.query && typeof req.query.slug === "string") {
    return req.query.slug.trim();
  }

  return "";
}
