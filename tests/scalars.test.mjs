import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSafeYaml, auditYaml } from '../src/index.mjs';
import { assertYamlEqual, assertCode } from './helpers.mjs';

for (const word of ['true', 'True', 'TRUE']) {
  test('YAML 1.2 boolean true spelling ' + word, () => {
    assert.equal(parseSafeYaml('value: ' + word + '\n').value, true);
  });
}

for (const word of ['false', 'False', 'FALSE']) {
  test('YAML 1.2 boolean false spelling ' + word, () => {
    assert.equal(parseSafeYaml('value: ' + word + '\n').value, false);
  });
}

for (const word of ['null', 'Null', 'NULL', '~']) {
  test('YAML 1.2 null spelling ' + word, () => {
    assert.equal(parseSafeYaml('value: ' + word + '\n').value, null);
  });
}

test('empty mapping value is null', () => {
  assert.equal(parseSafeYaml('value:\n').value, null);
});

const norwayWords = [
  'y', 'Y', 'yes', 'Yes', 'YES',
  'n', 'N', 'no', 'No', 'NO',
  'on', 'On', 'ON', 'off', 'Off', 'OFF'
];

for (const word of norwayWords) {
  test('Norway scalar stays string ' + word, () => {
    const value = parseSafeYaml('value: ' + word + '\n').value;
    assert.equal(value, word);
    assert.equal(typeof value, 'string');
  });
}

for (const word of norwayWords) {
  test('Norway audit warning appears for ' + word, () => {
    const report = auditYaml('value: ' + word + '\n');
    assert.equal(report.safe, true);
    const warnings = report.findings.filter((finding) => finding.code === 'YAMLCAGE_NORWAY_AMBIGUITY_WARN');
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].severity, 'warning');
  });
}

for (const word of norwayWords.slice(0, 8)) {
  test('quoted Norway scalar produces no warning ' + word, () => {
    const report = auditYaml('value: "' + word + '"\n');
    assert.equal(report.findings.some((finding) => finding.code === 'YAMLCAGE_NORWAY_AMBIGUITY_WARN'), false);
  });
}

test('strict Norway audit mode escalates warning severity', () => {
  const report = auditYaml('value: NO\n', { strictNorwayScalars: true });
  assert.equal(report.safe, false);
  assert.equal(report.findings.some((finding) => finding.code === 'YAMLCAGE_NORWAY_AMBIGUITY_WARN' && finding.severity === 'error'), true);
});

const integerCases = [
  ['0', 0], ['1', 1], ['-1', -1], ['+1', 1], ['42', 42],
  ['010', 10], ['000', 0], ['-010', -10], ['+010', 10],
  ['9007199254740991', 9007199254740991], ['-9007199254740991', -9007199254740991],
  ['0x0', 0], ['0x10', 16], ['0xff', 255], ['0XFF', '0XFF'],
  ['-0x10', -16], ['+0x10', 16],
  ['0o0', 0], ['0o10', 8], ['0o755', 493], ['-0o10', -8], ['+0o10', 8]
];

for (const [source, expected] of integerCases) {
  test('integer scalar case ' + source, () => {
    assert.equal(parseSafeYaml('value: ' + source + '\n').value, expected);
  });
}

const floatCases = [
  ['0.0', 0], ['1.0', 1], ['1.', 1], ['.5', 0.5], ['-.5', -0.5],
  ['+2.5', 2.5], ['-2.5', -2.5], ['1e3', 1000], ['1E3', 1000],
  ['1e+3', 1000], ['1e-3', 0.001], ['1.25e2', 125], ['.5e2', 50],
  ['1.e2', 100], ['-1e2', -100], ['+1e2', 100], ['0e-400', 0], ['0.0e-400', 0]
];

for (const [source, expected] of floatCases) {
  test('float scalar case ' + source, () => {
    assert.equal(parseSafeYaml('value: ' + source + '\n').value, expected);
  });
}

const numericLookingStrings = [
  '1_000', '1:20', '.5x', '0o8', '0x', '+', '-', '01a', '1e', '1e+', '..5', '.', '0b101', '1,000'
];

for (const source of numericLookingStrings) {
  test('numeric-looking non-core scalar stays string ' + source, () => {
    assert.equal(parseSafeYaml('value: ' + source + '\n').value, source);
  });
}

