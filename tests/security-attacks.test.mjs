import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSafeYaml,
  auditYaml
} from '../src/index.mjs';
import { assertYamlEqual, assertCode } from './helpers.mjs';

const classicBomb = [
  'a: &a ["x","x","x","x","x","x","x","x","x"]',
  'b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]',
  'c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]',
  'd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]',
  'e: *d',
  ''
].join('\n');

test('classic Billion Laughs bomb is rejected by default', () => {
  assertCode(() => parseSafeYaml(classicBomb), 'YAMLCAGE_ANCHOR_FORBIDDEN');
});

test('classic Billion Laughs bomb stays bounded when aliases are enabled', () => {
  assertCode(() => parseSafeYaml(classicBomb, { allowAliases: true }), 'YAMLCAGE_MAX_EXPANDED_NODES');
});

test('small alias use can be explicitly enabled', () => {
  assertYamlEqual(parseSafeYaml('base: &x [1, 2]\ncopy: *x\n', { allowAliases: true }), {
    base: [1, 2],
    copy: [1, 2]
  });
});

test('alias copies do not share object identity', () => {
  const value = parseSafeYaml('base: &x {a: 1}\ncopy: *x\n', { allowAliases: true });
  assert.notEqual(value.base, value.copy);
  value.copy.a = 99;
  assert.equal(value.base.a, 1);
});

test('anchor without alias is still forbidden by default', () => {
  assertCode(() => parseSafeYaml('x: &a 1\n'), 'YAMLCAGE_ANCHOR_FORBIDDEN');
});

test('bare alias is forbidden by default', () => {
  assertCode(() => parseSafeYaml('x: *a\n'), 'YAMLCAGE_ALIAS_FORBIDDEN');
});

for (const input of [
  'a: &x 1\nb: *x\n',
  'a: &x [1]\nb: [*x]\n',
  'a: &x {v: 1}\nb: {copy: *x}\n',
  '- &x 1\n- *x\n',
  'a: &x\n  nested: true\nb: *x\n'
]) {
  test('anchor and alias pair forbidden by default ' + JSON.stringify(input), () => {
    assertCode(() => parseSafeYaml(input), 'YAMLCAGE_ANCHOR_FORBIDDEN');
  });
}

test('undefined alias is rejected when aliases are enabled', () => {
  assertCode(() => parseSafeYaml('x: *missing\n', { allowAliases: true }), 'YAMLCAGE_UNDEFINED_ALIAS');
});

test('direct self-recursive alias is rejected', () => {
  assertCode(() => parseSafeYaml('x: &x [*x]\n', { allowAliases: true }), 'YAMLCAGE_ALIAS_CYCLE');
});

test('nested self-recursive alias is rejected', () => {
  assertCode(() => parseSafeYaml('x: &x {inner: [*x]}\n', { allowAliases: true }), 'YAMLCAGE_ALIAS_CYCLE');
});

test('duplicate anchors are rejected', () => {
  assertCode(() => parseSafeYaml('a: &x 1\nb: &x 2\n', { allowAliases: true }), 'YAMLCAGE_DUPLICATE_ANCHOR');
});

test('alias count budget is enforced independently', () => {
  assertCode(() => parseSafeYaml('a: &x 1\nb: [*x, *x]\n', { allowAliases: true, maxAliases: 1 }), 'YAMLCAGE_MAX_ALIASES');
});

test('alias expansion node budget is enforced independently', () => {
  assertCode(() => parseSafeYaml('a: &x [1, 2, 3]\nb: *x\n', { allowAliases: true, maxExpandedNodes: 3 }), 'YAMLCAGE_MAX_EXPANDED_NODES');
});

test('alias depth budget is enforced independently', () => {
  const input = 'a: &a x\nb: &b [*a]\nc: &c [*b]\nd: *c\n';
  assertCode(() => parseSafeYaml(input, { allowAliases: true, maxAliasDepth: 2 }), 'YAMLCAGE_MAX_ALIAS_DEPTH');
});

test('alias chain within depth budget is accepted', () => {
  const input = 'a: &a x\nb: &b [*a]\nc: *b\n';
  assertYamlEqual(parseSafeYaml(input, { allowAliases: true, maxAliasDepth: 2 }), {
    a: 'x',
    b: ['x'],
    c: ['x']
  });
});

