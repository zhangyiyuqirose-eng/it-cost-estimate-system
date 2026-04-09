import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Steps,
  Upload,
  Button,
  Progress,
  Typography,
  message,
  Row,
  Col,
  Form,
  Input,
  InputNumber,
  Table,
  Spin,
  Radio,
  Tooltip,
  Select,
  DatePicker,
  Tag,
} from 'antd'
import {
  InboxOutlined,
  EditOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  UploadOutlined,
  MonitorOutlined,
  CameraOutlined,
  ArrowRightOutlined,
  SettingOutlined,
  PlusOutlined,
  DeleteOutlined,
  TeamOutlined,
  DollarOutlined,
  FireOutlined,
} from '@ant-design/icons'
import type { UploadProps, UploadFile } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { deviationApi } from '@/api'
import { MEMBER_LEVEL_DAILY_COST } from '@/types'
import type { MemberLevel, ProjectMemberInfo, BaselineMode } from '@/types'

const { Text, Title } = Typography
const { Dragger } = Upload

// 步骤条配置
const stepItems = [
  {
    title: '信息录入',
    description: '上传截图与识别',
    icon: <EditOutlined />,
  },
  {
    title: '偏差分析',
    description: '成本偏差监控',
    icon: <BarChartOutlined />,
  },
]

// 默认阶段比例配置
const defaultStageRatios = [
  { stage: '需求', ratio: 15 },
  { stage: '设计', ratio: 20 },
  { stage: '开发', ratio: 35 },
  { stage: '技术测试', ratio: 15 },
  { stage: '性能测试', ratio: 5 },
  { stage: '投产', ratio: 10 },
]

// 成员等级选项
const levelOptions: { value: MemberLevel; label: string }[] = [
  { value: 'P5', label: 'P5' },
  { value: 'P6', label: 'P6' },
  { value: 'P7', label: 'P7' },
  { value: 'P8', label: 'P8' },
]

// 成员表单数据接口
interface MemberFormData {
  key: string
  name: string
  department?: string
  level: MemberLevel
  role?: string
  reportedHours: number
}

