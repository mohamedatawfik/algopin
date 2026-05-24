import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  CardContent,
  Chip,
  CircularProgress,
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
  BASE_PIN_LENGTH,
  computeDynamicValue,
  decomposePreview,
  defaultPositionsForComplexity,
  inferAlgorithmType,
  MAX_DYNAMIC_POSITIONS,
  MIN_DYNAMIC_POSITIONS,
  placeholderDescriptionForType,
  placeholderForType,
} from '../lib/pinComposer'
import { AlgorithmComplexity } from '../lib/stageFlow'
import {
  configKeyForComplexity,
  DynamicPositions,
  useStudyStore,
} from '../store/studyStore'
import type { PredefinedAlgorithm } from '../lib/api'

const COMPLEXITY_LABELS: Record<AlgorithmComplexity, string> = {
  Low: 'Low complexity',
  Medium: 'Medium complexity',
  High: 'High complexity',
}

const COMPLEXITY_STAGE_INDEX: Record<AlgorithmComplexity, number> = {
  Low: 5,
  Medium: 7,
  High: 9,
}

export type AlgorithmSetupViewProps = {
  complexity: AlgorithmComplexity
}

export function AlgorithmSetupView({ complexity }: AlgorithmSetupViewProps) {
  const {
    basePin: storedBasePin,
    configurations,
    algorithmsByComplexity,
    appendTelemetry,
    advanceStage,
    loadAlgorithms,
    setConfiguration,
  } = useStudyStore()

  const basePin = storedBasePin ?? ''
  const configKey = configKeyForComplexity(complexity)
  const existingConfig = configurations[configKey]

  const cached = algorithmsByComplexity[complexity] ?? []
  const [algorithms, setAlgorithms] = useState<PredefinedAlgorithm[]>(cached)
  const [loading, setLoading] = useState<boolean>(cached.length === 0)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedAlgorithmId, setSelectedAlgorithmId] = useState<string>(
    existingConfig?.algorithmId ?? cached[0]?.algorithmId ?? ''
  )

  const [positions, setPositions] = useState<DynamicPositions>(() => {
    const seed =
      existingConfig?.dynamicPositions ??
      defaultPositionsForComplexity(complexity)
    return [...seed].sort((a, b) => a - b).slice(0, MAX_DYNAMIC_POSITIONS)
  })

  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    appendTelemetry('algorithm_setup_opened', { complexity })
  }, [appendTelemetry, complexity])

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (cached.length > 0) {
        setAlgorithms(cached)
        setLoading(false)
        return
      }
      setLoading(true)
      setLoadError(null)
      try {
        const list = await loadAlgorithms(complexity)
        if (cancelled) return
        setAlgorithms(list)
        if (list.length > 0 && !selectedAlgorithmId) {
          setSelectedAlgorithmId(list[0].algorithmId)
        }
      } catch (err) {
        if (cancelled) return
        const message =
          err instanceof Error ? err.message : 'Failed to load algorithms'
        setLoadError(message)
        appendTelemetry('algorithm_setup_load_error', {
          complexity,
          error: message,
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // We intentionally only run this when complexity changes; cache + select state
    // handle subsequent updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complexity])

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const selectedAlgorithm = useMemo(
    () => algorithms.find((a) => a.algorithmId === selectedAlgorithmId),
    [algorithms, selectedAlgorithmId]
  )

  const algorithmType = useMemo(
    () => inferAlgorithmType(selectedAlgorithm, complexity),
    [selectedAlgorithm, complexity]
  )

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
      decomposePreview(basePin, placeholderForType(algorithmType), positions),
    [basePin, algorithmType, positions]
  )
  const liveSegments = useMemo(
    () => decomposePreview(basePin, dynamicValue, positions),
    [basePin, dynamicValue, positions]
  )

  const handleAlgorithmChange = (id: string) => {
    setSelectedAlgorithmId(id)
    appendTelemetry('algorithm_setup_algo_change', {
      complexity,
      algorithmId: id,
    })
  }

  const togglePosition = (idx: number) => {
    setPositions((prev) => {
      const isSelected = prev.includes(idx)
      let next: number[]
      if (isSelected) {
        if (prev.length <= MIN_DYNAMIC_POSITIONS) return prev
        next = prev.filter((p) => p !== idx)
      } else {
        if (prev.length >= MAX_DYNAMIC_POSITIONS) return prev
        next = [...prev, idx]
      }
      next.sort((a, b) => a - b)
      appendTelemetry('algorithm_setup_position_toggle', {
        complexity,
        positions: next,
      })
      return next
    })
  }

  const handleRetry = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const list = await loadAlgorithms(complexity)
      setAlgorithms(list)
      if (list.length > 0 && !selectedAlgorithmId) {
        setSelectedAlgorithmId(list[0].algorithmId)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load algorithms'
      setLoadError(message)
    } finally {
      setLoading(false)
    }
  }

  const positionsValid =
    positions.length >= MIN_DYNAMIC_POSITIONS &&
    positions.length <= MAX_DYNAMIC_POSITIONS

  const canSubmit =
    Boolean(selectedAlgorithmId) &&
    !loading &&
    !loadError &&
    positionsValid &&
    basePin.length === BASE_PIN_LENGTH

  const handleSubmit = () => {
    if (!canSubmit) return
    setConfiguration(configKey, {
      algorithmId: selectedAlgorithmId,
      dynamicPositions: positions,
    })
    appendTelemetry('algorithm_setup_submit', {
      complexity,
      algorithmId: selectedAlgorithmId,
      dynamicPositions: positions,
    })
    advanceStage()
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 560, mx: 'auto', py: 2 }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          label={`Stage ${COMPLEXITY_STAGE_INDEX[complexity]} / 11`}
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
        Pick the dynamic element you want to use, then tap the digits of
        your base PIN that should be replaced by it. The PIN length stays
        at {BASE_PIN_LENGTH} digits — nothing is appended or prepended.
      </Typography>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <FormControl component="fieldset" fullWidth>
            <FormLabel sx={{ fontWeight: 600, mb: 1 }}>
              Choose a rule
            </FormLabel>
            {loading && (
              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{ py: 2 }}
              >
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  Loading available rules…
                </Typography>
              </Stack>
            )}
            {loadError && !loading && (
              <Alert
                severity="error"
                sx={{ my: 1 }}
                action={
                  <Button color="inherit" size="small" onClick={handleRetry}>
                    Retry
                  </Button>
                }
              >
                {loadError}
              </Alert>
            )}
            {!loading && !loadError && algorithms.length === 0 && (
              <Alert severity="info" sx={{ my: 1 }}>
                No rules are configured for this complexity yet. Run{' '}
                <code>npm run seed</code> in the server to populate them.
              </Alert>
            )}
            {!loading && algorithms.length > 0 && (
              <RadioGroup
                value={selectedAlgorithmId}
                onChange={(_, v) => handleAlgorithmChange(v)}
              >
                {algorithms.map((alg) => (
                  <FormControlLabel
                    key={alg.algorithmId}
                    value={alg.algorithmId}
                    control={<Radio />}
                    sx={{
                      alignItems: 'flex-start',
                      mr: 0,
                      '.MuiFormControlLabel-label': { mt: 0.5 },
                    }}
                    label={
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, lineHeight: 1.3 }}
                        >
                          {algorithmShortLabel(alg.type)}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.25 }}
                        >
                          {alg.description}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </RadioGroup>
            )}
          </FormControl>
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
                Tap the digits that should be dynamic
              </FormLabel>
              <Chip
                label={`${positions.length} of ${BASE_PIN_LENGTH} dynamic`}
                size="small"
                color="primary"
                variant="outlined"
              />
            </Stack>
            <PositionPicker
              basePin={basePin}
              selected={positions}
              onToggle={togglePosition}
            />
            <FormHelperText>
              Pick {MIN_DYNAMIC_POSITIONS}–{MAX_DYNAMIC_POSITIONS} positions.
              Each selected digit is replaced by{' '}
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
            caption={`where ${placeholderForType(algorithmType)} = ${placeholderDescriptionForType(algorithmType)}`}
          />
          <Box sx={{ height: 12 }} />
          <PreviewRow
            label="Right now"
            segments={liveSegments}
            caption={`uses the current value (${dynamicValue})${
              algorithmType === 'UNREAD_MESSAGES'
                ? ` — sample of ${sampleUnreadCount} unread messages`
                : ''
            }`}
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