for (let width = 2; width <= 8; width += 1) {
  test('alias fanout width ' + width + ' is bounded', () => {
    const aliases = Array.from({ length: width }, () => '*a').join(',');
    const input = 'a: &a [1,2,3,4]\nb: [' + aliases + ']\n';
    const result = parseSafeYaml(input, { allowAliases: true, maxAliases: width, maxExpandedNodes: 1000 });
    assert.equal(result.b.length, width);
  });
}

for (const tag of [
  '!!js/function', '!!js/regexp', '!!js/undefined', '!!python/object/apply',
  '!!python/object/new', '!!python/module', '!!binary', '!custom', '!LocalType',
  '!<tag:example.com,2026:evil>', '!foo/bar', '!!ruby/object', '!!perl/code'
]) {
  test('unsafe tag rejected by default ' + tag, () => {
    assertCode(() => parseSafeYaml('value: ' + tag + ' x\n'), 'YAMLCAGE_UNSAFE_TAG');
  });
}

for (const tag of ['!!js/function', '!!python/object/apply', '!custom', '!<tag:example.com,2026:evil>']) {
  test('unsafe tag still rejected when safe tags enabled ' + tag, () => {
    assertCode(() => parseSafeYaml('value: ' + tag + ' x\n', { allowSafeTags: true }), 'YAMLCAGE_UNSAFE_TAG');
  });
}

test('percent TAG directive is rejected', () => {
  assertCode(() => parseSafeYaml('%TAG !e! tag:example.com,2026:\n---\na: !e!x 1\n'), 'YAMLCAGE_UNSAFE_TAG');
});

test('tag directive audit reports unsafe tag', () => {
  const report = auditYaml('%TAG !e! tag:example.com,2026:\n---\na: 1\n');
  assert.equal(report.safe, false);
  assert.equal(report.findings[0].code, 'YAMLCAGE_UNSAFE_TAG');
});

for (const [tag, input, expected] of [
  ['!!str', '1', '1'],
  ['!!int', '"12"', 12],
  ['!!float', '"1.5"', 1.5],
  ['!!bool', '"true"', true],
  ['!!null', '"null"', null]
]) {
  test('safe explicit tag accepted when enabled ' + tag, () => {
    assert.equal(parseSafeYaml('value: ' + tag + ' ' + input + '\n', { allowSafeTags: true }).value, expected);
  });
}

test('safe map tag accepted for mapping when enabled', () => {
  assertYamlEqual(parseSafeYaml('value: !!map {a: 1}\n', { allowSafeTags: true }), { value: { a: 1 } });
});

test('safe seq tag accepted for sequence when enabled', () => {
  assertYamlEqual(parseSafeYaml('value: !!seq [1]\n', { allowSafeTags: true }), { value: [1] });
});

test('safe tag rejected when not enabled', () => {
  assertCode(() => parseSafeYaml('value: !!str 1\n'), 'YAMLCAGE_UNSAFE_TAG');
});

for (const input of [
  'value: !!int x\n',
  'value: !!bool yes\n',
  'value: !!null text\n',
  'value: !!float abc\n'
]) {
  test('safe tag type mismatch rejected ' + JSON.stringify(input), () => {
    assertCode(() => parseSafeYaml(input, { allowSafeTags: true }), 'YAMLCAGE_TAG_TYPE_MISMATCH');
  });
}

test('safe map tag rejects a sequence', () => {
  assertCode(() => parseSafeYaml('value: !!map [1]\n', { allowSafeTags: true }), 'YAMLCAGE_TAG_TYPE_MISMATCH');
});

test('safe seq tag rejects a mapping', () => {
  assertCode(() => parseSafeYaml('value: !!seq {a: 1}\n', { allowSafeTags: true }), 'YAMLCAGE_TAG_TYPE_MISMATCH');
});

for (const input of [
  '<<: {a: 1}\n',
  'base: &b {a: 1}\nitem:\n  <<: *b\n',
  'item:\n  <<: {a: 1}\n',
  'item: {<<: {a: 1}}\n'
]) {
  test('merge key rejected by default ' + JSON.stringify(input), () => {
    assertCode(() => parseSafeYaml(input, { allowAliases: true }), 'YAMLCAGE_MERGE_KEY_FORBIDDEN');
  });
}

test('merge key can be explicitly enabled with inline mapping', () => {
  assertYamlEqual(parseSafeYaml('item:\n  <<: {a: 1, b: 2}\n  b: 3\n', { allowMergeKeys: true }), {
    item: { a: 1, b: 3 }
  });
});

