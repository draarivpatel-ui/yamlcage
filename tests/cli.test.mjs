import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runCli, makeScratch } from './helpers.mjs';

test('CLI check accepts a safe file with exit 0', () => {
  const scratch = makeScratch();
  try {
    const file = scratch.file('safe.yml', 'name: worker\ncountry: NO\n');
    const result = runCli(['check', file]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /yamlcage check: safe/);
  } finally {
    scratch.cleanup();
  }
});

test('CLI check accepts safe YAML from standard input', () => {
  const result = runCli(['check', '-'], { input: 'name: stdin\n' });
  assert.equal(result.status, 0, result.stderr);
});

test('CLI check rejects unsafe YAML from standard input', () => {
  const result = runCli(['check', '-'], { input: 'x: &a 1\n' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /YAMLCAGE_ANCHOR_FORBIDDEN/);
});

test('CLI check JSON report is machine readable', () => {
  const result = runCli(['check', '-', '--json'], { input: 'x: &a 1\n' });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.safe, false);
  assert.equal(report.findings.some((finding) => finding.code === 'YAMLCAGE_ANCHOR_FORBIDDEN'), true);
});

test('CLI JSON report includes stats for safe input', () => {
  const result = runCli(['check', '-', '--json'], { input: 'a: 1\n' });
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.safe, true);
  assert.equal(report.stats.bytes, 5);
});

