import React, { useState, useMemo, useEffect } from 'react';
import {
  RotateCcw,
  Search,
  Plus,
  Filter,
  Calendar,
  Building2,
  DollarSign,
  Package,
  FileText,
  Printer,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  CreditCard,
  Wallet,
  ArrowRight,
  TrendingDown,
  Sparkles,
  ShoppingBag,
  Smartphone,
  Store,
  Layers,
  HelpCircle,
  Receipt,
  UserCheck,
  Percent,
} from 'lucide-react';
import {
  Order,
  SalesReturn,
  SalesReturnItem,
  SalesReturnReason,
  SalesReturnCondition,
  SalesReturnResolution,
  Company,
  StockLocation,
} from '../../types';
import { Database } from '../../services/db';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { isBonusOrder } from '../../utils/orderUtils';
import { toast } from '../../services/toast';

interface SalesReturnsViewProps {
  initialOrderId?: string;
  onNavigate?: (module: string) => void;
}

const REASON_LABELS: Record<SalesReturnReason, string> = {
  produto_defeito: 'Produto com Defeito',
  produto_danificado: 'Produto Danificado / Avariado',
  produto_incorreto: 'Produto Entregue Incorretamente',
  desistencia_cliente: 'Desistência do Cliente',
  divergencia_pedido: 'Divergência no Pedido',
  outros: 'Outros Motivos',
};

