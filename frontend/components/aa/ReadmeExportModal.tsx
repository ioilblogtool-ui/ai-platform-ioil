'use client';

// SCR-16 README.md 내보내기 (Sprint 4 Step 5 · RDM-02~04 · S4-7~S4-9).
// 기준은 Draft. 구역 3개를 켜고 끈다. 경고(IP·내부 도메인·이메일)는 확인 후 진행, 차단(키·토큰)은 내보낼 수 없다.
// 복사·다운로드 직전에 같은 요청을 다시 보내 미리보기와 같을 때만 출력한다.
import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@/components/Button';
import MarkdownPreview from '@/components/MarkdownPreview';
import { AaApiError, exportReadme } from '@/lib/aa/architecture-api';
import type { ReadmeExportResult, ReadmeSections, SensitiveScanDetails } from '@/lib/aa/architecture-types';
import { basisLabel, classifyScan, recheckDecision, ruleLabel, type ExportOutcome } from '@/lib/aa/export-flow';
import BasisSelect, { toSource, useBasisFlows, type BasisValue } from '@/components/aa/BasisSelect';

const SECTION_LABELS: [Exclude<keyof ReadmeSections, 'apiFlows'>, string][] = [
  ['overview', '프로젝트 개요'], ['logicalDiagram', 'Logical 구성도 (Mermaid)'], ['nfr', '비기능 요구사항 (NFR)'],
  // Sprint 7: 배치안이 있을 때만 내용이 생긴다 (기본 꺼짐)
  ['deployment', '배포 구성 (배치안)'], ['deployStrategy', '배포 전략'],
];

async function requestExport(projectId: string, sections: ReadmeSections, basis: BasisValue, ack: string | null): Promise<ExportOutcome> {
  try {
    const result = await exportReadme(projectId, { format: 'readme-md', source: toSource(basis), sections, acknowledgedScan: ack });
    return { kind: 'ok', result };
  } catch (error) {
    if (error instanceof AaApiError && error.status === 422) {
      const classified = classifyScan(error.details);
      if (classified) return classified;
    }
    return { kind: 'error', message: error instanceof Error ? error.message : '내보내지 못했습니다.' };
  }
}

