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
 * Standard 10-item System Usability Scale (Brooke, 1996), reworded so each
 * statement refers to "this passcode method" — the specific complexity
 * condition the participant has just tested — instead of a generic system.
 * Items 1, 3, 5, 7, 9 are positively worded; items 2, 4, 6, 8, 10 are
 * negatively worded. Raw 1..5 answers are stored verbatim; the analyst
 * inverts and rescales to the canonical 0..100 SUS score at read time.
 */
const SUS_ITEMS = [
  'I think that I would like to use this passcode method frequently.',
  'I found this passcode method unnecessarily complex.',
  'I thought this passcode method was easy to use.',
  'I think that I would need the support of a technical person to be able to use this passcode method.',
  'I found the various steps for using this passcode method were well integrated.',
  'I thought there was too much inconsistency in this passcode method.',
  'I would imagine that most people would learn to use this passcode method very quickly.',
  'I found this passcode method very cumbersome to use.',
  'I felt very confident using this passcode method.',
  'I needed to learn a lot of things before I could get going with this passcode method.',
]

const SCALE_MIN = 1
const SCALE_MAX = 5
const SCALE_VALUES = Array.from(
  { length: SCALE_MAX - SCALE_MIN + 1 },
  (_, i) => SCALE_MIN + i
)

const ITEM_COUNT = SUS_ITEMS.length

function buildEmptyAnswers() {
  return Array.from({ length: ITEM_COUNT }, () => null)
}

export function SusSurveyView() {
  const mTurkId = useStudyStore((s) => s.mTurkId)
  const currentStage = useStudyStore((s) => s.currentStage)
  const currentCondition = useStudyStore((s) => s.currentCondition)
  const tempTelemetry = useStudyStore((s) => s.tempTelemetry)
  const setTempTelemetry = useStudyStore((s) => s.setTempTelemetry)
  const clearTempTelemetry = useStudyStore((s) => s.clearTempTelemetry)
  const submitTelemetry = useStudyStore((s) => s.submitTelemetry)
  const advanceStage = useStudyStore((s) => s.advanceStage)
  const appendTelemetry = useStudyStore((s) => s.appendTelemetry)
  const demographics = useStudyStore((s) => s.demographics)

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

  const handleSubmit = async () => {
    if (submitting) return
    if (!allAnswered) {
      setErrorMessage(
        `Please answer all ${ITEM_COUNT} items before submitting.`
      )
      return
    }
    if (!mTurkId) {
      setErrorMessage(
        'Your MTurk Worker ID is missing; please reload the study from the original link.'
      )
      return
    }

    // Ship the SUS answers to the store in the canonical named-field
    // shape the backend schema expects (`sus.item1..item10`). Doing the
    // array -> object mapping here means the wire payload below can
    // spread `tempTelemetry` verbatim.
    const sus = answers.reduce((acc, value, idx) => {
      acc[`item${idx + 1}`] = Number(value)
      return acc
    }, {})

    setSubmitting(true)
    setErrorMessage(null)

    // 1) Append the SUS responses to the running per-condition
    //    tempTelemetry slot. This keeps the store in sync with what we're
    //    about to POST — and, if the POST fails, gives us the SUS answers
    //    back on retry without asking the participant to re-answer.
    const nextTemp = { ...(tempTelemetry ?? {}), sus }
    setTempTelemetry(nextTemp)

    appendTelemetry('sus_submit', {
      stage: currentStage,
      condition: currentCondition,
      sus,
    })

    // 2) Build the wire payload and POST it. Identity fields (`mTurkId`,
    //    `condition`) come from the store; every other field —
    //    lock-screen metrics, `tam`, `sus` — is whatever has accumulated
    //    in `tempTelemetry` up to this point. On every SUS POST we also
    //    include the participant-level `demographics` block collected in
    //    the DEMOGRAPHICS phase so per-condition analyses can join on it
    //    without a second lookup.
    const submission = {
      mTurkId,
      condition: currentCondition,
      ...nextTemp,
      demographics,
    }
    const res = await submitTelemetry(submission)

    if (!res.ok) {
      appendTelemetry('telemetry_post_failed', {
        stage: currentStage,
        condition: currentCondition,
        error: res.error,
      })
      setErrorMessage(
        res.error ?? 'Could not save your responses. Please try again.'
      )
      setSubmitting(false)
      return
    }

    // 3) Only clear the buffer after the write succeeds, then advance.
    appendTelemetry('telemetry_post_ok', {
      stage: currentStage,
      condition: currentCondition,
      id: res.id,
    })
    clearTempTelemetry()

    // 4) Hand control back to stageFlow. When STAGE_ORDER contains the
    //    new `*_SUS` stages followed by the next `*_SETUP` (or the
    //    terminal `COMPLETION` stage after HIGH_SUS), `advanceStage()`
    //    will land the participant exactly where the study protocol
    //    prescribes without this component having to know the mapping.
    advanceStage()
    setSubmitting(false)
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 720, mx: 'auto', py: 2 }}>
      <Stack spacing={1}>
        <Typography variant="h5" component="h1">
          System Usability Scale: Please rate your experience with this
          passcode method.
        </Typography>
        <Typography variant="body1" color="text.secondary">
          For each statement below, select the response that best describes
          your reaction to the passcode method you just used. There are no
          right or wrong answers — please rate every item.
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
        {SUS_ITEMS.map((statement, idx) => (
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
                  name={`sus-item-${idx + 1}`}
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
                        <Stack alignItems="center" sx={{ minWidth: 72 }}>
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
                        flex: '1 1 72px',
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
                      5 · Strongly Agree
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
          ? 'Submitting…'
          : allAnswered
            ? 'Submit Stage'
            : `Answer all ${ITEM_COUNT} items to continue`}
      </Button>
    </Stack>
  )
}

export default SusSurveyView
