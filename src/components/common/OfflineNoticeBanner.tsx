import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const OfflineNoticeBanner: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] w-[calc(100%-2rem)] max-w-lg bg-amber-600 text-white px-4 py-3 rounded-2xl shadow-xl border border-amber-400/60 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200"
    >
      <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
        <WifiOff size={18} className="text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold leading-snug">
          Sem conexão com a internet
        </p>
        <p className="text-[11px] text-amber-50 leading-snug">
          É necessário estar conectado à internet para utilizar os recursos e sincronizar os dados do sistema.
        </p>
      </div>
    </div>
  );
};
