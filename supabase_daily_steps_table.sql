-- Create daily_steps table for step counting feature
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)

CREATE TABLE IF NOT EXISTS public.daily_steps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_steps integer DEFAULT 0,
  walking_sessions jsonb DEFAULT '[]'::jsonb,
  distance_meters numeric DEFAULT 0,
  calories_burned numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_steps_user_date ON public.daily_steps(user_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_steps_date ON public.daily_steps(date);

-- Enable Row Level Security
ALTER TABLE public.daily_steps ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own daily steps"
  ON public.daily_steps
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily steps"
  ON public.daily_steps
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily steps"
  ON public.daily_steps
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Grant necessary permissions
GRANT ALL ON public.daily_steps TO authenticated;
GRANT ALL ON public.daily_steps TO service_role;
