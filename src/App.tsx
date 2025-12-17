import { useEffect, useMemo, useState } from 'react'
import './App.css'

type View = 'menu' | 'elapsed'

type TimeFields = {
  engineStart: string
  engineStop: string
}

type ActiveField = keyof TimeFields | null

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const MENU_OPTIONS = [
  {
    title: 'Elapsed Time',
    description: 'Block and airborne time with a quick keypad',
    action: 'elapsed',
    accent: true,
  },
  {
    title: 'Fuel & Notes',
    description: 'Save leg fuel, gates, and notes (soon)',
    disabled: true,
  },
  {
    title: 'Weight & Balance',
    description: 'Preset aircraft and loadouts (soon)',
    disabled: true,
  },
]

const isMobileUser = () =>
  /android|iphone|ipad|ipod|mobile/i.test(window.navigator.userAgent)

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS home screen flag
  // @ts-expect-error legacy iOS boolean
  window.navigator.standalone === true ||
  window.matchMedia('(display-mode: fullscreen)').matches

const isIosSafari = () => {
  const ua = window.navigator.userAgent.toLowerCase()
  const isIOS = /iphone|ipad|ipod/.test(ua)
  const isWebkit = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua)
  return isIOS && isWebkit
}

const formatDigitsWithColon = (digits: string) => {
  const trimmed = digits.slice(0, 4)
  if (trimmed.length <= 2) return trimmed
  return `${trimmed.slice(0, 2)}:${trimmed.slice(2)}`
}

const toMinutes = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) return null
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m) || h > 23 || m > 59) return null
  return h * 60 + m
}

