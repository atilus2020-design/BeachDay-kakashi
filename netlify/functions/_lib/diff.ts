// Unified diff for proposal review (doc 04 §4.4 step 4), built with the `diff` package.
// The UI renders it with textContent only.
import { createTwoFilesPatch } from "diff";

export interface DiffEntry {
  path: string;
  action: "create" | "update" | "delete";
  oldText: string;   // "" when the file does not exist yet
  newText: string;   // "" for delete
}

export function buildDiff(entries: DiffEntry[]): string {
  return entries
    .map((e) => {
      const oldName = e.action === "create" ? "/dev/null" : `a/${e.path}`;
      const newName = e.action === "delete" ? "/dev/null" : `b/${e.path}`;
      const oldText = e.action === "create" ? "" : e.oldText;
      const newText = e.action === "delete" ? "" : e.newText;
      const patch = createTwoFilesPatch(oldName, newName, oldText, newText, undefined, undefined, { context: 3 });
      // createTwoFilesPatch starts with an "Index:"/"===" header; replace it with a git-style one.
      const body = patch.replace(/^(Index:[^\n]*\n)?=+\n/, "");
      return `diff --git a/${e.path} b/${e.path}\n${body.endsWith("\n") ? body : body + "\n"}`;
    })
    .join("");
}
