"use strict";

const PARAM_THEME = "vibe";
const PARAM_TO = "to";
const PARAM_FROM = "from";
const PARAM_MESSAGE = "msg";
const PARAM_ANON = "anon";
const PARAM_SONG = "song";
const PARAM_PAYLOAD = "p";

const STORAGE_STATE_KEY = "ask:main:state:v1";
const STORAGE_THEME_KEY = "ask:main:theme:v1";
const STORAGE_RESPONSE_KEY = "ask:main:last-response:v1";

const DEFAULT_THEME = "classic";
const DEFAULT_AFTER_PAGE = "afterpage-classic.html";
const DEFAULT_SPOTIFY_TRACK_URL = "";
const NAME_PATTERN = /^[A-Za-z0-9 .,'-]{1,40}$/;
const ACTION_THROTTLE_MS = 260;

const LIMITS = {
  toName: 20,
  fromName: 24,
  message: 140,
  song: 260,
};

const themes = {
  classic: {
    label: "Classic Red",
    palette: ["#ff4f72", "#ffcb6b", "#ff7d5f", "#ffffff", "#ff9a8a"],
    afterPage: "afterpage-classic.html",
  },
  soft: {
    label: "Soft Pink",
    palette: ["#f08bb7", "#ffd1ed", "#ffc0e5", "#fff3fa", "#fcb4d8"],
    afterPage: "afterpage-soft.html",
  },
  cyber: {
    label: "Cyber Lavender",
    palette: ["#8a68f0", "#b19cd9", "#d4c5f9", "#ffffff", "#b9a9f7"],
    afterPage: "afterpage-cyber.html",
  },
};

const maybeMessages = [
  "Maybe detected. I respect the suspense.",
  "I can work with maybe. Want a smooth date plan?",
  "Maybe is still progress.",
  "Fair. Taking the maybe as cautious optimism.",
];

const noMessages = [
  "That button seems hard to press for some reason.",
  "Counter offer: give me one chance.",
  "Final answer? Try again, respectfully.",
  "This is becoming a comedy scene.",
  "The Yes button is looking very correct right now.",
  "Plot twist: we both have a great time.",
];

const NO_RESET_DELAY_MS = 1200;
const NO_EDGE_PADDING_PX = 8;
const NO_CLEARANCE_PX = 12;
const NO_MAX_PLACEMENT_TRIES = 120;

const state = {
  toName: "Yasha",
  fromName: "",
  customMessage: "",
  anonymous: false,
  songLink: DEFAULT_SPOTIFY_TRACK_URL,
};

const els = {
  ambient: document.getElementById("ambient"),
  questionCard: document.getElementById("questionCard"),
  promptLine: document.getElementById("promptLine"),
  reasonText: document.getElementById("reasonText"),
  statusLine: document.getElementById("statusLine"),
  buttonZone: document.getElementById("buttonZone"),
  yesBtn: document.getElementById("yesBtn"),
  maybeBtn: document.getElementById("maybeBtn"),
  noBtn: document.getElementById("noBtn"),
  yesOverlay: document.getElementById("yesOverlay"),
  replayBtn: document.getElementById("replayBtn"),
  overlayText: document.getElementById("overlayText"),
  planSection: document.getElementById("planSection"),
  loveWall: document.getElementById("loveWall"),
  loveWallTrack: document.getElementById("loveWallTrack"),
  loveWallSubtitle: document.getElementById("loveWallSubtitle"),
  confettiCanvas: document.getElementById("confettiCanvas"),
  songCopy: document.getElementById("songCopy"),
  spotifyOpenLink: document.getElementById("spotifyOpenLink"),
  vibeHint: document.getElementById("vibeHint"),
  vibeCards: Array.from(document.querySelectorAll(".vibe-card")),
  shareLinkInput: document.getElementById("shareLink"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  shareBtn: document.getElementById("shareBtn"),
  shortenBtn: document.getElementById("shortenBtn"),
  letterTrigger: document.getElementById("letterTrigger"),
  letterCardTitle: document.getElementById("letterCardTitle"),
  heroEyebrow: document.getElementById("heroEyebrow"),
  heroTargetName: document.getElementById("heroTargetName"),
  heroSubtext: document.getElementById("heroSubtext"),
  heroNote: document.getElementById("heroNote"),
  toNameInput: document.getElementById("toNameInput"),
  fromNameInput: document.getElementById("fromNameInput"),
  customMsgInput: document.getElementById("customMsgInput"),
  songLinkInput: document.getElementById("songLinkInput"),
  anonInput: document.getElementById("anonInput"),
  applySetupBtn: document.getElementById("applySetupBtn"),
  waSendBtn: document.getElementById("waSendBtn"),
  makerHint: document.getElementById("makerHint"),
};

const canInitialize =
  Boolean(els.questionCard) &&
  Boolean(els.promptLine) &&
  Boolean(els.reasonText) &&
  Boolean(els.yesBtn) &&
  Boolean(els.noBtn);

let activePrompts = [];
let activeReasons = [];
let currentTheme = DEFAULT_THEME;
let noCount = 0;
let maybeCount = 0;
let reasonIndex = 0;
let reasonTimer = 0;
let typewriterTimer = 0;
let typewriterState = { promptIndex: 0, charIndex: 0, isDeleting: false };
let noResetTimer = 0;
let afterPageTimer = 0;
let letterOpenTimer = 0;
let themeFromPayload = "";
let isShortening = false;
const shortLinkCache = new Map();

const confettiState = {
  ctx: els.confettiCanvas ? els.confettiCanvas.getContext("2d") : null,
  particles: [],
  activeUntil: 0,
  frame: 0,
};

if (canInitialize) {
  init();
}

function init() {
  loadStateFromUrl();
  currentTheme = getThemeFromUrl();
  hydrateFormFromState();
  applyPersonalization(false);
  createAmbientHearts(window.matchMedia("(max-width: 800px)").matches ? 16 : 26);
  setupVibeSwitcher();
  bindEvents();
  setTheme(currentTheme, false);
  updateShareLink();
  setupSectionReveal();
  resizeConfettiCanvas();
  window.addEventListener("resize", resizeConfettiCanvas);
}

function bindEvents() {
  const throttledNoAttempt = throttle(noAttempt, ACTION_THROTTLE_MS);
  const throttledMaybeAttempt = throttle(maybeAttempt, ACTION_THROTTLE_MS);
  const throttledAcceptInvite = throttle(acceptInvite, ACTION_THROTTLE_MS);

  els.noBtn.addEventListener(
    "touchstart",
    (event) => {
      event.preventDefault();
      throttledNoAttempt();
    },
    { passive: false }
  );

  els.noBtn.addEventListener("click", (event) => {
    event.preventDefault();
    throttledNoAttempt();
  });

  els.yesBtn.addEventListener("click", () => {
    throttledAcceptInvite();
  });

  if (els.maybeBtn) {
    els.maybeBtn.addEventListener("click", () => {
      throttledMaybeAttempt();
    });
  }

  if (els.replayBtn) {
    els.replayBtn.addEventListener("click", () => {
      goToAfterPage();
    });
  }

  if (els.copyLinkBtn) {
    els.copyLinkBtn.addEventListener("click", () => {
      copyShareLink();
    });
  }

  if (els.shareBtn) {
    els.shareBtn.addEventListener("click", () => {
      shareLink();
    });
  }

  if (els.shortenBtn) {
    els.shortenBtn.addEventListener("click", () => {
      generateShortLink();
    });
  }

  if (els.letterTrigger) {
    els.letterTrigger.addEventListener("click", () => {
      animateLetterOpen();
      scrollToQuestion();
    });
  }

  if (els.applySetupBtn) {
    els.applySetupBtn.addEventListener("click", () => {
      applySetupFromInputs(true);
    });
  }

  if (els.waSendBtn) {
    els.waSendBtn.addEventListener("click", () => {
      sendViaEmail();
    });
  }

  const updateOnEnter = [els.toNameInput, els.fromNameInput, els.customMsgInput, els.songLinkInput]
    .filter(Boolean);
  updateOnEnter.forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        applySetupFromInputs(true);
      }
    });
  });
}

function loadStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  themeFromPayload = "";
  const hasDirectParams =
    params.has(PARAM_TO) ||
    params.has(PARAM_FROM) ||
    params.has(PARAM_MESSAGE) ||
    params.has(PARAM_ANON) ||
    params.has(PARAM_SONG);

  const payload = decodePayload(params.get(PARAM_PAYLOAD));
  if (payload) {
    state.toName = sanitizeName(payload.t || payload.to, LIMITS.toName, "Yasha");
    state.fromName = sanitizeName(payload.f || payload.from, LIMITS.fromName, "");
    state.customMessage = sanitizeText(payload.m || payload.msg, LIMITS.message);
    state.songLink = sanitizeSongLink(payload.s || payload.song) || DEFAULT_SPOTIFY_TRACK_URL;
    state.anonymous = parseBoolean(payload.a || payload.anon);
    themeFromPayload = sanitizeTheme(payload.v || payload.vibe);
    persistMainState();
    return;
  }

  if (hasDirectParams) {
    state.toName = sanitizeName(params.get(PARAM_TO), LIMITS.toName, "Yasha");
    state.fromName = sanitizeName(params.get(PARAM_FROM), LIMITS.fromName, "");
    state.customMessage = sanitizeText(params.get(PARAM_MESSAGE), LIMITS.message);
    state.anonymous = parseBoolean(params.get(PARAM_ANON));
    state.songLink = sanitizeSongLink(params.get(PARAM_SONG)) || DEFAULT_SPOTIFY_TRACK_URL;
    persistMainState();
    return;
  }

  hydrateStateFromStorage();
}

function hydrateFormFromState() {
  if (els.toNameInput) {
    els.toNameInput.value = state.toName;
  }
  if (els.fromNameInput) {
    els.fromNameInput.value = state.fromName;
  }
  if (els.customMsgInput) {
    els.customMsgInput.value = state.customMessage;
  }
  if (els.songLinkInput) {
    els.songLinkInput.value = state.songLink;
  }
  if (els.anonInput) {
    els.anonInput.checked = state.anonymous;
  }
}

