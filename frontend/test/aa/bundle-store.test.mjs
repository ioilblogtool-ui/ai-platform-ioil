// Sprint 5 Q4 — 이 탭의 최근 Ask AI 번들 (최대 5개, 사용자·프로젝트별)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bundleKey, MAX_BUNDLES, readBundles, rememberBundle } from '../../lib/aa/bundle-store.ts';

function memory({ failOver = Infinity } = {}) {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (v.length > failOver) throw new Error('QuotaExceededError'); map.set(k, v); },
  };
}
const bundle = (n, extra = {}) => ({
  bundleId: `bx_${String(n).padStart(10, '0')}`, format: 'ai-md', basis: { revision: n }, scopeLabel: '프로젝트 전체',
  scope: { type: 'project' }, template: 'design-review', question: '', bundleMd: `# bundle ${n}`, ...extra,
});

describe('bundle store', () => {
  it('keys by user and project', () => {
    assert.equal(bundleKey('u1', 'p1'), 'aa:bundles:u1:p1');
    const s = memory();
    rememberBundle(s, bundleKey('u1', 'p1'), bundle(1));
    assert.equal(readBundles(s, bundleKey('u2', 'p1')).length, 0);
    assert.equal(readBundles(s, bundleKey('u1', 'p2')).length, 0);
  });

  it('keeps the newest first, at most five, without duplicates', () => {
    const s = memory();
    const key = bundleKey('u', 'p');
    for (let i = 1; i <= 7; i++) rememberBundle(s, key, bundle(i), new Date(2026, 10, 22, 10, i));
    rememberBundle(s, key, bundle(5));   // 다시 복사하면 맨 앞으로
    const list = readBundles(s, key);
    assert.equal(list.length, MAX_BUNDLES);
    assert.deepEqual(list.map((b) => b.basis.revision), [5, 7, 6, 4, 3]);
    assert.ok(list[0].copiedAt);
  });

  it('survives broken or missing storage', () => {
    const s = memory();
    s.map.set('k', '{not json');
    assert.deepEqual(readBundles(s, 'k'), []);
    s.map.set('k', JSON.stringify([{ bundleId: 1 }, bundle(1)]));
    assert.equal(readBundles(s, 'k').length, 1, 'drops malformed entries');
    assert.deepEqual(readBundles(null, 'k'), []);
    assert.equal(rememberBundle(null, 'k', bundle(1)), false);
  });

  it('falls back to the latest bundle only when the quota is exceeded', () => {
    const one = JSON.stringify([{ ...bundle(9), copiedAt: new Date().toISOString() }]).length;
    const s = memory({ failOver: one + 10 });
    const key = 'k';
    assert.equal(rememberBundle(s, key, bundle(1)), true);
    assert.equal(rememberBundle(s, key, bundle(2)), true);
    assert.deepEqual(readBundles(s, key).map((b) => b.basis.revision), [2]);
    const tiny = memory({ failOver: 5 });
    assert.equal(rememberBundle(tiny, key, bundle(3)), false);
  });
});
