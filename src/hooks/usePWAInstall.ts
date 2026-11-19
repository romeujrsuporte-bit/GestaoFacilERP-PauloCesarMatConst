import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Captura global antecipada para garantir que o evento beforeinstallprompt não seja perdido antes da montagem do React
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptSubscribers = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    promptSubscribers.forEach((cb) => cb(globalDeferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    promptSubscribers.forEach((cb) => cb(null));
  });
}

function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectIsIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isClassicIOS = /iphone|ipad|ipod/.test(ua);
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isClassicIOS || isIPadOS;
}

function detectIsAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  return /android/.test(window.navigator.userAgent.toLowerCase());
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => checkIsStandalone());
  const [isIOS] = useState<boolean>(() => detectIsIOS());
  const [isAndroid] = useState<boolean>(() => detectIsAndroid());

  useEffect(() => {
    setIsInstalled(checkIsStandalone());
    if (globalDeferredPrompt) {
      setDeferredPrompt(globalDeferredPrompt);
    }

    const handlePromptUpdate = (prompt: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(prompt);
    };
    promptSubscribers.add(handlePromptUpdate);

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        globalDeferredPrompt = null;
        setDeferredPrompt(null);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      globalDeferredPrompt = null;
      setDeferredPrompt(null);
    };

    mediaQuery.addEventListener?.('change', handleDisplayModeChange);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      promptSubscribers.delete(handlePromptUpdate);
      mediaQuery.removeEventListener?.('change', handleDisplayModeChange);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    const promptToUse = deferredPrompt || globalDeferredPrompt;
    if (!promptToUse) return false;
    await promptToUse.prompt();
    const { outcome } = await promptToUse.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      globalDeferredPrompt = null;
      setDeferredPrompt(null);
      promptSubscribers.forEach((cb) => cb(null));
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt || globalDeferredPrompt),
    isInstalled,
    isIOS,
    isAndroid,
    install,
  };
}
