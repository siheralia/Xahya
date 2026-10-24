import test from 'node:test';
import assert from 'node:assert/strict';

test('the test runner executes assertions', () => {
  assert.equal(2 + 2, 4);
});
