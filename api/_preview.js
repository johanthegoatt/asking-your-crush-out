"use strict";

// Link unfurlers never run the page's JavaScript, so they only ever saw the
// static "Yasha" meta tags. These agents get a tiny page with real tags instead.
const PREVIEW_BOT_PATTERN =
  /(facebookexternalhit|facebot|twitterbot|slackbot|discordbot|telegrambot|whatsapp|linkedinbot|pinterest|skypeuripreview|redditbot|embedly|vkshare|applebot|iframely)/i;

const MAX_NAME_LENGTH = 40;

module.exports = {
  buildPreviewHtml,
  isPreviewBot,
  readPreviewNames,
};

function isPreviewBot(req) {
  const agent = req && req.headers ? req.headers["user-agent"] : "";
  return typeof agent === "string" && PREVIEW_BOT_PATTERN.test(agent);
}

function readPreviewNames(destination) {
  try {
    const url = new URL(destination, "https://preview.local");
    const token = url.searchParams.get("p");
    if (token) {
      const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
      return {
        to: cleanName(parsed && (parsed.t || parsed.to)),
        from: parsed && (parsed.a === 1 || parsed.a === "1") ? "" : cleanName(parsed && (parsed.f || parsed.from)),
      };
    }
    return { to: cleanName(url.searchParams.get("to")), from: cleanName(url.searchParams.get("from")) };
  } catch {
    return { to: "", from: "" };
  }
}

function buildPreviewHtml(destination, origin) {
  const { to, from } = readPreviewNames(destination);
  const title = to ? `${to}, will you go out with me?` : "Someone has a question for you";
  const description = from ? `${from} made this page for ${to || "you"}.` : "Open it. It's worth it.";
  const target = `${origin || ""}${destination}`;
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:url" content="${escapeHtml(target)}">`,
    '<meta name="twitter:card" content="summary">',
    `<meta http-equiv="refresh" content="0;url=${escapeHtml(destination)}">`,
    "</head><body></body></html>",
  ].join("\n");
}

function cleanName(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