test('merge key through alias can be explicitly enabled', () => {
  const input = 'base: &base {a: 1, b: 2}\nitem:\n  <<: *base\n  b: 3\n';
  assertYamlEqual(parseSafeYaml(input, { allowMergeKeys: true, allowAliases: true }), {
    base: { a: 1, b: 2 },
    item: { a: 1, b: 3 }
  });
});

test('merge sequence earlier mapping wins', () => {
  const input = 'one: &one {a: 1, x: one}\ntwo: &two {a: 2, y: two}\nitem:\n  <<: [*one, *two]\n';
  const value = parseSafeYaml(input, { allowMergeKeys: true, allowAliases: true });
  assert.equal(value.item.a, 1);
  assert.equal(value.item.x, 'one');
  assert.equal(value.item.y, 'two');
});

test('merge key never overrides explicit key regardless of order', () => {
  const input = 'base: &base {a: 1}\nitem:\n  a: 9\n  <<: *base\n';
  assert.equal(parseSafeYaml(input, { allowMergeKeys: true, allowAliases: true }).item.a, 9);
});

test('merge output is a null prototype object', () => {
  const value = parseSafeYaml('item:\n  <<: {a: 1}\n', { allowMergeKeys: true });
  assert.equal(Object.getPrototypeOf(value.item), null);
});

for (const input of [
  'item:\n  <<: 1\n',
  'item:\n  <<: text\n',
  'item:\n  <<: [[1]]\n'
]) {
  test('non-mapping merge shape rejected ' + JSON.stringify(input), () => {
    assertCode(() => parseSafeYaml(input, { allowMergeKeys: true }), 'YAMLCAGE_MERGE_KEY_FORBIDDEN');
  });
}

const dangerousKeys = [
  '__proto__',
  'constructor',
  'prototype'
];

for (const key of dangerousKeys) {
  test('prototype pollution key rejected unquoted ' + key, () => {
    assertCode(() => parseSafeYaml(key + ': 1\n'), 'YAMLCAGE_PROTOTYPE_KEY');
  });
  test('prototype pollution key rejected double quoted ' + key, () => {
    assertCode(() => parseSafeYaml('"' + key + '": 1\n'), 'YAMLCAGE_PROTOTYPE_KEY');
  });
  test('prototype pollution key rejected single quoted ' + key, () => {
    assertCode(() => parseSafeYaml("'" + key + "': 1\n"), 'YAMLCAGE_PROTOTYPE_KEY');
  });
  test('prototype pollution key rejected in flow mapping ' + key, () => {
    assertCode(() => parseSafeYaml('x: {' + key + ': 1}\n'), 'YAMLCAGE_PROTOTYPE_KEY');
  });
  test('prototype pollution key rejected nested ' + key, () => {
    assertCode(() => parseSafeYaml('outer:\n  ' + key + ': 1\n'), 'YAMLCAGE_PROTOTYPE_KEY');
  });
}

test('unicode escaped prototype key is rejected', () => {
  assertCode(() => parseSafeYaml('"\\u005f\\u005fproto\\u005f\\u005f": 1\n'), 'YAMLCAGE_PROTOTYPE_KEY');
});

test('unicode escaped constructor key is rejected', () => {
  assertCode(() => parseSafeYaml('"\\u0063onstructor": 1\n'), 'YAMLCAGE_PROTOTYPE_KEY');
});

test('unicode escaped prototype word is rejected', () => {
  assertCode(() => parseSafeYaml('"\\u0070rototype": 1\n'), 'YAMLCAGE_PROTOTYPE_KEY');
});

test('parsed mapping does not expose object prototype members', () => {
  const value = parseSafeYaml('a: 1\n');
  assert.equal(Object.getPrototypeOf(value), null);
  assert.equal(value.toString, undefined);
});

test('nested parsed mapping does not expose object prototype members', () => {
  const value = parseSafeYaml('outer:\n  a: 1\n');
  assert.equal(Object.getPrototypeOf(value.outer), null);
  assert.equal(value.outer.hasOwnProperty, undefined);
});

const duplicateCases = [
  ['plain duplicate', 'a: 1\na: 2\n'],
  ['quoted and plain duplicate', 'a: 1\n"a": 2\n'],
  ['single and plain duplicate', "a: 1\n'a': 2\n"],
  ['escaped and plain duplicate', 'a: 1\n"\\u0061": 2\n'],
  ['nested duplicate', 'outer:\n  a: 1\n  a: 2\n'],
  ['flow duplicate', 'x: {a: 1, a: 2}\n'],
  ['flow quoted duplicate', 'x: {a: 1, "a": 2}\n'],
  ['compact sequence duplicate', '- a: 1\n  a: 2\n'],
  ['deep duplicate', 'a:\n  b:\n    c:\n      x: 1\n      x: 2\n'],
  ['whitespace key duplicate', 'a: 1\na : 2\n']
];