test('CLI multi document input is rejected without flag', () => {
  const result = runCli(['check', '-'], { input: '---\na: 1\n---\nb: 2\n' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /YAMLCAGE_MULTI_DOCUMENT/);
});

test('CLI multi document input is accepted with flag', () => {
  const result = runCli(['check', '-', '--multi-doc'], { input: '---\na: 1\n---\nb: 2\n' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

test('CLI max bytes flag rejects oversized input', () => {
  const result = runCli(['check', '-', '--max-bytes', '4'], { input: 'a: 1\n' });
  assert.equal(result.status, 1);
  const report = result.stdout;
  assert.match(report, /YAMLCAGE_MAX_BYTES/);
});

test('CLI max bytes equals input size is accepted', () => {
  const result = runCli(['check', '-', '--max-bytes', '5'], { input: 'a: 1\n' });
  assert.equal(result.status, 0, result.stderr);
});

test('CLI max depth flag rejects deep input', () => {
  const result = runCli(['check', '-', '--max-depth', '1'], { input: 'a:\n  b: 1\n' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /YAMLCAGE_MAX_DEPTH/);
});

test('CLI max depth flag accepts shallow input', () => {
  const result = runCli(['check', '-', '--max-depth', '2'], { input: 'a:\n  b: 1\n' });
  assert.equal(result.status, 0, result.stderr);
});

test('CLI to-json converts vetted YAML to JSON', () => {
  const result = runCli(['to-json', '-'], { input: 'country: NO\ncount: 2\n' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepStrictEqual(JSON.parse(result.stdout), { country: 'NO', count: 2 });
});

test('CLI to-json preserves null values', () => {
  const result = runCli(['to-json', '-'], { input: 'value:\n' });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).value, null);
});

test('CLI to-json fails closed for aliases', () => {
  const result = runCli(['to-json', '-'], { input: 'x: &a 1\ny: *a\n' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /YAMLCAGE_ANCHOR_FORBIDDEN/);
});

test('CLI to-json strict integers accepts safe integers', () => {
  const result = runCli(['to-json', '-', '--strict-integers'], { input: 'x: 9007199254740991\n' });
  assert.equal(result.status, 0, result.stderr);
});

test('CLI to-json strict integers rejects unsafe integers', () => {
  const result = runCli(['to-json', '-', '--strict-integers'], { input: 'x: 9007199254740992\n' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /YAMLCAGE_UNSAFE_INTEGER/);
});

test('CLI to-json rejects multi document input', () => {
  const result = runCli(['to-json', '-'], { input: '---\na: 1\n---\nb: 2\n' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /YAMLCAGE_MULTI_DOCUMENT/);
});

test('CLI version exits 0', () => {
  const result = runCli(['--version']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^yamlcage 1\.0\.0/);
});

test('CLI help exits 0', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
});

test('CLI missing command exits 2', () => {
  const result = runCli([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /missing command/);
});

test('CLI unknown command exits 2', () => {
  const result = runCli(['unknown']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown command/);
});

test('CLI missing file exits 2', () => {
  const scratch = makeScratch();
  try {
    const result = runCli(['check', path.join(scratch.directory, 'missing.yml')]);
    assert.equal(result.status, 2);
  } finally {
    scratch.cleanup();
  }
});

test('CLI directory input exits 2', () => {
  const scratch = makeScratch();
  try {
    const result = runCli(['check', scratch.directory]);
    assert.equal(result.status, 2);
  } finally {
    scratch.cleanup();
  }
});

if (process.platform !== 'win32') {
  test('CLI symlink input exits 2', () => {
    const scratch = makeScratch();
    try {
      const target = scratch.file('target.yml', 'a: 1\n');
      const link = path.join(scratch.directory, 'link.yml');
      fs.symlinkSync(target, link);
      const result = runCli(['check', link]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /symbolic links are not accepted/);
    } finally {
      scratch.cleanup();
    }
  });

  test('CLI FIFO input exits 2 without blocking', () => {
    const scratch = makeScratch();
    try {
      const fifo = path.join(scratch.directory, 'input.fifo');
      const made = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
      assert.equal(made.status, 0, made.stderr);
      const result = runCli(['check', fifo]);
      assert.equal(result.status, 2);
    } finally {
      scratch.cleanup();
    }
  });

  test('CLI device input exits 2', () => {
    const result = runCli(['check', '/dev/null']);
    assert.equal(result.status, 2);
  });
}

for (const args of [
  ['check'],
  ['check', '-', 'extra'],
  ['check', '-', '--bogus'],
  ['check', '-', '--json', '--json'],
  ['check', '-', '--multi-doc', '--multi-doc'],
  ['check', '-', '--max-bytes'],
  ['check', '-', '--max-bytes', 'abc'],
  ['check', '-', '--max-bytes', '0'],
  ['check', '-', '--max-depth'],
  ['check', '-', '--max-depth', 'abc'],
  ['check', '-', '--max-depth', '0'],
  ['to-json'],
  ['to-json', '-', 'extra'],
  ['to-json', '-', '--bogus'],
  ['to-json', '-', '--strict-integers', '--strict-integers']
]) {
  test('CLI malformed arguments exit 2: ' + args.join(' '), () => {
    const result = runCli(args, { input: 'a: 1\n' });
    assert.equal(result.status, 2);
  });
}

test('CLI error output neutralizes ANSI escape characters', () => {
  const result = runCli(['bad\u001b[31mcommand']);
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes('\u001b'), false);
});

test('CLI error output neutralizes bidi override characters', () => {
  const result = runCli(['bad\u202ecommand']);
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes('\u202e'), false);
});

test('CLI unsafe output does not echo full YAML input', () => {
  const secretish = 'this-line-should-not-appear-in-output';
  const result = runCli(['check', '-'], { input: 'x: &a ' + secretish + '\n' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout.includes(secretish), false);
  assert.equal(result.stderr.includes(secretish), false);
});

test('CLI human safe output includes byte document node and depth stats', () => {
  const result = runCli(['check', '-'], { input: 'a:\n  b: 1\n' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /bytes: 10/);
  assert.match(result.stdout, /documents: 1/);
  assert.match(result.stdout, /max depth: 2/);
});

test('CLI human output prints Norway warning without failing', () => {
  const result = runCli(['check', '-'], { input: 'country: NO\n' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /YAMLCAGE_NORWAY_AMBIGUITY_WARN/);
});

test('CLI file reading enforces size before parse', () => {
  const scratch = makeScratch();
  try {
    const file = scratch.file('large.yml', 'a: 123456\n');
    const result = runCli(['check', file, '--max-bytes', '4']);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /YAMLCAGE_MAX_BYTES/);
  } finally {
    scratch.cleanup();
  }
});

test('CLI to-json reads a regular file', () => {
  const scratch = makeScratch();
  try {
    const file = scratch.file('input.yml', 'a: [1, 2]\n');
    const result = runCli(['to-json', file]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepStrictEqual(JSON.parse(result.stdout), { a: [1, 2] });
  } finally {
    scratch.cleanup();
  }
});
