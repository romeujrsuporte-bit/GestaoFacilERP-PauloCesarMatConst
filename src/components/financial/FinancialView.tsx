import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CircleDollarSign,
  TrendingDown,
  TrendingUp,
  Vault,
  Plus,
  Search,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  FileSpreadsheet,
  Lock,
  Unlock,
  History,
  RotateCw,
  CreditCard,
  Building2,
  BarChart3,
  Edit2,
  Trash2,
  X,
  BookOpen,
  ShieldAlert,
  Filter,
  Download,
  CalendarDays,
  Clock,
  ArrowUpDown,
  SlidersHorizontal,
  QrCode,
  Coins,
  Receipt,
  Tag,
  Layers,
  PieChart,
  Check,
  ListFilter,
  ChevronRight,
  ChevronDown,
  Wallet,
  FileText,
  Ticket,
} from 'lucide-react';
import { Database } from '../../services/db';
import { AccountReceivable, AccountPayable, CashRegister, CashMovement, ChartOfAccount, Supplier, Customer } from '../../types';
import { FirebaseSyncService } from '../../services/firebaseSync';
import { formatCurrency } from '../../services/pricingEngine';
import { toast } from '../../services/toast';
import { PaymentMethodsManager } from './PaymentMethodsManager';
import { FinancialAccountsManager } from './FinancialAccountsManager';
import { PaymentTermsManager } from './PaymentTermsManager';
import { FinancialReportsManager } from './FinancialReportsManager';
import { ChartOfAccountsView } from './ChartOfAccountsView';
import { DreGerencialView } from './DreGerencialView';
import { CustomerVouchersManager } from './CustomerVouchersManager';
import {
  SortableTh,
  SortConfig,
  toggleSortConfig,
  compareSortValues,
  parseSortableDate,
} from '../common/SortableHeader';

type ReceivableSortKey =
  | 'docNumber'
  | 'customerName'
  | 'issueDate'
  | 'dueDate'
  | 'originalValue'
  | 'paidValue'
  | 'balance'
  | 'status';

type PayableSortKey =
  | 'docNumber'
  | 'description'
  | 'chartAccount'
  | 'supplierName'
  | 'dueDate'
  | 'originalValue'
  | 'paidValue'
  | 'balance'
  | 'status';

export type FinancialSubTab =
  | 'fluxo_caixa'
  | 'contas_receber'
  | 'contas_pagar'
  | 'vales'
  | 'caixa_pdv'
  | 'plano_contas'
  | 'dre_gerencial'
  | 'formas_pagamento'
  | 'contas_bancarias'
  | 'prazos_pagamento'
  | 'relatorios';

export interface CashFlowEntry {
  id: string;
  date: string;
  type: 'entrada' | 'saida';
  originType: 'pdv_venda' | 'pedido_venda' | 'recebimento_titulo' | 'suprimento' | 'sangria' | 'pagamento_titulo';
  originLabel: string;
  description: string;
  entityName?: string;
  documentNumber?: string;
  paymentMethod?: string;
  accountName?: string;
  category?: string;
  launchCode?: string;
  amount: number;
}

const formatCashDecimalPtBr = (value: number): string => {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const sanitizeCashCurrencyInput = (raw: string): string => {
  let normalized = raw.replace(/[^0-9.,]/g, '');
  if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '');
  } else if (normalized.includes('.')) {
    const lastDot = normalized.lastIndexOf('.');
    normalized =
      normalized.slice(0, lastDot).replace(/\./g, '') +
      ',' +
      normalized.slice(lastDot + 1);
  }
  const commaIdx = normalized.indexOf(',');
  if (commaIdx !== -1) {
    const integerPart = normalized.slice(0, commaIdx);
    const decimalPart = normalized.slice(commaIdx + 1).replace(/,/g, '').slice(0, 2);
    return `${integerPart},${decimalPart}`;
  }
  return normalized;
};

const parseCashDecimalPtBr = (raw: string): number => {
  const cleaned = raw.replace(/\./g, '').replace(',', '.').trim();
  const parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Number(parsed.toFixed(2));
};

/**
 * Normaliza e categoriza a forma de pagamento canônica para divisão e totalização no Fluxo de Caixa.
 */
