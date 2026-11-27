import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const bin = path.join(root, 'bin', 'yamlcage.mjs');

export function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function assertYamlEqual(actual, expected) {
  assert.deepStrictEqual(jsonClone(actual), expected);
}

export function assertCode(fn, code) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, 'expected an error with code ' + code);
  assert.equal(thrown.code, code, 'unexpected error: ' + thrown.message);
  return thrown;
}

export function runCli(args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    input: options.input,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    cwd: options.cwd || root
  });
}

export function makeScratch(prefix = 'yamlcage-test-') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  let cleaned = false;
  return {
    directory,
    file(name, content) {
      const target = path.join(directory, name);
      fs.writeFileSync(target, content);
      return target;
    },
    cleanup() {
      if (!cleaned) {
        cleaned = true;
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  };
}

export function repeatJoin(count, separator, make) {
  const parts = [];
  for (let index = 0; index < count; index += 1) parts.push(make(index));
  return parts.join(separator);
}
