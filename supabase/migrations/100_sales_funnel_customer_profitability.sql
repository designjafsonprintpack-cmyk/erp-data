-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 100
-- Quotation win rate, and customer profitability (margin, not revenue)
--
-- WHY
--   Two commercial questions the system held the data for and could not answer:
--
--   1. "Kitne quote diye, kitne jeetay." quotations.status has carried
--      draft/sent/approved/rejected/expired/converted since 013 and nothing has
--      ever counted them. Without it there is no way to see that a customer
--      asks for twenty quotes and places two orders.
--
--   2. "Kaunsa customer waqai paisa deta hai." report_customer_sales answers
--      VOLUME and REVENUE only. The biggest customer and the most profitable
--      customer are routinely not the same one — a high-volume account bought
--      at a thin margin can be worth less than a small one. job_costings has
--      held margin_amount and margin_pct per job since 019; nothing aggregated
--      it per customer.
--
--   NOT INCLUDED — on-time delivery trend, which was on the batch list but
--   already exists: report_monthly_production.on_time_pct is rendered per month
--   in the Production tab, colour-coded at the 80% line. Rebuilding it would
--   have produced a second number that could drift from the first.
--
--   Both SECURITY INVOKER, so RLS still applies (matching 028's fix).
--
-- HOW TO UNDO
--   DROP FUNCTION get_quotation_funnel(UUID, DATE, DATE);
--   DROP FUNCTION get_customer_profitability(UUID, DATE, DATE);
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── QUOTATION FUNNEL / WIN RATE, PER CUSTOMER ────────────────────────────────
-- REVISIONS: a revised quotation is a NEW row pointing at the old one through
-- parent_quotation_id. Counting both would inflate "quotes raised" and depress
-- the win rate for exactly the customers who negotiate hardest. So a quotation
-- that has been superseded — i.e. some other live quotation names it as parent
-- — is excluded, and only the latest revision in the chain is counted.
--
-- won  = approved + converted   (converted means a sales order came out of it)
-- lost = rejected + expired
-- open = draft + sent           (still in play, so excluded from the win rate)
CREATE OR REPLACE FUNCTION get_quotation_funnel(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
) RETURNS TABLE (
  customer_id    UUID,
  customer_name  TEXT,
  customer_code  TEXT,
  quotes_raised  BIGINT,
  quotes_value   NUMERIC,
  won            BIGINT,
  won_value      NUMERIC,
  lost           BIGINT,
  lost_value     NUMERIC,
  open_quotes    BIGINT,
  open_value     NUMERIC,
  win_rate_pct   NUMERIC
) AS $$
  WITH live AS (
    SELECT q.*
    FROM quotations q
    WHERE q.company_id = p_company_id
      AND q.deleted_at IS NULL
      AND q.created_at >= p_from
      AND q.created_at < (p_to + 1)
      AND NOT EXISTS (
        SELECT 1 FROM quotations r
        WHERE r.parent_quotation_id = q.id
          AND r.deleted_at IS NULL
      )
  )
  SELECT
    c.id, c.name, c.customer_code,
    COUNT(*),
    COALESCE(SUM(l.total_amount), 0)::NUMERIC,
    COUNT(*) FILTER (WHERE l.status IN ('approved', 'converted')),
    COALESCE(SUM(l.total_amount) FILTER (WHERE l.status IN ('approved', 'converted')), 0)::NUMERIC,
    COUNT(*) FILTER (WHERE l.status IN ('rejected', 'expired')),
    COALESCE(SUM(l.total_amount) FILTER (WHERE l.status IN ('rejected', 'expired')), 0)::NUMERIC,
    COUNT(*) FILTER (WHERE l.status IN ('draft', 'sent')),
    COALESCE(SUM(l.total_amount) FILTER (WHERE l.status IN ('draft', 'sent')), 0)::NUMERIC,
    -- Decided quotes only. Counting still-open ones as losses would make a busy
    -- month look like a bad one purely because nothing had come back yet.
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE l.status IN ('approved', 'converted'))
      / NULLIF(COUNT(*) FILTER (WHERE l.status IN ('approved','converted','rejected','expired')), 0),
      1
    )::NUMERIC
  FROM live l
  JOIN customers c ON c.id = l.customer_id
  GROUP BY c.id, c.name, c.customer_code
  ORDER BY COUNT(*) DESC;
$$ LANGUAGE sql STABLE;

-- ─── CUSTOMER PROFITABILITY ───────────────────────────────────────────────────
-- Margin comes from job_costings, the same source the Costing tab uses, so the
-- two can never disagree.
--
-- uncosted_jobs is returned deliberately: only costed jobs carry a margin, so
-- without that count the totals would read as complete when they are not. The
-- UI shows it rather than quietly presenting a partial figure as the whole.
CREATE OR REPLACE FUNCTION get_customer_profitability(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
) RETURNS TABLE (
  customer_id    UUID,
  customer_name  TEXT,
  customer_code  TEXT,
  costed_jobs    BIGINT,
  uncosted_jobs  BIGINT,
  total_quoted   NUMERIC,
  total_cost     NUMERIC,
  total_margin   NUMERIC,
  margin_pct     NUMERIC
) AS $$
  WITH job_window AS (
    SELECT j.id, j.customer_id, j.quoted_amount
    FROM jobs j
    WHERE j.company_id = p_company_id
      AND j.deleted_at IS NULL
      AND j.order_date >= p_from
      AND j.order_date <= p_to
  ),
  costed AS (
    SELECT
      jw.customer_id AS cid,
      COUNT(*)                                  AS costed_jobs,
      COALESCE(SUM(jc.quoted_amount), 0)        AS total_quoted,
      COALESCE(SUM(jc.total_cost), 0)           AS total_cost,
      COALESCE(SUM(jc.margin_amount), 0)        AS total_margin
    FROM job_window jw
    -- deleted_at added by 092; a removed costing must not count as real money.
    JOIN job_costings jc ON jc.job_id = jw.id AND jc.deleted_at IS NULL
    GROUP BY jw.customer_id
  ),
  uncosted AS (
    SELECT jw.customer_id AS cid, COUNT(*) AS uncosted_jobs
    FROM job_window jw
    WHERE NOT EXISTS (
      SELECT 1 FROM job_costings jc
      WHERE jc.job_id = jw.id AND jc.deleted_at IS NULL
    )
    GROUP BY jw.customer_id
  )
  SELECT
    c.id, c.name, c.customer_code,
    COALESCE(cs.costed_jobs, 0),
    COALESCE(uc.uncosted_jobs, 0),
    COALESCE(cs.total_quoted, 0)::NUMERIC,
    COALESCE(cs.total_cost, 0)::NUMERIC,
    COALESCE(cs.total_margin, 0)::NUMERIC,
    ROUND(
      100.0 * COALESCE(cs.total_margin, 0) / NULLIF(COALESCE(cs.total_quoted, 0), 0), 1
    )::NUMERIC
  FROM customers c
  LEFT JOIN costed   cs ON cs.cid = c.id
  LEFT JOIN uncosted uc ON uc.cid = c.id
  WHERE c.company_id = p_company_id
    AND c.deleted_at IS NULL
    -- A customer with no jobs at all in the window is noise on a period report.
    AND (cs.cid IS NOT NULL OR uc.cid IS NOT NULL)
  ORDER BY COALESCE(cs.total_margin, 0) DESC;
$$ LANGUAGE sql STABLE;

NOTIFY pgrst, 'reload schema';
