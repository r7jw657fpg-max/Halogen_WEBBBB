-- Einfacher Key/Value-Speicher für globale Inhalte
-- (Hero-Bild-URL, Panel-Titel, Panel-Links, Vereinstext, ...)
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Inhalte der vier Unterseiten (Programm, Anmeldung, Produkte, Weiteres)
CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  image_url TEXT DEFAULT ''
);

-- Mitgliedsanmeldungen von der Anmeldungsseite. Die community_* Spalten
-- bleiben leer, bis sich ein Mitglied (jederzeit später) für den
-- Community-Bereich aktiviert.
CREATE TABLE IF NOT EXISTS memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  joined_date TEXT NOT NULL,
  accepted_statutes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  password_hash TEXT DEFAULT '',
  community_opt_in INTEGER NOT NULL DEFAULT 0,
  contact_visible INTEGER NOT NULL DEFAULT 0,
  bio TEXT DEFAULT '',
  social_link TEXT DEFAULT ''
);

-- Events für die Programm-Seite
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  event_date TEXT NOT NULL,
  event_time TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

-- Login-Sessions für den Community-Bereich (Token im Cookie, hier nachgeschlagen)
CREATE TABLE IF NOT EXISTS member_sessions (
  token TEXT PRIMARY KEY,
  member_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Agenda-Einträge, die Mitglieder im Community-Bereich selbst posten
CREATE TABLE IF NOT EXISTS community_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  event_date TEXT DEFAULT '',
  event_time TEXT DEFAULT '',
  link TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

-- Startwerte
INSERT OR IGNORE INTO site_content (key, value) VALUES
  ('hero_image_url', ''),
  ('panel_1_label', 'Programm'),
  ('panel_1_link', '/programm/'),
  ('panel_2_label', 'Anmeldung'),
  ('panel_2_link', '/anmeldung/'),
  ('panel_3_label', 'Produkte'),
  ('panel_3_link', '/produkte/'),
  ('panel_4_label', 'Weiteres'),
  ('panel_4_link', '/weiteres/'),
  ('panel_5_label', 'Community'),
  ('panel_5_link', '/community/'),
  ('panel_1_image_url', ''),
  ('panel_2_image_url', ''),
  ('panel_3_image_url', ''),
  ('panel_4_image_url', ''),
  ('panel_5_image_url', '');

INSERT OR IGNORE INTO pages (slug, title, content) VALUES
  ('programm', 'Programm', '<p>Hier steht bald das Programm.</p>'),
  ('anmeldung', 'Anmeldung', '<p>Hier folgt das Anmeldeformular.</p>'),
  ('produkte', 'Produkte', '<p>Hier folgen die Produkte.</p>'),
  ('weiteres', 'Weiteres', '<p>Weitere Inhalte folgen.</p>');
