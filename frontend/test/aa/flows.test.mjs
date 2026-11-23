// Sprint 8 Step 3 — API Flow: Mermaid 변환(Q5)·흐름 연산(Q6)·강조(FLW-06)·삭제 정리 (S8-4)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { encodeLabel, fromEditorText, renderSource, sanitizeBody, templateBody, toEditorText, unknownIdentifiers } from '../../lib/aa/flow-mermaid.ts';
import * as F from '../../lib/aa/flow-ops.ts';
import { deleteSummary, removeNodes, updateComponentText } from '../../lib/aa/model-ops.ts';

const require = createRequire(import.meta.url);
const sample = require('../../../backend/lib/aa/templates/sample-reports.js');
const model = () => sample.model();
const FID = 'flw_reportlist';
const rand = (() => { let i = 0; return () => ((i++ * 7919) % 1000) / 1000; })();

describe('flow-mermaid: 식별자 위치만 변환', () => {
  it('stored ⇄ editor round trip; message text with the same word is untouched', () => {
    const parts = ['cmp_a', 'cmp_b'];
    const stored = ['sequenceDiagram', '  participant cmp_a', '  participant cmp_b', '  cmp_a->>+cmp_b: cmp_a 가 cmp_b 에 요청', '  Note over cmp_a,cmp_b: cmp_b', '  alt cmp_a 성공', '    cmp_b-->>-cmp_a: ok', '  end', '  activate cmp_b'].join('\n');
    const editor = toEditorText(stored, parts);
    assert.ok(editor.includes('  C1->>+C2: cmp_a 가 cmp_b 에 요청'));
    assert.ok(editor.includes('  Note over C1,C2: cmp_b'));
    assert.ok(editor.includes('  alt cmp_a 성공'), 'alt text not converted');
    assert.ok(editor.includes('  activate C2'));
    assert.equal(fromEditorText(editor, parts), stored);
  });

  it('reordering participants keeps message targets (stored ids are componentIds)', () => {
    const m = model();
    const before = m.flows[FID].mermaid;
    const r = F.moveParticipant(m, FID, 'cmp_auth', 1);
    assert.equal(r.model.flows[FID].mermaid, before, 'body unchanged');
    assert.deepEqual(r.model.flows[FID].participantIds, ['cmp_web_app', 'cmp_reports_api', 'cmp_auth', 'cmp_reports_db']);
    assert.ok(toEditorText(before, r.model.flows[FID].participantIds).includes('C2->>C3: 토큰 검증'), 'aliases follow the new order');
  });

  it('flags identifiers outside the participant list', () => {
    assert.deepEqual(unknownIdentifiers('sequenceDiagram\n  cmp_a->>cmp_x: hi', ['cmp_a', 'cmp_b']), ['cmp_x']);
    assert.deepEqual(unknownIdentifiers('C1->>C3: hi', ['cmp_a', 'cmp_b'], 'editor'), ['C3']);
  });

  it('removes directives, frontmatter and click/link lines before rendering', () => {
    const { text, removed } = sanitizeBody('---\nconfig:\n  securityLevel: loose\n---\nsequenceDiagram\n%%{init: {"securityLevel":"loose"}}%%\n  a->>b: x\n  click a call alert(1)\n  link a: Docs @ javascript:alert(1)\n  links a: {"x":"y"}');
    assert.ok(!/securityLevel|click|javascript|links?\s/.test(text), text);
    assert.deepEqual(removed.sort(), ['%%{init}%% 지시문', 'click', 'frontmatter 설정', 'link', 'links'].sort());
  });

  it('renders names with role icons, encodes labels, declares unknowns as ⚠', () => {
    const m = model();
    m.components.cmp_reports_api.name = 'Reports API <script>alert(1)</script>; x: "y"';
    const flow = structuredClone(m.flows[FID]);
    flow.mermaid += '\n  cmp_ghost->>cmp_web_app: ?';
    const { source, unknown } = renderSource(flow, m);
    assert.ok(source.startsWith('sequenceDiagram\n'));
    assert.ok(source.includes('participant cmp_auth as 🔑 Auth'));
    assert.ok(source.includes('participant cmp_reports_api as 🛡⛁ Reports API #lt;script#gt;alert(1)#lt;/script#gt;#59; x#58; #quot;y#quot;'), source);
    assert.ok(!source.includes('<script>'));
    assert.deepEqual(unknown, ['cmp_ghost']);
    assert.ok(source.includes('participant X_cmp_ghost as ⚠ 알 수 없음'));
    assert.ok(source.includes('X_cmp_ghost->>cmp_web_app: ?'));
    assert.equal(encodeLabel('a#b'), 'a#35;b');
  });

  it('can render with bundle aliases (Ask AI) instead of internal ids', () => {
    const m = model();
    const { source } = renderSource(m.flows[FID], m, { idFor: (_cid, i) => `C${i + 1}`, nameFor: (cid) => m.components[cid].name });
    assert.ok(!source.includes('cmp_'), source);
    assert.ok(source.includes('C3->>C2: 토큰 검증'));
  });

  it('template body uses participant order and outcomes', () => {
    const t = templateBody(['cmp_a', 'cmp_b'], [{ kind: 'success', label: '201 Created' }, { kind: 'failure', label: '400' }]);
    assert.ok(t.includes('cmp_a->>cmp_b: 요청') && t.includes('cmp_b-->>cmp_a: 201 Created') && t.includes('else 실패'));
  });
});

