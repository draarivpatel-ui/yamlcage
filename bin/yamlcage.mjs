#!/usr/bin/env node

import fs from 'node:fs';
import {
  YAMLCAGE_VERSION,
  YAMLCAGE_ERROR_CODES,
  auditYaml,
  parseSafeYaml
} from '../src/index.mjs';

const ERROR = YAMLCAGE_ERROR_CODES;
const DEFAULT_MAX_BYTES = 1048576;
const DEFAULT_MAX_DEPTH = 32;

function usage() {
  return [
    'yamlcage ' + YAMLCAGE_VERSION,
    '',
    'Usage:',
    '  yamlcage check <file-or-dash> [--max-bytes N] [--max-depth N] [--multi-doc] [--json]',
    '  yamlcage to-json <file-or-dash> [--strict-integers]',
    '  yamlcage --version',
    '  yamlcage --help',
    '',
    'Use - as the input path to read standard input.',
    'Exit codes: 0 safe, 1 unsafe YAML, 2 usage or input error.'
  ].join('\n');
}

function neutralize(text) {
  return String(text).replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f]/g, '?');
}

function neutralizeDeep(value) {
  if (typeof value === 'string') return neutralize(value);
  if (Array.isArray(value)) return value.map(neutralizeDeep);
  if (value !== null && typeof value === 'object') {
    const output = {};
    for (const key of Object.keys(value)) output[key] = neutralizeDeep(value[key]);
    return output;
  }
  return value;
}

function writeError(message) {
  process.stderr.write('yamlcage: ' + neutralize(message) + '\n');
}

function failUsage(message) {
  writeError(message);
  process.stderr.write('\n' + usage() + '\n');
  process.exitCode = 2;
}

function parseLimit(value) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 4294967295) return null;
  return parsed;
}

function parseCheckArgs(args) {
  const result = {
    json: false,
    multiDoc: false,
    maxBytes: DEFAULT_MAX_BYTES,
    maxDepth: DEFAULT_MAX_DEPTH,
    input: null
  };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--json') {
      if (result.json) return null;
      result.json = true;
      continue;
    }
    if (token === '--multi-doc') {
      if (result.multiDoc) return null;
      result.multiDoc = true;
      continue;
    }
    if (token === '--max-bytes' || token === '--max-depth') {
      if (index + 1 >= args.length) return null;
      const parsed = parseLimit(args[index + 1]);
      if (parsed === null) return null;
      if (token === '--max-bytes') {
        if (result.maxBytes !== DEFAULT_MAX_BYTES) return null;
        result.maxBytes = parsed;
      } else {
        if (result.maxDepth !== DEFAULT_MAX_DEPTH) return null;
        result.maxDepth = parsed;
      }
      index += 1;
      continue;
    }
    if (token.startsWith('--max-bytes=') || token.startsWith('--max-depth=')) {
      const equals = token.indexOf('=');
      const flag = token.slice(0, equals);
      const parsed = parseLimit(token.slice(equals + 1));
      if (parsed === null) return null;
      if (flag === '--max-bytes') {
        if (result.maxBytes !== DEFAULT_MAX_BYTES) return null;
        result.maxBytes = parsed;
      } else {
        if (result.maxDepth !== DEFAULT_MAX_DEPTH) return null;
        result.maxDepth = parsed;
      }
      continue;
    }
    if (token.startsWith('-') && token !== '-') return null;
    if (result.input !== null) return null;
    result.input = token;
  }
  return result.input === null ? null : result;
}

function parseToJsonArgs(args) {
  const result = {
    strictIntegers: false,
    input: null
  };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--strict-integers') {
      if (result.strictIntegers) return null;
      result.strictIntegers = true;
      continue;
    }
    if (token.startsWith('-') && token !== '-') return null;
    if (result.input !== null) return null;
    result.input = token;
  }
  return result.input === null ? null : result;
}

function readAllFromFd(fd, maxBytes) {
  const chunks = [];
  const scratch = Buffer.allocUnsafe(65536);
  let total = 0;
  for (;;) {
    const wanted = Math.min(scratch.length, maxBytes - total + 1);
    const count = fs.readSync(fd, scratch, 0, wanted, null);
    if (count === 0) break;
    total += count;
    if (total > maxBytes) return { oversized: true, actual: total, bytes: null };
    chunks.push(Buffer.from(scratch.subarray(0, count)));
  }
  return { oversized: false, actual: total, bytes: Buffer.concat(chunks, total) };
}

