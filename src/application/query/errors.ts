export type QueryErrorClass =
  | 'permission_denied'
  | 'budget_exceeded'
  | 'network_transient'
  | 'provider_rate_limited'
  | 'tool_transient'
  | 'non_recoverable'

export type QueryErrorSource = 'provider' | 'tool' | 'permission' | 'budget' | 'unknown'
export type QueryErrorSubclass =
  | 'permission_denied'
  | 'budget_exceeded'
  | 'timeout'
  | 'dns_error'
  | 'connection_reset'
  | 'rate_limit'
  | 'tool_io'
  | 'tool_side_effect_risk'
  | 'unknown_subclass'

export interface ClassifiedQueryError {
  errorClass: QueryErrorClass
  errorSubclass: QueryErrorSubclass
  source: QueryErrorSource
  message: string
  retryable: boolean
}

const NETWORK_HINTS = [
  'timeout',
  'timed out',
  'econnreset',
  'econnrefused',
  'enotfound',
  'eai_again',
  'socket hang up',
  'network',
]

const RATE_LIMIT_HINTS = [
  'rate limit',
  'too many requests',
  'status 429',
  '429',
]

const TOOL_TRANSIENT_HINTS = [
  'temporary',
  'temporarily unavailable',
  'i/o error',
  'io error',
  'network failure',
]

const SIDE_EFFECT_RISK_HINTS = [
  'non-idempotent',
  'non idempotent',
  'side effect',
  'destructive',
]

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return String(error)
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle))
}

export function classifyQueryError(
  error: unknown,
  source: QueryErrorSource = 'unknown',
): ClassifiedQueryError {
  const message = toMessage(error)
  const normalized = message.toLowerCase()

  if (normalized.includes('denied by user') || normalized.includes('was denied by user')) {
    return {
      errorClass: 'permission_denied',
      errorSubclass: 'permission_denied',
      source: 'permission',
      message,
      retryable: false,
    }
  }

  if (normalized.includes('budget exceeded')) {
    return {
      errorClass: 'budget_exceeded',
      errorSubclass: 'budget_exceeded',
      source: 'budget',
      message,
      retryable: false,
    }
  }

  if (includesAny(normalized, RATE_LIMIT_HINTS)) {
    return {
      errorClass: 'provider_rate_limited',
      errorSubclass: 'rate_limit',
      source: source === 'unknown' ? 'provider' : source,
      message,
      retryable: true,
    }
  }

  if (source === 'tool' && includesAny(normalized, SIDE_EFFECT_RISK_HINTS)) {
    return {
      errorClass: 'non_recoverable',
      errorSubclass: 'tool_side_effect_risk',
      source,
      message,
      retryable: false,
    }
  }

  if (source === 'tool' && includesAny(normalized, TOOL_TRANSIENT_HINTS)) {
    return {
      errorClass: 'tool_transient',
      errorSubclass: 'tool_io',
      source,
      message,
      retryable: true,
    }
  }

  if (includesAny(normalized, NETWORK_HINTS)) {
    const sourceResolved = source === 'unknown' ? 'provider' : source
    let subclass: QueryErrorSubclass = 'timeout'
    if (normalized.includes('enotfound') || normalized.includes('eai_again')) {
      subclass = 'dns_error'
    } else if (
      normalized.includes('econnreset') ||
      normalized.includes('econnrefused') ||
      normalized.includes('socket hang up')
    ) {
      subclass = 'connection_reset'
    }

    return {
      errorClass: sourceResolved === 'tool' ? 'tool_transient' : 'network_transient',
      errorSubclass: sourceResolved === 'tool' ? 'tool_io' : subclass,
      source: sourceResolved,
      message,
      retryable: true,
    }
  }

  return {
    errorClass: 'non_recoverable',
    errorSubclass: 'unknown_subclass',
    source,
    message,
    retryable: false,
  }
}

export function classifyToolResult(result: string): ClassifiedQueryError | null {
  if (!result.startsWith('Error:')) {
    return null
  }
  return classifyQueryError(result, 'tool')
}
