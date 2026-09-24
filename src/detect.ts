/**
 * File detection — walks a directory tree and identifies code files
 * that can be parsed by tree-sitter.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { DetectResult } from "./types.ts";
import { CODE_EXTENSIONS } from "./types.ts";

const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  ".pi",
  "dist",
  "build",
  ".next",
  ".cache",
  "__pycache__",
  "coverage",
  ".nyc_output",
  "graph-out",
  ".graphify",
  "target",
  "out",
  "obj",
  "venv",
  "vendor",
  "bower_components",
]);

const MAX_FILES = 10_000;

/** Glob of one ignore line: `*` stays inside a path segment, `**` crosses segments. */
function ignoreRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*\*\//g, "\u0000").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\u0000/g, "(?:.*/)?");
  return new RegExp(`^(?:.*/)?${body}(?:/.*)?$`);
}

/**
 * Reads the patterns of a `.mindplaceignore` in the graph root: one glob per line, `#` starts a
 * comment, a leading `./` and a trailing `/` are ignored. A project can keep its generated build
 * output, reports or vendor folders out of the graph without patching this package - `detect` checks
 * every directory and file name against these patterns.
 *
 * Returns a matcher that is always false when the file does not exist.
 */
export function loadIgnore(root: string): (relPath: string, name: string) => boolean {
  const file = join(root, ".mindplaceignore");
  if (!existsSync(file)) {
    return () => false;
  }

  const aRegExp = readFileSync(file, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => ignoreRegExp(line.replace(/^\.\//, "").replace(/\/+$/, "")));

  if (aRegExp.length === 0) {
    return () => false;
  }
  return (relPath, name) => aRegExp.some((re) => re.test(relPath) || re.test(name));
}

export function detect(rootPath: string): DetectResult {
  const absRoot = resolve(rootPath);

  if (!existsSync(absRoot)) {
    throw new Error(`Path does not exist: ${absRoot}`);
  }

  const isIgnored = loadIgnore(absRoot);
  const files: string[] = [];
  const byExtension: Record<string, number> = {};

  function walk(dir: string): void {
    if (files.length >= MAX_FILES) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const name of entries) {
      if (files.length >= MAX_FILES) return;
      if (DEFAULT_IGNORE.has(name)) continue;
      if (name.startsWith(".")) continue;

      const full = join(dir, name);
      // The graph stores and joins relative paths as POSIX paths (`resolveModulePath` splits on "/"),
      // while `relative` returns platform separators - so normalise once, at the source.
      const rel = relative(absRoot, full).split(sep).join("/");
      if (isIgnored(rel, name)) continue;
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }

      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile()) {
        const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";

        if (ext in CODE_EXTENSIONS) {
          files.push(rel);
          byExtension[ext] = (byExtension[ext] || 0) + 1;
        }
      }
    }
  }

  // Always walk from root
  walk(absRoot);

  return {
    root: absRoot,
    files: files.sort(),
    totalFiles: files.length,
    byExtension,
  };
}
