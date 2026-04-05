import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import mammoth from 'mammoth'
import prisma from '../config/database'
import { authMiddleware } from '../middlewares/auth'
import aiService from '../services/aiService'
import {
  ApiResponse,
  UploadDocumentResponse,
  ParseDocumentResponse,
  ParseResult,
  ModuleInfo,
  EstimateConfigRequest,
  EstimateConfigResponse,
  CalculateEstimateResponse,
  StageDetail,
  TeamDetail,
  CalcTraceItem,
  ComplexityConfig,
  SystemCoefficient,
  ProcessCoefficient,
  TechStackCoefficient,
  UnitPriceConfig,
  AuthenticatedRequest
} from '../types'

const router = Router()

// ==================== 文件上传配置 ====================

const uploadDir = path.join(process.cwd(), 'uploads', 'documents')

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.doc', '.docx']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowedExtensions.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('只支持 DOC/DOCX 格式的文档'))
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
})

// ==================== 默认配置（参考 Python 实现）====================

const DEFAULT_COMPLEXITY_CONFIG: Record<string, number> = {
  very_basic: 0.5,
  basic: 1.0,
  medium: 1.5,
  complex: 2.0,
  very_complex: 2.5
}

const DEFAULT_FLOW_COEFFICIENTS: Record<string, number> = {
  requirements: 0.7,
  ui_design: 0.3,
  tech_design: 0.5,
  development: 1.2,
  tech_testing: 0.7,
  perf_testing: 0.3
}

const DEFAULT_TECH_STACK_COEFFICIENT = 1.3
const DEFAULT_MANAGEMENT_COEFFICIENT = 0.15
const DEFAULT_GO_LIVE_PERCENTAGE = 0.02

const DEFAULT_DAILY_RATES: Record<string, number> = {
  product_manager: 2000,
  ui_designer: 1800,
  frontend_dev: 1800,
  backend_dev: 2000,
  func_tester: 1500,
  perf_tester: 2000,
  project_manager: 2000
}

// 阶段定义
const PHASES = [
  { key: 'requirements', name: '需求', usesTechStack: false },
  { key: 'ui_design', name: 'UI设计', usesTechStack: false },
  { key: 'tech_design', name: '技术设计', usesTechStack: true },
  { key: 'development', name: '开发', usesTechStack: true },
  { key: 'tech_testing', name: '技术测试', usesTechStack: true },
  { key: 'perf_testing', name: '性能测试', usesTechStack: false }
]

// 合规区间
const COMPLIANCE_RANGES: Record<string, [number, number]> = {
  '需求': [12, 18],
  '设计': [12, 20],
  '开发': [30, 40],
  '技术测试': [15, 25],
  '性能测试': [0, 12],
  '投产上线': [2, 2]
}

// ==================== 辅助函数 ====================

const sendResponse = <T>(res: Response, data: T, message = '操作成功'): void => {
  res.json({
    code: 200,
    message,
    data
  })
}

const sendError = (res: Response, code: number, message: string): void => {
  res.status(code).json({
    code,
    message,
    data: null
  })
}

/**
 * 验证项目归属
 */
const verifyProjectOwnership = async (projectId: number, userId: number): Promise<boolean> => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId }
  })
  return project !== null
}

/**
 * 解析 DOC/DOCX 文档内容
 */
const parseDocumentContent = async (filePath: string): Promise<string> => {
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value
}

/**
 * 获取关联度系数（参考 Python 实现）
 */
const getAssociationCoefficient = (nSystems: number): number => {
  if (nSystems <= 1) return 1.0
  if (nSystems < 3) return 1.5
  if (nSystems <= 5) return 2.0
  return 3.0
}

// ==================== 路由定义 ====================

/**
 * POST /upload - 上传需求文档
 */
