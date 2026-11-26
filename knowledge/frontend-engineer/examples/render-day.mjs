// Example 2 — render a day button safely with createElement/textContent (no innerHTML).
// Uses a tiny DOM stub so it runs in Node; in the browser pass the real `document`. Run: node render-day.mjs
export function renderDayButton(doc, day) {
  const b = doc.createElement("button");
  b.className = `day day--${day.label}`;
  b.setAttribute("aria-label", `${day.weekday}, score ${day.score}, ${day.labelText}${day.lowConfidence ? ", less certain" : ""}`);
  for (const [cls, txt] of [["day__name", day.weekday], ["day__score", String(day.score)], ["day__label", day.labelText]]) {
    const s = doc.createElement("span"); s.className = cls; s.textContent = txt; b.append(s);
  }
  return b;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const el = (tag) => ({ tag, attrs: {}, kids: [], textContent: "", className: "", setAttribute(k, v) { this.attrs[k] = v; }, append(...k) { this.kids.push(...k); } });
  const b = renderDayButton({ createElement: el }, { weekday: "Fri", score: 74, label: "good", labelText: "Good <img src=x onerror=alert(1)>", lowConfidence: true });
  console.log(b.attrs["aria-label"]); console.log(b.kids.map((k) => k.textContent).join(" | "));
  if (!b.kids[2].textContent.includes("<img")) process.exit(1); // markup stays inert text
}
