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
      const { title, content } = await request.json();
      await env.DB.prepare(
        "INSERT INTO pages (slug, title, content) VALUES (?, ?, ?) ON CONFLICT(slug) DO UPDATE SET title = excluded.title, content = excluded.content"
      ).bind(slug, title, content).run();
      return json({ ok: true });
    }

    if (url.pathname === "/api/admin/upload" && request.method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file) return json({ error: "keine Datei" }, 400);
      const key = `${Date.now()}-${file.name}`;
      await env.BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
      });
      // Öffentliche URL setzt einen mit R2 verbundenen Custom Domain / öffentlichen Bucket voraus
      return json({ ok: true, key, url: `/media/${key}` });
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
