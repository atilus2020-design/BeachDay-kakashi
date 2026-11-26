// Beach Day home: picker, Today card, 7-day strip, day detail, offline/stale states (docs/ux/flows.md §2).
import beachList from "../data/beaches.json";
import { scoreWeek, type DayScore, type DayLabel, type ForecastJson, type MarineJson } from "../scoring/index.ts";
import { beachWindow } from "../scoring/window.ts";
import type { ForecastResponse } from "../shared/contracts.ts";
import { mountShell, announce } from "../lib/shell.ts";
import { publicGet, isApiFailure } from "../lib/api.ts";
import { h, icon, clear, fmtDateLong, fmtHM, fmtHour, fmtRange, relTime, weekdayLong, weekdayShort, type IconName } from "../lib/dom.ts";
import { registerServiceWorker } from "../pwa/register.ts";
import { showInstallButton } from "../pwa/install.ts";

interface BeachRow { id: string; name: string; city: string; nwsUrl: string }
const beaches = beachList as BeachRow[];
const DEFAULT_BEACH = "south-beach";
const PICK_KEY = "bd-beach";
const CACHE_PREFIX = "bd-forecast:";
const OLD_MS = 90 * 60_000; // older than this while "online" means a cached copy was served

const PICKER_LABEL: Record<string, string> = { "south-beach": "South Beach, Miami Beach", crandon: "Crandon Park, Key Biscayne" };
const VETO_LABEL: Record<string, string> = {
  lightning: "No-go: lightning",
  "rain-most-of-day": "Rain most of the day",
  gale: "Too windy",
  "dangerous-surf": "Dangerous surf",
  "extreme-heat": "Dangerous heat",
};
const UV_WORD: Record<string, string> = { low: "Low", moderate: "Moderate", high: "High", "very-high": "Very high", extreme: "Extreme" };
const SHORT: Record<DayLabel, string> = { great: "Great", good: "Good", fair: "Meh", poor: "Skip" };
const ICON: Record<DayLabel, IconName> = { great: "sun", good: "sun-cloud", fair: "cloud", poor: "warning" };
const NWS_TEXT = "Check today's rip current risk (National Weather Service)";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const picker = $<HTMLSelectElement>("beach-picker");
const area = $("forecast-area");
const banners = $("banners");
const updatedLine = $("updated-line");
const detailSlot = $("day-detail-slot");
const installSlot = $("install-slot");
const main = $("main");

interface View { resp: ForecastResponse; days: DayScore[]; cachedAt: number }
let beachId = DEFAULT_BEACH;
let view: View | null = null;
let selected: number | null = null;
let seq = 0;
let installShown = false;
let bannerState: "offline" | "failed" | null = null;

// ---------- storage (always try/catch) ----------
function readPick(): string {
  try { const v = localStorage.getItem(PICK_KEY); if (v && beaches.some((b) => b.id === v)) return v; } catch { /* blocked */ }
  return DEFAULT_BEACH;
}
function savePick(id: string): void { try { localStorage.setItem(PICK_KEY, id); } catch { /* ignore */ } }
function readCache(id: string): ForecastResponse | null {
  try { const raw = localStorage.getItem(CACHE_PREFIX + id); return raw ? (JSON.parse(raw) as ForecastResponse) : null; } catch { return null; }
}
function writeCache(id: string, r: ForecastResponse): void { try { localStorage.setItem(CACHE_PREFIX + id, JSON.stringify(r)); } catch { /* quota or blocked */ } }

// ---------- helpers ----------
const beachOf = (id: string): BeachRow => beaches.find((b) => b.id === id) ?? beaches[0];
const labelText = (d: DayScore): string => (d.vetoes.length ? VETO_LABEL[d.vetoes[0]] ?? d.labelText : d.labelText);
const uvText = (d: DayScore): string => `UV ${Math.round(d.uv.max)} · ${UV_WORD[d.uv.category] ?? d.uv.category}`;
const range = (d: DayScore): string | null => (d.bestWindow ? fmtRange(d.bestWindow.start, d.bestWindow.end) : null);

function compute(resp: ForecastResponse): DayScore[] {
  return scoreWeek({ forecast: resp.forecast as ForecastJson | null, marine: resp.marine as MarineJson | null });
}

