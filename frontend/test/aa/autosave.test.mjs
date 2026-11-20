import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutosave, shouldWarnOnLeave } from '../../lib/aa/autosave.ts';
import { readDraftBackup, removeDraftBackup, writeDraftBackup } from '../../lib/aa/draft-backup.ts';

test('debounces edits, supports a retry delay, and cancels on leave', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let saves = 0;
  const controller = createAutosave(() => { saves++; });
  controller.queue();
  t.mock.timers.tick(1000);
  controller.queue();
  t.mock.timers.tick(1999);
  assert.equal(saves, 0);
  t.mock.timers.tick(1);
  assert.equal(saves, 1);
  controller.queue(5000);
  t.mock.timers.tick(4999);
  assert.equal(saves, 1);
  t.mock.timers.tick(1);
  assert.equal(saves, 2);
  controller.queue();
  controller.stop();
  t.mock.timers.tick(5000);
  assert.equal(saves, 2);
});

test('protects recovery ownership, revision, and credentials', (t) => {
  const entries = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key),
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
  const key = 'aa:draft:user-one:project';
  const backup = { model: { views: [] }, revision: 1, editedAt: 1000, tab: 'first' };
  const raw = writeDraftBackup(key, backup);
  assert.equal(readDraftBackup('aa:draft:user-two:project', 1, new Date(0).toISOString()), null);
  assert.equal(readDraftBackup(key, 1, new Date(1000).toISOString()), null);
  assert.deepEqual(readDraftBackup(key, 2, new Date(2000).toISOString()).value, backup);
  assert.equal(writeDraftBackup(key, { ...backup, model: { views: [], password: 'example' } }), null);
  const next = writeDraftBackup(key, { ...backup, tab: 'second' });
  removeDraftBackup(key, raw);
  assert.equal(entries.get(key), next);
  removeDraftBackup(key, next);
  assert.equal(entries.has(key), false);
});

test('uses the injected clock and timer functions', () => {
  let time = 1_700_000_000_000;
  const scheduled = [];
  const cancelled = [];
  let saves = 0;
  const controller = createAutosave(
    () => { saves++; },
    (run, delay) => { const id = scheduled.length; scheduled.push({ run, delay }); return id; },
    (id) => { cancelled.push(id); },
    () => time,
  );
  assert.equal(controller.now(), 1_700_000_000_000);
  time += 2500;
  assert.equal(controller.now(), 1_700_000_002_500);
  controller.queue();
  controller.queue(5000);
  assert.deepEqual(scheduled.map((s) => s.delay), [2000, 5000]);
  assert.deepEqual(cancelled, [0]);
  scheduled[1].run();
  assert.equal(saves, 1);
  controller.stop();
  assert.deepEqual(cancelled, [0]);   // already fired: nothing left to cancel
});

test('warns on leave only while work could be lost', () => {
  const cases = [
    ['saved', true, false, false],
    ['loading', false, false, false],
    ['error', false, false, false],   // load failed: no model to lose
    ['error', true, false, true],     // save failed with edits
    ['dirty', true, false, true],
    ['saving', true, false, true],
    ['conflict', true, false, true],
    ['saved', true, true, true],      // inspector input not yet applied
  ];
  for (const [state, hasModel, pending, expected] of cases) {
    assert.equal(shouldWarnOnLeave(state, hasModel, pending), expected, `${state}/${hasModel}/${pending}`);
  }
});

test('a failing storage write throws so the store can report it and keep the edit', (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
      removeItem: () => {},
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
  const backup = { model: { views: [] }, revision: 1, editedAt: 1000, tab: 'a' };
  assert.throws(() => writeDraftBackup('aa:draft:u:p', backup), { name: 'QuotaExceededError' });
  assert.deepEqual(backup.model, { views: [] });
});
