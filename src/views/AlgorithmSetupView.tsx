import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  SelectChangeEvent,
  Stack,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import {
  computeDynamicValue,
  decomposePreview,
  inferAlgorithmType,
  placeholderDescriptionForType,
  placeholderForType,
  PLACEMENT_OPTIONS,
} from '../lib/pinComposer'
import { AlgorithmComplexity } from '../lib/stageFlow'
import {
  configKeyForComplexity,
  Placement,
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
  const [placement, setPlacement] = useState<Placement>(
    existingConfig?.placement ?? 'APPEND'
  )
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
      decomposePreview(basePin, placeholderForType(algorithmType), placement),
    [basePin, algorithmType, placement]
  )
  const liveSegments = useMemo(
    () => decomposePreview(basePin, dynamicValue, placement),
    [basePin, dynamicValue, placement]
  )

  const handleAlgorithmChange = (id: string) => {
    setSelectedAlgorithmId(id)
    appendTelemetry('algorithm_setup_algo_change', {
      complexity,
      algorithmId: id,
    })
  }

  const handlePlacementChange = (e: SelectChangeEvent<Placement>) => {
    const v = e.target.value as Placement
    setPlacement(v)
    appendTelemetry('algorithm_setup_placement_change', {
      complexity,
      placement: v,
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

  const canSubmit = Boolean(selectedAlgorithmId) && !loading && !loadError

  const handleSubmit = () => {
    if (!canSubmit) return
    setConfiguration(configKey, {
      algorithmId: selectedAlgorithmId,
      placement,
    })
    appendTelemetry('algorithm_setup_submit', {
      complexity,
      algorithmId: selectedAlgorithmId,
      placement,
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
        Pick the dynamic element you want to use, then choose where it should
        sit relative to your base PIN. The preview shows what you will type to
        unlock.
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
          <FormControl fullWidth>
            <InputLabel id="placement-select-label">
              Where should the dynamic element go?
            </InputLabel>
            <Select<Placement>
              labelId="placement-select-label"
              label="Where should the dynamic element go?"
              value={placement}
              onChange={handlePlacementChange}
            >
              {PLACEMENT_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              The dynamic element ({placeholderDescriptionForType(algorithmType)})
              is highlighted in the preview below.
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
