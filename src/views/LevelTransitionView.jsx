import { Button, Stack, Typography } from '@mui/material'
import { useEffect } from 'react'
import { complexityTaskTitle } from '../lib/stageFlow'
import { useStudyStore } from '../store/studyStore'

/**
 * Brief bridge before each Phase 2 lock-screen test. Announces the
 * upcoming complexity by name only — never the mathematical rule —
 * then waits for the participant to start the task.
 */
export function LevelTransitionView() {
  const currentStage = useStudyStore((s) => s.currentStage)
  const advanceStage = useStudyStore((s) => s.advanceStage)

  const title = complexityTaskTitle(currentStage) ?? 'Task'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [currentStage])

  const handleStart = () => {
    window.scrollTo(0, 0)
    advanceStage()
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 440, mx: 'auto', py: 4 }}>
      <Typography variant="h5" component="h1">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Get ready to apply this rule to your Base PIN.
      </Typography>
      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleStart}
      >
        Ready - Start Task
      </Button>
    </Stack>
  )
}

export default LevelTransitionView
