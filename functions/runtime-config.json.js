function isServiceRoleKey(value) {
  if (typeof value !== 'string') return false;
  if (/^sb_secret_/i.test(value)) return true;
  const payload = value.split('.')[1];
  if (!payload) return false;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(atob(padded)).role === 'service_role';
  } catch {
    return false;
  }
}

export function onRequest({ request, env = {} }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const anonKey = typeof env.SUPABASE_ANON_KEY === 'string' ? env.SUPABASE_ANON_KEY : '';
  const supabaseUrl = typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL : '';
  const privateKeyDetected = isServiceRoleKey(anonKey);
  const configured = Boolean(supabaseUrl && anonKey && !privateKeyDetected);
  const body = JSON.stringify(configured
    ? { configured: true, supabaseUrl, anonKey }
    : { configured: false, ...(privateKeyDetected ? { reason: 'private-key-rejected' } : {}) });

  return new Response(request.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}
