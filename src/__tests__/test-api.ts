// 测试 API 连接
import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// 加载配置
const configPath = path.join(os.homedir(), '.claude', 'settings.json')
const settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
const env = settings.env || {}

const client = new Anthropic({
  apiKey: env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_FOUNDRY_API_KEY,
  baseURL: env.ANTHROPIC_BASE_URL || env.ANTHROPIC_FOUNDRY_BASE_URL,
})

console.log('Testing API connection...')
console.log('Base URL:', env.ANTHROPIC_BASE_URL || env.ANTHROPIC_FOUNDRY_BASE_URL)
console.log('Model:', env.ANTHROPIC_MODEL)

async function test() {
  try {
    // 非流式请求
    const response = await client.messages.create({
      model: env.ANTHROPIC_MODEL || 'GLM-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: '说 hello' }],
    })

    console.log('Response:', JSON.stringify(response, null, 2))
  } catch (error) {
    console.error('Error:', error)
  }
}

test()
