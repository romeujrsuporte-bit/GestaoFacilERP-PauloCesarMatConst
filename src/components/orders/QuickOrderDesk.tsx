import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingCart,
  CheckCircle2,
  FileText,
  Plus,
  Minus,
  Trash2,
  Search,
  User,
  UserPlus,
  Tag,
  Send,
  Warehouse,
  X,
  Package,
  Sparkles,
  ClipboardList,
  AlertCircle,
  Clock,
  Layers,
  ArrowRight,
  Barcode,
  Boxes,
  Ticket,
  Gift,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import { Database } from '../../services/db';
import { FirebaseSyncService } from '../../services/firebaseSync';
import { Product, Customer, Order, OrderCommercialKind, OrderItem } from '../../types';
import { StockEngine } from '../../services/stockEngine';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { ReceiptModal } from '../common/ReceiptModal';
import { SaleConfirmationModal } from '../common/SaleConfirmationModal';
import { FullCustomerModal } from '../common/FullCustomerModal';
import { CustomerSearchCombobox } from './CustomerSearchCombobox';
import { toast } from '../../services/toast';
import { formatBonusStockExitNote } from '../../utils/orderUtils';

interface QuickOrderDeskProps {
  onOrderFinished?: (order: Order) => void;
  defaultDocType?: 'venda' | 'orcamento';
  onNavigateToHistory?: () => void;
}

