import Image from 'next/image';
import type { Member, LeadershipRole } from '@/lib/types';
import { LEADERSHIP_ROLES, hasLeadershipRole } from '@/lib/types';

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

const CONTACT_ROLE_ORDER: LeadershipRole[] = ['president', 'vp_education', 'vp_membership', 'secretary', 'vp_pr'];

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

interface Props {
  members: Member[];
}

export function SiteFooter({ members }: Props) {
  // Pair each contact role with the member who holds it, keeping the role so the
  // label reflects the searched role (a member may hold several roles).
  const contacts = CONTACT_ROLE_ORDER
    .map((role) => {
      const m = members.find((mm) => mm.active && hasLeadershipRole(mm, role));
      return m ? { m, role } : null;
    })
    .filter((c): c is { m: Member; role: LeadershipRole } => !!c);

  const roleLabel = (role: LeadershipRole) =>
    LEADERSHIP_ROLES.find((r) => r.value === role)?.label ?? role;

  return (
    <footer className="bg-navy-900 dark:bg-slate-950 border-t border-white/10 mt-8 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Venue */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">Venue</p>
          <p className="text-sm font-medium text-white/80">💻 Online</p>
          <p className="text-xs text-white/40 mt-0.5">
            Meeting link will be shared on your registered email 6 hours before the meeting
          </p>
        </div>

        {/* Contacts */}
        {contacts.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">Contact us</p>
            <div className="space-y-3">
              {contacts.map(({ m, role }) => {
                const showPhone = m.show_phone_in_contact && !!m.phone;
                const label = roleLabel(role);
                const subtitle = showPhone ? `${label} · ${m.phone}` : label;

                if (showPhone) {
                  return (
                    <a
                      key={`${m.id}-${role}`}
                      href={waLink(m.phone!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 group"
                    >
                      <WhatsAppIcon />
                      <div>
                        <p className="text-sm font-medium text-white/80 group-hover:text-green-400 transition-colors">
                          TM {m.display_name}
                        </p>
                        <p className="text-xs text-white/40">{subtitle}</p>
                      </div>
                    </a>
                  );
                }

                return (
                  <div key={`${m.id}-${role}`} className="flex items-center gap-3">
                    <WhatsAppIcon />
                    <div>
                      <p className="text-sm font-medium text-white/80">TM {m.display_name}</p>
                      <p className="text-xs text-white/40">{subtitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Attribution */}
        <div className="border-t border-white/10 pt-5 space-y-2">
          <a
            href="https://kedarneuralchains.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 group"
          >
            <span className="text-xs text-white/30 group-hover:text-white/50 transition-colors">
              ♥ made in dehradun by
            </span>
            <Image
              src="/knc-logo.png"
              alt="Kedar Neural Chains"
              width={80}
              height={24}
              className="h-5 w-auto opacity-30 group-hover:opacity-60 transition-opacity"
            />
          </a>
          <p className="text-xs text-white/30 text-center">further developed by TM Manish Singh</p>
        </div>

      </div>
    </footer>
  );
}
