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

-- 10. Create sleep_analysis table to store HypnosPy processed results
CREATE TABLE IF NOT EXISTS sleep_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- Core sleep metrics
  sleep_onset TIMESTAMPTZ,
  wake_time TIMESTAMPTZ,
  total_sleep_time_minutes REAL,
  time_in_bed_minutes REAL,
  sleep_efficiency_percent REAL,
  sleep_onset_latency_minutes REAL,
  wake_after_sleep_onset_minutes REAL,
  
  -- Sleep fragmentation
  number_of_awakenings INTEGER,
  awakening_index REAL,
  
  -- Additional metrics (stored as JSON for flexibility)
  sleep_stages JSONB,
  hourly_metrics JSONB,
  movement_metrics JSONB,
  hr_metrics JSONB,
  
  -- Processing metadata
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'error')),
  processing_error TEXT,
  processed_at TIMESTAMPTZ,
  processing_duration_seconds REAL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Create indexes for sleep_analysis
CREATE INDEX IF NOT EXISTS idx_sleep_analysis_user_id ON sleep_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_sleep_analysis_session_id ON sleep_analysis(session_id);
CREATE INDEX IF NOT EXISTS idx_sleep_analysis_sleep_onset ON sleep_analysis(sleep_onset);
CREATE INDEX IF NOT EXISTS idx_sleep_analysis_status ON sleep_analysis(processing_status);

-- 12. Enable RLS on sleep_analysis
ALTER TABLE sleep_analysis ENABLE ROW LEVEL SECURITY;

-- 13. Create RLS Policies for sleep_analysis table
CREATE POLICY "Users can view own sleep analysis"
  ON sleep_analysis FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sleep analysis"
  ON sleep_analysis FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sleep analysis"
  ON sleep_analysis FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sleep analysis"
  ON sleep_analysis FOR DELETE
  USING (auth.uid() = user_id);

-- 14. Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sleep_analysis_updated_at
  BEFORE UPDATE ON sleep_analysis
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 15. Validate sleep analysis session ownership (prevent cross-user data corruption)
CREATE OR REPLACE FUNCTION validate_sleep_analysis_session_ownership()
RETURNS TRIGGER AS $$
DECLARE
  session_owner UUID;
BEGIN
  SELECT user_id INTO session_owner FROM sessions WHERE id = NEW.session_id;
  
  IF session_owner IS NULL THEN
    RAISE EXCEPTION 'Session does not exist: %', NEW.session_id;
  END IF;
  
  IF session_owner != NEW.user_id THEN
    RAISE EXCEPTION 'Cannot attach sleep analysis to another user''s session';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_sleep_analysis_session_ownership_trigger
  BEFORE INSERT OR UPDATE ON sleep_analysis
  FOR EACH ROW
  EXECUTE FUNCTION validate_sleep_analysis_session_ownership();

-- 16. Create sleep_analysis_hypnospy table for HypnosPy algorithm results
CREATE TABLE IF NOT EXISTS sleep_analysis_hypnospy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- Core sleep metrics (same as native algorithm for comparison)
  sleep_onset TIMESTAMPTZ,
  wake_time TIMESTAMPTZ,
  total_sleep_time_minutes REAL,
  time_in_bed_minutes REAL,
  sleep_efficiency_percent REAL,
  sleep_onset_latency_minutes REAL,
  wake_after_sleep_onset_minutes REAL,
  
  -- Sleep fragmentation
  number_of_awakenings INTEGER,
  awakening_index REAL,
  
  -- HypnosPy-specific fields
  algorithm_used TEXT, -- 'cole-kripke', 'sadeh', etc.
  sleep_stages JSONB,
  hourly_metrics JSONB,
  movement_metrics JSONB,
  hr_metrics JSONB,
  hypnospy_raw_output JSONB, -- Store full HypnosPy output for debugging
  
  -- Processing metadata
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'error')),
  processing_error TEXT,
  processed_at TIMESTAMPTZ,
  processing_duration_seconds REAL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. Create indexes for sleep_analysis_hypnospy
CREATE INDEX IF NOT EXISTS idx_sleep_analysis_hypnospy_user_id ON sleep_analysis_hypnospy(user_id);
CREATE INDEX IF NOT EXISTS idx_sleep_analysis_hypnospy_session_id ON sleep_analysis_hypnospy(session_id);
CREATE INDEX IF NOT EXISTS idx_sleep_analysis_hypnospy_sleep_onset ON sleep_analysis_hypnospy(sleep_onset);
CREATE INDEX IF NOT EXISTS idx_sleep_analysis_hypnospy_status ON sleep_analysis_hypnospy(processing_status);

-- 18. Enable RLS on sleep_analysis_hypnospy
ALTER TABLE sleep_analysis_hypnospy ENABLE ROW LEVEL SECURITY;

-- 19. Create RLS Policies for sleep_analysis_hypnospy table
CREATE POLICY "Users can view own HypnosPy sleep analysis"
  ON sleep_analysis_hypnospy FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own HypnosPy sleep analysis"
  ON sleep_analysis_hypnospy FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own HypnosPy sleep analysis"
  ON sleep_analysis_hypnospy FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own HypnosPy sleep analysis"
  ON sleep_analysis_hypnospy FOR DELETE
  USING (auth.uid() = user_id);

-- 20. Add updated_at trigger for sleep_analysis_hypnospy
CREATE TRIGGER update_sleep_analysis_hypnospy_updated_at
  BEFORE UPDATE ON sleep_analysis_hypnospy
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 21. Validate HypnosPy sleep analysis session ownership
CREATE TRIGGER validate_sleep_analysis_hypnospy_session_ownership_trigger
  BEFORE INSERT OR UPDATE ON sleep_analysis_hypnospy
  FOR EACH ROW
  EXECUTE FUNCTION validate_sleep_analysis_session_ownership();

-- 22. Create daily_steps table for step counting feature
CREATE TABLE IF NOT EXISTS daily_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  total_steps INTEGER DEFAULT 0,
  walking_sessions JSONB DEFAULT '[]'::jsonb,
  distance_meters REAL,
  calories_burned REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- 23. Create indexes for daily_steps
CREATE INDEX IF NOT EXISTS idx_daily_steps_user_id ON daily_steps(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_steps_date ON daily_steps(date);
CREATE INDEX IF NOT EXISTS idx_daily_steps_user_date ON daily_steps(user_id, date);

-- 24. Enable RLS on daily_steps
ALTER TABLE daily_steps ENABLE ROW LEVEL SECURITY;

-- 25. Create RLS Policies for daily_steps table
CREATE POLICY "Users can view own daily steps"
  ON daily_steps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily steps"
  ON daily_steps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily steps"
  ON daily_steps FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own daily steps"
  ON daily_steps FOR DELETE
  USING (auth.uid() = user_id);

-- 26. Add updated_at trigger for daily_steps
CREATE TRIGGER update_daily_steps_updated_at
  BEFORE UPDATE ON daily_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Success! Your Supabase database is now configured for the Polar Sensor App with dual sleep analysis and step counting
-- Next steps:
-- 1. Verify tables were created: Check Tables tab in Supabase Dashboard
-- 2. Verify RLS is enabled: Should see 🔒 icon next to table names
-- 3. Run this updated schema in Supabase SQL Editor to add the daily_steps table
-- 4. Test by signing in to the app and syncing data
