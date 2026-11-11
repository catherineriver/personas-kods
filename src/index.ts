/**
 * Latvian personal code (personas kods) utilities.
 *
 * Two formats are in circulation:
 *
 * - legacy (issued until 2017-06-30): `DDMMYY-CNNNK`
 *   DDMMYY = birth date, C = century digit (0 = 18xx, 1 = 19xx, 2 = 20xx),
 *   NNN = serial number, K = check digit.
 * - new (issued since 2017-07-01): `32XXXX-XXXXX`
 *   Starts with "32"; the law describes the remaining nine digits as random.
 *   It carries no birth date and the law defines no check digit, so by
 *   default none is verified. See {@link ValidateOptions.newFormatChecksum}.
 */

export type PersonasKodsFormat = "legacy" | "new";

export type PersonasKodsError =
  /** Input is not a string. */
  | "not_a_string"
  /** Not 11 digits, optionally written as 6 digits, a hyphen and 5 digits. */
  | "invalid_format"
  /** Legacy code whose century digit is not 0, 1 or 2. */
  | "invalid_century"
  /** Legacy code whose first six digits are not a real calendar date. */
  | "invalid_date"
  /** Last digit does not match the computed check digit. */
  | "invalid_checksum";

export interface ValidateOptions {
  /**
   * Also require new-format ("32") codes to carry a valid check digit,
   * computed the same way as for legacy codes. Defaults to `false`.
   *
   * The law only says the digits after "32" are random, so the default
   * accepts any of them. Some validators (python-stdnum, for one) do verify
   * the check digit. Turn this on to match them, at the risk of rejecting a
   * genuine code if the register does not in fact follow that rule.
   */
  newFormatChecksum?: boolean;
}

export type ValidationResult =
  | {
      valid: true;
      format: PersonasKodsFormat;
      /** The 11 digits without a hyphen. */
      digits: string;
      /** Canonical `XXXXXX-XXXXX` form. */
      formatted: string;
      /** ISO date (`YYYY-MM-DD`) for legacy codes, `null` for new ones. */
      birthDate: string | null;
    }
  | { valid: false; error: PersonasKodsError };

const SHAPE = /^(\d{6})-?(\d{5})$/;
const WEIGHTS = [1, 6, 3, 7, 9, 10, 5, 8, 4, 2] as const;
const CENTURIES: Record<string, number> = { "0": 1800, "1": 1900, "2": 2000 };

/** Check digit for the first ten digits of a code. */
export function checkDigit(firstTenDigits: string): number {
  if (typeof firstTenDigits !== "string" || !/^\d{10}$/.test(firstTenDigits)) {
    throw new TypeError("checkDigit expects exactly 10 digits");
  }
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(firstTenDigits[i]) * WEIGHTS[i]!;
  }
  return ((1101 - sum) % 11) % 10;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Validate a personal code and return what can be read from it. */
export function validate(input: unknown, options: ValidateOptions = {}): ValidationResult {
  if (typeof input !== "string") return { valid: false, error: "not_a_string" };

  const match = SHAPE.exec(input.trim());
  if (!match) return { valid: false, error: "invalid_format" };

  const digits = match[1]! + match[2]!;
  const formatted = `${match[1]}-${match[2]}`;

  const checksumOk = checkDigit(digits.slice(0, 10)) === Number(digits[10]);

  if (digits.startsWith("32")) {
    if (options.newFormatChecksum && !checksumOk) {
      return { valid: false, error: "invalid_checksum" };
    }
    return { valid: true, format: "new", digits, formatted, birthDate: null };
  }

  const century = CENTURIES[digits[6]!];
  if (century === undefined) return { valid: false, error: "invalid_century" };

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = century + Number(digits.slice(4, 6));
  if (!isRealDate(year, month, day)) return { valid: false, error: "invalid_date" };

  if (!checksumOk) return { valid: false, error: "invalid_checksum" };

  return {
    valid: true,
    format: "legacy",
    digits,
    formatted,
    birthDate: `${pad(year, 4)}-${pad(month)}-${pad(day)}`,
  };
}

/** `true` when the input is a valid personal code in either format. */
export function isValid(input: unknown, options?: ValidateOptions): boolean {
  return validate(input, options).valid;
}

/** Canonical `XXXXXX-XXXXX` form, or `null` when the code is invalid. */
export function format(input: unknown, options?: ValidateOptions): string | null {
  const result = validate(input, options);
  return result.valid ? result.formatted : null;
}

/**
 * Birth date as `YYYY-MM-DD`. `null` when the code is invalid or is a
 * new-format code, which does not encode a birth date.
 */
export function getBirthDate(input: unknown, options?: ValidateOptions): string | null {
  const result = validate(input, options);
  return result.valid ? result.birthDate : null;
}

export interface GenerateOptions {
  /** Which format to produce. Defaults to `"new"`. */
  format?: PersonasKodsFormat;
  /** Birth date for legacy codes, `YYYY-MM-DD`, 1800–2099. Random if omitted. */
  birthDate?: string;
  /** Include the hyphen. Defaults to `true`. */
  hyphen?: boolean;
  /** Random source returning a number in [0, 1). Defaults to `Math.random`. */
  random?: () => number;
}

/**
 * Generate a syntactically valid code for tests and fixtures. Codes in both
 * formats end in a valid check digit, so they also pass stricter validators.
 * The result is random and may coincide with a real person's code.
 */
export function generate(options: GenerateOptions = {}): string {
  const { format: kind = "new", hyphen = true, random = Math.random } = options;
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const randomDigits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join("");

  let digits: string;
  if (kind === "new") {
    if (options.birthDate !== undefined) {
      throw new RangeError("New-format codes do not encode a birth date");
    }
    const firstTen = "32" + randomDigits(8);
    digits = firstTen + checkDigit(firstTen);
  } else {
    let year: number, month: number, day: number;
    if (options.birthDate === undefined) {
      year = int(1900, 2016);
      month = int(1, 12);
      day = int(1, 28);
    } else {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(options.birthDate);
      if (!m) throw new RangeError("birthDate must be YYYY-MM-DD");
      [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (year < 1800 || year > 2099 || !isRealDate(year, month, day)) {
        throw new RangeError("birthDate must be a real date between 1800 and 2099");
      }
    }
    const firstTen =
      pad(day) + pad(month) + pad(year % 100) + String(Math.floor(year / 100) - 18) + randomDigits(3);
    digits = firstTen + checkDigit(firstTen);
  }
  return hyphen ? `${digits.slice(0, 6)}-${digits.slice(6)}` : digits;
}
