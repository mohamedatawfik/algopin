import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import {
  AlgorithmType,
  BASE_PIN_LENGTH,
  computeDynamicValue,
  decomposePreview,
  getCanonicalType,
  isValidReplacedIndex,
  placeholderDescriptionForType,
  placeholderForType,
  REPLACEABLE_INDICES,
} from '../lib/pinComposer'
import { AlgorithmComplexity } from '../lib/stageFlow'
import {
  configKeyForComplexity,
  useStudyStore,
} from '../store/studyStore'

const COMPLEXITY_LABELS: Record<AlgorithmComplexity, string> = {
  Low: 'Low complexity',
  Medium: 'Medium complexity',
  High: 'High complexity',
}

const COMPLEXITY_STAGE_INDEX: Record<AlgorithmComplexity, number> = {
  Low: 6,
  Medium: 9,
  High: 12,
}

const ORDINAL_LABELS = ['1st', '2nd', '3rd', '4th'] as const

/**
 * Title + descriptive blurb shown on the static "Assigned Rule" card.
 * The rule is no longer participant-selectable — it is fixed by the
 * complexity phase, so this mapping is the single source of truth for
 * what the UI introduces to the participant.
 */
const RULE_INFO_BY_COMPLEXITY: Record<
  AlgorithmComplexity,
  { title: string; description: string }
> = {
  Low: {
    title: 'Digit of the minute',
    description:
      'For this phase, exactly one digit of your base PIN is replaced by the units digit of the current minute shown on the lock screen. For example, if it is 14:27, the replacement digit is 7.',
  },
  Medium: {
    title: 'Unread messages digit',
    description:
      'For this phase, exactly one digit of your base PIN is replaced by the units digit of the unread messages count shown on the lock screen.',
  },
  High: {
    title: 'Cross-sum of the time',
    description:
      'For this phase, exactly one digit of your base PIN is replaced by the units digit of the cross-sum of the current time (HHMM). For example, at 12:24 the cross-sum is 1+2+2+4 = 9, so the replacement digit is 9.',
  },
}

export type AlgorithmSetupViewProps = {
  complexity: AlgorithmComplexity
}