router.post('/upload', authMiddleware, upload.single('document'), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest
    const userId = authReq.userId
    const file = req.file

    if (!file) {
      return sendError(res, 400, '请上传文档文件')
    }

    console.log(`[Upload] 文件上传成功: ${file.originalname}`)

    // 创建项目
    const project = await prisma.project.create({
      data: {
        userId,
        projectName: path.basename(file.originalname, path.extname(file.originalname)),
        projectType: 'software',
        status: 'ongoing'
      }
    })

    // 创建文档记录
    const document = await prisma.projectDocument.create({
      data: {
        projectId: project.id,
        docName: file.originalname,
        docPath: file.filename,
        docType: 'requirement',
        parseStatus: 'pending'
      }
    })

    const response: UploadDocumentResponse = {
      documentId: document.id,
      docName: document.docName,
      docPath: `/uploads/documents/${file.filename}`
    }

    sendResponse(res, { ...response, projectId: project.id }, '文档上传成功')
  } catch (error) {
    console.error('Upload error:', error)
    sendError(res, 500, '文档上传失败')
  }
})

/**
 * POST /:projectId/parse - 解析文档（使用 AI）
 */
router.post('/:projectId/parse', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest
    const { projectId } = req.params
    const userId = authReq.userId

    if (!await verifyProjectOwnership(Number(projectId), userId)) {
      return sendError(res, 403, '无权访问该项目')
    }

    // 获取项目文档
    const document = await prisma.projectDocument.findFirst({
      where: { projectId: Number(projectId) }
    })

    if (!document) {
      return sendError(res, 404, '未找到项目文档')
    }

    // 更新解析状态
    await prisma.projectDocument.update({
      where: { id: document.id },
      data: { parseStatus: 'parsing' }
    })

    // 解析文档内容
    const filePath = path.join(uploadDir, document.docPath || '')
    const text = await parseDocumentContent(filePath)

    console.log(`[Parse] 开始 AI 分析，文档长度: ${text.length}`)

    // 使用 AI 解析文档
    const aiResult = await aiService.parseDocument(text.substring(0, 12000))

    console.log(`[Parse] AI 分析完成，模块数: ${aiResult.modules?.length || 0}`)

    // 转换为内部格式
    const modules: ModuleInfo[] = (aiResult.modules || []).map((m: any) => ({
      name: m.name || '未命名模块',
      description: m.description || '',
      complexity: mapComplexity(m.complexity),
      features: (m.functions || m.features || []).map((f: any) =>
        typeof f === 'string' ? f : f.name || '未命名功能'
      ),
      associationSystems: m.association_systems || 1
    }))

    const parseResult: ParseResult = {
      modules,
      totalModules: modules.length,
      rawText: text.substring(0, 5000),
      projectName: aiResult.project_name || document.docName.replace(/\.(doc|docx)$/i, ''),
      systemName: aiResult.system_name || ''
    }

    // 更新解析结果
    await prisma.projectDocument.update({
      where: { id: document.id },
      data: {
        parseStatus: 'success',
        parseResult: JSON.stringify(parseResult)
      }
    })

    const response: ParseDocumentResponse = {
      documentId: document.id,
      parseStatus: 'success',
      parseResult
    }

    sendResponse(res, response, '文档解析成功')
  } catch (error) {
    console.error('Parse error:', error)

    // 更新解析状态为失败
    const document = await prisma.projectDocument.findFirst({
      where: { projectId: Number(req.params.projectId) }
    })
    if (document) {
      await prisma.projectDocument.update({
        where: { id: document.id },
        data: { parseStatus: 'failed' }
      })
    }

    sendError(res, 500, '文档解析失败')
  }
})

/**
 * 映射复杂度
 */
function mapComplexity(complexity: string): 'simple' | 'medium' | 'complex' {
  const mapping: Record<string, 'simple' | 'medium' | 'complex'> = {
    very_basic: 'simple',
    basic: 'simple',
    medium: 'medium',
    complex: 'complex',
    very_complex: 'complex'
  }
  return mapping[complexity?.toLowerCase()] || 'medium'
}

/**
 * GET /config/default - 获取默认参数配置
 */
