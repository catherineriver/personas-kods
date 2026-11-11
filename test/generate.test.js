import { test } from "node:test";
import assert from "node:assert/strict";
import { generate, validate, getBirthDate } from "../dist/index.js";

test("defaults to the new format with a hyphen", () => {
  for (let i = 0; i < 1000; i++) {
    const code = generate();
    assert.match(code, /^32\d{4}-\d{5}$/);
    const res = validate(code, { newFormatChecksum: true });
    assert.equal(res.valid && res.format, "new", code);
  }
});

test("legacy codes validate and carry a birth date", () => {
  for (let i = 0; i < 5000; i++) {
    const code = generate({ format: "legacy" });
    const res = validate(code);
    assert.equal(res.valid && res.format, "legacy", code);
    assert.match(res.birthDate, /^(19\d\d|20(0\d|1[0-6]))-\d\d-\d\d$/);
  }
});

test("birthDate option", () => {
  for (const date of ["1800-01-01", "1899-12-31", "1900-01-01", "1975-11-16", "2000-02-29", "2099-12-31"]) {
    for (let i = 0; i < 50; i++) {
      assert.equal(getBirthDate(generate({ format: "legacy", birthDate: date })), date);
    }
  }
  assert.match(generate({ format: "legacy", birthDate: "1990-05-17" }), /^170590-1\d{4}$/);
});

test("hyphen option", () => {
  assert.match(generate({ hyphen: false }), /^32\d{9}$/);
  assert.match(generate({ format: "legacy", hyphen: false }), /^\d{11}$/);
});

test("custom random source makes output deterministic", () => {
  const zero = () => 0;
  const high = () => 0.999999;
  assert.equal(generate({ random: zero }), generate({ random: zero }));
  assert.equal(generate({ random: zero }).slice(0, 9), "320000-00");
  assert.equal(generate({ random: high }).slice(0, 9), "329999-99");
  assert.equal(getBirthDate(generate({ format: "legacy", random: zero })), "1900-01-01");
  assert.equal(getBirthDate(generate({ format: "legacy", random: high })), "2016-12-28");
});

test("serial digits vary", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(generate({ format: "legacy", birthDate: "1990-05-17" }));
  assert.ok(seen.size > 100, `only ${seen.size} distinct codes`);
});

test("invalid options throw RangeError", () => {
  const bad = [
    { birthDate: "2000-01-01" },                     // new format has no birth date
    { format: "legacy", birthDate: "01.01.2000" },
    { format: "legacy", birthDate: "2000-1-1" },
    { format: "legacy", birthDate: "1900-02-29" },
    { format: "legacy", birthDate: "2001-13-01" },
    { format: "legacy", birthDate: "2001-04-31" },
    { format: "legacy", birthDate: "1799-12-31" },
    { format: "legacy", birthDate: "2100-01-01" },
    { format: "legacy", birthDate: "" },
  ];
  for (const options of bad) assert.throws(() => generate(options), RangeError, JSON.stringify(options));
});
