// Safe DOM helpers. Everything is built with createElement / textContent / setAttribute.
// Never use innerHTML (or insertAdjacentHTML) with API or model text (docs/security.md, build-plan §8).

export type Child = Node | string | number | null | undefined | false;
export type Props = Record<string, unknown>;

/**
 * h("button", { class: "btn", testid: "x", type: "button", on: { click: fn } }, "Label")
 * - `class` -> className, `testid` -> data-testid, `text` -> textContent
 * - `on` -> event listeners; boolean true sets a bare attribute; false/null/undefined skips it
 * - string children become text nodes (never parsed as HTML)
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key === "testid") node.setAttribute("data-testid", String(value));
    else if (key === "text") node.textContent = String(value);
    else if (key === "on") {
      for (const [ev, fn] of Object.entries(value as Record<string, EventListener>)) node.addEventListener(ev, fn);
    } else node.setAttribute(key, value === true ? "" : String(value));
  }
  append(node, children);
  return node;
}

export function append(node: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

export function clear(node: Element | DocumentFragment): void {
  node.replaceChildren();
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null => root.querySelector<T>(sel);

// ---------- icons (decorative inline SVG, currentColor) ----------

const SVG_NS = "http://www.w3.org/2000/svg";
export type IconName = "sun" | "sun-cloud" | "cloud" | "warning" | "check" | "clock" | "info";

const PATHS: Record<IconName, string[]> = {
  sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
  "sun-cloud": ["M8 3v1.5M2.5 8.5H4M4.1 4.6l1.1 1.1M12.9 4.6l-1.1 1.1", "M8 7a3 3 0 0 0-3 3", "M7 21h10.5a3.5 3.5 0 0 0 .6-6.95A5 5 0 0 0 8.4 13.1 4 4 0 0 0 7 21z"],
  cloud: ["M6.5 19h11a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.6 9.9 4.6 4.6 0 0 0 6.5 19z"],
  warning: ["M12 3.5 2.5 20h19L12 3.5z", "M12 10v4.5M12 17.4v.1"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7v5l3 2"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 11v5M12 7.6v.1"],
};

export function icon(name: IconName, size = 24): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of PATHS[name]) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
}

// ---------- formatting (docs/ux/copy.md "Time and number formats") ----------

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "YYYY-MM-DD" -> local Date (no timezone shift). */
export function parseDay(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
/** "Thursday, Nov 26" */
export function fmtDateLong(ymd: string): string {
  const d = parseDay(ymd);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
/** "Thursday" */
export const weekdayLong = (ymd: string): string => WEEKDAYS[parseDay(ymd).getDay()];
/** "Thu" */
export const weekdayShort = (ymd: string): string => weekdayLong(ymd).slice(0, 3);

/** 13 -> "1 pm", 0 -> "12 am", 12 -> "12 pm" */
export function fmtHour(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? "am" : "pm"}`;
}
/** "13:00" -> "1 pm" */
export const fmtHM = (hm: string): string => fmtHour(Number(hm.slice(0, 2)));
/** ("10:00", "13:00") -> "10 am–1 pm" (en dash) */
export const fmtRange = (a: string, b: string): string => `${fmtHM(a)}–${fmtHM(b)}`;

/** "just now" | "5 min ago" | "2 h ago" | "yesterday" | "3 days ago" */
export function relTime(iso: string | number | Date, now: number = Date.now()): string {
  const t = iso instanceof Date ? iso.getTime() : typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return "a while ago";
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  return days < 2 ? "yesterday" : `${days} days ago`;
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