router.get('/config/default', authMiddleware, async (req: Request, res: Response) => {
  try {
    const defaultConfig: EstimateConfigResponse = {
      id: 0,
      projectId: 0,
      complexityConfig: DEFAULT_COMPLEXITY_CONFIG as any,
      systemCoefficient: { distributed: 1.2, microservice: 1.3, monomer: 1.0 },
      processCoefficient: { agile: 1.1, waterfall: 1.0, hybrid: 1.05 },
      techStackCoefficient: { java: 1.0, python: 0.9, nodejs: 0.95, dotnet: 1.0, go: 0.85 },
      unitPriceConfig: DEFAULT_DAILY_RATES as any,
      managementCoefficient: DEFAULT_MANAGEMENT_COEFFICIENT
    }

    sendResponse(res, defaultConfig, '获取默认配置成功')
  } catch (error) {
    console.error('Get default config error:', error)
    sendError(res, 500, '获取默认配置失败')
  }
})

/**
 * POST /:projectId/config - 保存参数配置
 */
router.post('/:projectId/config', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest
    const { projectId } = req.params
    const userId = authReq.userId
    const configData: EstimateConfigRequest = req.body

    if (!await verifyProjectOwnership(Number(projectId), userId)) {
      return sendError(res, 403, '无权访问该项目')
    }

    // 创建或更新配置
    const existingConfig = await prisma.estimateConfig.findFirst({
      where: { projectId: Number(projectId) }
    })

    const configToSave = {
      complexityConfig: JSON.stringify(configData.complexityConfig || DEFAULT_COMPLEXITY_CONFIG),
      systemCoefficient: JSON.stringify(configData.systemCoefficient || {}),
      processCoefficient: JSON.stringify(configData.processCoefficient || {}),
      techStackCoefficient: JSON.stringify(configData.techStackCoefficient || {}),
      unitPriceConfig: JSON.stringify(configData.unitPriceConfig || DEFAULT_DAILY_RATES),
      managementCoefficient: configData.managementCoefficient || DEFAULT_MANAGEMENT_COEFFICIENT
    }

    if (existingConfig) {
      const updated = await prisma.estimateConfig.update({
        where: { id: existingConfig.id },
        data: configToSave
      })

      const response: EstimateConfigResponse = {
        id: updated.id,
        projectId: updated.projectId,
        complexityConfig: JSON.parse(updated.complexityConfig || '{}'),
        systemCoefficient: JSON.parse(updated.systemCoefficient || '{}'),
        processCoefficient: JSON.parse(updated.processCoefficient || '{}'),
        techStackCoefficient: JSON.parse(updated.techStackCoefficient || '{}'),
        unitPriceConfig: JSON.parse(updated.unitPriceConfig || '{}'),
        managementCoefficient: updated.managementCoefficient
      }

      sendResponse(res, response, '配置更新成功')
    } else {
      const created = await prisma.estimateConfig.create({
        data: {
          projectId: Number(projectId),
          ...configToSave
        }
      })

      const response: EstimateConfigResponse = {
        id: created.id,
        projectId: created.projectId,
        complexityConfig: JSON.parse(created.complexityConfig || '{}'),
        systemCoefficient: JSON.parse(created.systemCoefficient || '{}'),
        processCoefficient: JSON.parse(created.processCoefficient || '{}'),
        techStackCoefficient: JSON.parse(created.techStackCoefficient || '{}'),
        unitPriceConfig: JSON.parse(created.unitPriceConfig || '{}'),
        managementCoefficient: created.managementCoefficient
      }

      sendResponse(res, response, '配置保存成功')
    }
  } catch (error) {
    console.error('Save config error:', error)
    sendError(res, 500, '配置保存失败')
  }
})

/**
 * POST /:projectId/calculate - 计算工作量（参考 Python 实现）
 */
