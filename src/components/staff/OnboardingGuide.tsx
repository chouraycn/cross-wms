import { useEffect, useState, type ReactNode } from 'react'
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  IdCard,
  Workflow,
  X as XIcon,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog.js'
import Box from '@mui/material/Box'
import { staffTokens } from './lib/staffTokens.js'

export const ONBOARDING_SEEN_KEY = 'staffdeck_onboarding_guide_seen'

/** Custom event that lets any part of the app re-open the onboarding guide. */
export const OPEN_ONBOARDING_EVENT = 'staffdeck-open-onboarding'
export const OPEN_QUICK_START_EVENT = 'staffdeck-open-quick-start'

type GuideCard = {
  icon: ReactNode
  title: string
  description: string
}

type GuideStep = {
  /** CSS background-image (gradient) for the left illustration panel. */
  illustrationClass: string
  eyebrow: string
  titleLines: string[]
  description: string
  cards: GuideCard[]
}

const CARD_BADGE_SX = {
  fontFamily: "'Alimama ShuHeiTi', sans-serif",
  fontSize: '16px',
  fontWeight: 700,
  color: '#fff',
} as const

const CARD_ICON_SX = { width: '18px', height: '18px', color: '#fff' } as const

const STEPS: GuideStep[] = [
  {
    illustrationClass: 'linear-gradient(to bottom right, #cfe0ff, #e9eef6, #dbe7fb)',
    eyebrow: '欢迎使用 StaffDeck',
    titleLines: ['数字员工', '全流程构建与管理平台'],
    description:
      '像招聘、培养、管理真人员工一样，构建你的数字员工团队。把重复的事情交给数字员工，让自己专注更重要的工作。',
    cards: [
      {
        icon: <Box component={IdCard} sx={CARD_ICON_SX} />,
        title: '像管员工一样管AI',
        description: '每位数字员工都有档案、岗位与成长记录。',
      },
      {
        icon: <Box component={Workflow} sx={CARD_ICON_SX} />,
        title: '按流程执行任务',
        description: '每位数字员工都有档案、岗位与成长记录。',
      },
      {
        icon: <Box component={Brain} sx={CARD_ICON_SX} />,
        title: '理解业务而非检索',
        description: '每位数字员工都有档案、岗位与成长记录。',
      },
    ],
  },
  {
    illustrationClass: 'linear-gradient(to bottom right, #e3f1ff, #f9fcff, #d7e9ff)',
    eyebrow: '核心概念',
    titleLines: ['三步搭建你的数字员工'],
    description: '先给它配大脑，再给它配能力，最后上岗对话。',
    cards: [
      {
        icon: (
          <Box component="span" sx={CARD_BADGE_SX}>
            01
          </Box>
        ),
        title: '模型',
        description: '数字员工的大脑，接入 OpenAI 兼容模型即可。',
      },
      {
        icon: (
          <Box component="span" sx={CARD_BADGE_SX}>
            02
          </Box>
        ),
        title: '能力',
        description: '知识库、技能、SOP、工具，决定它懂什么、会做什么。',
      },
      {
        icon: (
          <Box component="span" sx={CARD_BADGE_SX}>
            03
          </Box>
        ),
        title: '上岗',
        description: '创建数字员工并绑定能力，去对话端与它协作。',
      },
    ],
  },
]

export type OnboardingGuideProps = {
  /** Override the storage key (useful for tests / multiple tenants). */
  storageKey?: string
}

