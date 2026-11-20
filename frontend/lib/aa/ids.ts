// 모델 id 생성: 접두사 + 10자 (D-06: crypto.randomUUID 기반, 의존성 없음)
export type IdPrefix = 'cmp' | 'rel' | 'nd' | 'ed' | 'view';

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}
