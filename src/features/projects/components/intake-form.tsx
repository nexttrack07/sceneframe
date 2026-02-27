import { useState, useCallback } from 'react'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { IntakeAnswers } from '../project-actions'

const STEPS = [
  {
    key: 'purpose' as const,
    question: "What's this video for?",
    subtitle: 'Pick the one that best describes your goal.',
    type: 'single' as const,
    options: [
      'Brand / marketing',
      'Social media content',
      'Personal project',
      'Portfolio / demo reel',
      'Educational / tutorial',
      'Entertainment',
    ],
  },
  {
    key: 'length' as const,
    question: 'How long should the video be?',
    subtitle: 'This helps determine how many scenes to create.',
    type: 'single' as const,
    options: ['15 seconds', '30 seconds', '1 minute', '2-3 minutes', '5+ minutes'],
  },
  {
    key: 'style' as const,
    question: 'What visual style are you going for?',
    subtitle: 'Select all that apply.',
    type: 'multi' as const,
    options: [
      'Cinematic',
      'Documentary',
      'Animation / motion graphics',
      'Social / UGC-style',
      'Commercial / polished',
      'Music video',
      'Experimental / abstract',
    ],
  },
  {
    key: 'mood' as const,
    question: 'What mood or tone?',
    subtitle: 'Select all that apply.',
    type: 'multi' as const,
    options: [
      'Dramatic',
      'Uplifting',
      'Mysterious',
      'Humorous',
      'Calm / meditative',
      'Energetic',
      'Dark / moody',
      'Nostalgic',
      'Inspirational',
    ],
  },
  {
    key: 'setting' as const,
    question: 'Where does this take place?',
    subtitle: 'Select all that apply.',
    type: 'multi' as const,
    options: [
      'Urban / city',
      'Nature / outdoors',
      'Indoor / studio',
      'Abstract / surreal',
      'Multiple locations',
      'Not sure yet',
    ],
  },
  {
    key: 'concept' as const,
    question: 'Describe your video idea',
    subtitle: "The more detail the better — we'll refine it together.",
    type: 'text' as const,
    options: [],
  },
] as const

type StepKey = (typeof STEPS)[number]['key']

const TOTAL_STEPS = STEPS.length

interface IntakeFormProps {
  onComplete: (intake: IntakeAnswers) => Promise<void>
  error: string | null
  onDismissError: () => void
}

export function IntakeForm({ onComplete, error, onDismissError }: IntakeFormProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Partial<IntakeAnswers>>({
    purpose: '',
    length: '',
    style: [],
    mood: [],
    setting: [],
    concept: '',
  })
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const step = STEPS[currentStep]
  const progress = ((currentStep + 1) / TOTAL_STEPS) * 100

  const advanceStep = useCallback(() => {
    if (currentStep >= TOTAL_STEPS - 1) return
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentStep((s) => s + 1)
      setIsTransitioning(false)
    }, 200)
  }, [currentStep])

  function handleSingleSelect(value: string) {
    setAnswers((prev) => ({ ...prev, [step.key]: value }))
    setTimeout(advanceStep, 300)
  }

  function handleMultiToggle(value: string) {
    setAnswers((prev) => {
      const current = (prev[step.key as keyof IntakeAnswers] as string[] | undefined) ?? []
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      return { ...prev, [step.key]: next }
    })
  }

  function handleTextChange(value: string) {
    setAnswers((prev) => ({ ...prev, [step.key]: value }))
  }

  async function handleContinue() {
    if (isSubmitting) return
    if (currentStep < TOTAL_STEPS - 1) {
      advanceStep()
    } else {
      setIsSubmitting(true)
      try {
        await onComplete({
          purpose: answers.purpose ?? '',
          length: answers.length ?? '',
          style: answers.style ?? [],
          mood: answers.mood ?? [],
          setting: answers.setting ?? [],
          concept: answers.concept ?? '',
        })
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  function handleBack() {
    if (currentStep <= 0) return
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentStep((s) => s - 1)
      setIsTransitioning(false)
    }, 200)
  }

  const canContinue = isStepValid(step.key, answers)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Progress bar */}
      <div className="h-1 bg-muted shrink-0">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Question area */}
      <div className="flex-1 flex items-center justify-center px-6 py-8 overflow-y-auto">
        <div
          className={`w-full max-w-lg transition-all duration-200 ${
            isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          }`}
        >
          {error && (
            <div className="flex items-center gap-2 mb-4 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={onDismissError}
                className="text-destructive/50 hover:text-destructive"
              >
                ✕
              </button>
            </div>
          )}

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Step {currentStep + 1} of {TOTAL_STEPS}
          </p>
          <h2 className="text-2xl font-bold text-foreground mb-1">{step.question}</h2>
          <p className="text-sm text-muted-foreground mb-8">{step.subtitle}</p>

          {step.type === 'single' && (
            <SingleSelect
              options={step.options}
              selected={(answers[step.key] as string) ?? ''}
              onSelect={handleSingleSelect}
            />
          )}

          {step.type === 'multi' && (
            <MultiSelect
              options={step.options}
              selected={(answers[step.key as keyof IntakeAnswers] as string[] | undefined) ?? []}
              onToggle={handleMultiToggle}
            />
          )}

          {step.type === 'text' && (
            <Textarea
              value={(answers[step.key] as string) ?? ''}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="A cinematic tour of Tokyo's neon-lit streets at night..."
              rows={4}
              className="resize-none text-base"
              autoFocus
            />
          )}

          {/* Continue button for multi-select and text steps */}
          {step.type !== 'single' && (
            <Button
              onClick={handleContinue}
              disabled={!canContinue || isSubmitting}
              className="mt-6 w-full bg-primary hover:bg-primary/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                  Starting workshop…
                </>
              ) : currentStep === TOTAL_STEPS - 1 ? (
                'Start workshop'
              ) : (
                'Continue'
              )}
            </Button>
          )}

          {/* Back nav */}
          {currentStep > 0 && !isSubmitting && (
            <button
              type="button"
              onClick={handleBack}
              className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              <ArrowLeft size={14} />
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function isStepValid(key: StepKey, answers: Partial<IntakeAnswers>): boolean {
  const val = answers[key]
  if (Array.isArray(val)) return val.length > 0
  if (key === 'concept') return typeof val === 'string' && val.trim().length >= 10
  return typeof val === 'string' && val.length > 0
}

function SingleSelect({
  options,
  selected,
  onSelect,
}: {
  options: readonly string[]
  selected: string
  onSelect: (value: string) => void
}) {
  return (
    <div className="grid gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onSelect(opt)}
          className={`w-full text-left px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
            selected === opt
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-card text-foreground hover:border-primary/40'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function MultiSelect({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => {
        const isSelected = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`relative text-left px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
              isSelected
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-foreground hover:border-primary/40'
            }`}
          >
            {isSelected && (
              <Check
                size={14}
                className="absolute top-2 right-2 text-primary"
              />
            )}
            {opt}
          </button>
        )
      })}
    </div>
  )
}
