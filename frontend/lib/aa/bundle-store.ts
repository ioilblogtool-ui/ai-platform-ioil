// 최근 복사한 Ask AI 번들 (Sprint 5 Q4). 탭 세션 동안만(sessionStorage) 프로젝트·사용자별 최대 5개.
// 서버는 번들을 저장하지 않는다 — 답변을 붙여넣을 때 사용자가 고른 번들을 함께 보낸다.
// React·네트워크·다른 lib 모듈 런타임 import 없음. 저장소는 주입한다(테스트·SSR).
import type { ReviewBundle } from './architecture-types';

export const MAX_BUNDLES = 5;
export type StoredBundle = ReviewBundle & { copiedAt: string };
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const bundleKey = (userId: string, projectId: string) => `aa:bundles:${userId}:${projectId}`;

export function readBundles(storage: StorageLike | null, key: string): StoredBundle[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((b) => b && typeof b.bundleId === 'string' && typeof b.bundleMd === 'string') : [];
  } catch {
    return [];
  }
}

/** 새 번들을 맨 앞에. 같은 bundleId는 하나만, 5개 초과분은 버린다. 저장 실패(용량 등)는 false */
export function rememberBundle(storage: StorageLike | null, key: string, bundle: ReviewBundle, now = new Date()): boolean {
  if (!storage) return false;
  const list = [{ ...bundle, copiedAt: now.toISOString() }, ...readBundles(storage, key).filter((b) => b.bundleId !== bundle.bundleId)].slice(0, MAX_BUNDLES);
  try {
    storage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    // 오래된 것부터 줄여서 한 번 더
    try {
      storage.setItem(key, JSON.stringify(list.slice(0, 1)));
      return true;
    } catch {
      return false;
    }
  }
}

export const TEMPLATE_LABEL: Record<string, string> = {
  'design-review': '설계 리뷰', 'failure-scenarios': '장애 시나리오 점검', 'adr-draft': 'ADR 초안',
  'nfr-validation': 'NFR 검증 방법', 'cost-estimate': '비용 추정', explain: '구성 설명', custom: '직접 입력',
};