function readInput(input, maxBytes) {
  if (input === '-') return readAllFromFd(0, maxBytes);
  let fd = null;
  try {
    const pathStat = fs.lstatSync(input);
    if (pathStat.isSymbolicLink()) throw new Error('symbolic links are not accepted');
    if (!pathStat.isFile()) throw new Error('input is not a regular file');
    const openFlags = fs.constants.O_RDONLY |
      (fs.constants.O_NOFOLLOW || 0) |
      (fs.constants.O_NONBLOCK || 0);
    fd = fs.openSync(input, openFlags);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('input is not a regular file');
    if (stat.size > maxBytes) return { oversized: true, actual: stat.size, bytes: null };
    return readAllFromFd(fd, maxBytes);
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // A close failure must not mask the already obtained read result.
      }
    }
  }
}

function zeroStats(bytes) {
  return {
    bytes,
    documents: 0,
    nodes: 0,
    maxDepth: 0,
    aliases: 0,
    expandedNodes: 0,
    warnings: 0,
    parsedDocuments: 0
  };
}

function oversizedReport(actual, limit) {
  return {
    safe: false,
    findings: [{
      code: ERROR.MAX_BYTES,
      severity: 'error',
      message: 'maximum YAML byte length exceeded',
      limit,
      actual
    }],
    stats: zeroStats(actual)
  };
}

function printCheckReport(report, json) {
  const clean = neutralizeDeep(report);
  if (json) {
    process.stdout.write(JSON.stringify(clean, null, 2) + '\n');
    return;
  }
  if (clean.safe) {
    process.stdout.write('yamlcage check: safe\n');
    process.stdout.write('bytes: ' + clean.stats.bytes + ', documents: ' + clean.stats.documents + ', nodes: ' + clean.stats.nodes + ', max depth: ' + clean.stats.maxDepth + '\n');
    for (const finding of clean.findings) {
      if (finding.severity !== 'warning') continue;
      const location = typeof finding.line === 'number' ? 'line ' + finding.line + ', column ' + finding.column + ': ' : '';
      process.stdout.write('warning: ' + finding.code + ' ' + location + finding.message + '\n');
    }
    return;
  }
  process.stdout.write('yamlcage check: unsafe\n');
  for (const finding of clean.findings) {
    const location = typeof finding.line === 'number' ? 'line ' + finding.line + ', column ' + finding.column + ': ' : '';
    process.stdout.write('- ' + finding.code + ' ' + location + finding.message + '\n');
  }
}

function runCheck(args) {
  const parsed = parseCheckArgs(args);
  if (parsed === null) {
    failUsage('check requires exactly one input and accepts only --max-bytes, --max-depth, --multi-doc and --json');
    return;
  }
  let input;
  try {
    input = readInput(parsed.input, parsed.maxBytes);
  } catch (error) {
    writeError(error && error.message ? error.message : 'unable to read input');
    process.exitCode = 2;
    return;
  }
  const report = input.oversized
    ? oversizedReport(input.actual, parsed.maxBytes)
    : auditYaml(input.bytes, {
      maxBytes: parsed.maxBytes,
      maxDepth: parsed.maxDepth,
      allowMultiDocument: parsed.multiDoc
    });
  printCheckReport(report, parsed.json);
  process.exitCode = report.safe ? 0 : 1;
}

function runToJson(args) {
  const parsed = parseToJsonArgs(args);
  if (parsed === null) {
    failUsage('to-json requires exactly one input and accepts only --strict-integers');
    return;
  }
  let input;
  try {
    input = readInput(parsed.input, DEFAULT_MAX_BYTES);
  } catch (error) {
    writeError(error && error.message ? error.message : 'unable to read input');
    process.exitCode = 2;
    return;
  }
  if (input.oversized) {
    writeError(ERROR.MAX_BYTES + ': maximum YAML byte length exceeded');
    process.exitCode = 1;
    return;
  }
  try {
    const value = parseSafeYaml(input.bytes, {
      maxBytes: DEFAULT_MAX_BYTES,
      rejectUnsafeIntegers: parsed.strictIntegers
    });
    process.stdout.write(JSON.stringify(value, null, 2) + '\n');
    process.exitCode = 0;
  } catch (error) {
    if (error && error.code) writeError(error.code + ': ' + error.reason);
    else writeError('unable to convert input to JSON');
    process.exitCode = 1;
  }
}

function main(argv) {
  const command = argv[0];
  if (command === '--help' || command === '-h') {
    process.stdout.write(usage() + '\n');
    return;
  }
  if (command === undefined) {
    failUsage('missing command');
    return;
  }
  if (command === '--version' || command === '-v') {
    process.stdout.write('yamlcage ' + YAMLCAGE_VERSION + '\n');
    return;
  }
  if (command === 'check') {
    runCheck(argv.slice(1));
    return;
  }
  if (command === 'to-json') {
    runToJson(argv.slice(1));
    return;
  }
  failUsage('unknown command ' + neutralize(command));
}

main(process.argv.slice(2));
