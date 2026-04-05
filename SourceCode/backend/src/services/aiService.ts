import axios, { AxiosInstance } from 'axios'

/**
 * AI大模型服务 - 阿里云百炼API
 * 用于文档解析、OCR识别、偏差分析建议等AI能力
 */

interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface AIResponse {
  id: string
  choices: {
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface DocumentParseResult {
  modules: {
    name: string
    description: string
    complexity: 'simple' | 'medium' | 'complex'
    features: string[]
  }[]
  totalModules: number
  techStack: string[]
  businessProcess: string[]
}

interface OCRResult {
  contractAmount: number
  preSaleRatio: number
  taxRate: number
  externalLaborCost: number
  externalSoftwareCost: number
  currentManpowerCost: number
  members?: {
    name: string
    level: string
    role: string
    reportedHours: number
  }[]
}

interface DeviationAnalysisResult {
  projectName: string
  contractAmount: number
  currentManpowerCost: number
  taskProgress: number
  members: {
    name: string
    level: string
    role: string
    reportedHours: number
  }[]
  suggestion: string
}

class AIService {
  private client: AxiosInstance
  private model: string

  constructor() {
    const baseURL = process.env.AI_API_URL || 'https://coding.dashscope.aliyuncs.com/apps/anthropic'
    const apiKey = process.env.AI_API_KEY || ''

    this.client = axios.create({
      baseURL,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    })

    this.model = 'claude-3-5-sonnet-20241022'
  }

  /**
   * 调用AI模型
   */
  private async chat(messages: AIMessage[]): Promise<string> {
    try {
      const response = await this.client.post<AIResponse>('/v1/messages', {
        model: this.model,
        max_tokens: 4096,
        messages
      })

      return response.data.choices[0]?.message?.content || ''
    } catch (error) {
      console.error('AI service error:', error)
      throw new Error('AI服务调用失败')
    }
  }

  /**
   * 解析需求文档
   */
  async parseDocument(documentText: string): Promise<DocumentParseResult> {
    const systemPrompt = `你是一个专业的IT项目需求分析师。请分析用户提供的需求文档，提取以下信息：
1. 功能模块列表（每个模块包含：名称、描述、复杂度评估、功能点列表）
2. 技术栈信息
3. 业务流程

请以JSON格式返回结果，格式如下：
{
  "modules": [{"name": "", "description": "", "complexity": "simple|medium|complex", "features": []}],
  "totalModules": 0,
  "techStack": [],
  "businessProcess": []
}`

    const userPrompt = `请分析以下需求文档内容：\n\n${documentText}`

    const result = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])

    try {
      // 尝试解析JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch {
      // 解析失败时返回默认结构
    }

    return {
      modules: [],
      totalModules: 0,
      techStack: [],
      businessProcess: []
    }
  }

  /**
   * OCR识别OA截图
   */
  async recognizeOCR(imageBase64: string): Promise<OCRResult> {
    const systemPrompt = `你是一个专业的财务数据分析师。请分析用户提供的OA系统截图，提取以下财务信息：
1. 合同金额（万元）
2. 售前比例（小数，如0.15表示15%）
3. 税率（小数，如0.06表示6%）
4. 外采人力成本（万元）
5. 外采软件成本（万元）
6. 当前人力成本（万元）
7. 项目成员信息（如果可见）

请以JSON格式返回结果，格式如下：
{
  "contractAmount": 0,
  "preSaleRatio": 0,
  "taxRate": 0.06,
  "externalLaborCost": 0,
  "externalSoftwareCost": 0,
  "currentManpowerCost": 0,
  "members": [{"name": "", "level": "P5|P6|P7|P8", "role": "", "reportedHours": 0}]
}`

    const userPrompt = '请识别并提取图片中的财务数据。'

    try {
      const response = await this.client.post('/v1/messages', {
        model: this.model,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } }
            ]
          }
        ]
      })

      const content = response.data.choices[0]?.message?.content || ''
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch (error) {
      console.error('OCR recognition error:', error)
    }

    return {
      contractAmount: 0,
      preSaleRatio: 0,
      taxRate: 0.06,
      externalLaborCost: 0,
      externalSoftwareCost: 0,
      currentManpowerCost: 0
    }
  }

  /**
   * 分析项目偏差并生成建议
   */
  async analyzeDeviation(data: {
    projectName: string
    contractAmount: number
    currentCost: number
    taskProgress: number
    stageCosts: { stage: string; expected: number; actual: number }[]
    teamCosts: { team: string; expected: number; actual: number }[]
  }): Promise<string> {
    const systemPrompt = `你是一个经验丰富的IT项目管理专家。请分析项目的成本偏差情况，并给出专业的调整建议。
关注以下几点：
1. 成本偏差的原因分析
2. 各阶段成本控制的建议
3. 团队人力调整建议
4. 风险预警和应对措施

请用专业但易懂的语言给出建议，控制在300字以内。`

    const userPrompt = `项目名称：${data.projectName}
合同金额：${data.contractAmount}万元
当前成本消耗：${data.currentCost}万元
任务进度：${data.taskProgress}%

各阶段成本对比：
${data.stageCosts.map(s => `- ${s.stage}: 预期${s.expected}万, 实际${s.actual}万`).join('\n')}

各团队成本对比：
${data.teamCosts.map(t => `- ${t.team}: 预期${t.expected}万, 实际${t.actual}万`).join('\n')}

请分析偏差原因并给出调整建议。`

    return await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])
  }

  /**
   * 识别项目偏差截图
   */
  async recognizeProjectScreenshots(
    screenshots: { type: string; base64: string }[]
  ): Promise<DeviationAnalysisResult> {
    const systemPrompt = `你是一个专业的IT项目管理助手。请分析用户提供的项目截图（包括合同金额、人力成本、成员明细、任务进度等），提取以下信息：
1. 项目名称
2. 合同金额（万元）
3. 当前人力成本（万元）
4. 任务完成进度（百分比）
5. 项目成员信息

请以JSON格式返回结果。`

    const results: DeviationAnalysisResult = {
      projectName: '',
      contractAmount: 0,
      currentManpowerCost: 0,
      taskProgress: 0,
      members: [],
      suggestion: ''
    }

    for (const screenshot of screenshots) {
      try {
        const response = await this.client.post('/v1/messages', {
          model: this.model,
          max_tokens: 2048,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: `请识别这张${screenshot.type}类型的截图并提取关键信息。` },
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot.base64 } }
              ]
            }
          ]
        })

        const content = response.data.choices[0]?.message?.content || ''
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          Object.assign(results, parsed)
        }
      } catch (error) {
        console.error('Screenshot recognition error:', error)
      }
    }

    return results
  }

  /**
   * 检查AI服务可用性
   */
  async checkHealth(): Promise<boolean> {
    try {
      const result = await this.chat([
        { role: 'user', content: 'Hello, please respond with "OK" to confirm you are working.' }
      ])
      return result.toLowerCase().includes('ok')
    } catch {
      return false
    }
  }
}

// 导出单例
export const aiService = new AIService()
export default aiService