export default function OnboardingGuide({ storageKey = ONBOARDING_SEEN_KEY }: OnboardingGuideProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const seen = window.localStorage.getItem(storageKey)
    if (!seen) {
      setStep(0)
      setOpen(true)
    }
  }, [storageKey])

  useEffect(() => {
    const reopen = () => {
      setStep(0)
      setOpen(true)
    }
    window.addEventListener(OPEN_ONBOARDING_EVENT, reopen)
    return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, reopen)
  }, [])

  function finish() {
    window.localStorage.setItem(storageKey, '1')
    setOpen(false)
    window.dispatchEvent(new Event(OPEN_QUICK_START_EVENT))
  }

  function goPrev() {
    setStep((prev) => Math.max(0, prev - 1))
  }

  function goNext() {
    if (step >= STEPS.length - 1) {
      finish()
    } else {
      setStep((prev) => Math.min(STEPS.length - 1, prev + 1))
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) finish()
    else setOpen(true)
  }

  const current = STEPS[step]
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        sx={{
          position: 'relative',
          display: 'grid',
          width: '904px',
          maxWidth: 'calc(100vw - 2rem)',
          gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
          gap: 0,
          overflow: 'hidden',
          borderRadius: '20px',
          border: 0,
          p: 0,
          boxShadow: 'none',
          '@media (min-width: 768px)': { gridTemplateColumns: '474px 430px' },
          '@media (min-width: 640px)': { maxWidth: '904px' },
        }}
      >
        <DialogTitle
          sx={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {current.titleLines.join('')}
        </DialogTitle>

        <Box
          aria-hidden="true"
          sx={{
            display: 'none',
            height: '560px',
            '@media (min-width: 768px)': { display: 'block' },
            backgroundImage: current.illustrationClass,
          }}
        />

        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            height: '560px',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundImage: 'linear-gradient(to bottom, #f9fcff, #e3f1ff)',
            px: '36px',
            pt: '10px',
            pb: '32px',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Box
              component="button"
              type="button"
              onClick={finish}
              aria-label="关闭引导"
              sx={{
                display: 'flex',
                width: '20px',
                height: '20px',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#757f9c',
                transition: 'background-color 0.15s, color 0.15s',
                '&:hover': { color: '#18181a' },
              }}
            >
              <Box component={XIcon} sx={{ width: '14px', height: '14px' }} />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Box
                component="span"
                sx={{
                  transform: 'skewX(-6deg)',
                  fontSize: '12px',
                  lineHeight: 'normal',
                  color: '#464c5e',
                }}
              >
                {current.eyebrow}
              </Box>
              <Box sx={{ transform: 'skewX(-6deg)' }}>
                {current.titleLines.map((line) => (
                  <Box
                    component="p"
                    key={line}
                    sx={{
                      backgroundImage: 'linear-gradient(to right, #105acf, #007bff)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      color: 'transparent',
                      fontSize: '32px',
                      lineHeight: '44px',
                      fontWeight: 600,
                    }}
                  >
                    {line}
                  </Box>
                ))}
              </Box>
              <Box
                component="p"
                sx={{ fontSize: '12px', lineHeight: '20px', color: '#757f9c' }}
              >
                {current.description}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {current.cards.map((card) => (
                <Box
                  key={card.title}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderRadius: '14px',
                    bgcolor: 'rgba(255,255,255,0.6)',
                    px: '12px',
                    py: '10px',
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      width: '32px',
                      height: '32px',
                      flexShrink: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '8px',
                      backgroundImage: 'linear-gradient(to bottom right, #89b6ff, #527aff)',
                    }}
                  >
                    {card.icon}
                  </Box>
                  <Box sx={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: '4px' }}>
                    <Box
                      component="p"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '14px',
                        lineHeight: 'normal',
                        color: '#464c5e',
                      }}
                    >
                      {card.title}
                    </Box>
                    <Box
                      component="p"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '12px',
                        lineHeight: 'normal',
                        color: '#757f9c',
                      }}
                    >
                      {card.description}
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#757f9c' }}>
              <Box
                component="button"
                type="button"
                onClick={goPrev}
                disabled={isFirst}
                aria-label="上一步"
                sx={{
                  display: 'flex',
                  width: '14px',
                  height: '14px',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.15s, color 0.15s',
                  '&:enabled:hover': { color: '#18181a' },
                  '&:disabled': { cursor: 'default', opacity: 0.4 },
                }}
              >
                <Box component={ChevronLeft} sx={{ width: '14px', height: '14px' }} />
              </Box>
              <Box component="span" sx={{ fontSize: '12px' }}>
                {step + 1}/{STEPS.length}
              </Box>
              <Box
                component="button"
                type="button"
                onClick={goNext}
                disabled={isLast}
                aria-label="下一步"
                sx={{
                  display: 'flex',
                  width: '14px',
                  height: '14px',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.15s, color 0.15s',
                  '&:enabled:hover': { color: '#18181a' },
                  '&:disabled': { cursor: 'default', opacity: 0.4 },
                }}
              >
                <Box component={ChevronRight} sx={{ width: '14px', height: '14px' }} />
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Box
                component="button"
                type="button"
                onClick={finish}
                sx={{
                  display: 'flex',
                  width: '80px',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '10px',
                  border: '0.5px solid',
                  borderColor: '#e3e7f1',
                  bgcolor: '#fff',
                  px: '20px',
                  py: '8px',
                  fontSize: '14px',
                  color: '#757f9c',
                  transition: 'background-color 0.15s, color 0.15s',
                  '&:hover': { bgcolor: '#f6f6f6', color: '#18181a' },
                }}
              >
                跳过
              </Box>
              <Box
                component="button"
                type="button"
                onClick={goNext}
                sx={{
                  ...staffTokens.primaryButton,
                  width: '134px',
                  px: '32px',
                  fontSize: '14px',
                  height: 'auto',
                  py: '8px',
                  lineHeight: 'normal',
                }}
              >
                {isLast ? '开始使用' : '下一步'}
              </Box>
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
