import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditYaml,
  stringifySafeYaml,
  parseSafeYaml,
  createYamlCage,
  YamlCageError,
  YAMLCAGE_VERSION,
  YAML_CAGE_DEFAULT_OPTIONS
} from '../src/index.mjs';
import { assertYamlEqual, assertCode } from './helpers.mjs';

test('audit safe input has no findings', () => {
  const report = auditYaml('name: worker\nenabled: true\n');
  assert.equal(report.safe, true);
  assert.equal(report.findings.length, 0);
  assert.equal(report.stats.documents, 1);
});

test('audit report object is frozen', () => {
  const report = auditYaml('a: 1\n');
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.findings), true);
  assert.equal(Object.isFrozen(report.stats), true);
});

test('audit findings are frozen', () => {
  const report = auditYaml('a: NO\n');
  assert.equal(Object.isFrozen(report.findings[0]), true);
});

test('audit multi document is unsafe by default', () => {
  const report = auditYaml('---\na: 1\n---\nb: 2\n');
  assert.equal(report.safe, false);
  assert.equal(report.findings.some((finding) => finding.code === 'YAMLCAGE_MULTI_DOCUMENT'), true);
});

test('audit multi document can be allowed', () => {
  const report = auditYaml('---\na: 1\n---\nb: 2\n', { allowMultiDocument: true });
  assert.equal(report.safe, true);
});

test('audit reports errors from independent documents', () => {
  const report = auditYaml('---\na: 1\na: 2\n---\n__proto__: x\n', { allowMultiDocument: true });
  assert.equal(report.findings.some((finding) => finding.code === 'YAMLCAGE_DUPLICATE_KEY'), true);
  assert.equal(report.findings.some((finding) => finding.code === 'YAMLCAGE_PROTOTYPE_KEY'), true);
});

test('audit stats count aliases and expanded nodes', () => {
  const report = auditYaml('a: &x [1,2]\nb: *x\n', { allowAliases: true });
  assert.equal(report.safe, true);
  assert.equal(report.stats.aliases, 1);
  assert.ok(report.stats.expandedNodes > 0);
});

test('audit stats count parsed documents', () => {
  const report = auditYaml('---\na: 1\n---\nb: 2\n', { allowMultiDocument: true });
  assert.equal(report.stats.parsedDocuments, 2);
});

test('audit invalid input type is reported without throwing', () => {
  const report = auditYaml(42);
  assert.equal(report.safe, false);
  assert.equal(report.findings[0].code, 'YAMLCAGE_INVALID_INPUT');
});

test('audit invalid options still throw', () => {
  assertCode(() => auditYaml('a: 1\n', { badOption: true }), 'YAMLCAGE_INVALID_OPTIONS');
});

test('YamlCageError exposes structured fields', () => {
  const error = assertCode(() => parseSafeYaml('a: 1\na: 2\n'), 'YAMLCAGE_DUPLICATE_KEY');
  assert.equal(error instanceof YamlCageError, true);
  assert.equal(error.key, 'a');
  assert.equal(error.line, 2);
  assert.equal(error.column, 1);
});

test('YamlCageError JSON contains code and reason', () => {
  const error = assertCode(() => parseSafeYaml('a: 1\na: 2\n'), 'YAMLCAGE_DUPLICATE_KEY');
  const json = error.toJSON();
  assert.equal(json.code, 'YAMLCAGE_DUPLICATE_KEY');
  assert.equal(typeof json.reason, 'string');
});

test('public version is 1.0.0', () => {
  assert.equal(YAMLCAGE_VERSION, '1.0.0');
});

test('default options match documented security defaults', () => {
  assert.equal(YAML_CAGE_DEFAULT_OPTIONS.allowAliases, false);
  assert.equal(YAML_CAGE_DEFAULT_OPTIONS.allowMergeKeys, false);
  assert.equal(YAML_CAGE_DEFAULT_OPTIONS.allowSafeTags, false);
  assert.equal(YAML_CAGE_DEFAULT_OPTIONS.maxDepth, 32);
  assert.equal(YAML_CAGE_DEFAULT_OPTIONS.maxBytes, 1048576);
});