for (const [name, input] of duplicateCases) {
  test('duplicate key smuggling rejected: ' + name, () => {
    assertCode(() => parseSafeYaml(input), 'YAMLCAGE_DUPLICATE_KEY');
  });
}

test('similar but distinct keys are accepted', () => {
  assertYamlEqual(parseSafeYaml('a: 1\nA: 2\naa: 3\n'), { a: 1, A: 2, aa: 3 });
});

test('keys differing by unicode are accepted', () => {
  assertYamlEqual(parseSafeYaml('a: 1\né: 2\n'), { a: 1, 'é': 2 });
});

for (const [name, input, code] of [
  ['alias', 'x: *a\n', 'YAMLCAGE_ALIAS_FORBIDDEN'],
  ['anchor', 'x: &a 1\n', 'YAMLCAGE_ANCHOR_FORBIDDEN'],
  ['tag', 'x: !!js/function y\n', 'YAMLCAGE_UNSAFE_TAG'],
  ['merge', '<<: {x: 1}\n', 'YAMLCAGE_MERGE_KEY_FORBIDDEN'],
  ['duplicate', 'x: 1\nx: 2\n', 'YAMLCAGE_DUPLICATE_KEY'],
  ['prototype', '__proto__: 1\n', 'YAMLCAGE_PROTOTYPE_KEY'],
  ['multi document', 'x: 1\n---\ny: 2\n', 'YAMLCAGE_MULTI_DOCUMENT'],
  ['non finite', 'x: .nan\n', 'YAMLCAGE_NON_FINITE_NUMBER']
]) {
  test('audit reports stable finding code for ' + name, () => {
    const report = auditYaml(input);
    assert.equal(report.safe, false);
    assert.equal(report.findings.some((finding) => finding.code === code), true);
  });
}

for (const key of ['constructor ', 'Constructor', 'PROTO', 'proto', '__proto', 'prototypex']) {
  test('non-exact prototype-like key accepted ' + JSON.stringify(key), () => {
    const input = JSON.stringify(key) + ': 1\n';
    assert.equal(parseSafeYaml(input)[key], 1);
  });
}

for (const value of ['admin', 'user', 'owner', 'reader', 'writer', 'operator']) {
  test('quoted and plain key equivalence enforced for role ' + value, () => {
    assertCode(() => parseSafeYaml(value + ': 1\n"' + value + '": 2\n'), 'YAMLCAGE_DUPLICATE_KEY');
  });
}

test('scalar string tag cannot coerce a sequence into a string', () => {
  assertCode(() => parseSafeYaml('a: !!str [1]\n', { allowSafeTags: true }), 'YAMLCAGE_TAG_TYPE_MISMATCH');
});

test('scalar string tag cannot coerce a mapping into a string', () => {
  assertCode(() => parseSafeYaml('a: !!str {x: 1}\n', { allowSafeTags: true }), 'YAMLCAGE_TAG_TYPE_MISMATCH');
});

test('scalar numeric tag cannot coerce a collection into a number', () => {
  assertCode(() => parseSafeYaml('a: !!int [1]\n', { allowSafeTags: true }), 'YAMLCAGE_TAG_TYPE_MISMATCH');
});

test('explicitly tagged float cannot smuggle overflowing infinity', () => {
  assertCode(() => parseSafeYaml('a: !!float "1e400"\n', { allowSafeTags: true }), 'YAMLCAGE_NON_FINITE_NUMBER');
});

test('explicitly tagged float cannot smuggle nonzero underflow', () => {
  assertCode(() => parseSafeYaml('a: !!float "1e-400"\n', { allowSafeTags: true }), 'YAMLCAGE_NON_FINITE_NUMBER');
});

test('explicitly tagged integer enforces safe integer policy', () => {
  assertCode(() => parseSafeYaml('a: !!int "9007199254740993"\n', { allowSafeTags: true, rejectUnsafeIntegers: true }), 'YAMLCAGE_UNSAFE_INTEGER');
});

test('explicitly tagged integer accepts a bounded safe integer', () => {
  assert.equal(parseSafeYaml('a: !!int "9007199254740991"\n', { allowSafeTags: true, rejectUnsafeIntegers: true }).a, 9007199254740991);
});

test('explicitly tagged finite float still parses', () => {
  assert.equal(parseSafeYaml('a: !!float "1.5"\n', { allowSafeTags: true }).a, 1.5);
});

