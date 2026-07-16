import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { useStudyStore } from '../store/studyStore'

/**
 * Five Technology-Acceptance-Model style items rated after each specific
 * complexity rule the participant has just tested. Items 1–2 probe
 * perceived ease of use, items 3–5 probe perceived usefulness / intent to
 * use. The raw 1..7 answer per item is stored verbatim so the analyst can
 * decide how to combine them.
 */
const TAM_ITEMS = [
  'Calculating and entering the passcode using this specific rule was easy for me.',
  'The mental math required for this specific rule was clear and understandable.',
  'Using this level of mathematical complexity would effectively protect my smartphone from onlookers.',
  'I would be willing to use this specific calculation rule on my personal smartphone every day.',
  'I could calculate and enter this passcode quickly enough for real-world daily use.',
]

const SCALE_MIN = 1
const SCALE_MAX = 7
const SCALE_VALUES = Array.from(
  { length: SCALE_MAX - SCALE_MIN + 1 },
  (_, i) => SCALE_MIN + i
)

const ITEM_COUNT = TAM_ITEMS.length

function buildEmptyAnswers() {
  return Array.from({ length: ITEM_COUNT }, () => null)
}

export function TamSurveyView() {
  const tempTelemetry = useStudyStore((s) => s.tempTelemetry)
  const setTempTelemetry = useStudyStore((s) => s.setTempTelemetry)
  const advanceStage = useStudyStore((s) => s.advanceStage)
  const appendTelemetry = useStudyStore((s) => s.appendTelemetry)
  const currentStage = useStudyStore((s) => s.currentStage)
  const currentCondition = useStudyStore((s) => s.currentCondition)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const [answers, setAnswers] = useState(buildEmptyAnswers)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  const answeredCount = useMemo(
    () => answers.filter((a) => a !== null).length,
    [answers]
  )
  const allAnswered = answeredCount === ITEM_COUNT

  const handleAnswer = (idx) => (event) => {
    const next = Number.parseInt(event.target.value, 10)
    setAnswers((prev) => {
      const copy = prev.slice()
      copy[idx] = Number.isFinite(next) ? next : null
      return copy
    })
    if (errorMessage) setErrorMessage(null)
  }

  const handleSubmit = () => {
    if (submitting) return
    if (!allAnswered) {
      setErrorMessage(
        `Please answer all ${ITEM_COUNT} items before continuing.`
      )
      return
    }

    // Ship the TAM answers to the store in the canonical named-field
    // shape the backend schema expects (`tam.item1..item5`). Doing the
    // array -> object mapping once here means the SUS view can send
    // `tempTelemetry` verbatim without any downstream reshaping.
    const tam = answers.reduce((acc, value, idx) => {
      acc[`item${idx + 1}`] = Number(value)
      return acc
    }, {})

    setSubmitting(true)
    setErrorMessage(null)

    // Merge the TAM subdoc into the running `tempTelemetry` slot so the
    // matching `*_SUS` view can POST everything (lock-screen metrics +
    // TAM + SUS) as a single wire payload. Spreading a null tempTelemetry
    // is safe — it produces `{}`.
    setTempTelemetry({ ...(tempTelemetry ?? {}), tam })

    appendTelemetry('tam_submit', {
      stage: currentStage,
      condition: currentCondition,
      tam,
    })

    advanceStage()
    setSubmitting(false)
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 720, mx: 'auto', py: 2 }}>
      <Stack spacing={1}>
        <Typography variant="h5" component="h1">
          Please evaluate the specific rule you just tested.
        </Typography>
        <Typography variant="body1" color="text.secondary">
          For each statement below, choose the point on the scale that best
          matches your experience with the calculation rule you just used.
          There are no right or wrong answers — please rate every item.
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {answeredCount} of {ITEM_COUNT} answered
        </Typography>
      </Stack>

      <Stack spacing={2}>
        {TAM_ITEMS.map((statement, idx) => (
          <Card key={idx} variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
              <FormControl component="fieldset" fullWidth>
                <FormLabel
                  component="legend"
                  sx={{
                    fontWeight: 600,
                    color: 'text.primary',
                    mb: 1.25,
                    '&.Mui-focused': { color: 'text.primary' },
                  }}
                >
                  {idx + 1}. {statement}
                </FormLabel>
                <RadioGroup
                  row
                  name={`tam-item-${idx + 1}`}
                  value={answers[idx] ?? ''}
                  onChange={handleAnswer(idx)}
                  sx={{
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    rowGap: 1,
                  }}
                >
                  {SCALE_VALUES.map((value) => (
                    <FormControlLabel
                      key={value}
                      value={value}
                      labelPlacement="bottom"
                      disabled={submitting}
                      control={<Radio />}
                      label={
                        <Stack alignItems="center" sx={{ minWidth: 56 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {value}
                          </Typography>
                        </Stack>
                      }
                      sx={{
                        m: 0,
                        flex: '1 1 56px',
                        alignItems: 'center',
                      }}
                    />
                  ))}
                </RadioGroup>
                <Box sx={{ mt: 1 }}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    sx={{ px: 0.5 }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ textTransform: 'uppercase', letterSpacing: 0.6 }}
                    >
                      1 · Strongly Disagree
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ textTransform: 'uppercase', letterSpacing: 0.6 }}
                    >
                      7 · Strongly Agree
                    </Typography>
                  </Stack>
                </Box>
              </FormControl>
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
        disabled={submitting || !allAnswered}
      >
        {submitting
          ? 'Saving…'
          : allAnswered
            ? 'Next'
            : `Answer all ${ITEM_COUNT} items to continue`}
      </Button>
    </Stack>
  )
}

export default TamSurveyView
