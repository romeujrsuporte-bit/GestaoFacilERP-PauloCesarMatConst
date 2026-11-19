import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Smartphone, Share, PlusSquare, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'menu-item' | 'header-button' | 'dashboard-banner' | 'login-button';
  onActionComplete?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header-button',
  onActionComplete,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Quando já estiver instalado em modo standalone, nunca exibir opções de instalação
  if (isInstalled) {
    return null;
  }

  // Exibir apenas quando o navegador permitir instalação nativa (Android/Chromium) ou estiver no iOS (Safari)
  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
      onActionComplete?.();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  const renderIOSModal = () => {
    if (!showIOSGuide || typeof document === 'undefined') return null;

    return createPortal(
      <div
        className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
        onClick={() => setShowIOSGuide(false)}
      >
        <div
          className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
                <Smartphone size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 leading-tight">
                  Instalar Gestão Fácil
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Instalação no iPhone / iPad (Safari)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Fechar instruções"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-5 space-y-3 text-xs text-slate-700">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-bold">
                1
              </div>
              <div className="leading-relaxed">
                No Safari, toque no botão{' '}
                <strong className="inline-flex items-center gap-1 text-slate-900">
                  Compartilhar <Share size={13} className="text-blue-600 inline" />
                </strong>{' '}
                na barra inferior ou superior do navegador.
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold">
                2
              </div>
              <div className="leading-relaxed">
                Role a lista para baixo e toque em{' '}
                <strong className="inline-flex items-center gap-1 text-slate-900">
                  Adicionar à Tela de Início <PlusSquare size={13} className="text-emerald-600 inline" />
                </strong>
                .
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 size={15} />
              </div>
              <div className="leading-relaxed">
                Confirme tocando em <strong className="text-slate-900">Adicionar</strong> no canto superior direito para abrir o Gestão Fácil como aplicativo.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowIOSGuide(false);
              onActionComplete?.();
            }}
            className="mt-5 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-xs font-extrabold text-white shadow-xs transition-colors cursor-pointer"
          >
            Entendi
          </button>
        </div>
      </div>,
      document.body
    );
  };

  if (variant === 'menu-item') {
    return (
      <>
        <button
          type="button"
          onClick={handleInstallClick}
          className="w-full flex items-center gap-2 px-3 py-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-xl font-bold transition-colors cursor-pointer"
        >
          <Download size={15} className="text-emerald-600 shrink-0" />
          <span>Instalar Gestão Fácil</span>
        </button>
        {renderIOSModal()}
      </>
    );
  }

  if (variant === 'dashboard-banner') {
    return (
      <>
        <button
          type="button"
          onClick={handleInstallClick}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 text-white font-bold text-xs rounded-xl border border-emerald-400/50 shadow-xs transition-all cursor-pointer"
          title="Instalar o Gestão Fácil ERP na tela inicial do celular ou computador"
        >
          <Download size={15} className="text-emerald-300 shrink-0" />
          <span>Instalar Gestão Fácil</span>
        </button>
        {renderIOSModal()}
      </>
    );
  }

  if (variant === 'login-button') {
    return (
      <>
        <button
          type="button"
          onClick={handleInstallClick}
          className="w-full mt-3 py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-emerald-300 hover:text-emerald-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Download size={15} className="text-emerald-400" />
          <span>Instalar Gestão Fácil no Celular</span>
        </button>
        {renderIOSModal()}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 rounded-xl shadow-xs transition-colors cursor-pointer select-none"
        title="Instalar Gestão Fácil como aplicativo"
      >
        <Download size={14} className="shrink-0" />
        <span className="hidden sm:inline">Instalar Gestão Fácil</span>
        <span className="sm:hidden">Instalar</span>
      </button>
      {renderIOSModal()}
    </>
  );
};
