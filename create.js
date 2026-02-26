"use strict";

const PARAM_PAYLOAD = "p";
const PARAM_THEME = "vibe";
const PARAM_TO = "to";
const PARAM_FROM = "from";
const PARAM_MESSAGE = "msg";
const PARAM_ANON = "anon";
const PARAM_SONG = "song";
const DEFAULT_THEME = "classic";
const DEFAULT_SPOTIFY_TRACK_URL = "";
const NAME_PATTERN = /^[A-Za-z0-9 .,'-]{1,40}$/;
const STORAGE_BUILDER_STATE_KEY = "ask:builder:state:v1";

const LIMITS = {
  toName: 20,
  fromName: 24,
  message: 140,
  song: 260,
};

const themes = {
  classic: { label: "Classic Red" },
  soft: { label: "Soft Pink" },
  cyber: { label: "Cyber Lavender" },
};

const state = {
  toName: "Yasha",
  fromName: "",
  customMessage: "",
  anonymous: false,
  songLink: "",
  theme: DEFAULT_THEME,
};

const shortLinkCache = new Map();
let isShortening = false;

const els = {
  toInput: document.getElementById("builderToInput"),
  fromInput: document.getElementById("builderFromInput"),
  msgInput: document.getElementById("builderMsgInput"),
  songInput: document.getElementById("builderSongInput"),
  anonInput: document.getElementById("builderAnonInput"),
  vibeHint: document.getElementById("builderVibeHint"),
  vibeCards: Array.from(document.querySelectorAll(".vibe-card")),
  linkInput: document.getElementById("builderLinkInput"),
  shortenBtn: document.getElementById("builderShortenBtn"),
  copyBtn: document.getElementById("builderCopyBtn"),
  shareBtn: document.getElementById("builderShareBtn"),
  waBtn: document.getElementById("builderWaBtn"),
  openBtn: document.getElementById("builderOpenBtn"),
  status: document.getElementById("builderStatus"),
};

init();

function init() {
  hydrateFromUrl();
  syncInputsFromState();
  bindEvents();
  applyTheme(state.theme);
  rebuildLink(false);
  validateInputs(false);
}

function bindEvents() {
  const textInputs = [els.toInput, els.fromInput, els.msgInput, els.songInput].filter(Boolean);
  textInputs.forEach((input) => {
    input.addEventListener("input", () => {
      readStateFromInputs();
      validateInputs(false);
      rebuildLink(false);
    });
  });

  if (els.anonInput) {
    els.anonInput.addEventListener("change", () => {
      readStateFromInputs();
      validateInputs(false);
      rebuildLink(false);
    });
  }

  els.vibeCards.forEach((card) => {
    card.addEventListener("click", () => {
      applyTheme(card.dataset.theme);
      validateInputs(false);
      rebuildLink(true);
    });
  });

  if (els.copyBtn) {
    els.copyBtn.addEventListener("click", () => {
      copyLink();
    });
  }

  if (els.shareBtn) {
    els.shareBtn.addEventListener("click", () => {
      shareLink();
    });
  }

  if (els.shortenBtn) {
    els.shortenBtn.addEventListener("click", () => {
      shortenLink();
    });
  }

  if (els.waBtn) {
    els.waBtn.addEventListener("click", () => {
      sendViaEmail();
    });
  }

  if (els.openBtn) {
    els.openBtn.addEventListener("click", () => {
      openPersonalLink();
    });
  }
}

function hydrateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const payload = decodePayload(params.get(PARAM_PAYLOAD));
  const hasDirectParams =
    params.has(PARAM_TO) ||
    params.has(PARAM_FROM) ||
    params.has(PARAM_MESSAGE) ||
    params.has(PARAM_ANON) ||
    params.has(PARAM_SONG) ||
    params.has(PARAM_THEME);

  if (payload) {
    state.toName = sanitizeName(payload.t || payload.to, LIMITS.toName, "Yasha");
    state.fromName = sanitizeName(payload.f || payload.from, LIMITS.fromName, "");
    state.customMessage = sanitizeText(payload.m || payload.msg, LIMITS.message);
    state.songLink = sanitizeSongLink(payload.s || payload.song) || DEFAULT_SPOTIFY_TRACK_URL;
    state.anonymous = parseBoolean(payload.a || payload.anon);
    state.theme = sanitizeTheme(payload.v || payload.vibe);
    persistBuilderState();
    return;
  }

  if (hasDirectParams) {
    state.toName = sanitizeName(params.get(PARAM_TO), LIMITS.toName, "Yasha");
    state.fromName = sanitizeName(params.get(PARAM_FROM), LIMITS.fromName, "");
    state.customMessage = sanitizeText(params.get(PARAM_MESSAGE), LIMITS.message);
    state.songLink = sanitizeSongLink(params.get(PARAM_SONG)) || DEFAULT_SPOTIFY_TRACK_URL;
    state.anonymous = parseBoolean(params.get(PARAM_ANON));
    state.theme = sanitizeTheme(params.get(PARAM_THEME));
    persistBuilderState();
    return;
  }

  hydrateBuilderState();
}

