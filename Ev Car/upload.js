// POST /api/upload  — admin-only image upload to R2 (binding name: MEDIA)
const b64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

async function isAdmin(token, project, email) {
  const [h, p, sig] = String(token).split('.');
  if (!sig) return false;
  const head = JSON.parse(new TextDecoder().decode(b64(h)));
  const pay = JSON.parse(new TextDecoder().decode(b64(p)));
  if (head.alg !== 'RS256') return false;
  const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com', { cf: { cacheTtl: 3600 } });
  const jwk = (await res.json()).keys.find(k => k.kid === head.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(sig), new TextEncoder().encode(h + '.' + p));
  return ok && pay.aud === project && pay.iss === 'https://securetoken.google.com/' + project &&
    pay.exp > Date.now() / 1000 && String(pay.email).toLowerCase() === email.toLowerCase();
}

export async function onRequestPost({ request, env }) {
  try {
    const project = env.FIREBASE_PROJECT || 'evcar-bd';
    const email = env.ADMIN_EMAIL || 'admin@evcar.bd';
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (!(await isAdmin(token, project, email))) return json({ error: 'Not allowed' }, 403);
    const type = (request.headers.get('Content-Type') || '').split(';')[0];
    const ext = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }[type];
    if (!ext) return json({ error: 'Only WebP, JPG or PNG images' }, 415);
    const buf = await request.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 1000000) return json({ error: 'Image must be under 1 MB' }, 413);
    const key = (env.IMG_PREFIX || 'evcar') + '/' + crypto.randomUUID() + '.' + ext;
    await env.MEDIA.put(key, buf, { httpMetadata: { contentType: type } });
    return json({ url: '/img/' + key });
  } catch (e) { return json({ error: 'Upload failed' }, 500); }
}