export function AlgorithmSetupView({ complexity }: AlgorithmSetupViewProps) {
  const {
    basePin: storedBasePin,
    configurations,
    appendTelemetry,
    advanceStage,
    setConfiguration,
  } = useStudyStore()

  const basePin = storedBasePin ?? ''
  const configKey = configKeyForComplexity(complexity)
  const existingConfig = configurations[configKey]

  // The rule is strictly predefined by complexity. We no longer track a
  // selected algorithm in local state — the type is derived from the phase
  // and written straight into the global configuration.
  const algorithmType: AlgorithmType = useMemo(
    () => getCanonicalType(complexity),
    [complexity]
  )

  const ruleInfo = RULE_INFO_BY_COMPLEXITY[complexity]

  const [replacedIndex, setReplacedIndex] = useState<number | null>(
    isValidReplacedIndex(existingConfig?.replacedIndex)
      ? (existingConfig!.replacedIndex as number)
      : null
  )

  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    appendTelemetry('algorithm_setup_opened', { complexity, algorithmType })
  }, [appendTelemetry, complexity, algorithmType])

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const sampleUnreadCount = 4
  const dynamicValue = useMemo(
    () =>
      computeDynamicValue(algorithmType, {
        date: now,
        unreadCount: sampleUnreadCount,
      }),
    [algorithmType, now]
  )

  const ruleSegments = useMemo(
    () =>
      decomposePreview(
        basePin,
        placeholderForType(algorithmType),
        replacedIndex
      ),
    [basePin, algorithmType, replacedIndex]
  )
  const liveSegments = useMemo(
    () => decomposePreview(basePin, dynamicValue, replacedIndex),
    [basePin, dynamicValue, replacedIndex]
  )

  const handleReplacedIndexChange = (idx: number) => {
    if (!isValidReplacedIndex(idx)) return
    setReplacedIndex(idx)
    appendTelemetry('algorithm_setup_replaced_index_change', {
      complexity,
      replacedIndex: idx,
    })
  }

  const replacedIndexValid = isValidReplacedIndex(replacedIndex)

  // The button is gated solely on the participant having picked a digit
  // to replace; the rule itself is hardcoded to the phase.
  const canSubmit = replacedIndexValid

  const handleSubmit = () => {
    if (!canSubmit || replacedIndex === null) return
    setConfiguration(configKey, {
      algorithmType,
      replacedIndex,
    })
    appendTelemetry('algorithm_setup_submit', {
      complexity,
      algorithmType,
      replacedIndex,
    })
    advanceStage()
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 560, mx: 'auto', py: 2 }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          label={`Stage ${COMPLEXITY_STAGE_INDEX[complexity]} / 15`}
          size="small"
          variant="outlined"
        />
        <Chip
          label={COMPLEXITY_LABELS[complexity]}
          size="small"
          color="primary"
          variant="outlined"
        />
        <Chip
          label={`Base PIN: ${basePin || 'not set'}`}
          size="small"
          variant="outlined"
        />
      </Stack>

      <Typography variant="h5" component="h1">
        Configure your {COMPLEXITY_LABELS[complexity].toLowerCase()} rule
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Review the rule assigned to this phase, then choose exactly one
        digit of your base PIN to replace with it. The PIN length stays at{' '}
        {BASE_PIN_LENGTH} digits — nothing is appended or prepended.
      </Typography>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography
            variant="overline"
            color="text.secondary"
            display="block"
            sx={{ mb: 1 }}
          >
            Assigned Rule for this Phase
          </Typography>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 600, lineHeight: 1.3 }}
          >
            {ruleInfo.title}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1 }}
          >
            {ruleInfo.description}
          </Typography>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <FormControl
            component="fieldset"
            fullWidth
            disabled={basePin.length !== BASE_PIN_LENGTH}
          >
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1.25 }}
            >
              <FormLabel sx={{ fontWeight: 600 }}>
                Digit to replace
              </FormLabel>
              <Chip
                label={
                  replacedIndex === null
                    ? 'No digit selected'
                    : `${ORDINAL_LABELS[replacedIndex]} digit selected`
                }
                size="small"
                color={replacedIndex === null ? 'default' : 'primary'}
                variant="outlined"
              />
            </Stack>
            <RadioGroup
              value={replacedIndex === null ? '' : String(replacedIndex)}
              onChange={(_, v) => handleReplacedIndexChange(Number(v))}
            >
              {REPLACEABLE_INDICES.map((idx) => {
                const baseDigit = basePin[idx] ?? '–'
                return (
                  <FormControlLabel
                    key={idx}
                    value={String(idx)}
                    control={<Radio />}
                    label={
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Replace {ORDINAL_LABELS[idx]} Digit
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          (currently &lsquo;{baseDigit}&rsquo;)
                        </Typography>
                      </Stack>
                    }
                  />
                )
              })}
            </RadioGroup>
            <FormHelperText>
              Exactly one digit is replaced by{' '}
              {placeholderDescriptionForType(algorithmType)} when you unlock.
            </FormHelperText>
          </FormControl>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography
            variant="overline"
            color="text.secondary"
            display="block"
            sx={{ mb: 1 }}
          >
            Preview
          </Typography>

          <PreviewRow
            label="Rule"
            segments={ruleSegments}
            caption={
              replacedIndex === null
                ? 'Select a digit above to see how your base PIN changes.'
                : `where ${placeholderForType(algorithmType)} = ${placeholderDescriptionForType(algorithmType)}`
            }
          />
          <Box sx={{ height: 12 }} />
          <PreviewRow
            label="Right now"
            segments={liveSegments}
            caption={
              replacedIndex === null
                ? 'No digit replaced yet — the live PIN equals your base PIN.'
                : `uses the current value (${dynamicValue})${
                    algorithmType === 'UNREAD_MESSAGES'
                      ? ` — sample of ${sampleUnreadCount} unread messages`
                      : ''
                  }`
            }
          />
        </CardContent>
      </Card>

      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        Save and start the {COMPLEXITY_LABELS[complexity].toLowerCase()} test
      </Button>
    </Stack>
  )
}

function PreviewRow({
  label,
  segments,
  caption,
}: {
  label: string
  segments: { value: string; isDynamic: boolean }[]
  caption: string
}) {
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
      >
        {label}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
        {segments.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Set your base PIN first.
          </Typography>
        ) : (
          segments.map((seg, idx) => (
            <Box
              key={idx}
              sx={{
                minWidth: 36,
                height: 44,
                px: seg.value.length > 1 ? 1.25 : 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 1.5,
                fontVariantNumeric: 'tabular-nums',
                fontSize: 18,
                fontWeight: 600,
                bgcolor: seg.isDynamic
                  ? 'rgba(100,181,246,0.18)'
                  : 'action.hover',
                color: seg.isDynamic ? '#64b5f6' : 'text.primary',
                border: '1px solid',
                borderColor: seg.isDynamic
                  ? 'rgba(100,181,246,0.45)'
                  : 'divider',
              }}
            >
              {seg.value}
            </Box>
          ))
        )}
      </Stack>
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{ mt: 1 }}
      >
        {caption}
      </Typography>
    </Box>
  )
}