function applySetupFromInputs(announce) {
  state.toName = sanitizeName(els.toNameInput ? els.toNameInput.value : "", LIMITS.toName, "Yasha");
  state.fromName = sanitizeName(els.fromNameInput ? els.fromNameInput.value : "", LIMITS.fromName, "");
  state.customMessage = sanitizeText(els.customMsgInput ? els.customMsgInput.value : "", LIMITS.message);
  state.songLink = sanitizeSongLink(els.songLinkInput ? els.songLinkInput.value : "");
  state.anonymous = Boolean(els.anonInput && els.anonInput.checked);

  hydrateFormFromState();
  applyPersonalization(announce);
  updateShareLink();
  persistMainState();

  if (!announce || !els.statusLine) {
    return;
  }

  if (state.songLink) {
    els.statusLine.textContent = "Card updated. Song link is included in the share URL.";
    return;
  }

  els.statusLine.textContent = "Card and share link updated.";
}

function applyPersonalization(announce) {
  const target = state.toName || "Yasha";
  const sender = state.fromName || "someone";

  if (els.heroTargetName) {
    els.heroTargetName.textContent = target;
  }
  if (els.letterCardTitle) {
    els.letterCardTitle.textContent = `for ${target.toLowerCase()}`;
  }

  if (state.anonymous) {
    if (els.heroEyebrow) {
      els.heroEyebrow.textContent = "Anonymous Ask";
    }
    if (els.heroSubtext) {
      els.heroSubtext.textContent = state.customMessage || "Someone made this page because you are worth the effort.";
    }
    if (els.heroNote) {
      els.heroNote.textContent = state.songLink
        ? "anonymous mode on, plus a song link attached"
        : "name reveals only if you say yes";
    }
  } else {
    if (els.heroEyebrow) {
      els.heroEyebrow.textContent = state.fromName ? `From ${sender}` : "Special Ask";
    }
    if (els.heroSubtext) {
      els.heroSubtext.textContent =
        state.customMessage || "I could have sent a text. I made this page instead.";
    }
    if (els.heroNote) {
      els.heroNote.textContent = state.songLink
        ? `${sender} attached a song for this moment`
        : "made with effort on purpose";
    }
  }

  document.title = `${target}, Will You Go Out With Me?`;
  setMeta("meta[name='description']", `A special page with a special question for ${target}.`);
  setMeta("meta[property='og:title']", `${target}, Will You Go Out With Me?`);
  setMeta("meta[property='og:description']", `A special page with a special question for ${target}.`);
  updateSpotifyPlayer();
  renderLoveWall();

  activePrompts = buildPrompts();
  activeReasons = buildReasons();
  restartTypewriter();
  restartReasonRotation();

  if (els.makerHint) {
    els.makerHint.textContent = `Ready for ${target}. Pick a vibe and send the link.`;
  }

  if (announce && els.statusLine) {
    els.statusLine.textContent = `Personalized for ${target}.`;
  }

  persistMainState();
}

function buildPrompts() {
  const target = state.toName || "Yasha";
  const sender = state.fromName || "someone";
  const intro = `${target}, you make ordinary days feel special.`;
  const lineTwo = state.anonymous
    ? "Someone asked this with care and intention."
    : `${sender} wanted to ask you this properly.`;
  return [intro, lineTwo, "So here is the question: want to go out with me?"];
}

function buildReasons() {
  const sender = state.fromName || "this person";
  const list = [];

  if (state.customMessage) {
    list.push(state.customMessage);
  }
  if (state.songLink) {
    list.push("There is a song picked for this moment.");
  }

  list.push("You have the kind of energy that makes places better.");
  list.push("This page took effort. Imagine the effort on date night.");
  list.push("Good playlists, snacks, and conversation are guaranteed.");
  if (!state.anonymous && state.fromName) {
    list.push(`${sender} is serious about making this a great first date.`);
  }

  return list;
}

function setupVibeSwitcher() {
  setTheme(currentTheme, false);

  els.vibeCards.forEach((card) => {
    card.addEventListener("click", () => {
      setTheme(card.dataset.theme, true);
    });

    card.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }

      event.preventDefault();
      const selectedIndex = els.vibeCards.findIndex((item) => item.classList.contains("is-selected"));
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (selectedIndex + direction + els.vibeCards.length) % els.vibeCards.length;
      els.vibeCards[nextIndex].focus();
      setTheme(els.vibeCards[nextIndex].dataset.theme, true);
    });
  });
}

function setTheme(themeKey, announce) {
  currentTheme = themes[themeKey] ? themeKey : DEFAULT_THEME;
  document.body.dataset.theme = currentTheme;

  els.vibeCards.forEach((card) => {
    const selected = card.dataset.theme === currentTheme;
    card.classList.toggle("is-selected", selected);
    card.setAttribute("aria-checked", String(selected));
  });

  if (els.vibeHint) {
    els.vibeHint.textContent = `${themes[currentTheme].label} selected.`;
  }

  updateShareLink();
  renderLoveWall();

  if (announce && els.statusLine) {
    els.statusLine.textContent = `${themes[currentTheme].label} vibe locked in.`;
  }

  writeStorage(STORAGE_THEME_KEY, currentTheme);
}

function getThemeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const explicitTheme = params.get(PARAM_THEME);
  if (themes[explicitTheme]) {
    return explicitTheme;
  }

  if (themes[themeFromPayload]) {
    return themeFromPayload;
  }

  const savedTheme = readStorage(STORAGE_THEME_KEY);
  if (themes[savedTheme]) {
    return savedTheme;
  }

  return DEFAULT_THEME;
}

function updateShareLink() {
  if (!els.shareLinkInput) {
    return;
  }
  els.shareLinkInput.value = buildShareLink();
  if (els.shortenBtn) {
    els.shortenBtn.textContent = "Shorten";
    els.shortenBtn.disabled = false;
  }
  isShortening = false;
  syncBrowserUrl();
}

function buildShareLink() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";

  const payload = {
    v: currentTheme,
    t: state.toName || "Yasha",
    f: state.fromName || "",
    m: state.customMessage || "",
    a: state.anonymous ? 1 : 0,
    s: state.songLink || "",
  };

  const encoded = encodePayload(payload);
  if (encoded) {
    url.searchParams.set(PARAM_PAYLOAD, encoded);
  }

  return url.toString();
}

async function copyShareLink() {
  if (!els.shareLinkInput) {
    return;
  }

  const link = getCurrentShareLink();
  if (!link) {
    return;
  }

  els.shareLinkInput.value = link;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(link);
    } else {
      els.shareLinkInput.removeAttribute("readonly");
      els.shareLinkInput.select();
      document.execCommand("copy");
      els.shareLinkInput.setAttribute("readonly", "readonly");
    }

    setMainStatus("Link copied. Send it.");
    if (els.copyLinkBtn) {
      els.copyLinkBtn.textContent = "Copied";
      window.setTimeout(() => {
        els.copyLinkBtn.textContent = "Copy";
      }, 1200);
    }
  } catch {
    setMainStatus("Copy failed. Hold-press and copy manually.");
  }
}

