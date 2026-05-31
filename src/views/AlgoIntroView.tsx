import {
  AccessTimeRounded,
  CalculateRounded,
  ChatBubbleRounded,
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
  body: string
}[] = [
  {
    icon: <AccessTimeRounded fontSize="small" />,
    title: 'Time-based',
    body: 'The units digit of the current minute replaces one digit of your PIN. If the screen shows 14:27, base PIN 1234 with the 4th digit replaced becomes 1237.',
  },
  {
    icon: <ChatBubbleRounded fontSize="small" />,
    title: 'Notification-based',
    body: 'The units digit of the unread message count replaces one digit. With 4 unread, base PIN 1234 with the 3rd digit replaced becomes 1244.',
  },
  {
    icon: <CalculateRounded fontSize="small" />,
    title: 'Cross-sum',
    body: 'The units digit of the cross-sum of the time replaces one digit. At 12:24, 1+2+2+4 = 9, so base PIN 1234 with the 2nd digit replaced becomes 1934.',
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
        Your PIN stays 4 digits long, but exactly one of those digits is
        replaced by a small dynamic element you can read directly off the
        lock screen.
      </Typography>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
            How a live PIN is built
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            On each upcoming setup screen you will pick a rule (the dynamic
            element) and choose which one of your 4 base-PIN digits the
            rule should replace. The total PIN length stays at 4 digits.
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
                    sx={{ mt: 0.25 }}
                  >
                    {ex.body}
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
            You will configure three conditions in order — Low, Medium, then
            High complexity. After each setup you will unlock once with that
            live PIN. Take a breath before continuing; the upcoming tasks
            measure how naturally you adapt to a passcode that changes with
            context.
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