const minutesToClock = (value: number) => {
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}`
}

const minutesToTcDecimal = (value: number) => {
  const hours = Math.floor(value / 60)
  const remainder = value % 60
  if (remainder <= 2) return hours.toFixed(1)
  if (remainder >= 57) return (hours + 1).toFixed(1)
  const steps = Math.floor((Math.min(remainder, 56) - 3) / 6) + 1
  return (hours + steps * 0.1).toFixed(1)
}

const diffMinutes = (start: string, end: string) => {
  const startMinutes = toMinutes(start)
  const endMinutes = toMinutes(end)
  if (startMinutes === null || endMinutes === null) return null
  const sameDay = endMinutes - startMinutes
  if (sameDay >= 0) return sameDay
  return sameDay + 24 * 60
}

function App() {
  const [view, setView] = useState<View>('menu')
  const [times, setTimes] = useState<TimeFields>({
    engineStart: '',
    engineStop: '',
  })
  const [activeField, setActiveField] = useState<ActiveField>('engineStart')
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallSheet, setShowInstallSheet] = useState(false)
  const [showIosTip, setShowIosTip] = useState(false)
  const [isAppInstalled, setIsAppInstalled] = useState(false)

  useEffect(() => {
    setIsAppInstalled(isStandalone())
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      if (isMobileUser() && !isStandalone()) {
        setShowInstallSheet(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (isMobileUser() && isIosSafari()) {
      setShowIosTip(true)
    }
  }, [])

  const engineElapsed = useMemo(
    () => diffMinutes(times.engineStart, times.engineStop),
    [times.engineStart, times.engineStop],
  )

  const totalBlock = engineElapsed ?? null
  const totalBlockTc = totalBlock !== null ? minutesToTcDecimal(totalBlock) : null
  const orderedFields: Array<keyof TimeFields> = useMemo(
    () => ['engineStart', 'engineStop'],
    [],
  )

  const handleDigit = (digit: string) => {
    if (!activeField) return
    setTimes((prev) => {
      const onlyDigits = prev[activeField].replace(/\D/g, '')
      if (onlyDigits.length >= 4) return prev
      const nextDigits = onlyDigits + digit
      const nextValue = formatDigitsWithColon(nextDigits)
      if (nextDigits.length >= 4) {
        const currentIndex = orderedFields.indexOf(activeField)
        const nextIndex = Math.min(currentIndex + 1, orderedFields.length - 1)
        setActiveField(orderedFields[nextIndex])
      }
      return {
        ...prev,
        [activeField]: nextValue,
      }
    })
  }

  const handleBackspace = () => {
    if (!activeField) return
    setTimes((prev) => {
      const digits = prev[activeField].replace(/\D/g, '')
      const nextDigits = digits.slice(0, -1)
      return {
        ...prev,
        [activeField]: formatDigitsWithColon(nextDigits),
      }
    })
  }

  const handleClear = () => {
    if (!activeField) return
    setTimes((prev) => ({ ...prev, [activeField]: '' }))
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
    } finally {
      setShowInstallSheet(false)
      setDeferredPrompt(null)
    }
  }

  const keypadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']

  const renderField = (label: string, key: keyof TimeFields) => (
    <button
      type="button"
      className={`time-chip ${activeField === key ? 'active' : ''}`}
      onClick={() => setActiveField(key)}
    >
      <span className="chip-label">{label}</span>
      <span className="chip-value">{times[key] || '--:--'}</span>
    </button>
  )

  const renderElapsed = (title: string, minutes: number | null) => (
    <div className="elapsed-row">
      <span>{title}</span>
      <div className="elapsed-values">
        <strong>{minutes !== null ? minutesToClock(minutes) : '--:--'}</strong>
        <span className="tc-decimal">
          {minutes !== null ? `${minutesToTcDecimal(minutes)}` : '--.-'}
        </span>
      </div>
    </div>
  )

  return (
    <div className="app-shell">
      {showInstallSheet && deferredPrompt && !isAppInstalled && (
        <div className="install-sheet">
          <div className="sheet-card">
            <div>
              <p className="eyebrow">Install</p>
              <h2>WingTime on your home screen</h2>
              <p className="muted">
                Mobile-first PWA. Install once, launch offline, and keep your times handy.
              </p>
            </div>
            <div className="sheet-actions">
              <button className="ghost" onClick={() => setShowInstallSheet(false)}>
                Not now
              </button>
              <button className="primary" onClick={handleInstall}>
                Add to home screen
              </button>
            </div>
          </div>
        </div>
      )}

      {showIosTip && (
        <div className="ios-tip">
          <div>
            <p className="eyebrow">iOS Safari</p>
            <p>Add via Share ▸ Add to Home Screen for the full PWA experience.</p>
          </div>
      <button type="button" className="icon-btn" onClick={() => setShowIosTip(false)}>
        ×
      </button>
    </div>
  )}

      {view === 'menu' ? (
        <section className="menu">
          <div className="menu-grid">
            {MENU_OPTIONS.map((option) => (
              <button
                key={option.title}
                type="button"
                disabled={option.disabled}
                className={`menu-card ${option.accent ? 'accent' : ''}`}
                onClick={() => {
                  if (option.action === 'elapsed') setView('elapsed')
                }}
              >
                <div className="menu-header">
                  <h3>{option.title}</h3>
                  {option.accent && <span className="pill">Primary</span>}
                  {option.disabled && <span className="pill subtle">Soon</span>}
                </div>
                <p className="muted">{option.description}</p>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="calculator">
          <div className="toolbar">
            <button type="button" className="ghost small" onClick={() => setView('menu')}>
              ← Menu
            </button>
            <div>
              <p className="eyebrow">Engine Time</p>
              <h2>Start to shutdown in two taps</h2>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="pill subtle">Engine</span>
              <span className="mini-hint">Tap a field, use the keypad</span>
            </div>
            <div className="chips">
              {renderField('Engine start', 'engineStart')}
              {renderField('Engine shutdown', 'engineStop')}
            </div>
            {renderElapsed('Engine time', totalBlock)}
          </div>

          <div className="panel keypad-panel">
            <div className="panel-header">
              <span className="pill subtle">Keypad</span>
              <span className="mini-hint">
                Auto adds a colon after hours · Long-press not needed
              </span>
            </div>
            <div className="keypad">
              {keypadKeys.map((key) => {
                if (key === 'back') {
                  return (
                    <button key={key} className="key action" onClick={handleBackspace}>
                      ⌫
                    </button>
                  )
                }
                if (key === 'clear') {
                  return (
                    <button key={key} className="key action" onClick={handleClear}>
                      C
                    </button>
                  )
                }
                return (
                  <button key={key} className="key" onClick={() => handleDigit(key)}>
                    {key}
                  </button>
                )
              })}
            </div>
            <div className="elapsed-row total">
              <span>Total engine tally</span>
              <div className="totals">
                <span>
                  Engine: {totalBlock !== null ? minutesToClock(totalBlock) : '--:--'} (
                  {totalBlockTc ?? '--.-'})
                </span>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export default App
