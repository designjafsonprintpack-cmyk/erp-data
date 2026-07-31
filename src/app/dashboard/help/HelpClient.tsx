'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, BookOpen, Check, ChevronRight, Lock, Zap } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { PageHeader } from '@/components/ui/PageHeader'
import { TabStrip } from '@/components/ui/TabStrip'
import { NAV_ITEMS, isNavLink, type NavLink as NavLinkType } from '@/components/layout/navConfig'
import { useNavPermissions } from '@/modules/settings/permissions/hooks/usePermission'
import { JourneyMap } from '@/components/help/JourneyMap'
import {
  CONCEPTS, JOURNEY, JOURNEY_VARIANTS, MODULE_GUIDES, ROLE_GUIDES,
  moduleGuide, roleGuide, type HelpSection,
} from '@/lib/help/content'

interface RoleRow { slug: string; name: string; description: string | null }

/**
 * Super Admin and Owner bypass every permission check — the bypass is at the
 * top of has_permission() in the database (005), so it applies to the API too,
 * not just the nav. Any "what can this role see" answer that ignored it would
 * be wrong for the two roles most likely to be reading this page.
 */
const BYPASS_ROLES = new Set(['superadmin', 'owner'])

/**
 * Which permission module a journey step's screen belongs to, so the step only
 * becomes a live link for someone who can actually open it. Derived from
 * NAV_ITEMS rather than written twice — a href that isn't in the nav (New Job,
 * for instance) falls back to the closest nav entry by prefix.
 */
function linkModuleFor(href: string): string {
  const links = NAV_ITEMS.filter(isNavLink)
  const exact = links.find(l => l.href === href)
  if (exact) return exact.module
  const prefix = links
    .filter(l => href.startsWith(l.href))
    .sort((a, b) => b.href.length - a.href.length)[0]
  return prefix?.module ?? 'jobs'
}

type Tab = 'role' | 'journey' | 'screens' | 'basics'

