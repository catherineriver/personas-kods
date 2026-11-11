// Cross-checks against independently written reference logic, so a mistake
// in the library is not mirrored by the same mistake in its tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, checkDigit } from "../dist/index.js";

// Deterministic PRNG (mulberry32) so failures are reproducible.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// python-stdnum's formulation: different weights, addition instead of
// subtraction. Algebraically equivalent modulo 11.
function stdnumCheckDigit(ten) {
  const w = [10, 5, 8, 4, 2, 1, 6, 3, 7, 9];
  let check = 1;
  for (let i = 0; i < 10; i++) check += w[i] * Number(ten[i]);
  return (check % 11) % 10;
}

// PEAR Validate_LV's formulation: weights over all 11 digits, valid when the
// sum is 1 modulo 11 (a computed 10 is written as 0).
function pearAccepts(eleven) {
  const w = [1, 6, 3, 7, 9, 10, 5, 8, 4, 2, 1];
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += w[i] * Number(eleven[i]);
  if (sum % 11 === 1) return true;
  // The "10 becomes 0" case: last digit 0 standing in for 10.
  return eleven[10] === "0" && (sum + 10) % 11 === 1;
}

// Date check done by the platform rather than by hand.
function referenceDate(digits) {
  const century = { 0: 1800, 1: 1900, 2: 2000 }[digits[6]];
  if (century === undefined) return null;
  const d = Number(digits.slice(0, 2)), m = Number(digits.slice(2, 4));
  const y = century + Number(digits.slice(4, 6));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

test("checkDigit agrees with the stdnum and PEAR formulations", () => {
  const rand = prng(20170701);
  for (let i = 0; i < 200_000; i++) {
    const ten = String(Math.floor(rand() * 1e10)).padStart(10, "0");
    const k = checkDigit(ten);
    assert.equal(k, stdnumCheckDigit(ten), ten);
    assert.equal(pearAccepts(ten + k), true, ten);
  }
});

test("every calendar day from 1800 to 2099 round-trips", () => {
  let days = 0;
  for (let t = Date.UTC(1800, 0, 1); t <= Date.UTC(2099, 11, 31); t += 86_400_000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    const [y, m, d] = iso.split("-");
    const ten = d + m + y.slice(2) + String(Math.floor(Number(y) / 100) - 18) + "123";
    const res = validate(ten + checkDigit(ten));
    assert.equal(res.valid, true, iso);
    assert.equal(res.birthDate, iso);
    days++;
  }
  assert.equal(days, 109_573); // 300 years, 73 leap days (1800, 1900 excluded)
});

test("every DDMMYY x century combination matches the reference date check", () => {
  let valid = 0;
  for (let n = 0; n < 1_000_000; n++) {
    const ddmmyy = String(n).padStart(6, "0");
    if (ddmmyy.startsWith("32")) continue;
    for (const c of "012") {
      const ten = ddmmyy + c + "000";
      const res = validate(ten + checkDigit(ten));
      const expected = referenceDate(ten);
      if (expected === null) {
        assert.deepEqual(res, { valid: false, error: "invalid_date" }, ten);
      } else {
        assert.equal(res.valid && res.birthDate, expected, ten);
        valid++;
      }
    }
  }
  assert.equal(valid, 109_573);
});

test("random 11-digit strings: verdict matches the reference rules", () => {
  const rand = prng(42);
  const tally = { valid: 0, invalid: 0 };
  for (let i = 0; i < 300_000; i++) {
    // Bias the first digits towards plausible dates so the valid branch is exercised.
    const head = rand() < 0.5
      ? String(1 + Math.floor(rand() * 31)).padStart(2, "0") + String(1 + Math.floor(rand() * 12)).padStart(2, "0")
      : String(Math.floor(rand() * 1e4)).padStart(4, "0");
    const digits = head + String(Math.floor(rand() * 1e7)).padStart(7, "0");

    let expected;
    if (digits.startsWith("32")) expected = true;
    else expected = referenceDate(digits) !== null && stdnumCheckDigit(digits.slice(0, 10)) === Number(digits[10]);

    assert.equal(validate(digits).valid, expected, digits);
    tally[expected ? "valid" : "invalid"]++;
  }
  assert.ok(tally.valid > 5_000 && tally.invalid > 5_000, JSON.stringify(tally));
});