router.post('/:projectId/calculate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest
    const { projectId } = req.params
    const userId = authReq.userId

    if (!await verifyProjectOwnership(Number(projectId), userId)) {
      return sendError(res, 403, '无权访问该项目')
    }

    // 获取解析结果
    const document = await prisma.projectDocument.findFirst({
      where: { projectId: Number(projectId), parseStatus: 'success' }
    })

    if (!document || !document.parseResult) {
      return sendError(res, 400, '请先解析需求文档')
    }

    const parseResult: ParseResult = JSON.parse(document.parseResult)

    // 获取配置
    const config = await prisma.estimateConfig.findFirst({
      where: { projectId: Number(projectId) }
    })

    const complexityConfig: Record<string, number> = config
      ? JSON.parse(config.complexityConfig || '{}')
      : DEFAULT_COMPLEXITY_CONFIG

    const flowCoefficients: Record<string, number> = DEFAULT_FLOW_COEFFICIENTS
    const techStackCoefficient = DEFAULT_TECH_STACK_COEFFICIENT
    const managementCoefficient = config?.managementCoefficient || DEFAULT_MANAGEMENT_COEFFICIENT
    const goLivePercentage = DEFAULT_GO_LIVE_PERCENTAGE
    const dailyRates = config
      ? JSON.parse(config.unitPriceConfig || '{}')
      : DEFAULT_DAILY_RATES

    // 工作量计算（参考 Python 实现）
    const calcTrace: CalcTraceItem[] = []
    const items: any[] = []
    const phaseRawSums: Record<string, number> = {}

    // 初始化阶段累加器
    for (const phase of PHASES) {
      phaseRawSums[phase.name] = 0
    }

    // 逐模块逐功能计算
    for (const module of parseResult.modules) {
      const features = module.features || [module.name]

      for (const featureName of features) {
        const complexity = (module.complexity || 'medium').toLowerCase()
        const baseDays = complexityConfig[complexity] || complexityConfig['medium'] || 1.5

        // 获取关联度系数
        const associationSystems = (module as any).associationSystems || 1
        const associationCoef = getAssociationCoefficient(associationSystems)

        for (const phase of PHASES) {
          const flowCoef = flowCoefficients[phase.key] || 0
          if (flowCoef === 0) continue

          let rawDays: number
          if (phase.usesTechStack) {
            rawDays = baseDays * associationCoef * flowCoef * techStackCoefficient
          } else {
            rawDays = baseDays * associationCoef * flowCoef
          }

          const daysWithMgmt = rawDays * (1 + managementCoefficient)
          const roundedDays = Math.round(daysWithMgmt * 100) / 100

          if (roundedDays > 0) {
            items.push({
              phase: phase.name,
              module: module.name,
              function: featureName,
              workload: roundedDays,
              complexity
            })
            phaseRawSums[phase.name] += daysWithMgmt
          }
        }
      }
    }

    // 阶段合计
    const stageDetail: StageDetail[] = []
    for (const phase of PHASES) {
      const totalDays = Math.round(phaseRawSums[phase.name] * 2) / 2 // 取整到0.5
      stageDetail.push({
        stage: phase.name,
        manDays: totalDays,
        percentage: 0, // 后面计算
        description: `${phase.name}阶段工作量`
      })
    }

    // 投产上线
    const preGoLiveTotal = stageDetail.reduce((sum, s) => sum + s.manDays, 0)
    const goLiveDays = Math.round(preGoLiveTotal * goLivePercentage * 100) / 100
    stageDetail.push({
      stage: '投产上线',
      manDays: goLiveDays,
      percentage: 2,
      description: '上线部署及技术支持'
    })

    // 计算占比
    const totalManDay = stageDetail.reduce((sum, s) => sum + s.manDays, 0)
    stageDetail.forEach(s => {
      s.percentage = Math.round(s.manDays / totalManDay * 10000) / 100
    })

    // 团队成本计算（参考 Python 实现）
    const reqDays = stageDetail.find(s => s.stage === '需求')?.manDays || 0
    const uiDays = stageDetail.find(s => s.stage === 'UI设计')?.manDays || 0
    const techDesignDays = stageDetail.find(s => s.stage === '技术设计')?.manDays || 0
    const devDays = stageDetail.find(s => s.stage === '开发')?.manDays || 0
    const techTestDays = stageDetail.find(s => s.stage === '技术测试')?.manDays || 0
    const perfTestDays = stageDetail.find(s => s.stage === '性能测试')?.manDays || 0

    const productCost = Math.round(reqDays * (dailyRates.product_manager || 2000) * 100) / 100
    const uiCost = Math.round(uiDays * (dailyRates.ui_designer || 1800) * 100) / 100

    const designDevTotal = techDesignDays + devDays
    const frontendDays = Math.round(designDevTotal * 0.4 * 100) / 100
    const backendDays = Math.round(designDevTotal * 0.6 * 100) / 100
    const devCost = Math.round(
      frontendDays * (dailyRates.frontend_dev || 1800) +
      backendDays * (dailyRates.backend_dev || 2000)
    * 100) / 100

    const testCost = Math.round(
      techTestDays * (dailyRates.func_tester || 1500) +
      perfTestDays * (dailyRates.perf_tester || 2000)
    * 100) / 100

    const pmDays = Math.round((preGoLiveTotal * managementCoefficient + goLiveDays) * 100) / 100
    const pmCost = Math.round(pmDays * (dailyRates.project_manager || 2000) * 100) / 100

    const teamDetail: TeamDetail[] = [
      { level: '产品团队', count: 1, dailyCost: dailyRates.product_manager || 2000, totalCost: productCost, manDays: Math.round(reqDays) },
      { level: 'UI团队', count: 1, dailyCost: dailyRates.ui_designer || 1800, totalCost: uiCost, manDays: Math.round(uiDays) },
      { level: '研发团队', count: Math.round(frontendDays + backendDays), dailyCost: 0, totalCost: devCost, manDays: Math.round(designDevTotal) },
      { level: '测试团队', count: 1, dailyCost: 0, totalCost: testCost, manDays: Math.round(techTestDays + perfTestDays) },
      { level: '项目管理', count: 1, dailyCost: dailyRates.project_manager || 2000, totalCost: pmCost, manDays: Math.round(pmDays) }
    ]

    const totalCost = Math.round((productCost + uiCost + devCost + testCost + pmCost) * 100) / 100
    const manMonth = Math.round(totalManDay / 21.75 * 100) / 100

    // 添加计算轨迹
    calcTrace.push({
      step: '基础工作量计算',
      input: { modules: parseResult.modules.map(m => m.name), complexityConfig },
      output: { items: items.length },
      formula: 'Σ(模块复杂度对应人天)'
    })

    calcTrace.push({
      step: '阶段分解',
      input: { totalManDay, phases: PHASES.map(p => p.name) },
      output: { stageDetail }
    })

    calcTrace.push({
      step: '团队成本计算',
      input: { teamConfig: teamDetail.map(t => t.level), dailyRates, totalManDay },
      output: { teamDetail, totalCost }
    })

    // 保存结果
    const existingResult = await prisma.estimateResult.findFirst({
      where: { projectId: Number(projectId) }
    })

    const resultData = {
      totalManDay,
      totalCost,
      moduleCount: parseResult.totalModules,
      manMonth,
      stageDetail: JSON.stringify(stageDetail),
      teamDetail: JSON.stringify(teamDetail),
      calcTrace: JSON.stringify(calcTrace)
    }

    if (existingResult) {
      await prisma.estimateResult.update({
        where: { id: existingResult.id },
        data: resultData
      })
    } else {
      await prisma.estimateResult.create({
        data: {
          projectId: Number(projectId),
          ...resultData
        }
      })
    }

    const response: CalculateEstimateResponse = {
      totalManDay,
      totalCost,
      moduleCount: parseResult.totalModules,
      manMonth,
      stageDetail,
      teamDetail,
      calcTrace
    }

    console.log(`[Calculate] 计算完成: 总人天=${totalManDay}, 总成本=${totalCost}万元`)

    sendResponse(res, response, '工作量计算成功')
  } catch (error) {
    console.error('Calculate error:', error)
    sendError(res, 500, '工作量计算失败')
  }
})