export function HelpClient({ roles, roleModules, allModules }: {
  roles: RoleRow[]
  roleModules: Record<string, string[]>
  allModules: string[]
}) {
  const { ready, role: myRole } = useNavPermissions()
  const [picked, setPicked] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('role')

  // Own role by default; the picker is for looking up what somebody ELSE does,
  // which is half the point of a shared manual.
  const slug = picked ?? (myRole || 'superadmin')
  const isMine = slug === myRole
  const guide = roleGuide(slug)
  const roleRow = roles.find(r => r.slug === slug)

  const visibleModules = useMemo(() => {
    if (BYPASS_ROLES.has(slug)) return allModules
    return roleModules[slug] ?? []
  }, [slug, roleModules, allModules])

  const canSee = (m: string) => visibleModules.includes(m)

  // The nav as this role actually sees it. Same array the sidebar reads, so the
  // two can never disagree. Help itself is skipped — it is always visible and
  // listing it as one of "your screens" is noise.
  const myLinks = useMemo(
    () => NAV_ITEMS.filter(isNavLink).filter(l => !l.alwaysVisible && canSee(l.module)),
    [visibleModules] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const blockedLinks = useMemo(
    () => NAV_ITEMS.filter(isNavLink).filter(l => !l.alwaysVisible && !canSee(l.module)),
    [visibleModules] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Guides for what this role can open, key modules first so the most relevant
  // screen is at the top rather than wherever it happens to sit in nav order.
  const guidesToShow = useMemo(() => {
    const wanted = new Set(visibleModules)
    const ordered: string[] = []
    for (const m of guide?.keyModules ?? []) if (wanted.has(m) && !ordered.includes(m)) ordered.push(m)
    for (const g of MODULE_GUIDES) if (wanted.has(g.module) && !ordered.includes(g.module)) ordered.push(g.module)
    return ordered.map(moduleGuide).filter(Boolean) as NonNullable<ReturnType<typeof moduleGuide>>[]
  }, [visibleModules, guide])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Help / Guide"
        subtitle={
          ready && myRole
            ? isMine
              ? `Aap ka role: ${roleRow?.name ?? myRole}. Neeche sirf wahi kaam hai jo aap kar sakte hain.`
              : `${roleRow?.name ?? slug} ka guide dekh rahe hain (aap ka role: ${myRole}).`
            : 'Har role ka apna guide — role chunein.'
        }
      />

      {/* Role picker. Everyone can read every role: a store man who knows what
          artwork does stops asking artwork what it did. */}
      <div className="space-y-1.5">
        <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Role</span>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_GUIDES.map(r => {
            const label = roles.find(x => x.slug === r.slug)?.name ?? r.title
            const active = r.slug === slug
            return (
              <button key={r.slug} onClick={() => setPicked(r.slug)}
                className={cn('px-3 h-9 md:h-8 rounded-md border text-sm transition-colors',
                  active
                    ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] border-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]')}>
                {label}
                {r.slug === myRole && (
                  <span className={cn('ml-1.5 text-xs', active ? 'opacity-80' : 'text-[var(--color-accent)]')}>• aap</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <TabStrip
        scrollOnMobile
        active={tab}
        onChange={k => setTab(k as Tab)}
        tabs={[
          { key: 'role',    label: 'Aap ka kaam' },
          { key: 'journey', label: 'Job ka safar', count: JOURNEY.length },
          { key: 'screens', label: 'Screens', count: guidesToShow.length },
          { key: 'basics',  label: 'Bunyadi baatein', count: CONCEPTS.length },
        ]}
      />

      {tab === 'role' && guide && (
        <div className="space-y-4">
          <Card>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{guide.title}</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{guide.oneLiner}</p>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Din ka kaam, tarteeb se</h3>
            <ol className="mt-3 space-y-3">
              {guide.dailyFlow.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[color:color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] text-xs font-bold flex items-center justify-center tabular-nums">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-sm text-[var(--color-text-primary)]">{s.do}</span>
                    {s.why && <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">{s.why}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          {guide.cannot && guide.cannot.length > 0 && (
            <Card tone="warning">
              <h3 className="text-sm font-semibold text-[var(--color-warning)] flex items-center gap-1.5">
                <Lock size={14} /> Yeh aap nahi kar sakte — aur kyun
              </h3>
              <ul className="mt-2 space-y-1.5">
                {guide.cannot.map((c, i) => (
                  <li key={i} className="text-sm text-[var(--color-text-secondary)]">{c}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* Computed live, never written down — see the page's server comment. */}
          <Card>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Aap ke screens ({myLinks.length})
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Yeh list Settings → Roles &amp; Permissions se seedha banti hai, is liye hamesha sach hoti hai.
              {BYPASS_ROLES.has(slug) && ' Is role par har screen khulti hai — permission check bypass hai.'}
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {myLinks.map(l => <LinkChip key={l.href} link={l} allowed />)}
            </div>
            {blockedLinks.length > 0 && (
              <>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mt-5">
                  Band ({blockedLinks.length})
                </h4>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {blockedLinks.map(l => <LinkChip key={l.href} link={l} allowed={false} />)}
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* A role with no written guide used to render this tab COMPLETELY BLANK —
          `{tab === 'role' && guide && …}` and nothing else. That is what any
          role added in Settings gets, and it is what `production_manager` got
          from the moment migration 119 created it. The screen list below is
          computed from live permissions, so it is useful on its own; only the
          prose is missing. */}
      {tab === 'role' && !guide && (
        <div className="space-y-4">
          <Card>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {roleRow?.name || slug}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {roleRow?.description
                || 'Is role ka likha hua guide abhi nahi bana. Neeche wo screens hain jo is role ko live permissions ke hisaab se khulti hain — wo list hamesha sahi hoti hai.'}
            </p>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              {isMine ? 'Aap ki screens' : 'Is role ki screens'} ({myLinks.length})
            </h3>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {myLinks.map(l => <LinkChip key={l.href} link={l} allowed />)}
            </div>
          </Card>
        </div>
      )}

      {tab === 'journey' && (
        <div className="space-y-4">
          {/* The picture first, then the same steps written out. Someone who
              only wants "where am I in this" gets it without reading. */}
          <JourneyMap slug={slug} />

          <Card>
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              Customer ki call se le kar paise tak
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Aam carton ka poora rasta. Jo step <strong className="text-[var(--color-accent)]">aap ka</strong> hai
              wo alag rang mein hai. Stage numbers wahi hain jo asal workflow mein hain.
            </p>
          </Card>

          <ol className="space-y-2">
            {JOURNEY.map(step => {
              const mine = step.who.includes(slug)
              return (
                <li key={step.n}
                  className={cn('rounded-lg border p-4',
                    mine
                      ? 'border-[color:color-mix(in_srgb,var(--color-accent)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--color-accent)_7%,transparent)]'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]')}>
                  <div className="flex items-start gap-3">
                    <span className={cn('flex-shrink-0 w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center tabular-nums',
                      mine
                        ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                        : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border border-[var(--color-border)]')}>
                      {step.n}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">{step.title}</h4>
                        {mine && (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--color-accent)] text-[var(--color-on-accent)]">
                            yeh aap ka kaam hai
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {step.whoLabel} · {step.href && canSee(linkModuleFor(step.href)) && isMine
                          ? <Link href={step.href} className="text-[var(--color-accent)] hover:underline">{step.where}</Link>
                          : step.where}
                      </p>

                      <ul className="mt-2 space-y-1">
                        {step.what.map((w, i) => (
                          <li key={i} className="flex gap-2">
                            <Check size={13} className="flex-shrink-0 mt-0.5 text-[var(--color-success)]" />
                            <span className="text-sm text-[var(--color-text-secondary)]">{w}</span>
                          </li>
                        ))}
                      </ul>

                      {step.gate && (
                        <p className="mt-2 flex gap-2">
                          <Lock size={13} className="flex-shrink-0 mt-0.5 text-[var(--color-warning)]" />
                          <span className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                            <strong className="text-[var(--color-warning)]">Rukawat:</strong> {step.gate}
                          </span>
                        </p>
                      )}
                      {step.auto && (
                        <p className="mt-1.5 flex gap-2">
                          <Zap size={13} className="flex-shrink-0 mt-0.5 text-[var(--color-info)]" />
                          <span className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                            <strong className="text-[var(--color-info)]">Khud hota hai:</strong> {step.auto}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>

          <Card>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Doosre raste — har job carton nahi hoti
            </h3>
            <div className="mt-3 space-y-4">
              {JOURNEY_VARIANTS.map((s, i) => <SectionBlock key={i} section={s} />)}
            </div>
          </Card>
        </div>
      )}

      {tab === 'screens' && (
        <div className="space-y-4">
          {guidesToShow.length === 0 && (
            <Card><p className="text-sm text-[var(--color-text-muted)]">Is role par koi screen khuli nahi hai. Settings → Roles &amp; Permissions dekhein.</p></Card>
          )}
          {guidesToShow.map(g => (
            <Card key={g.module}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{g.title}</h3>
                  <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{g.purpose}</p>
                </div>
                {NAV_ITEMS.filter(isNavLink).find(l => l.module === g.module) && isMine && (
                  <Link href={NAV_ITEMS.filter(isNavLink).find(l => l.module === g.module)!.href}
                    className="flex-shrink-0 text-xs text-[var(--color-accent)] hover:underline flex items-center gap-0.5">
                    Kholein <ChevronRight size={12} />
                  </Link>
                )}
              </div>
              <div className="mt-3 space-y-4">
                {g.sections.map((s, i) => <SectionBlock key={i} section={s} />)}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'basics' && (
        <div className="space-y-4">
          <Card>
            <h3 className="text-base font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
              <BookOpen size={15} /> Yeh sab par lagoo hota hai
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Ek dafa parh lein — inhi cheezon par sab se zyada ghalti hoti hai.
            </p>
          </Card>
          {CONCEPTS.map((s, i) => (
            <Card key={i}><SectionBlock section={s} /></Card>
          ))}
        </div>
      )}
    </div>
  )
}

function Card({ children, tone }: { children: React.ReactNode; tone?: 'warning' }) {
  return (
    <div className={cn('rounded-lg border p-4',
      tone === 'warning'
        // color-mix, never an opacity modifier on a var() — Tailwind v3 emits no
        // rule at all for bg-[var(--x)]/10 and the border falls back to white.
        ? 'border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_8%,transparent)]'
        : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]')}>
      {children}
    </div>
  )
}

function SectionBlock({ section }: { section: HelpSection }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">{section.heading}</h4>
      {section.body && <p className="text-sm text-[var(--color-text-secondary)] mt-1 leading-relaxed">{section.body}</p>}
      {section.steps && (
        <ol className="mt-2 space-y-2">
          {section.steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <Check size={13} className="flex-shrink-0 mt-1 text-[var(--color-success)]" />
              <span className="min-w-0">
                <span className="block text-sm text-[var(--color-text-secondary)]">{s.do}</span>
                {s.why && <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">{s.why}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {section.warnings && section.warnings.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {section.warnings.map((w, i) => (
            <li key={i} className="flex gap-2">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5 text-[var(--color-warning)]" />
              <span className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LinkChip({ link, allowed }: { link: NavLinkType; allowed: boolean }) {
  const Icon = link.icon
  const inner = (
    <>
      <Icon size={13} style={{ color: allowed ? link.color : undefined }} className={allowed ? '' : 'text-[var(--color-text-muted)]'} />
      <span className="truncate">{link.label}</span>
      {!allowed && <Lock size={11} className="ml-auto flex-shrink-0 text-[var(--color-text-muted)]" />}
    </>
  )
  const cls = cn('flex items-center gap-2 px-2.5 h-9 rounded-md border text-sm',
    allowed
      ? 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors'
      : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)]')

  return allowed
    ? <Link href={link.href} className={cls}>{inner}</Link>
    : <span className={cls}>{inner}</span>
}

export default HelpClient
