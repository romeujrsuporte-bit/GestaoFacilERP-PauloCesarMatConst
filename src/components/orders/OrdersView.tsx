import React, { useState, useEffect, useRef } from 'react';
import {
  ClipboardList,
  Search,
  Filter,
  Plus,
  Printer,
  Share2,
  ArrowRightCircle,
  XCircle,
  CheckCircle,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Pencil,
  ShoppingBag,
  ShoppingCart,
  Minus,
  Trash2,
  UserPlus,
  Tag,
  Barcode,
  DollarSign,
  CreditCard,
  QrCode,
  Warehouse,
  Package,
  Send,
  X,
  FileText,
  Check,
  ChevronRight,
  User,
  Clock,
  Truck,
  Calendar,
  Building2,
  Layers,
  ShieldCheck,
  Percent,
  ChevronDown,
  Info,
  Boxes,
  UserCheck,
  Hash,
  Receipt,
  Ticket,
  Gift,
} from 'lucide-react';
import { Database } from '../../services/db';
import { FirebaseSyncService } from '../../services/firebaseSync';
import { Order, OrderType, OrderCommercialKind, OrderOrigin, OrderStatus, Product, Customer, OrderItem, DiscountAuthorizationRecord } from '../../types';
import { StockEngine } from '../../services/stockEngine';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { ReceiptModal } from '../common/ReceiptModal';
import { SaleConfirmationModal } from '../common/SaleConfirmationModal';
import { FullCustomerModal } from '../common/FullCustomerModal';
import { PriceLookupModal } from '../common/PriceLookupModal';
import { EditOrderModal } from './EditOrderModal';
import { CustomerSearchCombobox } from './CustomerSearchCombobox';
import { toast } from '../../services/toast';
import {
  isBonusOrder,
  isBillableSaleOrder,
  getOrderReferenceTotal,
  formatBonusStockExitNote,
  formatBonusStockReversalNote,
} from '../../utils/orderUtils';
import {
  SaleObservationAlerts,
  SaleObservationAlertItem,
  getProductSaleAlert,
  upsertSaleAlert,
  syncCustomerSaleAlert,
  dismissSaleAlert,
  clearProductSaleAlerts,
} from '../common/SaleObservationAlerts';
import { DiscountAuthorizationModal } from '../common/DiscountAuthorizationModal';
import {
  DiscountViolationDetails,
  clearSaleSessionAuthorizations,
  evaluateItemMaxDiscount,
  generateSaleSessionId,
  revokeDiscountAuthorization,
  validateOrderDiscounts,
} from '../../services/discountControl';

