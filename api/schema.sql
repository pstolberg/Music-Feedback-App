-- Database schema for Music Feedback App

-- Track analysis table
CREATE TABLE IF NOT EXISTS track_analysis (
  id SERIAL PRIMARY KEY,
  track_name TEXT NOT NULL,
  analysis TEXT NOT NULL,
  audio_features JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
