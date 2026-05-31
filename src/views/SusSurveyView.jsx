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
import { useMemo, useState } from 'react'
import { useStudyStore } from '../store/studyStore'

/**
 * Canonical 10-item System Usability Scale (Brooke, 1996), in the original
 * English wording. Items 1, 3, 5, 7, 9 are positively worded; items
 * 2, 4, 6, 8, 10 are negatively worded. Storage is the raw 1..5 answer per
 * item — the inversion / rescale to the 0..100 SUS score is the analyst's
 * job at read time so the original responses are preserved.
 */
const SUS_ITEMS = [
  'I think that I would like to use this system frequently.',
  'I found the system unnecessarily complex.',
  'I thought the system was easy to use.',
  'I think that I would need the support of a technical person to be able to use this system.',
  'I found the various functions in this system were well integrated.',
  'I thought there was too much inconsistency in this system.',
  'I would imagine that most people would learn to use this system very quickly.',
  'I found the system very cumbersome to use.',
  'I felt very confident using the system.',
  'I needed to learn a lot of things before I could get going with this system.',
]

const LIKERT_OPTIONS = [
  { value: 1, label: 'Strongly Disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neither agree nor disagree' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly Agree' },
]

const ITEM_COUNT = SUS_ITEMS.length

function buildEmptyAnswers() {
  return Array.from({ length: ITEM_COUNT }, () => null)
}

export function SusSurveyView() {
  const mTurkId = useStudyStore((s) => s.mTurkId)
  const finalizeParticipant = useStudyStore((s) => s.finalizeParticipant)
  const appendTelemetry = useStudyStore((s) => s.appendTelemetry)
  const phase1FinalizedAt = useStudyStore((s) => s.phase1FinalizedAt)

  const [answers, setAnswers] = useState(buildEmptyAnswers)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [completedAt, setCompletedAt] = useState(phase1FinalizedAt)

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

    const finalAnswers = answers.map((v) => Number(v))

    setSubmitting(true)
    setErrorMessage(null)
    appendTelemetry('sus_submit', { susAnswers: finalAnswers, phase: 'day1' })

    const res = await finalizeParticipant(finalAnswers, { phase: 'day1' })

    if (res.ok) {
      appendTelemetry('participant_finalized', {
        phase: 'day1',
        completedAt: res.completedAt,
      })
      setCompletedAt(res.completedAt ?? new Date().toISOString())
      setSubmitting(false)
      return
    }

    appendTelemetry('participant_finalize_failed', { error: res.error })
    setErrorMessage(
      res.error ?? 'Could not finalize your session. Please try again.'
    )
    setSubmitting(false)
  }

  if (completedAt) {
    return (
      <Stack spacing={3} sx={{ maxWidth: 560, mx: 'auto', py: 2 }}>
        <Typography variant="h5" component="h1">
          Phase 1 complete
        </Typography>
        <Alert severity="success">
          Thank you. Your Day 1 responses have been recorded.
        </Alert>
        <Typography variant="body2" color="text.secondary">
          You can now close this tab. We will reach out via MTurk for the
          Day 7 follow-up.
        </Typography>
      </Stack>
    )
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 720, mx: 'auto', py: 2 }}>
      <Stack spacing={1}>
        <Typography variant="h5" component="h1">
          System Usability Scale
        </Typography>
        <Typography variant="body1" color="text.secondary">
          For each statement below, please select the response that best
          describes your reaction to the PIN unlocking system you just
          experienced. There are no right or wrong answers — please rate
          every item.
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
                  {LIKERT_OPTIONS.map((opt) => (
                    <FormControlLabel
                      key={opt.value}
                      value={opt.value}
                      labelPlacement="bottom"
                      disabled={submitting}
                      control={<Radio />}
                      label={
                        <Stack alignItems="center" sx={{ minWidth: 88 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {opt.value}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              textAlign: 'center',
                              lineHeight: 1.2,
                            }}
                          >
                            {opt.label}
                          </Typography>
                        </Stack>
                      }
                      sx={{
                        m: 0,
                        flex: '1 1 88px',
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
            ? 'Submit and finish Day 1'
            : `Answer all ${ITEM_COUNT} items to continue`}
      </Button>
    </Stack>
  )
}

export default SusSurveyView
