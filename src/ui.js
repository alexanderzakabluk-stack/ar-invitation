const screens = new Map();
document.querySelectorAll("[data-screen]").forEach((el) => screens.set(el.dataset.screen, el));

let current = "cover";

export function show(name) {
  screens.forEach((el, key) => el.classList.toggle("is-active", key === name));
  current = name;
}

export const currentScreen = () => current;

export function text(role, value) {
  document.querySelectorAll(`[data-role="${role}"]`).forEach((el) => {
    el.textContent = value;
  });
}

export function on(action, handler) {
  document.querySelectorAll(`[data-action="${action}"]`).forEach((el) => {
    el.addEventListener("click", handler);
  });
}

export function setChip(visible) {
  document.querySelector(".chip")?.classList.toggle("is-shown", visible);
}

export function fail(message) {
  text("error-text", message);
  show("error");
}

/* ------------------------------------------------------------------ */

/**
 * A short shimmer synthesised with WebAudio — no asset to load, and it can only
 * start from the user gesture that opened the experience.
 */
export function createChime() {
  let ctx = null;

  return {
    unlock() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ctx = ctx || new Ctx();
      if (ctx.state === "suspended") ctx.resume();
    },
    play(delay = 0, partials = [880, 1320, 1760]) {
      if (!ctx) return;
      const t0 = ctx.currentTime + delay;
      partials.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t0 + i * 0.06);
        gain.gain.linearRampToValueAtTime(0.09 / (i + 1), t0 + i * 0.06 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.06 + 1.6);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + i * 0.06);
        osc.stop(t0 + i * 0.06 + 1.7);
      });
    },
  };
}

/* ------------------------------------------------------------------ */

const EVENT = {
  title: "An Evening of Caviar, Champagne and Exceptional Company",
  location: "Ringön Vinkällare, Ringön, Göteborg",
  start: "20261211T170000Z", // 18:00 CET
  end: "20261211T220000Z",
};

export function calendarUrl() {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Invitation//AR//EN",
    "BEGIN:VEVENT",
    `UID:caviar-2026-12-11@invitation`,
    `DTSTAMP:${EVENT.start}`,
    `DTSTART:${EVENT.start}`,
    `DTEND:${EVENT.end}`,
    `SUMMARY:${EVENT.title}`,
    `LOCATION:${EVENT.location}`,
    "DESCRIPTION:Dress code: cocktail attire.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
}
