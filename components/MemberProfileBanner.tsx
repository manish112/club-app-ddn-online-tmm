'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { Member } from '@/lib/types';

interface Props {
  member: Member;
  onUpdated: () => void;
}

export function MemberProfileBanner({ member, onUpdated }: Props) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [intro, setIntro] = useState(member.introduction ?? '');
  const [phone, setPhone] = useState(member.phone ?? '');
  const [email, setEmail] = useState(member.email ?? '');
  const [city, setCity] = useState(member.city ?? '');
  const [saving, setSaving] = useState(false);

  const hasDetails = member.introduction || member.phone || member.email || member.city;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from('members').update({
      introduction: intro.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      city:  city.trim()  || null,
    }).eq('id', member.id);
    setSaving(false);
    setEditing(false);
    onUpdated();
  }

  function cancel() {
    setIntro(member.introduction ?? '');
    setPhone(member.phone ?? '');
    setEmail(member.email ?? '');
    setCity(member.city ?? '');
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="bg-white/10 rounded-2xl px-4 py-4 mb-5">
        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-3">
          👤 My Profile
        </p>
        <form onSubmit={save} className="space-y-2.5">
          <div>
            <label className="text-[10px] text-white/40 block mb-1">Introduction</label>
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="A short intro about yourself…"
              rows={3}
              maxLength={300}
              className="w-full bg-white/10 text-white placeholder:text-white/25 text-sm
                         rounded-xl px-3 py-2.5 border border-white/10 resize-none
                         focus:outline-none focus:ring-2 focus:ring-yellow-300/40"
            />
            <p className="text-right text-[10px] text-white/20 -mt-1">{intro.length}/300</p>
          </div>
          <div>
            <label className="text-[10px] text-white/40 block mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full bg-white/10 text-white placeholder:text-white/25 text-sm
                         rounded-xl px-3 py-2.5 border border-white/10
                         focus:outline-none focus:ring-2 focus:ring-yellow-300/40"
            />
          </div>
          <div>
            <label className="text-[10px] text-white/40 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-white/10 text-white placeholder:text-white/25 text-sm
                         rounded-xl px-3 py-2.5 border border-white/10
                         focus:outline-none focus:ring-2 focus:ring-yellow-300/40"
            />
          </div>
          <div>
            <label className="text-[10px] text-white/40 block mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Dehradun"
              className="w-full bg-white/10 text-white placeholder:text-white/25 text-sm
                         rounded-xl px-3 py-2.5 border border-white/10
                         focus:outline-none focus:ring-2 focus:ring-yellow-300/40"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-maroon-700 text-white rounded-xl py-2.5 text-sm font-semibold
                         tap-target disabled:opacity-40 active:scale-95 transition-transform"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="px-4 py-2.5 text-sm text-white/40 hover:text-white tap-target"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-white/10 rounded-2xl px-4 py-3 mb-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2">
          👤 My Profile
        </p>
        <button
          onClick={() => setEditing(true)}
          className="text-[10px] text-yellow-300/70 hover:text-yellow-200 tap-target -mt-0.5 shrink-0"
        >
          Edit
        </button>
      </div>

      {hasDetails ? (
        <div className="space-y-1.5">
          {member.introduction && (
            <p className="text-sm text-white/70 leading-relaxed italic">&ldquo;{member.introduction}&rdquo;</p>
          )}
          {member.phone && (
            <p className="text-sm text-white/80">
              <span className="text-white/35 text-xs mr-1.5">📞</span>{member.phone}
            </p>
          )}
          {member.email && (
            <p className="text-sm text-white/80">
              <span className="text-white/35 text-xs mr-1.5">✉️</span>{member.email}
            </p>
          )}
          {member.city && (
            <p className="text-sm text-white/80">
              <span className="text-white/35 text-xs mr-1.5">📍</span>{member.city}
            </p>
          )}
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm text-white/30 hover:text-white/60 transition-colors tap-target"
        >
          + Add your intro, phone, email &amp; city
        </button>
      )}
    </div>
  );
}