export default function ReadmeExportModal({ projectId, projectName, onClose }: { projectId: string; projectName: string; onClose: () => void }) {
  const [sections, setSections] = useState<ReadmeSections>({ overview: true, logicalDiagram: true, nfr: true, deployment: false, deployStrategy: false });
  const [basis, setBasis] = useState<BasisValue>('latest');   // RDM-02: 기본은 최신 발행본
  const [preview, setPreview] = useState<ReadmeExportResult | null>(null);
  const [scan, setScan] = useState<SensitiveScanDetails | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [raw, setRaw] = useState(false);
  const seq = useRef(0);

  const show = useCallback((outcome: ExportOutcome, usedAck: string | null) => {
    if (outcome.kind === 'ok') { setPreview(outcome.result); setScan(null); setAck(usedAck); setError(null); return; }
    // 경고·차단·오류에서는 이전 미리보기를 출력에 쓸 수 없게 지운다
    setPreview(null);
    setAck(null);
    if (outcome.kind === 'error') { setScan(null); setError(outcome.message); }
    else { setScan(outcome.details); setError(null); }
  }, []);

  const load = useCallback(async (next: ReadmeSections, useAck: string | null, nextBasis: BasisValue) => {
    const my = ++seq.current;
    setBusy(true);
    const outcome = await requestExport(projectId, next, nextBasis, useAck);
    if (my !== seq.current) return;
    show(outcome, useAck);
    setBusy(false);
  }, [projectId, show]);

  useEffect(() => { void load(sections, null, basis); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const flows = useBasisFlows(projectId, basis);
  function toggleFlow(flowId: string) {
    const cur = sections.apiFlows ?? [];
    const next = { ...sections, apiFlows: cur.includes(flowId) ? cur.filter((x) => x !== flowId) : [...cur, flowId] };
    setSections(next);
    setNotice(null);
    void load(next, null, basis);
  }

  function toggle(key: Exclude<keyof ReadmeSections, 'apiFlows'>) {
    const next = { ...sections, [key]: !sections[key] };
    setSections(next);
    setNotice(null);
    void load(next, null, basis);   // 구역이 바뀌면 이전 확인은 무효
  }

  async function output(kind: 'copy' | 'download') {
    if (!preview) return;
    const my = ++seq.current;
    setBusy(true);
    setNotice(null);
    const outcome = await requestExport(projectId, sections, basis, ack);
    if (my !== seq.current) return;
    setBusy(false);
    const decision = recheckDecision(preview, outcome);
    if (decision.action === 'refresh') {
      setPreview(decision.result);
      setNotice('그 사이 설계·개요 또는 최신 발행본이 바뀌었습니다. 갱신된 미리보기를 확인한 뒤 다시 누르세요.');
      return;
    }
    if (decision.action === 'warn' || decision.action === 'block' || decision.action === 'error') {
      show(outcome, null);
      setNotice(decision.action === 'warn' ? '내보낼 내용에 새 경고가 생겼습니다. 확인한 뒤 다시 내보내세요.' : null);
      return;
    }
    const { content, filename } = decision.result;
    if (kind === 'copy') {
      try {
        await navigator.clipboard.writeText(content);
        setNotice('README.md 내용을 복사했습니다.');
      } catch {
        setNotice('클립보드에 복사하지 못했습니다. 다운로드를 이용하세요.');
      }
    } else {
      const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`${filename} 파일을 내려받았습니다.`);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
      <div role="dialog" aria-modal="true" aria-label="README.md 내보내기" data-testid="aa-readme-dialog" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(980px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: '#111114', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'rgba(255,255,255,0.9)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <b style={{ fontSize: 15 }}>README.md 내보내기</b>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{projectName}</span>
          <span data-testid="aa-readme-basis" style={{ fontSize: 12, color: '#c8a96e' }}>
            {preview ? `기준: ${basisLabel(preview.basis)}` : ''}
          </span>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>닫기</Button>
        </div>

        <div style={{ padding: '12px 20px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13 }}>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>기준</span>
          <BasisSelect projectId={projectId} value={basis} allowLatest testId="aa-readme-source"
            onChange={(v) => { const next = { ...sections, apiFlows: [] }; setSections(next); setBasis(v); setNotice(null); void load(next, null, v); }} />
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>포함할 구역</span>
          {SECTION_LABELS.map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={sections[key]} onChange={() => toggle(key)} data-testid={`aa-readme-section-${key}`} />{label}
            </label>
          ))}
          {flows && flows.length > 0 && (
            <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }} data-testid="aa-readme-flows">
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>API Flow</span>
              {flows.map((f) => (
                <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={(sections.apiFlows ?? []).includes(f.id)} onChange={() => toggleFlow(f.id)} data-testid="aa-readme-flow" />{f.name}
                </label>
              ))}
            </span>
          )}
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>제목·아키텍처 요약은 항상 포함 · 노트·비밀값은 넣지 않습니다</span>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px', minHeight: 260 }}>
          {notice && <div role="status" data-testid="aa-readme-notice" style={{ marginBottom: 10, color: '#f3c97a', fontSize: 13 }}>{notice}</div>}
          {error && <div role="alert" style={{ color: '#f87171' }}>{error}</div>}
          {scan && (
            <div role="alert" data-testid={scan.confirmable ? 'aa-readme-warning' : 'aa-readme-blocked'}
              style={{ padding: 14, borderRadius: 8, background: scan.confirmable ? 'rgba(245,165,36,0.08)' : 'rgba(229,72,77,0.08)', border: `1px solid ${scan.confirmable ? 'rgba(245,165,36,0.35)' : 'rgba(229,72,77,0.4)'}` }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                {scan.confirmable ? '내보낼 내용에 확인이 필요한 값이 있습니다' : '키·토큰으로 보이는 값이 있어 내보낼 수 없습니다'}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
                {scan.issues.slice(0, 20).map((issue, i) => <li key={i}>{ruleLabel(issue.rule)} · {issue.path} · {issue.sample}</li>)}
              </ul>
              {scan.confirmable
                ? <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>외부에 공유해도 되는 값인지 확인하세요. 확인은 10분 동안, 지금 내용 그대로일 때만 유효합니다.</span>
                    <span style={{ flex: 1 }} />
                    <Button variant="primary" disabled={busy} onClick={() => void load(sections, scan.scanId, basis)} data-testid="aa-readme-ack">확인하고 계속</Button>
                  </div>
                : <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>해당 값을 개요·설계에서 지운 뒤 다시 여세요.</div>}
            </div>
          )}
          {preview && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <button onClick={() => setRaw((v) => !v)} style={{ background: 'none', border: 'none', color: '#c8a96e', cursor: 'pointer', fontSize: 12 }}>
                  {raw ? '미리보기로 보기' : '원문 Markdown 보기'}
                </button>
              </div>
              <div data-testid="aa-readme-preview">
                {raw
                  ? <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{preview.content}</pre>
                  : <MarkdownPreview content={preview.content} />}
              </div>
            </>
          )}
          {busy && !preview && !scan && <div style={{ color: 'rgba(255,255,255,0.5)' }}>README를 만드는 중…</div>}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, alignItems: 'center' }}>
          {preview && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{preview.filename} · 약 {preview.approxTokens.toLocaleString()} 토큰</span>}
          <span style={{ flex: 1 }} />
          <Button disabled={!preview || busy} onClick={() => void output('copy')} data-testid="aa-readme-copy">복사</Button>
          <Button variant="primary" disabled={!preview || busy} onClick={() => void output('download')} data-testid="aa-readme-download">README.md 다운로드</Button>
        </div>
      </div>
    </div>
  );
}