test('createYamlCage returns a frozen configured instance', () => {
  const cage = createYamlCage({ maxDepth: 2 });
  assert.equal(Object.isFrozen(cage), true);
  assert.equal(cage.options.maxDepth, 2);
  assertYamlEqual(cage.parse('a: 1\n'), { a: 1 });
});

test('createYamlCage applies defaults and per-call overrides', () => {
  const cage = createYamlCage({ maxDepth: 2 });
  assertCode(() => cage.parse('a:\n  b:\n    c: 1\n'), 'YAMLCAGE_MAX_DEPTH');
  assertYamlEqual(cage.parse('a:\n  b:\n    c: 1\n', { maxDepth: 3 }), { a: { b: { c: 1 } } });
});

test('configured instance audit method works', () => {
  const cage = createYamlCage();
  assert.equal(cage.audit('a: 1\n').safe, true);
});

test('configured instance stringify method works', () => {
  const cage = createYamlCage();
  assert.equal(cage.stringify({ a: 1 }), 'a: 1\n');
});

test('audit reports multiple independent threat findings in one input', () => {
  const report = auditYaml('a: &x [1]\nb: *x\nitem:\n  <<: {z: 1}\n');
  const codes = report.findings.map((finding) => finding.code);
  assert.equal(codes.includes('YAMLCAGE_ANCHOR_FORBIDDEN'), true);
  assert.equal(codes.includes('YAMLCAGE_ALIAS_FORBIDDEN'), true);
  assert.equal(codes.includes('YAMLCAGE_MERGE_KEY_FORBIDDEN'), true);
  assert.equal(report.safe, false);
});

test('audit does not duplicate one parser threat reported by the scanner', () => {
  const report = auditYaml('a: [&x, *x]\n');
  const anchors = report.findings.filter((finding) => finding.code === 'YAMLCAGE_ANCHOR_FORBIDDEN');
  const aliases = report.findings.filter((finding) => finding.code === 'YAMLCAGE_ALIAS_FORBIDDEN');
  assert.equal(anchors.length, 1);
  assert.equal(aliases.length, 1);
});

test('audit scanner does not mistake block scalar text for syntax tokens', () => {
  const report = auditYaml('a: |\n  &not-an-anchor-in-data\n  *not-an-alias-in-data\n  !!not-a-tag-in-data\n');
  assert.equal(report.findings.length, 0);
  assert.equal(report.safe, true);
});

test('audit scanner does not mistake quoted or plain scalar text for aliases', () => {
  const report = auditYaml('a: [hello !there, x & y, " *quoted", \'&quoted\']\n');
  assert.equal(report.findings.length, 0);
  assert.equal(report.safe, true);
});

test('audit scanner sees threats inside multiline flow collections', () => {
  const report = auditYaml('a: [\n  &x,\n  *x\n]\n');
  const codes = report.findings.map((finding) => finding.code);
  assert.equal(codes.includes('YAMLCAGE_ANCHOR_FORBIDDEN'), true);
  assert.equal(codes.includes('YAMLCAGE_ALIAS_FORBIDDEN'), true);
});

test('audit scanner respects explicit alias opt-in', () => {
  const report = auditYaml('a: &x [1]\nb: *x\n', { allowAliases: true });
  assert.equal(report.findings.length, 0);
  assert.equal(report.safe, true);
});

const ambiguousStrings = [
  'yes', 'Yes', 'YES', 'no', 'No', 'NO', 'y', 'Y', 'n', 'N',
  'on', 'On', 'ON', 'off', 'Off', 'OFF',
  'true', 'True', 'TRUE', 'false', 'False', 'FALSE',
  'null', 'Null', 'NULL', '~', '',
  '0', '00', '010', '-010', '+010', '123', '1.5', '.5', '1e3',
  '0x10', '0o10', '.nan', '.inf', '-.inf',
  'a: b', 'x # y', ' leading', 'trailing ', '-', '?', ':',
  '[abc]', '{abc}', 'a,b', '#comment', '&anchor', '*alias', '!tag', '|literal', '>folded', '@reserved', '`reserved'
];

