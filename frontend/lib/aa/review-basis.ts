// 리뷰 기준 표시 (Sprint 6 Step 5 · REV-M6 · Q13·Q16). React·네트워크 import 없음.
import type { ReviewListItem } from './architecture-types';

type Basis = Pick<ReviewListItem, 'target' | 'current' | 'staleBasis' | 'bundleLinked'>;

/** "v1.0 기준" / "Draft rev 3 기준" (+ 번들 미연결) */
export function targetLabel(r: Basis): string {
  const t = r.target.type === 'version' ? `${r.target.label ?? '버전'} 기준` : `Draft rev ${r.target.revision} 기준`;
  return r.bundleLinked ? t : `번들 미연결 · ${t}`;
}

/** 낡은 기준이면 "현재 v1.1" / "현재 rev 7", 아니면 null */
export function staleNote(r: Basis): string | null {
  if (!r.staleBasis) return null;
  return r.current.type === 'version' ? `현재 ${r.current.label}` : `현재 rev ${r.current.revision}`;
}

const RECORD: Record<ReviewListItem['requirementsRecord'], string> = {
  version: '당시 요구사항은 이 버전의 발행 기록에 있습니다 (버전 페이지).',
  bundle: '당시 요구사항은 아래 보낸 검토 자료에 들어 있습니다.',
  none: '번들 없이 저장한 리뷰라 당시 요구사항 기록이 없습니다.',
};
export const requirementsRecordNote = (r: Pick<ReviewListItem, 'requirementsRecord'>) => RECORD[r.requirementsRecord];
