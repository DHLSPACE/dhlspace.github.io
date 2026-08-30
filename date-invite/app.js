const emptyState = {
  dateMode: "",
  date: "",
  timeMode: "",
  time: "",
  activity: "",
  dodgeCount: 0,
  touchNoCount: 0,
  playfulStep: 0,
};

const state = { ...emptyState };
const screens = [...document.querySelectorAll(".screen")];
const progressDots = [...document.querySelectorAll(".progress-dot")];
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const desktopPointerQuery = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");

const params = new URLSearchParams(window.location.search);
const supportedThemes = new Set(["rose", "lavender", "sage"]);
const requestedTheme = params.get("theme")?.trim().toLowerCase();
const config = {
  to: params.get("to")?.trim().slice(0, 16) || "你",
  from: params.get("from")?.trim().slice(0, 20) || "一个想见你的人",
  intro: params.get("intro")?.trim().slice(0, 80) || "天气、路线和小惊喜我来准备，你只需要负责出现。",
  theme: supportedThemes.has(requestedTheme) ? requestedTheme : "rose",
};

document.documentElement.dataset.theme = config.theme;
document.querySelector('meta[name="theme-color"]')?.setAttribute("content", {
  rose: "#fff7f2",
  lavender: "#f8f4ff",
  sage: "#f4f8f3",
}[config.theme]);
document.getElementById("inviteeName").textContent = config.to;
document.getElementById("senderName")?.replaceChildren(config.from);
document.getElementById("introCopy").textContent = config.intro;
document.title = `${config.to}，一起出去玩吧`;

function motionIsReduced() {
  return reducedMotionQuery.matches;
}

function replayMotionClass(element, className) {
  if (!element || motionIsReduced()) return;
  element.classList.remove(className);
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      element.classList.add(className);
      element.addEventListener("animationend", () => element.classList.remove(className), { once: true });
    });
  });
}

function blossomMarkup() {
  return '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="#sakuraBlossom" xlink:href="#sakuraBlossom"></use></svg>';
}

let screenTransitionToken = 0;

function showScreen(name) {
  const nextScreen = screens.find((screen) => screen.dataset.screen === name);
  if (!nextScreen) return;
  const currentScreen = screens.find((screen) => screen.classList.contains("is-active"));
  const transitionToken = ++screenTransitionToken;

  const activateNextScreen = () => {
    if (transitionToken !== screenTransitionToken) return;
    screens.forEach((screen) => {
      screen.classList.remove("is-exiting");
      screen.classList.toggle("is-active", screen === nextScreen);
    });
    updateScreenChrome(name);
    if (name === "final") enterFinalScreen();
    window.scrollTo({ top: 0, behavior: motionIsReduced() ? "auto" : "smooth" });
    window.setTimeout(() => {
      nextScreen.querySelector("h1, h2")?.focus({ preventScroll: true });
    }, motionIsReduced() ? 0 : 80);
  };

  if (currentScreen && currentScreen !== nextScreen && !motionIsReduced()) {
    currentScreen.classList.add("is-exiting");
    window.setTimeout(activateNextScreen, 170);
    return;
  }

  activateNextScreen();
}

function updateScreenChrome(name) {
  const progressIndex = { invite: 0, reaction: 0, schedule: 1, activity: 2, final: 3, decline: 0 }[name] ?? 0;
  progressDots.forEach((dot, index) => {
    dot.classList.toggle("is-active", index === progressIndex);
    dot.classList.toggle("is-complete", index < progressIndex);
  });
  document.getElementById("progress").hidden = name === "decline";
}

let backgroundPetalsStarted = false;

