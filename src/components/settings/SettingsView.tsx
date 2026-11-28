import React, { useState, useEffect, useMemo } from 'react';
import {
  Settings,
  Building2,
  Users,
  Shield,
  History,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  Plus,
  Edit2,
  Printer,
  Sliders,
  AlertTriangle,
  Eye,
  EyeOff,
  Bell,
  Check,
  LayoutGrid,
  CheckSquare,
  Square,
  Home,
  ShoppingCart,
  FolderOpen,
  ShoppingBag,
  Warehouse,
  Boxes,
  Calculator,
  CircleDollarSign,
  BarChart3,
  FileSpreadsheet,
  Search,
  X,
  ArrowRight,
  Sparkles,
  Lock,
  Truck,
  Database as DatabaseIcon,
  KeyRound,
  ShieldCheck,
  TrendingUp,
  DollarSign,
  Percent,
  Unlock,
  Trash2,
  Mail,
  Tag,
  RefreshCw,
  Wrench,
  Link2,
} from 'lucide-react';
import {
  Database,
  DEFAULT_ROLE_MENU_SECTIONS,
  DEFAULT_ROLE_SUB_ITEMS,
  DEFAULT_ROLE_FINANCIAL_PERMISSIONS,
} from '../../services/db';
import { Company, User, UserRole, SidebarMenuConfig } from '../../types';
import { ThermalPrinterSettings } from './ThermalPrinterSettings';
import { ProductLabelsView } from './ProductLabelsView';
import { DataCleanupView } from './DataCleanupView';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { formatCurrency } from '../../services/pricingEngine';
import { toast } from '../../services/toast';
import { FirebaseSyncService } from '../../services/firebaseSync';
import {
  auth,
  MASTER_ADMIN_EMAIL,
  UserProfileDoc,
  deleteUserProfileInFirestore,
  isValidCompanyIdFormat,
  isValidGoogleAccountEmail,
  listFirestoreUserProfiles,
  provisionFirebaseAuthForUser,
  repairExistingUserFirestoreProfile,
  requestFirebasePasswordReset,
  resolveUserDefaultCompanyId,
  syncUserProfileStatusRoleInFirestore,
} from '../../services/firebase';
import { processLogoFile } from '../../services/imageUtils';

interface SettingsViewProps {
  initialTab?: 'empresas' | 'usuarios' | 'impressora' | 'etiquetas' | 'preferencias' | 'menus' | 'auditoria' | 'backup' | 'limpeza';
}

export interface MenuCatalogItem {
  id: string;
  label: string;
  description: string;
  iconName: string;
  isProtected?: boolean;
  subItems: {
    id: string;
    label: string;
    description: string;
    shortcut?: string;
  }[];
}

