// 버전 요약·오류 문구 (Sprint 6 Step 3 · SCR-07). React·네트워크 import 없음.
import type { DiffSummary } from './architecture-types';

/** 변경 요약을 짧은 조각들로. 첫 버전이면 전체 수, 아니면 0이 아닌 항목만 */
export function summaryParts(s: DiffSummary | null | undefined): string[] {
  if (!s) return [];
  if (s.first === true) return [`첫 버전 · 컴포넌트 ${s.components} · 관계 ${s.relations}`];
  const parts: [number, string][] = [
    [s.componentsAdded, `+ 컴포넌트 ${s.componentsAdded}`],
    [s.componentsRemoved, `− 컴포넌트 ${s.componentsRemoved}`],
    [s.componentsModified, `~ 컴포넌트 수정 ${s.componentsModified}`],
    [s.relationsAdded, `+ 관계 ${s.relationsAdded}`],
    [s.relationsRemoved, `− 관계 ${s.relationsRemoved}`],
    [s.relationsModified, `~ 관계 수정 ${s.relationsModified}`],
    [s.requirementLinksChanged, `요구사항 연결 ${s.requirementLinksChanged}`],
    [s.requirementsChanged, `요구사항 변경 ${s.requirementsChanged}`],
    [s.nodesReparented, `그룹 이동 ${s.nodesReparented}`],
    [s.viewChanges, `화면 표현 ${s.viewChanges}`],
    [s.strategiesChanged ?? 0, `배포 전략 ${s.strategiesChanged}`],
    [s.flowsAdded ?? 0, `+ API Flow ${s.flowsAdded}`],
    [s.flowsRemoved ?? 0, `− API Flow ${s.flowsRemoved}`],
    [s.flowsModified ?? 0, `~ API Flow ${s.flowsModified}`],
  ];
  return parts.filter(([n]) => n > 0).map(([, text]) => text);
}

/** 배치만 바뀐 노드 수 안내 (요약에서 따로) */
export function layoutNote(s: DiffSummary | null | undefined): string | null {
  if (!s || s.first === true || !s.layoutOnly) return null;
  return `배치만 바뀐 노드 ${s.layoutOnly}개는 제외`;
}

const PUBLISH_ERRORS: Record<string, string> = {
  REVISION_CONFLICT: '그 사이 Draft가 저장되었습니다. 새 미리보기를 확인한 뒤 다시 발행하세요.',
  VERSION_CHANGED: '그 사이 다른 버전이 발행되었습니다. 새 미리보기를 확인하세요.',
  PREVIEW_STALE: '미리보기 뒤 요구사항이 바뀌었습니다. 새 미리보기를 확인하세요.',
  NO_CHANGES: '직전 버전과 달라진 내용이 없습니다.',
  LABEL_TAKEN: '이미 쓰인 라벨입니다. 다른 라벨을 입력하세요.',
  SENSITIVE_DATA_DETECTED: '라벨이나 메모에 키·토큰으로 보이는 값이 있습니다.',
};
/** 발행 오류 → 문구와, 새 미리보기가 필요한지 */
export function publishError(code: string, fallback: string): { message: string; refresh: boolean } {
  return {
    message: PUBLISH_ERRORS[code] ?? fallback,
    refresh: ['REVISION_CONFLICT', 'VERSION_CHANGED', 'PREVIEW_STALE', 'NO_CHANGES'].includes(code),
  };
}

export const LABEL_MAX = 40;
export const NOTE_MAX = 2000;