function makePetals() {
  if (motionIsReduced() || backgroundPetalsStarted) return;
  backgroundPetalsStarted = true;
  const container = document.getElementById("petals");
  const petalCount = window.matchMedia("(max-width: 620px)").matches ? 9 : 16;
  for (let i = 0; i < petalCount; i += 1) {
    const petal = document.createElement("span");
    petal.className = "petal";
    petal.innerHTML = blossomMarkup();
    petal.style.left = `${Math.random() * 100}%`;
    petal.style.setProperty("--petal-size", `${14 + Math.random() * 13}px`);
    petal.style.setProperty("--petal-opacity", `${0.22 + Math.random() * 0.38}`);
    petal.style.animationDuration = `${10 + Math.random() * 12}s`;
    petal.style.animationDelay = `${-Math.random() * 18}s`;
    petal.style.setProperty("--drift", `${-10 + Math.random() * 20}vw`);
    const startRotation = -120 + Math.random() * 240;
    petal.style.setProperty("--start-rotation", `${startRotation}deg`);
    petal.style.setProperty("--end-rotation", `${startRotation + 360 + Math.random() * 360}deg`);
    container.appendChild(petal);
  }
}

function makeIntroPetals() {
  if (motionIsReduced()) return;
  const container = document.getElementById("introPetals");
  const petalCount = window.matchMedia("(max-width: 620px)").matches ? 9 : 16;
  for (let index = 0; index < petalCount; index += 1) {
    const angle = (360 / petalCount) * index + (-8 + Math.random() * 16);
    const petal = document.createElement("span");
    petal.className = "intro-petal";
    petal.innerHTML = blossomMarkup();
    petal.style.setProperty("--intro-angle", `${angle}deg`);
    petal.style.setProperty("--intro-angle-inverse", `${-angle}deg`);
    petal.style.setProperty("--intro-size", `clamp(${22 + Math.random() * 4}px, ${3.8 + Math.random() * 0.8}vw, ${46 + Math.random() * 8}px)`);
    petal.style.setProperty("--start-radius", `calc(clamp(62vw, 78vmax, 112vmax) + ${Math.random() * 26}px)`);
    petal.style.setProperty("--gather-radius", `clamp(${42 + Math.random() * 12}px, ${6.2 + Math.random() * 1.6}vw, ${94 + Math.random() * 18}px)`);
    petal.style.setProperty("--exit-radius", `calc(clamp(68vw, 84vmax, 120vmax) + ${Math.random() * 34}px)`);
    petal.style.setProperty("--intro-delay", `${Math.random() * 70}ms`);
    petal.style.setProperty("--start-rotation", `${-160 + Math.random() * 320}deg`);
    petal.style.setProperty("--gather-rotation", `${-25 + Math.random() * 50}deg`);
    petal.style.setProperty("--exit-rotation", `${180 + Math.random() * 360}deg`);
    petal.addEventListener("animationend", (event) => {
      if (event.animationName === "introScatter") petal.classList.add("is-settled");
    });
    container.appendChild(petal);
  }
}

function startIntro() {
  const overlay = document.getElementById("introOverlay");
  if (!overlay) {
    makePetals();
    return;
  }

  let introFinished = false;
  const timers = [];
  const finishIntro = (skipped = false) => {
    if (introFinished) return;
    introFinished = true;
    timers.forEach((timer) => window.clearTimeout(timer));
    makePetals();
    overlay.querySelectorAll(".intro-petal").forEach((petal) => {
      petal.style.willChange = "auto";
    });
    document.documentElement.classList.add("intro-complete");
    if (skipped) overlay.classList.add("is-skipped");
    window.setTimeout(() => overlay.remove(), skipped ? 420 : 40);
  };

  const skipIntro = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    finishIntro(true);
  };

  overlay.addEventListener("pointerdown", skipIntro, true);
  overlay.addEventListener("touchstart", skipIntro, { capture: true, passive: false });
  overlay.addEventListener("click", skipIntro, true);

  if (motionIsReduced()) {
    overlay.classList.add("is-reduced");
    timers.push(window.setTimeout(() => finishIntro(false), 380));
    return;
  }

  makeIntroPetals();
  // The ambient fall starts 150ms before the intro scatter finishes.
  timers.push(window.setTimeout(makePetals, 1750));
  timers.push(window.setTimeout(() => finishIntro(false), 2020));
}

