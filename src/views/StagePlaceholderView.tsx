import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import { useStudyStore } from '../store/studyStore'
import {
  complexityForSetupStage,
  conditionForStage,
  STAGE_ORDER,
  StudyStage,
} from '../lib/stageFlow'

const STAGE_LABELS: Record<StudyStage, string> = {
  ONBOARDING: 'Onboarding',
  STATIC_SETUP: 'Static PIN setup',
  BASELINE_TEST: 'Baseline test',
  ALGO_INTRO: 'Algorithmic PIN introduction',
  LOW_SETUP: 'Low complexity setup',
  LOW_TEST: 'Low complexity test',
  MED_SETUP: 'Medium complexity setup',
  MED_TEST: 'Medium complexity test',
  HIGH_SETUP: 'High complexity setup',
  HIGH_TEST: 'High complexity test',
  SURVEY: 'NASA-TLX survey',
}

const STAGE_DESCRIPTIONS: Partial<Record<StudyStage, string>> = {
  STATIC_SETUP:
    'Choose a 4-digit base PIN. This will be used as the static baseline and as the seed for the algorithmic conditions later.',
  ALGO_INTRO:
    'You will now learn about algorithmic PINs. Each upcoming condition will combine your base PIN with a small rule that depends on something visible on the lock screen.',
  LOW_SETUP:
    'Pick a low-complexity rule and tap which 1–3 digits of your base PIN should be replaced by it.',
  MED_SETUP:
    'Pick a medium-complexity rule and tap which 1–3 digits of your base PIN should be replaced by it.',
  HIGH_SETUP:
    'Pick a high-complexity rule and tap which 1–3 digits of your base PIN should be replaced by it.',
}

export type StagePlaceholderViewProps = {
  stage: StudyStage
}

export function StagePlaceholderView({ stage }: StagePlaceholderViewProps) {
  const advanceStage = useStudyStore((s) => s.advanceStage)
  const appendTelemetry = useStudyStore((s) => s.appendTelemetry)

  const idx = STAGE_ORDER.indexOf(stage)
  const isLast = idx === STAGE_ORDER.length - 1
  const condition = conditionForStage(stage)
  const complexity = complexityForSetupStage(stage)
  const label = STAGE_LABELS[stage]
  const description = STAGE_DESCRIPTIONS[stage]

  const handleContinue = () => {
    appendTelemetry('stage_placeholder_continue', { stage })
    advanceStage()
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 480, mx: 'auto', py: 2 }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          label={`Stage ${idx + 1} / ${STAGE_ORDER.length}`}
          size="small"
          variant="outlined"
        />
        {condition && (
          <Chip
            label={`Condition: ${condition}`}
            size="small"
            color="primary"
            variant="outlined"
          />
        )}
        {complexity && (
          <Chip
            label={`Complexity: ${complexity}`}
            size="small"
            color="secondary"
            variant="outlined"
          />
        )}
      </Stack>

      <Typography variant="h5" component="h1">
        {label}
      </Typography>

      {description && (
        <Typography variant="body1" color="text.secondary">
          {description}
        </Typography>
      )}

      <Box
        sx={{
          p: 2.5,
          borderRadius: 2,
          bgcolor: 'action.hover',
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="overline" color="text.secondary" display="block">
          Placeholder
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          The dedicated screen for this stage has not been built yet. Press
          continue to advance the experimental pipeline.
        </Typography>
      </Box>

      {!isLast && (
        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={handleContinue}
        >
          Continue
        </Button>
      )}
    </Stack>
  )
}
