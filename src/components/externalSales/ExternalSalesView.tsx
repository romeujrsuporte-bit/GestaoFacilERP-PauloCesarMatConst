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
  Gift,
  Pencil,
  Building2,
  Cloud,
  CloudOff,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Database } from '../../services/db';
import { FirebaseSyncService, FirebaseSyncStatus } from '../../services/firebaseSync';
import { Product, Customer, Order, OrderCommercialKind, OrderItem, DiscountAuthorizationRecord } from '../../types';
import { StockEngine } from '../../services/stockEngine';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { ReceiptModal } from '../common/ReceiptModal';
import { SaleConfirmationModal } from '../common/SaleConfirmationModal';
import { FullCustomerModal } from '../common/FullCustomerModal';
import { PriceLookupModal } from '../common/PriceLookupModal';
import { CustomerSearchCombobox } from '../orders/CustomerSearchCombobox';
import { toast } from '../../services/toast';
import {
  isBonusOrder,
  isBillableSaleOrder,
  getOrderReferenceTotal,
  formatBonusStockExitNote,
} from '../../utils/orderUtils';
import {
  SaleObservationAlerts,
  SaleObservationAlertItem,
  getProductSaleAlert,
  upsertSaleAlert,
  syncCustomerSaleAlert,
  dismissSaleAlert,
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
  const currentUser = Database.getCurrentUser();
  const currentCompany = Database.resolveAuthorizedCompanyForUser(currentUser, dbState.currentCompanyId);
  const canAlterUnitPrice = Database.canCurrentUserAlterUnitPrice(currentUser);
  const unitPriceOverrideRole: 'admin' | 'gerente' = Database.isAdmin(currentUser) ? 'admin' : 'gerente';

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  // Garante sincronia entre empresa exibida na tela e empresa interna autorizada do vendedor
  useEffect(() => {
    if (Database.isSessionAuthenticated() && dbState.currentCompanyId !== currentCompany.id) {
      Database.ensureValidCurrentCompanyForUser(currentUser);
    }
  }, [dbState.currentCompanyId, currentCompany.id, currentUser?.id]);

  // Estado de sincronização em tempo real com o Firebase Firestore
  const [syncStatus, setSyncStatus] = useState<FirebaseSyncStatus>(() => FirebaseSyncService.getStatus());
  const [isFinalizingOrder, setIsFinalizingOrder] = useState<boolean>(false);
  const [isRetryingOrderSync, setIsRetryingOrderSync] = useState<boolean>(false);
  const isFinalizingRef = useRef<boolean>(false);

  useEffect(() => {
    return FirebaseSyncService.subscribe((next) => {
      setSyncStatus(next);
    });
  }, []);

  // Navegação principal mobile: Produtos (Catálogo), Pedido (Carrinho), Histórico
  const [activeTab, setActiveTab] = useState<'catalogo' | 'carrinho' | 'historico'>('catalogo');
  const [showPriceLookupModal, setShowPriceLookupModal] = useState<boolean>(false);
  const priceLookupBtnRef = useRef<HTMLButtonElement>(null);

  // Tipo de documento: Venda direta ou Orçamento comercial
  const [docType, setDocType] = useState<'venda' | 'orcamento'>('venda');
  // Natureza do pedido: Venda Normal (padrão) ou Bonificação
  const [orderKind, setOrderKind] = useState<OrderCommercialKind>('venda_normal');
  const isBonusMode = docType === 'venda' && orderKind === 'bonificacao';

  // Sessão ativa e modal bloqueante de autorização para desconto máximo por produto
  const saleSessionIdRef = useRef<string>(generateSaleSessionId('MOB'));
  const [discountAuthPrompt, setDiscountAuthPrompt] = useState<{
    violation: DiscountViolationDetails;
    queuePosition?: { current: number; total: number };
    onAuthorized: (record: DiscountAuthorizationRecord) => void;
    onReduceToLimit?: () => void;
  } | null>(null);

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

  // Ordenação por volume de vendas na empresa para destacar os mais vendidos (exclui bonificações)
  const sortedRevendaProducts = useMemo(() => {
    const companySales = dbState.orders.filter(
      (o) => o.companyId === currentCompany.id && isBillableSaleOrder(o)
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
  // Edição rápida de preço unitário antes de informar quantidade / adicionar (somente Admin / Gerente Geral)
  const [catalogPriceDrafts, setCatalogPriceDrafts] = useState<Record<string, string>>({});
  const [editingCatalogPriceId, setEditingCatalogPriceId] = useState<string | null>(null);

  const getProductAvailableCommercialStock = (productId: string) => {
    const locBalance = StockEngine.getBalance(dbState.stockBalances, productId, commercialLocation.id);
    return Math.max(0, (locBalance?.quantity || 0) - (locBalance?.reserved || 0));
  };

  const recalculateCartItem = (item: OrderItem, newQty: number): OrderItem => {
    const cleanQty = Math.round(newQty * 1000) / 1000;
    const qtyChanged = Math.abs(item.quantity - cleanQty) > 0.0005;
    if (qtyChanged && item.discountAuthorization?.operationId) {
      revokeDiscountAuthorization(item.discountAuthorization.operationId);
    }
    const gross = cleanQty * item.unitPrice;
    const disc = (gross * (item.discountPercent || 0)) / 100;
    const add = (gross * (item.additionPercent || 0)) / 100;
    return {
      ...item,
      quantity: cleanQty,
      discountValue: Math.round(disc * 100) / 100,
      additionValue: Math.round(add * 100) / 100,
      totalPrice: Math.round((gross + add - disc) * 100) / 100,
      discountAuthorization: qtyChanged ? undefined : item.discountAuthorization,
    };
  };

  const handleAddToCart = (product: Product, customQty?: number, customUnitPriceOverride?: number) => {
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

    const catalogPrice = StockEngine.getProductPriceForCompany(product, currentCompany.id);
    const effectiveCost = StockEngine.getProductCostForCompany(product, currentCompany.id);
    const hasAuthorizedOverride =
      canAlterUnitPrice &&
      customUnitPriceOverride !== undefined &&
      !isNaN(customUnitPriceOverride) &&
      customUnitPriceOverride > 0 &&
      Math.abs(customUnitPriceOverride - catalogPrice) > 0.004;
    const finalInitialPrice = hasAuthorizedOverride
      ? Math.round(customUnitPriceOverride! * 100) / 100
      : catalogPrice;

    if (existing) {
      setCart((prev) =>
        prev.map((item) => {
          if (item.productId !== product.id) return item;
          if (hasAuthorizedOverride) {
            if (item.discountAuthorization?.operationId) {
              revokeDiscountAuthorization(item.discountAuthorization.operationId);
            }
            return {
              ...item,
              quantity: targetQty,
              unitPrice: finalInitialPrice,
              referenceUnitPrice: finalInitialPrice,
              originalUnitPrice: item.originalUnitPrice ?? catalogPrice,
              priceOverridden: true,
              priceOverriddenByRole: unitPriceOverrideRole,
              discountPercent: 0,
              discountValue: 0,
              additionPercent: 0,
              additionValue: 0,
              totalPrice: Math.round(targetQty * finalInitialPrice * 100) / 100,
              discountAuthorization: undefined,
            };
          }
          return recalculateCartItem(item, targetQty);
        })
      );
    } else {
      const gross = qtyToAdd * finalInitialPrice;

      const newItem: OrderItem = {
        id: 'ITM-' + Date.now(),
        productId: product.id,
        productCode: product.code,
        description: product.description,
        unit: product.unit,
        quantity: qtyToAdd,
        unitPrice: finalInitialPrice,
        referenceUnitPrice: finalInitialPrice,
        originalUnitPrice: catalogPrice,
        priceOverridden: hasAuthorizedOverride ? true : undefined,
        priceOverriddenByRole: hasAuthorizedOverride ? unitPriceOverrideRole : undefined,
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
    setEditingCatalogPriceId(null);
    setCatalogPriceDrafts((prev) => {
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
    const removed = cart.find((i) => i.productId === productId);
    if (removed?.discountAuthorization?.operationId) {
      revokeDiscountAuthorization(removed.discountAuthorization.operationId);
    }
    setCart((prev) => prev.filter((i) => i.productId !== productId));
    setCartQtyDrafts((prev) => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const handleCommitInlineCartPrice = (productId: string, rawPriceStr: string) => {
    if (!canAlterUnitPrice) return;
    const parsed = parseFloat(rawPriceStr.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const roundedPrice = Math.round(parsed * 100) / 100;
    const product = dbState.products.find((p) => p.id === productId);
    const catalogPrice = product
      ? StockEngine.getProductPriceForCompany(product, currentCompany.id)
      : undefined;

    setCart((prev) =>
      prev.map((i) => {
        if (i.productId !== productId) return i;
        if (Math.abs(i.unitPrice - roundedPrice) <= 0.004) return i;
        if (i.discountAuthorization?.operationId) {
          revokeDiscountAuthorization(i.discountAuthorization.operationId);
        }
        const origPrice = i.originalUnitPrice ?? catalogPrice ?? i.unitPrice;
        const isOverridden = Math.abs(roundedPrice - origPrice) > 0.004;
        return {
          ...i,
          unitPrice: roundedPrice,
          referenceUnitPrice: roundedPrice,
          originalUnitPrice: origPrice,
          priceOverridden: isOverridden,
          priceOverriddenByRole: isOverridden ? unitPriceOverrideRole : undefined,
          discountPercent: 0,
          discountValue: 0,
          additionPercent: 0,
          additionValue: 0,
          totalPrice: Math.round(i.quantity * roundedPrice * 100) / 100,
          discountAuthorization: undefined,
        };
      })
    );
  };

  // Ajuste por item (Desconto / Acréscimo / Alterar Preço Unitário)
  const [showItemAdjustmentModal, setShowItemAdjustmentModal] = useState<boolean>(false);
  const [adjustingItemId, setAdjustingItemId] = useState<string | null>(null);
  const [itemAdjustmentMode, setItemAdjustmentMode] = useState<'desconto' | 'acrescimo' | 'alterar_preco'>('desconto');
  const [itemAdjustmentType, setItemAdjustmentType] = useState<'percent' | 'value'>('percent');
  const [itemAdjustmentInput, setItemAdjustmentInput] = useState<string>('');

  const handleOpenItemAdjustment = (
    item: OrderItem,
    initialMode?: 'desconto' | 'acrescimo' | 'alterar_preco'
  ) => {
    setAdjustingItemId(item.productId);
    const resolvedMode: 'desconto' | 'acrescimo' | 'alterar_preco' =
      initialMode === 'alterar_preco' && canAlterUnitPrice
        ? 'alterar_preco'
        : initialMode === 'acrescimo'
        ? 'acrescimo'
        : initialMode === 'desconto'
        ? 'desconto'
        : item.additionValue && item.additionValue > 0
        ? 'acrescimo'
        : item.priceOverridden && canAlterUnitPrice && !(item.discountValue > 0)
        ? 'alterar_preco'
        : 'desconto';

    setItemAdjustmentMode(resolvedMode);

    if (resolvedMode === 'alterar_preco') {
      setItemAdjustmentType('value');
      setItemAdjustmentInput(item.unitPrice.toFixed(2).replace('.', ','));
    } else if (resolvedMode === 'acrescimo') {
      if (item.additionPercent && item.additionPercent > 0) {
        setItemAdjustmentType('percent');
        setItemAdjustmentInput(item.additionPercent.toString().replace('.', ','));
      } else if (item.additionValue && item.additionValue > 0) {
        setItemAdjustmentType('value');
        setItemAdjustmentInput(item.additionValue.toFixed(2).replace('.', ','));
      } else {
        setItemAdjustmentType('percent');
        setItemAdjustmentInput('');
      }
    } else if (item.discountValue > 0 || item.discountPercent > 0) {
      if (item.discountPercent > 0) {
        setItemAdjustmentType('percent');
        setItemAdjustmentInput(item.discountPercent.toString().replace('.', ','));
      } else {
        setItemAdjustmentType('value');
        setItemAdjustmentInput(item.discountValue.toFixed(2).replace('.', ','));
      }
    } else {
      setItemAdjustmentType('percent');
      setItemAdjustmentInput('');
    }
    setShowItemAdjustmentModal(true);
  };

  const handleApplyItemAdjustment = () => {
    if (!adjustingItemId) return;
    const target = cart.find((i) => i.productId === adjustingItemId);
    if (!target) return;

    const product = dbState.products.find((p) => p.id === target.productId);
    const rawVal = Math.max(0, parseFloat(itemAdjustmentInput.replace(',', '.')) || 0);

    // Modo 3: Alteração Direta de Preço Unitário (somente Admin / Gerente Geral)
    if (itemAdjustmentMode === 'alterar_preco') {
      if (!canAlterUnitPrice) {
        toast.error(
          'Apenas usuários com perfil Administrador Geral ou Gerente Geral podem alterar o preço unitário.',
          'Permissão Restrita'
        );
        return;
      }
      const roundedPrice = Math.round(rawVal * 100) / 100;
      if (isNaN(roundedPrice) || roundedPrice <= 0) {
        toast.warning('Informe um preço unitário válido maior que zero.', 'Preço Inválido');
        return;
      }
      const catalogPrice = product
        ? StockEngine.getProductPriceForCompany(product, currentCompany.id)
        : target.unitPrice;
      const origPrice = target.originalUnitPrice ?? catalogPrice;
      const isOverridden = Math.abs(roundedPrice - origPrice) > 0.004;

      setCart((prev) =>
        prev.map((i) => {
          if (i.productId !== adjustingItemId) return i;
          if (i.discountAuthorization?.operationId) {
            revokeDiscountAuthorization(i.discountAuthorization.operationId);
          }
          return {
            ...i,
            unitPrice: roundedPrice,
            referenceUnitPrice: roundedPrice,
            originalUnitPrice: origPrice,
            priceOverridden: isOverridden,
            priceOverriddenByRole: isOverridden ? unitPriceOverrideRole : undefined,
            discountPercent: 0,
            discountValue: 0,
            additionPercent: 0,
            additionValue: 0,
            totalPrice: Math.round(i.quantity * roundedPrice * 100) / 100,
            discountAuthorization: undefined,
          };
        })
      );
      setShowItemAdjustmentModal(false);
      toast.success(`Preço unitário alterado para ${formatCurrency(roundedPrice)} nesta venda.`, 'Preço Atualizado');
      return;
    }

    const gross = target.quantity * target.unitPrice;
    const maxPercent = currentUser.permissions.maxDiscountPercent;

    let appliedDiscountPercent = 0;
    let appliedDiscountValue = 0;
    let appliedAdditionPercent = 0;
    let appliedAdditionValue = 0;
    let explicitPercentRequested: number | undefined;

    if (rawVal <= 0) {
      // Zerado
    } else if (itemAdjustmentMode === 'desconto') {
      if (itemAdjustmentType === 'percent') {
        if (!product?.maxDiscountEnabled && rawVal > maxPercent) {
          toast.error(`O desconto informado (${rawVal}%) excede o limite máximo permitido de ${maxPercent}%.`, 'Limite Excedido');
          return;
        }
        appliedDiscountPercent = Math.min(100, rawVal);
        appliedDiscountValue = (gross * appliedDiscountPercent) / 100;
        explicitPercentRequested = appliedDiscountPercent;
      } else {
        const maxVal = (gross * maxPercent) / 100;
        if (!product?.maxDiscountEnabled && rawVal > maxVal) {
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
          if (i.productId !== adjustingItemId) return i;
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
      setShowItemAdjustmentModal(false);
    };

    if (product?.maxDiscountEnabled && itemAdjustmentMode === 'desconto') {
      const evaluation = evaluateItemMaxDiscount({
        product,
        companyId: currentCompany.id,
        origin: 'externa_celular',
        quantity: target.quantity,
        unitPrice: target.unitPrice,
        referenceUnitPrice: target.referenceUnitPrice,
        priceOverridden: target.priceOverridden,
        priceOverriddenByRole: target.priceOverriddenByRole,
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

  const validateMobileCartAndPromptAuthorizations = (
    itemsToCheck: OrderItem[],
    globalDiscountToCheck: number,
    onAllValid: () => void
  ) => {
    const validation = validateOrderDiscounts({
      items: itemsToCheck,
      products: dbState.products,
      companyId: currentCompany.id,
      origin: 'externa_celular',
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
        validateMobileCartAndPromptAuthorizations(nextCart, globalDiscountToCheck, onAllValid);
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
          setGlobalAdjustmentMode('desconto');
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

  const handlePreFinalizeOrder = () => {
    if (cart.length === 0) {
      toast.warning('Adicione produtos ao pedido antes de finalizar.', 'Carrinho Vazio');
      return;
    }
    if (!selectedCustomerId || selectedCustomerId.trim() === '') {
      toast.warning(
        `Selecione um cliente para emitir ${isBonusMode ? 'o pedido de bonificação' : 'a venda ou orçamento'}.`,
        'Cliente Obrigatório'
      );
      return;
    }

    if (isBonusMode) {
      setShowSaleConfirmationModal(true);
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

    validateMobileCartAndPromptAuthorizations(cart, globalDiscountVal, () => {
      setShowSaleConfirmationModal(true);
    });
  };

  const handleFinalizeOrder = async () => {
    // Bloqueio contra múltiplos cliques ou reenvios simultâneos do mesmo pedido
    if (isFinalizingRef.current) {
      return;
    }

    if (cart.length === 0 || !selectedCustomerId) {
      setShowSaleConfirmationModal(false);
      return;
    }
    if (!isBonusMode && (!paymentMethod || !paymentTerm)) {
      setShowSaleConfirmationModal(false);
      return;
    }

    // Revalida rigorosamente o vínculo de empresa/filial autorizada no momento exato da gravação
    const validatedCompany = Database.ensureValidCurrentCompanyForUser(currentUser, { skipPersist: true });
    const authorizedCompanies = Database.getAvailableCompaniesForUser(currentUser);
    const isCompanyAuthorized =
      authorizedCompanies.length === 0 || authorizedCompanies.some((c) => c.id === validatedCompany.id);
    if (!validatedCompany || !isCompanyAuthorized) {
      toast.error(
        'Não foi possível validar a empresa/filial autorizada para este usuário. Verifique seu cadastro antes de finalizar.',
        'Empresa Não Autorizada'
      );
      setShowSaleConfirmationModal(false);
      return;
    }
    if (validatedCompany.status === 'inativo') {
      toast.error(
        `A empresa "${validatedCompany.tradeName || validatedCompany.name}" está inativa e não pode registrar novos pedidos.`,
        'Empresa Inativa'
      );
      setShowSaleConfirmationModal(false);
      return;
    }

    const submissionId = saleSessionIdRef.current;
    // Proteção anti-duplicidade: se esta sessão de venda já foi gravada anteriormente, apenas reenvia ao Firebase
    const existingDuplicateOrder = Database.findOrderBySubmissionId(submissionId);
    if (existingDuplicateOrder) {
      isFinalizingRef.current = true;
      setIsFinalizingOrder(true);
      try {
        const retryResult = await FirebaseSyncService.commitCriticalOperation({
          operationKey: `order:${existingDuplicateOrder.id}`,
          entityType: 'order',
          entityId: existingDuplicateOrder.id,
          label: `Pedido ${existingDuplicateOrder.number}`,
        });
        setShowSaleConfirmationModal(false);
        if (retryResult.syncState === 'confirmed') {
          toast.success(
            `Pedido ${existingDuplicateOrder.number} confirmado no Firebase (duplicidade evitada).`,
            'Confirmado na Nuvem'
          );
        } else if (retryResult.syncState === 'pending_offline') {
          toast.warning(retryResult.message, 'Aguardando Sincronização');
        } else {
          toast.error(retryResult.message, 'Falha na Sincronização');
        }
        saleSessionIdRef.current = generateSaleSessionId('MOB');
        setFinishedOrder(existingDuplicateOrder);
        setShowReceiptModal(true);
        setCart([]);
        setActiveTab('historico');
      } finally {
        isFinalizingRef.current = false;
        setIsFinalizingOrder(false);
      }
      return;
    }

    isFinalizingRef.current = true;
    setIsFinalizingOrder(true);

    const prefix = isBonusMode ? 'BON' : docType === 'orcamento' ? 'ORC' : 'PED';
    const orderNumber = Database.generateUniqueOrderNumber(`${prefix}-EXT`, 4);
    const nowIso = new Date().toISOString();
    const uniqueOrderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      const latestState = Database.getState();
      const boletoAccounts = Database.getBoletoAccounts(validatedCompany.id);
      const targetBoletoAccount = !isBonusMode && paymentMethod === 'boleto'
        ? boletoAccounts.find((a) => a.id === selectedBoletoAccountId) || boletoAccounts[0] || Database.getBoletoAccounts()[0]
        : undefined;

      const itemDiscounts = cart.reduce((s, i) => s + (i.discountValue || 0), 0);
      const computedSubtotal = cart.reduce((s, itm) => {
        const effUnit = (itm.additionValue && itm.additionValue > 0)
          ? ((itm.totalPrice + (itm.discountValue || 0)) / (itm.quantity || 1))
          : itm.unitPrice;
        return s + (effUnit * itm.quantity);
      }, 0) + (isBonusMode ? 0 : globalAdditionVal);

      const termInfo = isBonusMode
        ? { label: 'Sem Cobrança (Bonificação)', installmentsCount: 0, daysOffsets: [] as number[] }
        : Database.resolvePaymentTermInfo(paymentTerm, installments);

      const effectivePaymentMethod: Order['paymentMethod'] = isBonusMode
        ? 'bonificacao'
        : (paymentMethod as Order['paymentMethod']);

      const newOrder: Order = {
        id: uniqueOrderId,
        number: orderNumber,
        type: isBonusMode ? 'venda' : docType,
        orderKind: isBonusMode ? 'bonificacao' : 'venda_normal',
        origin: 'externa_celular',
        companyId: validatedCompany.id,
        customerId: selectedCustomerId,
        customerName: selectedCustomer ? selectedCustomer.name : 'Cliente Externo',
        customerPhone: selectedCustomer ? selectedCustomer.phone : '',
        userId: currentUser.id,
        userName: currentUser.name,
        items: cart,
        subtotal: isBonusMode ? 0 : computedSubtotal,
        discountTotal: isBonusMode ? 0 : globalDiscountVal + itemDiscounts,
        total: isBonusMode ? 0 : cartTotal,
        referenceSubtotal: isBonusMode ? computedSubtotal : undefined,
        referenceTotal: isBonusMode ? cartTotal : undefined,
        paymentMethod: effectivePaymentMethod,
        paymentTerm: isBonusMode ? 'Sem Cobrança (Bonificação)' : paymentTerm,
        bankAccountId: isBonusMode ? undefined : targetBoletoAccount?.id,
        bankAccountName: isBonusMode ? undefined : targetBoletoAccount?.name,
        installmentsCount: isBonusMode ? 0 : installments,
        receivedAmount: !isBonusMode && docType === 'venda' && (paymentMethod === 'pix' || paymentMethod === 'dinheiro') ? cartTotal : 0,
        changeAmount: 0,
        status: !isBonusMode && docType === 'orcamento' ? 'aberto' : 'concluido',
        validityDate:
          !isBonusMode && docType === 'orcamento' ? new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] : undefined,
        notes: isBonusMode
          ? (notes ? `${notes} | ` : '') + 'BONIFICAÇÃO — SEM COBRANÇA FINANCEIRA'
          : (notes ? `${notes} | ` : '') + `Prazo: ${termInfo.label}${installments > 1 && !/\d+\s*x/i.test(termInfo.label) ? ` (${installments}x)` : ''}`,
        stockDeducted: isBonusMode || docType === 'venda',
        financialGenerated: !isBonusMode && docType === 'venda',
        clientSubmissionId: submissionId,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      // Bloqueio obrigatório na camada de persistência contra burla de desconto máximo por produto (dispensado para bonificação)
      const validatedDiscountAuths = isBonusMode
        ? []
        : Database.validateOrderDiscountsForPersistence(newOrder, {
            saleSessionId: submissionId,
            globalOrderDiscountValue: globalDiscountVal,
          });

      let currentBalances = [...latestState.stockBalances];
      const movements = [];

      if (isBonusMode || docType === 'venda') {
        for (const item of cart) {
          const { updatedBalances, createdMovement } = StockEngine.applyMovement(
            currentBalances,
            {
              companyId: validatedCompany.id,
              productId: item.productId,
              productCode: item.productCode,
              productDescription: item.description,
              locationId: commercialLocation.id,
              locationName: commercialLocationName,
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
                ? formatBonusStockExitNote(orderNumber, `Venda Mobile - ${commercialLocationName}`)
                : `Venda Mobile ${orderNumber} - Saída Estoque Comercial (${validatedCompany.tradeName || validatedCompany.name})`,
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
            saleSessionId: submissionId,
            skipPersist: true,
          });

      let updatedReceivables = [...latestState.accountsReceivable];
      if (!isBonusMode && docType === 'venda' && (paymentMethod === 'boleto' || installments > 1)) {
        const valParcela = Number((cartTotal / installments).toFixed(2));
        for (let i = 1; i <= installments; i++) {
          const daysOffset = termInfo.daysOffsets[i - 1] ?? i * 30;
          const due = new Date();
          due.setDate(due.getDate() + daysOffset);
          updatedReceivables.push({
            id: `REC-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
            companyId: validatedCompany.id,
            orderId: finalizedOrder.id,
            orderNumber: finalizedOrder.number,
            customerId: finalizedOrder.customerId,
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
      state.orders = [finalizedOrder, ...state.orders];
      state.accountsReceivable = updatedReceivables;
      Database.persist();

      Database.addAuditLog(
        isBonusMode ? 'BONIFICACAO_EXTERNA_EMITIDA' : 'PEDIDO_EXTERNO_EMITIDO',
        'VENDAS_EXTERNAS',
        finalizedOrder.id,
        isBonusMode
          ? `Pedido de Bonificação Mobile ${orderNumber} criado por ${currentUser.name} (${validatedCompany.tradeName || validatedCompany.name}) para ${finalizedOrder.customerName}. Valor Financeiro: R$ 0,00 (Ref.: ${formatCurrency(cartTotal)})`
          : `${docType === 'orcamento' ? 'Orçamento' : 'Venda'} ${orderNumber} criada por ${currentUser.name} (${validatedCompany.tradeName || validatedCompany.name}) para ${finalizedOrder.customerName}. Total: ${formatCurrency(cartTotal)}`
      );

      const docLabel = isBonusMode ? 'Pedido de Bonificação' : docType === 'orcamento' ? 'Orçamento' : 'Venda';

      // Aguarda confirmação efetiva no Firebase Cloud Firestore antes de confirmar ao usuário
      const syncResult = await FirebaseSyncService.commitCriticalOperation({
        operationKey: `order:${finalizedOrder.id}`,
        entityType: 'order',
        entityId: finalizedOrder.id,
        label: `${docLabel} ${orderNumber}`,
      });

      // Renova a sessão para impedir reutilização de autorizações e evitar duplicidade em vendas futuras
      saleSessionIdRef.current = generateSaleSessionId('MOB');
      setShowSaleConfirmationModal(false);

      if (syncResult.syncState === 'confirmed') {
        toast.success(
          `${docLabel} ${orderNumber} salvo e confirmado no Firebase (${validatedCompany.tradeName || validatedCompany.name})!`,
          isBonusMode ? 'Bonificação Confirmada na Nuvem' : 'Confirmado no Firebase'
        );
      } else if (syncResult.syncState === 'pending_offline') {
        toast.warning(
          `${docLabel} ${orderNumber} salvo apenas neste dispositivo (sem conexão). Será sincronizado automaticamente com o Firebase quando a internet voltar.`,
          'Pendente de Sincronização'
        );
      } else {
        toast.error(
          `${docLabel} ${orderNumber} salvo localmente, mas NÃO foi confirmado no Firebase: ${syncResult.message}`,
          'Falha ao Gravar no Firebase'
        );
      }

      setFinishedOrder(finalizedOrder);
      setShowReceiptModal(true);
      setCart([]);
      setOrderKind('venda_normal');
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
      setShowSaleConfirmationModal(false);
      toast.error('Erro ao finalizar pedido: ' + (e as Error).message, 'Erro');
    } finally {
      isFinalizingRef.current = false;
      setIsFinalizingOrder(false);
    }
  };

  const handleManualSyncRetry = async () => {
    if (isRetryingOrderSync) return;
    setIsRetryingOrderSync(true);
    try {
      const ok = await FirebaseSyncService.retryPendingSync();
      if (ok) {
        toast.success('Todos os pedidos pendentes foram sincronizados com o Firebase!', 'Sincronizado');
      } else {
        const st = FirebaseSyncService.getStatus();
        toast.error(st.lastError || 'Não foi possível sincronizar agora. Verifique a conexão e tente novamente.', 'Falha na Sincronização');
      }
    } finally {
      setIsRetryingOrderSync(false);
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

  // Total vendido no período (exclui estritamente Bonificações)
  const totalPeriodSales = filteredHistoryOrders
    .filter((o) => isBillableSaleOrder(o))
    .reduce((s, o) => s + o.total, 0);

  const handleSendOrderWhatsApp = (order: Order) => {
    const cleanPhone = (order.customerPhone || '').replace(/\D/g, '');
    const greeting = `Olá ${order.customerName}, tudo bem?`;
    const ordIsBonus = isBonusOrder(order);
    const itemsList = order.items
      .map(
        (i) =>
          `• ${formatQuantity(i.quantity)} ${i.unit} - ${i.description} (${formatCurrency(i.unitPrice)} = ${formatCurrency(i.totalPrice)}${ordIsBonus ? ' Ref.' : ''})`
      )
      .join('\n');
    const msg = ordIsBonus
      ? `${greeting}\n\nAqui é da *${currentCompany.tradeName || currentCompany.name}*.\nConfirmamos seu 🎁 *PEDIDO DE BONIFICAÇÃO ${order.number}*:\n\n${itemsList}\n\nValor de Referência: ${formatCurrency(getOrderReferenceTotal(order))}\n*TOTAL A COBRAR: ${formatCurrency(0)}*\n_Operação de Bonificação — Sem Cobrança Financeira_\n\nObrigado pela parceria!`
      : `${greeting}\n\nAqui é da *${currentCompany.tradeName || currentCompany.name}*.\nConfirmamos seu pedido *${order.number}* (${order.type === 'orcamento' ? 'Orçamento' : 'Venda'}):\n\n${itemsList}\n\n*Total: ${formatCurrency(order.total)}*\nForma de Pagto: ${order.paymentMethod.toUpperCase()}${order.installmentsCount > 1 ? ` (${order.installmentsCount}x)` : ''}\n\nObrigado pela preferência!`;
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
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">Vendas Mobile</h1>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                !isOnline
                  ? 'bg-amber-500'
                  : syncStatus.status === 'error' || syncStatus.failedCount > 0
                  ? 'bg-rose-500'
                  : syncStatus.status === 'syncing' || syncStatus.pendingCount > 0
                  ? 'bg-blue-500 animate-pulse'
                  : 'bg-emerald-500'
              }`}
              title={
                !isOnline
                  ? 'Offline — salvando localmente'
                  : syncStatus.status === 'error'
                  ? `Erro na sincronização: ${syncStatus.lastError || ''}`
                  : syncStatus.pendingCount > 0
                  ? `${syncStatus.pendingCount} pendência(s) aguardando nuvem`
                  : 'Conectado ao Firebase'
              }
            />
          </div>
          <p className="text-xs text-slate-500 font-medium truncate">
            {currentUser.name.split(' ')[0]} · Revenda Comercial ({commercialLocationName})
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-bold text-blue-700 truncate">
            <Building2 size={12} className="shrink-0 text-blue-600" />
            <span className="truncate">
              {currentCompany.tradeName || currentCompany.name}
            </span>
            <span className="shrink-0 text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-blue-50 border border-blue-200 text-blue-700">
              {currentCompany.type === 'matriz' ? 'Matriz' : 'Filial'}
            </span>
          </div>
        </div>

        {/* Alternador Venda Normal vs Bonificação vs Orçamento */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
          <button
            type="button"
            onClick={() => {
              setDocType('venda');
              setOrderKind('venda_normal');
            }}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              docType === 'venda' && orderKind === 'venda_normal'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Venda
          </button>
          <button
            type="button"
            onClick={() => {
              setDocType('venda');
              setOrderKind('bonificacao');
            }}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              docType === 'venda' && orderKind === 'bonificacao'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-sky-700'
            }`}
          >
            <Gift size={12} />
            <span>Bonif.</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDocType('orcamento');
              setOrderKind('venda_normal');
            }}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              docType === 'orcamento'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Orç.
          </button>
        </div>
      </header>

      {/* Banner Persistente de Modo Bonificação no Mobile */}
      {isBonusMode && activeTab !== 'historico' && (
        <div className="bg-gradient-to-r from-sky-600 to-blue-700 text-white px-4 py-2.5 flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2 text-xs">
            <Gift size={16} className="shrink-0" />
            <div>
              <span className="font-black uppercase tracking-wider block leading-tight">
                MODO BONIFICAÇÃO — SEM COBRANÇA
              </span>
              <span className="text-[11px] text-sky-100">
                Baixa estoque sem gerar faturamento ou Contas a Receber
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOrderKind('venda_normal')}
            className="text-[10px] font-black uppercase bg-white/15 hover:bg-white/25 px-2 py-1 rounded-lg border border-white/25 shrink-0 cursor-pointer"
          >
            Voltar p/ Venda
          </button>
        </div>
      )}

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

        {/* Avisos Mobile de Observações de Produtos e Cliente (Modal Central Obrigatório) */}
        {saleObservationAlerts.length > 0 && (
          <SaleObservationAlerts
            alerts={saleObservationAlerts}
            onDismiss={(id) => setSaleObservationAlerts((prev) => dismissSaleAlert(prev, id))}
            onDismissAll={() => setSaleObservationAlerts([])}
            variant="mobile"
          />
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

                      {/* Rodapé do Card: Preço Unit. (Clique p/ editar) + Quantidade + Incluir */}
                      {(() => {
                        const draftStr = catalogPriceDrafts[p.id];
                        const parsedDraft =
                          canAlterUnitPrice && draftStr !== undefined && draftStr.trim() !== ''
                            ? parseFloat(draftStr.replace(',', '.'))
                            : NaN;
                        const activeDisplayPrice = inCart
                          ? inCart.unitPrice
                          : !isNaN(parsedDraft) && parsedDraft > 0
                          ? parsedDraft
                          : price;
                        const isPriceOverridden = inCart
                          ? Boolean(inCart.priceOverridden)
                          : canAlterUnitPrice &&
                            !isNaN(parsedDraft) &&
                            parsedDraft > 0 &&
                            Math.abs(parsedDraft - price) > 0.004;
                        const isEditingCardPrice = canAlterUnitPrice && editingCatalogPriceId === p.id;
                        const parsedCardQty = Math.max(
                          1,
                          parseFloat((catalogQtyDrafts[p.id] ?? '1').replace(',', '.')) || 1
                        );

                        return (
                          <div className="pt-2 border-t border-slate-100 space-y-2">
                            <div className="grid grid-cols-2 gap-2 items-end">
                              {/* Coluna 1: Preço Unit. (Clique p/ editar) */}
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[11px] font-bold text-slate-700">Preço Unit.:</span>
                                  {canAlterUnitPrice && (
                                    isPriceOverridden ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (inCart) {
                                            handleCommitInlineCartPrice(p.id, price.toFixed(2));
                                          }
                                          setCatalogPriceDrafts((prev) => {
                                            const next = { ...prev };
                                            delete next[p.id];
                                            return next;
                                          });
                                          setEditingCatalogPriceId(null);
                                        }}
                                        className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                                        title={`Restaurar preço original (${formatCurrency(price)})`}
                                      >
                                        Restaurar
                                      </button>
                                    ) : (
                                      <span className="text-[10px] font-bold text-emerald-700">
                                        Clique p/ editar
                                      </span>
                                    )
                                  )}
                                </div>

                                {canAlterUnitPrice ? (
                                  isEditingCardPrice ? (
                                    <div className="flex items-center justify-between gap-1.5 w-full h-11 bg-white border-2 border-blue-500 ring-2 ring-blue-500/20 rounded-xl px-2.5">
                                      <Pencil size={13} className="text-blue-600 shrink-0" />
                                      <div className="flex items-center justify-end gap-1 flex-1 min-w-0">
                                        <span className="text-xs font-extrabold text-slate-500 font-mono">R$</span>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          autoFocus
                                          aria-label={`Novo preço unitário de ${p.description}`}
                                          value={draftStr ?? activeDisplayPrice.toFixed(2).replace('.', ',')}
                                          onFocus={(e) => e.currentTarget.select()}
                                          onChange={(e) =>
                                            setCatalogPriceDrafts((prev) => ({
                                              ...prev,
                                              [p.id]: e.target.value.replace(/[^0-9.,]/g, ''),
                                            }))
                                          }
                                          onBlur={() => {
                                            if (inCart && catalogPriceDrafts[p.id] !== undefined) {
                                              handleCommitInlineCartPrice(p.id, catalogPriceDrafts[p.id]);
                                              setCatalogPriceDrafts((prev) => {
                                                const next = { ...prev };
                                                delete next[p.id];
                                                return next;
                                              });
                                            }
                                            setEditingCatalogPriceId(null);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              if (inCart && catalogPriceDrafts[p.id] !== undefined) {
                                                handleCommitInlineCartPrice(p.id, catalogPriceDrafts[p.id]);
                                                setCatalogPriceDrafts((prev) => {
                                                  const next = { ...prev };
                                                  delete next[p.id];
                                                  return next;
                                                });
                                              }
                                              setEditingCatalogPriceId(null);
                                            } else if (e.key === 'Escape') {
                                              setCatalogPriceDrafts((prev) => {
                                                const next = { ...prev };
                                                delete next[p.id];
                                                return next;
                                              });
                                              setEditingCatalogPriceId(null);
                                            }
                                          }}
                                          className="w-full text-right text-sm font-black text-slate-900 font-mono bg-transparent focus:outline-hidden"
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCatalogPriceDrafts((prev) => ({
                                          ...prev,
                                          [p.id]: activeDisplayPrice.toFixed(2).replace('.', ','),
                                        }));
                                        setEditingCatalogPriceId(p.id);
                                      }}
                                      className={`flex items-center justify-between gap-1.5 w-full h-11 rounded-xl px-3 border transition-colors cursor-pointer ${
                                        isPriceOverridden
                                          ? 'bg-indigo-50/70 border-indigo-400 text-indigo-950'
                                          : 'bg-white border-slate-300 text-slate-900 hover:border-blue-400'
                                      }`}
                                      title={`Toque para alterar o preço unitário (Original: ${formatCurrency(price)})`}
                                    >
                                      <Pencil
                                        size={13}
                                        className={isPriceOverridden ? 'text-indigo-600 shrink-0' : 'text-slate-400 shrink-0'}
                                      />
                                      <span className="font-mono text-sm font-black truncate">
                                        {formatCurrency(activeDisplayPrice)}
                                      </span>
                                    </button>
                                  )
                                ) : (
                                  <div className="flex items-center justify-end w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-mono text-sm font-black text-slate-800 select-none">
                                    {formatCurrency(activeDisplayPrice)}
                                  </div>
                                )}
                              </div>

                              {/* Coluna 2: Quantidade (- 1 +) */}
                              <div className="space-y-1 min-w-0">
                                <span className="text-[11px] font-bold text-slate-700 block">
                                  Quantidade:
                                </span>
                                {inCart ? (
                                  <div className="flex items-center justify-between h-11 bg-emerald-50/80 border border-emerald-300 rounded-xl px-1">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateQty(p.id, -1)}
                                      className="w-9 h-9 bg-white text-emerald-800 border border-emerald-200 rounded-lg flex items-center justify-center font-bold shadow-2xs active:scale-95 transition-all cursor-pointer shrink-0"
                                      aria-label="Diminuir quantidade"
                                    >
                                      <Minus size={14} />
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
                                      className="w-full min-w-0 text-center text-sm font-extrabold text-emerald-950 font-mono bg-transparent focus:outline-hidden"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleAddToCart(p)}
                                      className="w-9 h-9 bg-emerald-600 text-white rounded-lg flex items-center justify-center font-bold shadow-xs active:scale-95 transition-all cursor-pointer shrink-0"
                                      aria-label="Aumentar quantidade"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between h-11 bg-white border border-slate-300 rounded-xl px-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = Math.max(1, parsedCardQty - 1);
                                        setCatalogQtyDrafts((prev) => ({
                                          ...prev,
                                          [p.id]: String(next).replace('.', ','),
                                        }));
                                      }}
                                      className="w-9 h-9 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center justify-center cursor-pointer shrink-0"
                                      aria-label="Diminuir quantidade inicial"
                                    >
                                      <Minus size={14} />
                                    </button>
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
                                          handleAddToCart(
                                            p,
                                            !isNaN(parsed) && parsed > 0 ? parsed : 1,
                                            isPriceOverridden ? activeDisplayPrice : undefined
                                          );
                                        }
                                      }}
                                      placeholder="1"
                                      className="w-full min-w-0 text-center text-sm font-extrabold text-slate-900 font-mono bg-transparent focus:outline-hidden"
                                      title="Digite a quantidade desejada"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = parsedCardQty + 1;
                                        setCatalogQtyDrafts((prev) => ({
                                          ...prev,
                                          [p.id]: String(next).replace('.', ','),
                                        }));
                                      }}
                                      className="w-9 h-9 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center justify-center cursor-pointer shrink-0"
                                      aria-label="Aumentar quantidade inicial"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {!inCart && (
                              <button
                                type="button"
                                onClick={() => {
                                  const raw = (catalogQtyDrafts[p.id] ?? '1').trim();
                                  const parsed = parseFloat(raw.replace(',', '.'));
                                  handleAddToCart(
                                    p,
                                    !isNaN(parsed) && parsed > 0 ? parsed : 1,
                                    isPriceOverridden ? activeDisplayPrice : undefined
                                  );
                                }}
                                className="w-full h-11 min-h-[44px] px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
                              >
                                <Plus size={16} />
                                <span>Incluir Item</span>
                              </button>
                            )}
                          </div>
                        );
                      })()}
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
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            {canAlterUnitPrice ? (
                              <button
                                type="button"
                                onClick={() => handleOpenItemAdjustment(item, 'alterar_preco')}
                                className={`inline-flex items-center gap-1 text-[13px] font-mono px-1.5 py-0.5 rounded-lg transition-colors cursor-pointer ${
                                  item.priceOverridden
                                    ? 'bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold'
                                    : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
                                }`}
                                title="Toque para alterar o preço unitário deste item"
                              >
                                <span>{formatCurrency(item.unitPrice)} / {item.unit}</span>
                                <Pencil size={11} className="text-indigo-500" />
                              </button>
                            ) : (
                              <p className="text-[13px] text-slate-500 font-mono">
                                {formatCurrency(item.unitPrice)} / {item.unit}
                              </p>
                            )}
                            {item.priceOverridden && item.originalUnitPrice !== undefined && (
                              <span className="text-[11px] text-slate-400 font-mono line-through">
                                {formatCurrency(item.originalUnitPrice)}
                              </span>
                            )}
                          </div>
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
                              : item.priceOverridden
                              ? 'Preço Alterado'
                              : canAlterUnitPrice
                              ? 'Desconto / Alterar Preço'
                              : 'Ajustar Preço'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bloco 3: Pagamento e Saída de Estoque (ou Resumo de Bonificação) */}
            {cart.length > 0 && (
              <div className={`bg-white p-4 rounded-2xl border shadow-2xs space-y-3.5 ${isBonusMode ? 'border-sky-300' : 'border-slate-200/90'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-extrabold text-slate-900">
                    {isBonusMode ? 'Condições da Bonificação' : 'Condições de Venda'}
                  </h3>
                  {isBonusMode && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 border border-sky-300">
                      BONIFICAÇÃO
                    </span>
                  )}
                </div>

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

                {isBonusMode ? (
                  <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 space-y-1.5 text-xs text-sky-950">
                    <div className="flex items-center justify-between font-bold">
                      <span>Cobrança Financeira:</span>
                      <span className="font-black uppercase text-sky-900">Isenta (R$ 0,00)</span>
                    </div>
                    <div className="flex items-center justify-between font-bold">
                      <span>Contas a Receber:</span>
                      <span className="text-sky-800">Não gera títulos</span>
                    </div>
                    <div className="flex items-center justify-between font-bold">
                      <span>Movimentação de Estoque:</span>
                      <span className="text-emerald-700">Saída por Bonificação</span>
                    </div>
                  </div>
                ) : (
                  <>
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
                  </>
                )}

                {/* Observações de Entrega / Bonificação */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">
                    {isBonusMode ? 'Motivo / Observações da Bonificação:' : 'Observações da Entrega:'}
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      isBonusMode
                        ? 'Ex: Cortesia promocional, brinde para cliente...'
                        : 'Ex: Entregar pela manhã, deixar com responsável...'
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-medium"
                  />
                </div>
              </div>
            )}

            {/* Bloco 4: Resumo Financeiro & Botão de Fechamento */}
            {cart.length > 0 && (
              <div className={`bg-white p-4 rounded-2xl border shadow-2xs space-y-3 ${isBonusMode ? 'border-sky-300' : 'border-slate-200/90'}`}>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>{isBonusMode ? 'Valor de Referência (Itens):' : 'Subtotal:'}</span>
                    <span className="font-mono font-medium">{formatCurrency(cartSubtotal)}</span>
                  </div>
                  {!isBonusMode && globalDiscountVal > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>Desconto Geral:</span>
                      <span className="font-mono font-bold">-{formatCurrency(globalDiscountVal)}</span>
                    </div>
                  )}
                  {!isBonusMode && globalAdditionVal > 0 && (
                    <div className="flex justify-between text-blue-700">
                      <span>Acréscimo Geral:</span>
                      <span className="font-mono font-bold">+{formatCurrency(globalAdditionVal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-baseline pt-2 border-t border-slate-100">
                    <span className="text-base font-bold text-slate-900">
                      {isBonusMode ? 'Total a Cobrar:' : 'Total do Pedido:'}
                    </span>
                    <span className={`text-2xl font-black font-mono ${isBonusMode ? 'text-sky-700' : 'text-emerald-700'}`}>
                      {formatCurrency(isBonusMode ? 0 : cartTotal)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePreFinalizeOrder}
                  disabled={cart.length === 0 || !selectedCustomerId}
                  className={`w-full min-h-[52px] disabled:opacity-50 text-white font-extrabold text-base py-3.5 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition-all ${
                    isBonusMode
                      ? 'bg-sky-600 hover:bg-sky-500'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {isBonusMode ? <Gift size={20} /> : <CheckCircle2 size={20} />}
                  <span>
                    {isBonusMode
                      ? 'CONFIRMAR BONIFICAÇÃO'
                      : docType === 'orcamento'
                      ? 'GERAR ORÇAMENTO'
                      : 'CONFIRMAR VENDA'}
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
                          {isBonusOrder(ord) ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300">
                              <Gift size={10} />
                              BONIFICAÇÃO
                            </span>
                          ) : (
                            <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                              ord.type === 'orcamento' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {ord.type === 'orcamento' ? 'Orçamento' : 'Venda'}
                            </span>
                          )}
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
                          {ord.createdAt.slice(0, 10).split('-').reverse().join('/')} às {ord.createdAt.slice(11, 16)} ·{' '}
                          {isBonusOrder(ord) ? 'SEM COBRANÇA' : ord.paymentMethod.toUpperCase()}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className={`text-lg font-black font-mono block ${isBonusOrder(ord) ? 'text-sky-700' : 'text-emerald-700'}`}>
                          {formatCurrency(isBonusOrder(ord) ? 0 : ord.total)}
                        </span>
                        {isBonusOrder(ord) && getOrderReferenceTotal(ord) > 0 && (
                          <span className="text-[10px] font-mono text-slate-400 block">
                            Ref: {formatCurrency(getOrderReferenceTotal(ord))}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500">
                          {ord.items.length} {ord.items.length === 1 ? 'item' : 'itens'}
                        </span>
                      </div>
                    </div>

                    {/* Status explícito de confirmação no Firebase */}
                    {(() => {
                      const orderSyncState = FirebaseSyncService.getEntitySyncState('order', ord.id);
                      const orderSyncErr = FirebaseSyncService.getEntitySyncError('order', ord.id);
                      if (orderSyncState === 'failed') {
                        return (
                          <div className="flex items-center justify-between gap-2 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1.5 text-[11px] text-rose-800">
                            <span className="flex items-center gap-1.5 font-bold min-w-0">
                              <CloudOff size={13} className="text-rose-600 shrink-0" />
                              <span className="truncate" title={orderSyncErr || undefined}>
                                Falha ao salvar na nuvem
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={handleManualSyncRetry}
                              disabled={isRetryingOrderSync}
                              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-extrabold cursor-pointer disabled:opacity-50"
                            >
                              {isRetryingOrderSync ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                              <span>Reenviar</span>
                            </button>
                          </div>
                        );
                      }
                      if (orderSyncState === 'pending' || orderSyncState === 'syncing') {
                        return (
                          <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5 text-[11px] text-amber-900">
                            <span className="flex items-center gap-1.5 font-bold">
                              {orderSyncState === 'syncing' ? (
                                <Loader2 size={13} className="text-amber-600 animate-spin shrink-0" />
                              ) : (
                                <Clock size={13} className="text-amber-600 shrink-0" />
                              )}
                              <span>
                                {orderSyncState === 'syncing'
                                  ? 'Enviando para o Firebase...'
                                  : 'Salvo localmente • Aguardando sincronização'}
                              </span>
                            </span>
                            {isOnline && orderSyncState === 'pending' && (
                              <button
                                type="button"
                                onClick={handleManualSyncRetry}
                                disabled={isRetryingOrderSync}
                                className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-extrabold cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw size={10} />
                                <span>Enviar</span>
                              </button>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                          <Cloud size={12} className="text-emerald-600 shrink-0" />
                          <span>Confirmado no Firebase</span>
                        </div>
                      );
                    })()}

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
                      {ord.type === 'venda' && !isBonusOrder(ord) && ['concluido', 'em_romaneio', 'em_transito', 'entregue', 'nao_entregue'].includes(ord.status) && ord.returnStatus !== 'devolucao_total' && onStartReturn && (
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

      {/* Modal de Ajuste (Desconto / Acréscimo / Alterar Preço) por Item */}
      {showItemAdjustmentModal && (() => {
        const target = cart.find((i) => i.productId === adjustingItemId);
        if (!target) return null;
        const catalogProduct = dbState.products.find((p) => p.id === target.productId);
        const originalCatalogPrice =
          target.originalUnitPrice ??
          (catalogProduct
            ? StockEngine.getProductPriceForCompany(catalogProduct, currentCompany.id)
            : target.unitPrice);

        const gross = target.quantity * target.unitPrice;
        const raw = parseFloat(itemAdjustmentInput.replace(',', '.')) || 0;
        const isPriceMode = itemAdjustmentMode === 'alterar_preco';
        let previewVal = 0;
        if (!isPriceMode) {
          if (itemAdjustmentType === 'percent') {
            previewVal = (gross * Math.max(0, raw)) / 100;
          } else {
            previewVal = Math.max(0, raw);
          }
        }
        const net = isPriceMode
          ? Math.max(0, Math.round(target.quantity * (raw > 0 ? raw : target.unitPrice) * 100) / 100)
          : itemAdjustmentMode === 'desconto'
          ? Math.max(0, gross - previewVal)
          : gross + previewVal;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-4 space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="text-base font-bold text-slate-900">
                  {isPriceMode ? 'Alterar Preço Unitário' : 'Ajustar Preço do Item'}
                </h4>
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
                  {isPriceMode
                    ? `Preço Original Cadastrado: ${formatCurrency(originalCatalogPrice)} • Qtd: ${formatQuantity(target.quantity)} ${target.unit}`
                    : `Valor Bruto: ${formatCurrency(gross)} (${formatQuantity(target.quantity)} ${target.unit} x ${formatCurrency(target.unitPrice)})`}
                </p>
              </div>

              {/* Modo: Desconto vs Acréscimo vs Alterar Preço (RBAC) */}
              <div className={`grid gap-1 bg-slate-100 p-1 rounded-xl ${canAlterUnitPrice ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <button
                  type="button"
                  onClick={() => {
                    setItemAdjustmentMode('desconto');
                    setItemAdjustmentType('percent');
                    setItemAdjustmentInput(
                      target.discountPercent > 0 ? target.discountPercent.toString().replace('.', ',') : ''
                    );
                  }}
                  className={`py-1.5 px-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                    itemAdjustmentMode === 'desconto' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Desconto (-)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setItemAdjustmentMode('acrescimo');
                    setItemAdjustmentType('percent');
                    setItemAdjustmentInput(
                      (target.additionPercent || 0) > 0
                        ? (target.additionPercent || 0).toString().replace('.', ',')
                        : ''
                    );
                  }}
                  className={`py-1.5 px-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                    itemAdjustmentMode === 'acrescimo' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Acréscimo (+)
                </button>
                {canAlterUnitPrice && (
                  <button
                    type="button"
                    onClick={() => {
                      setItemAdjustmentMode('alterar_preco');
                      setItemAdjustmentType('value');
                      setItemAdjustmentInput(target.unitPrice.toFixed(2).replace('.', ','));
                    }}
                    className={`py-1.5 px-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                      itemAdjustmentMode === 'alterar_preco' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Alterar Preço
                  </button>
                )}
              </div>

              {/* Input e % / R$ */}
              {isPriceMode ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Novo Preço Unitário (R$):</label>
                    {Math.abs(target.unitPrice - originalCatalogPrice) > 0.004 && (
                      <button
                        type="button"
                        onClick={() => setItemAdjustmentInput(originalCatalogPrice.toFixed(2).replace('.', ','))}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        <RotateCcw size={11} />
                        Restaurar Original
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                      R$
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={itemAdjustmentInput}
                      onChange={(e) => setItemAdjustmentInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                      placeholder={originalCatalogPrice.toFixed(2).replace('.', ',')}
                      className="w-full bg-slate-50 border-2 border-indigo-200 focus:border-indigo-500 rounded-xl pl-10 pr-3 py-2 text-lg font-black text-right font-mono focus:outline-hidden focus:bg-white"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Substitui o valor unitário apenas nesta venda, sem alterar o cadastro do produto.
                  </p>
                </div>
              ) : (
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
              )}

              <div className="bg-slate-50 p-2.5 rounded-xl text-xs space-y-1">
                {isPriceMode && (
                  <div className="flex justify-between text-slate-500">
                    <span>Preço Original Cadastrado:</span>
                    <span className="font-mono font-semibold">{formatCurrency(originalCatalogPrice)}</span>
                  </div>
                )}
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
                  className={`px-4 py-2 text-xs font-bold text-white rounded-lg cursor-pointer ${
                    isPriceMode
                      ? 'bg-indigo-600 hover:bg-indigo-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isPriceMode ? 'Confirmar Preço' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de Confirmação da Venda */}
      <SaleConfirmationModal
        isOpen={showSaleConfirmationModal}
        onClose={() => {
          if (!isFinalizingOrder) setShowSaleConfirmationModal(false);
        }}
        onConfirm={handleFinalizeOrder}
        modality="Venda Mobile"
        customerName={selectedCustomer ? selectedCustomer.name : 'Cliente Externo'}
        customerDocument={selectedCustomer?.cpfCnpj}
        customerPhone={selectedCustomer?.phone || selectedCustomer?.whatsapp}
        totalAmount={isBonusMode ? 0 : cartTotal}
        paymentMethod={isBonusMode ? 'bonificacao' : paymentMethod || 'pix'}
        paymentTerm={isBonusMode ? 'Sem Cobrança (Bonificação)' : paymentTerm || 'a_vista'}
        installments={isBonusMode ? 0 : installments}
        itemsCount={totalCartUnits}
        locationName={commercialLocationName}
        companyName={currentCompany.tradeName || currentCompany.name}
        companyType={currentCompany.type}
        isSubmitting={isFinalizingOrder}
        isBonus={isBonusMode}
        referenceAmount={isBonusMode ? cartTotal : undefined}
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
