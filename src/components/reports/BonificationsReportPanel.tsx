import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Gift,
  Building2,
  Calendar,
  Search,
  Filter,
  RotateCcw,
  FileSpreadsheet,
  Printer,
  Package,
  Users,
  ClipboardList,
  Eye,
  UserCheck,
  Store,
  Info,
  X,
} from 'lucide-react';
import { Database } from '../../services/db';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { Order } from '../../types';
import { isBonusOrder, getOrderReferenceTotal } from '../../utils/orderUtils';
import { ReceiptModal } from '../common/ReceiptModal';
import { toast } from '../../services/toast';

type BonusReportSubTab = 'pedidos' | 'produtos' | 'clientes';

const normalizeText = (text: string) =>
  (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const getCurrentMonthRange = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(end) };
};

const getOriginLabel = (origin?: string) => {
  switch (origin) {
    case 'externa_celular':
      return 'Venda Mobile';
    case 'pedidos_venda':
    case 'retaguarda_pedido':
      return 'Pedido de Venda';
    case 'pdv':
      return 'PDV Balcão';
    default:
      return origin || 'Pedido de Venda';
  }
};

interface BonificationsReportPanelProps {
  defaultCompanyId?: string;
}

export const BonificationsReportPanel: React.FC<BonificationsReportPanelProps> = ({
  defaultCompanyId,
}) => {
  const dbState = Database.getState();
  const currentCompany = Database.getCurrentCompany();
  const companies = dbState.companies || [];

  const defaultDates = useMemo(() => getCurrentMonthRange(), []);
  const [subTab, setSubTab] = useState<BonusReportSubTab>('pedidos');
  const [companyFilter, setCompanyFilter] = useState<string>(defaultCompanyId || currentCompany.id);
  const [startDate, setStartDate] = useState<string>(defaultDates.start);
  const [endDate, setEndDate] = useState<string>(defaultDates.end);
  const [originFilter, setOriginFilter] = useState<string>('todas');
  const [sellerFilter, setSellerFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<'ativos' | 'todos' | 'cancelado'>('ativos');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] = useState<Order | null>(null);

  const companyNameMap = useMemo(() => {
    const map = new Map<string, string>();
    companies.forEach((c) => map.set(c.id, c.tradeName || c.name));
    return map;
  }, [companies]);

  const sellerOptions = useMemo(() => {
    const map = new Map<string, string>();
    (dbState.users || []).forEach((u) => map.set(u.id, u.name));
    (dbState.orders || []).forEach((o) => {
      if (isBonusOrder(o) && o.userId && o.userName && !map.has(o.userId)) {
        map.set(o.userId, o.userName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dbState.users, dbState.orders]);

  const filteredBonusOrders = useMemo(() => {
    const q = normalizeText(searchTerm);
    return (dbState.orders || [])
      .filter((order: Order) => {
        if (!isBonusOrder(order)) return false;
        if (companyFilter !== 'todas' && order.companyId !== companyFilter) return false;

        if (statusFilter === 'ativos' && order.status === 'cancelado') return false;
        if (statusFilter === 'cancelado' && order.status !== 'cancelado') return false;

        const orderDay = (order.createdAt || '').slice(0, 10);
        if (startDate && orderDay < startDate) return false;
        if (endDate && orderDay > endDate) return false;

        if (originFilter !== 'todas') {
          if (originFilter === 'pedidos_venda') {
            if (order.origin !== 'pedidos_venda' && order.origin !== 'retaguarda_pedido') return false;
          } else if (order.origin !== originFilter) {
            return false;
          }
        }

        if (sellerFilter !== 'todos' && order.userId !== sellerFilter) return false;

        if (q) {
          const matchNumber = normalizeText(order.number).includes(q);
          const matchCustomer = normalizeText(order.customerName).includes(q);
          const matchSeller = normalizeText(order.userName).includes(q);
          const matchNotes = normalizeText(order.notes || '').includes(q);
          const matchItem = (order.items || []).some(
            (item) =>
              normalizeText(item.description).includes(q) ||
              normalizeText(item.productCode || '').includes(q)
          );
          if (!matchNumber && !matchCustomer && !matchSeller && !matchNotes && !matchItem) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [dbState.orders, companyFilter, statusFilter, startDate, endDate, originFilter, sellerFilter, searchTerm]);

  // Totais sempre baseados nos pedidos filtrados ativos (se filtro = 'cancelado', usa os exibidos para consulta)
  const metricsOrders = useMemo(() => {
    if (statusFilter === 'cancelado') return filteredBonusOrders;
    return filteredBonusOrders.filter((o) => o.status !== 'cancelado');
  }, [filteredBonusOrders, statusFilter]);

  const kpis = useMemo(() => {
    let totalUnits = 0;
    let totalReferenceValue = 0;
    const distinctProducts = new Set<string>();
    const distinctCustomers = new Set<string>();

    metricsOrders.forEach((order) => {
      totalReferenceValue += getOrderReferenceTotal(order);
      const custKey = order.customerId || `anon:${order.customerName || 'Consumidor'}`;
      distinctCustomers.add(custKey);

      (order.items || []).forEach((item) => {
        totalUnits += item.quantity || 0;
        const prodKey = item.productId || item.productCode || item.description;
        if (prodKey) distinctProducts.add(prodKey);
      });
    });

    return {
      ordersCount: metricsOrders.length,
      totalUnits,
      distinctProductsCount: distinctProducts.size,
      distinctCustomersCount: distinctCustomers.size,
      totalReferenceValue,
    };
  }, [metricsOrders]);

  const productsSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        productId: string;
        code: string;
        description: string;
        unit: string;
        ordersSet: Set<string>;
        customersSet: Set<string>;
        quantity: number;
        referenceValue: number;
      }
    >();

    metricsOrders.forEach((order) => {
      const custKey = order.customerId || order.customerName || 'Consumidor';
      (order.items || []).forEach((item) => {
        const key = item.productId || item.productCode || item.description;
        const existing = map.get(key) || {
          productId: key,
          code: item.productCode || '-',
          description: item.description,
          unit: item.unit || 'UN',
          ordersSet: new Set<string>(),
          customersSet: new Set<string>(),
          quantity: 0,
          referenceValue: 0,
        };
        existing.ordersSet.add(order.id);
        existing.customersSet.add(custKey);
        existing.quantity += item.quantity || 0;
        existing.referenceValue +=
          typeof item.totalPrice === 'number'
            ? item.totalPrice
            : (item.unitPrice || 0) * (item.quantity || 0);
        map.set(key, existing);
      });
    });

    return Array.from(map.values())
      .map((entry) => ({
        ...entry,
        ordersCount: entry.ordersSet.size,
        customersCount: entry.customersSet.size,
      }))
      .sort((a, b) => b.quantity - a.quantity || b.referenceValue - a.referenceValue);
  }, [metricsOrders]);

  const customersSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        customerName: string;
        cpfCnpj: string;
        ordersCount: number;
        totalUnits: number;
        distinctProducts: Set<string>;
        referenceValue: number;
        lastOrderAt: string;
      }
    >();

    metricsOrders.forEach((order) => {
      const key = order.customerId || `anon:${order.customerName || 'Consumidor Final'}`;
      const existing = map.get(key) || {
        key,
        customerName: order.customerName || 'Consumidor Final',
        cpfCnpj: order.customerCpfCnpj || '',
        ordersCount: 0,
        totalUnits: 0,
        distinctProducts: new Set<string>(),
        referenceValue: 0,
        lastOrderAt: order.createdAt,
      };
      existing.ordersCount += 1;
      existing.referenceValue += getOrderReferenceTotal(order);
      if (order.createdAt > existing.lastOrderAt) {
        existing.lastOrderAt = order.createdAt;
      }
      (order.items || []).forEach((item) => {
        existing.totalUnits += item.quantity || 0;
        existing.distinctProducts.add(item.productId || item.productCode || item.description);
      });
      map.set(key, existing);
    });

    return Array.from(map.values())
      .map((entry) => ({
        ...entry,
        distinctProductsCount: entry.distinctProducts.size,
      }))
      .sort((a, b) => b.ordersCount - a.ordersCount || b.referenceValue - a.referenceValue);
  }, [metricsOrders]);

  const applyPeriodPreset = (preset: 'hoje' | 'mes_atual' | '30_dias' | 'tudo') => {
    const now = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (preset === 'hoje') {
      const today = fmt(now);
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'mes_atual') {
      setStartDate(fmt(new Date(now.getFullYear(), now.getMonth(), 1)));
      setEndDate(fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    } else if (preset === '30_dias') {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      setStartDate(fmt(start));
      setEndDate(fmt(now));
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleResetFilters = () => {
    setCompanyFilter(defaultCompanyId || currentCompany.id);
    setStartDate(defaultDates.start);
    setEndDate(defaultDates.end);
    setOriginFilter('todas');
    setSellerFilter('todos');
    setStatusFilter('ativos');
    setSearchTerm('');
  };

  const handleExportExcel = () => {
    if (filteredBonusOrders.length === 0) {
      toast.warning('Não há pedidos de bonificação para exportar com os filtros atuais.', 'Relatório Vazio');
      return;
    }

    const wb = XLSX.utils.book_new();

    const ordersSheet = filteredBonusOrders.map((order) => ({
      'Nº Pedido': order.number,
      'Tipo': 'BONIFICAÇÃO',
      'Data/Hora': new Date(order.createdAt).toLocaleString('pt-BR'),
      'Empresa': companyNameMap.get(order.companyId) || order.companyId,
      'Cliente': order.customerName,
      'CPF/CNPJ': order.customerCpfCnpj || '',
      'Vendedor / Usuário': order.userName,
      'Origem': getOriginLabel(order.origin),
      'Qtd. Itens': order.items.length,
      'Unidades Bonificadas': order.items.reduce((s, it) => s + (it.quantity || 0), 0),
      'Valor Referência (R$)': Number(getOrderReferenceTotal(order).toFixed(2)),
      'Valor Faturado / Cobrado (R$)': 0,
      'Status': order.status,
      'Observações': order.notes || '',
    }));

    const productsSheet = productsSummary.map((p) => ({
      'Código': p.code,
      'Produto': p.description,
      'Unidade': p.unit,
      'Qtd. Pedidos': p.ordersCount,
      'Clientes Beneficiados': p.customersCount,
      'Qtd. Bonificada': p.quantity,
      'Valor Referência (R$)': Number(p.referenceValue.toFixed(2)),
    }));

    const customersSheet = customersSummary.map((c) => ({
      'Cliente': c.customerName,
      'CPF/CNPJ': c.cpfCnpj,
      'Pedidos de Bonificação': c.ordersCount,
      'Produtos Distintos': c.distinctProductsCount,
      'Unidades Recebidas': c.totalUnits,
      'Valor Referência (R$)': Number(c.referenceValue.toFixed(2)),
      'Última Bonificação': new Date(c.lastOrderAt).toLocaleDateString('pt-BR'),
    }));

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ordersSheet), 'Pedidos_Bonificacao');
    if (productsSheet.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productsSheet), 'Produtos_Bonificados');
    }
    if (customersSheet.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(customersSheet), 'Clientes_Bonificados');
    }

    XLSX.writeFile(wb, `Relatorio_Bonificacoes_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Planilha do Relatório de Bonificações exportada com sucesso!', 'Exportação Concluída');
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho Informativo */}
      <div className="bg-sky-50/80 border border-sky-200 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Gift size={20} />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h3 className="text-base font-extrabold text-sky-950">
                Relatório Gerencial de Bonificações
              </h3>
              <span className="px-2 py-0.5 rounded-md bg-sky-200 text-sky-900 text-[10px] font-black uppercase">
                Isolado do Faturamento
              </span>
            </div>
            <p className="text-xs text-sky-800 mt-0.5">
              Controle completo de brindes, cortesias e ações promocionais com movimentação exclusiva de estoque, sem impacto em faturamento, Contas a Receber ou comissões.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={14} />
            <span>Exportar Excel</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Printer size={14} />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700">
            <Filter size={14} className="text-sky-600" />
            <span>Filtros de Bonificações</span>
          </div>
          <div className="flex items-center flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyPeriodPreset('hoje')}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-sky-100 hover:text-sky-800 text-[11px] font-bold text-slate-600 transition-colors cursor-pointer"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => applyPeriodPreset('mes_atual')}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-sky-100 hover:text-sky-800 text-[11px] font-bold text-slate-600 transition-colors cursor-pointer"
            >
              Mês Atual
            </button>
            <button
              type="button"
              onClick={() => applyPeriodPreset('30_dias')}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-sky-100 hover:text-sky-800 text-[11px] font-bold text-slate-600 transition-colors cursor-pointer"
            >
              30 Dias
            </button>
            <button
              type="button"
              onClick={() => applyPeriodPreset('tudo')}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-sky-100 hover:text-sky-800 text-[11px] font-bold text-slate-600 transition-colors cursor-pointer"
            >
              Todo o Período
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>Limpar</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
          <div>
            <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Building2 size={12} className="text-slate-400" />
              <span>Empresa</span>
            </label>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 cursor-pointer"
            >
              <option value="todas">Todas as Empresas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.tradeName || c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar size={12} className="text-slate-400" />
              <span>Data Início</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar size={12} className="text-slate-400" />
              <span>Data Fim</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Store size={12} className="text-slate-400" />
              <span>Origem</span>
            </label>
            <select
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 cursor-pointer"
            >
              <option value="todas">Todas as Origens</option>
              <option value="pedidos_venda">Pedido de Venda</option>
              <option value="externa_celular">Venda Mobile</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <UserCheck size={12} className="text-slate-400" />
              <span>Vendedor / Usuário</span>
            </label>
            <select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 cursor-pointer"
            >
              <option value="todos">Todos os Vendedores</option>
              {sellerOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 mb-1 block">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ativos' | 'todos' | 'cancelado')}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500 cursor-pointer"
            >
              <option value="ativos">Ativos (Excl. Cancelados)</option>
              <option value="todos">Todos (Incl. Cancelados)</option>
              <option value="cancelado">Somente Cancelados</option>
            </select>
          </div>
        </div>

        {/* Busca rápida */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar por nº do pedido, cliente, produto, código, vendedor ou observação..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Cards de Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-sky-200 shadow-xs">
          <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider block">
            Pedidos de Bonificação
          </span>
          <div className="text-2xl font-black text-sky-900 mt-1">{kpis.ordersCount}</div>
          <span className="text-[11px] text-slate-500 block mt-0.5">No período filtrado</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Unidades Bonificadas
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {formatQuantity(kpis.totalUnits)}
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">Baixadas do estoque</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Produtos Distintos
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {kpis.distinctProductsCount}
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">Itens bonificados</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Clientes Beneficiados
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {kpis.distinctCustomersCount}
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">Destinatários distintos</span>
        </div>

        <div className="bg-sky-50 p-4 rounded-xl border border-sky-200 shadow-xs col-span-2 lg:col-span-1">
          <span className="text-[10px] font-extrabold text-sky-700 uppercase tracking-wider flex items-center gap-1">
            <Info size={12} />
            <span>Valor de Referência</span>
          </span>
          <div className="text-xl font-black text-sky-950 mt-1">
            {formatCurrency(kpis.totalReferenceValue)}
          </div>
          <span className="text-[10px] font-bold text-sky-700 block mt-0.5">
            Sem faturamento • R$ 0,00 cobrado
          </span>
        </div>
      </div>

      {/* Sub-abas da Visão de Bonificações */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setSubTab('pedidos')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                subTab === 'pedidos'
                  ? 'bg-white text-sky-800 shadow-xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList size={14} />
              <span>Pedidos ({filteredBonusOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('produtos')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                subTab === 'produtos'
                  ? 'bg-white text-sky-800 shadow-xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package size={14} />
              <span>Produtos Bonificados ({productsSummary.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('clientes')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                subTab === 'clientes'
                  ? 'bg-white text-sky-800 shadow-xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users size={14} />
              <span>Clientes Beneficiados ({customersSummary.length})</span>
            </button>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            * Os valores exibidos são meramente referenciais e não entram no faturamento.
          </span>
        </div>

        {/* SUB-ABA 1: PEDIDOS */}
        {subTab === 'pedidos' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Nº Pedido</th>
                  <th className="p-3">Data/Hora</th>
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Vendedor</th>
                  <th className="p-3">Origem</th>
                  <th className="p-3 text-right">Unidades</th>
                  <th className="p-3 text-right">Valor Ref.</th>
                  <th className="p-3 text-right">Cobrado</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBonusOrders.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-400">
                      Nenhum pedido de bonificação encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredBonusOrders.map((order) => {
                    const units = (order.items || []).reduce((s, it) => s + (it.quantity || 0), 0);
                    const refVal = getOrderReferenceTotal(order);
                    return (
                      <tr key={order.id} className="hover:bg-sky-50/40 transition-colors">
                        <td className="p-3">
                          <div className="font-mono font-extrabold text-sky-900">{order.number}</div>
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase bg-sky-100 text-sky-800 border border-sky-300 px-1.5 py-0.5 rounded mt-0.5">
                            <Gift size={9} /> BONIFICAÇÃO
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 whitespace-nowrap">
                          {new Date(order.createdAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="p-3 font-semibold text-slate-700">
                          {companyNameMap.get(order.companyId) || '-'}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{order.customerName}</div>
                          {order.notes && (
                            <div className="text-[10px] text-slate-500 line-clamp-1 max-w-xs">
                              Obs: {order.notes}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-slate-700 font-medium">{order.userName}</td>
                        <td className="p-3 text-slate-600">{getOriginLabel(order.origin)}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-800">
                          {formatQuantity(units)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-sky-700">
                          {formatCurrency(refVal)}
                        </td>
                        <td className="p-3 text-right font-mono font-extrabold text-slate-500">
                          {formatCurrency(0)}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              order.status === 'cancelado'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {order.status === 'cancelado' ? 'Cancelado' : 'Concluído'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedOrderForReceipt(order)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold text-[11px] transition-colors cursor-pointer"
                            title="Visualizar comprovante de bonificação"
                          >
                            <Eye size={13} />
                            <span>Ver / Imprimir</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SUB-ABA 2: PRODUTOS BONIFICADOS */}
        {subTab === 'produtos' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Código</th>
                  <th className="p-3">Produto</th>
                  <th className="p-3 text-center">Pedidos</th>
                  <th className="p-3 text-center">Clientes</th>
                  <th className="p-3 text-right">Qtd. Bonificada</th>
                  <th className="p-3 text-right">Valor de Referência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productsSummary.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Nenhum produto bonificado encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  productsSummary.map((prod) => (
                    <tr key={prod.productId} className="hover:bg-sky-50/40">
                      <td className="p-3 font-mono font-bold text-slate-600">{prod.code}</td>
                      <td className="p-3 font-bold text-slate-800">{prod.description}</td>
                      <td className="p-3 text-center font-mono font-semibold text-slate-700">
                        {prod.ordersCount}
                      </td>
                      <td className="p-3 text-center font-mono font-semibold text-slate-700">
                        {prod.customersCount}
                      </td>
                      <td className="p-3 text-right font-mono font-extrabold text-sky-900">
                        {formatQuantity(prod.quantity)} {prod.unit}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-700">
                        {formatCurrency(prod.referenceValue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* SUB-ABA 3: CLIENTES BENEFICIADOS */}
        {subTab === 'clientes' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Cliente</th>
                  <th className="p-3 text-center">Pedidos</th>
                  <th className="p-3 text-center">Produtos Distintos</th>
                  <th className="p-3 text-right">Unidades Recebidas</th>
                  <th className="p-3 text-right">Valor de Referência</th>
                  <th className="p-3 text-right">Última Bonificação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customersSummary.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Nenhum cliente encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  customersSummary.map((cust) => (
                    <tr key={cust.key} className="hover:bg-sky-50/40">
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{cust.customerName}</div>
                        {cust.cpfCnpj && (
                          <div className="text-[10px] text-slate-500 font-mono">{cust.cpfCnpj}</div>
                        )}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-sky-900">
                        {cust.ordersCount}
                      </td>
                      <td className="p-3 text-center font-mono font-semibold text-slate-700">
                        {cust.distinctProductsCount}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-800">
                        {formatQuantity(cust.totalUnits)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-sky-700">
                        {formatCurrency(cust.referenceValue)}
                      </td>
                      <td className="p-3 text-right text-slate-600 whitespace-nowrap">
                        {new Date(cust.lastOrderAt).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Visualização / Impressão do Comprovante de Bonificação */}
      {selectedOrderForReceipt && (
        <ReceiptModal
          order={selectedOrderForReceipt}
          company={companies.find((c) => c.id === selectedOrderForReceipt.companyId) || currentCompany}
          isOpen={true}
          onClose={() => setSelectedOrderForReceipt(null)}
        />
      )}
    </div>
  );
};
