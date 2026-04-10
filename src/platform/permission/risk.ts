import path from 'path'
import type { ToolRiskLevel } from '../../architecture/contracts/tool-runtime.js'
import type { ToolRiskAssessment } from './index.js'

const RISK_ORDER: Record<ToolRiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

const BASELINE_BY_TOOL: Record<string, ToolRiskLevel> = {
  Read: 'low',
  Glob: 'low',
  Grep: 'low',
  AskUserQuestion: 'low',
  Write: 'medium',
  Edit: 'medium',
  Bash: 'high',
  WebFetch: 'high',
  WebSearch: 'high',
}

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

export function isPhase2RiskModelEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.phase2RiskModelEnabled ?? env.PHASE2_RISK_MODEL_ENABLED
  if (value == null) {
    return true
  }
  const normalized = value.trim().toLowerCase()
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off'
}

export function assessToolRisk(
  toolName: string,
  input: unknown,
  cwd: string,
): ToolRiskAssessment {
  const baselineLevel = getBaselineRiskLevel(toolName)
  if (!isPhase2RiskModelEnabled()) {
    return {
      baselineLevel,
      riskLevel: baselineLevel,
      reasonCodes: ['risk_model_disabled'],
    }
  }

  const reasons: string[] = []
  let riskLevel = baselineLevel

  if (toolName === 'Bash') {
    const command = getStringField(input, ['command', 'cmd'])
    if (command && DESTRUCTIVE_BASH_PATTERNS.some((pattern) => pattern.test(command))) {
      riskLevel = escalate(riskLevel, 'critical')
      reasons.push('shell_destructive_pattern')
    }
  }

  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = getStringField(input, ['file_path', 'filePath', 'path', 'targetPath'])
    if (filePath) {
      const resolvedCwd = normalizePath(cwd)
      const resolvedTarget = normalizePath(path.resolve(resolvedCwd, filePath))

      if (!isPathWithinWorkspace(resolvedTarget, resolvedCwd)) {
        riskLevel = escalate(riskLevel, 'high')
        reasons.push('file_outside_workspace')
      }

      if (isSensitivePath(resolvedTarget)) {
        riskLevel = escalate(riskLevel, 'critical')
        reasons.push('file_sensitive_path')
      }
    }
  }

  if (toolName === 'WebFetch' || toolName === 'WebSearch') {
    const url = getNetworkTarget(input)
    if (url) {
      const networkReasons = assessNetworkTarget(url)
      if (networkReasons.length > 0) {
        riskLevel = escalate(riskLevel, 'critical')
        reasons.push(...networkReasons)
      }
    }
  }

  return {
    baselineLevel,
    riskLevel,
    reasonCodes: dedupe(reasons),
  }
}

function getBaselineRiskLevel(toolName: string): ToolRiskLevel {
  return BASELINE_BY_TOOL[toolName] ?? 'high'
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

function getNetworkTarget(input: unknown): string | null {
  const url = getStringField(input, ['url', 'uri', 'target'])
  if (url) {
    return url
  }

  const query = getStringField(input, ['query'])
  if (query && /\b(?:file|ftp|gopher|ws|wss):\/\//i.test(query)) {
    return query.match(/\b(?:file|ftp|gopher|ws|wss):\/\/\S+/i)?.[0] ?? null
  }
  return null
}

function assessNetworkTarget(rawTarget: string): string[] {
  let url: URL
  try {
    url = new URL(rawTarget)
  } catch {
    return ['network_invalid_url']
  }

  const reasons: string[] = []
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    reasons.push('network_untrusted_protocol')
  }

  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '::1' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host === '169.254.169.254'
  ) {
    reasons.push('network_private_target')
  }

  if (host.endsWith('.internal') || host.endsWith('.local') || host.endsWith('.onion')) {
    reasons.push('network_sensitive_target')
  }

  return reasons
}

function escalate(current: ToolRiskLevel, next: ToolRiskLevel): ToolRiskLevel {
  return RISK_ORDER[next] > RISK_ORDER[current] ? next : current
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}
