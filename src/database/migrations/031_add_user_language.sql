-- ============================================================
-- Migration: 031_add_user_language.sql
-- Description: Add language preference field to users table
-- Date: 2026-06-14
-- ============================================================

-- PostgreSQL 版本
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'language'
    ) THEN
        ALTER TABLE users ADD COLUMN language VARCHAR(10) DEFAULT 'en';
        COMMENT ON COLUMN users.language IS 'User language preference: en, zh-CN';
    END IF;
END $$;

-- 更新现有用户的默认语言为英文（面向全球用户）
UPDATE users SET language = 'en' WHERE language IS NULL;