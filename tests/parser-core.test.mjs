import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSafeYaml,
  parseSafeYamlDocuments
} from '../src/index.mjs';
import { assertYamlEqual, assertCode } from './helpers.mjs';

test('empty input parses as null', () => {
  assert.equal(parseSafeYaml(''), null);
});

test('blank input parses as null', () => {
  assert.equal(parseSafeYaml('\n\n  \n'), null);
});

test('comment-only input parses as null', () => {
  assert.equal(parseSafeYaml('# comment\n  # another\n'), null);
});

test('simple block mapping parses scalar values', () => {
  assertYamlEqual(parseSafeYaml('name: worker\ncount: 3\nenabled: true\nmissing:\n'), {
    name: 'worker',
    count: 3,
    enabled: true,
    missing: null
  });
});

test('block mapping values are null prototype objects', () => {
  const value = parseSafeYaml('a: 1\n');
  assert.equal(Object.getPrototypeOf(value), null);
});

test('nested block mapping parses recursively', () => {
  assertYamlEqual(parseSafeYaml('outer:\n  inner:\n    value: 42\n'), {
    outer: { inner: { value: 42 } }
  });
});

test('nested mappings and sequences combine', () => {
  assertYamlEqual(parseSafeYaml('services:\n  web:\n    ports:\n      - 80\n      - 443\n  worker:\n    replicas: 2\n'), {
    services: {
      web: { ports: [80, 443] },
      worker: { replicas: 2 }
    }
  });
});

test('root block sequence parses scalars', () => {
  assertYamlEqual(parseSafeYaml('- one\n- two\n- 3\n'), ['one', 'two', 3]);
});

test('nested sequence under mapping parses', () => {
  assertYamlEqual(parseSafeYaml('items:\n  - one\n  - two\n'), { items: ['one', 'two'] });
});

test('indentless sequence under mapping parses', () => {
  assertYamlEqual(parseSafeYaml('items:\n- one\n- two\nnext: yes\n'), { items: ['one', 'two'], next: 'yes' });
});

test('empty sequence entries become null', () => {
  assertYamlEqual(parseSafeYaml('-\n- x\n'), [null, 'x']);
});

test('compact mapping entries in sequences parse', () => {
  assertYamlEqual(parseSafeYaml('- name: first\n  value: 1\n- name: second\n  value: 2\n'), [
    { name: 'first', value: 1 },
    { name: 'second', value: 2 }
  ]);
});

test('compact nested mapping in sequence parses', () => {
  assertYamlEqual(parseSafeYaml('- config:\n    enabled: true\n  name: worker\n'), [
    { config: { enabled: true }, name: 'worker' }
  ]);
});

test('compact nested sequence in sequence parses', () => {
  assertYamlEqual(parseSafeYaml('- - a\n  - b\n- c\n'), [['a', 'b'], 'c']);
});

test('deep compact combinations parse', () => {
  assertYamlEqual(parseSafeYaml('jobs:\n  - name: build\n    steps:\n      - run: compile\n      - run: test\n  - name: deploy\n    steps:\n      - run: ship\n'), {
    jobs: [
      { name: 'build', steps: [{ run: 'compile' }, { run: 'test' }] },
      { name: 'deploy', steps: [{ run: 'ship' }] }
    ]
  });
});

test('flow sequence parses scalars', () => {
  assertYamlEqual(parseSafeYaml('a: [1, two, true, null]\n'), { a: [1, 'two', true, null] });
});

test('flow mapping parses scalar entries', () => {
  assertYamlEqual(parseSafeYaml('a: {x: 1, y: two}\n'), { a: { x: 1, y: 'two' } });
});

test('nested flow collections parse', () => {
  assertYamlEqual(parseSafeYaml('a: [{x: [1, 2]}, {y: {z: false}}]\n'), {
    a: [{ x: [1, 2] }, { y: { z: false } }]
  });
});

test('empty flow collections parse', () => {
  assertYamlEqual(parseSafeYaml('a: []\nb: {}\n'), { a: [], b: {} });
});

test('root flow collection parses', () => {
  assertYamlEqual(parseSafeYaml('[1, {a: 2}]'), [1, { a: 2 }]);
});

test('multiline flow sequence parses', () => {
  assertYamlEqual(parseSafeYaml('a: [\n  one,\n  two,\n  3\n]\n'), { a: ['one', 'two', 3] });
});

test('multiline flow mapping parses', () => {
  assertYamlEqual(parseSafeYaml('a: {\n  x: 1,\n  y: [2, 3]\n}\n'), { a: { x: 1, y: [2, 3] } });
});

