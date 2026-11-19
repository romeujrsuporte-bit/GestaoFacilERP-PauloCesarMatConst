import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart3,
  TrendingUp,
  Package,
  Users,
  Truck,
  Building2,
  Calendar,
  Search,
  X,
  Filter,
  RotateCcw,
  Printer,
  FileSpreadsheet,
  BookOpen,
  Target,
  Award,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Info,
  Store,
  UserCheck,
} from 'lucide-react';
import { Database } from '../../services/db';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { Order, Product, Customer, Supplier } from '../../types';
import { toast } from '../../services/toast';

type AbcReportTab = 'abc_overview' | 'abc_produtos' | 'abc_clientes' | 'abc_fornecedores';
type AbcClass = 'A' | 'B' | 'C';

interface AbcRow {
  id: string;
  code: string;
  name: string;
  subtitle?: string;
  ordersCount: number;
  quantity: number;
  unit?: string;
  totalValue: number;
  sharePercent: number;
  cumulativePercent: number;
  abcClass: AbcClass;
}

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

const getOriginLabel = (origin: string) => {
  switch (origin) {
    case 'pdv':
      return 'PDV Balcão';
    case 'externa_celular':
      return 'Vendas Mobile';
    case 'retaguarda_pedido':
    case 'pedidos_venda':
      return 'Pedido de Venda';
    case 'balcao':
      return 'Balcão';
    default:
      return origin || 'Outros';
  }
};

const classifyAbcRows = (
  rawRows: Omit<AbcRow, 'sharePercent' | 'cumulativePercent' | 'abcClass'>[]
): AbcRow[] => {
  const sorted = [...rawRows]
    .filter((r) => r.totalValue > 0)
    .sort((a, b) => b.totalValue - a.totalValue);

  const grandTotal = sorted.reduce((sum, r) => sum + r.totalValue, 0);
  let runningTotal = 0;

  return sorted.map((row, idx) => {
    const sharePercent = grandTotal > 0 ? (row.totalValue / grandTotal) * 100 : 0;
    const prevCumPercent = grandTotal > 0 ? (runningTotal / grandTotal) * 100 : 0;
    runningTotal += row.totalValue;
    const cumulativePercent = grandTotal > 0 ? Math.min(100, (runningTotal / grandTotal) * 100) : 0;

    let abcClass: AbcClass = 'C';
    if (idx === 0 || prevCumPercent < 80) {
      abcClass = 'A';
    } else if (prevCumPercent < 95) {
      abcClass = 'B';
    }

    return {
      ...row,
      sharePercent,
      cumulativePercent,
      abcClass,
    };
  });
};

