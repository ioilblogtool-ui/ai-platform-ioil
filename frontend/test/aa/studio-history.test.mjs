import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { afterEach, beforeEach, test } from 'node:test';

let server;
let requests;
let saveHandler;
const fixture = {
  getAaProject: async () => ({ name: 'History test' }),
  getDraft: async () => ({ ...server, baseVersion: null, updatedAt: '', warnings: [] }),
  getTypeRegistry: async () => null,
  listRequirements: async () => ({ data: [], total: 0 }),
  modelByteSize: (model) => JSON.stringify(model).length,
  saveDraft: (...args) => { requests.push(args); return saveHandler(...args); },
  AaApiError: class AaApiError extends Error {},
  RevisionConflictError: class RevisionConflictError extends Error {},
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
};
globalThis.aaStudioTestFixture = fixture;
const mockUrl = 'data:text/javascript,' + encodeURIComponent(
  'export const {' + Object.keys(fixture).join(',') + '} = globalThis.aaStudioTestFixture;',
);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes('/lib/aa/') && specifier.startsWith('.')) {
      if (['./architecture-api', '../supabase'].includes(specifier)) return { url: mockUrl, shortCircuit: true };
      return nextResolve(specifier + '.ts', context);
    }
    return nextResolve(specifier, context);
  },
});
const { useStudio, HISTORY_LIMIT } = await import('../../lib/aa/studio-store.ts');
hooks.deregister();

const state = () => useStudio.getState();
const label = () => state().model.views[0].nodes[0]?.label;
const summary = { newComponents: 0, reused: 0, newNodes: 0, newRelations: 0, skippedRelations: 0, newGroups: 0 };
beforeEach(async () => {
  server = { revision: 1, model: { schemaVersion: 1, components: {}, relations: {}, flows: {},
    views: [{ id: 'view_logical', kind: 'logical', name: 'Logical', edges: [], nodes: [] }] } };
  requests = [];
  saveHandler = async (_, rev, model) => {
    assert.equal(rev, server.revision);
    server = { revision: rev + 1, model };
    return { revision: server.revision, warnings: [] };
  };
  await state().load('history-test');
  assert.equal(state().saveState, 'saved', state().loadError);
});
afterEach(() => state().leave());

test('undo and redo preserve snapshots, discard the redo path after a new edit, and cap history', () => {
  state().addGroup({ x: 0, y: 0 });
  const id = state().model.views[0].nodes[0].id;
  state().updateGroupLabel(id, 'First');
  state().updateGroupLabel(id, 'Second');
  assert.equal(state().undo(), true);
  assert.equal(label(), 'First');
  assert.equal(state().redo(), true);
  assert.equal(label(), 'Second');
  state().undo();
  state().updateGroupLabel(id, 'New branch');
  assert.equal(state().redo(), false);
  assert.equal(state().baseRevision, 1);
  for (let i = 0; i < HISTORY_LIMIT + 2; i++) state().updateGroupLabel(id, 'Group ' + i);
  assert.equal(state().past.length, HISTORY_LIMIT);
});

test('drag previews produce exactly one undo step', async () => {
  state().addGroup({ x: 0, y: 0 });
  const node = () => state().model.views[0].nodes[0];
  const id = node().id;
  const move = (x, dragging) => state().applyNodeChanges([{ id, type: 'position', dragging, position: { x, y: 0 } }]);
  move(30, true);
  move(60, true);
  assert.equal(state().past.length, 1);
  move(90, false);
  await Promise.resolve();
  assert.equal(state().past.length, 2);
  assert.equal(node().position.x, 90);
  state().undo();
  assert.equal(node().position.x, 0);
});

test('a delayed save preserves an undo and chains the next write to the accepted revision', async () => {
  state().addGroup({ x: 0, y: 0 });
  const original = saveHandler;
  let release;
  saveHandler = (...args) => new Promise((resolve) => { release = () => resolve(original(...args)); });
  const first = state().save();
  assert.equal(state().saveState, 'saving');
  assert.equal(state().undo(), true);
  assert.equal(state().model.views[0].nodes.length, 0);
  assert.equal(state().baseRevision, 1);
  release();
  await first;
  assert.equal(state().saveState, 'dirty');
  assert.equal(state().baseRevision, 2);
  saveHandler = original;
  await state().save();
  assert.equal(requests[1][1], 2);
  assert.deepEqual(server.model, state().model);
});

test('successful import is one edit, failed import is none, and a new edit disables import undo', async () => {
  const build = (model) => ({ model: { ...model, views: [{ ...model.views[0], name: 'Imported' }] }, summary });
  const original = saveHandler;
  saveHandler = async () => { throw Error('Test save failure'); };
  assert.equal((await state().applyImport(build)).status, 'failed');
  assert.equal(state().past.length, 0);
  assert.equal(state().model.views[0].name, 'Logical');
  saveHandler = original;
  assert.equal((await state().applyImport(build)).status, 'saved');
  assert.equal(state().past.length, 1);
  assert.equal(state().undoImport(), true);
  assert.equal(state().model.views[0].name, 'Logical');
  assert.equal(state().baseRevision, 2);
  assert.equal(await state().applyImport(build).then((result) => result.status), 'saved');
  state().addGroup({ x: 0, y: 0 });
  assert.equal(state().undoImport(), false);
  assert.equal(state().model.views[0].nodes.length, 1);
});

test('accepting the server draft clears history', async () => {
  state().addGroup({ x: 0, y: 0 });
  useStudio.setState({ saveState: 'conflict', conflictRevision: 2 });
  await state().reloadServer();
  assert.equal(state().saveState, 'saved');
  assert.equal(state().undo(), false);
  assert.equal(state().redo(), false);
});
