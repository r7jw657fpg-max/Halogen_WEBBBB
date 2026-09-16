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
  content TEXT
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
  ('panel_1_image_url', ''),
  ('panel_2_image_url', ''),
  ('panel_3_image_url', ''),
  ('panel_4_image_url', '');

INSERT OR IGNORE INTO pages (slug, title, content) VALUES
  ('programm', 'Programm', '<p>Hier steht bald das Programm.</p>'),
  ('anmeldung', 'Anmeldung', '<p>Hier folgt das Anmeldeformular.</p>'),
  ('produkte', 'Produkte', '<p>Hier folgen die Produkte.</p>'),
  ('weiteres', 'Weiteres', '<p>Weitere Inhalte folgen.</p>');
