import { CssBaseline, ThemeProvider } from '@mui/material'
import { useEffect } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { STAGE_ROUTES, StudyStage } from './lib/stageFlow'
import { useStudyStore } from './store/studyStore'
import { studyTheme } from './theme'
import { CompletionView } from './views/CompletionView'
import { LevelTransitionView } from './views/LevelTransitionView'
import { LockScreenView } from './views/LockScreenView'
import { Phase2WelcomeView } from './views/Phase2WelcomeView'

function isValidStage(v: string | null): v is StudyStage {
  if (!v) return false
  return Object.prototype.hasOwnProperty.call(STAGE_ROUTES, v)
}

/**
 * Pilot-testing escape hatch: `?stage=MED_TEST&pin=1234` drops straight
 * into a given stage. Participants arrive without query params and always
 * start at PHASE2_WELCOME.
 */
function SearchParamsHydration() {
  const [params] = useSearchParams()
  const setStage = useStudyStore((s) => s.setStage)
  const setBasePin = useStudyStore((s) => s.setBasePin)

  useEffect(() => {
    const stage = params.get('stage')
    const pin = params.get('pin')
    if (isValidStage(stage)) setStage(stage)
    if (pin && /^\d{4}$/.test(pin)) setBasePin(pin)
  }, [params, setStage, setBasePin])

  return null
}

/**
 * The flow is strictly linear and forward-only
 * (PHASE2_WELCOME -> TRANSITION_LOW -> LOW_TEST -> TRANSITION_MED ->
 * MED_TEST -> TRANSITION_HIGH -> HIGH_TEST -> COMPLETION), so the
 * store's stage is the single source of truth: any URL that drifts
 * away from it — a manual edit, a back button — is rewritten in place.
 */
function StageNavigator() {
  const stage = useStudyStore((s) => s.currentStage)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const target = STAGE_ROUTES[stage]
    if (location.pathname !== target) {
      navigate(target, { replace: true })
    }
  }, [stage, navigate, location.pathname])

  return null
}

function AppRoutes() {
  return (
    <>
      <SearchParamsHydration />
      <StageNavigator />
      <Routes>
        <Route
          path={STAGE_ROUTES.PHASE2_WELCOME}
          element={<Phase2WelcomeView />}
        />
        <Route
          path={STAGE_ROUTES.TRANSITION_LOW}
          element={<LevelTransitionView key="TRANSITION_LOW" />}
        />
        {/*
          The three tests render the same component at the same position in
          the tree, so without distinct keys React would reuse one instance
          and carry entered digits, failure counts and the unlock timer from
          one test into the next. Transition screens sit in front of each
          test and only name the upcoming complexity.
        */}
        <Route
          path={STAGE_ROUTES.LOW_TEST}
          element={<LockScreenView key="LOW_TEST" />}
        />
        <Route
          path={STAGE_ROUTES.TRANSITION_MED}
          element={<LevelTransitionView key="TRANSITION_MED" />}
        />
        <Route
          path={STAGE_ROUTES.MED_TEST}
          element={<LockScreenView key="MED_TEST" />}
        />
        <Route
          path={STAGE_ROUTES.TRANSITION_HIGH}
          element={<LevelTransitionView key="TRANSITION_HIGH" />}
        />
        <Route
          path={STAGE_ROUTES.HIGH_TEST}
          element={<LockScreenView key="HIGH_TEST" />}
        />
        <Route path={STAGE_ROUTES.COMPLETION} element={<CompletionView />} />
        <Route
          path="*"
          element={<Navigate to={STAGE_ROUTES.PHASE2_WELCOME} replace />}
        />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider theme={studyTheme}>
      <CssBaseline />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  )
}
