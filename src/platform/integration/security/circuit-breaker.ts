import type {
  IntegrationCircuitBreaker,
  IntegrationCircuitBreakerConfig,
  IntegrationCircuitSnapshot,
  IntegrationCircuitStateChange,
} from "./types.js";

interface CircuitState {
  state: "closed" | "open" | "half-open";
  consecutiveFailures: number;
  openedAtMs: number | null;
  lastChangedAtMs: number;
}

export interface CreateIntegrationCircuitBreakerOptions extends IntegrationCircuitBreakerConfig {
  onStateChange?: (change: IntegrationCircuitStateChange) => void;
}

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 30_000;

export function createIntegrationCircuitBreaker(
  options: CreateIntegrationCircuitBreakerOptions = {},
): IntegrationCircuitBreaker {
  const failureThreshold = Math.max(1, options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD);
  const cooldownMs = Math.max(0, options.cooldownMs ?? DEFAULT_COOLDOWN_MS);
  const states = new Map<string, CircuitState>();

  function nowMs(date?: Date): number {
    return (date ?? new Date()).getTime();
  }

  function toIso(epochMs: number): string {
    return new Date(epochMs).toISOString();
  }

  function ensureState(scope: string, now: number): CircuitState {
    const existing = states.get(scope);
    if (existing) {
      return existing;
    }
    const created: CircuitState = {
      state: "closed",
      consecutiveFailures: 0,
      openedAtMs: null,
      lastChangedAtMs: now,
    };
    states.set(scope, created);
    return created;
  }

  function emitStateChange(
    scope: string,
    from: CircuitState["state"],
    to: CircuitState["state"],
    changedAtMs: number,
  ): void {
    if (from === to) {
      return;
    }
    options.onStateChange?.({
      scope,
      from,
      to,
      changedAt: toIso(changedAtMs),
    });
  }

  function maybeAdvanceToHalfOpen(scope: string, state: CircuitState, now: number): void {
    if (state.state !== "open" || state.openedAtMs == null) {
      return;
    }
    if (now - state.openedAtMs < cooldownMs) {
      return;
    }
    const previous = state.state;
    state.state = "half-open";
    state.lastChangedAtMs = now;
    emitStateChange(scope, previous, state.state, now);
  }

  function snapshot(scope: string, now: number): IntegrationCircuitSnapshot {
    const state = ensureState(scope, now);
    maybeAdvanceToHalfOpen(scope, state, now);
    return {
      scope,
      state: state.state,
      consecutiveFailures: state.consecutiveFailures,
      lastChangedAt: toIso(state.lastChangedAtMs),
    };
  }

  return {
    recordSuccess(scope: string, now?: Date): void {
      const nowValue = nowMs(now);
      const state = ensureState(scope, nowValue);
      maybeAdvanceToHalfOpen(scope, state, nowValue);
      const previous = state.state;
      state.state = "closed";
      state.consecutiveFailures = 0;
      state.openedAtMs = null;
      state.lastChangedAtMs = nowValue;
      emitStateChange(scope, previous, state.state, nowValue);
    },

    recordFailure(scope: string, now?: Date): void {
      const nowValue = nowMs(now);
      const state = ensureState(scope, nowValue);
      maybeAdvanceToHalfOpen(scope, state, nowValue);

      if (state.state === "half-open") {
        const previous = state.state;
        state.state = "open";
        state.consecutiveFailures = failureThreshold;
        state.openedAtMs = nowValue;
        state.lastChangedAtMs = nowValue;
        emitStateChange(scope, previous, state.state, nowValue);
        return;
      }

      state.consecutiveFailures += 1;
      if (state.consecutiveFailures >= failureThreshold) {
        const previous = state.state;
        state.state = "open";
        state.openedAtMs = nowValue;
        state.lastChangedAtMs = nowValue;
        emitStateChange(scope, previous, state.state, nowValue);
      }
    },

    getSnapshot(scope: string, now?: Date): IntegrationCircuitSnapshot {
      return snapshot(scope, nowMs(now));
    },

    listSnapshots(now?: Date): IntegrationCircuitSnapshot[] {
      const nowValue = nowMs(now);
      return [...states.keys()].sort().map((scope) => snapshot(scope, nowValue));
    },
  };
}
