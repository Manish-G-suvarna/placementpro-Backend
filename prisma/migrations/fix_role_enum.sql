-- Migration: fix users_role enum and users table
-- 1) Drop the old enum default
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;

-- 2) Convert column to text so we can remap values freely
ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20);

-- 3) Remap old values to new ones
UPDATE users SET role = 'admin' WHERE role = 'tpo';
UPDATE users SET role = 'organizer' WHERE role = 'company';
UPDATE users SET role = 'user' WHERE role = 'student';
-- Catch any null or unknown values
UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('user', 'admin', 'organizer');

-- 4) Drop the old enum type
DROP TYPE IF EXISTS users_role CASCADE;

-- 5) Create the new enum
CREATE TYPE users_role AS ENUM ('user', 'admin', 'organizer');

-- 6) Convert column back to the new enum type
ALTER TABLE users ALTER COLUMN role TYPE users_role USING role::users_role;

-- 7) Set the default
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';

-- 8) Add new role-specific fields if they don't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS register_id VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_id VARCHAR(30);