for (const source of ['.nan', '.NaN', '.NAN', '.inf', '.Inf', '.INF', '-.inf', '-.Inf', '-.INF', '+.inf']) {
  test('non-finite scalar rejected by default ' + source, () => {
    assertCode(() => parseSafeYaml('value: ' + source + '\n'), 'YAMLCAGE_NON_FINITE_NUMBER');
  });
}

test('positive infinity can be explicitly enabled', () => {
  assert.equal(parseSafeYaml('value: .inf\n', { allowNonFinite: true }).value, Infinity);
});

test('negative infinity can be explicitly enabled', () => {
  assert.equal(parseSafeYaml('value: -.inf\n', { allowNonFinite: true }).value, -Infinity);
});

test('NaN can be explicitly enabled', () => {
  assert.equal(Number.isNaN(parseSafeYaml('value: .nan\n', { allowNonFinite: true }).value), true);
});

for (const source of ['1e400', '-1e400', '9e999']) {
  test('overflowing nonzero number rejected ' + source, () => {
    assertCode(() => parseSafeYaml('value: ' + source + '\n'), 'YAMLCAGE_NON_FINITE_NUMBER');
  });
}

for (const source of ['1e-400', '-1e-400', '9e-999']) {
  test('nonzero underflowing number rejected ' + source, () => {
    assertCode(() => parseSafeYaml('value: ' + source + '\n'), 'YAMLCAGE_NON_FINITE_NUMBER');
  });
}

test('maximum safe integer accepted in strict integer mode', () => {
  assert.equal(parseSafeYaml('value: 9007199254740991\n', { rejectUnsafeIntegers: true }).value, 9007199254740991);
});

for (const source of ['9007199254740992', '-9007199254740992', '0x20000000000000']) {
  test('unsafe integer rejected in strict integer mode ' + source, () => {
    assertCode(() => parseSafeYaml('value: ' + source + '\n', { rejectUnsafeIntegers: true }), 'YAMLCAGE_UNSAFE_INTEGER');
  });
}

test('unsafe integer accepted when strict integer mode is off', () => {
  assert.equal(parseSafeYaml('value: 9007199254740992\n').value, 9007199254740992);
});

const singleQuoteCases = [
  ["''", ''],
  ["'plain'", 'plain'],
  ["'it''s'", "it's"],
  ["'two words'", 'two words'],
  ["'123'", '123'],
  ["'true'", 'true'],
  ["'NO'", 'NO'],
  ["'#hash'", '#hash'],
  ["'a: b'", 'a: b'],
  ["'back\\slash'", 'back\\slash']
];

for (const [source, expected] of singleQuoteCases) {
  test('single-quoted scalar ' + source, () => {
    assert.equal(parseSafeYaml('value: ' + source + '\n').value, expected);
  });
}

const doubleEscapeCases = [
  ['\\n', '\n'], ['\\t', '\t'], ['\\r', '\r'], ['\\\\', '\\'], ['\\"', '"'],
  ['\\0', '\0'], ['\\a', '\x07'], ['\\b', '\b'], ['\\f', '\f'], ['\\v', '\v'],
  ['\\e', '\x1b'], ['\\s', ' '], ['\\x41', 'A'], ['\\u0041', 'A'], ['\\U00000041', 'A']
];

for (const [escape, expected] of doubleEscapeCases) {
  test('double-quoted escape ' + escape, () => {
    assert.equal(parseSafeYaml('value: "' + escape + '"\n').value, expected);
  });
}

test('double-quoted Unicode escape can encode astral characters', () => {
  assert.equal(parseSafeYaml('value: "\\U0001F600"\n').value, '😀');
});

test('double-quoted surrogate pair escapes combine', () => {
  assert.equal(parseSafeYaml('value: "\\uD83D\\uDE00"\n').value, '😀');
});

for (const escape of ['\\q', '\\x1', '\\xzz', '\\u123', '\\U00110000']) {
  test('invalid double-quoted escape rejected ' + escape, () => {
    assertCode(() => parseSafeYaml('value: "' + escape + '"\n'), 'YAMLCAGE_SYNTAX_ERROR');
  });
}

