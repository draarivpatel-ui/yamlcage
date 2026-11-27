import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import * as esm from '../src/index.mjs';
import { root, jsonClone } from './helpers.mjs';

const require = createRequire(import.meta.url);
const cjs = require('../cjs/index.cjs');

const publicNames = [
  'YAMLCAGE_VERSION',
  'YAMLCAGE_ERROR_CODES',
  'YAML_CAGE_DEFAULT_OPTIONS',
  'CODE',
  'YamlCageError',
  'parseSafeYaml',
  'parseSafeYamlBytes',
  'parseSafeYamlDocuments',
  'auditYaml',
  'stringifySafeYaml',
  'createYamlCage'
];

test('ESM exports every public API name', () => {
  for (const name of publicNames) assert.equal(typeof esm[name] !== 'undefined', true, name);
});

test('CJS exports every public API name', () => {
  for (const name of publicNames) assert.equal(typeof cjs[name] !== 'undefined', true, name);
});

test('CJS default export points at the module object', () => {
  assert.equal(cjs.default, cjs);
});

test('ESM default export exposes parseSafeYaml', () => {
  assert.equal(esm.default.parseSafeYaml, esm.parseSafeYaml);
});

for (const input of [
  'a: 1\n',
  'a: [1, two, true]\n',
  'a:\n  b:\n    - x\n',
  '- name: first\n- name: second\n',
  'a: {x: [1, 2]}\n'
]) {
  test('CJS and ESM parse parity ' + JSON.stringify(input), () => {
    assert.deepStrictEqual(jsonClone(cjs.parseSafeYaml(input)), jsonClone(esm.parseSafeYaml(input)));
  });
}

for (const input of [
  'a: 1\na: 2\n',
  '__proto__: 1\n',
  'x: &a 1\n',
  'x: !!js/function y\n',
  'x: .nan\n'
]) {
  test('CJS and ESM error parity ' + JSON.stringify(input), () => {
    let esmCode = null;
    let cjsCode = null;
    try { esm.parseSafeYaml(input); } catch (error) { esmCode = error.code; }
    try { cjs.parseSafeYaml(input); } catch (error) { cjsCode = error.code; }
    assert.equal(esmCode, cjsCode);
    assert.notEqual(esmCode, null);
  });
}

test('CJS serializer output matches ESM serializer output', () => {
  const input = { a: 'NO', b: [1, { c: true }] };
  assert.equal(cjs.stringifySafeYaml(input), esm.stringifySafeYaml(input));
});

test('CJS audit output matches ESM audit output', () => {
  assert.deepStrictEqual(jsonClone(cjs.auditYaml('a: NO\n')), jsonClone(esm.auditYaml('a: NO\n')));
});

test('generated CommonJS build is current', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-cjs.mjs'), '--check'], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

test('package metadata name and version are correct', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'yamlcage');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.license, 'MIT');
});

test('package dependency maps are empty', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepStrictEqual(pkg.dependencies, {});
  assert.deepStrictEqual(pkg.devDependencies, {});
});

test('package engine is Node 18 or newer', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.engines.node, '>=18.0.0');
});

test('package exports dual ESM CJS and types entries', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.exports['.'].import, './src/index.mjs');
  assert.equal(pkg.exports['.'].require, './cjs/index.cjs');
  assert.equal(pkg.exports['.'].types, './types/index.d.ts');
});

test('package bin has no leading dot slash', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.bin.yamlcage, 'bin/yamlcage.mjs');
  assert.equal(pkg.bin.yamlcage.startsWith('./'), false);
});

test('package files list includes runtime and documentation assets', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const entry of ['bin', 'src', 'cjs', 'types', 'docs', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'LICENSE']) {
    assert.equal(pkg.files.includes(entry), true, entry);
  }
});

test('test script enumerates test files for Windows Node compatibility', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const runner = fs.readFileSync(path.join(root, 'scripts', 'run-tests.mjs'), 'utf8');
  assert.equal(pkg.scripts.test, 'node scripts/run-tests.mjs');
  assert.equal(runner.includes('fs.readdirSync'), true);
  assert.equal(runner.includes("'--test'"), true);
});

