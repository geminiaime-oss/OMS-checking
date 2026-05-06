-- CUSTOM ORDER MANAGEMENT SYSTEM (OMS) REPAIR & SETUP
-- Paste this into your Supabase SQL Editor and click 'Run'
-- This script is safe to run multiple times (Idempotent)

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create the Orders Table if it doesn't exist
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    order_id TEXT UNIQUE,
    customer_name TEXT,
    phone TEXT,
    normalized_phone TEXT,
    address TEXT,
    product_summary TEXT, -- Changed from 'products JSONB' to match app.js
    total_amount NUMERIC DEFAULT 0,
    advance_amount NUMERIC DEFAULT 0,
    cod_amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'Pending',
    tracking_id TEXT,
    internal_note TEXT, -- New Column for customer comments
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT 
);

-- 3. Add missing columns if table already existed without them
ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_summary TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS normalized_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_note TEXT;

-- 4. Function to normalize phone numbers
CREATE OR REPLACE FUNCTION normalize_phone_number()
RETURNS TRIGGER AS $$
DECLARE
    cleaned TEXT;
BEGIN
    -- Strip all non-numeric characters
    cleaned := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
    
    -- If it starts with '88', remove it
    IF cleaned LIKE '88%' THEN
        cleaned := substring(cleaned from 3);
    ELSIF cleaned LIKE '880%' THEN
        cleaned := substring(cleaned from 4);
    END IF;
    
    -- Ensure it starts with 0
    IF cleaned NOT LIKE '0%' AND length(cleaned) = 10 THEN
        cleaned := '0' || cleaned;
    END IF;

    NEW.normalized_phone := cleaned;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger for phone normalization (Drop first to avoid 'already exists' error)
DROP TRIGGER IF EXISTS trigger_normalize_phone ON orders;
CREATE TRIGGER trigger_normalize_phone
BEFORE INSERT OR UPDATE OF phone ON orders
FOR EACH ROW EXECUTE FUNCTION normalize_phone_number();

-- 6. Function to update "updated_at" and "updated_by"
CREATE OR REPLACE FUNCTION handle_order_updates()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    NEW.updated_by := auth.jwt() ->> 'email';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger for tracking updates (Drop first to avoid 'already exists' error)
DROP TRIGGER IF EXISTS trigger_on_update_order ON orders;
CREATE TRIGGER trigger_on_update_order
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION handle_order_updates();

-- 8. Add Indices for fast lookups
CREATE INDEX IF NOT EXISTS idx_orders_normalized_phone ON orders(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 9. Row Level Security (RLS)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists to allow re-creation
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON orders;
CREATE POLICY "Enable all access for authenticated users" 
ON orders FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);