/**
 * GET /:projectId/result - 获取计算结果
 */
router.get('/:projectId/result', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest
    const { projectId } = req.params
    const userId = authReq.userId

    if (!await verifyProjectOwnership(Number(projectId), userId)) {
      return sendError(res, 403, '无权访问该项目')
    }

    const result = await prisma.estimateResult.findFirst({
      where: { projectId: Number(projectId) },
      orderBy: { createdAt: 'desc' }
    })

    if (!result) {
      return sendError(res, 404, '未找到计算结果')
    }

    const response: CalculateEstimateResponse = {
      totalManDay: result.totalManDay,
      totalCost: result.totalCost,
      moduleCount: result.moduleCount,
      manMonth: result.manMonth,
      stageDetail: JSON.parse(result.stageDetail || '[]'),
      teamDetail: JSON.parse(result.teamDetail || '[]'),
      calcTrace: JSON.parse(result.calcTrace || '[]')
    }

    sendResponse(res, response, '获取结果成功')
  } catch (error) {
    console.error('Get result error:', error)
    sendError(res, 500, '获取计算结果失败')
  }
})

/**
 * GET /:projectId/export - 导出Excel报告
 */
router.get('/:projectId/export', authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest
    const { projectId } = req.params
    const userId = authReq.userId

    if (!await verifyProjectOwnership(Number(projectId), userId)) {
      return sendError(res, 403, '无权访问该项目')
    }

    const project = await prisma.project.findUnique({
      where: { id: Number(projectId) }
    })

    const result = await prisma.estimateResult.findFirst({
      where: { projectId: Number(projectId) },
      orderBy: { createdAt: 'desc' }
    })

    if (!result || !project) {
      return sendError(res, 404, '未找到计算结果')
    }

    const stageDetail: StageDetail[] = JSON.parse(result.stageDetail || '[]')
    const teamDetail: TeamDetail[] = JSON.parse(result.teamDetail || '[]')

    // 导出目录
    const exportDir = path.join(process.cwd(), 'uploads', 'exports')
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true })
    }

    const fileName = `estimate_${project.projectName}_${Date.now()}.xlsx`
    const filePath = path.join(exportDir, fileName)

    // 创建 Excel 文件
    const xlsx = await import('xlsx')
    const wb = xlsx.utils.book_new()

    // 概览页
    const summaryData = [
      ['项目名称', project.projectName],
      ['总工作量（人天）', result.totalManDay],
      ['总工作量（人月）', result.manMonth],
      ['模块数量', result.moduleCount],
      ['总成本（元）', result.totalCost],
      ['计算时间', result.createdAt.toLocaleString()]
    ]
    const summaryWs = xlsx.utils.aoa_to_sheet(summaryData)
    xlsx.utils.book_append_sheet(wb, summaryWs, '概览')

    // 阶段明细页
    const stageData = [['阶段', '工作量（人天）', '占比（%）', '描述']]
    stageDetail.forEach(stage => {
      stageData.push([stage.stage, String(stage.manDays), String(stage.percentage), stage.description])
    })
    const stageWs = xlsx.utils.aoa_to_sheet(stageData)
    xlsx.utils.book_append_sheet(wb, stageWs, '阶段明细')

    // 团队明细页
    const teamData = [['团队', '工作量（人天）', '总成本（元）']]
    teamDetail.forEach(team => {
      teamData.push([team.level, String(team.manDays), String(team.totalCost)])
    })
    const teamWs = xlsx.utils.aoa_to_sheet(teamData)
    xlsx.utils.book_append_sheet(wb, teamWs, '团队明细')

    // 写入文件
    xlsx.writeFile(wb, filePath)

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Download error:', err)
      }
    })
  } catch (error) {
    console.error('Export error:', error)
    sendError(res, 500, '导出报告失败')
  }
})

export default router