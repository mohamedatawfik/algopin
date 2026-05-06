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
    body: 'Append the units digit of the current minute. If the screen shows 14:27 and your PIN is 1234, the live PIN is 12347.',
  },
  {
    icon: <ChatBubbleRounded fontSize="small" />,
    title: 'Notification-based',
    body: 'Append the units digit of the unread message count. If the banner shows 4 unread messages and your PIN is 1234, the live PIN is 12344.',
  },
  {
    icon: <CalculateRounded fontSize="small" />,
    title: 'Cross-sum',
    body: 'Insert the sum of every digit of the time. At 12:24, 1+2+2+4 = 9. With base 1234 and the rule "after the first digit", the live PIN is 19234.',
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
        <Chip label="Stage 4 / 11" size="small" variant="outlined" />
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
        For the next three unlocks your passcode is no longer static. The PIN
        you type combines two parts: the 4-digit base PIN you just chose, and a
        small dynamic element you can read directly off the lock screen.
      </Typography>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
            How a live PIN is built
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            On each upcoming setup screen you will pick a rule (the dynamic
            element) and a position (where the dynamic element sits relative to
            your base PIN). Together they define the live PIN you must type to
            unlock.
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