function heartBurst(origin) {
  if (motionIsReduced() || !origin) return;
  const rect = origin.getBoundingClientRect();
  for (let i = 0; i < 18; i += 1) {
    const heart = document.createElement("span");
    heart.className = "burst-heart";
    heart.textContent = i % 3 === 0 ? "✦" : "♥";
    heart.style.left = `${rect.left + rect.width / 2}px`;
    heart.style.top = `${rect.top + rect.height / 2}px`;
    heart.style.color = i % 2 ? "#e9788f" : "#d29ac9";
    heart.style.setProperty("--x", `${-150 + Math.random() * 300}px`);
    heart.style.setProperty("--y", `${-120 + Math.random() * 210}px`);
    heart.style.setProperty("--r", `${-120 + Math.random() * 240}deg`);
    document.body.appendChild(heart);
    window.setTimeout(() => heart.remove(), 950);
  }
}

let celebrationPlayed = false;

function celebrationBurst() {
  if (celebrationPlayed) return;
  celebrationPlayed = true;
  if (motionIsReduced()) return;

  const ticket = document.querySelector(".ticket");
  const rect = ticket?.getBoundingClientRect();
  if (!rect) return;
  const isCompact = window.matchMedia("(max-width: 620px)").matches;
  const pieceCount = isCompact ? 28 : 38;
  const palette = ["var(--accent)", "var(--accent-dark)", "var(--lavender)", "var(--peach)", "var(--sage)"];

  for (let index = 0; index < pieceCount; index += 1) {
    const angle = (Math.PI * 2 * index) / pieceCount + (-0.12 + Math.random() * 0.24);
    const distance = (isCompact ? 105 : 155) + Math.random() * (isCompact ? 105 : 175);
    const piece = document.createElement("span");
    const shape = index % 5;
    piece.className = `celebration-piece shape-${shape}`;
    piece.style.left = `${rect.left + rect.width / 2}px`;
    piece.style.top = `${rect.top + rect.height / 2}px`;
    piece.style.setProperty("--burst-x", `${Math.cos(angle) * distance}px`);
    piece.style.setProperty("--burst-y", `${Math.sin(angle) * distance - Math.random() * 78}px`);
    piece.style.setProperty("--burst-rotation", `${-240 + Math.random() * 720}deg`);
    piece.style.setProperty("--piece-color", palette[index % palette.length]);
    piece.style.animationDelay = `${Math.random() * 90}ms`;
    if (shape >= 3) piece.textContent = shape === 3 ? "✦" : "♥";
    document.body.appendChild(piece);
    window.setTimeout(() => piece.remove(), 1350);
  }
}

function enterFinalScreen() {
  const ticket = document.querySelector(".ticket");
  if (!ticket || celebrationPlayed) return;
  ticket.classList.add("is-shining");
  celebrationBurst();
}

const yesButton = document.getElementById("yesButton");
const yesIcon = document.getElementById("yesIcon");
const noButton = document.getElementById("noButton");
const playground = document.getElementById("buttonPlayground");
const teaseMessage = document.getElementById("teaseMessage");
const dodgeReplies = [
  "已读：收到！所以我们几点见？",
  "网络不太好，只看到“愿意”两个字。",
  "这个按钮有自己的周末安排。",
  "它刚才说：再给旁边一次机会吧。",
  "拒绝键正在和鼠标玩捉迷藏。",
  "放心，认真拒绝的入口一直都在。",
];
const yesIcons = ["→", "♡", "✦", "🚀", "💗", "🌷"];

let lastDodgeAt = 0;
let lastPlayfulRoundAt = Number.NEGATIVE_INFINITY;
let lastPointerType = "";
let suppressClickUntil = 0;
let previousNoPosition = null;

function applyPlayfulScale(step) {
  const cappedStep = Math.max(0, Math.min(6, step));
  state.playfulStep = cappedStep;
  const noScale = Math.max(0.8, 1 - cappedStep * 0.04);
  const yesScale = Math.min(1.3, 1 + cappedStep * 0.055);
  noButton.style.setProperty("--no-scale", noScale.toFixed(3));
  yesButton.style.setProperty("--yes-scale", yesScale.toFixed(3));
  yesIcon.textContent = yesIcons[Math.min(cappedStep, yesIcons.length - 1)];
  yesButton.classList.toggle("is-glowing", cappedStep >= 2);
}