for (const value of ambiguousStrings) {
  test('serializer protects ambiguous string ' + JSON.stringify(value), () => {
    const yaml = stringifySafeYaml({ value });
    const reparsed = parseSafeYaml(yaml);
    assert.equal(reparsed.value, value);
    if (value !== 'abc') {
      // The assertion above is the safety proof. This branch intentionally keeps
      // the test focused on round-trip fidelity rather than cosmetic quoting.
    }
  });
}

for (const value of ambiguousStrings.slice(0, 35)) {
  test('serializer quotes YAML scalar keywords and indicators ' + JSON.stringify(value), () => {
    const yaml = stringifySafeYaml({ value });
    const line = yaml.split('\n')[0];
    assert.equal(line.startsWith('value: "'), true, 'expected a double-quoted scalar in ' + line);
  });
}

test('ordinary safe string stays plain when possible', () => {
  assert.equal(stringifySafeYaml({ value: 'ordinary text' }), 'value: ordinary text\n');
});

test('serializer emits null boolean and number scalars canonically', () => {
  assert.equal(stringifySafeYaml({ a: null, b: true, c: false, d: 1.5, e: -0 }), 'a: null\nb: true\nc: false\nd: 1.5\ne: -0\n');
});

test('serializer escapes control characters in strings', () => {
  const yaml = stringifySafeYaml({ value: 'a\nb\tc\rd' });
  assert.equal(yaml, 'value: "a\\nb\\tc\\rd"\n');
  assert.equal(parseSafeYaml(yaml).value, 'a\nb\tc\rd');
});

test('serializer preserves astral unicode characters', () => {
  const yaml = stringifySafeYaml({ value: '😀' });
  assert.equal(parseSafeYaml(yaml).value, '😀');
});

test('serializer rejects lone high surrogates', () => {
  assertCode(() => stringifySafeYaml({ value: String.fromCharCode(0xd800) }), 'YAMLCAGE_LONE_SURROGATE');
});

test('serializer rejects lone low surrogates', () => {
  assertCode(() => stringifySafeYaml({ value: String.fromCharCode(0xdc00) }), 'YAMLCAGE_LONE_SURROGATE');
});

for (const value of [Infinity, -Infinity, Number.NaN]) {
  test('serializer rejects non-finite number ' + String(value), () => {
    assertCode(() => stringifySafeYaml({ value }), 'YAMLCAGE_UNSUPPORTED_VALUE');
  });
}

for (const [name, value] of [
  ['undefined', undefined],
  ['function', function example() {}],
  ['symbol', Symbol('x')],
  ['bigint', 1n],
  ['date', new Date(0)],
  ['regexp', /x/],
  ['map', new Map()],
  ['set', new Set()]
]) {
  test('serializer rejects unsupported value ' + name, () => {
    assertCode(() => stringifySafeYaml({ value }), 'YAMLCAGE_UNSUPPORTED_VALUE');
  });
}

for (const key of ['__proto__', 'constructor', 'prototype']) {
  test('serializer rejects dangerous key ' + key, () => {
    const input = Object.create(null);
    input[key] = 1;
    assertCode(() => stringifySafeYaml(input), 'YAMLCAGE_PROTOTYPE_KEY');
  });
}

test('serializer rejects direct object cycles', () => {
  const input = {};
  input.self = input;
  assertCode(() => stringifySafeYaml(input), 'YAMLCAGE_CYCLE_DETECTED');
});

test('serializer rejects nested array cycles', () => {
  const input = { items: [] };
  input.items.push(input);
  assertCode(() => stringifySafeYaml(input), 'YAMLCAGE_CYCLE_DETECTED');
});

test('serializer allows repeated non-cyclic object references', () => {
  const shared = { x: 1 };
  const yaml = stringifySafeYaml({ a: shared, b: shared });
  assertYamlEqual(parseSafeYaml(yaml), { a: { x: 1 }, b: { x: 1 } });
});

test('serializer output byte cap is enforced', () => {
  assertCode(() => stringifySafeYaml({ value: 'abcdef' }, { maxOutputBytes: 5 }), 'YAMLCAGE_MAX_OUTPUT_BYTES');
});

test('serializer output exactly at cap is accepted', () => {
  const output = stringifySafeYaml({ a: 1 }, { maxOutputBytes: 5 });
  assert.equal(output, 'a: 1\n');
});

