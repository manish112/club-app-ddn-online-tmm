import { NextRequest, NextResponse } from 'next/server';
import { UAParser } from 'ua-parser-js';
import { createServiceClient } from '@/utils/supabase/server';
import type { CaptureClientSignals } from '@/lib/types';

// Pull the client IP from the proxy headers Vercel/Next set. x-forwarded-for is
// a comma-separated list (client, proxy1, …) — the first entry is the client.
function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

function isPublicIp(ip: string | null): ip is string {
  if (!ip) return false;
  if (ip === '::1' || ip.startsWith('127.') || ip === 'localhost') return false;
  // RFC1918 / link-local / unique-local ranges have no useful geo
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return false;
  if (/^(fc|fd|fe80)/i.test(ip)) return false;
  return true;
}

// Best-effort geo lookup (ipapi.co — keyless, HTTPS, 1000/day free). Never
// throws: returns nulls on any failure so a slow, down, or rate-limited geo
// service can't block (or fail) the capture itself.
async function geoFromIp(ip: string): Promise<{ city: string | null; region: string | null; country: string | null }> {
  const empty = { city: null, region: null, country: null };
  if (!isPublicIp(ip)) return empty;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'ddn-toastmasters-app' },
    });
    clearTimeout(t);
    if (!res.ok) return empty;
    const d = await res.json();
    if (d?.error) return empty; // rate-limited / reserved IP
    return { city: d.city ?? null, region: d.region ?? null, country: d.country_name ?? null };
  } catch {
    return empty;
  }
}

export async function POST(req: NextRequest) {
  let body: CaptureClientSignals = {};
  try {
    body = (await req.json()) as CaptureClientSignals;
  } catch {
    // Empty/invalid body is fine — server-side signals are still worth recording.
  }

  const ip = clientIp(req);
  const ua = req.headers.get('user-agent') ?? '';
  const parsed = new UAParser(ua).getResult();

  const geo = ip ? await geoFromIp(ip) : { city: null, region: null, country: null };

  const row = {
    visitor_id:      body.visitorId ?? null,
    member_id:       body.memberId && body.memberId !== 'guest' ? body.memberId : null,
    ip,
    user_agent:      ua || null,
    browser:         parsed.browser.name ?? null,
    browser_version: parsed.browser.version ?? null,
    os:              parsed.os.name ?? null,
    os_version:      parsed.os.version ?? null,
    device_type:     parsed.device.type ?? 'desktop', // ua-parser leaves desktops untyped
    device_vendor:   parsed.device.vendor ?? null,
    device_model:    parsed.device.model ?? null,
    screen:          body.screen ?? null,
    timezone:        body.timezone ?? null,
    languages:       body.languages ?? null,
    city:            geo.city,
    region:          geo.region,
    country:         geo.country,
    path:            body.path ?? null,
  };

  const supabase = createServiceClient();
  const { error } = await supabase.from('device_captures').insert(row);
  if (error) {
    console.error('[capture] insert error:', error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