function advanceDesktopPlayfulness() {
  const now = performance.now();
  if (now - lastPlayfulRoundAt < 800) return;
  lastPlayfulRoundAt = now;
  if (state.playfulStep < 6) applyPlayfulScale(state.playfulStep + 1);
}

function isDesktopMouse(event) {
  return event?.pointerType === "mouse" && desktopPointerQuery.matches;
}

function rectanglesOverlap(a, b, margin = 0) {
  return !(
    a.right + margin <= b.left ||
    a.left >= b.right + margin ||
    a.bottom + margin <= b.top ||
    a.top >= b.bottom + margin
  );
}

function chooseSafeNoPosition(mode, pointer) {
  const playgroundRect = playground.getBoundingClientRect();
  const yesRectViewport = yesButton.getBoundingClientRect();
  const yesRect = {
    left: yesRectViewport.left - playgroundRect.left,
    right: yesRectViewport.right - playgroundRect.left,
    top: yesRectViewport.top - playgroundRect.top,
    bottom: yesRectViewport.bottom - playgroundRect.top,
  };
  const noScale = Number.parseFloat(getComputedStyle(noButton).getPropertyValue("--no-scale")) || 1;
  const noWidth = noButton.offsetWidth * noScale;
  const noHeight = noButton.offsetHeight * noScale;
  // Extra inset absorbs the small rotation without letting the visual box cross the safe area.
  const padding = 16;
  const maxX = Math.max(padding, playground.clientWidth - noWidth - padding);
  const maxY = mode === "touch"
    ? Math.max(padding, Math.min(54, playground.clientHeight - noHeight - padding))
    : Math.max(padding, playground.clientHeight - noHeight - padding);

  const fallbackCandidates = mode === "touch"
    ? [{ x: padding, y: padding }, { x: maxX, y: padding }, { x: maxX / 2, y: padding }]
    : [{ x: padding, y: padding }, { x: maxX, y: padding }, { x: maxX, y: maxY }, { x: padding, y: maxY }];

  const candidates = Array.from({ length: 48 }, () => ({
    x: padding + Math.random() * Math.max(0, maxX - padding),
    y: padding + Math.random() * Math.max(0, maxY - padding),
  })).concat(fallbackCandidates);

  return candidates.find((candidate) => {
    const candidateRect = {
      left: candidate.x,
      right: candidate.x + noWidth,
      top: candidate.y,
      bottom: candidate.y + noHeight,
    };
    if (rectanglesOverlap(candidateRect, yesRect, 14)) return false;
    if (previousNoPosition && Math.hypot(candidate.x - previousNoPosition.x, candidate.y - previousNoPosition.y) < 48) return false;
    if (pointer) {
      const centerX = playgroundRect.left + candidate.x + noWidth / 2;
      const centerY = playgroundRect.top + candidate.y + noHeight / 2;
      if (Math.hypot(centerX - pointer.x, centerY - pointer.y) < 105) return false;
    }
    return true;
  }) || fallbackCandidates[0];
}

function moveNoButton(mode, pointer) {
  noButton.classList.add("is-dodging");
  const position = chooseSafeNoPosition(mode, pointer);
  previousNoPosition = position;
  noButton.style.left = `${position.x}px`;
  noButton.style.top = `${position.y}px`;
  noButton.style.right = "auto";
  noButton.style.bottom = "auto";
  const rotation = mode === "desktop" ? -2 + Math.random() * 4 : 0;
  noButton.style.transform = `scale(var(--no-scale)) rotate(${rotation}deg)`;
}

function dodgeDesktop(event) {
  if (motionIsReduced() || !isDesktopMouse(event)) return;
  const now = performance.now();
  if (now - lastDodgeAt < 170) return;
  lastDodgeAt = now;
  state.dodgeCount += 1;
  teaseMessage.textContent = dodgeReplies[(state.dodgeCount - 1) % dodgeReplies.length];
  moveNoButton("desktop", { x: event.clientX, y: event.clientY });
}

