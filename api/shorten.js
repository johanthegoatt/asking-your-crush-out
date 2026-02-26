"use strict";

const MAX_URL_LENGTH = 2048;
const {
  createInternalShortUrl,
  isValidHttpUrl,
  isUrlForRequestHost,
} = require("./_short-links");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const targetUrl = extractUrl(req);
  if (!isValidHttpUrl(targetUrl)) {
    return res.status(400).json({ error: "A valid http(s) URL is required." });
  }

  if (targetUrl.length > MAX_URL_LENGTH) {
    return res.status(400).json({ error: "URL is too long." });
  }

  if (!isUrlForRequestHost(targetUrl, req)) {
    return res.status(400).json({ error: "Only links from this site can be shortened." });
  }

  try {
    const shortUrl = await createInternalShortUrl(req, targetUrl);
    return res.status(200).json({ shortUrl });
  } catch (error) {
    if (error && error.message === "URL_HOST_MISMATCH") {
      return res.status(400).json({ error: "Only links from this site can be shortened." });
    }
    return res.status(500).json({ error: "Unexpected short-link failure." });
  }
};

function extractUrl(req) {
  if (req.body && typeof req.body === "object" && typeof req.body.url === "string") {
    return req.body.url.trim();
  }

  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed.url === "string") {
        return parsed.url.trim();
      }
    } catch {
      return "";
    }
  }

  if (req.query && typeof req.query.url === "string") {
    return req.query.url.trim();
  }

  return "";
}
