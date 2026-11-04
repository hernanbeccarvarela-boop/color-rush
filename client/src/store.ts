import { useSyncExternalStore } from 'react';
import type { RaceResult, RoomState, Session } from '../../shared/protocol';

export interface AppState {
  connected: boolean;
  session: Session | null;
  room: RoomState | null;
  results: RaceResult[] | null;
  error: string | null;
  paused: boolean;
  muted: boolean;
  showTutorial: boolean;
}

function loadMuted() { try { return localStorage.getItem('colorrush.muted') === '1'; } catch { return false; } }

function createStore<T extends object>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T>) { state = { ...state, ...patch }; subs.forEach((f) => f()); },
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  };
}

export const store = createStore<AppState>({
  connected: false, session: null, room: null, results: null, error: null,
  paused: false, muted: loadMuted(), showTutorial: false,
});

export function useApp<S>(sel: (s: AppState) => S): S {
  return useSyncExternalStore(store.subscribe, () => sel(store.get()));
}

export function me(state: AppState = store.get()) {
  const id = state.session?.playerId;
  return state.room?.players.find((p) => p.id === id) ?? null;
}
