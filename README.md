# Video Chat - Participant Site

A browser-based video chat application for 2 participants with split-screen layout and DartConnect integration.

## Setup Instructions

### 1. Supabase Configuration

1. Create a Supabase account at https://supabase.com
2. Create a new project
3. In `config.js`, replace:
   - `YOUR_SUPABASE_URL` with your Supabase project URL
   - `YOUR_SUPABASE_ANON_KEY` with your Supabase anon key

### 2. Database Schema

Run these SQL commands in your Supabase SQL editor:

```sql
-- Create rooms table
CREATE TABLE rooms (
  id BIGSERIAL PRIMARY KEY,
  room_code VARCHAR(10) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Create spectators table
CREATE TABLE spectators (
  id BIGSERIAL PRIMARY KEY,
  room_code VARCHAR(10) NOT NULL REFERENCES rooms(room_code),
  spectator_token VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- Enable RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE spectators ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "rooms_select_all" ON rooms FOR SELECT USING (true);
CREATE POLICY "rooms_insert_all" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "rooms_update_all" ON rooms FOR UPDATE USING (true);

CREATE POLICY "spectators_select_all" ON spectators FOR SELECT USING (true);
CREATE POLICY "spectators_insert_all" ON spectators FOR INSERT WITH CHECK (true);
```

### 3. Deploy to GitHub Pages

1. Create a GitHub repository named `participants-videochat`
2. Clone locally: `git clone https://github.com/YOUR_USERNAME/participants-videochat.git`
3. Copy all files from this folder to the repo
4. Push to GitHub: `git push origin main`
5. In GitHub repo settings, enable GitHub Pages with `main` branch

## Features

- 2-person video chat with WebRTC
- Split-screen layout (video left, DartConnect right)
- Room codes for easy joining
- Spectator link generation with 24-hour expiry
- Free STUN servers for NAT traversal
- Real-time presence and signaling via Supabase

## Browser Support

- Chrome/Edge 75+
- Firefox 68+
- Safari 12.1+