export const getCanonicalPaymentMethod = (methodName?: string, originType?: string, description?: string) => {
  const norm = (methodName || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const desc = (description || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (originType === 'suprimento' || norm.includes('suprimento') || desc.includes('suprimento')) {
    return {
      key: 'suprimento',
      label: 'Suprimento de Caixa',
      iconType: 'suprimento' as const,
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      tagColor: 'bg-indigo-100 text-indigo-800',
      headerBg: 'bg-indigo-50/80 border-indigo-200 text-indigo-950',
      accentColor: 'text-indigo-600',
    };
  }

  if (norm.includes('pix') || desc.includes('pix')) {
    return {
      key: 'pix',
      label: 'PIX Instantâneo',
      iconType: 'pix' as const,
      badgeColor: 'bg-teal-50 text-teal-800 border-teal-200',
      tagColor: 'bg-teal-100 text-teal-800',
      headerBg: 'bg-teal-50/80 border-teal-200 text-teal-950',
      accentColor: 'text-teal-600',
    };
  }

  if (norm.includes('dinheiro') || norm.includes('especie') || desc.includes('dinheiro')) {
    return {
      key: 'dinheiro',
      label: 'Dinheiro em Espécie',
      iconType: 'dinheiro' as const,
      badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      tagColor: 'bg-emerald-100 text-emerald-800',
      headerBg: 'bg-emerald-50/80 border-emerald-200 text-emerald-950',
      accentColor: 'text-emerald-600',
    };
  }

  if (norm.includes('debito') || desc.includes('debito')) {
    return {
      key: 'cartao_debito',
      label: 'Cartão de Débito',
      iconType: 'cartao_debito' as const,
      badgeColor: 'bg-sky-50 text-sky-800 border-sky-200',
      tagColor: 'bg-sky-100 text-sky-800',
      headerBg: 'bg-sky-50/80 border-sky-200 text-sky-950',
      accentColor: 'text-sky-600',
    };
  }

  if (norm.includes('credito') || desc.includes('credito')) {
    return {
      key: 'cartao_credito',
      label: 'Cartão de Crédito',
      iconType: 'cartao_credito' as const,
      badgeColor: 'bg-blue-50 text-blue-800 border-blue-200',
      tagColor: 'bg-blue-100 text-blue-800',
      headerBg: 'bg-blue-50/80 border-blue-200 text-blue-950',
      accentColor: 'text-blue-600',
    };
  }

  if (norm.includes('cartao') || desc.includes('cartao')) {
    return {
      key: 'cartao_credito',
      label: 'Cartão de Crédito',
      iconType: 'cartao_credito' as const,
      badgeColor: 'bg-blue-50 text-blue-800 border-blue-200',
      tagColor: 'bg-blue-100 text-blue-800',
      headerBg: 'bg-blue-50/80 border-blue-200 text-blue-950',
      accentColor: 'text-blue-600',
    };
  }

  if (norm.includes('boleto') || desc.includes('boleto')) {
    return {
      key: 'boleto',
      label: 'Boleto Bancário',
      iconType: 'boleto' as const,
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
      tagColor: 'bg-amber-100 text-amber-800',
      headerBg: 'bg-amber-50/80 border-amber-200 text-amber-950',
      accentColor: 'text-amber-600',
    };
  }

  if (norm.includes('crediario') || norm.includes('prazo') || desc.includes('crediario')) {
    return {
      key: 'crediario',
      label: 'Crediário Próprio',
      iconType: 'crediario' as const,
      badgeColor: 'bg-purple-50 text-purple-800 border-purple-200',
      tagColor: 'bg-purple-100 text-purple-800',
      headerBg: 'bg-purple-50/80 border-purple-200 text-purple-950',
      accentColor: 'text-purple-600',
    };
  }

  return {
    key: 'outros',
    label: methodName || 'Outras Formas',
    iconType: 'outros' as const,
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
    tagColor: 'bg-slate-200 text-slate-700',
    headerBg: 'bg-slate-100/80 border-slate-200 text-slate-900',
    accentColor: 'text-slate-600',
  };
};

export const renderMethodIcon = (iconType: string, className = 'w-4 h-4') => {
  switch (iconType) {
    case 'pix':
      return <QrCode className={className} />;
    case 'dinheiro':
      return <Coins className={className} />;
    case 'cartao_credito':
    case 'cartao_debito':
      return <CreditCard className={className} />;
    case 'boleto':
      return <FileText className={className} />;
    case 'crediario':
      return <Tag className={className} />;
    case 'suprimento':
      return <ArrowUpRight className={className} />;
    default:
      return <DollarSign className={className} />;
  }
};

export const FinancialView: React.FC<{ initialSubTab?: FinancialSubTab }> = ({
  initialSubTab = 'fluxo_caixa',
}) => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  const [activeTab, setActiveTab] = useState<FinancialSubTab>(initialSubTab);

  useEffect(() => {
    setActiveTab(initialSubTab);
  }, [initialSubTab]);

  // Modais de Baixa / Pagamento / Recebimento
  const [receivingTitle, setReceivingTitle] = useState<AccountReceivable | null>(null);
  const [payingTitle, setPayingTitle] = useState<AccountPayable | null>(null);
  const [partialAmount, setPartialAmount] = useState<string>('');
  const [paymentMethodUsed, setPaymentMethodUsed] = useState<string>('Pix');
  const [selectedVoucherIdForReceive, setSelectedVoucherIdForReceive] = useState<string>('');

  // Modal de Nova Conta a Pagar / Lançar Nova Obrigação Financeira
  const [isNewPayableOpen, setIsNewPayableOpen] = useState(false);
  const [payableSupplierName, setPayableSupplierName] = useState('');
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const supplierInputRef = useRef<HTMLInputElement>(null);
  const supplierDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        supplierDropdownRef.current &&
        !supplierDropdownRef.current.contains(event.target as Node) &&
        supplierInputRef.current &&
        !supplierInputRef.current.contains(event.target as Node)
      ) {
        setIsSupplierDropdownOpen(false);
      }
    };
    if (isSupplierDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSupplierDropdownOpen]);

  const [payableLaunchCode, setPayableLaunchCode] = useState('');
  const [payableChartAccountId, setPayableChartAccountId] = useState('');
  const [payableChartSearch, setPayableChartSearch] = useState('');
  const [isChartSearchDropdownOpen, setIsChartSearchDropdownOpen] = useState(false);
  const [payableHistory, setPayableHistory] = useState(''); // Campo "Histórico"
  const [payableDocNumber, setPayableDocNumber] = useState(''); // Campo "Nº do Documento"
  const [payablePaymentMethod, setPayablePaymentMethod] = useState('Boleto'); // Padrão: Boleto
  const [payableAmount, setPayableAmount] = useState(''); // Campo "Valor Total (R$)"
  const [payableDueDate, setPayableDueDate] = useState(''); // Campo "Data de Vencimento"
  const [isMultipleInstallmentsEnabled, setIsMultipleInstallmentsEnabled] = useState(false);
  const [payableInstallmentCount, setPayableInstallmentCount] = useState<number>(1);
  const [payableIntervalDays, setPayableIntervalDays] = useState<number>(30);
  const [payableCustomInstallments, setPayableCustomInstallments] = useState<Array<{
    installmentNumber: number;
    docNumber: string;
    dueDate: string;
    amount: number;
    paymentMethod: string;
  }>>([]);

  // Modal de Cadastro Rápido de Favorecido / Fornecedor a partir de Contas a Pagar
  const [isQuickSupplierModalOpen, setIsQuickSupplierModalOpen] = useState(false);
  const [quickSupplierType, setQuickSupplierType] = useState<'PJ' | 'PF'>('PJ');
  const [quickSupplierName, setQuickSupplierName] = useState('');
  const [quickSupplierTradeName, setQuickSupplierTradeName] = useState('');
  const [quickSupplierCpfCnpj, setQuickSupplierCpfCnpj] = useState('');
  const [quickSupplierPhone, setQuickSupplierPhone] = useState('');
  const [quickSupplierEmail, setQuickSupplierEmail] = useState('');
  const [quickSupplierCity, setQuickSupplierCity] = useState('');
  const [quickSupplierState, setQuickSupplierState] = useState('BA');

  // Helper para cálculo dos limites do mês (Padrão: Mês Atual)
  const getFinancialMonthDateRange = (offsetMonths = 0) => {
    const now = new Date();
    const targetMonth = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
    const startYear = targetMonth.getFullYear();
    const startMonth = String(targetMonth.getMonth() + 1).padStart(2, '0');
    const start = `${startYear}-${startMonth}-01`;

    const lastDayObj = new Date(startYear, targetMonth.getMonth() + 1, 0);
    const end = `${lastDayObj.getFullYear()}-${String(lastDayObj.getMonth() + 1).padStart(2, '0')}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
    return { start, end };
  };

  // Filtros de Período, Fornecedor e Plano de Contas no Contas a Pagar (Padrão: Mês Atual)
  const [payablePeriodPreset, setPayablePeriodPreset] = useState<'mes_atual' | 'mes_anterior' | 'proximo_mes' | 'hoje' | 'todos' | 'personalizado'>('mes_atual');
  const [payableStartDate, setPayableStartDate] = useState<string>(() => getFinancialMonthDateRange(0).start);
  const [payableEndDate, setPayableEndDate] = useState<string>(() => getFinancialMonthDateRange(0).end);
  const [payableDateType, setPayableDateType] = useState<'vencimento' | 'emissao'>('vencimento');
  const [payableSupplierFilter, setPayableSupplierFilter] = useState<string>('todos');
  const [payableChartAccountFilter, setPayableChartAccountFilter] = useState<string>('todos');
  const [payableStatusFilter, setPayableStatusFilter] = useState<string>('todos');
  const [payableClassificationFilter, setPayableClassificationFilter] = useState<'todas' | 'classificadas' | 'pendentes'>('todas');
  const [payableSearch, setPayableSearch] = useState('');
  const [payableSortConfig, setPayableSortConfig] = useState<SortConfig<PayableSortKey>>({
    key: null,
    direction: 'asc',
  });
  const handlePayableSort = (key: PayableSortKey) => {
    setPayableSortConfig((prev) => toggleSortConfig(prev, key));
  };

  const handleSelectPayablePeriodPreset = (
    preset: 'mes_atual' | 'mes_anterior' | 'proximo_mes' | 'hoje' | 'todos' | 'personalizado'
  ) => {
    setPayablePeriodPreset(preset);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (preset === 'mes_atual') {
      const { start, end } = getFinancialMonthDateRange(0);
      setPayableStartDate(start);
      setPayableEndDate(end);
    } else if (preset === 'mes_anterior') {
      const { start, end } = getFinancialMonthDateRange(-1);
      setPayableStartDate(start);
      setPayableEndDate(end);
    } else if (preset === 'proximo_mes') {
      const { start, end } = getFinancialMonthDateRange(1);
      setPayableStartDate(start);
      setPayableEndDate(end);
    } else if (preset === 'hoje') {
      setPayableStartDate(today);
      setPayableEndDate(today);
    } else if (preset === 'todos') {
      setPayableStartDate('');
      setPayableEndDate('');
    }
  };

  // Filtros de Período, Cliente e Plano de Contas no Contas a Receber (Padrão: Mês Atual)
  const [receivablePeriodPreset, setReceivablePeriodPreset] = useState<'mes_atual' | 'mes_anterior' | 'proximo_mes' | 'hoje' | 'todos' | 'personalizado'>('mes_atual');
  const [receivableStartDate, setReceivableStartDate] = useState<string>(() => getFinancialMonthDateRange(0).start);
  const [receivableEndDate, setReceivableEndDate] = useState<string>(() => getFinancialMonthDateRange(0).end);
  const [receivableDateType, setReceivableDateType] = useState<'vencimento' | 'emissao'>('vencimento');
  const [receivableCustomerFilter, setReceivableCustomerFilter] = useState<string>('todos');
  const [receivableChartAccountFilter, setReceivableChartAccountFilter] = useState<string>('todos');
  const [receivableStatusFilter, setReceivableStatusFilter] = useState<string>('todos');
  const [receivableSearch, setReceivableSearch] = useState('');
  const [receivableSortConfig, setReceivableSortConfig] = useState<SortConfig<ReceivableSortKey>>({
    key: null,
    direction: 'asc',
  });
  const handleReceivableSort = (key: ReceivableSortKey) => {
    setReceivableSortConfig((prev) => toggleSortConfig(prev, key));
  };

  const handleSelectReceivablePeriodPreset = (
    preset: 'mes_atual' | 'mes_anterior' | 'proximo_mes' | 'hoje' | 'todos' | 'personalizado'
  ) => {
    setReceivablePeriodPreset(preset);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (preset === 'mes_atual') {
      const { start, end } = getFinancialMonthDateRange(0);
      setReceivableStartDate(start);
      setReceivableEndDate(end);
    } else if (preset === 'mes_anterior') {
      const { start, end } = getFinancialMonthDateRange(-1);
      setReceivableStartDate(start);
      setReceivableEndDate(end);
    } else if (preset === 'proximo_mes') {
      const { start, end } = getFinancialMonthDateRange(1);
      setReceivableStartDate(start);
      setReceivableEndDate(end);
    } else if (preset === 'hoje') {
      setReceivableStartDate(today);
      setReceivableEndDate(today);
    } else if (preset === 'todos') {
      setReceivableStartDate('');
      setReceivableEndDate('');
    }
  };

  // Modais de Baixa com Classificação Obrigatória
  const [payingLaunchCode, setPayingLaunchCode] = useState('');
  const [payingChartAccountId, setPayingChartAccountId] = useState('');

  // Modais de Edição e Criação de Títulos (Contas a Receber e Contas a Pagar)
  const [editingReceivable, setEditingReceivable] = useState<AccountReceivable | null>(null);
  const [isNewReceivableOpen, setIsNewReceivableOpen] = useState(false);
  const [recFormData, setRecFormData] = useState({
    docNumber: '',
    customerName: '',
    issueDate: '',
    dueDate: '',
    originalValue: '',
    paymentMethod: 'Boleto',
    status: 'aberto' as AccountReceivable['status'],
  });

  // Modal de Novo Título a Receber / Lançar Novo Título a Receber (Contas a Receber)
  const [receivableCustomerName, setReceivableCustomerName] = useState('');
  const [receivableCustomerId, setReceivableCustomerId] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target as Node) &&
        customerInputRef.current &&
        !customerInputRef.current.contains(event.target as Node)
      ) {
        setIsCustomerDropdownOpen(false);
      }
    };
    if (isCustomerDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCustomerDropdownOpen]);

  const [receivableLaunchCode, setReceivableLaunchCode] = useState('');
  const [receivableChartAccountId, setReceivableChartAccountId] = useState('');
  const [receivableChartSearch, setReceivableChartSearch] = useState('');
  const [isRecChartSearchDropdownOpen, setIsRecChartSearchDropdownOpen] = useState(false);
  const [receivableHistory, setReceivableHistory] = useState(''); // Campo "Histórico"
  const [receivableDocNumber, setReceivableDocNumber] = useState(''); // Campo "Nº do Documento"
  const [receivablePaymentMethod, setReceivablePaymentMethod] = useState('Boleto'); // Padrão: Boleto
  const [receivableAmount, setReceivableAmount] = useState(''); // Campo "Valor Total (R$)"
  const [receivableDueDate, setReceivableDueDate] = useState(''); // Campo "Data de Vencimento"
  const [isRecMultipleInstallmentsEnabled, setIsRecMultipleInstallmentsEnabled] = useState(false);
  const [receivableInstallmentCount, setReceivableInstallmentCount] = useState<number>(1);
  const [receivableIntervalDays, setReceivableIntervalDays] = useState<number>(30);
  const [receivableCustomInstallments, setReceivableCustomInstallments] = useState<Array<{
    installmentNumber: number;
    docNumber: string;
    dueDate: string;
    amount: number;
    paymentMethod: string;
  }>>([]);

  // Modal de Cadastro Rápido de Cliente / Sacado a partir de Contas a Receber
  const [isQuickCustomerModalOpen, setIsQuickCustomerModalOpen] = useState(false);
  const [quickCustomerType, setQuickCustomerType] = useState<'PJ' | 'PF'>('PJ');
  const [quickCustomerName, setQuickCustomerName] = useState('');
  const [quickCustomerTradeName, setQuickCustomerTradeName] = useState('');
  const [quickCustomerCpfCnpj, setQuickCustomerCpfCnpj] = useState('');
  const [quickCustomerPhone, setQuickCustomerPhone] = useState('');
  const [quickCustomerEmail, setQuickCustomerEmail] = useState('');
  const [quickCustomerCity, setQuickCustomerCity] = useState('');
  const [quickCustomerState, setQuickCustomerState] = useState('BA');

  const [editingPayable, setEditingPayable] = useState<AccountPayable | null>(null);
  const [payFormData, setPayFormData] = useState({
    docNumber: '',
    description: '',
    category: 'outros' as AccountPayable['category'],
    supplierName: '',
    issueDate: '',
    dueDate: '',
    originalValue: '',
    status: 'aberto' as AccountPayable['status'],
    notes: '',
    chartAccountId: '',
    chartAccountCode: '',
    launchCode: '',
    chartAccountName: '',
    classificationStatus: 'pendente' as 'classificado' | 'pendente',
  });

  // Modal In-App de Confirmação de Exclusão (100% compatível com iframes do navegador)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: 'receivable' | 'payable';
    id: string;
    docNumber: string;
    description: string;
    value: number;
  } | null>(null);

  // Fechamento de Caixa PDV (Conferência Cega)
  const [isCloseRegisterModalOpen, setIsCloseRegisterModalOpen] = useState(false);
  const [reportedCash, setReportedCash] = useState('0,00');
  const [reportedPix, setReportedPix] = useState('0,00');
  const [reportedCard, setReportedCard] = useState('0,00');
  const [closingNotes, setClosingNotes] = useState('');

  // Modal Suprimento / Sangria
  const [isCashOperationModalOpen, setIsCashOperationModalOpen] = useState(false);
  const [cashOpType, setCashOpType] = useState<'suprimento' | 'sangria'>('suprimento');
  const [cashOpAmount, setCashOpAmount] = useState('');
  const [cashOpReason, setCashOpReason] = useState('');

  // Caixa aberto ativo
  const activeCashRegister = dbState.cashRegisters.find(
    (c) => c.companyId === currentCompany.id && c.status === 'aberto'
  );

  // =========================================================================
  // ESTRUTURA E CÁLCULOS DO FLUXO DE CAIXA (HOJE, MÊS ATUAL, PERÍODO & LISTAGEM)
  // =========================================================================
  const [cfPeriodPreset, setCfPeriodPreset] = useState<
    'hoje' | 'mes_atual' | 'ultimos_7' | 'ultimos_30' | 'mes_anterior' | 'personalizado'
  >('mes_atual');

  const [cfStartDate, setCfStartDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [cfEndDate, setCfEndDate] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });
  const [cfEntryTypeFilter, setCfEntryTypeFilter] = useState<'todos' | 'entrada' | 'saida'>('todos');
  const [cfPaymentMethodFilter, setCfPaymentMethodFilter] = useState<string>('todos');
  const [cfGroupByPaymentMethod, setCfGroupByPaymentMethod] = useState<boolean>(true);
  const [cfSearchTerm, setCfSearchTerm] = useState('');

  const handleSelectPeriodPreset = (
    preset: 'hoje' | 'mes_atual' | 'ultimos_7' | 'ultimos_30' | 'mes_anterior' | 'personalizado'
  ) => {
    setCfPeriodPreset(preset);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (preset === 'hoje') {
      setCfStartDate(today);
      setCfEndDate(today);
    } else if (preset === 'mes_atual') {
      setCfStartDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
      setCfEndDate(today);
    } else if (preset === 'ultimos_7') {
      const d7 = new Date(now.getTime() - 6 * 86400000);
      setCfStartDate(d7.toISOString().split('T')[0]);
      setCfEndDate(today);
    } else if (preset === 'ultimos_30') {
      const d30 = new Date(now.getTime() - 29 * 86400000);
      setCfStartDate(d30.toISOString().split('T')[0]);
      setCfEndDate(today);
    } else if (preset === 'mes_anterior') {
      const prevMonthFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthLast = new Date(now.getFullYear(), now.getMonth(), 0);
      setCfStartDate(prevMonthFirst.toISOString().split('T')[0]);
      setCfEndDate(prevMonthLast.toISOString().split('T')[0]);
    }
  };

  // 1. Extração unificada de todos os lançamentos em regime de caixa
  const allCashFlowEntries = useMemo(() => {
    const list: Array<{
      id: string;
      date: string;
      type: 'entrada' | 'saida';
      originType: 'pdv_venda' | 'pedido_venda' | 'recebimento_titulo' | 'suprimento' | 'sangria' | 'pagamento_titulo';
      originLabel: string;
      description: string;
      entityName?: string;
      documentNumber?: string;
      paymentMethod?: string;
      accountName?: string;
      category?: string;
      launchCode?: string;
      amount: number;
    }> = [];
    const compId = currentCompany.id;

    // A) Movimentações do Caixa Balcão PDV (Vendas balcão, suprimentos, sangrias)
    const registers = (dbState.cashRegisters || []).filter((c) => !compId || c.companyId === compId);
    registers.forEach((reg) => {
      (reg.movements || []).forEach((m) => {
        const isSangria = m.type === 'sangria';
        const isSuprimento = m.type === 'suprimento';
        let method = 'Caixa Balcão';
        if (m.type === 'venda_pix') method = 'PIX';
        else if (m.type === 'venda_cartao') method = 'Cartão';
        else if (m.type === 'venda_outros') method = 'Outros';
        else if (m.type === 'venda_dinheiro') method = 'Dinheiro';

        // Tenta obter método detalhado a partir do pedido de venda vinculado ao PDV
        if (m.orderId) {
          const relOrder = (dbState.orders || []).find((o) => o.id === m.orderId || o.number === m.orderId);
          if (relOrder && relOrder.paymentMethod) {
            if (relOrder.paymentMethod === 'pix') method = 'PIX';
            else if (relOrder.paymentMethod === 'dinheiro') method = 'Dinheiro';
            else if (relOrder.paymentMethod === 'cartao_credito') method = 'Cartão de Crédito';
            else if (relOrder.paymentMethod === 'cartao_debito') method = 'Cartão de Débito';
            else if (relOrder.paymentMethod === 'boleto') method = 'Boleto Bancário';
            else if (relOrder.paymentMethod === 'crediario') method = 'Crediário';
            else method = relOrder.paymentMethod.replace(/_/g, ' ').toUpperCase();
          }
        } else if (m.type === 'venda_cartao') {
          const d = (m.description || '').toLowerCase();
          if (d.includes('debito') || d.includes('débito')) method = 'Cartão de Débito';
          else method = 'Cartão de Crédito';
        } else if (isSuprimento) {
          method = 'Suprimento de Caixa';
        }

        list.push({
          id: m.id || `mov-${Math.random()}`,
          date: m.timestamp || reg.openedAt || new Date().toISOString(),
          type: isSangria ? 'saida' : 'entrada',
          originType: isSangria ? 'sangria' : isSuprimento ? 'suprimento' : 'pdv_venda',
          originLabel: isSangria ? 'Sangria de Caixa' : isSuprimento ? 'Suprimento de Troco' : 'Venda PDV Balcão',
          description: m.description || (isSangria ? 'Sangria para o cofre' : isSuprimento ? 'Suprimento de caixa' : 'Venda à vista no PDV Balcão'),
          entityName: reg.userName ? `Operador: ${reg.userName}` : 'Frente de Caixa',
          paymentMethod: method,
          accountName: reg.terminalNumber ? `Caixa ${reg.terminalNumber}` : 'Caixa Balcão',
          category: isSangria ? 'Transferência Caixa/Cofre' : isSuprimento ? 'Aporte de Troco' : 'Receita de Venda Balcão',
          amount: m.amount || 0,
        });
      });
    });

    // B) Recebimentos de Títulos (Contas a Receber Baixadas)
    const receivables = (dbState.accountsReceivable || []).filter((r) => !compId || r.companyId === compId);
    receivables.forEach((r) => {
      (r.receipts || []).forEach((rec, idx) => {
        list.push({
          id: `${r.id}-rec-${idx}`,
          date: rec.date || r.issueDate || new Date().toISOString(),
          type: 'entrada',
          originType: 'recebimento_titulo',
          originLabel: 'Recebimento de Título',
          description: `Recebimento Tit. ${r.docNumber} (${r.installmentNumber || 1}/${r.totalInstallments || 1}) - ${r.customerName}`,
          entityName: r.customerName,
          documentNumber: r.docNumber,
          paymentMethod: rec.method || r.paymentMethod || 'Boleto/Carteira',
          accountName: r.bankAccountName || 'Conta Bancária / Caixa',
          category: 'Receita Comercial / Clientes',
          amount: rec.amount || 0,
        });
      });
    });

    // C) Vendas à vista de Pedidos de Venda diretos (não duplicadas pelo PDV)
    const orders = (dbState.orders || []).filter(
      (o) =>
        (!compId || o.companyId === compId) &&
        o.type === 'venda' &&
        o.status !== 'cancelado' &&
        o.origin !== 'pdv' &&
        (o.paymentMethod === 'dinheiro' ||
          o.paymentMethod === 'pix' ||
          o.paymentMethod === 'cartao_debito' ||
          o.paymentMethod === 'cartao_credito' ||
          o.paymentMethod === 'boleto' ||
          o.paymentMethod === 'crediario') &&
        (!o.installmentsCount || o.installmentsCount <= 1)
    );
    orders.forEach((o) => {
      let methodLabel = 'À Vista';
      if (o.paymentMethod === 'dinheiro') methodLabel = 'Dinheiro';
      else if (o.paymentMethod === 'pix') methodLabel = 'PIX';
      else if (o.paymentMethod === 'cartao_credito') methodLabel = 'Cartão de Crédito';
      else if (o.paymentMethod === 'cartao_debito') methodLabel = 'Cartão de Débito';
      else if (o.paymentMethod === 'boleto') methodLabel = 'Boleto Bancário';
      else if (o.paymentMethod === 'crediario') methodLabel = 'Crediário';
      else if (o.paymentMethod) methodLabel = o.paymentMethod.replace(/_/g, ' ').toUpperCase();

      list.push({
        id: `ord-${o.id}`,
        date: o.createdAt || new Date().toISOString(),
        type: 'entrada',
        originType: 'pedido_venda',
        originLabel: o.origin === 'externa_celular' ? 'Venda Mobile (Campo)' : 'Pedido de Venda',
        description: `Pedido ${o.number} - ${o.customerName}`,
        entityName: o.customerName,
        documentNumber: o.number,
        paymentMethod: methodLabel,
        accountName: o.bankAccountName || 'Caixa Geral',
        category: 'Venda de Mercadorias / Produtos',
        amount: o.total || 0,
      });
    });

    // D) Pagamentos de Títulos (Contas a Pagar Baixadas)
    const payables = (dbState.accountsPayable || []).filter((p) => !compId || p.companyId === compId);
    payables.forEach((p) => {
      (p.payments || []).forEach((pay, idx) => {
        const launchCode = (pay as any).launchCode || p.launchCode;
        const chartAccountId = (pay as any).chartAccountId || p.chartAccountId;
        const chartAccount = (dbState.chartOfAccounts || []).find(
          (c) => (chartAccountId && c.id === chartAccountId) || (launchCode && c.launchCode === launchCode)
        );

        list.push({
          id: `${p.id}-pay-${idx}`,
          date: pay.date || p.issueDate || new Date().toISOString(),
          type: 'saida',
          originType: 'pagamento_titulo',
          originLabel: 'Pagamento de Despesa',
          description: `Pagamento ${p.docNumber ? `Doc ${p.docNumber} - ` : ''}${p.description} (${p.supplierName})`,
          entityName: p.supplierName,
          documentNumber: p.docNumber,
          paymentMethod: pay.method || 'Transferência / Boleto',
          accountName: 'Conta Bancária / Caixa',
          category: chartAccount ? `${chartAccount.code} - ${chartAccount.name}` : p.category,
          launchCode: launchCode || chartAccount?.launchCode,
          amount: pay.amount || 0,
        });
      });
    });

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [
    dbState.cashRegisters,
    dbState.accountsReceivable,
    dbState.accountsPayable,
    dbState.orders,
    dbState.chartOfAccounts,
    currentCompany.id,
  ]);

  // Cálculos consolidados gerais
  const totalRealizedIn = useMemo(
    () => allCashFlowEntries.filter((e) => e.type === 'entrada').reduce((s, e) => s + e.amount, 0),
    [allCashFlowEntries]
  );
  const totalRealizedOut = useMemo(
    () => allCashFlowEntries.filter((e) => e.type === 'saida').reduce((s, e) => s + e.amount, 0),
    [allCashFlowEntries]
  );
  const currentNetBalance = totalRealizedIn - totalRealizedOut;

  // Cálculos do MÊS ATUAL (Sempre calculados)
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const monthEntries = useMemo(
    () => allCashFlowEntries.filter((e) => (e.date || '').slice(0, 7) === currentMonthKey),
    [allCashFlowEntries, currentMonthKey]
  );
  const monthIn = useMemo(
    () => monthEntries.filter((e) => e.type === 'entrada').reduce((s, e) => s + e.amount, 0),
    [monthEntries]
  );
  const monthOut = useMemo(
    () => monthEntries.filter((e) => e.type === 'saida').reduce((s, e) => s + e.amount, 0),
    [monthEntries]
  );
  const monthBalance = monthIn - monthOut;

  // Cálculos do DIA ATUAL (HOJE) (Sempre calculados)
  const todayKey = new Date().toISOString().split('T')[0];
  const todayEntries = useMemo(
    () => allCashFlowEntries.filter((e) => (e.date || '').slice(0, 10) === todayKey),
    [allCashFlowEntries, todayKey]
  );
  const todayIn = useMemo(
    () => todayEntries.filter((e) => e.type === 'entrada').reduce((s, e) => s + e.amount, 0),
    [todayEntries]
  );
  const todayOut = useMemo(
    () => todayEntries.filter((e) => e.type === 'saida').reduce((s, e) => s + e.amount, 0),
    [todayEntries]
  );
  const todayBalance = todayIn - todayOut;

  // Cálculos do PERÍODO FILTRADO
  const periodEntries = useMemo(() => {
    return allCashFlowEntries.filter((e) => {
      const d = (e.date || '').slice(0, 10);
      if (cfStartDate && d < cfStartDate) return false;
      if (cfEndDate && d > cfEndDate) return false;
      return true;
    });
  }, [allCashFlowEntries, cfStartDate, cfEndDate]);

  const periodIn = useMemo(
    () => periodEntries.filter((e) => e.type === 'entrada').reduce((s, e) => s + e.amount, 0),
    [periodEntries]
  );
  const periodOut = useMemo(
    () => periodEntries.filter((e) => e.type === 'saida').reduce((s, e) => s + e.amount, 0),
    [periodEntries]
  );
  const periodBalance = periodIn - periodOut;

  // Lançamentos filtrados para a tabela
  const displayedEntries = useMemo(() => {
    return periodEntries.filter((e) => {
      if (cfEntryTypeFilter === 'entrada' && e.type !== 'entrada') return false;
      if (cfEntryTypeFilter === 'saida' && e.type !== 'saida') return false;

      // Filtro de Forma de Pagamento ativa nas entradas
      if (cfEntryTypeFilter === 'entrada' && cfPaymentMethodFilter !== 'todos') {
        const canonical = getCanonicalPaymentMethod(e.paymentMethod, e.originType, e.description);
        if (canonical.key !== cfPaymentMethodFilter) return false;
      }

      if (cfSearchTerm.trim()) {
        const term = cfSearchTerm.toLowerCase();
        const matchDesc = (e.description || '').toLowerCase().includes(term);
        const matchEntity = (e.entityName || '').toLowerCase().includes(term);
        const matchDoc = (e.documentNumber || '').toLowerCase().includes(term);
        const matchMethod = (e.paymentMethod || '').toLowerCase().includes(term);
        const matchCat = (e.category || '').toLowerCase().includes(term);
        const matchOrigin = (e.originLabel || '').toLowerCase().includes(term);
        return matchDesc || matchEntity || matchDoc || matchMethod || matchCat || matchOrigin;
      }
      return true;
    });
  }, [periodEntries, cfEntryTypeFilter, cfPaymentMethodFilter, cfSearchTerm]);

  // Agrupamento e totalização das entradas pelas Formas Disponíveis para pagamento
  const entriesByPaymentMethod = useMemo(() => {
    // Entradas do período com busca textual aplicada
    const baseEntries = periodEntries.filter((e) => {
      if (e.type !== 'entrada') return false;
      if (cfSearchTerm.trim()) {
        const term = cfSearchTerm.toLowerCase();
        const matchDesc = (e.description || '').toLowerCase().includes(term);
        const matchEntity = (e.entityName || '').toLowerCase().includes(term);
        const matchDoc = (e.documentNumber || '').toLowerCase().includes(term);
        const matchMethod = (e.paymentMethod || '').toLowerCase().includes(term);
        const matchCat = (e.category || '').toLowerCase().includes(term);
        const matchOrigin = (e.originLabel || '').toLowerCase().includes(term);
        return matchDesc || matchEntity || matchDoc || matchMethod || matchCat || matchOrigin;
      }
      return true;
    });

    const totalIn = baseEntries.reduce((s, e) => s + e.amount, 0);

    const groupsMap = new Map<string, {
      key: string;
      label: string;
      iconType: 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'crediario' | 'suprimento' | 'outros';
      badgeColor: string;
      tagColor: string;
      headerBg: string;
      accentColor: string;
      total: number;
      count: number;
      percentage: number;
      entries: typeof baseEntries;
    }>();

    baseEntries.forEach((entry) => {
      const canonical = getCanonicalPaymentMethod(entry.paymentMethod, entry.originType, entry.description);
      let g = groupsMap.get(canonical.key);
      if (!g) {
        g = {
          ...canonical,
          total: 0,
          count: 0,
          percentage: 0,
          entries: [],
        };
        groupsMap.set(canonical.key, g);
      }
      g.total += entry.amount;
      g.count += 1;
      g.entries.push(entry);
    });

    // Ordem preferencial de apresentação comercial
    const orderPriority: Record<string, number> = {
      dinheiro: 1,
      pix: 2,
      cartao_credito: 3,
      cartao_debito: 4,
      boleto: 5,
      crediario: 6,
      suprimento: 7,
      outros: 8,
    };

    const list = Array.from(groupsMap.values()).map((g) => ({
      ...g,
      percentage: totalIn > 0 ? (g.total / totalIn) * 100 : 0,
      entries: g.entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    }));

    return list.sort((a, b) => {
      const pA = orderPriority[a.key] || 99;
      const pB = orderPriority[b.key] || 99;
      if (pA !== pB) return pA - pB;
      return b.total - a.total;
    });
  }, [periodEntries, cfSearchTerm]);

  // Previsões Futuras (Títulos em aberto)
  const expectedReceivables = dbState.accountsReceivable
    .filter((r) => (!currentCompany.id || r.companyId === currentCompany.id) && r.status !== 'recebido' && r.status !== 'cancelado')
    .reduce((s, r) => s + r.balance, 0);

  const expectedPayables = dbState.accountsPayable
    .filter((p) => (!currentCompany.id || p.companyId === currentCompany.id) && p.status !== 'pago' && p.status !== 'cancelado')
    .reduce((s, p) => s + p.balance, 0);

  // Exportação CSV do Extrato de Lançamentos
  const handleExportCashFlowCsv = () => {
    if (displayedEntries.length === 0) {
      toast.warning('Nenhum lançamento para exportar no período.', 'Extrato Vazio');
      return;
    }
    const headers = ['Data/Hora', 'Tipo', 'Origem', 'Descrição', 'Favorecido', 'Forma/Conta', 'Classificação', 'Valor (R$)'];
    const rows = displayedEntries.map((e) => [
      new Date(e.date).toLocaleString('pt-BR'),
      e.type.toUpperCase(),
      e.originLabel,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      `"${(e.entityName || '').replace(/"/g, '""')}"`,
      `"${(e.paymentMethod || '').replace(/"/g, '""')}"`,
      `"${(e.category || '').replace(/"/g, '""')}"`,
      (e.type === 'saida' ? -e.amount : e.amount).toFixed(2).replace('.', ','),
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `extrato_fluxo_caixa_${cfPeriodPreset}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Extrato CSV gerado com sucesso!', 'Exportação Concluída');
  };

  // Vales disponíveis para o cliente do título em baixa no Contas a Receber
  const receivingTitleCustomerId = useMemo(() => {
    if (!receivingTitle) return '';
    if (receivingTitle.customerId) return receivingTitle.customerId;
    const matched = (dbState.customers || []).find(
      (c) => c.name.trim().toLowerCase() === receivingTitle.customerName.trim().toLowerCase()
    );
    return matched?.id || '';
  }, [receivingTitle, dbState.customers]);

  const receivingTitleAvailableVouchers = useMemo(() => {
    if (!receivingTitleCustomerId) return [];
    return Database.getAvailableVouchersByCustomer(receivingTitleCustomerId, currentCompany.id);
  }, [receivingTitleCustomerId, dbState.customerVouchers, currentCompany.id]);

  // Realizar Baixa de Conta a Receber
  const handleConfirmReceivingTitle = () => {
    if (!receivingTitle) return;
    const amount = parseFloat(partialAmount) || receivingTitle.balance;
    if (amount <= 0 || amount > receivingTitle.balance + 0.009) {
      toast.warning(
        `Valor inválido. Informe um valor entre R$ 0,01 e ${formatCurrency(receivingTitle.balance)}.`,
        'Valor Inválido'
      );
      return;
    }

    // Baixa utilizando Vale (Crédito de Cliente)
    if (paymentMethodUsed === 'Vale (Crédito de Cliente)') {
      const voucherId =
        selectedVoucherIdForReceive || receivingTitleAvailableVouchers[0]?.id || '';
      if (!voucherId) {
        toast.warning('Selecione um Vale disponível do cliente para realizar a baixa.', 'Vale Obrigatório');
        return;
      }
      const res = Database.applyVoucherToReceivable(
        receivingTitle.id,
        voucherId,
        Math.min(amount, receivingTitle.balance)
      );
      if (!res.success) {
        toast.error(res.message, 'Erro ao utilizar Vale');
        return;
      }
      FirebaseSyncService.syncToFirebase(Database.getState()).catch(() => {});
      toast.success(
        `Baixa de ${formatCurrency(Math.min(amount, receivingTitle.balance))} realizada com Vale ${res.voucher?.code || ''} para ${receivingTitle.customerName}!`,
        'Contas a Receber • Vale'
      );
      setReceivingTitle(null);
      setPartialAmount('');
      setSelectedVoucherIdForReceive('');
      setPaymentMethodUsed('Pix');
      return;
    }

    const nowIso = new Date().toISOString();
    const newPaidVal = receivingTitle.paidValue + amount;
    const newBalance = Math.max(0, receivingTitle.originalValue - newPaidVal);
    const newStatus = newBalance === 0 ? 'recebido' : 'parcial';

    const updatedReceivables = dbState.accountsReceivable.map((r) =>
      r.id === receivingTitle.id
        ? {
            ...r,
            paidValue: newPaidVal,
            balance: newBalance,
            status: newStatus as any,
            receipts: [
              ...r.receipts,
              {
                date: nowIso,
                amount,
                method: paymentMethodUsed,
                userId: currentUser.id,
                notes: `Baixa realizada por ${currentUser.name}`,
              },
            ],
          }
        : r
    );

    // Se o caixa do balcão estiver aberto e for dinheiro/pix, registrar movimento
    let updatedCashRegs = [...dbState.cashRegisters];
    if (activeCashRegister) {
      updatedCashRegs = updatedCashRegs.map((reg) =>
        reg.id === activeCashRegister.id
          ? {
              ...reg,
              movements: [
                ...reg.movements,
                {
                  id: 'MOV-' + Date.now(),
                  type: paymentMethodUsed === 'Dinheiro' ? 'venda_dinheiro' : 'venda_pix',
                  amount,
                  description: `Recebimento Título ${receivingTitle.docNumber} - ${receivingTitle.customerName}`,
                  timestamp: nowIso,
                  userId: currentUser.id,
                },
              ],
            }
          : reg
      );
    }

    const state = Database.getState();
    state.accountsReceivable = updatedReceivables;
    state.cashRegisters = updatedCashRegs;
    Database.persist();
    FirebaseSyncService.syncToFirebase(Database.getState()).catch(() => {});

    Database.addAuditLog(
      'BAIXA_CONTAS_RECEBER',
      'FINANCEIRO',
      receivingTitle.id,
      `Recebimento de ${formatCurrency(amount)} registrado para ${receivingTitle.customerName} via ${paymentMethodUsed}`
    );

    toast.success(`Recebimento de ${formatCurrency(amount)} registrado com sucesso!`, 'Contas a Receber');
    setReceivingTitle(null);
    setPartialAmount('');
    setSelectedVoucherIdForReceive('');
  };

  // Todas as contas do plano
  const allChartAccounts = useMemo(() => {
    return Database.getChartOfAccounts();
  }, [dbState]);

  // Contas analíticas do plano para classificação de despesas
  const analyticalAccounts = useMemo(() => {
    return allChartAccounts.filter((a) => a.type === 'analitica' && a.status === 'ativo');
  }, [allChartAccounts]);

  // Mapeamento de contas sintéticas por código hierárquico
  const syntheticAccountsMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    allChartAccounts.filter((a) => a.type === 'sintetica').forEach((s) => {
      map.set(s.hierarchicalCode, s);
    });
    return map;
  }, [allChartAccounts]);

  // Função auxiliar para encontrar a conta sintética pai de uma conta analítica
  const getParentSynthetic = (acc: ChartOfAccount): ChartOfAccount | undefined => {
    if (acc.parentCode && syntheticAccountsMap.has(acc.parentCode)) {
      return syntheticAccountsMap.get(acc.parentCode);
    }
    const parts = acc.hierarchicalCode.split('.');
    while (parts.length > 1) {
      parts.pop();
      const code = parts.join('.');
      if (syntheticAccountsMap.has(code)) {
        return syntheticAccountsMap.get(code);
      }
    }
    return undefined;
  };

  // Contas analíticas agrupadas pelas suas respectivas contas sintéticas (para o <select> com <optgroup>)
  const groupedChartAccounts = useMemo(() => {
    const groups: Array<{
      syntheticCode: string;
      syntheticName: string;
      accounts: ChartOfAccount[];
    }> = [];

    const map = new Map<string, { code: string; name: string; accounts: ChartOfAccount[] }>();

    analyticalAccounts.forEach((acc) => {
      const parent = getParentSynthetic(acc);
      const key = parent ? parent.hierarchicalCode : 'OUTROS';
      const label = parent ? `[SINTÉTICA] ${parent.hierarchicalCode} - ${parent.name}` : 'OUTRAS CONTAS ANALÍTICAS';

      if (!map.has(key)) {
        map.set(key, {
          code: parent?.hierarchicalCode || '',
          name: label,
          accounts: [],
        });
      }
      map.get(key)!.accounts.push(acc);
    });

    map.forEach((val) => {
      groups.push({
        syntheticCode: val.code,
        syntheticName: val.name,
        accounts: val.accounts,
      });
    });

    return groups;
  }, [analyticalAccounts, syntheticAccountsMap]);

  // Resultados da pesquisa por 3 caracteres (descrição, código hierárquico ou 3 dígitos)
  const chartSearchResults = useMemo(() => {
    const q = payableChartSearch.trim().toLowerCase();
    if (q.length < 3) return [];

    const matches = analyticalAccounts.filter((acc) => {
      const matchName = acc.name.toLowerCase().includes(q);
      const matchHier = acc.hierarchicalCode.toLowerCase().includes(q);
      const matchLaunch = acc.launchCode?.toLowerCase().includes(q);
      const matchDesc = acc.description?.toLowerCase().includes(q);
      return matchName || matchHier || matchLaunch || matchDesc;
    });

    const groups: Array<{
      syntheticCode: string;
      syntheticName: string;
      accounts: ChartOfAccount[];
    }> = [];

    const map = new Map<string, { code: string; name: string; accounts: ChartOfAccount[] }>();

    matches.forEach((acc) => {
      const parent = getParentSynthetic(acc);
      const key = parent ? parent.hierarchicalCode : 'OUTROS';
      const label = parent ? `${parent.hierarchicalCode} - ${parent.name}` : 'Outras Categorias';

      if (!map.has(key)) {
        map.set(key, {
          code: parent?.hierarchicalCode || '',
          name: label,
          accounts: [],
        });
      }
      map.get(key)!.accounts.push(acc);
    });

    map.forEach((val) => {
      groups.push({
        syntheticCode: val.code,
        syntheticName: val.name,
        accounts: val.accounts,
      });
    });

    return groups;
  }, [payableChartSearch, analyticalAccounts, syntheticAccountsMap]);

  // Conta analítica selecionada atualmente no formulário de Nova Obrigação
  const selectedPayableAccount = useMemo(() => {
    if (!payableChartAccountId && !payableLaunchCode) return null;
    return analyticalAccounts.find(
      (a) => a.id === payableChartAccountId || (payableLaunchCode && a.launchCode === payableLaunchCode.trim())
    ) || null;
  }, [analyticalAccounts, payableChartAccountId, payableLaunchCode]);

  // 10 Favorecidos / Fornecedores mais utilizados no Contas a Pagar
  const topUsedSuppliers = useMemo(() => {
    const suppliers = dbState.suppliers || [];
    const payables = dbState.accountsPayable || [];

    // Frequência de cada favorecido nas contas a pagar registradas
    const usageCountMap: Record<string, number> = {};
    payables.forEach((p) => {
      const name = (p.supplierName || '').trim().toLowerCase();
      if (name) {
        usageCountMap[name] = (usageCountMap[name] || 0) + 1;
      }
    });

    // Mapear cada fornecedor cadastrado com sua contagem de uso
    const scoredSuppliers = suppliers.map((sup) => {
      const nameKey = (sup.name || '').trim().toLowerCase();
      const tradeKey = (sup.tradeName || '').trim().toLowerCase();
      let count = usageCountMap[nameKey] || 0;
      if (tradeKey && tradeKey !== nameKey && usageCountMap[tradeKey]) {
        count += usageCountMap[tradeKey];
      }
      return {
        ...sup,
        usageCount: count,
      };
    });

    // Ordenar: primeiro os mais utilizados (maior contagem de lançamentos), depois por ordem alfabética
    scoredSuppliers.sort((a, b) => {
      if (b.usageCount !== a.usageCount) {
        return b.usageCount - a.usageCount;
      }
      return (a.name || '').localeCompare(b.name || '');
    });

    return scoredSuppliers;
  }, [dbState.suppliers, dbState.accountsPayable]);

  // Lista para o Dropdown: quando vazio/ao clicar, lista os 10 mais utilizados;
  // se o usuário digitar algo, filtra mantendo os mais relevantes
  const displayedSuppliers = useMemo(() => {
    const search = payableSupplierName.trim().toLowerCase();
    if (!search) {
      // Exatamente os 10 favorecidos/fornecedores cadastrados mais utilizados
      return topUsedSuppliers.slice(0, 10);
    }
    const filtered = topUsedSuppliers.filter((sup) => {
      const nameMatch = (sup.name || '').toLowerCase().includes(search);
      const tradeMatch = (sup.tradeName || '').toLowerCase().includes(search);
      const docMatch = (sup.cpfCnpj || '').replace(/\D/g, '').includes(search.replace(/\D/g, ''));
      return nameMatch || tradeMatch || docMatch;
    });
    return filtered.slice(0, 10);
  }, [topUsedSuppliers, payableSupplierName]);

  // Conta analítica selecionada atualmente no formulário de Novo Título a Receber
  const selectedReceivableAccount = useMemo(() => {
    if (!receivableChartAccountId && !receivableLaunchCode) return null;
    return analyticalAccounts.find(
      (a) => a.id === receivableChartAccountId || (receivableLaunchCode && a.launchCode === receivableLaunchCode.trim())
    ) || null;
  }, [analyticalAccounts, receivableChartAccountId, receivableLaunchCode]);

  // Resultados da pesquisa por 3 caracteres para o Contas a Receber
  const recChartSearchResults = useMemo(() => {
    const q = receivableChartSearch.trim().toLowerCase();
    if (q.length < 3) return [];

    const matches = analyticalAccounts.filter((acc) => {
      const matchName = acc.name.toLowerCase().includes(q);
      const matchHier = acc.hierarchicalCode.toLowerCase().includes(q);
      const matchLaunch = acc.launchCode?.toLowerCase().includes(q);
      const matchDesc = acc.description?.toLowerCase().includes(q);
      return matchName || matchHier || matchLaunch || matchDesc;
    });

    const groups: Array<{
      syntheticCode: string;
      syntheticName: string;
      accounts: ChartOfAccount[];
    }> = [];

    const map = new Map<string, { code: string; name: string; accounts: ChartOfAccount[] }>();

    matches.forEach((acc) => {
      const parent = getParentSynthetic(acc);
      const key = parent ? parent.hierarchicalCode : 'OUTROS';
      const label = parent ? `${parent.hierarchicalCode} - ${parent.name}` : 'Outras Categorias';

      if (!map.has(key)) {
        map.set(key, {
          code: parent?.hierarchicalCode || '',
          name: label,
          accounts: [],
        });
      }
      map.get(key)!.accounts.push(acc);
    });

    map.forEach((val) => {
      groups.push({
        syntheticCode: val.code,
        syntheticName: val.name,
        accounts: val.accounts,
      });
    });

    return groups;
  }, [analyticalAccounts, getParentSynthetic, receivableChartSearch]);

  // 10 Clientes / Sacados mais utilizados no Contas a Receber
  const topUsedCustomers = useMemo(() => {
    const customers = dbState.customers || [];
    const receivables = dbState.accountsReceivable || [];
    const orders = dbState.orders || [];

    // Frequência de cada cliente nos títulos a receber e pedidos
    const usageCountMap: Record<string, number> = {};
    receivables.forEach((r) => {
      if (r.customerId) {
        usageCountMap[r.customerId] = (usageCountMap[r.customerId] || 0) + 1;
      }
      const name = (r.customerName || '').trim().toLowerCase();
      if (name) {
        usageCountMap[name] = (usageCountMap[name] || 0) + 1;
      }
    });

    orders.forEach((o) => {
      if (o.customerId) {
        usageCountMap[o.customerId] = (usageCountMap[o.customerId] || 0) + 1;
      }
      const name = (o.customerName || '').trim().toLowerCase();
      if (name) {
        usageCountMap[name] = (usageCountMap[name] || 0) + 1;
      }
    });

    // Mapear cada cliente cadastrado com sua contagem de uso
    const scoredCustomers = customers.map((c) => {
      const nameKey = (c.name || '').trim().toLowerCase();
      const tradeKey = (c.tradeName || '').trim().toLowerCase();
      let count = usageCountMap[c.id] || 0;
      if (usageCountMap[nameKey]) count = Math.max(count, usageCountMap[nameKey]);
      if (tradeKey && usageCountMap[tradeKey]) count = Math.max(count, usageCountMap[tradeKey]);
      return {
        ...c,
        usageCount: count,
      };
    });

    // Ordenar: primeiro os mais utilizados, depois por ordem alfabética
    scoredCustomers.sort((a, b) => {
      if (b.usageCount !== a.usageCount) {
        return b.usageCount - a.usageCount;
      }
      return (a.name || '').localeCompare(b.name || '');
    });

    return scoredCustomers;
  }, [dbState.customers, dbState.accountsReceivable, dbState.orders]);

  // Lista para o Dropdown: quando vazio/ao clicar, lista os 10 mais utilizados;
  // se o usuário digitar algo, filtra mantendo os mais relevantes
  const displayedCustomers = useMemo(() => {
    const search = receivableCustomerName.trim().toLowerCase();
    if (!search) {
      // Exatamente os 10 clientes cadastrados mais utilizados
      return topUsedCustomers.slice(0, 10);
    }
    const filtered = topUsedCustomers.filter((c) => {
      const nameMatch = (c.name || '').toLowerCase().includes(search);
      const tradeMatch = (c.tradeName || '').toLowerCase().includes(search);
      const docMatch = (c.cpfCnpj || '').replace(/\D/g, '').includes(search.replace(/\D/g, ''));
      return nameMatch || tradeMatch || docMatch;
    });
    return filtered.slice(0, 10);
  }, [topUsedCustomers, receivableCustomerName]);

  // Realizar Pagamento de Conta a Pagar (com verificação obrigatória de classificação)
  const handleConfirmPayingTitle = () => {
    if (!payingTitle) return;
    const amount = parseFloat(partialAmount) || payingTitle.balance;
    if (amount <= 0 || amount > payingTitle.balance) {
      toast.warning(`Valor inválido. Máximo permitido: ${formatCurrency(payingTitle.balance)}.`, 'Valor Inválido');
      return;
    }

    // REGRA MANDATÓRIA: É estritamente obrigatório informar o Código de Lançamento (3 dígitos) antes de baixar
    const targetAccountId = payingChartAccountId || payingTitle.chartAccountId;
    const targetLaunch = payingLaunchCode || payingTitle.launchCode;
    const matchedAccount = analyticalAccounts.find(
      (a) => a.id === targetAccountId || (targetLaunch && a.launchCode === targetLaunch.trim())
    );

    const hasCompleteItemRateio = Boolean(
      payingTitle.itemClassifications &&
      payingTitle.itemClassifications.length > 0 &&
      payingTitle.itemClassifications.every((i) => i.launchCode && i.chartAccountId)
    );

    if (!matchedAccount && !hasCompleteItemRateio) {
      toast.error(
        'Bloqueio Gerencial: É estritamente obrigatório informar o Código de Lançamento (3 dígitos) do Plano de Contas para liquidar a despesa.',
        'Classificação Obrigatória'
      );
      return;
    }

    const nowIso = new Date().toISOString();
    const newPaidVal = payingTitle.paidValue + amount;
    const newBalance = Math.max(0, payingTitle.originalValue - newPaidVal);
    const newStatus = newBalance === 0 ? 'pago' : 'parcial';

    const accountLaunchDisplay = matchedAccount
      ? `[${matchedAccount.launchCode}] ${matchedAccount.name}`
      : `Rateio Multi-Contas (${payingTitle.itemClassifications?.length} itens)`;

    const updatedPayables = dbState.accountsPayable.map((p) =>
      p.id === payingTitle.id
        ? {
            ...p,
            paidValue: newPaidVal,
            balance: newBalance,
            status: newStatus as any,
            chartAccountId: matchedAccount ? matchedAccount.id : p.chartAccountId,
            chartAccountCode: matchedAccount ? matchedAccount.hierarchicalCode : p.chartAccountCode,
            launchCode: matchedAccount ? matchedAccount.launchCode : p.launchCode,
            chartAccountName: matchedAccount ? matchedAccount.name : (p.chartAccountName || 'Rateio Multi-Contas NF-e'),
            classificationStatus: 'classificado' as const,
            classifiedAt: p.classifiedAt || nowIso,
            classifiedBy: p.classifiedBy || currentUser.name,
            payments: [
              ...p.payments,
              {
                date: nowIso,
                amount,
                method: paymentMethodUsed,
                userId: currentUser.id,
                notes: `Pagamento efetuado por ${currentUser.name} (Classificado: ${accountLaunchDisplay})`,
              },
            ],
          }
        : p
    );

    const state = Database.getState();
    state.accountsPayable = updatedPayables;
    Database.persist();

    Database.addAuditLog(
      'BAIXA_CONTAS_PAGAR',
      'FINANCEIRO',
      payingTitle.id,
      `Pagamento de ${formatCurrency(amount)} liquidado para ${payingTitle.description} [${accountLaunchDisplay}] via ${paymentMethodUsed}`
    );

    toast.success(`Pagamento de ${formatCurrency(amount)} liquidado com sucesso!`, 'Contas a Pagar');
    FirebaseSyncService.syncToFirebase(Database.getState()).catch(console.error);
    setPayingTitle(null);
    setPartialAmount('');
    setPayingLaunchCode('');
    setPayingChartAccountId('');
  };

  // EXCLUIR E EDITAR CONTAS A RECEBER
  const handleDeleteReceivable = (r: AccountReceivable) => {
    setDeleteConfirmation({
      type: 'receivable',
      id: r.id,
      docNumber: r.docNumber,
      description: r.customerName,
      value: r.originalValue,
    });
  };

  const handleOpenEditReceivable = (r: AccountReceivable) => {
    setEditingReceivable(r);
    setRecFormData({
      docNumber: r.docNumber,
      customerName: r.customerName,
      issueDate: r.issueDate || new Date().toISOString().split('T')[0],
      dueDate: r.dueDate || new Date().toISOString().split('T')[0],
      originalValue: String(r.originalValue),
      paymentMethod: r.paymentMethod || 'Boleto',
      status: r.status,
    });
  };

  const handleSaveReceivable = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(recFormData.originalValue);
    if (!recFormData.customerName.trim() || isNaN(val) || val <= 0) {
      toast.warning('Informe o cliente e um valor válido.', 'Dados Inválidos');
      return;
    }

    const state = Database.getState();

    if (editingReceivable) {
      const paid = editingReceivable.paidValue || 0;
      const balance = Math.max(0, val - paid);
      const computedStatus = balance === 0 ? 'recebido' : (paid > 0 ? 'parcial' : recFormData.status);

      state.accountsReceivable = state.accountsReceivable.map((item) =>
        item.id === editingReceivable.id
          ? {
              ...item,
              docNumber: recFormData.docNumber.trim() || item.docNumber,
              customerName: recFormData.customerName.trim(),
              issueDate: recFormData.issueDate || item.issueDate,
              dueDate: recFormData.dueDate || item.dueDate,
              originalValue: val,
              balance,
              paymentMethod: recFormData.paymentMethod,
              status: computedStatus,
            }
          : item
      );
      Database.persist();
      FirebaseSyncService.syncToFirebase(Database.getState()).catch(console.error);
      Database.addAuditLog(
        'EDITAR_CONTAS_RECEBER',
        'FINANCEIRO',
        editingReceivable.id,
        `Título ${editingReceivable.docNumber} atualizado por ${currentUser.name}: ${recFormData.customerName}, ${formatCurrency(val)}`
      );
      toast.success('Título a receber atualizado com sucesso!');
      setEditingReceivable(null);
    } else {
      const newRec: AccountReceivable = {
        id: 'REC-' + Date.now(),
        companyId: currentCompany.id,
        docNumber: recFormData.docNumber.trim() || 'TIT-' + Date.now().toString().slice(-4),
        customerName: recFormData.customerName.trim(),
        customerId: 'cli-manual',
        installmentNumber: 1,
        totalInstallments: 1,
        issueDate: recFormData.issueDate || new Date().toISOString().split('T')[0],
        dueDate: recFormData.dueDate || new Date().toISOString().split('T')[0],
        originalValue: val,
        discount: 0,
        addition: 0,
        paidValue: 0,
        balance: val,
        paymentMethod: recFormData.paymentMethod,
        status: recFormData.status || 'aberto',
        receipts: [],
      };
      state.accountsReceivable = [newRec, ...(state.accountsReceivable || [])];
      Database.persist();
      FirebaseSyncService.syncToFirebase(Database.getState()).catch(console.error);
      Database.addAuditLog(
        'CRIAR_CONTAS_RECEBER',
        'FINANCEIRO',
        newRec.id,
        `Título a receber ${newRec.docNumber} (${newRec.customerName}) cadastrado por ${currentUser.name}`
      );
      toast.success('Título a receber cadastrado com sucesso!');
      setIsNewReceivableOpen(false);
    }
  };

  // EXCLUIR E EDITAR CONTAS A PAGAR
  const handleDeletePayable = (p: AccountPayable) => {
    setDeleteConfirmation({
      type: 'payable',
      id: p.id,
      docNumber: p.docNumber,
      description: p.description,
      value: p.originalValue,
    });
  };

  const handleExecuteDelete = async () => {
    if (!deleteConfirmation) return;
    const { type, id, docNumber, description } = deleteConfirmation;

    if (type === 'receivable') {
      Database.deleteAccountReceivable(id);
      setDbState({ ...Database.getState() });
      try {
        await FirebaseSyncService.syncToFirebase(Database.getState());
      } catch (e) {
        console.warn('Erro ao sincronizar exclusão com Firebase:', e);
      }
      toast.success(`Título a receber "${docNumber}" (${description}) excluído com sucesso!`);
    } else {
      Database.deleteAccountPayable(id);
      setDbState({ ...Database.getState() });
      try {
        await FirebaseSyncService.syncToFirebase(Database.getState());
      } catch (e) {
        console.warn('Erro ao sincronizar exclusão com Firebase:', e);
      }
      toast.success(`Conta a pagar "${docNumber}" (${description}) excluída com sucesso!`);
    }

    setDeleteConfirmation(null);
  };

  const handleOpenEditPayable = (p: AccountPayable) => {
    setEditingPayable(p);
    setPayFormData({
      docNumber: p.docNumber,
      description: p.description,
      category: p.category,
      supplierName: p.supplierName,
      issueDate: p.issueDate || new Date().toISOString().split('T')[0],
      dueDate: p.dueDate || new Date().toISOString().split('T')[0],
      originalValue: String(p.originalValue),
      status: p.status,
      notes: p.notes || '',
      chartAccountId: p.chartAccountId || '',
      chartAccountCode: p.chartAccountCode || '',
      launchCode: p.launchCode || '',
      chartAccountName: p.chartAccountName || '',
      classificationStatus: p.classificationStatus || (p.chartAccountId ? 'classificado' : 'pendente'),
    });
  };

  const handleSaveEditedPayable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayable) return;
    const val = parseFloat(payFormData.originalValue);
    if (!payFormData.description.trim() || isNaN(val) || val <= 0) {
      toast.warning('Informe a descrição e um valor válido.', 'Dados Inválidos');
      return;
    }

    const matchedAccount = payFormData.chartAccountId
      ? analyticalAccounts.find((a) => a.id === payFormData.chartAccountId)
      : payFormData.launchCode
      ? analyticalAccounts.find((a) => a.launchCode === payFormData.launchCode.trim())
      : null;

    const isClassified = Boolean(matchedAccount);
    const state = Database.getState();
    const paid = editingPayable.paidValue || 0;
    const balance = Math.max(0, val - paid);
    const computedStatus = balance === 0 ? 'pago' : (paid > 0 ? 'parcial' : payFormData.status);

    state.accountsPayable = state.accountsPayable.map((item) =>
      item.id === editingPayable.id
        ? {
            ...item,
            docNumber: payFormData.docNumber.trim() || item.docNumber,
            description: payFormData.description.trim(),
            category: payFormData.category,
            supplierName: payFormData.supplierName.trim() || 'Despesa Geral',
            issueDate: payFormData.issueDate || item.issueDate,
            dueDate: payFormData.dueDate || item.dueDate,
            originalValue: val,
            balance,
            status: computedStatus,
            notes: payFormData.notes.trim(),
            chartAccountId: matchedAccount ? matchedAccount.id : undefined,
            chartAccountCode: matchedAccount ? matchedAccount.hierarchicalCode : undefined,
            launchCode: matchedAccount ? matchedAccount.launchCode : undefined,
            chartAccountName: matchedAccount ? matchedAccount.name : undefined,
            classificationStatus: isClassified ? 'classificado' : 'pendente',
            classifiedAt: isClassified ? (item.classifiedAt || new Date().toISOString()) : undefined,
            classifiedBy: isClassified ? (item.classifiedBy || currentUser.name) : undefined,
          }
        : item
    );
    Database.persist();
    FirebaseSyncService.syncToFirebase(Database.getState()).catch(console.error);
    Database.addAuditLog(
      'EDITAR_CONTAS_PAGAR',
      'FINANCEIRO',
      editingPayable.id,
      `Conta a pagar ${editingPayable.docNumber} (${payFormData.description}) atualizada por ${currentUser.name}`
    );
    toast.success('Conta a pagar atualizada com sucesso!');
    setEditingPayable(null);
  };

  // Recalcular parcelas com datas de pagamento customizáveis
  const recalculateInstallments = (
    count: number,
    totalVal: number,
    firstDueDate: string,
    baseDoc: string,
    method: string,
    intervalDays: number = 30
  ) => {
    if (count <= 1 || isNaN(totalVal) || totalVal <= 0) {
      setPayableCustomInstallments([]);
      return;
    }

    const baseAmount = Math.floor((totalVal / count) * 100) / 100;
    const diff = Math.round((totalVal - baseAmount * count) * 100) / 100;

    const baseDate = firstDueDate ? new Date(firstDueDate + 'T12:00:00') : new Date();

    const list = Array.from({ length: count }, (_, idx) => {
      const num = idx + 1;
      const d = new Date(baseDate);
      d.setDate(d.getDate() + idx * intervalDays);
      const dueDateStr = d.toISOString().split('T')[0];
      const instAmount = num === count ? Number((baseAmount + diff).toFixed(2)) : baseAmount;
      const docStr = baseDoc.trim()
        ? `${baseDoc.trim()}/${String(num).padStart(2, '0')}`
        : `DOC-${Date.now().toString().slice(-4)}/${String(num).padStart(2, '0')}`;

      return {
        installmentNumber: num,
        docNumber: docStr,
        dueDate: dueDateStr,
        amount: instAmount,
        paymentMethod: method || 'Boleto',
      };
    });

    setPayableCustomInstallments(list);
  };

  // Recalcular parcelas a receber com datas e valores customizáveis
  const recalculateRecInstallments = (
    count: number,
    totalVal: number,
    firstDueDate: string,
    baseDoc: string,
    method: string,
    intervalDays: number = 30
  ) => {
    if (count <= 1 || isNaN(totalVal) || totalVal <= 0) {
      setReceivableCustomInstallments([]);
      return;
    }

    const baseAmount = Math.floor((totalVal / count) * 100) / 100;
    const diff = Math.round((totalVal - baseAmount * count) * 100) / 100;

    const baseDate = firstDueDate ? new Date(firstDueDate + 'T12:00:00') : new Date();

    const list = Array.from({ length: count }, (_, idx) => {
      const num = idx + 1;
      const d = new Date(baseDate);
      d.setDate(d.getDate() + idx * intervalDays);
      const dueDateStr = d.toISOString().split('T')[0];
      const instAmount = num === count ? Number((baseAmount + diff).toFixed(2)) : baseAmount;
      const docStr = baseDoc.trim()
        ? `${baseDoc.trim()}/${String(num).padStart(2, '0')}`
        : `TIT-${Date.now().toString().slice(-4)}/${String(num).padStart(2, '0')}`;

      return {
        installmentNumber: num,
        docNumber: docStr,
        dueDate: dueDateStr,
        amount: instAmount,
        paymentMethod: method || 'Boleto',
      };
    });

    setReceivableCustomInstallments(list);
  };

  // Salvar Cliente / Sacado cadastrado rapidamente a partir da tela de Contas a Receber
  const handleSaveQuickCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCustomerName.trim()) {
      toast.warning('O nome ou razão social do cliente é obrigatório.', 'Campo Obrigatório');
      return;
    }

    const state = Database.getState();
    const existingCustomers = state.customers || [];
    const nextCode = 'CLI-' + String(existingCustomers.length + 1).padStart(3, '0');

    const newCustomer: Customer = {
      id: 'CUST-' + Date.now(),
      code: nextCode,
      companyId: currentCompany.id,
      name: quickCustomerName.trim(),
      tradeName: quickCustomerTradeName.trim() || quickCustomerName.trim(),
      type: quickCustomerType,
      cpfCnpj: quickCustomerCpfCnpj.trim(),
      phone: quickCustomerPhone.trim(),
      whatsapp: quickCustomerPhone.trim(),
      email: quickCustomerEmail.trim(),
      city: quickCustomerCity.trim(),
      state: quickCustomerState.trim() || 'BA',
      status: 'ativo',
      creditLimit: 0,
    };

    state.customers = [newCustomer, ...existingCustomers];
    Database.addAuditLog(
      'CRIAR_CLIENTE',
      'FINANCEIRO',
      newCustomer.id,
      `Cliente/Sacado "${newCustomer.name}" cadastrado a partir de Contas a Receber.`
    );
    Database.persist();
    FirebaseSyncService.syncToFirebase(Database.getState()).catch(console.error);

    // Seleciona imediatamente o cliente recém-cadastrado no contas a receber
    setReceivableCustomerName(newCustomer.name);
    setReceivableCustomerId(newCustomer.id);
    setIsCustomerDropdownOpen(false);

    toast.success(
      `Cliente/Sacado "${newCustomer.name}" cadastrado e selecionado!`,
      'Cliente Cadastrado'
    );

    // Limpa e fecha modal
    setQuickCustomerName('');
    setQuickCustomerTradeName('');
    setQuickCustomerCpfCnpj('');
    setQuickCustomerPhone('');
    setQuickCustomerEmail('');
    setQuickCustomerCity('');
    setQuickCustomerState('BA');
    setIsQuickCustomerModalOpen(false);
  };

  // Cadastrar Novo Título a Receber (com Cliente, Plano de Contas, Histórico, Nº Doc, Forma Cobrança, Valor, Vencimento e Parcelamento)
  const handleCreateReceivable = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(receivableAmount.replace(',', '.'));

    if (!receivableCustomerName.trim()) {
      toast.warning('Informe o Cliente / Sacado do título.', 'Campo Obrigatório');
      return;
    }

    if (!receivableHistory.trim()) {
      toast.warning('Informe o Histórico do lançamento.', 'Campo Obrigatório');
      return;
    }

    if (isNaN(amt) || amt <= 0) {
      toast.warning('Informe um Valor Total válido maior que zero.', 'Valor Inválido');
      return;
    }

    if (!receivableDueDate) {
      toast.warning('Informe a Data de Vencimento do título.', 'Campo Obrigatório');
      return;
    }

    const matchedAccount = receivableChartAccountId
      ? analyticalAccounts.find((a) => a.id === receivableChartAccountId)
      : receivableLaunchCode
      ? analyticalAccounts.find((a) => a.launchCode === receivableLaunchCode.trim())
      : null;

    if (!matchedAccount) {
      toast.warning('Selecione a conta analítica do Plano de Contas.', 'Campo Obrigatório');
      return;
    }

    const isClassified = true;
    const baseDoc = receivableDocNumber.trim() || 'TIT-' + Date.now().toString().slice(-4);
    const isMulti = isRecMultipleInstallmentsEnabled && (receivableInstallmentCount > 1);
    const count = isMulti ? (receivableInstallmentCount || 1) : 1;

    const matchedCustomer = dbState.customers.find(
      (c) => c.name.toLowerCase() === receivableCustomerName.trim().toLowerCase() ||
             (c.tradeName && c.tradeName.toLowerCase() === receivableCustomerName.trim().toLowerCase())
    );
    const customerId = matchedCustomer ? matchedCustomer.id : (receivableCustomerId || 'cli-manual');

    if (count > 1) {
      // Criação de Múltiplas Parcelas com suas respectivas datas de vencimento
      let instList = receivableCustomInstallments;
      if (instList.length !== count) {
        const baseAmount = Math.floor((amt / count) * 100) / 100;
        const diff = Math.round((amt - baseAmount * count) * 100) / 100;
        const baseDate = new Date(receivableDueDate + 'T12:00:00');
        instList = Array.from({ length: count }, (_, idx) => {
          const num = idx + 1;
          const d = new Date(baseDate);
          d.setDate(d.getDate() + idx * receivableIntervalDays);
          return {
            installmentNumber: num,
            docNumber: `${baseDoc}/${String(num).padStart(2, '0')}`,
            dueDate: d.toISOString().split('T')[0],
            amount: num === count ? Number((baseAmount + diff).toFixed(2)) : baseAmount,
            paymentMethod: receivablePaymentMethod || 'Boleto',
          };
        });
      }

      const sumInst = instList.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
      if (Math.abs(sumInst - amt) > 0.05) {
        toast.warning(
          `A soma das parcelas (${formatCurrency(sumInst)}) difere do valor total (${formatCurrency(amt)}). Ajuste os valores ou clique em Ratear Igualmente.`,
          'Soma Divergente'
        );
        return;
      }

      const baseTimestamp = Date.now();
      const newReceivables: AccountReceivable[] = instList.map((inst, idx) => ({
        id: `REC-${baseTimestamp}-${idx + 1}`,
        companyId: currentCompany.id,
        customerId,
        customerName: receivableCustomerName.trim(),
        docNumber: inst.docNumber.trim() || `${baseDoc}/${String(inst.installmentNumber).padStart(2, '0')}`,
        installmentNumber: inst.installmentNumber,
        totalInstallments: count,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: inst.dueDate || receivableDueDate,
        originalValue: Number(inst.amount),
        discount: 0,
        addition: 0,
        paidValue: 0,
        balance: Number(inst.amount),
        paymentMethod: inst.paymentMethod || receivablePaymentMethod || 'Boleto',
        status: 'aberto',
        receipts: [],
        history: receivableHistory.trim(),
        notes: `${receivableHistory.trim()} - Parcela ${inst.installmentNumber} de ${count}`,
        chartAccountId: matchedAccount ? matchedAccount.id : undefined,
        chartAccountCode: matchedAccount ? matchedAccount.hierarchicalCode : undefined,
        launchCode: matchedAccount ? matchedAccount.launchCode : undefined,
        chartAccountName: matchedAccount ? matchedAccount.name : undefined,
        classificationStatus: isClassified ? 'classificado' : 'pendente',
        classifiedAt: isClassified ? new Date().toISOString() : undefined,
        classifiedBy: isClassified ? currentUser.name : undefined,
      }));

      const st = Database.getState();
      st.accountsReceivable = [...newReceivables, ...(st.accountsReceivable || [])];
      Database.persist();
      FirebaseSyncService.syncToFirebase(Database.getState()).catch(console.error);

      Database.addAuditLog(
        'CRIAR_CONTAS_RECEBER_PARCELADO',
        'FINANCEIRO',
        newReceivables[0].id,
        `${count} parcelas de ${receivableHistory} criadas para ${receivableCustomerName} totalizando ${formatCurrency(amt)}`
      );

      toast.success(`${count} parcelas lançadas com sucesso no Contas a Receber!`, 'Título Parcelado');
    } else {
      // Parcela Única
      const newRec: AccountReceivable = {
        id: 'REC-' + Date.now(),
        companyId: currentCompany.id,
        customerId,
        customerName: receivableCustomerName.trim(),
        docNumber: baseDoc,
        installmentNumber: 1,
        totalInstallments: 1,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: receivableDueDate,
        originalValue: amt,
        discount: 0,
        addition: 0,
        paidValue: 0,
        balance: amt,
        paymentMethod: receivablePaymentMethod || 'Boleto',
        status: 'aberto',
        receipts: [],
        history: receivableHistory.trim(),
        notes: receivableHistory.trim(),
        chartAccountId: matchedAccount ? matchedAccount.id : undefined,
        chartAccountCode: matchedAccount ? matchedAccount.hierarchicalCode : undefined,
        launchCode: matchedAccount ? matchedAccount.launchCode : undefined,
        chartAccountName: matchedAccount ? matchedAccount.name : undefined,
        classificationStatus: isClassified ? 'classificado' : 'pendente',
        classifiedAt: isClassified ? new Date().toISOString() : undefined,
        classifiedBy: isClassified ? currentUser.name : undefined,
      };

      const st = Database.getState();
      st.accountsReceivable = [newRec, ...(st.accountsReceivable || [])];
      Database.persist();
      FirebaseSyncService.syncToFirebase(Database.getState()).catch(console.error);

      Database.addAuditLog(
        'CRIAR_CONTAS_RECEBER',
        'FINANCEIRO',
        newRec.id,
        `Título a receber ${newRec.docNumber} (${receivableCustomerName}) de ${formatCurrency(amt)} lançado por ${currentUser.name}`
      );

      toast.success('Título a receber lançado com sucesso!', 'Título Registrado');
    }

    setIsNewReceivableOpen(false);
  };

  // Salvar Favorecido / Fornecedor cadastrado rapidamente a partir da tela de Contas a Pagar
  const handleSaveQuickSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSupplierName.trim()) {
      toast.warning('O nome ou razão social do favorecido/fornecedor é obrigatório.', 'Campo Obrigatório');
      return;
    }

    const state = Database.getState();
    const existingSuppliers = state.suppliers || [];
    const nextCode = 'FOR-' + String(existingSuppliers.length + 1).padStart(3, '0');

    const newSupplier: Supplier = {
      id: 'SUP-' + Date.now(),
      code: nextCode,
      name: quickSupplierName.trim(),
      tradeName: quickSupplierTradeName.trim() || quickSupplierName.trim(),
      type: quickSupplierType,
      cpfCnpj: quickSupplierCpfCnpj.trim(),
      phone: quickSupplierPhone.trim(),
      whatsapp: quickSupplierPhone.trim(),
      email: quickSupplierEmail.trim(),
      city: quickSupplierCity.trim(),
      state: quickSupplierState.trim() || 'BA',
      status: 'ativo',
      paymentTerms: '30 dias',
      notes: 'Cadastrado via lançamento de Contas a Pagar',
    };

    state.suppliers = [newSupplier, ...existingSuppliers];
    Database.addAuditLog(
      'CRIAR_FORNECEDOR',
      'FINANCEIRO',
      newSupplier.id,
      `Favorecido/Fornecedor "${newSupplier.name}" cadastrado a partir de Contas a Pagar.`
    );
    Database.persist();
    FirebaseSyncService.syncToFirebase(Database.getState()).catch(console.error);

    // Seleciona imediatamente o favorecido recém-cadastrado na obrigação financeira
    setPayableSupplierName(newSupplier.name);

    toast.success(
      `Favorecido/Fornecedor "${newSupplier.name}" cadastrado e selecionado!`,
      'Fornecedor Cadastrado'
    );

    // Limpa e fecha modal
    setQuickSupplierName('');
    setQuickSupplierTradeName('');
    setQuickSupplierCpfCnpj('');
    setQuickSupplierPhone('');
    setQuickSupplierEmail('');
    setQuickSupplierCity('');
    setQuickSupplierState('BA');
    setIsQuickSupplierModalOpen(false);
  };

  // Cadastrar Nova Obrigação a Pagar (com Favorecido, Plano de Contas, Histórico, Nº Doc, Forma Pgto, Valor, Vencimento e Parcelamento)
  const handleCreatePayable = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(payableAmount.replace(',', '.'));

    if (!payableSupplierName.trim()) {
      toast.warning('Informe o Favorecido / Fornecedor da obrigação.', 'Campo Obrigatório');
      return;
    }

    if (!payableHistory.trim()) {
      toast.warning('Informe o Histórico do lançamento.', 'Campo Obrigatório');
      return;
    }

    if (isNaN(amt) || amt <= 0) {
      toast.warning('Informe um Valor Total válido maior que zero.', 'Valor Inválido');
      return;
    }

    if (!payableDueDate) {
      toast.warning('Informe a Data de Vencimento da obrigação.', 'Campo Obrigatório');
      return;
    }

    const matchedAccount = payableChartAccountId
      ? analyticalAccounts.find((a) => a.id === payableChartAccountId)
      : payableLaunchCode
      ? analyticalAccounts.find((a) => a.launchCode === payableLaunchCode.trim())
      : null;

    if (!matchedAccount) {
      toast.warning('Selecione a conta analítica do Plano de Contas.', 'Campo Obrigatório');
      return;
    }

    const isClassified = true;
    const baseDoc = payableDocNumber.trim() || 'DOC-' + Date.now().toString().slice(-4);
    const isMulti = isMultipleInstallmentsEnabled && (payableInstallmentCount > 1);
    const count = isMulti ? (payableInstallmentCount || 1) : 1;

    if (count > 1) {
      // Criação de Múltiplas Parcelas com suas respectivas datas de pagamento
      let instList = payableCustomInstallments;
      if (instList.length !== count) {
        // Gera caso a grade não tenha sido renderizada
        const baseAmount = Math.floor((amt / count) * 100) / 100;
        const diff = Math.round((amt - baseAmount * count) * 100) / 100;
        const baseDate = new Date(payableDueDate + 'T12:00:00');
        instList = Array.from({ length: count }, (_, idx) => {
          const num = idx + 1;
          const d = new Date(baseDate);
          d.setDate(d.getDate() + idx * payableIntervalDays);
          return {
            installmentNumber: num,
            docNumber: `${baseDoc}/${String(num).padStart(2, '0')}`,
            dueDate: d.toISOString().split('T')[0],
            amount: num === count ? Number((baseAmount + diff).toFixed(2)) : baseAmount,
            paymentMethod: payablePaymentMethod || 'Boleto',
          };
        });
      }

      const sumInst = instList.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
      if (Math.abs(sumInst - amt) > 0.05) {
        toast.warning(
          `A soma das parcelas (${formatCurrency(sumInst)}) difere do valor total (${formatCurrency(amt)}). Ajuste os valores ou clique em Ratear Igualmente.`,
          'Soma Divergente'
        );
        return;
      }

      const baseTimestamp = Date.now();
      const newPayables: AccountPayable[] = instList.map((inst, idx) => ({
        id: `PAG-${baseTimestamp}-${idx + 1}`,
        companyId: currentCompany.id,
        supplierName: payableSupplierName.trim(),
        description: `${payableHistory.trim()} (${inst.installmentNumber}/${count})`,
        history: payableHistory.trim(),
        category: 'fornecedores', // categoria mantida no backend/schema, retirada do UI
        docNumber: inst.docNumber.trim() || `${baseDoc}/${String(inst.installmentNumber).padStart(2, '0')}`,
        paymentMethod: inst.paymentMethod || payablePaymentMethod || 'Boleto',
        installmentNumber: inst.installmentNumber,
        totalInstallments: count,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: inst.dueDate || payableDueDate,
        originalValue: Number(inst.amount),
        discount: 0,
        addition: 0,
        paidValue: 0,
        balance: Number(inst.amount),
        status: 'aberto',
        payments: [],
        notes: `${payableHistory.trim()} - Parcela ${inst.installmentNumber} de ${count}`,
        chartAccountId: matchedAccount ? matchedAccount.id : undefined,
        chartAccountCode: matchedAccount ? matchedAccount.hierarchicalCode : undefined,
        launchCode: matchedAccount ? matchedAccount.launchCode : undefined,
        chartAccountName: matchedAccount ? matchedAccount.name : undefined,
        classificationStatus: isClassified ? 'classificado' : 'pendente',
        classifiedAt: isClassified ? new Date().toISOString() : undefined,
        classifiedBy: isClassified ? currentUser.name : undefined,
      }));

      const st = Database.getState();
      st.accountsPayable = [...newPayables, ...(st.accountsPayable || [])];
      Database.persist();
      FirebaseSyncService.syncToFirebase(Database.getState()).catch(console.error);

      Database.addAuditLog(
        'CRIAR_CONTA_PAGAR_PARCELADA',
        'FINANCEIRO',
        newPayables[0].id,
        `${count} parcelas de ${payableHistory} criadas para ${payableSupplierName} totalizando ${formatCurrency(amt)}`
      );

      toast.success(`${count} parcelas lançadas com sucesso no Contas a Pagar!`, 'Obrigação Parcelada');
    } else {
      // Parcela Única
      const newPayable: AccountPayable = {
        id: 'PAG-' + Date.now(),
        companyId: currentCompany.id,
        supplierName: payableSupplierName.trim(),
        description: payableHistory.trim(),
        history: payableHistory.trim(),
        category: 'fornecedores',
        docNumber: baseDoc,
        paymentMethod: payablePaymentMethod || 'Boleto',
        installmentNumber: 1,
        totalInstallments: 1,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: payableDueDate,
        originalValue: amt,
        discount: 0,
        addition: 0,
        paidValue: 0,
        balance: amt,
        status: 'aberto',
        payments: [],
        notes: payableHistory.trim(),
        chartAccountId: matchedAccount ? matchedAccount.id : undefined,
        chartAccountCode: matchedAccount ? matchedAccount.hierarchicalCode : undefined,
        launchCode: matchedAccount ? matchedAccount.launchCode : undefined,
        chartAccountName: matchedAccount ? matchedAccount.name : undefined,
        classificationStatus: isClassified ? 'classificado' : 'pendente',
        classifiedAt: isClassified ? new Date().toISOString() : undefined,
        classifiedBy: isClassified ? currentUser.name : undefined,
      };

      const st = Database.getState();
      st.accountsPayable = [newPayable, ...(st.accountsPayable || [])];
      Database.persist();
      FirebaseSyncService.syncToFirebase(Database.getState()).catch(console.error);

      Database.addAuditLog(
        'CRIAR_CONTA_PAGAR',
        'FINANCEIRO',
        newPayable.id,
        `Conta a pagar ${payableHistory} criada para ${payableSupplierName} no valor de ${formatCurrency(amt)} [Status: ${newPayable.classificationStatus}]`
      );

      toast.success('Obrigação financeira cadastrada no Contas a Pagar com sucesso!', 'Salvo com Sucesso');
    }

    setIsNewPayableOpen(false);
    setPayableSupplierName('');
    setIsSupplierDropdownOpen(false);
    setPayableLaunchCode('');
    setPayableChartAccountId('');
    setPayableChartSearch('');
    setIsChartSearchDropdownOpen(false);
    setPayableHistory('');
    setPayableDocNumber('');
    setPayablePaymentMethod('Boleto');
    setPayableAmount('');
    setPayableDueDate('');
    setIsMultipleInstallmentsEnabled(false);
    setPayableInstallmentCount(1);
    setPayableIntervalDays(30);
    setPayableCustomInstallments([]);
  };

  // Realizar Suprimento ou Sangria no Caixa PDV
  const handleExecuteCashOperation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCashRegister) {
      alert('Não há caixa aberto no momento.');
      return;
    }

    const amt = parseFloat(cashOpAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Informe um valor válido maior que zero.');
      return;
    }

    const nowIso = new Date().toISOString();
    const newMovement: CashMovement = {
      id: 'MOV-' + Date.now(),
      type: cashOpType,
      amount: amt,
      description: cashOpReason.trim() || (cashOpType === 'suprimento' ? 'Suprimento de troco' : 'Sangria de segurança para o cofre'),
      timestamp: nowIso,
      userId: currentUser.id,
    };

    const state = Database.getState();
    state.cashRegisters = state.cashRegisters.map((reg) =>
      reg.id === activeCashRegister.id
        ? {
            ...reg,
            movements: [...reg.movements, newMovement],
          }
        : reg
    );
    Database.persist();

    Database.addAuditLog(
      cashOpType === 'suprimento' ? 'SUPRIMENTO_CAIXA' : 'SANGRIA_CAIXA',
      'FINANCEIRO',
      activeCashRegister.id,
      `${cashOpType.toUpperCase()} de ${formatCurrency(amt)} realizado por ${currentUser.name}. Motivo: ${newMovement.description}`
    );

    alert(`${cashOpType === 'suprimento' ? 'Suprimento' : 'Sangria'} de ${formatCurrency(amt)} registrado no caixa.`);
    setIsCashOperationModalOpen(false);
    setCashOpAmount('');
    setCashOpReason('');
  };

  // Fechamento de Caixa PDV com Conferência Cega
  const handleConfirmCloseCashRegister = () => {
    if (!activeCashRegister) return;

    // Calcular valores esperados pelo sistema
    const expectedMoney =
      activeCashRegister.initialBalance +
      activeCashRegister.movements
        .filter((m) => m.type === 'suprimento' || m.type === 'venda_dinheiro')
        .reduce((s, m) => s + m.amount, 0) -
      activeCashRegister.movements
        .filter((m) => m.type === 'sangria')
        .reduce((s, m) => s + m.amount, 0);

    const expectedPix = activeCashRegister.movements
      .filter((m) => m.type === 'venda_pix')
      .reduce((s, m) => s + m.amount, 0);

    const expectedCard = activeCashRegister.movements
      .filter((m) => m.type === 'venda_cartao')
      .reduce((s, m) => s + m.amount, 0);

    const expectedTotal = expectedMoney + expectedPix + expectedCard;

    const repMoney = parseCashDecimalPtBr(reportedCash);
    const repPix = parseCashDecimalPtBr(reportedPix);
    const repCard = parseCashDecimalPtBr(reportedCard);
    const repTotal = repMoney + repPix + repCard;

    const diff = repTotal - expectedTotal;

    const state = Database.getState();
    state.cashRegisters = state.cashRegisters.map((reg) =>
      reg.id === activeCashRegister.id
        ? {
            ...reg,
            status: 'fechado' as const,
            closedAt: new Date().toISOString(),
            reportedBalance: {
              dinheiro: repMoney,
              pix: repPix,
              cartao: repCard,
              outros: 0,
            },
            expectedBalance: {
              dinheiro: expectedMoney,
              pix: expectedPix,
              cartao: expectedCard,
              outros: 0,
            },
            difference: diff,
            closingNotes,
          }
        : reg
    );
    Database.persist();

    Database.addAuditLog(
      'FECHAMENTO_CAIXA',
      'FINANCEIRO',
      activeCashRegister.id,
      `Caixa fechado por ${currentUser.name}. Esperado: ${formatCurrency(expectedTotal)}, Informado: ${formatCurrency(repTotal)}, Diferença: ${formatCurrency(diff)}`
    );

    alert(
      `Caixa PDV encerrado com sucesso!\n\nEsperado pelo Sistema: ${formatCurrency(expectedTotal)}\nInformado pelo Operador: ${formatCurrency(repTotal)}\nDivergência apurada: ${diff >= 0 ? '+' : ''}${formatCurrency(diff)}`
    );

    setIsCloseRegisterModalOpen(false);
    setReportedCash('0,00');
    setReportedPix('0,00');
    setReportedCard('0,00');
    setClosingNotes('');
  };

  const companyReceivables = useMemo(
    () => (dbState.accountsReceivable || []).filter((r) => r.companyId === currentCompany.id),
    [dbState.accountsReceivable, currentCompany.id]
  );
  const companyPayables = useMemo(
    () => (dbState.accountsPayable || []).filter((p) => p.companyId === currentCompany.id),
    [dbState.accountsPayable, currentCompany.id]
  );

  // Lista de Fornecedores disponíveis para filtro
  const availableSuppliers = useMemo(() => {
    const map = new Map<string, string>();
    (dbState.suppliers || []).forEach((s) => {
      if (s.name) map.set(s.id || s.name, s.name);
    });
    companyPayables.forEach((p) => {
      if (p.supplierName && !map.has(p.supplierId || p.supplierName)) {
        map.set(p.supplierId || p.supplierName, p.supplierName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [dbState.suppliers, companyPayables]);

  // Lista de Clientes disponíveis para filtro
  const availableCustomers = useMemo(() => {
    const map = new Map<string, string>();
    (dbState.customers || []).forEach((c) => {
      if (c.name) map.set(c.id || c.name, c.name);
    });
    companyReceivables.forEach((r) => {
      if (r.customerName && !map.has(r.customerId || r.customerName)) {
        map.set(r.customerId || r.customerName, r.customerName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [dbState.customers, companyReceivables]);

  // Lista de Contas do Plano de Contas disponíveis para filtro
  const availableChartAccounts = useMemo(() => {
    return (dbState.chartOfAccounts || [])
      .filter((a) => !a.companyId || a.companyId === 'todos' || a.companyId === currentCompany.id)
      .sort((a, b) => (a.hierarchicalCode || a.code || '').localeCompare(b.hierarchicalCode || b.code || '', undefined, { numeric: true }));
  }, [dbState.chartOfAccounts, currentCompany.id]);

  const pendingClassificationCount = useMemo(() => {
    return companyPayables.filter((p) => p.classificationStatus === 'pendente' || !p.chartAccountId).length;
  }, [companyPayables]);

  const classifiedCount = useMemo(() => {
    return companyPayables.filter((p) => p.classificationStatus === 'classificado' && p.chartAccountId).length;
  }, [companyPayables]);

  // Filtragem completa de Contas a Pagar
  const filteredPayables = useMemo(() => {
    return companyPayables.filter((p) => {
      // 1. Filtro de Classificação
      if (payableClassificationFilter === 'classificadas' && (p.classificationStatus !== 'classificado' || !p.chartAccountId)) {
        return false;
      }
      if (payableClassificationFilter === 'pendentes' && p.classificationStatus === 'classificado' && p.chartAccountId) {
        return false;
      }

      // 2. Filtro de Status
      if (payableStatusFilter !== 'todos') {
        const todayStr = new Date().toISOString().split('T')[0];
        const due = (p.dueDate || '').slice(0, 10);
        if (payableStatusFilter === 'vencido') {
          if (p.status === 'pago' || p.status === 'cancelado' || due >= todayStr || p.balance <= 0) {
            return false;
          }
        } else if (payableStatusFilter === 'aberto') {
          if (p.status !== 'aberto' || p.balance <= 0) return false;
        } else if (p.status !== payableStatusFilter) {
          return false;
        }
      }

      // 3. Filtro de Período (Padrão: Mês Atual)
      const targetDate = payableDateType === 'emissao' ? (p.issueDate || '').slice(0, 10) : (p.dueDate || '').slice(0, 10);
      if (payableStartDate && targetDate && targetDate < payableStartDate) {
        return false;
      }
      if (payableEndDate && targetDate && targetDate > payableEndDate) {
        return false;
      }

      // 4. Filtro por Fornecedor / Favorecido
      if (payableSupplierFilter !== 'todos') {
        const matchId = p.supplierId && p.supplierId === payableSupplierFilter;
        const matchName = (p.supplierName || '').trim().toLowerCase() === payableSupplierFilter.trim().toLowerCase();
        if (!matchId && !matchName) return false;
      }

      // 5. Filtro por Plano de Contas
      if (payableChartAccountFilter !== 'todos') {
        const selAccount = availableChartAccounts.find((a) => a.id === payableChartAccountFilter);
        const matchId = p.chartAccountId && p.chartAccountId === payableChartAccountFilter;
        const matchLaunch = p.launchCode && (p.launchCode === payableChartAccountFilter || (selAccount && selAccount.launchCode === p.launchCode));
        const matchHier = p.chartAccountCode && selAccount && p.chartAccountCode.startsWith(selAccount.hierarchicalCode || selAccount.code || '');
        if (!matchId && !matchLaunch && !matchHier) return false;
      }

      // 6. Busca por texto
      if (payableSearch.trim()) {
        const q = payableSearch.toLowerCase().trim();
        const matchDesc = (p.description || '').toLowerCase().includes(q);
        const matchDoc = (p.docNumber || '').toLowerCase().includes(q);
        const matchSupp = (p.supplierName || '').toLowerCase().includes(q);
        const matchLaunch = p.launchCode ? p.launchCode.includes(q) : false;
        const matchAccount = p.chartAccountName ? p.chartAccountName.toLowerCase().includes(q) : false;
        const matchHistory = p.history ? p.history.toLowerCase().includes(q) : false;
        if (!matchDesc && !matchDoc && !matchSupp && !matchLaunch && !matchAccount && !matchHistory) return false;
      }

      return true;
    });
  }, [
    companyPayables,
    payableClassificationFilter,
    payableStatusFilter,
    payableDateType,
    payableStartDate,
    payableEndDate,
    payableSupplierFilter,
    payableChartAccountFilter,
    availableChartAccounts,
    payableSearch,
  ]);

  // Totais do Período Filtrado de Contas a Pagar
  const payablePeriodTotals = useMemo(() => {
    let totalPagar = 0; // Saldo em aberto (balance) a pagar
    let totalOriginal = 0; // Valor original total do período
    let totalPago = 0; // Valor já baixado
    let totalVencido = 0; // Saldo em atraso
    let openCount = 0;
    let vencidoCount = 0;
    const todayStr = new Date().toISOString().split('T')[0];

    filteredPayables.forEach((p) => {
      if (p.status === 'cancelado') return;
      totalOriginal += p.originalValue || 0;
      totalPago += p.paidValue || 0;
      if (p.status !== 'pago') {
        const bal = p.balance > 0 ? p.balance : (p.originalValue - (p.paidValue || 0));
        if (bal > 0) {
          totalPagar += bal;
          openCount += 1;
          const due = (p.dueDate || '').slice(0, 10);
          if (due && due < todayStr) {
            totalVencido += bal;
            vencidoCount += 1;
          }
        }
      }
    });

    return {
      totalPagar,
      totalOriginal,
      totalPago,
      totalVencido,
      openCount,
      vencidoCount,
      count: filteredPayables.length,
    };
  }, [filteredPayables]);

  // Filtragem completa de Contas a Receber
  const filteredReceivables = useMemo(() => {
    return companyReceivables.filter((r) => {
      // 1. Filtro de Status
      if (receivableStatusFilter !== 'todos') {
        const todayStr = new Date().toISOString().split('T')[0];
        const due = (r.dueDate || '').slice(0, 10);
        if (receivableStatusFilter === 'vencido') {
          if (r.status === 'recebido' || r.status === 'cancelado' || due >= todayStr || r.balance <= 0) {
            return false;
          }
        } else if (receivableStatusFilter === 'aberto') {
          if (r.status !== 'aberto' || r.balance <= 0) return false;
        } else if (r.status !== receivableStatusFilter) {
          return false;
        }
      }

      // 2. Filtro de Período (Padrão: Mês Atual)
      const targetDate = receivableDateType === 'emissao' ? (r.issueDate || '').slice(0, 10) : (r.dueDate || '').slice(0, 10);
      if (receivableStartDate && targetDate && targetDate < receivableStartDate) {
        return false;
      }
      if (receivableEndDate && targetDate && targetDate > receivableEndDate) {
        return false;
      }

      // 3. Filtro por Cliente / Sacado
      if (receivableCustomerFilter !== 'todos') {
        const matchId = r.customerId && r.customerId === receivableCustomerFilter;
        const matchName = (r.customerName || '').trim().toLowerCase() === receivableCustomerFilter.trim().toLowerCase();
        if (!matchId && !matchName) return false;
      }

      // 4. Filtro por Plano de Contas
      if (receivableChartAccountFilter !== 'todos') {
        const selAccount = availableChartAccounts.find((a) => a.id === receivableChartAccountFilter);
        const matchId = r.chartAccountId && r.chartAccountId === receivableChartAccountFilter;
        const matchLaunch = r.launchCode && (r.launchCode === receivableChartAccountFilter || (selAccount && selAccount.launchCode === r.launchCode));
        const matchHier = r.chartAccountCode && selAccount && r.chartAccountCode.startsWith(selAccount.hierarchicalCode || selAccount.code || '');
        if (!matchId && !matchLaunch && !matchHier) return false;
      }

      // 5. Busca por texto
      if (receivableSearch.trim()) {
        const q = receivableSearch.toLowerCase().trim();
        const matchCustomer = (r.customerName || '').toLowerCase().includes(q);
        const matchDoc = (r.docNumber || '').toLowerCase().includes(q);
        const matchOrder = (r.orderNumber || '').toLowerCase().includes(q);
        const matchHistory = (r.history || '').toLowerCase().includes(q);
        const matchLaunch = r.launchCode ? r.launchCode.includes(q) : false;
        const matchAccount = (r.chartAccountCode || '').toLowerCase().includes(q);
        if (!matchCustomer && !matchDoc && !matchOrder && !matchHistory && !matchLaunch && !matchAccount) return false;
      }

      return true;
    });
  }, [
    companyReceivables,
    receivableStatusFilter,
    receivableDateType,
    receivableStartDate,
    receivableEndDate,
    receivableCustomerFilter,
    receivableChartAccountFilter,
    availableChartAccounts,
    receivableSearch,
  ]);

  // Totais do Período Filtrado de Contas a Receber
  const receivablePeriodTotals = useMemo(() => {
    let totalReceber = 0; // Saldo em aberto (balance) a receber
    let totalOriginal = 0; // Valor original total do período
    let totalRecebido = 0; // Valor já baixado
    let totalVencido = 0; // Saldo em atraso
    let openCount = 0;
    let vencidoCount = 0;
    const todayStr = new Date().toISOString().split('T')[0];

    filteredReceivables.forEach((r) => {
      if (r.status === 'cancelado') return;
      totalOriginal += r.originalValue || 0;
      totalRecebido += r.paidValue || 0;
      if (r.status !== 'recebido') {
        const bal = r.balance > 0 ? r.balance : (r.originalValue - (r.paidValue || 0));
        if (bal > 0) {
          totalReceber += bal;
          openCount += 1;
          const due = (r.dueDate || '').slice(0, 10);
          if (due && due < todayStr) {
            totalVencido += bal;
            vencidoCount += 1;
          }
        }
      }
    });

    return {
      totalReceber,
      totalOriginal,
      totalRecebido,
      totalVencido,
      openCount,
      vencidoCount,
      count: filteredReceivables.length,
    };
  }, [filteredReceivables]);

  const sortedReceivables = useMemo(() => {
    if (!receivableSortConfig.key) return filteredReceivables;
    const key = receivableSortConfig.key;
    const dir = receivableSortConfig.direction;

    return [...filteredReceivables].sort((a, b) => {
      switch (key) {
        case 'docNumber':
          return compareSortValues(a.docNumber, b.docNumber, dir);
        case 'customerName':
          return compareSortValues(a.customerName, b.customerName, dir);
        case 'issueDate':
          return compareSortValues(parseSortableDate(a.issueDate), parseSortableDate(b.issueDate), dir);
        case 'dueDate':
          return compareSortValues(parseSortableDate(a.dueDate), parseSortableDate(b.dueDate), dir);
        case 'originalValue':
          return compareSortValues(a.originalValue || 0, b.originalValue || 0, dir);
        case 'paidValue':
          return compareSortValues(a.paidValue || 0, b.paidValue || 0, dir);
        case 'balance':
          return compareSortValues(a.balance || 0, b.balance || 0, dir);
        case 'status':
          return compareSortValues(a.status, b.status, dir);
        default:
          return 0;
      }
    });
  }, [filteredReceivables, receivableSortConfig]);

  const sortedPayables = useMemo(() => {
    if (!payableSortConfig.key) return filteredPayables;
    const key = payableSortConfig.key;
    const dir = payableSortConfig.direction;

    const getChartAccountLabel = (item: AccountPayable) => {
      if (item.itemClassifications && item.itemClassifications.length > 1) {
        return 'Rateio Multi-Contas';
      }
      if (item.classificationStatus === 'classificado' && (item.launchCode || item.chartAccountName)) {
        return `${item.launchCode || ''} ${item.chartAccountName || item.chartAccountCode || ''}`.trim();
      }
      return 'Pendente de Classificação';
    };

    return [...filteredPayables].sort((a, b) => {
      switch (key) {
        case 'docNumber':
          return compareSortValues(a.docNumber, b.docNumber, dir);
        case 'description':
          return compareSortValues(a.description, b.description, dir);
        case 'chartAccount':
          return compareSortValues(getChartAccountLabel(a), getChartAccountLabel(b), dir);
        case 'supplierName':
          return compareSortValues(a.supplierName, b.supplierName, dir);
        case 'dueDate':
          return compareSortValues(parseSortableDate(a.dueDate), parseSortableDate(b.dueDate), dir);
        case 'originalValue':
          return compareSortValues(a.originalValue || 0, b.originalValue || 0, dir);
        case 'paidValue':
          return compareSortValues(a.paidValue || 0, b.paidValue || 0, dir);
        case 'balance':
          return compareSortValues(a.balance || 0, b.balance || 0, dir);
        case 'status':
          return compareSortValues(a.status, b.status, dir);
        default:
          return 0;
      }
    });
  }, [filteredPayables, payableSortConfig]);

  const receivables = filteredReceivables;
  const payables = filteredPayables;

  const isStickyListTab = [
    'contas_receber',
    'contas_pagar',
    'vales',
    'plano_contas',
    'formas_pagamento',
    'contas_bancarias',
    'prazos_pagamento',
  ].includes(activeTab);

  return (
    <div className={isStickyListTab ? 'flex flex-col gap-3 lg:h-[calc(100vh-7rem)] lg:min-h-[720px]' : 'space-y-4'}>
      {/* Topo / Sub-Abas Financeiras */}
      <div className="shrink-0 bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <CircleDollarSign className="text-blue-600" size={20} />
            <span>Módulo Financeiro & Gestão de Fluxo de Caixa</span>
          </h2>
          <p className="text-xs text-slate-500">
            Controle de recebimentos, compromissos a pagar com fornecedores, conciliação de caixa PDV e projeção futura.
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold flex-wrap gap-1">
          <button
            onClick={() => setActiveTab('fluxo_caixa')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'fluxo_caixa' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CircleDollarSign size={14} />
            <span>Fluxo de Caixa</span>
          </button>
          <button
            onClick={() => setActiveTab('contas_receber')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'contas_receber' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp size={14} />
            <span>Contas a Receber</span>
          </button>
          <button
            onClick={() => setActiveTab('contas_pagar')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'contas_pagar' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingDown size={14} />
            <span>Contas a Pagar</span>
          </button>
          <button
            onClick={() => setActiveTab('vales')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'vales' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Ticket size={14} />
            <span>Vale</span>
          </button>
          <button
            onClick={() => setActiveTab('caixa_pdv')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'caixa_pdv' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Vault size={14} />
            <span>Caixa PDV</span>
          </button>
          <button
            onClick={() => setActiveTab('plano_contas')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'plano_contas' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen size={14} />
            <span>Plano de Contas</span>
          </button>
          <button
            onClick={() => setActiveTab('dre_gerencial')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'dre_gerencial' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp size={14} />
            <span>DRE Gerencial</span>
          </button>
          <button
            onClick={() => setActiveTab('formas_pagamento')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'formas_pagamento' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard size={14} />
            <span>Formas de Pagamento</span>
          </button>
          <button
            onClick={() => setActiveTab('contas_bancarias')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'contas_bancarias' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 size={14} />
            <span>Contas (Caixa / Bancos)</span>
          </button>
          <button
            onClick={() => setActiveTab('prazos_pagamento')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'prazos_pagamento' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar size={14} />
            <span>Prazos de Pagamento</span>
          </button>
          <button
            onClick={() => setActiveTab('relatorios')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'relatorios' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 size={14} />
            <span>Relatórios</span>
          </button>
        </div>
      </div>

      {/* ABA 1: FLUXO DE CAIXA (REALIZADO VS PREVISTO, HOJE, MÊS ATUAL E EXTRATO DE LANÇAMENTOS) */}
      {activeTab === 'fluxo_caixa' && (
        <div className="space-y-4">
          {/* SEÇÃO 1: NÚMEROS PERMANENTES - MÊS ATUAL & DIA ATUAL (HOJE) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {/* Bloco Mês Atual */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-md border border-slate-700/60 relative overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700/60">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30">
                    <Calendar size={16} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                      Visão Fixa do Mês
                    </span>
                    <h4 className="text-sm font-black capitalize text-slate-100">
                      {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </h4>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                  {monthEntries.length} movimentações
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3">
                <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/50">
                  <span className="text-[10px] font-bold text-slate-400 block">Entradas Mês</span>
                  <span className="text-sm sm:text-base font-black text-emerald-400 font-mono mt-0.5 block truncate">
                    + {formatCurrency(monthIn)}
                  </span>
                </div>
                <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/50">
                  <span className="text-[10px] font-bold text-slate-400 block">Saídas Mês</span>
                  <span className="text-sm sm:text-base font-black text-rose-400 font-mono mt-0.5 block truncate">
                    - {formatCurrency(monthOut)}
                  </span>
                </div>
                <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/50">
                  <span className="text-[10px] font-bold text-slate-400 block">Saldo Mês</span>
                  <span
                    className={`text-sm sm:text-base font-black font-mono mt-0.5 block truncate ${
                      monthBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatCurrency(monthBalance)}
                  </span>
                </div>
                <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/50">
                  <span className="text-[10px] font-bold text-blue-300 block">Disponibilidade</span>
                  <span className="text-sm sm:text-base font-black text-blue-200 font-mono mt-0.5 block truncate">
                    {formatCurrency(currentNetBalance)}
                  </span>
                </div>
              </div>
            </div>

            {/* Bloco Hoje (Dia Atual) */}
            <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 relative overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-200">
                    <Clock size={16} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                      Movimentações de Hoje
                    </span>
                    <h4 className="text-sm font-black text-slate-800">
                      {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </h4>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                  {todayEntries.length} lançamentos hoje
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 pt-3">
                <div className="bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-100">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-800">
                    <ArrowUpRight size={12} />
                    <span>Entradas Hoje</span>
                  </div>
                  <span className="text-sm sm:text-base font-black text-emerald-700 font-mono mt-0.5 block truncate">
                    + {formatCurrency(todayIn)}
                  </span>
                </div>
                <div className="bg-rose-50/60 p-2.5 rounded-xl border border-rose-100">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-rose-800">
                    <ArrowDownRight size={12} />
                    <span>Saídas Hoje</span>
                  </div>
                  <span className="text-sm sm:text-base font-black text-rose-700 font-mono mt-0.5 block truncate">
                    - {formatCurrency(todayOut)}
                  </span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-600 block">Saldo do Dia</span>
                  <span
                    className={`text-sm sm:text-base font-black font-mono mt-0.5 block truncate ${
                      todayBalance >= 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {formatCurrency(todayBalance)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 2: BARRA DE FILTRO DE PERÍODO & CARDS INTERATIVOS (CLICÁVEIS) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-blue-600" />
                <span className="text-xs font-bold text-slate-800">Filtro de Período do Fluxo de Caixa:</span>
                <span className="text-[11px] bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded-md border border-blue-200">
                  {cfPeriodPreset === 'hoje'
                    ? 'Hoje'
                    : cfPeriodPreset === 'mes_atual'
                    ? 'Mês Atual'
                    : cfPeriodPreset === 'ultimos_7'
                    ? 'Últimos 7 dias'
                    : cfPeriodPreset === 'ultimos_30'
                    ? 'Últimos 30 dias'
                    : cfPeriodPreset === 'mes_anterior'
                    ? 'Mês Anterior'
                    : 'Personalizado'}
                </span>
              </div>

              {/* Botões Rápidos de Período */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {(
                  [
                    { id: 'hoje', label: 'Hoje' },
                    { id: 'mes_atual', label: 'Mês Atual' },
                    { id: 'ultimos_7', label: 'Últimos 7 dias' },
                    { id: 'ultimos_30', label: 'Últimos 30 dias' },
                    { id: 'mes_anterior', label: 'Mês Anterior' },
                    { id: 'personalizado', label: 'Personalizado' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPeriodPreset(p.id)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      cfPeriodPreset === p.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs de Data Início / Fim se Personalizado */}
            {cfPeriodPreset === 'personalizado' && (
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-600">De:</span>
                  <input
                    type="date"
                    value={cfStartDate}
                    onChange={(e) => setCfStartDate(e.target.value)}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-600">Até:</span>
                  <input
                    type="date"
                    value={cfEndDate}
                    onChange={(e) => setCfEndDate(e.target.value)}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
                  />
                </div>
                <span className="text-[11px] text-slate-500 italic">
                  * Selecione o intervalo desejado para recalcular os lançamentos
                </span>
              </div>
            )}

            {/* Cards de Totais do Período - CLICÁVEIS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* Card 1: TOTAL ENTRADAS (Clicável) */}
              <div
                onClick={() => {
                  setCfEntryTypeFilter((prev) => (prev === 'entrada' ? 'todos' : 'entrada'));
                  setCfPaymentMethodFilter('todos');
                  setCfGroupByPaymentMethod(true);
                }}
                className={`p-4 rounded-xl border transition-all cursor-pointer select-none relative group ${
                  cfEntryTypeFilter === 'entrada'
                    ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500 shadow-md'
                    : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-xs'
                }`}
                title="Clique para ver o extrato dividido e totalizado pelas Formas Disponíveis para pagamento (Dinheiro, PIX, Cartão...)"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    TOTAL DE ENTRADAS NO PERÍODO
                  </span>
                  <div
                    className={`p-1.5 rounded-lg transition-colors ${
                      cfEntryTypeFilter === 'entrada'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100'
                    }`}
                  >
                    <ArrowUpRight size={18} />
                  </div>
                </div>
                <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">
                  + {formatCurrency(periodIn)}
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-medium">
                    {periodEntries.filter((e) => e.type === 'entrada').length} entradas
                  </span>
                  <span
                    className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${
                      cfEntryTypeFilter === 'entrada'
                        ? 'bg-emerald-200 text-emerald-900 font-black'
                        : 'text-emerald-700 bg-emerald-50 group-hover:underline'
                    }`}
                  >
                    {cfEntryTypeFilter === 'entrada' ? '✓ Dividido por Formas' : '👆 Clique p/ dividir por formas'}
                  </span>
                </div>
              </div>

              {/* Card 2: TOTAL SAÍDAS (Clicável) */}
              <div
                onClick={() => setCfEntryTypeFilter((prev) => (prev === 'saida' ? 'todos' : 'saida'))}
                className={`p-4 rounded-xl border transition-all cursor-pointer select-none relative group ${
                  cfEntryTypeFilter === 'saida'
                    ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-500 shadow-md'
                    : 'bg-white border-slate-200 hover:border-rose-300 hover:shadow-xs'
                }`}
                title="Clique para filtrar e listar apenas os lançamentos de Saída"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Total Saídas (Período)
                  </span>
                  <div
                    className={`p-1.5 rounded-lg transition-colors ${
                      cfEntryTypeFilter === 'saida'
                        ? 'bg-rose-600 text-white'
                        : 'bg-rose-50 text-rose-600 group-hover:bg-rose-100'
                    }`}
                  >
                    <ArrowDownRight size={18} />
                  </div>
                </div>
                <div className="text-2xl font-black text-rose-600 mt-1 font-mono">
                  - {formatCurrency(periodOut)}
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-medium">
                    {periodEntries.filter((e) => e.type === 'saida').length} saídas
                  </span>
                  <span
                    className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${
                      cfEntryTypeFilter === 'saida'
                        ? 'bg-rose-200 text-rose-900'
                        : 'text-rose-700 bg-rose-50 group-hover:underline'
                    }`}
                  >
                    {cfEntryTypeFilter === 'saida' ? '✓ Filtro Ativo' : '👆 Clique p/ filtrar'}
                  </span>
                </div>
              </div>

              {/* Card 3: SALDO DO PERÍODO (Clicável para ver todos) */}
              <div
                onClick={() => setCfEntryTypeFilter('todos')}
                className={`p-4 rounded-xl border transition-all cursor-pointer select-none relative group ${
                  cfEntryTypeFilter === 'todos'
                    ? 'bg-slate-900 border-slate-700 text-white shadow-md'
                    : 'bg-slate-800 text-white border-slate-700 hover:bg-slate-900'
                }`}
                title="Clique para remover os filtros e ver todos os lançamentos"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Saldo Líquido (Período)
                  </span>
                  <div className="p-1.5 bg-slate-800 rounded-lg text-emerald-400">
                    <DollarSign size={18} />
                  </div>
                </div>
                <div
                  className={`text-2xl font-black mt-1 font-mono ${
                    periodBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatCurrency(periodBalance)}
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">{periodEntries.length} itens no total</span>
                  <span className="font-bold text-[10px] text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded group-hover:underline">
                    {cfEntryTypeFilter === 'todos' ? '✓ Ver Todos' : '👆 Resetar Filtro'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3: GRÁFICO COMPARATIVO & QUADRO DE PREVISÕES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Comparativo: Realizado vs Previsto (Regime de Caixa)
              </h3>
              <p className="text-xs text-slate-500">
                Uma venda a prazo NÃO entra no fluxo de caixa realizado até o recebimento efetivo, evitando distorções contábeis.
              </p>

              <div className="space-y-3 pt-2">
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-700">Entradas Efetivadas (Período)</span>
                    <span className="text-emerald-700">{formatCurrency(periodIn)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-700">A Receber no Prazo (Futuro)</span>
                    <span className="text-blue-700">{formatCurrency(expectedReceivables)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: '65%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-700">A Pagar para Fornecedores (Futuro)</span>
                    <span className="text-amber-700">{formatCurrency(expectedPayables)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: '45%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Compromissos Urgentes (Vencendo nos Próximos Dias)
              </h3>

              <div className="divide-y divide-slate-100 text-xs">
                {payables.filter((p) => p.status === 'aberto').slice(0, 4).map((p) => (
                  <div key={p.id} className="py-2.5 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-800">{p.description}</div>
                      <div className="text-[11px] text-slate-400">
                        Vencimento: {new Date(p.dueDate).toLocaleDateString('pt-BR')} • {p.supplierName}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-rose-600">{formatCurrency(p.balance)}</div>
                      <button
                        onClick={() => {
                          setPayingTitle(p);
                          setPartialAmount(String(p.balance));
                        }}
                        className="text-[10px] text-blue-600 font-bold hover:underline cursor-pointer"
                      >
                        Pagar Agora
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SEÇÃO 4: EXTRATO & LISTAGEM DOS LANÇAMENTOS DO PERÍODO */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Header do Extrato */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <BookOpen className="text-blue-600" size={18} />
                  <h3 className="font-bold text-slate-800 text-sm">
                    {cfEntryTypeFilter === 'entrada'
                      ? 'Extrato de Entradas por Forma de Pagamento'
                      : 'Extrato de Lançamentos do Período'}
                  </h3>
                  <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                    {displayedEntries.length} {displayedEntries.length === 1 ? 'registro' : 'registros'}
                  </span>
                  {cfEntryTypeFilter === 'entrada' && (
                    <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full font-black">
                      Total: + {formatCurrency(periodIn)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {cfEntryTypeFilter === 'entrada'
                    ? 'Divisão e totalização das entradas pelas formas disponíveis de pagamento utilizadas pelos clientes (Dinheiro, PIX, Cartão de Crédito, etc.).'
                    : 'Detalhamento das entradas e saídas efetivadas no caixa e contas bancárias no período.'}
                </p>
              </div>

              {/* Ações do Header: Exportação CSV */}
              <div className="flex items-center gap-2 self-start md:self-auto">
                <button
                  type="button"
                  onClick={handleExportCashFlowCsv}
                  className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Exportar lançamentos filtrados em arquivo CSV"
                >
                  <Download size={14} />
                  <span>Exportar Extrato (CSV)</span>
                </button>
              </div>
            </div>

            {/* Filtros da Tabela: Tabs Principais, Alternador de Visão e Busca */}
            <div className="p-3 border-b border-slate-200 bg-white flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
              {/* Tabs Rápidas de Tipo */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setCfEntryTypeFilter('todos');
                    setCfPaymentMethodFilter('todos');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    cfEntryTypeFilter === 'todos'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Todos ({periodEntries.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCfEntryTypeFilter('entrada');
                    setCfPaymentMethodFilter('todos');
                    setCfGroupByPaymentMethod(true);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    cfEntryTypeFilter === 'entrada'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                  title="Listar e dividir as entradas pelas formas de pagamento disponíveis"
                >
                  <ArrowUpRight size={14} />
                  <span>Entradas ({periodEntries.filter((e) => e.type === 'entrada').length})</span>
                  {cfEntryTypeFilter === 'entrada' && (
                    <span className="ml-1 text-[10px] bg-emerald-700/60 px-1.5 py-0.2 rounded text-emerald-100 font-normal">
                      Dividido
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCfEntryTypeFilter('saida');
                    setCfPaymentMethodFilter('todos');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    cfEntryTypeFilter === 'saida'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                  }`}
                >
                  <ArrowDownRight size={14} />
                  Saídas ({periodEntries.filter((e) => e.type === 'saida').length})
                </button>
              </div>

              {/* Controles da Direita: Alternador de Visualização (Dividido vs Contínuo) + Campo de Busca */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                {cfEntryTypeFilter === 'entrada' && (
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCfGroupByPaymentMethod(true)}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        cfGroupByPaymentMethod
                          ? 'bg-white text-emerald-800 shadow-2xs font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Agrupar entradas em blocos e tabelas divididas por forma de pagamento"
                    >
                      <Layers size={12} className={cfGroupByPaymentMethod ? 'text-emerald-600' : 'text-slate-400'} />
                      <span>Dividido por Formas</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCfGroupByPaymentMethod(false)}
                      className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        !cfGroupByPaymentMethod
                          ? 'bg-white text-blue-800 shadow-2xs font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Exibir todos os lançamentos em uma única tabela contínua cronológica"
                    >
                      <ListFilter size={12} className={!cfGroupByPaymentMethod ? 'text-blue-600' : 'text-slate-400'} />
                      <span>Lista Contínua</span>
                    </button>
                  </div>
                )}

                {/* Campo de Busca Textual */}
                <div className="relative flex-1 sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar cliente, doc, descrição..."
                    value={cfSearchTerm}
                    onChange={(e) => setCfSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                  {cfSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setCfSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* PAINEL DE FORMAS DISPONÍVEIS DE PAGAMENTO (Exibido nas Entradas) */}
            {cfEntryTypeFilter === 'entrada' && (
              <div className="p-3 bg-gradient-to-r from-emerald-50/50 via-teal-50/30 to-blue-50/50 border-b border-slate-200">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-100/80">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                    <PieChart size={15} className="text-emerald-600" />
                    <span>Totalização pelas Formas Disponíveis para Pagamento:</span>
                    <span className="text-[11px] font-normal text-slate-500 hidden sm:inline">
                      (Clique em uma forma para isolar os lançamentos ou selecione "Todas")
                    </span>
                  </div>

                  {cfPaymentMethodFilter !== 'todos' && (
                    <button
                      type="button"
                      onClick={() => setCfPaymentMethodFilter('todos')}
                      className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer bg-emerald-100/70 hover:bg-emerald-200 px-2 py-0.5 rounded-md transition-colors"
                    >
                      <X size={12} />
                      <span>Remover filtro por forma (Ver Todas)</span>
                    </button>
                  )}
                </div>

                {/* Cards de Totais por Forma de Pagamento */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                  {/* Card "Todas as Formas" */}
                  <div
                    onClick={() => setCfPaymentMethodFilter('todos')}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                      cfPaymentMethodFilter === 'todos'
                        ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-800 shadow-sm'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className={cfPaymentMethodFilter === 'todos' ? 'text-slate-300' : 'text-slate-500'}>
                        Todas as Formas
                      </span>
                      <Wallet size={13} className={cfPaymentMethodFilter === 'todos' ? 'text-slate-300' : 'text-slate-400'} />
                    </div>
                    <div className="text-sm font-black font-mono mt-1 truncate">
                      + {formatCurrency(periodIn)}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className={cfPaymentMethodFilter === 'todos' ? 'text-slate-300' : 'text-slate-500'}>
                        {periodEntries.filter((e) => e.type === 'entrada').length} entradas
                      </span>
                      <span
                        className={`font-mono text-[9px] font-bold px-1 rounded ${
                          cfPaymentMethodFilter === 'todos' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        100%
                      </span>
                    </div>
                  </div>

                  {/* Cards Individuais para Cada Forma de Pagamento Utilizada */}
                  {entriesByPaymentMethod.map((g) => {
                    const isSelected = cfPaymentMethodFilter === g.key;

                    return (
                      <div
                        key={g.key}
                        onClick={() => setCfPaymentMethodFilter((prev) => (prev === g.key ? 'todos' : g.key))}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer select-none group relative ${
                          isSelected
                            ? 'bg-white border-emerald-500 ring-2 ring-emerald-500 shadow-md'
                            : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                        }`}
                        title={`Clique para listar apenas entradas via ${g.label}`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="truncate text-slate-700 max-w-[105px]" title={g.label}>
                            {g.label}
                          </span>
                          <div className={`p-1 rounded-md ${g.tagColor}`}>
                            {renderMethodIcon(g.iconType, 'w-3 h-3')}
                          </div>
                        </div>

                        <div className="text-sm font-black font-mono text-emerald-700 mt-1 truncate">
                          + {formatCurrency(g.total)}
                        </div>

                        <div className="mt-1 flex items-center justify-between text-[10px]">
                          <span className="text-slate-500">
                            {g.count} {g.count === 1 ? 'venda' : 'vendas'}
                          </span>
                          <span className={`font-mono text-[9px] font-bold px-1 rounded ${g.badgeColor}`}>
                            {g.percentage.toFixed(1)}%
                          </span>
                        </div>

                        {isSelected && (
                          <div className="absolute -top-1.5 -right-1.5 bg-emerald-600 text-white rounded-full p-0.5 shadow-2xs">
                            <Check size={10} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CONTEÚDO PRINCIPAL: DIVIDIDO POR FORMAS OU LISTA CONTÍNUA */}
            {cfEntryTypeFilter === 'entrada' && cfGroupByPaymentMethod ? (
              /* =======================================================
                 VISÃO DIVIDIDA POR FORMA DE PAGAMENTO (BLOCO INDIVIDUAL PARA CADA FORMA)
                 ======================================================= */
              <div className="divide-y-2 divide-slate-200 bg-slate-50/30">
                {entriesByPaymentMethod.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <BookOpen size={28} className="mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-xs text-slate-600">
                      Nenhuma entrada financeira encontrada no período selecionado.
                    </p>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Tente alterar o período ou verificar o filtro de busca textual.
                    </span>
                  </div>
                ) : (
                  entriesByPaymentMethod
                    .filter((g) => cfPaymentMethodFilter === 'todos' || cfPaymentMethodFilter === g.key)
                    .map((group) => (
                      <div key={group.key} className="bg-white">
                        {/* Cabeçalho da Forma de Pagamento */}
                        <div className={`p-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${group.headerBg}`}>
                          <div className="flex items-center gap-2.5">
                            <div className={`p-2 rounded-xl bg-white shadow-2xs ${group.accentColor}`}>
                              {renderMethodIcon(group.iconType, 'w-4 h-4')}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-black text-sm text-slate-900 tracking-tight">
                                  {group.label}
                                </h4>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${group.badgeColor}`}>
                                  {group.count} {group.count === 1 ? 'recebimento' : 'recebimentos'}
                                </span>
                                <span className="text-[10px] font-mono font-bold bg-white text-slate-700 px-2 py-0.5 rounded-full border border-slate-200 shadow-2xs">
                                  {group.percentage.toFixed(1)}% do total de entradas
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                Lançamentos recebidos através de {group.label} no caixa e contas bancárias.
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">
                              Subtotal Recebido
                            </span>
                            <span className="text-base sm:text-lg font-black font-mono text-emerald-700 block">
                              + {formatCurrency(group.total)}
                            </span>
                          </div>
                        </div>

                        {/* Tabela de Lançamentos desta Forma Específica */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-slate-700">
                            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-bold text-[10px]">
                              <tr>
                                <th className="py-2 px-3">Data / Hora</th>
                                <th className="py-2 px-3">Origem</th>
                                <th className="py-2 px-3">Descrição / Detalhes</th>
                                <th className="py-2 px-3">Cliente / Pagador</th>
                                <th className="py-2 px-3">Conta / Caixa Destino</th>
                                <th className="py-2 px-3">Classificação Financeira</th>
                                <th className="py-2 px-3 text-right">Valor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {group.entries.map((item) => {
                                const formattedDate = new Date(item.date).toLocaleString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                });

                                return (
                                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                                    {/* Data/Hora */}
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <span className="font-mono text-slate-600 text-[11px] block">
                                        {formattedDate}
                                      </span>
                                    </td>

                                    {/* Origem */}
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <span className="text-[10px] font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 block truncate max-w-[150px]">
                                        {item.originLabel}
                                      </span>
                                    </td>

                                    {/* Descrição */}
                                    <td className="py-2.5 px-3 font-bold text-slate-900 max-w-xs">
                                      <span className="block truncate" title={item.description}>
                                        {item.description}
                                      </span>
                                      {item.documentNumber && (
                                        <span className="text-[10px] text-slate-400 font-mono font-normal block">
                                          Doc: {item.documentNumber}
                                        </span>
                                      )}
                                    </td>

                                    {/* Cliente */}
                                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                                      <span className="block truncate max-w-[150px]" title={item.entityName || '-'}>
                                        {item.entityName || '-'}
                                      </span>
                                    </td>

                                    {/* Conta / Caixa Destino */}
                                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                                      <span className="block font-semibold text-[11px] text-slate-800 truncate max-w-[130px]">
                                        {item.accountName || 'Caixa Geral'}
                                      </span>
                                    </td>

                                    {/* Classificação */}
                                    <td className="py-2.5 px-3 text-slate-600 max-w-[150px]">
                                      {item.launchCode ? (
                                        <div className="flex items-center gap-1">
                                          <span className="font-mono text-[9px] font-bold bg-blue-50 text-blue-800 px-1 py-0.2 rounded border border-blue-200">
                                            {item.launchCode}
                                          </span>
                                          <span className="text-[11px] truncate block text-slate-700" title={item.category}>
                                            {item.category}
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="text-[11px] text-slate-500 truncate block">
                                          {item.category || '-'}
                                        </span>
                                      )}
                                    </td>

                                    {/* Valor */}
                                    <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-black text-xs sm:text-sm text-emerald-700">
                                      + {formatCurrency(item.amount)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-slate-50/80 border-t border-slate-200 font-bold text-xs text-slate-700">
                              <tr>
                                <td colSpan={6} className="py-2 px-3 text-right">
                                  Total de Entradas em <strong className="text-slate-900">{group.label}</strong> ({group.count} lançamentos):
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-black text-sm text-emerald-700 whitespace-nowrap">
                                  + {formatCurrency(group.total)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    ))
                )}
              </div>
            ) : (
              /* =======================================================
                 VISÃO LISTA CONTÍNUA CRONOLÓGICA (OU QUANDO FILTRADO POR SAÍDA/TODOS)
                 ======================================================= */
              <div className="max-h-[65vh] overflow-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[10px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                    <tr>
                      <th className="py-2.5 px-3">Data / Hora</th>
                      <th className="py-2.5 px-3">Tipo</th>
                      <th className="py-2.5 px-3">Operação / Origem</th>
                      <th className="py-2.5 px-3">Descrição / Detalhes</th>
                      <th className="py-2.5 px-3">Favorecido / Cliente</th>
                      <th className="py-2.5 px-3">Forma / Conta</th>
                      <th className="py-2.5 px-3">Plano de Contas</th>
                      <th className="py-2.5 px-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {displayedEntries.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <BookOpen size={28} className="text-slate-300" />
                            <p className="font-semibold text-xs">
                              Nenhum lançamento financeiro encontrado no período selecionado.
                            </p>
                            <span className="text-[11px] text-slate-400">
                              {cfEntryTypeFilter !== 'todos' || cfSearchTerm
                                ? 'Tente remover o filtro de busca ou alternar para todos os lançamentos.'
                                : 'Altere o período acima ou cadastre movimentações no caixa / títulos.'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      displayedEntries.map((item) => {
                        const isEntry = item.type === 'entrada';
                        const formattedDate = new Date(item.date).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        });

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* Data/Hora */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="font-mono text-slate-600 text-[11px] block">
                                {formattedDate}
                              </span>
                            </td>

                            {/* Tipo */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {isEntry ? (
                                <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                  <ArrowUpRight size={11} />
                                  Entrada
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                  <ArrowDownRight size={11} />
                                  Saída
                                </span>
                              )}
                            </td>

                            {/* Operação / Origem */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="text-[11px] font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 block truncate max-w-[150px]">
                                {item.originLabel}
                              </span>
                            </td>

                            {/* Descrição */}
                            <td className="py-2.5 px-3 font-bold text-slate-900 max-w-xs">
                              <span className="block truncate" title={item.description}>
                                {item.description}
                              </span>
                              {item.documentNumber && (
                                <span className="text-[10px] text-slate-400 font-mono font-normal block">
                                  Doc: {item.documentNumber}
                                </span>
                              )}
                            </td>

                            {/* Favorecido / Cliente */}
                            <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                              <span className="block truncate max-w-[140px]" title={item.entityName || '-'}>
                                {item.entityName || '-'}
                              </span>
                            </td>

                            {/* Forma / Conta */}
                            <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                              <span className="block font-semibold text-[11px] text-slate-800">
                                {item.paymentMethod || 'Diversos'}
                              </span>
                              {item.accountName && (
                                <span className="text-[10px] text-slate-400 block truncate max-w-[120px]">
                                  {item.accountName}
                                </span>
                              )}
                            </td>

                            {/* Classificação / Plano de Contas */}
                            <td className="py-2.5 px-3 text-slate-600 max-w-[160px]">
                              {item.launchCode ? (
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-[10px] font-bold bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200">
                                    {item.launchCode}
                                  </span>
                                  <span className="text-[11px] truncate block text-slate-700" title={item.category}>
                                    {item.category}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-500 truncate block">
                                  {item.category || '-'}
                                </span>
                              )}
                            </td>

                            {/* Valor */}
                            <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-black text-xs sm:text-sm">
                              <span className={isEntry ? 'text-emerald-700' : 'text-rose-600'}>
                                {isEntry ? '+ ' : '- '}
                                {formatCurrency(item.amount)}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Rodapé Consolidado dos Lançamentos Exibidos */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-500 font-medium">
                Mostrando <strong>{displayedEntries.length}</strong> de <strong>{periodEntries.length}</strong> lançamentos no período.
              </div>

              <div className="flex flex-wrap items-center gap-4 font-mono font-bold">
                <div className="text-emerald-700">
                  <span className="text-[10px] text-slate-500 font-sans block">Total Entradas Listadas:</span>
                  + {formatCurrency(displayedEntries.filter((e) => e.type === 'entrada').reduce((s, e) => s + e.amount, 0))}
                </div>

                <div className="text-rose-600">
                  <span className="text-[10px] text-slate-500 font-sans block">Total Saídas Listadas:</span>
                  - {formatCurrency(displayedEntries.filter((e) => e.type === 'saida').reduce((s, e) => s + e.amount, 0))}
                </div>

                <div className="bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  <span className="text-[10px] text-slate-500 font-sans block">Resultado Líquido:</span>
                  <span
                    className={
                      displayedEntries.reduce((s, e) => s + (e.type === 'entrada' ? e.amount : -e.amount), 0) >= 0
                        ? 'text-emerald-700'
                        : 'text-rose-600'
                    }
                  >
                    {formatCurrency(
                      displayedEntries.reduce((s, e) => s + (e.type === 'entrada' ? e.amount : -e.amount), 0)
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: CONTAS A RECEBER */}
      {activeTab === 'contas_receber' && (
        <div className="flex-1 min-h-0 flex flex-col gap-4 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden p-4">
          <div className="shrink-0 flex flex-col sm:flex-row justify-between sm:items-center pb-2 border-b border-slate-100 gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Títulos a Receber (Vendas e Clientes)</h3>
              <p className="text-xs text-slate-500">Duplicatas, notas a prazo e cobranças de clientes.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                Aberto Geral: {formatCurrency(expectedReceivables)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingReceivable(null);
                  setReceivableCustomerName('');
                  setReceivableCustomerId('');
                  setReceivableHistory('');
                  setReceivableDocNumber('TIT-' + Date.now().toString().slice(-4));
                  setReceivablePaymentMethod('Boleto');
                  setReceivableAmount('');
                  setReceivableDueDate(new Date().toISOString().split('T')[0]);
                  setReceivableChartAccountId('');
                  setReceivableLaunchCode('');
                  setReceivableChartSearch('');
                  setIsCustomerDropdownOpen(false);
                  setIsRecChartSearchDropdownOpen(false);
                  setIsRecMultipleInstallmentsEnabled(false);
                  setReceivableInstallmentCount(1);
                  setReceivableIntervalDays(30);
                  setReceivableCustomInstallments([]);
                  setIsNewReceivableOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer transition-colors"
              >
                <Plus size={14} />
                <span>Novo Título</span>
              </button>
            </div>
          </div>

          {/* PAINEL DE RESUMO DO PERÍODO FILTRADO (CONTAS A RECEBER) */}
          <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: Total a Receber no Período */}
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign size={14} className="text-emerald-700" />
                  Total a Receber no Período
                </span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                  Saldo Aberto
                </span>
              </div>
              <div className="text-xl font-black text-emerald-700 mt-1">
                {formatCurrency(receivablePeriodTotals.totalReceber)}
              </div>
              <div className="text-[11px] text-emerald-800/80 mt-0.5">
                {receivablePeriodTotals.openCount} título(s) pendente(s) no período
              </div>
            </div>

            {/* Card 2: Total Geral dos Títulos do Período */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Total Geral do Período
                </span>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {receivablePeriodTotals.count} título(s)
                </span>
              </div>
              <div className="text-xl font-black text-slate-800 mt-1">
                {formatCurrency(receivablePeriodTotals.totalOriginal)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Valor original de todos os títulos
              </div>
            </div>

            {/* Card 3: Total Já Recebido no Período */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-blue-600" />
                  Total Já Recebido
                </span>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  Liquidado
                </span>
              </div>
              <div className="text-xl font-black text-blue-700 mt-1">
                {formatCurrency(receivablePeriodTotals.totalRecebido)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {receivablePeriodTotals.totalOriginal > 0
                  ? `${((receivablePeriodTotals.totalRecebido / receivablePeriodTotals.totalOriginal) * 100).toFixed(1)}% do total faturado`
                  : 'Recebimentos confirmados'}
              </div>
            </div>

            {/* Card 4: Vencidos em Atraso */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-rose-600" />
                  Vencidos no Período
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  receivablePeriodTotals.totalVencido > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {receivablePeriodTotals.vencidoCount} vencido(s)
                </span>
              </div>
              <div className={`text-xl font-black mt-1 ${receivablePeriodTotals.totalVencido > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                {formatCurrency(receivablePeriodTotals.totalVencido)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {receivablePeriodTotals.totalVencido > 0 ? 'Requer cobrança com clientes' : 'Nenhum título em atraso'}
              </div>
            </div>
          </div>

          {/* BARRA DE FILTROS DO CONTAS A RECEBER */}
          <div className="shrink-0 bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2.5">
            {/* Linha 1: Período e Atalhos Rápidos */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1 mr-1">
                  <Calendar size={14} className="text-blue-600" />
                  Período:
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectReceivablePeriodPreset('mes_atual')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    receivablePeriodPreset === 'mes_atual'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Mês Atual
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectReceivablePeriodPreset('mes_anterior')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    receivablePeriodPreset === 'mes_anterior'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Mês Anterior
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectReceivablePeriodPreset('proximo_mes')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    receivablePeriodPreset === 'proximo_mes'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Próximo Mês
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectReceivablePeriodPreset('hoje')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    receivablePeriodPreset === 'hoje'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectReceivablePeriodPreset('todos')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    receivablePeriodPreset === 'todos'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Todos os Períodos
                </button>
              </div>

              {/* Seletor de Datas Personalizado e Tipo de Data */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-xs bg-white px-2 py-1 rounded-lg border border-slate-200">
                  <span className="text-[11px] text-slate-400 font-semibold">De</span>
                  <input
                    type="date"
                    value={receivableStartDate}
                    onChange={(e) => {
                      setReceivableStartDate(e.target.value);
                      setReceivablePeriodPreset('personalizado');
                    }}
                    className="text-xs text-slate-700 font-medium bg-transparent outline-none cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-400 font-semibold">até</span>
                  <input
                    type="date"
                    value={receivableEndDate}
                    onChange={(e) => {
                      setReceivableEndDate(e.target.value);
                      setReceivablePeriodPreset('personalizado');
                    }}
                    className="text-xs text-slate-700 font-medium bg-transparent outline-none cursor-pointer"
                  />
                </div>

                <select
                  value={receivableDateType}
                  onChange={(e) => setReceivableDateType(e.target.value as any)}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none cursor-pointer"
                  title="Filtrar por data de vencimento ou emissão"
                >
                  <option value="vencimento">Data de Vencimento</option>
                  <option value="emissao">Data de Emissão</option>
                </select>
              </div>
            </div>

            {/* Linha 2: Busca por texto, Filtro por Cliente, Filtro por Plano de Contas, Filtro por Status e Limpar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-1 border-t border-slate-200/60">
              {/* Busca */}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar cliente, doc, histórico..."
                  value={receivableSearch}
                  onChange={(e) => setReceivableSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                />
                {receivableSearch && (
                  <button
                    type="button"
                    onClick={() => setReceivableSearch('')}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Filtro Cliente / Sacado */}
              <div>
                <select
                  value={receivableCustomerFilter}
                  onChange={(e) => setReceivableCustomerFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none cursor-pointer"
                >
                  <option value="todos">👤 Todos os Clientes</option>
                  {availableCustomers.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro Plano de Contas */}
              <div>
                <select
                  value={receivableChartAccountFilter}
                  onChange={(e) => setReceivableChartAccountFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none cursor-pointer"
                >
                  <option value="todos">📖 Todos os Planos de Contas</option>
                  {availableChartAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.launchCode ? `[${acc.launchCode}] ` : ''}{acc.hierarchicalCode || acc.code} - {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro Status */}
              <div>
                <select
                  value={receivableStatusFilter}
                  onChange={(e) => setReceivableStatusFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none cursor-pointer"
                >
                  <option value="todos">🏷️ Todos os Status</option>
                  <option value="aberto">Em Aberto</option>
                  <option value="parcial">Recebido Parcial</option>
                  <option value="recebido">Recebido / Liquidado</option>
                  <option value="vencido">Vencido (Em Atraso)</option>
                </select>
              </div>

              {/* Limpar Filtros */}
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    handleSelectReceivablePeriodPreset('mes_atual');
                    setReceivableDateType('vencimento');
                    setReceivableCustomerFilter('todos');
                    setReceivableChartAccountFilter('todos');
                    setReceivableStatusFilter('todos');
                    setReceivableSearch('');
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg font-semibold cursor-pointer w-full justify-center transition-colors"
                >
                  <RotateCw size={12} />
                  <span>Limpar Filtros</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-[280px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                <tr>
                  <SortableTh label="Doc / Parcela" sortKey="docNumber" sortConfig={receivableSortConfig} onSort={handleReceivableSort} />
                  <SortableTh label="Cliente" sortKey="customerName" sortConfig={receivableSortConfig} onSort={handleReceivableSort} />
                  <SortableTh label="Emissão" sortKey="issueDate" sortConfig={receivableSortConfig} onSort={handleReceivableSort} />
                  <SortableTh label="Vencimento" sortKey="dueDate" sortConfig={receivableSortConfig} onSort={handleReceivableSort} />
                  <SortableTh label="Valor Original" sortKey="originalValue" sortConfig={receivableSortConfig} onSort={handleReceivableSort} align="right" />
                  <SortableTh label="Recebido" sortKey="paidValue" sortConfig={receivableSortConfig} onSort={handleReceivableSort} align="right" />
                  <SortableTh label="Saldo Aberto" sortKey="balance" sortConfig={receivableSortConfig} onSort={handleReceivableSort} align="right" />
                  <SortableTh label="Status" sortKey="status" sortConfig={receivableSortConfig} onSort={handleReceivableSort} align="center" />
                  <th className="p-3 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedReceivables.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      Nenhum título a receber encontrado para o período e filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  sortedReceivables.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-mono font-bold text-blue-700">{r.docNumber}</td>
                      <td className="p-3 font-semibold text-slate-800">{r.customerName}</td>
                      <td className="p-3 text-slate-500">{new Date(r.issueDate).toLocaleDateString('pt-BR')}</td>
                      <td className="p-3 font-medium text-slate-700">{new Date(r.dueDate).toLocaleDateString('pt-BR')}</td>
                      <td className="p-3 text-right font-medium text-slate-600">{formatCurrency(r.originalValue)}</td>
                      <td className="p-3 text-right font-medium text-emerald-600">{formatCurrency(r.paidValue)}</td>
                      <td className="p-3 text-right font-bold text-slate-900">{formatCurrency(r.balance)}</td>
                      <td className="p-3 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          r.status === 'recebido'
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.status === 'parcial'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {r.status !== 'recebido' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setReceivingTitle(r);
                                setPartialAmount(String(r.balance));
                                setSelectedVoucherIdForReceive('');
                                setPaymentMethodUsed('Pix');
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md text-[11px] shadow-xs cursor-pointer"
                              title="Dar baixa / Receber valor"
                            >
                              Dar Baixa
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px] font-semibold">Liquidado</span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEditReceivable(r)}
                            className="p-1.5 hover:bg-blue-50 text-slate-500 hover:text-blue-700 rounded-lg border border-slate-200 hover:border-blue-200 cursor-pointer transition-colors"
                            title="Editar Título"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteReceivable(r)}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg border border-slate-200 hover:border-rose-200 cursor-pointer transition-colors"
                            title="Excluir Título"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 3: CONTAS A PAGAR */}
      {activeTab === 'contas_pagar' && (
        <div className="flex-1 min-h-0 flex flex-col gap-4 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden p-4">
          <div className="shrink-0 flex flex-col sm:flex-row justify-between sm:items-center pb-2 border-b border-slate-100 gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Contas a Pagar (Obrigações, Despesas & Compras)</h3>
              <span className="text-xs text-slate-500">
                Aluguel, fornecedores, água, luz, fretes, combustível, impostos e salários com classificação contábil obrigatória.
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                Pendente Geral: {formatCurrency(expectedPayables)}
              </span>
              <button
                onClick={() => {
                  setPayableSupplierName('');
                  setIsSupplierDropdownOpen(false);
                  setPayableLaunchCode('');
                  setPayableChartAccountId('');
                  setPayableChartSearch('');
                  setIsChartSearchDropdownOpen(false);
                  setPayableHistory('');
                  setPayableDocNumber('');
                  setPayablePaymentMethod('Boleto');
                  setPayableAmount('');
                  setPayableDueDate('');
                  setIsMultipleInstallmentsEnabled(false);
                  setPayableInstallmentCount(1);
                  setPayableIntervalDays(30);
                  setPayableCustomInstallments([]);
                  setIsNewPayableOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Lançar Obrigação</span>
              </button>
            </div>
          </div>

          {/* PAINEL DE RESUMO DO PERÍODO FILTRADO (CONTAS A PAGAR) */}
          <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: Total a Pagar no Período */}
            <div className="bg-gradient-to-br from-rose-50 to-rose-100/50 p-3.5 rounded-xl border border-rose-200 shadow-2xs">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign size={14} className="text-rose-700" />
                  Total a Pagar no Período
                </span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-200 text-rose-900">
                  Saldo Pendente
                </span>
              </div>
              <div className="text-xl font-black text-rose-700 mt-1">
                {formatCurrency(payablePeriodTotals.totalPagar)}
              </div>
              <div className="text-[11px] text-rose-800/80 mt-0.5">
                {payablePeriodTotals.openCount} obrigação(ões) a pagar no período
              </div>
            </div>

            {/* Card 2: Total de Obrigações do Período */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Total de Obrigações
                </span>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {payablePeriodTotals.count} registro(s)
                </span>
              </div>
              <div className="text-xl font-black text-slate-800 mt-1">
                {formatCurrency(payablePeriodTotals.totalOriginal)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Valor nominal total das despesas do período
              </div>
            </div>

            {/* Card 3: Total Já Pago no Período */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  Total Já Pago
                </span>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Liquidado
                </span>
              </div>
              <div className="text-xl font-black text-emerald-700 mt-1">
                {formatCurrency(payablePeriodTotals.totalPago)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {payablePeriodTotals.totalOriginal > 0
                  ? `${((payablePeriodTotals.totalPago / payablePeriodTotals.totalOriginal) * 100).toFixed(1)}% do valor liquidado`
                  : 'Pagamentos realizados'}
              </div>
            </div>

            {/* Card 4: Vencidas em Atraso */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-amber-600" />
                  Vencidas em Atraso
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  payablePeriodTotals.totalVencido > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {payablePeriodTotals.vencidoCount} atrasada(s)
                </span>
              </div>
              <div className={`text-xl font-black mt-1 ${payablePeriodTotals.totalVencido > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                {formatCurrency(payablePeriodTotals.totalVencido)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {payablePeriodTotals.totalVencido > 0 ? 'Requer liquidação urgente' : 'Nenhuma obrigação atrasada'}
              </div>
            </div>
          </div>

          {/* BARRA DE FILTROS DO CONTAS A PAGAR */}
          <div className="shrink-0 bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2.5">
            {/* Linha 1: Período e Atalhos Rápidos */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1 mr-1">
                  <Calendar size={14} className="text-blue-600" />
                  Período:
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectPayablePeriodPreset('mes_atual')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    payablePeriodPreset === 'mes_atual'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Mês Atual
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPayablePeriodPreset('mes_anterior')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    payablePeriodPreset === 'mes_anterior'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Mês Anterior
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPayablePeriodPreset('proximo_mes')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    payablePeriodPreset === 'proximo_mes'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Próximo Mês
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPayablePeriodPreset('hoje')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    payablePeriodPreset === 'hoje'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPayablePeriodPreset('todos')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    payablePeriodPreset === 'todos'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Todos os Períodos
                </button>
              </div>

              {/* Seletor de Datas Personalizado e Tipo de Data */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-xs bg-white px-2 py-1 rounded-lg border border-slate-200">
                  <span className="text-[11px] text-slate-400 font-semibold">De</span>
                  <input
                    type="date"
                    value={payableStartDate}
                    onChange={(e) => {
                      setPayableStartDate(e.target.value);
                      setPayablePeriodPreset('personalizado');
                    }}
                    className="text-xs text-slate-700 font-medium bg-transparent outline-none cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-400 font-semibold">até</span>
                  <input
                    type="date"
                    value={payableEndDate}
                    onChange={(e) => {
                      setPayableEndDate(e.target.value);
                      setPayablePeriodPreset('personalizado');
                    }}
                    className="text-xs text-slate-700 font-medium bg-transparent outline-none cursor-pointer"
                  />
                </div>

                <select
                  value={payableDateType}
                  onChange={(e) => setPayableDateType(e.target.value as any)}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none cursor-pointer"
                  title="Filtrar por data de vencimento ou emissão"
                >
                  <option value="vencimento">Data de Vencimento</option>
                  <option value="emissao">Data de Emissão</option>
                </select>
              </div>
            </div>

            {/* Linha 2: Busca por texto, Filtro por Fornecedor, Filtro por Plano de Contas, Filtro por Status e Limpar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-1 border-t border-slate-200/60">
              {/* Busca */}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar descrição, doc, código..."
                  value={payableSearch}
                  onChange={(e) => setPayableSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                />
                {payableSearch && (
                  <button
                    type="button"
                    onClick={() => setPayableSearch('')}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Filtro Fornecedor / Favorecido */}
              <div>
                <select
                  value={payableSupplierFilter}
                  onChange={(e) => setPayableSupplierFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none cursor-pointer"
                >
                  <option value="todos">🏢 Todos os Fornecedores</option>
                  {availableSuppliers.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro Plano de Contas */}
              <div>
                <select
                  value={payableChartAccountFilter}
                  onChange={(e) => setPayableChartAccountFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none cursor-pointer"
                >
                  <option value="todos">📖 Todos os Planos de Contas</option>
                  {availableChartAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.launchCode ? `[${acc.launchCode}] ` : ''}{acc.hierarchicalCode || acc.code} - {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro Status */}
              <div>
                <select
                  value={payableStatusFilter}
                  onChange={(e) => setPayableStatusFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none cursor-pointer"
                >
                  <option value="todos">🏷️ Todos os Status</option>
                  <option value="aberto">Em Aberto / Pendente</option>
                  <option value="parcial">Pago Parcial</option>
                  <option value="pago">Pago / Liquidado</option>
                  <option value="vencido">Vencido (Em Atraso)</option>
                </select>
              </div>

              {/* Limpar Filtros */}
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    handleSelectPayablePeriodPreset('mes_atual');
                    setPayableDateType('vencimento');
                    setPayableSupplierFilter('todos');
                    setPayableChartAccountFilter('todos');
                    setPayableStatusFilter('todos');
                    setPayableClassificationFilter('todas');
                    setPayableSearch('');
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg font-semibold cursor-pointer w-full justify-center transition-colors"
                >
                  <RotateCw size={12} />
                  <span>Limpar Filtros</span>
                </button>
              </div>
            </div>

            {/* Sub-filtros rápidos de classificação contábil */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 text-xs font-semibold overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setPayableClassificationFilter('todas')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    payableClassificationFilter === 'todas'
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas ({companyPayables.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPayableClassificationFilter('classificadas')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                    payableClassificationFilter === 'classificadas'
                      ? 'bg-emerald-50 text-emerald-700 font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CheckCircle2 size={12} className="text-emerald-600" />
                  <span>Classificadas ({classifiedCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPayableClassificationFilter('pendentes')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                    payableClassificationFilter === 'pendentes'
                      ? 'bg-amber-50 text-amber-800 font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <AlertTriangle size={12} className="text-amber-600" />
                  <span>Pendentes ({pendingClassificationCount})</span>
                </button>
              </div>
            </div>
          </div>

          {/* ALERTA SE HOUVER DESPESAS PENDENTES DE CLASSIFICAÇÃO */}
          {pendingClassificationCount > 0 && (
            <div className="shrink-0 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className="text-amber-600 shrink-0" />
                <span>
                  <strong>Atenção:</strong> Existem <strong>{pendingClassificationCount}</strong> despesa(s) com classificação contábil pendente. A definição do <strong>Código de Lançamento (3 dígitos)</strong> será estritamente exigida e bloqueante no momento da baixa/pagamento.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPayableClassificationFilter('pendentes')}
                className="text-[11px] font-bold text-amber-800 underline hover:text-amber-950 shrink-0 ml-2 cursor-pointer"
              >
                Filtrar Pendentes
              </button>
            </div>
          )}

          <div className="flex-1 min-h-[280px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                <tr>
                  <SortableTh label="Doc / Ref" sortKey="docNumber" sortConfig={payableSortConfig} onSort={handlePayableSort} />
                  <SortableTh label="Descrição da Obrigação" sortKey="description" sortConfig={payableSortConfig} onSort={handlePayableSort} />
                  <SortableTh label="Plano de Contas" sortKey="chartAccount" sortConfig={payableSortConfig} onSort={handlePayableSort} />
                  <SortableTh label="Favorecido / Fornecedor" sortKey="supplierName" sortConfig={payableSortConfig} onSort={handlePayableSort} />
                  <SortableTh label="Vencimento" sortKey="dueDate" sortConfig={payableSortConfig} onSort={handlePayableSort} />
                  <SortableTh label="Valor Total" sortKey="originalValue" sortConfig={payableSortConfig} onSort={handlePayableSort} align="right" />
                  <SortableTh label="Pago" sortKey="paidValue" sortConfig={payableSortConfig} onSort={handlePayableSort} align="right" />
                  <SortableTh label="Saldo a Pagar" sortKey="balance" sortConfig={payableSortConfig} onSort={handlePayableSort} align="right" />
                  <SortableTh label="Status" sortKey="status" sortConfig={payableSortConfig} onSort={handlePayableSort} align="center" />
                  <th className="p-3 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedPayables.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      Nenhuma conta a pagar encontrada para o período e filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  sortedPayables.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-mono font-bold text-slate-600">{p.docNumber}</td>
                      <td className="p-3 font-semibold text-slate-800">{p.description}</td>
                      <td className="p-3">
                        {p.itemClassifications && p.itemClassifications.length > 1 ? (
                          <div className="space-y-0.5">
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 cursor-help"
                              title={p.itemClassifications.map(i => `${i.description}: [${i.launchCode || '?'}] ${i.chartAccountName || 'Pendente'} (${formatCurrency(i.amount)})`).join('\n')}
                            >
                              <span className="bg-indigo-600 text-white px-1 rounded text-[9px]">
                                {p.itemClassifications.length} itens
                              </span>
                              <span>Rateio Multi-Contas</span>
                            </span>
                            <div className="text-[10px] text-slate-500 font-mono truncate max-w-[170px]" title={p.itemClassifications.map(i => `${i.launchCode || '?'}: ${formatCurrency(i.amount)}`).join(' | ')}>
                              {p.itemClassifications.map(i => `${i.launchCode || '?'}: ${formatCurrency(i.amount)}`).join(' | ')}
                            </div>
                          </div>
                        ) : p.classificationStatus === 'classificado' && (p.launchCode || p.chartAccountName) ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                            <span className="bg-blue-600 text-white px-1 rounded text-[9px]">
                              {p.launchCode || 'OK'}
                            </span>
                            <span className="truncate max-w-[130px]" title={p.chartAccountName}>
                              {p.chartAccountName || p.chartAccountCode}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            <AlertTriangle size={11} className="text-amber-600" />
                            <span>Pendente de Classificação</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600">{p.supplierName}</td>
                      <td className="p-3 font-medium text-slate-700">{new Date(p.dueDate).toLocaleDateString('pt-BR')}</td>
                      <td className="p-3 text-right font-medium text-slate-600">{formatCurrency(p.originalValue)}</td>
                      <td className="p-3 text-right font-medium text-emerald-600">{formatCurrency(p.paidValue)}</td>
                      <td className="p-3 text-right font-bold text-rose-600">{formatCurrency(p.balance)}</td>
                      <td className="p-3 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          p.status === 'pago'
                            ? 'bg-emerald-100 text-emerald-800'
                            : p.status === 'parcial'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {p.status !== 'pago' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPayingTitle(p);
                                setPartialAmount(String(p.balance));
                                setPayingLaunchCode(p.launchCode || '');
                                setPayingChartAccountId(p.chartAccountId || '');
                              }}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md text-[11px] shadow-xs cursor-pointer"
                              title="Pagar despesa (requer classificação 3 dígitos)"
                            >
                              Pagar
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px] font-semibold">Pago</span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEditPayable(p)}
                            className="p-1.5 hover:bg-blue-50 text-slate-500 hover:text-blue-700 rounded-lg border border-slate-200 hover:border-blue-200 cursor-pointer transition-colors"
                            title="Editar Conta a Pagar"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePayable(p)}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg border border-slate-200 hover:border-rose-200 cursor-pointer transition-colors"
                            title="Excluir Conta a Pagar"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 4: CAIXA PDV (ABERTURA, FECHAMENTO, CONFERÊNCIA CEGA, SANGRIA, SUPRIMENTO) */}
      {activeTab === 'caixa_pdv' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Vault className="text-blue-600" size={20} />
                <h3 className="font-bold text-base text-slate-800">Controle e Fechamento de Caixa PDV</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  activeCashRegister ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {activeCashRegister ? 'Caixa Aberto' : 'Caixa Fechado'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {activeCashRegister
                  ? `Operador: ${activeCashRegister.userName} • Aberto em: ${new Date(activeCashRegister.openedAt).toLocaleTimeString('pt-BR')} • Fundo Inicial: ${formatCurrency(activeCashRegister.initialBalance)}`
                  : 'Nenhum caixa aberto neste momento.'}
              </p>
            </div>

            {activeCashRegister && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setCashOpType('suprimento');
                    setIsCashOperationModalOpen(true);
                  }}
                  className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-lg border border-emerald-200 transition-colors"
                >
                  + Suprimento
                </button>
                <button
                  onClick={() => {
                    setCashOpType('sangria');
                    setIsCashOperationModalOpen(true);
                  }}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-xs rounded-lg border border-rose-200 transition-colors"
                >
                  - Sangria
                </button>
                <button
                  onClick={() => {
                    setReportedCash(formatCashDecimalPtBr(parseCashDecimalPtBr(reportedCash)));
                    setReportedPix(formatCashDecimalPtBr(parseCashDecimalPtBr(reportedPix)));
                    setReportedCard(formatCashDecimalPtBr(parseCashDecimalPtBr(reportedCard)));
                    setIsCloseRegisterModalOpen(true);
                  }}
                  className="px-4 py-2 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-lg shadow-xs transition-colors"
                >
                  Encerrar Turno / Fechar Caixa
                </button>
              </div>
            )}
          </div>

          {/* Histórico de Movimentos do Caixa Aberto */}
          {activeCashRegister && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Movimentações do Caixa Atual
              </h4>

              <div className="divide-y divide-slate-100 text-xs">
                {activeCashRegister.movements.length === 0 ? (
                  <p className="text-slate-400 py-4">Nenhuma movimentação avulsa registrada no caixa.</p>
                ) : (
                  activeCashRegister.movements.map((m) => (
                    <div key={m.id} className="py-2 flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-slate-800">{m.description}</div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(m.timestamp).toLocaleTimeString('pt-BR')} • Tipo: {m.type}
                        </div>
                      </div>
                      <div className="font-bold text-slate-900">{formatCurrency(m.amount)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Histórico dos Caixas Fechados Anteriores com Conferência Cega */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <History size={15} />
              <span>Histórico de Fechamentos Anteriores (Conferência de Diferenças)</span>
            </h4>

            <div className="divide-y divide-slate-100 text-xs">
              {dbState.cashRegisters.filter((c) => c.status === 'fechado').length === 0 ? (
                <p className="text-slate-400 py-4">Nenhum caixa encerrado anteriormente registrado.</p>
              ) : (
                dbState.cashRegisters
                  .filter((c) => c.status === 'fechado')
                  .map((c) => (
                    <div key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-800 flex items-center gap-2">
                          <span>Caixa Encerrado por: {c.userName}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {c.closedAt ? new Date(c.closedAt).toLocaleString('pt-BR') : ''}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Fundo Inicial: {formatCurrency(c.initialBalance)} • Esperado Total: {formatCurrency((c.expectedBalance?.dinheiro || 0) + (c.expectedBalance?.pix || 0) + (c.expectedBalance?.cartao || 0))}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[11px] text-slate-600">
                          Informado: <strong>{formatCurrency((c.reportedBalance?.dinheiro || 0) + (c.reportedBalance?.pix || 0) + (c.reportedBalance?.cartao || 0))}</strong>
                        </div>
                        <div className={`text-xs font-bold ${
                          (c.difference || 0) === 0
                            ? 'text-emerald-600'
                            : (c.difference || 0) > 0
                            ? 'text-blue-600'
                            : 'text-rose-600'
                        }`}>
                          Diferença: {(c.difference || 0) >= 0 ? '+' : ''}{formatCurrency(c.difference || 0)}
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ABA: PLANO DE CONTAS */}
      {activeTab === 'plano_contas' && <ChartOfAccountsView />}

      {/* ABA: DRE GERENCIAL */}
      {activeTab === 'dre_gerencial' && <DreGerencialView />}

      {/* ABA 5: FORMAS DE PAGAMENTO */}
      {activeTab === 'formas_pagamento' && <PaymentMethodsManager />}

      {/* ABA 6: CONTAS FINANCEIRAS / BANCÁRIAS */}
      {activeTab === 'contas_bancarias' && <FinancialAccountsManager />}

      {/* ABA 7: PRAZOS DE PAGAMENTO */}
      {activeTab === 'prazos_pagamento' && <PaymentTermsManager />}

      {/* ABA: VALE (CRÉDITOS DE CLIENTES) */}
      {activeTab === 'vales' && <CustomerVouchersManager />}

      {/* ABA 8: RELATÓRIOS FINANCEIROS */}
      {activeTab === 'relatorios' && <FinancialReportsManager />}

      {/* Modal: Fechamento de Caixa PDV (Conferência Cega) */}
      {isCloseRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-800">
              Conferência e Fechamento de Caixa
            </h3>
            <p className="text-xs text-slate-500">
              Conte os valores em espécie na gaveta física e consulte os relatórios dos terminais de cartão e Pix antes de finalizar.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Total em Dinheiro na Gaveta (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="0,00"
                  value={reportedCash}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setReportedCash(sanitizeCashCurrencyInput(e.target.value))}
                  onBlur={() => setReportedCash(formatCashDecimalPtBr(parseCashDecimalPtBr(reportedCash)))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Total em Pix Conferido (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={reportedPix}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setReportedPix(sanitizeCashCurrencyInput(e.target.value))}
                  onBlur={() => setReportedPix(formatCashDecimalPtBr(parseCashDecimalPtBr(reportedPix)))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Total em Cartões (Débito/Crédito)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={reportedCard}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setReportedCard(sanitizeCashCurrencyInput(e.target.value))}
                  onBlur={() => setReportedCard(formatCashDecimalPtBr(parseCashDecimalPtBr(reportedCard)))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observações de Encerramento</label>
                <textarea
                  rows={2}
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="Justificativa para eventuais diferenças de moedas..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsCloseRegisterModalOpen(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmCloseCashRegister}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs"
              >
                Concluir Fechamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Suprimento / Sangria */}
      {isCashOperationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleExecuteCashOperation}
            className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-3.5"
          >
            <h3 className="font-bold text-base text-slate-800 capitalize">
              {cashOpType === 'suprimento' ? 'Suprimento de Caixa (+)' : 'Sangria de Caixa (-)'}
            </h3>

            <div className="text-xs space-y-2.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Valor (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0,00"
                  value={cashOpAmount}
                  onChange={(e) => setCashOpAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Justificativa / Motivo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Troco inicial extra, recolhimento para cofre..."
                  value={cashOpReason}
                  onChange={(e) => setCashOpReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCashOperationModalOpen(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={`px-4 py-2 text-xs font-bold text-white rounded-lg shadow-xs ${
                  cashOpType === 'suprimento' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                Confirmar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Baixa de Contas a Receber */}
      {receivingTitle && (() => {
        const totalAvailableVoucherBalance = receivingTitleAvailableVouchers.reduce(
          (sum, v) => sum + v.remainingBalance,
          0
        );
        const activeVoucher =
          receivingTitleAvailableVouchers.find((v) => v.id === selectedVoucherIdForReceive) ||
          receivingTitleAvailableVouchers[0];
        const isUsingVoucher = paymentMethodUsed === 'Vale (Crédito de Cliente)';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-3.5">
              <h3 className="font-bold text-base text-slate-800">Registrar Recebimento</h3>
              <p className="text-xs text-slate-500">
                Cliente: <strong>{receivingTitle.customerName}</strong> • Doc: {receivingTitle.docNumber}
              </p>

              {receivingTitleAvailableVouchers.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                      <Ticket size={15} className="text-amber-600 shrink-0" />
                      <span>
                        Cliente possui {formatCurrency(totalAvailableVoucherBalance)} em Vale disponível!
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Você pode utilizar o saldo do Vale deste cliente para abater ou liquidar este título no Contas a Receber.
                  </p>
                  {!isUsingVoucher && (
                    <button
                      type="button"
                      onClick={() => {
                        const firstVoucher = receivingTitleAvailableVouchers[0];
                        if (firstVoucher) {
                          setPaymentMethodUsed('Vale (Crédito de Cliente)');
                          setSelectedVoucherIdForReceive(firstVoucher.id);
                          setPartialAmount(
                            String(Math.min(receivingTitle.balance, firstVoucher.remainingBalance).toFixed(2))
                          );
                        }
                      }}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[11px] cursor-pointer transition-colors"
                    >
                      Usar Vale para Baixar Título
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Valor a Receber (Saldo do Título: {formatCurrency(receivingTitle.balance)})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    max={
                      isUsingVoucher && activeVoucher
                        ? Math.min(receivingTitle.balance, activeVoucher.remainingBalance)
                        : receivingTitle.balance
                    }
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Forma de Pagamento</label>
                  <select
                    value={paymentMethodUsed}
                    onChange={(e) => {
                      const nextMethod = e.target.value;
                      setPaymentMethodUsed(nextMethod);
                      if (nextMethod === 'Vale (Crédito de Cliente)' && receivingTitleAvailableVouchers.length > 0) {
                        const chosen =
                          receivingTitleAvailableVouchers.find((v) => v.id === selectedVoucherIdForReceive) ||
                          receivingTitleAvailableVouchers[0];
                        setSelectedVoucherIdForReceive(chosen.id);
                        setPartialAmount(
                          String(Math.min(receivingTitle.balance, chosen.remainingBalance).toFixed(2))
                        );
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold"
                  >
                    <option value="Pix">Pix</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Transferência Bancária">Transferência Bancária</option>
                    {receivingTitleAvailableVouchers.length > 0 && (
                      <option value="Vale (Crédito de Cliente)">
                        Vale (Crédito de Cliente • Disp.: {formatCurrency(totalAvailableVoucherBalance)})
                      </option>
                    )}
                  </select>
                </div>

                {isUsingVoucher && receivingTitleAvailableVouchers.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
                    <label className="block font-bold text-slate-700">Selecionar Vale do Cliente *</label>
                    <select
                      value={selectedVoucherIdForReceive || activeVoucher?.id || ''}
                      onChange={(e) => {
                        const vId = e.target.value;
                        setSelectedVoucherIdForReceive(vId);
                        const chosen = receivingTitleAvailableVouchers.find((v) => v.id === vId);
                        if (chosen) {
                          setPartialAmount(
                            String(Math.min(receivingTitle.balance, chosen.remainingBalance).toFixed(2))
                          );
                        }
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-semibold text-slate-800"
                    >
                      {receivingTitleAvailableVouchers.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.code} • Saldo: {formatCurrency(v.remainingBalance)} ({v.reason})
                        </option>
                      ))}
                    </select>
                    {activeVoucher && (
                      <p className="text-[11px] text-slate-600">
                        Máximo aplicável neste Vale:{' '}
                        <strong className="text-emerald-700">
                          {formatCurrency(Math.min(receivingTitle.balance, activeVoucher.remainingBalance))}
                        </strong>
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setReceivingTitle(null);
                    setSelectedVoucherIdForReceive('');
                  }}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReceivingTitle}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs cursor-pointer"
                >
                  {isUsingVoucher ? 'Confirmar Baixa com Vale' : 'Confirmar Recebimento'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Pagamento de Contas a Pagar */}
      {payingTitle && (() => {
        const isAlreadyClassified = payingTitle.classificationStatus === 'classificado' && payingTitle.chartAccountId;
        const selectedAccount = analyticalAccounts.find(
          (a) => a.id === payingChartAccountId || (payingLaunchCode && a.launchCode === payingLaunchCode.trim())
        );
        const isClassificationComplete = Boolean(selectedAccount);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-3.5">
              <div className="flex justify-between items-start pb-2 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-base text-slate-800">Efetuar Pagamento de Despesa</h3>
                  <p className="text-xs text-slate-500">
                    Favorecido: <strong>{payingTitle.supplierName}</strong> ({payingTitle.description})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPayingTitle(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* AVISO MANDATÓRIO CASO ESTEJA PENDENTE DE CLASSIFICAÇÃO */}
              {!isAlreadyClassified && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                    <ShieldAlert size={16} className="text-amber-600 shrink-0" />
                    <span>Classificação Contábil Obrigatória para Baixa</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Esta obrigação foi cadastrada como <strong>Pendente de Classificação</strong>. De acordo com as diretrizes da DRE Gerencial, é <strong>estritamente obrigatório</strong> informar o Código de Lançamento (3 dígitos) antes de baixar.
                  </p>
                </div>
              )}

              <div className="space-y-3 text-xs">
                {/* CAMPO OBRIGATÓRIO DE CLASSIFICAÇÃO CONTÁBIL */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="font-bold text-slate-800 flex items-center gap-1">
                      <span>Código de Lançamento no Plano de Contas</span>
                      <span className="text-rose-600 font-black">*</span>
                    </label>
                    {selectedAccount && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                        Código Válido
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">3 Dígitos *</label>
                      <input
                        type="text"
                        maxLength={3}
                        placeholder="101"
                        value={payingLaunchCode}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 3);
                          setPayingLaunchCode(val);
                          if (val.length === 3) {
                            const acc = analyticalAccounts.find((a) => a.launchCode === val);
                            if (acc) setPayingChartAccountId(acc.id);
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-center text-xs text-blue-700 focus:outline-blue-500"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Conta Analítica *</label>
                      <select
                        value={payingChartAccountId}
                        onChange={(e) => {
                          setPayingChartAccountId(e.target.value);
                          const acc = analyticalAccounts.find((a) => a.id === e.target.value);
                          if (acc?.launchCode) setPayingLaunchCode(acc.launchCode);
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-semibold focus:outline-blue-500"
                      >
                        <option value="">Selecione a Conta Analítica...</option>
                        {analyticalAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            [{a.launchCode}] {a.hierarchicalCode} - {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {selectedAccount ? (
                    <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                      Conta vinculada: <strong>{selectedAccount.hierarchicalCode} - {selectedAccount.name}</strong>
                    </div>
                  ) : (
                    <p className="text-[10px] text-rose-600 font-semibold">
                      Digite o código curto de 3 dígitos (ex: 101 Combustível, 102 Manutenção, 103 Frete, 104 Tarifas) ou selecione na lista.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Valor a Pagar (Saldo: {formatCurrency(payingTitle.balance)})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    max={payingTitle.balance}
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Forma de Saída</label>
                  <select
                    value={paymentMethodUsed}
                    onChange={(e) => setPaymentMethodUsed(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold"
                  >
                    <option value="Pix">Pix / Transferência</option>
                    <option value="Boleto">Boleto Bancário</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPayingTitle(null)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPayingTitle}
                  disabled={!isClassificationComplete}
                  className={`px-4 py-2 text-xs font-bold rounded-lg shadow-xs transition-colors ${
                    isClassificationComplete
                      ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                  title={!isClassificationComplete ? 'É obrigatório informar o Código de Lançamento (3 dígitos) antes de baixar' : 'Confirmar liquidação'}
                >
                  Liquidado / Baixar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Lançar Conta a Pagar / Nova Obrigação Financeira */}
      {isNewPayableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleCreatePayable}
            className={`bg-white rounded-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-3.5 max-h-[92vh] overflow-y-auto transition-all ${
              isMultipleInstallmentsEnabled && payableInstallmentCount > 1 ? 'max-w-2xl' : 'max-w-lg'
            }`}
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800 leading-tight">Lançar Nova Obrigação Financeira</h3>
                  <p className="text-[11px] text-slate-500">Contas a Pagar & Compromissos Financeiros</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewPayableOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* 1º: Favorecido / Fornecedor */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">
                    Favorecido / Fornecedor <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickSupplierName(payableSupplierName.trim());
                      setQuickSupplierTradeName('');
                      setQuickSupplierCpfCnpj('');
                      setQuickSupplierPhone('');
                      setQuickSupplierEmail('');
                      setQuickSupplierCity('');
                      setQuickSupplierState('BA');
                      setQuickSupplierType('PJ');
                      setIsSupplierDropdownOpen(false);
                      setIsQuickSupplierModalOpen(true);
                    }}
                    className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 hover:underline cursor-pointer bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors shadow-2xs"
                    title="Cadastrar um novo favorecido ou fornecedor"
                  >
                    <Plus size={13} className="text-blue-600" />
                    <span>Novo Favorecido / Fornecedor</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    ref={supplierInputRef}
                    type="text"
                    required
                    placeholder="Ex: Distribuidora Central Ltda ou CEMIG"
                    value={payableSupplierName}
                    onChange={(e) => {
                      setPayableSupplierName(e.target.value);
                      setIsSupplierDropdownOpen(true);
                    }}
                    onClick={() => setIsSupplierDropdownOpen(true)}
                    onFocus={() => setIsSupplierDropdownOpen(true)}
                    className="w-full pl-3 pr-16 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {payableSupplierName && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayableSupplierName('');
                          setIsSupplierDropdownOpen(true);
                          supplierInputRef.current?.focus();
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
                        title="Limpar favorecido"
                      >
                        <X size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsSupplierDropdownOpen((prev) => !prev)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 rounded-md cursor-pointer hover:bg-slate-200/60 transition-colors"
                      title="Ver os 10 mais utilizados"
                    >
                      <ChevronDown
                        size={16}
                        className={`transition-transform duration-200 ${
                          isSupplierDropdownOpen ? 'rotate-180 text-blue-600' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Dropdown com os 10 Favorecidos/Fornecedores Mais Utilizados */}
                {isSupplierDropdownOpen && (
                  <div
                    ref={supplierDropdownRef}
                    className="absolute z-40 left-0 right-0 mt-1 bg-white border border-blue-200 rounded-xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100 animate-fadeIn"
                  >
                    <div className="p-2 bg-blue-50/90 text-[10.5px] font-bold text-blue-900 flex justify-between items-center border-b border-blue-100 sticky top-0 z-10 backdrop-blur-xs">
                      <span className="flex items-center gap-1">
                        <span>⭐</span>
                        <span>
                          {payableSupplierName.trim()
                            ? `Favorecidos encontrados para "${payableSupplierName}":`
                            : '10 Favorecidos / Fornecedores Mais Utilizados:'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsSupplierDropdownOpen(false)}
                        className="text-slate-400 hover:text-slate-600 font-bold px-1"
                        title="Fechar lista"
                      >
                        ✕
                      </button>
                    </div>

                    {displayedSuppliers.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">
                        <p>
                          Nenhum favorecido cadastrado encontrado
                          {payableSupplierName ? ` para "${payableSupplierName}"` : ''}.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setIsSupplierDropdownOpen(false);
                            setQuickSupplierName(payableSupplierName.trim());
                            setQuickSupplierTradeName('');
                            setQuickSupplierCpfCnpj('');
                            setQuickSupplierPhone('');
                            setQuickSupplierEmail('');
                            setQuickSupplierCity('');
                            setQuickSupplierState('BA');
                            setQuickSupplierType('PJ');
                            setIsQuickSupplierModalOpen(true);
                          }}
                          className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer inline-flex items-center gap-1"
                        >
                          <Plus size={13} />
                          Cadastrar &quot;{payableSupplierName || 'Novo Favorecido'}&quot; agora
                        </button>
                      </div>
                    ) : (
                      displayedSuppliers.map((sup, idx) => (
                        <button
                          key={sup.id}
                          type="button"
                          onClick={() => {
                            setPayableSupplierName(sup.name);
                            setIsSupplierDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-blue-50/80 transition-colors flex items-center justify-between gap-2 cursor-pointer group ${
                            payableSupplierName.trim().toLowerCase() === sup.name.toLowerCase()
                              ? 'bg-blue-50/50'
                              : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <span className="font-bold text-xs text-slate-800 group-hover:text-blue-700 truncate">
                                {sup.name}
                              </span>
                              {sup.tradeName && sup.tradeName !== sup.name && (
                                <span className="text-[10.5px] text-slate-500 font-medium truncate">
                                  ({sup.tradeName})
                                </span>
                              )}
                              {sup.usageCount > 0 ? (
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full shrink-0">
                                  ★ {sup.usageCount} {sup.usageCount === 1 ? 'lançamento' : 'lançamentos'}
                                </span>
                              ) : (
                                <span className="bg-slate-100 text-slate-500 text-[9px] px-1 py-0.2 rounded shrink-0">
                                  Cadastrado
                                </span>
                              )}
                            </div>
                            {sup.cpfCnpj && (
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5 pl-6.5">
                                {sup.type === 'PJ' ? 'CNPJ: ' : 'CPF: '}
                                {sup.cpfCnpj}
                                {sup.city && ` • ${sup.city}/${sup.state || 'BA'}`}
                              </div>
                            )}
                          </div>
                          <span className="text-[10.5px] text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            Selecionar ➔
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 2º: Plano de Contas / Código 3 Dígitos */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <BookOpen size={15} className="text-blue-600" />
                    <label className="font-bold text-slate-800 text-xs">
                      Plano de Contas (Conta Analítica) <span className="text-rose-500">*</span>
                    </label>
                  </div>
                </div>

                {/* Recurso de Pesquisa por Descrição (3 caracteres) */}
                <div className="relative">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Pesquisar conta por descrição (mínimo 3 caracteres, ex: com, ene, fre, alu, mat)..."
                      value={payableChartSearch}
                      onChange={(e) => {
                        setPayableChartSearch(e.target.value);
                        setIsChartSearchDropdownOpen(true);
                      }}
                      onFocus={() => setIsChartSearchDropdownOpen(true)}
                      className="w-full pl-8 pr-8 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                    />
                    {payableChartSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayableChartSearch('');
                          setIsChartSearchDropdownOpen(false);
                        }}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title="Limpar pesquisa"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {/* Dica de digitação */}
                  {payableChartSearch.trim().length > 0 && payableChartSearch.trim().length < 3 && (
                    <span className="text-[10px] text-amber-600 font-medium mt-1 block">
                      * Digite pelo menos 3 caracteres da descrição para filtrar (faltam {3 - payableChartSearch.trim().length})...
                    </span>
                  )}

                  {/* Dropdown com Contas Sintéticas destacadas e Contas Analíticas */}
                  {isChartSearchDropdownOpen && payableChartSearch.trim().length >= 3 && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-blue-200 rounded-xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100 animate-fadeIn">
                      <div className="p-2 bg-blue-50/80 text-[10px] font-bold text-blue-900 flex justify-between items-center border-b border-blue-100">
                        <span>
                          Resultado para &quot;{payableChartSearch}&quot; (Contas Sintéticas destacadas em cinza):
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsChartSearchDropdownOpen(false)}
                          className="text-slate-400 hover:text-slate-600 font-bold"
                        >
                          ✕ Fechar
                        </button>
                      </div>

                      {chartSearchResults.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          Nenhuma conta analítica encontrada para &quot;<strong>{payableChartSearch}</strong>&quot;.
                          <div className="text-[10px] text-slate-400 mt-1">
                            Verifique a grafia ou selecione na lista abaixo.
                          </div>
                        </div>
                      ) : (
                        chartSearchResults.map((group) => (
                          <div key={group.syntheticCode} className="space-y-0.5">
                            {/* Conta Sintética em Destaque */}
                            <div className="bg-slate-100 text-slate-800 px-3 py-1.5 font-black text-[11px] tracking-wide flex items-center justify-between border-y border-slate-200 sticky top-0 z-10">
                              <span className="flex items-center gap-1.5 truncate">
                                <Layers size={13} className="text-indigo-600 shrink-0" />
                                <span className="text-indigo-950 uppercase font-black">
                                  CONTA SINTÉTICA: {group.syntheticName}
                                </span>
                              </span>
                              <span className="text-[9.5px] font-bold text-slate-500 bg-white px-1.5 py-0.2 rounded border border-slate-200 shrink-0">
                                {group.accounts.length} analítica(s)
                              </span>
                            </div>

                            {/* Contas Analíticas Selecionáveis deste Grupo */}
                            <div className="divide-y divide-slate-100 bg-white">
                              {group.accounts.map((acc) => (
                                <button
                                  key={acc.id}
                                  type="button"
                                  onClick={() => {
                                    setPayableChartAccountId(acc.id);
                                    if (acc.launchCode) setPayableLaunchCode(acc.launchCode);
                                    setPayableChartSearch('');
                                    setIsChartSearchDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-blue-50/80 transition-colors flex items-center justify-between gap-2 cursor-pointer group"
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="bg-blue-100 text-blue-800 font-mono font-black text-[10px] px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                                      [{acc.launchCode || 'S/C'}]
                                    </span>
                                    <span className="font-mono text-xs text-slate-500 shrink-0">
                                      {acc.hierarchicalCode}
                                    </span>
                                    <span className="font-bold text-xs text-slate-800 group-hover:text-blue-700 truncate">
                                      {acc.name}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-blue-600 font-extrabold opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    Selecionar ➔
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Exibição da Conta Analítica Selecionada com Destaque para a Sintética */}
                {selectedPayableAccount ? (
                  <div className="p-2.5 bg-blue-50/90 border border-blue-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0 shadow-2xs">
                        ✓
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-black text-blue-900 bg-blue-100 px-1.5 py-0.2 rounded text-[11px]">
                            [{selectedPayableAccount.launchCode}]
                          </span>
                          <span className="font-mono font-bold text-slate-600">{selectedPayableAccount.hierarchicalCode}</span>
                          <span className="font-bold text-slate-900 truncate">{selectedPayableAccount.name}</span>
                        </div>
                        {getParentSynthetic(selectedPayableAccount) && (
                          <div className="text-[10px] text-slate-600 flex items-center gap-1 mt-0.5 truncate">
                            <span className="font-bold text-indigo-700 uppercase">Conta Sintética:</span>
                            <span className="truncate">
                              {getParentSynthetic(selectedPayableAccount)?.hierarchicalCode} - {getParentSynthetic(selectedPayableAccount)?.name}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPayableChartAccountId('');
                        setPayableLaunchCode('');
                      }}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline shrink-0 px-1.5 py-0.5 cursor-pointer"
                      title="Remover seleção"
                    >
                      ✕ Limpar
                    </button>
                  </div>
                ) : null}

                {/* Campos Tradicionais de 3 Dígitos e Seleção Agrupada por Sintéticas */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">3 Dígitos</label>
                    <input
                      type="text"
                      maxLength={3}
                      placeholder="Ex: 101"
                      value={payableLaunchCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 3);
                        setPayableLaunchCode(val);
                        if (val.length === 3) {
                          const acc = analyticalAccounts.find((a) => a.launchCode === val);
                          if (acc) setPayableChartAccountId(acc.id);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-center text-xs text-blue-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      Lista de Contas Analíticas (Agrupadas por Sintética) <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={payableChartAccountId}
                      onChange={(e) => {
                        setPayableChartAccountId(e.target.value);
                        const acc = analyticalAccounts.find((a) => a.id === e.target.value);
                        setPayableLaunchCode(acc?.launchCode || '');
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Selecione a conta analítica...</option>
                      {groupedChartAccounts.map((group) => (
                        <optgroup key={group.syntheticCode} label={group.syntheticName}>
                          {group.accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              [{a.launchCode || 'S/C'}] {a.hierarchicalCode} - {a.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">
                  Pesquise por 3 caracteres do nome, digite o código de 3 dígitos ou selecione a conta analítica na lista acima.
                </p>
              </div>

              {/* 3º: Histórico */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Histórico <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Compra de matéria-prima conf. pedido 1045 ou Energia Ref. Outubro"
                  value={payableHistory}
                  onChange={(e) => setPayableHistory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* 4º: Nº do Documento e 5º: Forma de Pagamento (Padrão: Boleto) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nº do Documento
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: NF 45892, BOL-1049, FAT-882"
                    value={payableDocNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPayableDocNumber(val);
                      const numVal = parseFloat(payableAmount.replace(',', '.'));
                      if (isMultipleInstallmentsEnabled && payableInstallmentCount > 1 && !isNaN(numVal) && numVal > 0) {
                        recalculateInstallments(payableInstallmentCount, numVal, payableDueDate, val, payablePaymentMethod, payableIntervalDays);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:bg-white focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={payablePaymentMethod}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPayablePaymentMethod(val);
                      if (isMultipleInstallmentsEnabled && payableInstallmentCount > 1) {
                        setPayableCustomInstallments((prev) =>
                          prev.map((item) => ({ ...item, paymentMethod: val }))
                        );
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
                  >
                    <option value="Boleto">Boleto (Padrão)</option>
                    <option value="PIX">PIX</option>
                    <option value="Transferência Bancária">Transferência Bancária (TED/DOC)</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Débito Automático">Débito Automático</option>
                  </select>
                </div>
              </div>

              {/* 6º: Valor Total (R$) e 7º: Data de Vencimento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Valor Total (R$) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="0,00"
                    value={payableAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== '' && !/^[\d.,]*$/.test(val)) return;
                      setPayableAmount(val);
                      const numVal = parseFloat(val.replace(',', '.'));
                      if (isMultipleInstallmentsEnabled && payableInstallmentCount > 1 && !isNaN(numVal) && numVal > 0) {
                        recalculateInstallments(payableInstallmentCount, numVal, payableDueDate, payableDocNumber, payablePaymentMethod, payableIntervalDays);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold text-rose-700 focus:bg-white focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isMultipleInstallmentsEnabled && payableInstallmentCount > 1 ? '1º Vencimento *' : 'Data de Vencimento *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={payableDueDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPayableDueDate(val);
                      const numVal = parseFloat(payableAmount.replace(',', '.'));
                      if (isMultipleInstallmentsEnabled && payableInstallmentCount > 1 && !isNaN(numVal) && numVal > 0) {
                        recalculateInstallments(payableInstallmentCount, numVal, val, payableDocNumber, payablePaymentMethod, payableIntervalDays);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-medium focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Condição de Parcelamento / Múltiplas Parcelas Customizáveis */}
              <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200 space-y-2.5 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-start sm:items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isMultipleInstallmentsEnabled
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Layers size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="block font-bold text-slate-800 text-xs">
                          Condição de Pagamento:
                        </label>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isMultipleInstallmentsEnabled
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isMultipleInstallmentsEnabled
                            ? `${payableInstallmentCount}x Parcelado`
                            : '1x Parcela Única / À Vista'}
                        </span>
                      </div>
                      <span className="text-[10.5px] text-slate-500 block mt-0.5">
                        Dividida em múltiplas parcelas com datas e valores customizáveis
                      </span>
                    </div>
                  </div>

                  {/* Botão para habilitar / desabilitar parcelas customizáveis */}
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isMultipleInstallmentsEnabled;
                        setIsMultipleInstallmentsEnabled(next);
                        if (next) {
                          const nextCount = payableInstallmentCount > 1 ? payableInstallmentCount : 2;
                          setPayableInstallmentCount(nextCount);
                          const numVal = parseFloat(payableAmount.replace(',', '.'));
                          if (!isNaN(numVal) && numVal > 0) {
                            recalculateInstallments(
                              nextCount,
                              numVal,
                              payableDueDate,
                              payableDocNumber,
                              payablePaymentMethod,
                              payableIntervalDays
                            );
                          }
                        } else {
                          setPayableInstallmentCount(1);
                          setPayableCustomInstallments([]);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs ${
                        isMultipleInstallmentsEnabled
                          ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isMultipleInstallmentsEnabled ? (
                        <>
                          <X size={13} />
                          <span>Voltar para 1 Parcela Única</span>
                        </>
                      ) : (
                        <>
                          <Plus size={13} />
                          <span>Habilitar Múltiplas Parcelas</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Os campos com datas e valores customizáveis APENAS APARECEM caso seja habilitado */}
                {isMultipleInstallmentsEnabled && (
                  <div className="pt-2 border-t border-slate-200 space-y-2.5 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-xs font-semibold text-slate-700">
                        Configurar Parcelamento:
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          value={payableInstallmentCount}
                          onChange={(e) => {
                            const count = parseInt(e.target.value, 10) || 2;
                            setPayableInstallmentCount(count);
                            const numVal = parseFloat(payableAmount.replace(',', '.'));
                            if (!isNaN(numVal) && numVal > 0) {
                              recalculateInstallments(
                                count,
                                numVal,
                                payableDueDate,
                                payableDocNumber,
                                payablePaymentMethod,
                                payableIntervalDays
                              );
                            }
                          }}
                          className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-blue-900 shadow-2xs"
                        >
                          {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => (
                            <option key={n} value={n}>
                              {n}x ({n} Parcelas)
                            </option>
                          ))}
                        </select>

                        <select
                          value={payableIntervalDays}
                          onChange={(e) => {
                            const interval = parseInt(e.target.value, 10) || 30;
                            setPayableIntervalDays(interval);
                            const numVal = parseFloat(payableAmount.replace(',', '.'));
                            if (!isNaN(numVal) && numVal > 0) {
                              recalculateInstallments(
                                payableInstallmentCount,
                                numVal,
                                payableDueDate,
                                payableDocNumber,
                                payablePaymentMethod,
                                interval
                              );
                            }
                          }}
                          className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-medium text-slate-700 shadow-2xs"
                          title="Intervalo entre as parcelas"
                        >
                          <option value={30}>A cada 30 dias (Mensal)</option>
                          <option value={15}>A cada 15 dias (Quinzenal)</option>
                          <option value={7}>A cada 7 dias (Semanal)</option>
                        </select>
                      </div>
                    </div>

                    {/* Grade de Parcelas e Respectivas Datas de Pagamento */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                          <Calendar size={13} className="text-blue-600" />
                          Datas de Vencimento e Valores Customizáveis:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const numVal = parseFloat(payableAmount.replace(',', '.'));
                            if (!isNaN(numVal) && numVal > 0) {
                              recalculateInstallments(
                                payableInstallmentCount,
                                numVal,
                                payableDueDate,
                                payableDocNumber,
                                payablePaymentMethod,
                                payableIntervalDays
                              );
                            }
                          }}
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                        >
                          Ratear Igualmente
                        </button>
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {payableCustomInstallments.map((inst, idx) => (
                          <div
                            key={idx}
                            className="grid grid-cols-12 gap-1.5 items-center bg-white p-2 rounded-lg border border-slate-200 text-xs shadow-2xs"
                          >
                            <div className="col-span-2 font-bold text-slate-700">
                              Parc. {inst.installmentNumber}/{payableInstallmentCount}
                            </div>

                            <div className="col-span-3">
                              <input
                                type="text"
                                placeholder="Nº Doc"
                                value={inst.docNumber}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPayableCustomInstallments((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, docNumber: val } : item))
                                  );
                                }}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono font-medium"
                                title="Número do Documento da Parcela"
                              />
                            </div>

                            <div className="col-span-4">
                              <input
                                type="date"
                                required
                                value={inst.dueDate}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPayableCustomInstallments((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, dueDate: val } : item))
                                  );
                                }}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-semibold text-slate-800"
                                title="Data de Vencimento desta parcela"
                              />
                            </div>

                            <div className="col-span-3">
                              <div className="relative">
                                <span className="absolute left-1.5 top-1 text-[10px] text-slate-400">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  required
                                  value={inst.amount}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setPayableCustomInstallments((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                                    );
                                  }}
                                  className="w-full pl-6 pr-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-bold text-right text-rose-700"
                                  title="Valor da parcela"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Resumo e conferência */}
                      {(() => {
                        const sumInstallments = payableCustomInstallments.reduce(
                          (acc, curr) => acc + (Number(curr.amount) || 0),
                          0
                        );
                        const totalNum = parseFloat(payableAmount.replace(',', '.')) || 0;
                        const diff = Math.round((sumInstallments - totalNum) * 100) / 100;
                        const isExact = Math.abs(diff) < 0.01;

                        return (
                          <div className="flex items-center justify-between pt-1 text-[11px]">
                            <span className="text-slate-600">
                              Soma das Parcelas: <strong>{formatCurrency(sumInstallments)}</strong>
                            </span>
                            {isExact ? (
                              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                                <CheckCircle2 size={12} className="text-emerald-600" />
                                Soma das parcelas confere
                              </span>
                            ) : (
                              <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                Diferença: {diff > 0 ? `+${formatCurrency(diff)}` : formatCurrency(diff)}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewPayableOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check size={15} />
                <span>
                  {isMultipleInstallmentsEnabled && payableInstallmentCount > 1
                    ? `Salvar ${payableInstallmentCount} Parcelas`
                    : 'Salvar Obrigação'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Cadastro Rápido de Favorecido / Fornecedor (Sobreposto à Nova Obrigação com z-[60]) */}
      {isQuickSupplierModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-fadeIn">
          <form
            onSubmit={handleSaveQuickSupplier}
            className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto my-auto"
          >
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Building2 size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800 leading-tight">
                    Novo Favorecido / Fornecedor
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Cadastre para selecionar imediatamente na obrigação financeira
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickSupplierModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Tipo de Pessoa */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo de Favorecido</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickSupplierType('PJ')}
                    className={`flex-1 py-1.5 px-3 rounded-lg font-bold border transition-all cursor-pointer ${
                      quickSupplierType === 'PJ'
                        ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500 shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Pessoa Jurídica (PJ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickSupplierType('PF')}
                    className={`flex-1 py-1.5 px-3 rounded-lg font-bold border transition-all cursor-pointer ${
                      quickSupplierType === 'PF'
                        ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500 shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Pessoa Física (PF)
                  </button>
                </div>
              </div>

              {/* Razão Social / Nome Completo */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {quickSupplierType === 'PJ' ? 'Razão Social *' : 'Nome Completo *'}
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder={quickSupplierType === 'PJ' ? 'Ex: Distribuidora Silva & Filhos Ltda' : 'Ex: João Carlos da Silva'}
                  value={quickSupplierName}
                  onChange={(e) => setQuickSupplierName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Nome Fantasia (Opcional) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nome Fantasia / Apelido <span className="font-normal text-slate-400">(Opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Comercial Silva"
                  value={quickSupplierTradeName}
                  onChange={(e) => setQuickSupplierTradeName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden"
                />
              </div>

              {/* CNPJ / CPF e Telefone */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {quickSupplierType === 'PJ' ? 'CNPJ' : 'CPF'} <span className="font-normal text-slate-400">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder={quickSupplierType === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                    value={quickSupplierCpfCnpj}
                    onChange={(e) => setQuickSupplierCpfCnpj(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-800 focus:bg-white focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Telefone / WhatsApp <span className="font-normal text-slate-400">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={quickSupplierPhone}
                    onChange={(e) => setQuickSupplierPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* E-mail */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  E-mail <span className="font-normal text-slate-400">(Opcional)</span>
                </label>
                <input
                  type="email"
                  placeholder="financeiro@fornecedor.com.br"
                  value={quickSupplierEmail}
                  onChange={(e) => setQuickSupplierEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden"
                />
              </div>

              {/* Cidade e Estado */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    Cidade <span className="font-normal text-slate-400">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Feira de Santana"
                    value={quickSupplierCity}
                    onChange={(e) => setQuickSupplierCity(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="BA"
                    value={quickSupplierState}
                    onChange={(e) => setQuickSupplierState(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg uppercase text-center font-bold text-slate-800 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsQuickSupplierModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check size={15} />
                <span>Salvar Favorecido & Selecionar</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Lançar Conta a Receber / Novo Título a Receber */}
      {isNewReceivableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateReceivable}
            className={`bg-white rounded-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-3.5 max-h-[92vh] overflow-y-auto transition-all ${
              isRecMultipleInstallmentsEnabled && receivableInstallmentCount > 1 ? 'max-w-2xl' : 'max-w-lg'
            }`}
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Receipt size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800 leading-tight">Lançar Novo Título a Receber</h3>
                  <p className="text-[11px] text-slate-500">Contas a Receber & Gestão de Créditos / Cobrança</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewReceivableOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* 1º: Cliente / Sacado */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">
                    Cliente / Sacado <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickCustomerName(receivableCustomerName.trim());
                      setQuickCustomerTradeName('');
                      setQuickCustomerCpfCnpj('');
                      setQuickCustomerPhone('');
                      setQuickCustomerEmail('');
                      setQuickCustomerCity('');
                      setQuickCustomerState('BA');
                      setQuickCustomerType('PJ');
                      setIsCustomerDropdownOpen(false);
                      setIsQuickCustomerModalOpen(true);
                    }}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 hover:underline cursor-pointer bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors shadow-2xs"
                    title="Cadastrar um novo cliente ou sacado"
                  >
                    <Plus size={13} className="text-emerald-600" />
                    <span>Novo Cliente / Sacado</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    ref={customerInputRef}
                    type="text"
                    required
                    placeholder="Ex: Supermercado Alvorada Ltda ou João da Silva"
                    value={receivableCustomerName}
                    onChange={(e) => {
                      setReceivableCustomerName(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    onClick={() => setIsCustomerDropdownOpen(true)}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    className="w-full pl-3 pr-16 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {receivableCustomerName && (
                      <button
                        type="button"
                        onClick={() => {
                          setReceivableCustomerName('');
                          setReceivableCustomerId('');
                          setIsCustomerDropdownOpen(true);
                          customerInputRef.current?.focus();
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
                        title="Limpar cliente"
                      >
                        <X size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsCustomerDropdownOpen((prev) => !prev)}
                      className="p-1.5 text-slate-500 hover:text-emerald-600 rounded-md cursor-pointer hover:bg-slate-200/60 transition-colors"
                      title="Ver os 10 mais utilizados"
                    >
                      <ChevronDown
                        size={16}
                        className={`transition-transform duration-200 ${
                          isCustomerDropdownOpen ? 'rotate-180 text-emerald-600' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Dropdown com os 10 Clientes Mais Utilizados */}
                {isCustomerDropdownOpen && (
                  <div
                    ref={customerDropdownRef}
                    className="absolute z-40 left-0 right-0 mt-1 bg-white border border-emerald-200 rounded-xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100 animate-fadeIn"
                  >
                    <div className="p-2 bg-emerald-50/90 text-[10.5px] font-bold text-emerald-900 flex justify-between items-center border-b border-emerald-100 sticky top-0 z-10 backdrop-blur-xs">
                      <span className="flex items-center gap-1">
                        <span>⭐</span>
                        <span>
                          {receivableCustomerName.trim()
                            ? `Clientes encontrados para "${receivableCustomerName}":`
                            : '10 Clientes / Sacados Mais Utilizados:'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsCustomerDropdownOpen(false)}
                        className="text-slate-400 hover:text-slate-600 font-bold px-1"
                        title="Fechar lista"
                      >
                        ✕
                      </button>
                    </div>

                    {displayedCustomers.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">
                        <p>
                          Nenhum cliente cadastrado encontrado
                          {receivableCustomerName ? ` para "${receivableCustomerName}"` : ''}.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomerDropdownOpen(false);
                            setQuickCustomerName(receivableCustomerName.trim());
                            setQuickCustomerTradeName('');
                            setQuickCustomerCpfCnpj('');
                            setQuickCustomerPhone('');
                            setQuickCustomerEmail('');
                            setQuickCustomerCity('');
                            setQuickCustomerState('BA');
                            setQuickCustomerType('PJ');
                            setIsQuickCustomerModalOpen(true);
                          }}
                          className="mt-2 text-xs font-bold text-emerald-600 hover:text-emerald-800 underline cursor-pointer inline-flex items-center gap-1"
                        >
                          <Plus size={13} />
                          Cadastrar &quot;{receivableCustomerName || 'Novo Cliente'}&quot; agora
                        </button>
                      </div>
                    ) : (
                      displayedCustomers.map((cust, idx) => (
                        <button
                          key={cust.id}
                          type="button"
                          onClick={() => {
                            setReceivableCustomerName(cust.name);
                            setReceivableCustomerId(cust.id);
                            setIsCustomerDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-emerald-50/80 transition-colors flex items-center justify-between gap-2 cursor-pointer group ${
                            receivableCustomerName.trim().toLowerCase() === cust.name.toLowerCase()
                              ? 'bg-emerald-50/50'
                              : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <span className="font-bold text-xs text-slate-800 group-hover:text-emerald-700 truncate">
                                {cust.name}
                              </span>
                              {cust.tradeName && cust.tradeName !== cust.name && (
                                <span className="text-[10.5px] text-slate-500 font-medium truncate">
                                  ({cust.tradeName})
                                </span>
                              )}
                              {cust.usageCount > 0 ? (
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9.5px] font-bold px-1.5 py-0.2 rounded-full shrink-0">
                                  ★ {cust.usageCount} {cust.usageCount === 1 ? 'título/pedido' : 'títulos/pedidos'}
                                </span>
                              ) : (
                                <span className="bg-slate-100 text-slate-500 text-[9px] px-1 py-0.2 rounded shrink-0">
                                  Cadastrado
                                </span>
                              )}
                            </div>
                            {cust.cpfCnpj && (
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5 pl-6.5">
                                {cust.type === 'PJ' ? 'CNPJ: ' : 'CPF: '}
                                {cust.cpfCnpj}
                                {cust.city && ` • ${cust.city}/${cust.state || 'BA'}`}
                              </div>
                            )}
                          </div>
                          <span className="text-[10.5px] text-emerald-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            Selecionar ➔
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 2º: Plano de Contas / Código 3 Dígitos */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <BookOpen size={15} className="text-emerald-600" />
                    <label className="font-bold text-slate-800 text-xs">
                      Plano de Contas (Conta Analítica) <span className="text-rose-500">*</span>
                    </label>
                  </div>
                </div>

                {/* Recurso de Pesquisa por Descrição (3 caracteres) */}
                <div className="relative">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Pesquisar conta por descrição (mínimo 3 caracteres, ex: ven, rec, ser, jor, dup)..."
                      value={receivableChartSearch}
                      onChange={(e) => {
                        setReceivableChartSearch(e.target.value);
                        setIsRecChartSearchDropdownOpen(true);
                      }}
                      onFocus={() => setIsRecChartSearchDropdownOpen(true)}
                      className="w-full pl-8 pr-8 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
                    />
                    {receivableChartSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setReceivableChartSearch('');
                          setIsRecChartSearchDropdownOpen(false);
                        }}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title="Limpar pesquisa"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {/* Dica de digitação */}
                  {receivableChartSearch.trim().length > 0 && receivableChartSearch.trim().length < 3 && (
                    <span className="text-[10px] text-amber-600 font-medium mt-1 block">
                      * Digite pelo menos 3 caracteres da descrição para filtrar (faltam {3 - receivableChartSearch.trim().length})...
                    </span>
                  )}

                  {/* Dropdown com Contas Sintéticas destacadas e Contas Analíticas */}
                  {isRecChartSearchDropdownOpen && receivableChartSearch.trim().length >= 3 && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-emerald-200 rounded-xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100 animate-fadeIn">
                      <div className="p-2 bg-emerald-50/80 text-[10px] font-bold text-emerald-900 flex justify-between items-center border-b border-emerald-100">
                        <span>
                          Resultado para &quot;{receivableChartSearch}&quot; (Contas Sintéticas destacadas em cinza):
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsRecChartSearchDropdownOpen(false)}
                          className="text-slate-400 hover:text-slate-600 font-bold"
                        >
                          ✕ Fechar
                        </button>
                      </div>

                      {recChartSearchResults.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          Nenhuma conta analítica encontrada para &quot;<strong>{receivableChartSearch}</strong>&quot;.
                          <div className="text-[10px] text-slate-400 mt-1">
                            Verifique a grafia ou selecione na lista abaixo.
                          </div>
                        </div>
                      ) : (
                        recChartSearchResults.map((group) => (
                          <div key={group.syntheticCode} className="space-y-0.5">
                            {/* Conta Sintética em Destaque */}
                            <div className="bg-slate-100 text-slate-800 px-3 py-1.5 font-black text-[11px] tracking-wide flex items-center justify-between border-y border-slate-200 sticky top-0 z-10">
                              <span className="flex items-center gap-1.5 truncate">
                                <Layers size={13} className="text-emerald-700 shrink-0" />
                                <span className="text-slate-900 uppercase font-black">
                                  CONTA SINTÉTICA: {group.syntheticName}
                                </span>
                              </span>
                              <span className="text-[9.5px] font-bold text-slate-500 bg-white px-1.5 py-0.2 rounded border border-slate-200 shrink-0">
                                {group.accounts.length} analítica(s)
                              </span>
                            </div>

                            {/* Contas Analíticas Selecionáveis deste Grupo */}
                            <div className="divide-y divide-slate-100 bg-white">
                              {group.accounts.map((acc) => (
                                <button
                                  key={acc.id}
                                  type="button"
                                  onClick={() => {
                                    setReceivableChartAccountId(acc.id);
                                    if (acc.launchCode) setReceivableLaunchCode(acc.launchCode);
                                    setReceivableChartSearch('');
                                    setIsRecChartSearchDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-emerald-50/80 transition-colors flex items-center justify-between gap-2 cursor-pointer group"
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="bg-emerald-100 text-emerald-800 font-mono font-black text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                                      [{acc.launchCode || 'S/C'}]
                                    </span>
                                    <span className="font-mono text-xs text-slate-500 shrink-0">
                                      {acc.hierarchicalCode}
                                    </span>
                                    <span className="font-bold text-xs text-slate-800 group-hover:text-emerald-700 truncate">
                                      {acc.name}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-emerald-600 font-extrabold opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    Selecionar ➔
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Exibição da Conta Analítica Selecionada com Destaque para a Sintética */}
                {selectedReceivableAccount ? (
                  <div className="p-2.5 bg-emerald-50/90 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0 shadow-2xs">
                        ✓
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-black text-emerald-900 bg-emerald-100 px-1.5 py-0.2 rounded text-[11px]">
                            [{selectedReceivableAccount.launchCode}]
                          </span>
                          <span className="font-mono font-bold text-slate-600">{selectedReceivableAccount.hierarchicalCode}</span>
                          <span className="font-bold text-slate-900 truncate">{selectedReceivableAccount.name}</span>
                        </div>
                        {getParentSynthetic(selectedReceivableAccount) && (
                          <div className="text-[10px] text-slate-600 flex items-center gap-1 mt-0.5 truncate">
                            <span className="font-bold text-emerald-800 uppercase">Conta Sintética:</span>
                            <span className="truncate">
                              {getParentSynthetic(selectedReceivableAccount)?.hierarchicalCode} - {getParentSynthetic(selectedReceivableAccount)?.name}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReceivableChartAccountId('');
                        setReceivableLaunchCode('');
                      }}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline shrink-0 px-1.5 py-0.5 cursor-pointer"
                      title="Remover seleção"
                    >
                      ✕ Limpar
                    </button>
                  </div>
                ) : null}

                {/* Campos Tradicionais de 3 Dígitos e Seleção Agrupada por Sintéticas */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">3 Dígitos</label>
                    <input
                      type="text"
                      maxLength={3}
                      placeholder="Ex: 101"
                      value={receivableLaunchCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 3);
                        setReceivableLaunchCode(val);
                        if (val.length === 3) {
                          const acc = analyticalAccounts.find((a) => a.launchCode === val);
                          if (acc) setReceivableChartAccountId(acc.id);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-center text-xs text-emerald-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      Lista de Contas Analíticas (Agrupadas por Sintética) <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={receivableChartAccountId}
                      onChange={(e) => {
                        setReceivableChartAccountId(e.target.value);
                        const acc = analyticalAccounts.find((a) => a.id === e.target.value);
                        setReceivableLaunchCode(acc?.launchCode || '');
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="">Selecione a conta analítica...</option>
                      {groupedChartAccounts.map((group) => (
                        <optgroup key={group.syntheticCode} label={group.syntheticName}>
                          {group.accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              [{a.launchCode || 'S/C'}] {a.hierarchicalCode} - {a.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">
                  Pesquise por 3 caracteres do nome, digite o código de 3 dígitos ou selecione a conta analítica obrigatória na lista acima.
                </p>
              </div>

              {/* 3º: Histórico */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Histórico <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Venda de mercadorias conf. pedido 1089 ou Prestação de serviços ref. contrato"
                  value={receivableHistory}
                  onChange={(e) => setReceivableHistory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              {/* 4º: Nº do Documento e 5º: Forma de Pagamento / Cobrança */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nº do Documento
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: DUP-1050, NF-e 45892, BOL-204"
                    value={receivableDocNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      setReceivableDocNumber(val);
                      const numVal = parseFloat(receivableAmount.replace(',', '.'));
                      if (isRecMultipleInstallmentsEnabled && receivableInstallmentCount > 1 && !isNaN(numVal) && numVal > 0) {
                        recalculateRecInstallments(receivableInstallmentCount, numVal, receivableDueDate, val, receivablePaymentMethod, receivableIntervalDays);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:bg-white focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Forma de Cobrança / Recebimento
                  </label>
                  <select
                    value={receivablePaymentMethod}
                    onChange={(e) => {
                      const val = e.target.value;
                      setReceivablePaymentMethod(val);
                      if (isRecMultipleInstallmentsEnabled && receivableInstallmentCount > 1) {
                        setReceivableCustomInstallments((prev) =>
                          prev.map((item) => ({ ...item, paymentMethod: val }))
                        );
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800 focus:bg-white focus:outline-hidden"
                  >
                    <option value="Boleto">Boleto (Padrão)</option>
                    <option value="PIX">PIX</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Crediário">Crediário / A Prazo</option>
                    <option value="Transferência Bancária">Transferência Bancária (TED/DOC)</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
              </div>

              {/* 6º: Valor Total (R$) e 7º: Data de Vencimento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Valor Total (R$) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="0,00"
                    value={receivableAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== '' && !/^[\d.,]*$/.test(val)) return;
                      setReceivableAmount(val);
                      const numVal = parseFloat(val.replace(',', '.'));
                      if (isRecMultipleInstallmentsEnabled && receivableInstallmentCount > 1 && !isNaN(numVal) && numVal > 0) {
                        recalculateRecInstallments(receivableInstallmentCount, numVal, receivableDueDate, receivableDocNumber, receivablePaymentMethod, receivableIntervalDays);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold text-emerald-700 focus:bg-white focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isRecMultipleInstallmentsEnabled && receivableInstallmentCount > 1 ? '1º Vencimento *' : 'Data de Vencimento *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={receivableDueDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setReceivableDueDate(val);
                      const numVal = parseFloat(receivableAmount.replace(',', '.'));
                      if (isRecMultipleInstallmentsEnabled && receivableInstallmentCount > 1 && !isNaN(numVal) && numVal > 0) {
                        recalculateRecInstallments(receivableInstallmentCount, numVal, val, receivableDocNumber, receivablePaymentMethod, receivableIntervalDays);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-medium focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Condição de Recebimento / Múltiplas Parcelas Customizáveis */}
              <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200 space-y-2.5 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-start sm:items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isRecMultipleInstallmentsEnabled
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Layers size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="block font-bold text-slate-800 text-xs">
                          Condição de Recebimento:
                        </label>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isRecMultipleInstallmentsEnabled
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isRecMultipleInstallmentsEnabled
                            ? `${receivableInstallmentCount}x Parcelado`
                            : '1x Parcela Única / À Vista'}
                        </span>
                      </div>
                      <span className="text-[10.5px] text-slate-500 block mt-0.5">
                        Dividida em múltiplas parcelas com datas e valores customizáveis
                      </span>
                    </div>
                  </div>

                  {/* Botão para habilitar / desabilitar parcelas customizáveis */}
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isRecMultipleInstallmentsEnabled;
                        setIsRecMultipleInstallmentsEnabled(next);
                        if (next) {
                          const nextCount = receivableInstallmentCount > 1 ? receivableInstallmentCount : 2;
                          setReceivableInstallmentCount(nextCount);
                          const numVal = parseFloat(receivableAmount.replace(',', '.'));
                          if (!isNaN(numVal) && numVal > 0) {
                            recalculateRecInstallments(
                              nextCount,
                              numVal,
                              receivableDueDate,
                              receivableDocNumber,
                              receivablePaymentMethod,
                              receivableIntervalDays
                            );
                          }
                        } else {
                          setReceivableInstallmentCount(1);
                          setReceivableCustomInstallments([]);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs ${
                        isRecMultipleInstallmentsEnabled
                          ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {isRecMultipleInstallmentsEnabled ? (
                        <>
                          <X size={13} />
                          <span>Voltar para 1 Parcela Única</span>
                        </>
                      ) : (
                        <>
                          <Plus size={13} />
                          <span>Habilitar Múltiplas Parcelas</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Os campos com datas e valores customizáveis APENAS APARECEM caso seja habilitado */}
                {isRecMultipleInstallmentsEnabled && (
                  <div className="pt-2 border-t border-slate-200 space-y-2.5 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-xs font-semibold text-slate-700">
                        Configurar Parcelamento:
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          value={receivableInstallmentCount}
                          onChange={(e) => {
                            const count = parseInt(e.target.value, 10) || 2;
                            setReceivableInstallmentCount(count);
                            const numVal = parseFloat(receivableAmount.replace(',', '.'));
                            if (!isNaN(numVal) && numVal > 0) {
                              recalculateRecInstallments(
                                count,
                                numVal,
                                receivableDueDate,
                                receivableDocNumber,
                                receivablePaymentMethod,
                                receivableIntervalDays
                              );
                            }
                          }}
                          className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-emerald-900 shadow-2xs"
                        >
                          {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => (
                            <option key={n} value={n}>
                              {n}x ({n} Parcelas)
                            </option>
                          ))}
                        </select>

                        <select
                          value={receivableIntervalDays}
                          onChange={(e) => {
                            const interval = parseInt(e.target.value, 10) || 30;
                            setReceivableIntervalDays(interval);
                            const numVal = parseFloat(receivableAmount.replace(',', '.'));
                            if (!isNaN(numVal) && numVal > 0) {
                              recalculateRecInstallments(
                                receivableInstallmentCount,
                                numVal,
                                receivableDueDate,
                                receivableDocNumber,
                                receivablePaymentMethod,
                                interval
                              );
                            }
                          }}
                          className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-medium text-slate-700 shadow-2xs"
                          title="Intervalo entre as parcelas"
                        >
                          <option value={30}>A cada 30 dias (Mensal)</option>
                          <option value={15}>A cada 15 dias (Quinzenal)</option>
                          <option value={7}>A cada 7 dias (Semanal)</option>
                        </select>
                      </div>
                    </div>

                    {/* Grade de Parcelas e Respectivas Datas de Vencimento */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                          <Calendar size={13} className="text-emerald-600" />
                          Datas de Vencimento e Valores Customizáveis:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const numVal = parseFloat(receivableAmount.replace(',', '.'));
                            if (!isNaN(numVal) && numVal > 0) {
                              recalculateRecInstallments(
                                receivableInstallmentCount,
                                numVal,
                                receivableDueDate,
                                receivableDocNumber,
                                receivablePaymentMethod,
                                receivableIntervalDays
                              );
                            }
                          }}
                          className="text-[10px] text-emerald-600 hover:text-emerald-800 font-bold underline cursor-pointer"
                        >
                          Ratear Igualmente
                        </button>
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {receivableCustomInstallments.map((inst, idx) => (
                          <div
                            key={idx}
                            className="grid grid-cols-12 gap-1.5 items-center bg-white p-2 rounded-lg border border-slate-200 text-xs shadow-2xs"
                          >
                            <div className="col-span-2 font-bold text-slate-700">
                              Parc. {inst.installmentNumber}/{receivableInstallmentCount}
                            </div>

                            <div className="col-span-3">
                              <input
                                type="text"
                                placeholder="Nº Doc"
                                value={inst.docNumber}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setReceivableCustomInstallments((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, docNumber: val } : item))
                                  );
                                }}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono font-medium"
                                title="Número do Documento da Parcela"
                              />
                            </div>

                            <div className="col-span-4">
                              <input
                                type="date"
                                required
                                value={inst.dueDate}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setReceivableCustomInstallments((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, dueDate: val } : item))
                                  );
                                }}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-semibold text-slate-800"
                                title="Data de Vencimento desta parcela"
                              />
                            </div>

                            <div className="col-span-3">
                              <div className="relative">
                                <span className="absolute left-1.5 top-1 text-[10px] text-slate-400">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  required
                                  value={inst.amount}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setReceivableCustomInstallments((prev) =>
                                      prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                                    );
                                  }}
                                  className="w-full pl-6 pr-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-bold text-right text-emerald-700"
                                  title="Valor da parcela"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Resumo e conferência */}
                      {(() => {
                        const sumInstallments = receivableCustomInstallments.reduce(
                          (acc, curr) => acc + (Number(curr.amount) || 0),
                          0
                        );
                        const totalNum = parseFloat(receivableAmount.replace(',', '.')) || 0;
                        const diff = Math.round((sumInstallments - totalNum) * 100) / 100;
                        const isExact = Math.abs(diff) < 0.01;

                        return (
                          <div className="flex items-center justify-between pt-1 text-[11px]">
                            <span className="text-slate-600">
                              Soma das Parcelas: <strong>{formatCurrency(sumInstallments)}</strong>
                            </span>
                            <span
                              className={`font-bold flex items-center gap-1 ${
                                isExact ? 'text-emerald-600' : 'text-amber-600'
                              }`}
                            >
                              {isExact ? (
                                <>
                                  <span>✓</span>
                                  <span>Total Exato</span>
                                </>
                              ) : (
                                <>
                                  <span>⚠</span>
                                  <span>
                                    Diferença: {diff > 0 ? '+' : ''}
                                    {formatCurrency(diff)}
                                  </span>
                                </>
                              )}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewReceivableOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check size={15} />
                <span>
                  {isRecMultipleInstallmentsEnabled && receivableInstallmentCount > 1
                    ? `Salvar ${receivableInstallmentCount} Parcelas`
                    : 'Salvar Título a Receber'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Cadastro Rápido de Cliente / Sacado (Sobreposto com z-[60]) */}
      {isQuickCustomerModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-fadeIn">
          <form
            onSubmit={handleSaveQuickCustomer}
            className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto my-auto"
          >
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Building2 size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800 leading-tight">
                    Novo Cliente / Sacado
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Cadastre para selecionar imediatamente no contas a receber
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickCustomerModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Tipo de Pessoa */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo de Cliente</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickCustomerType('PJ')}
                    className={`flex-1 py-1.5 px-3 rounded-lg font-bold border transition-all cursor-pointer ${
                      quickCustomerType === 'PJ'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500 shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Pessoa Jurídica (PJ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickCustomerType('PF')}
                    className={`flex-1 py-1.5 px-3 rounded-lg font-bold border transition-all cursor-pointer ${
                      quickCustomerType === 'PF'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500 shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Pessoa Física (PF)
                  </button>
                </div>
              </div>

              {/* Razão Social / Nome Completo */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {quickCustomerType === 'PJ' ? 'Razão Social *' : 'Nome Completo *'}
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder={quickCustomerType === 'PJ' ? 'Ex: Supermercado Alvorada Ltda' : 'Ex: João da Silva'}
                  value={quickCustomerName}
                  onChange={(e) => setQuickCustomerName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              {/* Nome Fantasia (Opcional) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nome Fantasia / Apelido <span className="font-normal text-slate-400">(Opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Comercial Alvorada"
                  value={quickCustomerTradeName}
                  onChange={(e) => setQuickCustomerTradeName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden"
                />
              </div>

              {/* CNPJ / CPF e Telefone */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {quickCustomerType === 'PJ' ? 'CNPJ' : 'CPF'} <span className="font-normal text-slate-400">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder={quickCustomerType === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                    value={quickCustomerCpfCnpj}
                    onChange={(e) => setQuickCustomerCpfCnpj(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-800 focus:bg-white focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Telefone / WhatsApp <span className="font-normal text-slate-400">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={quickCustomerPhone}
                    onChange={(e) => setQuickCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* E-mail */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  E-mail <span className="font-normal text-slate-400">(Opcional)</span>
                </label>
                <input
                  type="email"
                  placeholder="financeiro@cliente.com.br"
                  value={quickCustomerEmail}
                  onChange={(e) => setQuickCustomerEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden"
                />
              </div>

              {/* Cidade e Estado */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    Cidade <span className="font-normal text-slate-400">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Feira de Santana"
                    value={quickCustomerCity}
                    onChange={(e) => setQuickCustomerCity(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="BA"
                    value={quickCustomerState}
                    onChange={(e) => setQuickCustomerState(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg uppercase text-center font-bold text-slate-800 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsQuickCustomerModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check size={15} />
                <span>Salvar Cliente & Selecionar</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Editar Título a Receber Pré-existente */}
      {editingReceivable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveReceivable}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-3.5"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-800">
                Editar Título a Receber: {editingReceivable.docNumber}
              </h3>
              <button
                type="button"
                onClick={() => setEditingReceivable(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Número do Documento / Título *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: DUP-1050/1"
                  value={recFormData.docNumber}
                  onChange={(e) => setRecFormData({ ...recFormData, docNumber: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome do Cliente / Sacado *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Auto Posto Estrela Ltda"
                  value={recFormData.customerName}
                  onChange={(e) => setRecFormData({ ...recFormData, customerName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Data de Emissão</label>
                  <input
                    type="date"
                    value={recFormData.issueDate}
                    onChange={(e) => setRecFormData({ ...recFormData, issueDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Data de Vencimento *</label>
                  <input
                    type="date"
                    required
                    value={recFormData.dueDate}
                    onChange={(e) => setRecFormData({ ...recFormData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Valor Original (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0,00"
                    value={recFormData.originalValue}
                    onChange={(e) => setRecFormData({ ...recFormData, originalValue: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold text-emerald-700"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Forma de Cobrança</label>
                  <select
                    value={recFormData.paymentMethod}
                    onChange={(e) => setRecFormData({ ...recFormData, paymentMethod: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    <option value="Boleto">Boleto Bancário</option>
                    <option value="Pix">Pix</option>
                    <option value="Crediário">Crediário Próprio</option>
                    <option value="Cartão">Cartão</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Status do Título</label>
                <select
                  value={recFormData.status}
                  onChange={(e) => setRecFormData({ ...recFormData, status: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold"
                >
                  <option value="aberto">Aberto (Não recebido)</option>
                  <option value="parcial">Parcial (Parcialmente pago)</option>
                  <option value="recebido">Recebido / Liquidado</option>
                </select>
                {editingReceivable.paidValue > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Já recebido anteriormente: <strong>{formatCurrency(editingReceivable.paidValue)}</strong>
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingReceivable(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs cursor-pointer"
              >
                Salvar Alterações
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Editar Conta a Pagar */}
      {editingPayable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditedPayable}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-3.5"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-800">
                Editar Conta a Pagar: {editingPayable.docNumber}
              </h3>
              <button
                type="button"
                onClick={() => setEditingPayable(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Doc / Referência *</label>
                <input
                  type="text"
                  required
                  value={payFormData.docNumber}
                  onChange={(e) => setPayFormData({ ...payFormData, docNumber: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Descrição da Obrigação *</label>
                <input
                  type="text"
                  required
                  value={payFormData.description}
                  onChange={(e) => setPayFormData({ ...payFormData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold"
                />
              </div>

              {/* Classificação no Plano de Contas */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-bold text-slate-800">
                    Plano de Contas / Código 3 Dígitos
                  </label>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    payFormData.chartAccountId || payFormData.launchCode
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {payFormData.chartAccountId || payFormData.launchCode ? 'Classificado' : 'Pendente de Classificação'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">3 Dígitos</label>
                    <input
                      type="text"
                      maxLength={3}
                      placeholder="101"
                      value={payFormData.launchCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 3);
                        const acc = analyticalAccounts.find((a) => a.launchCode === val);
                        setPayFormData({
                          ...payFormData,
                          launchCode: val,
                          chartAccountId: acc ? acc.id : payFormData.chartAccountId,
                          chartAccountCode: acc ? acc.hierarchicalCode : payFormData.chartAccountCode,
                          chartAccountName: acc ? acc.name : payFormData.chartAccountName,
                        });
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-center text-xs text-blue-700"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Conta Analítica</label>
                    <select
                      value={payFormData.chartAccountId}
                      onChange={(e) => {
                        const acc = analyticalAccounts.find((a) => a.id === e.target.value);
                        setPayFormData({
                          ...payFormData,
                          chartAccountId: e.target.value,
                          chartAccountCode: acc?.hierarchicalCode || '',
                          launchCode: acc?.launchCode || '',
                          chartAccountName: acc?.name || '',
                        });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs font-semibold"
                    >
                      <option value="">(Pendente de Classificação)</option>
                      {analyticalAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          [{a.launchCode}] {a.hierarchicalCode} - {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Favorecido / Fornecedor</label>
                <input
                  type="text"
                  value={payFormData.supplierName}
                  onChange={(e) => setPayFormData({ ...payFormData, supplierName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Valor Total (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0,00"
                    value={payFormData.originalValue}
                    onChange={(e) => setPayFormData({ ...payFormData, originalValue: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold text-rose-700"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Vencimento *</label>
                  <input
                    type="date"
                    required
                    value={payFormData.dueDate}
                    onChange={(e) => setPayFormData({ ...payFormData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Status da Conta</label>
                <select
                  value={payFormData.status}
                  onChange={(e) => setPayFormData({ ...payFormData, status: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold"
                >
                  <option value="aberto">Aberto (Pendente)</option>
                  <option value="parcial">Parcial (Parcialmente pago)</option>
                  <option value="pago">Pago / Liquidado</option>
                </select>
                {editingPayable.paidValue > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Já liquidado anteriormente: <strong>{formatCurrency(editingPayable.paidValue)}</strong>
                  </p>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={payFormData.notes}
                  onChange={(e) => setPayFormData({ ...payFormData, notes: e.target.value })}
                  placeholder="Informações adicionais..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingPayable(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer"
              >
                Salvar Alterações
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal In-App de Confirmação de Exclusão Financeira */}
      {deleteConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Excluir {deleteConfirmation.type === 'receivable' ? 'Título a Receber' : 'Conta a Pagar'}?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Tem certeza de que deseja remover permanentemente este lançamento financeiro?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Documento:</span>
                <span className="font-mono font-bold text-slate-800">{deleteConfirmation.docNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{deleteConfirmation.type === 'receivable' ? 'Cliente' : 'Descrição'}:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[220px]">{deleteConfirmation.description}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Valor:</span>
                <span className={`font-bold ${deleteConfirmation.type === 'receivable' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {formatCurrency(deleteConfirmation.value)}
                </span>
              </div>
            </div>

            <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
                <span>Sim, Excluir Lançamento</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
