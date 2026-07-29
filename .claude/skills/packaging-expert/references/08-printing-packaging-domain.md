# Printing & Packaging Domain Knowledge

Use this as a reference for terminology and industry logic so features and
data models are correct for the domain, not generic. When a term appears in
a user's request and you're unsure of it, check here before guessing.

## Color & prepress

- **CMYK** — Cyan, Magenta, Yellow, Key(black): the standard 4-color
  process printing uses. Most print jobs are separated into these 4 plates
  (or ink stations for digital). Design files delivered in RGB need
  conversion — flag if an uploaded artwork file appears to be RGB where the
  press requires CMYK, if that's inspectable from metadata.
- **Spot color / Pantone (PMS)** — a single pre-mixed ink matched to a
  standard, used when exact brand-color consistency matters more than what
  CMYK can reproduce, or for jobs with only 1-2 colors (cheaper than 4-color
  process). A job may combine CMYK + one or more spot colors — plate/color
  count in Estimation and Plates should account for this, not assume every
  job is exactly 4 colors.
- **Color separation** — splitting artwork into one channel per ink/plate.
  Each separation becomes one plate (see Plates below).
- **Bleed** — artwork extended beyond the trim line so that after cutting,
  there's no unprinted edge from slight cutting misalignment. Standard is
  often ~3mm/0.125in but varies by shop/press — don't hardcode a value
  without confirming the shop's standard.
- **Registration** — alignment of multiple color plates/passes to each
  other. Misregistration is a common print defect and QC checkpoint.
- **Proof** — a preview (digital or physical) shown to the client for
  approval before full production; distinct from the final printed product.
  "Proof approved" and "job complete" are different states.

## Substrates & materials

- **GSM (grams per square meter)** — the standard measure of paper/board
  weight/thickness. Higher GSM = thicker/heavier stock. Estimation and
  Purchase need GSM as a distinct, structured field (not folded into a
  free-text "paper type" string) because it drives both cost and weight-
  based shipping/costing calculations.
- **Board / carton stock / corrugated** — different substrate categories
  for packaging specifically (as opposed to paper for brochures/labels).
  Corrugated (fluted board) has its own spec dimensions (flute size: B, C,
  E flute etc.) relevant to box strength — track flute type for corrugated
  jobs if the shop produces them.
- **GSM/substrate + finish (matte, gloss, textured) + color** together
  define a "stock" — many shops maintain a stock master list rather than
  free-typing this per job; if the schema has an `inventory_items` /
  `stock_master` concept, paper specs belong there, referenced by
  Estimation, not duplicated as text.

## Plates

- One plate per color/separation is the traditional model (offset
  printing) — a 4-color job needs 4 plates (per side, if double-sided).
  Digital presses don't use physical plates at all (toner/inkjet, no
  plate-making step) — if the shop runs both offset and digital, the
  Plates stage should be skippable per job, not mandatory (ties back to
  Job Planning deciding which stages apply, see `01`).
- **Plate lifecycle**: made → mounted on press → used → stored (for
  possible reorder reuse) → worn/damaged → discarded. Plates for a repeat
  order with unchanged artwork can often be reused, which is a real cost
  and time saving worth surfacing in the system ("this job matches a prior
  job's artwork — reuse existing plates?").
- Plates are typically outsourced to a separate plate-making vendor in
  smaller shops (ties Plates to Purchase) or made in-house on larger setups
  (ties Plates to Inventory for plate material stock).

## Ups / imposition

- **"Ups"** — how many copies of the design are laid out on one press
  sheet (e.g., "8-up" = 8 copies per sheet). This directly affects
  material efficiency and cost-per-unit calculations in Estimation — more
  ups per sheet generally lowers per-unit cost but depends on sheet size
  vs. product size. If Estimation doesn't already account for ups, that's
  worth flagging as a costing accuracy gap.
- **Imposition** — the layout plan of how pages/copies are arranged on the
  press sheet/plate, accounting for cutting and (for booklets/folded work)
  page order after folding.

## Finishing operations

- **Lamination** — a thin plastic (or occasionally paper) film applied to
  the printed sheet for durability/appearance (gloss, matte, soft-touch
  variants). Applied after printing, before die cutting in most sequences.
- **Die cutting** — cutting the printed (and possibly laminated) sheet into
  its final shape using a **die** (a shaped cutting tool, often
  wood-and-steel-rule, custom per product shape). Dies are reusable across
  repeat orders of the same shape — similar reuse logic to plates.
- **Pasting / gluing** — assembling cut pieces (e.g., folding and gluing a
  carton into its 3D form). Often manual or semi-automated; this is
  frequently the least digitized stage on the shop floor (see `01`).
- **Embossing/debossing, foiling, spot UV** — additional finishing
  operations that may exist in a fuller-featured shop; if the user
  mentions these, treat them as additional optional stages similar in
  shape to Lamination (optional, per-job, with their own wastage/cost
  tracking) rather than assuming they don't exist in this domain.
- **Scoring/creasing** — creating fold lines, often done as part of or
  alongside die cutting for carton work.

## Job costing

Job costing in this industry has three distinct numbers that must not be
conflated in the schema or UI:

1. **Estimated cost** — calculated at Estimation time from paper cost
   (GSM × sheet size × sheets needed, accounting for ups and wastage %),
   plate/setup cost, machine run cost (rate × estimated time), and
   finishing costs (lamination/die cutting/pasting, often per-unit or
   per-sheet rates).
2. **Actual cost** — reconciled after Production from actual material
   consumed (Inventory movements), actual machine time (Printing/
   Lamination/etc. run records), actual wastage (planned wastage % vs.
   what actually happened — wastage above plan is a signal worth
   surfacing, not just recording).
3. **Variance** — estimated vs. actual, per job and aggregated (a shop
   that consistently underestimates wastage on a machine/paper combination
   has a costing-accuracy problem worth surfacing in Reports, see `01`).

Wastage itself is normal and expected at multiple stages (setup wastage
on Printing, misregistration/misalignment on Die Cutting, spoilage in
Pasting) — model it as an expected, budgeted quantity, not purely as an
error condition, while still flagging when actual wastage significantly
exceeds planned.

## QC

- QC checkpoints commonly happen after Printing (color/registration check),
  after Die Cutting (shape/dimension accuracy), and before Packing (final
  visual check). A QC failure at any stage should be able to trigger
  rework at that stage (reprint a portion, redo a die-cut batch) without
  requiring the whole job to restart from Sales — model rework as a
  sub-loop within a stage, not a full workflow restart.

## Multi-company nuance in this industry

Print/packaging groups sometimes run multiple legal entities/branches
sharing machines, staff, or a customer base (e.g., a labels division and a
carton division under one group). If multi-company is in scope, clarify
with the user whether companies share master data (customers, machines,
stock items) or are fully isolated — this materially changes the schema
and RLS design in `02`, and guessing wrong here is expensive to unwind.