function handleTouchNo() {
  if (motionIsReduced()) {
    // Wait until the touch-generated click finishes so it cannot land on the newly revealed back button.
    window.setTimeout(() => showScreen("decline"), 0);
    return;
  }
  state.touchNoCount += 1;
  noButton.dataset.touchCount = String(state.touchNoCount);
  if (state.playfulStep < 6) applyPlayfulScale(state.playfulStep + 1);
  teaseMessage.textContent = dodgeReplies[(state.touchNoCount - 1) % dodgeReplies.length];
  if (typeof navigator.vibrate === "function") navigator.vibrate(12);
  moveNoButton("touch");
}

noButton.addEventListener("pointerenter", (event) => {
  lastPointerType = event.pointerType;
  if (isDesktopMouse(event) && !motionIsReduced()) advanceDesktopPlayfulness();
  dodgeDesktop(event);
});

playground.addEventListener("pointermove", (event) => {
  if (!isDesktopMouse(event) || motionIsReduced()) return;
  const rect = noButton.getBoundingClientRect();
  const nearestX = Math.max(rect.left, Math.min(event.clientX, rect.right));
  const nearestY = Math.max(rect.top, Math.min(event.clientY, rect.bottom));
  if (Math.hypot(event.clientX - nearestX, event.clientY - nearestY) < 38) dodgeDesktop(event);
});

noButton.addEventListener("pointerdown", (event) => {
  lastPointerType = event.pointerType;
});

noButton.addEventListener("pointerup", (event) => {
  lastPointerType = event.pointerType;
  if (isDesktopMouse(event)) return;
  event.preventDefault();
  suppressClickUntil = performance.now() + 700;
  handleTouchNo();
});

noButton.addEventListener("click", (event) => {
  if (performance.now() < suppressClickUntil) return;
  if (event.detail === 0 || motionIsReduced()) {
    showScreen("decline");
    return;
  }
  if (lastPointerType === "mouse" && desktopPointerQuery.matches) {
    dodgeDesktop({ pointerType: "mouse", clientX: event.clientX, clientY: event.clientY });
    return;
  }
  handleTouchNo();
});

document.getElementById("honestExit").addEventListener("click", () => showScreen("decline"));
document.getElementById("backButton").addEventListener("click", () => showScreen("invite"));

yesButton.addEventListener("click", (event) => {
  heartBurst(event.currentTarget);
  window.setTimeout(() => showScreen("reaction"), motionIsReduced() ? 0 : 420);
});

document.querySelectorAll("[data-next]").forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.next));
});

const scheduleForm = document.getElementById("scheduleForm");
const activityForm = document.getElementById("activityForm");
const dateInput = document.getElementById("dateInput");
const datePending = document.getElementById("datePending");
const dateSelectionStatus = document.getElementById("dateSelectionStatus");
const shortcutButtons = [...document.querySelectorAll("[data-date-shortcut]")];
const customTimeChoice = document.getElementById("customTimeChoice");
const customTimeInput = document.getElementById("customTimeInput");
let draftDate = { mode: "", value: "", shortcut: "" };

document.querySelectorAll(".choice-chip input, .activity-card input").forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) replayMotionClass(input.closest(".choice-chip, .activity-card"), "is-pulsing");
  });
});

function dateToISO(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split("T")[0];
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getShortcutDates() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const day = today.getDay();
  const daysUntilWeekend = day === 0 || day === 6 ? 0 : 6 - day;
  const thisWeekend = addDays(today, daysUntilWeekend);
  return {
    today,
    tomorrow: addDays(today, 1),
    "this-weekend": thisWeekend,
    "next-weekend": addDays(thisWeekend, 7),
  };
}

const shortcutDates = getShortcutDates();
const localToday = dateToISO(shortcutDates.today);
dateInput.min = localToday;

function formatShortDate(date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}