if (process.platform !== 'win32') {
  test('CLI file is executable on POSIX', () => {
    const mode = fs.statSync(path.join(root, 'bin', 'yamlcage.mjs')).mode;
    assert.notEqual(mode & 0o111, 0);
  });
}

test('CLI has a node shebang', () => {
  const firstLine = fs.readFileSync(path.join(root, 'bin', 'yamlcage.mjs'), 'utf8').split('\n')[0];
  assert.equal(firstLine, '#!/usr/bin/env node');
});

test('TypeScript declarations include every public API name', () => {
  const types = fs.readFileSync(path.join(root, 'types', 'index.d.ts'), 'utf8');
  for (const name of publicNames) assert.equal(types.includes(name), true, name);
});

test('required documentation files exist', () => {
  for (const file of ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'LICENSE', 'docs/GOOD_FIRST_ISSUES.md']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
});

test('GitHub community files exist', () => {
  for (const file of ['.github/workflows/ci.yml', '.github/PULL_REQUEST_TEMPLATE.md', '.github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/feature_request.yml']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
});

test('license is the MIT license', () => {
  const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
  assert.match(license, /^MIT License/);
  assert.match(license, /Permission is hereby granted/);
});

test('gitattributes enforces LF line endings', () => {
  const attributes = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  for (const pattern of ['*.mjs', '*.cjs', '*.js', '*.ts', '*.json', '*.md', '*.yml']) {
    assert.equal(attributes.includes(pattern + ' text eol=lf'), true, pattern);
  }
});

test('CI covers required operating systems and Node versions', () => {
  const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  for (const needle of ['ubuntu-24.04', 'windows-latest', 'node: [18, 20, 22, 24]', 'npm test', 'node scripts/build-cjs.mjs --check', 'node scripts/cli-smoke.mjs', 'npm pack --dry-run']) {
    assert.equal(ci.includes(needle), true, needle);
  }
});

test('node_modules is absent from the source tree', () => {
  assert.equal(fs.existsSync(path.join(root, 'node_modules')), false);
});

function repositoryFiles(directory = root, prefix = '') {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(directory, entry.name);
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) output.push(...repositoryFiles(full, relative));
    else if (entry.isFile()) output.push(relative);
  }
  return output.sort();
}

test('repository files are valid UTF-8 with LF line endings', () => {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (const file of repositoryFiles()) {
    const bytes = fs.readFileSync(path.join(root, file));
    assert.doesNotThrow(() => decoder.decode(bytes), file);
    assert.equal(bytes.includes(0x0d), false, 'CR or CRLF in ' + file);
  }
});

test('repository files contain no em dash or en dash characters', () => {
  const forbidden = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)];
  for (const file of repositoryFiles()) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const ch of forbidden) assert.equal(text.includes(ch), false, file);
  }
});

test('repository files contain no local absolute paths or private email markers', () => {
  const privateOne = ['someone', 'gmail.com'].join('@');
  const privateTwo = ['handle-redacted286', 'gmail.com'].join('@');
  for (const file of repositoryFiles()) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(text.includes(['', 'Users', ''].join('/')), false, file);
    assert.equal(text.includes(['', 'home', ''].join('/')), false, file);
    assert.equal(text.includes(privateOne), false, file);
    assert.equal(text.includes(privateTwo), false, file);
  }
});

test('repository files contain no coauthor trailer marker', () => {
  const marker = ['Co', 'Authored', 'By:'].join('-');
  for (const file of repositoryFiles()) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(text.includes(marker), false, file);
  }
});

test('README documents the threat model and finding codes', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  for (const needle of ['Billion Laughs', '!!js/function', '!!python/object/apply', 'merge key', '__proto__', 'Duplicate-key', 'Norway', 'multi-document', 'YAMLCAGE_ALIAS_FORBIDDEN']) {
    assert.equal(readme.includes(needle), true, needle);
  }
});

test('README does not claim current npm publication', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.equal(readme.includes('does not assert'), true);
  assert.equal(readme.includes('npm install yamlcage'), false);
});

test('good first issues document contains ten starter specifications', () => {
  const text = fs.readFileSync(path.join(root, 'docs', 'GOOD_FIRST_ISSUES.md'), 'utf8');
  const count = (text.match(/^\d+\. /gm) || []).length;
  assert.equal(count, 10);
});
