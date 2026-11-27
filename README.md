# yamlcage

`yamlcage` is a production-grade, zero-dependency YAML security library for
Node.js. It parses a strict YAML 1.2 Core Schema subset, audits hostile input
before trusting it, serializes safe canonical YAML, and ships a small CLI for
pipeline checks.

The package is intentionally strict. It is designed for configuration files,
CI input, workflow definitions, plugin settings, deployment manifests and
other YAML that must never execute constructors, expand exponentially, or
smuggle ambiguous duplicate state into an application.

This repository does not assert that the package is already available on the
public npm registry. Build and test it from source until a release is
published by the maintainers.

## Why YAML needs a cage

YAML is human friendly, but general-purpose YAML parsers historically expose
applications to several independent attack classes:

- **Billion Laughs and alias bombs, CWE-776.** Nested anchors and aliases can
  expand a tiny file into a huge object graph. `yamlcage` rejects anchors and
  aliases by default. If they are explicitly enabled, alias count, alias depth
  and expanded node count are all bounded.
- **Arbitrary object deserialization, CWE-502.** Tags such as `!!js/function`,
  `!!js/regexp`, `!!python/object/apply`, language-specific local tags,
  verbatim tags and `%TAG` directives can construct attacker-controlled types
  in permissive parsers. `yamlcage` rejects explicit tags by default and only
  permits scalar or collection type assertions from the YAML Core tag set when
  `allowSafeTags` is enabled.
- **Merge-key shadowing and pollution.** YAML 1.1 `<<` merge keys can hide
  where a key came from and have been abused in parser differentials.
  `yamlcage` rejects them by default. Explicit opt-in merge handling is
  deterministic, bounded and never overrides explicit keys.
- **Prototype pollution.** Keys named `__proto__`, `constructor` or
  `prototype` are rejected even when quoted or Unicode-escaped. Mappings are
  built with `Object.create(null)` rather than ordinary object prototypes.
- **Duplicate-key smuggling.** Duplicate keys are rejected recursively,
  including duplicates that differ only in quoting or escape syntax such as
  `role` and `"role"`.
- **The YAML 1.1 Norway problem.** YAML 1.1 treats `NO`, `yes`, `on`, `off`
  and similar words as booleans. YAML 1.2 Core Schema does not. `yamlcage`
  keeps them as strings and can report a warning so operators notice when a
  downstream YAML 1.1 parser might reinterpret them.
- **Multi-document smuggling.** `parseSafeYaml` accepts exactly one document.
  A second document is rejected unless the caller intentionally uses
  `parseSafeYamlDocuments` or enables multi-document auditing.
- **Resource exhaustion.** Input bytes, nesting depth, total nodes, keys per
  mapping, sequence length, string length, key length, document count, alias
  count, alias depth, alias-expanded nodes, audit findings and serialized
  output bytes all have explicit limits.
- **Encoding confusion.** Byte input is decoded with a fatal UTF-8 decoder.
  UTF-16 and UTF-32 byte order marks are rejected. UTF-8 byte order marks are
  rejected by default. Lone UTF-16 surrogates, raw control bytes and
  bidirectional control characters are rejected.

## Install and module format

The library has no runtime dependencies and no development dependencies. It
supports Node.js 18 and later, including Windows, through dual module exports:

```js
// ESM
import { parseSafeYaml, auditYaml } from 'yamlcage';
```

```js
// CommonJS
const { parseSafeYaml, auditYaml } = require('yamlcage');
```

TypeScript declarations are included in `types/index.d.ts`.

From a source checkout:

```sh
npm test
node scripts/build-cjs.mjs --check
node scripts/cli-smoke.mjs
npm pack --dry-run
```

## Quick start

```js
import { parseSafeYaml, auditYaml } from 'yamlcage';

const config = parseSafeYaml(`
service: api
country: NO
replicas: 3
features:
  - strict-routing
  - audit-logging
limits:
  memory: 512
  cpu: 1.5
`);

console.log(config.country); // "NO", not false
console.log(config.replicas); // 3

const report = auditYaml(`
base: &base
  admin: true
copy: *base
`);

console.log(report.safe); // false
console.log(report.findings[0].code); // YAMLCAGE_ANCHOR_FORBIDDEN
```

`parseSafeYaml` throws a `YamlCageError` with a stable `code` property.
`auditYaml` does not throw for hostile YAML. It returns a frozen report with
`safe`, `findings` and `stats`.

## Supported YAML subset

The parser intentionally supports a clean configuration-oriented subset of
YAML 1.2:

