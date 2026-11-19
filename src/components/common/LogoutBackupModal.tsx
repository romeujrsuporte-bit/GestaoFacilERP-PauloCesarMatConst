import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  BackupProgressState,
  BackupStepId,
  createDatabaseBackupZip,
  GeneratedBackupResult,
  triggerBackupZipDownload,
} from '../../services/firebaseBackup';

interface LogoutBackupModalProps {
  isOpen: boolean;
  onCompleteLogout: () => Promise<void> | void;
  onCancel: () => void;
}

type ModalPhase = 'running' | 'success' | 'error' | 'confirm_skip';

const ORDERED_STEPS: Array<{ id: BackupStepId; label: string }> = [
  { id: 'preparing', label: 'Preparando backup' },
  { id: 'exporting', label: 'Exportando dados' },
  { id: 'compressing', label: 'Compactando arquivos' },
  { id: 'downloading', label: 'Preparando download' },
  { id: 'completed', label: 'Backup concluído' },
];

export const LogoutBackupModal: React.FC<LogoutBackupModalProps> = ({
  isOpen,
  onCompleteLogout,
  onCancel,
}) => {
  const [phase, setPhase] = useState<ModalPhase>('running');
  const [progress, setProgress] = useState<BackupProgressState>({
    step: 'preparing',
    stepLabel: 'Preparando backup',
    percent: 5,
  });
  const [backupResult, setBackupResult] = useState<GeneratedBackupResult | null>(null);
  const [errorDetail, setErrorDetail] = useState<string>('');
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRunIdRef = useRef<number>(0);

  const clearLogoutTimer = () => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  };

  const finishLogout = async () => {
    if (isLoggingOut) return;
    clearLogoutTimer();
    setIsLoggingOut(true);
    try {
      await onCompleteLogout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const startBackupProcess = async () => {
    clearLogoutTimer();
    const runId = ++activeRunIdRef.current;

    setPhase('running');
    setBackupResult(null);
    setErrorDetail('');
    setIsLoggingOut(false);
    setProgress({
      step: 'preparing',
      stepLabel: 'Preparando backup',
      percent: 5,
      detail: 'Iniciando verificação segura de conexão...',
    });

    try {
      const result = await createDatabaseBackupZip((nextProgress) => {
        if (activeRunIdRef.current !== runId) return;
        setProgress(nextProgress);
      });

      if (activeRunIdRef.current !== runId) return;

      setBackupResult(result);
      setPhase('success');

      // Aguarda breve intervalo para garantir que o usuário visualize a confirmação e o navegador processe o download
      logoutTimerRef.current = setTimeout(() => {
        if (activeRunIdRef.current !== runId) return;
        finishLogout();
      }, 2200);
    } catch (err: unknown) {
      if (activeRunIdRef.current !== runId) return;
      const msg = err instanceof Error ? err.message : String(err || '');
      setErrorDetail(msg);
      setPhase('error');
    }
  };

  useEffect(() => {
    if (isOpen) {
      startBackupProcess();
    } else {
      activeRunIdRef.current++;
      clearLogoutTimer();
      setBackupResult(null);
      setErrorDetail('');
      setIsLoggingOut(false);
    }

    return () => {
      activeRunIdRef.current++;
      clearLogoutTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const currentStepIndex = ORDERED_STEPS.findIndex((s) => s.id === progress.step);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between gap-3 ${
            phase === 'error' || phase === 'confirm_skip'
              ? 'bg-rose-50 border-rose-200'
              : phase === 'success'
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-slate-900 border-slate-800 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                phase === 'error' || phase === 'confirm_skip'
                  ? 'bg-rose-100 text-rose-600'
                  : phase === 'success'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {phase === 'running' && <DatabaseBackup size={20} />}
              {phase === 'success' && <CheckCircle2 size={20} />}
              {(phase === 'error' || phase === 'confirm_skip') && <AlertTriangle size={20} />}
            </div>

            <div>
              <h3
                className={`font-extrabold text-sm ${
                  phase === 'running' ? 'text-white' : 'text-slate-900'
                }`}
              >
                {phase === 'running' && 'Backup Automático antes de Sair'}
                {phase === 'success' && 'Backup Concluído com Sucesso'}
                {phase === 'error' && 'Falha ao Realizar o Backup'}
                {phase === 'confirm_skip' && 'Confirmar Saída sem Backup'}
              </h3>
              <p
                className={`text-[11px] font-medium ${
                  phase === 'running' ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                Gestão Fácil ERP • Proteção de Dados (Somente Leitura)
              </p>
            </div>
          </div>

          {phase !== 'running' && phase !== 'success' && !isLoggingOut && (
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-colors cursor-pointer"
              title="Cancelar e permanecer no sistema"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Corpo */}
        <div className="p-5 space-y-4">
          {phase === 'running' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-950 font-medium leading-relaxed flex items-start gap-2.5">
                <Loader2 size={18} className="text-blue-600 shrink-0 mt-0.5 animate-spin" />
                <span>
                  Preparando backup dos dados do Gestão Fácil ERP. Aguarde enquanto realizamos a exportação antes de encerrar sua sessão.
                </span>
              </div>

              {/* Barra de Progresso */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">{progress.stepLabel}</span>
                  <span className="font-mono font-extrabold text-blue-600">{progress.percent}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-200"
                    style={{ width: `${Math.max(4, Math.min(100, progress.percent))}%` }}
                  />
                </div>
                {progress.detail && (
                  <p className="text-[11px] text-slate-500 truncate">{progress.detail}</p>
                )}
              </div>

              {/* Etapas */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                {ORDERED_STEPS.map((step, idx) => {
                  const isDone = idx < currentStepIndex || progress.step === 'completed';
                  const isCurrent = idx === currentStepIndex && progress.step !== 'completed';
                  return (
                    <div
                      key={step.id}
                      className={`flex items-center gap-2 text-xs ${
                        isDone
                          ? 'text-emerald-700 font-bold'
                          : isCurrent
                          ? 'text-blue-700 font-bold'
                          : 'text-slate-400 font-medium'
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      ) : isCurrent ? (
                        <Loader2 size={14} className="text-blue-600 shrink-0 animate-spin" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-slate-300 inline-block shrink-0" />
                      )}
                      <span>{step.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 justify-center pt-1">
                <ShieldCheck size={13} className="text-emerald-600" />
                <span>Exportação somente leitura do Cloud Firestore em formato ZIP padrão.</span>
              </div>
            </>
          )}

          {phase === 'success' && (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-950 font-semibold leading-relaxed flex items-start gap-2.5">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Backup realizado com sucesso! O arquivo de segurança foi gerado e o download foi iniciado. Sua sessão será encerrada.
                </span>
              </div>

              {backupResult && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Archive size={14} className="text-indigo-600" />
                      Arquivo gerado:
                    </span>
                    <span className="font-mono font-bold text-slate-800 text-[11px] truncate max-w-[260px]" title={backupResult.fileName}>
                      {backupResult.fileName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 font-medium">Registros exportados:</span>
                    <span className="font-mono font-extrabold text-emerald-700">
                      {backupResult.info.totalGeralRegistros} registro(s) em {backupResult.info.colecoesExportadas.length} arquivos
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                {backupResult && (
                  <button
                    type="button"
                    onClick={() => triggerBackupZipDownload(backupResult.zipBlob, backupResult.fileName)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Baixar Novamente</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={finishLogout}
                  className="ml-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isLoggingOut ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Encerrando Sessão...</span>
                    </>
                  ) : (
                    <>
                      <LogOut size={14} />
                      <span>Encerrar Sessão Agora</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {phase === 'error' && (
            <>
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-rose-900 leading-relaxed">
                  Não foi possível realizar o backup dos dados. Verifique sua conexão com a internet e tente novamente.
                </p>
                {errorDetail && (
                  <p className="text-[11px] text-rose-700/90 font-mono break-words bg-white/70 px-2.5 py-1.5 rounded-lg border border-rose-200/80">
                    {errorDetail}
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-3.5 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={() => setPhase('confirm_skip')}
                  className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={14} />
                  <span>Sair sem realizar o backup</span>
                </button>

                <button
                  type="button"
                  onClick={startBackupProcess}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={14} />
                  <span>Tentar novamente</span>
                </button>
              </div>
            </>
          )}

          {phase === 'confirm_skip' && (
            <>
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-1.5 text-xs text-amber-950">
                <p className="font-extrabold">
                  Confirmação explícita necessária
                </p>
                <p className="leading-relaxed">
                  Tem certeza de que deseja encerrar sua sessão sem gerar o arquivo de backup? Nenhum arquivo ZIP de segurança será baixado nesta saída.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={() => setPhase('error')}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Voltar
                </button>

                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={finishLogout}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isLoggingOut ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Encerrando...</span>
                    </>
                  ) : (
                    <>
                      <LogOut size={14} />
                      <span>Confirmar Saída sem Backup</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