function formatDateValue(dateString) {
  if (!dateString) return "待定";
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(date);
}

shortcutButtons.forEach((button) => {
  const date = shortcutDates[button.dataset.dateShortcut];
  button.dataset.dateValue = dateToISO(date);
  button.querySelector("small").textContent = formatShortDate(date);
  button.addEventListener("click", () => {
    selectDate({ mode: "date", value: button.dataset.dateValue, shortcut: button.dataset.dateShortcut });
    replayMotionClass(button, "is-bouncing");
  });
});

function selectDate(nextDate) {
  draftDate = { ...nextDate };
  datePending.checked = nextDate.mode === "pending";
  if (nextDate.mode === "date") dateInput.value = nextDate.value;
  if (nextDate.mode === "pending" || !nextDate.mode) dateInput.value = "";
  shortcutButtons.forEach((button) => {
    const selected = nextDate.mode === "date" && button.dataset.dateValue === nextDate.value;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  dateSelectionStatus.classList.toggle("has-selection", Boolean(nextDate.mode));
  dateSelectionStatus.textContent = nextDate.mode === "pending"
    ? "已选择：日期之后再商量"
    : nextDate.mode === "date"
      ? `已选择：${formatDateValue(nextDate.value)}`
      : "还没有选择日期";
}

dateInput.addEventListener("change", () => {
  if (!dateInput.value) {
    selectDate({ mode: "", value: "", shortcut: "" });
    return;
  }
  const matchingShortcut = shortcutButtons.find((button) => button.dataset.dateValue === dateInput.value);
  selectDate({ mode: "date", value: dateInput.value, shortcut: matchingShortcut?.dataset.dateShortcut || "custom" });
});

datePending.addEventListener("change", () => {
  if (datePending.checked) selectDate({ mode: "pending", value: "", shortcut: "" });
  else selectDate({ mode: "", value: "", shortcut: "" });
});

customTimeInput.addEventListener("focus", () => {
  customTimeChoice.checked = true;
});
customTimeInput.addEventListener("change", () => {
  customTimeChoice.checked = true;
});

scheduleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const error = document.getElementById("scheduleError");
  if (!draftDate.mode) {
    error.textContent = "请选择日期，或者标记为之后再商量。";
    document.getElementById("dateShortcuts").querySelector("button").focus();
    return;
  }
  if (draftDate.mode === "date" && draftDate.value < localToday) {
    error.textContent = "时间机器还没修好，选今天或之后的日期吧。";
    dateInput.focus();
    return;
  }

  const timeChoice = scheduleForm.querySelector('input[name="timeChoice"]:checked');
  if (!timeChoice) {
    error.textContent = "请选择推荐时间、自定义时间或时间待定。";
    scheduleForm.querySelector('input[name="timeChoice"]')?.focus();
    return;
  }
  if (timeChoice.value === "custom" && !customTimeInput.value) {
    error.textContent = "请填写自定义时间，或者选择时间待定。";
    customTimeInput.focus();
    return;
  }

  error.textContent = "";
  state.dateMode = draftDate.mode;
  state.date = draftDate.value;
  state.timeMode = timeChoice.value === "pending" ? "pending" : "time";
  state.time = timeChoice.value === "custom" ? customTimeInput.value : timeChoice.value === "pending" ? "" : timeChoice.value;
  showScreen("activity");
});

activityForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const selectedActivity = new FormData(event.currentTarget).get("activity");
  const error = document.getElementById("activityError");
  if (!selectedActivity) {
    error.textContent = "先选一个今天想做的事情吧。";
    activityForm.querySelector('input[name="activity"]')?.focus();
    return;
  }
  error.textContent = "";
  state.activity = selectedActivity;
  renderSummary();
  heartBurst(event.submitter);
  window.setTimeout(() => showScreen("final"), motionIsReduced() ? 0 : 350);
});

document.getElementById("backToScheduleButton").addEventListener("click", () => showScreen("schedule"));
document.getElementById("editScheduleButton").addEventListener("click", () => showScreen("schedule"));
document.getElementById("editActivityButton").addEventListener("click", () => showScreen("activity"));