export const SalesReportsView: React.FC = () => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  // Ao abrir "Relatórios" -> começa na aba "Curva ABC" sem exibir listas, apresentando o informativo gerencial
  const [activeTab, setActiveTab] = useState<AbcReportTab>('abc_overview');

  // Filtros Compartilhados
  const defaultDates = useMemo(() => getCurrentMonthRange(), []);
  const [companyFilter, setCompanyFilter] = useState<string>(currentCompany.id);
  const [startDate, setStartDate] = useState<string>(defaultDates.start);
  const [endDate, setEndDate] = useState<string>(defaultDates.end);
  const [originFilter, setOriginFilter] = useState<string>('todas');
  const [sellerFilter, setSellerFilter] = useState<string>('todos');
  const [supplierFilter, setSupplierFilter] = useState<string>('todos');
  const [supplierAnalysisBase, setSupplierAnalysisBase] = useState<'vendas' | 'compras'>('vendas');

  // Filtro de Cliente com busca a partir de 3 caracteres
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState<boolean>(false);
  const customerBoxRef = useRef<HTMLDivElement>(null);

  // Filtro de Produto com busca a partir de 3 caracteres
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');
  const [productDropdownOpen, setProductDropdownOpen] = useState<boolean>(false);
  const productBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false);
      }
      if (productBoxRef.current && !productBoxRef.current.contains(e.target as Node)) {
        setProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const companies = dbState.companies || [];
  const customers = dbState.customers || [];
  const products = dbState.products || [];
  const suppliers = dbState.suppliers || [];

  // Mapa rápido de produto e de fornecedor vinculado ao produto (cadastro ou histórico de compras)
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const supplierMap = useMemo(() => {
    const map = new Map<string, Supplier>();
    suppliers.forEach((s) => map.set(s.id, s));
    return map;
  }, [suppliers]);

  const productToSupplierFromPurchases = useMemo(() => {
    const map = new Map<string, { supplierId: string; supplierName: string }>();
    const validPOs = (dbState.purchaseOrders || [])
      .filter((po) => po.status !== 'cancelado')
      .sort((a, b) => (b.orderDate || b.createdAt).localeCompare(a.orderDate || a.createdAt));

    for (const po of validPOs) {
      for (const item of po.items || []) {
        if (!map.has(item.productId) && po.supplierId) {
          map.set(item.productId, {
            supplierId: po.supplierId,
            supplierName: po.supplierName || supplierMap.get(po.supplierId)?.name || 'Fornecedor',
          });
        }
      }
    }
    return map;
  }, [dbState.purchaseOrders, supplierMap]);

  const resolveProductSupplier = (productId: string) => {
    const prod = productMap.get(productId);
    if (prod?.supplierId) {
      const sup = supplierMap.get(prod.supplierId);
      return {
        supplierId: prod.supplierId,
        supplierName: sup?.tradeName || sup?.name || prod.supplierId,
        supplierCode: sup?.code || '',
      };
    }
    const fromPo = productToSupplierFromPurchases.get(productId);
    if (fromPo) {
      const sup = supplierMap.get(fromPo.supplierId);
      return {
        supplierId: fromPo.supplierId,
        supplierName: sup?.tradeName || sup?.name || fromPo.supplierName,
        supplierCode: sup?.code || '',
      };
    }
    return {
      supplierId: 'sem_fornecedor',
      supplierName: 'Produção Própria / Sem Fornecedor Vinculado',
      supplierCode: '-',
    };
  };

  // Lista de vendedores disponíveis (usuários cadastrados + vendedores encontrados nos pedidos)
  const sellerOptions = useMemo(() => {
    const map = new Map<string, string>();
    (dbState.users || []).forEach((u) => {
      map.set(u.id, u.name);
    });
    (dbState.orders || []).forEach((o) => {
      if (o.userId && o.userName && !map.has(o.userId)) {
        map.set(o.userId, o.userName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dbState.users, dbState.orders]);

  // Busca de Cliente a partir de 3 caracteres
  const normalizedCustomerTerm = normalizeText(customerSearch);
  const isCustomerSearchReady = normalizedCustomerTerm.length >= 3;
  const filteredCustomerOptions = useMemo(() => {
    if (!isCustomerSearchReady) return [];
    const digits = normalizedCustomerTerm.replace(/\D/g, '');
    return customers
      .filter((c) => {
        const matchName = normalizeText(c.name).includes(normalizedCustomerTerm);
        const matchTrade = c.tradeName ? normalizeText(c.tradeName).includes(normalizedCustomerTerm) : false;
        const matchCode = normalizeText(c.code).includes(normalizedCustomerTerm);
        const docDigits = (c.cpfCnpj || '').replace(/\D/g, '');
        const matchDoc = digits.length >= 3 && docDigits.includes(digits);
        return matchName || matchTrade || matchCode || matchDoc;
      })
      .slice(0, 30);
  }, [customers, normalizedCustomerTerm, isCustomerSearchReady]);

  const selectedCustomerObj = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  // Busca de Produto a partir de 3 caracteres
  const normalizedProductTerm = normalizeText(productSearch);
  const isProductSearchReady = normalizedProductTerm.length >= 3;
  const filteredProductOptions = useMemo(() => {
    if (!isProductSearchReady) return [];
    return products
      .filter((p) => {
        const matchDesc = normalizeText(p.description).includes(normalizedProductTerm);
        const matchCode = normalizeText(p.code).includes(normalizedProductTerm);
        const matchBarcode = (p.barcode || '').includes(productSearch.trim());
        return matchDesc || matchCode || matchBarcode;
      })
      .slice(0, 30);
  }, [products, normalizedProductTerm, isProductSearchReady, productSearch]);

  const selectedProductObj = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  const applyPeriodPreset = (preset: 'mes_atual' | 'mes_anterior' | '30_dias' | 'ano_atual' | 'tudo') => {
    const now = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (preset === 'mes_atual') {
      setStartDate(fmt(new Date(now.getFullYear(), now.getMonth(), 1)));
      setEndDate(fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    } else if (preset === 'mes_anterior') {
      setStartDate(fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setEndDate(fmt(new Date(now.getFullYear(), now.getMonth(), 0)));
    } else if (preset === '30_dias') {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      setStartDate(fmt(start));
      setEndDate(fmt(now));
    } else if (preset === 'ano_atual') {
      setStartDate(`${now.getFullYear()}-01-01`);
      setEndDate(`${now.getFullYear()}-12-31`);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleResetFilters = () => {
    setCompanyFilter(currentCompany.id);
    setStartDate(defaultDates.start);
    setEndDate(defaultDates.end);
    setOriginFilter('todas');
    setSellerFilter('todos');
    setSupplierFilter('todos');
    setSelectedCustomerId('');
    setCustomerSearch('');
    setSelectedProductId('');
    setProductSearch('');
  };

  // Pedidos filtrados em nível de cabeçalho
  const filteredOrders = useMemo(() => {
    return (dbState.orders || []).filter((order: Order) => {
      if (order.type !== 'venda' || order.status === 'cancelado') return false;
      if (companyFilter !== 'todas' && order.companyId !== companyFilter) return false;

      const orderIsoDay = (order.createdAt || '').slice(0, 10);
      if (startDate && orderIsoDay < startDate) return false;
      if (endDate && orderIsoDay > endDate) return false;

      if (selectedCustomerId && order.customerId !== selectedCustomerId) return false;

      if (originFilter !== 'todas') {
        if (originFilter === 'retaguarda_pedido') {
          if (order.origin !== 'retaguarda_pedido' && order.origin !== 'pedidos_venda') return false;
        } else if (order.origin !== originFilter) {
          return false;
        }
      }

      if (sellerFilter !== 'todos' && order.userId !== sellerFilter) return false;

      return true;
    });
  }, [dbState.orders, companyFilter, startDate, endDate, selectedCustomerId, originFilter, sellerFilter]);

  // Itens de pedido filtrados também por Produto e Fornecedor
  const filteredOrderEntries = useMemo(() => {
    const entries: Array<{ order: Order; item: Order['items'][number]; netItemValue: number }> = [];

    for (const order of filteredOrders) {
      const itemsGrossSum = (order.items || []).reduce((s, itm) => s + (itm.totalPrice || 0), 0);
      // Ajusta proporcionalmente descontos globais/frete do pedido quando o pedido possui múltiplos itens
      const orderRatio = itemsGrossSum > 0 ? order.total / itemsGrossSum : 1;

      for (const item of order.items || []) {
        if (selectedProductId && item.productId !== selectedProductId) continue;

        if (supplierFilter !== 'todos') {
          const sup = resolveProductSupplier(item.productId);
          if (sup.supplierId !== supplierFilter) continue;
        }

        const netItemValue = Math.max(0, (item.totalPrice || 0) * orderRatio);
        entries.push({ order, item, netItemValue });
      }
    }

    return entries;
  }, [filteredOrders, selectedProductId, supplierFilter, productMap, supplierMap, productToSupplierFromPurchases]);

  // ----------------------------------------------------
  // CÁLCULO 1: CURVA ABC DE PRODUTOS
  // ----------------------------------------------------
  const abcProductsRows = useMemo(() => {
    const agg = new Map<
      string,
      {
        id: string;
        code: string;
        name: string;
        subtitle?: string;
        ordersSet: Set<string>;
        quantity: number;
        unit: string;
        totalValue: number;
      }
    >();

    for (const { order, item, netItemValue } of filteredOrderEntries) {
      const prod = productMap.get(item.productId);
      const supInfo = resolveProductSupplier(item.productId);
      const existing = agg.get(item.productId) || {
        id: item.productId,
        code: item.productCode || prod?.code || '-',
        name: item.description || prod?.description || 'Produto',
        subtitle: [prod?.family, supInfo.supplierId !== 'sem_fornecedor' ? `Forn: ${supInfo.supplierName}` : '']
          .filter(Boolean)
          .join(' • '),
        ordersSet: new Set<string>(),
        quantity: 0,
        unit: item.unit || prod?.unit || 'UN',
        totalValue: 0,
      };
      existing.ordersSet.add(order.id);
      existing.quantity += item.quantity || 0;
      existing.totalValue += netItemValue;
      agg.set(item.productId, existing);
    }

    return classifyAbcRows(
      Array.from(agg.values()).map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        subtitle: v.subtitle,
        ordersCount: v.ordersSet.size,
        quantity: v.quantity,
        unit: v.unit,
        totalValue: Math.round(v.totalValue * 100) / 100,
      }))
    );
  }, [filteredOrderEntries, productMap]);

  // ----------------------------------------------------
  // CÁLCULO 2: CURVA ABC DE CLIENTES
  // ----------------------------------------------------
  const abcCustomersRows = useMemo(() => {
    const agg = new Map<
      string,
      {
        id: string;
        code: string;
        name: string;
        subtitle?: string;
        ordersSet: Set<string>;
        quantity: number;
        totalValue: number;
      }
    >();

    for (const { order, item, netItemValue } of filteredOrderEntries) {
      const key = order.customerId || `anon:${order.customerName || 'Consumidor Final'}`;
      const cust = order.customerId ? customers.find((c) => c.id === order.customerId) : undefined;
      const existing = agg.get(key) || {
        id: key,
        code: cust?.code || '-',
        name: cust?.name || order.customerName || 'Consumidor Final',
        subtitle: [
          cust?.cpfCnpj || order.customerCpfCnpj || '',
          cust?.city ? `${cust.city}/${cust.state || ''}` : '',
        ]
          .filter(Boolean)
          .join(' • '),
        ordersSet: new Set<string>(),
        quantity: 0,
        totalValue: 0,
      };
      existing.ordersSet.add(order.id);
      existing.quantity += item.quantity || 0;
      existing.totalValue += netItemValue;
      agg.set(key, existing);
    }

    return classifyAbcRows(
      Array.from(agg.values()).map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        subtitle: v.subtitle,
        ordersCount: v.ordersSet.size,
        quantity: v.quantity,
        totalValue: Math.round(v.totalValue * 100) / 100,
      }))
    );
  }, [filteredOrderEntries, customers]);

  // ----------------------------------------------------
  // CÁLCULO 3: CURVA ABC DE FORNECEDORES
  // ----------------------------------------------------
  const abcSuppliersRows = useMemo(() => {
    if (supplierAnalysisBase === 'compras') {
      const agg = new Map<
        string,
        {
          id: string;
          code: string;
          name: string;
          subtitle?: string;
          ordersSet: Set<string>;
          quantity: number;
          totalValue: number;
        }
      >();

      const validPOs = (dbState.purchaseOrders || []).filter((po) => {
        if (po.status === 'cancelado') return false;
        if (companyFilter !== 'todas' && po.companyId !== companyFilter) return false;
        const poDate = (po.orderDate || po.createdAt || '').slice(0, 10);
        if (startDate && poDate < startDate) return false;
        if (endDate && poDate > endDate) return false;
        if (supplierFilter !== 'todos' && po.supplierId !== supplierFilter) return false;
        return true;
      });

      for (const po of validPOs) {
        for (const item of po.items || []) {
          if (selectedProductId && item.productId !== selectedProductId) continue;
          const sup = supplierMap.get(po.supplierId);
          const key = po.supplierId || `sup:${po.supplierName}`;
          const existing = agg.get(key) || {
            id: key,
            code: sup?.code || '-',
            name: sup?.tradeName || sup?.name || po.supplierName || 'Fornecedor',
            subtitle: [sup?.cpfCnpj, sup?.city ? `${sup.city}/${sup.state || ''}` : ''].filter(Boolean).join(' • '),
            ordersSet: new Set<string>(),
            quantity: 0,
            totalValue: 0,
          };
          existing.ordersSet.add(po.id);
          existing.quantity += item.buyQuantity || 0;
          existing.totalValue += item.totalCost || 0;
          agg.set(key, existing);
        }
      }

      return classifyAbcRows(
        Array.from(agg.values()).map((v) => ({
          id: v.id,
          code: v.code,
          name: v.name,
          subtitle: v.subtitle,
          ordersCount: v.ordersSet.size,
          quantity: v.quantity,
          totalValue: Math.round(v.totalValue * 100) / 100,
        }))
      );
    }

    // Padrão: Faturamento em Vendas atribuído por Fornecedor dos produtos vendidos (aplica todos os filtros de vendas)
    const agg = new Map<
      string,
      {
        id: string;
        code: string;
        name: string;
        subtitle?: string;
        ordersSet: Set<string>;
        quantity: number;
        totalValue: number;
      }
    >();

    for (const { order, item, netItemValue } of filteredOrderEntries) {
      const supInfo = resolveProductSupplier(item.productId);
      const sup = supplierMap.get(supInfo.supplierId);
      const existing = agg.get(supInfo.supplierId) || {
        id: supInfo.supplierId,
        code: supInfo.supplierCode || sup?.code || '-',
        name: supInfo.supplierName,
        subtitle: sup
          ? [sup.cpfCnpj, sup.city ? `${sup.city}/${sup.state || ''}` : ''].filter(Boolean).join(' • ')
          : 'Produtos sem fornecedor vinculado no cadastro',
        ordersSet: new Set<string>(),
        quantity: 0,
        totalValue: 0,
      };
      existing.ordersSet.add(order.id);
      existing.quantity += item.quantity || 0;
      existing.totalValue += netItemValue;
      agg.set(supInfo.supplierId, existing);
    }

    return classifyAbcRows(
      Array.from(agg.values()).map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        subtitle: v.subtitle,
        ordersCount: v.ordersSet.size,
        quantity: v.quantity,
        totalValue: Math.round(v.totalValue * 100) / 100,
      }))
    );
  }, [
    supplierAnalysisBase,
    filteredOrderEntries,
    dbState.purchaseOrders,
    companyFilter,
    startDate,
    endDate,
    supplierFilter,
    selectedProductId,
    supplierMap,
  ]);

  const currentRows = useMemo(() => {
    if (activeTab === 'abc_produtos') return abcProductsRows;
    if (activeTab === 'abc_clientes') return abcCustomersRows;
    if (activeTab === 'abc_fornecedores') return abcSuppliersRows;
    return [];
  }, [activeTab, abcProductsRows, abcCustomersRows, abcSuppliersRows]);

  const abcSummary = useMemo(() => {
    const total = currentRows.reduce((s, r) => s + r.totalValue, 0);
    const calcGroup = (cls: AbcClass) => {
      const rows = currentRows.filter((r) => r.abcClass === cls);
      const value = rows.reduce((s, r) => s + r.totalValue, 0);
      return {
        count: rows.length,
        value,
        percent: total > 0 ? (value / total) * 100 : 0,
      };
    };
    return {
      totalValue: total,
      totalItems: currentRows.length,
      A: calcGroup('A'),
      B: calcGroup('B'),
      C: calcGroup('C'),
    };
  }, [currentRows]);

  const handleExportExcel = () => {
    if (currentRows.length === 0) {
      toast.warning('Não há dados para exportar com os filtros atuais.', 'Relatório Vazio');
      return;
    }

    const titleMap: Record<AbcReportTab, string> = {
      abc_overview: 'Curva ABC',
      abc_produtos: 'Curva_ABC_Produtos',
      abc_clientes: 'Curva_ABC_Clientes',
      abc_fornecedores: 'Curva_ABC_Fornecedores',
    };

    const sheetData = currentRows.map((row, idx) => ({
      'Ranking': idx + 1,
      'Código': row.code,
      [activeTab === 'abc_produtos'
        ? 'Produto'
        : activeTab === 'abc_clientes'
        ? 'Cliente'
        : 'Fornecedor']: row.name,
      'Detalhe': row.subtitle || '',
      'Qtd Pedidos': row.ordersCount,
      'Qtd Itens': row.quantity,
      'Valor Total (R$)': row.totalValue,
      '% Participação': Number(row.sharePercent.toFixed(2)),
      '% Acumulado': Number(row.cumulativePercent.toFixed(2)),
      'Classe ABC': row.abcClass,
    }));

    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Curva_ABC');
    XLSX.writeFile(wb, `${titleMap[activeTab]}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Planilha Excel gerada com sucesso!', 'Exportação Concluída');
  };

  const handlePrintReport = () => {
    window.print();
  };

  const hasCustomFilters =
    companyFilter !== currentCompany.id ||
    startDate !== defaultDates.start ||
    endDate !== defaultDates.end ||
    originFilter !== 'todas' ||
    sellerFilter !== 'todos' ||
    supplierFilter !== 'todos' ||
    selectedCustomerId !== '' ||
    selectedProductId !== '';

  const reportTitle =
    activeTab === 'abc_produtos'
      ? 'Curva ABC de Produtos'
      : activeTab === 'abc_clientes'
      ? 'Curva ABC de Clientes'
      : activeTab === 'abc_fornecedores'
      ? 'Curva ABC de Fornecedores'
      : 'Curva ABC — Guia Estratégico de Gestão';

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 12mm 12mm;
          }
          body * {
            visibility: hidden !important;
          }
          .printable-abc-report, .printable-abc-report * {
            visibility: visible !important;
          }
          .printable-abc-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print-abc {
            display: none !important;
          }
        }
      `}</style>

      {/* ======================================================== */}
      {/* CABEÇALHO & SUB-NAVEGAÇÃO DOS RELATÓRIOS DE VENDAS       */}
      {/* ======================================================== */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3 no-print-abc">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
              <BarChart3 size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                Relatórios de Vendas &amp; Curva ABC
              </h2>
              <p className="text-xs text-slate-500">
                Análise estratégica de Pareto (80/15/5) para apoiar decisões de estoque, vendas, compras e relacionamento comercial.
              </p>
            </div>
          </div>

          {activeTab !== 'abc_overview' && (
            <div className="flex items-center flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                <FileSpreadsheet size={15} />
                <span>Exportar Excel</span>
              </button>
              <button
                type="button"
                onClick={handlePrintReport}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Printer size={15} />
                <span>Imprimir Folha A4</span>
              </button>
            </div>
          )}
        </div>

        {/* 4 Abas do Módulo Relatórios */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl overflow-x-auto text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('abc_overview')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'abc_overview'
                ? 'bg-white text-indigo-700 shadow-xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen size={14} />
            <span>Curva ABC</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('abc_produtos')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'abc_produtos'
                ? 'bg-white text-indigo-700 shadow-xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package size={14} />
            <span>Curva ABC de Produtos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('abc_clientes')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'abc_clientes'
                ? 'bg-white text-indigo-700 shadow-xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users size={14} />
            <span>Curva ABC de Clientes</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('abc_fornecedores')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'abc_fornecedores'
                ? 'bg-white text-indigo-700 shadow-xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck size={14} />
            <span>Curva ABC de Fornecedores</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* ABA 1: CURVA ABC — INFORMATIVO ESTRATÉGICO (SEM LISTA)   */}
      {/* ======================================================== */}
      {activeTab === 'abc_overview' && (
        <div className="space-y-4">
          {/* Banner Principal Explicativo */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="space-y-1.5 max-w-3xl">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-extrabold uppercase tracking-wider">
                  <Target size={13} />
                  <span>Inteligência Comercial &amp; Princípio de Pareto (80/20)</span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  O que é o Relatório de Curva ABC e como ele ajuda o gestor da empresa?
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  A <strong>Curva ABC</strong> é uma metodologia gerencial baseada no <strong>Teorema de Pareto</strong> que ordena produtos, clientes ou fornecedores do maior para o menor impacto financeiro. Em praticamente toda empresa, cerca de <strong>20% dos itens ou parceiros geram aproximadamente 80% do faturamento</strong>. Separar o que é vital do que é secundário permite concentrar tempo, capital de giro e esforços onde o retorno é real.
                </p>
              </div>
            </div>

            {/* As 3 Classes da Curva ABC */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-900">
                    Classe A — Alta Prioridade
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-xs font-black">
                    Até 80%
                  </span>
                </div>
                <p className="text-xs text-emerald-950 leading-relaxed">
                  Concentra os itens, clientes ou fornecedores que formam os primeiros <strong>80% do faturamento acumulado</strong>. Nunca podem sofrer ruptura de estoque ou perda de atendimento, pois sustentam o resultado do negócio.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-900">
                    Classe B — Potencial Médio
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-xs font-black">
                    80% a 95%
                  </span>
                </div>
                <p className="text-xs text-amber-950 leading-relaxed">
                  Representa cerca de <strong>15% da receita acumulada</strong>. São produtos e clientes regulares que oferecem excelente oportunidade de crescimento (cross-sell, combos e ativação comercial) para migrarem à Classe A.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Classe C — Cauda Longa
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-600 text-white text-xs font-black">
                    95% a 100%
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Reúne grande volume de cadastros que somam apenas os últimos <strong>5% do faturamento</strong>. Ajuda o gestor a identificar capital imobilizado, excesso de variedade e custos operacionais desnecessários.
                </p>
              </div>
            </div>

            {/* Aplicações Práticas para o Gestor + Acesso Direto aos Relatórios */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Award size={14} className="text-indigo-600" />
                <span>Como aplicar cada relatório na tomada de decisão</span>
              </h4>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Card 1: Produtos */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 transition-all flex flex-col justify-between gap-3 shadow-2xs">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-indigo-700 font-extrabold text-sm">
                      <Package size={18} />
                      <span>Curva ABC de Produtos</span>
                    </div>
                    <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside leading-relaxed">
                      <li>Garante estoque mínimo reforçado nos itens <strong>Classe A</strong> para não perder vendas.</li>
                      <li>Evita compras excessivas de produtos <strong>Classe C</strong> que empatam caixa no depósito.</li>
                      <li>Orienta campanhas promocionais, formação de preço e revisão de margem por giro.</li>
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('abc_produtos')}
                    className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Abrir Curva ABC de Produtos</span>
                    <ArrowRight size={14} />
                  </button>
                </div>

                {/* Card 2: Clientes */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 transition-all flex flex-col justify-between gap-3 shadow-2xs">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-700 font-extrabold text-sm">
                      <Users size={18} />
                      <span>Curva ABC de Clientes</span>
                    </div>
                    <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside leading-relaxed">
                      <li>Identifica rapidamente os compradores <strong>Classe A</strong> para fidelização e atendimento VIP.</li>
                      <li>Mostra clientes <strong>Classe B</strong> com potencial para aumentar ticket médio e recorrência.</li>
                      <li>Auxilia a equipe externa (Vendas Mobile) a planejar rotas e visitas mais rentáveis.</li>
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('abc_clientes')}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Abrir Curva ABC de Clientes</span>
                    <ArrowRight size={14} />
                  </button>
                </div>

                {/* Card 3: Fornecedores */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-amber-300 transition-all flex flex-col justify-between gap-3 shadow-2xs">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-amber-700 font-extrabold text-sm">
                      <Truck size={18} />
                      <span>Curva ABC de Fornecedores</span>
                    </div>
                    <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside leading-relaxed">
                      <li>Revela quais fornecedores sustentam a maior fatia das vendas da empresa.</li>
                      <li>Fortalece o poder de negociação por melhores preços, descontos e prazos na <strong>Classe A</strong>.</li>
                      <li>Ajuda a reduzir riscos de dependência buscando fornecedores alternativos estratégicos.</li>
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('abc_fornecedores')}
                    className="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Abrir Curva ABC de Fornecedores</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ABAS 2, 3 E 4: FILTROS + RELATÓRIO DE CURVA ABC          */}
      {/* ======================================================== */}
      {activeTab !== 'abc_overview' && (
        <div className="space-y-4">
          {/* Painel de Filtros Completo */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3 no-print-abc">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Filter size={15} className="text-indigo-600" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Filtros do Relatório ({reportTitle})
                </span>
              </div>

              <div className="flex items-center flex-wrap gap-1.5">
                {activeTab === 'abc_fornecedores' && (
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold mr-1">
                    <button
                      type="button"
                      onClick={() => setSupplierAnalysisBase('vendas')}
                      className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                        supplierAnalysisBase === 'vendas'
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Ordena os fornecedores pela receita das vendas dos seus produtos"
                    >
                      Base: Vendas Geradas
                    </button>
                    <button
                      type="button"
                      onClick={() => setSupplierAnalysisBase('compras')}
                      className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                        supplierAnalysisBase === 'compras'
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Ordena os fornecedores pelo volume comprado em Pedidos de Compra"
                    >
                      Base: Compras Realizadas
                    </button>
                  </div>
                )}

                {hasCustomFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>Limpar Filtros</span>
                  </button>
                )}
              </div>
            </div>

            {/* Grade de Filtros: Empresa, Período (De/Até), Origem, Vendedor, Fornecedor, Cliente (3+ chars), Produto (3+ chars) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* 1. Empresa */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <Building2 size={12} className="text-slate-400" />
                  <span>Empresa</span>
                </label>
                <select
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="todas">Todas as Empresas (Consolidado)</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.tradeName || c.name} {c.type === 'matriz' ? '(Matriz)' : '(Filial)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Período */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <Calendar size={12} className="text-slate-400" />
                  <span>Período (De / Até)</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-[11px] font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-[11px] font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* 3. Origem */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <Store size={12} className="text-slate-400" />
                  <span>Origem da Venda</span>
                </label>
                <select
                  value={originFilter}
                  onChange={(e) => setOriginFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="todas">Todas as Origens</option>
                  <option value="pdv">PDV Balcão</option>
                  <option value="retaguarda_pedido">Pedido de Venda</option>
                  <option value="externa_celular">Vendas Mobile</option>
                  <option value="balcao">Balcão</option>
                </select>
              </div>

              {/* 4. Vendedor */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <UserCheck size={12} className="text-slate-400" />
                  <span>Vendedor</span>
                </label>
                <select
                  value={sellerFilter}
                  onChange={(e) => setSellerFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="todos">Todos os Vendedores</option>
                  {sellerOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Cliente (Busca a partir de 3 caracteres) */}
              <div ref={customerBoxRef} className="relative">
                <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <Users size={12} className="text-slate-400" />
                  <span>Cliente (mín. 3 caracteres)</span>
                </label>
                {selectedCustomerObj && !customerDropdownOpen ? (
                  <div className="flex items-center justify-between gap-1.5 bg-indigo-50 border border-indigo-200 rounded-xl px-2.5 py-2 text-xs font-bold text-indigo-900">
                    <span className="truncate">{selectedCustomerObj.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomerId('');
                        setCustomerSearch('');
                      }}
                      className="text-indigo-500 hover:text-indigo-800 p-0.5 cursor-pointer shrink-0"
                      title="Limpar cliente"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={customerSearch}
                      onFocus={() => setCustomerDropdownOpen(true)}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setCustomerDropdownOpen(true);
                      }}
                      placeholder="Todos os clientes (digite 3+ letras)..."
                      className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                    {customerSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerSearch('');
                          setSelectedCustomerId('');
                        }}
                        className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}

                {customerDropdownOpen && (
                  <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto text-xs">
                    {!isCustomerSearchReady ? (
                      <div className="p-3 text-slate-500 text-[11px] flex items-center gap-1.5">
                        <Info size={13} className="text-indigo-500 shrink-0" />
                        <span>
                          Digite pelo menos <strong>3 caracteres</strong> do nome, código ou CPF/CNPJ ({normalizedCustomerTerm.length}/3).
                        </span>
                      </div>
                    ) : filteredCustomerOptions.length === 0 ? (
                      <div className="p-3 text-slate-500 text-[11px]">
                        Nenhum cliente encontrado para &quot;{customerSearch}&quot;.
                      </div>
                    ) : (
                      filteredCustomerOptions.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomerId(c.id);
                            setCustomerSearch('');
                            setCustomerDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-slate-100 last:border-b-0 cursor-pointer"
                        >
                          <div className="font-bold text-slate-800 truncate">{c.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {c.code} {c.cpfCnpj ? `• ${c.cpfCnpj}` : ''} {c.city ? `• ${c.city}/${c.state}` : ''}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 6. Produto (Busca a partir de 3 caracteres) */}
              <div ref={productBoxRef} className="relative">
                <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <Package size={12} className="text-slate-400" />
                  <span>Produto (mín. 3 caracteres)</span>
                </label>
                {selectedProductObj && !productDropdownOpen ? (
                  <div className="flex items-center justify-between gap-1.5 bg-indigo-50 border border-indigo-200 rounded-xl px-2.5 py-2 text-xs font-bold text-indigo-900">
                    <span className="truncate">
                      {selectedProductObj.code} - {selectedProductObj.description}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProductId('');
                        setProductSearch('');
                      }}
                      className="text-indigo-500 hover:text-indigo-800 p-0.5 cursor-pointer shrink-0"
                      title="Limpar produto"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={productSearch}
                      onFocus={() => setProductDropdownOpen(true)}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setProductDropdownOpen(true);
                      }}
                      placeholder="Todos os produtos (digite 3+ letras)..."
                      className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                    {productSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setProductSearch('');
                          setSelectedProductId('');
                        }}
                        className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}

                {productDropdownOpen && (
                  <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto text-xs">
                    {!isProductSearchReady ? (
                      <div className="p-3 text-slate-500 text-[11px] flex items-center gap-1.5">
                        <Info size={13} className="text-indigo-500 shrink-0" />
                        <span>
                          Digite pelo menos <strong>3 caracteres</strong> da descrição ou código ({normalizedProductTerm.length}/3).
                        </span>
                      </div>
                    ) : filteredProductOptions.length === 0 ? (
                      <div className="p-3 text-slate-500 text-[11px]">
                        Nenhum produto encontrado para &quot;{productSearch}&quot;.
                      </div>
                    ) : (
                      filteredProductOptions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedProductId(p.id);
                            setProductSearch('');
                            setProductDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-slate-100 last:border-b-0 cursor-pointer"
                        >
                          <div className="font-bold text-slate-800 truncate">{p.description}</div>
                          <div className="text-[10px] text-slate-500">
                            Cód: {p.code} • {p.family} • {p.unit}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 7. Fornecedor */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <Truck size={12} className="text-slate-400" />
                  <span>Fornecedor</span>
                </label>
                <select
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="todos">Todos os Fornecedores</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.tradeName || s.name} ({s.code})
                    </option>
                  ))}
                  <option value="sem_fornecedor">Sem Fornecedor Vinculado</option>
                </select>
              </div>

              {/* Atalhos Rápidos de Período */}
              <div className="flex flex-col justify-end">
                <label className="text-[11px] font-bold text-slate-600 mb-1">Atalho de Período</label>
                <div className="flex items-center gap-1 flex-wrap">
                  {[
                    { id: 'mes_atual', label: 'Mês Atual' },
                    { id: 'mes_anterior', label: 'Mês Ant.' },
                    { id: '30_dias', label: '30d' },
                    { id: 'ano_atual', label: 'Ano' },
                    { id: 'tudo', label: 'Tudo' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPeriodPreset(preset.id as any)}
                      className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-[10px] font-bold border border-slate-200 transition-colors cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* ÁREA IMPRIMÍVEL DO RELATÓRIO DE CURVA ABC                */}
          {/* ======================================================== */}
          <div className="printable-abc-report space-y-4">
            {/* Cabeçalho de Impressão A4 (visível na impressão) */}
            <div className="hidden print:block pb-3 border-b border-slate-300 space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-base font-black uppercase text-slate-900">
                    {currentCompany.tradeName || currentCompany.name} — {reportTitle}
                  </h1>
                  <p className="text-[10px] text-slate-600">
                    Período: {startDate || 'Início'} até {endDate || 'Hoje'} • Origem: {originFilter === 'todas' ? 'Todas' : getOriginLabel(originFilter)}
                  </p>
                </div>
                <div className="text-right text-[10px] text-slate-500">
                  Emitido em {new Date().toLocaleString('pt-BR')}
                </div>
              </div>
            </div>

            {/* Cards Resumo das Classes A, B e C */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Total Analisado ({abcSummary.totalItems} {activeTab === 'abc_produtos' ? 'produtos' : activeTab === 'abc_clientes' ? 'clientes' : 'fornecedores'})
                </span>
                <div className="text-xl font-black text-slate-900 font-mono mt-1">
                  {formatCurrency(abcSummary.totalValue)}
                </div>
                <span className="text-[11px] text-slate-500">100% da base filtrada</span>
              </div>

              <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
                    Classe A (Principais)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black">
                    {abcSummary.A.count} itens
                  </span>
                </div>
                <div className="text-xl font-black text-emerald-950 font-mono mt-1">
                  {formatCurrency(abcSummary.A.value)}
                </div>
                <span className="text-[11px] font-bold text-emerald-700">
                  {abcSummary.A.percent.toFixed(1)}% do total
                </span>
              </div>

              <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800">
                    Classe B (Intermediários)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-500 text-white text-[10px] font-black">
                    {abcSummary.B.count} itens
                  </span>
                </div>
                <div className="text-xl font-black text-amber-950 font-mono mt-1">
                  {formatCurrency(abcSummary.B.value)}
                </div>
                <span className="text-[11px] font-bold text-amber-700">
                  {abcSummary.B.percent.toFixed(1)}% do total
                </span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                    Classe C (Complementares)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-600 text-white text-[10px] font-black">
                    {abcSummary.C.count} itens
                  </span>
                </div>
                <div className="text-xl font-black text-slate-900 font-mono mt-1">
                  {formatCurrency(abcSummary.C.value)}
                </div>
                <span className="text-[11px] font-bold text-slate-600">
                  {abcSummary.C.percent.toFixed(1)}% do total
                </span>
              </div>
            </div>

            {/* Barra Visual de Participação Pareto */}
            {abcSummary.totalValue > 0 && (
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>Distribuição Visual da Curva ABC</span>
                  <span className="font-mono">
                    A: {abcSummary.A.percent.toFixed(1)}% • B: {abcSummary.B.percent.toFixed(1)}% • C: {abcSummary.C.percent.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-3.5 rounded-full overflow-hidden flex bg-slate-100 border border-slate-200">
                  {abcSummary.A.percent > 0 && (
                    <div
                      className="bg-emerald-500 h-full transition-all"
                      style={{ width: `${abcSummary.A.percent}%` }}
                      title={`Classe A: ${abcSummary.A.percent.toFixed(1)}%`}
                    />
                  )}
                  {abcSummary.B.percent > 0 && (
                    <div
                      className="bg-amber-400 h-full transition-all"
                      style={{ width: `${abcSummary.B.percent}%` }}
                      title={`Classe B: ${abcSummary.B.percent.toFixed(1)}%`}
                    />
                  )}
                  {abcSummary.C.percent > 0 && (
                    <div
                      className="bg-slate-400 h-full transition-all"
                      style={{ width: `${abcSummary.C.percent}%` }}
                      title={`Classe C: ${abcSummary.C.percent.toFixed(1)}%`}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Tabela Analítica da Curva ABC */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              {currentRows.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <AlertCircle size={32} className="mx-auto text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">
                    Nenhum registro encontrado para os filtros selecionados
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Ajuste o período, empresa, origem, vendedor, produto, cliente ou fornecedor para visualizar a classificação da Curva ABC.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white text-[10px] font-extrabold uppercase tracking-wider">
                        <th className="py-2.5 px-3 text-center w-12">#</th>
                        <th className="py-2.5 px-3 w-24">Código</th>
                        <th className="py-2.5 px-3">
                          {activeTab === 'abc_produtos'
                            ? 'Produto'
                            : activeTab === 'abc_clientes'
                            ? 'Cliente'
                            : 'Fornecedor'}
                        </th>
                        <th className="py-2.5 px-3 text-center w-20">
                          {activeTab === 'abc_fornecedores' && supplierAnalysisBase === 'compras' ? 'Compras' : 'Pedidos'}
                        </th>
                        <th className="py-2.5 px-3 text-right w-24">Qtd.</th>
                        <th className="py-2.5 px-3 text-right w-32">Valor Total</th>
                        <th className="py-2.5 px-3 text-right w-24">% Part.</th>
                        <th className="py-2.5 px-3 text-right w-24">% Acum.</th>
                        <th className="py-2.5 px-3 text-center w-24">Classe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {currentRows.map((row, idx) => (
                        <tr
                          key={row.id}
                          className={
                            row.abcClass === 'A'
                              ? 'bg-emerald-50/25 hover:bg-emerald-50/50'
                              : row.abcClass === 'B'
                              ? 'bg-amber-50/20 hover:bg-amber-50/40'
                              : 'bg-white hover:bg-slate-50'
                          }
                        >
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                            {idx + 1}º
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-700 text-[11px]">
                            {row.code}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-slate-900">{row.name}</div>
                            {row.subtitle && (
                              <div className="text-[10px] text-slate-500">{row.subtitle}</div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-semibold text-slate-700">
                            {row.ordersCount}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700">
                            {formatQuantity(row.quantity)} {row.unit || ''}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-extrabold text-slate-900">
                            {formatCurrency(row.totalValue)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-700">
                            {row.sharePercent.toFixed(1)}%
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">
                            {row.cumulativePercent.toFixed(1)}%
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-md text-[11px] font-black border ${
                                row.abcClass === 'A'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : row.abcClass === 'B'
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-300'
                              }`}
                            >
                              Classe {row.abcClass}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