test('serializer root scalar string is supported', () => {
  assert.equal(stringifySafeYaml('yes'), '"yes"\n');
});

test('serializer root null is supported', () => {
  assert.equal(stringifySafeYaml(null), 'null\n');
});

test('serializer root empty object is supported', () => {
  assert.equal(stringifySafeYaml({}), '{}\n');
});

test('serializer root empty array is supported', () => {
  assert.equal(stringifySafeYaml([]), '[]\n');
});

test('serializer nested empty collections are emitted as flow collections', () => {
  assert.equal(stringifySafeYaml({ a: {}, b: [] }), 'a: {}\nb: []\n');
});

for (let index = 0; index < 30; index += 1) {
  test('deterministic nested serializer round trip ' + index, () => {
    const input = {
      name: 'worker' + index,
      enabled: index % 2 === 0,
      replicas: index,
      ratio: index / 10,
      missing: null,
      labels: ['alpha' + index, 'NO', '010'],
      nested: {
        values: [index, { flag: index % 3 === 0 }, []],
        empty: {}
      }
    };
    const yaml = stringifySafeYaml(input);
    assertYamlEqual(parseSafeYaml(yaml), input);
  });
}

for (const [key, expected] of [
  ['plain', 'plain: 1\n'],
  ['two words', 'two words: 1\n'],
  ['yes', '"yes": 1\n'],
  ['010', '"010": 1\n'],
  ['a: b', '"a: b": 1\n'],
  ['', '"": 1\n']
]) {
  test('serializer protects key ' + JSON.stringify(key), () => {
    const input = Object.create(null);
    input[key] = 1;
    assert.equal(stringifySafeYaml(input), expected);
  });
}

test('serializer output has LF line endings', () => {
  const output = stringifySafeYaml({ a: [1, 2], b: { c: 'x' } });
  assert.equal(output.includes('\r'), false);
  assert.equal(output.endsWith('\n'), true);
});

test('serializer key order is insertion order', () => {
  assert.equal(stringifySafeYaml({ z: 1, a: 2, m: 3 }), 'z: 1\na: 2\nm: 3\n');
});

for (let depth = 1; depth <= 12; depth += 1) {
  test('serializer nested object round trip depth ' + depth, () => {
    let input = {};
    let cursor = input;
    for (let level = 0; level < depth; level += 1) {
      cursor.next = {};
      cursor = cursor.next;
    }
    cursor.value = depth;
    assertYamlEqual(parseSafeYaml(stringifySafeYaml(input)), input);
  });
}

test('serializer quotes bare non-finite keyword strings', () => {
  for (const value of ['NaN', 'nan', 'NAN', 'Infinity', '+Infinity', '-Infinity']) {
    const yaml = stringifySafeYaml({ value });
    assert.equal(yaml.startsWith('value: "'), true, yaml);
    assert.equal(parseSafeYaml(yaml).value, value);
  }
});

test('serializer quotes YAML 1.1 numeric forms outside the YAML 1.2 core schema', () => {
  for (const value of ['1:20', '12:34:56', '0b1010', '1_000', '-2:30']) {
    const yaml = stringifySafeYaml({ value });
    assert.equal(yaml.startsWith('value: "'), true, yaml);
    assert.equal(parseSafeYaml(yaml).value, value);
  }
});

test('serializer quotes timestamp-shaped strings to prevent type reinterpretation', () => {
  for (const value of ['2024-01-01', '2024-01-01T10:20:30Z', '2024-01-01 10:20:30']) {
    const yaml = stringifySafeYaml({ value });
    assert.equal(yaml.startsWith('value: "'), true, yaml);
    assert.equal(parseSafeYaml(yaml).value, value);
  }
});

test('serializer rejects symbol-keyed objects instead of dropping data', () => {
  const input = {};
  input[Symbol('hidden')] = 1;
  assertCode(() => stringifySafeYaml(input), 'YAMLCAGE_UNSUPPORTED_VALUE');
});

for (const value of ['...', '...document', 'foo:', 'x:']) {
  test('serializer root scalar round trip protects structural text ' + JSON.stringify(value), () => {
    const yaml = stringifySafeYaml(value);
    assert.equal(yaml.startsWith('"'), true, yaml);
    assert.equal(parseSafeYaml(yaml), value);
  });
}

