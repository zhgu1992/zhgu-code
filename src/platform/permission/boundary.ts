import path from 'path'

const DESTRUCTIVE_BASH_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bmkfs(?:\.[a-z0-9]+)?\b/i,
  /\bdd\b/i,
]

const SENSITIVE_PATH_PREFIXES = [
  '/etc',
  '/bin',
  '/sbin',
  '/usr',
  '/var',
  '/System',
  '/Library',
  '/dev',
  '/proc',
  '/boot',
  '/root',
]

export type BoundaryReasonCode =
  | 'file_outside_workspace'
  | 'file_sensitive_path'
  | 'shell_destructive_pattern'
  | 'network_untrusted_protocol'
  | 'network_private_target'
  | 'network_sensitive_target'
  | 'network_invalid_url'

export type BoundaryEnforcement = 'deny' | 'ask'

export interface BoundaryDecision {
  blocked: boolean
  reasonCode?: BoundaryReasonCode
  userMessage?: string
  details?: Record<string, unknown>
}

export function isPhase2BoundaryHardeningEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value =
    env.phase2BoundaryHardeningEnabled ?? env.PHASE2_BOUNDARY_HARDENING_ENABLED
  if (value == null) {
    return true
  }
  const normalized = value.trim().toLowerCase()
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off'
}

export function getPhase2BoundaryEnforcement(
  env: NodeJS.ProcessEnv = process.env,
): BoundaryEnforcement {
  const value = env.phase2BoundaryEnforcement ?? env.PHASE2_BOUNDARY_ENFORCEMENT
  if (!value) {
    return 'deny'
  }
  return value.trim().toLowerCase() === 'ask' ? 'ask' : 'deny'
}

export function evaluateBoundary(
  toolName: string,
  input: unknown,
  cwd: string,
): BoundaryDecision {
  if (toolName === 'Write' || toolName === 'Edit') {
    return evaluateFileBoundary(input, cwd)
  }
  if (toolName === 'Bash') {
    return evaluateBashBoundary(input)
  }
  if (toolName === 'WebFetch' || toolName === 'WebSearch') {
    return evaluateNetworkBoundary(input)
  }
  return { blocked: false }
}

function evaluateFileBoundary(input: unknown, cwd: string): BoundaryDecision {
  const filePath = getStringField(input, ['file_path', 'filePath', 'path', 'targetPath'])
  if (!filePath) {
    return { blocked: false }
  }

  const resolvedCwd = normalizePath(cwd)
  const resolvedTarget = normalizePath(path.resolve(resolvedCwd, filePath))
  const details = { cwd: resolvedCwd, targetPath: resolvedTarget }

  if (isSensitivePath(resolvedTarget)) {
    return {
      blocked: true,
      reasonCode: 'file_sensitive_path',
      userMessage: `Tool file target is in sensitive system path: ${resolvedTarget}`,
      details,
    }
  }

  if (!isPathWithinWorkspace(resolvedTarget, resolvedCwd)) {
    return {
      blocked: true,
      reasonCode: 'file_outside_workspace',
      userMessage: `Tool file target escapes workspace boundary: ${resolvedTarget}`,
      details,
    }
  }

  return { blocked: false }
}

function evaluateBashBoundary(input: unknown): BoundaryDecision {
  const command = getStringField(input, ['command', 'cmd'])
  if (!command) {
    return { blocked: false }
  }

  if (DESTRUCTIVE_BASH_PATTERNS.some((pattern) => pattern.test(command))) {
    return {
      blocked: true,
      reasonCode: 'shell_destructive_pattern',
      userMessage: 'Tool command matches destructive shell pattern',
      details: { command },
    }
  }

  return { blocked: false }
}

function evaluateNetworkBoundary(input: unknown): BoundaryDecision {
  const target = getNetworkTarget(input)
  if (!target) {
    return { blocked: false }
  }

  let url: URL
  try {
    url = new URL(target)
  } catch {
    return {
      blocked: true,
      reasonCode: 'network_invalid_url',
      userMessage: `Tool network target is not a valid URL: ${target}`,
      details: { target },
    }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return {
      blocked: true,
      reasonCode: 'network_untrusted_protocol',
      userMessage: `Tool network protocol is not trusted: ${url.protocol}`,
      details: { target: url.toString() },
    }
  }

  const host = url.hostname.toLowerCase()
  if (isPrivateNetworkTarget(host)) {
    return {
      blocked: true,
      reasonCode: 'network_private_target',
      userMessage: `Tool network target is private/metadata host: ${host}`,
      details: { target: url.toString(), host },
    }
  }

  if (host.endsWith('.internal') || host.endsWith('.local') || host.endsWith('.onion')) {
    return {
      blocked: true,
      reasonCode: 'network_sensitive_target',
      userMessage: `Tool network target is sensitive host suffix: ${host}`,
      details: { target: url.toString(), host },
    }
  }

  return { blocked: false }
}

function isPrivateNetworkTarget(host: string): boolean {
  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '169.254.169.254' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.')
  ) {
    return true
  }

  const match = host.match(/^172\.(\d{1,3})\./)
  if (match) {
    const second = Number(match[1])
    if (second >= 16 && second <= 31) {
      return true
    }
  }

  return false
}

function getStringField(input: unknown, keys: string[]): string | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const record = input as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value
    }
  }
  return null
}

function getNetworkTarget(input: unknown): string | null {
  const url = getStringField(input, ['url', 'uri', 'target'])
  if (url) {
    return url
  }

  const query = getStringField(input, ['query'])
  if (!query) {
    return null
  }

  return query.match(/\b[a-z][a-z0-9+.-]*:\/\/\S+/i)?.[0] ?? null
}

function normalizePath(value: string): string {
  return path.resolve(value)
}

function isPathWithinWorkspace(targetPath: string, cwd: string): boolean {
  const rel = path.relative(cwd, targetPath)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function isSensitivePath(targetPath: string): boolean {
  return SENSITIVE_PATH_PREFIXES.some(
    (prefix) => targetPath === prefix || targetPath.startsWith(`${prefix}/`),
  )
}