const CONDITION_LABELS: Record<SalesReturnCondition, { label: string; desc: string; color: string }> = {
  revenda: {
    label: 'Em condições de revenda',
    desc: 'Retorna ao saldo vendável do estoque e estorna o CMV na DRE',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  avaria_quarentena: {
    label: 'Com avaria ou em quarentena',
    desc: 'Separado para inspeção/reparo; NÃO aumenta saldo vendável',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  sem_aproveitamento: {
    label: 'Sem aproveitamento / Perda total',
    desc: 'Descarte/perda; NÃO retorna ao estoque vendável nem estorna CMV',
    color: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const RESOLUTION_LABELS: Record<SalesReturnResolution, { label: string; desc: string; icon: React.ReactNode }> = {
  estorno_restituicao: {
    label: 'Restituição / Estorno Imediato',
    desc: 'Devolução de valores ao cliente via Dinheiro, PIX ou Transferência Bancária',
    icon: <Wallet size={16} className="text-amber-600" />,
  },
  credito_cliente: {
    label: 'Crédito para o Cliente',
    desc: 'Saldo mantido na conta corrente do cliente para abater em compras futuras',
    icon: <CreditCard size={16} className="text-indigo-600" />,
  },
  abatimento_receber: {
    label: 'Abatimento em Contas a Receber',
    desc: 'Redução proporcional nos títulos a prazo em aberto vinculados à venda',
    icon: <TrendingDown size={16} className="text-cyan-600" />,
  },
};

export const SalesReturnsView: React.FC<SalesReturnsViewProps> = ({
  initialOrderId,
}) => {
  const [dbState, setDbState] = useState(() => Database.getState());
  const currentCompany = Database.getCurrentCompany();
  const companies = dbState.companies || [];

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedReason, setSelectedReason] = useState<string>('all');
  const [dateFilterMode, setDateFilterMode] = useState<'30dias' | 'mes_atual' | 'ano_atual' | 'custom'>('30dias');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Modais
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedReturnDetails, setSelectedReturnDetails] = useState<SalesReturn | null>(null);
  const [selectedReturnReceipt, setSelectedReturnReceipt] = useState<SalesReturn | null>(null);
  const [returnToCancel, setReturnToCancel] = useState<SalesReturn | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState('');

  // Estado do assistente de Nova Devolução
  const [newStep, setNewStep] = useState<1 | 2 | 3 | 4>(1);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [selectedOrderForReturn, setSelectedOrderForReturn] = useState<Order | null>(null);

  // Itens selecionados no formulário de devolução
  const [itemsToReturn, setItemsToReturn] = useState<
    Record<
      string,
      {
        selected: boolean;
        quantity: number;
        condition: SalesReturnCondition;
        locationId: string;
        notes: string;
      }
    >
  >({});
  const [returnReason, setReturnReason] = useState<SalesReturnReason>('produto_defeito');
  const [returnReasonDetails, setReturnReasonDetails] = useState('');
  const [financialResolution, setFinancialResolution] = useState<SalesReturnResolution>('estorno_restituicao');
  const [refundMethod, setRefundMethod] = useState('dinheiro');
  const [fiscalDocNumber, setFiscalDocNumber] = useState('');
  const [fiscalAccessKey, setFiscalAccessKey] = useState('');
  const [fiscalNotes, setFiscalNotes] = useState('');

  // Se veio com initialOrderId, abre o modal direto
  useEffect(() => {
    if (initialOrderId) {
      const ord = (dbState.orders || []).find((o) => o.id === initialOrderId);
      if (ord) {
        handleOpenNewReturnWithOrder(ord);
      }
    }
  }, [initialOrderId]);

  // Lista de devoluções filtradas
  const salesReturns = useMemo(() => {
    let list = dbState.salesReturns || [];

    if (selectedCompanyId !== 'all') {
      list = list.filter((r) => r.companyId === selectedCompanyId);
    }

    if (selectedChannel !== 'all') {
      if (selectedChannel === 'pdv') {
        list = list.filter((r) => r.origin === 'pdv' || r.origin === 'balcao');
      } else if (selectedChannel === 'mobile') {
        list = list.filter((r) => r.origin === 'externa_celular');
      } else if (selectedChannel === 'pedido') {
        list = list.filter((r) => r.origin === 'pedidos_venda' || r.origin === 'retaguarda_pedido');
      }
    }

    if (selectedStatus !== 'all') {
      list = list.filter((r) => r.status === selectedStatus);
    }

    if (selectedReason !== 'all') {
      list = list.filter((r) => r.reason === selectedReason);
    }

    // Filtro de data
    if (startDate) {
      list = list.filter((r) => (r.date || r.createdAt || '').slice(0, 10) >= startDate);
    }
    if (endDate) {
      list = list.filter((r) => (r.date || r.createdAt || '').slice(0, 10) <= endDate);
    }

    // Pesquisa textual
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter((r) => {
        return (
          r.number.toLowerCase().includes(q) ||
          r.orderNumber.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          (r.customerCpfCnpj && r.customerCpfCnpj.includes(q))
        );
      });
    }

    return [...list].sort(
      (a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()
    );
  }, [
    dbState.salesReturns,
    selectedCompanyId,
    selectedChannel,
    selectedStatus,
    selectedReason,
    startDate,
    endDate,
    searchTerm,
  ]);

  // Indicadores de KPI
  const kpiStats = useMemo(() => {
    const totalCount = salesReturns.filter((r) => r.status === 'concluida').length;
    const totalValue = salesReturns
      .filter((r) => r.status === 'concluida')
      .reduce((sum, r) => sum + (r.totalReturned || 0), 0);

    let totalItemsReturned = 0;
    salesReturns
      .filter((r) => r.status === 'concluida')
      .forEach((r) => {
        (r.items || []).forEach((item) => {
          totalItemsReturned += item.quantity || 0;
        });
      });

    // Faturamento bruto do período para percentual (exclui bonificações sem faturamento)
    const grossSalesInPeriod = (dbState.orders || [])
      .filter((o) => {
        if (o.type === 'orcamento' || o.status === 'cancelado' || isBonusOrder(o)) return false;
        if (selectedCompanyId !== 'all' && o.companyId !== selectedCompanyId) return false;
        const d = (o.createdAt || '').slice(0, 10);
        return d >= startDate && d <= endDate;
      })
      .reduce((acc, o) => acc + (o.total || 0), 0);

    const returnPercentage = grossSalesInPeriod > 0 ? (totalValue / grossSalesInPeriod) * 100 : 0;

    return {
      totalCount,
      totalValue,
      totalItemsReturned,
      returnPercentage,
      grossSalesInPeriod,
    };
  }, [salesReturns, dbState.orders, selectedCompanyId, startDate, endDate]);

  // Pedidos elegíveis para devolução (concluídos, não cancelados, não bonificação, com itens que possuem saldo disponível)
  const eligibleOrders = useMemo(() => {
    const q = orderSearchQuery.toLowerCase().trim();
    return (dbState.orders || [])
      .filter((ord) => {
        if (ord.type === 'orcamento') return false;
        if (ord.status === 'cancelado') return false;
        if (isBonusOrder(ord)) return false;
        if (ord.returnStatus === 'devolucao_total') return false;

        // Verifica se tem ao menos 1 item com saldo a devolver
        const hasAvailableItems = (ord.items || []).some((item) => {
          const retQty = item.returnedQuantity || 0;
          return item.quantity > retQty;
        });
        if (!hasAvailableItems) return false;

        if (q) {
          const matchNumber = ord.number.toLowerCase().includes(q);
          const matchClient = ord.customerName.toLowerCase().includes(q);
          const matchDoc = ord.customerCpfCnpj && ord.customerCpfCnpj.includes(q);
          return matchNumber || matchClient || matchDoc;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
      .slice(0, 30);
  }, [dbState.orders, orderSearchQuery]);

  // Locais de estoque disponíveis para a empresa da venda
  const availableLocations = useMemo(() => {
    const compId = selectedOrderForReturn?.companyId || currentCompany.id;
    return Database.getStockLocations(compId).filter((l) => l.status === 'ativo');
  }, [selectedOrderForReturn, currentCompany, dbState.stockLocations]);

  // Abertura do modal de nova devolução
  const handleOpenNewReturn = () => {
    setSelectedOrderForReturn(null);
    setItemsToReturn({});
    setOrderSearchQuery('');
    setReturnReason('produto_defeito');
    setReturnReasonDetails('');
    setFinancialResolution('estorno_restituicao');
    setRefundMethod('dinheiro');
    setFiscalDocNumber('');
    setFiscalAccessKey('');
    setFiscalNotes('');
    setNewStep(1);
    setShowNewModal(true);
  };

  const handleOpenNewReturnWithOrder = (order: Order) => {
    setSelectedOrderForReturn(order);
    const initialMap: Record<
      string,
      {
        selected: boolean;
        quantity: number;
        condition: SalesReturnCondition;
        locationId: string;
        notes: string;
      }
    > = {};

    const defaultLoc =
      availableLocations.find((l) => l.type === 'comercial' || l.type === 'revenda') ||
      availableLocations[0];

    (order.items || []).forEach((item) => {
      const avail = Math.max(0, item.quantity - (item.returnedQuantity || 0));
      initialMap[item.id] = {
        selected: avail > 0,
        quantity: avail,
        condition: 'revenda',
        locationId: item.locationId || defaultLoc?.id || 'loc-comercial',
        notes: '',
      };
    });

    setItemsToReturn(initialMap);
    setReturnReason('produto_defeito');
    setReturnReasonDetails('');
    setFinancialResolution(order.paymentMethod === 'boleto' || order.paymentMethod === 'crediario' ? 'abatimento_receber' : 'estorno_restituicao');
    setRefundMethod(order.paymentMethod || 'dinheiro');
    setNewStep(2);
    setShowNewModal(true);
  };

  const handleSelectOrderInStep1 = (order: Order) => {
    handleOpenNewReturnWithOrder(order);
  };

  // Cálculo ao vivo dos totais do formulário de devolução
  const returnFormTotals = useMemo(() => {
    if (!selectedOrderForReturn) {
      return {
        subtotal: 0,
        discount: 0,
        netTotal: 0,
        cmvReversed: 0,
        cmvLost: 0,
        hasSelectedItems: false,
        isTotalReturn: false,
      };
    }

    let subtotal = 0;
    let discount = 0;
    let cmvReversed = 0;
    let cmvLost = 0;
    let hasSelected = false;
    let totalItemsOriginalQty = 0;
    let totalItemsReturnedAfterThis = 0;

    selectedOrderForReturn.items.forEach((item) => {
      totalItemsOriginalQty += item.quantity;
      const prevRet = item.returnedQuantity || 0;
      const state = itemsToReturn[item.id];

      if (state && state.selected && state.quantity > 0) {
        hasSelected = true;
        const qty = state.quantity;
        const unitDisc = item.quantity > 0 ? (item.discountValue || 0) / item.quantity : 0;
        const itemTotPrice = qty * item.unitPrice;
        const itemTotDisc = qty * unitDisc;
        const unitCost = item.unitCost || 0;

        subtotal += itemTotPrice;
        discount += itemTotDisc;

        if (state.condition === 'revenda') {
          cmvReversed += qty * unitCost;
        } else {
          cmvLost += qty * unitCost;
        }

        totalItemsReturnedAfterThis += prevRet + qty;
      } else {
        totalItemsReturnedAfterThis += prevRet;
      }
    });

    const netTotal = Math.max(0, subtotal - discount);
    const isTotalReturn = totalItemsReturnedAfterThis >= totalItemsOriginalQty;

    return {
      subtotal,
      discount,
      netTotal,
      cmvReversed,
      cmvLost,
      hasSelectedItems: hasSelected,
      isTotalReturn,
    };
  }, [selectedOrderForReturn, itemsToReturn]);

  // Selecionar/deselecionar todos os itens
  const handleToggleSelectAll = (select: boolean) => {
    if (!selectedOrderForReturn) return;
    setItemsToReturn((prev) => {
      const next = { ...prev };
      selectedOrderForReturn.items.forEach((item) => {
        const avail = Math.max(0, item.quantity - (item.returnedQuantity || 0));
        if (next[item.id]) {
          next[item.id].selected = select && avail > 0;
          if (select) {
            next[item.id].quantity = avail;
          }
        }
      });
      return next;
    });
  };

  // Submissão da Nova Devolução
  const handleConfirmCreateReturn = () => {
    if (!selectedOrderForReturn) return;
    if (!returnFormTotals.hasSelectedItems) {
      toast.warning('Selecione ao menos um produto com quantidade superior a zero para devolver.');
      return;
    }

    const payloadItems: Array<{
      orderItemId: string;
      quantity: number;
      condition: SalesReturnCondition;
      locationId: string;
      notes?: string;
    }> = [];

    for (const item of selectedOrderForReturn.items) {
      const state = itemsToReturn[item.id];
      if (state && state.selected && state.quantity > 0) {
        payloadItems.push({
          orderItemId: item.id,
          quantity: state.quantity,
          condition: state.condition,
          locationId: state.locationId,
          notes: state.notes,
        });
      }
    }

    try {
      const created = Database.createSalesReturn({
        orderId: selectedOrderForReturn.id,
        reason: returnReason,
        reasonDetails: returnReasonDetails,
        financialResolution: financialResolution,
        refundMethod: refundMethod,
        items: payloadItems,
        fiscalDocNumber: fiscalDocNumber.trim() || undefined,
        fiscalAccessKey: fiscalAccessKey.trim() || undefined,
        fiscalNotes: fiscalNotes.trim() || undefined,
      });

      toast.success(
        `Devolução ${created.number} registrada com sucesso! Valor total: ${formatCurrency(created.totalReturned)}.`
      );

      setShowNewModal(false);
      setSelectedReturnReceipt(created);
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao processar a devolução de vendas.');
    }
  };

  // Cancelamento de devolução
  const handleConfirmCancelReturn = () => {
    if (!returnToCancel) return;
    if (!cancelReasonText.trim()) {
      toast.warning('É obrigatório informar o motivo do cancelamento da devolução.');
      return;
    }

    try {
      const success = Database.cancelSalesReturn(returnToCancel.id, cancelReasonText.trim());
      if (success) {
        toast.success(`Devolução ${returnToCancel.number} cancelada com sucesso! Todos os movimentos de estoque e financeiros foram revertidos.`);
        setReturnToCancel(null);
        setCancelReasonText('');
      } else {
        toast.error('Não foi possível cancelar a devolução selecionada.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao cancelar a devolução.');
    }
  };

  // Atalhos de filtro de período
  const handleApplyDateShortcut = (mode: '30dias' | 'mes_atual' | 'ano_atual') => {
    setDateFilterMode(mode);
    const now = new Date();
    if (mode === '30dias') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setStartDate(d.toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    } else if (mode === 'mes_atual') {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      setStartDate(`${y}-${m}-01`);
      setEndDate(now.toISOString().slice(0, 10));
    } else if (mode === 'ano_atual') {
      const y = now.getFullYear();
      setStartDate(`${y}-01-01`);
      setEndDate(now.toISOString().slice(0, 10));
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-7rem)]">
      {/* ======================================================== */}
      {/* 1. CABEÇALHO DA TELA                                     */}
      {/* ======================================================== */}
      <div className="shrink-0 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-sm">
              <RotateCcw size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Devolução de Vendas
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  Total ou Parcial
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Rastreabilidade de vendas Mobile, PDV Balcão e Pedidos de Venda com estorno de estoque, restituição financeira e DRE.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenNewReturn}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm hover:shadow transition-all"
          >
            <Plus size={16} />
            <span>Nova Devolução</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. CARDS DE KPI & INDICADORES                            */}
      {/* ======================================================== */}
      <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Total de Devoluções</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">
              {kpiStats.totalCount}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">No período selecionado</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <RotateCcw size={22} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Valor Total Devolvido</span>
            <span className="text-2xl font-black text-rose-600 mt-1 block">
              {formatCurrency(kpiStats.totalValue)}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Dedução da Receita Bruta (DRE)</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
            <DollarSign size={22} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Qtd Itens Devolvidos</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">
              {formatQuantity(kpiStats.totalItemsReturned)}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Unidades movimentadas</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Package size={22} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">% sobre Faturamento</span>
            <span className="text-2xl font-black text-amber-600 mt-1 block">
              {kpiStats.returnPercentage.toFixed(2)}%
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Fat. Bruto: {formatCurrency(kpiStats.grossSalesInPeriod)}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Percent size={22} />
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. BARRA DE FILTROS AVANÇADOS                            */}
      {/* ======================================================== */}
      <div className="shrink-0 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Busca textual */}
          <div className="md:col-span-2 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por Nº Devolução, Nº Pedido, Cliente ou CPF/CNPJ..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none transition-all"
            />
          </div>

          {/* Empresa / Filial */}
          <div>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
            >
              <option value="all">Todas as Empresas (Consolidado)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.tradeName || c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Canal de Origem */}
          <div>
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none transition-all cursor-pointer"
            >
              <option value="all">Todos os Canais de Venda</option>
              <option value="pdv">PDV Balcão</option>
              <option value="mobile">Venda Mobile (Celular)</option>
              <option value="pedido">Pedido de Venda (Retaguarda)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          {/* Período e Atalhos */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Calendar size={14} className="text-slate-400" />
              Período:
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDateFilterMode('custom');
              }}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700"
            />
            <span className="text-slate-400">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDateFilterMode('custom');
              }}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700"
            />

            <div className="flex items-center gap-1 ml-2">
              <button
                type="button"
                onClick={() => handleApplyDateShortcut('30dias')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  dateFilterMode === '30dias'
                    ? 'bg-blue-100 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Últimos 30 dias
              </button>
              <button
                type="button"
                onClick={() => handleApplyDateShortcut('mes_atual')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  dateFilterMode === 'mes_atual'
                    ? 'bg-blue-100 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Este Mês
              </button>
              <button
                type="button"
                onClick={() => handleApplyDateShortcut('ano_atual')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  dateFilterMode === 'ano_atual'
                    ? 'bg-blue-100 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Este Ano
              </button>
            </div>
          </div>

          {/* Filtros secundários: Situação e Motivo */}
          <div className="flex items-center gap-2">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="py-1 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 cursor-pointer"
            >
              <option value="all">Todas as Situações</option>
              <option value="concluida">Concluída</option>
              <option value="cancelada">Cancelada</option>
            </select>

            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="py-1 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 cursor-pointer"
            >
              <option value="all">Todos os Motivos</option>
              <option value="produto_defeito">Produto com Defeito</option>
              <option value="produto_danificado">Produto Danificado</option>
              <option value="produto_incorreto">Produto Incorreto</option>
              <option value="desistencia_cliente">Desistência</option>
              <option value="divergencia_pedido">Divergência</option>
              <option value="outros">Outros</option>
            </select>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. TABELA DE DEVOLUÇÕES REGISTRADAS                      */}
      {/* ======================================================== */}
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="shrink-0 p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">Histórico de Devoluções</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
              {salesReturns.length} registro(s)
            </span>
          </div>
          <span className="text-xs text-slate-400">
            Mostrando resultados ordenados por data decrescente
          </span>
        </div>

        <div className="flex-1 min-h-[280px] overflow-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-3 px-4">Nº Devolução</th>
                <th className="py-3 px-3">Data / Hora</th>
                <th className="py-3 px-3">Pedido Origem</th>
                <th className="py-3 px-3">Canal</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-3">Tipo / Motivo</th>
                <th className="py-3 px-3">Resolução</th>
                <th className="py-3 px-3 text-right">Valor Devolvido</th>
                <th className="py-3 px-3 text-center">Situação</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {salesReturns.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RotateCcw size={36} className="mx-auto mb-2 opacity-30" />
                    <p className="font-medium text-slate-500">Nenhuma devolução encontrada para os filtros selecionados.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Clique em "+ Nova Devolução" para registrar a devolução de um pedido elegível.
                    </p>
                  </td>
                </tr>
              ) : (
                salesReturns.map((ret) => {
                  const dateFormatted = new Date(ret.date || ret.createdAt).toLocaleDateString('pt-BR');
                  const timeFormatted = new Date(ret.date || ret.createdAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  // Badge do canal
                  let channelBadge = (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      <Store size={11} /> PDV Balcão
                    </span>
                  );
                  if (ret.origin === 'externa_celular') {
                    channelBadge = (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">
                        <Smartphone size={11} /> Mobile
                      </span>
                    );
                  } else if (ret.origin === 'pedidos_venda' || ret.origin === 'retaguarda_pedido') {
                    channelBadge = (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <ShoppingBag size={11} /> Pedido
                      </span>
                    );
                  }

                  // Badge da resolução
                  const resInfo = RESOLUTION_LABELS[ret.financialResolution] || {
                    label: 'Restituição',
                    desc: '',
                    icon: null,
                  };

                  return (
                    <tr key={ret.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {ret.number}
                      </td>
                      <td className="py-3 px-3">
                        <span className="block font-medium text-slate-800">{dateFormatted}</span>
                        <span className="text-[10px] text-slate-400">{timeFormatted}</span>
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-blue-600">
                        {ret.orderNumber}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">{channelBadge}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-900 block truncate max-w-[180px]">
                          {ret.customerName}
                        </span>
                        {ret.customerCpfCnpj && (
                          <span className="text-[10px] text-slate-400 block">{ret.customerCpfCnpj}</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                          {ret.returnType === 'total' ? 'Total' : 'Parcial'}
                        </span>
                        <span className="text-[11px] text-slate-500 block mt-0.5 truncate max-w-[150px]">
                          {REASON_LABELS[ret.reason] || ret.reason}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5" title={resInfo.desc}>
                          {resInfo.icon}
                          <span className="text-[11px] font-medium text-slate-800">
                            {ret.financialResolution === 'estorno_restituicao'
                              ? `Restituição (${ret.refundMethod || 'Dinheiro'})`
                              : ret.financialResolution === 'credito_cliente'
                              ? 'Crédito Cliente'
                              : 'Abatimento'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-rose-600 text-xs">
                        {formatCurrency(ret.totalReturned)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {ret.status === 'concluida' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={11} /> Concluída
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle size={11} /> Cancelada
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Detalhes */}
                          <button
                            type="button"
                            onClick={() => setSelectedReturnDetails(ret)}
                            className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors cursor-pointer"
                            title="Visualizar Detalhes"
                          >
                            <Eye size={15} />
                          </button>

                          {/* Comprovante */}
                          <button
                            type="button"
                            onClick={() => setSelectedReturnReceipt(ret)}
                            className="p-1.5 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="Imprimir Comprovante / Termo"
                          >
                            <Printer size={15} />
                          </button>

                          {/* Cancelar devolução */}
                          {ret.status === 'concluida' && (
                            <button
                              type="button"
                              onClick={() => {
                                setReturnToCancel(ret);
                                setCancelReasonText('');
                              }}
                              className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors cursor-pointer"
                              title="Cancelar Devolução (Estornar e Restaurar Venda)"
                            >
                              <XCircle size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 5. MODAL: NOVA DEVOLUÇÃO (WIZARD COMPLETO)               */}
      {/* ======================================================== */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Cabeçalho do modal */}
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <RotateCcw size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Lançar Nova Devolução de Venda
                  </h3>
                  <p className="text-xs text-slate-500">
                    Etapa {newStep} de 3: {newStep === 1 ? 'Selecionar Venda Original' : newStep === 2 ? 'Definir Itens e Quantidades' : 'Resolução Financeira & Confirmação'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Conteúdo dinâmico das etapas */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* ETAPA 1: Localizar Venda Original */}
              {newStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-blue-50/60 border border-blue-200/80 rounded-2xl p-4 text-xs text-blue-900 flex items-start gap-3">
                    <HelpCircle size={18} className="text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Como funciona a localização da venda:</span>
                      Pesquise pelo número do pedido, nome do cliente ou CPF/CNPJ. Apenas vendas efetivamente concluídas com produtos elegíveis são exibidas.
                    </div>
                  </div>

                  <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={orderSearchQuery}
                      onChange={(e) => setOrderSearchQuery(e.target.value)}
                      placeholder="Pesquise por Nº do Pedido (Ex: PED-2026-0012, VD-2026-0001) ou Cliente..."
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none transition-all"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {eligibleOrders.length === 0 ? (
                      <div className="text-center py-10 text-slate-400">
                        <ShoppingBag size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="text-xs font-medium">Nenhum pedido elegível para devolução encontrado.</p>
                      </div>
                    ) : (
                      eligibleOrders.map((ord) => {
                        let originLabel = 'PDV Balcão';
                        if (ord.origin === 'externa_celular') originLabel = 'Venda Mobile (Celular)';
                        else if (ord.origin === 'pedidos_venda' || ord.origin === 'retaguarda_pedido') originLabel = 'Pedido de Venda (Retaguarda)';

                        return (
                          <div
                            key={ord.id}
                            onClick={() => handleSelectOrderInStep1(ord)}
                            className="p-4 rounded-2xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/30 transition-all cursor-pointer flex items-center justify-between gap-4 group"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900 text-xs">
                                  {ord.number}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">
                                  {originLabel}
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {new Date(ord.createdAt).toLocaleDateString('pt-BR')}
                                </span>
                              </div>
                              <p className="text-xs font-semibold text-slate-800">
                                Cliente: {ord.customerName}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {ord.items.length} produto(s) • Vendedor: {ord.userName || 'Interno'} • Pagamento: {ord.paymentMethod.toUpperCase()}
                              </p>
                            </div>

                            <div className="text-right flex items-center gap-3">
                              <div>
                                <span className="text-xs font-black text-slate-900 block">
                                  {formatCurrency(ord.total)}
                                </span>
                                <span className="text-[10px] font-bold text-emerald-600 uppercase">
                                  {ord.returnStatus ? ord.returnStatus.replace('_', ' ') : 'Disponível'}
                                </span>
                              </div>
                              <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center text-slate-400 transition-colors">
                                <ArrowRight size={14} />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* ETAPA 2: Definir Itens e Quantidades */}
              {newStep === 2 && selectedOrderForReturn && (
                <div className="space-y-6">
                  {/* Banner da venda selecionada */}
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 font-medium">Venda Original: </span>
                      <strong className="font-mono text-slate-900 text-sm">{selectedOrderForReturn.number}</strong>
                      <span className="mx-2 text-slate-300">•</span>
                      <span className="text-slate-600">Cliente: <strong>{selectedOrderForReturn.customerName}</strong></span>
                      <span className="mx-2 text-slate-300">•</span>
                      <span className="text-slate-600">Data: {new Date(selectedOrderForReturn.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setNewStep(1)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline cursor-pointer"
                    >
                      Trocar Pedido
                    </button>
                  </div>

                  {/* Tabela de itens da venda */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Produtos da Venda Elegíveis para Devolução
                      </h4>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectAll(true)}
                          className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                        >
                          Selecionar Todos (Devolução Total)
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={() => handleToggleSelectAll(false)}
                          className="text-[11px] font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          Limpar Seleção
                        </button>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3 text-center w-10">Sel.</th>
                            <th className="py-2.5 px-3">Produto</th>
                            <th className="py-2.5 px-3 text-center">Qtd Vendida</th>
                            <th className="py-2.5 px-3 text-center">Já Devolvida</th>
                            <th className="py-2.5 px-3 text-center">Disponível</th>
                            <th className="py-2.5 px-3 text-center w-24">Qtd Devolver</th>
                            <th className="py-2.5 px-3 text-right">Preço Venda</th>
                            <th className="py-2.5 px-3">Condição do Produto</th>
                            <th className="py-2.5 px-3 text-right">Total Líquido</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {selectedOrderForReturn.items.map((item) => {
                            const prevRet = item.returnedQuantity || 0;
                            const avail = Math.max(0, item.quantity - prevRet);
                            const state = itemsToReturn[item.id] || {
                              selected: false,
                              quantity: avail,
                              condition: 'revenda',
                              locationId: 'loc-comercial',
                              notes: '',
                            };

                            const isEligible = avail > 0;
                            const unitDisc = item.quantity > 0 ? (item.discountValue || 0) / item.quantity : 0;
                            const itemNetTotal = Math.max(0, state.quantity * (item.unitPrice - unitDisc));

                            return (
                              <tr
                                key={item.id}
                                className={`${state.selected ? 'bg-blue-50/30' : ''} ${
                                  !isEligible ? 'opacity-40 bg-slate-50' : 'hover:bg-slate-50/50'
                                }`}
                              >
                                <td className="py-3 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={state.selected}
                                    disabled={!isEligible}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setItemsToReturn((prev) => ({
                                        ...prev,
                                        [item.id]: {
                                          ...state,
                                          selected: checked,
                                          quantity: checked && state.quantity === 0 ? avail : state.quantity,
                                        },
                                      }));
                                    }}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                                  />
                                </td>
                                <td className="py-3 px-3">
                                  <span className="font-semibold text-slate-900 block">{item.description}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    Cód: {item.productCode || item.code || '-'} • Un: {item.unit}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-center font-medium">{formatQuantity(item.quantity)}</td>
                                <td className="py-3 px-3 text-center text-slate-500 font-medium">
                                  {formatQuantity(prevRet)}
                                </td>
                                <td className="py-3 px-3 text-center font-bold text-blue-600">
                                  {formatQuantity(avail)}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    max={avail}
                                    value={state.quantity}
                                    disabled={!state.selected || !isEligible}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      const clamped = Math.min(avail, Math.max(0, val));
                                      setItemsToReturn((prev) => ({
                                        ...prev,
                                        [item.id]: {
                                          ...state,
                                          quantity: clamped,
                                        },
                                      }));
                                    }}
                                    className="w-20 px-2 py-1 text-center font-bold text-xs bg-white border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                                  />
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <span className="font-medium text-slate-900 block">{formatCurrency(item.unitPrice)}</span>
                                  {unitDisc > 0 && (
                                    <span className="text-[10px] text-rose-500 font-medium block">
                                      Desc: -{formatCurrency(unitDisc)}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <select
                                    value={state.condition}
                                    disabled={!state.selected || !isEligible}
                                    onChange={(e) => {
                                      const cond = e.target.value as SalesReturnCondition;
                                      setItemsToReturn((prev) => ({
                                        ...prev,
                                        [item.id]: {
                                          ...state,
                                          condition: cond,
                                        },
                                      }));
                                    }}
                                    className="py-1 px-2 text-[11px] bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none cursor-pointer disabled:bg-slate-100"
                                  >
                                    <option value="revenda">Revenda (Retorna ao estoque)</option>
                                    <option value="avaria_quarentena">Avaria / Quarentena (Separado)</option>
                                    <option value="sem_aproveitamento">Sem aproveitamento (Perda)</option>
                                  </select>
                                </td>
                                <td className="py-3 px-3 text-right font-bold text-slate-900">
                                  {state.selected ? formatCurrency(itemNetTotal) : 'R$ 0,00'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Motivo e detalhes da devolução */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Motivo da Devolução *
                      </label>
                      <select
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value as SalesReturnReason)}
                        className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none cursor-pointer"
                      >
                        <option value="produto_defeito">Produto com Defeito</option>
                        <option value="produto_danificado">Produto Danificado / Avariado no Transporte</option>
                        <option value="produto_incorreto">Produto Entregue Incorretamente / Trocado</option>
                        <option value="desistencia_cliente">Desistência do Cliente (Arrependimento CDC)</option>
                        <option value="divergencia_pedido">Divergência entre Pedido e Nota/Entrega</option>
                        <option value="outros">Outros Motivos</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Observações Adicionais / Justificativa
                      </label>
                      <input
                        type="text"
                        value={returnReasonDetails}
                        onChange={(e) => setReturnReasonDetails(e.target.value)}
                        placeholder="Ex: Frasco com lacre violado, cliente solicitou troca..."
                        className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ETAPA 3: Resolução Financeira e Confirmação */}
              {newStep === 3 && selectedOrderForReturn && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                      Como será realizada a resolução financeira desta devolução?
                    </h4>
                    <p className="text-xs text-slate-500 mb-4">
                      Selecione a forma de acerto com o cliente. O sistema realizará as integrações contábeis e financeiras automaticamente sem duplicar despesas na DRE.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Opção 1: Restituição Imediata */}
                      <label
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                          financialResolution === 'estorno_restituicao'
                            ? 'border-amber-500 bg-amber-50/30 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                              <Wallet size={16} />
                            </div>
                            <input
                              type="radio"
                              name="resolution"
                              value="estorno_restituicao"
                              checked={financialResolution === 'estorno_restituicao'}
                              onChange={() => setFinancialResolution('estorno_restituicao')}
                              className="text-amber-600 focus:ring-amber-500"
                            />
                          </div>
                          <span className="font-bold text-xs text-slate-900 block">
                            Restituição / Estorno ao Cliente
                          </span>
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            Devolução imediata do valor ao cliente em dinheiro físico do caixa ou via PIX / transferência.
                          </p>
                        </div>
                      </label>

                      {/* Opção 2: Crédito para o Cliente */}
                      <label
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                          financialResolution === 'credito_cliente'
                            ? 'border-indigo-500 bg-indigo-50/30 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                              <CreditCard size={16} />
                            </div>
                            <input
                              type="radio"
                              name="resolution"
                              value="credito_cliente"
                              checked={financialResolution === 'credito_cliente'}
                              onChange={() => setFinancialResolution('credito_cliente')}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                          </div>
                          <span className="font-bold text-xs text-slate-900 block">
                            Crédito para o Cliente
                          </span>
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            Mantém o valor devolvido na conta do cliente como saldo positivo para abater em vendas futuras.
                          </p>
                        </div>
                      </label>

                      {/* Opção 3: Abatimento de Títulos a Receber */}
                      <label
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                          financialResolution === 'abatimento_receber'
                            ? 'border-cyan-500 bg-cyan-50/30 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-700 flex items-center justify-center">
                              <TrendingDown size={16} />
                            </div>
                            <input
                              type="radio"
                              name="resolution"
                              value="abatimento_receber"
                              checked={financialResolution === 'abatimento_receber'}
                              onChange={() => setFinancialResolution('abatimento_receber')}
                              className="text-cyan-600 focus:ring-cyan-500"
                            />
                          </div>
                          <span className="font-bold text-xs text-slate-900 block">
                            Abatimento a Receber
                          </span>
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            Abate proporcionalmente títulos a prazo em aberto (boletos/duplicatas) vinculados a este pedido.
                          </p>
                        </div>
                      </label>
                    </div>

                    {financialResolution === 'estorno_restituicao' && (
                      <div className="mt-4 p-4 rounded-xl bg-amber-50/40 border border-amber-200/80 flex items-center gap-3">
                        <label className="text-xs font-bold text-amber-900 whitespace-nowrap">
                          Forma de Restituição:
                        </label>
                        <select
                          value={refundMethod}
                          onChange={(e) => setRefundMethod(e.target.value)}
                          className="py-1.5 px-3 bg-white border border-amber-300 rounded-lg text-xs text-slate-800 focus:outline-none cursor-pointer"
                        >
                          <option value="dinheiro">Dinheiro (Caixa Balcão)</option>
                          <option value="pix">PIX / Transferência Instantânea</option>
                          <option value="cartao_estorno">Estorno de Cartão (Gateway / TEF)</option>
                          <option value="transferencia">Transferência Bancária (TED/DOC)</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Informações Fiscais Opcionais */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <span className="text-xs font-bold text-slate-900 block flex items-center gap-1.5">
                      <FileText size={14} className="text-slate-500" />
                      Informações do Documento Fiscal de Devolução (Opcional)
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-1">Nº Nota Fiscal de Entrada / Devolução</label>
                        <input
                          type="text"
                          value={fiscalDocNumber}
                          onChange={(e) => setFiscalDocNumber(e.target.value)}
                          placeholder="Ex: NF-e 004589"
                          className="w-full py-1.5 px-3 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-1">Chave de Acesso SEFAZ (44 dígitos)</label>
                        <input
                          type="text"
                          maxLength={44}
                          value={fiscalAccessKey}
                          onChange={(e) => setFiscalAccessKey(e.target.value)}
                          placeholder="352601..."
                          className="w-full py-1.5 px-3 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Resumo Final dos Totais */}
                  <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs text-slate-400">Modalidade:</span>
                      <span className="text-xs font-bold text-amber-400">
                        {returnFormTotals.isTotalReturn ? 'DEVOLUÇÃO TOTAL' : 'DEVOLUÇÃO PARCIAL'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Subtotal dos Itens:</span>
                      <span className="font-semibold">{formatCurrency(returnFormTotals.subtotal)}</span>
                    </div>

                    {returnFormTotals.discount > 0 && (
                      <div className="flex items-center justify-between text-xs text-rose-400">
                        <span>(-) Descontos Comerciais Proporcionais:</span>
                        <span>-{formatCurrency(returnFormTotals.discount)}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      <div>
                        <span className="text-sm font-bold block">Valor Total a Devolver:</span>
                        <span className="text-[11px] text-slate-400">
                          Estorno CMV DRE estimado: {formatCurrency(returnFormTotals.cmvReversed)}
                        </span>
                      </div>
                      <span className="text-xl font-black text-emerald-400">
                        {formatCurrency(returnFormTotals.netTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé com navegação entre etapas */}
            <div className="p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                {newStep > 1 && (
                  <button
                    type="button"
                    onClick={() => setNewStep((prev) => (prev - 1) as any)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    Voltar
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>

                {newStep === 1 ? (
                  <button
                    type="button"
                    disabled={!selectedOrderForReturn}
                    onClick={() => setNewStep(2)}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold disabled:opacity-40 cursor-pointer transition-colors flex items-center gap-1.5"
                  >
                    <span>Avançar para Itens</span>
                    <ArrowRight size={14} />
                  </button>
                ) : newStep === 2 ? (
                  <button
                    type="button"
                    disabled={!returnFormTotals.hasSelectedItems}
                    onClick={() => setNewStep(3)}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold disabled:opacity-40 cursor-pointer transition-colors flex items-center gap-1.5"
                  >
                    <span>Avançar para Resolução</span>
                    <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConfirmCreateReturn}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 size={16} />
                    <span>Confirmar Devolução</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. MODAL: DETALHES COMPLETOS DA DEVOLUÇÃO                */}
      {/* ======================================================== */}
      {selectedReturnDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <RotateCcw size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Detalhes da Devolução {selectedReturnDetails.number}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pedido Origem: {selectedReturnDetails.orderNumber} • Canal: {selectedReturnDetails.channelLabel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReturnDetails(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs text-slate-700">
              {/* Status e dados gerais */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Cliente</span>
                  <span className="font-bold text-slate-900">{selectedReturnDetails.customerName}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Data Registro</span>
                  <span className="font-semibold text-slate-800">
                    {new Date(selectedReturnDetails.date || selectedReturnDetails.createdAt).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Modalidade</span>
                  <span className="font-bold text-slate-900 uppercase">{selectedReturnDetails.returnType}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block">Situação</span>
                  <span className={`font-bold ${selectedReturnDetails.status === 'concluida' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {selectedReturnDetails.status === 'concluida' ? 'CONCLUÍDA' : 'CANCELADA'}
                  </span>
                </div>
              </div>

              {/* Motivo e Resolução */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Motivo Informado</span>
                  <strong className="text-slate-900 block">{REASON_LABELS[selectedReturnDetails.reason]}</strong>
                  {selectedReturnDetails.reasonDetails && (
                    <p className="text-slate-600 text-[11px] mt-1">{selectedReturnDetails.reasonDetails}</p>
                  )}
                </div>

                <div className="p-4 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Resolução Financeira</span>
                  <strong className="text-slate-900 block">
                    {RESOLUTION_LABELS[selectedReturnDetails.financialResolution]?.label}
                  </strong>
                  <p className="text-slate-600 text-[11px]">
                    {selectedReturnDetails.financialResolution === 'estorno_restituicao'
                      ? `Restituído via ${selectedReturnDetails.refundMethod || 'Dinheiro'}`
                      : selectedReturnDetails.financialResolution === 'credito_cliente'
                      ? 'Adicionado como saldo de crédito na ficha do cliente'
                      : `Abatido em contas a receber (${selectedReturnDetails.receivableAdjustedDocNumber || 'Títulos'})`}
                  </p>
                </div>
              </div>

              {/* Itens devolvidos */}
              <div>
                <h4 className="font-bold text-slate-900 mb-2">Produtos Devolvidos</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Produto</th>
                        <th className="py-2.5 px-3 text-center">Quantidade</th>
                        <th className="py-2.5 px-3">Condição</th>
                        <th className="py-2.5 px-3 text-right">Preço Unit.</th>
                        <th className="py-2.5 px-3 text-right">Total Líquido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedReturnDetails.items.map((it) => (
                        <tr key={it.id}>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-900 block">{it.description}</span>
                            <span className="text-[10px] text-slate-400 font-mono">Cód: {it.productCode}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold">
                            {formatQuantity(it.quantity)} {it.unit}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {CONDITION_LABELS[it.condition]?.label || it.condition}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">{formatCurrency(it.unitPrice)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {formatCurrency(it.totalNet)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totais */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Subtotal dos Itens:</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(selectedReturnDetails.subtotalReturned)}</span>
                </div>
                {selectedReturnDetails.discountProportional > 0 && (
                  <div className="flex items-center justify-between text-xs text-rose-600">
                    <span>(-) Descontos Comerciais Proporcionais:</span>
                    <span>-{formatCurrency(selectedReturnDetails.discountProportional)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Valor Total da Devolução:</span>
                  <span className="text-base text-rose-600">{formatCurrency(selectedReturnDetails.totalReturned)}</span>
                </div>
                {selectedReturnDetails.totalCmvReversed > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-emerald-700 pt-1">
                    <span>Estorno de CMV de Revenda (DRE):</span>
                    <span>{formatCurrency(selectedReturnDetails.totalCmvReversed)}</span>
                  </div>
                )}
              </div>

              {/* Cancelamento se houver */}
              {selectedReturnDetails.status === 'cancelada' && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-1">
                  <span className="font-bold block flex items-center gap-1.5">
                    <AlertTriangle size={15} /> Devolução Cancelada
                  </span>
                  <p className="text-xs">
                    Cancelada em {new Date(selectedReturnDetails.cancelledAt || '').toLocaleString('pt-BR')} por {selectedReturnDetails.cancelledByName || 'Administrador'}.
                  </p>
                  <p className="text-xs font-medium">Motivo: {selectedReturnDetails.cancelledReason}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  const r = selectedReturnDetails;
                  setSelectedReturnDetails(null);
                  setSelectedReturnReceipt(r);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Printer size={15} />
                <span>Imprimir Termo / Comprovante</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. MODAL: COMPROVANTE / TERMO DE DEVOLUÇÃO               */}
      {/* ======================================================== */}
      {selectedReturnReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between no-print">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Comprovante / Termo de Devolução de Mercadorias
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Printer size={14} />
                  <span>Imprimir</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReturnReceipt(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Documento A4 timbrado limpo para impressão */}
            <div className="p-8 overflow-y-auto flex-1 space-y-6 text-xs text-slate-800 print:p-0 print:m-0">
              {/* Cabeçalho da Empresa */}
              <div className="border-b border-slate-300 pb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-black text-slate-900 uppercase">
                    {currentCompany.tradeName || currentCompany.name}
                  </h2>
                  <p className="text-[11px] text-slate-600">{currentCompany.name}</p>
                  <p className="text-[11px] text-slate-600 font-mono">CNPJ: {currentCompany.cnpjCpf}</p>
                  <p className="text-[11px] text-slate-500">
                    {currentCompany.address.street}, {currentCompany.address.number} - {currentCompany.address.city}/{currentCompany.address.state}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-3 py-1 rounded bg-slate-900 text-white font-mono font-bold text-xs">
                    {selectedReturnReceipt.number}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Data: {new Date(selectedReturnReceipt.date).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>

              {/* Título do Termo */}
              <div className="text-center py-2 bg-slate-100 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-900">
                Termo de Devolução de Mercadorias ({selectedReturnReceipt.returnType === 'total' ? 'Devolução Total' : 'Devolução Parcial'})
              </div>

              {/* Informações da Venda Original */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 font-medium">Pedido Origem:</span>{' '}
                  <strong className="font-mono text-slate-900">{selectedReturnReceipt.orderNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Canal de Origem:</span>{' '}
                  <strong>{selectedReturnReceipt.channelLabel}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Cliente:</span>{' '}
                  <strong>{selectedReturnReceipt.customerName}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">CPF/CNPJ:</span>{' '}
                  <span className="font-mono">{selectedReturnReceipt.customerCpfCnpj || 'Não informado'}</span>
                </div>
              </div>

              {/* Tabela de Produtos */}
              <div>
                <table className="w-full text-left text-xs border border-slate-200">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Produto</th>
                      <th className="py-2 px-2 text-center">Qtd</th>
                      <th className="py-2 px-2">Condição</th>
                      <th className="py-2 px-3 text-right">Unitário</th>
                      <th className="py-2 px-3 text-right">Total Líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedReturnReceipt.items.map((it) => (
                      <tr key={it.id}>
                        <td className="py-2 px-3">
                          <strong className="text-slate-900">{it.description}</strong>
                          <span className="text-[10px] text-slate-500 block font-mono">Cód: {it.productCode}</span>
                        </td>
                        <td className="py-2 px-2 text-center font-bold">
                          {formatQuantity(it.quantity)} {it.unit}
                        </td>
                        <td className="py-2 px-2 text-[10px]">
                          {CONDITION_LABELS[it.condition]?.label || it.condition}
                        </td>
                        <td className="py-2 px-3 text-right">{formatCurrency(it.unitPrice)}</td>
                        <td className="py-2 px-3 text-right font-bold">{formatCurrency(it.totalNet)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold">
                    <tr>
                      <td colSpan={4} className="py-2 px-3 text-right uppercase">
                        Valor Total da Devolução:
                      </td>
                      <td className="py-2 px-3 text-right text-sm text-slate-900">
                        {formatCurrency(selectedReturnReceipt.totalReturned)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Forma de Resolução e Motivo */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <div>
                  <span className="text-slate-500 font-medium">Motivo:</span>{' '}
                  <strong>{REASON_LABELS[selectedReturnReceipt.reason]}</strong>
                  {selectedReturnReceipt.reasonDetails && ` - ${selectedReturnReceipt.reasonDetails}`}
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Resolução Financeira:</span>{' '}
                  <strong>{RESOLUTION_LABELS[selectedReturnReceipt.financialResolution]?.label}</strong>
                  {selectedReturnReceipt.financialResolution === 'estorno_restituicao' &&
                    ` (${selectedReturnReceipt.refundMethod || 'Dinheiro'})`}
                </div>
              </div>

              {/* Termo e Assinaturas */}
              <div className="pt-6 space-y-8 text-center text-slate-600">
                <p className="text-[11px] leading-relaxed">
                  Declaro que as mercadorias descritas acima foram devolvidas à empresa em conformidade com as condições informadas, dando plena quitação sobre os itens recebidos.
                </p>

                <div className="grid grid-cols-2 gap-8 pt-8">
                  <div className="border-t border-slate-400 pt-2">
                    <span className="font-bold text-slate-900 block text-xs">{selectedReturnReceipt.customerName}</span>
                    <span className="text-[10px] text-slate-500">Assinatura do Cliente / Responsável</span>
                  </div>
                  <div className="border-t border-slate-400 pt-2">
                    <span className="font-bold text-slate-900 block text-xs">{currentCompany.tradeName || currentCompany.name}</span>
                    <span className="text-[10px] text-slate-500">Assinatura / Visto do Atendente</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 8. MODAL: CANCELAR DEVOLUÇÃO                             */}
      {/* ======================================================== */}
      {returnToCancel && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Cancelar Devolução {returnToCancel.number}?
              </h3>
              <p className="text-xs text-slate-500">
                Esta ação reverterá integralmente todas as movimentações de estoque, estornos financeiros e créditos gerados, devolvendo o saldo elegível para o pedido {returnToCancel.orderNumber}.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Motivo do Cancelamento *
              </label>
              <textarea
                rows={3}
                value={cancelReasonText}
                onChange={(e) => setCancelReasonText(e.target.value)}
                placeholder="Informe o motivo pelo qual esta devolução está sendo cancelada..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReturnToCancel(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelReturn}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow transition-all"
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