- Block mappings and block sequences
- Nested combinations of mappings and sequences, including compact sequence
  mappings such as `- name: worker`
- Indentless sequences directly below an empty mapping key
- Flow mappings such as `{a: 1, b: two}` and flow sequences such as `[1, 2]`
- Multiline flow collections
- Single-quoted strings with `''` escaping
- Double-quoted strings with `\n`, `\t`, `\r`, `\\`, `\"`, `\xXX`, `\uXXXX`
  and `\UXXXXXXXX`, plus the common YAML single-character escapes
- Literal block scalars `|`, `|-`, `|+`
- Folded block scalars `>`, `>-`, `>+`
- Indentation indicators on block scalars
- Comments beginning with `#` where YAML comment rules require them
- Multi-document streams split by `---` and `...` through
  `parseSafeYamlDocuments`
- A `%YAML 1.2` directive

The subset deliberately does not support every YAML production. Unsupported
or ambiguous syntax fails closed with `YAMLCAGE_SYNTAX_ERROR` rather than
being guessed at. Examples include explicit `?` keys, complex keys,
multiline plain or quoted scalars, language-specific tags and non-Core schema types.

## YAML 1.2 Core Schema rules

Only these spellings are booleans:

```yaml
true
True
TRUE
false
False
FALSE
```

Only these spellings are null:

```yaml
null
Null
NULL
~
```

An empty value is also null. These YAML 1.1 words remain strings:

```yaml
yes
no
y
n
on
off
NO
```

Numbers are strict:

- Decimal integers such as `10`, `-2` and `+42`
- Hexadecimal integers such as `0xff`
- YAML 1.2 octal integers such as `0o755`
- Decimal floats such as `1.5`, `.5`, `1.` and `1e3`
- `010` is decimal ten, never legacy octal eight
- `.nan`, `.inf` and `-.inf` are rejected unless `allowNonFinite` is enabled
- Overflowing nonzero literals such as `1e400` are rejected
- Nonzero literals that underflow to zero, such as `1e-400`, are rejected
- Integers outside the IEEE-754 safe integer range are rejected when
  `rejectUnsafeIntegers` is enabled

## API

### `parseSafeYaml(input, options?)`

Parses exactly one YAML document and returns plain JavaScript data containing
only null, booleans, numbers, strings, arrays and null-prototype mappings.

```js
parseSafeYaml('name: worker\n');
```

Multi-document input throws `YAMLCAGE_MULTI_DOCUMENT`. `input` may be a string
or a supported byte input.

### `parseSafeYamlBytes(bytes, options?)`

Decodes `Uint8Array`, `ArrayBuffer`, `SharedArrayBuffer` or an ArrayBuffer
view as fatal UTF-8, then applies the same single-document parser.

```js
parseSafeYamlBytes(new TextEncoder().encode('enabled: true\n'));
```

### `parseSafeYamlDocuments(input, options?)`

Parses a stream and returns an array of documents. `maxDocuments` still
applies. Every document is independently checked, while byte, node and alias
budgets apply to the stream as a whole.

### `auditYaml(input, options?)`

Audits input without requiring the caller to catch parser exceptions:

```js
const report = auditYaml('copy: *missing\n');

if (!report.safe) {
  for (const finding of report.findings) {
    console.error(finding.code, finding.line, finding.message);
  }
}
```

The returned object and findings array are frozen. A warning does not make the
report unsafe. An error finding does.

### `stringifySafeYaml(value, options?)`

Serializes null, booleans, finite numbers, strings, arrays and plain objects
to safe canonical YAML 1.2.

Strings that downstream YAML 1.1 or YAML 1.2 parsers could reinterpret are
always quoted. This includes `"yes"`, `"no"`, `"on"`, `"off"`, `"true"`,
`"null"` and `"010"`. Cycles, non-finite numbers, lone surrogates, dangerous
keys, class instances, functions, symbols, bigints and `undefined` are
rejected. Output is capped by `maxOutputBytes` in UTF-8 bytes. Serializer input
is also bounded by `maxDepth`, `maxKeys`, `maxSequenceLength`, `maxNodes`,
`maxStringLength` and `maxKeyLength`. Accessor properties are rejected without
being invoked, sparse arrays and arrays with extra enumerable properties are
rejected, and traversal uses memory proportional to nesting depth rather than
to sibling count.

```js
const yaml = stringifySafeYaml({ country: 'NO', enabled: true });
// country: "NO"
// enabled: true
```

### `createYamlCage(options?)`

Creates a frozen instance with vetted default options and methods `parse`,
`parseBytes`, `parseDocuments`, `audit` and `stringify`. Every method accepts
per-call overrides, which are validated again.

