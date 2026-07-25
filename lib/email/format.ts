// Server-safe date/time formatting for emails (no 'use client' deps).

export function formatDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

export function formatTime(timeStr: string): string {
  // 'HH:MM:SS' or 'HH:MM' → '7:30 PM'
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// A card showing a person's bio (profile introduction). Empty when absent.
export function bioBlock(name: string, bio: string | null | undefined): string {
  if (!bio?.trim()) return '';
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f4;border:1.5px solid #f0c5cc;border-radius:12px;margin-bottom:24px;"><tr><td style="padding:20px 24px;">
    <p style="margin:0 0 6px;color:#9d1530;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">About TM ${escapeHtml(name)}</p>
    <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">${escapeHtml(bio.trim())}</p>
  </td></tr></table>`;
}