export default function CostDeviationInput() {
  const navigate = useNavigate()
  const [form] = Form.useForm()

  // 步骤状态
  const [currentStep, setCurrentStep] = useState(0)

  // 统一截图上传状态（合并4个入口）
  const [screenshotFiles, setScreenshotFiles] = useState<UploadFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // AI识别状态
  const [recognizing, setRecognizing] = useState(false)
  const [recognitionResult, setRecognitionResult] = useState<any>(null)
  const [projectId, setProjectId] = useState<number | null>(null)

  // 项目信息模块
  const [projectInfo, setProjectInfo] = useState<{
    projectName: string
    contractAmount: number
    currentManpowerCost: number
    devopsProgress: number
  } | null>(null)

  // 人员清单数据
  const [members, setMembers] = useState<MemberFormData[]>([])

  // 基准模式状态
  const [baselineMode, setBaselineMode] = useState<BaselineMode>('default')
  const [baselineFileList, setBaselineFileList] = useState<UploadFile[]>([])
  const [stageRatios, setStageRatios] = useState(defaultStageRatios)

  // 预期利润空间
  const [expectedProfit, setExpectedProfit] = useState<number>(15)

  // 开始分析状态
  const [analyzing, setAnalyzing] = useState(false)

  // 校验阶段比例合计是否为100%
  const validateStageRatios = () => {
    const total = stageRatios.reduce((sum, item) => sum + item.ratio, 0)
    return total === 100
  }

  // 生成唯一key
  const generateKey = () => `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // 处理统一上传
  const handleUpload = async () => {
    if (screenshotFiles.length === 0) {
      message.warning('请先选择要上传的截图')
      return
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      // 模拟上传进度
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 200)

      const uploadFiles = screenshotFiles.map((f) => f.originFileObj as File).filter(Boolean)
      const response = await deviationApi.uploadImages(uploadFiles)

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (response.data.code === 0 || response.data.code === 200) {
        message.success('截图上传成功')
        if (response.data.data?.projectId) {
          setProjectId(response.data.data.projectId)
        }
      }
    } catch {
      message.error('上传失败')
    } finally {
      setUploading(false)
    }
  }

  // AI识别处理
  const handleAiRecognize = async () => {
    if (!projectId) {
      message.warning('请先上传截图')
      return
    }

    setRecognizing(true)
    try {
      const response = await deviationApi.aiRecognize(projectId)
      if (response.data.code === 0 || response.data.code === 200) {
        setRecognitionResult(response.data.data)
        message.success('AI识别完成')

        // 自动填充项目信息
        if (response.data.data) {
          const data = response.data.data
          setProjectInfo({
            projectName: data.projectName || '',
            contractAmount: data.totalContractAmount || 0,
            currentManpowerCost: data.currentCostConsumption || 0,
            devopsProgress: data.taskProgress || 0,
          })

          form.setFieldsValue({
            projectName: data.projectName,
            contractAmount: data.totalContractAmount,
            currentManpowerCost: data.currentCostConsumption,
            taskProgress: data.taskProgress,
          })

          // 初始化成员列表
          if (data.members && data.members.length > 0) {
            setMembers(
              data.members.map((m: any) => ({
                key: generateKey(),
                name: m.name,
                department: m.department || '',
                level: m.level as MemberLevel,
                role: m.role || '',
                reportedHours: m.reportedHours || 0,
              }))
            )
          }
        }
      }
    } catch {
      message.error('AI识别失败')
    } finally {
      setRecognizing(false)
    }
  }

  // 成员表格列配置
  const memberColumns: ColumnsType<MemberFormData> = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (value: string, record) => (
        <Input
          value={value}
          onChange={(e) => handleMemberChange(record.key, 'name', e.target.value)}
          placeholder="请输入姓名"
          maxLength={10}
          style={{ width: '100%', borderRadius: 8 }}
        />
      ),
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      width: 120,
      render: (value: string, record) => (
        <Input
          value={value || ''}
          onChange={(e) => handleMemberChange(record.key, 'department', e.target.value)}
          placeholder="请输入部门"
          style={{ width: '100%', borderRadius: 8 }}
        />
      ),
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 100,
      render: (value: MemberLevel, record) => (
        <Select
          value={value}
          onChange={(v: MemberLevel) => handleMemberChange(record.key, 'level', v)}
          options={levelOptions}
          placeholder="请选择等级"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: (value: string, record) => (
        <Input
          value={value || ''}
          onChange={(e) => handleMemberChange(record.key, 'role', e.target.value)}
          placeholder="请输入角色"
          style={{ width: '100%', borderRadius: 8 }}
        />
      ),
    },
    {
      title: '已报工时(小时)',
      dataIndex: 'reportedHours',
      key: 'reportedHours',
      width: 130,
      render: (value: number, record) => (
        <InputNumber
          value={value}
          onChange={(v) => handleMemberChange(record.key, 'reportedHours', v || 0)}
          min={0}
          precision={1}
          style={{ width: '100%', borderRadius: 8 }}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteMember(record.key)}
        />
      ),
    },
  ]

  // 更新成员字段
  const handleMemberChange = (
    key: string,
    field: keyof MemberFormData,
    value: string | number | MemberLevel
  ) => {
    setMembers((prev) =>
      prev.map((m) => (m.key === key ? { ...m, [field]: value } : m))
    )
  }

  // 新增成员
  const handleAddMember = () => {
    const newMember: MemberFormData = {
      key: generateKey(),
      name: '',
      department: '',
      level: 'P5' as MemberLevel,
      role: '',
      reportedHours: 0,
    }
    setMembers((prev) => [...prev, newMember])
  }

  // 删除成员
  const handleDeleteMember = (key: string) => {
    setMembers((prev) => prev.filter((m) => m.key !== key))
  }

  // 上传工作量评估表
  const handleBaselineUpload = async () => {
    if (baselineFileList.length === 0) {
      message.warning('请先选择工作量评估表文件')
      return
    }

    const file = baselineFileList[0].originFileObj as File
    if (!file) return

    try {
      const response = await deviationApi.saveBaseline(projectId!, {
        mode: 'custom',
        file,
      })
      if (response.data.code === 0 || response.data.code === 200) {
        message.success('工作量评估表上传成功')
        if (response.data.data?.stageRatios) {
          setStageRatios(response.data.data.stageRatios)
        }
      }
    } catch {
      message.error('上传失败')
    }
  }

  // 开始分析
  const handleStartAnalysis = async () => {
    if (!projectId) {
      message.warning('请先完成信息录入')
      return
    }

    if (!recognitionResult) {
      message.warning('请先进行AI识别')
      return
    }

    if (!validateStageRatios()) {
      message.error('阶段比例合计必须为100%')
      return
    }

    setAnalyzing(true)
    try {
      // 保存基准配置
      await deviationApi.saveBaseline(projectId, {
        mode: baselineMode,
        stageRatios: baselineMode === 'default' ? stageRatios : undefined,
        expectedProfit,
      })

      // 计算偏差
      const response = await deviationApi.calculateDeviation(projectId)
      if (response.data.code === 0 || response.data.code === 200) {
        message.success('分析完成')
        setCurrentStep(1)
        navigate(`/cost-deviation/result?projectId=${projectId}`)
      }
    } catch {
      message.error('分析失败')
    } finally {
      setAnalyzing(false)
    }
  }

  // 统一截图上传配置（合并后的单一入口）
  const unifiedUploadProps: UploadProps = {
    name: 'images',
    multiple: true,
    fileList: screenshotFiles,
    maxCount: 20,
    beforeUpload: (file: File) => {
      const isValidType = file.type.startsWith('image/')
      if (!isValidType) {
        message.error('仅支持图片格式文件')
        return Upload.LIST_IGNORE
      }
      const isValidSize = file.size / 1024 / 1024 < 10
      if (!isValidSize) {
        message.error('图片大小不能超过 10MB')
        return Upload.LIST_IGNORE
      }
      return false // 阻止自动上传，手动控制
    },
    onChange: (info) => {
      setScreenshotFiles(info.fileList)
    },
    accept: 'image/*',
    showUploadList: {
      showDownloadIcon: false,
      showRemoveIcon: true,
    },
  }

  // 基准文件上传配置
  const baselineUploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    fileList: baselineFileList,
    beforeUpload: (file: File) => {
      const isValidType =
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls')
      if (!isValidType) {
        message.error('仅支持 Excel 格式文件')
        return Upload.LIST_IGNORE
      }
      return false
    },
    onChange: (info) => {
      setBaselineFileList(info.fileList.slice(-1))
    },
    accept: '.xlsx,.xls',
    showUploadList: {
      showDownloadIcon: false,
      showRemoveIcon: true,
    },
  }

  return (
    <div className="page-container">
      {/* 步骤条 */}
      <Card
        style={{
          borderRadius: 20,
          marginBottom: 32,
          border: '1px solid var(--color-border-light)',
        }}
      >
        <Steps current={currentStep} items={stepItems} />
      </Card>

      {/* 功能介绍区域 */}
      <div
        style={{
          background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
          borderRadius: 24,
          padding: '48px 48px',
          marginBottom: 32,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 28 }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 18,
              background: 'rgba(255, 255, 255, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MonitorOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <div>
            <Title level={3} style={{ color: '#fff', margin: 0, marginBottom: 10 }}>
              成本偏差监控
            </Title>
            <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 15, lineHeight: 1.6 }}>
              AI智能识别项目截图，分析成本偏差，提供调整建议
            </Text>
          </div>
        </div>
      </div>

      {/* 统一截图上传区域（合并后的单一入口） */}
      <Card
        style={{
          borderRadius: 24,
          marginBottom: 32,
          border: '1px solid var(--color-border-light)',
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <Title level={4} style={{ marginBottom: 8, fontWeight: 600 }}>
            <CameraOutlined style={{ marginRight: 10, color: '#8B5CF6' }} />
            上传项目截图
          </Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            请上传包含合同金额、人力成本、成员明细、DevOps任务进度等信息的截图（最多20张），AI将自动识别并提取关键信息
          </Text>
        </div>

        <Dragger {...unifiedUploadProps} disabled={uploading}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ color: '#8B5CF6', fontSize: 48 }} />
          </p>
          <p className="ant-upload-text" style={{ fontSize: 16, fontWeight: 500 }}>
            点击或拖拽多张图片到此区域
          </p>
          <p className="ant-upload-hint" style={{ fontSize: 13 }}>
            支持批量上传，最多20张图片，单个文件不超过10MB
          </p>
        </Dragger>

        {/* 上传按钮 */}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">
            已选择 {screenshotFiles.length} 张图片
          </Text>
          <Button
            type="primary"
            size="large"
            icon={<UploadOutlined />}
            onClick={handleUpload}
            disabled={screenshotFiles.length === 0 || uploading}
            style={{
              borderRadius: 12,
              height: 44,
              background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
              border: 'none',
              fontWeight: 600,
            }}
          >
            上传截图
          </Button>
        </div>

        {/* 上传进度 */}
        {uploading && (
          <div style={{ marginTop: 24 }}>
            <Progress
              percent={uploadProgress}
              status={uploadProgress === 100 ? 'success' : 'active'}
              strokeColor={{
                '0%': '#8B5CF6',
                '100%': '#10B981',
              }}
            />
          </div>
        )}

        {/* AI识别按钮 */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleOutlined />}
            onClick={handleAiRecognize}
            loading={recognizing}
            disabled={!projectId || uploading}
            style={{
              borderRadius: 14,
              height: 48,
              background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
              border: 'none',
              fontWeight: 600,
            }}
          >
            开始AI识别
          </Button>
          <Tooltip title="AI将识别上传的截图，提取项目名称、合同金额、人力成本、成员信息等">
            <InfoCircleOutlined style={{ color: '#64748b', marginLeft: 14, alignSelf: 'center' }} />
          </Tooltip>
        </div>
      </Card>

      {/* AI识别状态 */}
      {recognizing && (
        <Card
          style={{
            borderRadius: 24,
            marginBottom: 32,
            border: '1px solid var(--color-border-light)',
          }}
        >
          <Spin tip="AI正在识别截图内容...">
            <div style={{ height: 100 }} />
          </Spin>
        </Card>
      )}

      {/* 项目信息模块 */}
      {projectInfo && !recognizing && (
        <Card
          style={{
            borderRadius: 24,
            marginBottom: 32,
            border: '1px solid var(--color-border-light)',
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <Title level={4} style={{ marginBottom: 8, fontWeight: 600 }}>
              <DollarOutlined style={{ marginRight: 10, color: '#10B981' }} />
              项目信息概览
            </Title>
            <Text type="secondary" style={{ fontSize: 14 }}>以下信息已从截图自动识别提取，如有偏差可手动修正</Text>
          </div>

          <Card
            style={{
              marginBottom: 24,
              borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(52, 211, 153, 0.08) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <CheckCircleOutlined style={{ color: '#10B981', fontSize: 18 }} />
              <Text style={{ color: '#10B981', fontWeight: 500 }}>识别成功，数据已自动填充</Text>
            </div>
          </Card>

          <Row gutter={[24, 24]}>
            <Col xs={12} sm={6}>
              <Card
                style={{
                  borderRadius: 16,
                  textAlign: 'center',
                  background: 'linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%)',
                  border: 'none',
                }}
              >
                <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>项目名称</Text>
                <div style={{ marginTop: 12 }}>
                  <Text strong style={{ color: '#fff', fontSize: 18 }}>
                    {projectInfo.projectName || '-'}
                  </Text>
                </div>
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card
                style={{
                  borderRadius: 16,
                  textAlign: 'center',
                  background: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
                  border: 'none',
                }}
              >
                <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>合同金额</Text>
                <div style={{ marginTop: 12 }}>
                  <Text strong style={{ color: '#fff', fontSize: 18 }}>
                    {projectInfo.contractAmount?.toFixed(2) || '-'}
                  </Text>
                  <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}> 万元</Text>
                </div>
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card
                style={{
                  borderRadius: 16,
                  textAlign: 'center',
                  background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
                  border: 'none',
                }}
              >
                <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>人力成本</Text>
                <div style={{ marginTop: 12 }}>
                  <Text strong style={{ color: '#fff', fontSize: 18 }}>
                    {projectInfo.currentManpowerCost?.toFixed(2) || '-'}
                  </Text>
                  <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}> 万元</Text>
                </div>
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card
                style={{
                  borderRadius: 16,
                  textAlign: 'center',
                  background: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
                  border: 'none',
                }}
              >
                <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>DevOps进度</Text>
                <div style={{ marginTop: 12 }}>
                  <Text strong style={{ color: '#fff', fontSize: 18 }}>
                    {projectInfo.devopsProgress?.toFixed(1) || '-'}
                  </Text>
                  <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}> %</Text>
                </div>
              </Card>
            </Col>
          </Row>

          {/* 可编辑的项目信息表单 */}
          <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
            <Row gutter={28}>
              <Col xs={24} md={6}>
                <Form.Item label="项目名称" name="projectName">
                  <Input placeholder="请输入项目名称" style={{ borderRadius: 10 }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="合同金额(万元)" name="contractAmount">
                  <InputNumber
                    placeholder="请输入合同金额"
                    min={0}
                    precision={2}
                    style={{ width: '100%', borderRadius: 10 }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="当前人力成本(万元)" name="currentManpowerCost">
                  <InputNumber
                    placeholder="请输入人力成本"
                    min={0}
                    precision={2}
                    style={{ width: '100%', borderRadius: 10 }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="DevOps进度(%)" name="taskProgress">
                  <InputNumber
                    placeholder="请输入进度"
                    min={0}
                    max={100}
                    precision={1}
                    style={{ width: '100%', borderRadius: 10 }}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>
      )}

      {/* 人员清单模块 */}
      {recognitionResult && !recognizing && (
        <Card
          style={{
            borderRadius: 24,
            marginBottom: 32,
            border: '1px solid var(--color-border-light)',
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <Title level={4} style={{ marginBottom: 8, fontWeight: 600 }}>
              <TeamOutlined style={{ marginRight: 10, color: '#F59E0B' }} />
              人员清单
            </Title>
            <Text type="secondary" style={{ fontSize: 14 }}>管理项目团队成员信息，可新增、修改或删除成员</Text>
          </div>

          <Table
            columns={memberColumns}
            dataSource={members}
            rowKey="key"
            pagination={false}
            locale={{ emptyText: '暂无成员，请点击添加' }}
            summary={() =>
              members.length > 0 ? (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}>
                      <Text strong>合计</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1}>
                      <Text>{members.length} 人</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} />
                    <Table.Summary.Cell index={3} />
                    <Table.Summary.Cell index={4}>
                      <Text strong style={{ color: '#3B82F6' }}>
                        {members.reduce((sum, m) => sum + (m.reportedHours || 0), 0).toFixed(1)} 小时
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} />
                  </Table.Summary.Row>
                </Table.Summary>
              ) : null
            }
          />

          <div style={{ marginTop: 16 }}>
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={handleAddMember}
              style={{ borderRadius: 10 }}
            >
              新增成员
            </Button>
          </div>
        </Card>
      )}

      {/* 分析基准配置 */}
      <Card
        style={{
          borderRadius: 24,
          marginBottom: 32,
          border: '1px solid var(--color-border-light)',
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <Title level={4} style={{ marginBottom: 8, fontWeight: 600 }}>
            <SettingOutlined style={{ marginRight: 10, color: '#F59E0B' }} />
            分析基准配置
          </Title>
          <Text type="secondary" style={{ fontSize: 14 }}>选择分析基准模式，用于计算各阶段成本偏差对比</Text>
        </div>

        <Form layout="vertical">
          <Form.Item label="基准模式选择">
            <Radio.Group
              value={baselineMode}
              onChange={(e) => setBaselineMode(e.target.value)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="default">系统默认比例</Radio.Button>
              <Radio.Button value="custom">上传工作量评估表</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {/* 模式1：上传工作量评估表 */}
          {baselineMode === 'custom' && (
            <Form.Item label="工作量评估表">
              <Dragger {...baselineUploadProps}>
                <p className="ant-upload-drag-icon">
                  <InboxOutlined style={{ color: '#F59E0B', fontSize: 36 }} />
                </p>
                <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
                <p className="ant-upload-hint">仅支持 Excel 格式的工作量评估表</p>
              </Dragger>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                onClick={handleBaselineUpload}
                disabled={baselineFileList.length === 0}
                style={{ marginTop: 16, borderRadius: 10 }}
              >
                上传评估表
              </Button>
            </Form.Item>
          )}

          {/* 模式2：系统默认比例（可编辑） */}
          {baselineMode === 'default' && (
            <Form.Item label="阶段比例配置">
              <Card
                style={{
                  marginBottom: 20,
                  borderRadius: 14,
                  background: validateStageRatios()
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(52, 211, 153, 0.08) 100%)'
                    : 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(251, 191, 36, 0.08) 100%)',
                  border: validateStageRatios()
                    ? '1px solid rgba(16, 185, 129, 0.25)'
                    : '1px solid rgba(245, 158, 11, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {validateStageRatios() ? (
                    <CheckCircleOutlined style={{ color: '#10B981' }} />
                  ) : (
                    <InfoCircleOutlined style={{ color: '#F59E0B' }} />
                  )}
                  <Text>
                    当前比例合计: {stageRatios.reduce((sum, item) => sum + item.ratio, 0)}%
                    {validateStageRatios() ? ' (配置正确)' : ' (请调整至100%)'}
                  </Text>
                </div>
              </Card>

              <Row gutter={[16, 16]}>
                {stageRatios.map((item, index) => (
                  <Col xs={12} md={8} lg={4} key={item.stage}>
                    <Card
                      size="small"
                      style={{ borderRadius: 14, textAlign: 'center' }}
                    >
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {item.stage}
                      </Text>
                      <InputNumber
                        value={item.ratio}
                        onChange={(value) => {
                          const newRatios = [...stageRatios]
                          newRatios[index].ratio = value || 0
                          setStageRatios(newRatios)
                        }}
                        min={0}
                        max={100}
                        precision={0}
                        style={{ width: '100%', marginTop: 10, borderRadius: 10 }}
                        addonAfter="%"
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            </Form.Item>
          )}

          {/* 预期利润空间 */}
          <Form.Item
            label={
              <span>
                预期利润空间(%)
                <Tooltip title="预留的利润空间比例，用于计算合理成本消耗">
                  <InfoCircleOutlined style={{ color: '#64748b', marginLeft: 6 }} />
                </Tooltip>
              </span>
            }
          >
            <InputNumber
              value={expectedProfit}
              onChange={(value) => setExpectedProfit(value || 0)}
              min={0}
              max={50}
              precision={1}
              style={{ width: 200, borderRadius: 10 }}
              addonAfter="%"
            />
          </Form.Item>
        </Form>
      </Card>

      {/* 操作按钮 */}
      <Card
        style={{
          borderRadius: 20,
          border: '1px solid var(--color-border-light)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button
            size="large"
            onClick={() => navigate('/dashboard')}
            style={{ borderRadius: 14, height: 48 }}
          >
            返回首页
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<BarChartOutlined />}
            onClick={handleStartAnalysis}
            loading={analyzing}
            disabled={!recognitionResult || !validateStageRatios()}
            style={{
              borderRadius: 14,
              height: 48,
              background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
              border: 'none',
              fontWeight: 600,
            }}
          >
            开始分析
            <ArrowRightOutlined style={{ marginLeft: 10 }} />
          </Button>
        </div>
      </Card>
    </div>
  )
}