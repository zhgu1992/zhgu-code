import { createHash } from 'node:crypto'

const REDACT_PATTERNS = /(token|key|secret|password|authorization|header)/i
const DEFAULT_MAX_STRING_LENGTH = 512
const DEFAULT_MAX_DEPTH = 6

export interface SanitizeOptions {
  maxStringLength?: number
  maxDepth?: number
}

export function sanitizePayload(
  payload: unknown,
  options: SanitizeOptions = {},
): unknown {
  const maxStringLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  return sanitizeRecursive(payload, '', 0, maxStringLength, maxDepth)
}

function sanitizeRecursive(
  value: unknown,
  key: string,
  depth: number,
  maxStringLength: number,
  maxDepth: number,
): unknown {
  if (depth > maxDepth) {
    return '[DEPTH_LIMIT]'
  }

  if (key && REDACT_PATTERNS.test(key)) {
    return '[REDACTED]'
  }

  if (typeof value === 'string') {
    return truncateString(value, maxStringLength)
  }

  if (value === null || value === undefined) {
    return value
  }

  if (typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      sanitizeRecursive(entry, key, depth + 1, maxStringLength, maxDepth))
  }

  const output: Record<string, unknown> = {}
  for (const [entryKey, entryValue] of Object.entries(value)) {
    output[entryKey] = sanitizeRecursive(
      entryValue,
      entryKey,
      depth + 1,
      maxStringLength,
      maxDepth,
    )
  }
  return output
}

function truncateString(input: string, maxLen: number): string {
  if (input.length <= maxLen) {
    return input
  }

  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12)
  const head = input.slice(0, maxLen)
  return `${head}...[TRUNCATED len=${input.length} sha256=${hash}]`
}
