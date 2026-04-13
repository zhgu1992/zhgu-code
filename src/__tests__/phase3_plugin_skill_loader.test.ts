import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { createPluginSkillLoader } from '../platform/integration/plugin/loader.js'
import type { PluginSkillLoadItem, PluginSkillLoaderSnapshot } from '../platform/integration/plugin/types.js'

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
}

function findItem(
  snapshot: PluginSkillLoaderSnapshot,
  predicate: (item: PluginSkillLoadItem) => boolean,
): PluginSkillLoadItem {
  const item = snapshot.items.find(predicate)
  if (!item) {
    throw new Error('Expected item not found in snapshot')
  }
  return item
}

describe('WP3-B Plugin/Skill Loader', () => {
  test('PLG-001: valid plugin manifest loads successfully', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wp3b-plg001-'))
    const pluginPath = join(root, 'plugin-valid')
    await writeJson(join(pluginPath, '.claude-plugin', 'plugin.json'), {
      name: 'plugin-valid',
      version: '1.2.3',
      apiVersion: '1',
    })
    await mkdir(join(pluginPath, 'skills', 'sample-skill'), { recursive: true })
    await writeFile(
      join(pluginPath, 'skills', 'sample-skill', 'SKILL.md'),
      '# Sample Skill',
      'utf8',
    )

    const loader = createPluginSkillLoader({
      sessionId: 'sess_plg001',
      traceId: 'trace_plg001',
    })

    const snapshot = await loader.load({
      plugins: [{ id: 'plugin-valid', path: pluginPath }],
    })

    const plugin = findItem(snapshot, (item) => item.id === 'plugin:plugin-valid')
    expect(plugin.state).toBe('loaded')
    expect(plugin.version).toBe('1.2.3')
    expect(plugin.loadedFrom).toBe('plugin')
    expect(plugin.implicitVersion).toBe(false)

    const pluginSkill = findItem(
      snapshot,
      (item) => item.itemType === 'skill' && item.loadedFrom === 'plugin',
    )
    expect(pluginSkill.state).toBe('loaded')
  })

  test('PLG-002: missing manifest falls back to implicit version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wp3b-plg002-'))
    const pluginPath = join(root, 'plugin-fallback')
    await mkdir(pluginPath, { recursive: true })

    const loader = createPluginSkillLoader({
      sessionId: 'sess_plg002',
      traceId: 'trace_plg002',
    })

    const snapshot = await loader.load({
      plugins: [{ id: 'plugin-fallback', path: pluginPath }],
    })

    const plugin = findItem(snapshot, (item) => item.id === 'plugin:plugin-fallback')
    expect(plugin.state).toBe('loaded')
    expect(plugin.name).toBe('plugin-fallback')
    expect(plugin.version).toBe('0.0.0-implicit')
    expect(plugin.implicitVersion).toBe(true)
  })

  test('PLG-003: invalid manifest enters disabled with structured reason', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wp3b-plg003-'))
    const pluginPath = join(root, 'plugin-invalid')
    await writeJson(join(pluginPath, '.claude-plugin', 'plugin.json'), {
      version: '1.0.0',
    })

    const loader = createPluginSkillLoader({
      sessionId: 'sess_plg003',
      traceId: 'trace_plg003',
    })

    const snapshot = await loader.load({
      plugins: [{ id: 'plugin-invalid', path: pluginPath }],
    })

    const plugin = findItem(snapshot, (item) => item.id === 'plugin:plugin-invalid')
    expect(plugin.state).toBe('disabled')
    expect(plugin.reason?.source).toBe('plugin')
    expect(plugin.reason?.module).toBe('platform.integration.plugin.loader')
    expect(plugin.reason?.reasonCode).toBe('manifest_invalid')
    expect(plugin.reason?.userMessage.length).toBeGreaterThan(0)
    expect(plugin.reason?.retryable).toBe(false)
  })

  test('PLG-004: incompatible apiVersion enters disabled with version_incompatible', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wp3b-plg004-'))
    const pluginPath = join(root, 'plugin-incompatible')
    await writeJson(join(pluginPath, '.claude-plugin', 'plugin.json'), {
      name: 'plugin-incompatible',
      version: '1.0.0',
      apiVersion: '99',
    })

    const loader = createPluginSkillLoader({
      sessionId: 'sess_plg004',
      traceId: 'trace_plg004',
      supportedApiVersions: ['1'],
    })

    const snapshot = await loader.load({
      plugins: [{ id: 'plugin-incompatible', path: pluginPath }],
    })

    const plugin = findItem(snapshot, (item) => item.id === 'plugin:plugin-incompatible')
    expect(plugin.state).toBe('disabled')
    expect(plugin.reason?.reasonCode).toBe('version_incompatible')
  })

  test('PLG-005: disabled item is not scheduled again and does not block others', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wp3b-plg005-'))

    const badPluginPath = join(root, 'plugin-bad')
    await writeJson(join(badPluginPath, '.claude-plugin', 'plugin.json'), {
      name: 'plugin-bad',
      version: '1.0.0',
      apiVersion: '99',
    })

    const goodPluginPath = join(root, 'plugin-good')
    await writeJson(join(goodPluginPath, '.claude-plugin', 'plugin.json'), {
      name: 'plugin-good',
      version: '1.0.0',
      apiVersion: '1',
    })

    const loader = createPluginSkillLoader({
      sessionId: 'sess_plg005',
      traceId: 'trace_plg005',
      supportedApiVersions: ['1'],
    })

    const first = await loader.load({
      plugins: [
        { id: 'plugin-bad', path: badPluginPath },
        { id: 'plugin-good', path: goodPluginPath },
      ],
    })

    const firstBad = findItem(first, (item) => item.id === 'plugin:plugin-bad')
    const firstGood = findItem(first, (item) => item.id === 'plugin:plugin-good')
    expect(firstBad.state).toBe('disabled')
    expect(firstGood.state).toBe('loaded')

    await writeJson(join(badPluginPath, '.claude-plugin', 'plugin.json'), {
      name: 'plugin-bad',
      version: '1.0.1',
      apiVersion: '1',
    })

    const second = await loader.load({
      plugins: [
        { id: 'plugin-bad', path: badPluginPath },
        { id: 'plugin-good', path: goodPluginPath },
      ],
    })

    const secondBad = findItem(second, (item) => item.id === 'plugin:plugin-bad')
    const secondGood = findItem(second, (item) => item.id === 'plugin:plugin-good')
    expect(secondBad.state).toBe('disabled')
    expect(secondGood.state).toBe('loaded')
    expect(loader.canSchedule('plugin:plugin-bad')).toBe(false)
    expect(loader.canSchedule('plugin:plugin-good')).toBe(true)
  })

  test('PLG-006: bundled skill loads with loadedFrom=bundled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wp3b-plg006-'))
    const skillsRoot = join(root, 'skills')
    await mkdir(join(skillsRoot, 'local-skill'), { recursive: true })
    await writeFile(join(skillsRoot, 'local-skill', 'SKILL.md'), '# Local Skill', 'utf8')

    const loader = createPluginSkillLoader({
      sessionId: 'sess_plg006',
      traceId: 'trace_plg006',
    })

    const snapshot = await loader.load({
      skillDirs: [skillsRoot],
      bundledSkills: [
        {
          id: 'bundled-core',
          name: 'Bundled Core Skill',
        },
      ],
    })

    const localSkill = findItem(
      snapshot,
      (item) => item.itemType === 'skill' && item.loadedFrom === 'skills',
    )
    expect(localSkill.state).toBe('loaded')

    const bundled = findItem(snapshot, (item) => item.id === 'bundled:bundled-core')
    expect(bundled.state).toBe('loaded')
    expect(bundled.loadedFrom).toBe('bundled')
  })
})

