'use client';

interface Props {
  onContinue: () => void;
  onLogin: () => void;
}

// Reminds a guest, once per browser session, that they're browsing without an
// identity — and gives a Toastmaster in this club a one-tap way back into the
// sign-in flow (MemberPicker's `identify` step) instead of hunting for the
// header's "Switch" button.
export function GuestModeModal({ onContinue, onLogin }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-modal-dark p-6">
        <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-5 sm:hidden" />

        <div className="text-3xl mb-2">👤</div>
        <p className="text-xs font-semibold text-maroon-600 dark:text-maroon-400 uppercase tracking-widest mb-1">
          Guest mode
        </p>
        <h2 className="font-serif text-xl font-semibold text-slate-900 dark:text-white mb-1">
          You&apos;re viewing as a Guest
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
          You can browse meetings and agendas, but role claiming and other member
          features are switched off. Already a Toastmaster in this club? Log in below.
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={onLogin}
            className="w-full bg-gradient-to-r from-maroon-700 to-maroon-600 hover:from-maroon-800 hover:to-maroon-700
                       text-white rounded-xl py-3 text-sm font-semibold
                       min-h-[44px] active:scale-95 transition-all shadow-sm"
          >
            Login as Toastmaster
          </button>
          <button
            onClick={onContinue}
            className="w-full py-3 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 min-h-[44px]"
          >
            Continue as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
