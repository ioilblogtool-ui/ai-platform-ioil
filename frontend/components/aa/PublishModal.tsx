'use client';

// SCR-07 Publish Version 모달 (Sprint 6 Step 3 · VER-04 · Q7).
// 열 때 미리보기(GET /versions/preview)를 받고, 그 값(revision·직전 버전·스냅샷 해시)으로 발행한다.
// 서버가 409로 "미리보기가 낡았다"고 하면 새 미리보기를 받아 다시 확인하게 한다.
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import Button from '@/components/Button';
import { AaApiError, getPublishPreview, publishVersion } from '@/lib/aa/architecture-api';
import type { PublishPreview, VersionRef } from '@/lib/aa/architecture-types';
import { LABEL_MAX, NOTE_MAX, layoutNote, publishError, summaryParts } from '@/lib/aa/version-format';

export default function PublishModal({ projectId, onClose, onPublished }: {
  projectId: string;
  onClose: () => void;
  onPublished: (v: VersionRef) => void;
}) {
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (keepInput: boolean) => {
    setBusy(true);
    try {
      const p = await getPublishPreview(projectId);
      setPreview(p);
      if (!keepInput) setLabel(p.suggestedLabel);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : '미리보기를 불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }, [projectId]);

  useEffect(() => { void load(false); }, [load]);

  const trimmed = label.trim();
  const invalid = trimmed.length > LABEL_MAX || note.length > NOTE_MAX;
  const parts = summaryParts(preview?.summary);

  async function submit() {
    if (!preview || preview.noChanges || invalid) return;
    setBusy(true);
    setError(null);
    try {
      const v = await publishVersion(projectId, {
        label: trimmed || undefined, note: note.trim() || undefined,
        baseRevision: preview.revision, expectedLatestVersionId: preview.latestVersion?.id ?? null, snapshotHash: preview.snapshotHash,
      });
      onPublished({ id: v.id, label: v.label, versionNo: v.versionNo });
    } catch (e) {
      const code = e instanceof AaApiError ? e.code : '';
      const { message, refresh } = publishError(code, e instanceof Error ? e.message : '발행하지 못했습니다.');
      setError(message);
      if (refresh) await load(true);   // 입력한 라벨·메모는 유지
      else setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
      <div role="dialog" aria-modal="true" aria-label="버전 발행" data-testid="aa-publish-dialog" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 94vw)', background: '#111114', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <b style={{ fontSize: 15 }}>버전 발행</b>
          <span style={{ fontSize: 12, color: '#c8a96e' }} data-testid="aa-publish-basis">
            {preview ? `Draft rev ${preview.revision}${preview.latestVersion ? ` · 직전 ${preview.latestVersion.label}` : ''}` : ''}
          </span>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>닫기</Button>
        </div>

        <div style={{ padding: '16px 20px', display: 'grid', gap: 14 }}>
          <div data-testid="aa-publish-summary" style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
              변경 요약{preview?.latestVersion ? ` (${preview.latestVersion.label} 대비)` : ''}
            </div>
            {!preview && busy && <span style={muted}>계산 중…</span>}
            {preview && (preview.noChanges
              ? <span data-testid="aa-publish-nochanges" style={{ color: '#f5a524' }}>
                  {preview.layoutOnly ? `배치만 바뀌었습니다 (노드 ${preview.layoutOnly}개). 발행할 변경이 없습니다.` : '직전 버전과 달라진 내용이 없습니다.'}
                </span>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                  {parts.map((t) => <span key={t}>{t}</span>)}
                  {layoutNote(preview.summary) && <span style={muted}>({layoutNote(preview.summary)})</span>}
                </div>)}
          </div>

          {/* Sprint 11 (C2): VM 복귀 대상 미지정·실행 요소 없음 — 발행은 막지 않는다 */}
          {preview?.warnings?.length ? (
            <div data-testid="aa-publish-warnings" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(245,165,36,0.08)', border: '1px solid rgba(245,165,36,0.25)', color: '#f5a524', fontSize: 12.5, display: 'grid', gap: 4 }}>
              {preview.warnings.map((w, i) => <span key={i}>⚠ {w.message}</span>)}
              <span style={{ ...muted, fontSize: 11.5 }}>경고가 있어도 발행할 수 있습니다. 설계 중인 상태가 버전에 그대로 남습니다.</span>
            </div>
          ) : null}

          <label style={field}>
            <span style={fieldLabel}>라벨</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={LABEL_MAX + 10} data-testid="aa-publish-label"
              placeholder={preview?.suggestedLabel ?? 'v1.0'} style={input} />
            <span style={{ ...muted, fontSize: 11 }}>
              {trimmed.length > LABEL_MAX ? <span style={{ color: '#f87171' }}>{LABEL_MAX}자 이하로 입력하세요</span> : `비우면 ${preview?.suggestedLabel ?? '제안값'}`}
            </span>
          </label>
          <label style={field}>
            <span style={fieldLabel}>메모 (선택)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} data-testid="aa-publish-note"
              placeholder="무엇이 바뀌었나요? 예: Reports API 캐시 추가" style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
            {note.length > NOTE_MAX && <span style={{ color: '#f87171', fontSize: 11 }}>{NOTE_MAX}자 이하로 입력하세요</span>}
          </label>
          <span style={{ ...muted, fontSize: 11.5 }}>발행한 버전은 고치거나 지울 수 없습니다. 저장된 Draft 그대로 발행되며 Draft revision은 바뀌지 않습니다.</span>
          {error && <div role="alert" data-testid="aa-publish-error" style={{ color: '#f87171', fontSize: 12.5 }}>{error}</div>}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={busy || !preview || preview.noChanges || invalid} onClick={() => void submit()} data-testid="aa-publish-submit">
            {busy && preview ? '처리 중…' : '발행'}
          </Button>
        </div>
      </div>
    </div>
  );
}

const muted: CSSProperties = { color: 'rgba(255,255,255,0.45)' };
const field: CSSProperties = { display: 'grid', gap: 6 };
const fieldLabel: CSSProperties = { fontSize: 11.5, color: 'rgba(255,255,255,0.45)' };
const input: CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.9)', padding: '7px 9px', fontSize: 13 };
