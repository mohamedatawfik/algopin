import {
  AccessTimeRounded,
  BatteryChargingFullRounded,
  CalculateRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material'
import { useEffect } from 'react'
import { useStudyStore } from '../store/studyStore'

const EXAMPLES: {
  icon: JSX.Element
  title: string
  description: string
  example: string
}[] = [
  {
    icon: <AccessTimeRounded fontSize="small" />,
    title: 'Low Complexity',
    description:
      'The last digit of the current minute replaces the 4th digit of your PIN.',
    example:
      'If the time is 14:27, the calculated number is 7. Base PIN 1234 becomes 1237.',
  },
  {
    icon: <BatteryChargingFullRounded fontSize="small" />,
    title: 'Medium Complexity',
    description:
      'The last digit of the minute is added to the last digit of the battery percentage.',
    example:
      'If the time is 14:27 and battery is 82%, the math is 7 + 2 = 9. Base PIN 1234 becomes 1239.',
  },
  {
    icon: <CalculateRounded fontSize="small" />,
    title: 'High Complexity',
    description:
      'The last digit of the minute is added to (the last digit of the battery multiplied by 3).',
    example:
      'If the time is 14:27 and battery is 82%, the math is 7 + (2 × 3) = 13. Using only the last digit (3), base PIN 1234 becomes 1233.',
  },
]

export function AlgoIntroView() {
  const { advanceStage, appendTelemetry } = useStudyStore()

  useEffect(() => {
    appendTelemetry('algo_intro_opened')
  }, [appendTelemetry])

  const handleContinue = () => {
    appendTelemetry('algo_intro_acknowledged')
    advanceStage()
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 560, mx: 'auto', py: 2 }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label="Stage 5 / 15" size="small" variant="outlined" />
        <Chip
          label="Mental break"
          size="small"
          color="secondary"
          variant="outlined"
        />
      </Stack>

      <Typography variant="h5" component="h1">
        Algorithmic passcodes
      </Typography>
      <Typography variant="body1" color="text.secondary">
        For the next three unlocks your passcode is no longer fully static.
        Your PIN stays 4 digits long, but the 4th (last) digit is always
        replaced by a small dynamic element you can read directly off the
        lock screen.
      </Typography>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
            How a live PIN is built
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            For all upcoming tasks, the 4th (last) digit of your base PIN
            will be replaced by a dynamic number calculated from the lock
            screen environment. The total PIN length stays exactly at 4
            digits. If a calculation results in a double-digit number, you
            will only use the last digit of the sum.
          </Typography>

          <Stack spacing={2}>
            {EXAMPLES.map((ex) => (
              <Stack
                key={ex.title}
                direction="row"
                spacing={1.5}
                alignItems="flex-start"
              >
                <Box
                  sx={{
                    flexShrink: 0,
                    mt: 0.25,
                    width: 32,
                    height: 32,
                    borderRadius: 2,
                    bgcolor: 'rgba(100,181,246,0.16)',
                    color: '#64b5f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {ex.icon}
                </Box>
                <Box>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, lineHeight: 1.3 }}
                  >
                    {ex.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}
                  >
                    <Box component="span" sx={{ fontWeight: 600 }}>
                      Description:
                    </Box>{' '}
                    {ex.description}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}
                  >
                    <Box component="span" sx={{ fontWeight: 600 }}>
                      Example:
                    </Box>{' '}
                    {ex.example}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          bgcolor: 'action.hover',
          borderColor: 'divider',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography
            variant="overline"
            color="text.secondary"
            display="block"
            sx={{ mb: 1 }}
          >
            What happens next
          </Typography>
          <Typography variant="body2" color="text.secondary">
            You will experience three conditions in order — Low, Medium,
            then High complexity. For each condition, the rule will be
            shown to you, and you will unlock the simulated phone once
            using that rule. Take a breath before continuing; the upcoming
            tasks measure how naturally you adapt to a passcode that
            changes with context.
          </Typography>
        </CardContent>
      </Card>

      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleContinue}
      >
        I understand — start the algorithmic conditions
      </Button>
    </Stack>
  )
}
