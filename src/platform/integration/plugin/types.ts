export type IntegrationLoadedFrom = 'bundled' | 'skills' | 'plugin'

export type PluginSkillLoaderState = 'discovered' | 'loaded' | 'disabled'

export type IntegrationLoadItemType = 'plugin' | 'skill'

export interface PluginSkillStructuredReason {
  source: 'plugin' | 'skill'
  module: string
  reasonCode: string
  userMessage: string
  retryable: boolean
  detail?: string
}

export interface PluginSkillLoadItem {
  id: string
  itemType: IntegrationLoadItemType
  name: string
  path: string
  state: PluginSkillLoaderState
  loadedFrom?: IntegrationLoadedFrom
  pluginId?: string
  version?: string
  implicitVersion?: boolean
  apiVersion?: string
  manifestPath?: string
  reason?: PluginSkillStructuredReason
}

export interface PluginSkillLoaderTransition {
  ts: string
  itemId: string
  itemType: IntegrationLoadItemType
  from: PluginSkillLoaderState
  to: PluginSkillLoaderState
  reason?: PluginSkillStructuredReason
}

export interface PluginSkillLoaderAuditEvent {
  ts: string
  source: 'plugin' | 'skill'
  module: string
  event: 'integration.plugin_skill.transition'
  itemId: string
  itemType: IntegrationLoadItemType
  from: PluginSkillLoaderState
  to: PluginSkillLoaderState
  reason?: PluginSkillStructuredReason
}

export interface PluginLoadTarget {
  id?: string
  path: string
  enabled?: boolean
}

export interface BundledSkillTarget {
  id: string
  name: string
  path?: string
  version?: string
}

export interface PluginSkillLoadRequest {
  plugins?: PluginLoadTarget[]
  skillDirs?: string[]
  bundledSkills?: BundledSkillTarget[]
}

export interface PluginSkillLoaderSnapshot {
  updatedAt: string
  items: PluginSkillLoadItem[]
}

export interface PluginSkillManifest {
  name: string
  version?: string
  apiVersion?: string | number
  skillsPath?: string
  skillsPaths?: string[]
}

export interface PluginSkillLoader {
  load(request: PluginSkillLoadRequest): Promise<PluginSkillLoaderSnapshot>
  disable(
    itemId: string,
    reason?: Omit<PluginSkillStructuredReason, 'source' | 'module'>,
  ): PluginSkillLoaderSnapshot
  getSnapshot(): PluginSkillLoaderSnapshot
  canSchedule(itemId: string): boolean
}

