export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- Admin-Bereich & Admin-API: per Basic Auth geschützt ---
    if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/admin")) {
      const authResponse = checkBasicAuth(request, env);
      if (authResponse) return authResponse;
    }

    // --- Öffentliche Content-API (lesend) ---
    if (url.pathname === "/api/content" && request.method === "GET") {
      const rows = await env.DB.prepare("SELECT key, value FROM site_content").all();
      const content = {};
      for (const row of rows.results) content[row.key] = row.value;
      return json(content);
    }

    if (url.pathname.startsWith("/api/pages/") && request.method === "GET") {
      const slug = url.pathname.split("/").pop();
      const row = await env.DB.prepare("SELECT * FROM pages WHERE slug = ?").bind(slug).first();
      if (!row) return json({ error: "not found" }, 404);
      return json(row);
    }

    // --- Öffentliche Event-Liste (Programm-Seite) ---
    if (url.pathname === "/api/events" && request.method === "GET") {
      const rows = await env.DB.prepare("SELECT * FROM events ORDER BY event_date ASC, event_time ASC").all();
      return json(rows.results);
    }

    // --- Admin-API (schreibend, bereits durch Basic Auth oben geschützt) ---
    if (url.pathname === "/api/admin/content" && request.method === "POST") {
      const body = await request.json();
      const stmts = Object.entries(body).map(([key, value]) =>
        env.DB.prepare("INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, String(value))
      );
      await env.DB.batch(stmts);
      return json({ ok: true });
    }

    if (url.pathname.startsWith("/api/admin/pages/") && request.method === "POST") {
      const slug = url.pathname.split("/").pop();
      const { title, content, image_url } = await request.json();
      await env.DB.prepare(
        "INSERT INTO pages (slug, title, content, image_url) VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET title = excluded.title, content = excluded.content, image_url = excluded.image_url"
      ).bind(slug, title, content, image_url || "").run();
      return json({ ok: true });
    }

    // --- Admin: Events (Programm-Seite) ---
    if (url.pathname === "/api/admin/events" && request.method === "POST") {
      const { title, description, event_date, event_time, tags, image_url } = await request.json();
      if (!title || !event_date) return json({ error: "Titel und Datum sind erforderlich" }, 400);
      await env.DB.prepare(
        "INSERT INTO events (title, description, event_date, event_time, tags, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(title, description || "", event_date, event_time || "", tags || "", image_url || "", new Date().toISOString()).run();
      return json({ ok: true });
    }

    if (url.pathname.startsWith("/api/admin/events/") && request.method === "PUT") {
      const id = url.pathname.split("/").pop();
      const { title, description, event_date, event_time, tags, image_url } = await request.json();
      if (!title || !event_date) return json({ error: "Titel und Datum sind erforderlich" }, 400);
      await env.DB.prepare(
        "UPDATE events SET title=?, description=?, event_date=?, event_time=?, tags=?, image_url=? WHERE id=?"
      ).bind(title, description || "", event_date, event_time || "", tags || "", image_url || "", id).run();
      return json({ ok: true });
    }

    if (url.pathname.startsWith("/api/admin/events/") && request.method === "DELETE") {
      const id = url.pathname.split("/").pop();
      await env.DB.prepare("DELETE FROM events WHERE id=?").bind(id).run();
      return json({ ok: true });
    }

    // --- Öffentliche Mitgliedsanmeldung ---
    if (url.pathname === "/api/anmeldung" && request.method === "POST") {
      const { name, email, accepted } = await request.json();
      if (!name || !email || !accepted) {
        return json({ error: "Name, E-Mail und Zustimmung zu den Statuten sind erforderlich" }, 400);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "Ungültige E-Mail-Adresse" }, 400);
      }
      const joinedDate = new Date().toISOString().slice(0, 10);
      await env.DB.prepare(
        "INSERT INTO memberships (name, email, joined_date, accepted_statutes, created_at) VALUES (?, ?, ?, 1, ?)"
      ).bind(String(name).slice(0, 200), String(email).slice(0, 200), joinedDate, new Date().toISOString()).run();
      return json({ ok: true, joinedDate });
    }

    // --- Admin: Mitgliederliste ---
    if (url.pathname === "/api/admin/memberships" && request.method === "GET") {
      const rows = await env.DB.prepare("SELECT * FROM memberships ORDER BY created_at DESC").all();
      return json(rows.results);
    }

    // --- Community-Bereich: Zugang aktivieren, Login, Logout ---
    // Aktivierung setzt ein Passwort für eine bereits bestehende Mitgliedschaft
    // (aus der Anmeldung) und kann jederzeit später erfolgen.
    if (url.pathname === "/api/community/activate" && request.method === "POST") {
      const { email, password, bio, social_link, contact_visible } = await request.json();
      if (!email || !password || password.length < 6) {
        return json({ error: "E-Mail und ein Passwort mit mindestens 6 Zeichen sind erforderlich" }, 400);
      }
      const member = await env.DB.prepare("SELECT * FROM memberships WHERE email = ?").bind(email).first();
      if (!member) {
        return json({ error: "Diese E-Mail ist nicht als Vereinsmitglied registriert. Bitte zuerst über die Anmeldung Mitglied werden." }, 404);
      }
      const hash = await hashPassword(password);
      await env.DB.prepare(
        "UPDATE memberships SET password_hash=?, community_opt_in=1, contact_visible=?, bio=?, social_link=? WHERE id=?"
      ).bind(hash, contact_visible ? 1 : 0, bio || "", social_link || "", member.id).run();

      const token = await createSession(env, member.id);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookieHeader(token, request) },
      });
    }

    if (url.pathname === "/api/community/login" && request.method === "POST") {
      const { email, password } = await request.json();
      const genericError = () => json({ error: "E-Mail oder Passwort falsch" }, 401);
      if (!email || !password) return genericError();
      const member = await env.DB.prepare(
        "SELECT * FROM memberships WHERE email = ? AND community_opt_in = 1"
      ).bind(email).first();
      if (!member || !(await verifyPassword(password, member.password_hash))) return genericError();

      const token = await createSession(env, member.id);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookieHeader(token, request) },
      });
    }

    if (url.pathname === "/api/community/logout" && request.method === "POST") {
      const token = getCookie(request, "halogen_session");
      if (token) await env.DB.prepare("DELETE FROM member_sessions WHERE token = ?").bind(token).run();
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookieHeader() },
      });
    }

    // --- Community-Bereich: eigenes Profil ---
    if (url.pathname === "/api/community/me" && request.method === "GET") {
      const member = await getSessionMember(request, env);
      if (!member) return json({ error: "Nicht eingeloggt" }, 401);
      const { password_hash, ...safe } = member;
      return json(safe);
    }

    if (url.pathname === "/api/community/me" && request.method === "PUT") {
      const member = await getSessionMember(request, env);
      if (!member) return json({ error: "Nicht eingeloggt" }, 401);
      const { bio, social_link, contact_visible, password } = await request.json();
      if (password) {
        if (password.length < 6) return json({ error: "Passwort muss mindestens 6 Zeichen haben" }, 400);
        const hash = await hashPassword(password);
        await env.DB.prepare(
          "UPDATE memberships SET bio=?, social_link=?, contact_visible=?, password_hash=? WHERE id=?"
        ).bind(bio || "", social_link || "", contact_visible ? 1 : 0, hash, member.id).run();
      } else {
        await env.DB.prepare(
          "UPDATE memberships SET bio=?, social_link=?, contact_visible=? WHERE id=?"
        ).bind(bio || "", social_link || "", contact_visible ? 1 : 0, member.id).run();
      }
      return json({ ok: true });
    }

    // --- Community-Bereich: Mitgliederverzeichnis (nur für eingeloggte Mitglieder) ---
    if (url.pathname === "/api/community/members" && request.method === "GET") {
      const member = await getSessionMember(request, env);
      if (!member) return json({ error: "Nicht eingeloggt" }, 401);
      const rows = await env.DB.prepare(
        "SELECT name, bio, social_link FROM memberships WHERE community_opt_in = 1 AND contact_visible = 1 ORDER BY name COLLATE NOCASE"
      ).all();
      return json(rows.results);
    }

    // --- Community-Bereich: Agenda-Posts (nur für eingeloggte Mitglieder) ---
    if (url.pathname === "/api/community/posts" && request.method === "GET") {
      const member = await getSessionMember(request, env);
      if (!member) return json({ error: "Nicht eingeloggt" }, 401);
      const rows = await env.DB.prepare(
        "SELECT p.*, m.name as author_name FROM community_posts p JOIN memberships m ON m.id = p.member_id ORDER BY (p.event_date = ''), p.event_date ASC, p.created_at DESC"
      ).all();
      return json(rows.results);
    }

    if (url.pathname === "/api/community/posts" && request.method === "POST") {
      const member = await getSessionMember(request, env);
      if (!member) return json({ error: "Nicht eingeloggt" }, 401);
      const { title, description, event_date, event_time, link } = await request.json();
      if (!title) return json({ error: "Titel ist erforderlich" }, 400);
      await env.DB.prepare(
        "INSERT INTO community_posts (member_id, title, description, event_date, event_time, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(member.id, title, description || "", event_date || "", event_time || "", link || "", new Date().toISOString()).run();
      return json({ ok: true });
    }

    if (url.pathname.startsWith("/api/community/posts/") && request.method === "PUT") {
      const member = await getSessionMember(request, env);
      if (!member) return json({ error: "Nicht eingeloggt" }, 401);
      const id = url.pathname.split("/").pop();
      const existing = await env.DB.prepare("SELECT * FROM community_posts WHERE id = ?").bind(id).first();
      if (!existing || existing.member_id !== member.id) return json({ error: "Nicht gefunden oder keine Berechtigung" }, 403);
      const { title, description, event_date, event_time, link } = await request.json();
      if (!title) return json({ error: "Titel ist erforderlich" }, 400);
      await env.DB.prepare(
        "UPDATE community_posts SET title=?, description=?, event_date=?, event_time=?, link=? WHERE id=?"
      ).bind(title, description || "", event_date || "", event_time || "", link || "", id).run();
      return json({ ok: true });
    }

    if (url.pathname.startsWith("/api/community/posts/") && request.method === "DELETE") {
      const member = await getSessionMember(request, env);
      if (!member) return json({ error: "Nicht eingeloggt" }, 401);
      const id = url.pathname.split("/").pop();
      const existing = await env.DB.prepare("SELECT * FROM community_posts WHERE id = ?").bind(id).first();
      if (!existing || existing.member_id !== member.id) return json({ error: "Nicht gefunden oder keine Berechtigung" }, 403);
      await env.DB.prepare("DELETE FROM community_posts WHERE id=?").bind(id).run();
      return json({ ok: true });
    }

    if (url.pathname === "/api/admin/upload" && request.method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file) return json({ error: "keine Datei" }, 400);
      const key = `${Date.now()}-${sanitizeFilename(file.name)}`;
      await env.BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
      });
      // Öffentliche URL setzt einen mit R2 verbundenen Custom Domain / öffentlichen Bucket voraus
      return json({ ok: true, key, url: `/media/${key}` });
    }

    // --- Multipart-Upload für schwere Dateien (umgeht das ~100MB-Request-Limit) ---
    if (url.pathname === "/api/admin/upload/create" && request.method === "POST") {
      const { filename, contentType } = await request.json();
      if (!filename) return json({ error: "kein Dateiname" }, 400);
      const key = `${Date.now()}-${sanitizeFilename(filename)}`;
      const upload = await env.BUCKET.createMultipartUpload(key, {
        httpMetadata: { contentType: contentType || "application/octet-stream" },
      });
      return json({ key: upload.key, uploadId: upload.uploadId });
    }

    if (url.pathname === "/api/admin/upload/part" && request.method === "PUT") {
      const key = url.searchParams.get("key");
      const uploadId = url.searchParams.get("uploadId");
      const partNumber = parseInt(url.searchParams.get("partNumber"), 10);
      if (!key || !uploadId || !partNumber) return json({ error: "fehlende Parameter" }, 400);
      const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);
      const part = await upload.uploadPart(partNumber, request.body);
      return json({ etag: part.etag, partNumber });
    }

    if (url.pathname === "/api/admin/upload/complete" && request.method === "POST") {
      const { key, uploadId, parts } = await request.json();
      if (!key || !uploadId || !parts?.length) return json({ error: "fehlende Parameter" }, 400);
      const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);
      await upload.complete(parts);
      return json({ ok: true, key, url: `/media/${key}` });
    }

    if (url.pathname === "/api/admin/upload/abort" && request.method === "POST") {
      const { key, uploadId } = await request.json();
      if (!key || !uploadId) return json({ error: "fehlende Parameter" }, 400);
      const upload = env.BUCKET.resumeMultipartUpload(key, uploadId);
      await upload.abort();
      return json({ ok: true });
    }

    if (url.pathname.startsWith("/media/") && request.method === "GET") {
      const key = url.pathname.replace("/media/", "");
      const object = await env.BUCKET.get(key);
      if (!object) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      return new Response(object.body, { headers });
    }

    // --- Alles andere: statische Dateien aus /public ---
    return env.ASSETS.fetch(request);
  },
};