## Options

| Option | Default | Meaning |
| --- | ---: | --- |
| `maxBytes` | `1048576` | Maximum input size in UTF-8 bytes |
| `maxDepth` | `32` | Maximum collection nesting depth |
| `maxKeys` | `1000` | Maximum keys in one mapping |
| `maxSequenceLength` | `10000` | Maximum entries in one sequence |
| `maxNodes` | `50000` | Maximum conservatively counted YAML nodes in a stream |
| `maxStringLength` | `65536` | Maximum string scalar size in UTF-8 bytes |
| `maxKeyLength` | `256` | Maximum mapping key size in UTF-8 bytes |
| `maxDocuments` | `16` | Maximum documents in a stream |
| `maxAliases` | `25` | Maximum alias references when aliases are enabled |
| `maxAliasDepth` | `4` | Maximum nested alias expansion chain when aliases are enabled |
| `maxExpandedNodes` | `5000` | Maximum nodes copied through aliases when aliases are enabled |
| `maxOutputBytes` | `1048576` | Maximum serializer output size in UTF-8 bytes |
| `maxFindings` | `1024` | Maximum audit findings retained before the report fails closed |
| `allowAliases` | `false` | Permit anchors and aliases under strict expansion limits |
| `allowMergeKeys` | `false` | Permit deterministic YAML merge keys |
| `allowSafeTags` | `false` | Permit only `!!str`, `!!int`, `!!float`, `!!bool`, `!!null`, `!!map` and `!!seq` |
| `allowNonFinite` | `false` | Permit `.nan`, `.inf` and `-.inf` |
| `rejectUnsafeIntegers` | `false` | Reject integers outside the safe integer range |
| `rejectBom` | `true` | Reject a UTF-8 byte order mark |
| `warnNorwayScalars` | `true` | Record warnings for YAML 1.1 boolean words parsed as strings |
| `strictNorwayScalars` | `false` | Treat Norway ambiguity warnings as audit errors |
| `allowMultiDocument` | `false` | Permit multiple documents in `auditYaml` |

Unknown option keys, non-boolean booleans and non-integer numeric limits throw
`YAMLCAGE_INVALID_OPTIONS`.

## Anchors and aliases

Anchors and aliases are rejected by default even if they are never expanded:

```js
parseSafeYaml('x: &a 1\n'); // YAMLCAGE_ANCHOR_FORBIDDEN
parseSafeYaml('x: *a\n'); // YAMLCAGE_ALIAS_FORBIDDEN
```

Explicit opt-in does not disable the resource cage:

```js
parseSafeYaml('base: &x [1, 2]\ncopy: *x\n', {
  allowAliases: true,
  maxAliases: 25,
  maxAliasDepth: 4,
  maxExpandedNodes: 5000
});
```

Aliases are deep-copied so later mutation of one output mapping cannot mutate
another copy. Recursive references, unknown anchors, duplicate anchors,
excessive alias counts, deep chains and expansion beyond the node budget are
rejected.

## Merge keys

Merge keys are rejected by default:

```yaml
<<: {admin: true}
```

When `allowMergeKeys` is enabled, a merge value must be a mapping or a
sequence of mappings. Explicit keys always win. Earlier mappings in a merge
sequence take precedence over later mappings. Dangerous and duplicate keys
remain forbidden.

## CLI

```sh
yamlcage check file.yml
yamlcage check file.yml --json
yamlcage check file.yml --max-bytes 65536 --max-depth 16
yamlcage check - --multi-doc < stream.yml
yamlcage to-json file.yml
yamlcage to-json file.yml --strict-integers
```

Exit codes:

| Code | Meaning |
| ---: | --- |
| `0` | Input is safe, or conversion succeeded |
| `1` | YAML security or validation failure |
| `2` | Usage, file type, symlink or input/output error |

The CLI uses `lstat`, conditional `O_NOFOLLOW` and `O_NONBLOCK`, and `fstat`
for regular file input. Directories, devices, FIFOs and symlinks are rejected.
Standard input is read with the same byte cap. Terminal-facing errors are
neutralized for ANSI control characters, line-breaking control characters and
bidirectional control characters.

## Finding and error codes

