import { Box, Button, Stack, Typography } from '@mui/material'
import { isTlxStage } from '../lib/stageFlow'
import {
  conditionInstructionLabel,
  useStudyStore,
} from '../store/studyStore'

export function SurveyView() {
  const {
    appendTelemetry,
    mTurkId,
    currentStage,
    currentCondition,
    clearTempTelemetry,
    advanceStage,
    resetStudySession,
  } = useStudyStore()

  const isPerConditionTlx = isTlxStage(currentStage)
  const heading = isPerConditionTlx
    ? `NASA-TLX · ${conditionInstructionLabel(currentCondition)}`
    : 'NASA-TLX'

  // Per-condition placeholder. The real per-condition flow lives in
  // `NasaTlxView` (sliders + POST). This handler just keeps the routing flow
  // moving while integration is in progress: it clears the temp metrics so
  // they don't leak into the next condition and advances to the next stage.
  const handlePerConditionDone = () => {
    appendTelemetry('tlx_placeholder_acknowledged', {
      mTurkId,
      stage: currentStage,
      condition: currentCondition,
    })
    clearTempTelemetry()
    advanceStage()
  }

  const handleFinalSurveyDone = () => {
    appendTelemetry('survey_placeholder_acknowledged', { mTurkId })
    resetStudySession()
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 480, mx: 'auto', py: 2 }}>
      <Typography variant="h5" component="h1">
        {heading}
      </Typography>
      <Typography variant="body1" color="text.secondary">
        {isPerConditionTlx
          ? `Rate the workload you just experienced for the ${conditionInstructionLabel(
              currentCondition
            )} unlock. The full NASA Task Load Index questionnaire (mental demand, physical demand, temporal demand, performance, effort, frustration) will appear here.`
          : 'Thank you for completing every unlock task. The final NASA Task Load Index questionnaire would appear here, followed by the MTurk validation link.'}
      </Typography>
      <Box
        sx={{
          p: 3,
          borderRadius: 2,
          bgcolor: 'action.hover',
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {isPerConditionTlx
            ? 'Placeholder: Per-condition NASA-TLX questionnaire. The real ratings UI is the dedicated NasaTlxView; once it is wired into the *_TLX routes, the slider submission will POST the merged telemetry.'
            : 'Placeholder: Final survey wrap-up. At the end of the study a Survey Link will be entered by participants in MTurk to validate that they went through the survey and finished it.'}
        </Typography>
      </Box>
      {isPerConditionTlx ? (
        <Button
          variant="contained"
          fullWidth
          onClick={handlePerConditionDone}
        >
          Continue
        </Button>
      ) : (
        <Button variant="outlined" fullWidth onClick={handleFinalSurveyDone}>
          Back to start (demo)
        </Button>
      )}
    </Stack>
  )
}
