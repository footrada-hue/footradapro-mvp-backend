-- =====================================================
-- Migration: 011_update_authorizations.sql
-- Description: 更新授權表結構，與當前設計匹配
-- =====================================================

-- 添加缺少的字段（如果不存在）
ALTER TABLE authorizations ADD COLUMN match_result TEXT;
ALTER TABLE authorizations ADD COLUMN final_score TEXT;
ALTER TABLE authorizations ADD COLUMN platform_fee REAL DEFAULT 0;
ALTER TABLE authorizations ADD COLUMN deployed_amount REAL;
ALTER TABLE authorizations ADD COLUMN reserved_amount REAL;
ALTER TABLE authorizations ADD COLUMN profit_rate INTEGER;
ALTER TABLE authorizations ADD COLUMN settlement_type TEXT;

-- 注意：字段重命名操作在 SQLite 中不支持直接執行
-- 如果確實需要重命名，需要使用複雜的表重建操作
-- 這裡我們假設表結構已經正確，只添加缺失的字段