| Code | Meaning |
| --- | --- |
| `YAMLCAGE_ALIAS_FORBIDDEN` | Alias use is forbidden by policy |
| `YAMLCAGE_ANCHOR_FORBIDDEN` | Anchor use is forbidden by policy |
| `YAMLCAGE_UNSAFE_TAG` | An explicit tag or `%TAG` directive is forbidden |
| `YAMLCAGE_MERGE_KEY_FORBIDDEN` | A merge key or invalid merge shape is forbidden |
| `YAMLCAGE_DUPLICATE_KEY` | A mapping key appears more than once |
| `YAMLCAGE_PROTOTYPE_KEY` | A key can mutate object prototypes |
| `YAMLCAGE_MULTI_DOCUMENT` | A stream contains more than one document where one is required |
| `YAMLCAGE_NON_FINITE_NUMBER` | A number is non-finite, overflows, or nonzero input underflows to zero |
| `YAMLCAGE_MAX_DEPTH` | Collection nesting depth exceeded |
| `YAMLCAGE_MAX_BYTES` | Input byte budget exceeded |
| `YAMLCAGE_MAX_NODES` | Node budget exceeded |
| `YAMLCAGE_MAX_KEYS` | Mapping key budget exceeded |
| `YAMLCAGE_MAX_SEQUENCE_LENGTH` | Sequence length budget exceeded |
| `YAMLCAGE_MAX_STRING_LENGTH` | String scalar budget exceeded |
| `YAMLCAGE_MAX_KEY_LENGTH` | Mapping key budget exceeded |
| `YAMLCAGE_MAX_DOCUMENTS` | Document count budget exceeded |
| `YAMLCAGE_MAX_ALIASES` | Alias count budget exceeded |
| `YAMLCAGE_MAX_ALIAS_DEPTH` | Alias chain depth budget exceeded |
| `YAMLCAGE_MAX_EXPANDED_NODES` | Alias-expanded node budget exceeded |
| `YAMLCAGE_LONE_SURROGATE` | Input or output contains a lone UTF-16 surrogate |
| `YAMLCAGE_INVALID_UTF8` | Byte input is not valid UTF-8 or uses a UTF-16/UTF-32 BOM |
| `YAMLCAGE_SYNTAX_ERROR` | Input is outside the supported YAML syntax or is malformed |
| `YAMLCAGE_NORWAY_AMBIGUITY_WARN` | A string is safe in YAML 1.2 but ambiguous to YAML 1.1 parsers |
| `YAMLCAGE_UNSAFE_INTEGER` | Integer is outside the safe integer range |
| `YAMLCAGE_BOM_REJECTED` | UTF-8 BOM rejected by policy |
| `YAMLCAGE_CONTROL_CHARACTER` | Raw NUL or forbidden control byte is present |
| `YAMLCAGE_INVALID_INPUT` | Input type is unsupported |
| `YAMLCAGE_INVALID_OPTIONS` | Option object is unknown or malformed |
| `YAMLCAGE_UNDEFINED_ALIAS` | Alias references an unknown anchor |
| `YAMLCAGE_ALIAS_CYCLE` | Recursive alias expansion detected |
| `YAMLCAGE_DUPLICATE_ANCHOR` | Anchor name is defined more than once in a document |
| `YAMLCAGE_TAG_TYPE_MISMATCH` | A safe explicit tag does not match its node type |
| `YAMLCAGE_UNSUPPORTED_VALUE` | Serializer input is outside the safe data model |
| `YAMLCAGE_CYCLE_DETECTED` | Serializer input contains a cycle |
| `YAMLCAGE_MAX_OUTPUT_BYTES` | Serializer output budget exceeded |
| `YAMLCAGE_MAX_FINDINGS` | Audit finding output reached the reporting cap |

## Error handling

```js
import { YamlCageError, parseSafeYaml } from 'yamlcage';

try {
  parseSafeYaml('a: 1\na: 2\n');
} catch (error) {
  if (error instanceof YamlCageError) {
    console.error(error.code, error.line, error.column, error.reason);
  } else {
    throw error;
  }
}
```

Error objects serialize cleanly with `toJSON()` and never expose input file
contents beyond small semantic details such as a key, tag, anchor or alias
name.

## Security posture

`yamlcage` fails closed. Unsupported YAML is not approximated. Security
policy is enforced during parsing rather than by trusting applications to
post-process a dangerous object graph. The implementation uses bounded loops
for flow collections, alias copying and serialization, and depth checks occur
before nested parsing work.

No parser can guarantee that a different downstream YAML implementation will
interpret the same bytes identically. For highest assurance, either use
`yamlcage` as the only parser or serialize accepted data with
`stringifySafeYaml` before passing it onward. Bidirectional formatting
controls are rejected rather than merely hidden, because visually reordered
configuration text can conceal hostile structure from reviewers.

## Contributing

See `CONTRIBUTING.md`. Security reports should follow `SECURITY.md` and must
not be filed as public issues.