test('flow comments parse outside scalars', () => {
  assertYamlEqual(parseSafeYaml('a: [1, 2] # comment\nb: two # another\n'), { a: [1, 2], b: 'two' });
});

test('quoted comment characters are not comments', () => {
  assertYamlEqual(parseSafeYaml('a: "x # y"\nb: \'#\'\n'), { a: 'x # y', b: '#' });
});

test('plain scalar hash without whitespace is not a comment', () => {
  assertYamlEqual(parseSafeYaml('a: x#y\n'), { a: 'x#y' });
});

test('root plain scalar parses', () => {
  assert.equal(parseSafeYaml('hello world'), 'hello world');
});

test('root quoted scalar parses', () => {
  assert.equal(parseSafeYaml('"hello world"'), 'hello world');
});

test('explicit document marker parses', () => {
  assertYamlEqual(parseSafeYaml('---\na: 1\n'), { a: 1 });
});

test('document end marker parses', () => {
  assertYamlEqual(parseSafeYaml('a: 1\n...\n'), { a: 1 });
});

test('yaml 1.2 directive parses', () => {
  assertYamlEqual(parseSafeYaml('%YAML 1.2\n---\na: 1\n'), { a: 1 });
});

test('single document API rejects a second document', () => {
  assertCode(() => parseSafeYaml('a: 1\n---\nb: 2\n'), 'YAMLCAGE_MULTI_DOCUMENT');
});

test('document API parses two explicit documents', () => {
  assertYamlEqual(parseSafeYamlDocuments('---\na: 1\n---\nb: 2\n'), [{ a: 1 }, { b: 2 }]);
});

test('document API parses implicit first document', () => {
  assertYamlEqual(parseSafeYamlDocuments('a: 1\n---\nb: 2\n'), [{ a: 1 }, { b: 2 }]);
});

test('document API parses explicit end then start', () => {
  assertYamlEqual(parseSafeYamlDocuments('a: 1\n...\n---\nb: 2\n'), [{ a: 1 }, { b: 2 }]);
});

test('empty explicit document parses as null', () => {
  assertYamlEqual(parseSafeYamlDocuments('---\n'), [null]);
});

test('content after document end without a new start is rejected', () => {
  assertCode(() => parseSafeYamlDocuments('a: 1\n...\nb: 2\n'), 'YAMLCAGE_SYNTAX_ERROR');
});

test('inline content after document start is outside the subset', () => {
  assertCode(() => parseSafeYaml('--- value\n'), 'YAMLCAGE_SYNTAX_ERROR');
});

test('unsupported directive is rejected', () => {
  assertCode(() => parseSafeYaml('%YAML 1.1\n---\na: 1\n'), 'YAMLCAGE_SYNTAX_ERROR');
});

test('tab indentation is rejected', () => {
  assertCode(() => parseSafeYaml('a:\n\tb: 1\n'), 'YAMLCAGE_SYNTAX_ERROR');
});

test('unexpected trailing indented content is rejected', () => {
  assertCode(() => parseSafeYaml('a: 1\n  stray: 2\n'), 'YAMLCAGE_SYNTAX_ERROR');
});

test('two root scalar lines are rejected', () => {
  assertCode(() => parseSafeYaml('one\ntwo\n'), 'YAMLCAGE_SYNTAX_ERROR');
});

test('mapping key without value is null', () => {
  assertYamlEqual(parseSafeYaml('a:\nb: 1\n'), { a: null, b: 1 });
});

test('spaces after key colon are ignored', () => {
  assertYamlEqual(parseSafeYaml('a:    value\n'), { a: 'value' });
});

test('unquoted key may contain spaces', () => {
  assertYamlEqual(parseSafeYaml('display name: worker\n'), { 'display name': 'worker' });
});

test('single-quoted key containing colon parses', () => {
  assertYamlEqual(parseSafeYaml("'a:b': 1\n"), { 'a:b': 1 });
});

test('double-quoted key containing colon parses', () => {
  assertYamlEqual(parseSafeYaml('"a:b": 1\n'), { 'a:b': 1 });
});

test('escaped double-quoted key decodes before use', () => {
  assertYamlEqual(parseSafeYaml('"a\\u0041": 1\n'), { aA: 1 });
});

test('single quoted key quote escape decodes before use', () => {
  assertYamlEqual(parseSafeYaml("'it''s': 1\n"), { "it's": 1 });
});

