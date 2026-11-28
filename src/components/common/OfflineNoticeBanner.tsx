import React, { useEffect, useState } from 'react';
import { WifiOff, Database as DatabaseIcon } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { FirebaseSyncService, FirebaseSyncStatus } from '../../services/firebaseSync';
import { Database } from '../../services/db';

export const OfflineNoticeBanner: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [syncStatus, setSyncStatus] = useState<FirebaseSyncStatus>(() => FirebaseSyncService.getStatus());
  const [dismissedSizeWarning, setDismissedSizeWarning] = useState(false);

  useEffect(() => {
    return FirebaseSyncService.subscribe((next) => {
      setSyncStatus(next);
    });
  }, []);

  const hasPendingOrFailed = syncStatus.pendingCount > 0 || syncStatus.failedCount > 0;

  // 1. Dispositivo sem internet
  if (!isOnline) {
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
            {hasPendingOrFailed ? ` • ${syncStatus.pendingCount + syncStatus.failedCount} pendência(s) na fila` : ''}
          </p>
          <p className="text-[11px] text-amber-50 leading-snug">
            Alterações ficam salvas apenas neste dispositivo e serão sincronizadas automaticamente com o Firebase ao reconectar.
          </p>
        </div>
      </div>
    );
  }

  // 2. Alerta preventivo para Admin/Gerente caso o documento centralizado se aproxime do limite de 1 MB
  if (
    syncStatus.documentSizeWarning &&
    !dismissedSizeWarning &&
    Database.isSessionAuthenticated() &&
    Database.isManagerOrAdminUser()
  ) {
    const kb = Math.round(syncStatus.estimatedPayloadBytes / 1024);
    return (
      <div
        role="status"
        className="fixed bottom-4 right-4 z-[115] w-[calc(100%-2rem)] max-w-md bg-amber-50 text-amber-950 px-4 py-3 rounded-2xl shadow-lg border border-amber-300 flex items-start gap-3"
      >
        <div className="w-8 h-8 rounded-xl bg-amber-200/80 flex items-center justify-center shrink-0 mt-0.5">
          <DatabaseIcon size={16} className="text-amber-800" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold leading-snug">
            Uso elevado do documento Firestore ({syncStatus.documentSizePercent}% • {kb} KB / 1024 KB)
          </p>
          <p className="text-[11px] text-amber-800 leading-snug mt-0.5">
            O banco centralizado está próximo do limite de 1 MB por documento. Planeje o arquivamento ou particionamento em subcoleções.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissedSizeWarning(true)}
          className="text-xs font-bold text-amber-700 hover:text-amber-950 px-1.5 py-0.5 cursor-pointer"
        >
          OK
        </button>
      </div>
    );
  }

  return null;
};