function syncInputsFromState() {
  if (els.toInput) {
    els.toInput.value = state.toName;
  }
  if (els.fromInput) {
    els.fromInput.value = state.fromName;
  }
  if (els.msgInput) {
    els.msgInput.value = state.customMessage;
  }
  if (els.songInput) {
    els.songInput.value = state.songLink;
  }
  if (els.anonInput) {
    els.anonInput.checked = state.anonymous;
  }
}

function readStateFromInputs() {
  state.toName = sanitizeName(els.toInput ? els.toInput.value : "", LIMITS.toName, "Yasha");
  state.fromName = sanitizeName(els.fromInput ? els.fromInput.value : "", LIMITS.fromName, "");
  state.customMessage = sanitizeText(els.msgInput ? els.msgInput.value : "", LIMITS.message);
  state.songLink = sanitizeSongLink(els.songInput ? els.songInput.value : "");
  state.anonymous = Boolean(els.anonInput && els.anonInput.checked);
  syncInputsFromState();
  persistBuilderState();
}

function applyTheme(themeKey) {
  state.theme = sanitizeTheme(themeKey);
  document.body.dataset.theme = state.theme;

  els.vibeCards.forEach((card) => {
    const selected = card.dataset.theme === state.theme;
    card.classList.toggle("is-selected", selected);
    card.setAttribute("aria-checked", String(selected));
  });

  if (els.vibeHint) {
    els.vibeHint.textContent = `${themes[state.theme].label} selected.`;
  }

  persistBuilderState();
}

function buildPayload() {
  return {
    v: state.theme,
    t: state.toName,
    f: state.fromName,
    m: state.customMessage,
    a: state.anonymous ? 1 : 0,
    s: state.songLink,
  };
}

function buildPersonalLink() {
  const payload = buildPayload();
  const token = encodePayload(payload);
  if (!token) {
    return "";
  }

  const url = new URL("index.html", window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(PARAM_PAYLOAD, token);
  return url.toString();
}

function rebuildLink(announce) {
  if (!els.linkInput) {
    return;
  }

  const validation = validateInputs(announce);
  if (!validation.valid) {
    els.linkInput.value = "";
    if (announce) {
      setStatus(validation.message);
    }
    return;
  }

  const link = buildPersonalLink();
  els.linkInput.value = link;
  shortLinkCache.clear();
  setShortenBusy(false);
  if (els.shortenBtn) {
    els.shortenBtn.textContent = "Shorten";
  }

  if (announce && els.status) {
    els.status.textContent = "Personal link updated.";
  }
}

async function shortenLink() {
  if (!els.shortenBtn || isShortening) {
    return;
  }

  const validation = validateInputs(true);
  if (!validation.valid) {
    setStatus(validation.message);
    return;
  }

  const longLink = buildPersonalLink();
  if (!longLink) {
    return;
  }

  const cached = shortLinkCache.get(longLink);
  if (cached) {
    els.linkInput.value = cached;
    els.shortenBtn.textContent = "Shortened";
    setStatus("Short link ready.");
    return;
  }

  setShortenBusy(true);
  try {
    const response = await fetch("/api/shorten", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: longLink }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(getShortenerErrorMessage(payload.error));
    }
    if (!payload.shortUrl) {
      throw new Error("Shortener returned an invalid response.");
    }

    const shortUrl = sanitizeHttpUrl(payload.shortUrl);
    if (!shortUrl) {
      throw new Error("Invalid short URL.");
    }

    shortLinkCache.set(longLink, shortUrl);
    els.linkInput.value = shortUrl;
    els.shortenBtn.textContent = "Shortened";
    setStatus("Short link generated.");
  } catch (error) {
    els.linkInput.value = longLink;
    els.shortenBtn.textContent = "Shorten";
    setStatus(error && error.message ? error.message : "Shortener failed. Using full link.");
  } finally {
    setShortenBusy(false);
  }
}

function setShortenBusy(busy) {
  isShortening = busy;
  if (!els.shortenBtn) {
    return;
  }

  els.shortenBtn.disabled = busy;
  if (busy) {
    els.shortenBtn.textContent = "Shortening...";
  }
}

async function copyLink() {
  const link = getCurrentLink();
  if (!link) {
    return;
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(link);
    } else {
      els.linkInput.removeAttribute("readonly");
      els.linkInput.select();
      document.execCommand("copy");
      els.linkInput.setAttribute("readonly", "readonly");
    }

    if (els.copyBtn) {
      els.copyBtn.textContent = "Copied";
      window.setTimeout(() => {
        els.copyBtn.textContent = "Copy";
      }, 1200);
    }
    setStatus("Link copied.");
  } catch {
    setStatus("Copy failed. Copy manually.");
  }
}