export const MENU_SECTIONS_CATALOG: MenuCatalogItem[] = [
  {
    id: 'inicio',
    label: 'Início',
    description: 'Painel inicial com indicadores de desempenho (KPIs), faturamento do dia e atalhos operacionais rápidos.',
    iconName: 'home',
    subItems: [
      { id: 'dashboard', label: 'Painel Geral & Métricas', description: 'Visão unificada das vendas, estoque e faturamento do dia', shortcut: 'F10' },
    ],
  },
  {
    id: 'vendas',
    label: 'Vendas',
    description: 'Frente de caixa balcão (PDV), pedidos de venda, orçamentos, vendas mobile e histórico comercial.',
    iconName: 'shopping-cart',
    subItems: [
      { id: 'pos', label: 'PDV Balcão', description: 'Ponto de venda ágil com teclado rápido e emissão térmica', shortcut: 'F2' },
      { id: 'orders', label: 'Pedido de Venda', description: 'Emissão de pedidos com desconto/acréscimo e finalização rápida', shortcut: 'F3' },
      { id: 'external_sales', label: 'Vendas Mobile', description: 'Módulo mobile para vendedores em rota e representantes', shortcut: 'F7' },
      { id: 'orders_history', label: 'Histórico de Vendas', description: 'Consulta detalhada e reimpressão de vendas realizadas', shortcut: 'F9' },
      { id: 'sales_reports', label: 'Relatórios', description: 'Curva ABC estratégica de Produtos, Clientes e Fornecedores' },
    ],
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    description: 'Base de dados de produtos, insumos, clientes, fornecedores e locais físicos de armazenagem.',
    iconName: 'folder-open',
    subItems: [
      { id: 'products', label: 'Produtos & Insumos', description: 'Catálogo de itens para revenda, fabricados e insumos', shortcut: 'F4' },
      { id: 'customers', label: 'Clientes', description: 'Cadastro de clientes, crédito e histórico comercial', shortcut: 'F8' },
      { id: 'suppliers', label: 'Fornecedores', description: 'Cadastro de fornecedores de mercadorias e matéria-prima' },
      { id: 'stock_locations', label: 'Locais de Estoque', description: 'Gestão de almoxarifados, lojas e depósitos' },
    ],
  },
  {
    id: 'compras',
    label: 'Compras',
    description: 'Gestão de aquisições de insumos e mercadorias com geração de contas a pagar.',
    iconName: 'shopping-bag',
    subItems: [
      { id: 'purchases', label: 'Pedidos de Compra', description: 'Emissão de pedidos a fornecedores e recebimento com atualização de custos' },
    ],
  },
  {
    id: 'estoque',
    label: 'Estoque',
    description: 'Transferências entre depósitos, inventário rotativo ou geral e extrato completo de movimentações.',
    iconName: 'warehouse',
    subItems: [
      { id: 'stock_transfers', label: 'Transferência entre Locais', description: 'Movimentação física de saldos entre almoxarifados' },
      { id: 'inventory', label: 'Inventário & Ajustes', description: 'Contagem física e acerto de perdas ou sobras' },
      { id: 'stock_movements', label: 'Extrato de Estoque', description: 'Kardex e rastreamento completo de entradas e saídas' },
    ],
  },
  {
    id: 'producao',
    label: 'Produção',
    description: 'Composição de produtos (BOM), catálogo de componentes e ordens de fabricação multi-produtos.',
    iconName: 'boxes',
    subItems: [
      { id: 'bom_composition', label: 'Composição', description: 'Ficha técnica com insumos necessários para cada produto acabado' },
      { id: 'components_catalog', label: 'Componentes', description: 'Catálogo de insumos e matérias-primas vinculadas' },
      { id: 'production_orders', label: 'Ordens de Produção', description: 'Emissão de OPs multi-produtos com baixa automática de insumos' },
    ],
  },
  {
    id: 'expedicao',
    label: 'Expedição',
    description: 'Emissão e controle de romaneios de entrega, roteirização de cargas por rota/região e relatórios de entrega.',
    iconName: 'truck',
    subItems: [
      { id: 'delivery_manifests', label: 'Romaneio de Entrega', description: 'Criação e despacho de romaneios com pedidos da rota e manifesto de carga' },
      { id: 'delivery_routes', label: 'Rotas de Entrega', description: 'Gestão de rotas de entrega e associação em lote' },
      { id: 'delivery_drivers', label: 'Motoristas', description: 'Cadastro de motoristas com controle de CNH, categoria e alertas de vencimento' },
      { id: 'delivery_vehicles', label: 'Veículos', description: 'Cadastro da frota com controle de placa, capacidade e vencimento de licenciamento' },
      { id: 'delivery_market_areas', label: 'Praças Comerciais', description: 'Cadastro e gestão de Praças Comerciais e macrorregiões de atendimento' },
      { id: 'delivery_neighborhoods', label: 'Bairros', description: 'Cadastro de bairros vinculados a cidades e rotas padrão' },
      { id: 'delivery_cities', label: 'Cidades', description: 'Cadastro de municípios atendidos com vínculo a praça e rota' },
      { id: 'delivery_states', label: 'Estados (UF)', description: 'Cadastro e manutenção de Unidades Federativas atendidas' },
      { id: 'expedition_reports', label: 'Relatórios de Entrega', description: 'Lista consolidada de produtos e conferência de entregas separada por cliente' },
    ],
  },
  {
    id: 'precificacao',
    label: 'Precificação',
    description: 'Simulador de formação de preços, markup, margem de contribuição e reajuste em lote.',
    iconName: 'calculator',
    subItems: [
      { id: 'pricing_calculator', label: 'Formação de Preço', description: 'Simulador com cálculo de custo, impostos e lucro desejado' },
      { id: 'batch_pricing', label: 'Atualização em Lote', description: 'Reajuste percentual simultâneo por categoria ou tabela' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    description: 'Fluxo de caixa diário e projetado, contas a pagar, contas a receber, caixa PDV e contas bancárias.',
    iconName: 'circle-dollar-sign',
    subItems: [
      { id: 'cash_flow', label: 'Fluxo de Caixa', description: 'DRE e fluxo financeiro diário e consolidado', shortcut: 'F6' },
      { id: 'accounts_receivable', label: 'Contas a Receber', description: 'Controle de títulos a receber e cobranças' },
      { id: 'accounts_payable', label: 'Contas a Pagar', description: 'Controle de compromissos a pagar a fornecedores' },
      { id: 'customer_vouchers', label: 'Vale (Crédito de Cliente)', description: 'Cadastro de vales/créditos de clientes e uso na baixa de títulos' },
      { id: 'cash_register', label: 'Controle de Caixa PDV', description: 'Abertura, sangrias, suprimentos e fechamento cego' },
      { id: 'payment_methods', label: 'Formas de Pagamento', description: 'Configuração de taxas de cartão, PIX e boletos' },
      { id: 'financial_accounts', label: 'Contas Bancárias & Caixa', description: 'Saldos bancários e caixas internos da empresa' },
      { id: 'payment_terms', label: 'Prazos de Pagamento', description: 'Condições de parcelamento comercial (ex: 30/60/90)' },
      { id: 'financial_reports', label: 'Relatórios Financeiros', description: 'Demonstrativos e relatórios de receitas e despesas' },
    ],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    description: 'Relatórios analíticos consolidados de faturamento, curva ABC, produtos mais vendidos e margens.',
    iconName: 'bar-chart-3',
    subItems: [
      { id: 'reports', label: 'Relatórios Gerenciais', description: 'Gráficos e estatísticas consolidadas da operação' },
    ],
  },
  {
    id: 'importacao',
    label: 'Importação/Exportação',
    description: 'Exportação e carga de dados em massa através de planilhas eletrônicas Excel (.xlsx).',
    iconName: 'file-spreadsheet',
    subItems: [
      { id: 'excel_tools', label: 'Planilhas Excel (.xlsx)', description: 'Importação e exportação de cadastros de produtos e vendas' },
    ],
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    description: 'Gestão de filiais, usuários, controle de permissões, impressoras térmicas e menus do sistema.',
    iconName: 'settings',
    isProtected: true,
    subItems: [
      { id: 'settings', label: 'Empresas, Usuários & Auditoria', description: 'Cadastro de filiais e controle de perfis de operadores' },
      { id: 'settings_menus', label: 'Menus do Sistema', description: 'Seleção de menus visíveis na barra lateral' },
      { id: 'settings_preferences', label: 'Preferências & Alertas', description: 'Alertas de contas vencidas e parâmetros do sistema' },
      { id: 'settings_printer', label: 'Configuração de Impressão', description: 'Configurações de impressão térmica 58mm/80mm e documentos em Folha A4' },
      { id: 'settings_cleanup', label: 'Limpeza de Dados', description: 'Zeramento seletivo de cadastros, produtos e histórico do sistema' },
    ],
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({ initialTab = 'empresas' }) => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();
  const isAdmin = Database.isAdmin(currentUser);
  const isGerente = Database.isGerente(currentUser);
  const fbAuthEmail = (auth.currentUser?.email || '').trim().toLowerCase();
  const isMasterAdmin =
    Database.isMasterAdmin(currentUser) &&
    (!auth.currentUser || fbAuthEmail === MASTER_ADMIN_EMAIL.toLowerCase());
  const canManageSettings = isAdmin || isGerente;

  // Usuários & Perfis é exclusivo do Administrador Master (romeujr.suporte@gmail.com);
  // Matriz / Filiais, Menus do Sistema e Limpeza de Dados são exclusivos do Administrador;
  // Auditoria é acessível ao Admin e Gerente Geral
  const isRestrictedTab = (tab: string) => {
    if (tab === 'usuarios' && !isMasterAdmin) return true;
    if (!isAdmin && (tab === 'empresas' || tab === 'menus' || tab === 'limpeza')) return true;
    if (!canManageSettings && tab === 'auditoria') return true;
    return false;
  };

  const fallbackAllowedTab = isAdmin ? 'empresas' : canManageSettings ? 'auditoria' : 'preferencias';
  const initialAllowedTab = isRestrictedTab(initialTab) ? fallbackAllowedTab : initialTab;

  const [activeTab, setActiveTab] = useState<'empresas' | 'usuarios' | 'impressora' | 'etiquetas' | 'preferencias' | 'menus' | 'supabase' | 'auditoria' | 'backup' | 'limpeza'>(initialAllowedTab);

  useEffect(() => {
    if (isRestrictedTab(initialTab)) {
      setActiveTab(isAdmin ? 'empresas' : canManageSettings ? 'auditoria' : 'preferencias');
    } else {
      setActiveTab(initialTab);
    }
  }, [initialTab, isAdmin, isGerente, isMasterAdmin]);

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
      setMenuConfig(Database.getSidebarMenuConfig());
    });
  }, []);

  // Configurações do Menu Lateral
  const [menuConfig, setMenuConfig] = useState<SidebarMenuConfig>(() => Database.getSidebarMenuConfig());
  const [menuSearchTerm, setMenuSearchTerm] = useState<string>('');
  const [menuStatusFilter, setMenuStatusFilter] = useState<'todos' | 'visiveis' | 'ocultos'>('todos');

  const handleToggleSection = (sectionId: string) => {
    if (sectionId === 'configuracoes') {
      toast.warning('O menu Configurações não pode ser ocultado para garantir o acesso ao sistema.', 'Menu Protegido');
      return;
    }

    const isCurrentlyHidden = menuConfig.hiddenSections.includes(sectionId);
    let nextHiddenSections: string[];

    if (isCurrentlyHidden) {
      nextHiddenSections = menuConfig.hiddenSections.filter((id) => id !== sectionId);
    } else {
      nextHiddenSections = [...menuConfig.hiddenSections, sectionId];
    }

    const nextConfig: SidebarMenuConfig = {
      ...menuConfig,
      hiddenSections: nextHiddenSections,
    };

    setMenuConfig(nextConfig);
    Database.setSidebarMenuConfig(nextConfig);
    toast.success(
      isCurrentlyHidden
        ? `Menu "${MENU_SECTIONS_CATALOG.find((s) => s.id === sectionId)?.label}" agora está VISÍVEL na barra lateral.`
        : `Menu "${MENU_SECTIONS_CATALOG.find((s) => s.id === sectionId)?.label}" foi OCULTADO da barra lateral.`,
      'Menu Lateral Atualizado'
    );
  };

  const handleToggleSubItem = (subItemId: string) => {
    if (subItemId === 'settings') {
      toast.warning('O submenu Empresas, Usuários & Auditoria não pode ser ocultado para garantir o acesso administrativo.', 'Submenu Protegido');
      return;
    }
    const isCurrentlyHidden = menuConfig.hiddenSubItems.includes(subItemId);
    let nextHiddenSubItems: string[];

    if (isCurrentlyHidden) {
      nextHiddenSubItems = menuConfig.hiddenSubItems.filter((id) => id !== subItemId);
    } else {
      nextHiddenSubItems = [...menuConfig.hiddenSubItems, subItemId];
    }

    const nextConfig: SidebarMenuConfig = {
      ...menuConfig,
      hiddenSubItems: nextHiddenSubItems,
    };

    setMenuConfig(nextConfig);
    Database.setSidebarMenuConfig(nextConfig);
  };

  const handleToggleAllSubItemsInSection = (sectionId: string, showAll: boolean) => {
    const section = MENU_SECTIONS_CATALOG.find((s) => s.id === sectionId);
    if (!section || !section.subItems) return;

    const subItemIds = section.subItems.map((s) => s.id);
    let nextHiddenSubItems = [...menuConfig.hiddenSubItems];

    if (showAll) {
      nextHiddenSubItems = nextHiddenSubItems.filter((id) => !subItemIds.includes(id));
    } else {
      subItemIds.forEach((id) => {
        if (id !== 'settings' && !nextHiddenSubItems.includes(id)) {
          nextHiddenSubItems.push(id);
        }
      });
    }

    const nextConfig: SidebarMenuConfig = {
      ...menuConfig,
      hiddenSubItems: nextHiddenSubItems,
    };

    setMenuConfig(nextConfig);
    Database.setSidebarMenuConfig(nextConfig);
    toast.info(
      showAll
        ? `Todos os subitens de "${section.label}" foram marcados como visíveis.`
        : `Todos os subitens de "${section.label}" foram ocultados.`,
      'Subitens Atualizados'
    );
  };

  const handleShowAllMenus = () => {
    const nextConfig: SidebarMenuConfig = {
      hiddenSections: [],
      hiddenSubItems: [],
    };
    setMenuConfig(nextConfig);
    Database.setSidebarMenuConfig(nextConfig);
    toast.success('Todos os menus e submenus agora estão visíveis no menu lateral.', 'Todos os Menus Visíveis');
  };

  const handleResetMenusDefault = () => {
    Database.resetSidebarMenuConfig();
    const def = Database.getSidebarMenuConfig();
    setMenuConfig(def);
    toast.info('Configuração do menu lateral restaurada para o padrão.', 'Padrão Restaurado');
  };

  const renderMenuIcon = (iconName: string, size = 18) => {
    switch (iconName) {
      case 'home': return <Home size={size} />;
      case 'shopping-cart': return <ShoppingCart size={size} />;
      case 'folder-open': return <FolderOpen size={size} />;
      case 'shopping-bag': return <ShoppingBag size={size} />;
      case 'warehouse': return <Warehouse size={size} />;
      case 'boxes': return <Boxes size={size} />;
      case 'calculator': return <Calculator size={size} />;
      case 'circle-dollar-sign': return <CircleDollarSign size={size} />;
      case 'bar-chart-3': return <BarChart3 size={size} />;
      case 'file-spreadsheet': return <FileSpreadsheet size={size} />;
      case 'truck': return <Truck size={size} />;
      case 'settings': return <Settings size={size} />;
      default: return <LayoutGrid size={size} />;
    }
  };

  // Backup / Restauração
  const [jsonBackupText, setJsonBackupText] = useState('');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [isRestoreJsonModalOpen, setIsRestoreJsonModalOpen] = useState(false);

  // Modal Empresa
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [compName, setCompName] = useState('');
  const [compTradeName, setCompTradeName] = useState('');
  const [compCnpj, setCompCnpj] = useState('');
  const [compType, setCompType] = useState<'matriz' | 'filial'>('filial');
  const [compPhone, setCompPhone] = useState('');
  const [compCity, setCompCity] = useState('');
  const [compState, setCompState] = useState('BA');
  const [compLogoUrl, setCompLogoUrl] = useState('');

  // Modal Usuário (Exclusivo romeujr.suporte@gmail.com)
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordChangeUser, setPasswordChangeUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [sendingResetUserId, setSendingResetUserId] = useState<string | null>(null);
  const [userModalError, setUserModalError] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userLogin, setUserLogin] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userInitialPassword, setUserInitialPassword] = useState('');
  const [showInitialPassword, setShowInitialPassword] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('balconista');
  const [userCompanyId, setUserCompanyId] = useState<string>('');
  const [userStatus, setUserStatus] = useState<'ativo' | 'inativo'>('ativo');
  const [userMaxDiscount, setUserMaxDiscount] = useState('10');
  const [userCanAlterPosUnitPrice, setUserCanAlterPosUnitPrice] = useState<boolean>(false);
  const [prefSaveMsg, setPrefSaveMsg] = useState<string | null>(null);

  // Diagnóstico e Reparo de Vínculos /users/{uid} no Firestore (Exclusivo Admin Master)
  const [firestoreProfiles, setFirestoreProfiles] = useState<UserProfileDoc[]>([]);
  const [firestoreProfilesLoaded, setFirestoreProfilesLoaded] = useState(false);
  const [isLoadingFirestoreProfiles, setIsLoadingFirestoreProfiles] = useState(false);
  const [firestoreProfilesError, setFirestoreProfilesError] = useState<string | null>(null);
  const [quickSyncingUserId, setQuickSyncingUserId] = useState<string | null>(null);

  // Modal de Reparo/Complementação de Usuário Existente no Firestore (sem duplicar conta Auth)
  const [repairTargetUser, setRepairTargetUser] = useState<User | null>(null);
  const [repairCompanyId, setRepairCompanyId] = useState<string>('');
  const [repairRole, setRepairRole] = useState<UserRole>('balconista');
  const [repairStatus, setRepairStatus] = useState<'ativo' | 'inativo'>('ativo');
  const [repairExistingUid, setRepairExistingUid] = useState<string>('');
  const [repairExistingPassword, setRepairExistingPassword] = useState<string>('');
  const [showRepairPassword, setShowRepairPassword] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [isRepairingUser, setIsRepairingUser] = useState(false);

  const activeCompanies = useMemo(() => {
    const list = (dbState.companies || []).filter((c) => c && c.status !== 'inativo');
    return [...list].sort((a, b) => {
      if (a.type === 'matriz' && b.type !== 'matriz') return -1;
      if (a.type !== 'matriz' && b.type === 'matriz') return 1;
      return (a.tradeName || a.name).localeCompare(b.tradeName || b.name);
    });
  }, [dbState.companies]);

  const loadFirestoreProfiles = async (silent: boolean = false) => {
    if (!isMasterAdmin || !auth.currentUser) return;
    setIsLoadingFirestoreProfiles(true);
    setFirestoreProfilesError(null);
    try {
      const profiles = await listFirestoreUserProfiles();
      setFirestoreProfiles(profiles);
      setFirestoreProfilesLoaded(true);
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível consultar os perfis /users no Firestore.';
      setFirestoreProfilesError(msg);
      if (!silent) {
        toast.warning(msg, 'Verificação do Firestore');
      }
    } finally {
      setIsLoadingFirestoreProfiles(false);
    }
  };

  const findMatchingFirestoreProfile = (u: User): UserProfileDoc | undefined => {
    if (firestoreProfiles.length === 0) return undefined;
    const cleanEmail = (u.email || '').trim().toLowerCase();
    return (
      (u.firebaseUid ? firestoreProfiles.find((p) => p.uid === u.firebaseUid) : undefined) ||
      firestoreProfiles.find((p) => p.erpUserId && p.erpUserId === u.id) ||
      (cleanEmail ? firestoreProfiles.find((p) => (p.email || '').trim().toLowerCase() === cleanEmail) : undefined)
    );
  };

  const getCompanyInfoById = (companyId?: string): Company | undefined => {
    if (!companyId) return undefined;
    return (dbState.companies || []).find((c) => c.id === companyId);
  };

  useEffect(() => {
    if (!isMasterAdmin && activeTab === 'usuarios') {
      setActiveTab(canManageSettings ? 'empresas' : 'preferencias');
    } else if (isMasterAdmin && activeTab === 'usuarios') {
      loadFirestoreProfiles(true);
    }
  }, [activeTab, isMasterAdmin, canManageSettings]);

  const handleSendPasswordResetForUser = async (target: User) => {
    if (!isMasterAdmin) {
      toast.error(`Apenas o Administrador Master (${MASTER_ADMIN_EMAIL}) pode gerenciar acessos de usuários.`);
      return;
    }
    const cleanEmail = (target.email || '').trim().toLowerCase();
    if (!isValidGoogleAccountEmail(cleanEmail)) {
      toast.warning(
        `O usuário ${target.name} não possui uma conta Google (@gmail.com) válida vinculada. Clique em Editar para informar o e-mail Google.`,
        'E-mail Google Pendente'
      );
      return;
    }
    setSendingResetUserId(target.id);
    try {
      const sentEmail = await requestFirebasePasswordReset(cleanEmail);
      toast.success(
        `Link oficial de redefinição de senha enviado pelo Firebase Authentication para ${sentEmail}.`,
        'Recuperação Enviada'
      );
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível enviar o e-mail de redefinição de senha.');
    } finally {
      setSendingResetUserId(null);
    }
  };

  const executeDeleteUser = async () => {
    if (!userToDelete) return;
    if (!isMasterAdmin) {
      toast.error(`Apenas o Administrador Master (${MASTER_ADMIN_EMAIL}) tem autorização para excluir usuários do sistema.`);
      setUserToDelete(null);
      return;
    }

    setIsDeletingUser(true);
    try {
      const target = userToDelete;
      const res = Database.deleteUser(target.id, currentUser.id);
      if (!res.success) {
        toast.error(res.error || 'Não foi possível excluir o usuário.');
        return;
      }

      await deleteUserProfileInFirestore(target.id, target.firebaseUid);
      try {
        await FirebaseSyncService.syncToFirebase(Database.getState(), true);
      } catch (syncErr) {
        console.warn('Aviso ao sincronizar exclusão de usuário com Firebase:', syncErr);
      }

      toast.success(
        `Usuário ${target.name} (@${target.login}) excluído do sistema com sucesso.`,
        'Usuário Excluído'
      );
      setUserToDelete(null);
      setDbState({ ...Database.getState() });
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Modal de Configuração de Menus, Submenus & Indicadores da Empresa (Exclusivo para o @admin)
  const [userConfiguringPermissions, setUserConfiguringPermissions] = useState<User | null>(null);
  const [permModalTab, setPermModalTab] = useState<'numeros' | 'menus'>('numeros');
  const [permMenuSearch, setPermMenuSearch] = useState('');
  const [tempFinPerms, setTempFinPerms] = useState({
    canViewGrossProfit: true,
    canViewNetProfit: false,
    canViewTotalRevenue: true,
    canViewProfitMargin: true,
    canViewProductCosts: true,
    canViewCashBalances: true,
  });
  const [tempAllowedSections, setTempAllowedSections] = useState<string[]>([]);
  const [tempAllowedSubItems, setTempAllowedSubItems] = useState<string[]>([]);
  const [tempCanAlterPosUnitPrice, setTempCanAlterPosUnitPrice] = useState<boolean>(false);

  const handleToggleBalconistaPosPrice = async (targetUser: User) => {
    if (!isMasterAdmin) {
      toast.error(`Apenas o Administrador Master (${MASTER_ADMIN_EMAIL}) pode alterar permissões de usuários.`);
      return;
    }
    if (targetUser.role !== 'balconista') return;

    const nextValue = !Boolean(targetUser.permissions?.canAlterPosUnitPrice);
    const res = Database.updateUserPermissions(
      targetUser.id,
      { canAlterPosUnitPrice: nextValue },
      currentUser.id
    );

    if (!res.success) {
      toast.error(res.error || 'Não foi possível atualizar a permissão do Balconista.');
      return;
    }

    setDbState({ ...Database.getState() });
    try {
      await FirebaseSyncService.syncToFirebase(Database.getState(), true);
    } catch (syncErr) {
      console.warn('Aviso ao sincronizar permissão de preço no PDV com Firebase:', syncErr);
    }

    toast.success(
      nextValue
        ? `Alteração de preço unitário no PDV Balcão LIBERADA para ${targetUser.name}.`
        : `Alteração de preço unitário no PDV Balcão BLOQUEADA para ${targetUser.name}.`,
      'Permissão do PDV Balcão'
    );
  };

  const handleOpenPermissionsModal = (targetUser: User) => {
    if (!isMasterAdmin) {
      toast.error(
        'Apenas os usuários "romeujr.suporte@gmail.com" e "admin" têm autorização para definir menus, submenus e números da empresa.',
        'Acesso Restrito ao Administrador'
      );
      return;
    }
    setUserConfiguringPermissions(targetUser);
    setPermModalTab('numeros');
    setPermMenuSearch('');

    const perms = targetUser.permissions;
    const role = targetUser.role || 'balconista';
    const finDefaults = DEFAULT_ROLE_FINANCIAL_PERMISSIONS[role] || DEFAULT_ROLE_FINANCIAL_PERMISSIONS.balconista;
    const menuDefaults = DEFAULT_ROLE_MENU_SECTIONS[role] || DEFAULT_ROLE_MENU_SECTIONS.balconista;
    const subDefaults = DEFAULT_ROLE_SUB_ITEMS[role] || DEFAULT_ROLE_SUB_ITEMS.balconista;

    setTempFinPerms({
      canViewGrossProfit: perms.canViewGrossProfit !== undefined ? perms.canViewGrossProfit : finDefaults.canViewGrossProfit,
      canViewNetProfit: perms.canViewNetProfit !== undefined ? perms.canViewNetProfit : finDefaults.canViewNetProfit,
      canViewTotalRevenue: perms.canViewTotalRevenue !== undefined ? perms.canViewTotalRevenue : finDefaults.canViewTotalRevenue,
      canViewProfitMargin: perms.canViewProfitMargin !== undefined ? perms.canViewProfitMargin : finDefaults.canViewProfitMargin,
      canViewProductCosts: perms.canViewProductCosts !== undefined ? perms.canViewProductCosts : (perms.canViewCosts ?? finDefaults.canViewProductCosts),
      canViewCashBalances: perms.canViewCashBalances !== undefined ? perms.canViewCashBalances : finDefaults.canViewCashBalances,
    });
    setTempCanAlterPosUnitPrice(Boolean(perms.canAlterPosUnitPrice));

    setTempAllowedSections(
      perms.allowedMenuSections ? [...perms.allowedMenuSections] : (targetUser.login === 'admin' ? MENU_SECTIONS_CATALOG.map((s) => s.id) : [...menuDefaults])
    );
    setTempAllowedSubItems(
      perms.allowedSubItems ? [...perms.allowedSubItems] : (targetUser.login === 'admin' ? MENU_SECTIONS_CATALOG.flatMap((s) => s.subItems?.map((sub) => sub.id) || []) : [...subDefaults])
    );
  };

  const handleSavePermissionsConfig = async () => {
    if (!isMasterAdmin || !userConfiguringPermissions) {
      toast.error('Apenas os usuários "romeujr.suporte@gmail.com" e "admin" podem salvar permissões.');
      return;
    }

    const targetName = userConfiguringPermissions.name;
    const isTargetBalconista = userConfiguringPermissions.role === 'balconista';

    const res = Database.updateUserPermissions(
      userConfiguringPermissions.id,
      {
        ...tempFinPerms,
        canViewCosts: tempFinPerms.canViewProductCosts,
        allowedMenuSections: tempAllowedSections,
        allowedSubItems: tempAllowedSubItems,
        ...(isTargetBalconista ? { canAlterPosUnitPrice: tempCanAlterPosUnitPrice } : {}),
      },
      currentUser.id
    );

    if (res.success) {
      setDbState({ ...Database.getState() });
      setUserConfiguringPermissions(null);
      try {
        await FirebaseSyncService.syncToFirebase(Database.getState(), true);
      } catch (syncErr) {
        console.warn('Aviso ao sincronizar permissões com Firebase:', syncErr);
      }
      toast.success(
        `Permissões de menus e números da empresa salvas para ${targetName}!`,
        'Permissões Atualizadas'
      );
    } else {
      toast.error(res.error || 'Erro ao salvar permissões.');
    }
  };

  const isSubItemRestrictedForTarget = (subId: string, targetUser: User | null) => {
    if (!targetUser) return true;
    const isTargetAdmin = targetUser.login === 'admin' || targetUser.role === 'admin';
    if (isTargetAdmin) return false;
    if (subId === 'settings_menus' || subId === 'settings_cleanup') return true;
    if (subId === 'settings' && targetUser.role !== 'gerente') return true;
    return false;
  };

  const handleSelectAllMenus = () => {
    const isTargetAdmin =
      userConfiguringPermissions?.login === 'admin' || userConfiguringPermissions?.role === 'admin';
    const isTargetGerente = userConfiguringPermissions?.role === 'gerente';

    setTempAllowedSections(
      MENU_SECTIONS_CATALOG.filter(
        (s) => s.id !== 'configuracoes' || isTargetAdmin || isTargetGerente
      ).map((s) => s.id)
    );
    setTempAllowedSubItems(
      MENU_SECTIONS_CATALOG.flatMap((s) => s.subItems?.map((sub) => sub.id) || []).filter(
        (subId) => !isSubItemRestrictedForTarget(subId, userConfiguringPermissions)
      )
    );
  };

  const handleDeselectAllMenus = () => {
    setTempAllowedSections(['inicio']);
    setTempAllowedSubItems(['dashboard']);
  };

  const handleResetToRoleDefaults = () => {
    if (!userConfiguringPermissions) return;
    const role = userConfiguringPermissions.role || 'balconista';
    const finDef = DEFAULT_ROLE_FINANCIAL_PERMISSIONS[role] || DEFAULT_ROLE_FINANCIAL_PERMISSIONS.balconista;
    const menuDef = DEFAULT_ROLE_MENU_SECTIONS[role] || DEFAULT_ROLE_MENU_SECTIONS.balconista;
    const subDef = DEFAULT_ROLE_SUB_ITEMS[role] || DEFAULT_ROLE_SUB_ITEMS.balconista;

    setTempFinPerms({ ...finDef });
    setTempCanAlterPosUnitPrice(false);
    setTempAllowedSections([...menuDef]);
    setTempAllowedSubItems([...subDef]);
    toast.info(`Configurações redefinidas para o padrão do perfil "${role}".`);
  };

  const handleTogglePermSection = (sectionId: string) => {
    const isCurrentlyAllowed = tempAllowedSections.includes(sectionId);
    const section = MENU_SECTIONS_CATALOG.find((s) => s.id === sectionId);
    const sectionSubIds = (section?.subItems?.map((s) => s.id) || []).filter(
      (subId) => !isSubItemRestrictedForTarget(subId, userConfiguringPermissions)
    );

    if (isCurrentlyAllowed) {
      setTempAllowedSections((prev) => prev.filter((id) => id !== sectionId));
      setTempAllowedSubItems((prev) => prev.filter((id) => !sectionSubIds.includes(id)));
    } else {
      setTempAllowedSections((prev) => [...prev, sectionId]);
      setTempAllowedSubItems((prev) => Array.from(new Set([...prev, ...sectionSubIds])));
    }
  };

  const handleTogglePermSubItem = (sectionId: string, subItemId: string) => {
    const isCurrentlyAllowed = tempAllowedSubItems.includes(subItemId);
    if (isCurrentlyAllowed) {
      const nextSubs = tempAllowedSubItems.filter((id) => id !== subItemId);
      setTempAllowedSubItems(nextSubs);
      const section = MENU_SECTIONS_CATALOG.find((s) => s.id === sectionId);
      const remainingSubs = section?.subItems?.filter((s) => nextSubs.includes(s.id)) || [];
      if (remainingSubs.length === 0) {
        setTempAllowedSections((prev) => prev.filter((id) => id !== sectionId));
      }
    } else {
      setTempAllowedSubItems((prev) => [...prev, subItemId]);
      if (!tempAllowedSections.includes(sectionId)) {
        setTempAllowedSections((prev) => [...prev, sectionId]);
      }
    }
  };

  // Salvar Empresa (exclusivo do Administrador; aguarda sincronização do registro de empresas/filiais no Firestore)
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Somente o Administrador pode cadastrar ou editar empresas e filiais.', 'Acesso Restrito');
      return;
    }
    if (!compName.trim() || !compCnpj.trim()) {
      toast.warning('Razão Social e CNPJ da empresa são obrigatórios.', 'Campos Obrigatórios');
      return;
    }

    const state = Database.getState();
    const nowIso = new Date().toISOString();
    const finalTradeName = compTradeName.trim() || compName.trim();

    if (editingCompany) {
      const isRootMatriz = editingCompany.id === 'comp-matriz';
      state.companies = state.companies.map((c) =>
        c.id === editingCompany.id
          ? {
              ...c,
              name: compName.trim(),
              tradeName: finalTradeName,
              cnpjCpf: compCnpj.trim(),
              type: isRootMatriz ? 'matriz' : compType,
              phone: compPhone.trim(),
              address: {
                street: c.address?.street || '',
                number: c.address?.number || '',
                complement: c.address?.complement,
                neighborhood: c.address?.neighborhood || '',
                zipCode: c.address?.zipCode || '',
                city: compCity.trim(),
                state: compState,
              },
              logoUrl: compLogoUrl?.trim() || undefined,
              updatedAt: nowIso,
            }
          : c
      );
      Database.addAuditLog('ATUALIZAR_EMPRESA', 'CONFIGURACOES', editingCompany.id, `Empresa ${finalTradeName} (${compName.trim()}) atualizada`);
    } else {
      const newComp: Company = {
        id: 'comp-' + Date.now(),
        name: compName.trim(),
        tradeName: finalTradeName,
        cnpjCpf: compCnpj.trim(),
        type: compType === 'matriz' ? 'filial' : compType,
        phone: compPhone.trim(),
        email: 'contato@empresa.com.br',
        address: {
          street: 'Avenida Principal',
          number: '100',
          neighborhood: 'Centro',
          city: compCity.trim() || 'Feira de Santana',
          state: compState,
          zipCode: '44000-000',
        },
        status: 'ativo',
        logoUrl: compLogoUrl?.trim() || undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      state.companies.push(newComp);
      Database.addAuditLog('CRIAR_EMPRESA', 'CONFIGURACOES', newComp.id, `Filial/Empresa ${newComp.tradeName} cadastrada`);
    }

    // Garante que a empresa Matriz permaneça sempre na posição 0 (requisito das regras do Firestore)
    const matrizIdx = state.companies.findIndex((c) => c.id === 'comp-matriz');
    if (matrizIdx > 0) {
      const [matriz] = state.companies.splice(matrizIdx, 1);
      state.companies.unshift(matriz);
    }

    Database.persist();
    setDbState({ ...Database.getState() });
    setIsCompanyModalOpen(false);

    try {
      const synced = await FirebaseSyncService.syncToFirebase(Database.getState(), isAdmin);
      if (synced) {
        toast.success(
          'Dados da empresa salvos e registrados no Firebase Firestore (registeredCompanyIds atualizado)!',
          'Empresa Atualizada'
        );
      } else {
        toast.warning(
          'Empresa salva localmente, mas a sincronização com o Firebase Firestore não foi confirmada. Clique no ícone de sincronização para reenviar.',
          'Sincronização Pendente'
        );
      }
    } catch (syncErr) {
      console.warn('Erro ao sincronizar empresa com Firebase:', syncErr);
      toast.warning(
        'Empresa salva localmente, mas houve falha ao atualizar o registro no Firebase Firestore.',
        'Sincronização Pendente'
      );
    }
  };

  // Salvar Usuário (Exclusivo romeujr.suporte@gmail.com com vínculo obrigatório de empresa e gravação no Firestore)
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserModalError(null);

    if (!isMasterAdmin) {
      toast.error(
        `Apenas o Administrador Master (${MASTER_ADMIN_EMAIL}) pode criar ou editar usuários no sistema.`,
        'Acesso Restrito'
      );
      return;
    }

    const cleanName = userName.trim();
    const cleanLogin = userLogin.trim().toLowerCase().replace(/^@/, '');
    const cleanEmail = userEmail.trim().toLowerCase();
    const cleanPassword = userInitialPassword.trim();
    const selectedCompanyId = userCompanyId.trim();

    if (!cleanName || !cleanLogin) {
      setUserModalError('Nome Completo e Login de Acesso são obrigatórios.');
      return;
    }

    const isTargetProtectedAdmin =
      !!editingUser &&
      (editingUser.login === 'admin' ||
        editingUser.id === 'usr-admin' ||
        editingUser.email?.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase());

    const effectiveCompanyId = selectedCompanyId || (isTargetProtectedAdmin ? 'comp-matriz' : '');
    if (!effectiveCompanyId || !isValidCompanyIdFormat(effectiveCompanyId)) {
      setUserModalError(
        'Selecione a Empresa Padrão (Matriz ou Filial). Este campo é obrigatório para definir a empresa aberta automaticamente no login.'
      );
      return;
    }

    const state = Database.getState();
    const matchedCompany = (state.companies || []).find((c) => c.id === effectiveCompanyId);
    if (!matchedCompany || matchedCompany.status === 'inativo') {
      setUserModalError(
        'A Empresa Padrão selecionada não existe ou está inativa. Selecione uma empresa ativa (Matriz ou Filial).'
      );
      return;
    }

    if (!isTargetProtectedAdmin && !isValidGoogleAccountEmail(cleanEmail)) {
      setUserModalError(
        'Informe uma conta Google válida (@gmail.com ou @googlemail.com) para autenticação no Firebase.'
      );
      return;
    }

    const duplicateUser = state.users.find(
      (u) =>
        u.id !== editingUser?.id &&
        ((u.login || '').trim().toLowerCase() === cleanLogin ||
          (!isTargetProtectedAdmin && (u.email || '').trim().toLowerCase() === cleanEmail))
    );
    if (duplicateUser) {
      setUserModalError(
        `Já existe outro usuário cadastrado com este login (@${duplicateUser.login}) ou e-mail Google (${duplicateUser.email || ''}).`
      );
      return;
    }

    // Caso o usuário já possua documento /users/{uid} detectado no Firestore, reaproveita o UID sem exigir recriação
    const detectedRemoteProfile = editingUser ? findMatchingFirestoreProfile(editingUser) : undefined;
    const knownExistingUid = editingUser?.firebaseUid || detectedRemoteProfile?.uid || '';

    const needsFirebaseProvisioning =
      !isTargetProtectedAdmin && (!editingUser || !knownExistingUid);

    if (needsFirebaseProvisioning && cleanPassword.length < 6) {
      setUserModalError(
        'A senha inicial deve possuir no mínimo 6 caracteres para criação da conta no Firebase Authentication.'
      );
      return;
    }

    const maxDisc = parseFloat(userMaxDiscount) || 5;

    const permissions = {
      admin: {
        canViewCosts: true,
        canEditProducts: true,
        canDeleteRecords: true,
        canCancelSales: true,
        canAuthorizeDiscount: true,
        maxDiscountPercent: 30,
        canAccessFinancial: true,
        canAccessProduction: true,
        canAccessPurchases: true,
        canManageUsers: true,
        canAdjustStock: true,
        canCloseCashRegister: true,
      },
      gerente: {
        canViewCosts: true,
        canEditProducts: true,
        canDeleteRecords: false,
        canCancelSales: true,
        canAuthorizeDiscount: true,
        maxDiscountPercent: 20,
        canAccessFinancial: true,
        canAccessProduction: true,
        canAccessPurchases: true,
        canManageUsers: false,
        canAdjustStock: true,
        canCloseCashRegister: true,
      },
      balconista: {
        canViewCosts: false,
        canEditProducts: false,
        canDeleteRecords: false,
        canCancelSales: false,
        canAuthorizeDiscount: false,
        maxDiscountPercent: maxDisc,
        canAccessFinancial: false,
        canAccessProduction: false,
        canAccessPurchases: false,
        canManageUsers: false,
        canAdjustStock: false,
        canCloseCashRegister: true,
      },
      vendedor_externo: {
        canViewCosts: false,
        canEditProducts: false,
        canDeleteRecords: false,
        canCancelSales: false,
        canAuthorizeDiscount: false,
        maxDiscountPercent: maxDisc,
        canAccessFinancial: false,
        canAccessProduction: false,
        canAccessPurchases: false,
        canManageUsers: false,
        canAdjustStock: false,
        canCloseCashRegister: false,
      },
      financeiro: {
        canViewCosts: true,
        canEditProducts: false,
        canDeleteRecords: false,
        canCancelSales: true,
        canAuthorizeDiscount: true,
        maxDiscountPercent: 15,
        canAccessFinancial: true,
        canAccessProduction: false,
        canAccessPurchases: true,
        canManageUsers: false,
        canAdjustStock: false,
        canCloseCashRegister: true,
      },
    }[userRole];

    const isBalconista = userRole === 'balconista';
    const subDefaults = DEFAULT_ROLE_SUB_ITEMS[userRole] || DEFAULT_ROLE_SUB_ITEMS.balconista;
    const menuDefaults = DEFAULT_ROLE_MENU_SECTIONS[userRole] || DEFAULT_ROLE_MENU_SECTIONS.balconista;
    const finDefaults = DEFAULT_ROLE_FINANCIAL_PERMISSIONS[userRole] || DEFAULT_ROLE_FINANCIAL_PERMISSIONS.balconista;
    const nowIso = new Date().toISOString();

    setIsSavingUser(true);
    try {
      if (editingUser) {
        const targetExisting = state.users.find((u) => u.id === editingUser.id);
        if (!targetExisting) {
          setUserModalError('Usuário não encontrado para edição.');
          return;
        }

        const effectiveRole: UserRole = isTargetProtectedAdmin ? 'admin' : userRole;
        const effectiveStatus: 'ativo' | 'inativo' = isTargetProtectedAdmin ? 'ativo' : userStatus;
        const effectiveEmail = isTargetProtectedAdmin ? MASTER_ADMIN_EMAIL : cleanEmail;
        const roleChanged = targetExisting.role !== effectiveRole;

        const baseMenuSections = roleChanged
          ? [...menuDefaults]
          : [...(targetExisting.permissions.allowedMenuSections || menuDefaults)];
        let baseAllowedSubs = roleChanged
          ? [...subDefaults]
          : [...(targetExisting.permissions.allowedSubItems || subDefaults)];

        if (isBalconista) {
          baseAllowedSubs = baseAllowedSubs.filter((item) => item !== 'dashboard');
        }
        if (effectiveRole !== 'admin') {
          baseAllowedSubs = baseAllowedSubs.filter(
            (item) => item !== 'settings_menus' && item !== 'settings_cleanup' && item !== 'settings_supabase'
          );
        }
        if (effectiveRole === 'gerente' && (roleChanged || !targetExisting.permissions.gerenteSettingsMigrated)) {
          if (!baseMenuSections.includes('configuracoes')) {
            baseMenuSections.push('configuracoes');
          }
          if (!baseAllowedSubs.includes('settings')) {
            baseAllowedSubs.push('settings');
          }
          if (!baseAllowedSubs.includes('settings_preferences')) {
            baseAllowedSubs.push('settings_preferences');
          }
          if (!baseAllowedSubs.includes('settings_printer')) {
            baseAllowedSubs.push('settings_printer');
          }
        }

        const {
          password: _removedLegacyPass,
          allowedCompanyIds: _removedIndiscriminateCompanies,
          ...existingWithoutPass
        } = targetExisting;
        const updatedObj: User = {
          ...existingWithoutPass,
          name: cleanName,
          login: isTargetProtectedAdmin ? targetExisting.login : cleanLogin,
          email: effectiveEmail,
          role: effectiveRole,
          companyId: effectiveCompanyId,
          defaultCompanyId: effectiveCompanyId,
          status: effectiveStatus,
          firebaseUid: knownExistingUid || existingWithoutPass.firebaseUid,
          updatedAt: nowIso,
          permissions: {
            ...permissions,
            maxDiscountPercent: maxDisc,
            canAlterPosUnitPrice: effectiveRole === 'balconista' ? userCanAlterPosUnitPrice : false,
            canViewGrossProfit: isBalconista ? false : (roleChanged ? finDefaults.canViewGrossProfit : (targetExisting.permissions.canViewGrossProfit ?? finDefaults.canViewGrossProfit)),
            canViewNetProfit: isBalconista ? false : (roleChanged ? finDefaults.canViewNetProfit : (targetExisting.permissions.canViewNetProfit ?? finDefaults.canViewNetProfit)),
            canViewTotalRevenue: isBalconista ? false : (roleChanged ? finDefaults.canViewTotalRevenue : (targetExisting.permissions.canViewTotalRevenue ?? finDefaults.canViewTotalRevenue)),
            canViewProfitMargin: isBalconista ? false : (roleChanged ? finDefaults.canViewProfitMargin : (targetExisting.permissions.canViewProfitMargin ?? finDefaults.canViewProfitMargin)),
            canViewProductCosts: isBalconista ? false : (roleChanged ? finDefaults.canViewProductCosts : (targetExisting.permissions.canViewProductCosts ?? finDefaults.canViewProductCosts)),
            canViewCashBalances: isBalconista ? false : (roleChanged ? finDefaults.canViewCashBalances : (targetExisting.permissions.canViewCashBalances ?? finDefaults.canViewCashBalances)),
            allowedMenuSections: baseMenuSections,
            allowedSubItems: baseAllowedSubs,
            ...(effectiveRole === 'gerente' ? { gerenteSettingsMigrated: true } : {}),
          },
        };

        if (isTargetProtectedAdmin && !updatedObj.firebaseUid && auth.currentUser?.uid) {
          updatedObj.firebaseUid = auth.currentUser.uid;
        }

        if (needsFirebaseProvisioning) {
          const provisionedUid = await provisionFirebaseAuthForUser(updatedObj, cleanPassword);
          updatedObj.firebaseUid = provisionedUid;
          updatedObj.updatedAt = new Date().toISOString();
        } else if (updatedObj.firebaseUid) {
          await syncUserProfileStatusRoleInFirestore(updatedObj);
        }

        state.users = state.users.map((u) => (u.id === editingUser.id ? updatedObj : u));
        Database.addAuditLog(
          'ATUALIZAR_USUARIO',
          'CONFIGURACOES',
          editingUser.id,
          `Usuário ${updatedObj.name} (${updatedObj.email}) atualizado com Empresa Padrão ${matchedCompany.tradeName || matchedCompany.name} (${effectiveCompanyId}) e sincronizado no Firebase.`
        );
      } else {
        const newUser: User = {
          id: 'usr-' + Date.now(),
          name: cleanName,
          login: cleanLogin,
          email: cleanEmail,
          role: userRole,
          companyId: effectiveCompanyId,
          defaultCompanyId: effectiveCompanyId,
          status: 'ativo',
          updatedAt: nowIso,
          permissions: {
            ...permissions,
            maxDiscountPercent: maxDisc,
            canAlterPosUnitPrice: userRole === 'balconista' ? userCanAlterPosUnitPrice : false,
            canViewGrossProfit: isBalconista ? false : finDefaults.canViewGrossProfit,
            canViewNetProfit: isBalconista ? false : finDefaults.canViewNetProfit,
            canViewTotalRevenue: isBalconista ? false : finDefaults.canViewTotalRevenue,
            canViewProfitMargin: isBalconista ? false : finDefaults.canViewProfitMargin,
            canViewProductCosts: isBalconista ? false : finDefaults.canViewProductCosts,
            canViewCashBalances: isBalconista ? false : finDefaults.canViewCashBalances,
            allowedMenuSections: [...menuDefaults],
            allowedSubItems: isBalconista ? subDefaults.filter((s) => s !== 'dashboard') : [...subDefaults],
            ...(userRole === 'gerente' ? { gerenteSettingsMigrated: true } : {}),
          },
        };

        // Cria obrigatoriamente a conta no Firebase Authentication + documento /users/{uid} no Firestore com defaultCompanyId
        const provisionedUid = await provisionFirebaseAuthForUser(newUser, cleanPassword);
        newUser.firebaseUid = provisionedUid;
        newUser.updatedAt = new Date().toISOString();

        state.users.push(newUser);
        Database.addAuditLog(
          'CRIAR_USUARIO',
          'CONFIGURACOES',
          newUser.id,
          `Usuário ${newUser.name} (${newUser.email}, perfil ${userRole}) criado com Empresa Padrão ${matchedCompany.tradeName || matchedCompany.name} (${effectiveCompanyId}).`
        );
      }

      Database.persist();
      const syncedToCloud = await FirebaseSyncService.syncToFirebase(Database.getState(), true);
      setDbState({ ...Database.getState() });
      await loadFirestoreProfiles(true);
      setIsUserModalOpen(false);

      if (syncedToCloud) {
        toast.success(
          editingUser
            ? `Usuário ${cleanName} atualizado (Empresa Padrão: ${matchedCompany.tradeName || matchedCompany.name}) e confirmado no Firebase!`
            : `Usuário ${cleanName} (${cleanEmail}) criado (Empresa Padrão: ${matchedCompany.tradeName || matchedCompany.name}) e liberado para acesso!`,
          editingUser ? 'Usuário Atualizado' : 'Usuário Provisionado no Firebase'
        );
      } else {
        toast.warning(
          `Perfil /users/{uid} salvo no Firestore, porém a sincronização central (/erp_sync/comp-matriz) não pôde ser confirmada agora. Verifique sua conexão e sincronize antes do login do usuário.`,
          'Sincronização Central Pendente'
        );
      }
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível salvar e provisionar o usuário no Firebase.';
      setUserModalError(msg);
      toast.error(msg, 'Erro ao Provisionar Usuário');
    } finally {
      setIsSavingUser(false);
    }
  };

  // Sincronização rápida de 1 clique quando o UID já existe (sem duplicar conta Auth)
  const handleQuickSyncUserProfile = async (targetUser: User, detectedUid?: string) => {
    if (!isMasterAdmin) return;
    const effectiveUid = (targetUser.firebaseUid || detectedUid || '').trim();
    const targetComp = getCompanyInfoById(resolveUserDefaultCompanyId(targetUser));

    if (!effectiveUid || !targetComp || targetComp.status === 'inativo') {
      handleOpenRepairModal(targetUser, detectedUid);
      return;
    }

    setQuickSyncingUserId(targetUser.id);
    try {
      const { uid } = await repairExistingUserFirestoreProfile({
        user: targetUser,
        targetCompanyId: targetComp.id,
        existingUid: effectiveUid,
      });

      const state = Database.getState();
      state.users = state.users.map((u) => {
        if (u.id !== targetUser.id) return u;
        const { allowedCompanyIds: _removed, password: _legacyPass, ...rest } = u;
        return {
          ...rest,
          companyId: targetComp.id,
          defaultCompanyId: targetComp.id,
          firebaseUid: uid,
          updatedAt: new Date().toISOString(),
        };
      });
      Database.addAuditLog(
        'REPARAR_VINCULO_USUARIO',
        'CONFIGURACOES',
        targetUser.id,
        `Perfil /users/${uid} sincronizado no Firestore para ${targetUser.name} com Empresa Padrão ${targetComp.tradeName || targetComp.name} (${targetComp.id}).`
      );
      Database.persist();
      const synced = await FirebaseSyncService.syncToFirebase(Database.getState(), true);
      setDbState({ ...Database.getState() });
      await loadFirestoreProfiles(true);

      if (synced) {
        toast.success(
          `Perfil Firestore de ${targetUser.name} atualizado (Empresa Padrão: ${targetComp.tradeName || targetComp.name})!`,
          'Perfil Sincronizado'
        );
      } else {
        toast.warning(
          'Documento /users/{uid} atualizado, mas a sincronização central (/erp_sync/comp-matriz) ficou pendente.',
          'Sincronização Pendente'
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível sincronizar o perfil no Firestore.');
    } finally {
      setQuickSyncingUserId(null);
    }
  };

  // Abre modal de reparo para completar /users/{uid} de usuário já existente no Firebase Auth
  const handleOpenRepairModal = (targetUser: User, detectedUid?: string) => {
    const matchedProfile = findMatchingFirestoreProfile(targetUser);
    const existingComp = getCompanyInfoById(
      resolveUserDefaultCompanyId(targetUser) || resolveUserDefaultCompanyId(matchedProfile)
    );
    setRepairTargetUser(targetUser);
    setRepairCompanyId(
      existingComp && existingComp.status !== 'inativo'
        ? existingComp.id
        : activeCompanies.length === 1
        ? activeCompanies[0].id
        : ''
    );
    setRepairRole(targetUser.role || matchedProfile?.role || 'balconista');
    setRepairStatus(targetUser.status || matchedProfile?.status || 'ativo');
    setRepairExistingUid((targetUser.firebaseUid || detectedUid || matchedProfile?.uid || '').trim());
    setRepairExistingPassword('');
    setShowRepairPassword(false);
    setRepairError(null);
  };

  const handleExecuteRepairUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMasterAdmin || !repairTargetUser) return;
    setRepairError(null);

    const cleanCompanyId = repairCompanyId.trim();
    if (!cleanCompanyId || !isValidCompanyIdFormat(cleanCompanyId)) {
      setRepairError('Selecione uma Empresa Padrão válida (Matriz ou Filial).');
      return;
    }

    const targetComp = getCompanyInfoById(cleanCompanyId);
    if (!targetComp || targetComp.status === 'inativo') {
      setRepairError('A empresa selecionada está inativa ou não cadastrada.');
      return;
    }

    const cleanUid = repairExistingUid.trim();
    const cleanPass = repairExistingPassword.trim();
    if (!cleanUid && !cleanPass) {
      setRepairError(
        'Informe o UID da conta existente no Firebase Authentication ou a senha atual dessa conta para vincular sem criar conta duplicada.'
      );
      return;
    }

    setIsRepairingUser(true);
    try {
      const targetWithUpdates: User = {
        ...repairTargetUser,
        role: repairRole,
        status: repairStatus,
        companyId: cleanCompanyId,
        defaultCompanyId: cleanCompanyId,
      };

      const { uid } = await repairExistingUserFirestoreProfile({
        user: targetWithUpdates,
        targetCompanyId: cleanCompanyId,
        existingUid: cleanUid || undefined,
        existingPassword: cleanPass || undefined,
      });

      const state = Database.getState();
      state.users = state.users.map((u) => {
        if (u.id !== repairTargetUser.id) return u;
        const { allowedCompanyIds: _removed, password: _legacyPass, ...rest } = u;
        return {
          ...rest,
          role: repairRole,
          status: repairStatus,
          companyId: cleanCompanyId,
          defaultCompanyId: cleanCompanyId,
          firebaseUid: uid,
          updatedAt: new Date().toISOString(),
        };
      });

      Database.addAuditLog(
        'REPARAR_VINCULO_USUARIO',
        'CONFIGURACOES',
        repairTargetUser.id,
        `Documento /users/${uid} completado/reparado no Firestore para ${repairTargetUser.name} (${repairTargetUser.email || repairTargetUser.login}) com Empresa Padrão ${targetComp.tradeName || targetComp.name} (${cleanCompanyId}).`
      );

      Database.persist();
      const synced = await FirebaseSyncService.syncToFirebase(Database.getState(), true);
      setDbState({ ...Database.getState() });
      await loadFirestoreProfiles(true);
      setRepairTargetUser(null);

      if (synced) {
        toast.success(
          `Perfil de ${repairTargetUser.name} atualizado no Firestore (/users/${uid}) com Empresa Padrão ${targetComp.tradeName || targetComp.name}!`,
          'Perfil Atualizado com Sucesso'
        );
      } else {
        toast.warning(
          `Documento /users/${uid} gravado no Firestore, mas a sincronização central (/erp_sync/comp-matriz) ficou pendente. Tente sincronizar novamente.`,
          'Sincronização Central Pendente'
        );
      }
    } catch (err: any) {
      const msg = err?.message || 'Erro ao reparar vínculo do usuário no Firestore.';
      setRepairError(msg);
      toast.error(msg, 'Falha no Reparo de Vínculo');
    } finally {
      setIsRepairingUser(false);
    }
  };

  // Download do Backup JSON do Banco
  const handleExportBackup = () => {
    const json = Database.exportDatabaseJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GestaoFacil_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Restaurar Backup JSON
  const handleRestoreBackup = () => {
    if (!jsonBackupText.trim()) {
      toast.warning('Cole o JSON de backup na caixa de texto antes de restaurar.', 'JSON Vazio');
      return;
    }
    setIsRestoreJsonModalOpen(true);
  };

  const executeRestoreBackup = async () => {
    try {
      const success = Database.importDatabaseJSON(jsonBackupText);
      if (success) {
        await FirebaseSyncService.syncToFirebase(Database.getState(), true);
        toast.success('Backup restaurado com sucesso!', 'Restauração Concluída');
        setIsRestoreJsonModalOpen(false);
        setJsonBackupText('');
        setDbState({ ...Database.getState() });
      } else {
        toast.error('Falha ao restaurar: O formato do JSON informado é inválido.', 'Formato Inválido');
      }
    } catch (e) {
      toast.error('Erro ao processar restauração de backup.');
    }
  };

  // Reset de Fábrica (Início do Zero) - Exclusivo romeujr.suporte@gmail.com e admin
  const handleFactoryReset = () => {
    if (!isMasterAdmin) {
      toast.error(
        'Apenas os usuários "romeujr.suporte@gmail.com" e "admin" possuem permissão para restaurar os padrões de fábrica.',
        'Acesso Restrito'
      );
      return;
    }
    setResetConfirmText('');
    setIsResetModalOpen(true);
  };

  const executeFactoryReset = async () => {
    if (!isMasterAdmin) {
      toast.error(
        'Apenas os usuários "romeujr.suporte@gmail.com" e "admin" possuem permissão para restaurar os padrões de fábrica.',
        'Acesso Restrito'
      );
      setIsResetModalOpen(false);
      return;
    }
    setIsResetting(true);
    try {
      const ok = Database.resetToFactoryDefaults();
      if (!ok) {
        toast.error('Permissão negada para restaurar padrões de fábrica.');
        setIsResetModalOpen(false);
        return;
      }
      // Sincroniza o estado zerado imediatamente com o Firebase Firestore (substituição total)
      await FirebaseSyncService.syncToFirebase(Database.getState(), true);
      toast.success(
        'Sistema restaurado aos padrões de fábrica com sucesso! Faça login com o usuário "admin" para cadastrar sua Empresa Matriz.',
        'Padrões de Fábrica Restaurados'
      );
      setIsResetModalOpen(false);
      setResetConfirmText('');
    } catch (e) {
      console.warn('Aviso ao sincronizar reset com Firebase:', e);
      toast.error('Os dados foram zerados localmente. Sincronização pendente com nuvem.');
      setIsResetModalOpen(false);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Topo / Sub-Abas */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Settings className="text-blue-600" size={20} />
              <span>Configurações, Empresas, Usuários & Auditoria</span>
            </h2>
            <p className="text-xs text-slate-500">
              Administração de filiais, perfis de acesso, políticas de segurança, log de auditoria e backup do sistema.
            </p>
          </div>
          <PWAInstallButton variant="settings-button" />
        </div>

        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl text-xs font-bold gap-1">
          {isAdmin && (
            <button
              onClick={() => setActiveTab('empresas')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'empresas' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 size={14} />
              <span>Matriz / Filiais</span>
            </button>
          )}
          {isMasterAdmin && (
            <button
              onClick={() => setActiveTab('usuarios')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'usuarios' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users size={14} />
              <span>Usuários & Perfis</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('menus')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'menus' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid size={14} />
              <span>Menus do Sistema</span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('impressora')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'impressora' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Printer size={14} />
            <span>Configuração de Impressão</span>
          </button>
          <button
            onClick={() => setActiveTab('etiquetas')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'etiquetas' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Tag size={14} />
            <span>Etiquetas de Produtos</span>
          </button>
          <button
            onClick={() => setActiveTab('preferencias')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'preferencias' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders size={14} />
            <span>Preferências & Alertas</span>
          </button>
          {canManageSettings && (
            <button
              onClick={() => setActiveTab('auditoria')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'auditoria' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History size={14} />
              <span>Logs de Auditoria</span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('backup')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'backup' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Download size={14} />
            <span>Backup & Restauração</span>
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('limpeza')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'limpeza' ? 'bg-white text-rose-700 shadow-xs' : 'text-rose-600 hover:text-rose-800'
              }`}
            >
              <Trash2 size={14} className="text-rose-600" />
              <span>Limpeza de Dados</span>
            </button>
          )}
        </div>
      </div>

      {/* ABA 1: EMPRESAS (MATRIZ E FILIAIS — EXCLUSIVO DO ADMINISTRADOR) */}
      {activeTab === 'empresas' && isAdmin && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Empresas e Filiais Cadastradas</h3>
              <p className="text-xs text-slate-500">
                O sistema permite operar com matriz e filiais mantendo caixas e estoques identificados por empresa.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingCompany(null);
                setCompName('');
                setCompTradeName('');
                setCompCnpj('');
                setCompType('filial');
                setCompPhone('');
                setCompCity('Alagoinhas');
                setCompState('BA');
                setCompLogoUrl('');
                setIsCompanyModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
            >
              <Plus size={14} />
              <span>Nova Filial</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dbState.companies.map((c) => (
              <div key={c.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5 shadow-2xs hover:border-slate-300 transition-colors">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {c.logoUrl ? (
                      <img
                        src={c.logoUrl}
                        alt={c.tradeName || c.name}
                        className="w-11 h-11 rounded-xl object-contain bg-white border border-slate-200 p-1 shadow-2xs shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-black text-xs shrink-0 shadow-2xs">
                        <Building2 size={20} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 truncate">{c.tradeName || c.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                          c.type === 'matriz' ? 'bg-blue-900 text-blue-100' : 'bg-slate-200 text-slate-800'
                        }`}>
                          {c.type}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium truncate">{c.name}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setEditingCompany(c);
                      setCompName(c.name || '');
                      setCompTradeName(c.tradeName || '');
                      setCompCnpj(c.cnpjCpf || '');
                      setCompType(c.type || 'filial');
                      setCompPhone(c.phone || '');
                      setCompCity(c.address?.city || '');
                      setCompState(c.address?.state || 'BA');
                      setCompLogoUrl(c.logoUrl || '');
                      setIsCompanyModalOpen(true);
                    }}
                    className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer shrink-0"
                    title="Editar Empresa/Filial"
                  >
                    <Edit2 size={15} />
                  </button>
                </div>

                <div className="text-xs text-slate-600 space-y-0.5">
                  <div>Razão Social: <strong>{c.name}</strong></div>
                  <div>CNPJ: {c.cnpjCpf}</div>
                  <div>Telefone: {c.phone}</div>
                  <div>Cidade: {c.address.city}/{c.address.state}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ABA 2: USUÁRIOS E PERFIS (EXCLUSIVO romeujr.suporte@gmail.com) */}
      {activeTab === 'usuarios' && isMasterAdmin && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3 pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Usuários e Perfis de Acesso</h3>
              <p className="text-xs text-slate-500">
                Gerenciamento exclusivo do Administrador Master ({MASTER_ADMIN_EMAIL}). Cada usuário possui uma <strong>Empresa Padrão</strong> (<code className="font-mono text-[11px] bg-slate-100 px-1 rounded">defaultCompanyId</code>) aberta no login e pode alternar entre Matriz e Filiais deste ERP conforme seu perfil.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={isLoadingFirestoreProfiles}
                onClick={() => loadFirestoreProfiles(false)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 cursor-pointer"
                title="Consultar a coleção /users no Firestore para verificar perfis incompletos ou pendentes"
              >
                <RefreshCw size={13} className={isLoadingFirestoreProfiles ? 'animate-spin' : ''} />
                <span>{isLoadingFirestoreProfiles ? 'Verificando...' : 'Verificar Vínculos Firestore'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingUser(null);
                  setUserName('');
                  setUserLogin('');
                  setUserEmail('');
                  setUserInitialPassword('');
                  setShowInitialPassword(false);
                  setUserRole('balconista');
                  setUserCompanyId(activeCompanies.length === 1 ? activeCompanies[0].id : '');
                  setUserStatus('ativo');
                  setUserMaxDiscount('10');
                  setUserCanAlterPosUnitPrice(false);
                  setUserModalError(null);
                  setIsUserModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Novo Usuário</span>
              </button>
            </div>
          </div>

          {firestoreProfilesError && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                <span>Aviso ao auditar perfis no Firestore: {firestoreProfilesError}</span>
              </div>
              <button
                type="button"
                onClick={() => loadFirestoreProfiles(false)}
                className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded-lg cursor-pointer shrink-0"
              >
                Tentar novamente
              </button>
            </div>
          )}

          <div className="divide-y divide-slate-100 text-xs">
            {dbState.users.map((u) => {
              const isProtectedAdminUser =
                u.login === 'admin' ||
                u.id === 'usr-admin' ||
                u.email?.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();
              const isSelfUser = u.id === currentUser.id;
              const hasGoogleEmail = isValidGoogleAccountEmail(u.email || '');
              const userDefaultCompanyId = resolveUserDefaultCompanyId(u);
              const boundCompany = getCompanyInfoById(userDefaultCompanyId);
              const isCompanyValidAndActive = Boolean(boundCompany && boundCompany.status !== 'inativo');
              const remoteProfile = findMatchingFirestoreProfile(u);
              const resolvedUid = u.firebaseUid || remoteProfile?.uid;
              const remoteDefaultCompanyId = resolveUserDefaultCompanyId(remoteProfile);

              // Avalia saúde real do documento /users/{uid} no Firestore
              const hasCompleteRemoteProfile = Boolean(
                remoteProfile &&
                  remoteProfile.uid &&
                  isValidCompanyIdFormat(remoteDefaultCompanyId) &&
                  remoteProfile.createdAt &&
                  remoteProfile.status === u.status &&
                  remoteProfile.role === u.role &&
                  remoteDefaultCompanyId === userDefaultCompanyId
              );
              const needsFirestoreRepair =
                !isProtectedAdminUser &&
                (!isCompanyValidAndActive ||
                  !resolvedUid ||
                  (firestoreProfilesLoaded && !hasCompleteRemoteProfile));

              return (
                <div key={u.id} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-800 text-sm flex items-center gap-2 flex-wrap">
                      <span>{u.name}</span>
                      <span className="text-[10px] font-bold px-2 py-0.2 rounded-full uppercase bg-slate-100 text-slate-700">
                        {u.role}
                      </span>
                      {isProtectedAdminUser ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                          Admin Master
                        </span>
                      ) : null}

                      {/* Selo da Empresa Padrão */}
                      {boundCompany ? (
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            boundCompany.status === 'inativo'
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : boundCompany.type === 'matriz'
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          }`}
                          title={`Empresa Padrão (defaultCompanyId): ${boundCompany.name} (ID: ${boundCompany.id})`}
                        >
                          <Building2 size={10} />
                          <span>
                            Padrão: {boundCompany.tradeName || boundCompany.name} ({boundCompany.type === 'matriz' ? 'Matriz' : 'Filial'})
                            {boundCompany.status === 'inativo' ? ' — INATIVA' : ''}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                          <AlertTriangle size={10} />
                          <span>Sem Empresa Padrão</span>
                        </span>
                      )}
                    </div>

                    <div className="text-slate-500 text-[11px] mt-1 flex flex-wrap items-center gap-2">
                      <span>Login: <strong className="font-mono text-slate-800">@{u.login}</strong></span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1">
                        <Mail size={11} className="text-slate-400" />
                        <strong className="font-mono text-slate-700">{u.email || 'Sem e-mail Google'}</strong>
                      </span>
                      <span>•</span>
                      <span>Desconto Máx: <strong>{u.permissions.maxDiscountPercent}%</strong></span>
                      <span>•</span>

                      {/* Status real no Firebase Auth & Firestore /users/{uid} */}
                      {isProtectedAdminUser || (resolvedUid && (!firestoreProfilesLoaded || hasCompleteRemoteProfile) && isCompanyValidAndActive) ? (
                        <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-flex items-center gap-1">
                          <ShieldCheck size={11} className="text-emerald-600" />
                          <span>Firestore /users OK</span>
                        </span>
                      ) : resolvedUid && firestoreProfilesLoaded && remoteProfile && !hasCompleteRemoteProfile ? (
                        <span className="font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-flex items-center gap-1">
                          <AlertTriangle size={11} className="text-amber-600" />
                          <span>Perfil /users divergente ou incompleto no Firestore</span>
                        </span>
                      ) : (
                        <span className="font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 inline-flex items-center gap-1">
                          <AlertTriangle size={11} className="text-rose-600" />
                          <span>Perfil /users pendente no Firestore (Reparar Vínculo)</span>
                        </span>
                      )}
                    </div>

                    <div className="text-slate-500 text-[11px] mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        <LayoutGrid size={12} className="text-blue-600" />
                        <span>
                          {isProtectedAdminUser
                            ? 'Menus: Todos (Acesso Total)'
                            : `${u.permissions.allowedMenuSections ? u.permissions.allowedMenuSections.length : 'Padrão'} Menus • ${u.permissions.allowedSubItems ? u.permissions.allowedSubItems.length : 'Padrão'} Submenus`}
                        </span>
                      </span>
                      <span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md border ${
                        isProtectedAdminUser || u.permissions.canViewGrossProfit || u.permissions.canViewNetProfit
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        <TrendingUp size={12} className={isProtectedAdminUser || u.permissions.canViewGrossProfit || u.permissions.canViewNetProfit ? 'text-emerald-600' : 'text-slate-400'} />
                        <span>
                          {isProtectedAdminUser
                            ? 'Números da Empresa: Acesso Total'
                            : u.permissions.canViewGrossProfit && u.permissions.canViewNetProfit
                            ? 'Lucro Bruto & Líquido'
                            : u.permissions.canViewGrossProfit
                            ? 'Lucro Bruto (Líquido Oculto)'
                            : u.permissions.canViewNetProfit
                            ? 'Lucro Líquido (Bruto Oculto)'
                            : 'Lucros & Números da Empresa: Ocultos'}
                        </span>
                      </span>
                      {u.role === 'balconista' && (
                        <button
                          type="button"
                          onClick={() => handleToggleBalconistaPosPrice(u)}
                          className={`inline-flex items-center gap-1.5 font-bold px-2.5 py-0.5 rounded-md border transition-colors cursor-pointer ${
                            u.permissions.canAlterPosUnitPrice
                              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
                          }`}
                          title={
                            u.permissions.canAlterPosUnitPrice
                              ? 'Clique para BLOQUEAR a alteração de preço unitário no PDV Balcão para este Balconista'
                              : 'Clique para LIBERAR a alteração de preço unitário no PDV Balcão para este Balconista'
                          }
                        >
                          {u.permissions.canAlterPosUnitPrice ? (
                            <Unlock size={11} className="text-emerald-600" />
                          ) : (
                            <Lock size={11} className="text-slate-400" />
                          )}
                          <span>
                            {u.permissions.canAlterPosUnitPrice
                              ? 'PDV Balcão: Altera Preço Unit. (Liberado)'
                              : 'PDV Balcão: Preço Unit. Bloqueado'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      u.status === 'ativo' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {u.status}
                    </span>

                    {/* Botão de Reparo / Sincronização de Vínculo no Firestore (sem duplicar conta Auth) */}
                    {!isProtectedAdminUser && (
                      needsFirestoreRepair && resolvedUid && isCompanyValidAndActive ? (
                        <button
                          type="button"
                          disabled={quickSyncingUserId === u.id}
                          onClick={() => handleQuickSyncUserProfile(u, resolvedUid)}
                          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 rounded-lg border border-amber-300 transition-colors cursor-pointer shadow-2xs"
                          title="Completar e sincronizar o documento /users/{uid} no Firestore com a empresa vinculada sem duplicar a conta"
                        >
                          <RefreshCw size={12} className={quickSyncingUserId === u.id ? 'animate-spin' : ''} />
                          <span>{quickSyncingUserId === u.id ? 'Sincronizando...' : 'Sincronizar Vínculo'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenRepairModal(u, resolvedUid)}
                          className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer ${
                            needsFirestoreRepair
                              ? 'text-rose-800 bg-rose-50 hover:bg-rose-100 border-rose-300 shadow-2xs'
                              : 'text-slate-700 bg-slate-50 hover:bg-slate-100 border-slate-200'
                          }`}
                          title="Completar ou reparar o vínculo /users/{uid} no Firestore para uma conta já existente no Firebase Authentication"
                        >
                          <Wrench size={12} />
                          <span>{needsFirestoreRepair ? 'Reparar Vínculo' : 'Vínculo Firestore'}</span>
                        </button>
                      )
                    )}

                    {/* Botão Configuração de Menus, Submenus & Números da Empresa (Exclusivo romeujr.suporte@gmail.com) */}
                    <button
                      type="button"
                      onClick={() => handleOpenPermissionsModal(u)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors cursor-pointer shadow-2xs"
                      title={
                        isProtectedAdminUser
                          ? 'Visualizar configuração de menus e números da empresa do Administrador Master'
                          : `Definir quais menus, submenus e números da empresa ${u.name} pode visualizar e utilizar`
                      }
                    >
                      <ShieldCheck size={13} className="text-indigo-600" />
                      <span>Menus & Números</span>
                    </button>

                    {/* Alterar Senha do Admin Master (para o próprio usuário autenticado) ou Enviar Redefinição Firebase */}
                    {isProtectedAdminUser ? (
                      <button
                        type="button"
                        onClick={() => setPasswordChangeUser(u)}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                        title="Alterar senha da conta Administrador Master"
                      >
                        <KeyRound size={13} />
                        <span>Alterar Senha do Admin</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={sendingResetUserId === u.id || !hasGoogleEmail}
                        onClick={() => handleSendPasswordResetForUser(u)}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                        title={
                          hasGoogleEmail
                            ? `Enviar link oficial de redefinição de senha via Firebase Authentication para ${u.email}`
                            : 'Cadastre um e-mail Google (@gmail.com) válido clicando em Editar'
                        }
                      >
                        <KeyRound size={12} />
                        <span>{sendingResetUserId === u.id ? 'Enviando...' : 'Redefinir Senha'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setEditingUser(u);
                        setUserName(u.name);
                        setUserLogin(u.login);
                        const existingEmail = (u.email || '').trim().toLowerCase();
                        setUserEmail(
                          isProtectedAdminUser
                            ? MASTER_ADMIN_EMAIL
                            : isValidGoogleAccountEmail(existingEmail)
                            ? existingEmail
                            : ''
                        );
                        setUserInitialPassword('');
                        setShowInitialPassword(false);
                        setUserRole(u.role);
                        setUserCompanyId(
                          isCompanyValidAndActive
                            ? userDefaultCompanyId
                            : isProtectedAdminUser
                            ? 'comp-matriz'
                            : ''
                        );
                        setUserStatus(u.status || 'ativo');
                        setUserMaxDiscount(String(u.permissions.maxDiscountPercent));
                        setUserCanAlterPosUnitPrice(Boolean(u.permissions.canAlterPosUnitPrice));
                        setUserModalError(null);
                        setIsUserModalOpen(true);
                      }}
                      className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-md cursor-pointer"
                      title="Editar dados cadastrais e Empresa Padrão do usuário"
                    >
                      <Edit2 size={14} />
                    </button>

                    {/* Botão Excluir Usuário (Exclusivo do Admin Master, protegido contra exclusão do Admin Master ou próprio usuário) */}
                    {!isProtectedAdminUser && !isSelfUser && (
                      <button
                        type="button"
                        onClick={() => setUserToDelete(u)}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                        title={`Excluir usuário ${u.name} (@${u.login}) do sistema`}
                      >
                        <Trash2 size={13} />
                        <span>Excluir</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ABA 3: LOGS DE AUDITORIA */}
      {activeTab === 'auditoria' && (
        <div className="space-y-4">
          {/* Painel de Auditoria: Autorizações de Desconto Acima do Limite */}
          {(() => {
            const discountAuthRecords = Database.getAllDiscountAuthorizations();
            return (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="pb-2 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck size={16} className="text-amber-600" />
                      <span>Autorizações de Desconto Excedente por Produto</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Registro administrativo rastreável de todas as exceções liberadas por Administrador ou Gerente Geral (sem armazenamento de senhas).
                    </p>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 self-start sm:self-auto">
                    {discountAuthRecords.length} registro{discountAuthRecords.length === 1 ? '' : 's'}
                  </span>
                </div>

                {discountAuthRecords.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    Nenhuma autorização de desconto acima do limite do produto registrada até o momento.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs max-h-96 overflow-y-auto">
                    {discountAuthRecords.map((rec) => (
                      <div key={`${rec.orderId || ''}-${rec.operationId}`} className="py-3 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                              {rec.orderNumber || rec.orderId || 'Venda'}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">
                              {rec.operationId}
                            </span>
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {rec.origin === 'pdv'
                                ? 'PDV Balcão'
                                : rec.origin === 'externa_celular'
                                ? 'Venda Mobile'
                                : rec.origin === 'edicao_pedido'
                                ? 'Edição de Pedido'
                                : 'Pedido de Venda'}
                            </span>
                          </div>
                          <span className="text-slate-400">
                            {new Date(rec.authorizedAt).toLocaleString('pt-BR')}
                          </span>
                        </div>

                        <div className="font-bold text-slate-800">
                          <span className="font-mono text-blue-700 mr-1">[{rec.productCode}]</span>
                          {rec.productDescription}
                          <span className="font-normal text-slate-500 ml-1.5">
                            (Qtd: {rec.quantity} • Ref.: {formatCurrency(rec.referenceUnitPrice)})
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
                          <span>
                            Limite máx.:{' '}
                            <strong className="text-emerald-700 font-mono">
                              {rec.limitType === 'value'
                                ? `${formatCurrency(rec.maxDiscountConfigured)}/un (${formatCurrency(rec.maxDiscountValueAllowed)})`
                                : `${rec.maxDiscountConfigured}% (${formatCurrency(rec.maxDiscountValueAllowed)})`}
                            </strong>
                          </span>
                          <span>
                            Solicitado:{' '}
                            <strong className="text-rose-700 font-mono">
                              {rec.requestedDiscountPercent.toFixed(2)}% ({formatCurrency(rec.requestedDiscountValue)})
                            </strong>
                          </span>
                          <span>
                            Aplicado:{' '}
                            <strong className="text-slate-900 font-mono">
                              {rec.appliedDiscountPercent.toFixed(2)}% ({formatCurrency(rec.appliedDiscountValue)})
                            </strong>
                          </span>
                        </div>

                        <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>
                            Vendedor: <strong className="text-slate-700">{rec.sellerUserName}</strong>
                          </span>
                          <span>
                            Autorizador:{' '}
                            <strong className="text-blue-700">
                              {rec.authorizerUserName} (@{rec.authorizerUserLogin} —{' '}
                              {rec.authorizerRole === 'admin' ? 'Administrador (Acesso Total)' : 'Gerente Geral'})
                            </strong>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-800">Trilha de Auditoria do Sistema</h3>
              <p className="text-xs text-slate-500">
                Histórico rastreável de todas as ações sensíveis: vendas, cancelamentos, autorizações de desconto, abertura/fechamento de caixa, compras e precificação.
              </p>
            </div>

            <div className="divide-y divide-slate-100 text-xs max-h-96 overflow-y-auto">
              {dbState.auditLogs.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  Nenhum registro de auditoria encontrado.
                </div>
              ) : (
                dbState.auditLogs.map((log) => (
                  <div key={log.id} className="py-2.5">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="font-mono font-bold text-blue-700">{log.action}</span>
                      <span className="text-slate-400">{new Date(log.timestamp).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="font-medium text-slate-800 mt-0.5">{log.details}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Usuário: {log.userName} • Módulo: {log.module}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ABA 4: BACKUP E RESTAURAÇÃO */}
      {activeTab === 'backup' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="pb-2 border-b border-slate-100">
            <h3 className="font-bold text-sm text-slate-800">Backup, Exportação e Restauração Segura</h3>
            <p className="text-xs text-slate-500">
              Gere cópias de segurança de todo o banco de dados em formato JSON, restaure backups ou redefina para os dados de fábrica.
            </p>
          </div>

          <div className={`grid grid-cols-1 ${isMasterAdmin ? 'md:grid-cols-2' : ''} gap-4`}>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h4 className="font-bold text-xs text-slate-800 uppercase">Exportar Cópia de Segurança</h4>
              <p className="text-xs text-slate-500">
                Baixa um arquivo .json com todas as empresas, produtos, compras, estoques, clientes e financeiro.
              </p>
              <button
                onClick={handleExportBackup}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download size={15} />
                <span>Baixar Backup Completo (.json)</span>
              </button>
            </div>

            {isMasterAdmin && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="font-bold text-xs text-slate-800 uppercase">Restaurar Padrões de Fábrica (Iniciar do Zero)</h4>
                <p className="text-xs text-slate-500">
                  Limpa todos os dados operacionais do sistema para iniciar do zero. O usuário "Admin" poderá após o primeiro login cadastrar os dados da empresa matriz, abrir o sistema e começar os demais cadastros.
                </p>
                <button
                  onClick={handleFactoryReset}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw size={15} />
                  <span>Restaurar Padrões de Fábrica</span>
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700">
              Restaurar Dados a Partir de JSON:
            </label>
            <textarea
              rows={4}
              value={jsonBackupText}
              onChange={(e) => setJsonBackupText(e.target.value)}
              placeholder="Cole aqui o conteúdo de um backup .json para restaurar..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
            />
            <div className="flex justify-end">
              <button
                onClick={handleRestoreBackup}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs"
              >
                Restaurar Backup do JSON
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ABA: LIMPEZA E ZERAMENTO DE DADOS (EXCLUSIVO ADMIN) */}
      {isAdmin && activeTab === 'limpeza' && <DataCleanupView />}

      {/* ABA: CONFIGURAÇÃO DE MENUS DO SISTEMA (MENU LATERAL) */}
      {isAdmin && activeTab === 'menus' && (() => {
        const totalSections = MENU_SECTIONS_CATALOG.length;
        const visibleSectionsCount = MENU_SECTIONS_CATALOG.filter(
          (s) => s.id === 'configuracoes' || !menuConfig.hiddenSections.includes(s.id)
        ).length;

        const totalSubItems = MENU_SECTIONS_CATALOG.reduce(
          (acc, s) => acc + (s.subItems ? s.subItems.length : 0),
          0
        );
        const visibleSubItemsCount = MENU_SECTIONS_CATALOG.reduce((acc, s) => {
          if (!s.subItems) return acc;
          const vis = s.subItems.filter((sub) => !menuConfig.hiddenSubItems.includes(sub.id)).length;
          return acc + vis;
        }, 0);

        const filteredCatalogSections = MENU_SECTIONS_CATALOG.filter((sec) => {
          const isSecHidden = sec.id !== 'configuracoes' && menuConfig.hiddenSections.includes(sec.id);

          if (menuStatusFilter === 'visiveis' && isSecHidden) return false;
          if (menuStatusFilter === 'ocultos' && !isSecHidden) return false;

          if (!menuSearchTerm.trim()) return true;
          const term = menuSearchTerm.toLowerCase();
          const matchSection = sec.label.toLowerCase().includes(term) || sec.description.toLowerCase().includes(term);
          const matchSub = sec.subItems?.some(
            (sub) => sub.label.toLowerCase().includes(term) || sub.description.toLowerCase().includes(term)
          );
          return matchSection || matchSub;
        });

        return (
          <div className="space-y-4">
            {/* Top Card: Cabeçalho & Ações Globais */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                    <LayoutGrid size={22} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                      <span>Personalização dos Menus da Barra Lateral</span>
                      <span className="text-[11px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                        {visibleSectionsCount} de {totalSections} menus ativos
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 max-w-2xl mt-0.5">
                      Selecione quais menus principais e submódulos devem ser exibidos no menu lateral esquerdo. 
                      Oculte os recursos que sua empresa não utiliza para simplificar a navegação da equipe.
                    </p>
                  </div>
                </div>

                {/* Botões de Ação Rápida */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={handleShowAllMenus}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    title="Tornar todos os menus e submenus visíveis na barra lateral"
                  >
                    <Eye size={14} />
                    <span>Mostrar Todos</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetMenusDefault}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors cursor-pointer"
                    title="Restaurar a configuração padrão do menu"
                  >
                    <RotateCcw size={14} />
                    <span>Restaurar Padrão</span>
                  </button>
                </div>
              </div>

              {/* Barra de Filtros e Busca Rápida */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                <div className="sm:col-span-7 relative flex items-center">
                  <Search size={15} className="absolute left-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar menu ou submódulo (ex: Produção, Vendas, Estoque)..."
                    value={menuSearchTerm}
                    onChange={(e) => setMenuSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                  {menuSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setMenuSearchTerm('')}
                      className="absolute right-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div className="sm:col-span-5 flex items-center justify-end gap-1.5">
                  <span className="text-[11px] font-bold text-slate-500 mr-1">Filtrar:</span>
                  {(['todos', 'visiveis', 'ocultos'] as const).map((filterOpt) => (
                    <button
                      key={filterOpt}
                      type="button"
                      onClick={() => setMenuStatusFilter(filterOpt)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer capitalize ${
                        menuStatusFilter === filterOpt
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      {filterOpt === 'todos' ? 'Todos' : filterOpt === 'visiveis' ? 'Visíveis' : 'Ocultos'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Indicadores de Resumo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase">Menus Principais</span>
                    <p className="text-sm font-extrabold text-slate-800">
                      {visibleSectionsCount} de {totalSections} visíveis
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    {Math.round((visibleSectionsCount / totalSections) * 100)}%
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase">Submódulos / Telas</span>
                    <p className="text-sm font-extrabold text-slate-800">
                      {visibleSubItemsCount} de {totalSubItems} ativos
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs">
                    {Math.round((visibleSubItemsCount / totalSubItems) * 100)}%
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase">Status da Barra Lateral</span>
                    <p className="text-sm font-extrabold text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 size={14} />
                      <span>Atualização em Tempo Real</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Lista dos Menus */}
            <div className="space-y-3.5">
              {filteredCatalogSections.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2">
                  <LayoutGrid size={32} className="mx-auto text-slate-300" />
                  <h4 className="font-bold text-sm text-slate-700">Nenhum menu encontrado</h4>
                  <p className="text-xs text-slate-500">
                    Nenhum menu corresponde ao termo de busca "{menuSearchTerm}".
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuSearchTerm('');
                      setMenuStatusFilter('todos');
                    }}
                    className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-700"
                  >
                    Limpar filtros
                  </button>
                </div>
              ) : (
                filteredCatalogSections.map((section) => {
                  const isProtected = section.id === 'configuracoes';
                  const isSectionHidden = !isProtected && menuConfig.hiddenSections.includes(section.id);
                  const subItems = section.subItems || [];
                  const visibleSubs = subItems.filter((s) => !menuConfig.hiddenSubItems.includes(s.id));

                  return (
                    <div
                      key={section.id}
                      className={`rounded-2xl border transition-all ${
                        isSectionHidden
                          ? 'bg-slate-50/70 border-slate-200'
                          : 'bg-white border-slate-200 shadow-xs hover:border-slate-300'
                      }`}
                    >
                      {/* Cabeçalho da Seção / Menu Principal */}
                      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isSectionHidden
                                ? 'bg-slate-200 text-slate-600'
                                : 'bg-blue-50 text-blue-700 shadow-xs'
                            }`}
                          >
                            {renderMenuIcon(section.iconName, 20)}
                          </div>

                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-extrabold text-sm sm:text-base text-slate-800">
                                {section.label}
                              </h4>

                              {isProtected ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                  <Lock size={10} />
                                  <span>Protegido (Sempre Visível)</span>
                                </span>
                              ) : isSectionHidden ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                  <EyeOff size={10} />
                                  <span>Oculto da Barra Lateral</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Eye size={10} />
                                  <span>Visível na Barra Lateral</span>
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
                              {section.description}
                            </p>
                          </div>
                        </div>

                        {/* Botão de Toggle da Seção Inteira */}
                        <div className="flex items-center gap-2 sm:self-center shrink-0">
                          {isProtected ? (
                            <div
                              className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-xl text-xs font-bold border border-slate-200 flex items-center gap-1.5 cursor-not-allowed"
                              title="O menu de Configurações não pode ser desativado para garantir a administração do sistema."
                            >
                              <Lock size={13} />
                              <span>Fixado</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleSection(section.id)}
                              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                                isSectionHidden
                                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}
                              title={
                                isSectionHidden
                                  ? `Clique para exibir o menu "${section.label}" no menu lateral`
                                  : `Clique para ocultar o menu "${section.label}" do menu lateral`
                              }
                            >
                              {isSectionHidden ? (
                                <>
                                  <EyeOff size={14} />
                                  <span>Oculto (Clique para Ativar)</span>
                                </>
                              ) : (
                                <>
                                  <Check size={14} />
                                  <span>Menu Ativo</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Subitens da Seção */}
                      {subItems.length > 0 && (
                        <div className="p-4 sm:p-5 bg-slate-50/50 rounded-b-2xl space-y-3">
                          {isSectionHidden ? (
                            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                              <span>
                                Como o menu principal <strong>{section.label}</strong> está ocultado, nenhum dos submódulos abaixo será exibido na barra lateral até que o menu principal seja ativado.
                              </span>
                            </div>
                          ) : null}

                          <div className="flex items-center justify-between pb-1 flex-wrap gap-2">
                            <span className="text-xs font-bold text-slate-600">
                              Submódulos do menu ({visibleSubs.length} de {subItems.length} visíveis):
                            </span>

                            {!isSectionHidden && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleToggleAllSubItemsInSection(section.id, true)}
                                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                                >
                                  Marcar Todos
                                </button>
                                <span className="text-slate-300">•</span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleAllSubItemsInSection(section.id, false)}
                                  className="text-[11px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                                >
                                  Desmarcar Todos
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            {subItems.map((sub) => {
                              const isSubHidden = menuConfig.hiddenSubItems.includes(sub.id);
                              const isSubEffectivelyHidden = isSectionHidden || isSubHidden;

                              return (
                                <button
                                  key={sub.id}
                                  type="button"
                                  disabled={isSectionHidden}
                                  onClick={() => handleToggleSubItem(sub.id)}
                                  className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer disabled:cursor-not-allowed ${
                                    isSubEffectivelyHidden
                                      ? 'bg-white/60 border-slate-200 text-slate-400 opacity-70'
                                      : 'bg-white border-slate-200 hover:border-blue-300 shadow-xs text-slate-800'
                                  }`}
                                >
                                  <div className="pt-0.5 shrink-0">
                                    {!isSubEffectivelyHidden ? (
                                      <CheckSquare size={16} className="text-emerald-600" />
                                    ) : (
                                      <Square size={16} className="text-slate-300" />
                                    )}
                                  </div>

                                  <div className="space-y-0.5 min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <span
                                        className={`text-xs font-bold truncate ${
                                          !isSubEffectivelyHidden ? 'text-slate-900' : 'text-slate-500'
                                        }`}
                                      >
                                        {sub.label}
                                      </span>
                                      {sub.shortcut && (
                                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 bg-slate-100 text-slate-600 border border-slate-200 rounded shrink-0">
                                          {sub.shortcut}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-tight">
                                      {sub.description}
                                    </p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Dica de Rodapé */}
            <div className="p-4 bg-blue-50/60 border border-blue-200/70 rounded-2xl text-xs text-blue-900 flex items-start gap-2.5">
              <Sparkles size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold">Sincronização Automática:</span>
                <p className="text-blue-800/90 leading-relaxed">
                  Todas as seleções de menus e submódulos são salvas no banco de dados e entram em vigor instantaneamente
                  na barra de navegação lateral. Você pode alterar essa configuração a qualquer momento.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ABA 5: CONFIGURAÇÃO DA IMPRESSORA TÉRMICA */}
      {activeTab === 'impressora' && <ThermalPrinterSettings />}

      {activeTab === 'etiquetas' && <ProductLabelsView />}

      {/* ABA 6: PREFERÊNCIAS DO SISTEMA & ALERTAS */}
      {activeTab === 'preferencias' && (() => {
        const isOverdueAlertHidden = dbState.hideOverdueAlert === true || Database.isOverdueAlertHidden();
        const todayIso = new Date().toISOString().split('T')[0];
        const overdueReceivables = dbState.accountsReceivable.filter(
          (r) => r.companyId === currentCompany.id && r.status === 'aberto' && r.dueDate < todayIso
        );
        const totalOverdueBalance = overdueReceivables.reduce((s, r) => s + r.balance, 0);
        const uniqueOverdueCustomerCount = new Set(
          overdueReceivables.map((r) => r.customerId || r.customerName)
        ).size;

        const handleToggleHideOverdueAlert = () => {
          const nextVal = !isOverdueAlertHidden;
          Database.setHideOverdueAlert(nextVal);
          Database.addAuditLog(
            nextVal ? 'OCULTAR_ALERTA_INADIMPLENCIA' : 'EXIBIR_ALERTA_INADIMPLENCIA',
            'CONFIGURACOES',
            'DASHBOARD',
            nextVal
              ? 'Usuário configurou para OCULTAR a mensagem de Alerta de Inadimplência na tela inicial'
              : 'Usuário configurou para EXIBIR a mensagem de Alerta de Inadimplência na tela inicial'
          );
          setDbState({ ...Database.getState() });
          const msg = nextVal
            ? 'Configuração salva: Alerta de Inadimplência ocultado na tela inicial.'
            : 'Configuração salva: Alerta de Inadimplência visível na tela inicial.';
          setPrefSaveMsg(msg);
          toast.success(msg, 'Preferências Atualizadas');
        };

        return (
          <div className="space-y-4">
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                <div>
                  <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                    <Sliders className="text-blue-600" size={18} />
                    <span>Preferências do Sistema, Notificações & Tela Inicial</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Controle as opções visuais da Tela Inicial (Dashboard) e políticas de avisos de inadimplência.
                  </p>
                </div>
              </div>

              {prefSaveMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-400 rounded-xl text-xs font-bold text-emerald-900 flex items-center justify-between gap-2 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>{prefSaveMsg}</span>
                  </div>
                  <button
                    onClick={() => setPrefSaveMsg(null)}
                    className="text-emerald-700 hover:text-emerald-900 p-0.5 rounded cursor-pointer"
                  >
                    <Check size={14} />
                  </button>
                </div>
              )}

              {/* CARD: ALERTA DE INADIMPLÊNCIA NA TELA INICIAL */}
              <div
                className={`p-5 rounded-2xl border-2 transition-all ${
                  isOverdueAlertHidden
                    ? 'bg-slate-50/80 border-slate-200'
                    : 'bg-gradient-to-br from-rose-50/50 via-white to-slate-50 border-rose-200 shadow-xs'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                        isOverdueAlertHidden
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-rose-600 text-white animate-pulse'
                      }`}
                    >
                      <AlertTriangle size={24} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-black uppercase tracking-wider text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-200">
                          Aviso Financeiro
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                            isOverdueAlertHidden
                              ? 'bg-slate-100 text-slate-600 border-slate-300'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          }`}
                        >
                          {isOverdueAlertHidden ? (
                            <>
                              <EyeOff size={12} />
                              <span>Oculto na Tela Inicial</span>
                            </>
                          ) : (
                            <>
                              <Eye size={12} />
                              <span>Visível na Tela Inicial</span>
                            </>
                          )}
                        </span>
                      </div>

                      <h4 className="text-sm sm:text-base font-extrabold text-slate-800">
                        Mensagem de "Alerta de Inadimplência" na Tela Inicial
                      </h4>
                      <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                        Quando ativado, exibe um banner destacado no topo da tela inicial sempre que houver clientes
                        com duplicatas e títulos vencidos, permitindo contato e cobrança imediatos via WhatsApp ou Força
                        de Vendas Mobile. Se desativado, o banner permanece oculto, mantendo a tela inicial limpa.
                      </p>
                    </div>
                  </div>

                  {/* Controle de Toggle / Botão */}
                  <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleToggleHideOverdueAlert}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer ${
                        isOverdueAlertHidden
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-white'
                      }`}
                      title={
                        isOverdueAlertHidden
                          ? 'Clique para ativar a exibição do alerta na tela inicial'
                          : 'Clique para ocultar a mensagem de alerta da tela inicial'
                      }
                    >
                      {isOverdueAlertHidden ? (
                        <>
                          <Eye size={16} />
                          <span>Exibir Alerta na Tela Inicial</span>
                        </>
                      ) : (
                        <>
                          <EyeOff size={16} />
                          <span>Ocultar Alerta na Tela Inicial</span>
                        </>
                      )}
                    </button>
                    <span className="text-[11px] text-slate-500">
                      {isOverdueAlertHidden
                        ? 'O banner está ocultado atualmente'
                        : 'O banner está em exibição no Dashboard'}
                    </span>
                  </div>
                </div>

                {/* Resumo em tempo real de clientes com pendências */}
                <div className="mt-4 pt-4 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-center sm:text-left">
                    <span className="text-[11px] text-slate-500 font-semibold uppercase">Clientes Inadimplentes</span>
                    <p className="text-base font-extrabold text-slate-800 mt-0.5">
                      {uniqueOverdueCustomerCount} cliente{uniqueOverdueCustomerCount === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-center sm:text-left">
                    <span className="text-[11px] text-slate-500 font-semibold uppercase">Parcelas Vencidas</span>
                    <p className="text-base font-extrabold text-slate-800 mt-0.5">
                      {overdueReceivables.length} parcela{overdueReceivables.length === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-center sm:text-left">
                    <span className="text-[11px] text-slate-500 font-semibold uppercase">Total em Atraso</span>
                    <p className="text-base font-extrabold text-rose-600 font-mono mt-0.5">
                      {formatCurrency(totalOverdueBalance)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-500 bg-white/70 p-2.5 rounded-lg border border-slate-200/60">
                  <span>
                    💡 <strong>Dica:</strong> A opção selecionada é salva automaticamente no banco local e pode ser
                    alternada a qualquer momento tanto aqui quanto na própria barra superior da tela inicial.
                  </span>
                </div>
              </div>

              {/* CARD: POLÍTICA DE CONTROLE DE ESTOQUE POR EMPRESA & VENDA COM ESTOQUE NEGATIVO */}
              {(() => {
                const stockConfig = Database.getStockControlConfig();
                const canSellNegative = Database.canSellNegativeStock();
                const totalNegativeProducts = dbState.stockBalances.filter((b) => b.quantity < 0).length;

                const handleToggleStockControl = () => {
                  const nextVal = !stockConfig.enableStockControl;
                  const updated = Database.updateStockControlConfig({ enableStockControl: nextVal });
                  setDbState({ ...Database.getState() });
                  const msg = nextVal
                    ? 'Controle de estoque ATIVADO no sistema.'
                    : 'Controle de estoque DESATIVADO. Vendas com saldo zerado/negativo estão permitidas livremente.';
                  setPrefSaveMsg(msg);
                  toast.success(msg, 'Controle de Estoque');
                };

                const handleToggleAllowNegativeStock = () => {
                  const nextVal = !stockConfig.allowNegativeStock;
                  const updated = Database.updateStockControlConfig({ allowNegativeStock: nextVal });
                  setDbState({ ...Database.getState() });
                  const msg = nextVal
                    ? 'Permissão de venda com estoque negativo HABILITADA. O PDV e pedidos não serão bloqueados por falta de saldo.'
                    : 'Venda com estoque negativo BLOQUEADA. O sistema exigirá saldo físico para concluir saídas e vendas.';
                  setPrefSaveMsg(msg);
                  toast.success(msg, 'Política de Estoque Negativo');
                };

                return (
                  <div
                    className={`p-5 rounded-2xl border-2 transition-all ${
                      canSellNegative
                        ? 'bg-gradient-to-br from-amber-50/60 via-white to-slate-50 border-amber-200 shadow-xs'
                        : 'bg-gradient-to-br from-emerald-50/60 via-white to-slate-50 border-emerald-200 shadow-xs'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                            canSellNegative
                              ? 'bg-amber-500 text-white'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          <Boxes size={24} />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-full border border-indigo-200">
                              Gestão de Estoque
                            </span>
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                                stockConfig.enableStockControl
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-300'
                              }`}
                            >
                              <Warehouse size={12} />
                              <span>{stockConfig.enableStockControl ? 'Controle de Estoque Ativo' : 'Controle Desativado'}</span>
                            </span>
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                                canSellNegative
                                  ? 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold'
                                  : 'bg-blue-100 text-blue-900 border-blue-300'
                              }`}
                            >
                              <CheckCircle2 size={12} />
                              <span>{canSellNegative ? 'Venda com Estoque Negativo: LIBERADA' : 'Venda Negativa: BLOQUEADA'}</span>
                            </span>
                          </div>

                          <h4 className="text-sm sm:text-base font-extrabold text-slate-800">
                            Controle de Estoque & Permissão de Vendas com Estoque Negativo
                          </h4>
                          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                            Configure se o sistema deve controlar o estoque e se é permitido realizar vendas de produtos
                            com saldo zerado ou insuficiente no PDV Balcão, Pedido de Venda e Venda Mobile.
                            Quando a venda com estoque negativo está habilitada, a venda é finalizada normalmente e o saldo
                            fica negativo até que nova compra, produção ou ajuste alimente o estoque da respectiva empresa.
                          </p>
                        </div>
                      </div>

                      {/* Botões de Ação */}
                      <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleToggleStockControl}
                          className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer ${
                            stockConfig.enableStockControl
                              ? 'bg-slate-800 hover:bg-slate-700 text-white'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          }`}
                        >
                          <span>{stockConfig.enableStockControl ? 'Desativar Controle de Estoque' : 'Ativar Controle de Estoque'}</span>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-white/20">
                            {stockConfig.enableStockControl ? 'Ativo' : 'Inativo'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={handleToggleAllowNegativeStock}
                          className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer ${
                            stockConfig.allowNegativeStock
                              ? 'bg-rose-700 hover:bg-rose-600 text-white'
                              : 'bg-amber-600 hover:bg-amber-500 text-white'
                          }`}
                        >
                          <span>{stockConfig.allowNegativeStock ? 'Bloquear Venda com Estoque Negativo' : 'Permitir Venda com Estoque Negativo'}</span>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-white/20">
                            {stockConfig.allowNegativeStock ? 'Liberado' : 'Bloqueado'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Resumo e Indicadores do Estoque */}
                    <div className="mt-4 pt-4 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <span className="text-[11px] text-slate-500 font-semibold uppercase">Modo Operacional</span>
                        <p className={`text-sm font-extrabold mt-0.5 ${canSellNegative ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {canSellNegative ? 'Vendas Contínuas (Sem Travar)' : 'Rigoroso (Exige Saldo Físico)'}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {canSellNegative
                            ? 'Vendedores podem emitir pedidos mesmo sem estoque disponível'
                            : 'Vendas são bloqueadas caso o produto não tenha saldo no local'}
                        </p>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <span className="text-[11px] text-slate-500 font-semibold uppercase">Alimentação por Empresa</span>
                        <p className="text-sm font-extrabold text-indigo-700 mt-0.5">
                          {dbState.companies.length} Empresa{dbState.companies.length === 1 ? '' : 's'} Configurada{dbState.companies.length === 1 ? '' : 's'}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Compras, inventários e produção exigem seleção da empresa para alimentar estoque
                        </p>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200">
                        <span className="text-[11px] text-slate-500 font-semibold uppercase">Itens com Saldo Negativo</span>
                        <p className={`text-sm font-extrabold mt-0.5 ${totalNegativeProducts > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                          {totalNegativeProducts} registro{totalNegativeProducts === 1 ? '' : 's'}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {totalNegativeProducts > 0
                            ? 'Produtos com saldo negativo aguardando reposição'
                            : 'Nenhum saldo negativo registrado no momento'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* Modal Empresa */}
      {isCompanyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveCompany}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-3"
          >
            <h3 className="font-bold text-base text-slate-800">
              {editingCompany ? 'Editar Empresa/Filial' : 'Nova Filial'}
            </h3>

            <div className="space-y-2 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Razão Social *</label>
                <input
                  type="text"
                  required
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome Fantasia</label>
                <input
                  type="text"
                  value={compTradeName}
                  onChange={(e) => setCompTradeName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">CNPJ *</label>
                <input
                  type="text"
                  required
                  value={compCnpj}
                  onChange={(e) => setCompCnpj(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo</label>
                  <select
                    value={compType}
                    onChange={(e) => setCompType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2"
                  >
                    <option value="filial">Filial</option>
                    <option value="matriz">Matriz</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={compPhone}
                    onChange={(e) => setCompPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cidade</label>
                  <input
                    type="text"
                    value={compCity}
                    onChange={(e) => setCompCity(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={compState}
                    onChange={(e) => setCompState(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Logomarca da Empresa */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block font-bold text-slate-700 text-xs">
                  Logomarca da Empresa (Logo)
                </label>
                <div className="flex items-center gap-3">
                  {compLogoUrl ? (
                    <div className="relative group w-16 h-16 rounded-xl border border-slate-300 bg-white p-1 flex items-center justify-center shadow-2xs shrink-0">
                      <img
                        src={compLogoUrl}
                        alt="Prévia da Logomarca"
                        className="w-full h-full object-contain rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setCompLogoUrl('')}
                        className="absolute -top-1.5 -right-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-1 shadow-xs cursor-pointer transition-transform group-hover:scale-110"
                        title="Remover Logomarca"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-slate-100 flex flex-col items-center justify-center text-slate-400 shrink-0">
                      <Building2 size={20} className="mb-0.5" />
                      <span className="text-[9px] font-semibold">Sem logo</span>
                    </div>
                  )}

                  <div className="flex-1 space-y-1">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 shadow-2xs cursor-pointer transition-colors">
                      <Upload size={14} className="text-blue-600" />
                      <span>{compLogoUrl ? 'Trocar Imagem...' : 'Carregar Imagem...'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const optimized = await processLogoFile(file);
                            setCompLogoUrl(optimized);
                            toast.success('Logomarca carregada com sucesso!', 'Imagem Processada');
                          } catch (err: any) {
                            toast.error(err.message || 'Erro ao carregar a imagem.');
                          }
                        }}
                      />
                    </label>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      PNG, JPG, WebP ou SVG (otimizada automaticamente).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCompanyModalOpen(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs"
              >
                Salvar Empresa
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Usuário (Exclusivo romeujr.suporte@gmail.com) */}
      {isMasterAdmin && isUserModalOpen && (() => {
        const isTargetProtectedAdmin =
          !!editingUser &&
          (editingUser.login === 'admin' ||
            editingUser.id === 'usr-admin' ||
            editingUser.email?.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase());
        const detectedRemote = editingUser ? findMatchingFirestoreProfile(editingUser) : undefined;
        const hasExistingUid = Boolean(editingUser?.firebaseUid || detectedRemote?.uid);
        const requiresInitialPassword = !isTargetProtectedAdmin && (!editingUser || !hasExistingUid);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
            <form
              onSubmit={handleSaveUser}
              className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-3 my-auto"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-base text-slate-800">
                  {editingUser ? 'Editar Usuário' : 'Novo Usuário (Firebase Auth)'}
                </h3>
                <button
                  type="button"
                  disabled={isSavingUser}
                  onClick={() => setIsUserModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {userModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800 font-semibold">
                  <AlertTriangle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>{userModalError}</span>
                </div>
              )}

              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    disabled={isSavingUser}
                    value={userName}
                    onChange={(e) => {
                      setUserName(e.target.value);
                      setUserModalError(null);
                    }}
                    placeholder="Nome completo do colaborador"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    E-mail da Conta Google (@gmail.com) *
                  </label>
                  <input
                    type="email"
                    required
                    disabled={isSavingUser || isTargetProtectedAdmin || hasExistingUid}
                    value={userEmail}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUserEmail(val);
                      if (!editingUser && !userLogin.trim() && val.includes('@')) {
                        setUserLogin(val.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase());
                      }
                      setUserModalError(null);
                    }}
                    placeholder="usuario@gmail.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono disabled:opacity-60"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    {hasExistingUid
                      ? 'Conta já vinculada ao Firebase Authentication.'
                      : 'Informe um e-mail Google válido (@gmail.com) para criar a conta no Firebase Authentication.'}
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Login de Acesso (@identificador) *</label>
                  <input
                    type="text"
                    required
                    disabled={isSavingUser || isTargetProtectedAdmin}
                    value={userLogin}
                    onChange={(e) => {
                      setUserLogin(e.target.value);
                      setUserModalError(null);
                    }}
                    placeholder="ex: maria.vendas"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold disabled:opacity-60"
                  />
                </div>

                {/* CAMPO OBRIGATÓRIO: EMPRESA PADRÃO (MATRIZ OU FILIAL) */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Building2 size={13} className="text-blue-600" />
                    <span>Empresa Padrão *</span>
                  </label>
                  <select
                    required
                    disabled={isSavingUser}
                    value={userCompanyId}
                    onChange={(e) => {
                      setUserCompanyId(e.target.value);
                      setUserModalError(null);
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800 disabled:opacity-60 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Selecione a Matriz ou uma Filial...</option>
                    {activeCompanies.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.tradeName || comp.name} ({comp.type === 'matriz' ? 'Matriz' : 'Filial'}) — {comp.address?.city || comp.cnpjCpf}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                    Define a empresa aberta automaticamente no login (<code className="font-mono">defaultCompanyId</code>). Usuários ativos autenticados podem alternar entre Matriz e Filiais deste ERP, mantendo as permissões do perfil.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Perfil de Acesso</label>
                    <select
                      disabled={isSavingUser || isTargetProtectedAdmin}
                      value={userRole}
                      onChange={(e) => setUserRole(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold disabled:opacity-60"
                    >
                      <option value="admin">Administrador (Acesso Total)</option>
                      <option value="gerente">Gerente Geral</option>
                      <option value="balconista">Balconista de PDV</option>
                      <option value="vendedor_externo">Vendedor Externo Mobile</option>
                      <option value="financeiro">Financeiro / Contas</option>
                    </select>
                  </div>

                  {editingUser && !isTargetProtectedAdmin ? (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Status de Acesso</label>
                      <select
                        disabled={isSavingUser}
                        value={userStatus}
                        onChange={(e) => setUserStatus(e.target.value as 'ativo' | 'inativo')}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold"
                      >
                        <option value="ativo">Ativo (Liberado)</option>
                        <option value="inativo">Inativo (Bloqueado)</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Desconto Máximo (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        disabled={isSavingUser}
                        value={userMaxDiscount}
                        onChange={(e) => setUserMaxDiscount(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                      />
                    </div>
                  )}
                </div>

                {editingUser && !isTargetProtectedAdmin && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Desconto Máximo Autorizado (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      disabled={isSavingUser}
                      value={userMaxDiscount}
                      onChange={(e) => setUserMaxDiscount(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                    />
                  </div>
                )}

                {userRole === 'balconista' && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Tag size={13} className={userCanAlterPosUnitPrice ? 'text-emerald-600' : 'text-slate-400'} />
                        <span>Alterar Preço Unitário no PDV Balcão</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        Permite que este Balconista edite o campo <strong>Preço Unit.</strong> na hora da venda no PDV Balcão.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={userCanAlterPosUnitPrice}
                      disabled={isSavingUser}
                      onClick={() => setUserCanAlterPosUnitPrice((prev) => !prev)}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-50 ${
                        userCanAlterPosUnitPrice
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300'
                      }`}
                    >
                      {userCanAlterPosUnitPrice ? <Unlock size={12} /> : <Lock size={12} />}
                      <span>{userCanAlterPosUnitPrice ? 'Liberado' : 'Bloqueado'}</span>
                    </button>
                  </div>
                )}

                {requiresInitialPassword && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Senha Inicial no Firebase Authentication *
                    </label>
                    <div className="relative">
                      <input
                        type={showInitialPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        disabled={isSavingUser}
                        value={userInitialPassword}
                        onChange={(e) => {
                          setUserInitialPassword(e.target.value);
                          setUserModalError(null);
                        }}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full px-3 py-2 pr-10 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowInitialPassword(!showInitialPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                        title={showInitialPassword ? 'Ocultar senha' : 'Exibir senha'}
                      >
                        {showInitialPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Informação sobre Autenticação Integrada */}
                <div className="p-2.5 bg-blue-50/80 border border-blue-200/80 rounded-xl space-y-1 text-[11px] text-blue-900">
                  <div className="flex items-center gap-1.5 font-bold text-blue-950">
                    <ShieldCheck size={13} className="text-blue-600" />
                    <span>Provisionamento & Perfil no Firestore:</span>
                  </div>
                  <p className="text-blue-800 leading-snug">
                    Ao salvar, o perfil <code className="font-mono">/users/&#123;uid&#125;</code> é gravado com o campo <strong>defaultCompanyId</strong> (e <code className="font-mono">companyId</code> sincronizado) da Empresa Padrão selecionada, mantendo todas as regras RBAC do perfil.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingUser}
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg shadow-xs cursor-pointer"
                >
                  {isSavingUser ? 'Sincronizando no Firebase...' : 'Salvar Usuário'}
                </button>
              </div>
            </form>
          </div>
        );
      })()}

      {/* Modal de Reparo / Complementação de Vínculo no Firestore (Conta Existente sem Duplicar Auth) */}
      {isMasterAdmin && repairTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleExecuteRepairUser}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-3 my-auto"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Link2 size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Reparar Vínculo no Firestore
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {repairTargetUser.name} (@{repairTargetUser.login}) • {repairTargetUser.email || 'Sem e-mail'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isRepairingUser}
                onClick={() => setRepairTargetUser(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 leading-snug">
              <strong>Seguro (sem duplicação):</strong> Esta ação apenas cria ou atualiza o documento <code className="font-mono">/users/&#123;uid&#125;</code> e sincroniza <code className="font-mono">registeredCompanyIds</code> para uma conta <strong>já existente</strong> no Firebase Authentication. Nenhuma nova conta será criada.
            </div>

            {repairError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800 font-semibold">
                <AlertTriangle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                <span>{repairError}</span>
              </div>
            )}

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Building2 size={13} className="text-blue-600" />
                  <span>Empresa Padrão *</span>
                </label>
                <select
                  required
                  disabled={isRepairingUser}
                  value={repairCompanyId}
                  onChange={(e) => {
                    setRepairCompanyId(e.target.value);
                    setRepairError(null);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800"
                >
                  <option value="">Selecione a Matriz ou uma Filial...</option>
                  {activeCompanies.map((comp) => (
                    <option key={comp.id} value={comp.id}>
                      {comp.tradeName || comp.name} ({comp.type === 'matriz' ? 'Matriz' : 'Filial'}) — {comp.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Perfil de Acesso</label>
                  <select
                    disabled={isRepairingUser}
                    value={repairRole}
                    onChange={(e) => setRepairRole(e.target.value as UserRole)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold"
                  >
                    <option value="admin">Administrador</option>
                    <option value="gerente">Gerente Geral</option>
                    <option value="balconista">Balconista PDV</option>
                    <option value="vendedor_externo">Vendedor Externo</option>
                    <option value="financeiro">Financeiro</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select
                    disabled={isRepairingUser}
                    value={repairStatus}
                    onChange={(e) => setRepairStatus(e.target.value as 'ativo' | 'inativo')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold"
                  >
                    <option value="ativo">Ativo (Liberado)</option>
                    <option value="inativo">Inativo (Bloqueado)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  UID do Firebase Authentication
                </label>
                <input
                  type="text"
                  disabled={isRepairingUser}
                  value={repairExistingUid}
                  onChange={(e) => {
                    setRepairExistingUid(e.target.value);
                    setRepairError(null);
                  }}
                  placeholder="Cole o UID do usuário no Firebase Auth (se conhecido)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px]"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  {repairExistingUid.trim()
                    ? 'UID identificado! Não é necessário informar a senha do usuário.'
                    : 'Se não souber o UID, deixe em branco e informe abaixo a senha atual da conta já cadastrada.'}
                </p>
              </div>

              {!repairExistingUid.trim() && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Ou informe a Senha Atual da Conta Existente
                  </label>
                  <div className="relative">
                    <input
                      type={showRepairPassword ? 'text' : 'password'}
                      disabled={isRepairingUser}
                      value={repairExistingPassword}
                      onChange={(e) => {
                        setRepairExistingPassword(e.target.value);
                        setRepairError(null);
                      }}
                      placeholder="Senha já cadastrada no Firebase Auth"
                      className="w-full px-3 py-2 pr-10 bg-slate-50 border border-slate-200 rounded-lg font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRepairPassword(!showRepairPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showRepairPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isRepairingUser}
                onClick={() => setRepairTargetUser(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isRepairingUser}
                className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Wrench size={13} />
                <span>{isRepairingUser ? 'Reparando no Firestore...' : 'Completar / Reparar Vínculo'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Configuração de Menus, Submenus & Números da Empresa (Exclusivo para romeujr.suporte@gmail.com e @admin) */}
      {isMasterAdmin && userConfiguringPermissions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in fade-in-50 duration-150">
            {/* Cabeçalho do Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                    <span>Permissões de Menus, Submenus & Números da Empresa</span>
                  </h3>
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-800">{userConfiguringPermissions.name}</span>
                    <span>•</span>
                    <span>Login: <strong className="font-mono text-indigo-700 font-bold">@{userConfiguringPermissions.login}</strong></span>
                    <span>•</span>
                    <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      Perfil: {userConfiguringPermissions.role}
                    </span>
                    {userConfiguringPermissions.login === 'admin' ? (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                        Admin Master (Acesso Total)
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setUserConfiguringPermissions(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                title="Fechar sem salvar"
              >
                <X size={18} />
              </button>
            </div>

            {/* Aviso Informativo de Segurança */}
            <div className="px-5 py-2.5 bg-indigo-50/80 border-b border-indigo-100 text-xs text-indigo-900 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-indigo-600 shrink-0" />
                <span className="leading-snug">
                  <strong>Apenas o usuário "admin"</strong> pode definir quais menus e submenus cada usuário pode utilizar e se poderá visualizar dados estratégicos da empresa (como <strong>Lucro Bruto</strong> ou <strong>Lucro Líquido</strong>).
                </span>
              </div>
            </div>

            {/* Navegação entre Abas do Modal */}
            <div className="flex items-center gap-2 px-5 pt-3 pb-2 border-b border-slate-100 bg-white">
              <button
                type="button"
                onClick={() => setPermModalTab('numeros')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  permModalTab === 'numeros'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <DollarSign size={15} />
                <span>Números da Empresa & Lucratividade</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  permModalTab === 'numeros' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {Object.values(tempFinPerms).filter(Boolean).length}/6 ativos
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPermModalTab('menus')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  permModalTab === 'menus'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <LayoutGrid size={15} />
                <span>Menus & Submenus Permitidos</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  permModalTab === 'menus' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {tempAllowedSections.length} menus • {tempAllowedSubItems.length} submenus
                </span>
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* ======================================================== */}
              {/* ABA 1: VISIBILIDADE DE NÚMEROS DA EMPRESA & LUCRATIVIDADE */}
              {/* ======================================================== */}
              {permModalTab === 'numeros' && (
                <div className="space-y-4">
                  {/* Permissão Operacional Específica do Balconista no PDV Balcão */}
                  {userConfiguringPermissions.role === 'balconista' && (
                    <div
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        tempCanAlterPosUnitPrice
                          ? 'bg-emerald-50/70 border-emerald-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            tempCanAlterPosUnitPrice
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {tempCanAlterPosUnitPrice ? <Unlock size={17} /> : <Lock size={17} />}
                        </div>
                        <div>
                          <div className="text-xs font-extrabold text-slate-900">
                            PDV Balcão: Alteração de Preço Unitário na Venda
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                            Define se este usuário com perfil <strong>Balconista</strong> pode editar o campo <strong>Preço Unit.</strong> durante a venda no PDV Balcão.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={tempCanAlterPosUnitPrice}
                        onClick={() => setTempCanAlterPosUnitPrice((prev) => !prev)}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          tempCanAlterPosUnitPrice
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        {tempCanAlterPosUnitPrice ? <Unlock size={14} /> : <Lock size={14} />}
                        <span>{tempCanAlterPosUnitPrice ? 'Permitido no PDV' : 'Bloqueado no PDV'}</span>
                      </button>
                    </div>
                  )}

                  {/* Presets Rápidos */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Predefinições Rápidas de Segurança:</span>
                      <span className="text-[11px] text-slate-500">Configure rapidamente o perfil de visualização financeira deste usuário:</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setTempFinPerms({
                            canViewGrossProfit: false,
                            canViewNetProfit: false,
                            canViewTotalRevenue: false,
                            canViewProfitMargin: false,
                            canViewProductCosts: false,
                            canViewCashBalances: false,
                          });
                          toast.info('Todos os números e lucros da empresa foram ocultados para este usuário.');
                        }}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        title="Ocultar todos os números estratégicos, custos e lucros da empresa"
                      >
                        Ocultar Todos os Números
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTempFinPerms({
                            canViewGrossProfit: true,
                            canViewNetProfit: false,
                            canViewTotalRevenue: true,
                            canViewProfitMargin: true,
                            canViewProductCosts: true,
                            canViewCashBalances: false,
                          });
                          toast.info('Permissões ajustadas para: Apenas Lucro Bruto e Faturamento.');
                        }}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        title="Permitir Lucro Bruto e Faturamento, mantendo Lucro Líquido e Saldos protegidos"
                      >
                        Apenas Lucro Bruto & Vendas
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTempFinPerms({
                            canViewGrossProfit: true,
                            canViewNetProfit: true,
                            canViewTotalRevenue: true,
                            canViewProfitMargin: true,
                            canViewProductCosts: true,
                            canViewCashBalances: true,
                          });
                          toast.info('Acesso total liberado para todos os indicadores financeiros.');
                        }}
                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        title="Liberar todos os números e lucros da empresa para este usuário"
                      >
                        Liberar Todos os Indicadores
                      </button>
                    </div>
                  </div>

                  {/* Lista de Métricas Sensíveis */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* 1. LUCRO BRUTO */}
                    <div
                      onClick={() =>
                        setTempFinPerms((prev) => ({ ...prev, canViewGrossProfit: !prev.canViewGrossProfit }))
                      }
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        tempFinPerms.canViewGrossProfit
                          ? 'bg-emerald-50/50 border-emerald-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                            <TrendingUp size={16} className={tempFinPerms.canViewGrossProfit ? 'text-emerald-600' : 'text-slate-400'} />
                            <span>Visualizar Lucro Bruto (Real)</span>
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            tempFinPerms.canViewGrossProfit ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {tempFinPerms.canViewGrossProfit ? 'Permitido' : 'Oculto / Bloqueado'}
                          </span>
                        </div>
                        <p className="text-slate-600 text-xs leading-relaxed">
                          Permite ao usuário visualizar o <strong>Lucro Bruto Real</strong> em R$ (Receita de Vendas menos Custo CMV). 
                          Quando desativado, o Lucro Bruto é substituído por aviso de informação restrita no Dashboard e relatórios.
                        </p>
                        <div className="p-2 bg-amber-50/80 rounded-lg border border-amber-200/80 text-[11px] text-amber-900 font-medium">
                          💡 <em>Recomendado ocultar para balconistas e vendedores de balcão que não devam saber o lucro bruto da empresa.</em>
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-200/70 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">Status para este usuário:</span>
                        <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          tempFinPerms.canViewGrossProfit ? 'bg-emerald-600' : 'bg-slate-300'
                        }`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            tempFinPerms.canViewGrossProfit ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </div>
                      </div>
                    </div>

                    {/* 2. LUCRO LÍQUIDO & DRE */}
                    <div
                      onClick={() =>
                        setTempFinPerms((prev) => ({ ...prev, canViewNetProfit: !prev.canViewNetProfit }))
                      }
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        tempFinPerms.canViewNetProfit
                          ? 'bg-emerald-50/50 border-emerald-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                            <DollarSign size={16} className={tempFinPerms.canViewNetProfit ? 'text-emerald-600' : 'text-slate-400'} />
                            <span>Visualizar Lucro Líquido & DRE</span>
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            tempFinPerms.canViewNetProfit ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {tempFinPerms.canViewNetProfit ? 'Permitido' : 'Oculto / Bloqueado'}
                          </span>
                        </div>
                        <p className="text-slate-600 text-xs leading-relaxed">
                          Permite visualizar o <strong>Lucro Líquido</strong> final da empresa após dedução de todas as despesas fixas, despesas operacionais, comissões e impostos (DRE - Demonstrativo de Resultados).
                        </p>
                        <div className="p-2 bg-rose-50/80 rounded-lg border border-rose-200/80 text-[11px] text-rose-900 font-medium">
                          🔒 <em>Dado de máxima confidencialidade da diretoria. Mantenha desativado para usuários operacionais e vendedores.</em>
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-200/70 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">Status para este usuário:</span>
                        <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          tempFinPerms.canViewNetProfit ? 'bg-emerald-600' : 'bg-slate-300'
                        }`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            tempFinPerms.canViewNetProfit ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </div>
                      </div>
                    </div>

                    {/* 3. FATURAMENTO TOTAL / RECEITA GLOBAL */}
                    <div
                      onClick={() =>
                        setTempFinPerms((prev) => ({ ...prev, canViewTotalRevenue: !prev.canViewTotalRevenue }))
                      }
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        tempFinPerms.canViewTotalRevenue
                          ? 'bg-blue-50/50 border-blue-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                            <BarChart3 size={16} className={tempFinPerms.canViewTotalRevenue ? 'text-blue-600' : 'text-slate-400'} />
                            <span>Visualizar Faturamento Global</span>
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            tempFinPerms.canViewTotalRevenue ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {tempFinPerms.canViewTotalRevenue ? 'Permitido' : 'Oculto / Bloqueado'}
                          </span>
                        </div>
                        <p className="text-slate-600 text-xs leading-relaxed">
                          Permite ver o montante total de faturamento em R$ da empresa no dia, mês e ano no Dashboard e relatórios consolidados.
                        </p>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-200/70 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">Status para este usuário:</span>
                        <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          tempFinPerms.canViewTotalRevenue ? 'bg-blue-600' : 'bg-slate-300'
                        }`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            tempFinPerms.canViewTotalRevenue ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </div>
                      </div>
                    </div>

                    {/* 4. MARGEM DE LUCRO (%) & MARKUP */}
                    <div
                      onClick={() =>
                        setTempFinPerms((prev) => ({ ...prev, canViewProfitMargin: !prev.canViewProfitMargin }))
                      }
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        tempFinPerms.canViewProfitMargin
                          ? 'bg-blue-50/50 border-blue-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                            <Percent size={16} className={tempFinPerms.canViewProfitMargin ? 'text-blue-600' : 'text-slate-400'} />
                            <span>Visualizar Margens (%) & Markup</span>
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            tempFinPerms.canViewProfitMargin ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {tempFinPerms.canViewProfitMargin ? 'Permitido' : 'Oculto / Bloqueado'}
                          </span>
                        </div>
                        <p className="text-slate-600 text-xs leading-relaxed">
                          Permite consultar os percentuais exatos de margem de contribuição sobre a venda e índices de markup aplicados aos produtos e propostas comerciais.
                        </p>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-200/70 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">Status para este usuário:</span>
                        <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          tempFinPerms.canViewProfitMargin ? 'bg-blue-600' : 'bg-slate-300'
                        }`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            tempFinPerms.canViewProfitMargin ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </div>
                      </div>
                    </div>

                    {/* 5. CUSTO DE PRODUTOS & CMV */}
                    <div
                      onClick={() =>
                        setTempFinPerms((prev) => ({ ...prev, canViewProductCosts: !prev.canViewProductCosts }))
                      }
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        tempFinPerms.canViewProductCosts
                          ? 'bg-blue-50/50 border-blue-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                            <Warehouse size={16} className={tempFinPerms.canViewProductCosts ? 'text-blue-600' : 'text-slate-400'} />
                            <span>Visualizar Custo de Fornecedores</span>
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            tempFinPerms.canViewProductCosts ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {tempFinPerms.canViewProductCosts ? 'Permitido' : 'Oculto / Bloqueado'}
                          </span>
                        </div>
                        <p className="text-slate-600 text-xs leading-relaxed">
                          Permite ver o preço de compra de fornecedores e o custo unitário de mercadorias e matérias-primas no catálogo e no estoque.
                        </p>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-200/70 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">Status para este usuário:</span>
                        <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          tempFinPerms.canViewProductCosts ? 'bg-blue-600' : 'bg-slate-300'
                        }`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            tempFinPerms.canViewProductCosts ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </div>
                      </div>
                    </div>

                    {/* 6. SALDOS EM CAIXA & CONTAS BANCÁRIAS */}
                    <div
                      onClick={() =>
                        setTempFinPerms((prev) => ({ ...prev, canViewCashBalances: !prev.canViewCashBalances }))
                      }
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        tempFinPerms.canViewCashBalances
                          ? 'bg-blue-50/50 border-blue-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                            <CircleDollarSign size={16} className={tempFinPerms.canViewCashBalances ? 'text-blue-600' : 'text-slate-400'} />
                            <span>Visualizar Saldos Bancários & Caixa</span>
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            tempFinPerms.canViewCashBalances ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {tempFinPerms.canViewCashBalances ? 'Permitido' : 'Oculto / Bloqueado'}
                          </span>
                        </div>
                        <p className="text-slate-600 text-xs leading-relaxed">
                          Permite consultar saldos disponíveis em contas correntes, caixas da empresa e totais acumulados de títulos a pagar e a receber.
                        </p>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-200/70 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">Status para este usuário:</span>
                        <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          tempFinPerms.canViewCashBalances ? 'bg-blue-600' : 'bg-slate-300'
                        }`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            tempFinPerms.canViewCashBalances ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* ABA 2: CONTROLE GRANULAR DE MENUS E SUBMENUS             */}
              {/* ======================================================== */}
              {permModalTab === 'menus' && (
                <div className="space-y-4">
                  {/* Barra de Ações e Busca */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar menu ou submódulo (ex: Romaneio, Pedidos, Caixa)..."
                        value={permMenuSearch}
                        onChange={(e) => setPermMenuSearch(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-indigo-500"
                      />
                      {permMenuSearch && (
                        <button
                          type="button"
                          onClick={() => setPermMenuSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                      <button
                        type="button"
                        onClick={handleSelectAllMenus}
                        className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                        title="Marcar todos os menus e submenus como permitidos para este usuário"
                      >
                        Marcar Todos
                      </button>
                      <button
                        type="button"
                        onClick={handleDeselectAllMenus}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                        title="Desmarcar todos os menus (deixando apenas o Início/Dashboard)"
                      >
                        Bloquear Todos
                      </button>
                      <button
                        type="button"
                        onClick={handleResetToRoleDefaults}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 transition-colors cursor-pointer flex items-center gap-1"
                        title="Restaurar a configuração padrão recomendada para a função deste usuário"
                      >
                        <RotateCcw size={12} />
                        <span>Padrão do Cargo</span>
                      </button>
                    </div>
                  </div>

                  {/* Lista de Seções e Submenus */}
                  <div className="space-y-3">
                    {MENU_SECTIONS_CATALOG.filter((sec) => {
                      if (!permMenuSearch.trim()) return true;
                      const term = permMenuSearch.toLowerCase().trim();
                      const matchSection = sec.label.toLowerCase().includes(term) || sec.description.toLowerCase().includes(term);
                      const matchSub = sec.subItems?.some(
                        (sub) => sub.label.toLowerCase().includes(term) || sub.description.toLowerCase().includes(term)
                      );
                      return matchSection || matchSub;
                    }).map((section) => {
                      const isSectionAllowed = tempAllowedSections.includes(section.id);
                      const sectionSubIds = section.subItems?.map((s) => s.id) || [];
                      const allowedSubsCount = sectionSubIds.filter((id) => tempAllowedSubItems.includes(id)).length;
                      const isFullyAllowed = sectionSubIds.length > 0 && allowedSubsCount === sectionSubIds.length;
                      const isPartiallyAllowed = allowedSubsCount > 0 && allowedSubsCount < sectionSubIds.length;

                      const isConfigSection = section.id === 'configuracoes';
                      const isTargetUserAdmin = userConfiguringPermissions.login === 'admin';
                      const isTargetUserGerente = userConfiguringPermissions.role === 'gerente';
                      const isSectionLockedForTarget = isConfigSection && !isTargetUserAdmin && !isTargetUserGerente;

                      return (
                        <div
                          key={section.id}
                          className={`rounded-xl border transition-all overflow-hidden ${
                            isSectionAllowed
                              ? 'bg-white border-slate-200 shadow-2xs'
                              : 'bg-slate-50/70 border-slate-200/80 opacity-70'
                          }`}
                        >
                          {/* Cabeçalho da Seção */}
                          <div className="p-3 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <button
                                type="button"
                                disabled={isSectionLockedForTarget}
                                onClick={() => handleTogglePermSection(section.id)}
                                className={`w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer ${
                                  isFullyAllowed
                                    ? 'bg-indigo-600 text-white'
                                    : isPartiallyAllowed
                                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-400'
                                    : 'border border-slate-300 bg-white hover:border-slate-400 text-transparent'
                                } ${isSectionLockedForTarget ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title={
                                  isSectionLockedForTarget
                                    ? 'Aba de configurações administrativas é restrita ao Administrador e Gerente Geral'
                                    : 'Marcar / Desmarcar todos os submenus deste menu'
                                }
                              >
                                {isFullyAllowed ? <Check size={14} strokeWidth={3} /> : isPartiallyAllowed ? '–' : null}
                              </button>

                              <div className="flex items-center gap-2">
                                <span className={`p-1.5 rounded-lg ${isSectionAllowed ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                                  {renderMenuIcon(section.iconName, 16)}
                                </span>
                                <div>
                                  <span className="font-extrabold text-xs text-slate-900 block flex items-center gap-1.5">
                                    <span>Menu: {section.label}</span>
                                    {isConfigSection && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                        Admin / Gerente
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-[11px] text-slate-500 hidden sm:block">
                                    {section.description}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isFullyAllowed
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : allowedSubsCount > 0
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-slate-200 text-slate-600'
                              }`}>
                                {allowedSubsCount} de {sectionSubIds.length} submenus
                              </span>
                            </div>
                          </div>

                          {/* Grade de Submenus */}
                          {section.subItems && section.subItems.length > 0 && (
                            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white">
                              {section.subItems.map((sub) => {
                                const isSubAllowed = tempAllowedSubItems.includes(sub.id);
                                const isRestrictedAdminSub =
                                  !isTargetUserAdmin &&
                                  (sub.id === 'settings_menus' ||
                                    sub.id === 'settings_cleanup' ||
                                    (sub.id === 'settings' && !isTargetUserGerente));

                                return (
                                  <div
                                    key={sub.id}
                                    onClick={() => {
                                      if (isRestrictedAdminSub) return;
                                      handleTogglePermSubItem(section.id, sub.id);
                                    }}
                                    className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2 transition-all cursor-pointer ${
                                      isRestrictedAdminSub
                                        ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                                        : isSubAllowed
                                        ? 'bg-indigo-50/40 border-indigo-200 text-slate-900'
                                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2">
                                      <div
                                        className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center transition-colors shrink-0 ${
                                          isRestrictedAdminSub
                                            ? 'bg-slate-200 text-slate-400'
                                            : isSubAllowed
                                            ? 'bg-indigo-600 text-white'
                                            : 'border border-slate-300 bg-white'
                                        }`}
                                      >
                                        {isSubAllowed ? <Check size={12} strokeWidth={3} /> : null}
                                      </div>
                                      <div>
                                        <div className="font-bold flex items-center gap-1.5">
                                          <span>{sub.label}</span>
                                          {sub.shortcut && (
                                            <span className="font-mono text-[9px] font-bold px-1 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                              {sub.shortcut}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                                          {sub.description}
                                        </div>
                                        {isRestrictedAdminSub && (
                                          <div className="text-[10px] text-amber-700 font-bold mt-1">
                                            Restrito ao Administrador Master
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé com Ações */}
            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500 text-center sm:text-left">
                Salvando permissões para <strong>{userConfiguringPermissions.name}</strong> (@{userConfiguringPermissions.login})
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setUserConfiguringPermissions(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer w-full sm:w-auto text-center"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSavePermissionsConfig}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer w-full sm:w-auto"
                >
                  <ShieldCheck size={15} />
                  <span>Salvar Permissões de Acesso</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isMasterAdmin && (
        <ChangePasswordModal
          isOpen={!!passwordChangeUser}
          onClose={() => setPasswordChangeUser(null)}
          targetUser={passwordChangeUser || currentUser}
        />
      )}

      {/* Modal de Confirmação de Exclusão de Usuário (Exclusivo romeujr.suporte@gmail.com e admin) */}
      {isMasterAdmin && userToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                  <Trash2 size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Excluir Usuário do Sistema
                  </h3>
                  <p className="text-xs text-slate-500">
                    Acesso será removido imediatamente
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => setUserToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 space-y-1.5 text-xs text-rose-950">
              <div className="font-bold text-rose-900 flex items-center gap-1.5">
                <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                <span>Confirme a exclusão definitiva deste cadastro:</span>
              </div>
              <div className="bg-white/90 rounded-lg border border-rose-200/80 p-2.5 space-y-0.5 text-slate-800">
                <div><strong>Nome:</strong> {userToDelete.name}</div>
                <div><strong>Login:</strong> <span className="font-mono">@{userToDelete.login}</span></div>
                <div><strong>Perfil:</strong> <span className="uppercase">{userToDelete.role}</span></div>
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed pt-1">
                O usuário não poderá mais acessar o sistema. O histórico de vendas, pedidos e registros de auditoria vinculados a ele será preservado.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={executeDeleteUser}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
                <span>{isDeletingUser ? 'Excluindo...' : 'Confirmar Exclusão'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Seguro de Confirmação de Restauração aos Padrões de Fábrica (Exclusivo romeujr.suporte@gmail.com e admin) */}
      {isMasterAdmin && isResetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                  <RotateCcw size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Restaurar Padrões de Fábrica
                  </h3>
                  <p className="text-xs text-slate-500">
                    Limpar todos os dados operacionais e iniciar do zero
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsResetModalOpen(false);
                  setResetConfirmText('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2 text-xs text-rose-950">
              <div className="font-bold text-rose-900 flex items-center gap-1.5">
                <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                <span>ATENÇÃO: Ação irreversível de exclusão de dados operacionais</span>
              </div>
              <p className="leading-relaxed">
                Esta ação irá apagar <strong>TODOS</strong> os dados do sistema (produtos, estoques, clientes, fornecedores, pedidos de venda, compras, romaneios de entrega e movimentações financeiras) para que você inicie o sistema totalmente do zero.
              </p>
              <div className="p-3 bg-white/90 rounded-lg border border-rose-200 text-slate-800 space-y-1.5 font-medium">
                <p className="text-emerald-800 font-bold flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  <span>O usuário "Admin" (login: <strong>admin</strong>) será mantido com a senha padrão de fábrica.</span>
                </p>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Após a restauração, você será desconectado e fará login como <strong>Admin</strong> para cadastrar os dados da sua Empresa Matriz (Razão Social, CNPJ e endereço) e começar seus cadastros reais.
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-bold text-slate-700">
                Para autorizar a restauração, digite <span className="font-mono text-rose-700 font-black">RESET</span> ou <span className="font-mono text-rose-700 font-black">ZERAR</span>:
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value.toUpperCase())}
                placeholder="Digite RESET ou ZERAR para confirmar"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-mono font-bold uppercase focus:outline-hidden focus:ring-2 focus:ring-rose-500 bg-slate-50"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsResetModalOpen(false);
                  setResetConfirmText('');
                }}
                disabled={isResetting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeFactoryReset}
                disabled={(resetConfirmText.trim() !== 'RESET' && resetConfirmText.trim() !== 'ZERAR') || isResetting}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <RotateCcw size={14} className={isResetting ? 'animate-spin' : ''} />
                <span>{isResetting ? 'Restaurando Sistema...' : 'Confirmar e Restaurar de Fábrica'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Seguro de Confirmação de Restauração de Backup JSON */}
      {isRestoreJsonModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200">
                  <Upload size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Restaurar Backup do JSON
                  </h3>
                  <p className="text-xs text-slate-500">
                    Substituir banco de dados atual pelo conteúdo informado
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRestoreJsonModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              ATENÇÃO: A restauração de backup irá substituir todas as informações atuais do banco pelos registros contidos no texto JSON. Deseja prosseguir com a restauração?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsRestoreJsonModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeRestoreBackup}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Upload size={14} />
                <span>Confirmar Restauração</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
