-- 146: EK AADMI, KAI DEPARTMENT
--
-- KYA TOOTA THA
--   Mehboob: *"yaha is company main aik shaks 2 ya 3 depart ko dakh raha hay,
--   is liyay wo apny account say hi kam kery gy."* Bilkul — ye 15 aadmiyon ki
--   factory hai, har department ka apna aadmi nahi hai.
--
--   Lekin `users.department_id` EK hi department rakhta hai, aur wohi teen cheez
--   chalata hai:
--     · Department Queue — kaunsa kaam nazar aayega
--     · notifyDepartment() — stage mukammal hone par kis ko ittila jaye
--     · production-reminders cron
--   Yani jo aadmi Planning, Printing aur Plates teenon dekhta hai, usay sirf
--   AIK ka kaam milta tha aur baqi do ki ittila kahin nahi jati thi. Live par
--   14 mein se 8 department khali parhe hain — wo khali nahi hain, unka aadmi
--   kisi aur department mein likha hua hai.
--
-- YE MIGRATION KYA KARTI HAI
--   `user_departments` — aik aadmi ke kai department. `users.department_id`
--   MITAYA NAHI gaya: wo ab "asal/pehla department" hai (queue us par khulta
--   hai, screens usay dikhati hain), aur ye table uske SAATH ke department
--   rakhti hai. Purana column jyun ka tyun chalta rehta hai, is liye koi purani
--   screen nahi tootti.
--
--   Backfill: har us aadmi ka mojooda `department_id` isi table mein bhi daal
--   diya gaya, taake "is department mein kaun hai" ka jawab sirf EK jagah se
--   milay aur do fehristein kabhi alag na hon.
--
-- WAPAS KAISE LEIN
--   DROP TABLE IF EXISTS user_departments;
--   (Code pehle hatana — warna sirf primary department wale log hi rehte hain,
--    jo theek 145 se pehle wali halat hai, yani nuqsan koi nahi.)

CREATE TABLE IF NOT EXISTS user_departments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  -- Aik aadmi ek department mein do dafa nahi ho sakta.
  CONSTRAINT user_departments_unique UNIQUE (company_id, user_id, department_id)
);

COMMENT ON TABLE user_departments IS
  'Ek aadmi ke KAI department — chhoti factory mein ek shakhs 2-3 department '
  'dekhta hai aur apne hi account se kaam karta hai. users.department_id ab '
  'uska ASAL department hai (queue wahan khulta hai); ye table uske saath ke '
  'department rakhti hai aur usay bhi shamil rakhti hai. Migration 146.';

CREATE INDEX IF NOT EXISTS idx_user_departments_dept
  ON user_departments(company_id, department_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_departments_user
  ON user_departments(company_id, user_id) WHERE deleted_at IS NULL;

ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_departments_company ON user_departments;
CREATE POLICY user_departments_company ON user_departments
  FOR ALL
  USING (company_id = (auth.jwt() ->> 'company_id')::uuid)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Backfill — har mojooda primary department yahan bhi. Is ke baad "kaun is
-- department mein hai" ka jawab sirf isi table se milta hai.
INSERT INTO user_departments (company_id, user_id, department_id)
SELECT u.company_id, u.id, u.department_id
  FROM users u
 WHERE u.department_id IS NOT NULL
   AND u.deleted_at IS NULL
ON CONFLICT (company_id, user_id, department_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
