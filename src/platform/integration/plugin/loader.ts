import { readdir, readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { createSpanId } from '../../../observability/ids.js'
import { getTraceBus } from '../../../observability/trace-bus.js'
import type { TraceStatus } from '../../../observability/trace-model.js'
import type {
  BundledSkillTarget,
  IntegrationLoadedFrom,
  PluginLoadTarget,
  PluginSkillLoadItem,
  PluginSkillLoader,
  PluginSkillLoaderAuditEvent,
  PluginSkillLoaderSnapshot,
  PluginSkillLoaderState,
  PluginSkillLoaderTransition,
  PluginSkillLoadRequest,
  PluginSkillManifest,
  PluginSkillStructuredReason,
} from './types.js'

export interface CreatePluginSkillLoaderOptions {
  sessionId: string
  traceId: string
  module?: string
  supportedApiVersions?: string[]
  onTransition?: (transition: PluginSkillLoaderTransition) => void
  onAudit?: (event: PluginSkillLoaderAuditEvent) => void
}

interface ResolvedPluginManifest {
  name: string
  version: string
  implicitVersion: boolean
  apiVersion?: string
  skillsPaths: string[]
}

interface SkillMetadata {
  name?: string
  version?: string
}

const DEFAULT_MODULE = 'platform.integration.plugin.loader'
const DEFAULT_SUPPORTED_API_VERSIONS = ['1']
const IMPLICIT_VERSION = '0.0.0-implicit'
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

export function createPluginSkillLoader(
  options: CreatePluginSkillLoaderOptions,
): PluginSkillLoader {
  const moduleName = options.module ?? DEFAULT_MODULE
  const supportedApiVersions = new Set(
    (options.supportedApiVersions ?? DEFAULT_SUPPORTED_API_VERSIONS).map((item) => item.trim()),
  )

  const items = new Map<string, PluginSkillLoadItem>()

  function nowIso(): string {
    return new Date().toISOString()
  }

  function getSnapshot(): PluginSkillLoaderSnapshot {
    return {
      updatedAt: nowIso(),
      items: [...items.values()].map((item) => ({ ...item })),
    }
  }

  function toStructuredReason(
    source: 'plugin' | 'skill',
    reason: Omit<PluginSkillStructuredReason, 'source' | 'module'>,
  ): PluginSkillStructuredReason {
    return {
      source,
      module: moduleName,
      reasonCode: reason.reasonCode,
      userMessage: reason.userMessage,
      retryable: reason.retryable,
      detail: reason.detail,
    }
  }

  function emit(
    item: PluginSkillLoadItem,
    from: PluginSkillLoaderState,
    to: PluginSkillLoaderState,
    reason?: PluginSkillStructuredReason,
  ): void {
    const transition: PluginSkillLoaderTransition = {
      ts: nowIso(),
      itemId: item.id,
      itemType: item.itemType,
      from,
      to,
      reason,
    }
    options.onTransition?.(transition)

    const source: 'plugin' | 'skill' =
      reason?.source ?? (item.itemType === 'plugin' ? 'plugin' : 'skill')

    const auditEvent: PluginSkillLoaderAuditEvent = {
      ts: transition.ts,
      source,
      module: moduleName,
      event: 'integration.plugin_skill.transition',
      itemId: item.id,
      itemType: item.itemType,
      from,
      to,
      reason,
    }
    options.onAudit?.(auditEvent)

    const status: TraceStatus = to === 'disabled' ? 'error' : 'ok'
    getTraceBus().emit({
      stage: 'provider',
      event: 'plugin_skill_loader_transition',
      status,
      session_id: options.sessionId,
      trace_id: options.traceId,
      span_id: createSpanId(),
      payload: {
        module: moduleName,
        itemId: item.id,
        itemType: item.itemType,
        from,
        to,
        reason,
      },
    })
  }

  function transition(
    item: PluginSkillLoadItem,
    to: PluginSkillLoaderState,
    reason?: PluginSkillStructuredReason,
  ): PluginSkillLoadItem {
    const from = item.state
    item.state = to
    if (reason) {
      item.reason = reason
    } else if (to === 'loaded') {
      item.reason = undefined
    }
    emit(item, from, to, reason)
    return item
  }

  function markDiscovered(item: PluginSkillLoadItem): PluginSkillLoadItem {
    const existing = items.get(item.id)
    const discovered: PluginSkillLoadItem = {
      ...(existing ?? item),
      ...item,
      state: 'discovered',
      reason: undefined,
    }
    items.set(discovered.id, discovered)
    return discovered
  }

  function markDisabled(
    item: PluginSkillLoadItem,
    source: 'plugin' | 'skill',
    reason: Omit<PluginSkillStructuredReason, 'source' | 'module'>,
  ): PluginSkillLoadItem {
    const structuredReason = toStructuredReason(source, reason)
    transition(item, 'disabled', structuredReason)
    items.set(item.id, item)
    return item
  }

  function markLoaded(item: PluginSkillLoadItem): PluginSkillLoadItem {
    transition(item, 'loaded')
    items.set(item.id, item)
    return item
  }

  function isSemver(version: string): boolean {
    return SEMVER_PATTERN.test(version)
  }

  function normalizeApiVersion(raw: unknown): string | undefined {
    if (raw === undefined || raw === null) {
      return undefined
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return String(raw)
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      return trimmed.length > 0 ? trimmed : undefined
    }
    return undefined
  }

  function normalizeSkillsPaths(manifest: PluginSkillManifest): string[] | null {
    const paths: string[] = []

    if (manifest.skillsPath !== undefined) {
      if (typeof manifest.skillsPath !== 'string' || manifest.skillsPath.trim().length === 0) {
        return null
      }
      paths.push(manifest.skillsPath)
    }

    if (manifest.skillsPaths !== undefined) {
      if (!Array.isArray(manifest.skillsPaths)) {
        return null
      }

      for (const value of manifest.skillsPaths) {
        if (typeof value !== 'string' || value.trim().length === 0) {
          return null
        }
        paths.push(value)
      }
    }

    if (paths.length === 0) {
      return ['skills']
    }

    return [...new Set(paths)]
  }

  function resolvePluginManifest(
    raw: unknown,
    fallbackName: string,
    isMissingManifest: boolean,
  ): { manifest?: ResolvedPluginManifest; reason?: Omit<PluginSkillStructuredReason, 'source' | 'module'> } {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        reason: {
          reasonCode: 'manifest_invalid',
          userMessage: 'Plugin manifest must be a JSON object.',
          retryable: false,
        },
      }
    }

    const candidate = raw as PluginSkillManifest

    const name =
      typeof candidate.name === 'string' && candidate.name.trim().length > 0
        ? candidate.name.trim()
        : isMissingManifest
          ? fallbackName
          : ''
    if (!name) {
      return {
        reason: {
          reasonCode: 'manifest_invalid',
          userMessage: 'Plugin manifest must provide a non-empty name.',
          retryable: false,
        },
      }
    }

    let version: string
    let implicitVersion = false
    if (isMissingManifest) {
      version = IMPLICIT_VERSION
      implicitVersion = true
    } else if (candidate.version === undefined) {
      version = IMPLICIT_VERSION
      implicitVersion = true
    } else if (typeof candidate.version === 'string' && candidate.version.trim().length > 0) {
      version = candidate.version.trim()
    } else {
      return {
        reason: {
          reasonCode: 'manifest_invalid',
          userMessage: 'Plugin manifest version must be a non-empty string.',
          retryable: false,
        },
      }
    }

    if (!isSemver(version)) {
      return {
        reason: {
          reasonCode: 'manifest_invalid',
          userMessage: 'Plugin manifest version is invalid.',
          retryable: false,
          detail: version,
        },
      }
    }

    const apiVersion = normalizeApiVersion(candidate.apiVersion)
    if (candidate.apiVersion !== undefined && apiVersion === undefined) {
      return {
        reason: {
          reasonCode: 'manifest_invalid',
          userMessage: 'Plugin manifest apiVersion is invalid.',
          retryable: false,
        },
      }
    }

    const skillsPaths = normalizeSkillsPaths(candidate)
    if (!skillsPaths) {
      return {
        reason: {
          reasonCode: 'manifest_invalid',
          userMessage: 'Plugin manifest skillsPath/skillsPaths is invalid.',
          retryable: false,
        },
      }
    }

    return {
      manifest: {
        name,
        version,
        implicitVersion,
        apiVersion,
        skillsPaths,
      },
    }
  }

  function isErrnoWithCode(error: unknown, code: string): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }
    return 'code' in error && (error as { code?: string }).code === code
  }

  async function readManifestFile(
    pluginPath: string,
  ): Promise<{ exists: true; raw: unknown; manifestPath: string } | { exists: false; manifestPath: string }> {
    const manifestPath = join(pluginPath, '.claude-plugin', 'plugin.json')
    try {
      const content = await readFile(manifestPath, 'utf8')
      return {
        exists: true,
        raw: JSON.parse(content),
        manifestPath,
      }
    } catch (error) {
      if (isErrnoWithCode(error, 'ENOENT')) {
        return {
          exists: false,
          manifestPath,
        }
      }
      throw error
    }
  }

  async function readSkillMetadata(skillDir: string): Promise<SkillMetadata | null> {
    const metadataPath = join(skillDir, 'skill.json')
    try {
      const content = await readFile(metadataPath, 'utf8')
      const parsed = JSON.parse(content)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null
      }
      const name =
        typeof (parsed as { name?: unknown }).name === 'string'
          ? (parsed as { name: string }).name
          : undefined
      const version =
        typeof (parsed as { version?: unknown }).version === 'string'
          ? (parsed as { version: string }).version
          : undefined
      return {
        name,
        version,
      }
    } catch (error) {
      if (isErrnoWithCode(error, 'ENOENT')) {
        return null
      }
      return null
    }
  }

  async function loadSkillDirectories(
    rootPath: string,
    loadedFrom: IntegrationLoadedFrom,
    pluginId?: string,
  ): Promise<void> {
    let entries: Array<{ name: string; isDirectory(): boolean }>
    try {
      entries = await readdir(rootPath, { withFileTypes: true, encoding: 'utf8' })
    } catch (error) {
      if (isErrnoWithCode(error, 'ENOENT')) {
        return
      }
      throw error
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      const skillDir = join(rootPath, entry.name)
      const skillFile = join(skillDir, 'SKILL.md')
      const skillId = `skill:${resolve(skillDir)}`
      const existing = items.get(skillId)
      if (existing?.state === 'disabled') {
        continue
      }

      const discovered = markDiscovered({
        id: skillId,
        itemType: 'skill',
        name: entry.name,
        path: skillDir,
        state: 'discovered',
        loadedFrom,
        pluginId,
      })

      try {
        await readFile(skillFile, 'utf8')
      } catch (error) {
        if (isErrnoWithCode(error, 'ENOENT')) {
          markDisabled(discovered, 'skill', {
            reasonCode: 'skill_missing_markdown',
            userMessage: 'Skill requires SKILL.md.',
            retryable: false,
            detail: skillFile,
          })
          continue
        }
        markDisabled(discovered, 'skill', {
          reasonCode: 'skill_unreadable',
          userMessage: 'Skill cannot be read.',
          retryable: true,
          detail: error instanceof Error ? error.message : String(error),
        })
        continue
      }

      const metadata = await readSkillMetadata(skillDir)
      if (metadata?.name) {
        discovered.name = metadata.name
      }
      if (metadata?.version) {
        const skillVersion = metadata.version.trim()
        if (skillVersion && !isSemver(skillVersion)) {
          markDisabled(discovered, 'skill', {
            reasonCode: 'manifest_invalid',
            userMessage: 'Skill metadata version is invalid.',
            retryable: false,
            detail: skillVersion,
          })
          continue
        }
        discovered.version = skillVersion || undefined
      }

      markLoaded(discovered)
    }
  }

  async function loadPluginTarget(target: PluginLoadTarget): Promise<void> {
    const pluginId = target.id ?? basename(target.path)
    const itemId = `plugin:${pluginId}`
    const existing = items.get(itemId)
    if (existing?.state === 'disabled') {
      return
    }

    const discovered = markDiscovered({
      id: itemId,
      itemType: 'plugin',
      name: pluginId,
      path: target.path,
      state: 'discovered',
      loadedFrom: 'plugin',
    })

    if (target.enabled === false) {
      markDisabled(discovered, 'plugin', {
        reasonCode: 'plugin_disabled',
        userMessage: 'Plugin is disabled by configuration.',
        retryable: false,
      })
      return
    }

    let manifestFile: Awaited<ReturnType<typeof readManifestFile>>
    try {
      manifestFile = await readManifestFile(target.path)
    } catch (error) {
      markDisabled(discovered, 'plugin', {
        reasonCode: 'manifest_unreadable',
        userMessage: 'Plugin manifest cannot be read.',
        retryable: true,
        detail: error instanceof Error ? error.message : String(error),
      })
      return
    }

    const fallbackName = basename(target.path)
    const rawManifest: unknown = manifestFile.exists
      ? manifestFile.raw
      : ({ name: fallbackName, version: IMPLICIT_VERSION } as PluginSkillManifest)

    const manifestResolution = resolvePluginManifest(
      rawManifest,
      fallbackName,
      !manifestFile.exists,
    )

    if (!manifestResolution.manifest) {
      markDisabled(discovered, 'plugin', manifestResolution.reason ?? {
        reasonCode: 'manifest_invalid',
        userMessage: 'Plugin manifest is invalid.',
        retryable: false,
      })
      return
    }

    const manifest = manifestResolution.manifest

    if (manifest.apiVersion && !supportedApiVersions.has(manifest.apiVersion)) {
      markDisabled(discovered, 'plugin', {
        reasonCode: 'version_incompatible',
        userMessage: 'Plugin apiVersion is not compatible with current loader.',
        retryable: false,
        detail: manifest.apiVersion,
      })
      return
    }

    discovered.name = manifest.name
    discovered.version = manifest.version
    discovered.implicitVersion = manifest.implicitVersion
    discovered.apiVersion = manifest.apiVersion
    discovered.manifestPath = manifestFile.manifestPath
    markLoaded(discovered)

    for (const relativeSkillsPath of manifest.skillsPaths) {
      await loadSkillDirectories(join(target.path, relativeSkillsPath), 'plugin', discovered.id)
    }
  }

  async function loadBundledSkills(targets: BundledSkillTarget[]): Promise<void> {
    for (const target of targets) {
      const itemId = `bundled:${target.id}`
      const existing = items.get(itemId)
      if (existing?.state === 'disabled') {
        continue
      }

      const discovered = markDiscovered({
        id: itemId,
        itemType: 'skill',
        name: target.name,
        path: target.path ?? `bundled://${target.id}`,
        state: 'discovered',
        loadedFrom: 'bundled',
      })

      if (target.version) {
        const version = target.version.trim()
        if (!isSemver(version)) {
          markDisabled(discovered, 'skill', {
            reasonCode: 'manifest_invalid',
            userMessage: 'Bundled skill version is invalid.',
            retryable: false,
            detail: version,
          })
          continue
        }
        discovered.version = version
      }

      markLoaded(discovered)
    }
  }

  return {
    async load(request: PluginSkillLoadRequest): Promise<PluginSkillLoaderSnapshot> {
      const plugins = request.plugins ?? []
      const skillDirs = request.skillDirs ?? []
      const bundledSkills = request.bundledSkills ?? []

      for (const plugin of plugins) {
        await loadPluginTarget(plugin)
      }

      for (const skillDir of skillDirs) {
        await loadSkillDirectories(skillDir, 'skills')
      }

      await loadBundledSkills(bundledSkills)

      return getSnapshot()
    },

    disable(itemId, reason): PluginSkillLoaderSnapshot {
      const item = items.get(itemId)
      if (!item) {
        return getSnapshot()
      }

      const source: 'plugin' | 'skill' = item.itemType === 'plugin' ? 'plugin' : 'skill'
      const resolvedReason = reason
        ? toStructuredReason(source, reason)
        : toStructuredReason(source, {
            reasonCode: 'manually_disabled',
            userMessage: 'Integration item was manually disabled.',
            retryable: false,
          })
      transition(item, 'disabled', resolvedReason)
      items.set(item.id, item)
      return getSnapshot()
    },

    getSnapshot,

    canSchedule(itemId: string): boolean {
      const item = items.get(itemId)
      if (!item) {
        return false
      }
      return item.state !== 'disabled'
    },
  }
}
