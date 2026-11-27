import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSafeYaml,
  parseSafeYamlBytes,
  parseSafeYamlDocuments,
  auditYaml
} from '../src/index.mjs';
import { assertYamlEqual, assertCode } from './helpers.mjs';

test('string input byte limit accepts input exactly at cap', () => {
  assertYamlEqual(parseSafeYaml('a: 1\n', { maxBytes: 5 }), { a: 1 });
});

test('string input byte limit rejects one byte over cap', () => {
  assertCode(() => parseSafeYaml('a: 11\n', { maxBytes: 5 }), 'YAMLCAGE_MAX_BYTES');
});

test('multibyte input is measured in UTF-8 bytes not code units', () => {
  assertCode(() => parseSafeYaml('a: é\n', { maxBytes: 5 }), 'YAMLCAGE_MAX_BYTES');
});

test('byte input byte limit is enforced before decoding', () => {
  const bytes = new TextEncoder().encode('a: 1\n');
  assertCode(() => parseSafeYamlBytes(new TextEncoder().encode('a: 11\n'), { maxBytes: 5 }), 'YAMLCAGE_MAX_BYTES');
});

for (const [name, bytes] of [
  ['truncated two byte sequence', new Uint8Array([0xc3])],
  ['truncated three byte sequence', new Uint8Array([0xe2, 0x82])],
  ['truncated four byte sequence', new Uint8Array([0xf0, 0x9f, 0x98])],
  ['orphan continuation byte', new Uint8Array([0x80])],
  ['invalid continuation byte', new Uint8Array([0xc3, 0x28])],
  ['overlong slash', new Uint8Array([0xc0, 0xaf])],
  ['overlong NUL', new Uint8Array([0xc0, 0x80])],
  ['surrogate utf8 encoding', new Uint8Array([0xed, 0xa0, 0x80])],
  ['out of range code point', new Uint8Array([0xf4, 0x90, 0x80, 0x80])],
  ['lone ff byte', new Uint8Array([0xff])]
]) {
  test('fatal UTF-8 decoding rejects ' + name, () => {
    assertCode(() => parseSafeYamlBytes(bytes), 'YAMLCAGE_INVALID_UTF8');
  });
}

test('valid multibyte UTF-8 input is accepted', () => {
  assertYamlEqual(parseSafeYamlBytes(new TextEncoder().encode('emoji: 😀\n')), { emoji: '😀' });
});

for (const [name, bytes] of [
  ['UTF-16LE BOM', new Uint8Array([0xff, 0xfe, 97, 0x00])],
  ['UTF-16BE BOM', new Uint8Array([0xfe, 0xff, 0x00, 97])],
  ['UTF-32LE BOM', new Uint8Array([0xff, 0xfe, 0x00, 0x00])],
  ['UTF-32BE BOM', new Uint8Array([0x00, 0x00, 0xfe, 0xff])]
]) {
  test(name + ' is rejected', () => {
    assertCode(() => parseSafeYamlBytes(bytes, { rejectBom: false }), 'YAMLCAGE_INVALID_UTF8');
  });
}

test('UTF-8 BOM is rejected by default', () => {
  assertCode(() => parseSafeYamlBytes(new Uint8Array([0xef, 0xbb, 0xbf, 97])), 'YAMLCAGE_BOM_REJECTED');
});

test('UTF-8 BOM can be explicitly allowed', () => {
  assert.equal(parseSafeYamlBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]), { rejectBom: false }), 'a');
});

test('string Unicode BOM is rejected by default', () => {
  assertCode(() => parseSafeYaml('\ufeffa: 1\n'), 'YAMLCAGE_BOM_REJECTED');
});

test('string Unicode BOM can be explicitly allowed', () => {
  assertYamlEqual(parseSafeYaml('\ufeffa: 1\n', { rejectBom: false }), { a: 1 });
});

for (let code = 0; code <= 0x1f; code += 1) {
  if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
  test('raw control character rejected U+' + code.toString(16).padStart(4, '0'), () => {
    assertCode(() => parseSafeYaml('a: ' + String.fromCharCode(code) + '\n'), 'YAMLCAGE_CONTROL_CHARACTER');
  });
}

for (const code of [0x7f, 0x80, 0x85, 0x9f]) {
  test('C1 or delete control character rejected U+' + code.toString(16).padStart(4, '0'), () => {
    assertCode(() => parseSafeYaml('a: ' + String.fromCharCode(code) + '\n'), 'YAMLCAGE_CONTROL_CHARACTER');
  });
}

test('horizontal tab inside scalar is accepted', () => {
  assert.equal(parseSafeYaml('a: x\ty\n').a, 'x\ty');
});

test('lone high surrogate in string input is rejected', () => {
  assertCode(() => parseSafeYaml('a: ' + String.fromCharCode(0xd800) + '\n'), 'YAMLCAGE_LONE_SURROGATE');
});

