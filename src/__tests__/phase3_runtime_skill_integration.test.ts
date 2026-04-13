import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildRuntimeIntegrationRegistryInput,
  resolveRuntimeSkillDirs,
} from '../platform/integration/runtime-input.js'

const tempDirs: string[] = []

describe('WP3-B/WP3-C Runtime skill integration', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0, tempDirs.length).map((dir) => rm(dir, { recursive: true, force: true })),
    )
  })

  test('RUNTIME-001 defaults include project and home .claude/skills', () => {
    const dirs = resolveRuntimeSkillDirs({
      cwd: '/workspace/app',
      homeDir: '/home/tester',
    })

    expect(dirs).toEqual([
      resolve('/workspace/app/.claude/skills'),
      resolve('/home/tester/.claude/skills'),
    ])
  })

  test('RUNTIME-002 env override skill dirs are used', () => {
    const dirs = resolveRuntimeSkillDirs({
      cwd: '/workspace/app',
      homeDir: '/home/tester',
      envSkillDirs: '/a/skills,/b/skills',
    })

    expect(dirs).toEqual([resolve('/a/skills'), resolve('/b/skills')])
  })

  test('RUNTIME-003 build input loads skills from default claude dirs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wp3-runtime-'))
    tempDirs.push(root)
    const cwd = join(root, 'project')
    const home = join(root, 'home')

    const projectSkill = join(cwd, '.claude', 'skills', 'project-skill')
    const homeSkill = join(home, '.claude', 'skills', 'home-skill')

    await mkdir(projectSkill, { recursive: true })
    await mkdir(homeSkill, { recursive: true })
    await writeFile(join(projectSkill, 'SKILL.md'), '# Project Skill\n', 'utf8')
    await writeFile(join(homeSkill, 'SKILL.md'), '# Home Skill\n', 'utf8')

    const input = await buildRuntimeIntegrationRegistryInput({
      cwd,
      homeDir: home,
      sessionId: 'sess_runtime_001',
      traceId: 'trace_runtime_001',
    })

    const items = input.pluginSnapshot?.items ?? []
    const loadedSkillNames = items
      .filter((item) => item.itemType === 'skill' && item.state === 'loaded')
      .map((item) => item.name)
      .sort((a, b) => a.localeCompare(b))

    expect(loadedSkillNames).toEqual(['home-skill', 'project-skill'])
    expect(items.every((item) => item.loadedFrom === 'skills')).toBe(true)
  })
})
