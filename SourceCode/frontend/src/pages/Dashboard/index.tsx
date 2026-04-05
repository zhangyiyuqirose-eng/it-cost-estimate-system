import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Row, Col, Button, Spin, Empty, Typography } from 'antd'
import {
  ProjectOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  AlertOutlined,
  WarningOutlined,
  FireOutlined,
  CalculatorOutlined,
  DollarOutlined,
  MonitorOutlined,
  ArrowRightOutlined,
  RiseOutlined,
  FallOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { dashboardApi } from '@/api'
import type { DashboardStats } from '@/types'

const { Title, Text, Paragraph } = Typography

// 统计卡片组件
interface StatsCardProps {
  title: string
  value: number
  icon: React.ReactNode
  color: string
  suffix?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  onClick?: () => void
}

function StatsCard({ title, value, icon, color, suffix, trend, trendValue, onClick }: StatsCardProps) {
  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      style={{
        borderRadius: 16,
        border: '1px solid #f1f5f9',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        cursor: onClick ? 'pointer' : 'default',
      }}
      styles={{
        body: { padding: 24 },
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.025em', textTransform: 'uppercase' }}>
            {title}
          </Text>
          <div style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </Text>
            {suffix && (
              <Text type="secondary" style={{ fontSize: 14, marginLeft: 4 }}>{suffix}</Text>
            )}
          </div>
          {trend && trendValue && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              {trend === 'up' && <RiseOutlined style={{ color: '#10B981', fontSize: 12 }} />}
              {trend === 'down' && <FallOutlined style={{ color: '#EF4444', fontSize: 12 }} />}
              <Text style={{ fontSize: 12, color: trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#64748b' }}>
                {trendValue}
              </Text>
            </div>
          )}
        </div>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: `${color}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 26, color }}>{icon}</span>
        </div>
      </div>
    </Card>
  )
}

// 功能入口卡片组件
interface FeatureCardProps {
  title: string
  description: string
  icon: React.ReactNode
  color: string
  gradient: string
  path: string
  features: string[]
  navigate: (path: string) => void
}

function FeatureCard({ title, description, icon, color, gradient, path, features, navigate }: FeatureCardProps) {
  return (
    <Card
      hoverable
      onClick={() => navigate(path)}
      style={{
        borderRadius: 20,
        border: '1px solid #f1f5f9',
        height: '100%',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
      }}
      styles={{
        body: { padding: 0 },
      }}
    >
      {/* 顶部渐变区域 */}
      <div
        style={{
          background: gradient,
          padding: '32px 24px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -20,
            right: -20,
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.1)',
          }}
        />
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 32, color: '#fff' }}>{icon}</span>
        </div>
        <Title level={4} style={{ color: '#fff', margin: 0, marginBottom: 4 }}>
          {title}
        </Title>
        <Text style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 13 }}>
          {description}
        </Text>
      </div>

      {/* 功能列表 */}
      <div style={{ padding: 20 }}>
        {features.map((feature, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 0',
              borderBottom: index < features.length - 1 ? '1px solid #f1f5f9' : 'none',
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: color,
              }}
            />
            <Text style={{ fontSize: 13, color: '#475569' }}>{feature}</Text>
          </div>
        ))}
      </div>

      {/* 底部操作区 */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontSize: 13, color: color, fontWeight: 500 }}>立即使用</Text>
        <ArrowRightOutlined style={{ color: color, fontSize: 12 }} />
      </div>
    </Card>
  )
}

// 告警卡片组件
interface AlertCardProps {
  title: string
  value: number | string
  description: string
  type: 'error' | 'warning' | 'info'
  icon: React.ReactNode
}

function AlertCard({ title, value, description, type, icon }: AlertCardProps) {
  const colors = {
    error: { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626', icon: '#EF4444' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706', icon: '#F59E0B' },
    info: { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB', icon: '#3B82F6' },
  }
  const c = colors[type]

  return (
    <Card
      style={{
        borderRadius: 16,
        border: `1px solid ${c.border}`,
        background: c.bg,
      }}
      styles={{
        body: { padding: 20 },
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
          }}
        >
          <span style={{ fontSize: 24, color: c.icon }}>{icon}</span>
        </div>
        <div style={{ flex: 1 }}>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>{title}</Text>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <Text style={{ fontSize: 28, fontWeight: 700, color: c.text }}>{value}</Text>
            <Text type="secondary" style={{ fontSize: 13 }}>{description}</Text>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const response = await dashboardApi.getStats()
      setStats(response.data.data as DashboardStats)
    } catch {
      // Error is handled by interceptor
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip="加载数据中..." />
      </div>
    )
  }

  if (!stats) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Empty description="暂无数据">
          <Button type="primary" onClick={fetchStats} size="large">
            重新加载
          </Button>
        </Empty>
      </div>
    )
  }

  // 功能入口配置
  const featureCards = [
    {
      title: '实施成本预估',
      description: '智能工作量评估',
      icon: <CalculatorOutlined />,
      color: '#3B82F6',
      gradient: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
      path: '/cost-estimate/upload',
      features: ['文档智能解析', '多维度参数配置', '工作量精准计算', 'Excel报告导出'],
    },
    {
      title: '成本消耗预估',
      description: '实时成本追踪',
      icon: <DollarOutlined />,
      color: '#10B981',
      gradient: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
      path: '/cost-consumption/input',
      features: ['OCR智能识别', '团队成本核算', '燃尽时间预测', '人员方案优化'],
    },
    {
      title: '成本偏差监控',
      description: 'AI智能分析',
      icon: <MonitorOutlined />,
      color: '#8B5CF6',
      gradient: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
      path: '/cost-deviation/input',
      features: ['大模型智能识别', '偏差可视化分析', 'AI调整建议', '风险预警提醒'],
    },
  ]

  return (
    <div className="page-container">
      {/* 欢迎区域 */}
      <div
        style={{
          background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
          borderRadius: 20,
          padding: '32px 40px',
          marginBottom: 24,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)' }} />
        <div style={{ position: 'absolute', bottom: -80, right: 100, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.05)' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <Title level={2} style={{ color: '#fff', margin: 0, marginBottom: 8 }}>
            欢迎使用数字员工系统
          </Title>
          <Paragraph style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 15, margin: 0, maxWidth: 600 }}>
            智能估算，精准管控——让每一分项目成本清晰可见
          </Paragraph>
        </div>
      </div>

      {/* 项目统计卡片 */}
      <div style={{ marginBottom: 32 }}>
        <Title level={4} style={{ marginBottom: 16, fontWeight: 600 }}>
          <TeamOutlined style={{ marginRight: 8, color: '#3B82F6' }} />
          项目统计
        </Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <StatsCard
              title="项目总数"
              value={stats.totalProjects}
              icon={<ProjectOutlined />}
              color="#3B82F6"
              onClick={() => navigate('/project/list')}
            />
          </Col>
          <Col xs={24} sm={8}>
            <StatsCard
              title="进行中"
              value={stats.ongoingProjects}
              icon={<ClockCircleOutlined />}
              color="#10B981"
              trend="up"
              trendValue="正常推进"
            />
          </Col>
          <Col xs={24} sm={8}>
            <StatsCard
              title="已完成"
              value={stats.completedProjects}
              icon={<CheckCircleOutlined />}
              color="#8B5CF6"
            />
          </Col>
        </Row>
      </div>

      {/* 成本健康监控 */}
      <div style={{ marginBottom: 32 }}>
        <Title level={4} style={{ marginBottom: 16, fontWeight: 600 }}>
          <ThunderboltOutlined style={{ marginRight: 8, color: '#F59E0B' }} />
          成本健康监控
        </Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <AlertCard
              title="异常项目"
              value={stats.costAbnormalCount}
              description="成本偏差超标"
              type="error"
              icon={<AlertOutlined />}
            />
          </Col>
          <Col xs={24} sm={8}>
            <AlertCard
              title="高风险预警"
              value={stats.highRiskCount}
              description="消耗速度异常"
              type="warning"
              icon={<WarningOutlined />}
            />
          </Col>
          <Col xs={24} sm={8}>
            <AlertCard
              title="即将燃尽"
              value={stats.upcomingBurnout?.burnoutDate || '-'}
              description={stats.upcomingBurnout?.projectName || '暂无'}
              type="info"
              icon={<FireOutlined />}
            />
          </Col>
        </Row>
      </div>

      {/* 功能入口 */}
      <div>
        <Title level={4} style={{ marginBottom: 16, fontWeight: 600 }}>
          <CalculatorOutlined style={{ marginRight: 8, color: '#3B82F6' }} />
          功能入口
        </Title>
        <Row gutter={[16, 16]}>
          {featureCards.map((card) => (
            <Col xs={24} lg={8} key={card.path}>
              <FeatureCard {...card} navigate={navigate} />
            </Col>
          ))}
        </Row>
      </div>
    </div>
  )
}