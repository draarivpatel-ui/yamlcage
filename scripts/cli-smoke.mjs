import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'yamlcage.mjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'yamlcage-smoke-'));

function run(args, input) {
  return spawnSync(process.execPath, [bin, ...args], {
    input,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });
}

function assert(condition, message) {
  if (!condition) throw new Error('CLI smoke failed: ' + message);
}

try {
  const safeFile = path.join(scratch, 'safe.yml');
  const unsafeFile = path.join(scratch, 'unsafe.yml');
  fs.writeFileSync(safeFile, 'name: yamlcage\ncountry: NO\nitems:\n  - one\n  - two\n', 'utf8');
  fs.writeFileSync(unsafeFile, 'base: &x [1]\ncopy: *x\n', 'utf8');

  const safe = run(['check', safeFile]);
  assert(safe.status === 0, 'safe file should exit 0, got ' + safe.status + ' stderr ' + safe.stderr);

  const unsafe = run(['check', unsafeFile, '--json']);
  assert(unsafe.status === 1, 'unsafe file should exit 1, got ' + unsafe.status);
  const parsed = JSON.parse(unsafe.stdout);
  assert(parsed.safe === false, 'unsafe JSON report should be unsafe');
  assert(parsed.findings.some((finding) => finding.code === 'YAMLCAGE_ANCHOR_FORBIDDEN'), 'unsafe report should identify the anchor');

  const stdin = run(['check', '-'], 'name: stdin\n');
  assert(stdin.status === 0, 'stdin safe input should exit 0, got ' + stdin.status + ' stderr ' + stdin.stderr);

  const json = run(['to-json', safeFile]);
  assert(json.status === 0, 'to-json should exit 0, got ' + json.status + ' stderr ' + json.stderr);
  assert(JSON.parse(json.stdout).country === 'NO', 'to-json should preserve the Norway string');

  const missing = run(['check', path.join(scratch, 'missing.yml')]);
  assert(missing.status === 2, 'missing input should exit 2, got ' + missing.status);

  const version = run(['--version']);
  assert(version.status === 0 && version.stdout.includes('yamlcage '), '--version should print the version');

  process.stdout.write('yamlcage CLI smoke passed\n');
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
