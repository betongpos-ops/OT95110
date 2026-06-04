-- ============================================================
-- OT Management System - Supabase Schema
-- รันใน Supabase SQL Editor ทีละขั้น
-- ============================================================

-- =====================
-- 1. สร้าง TABLES
-- =====================

-- พนักงาน
CREATE TABLE IF NOT EXISTS employees (
  id            TEXT PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  position      TEXT DEFAULT '',
  day_off1      TEXT DEFAULT '',
  day_off2      TEXT DEFAULT '',
  wage_type     TEXT DEFAULT 'รายเดือน',
  salary        NUMERIC(12,2) DEFAULT 0,
  duties        TEXT[] DEFAULT '{}',
  contract_type TEXT DEFAULT 'ปกติ',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- วันหยุดนักขัตฤกษ์
CREATE TABLE IF NOT EXISTS public_holidays (
  date     DATE PRIMARY KEY,
  name     TEXT NOT NULL,
  type     TEXT DEFAULT 'นักขัตฤกษ์',
  ref_date DATE,
  note     TEXT DEFAULT ''
);

-- หน้าที่
CREATE TABLE IF NOT EXISTS duties (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT DEFAULT ''
);

-- อัตรากำลัง
CREATE TABLE IF NOT EXISTS quotas (
  id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date     DATE NOT NULL,
  duty_id  TEXT NOT NULL REFERENCES duties(id) ON DELETE CASCADE,
  count    INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  UNIQUE(date, duty_id)
);

-- ตารางปฏิบัติงาน
CREATE TABLE IF NOT EXISTS schedule (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date        DATE NOT NULL,
  emp_id      TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  duty_id     TEXT NOT NULL REFERENCES duties(id) ON DELETE CASCADE,
  note        TEXT DEFAULT '',
  recorded_by TEXT DEFAULT 'system',
  record_time TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, emp_id, duty_id)
);

-- =====================
-- 2. INDEXES
-- =====================

CREATE INDEX IF NOT EXISTS idx_schedule_date   ON schedule(date);
CREATE INDEX IF NOT EXISTS idx_schedule_emp_id ON schedule(emp_id);
CREATE INDEX IF NOT EXISTS idx_quotas_date     ON quotas(date);

-- =====================
-- 3. ROW LEVEL SECURITY
-- =====================
-- เปิด RLS แต่อนุญาตทุก operation สำหรับ anon key (ระบบภายใน)

ALTER TABLE employees      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE duties         ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON employees       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON public_holidays FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON duties          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON quotas          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON schedule        FOR ALL TO anon USING (true) WITH CHECK (true);

-- =====================
-- 4. ข้อมูลเริ่มต้น (หน้าที่)
-- =====================

INSERT INTO duties (id, name, description) VALUES
  ('D001', 'รับฝาก',              'งานรับฝากสิ่งของ'),
  ('D002', 'ปฏิบัติการขาเข้า',    'งานปฏิบัติการขาเข้า'),
  ('D003', 'ปฏิบัติการขาออก',     'งานปฏิบัติการขาออก'),
  ('D004', 'นำจ่าย',              'งานนำจ่ายสิ่งของ')
ON CONFLICT (id) DO NOTHING;
