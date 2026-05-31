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
import { AlgoIntroView } from './views/AlgoIntroView'
import { AlgorithmSetupView } from './views/AlgorithmSetupView'
import { LockScreenView } from './views/LockScreenView'
import { NasaTlxView } from './views/NasaTlxView'
import { OnboardingView } from './views/OnboardingView'
import { StaticSetupView } from './views/StaticSetupView'
import { SusSurveyView } from './views/SusSurveyView'

function isValidStage(v: string | null): v is StudyStage {
  if (!v) return false
  return Object.prototype.hasOwnProperty.call(STAGE_ROUTES, v)
}

function SearchParamsHydration() {
  const [params] = useSearchParams()
  const setStage = useStudyStore((s) => s.setStage)
  const setBasePin = useStudyStore((s) => s.setBasePin)

  useEffect(() => {
    const stage = params.get('stage')
    const pin = params.get('pin')
    if (isValidStage(stage)) setStage(stage)
    if (pin && /^\d{4,8}$/.test(pin)) setBasePin(pin)
  }, [params, setStage, setBasePin])

  return null
}

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
        <Route path={STAGE_ROUTES.ONBOARDING} element={<OnboardingView />} />
        <Route
          path={STAGE_ROUTES.STATIC_SETUP}
          element={<StaticSetupView />}
        />
        <Route path={STAGE_ROUTES.BASELINE_TEST} element={<LockScreenView />} />
        <Route path={STAGE_ROUTES.BASELINE_TLX} element={<NasaTlxView />} />
        <Route path={STAGE_ROUTES.ALGO_INTRO} element={<AlgoIntroView />} />
        <Route
          path={STAGE_ROUTES.LOW_SETUP}
          element={<AlgorithmSetupView complexity="Low" />}
        />
        <Route path={STAGE_ROUTES.LOW_TEST} element={<LockScreenView />} />
        <Route path={STAGE_ROUTES.LOW_TLX} element={<NasaTlxView />} />
        <Route
          path={STAGE_ROUTES.MED_SETUP}
          element={<AlgorithmSetupView complexity="Medium" />}
        />
        <Route path={STAGE_ROUTES.MED_TEST} element={<LockScreenView />} />
        <Route path={STAGE_ROUTES.MED_TLX} element={<NasaTlxView />} />
        <Route
          path={STAGE_ROUTES.HIGH_SETUP}
          element={<AlgorithmSetupView complexity="High" />}
        />
        <Route path={STAGE_ROUTES.HIGH_TEST} element={<LockScreenView />} />
        <Route path={STAGE_ROUTES.HIGH_TLX} element={<NasaTlxView />} />
        <Route path={STAGE_ROUTES.FINAL_SURVEY} element={<SusSurveyView />} />
        <Route path="*" element={<Navigate to={STAGE_ROUTES.ONBOARDING} replace />} />
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
