#!/usr/bin/env node
// Symlinks every skill in .agents/skills/ into .claude/skills/ so Claude Code
// can discover them. Re-run after adding skills: `pnpm skills:link`.
import { readdirSync, mkdirSync, symlinkSync, rmSync, statSync, lstatSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, ".agents", "skills");
const dest = join(root, ".claude", "skills");

mkdirSync(dest, { recursive: true });

const skills = readdirSync(src).filter((name) =>
  statSync(join(src, name)).isDirectory()
);

let linked = 0;
for (const name of skills) {
  const linkPath = join(dest, name);
  try {
    if (lstatSync(linkPath)) rmSync(linkPath, { recursive: true, force: true });
  } catch {
    // doesn't exist yet — fine
  }
  symlinkSync(relative(dest, join(src, name)), linkPath, "dir");
  console.log(`  linked ${name}`);
  linked++;
}

console.log(`\n${linked} skill(s) linked into .claude/skills/. Restart your Claude session to pick them up.`);