// Macht Dateinamen URL- und CSS-url()-sicher: Leerzeichen, Klammern, Umlaute
// & Co. haben schon Hero-Bilder unsichtbar gemacht (kaputtes CSS url(...)
// bzw. Mismatch zwischen gespeichertem Key und angefragtem Pfad).
function sanitizeFilename(name) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return cleaned || "datei";
}

// --- Community-Auth: Passwort-Hashing (PBKDF2 via Web Crypto) & Sessions ---
async function pbkdf2Hex(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password) {
  const salt = crypto.randomUUID().replace(/-/g, "");
  const hash = await pbkdf2Hex(password, salt);
  return `${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const computed = await pbkdf2Hex(password, salt);
  return computed === hash;
}

async function createSession(env, memberId) {
  const token = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await env.DB.prepare(
    "INSERT INTO member_sessions (token, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(token, memberId, now.toISOString(), expires.toISOString()).run();
  return token;
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function getSessionMember(request, env) {
  const token = getCookie(request, "halogen_session");
  if (!token) return null;
  const session = await env.DB.prepare(
    "SELECT * FROM member_sessions WHERE token = ? AND expires_at > ?"
  ).bind(token, new Date().toISOString()).first();
  if (!session) return null;
  return env.DB.prepare("SELECT * FROM memberships WHERE id = ?").bind(session.member_id).first();
}

function sessionCookieHeader(token, request) {
  const isHttps = new URL(request.url).protocol === "https:";
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
  return `halogen_session=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}` + (isHttps ? "; Secure" : "");
}

function clearSessionCookieHeader() {
  return `halogen_session=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function checkBasicAuth(request, env) {
  const auth = request.headers.get("Authorization");
  const expected = "Basic " + btoa(`${env.ADMIN_USER}:${env.ADMIN_PASS}`);
  if (auth !== expected) {
    return new Response("Zugriff verweigert", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Halogen Admin"' },
    });
  }
  return null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
