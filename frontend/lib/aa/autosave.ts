type Timer = ReturnType<typeof setTimeout>;

// One pending timer per Studio session. The store owns request and revision state.
export function createAutosave(
  save: () => void,
  schedule: (run: () => void, delay: number) => Timer = setTimeout,
  cancel: (timer: Timer) => void = clearTimeout,
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
  };
}