test('lone low surrogate in string input is rejected', () => {
  assertCode(() => parseSafeYaml('a: ' + String.fromCharCode(0xdc00) + '\n'), 'YAMLCAGE_LONE_SURROGATE');
});

test('valid surrogate pair in string input is accepted', () => {
  assert.equal(parseSafeYaml('a: 😀\n').a, '😀');
});

for (const depth of [1, 2, 3, 4, 8, 16, 32]) {
  test('flow nesting exactly at depth ' + depth + ' accepted when limit permits', () => {
    const input = '['.repeat(depth) + '1' + ']'.repeat(depth);
    const value = parseSafeYaml(input, { maxDepth: depth, maxNodes: 1000 });
    assert.ok(Array.isArray(value));
  });
  test('flow nesting one above depth ' + depth + ' rejected', () => {
    const input = '['.repeat(depth + 1) + '1' + ']'.repeat(depth + 1);
    assertCode(() => parseSafeYaml(input, { maxDepth: depth }), 'YAMLCAGE_MAX_DEPTH');
  });
}

test('fifty thousand nested flow starts fail as max depth without stack overflow', () => {
  const input = '['.repeat(50000);
  const start = Date.now();
  assertCode(() => parseSafeYaml(input), 'YAMLCAGE_MAX_DEPTH');
  assert.ok(Date.now() - start < 2000, 'depth failure should be fast');
});

test('deep block nesting fails as max depth without stack overflow', () => {
  const lines = [];
  for (let index = 0; index < 200; index += 1) lines.push(' '.repeat(index) + 'k:');
  assertCode(() => parseSafeYaml(lines.join('\n')), 'YAMLCAGE_MAX_DEPTH');
});

test('deep block nesting rejection does not degrade quadratically', () => {
  const lines = [];
  for (let index = 0; index < 1000; index += 1) lines.push(' '.repeat(index) + '-');
  const start = Date.now();
  assertCode(() => parseSafeYaml(lines.join('\n')), 'YAMLCAGE_MAX_DEPTH');
  assert.ok(Date.now() - start < 1000, 'block depth failure should stay linear in input size');
});

test('large multiline flow collections are scanned incrementally', () => {
  const lines = ['a: ['];
  for (let index = 0; index < 8000; index += 1) lines.push('  x,');
  lines.push('  x]');
  const start = Date.now();
  const value = parseSafeYaml(lines.join('\n'));
  assert.equal(value.a.length, 8001);
  assert.ok(Date.now() - start < 1000, 'multiline flow scan should stay linear in input size');
});

test('mapping key count limit is enforced', () => {
  assertCode(() => parseSafeYaml('a: 1\nb: 2\n', { maxKeys: 1 }), 'YAMLCAGE_MAX_KEYS');
});

test('mapping key count exact boundary is accepted', () => {
  assertYamlEqual(parseSafeYaml('a: 1\n', { maxKeys: 1 }), { a: 1 });
});

test('flow mapping key count limit is enforced', () => {
  assertCode(() => parseSafeYaml('x: {a: 1, b: 2}\n', { maxKeys: 1 }), 'YAMLCAGE_MAX_KEYS');
});

test('sequence length limit is enforced in block sequences', () => {
  assertCode(() => parseSafeYaml('- 1\n- 2\n', { maxSequenceLength: 1 }), 'YAMLCAGE_MAX_SEQUENCE_LENGTH');
});

test('sequence length exact boundary is accepted', () => {
  assertYamlEqual(parseSafeYaml('- 1\n', { maxSequenceLength: 1 }), [1]);
});

test('sequence length limit is enforced in flow sequences', () => {
  assertCode(() => parseSafeYaml('x: [1, 2]\n', { maxSequenceLength: 1 }), 'YAMLCAGE_MAX_SEQUENCE_LENGTH');
});

test('node limit is enforced', () => {
  assertCode(() => parseSafeYaml('a: [1,2,3,4]\n', { maxNodes: 4 }), 'YAMLCAGE_MAX_NODES');
});

test('string length limit is enforced in UTF-8 bytes', () => {
  assertCode(() => parseSafeYaml('a: éé\n', { maxStringLength: 3 }), 'YAMLCAGE_MAX_STRING_LENGTH');
});

test('string length exact boundary is accepted', () => {
  assert.equal(parseSafeYaml('a: abc\n', { maxStringLength: 3 }).a, 'abc');
});

test('key length limit is enforced in UTF-8 bytes', () => {
  assertCode(() => parseSafeYaml('éé: 1\n', { maxKeyLength: 3 }), 'YAMLCAGE_MAX_KEY_LENGTH');
});

test('key length exact boundary is accepted', () => {
  assertYamlEqual(parseSafeYaml('abc: 1\n', { maxKeyLength: 3 }), { abc: 1 });
});

test('document count limit is enforced', () => {
  assertCode(() => parseSafeYamlDocuments('---\na: 1\n---\nb: 2\n', { maxDocuments: 1 }), 'YAMLCAGE_MAX_DOCUMENTS');
});