interface OrdersViewProps {
  initialMode?: 'novo_pedido' | 'historico';
  initialDocType?: 'venda' | 'orcamento';
  initialShowProfit?: boolean;
  onStartReturn?: (orderId: string) => void;
  cart?: OrderItem[];
  setCart?: React.Dispatch<React.SetStateAction<OrderItem[]>>;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  initialMode = 'novo_pedido',
  initialDocType = 'venda',
  initialShowProfit = false,
  onStartReturn,
  cart: propCart,
  setCart: propSetCart,
}) => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();

  const canViewGrossProfit = Database.canCurrentUserView('grossProfit');
  const canViewProfitMargin = Database.canCurrentUserView('profitMargin');
  const canViewProductCosts = Database.canCurrentUserView('productCosts');

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  // Aba ativa: 'novo_pedido' (padrão) | 'historico'
  const [activeTab, setActiveTab] = useState<'novo_pedido' | 'historico'>(initialMode);

  // Exibir análise de Lucro Bruto Real por pedido no Histórico
  const [showGrossProfit, setShowGrossProfit] = useState<boolean>(
    Boolean(initialShowProfit && Database.canCurrentUserView('grossProfit'))
  );

  useEffect(() => {
    setShowGrossProfit(Boolean(initialShowProfit && canViewGrossProfit));
  }, [initialShowProfit, canViewGrossProfit]);

  // Tipo de documento na emissão: 'venda' | 'orcamento'
  const [docType, setDocType] = useState<'venda' | 'orcamento'>(initialDocType);
  // Natureza comercial do pedido: 'venda_normal' (padrão) | 'bonificacao'
  const [orderKind, setOrderKind] = useState<OrderCommercialKind>('venda_normal');
  const isBonusMode = docType === 'venda' && orderKind === 'bonificacao';

  // Sessão ativa e modal bloqueante de autorização para desconto máximo por produto
  const saleSessionIdRef = useRef<string>(generateSaleSessionId('PED'));
  const [discountAuthPrompt, setDiscountAuthPrompt] = useState<{
    violation: DiscountViolationDetails;
    queuePosition?: { current: number; total: number };
    onAuthorized: (record: DiscountAuthorizationRecord) => void;
    onReduceToLimit?: () => void;
  } | null>(null);

  // ==========================================
  // ESTADO DA EMISSÃO DE NOVO PEDIDO / ORÇAMENTO
  // ==========================================
  const [internalCart, setInternalCart] = useState<OrderItem[]>([]);
  const cart = propCart !== undefined ? propCart : internalCart;
  const setCart = propSetCart || setInternalCart;
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [selectedLocationId, setSelectedLocationId] = useState<string>(() => {
    const compLoc = StockEngine.getCompanyDefaultLocation(Database.getState().stockLocations, currentCompany.id);
    return compLoc?.id || 'loc-comercial';
  });

  // Atualiza depósito selecionado quando a empresa ativa mudar
  useEffect(() => {
    const compLoc = StockEngine.getCompanyDefaultLocation(dbState.stockLocations, currentCompany.id);
    if (compLoc && compLoc.id !== selectedLocationId) {
      setSelectedLocationId(compLoc.id);
    }
  }, [currentCompany.id, dbState.stockLocations]);

  const [filterByLocationStock, setFilterByLocationStock] = useState<boolean>(true);

  // Quantidade temporária por produto no catálogo
  const [qtyToAddMap, setQtyToAddMap] = useState<Record<string, number>>({});

  // Desconto global no pedido
  const [discountType, setDiscountType] = useState<'percent' | 'value'>(() => {
    return (localStorage.getItem('omni_discount_type') as 'percent' | 'value') || 'percent';
  });
  const [discountInput, setDiscountInput] = useState<string>('');

  const handleDiscountTypeChange = (newType: 'percent' | 'value') => {
    setDiscountType(newType);
    localStorage.setItem('omni_discount_type', newType);
  };

  // Forma de Pagamento e Parcelas
  const [paymentMethod, setPaymentMethod] = useState<Order['paymentMethod'] | ''>('');
  const [selectedBoletoAccountId, setSelectedBoletoAccountId] = useState<string>(() => {
    const boletoMethod = Database.getPaymentMethods().find((m) => m.type === 'boleto');
    if (boletoMethod?.defaultAccountId) return boletoMethod.defaultAccountId;
    const boletoAccs = Database.getBoletoAccounts();
    return boletoAccs[0]?.id || '';
  });
  const [installments, setInstallments] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');

  // Modal de Cadastro Rápido de Cliente
  const [showQuickCustomerModal, setShowQuickCustomerModal] = useState<boolean>(false);
  const [quickCustName, setQuickCustName] = useState('');
  const [quickCustPhone, setQuickCustPhone] = useState('');
  const [quickCustCpfCnpj, setQuickCustCpfCnpj] = useState('');
  const [quickCustCreditLimit, setQuickCustCreditLimit] = useState('');

  // Modal de Ajuste (Desconto ou Acréscimo) por Item
  const [showItemDiscountModal, setShowItemDiscountModal] = useState<boolean>(false);
  const [discountingItemId, setDiscountingItemId] = useState<string | null>(null);
  const [itemAdjustmentMode, setItemAdjustmentMode] = useState<'desconto' | 'acrescimo'>('desconto');
  const [itemDiscountType, setItemDiscountType] = useState<'percent' | 'value'>('percent');
  const [itemDiscountInput, setItemDiscountInput] = useState<string>('');

  // ==========================================
  // CONFIGURAÇÕES DO NOVO LAYOUT EXECUTIVO
  // ==========================================
  // Modo de inclusão de itens: 'insercao_rapida' (Padrão ERP) | 'catalogo_grade'
  const [itemsEntryMode, setItemsEntryMode] = useState<'insercao_rapida' | 'catalogo_grade'>('insercao_rapida');

  // Estado da barra rápida inteligente de inserção de itens
  const [fastSelectedProductId, setFastSelectedProductId] = useState<string>('');
  const [fastProductSearchTerm, setFastProductSearchTerm] = useState<string>('');
  const [fastItemQtyInput, setFastItemQtyInput] = useState<string>('1');
  const fastItemQty = Math.max(0, parseFloat(fastItemQtyInput.replace(',', '.')) || 0);
  const [fastItemAdjustmentMode, setFastItemAdjustmentMode] = useState<'desconto' | 'acrescimo'>('desconto');
  const [fastItemAdjustmentInput, setFastItemAdjustmentInput] = useState<string>('');
  const [fastItemAdjustmentType, setFastItemAdjustmentType] = useState<'percent' | 'value'>('percent');
  const [showProductLookupModal, setShowProductLookupModal] = useState<boolean>(false);
  const [showPriceLookupModal, setShowPriceLookupModal] = useState<boolean>(false);
  const [productLookupSearch, setProductLookupSearch] = useState<string>('');
  const [highlightedProductIndex, setHighlightedProductIndex] = useState<number>(0);
  const [productFeedback, setProductFeedback] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const fastProductInputRef = useRef<HTMLInputElement>(null);
  const fastQtyInputRef = useRef<HTMLInputElement>(null);
  const priceLookupBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (productFeedback) {
      const timer = setTimeout(() => setProductFeedback(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [productFeedback]);

  // Expedição, Logística & Condições Comerciais do Pedido
  const [freightType, setFreightType] = useState<'retirada' | 'entrega_propria' | 'cif' | 'fob' | 'sem_frete'>('entrega_propria');
  const [deliveryForecast, setDeliveryForecast] = useState<string>('A Combinar');
  const [paymentTerms, setPaymentTerms] = useState<string>('');
  const [internalNotes, setInternalNotes] = useState<string>('');
  const [showNotesModal, setShowNotesModal] = useState<boolean>(false);

  // ==========================================
  // ESTADO DO HISTÓRICO DE PEDIDOS
  // ==========================================
  const now = new Date();
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentMonthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
  const todayIso = now.toISOString().split('T')[0];

  // Padrão solicitado: listar sempre apenas pedidos do "Tipo Documento" -> "Vendas"
  const [filterType, setFilterType] = useState<string>('venda');
  const [filterOrigin, setFilterOrigin] = useState<string>('todos');
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [filterSeller, setFilterSeller] = useState<string>('todos');
  const [searchCustomer, setSearchCustomer] = useState<string>('');
  // Padrão solicitado: listar sempre apenas os pedidos do mês atual
  const [startDate, setStartDate] = useState<string>(currentMonthStart);
  const [endDate, setEndDate] = useState<string>(currentMonthEnd);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showSaleConfirmationModal, setShowSaleConfirmationModal] = useState(false);
  const [viewDetailsOrder, setViewDetailsOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // Modais In-App de Cancelamento/Estorno e Conversão de Orçamento
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('Cancelamento solicitado pelo cliente');
  const [deletePermanently, setDeletePermanently] = useState<boolean>(false);
  const [isProcessingCancellation, setIsProcessingCancellation] = useState<boolean>(false);
  const [quoteToConvert, setQuoteToConvert] = useState<Order | null>(null);
  const [isConvertingQuote, setIsConvertingQuote] = useState<boolean>(false);

  // Clientes e Locais
  const customers = dbState.customers.filter((c) => c.status === 'ativo');
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const selectedCustomerVouchers = selectedCustomerId
    ? Database.getAvailableVouchersByCustomer(selectedCustomerId, currentCompany.id)
    : [];
  const selectedCustomerVoucherBalance = selectedCustomerVouchers.reduce(
    (sum, v) => sum + (v.remainingBalance || 0),
    0
  );
  const lastAlertedVoucherCustomerRef = useRef<string>('');
  const [saleObservationAlerts, setSaleObservationAlerts] = useState<SaleObservationAlertItem[]>([]);
  const lastObservationCustomerSigRef = useRef<string>('');
  const lastAlertedFastProductIdRef = useRef<string>('');

  useEffect(() => {
    if (!selectedCustomerId) {
      lastAlertedVoucherCustomerRef.current = '';
      return;
    }
    if (
      selectedCustomer &&
      selectedCustomerVoucherBalance > 0 &&
      lastAlertedVoucherCustomerRef.current !== selectedCustomerId
    ) {
      lastAlertedVoucherCustomerRef.current = selectedCustomerId;
      toast.info(
        `O cliente "${selectedCustomer.name}" possui ${formatCurrency(selectedCustomerVoucherBalance)} em Vale (${selectedCustomerVouchers.length} crédito(s) ativo(s)) cadastrado no Financeiro.`,
        'Cliente com Vale Disponível'
      );
    }
  }, [selectedCustomerId, selectedCustomer, selectedCustomerVoucherBalance, selectedCustomerVouchers.length]);

  useEffect(() => {
    const activeCust = selectedCustomerId ? selectedCustomer : undefined;
    const sig = activeCust
      ? `${activeCust.id}|${activeCust.showSaleAlert ? '1' : '0'}|${String(activeCust.notes ?? '').trim()}`
      : '';
    if (lastObservationCustomerSigRef.current === sig) return;
    lastObservationCustomerSigRef.current = sig;
    setSaleObservationAlerts((prev) => syncCustomerSaleAlert(prev, activeCust));
  }, [selectedCustomerId, selectedCustomer?.id, selectedCustomer?.showSaleAlert, selectedCustomer?.notes, selectedCustomer?.name]);

  // Locais vinculados à empresa ativa ou da operação
  const locations = dbState.stockLocations.filter(
    (l) => l.status === 'ativo' && (!l.companyId || l.companyId === currentCompany.id)
  );
  const selectedLocation = locations.find((l) => l.id === selectedLocationId) ||
    StockEngine.getCompanyDefaultLocation(locations, currentCompany.id) ||
    locations[0] ||
    { id: 'loc-comercial', code: 'COM-01', name: 'Comercial', type: 'comercial', status: 'ativo', companyId: currentCompany.id };
  const selectedLocationName = selectedLocation?.name || 'Comercial';

  // Categorias de produtos
  const categories = ['todos', ...Array.from(new Set(dbState.products.map((p) => p.family).filter(Boolean)))];

  // Produtos filtrados de acordo com o Depósito de Saída selecionado (Catálogo)
  const filteredProducts = dbState.products.filter((p) => {
    if (p.status !== 'ativo' || StockEngine.getProductPriceForCompany(p, currentCompany.id) <= 0) return false;
    if (filterByLocationStock) {
      const stock = StockEngine.getBalance(dbState.stockBalances, p.id, selectedLocationId);
      if (stock.quantity <= 0) return false;
    }
    const matchesSearch =
      productSearch === '' ||
      p.description.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.code.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.barcode && p.barcode.includes(productSearch));
    const matchesCategory = selectedCategory === 'todos' || p.family === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Autocomplete de produtos na barra rápida (só exibe a lista a partir do 3º caractere digitado, igual ao PDV Balcão)
  const fastProductSearchResults =
    fastProductSearchTerm.trim().length >= 3 && !fastSelectedProductId
      ? dbState.products.filter(
          (p) =>
            p.status === 'ativo' &&
            StockEngine.getProductPriceForCompany(p, currentCompany.id) > 0 &&
            (p.description.toLowerCase().includes(fastProductSearchTerm.toLowerCase().trim()) ||
              p.code.toLowerCase().includes(fastProductSearchTerm.toLowerCase().trim()) ||
              (p.barcode && p.barcode.includes(fastProductSearchTerm.trim())))
        )
      : [];

  // Produtos para a busca F2 (mesma regra do PDV Balcão)
  const lookupFilteredProducts = dbState.products.filter(
    (p) =>
      p.status === 'ativo' &&
      StockEngine.getProductPriceForCompany(p, currentCompany.id) > 0 &&
      (productLookupSearch === '' ||
        p.description.toLowerCase().includes(productLookupSearch.toLowerCase()) ||
        p.code.toLowerCase().includes(productLookupSearch.toLowerCase()) ||
        (p.barcode && p.barcode.includes(productLookupSearch)) ||
        (p.family && p.family.toLowerCase().includes(productLookupSearch.toLowerCase())))
  );

  useEffect(() => {
    setHighlightedProductIndex(0);
  }, [fastProductSearchTerm]);

  // Busca inteligente de produto por Código Interno, Código de Barras (EAN) ou Descrição (igual ao PDV Balcão)
  const findProductByCodeOrBarcode = (query: string): Product | null => {
    const clean = query.trim();
    if (!clean) return null;

    const cleanUpper = clean.toUpperCase();
    const cleanDigits = clean.replace(/\D/g, '');
    const cleanAlphanumeric = clean.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const activeProducts = dbState.products.filter(
      (p) => p.status === 'ativo' && StockEngine.getProductPriceForCompany(p, currentCompany.id) > 0
    );

    let found = activeProducts.find((p) => p.barcode && p.barcode.trim() === clean);
    if (found) return found;

    if (cleanDigits.length >= 4) {
      found = activeProducts.find((p) => p.barcode && p.barcode.replace(/\D/g, '') === cleanDigits);
      if (found) return found;
    }

    found = activeProducts.find((p) => p.code && p.code.trim().toUpperCase() === cleanUpper);
    if (found) return found;

    found = activeProducts.find(
      (p) => p.code && p.code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === cleanAlphanumeric
    );
    if (found) return found;

    if (cleanDigits.length >= 2) {
      found = activeProducts.find((p) => {
        const codeDigits = p.code.replace(/\D/g, '');
        return codeDigits === cleanDigits || p.code.toUpperCase().endsWith('-' + cleanDigits);
      });
      if (found) return found;
    }

    found = activeProducts.find((p) => p.code.toUpperCase() === `PA-${cleanUpper}`);
    if (found) return found;

    found = activeProducts.find(
      (p) => p.description && p.description.trim().toLowerCase() === clean.toLowerCase()
    );
    if (found) return found;

    const matches = activeProducts.filter(
      (p) =>
        p.description.toLowerCase().includes(clean.toLowerCase()) ||
        p.code.toLowerCase().includes(clean.toLowerCase()) ||
        (p.barcode && p.barcode.includes(clean))
    );

    if (matches.length > 0) {
      const startsWith = matches.find(
        (p) =>
          p.code.toLowerCase().startsWith(clean.toLowerCase()) ||
          p.description.toLowerCase().startsWith(clean.toLowerCase())
      );
      return startsWith || matches[0];
    }

    return null;
  };

  // Lista de pedidos da empresa com filtros aplicados (Aba Histórico)
  const filteredOrders = dbState.orders.filter((order) => {
    if (order.companyId && order.companyId !== currentCompany.id) return false;
    if (filterType === 'bonificacao') {
      if (!isBonusOrder(order)) return false;
    } else if (filterType === 'venda_normal') {
      if (order.type !== 'venda' || isBonusOrder(order)) return false;
    } else if (filterType !== 'todos' && order.type !== filterType) {
      return false;
    }
    if (filterOrigin !== 'todos' && order.origin !== filterOrigin) return false;
    if (filterStatus !== 'todos' && order.status !== filterStatus) return false;
    if (filterSeller !== 'todos' && order.userId !== filterSeller) return false;
    if (searchCustomer && !order.customerName.toLowerCase().includes(searchCustomer.toLowerCase())) return false;
    const rawDate = order.createdAt || (order as any).orderDate || (order as any).date || '';
    const orderDate = rawDate.split('T')[0];
    if (startDate && orderDate < startDate) return false;
    if (endDate && orderDate > endDate) return false;
    return true;
  });

  // Métricas Consolidadas do Histórico de Vendas (exclui estritamente Bonificações do faturamento e ticket médio)
  const historySalesOrders = filteredOrders.filter((o) => isBillableSaleOrder(o));
  const historyQuotesOrders = filteredOrders.filter((o) => o.type === 'orcamento' && o.status !== 'cancelado');
  const historySalesTotal = historySalesOrders.reduce((sum, o) => sum + o.total, 0);
  const historySalesCount = historySalesOrders.length;
  const historyAvgTicket = historySalesCount > 0 ? historySalesTotal / historySalesCount : 0;

  const historyDistinctProducts = new Set<string>();
  historySalesOrders.forEach((o) => {
    (o.items || []).forEach((item) => {
      const key = item.productId || item.productCode || item.description;
      if (key) historyDistinctProducts.add(key);
    });
  });
  const historyDistinctProductsCount = historyDistinctProducts.size;

  const historyTotalDistinctInOrders = historySalesOrders.reduce((sum, o) => {
    const s = new Set<string>();
    (o.items || []).forEach((item) => {
      const key = item.productId || item.productCode || item.description;
      if (key) s.add(key);
    });
    return sum + s.size;
  }, 0);
  const historyAvgDistinctPerOrder = historySalesCount > 0 ? historyTotalDistinctInOrders / historySalesCount : 0;
  const historyQuotesTotal = historyQuotesOrders.reduce((sum, o) => sum + o.total, 0);

  // Mapa rápido de produtos e cálculo de Lucro Bruto Real por pedido (mesma fórmula do Dashboard Executivo)
  const historyProductMap = new Map<string, Product>();
  dbState.products.forEach((p) => historyProductMap.set(p.id, p));

  const getOrderProfitability = (ord: Order) => {
    if (!isBillableSaleOrder(ord)) {
      return { cmv: 0, grossProfit: 0, marginPercent: 0, markupPercent: 0, isEligible: false };
    }
    let orderCmv = 0;
    (ord.items || []).forEach((item) => {
      const prod = historyProductMap.get(item.productId);
      const unitCost =
        item.unitCost !== undefined && item.unitCost > 0
          ? item.unitCost
          : prod && prod.costPrice > 0
          ? prod.costPrice
          : item.unitPrice * 0.5;
      orderCmv += unitCost * (item.quantity || 1);
    });
    const grossProfit = ord.total - orderCmv;
    const marginPercent = ord.total > 0 ? (grossProfit / ord.total) * 100 : 0;
    const markupPercent = orderCmv > 0 ? (grossProfit / orderCmv) * 100 : 0;
    return { cmv: orderCmv, grossProfit, marginPercent, markupPercent, isEligible: true };
  };

  const historyTotalCmv = historySalesOrders.reduce((sum, o) => sum + getOrderProfitability(o).cmv, 0);
  const historyTotalGrossProfit = historySalesTotal - historyTotalCmv;
  const historyGrossMarginPercent = historySalesTotal > 0 ? (historyTotalGrossProfit / historySalesTotal) * 100 : 0;
  const historyMarkupPercent = historyTotalCmv > 0 ? (historyTotalGrossProfit / historyTotalCmv) * 100 : 0;
  const historyAvgProfitPerOrder = historySalesCount > 0 ? historyTotalGrossProfit / historySalesCount : 0;
  const isGrossProfitMode = showGrossProfit && canViewGrossProfit;

  // ==========================================
  // CÁLCULOS DO CARRINHO DE NOVO PEDIDO
  // ==========================================
  const grossSubtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalItemDiscounts = cart.reduce((sum, item) => sum + (item.discountValue || 0), 0);
  const totalItemAdditions = cart.reduce((sum, item) => sum + (item.additionValue || 0), 0);
  const subtotalAfterItemDiscounts = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  const parsedOrderDiscountNum = Math.max(0, parseFloat(discountInput.replace(',', '.')) || 0);
  const maxAllowedDiscountPercent = currentUser.permissions.maxDiscountPercent;
  const maxAllowedDiscountVal = (subtotalAfterItemDiscounts * maxAllowedDiscountPercent) / 100;

  let orderDiscountVal = 0;
  if (discountType === 'percent') {
    const safePercent = Math.min(maxAllowedDiscountPercent, parsedOrderDiscountNum);
    orderDiscountVal = (subtotalAfterItemDiscounts * safePercent) / 100;
  } else {
    orderDiscountVal = Math.min(subtotalAfterItemDiscounts, parsedOrderDiscountNum);
  }
  const effectiveDiscountPercent =
    subtotalAfterItemDiscounts > 0 ? (orderDiscountVal / subtotalAfterItemDiscounts) * 100 : 0;
  const orderTotal = Math.max(0, subtotalAfterItemDiscounts - orderDiscountVal);
  const combinedDiscounts = totalItemDiscounts + orderDiscountVal;

  // Adicionar produto ao carrinho
  const handleAddToCart = (product: Product, forcedQty?: number) => {
    const qty = forcedQty || qtyToAddMap[product.id] || 1;
    if (qty <= 0) return;

    const stock = StockEngine.getBalance(dbState.stockBalances, product.id, selectedLocationId);
    const existing = cart.find((i) => i.productId === product.id);
    const currentQty = existing ? existing.quantity : 0;
    const requestedTotal = currentQty + qty;

    if (docType === 'venda' && stock.quantity < requestedTotal) {
      const proceed = window.confirm(
        `Atenção: O saldo de "${product.description}" no local é de ${formatQuantity(stock.quantity)} ${product.unit}. Deseja adicionar mesmo assim?`
      );
      if (!proceed) return;
    }

    if (existing) {
      if (existing.discountAuthorization?.operationId) {
        revokeDiscountAuthorization(existing.discountAuthorization.operationId);
      }
      const newQty = existing.quantity + qty;
      const newGross = newQty * existing.unitPrice;
      const newDiscVal = (newGross * (existing.discountPercent || 0)) / 100;
      setCart((prev) =>
        prev.map((i) =>
          i.productId === product.id
            ? {
                ...i,
                quantity: newQty,
                discountValue: Math.round(newDiscVal * 100) / 100,
                totalPrice: Math.round((newGross - newDiscVal) * 100) / 100,
                discountAuthorization: undefined,
              }
            : i
        )
      );
    } else {
      const effectivePrice = StockEngine.getProductPriceForCompany(product, currentCompany.id);
      const effectiveCost = StockEngine.getProductCostForCompany(product, currentCompany.id);

      const newItem: OrderItem = {
        id: 'ITEM-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
        productId: product.id,
        productCode: product.code,
        description: product.description,
        unit: product.unit,
        quantity: qty,
        unitPrice: effectivePrice,
        referenceUnitPrice: effectivePrice,
        discountPercent: 0,
        discountValue: 0,
        totalPrice: qty * effectivePrice,
        unitCost: effectiveCost,
        locationId: selectedLocationId,
        isMasterPack: product.isMasterPack,
        masterPackUnits: product.masterPackUnits,
        masterPackAssociatedProductId: product.masterPackAssociatedProductId,
        masterPackAssociatedProductCode: product.masterPackAssociatedProductCode,
      };
      setCart((prev) => [...prev, newItem]);
    }

    // Reset qty selector map for this product
    setQtyToAddMap((prev) => ({ ...prev, [product.id]: 1 }));

    const prodObsAlert = getProductSaleAlert(product);
    if (prodObsAlert) {
      setSaleObservationAlerts((prev) => upsertSaleAlert(prev, prodObsAlert));
    }
  };

  // Seleciona o produto na barra rápida e posiciona o foco direto na Quantidade
  const handleSelectFastProduct = (product: Product) => {
    setFastSelectedProductId(product.id);
    setFastProductSearchTerm('');
    setProductFeedback(null);
    const prodObsAlert = getProductSaleAlert(product);
    if (prodObsAlert) {
      lastAlertedFastProductIdRef.current = product.id;
      setSaleObservationAlerts((prev) => upsertSaleAlert(prev, prodObsAlert));
      return;
    }
    lastAlertedFastProductIdRef.current = '';
    setTimeout(() => {
      fastQtyInputRef.current?.focus();
      fastQtyInputRef.current?.select();
    }, 30);
  };

  // Inclusão rápida de item pela barra inteligente
  const handleAddFastItem = (forcedProduct?: Product, forcedQty?: number) => {
    const product =
      forcedProduct ||
      dbState.products.find((p) => p.id === fastSelectedProductId);

    if (!product) {
      if (fastProductSearchTerm.trim()) {
        handleProcessFastProductQuery(fastProductSearchTerm);
      } else {
        setProductFeedback({
          type: 'warning',
          text: 'Busque e selecione um produto antes de incluir no pedido.',
        });
        fastProductInputRef.current?.focus();
      }
      return;
    }

    const qty = forcedQty !== undefined ? forcedQty : fastItemQty;
    if (qty <= 0) {
      setProductFeedback({
        type: 'warning',
        text: 'Informe uma quantidade maior que zero para incluir o item.',
      });
      fastQtyInputRef.current?.focus();
      fastQtyInputRef.current?.select();
      return;
    }

    const stock = StockEngine.getBalance(dbState.stockBalances, product.id, selectedLocationId);
    const existing = cart.find((i) => i.productId === product.id);
    const currentQty = existing ? existing.quantity : 0;
    const requestedTotal = currentQty + qty;

    if (docType === 'venda' && stock.quantity < requestedTotal && !Database.canSellNegativeStock()) {
      const proceed = window.confirm(
        `Atenção: O saldo de "${product.description}" no local selecionado é de ${formatQuantity(stock.quantity)} ${product.unit}.\nDeseja adicionar mesmo assim?`
      );
      if (!proceed) return;
    }

    const effectivePrice = StockEngine.getProductPriceForCompany(product, currentCompany.id);
    const effectiveCost = StockEngine.getProductCostForCompany(product, currentCompany.id);
    const rawVal = Math.max(0, parseFloat(fastItemAdjustmentInput.replace(',', '.')) || 0);
    const grossItem = qty * effectivePrice;
    let itemDiscVal = 0;
    let itemDiscPercent = 0;
    let itemAddVal = 0;
    let itemAddPercent = 0;
    let explicitPercentRequested: number | undefined;

    if (rawVal > 0) {
      if (fastItemAdjustmentMode === 'desconto') {
        const maxPercent = currentUser.permissions.maxDiscountPercent;
        if (fastItemAdjustmentType === 'percent') {
          itemDiscPercent = product.maxDiscountEnabled ? Math.min(100, rawVal) : Math.min(maxPercent, rawVal);
          itemDiscVal = (grossItem * itemDiscPercent) / 100;
          explicitPercentRequested = itemDiscPercent;
        } else {
          const maxVal = (grossItem * maxPercent) / 100;
          itemDiscVal = product.maxDiscountEnabled ? Math.min(grossItem, rawVal) : Math.min(maxVal, rawVal);
          itemDiscPercent = grossItem > 0 ? (itemDiscVal / grossItem) * 100 : 0;
        }
      } else {
        // Acréscimo no produto
        if (fastItemAdjustmentType === 'percent') {
          itemAddPercent = rawVal;
          itemAddVal = (grossItem * itemAddPercent) / 100;
        } else {
          itemAddVal = rawVal;
          itemAddPercent = grossItem > 0 ? (itemAddVal / grossItem) * 100 : 0;
        }
      }
    }

    const commitFastItemInsert = (
      finalTotalDiscVal: number,
      finalTotalDiscPct: number,
      authorization?: DiscountAuthorizationRecord | null
    ) => {
      if (existing) {
        if (
          existing.discountAuthorization?.operationId &&
          existing.discountAuthorization.operationId !== authorization?.operationId
        ) {
          revokeDiscountAuthorization(existing.discountAuthorization.operationId);
        }
        const newQty = existing.quantity + qty;
        const newGross = newQty * existing.unitPrice;
        const combinedAddVal = (existing.additionValue || 0) + itemAddVal;
        const combinedAddPercent = newGross > 0 ? (combinedAddVal / newGross) * 100 : 0;
        const roundedDiscVal = Math.round(finalTotalDiscVal * 100) / 100;
        const roundedDiscPct = Math.round(finalTotalDiscPct * 100) / 100;

        setCart((prev) =>
          prev.map((i) =>
            i.productId === product.id
              ? {
                  ...i,
                  quantity: newQty,
                  discountValue: roundedDiscVal,
                  discountPercent: roundedDiscPct,
                  additionValue: Math.round(combinedAddVal * 100) / 100,
                  additionPercent: Math.round(combinedAddPercent * 100) / 100,
                  totalPrice: Math.max(0, Math.round((newGross + combinedAddVal - roundedDiscVal) * 100) / 100),
                  discountAuthorization: authorization || undefined,
                }
              : i
          )
        );
      } else {
        const roundedDiscVal = Math.round(finalTotalDiscVal * 100) / 100;
        const roundedDiscPct = Math.round(finalTotalDiscPct * 100) / 100;
        const netTotal = Math.max(0, grossItem + itemAddVal - roundedDiscVal);
        const newItem: OrderItem = {
          id: 'ITEM-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
          productId: product.id,
          productCode: product.code,
          description: product.description,
          unit: product.unit,
          quantity: qty,
          unitPrice: effectivePrice,
          referenceUnitPrice: effectivePrice,
          discountPercent: roundedDiscPct,
          discountValue: roundedDiscVal,
          additionPercent: Math.round(itemAddPercent * 100) / 100,
          additionValue: Math.round(itemAddVal * 100) / 100,
          totalPrice: Math.round(netTotal * 100) / 100,
          unitCost: effectiveCost,
          locationId: selectedLocationId,
          isMasterPack: product.isMasterPack,
          masterPackUnits: product.masterPackUnits,
          masterPackAssociatedProductId: product.masterPackAssociatedProductId,
          masterPackAssociatedProductCode: product.masterPackAssociatedProductCode,
          discountAuthorization: authorization || undefined,
        };
        setCart((prev) => [...prev, newItem]);
      }

      setProductFeedback({
        type: stock.quantity < requestedTotal ? 'warning' : 'success',
        text: `✓ +${formatQuantity(qty)} ${product.unit}: "${product.description}" incluído no pedido!`,
      });

      const alreadyAlertedOnSelect = !forcedProduct && lastAlertedFastProductIdRef.current === product.id;
      lastAlertedFastProductIdRef.current = '';
      const prodObsAlert = alreadyAlertedOnSelect ? null : getProductSaleAlert(product);
      if (prodObsAlert) {
        setSaleObservationAlerts((prev) => upsertSaleAlert(prev, prodObsAlert));
      }

      // Limpa campos da barra rápida para o próximo produto
      setFastSelectedProductId('');
      setFastProductSearchTerm('');
      setFastItemQtyInput('1');
      setFastItemAdjustmentInput('');

      if (!prodObsAlert) {
        setTimeout(() => {
          fastProductInputRef.current?.focus();
        }, 20);
      }
    };

    const resultQty = existing ? existing.quantity + qty : qty;
    const resultUnitPrice = existing ? existing.unitPrice : effectivePrice;
    const resultGross = resultQty * resultUnitPrice;
    const resultDiscVal = existing ? (existing.discountValue || 0) + itemDiscVal : itemDiscVal;
    const resultDiscPct = resultGross > 0 ? (resultDiscVal / resultGross) * 100 : 0;

    if (product.maxDiscountEnabled && (resultDiscVal > 0 || (explicitPercentRequested && explicitPercentRequested > 0))) {
      const evaluation = evaluateItemMaxDiscount({
        product,
        companyId: currentCompany.id,
        origin: 'pedidos_venda',
        quantity: resultQty,
        unitPrice: resultUnitPrice,
        referenceUnitPrice: existing?.referenceUnitPrice ?? effectivePrice,
        itemDiscountValue: resultDiscVal,
        itemDiscountPercent: resultDiscPct,
        explicitPercentRequested: existing ? undefined : explicitPercentRequested,
        existingAuthorization: null,
        saleSessionId: saleSessionIdRef.current,
        users: dbState.users,
      });

      if (evaluation.requiresAuthorization && evaluation.violation) {
        setDiscountAuthPrompt({
          violation: evaluation.violation,
          onAuthorized: (record) => {
            setDiscountAuthPrompt(null);
            commitFastItemInsert(resultDiscVal, resultDiscPct, record);
            toast.success(
              `Desconto autorizado por ${record.authorizerUserName} para "${product.description}".`,
              'Autorização Concedida'
            );
          },
          onReduceToLimit: () => {
            setDiscountAuthPrompt(null);
            commitFastItemInsert(evaluation.maxDiscountValueAllowed, evaluation.maxDiscountPercentAllowed, null);
            toast.info(
              `Desconto ajustado para o limite permitido do produto (${evaluation.maxDiscountPercentAllowed.toFixed(2)}% / ${formatCurrency(evaluation.maxDiscountValueAllowed)}).`,
              'Desconto Ajustado ao Limite'
            );
          },
        });
        return;
      }
    }

    commitFastItemInsert(resultDiscVal, resultDiscPct, null);
  };

  // Processa leitura de código de barras ou digitação do código/nome do produto
  const handleProcessFastProductQuery = (rawQuery: string) => {
    const query = (rawQuery || fastProductSearchTerm).trim();
    if (!query) return;

    // Suporte para quantidade multiplicadora direta no formato: "5*PA-301" ou "3*789..."
    if (query.includes('*')) {
      const parts = query.split('*');
      const parsedQty = parseFloat(parts[0].replace(',', '.'));
      const cleanCode = parts[1]?.trim() || '';
      if (!isNaN(parsedQty) && parsedQty > 0 && cleanCode) {
        const matched = findProductByCodeOrBarcode(cleanCode);
        if (matched) {
          handleAddFastItem(matched, parsedQty);
          return;
        }
      }
    }

    // Se for leitura exata de código de barras (EAN), inclui direto como no leitor de balcão
    const exactBarcode = dbState.products.find(
      (p) =>
        p.status === 'ativo' &&
        StockEngine.getProductPriceForCompany(p, currentCompany.id) > 0 &&
        p.barcode &&
        p.barcode.trim() === query
    );
    if (exactBarcode) {
      handleAddFastItem(exactBarcode, fastItemQty > 0 ? fastItemQty : 1);
      return;
    }

    const matched = findProductByCodeOrBarcode(query);
    if (matched) {
      handleSelectFastProduct(matched);
    } else {
      setProductFeedback({
        type: 'error',
        text: `Produto com código, barras ou nome "${query}" não encontrado no cadastro.`,
      });
      fastProductInputRef.current?.focus();
      fastProductInputRef.current?.select();
    }
  };

  // Alterar quantidade de item no carrinho (+/- ou valor direto)
  const handleUpdateItemQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) {
              revokeDiscountAuthorization(item.discountAuthorization?.operationId);
              return null;
            }
            if (item.discountAuthorization?.operationId) {
              revokeDiscountAuthorization(item.discountAuthorization.operationId);
            }
            const gross = newQty * item.unitPrice;
            const discVal = (gross * (item.discountPercent || 0)) / 100;
            const addVal = (gross * (item.additionPercent || 0)) / 100;
            return {
              ...item,
              quantity: newQty,
              discountValue: Math.round(discVal * 100) / 100,
              additionValue: Math.round(addVal * 100) / 100,
              totalPrice: Math.round((gross + addVal - discVal) * 100) / 100,
              discountAuthorization: undefined,
            };
          }
          return item;
        })
        .filter(Boolean) as OrderItem[]
    );
  };

  const handleSetItemQty = (productId: string, rawQty: number) => {
    if (isNaN(rawQty) || rawQty <= 0) return;
    const newQty = Math.round(rawQty * 1000) / 1000;
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          if (item.discountAuthorization?.operationId && Math.abs(item.quantity - newQty) > 0.0005) {
            revokeDiscountAuthorization(item.discountAuthorization.operationId);
          }
          const gross = newQty * item.unitPrice;
          const discVal = (gross * (item.discountPercent || 0)) / 100;
          const addVal = (gross * (item.additionPercent || 0)) / 100;
          return {
            ...item,
            quantity: newQty,
            discountValue: Math.round(discVal * 100) / 100,
            additionValue: Math.round(addVal * 100) / 100,
            totalPrice: Math.round((gross + addVal - discVal) * 100) / 100,
            discountAuthorization:
              Math.abs(item.quantity - newQty) > 0.0005 ? undefined : item.discountAuthorization,
          };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (productId: string) => {
    const removed = cart.find((i) => i.productId === productId);
    if (removed?.discountAuthorization?.operationId) {
      revokeDiscountAuthorization(removed.discountAuthorization.operationId);
    }
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  };

  // Modal de Ajuste (Desconto ou Acréscimo) no Item
  const handleOpenItemDiscount = (item: OrderItem) => {
    setDiscountingItemId(item.productId);
    if (item.additionValue && item.additionValue > 0) {
      setItemAdjustmentMode('acrescimo');
      if (item.additionPercent && item.additionPercent > 0) {
        setItemDiscountType('percent');
        setItemDiscountInput(item.additionPercent.toString().replace('.', ','));
      } else {
        setItemDiscountType('value');
        setItemDiscountInput(item.additionValue.toFixed(2).replace('.', ','));
      }
    } else if (item.discountValue > 0 || item.discountPercent > 0) {
      setItemAdjustmentMode('desconto');
      if (item.discountPercent > 0) {
        setItemDiscountType('percent');
        setItemDiscountInput(item.discountPercent.toString().replace('.', ','));
      } else {
        setItemDiscountType('value');
        setItemDiscountInput(item.discountValue.toFixed(2).replace('.', ','));
      }
    } else {
      setItemAdjustmentMode('desconto');
      setItemDiscountType('percent');
      setItemDiscountInput('');
    }
    setShowItemDiscountModal(true);
  };

  const handleApplyItemDiscount = () => {
    if (!discountingItemId) return;
    const target = cart.find((i) => i.productId === discountingItemId);
    if (!target) return;

    const product = dbState.products.find((p) => p.id === target.productId);
    const gross = target.quantity * target.unitPrice;
    const rawVal = Math.max(0, parseFloat(itemDiscountInput.replace(',', '.')) || 0);
    const maxPercent = currentUser.permissions.maxDiscountPercent;

    let appliedDiscountPercent = 0;
    let appliedDiscountValue = 0;
    let appliedAdditionPercent = 0;
    let appliedAdditionValue = 0;
    let explicitPercentRequested: number | undefined;

    if (rawVal <= 0) {
      // Zerado
    } else if (itemAdjustmentMode === 'desconto') {
      if (itemDiscountType === 'percent') {
        if (!product?.maxDiscountEnabled && rawVal > maxPercent) {
          alert(`O desconto informado (${rawVal}%) excede o limite máximo permitido de ${maxPercent}% para seu perfil.`);
          return;
        }
        appliedDiscountPercent = Math.min(100, rawVal);
        appliedDiscountValue = (gross * appliedDiscountPercent) / 100;
        explicitPercentRequested = appliedDiscountPercent;
      } else {
        const maxVal = (gross * maxPercent) / 100;
        if (!product?.maxDiscountEnabled && rawVal > maxVal) {
          alert(`O desconto informado (${formatCurrency(rawVal)}) excede o limite máximo permitido de ${maxPercent}% (${formatCurrency(maxVal)}).`);
          return;
        }
        appliedDiscountValue = Math.min(gross, rawVal);
        appliedDiscountPercent = gross > 0 ? (appliedDiscountValue / gross) * 100 : 0;
      }
    } else {
      // Acréscimo
      if (itemDiscountType === 'percent') {
        appliedAdditionPercent = rawVal;
        appliedAdditionValue = (gross * appliedAdditionPercent) / 100;
      } else {
        appliedAdditionValue = rawVal;
        appliedAdditionPercent = gross > 0 ? (appliedAdditionValue / gross) * 100 : 0;
      }
    }

    const commitItemAdjustment = (
      discPct: number,
      discVal: number,
      addPct: number,
      addVal: number,
      authorization?: DiscountAuthorizationRecord | null
    ) => {
      const roundedDiscPct = Math.round(discPct * 100) / 100;
      const roundedDiscVal = Math.round(discVal * 100) / 100;
      const roundedAddPct = Math.round(addPct * 100) / 100;
      const roundedAddVal = Math.round(addVal * 100) / 100;
      const net = Math.max(0, gross + roundedAddVal - roundedDiscVal);

      setCart((prev) =>
        prev.map((i) => {
          if (i.productId !== discountingItemId) return i;
          if (
            i.discountAuthorization?.operationId &&
            i.discountAuthorization.operationId !== authorization?.operationId
          ) {
            revokeDiscountAuthorization(i.discountAuthorization.operationId);
          }
          return {
            ...i,
            discountPercent: roundedDiscPct,
            discountValue: roundedDiscVal,
            additionPercent: roundedAddPct,
            additionValue: roundedAddVal,
            totalPrice: Math.round(net * 100) / 100,
            discountAuthorization: authorization || undefined,
          };
        })
      );
      setShowItemDiscountModal(false);
    };

    if (product?.maxDiscountEnabled && itemAdjustmentMode === 'desconto') {
      const evaluation = evaluateItemMaxDiscount({
        product,
        companyId: currentCompany.id,
        origin: 'pedidos_venda',
        quantity: target.quantity,
        unitPrice: target.unitPrice,
        referenceUnitPrice: target.referenceUnitPrice,
        itemDiscountValue: appliedDiscountValue,
        itemDiscountPercent: appliedDiscountPercent,
        explicitPercentRequested,
        existingAuthorization: target.discountAuthorization || null,
        saleSessionId: saleSessionIdRef.current,
        users: dbState.users,
      });

      if (evaluation.requiresAuthorization && evaluation.violation) {
        setDiscountAuthPrompt({
          violation: evaluation.violation,
          onAuthorized: (record) => {
            setDiscountAuthPrompt(null);
            commitItemAdjustment(appliedDiscountPercent, appliedDiscountValue, 0, 0, record);
            toast.success(
              `Desconto autorizado por ${record.authorizerUserName} para "${product.description}".`,
              'Autorização Concedida'
            );
          },
          onReduceToLimit: () => {
            setDiscountAuthPrompt(null);
            commitItemAdjustment(
              evaluation.maxDiscountPercentAllowed,
              evaluation.maxDiscountValueAllowed,
              0,
              0,
              null
            );
            toast.info(
              `Desconto ajustado para o limite permitido do produto (${evaluation.maxDiscountPercentAllowed.toFixed(2)}% / ${formatCurrency(evaluation.maxDiscountValueAllowed)}).`,
              'Desconto Ajustado ao Limite'
            );
          },
        });
        return;
      }

      if (evaluation.exceeded && evaluation.authorized && target.discountAuthorization) {
        commitItemAdjustment(
          appliedDiscountPercent,
          appliedDiscountValue,
          0,
          0,
          target.discountAuthorization
        );
        return;
      }
    }

    commitItemAdjustment(
      appliedDiscountPercent,
      appliedDiscountValue,
      appliedAdditionPercent,
      appliedAdditionValue,
      null
    );
  };

  // Cadastro rápido de cliente
  const handleQuickRegisterCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCustName.trim()) {
      alert('Informe o nome do cliente.');
      return;
    }

    const newCust: Customer = {
      id: 'CUST-' + Date.now(),
      companyId: currentCompany.id,
      code: 'CLI-' + String(dbState.customers.length + 1).padStart(4, '0'),
      name: quickCustName.trim(),
      type: 'PF',
      cpfCnpj: quickCustCpfCnpj.trim() || '',
      phone: quickCustPhone.trim() || '',
      whatsapp: quickCustPhone.trim() || '',
      creditLimit: parseFloat(quickCustCreditLimit) || 0,
      status: 'ativo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const state = Database.getState();
    state.customers.push(newCust);
    Database.persist();
    Database.addAuditLog('CLIENTE_CRIADO', 'CLIENTES', newCust.id, `Cliente ${newCust.name} criado no pedido.`);

    setSelectedCustomerId(newCust.id);
    setShowQuickCustomerModal(false);
    setQuickCustName('');
    setQuickCustPhone('');
    setQuickCustCpfCnpj('');
    setQuickCustCreditLimit('');
    alert(`Cliente "${newCust.name}" cadastrado com sucesso e selecionado no pedido!`);
  };

  const validateOrderCartAndPromptAuthorizations = (
    itemsToCheck: OrderItem[],
    globalDiscountToCheck: number,
    onAllValid: () => void
  ) => {
    const validation = validateOrderDiscounts({
      items: itemsToCheck,
      products: dbState.products,
      companyId: currentCompany.id,
      origin: 'pedidos_venda',
      globalOrderDiscountValue: globalDiscountToCheck,
      saleSessionId: saleSessionIdRef.current,
      users: dbState.users,
    });

    if (validation.valid) {
      onAllValid();
      return;
    }

    const totalViolations = validation.violations.length;
    const first = validation.violations[0];

    setDiscountAuthPrompt({
      violation: first.violation,
      queuePosition: totalViolations > 1 ? { current: 1, total: totalViolations } : undefined,
      onAuthorized: (record) => {
        const nextCart = itemsToCheck.map((it, idx) => {
          if (idx !== first.itemIndex) return it;
          if (it.discountAuthorization?.operationId && it.discountAuthorization.operationId !== record.operationId) {
            revokeDiscountAuthorization(it.discountAuthorization.operationId);
          }
          return { ...it, discountAuthorization: record };
        });
        setCart(nextCart);
        setDiscountAuthPrompt(null);
        toast.success(
          `Desconto autorizado por ${record.authorizerUserName} para "${first.violation.productDescription}".`,
          'Autorização Concedida'
        );
        validateOrderCartAndPromptAuthorizations(nextCart, globalDiscountToCheck, onAllValid);
      },
      onReduceToLimit: () => {
        const targetItem = itemsToCheck[first.itemIndex];
        const gross = targetItem.quantity * targetItem.unitPrice;
        const addVal = targetItem.additionValue || 0;
        const maxValAllowed = first.violation.maxDiscountValueAllowed;
        const clampedItemDisc = Math.min(targetItem.discountValue || 0, maxValAllowed);
        const clampedItemPct = gross > 0 ? (clampedItemDisc / gross) * 100 : 0;

        if (targetItem.discountAuthorization?.operationId) {
          revokeDiscountAuthorization(targetItem.discountAuthorization.operationId);
        }

        const nextCart = itemsToCheck.map((it, idx) =>
          idx === first.itemIndex
            ? {
                ...it,
                discountValue: Math.round(clampedItemDisc * 100) / 100,
                discountPercent: Math.round(clampedItemPct * 100) / 100,
                totalPrice: Math.max(0, Math.round((gross + addVal - clampedItemDisc) * 100) / 100),
                discountAuthorization: undefined,
              }
            : it
        );

        let nextGlobalDiscount = globalDiscountToCheck;
        if (first.violation.reason === 'desconto_global' || first.violation.reason === 'combinado') {
          const nextSubtotalAfterItems = nextCart.reduce((s, it) => s + it.totalPrice, 0);
          const nextLineNet = nextCart[first.itemIndex].totalPrice;
          const remainingHeadroom = Math.max(0, maxValAllowed - clampedItemDisc);
          const maxGlobalAllowed =
            nextLineNet > 0 && nextSubtotalAfterItems > 0
              ? Math.floor(((remainingHeadroom * nextSubtotalAfterItems) / nextLineNet) * 100) / 100
              : 0;
          nextGlobalDiscount = Math.max(0, Math.min(globalDiscountToCheck, maxGlobalAllowed));
          setDiscountType('value');
          setDiscountInput(nextGlobalDiscount > 0 ? nextGlobalDiscount.toFixed(2).replace('.', ',') : '');
        }

        setCart(nextCart);
        setDiscountAuthPrompt(null);
        toast.info(
          `Desconto reduzido para o limite permitido de "${first.violation.productDescription}".`,
          'Desconto Ajustado ao Limite'
        );
      },
    });
  };

  // Pré-finalizar pedido (validação obrigatória de cliente, forma e prazo de pagamento e abertura da tela de confirmação)
  const handlePreFinalizeOrder = () => {
    if (cart.length === 0) {
      toast.warning('Adicione pelo menos um produto ao pedido antes de finalizar.', 'Carrinho Vazio');
      return;
    }

    if (!selectedCustomerId || selectedCustomerId.trim() === '') {
      toast.warning(
        `A seleção do cliente é obrigatória para emitir o ${isBonusMode ? 'Pedido de Bonificação' : 'Pedido de Venda'}. Selecione um cliente cadastrado ou clique em "+ Novo Cliente" para cadastrar.`,
        'Cliente Obrigatório'
      );
      return;
    }

    if (isBonusMode) {
      setShowSaleConfirmationModal(true);
      return;
    }

    if (!paymentMethod) {
      toast.warning('A Forma de Pagamento é obrigatória em todas as modalidades de venda.', 'Forma de Pagamento Obrigatória');
      return;
    }

    if (!paymentTerms || paymentTerms.trim() === '') {
      toast.warning('O Prazo de Pagamento é obrigatório em todas as modalidades de venda.', 'Prazo Obrigatório');
      return;
    }

    if (orderDiscountVal > maxAllowedDiscountVal + 0.01) {
      alert(
        `Desconto não autorizado! Seu perfil permite no máximo ${currentUser.permissions.maxDiscountPercent}% (${formatCurrency(maxAllowedDiscountVal)}).`
      );
      return;
    }

    validateOrderCartAndPromptAuthorizations(cart, orderDiscountVal, () => {
      setShowSaleConfirmationModal(true);
    });
  };

  // FINALIZAR PEDIDO DE VENDA, BONIFICAÇÃO OU ORÇAMENTO COMERCIAL (após confirmação na tela)
  const handleFinalizeOrder = () => {
    setShowSaleConfirmationModal(false);

    if (cart.length === 0) {
      toast.warning('Adicione pelo menos um produto ao pedido antes de finalizar.', 'Carrinho Vazio');
      return;
    }

    if (!selectedCustomerId || selectedCustomerId.trim() === '') {
      toast.warning('A seleção do cliente é obrigatória para emitir o pedido.', 'Cliente Obrigatório');
      return;
    }

    if (!isBonusMode) {
      if (!paymentMethod) {
        toast.warning('A Forma de Pagamento é obrigatória em todas as modalidades de venda.', 'Forma de Pagamento Obrigatória');
        return;
      }

      if (!paymentTerms || paymentTerms.trim() === '') {
        toast.warning('O Prazo de Pagamento é obrigatório em todas as modalidades de venda.', 'Prazo Obrigatório');
        return;
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const prefix = isBonusMode ? 'BON' : docType === 'venda' ? 'VD' : 'ORC';
    const orderNumber = `${prefix}-${now.getFullYear()}-${String(dbState.orders.length + 1).padStart(5, '0')}`;

    try {
      // 1. Criar objeto do pedido e validar limites de desconto na camada de persistência
      const boletoAccounts = Database.getBoletoAccounts(currentCompany.id);
      const targetBoletoAccount = !isBonusMode && paymentMethod === 'boleto'
        ? boletoAccounts.find((a) => a.id === selectedBoletoAccountId) || boletoAccounts[0] || Database.getBoletoAccounts()[0]
        : undefined;

      const computedItemsSubtotal = cart.reduce((s, itm) => {
        const effUnit = (itm.additionValue && itm.additionValue > 0)
          ? ((itm.totalPrice + (itm.discountValue || 0)) / (itm.quantity || 1))
          : itm.unitPrice;
        return s + (effUnit * itm.quantity);
      }, 0);

      const termInfo = isBonusMode
        ? { label: 'Sem Cobrança (Bonificação)', installmentsCount: 0, daysOffsets: [] as number[] }
        : Database.resolvePaymentTermInfo(paymentTerms, installments);

      const effectivePaymentMethod: Order['paymentMethod'] = isBonusMode
        ? 'bonificacao'
        : (paymentMethod as Order['paymentMethod']);

      const newOrder: Order = {
        id: 'ORD-' + Date.now(),
        number: orderNumber,
        type: isBonusMode ? 'venda' : docType,
        orderKind: isBonusMode ? 'bonificacao' : 'venda_normal',
        origin: 'pedidos_venda' as any,
        companyId: currentCompany.id,
        customerId: selectedCustomerId || undefined,
        customerName: selectedCustomer ? selectedCustomer.name : 'Consumidor Final (Não Identificado)',
        customerPhone: selectedCustomer?.phone || selectedCustomer?.whatsapp,
        userId: currentUser.id,
        userName: currentUser.name,
        items: cart,
        subtotal: isBonusMode ? 0 : computedItemsSubtotal,
        discountTotal: isBonusMode ? 0 : combinedDiscounts,
        total: isBonusMode ? 0 : orderTotal,
        referenceSubtotal: isBonusMode ? computedItemsSubtotal : undefined,
        referenceTotal: isBonusMode ? orderTotal : undefined,
        paymentMethod: effectivePaymentMethod,
        paymentTerm: isBonusMode ? 'Sem Cobrança (Bonificação)' : paymentTerms,
        bankAccountId: isBonusMode ? undefined : targetBoletoAccount?.id,
        bankAccountName: isBonusMode ? undefined : targetBoletoAccount?.name,
        installmentsCount: isBonusMode ? 0 : installments,
        receivedAmount: !isBonusMode && docType === 'venda' && (paymentMethod === 'pix' || paymentMethod === 'dinheiro') ? orderTotal : 0,
        changeAmount: 0,
        status: !isBonusMode && docType === 'orcamento' ? 'aberto' : 'concluido',
        validityDate: !isBonusMode && docType === 'orcamento' ? new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0] : undefined,
        notes: (() => {
          const extraInfo = [
            isBonusMode ? 'BONIFICAÇÃO — SEM COBRANÇA FINANCEIRA' : '',
            `Frete: ${freightType.toUpperCase()}`,
            `Previsão: ${deliveryForecast}`,
            !isBonusMode
              ? `Prazo: ${termInfo.label}${installments > 1 && !/\d+\s*x/i.test(termInfo.label) ? ` (${installments}x)` : ''}`
              : '',
            internalNotes.trim() ? `Obs Interna: ${internalNotes.trim()}` : ''
          ].filter(Boolean).join(' | ');
          return notes.trim()
            ? `${notes.trim()} (${extraInfo})`
            : `${isBonusMode ? 'Pedido de Bonificação' : docType === 'orcamento' ? 'Orçamento Comercial' : 'Pedido de Venda'} emitido por ${currentUser.name}. ${extraInfo}`;
        })(),
        stockDeducted: isBonusMode || docType === 'venda',
        financialGenerated: !isBonusMode && docType === 'venda',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const validatedDiscountAuths = isBonusMode
        ? []
        : Database.validateOrderDiscountsForPersistence(newOrder, {
            saleSessionId: saleSessionIdRef.current,
            globalOrderDiscountValue: orderDiscountVal,
          });

      let currentBalances = [...dbState.stockBalances];
      const movements = [];

      // 2. Se for VENDA ou BONIFICAÇÃO, baixar estoque unificado compartilhado
      if (isBonusMode || docType === 'venda') {
        const loc = locations.find((l) => l.id === selectedLocationId) ||
          locations.find((l) => l.id === 'loc-comercial') ||
          locations[0] ||
          { id: 'loc-comercial', name: 'Comercial' };

        for (const item of cart) {
          const targetLocId = item.locationId || loc.id || 'loc-comercial';
          const targetLocName = (item.locationId ? locations.find((l) => l.id === item.locationId)?.name : null) || loc.name || 'Comercial';

          const { updatedBalances, createdMovement } = StockEngine.applyMovement(
            currentBalances,
            {
              companyId: currentCompany.id,
              productId: item.productId,
              productCode: item.productCode,
              productDescription: item.description,
              locationId: targetLocId,
              locationName: targetLocName,
              type: isBonusMode ? 'saida_bonificacao' : 'saida_venda',
              quantity: item.quantity,
              unitCost: item.unitCost,
              totalCost: item.unitCost * item.quantity,
              originDocType: isBonusMode ? 'bonificacao' : 'venda',
              originDocId: orderNumber,
              date: nowIso,
              userId: currentUser.id,
              userName: currentUser.name,
              notes: isBonusMode
                ? formatBonusStockExitNote(orderNumber, currentCompany.tradeName || currentCompany.name)
                : `Venda ${orderNumber} por ${currentUser.name} (${currentCompany.tradeName || currentCompany.name})`,
            },
            { allowNegativeStock: Database.canSellNegativeStock() }
          );
          currentBalances = updatedBalances;
          movements.push(createdMovement);
        }
      }

      const finalizedOrder = isBonusMode
        ? newOrder
        : Database.finalizeOrderDiscountAuthorizations(newOrder, validatedDiscountAuths, {
            saleSessionId: saleSessionIdRef.current,
            skipPersist: true,
          });

      // 3. Se for venda normal a prazo / cartão / boleto, gerar Contas a Receber (NUNCA para Bonificação)
      let updatedReceivables = [...dbState.accountsReceivable];
      if (!isBonusMode && docType === 'venda' && (paymentMethod === 'boleto' || paymentMethod === 'crediario' || installments > 1)) {
        const valParcela = Number((orderTotal / installments).toFixed(2));
        for (let i = 1; i <= installments; i++) {
          const daysOffset = termInfo.daysOffsets[i - 1] ?? i * 30;
          const due = new Date();
          due.setDate(due.getDate() + daysOffset);
          updatedReceivables.push({
            id: 'REC-' + Date.now() + '-' + i,
            companyId: currentCompany.id,
            orderId: finalizedOrder.id,
            orderNumber: finalizedOrder.number,
            customerId: selectedCustomerId,
            customerName: finalizedOrder.customerName,
            docNumber: `${orderNumber}/${i}`,
            installmentNumber: i,
            totalInstallments: installments,
            issueDate: nowIso.split('T')[0],
            dueDate: due.toISOString().split('T')[0],
            originalValue: valParcela,
            discount: 0,
            addition: 0,
            paidValue: 0,
            balance: valParcela,
            paymentMethod: paymentMethod === 'boleto' ? 'Boleto Bancário' : paymentMethod === 'crediario' ? 'Crediário' : 'Cartão Crédito',
            bankAccountId: paymentMethod === 'boleto' ? targetBoletoAccount?.id : undefined,
            bankAccountName: paymentMethod === 'boleto' ? targetBoletoAccount?.name : undefined,
            bankCode: paymentMethod === 'boleto' ? targetBoletoAccount?.bankCode : undefined,
            status: 'aberto',
            receipts: [],
          });
        }
      }

      // 4. Salvar estado no banco
      const state = Database.getState();
      state.stockBalances = currentBalances;
      state.stockMovements = [...movements, ...state.stockMovements];
      state.orders = [finalizedOrder, ...state.orders];
      state.accountsReceivable = updatedReceivables;
      Database.persist();

      Database.addAuditLog(
        isBonusMode ? 'BONIFICACAO_EMITIDA' : 'PEDIDO_EMITIDO',
        'VENDAS',
        finalizedOrder.id,
        isBonusMode
          ? `Pedido de Bonificação ${orderNumber} emitido por ${currentUser.name} para ${finalizedOrder.customerName}. Valor Financeiro: R$ 0,00 (Ref.: ${formatCurrency(orderTotal)})`
          : `${docType === 'orcamento' ? 'Orçamento' : 'Pedido de Venda'} ${orderNumber} emitido por ${currentUser.name} para ${finalizedOrder.customerName}. Total: ${formatCurrency(orderTotal)}`
      );

      // Renova a sessão para impedir reutilização de autorizações em pedidos futuros
      saleSessionIdRef.current = generateSaleSessionId('PED');

      toast.success(
        `${isBonusMode ? 'Pedido de Bonificação' : docType === 'orcamento' ? 'Orçamento' : 'Pedido de Venda'} ${orderNumber} emitido com sucesso!`,
        isBonusMode ? 'Bonificação Registrada' : 'Documento Emitido'
      );

      // Reset cart and fields (retornando ao padrão Venda Normal)
      setCart([]);
      setOrderKind('venda_normal');
      setDiscountInput('');
      setNotes('');
      setInternalNotes('');
      setFastSelectedProductId('');
      setFastProductSearchTerm('');
      setSelectedCustomerId('');
      setPaymentMethod('');
      setPaymentTerms('');
      setFreightType('entrega_propria');
      setDeliveryForecast('A Combinar');
      setSaleObservationAlerts([]);
      lastObservationCustomerSigRef.current = '';

      // Open receipt modal
      setSelectedOrder(finalizedOrder);
      setShowReceiptModal(true);
    } catch (e) {
      alert('Erro ao finalizar pedido: ' + (e as Error).message);
    }
  };

  // Atalho de Teclado F2 (Busca de Produtos), F10 e Ctrl+Enter (Emitir Pedido)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showProductLookupModal) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowProductLookupModal(false);
          fastProductInputRef.current?.focus();
        }
        return;
      }

      // Se qualquer modal estiver aberto, não aciona o atalho
      if (
        discountAuthPrompt ||
        saleObservationAlerts.length > 0 ||
        showPriceLookupModal ||
        showReceiptModal ||
        showSaleConfirmationModal ||
        showQuickCustomerModal ||
        showItemDiscountModal ||
        showNotesModal ||
        viewDetailsOrder ||
        editingOrder ||
        orderToCancel ||
        quoteToConvert
      ) {
        return;
      }

      if (activeTab !== 'novo_pedido') return;

      if (e.key === 'F2') {
        e.preventDefault();
        setShowProductLookupModal(true);
      } else if (e.key === 'F10' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
        e.preventDefault();
        if (cart.length > 0) {
          handlePreFinalizeOrder();
        } else {
          toast.error('Adicione ao menos um produto no pedido antes de finalizar.');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    cart,
    showPriceLookupModal,
    showProductLookupModal,
    showReceiptModal,
    showSaleConfirmationModal,
    showQuickCustomerModal,
    showItemDiscountModal,
    showNotesModal,
    viewDetailsOrder,
    editingOrder,
    orderToCancel,
    quoteToConvert,
    activeTab,
    paymentMethod,
    paymentTerms,
    saleObservationAlerts.length,
    discountAuthPrompt
  ]);

  // CONVERTER ORÇAMENTO EM VENDA (Abre modal in-app de confirmação)
  const handleConvertQuoteToSale = (quote: Order) => {
    if (quote.type !== 'orcamento') {
      toast.error('Apenas orçamentos comerciais podem ser convertidos em venda.');
      return;
    }

    if (quote.status === 'convertido_em_venda') {
      toast.error('Este orçamento já foi convertido em venda anteriormente.');
      return;
    }

    if (quote.status === 'cancelado') {
      toast.error('Orçamentos cancelados não podem ser convertidos em venda.');
      return;
    }

    setQuoteToConvert(quote);
  };

  // EXECUTAR CONVERSÃO DE ORÇAMENTO EM VENDA
  const executeConvertQuoteToSale = async () => {
    if (!quoteToConvert) return;
    setIsConvertingQuote(true);

    try {
      const quote = quoteToConvert;
      const nowIso = new Date().toISOString();
      const saleNumber = `VD-${new Date().getFullYear()}-${String(dbState.orders.length + 1).padStart(5, '0')}`;
      const orderCompanyId = quote.companyId || currentCompany.id;

      const state = Database.getState();
      let currentBalances = [...state.stockBalances];
      const movements: any[] = [];

      for (const item of quote.items) {
        const companyLocations = state.stockLocations.filter(
          (l) => l.status === 'ativo' && (!l.companyId || l.companyId === orderCompanyId)
        );
        const loc =
          companyLocations.find((l) => l.id === item.locationId) ||
          StockEngine.getCompanyDefaultLocation(companyLocations, orderCompanyId) ||
          companyLocations[0] || { id: 'loc-comercial', name: 'Comercial' };

        const { updatedBalances, createdMovement } = StockEngine.applyMovement(currentBalances, {
          companyId: orderCompanyId,
          productId: item.productId,
          productCode: item.productCode,
          productDescription: item.description,
          locationId: loc.id,
          locationName: loc.name,
          type: 'saida_venda',
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: item.unitCost * item.quantity,
          originDocType: 'venda',
          originDocId: saleNumber,
          date: nowIso,
          userId: currentUser.id,
          userName: currentUser.name,
          notes: `Baixa por conversão de orçamento ${quote.number} em venda ${saleNumber}`,
        });
        currentBalances = updatedBalances;
        movements.push(createdMovement);
      }

      const newSaleOrder: Order = {
        id: 'ORD-' + Date.now(),
        number: saleNumber,
        type: 'venda',
        origin: quote.origin,
        companyId: orderCompanyId,
        customerId: quote.customerId,
        customerName: quote.customerName,
        customerPhone: quote.customerPhone,
        userId: currentUser.id,
        userName: currentUser.name,
        items: quote.items,
        subtotal: quote.subtotal,
        discountTotal: quote.discountTotal,
        total: quote.total,
        paymentMethod: quote.paymentMethod,
        paymentTerm: quote.paymentTerm,
        installmentsCount: quote.installmentsCount || 1,
        receivedAmount: quote.total,
        changeAmount: 0,
        status: 'concluido',
        stockDeducted: true,
        financialGenerated: true,
        convertedFromOrderId: quote.id,
        createdAt: nowIso,
        updatedAt: nowIso,
        notes: `Convertido do Orçamento ${quote.number}. ${quote.notes || ''}`.trim(),
      };

      const updatedOrders = state.orders.map((o) =>
        o.id === quote.id
          ? {
              ...o,
              status: 'convertido_em_venda' as OrderStatus,
              notes: `${o.notes || ''} [Convertido em Venda ${saleNumber} em ${new Date().toLocaleString('pt-BR')}]`.trim(),
              updatedAt: nowIso,
            }
          : o
      );

      let updatedReceivables = [...state.accountsReceivable];
      if (quote.paymentMethod === 'boleto' || quote.paymentMethod === 'crediario' || (quote.installmentsCount || 1) > 1) {
        const installmentsCount = quote.installmentsCount || 1;
        const quoteTermInfo = Database.resolvePaymentTermInfo(quote.paymentTerm || '', installmentsCount);
        const valParcela = Number((quote.total / installmentsCount).toFixed(2));
        for (let i = 1; i <= installmentsCount; i++) {
          const daysOffset = quoteTermInfo.daysOffsets[i - 1] ?? i * 30;
          const due = new Date();
          due.setDate(due.getDate() + daysOffset);
          updatedReceivables.push({
            id: 'REC-' + Date.now() + '-' + i,
            companyId: orderCompanyId,
            orderId: newSaleOrder.id,
            orderNumber: newSaleOrder.number,
            customerId: quote.customerId,
            customerName: quote.customerName,
            docNumber: `${saleNumber}/${i}`,
            installmentNumber: i,
            totalInstallments: installmentsCount,
            issueDate: nowIso.split('T')[0],
            dueDate: due.toISOString().split('T')[0],
            originalValue: valParcela,
            discount: 0,
            addition: 0,
            paidValue: 0,
            balance: valParcela,
            paymentMethod: quote.paymentMethod === 'boleto' ? 'Boleto Bancário' : quote.paymentMethod === 'crediario' ? 'Crediário' : 'Cartão Crédito',
            bankAccountId: quote.paymentMethod === 'boleto' ? (quote.bankAccountId || 'acc-itau') : undefined,
            bankAccountName: quote.paymentMethod === 'boleto' ? (quote.bankAccountName || 'Itaú Unibanco - Cobrança & Boleto') : undefined,
            status: 'aberto',
            receipts: [],
          });
        }
      }

      state.stockBalances = currentBalances;
      state.stockMovements = [...movements, ...state.stockMovements];
      state.orders = [newSaleOrder, ...updatedOrders];
      state.accountsReceivable = updatedReceivables;
      Database.persist();

      try {
        await FirebaseSyncService.syncToFirebase(state, true);
      } catch (errSync) {
        console.warn('Aviso de sincronização Firebase:', errSync);
      }

      Database.addAuditLog(
        'CONVERSAO_ORCAMENTO_VENDA',
        'VENDAS',
        newSaleOrder.id,
        `Orçamento ${quote.number} convertido na Venda ${saleNumber} por ${currentUser.name}.`
      );

      toast.success(`Orçamento ${quote.number} convertido com sucesso na Venda ${saleNumber}!`);
      setSelectedOrder(newSaleOrder);
      setShowReceiptModal(true);
      setQuoteToConvert(null);
    } catch (e: any) {
      toast.error('Erro ao converter orçamento: ' + (e?.message || 'Falha inesperada'));
    } finally {
      setIsConvertingQuote(false);
    }
  };

  // ABERTURA DO MODAL IN-APP DE CANCELAMENTO / ESTORNO / EXCLUSÃO
  const handleOpenCancelModal = (order: Order, permanent: boolean = false) => {
    setOrderToCancel(order);
    setDeletePermanently(permanent);
    setCancellationReason('Cancelamento solicitado pelo cliente');
  };

  // COMPATIBILIDADE: chamada legada redireciona para o modal in-app
  const handleCancelOrder = (order: Order) => {
    handleOpenCancelModal(order, false);
  };

  // EXECUTAR CANCELAMENTO E ESTORNO DE ESTOQUE + EXCLUSÃO DE TÍTULOS A RECEBER SE A PRAZO
  const executeCancelOrder = async () => {
    if (!orderToCancel) return;
    setIsProcessingCancellation(true);

    try {
      const order = orderToCancel;
      const nowIso = new Date().toISOString();
      const orderCompanyId = order.companyId || currentCompany.id;
      const orderCompanyName =
        dbState.companies.find((c) => c.id === orderCompanyId)?.tradeName ||
        dbState.companies.find((c) => c.id === orderCompanyId)?.name ||
        currentCompany.name;

      const state = Database.getState();
      let currentBalances = [...state.stockBalances];
      const movements: any[] = [];

      // 1. Estorno de estoque para cada item vendido se o estoque foi baixado e não estava cancelado
      if (order.type === 'venda' && order.stockDeducted !== false && order.status !== 'cancelado') {
        for (const item of order.items) {
          const companyLocations = state.stockLocations.filter(
            (l) => l.status === 'ativo' && (!l.companyId || l.companyId === orderCompanyId)
          );
          const targetLoc =
            companyLocations.find((l) => l.id === item.locationId) ||
            StockEngine.getCompanyDefaultLocation(companyLocations, orderCompanyId) ||
            companyLocations[0] || {
              id: 'loc-comercial',
              name: 'Comercial',
            };

          const isCancellingBonus = isBonusOrder(order);
          const { updatedBalances, createdMovement } = StockEngine.applyMovement(currentBalances, {
            companyId: orderCompanyId,
            productId: item.productId,
            productCode: item.productCode,
            productDescription: item.description,
            locationId: targetLoc.id,
            locationName: targetLoc.name,
            type: isCancellingBonus ? 'estorno_bonificacao' : 'ajuste_inventario',
            quantity: item.quantity,
            unitCost: item.unitCost || 0,
            totalCost: (item.unitCost || 0) * item.quantity,
            originDocType: isCancellingBonus ? 'bonificacao' : 'venda',
            originDocId: order.number,
            date: nowIso,
            userId: currentUser.id,
            userName: currentUser.name,
            notes: isCancellingBonus
              ? formatBonusStockReversalNote(order.number, orderCompanyName, cancellationReason)
              : `Estorno de estoque por cancelamento do Pedido ${order.number} (${orderCompanyName}). Motivo: ${cancellationReason}`,
          });

          currentBalances = updatedBalances;
          movements.push(createdMovement);
        }
      }

      // 2. Exclusão de títulos a receber vinculados à venda (A Prazo / Boleto / Crediário / Cartão Parcelado)
      const initialReceivablesCount = state.accountsReceivable.length;
      state.accountsReceivable = state.accountsReceivable.filter(
        (r) =>
          r.orderId !== order.id &&
          r.orderNumber !== order.number &&
          !(r.docNumber && (r.docNumber === order.number || r.docNumber.startsWith(order.number + '/')))
      );
      const deletedReceivablesCount = initialReceivablesCount - state.accountsReceivable.length;

      // 3. Remover de romaneios de entrega (deliveryManifests) se houver e recalcular totais
      if (state.deliveryManifests && Array.isArray(state.deliveryManifests)) {
        state.deliveryManifests = state.deliveryManifests.map((manifest) => {
          if (manifest.orders && manifest.orders.some((o: any) => o.orderId === order.id || o.orderNumber === order.number)) {
            const remainingOrders = manifest.orders.filter((o: any) => o.orderId !== order.id && o.orderNumber !== order.number);
            return {
              ...manifest,
              orders: remainingOrders,
              totalOrders: remainingOrders.length,
              totalDelivered: remainingOrders.filter((o: any) => o.deliveryStatus === 'entregue').length,
              totalPending: remainingOrders.filter((o: any) => o.deliveryStatus === 'pendente').length,
              totalValue: remainingOrders.reduce((acc: number, o: any) => acc + (o.totalValue || 0), 0),
              totalAmountToCollect: remainingOrders
                .filter((o: any) => o.paymentStatus === 'cobrar_na_entrega')
                .reduce((acc: number, o: any) => acc + (o.amountToCollect || o.totalValue || 0), 0),
              totalVolumes: remainingOrders.reduce((acc: number, o: any) => acc + (o.volumesCount || 1), 0),
              updatedAt: nowIso,
            };
          }
          return manifest;
        });
      }

      // 4. Tratar o registro do pedido: exclusão permanente ou marcação como cancelado
      if (deletePermanently) {
        state.orders = state.orders.filter((o) => o.id !== order.id);
      } else {
        state.orders = state.orders.map((o) =>
          o.id === order.id
            ? {
                ...o,
                status: 'cancelado' as OrderStatus,
                deliveryStatus: undefined,
                deliveryManifestId: undefined,
                deliveryManifestNumber: undefined,
                deliveryManifestName: undefined,
                preManifestStatus: undefined,
                preManifestDeliveryStatus: undefined,
                notes: `${o.notes || ''} [Cancelado em ${new Date().toLocaleString('pt-BR')}: ${cancellationReason}]`.trim(),
                updatedAt: nowIso,
              }
            : o
        );
      }

      // 5. Atualizar estoques e movimentos no state
      state.stockBalances = currentBalances;
      if (movements.length > 0) {
        state.stockMovements = [...movements, ...state.stockMovements];
      }

      // 6. Gravar persistência local e disparar sincronização com Firebase
      Database.persist();
      try {
        await FirebaseSyncService.syncToFirebase(state, true);
      } catch (errSync) {
        console.warn('Aviso de sincronização Firebase:', errSync);
      }

      // 7. Registro de Auditoria
      Database.addAuditLog(
        deletePermanently ? 'EXCLUSAO_PEDIDO' : 'CANCELAMENTO_PEDIDO',
        'VENDAS',
        order.id,
        `${deletePermanently ? 'Exclusão definitiva' : 'Cancelamento'} do pedido ${order.number} (${orderCompanyName}) por ${currentUser.name}. Motivo: ${cancellationReason}. ${
          movements.length > 0 ? `${movements.length} item(ns) estornado(s). ` : ''
        }${deletedReceivablesCount > 0 ? `${deletedReceivablesCount} título(s) a receber excluído(s).` : ''}`
      );

      // 8. Mensagem de feedback via toast
      const successMsg = deletePermanently
        ? `Pedido ${order.number} excluído com sucesso! Estoque estornado${deletedReceivablesCount > 0 ? ` e ${deletedReceivablesCount} título(s) financeiro(s) a receber excluído(s)` : ''}.`
        : `Pedido ${order.number} cancelado com sucesso! Estoque estornado${deletedReceivablesCount > 0 ? ` e ${deletedReceivablesCount} título(s) financeiro(s) a receber excluído(s)` : ''}.`;
      toast.success(successMsg);

      // 9. Atualizar modal de detalhes se estiver aberto com o mesmo pedido
      if (viewDetailsOrder?.id === order.id) {
        if (deletePermanently) {
          setViewDetailsOrder(null);
        } else {
          setViewDetailsOrder({
            ...order,
            status: 'cancelado',
            notes: `${order.notes || ''} [Cancelado em ${new Date().toLocaleString('pt-BR')}: ${cancellationReason}]`.trim(),
            updatedAt: nowIso,
          });
        }
      }

      setOrderToCancel(null);
    } catch (err: any) {
      console.error('Erro ao cancelar/estornar pedido:', err);
      toast.error('Erro ao cancelar pedido: ' + (err?.message || 'Falha inesperada'));
    } finally {
      setIsProcessingCancellation(false);
    }
  };

  const getStatusBadge = (status: OrderStatus, ord?: Order) => {
    const manifestRef = ord?.deliveryManifestNumber ? (
      <span className="text-[10px] font-mono text-slate-500 mt-0.5 block">
        {ord.deliveryManifestNumber}
      </span>
    ) : null;

    switch (status) {
      case 'concluido':
        return <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full inline-block">Concluído</span>;
      case 'em_romaneio':
        return (
          <div className="inline-flex flex-col items-center">
            <span className="bg-indigo-100 text-indigo-800 text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
              <Truck size={11} />
              <span>Em Romaneio</span>
            </span>
            {manifestRef}
          </div>
        );
      case 'em_transito':
        return (
          <div className="inline-flex flex-col items-center">
            <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
              <Truck size={11} />
              <span>Em Trânsito</span>
            </span>
            {manifestRef}
          </div>
        );
      case 'entregue':
        return (
          <div className="inline-flex flex-col items-center">
            <span className="bg-teal-100 text-teal-800 text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
              <CheckCircle2 size={11} />
              <span>Entregue</span>
            </span>
            {manifestRef}
          </div>
        );
      case 'nao_entregue':
        return (
          <div className="inline-flex flex-col items-center">
            <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
              <AlertTriangle size={11} />
              <span>Não Entregue</span>
            </span>
            {manifestRef}
          </div>
        );
      case 'aberto':
        return <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full inline-block">Aberto</span>;
      case 'aprovado':
        return <span className="bg-cyan-100 text-cyan-800 text-[11px] font-bold px-2 py-0.5 rounded-full inline-block">Aprovado</span>;
      case 'em_elaboracao':
        return <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full inline-block">Em Elaboração</span>;
      case 'convertido_em_venda':
        return <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full inline-block">Convertido em Venda</span>;
      case 'cancelado':
        return <span className="bg-rose-100 text-rose-800 text-[11px] font-bold px-2 py-0.5 rounded-full inline-block">Cancelado</span>;
      case 'aguardando_aprovacao':
        return <span className="bg-slate-200 text-slate-800 text-[11px] font-bold px-2 py-0.5 rounded-full inline-block">Aguardando Aprov.</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full inline-block">{status}</span>;
    }
  };

  return (
    <div
      className={
        activeTab === 'historico'
          ? 'flex flex-col gap-3 max-w-[1700px] mx-auto lg:h-[calc(100vh-5.5rem)]'
          : 'space-y-3 max-w-[1700px] mx-auto pb-12'
      }
    >
      {/* Barra de Navegação Superior e Alternância Venda / Orçamento */}
      <div className="shrink-0 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <ClipboardList size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Pedido de Venda & Orçamentos
              </h1>
              <span className="text-[10px] font-extrabold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full uppercase">
                {activeTab === 'novo_pedido' ? 'Emissão Ativa' : 'Histórico'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {activeTab === 'novo_pedido'
                ? 'Emita novos pedidos de venda e propostas de orçamento diretamente pelo retaguarda com cálculo automático'
                : 'Consulte pedidos gravados, reimprima comprovantes e converta orçamentos em venda'}
            </p>
          </div>
        </div>

        {/* Abas Superiores e Seletor de Tipo */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            ref={priceLookupBtnRef}
            type="button"
            onClick={() => setShowPriceLookupModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-colors cursor-pointer"
            title="Consultar preço e estoque de produtos sem alterar o pedido em andamento"
          >
            <Tag size={14} className="text-blue-600" />
            <span>Busca Preço</span>
          </button>

          {activeTab === 'novo_pedido' && (
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setDocType('venda');
                  setOrderKind('venda_normal');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  docType === 'venda' && orderKind === 'venda_normal'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckCircle2 size={14} />
                <span>Venda Normal</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocType('venda');
                  setOrderKind('bonificacao');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  docType === 'venda' && orderKind === 'bonificacao'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-sky-700'
                }`}
                title="Emitir pedido de bonificação (sem cobrança financeira, com baixa de estoque)"
              >
                <Gift size={14} />
                <span>Bonificação</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocType('orcamento');
                  setOrderKind('venda_normal');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  docType === 'orcamento'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText size={14} />
                <span>Orçamento Comercial</span>
              </button>
            </div>
          )}

          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('novo_pedido')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'novo_pedido'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plus size={14} className="text-blue-600" />
              <span>Novo Pedido</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('historico')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'historico'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock size={14} className="text-slate-500" />
              <span>Histórico ({filteredOrders.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: EMISSÃO DE NOVO PEDIDO DE VENDA / ORÇAMENTO (LAYOUT EXECUTIVO ERP) */}
      {/* ========================================================================= */}
      {activeTab === 'novo_pedido' ? (
        <div className="space-y-2.5">
          {/* 1. BARRA DE COMANDO RÁPIDO: CLIENTE, DEPÓSITO DE SAÍDA & EXPEDIÇÃO */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 sm:p-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
              {/* Bloco: Seleção do Cliente (Mesmo padrão da Venda Mobile) */}
              <div className="md:col-span-6 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <UserCheck size={15} className="text-blue-600" />
                    <span>Cliente do Pedido *</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowQuickCustomerModal(true)}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 py-1 cursor-pointer"
                  >
                    <UserPlus size={14} />
                    <span>+ Novo Cliente</span>
                  </button>
                </div>

                <CustomerSearchCombobox
                  customers={customers}
                  selectedCustomerId={selectedCustomerId}
                  onSelectCustomer={setSelectedCustomerId}
                  onOpenNewCustomerModal={() => setShowQuickCustomerModal(true)}
                  placeholder="Buscar cliente..."
                  size="lg"
                />

                {selectedCustomer && (
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold text-emerald-950 gap-2">
                      <span className="truncate">{selectedCustomer.name}</span>
                      <span className="font-mono text-emerald-800 shrink-0">
                        Limite: {formatCurrency(selectedCustomer.creditLimit)}
                      </span>
                    </div>
                    {selectedCustomer.phone && (
                      <p className="text-slate-600">Tel: {selectedCustomer.phone}</p>
                    )}
                    {selectedCustomer.deliveryRouteName && (
                      <p className="text-emerald-800 font-semibold">Rota: {selectedCustomer.deliveryRouteName}</p>
                    )}
                  </div>
                )}

                {selectedCustomer && selectedCustomerVoucherBalance > 0 && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 text-xs text-amber-900 space-y-1 shadow-2xs">
                    <div className="flex items-center justify-between gap-2 font-bold">
                      <span className="flex items-center gap-1.5">
                        <Ticket size={15} className="text-amber-600 shrink-0" />
                        <span>Cliente possui Vale / Crédito disponível!</span>
                      </span>
                      <span className="font-mono font-black text-amber-900 bg-white px-2 py-0.5 rounded border border-amber-300 shrink-0">
                        {formatCurrency(selectedCustomerVoucherBalance)}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Vale(s): {selectedCustomerVouchers.map((v) => `${v.code} (${formatCurrency(v.remainingBalance)})`).join(' • ')}
                    </p>
                  </div>
                )}
              </div>

              {/* Depósito de Saída, Frete & Prazo de Entrega (6 Colunas) */}
              <div className="md:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1 py-1">
                    <Warehouse size={13} className="text-blue-600" />
                    <span>Depósito de Saída:</span>
                  </label>
                  <select
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-2.5 text-xs sm:text-sm font-bold text-slate-800 focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-blue-500 truncate cursor-pointer"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {loc.id === 'loc-comercial' || loc.name.toLowerCase() === 'comercial' ? '(Padrão)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1 py-1">
                    <Truck size={13} className="text-slate-500" />
                    <span>Frete:</span>
                  </label>
                  <select
                    value={freightType}
                    onChange={(e) => setFreightType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-2.5 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-hidden focus:bg-white truncate cursor-pointer"
                  >
                    <option value="retirada">Retirada Balcão</option>
                    <option value="entrega_propria">Entrega Própria</option>
                    <option value="cif">Transp. CIF (Pago)</option>
                    <option value="fob">Transp. FOB (Dest.)</option>
                    <option value="sem_frete">Sem Frete</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1 py-1">
                    <Calendar size={13} className="text-slate-500" />
                    <span>Prazo de Entrega:</span>
                  </label>
                  <select
                    value={deliveryForecast}
                    onChange={(e) => setDeliveryForecast(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-2.5 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-hidden focus:bg-white truncate cursor-pointer"
                  >
                    <option value="Imediato">Imediato</option>
                    <option value="24 Horas">24 Horas</option>
                    <option value="3 a 5 Dias">3 a 5 Dias</option>
                    <option value="A Combinar">A Combinar</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Avisos de Observações de Produtos e Cliente (Modal Central Obrigatório) */}
          {saleObservationAlerts.length > 0 && (
            <SaleObservationAlerts
              alerts={saleObservationAlerts}
              onDismiss={(id) => setSaleObservationAlerts((prev) => dismissSaleAlert(prev, id))}
              onDismissAll={() => setSaleObservationAlerts([])}
              onAfterClose={() => {
                if (fastSelectedProductId) {
                  fastQtyInputRef.current?.focus();
                  fastQtyInputRef.current?.select();
                } else {
                  fastProductInputRef.current?.focus();
                }
              }}
              variant="default"
            />
          )}

          {/* 2. CENTRAL DE INCLUSÃO DE PRODUTOS NO PEDIDO (VISÍVEL NO TOPO DA TELA ABERTA SEM ROLAGEM) */}
          <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-xs p-3 sm:p-3.5 space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Package size={14} />
                </div>
                <h2 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                  Inclusão de Produtos no Pedido
                </h2>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md hidden sm:inline-block">
                  Depósito de Saída: <strong>{selectedLocationName}</strong> (Padrão)
                </span>
              </div>

              {/* Modo de Inclusão & Ações Rápidas */}
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setItemsEntryMode('insercao_rapida')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer text-xs ${
                      itemsEntryMode === 'insercao_rapida'
                        ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                        : 'text-slate-600 hover:text-slate-900 font-semibold'
                    }`}
                  >
                    <Sparkles size={12} />
                    <span>Linha a Linha (Rápido)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemsEntryMode('catalogo_grade')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer text-xs ${
                      itemsEntryMode === 'catalogo_grade'
                        ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                        : 'text-slate-600 hover:text-slate-900 font-semibold'
                    }`}
                  >
                    <Package size={12} />
                    <span>Catálogo Visual</span>
                  </button>
                </div>
              </div>
            </div>

            {/* MODO A: INSERÇÃO RÁPIDA LINHA A LINHA */}
            {itemsEntryMode === 'insercao_rapida' ? (
              <div className="bg-slate-50/80 p-3.5 sm:p-4 rounded-xl border border-slate-200 space-y-3 relative">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  {/* Busca e Seleção do Produto (6 Colunas) */}
                  <div className="md:col-span-6 space-y-1 relative">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        Produto (Código, Barras ou Nome) *:
                      </label>
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-1.5 py-0.2 rounded border border-emerald-300">
                        Depósito: <strong>{selectedLocationName}</strong>
                      </span>
                    </div>

                    {(() => {
                      const selectedFastProd = fastSelectedProductId
                        ? dbState.products.find((p) => p.id === fastSelectedProductId)
                        : null;

                      if (selectedFastProd) {
                        const selectedPrice = StockEngine.getProductPriceForCompany(selectedFastProd, currentCompany.id);
                        return (
                          <div className="flex items-center justify-between gap-2 w-full bg-blue-50/80 border-2 border-blue-400 rounded-xl py-1.5 px-2.5">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="font-mono text-[11px] font-extrabold text-blue-700 bg-white px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                                {selectedFastProd.code}
                              </span>
                              <span className="text-xs font-extrabold text-slate-900 truncate" title={selectedFastProd.description}>
                                {selectedFastProd.description}
                              </span>
                              <span className="text-[11px] font-mono font-bold text-emerald-700 shrink-0 hidden sm:inline">
                                ({formatCurrency(selectedPrice)}/{selectedFastProd.unit})
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setFastSelectedProductId('');
                                  setFastProductSearchTerm('');
                                  setTimeout(() => fastProductInputRef.current?.focus(), 20);
                                }}
                                className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                                title="Trocar produto selecionado"
                              >
                                <X size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowProductLookupModal(true)}
                                className="px-2 py-1 bg-white hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors border border-blue-200 cursor-pointer"
                              >
                                <Search size={12} />
                                <span>Trocar [F2]</span>
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="relative">
                          <Barcode className="absolute left-2.5 top-2 text-slate-400 pointer-events-none" size={18} />
                          <input
                            ref={fastProductInputRef}
                            type="text"
                            placeholder="Buscar produto por código, barras ou nome (3+ letras)..."
                            value={fastProductSearchTerm}
                            onChange={(e) => {
                              setFastProductSearchTerm(e.target.value);
                              if (fastSelectedProductId) setFastSelectedProductId('');
                            }}
                            onKeyDown={(e) => {
                              const visibleResults = fastProductSearchResults.slice(0, 8);
                              if (e.key === 'ArrowDown' && visibleResults.length > 0) {
                                e.preventDefault();
                                setHighlightedProductIndex((prev) =>
                                  prev < visibleResults.length - 1 ? prev + 1 : prev
                                );
                              } else if (e.key === 'ArrowUp' && visibleResults.length > 0) {
                                e.preventDefault();
                                setHighlightedProductIndex((prev) => (prev > 0 ? prev - 1 : 0));
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                if (visibleResults.length > 0 && fastProductSearchTerm.trim().length >= 3) {
                                  const picked = visibleResults[highlightedProductIndex] || visibleResults[0];
                                  if (picked) {
                                    handleSelectFastProduct(picked);
                                    return;
                                  }
                                }
                                handleProcessFastProductQuery(fastProductSearchTerm);
                              } else if (e.key === 'Escape') {
                                setFastProductSearchTerm('');
                                setFastSelectedProductId('');
                              }
                            }}
                            className="w-full pl-8 pr-28 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all"
                          />

                          <div className="absolute right-1 top-1 bottom-1 flex items-center gap-1">
                            {fastProductSearchTerm && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFastProductSearchTerm('');
                                  fastProductInputRef.current?.focus();
                                }}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                                title="Limpar busca"
                              >
                                <X size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowProductLookupModal(true)}
                              className="h-full px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors border border-blue-200 cursor-pointer"
                            >
                              <Search size={12} />
                              <span>Buscar [F2]</span>
                            </button>
                          </div>

                          {/* Autocomplete Dropdown ao digitar (a partir do 3º caractere, igual ao PDV Balcão) */}
                          {fastProductSearchResults.length > 0 && fastProductSearchTerm.trim().length >= 3 && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-60 overflow-y-auto divide-y divide-slate-100">
                              {fastProductSearchResults.slice(0, 8).map((prod, idx) => {
                                const stock = StockEngine.getBalance(dbState.stockBalances, prod.id, selectedLocationId);
                                const isHighlighted = idx === highlightedProductIndex;
                                return (
                                  <div
                                    key={prod.id}
                                    onMouseEnter={() => setHighlightedProductIndex(idx)}
                                    onClick={() => handleSelectFastProduct(prod)}
                                    className={`p-2.5 cursor-pointer flex items-center justify-between transition-colors ${
                                      isHighlighted ? 'bg-blue-50/90' : 'hover:bg-blue-50/70'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                                        {prod.code}
                                      </span>
                                      <div className="min-w-0">
                                        <div className="font-bold text-xs text-slate-900 truncate">{prod.description}</div>
                                        <div className="text-[10px] text-slate-400">
                                          {prod.barcode ? `EAN: ${prod.barcode} • ` : ''}
                                          Estoque em {selectedLocationName}:{' '}
                                          <strong className={stock.quantity <= 0 ? 'text-rose-600' : 'text-emerald-600'}>
                                            {formatQuantity(stock.quantity)} {prod.unit}
                                          </strong>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="text-right shrink-0 ml-2">
                                      <div className="font-extrabold text-xs sm:text-sm text-slate-900">
                                        {formatCurrency(StockEngine.getProductPriceForCompany(prod, currentCompany.id))}
                                      </div>
                                      <span className="text-[9px] text-blue-600 font-bold">Clique para selecionar</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Quantidade (2 Colunas) */}
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Quantidade:
                    </label>
                    <div className="inline-flex items-center w-full bg-white border border-slate-300 rounded-xl focus-within:ring-2 focus-within:ring-blue-500">
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(1, (fastItemQty || 1) - 1);
                          setFastItemQtyInput(String(next).replace('.', ','));
                        }}
                        className="px-2.5 py-2 text-slate-600 hover:bg-slate-100 rounded-l-xl cursor-pointer"
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        ref={fastQtyInputRef}
                        type="text"
                        inputMode="decimal"
                        value={fastItemQtyInput}
                        onChange={(e) => setFastItemQtyInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                        onBlur={() => {
                          if (!fastItemQtyInput.trim() || fastItemQty <= 0) {
                            setFastItemQtyInput('1');
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddFastItem();
                          }
                        }}
                        className="w-full text-center text-xs font-black text-slate-900 bg-transparent focus:outline-hidden"
                        title="Digite a quantidade desejada e tecle Enter para incluir"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = (fastItemQty || 0) + 1;
                          setFastItemQtyInput(String(next).replace('.', ','));
                        }}
                        className="px-2.5 py-2 text-slate-600 hover:bg-slate-100 rounded-r-xl cursor-pointer"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Desconto ou Acréscimo no Item (2 Colunas) */}
                  <div className="md:col-span-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <select
                        value={fastItemAdjustmentMode}
                        onChange={(e) => setFastItemAdjustmentMode(e.target.value as any)}
                        className={`text-[11px] font-black rounded-lg px-1.5 py-0.5 border cursor-pointer focus:outline-hidden transition-colors ${
                          fastItemAdjustmentMode === 'acrescimo'
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : 'bg-amber-50 text-amber-800 border-amber-300'
                        }`}
                        title="Selecione no mesmo campo se deseja aplicar Desconto ou Acréscimo"
                      >
                        <option value="desconto">Desconto (-)</option>
                        <option value="acrescimo">Acréscimo (+)</option>
                      </select>
                      <div className="inline-flex rounded-md bg-slate-200 p-0.5 text-[9px] font-bold">
                        <button
                          type="button"
                          onClick={() => setFastItemAdjustmentType('percent')}
                          className={`px-1.5 py-0.2 rounded cursor-pointer ${
                            fastItemAdjustmentType === 'percent' ? 'bg-blue-600 text-white' : 'text-slate-600'
                          }`}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => setFastItemAdjustmentType('value')}
                          className={`px-1.5 py-0.2 rounded cursor-pointer ${
                            fastItemAdjustmentType === 'value' ? 'bg-blue-600 text-white' : 'text-slate-600'
                          }`}
                        >
                          R$
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder={fastItemAdjustmentType === 'percent' ? '0' : '0,00'}
                      value={fastItemAdjustmentInput}
                      onChange={(e) => setFastItemAdjustmentInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddFastItem();
                        }
                      }}
                      className={`w-full bg-white border rounded-xl py-2 px-2.5 text-right font-black text-xs text-slate-900 focus:outline-hidden focus:ring-2 ${
                        fastItemAdjustmentMode === 'acrescimo'
                          ? 'border-blue-300 focus:ring-blue-500'
                          : 'border-slate-300 focus:ring-amber-500'
                      }`}
                    />
                  </div>

                  {/* Botão de Adição (2 Colunas) */}
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      disabled={!fastSelectedProductId && !fastProductSearchTerm.trim()}
                      onClick={() => handleAddFastItem()}
                      className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Plus size={15} />
                      <span>Incluir Item</span>
                    </button>
                  </div>
                </div>

                {/* Feedback Visual de Inclusão / Leitura (igual ao PDV Balcão) */}
                {productFeedback && (
                  <div
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between transition-all ${
                      productFeedback.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs'
                        : productFeedback.type === 'error'
                        ? 'bg-rose-50 text-rose-800 border border-rose-300 shadow-2xs'
                        : 'bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {productFeedback.type === 'success' ? (
                        <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle size={15} className={productFeedback.type === 'error' ? 'text-rose-600 shrink-0' : 'text-amber-600 shrink-0'} />
                      )}
                      <span className="truncate">{productFeedback.text}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProductFeedback(null)}
                      className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer shrink-0 ml-2"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Prévia Informativa do Produto Selecionado */}
                {(() => {
                  const selProd = dbState.products.find((p) => p.id === fastSelectedProductId);
                  if (!selProd) return null;
                  const stock = StockEngine.getBalance(dbState.stockBalances, selProd.id, selectedLocationId);
                  const rawVal = parseFloat(fastItemAdjustmentInput.replace(',', '.')) || 0;
                  const companyPrice = StockEngine.getProductPriceForCompany(selProd, currentCompany.id);
                  const grossItem = fastItemQty * companyPrice;
                  let calculatedDisc = 0;
                  let calculatedAdd = 0;
                  if (rawVal > 0) {
                    if (fastItemAdjustmentMode === 'desconto') {
                      if (fastItemAdjustmentType === 'percent') {
                        const effectivePct = selProd.maxDiscountEnabled
                          ? Math.min(100, rawVal)
                          : Math.min(currentUser.permissions.maxDiscountPercent, rawVal);
                        calculatedDisc = (grossItem * effectivePct) / 100;
                      } else {
                        calculatedDisc = Math.min(grossItem, rawVal);
                      }
                    } else {
                      // Acréscimo
                      if (fastItemAdjustmentType === 'percent') {
                        calculatedAdd = (grossItem * rawVal) / 100;
                      } else {
                        calculatedAdd = rawVal;
                      }
                    }
                  }
                  const lineTotal = Math.max(0, grossItem + calculatedAdd - calculatedDisc);

                  return (
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {selProd.code}
                        </span>
                        <span className="font-extrabold text-slate-900">{selProd.description}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-[11px] text-slate-500">
                          Estoque no local:{' '}
                          <strong className={stock.quantity <= 0 ? 'text-rose-600' : 'text-emerald-700'}>
                            {formatQuantity(stock.quantity)} {selProd.unit}
                          </strong>
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-[11px] text-slate-500">
                          Tabela: <strong className="text-slate-800 font-mono">{formatCurrency(companyPrice)}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-right shrink-0">
                        {calculatedDisc > 0 && (
                          <span className="text-[11px] text-amber-700 font-bold">
                            Desc: -{formatCurrency(calculatedDisc)}
                          </span>
                        )}
                        {calculatedAdd > 0 && (
                          <span className="text-[11px] text-blue-700 font-bold">
                            Acrésc: +{formatCurrency(calculatedAdd)}
                          </span>
                        )}
                        <span className="text-slate-500 text-[11px]">Subtotal da linha:</span>
                        <span className="font-black text-sm text-emerald-700 font-mono">
                          {formatCurrency(lineTotal)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* MODO B: CATÁLOGO VISUAL COM FILTROS DE CATEGORIA */
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Pesquisar no catálogo por nome, código ou código de barras..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    <option value="todos">Todas as Categorias</option>
                    {categories.filter((c) => c !== 'todos').map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => setFilterByLocationStock((prev) => !prev)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
                      filterByLocationStock
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                    title="Alternar filtro de produtos com saldo no depósito selecionado"
                  >
                    <Warehouse size={13} className={filterByLocationStock ? 'text-emerald-600' : 'text-slate-400'} />
                    <span>Depósito: {selectedLocationName}</span>
                    <span className="text-[10px] bg-white px-1.5 py-0.2 rounded border font-mono">
                      {filteredProducts.length}
                    </span>
                  </button>
                </div>

                {/* Grade de Cards do Catálogo */}
                {filteredProducts.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500 space-y-1">
                    <p className="font-bold text-slate-700">Nenhum produto com saldo encontrado no depósito "{selectedLocationName}".</p>
                    <p className="text-[11px] text-slate-400">Alterne o depósito de saída acima ou desative o filtro por depósito para consultar outros itens.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[360px] overflow-y-auto p-1">
                    {filteredProducts.map((prod) => {
                      const stock = StockEngine.getBalance(dbState.stockBalances, prod.id, selectedLocationId);
                      const isOutOfStock = stock.quantity <= 0;
                      const itemInCart = cart.find((i) => i.productId === prod.id);

                      return (
                        <div
                          key={prod.id}
                          className="bg-white p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-xs transition-all flex flex-col justify-between gap-2"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                {prod.code}
                              </span>
                              <span className={`text-[10px] font-bold ${isOutOfStock ? 'text-rose-600' : 'text-emerald-700'}`}>
                                Saldo ({selectedLocationName}): {formatQuantity(stock.quantity)} {prod.unit}
                              </span>
                            </div>
                          <h4 className="text-xs font-extrabold text-slate-900 line-clamp-1">{prod.description}</h4>
                          <span className="text-xs font-black text-slate-900 font-mono block mt-1">
                            {formatCurrency(StockEngine.getProductPriceForCompany(prod, currentCompany.id))}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                          {itemInCart ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              ✓ {itemInCart.quantity} no pedido
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">UN: {prod.unit}</span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleAddToCart(prod, 1)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                          >
                            <Plus size={13} />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

          {/* 3. BANCADA DE TRABALHO: GRADE DE ITENS (ESQUERDA) & FECHAMENTO COMERCIAL (DIREITA) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
            {/* LADO ESQUERDO (7 COLUNAS): GRADE DE ITENS DO PEDIDO */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
              <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <ShoppingCart size={15} className="text-blue-600" />
                  <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                    Grade de Itens ({cart.length} item{cart.length === 1 ? '' : 's'} • {cart.reduce((s, i) => s + i.quantity, 0)} vol)
                  </h3>
                </div>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Deseja limpar todos os itens deste pedido?')) {
                        clearSaleSessionAuthorizations(saleSessionIdRef.current);
                        saleSessionIdRef.current = generateSaleSessionId('PED');
                        setCart([]);
                        setSaleObservationAlerts((prev) => clearProductSaleAlerts(prev));
                      }
                    }}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    <span>Limpar grade</span>
                  </button>
                )}
              </div>

              {/* Tabela com scroll interno */}
              {cart.length === 0 ? (
                <div className="p-8 text-center text-slate-400 space-y-1.5">
                  <ShoppingBag size={32} className="mx-auto text-slate-300" />
                  <p className="font-extrabold text-xs text-slate-700">Nenhum produto incluído no pedido</p>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    Selecione o produto acima e clique em "Incluir Item" para lançar os produtos diretamente nesta bancada.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[300px] xl:max-h-[360px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-200 shadow-2xs">
                      <tr className="text-[10px] font-black uppercase text-slate-600">
                        <th className="py-2 px-2.5 text-center w-8">#</th>
                        <th className="py-2 px-2 w-20">Código</th>
                        <th className="py-2 px-2.5 min-w-[150px]">Descrição</th>
                        <th className="py-2 px-1 text-center w-12">UN</th>
                        <th className="py-2 px-2 text-center w-24">Qtd</th>
                        <th className="py-2 px-2 text-right w-20">Tabela</th>
                        <th className="py-2 px-2 text-right w-20">Desc./Acrésc.</th>
                        <th className="py-2 px-2 text-right w-20">Líquido</th>
                        <th className="py-2 px-2 text-right w-24">Subtotal</th>
                        <th className="py-2 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cart.map((item, index) => {
                        const grossLine = item.quantity * item.unitPrice;
                        const discVal = item.discountValue || 0;
                        const addVal = item.additionValue || 0;
                        const netUnit = item.quantity > 0 ? (grossLine + addVal - discVal) / item.quantity : item.unitPrice;

                        return (
                          <tr key={item.id} className="hover:bg-blue-50/20 transition-colors">
                            <td className="py-2 px-2.5 text-center font-bold text-slate-400 font-mono text-[10px]">
                              {index + 1}
                            </td>
                            <td className="py-2 px-2 font-mono text-[11px] font-bold text-blue-700">
                              {item.productCode}
                            </td>
                            <td className="py-2 px-2.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-extrabold text-slate-900 text-xs block truncate max-w-[200px]" title={item.description}>
                                  {item.description}
                                </span>
                                {item.isMasterPack && (
                                  <span className="inline-flex items-center gap-1 text-[9px] bg-amber-100 text-amber-900 font-extrabold px-1.5 py-0.2 rounded border border-amber-300">
                                    <Boxes size={10} className="text-amber-700" />
                                    Master ({item.masterPackUnits} un/{item.unit})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-1 text-center font-semibold text-slate-500 text-[10px]">
                              {item.unit}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemQty(item.productId, -1)}
                                  className="px-1.5 py-1 hover:bg-slate-200 text-slate-600 rounded-l-lg cursor-pointer"
                                  title="Diminuir 1"
                                >
                                  <Minus size={10} />
                                </button>
                                <input
                                  type="number"
                                  step="any"
                                  min="0.001"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val > 0) {
                                      handleSetItemQty(item.productId, val);
                                    }
                                  }}
                                  className="w-11 text-center font-black font-mono text-xs text-slate-900 bg-white py-0.5 focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  title="Clique para digitar a quantidade diretamente"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemQty(item.productId, 1)}
                                  className="px-1.5 py-1 hover:bg-slate-200 text-slate-600 rounded-r-lg cursor-pointer"
                                  title="Aumentar 1"
                                >
                                  <Plus size={10} />
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-slate-600 text-[11px]">
                              {formatCurrency(item.unitPrice)}
                            </td>
                            <td className="py-2 px-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleOpenItemDiscount(item)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                                  addVal > 0
                                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                    : discVal > 0
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                                }`}
                                title="Editar desconto ou acréscimo deste item"
                              >
                                {addVal > 0
                                  ? `+${formatCurrency(addVal)}`
                                  : discVal > 0
                                  ? `-${formatCurrency(discVal)}`
                                  : '0,00'}
                              </button>
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-slate-800 font-bold text-[11px]">
                              {formatCurrency(netUnit)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-slate-900 font-black text-xs">
                              {formatCurrency(item.totalPrice)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.productId)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                                title="Remover item da grade"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-slate-50 border-t border-slate-200 font-bold text-slate-700">
                      <tr>
                        <td colSpan={4} className="py-2 px-2.5 text-[11px]">
                          Totais: {cart.reduce((s, i) => s + i.quantity, 0)} volumes
                        </td>
                        <td colSpan={4} className="py-2 px-2 text-right text-slate-500 text-[11px]">
                          Subtotal Itens:
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-black text-slate-900 text-xs">
                          {formatCurrency(subtotalAfterItemDiscounts)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* LADO DIREITO (5 COLUNAS): CONDIÇÕES DE PAGAMENTO, DESCONTO GLOBAL & TOTAIS */}
            <div className="lg:col-span-5 space-y-2.5">
              {/* Banner Visual Destacado quando em Modo Bonificação */}
              {isBonusMode && (
                <div className="bg-gradient-to-r from-sky-600 to-blue-700 text-white rounded-2xl p-3.5 shadow-md border border-sky-500 flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0 mt-0.5">
                    <Gift size={18} className="text-white" />
                  </div>
                  <div className="space-y-0.5 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black uppercase tracking-wider text-xs">
                        MODO BONIFICAÇÃO ATIVO
                      </span>
                      <span className="text-[10px] font-black uppercase bg-white text-sky-800 px-2 py-0.5 rounded-full">
                        SEM COBRANÇA
                      </span>
                    </div>
                    <p className="text-[11px] text-sky-100 leading-snug">
                      Este pedido realizará a <strong>saída de estoque por bonificação</strong>, sem gerar faturamento, cobrança, comissão ou Contas a Receber.
                    </p>
                  </div>
                </div>
              )}

              {/* Card de Condições de Pagamento (ou Resumo de Bonificação) */}
              <div className={`bg-white rounded-2xl border shadow-xs p-3 sm:p-3.5 space-y-2.5 ${isBonusMode ? 'border-sky-300' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    {isBonusMode ? (
                      <Gift size={15} className="text-sky-600" />
                    ) : (
                      <CreditCard size={15} className="text-blue-600" />
                    )}
                    <span className="text-xs font-black uppercase text-slate-800 tracking-wider">
                      {isBonusMode ? 'Natureza: Pedido de Bonificação' : 'Pagamento & Condições'}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      isBonusMode ? 'bg-sky-100 text-sky-800' : 'text-slate-400'
                    }`}
                  >
                    {isBonusMode ? 'BONIFICAÇÃO' : 'Comercial'}
                  </span>
                </div>

                {isBonusMode ? (
                  <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sky-900">Cobrança Financeira:</span>
                      <span className="font-black text-sky-950 uppercase">Isenta (R$ 0,00)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sky-900">Contas a Receber:</span>
                      <span className="font-bold text-sky-800">Não gera títulos</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sky-900">Movimentação de Estoque:</span>
                      <span className="font-bold text-emerald-700">Saída por Bonificação</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="mb-1">
                          <label className="text-[11px] font-bold text-slate-700 block">
                            Forma de Pagto *
                          </label>
                        </div>
                        <select
                          value={paymentMethod}
                          onChange={(e) => {
                            const method = e.target.value as Order['paymentMethod'] | '';
                            setPaymentMethod(method);
                            if (method === 'pix' || method === 'dinheiro' || method === 'cartao_debito') {
                              setPaymentTerms('a_vista');
                              setInstallments(1);
                            } else if (method === 'cartao_credito' || method === 'boleto' || method === 'crediario') {
                              setPaymentTerms('parcelado');
                              setInstallments(1);
                            } else {
                              setPaymentTerms('');
                              setInstallments(1);
                            }
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 font-bold focus:outline-hidden focus:bg-white text-xs cursor-pointer transition-all"
                        >
                          <option value="">Selecione a forma...</option>
                          <option value="pix">Pix Cobrança</option>
                          <option value="boleto">Boleto Bancário</option>
                          <option value="cartao_credito">Cartão de Crédito</option>
                          <option value="cartao_debito">Cartão de Débito</option>
                          <option value="crediario">Crediário Próprio</option>
                          <option value="dinheiro">Dinheiro</option>
                        </select>
                      </div>

                      <div>
                        <div className="mb-1">
                          <label className="text-[11px] font-bold text-slate-700 block">
                            Prazo de Pagto *
                          </label>
                        </div>
                        <select
                          value={paymentTerms}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPaymentTerms(val);
                            if (val === 'a_vista') {
                              setInstallments(1);
                            } else {
                              const info = Database.resolvePaymentTermInfo(val, 1);
                              if (info.termRecord) {
                                setInstallments(info.installmentsCount);
                              }
                            }
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 font-bold focus:outline-hidden focus:bg-white text-xs cursor-pointer transition-all"
                        >
                          <option value="">Selecione o prazo...</option>
                          {(() => {
                            const activeTerms = Database.getPaymentTermsList(currentCompany.id).filter(
                              (t) => t.status === 'ativo'
                            );
                            const aVistaTerm = activeTerms.find(
                              (t) => t.code.toUpperCase() === 'A_VISTA' || t.id === 'term-avista'
                            );
                            const otherTerms = activeTerms.filter(
                              (t) => t.code.toUpperCase() !== 'A_VISTA' && t.id !== 'term-avista'
                            );
                            return (
                              <>
                                <option value="a_vista">
                                  {aVistaTerm ? aVistaTerm.name : 'À Vista / Imediato'}
                                </option>
                                <option value="parcelado">
                                  {installments > 1 ? `Parcelado (${installments}x de ${formatCurrency(orderTotal / installments)})` : 'Parcelado (1x)'}
                                </option>
                                {otherTerms.map((term) => (
                                  <option key={term.id} value={term.id}>
                                    {term.name}
                                  </option>
                                ))}
                                <option value="personalizado">Personalizado</option>
                              </>
                            );
                          })()}
                        </select>
                      </div>
                    </div>

                    {paymentMethod && (
                      <p className="text-[11px] text-slate-500 italic">
                        {paymentMethod === 'pix' || paymentMethod === 'dinheiro' || paymentMethod === 'cartao_debito' ? (
                          <>
                            Prazo <strong>"À Vista / Imediato"</strong> selecionado automaticamente para{' '}
                            {paymentMethod === 'pix' ? 'Pix' : paymentMethod === 'dinheiro' ? 'Dinheiro' : 'Débito'}.
                          </>
                        ) : (
                          <>
                            Prazo <strong>"Parcelado (1x)"</strong> selecionado automaticamente. Você pode escolher outro prazo acima ou alterar as parcelas abaixo.
                          </>
                        )}
                      </p>
                    )}

                    {/* Se Boleto: Banco emissor */}
                    {paymentMethod === 'boleto' && (
                      <div className="bg-amber-50/80 p-2 rounded-xl border border-amber-200 space-y-1">
                        <label className="text-[10px] font-bold text-amber-900 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Barcode size={12} className="text-amber-700" />
                            Conta / Banco para Emissão:
                          </span>
                        </label>
                        <select
                          value={selectedBoletoAccountId}
                          onChange={(e) => setSelectedBoletoAccountId(e.target.value)}
                          className="w-full bg-white border border-amber-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                        >
                          {Database.getBoletoAccounts(currentCompany.id).map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} {acc.bankCode ? `(${acc.bankCode})` : ''} - Ag: {acc.agency || '-'} C/C: {acc.accountNumber || '-'}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Parcelas se Cartão ou Boleto ou faturado */}
                    {(paymentMethod === 'cartao_credito' || paymentMethod === 'boleto' || paymentMethod === 'crediario' || paymentTerms.includes('dias') || paymentTerms === 'parcelado' || Database.resolvePaymentTermInfo(paymentTerms, installments).installmentsCount > 1 || installments > 1) && (
                      <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <span className="font-bold text-slate-700 text-[11px]">Parcelamento:</span>
                        <select
                          value={installments}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setInstallments(n);
                            if (n > 1 && paymentTerms === 'a_vista') {
                              setPaymentTerms('parcelado');
                            }
                          }}
                          className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 cursor-pointer"
                        >
                          {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
                            <option key={n} value={n}>
                              {n}x de {formatCurrency(orderTotal / n)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Desconto Global */}
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-700 text-[11px]">Desconto Global:</span>
                        <div className="inline-flex rounded-md bg-slate-200 p-0.5 border border-slate-300 text-[9px]">
                          <button
                            type="button"
                            onClick={() => handleDiscountTypeChange('percent')}
                            className={`px-1.5 py-0.2 rounded cursor-pointer ${
                              discountType === 'percent' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600'
                            }`}
                          >
                            %
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDiscountTypeChange('value')}
                            className={`px-1.5 py-0.2 rounded cursor-pointer ${
                              discountType === 'value' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600'
                            }`}
                          >
                            R$
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder={discountType === 'percent' ? '0' : '0,00'}
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                          className="w-16 bg-white border border-slate-300 rounded-lg py-1 px-1.5 text-right font-black text-xs text-slate-900 focus:outline-hidden"
                        />
                        {orderDiscountVal > 0 && (
                          <span className="text-[10px] text-rose-600 font-bold font-mono">
                            -{formatCurrency(orderDiscountVal)}
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Observações Rápidas */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">
                    {isBonusMode
                      ? 'Motivo / Observações da Bonificação (opcional):'
                      : 'Observações Impressas no Pedido (opcional):'}
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      isBonusMode
                        ? 'Ex: Cortesia promocional, brinde inauguração, ação comercial...'
                        : 'Ex: Entregar pela manhã. Contato com comprador...'
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs text-slate-800 focus:outline-hidden focus:bg-white"
                  />
                </div>
              </div>

              {/* Card Escuro de Totais & Emissão Oficial */}
              <div
                className={`text-white rounded-2xl p-3.5 shadow-md space-y-3 ${
                  isBonusMode
                    ? 'bg-gradient-to-r from-sky-950 via-blue-950 to-sky-950 border border-sky-700'
                    : 'bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950'
                }`}
              >
                {isBonusMode ? (
                  <div className="flex items-center justify-between text-xs font-mono pb-2.5 border-b border-sky-800/80">
                    <div>
                      <span className="text-sky-300 block text-[10px] uppercase">Valor de Referência (Itens):</span>
                      <span className="font-bold text-sky-100 text-xs">{formatCurrency(orderTotal)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sky-300 block text-[10px] uppercase">Faturamento:</span>
                      <span className="font-bold text-sky-200 text-xs">R$ 0,00 (Isento)</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 text-xs font-mono pb-2.5 border-b border-slate-800/80">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Bruto:</span>
                      <span className="font-bold text-slate-200 text-xs">{formatCurrency(grossSubtotal)}</span>
                    </div>
                    <div>
                      <span className="text-blue-400 block text-[10px] uppercase">Acrésc.:</span>
                      <span className="font-bold text-blue-300 text-xs">
                        {totalItemAdditions > 0 ? `+${formatCurrency(totalItemAdditions)}` : 'R$ 0,00'}
                      </span>
                    </div>
                    <div>
                      <span className="text-amber-400 block text-[10px] uppercase">Descontos:</span>
                      <span className="font-bold text-amber-300 text-xs">
                        {combinedDiscounts > 0 ? `-${formatCurrency(combinedDiscounts)}` : 'R$ 0,00'}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className={`text-xs uppercase font-extrabold ${isBonusMode ? 'text-sky-200' : 'text-emerald-400'}`}>
                    {isBonusMode
                      ? 'Total a Cobrar (Bonificação):'
                      : docType === 'venda'
                      ? 'Total Pedido de Venda:'
                      : 'Total Orçamento:'}
                  </span>
                  <span className={`font-black text-xl font-mono tracking-tight ${isBonusMode ? 'text-sky-200' : 'text-emerald-400'}`}>
                    {formatCurrency(isBonusMode ? 0 : orderTotal)}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={
                    cart.length === 0 ||
                    !selectedCustomerId ||
                    (!isBonusMode && (!paymentMethod || !paymentTerms))
                  }
                  onClick={handlePreFinalizeOrder}
                  className={`w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm text-white flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-40 ${
                    isBonusMode
                      ? 'bg-sky-600 hover:bg-sky-500 shadow-sky-950/40'
                      : docType === 'venda'
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40'
                      : 'bg-blue-600 hover:bg-blue-500 shadow-blue-950/40'
                  }`}
                  title="Finalizar e emitir sem mouse (Pressione F10 ou Ctrl+Enter)"
                >
                  {isBonusMode ? (
                    <Gift size={18} />
                  ) : docType === 'venda' ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <FileText size={18} />
                  )}
                  <span>
                    {isBonusMode
                      ? 'FINALIZAR E EMITIR BONIFICAÇÃO'
                      : docType === 'venda'
                      ? 'FINALIZAR E EMITIR PEDIDO DE VENDA'
                      : 'GERAR PROPOSTA DE ORÇAMENTO'}
                  </span>
                  <kbd className="bg-black/30 text-white text-[10px] px-1.5 py-0.5 rounded font-mono border border-white/20">
                    F10
                  </kbd>
                </button>
              </div>
            </div>
          </div>

          {/* BARRA FIXA DE RESUMO INFORMATIVO (RODAPÉ) */}
          <div
            className={`sticky bottom-0 z-30 backdrop-blur-md text-white p-3.5 sm:px-6 rounded-2xl border shadow-2xl flex flex-wrap items-center justify-between gap-3 mt-2 ${
              isBonusMode
                ? 'bg-sky-950/95 border-sky-600'
                : 'bg-slate-900/95 border-slate-700'
            }`}
          >
            <div className="flex items-center flex-wrap gap-2.5 sm:gap-4">
              {isBonusMode && (
                <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase bg-sky-600 text-white px-2.5 py-1 rounded-full border border-sky-400">
                  <Gift size={13} />
                  BONIFICAÇÃO
                </span>
              )}
              <div className="flex items-baseline gap-2">
                <span className="text-xs sm:text-sm text-slate-300 font-extrabold uppercase tracking-wide">
                  {isBonusMode
                    ? 'TOTAL A COBRAR'
                    : docType === 'venda'
                    ? 'TOTAL PEDIDO'
                    : 'TOTAL ORÇAMENTO'}:
                </span>
                <span className={`font-mono font-black text-xl sm:text-2xl md:text-3xl tracking-tight ${isBonusMode ? 'text-sky-200' : 'text-emerald-400'}`}>
                  {formatCurrency(isBonusMode ? 0 : orderTotal)}
                </span>
              </div>
              {isBonusMode && (
                <span className="text-[11px] font-bold text-sky-200 bg-sky-900/80 border border-sky-700 px-2.5 py-0.5 rounded-md font-mono">
                  Ref. Itens: {formatCurrency(orderTotal)}
                </span>
              )}
              <span className="text-slate-500 text-sm hidden sm:inline">•</span>
              <span className="text-xs sm:text-sm text-slate-300 font-medium">
                {cart.length} item{cart.length === 1 ? '' : 's'} ({cart.reduce((s, i) => s + i.quantity, 0)} volumes)
              </span>
              {!isBonusMode && totalItemAdditions > 0 && (
                <span className="text-[11px] font-bold text-blue-300 bg-blue-950/70 border border-blue-700 px-2.5 py-0.5 rounded-md">
                  Acréscimos: +{formatCurrency(totalItemAdditions)}
                </span>
              )}
              {!isBonusMode && combinedDiscounts > 0 && (
                <span className="text-[11px] font-bold text-amber-300 bg-amber-950/70 border border-amber-700 px-2.5 py-0.5 rounded-md">
                  Descontos: -{formatCurrency(combinedDiscounts)}
                </span>
              )}
            </div>

            {/* Dica de atalho no rodapé harmonizada com a remoção do botão duplicado */}
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 font-semibold bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/70">
              <span>Finalizar:</span>
              <kbd className="bg-slate-900 text-emerald-400 border border-slate-600 px-2 py-0.5 rounded font-mono font-bold text-[11px]">
                F10
              </kbd>
              <span className="text-slate-500">ou botão acima</span>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* ABA 2: HISTÓRICO DE PEDIDOS E ORÇAMENTOS (CONSULTA, EDIÇÃO E CONVERSÃO)   */
        /* ========================================================================= */
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {/* Painel de Filtros Avançados */}
          <div className="shrink-0 bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap text-xs font-bold text-slate-700">
                <div className="flex items-center gap-1.5">
                  <Filter size={15} className="text-slate-400" />
                  <span>Filtros do Histórico</span>
                </div>
                {startDate === currentMonthStart && endDate === currentMonthEnd && filterType === 'venda' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    Padrão: Vendas do Mês Atual
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                    Filtro Personalizado
                  </span>
                )}
                {isGrossProfitMode && (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    <Percent size={11} />
                    Lucro Bruto Real por Pedido
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {canViewGrossProfit && (
                  <button
                    type="button"
                    onClick={() => setShowGrossProfit((prev) => !prev)}
                    className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer border ${
                      isGrossProfitMode
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-emerald-50/70 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                    }`}
                    title="Exibir ou ocultar colunas de Custo (CMV), Lucro Bruto Real e Margem por pedido"
                  >
                    <Percent size={12} />
                    <span>{isGrossProfitMode ? 'Ocultar Lucro Bruto' : 'Exibir Lucro Bruto'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setFilterType('venda');
                    setStartDate(currentMonthStart);
                    setEndDate(currentMonthEnd);
                  }}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer border ${
                    startDate === currentMonthStart && endDate === currentMonthEnd && filterType === 'venda'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 hover:bg-slate-100 text-blue-700 border-slate-200'
                  }`}
                  title="Listar apenas as vendas do mês atual (Padrão do Sistema)"
                >
                  Vendas do Mês
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterType('venda');
                    setStartDate(todayIso);
                    setEndDate(todayIso);
                  }}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer border ${
                    startDate === todayIso && endDate === todayIso && filterType === 'venda'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                  title="Listar apenas as vendas de hoje"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterType('todos');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer border ${
                    !startDate && !endDate && filterType === 'todos'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                  title="Listar todos os pedidos e orçamentos do histórico geral"
                >
                  Todo o Histórico
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('novo_pedido')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer ml-1"
                >
                  <Plus size={13} />
                  <span>+ Emitir Novo Pedido</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 text-xs">
              {/* Tipo de Documento */}
              <div>
                <label className="block text-slate-500 font-medium mb-1">Tipo Documento:</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                >
                  <option value="venda">Vendas & Bonificações (Padrão)</option>
                  <option value="venda_normal">Apenas Vendas Normais</option>
                  <option value="bonificacao">Apenas Bonificações</option>
                  <option value="orcamento">Orçamentos</option>
                  <option value="todos">Todos (Vendas, Bonif. & Orç.)</option>
                </select>
              </div>

              {/* Origem da Venda */}
              <div>
                <label className="block text-slate-500 font-medium mb-1">Origem:</label>
                <select
                  value={filterOrigin}
                  onChange={(e) => setFilterOrigin(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                >
                  <option value="todos">Todas as Origens</option>
                  <option value="pdv">PDV Balcão</option>
                  <option value="pedidos_venda">Pedido de Venda</option>
                  <option value="externa_celular">Venda Celular / Mobile</option>
                  <option value="ecommerce">E-commerce / Loja</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-slate-500 font-medium mb-1">Status:</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                >
                  <option value="todos">Todos os Status</option>
                  <option value="concluido">Concluído</option>
                  <option value="em_romaneio">Em Romaneio</option>
                  <option value="em_transito">Em Trânsito</option>
                  <option value="entregue">Entregue</option>
                  <option value="nao_entregue">Não Entregue</option>
                  <option value="aberto">Aberto</option>
                  <option value="convertido_em_venda">Convertido em Venda</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>

              {/* Vendedor */}
              <div>
                <label className="block text-slate-500 font-medium mb-1">Vendedor:</label>
                <select
                  value={filterSeller}
                  onChange={(e) => setFilterSeller(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                >
                  <option value="todos">Todos os Vendedores</option>
                  {dbState.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cliente */}
              <div>
                <label className="block text-slate-500 font-medium mb-1">Cliente:</label>
                <input
                  type="text"
                  placeholder="Nome do cliente..."
                  value={searchCustomer}
                  onChange={(e) => setSearchCustomer(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                />
              </div>

              {/* Data Início */}
              <div>
                <label className="block text-slate-500 font-medium mb-1">De (Início):</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                />
              </div>

              {/* Data Fim */}
              <div>
                <label className="block text-slate-500 font-medium mb-1">Até (Fim):</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Resumo Executivo dos Pedidos do Histórico (Totalmente Sincronizado com os Dashboards de Vendas) */}
          <div className="shrink-0 grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Faturado (Vendas)</span>
              <div className="text-base sm:text-lg font-black text-slate-900 font-mono mt-0.5">
                {formatCurrency(historySalesTotal)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                <strong className="text-emerald-700 font-bold">{historySalesCount}</strong> {historySalesCount === 1 ? 'pedido de venda' : 'pedidos de venda'}
              </div>
            </div>

            {isGrossProfitMode ? (
              <>
                <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Lucro Bruto Real</span>
                  <div className={`text-base sm:text-lg font-black font-mono mt-0.5 ${historyTotalGrossProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {formatCurrency(historyTotalGrossProfit)}
                  </div>
                  <div className="text-[10px] text-emerald-800/80 mt-0.5">
                    Média p/ pedido: <strong className="font-mono">{formatCurrency(historyAvgProfitPerOrder)}</strong>
                  </div>
                </div>

                {canViewProductCosts ? (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Custo das Mercadorias (CMV)</span>
                    <div className="text-base sm:text-lg font-black text-slate-800 font-mono mt-0.5">
                      {formatCurrency(historyTotalCmv)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Base de custo dos itens vendidos
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ticket Médio</span>
                    <div className="text-base sm:text-lg font-black text-emerald-700 font-mono mt-0.5">
                      {formatCurrency(historyAvgTicket)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Por venda faturada no período
                    </div>
                  </div>
                )}

                {canViewProfitMargin ? (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Margem Bruta & Markup</span>
                    <div className="text-base sm:text-lg font-black text-blue-700 font-mono mt-0.5">
                      {historyGrossMarginPercent.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Markup médio: <strong className="text-blue-700 font-mono">{historyMarkupPercent.toFixed(1)}%</strong>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Itens Comercializados</span>
                    <div className="text-base sm:text-lg font-black text-blue-700 font-mono mt-0.5 flex items-baseline gap-1">
                      <span>{historyDistinctProductsCount}</span>
                      <span className="text-xs font-semibold text-slate-600 font-sans">produtos</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Média de <strong className="text-slate-800 font-mono">{historyAvgDistinctPerOrder.toFixed(2)}</strong> por pedido
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ticket Médio</span>
                  <div className="text-base sm:text-lg font-black text-emerald-700 font-mono mt-0.5">
                    {formatCurrency(historyAvgTicket)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Por venda faturada no histórico
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Itens Comercializados</span>
                  <div className="text-base sm:text-lg font-black text-blue-700 font-mono mt-0.5 flex items-baseline gap-1">
                    <span>{historyDistinctProductsCount}</span>
                    <span className="text-xs font-semibold text-slate-600 font-sans">produtos</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Média de <strong className="text-slate-800 font-mono">{historyAvgDistinctPerOrder.toFixed(2)}</strong> por pedido
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Orçamentos Pendentes</span>
                  <div className="text-base sm:text-lg font-black text-purple-700 font-mono mt-0.5">
                    {formatCurrency(historyQuotesTotal)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    <strong className="text-purple-700 font-bold">{historyQuotesOrders.length}</strong> orçamentos em aberto
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Tabela de Pedidos do Histórico */}
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="flex-1 min-h-[280px] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[11px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                  <tr>
                    <th className="py-3 px-3">Número</th>
                    <th className="py-3 px-3">Data / Hora</th>
                    <th className="py-3 px-3">Tipo / Origem</th>
                    <th className="py-3 px-3">Cliente</th>
                    <th className="py-3 px-3">Vendedor</th>
                    <th className="py-3 px-3">Forma Pagto</th>
                    <th className="py-3 px-3 text-right">Total</th>
                    {isGrossProfitMode && canViewProductCosts && (
                      <th className="py-3 px-3 text-right">Custo (CMV)</th>
                    )}
                    {isGrossProfitMode && (
                      <th className="py-3 px-3 text-right text-emerald-700">Lucro Bruto Real</th>
                    )}
                    {isGrossProfitMode && canViewProfitMargin && (
                      <th className="py-3 px-3 text-right text-blue-700">Margem</th>
                    )}
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9 + (isGrossProfitMode ? 1 + (canViewProductCosts ? 1 : 0) + (canViewProfitMargin ? 1 : 0) : 0)}
                        className="py-12 text-center text-slate-400"
                      >
                        Nenhum pedido ou orçamento encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((ord) => {
                      const prof = isGrossProfitMode ? getOrderProfitability(ord) : null;
                      const ordIsBonus = isBonusOrder(ord);
                      const ordRefTotal = ordIsBonus ? getOrderReferenceTotal(ord) : 0;
                      return (
                      <tr key={ord.id} className={`transition-colors ${ordIsBonus ? 'bg-sky-50/40 hover:bg-sky-50/80' : 'hover:bg-slate-50/80'}`}>
                        <td className="py-3 px-3 font-mono font-bold text-blue-700">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={ordIsBonus ? 'text-sky-800' : 'text-blue-700'}>{ord.number}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-500">
                          {new Date(ord.createdAt).toLocaleDateString('pt-BR')} {new Date(ord.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-col gap-0.5">
                            {ordIsBonus ? (
                              <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-100 text-sky-900 border border-sky-300">
                                <Gift size={10} />
                                BONIFICAÇÃO
                              </span>
                            ) : (
                              <span className="font-bold text-slate-800 capitalize">{ord.type}</span>
                            )}
                            <span className="text-[10px] text-slate-400">
                              {ord.origin === 'pdv'
                                ? 'PDV Balcão'
                                : ord.origin === 'pedidos_venda'
                                ? 'Pedido Venda'
                                : ord.origin === 'externa_celular'
                                ? 'Venda Celular'
                                : ord.origin}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-800">
                          {ord.customerName}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {ord.userName}
                        </td>
                        <td className="py-3 px-3 capitalize text-slate-600">
                          {ordIsBonus ? (
                            <span className="text-[11px] font-bold text-sky-700">Sem Cobrança</span>
                          ) : (
                            <>
                              {ord.paymentMethod} {ord.installmentsCount > 1 ? `(${ord.installmentsCount}x)` : ''}
                            </>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 text-sm">
                          {ordIsBonus ? (
                            <div className="flex flex-col items-end">
                              <span className="text-sky-800">{formatCurrency(0)}</span>
                              {ordRefTotal > 0 && (
                                <span className="text-[10px] font-medium text-slate-400">
                                  Ref: {formatCurrency(ordRefTotal)}
                                </span>
                              )}
                            </div>
                          ) : (
                            formatCurrency(ord.total)
                          )}
                        </td>
                        {isGrossProfitMode && canViewProductCosts && (
                          <td className="py-3 px-3 text-right font-mono text-slate-600">
                            {prof?.isEligible ? formatCurrency(prof.cmv) : <span className="text-slate-400">-</span>}
                          </td>
                        )}
                        {isGrossProfitMode && (
                          <td className="py-3 px-3 text-right font-mono font-bold text-sm">
                            {prof?.isEligible ? (
                              <span className={prof.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                                {formatCurrency(prof.grossProfit)}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        )}
                        {isGrossProfitMode && canViewProfitMargin && (
                          <td className="py-3 px-3 text-right">
                            {prof?.isEligible ? (
                              <div className="flex flex-col items-end">
                                <span
                                  className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                    prof.marginPercent >= 20
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : prof.marginPercent > 0
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  }`}
                                >
                                  {prof.marginPercent.toFixed(1)}%
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  Markup {prof.markupPercent.toFixed(0)}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        )}
                        <td className="py-3 px-3 text-center">
                          {getStatusBadge(ord.status, ord)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Ver Detalhes */}
                            <button
                              type="button"
                              onClick={() => setViewDetailsOrder(ord)}
                              className="p-1 hover:bg-slate-100 text-slate-600 rounded transition-colors"
                              title="Visualizar Detalhes"
                            >
                              <Eye size={15} />
                            </button>

                            {/* Editar Pedido */}
                            {ord.status !== 'cancelado' && (
                              <button
                                type="button"
                                onClick={() => setEditingOrder(ord)}
                                className="p-1 hover:bg-amber-50 text-amber-600 rounded transition-colors"
                                title="Editar Pedido"
                              >
                                <Pencil size={15} />
                              </button>
                            )}

                            {/* Converter Orçamento em Venda */}
                            {ord.type === 'orcamento' && ord.status === 'aberto' && (
                              <button
                                type="button"
                                onClick={() => handleConvertQuoteToSale(ord)}
                                className="p-1 hover:bg-emerald-50 text-emerald-600 rounded transition-colors"
                                title="Converter em Venda (Baixar Estoque e Gerar Financeiro)"
                              >
                                <ArrowRightCircle size={15} />
                              </button>
                            )}

                            {/* Reimprimir Comprovante / Enviar WhatsApp */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrder(ord);
                                setShowReceiptModal(true);
                              }}
                              className="p-1 hover:bg-blue-50 text-blue-600 rounded transition-colors"
                              title="Reimprimir Comprovante / WhatsApp"
                            >
                              <Printer size={15} />
                            </button>

                            {/* Realizar Devolução de Venda (não aplicável a Bonificação — usar cancelamento/estorno) */}
                            {ord.type === 'venda' && !ordIsBonus && ['concluido', 'em_romaneio', 'em_transito', 'entregue', 'nao_entregue'].includes(ord.status) && ord.returnStatus !== 'devolucao_total' && onStartReturn && (
                              <button
                                type="button"
                                onClick={() => onStartReturn(ord.id)}
                                className="p-1 hover:bg-rose-50 text-rose-600 rounded transition-colors"
                                title="Realizar Devolução de Venda (Total ou Parcial)"
                              >
                                <RotateCcw size={15} />
                              </button>
                            )}

                            {/* Cancelar Pedido e Estornar Estoque ou Excluir Registro */}
                            {ord.status !== 'cancelado' ? (
                              <button
                                type="button"
                                onClick={() => handleOpenCancelModal(ord, false)}
                                className="p-1 hover:bg-rose-50 text-rose-600 rounded transition-colors"
                                title="Cancelar Pedido e Estornar Estoque"
                              >
                                <XCircle size={15} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenCancelModal(ord, true)}
                                className="p-1 hover:bg-rose-50 text-rose-400 hover:text-rose-600 rounded transition-colors"
                                title="Excluir Registro Permanentemente"
                              >
                                <Trash2 size={15} />
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CADASTRO COMPLETO DE CLIENTE (COMERCIAL & ROMANEIO DE ENTREGA)     */}
      {/* ========================================================================= */}
      <FullCustomerModal
        isOpen={showQuickCustomerModal}
        onClose={() => setShowQuickCustomerModal(false)}
        onCustomerCreated={(newCust) => {
          setSelectedCustomerId(newCust.id);
        }}
      />

      {/* ========================================================================= */}
      {/* MODAL: AJUSTE (DESCONTO OU ACRÉSCIMO) POR ITEM NO PEDIDO                   */}
      {/* ========================================================================= */}
      {showItemDiscountModal && (() => {
        const target = cart.find((i) => i.productId === discountingItemId);
        if (!target) return null;
        const gross = target.quantity * target.unitPrice;
        const raw = parseFloat(itemDiscountInput.replace(',', '.')) || 0;
        let previewVal = 0;
        let previewPct = 0;
        if (itemDiscountType === 'percent') {
          previewPct = Math.max(0, raw);
          previewVal = (gross * previewPct) / 100;
        } else {
          previewVal = Math.max(0, raw);
          previewPct = gross > 0 ? (previewVal / gross) * 100 : 0;
        }
        const net = itemAdjustmentMode === 'desconto'
          ? Math.max(0, gross - previewVal)
          : gross + previewVal;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-5 space-y-3.5 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                  <Tag size={16} className={itemAdjustmentMode === 'acrescimo' ? 'text-blue-600' : 'text-amber-600'} />
                  <span>Ajuste no Produto ({itemAdjustmentMode === 'acrescimo' ? 'Acréscimo' : 'Desconto'})</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowItemDiscountModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900">{target.description}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Bruto: {formatQuantity(target.quantity)} {target.unit} x {formatCurrency(target.unitPrice)} = <strong>{formatCurrency(gross)}</strong>
                </div>
              </div>

              {/* Seletor Desconto ou Acréscimo no mesmo campo */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="font-bold text-slate-700">Operação:</span>
                  <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setItemAdjustmentMode('desconto')}
                      className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer transition-all ${
                        itemAdjustmentMode === 'desconto' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Desconto (-)
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemAdjustmentMode('acrescimo')}
                      className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer transition-all ${
                        itemAdjustmentMode === 'acrescimo' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Acréscimo (+)
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-700">Tipo de Valor:</span>
                  <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setItemDiscountType('percent')}
                      className={`px-2 py-0.5 font-bold rounded ${
                        itemDiscountType === 'percent'
                          ? itemAdjustmentMode === 'acrescimo' ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemDiscountType('value')}
                      className={`px-2 py-0.5 font-bold rounded ${
                        itemDiscountType === 'value'
                          ? itemAdjustmentMode === 'acrescimo' ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      R$
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder={itemDiscountType === 'percent' ? 'Ex: 10' : 'Ex: 15,00'}
                  value={itemDiscountInput}
                  onChange={(e) => setItemDiscountInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-black text-slate-900 text-right focus:outline-hidden focus:bg-white"
                  autoFocus
                />

                {itemAdjustmentMode === 'acrescimo' && (
                  <p className="text-[10px] text-blue-600 mt-1 italic">
                    * Informação de acréscimo não sairá na impressão do pedido (apenas preço final).
                  </p>
                )}
              </div>

              <div className="bg-slate-900 text-white p-2.5 rounded-xl font-mono space-y-1">
                <div className={`flex justify-between text-[11px] ${
                  itemAdjustmentMode === 'acrescimo' ? 'text-blue-400' : 'text-amber-400'
                }`}>
                  <span>{itemAdjustmentMode === 'acrescimo' ? 'Acréscimo:' : 'Desconto:'}</span>
                  <span>
                    {itemAdjustmentMode === 'acrescimo' ? '+' : '-'}
                    {formatCurrency(previewVal)} ({previewPct.toFixed(1).replace('.0', '')}%)
                  </span>
                </div>
                <div className="flex justify-between font-bold text-emerald-400 text-sm pt-1 border-t border-slate-800">
                  <span>Líquido do Item:</span>
                  <span>{formatCurrency(net)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowItemDiscountModal(false)}
                  className="px-3 py-1.5 text-slate-600 font-bold hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleApplyItemDiscount}
                  className={`px-4 py-1.5 text-white font-bold rounded-lg cursor-pointer transition-colors ${
                    itemAdjustmentMode === 'acrescimo' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {itemAdjustmentMode === 'acrescimo' ? 'Aplicar Acréscimo' : 'Aplicar Desconto'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL: DETALHES DO PEDIDO DO HISTÓRICO                                    */}
      {/* ========================================================================= */}
      {viewDetailsOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-5 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                {isBonusOrder(viewDetailsOrder) ? (
                  <Gift size={18} className="text-sky-600" />
                ) : (
                  <Eye size={18} className="text-blue-600" />
                )}
                <h3 className="font-bold text-sm text-slate-900">
                  Detalhes do {isBonusOrder(viewDetailsOrder) ? 'Pedido de Bonificação' : viewDetailsOrder.type === 'venda' ? 'Pedido de Venda' : 'Orçamento'} {viewDetailsOrder.number}
                </h3>
                {isBonusOrder(viewDetailsOrder) && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-100 text-sky-900 border border-sky-300">
                    BONIFICAÇÃO — SEM COBRANÇA
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setViewDetailsOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Data</span>
                  <span className="font-bold text-slate-800">{new Date(viewDetailsOrder.createdAt).toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Status</span>
                  <span>{getStatusBadge(viewDetailsOrder.status, viewDetailsOrder)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Vendedor</span>
                  <span className="font-bold text-slate-800">{viewDetailsOrder.userName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">
                    {isBonusOrder(viewDetailsOrder) ? 'Natureza' : 'Pagamento'}
                  </span>
                  <span className={`font-bold capitalize ${isBonusOrder(viewDetailsOrder) ? 'text-sky-800' : 'text-slate-800'}`}>
                    {isBonusOrder(viewDetailsOrder) ? 'Bonificação (Sem Cobrança)' : viewDetailsOrder.paymentMethod}
                  </span>
                </div>
              </div>

              <div>
                <span className="font-bold text-slate-700 block mb-1">Cliente:</span>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex justify-between">
                  <span className="font-semibold text-slate-800">{viewDetailsOrder.customerName}</span>
                  <span className="text-slate-500">{viewDetailsOrder.customerPhone || 'Sem telefone'}</span>
                </div>
              </div>

              <div>
                <span className="font-bold text-slate-700 block mb-1">Itens ({viewDetailsOrder.items.length}):</span>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-2 px-3">Código</th>
                        <th className="py-2 px-3">Descrição</th>
                        <th className="py-2 px-3 text-center">Qtd</th>
                        <th className="py-2 px-3 text-right">{isBonusOrder(viewDetailsOrder) ? 'Unit. (Ref.)' : 'Unitário'}</th>
                        <th className="py-2 px-3 text-right">{isBonusOrder(viewDetailsOrder) ? 'Total (Ref.)' : 'Total'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewDetailsOrder.items.map((i, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-mono text-blue-700 font-bold">{i.productCode}</td>
                          <td className="py-2 px-3">{i.description}</td>
                          <td className="py-2 px-3 text-center font-bold">{formatQuantity(i.quantity)} {i.unit}</td>
                          <td className="py-2 px-3 text-right font-mono">{formatCurrency(i.unitPrice)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold">{formatCurrency(i.totalPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={`text-white p-3 rounded-xl font-mono text-xs space-y-1 ${isBonusOrder(viewDetailsOrder) ? 'bg-sky-950' : 'bg-slate-900'}`}>
                {isBonusOrder(viewDetailsOrder) ? (
                  <>
                    <div className="flex justify-between text-sky-200">
                      <span>Valor de Referência (Itens):</span>
                      <span>{formatCurrency(getOrderReferenceTotal(viewDetailsOrder))}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-emerald-300 pt-1 border-t border-sky-800">
                      <span>TOTAL FINANCEIRO A COBRAR:</span>
                      <span>{formatCurrency(0)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-400">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(viewDetailsOrder.subtotal)}</span>
                    </div>
                    {viewDetailsOrder.discountTotal > 0 && (
                      <div className="flex justify-between text-rose-400">
                        <span>Desconto Total:</span>
                        <span>-{formatCurrency(viewDetailsOrder.discountTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold text-emerald-400 pt-1 border-t border-slate-800">
                      <span>TOTAL:</span>
                      <span>{formatCurrency(viewDetailsOrder.total)}</span>
                    </div>
                  </>
                )}
              </div>

              {viewDetailsOrder.notes && (
                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-900">
                  <span className="font-bold block text-[11px] mb-0.5">Observações:</span>
                  <p className="text-xs">{viewDetailsOrder.notes}</p>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <div>
                {viewDetailsOrder.status !== 'cancelado' ? (
                  <button
                    type="button"
                    onClick={() => handleOpenCancelModal(viewDetailsOrder, false)}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-rose-200"
                    title="Cancelar Pedido e Estornar Estoque"
                  >
                    <XCircle size={14} />
                    <span>Cancelar Pedido e Estornar Estoque</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenCancelModal(viewDetailsOrder, true)}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-rose-200"
                    title="Excluir Registro Permanentemente"
                  >
                    <Trash2 size={14} />
                    <span>Excluir Permanentemente</span>
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {viewDetailsOrder.type === 'venda' && !isBonusOrder(viewDetailsOrder) && ['concluido', 'em_romaneio', 'em_transito', 'entregue', 'nao_entregue'].includes(viewDetailsOrder.status) && viewDetailsOrder.returnStatus !== 'devolucao_total' && onStartReturn && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = viewDetailsOrder.id;
                      setViewDetailsOrder(null);
                      onStartReturn(id);
                    }}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-rose-200"
                    title="Realizar Devolução de Mercadorias"
                  >
                    <RotateCcw size={14} />
                    <span>Realizar Devolução</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrder(viewDetailsOrder);
                    setShowReceiptModal(true);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Reimprimir / WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewDetailsOrder(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONSULTA / BUSCA RÁPIDA DE PRODUTOS [F2] (MESMO PADRÃO DO PDV BALCÃO) */}
      {showProductLookupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-5 space-y-3.5 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Search size={18} className="text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Consulta de Produtos & Preços [F2]</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowProductLookupModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Pesquisar por descrição, código de barras ou família..."
                value={productLookupSearch}
                onChange={(e) => setProductLookupSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:bg-white"
                autoFocus
              />
            </div>

            {/* Lista dos Produtos com Preço e Estoque */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 text-xs border border-slate-100 rounded-xl">
              {lookupFilteredProducts.length === 0 ? (
                <div className="p-8 text-center text-slate-400">Nenhum produto encontrado.</div>
              ) : (
                lookupFilteredProducts.map((p) => {
                  const stock = StockEngine.getBalance(dbState.stockBalances, p.id, selectedLocationId);
                  const totalStock = StockEngine.getTotalProductStock(dbState.stockBalances, p.id);

                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        handleSelectFastProduct(p);
                        setShowProductLookupModal(false);
                      }}
                      className="p-3 hover:bg-blue-50/60 cursor-pointer flex items-center justify-between transition-colors group"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200 shrink-0">
                            {p.code}
                          </span>
                          <span className="font-bold text-slate-800 text-xs sm:text-sm group-hover:text-blue-600 truncate">
                            {p.description}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                          {p.barcode && <span>EAN: {p.barcode} • </span>}
                          {p.family && <span>Família: {p.family} • </span>}
                          <span className={stock.quantity <= 0 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-semibold'}>
                            Estoque Local ({selectedLocationName}): {formatQuantity(stock.quantity)} {p.unit} (Total: {formatQuantity(totalStock.physical)})
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-extrabold text-sm text-slate-900">
                          {formatCurrency(StockEngine.getProductPriceForCompany(p, currentCompany.id))}
                        </div>
                        <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                          Selecionar Produto
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowProductLookupModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer"
              >
                Fechar [ESC]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIÇÃO DE PEDIDO */}
      {editingOrder && (
        <EditOrderModal
          isOpen={!!editingOrder}
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSaved={(updated) => {
            setDbState({ ...Database.getState() });
            if (viewDetailsOrder?.id === updated.id) {
              setViewDetailsOrder(updated);
            }
          }}
        />
      )}

      {/* MODAL: TELA DE CONFIRMAÇÃO DA VENDA (NOME DO CLIENTE, TOTAL, FORMA E PRAZO DE PAGTO) */}
      <SaleConfirmationModal
        isOpen={showSaleConfirmationModal}
        onClose={() => setShowSaleConfirmationModal(false)}
        onConfirm={handleFinalizeOrder}
        modality="Pedido de Venda"
        customerName={selectedCustomer ? selectedCustomer.name : 'Consumidor Final (Não Identificado)'}
        customerDocument={selectedCustomer?.cpfCnpj}
        customerPhone={selectedCustomer?.phone || selectedCustomer?.whatsapp}
        totalAmount={isBonusMode ? 0 : orderTotal}
        paymentMethod={isBonusMode ? 'bonificacao' : paymentMethod || 'pix'}
        paymentTerm={isBonusMode ? 'Sem Cobrança (Bonificação)' : paymentTerms || 'a_vista'}
        installments={isBonusMode ? 0 : installments}
        itemsCount={cart.reduce((s, i) => s + i.quantity, 0)}
        locationName={selectedLocationName}
        isBonus={isBonusMode}
        referenceAmount={isBonusMode ? orderTotal : undefined}
      />

      {/* MODAL: COMPROVANTE TÉRMICO / WHATSAPP */}
      {selectedOrder && (
        <ReceiptModal
          order={selectedOrder}
          company={currentCompany}
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL IN-APP: CANCELAR PEDIDO E ESTORNAR ESTOQUE / EXCLUIR REGISTRO       */}
      {/* ========================================================================= */}
      {orderToCancel && (() => {
        const orderCompany = dbState.companies.find((c) => c.id === (orderToCancel.companyId || currentCompany.id)) || currentCompany;
        const linkedReceivables = dbState.accountsReceivable.filter(
          (r) =>
            r.orderId === orderToCancel.id ||
            r.orderNumber === orderToCancel.number ||
            Boolean(r.docNumber && (r.docNumber === orderToCancel.number || r.docNumber.startsWith(orderToCancel.number + '/')))
        );
        const totalReceivables = linkedReceivables.reduce((acc, r) => acc + (r.originalValue || 0), 0);
        const isAlreadyCancelled = orderToCancel.status === 'cancelado';
        const willRevertStock = orderToCancel.type === 'venda' && orderToCancel.stockDeducted !== false && !isAlreadyCancelled;

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 my-6">
              {/* Header */}
              <div className="px-5 py-4 bg-gradient-to-r from-rose-500 to-rose-600 text-white flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
                    {deletePermanently ? <Trash2 size={20} /> : <XCircle size={20} />}
                  </div>
                  <div>
                    <h3 className="text-base font-bold">
                      {deletePermanently ? 'Excluir Pedido Permanentemente' : 'Cancelar Pedido e Estornar Estoque'}
                    </h3>
                    <p className="text-xs text-rose-100 font-mono">
                      {orderToCancel.number} • {orderToCancel.customerName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isProcessingCancellation && setOrderToCancel(null)}
                  disabled={isProcessingCancellation}
                  className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Resumo do Pedido */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs grid grid-cols-2 gap-2 text-slate-700">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Empresa</span>
                    <span className="font-semibold text-slate-900">{orderCompany.tradeName || orderCompany.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Data Emissão</span>
                    <span className="font-semibold text-slate-900">
                      {new Date(orderToCancel.createdAt).toLocaleDateString('pt-BR')} {new Date(orderToCancel.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Total do Pedido</span>
                    <span className="font-mono font-bold text-slate-900">{formatCurrency(orderToCancel.total)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Forma de Pagamento</span>
                    <span className="font-semibold text-slate-900 capitalize">
                      {orderToCancel.paymentMethod} {orderToCancel.installmentsCount > 1 ? `(${orderToCancel.installmentsCount}x)` : ''}
                    </span>
                  </div>
                </div>

                {/* ALERTA: Venda a Prazo / Títulos a Receber serão Excluídos */}
                {linkedReceivables.length > 0 ? (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                      <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                      <span>Venda A Prazo Detectada — Exclusão de Títulos</span>
                    </div>
                    <p className="text-[11px] text-rose-700 leading-relaxed">
                      Esta venda gerou <strong>{linkedReceivables.length} título(s) no Contas a Receber</strong> totalizando <strong>{formatCurrency(totalReceivables)}</strong>. Ao confirmar, <strong>todos esses títulos serão EXCLUÍDOS permanentemente</strong> do financeiro, zerando a pendência com o cliente.
                    </p>
                    <div className="max-h-24 overflow-y-auto space-y-1 mt-1 bg-white/70 p-1.5 rounded-lg border border-rose-100">
                      {linkedReceivables.map((rec) => (
                        <div key={rec.id} className="flex justify-between items-center text-[10px] font-mono text-rose-900 py-0.5 border-b border-rose-50 last:border-none">
                          <span>Doc {rec.docNumber} (Parc. {rec.installmentNumber}/{rec.totalInstallments})</span>
                          <span>Venc: {rec.dueDate ? new Date(rec.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</span>
                          <span className="font-bold">{formatCurrency(rec.originalValue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center gap-2">
                    <Info size={14} className="text-slate-400 shrink-0" />
                    <span>Nenhum título a prazo em aberto vinculado a este pedido.</span>
                  </div>
                )}

                {/* Estorno de Estoque por Empresa */}
                {willRevertStock ? (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                      <RotateCcw size={16} className="text-emerald-600 shrink-0" />
                      <span>Estorno de Estoque para: {orderCompany.tradeName || orderCompany.name}</span>
                    </div>
                    <p className="text-[11px] text-emerald-700">
                      Os produtos abaixo retornarão imediatamente ao saldo de estoque da empresa selecionada:
                    </p>
                    <div className="max-h-28 overflow-y-auto space-y-1 mt-1 bg-white/80 p-1.5 rounded-lg border border-emerald-100">
                      {orderToCancel.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[11px] text-emerald-950 py-0.5 border-b border-emerald-50 last:border-none">
                          <span className="truncate max-w-[240px]" title={it.description}>
                            <strong className="font-mono">{it.productCode}</strong> - {it.description}
                          </span>
                          <span className="font-mono font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                            +{formatQuantity(it.quantity)} {it.unit || 'un'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                    <Info size={14} className="text-amber-500 shrink-0" />
                    <span>
                      {orderToCancel.type === 'orcamento'
                        ? 'Orçamento comercial: não houve movimentação física de estoque.'
                        : 'Este documento já se encontra com status cancelado.'}
                    </span>
                  </div>
                )}

                {/* Opção de Exclusão Definitiva */}
                <label className="flex items-start gap-2.5 p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 cursor-pointer transition-colors text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={deletePermanently}
                    onChange={(e) => setDeletePermanently(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                  />
                  <div>
                    <span className="font-bold text-slate-900 block">Excluir pedido permanentemente</span>
                    <span className="text-[11px] text-slate-500 font-normal leading-relaxed">
                      {deletePermanently
                        ? 'O registro deste pedido será purgado por completo do banco de dados.'
                        : 'O pedido será mantido na lista com o status "Cancelado" para fins de consulta e auditoria.'}
                    </span>
                  </div>
                </label>

                {/* Motivo do Cancelamento */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Motivo do Cancelamento / Estorno:
                  </label>
                  <textarea
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    rows={2}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                    placeholder="Descreva o motivo do cancelamento..."
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {[
                      'Cancelamento solicitado pelo cliente',
                      'Desistência do cliente',
                      'Erro no lançamento de itens',
                      'Forma de pagamento incorreta',
                      'Devolução total de mercadoria',
                    ].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setCancellationReason(tag)}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer transition-colors"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOrderToCancel(null)}
                  disabled={isProcessingCancellation}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 transition-colors cursor-pointer"
                >
                  Voltar / Não Cancelar
                </button>
                <button
                  type="button"
                  onClick={executeCancelOrder}
                  disabled={isProcessingCancellation}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isProcessingCancellation ? (
                    <>
                      <RotateCcw size={14} className="animate-spin" />
                      <span>Processando estorno...</span>
                    </>
                  ) : deletePermanently ? (
                    <>
                      <Trash2 size={14} />
                      <span>Confirmar Exclusão e Estornar</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={14} />
                      <span>Confirmar Cancelamento e Estornar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL IN-APP: CONVERSÃO DE ORÇAMENTO EM VENDA                             */}
      {/* ========================================================================= */}
      {quoteToConvert && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <ArrowRightCircle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold">Converter em Pedido de Venda</h3>
                  <p className="text-xs text-emerald-100 font-mono">
                    {quoteToConvert.number} • {quoteToConvert.customerName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isConvertingQuote && setQuoteToConvert(null)}
                disabled={isConvertingQuote}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-slate-700">
              <p className="text-slate-600 leading-relaxed">
                Você está convertendo o Orçamento <strong>{quoteToConvert.number}</strong> em um Pedido de Venda oficial.
              </p>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-500">
                  <span>Itens:</span>
                  <span>{quoteToConvert.items.reduce((s, i) => s + i.quantity, 0)} unidades</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Pagamento:</span>
                  <span className="capitalize">{quoteToConvert.paymentMethod}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-emerald-600 pt-1 border-t border-slate-200">
                  <span>Total a Faturar:</span>
                  <span>{formatCurrency(quoteToConvert.total)}</span>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span>Ações automáticas desta conversão:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-emerald-700">
                  <li>Baixa imediata no estoque dos produtos</li>
                  <li>Geração de títulos a receber (se venda a prazo)</li>
                  <li>Emissão do comprovante de venda para impressão/WhatsApp</li>
                </ul>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setQuoteToConvert(null)}
                disabled={isConvertingQuote}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 transition-colors cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={executeConvertQuoteToSale}
                disabled={isConvertingQuote}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isConvertingQuote ? (
                  <>
                    <RotateCcw size={14} className="animate-spin" />
                    <span>Convertendo...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} />
                    <span>Confirmar Conversão em Venda</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BUSCA PREÇO (EXCLUSIVAMENTE PARA CONSULTA) */}
      <PriceLookupModal
        isOpen={showPriceLookupModal}
        onClose={() => setShowPriceLookupModal(false)}
        companyId={currentCompany.id}
        companyName={currentCompany.tradeName || currentCompany.name}
        selectedLocationId={selectedLocationId}
        selectedLocationName={selectedLocationName}
        onAfterClose={() => {
          if (
            activeTab === 'novo_pedido' &&
            itemsEntryMode === 'insercao_rapida' &&
            !fastSelectedProductId &&
            fastProductInputRef.current
          ) {
            fastProductInputRef.current.focus();
          } else {
            priceLookupBtnRef.current?.focus();
          }
        }}
      />

      {/* MODAL BLOQUEANTE: AUTORIZAÇÃO DE DESCONTO MÁXIMO EXCEDIDO */}
      <DiscountAuthorizationModal
        isOpen={Boolean(discountAuthPrompt)}
        violation={discountAuthPrompt?.violation || null}
        seller={currentUser}
        saleSessionId={saleSessionIdRef.current}
        queuePosition={discountAuthPrompt?.queuePosition}
        onAuthorized={(record) => discountAuthPrompt?.onAuthorized(record)}
        onReduceToLimit={discountAuthPrompt?.onReduceToLimit}
        onCancel={() => setDiscountAuthPrompt(null)}
      />
    </div>
  );
};
