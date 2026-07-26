/**
 * The six shop-floor stage pages in the sidebar, and which workflow stage
 * names each one owns.
 *
 * Why prefixes and not stage_type: stage_type was only ever filled in for the
 * handful of stages that needed a code gate (artwork_approval, printing,
 * board_issue, plus the whole HL template), so it is NULL on Lamination,
 * Hot Foil, Folder Gluing and the rest. Names are what actually exist on every
 * template, and Mehboob can add a template with a slightly different name from
 * Settings → Workflow Engine — a prefix list absorbs that ("Die Cutting" and
 * "Die Cutting & Embossing" are one page's work either way).
 *
 * Kept deliberately in sync with the stage → department mapping in migration
 * 091: UV Coating / Varnish sit with Lamination, Assembly sits with Packing.
 */
export interface ProductionStageDef {
  slug: string
  label: string
  /** Lower-case name prefixes. A stage belongs here if its name starts with one. */
  prefixes: string[]
}

export const PRODUCTION_STAGES: ProductionStageDef[] = [
  { slug: 'printing',      label: 'Printing',      prefixes: ['printing'] },
  { slug: 'lamination',    label: 'Lamination',    prefixes: ['lamination', 'uv coating', 'varnish', 'coating'] },
  { slug: 'die-cutting',   label: 'Die Cutting',   prefixes: ['die cutting', 'die-cutting', 'embossing'] },
  { slug: 'hot-foil',      label: 'Hot Foil',      prefixes: ['hot foil'] },
  { slug: 'folder-gluing', label: 'Folder Gluing', prefixes: ['folder gluing', 'gluing', 'pasting'] },
  { slug: 'packing',       label: 'Packing',       prefixes: ['packing', 'assembly'] },
]

export function getProductionStage(slug: string): ProductionStageDef | null {
  return PRODUCTION_STAGES.find(s => s.slug === slug) ?? null
}

/** Does this workflow stage name belong to this page? */
export function stageMatchesSlug(stageName: string, def: ProductionStageDef): boolean {
  const n = stageName.trim().toLowerCase()
  return def.prefixes.some(p => n.startsWith(p))
}

export default PRODUCTION_STAGES
