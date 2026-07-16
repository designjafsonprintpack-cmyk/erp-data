'use client'
import { useState, useEffect } from 'react'
import { Check, Palette, RotateCcw, Save } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const THEME_KEY = 'erp_theme'
const CUSTOM_KEY = 'erp_custom_colors'

const THEMES = [
  {
    key: 'github-dark', label: 'GitHub Dark', preview: ['#0d1117','#161b22','#2f81f7'],
    defaults: { accent: '#2f81f7', bg: '#0d1117', bgSecondary: '#161b22', bgElevated: '#1c2128', border: '#30363d', textPrimary: '#e6edf3', success: '#3fb950', warning: '#d29922', danger: '#f85149' }
  },
  {
    key: 'dark-blue', label: 'Dark Blue', preview: ['#0a0f1e','#0f172a','#3b82f6'],
    defaults: { accent: '#3b82f6', bg: '#0a0f1e', bgSecondary: '#0f172a', bgElevated: '#1e293b', border: '#1e3a5f', textPrimary: '#e2e8f0', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444' }
  },
  {
    key: 'dark-orange', label: 'Dark Orange', preview: ['#1a1108','#241a0d','#f07a1a'],
    defaults: { accent: '#f07a1a', bg: '#1a1108', bgSecondary: '#241a0d', bgElevated: '#2e2210', border: '#4a3418', textPrimary: '#f7ede0', success: '#4caf82', warning: '#e0c940', danger: '#e0546f' }
  },
  {
    key: 'dark-green', label: 'Dark Green', preview: ['#0d1912','#14261b','#3fb96a'],
    defaults: { accent: '#3fb96a', bg: '#0d1912', bgSecondary: '#14261b', bgElevated: '#1b3324', border: '#234a32', textPrimary: '#e3f3e8', success: '#4caf50', warning: '#d2a622', danger: '#e05a5a' }
  },
  {
    key: 'light', label: 'Light', preview: ['#ffffff','#f6f8fa','#2f81f7'],
    defaults: { accent: '#2f81f7', bg: '#ffffff', bgSecondary: '#f6f8fa', bgElevated: '#eaeef2', border: '#d0d7de', textPrimary: '#1f2328', success: '#1a7f37', warning: '#9a6700', danger: '#cf222e' }
  },
]

type ColorKeys = 'accent' | 'bg' | 'bgSecondary' | 'bgElevated' | 'border' | 'textPrimary' | 'success' | 'warning' | 'danger'

const COLOR_LABELS: Record<ColorKeys, string> = {
  accent: 'Accent / Primary',
  bg: 'Background',
  bgSecondary: 'Card Background',
  bgElevated: 'Elevated Surface',
  border: 'Border Color',
  textPrimary: 'Text Color',
  success: 'Success',
  warning: 'Warning',
  danger: 'Danger / Error',
}

function applyCustomColors(colors: Record<string, string>) {
  const root = document.documentElement
  root.style.setProperty('--color-accent', colors.accent)
  root.style.setProperty('--color-accent-hover', colors.accent + 'cc')
  root.style.setProperty('--color-bg-primary', colors.bg)
  root.style.setProperty('--color-bg-secondary', colors.bgSecondary)
  root.style.setProperty('--color-bg-elevated', colors.bgElevated)
  root.style.setProperty('--color-border', colors.border)
  root.style.setProperty('--color-border-subtle', colors.border + '80')
  root.style.setProperty('--color-text-primary', colors.textPrimary)
  root.style.setProperty('--color-success', colors.success)
  root.style.setProperty('--color-warning', colors.warning)
  root.style.setProperty('--color-danger', colors.danger)
}

export default function ThemesPage() {
  const [active, setActive] = useState('github-dark')
  const [customizing, setCustomizing] = useState(false)
  const [colors, setColors] = useState<Record<ColorKeys, string>>(THEMES[0].defaults)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'github-dark'
    setActive(savedTheme)
    const savedColors = localStorage.getItem(CUSTOM_KEY)
    if (savedColors) {
      try { setColors(JSON.parse(savedColors)) } catch {}
    } else {
      const theme = THEMES.find(t => t.key === savedTheme)
      if (theme) setColors(theme.defaults)
    }
  }, [])

  const selectTheme = (theme: typeof THEMES[0]) => {
    setActive(theme.key)
    setColors(theme.defaults)
    localStorage.setItem(THEME_KEY, theme.key)
    localStorage.removeItem(CUSTOM_KEY)
    document.documentElement.setAttribute('data-theme', theme.key)
    // Remove any custom inline styles
    const root = document.documentElement
    Object.keys(theme.defaults).forEach(() => {})
    root.removeAttribute('style')
    root.setAttribute('data-theme', theme.key)
    setCustomizing(false)
  }

  const setColor = (key: ColorKeys, value: string) => {
    const next = { ...colors, [key]: value }
    setColors(next)
    applyCustomColors(next)
  }

  const saveCustom = () => {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(colors))
    localStorage.setItem(THEME_KEY, active)
    applyCustomColors(colors)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const resetColors = () => {
    const theme = THEMES.find(t => t.key === active)
    if (!theme) return
    setColors(theme.defaults)
    localStorage.removeItem(CUSTOM_KEY)
    document.documentElement.removeAttribute('style')
    document.documentElement.setAttribute('data-theme', active)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Themes</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Choose a theme and customize colors to your preference</p>
      </div>

      {/* Theme Cards */}
      <div className="grid grid-cols-5 gap-3">
        {THEMES.map(theme => (
          <button key={theme.key} onClick={() => selectTheme(theme)}
            className={cn('relative rounded-xl border-2 p-3 text-left transition-all hover:scale-105',
              active === theme.key
                ? 'border-[var(--color-accent)] shadow-lg'
                : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/50')}>
            {/* Preview */}
            <div className="rounded-lg overflow-hidden mb-2 h-12 flex"
              style={{ background: theme.preview[0] }}>
              <div className="w-1/3 h-full" style={{ background: theme.preview[1] }} />
              <div className="flex-1 p-1.5 flex flex-col gap-1">
                <div className="h-1.5 rounded-full" style={{ background: theme.preview[2] }} />
                <div className="h-1 rounded-full w-3/4" style={{ background: theme.preview[1] }} />
                <div className="h-1 rounded-full w-1/2" style={{ background: theme.preview[1] }} />
              </div>
            </div>
            <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{theme.label}</p>
            {active === theme.key && (
              <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[var(--color-accent)] flex items-center justify-center">
                <Check size={9} className="text-white" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Customize Button */}
      <div className="flex items-center gap-3">
        <button onClick={() => setCustomizing(!customizing)}
          className={cn('flex items-center gap-2 px-4 h-9 rounded-md border text-sm font-medium transition-all',
            customizing
              ? 'bg-[var(--color-accent)] text-white border-transparent'
              : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]')}>
          <Palette size={15} />
          {customizing ? 'Hide Customizer' : 'Customize Colors'}
        </button>
        {customizing && (
          <>
            <button onClick={resetColors}
              className="flex items-center gap-2 px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
              <RotateCcw size={14} /> Reset
            </button>
            <button onClick={saveCustom}
              className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-success)] text-white text-sm font-medium hover:opacity-90 transition-colors">
              <Save size={14} /> {saved ? 'Saved! ✓' : 'Save Colors'}
            </button>
          </>
        )}
      </div>

      {/* Color Customizer */}
      {customizing && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Color Customizer</h2>
          <div className="grid grid-cols-3 gap-4">
            {(Object.keys(COLOR_LABELS) as ColorKeys[]).map(key => (
              <div key={key} className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                  {COLOR_LABELS[key]}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors[key]}
                    onChange={e => setColor(key, e.target.value)}
                    className="w-10 h-9 rounded-md border border-[var(--color-border)] cursor-pointer bg-transparent p-0.5"
                  />
                  <input
                    type="text"
                    value={colors[key]}
                    onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setColor(key, e.target.value) }}
                    className="flex-1 h-9 px-2 rounded-md border text-xs font-mono bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>
                {/* Live preview swatch */}
                <div className="h-2 rounded-full" style={{ background: colors[key] }} />
              </div>
            ))}
          </div>

          {/* Live preview */}
          <div className="mt-5 rounded-lg overflow-hidden border border-[var(--color-border)]">
            <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ background: colors.bgElevated, color: colors.textPrimary, borderBottom: `1px solid ${colors.border}` }}>
              Live Preview
            </div>
            <div className="p-4 flex items-center gap-3" style={{ background: colors.bgSecondary }}>
              <div className="w-24 h-16 rounded-lg" style={{ background: colors.bg }} />
              <div className="space-y-2 flex-1">
                <div className="h-3 rounded-full w-3/4" style={{ background: colors.accent }} />
                <div className="h-2 rounded-full w-1/2" style={{ background: colors.border }} />
                <div className="flex gap-1.5">
                  <div className="h-5 px-2 rounded text-xs flex items-center" style={{ background: colors.success + '20', color: colors.success }}>Success</div>
                  <div className="h-5 px-2 rounded text-xs flex items-center" style={{ background: colors.warning + '20', color: colors.warning }}>Warning</div>
                  <div className="h-5 px-2 rounded text-xs flex items-center" style={{ background: colors.danger + '20', color: colors.danger }}>Error</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--color-text-muted)]">
        Theme preferences are saved in your browser. Each user can set their own theme.
      </p>
    </div>
  )
}
