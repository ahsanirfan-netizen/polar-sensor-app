-- Supabase Database Schema for Polar Sensor App
-- Run this SQL in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- 1. Create sessions table to track recording sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  device_name TEXT,
  session_mode TEXT, -- 'standard' or 'sdk'
  ppi_enabled BOOLEAN DEFAULT false,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  total_records INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create sensor_readings table (mirrors local SQLite schema)
CREATE TABLE IF NOT EXISTS sensor_readings (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  ppg INTEGER,
  acc_x REAL,
  acc_y REAL,
  acc_z REAL,
  gyro_x REAL,
  gyro_y REAL,
  gyro_z REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sensor_readings_user_id ON sensor_readings(user_id);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_session_id ON sensor_readings(session_id);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_timestamp ON sensor_readings(timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies for sessions table
-- Users can only see their own sessions
CREATE POLICY "Users can view own sessions"
  ON sessions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own sessions
CREATE POLICY "Users can insert own sessions"
  ON sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own sessions
CREATE POLICY "Users can update own sessions"
  ON sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own sessions
CREATE POLICY "Users can delete own sessions"
  ON sessions FOR DELETE
  USING (auth.uid() = user_id);

-- 6. Create RLS Policies for sensor_readings table
-- Users can only see their own sensor readings
CREATE POLICY "Users can view own sensor readings"
  ON sensor_readings FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own sensor readings
CREATE POLICY "Users can insert own sensor readings"
  ON sensor_readings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own sensor readings
CREATE POLICY "Users can update own sensor readings"
  ON sensor_readings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own sensor readings
CREATE POLICY "Users can delete own sensor readings"
  ON sensor_readings FOR DELETE
  USING (auth.uid() = user_id);

-- 7. Create a function to validate session ownership (prevents cross-user data attacks)
CREATE OR REPLACE FUNCTION validate_session_ownership()
RETURNS TRIGGER AS $$
DECLARE
  session_owner UUID;
BEGIN
  SELECT user_id INTO session_owner FROM sessions WHERE id = NEW.session_id;
  
  IF session_owner IS NULL THEN
    RAISE EXCEPTION 'Session does not exist: %', NEW.session_id;
  END IF;
  
  IF session_owner != NEW.user_id THEN
    RAISE EXCEPTION 'Cannot attach sensor readings to another user''s session';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce session ownership on INSERT and UPDATE
DROP TRIGGER IF EXISTS validate_session_ownership_trigger ON sensor_readings;
CREATE TRIGGER validate_session_ownership_trigger
  BEFORE INSERT OR UPDATE ON sensor_readings
  FOR EACH ROW
  EXECUTE FUNCTION validate_session_ownership();

-- 8. Create a function to automatically update session stats
CREATE OR REPLACE FUNCTION update_session_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE sessions
    SET total_records = total_records + 1
    WHERE id = NEW.session_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE sessions
    SET total_records = GREATEST(0, total_records - 1)
    WHERE id = OLD.session_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND NEW.session_id != OLD.session_id THEN
    UPDATE sessions
    SET total_records = GREATEST(0, total_records - 1)
    WHERE id = OLD.session_id;
    UPDATE sessions
    SET total_records = total_records + 1
    WHERE id = NEW.session_id;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Create trigger to auto-update session stats
DROP TRIGGER IF EXISTS update_session_stats_trigger ON sensor_readings;
CREATE TRIGGER update_session_stats_trigger
  AFTER INSERT OR DELETE OR UPDATE ON sensor_readings
  FOR EACH ROW
  EXECUTE FUNCTION update_session_stats();

-- Success! Your Supabase database is now configured for the Polar Sensor App
-- Next steps:
-- 1. Verify tables were created: Check Tables tab in Supabase Dashboard
-- 2. Verify RLS is enabled: Should see 🔒 icon next to table names
-- 3. Test by signing in to the app and syncing data
