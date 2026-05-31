import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Slider,
  Stack,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useStudyStore } from '../store/studyStore'

/**
 * The six standard NASA-TLX dimensions, in the canonical questionnaire order
 * with the descriptions taken verbatim from NASA Ames' NASA-TLX manual
 * (Hart & Staveland, 1988). Five dimensions run "Very Low" -> "Very High";
 * Performance is the one inverted scale and runs "Perfect" -> "Failure",
 * so a low numeric value means the worker felt they performed perfectly.
 */
const TLX_DIMENSIONS = [
  {
    key: 'mentalDemand',
    title: 'Mental Demand',
    description:
      'How much mental and perceptual activity was required (e.g., thinking, deciding, calculating, remembering, looking, searching, etc.)? Was the task easy or demanding, simple or complex, exacting or forgiving?',
    lowLabel: 'Very Low',
    highLabel: 'Very High',
  },
  {
    key: 'physicalDemand',
    title: 'Physical Demand',
    description:
      'How much physical activity was required (e.g., pushing, pulling, turning, controlling, activating, etc.)? Was the task easy or demanding, slow or brisk, slack or strenuous, restful or laborious?',
    lowLabel: 'Very Low',
    highLabel: 'Very High',
  },
  {
    key: 'temporalDemand',
    title: 'Temporal Demand',
    description:
      'How much time pressure did you feel due to the rate or pace at which the tasks or task elements occurred? Was the pace slow and leisurely or rapid and frantic?',
    lowLabel: 'Very Low',
    highLabel: 'Very High',
  },
  {
    key: 'performance',
    title: 'Performance',
    description:
      'How successful do you think you were in accomplishing the goals of the task set by the experimenter (or yourself)? How satisfied were you with your performance in accomplishing these goals?',
    lowLabel: 'Perfect',
    highLabel: 'Failure',
  },
  {
    key: 'effort',
    title: 'Effort',
    description:
      'How hard did you have to work (mentally and physically) to accomplish your level of performance?',
    lowLabel: 'Very Low',
    highLabel: 'Very High',
  },
  {
    key: 'frustration',
    title: 'Frustration',
    description:
      'How insecure, discouraged, irritated, stressed and annoyed versus secure, gratified, content, relaxed, and complacent did you feel during the task?',
    lowLabel: 'Very Low',
    highLabel: 'Very High',
  },
]

const SCALE_MIN = 1
const SCALE_MAX = 7
const SCALE_DEFAULT = 4

function buildInitialRatings() {
  const seed = {}
  for (const d of TLX_DIMENSIONS) {
    seed[d.key] = SCALE_DEFAULT
  }
  return seed
}

export function NasaTlxView() {
  const mTurkId = useStudyStore((s) => s.mTurkId)
  const tempTelemetry = useStudyStore((s) => s.tempTelemetry)
  const clearTempTelemetry = useStudyStore((s) => s.clearTempTelemetry)
  const submitTelemetry = useStudyStore((s) => s.submitTelemetry)
  const advanceStage = useStudyStore((s) => s.advanceStage)
  const appendTelemetry = useStudyStore((s) => s.appendTelemetry)
  const currentStage = useStudyStore((s) => s.currentStage)
  const currentCondition = useStudyStore((s) => s.currentCondition)

  const [ratings, setRatings] = useState(buildInitialRatings)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  const handleSliderChange = (key) => (_event, value) => {
    const numeric = Array.isArray(value) ? value[0] : value
    setRatings((prev) => ({ ...prev, [key]: numeric }))
  }

  const handleSubmit = async () => {
    if (submitting) return

    if (!tempTelemetry) {
      setErrorMessage(
        'No unlock telemetry was found for this condition. Please redo the unlock task.'
      )
      appendTelemetry('nasa_tlx_submit_blocked_no_temp_telemetry', {
        stage: currentStage,
        condition: currentCondition,
      })
      return
    }

    const nasaTlx = TLX_DIMENSIONS.reduce((acc, d) => {
      acc[d.key] = ratings[d.key]
      return acc
    }, {})

    setSubmitting(true)
    setErrorMessage(null)

    appendTelemetry('nasa_tlx_submit', {
      stage: currentStage,
      condition: currentCondition,
      nasaTlx,
    })

    // Build the exact wire payload the backend expects:
    // { mTurkId, condition, ...metrics, nasaTlx }. Identity comes from the
    // store, the six metrics come from the lock screen via tempTelemetry,
    // and the ratings come from the slider state.
    const merged = {
      mTurkId,
      condition: currentCondition,
      ...tempTelemetry,
      nasaTlx,
    }
    const res = await submitTelemetry(merged)

    if (res.ok) {
      appendTelemetry('telemetry_post_ok', { id: res.id })
      clearTempTelemetry()
      setSubmitting(false)
      advanceStage()
      return
    }

    appendTelemetry('telemetry_post_failed', { error: res.error })
    setErrorMessage(
      res.error ?? 'Could not save your ratings. Please try again.'
    )
    setSubmitting(false)
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 560, mx: 'auto', py: 2 }}>
      <Typography variant="h5" component="h1">
        Please rate the mental effort required for the PIN you JUST entered.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Move each slider to the position that best matches your experience.
        Each scale runs from 1 to 7.
      </Typography>

      <Stack spacing={2}>
        {TLX_DIMENSIONS.map((d) => (
          <Card key={d.key} variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
              <Stack
                direction="row"
                alignItems="baseline"
                justifyContent="space-between"
                sx={{ mb: 0.5 }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {d.title}
                </Typography>
                <Typography
                  variant="body2"
                  color="primary"
                  sx={{
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {ratings[d.key]} / {SCALE_MAX}
                </Typography>
              </Stack>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mb: 1.75,
                  pl: 1.25,
                  borderLeft: '2px solid',
                  borderColor: 'divider',
                  fontStyle: 'italic',
                  lineHeight: 1.5,
                }}
              >
                {d.description}
              </Typography>

              <Box sx={{ px: { xs: 0.5, sm: 1 } }}>
                <Slider
                  value={ratings[d.key]}
                  onChange={handleSliderChange(d.key)}
                  min={SCALE_MIN}
                  max={SCALE_MAX}
                  step={1}
                  valueLabelDisplay="auto"
                  aria-label={`${d.title} rating`}
                  disabled={submitting}
                />
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  sx={{ mt: 0.25 }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ textTransform: 'uppercase', letterSpacing: 0.6 }}
                  >
                    1 · {d.lowLabel}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ textTransform: 'uppercase', letterSpacing: 0.6 }}
                  >
                    7 · {d.highLabel}
                  </Typography>
                </Stack>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? 'Submitting…' : 'Submit Ratings'}
      </Button>
    </Stack>
  )
}

export default NasaTlxView
