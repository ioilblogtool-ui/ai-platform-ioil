'use client';

// SCR-06 Architecture Studio — React Flow는 브라우저 전용이라 SSR 없이 로드 (02 §3)
import { use } from 'react';
import dynamic from 'next/dynamic';

const ArchitectureStudio = dynamic(() => import('@/components/aa/studio/ArchitectureStudio'), {
  ssr: false,
  loading: () => <div style={{ height: '100vh', background: '#080809', color: '#5a5870', padding: 24, fontSize: 13 }}>Studio 불러오는 중…</div>,
});

export default function ArchitecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ArchitectureStudio projectId={id} />;
}