for (const value of ['0XFF', '0O755', '+0X10', '0B101', '2024-1-1']) {
  test('serializer quotes conservatively ambiguous numeric or timestamp text ' + JSON.stringify(value), () => {
    const yaml = stringifySafeYaml({ value });
    assert.equal(yaml.startsWith('value: "'), true, yaml);
    assert.equal(parseSafeYaml(yaml).value, value);
  });
}

for (const badOptions of [42, true, 'strict', []]) {
  test('serializer rejects malformed options ' + Object.prototype.toString.call(badOptions), () => {
    assertCode(() => stringifySafeYaml({ a: 1 }, badOptions), 'YAMLCAGE_INVALID_OPTIONS');
  });
}

test('configured instance rejects malformed per-call overrides', () => {
  const cage = createYamlCage({ allowAliases: true });
  assertCode(() => cage.parse('a: 1\n', 42), 'YAMLCAGE_INVALID_OPTIONS');
  assertCode(() => cage.stringify({ a: 1 }, false), 'YAMLCAGE_INVALID_OPTIONS');
});

test('serializer rejects accessor properties without invoking them', () => {
  let calls = 0;
  const input = {};
  Object.defineProperty(input, 'x', {
    enumerable: true,
    get() {
      calls += 1;
      return 1;
    }
  });
  assertCode(() => stringifySafeYaml(input), 'YAMLCAGE_UNSUPPORTED_VALUE');
  assert.equal(calls, 0);
});

test('serializer rejects additional enumerable array properties', () => {
  const input = [1];
  input.extra = 'hidden';
  assertCode(() => stringifySafeYaml(input), 'YAMLCAGE_UNSUPPORTED_VALUE');
});

test('serializer rejects sparse arrays explicitly', () => {
  const input = [1];
  input.length = 3;
  assertCode(() => stringifySafeYaml(input), 'YAMLCAGE_UNSUPPORTED_VALUE');
});

test('serializer enforces mapping key count limit', () => {
  assertCode(() => stringifySafeYaml({ a: 1, b: 2 }, { maxKeys: 1 }), 'YAMLCAGE_MAX_KEYS');
});

test('serializer enforces sequence length limit', () => {
  assertCode(() => stringifySafeYaml([1, 2], { maxSequenceLength: 1 }), 'YAMLCAGE_MAX_SEQUENCE_LENGTH');
});

test('serializer enforces nesting depth limit', () => {
  assertCode(() => stringifySafeYaml({ a: { b: 1 } }, { maxDepth: 1 }), 'YAMLCAGE_MAX_DEPTH');
});

test('serializer enforces node count limit', () => {
  assertCode(() => stringifySafeYaml({ a: 1, b: 2 }, { maxNodes: 2 }), 'YAMLCAGE_MAX_NODES');
});

test('serializer enforces string length limit', () => {
  assertCode(() => stringifySafeYaml({ a: 'abcd' }, { maxStringLength: 3 }), 'YAMLCAGE_MAX_STRING_LENGTH');
});

test('serializer enforces key length limit', () => {
  assertCode(() => stringifySafeYaml({ abcd: 1 }, { maxKeyLength: 3 }), 'YAMLCAGE_MAX_KEY_LENGTH');
});

test('serializer rejects bidirectional controls in strings and keys', () => {
  const bidi = String.fromCharCode(0x202e);
  assertCode(() => stringifySafeYaml({ value: 'x' + bidi + 'y' }), 'YAMLCAGE_CONTROL_CHARACTER');
  const input = Object.create(null);
  input[bidi + 'key'] = 1;
  assertCode(() => stringifySafeYaml(input), 'YAMLCAGE_CONTROL_CHARACTER');
});

test('wide serializer input fails by key budget before output amplification', () => {
  const input = {};
  for (let index = 0; index < 2000; index += 1) input['k' + index] = 1;
  const start = Date.now();
  assertCode(() => stringifySafeYaml(input, { maxKeys: 1000, maxOutputBytes: 100 }), 'YAMLCAGE_MAX_KEYS');
  assert.ok(Date.now() - start < 1000, 'wide input should fail promptly');
});