function algorithmShortLabel(
  type: PredefinedAlgorithm['type'] | undefined
): string {
  switch (type) {
    case 'MINUTE_DIGIT':
      return 'Digit of the minute'
    case 'UNREAD_MESSAGES':
      return 'Unread messages digit'
    case 'TIME_CROSS_SUM':
      return 'Cross-sum of the time'
    default:
      return 'Algorithm'
  }
}

function PositionPicker({
  basePin,
  selected,
  onToggle,
}: {
  basePin: string
  selected: number[]
  onToggle: (idx: number) => void
}) {
  const slots = Array.from({ length: BASE_PIN_LENGTH }, (_, i) =>
    basePin[i] ?? '–'
  )
  return (
    <Stack direction="row" spacing={1.25} sx={{ flexWrap: 'wrap' }}>
      {slots.map((digit, idx) => {
        const isSelected = selected.includes(idx)
        const atMax =
          !isSelected && selected.length >= MAX_DYNAMIC_POSITIONS
        const atMin =
          isSelected && selected.length <= MIN_DYNAMIC_POSITIONS
        const disabled = atMax || atMin
        return (
          <Stack key={idx} alignItems="center" spacing={0.5}>
            <ButtonBase
              onClick={() => onToggle(idx)}
              focusRipple
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`Position ${idx + 1}: ${
                isSelected ? 'dynamic' : 'static'
              }`}
              sx={{
                width: 56,
                height: 64,
                borderRadius: 2,
                border: '2px solid',
                borderColor: isSelected
                  ? 'rgba(100,181,246,0.85)'
                  : 'divider',
                bgcolor: isSelected
                  ? 'rgba(100,181,246,0.18)'
                  : 'action.hover',
                color: isSelected ? '#64b5f6' : 'text.primary',
                fontWeight: 600,
                fontSize: 24,
                fontVariantNumeric: 'tabular-nums',
                transition:
                  'background-color 120ms ease, border-color 120ms ease, transform 120ms ease',
                '&:hover': {
                  bgcolor: isSelected
                    ? 'rgba(100,181,246,0.26)'
                    : 'action.selected',
                },
                '&:active': { transform: 'scale(0.97)' },
                '&.Mui-disabled': { opacity: 0.55 },
              }}
            >
              {digit}
            </ButtonBase>
            <Typography
              variant="caption"
              color={isSelected ? 'primary.main' : 'text.secondary'}
              sx={{ fontWeight: isSelected ? 600 : 400 }}
            >
              #{idx + 1}
            </Typography>
          </Stack>
        )
      })}
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
