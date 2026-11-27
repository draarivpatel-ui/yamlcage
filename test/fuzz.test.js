import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { CODE, YamlCageError, parseSafeYaml } from '../src/index.mjs';

const keyUnit = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz');
const safeKey = fc.string({ unit: keyUnit, minLength: 1, maxLength: 12 });
const fuzzOptions = { seed: 20261127, numRuns: 110 };

test('fast-check simple safe mappings parse to exact null-prototype values', () => {
  fc.assert(fc.property(
    safeKey,
    fc.oneof(fc.integer({ min: 0, max: 100000 }), fc.boolean(), fc.constant(null)),
    (key, value) => {
      const rendered = value === null ? '' : String(value);
      const parsed = parseSafeYaml(key + ': ' + rendered + '\n');
      assert.equal(Object.getPrototypeOf(parsed), null);
      assert.equal(Object.keys(parsed).length, 1);
      assert.equal(parsed[key], value);
    }
  ), fuzzOptions);
});

test('fast-check prototype pollution keys are always rejected', () => {
  fc.assert(fc.property(fc.constantFrom('__proto__', 'constructor', 'prototype'), (key) => {
    assert.throws(
      () => parseSafeYaml(key + ': 1\n'),
      (error) => error instanceof YamlCageError && error.code === CODE.PROTOTYPE_KEY
    );
  }), fuzzOptions);
});

test('fast-check anchor and alias expansion remains forbidden by default', () => {
  fc.assert(fc.property(safeKey, safeKey, fc.integer({ min: 0, max: 1000 }), (left, right, value) => {
    assert.throws(
      () => parseSafeYaml(left + ': &fuzz ' + String(value) + '\n' + right + ': *fuzz\n'),
      (error) => error instanceof YamlCageError && (error.code === CODE.ANCHOR_FORBIDDEN || error.code === CODE.ALIAS_FORBIDDEN)
    );
  }), fuzzOptions);
});
