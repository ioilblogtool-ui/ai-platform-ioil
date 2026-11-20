type Timer = ReturnType<typeof setTimeout>;

// One pending timer per Studio session. The store owns request and revision state.
// Timer scheduling and the clock are injected so tests can drive them without real time.
export function createAutosave(
  save: () => void,
  schedule: (run: () => void, delay: number) => Timer = setTimeout,
  cancel: (timer: Timer) => void = clearTimeout,
  now: () => number = Date.now,
) {
  let pending: Timer | undefined;
  function stop() {
    if (pending !== undefined) cancel(pending);
    pending = undefined;
  }
  return {
    stop,
    queue(delay = 2000) {
      stop();
      pending = schedule(() => {
        pending = undefined;
        save();
      }, delay);
    },
    /** 복구본 editedAt 등 Studio가 쓰는 현재 시각 (테스트에서 주입) */
    now,
  };
}

export type LeaveState = 'loading' | 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

/**
 * 페이지를 떠날 때 경고할지. 반영 안 된 입력, 미저장·저장 중·충돌, 모델이 있는 저장 실패는 경고한다.
 * 저장된 상태와 불러오기 실패(모델 없음)는 경고하지 않는다. 이탈 중 저장 성공을 가정하지 않는다.
 */
export function shouldWarnOnLeave(state: LeaveState, hasModel: boolean, hasPendingInput: boolean): boolean {
  if (hasPendingInput) return true;
  if (state === 'dirty' || state === 'saving' || state === 'conflict') return true;
  return state === 'error' && hasModel;
}
