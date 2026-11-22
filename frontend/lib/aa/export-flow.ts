// README 내보내기 화면의 판단 규칙 (Sprint 4 Step 5 · S4-8·S4-9). React·네트워크 import 없음.
import type { ReadmeExportResult, SensitiveScanDetails } from './architecture-types';

/** README·Ask AI 결과 공통: 출력 비교에 쓰는 필드 */
type Comparable = Pick<ReadmeExportResult, 'contentHash'> & { basis: { revision: number } };

export type ExportOutcome<T extends Comparable = ReadmeExportResult> =
  | { kind: 'ok'; result: T }
  | { kind: 'warn'; details: SensitiveScanDetails }
  | { kind: 'block'; details: SensitiveScanDetails }
  | { kind: 'error'; message: string };

export type RecheckDecision<T extends Comparable = ReadmeExportResult> =
  | { action: 'output'; result: T }      // 미리보기와 같다 → 지금 받은 내용으로 복사·다운로드
  | { action: 'refresh'; result: T }     // 내용·revision이 바뀌었다 → 새 미리보기, 다시 누르게
  | { action: 'warn'; details: SensitiveScanDetails }     // 새 경고 → 이전 미리보기 출력 금지, 다시 확인
  | { action: 'block'; details: SensitiveScanDetails }    // 차단 → 출력 불가
  | { action: 'error'; message: string };

/** 복사·다운로드 직전 재요청 결과를 미리보기와 비교한다. 같을 때만 출력한다 */
export function recheckDecision<T extends Comparable>(preview: Comparable, outcome: ExportOutcome<T>): RecheckDecision<T> {
  if (outcome.kind === 'warn') return { action: 'warn', details: outcome.details };
  if (outcome.kind === 'block') return { action: 'block', details: outcome.details };
  if (outcome.kind === 'error') return { action: 'error', message: outcome.message };
  const same = outcome.result.contentHash === preview.contentHash && outcome.result.basis.revision === preview.basis.revision;
  return same ? { action: 'output', result: outcome.result } : { action: 'refresh', result: outcome.result };
}

/** 서버 422 details를 경고/차단으로 나눈다 */
export function classifyScan(details: unknown): { kind: 'warn' | 'block'; details: SensitiveScanDetails } | null {
  const d = details as Partial<SensitiveScanDetails> | null;
  if (!d || !Array.isArray(d.issues) || typeof d.confirmable !== 'boolean') return null;
  const clean: SensitiveScanDetails = { issues: d.issues, confirmable: d.confirmable, scanId: d.scanId ?? null };
  return d.confirmable && d.scanId ? { kind: 'warn', details: clean } : { kind: 'block', details: clean };
}

const RULE_LABEL: Record<string, string> = {
  ip_address: 'IP 주소', internal_domain: '내부 도메인', email: '이메일',
  aws_key: '키·토큰', generic_secret: '키·토큰', jwt: '키·토큰', pem: '개인 키',
};
export const ruleLabel = (rule: string) => RULE_LABEL[rule] ?? rule;
