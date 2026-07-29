# Workflow Knowledge — Sales to Reports

This is the backbone workflow the whole ERP is organized around. Every module
exists to move a job through these stages, and most bugs/design questions in
this system come down to "what state is the job in, and what's allowed to
happen next." Know this cold before touching any module.

```
Sales → Estimation → Job Planning → Artwork → Client Approval → Plates →
Purchase → Inventory → Production → Printing → Lamination → Die Cutting →
Pasting → Packing → Dispatch → Invoice → Reports
```

Treat this as a **state machine with branches and loops**, not a straight
line — real jobs go backward (client rejects artwork → back to Artwork),
skip stages (no lamination needed), and run stages in parallel (Purchase and
Plates often happen concurrently once a job is approved).

## Stage-by-stage

### 1. Sales
- Entry point: a customer inquiry or repeat order becomes a **lead/order
  intent**. Captures customer, product type (box, carton, label, brochure,
  bag, etc.), quantity, and rough spec.
- Feeds Estimation with enough detail to price. Should link to a
  `customers` record (or create one) — never let Sales create orphan orders
  with free-text customer names if a customer table exists.
- Key relationship: one customer → many orders/jobs over time. Sales history
  matters for repeat-order pricing and for "reprint from last job" flows.

### 2. Estimation
- Converts a spec into a **cost estimate and quoted price**. Inputs: paper/
  board type and GSM, size, number of colors, plate count, finishing
  (lamination, die cutting, pasting), quantity, wastage %, machine run rate.
- Job costing lives here conceptually but gets refined at every later stage
  — Estimation is a *forecast*, actual costing (material used, machine
  hours, wastage) is reconciled after Production. Don't conflate estimated
  cost and actual cost in the schema; keep them as distinct, comparable
  fields/tables.
- Output: an approved estimate becomes the basis for the **Job Card** (the
  record that Job Planning, Production, and Invoicing all reference).

### 3. Job Planning
- Turns an approved estimate into an actionable **production plan**: which
  machine, what sequence of operations (printing → lamination → die cutting
  → pasting → packing), target dates per stage, and material requirements.
- This is where **production scheduling** happens — see `09` for an example
  of a scheduling data model. Scheduling conflicts (two jobs wanting the
  same machine at the same time) are a real, frequent problem; the schema
  and UI should make conflicts visible, not silently overbook.
- Job Planning is also where you determine what stages this specific job
  actually needs (not every job needs lamination or die cutting) — this
  drives which of the later stage tables get rows for this job.

### 4. Artwork
- Design/prepress files (usually PDF, AI, or native design files) get
  attached to the job. Version control matters enormously here — a client
  approving "v3" while production pulls "v2" is one of the most common and
  costly real-world failures in this industry.
- Every artwork upload should be an **immutable version**, never an
  overwrite. Track version number, uploader, timestamp, and status
  (draft/submitted/approved/rejected) per version, not per job.
- CMYK / color separation concerns start here — see `08` for the domain
  detail. Flag if a file's color mode looks wrong (e.g., RGB where CMYK is
  required) if that's inspectable; don't silently ignore it.

### 5. Client Approval
- A gate, not a step: the job **cannot move to Plates** without an approved
  artwork version (enforce this in application logic and, where possible,
  at the database level via status checks/constraints, not just UI
  disabling).
- Approval workflow typically: internal design review → send to client
  (email/WhatsApp link, often to a shareable proof) → client approves or
  requests changes → loop back to Artwork if rejected.
- Track who approved (name/role, even if the "client" isn't a system user —
  capture how consent was captured, e.g., WhatsApp confirmation, signed
  proof) and when. This is often relevant for dispute resolution later, so
  don't treat the approval record as disposable.

### 6. Plates
- Once artwork is approved, **plates are made** — physical printing plates,
  one per color (see `08` for CMYK/plate count logic) or per separation.