export const QuickOrderDesk: React.FC<QuickOrderDeskProps> = ({
  onOrderFinished,
  defaultDocType = 'venda',
  onNavigateToHistory,
}) => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  // Tipo de Documento: 'venda' ou 'orcamento'
  const [docType, setDocType] = useState<'venda' | 'orcamento'>(defaultDocType);
  // Tipo de Pedido: 'venda_normal' (padrão) ou 'bonificacao'
  const [orderKind, setOrderKind] = useState<OrderCommercialKind>('venda_normal');
  const isBonusMode = docType === 'venda' && orderKind === 'bonificacao';

  // Cliente Selecionado
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  // Carrinho de Itens
  const [cart, setCart] = useState<OrderItem[]>([]);

  // Pesquisa de Produtos
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string>(() => {
    const locs = Database.getState().stockLocations.filter(
      (l) => l.companyId === Database.getCurrentCompany().id && l.status === 'ativo'
    );
    const comercialLoc = locs.find(
      (l) => l.name.toLowerCase() === 'comercial' || l.type === 'comercial' || l.id === 'loc-comercial'
    );
    return comercialLoc?.id || locs[0]?.id || 'loc-comercial';
  });

  // Forma de Pagamento & Parcelas
  const [paymentMethod, setPaymentMethod] = useState<Order['paymentMethod'] | ''>('');
  const [paymentTerm, setPaymentTerm] = useState<string>('');
  const [showSaleConfirmationModal, setShowSaleConfirmationModal] = useState<boolean>(false);
  const [isFinalizingOrder, setIsFinalizingOrder] = useState<boolean>(false);
  const isFinalizingOrderRef = useRef<boolean>(false);
  const submissionIdRef = useRef<string>(`QOD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const [selectedBoletoAccountId, setSelectedBoletoAccountId] = useState<string>(() => {
    const boletoMethod = Database.getPaymentMethods().find((m) => m.type === 'boleto');
    if (boletoMethod?.defaultAccountId) return boletoMethod.defaultAccountId;
    const boletoAccs = Database.getBoletoAccounts();
    return boletoAccs[0]?.id || '';
  });
  const [installments, setInstallments] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');

  // Desconto Geral no Pedido (% ou R$)
  const [discountType, setDiscountType] = useState<'percent' | 'value'>(() => {
    return (localStorage.getItem('omni_discount_type') as 'percent' | 'value') || 'percent';
  });
  const [discountInput, setDiscountInput] = useState<string>('');

  const handleDiscountTypeChange = (newType: 'percent' | 'value') => {
    setDiscountType(newType);
    localStorage.setItem('omni_discount_type', newType);
  };

  // Modal de Cadastro Completo de Cliente (com Endereço e Rota para Romaneio)
  const [showQuickCustomerModal, setShowQuickCustomerModal] = useState<boolean>(false);

  // Permissão estrita para alteração direta de preço unitário: apenas Administrador Geral ou Gerente Geral
  const canAlterUnitPrice = Database.canCurrentUserAlterUnitPrice(currentUser);
  const unitPriceOverrideRole: 'admin' | 'gerente' = Database.isAdmin(currentUser) ? 'admin' : 'gerente';

  // Modal de Ajuste (Desconto, Acréscimo ou Alterar Preço) por Item
  const [showItemDiscountModal, setShowItemDiscountModal] = useState<boolean>(false);
  const [discountingItemId, setDiscountingItemId] = useState<string | null>(null);
  const [itemAdjustmentMode, setItemAdjustmentMode] = useState<'desconto' | 'acrescimo' | 'alterar_preco'>('desconto');
  const [itemDiscountType, setItemDiscountType] = useState<'percent' | 'value'>('percent');
  const [itemDiscountInput, setItemDiscountInput] = useState<string>('');
  const [searchPriceDrafts, setSearchPriceDrafts] = useState<Record<string, string>>({});
  const [editingSearchPriceId, setEditingSearchPriceId] = useState<string | null>(null);

  // Comprovante / Recibo
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const locations = dbState.stockLocations.filter(
    (l) => l.companyId === currentCompany.id && l.status === 'ativo'
  );
  const selectedLocation = locations.find((l) => l.id === selectedLocationId) || locations[0];
  const selectedLocationName = selectedLocation?.name || 'Comercial';

  // Produtos filtrados de acordo com o Depósito de Saída selecionado
  const filteredProducts = dbState.products.filter((p) => {
    if (p.status !== 'ativo' || StockEngine.getProductPriceForCompany(p, currentCompany.id) <= 0) return false;
    const stock = StockEngine.getBalance(dbState.stockBalances, p.id, selectedLocationId);
    if (stock.quantity <= 0) return false;
    if (!searchQuery.trim()) return false;
    const cleanQuery = searchQuery.toLowerCase().trim();
    return (
      p.description.toLowerCase().includes(cleanQuery) ||
      p.code.toLowerCase().includes(cleanQuery) ||
      (p.barcode && p.barcode.includes(cleanQuery))
    );
  });

  // Produtos em destaque / populares com saldo no depósito selecionado
  const popularProducts = dbState.products
    .filter((p) => {
      if (p.status !== 'ativo' || StockEngine.getProductPriceForCompany(p, currentCompany.id) <= 0) return false;
      const stock = StockEngine.getBalance(dbState.stockBalances, p.id, selectedLocationId);
      return stock.quantity > 0;
    })
    .slice(0, 6);

  // ==========================================
  // MANIPULAÇÃO DO CARRINHO
  // ==========================================
  const handleAddToCart = (product: Product, quantityToAdd: number = 1, customUnitPriceOverride?: number) => {
    const stock = StockEngine.getBalance(dbState.stockBalances, product.id, selectedLocationId);
    const existing = cart.find((i) => i.productId === product.id);
    const currentCartQty = existing ? existing.quantity : 0;
    const nextTotalQty = currentCartQty + quantityToAdd;

    // Se for venda e saldo insuficiente, alerta amigável
    if (docType === 'venda' && stock.quantity < nextTotalQty) {
      const confirmAdd = window.confirm(
        `Atenção: Saldo insuficiente de "${product.description}" no local selecionado.\nSaldo disponível: ${stock.quantity} ${product.unit}.\nDeseja adicionar mesmo assim?`
      );
      if (!confirmAdd) return;
    }

    const catalogPrice = StockEngine.getProductPriceForCompany(product, currentCompany.id);
    const effectiveCost = StockEngine.getProductCostForCompany(product, currentCompany.id);
    const hasAuthorizedOverride =
      canAlterUnitPrice &&
      customUnitPriceOverride !== undefined &&
      Number.isFinite(customUnitPriceOverride) &&
      customUnitPriceOverride >= 0 &&
      Math.abs(customUnitPriceOverride - catalogPrice) > 0.005;
    const appliedPrice = hasAuthorizedOverride
      ? Math.round(customUnitPriceOverride! * 100) / 100
      : catalogPrice;

    if (existing) {
      const newQty = existing.quantity + quantityToAdd;
      const unitPrice = hasAuthorizedOverride ? appliedPrice : existing.unitPrice;
      const itemDiscVal = hasAuthorizedOverride ? 0 : existing.discountValue || 0;
      const itemAddVal = hasAuthorizedOverride ? 0 : existing.additionValue || 0;
      const totalPrice = Math.max(0, Math.round((newQty * unitPrice + itemAddVal - itemDiscVal) * 100) / 100);

      setCart(
        cart.map((i) =>
          i.productId === product.id
            ? {
                ...i,
                quantity: newQty,
                unitPrice,
                referenceUnitPrice: hasAuthorizedOverride ? unitPrice : i.referenceUnitPrice,
                originalUnitPrice: hasAuthorizedOverride ? (i.originalUnitPrice ?? catalogPrice) : i.originalUnitPrice,
                priceOverridden: hasAuthorizedOverride ? true : i.priceOverridden,
                priceOverriddenByRole: hasAuthorizedOverride ? unitPriceOverrideRole : i.priceOverriddenByRole,
                discountPercent: hasAuthorizedOverride ? 0 : i.discountPercent,
                discountValue: itemDiscVal,
                additionPercent: hasAuthorizedOverride ? 0 : i.additionPercent,
                additionValue: itemAddVal,
                totalPrice,
              }
            : i
        )
      );
    } else {
      const newItem: OrderItem = {
        id: 'ITM-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        productId: product.id,
        productCode: product.code,
        description: product.description,
        unit: product.unit,
        quantity: quantityToAdd,
        unitPrice: appliedPrice,
        referenceUnitPrice: appliedPrice,
        originalUnitPrice: hasAuthorizedOverride ? catalogPrice : undefined,
        priceOverridden: hasAuthorizedOverride || undefined,
        priceOverriddenByRole: hasAuthorizedOverride ? unitPriceOverrideRole : undefined,
        discountPercent: 0,
        discountValue: 0,
        additionPercent: 0,
        additionValue: 0,
        totalPrice: Math.round(appliedPrice * quantityToAdd * 100) / 100,
        unitCost: effectiveCost,
        locationId: selectedLocationId,
        isMasterPack: product.isMasterPack,
        masterPackUnits: product.masterPackUnits,
        masterPackAssociatedProductId: product.masterPackAssociatedProductId,
        masterPackAssociatedProductCode: product.masterPackAssociatedProductCode,
      };
      setCart([newItem, ...cart]);
    }

    setSearchPriceDrafts((prev) => {
      if (!(product.id in prev)) return prev;
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
    if (editingSearchPriceId === product.id) setEditingSearchPriceId(null);
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.productId === productId) {
            const nextQty = i.quantity + delta;
            if (nextQty <= 0) return null;
            const itemDiscVal = i.discountValue || 0;
            return {
              ...i,
              quantity: nextQty,
              totalPrice: Math.max(0, nextQty * i.unitPrice - itemDiscVal),
            };
          }
          return i;
        })
        .filter(Boolean) as OrderItem[]
    );
  };

  const handleRemoveItem = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  };

  // ==========================================
  // AJUSTE POR ITEM (DESCONTO, ACRÉSCIMO OU ALTERAR PREÇO)
  // ==========================================
  const handleOpenItemDiscount = (item: OrderItem, initialMode?: 'desconto' | 'acrescimo' | 'alterar_preco') => {
    setDiscountingItemId(item.id);
    if (initialMode === 'alterar_preco' && canAlterUnitPrice) {
      setItemAdjustmentMode('alterar_preco');
      setItemDiscountType('value');
      setItemDiscountInput(item.unitPrice.toFixed(2).replace('.', ','));
    } else if (item.additionValue && item.additionValue > 0) {
      setItemAdjustmentMode('acrescimo');
      if (item.additionPercent && item.additionPercent > 0) {
        setItemDiscountType('percent');
        setItemDiscountInput(String(item.additionPercent));
      } else {
        setItemDiscountType('value');
        setItemDiscountInput(item.additionValue.toFixed(2).replace('.', ','));
      }
    } else if (item.discountPercent && item.discountPercent > 0) {
      setItemAdjustmentMode('desconto');
      setItemDiscountType('percent');
      setItemDiscountInput(String(item.discountPercent));
    } else if (item.discountValue && item.discountValue > 0) {
      setItemAdjustmentMode('desconto');
      setItemDiscountType('value');
      setItemDiscountInput(item.discountValue.toFixed(2).replace('.', ','));
    } else if (item.priceOverridden && canAlterUnitPrice && !initialMode) {
      setItemAdjustmentMode('alterar_preco');
      setItemDiscountType('value');
      setItemDiscountInput(item.unitPrice.toFixed(2).replace('.', ','));
    } else {
      setItemAdjustmentMode(initialMode && initialMode !== 'alterar_preco' ? initialMode : 'desconto');
      setItemDiscountType('percent');
      setItemDiscountInput('');
    }
    setShowItemDiscountModal(true);
  };

  const handleApplyItemDiscount = () => {
    if (!discountingItemId) return;
    const item = cart.find((i) => i.id === discountingItemId);
    if (!item) return;

    if (itemAdjustmentMode === 'alterar_preco') {
      if (!canAlterUnitPrice) {
        toast.error(
          'Somente usuários com perfil Administrador Geral ou Gerente Geral podem alterar o preço unitário.',
          'Permissão Negada'
        );
        return;
      }
      const parsedNewPrice = parseFloat(itemDiscountInput.replace(',', '.'));
      if (!Number.isFinite(parsedNewPrice) || parsedNewPrice < 0) {
        toast.warning('Informe um preço unitário válido.', 'Preço Inválido');
        return;
      }
      const cleanNewPrice = Math.round(parsedNewPrice * 100) / 100;
      const product = dbState.products.find((p) => p.id === item.productId);
      const catalogPrice = product
        ? StockEngine.getProductPriceForCompany(product, currentCompany.id)
        : item.originalUnitPrice ?? item.referenceUnitPrice ?? item.unitPrice;
      const isDifferentFromCatalog = Math.abs(cleanNewPrice - catalogPrice) > 0.005;

      setCart((prev) =>
        prev.map((i) =>
          i.id === discountingItemId
            ? {
                ...i,
                unitPrice: cleanNewPrice,
                referenceUnitPrice: cleanNewPrice,
                originalUnitPrice: isDifferentFromCatalog ? (i.originalUnitPrice ?? catalogPrice) : undefined,
                priceOverridden: isDifferentFromCatalog || undefined,
                priceOverriddenByRole: isDifferentFromCatalog ? unitPriceOverrideRole : undefined,
                discountPercent: 0,
                discountValue: 0,
                additionPercent: 0,
                additionValue: 0,
                totalPrice: Math.round(i.quantity * cleanNewPrice * 100) / 100,
              }
            : i
        )
      );
      setShowItemDiscountModal(false);
      setDiscountingItemId(null);
      return;
    }

    const baseGross = item.quantity * item.unitPrice;
    const cleanVal = Math.max(0, parseFloat(itemDiscountInput.replace(',', '.')) || 0);
    const maxPercent = currentUser.permissions.maxDiscountPercent;

    let finalDiscVal = 0;
    let finalDiscPercent = 0;
    let finalAddVal = 0;
    let finalAddPercent = 0;

    if (itemAdjustmentMode === 'acrescimo') {
      if (itemDiscountType === 'percent') {
        finalAddPercent = cleanVal;
        finalAddVal = (baseGross * finalAddPercent) / 100;
      } else {
        finalAddVal = cleanVal;
        finalAddPercent = baseGross > 0 ? (finalAddVal / baseGross) * 100 : 0;
      }
    } else if (itemDiscountType === 'percent') {
      finalDiscPercent = Math.min(maxPercent, cleanVal);
      finalDiscVal = (baseGross * finalDiscPercent) / 100;
    } else {
      const maxAllowedVal = (baseGross * maxPercent) / 100;
      finalDiscVal = Math.min(maxAllowedVal, Math.min(baseGross, cleanVal));
      finalDiscPercent = baseGross > 0 ? (finalDiscVal / baseGross) * 100 : 0;
    }

    setCart((prev) =>
      prev.map((i) => {
        if (i.id === discountingItemId) {
          return {
            ...i,
            discountPercent: Math.round(finalDiscPercent * 100) / 100,
            discountValue: Math.round(finalDiscVal * 100) / 100,
            additionPercent: Math.round(finalAddPercent * 100) / 100,
            additionValue: Math.round(finalAddVal * 100) / 100,
            totalPrice: Math.max(0, Math.round((baseGross + finalAddVal - finalDiscVal) * 100) / 100),
          };
        }
        return i;
      })
    );

    setShowItemDiscountModal(false);
    setDiscountingItemId(null);
  };

  // ==========================================
  // CÁLCULOS TOTAIS
  // ==========================================
  const grossSubtotal = cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const totalItemDiscounts = cart.reduce((s, i) => s + (i.discountValue || 0), 0);
  const subtotalAfterItemDiscounts = cart.reduce((s, i) => s + i.totalPrice, 0);

  const parsedOrderDiscountNum = Math.max(0, parseFloat(discountInput.replace(',', '.')) || 0);
  const maxAllowedPercent = currentUser.permissions.maxDiscountPercent;
  const maxAllowedVal = (subtotalAfterItemDiscounts * maxAllowedPercent) / 100;

  let globalOrderDiscount = 0;
  if (discountType === 'percent') {
    const safePercent = Math.min(maxAllowedPercent, parsedOrderDiscountNum);
    globalOrderDiscount = (subtotalAfterItemDiscounts * safePercent) / 100;
  } else {
    globalOrderDiscount = Math.min(maxAllowedVal, Math.min(subtotalAfterItemDiscounts, parsedOrderDiscountNum));
  }

  const effectiveGlobalDiscountPercent =
    subtotalAfterItemDiscounts > 0 ? (globalOrderDiscount / subtotalAfterItemDiscounts) * 100 : 0;

  const totalDiscountAll = totalItemDiscounts + globalOrderDiscount;
  const orderFinalTotal = Math.max(0, subtotalAfterItemDiscounts - globalOrderDiscount);

  // Pré-finalizar pedido (validação de cliente obrigatório, forma e prazo de pagamento obrigatórios e abertura da tela de confirmação)
  const handlePreFinalizeOrder = () => {
    if (cart.length === 0) {
      toast.warning('Adicione pelo menos 1 produto ao pedido antes de finalizar.', 'Carrinho Vazio');
      return;
    }
    if (!selectedCustomerId || selectedCustomerId.trim() === '') {
      toast.warning(
        `A seleção do cliente é obrigatória para emitir o ${isBonusMode ? 'Pedido de Bonificação' : 'Pedido de Venda'}. Selecione um cliente cadastrado ou clique em "+ Novo Cliente" para cadastrar.`,
        'Cliente Obrigatório'
      );
      return;
    }
    if (!isBonusMode) {
      if (!paymentMethod) {
        toast.warning('A Forma de Pagamento é obrigatória em todas as modalidades de venda.', 'Forma de Pagamento Obrigatória');
        return;
      }
      if (!paymentTerm || paymentTerm.trim() === '') {
        toast.warning('O Prazo de Pagamento é obrigatório em todas as modalidades de venda.', 'Prazo Obrigatório');
        return;
      }
    }
    setShowSaleConfirmationModal(true);
  };

  // ==========================================
  // FINALIZAR PEDIDO DE VENDA, BONIFICAÇÃO OU ORÇAMENTO (após confirmação na tela)
  // ==========================================
  const handleFinalizeOrder = async () => {
    if (isFinalizingOrderRef.current) {
      return;
    }

    if (cart.length === 0) {
      setShowSaleConfirmationModal(false);
      toast.warning('Adicione pelo menos 1 produto ao pedido.', 'Carrinho Vazio');
      return;
    }
    if (!selectedCustomerId || selectedCustomerId.trim() === '') {
      setShowSaleConfirmationModal(false);
      toast.warning('A seleção do cliente é obrigatória para emitir o pedido.', 'Cliente Obrigatório');
      return;
    }
    if (!isBonusMode) {
      if (!paymentMethod) {
        setShowSaleConfirmationModal(false);
        toast.warning('A Forma de Pagamento é obrigatória em todas as modalidades de venda.', 'Forma de Pagamento Obrigatória');
        return;
      }
      if (!paymentTerm || paymentTerm.trim() === '') {
        setShowSaleConfirmationModal(false);
        toast.warning('O Prazo de Pagamento é obrigatório em todas as modalidades de venda.', 'Prazo Obrigatório');
        return;
      }
    }

    const validatedCompany = Database.ensureValidCurrentCompanyForUser(currentUser, { skipPersist: true });
    if (validatedCompany.status === 'inativo') {
      setShowSaleConfirmationModal(false);
      toast.error(
        `A empresa "${validatedCompany.tradeName || validatedCompany.name}" está inativa e não pode registrar novos pedidos.`,
        'Empresa Inativa'
      );
      return;
    }

    const submissionId = submissionIdRef.current;
    const existingDuplicate = Database.findOrderBySubmissionId(submissionId);
    if (existingDuplicate) {
      isFinalizingOrderRef.current = true;
      setIsFinalizingOrder(true);
      try {
        const retryResult = await FirebaseSyncService.commitCriticalOperation({
          operationKey: `order:${existingDuplicate.id}`,
          entityType: 'order',
          entityId: existingDuplicate.id,
          label: `Pedido ${existingDuplicate.number}`,
        });
        setShowSaleConfirmationModal(false);
        if (retryResult.syncState === 'confirmed') {
          toast.success(`Pedido ${existingDuplicate.number} confirmado no Firebase.`, 'Confirmado na Nuvem');
        } else if (retryResult.syncState === 'pending_offline') {
          toast.warning(retryResult.message, 'Aguardando Sincronização');
        } else {
          toast.error(retryResult.message, 'Falha na Sincronização');
        }
        submissionIdRef.current = `QOD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setCompletedOrder(existingDuplicate);
        setShowReceiptModal(true);
        setCart([]);
      } finally {
        isFinalizingOrderRef.current = false;
        setIsFinalizingOrder(false);
      }
      return;
    }

    isFinalizingOrderRef.current = true;
    setIsFinalizingOrder(true);

    const prefix = isBonusMode ? 'BON' : docType === 'orcamento' ? 'ORC' : 'PED';
    const now = new Date();
    const orderNumber = Database.generateUniqueOrderNumber(prefix, 5);
    const nowIso = now.toISOString();
    const uniqueOrderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      const latestState = Database.getState();
      let currentBalances = [...latestState.stockBalances];
      const createdMovements = [];

      // Se for VENDA ou BONIFICAÇÃO, realiza a baixa física de estoque
      if (isBonusMode || docType === 'venda') {
        for (const item of cart) {
          const loc =
            latestState.stockLocations.find((l) => l.id === item.locationId) ||
            latestState.stockLocations.find((l) => l.id === selectedLocationId) ||
            latestState.stockLocations[0];

          const { updatedBalances, createdMovement } = StockEngine.applyMovement(
            currentBalances,
            {
              companyId: validatedCompany.id,
              productId: item.productId,
              productCode: item.productCode,
              productDescription: item.description,
              locationId: loc.id,
              locationName: loc.name,
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
                ? formatBonusStockExitNote(orderNumber, validatedCompany.tradeName || validatedCompany.name)
                : `Pedido de Venda Retaguarda/Início emitido por ${currentUser.name}`,
            },
            { allowNegativeStock: Database.canSellNegativeStock() }
          );

          currentBalances = updatedBalances;
          createdMovements.push(createdMovement);
        }
      }

      const targetBoletoAccount = !isBonusMode && paymentMethod === 'boleto'
        ? Database.getBoletoAccounts(validatedCompany.id).find((a) => a.id === selectedBoletoAccountId) || Database.getBoletoAccounts(validatedCompany.id)[0]
        : undefined;

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
        origin: 'retaguarda_pedido',
        companyId: validatedCompany.id,
        customerId: selectedCustomerId || 'CLI-CONSUMIDOR',
        customerName: selectedCustomer ? selectedCustomer.name : 'Consumidor Final (Não Identificado)',
        customerPhone: selectedCustomer?.whatsapp || selectedCustomer?.phone,
        userId: currentUser.id,
        userName: currentUser.name,
        items: cart,
        subtotal: isBonusMode ? 0 : grossSubtotal,
        discountTotal: isBonusMode ? 0 : totalDiscountAll,
        total: isBonusMode ? 0 : orderFinalTotal,
        referenceSubtotal: isBonusMode ? grossSubtotal : undefined,
        referenceTotal: isBonusMode ? orderFinalTotal : undefined,
        paymentMethod: effectivePaymentMethod,
        paymentTerm: isBonusMode ? 'Sem Cobrança (Bonificação)' : paymentTerm,
        bankAccountId: isBonusMode ? undefined : targetBoletoAccount?.id,
        bankAccountName: isBonusMode ? undefined : targetBoletoAccount?.name,
        installmentsCount: isBonusMode ? 0 : installments,
        receivedAmount: !isBonusMode && docType === 'venda' && (paymentMethod === 'pix' || paymentMethod === 'dinheiro') ? orderFinalTotal : 0,
        changeAmount: 0,
        status: !isBonusMode && docType === 'orcamento' ? 'aberto' : 'concluido',
        validityDate:
          !isBonusMode && docType === 'orcamento'
            ? new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]
            : undefined,
        notes: isBonusMode
          ? (notes ? `${notes} | ` : '') + `BONIFICAÇÃO — SEM COBRANÇA FINANCEIRA • Pedido gerado via painel Início por ${currentUser.name}`
          : (notes ? `${notes} | ` : '') + `Prazo: ${termInfo.label}${installments > 1 && !/\d+\s*x/i.test(termInfo.label) ? ` (${installments}x)` : ''} • Pedido gerado via painel Início por ${currentUser.name}`,
        stockDeducted: isBonusMode || docType === 'venda',
        financialGenerated: !isBonusMode && docType === 'venda',
        clientSubmissionId: submissionId,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      // Se venda normal a prazo, gerar Contas a Receber (NUNCA para Bonificação)
      let updatedReceivables = [...latestState.accountsReceivable];
      if (!isBonusMode && docType === 'venda' && (paymentMethod === 'boleto' || installments > 1)) {
        const valParcela = Number((orderFinalTotal / installments).toFixed(2));
        for (let i = 1; i <= installments; i++) {
          const daysOffset = termInfo.daysOffsets[i - 1] ?? i * 30;
          const due = new Date();
          due.setDate(due.getDate() + daysOffset);
          updatedReceivables.push({
            id: `REC-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
            companyId: validatedCompany.id,
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

      // Salva no banco de dados local e aguarda confirmação efetiva no Firebase Firestore
      const state = Database.getState();
      state.stockBalances = currentBalances;
      state.stockMovements = [...createdMovements, ...state.stockMovements];
      state.orders = [newOrder, ...state.orders];
      state.accountsReceivable = updatedReceivables;
      Database.persist();

      Database.addAuditLog(
        isBonusMode ? 'BONIFICACAO_EMITIDA' : 'PEDIDO_VENDA_CRIADO',
        'PEDIDOS_RETAGUARDA',
        newOrder.id,
        isBonusMode
          ? `Pedido de Bonificação ${orderNumber} criado por ${currentUser.name} para ${newOrder.customerName}. Valor Financeiro: R$ 0,00 (Ref.: ${formatCurrency(orderFinalTotal)})`
          : `${docType === 'orcamento' ? 'Orçamento' : 'Pedido de Venda'} ${orderNumber} criado por ${currentUser.name} para ${newOrder.customerName}. Total: ${formatCurrency(orderFinalTotal)}`
      );

      const docLabel = isBonusMode ? 'Pedido de Bonificação' : docType === 'orcamento' ? 'Orçamento' : 'Pedido de Venda';
      const syncResult = await FirebaseSyncService.commitCriticalOperation({
        operationKey: `order:${newOrder.id}`,
        entityType: 'order',
        entityId: newOrder.id,
        label: `${docLabel} ${orderNumber}`,
      });

      submissionIdRef.current = `QOD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setShowSaleConfirmationModal(false);

      if (syncResult.syncState === 'confirmed') {
        toast.success(
          `${docLabel} ${orderNumber} salvo e confirmado no Firebase!`,
          isBonusMode ? 'Bonificação Confirmada na Nuvem' : 'Confirmado no Firebase'
        );
      } else if (syncResult.syncState === 'pending_offline') {
        toast.warning(
          `${docLabel} ${orderNumber} salvo localmente (sem conexão). Será sincronizado automaticamente com o Firebase.`,
          'Pendente de Sincronização'
        );
      } else {
        toast.error(
          `${docLabel} ${orderNumber} salvo localmente, mas falhou ao gravar no Firebase: ${syncResult.message}`,
          'Falha na Sincronização'
        );
      }

      setCompletedOrder(newOrder);
      setShowReceiptModal(true);

      // Limpa formulário para próximo pedido (retornando ao padrão Venda Normal)
      setCart([]);
      setOrderKind('venda_normal');
      setDiscountInput('');
      setNotes('');
      setSelectedCustomerId('');
      setPaymentMethod('');
      setPaymentTerm('');

      if (onOrderFinished) {
        onOrderFinished(newOrder);
      }
    } catch (err: any) {
      setShowSaleConfirmationModal(false);
      toast.error('Erro ao gravar pedido: ' + err.message, 'Erro');
    } finally {
      isFinalizingOrderRef.current = false;
      setIsFinalizingOrder(false);
    }
  };

  return (
    <div id="pedidos-venda-desk" className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4">
      {/* Cabeçalho do Recurso: Título & Alternador Venda / Orçamento */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <ClipboardList size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                Pedido de Venda & Orçamentos
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-50 text-blue-700 border border-blue-200">
                Nova Emissão
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Realize pedidos de venda ou orçamentos comerciais diretamente aqui, sem abrir PDV Balcão nem Venda Externa.
            </p>
          </div>
        </div>

        {/* Alternância Venda Normal vs Bonificação vs Orçamento */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start sm:self-auto border border-slate-200 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setDocType('venda');
              setOrderKind('venda_normal');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              docType === 'venda' && orderKind === 'venda_normal'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 size={13} />
            <span>Venda Normal</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDocType('venda');
              setOrderKind('bonificacao');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              docType === 'venda' && orderKind === 'bonificacao'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-sky-700'
            }`}
          >
            <Gift size={13} />
            <span>Bonificação</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDocType('orcamento');
              setOrderKind('venda_normal');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              docType === 'orcamento'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText size={13} />
            <span>Orçamento</span>
          </button>
        </div>
      </div>

      {/* Faixa de Identificação de Modo Bonificação */}
      {isBonusMode && (
        <div className="bg-sky-50 border-2 border-sky-300 rounded-xl p-3 flex items-center gap-2.5 text-xs text-sky-950">
          <Gift size={18} className="text-sky-700 shrink-0" />
          <div>
            <strong className="uppercase">PEDIDO DE BONIFICAÇÃO ATIVO:</strong> Este pedido realizará a <strong>baixa de estoque por bonificação</strong> sem gerar faturamento, cobrança nem Contas a Receber.
          </div>
        </div>
      )}

      {/* Grid Superior: Identificação do Cliente & Local de Saída */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Seleção de Cliente (8 cols) */}
        <div className="md:col-span-8 space-y-1">
          <div className="flex justify-between items-center text-xs">
            <label className="font-bold text-slate-700 flex items-center gap-1.5">
              <User size={14} className="text-blue-600" />
              <span>Cliente do Pedido *</span>
            </label>
            <button
              type="button"
              onClick={() => setShowQuickCustomerModal(true)}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <UserPlus size={12} />
              <span>+ Novo Cliente (Completo)</span>
            </button>
          </div>

          <CustomerSearchCombobox
            customers={customers}
            selectedCustomerId={selectedCustomerId}
            onSelectCustomer={setSelectedCustomerId}
            onOpenNewCustomerModal={() => setShowQuickCustomerModal(true)}
            placeholder="Digite os primeiros caracteres para buscar o cliente..."
          />

          {selectedCustomer ? (
            <div className="text-xs text-emerald-900 bg-gradient-to-r from-emerald-50 via-teal-50/70 to-emerald-100/60 p-2.5 rounded-xl border-2 border-emerald-500 shadow-xs font-bold space-y-1">
              <div className="flex items-center justify-between">
                <span className="truncate flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  <strong className="text-emerald-950">{selectedCustomer.name}</strong> ({selectedCustomer.type})
                </span>
                <span className="font-extrabold shrink-0 ml-2 bg-white/95 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300 text-[10px]">
                  Limite: {formatCurrency(selectedCustomer.creditLimit)}
                </span>
              </div>
              <div className="text-[11px] text-emerald-800 flex items-center gap-1.5 flex-wrap">
                <span>📍 {selectedCustomer.street ? `${selectedCustomer.street}, ${selectedCustomer.number || 'S/N'}` : selectedCustomer.city || 'Feira de Santana'}</span>
                {selectedCustomer.neighborhood && <span>- Bairro: {selectedCustomer.neighborhood}</span>}
                <span>- {selectedCustomer.city || 'Feira de Santana'}/{selectedCustomer.state || 'BA'}</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-emerald-200 text-[11px] font-bold text-emerald-950">
                <span className="bg-emerald-200/80 text-emerald-950 px-2 py-0.5 rounded-md">
                  🚚 Rota Romaneio: {selectedCustomer.deliveryRouteName || 'Rota Padrão'}
                </span>
                {selectedCustomer.marketArea && (
                  <span className="bg-white/80 text-emerald-900 px-2 py-0.5 rounded-md border border-emerald-200">
                    Praça: {selectedCustomer.marketArea}
                  </span>
                )}
              </div>
              {selectedCustomerVoucherBalance > 0 && (
                <div className="mt-1.5 bg-amber-50 border border-amber-300 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 text-amber-900">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Ticket size={14} className="text-amber-600 shrink-0" />
                    <span>
                      Vale disponível ({selectedCustomerVouchers.map((v) => v.code).join(', ')})
                    </span>
                  </span>
                  <span className="font-mono font-black bg-white px-2 py-0.5 rounded border border-amber-200 shrink-0">
                    {formatCurrency(selectedCustomerVoucherBalance)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-rose-600 font-bold flex items-center gap-1 pt-0.5">
              <AlertCircle size={12} className="shrink-0" />
              <span>Cliente obrigatório para faturamento e futuro Romaneio de Entrega.</span>
            </p>
          )}
        </div>

        {/* Local de Estoque (4 cols) */}
        <div className="md:col-span-4 space-y-1">
          <label className="block text-xs font-bold text-slate-700">
            <span className="flex items-center gap-1">
              <Warehouse size={14} className="text-slate-400" />
              <span>Depósito de Saída</span>
            </span>
          </label>
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-hidden focus:bg-white truncate"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} {loc.id === 'loc-comercial' || loc.name.toLowerCase() === 'comercial' ? '(Padrão)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Seção de Busca e Adição Rápida de Produtos */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-slate-700">
          Adicionar Produtos ao Pedido:
        </label>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Digite o nome, código de barras ou referência do produto..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearchResults(true);
            }}
            onFocus={() => setShowSearchResults(true)}
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setShowSearchResults(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={14} />
            </button>
          )}

          {/* Dropdown de Resultados da Busca */}
          {showSearchResults && searchQuery.trim() && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-56 overflow-y-auto divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <div className="p-3 text-xs text-slate-400 text-center">
                  Nenhum produto encontrado para "{searchQuery}".
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const stock = StockEngine.getBalance(dbState.stockBalances, p.id, selectedLocationId);
                  const isOutOfStock = stock.quantity <= 0;
                  const catalogPrice = StockEngine.getProductPriceForCompany(p, currentCompany.id);
                  const draftStr = searchPriceDrafts[p.id];
                  const parsedDraft =
                    draftStr !== undefined && draftStr.trim() !== ''
                      ? parseFloat(draftStr.replace(',', '.'))
                      : NaN;
                  const hasDraft = canAlterUnitPrice && Number.isFinite(parsedDraft) && parsedDraft >= 0;
                  const displayPrice = hasDraft ? parsedDraft : catalogPrice;
                  const isDraftChanged = hasDraft && Math.abs(displayPrice - catalogPrice) > 0.005;

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleAddToCart(p, 1, hasDraft ? displayPrice : undefined)}
                      className="p-2.5 hover:bg-blue-50 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">
                            {p.code}
                          </span>
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {p.description}
                          </span>
                          {p.isMasterPack && (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-amber-100 text-amber-900 font-extrabold px-1.5 py-0.2 rounded border border-amber-300">
                              <Boxes size={10} className="text-amber-700" />
                              Master ({p.masterPackUnits} un/{p.unit})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          {canAlterUnitPrice ? (
                            editingSearchPriceId === p.id ? (
                              <span
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-400 rounded px-1.5 py-0.5"
                              >
                                <span className="text-[10px] font-bold text-indigo-700">R$</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  autoFocus
                                  value={draftStr ?? catalogPrice.toFixed(2).replace('.', ',')}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) =>
                                    setSearchPriceDrafts((prev) => ({
                                      ...prev,
                                      [p.id]: e.target.value.replace(/[^0-9.,]/g, ''),
                                    }))
                                  }
                                  onBlur={() => setEditingSearchPriceId(null)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setEditingSearchPriceId(null);
                                    } else if (e.key === 'Escape') {
                                      e.stopPropagation();
                                      setEditingSearchPriceId(null);
                                    }
                                  }}
                                  className="w-16 text-right font-mono text-[11px] font-black text-indigo-950 bg-transparent focus:outline-hidden"
                                />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSearchPriceDrafts((prev) => ({
                                    ...prev,
                                    [p.id]: displayPrice.toFixed(2).replace('.', ','),
                                  }));
                                  setEditingSearchPriceId(p.id);
                                }}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer ${
                                  isDraftChanged
                                    ? 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold'
                                    : 'text-slate-700 border-transparent hover:bg-indigo-50 hover:text-indigo-800'
                                }`}
                                title={`Clique para alterar o preço unitário antes de adicionar (Original: ${formatCurrency(catalogPrice)})`}
                              >
                                <span>Preço: <strong className="font-mono">{formatCurrency(displayPrice)}</strong></span>
                                <Pencil size={10} className="text-indigo-500" />
                              </button>
                            )
                          ) : (
                            <span>Preço: <strong className="text-slate-700">{formatCurrency(catalogPrice)}</strong></span>
                          )}
                          <span>•</span>
                          <span className={isOutOfStock ? 'text-rose-600 font-semibold' : 'text-emerald-700 font-semibold'}>
                            Saldo ({selectedLocationName}): {formatQuantity(stock.quantity)} {p.unit}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToCart(p, 1, hasDraft ? displayPrice : undefined);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer"
                      >
                        <Plus size={12} />
                        <span>Adicionar</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Atalhos Rápidos de Produtos (quando a busca está limpa) */}
        {!searchQuery && popularProducts.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] text-slate-400 font-bold shrink-0">Sugestões:</span>
            {popularProducts.map((prod) => (
              <button
                key={prod.id}
                type="button"
                onClick={() => handleAddToCart(prod, 1)}
                className="bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-900 px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                title={`Adicionar ${prod.description}`}
              >
                <Plus size={11} className="text-blue-600" />
                <span className="truncate max-w-[140px]">{prod.description}</span>
                <span className="font-bold font-mono text-slate-900">{formatCurrency(StockEngine.getProductPriceForCompany(prod, currentCompany.id))}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grade / Lista de Itens do Pedido */}
      <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-700 flex items-center gap-1.5 uppercase text-[11px] tracking-wider">
            <ShoppingCart size={14} className="text-blue-600" />
            <span>Itens do Pedido ({cart.reduce((s, i) => s + i.quantity, 0)} itens)</span>
          </span>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
            >
              Limpar Pedido
            </button>
          )}
        </div>

        {cart.length === 0 ? (
          <div className="py-6 text-center text-slate-400 space-y-1 bg-white rounded-xl border border-dashed border-slate-200">
            <Package size={28} className="mx-auto text-slate-300" />
            <p className="text-xs font-bold text-slate-600">Nenhum produto adicionado ao pedido</p>
            <p className="text-[11px] text-slate-400">
              Utilize o campo de busca acima ou clique nas sugestões para adicionar os produtos.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto bg-white rounded-xl border border-slate-200 px-2">
            {cart.map((item) => (
              <div key={item.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 truncate flex items-center gap-1.5 flex-wrap">
                    <span>{item.description}</span>
                    {item.isMasterPack && (
                      <span className="inline-flex items-center gap-1 text-[9px] bg-amber-100 text-amber-900 font-extrabold px-1.5 py-0.2 rounded border border-amber-300">
                        <Boxes size={10} className="text-amber-700" />
                        Master ({item.masterPackUnits} un/{item.unit})
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                    {canAlterUnitPrice ? (
                      <button
                        type="button"
                        onClick={() => handleOpenItemDiscount(item, 'alterar_preco')}
                        className={`inline-flex items-center gap-1 px-1 py-0.2 rounded transition-colors cursor-pointer ${
                          item.priceOverridden
                            ? 'bg-indigo-100 text-indigo-900 font-bold border border-indigo-300'
                            : 'hover:bg-indigo-50 hover:text-indigo-800'
                        }`}
                        title="Clique para alterar o preço unitário deste item"
                      >
                        <span className="font-mono">{formatCurrency(item.unitPrice)}</span>
                        <Pencil size={10} />
                      </button>
                    ) : (
                      <span>{formatCurrency(item.unitPrice)}</span>
                    )}
                    <span>
                      x {item.quantity} {item.unit}
                    </span>
                    {item.discountValue > 0 && (
                      <span className="text-amber-700 font-bold">
                        (-{formatCurrency(item.discountValue)})
                      </span>
                    )}
                    {item.additionValue && item.additionValue > 0 && (
                      <span className="text-blue-700 font-bold">
                        (+{formatCurrency(item.additionValue)})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Controle de Quantidade */}
                  <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg">
                    <button
                      type="button"
                      onClick={() => handleUpdateQty(item.productId, -1)}
                      className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded-l cursor-pointer"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="w-6 text-center font-bold text-slate-900 font-mono text-xs">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateQty(item.productId, 1)}
                      className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded-r cursor-pointer"
                    >
                      <Plus size={11} />
                    </button>
                  </div>

                  {/* Ajuste (Desconto, Acréscimo ou Alterar Preço) por Item */}
                  <button
                    type="button"
                    onClick={() => handleOpenItemDiscount(item)}
                    className={`p-1 rounded cursor-pointer transition-colors ${
                      item.priceOverridden
                        ? 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300'
                        : item.additionValue && item.additionValue > 0
                        ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300'
                        : item.discountValue > 0
                        ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                        : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                    }`}
                    title={canAlterUnitPrice ? 'Desconto, Acréscimo ou Alterar Preço' : 'Desconto ou Acréscimo neste item'}
                  >
                    <Tag size={13} />
                  </button>

                  {/* Preço Total do Item */}
                  <span className="font-mono font-bold text-slate-900 min-w-[70px] text-right">
                    {formatCurrency(item.totalPrice)}
                  </span>

                  {/* Remover Item */}
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.productId)}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                    title="Remover"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Condições Comerciais: Forma de Pagamento, Parcelas, Desconto Geral (ou Resumo de Bonificação) */}
      <div className="pt-2 border-t border-slate-100 space-y-3">
        {isBonusMode ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-1">
              <span className="font-black text-sky-900 uppercase block text-[11px]">Natureza: Bonificação</span>
              <p className="text-sky-800 text-[11px]">
                Sem cobrança financeira (R$ 0,00) • Não gera Contas a Receber • Realiza saída de estoque por bonificação.
              </p>
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Motivo / Observações da Bonificação:</label>
              <input
                type="text"
                placeholder="Ex: Cortesia promocional, brinde para cliente..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              {/* Forma de Pagamento */}
              <div>
                <div className="mb-1">
                  <label className="block text-slate-700 font-bold">Forma de Pagto *</label>
                </div>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold text-xs text-slate-800 focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
                >
                  <option value="">Selecione a forma de pagamento...</option>
                  <option value="pix">Pix</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="boleto">Boleto Bancário</option>
                </select>
              </div>

              {/* Prazo de Pagamento */}
              <div>
                <div className="mb-1">
                  <label className="block text-slate-700 font-bold">Prazo de Pagto *</label>
                </div>
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold text-xs text-slate-800 focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
                >
                  <option value="">Selecione o prazo de pagamento...</option>
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
                          {installments > 1 ? `Parcelado (${installments}x de ${formatCurrency(orderFinalTotal / installments)})` : 'Parcelado (1x)'}
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

              {/* Se Boleto: Conta / Banco Emissor */}
              {paymentMethod === 'boleto' && (
                <div>
                  <label className="block text-amber-900 font-bold mb-1 flex items-center gap-1">
                    <Barcode size={12} className="text-amber-700" />
                    Conta / Banco do Boleto:
                  </label>
                  <select
                    value={selectedBoletoAccountId}
                    onChange={(e) => setSelectedBoletoAccountId(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded-xl p-2 font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500 shadow-2xs"
                  >
                    {Database.getBoletoAccounts(currentCompany.id).map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} {acc.bankCode ? `(${acc.bankCode})` : ''} - Ag: {acc.agency || '-'} C/C: {acc.accountNumber || '-'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Se Cartão ou Boleto: Parcelas */}
              {paymentMethod === 'cartao_credito' || paymentMethod === 'boleto' || paymentTerm === 'parcelado' || Database.resolvePaymentTermInfo(paymentTerm, installments).installmentsCount > 1 || installments > 1 ? (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    {paymentMethod === 'boleto' ? 'Parcelas Boleto:' : 'Parcelas:'}
                  </label>
                  <select
                    value={installments}
                    onChange={(e) => setInstallments(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-medium text-slate-800"
                  >
                    {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
                      <option key={n} value={n}>
                        {n}x de {formatCurrency(orderFinalTotal / n)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Observações da Entrega:</label>
                  <input
                    type="text"
                    placeholder="Ex: Entregar à tarde, nota na caixa..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs"
                  />
                </div>
              )}

              {/* Desconto Geral no Total */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-600 font-semibold text-xs">Desconto Geral:</label>
                  <div className="inline-flex rounded-md bg-slate-200/80 p-0.5 border border-slate-300">
                    <button
                      type="button"
                      onClick={() => handleDiscountTypeChange('percent')}
                      className={`px-2 py-0.5 text-xs font-bold rounded cursor-pointer transition-all ${
                        discountType === 'percent'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Percentual (%)"
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDiscountTypeChange('value')}
                      className={`px-2 py-0.5 text-xs font-bold rounded cursor-pointer transition-all ${
                        discountType === 'value'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Valor em Reais (R$)"
                    >
                      R$
                    </button>
                  </div>
                </div>

                <div className="relative flex items-center">
                  {discountType === 'value' && (
                    <span className="absolute left-2.5 text-xs font-bold text-slate-500">R$</span>
                  )}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder={
                      discountType === 'percent'
                        ? `Ex: 5 (Máx ${currentUser.permissions.maxDiscountPercent}%)`
                        : `Ex: 10,00 (Máx ${formatCurrency(maxAllowedVal)})`
                    }
                    className={`w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-medium text-right text-xs focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-emerald-500 ${
                      discountType === 'value' ? 'pl-8' : ''
                    }`}
                  />
                </div>
                {globalOrderDiscount > 0 && (
                  <div className="text-[10px] text-emerald-600 font-semibold mt-0.5 text-right">
                    {discountType === 'percent'
                      ? `Equivalente a -${formatCurrency(globalOrderDiscount)}`
                      : `Equivalente a ${effectiveGlobalDiscountPercent.toFixed(1).replace('.0', '')}%`}
                  </div>
                )}
              </div>
            </div>

            {paymentMethod === 'cartao_credito' && (
              <div>
                <label className="block text-slate-600 font-semibold text-xs mb-1">Observações da Entrega:</label>
                <input
                  type="text"
                  placeholder="Ex: Entregar à tarde, nota na caixa..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Resumo Financeiro & Botão de Confirmação */}
      <div className={`text-white p-3.5 sm:p-4 rounded-xl space-y-2 ${isBonusMode ? 'bg-gradient-to-r from-sky-950 via-blue-950 to-sky-950 border border-sky-700' : 'bg-slate-900'}`}>
        <div className="flex justify-between text-xs text-slate-300">
          <span>{isBonusMode ? 'Valor de Referência dos Produtos:' : 'Subtotal dos Produtos:'}</span>
          <span className="font-mono">{formatCurrency(grossSubtotal)}</span>
        </div>

        {!isBonusMode && totalDiscountAll > 0 && (
          <div className="flex justify-between text-xs text-rose-300">
            <span>Descontos Concedidos:</span>
            <span className="font-mono">-{formatCurrency(totalDiscountAll)}</span>
          </div>
        )}

        <div className={`flex items-center justify-between text-base sm:text-lg font-extrabold pt-2 border-t ${isBonusMode ? 'border-sky-800' : 'border-slate-800'}`}>
          <span className="uppercase text-xs sm:text-sm tracking-wider text-slate-300">
            {isBonusMode ? 'Total a Cobrar (Bonificação):' : 'Total do Pedido:'}
          </span>
          <span className={`font-mono text-xl sm:text-2xl ${isBonusMode ? 'text-sky-200' : 'text-emerald-400'}`}>
            {formatCurrency(isBonusMode ? 0 : orderFinalTotal)}
          </span>
        </div>
      </div>

      {/* Botão de Ação Principal */}
      <button
        type="button"
        disabled={cart.length === 0 || !selectedCustomerId || (!isBonusMode && (!paymentMethod || !paymentTerm))}
        onClick={handlePreFinalizeOrder}
        className={`w-full py-3.5 rounded-xl font-black text-sm text-white shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
          cart.length === 0 || !selectedCustomerId || (!isBonusMode && (!paymentMethod || !paymentTerm))
            ? 'bg-slate-300 opacity-60 cursor-not-allowed'
            : isBonusMode
            ? 'bg-sky-600 hover:bg-sky-700 active:scale-[0.99]'
            : docType === 'orcamento'
            ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99]'
            : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99]'
        }`}
      >
        {isBonusMode ? <Gift size={18} /> : <Send size={18} />}
        <span>
          {isBonusMode
            ? 'CONFIRMAR PEDIDO DE BONIFICAÇÃO'
            : docType === 'orcamento'
            ? 'GERAR E COMPARTILHAR ORÇAMENTO'
            : 'CONFIRMAR PEDIDO DE VENDA'}
        </span>
      </button>

      {/* Modal de Cadastro Completo de Cliente (com Endereço e Rota para Romaneio de Entrega) */}
      <FullCustomerModal
        isOpen={showQuickCustomerModal}
        onClose={() => setShowQuickCustomerModal(false)}
        onCustomerCreated={(newCust) => setSelectedCustomerId(newCust.id)}
      />

      {/* Modal de Ajuste (Desconto, Acréscimo ou Alterar Preço) por Item */}
      {showItemDiscountModal && discountingItemId && (() => {
        const target = cart.find((i) => i.id === discountingItemId);
        if (!target) return null;
        const targetProduct = dbState.products.find((p) => p.id === target.productId);
        const originalCatalogPrice = targetProduct
          ? StockEngine.getProductPriceForCompany(targetProduct, currentCompany.id)
          : target.originalUnitPrice ?? target.referenceUnitPrice ?? target.unitPrice;
        const isAlterPriceMode = itemAdjustmentMode === 'alterar_preco' && canAlterUnitPrice;
        const parsedRaw = Math.max(0, parseFloat(itemDiscountInput.replace(',', '.')) || 0);
        const previewSubtotal = isAlterPriceMode
          ? Math.round(target.quantity * parsedRaw * 100) / 100
          : itemAdjustmentMode === 'acrescimo'
          ? Math.round((target.quantity * target.unitPrice + (itemDiscountType === 'percent' ? (target.quantity * target.unitPrice * parsedRaw) / 100 : parsedRaw)) * 100) / 100
          : Math.max(0, Math.round((target.quantity * target.unitPrice - (itemDiscountType === 'percent' ? (target.quantity * target.unitPrice * parsedRaw) / 100 : parsedRaw)) * 100) / 100);

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-sm w-full p-4 space-y-3 shadow-xl border border-slate-200">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                  {isAlterPriceMode ? (
                    <Pencil size={16} className="text-indigo-600" />
                  ) : (
                    <Tag size={16} className={itemAdjustmentMode === 'acrescimo' ? 'text-blue-600' : 'text-amber-600'} />
                  )}
                  <span>
                    {isAlterPriceMode
                      ? 'Alterar Preço Unitário'
                      : itemAdjustmentMode === 'acrescimo'
                      ? 'Acréscimo no Produto'
                      : 'Desconto no Produto'}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowItemDiscountModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 space-y-0.5">
                  <div className="font-bold text-slate-900 truncate">{target.description}</div>
                  {isAlterPriceMode && (
                    <div className="flex justify-between text-[11px] text-indigo-700 font-semibold">
                      <span>Preço Original Cadastrado:</span>
                      <span className="font-mono font-bold">{formatCurrency(originalCatalogPrice)}</span>
                    </div>
                  )}
                </div>

                {/* Abas de Operação */}
                <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setItemAdjustmentMode('desconto');
                      setItemDiscountInput('');
                    }}
                    className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg cursor-pointer ${
                      itemAdjustmentMode === 'desconto' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Desconto (-)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setItemAdjustmentMode('acrescimo');
                      setItemDiscountInput('');
                    }}
                    className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg cursor-pointer ${
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
                        setItemDiscountType('value');
                        setItemDiscountInput(target.unitPrice.toFixed(2).replace('.', ','));
                      }}
                      className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg cursor-pointer ${
                        itemAdjustmentMode === 'alterar_preco' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600'
                      }`}
                    >
                      Alterar Preço
                    </button>
                  )}
                </div>

                {isAlterPriceMode ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-slate-700">Novo Preço Unitário (R$)</label>
                      {Math.abs(parsedRaw - originalCatalogPrice) > 0.005 && (
                        <button
                          type="button"
                          onClick={() => setItemDiscountInput(originalCatalogPrice.toFixed(2).replace('.', ','))}
                          className="text-[10px] font-bold text-indigo-700 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <RotateCcw size={10} />
                          Restaurar Original
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={itemDiscountInput}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setItemDiscountInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                      className="w-full bg-indigo-50/40 border-2 border-indigo-300 rounded-xl p-2.5 text-right font-mono font-black text-base"
                      autoFocus
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl">
                      <span className="font-bold text-slate-600">Tipo:</span>
                      <div className="inline-flex rounded-lg bg-slate-200 p-0.5">
                        <button
                          type="button"
                          onClick={() => setItemDiscountType('percent')}
                          className={`px-3 py-1 font-bold rounded-md cursor-pointer ${
                            itemDiscountType === 'percent'
                              ? itemAdjustmentMode === 'acrescimo' ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'
                              : 'text-slate-700'
                          }`}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemDiscountType('value')}
                          className={`px-3 py-1 font-bold rounded-md cursor-pointer ${
                            itemDiscountType === 'value'
                              ? itemAdjustmentMode === 'acrescimo' ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'
                              : 'text-slate-700'
                          }`}
                        >
                          R$
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        {itemAdjustmentMode === 'acrescimo' ? 'Valor do Acréscimo' : 'Valor do Desconto'}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder={itemDiscountType === 'percent' ? 'Ex: 10' : 'Ex: 15,00'}
                        value={itemDiscountInput}
                        onChange={(e) => setItemDiscountInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-right font-mono font-bold"
                        autoFocus
                      />
                    </div>
                  </>
                )}

                <div className="bg-slate-900 text-white rounded-xl p-2.5 flex justify-between items-center font-mono">
                  <span className="text-[11px] text-slate-300">Novo Subtotal do Item:</span>
                  <span className="text-sm font-black text-emerald-400">{formatCurrency(previewSubtotal)}</span>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowItemDiscountModal(false)}
                    className="px-3 py-1.5 border border-slate-200 rounded-xl text-slate-600 font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyItemDiscount}
                    className={`px-3 py-1.5 text-white rounded-xl font-bold shadow-xs cursor-pointer ${
                      isAlterPriceMode
                        ? 'bg-indigo-600 hover:bg-indigo-700'
                        : itemAdjustmentMode === 'acrescimo'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-amber-600 hover:bg-amber-700'
                    }`}
                  >
                    {isAlterPriceMode
                      ? 'Confirmar Novo Preço'
                      : itemAdjustmentMode === 'acrescimo'
                      ? 'Aplicar Acréscimo'
                      : 'Aplicar Desconto'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: TELA DE CONFIRMAÇÃO DA VENDA (NOME DO CLIENTE, TOTAL, FORMA E PRAZO DE PAGTO) */}
      <SaleConfirmationModal
        isOpen={showSaleConfirmationModal}
        onClose={() => {
          if (!isFinalizingOrder) setShowSaleConfirmationModal(false);
        }}
        onConfirm={handleFinalizeOrder}
        modality="Pedido de Venda"
        customerName={selectedCustomer ? selectedCustomer.name : 'Consumidor Final (Não Identificado)'}
        customerDocument={selectedCustomer?.cpfCnpj}
        customerPhone={selectedCustomer?.whatsapp || selectedCustomer?.phone}
        totalAmount={isBonusMode ? 0 : orderFinalTotal}
        paymentMethod={isBonusMode ? 'bonificacao' : paymentMethod || 'pix'}
        paymentTerm={isBonusMode ? 'Sem Cobrança (Bonificação)' : paymentTerm || 'a_vista'}
        installments={isBonusMode ? 0 : installments}
        itemsCount={cart.reduce((s, i) => s + i.quantity, 0)}
        companyName={currentCompany.tradeName || currentCompany.name}
        companyType={currentCompany.type}
        isSubmitting={isFinalizingOrder}
        isBonus={isBonusMode}
        referenceAmount={isBonusMode ? orderFinalTotal : undefined}
      />

      {/* Modal de Comprovante / Recibo do Pedido */}
      {showReceiptModal && completedOrder && (
        <ReceiptModal
          order={completedOrder}
          company={currentCompany}
          isOpen={showReceiptModal}
          onClose={() => {
            setShowReceiptModal(false);
            setCompletedOrder(null);
          }}
        />
      )}
    </div>
  );
};
