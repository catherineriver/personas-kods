# personas-kods

[![CI](https://github.com/catherineriver/personas-kods/actions/workflows/ci.yml/badge.svg)](https://github.com/catherineriver/personas-kods/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Validate, parse, format and generate Latvian personal codes (*personas kods*).
Zero dependencies, TypeScript types included.

Supports both formats in circulation:

| Format | Issued | Shape | Birth date | Check digit |
|---|---|---|---|---|
| `legacy` | until 2017-06-30 | `DDMMYY-CNNNK` | yes | yes |
| `new` | since 2017-07-01 | `32XXXX-XXXXX` | no | not required (optional check) |

Many validators reject new-format codes because they look for a date in the
first six digits. This one does not.

## Why

Since 1 July 2017 Latvia issues personal codes that start with `32` and carry
no birth date. Validators written for the old `DDMMYY-CNNNK` layout look for a
date in the first six digits and reject these codes, even though they are
valid. This package handles both formats.

## Install

```sh
npm install personas-kods
```

ESM only, Node 20+. `require("personas-kods")` works on Node 22.12+.

## Usage

```js
import { isValid, validate, format, getBirthDate, generate } from "personas-kods";

isValid("161175-19997"); // true
isValid("16117519997");  // true (hyphen is optional)
isValid("323456-78901"); // true (new format)

validate("161175-19997");
// { valid: true, format: "legacy", digits: "16117519997",
//   formatted: "161175-19997", birthDate: "1975-11-16" }

validate("161175-19998");
// { valid: false, error: "invalid_checksum" }

format("16117519997");        // "161175-19997"
getBirthDate("161175-19997"); // "1975-11-16"
getBirthDate("323456-78901"); // null

generate();                                            // "32XXXX-XXXXX"
generate({ format: "legacy", birthDate: "1990-05-17" }); // "170590-1XXXX"
```

## API

| Function | Returns | Purpose |
|---|---|---|
| [`validate(input, options?)`](#validateinput-options) | `ValidationResult` | Full verdict with details or the reason for rejection |
| [`isValid(input, options?)`](#isvalidinput-options) | `boolean` | Quick yes/no |
| [`format(input, options?)`](#formatinput-options) | `string \| null` | Canonical `XXXXXX-XXXXX` form |
| [`getBirthDate(input, options?)`](#getbirthdateinput-options) | `string \| null` | Birth date from a legacy code |
| [`generate(options?)`](#generateoptions) | `string` | Random valid code for tests |
| [`checkDigit(firstTenDigits)`](#checkdigitfirsttendigits) | `number` | Check digit for the first ten digits |

`validate`, `isValid`, `format` and `getBirthDate` never throw, whatever you
pass in. Anything that is not a string is simply invalid.

### Validation options

Shared by `validate`, `isValid`, `format` and `getBirthDate`.

| Option | Type | Default | Description |
|---|---|---|---|
| `newFormatChecksum` | `boolean` | `false` | Also require new-format (`32…`) codes to end in a valid check digit. See [How the rules work](#how-the-rules-work). |

### `validate(input, options?)`

```ts
validate(input: unknown, options?: ValidateOptions): ValidationResult
```

Leading and trailing whitespace is ignored. Nothing else is: spaces inside
the code, or a hyphen in the wrong place, make it `invalid_format`.

**Valid result**

| Field | Type | Description |
|---|---|---|
| `valid` | `true` | |
| `format` | `"legacy" \| "new"` | Which kind of code it is |
| `digits` | `string` | The 11 digits, no hyphen |
| `formatted` | `string` | Canonical `XXXXXX-XXXXX` |
| `birthDate` | `string \| null` | `YYYY-MM-DD` for legacy codes, `null` for new ones |

**Invalid result**: `{ valid: false, error }`

| `error` | Meaning |
|---|---|
| `not_a_string` | Input is not a string |
| `invalid_format` | Not 11 digits, optionally written as `XXXXXX-XXXXX` |
| `invalid_century` | Legacy code, century digit is not 0, 1 or 2 |
| `invalid_date` | Legacy code, first six digits are not a real date |
| `invalid_checksum` | Check digit does not match |

```js
validate("161175-19997");
// { valid: true, format: "legacy", digits: "16117519997",
//   formatted: "161175-19997", birthDate: "1975-11-16" }

validate("161175-19998");
// { valid: false, error: "invalid_checksum" }
```

### `isValid(input, options?)`

```ts
isValid(input: unknown, options?: ValidateOptions): boolean
```

`true` when the code is valid in either format.

```js
isValid("16117519997");  // true
isValid("323456-78901"); // true
isValid("161375-19997"); // false (month 13)
```

### `format(input, options?)`

```ts
format(input: unknown, options?: ValidateOptions): string | null
```

Canonical `XXXXXX-XXXXX` form, or `null` if the code is invalid.

```js
format("16117519997"); // "161175-19997"
format("nope");        // null
```

### `getBirthDate(input, options?)`

```ts
getBirthDate(input: unknown, options?: ValidateOptions): string | null
```

Birth date as `YYYY-MM-DD` for a valid legacy code. `null` for invalid codes
and for new-format codes, which do not encode a date.

```js
getBirthDate("161175-19997"); // "1975-11-16"
getBirthDate("323456-78901"); // null
```

### `generate(options?)`

```ts
generate(options?: GenerateOptions): string
```

Random syntactically valid code for tests and fixtures. Codes in both formats
end in a valid check digit, so they pass stricter validators too. Throws
`RangeError` on invalid options.

| Option | Type | Default | Description |
|---|---|---|---|
| `format` | `"new" \| "legacy"` | `"new"` | Which kind of code to produce |
| `birthDate` | `string` | random | `YYYY-MM-DD`, 1800 to 2099. Legacy only; passing it with `"new"` throws |
| `hyphen` | `boolean` | `true` | Include the hyphen |
| `random` | `() => number` | `Math.random` | Random source returning a number in `[0, 1)`, for deterministic output |

```js
generate();                                              // "32XXXX-XXXXX"
generate({ format: "legacy", birthDate: "1990-05-17" }); // "170590-1XXXX"
generate({ hyphen: false });                             // "32XXXXXXXXX"
```

> [!WARNING]
> A generated code may coincide with a real person's code. Use it for test
> data only.

### `checkDigit(firstTenDigits)`

```ts
checkDigit(firstTenDigits: string): number
```

Check digit (0 to 9) for the first ten digits of a code. Throws `TypeError`
unless given exactly ten digits.

```js
checkDigit("1611751999"); // 7
```

## How the rules work

**Legacy.** `DDMMYY` is the birth date. The seventh digit is the century:
`0` = 18xx, `1` = 19xx, `2` = 20xx. The last digit is a check digit:

```
weights = 1 6 3 7 9 10 5 8 4 2
K = (1101 − Σ digitᵢ × weightᵢ) mod 11 mod 10
```

**New.** Under the Law on the Register of Natural Persons the code starts
with `32` and the other nine digits are "randomly generated by the system".
The law defines no check digit, so by default any `32` + 9 digits passes.

Implementations disagree here: validator.js accepts any `32` code, while
python-stdnum requires the last digit to be a check digit computed with the
legacy formula. Pass `{ newFormatChecksum: true }` to apply the stricter
rule. It catches more typos, but would reject a genuine code if the register
does not actually follow that rule, which is why it is off by default.

## Testing

```sh
npm install
npm test
```

The suite checks the published reference vectors, compares the check digit
with two independently written formulations over 200,000 inputs, walks
every calendar day from 1800 to 2099 and every `DDMMYY` × century
combination against the platform's own date logic, and installs the packed
tarball into a throwaway project to exercise ESM, CommonJS and TypeScript
consumers.

## What this does not do

A valid result means the code is well formed. It does not mean the code has
been issued to anyone. Only the Register of Natural Persons (PMLP) can
confirm that.

## License

MIT
