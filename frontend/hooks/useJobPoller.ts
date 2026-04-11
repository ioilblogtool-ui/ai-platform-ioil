import { useEffect, useRef, useCallback } from 'react';
import { getJob } from '@/lib/api';

const POLL_INTERVAL = 3000; // 3초

type JobStatus = 'queued' | 'running' | 'done' | 'failed';

interface PollCallbacks {
  onDone: () => void;
  onFailed: (errorMessage: string) => void;
}

/**
 * job_id를 받아 완료될 때까지 3초마다 폴링.
 * 컴포넌트 언마운트 시 자동 중단되어 다른 탭으로 이동해도 안전.
 * job_id가 null이면 폴링하지 않음.
 */
export function useJobPoller(
  jobId: string | null,
  { onDone, onFailed }: PollCallbacks
) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobIdRef = useRef(jobId);
  jobIdRef.current = jobId;

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      stopPolling();
      return;
    }

    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      try {
        const job = await getJob(jobId);
        if (cancelled) return;

        if (job.status === 'done') {
          stopPolling();
          onDone();
        } else if (job.status === 'failed') {
          stopPolling();
          onFailed(job.error_message || '생성 실패');
        }
        // queued / running → 다음 interval 대기
      } catch {
        // 네트워크 오류는 무시하고 계속 폴링
      }
    };

    // 즉시 1회 체크 후 주기적 폴링
    check();
    timerRef.current = setInterval(check, POLL_INTERVAL);

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  return stopPolling;
}
