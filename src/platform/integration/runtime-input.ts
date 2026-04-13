import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { createSpanId } from '../../observability/ids.js'
import { getTraceBus } from '../../observability/trace-bus.js'
import { createPluginSkillLoader } from './plugin/loader.js'
import type { IntegrationRegistryRebuildInput } from './registry/types.js'

export interface BuildRuntimeIntegrationRegistryInputOptions {
  cwd: string
  sessionId: string
  traceId: string
  homeDir?: string
  envSkillDirs?: string
}

export function resolveRuntimeSkillDirs(input: {
  cwd: string
  homeDir?: string
  envSkillDirs?: string
}): string[] {
  const configured = parseConfiguredSkillDirs(input.envSkillDirs)
  if (configured.length > 0) {
    return configured
  }

  const defaults = [
    resolve(input.cwd, '.claude', 'skills'),
    resolve(input.homeDir ?? homedir(), '.claude', 'skills'),
  ]

  return [...new Set(defaults)]
}

export async function buildRuntimeIntegrationRegistryInput(
  options: BuildRuntimeIntegrationRegistryInputOptions,
): Promise<IntegrationRegistryRebuildInput> {
  const skillDirs = resolveRuntimeSkillDirs({
    cwd: options.cwd,
    homeDir: options.homeDir,
    envSkillDirs: options.envSkillDirs ?? process.env.ZHGU_INTEGRATION_SKILL_DIRS,
  })

  const loader = createPluginSkillLoader({
    sessionId: options.sessionId,
    traceId: options.traceId,
    module: 'platform.integration.runtime-input.plugin-loader',
  })

  try {
    const pluginSnapshot = await loader.load({
      skillDirs,
    })
    return { pluginSnapshot }
  } catch (error) {
    getTraceBus().emit({
      stage: 'provider',
      event: 'integration_plugin_skill_load_failed',
      status: 'error',
      session_id: options.sessionId,
      trace_id: options.traceId,
      span_id: createSpanId(),
      payload: {
        module: 'platform.integration.runtime-input',
        skillDirs,
        message: error instanceof Error ? error.message : String(error),
      },
    })
    return {}
  }
}

function parseConfiguredSkillDirs(raw: string | undefined): string[] {
  if (!raw) {
    return []
  }
  return [...new Set(raw.split(',').map((item) => item.trim()).filter(Boolean).map((item) => resolve(item)))]
}