/** Per-hour scores for one day, by running the public scoreWeek on a single-hour slice (no scoring logic is duplicated here). */
interface HourRow { hour: number; score: number; label: DayLabel }
function hourly(resp: ForecastResponse, day: DayScore, index: number): HourRow[] {
  const f = resp.forecast as ForecastJson | null;
  if (!f?.hourly || !f.daily) return [];
  const m = resp.marine as MarineJson | null;
  const win = beachWindow(f.daily.sunrise?.[index], f.daily.sunset?.[index]);
  const marineIdx = new Map<string, number>();
  m?.hourly.time.forEach((t, i) => marineIdx.set(t, i));
  const slice = (src: Record<string, unknown>, i: number): Record<string, unknown> => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) if (Array.isArray(v)) o[k] = [v[i]];
    return o;
  };
  const rows: HourRow[] = [];
  f.hourly.time.forEach((t, i) => {
    if (!t.startsWith(day.date)) return;
    const hour = Number(t.slice(11, 13));
    if (hour < win.startH || hour > win.endH) return;
    const mi = marineIdx.get(t);
    const one = scoreWeek({
      forecast: { ...f, hourly: slice(f.hourly, i), daily: { time: [day.date], uv_index_max: [day.uv.max], sunrise: [], sunset: [] } } as unknown as ForecastJson,
      marine: m && mi != null ? ({ ...m, hourly: slice(m.hourly, mi) } as unknown as MarineJson) : null,
    })[0];
    if (one) rows.push({ hour, score: one.score, label: one.label });
  });
  return rows;
}
function bestFromHours(rows: HourRow[]): string | null {
  let best = -1, at = -1;
  for (let i = 0; i + 3 <= rows.length; i++) {
    const s = (rows[i].score + rows[i + 1].score + rows[i + 2].score) / 3;
    if (s > best) { best = s; at = i; }
  }
  return at < 0 ? null : fmtRange(`${rows[at].hour}:00`, `${rows[at].hour + 3}:00`);
}

function scoreBits(d: DayScore, testids: { score: string; label: string; icon?: string }): { num: HTMLElement; label: HTMLElement } {
  const cls = `score--${d.label}`;
  const num = h("span", { class: `score-card__number ${cls}`, testid: testids.score }, String(d.score));
  const ic = icon(ICON[d.label], 28);
  if (testids.icon) ic.setAttribute("data-testid", testids.icon);
  const label = h("p", { class: `score-card__label ${cls}` }, ic, h("span", { testid: testids.label }, labelText(d)));
  return { num, label };
}

function reasonItems(d: DayScore, testid: string): HTMLElement[] {
  const src = d.reasons.length ? d.reasons : d.highlights;
  if (!src.length) return [h("li", { testid, "data-empty": "true" }, "Nothing is holding today back.")];
  return src.map((r) => h("li", { testid }, r));
}

function nwsLink(testid: string): HTMLAnchorElement {
  return h("a", { class: "btn btn--secondary btn--block", href: beachOf(beachId).nwsUrl, target: "_blank", rel: "noopener noreferrer", testid }, NWS_TEXT);
}
function uvBadge(d: DayScore, testid: string): HTMLElement {
  return h("span", { class: "pill", testid }, icon("sun", 16), uvText(d));
}

// ---------- render ----------
function renderBanners(): void {
  clear(banners);
  if (!view) return;
  if (bannerState) {
    const text = bannerState === "offline"
      ? `Offline. Showing the forecast saved ${relTime(view.resp.fetchedAt)}.`
      : `Couldn't refresh. Showing the forecast from ${relTime(view.resp.fetchedAt)}.`;
    const kids: (Node | null)[] = [
      h("span", { class: "banner__icon", "aria-hidden": "true" }, "⚠︎"),
      h("div", { class: "banner__body" }, text),
      bannerState === "failed" ? h("button", { type: "button", class: "btn btn--secondary banner__action", testid: "retry-button", on: { click: () => void load(beachId, true) } }, "Try again") : null,
    ];
    banners.append(h("div", { class: `banner ${bannerState === "offline" ? "banner--offline" : "banner--stale"}`, testid: "stale-banner", "data-reason": bannerState }, ...kids));
  }
  if (view.resp.partial || view.days.some((d) => d.partial)) {
    banners.append(h("div", { class: "banner banner--info", testid: "partial-note" },
      h("span", { class: "banner__icon", "aria-hidden": "true" }, "ⓘ"),
      h("div", { class: "banner__body" }, "Wave and water data isn't available right now. This score uses weather only.")));
  }
}

function renderUpdated(): void {
  if (!view) { updatedLine.hidden = true; return; }
  updatedLine.hidden = false;
  updatedLine.textContent = `Updated ${relTime(view.resp.fetchedAt)}`;
}