describe('flow-ops', () => {
  it('adds a flow with checks (name, ≥2 logical participants, path)', () => {
    const m = model();
    assert.match(F.addFlow(m, { name: 'x', participantIds: ['cmp_web_app'] }, templateBody, rand).error, /2개 이상/);
    assert.match(F.addFlow(m, { name: 'x', participantIds: ['cmp_web_app', 'cmp_paas_db'] }, templateBody, rand).error, /Logical/);
    assert.match(F.addFlow(m, { name: 'x', participantIds: ['cmp_web_app', 'cmp_auth'], endpoint: { method: 'POST', path: 'no-slash' } }, templateBody, rand).error, /\//);
    const r = F.addFlow(m, { name: ' 로그인 ', participantIds: ['cmp_web_app', 'cmp_auth'], endpoint: { method: 'POST', path: '/auth/login' } }, templateBody, rand);
    const f = r.model.flows[r.flowId];
    assert.match(r.flowId, /^flw_[A-Za-z0-9]{10}$/);
    assert.equal(f.name, '로그인');
    assert.match(f.outcomes[0].id, /^out_[A-Za-z0-9]{6}$/);
    assert.ok(f.mermaid.includes('cmp_web_app->>cmp_auth'));
  });

  it('outcomes: keep one success, max 10, cause set/clear', () => {
    let m = model();
    assert.match(F.removeOutcome(m, FID, 'out_ok2000').error, /성공/);
    assert.match(F.updateOutcome(m, FID, 'out_ok2000', { kind: 'failure' }).error, /성공/);
    m = F.updateOutcome(m, FID, 'out_un4010', { cause: '' }).model;
    assert.equal('cause' in m.flows[FID].outcomes[1], false);
    for (let i = 0; i < 8; i++) m = F.addOutcome(m, FID, 'failure', `5${i}0`, rand).model;
    assert.equal(m.flows[FID].outcomes.length, 10);
    assert.match(F.addOutcome(m, FID, 'failure', 'x', rand).error, /최대/);
  });

  it('removing a participant drops its auth role', () => {
    const m = F.setParticipants(model(), FID, ['cmp_web_app', 'cmp_auth', 'cmp_reports_db']).model;
    assert.deepEqual(m.flows[FID].auth, { tokenIssuer: 'cmp_auth' });
    assert.match(F.setAuthRole(m, FID, 'tokenVerifier', 'cmp_reports_api').error, /참여/);
  });

  it('highlight = participants and calls between them', () => {
    const h = F.flowHighlight(model(), FID);
    assert.deepEqual([...h.componentIds].sort(), ['cmp_auth', 'cmp_reports_api', 'cmp_reports_db', 'cmp_web_app']);
    assert.deepEqual([...h.relationIds].sort(), ['rel_api_auth', 'rel_api_db', 'rel_web_api', 'rel_web_auth']);
    assert.equal(F.flowHighlight(model(), null), null);
  });

  it('renaming a component changes the preview, not the stored body', () => {
    const m = updateComponentText(model(), 'cmp_reports_api', 'name', 'Reports Service');
    assert.equal(m.flows[FID].mermaid, model().flows[FID].mermaid);
    assert.ok(renderSource(m.flows[FID], m).source.includes('as 🛡⛁ Reports Service'));
  });
});

describe('컴포넌트 삭제와 흐름 (Q6·Q12)', () => {
  it('summary counts affected flows and flows left with < 2 participants', () => {
    let m = model();
    m = F.setParticipants(m, FID, ['cmp_web_app', 'cmp_reports_api']).model;
    const nodeApi = m.views[0].nodes.find((n) => n.componentId === 'cmp_reports_api').id;
    const s = deleteSummary(m, 'view_logical', [nodeApi]);
    assert.equal(s.flowCount, 1);
    assert.deepEqual(s.flowsUnderTwo, ['리포트 목록 조회']);
    const after = removeNodes(m, 'view_logical', [nodeApi], { deleteComponents: true });
    assert.equal(after.flows[FID], undefined, 'confirmed delete removes the under-two flow');
  });

  it('deleting one of four participants keeps the flow, drops roles, body flagged as mismatch', () => {
    const m = model();
    const nodeDb = m.views[0].nodes.find((n) => n.componentId === 'cmp_reports_db').id;
    const after = removeNodes(m, 'view_logical', [nodeDb], { deleteComponents: true });
    const f = after.flows[FID];
    assert.deepEqual(f.participantIds, ['cmp_web_app', 'cmp_auth', 'cmp_reports_api']);
    assert.equal(f.mermaid, m.flows[FID].mermaid, 'body untouched');
    assert.deepEqual(renderSource(f, after).unknown, ['cmp_reports_db']);
  });

  it('node-only removal does not touch flows', () => {
    const m = model();
    const nodeDb = m.views[0].nodes.find((n) => n.componentId === 'cmp_reports_db').id;
    assert.deepEqual(removeNodes(m, 'view_logical', [nodeDb], { deleteComponents: false }).flows, m.flows);
  });

  it('repairFlows (load time) removes dangling refs but never deletes flows', () => {
    const m = model();
    delete m.components.cmp_reports_db;   // 롤백 기간에 생긴 끊긴 참조 흉내
    m.flows.flw_twoparts1 = { ...structuredClone(m.flows[FID]), id: 'flw_twoparts1', participantIds: ['cmp_web_app', 'cmp_gone'], auth: { tokenIssuer: 'cmp_gone' } };
    const r = F.repairFlows(m);
    assert.deepEqual(r.model.flows[FID].participantIds, ['cmp_web_app', 'cmp_auth', 'cmp_reports_api']);
    assert.deepEqual(r.model.flows.flw_twoparts1.participantIds, ['cmp_web_app'], 'kept, not deleted');
    assert.equal(r.model.flows.flw_twoparts1.auth, undefined);
    assert.deepEqual(r.underTwo, ['flw_twoparts1']);
    assert.equal(r.removed, 3, 'db participant + dataAccessor? no — db had no role; gone participant + its role');
  });
});

describe('후속 수정: create participant·메타데이터 (미리보기·편집기)', () => {
  it('converts create participant and keeps @{ } metadata in the editor but drops it in the preview', () => {
    const parts = ['cmp_a', 'cmp_b'];
    const stored = 'sequenceDiagram\n  participant cmp_a\n  create participant cmp_b@{ "type": "database" }\n  cmp_a->>cmp_b: 생성';
    const editor = toEditorText(stored, parts);
    assert.ok(editor.includes('  create participant C2@{ "type": "database" }'), editor);
    assert.equal(fromEditorText(editor, parts), stored);
    const m = { components: { cmp_a: { name: 'A' }, cmp_b: { name: 'B' } } };
    const { source, unknown } = renderSource({ id: 'flw_x', name: 'x', participantIds: parts, outcomes: [], requirementIds: [], mermaid: stored }, m);
    assert.ok(source.includes('  create participant cmp_b as B'), source);
    assert.ok(!source.includes('@{'));
    assert.deepEqual(unknown, []);
  });
});