async function shareLink() {
  const link = getCurrentShareLink();
  const target = state.toName || "your crush";
  const sender = state.fromName || "someone";
  const text = state.anonymous
    ? `I made something for you. Open this.`
    : `${sender} made this for ${target}.`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${target}, will you go out with me?`,
        text,
        url: link,
      });
      setMainStatus("Share sheet opened.");
      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
    }
  }

  await copyShareLink();
}

async function generateShortLink() {
  if (!els.shortenBtn || isShortening) {
    return;
  }

  const longLink = buildShareLink();
  const cached = shortLinkCache.get(longLink);
  if (cached) {
    els.shareLinkInput.value = cached;
    els.shortenBtn.textContent = "Shortened";
    setMainStatus("Short link ready.");
    return;
  }

  setShortenBusy(true);
  try {
    const response = await fetch("/api/shorten", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: longLink }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(getShortenerErrorMessage(payload.error));
    }

    const shortUrl = sanitizeHttpUrl(payload.shortUrl);
    if (!shortUrl) {
      throw new Error("Shortener returned an invalid URL.");
    }

    shortLinkCache.set(longLink, shortUrl);
    els.shareLinkInput.value = shortUrl;
    els.shortenBtn.textContent = "Shortened";
    setMainStatus("Short link generated.");
  } catch (error) {
    els.shareLinkInput.value = longLink;
    els.shortenBtn.textContent = "Shorten";
    setMainStatus(error && error.message ? error.message : "Shortener failed. Using full link.");
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

function getCurrentShareLink() {
  const displayed = sanitizeHttpUrl(els.shareLinkInput ? els.shareLinkInput.value : "");
  if (displayed) {
    return displayed;
  }

  return buildShareLink();
}

function sendViaEmail() {
  const link = getCurrentShareLink();
  const target = state.toName || "you";
  const sender = state.fromName || "Someone";
  const intro = state.anonymous
    ? `I made this page for you.`
    : `${sender} made this page for ${target}.`;
  const subject = `${target}, open this link`;
  const body = `${intro}\n\n${link}`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  setMainStatus("Opening email app.");
}

function scrollToQuestion() {
  els.questionCard.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });

  els.questionCard.animate(
    [
      { transform: "scale(1)", boxShadow: "var(--shadow)" },
      { transform: "scale(1.008)", boxShadow: "0 28px 70px rgba(79, 39, 43, 0.24)" },
      { transform: "scale(1)", boxShadow: "var(--shadow)" },
    ],
    { duration: 640, easing: "ease-out" }
  );
}

function animateLetterOpen() {
  if (!els.letterTrigger) {
    return;
  }

  els.letterTrigger.classList.add("is-opening");
  if (letterOpenTimer) {
    window.clearTimeout(letterOpenTimer);
  }

  letterOpenTimer = window.setTimeout(() => {
    if (els.letterTrigger) {
      els.letterTrigger.classList.remove("is-opening");
    }
    letterOpenTimer = 0;
  }, 540);
}

function setupSectionReveal() {
  const sections = [
    els.loveWall,
    document.querySelector(".music-card"),
    document.querySelector(".how-section"),
    document.querySelector(".faq-section"),
  ].filter(Boolean);

  if (!sections.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    sections.forEach((section) => {
      section.classList.add("reveal-section", "is-visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.18 }
  );

  sections.forEach((section) => {
    section.classList.add("reveal-section");
    observer.observe(section);
  });
}

function renderLoveWall() {
  if (!els.loveWallTrack) {
    return;
  }

  const target = state.toName || "Yasha";

  const notes = [
    { title: "Mia", text: `${target} is 100% gonna smile at this.` },
    { title: "Ava", text: "He really built a whole page instead of sending 'hey'… that’s kinda crazy (in a good way)." },
    { title: "Nora", text: `If I was ${target}, I’d at least press maybe.` },
    { title: "Lena", text: `Nah because if someone did all this just to ask me out, I’d hear them out. ${target} should too.` },
    { title: "Sofia", text: "The music + vibe cards combo is lowkey nice." },
    { title: "Isla", text: "This feels way better than a random DM at 1:37am." },
    { title: "Maya", text: "I like when effort is obvious. This is obvious effort." },
    { title: "Chloe", text: `Not gonna lie, the yes path is clearly the fun route for ${target}.` },
    { title: "Zoe", text: "Good energy, clean design, solid ask. No red flags." },
    { title: "Aria", text: "This is giving first date confidence fr." },
    { title: "Layla", text: "Okay but this is actually sweet, not cringe." },
    { title: "Hannah", text: "Direct AND creative is a dangerous combo." },
    { title: "Bella", text: "The moving wall makes it feel alive, like this wasn’t rushed." },
    { title: "Riya", text: "A little dramatic but like… in a rom-com way." },
    { title: "Ella", text: `If the vibes are this good online, ${target}, the date might go crazy.` },
    { title: "Nina", text: "This is the type of thing people screenshot and send to friends." },
    { title: "Sara", text: "Could lowkey be the start of a cute story." },
    { title: "Amara", text: "Simple ask, strong intention. Respect." },
    { title: "Jade", text: "It doesn’t feel copy-paste. It feels aimed." },
    { title: "Ivy", text: `This makes saying yes easier for ${target}, ngl.` },
    { title: "Keira", text: "This page has main-character energy." },
    { title: "Leah", text: "Even the maybe button being funny is smart." },
    { title: "Naomi", text: "I’d literally send this to my group chat and be like ‘what do we think’." },
    { title: "Tara", text: "Final answer: this is cute, do it." },
    { title: "Eli", text: "this is so romantic omg 😭" },

    { title: "Ruby", text: "It’s giving ‘I actually care’ and that’s rare now." },
    { title: "Clara", text: "Way better than ‘wyd’ as an opener." },
    { title: "Noah", text: "Bro put more effort into this than most people put into relationships." },
    { title: "Theo", text: `If ${target} fumbles this, that’s wild.` },
    { title: "Luna", text: "It feels playful but still serious somehow." },
    { title: "Skye", text: "This would make me nervous in a good way." },
    { title: "Freya", text: "Confident but not pushy. That’s hard to do." },
    { title: "Piper", text: "It feels like an invite, not pressure." },
    { title: "Jules", text: "This is the kind of thing people save." },
    { title: "Cam", text: `Honestly? I’d be flattered if I was ${target}.` },
    { title: "Wren", text: "This has rom-com intro vibes." },
    { title: "Blair", text: "Bold but not weird. That balance is rare." },
    { title: "June", text: "I’d smile first, overthink, then probably say yes." },
    { title: "Alex", text: "Way better than asking in a hallway." },
    { title: "Quinn", text: "The creativity alone deserves a reply." },
    { title: "Sam", text: "You can tell this wasn’t last-minute." },
    { title: "Hazel", text: "It feels like effort without doing too much." },
    { title: "Rose", text: "Lowkey romantic without trying too hard." },
    { title: "Kai", text: "This is giving confidence, not desperation." },
    { title: "Tess", text: `If someone did this for me, I’d feel chosen. ${target} probably will too.` }
  ];
  const oneCycle = [];
  notes.forEach((note) => {
    const card = document.createElement("article");
    card.className = "love-note";

    const title = document.createElement("h3");
    title.textContent = note.title;

    const text = document.createElement("p");
    text.textContent = note.text;

    card.appendChild(title);
    card.appendChild(text);
    oneCycle.push(card);
  });

  els.loveWallTrack.innerHTML = "";
  oneCycle.forEach((card) => {
    els.loveWallTrack.appendChild(card);
  });
  oneCycle.forEach((card) => {
    els.loveWallTrack.appendChild(card.cloneNode(true));
  });
  const durationSeconds = Math.max(44, Math.round(notes.length * 2.5));
  els.loveWallTrack.style.setProperty("--love-duration", `${durationSeconds}s`);

  if (els.loveWallSubtitle) {
    els.loveWallSubtitle.textContent = `Love notes for ${target}. Sliding forever to the left.`;
  }
}

function createAmbientHearts(count) {
  if (!els.ambient) {
    return;
  }

  for (let i = 0; i < count; i += 1) {
    const heart = document.createElement("span");
    heart.className = "float-heart";
    heart.style.left = `${Math.random() * 100}%`;
    heart.style.bottom = `${-15 - Math.random() * 100}px`;
    heart.style.animationDuration = `${8 + Math.random() * 12}s`;
    heart.style.animationDelay = `${Math.random() * -18}s`;
    heart.style.opacity = `${0.25 + Math.random() * 0.45}`;
    heart.style.fontSize = `${0.75 + Math.random() * 1.2}rem`;
    els.ambient.appendChild(heart);
  }
}

function restartTypewriter() {
  if (typewriterTimer) {
    window.clearTimeout(typewriterTimer);
    typewriterTimer = 0;
  }

  typewriterState = {
    promptIndex: 0,
    charIndex: 0,
    isDeleting: false,
  };

  runTypewriter();
}

function runTypewriter() {
  if (!activePrompts.length || !els.promptLine) {
    return;
  }

  const currentPrompt = activePrompts[typewriterState.promptIndex];
  const speed = typewriterState.isDeleting ? 26 : 48;

  if (!typewriterState.isDeleting) {
    typewriterState.charIndex += 1;
  } else {
    typewriterState.charIndex -= 1;
  }

  els.promptLine.innerHTML = `${currentPrompt.slice(0, typewriterState.charIndex)}<span class="cursor">|</span>`;

  if (!typewriterState.isDeleting && typewriterState.charIndex >= currentPrompt.length) {
    typewriterState.isDeleting = true;
    typewriterTimer = window.setTimeout(runTypewriter, 1600);
    return;
  }

  if (typewriterState.isDeleting && typewriterState.charIndex <= 0) {
    typewriterState.isDeleting = false;
    typewriterState.promptIndex = (typewriterState.promptIndex + 1) % activePrompts.length;
    typewriterTimer = window.setTimeout(runTypewriter, 260);
    return;
  }

  typewriterTimer = window.setTimeout(runTypewriter, speed);
}

function restartReasonRotation() {
  if (!els.reasonText) {
    return;
  }

  if (reasonTimer) {
    window.clearInterval(reasonTimer);
    reasonTimer = 0;
  }

  reasonIndex = 0;
  els.reasonText.textContent = activeReasons[0] || "";

  if (activeReasons.length <= 1) {
    return;
  }

  reasonTimer = window.setInterval(() => {
    reasonIndex = (reasonIndex + 1) % activeReasons.length;
    els.reasonText.animate(
      [
        { opacity: 0, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 300, fill: "both", easing: "ease-out" }
    );
    els.reasonText.textContent = activeReasons[reasonIndex];
  }, 2400);
}

function maybeAttempt() {
  if (document.body.classList.contains("accepted")) {
    return;
  }

  maybeCount += 1;
  const idx = Math.min(maybeCount - 1, maybeMessages.length - 1);
  if (els.statusLine) {
    els.statusLine.textContent = maybeMessages[idx];
  }

  if (els.maybeBtn) {
    els.maybeBtn.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(4px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 240, easing: "ease-out" }
    );
  }

  writeStorage(STORAGE_RESPONSE_KEY, "maybe");
}

function noAttempt() {
  if (document.body.classList.contains("accepted")) {
    return;
  }

  noCount += 1;
  const messageIndex = Math.min(noCount - 1, noMessages.length - 1);
  if (els.statusLine) {
    els.statusLine.textContent = noMessages[messageIndex];
  }

  moveNoButton();
  const growth = Math.min(1 + noCount * 0.09, 1.35);
  els.yesBtn.style.transform = `scale(${growth})`;

  if (noCount >= 3) {
    els.noBtn.textContent = "Still no?";
  }
  if (noCount >= 6) {
    els.noBtn.textContent = "Last chance to switch";
  }

  writeStorage(STORAGE_RESPONSE_KEY, "no");
}

function moveNoButton() {
  els.noBtn.classList.add("is-floating");

  const zoneRect = els.buttonZone.getBoundingClientRect();
  const btnRect = els.noBtn.getBoundingClientRect();
  const obstacleRects = getObstacleRects(zoneRect);

  const maxLeft = Math.max(NO_EDGE_PADDING_PX, zoneRect.width - btnRect.width - NO_EDGE_PADDING_PX);
  const maxTop = Math.max(NO_EDGE_PADDING_PX, zoneRect.height - btnRect.height - NO_EDGE_PADDING_PX);

  const next = findSafeNoPosition({
    maxLeft,
    maxTop,
    width: btnRect.width,
    height: btnRect.height,
    obstacleRects,
  });

  els.noBtn.style.left = `${next.left}px`;
  els.noBtn.style.top = `${next.top}px`;

  if (noResetTimer) {
    window.clearTimeout(noResetTimer);
  }
  noResetTimer = window.setTimeout(() => {
    resetNoButtonPosition();
  }, NO_RESET_DELAY_MS);
}

function getObstacleRects(zoneRect) {
  const candidates = Array.from(els.buttonZone.querySelectorAll(".btn"))
    .filter((button) => button !== els.noBtn && !button.classList.contains("hidden"));

  return candidates.map((button) => toZoneRect(button.getBoundingClientRect(), zoneRect));
}

function findSafeNoPosition(config) {
  const { maxLeft, maxTop, width, height, obstacleRects } = config;

  for (let tries = 0; tries < NO_MAX_PLACEMENT_TRIES; tries += 1) {
    const left = randomBetween(NO_EDGE_PADDING_PX, maxLeft);
    const top = randomBetween(NO_EDGE_PADDING_PX, maxTop);
    if (isNoPositionClear(left, top, width, height, obstacleRects)) {
      return { left, top };
    }
  }

  const fallbackPoints = [
    { left: NO_EDGE_PADDING_PX, top: NO_EDGE_PADDING_PX },
    { left: maxLeft, top: NO_EDGE_PADDING_PX },
    { left: NO_EDGE_PADDING_PX, top: maxTop },
    { left: maxLeft, top: maxTop },
    { left: (NO_EDGE_PADDING_PX + maxLeft) / 2, top: maxTop },
  ];

  for (const point of fallbackPoints) {
    if (isNoPositionClear(point.left, point.top, width, height, obstacleRects)) {
      return point;
    }
  }

  return { left: NO_EDGE_PADDING_PX, top: maxTop };
}

function isNoPositionClear(left, top, width, height, obstacleRects) {
  const candidate = {
    left,
    right: left + width,
    top,
    bottom: top + height,
  };

  return obstacleRects.every((obstacleRect) => {
    const expandedObstacle = {
      left: obstacleRect.left - NO_CLEARANCE_PX,
      right: obstacleRect.right + NO_CLEARANCE_PX,
      top: obstacleRect.top - NO_CLEARANCE_PX,
      bottom: obstacleRect.bottom + NO_CLEARANCE_PX,
    };

    return !rectsOverlap(candidate, expandedObstacle);
  });
}

function rectsOverlap(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function toZoneRect(rect, zoneRect) {
  return {
    left: rect.left - zoneRect.left,
    right: rect.right - zoneRect.left,
    top: rect.top - zoneRect.top,
    bottom: rect.bottom - zoneRect.top,
  };
}

function resetNoButtonPosition() {
  els.noBtn.classList.remove("is-floating");
  els.noBtn.style.left = "";
  els.noBtn.style.top = "";
}

function acceptInvite() {
  document.body.classList.add("accepted");
  if (els.statusLine) {
    els.statusLine.textContent = "Perfect answer.";
  }

  if (els.overlayText) {
    const reveal = state.anonymous && state.fromName ? `Identity reveal: ${state.fromName}. ` : "";
    els.overlayText.textContent = `${reveal}Taking you to the ${themes[currentTheme].label} afterpage...`;
  }

  resetNoButtonPosition();
  if (noResetTimer) {
    window.clearTimeout(noResetTimer);
    noResetTimer = 0;
  }

  els.noBtn.disabled = true;
  els.noBtn.style.opacity = "0.45";
  els.noBtn.style.pointerEvents = "none";
  if (els.maybeBtn) {
    els.maybeBtn.disabled = true;
    els.maybeBtn.style.opacity = "0.7";
  }
  els.yesBtn.style.transform = "scale(1)";

  if (els.planSection) {
    els.planSection.classList.remove("hidden");
  }
  if (els.yesOverlay) {
    els.yesOverlay.classList.remove("hidden");
  }

  triggerBurstConfetti();
  startConfetti(4200);
  writeStorage(STORAGE_RESPONSE_KEY, "yes");
  persistMainState();

  if (afterPageTimer) {
    window.clearTimeout(afterPageTimer);
  }
  afterPageTimer = window.setTimeout(() => {
    goToAfterPage();
  }, 1800);
}

function goToAfterPage() {
  if (afterPageTimer) {
    window.clearTimeout(afterPageTimer);
    afterPageTimer = 0;
  }

  const afterPage = themes[currentTheme] ? themes[currentTheme].afterPage : DEFAULT_AFTER_PAGE;
  const target = new URL(afterPage, window.location.href);
  target.search = "";
  target.searchParams.set(PARAM_THEME, currentTheme);
  target.searchParams.set(PARAM_TO, state.toName || "Yasha");
  if (state.fromName) {
    target.searchParams.set(PARAM_FROM, state.fromName);
  }
  if (state.anonymous) {
    target.searchParams.set(PARAM_ANON, "1");
  }
  if (state.songLink) {
    target.searchParams.set(PARAM_SONG, state.songLink);
  }

  window.history.pushState({ route: "afterpage" }, "", target.toString());
  window.location.href = target.toString();
}

function resizeConfettiCanvas() {
  if (!els.confettiCanvas || !confettiState.ctx) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  els.confettiCanvas.width = Math.floor(window.innerWidth * ratio);
  els.confettiCanvas.height = Math.floor(window.innerHeight * ratio);
  confettiState.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function triggerBurstConfetti() {
  if (typeof window.confetti !== "function") {
    return;
  }

  const colors = themes[currentTheme]?.palette || themes.classic.palette;
  window.confetti({
    particleCount: 110,
    spread: 88,
    origin: { y: 0.62 },
    colors,
  });
}

function startConfetti(durationMs) {
  if (!els.confettiCanvas || !confettiState.ctx) {
    return;
  }

  confettiState.activeUntil = performance.now() + durationMs;
  if (confettiState.frame) {
    return;
  }

  const loop = (now) => {
    const ctx = confettiState.ctx;
    ctx.clearRect(0, 0, els.confettiCanvas.width, els.confettiCanvas.height);

    if (now < confettiState.activeUntil) {
      for (let i = 0; i < 7; i += 1) {
        confettiState.particles.push(makeParticle());
      }
    }

    for (let i = confettiState.particles.length - 1; i >= 0; i -= 1) {
      const particle = confettiState.particles[i];
      particle.vy += 0.03;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.rotation += particle.spin;
      particle.life += 1;

      if (particle.y > window.innerHeight + 24 || particle.life > particle.maxLife) {
        confettiState.particles.splice(i, 1);
        continue;
      }

      drawHeart(confettiState.ctx, particle);
    }

    if (now < confettiState.activeUntil || confettiState.particles.length > 0) {
      confettiState.frame = window.requestAnimationFrame(loop);
    } else {
      window.cancelAnimationFrame(confettiState.frame);
      confettiState.frame = 0;
    }
  };

  confettiState.frame = window.requestAnimationFrame(loop);
}

function makeParticle() {
  const palette = themes[currentTheme]?.palette || themes.classic.palette;
  return {
    x: Math.random() * window.innerWidth,
    y: -20 - Math.random() * 120,
    vx: randomBetween(-1.8, 1.8),
    vy: randomBetween(1, 2.3),
    size: randomBetween(6, 12),
    color: palette[Math.floor(Math.random() * palette.length)],
    rotation: Math.random() * Math.PI * 2,
    spin: randomBetween(-0.06, 0.06),
    life: 0,
    maxLife: randomBetween(110, 180),
  };
}

function drawHeart(ctx, particle) {
  ctx.save();
  ctx.translate(particle.x, particle.y);
  ctx.rotate(particle.rotation);
  ctx.scale(particle.size / 12, particle.size / 12);
  ctx.fillStyle = particle.color;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.bezierCurveTo(0, 0, -6, 0, -6, 4);
  ctx.bezierCurveTo(-6, 8, 0, 11, 0, 14);
  ctx.bezierCurveTo(0, 11, 6, 8, 6, 4);
  ctx.bezierCurveTo(6, 0, 0, 0, 0, 4);
  ctx.fill();
  ctx.restore();
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
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
    const url = new URL(clean);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    try {
      const fallback = new URL(`https://${clean}`);
      return fallback.toString();
    } catch {
      return "";
    }
  }

  return "";
}