function todayCard(v: View): HTMLElement {
  const d = v.days[0];
  const beach = v.resp.beach ?? beachOf(beachId);
  const { num, label } = scoreBits(d, { score: "today-score", label: "today-label", icon: "today-icon" });
  const labelSpan = label.querySelector("span") as HTMLElement;
  labelSpan.id = "today-label";
  const win = range(d);
  const summary = `Today at ${beach.name}: score ${d.score}, ${labelText(d)}${win ? `, best ${win.replace("–", " to ")}` : ""}.`;
  return h("section", { class: "score-card", testid: "today-card", "aria-labelledby": "today-label" },
    h("p", { class: "score-card__beach" }, `${beach.name}, ${beach.city}`),
    h("p", { class: "text-2", testid: "today-date" }, fmtDateLong(d.date)),
    h("span", { class: "visually-hidden" }, summary),
    num, label,
    win ? h("p", { class: "score-card__window", testid: "best-window" }, `Best ${win}`) : null,
    h("ul", { class: "score-card__reasons", testid: "reasons-list" }, ...reasonItems(d, "reason-item")),
    nwsLink("nws-rip-link"),
    h("p", { class: "section" }, uvBadge(d, "uv-badge")),
  );
}

function strip(v: View): HTMLElement {
  const wrap = h("div", { class: "day-strip", role: "group", "aria-label": "Next days", testid: "day-strip" });
  v.days.forEach((d, i) => {
    const name = `${weekdayLong(d.date)}, score ${d.score}, ${labelText(d)}${d.lowConfidence ? ", lower confidence" : ""}`;
    const cell = h("button", {
      type: "button", class: "day-strip__day", testid: "day-cell", "data-date": d.date, "data-low-confidence": d.lowConfidence ? "true" : null,
      "aria-pressed": selected === i ? "true" : "false", "aria-label": name, on: { click: () => toggleDay(i) },
    },
      h("span", { class: "day-strip__name" }, weekdayShort(d.date)),
      h("span", { class: `score--${d.label}` }, icon(ICON[d.label], 20)),
      h("span", { class: `day-strip__score score--${d.label}` }, String(d.score)),
      h("span", { class: "text-2" }, SHORT[d.label]),
      d.lowConfidence ? h("span", { class: "text-2", testid: "low-confidence-badge" }, h("span", { "aria-hidden": "true" }, "~"), h("span", { class: "visually-hidden" }, "Lower confidence")) : null,
    );
    wrap.append(cell);
  });
  return wrap;
}

function renderForecast(): void {
  if (!view) return;
  main.setAttribute("aria-busy", "false");
  renderBanners();
  renderUpdated();
  area.replaceChildren(
    todayCard(view),
    h("section", { class: "section" }, h("h2", { class: "section__title" }, "Next days"), strip(view)),
  );
  renderDetail(false);
  if (!installShown) {
    installShown = true;
    showInstallButton(installSlot);
  }
}

function renderSkeleton(): void {
  main.setAttribute("aria-busy", "true");
  clear(banners);
  updatedLine.hidden = true;
  clear(detailSlot);
  area.replaceChildren(h("div", { testid: "forecast-loading", "aria-hidden": "true" },
    h("div", { class: "score-card" }, h("span", { class: "skeleton skeleton--text" }), h("span", { class: "skeleton skeleton--score" }), h("span", { class: "skeleton skeleton--text" }), h("span", { class: "skeleton skeleton--text" })),
    h("span", { class: "skeleton skeleton--block section" })));
}

function renderError(status: number): void {
  main.setAttribute("aria-busy", "false");
  clear(banners);
  updatedLine.hidden = true;
  clear(detailSlot);
  const body = status === 429 ? "Too many tries. Wait a minute, then try again." : "Check your connection, then try again.";
  area.replaceChildren(h("section", { class: "card", testid: "forecast-error", role: "alert" },
    h("h2", { class: "card__title" }, "Can't load the forecast"),
    h("p", {}, body),
    h("button", { type: "button", class: "btn btn--primary", testid: "retry-button", on: { click: () => void load(beachId, true) } }, "Try again")));
}

// ---------- day detail ----------
function toggleDay(i: number): void {
  selected = selected === i ? null : i;
  if (view) area.querySelectorAll<HTMLElement>('[data-testid="day-cell"]').forEach((c, idx) => c.setAttribute("aria-pressed", String(idx === selected)));
  renderDetail(true);
}

