type Listener = () => void;
type SetState<T> = (partial: Partial<T> | ((s: T) => Partial<T>)) => void;
type GetState<T> = () => T;

export interface Store<T> {
  getState: GetState<T>;
  setState: SetState<T>;
  subscribe: (fn: Listener) => () => void;
}

export function createStore<T extends object>(
  initializer: (set: SetState<T>, get: GetState<T>) => T,
): Store<T> {
  const listeners = new Set<Listener>();
  let state: T;

  const get: GetState<T> = () => state;

  const set: SetState<T> = (partial) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    const prev = state;
    state = Object.assign({}, prev, next);
    listeners.forEach((fn) => fn());
  };

  state = initializer(set, get);

  return {
    getState: get,
    setState: set,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