test('document count exact boundary is accepted', () => {
  assertYamlEqual(parseSafeYamlDocuments('---\na: 1\n', { maxDocuments: 1 }), [{ a: 1 }]);
});

for (const [key, value] of [
  ['maxBytes', -1], ['maxDepth', 0], ['maxKeys', 0], ['maxSequenceLength', 0],
  ['maxNodes', 1.5], ['maxStringLength', Number.NaN], ['maxKeyLength', Infinity],
  ['maxDocuments', 0], ['maxAliases', -1], ['maxAliasDepth', -2],
  ['maxExpandedNodes', '10'], ['maxOutputBytes', null]
]) {
  test('invalid numeric option rejected ' + key, () => {
    assertCode(() => parseSafeYaml('a: 1\n', { [key]: value }), 'YAMLCAGE_INVALID_OPTIONS');
  });
}

for (const key of [
  'allowAliases', 'allowMergeKeys', 'allowSafeTags', 'allowNonFinite',
  'rejectUnsafeIntegers', 'rejectBom', 'warnNorwayScalars', 'strictNorwayScalars', 'allowMultiDocument'
]) {
  test('invalid boolean option rejected ' + key, () => {
    assertCode(() => parseSafeYaml('a: 1\n', { [key]: 1 }), 'YAMLCAGE_INVALID_OPTIONS');
  });
}

test('unknown option key is rejected', () => {
  assertCode(() => parseSafeYaml('a: 1\n', { unsafeMode: true }), 'YAMLCAGE_INVALID_OPTIONS');
});

test('non-object options are rejected', () => {
  assertCode(() => parseSafeYaml('a: 1\n', []), 'YAMLCAGE_INVALID_OPTIONS');
});

for (const input of [42, true, null, undefined, {}, []]) {
  test('invalid parse input type rejected ' + Object.prototype.toString.call(input), () => {
    assertCode(() => parseSafeYaml(input), 'YAMLCAGE_INVALID_INPUT');
  });
}

test('parseSafeYamlBytes rejects a string input', () => {
  assertCode(() => parseSafeYamlBytes('a: 1\n'), 'YAMLCAGE_INVALID_INPUT');
});

test('ArrayBuffer input is accepted', () => {
  const bytes = new TextEncoder().encode('a: 1\n');
  assertYamlEqual(parseSafeYamlBytes(bytes.buffer), { a: 1 });
});

test('ArrayBuffer view input is accepted', () => {
  const bytes = new TextEncoder().encode('a: 1\n');
  assertYamlEqual(parseSafeYamlBytes(new DataView(bytes.buffer)), { a: 1 });
});

test('audit byte stats count UTF-8 bytes', () => {
  const report = auditYaml('a: é\n');
  assert.equal(report.stats.bytes, new TextEncoder().encode('a: é\n').byteLength);
});

test('audit reports maximum observed depth', () => {
  const report = auditYaml('a:\n  b:\n    c: 1\n');
  assert.equal(report.stats.maxDepth, 3);
});

test('audit reports invalid UTF-8 without throwing', () => {
  const report = auditYaml(new Uint8Array([0xff]));
  assert.equal(report.safe, false);
  assert.equal(report.findings[0].code, 'YAMLCAGE_INVALID_UTF8');
});

test('audit reports control bytes without throwing', () => {
  const report = auditYaml(new Uint8Array([0x61, 0x00]));
  assert.equal(report.safe, false);
  assert.equal(report.findings[0].code, 'YAMLCAGE_CONTROL_CHARACTER');
});

for (const depth of [2, 4, 8]) {
  test('block nesting depth boundary ' + depth, () => {
    let accepted = '';
    for (let level = 0; level < depth - 1; level += 1) accepted += ' '.repeat(level * 2) + 'k:\n';
    accepted += ' '.repeat((depth - 1) * 2) + 'v: 1\n';
    assert.notEqual(parseSafeYaml(accepted, { maxDepth: depth }), null);

    let rejected = '';
    for (let level = 0; level < depth; level += 1) rejected += ' '.repeat(level * 2) + 'k:\n';
    rejected += ' '.repeat(depth * 2) + 'v: 1\n';
    assertCode(() => parseSafeYaml(rejected, { maxDepth: depth }), 'YAMLCAGE_MAX_DEPTH');
  });
}

test('block parser iteratively accepts configured nesting beyond legacy stack depths', () => {
  const depth = 600;
  const lines = [];
  for (let index = 0; index < depth; index += 1) lines.push(' '.repeat(index) + '-');
  const value = parseSafeYaml(lines.join('\n'), { maxDepth: depth, maxNodes: 100000 });
  let seen = 0;
  let current = value;
  while (Array.isArray(current)) {
    seen += 1;
    current = current[0];
  }
  assert.equal(seen, depth);
});
