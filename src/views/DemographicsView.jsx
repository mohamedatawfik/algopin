import {
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  FormControlLabel,
  FormLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { useStudyStore } from '../store/studyStore'

/**
 * DEMOGRAPHICS phase, positioned between ONBOARDING and STATIC_SETUP.
 * Collects a birth date (Month select + Day select + Year textfield),
 * gender, country of residence, highest completed education,
 * self-reported passcode-change frequency, and a 4-item 1..6 Likert
 * Technology-Affinity block. On submit the whole bundle is flushed into
 * the global `demographics` store and control is handed to
 * `advanceStage()`, which walks the participant into `STATIC_SETUP` per
 * `STAGE_ORDER`.
 */

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

const EDUCATION_OPTIONS = [
  'High School',
  'Some College',
  'Associate',
  "Bachelor's",
  "Master's",
  'Doctorate',
  'Other',
]

const GENDER_OPTIONS = [
  'Male',
  'Female',
  'Non-binary',
  'Prefer not to say',
  'Other',
]

const PASSCODE_CHANGE_FREQUENCIES = [
  'Never',
  'Rarely',
  'Occasionally',
  'Frequently',
  'Very Frequently',
]

const TECH_AFFINITY_ITEMS = [
  'I like to occupy myself in greater detail with technical systems.',
  'I try to understand how a technical system exactly works.',
  "It is enough for me that a technical system works; I don't care how or why.",
  'I enjoy testing the features of new smartphones or applications.',
]

const LIKERT_MIN = 1
const LIKERT_MAX = 6
const LIKERT_VALUES = Array.from(
  { length: LIKERT_MAX - LIKERT_MIN + 1 },
  (_, i) => LIKERT_MIN + i
)

const YEAR_MIN = 1900
const YEAR_MAX = new Date().getFullYear()

/**
 * Days in a given (1-indexed) month, honouring leap years when both the
 * month and a plausible 4-digit year have been chosen. Falls back to 31
 * before those two are picked so the Day select is always populated.
 */
function daysInMonth(month, year) {
  if (!month) return 31
  const parsedYear = Number.parseInt(year, 10)
  const y = Number.isFinite(parsedYear) && parsedYear >= YEAR_MIN ? parsedYear : 2000
  return new Date(y, month, 0).getDate()
}

/**
 * Best-effort parse of an existing `birthDate` string into { month, day,
 * year } so the form can be re-entered without wiping the participant's
 * earlier answer. Accepts the canonical `YYYY-MM-DD` shape written by
 * this component; anything else falls back to blank fields.
 */
function parseBirthDate(raw) {
  if (typeof raw !== 'string') return { month: '', day: '', year: '' }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!match) return { month: '', day: '', year: '' }
  return {
    year: match[1],
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
  }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function DemographicsView() {
  const demographics = useStudyStore((s) => s.demographics)
  const setDemographics = useStudyStore((s) => s.setDemographics)
  const appendTelemetry = useStudyStore((s) => s.appendTelemetry)
  const advanceStage = useStudyStore((s) => s.advanceStage)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const initialDob = useMemo(() => parseBirthDate(demographics.birthDate), [
    demographics.birthDate,
  ])
  const [birthMonth, setBirthMonth] = useState(initialDob.month || '')
  const [birthDay, setBirthDay] = useState(initialDob.day || '')
  const [birthYear, setBirthYear] = useState(initialDob.year || '')
  const [education, setEducation] = useState(demographics.education || '')
  const [gender, setGender] = useState(demographics.gender || '')
  const [country, setCountry] = useState(demographics.country || '')
  const [passwordFrequency, setPasswordFrequency] = useState(
    demographics.passwordFrequency || ''
  )
  const [techAffinity, setTechAffinity] = useState(() => {
    const arr = Array.from({ length: TECH_AFFINITY_ITEMS.length }, () => null)
    demographics.techAffinity.forEach((v, i) => {
      if (i < arr.length) arr[i] = v
    })
    return arr
  })

  // Recompute the visible day range whenever month or year changes. If the
  // participant had already picked a Day that is now out of range (e.g.
  // switched from Jan to Feb after picking the 30th), snap the Day field
  // back to blank so they must re-pick — never silently coerce.
  const dayCount = useMemo(() => daysInMonth(birthMonth, birthYear), [
    birthMonth,
    birthYear,
  ])
  if (birthDay !== '' && Number(birthDay) > dayCount) {
    setBirthDay('')
  }

  const dayOptions = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => i + 1),
    [dayCount]
  )

  const yearValid =
    /^\d{4}$/.test(birthYear) &&
    Number.parseInt(birthYear, 10) >= YEAR_MIN &&
    Number.parseInt(birthYear, 10) <= YEAR_MAX

  const allTechAnswered = techAffinity.every((v) => v !== null)

  const canContinue =
    birthMonth !== '' &&
    birthDay !== '' &&
    yearValid &&
    education !== '' &&
    gender !== '' &&
    country.trim() !== '' &&
    passwordFrequency !== '' &&
    allTechAnswered

  const handleTechAffinity = (idx) => (event) => {
    const raw = Number.parseInt(event.target.value, 10)
    setTechAffinity((prev) => {
      const copy = prev.slice()
      copy[idx] = Number.isFinite(raw) ? raw : null
      return copy
    })
  }

  const handleSubmit = () => {
    if (!canContinue) return
    const birthDate = `${birthYear}-${pad2(birthMonth)}-${pad2(birthDay)}`
    const numericAffinity = techAffinity.map((v) => Number(v))
    const payload = {
      birthDate,
      education,
      gender,
      country: country.trim(),
      passwordFrequency,
      techAffinity: numericAffinity,
    }
    setDemographics(payload)
    appendTelemetry('demographics_submit', payload)
    advanceStage()
  }

  return (
    <Stack spacing={4} sx={{ maxWidth: 640, mx: 'auto', py: 2 }}>
      <Stack spacing={1}>
        <Typography variant="h5" component="h1">
          A few background questions
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Before the passcode tasks begin, please tell us a little about
          yourself. Every field is required.
        </Typography>
      </Stack>

      <Stack spacing={2}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Date of birth
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ sm: 'flex-start' }}
        >
          <FormControl fullWidth>
            <InputLabel id="dob-month-label">Month</InputLabel>
            <Select
              labelId="dob-month-label"
              id="dob-month"
              label="Month"
              value={birthMonth}
              onChange={(e) => setBirthMonth(e.target.value)}
            >
              {MONTHS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel id="dob-day-label">Day</InputLabel>
            <Select
              labelId="dob-day-label"
              id="dob-day"
              label="Day"
              value={birthDay}
              onChange={(e) => setBirthDay(e.target.value)}
            >
              {dayOptions.map((d) => (
                <MenuItem key={d} value={d}>
                  {d}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            id="dob-year"
            label="Year (YYYY)"
            value={birthYear}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 4)
              setBirthYear(digitsOnly)
            }}
            fullWidth
            inputProps={{
              inputMode: 'numeric',
              pattern: '[0-9]*',
              maxLength: 4,
              'aria-label': 'Year of birth',
            }}
            error={birthYear.length === 4 && !yearValid}
            helperText={
              birthYear.length === 4 && !yearValid
                ? `Year must be between ${YEAR_MIN} and ${YEAR_MAX}.`
                : ' '
            }
          />
        </Stack>
      </Stack>

      <FormControl fullWidth>
        <InputLabel id="education-label">Highest Level of Education</InputLabel>
        <Select
          labelId="education-label"
          id="education"
          label="Highest Level of Education"
          value={education}
          onChange={(e) => setEducation(e.target.value)}
        >
          {EDUCATION_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl component="fieldset">
        <FormLabel
          component="legend"
          sx={{
            fontWeight: 600,
            color: 'text.primary',
            mb: 1,
            '&.Mui-focused': { color: 'text.primary' },
          }}
        >
          How often do you typically change your smartphone lock screen
          passcode?
        </FormLabel>
        <RadioGroup
          name="passcode-change-frequency"
          value={passwordFrequency}
          onChange={(e) => setPasswordFrequency(e.target.value)}
        >
          {PASSCODE_CHANGE_FREQUENCIES.map((option) => (
            <FormControlLabel
              key={option}
              value={option}
              control={<Radio />}
              label={option}
            />
          ))}
        </RadioGroup>
      </FormControl>

      <FormControl fullWidth>
        <InputLabel id="gender-label">Gender</InputLabel>
        <Select
          labelId="gender-label"
          id="gender"
          label="Gender"
          value={gender}
          onChange={(e) => setGender(e.target.value)}
        >
          {GENDER_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        id="country"
        label="Country of Residence"
        type="text"
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        fullWidth
        inputProps={{ 'aria-label': 'Country of Residence' }}
      />

      <Stack spacing={2}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
          Technology Affinity
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Rate how strongly you agree with each statement (1 = Completely
          Disagree, 6 = Completely Agree).
        </Typography>

        <Stack spacing={2}>
          {TECH_AFFINITY_ITEMS.map((statement, idx) => (
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
                    name={`tech-affinity-${idx + 1}`}
                    value={techAffinity[idx] ?? ''}
                    onChange={handleTechAffinity(idx)}
                    sx={{
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      rowGap: 1,
                    }}
                  >
                    {LIKERT_VALUES.map((value) => (
                      <FormControlLabel
                        key={value}
                        value={value}
                        labelPlacement="bottom"
                        control={<Radio />}
                        label={
                          <Stack alignItems="center" sx={{ minWidth: 56 }}>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 600,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {value}
                            </Typography>
                          </Stack>
                        }
                        sx={{ m: 0, flex: '1 1 56px', alignItems: 'center' }}
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
                        sx={{
                          textTransform: 'uppercase',
                          letterSpacing: 0.6,
                        }}
                      >
                        1 · Completely Disagree
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          textTransform: 'uppercase',
                          letterSpacing: 0.6,
                        }}
                      >
                        6 · Completely Agree
                      </Typography>
                    </Stack>
                  </Box>
                </FormControl>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Stack>

      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleSubmit}
        disabled={!canContinue}
      >
        Continue to Setup
      </Button>
    </Stack>
  )
}

export default DemographicsView