test('lone high surrogate escape is rejected', () => {
  assertCode(() => parseSafeYaml('value: "\\uD800"\n'), 'YAMLCAGE_LONE_SURROGATE');
});

test('lone low surrogate escape is rejected', () => {
  assertCode(() => parseSafeYaml('value: "\\uDC00"\n'), 'YAMLCAGE_LONE_SURROGATE');
});

const blockChompingCases = [
  ['|', 'x\ny\n', 'x\ny\n'],
  ['|-', 'x\ny\n', 'x\ny'],
  ['|+', 'x\ny\n', 'x\ny\n'],
  ['>', 'x\ny\n', 'x y\n'],
  ['>-', 'x\ny\n', 'x y'],
  ['>+', 'x\ny\n', 'x y\n']
];

for (const [indicator, body, expected] of blockChompingCases) {
  test('block scalar basic ' + indicator, () => {
    const input = 'value: ' + indicator + '\n' + body.split('\n').filter(Boolean).map((line) => '  ' + line).join('\n') + '\n';
    assert.equal(parseSafeYaml(input).value, expected);
  });
}

for (const indicator of ['|', '|-', '|+', '>', '>-', '>+']) {
  test('block scalar empty content ' + indicator, () => {
    assert.equal(parseSafeYaml('value: ' + indicator + '\nnext: 1\n').value, '');
  });
}

for (const indicator of ['|', '>']) {
  test('block scalar preserves hash text ' + indicator, () => {
    assert.equal(parseSafeYaml('value: ' + indicator + '\n  # not a comment\n  text\n').value, indicator === '|' ? '# not a comment\ntext\n' : '# not a comment text\n');
  });
  test('block scalar keeps indentation ' + indicator, () => {
    const value = parseSafeYaml('value: ' + indicator + '\n  base\n    more\n  base\n').value;
    assert.ok(value.includes('  more'));
  });
}

for (const chomping of ['-', '+']) {
  for (const digit of ['1', '2', '3']) {
    for (const style of ['|', '>']) {
      test('block scalar explicit indentation ' + style + chomping + digit, () => {
        const input = 'value: ' + style + chomping + digit + '\n' + ' '.repeat(Number(digit)) + 'x\nnext: 1\n';
        const value = parseSafeYaml(input).value;
        assert.equal(typeof value, 'string');
      });
    }
  }
}

test('literal scalar preserves every line break', () => {
  assert.equal(parseSafeYaml('value: |\n  a\n  b\n  c\n').value, 'a\nb\nc\n');
});

test('literal strip removes final line break', () => {
  assert.equal(parseSafeYaml('value: |-\n  a\n\n').value, 'a');
});

test('literal keep preserves trailing blank line', () => {
  assert.equal(parseSafeYaml('value: |+\n  a\n\n').value, 'a\n\n');
});

test('folded scalar folds adjacent lines', () => {
  assert.equal(parseSafeYaml('value: >\n  a\n  b\n').value, 'a b\n');
});

test('folded scalar blank line creates a line break', () => {
  assert.equal(parseSafeYaml('value: >\n  a\n\n  b\n').value, 'a\n\nb\n');
});

test('folded scalar more-indented line is preserved', () => {
  assert.equal(parseSafeYaml('value: >\n  a\n    code\n  b\n').value, 'a\n  code\nb\n');
});

test('block scalar in sequence parses', () => {
  assertYamlEqual(parseSafeYaml('- |\n  text\n- next\n'), ['text\n', 'next']);
});

test('block scalar does not swallow a dedented key', () => {
  assertYamlEqual(parseSafeYaml('a: |\n  text\nb: 2\n'), { a: 'text\n', b: 2 });
});

test('tagged minimum safe integer exact boundary is accepted', () => {
  assert.equal(parseSafeYaml('a: !!int "-9007199254740991"\n', { allowSafeTags: true, rejectUnsafeIntegers: true }).a, -9007199254740991);
});

test('tagged positive integer just above safe boundary is rejected', () => {
  assertCode(() => parseSafeYaml('a: !!int "9007199254740992"\n', { allowSafeTags: true, rejectUnsafeIntegers: true }), 'YAMLCAGE_UNSAFE_INTEGER');
});
