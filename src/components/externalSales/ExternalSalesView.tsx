import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShoppingBag,
  ShoppingCart,
  Clock,
  Search,
  Plus,
  Minus,
  Trash2,
  Send,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Receipt,
  MessageCircle,
  X,
  ChevronRight,
  ArrowRight,
  Wifi,
  WifiOff,
  Boxes,
  Barcode,
  Warehouse,
  Percent,
  Check,
  Flame,
  RotateCcw,
  Users,
  Package,
  Ticket,
  Tag,
} from 'lucide-react';
import { Database } from '../../services/db';
import { Product, Customer, Order, OrderItem } from '../../types';
import { StockEngine } from '../../services/stockEngine';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { ReceiptModal } from '../common/ReceiptModal';
import { SaleConfirmationModal } from '../common/SaleConfirmationModal';
import { FullCustomerModal } from '../common/FullCustomerModal';
import { PriceLookupModal } from '../common/PriceLookupModal';
import { CustomerSearchCombobox } from '../orders/CustomerSearchCombobox';
import { toast } from '../../services/toast';
import {
  SaleObservationAlerts,
  SaleObservationAlertItem,
  getProductSaleAlert,
  upsertSaleAlert,
  syncCustomerSaleAlert,
  dismissSaleAlert,
} from '../common/SaleObservationAlerts';

interface ExternalSalesViewProps {
  onStartReturn?: (orderId: string) => void;
  onNavigate?: (module: string) => void;
  cart?: OrderItem[];
  setCart?: React.Dispatch<React.SetStateAction<OrderItem[]>>;
}