test('unsafe integer policy cannot be bypassed with a decimal point', () => {
  assertCode(() => parseSafeYaml('a: 9007199254740993.0\n', { rejectUnsafeIntegers: true }), 'YAMLCAGE_UNSAFE_INTEGER');
});

test('unsafe integer policy cannot be bypassed with exponent notation', () => {
  assertCode(() => parseSafeYaml('a: 9.007199254740993e15\n', { rejectUnsafeIntegers: true }), 'YAMLCAGE_UNSAFE_INTEGER');
});

test('unsafe integer policy still permits non-integral safe floats', () => {
  assert.equal(parseSafeYaml('a: 1.5\n', { rejectUnsafeIntegers: true }).a, 1.5);
});

test('numeric literal overflow stays rejected when non-finite keywords are allowed', () => {
  assertCode(() => parseSafeYaml('a: 1e400\n', { allowNonFinite: true }), 'YAMLCAGE_NON_FINITE_NUMBER');
});

test('tagged numeric literal overflow stays rejected when non-finite keywords are allowed', () => {
  assertCode(() => parseSafeYaml('a: !!float "1e400"\n', { allowNonFinite: true, allowSafeTags: true }), 'YAMLCAGE_NON_FINITE_NUMBER');
});

test('explicit infinity keyword is accepted only by non-finite opt-in', () => {
  assert.equal(parseSafeYaml('a: .inf\n', { allowNonFinite: true }).a, Number.POSITIVE_INFINITY);
  assertCode(() => parseSafeYaml('a: .inf\n'), 'YAMLCAGE_NON_FINITE_NUMBER');
});

test('bare NaN is rejected as a non-finite number by default', () => {
  assertCode(() => parseSafeYaml('a: NaN\n'), 'YAMLCAGE_NON_FINITE_NUMBER');
});

test('bare NaN requires explicit non-finite opt-in', () => {
  assert.equal(Number.isNaN(parseSafeYaml('a: NaN\n', { allowNonFinite: true }).a), true);
});

test('raw bidirectional controls are rejected in scalars and keys', () => {
  const bidi = String.fromCharCode(0x202e);
  assertCode(() => parseSafeYaml('a: x' + bidi + 'y\n'), 'YAMLCAGE_CONTROL_CHARACTER');
  assertCode(() => parseSafeYaml(bidi + 'key: 1\n'), 'YAMLCAGE_CONTROL_CHARACTER');
});

test('escaped bidirectional controls are rejected after decoding', () => {
  assertCode(() => parseSafeYaml('a: "\\u202e"\n'), 'YAMLCAGE_CONTROL_CHARACTER');
  assertCode(() => parseSafeYaml('"\\u202e": 1\n'), 'YAMLCAGE_CONTROL_CHARACTER');
});

for (const codePoint of [0x061c, 0x200e, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069, 0x206f]) {
  test('bidirectional control rejected U+' + codePoint.toString(16), () => {
    assertCode(() => parseSafeYaml('a: ' + String.fromCharCode(codePoint) + '\n'), 'YAMLCAGE_CONTROL_CHARACTER');
  });
}

test('aliases cannot carry a tag in the safe subset', () => {
  assertCode(() => parseSafeYaml('a: &x 1\nb: !!str *x\n', { allowAliases: true, allowSafeTags: true }), 'YAMLCAGE_SYNTAX_ERROR');
});

test('aliases cannot carry a second anchor in the safe subset', () => {
  assertCode(() => parseSafeYaml('a: &x 1\nb: &y *x\n', { allowAliases: true }), 'YAMLCAGE_SYNTAX_ERROR');
});

for (const [source, expected] of [
  ['010', '010'],
  ['1.0', '1.0'],
  ['true', 'true'],
  ['null', 'null'],
  ['~', '~'],
  ['0x10', '0x10']
]) {
  test('explicit string tag preserves scalar lexical form ' + source, () => {
    assert.equal(parseSafeYaml('a: !!str ' + source + '\n', { allowSafeTags: true }).a, expected);
  });
}

test('explicit string tag on an empty scalar does not invent null text', () => {
  assert.equal(parseSafeYaml('a: !!str\n', { allowSafeTags: true }).a, '');
});

test('explicit string tag cannot bypass the string length budget', () => {
  assertCode(() => parseSafeYaml('a: !!str 123456\n', { allowSafeTags: true, maxStringLength: 3 }), 'YAMLCAGE_MAX_STRING_LENGTH');
});
