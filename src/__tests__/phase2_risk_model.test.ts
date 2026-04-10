import { describe, expect, test } from 'bun:test'
import { assessToolRisk } from '../platform/permission/risk.js'

const cwd = '/workspace/project'

describe('Phase 2 Risk Model (wip2-03 / WP2-B)', () => {
  test('RSK-001: static baseline risk levels are stable', () => {
    expect(assessToolRisk('Read', {}, cwd)).toMatchObject({
      baselineLevel: 'low',
      riskLevel: 'low',
    })
    expect(assessToolRisk('Write', {}, cwd)).toMatchObject({
      baselineLevel: 'medium',
      riskLevel: 'medium',
    })
    expect(assessToolRisk('Bash', {}, cwd)).toMatchObject({
      baselineLevel: 'high',
      riskLevel: 'high',
    })
  })

  test('RSK-002: destructive bash command upgrades high -> critical', () => {
    const result = assessToolRisk('Bash', { command: 'rm -rf /tmp/test' }, cwd)
    expect(result.baselineLevel).toBe('high')
    expect(result.riskLevel).toBe('critical')
    expect(result.reasonCodes).toContain('shell_destructive_pattern')
  })

  test('RSK-003: file outside workspace and sensitive path return reason codes', () => {
    const outside = assessToolRisk('Write', { file_path: '../outside.txt' }, cwd)
    expect(outside.riskLevel).toBe('high')
    expect(outside.reasonCodes).toContain('file_outside_workspace')

    const sensitive = assessToolRisk('Edit', { file_path: '/etc/hosts' }, cwd)
    expect(sensitive.riskLevel).toBe('critical')
    expect(sensitive.reasonCodes).toContain('file_sensitive_path')
  })

  test('RSK-004: abnormal network target upgrades to critical with reason code', () => {
    const result = assessToolRisk(
      'WebFetch',
      { url: 'ftp://169.254.169.254/latest/meta-data' },
      cwd,
    )
    expect(result.baselineLevel).toBe('high')
    expect(result.riskLevel).toBe('critical')
    expect(result.reasonCodes).toContain('network_untrusted_protocol')
    expect(result.reasonCodes).toContain('network_private_target')
  })

  test('RSK-005: non-upgrade input keeps baseline and result is deterministic', () => {
    const input = { command: 'echo "hello"' }
    const first = assessToolRisk('Bash', input, cwd)
    const second = assessToolRisk('Bash', input, cwd)

    expect(first).toEqual(second)
    expect(first.baselineLevel).toBe('high')
    expect(first.riskLevel).toBe('high')
    expect(first.reasonCodes).toEqual([])
  })
})