function summaryDate() {
  return state.dateMode === "pending" ? "之后再商量" : formatDateValue(state.date);
}

function summaryTime() {
  return state.timeMode === "pending" ? "之后再商量" : state.time || "待定";
}

function renderSummary() {
  document.getElementById("summaryDate").textContent = summaryDate();
  document.getElementById("summaryTime").textContent = summaryTime();
  document.getElementById("summaryActivity").textContent = state.activity || "待定";
  document.getElementById("finalMessage").textContent = `${config.to}负责准时出现，${config.from}负责把这一天变得值得记住。`;
}

function getPlanText() {
  return [
    "🎟️ 我们的约会小票",
    `日期：${summaryDate()}`,
    `时间：${summaryTime()}`,
    `安排：${state.activity || "待定"}`,
    `发起人：${config.from}`,
    "到时候见，不见不散 ✿",
  ].join("\n");
}

async function copyText(text, successMessage) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    const textarea = document.createElement("textarea");
    try {
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.setAttribute("readonly", "");
      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    } finally {
      textarea.remove();
    }
  }
  if (!copied) {
    showToast("复制没有成功，再试一次吧");
    return false;
  }
  showToast(successMessage);
  return true;
}

const copyPlanButton = document.getElementById("copyPlanButton");
let copyFeedbackTimer;
copyPlanButton.addEventListener("click", async () => {
  const copied = await copyText(getPlanText(), "约会小票已复制");
  if (!copied) return;
  const defaultLabel = copyPlanButton.dataset.defaultLabel || copyPlanButton.textContent;
  copyPlanButton.dataset.defaultLabel = defaultLabel;
  copyPlanButton.textContent = "已复制 ✓";
  copyPlanButton.classList.add("is-copied");
  replayMotionClass(copyPlanButton, "is-confirming");
  window.clearTimeout(copyFeedbackTimer);
  copyFeedbackTimer = window.setTimeout(() => {
    copyPlanButton.textContent = defaultLabel;
    copyPlanButton.classList.remove("is-copied");
  }, 1500);
});

document.getElementById("shareButton").addEventListener("click", async () => {
  const shareData = { title: document.title, text: `${config.to}，这里有一份给你的邀请 ✿`, url: window.location.href };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch {
      return;
    }
  } else {
    await copyText(window.location.href, "邀请链接已复制");
  }
});

let toastTimer;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function resetInviteButtons() {
  state.dodgeCount = 0;
  state.touchNoCount = 0;
  state.playfulStep = 0;
  lastPlayfulRoundAt = Number.NEGATIVE_INFINITY;
  previousNoPosition = null;
  noButton.className = "button button-secondary dodge-button";
  noButton.removeAttribute("style");
  noButton.removeAttribute("data-touch-count");
  yesButton.classList.remove("is-glowing");
  yesButton.removeAttribute("style");
  yesIcon.textContent = yesIcons[0];
  teaseMessage.textContent = "拒绝按钮偶尔会有自己的想法。";
}

document.getElementById("restartButton").addEventListener("click", (event) => {
  replayMotionClass(event.currentTarget, "is-spinning");
  Object.assign(state, emptyState);
  celebrationPlayed = false;
  document.querySelector(".ticket")?.classList.remove("is-shining");
  document.querySelectorAll(".celebration-piece").forEach((piece) => piece.remove());
  window.clearTimeout(copyFeedbackTimer);
  copyPlanButton.textContent = copyPlanButton.dataset.defaultLabel || "复制约会小票";
  copyPlanButton.classList.remove("is-copied", "is-confirming");
  scheduleForm.reset();
  activityForm.reset();
  customTimeInput.value = "";
  selectDate({ mode: "", value: "", shortcut: "" });
  document.getElementById("scheduleError").textContent = "";
  document.getElementById("activityError").textContent = "";
  resetInviteButtons();
  document.getElementById("progress").hidden = false;
  showScreen("invite");
});

startIntro();