- Plates have a **lifecycle**: new → in use → worn/damaged → retired/
  reordered. Track plate count, plate type, and — importantly — whether
  plates can be **reused for repeat orders** (this is a real cost saver
  shops care about; if the schema can support "same artwork, same plates,
  reorder" that's valuable).
- Plates link Job Planning to Purchase (plate-making is often outsourced)
  and to Production (plates must be ready before the print run starts).

### 7. Purchase
- Raw materials (paper/board, ink, lamination film, adhesive, plates if
  outsourced) get **purchase requests → approvals → purchase orders →
  goods receipt**.
- Purchase approvals are a common place for role/permission rules (e.g.,
  purchases above a threshold need a second approval) — see `10`.
- Purchase should check Inventory first — don't let the workflow encourage
  reordering stock that's already sufcient. A well-designed system surfaces
  "you already have X in stock" before a purchase request is submitted.

### 8. Inventory
- Tracks raw materials and (sometimes) semi-finished/finished goods.
  Movements: receipt (from Purchase), issue (to Production), return,
  adjustment/wastage.
- Every inventory movement should be an **append-only ledger row**, not just
  a mutation of a running balance column — the balance is a derived/cached
  value, the ledger is the source of truth. This is what makes stock
  discrepancies auditable later.
- Low-stock thresholds and reorder points feed back into Purchase.

### 9. Production
- The umbrella record that tracks a job actually being made. Often
  implemented as a parent record with child records per stage (Printing,
  Lamination, Die Cutting, Pasting, Packing) rather than one flat table —
  see `02` for schema shape options.
- QC checkpoints belong here: a stage shouldn't be markable "complete"
  without at least an optional QC pass/fail/notes field, because rework
  tracking depends on knowing where a defect was introduced.

### 10. Printing
- The actual press run. Captures machine used, operator, start/end time,
  quantity printed (vs. planned — wastage shows up here), and ink/plate
  consumption for costing reconciliation.
- Multi-color jobs may have multiple passes; don't assume one printing
  record per job if the shop runs multi-pass or multi-machine jobs.

### 11. Lamination
- Optional stage — film type (gloss/matte/soft-touch), machine, wastage.
  Skip cleanly (not with empty/null rows) for jobs that don't need it —
  Job Planning should have already decided this (see stage 3).

### 12. Die Cutting
- Uses a **die** (a tool, often shop-owned and reused across jobs with the
  same shape/size). Worth tracking dies similarly to plates (lifecycle,
  reuse) if the shop has enough volume for that to matter — ask before
  assuming this level of tracking is wanted; some shops track dies
  informally.
- Wastage and rework at this stage are common (misregistration) — capture
  it the same way as Printing wastage for accurate job costing.

### 13. Pasting
- Manual or semi-automated assembly stage (folding cartons, gluing). Often
  the most manual, least instrumented stage in real shops — a good
  candidate for simple digital checklists rather than heavy schema.

### 14. Packing
- Final product goes into shipping units (cartons, bundles). Capture units
  per pack and pack count — this feeds Dispatch (what's ready to ship) and
  Inventory (finished goods, if tracked).

### 15. Dispatch
- Ties to logistics: vehicle/courier, dispatch date, quantity dispatched
  (vs. ordered — partial dispatches are common and must be trackable, not
  forced into a single "shipped" boolean).
- Dispatch confirmation is a frequent WhatsApp/email automation target —
  see `07`.

### 16. Invoice
- Should be generatable from the Job Card + actual quantities dispatched
  (not just estimated quantities) — over-production/under-production
  against the original order is normal in printing (a client might
  contractually accept ±5% quantity variance) and invoicing needs to
  reflect actual dispatched quantity, not planned quantity.
- Link invoice line items back to job costing so gross margin per job is
  derivable, not manually recalculated.

### 17. Reports & Analytics
- Not a workflow stage so much as a lens over all the above: job
  profitability (estimated vs. actual cost), machine utilization, wastage
  trends, customer order history, plate/die reuse savings, dispatch
  on-time rate, inventory turnover.
- Design reports to be **derived from the ledger/event tables**, not from
  ad hoc manual entry — if a report requires data nobody is entering
  consistently, that's a process gap to flag, not a report to build.

## Cross-cutting workflow rules

- **A job's current stage should be a queryable, indexed field**, not
  something inferred by joining ten tables — dashboards live and die on
  this.
- **Every stage transition is an audit-worthy event** (who moved it, when,
  from what to what) — see `10`.
- **Branches back to earlier stages must be representable**, not
  worked around. Client-rejects-artwork is not an edge case in this
  industry, it's routine.
- When asked to build or modify a stage, first ask (or infer from the
  shared schema): what stages does *this* job type actually need, and what
  are the valid transitions in and out of the stage you're changing?
