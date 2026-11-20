import { redirect } from 'next/navigation';

// Phase 1: Overview 화면 없이 프로젝트 목록으로 (08 열린 질문 2)
export default function AaIndexPage() {
  redirect('/aa/projects');
}