export const ExternalSalesView: React.FC<ExternalSalesViewProps> = ({
  onStartReturn,
  onNavigate,
  cart: propCart,
  setCart: propSetCart,
}) => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  // Navegação principal mobile: Produtos (Catálogo), Pedido (Carrinho), Histórico
  const [activeTab, setActiveTab] = useState<'catalogo' | 'carrinho' | 'historico'>('catalogo');
  const [showPriceLookupModal, setShowPriceLookupModal] = useState<boolean>(false);
  const priceLookupBtnRef = useRef<HTMLButtonElement>(null);

  // Tipo de documento: Venda direta ou Orçamento comercial
  const [docType, setDocType] = useState<'venda' | 'orcamento'>('venda');

  // Conectividade
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ----------------------------------------------------
  // PRODUTOS & CATÁLOGO
  // ----------------------------------------------------
  // PRODUTOS (EXCLUSIVO: REVENDA COMERCIAL) & LOCAL DE ESTOQUE (EXCLUSIVO: COMERCIAL)
  // ----------------------------------------------------
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    const prods = Database.getState().products.filter(
      (p) => p.status === 'ativo' && p.productType === 'revenda'
    );
    const revendaMatch = prods.find((p) => p.family && p.family.trim().toLowerCase() === 'revenda');
    return revendaMatch ? revendaMatch.family : prods.length === 0 ? 'Revenda' : 'todos';
  });

  // Local de Estoque exclusivo e fixo para o Vendas Mobile: "Comercial"
  const commercialLocation =
    dbState.stockLocations.find(
      (l) =>
        (!l.companyId || l.companyId === currentCompany.id) &&
        l.status === 'ativo' &&
        (l.id === 'loc-comercial' || l.type === 'comercial' || l.name.toLowerCase().includes('comercial'))
    ) ||
    dbState.stockLocations.find((l) => l.id === 'loc-comercial') ||
    { id: 'loc-comercial', code: 'COM-01', name: 'Comercial', type: 'comercial', status: 'ativo', companyId: currentCompany.id };
  const commercialLocationName = commercialLocation.name || 'Comercial';

  // Vendas Mobile vende apenas produtos do Tipo "Revenda Comercial"
  const revendaProducts = useMemo(() => {
    return dbState.products.filter(
      (p) => p.status === 'ativo' && p.productType === 'revenda'
    );
  }, [dbState.products]);

  const defaultRevendaCategory = useMemo(() => {
    const match = revendaProducts.find(
      (p) => p.family && p.family.trim().toLowerCase() === 'revenda'
    );
    return match ? match.family : 'todos';
  }, [revendaProducts]);

  // Ordenação por volume de vendas na empresa para destacar os mais vendidos
  const sortedRevendaProducts = useMemo(() => {
    const companySales = dbState.orders.filter(
      (o) => o.companyId === currentCompany.id && o.type === 'venda' && o.status !== 'cancelado'
    );

    const salesCountMap: Record<string, number> = {};
    for (const order of companySales) {
      for (const item of order.items) {
        salesCountMap[item.productId] = (salesCountMap[item.productId] || 0) + (item.quantity || 1);
      }
    }

    return [...revendaProducts].sort((a, b) => {
      const qtyA = salesCountMap[a.id] || 0;
      const qtyB = salesCountMap[b.id] || 0;
      if (qtyB !== qtyA) return qtyB - qtyA;
      return a.description.localeCompare(b.description);
    });
  }, [dbState.orders, revendaProducts, currentCompany.id]);

  const categories = useMemo(() => {
    const families = Array.from(new Set(revendaProducts.map((p) => p.family).filter(Boolean)));
    const revendaIdx = families.findIndex((f) => f.trim().toLowerCase() === 'revenda');
    if (revendaIdx > 0) {
      const [rev] = families.splice(revendaIdx, 1);
      families.unshift(rev);
    }
    return [...families, 'todos'];
  }, [revendaProducts]);

  useEffect(() => {
    if (categories.length > 0 && !categories.includes(selectedCategory)) {
      setSelectedCategory(defaultRevendaCategory);
    }
  }, [categories, selectedCategory, defaultRevendaCategory]);

  // Top 10 produtos mais vendidos da categoria selecionada (padrão: Revenda)
  const top10Products = useMemo(() => {
    const base =
      selectedCategory === 'todos'
        ? sortedRevendaProducts
        : sortedRevendaProducts.filter((p) => p.family === selectedCategory);
    return base.slice(0, 10);
  }, [sortedRevendaProducts, selectedCategory]);

  // Regras solicitadas:
  // 1. Sem pesquisa: sempre lista os Top 10 produtos mais vendidos da categoria padrão/selecionada
  // 2. Com pesquisa: outros produtos serão listados de acordo com a digitação dos 3 primeiros caracteres
  const trimmedSearch = searchTerm.trim();
  const isSearching = trimmedSearch.length > 0;
  const isSearchTooShort = isSearching && trimmedSearch.length < 3;

  const filteredProducts = useMemo(() => {
    if (isSearchTooShort) return [];
    if (isSearching) {
      const q = trimmedSearch.toLowerCase();
      return revendaProducts.filter((p) => {
        const matchesSearch =
          p.description.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.includes(q));
        const matchesCategory = selectedCategory === 'todos' || p.family === selectedCategory;
        return StockEngine.getProductPriceForCompany(p, currentCompany.id) > 0 && matchesSearch && matchesCategory;
      });
    }

    // Sem pesquisa ativa: exibe SEMPRE E APENAS os Top 10 mais vendidos da empresa
    return top10Products;
  }, [isSearchTooShort, isSearching, trimmedSearch, revendaProducts, selectedCategory, currentCompany.id, top10Products]);

  const canAccessCustomers = Database.isSubItemAllowedForCurrentUser('customers');
  const canAccessProducts = Database.isSubItemAllowedForCurrentUser('products');

  // ----------------------------------------------------
  // CLIENTES
  // ----------------------------------------------------
  const customers = dbState.customers.filter((c) => c.status === 'ativo');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
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

  // ----------------------------------------------------
  // CARRINHO & ITENS
  // ----------------------------------------------------
  const [internalCart, setInternalCart] = useState<OrderItem[]>([]);
  const cart = propCart !== undefined ? propCart : internalCart;
  const setCart = propSetCart || setInternalCart;
  const [catalogQtyDrafts, setCatalogQtyDrafts] = useState<Record<string, string>>({});
  const [cartQtyDrafts, setCartQtyDrafts] = useState<Record<string, string>>({});

  const getProductAvailableCommercialStock = (productId: string) => {
    const locBalance = StockEngine.getBalance(dbState.stockBalances, productId, commercialLocation.id);
    return Math.max(0, (locBalance?.quantity || 0) - (locBalance?.reserved || 0));
  };

  const recalculateCartItem = (item: OrderItem, newQty: number): OrderItem => {
    const cleanQty = Math.round(newQty * 1000) / 1000;
    const gross = cleanQty * item.unitPrice;
    const disc = (gross * (item.discountPercent || 0)) / 100;
    const add = (gross * (item.additionPercent || 0)) / 100;
    return {
      ...item,
      quantity: cleanQty,
      discountValue: Math.round(disc * 100) / 100,
      additionValue: Math.round(add * 100) / 100,
      totalPrice: Math.round((gross + add - disc) * 100) / 100,
    };
  };

  const handleAddToCart = (product: Product, customQty?: number) => {
    // Validação estrita: produto de Revenda Comercial
    if (product.productType !== 'revenda') {
      toast.warning('Apenas produtos do tipo Revenda Comercial podem ser vendidos no Vendas Mobile.', 'Produto Não Permitido');
      return;
    }

    const qtyToAdd = customQty !== undefined ? Math.round(customQty * 1000) / 1000 : 1;
    if (!qtyToAdd || qtyToAdd <= 0) {
      toast.warning('Informe uma quantidade válida maior que zero.', 'Quantidade Inválida');
      return;
    }

    // Saldo disponível exclusivamente no Local de Estoque Comercial
    const availableQty = getProductAvailableCommercialStock(product.id);
    const existing = cart.find((i) => i.productId === product.id);
    const currentQty = existing ? existing.quantity : 0;
    const targetQty = Math.round((currentQty + qtyToAdd) * 1000) / 1000;

    if (docType === 'venda' && availableQty < targetQty && !Database.canSellNegativeStock()) {
      toast.warning(
        `Saldo insuficiente no estoque Comercial de "${product.description}". Saldo disponível no Comercial: ${formatQuantity(availableQty)} ${product.unit}`,
        'Estoque Comercial Insuficiente'
      );
      return;
    }

    if (existing) {
      setCart((prev) =>
        prev.map((item) => (item.productId === product.id ? recalculateCartItem(item, targetQty) : item))
      );
    } else {
      const effectivePrice = StockEngine.getProductPriceForCompany(product, currentCompany.id);
      const effectiveCost = StockEngine.getProductCostForCompany(product, currentCompany.id);
      const gross = qtyToAdd * effectivePrice;

      const newItem: OrderItem = {
        id: 'ITM-' + Date.now(),
        productId: product.id,
        productCode: product.code,
        description: product.description,
        unit: product.unit,
        quantity: qtyToAdd,
        unitPrice: effectivePrice,
        discountPercent: 0,
        discountValue: 0,
        additionPercent: 0,
        additionValue: 0,
        totalPrice: Math.round(gross * 100) / 100,
        unitCost: effectiveCost,
        locationId: commercialLocation.id,
        isMasterPack: product.isMasterPack,
        masterPackUnits: product.masterPackUnits,
        masterPackAssociatedProductId: product.masterPackAssociatedProductId,
        masterPackAssociatedProductCode: product.masterPackAssociatedProductCode,
      };
      setCart((prev) => [...prev, newItem]);
    }

    setCatalogQtyDrafts((prev) => {
      if (!(product.id in prev)) return prev;
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
    setCartQtyDrafts((prev) => {
      if (!(product.id in prev)) return prev;
      const next = { ...prev };
      delete next[product.id];
      return next;
    });

    const prodObsAlert = getProductSaleAlert(product);
    if (prodObsAlert) {
      setSaleObservationAlerts((prev) => upsertSaleAlert(prev, prodObsAlert));
    }
  };

  const handleSetQty = (productId: string, exactQty: number) => {
    const cleanQty = Math.round(exactQty * 1000) / 1000;
    if (cleanQty <= 0) {
      handleRemoveItem(productId);
      return;
    }

    const availableQty = getProductAvailableCommercialStock(productId);
    const targetItem = cart.find((i) => i.productId === productId);
    if (!targetItem) return;

    if (docType === 'venda' && cleanQty > availableQty && !Database.canSellNegativeStock()) {
      toast.warning(
        `Saldo insuficiente no estoque Comercial de "${targetItem.description}". Saldo disponível: ${formatQuantity(availableQty)} ${targetItem.unit}`,
        'Estoque Comercial Insuficiente'
      );
      if (availableQty > 0) {
        setCart((prev) =>
          prev.map((i) => (i.productId === productId ? recalculateCartItem(i, availableQty) : i))
        );
      }
      return;
    }

    setCart((prev) =>
      prev.map((i) => (i.productId === productId ? recalculateCartItem(i, cleanQty) : i))
    );
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    const existing = cart.find((i) => i.productId === productId);
    if (!existing) return;
    setCartQtyDrafts((prev) => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    handleSetQty(productId, existing.quantity + delta);
  };

  const handleCartQtyDraftChange = (productId: string, rawInput: string) => {
    const sanitized = rawInput.replace(/[^0-9.,]/g, '');
    setCartQtyDrafts((prev) => ({ ...prev, [productId]: sanitized }));

    const normalized = sanitized.replace(',', '.');
    const parsed = parseFloat(normalized);
    if (!isNaN(parsed) && parsed > 0 && !normalized.endsWith('.')) {
      const availableQty = getProductAvailableCommercialStock(productId);
      if (docType !== 'venda' || parsed <= availableQty || Database.canSellNegativeStock()) {
        setCart((prev) =>
          prev.map((i) => (i.productId === productId ? recalculateCartItem(i, parsed) : i))
        );
      }
    }
  };

  const handleCommitCartQtyDraft = (productId: string) => {
    const draft = cartQtyDrafts[productId];
    if (draft === undefined) return;

    setCartQtyDrafts((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });

    const trimmed = draft.trim();
    if (!trimmed) return;

    const parsed = parseFloat(trimmed.replace(',', '.'));
    if (isNaN(parsed)) return;

    handleSetQty(productId, parsed);
  };

  const handleRemoveItem = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
    setCartQtyDrafts((prev) => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  // Ajuste por item (Desconto / Acréscimo)
  const [showItemAdjustmentModal, setShowItemAdjustmentModal] = useState<boolean>(false);
  const [adjustingItemId, setAdjustingItemId] = useState<string | null>(null);
  const [itemAdjustmentMode, setItemAdjustmentMode] = useState<'desconto' | 'acrescimo'>('desconto');
  const [itemAdjustmentType, setItemAdjustmentType] = useState<'percent' | 'value'>('percent');
  const [itemAdjustmentInput, setItemAdjustmentInput] = useState<string>('');

  const handleOpenItemAdjustment = (item: OrderItem) => {
    setAdjustingItemId(item.productId);
    if (item.additionValue && item.additionValue > 0) {
      setItemAdjustmentMode('acrescimo');
      if (item.additionPercent && item.additionPercent > 0) {
        setItemAdjustmentType('percent');
        setItemAdjustmentInput(item.additionPercent.toString().replace('.', ','));
      } else {
        setItemAdjustmentType('value');
        setItemAdjustmentInput(item.additionValue.toFixed(2).replace('.', ','));
      }
    } else if (item.discountValue > 0 || item.discountPercent > 0) {
      setItemAdjustmentMode('desconto');
      if (item.discountPercent > 0) {
        setItemAdjustmentType('percent');
        setItemAdjustmentInput(item.discountPercent.toString().replace('.', ','));
      } else {
        setItemAdjustmentType('value');
        setItemAdjustmentInput(item.discountValue.toFixed(2).replace('.', ','));
      }
    } else {
      setItemAdjustmentMode('desconto');
      setItemAdjustmentType('percent');
      setItemAdjustmentInput('');
    }
    setShowItemAdjustmentModal(true);
  };

  const handleApplyItemAdjustment = () => {
    if (!adjustingItemId) return;
    const target = cart.find((i) => i.productId === adjustingItemId);
    if (!target) return;

    const gross = target.quantity * target.unitPrice;
    const rawVal = parseFloat(itemAdjustmentInput.replace(',', '.')) || 0;
    const maxPercent = currentUser.permissions.maxDiscountPercent;

    let appliedDiscountPercent = 0;
    let appliedDiscountValue = 0;
    let appliedAdditionPercent = 0;
    let appliedAdditionValue = 0;

    if (rawVal <= 0) {
      // Zerado
    } else if (itemAdjustmentMode === 'desconto') {
      if (itemAdjustmentType === 'percent') {
        if (rawVal > maxPercent) {
          toast.error(`O desconto informado (${rawVal}%) excede o limite máximo permitido de ${maxPercent}%.`, 'Limite Excedido');
          return;
        }
        appliedDiscountPercent = Math.min(100, rawVal);
        appliedDiscountValue = (gross * appliedDiscountPercent) / 100;
      } else {
        const maxVal = (gross * maxPercent) / 100;
        if (rawVal > maxVal) {
          toast.error(`O desconto informado (${formatCurrency(rawVal)}) excede o limite permitido de ${maxPercent}%.`, 'Limite Excedido');
          return;
        }
        appliedDiscountValue = Math.min(gross, rawVal);
        appliedDiscountPercent = gross > 0 ? (appliedDiscountValue / gross) * 100 : 0;
      }
    } else {
      // Acréscimo
      if (itemAdjustmentType === 'percent') {
        appliedAdditionPercent = rawVal;
        appliedAdditionValue = (gross * appliedAdditionPercent) / 100;
      } else {
        appliedAdditionValue = rawVal;
        appliedAdditionPercent = gross > 0 ? (appliedAdditionValue / gross) * 100 : 0;
      }
    }

    const net = Math.max(0, gross + appliedAdditionValue - appliedDiscountValue);

    setCart((prev) =>
      prev.map((i) =>
        i.productId === adjustingItemId
          ? {
              ...i,
              discountPercent: Math.round(appliedDiscountPercent * 100) / 100,
              discountValue: Math.round(appliedDiscountValue * 100) / 100,
              additionPercent: Math.round(appliedAdditionPercent * 100) / 100,
              additionValue: Math.round(appliedAdditionValue * 100) / 100,
              totalPrice: Math.round(net * 100) / 100,
            }
          : i
      )
    );
    setShowItemAdjustmentModal(false);
  };

  // ----------------------------------------------------
  // CONDIÇÕES DE PAGAMENTO & AJUSTES GERAIS
  // ----------------------------------------------------
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'dinheiro' | 'cartao_credito' | 'boleto' | ''>('');
  const [paymentTerm, setPaymentTerm] = useState<string>('');
  const [selectedBoletoAccountId, setSelectedBoletoAccountId] = useState<string>(() => {
    const boletoMethod = Database.getPaymentMethods().find((m) => m.type === 'boleto');
    if (boletoMethod?.defaultAccountId) return boletoMethod.defaultAccountId;
    const boletoAccs = Database.getBoletoAccounts();
    return boletoAccs[0]?.id || '';
  });
  const [installments, setInstallments] = useState<number>(1);
  const [notes, setNotes] = useState('');

  // Desconto / Acréscimo Global
  const [globalAdjustmentMode, setGlobalAdjustmentMode] = useState<'desconto' | 'acrescimo'>('desconto');
  const [discountType, setDiscountType] = useState<'percent' | 'value'>('percent');
  const [discountInput, setDiscountInput] = useState<string>('');

  // Cálculos do Carrinho
  const cartSubtotal = cart.reduce((s, i) => s + i.totalPrice, 0);
  const totalCartUnits = Math.round(cart.reduce((s, i) => s + i.quantity, 0) * 1000) / 1000;
  const parsedGlobalAdjustmentNum = Math.max(0, parseFloat(discountInput.replace(',', '.')) || 0);
  const maxAllowedDiscountPercent = currentUser.permissions.maxDiscountPercent;

  let globalDiscountVal = 0;
  let globalAdditionVal = 0;

  if (globalAdjustmentMode === 'desconto') {
    if (discountType === 'percent') {
      const safePercent = Math.min(maxAllowedDiscountPercent, parsedGlobalAdjustmentNum);
      globalDiscountVal = (cartSubtotal * safePercent) / 100;
    } else {
      const maxVal = (cartSubtotal * maxAllowedDiscountPercent) / 100;
      globalDiscountVal = Math.min(cartSubtotal, Math.min(maxVal, parsedGlobalAdjustmentNum));
    }
  } else {
    if (discountType === 'percent') {
      globalAdditionVal = (cartSubtotal * parsedGlobalAdjustmentNum) / 100;
    } else {
      globalAdditionVal = parsedGlobalAdjustmentNum;
    }
  }

  const cartTotal = Math.max(0, cartSubtotal + globalAdditionVal - globalDiscountVal);

  // ----------------------------------------------------
  // MODAIS & FINALIZAÇÃO
  // ----------------------------------------------------
  const [showSaleConfirmationModal, setShowSaleConfirmationModal] = useState<boolean>(false);
  const [showFullCustomerModal, setShowFullCustomerModal] = useState<boolean>(false);
  const [finishedOrder, setFinishedOrder] = useState<Order | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);

  const handlePreFinalizeOrder = () => {
    if (cart.length === 0) {
      toast.warning('Adicione produtos ao pedido antes de finalizar.', 'Carrinho Vazio');
      return;
    }
    if (!selectedCustomerId || selectedCustomerId.trim() === '') {
      toast.warning('Selecione um cliente para emitir a venda ou orçamento.', 'Cliente Obrigatório');
      return;
    }
    if (!paymentMethod) {
      toast.warning('A Forma de Pagamento é obrigatória.', 'Forma de Pagamento');
      return;
    }
    if (!paymentTerm || paymentTerm.trim() === '') {
      toast.warning('O Prazo de Pagamento é obrigatório.', 'Prazo Obrigatório');
      return;
    }

    setShowSaleConfirmationModal(true);
  };

  const handleFinalizeOrder = () => {
    setShowSaleConfirmationModal(false);

    if (cart.length === 0 || !selectedCustomerId || !paymentMethod || !paymentTerm) {
      return;
    }

    const prefix = docType === 'orcamento' ? 'ORC' : 'PED';
    const orderNumber = `${prefix}-EXT-${new Date().getFullYear()}-${String(dbState.orders.length + 1).padStart(4, '0')}`;
    const nowIso = new Date().toISOString();

    try {
      let currentBalances = [...dbState.stockBalances];
      const movements = [];

      if (docType === 'venda') {
        for (const item of cart) {
          const { updatedBalances, createdMovement } = StockEngine.applyMovement(
            currentBalances,
            {
              companyId: currentCompany.id,
              productId: item.productId,
              productCode: item.productCode,
              productDescription: item.description,
              locationId: commercialLocation.id,
              locationName: commercialLocationName,
              type: 'saida_venda',
              quantity: item.quantity,
              unitCost: item.unitCost,
              totalCost: item.unitCost * item.quantity,
              originDocType: 'venda',
              originDocId: orderNumber,
              date: nowIso,
              userId: currentUser.id,
              userName: currentUser.name,
              notes: `Venda Mobile ${orderNumber} - Saída Estoque Comercial`,
            },
            { allowNegativeStock: Database.canSellNegativeStock() }
          );
          currentBalances = updatedBalances;
          movements.push(createdMovement);
        }
      }

      const boletoAccounts = Database.getBoletoAccounts(currentCompany.id);
      const targetBoletoAccount = paymentMethod === 'boleto'
        ? boletoAccounts.find((a) => a.id === selectedBoletoAccountId) || boletoAccounts[0] || Database.getBoletoAccounts()[0]
        : undefined;

      const itemDiscounts = cart.reduce((s, i) => s + (i.discountValue || 0), 0);

      const termInfo = Database.resolvePaymentTermInfo(paymentTerm, installments);
      const newOrder: Order = {
        id: 'ORD-' + Date.now(),
        number: orderNumber,
        type: docType,
        origin: 'externa_celular',
        companyId: currentCompany.id,
        customerId: selectedCustomerId,
        customerName: selectedCustomer ? selectedCustomer.name : 'Cliente Externo',
        customerPhone: selectedCustomer ? selectedCustomer.phone : '',
        userId: currentUser.id,
        userName: currentUser.name,
        items: cart,
        subtotal: cart.reduce((s, itm) => {
          const effUnit = (itm.additionValue && itm.additionValue > 0)
            ? ((itm.totalPrice + (itm.discountValue || 0)) / (itm.quantity || 1))
            : itm.unitPrice;
          return s + (effUnit * itm.quantity);
        }, 0) + globalAdditionVal,
        discountTotal: globalDiscountVal + itemDiscounts,
        total: cartTotal,
        paymentMethod,
        paymentTerm,
        bankAccountId: targetBoletoAccount?.id,
        bankAccountName: targetBoletoAccount?.name,
        installmentsCount: installments,
        receivedAmount: docType === 'venda' && (paymentMethod === 'pix' || paymentMethod === 'dinheiro') ? cartTotal : 0,
        changeAmount: 0,
        status: docType === 'orcamento' ? 'aberto' : 'concluido',
        validityDate:
          docType === 'orcamento' ? new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] : undefined,
        notes: (notes ? `${notes} | ` : '') + `Prazo: ${termInfo.label}${installments > 1 && !/\d+\s*x/i.test(termInfo.label) ? ` (${installments}x)` : ''}`,
        stockDeducted: docType === 'venda',
        financialGenerated: docType === 'venda',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      let updatedReceivables = [...dbState.accountsReceivable];
      if (docType === 'venda' && (paymentMethod === 'boleto' || installments > 1)) {
        const valParcela = Number((cartTotal / installments).toFixed(2));
        for (let i = 1; i <= installments; i++) {
          const daysOffset = termInfo.daysOffsets[i - 1] ?? i * 30;
          const due = new Date();
          due.setDate(due.getDate() + daysOffset);
          updatedReceivables.push({
            id: 'REC-' + Date.now() + '-' + i,
            companyId: currentCompany.id,
            orderId: newOrder.id,
            orderNumber: newOrder.number,
            customerId: newOrder.customerId,
            customerName: newOrder.customerName,
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
            paymentMethod: paymentMethod === 'boleto' ? 'Boleto Bancário' : 'Cartão Crédito',
            bankAccountId: paymentMethod === 'boleto' ? targetBoletoAccount?.id : undefined,
            bankAccountName: paymentMethod === 'boleto' ? targetBoletoAccount?.name : undefined,
            bankCode: paymentMethod === 'boleto' ? targetBoletoAccount?.bankCode : undefined,
            status: 'aberto',
            receipts: [],
          });
        }
      }

      const state = Database.getState();
      state.stockBalances = currentBalances;
      state.stockMovements = [...movements, ...state.stockMovements];
      state.orders = [newOrder, ...state.orders];
      state.accountsReceivable = updatedReceivables;
      Database.persist();

      Database.addAuditLog(
        'PEDIDO_EXTERNO_EMITIDO',
        'VENDAS_EXTERNAS',
        newOrder.id,
        `${docType === 'orcamento' ? 'Orçamento' : 'Venda'} ${orderNumber} criada por ${currentUser.name} para ${newOrder.customerName}. Total: ${formatCurrency(cartTotal)}`
      );

      toast.success(
        `${docType === 'orcamento' ? 'Orçamento' : 'Venda'} ${orderNumber} emitido com sucesso!`,
        'Documento Emitido'
      );

      setFinishedOrder(newOrder);
      setShowReceiptModal(true);
      setCart([]);
      setDiscountInput('');
      setNotes('');
      setSelectedCustomerId('');
      setPaymentMethod('');
      setPaymentTerm('');
      setInstallments(1);
      setSaleObservationAlerts([]);
      lastObservationCustomerSigRef.current = '';
      setActiveTab('historico');
    } catch (e) {
      toast.error('Erro ao finalizar pedido: ' + (e as Error).message, 'Erro');
    }
  };

  // ----------------------------------------------------
  // HISTÓRICO DE PEDIDOS
  // ----------------------------------------------------
  const myOrders = dbState.orders.filter(
    (o) =>
      o.companyId === currentCompany.id &&
      o.origin === 'externa_celular' &&
      (currentUser.role === 'admin' || o.userId === currentUser.id)
  );

  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyPeriod, setHistoryPeriod] = useState<'hoje' | 'mes' | 'todos'>('hoje');

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const filteredHistoryOrders = myOrders
    .filter((ord) => {
      if (historySearchTerm.trim()) {
        const q = historySearchTerm.toLowerCase().trim();
        const matchNumber = ord.number.toLowerCase().includes(q);
        const matchCustomer = ord.customerName.toLowerCase().includes(q);
        if (!matchNumber && !matchCustomer) return false;
      }
      const orderDate = (ord.createdAt || '').slice(0, 10);
      if (historyPeriod === 'hoje' && orderDate !== todayStr) return false;
      if (historyPeriod === 'mes' && !orderDate.startsWith(currentMonthStr)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalPeriodSales = filteredHistoryOrders
    .filter((o) => o.type === 'venda' && o.status !== 'cancelado')
    .reduce((s, o) => s + o.total, 0);

  const handleSendOrderWhatsApp = (order: Order) => {
    const cleanPhone = (order.customerPhone || '').replace(/\D/g, '');
    const greeting = `Olá ${order.customerName}, tudo bem?`;
    const itemsList = order.items
      .map((i) => `• ${formatQuantity(i.quantity)} ${i.unit} - ${i.description} (${formatCurrency(i.unitPrice)} = ${formatCurrency(i.totalPrice)})`)
      .join('\n');
    const msg = `${greeting}\n\nAqui é da *${currentCompany.tradeName || currentCompany.name}*.\nConfirmamos seu pedido *${order.number}* (${order.type === 'orcamento' ? 'Orçamento' : 'Venda'}):\n\n${itemsList}\n\n*Total: ${formatCurrency(order.total)}*\nForma de Pagto: ${order.paymentMethod.toUpperCase()}${order.installmentsCount > 1 ? ` (${order.installmentsCount}x)` : ''}\n\nObrigado pela preferência!`;
    const url = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // Verificação de inadimplência (quiet notice, sem poluição visual)
  const todayIso = new Date().toISOString().split('T')[0];
  const overdueReceivables = dbState.accountsReceivable.filter(
    (r) => r.companyId === currentCompany.id && r.status === 'aberto' && r.dueDate < todayIso
  );
  const overdueTotal = overdueReceivables.reduce((s, r) => s + r.balance, 0);
  const overdueCustomerCount = new Set(overdueReceivables.map((r) => r.customerId)).size;
  const [showOverdueNotice, setShowOverdueNotice] = useState(true);

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col relative pb-24 sm:rounded-3xl sm:border sm:border-slate-200/80 sm:shadow-xl sm:overflow-hidden select-none">
      {/* ======================================================== */}
      {/* 1. TOP BAR EXCLUSIVO MOBILE: LIMPO, MODERNO E DIRETO     */}
      {/* ======================================================== */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">Vendas Mobile</h1>
            <span
              className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}
              title={isOnline ? 'Conectado' : 'Offline'}
            />
          </div>
          <p className="text-xs text-slate-500 font-medium">
            {currentUser.name.split(' ')[0]} · Revenda Comercial ({commercialLocationName})
          </p>
        </div>

        {/* Alternador Venda vs Orçamento */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => setDocType('venda')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              docType === 'venda'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Venda
          </button>
          <button
            type="button"
            onClick={() => setDocType('orcamento')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              docType === 'orcamento'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Orçamento
          </button>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 2. ÁREA DE CONTEÚDO PRINCIPAL (TABS)                     */}
      {/* ======================================================== */}
      <div className="flex-1 p-3.5 space-y-3.5">
        {/* Barra de Acesso Rápido Mobile: Busca Preço (disponível em todas as abas) e Atalhos */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            ref={priceLookupBtnRef}
            type="button"
            onClick={() => setShowPriceLookupModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-blue-50 hover:bg-blue-100 active:scale-95 border border-blue-200 text-xs font-extrabold text-blue-700 shadow-2xs transition-all cursor-pointer"
            title="Consultar preço e estoque de produtos sem alterar a venda"
          >
            <Tag size={15} className="text-blue-600" />
            <span>Busca Preço</span>
          </button>

          {activeTab === 'catalogo' && onNavigate && (canAccessCustomers || canAccessProducts) && (
            <div className="flex items-center gap-1.5 flex-wrap ml-auto">
              {canAccessCustomers && (
                <button
                  type="button"
                  onClick={() => onNavigate('customers')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] rounded-lg bg-white/80 hover:bg-white border border-slate-200/80 text-[11px] font-semibold text-slate-500 hover:text-slate-800 shadow-2xs transition-colors cursor-pointer"
                  title="Abrir lista de cadastros de Clientes"
                >
                  <Users size={13} className="text-slate-400" />
                  <span>Clientes</span>
                </button>
              )}
              {canAccessProducts && (
                <button
                  type="button"
                  onClick={() => onNavigate('products')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] rounded-lg bg-white/80 hover:bg-white border border-slate-200/80 text-[11px] font-semibold text-slate-500 hover:text-slate-800 shadow-2xs transition-colors cursor-pointer"
                  title="Abrir cadastro de Produtos & Insumos"
                >
                  <Package size={13} className="text-slate-400" />
                  <span>Produtos & Insumos</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Avisos Mobile de Observações de Produtos e Cliente (sempre legíveis em telas menores) */}
        {saleObservationAlerts.length > 0 && (
          <div className="sticky top-[68px] z-20">
            <SaleObservationAlerts
              alerts={saleObservationAlerts}
              onDismiss={(id) => setSaleObservationAlerts((prev) => dismissSaleAlert(prev, id))}
              onDismissAll={() => setSaleObservationAlerts([])}
              variant="mobile"
            />
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 1: PRODUTOS (CATÁLOGO LIMPO E TOUCH-FIRST)           */}
        {/* ======================================================== */}
        {activeTab === 'catalogo' && (
          <div className="space-y-3">

            {/* Campo de Busca Rápida de Produtos */}
            <div className="relative">
              <Search size={20} className="absolute left-3.5 top-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar produto por nome ou código (mín. 3 caracteres)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-base font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-3 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Categorias (Filtro Horizontal Limpo) */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-[13px] font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                    selectedCategory === cat
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {cat === 'todos' ? 'Todos' : cat}
                </button>
              ))}
            </div>

            {/* Título de Contexto: Top 10 Mais Vendidos ou Resultados da Pesquisa */}
            {!isSearchTooShort && (
              <div className="flex items-center justify-between px-1 pt-1 pb-0.5">
                <div className="flex items-center gap-1.5">
                  {!isSearching && <Flame size={15} className="text-amber-500 fill-amber-500" />}
                  <h3 className="text-[13px] font-black uppercase tracking-wider text-slate-800">
                    {isSearching
                      ? `Produtos Encontrados (${filteredProducts.length})`
                      : `Top 10 Mais Vendidos da Empresa (${filteredProducts.length})`}
                  </h3>
                </div>
                {!isSearching && (
                  <span className="text-xs text-slate-500 font-medium">
                    Busca a partir de 3 letras
                  </span>
                )}
              </div>
            )}

            {/* Lista de Produtos para Venda */}
            <div className="space-y-2.5">
              {isSearchTooShort ? (
                <div className="bg-white rounded-2xl p-6 text-center border border-slate-200/90 shadow-2xs space-y-2">
                  <Search size={28} className="mx-auto text-emerald-600 animate-pulse" />
                  <p className="text-base font-bold text-slate-800">Digite pelo menos 3 caracteres</p>
                  <p className="text-xs text-slate-500">
                    A lista de produtos pesquisados aparecerá após o 3º caractere ({trimmedSearch.length}/3 digitados).
                  </p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-2">
                  <ShoppingBag size={32} className="mx-auto text-slate-300" />
                  <p className="text-base font-bold text-slate-700">Nenhum produto encontrado</p>
                  <p className="text-sm text-slate-500">
                    {isSearching
                      ? `Não encontramos produtos de Revenda Comercial com "${trimmedSearch}".`
                      : 'Nenhum produto no Top 10 para esta categoria.'}
                  </p>
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const locStock = StockEngine.getBalance(dbState.stockBalances, p.id, commercialLocation.id);
                  const availableQty = Math.max(0, (locStock?.quantity || 0) - (locStock?.reserved || 0));
                  const inCart = cart.find((i) => i.productId === p.id);
                  const price = StockEngine.getProductPriceForCompany(p, currentCompany.id);
                  const rankIndex = !isSearching ? top10Products.findIndex((tp) => tp.id === p.id) : -1;

                  return (
                    <div
                      key={p.id}
                      className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col gap-2 transition-all"
                    >
                      {/* Topo do Produto: Descrição e Estoque */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[17px] sm:text-lg font-extrabold text-slate-900 leading-snug">
                            {p.description}
                          </h3>
                          <div className="flex items-center gap-2 mt-1.5 text-[13px] text-slate-600 font-medium flex-wrap">
                            <span className="font-mono">Cód: {p.code}</span>
                            <span>•</span>
                            {rankIndex >= 0 && (
                              <>
                                <span className="inline-flex items-center gap-0.5 text-xs font-black text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                                  #{rankIndex + 1} Mais Vendido
                                </span>
                                <span>•</span>
                              </>
                            )}
                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                              Revenda Comercial
                            </span>
                            <span>•</span>
                            <span className={availableQty > 0 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                              Estoque Comercial: {formatQuantity(availableQty)} {p.unit}
                            </span>
                            {p.isMasterPack && (
                              <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-900 font-bold px-1.5 py-0.5 rounded border border-amber-200">
                                <Boxes size={13} /> Master ({p.masterPackUnits} un)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Rodapé do Card: Preço e Botão de Ação Touch + Digitação de Quantidade */}
                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
                        <div className="text-[22px] font-black text-emerald-700 font-mono">
                          {formatCurrency(price)}
                        </div>

                        {inCart ? (
                          <div className="flex items-center gap-1.5 bg-emerald-50/80 border border-emerald-200/90 p-1 rounded-xl">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(p.id, -1)}
                              className="w-11 h-11 min-w-[44px] min-h-[44px] bg-white text-emerald-800 border border-emerald-200 rounded-lg flex items-center justify-center font-bold shadow-2xs hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                              aria-label="Diminuir quantidade"
                            >
                              <Minus size={16} />
                            </button>
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={`Quantidade de ${p.description}`}
                              value={
                                cartQtyDrafts[p.id] !== undefined
                                  ? cartQtyDrafts[p.id]
                                  : String(inCart.quantity).replace('.', ',')
                              }
                              onFocus={(e) => {
                                setCartQtyDrafts((prev) => ({
                                  ...prev,
                                  [p.id]: String(inCart.quantity).replace('.', ','),
                                }));
                                e.currentTarget.select();
                              }}
                              onChange={(e) => handleCartQtyDraftChange(p.id, e.target.value)}
                              onBlur={() => handleCommitCartQtyDraft(p.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur();
                                }
                              }}
                              className="w-14 h-11 text-center text-base font-extrabold text-emerald-950 font-mono bg-white border border-emerald-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddToCart(p)}
                              className="w-11 h-11 min-w-[44px] min-h-[44px] bg-emerald-600 text-white rounded-lg flex items-center justify-center font-bold shadow-xs hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer"
                              aria-label="Aumentar quantidade"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={`Quantidade inicial de ${p.description}`}
                              value={catalogQtyDrafts[p.id] ?? '1'}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9.,]/g, '');
                                setCatalogQtyDrafts((prev) => ({ ...prev, [p.id]: val }));
                              }}
                              onBlur={() => {
                                const raw = (catalogQtyDrafts[p.id] ?? '1').trim();
                                const num = parseFloat(raw.replace(',', '.'));
                                if (!raw || isNaN(num) || num <= 0) {
                                  setCatalogQtyDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[p.id];
                                    return next;
                                  });
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const raw = (catalogQtyDrafts[p.id] ?? '1').trim();
                                  const parsed = parseFloat(raw.replace(',', '.'));
                                  handleAddToCart(p, !isNaN(parsed) && parsed > 0 ? parsed : 1);
                                }
                              }}
                              placeholder="1"
                              className="w-14 h-11 text-center text-sm font-extrabold text-slate-900 font-mono bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
                              title="Digite a quantidade desejada"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const raw = (catalogQtyDrafts[p.id] ?? '1').trim();
                                const parsed = parseFloat(raw.replace(',', '.'));
                                handleAddToCart(p, !isNaN(parsed) && parsed > 0 ? parsed : 1);
                              }}
                              className="h-11 min-h-[44px] px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
                            >
                              <Plus size={16} />
                              <span>Adicionar</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Barra Flutuante Resumo do Carrinho (se houver itens) */}
            {cart.length > 0 && (
              <div className="fixed bottom-20 left-3 right-3 max-w-md mx-auto z-25">
                <button
                  type="button"
                  onClick={() => setActiveTab('carrinho')}
                  className="w-full bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between border border-slate-800 active:scale-98 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-emerald-500 text-slate-950 font-extrabold text-xs flex items-center justify-center">
                      {totalCartUnits}
                    </span>
                    <span className="text-sm font-bold">Ver Pedido</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono font-bold text-emerald-400 text-base">
                    <span>{formatCurrency(cartTotal)}</span>
                    <ArrowRight size={18} />
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: PEDIDO / CARRINHO (FECHAMENTO DIRETO E LIMPO)     */}
        {/* ======================================================== */}
        {activeTab === 'carrinho' && (
          <div className="space-y-3.5">
            {/* Bloco 1: Seleção do Cliente */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-base font-extrabold text-slate-900">
                  Cliente do Pedido *
                </label>
                <button
                  type="button"
                  onClick={() => setShowFullCustomerModal(true)}
                  className="text-sm font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 py-1 cursor-pointer"
                >
                  <UserPlus size={15} />
                  <span>+ Novo Cliente</span>
                </button>
              </div>

              <CustomerSearchCombobox
                customers={customers}
                selectedCustomerId={selectedCustomerId}
                onSelectCustomer={setSelectedCustomerId}
                onOpenNewCustomerModal={() => setShowFullCustomerModal(true)}
                placeholder="Buscar cliente..."
                size="lg"
                largeDropdown={true}
              />

              {selectedCustomer && (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 text-base space-y-1">
                  <div className="flex items-center justify-between font-extrabold text-emerald-950 gap-2">
                    <span className="truncate text-[17px] leading-snug">{selectedCustomer.name}</span>
                    <span className="font-mono text-emerald-800 shrink-0 text-sm font-bold">
                      Limite: {formatCurrency(selectedCustomer.creditLimit)}
                    </span>
                  </div>
                  {selectedCustomer.phone && (
                    <p className="text-slate-600 text-sm">Tel: {selectedCustomer.phone}</p>
                  )}
                  {selectedCustomer.deliveryRouteName && (
                    <p className="text-emerald-800 font-semibold text-sm">Rota: {selectedCustomer.deliveryRouteName}</p>
                  )}
                </div>
              )}

              {selectedCustomer && selectedCustomerVoucherBalance > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-sm text-amber-900 space-y-1 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 font-extrabold">
                    <span className="flex items-center gap-1.5">
                      <Ticket size={16} className="text-amber-600 shrink-0" />
                      <span>Cliente possui Vale / Crédito disponível!</span>
                    </span>
                    <span className="font-mono font-black text-amber-900 bg-white px-2.5 py-0.5 rounded-lg border border-amber-300 shrink-0">
                      {formatCurrency(selectedCustomerVoucherBalance)}
                    </span>
                  </div>
                  <p className="text-xs text-amber-800">
                    Vale(s) no Financeiro: {selectedCustomerVouchers.map((v) => `${v.code} (${formatCurrency(v.remainingBalance)})`).join(' • ')}
                  </p>
                </div>
              )}
            </div>

            {/* Bloco 2: Itens Adicionados */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">
                  Itens Selecionados ({totalCartUnits} {totalCartUnits === 1 ? 'item' : 'itens'})
                </h3>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('catalogo')}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                  >
                    + Adicionar Mais
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <ShoppingCart size={32} className="mx-auto text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">Seu carrinho está vazio</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('catalogo')}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Abrir Catálogo de Produtos
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {cart.map((item) => (
                    <div key={item.id} className="py-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[17px] font-bold text-slate-900 leading-snug">
                            {item.description}
                          </h4>
                          <p className="text-[13px] text-slate-500 font-mono mt-0.5">
                            {formatCurrency(item.unitPrice)} / {item.unit}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.productId)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                          title="Remover item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        {/* Controles de Quantidade (Botões e Digitação Direta) */}
                        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(item.productId, -1)}
                            className="w-10 h-10 min-w-[40px] min-h-[40px] bg-white text-slate-800 rounded-lg flex items-center justify-center font-bold shadow-2xs hover:bg-slate-50 cursor-pointer"
                            aria-label="Diminuir quantidade"
                          >
                            <Minus size={15} />
                          </button>
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={`Quantidade de ${item.description}`}
                            value={
                              cartQtyDrafts[item.productId] !== undefined
                                ? cartQtyDrafts[item.productId]
                                : String(item.quantity).replace('.', ',')
                            }
                            onFocus={(e) => {
                              setCartQtyDrafts((prev) => ({
                                ...prev,
                                [item.productId]: String(item.quantity).replace('.', ','),
                              }));
                              e.currentTarget.select();
                            }}
                            onChange={(e) => handleCartQtyDraftChange(item.productId, e.target.value)}
                            onBlur={() => handleCommitCartQtyDraft(item.productId)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              }
                            }}
                            className="w-14 h-10 text-center text-sm font-extrabold text-slate-900 font-mono bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(item.productId, 1)}
                            className="w-10 h-10 min-w-[40px] min-h-[40px] bg-emerald-600 text-white rounded-lg flex items-center justify-center font-bold shadow-xs hover:bg-emerald-700 cursor-pointer"
                            aria-label="Aumentar quantidade"
                          >
                            <Plus size={15} />
                          </button>
                        </div>

                        {/* Botão de Ajuste e Valor Total */}
                        <div className="text-right">
                          <div className="text-base font-black text-slate-900 font-mono">
                            {formatCurrency(item.totalPrice)}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenItemAdjustment(item)}
                            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer mt-0.5"
                          >
                            {item.additionValue && item.additionValue > 0
                              ? `+Acréscimo (${formatCurrency(item.additionValue)})`
                              : item.discountValue > 0
                              ? `-Desconto (${formatCurrency(item.discountValue)})`
                              : 'Ajustar Preço'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bloco 3: Pagamento e Saída de Estoque */}
            {cart.length > 0 && (
              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
                <h3 className="text-base font-extrabold text-slate-900">Condições de Venda</h3>

                {/* Depósito de Saída: Fixo Comercial */}
                <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <Warehouse size={16} />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 font-medium">Local de Saída do Estoque:</p>
                      <p className="text-sm font-bold text-slate-900">{commercialLocationName}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Fixo Comercial
                  </span>
                </div>

                {/* Forma e Prazo de Pagamento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-extrabold text-slate-800 mb-1.5 block">
                      Forma de Pagamento *
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => {
                        const val = e.target.value as 'pix' | 'dinheiro' | 'cartao_credito' | 'boleto' | '';
                        setPaymentMethod(val);
                        if (val === 'pix' || val === 'dinheiro') {
                          setPaymentTerm('a_vista');
                          setInstallments(1);
                        } else if (val === 'cartao_credito' || val === 'boleto') {
                          setPaymentTerm('parcelado');
                          setInstallments(1);
                        } else {
                          setPaymentTerm('');
                          setInstallments(1);
                        }
                      }}
                      className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-3 text-[17px] font-extrabold text-slate-900 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                    >
                      <option value="">Selecionar forma...</option>
                      <option value="pix">Pix</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="cartao_credito">Cartão de Crédito</option>
                      <option value="boleto">Boleto Bancário</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-extrabold text-slate-800 mb-1.5 block">
                      Prazo de Pagamento *
                    </label>
                    <select
                      value={paymentTerm}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPaymentTerm(val);
                        if (val === 'a_vista') {
                          setInstallments(1);
                        } else {
                          const info = Database.resolvePaymentTermInfo(val, 1);
                          if (info.termRecord) {
                            setInstallments(info.installmentsCount);
                          }
                        }
                      }}
                      className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-3 text-[17px] font-extrabold text-slate-900 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                    >
                      <option value="">Selecionar prazo...</option>
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
                              {installments > 1 ? `Parcelado (${installments}x de ${formatCurrency(cartTotal / installments)})` : 'Parcelado (1x)'}
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
                  <p className="text-[13px] text-slate-600 italic leading-snug">
                    {paymentMethod === 'pix' || paymentMethod === 'dinheiro' ? (
                      <>
                        Prazo <strong>"À Vista / Imediato"</strong> selecionado automaticamente para{' '}
                        {paymentMethod === 'pix' ? 'Pix' : 'Dinheiro'}.
                      </>
                    ) : (
                      <>
                        Prazo <strong>"Parcelado (1x)"</strong> selecionado automaticamente. Você pode escolher outro prazo acima ou alterar as parcelas abaixo.
                      </>
                    )}
                  </p>
                )}

                {/* Detalhe Boleto */}
                {paymentMethod === 'boleto' && (
                  <div className="bg-amber-50/80 p-3 rounded-xl border border-amber-200 text-sm space-y-1.5">
                    <label className="font-bold text-amber-900 block">Conta do Boleto:</label>
                    <select
                      value={selectedBoletoAccountId}
                      onChange={(e) => setSelectedBoletoAccountId(e.target.value)}
                      className="w-full min-h-[44px] bg-white border border-amber-300 rounded-lg px-3 py-2 text-base font-bold text-slate-800"
                    >
                      {Database.getBoletoAccounts(currentCompany.id).map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} - Ag: {acc.agency || '-'} C/C: {acc.accountNumber || '-'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Parcelas se Boleto ou Cartão */}
                {(paymentMethod === 'cartao_credito' || paymentMethod === 'boleto' || paymentTerm === 'parcelado' || Database.resolvePaymentTermInfo(paymentTerm, installments).installmentsCount > 1 || installments > 1) && (
                  <div>
                    <label className="text-sm font-extrabold text-slate-800 mb-1.5 block">
                      Número de Parcelas:
                    </label>
                    <select
                      value={installments}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setInstallments(n);
                        if (n > 1 && paymentTerm === 'a_vista') {
                          setPaymentTerm('parcelado');
                        }
                      }}
                      className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-3 text-[17px] font-extrabold text-slate-900"
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}x de {formatCurrency(cartTotal / n)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Desconto ou Acréscimo Geral */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-600">Ajuste Geral (Opcional):</span>
                    <div className="flex gap-1 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setGlobalAdjustmentMode('desconto')}
                        className={`px-2 py-0.5 rounded cursor-pointer ${
                          globalAdjustmentMode === 'desconto' ? 'bg-amber-100 text-amber-900' : 'text-slate-500'
                        }`}
                      >
                        Desconto
                      </button>
                      <button
                        type="button"
                        onClick={() => setGlobalAdjustmentMode('acrescimo')}
                        className={`px-2 py-0.5 rounded cursor-pointer ${
                          globalAdjustmentMode === 'acrescimo' ? 'bg-blue-100 text-blue-900' : 'text-slate-500'
                        }`}
                      >
                        Acréscimo
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                      placeholder={discountType === 'percent' ? '0' : '0,00'}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-right"
                    />
                    <div className="flex bg-slate-100 rounded-xl p-0.5 border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setDiscountType('percent')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg cursor-pointer ${
                          discountType === 'percent' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                        }`}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountType('value')}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg cursor-pointer ${
                          discountType === 'value' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                        }`}
                      >
                        R$
                      </button>
                    </div>
                  </div>
                </div>

                {/* Observações de Entrega */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    Observações da Entrega:
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: Entregar pela manhã, deixar com responsável..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-medium"
                  />
                </div>
              </div>
            )}

            {/* Bloco 4: Resumo Financeiro & Botão de Fechamento */}
            {cart.length > 0 && (
              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-mono font-medium">{formatCurrency(cartSubtotal)}</span>
                  </div>
                  {globalDiscountVal > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>Desconto Geral:</span>
                      <span className="font-mono font-bold">-{formatCurrency(globalDiscountVal)}</span>
                    </div>
                  )}
                  {globalAdditionVal > 0 && (
                    <div className="flex justify-between text-blue-700">
                      <span>Acréscimo Geral:</span>
                      <span className="font-mono font-bold">+{formatCurrency(globalAdditionVal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-baseline pt-2 border-t border-slate-100">
                    <span className="text-base font-bold text-slate-900">Total do Pedido:</span>
                    <span className="text-2xl font-black text-emerald-700 font-mono">
                      {formatCurrency(cartTotal)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePreFinalizeOrder}
                  disabled={cart.length === 0 || !selectedCustomerId}
                  className="w-full min-h-[52px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-base py-3.5 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all"
                >
                  <CheckCircle2 size={20} />
                  <span>
                    {docType === 'orcamento' ? 'GERAR ORÇAMENTO' : 'CONFIRMAR VENDA'}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: HISTÓRICO DE VENDAS DO VENDEDOR                   */}
        {/* ======================================================== */}
        {activeTab === 'historico' && (
          <div className="space-y-3">
            {/* Aviso discreto de inadimplência (se houver) */}
            {overdueCustomerCount > 0 && showOverdueNotice && (
              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 flex items-center justify-between gap-2 text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  <span>
                    <strong>{overdueCustomerCount} cliente(s)</strong> com débitos vencidos ({formatCurrency(overdueTotal)})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOverdueNotice(false)}
                  className="text-amber-700 hover:text-amber-900 font-bold p-1 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Filtros Rápidos de Período */}
            <div className="flex items-center justify-between bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setHistoryPeriod('hoje')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  historyPeriod === 'hoje'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setHistoryPeriod('mes')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  historyPeriod === 'mes'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Este Mês
              </button>
              <button
                type="button"
                onClick={() => setHistoryPeriod('todos')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  historyPeriod === 'todos'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos
              </button>
            </div>

            {/* Card Resumo do Período */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">Total Vendido ({historyPeriod === 'hoje' ? 'Hoje' : historyPeriod === 'mes' ? 'Mês Atual' : 'Geral'})</p>
                <p className="text-xl font-black text-slate-900 font-mono mt-0.5">
                  {formatCurrency(totalPeriodSales)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-500">Pedidos</p>
                <p className="text-xl font-black text-emerald-700 font-mono mt-0.5">
                  {filteredHistoryOrders.length}
                </p>
              </div>
            </div>

            {/* Busca textual de histórico */}
            <div className="relative">
              <Search size={18} className="absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por cliente ou nº pedido..."
                value={historySearchTerm}
                onChange={(e) => setHistorySearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              />
            </div>

            {/* Lista de Pedidos */}
            <div className="space-y-2.5">
              {filteredHistoryOrders.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 space-y-3">
                  <Clock size={32} className="mx-auto text-slate-300" />
                  <p className="text-base font-bold text-slate-700">Nenhum pedido no período</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('catalogo')}
                    className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                  >
                    + Nova Venda
                  </button>
                </div>
              ) : (
                filteredHistoryOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 font-mono">{ord.number}</span>
                          <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                            ord.type === 'orcamento' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {ord.type === 'orcamento' ? 'Orçamento' : 'Venda'}
                          </span>
                          <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                            ord.status === 'cancelado'
                              ? 'bg-rose-100 text-rose-800'
                              : ord.status === 'em_romaneio'
                              ? 'bg-indigo-100 text-indigo-800'
                              : ord.status === 'em_transito'
                              ? 'bg-blue-100 text-blue-800'
                              : ord.status === 'entregue'
                              ? 'bg-teal-100 text-teal-800'
                              : ord.status === 'nao_entregue'
                              ? 'bg-amber-100 text-amber-800'
                              : ord.status === 'aberto'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {ord.status === 'concluido'
                              ? 'Concluído'
                              : ord.status === 'em_romaneio'
                              ? 'Em Romaneio'
                              : ord.status === 'em_transito'
                              ? 'Em Trânsito'
                              : ord.status === 'entregue'
                              ? 'Entregue'
                              : ord.status === 'nao_entregue'
                              ? 'Não Entregue'
                              : ord.status === 'aberto'
                              ? 'Aberto'
                              : ord.status === 'convertido_em_venda'
                              ? 'Convertido em Venda'
                              : ord.status === 'cancelado'
                              ? 'Cancelado'
                              : ord.status}
                          </span>
                          {ord.deliveryManifestNumber && (
                            <span className="text-[10px] font-mono text-slate-500">
                              ({ord.deliveryManifestNumber})
                            </span>
                          )}
                        </div>
                        <h4 className="text-base font-bold text-slate-900 mt-1 leading-snug">
                          {ord.customerName}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {ord.createdAt.slice(0, 10).split('-').reverse().join('/')} às {ord.createdAt.slice(11, 16)} · {ord.paymentMethod.toUpperCase()}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-lg font-black text-emerald-700 font-mono block">
                          {formatCurrency(ord.total)}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {ord.items.length} {ord.items.length === 1 ? 'item' : 'itens'}
                        </span>
                      </div>
                    </div>

                    {/* Ações: WhatsApp, Ver Comprovante e Devolução */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleSendOrderWhatsApp(ord)}
                        className="flex-1 min-h-[40px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <MessageCircle size={15} className="text-emerald-600" />
                        <span>WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFinishedOrder(ord);
                          setShowReceiptModal(true);
                        }}
                        className="flex-1 min-h-[40px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Receipt size={15} />
                        <span>Comprovante</span>
                      </button>
                      {ord.type === 'venda' && ['concluido', 'em_romaneio', 'em_transito', 'entregue', 'nao_entregue'].includes(ord.status) && ord.returnStatus !== 'devolucao_total' && onStartReturn && (
                        <button
                          type="button"
                          onClick={() => onStartReturn(ord.id)}
                          className="min-h-[40px] px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          title="Realizar Devolução desta Venda Mobile"
                        >
                          <RotateCcw size={15} />
                          <span>Devolver</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 3. BARRA DE NAVEGAÇÃO FIXA MOBILE (THUMB ZONE)           */}
      {/* ======================================================== */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-slate-200/90 z-30 grid grid-cols-3 h-16 p-1.5 gap-1.5 shadow-lg sm:rounded-b-3xl">
        {/* Aba 1: Produtos */}
        <button
          type="button"
          onClick={() => setActiveTab('catalogo')}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
            activeTab === 'catalogo'
              ? 'bg-emerald-600 text-white font-extrabold shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-semibold'
          }`}
        >
          <ShoppingBag size={20} className={activeTab === 'catalogo' ? 'text-white stroke-[2.5]' : ''} />
          <span className="text-[11px]">Produtos</span>
        </button>

        {/* Aba 2: Pedido / Carrinho */}
        <button
          type="button"
          onClick={() => setActiveTab('carrinho')}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl relative transition-all cursor-pointer ${
            activeTab === 'carrinho'
              ? 'bg-emerald-600 text-white font-extrabold shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-semibold'
          }`}
        >
          <div className="relative">
            <ShoppingCart size={20} className={activeTab === 'carrinho' ? 'text-white stroke-[2.5]' : ''} />
            {totalCartUnits > 0 && (
              <span
                className={`absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 text-[10px] font-black rounded-full flex items-center justify-center shadow-xs ${
                  activeTab === 'carrinho'
                    ? 'bg-white text-emerald-700'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {totalCartUnits}
              </span>
            )}
          </div>
          <span className="text-[11px]">Pedido</span>
        </button>

        {/* Aba 3: Histórico */}
        <button
          type="button"
          onClick={() => setActiveTab('historico')}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
            activeTab === 'historico'
              ? 'bg-emerald-600 text-white font-extrabold shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-semibold'
          }`}
        >
          <Clock size={20} className={activeTab === 'historico' ? 'text-white stroke-[2.5]' : ''} />
          <span className="text-[11px]">Histórico</span>
        </button>
      </nav>

      {/* ======================================================== */}
      {/* 4. MODAIS E RECURSOS AUXILIARES                         */}
      {/* ======================================================== */}

      {/* Modal de Ajuste (Desconto ou Acréscimo) por Item */}
      {showItemAdjustmentModal && (() => {
        const target = cart.find((i) => i.productId === adjustingItemId);
        if (!target) return null;
        const gross = target.quantity * target.unitPrice;
        const raw = parseFloat(itemAdjustmentInput.replace(',', '.')) || 0;
        let previewVal = 0;
        if (itemAdjustmentType === 'percent') {
          previewVal = (gross * Math.max(0, raw)) / 100;
        } else {
          previewVal = Math.max(0, raw);
        }
        const net = itemAdjustmentMode === 'desconto'
          ? Math.max(0, gross - previewVal)
          : gross + previewVal;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-4 space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-base font-bold text-slate-900">Ajustar Preço do Item</h4>
                <button
                  type="button"
                  onClick={() => setShowItemAdjustmentModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div>
                <p className="text-sm font-bold text-slate-800 leading-snug">{target.description}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Valor Bruto: {formatCurrency(gross)} ({target.quantity} un x {formatCurrency(target.unitPrice)})
                </p>
              </div>

              {/* Modo: Desconto vs Acréscimo */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setItemAdjustmentMode('desconto')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                    itemAdjustmentMode === 'desconto' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Desconto (-)
                </button>
                <button
                  type="button"
                  onClick={() => setItemAdjustmentMode('acrescimo')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                    itemAdjustmentMode === 'acrescimo' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Acréscimo (+)
                </button>
              </div>

              {/* Input e % / R$ */}
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={itemAdjustmentInput}
                  onChange={(e) => setItemAdjustmentInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                  placeholder={itemAdjustmentType === 'percent' ? '0' : '0,00'}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-base font-bold text-right"
                />
                <div className="flex bg-slate-100 rounded-xl p-0.5 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setItemAdjustmentType('percent')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer ${
                      itemAdjustmentType === 'percent' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemAdjustmentType('value')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer ${
                      itemAdjustmentType === 'value' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    R$
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Novo Total do Item:</span>
                  <span className="font-bold text-slate-900 font-mono">{formatCurrency(net)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowItemAdjustmentModal(false)}
                  className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleApplyItemAdjustment}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de Confirmação da Venda */}
      <SaleConfirmationModal
        isOpen={showSaleConfirmationModal}
        onClose={() => setShowSaleConfirmationModal(false)}
        onConfirm={handleFinalizeOrder}
        modality="Venda Mobile"
        customerName={selectedCustomer ? selectedCustomer.name : 'Cliente Externo'}
        customerDocument={selectedCustomer?.cpfCnpj}
        customerPhone={selectedCustomer?.phone || selectedCustomer?.whatsapp}
        totalAmount={cartTotal}
        paymentMethod={paymentMethod || 'pix'}
        paymentTerm={paymentTerm || 'a_vista'}
        installments={installments}
        itemsCount={totalCartUnits}
        locationName={commercialLocationName}
      />

      {/* Modal de Cadastro Completo de Cliente */}
      <FullCustomerModal
        isOpen={showFullCustomerModal}
        onClose={() => setShowFullCustomerModal(false)}
        onCustomerCreated={(newCust) => {
          setSelectedCustomerId(newCust.id);
          setActiveTab('carrinho');
        }}
      />

      {/* Modal de Recibo e Compartilhamento WhatsApp */}
      {finishedOrder && (
        <ReceiptModal
          order={finishedOrder}
          company={currentCompany}
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
        />
      )}

      {/* Modal Busca Preço (Exclusivamente para Consulta) */}
      <PriceLookupModal
        isOpen={showPriceLookupModal}
        onClose={() => setShowPriceLookupModal(false)}
        companyId={currentCompany.id}
        companyName={currentCompany.tradeName || currentCompany.name}
        selectedLocationId={commercialLocation.id}
        selectedLocationName={commercialLocationName}
        onAfterClose={() => priceLookupBtnRef.current?.focus()}
      />
    </div>
  );
};