function updateSpotifyPlayer() {
  if (!els.spotifyOpenLink) {
    return;
  }

  const sourceSong = sanitizeSongLink(state.songLink) || "";
  if (!sourceSong) {
    els.spotifyOpenLink.href = "#";
    els.spotifyOpenLink.setAttribute("aria-disabled", "true");
    els.spotifyOpenLink.textContent = "No song link added.";
    if (els.songCopy) {
      els.songCopy.textContent = "No song link attached yet.";
    }
    return;
  }

  els.spotifyOpenLink.href = sourceSong;
  els.spotifyOpenLink.removeAttribute("aria-disabled");
  els.spotifyOpenLink.textContent = "Open the shared song link";
  if (els.songCopy) {
    els.songCopy.textContent = "A custom song link is attached to this ask.";
  }
}

function persistMainState() {
  writeStorage(STORAGE_STATE_KEY, JSON.stringify({
    toName: state.toName,
    fromName: state.fromName,
    customMessage: state.customMessage,
    anonymous: state.anonymous,
    songLink: state.songLink,
  }));
}

function hydrateStateFromStorage() {
  const raw = readStorage(STORAGE_STATE_KEY);
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
  } catch {
    // Ignore invalid local state.
  }
}

function syncBrowserUrl() {
  try {
    const next = new URL(window.location.href);
    next.search = "";
    const payload = encodePayload({
      v: currentTheme,
      t: state.toName || "Yasha",
      f: state.fromName || "",
      m: state.customMessage || "",
      a: state.anonymous ? 1 : 0,
      s: state.songLink || "",
    });
    if (payload) {
      next.searchParams.set(PARAM_PAYLOAD, payload);
      window.history.replaceState({ route: "main" }, "", next.toString());
    }
  } catch {
    // Ignore URL sync failures.
  }
}

function getShortenerErrorMessage(code) {
  if (typeof code === "string" && code.trim()) {
    return code;
  }
  return "Shortener failed. Using full link.";
}

function setMainStatus(message) {
  if (els.statusLine) {
    els.statusLine.textContent = message;
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
    if (typeof value !== "string") {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures.
  }
}

function throttle(callback, waitMs) {
  let locked = false;
  return () => {
    if (locked) {
      return;
    }
    locked = true;
    callback();
    window.setTimeout(() => {
      locked = false;
    }, waitMs);
  };
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

function sanitizeTheme(value) {
  return themes[value] ? value : "";
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

function parseBoolean(value) {
  if (!value) {
    return false;
  }
  const normalized = String(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function setMeta(selector, content) {
  const tag = document.querySelector(selector);
  if (tag) {
    tag.setAttribute("content", content);
  }
}
