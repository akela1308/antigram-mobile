-- ─── HIGHLIGHTS ─────────────────────────────────────────────
-- Избранные фото в верхней ленте профиля

CREATE TABLE IF NOT EXISTS highlights (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  moment_id  UUID REFERENCES moments(id) ON DELETE CASCADE NOT NULL,
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, moment_id)
);

ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own highlights" ON highlights
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public can view highlights" ON highlights
  FOR SELECT USING (true);

-- ─── ALBUMS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS albums (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title      TEXT NOT NULL,
  cover_url  TEXT,
  is_public  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own albums" ON albums
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public can view public albums" ON albums
  FOR SELECT USING (is_public = true OR auth.uid() = user_id);

-- ─── ALBUM_MOMENTS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS album_moments (
  album_id   UUID REFERENCES albums(id) ON DELETE CASCADE NOT NULL,
  moment_id  UUID REFERENCES moments(id) ON DELETE CASCADE NOT NULL,
  added_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (album_id, moment_id)
);

ALTER TABLE album_moments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own album_moments" ON album_moments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM albums WHERE id = album_id AND user_id = auth.uid())
  );

CREATE POLICY "Public can view album_moments" ON album_moments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM albums
      WHERE id = album_id AND (is_public = true OR user_id = auth.uid())
    )
  );
