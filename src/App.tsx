import React, { useState, useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { PosView } from './components/pos/PosView';
import { ExternalSalesView } from './components/externalSales/ExternalSalesView';
import { OrdersView } from './components/orders/OrdersView';
import { SalesReportsView } from './components/orders/SalesReportsView';
import { SalesReturnsView } from './components/sales/SalesReturnsView';
import { ProductsView } from './components/products/ProductsView';
import { CrmView } from './components/crm/CrmView';
import { StockLocationsView } from './components/stock/StockLocationsView';
import { ProductionView } from './components/production/ProductionView';
import { PricingView } from './components/pricing/PricingView';
import { PurchasesView } from './components/purchases/PurchasesView';
import { FinancialView } from './components/financial/FinancialView';
import { ExcelToolsView } from './components/excel/ExcelToolsView';
import { ReportsView } from './components/reports/ReportsView';
import { ExpeditionView } from './components/expedition/ExpeditionView';
import { SettingsView } from './components/settings/SettingsView';
import { GlobalShortcutsModal } from './components/common/GlobalShortcutsModal';
import { CommandPaletteModal } from './components/common/CommandPaletteModal';
import { LeavePosWarningModal, LeaveWarningMode } from './components/common/LeavePosWarningModal';
import { LogoutBackupModal } from './components/common/LogoutBackupModal';
import { ToastContainer } from './components/common/ToastContainer';
import { OfflineNoticeBanner } from './components/common/OfflineNoticeBanner';
import { InitialCompanySetupModal } from './components/common/InitialCompanySetupModal';
import { LoginView } from './components/auth/LoginView';
import { OrderItem } from './types';
import { Database } from './services/db';
import { FirebaseSyncService } from './services/firebaseSync';
import { toast } from './services/toast';
import { onFirebaseAuthStateChanged, logoutFirebase } from './services/firebase';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Database.isSessionAuthenticated();
  });
  const [currentModule, setCurrentModule] = useState<string>(() => {
    return Database.getDefaultModuleForCurrentUser();
  });
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [sidebarMinimized, setSidebarMinimized] = useState<boolean>(() => {
    return localStorage.getItem('omni_sidebar_minimized') === 'true';
  });
  const [hideDashboardKpis, setHideDashboardKpis] = useState<boolean>(() => {
    return localStorage.getItem('omni_hide_dashboard_kpis') === 'true';
  });
  const [, setDbVersion] = useState(0);
  const currentCompany = Database.getCurrentCompany();

  // Carrinhos mantidos no nível superior para detectar venda/pedido em andamento (PDV, Pedido de Venda e Vendas Mobile)
  const [posCart, setPosCart] = useState<OrderItem[]>([]);
  const [ordersCart, setOrdersCart] = useState<OrderItem[]>([]);
  const [externalSalesCart, setExternalSalesCart] = useState<OrderItem[]>([]);
  const [showLeavePosWarningModal, setShowLeavePosWarningModal] = useState<boolean>(false);
  const [leaveModalMode, setLeaveModalMode] = useState<LeaveWarningMode>('active_sale');
  const [pendingNavigationModule, setPendingNavigationModule] = useState<string | null>(null);
  const [salesReturnOrderId, setSalesReturnOrderId] = useState<string | undefined>(undefined);
  const [stockMovementsOptions, setStockMovementsOptions] = useState<{
    onlyCriticalStock: boolean;
    companyId?: string;
    triggerKey: number;
  }>({ onlyCriticalStock: false, triggerKey: 0 });
  const [isLogoutBackupOpen, setIsLogoutBackupOpen] = useState<boolean>(false);

  const isOrdersModule = (mod: string) =>
    mod === 'orders' ||
    mod === 'orders_quotes' ||
    mod === 'orders_history' ||
    mod === 'orders_history_profit';

  const getActiveSaleCart = (mod: string): OrderItem[] => {
    if (mod === 'pos') return posCart;
    if (isOrdersModule(mod)) return ordersCart;
    if (mod === 'external_sales') return externalSalesCart;
    return [];
  };

  const activeSaleCart = getActiveSaleCart(currentModule);
  const moduleHistoryStackRef = useRef<string[]>(isAuthenticated ? [currentModule] : []);
  const isPoppingModuleRef = useRef<boolean>(false);
  const isBackNavigationConfirmRef = useRef<boolean>(false);
  const backExitReleasedRef = useRef<boolean>(false);
  const hasHistoryGuardRef = useRef<boolean>(false);
  const isIgnoringPopstateRef = useRef<boolean>(false);
  const isLeaveModalOpenRef = useRef<boolean>(false);
  const activeSaleStateRef = useRef({
    isAuthenticated,
    currentModule,
    cartLength: activeSaleCart.length,
  });

  useEffect(() => {
    isLeaveModalOpenRef.current = showLeavePosWarningModal;
  }, [showLeavePosWarningModal]);

  useEffect(() => {
    activeSaleStateRef.current = {
      isAuthenticated,
      currentModule,
      cartLength: activeSaleCart.length,
    };
  }, [isAuthenticated, currentModule, activeSaleCart.length]);

  useEffect(() => {
    if (!isAuthenticated) {
      moduleHistoryStackRef.current = [];
      isPoppingModuleRef.current = false;
      isBackNavigationConfirmRef.current = false;
      backExitReleasedRef.current = false;
      setShowLeavePosWarningModal(false);
      setPendingNavigationModule(null);
      setLeaveModalMode('active_sale');
      return;
    }

    backExitReleasedRef.current = false;

    if (isPoppingModuleRef.current) {
      isPoppingModuleRef.current = false;
      return;
    }

    const stack = moduleHistoryStackRef.current;
    if (stack.length === 0) {
      moduleHistoryStackRef.current = [currentModule];
      return;
    }

    if (stack[stack.length - 1] !== currentModule) {
      if (
        (Database.isExternalSeller() || Database.isBalconista()) &&
        stack.length === 1 &&
        stack[0] === 'dashboard'
      ) {
        moduleHistoryStackRef.current = [currentModule];
      } else {
        const nextStack = [...stack, currentModule];
        moduleHistoryStackRef.current = nextStack.length > 30 ? nextStack.slice(-30) : nextStack;
      }
    }
  }, [isAuthenticated, currentModule]);

  const handleStartReturnForOrder = (orderId: string) => {
    setSalesReturnOrderId(orderId);
    setCurrentModule('sales_returns');
  };

  // Modais Globais de Produtividade
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);
  const [showCommandPalette, setShowCommandPalette] = useState<boolean>(false);
  const [showMatrizSetupModal, setShowMatrizSetupModal] = useState<boolean>(() => {
    return Database.isSessionAuthenticated() && Database.isAdmin() && Database.isNeedsMatrizSetup();
  });

  // Callback ao autenticar no sistema
  const handleLoginSuccess = () => {
    const initialMod = Database.getDefaultModuleForCurrentUser();
    moduleHistoryStackRef.current = [initialMod];
    backExitReleasedRef.current = false;
    setIsAuthenticated(true);
    setCurrentModule(initialMod);
    if (initialMod === 'pos') {
      setSidebarMinimized(true);
      setHideDashboardKpis(true);
    }
    if (Database.isAdmin() && Database.isNeedsMatrizSetup()) {
      setShowMatrizSetupModal(true);
    }
  };

  const handleRequestLogout = () => {
    setIsLogoutBackupOpen(true);
  };

  const handleCompleteLogout = async () => {
    try {
      await logoutFirebase();
      toast.info('Sessão encerrada com sucesso.');
    } finally {
      setIsLogoutBackupOpen(false);
    }
  };

  // Navegação central com proteção contra perda de dados no PDV
  const navigateTo = (
    targetModule: string,
    options?: { onlyCriticalStock?: boolean; companyId?: string }
  ) => {
    if (targetModule === 'stock_movements') {
      setStockMovementsOptions((prev) => ({
        onlyCriticalStock: Boolean(options?.onlyCriticalStock),
        companyId: options?.companyId,
        triggerKey: prev.triggerKey + 1,
      }));
    }
    if (targetModule === currentModule) return;

    // Regra solicitada: Vendedor Externo Mobile tem como tela inicial "Vendas Mobile"
    if (Database.isExternalSeller() && targetModule === 'dashboard') {
      if (currentModule !== 'external_sales') {
        setCurrentModule('external_sales');
      }
      return;
    }

    // Regra solicitada: Balconista de PDV não terá acesso nem visualizará a tela inicial atual (Dashboard com faturamento)
    // A tela inicial do Balconista é o PDV Balcão
    if (Database.isBalconista() && targetModule === 'dashboard') {
      toast.warning(
        'Acesso restrito: o perfil "Balconista de PDV" tem como tela inicial o PDV Balcão e não possui acesso aos indicadores gerais de faturamento da empresa.',
        'Tela Inicial: PDV Balcão'
      );
      if (currentModule !== 'pos') {
        setCurrentModule('pos');
      }
      return;
    }

    // Regra solicitada: Menus do Sistema e Limpeza de Dados são exclusivos do usuário 'admin'; Configurações ('settings') também é acessível ao Gerente Geral
    if (!Database.isAdmin() && (targetModule === 'settings_menus' || targetModule === 'settings_cleanup')) {
      toast.error(
        'Acesso restrito: apenas o usuário "admin" tem permissão para acessar os menus do sistema e a limpeza de dados.',
        'Permissão Insuficiente'
      );
      return;
    }
    if (!Database.isAdmin() && !Database.isGerente() && targetModule === 'settings') {
      toast.error(
        'Acesso restrito: apenas o Administrador ou Gerente Geral tem permissão para acessar este módulo de configurações.',
        'Permissão Insuficiente'
      );
      return;
    }

    // Checagem de permissões granulares definidas pelo admin para este usuário
    if (!Database.isAdmin()) {
      const permModule = targetModule === 'orders_history_profit' ? 'orders_history' : targetModule;
      const isAllowedSub = Database.isSubItemAllowedForCurrentUser(permModule);
      const isAllowedSec = Database.isMenuSectionAllowedForCurrentUser(permModule);
      if ((!isAllowedSub && !isAllowedSec && targetModule !== 'dashboard') || (targetModule === 'orders_history_profit' && !Database.canCurrentUserView('grossProfit'))) {
        toast.error(
          'Acesso restrito: seu perfil de usuário não possui permissão concedida pelo administrador para utilizar este recurso.',
          'Módulo Bloqueado'
        );
        return;
      }
    }

    // Se o usuário iniciou uma venda/pedido (pelo menos 1 item no carrinho no PDV, Pedido de Venda ou Vendas Mobile) e tenta sair da tela:
    if (activeSaleCart.length > 0) {
      isBackNavigationConfirmRef.current = false;
      setLeaveModalMode('active_sale');
      setPendingNavigationModule(targetModule);
      setShowLeavePosWarningModal(true);
      return;
    }

    setCurrentModule(targetModule);
  };

  const handleConfirmLeavePos = () => {
    const wasActiveSale = leaveModalMode === 'active_sale';
    if (wasActiveSale) {
      if (currentModule === 'pos') {
        setPosCart([]);
      } else if (isOrdersModule(currentModule)) {
        setOrdersCart([]);
      } else if (currentModule === 'external_sales') {
        setExternalSalesCart([]);
      }
    }

    setShowLeavePosWarningModal(false);
    setLeaveModalMode('active_sale');

    if (pendingNavigationModule === '__browser_back__') {
      isBackNavigationConfirmRef.current = false;
      setPendingNavigationModule(null);
      backExitReleasedRef.current = true;
      hasHistoryGuardRef.current = false;
      if (window.history.state?.erpBackGuard) {
        isIgnoringPopstateRef.current = true;
        window.history.back();
        window.setTimeout(() => {
          isIgnoringPopstateRef.current = false;
        }, 150);
      }
      toast.info(
        wasActiveSale
          ? 'Pedido descartado. Pressione Voltar novamente se desejar sair do aplicativo.'
          : 'Saída liberada. Pressione Voltar novamente se desejar fechar o aplicativo.'
      );
    } else if (pendingNavigationModule) {
      const targetMod = pendingNavigationModule;
      if (isBackNavigationConfirmRef.current) {
        isBackNavigationConfirmRef.current = false;
        isPoppingModuleRef.current = true;
        const stack = moduleHistoryStackRef.current;
        const targetIdx = stack.lastIndexOf(targetMod);
        moduleHistoryStackRef.current = targetIdx >= 0 ? stack.slice(0, targetIdx + 1) : [targetMod];
      }
      setCurrentModule(targetMod);
      setPendingNavigationModule(null);
    } else {
      isBackNavigationConfirmRef.current = false;
    }
  };

  const handleCancelLeavePos = () => {
    isBackNavigationConfirmRef.current = false;
    setShowLeavePosWarningModal(false);
    setPendingNavigationModule(null);
    setLeaveModalMode('active_sale');
  };

  // Alerta nativo de fechamento/recarregamento da página se houver venda/pedido em andamento
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isAuthenticated && activeSaleCart.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAuthenticated, activeSaleCart.length]);

  // Intercepta o botão "Voltar" inferior do celular / navegador (popstate) em qualquer tela do sistema
  useEffect(() => {
    if (isAuthenticated && activeSaleCart.length > 0) {
      backExitReleasedRef.current = false;
    }

    const shouldGuard = isAuthenticated && !backExitReleasedRef.current;

    if (shouldGuard && !hasHistoryGuardRef.current) {
      hasHistoryGuardRef.current = true;
      window.history.pushState({ erpBackGuard: true }, '', window.location.href);
    } else if (!shouldGuard && hasHistoryGuardRef.current) {
      hasHistoryGuardRef.current = false;
      if (window.history.state?.erpBackGuard) {
        isIgnoringPopstateRef.current = true;
        window.history.back();
        window.setTimeout(() => {
          isIgnoringPopstateRef.current = false;
        }, 150);
      }
    }
  }, [isAuthenticated, currentModule, activeSaleCart.length]);

  useEffect(() => {
    const handlePopState = () => {
      if (isIgnoringPopstateRef.current) {
        isIgnoringPopstateRef.current = false;
        return;
      }

      const { isAuthenticated: authed, currentModule: activeMod, cartLength } = activeSaleStateRef.current;
      if (!authed || backExitReleasedRef.current) {
        hasHistoryGuardRef.current = false;
        return;
      }

      // Re-insere o estado de proteção imediatamente para impedir saída sem confirmação mesmo em toques repetidos
      hasHistoryGuardRef.current = true;
      window.history.pushState({ erpBackGuard: true }, '', window.location.href);

      // Se o modal de confirmação já estiver visível, apenas mantém a proteção ativa
      if (isLeaveModalOpenRef.current) {
        return;
      }

      const stack = moduleHistoryStackRef.current;
      let prevMod: string | null = null;
      for (let i = stack.length - 2; i >= 0; i--) {
        const candidate = stack[i];
        if (!candidate || candidate === activeMod) continue;
        if ((Database.isExternalSeller() || Database.isBalconista()) && candidate === 'dashboard') continue;
        prevMod = candidate;
        break;
      }

      const nextMode: LeaveWarningMode = cartLength > 0 ? 'active_sale' : 'back_navigation';
      if (prevMod) {
        isBackNavigationConfirmRef.current = true;
        setPendingNavigationModule(prevMod);
      } else {
        isBackNavigationConfirmRef.current = false;
        setPendingNavigationModule('__browser_back__');
      }
      setLeaveModalMode(nextMode);
      setShowLeavePosWarningModal(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleToggleSidebarMinimize = () => {
    setSidebarMinimized((prev) => {
      const next = !prev;
      localStorage.setItem('omni_sidebar_minimized', String(next));
      return next;
    });
  };

  const handleToggleDashboardKpis = () => {
    setHideDashboardKpis((prev) => {
      const next = !prev;
      localStorage.setItem('omni_hide_dashboard_kpis', String(next));
      return next;
    });
  };

  useEffect(() => {
    // Carregar dados locais imediatos e escutar mudanças reativas
    Database.load();
    const unsubscribe = Database.subscribe(() => {
      setDbVersion((v) => v + 1);
      const authenticated = Database.isSessionAuthenticated();
      setIsAuthenticated(authenticated);
      if (authenticated && Database.isExternalSeller()) {
        setCurrentModule((prev) => (prev === 'dashboard' ? 'external_sales' : prev));
      }
      if (authenticated && Database.isBalconista()) {
        setCurrentModule((prev) => (prev === 'dashboard' ? 'pos' : prev));
      }
      if (authenticated && Database.isAdmin() && Database.isNeedsMatrizSetup()) {
        setShowMatrizSetupModal(true);
      }
    });

    // Escuta alterações de autenticação em tempo real no Firebase
    const unsubscribeAuth = onFirebaseAuthStateChanged((user) => {
      if (user) {
        setIsAuthenticated(true);
        if (Database.isExternalSeller(user)) {
          setCurrentModule('external_sales');
        } else if (Database.isBalconista(user)) {
          setCurrentModule('pos');
          setSidebarMinimized(true);
          setHideDashboardKpis(true);
        }
      } else {
        setIsAuthenticated(false);
      }
    });

    // Inicialização da sincronização centralizada em tempo real com o Firebase Firestore
    // Conecta Realtime onSnapshot, reconcilia dados e sincroniza alterações em nuvem
    const cleanupFirebaseSync = FirebaseSyncService.init();

    return () => {
      unsubscribe();
      unsubscribeAuth();
      cleanupFirebaseSync();
    };
  }, []);

  // SISTEMA DE ATALHOS GLOBAIS DE TECLADO
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Se a confirmação de saída do PDV, a paleta ou modal de atalhos estiver aberta, Esc fecha
      if (e.key === 'Escape') {
        if (showLeavePosWarningModal) {
          handleCancelLeavePos();
          return;
        }
        if (showCommandPalette) {
          setShowCommandPalette(false);
          return;
        }
        if (showShortcutsModal) {
          setShowShortcutsModal(false);
          return;
        }
      }

      // Ctrl + K ou Cmd + K abre a Paleta de Comandos
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
        return;
      }

      // Alt + M alterna minimização do menu lateral
      if (e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        handleToggleSidebarMinimize();
        return;
      }

      // F1 abre o Guia de Atalhos
      if (e.key === 'F1') {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
        return;
      }

      // Atalho de interrogação (?) fora de campos de texto
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === '?' && !isTyping && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShowShortcutsModal(true);
        return;
      }

      // F12: Quantidade Fracionada no PDV Balcão (impede DevTools do navegador)
      if (e.key === 'F12') {
        e.preventDefault();
        if (currentModule !== 'pos') {
          navigateTo('pos');
        }
        return;
      }

      // F2: Se fora do PDV, abre o PDV Balcão diretamente
      // (Se já estiver no PDV, o próprio PosView executa o modal de consulta F2)
      if (e.key === 'F2') {
        if (currentModule !== 'pos') {
          e.preventDefault();
          navigateTo('pos');
        }
      }
      // F3: Pedido de Venda & Orçamentos (fora do PDV)
      else if (e.key === 'F3') {
        if (currentModule !== 'pos') {
          e.preventDefault();
          navigateTo('orders');
        }
      }
      // F4: Catálogo de Produtos e Preços (fora do PDV)
      else if (e.key === 'F4') {
        if (currentModule !== 'pos') {
          e.preventDefault();
          navigateTo('products');
        }
      }
      // F6: Financeiro (Fluxo de Caixa / Contas)
      else if (e.key === 'F6') {
        e.preventDefault();
        navigateTo('cash_flow');
      }
      // F7: Vendas Mobile
      else if (e.key === 'F7') {
        e.preventDefault();
        navigateTo('external_sales');
      }
      // F8: Clientes & CRM
      else if (e.key === 'F8') {
        e.preventDefault();
        navigateTo('customers');
      }
      // F9: Histórico de Vendas / Pedidos Faturados (fora do PDV)
      else if (e.key === 'F9') {
        if (currentModule !== 'pos') {
          e.preventDefault();
          navigateTo('orders_history');
        }
      }
      // F10: Tela Inicial (PDV Balcão para Balconista; Dashboard para outros perfis)
      else if (e.key === 'F10') {
        e.preventDefault();
        navigateTo(Database.getDefaultModuleForCurrentUser());
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [currentModule, showCommandPalette, showShortcutsModal, showLeavePosWarningModal, posCart.length, ordersCart.length, externalSalesCart.length]);

  // Ao abrir o PDV Balcão, ocultar o Dashboard Informativo e minimizar o menu para apenas ícones
  useEffect(() => {
    if (currentModule === 'pos') {
      setSidebarMinimized(true);
      setHideDashboardKpis(true);
    }
  }, [currentModule]);

  const renderModule = () => {
    // Verificação de segurança: se o usuário for vendedor externo e tentar visualizar dashboard, substituir por Vendas Mobile
    if (Database.isExternalSeller() && currentModule === 'dashboard') {
      return (
        <ExternalSalesView
          onStartReturn={handleStartReturnForOrder}
          onNavigate={navigateTo}
          cart={externalSalesCart}
          setCart={setExternalSalesCart}
        />
      );
    }

    // Verificação de segurança: se o usuário for balconista e tentar visualizar dashboard, substituir por PDV Balcão
    if (Database.isBalconista() && currentModule === 'dashboard') {
      return (
        <PosView
          isSidebarMinimized={sidebarMinimized}
          onToggleSidebarMinimize={handleToggleSidebarMinimize}
          hideDashboardKpis={hideDashboardKpis}
          onToggleDashboardKpis={handleToggleDashboardKpis}
          cart={posCart}
          setCart={setPosCart}
        />
      );
    }

    // Verificação de segurança: Menus do Sistema e Limpeza de Dados exclusivos do Admin; Configurações acessível ao Admin e Gerente Geral
    if (!Database.isAdmin()) {
      if (
        currentModule === 'settings_menus' ||
        currentModule === 'settings_cleanup' ||
        (currentModule === 'settings' && !Database.isGerente())
      ) {
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 min-h-[60vh]">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 border border-amber-200">
              <Lock size={26} />
            </div>
            <h2 className="text-base font-bold text-slate-800">Acesso Restrito ao Administrador</h2>
            <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
              {currentModule === 'settings_menus' || currentModule === 'settings_cleanup'
                ? 'Apenas o usuário "admin" tem autorização para acessar Menus do Sistema e Limpeza de Dados.'
                : 'Apenas o usuário "admin" ou "Gerente Geral" tem autorização para acessar as configurações de empresas, usuários e auditoria.'}
            </p>
            <button
              onClick={() => setCurrentModule(Database.getDefaultModuleForCurrentUser())}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Voltar ao Início
            </button>
          </div>
        );
      }

      const permModule =
        currentModule === 'orders_history_profit'
          ? 'orders_history'
          : currentModule === 'settings_labels'
          ? 'settings_printer'
          : currentModule;
      const isAllowedSub = Database.isSubItemAllowedForCurrentUser(permModule);
      const isAllowedSec = Database.isMenuSectionAllowedForCurrentUser(permModule);
      if ((!isAllowedSub && !isAllowedSec && currentModule !== 'dashboard') || (currentModule === 'orders_history_profit' && !Database.canCurrentUserView('grossProfit'))) {
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 min-h-[60vh]">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 border border-amber-200">
              <Lock size={26} />
            </div>
            <h2 className="text-base font-bold text-slate-800">Recurso Bloqueado pelo Administrador</h2>
            <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
              Seu perfil de usuário não possui permissão concedida pelo administrador para visualizar ou utilizar este menu/módulo.
            </p>
            <button
              onClick={() => setCurrentModule(Database.getDefaultModuleForCurrentUser())}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Voltar ao Início
            </button>
          </div>
        );
      }
    }

    switch (currentModule) {
      case 'dashboard':
        return <DashboardView onNavigate={navigateTo} />;
      case 'pos':
        return (
          <PosView
            isSidebarMinimized={sidebarMinimized}
            onToggleSidebarMinimize={handleToggleSidebarMinimize}
            hideDashboardKpis={hideDashboardKpis}
            onToggleDashboardKpis={handleToggleDashboardKpis}
            cart={posCart}
            setCart={setPosCart}
          />
        );
      case 'external_sales':
        return (
          <ExternalSalesView
            onStartReturn={handleStartReturnForOrder}
            onNavigate={navigateTo}
            cart={externalSalesCart}
            setCart={setExternalSalesCart}
          />
        );
      case 'orders':
        return (
          <OrdersView
            initialMode="novo_pedido"
            initialDocType="venda"
            onStartReturn={handleStartReturnForOrder}
            cart={ordersCart}
            setCart={setOrdersCart}
          />
        );
      case 'orders_quotes':
        return (
          <OrdersView
            initialMode="novo_pedido"
            initialDocType="orcamento"
            onStartReturn={handleStartReturnForOrder}
            cart={ordersCart}
            setCart={setOrdersCart}
          />
        );
      case 'orders_history':
        return (
          <OrdersView
            initialMode="historico"
            onStartReturn={handleStartReturnForOrder}
            cart={ordersCart}
            setCart={setOrdersCart}
          />
        );
      case 'orders_history_profit':
        return (
          <OrdersView
            initialMode="historico"
            initialShowProfit={true}
            onStartReturn={handleStartReturnForOrder}
            cart={ordersCart}
            setCart={setOrdersCart}
          />
        );
      case 'sales_returns':
        return (
          <SalesReturnsView
            initialOrderId={salesReturnOrderId}
            onNavigate={(mod) => {
              setSalesReturnOrderId(undefined);
              navigateTo(mod);
            }}
          />
        );
      case 'sales_reports':
        return <SalesReportsView />;
      case 'products':
        return <ProductsView />;
      case 'customers':
        return <CrmView initialSubTab="clientes" />;
      case 'suppliers':
        return <CrmView initialSubTab="fornecedores" />;
      case 'stock_locations':
        return <StockLocationsView initialSubTab="locais" />;
      case 'stock_transfers':
        return <StockLocationsView initialSubTab="transferencias" />;
      case 'inventory':
        return <StockLocationsView initialSubTab="inventario" />;
      case 'stock_movements':
        return (
          <StockLocationsView
            initialSubTab="movimentacoes"
            initialOnlyCriticalStock={stockMovementsOptions.onlyCriticalStock}
            initialCompanyFilter={stockMovementsOptions.companyId}
            criticalTriggerKey={stockMovementsOptions.triggerKey}
          />
        );
      case 'bom_composition':
        return <ProductionView initialSubTab="composicao" initialCompositionSubTab="ficha" />;
      case 'components_catalog':
        return <ProductionView initialSubTab="composicao" initialCompositionSubTab="componentes" />;
      case 'production_orders':
        return <ProductionView initialSubTab="ordens" />;
      case 'delivery_manifests':
        return <ExpeditionView initialTab="romaneios" />;
      case 'delivery_routes':
        return <ExpeditionView initialTab="rotas" initialRouteSubTab="rotas" />;
      case 'delivery_drivers':
        return <ExpeditionView initialTab="motoristas" />;
      case 'delivery_vehicles':
        return <ExpeditionView initialTab="veiculos" />;
      case 'delivery_market_areas':
        return <ExpeditionView initialTab="rotas" initialRouteSubTab="pracas" />;
      case 'delivery_neighborhoods':
        return <ExpeditionView initialTab="rotas" initialRouteSubTab="bairros" />;
      case 'delivery_cities':
        return <ExpeditionView initialTab="rotas" initialRouteSubTab="cidades" />;
      case 'delivery_states':
        return <ExpeditionView initialTab="rotas" initialRouteSubTab="estados" />;
      case 'expedition_reports':
        return <ExpeditionView initialTab="relatorios" />;
      case 'expedicao':
        return <ExpeditionView initialTab="romaneios" />;
      case 'pricing_calculator':
        return <PricingView initialSubTab="individual" />;
      case 'batch_pricing':
        return <PricingView initialSubTab="em_lote" />;
      case 'purchases':
        return <PurchasesView onNavigateHome={() => navigateTo(Database.getDefaultModuleForCurrentUser())} />;
      case 'purchases_nfe':
        return <PurchasesView initialOpenNfeModal={true} onNavigateHome={() => navigateTo(Database.getDefaultModuleForCurrentUser())} />;
      case 'financial':
      case 'cash_flow':
        return <FinancialView initialSubTab="fluxo_caixa" />;
      case 'accounts_receivable':
        return <FinancialView initialSubTab="contas_receber" />;
      case 'accounts_payable':
        return <FinancialView initialSubTab="contas_pagar" />;
      case 'customer_vouchers':
        return <FinancialView initialSubTab="vales" />;
      case 'chart_of_accounts':
        return <FinancialView initialSubTab="plano_contas" />;
      case 'dre_gerencial':
        return <FinancialView initialSubTab="dre_gerencial" />;
      case 'cash_register':
        return <FinancialView initialSubTab="caixa_pdv" />;
      case 'payment_methods':
        return <FinancialView initialSubTab="formas_pagamento" />;
      case 'financial_accounts':
        return <FinancialView initialSubTab="contas_bancarias" />;
      case 'payment_terms':
        return <FinancialView initialSubTab="prazos_pagamento" />;
      case 'financial_reports':
        return <FinancialView initialSubTab="relatorios" />;
      case 'excel_tools':
        return <ExcelToolsView onNavigateHome={() => navigateTo(Database.getDefaultModuleForCurrentUser())} />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return <SettingsView initialTab="empresas" />;
      case 'settings_menus':
        return <SettingsView initialTab="menus" />;
      case 'settings_printer':
        return <SettingsView initialTab="impressora" />;
      case 'settings_labels':
        return <SettingsView initialTab="etiquetas" />;
      case 'settings_preferences':
        return <SettingsView initialTab="preferencias" />;
      case 'settings_cleanup':
        return <SettingsView initialTab="limpeza" />;
      default:
        if (Database.isBalconista()) {
          return (
            <PosView
              isSidebarMinimized={sidebarMinimized}
              onToggleSidebarMinimize={handleToggleSidebarMinimize}
              hideDashboardKpis={hideDashboardKpis}
              onToggleDashboardKpis={handleToggleDashboardKpis}
              cart={posCart}
              setCart={setPosCart}
            />
          );
        }
        return <DashboardView onNavigate={navigateTo} />;
    }
  };

  if (!isAuthenticated) {
    return (
      <>
        <LoginView onLoginSuccess={handleLoginSuccess} />
        <ToastContainer />
        <OfflineNoticeBanner />
      </>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900 ${currentModule === 'pos' ? 'h-screen overflow-hidden' : ''}`}>
      {/* Barra de Navegação Superior */}
      <Header
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        sidebarOpen={sidebarOpen}
        onNavigate={navigateTo}
        currentModule={currentModule}
        onOpenShortcuts={() => setShowShortcutsModal(true)}
        onOpenCommandPalette={() => setShowCommandPalette(true)}
        onRequestLogout={handleRequestLogout}
      />

      {/* Conteúdo Principal com Barra Lateral */}
      <div className={`flex-1 flex min-h-0 ${currentModule === 'pos' ? 'h-[calc(100vh-4rem)] overflow-hidden' : ''}`}>
        <Sidebar
          currentModule={currentModule}
          onNavigate={navigateTo}
          isOpen={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
          isMinimized={sidebarMinimized}
          onToggleMinimize={handleToggleSidebarMinimize}
          onRequestLogout={handleRequestLogout}
        />

        {/* Área Central de Visualização dos Módulos */}
        <main
          key={`main-content-${currentModule}-${currentCompany.id}`}
          className={`flex-1 w-full mx-auto ${
            currentModule === 'pos'
              ? 'p-2 sm:p-2.5 pb-14 sm:pb-16 max-w-[1700px] h-full overflow-hidden flex flex-col min-h-0'
              : currentModule === 'orders' || currentModule === 'orders_quotes'
              ? 'p-2 sm:p-3 max-w-[1700px] overflow-x-clip'
              : currentModule === 'external_sales'
              ? 'p-0 sm:py-3 max-w-md mx-auto overflow-x-clip min-h-screen'
              : 'p-3 sm:p-5 lg:p-6 max-w-7xl overflow-x-clip'
          }`}
        >
          {renderModule()}
        </main>
      </div>

      {/* SISTEMA GLOBAL DE NOTIFICAÇÕES TOAST */}
      <ToastContainer />
      <OfflineNoticeBanner />

      {/* ALERTA DE SEGURANÇA: VENDA/PEDIDO EM ANDAMENTO E CONFIRMAÇÃO DO BOTÃO VOLTAR DO CELULAR */}
      <LeavePosWarningModal
        isOpen={showLeavePosWarningModal}
        mode={leaveModalMode}
        cart={activeSaleCart}
        sourceModule={currentModule}
        targetModuleName={pendingNavigationModule}
        onConfirmLeave={handleConfirmLeavePos}
        onCancelLeave={handleCancelLeavePos}
      />

      {/* MODAL: GUIA COMPLETO DE ATALHOS GLOBAIS DE TECLADO [F1] */}
      <GlobalShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
        onNavigate={navigateTo}
        onOpenCommandPalette={() => {
          setShowShortcutsModal(false);
          setShowCommandPalette(true);
        }}
      />

      {/* MODAL: PALETA DE COMANDOS GLOBAL [CTRL + K] */}
      <CommandPaletteModal
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onNavigate={navigateTo}
        onOpenShortcuts={() => {
          setShowCommandPalette(false);
          setShowShortcutsModal(true);
        }}
      />

      {/* MODAL: CONFIGURAÇÃO INICIAL DA EMPRESA MATRIZ APÓS RESTAURAÇÃO DE FÁBRICA */}
      <InitialCompanySetupModal
        isOpen={isAuthenticated && Database.isAdmin() && showMatrizSetupModal}
        onSuccess={() => setShowMatrizSetupModal(false)}
      />

      {/* MODAL: BACKUP AUTOMÁTICO DO BANCO DE DADOS ANTES DO LOGOUT */}
      <LogoutBackupModal
        isOpen={isLogoutBackupOpen}
        onCompleteLogout={handleCompleteLogout}
        onCancel={() => setIsLogoutBackupOpen(false)}
      />
    </div>
  );
}
