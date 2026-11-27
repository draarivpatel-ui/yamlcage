import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDirectory = path.join(root, 'tests');
const testFiles = fs.readdirSync(testsDirectory)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => path.join(testsDirectory, name));

if (testFiles.length === 0) {
  console.error('no test files found');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: root,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.signal !== null) {
    console.error('test runner terminated by signal ' + result.signal);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status === null ? 1 : result.status;
  }
}