async function shareLink() {
  const link = getCurrentLink();
  if (!link) {
    return;
  }

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${state.toName}, will you go out with me?`,
        text: "Open this personal page.",
        url: link,
      });
      setStatus("Share sheet opened.");
      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
    }
  }

  await copyLink();
}

function sendViaEmail() {
  const link = getCurrentLink();
  if (!link) {
    return;
  }

  const sender = state.fromName || "Someone";
  const subject = `${state.toName}, open this link`;
  const intro = state.anonymous ? "I made this just for you." : `${sender} made this just for you.`;
  const body = `${intro}\n\n${link}`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  setStatus("Opening email app...");
}

function openPersonalLink() {
  const link = buildPersonalLink();
  if (!link) {
    return;
  }

  window.open(link, "_blank", "noopener,noreferrer");
}

function getCurrentLink() {
  const visible = sanitizeHttpUrl(els.linkInput ? els.linkInput.value : "");
  if (visible) {
    return visible;
  }
  return buildPersonalLink();
}

function sanitizeTheme(value) {
  return themes[value] ? value : DEFAULT_THEME;
}

function sanitizeName(value, maxLength, fallback) {
  const clean = sanitizeText(value, maxLength);
  if (!clean) {
    return fallback;
  }
  return NAME_PATTERN.test(clean) ? clean : fallback;
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeSongLink(value) {
  const clean = sanitizeText(value, LIMITS.song);
  if (!clean) {
    return "";
  }

  try {
    const parsed = new URL(clean);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    try {
      const withHttps = new URL(`https://${clean}`);
      return withHttps.toString();
    } catch {
      return "";
    }
  }

  return "";
}

function sanitizeHttpUrl(value) {
  const clean = String(value || "").trim();
  if (!clean) {
    return "";
  }

  try {
    const parsed = new URL(clean);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return "";
  }

  return "";
}

function parseBoolean(value) {
  if (!value) {
    return false;
  }

  const normalized = String(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function encodePayload(payload) {
  try {
    const json = JSON.stringify(payload);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch {
    return "";
  }
}

function decodePayload(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  try {
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function setStatus(message) {
  if (els.status) {
    els.status.textContent = message;
  }
}

function getShortenerErrorMessage(code) {
  if (typeof code === "string" && code.trim()) {
    return code;
  }
  return "Shortener failed. Using full link.";
}

function validateInputs(announce) {
  const toName = sanitizeText(els.toInput ? els.toInput.value : "", LIMITS.toName);
  const fromName = sanitizeText(els.fromInput ? els.fromInput.value : "", LIMITS.fromName);

  if (els.toInput) {
    els.toInput.setCustomValidity("");
  }
  if (els.fromInput) {
    els.fromInput.setCustomValidity("");
  }
  if (els.songInput) {
    els.songInput.setCustomValidity("");
  }

  if (!toName) {
    if (els.toInput) {
      els.toInput.setCustomValidity("Please enter a name.");
    }
    if (announce) {
      setStatus("Please enter a name.");
    }
    return { valid: false, message: "Please enter a name." };
  }

  if (!NAME_PATTERN.test(toName)) {
    if (els.toInput) {
      els.toInput.setCustomValidity("Use letters, numbers, spaces, and basic punctuation only.");
    }
    if (announce) {
      setStatus("Name has invalid characters.");
    }
    return { valid: false, message: "Name has invalid characters." };
  }

  if (fromName && !NAME_PATTERN.test(fromName)) {
    if (els.fromInput) {
      els.fromInput.setCustomValidity("Use letters, numbers, spaces, and basic punctuation only.");
    }
    if (announce) {
      setStatus("Your name has invalid characters.");
    }
    return { valid: false, message: "Your name has invalid characters." };
  }

  const song = sanitizeText(els.songInput ? els.songInput.value : "", LIMITS.song);
  if (song && !sanitizeSongLink(song)) {
    if (els.songInput) {
      els.songInput.setCustomValidity("Enter a valid http(s) URL.");
    }
    if (announce) {
      setStatus("Song link must be a valid URL.");
    }
    return { valid: false, message: "Song link must be a valid URL." };
  }

  return { valid: true, message: "" };
}

function persistBuilderState() {
  const payload = JSON.stringify({
    toName: state.toName,
    fromName: state.fromName,
    customMessage: state.customMessage,
    anonymous: state.anonymous,
    songLink: state.songLink,
    theme: state.theme,
  });
  writeStorage(STORAGE_BUILDER_STATE_KEY, payload);
}

function hydrateBuilderState() {
  const raw = readStorage(STORAGE_BUILDER_STATE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return;
    }
    state.toName = sanitizeName(parsed.toName, LIMITS.toName, "Yasha");
    state.fromName = sanitizeName(parsed.fromName, LIMITS.fromName, "");
    state.customMessage = sanitizeText(parsed.customMessage, LIMITS.message);
    state.songLink = sanitizeSongLink(parsed.songLink) || DEFAULT_SPOTIFY_TRACK_URL;
    state.anonymous = Boolean(parsed.anonymous);
    state.theme = sanitizeTheme(parsed.theme);
  } catch {
    // Ignore invalid local builder state.
  }
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return "";
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore local storage failures.
  }
}