function renderDetail(focus: boolean): void {
  clear(detailSlot);
  if (!view || selected === null || !view.days[selected]) return;
  const i = selected;
  const d = view.days[i];
  const { num, label } = scoreBits(d, { score: "day-detail-score", label: "day-detail-label" });
  const showHours = i <= 3;
  const rows = showHours ? hourly(view.resp, d, i) : [];
  const win = d.bestWindow ? range(d) : showHours ? bestFromHours(rows) : null;
  const title = h("h2", { id: "day-detail-title", class: "card__title", testid: "day-detail-title", tabindex: "-1" }, fmtDateLong(d.date));
  const panel = h("section", { class: "card section", role: "region", "aria-labelledby": "day-detail-title", testid: "day-detail" },
    title,
    h("div", { class: "score-card" }, num, label),
    win ? h("p", { testid: "day-detail-best-window" }, `Best ${win}`) : null,
    h("ul", { class: "score-card__reasons", testid: "day-detail-reasons" }, ...reasonItems(d, "day-detail-reason")),
  );
  if (showHours && rows.length) {
    panel.append(h("h3", {}, "Hour by hour"), h("ul", { class: "link-list", testid: "hourly-list" },
      ...rows.map((r) => h("li", { testid: "hour-row", "data-hour": String(r.hour) },
        `${fmtHour(r.hour)} · ${r.score} · `, h("span", { class: `score--${r.label}` }, SHORT[r.label])))));
  } else if (!showHours) {
    panel.append(h("p", { class: "text-2", testid: "day-detail-low-confidence" }, "Forecasts further out are less certain. Hourly detail isn't shown."));
  }
  panel.append(
    nwsLink("day-detail-nws-link"),
    h("p", { class: "section" }, uvBadge(d, "day-detail-uv")),
    h("button", { type: "button", class: "btn btn--secondary", testid: "day-detail-close", on: { click: () => {
      const cell = area.querySelectorAll<HTMLElement>('[data-testid="day-cell"]')[i];
      selected = null; area.querySelectorAll('[data-testid="day-cell"]').forEach((c) => c.setAttribute("aria-pressed", "false"));
      clear(detailSlot); cell?.focus();
    } } }, "Close"),
  );
  detailSlot.append(panel);
  if (focus) { title.focus({ preventScroll: true }); panel.scrollIntoView({ block: "nearest" }); }
}

// ---------- loading ----------
function show(resp: ForecastResponse, state: "offline" | "failed" | null): boolean {
  const days = compute(resp);
  if (!days.length) return false;
  view = { resp, days, cachedAt: Date.now() };
  bannerState = state;
  if (selected !== null && selected >= days.length) selected = null;
  renderForecast();
  return true;
}

async function load(id: string, userRetry = false): Promise<void> {
  const mine = ++seq;
  const cached = readCache(id);
  const hadView = view?.resp.beach?.id === id;
  if (!hadView) {
    view = null;
    selected = null;
    if (cached && show(cached, navigator.onLine ? null : "offline")) { /* instant, then refresh */ }
    else { renderSkeleton(); announce("Loading the forecast."); }
  }
  if (userRetry && !view) { renderSkeleton(); announce("Loading the forecast."); }
  try {
    const resp = await publicGet<ForecastResponse>(`/api/forecast?beach=${encodeURIComponent(id)}`);
    if (mine !== seq) return;
    if (!resp.beach) resp.beach = { ...beachOf(id) } as unknown as ForecastResponse["beach"];
    writeCache(id, resp);
    const age = Date.now() - Date.parse(resp.fetchedAt);
    const state = !navigator.onLine ? "offline" : age > OLD_MS ? "failed" : null;
    if (!show(resp, state)) throw { status: 502, error: "no data" };
    announce(state === "offline" ? "Offline. Showing saved forecast." : "Updated.");
  } catch (e) {
    if (mine !== seq) return;
    const status = isApiFailure(e) ? e.status : 0;
    if ((status === 400 || status === 404) && id !== DEFAULT_BEACH) {
      beachId = DEFAULT_BEACH; picker.value = DEFAULT_BEACH; savePick(DEFAULT_BEACH);
      return load(DEFAULT_BEACH);
    }
    if (view) {
      bannerState = navigator.onLine ? "failed" : "offline";
      renderBanners();
      announce(bannerState === "offline" ? "Offline. Showing saved forecast." : "Couldn't refresh.");
    } else renderError(status);
  }
}

// ---------- boot ----------
mountShell();
registerServiceWorker();
for (const b of beaches) picker.append(h("option", { value: b.id }, PICKER_LABEL[b.id] ?? b.name));
beachId = readPick();
picker.value = beachId;
picker.addEventListener("change", () => {
  beachId = picker.value;
  savePick(beachId);
  void load(beachId);
});
window.addEventListener("online", () => {
  bannerState = null;
  renderBanners();
  void load(beachId).then(() => announce("Back online. Updated."));
});
window.addEventListener("offline", () => {
  if (!view) return;
  bannerState = "offline";
  renderBanners();
  announce("Offline. Showing saved forecast.");
});
setInterval(() => { renderUpdated(); if (bannerState) renderBanners(); }, 60_000);
void load(beachId);
