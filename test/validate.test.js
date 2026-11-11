import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validate, isValid, format, getBirthDate, checkDigit } from "../dist/index.js";

const ok = (digits, formatted, kind, birthDate) => ({
  valid: true, format: kind, digits, formatted, birthDate,
});
const fail = (error) => ({ valid: false, error });

describe("legacy format", () => {
  test("published reference vectors", () => {
    // python-stdnum doctest
    assert.deepEqual(validate("161175-19997"), ok("16117519997", "161175-19997", "legacy", "1975-11-16"));
    // synthetic vector quoted with the PEAR Validate_LV algorithm
    assert.deepEqual(validate("111111-11111"), ok("11111111111", "111111-11111", "legacy", "1911-11-11"));
  });

  test("hyphen is optional, outer whitespace is ignored", () => {
    for (const s of ["16117519997", "161175-19997", " 161175-19997", "161175-19997\n", "\t16117519997 "]) {
      assert.equal(isValid(s), true, JSON.stringify(s));
    }
  });

  test("wrong check digit: every other last digit is rejected", () => {
    for (let k = 0; k <= 9; k++) {
      const code = "161175-1999" + k;
      assert.equal(isValid(code), k === 7, code);
    }
    assert.deepEqual(validate("161175-19998"), fail("invalid_checksum"));
  });

  test("impossible dates", () => {
    // python-stdnum doctest: month 13
    assert.deepEqual(validate("161375-19997"), fail("invalid_date"));
    for (const ddmmyy of ["000175", "320175", "010075", "011375", "310475", "310675",
                          "310975", "311175", "300275", "290275", "999999"]) {
      const ten = ddmmyy + "1123";
      // Give it a correct check digit so only the date can be the reason.
      const res = validate(ten + checkDigit(ten));
      // "32...." is the new format, not a bad date.
      if (ddmmyy.startsWith("32")) assert.equal(res.valid, true);
      else assert.deepEqual(res, fail("invalid_date"), ddmmyy);
    }
  });

  test("leap years follow the Gregorian rule per century digit", () => {
    const cases = [
      ["290200", "0", false], // 1800: not a leap year
      ["290200", "1", false], // 1900: not a leap year
      ["290200", "2", true],  // 2000: leap year
      ["290204", "1", true],  // 1904
      ["290296", "0", true],  // 1896
      ["290223", "2", false], // 2023
      ["290224", "2", true],  // 2024
    ];
    for (const [ddmmyy, c, expected] of cases) {
      const ten = ddmmyy + c + "000";
      assert.equal(isValid(ten + checkDigit(ten)), expected, ddmmyy + "-" + c);
    }
  });

  test("century digit maps to 18xx / 19xx / 20xx", () => {
    for (const [c, year] of [["0", "1875"], ["1", "1975"], ["2", "2075"]]) {
      const ten = "161175" + c + "999";
      assert.equal(getBirthDate(ten + checkDigit(ten)), `${year}-11-16`);
    }
  });

  test("century digit above 2 is rejected", () => {
    for (const c of "3456789") {
      const ten = "161175" + c + "999";
      assert.deepEqual(validate(ten + checkDigit(ten)), fail("invalid_century"), c);
    }
  });

  test("error precedence: century, then date, then checksum", () => {
    assert.deepEqual(validate("161375-99990"), fail("invalid_century"));
    assert.deepEqual(validate("161375-19990"), fail("invalid_date"));
  });
});

describe("new format", () => {
  test("any 32 + nine digits is accepted by default", () => {
    assert.deepEqual(validate("32345678901"), ok("32345678901", "323456-78901", "new", null));
    for (const s of ["320000-00000", "329999-99999", "32000000000", "328673-00677"]) {
      assert.equal(isValid(s), true, s);
    }
  });

  test("carries no birth date even when the digits look like one", () => {
    assert.equal(getBirthDate("321299-12345"), null);
  });

  test("newFormatChecksum matches python-stdnum's doctests", () => {
    const strict = { newFormatChecksum: true };
    assert.deepEqual(validate("328673-00679", strict), ok("32867300679", "328673-00679", "new", null));
    assert.deepEqual(validate("328673-00677", strict), fail("invalid_checksum"));
    assert.equal(isValid("328673-00677", strict), false);
    assert.equal(format("328673-00677", strict), null);
    assert.equal(format("32867300679", strict), "328673-00679");
  });

  test("newFormatChecksum does not change legacy validation", () => {
    assert.equal(isValid("161175-19997", { newFormatChecksum: true }), true);
    assert.equal(isValid("161175-19998", { newFormatChecksum: true }), false);
  });

  test("only the 32 prefix is the new format", () => {
    for (const prefix of ["30", "31", "33", "39"]) {
      const ten = prefix + "01751123";
      const res = validate(ten + checkDigit(ten));
      assert.equal(res.valid && res.format === "new", false, prefix);
    }
  });
});

describe("input shape", () => {
  test("malformed strings", () => {
    const bad = [
      "", " ", "-", "1611751999", "161175199971", "161175-1999", "161175-199977",
      "161175 19997", "161175  19997", "16117-519997", "1611751-9997", "161175--19997",
      "161175–19997", "161175—19997", "161175_19997", "161175/19997", "161175.19997",
      "16117a-19997", "161175-1999x", "+16117519997", "16117519997.0", "1.6117519997e10",
      "１６１１７５-１９９９７", "١٦١١٧٥-١٩٩٩٧", "161175-19997 161175-19997", "LV16117519997",
      "1 6 1 1 7 5 1 9 9 9 7",
    ];
    for (const s of bad) assert.deepEqual(validate(s), fail("invalid_format"), JSON.stringify(s));
  });

  test("non-strings never throw", () => {
    const bad = [null, undefined, 16117519997, 16117519997n, NaN, true, {}, [], ["161175-19997"],
                 new String("161175-19997"), Symbol("x"), () => "161175-19997", new Date()];
    for (const v of bad) {
      assert.deepEqual(validate(v), fail("not_a_string"));
      assert.equal(isValid(v), false);
      assert.equal(format(v), null);
      assert.equal(getBirthDate(v), null);
    }
  });

  test("very long input is rejected quickly", () => {
    const start = performance.now();
    assert.equal(isValid("1".repeat(1_000_000)), false);
    assert.equal(isValid("1".repeat(500_000) + "-" + "1".repeat(500_000)), false);
    assert.ok(performance.now() - start < 500);
  });
});

describe("format and getBirthDate", () => {
  test("format", () => {
    assert.equal(format("16117519997"), "161175-19997");
    assert.equal(format("161175-19997"), "161175-19997");
    assert.equal(format(" 32345678901 "), "323456-78901");
    assert.equal(format("161175-19998"), null);
    assert.equal(format("nope"), null);
  });

  test("getBirthDate", () => {
    assert.equal(getBirthDate("161175-19997"), "1975-11-16");
    assert.equal(getBirthDate("161175-19998"), null);
    assert.equal(getBirthDate("323456-78901"), null);
  });
});

describe("checkDigit", () => {
  test("known values", () => {
    assert.equal(checkDigit("1611751999"), 7);
    assert.equal(checkDigit("1111111111"), 1);
    assert.equal(checkDigit("3286730067"), 9);
  });

  test("rejects anything but ten digits", () => {
    for (const v of ["", "123", "12345678901", "161175-199", "16117519a9", 1611751999, null, undefined]) {
      assert.throws(() => checkDigit(v), TypeError);
    }
  });
});