test('empty quoted key parses', () => {
  assertYamlEqual(parseSafeYaml('"": 1\n'), { '': 1 });
});

test('colon in plain URL value remains text', () => {
  assertYamlEqual(parseSafeYaml('url: https://example.invalid/path\n'), { url: 'https://example.invalid/path' });
});

test('hash in double quoted scalar remains text', () => {
  assertYamlEqual(parseSafeYaml('a: "one # two"\n'), { a: 'one # two' });
});

test('flow plain scalar may contain spaces', () => {
  assertYamlEqual(parseSafeYaml('a: [hello world, second value]\n'), { a: ['hello world', 'second value'] });
});

test('CRLF input is normalized', () => {
  assertYamlEqual(parseSafeYaml('a: 1\r\nb: 2\r\n'), { a: 1, b: 2 });
});

test('CR input is normalized', () => {
  assertYamlEqual(parseSafeYaml('a: 1\rb: 2\r'), { a: 1, b: 2 });
});

for (const scalar of ['true', 'false', 'null', '~', '123', 'plain text']) {
  test('root scalar round trip case ' + JSON.stringify(scalar), () => {
    assert.notEqual(parseSafeYaml(scalar), undefined);
  });
}

for (let depth = 1; depth <= 12; depth += 1) {
  test('valid nested mapping depth ' + depth, () => {
    let yaml = '';
    for (let level = 0; level < depth; level += 1) yaml += ' '.repeat(level * 2) + 'k' + level + ':\n';
    yaml += ' '.repeat(depth * 2) + 'value: end\n';
    assert.notEqual(parseSafeYaml(yaml), null);
  });
}

for (let length = 1; length <= 20; length += 1) {
  test('valid sequence length ' + length, () => {
    const yaml = Array.from({ length }, (_, index) => '- item' + index).join('\n') + '\n';
    const value = parseSafeYaml(yaml);
    assert.equal(value.length, length);
  });
}

for (const input of [
  'a: [1, 2',
  'a: {x: 1',
  'a: [1,, 2]',
  'a: {x}',
  'a: "unterminated',
  "a: 'unterminated",
  'a: [1] trailing',
  ': missing-key',
  '- a: 1\nbad'
]) {
  test('malformed input is rejected ' + JSON.stringify(input), () => {
    assertCode(() => parseSafeYaml(input), 'YAMLCAGE_SYNTAX_ERROR');
  });
}

test('directive after document content is rejected', () => {
  assertCode(() => parseSafeYaml('a: 1\n%YAML 1.2\n'), 'YAMLCAGE_SYNTAX_ERROR');
});

test('directive after a document start marker is rejected', () => {
  assertCode(() => parseSafeYaml('---\n%YAML 1.2\na: 1\n'), 'YAMLCAGE_SYNTAX_ERROR');
});

test('duplicate yaml version directive is rejected', () => {
  assertCode(() => parseSafeYaml('%YAML 1.2\n%YAML 1.2\n---\na: 1\n'), 'YAMLCAGE_SYNTAX_ERROR');
});

test('yaml directive is accepted before a later explicit document', () => {
  assertYamlEqual(parseSafeYamlDocuments('---\na: 1\n...\n%YAML 1.2\n---\nb: 2\n'), [{ a: 1 }, { b: 2 }]);
});

test('single document parser stops at a second document before parsing its contents', () => {
  assertCode(() => parseSafeYaml('a: 1\n---\nb: *undefined\n'), 'YAMLCAGE_MULTI_DOCUMENT');
});

test('first document syntax errors still precede multi-document rejection', () => {
  assertCode(() => parseSafeYaml('a: [\n---\nb: 2\n'), 'YAMLCAGE_SYNTAX_ERROR');
});

test('flow mapping scalar-looking keys remain strings like block keys', () => {
  assertYamlEqual(parseSafeYaml('{123: x, true: y, 010: z}\n'), { 123: 'x', true: 'y', '010': 'z' });
});

test('flow mapping unquoted and quoted numeric-looking keys are duplicates', () => {
  assertCode(() => parseSafeYaml('{123: x, "123": y}\n'), 'YAMLCAGE_DUPLICATE_KEY');
});

test('multiline double-quoted scalars fail closed in flow collections', () => {
  assertCode(() => parseSafeYaml('a: ["one\n two"]\n'), 'YAMLCAGE_SYNTAX_ERROR');
});

test('multiline single-quoted scalars fail closed in flow collections', () => {
  assertCode(() => parseSafeYaml("a: ['one\n two']\n"), 'YAMLCAGE_SYNTAX_ERROR');
});
