// GET /img/<key>  — serves images from R2 (binding name: MEDIA)
export async function onRequestGet({ params, env }) {
  const key = [].concat(params.path || []).join('/');
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, { headers: {
    'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable'
  } });
}
