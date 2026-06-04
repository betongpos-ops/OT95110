-- ============================================================
-- Migration: เพิ่มฟิลด์เวลาทำงานและเวลาพักในตาราง employees
-- รันใน Supabase SQL Editor (ถ้ายังไม่ได้รัน schema.sql ให้รัน schema.sql ก่อน)
-- ============================================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS work_start  TIME DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS work_end    TIME DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS break_start TIME DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS break_end   TIME DEFAULT '13:00';
