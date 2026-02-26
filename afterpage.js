"use strict";

const PARAM_THEME = "vibe";
const PARAM_TO = "to";
const PARAM_FROM = "from";
const PARAM_ANON = "anon";
const PARAM_PAYLOAD = "p";

const STORAGE_STATE_KEY = "ask:main:state:v1";
const STORAGE_THEME_KEY = "ask:main:theme:v1";

const themes = {
  classic: {
    lead: "Elegant, simple, and intentional. Keep the date timeless.",
  },
  soft: {
    lead: "Cute, calm, and sweet. Keep the date gentle and warm.",
  },
  cyber: {
    lead: "Playful and bold. This is the high-energy date route.",
  },
};

initAfterpage();

function initAfterpage() {
  const params = new URLSearchParams(window.location.search);
  const payload = decodePayload(params.get(PARAM_PAYLOAD));

  const savedState = readSavedState();
  const toName = sanitizeName(
    (payload && (payload.t || payload.to)) || params.get(PARAM_TO) || savedState.toName,
    "there"
  );
  const fromName = sanitizeName(
    (payload && (payload.f || payload.from)) || params.get(PARAM_FROM) || savedState.fromName,
    ""
  );
  const anonymous = parseBoolean((payload && (payload.a || payload.anon)) || params.get(PARAM_ANON) || "");
  const theme = sanitizeTheme(
    (payload && (payload.v || payload.vibe)) || params.get(PARAM_THEME) || readStorage(STORAGE_THEME_KEY) || "classic"
  );

  document.body.dataset.vibe = theme;
  updateText({
    toName,
    fromName,
    anonymous,
    lead: themes[theme].lead,
  });
  updateSeo(toName, theme);
}

function updateText(context) {
  const headline = document.getElementById("afterHeadline");
  const lead = document.getElementById("afterLead");
  const note = document.getElementById("afterPersonalNote");

  if (headline) {
    headline.textContent = `${context.toName} said yes`;
  }

  if (lead) {
    lead.textContent = context.lead;
  }

  if (note) {
    if (context.anonymous || !context.fromName) {
      note.textContent = `Plan a simple, confident first date with ${context.toName}.`;
      return;
    }
    note.textContent = `${context.fromName} can now finalize details with ${context.toName}.`;
  }
}

function updateSeo(toName, theme) {
  const title = `${toName} - ${capitalize(theme)} Afterpage`;
  document.title = title;
  setMeta("meta[name='description']", `Afterpage for ${toName} in ${capitalize(theme)} vibe.`);
}

function readSavedState() {
  const raw = readStorage(STORAGE_STATE_KEY);
  if (!raw) {
    return { toName: "", fromName: "" };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { toName: "", fromName: "" };
    }
    return {
      toName: sanitizeName(parsed.toName, ""),
      fromName: sanitizeName(parsed.fromName, ""),
    };
  } catch {
    return { toName: "", fromName: "" };
  }
}

function sanitizeTheme(value) {
  return themes[value] ? value : "classic";
}

function sanitizeName(value, fallback) {
  const clean = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
  return clean || fallback;
}

function parseBoolean(value) {
  const normalized = String(value || "").toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
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
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function setMeta(selector, content) {
  const tag = document.querySelector(selector);
  if (tag) {
    tag.setAttribute("content", content);
    return;
  }

  if (selector === "meta[name='description']") {
    const created = document.createElement("meta");
    created.setAttribute("name", "description");
    created.setAttribute("content", content);
    document.head.appendChild(created);
  }
}

function capitalize(value) {
  const raw = String(value || "");
  return raw ? raw[0].toUpperCase() + raw.slice(1) : "";
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
