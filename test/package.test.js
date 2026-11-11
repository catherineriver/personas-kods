// Installs the packed tarball into a throwaway project and uses it the way a
// consumer would: ESM import, CommonJS require, and a TypeScript type-check.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// `npm publish --dry-run` exports npm_config_dry_run to child processes; left
// in place it would make the nested `npm pack` skip writing the tarball.
const env = { ...process.env, npm_config_dry_run: "false" };
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });

let work, pkgDir, packed;

before(() => {
  work = mkdtempSync(join(tmpdir(), "personas-kods-"));
  packed = JSON.parse(run(npm, ["pack", "--json", "--pack-destination", work], root))[0];
  pkgDir = join(work, "node_modules", "personas-kods");
  mkdirSync(pkgDir, { recursive: true });
  run("tar", ["-xzf", join(work, packed.filename), "-C", pkgDir, "--strip-components=1"], work);
  writeFileSync(join(work, "package.json"), JSON.stringify({ name: "consumer", private: true }));
});

after(() => rmSync(work, { recursive: true, force: true }));

test("tarball contains only what is needed", () => {
  const files = packed.files.map((f) => f.path).sort();
  assert.deepEqual(files, ["LICENSE", "README.md", "dist/index.d.ts", "dist/index.js", "package.json"]);
});

test("package has no runtime dependencies", () => {
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  assert.equal(pkg.dependencies, undefined);
});

test("ESM import", () => {
  writeFileSync(join(work, "esm.mjs"), `
    import * as pk from "personas-kods";
    import { isValid } from "personas-kods";
    const names = Object.keys(pk).sort().join(",");
    if (names !== "checkDigit,format,generate,getBirthDate,isValid,validate") throw new Error(names);
    if (!isValid("161175-19997") || isValid("161175-19998")) throw new Error("wrong verdict");
    console.log("ok");
  `);
  assert.equal(run(process.execPath, ["esm.mjs"], work).trim(), "ok");
});

test("CommonJS require", (t) => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) return t.skip("require(esm) needs Node 22.12+");
  writeFileSync(join(work, "cjs.cjs"), `
    const { validate } = require("personas-kods");
    if (validate("323456-78901").format !== "new") throw new Error("wrong verdict");
    console.log("ok");
  `);
  assert.equal(run(process.execPath, ["cjs.cjs"], work).trim(), "ok");
});

test("TypeScript consumer type-checks", () => {
  writeFileSync(join(work, "consumer.ts"), `
    import { validate, isValid, format, getBirthDate, generate, checkDigit } from "personas-kods";
    import type { ValidationResult, PersonasKodsError, PersonasKodsFormat, GenerateOptions, ValidateOptions } from "personas-kods";

    const res: ValidationResult = validate("161175-19997", { newFormatChecksum: true });
    if (res.valid) {
      const f: PersonasKodsFormat = res.format;
      const d: string | null = res.birthDate;
      const s: string = res.digits + res.formatted;
      // @ts-expect-error error is only present on failures
      res.error;
      void f; void d; void s;
    } else {
      const e: PersonasKodsError = res.error;
      // @ts-expect-error digits is only present on success
      res.digits;
      void e;
    }
    const b: boolean = isValid(42);
    const a: string | null = format("x");
    const c: string | null = getBirthDate("x");
    const opts: GenerateOptions = { format: "legacy", birthDate: "1990-05-17", hyphen: false, random: Math.random };
    const g: string = generate(opts);
    const k: number = checkDigit("1611751999");
    const vo: ValidateOptions = {};
    // @ts-expect-error unknown format
    generate({ format: "old" });
    // @ts-expect-error unknown option
    validate("x", { strict: true });
    void b; void a; void c; void g; void k; void vo;
  `);
  const local = join(root, "node_modules", "typescript", "bin", "tsc");
  const args = ["--noEmit", "--strict", "--module", "NodeNext", "--moduleResolution", "NodeNext",
                "--target", "ES2020", "--skipLibCheck", "false", "consumer.ts"];
  writeFileSync(join(work, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  if (existsSync(local)) run(process.execPath, [local, ...args], work);
  else run("tsc", args, work);
});
