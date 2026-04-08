import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface Context {
  cwd: string
  gitBranch?: string
  gitStatus?: string
  claudeMd?: string
  memoryFiles?: string[]
  systemInfo: {
    platform: string
    nodeVersion: string
    date: string
  }
}

/**
 * Build context for the AI assistant
 */
export async function buildContext(): Promise<Context> {
  const cwd = process.cwd()

  const context: Context = {
    cwd,
    systemInfo: {
      platform: process.platform,
      nodeVersion: process.version,
      date: new Date().toISOString(),
    },
  }

  // Try to get git info
  try {
    const { execSync } = await import('child_process')
    context.gitBranch = execSync('git branch --show-current', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()

    context.gitStatus = execSync('git status --short', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
  } catch {
    // Not a git repo, ignore
  }

  // Load CLAUDE.md from multiple locations
  const claudeMdContents: string[] = []

  // 1. User-level CLAUDE.md
  const userClaudeMd = path.join(os.homedir(), '.claude', 'CLAUDE.md')
  if (fs.existsSync(userClaudeMd)) {
    claudeMdContents.push(`# User Instructions\n${fs.readFileSync(userClaudeMd, 'utf-8')}`)
  }

  // 2. Project-level CLAUDE.md (current directory)
  const projectClaudeMd = path.join(cwd, 'CLAUDE.md')
  if (fs.existsSync(projectClaudeMd)) {
    claudeMdContents.push(`# Project Instructions\n${fs.readFileSync(projectClaudeMd, 'utf-8')}`)
  }

  // 3. Parent directories CLAUDE.md (up to git root or home)
  let currentDir = path.dirname(cwd)
  const homeDir = os.homedir()
  while (currentDir !== homeDir && currentDir !== '/') {
    const parentClaudeMd = path.join(currentDir, 'CLAUDE.md')
    if (fs.existsSync(parentClaudeMd)) {
      claudeMdContents.unshift(`# Parent: ${currentDir}\n${fs.readFileSync(parentClaudeMd, 'utf-8')}`)
    }
    // Stop if we hit a git root
    if (fs.existsSync(path.join(currentDir, '.git'))) {
      break
    }
    currentDir = path.dirname(currentDir)
  }

  if (claudeMdContents.length > 0) {
    context.claudeMd = claudeMdContents.join('\n\n---\n\n')
  }

  // Load memory files
  const memoryDir = path.join(os.homedir(), '.claude-code', 'memory')
  const memoryFiles: string[] = []
  if (fs.existsSync(memoryDir)) {
    const files = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'))
    for (const file of files) {
      const content = fs.readFileSync(path.join(memoryDir, file), 'utf-8')
      memoryFiles.push(content)
    }
  }
  context.memoryFiles = memoryFiles

  return context
}
