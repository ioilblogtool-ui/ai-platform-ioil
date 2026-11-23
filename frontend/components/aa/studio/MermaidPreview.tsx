'use client';

// Mermaid 미리보기 (Sprint 8 · Q5 · U4). mermaid는 이 컴포넌트에서만 동적 로드한다(고정 버전 11.17.2).
// securityLevel 'strict' + htmlLabels 끔, 결과 SVG는 <img> data URL로 표시 → SVG 안의 스크립트·링크가 실행될 수 없다.
// 렌더 실패는 원문과 함께 보여준다(구조화 정보 패널은 부모가 따로 보여준다).
import { useEffect, useId, useState } from 'react';

let loader: Promise<typeof import('mermaid').default> | null = null;
function loadMermaid() {
  loader ??= import('mermaid').then((m) => {
    m.default.initialize({
      startOnLoad: false, securityLevel: 'strict', theme: 'dark', htmlLabels: false,
      flowchart: { htmlLabels: false }, sequence: { useMaxWidth: true, mirrorActors: false },
      fontFamily: 'Pretendard, system-ui, sans-serif',
    });
    return m.default;
  });
  return loader;
}

export default function MermaidPreview({ source, label, fallbackSource }: { source: string; label: string; fallbackSource?: string }) {
  const rawId = useId();
  const [state, setState] = useState<{ src: string | null; error: string | null; loading: boolean }>({ src: null, error: null, loading: true });

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    const renderId = `aa-mmd-${rawId.replace(/[^A-Za-z0-9]/g, '')}-${Date.now()}`;
    loadMermaid()
      .then((mermaid) => mermaid.render(renderId, source))
      .then(({ svg }) => {
        if (!alive) return;
        setState({ src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, error: null, loading: false });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        document.getElementById(`d${renderId}`)?.remove();   // mermaid가 남긴 오류 요소 정리
        setState({ src: null, error: e instanceof Error ? e.message.split('\n')[0] : '렌더하지 못했습니다.', loading: false });
      });
    return () => { alive = false; };
  }, [source, rawId]);

  if (state.error) {
    return (
      <div data-testid="aa-flow-preview-error" role="alert" style={{ display: 'grid', gap: 8 }}>
        <div style={{ color: '#f5a524', fontSize: 12.5 }}>⚠ {label}을 그리지 못했습니다: {state.error}</div>
        <pre style={{ margin: 0, padding: 10, borderRadius: 8, background: '#0e0e11', color: 'rgba(255,255,255,0.7)', fontSize: 11.5, overflow: 'auto', maxHeight: 360 }}>{fallbackSource ?? source}</pre>
      </div>
    );
  }
  if (!state.src) return <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12.5 }}>{state.loading ? '다이어그램을 그리는 중…' : ''}</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={state.src} alt={label} data-testid="aa-flow-preview" style={{ maxWidth: '100%', height: 'auto', display: 'block', background: '#0e0e11', borderRadius: 8 }} />;
}
