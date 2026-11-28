import React, { useState, useEffect, useRef } from 'react';
import {
  Barcode,
  Search,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  CreditCard,
  QrCode,
  User,
  AlertCircle,
  CheckCircle2,
  Printer,
  X,
  Lock,
  ArrowRight,
  Receipt,
  RotateCcw,
  Sparkles,
  FileText,
  Keyboard,
  Coins,
  Warehouse,
  ShoppingBag,
  ShoppingCart,
  UserPlus,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  Eye,
  EyeOff,
  TrendingUp,
  Smartphone,
  AlertTriangle,
  Scale,
  Calculator,
  Tag,
  Boxes,
  Clock,
  Ticket,
  Pencil,
  Loader2,
} from 'lucide-react';
import { Database } from '../../services/db';
import { FirebaseSyncService } from '../../services/firebaseSync';
import { Product, Customer, Order, OrderItem, CashRegister, DiscountAuthorizationRecord } from '../../types';
import { StockEngine } from '../../services/stockEngine';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { ReceiptModal } from '../common/ReceiptModal';
import { SaleConfirmationModal } from '../common/SaleConfirmationModal';
import { PriceLookupModal } from '../common/PriceLookupModal';
import { CashRegisterIcon } from '../common/icons/CashRegisterIcon';
import { toast } from '../../services/toast';
import { CustomerSearchCombobox } from '../orders/CustomerSearchCombobox';
import { PosQuickCustomerModal } from './PosQuickCustomerModal';
import { isBillableSaleOrder } from '../../utils/orderUtils';
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

export interface PosViewProps {
  isSidebarMinimized?: boolean;
  onToggleSidebarMinimize?: () => void;
  hideDashboardKpis?: boolean;
  onToggleDashboardKpis?: () => void;
  cart?: OrderItem[];
  setCart?: React.Dispatch<React.SetStateAction<OrderItem[]>>;
}

export const PosView: React.FC<PosViewProps> = ({
  isSidebarMinimized = false,
  onToggleSidebarMinimize,
  hideDashboardKpis: propHideDashboardKpis,
  onToggleDashboardKpis,
  cart: propCart,
  setCart: propSetCart,
}) => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();
  const canAlterUnitPrice = Database.canCurrentUserAlterUnitPrice(currentUser, 'pos');
  const unitPriceOverrideRole: 'admin' | 'gerente' | 'balconista' = Database.isAdmin(currentUser)
    ? 'admin'
    : Database.isGerente(currentUser)
    ? 'gerente'
    : 'balconista';

  const [internalHideKpis, setInternalHideKpis] = useState(true);
  const isKpisHidden = propHideDashboardKpis !== undefined ? propHideDashboardKpis : internalHideKpis;
  const toggleKpis = onToggleDashboardKpis || (() => setInternalHideKpis((prev) => !prev));

  // Escuta alterações do banco
  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  // Caixa ativo
  const activeCashRegister = dbState.cashRegisters.find(
    (c) => c.companyId === currentCompany.id && c.status === 'aberto'
  );

  // Estados do PDV (usa carrinho compartilhado com App para alertar perda de dados em navegação)
  const [internalCart, setInternalCart] = useState<OrderItem[]>([]);
  const cart = propCart !== undefined ? propCart : internalCart;
  const setCart = propSetCart || setInternalCart;
  const [barcodeInput, setBarcodeInput] = useState('');
  const [quantityInput, setQuantityInput] = useState<string>('1');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  // Tipo de desconto (% ou R$), persistido no localStorage para ser o padrão selecionado pelo usuário
  const [discountType, setDiscountType] = useState<'percent' | 'value'>(() => {
    return (localStorage.getItem('omni_discount_type') as 'percent' | 'value') || 'percent';
  });
  const [discountInput, setDiscountInput] = useState<string>('');

  const handleDiscountTypeChange = (newType: 'percent' | 'value') => {
    setDiscountType(newType);
    localStorage.setItem('omni_discount_type', newType);
  };

  const [paymentMethod, setPaymentMethod] = useState<'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito' | 'boleto' | 'crediario' | ''>('');
  const [paymentTerm, setPaymentTerm] = useState<string>('');
  const [showSaleConfirmationModal, setShowSaleConfirmationModal] = useState<boolean>(false);
  const [isFinalizingSale, setIsFinalizingSale] = useState<boolean>(false);
  const isFinalizingSaleRef = useRef<boolean>(false);
  const [selectedBoletoAccountId, setSelectedBoletoAccountId] = useState<string>(() => {
    const boletoMethod = Database.getPaymentMethods().find((m) => m.type === 'boleto');
    if (boletoMethod?.defaultAccountId) return boletoMethod.defaultAccountId;
    const boletoAccs = Database.getBoletoAccounts();
    return boletoAccs[0]?.id || '';
  });
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [installments, setInstallments] = useState<number>(1);
  const [selectedLocationId, setSelectedLocationId] = useState<string>(() => {
    const compLoc = StockEngine.getCompanyDefaultLocation(Database.getState().stockLocations, currentCompany.id);
    return compLoc?.id || 'loc-comercial';
  });

  // Garante que o PDV aponte para o depósito da empresa ativa
  useEffect(() => {
    const compLoc = StockEngine.getCompanyDefaultLocation(dbState.stockLocations, currentCompany.id);
    if (compLoc && compLoc.id !== selectedLocationId) {
      setSelectedLocationId(compLoc.id);
    }
  }, [currentCompany.id, dbState.stockLocations]);

  const [lastAddedItem, setLastAddedItem] = useState<OrderItem | null>(null);

  // Feedback sonoro e visual em tempo real para leitura de código de barras e digitação
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (feedbackMessage) {
      const timer = setTimeout(() => {
        setFeedbackMessage(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [feedbackMessage]);

  const playBeep = (type: 'success' | 'error' = 'success') => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1174.66, ctx.currentTime); // Tom agudo agradável (D6)
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime); // Tom grave de alerta
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.22);
      }
    } catch {
      // Ignora restrições do navegador se áudio não for permitido
    }
  };

  // Modais
  const [lastFinishedOrder, setLastFinishedOrder] = useState<Order | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showOpenRegisterModal, setShowOpenRegisterModal] = useState(false);
  const [openRegisterAmount, setOpenRegisterAmount] = useState('200,00');
  const [showProductLookupModal, setShowProductLookupModal] = useState(false);
  const [showPriceLookupModal, setShowPriceLookupModal] = useState(false);
  const [productLookupSearch, setProductLookupSearch] = useState('');
  const [showRecentSalesModal, setShowRecentSalesModal] = useState(false);

  // Modal de Cadastro Rápido de Cliente [F3]
  const [showQuickCustomerModal, setShowQuickCustomerModal] = useState(false);

  // Cancelamento de venda recente
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Controle de sessão e autorização obrigatória para desconto máximo por produto
  const saleSessionIdRef = useRef<string>(generateSaleSessionId('PDV'));
  const [discountAuthPrompt, setDiscountAuthPrompt] = useState<{
    violation: DiscountViolationDetails;
    queuePosition?: { current: number; total: number };
    onAuthorized: (record: DiscountAuthorizationRecord) => void;
    onReduceToLimit?: () => void;
  } | null>(null);

  // Edição rápida de preço unitário antes de incluir no cupom (somente Administrador Geral ou Gerente Geral)
  const [posPriceDrafts, setPosPriceDrafts] = useState<Record<string, string>>({});
  const [editingPosPriceId, setEditingPosPriceId] = useState<string | null>(null);
  const [stagedPosProductId, setStagedPosProductId] = useState<string>('');
  const [stagedPosUnitPriceInput, setStagedPosUnitPriceInput] = useState<string>('');
  const [isEditingStagedPosPrice, setIsEditingStagedPosPrice] = useState<boolean>(false);
  const stagedPosPriceInputRef = useRef<HTMLInputElement>(null);
  const posQtyInputRef = useRef<HTMLInputElement>(null);

  // Modal de Desconto / Acréscimo / Alteração de Preço por Produto
  const [showItemDiscountModal, setShowItemDiscountModal] = useState<boolean>(false);
  const [discountingItemId, setDiscountingItemId] = useState<string | null>(null);
  const [itemAdjustmentMode, setItemAdjustmentMode] = useState<'desconto' | 'acrescimo' | 'alterar_preco'>('desconto');
  const [itemDiscountType, setItemDiscountType] = useState<'percent' | 'value'>('percent');
  const [itemDiscountInput, setItemDiscountInput] = useState<string>('');
  const itemDiscountInputRef = useRef<HTMLInputElement>(null);

  const handleOpenItemDiscountModal = (
    item: OrderItem,
    initialMode?: 'desconto' | 'acrescimo' | 'alterar_preco'
  ) => {
    const resolvedMode: 'desconto' | 'acrescimo' | 'alterar_preco' =
      initialMode === 'alterar_preco' && canAlterUnitPrice
        ? 'alterar_preco'
        : initialMode === 'acrescimo'
        ? 'acrescimo'
        : initialMode === 'desconto'
        ? 'desconto'
        : (item.additionValue || 0) > 0 || (item.additionPercent || 0) > 0
        ? 'acrescimo'
        : item.priceOverridden && canAlterUnitPrice && !(item.discountValue > 0)
        ? 'alterar_preco'
        : 'desconto';

    setDiscountingItemId(item.productId);
    setItemAdjustmentMode(resolvedMode);

    if (resolvedMode === 'alterar_preco') {
      setItemDiscountType('value');
      setItemDiscountInput(item.unitPrice.toFixed(2).replace('.', ','));
    } else if (resolvedMode === 'acrescimo') {
      if ((item.additionPercent || 0) > 0) {
        setItemDiscountType('percent');
        setItemDiscountInput((item.additionPercent || 0).toFixed(2).replace(/\.?0+$/, '').replace('.', ','));
      } else if ((item.additionValue || 0) > 0) {
        setItemDiscountType('value');
        setItemDiscountInput((item.additionValue || 0).toFixed(2).replace('.', ','));
      } else {
        setItemDiscountType('percent');
        setItemDiscountInput('');
      }
    } else if (item.discountValue > 0 || item.discountPercent > 0) {
      if (item.discountPercent > 0) {
        setItemDiscountType('percent');
        setItemDiscountInput(item.discountPercent.toFixed(2).replace(/\.?0+$/, '').replace('.', ','));
      } else {
        setItemDiscountType('value');
        setItemDiscountInput(item.discountValue.toFixed(2).replace('.', ','));
      }
    } else {
      setItemDiscountType('percent');
      setItemDiscountInput('');
    }
    setShowItemDiscountModal(true);
    setTimeout(() => {
      itemDiscountInputRef.current?.focus();
      itemDiscountInputRef.current?.select();
    }, 50);
  };

  const commitItemDiscountUpdate = (
    productId: string,
    finalPercent: number,
    finalValue: number,
    authorization?: DiscountAuthorizationRecord | null,
    mode: 'desconto' | 'acrescimo' = 'desconto'
  ) => {
    const roundedPercent = Math.round(finalPercent * 100) / 100;
    const roundedValue = Math.round(finalValue * 100) / 100;

    setCart((prev) =>
      prev.map((i) => {
        if (i.productId !== productId) return i;
        const gross = i.quantity * i.unitPrice;
        const isAdd = mode === 'acrescimo';
        const nextTotal = isAdd
          ? Math.max(0, Math.round((gross + roundedValue) * 100) / 100)
          : Math.max(0, Math.round((gross - roundedValue) * 100) / 100);
        if (
          i.discountAuthorization?.operationId &&
          (isAdd || i.discountAuthorization.operationId !== authorization?.operationId)
        ) {
          revokeDiscountAuthorization(i.discountAuthorization.operationId);
        }
        return {
          ...i,
          discountPercent: isAdd ? 0 : roundedPercent,
          discountValue: isAdd ? 0 : roundedValue,
          additionPercent: isAdd ? roundedPercent : 0,
          additionValue: isAdd ? roundedValue : 0,
          totalPrice: nextTotal,
          discountAuthorization: isAdd ? undefined : authorization || undefined,
        };
      })
    );

    if (lastAddedItem && lastAddedItem.productId === productId) {
      const gross = lastAddedItem.quantity * lastAddedItem.unitPrice;
      const isAdd = mode === 'acrescimo';
      setLastAddedItem({
        ...lastAddedItem,
        discountPercent: isAdd ? 0 : roundedPercent,
        discountValue: isAdd ? 0 : roundedValue,
        additionPercent: isAdd ? roundedPercent : 0,
        additionValue: isAdd ? roundedValue : 0,
        totalPrice: isAdd
          ? Math.max(0, Math.round((gross + roundedValue) * 100) / 100)
          : Math.max(0, Math.round((gross - roundedValue) * 100) / 100),
        discountAuthorization: isAdd ? undefined : authorization || undefined,
      });
    }

    setShowItemDiscountModal(false);
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  const commitItemUnitPriceOverride = (productId: string, newUnitPrice: number) => {
    if (!canAlterUnitPrice) {
      toast.error(
        'Você não possui permissão para alterar o preço unitário no PDV Balcão. Solicite liberação ao Administrador.',
        'Acesso Negado'
      );
      return;
    }

    const roundedPrice = Math.round(newUnitPrice * 100) / 100;
    if (isNaN(roundedPrice) || roundedPrice <= 0) {
      toast.warning('Informe um preço unitário válido maior que zero.', 'Preço Inválido');
      return;
    }

    const product = dbState.products.find((p) => p.id === productId);
    const catalogPrice = product
      ? StockEngine.getProductPriceForCompany(product, currentCompany.id)
      : undefined;

    setCart((prev) =>
      prev.map((i) => {
        if (i.productId !== productId) return i;
        if (i.discountAuthorization?.operationId) {
          revokeDiscountAuthorization(i.discountAuthorization.operationId);
        }
        const origPrice = i.originalUnitPrice ?? catalogPrice ?? i.unitPrice;
        const isOverridden = Math.abs(roundedPrice - origPrice) > 0.004;
        const nextTotal = Math.round(i.quantity * roundedPrice * 100) / 100;
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
          totalPrice: nextTotal,
          discountAuthorization: undefined,
        };
      })
    );

    if (lastAddedItem && lastAddedItem.productId === productId) {
      const origPrice = lastAddedItem.originalUnitPrice ?? catalogPrice ?? lastAddedItem.unitPrice;
      const isOverridden = Math.abs(roundedPrice - origPrice) > 0.004;
      setLastAddedItem({
        ...lastAddedItem,
        unitPrice: roundedPrice,
        referenceUnitPrice: roundedPrice,
        originalUnitPrice: origPrice,
        priceOverridden: isOverridden,
        priceOverriddenByRole: isOverridden ? unitPriceOverrideRole : undefined,
        discountPercent: 0,
        discountValue: 0,
        additionPercent: 0,
        additionValue: 0,
        totalPrice: Math.round(lastAddedItem.quantity * roundedPrice * 100) / 100,
        discountAuthorization: undefined,
      });
    }

    setShowItemDiscountModal(false);
    toast.success(`Preço unitário alterado para ${formatCurrency(roundedPrice)} nesta venda.`, 'Preço Atualizado');
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  const handleApplyItemDiscount = () => {
    if (!discountingItemId) return;
    const targetItem = cart.find((i) => i.productId === discountingItemId);
    if (!targetItem) {
      setShowItemDiscountModal(false);
      return;
    }

    const rawNum = Math.max(0, parseFloat(itemDiscountInput.replace(',', '.')) || 0);

    // Modo 3: Alteração Direta de Preço Unitário (Admin, Gerente Geral ou Balconista autorizado no PDV Balcão)
    if (itemAdjustmentMode === 'alterar_preco') {
      if (!canAlterUnitPrice) {
        toast.error(
          'Você não possui permissão para alterar o preço unitário no PDV Balcão. Solicite liberação ao Administrador.',
          'Permissão Restrita'
        );
        return;
      }
      if (rawNum <= 0) {
        toast.warning('Informe um preço unitário válido maior que zero.', 'Preço Inválido');
        return;
      }
      commitItemUnitPriceOverride(targetItem.productId, rawNum);
      return;
    }

    const product = dbState.products.find((p) => p.id === targetItem.productId);
    const gross = targetItem.quantity * targetItem.unitPrice;

    // Modo 2: Acréscimo (+)
    if (itemAdjustmentMode === 'acrescimo') {
      let finalPercent = 0;
      let finalValue = 0;
      if (rawNum > 0) {
        if (itemDiscountType === 'percent') {
          finalPercent = rawNum;
          finalValue = (gross * finalPercent) / 100;
        } else {
          finalValue = rawNum;
          finalPercent = gross > 0 ? (finalValue / gross) * 100 : 0;
        }
      }
      commitItemDiscountUpdate(targetItem.productId, finalPercent, finalValue, null, 'acrescimo');
      return;
    }

    // Modo 1: Desconto (-)
    const maxPercent = currentUser.permissions.maxDiscountPercent;

    let finalPercent = 0;
    let finalValue = 0;
    let explicitPercentRequested: number | undefined;

    if (rawNum <= 0) {
      finalPercent = 0;
      finalValue = 0;
    } else if (itemDiscountType === 'percent') {
      if (!product?.maxDiscountEnabled && rawNum > maxPercent) {
        alert(`O desconto informado (${rawNum}%) excede o limite máximo permitido de ${maxPercent}% para seu perfil.`);
        return;
      }
      finalPercent = Math.min(100, rawNum);
      finalValue = (gross * finalPercent) / 100;
      explicitPercentRequested = finalPercent;
    } else {
      const maxVal = (gross * maxPercent) / 100;
      if (!product?.maxDiscountEnabled && rawNum > maxVal) {
        alert(`O desconto informado (${formatCurrency(rawNum)}) excede o limite máximo permitido de ${maxPercent}% (${formatCurrency(maxVal)}).`);
        return;
      }
      finalValue = Math.min(gross, rawNum);
      finalPercent = gross > 0 ? (finalValue / gross) * 100 : 0;
    }

    if (product?.maxDiscountEnabled) {
      const evaluation = evaluateItemMaxDiscount({
        product,
        companyId: currentCompany.id,
        origin: 'pdv',
        quantity: targetItem.quantity,
        unitPrice: targetItem.unitPrice,
        referenceUnitPrice: targetItem.referenceUnitPrice,
        priceOverridden: targetItem.priceOverridden,
        priceOverriddenByRole: targetItem.priceOverriddenByRole,
        itemDiscountValue: finalValue,
        itemDiscountPercent: finalPercent,
        explicitPercentRequested,
        existingAuthorization: targetItem.discountAuthorization || null,
        saleSessionId: saleSessionIdRef.current,
        users: dbState.users,
      });

      if (evaluation.requiresAuthorization && evaluation.violation) {
        setDiscountAuthPrompt({
          violation: evaluation.violation,
          onAuthorized: (record) => {
            setDiscountAuthPrompt(null);
            commitItemDiscountUpdate(targetItem.productId, finalPercent, finalValue, record, 'desconto');
            toast.success(
              `Desconto autorizado por ${record.authorizerUserName} para "${product.description}".`,
              'Autorização Concedida'
            );
          },
          onReduceToLimit: () => {
            setDiscountAuthPrompt(null);
            commitItemDiscountUpdate(
              targetItem.productId,
              evaluation.maxDiscountPercentAllowed,
              evaluation.maxDiscountValueAllowed,
              null,
              'desconto'
            );
            toast.info(
              `Desconto ajustado para o limite permitido do produto (${evaluation.maxDiscountPercentAllowed.toFixed(2)}% / ${formatCurrency(evaluation.maxDiscountValueAllowed)}).`,
              'Desconto Ajustado ao Limite'
            );
          },
        });
        return;
      }

      if (evaluation.exceeded && evaluation.authorized && targetItem.discountAuthorization) {
        commitItemDiscountUpdate(targetItem.productId, finalPercent, finalValue, targetItem.discountAuthorization, 'desconto');
        return;
      }

      // Dentro do limite: remove eventual autorização anterior
      commitItemDiscountUpdate(targetItem.productId, finalPercent, finalValue, null, 'desconto');
      return;
    }

    commitItemDiscountUpdate(targetItem.productId, finalPercent, finalValue, null, 'desconto');
  };

  const handleRemoveItemDiscount = () => {
    if (!discountingItemId) return;
    commitItemDiscountUpdate(discountingItemId, 0, 0, null, 'desconto');
  };

  // Modal de Quantidade Fracionada [F12] (até 3 casas decimais com recálculo automático do Total Líquido)
  const [showFractionalQtyModal, setShowFractionalQtyModal] = useState<boolean>(false);
  const [fractionalProductId, setFractionalProductId] = useState<string>('');
  const [fractionalQtyInput, setFractionalQtyInput] = useState<string>('1,000');
  const fractionalInputRef = useRef<HTMLInputElement>(null);

  const handleOpenFractionalModal = (targetProductId?: string) => {
    if (targetProductId) {
      setFractionalProductId(targetProductId);
      const item = cart.find((i) => i.productId === targetProductId);
      if (item) {
        setFractionalQtyInput(item.quantity.toFixed(3).replace('.', ','));
      }
    } else if (cart.length > 0) {
      const targetId = lastAddedItem?.productId || cart[cart.length - 1].productId;
      setFractionalProductId(targetId);
      const item = cart.find((i) => i.productId === targetId);
      if (item) {
        setFractionalQtyInput(item.quantity.toFixed(3).replace('.', ','));
      }
    } else {
      setFractionalProductId('');
      const currentMultiplier = parseFloat((quantityInput || '1').replace(',', '.')) || 1;
      setFractionalQtyInput(currentMultiplier.toFixed(3).replace('.', ','));
    }
    setShowFractionalQtyModal(true);
    setTimeout(() => {
      fractionalInputRef.current?.focus();
      fractionalInputRef.current?.select();
    }, 50);
  };

  const handleQtyInputChange = (val: string) => {
    // Permite dígitos e apenas uma vírgula ou ponto, com até 3 casas decimais
    const sanitized = val.replace(/[^0-9,\.]/g, '');
    const parts = sanitized.split(/[,\.]/);
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 3) {
      setFractionalQtyInput(`${parts[0]},${parts[1].slice(0, 3)}`);
      return;
    }
    setFractionalQtyInput(sanitized);
  };

  const handleAddFraction = (delta: number) => {
    const current = parseFloat(fractionalQtyInput.replace(',', '.')) || 0;
    const next = Math.max(0.001, Math.round((current + delta) * 1000) / 1000);
    setFractionalQtyInput(next.toFixed(3).replace('.', ','));
  };

  const handleSetPreset = (val: number) => {
    setFractionalQtyInput(val.toFixed(3).replace('.', ','));
  };

  const handleConfirmFractionalQty = () => {
    const rawVal = fractionalQtyInput.replace(',', '.');
    const parsedQty = parseFloat(rawVal);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      alert('Informe uma quantidade válida maior que zero.');
      return;
    }
    // Arredonda para até 3 casas decimais após a vírgula
    const roundedQty = Math.round(parsedQty * 1000) / 1000;

    if (fractionalProductId) {
      const bal = StockEngine.getBalance(dbState.stockBalances, fractionalProductId, selectedLocationId);
      if (bal && bal.quantity !== undefined && roundedQty > bal.quantity) {
        const proceed = confirm(
          `Atenção: A quantidade informada (${roundedQty.toFixed(3).replace('.', ',')}) é superior ao saldo em estoque atual (${bal.quantity.toFixed(3).replace('.', ',')}). Deseja prosseguir com a venda mesmo assim?`
        );
        if (!proceed) return;
      }
      setCart((prev) =>
        prev.map((item) => {
          if (item.productId === fractionalProductId) {
            if (item.discountAuthorization?.operationId && Math.abs(item.quantity - roundedQty) > 0.0005) {
              revokeDiscountAuthorization(item.discountAuthorization.operationId);
            }
            const gross = roundedQty * item.unitPrice;
            const discVal = (gross * (item.discountPercent || 0)) / 100;
            const addVal = (gross * (item.additionPercent || 0)) / 100;
            return {
              ...item,
              quantity: roundedQty,
              discountValue: Math.round(discVal * 100) / 100,
              additionValue: Math.round(addVal * 100) / 100,
              totalPrice: Math.round((gross + addVal - discVal) * 100) / 100,
              discountAuthorization:
                Math.abs(item.quantity - roundedQty) > 0.0005 ? undefined : item.discountAuthorization,
            };
          }
          return item;
        })
      );
      if (lastAddedItem && lastAddedItem.productId === fractionalProductId) {
        const gross = roundedQty * lastAddedItem.unitPrice;
        const discVal = (gross * (lastAddedItem.discountPercent || 0)) / 100;
        const addVal = (gross * (lastAddedItem.additionPercent || 0)) / 100;
        setLastAddedItem({
          ...lastAddedItem,
          quantity: roundedQty,
          discountValue: Math.round(discVal * 100) / 100,
          additionValue: Math.round(addVal * 100) / 100,
          totalPrice: Math.round((gross + addVal - discVal) * 100) / 100,
          discountAuthorization:
            Math.abs(lastAddedItem.quantity - roundedQty) > 0.0005
              ? undefined
              : lastAddedItem.discountAuthorization,
        });
      }
    } else {
      setQuantityInput(roundedQty.toString().replace('.', ','));
    }

    setShowFractionalQtyModal(false);
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const discountInputRef = useRef<HTMLInputElement>(null);
  const customerSelectRef = useRef<HTMLInputElement>(null);

  // Clientes
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

  useEffect(() => {
    if (!selectedCustomerId || selectedCustomerId === 'consumidor_final') {
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
    const activeCust =
      selectedCustomerId && selectedCustomerId !== 'consumidor_final' ? selectedCustomer : undefined;
    const sig = activeCust
      ? `${activeCust.id}|${activeCust.showSaleAlert ? '1' : '0'}|${String(activeCust.notes ?? '').trim()}`
      : '';
    if (lastObservationCustomerSigRef.current === sig) return;
    lastObservationCustomerSigRef.current = sig;
    setSaleObservationAlerts((prev) => syncCustomerSaleAlert(prev, activeCust));
  }, [selectedCustomerId, selectedCustomer?.id, selectedCustomer?.showSaleAlert, selectedCustomer?.notes, selectedCustomer?.name]);

  // Locais de estoque vinculados à empresa ativa (priorizando Comercial no topo da lista)
  const locations = [...dbState.stockLocations]
    .filter((l) => l.status === 'ativo' && (!l.companyId || l.companyId === currentCompany.id))
    .sort((a, b) => {
      const isACom = a.id === 'loc-comercial' || a.type === 'comercial' || a.name.toLowerCase().includes('comercial');
      const isBCom = b.id === 'loc-comercial' || b.type === 'comercial' || b.name.toLowerCase().includes('comercial');
      if (isACom && !isBCom) return -1;
      if (!isACom && isBCom) return 1;
      return 0;
    });

  // Autocomplete de produtos conforme digitação (só lista produtos a partir do 3º caractere digitado)
  const searchResults =
    barcodeInput.trim().length >= 3
      ? dbState.products.filter(
          (p) =>
            p.status === 'ativo' &&
            StockEngine.getProductPriceForCompany(p, currentCompany.id) > 0 &&
            (p.description.toLowerCase().includes(barcodeInput.toLowerCase().trim()) ||
              p.code.toLowerCase().includes(barcodeInput.toLowerCase().trim()) ||
              (p.barcode && p.barcode.includes(barcodeInput.trim())))
        )
      : [];

  // Produtos para a busca F2 (tabela de preço da empresa ativa)
  const lookupFilteredProducts = dbState.products.filter(
    (p) =>
      p.status === 'ativo' &&
      StockEngine.getProductPriceForCompany(p, currentCompany.id) > 0 &&
      (productLookupSearch === '' ||
        p.description.toLowerCase().includes(productLookupSearch.toLowerCase()) ||
        p.code.toLowerCase().includes(productLookupSearch.toLowerCase()) ||
        p.barcode.includes(productLookupSearch))
  );

  // Métricas do Dashboard Informativo (Faturamento Vendas, Canais de Venda, Previsões Financeiras, Estoque Crítico)
  const companyOrders = dbState.orders.filter(
    (o) => (!o.companyId || o.companyId === currentCompany.id) && isBillableSaleOrder(o)
  );
  const totalRevenue = companyOrders.reduce((s, o) => s + o.total, 0);
  const avgTicket = companyOrders.length > 0 ? totalRevenue / companyOrders.length : 0;
  const pdvSales = companyOrders.filter((o) => o.origin === 'pdv');
  const externalSales = companyOrders.filter((o) => o.origin === 'externa_celular');
  const backofficeSales = companyOrders.filter((o) => o.origin !== 'pdv' && o.origin !== 'externa_celular');

  const openReceivables = dbState.accountsReceivable
    .filter((r) => r.companyId === currentCompany.id && r.status !== 'recebido' && r.status !== 'cancelado')
    .reduce((s, r) => s + r.balance, 0);

  const openPayables = dbState.accountsPayable
    .filter((p) => p.companyId === currentCompany.id && p.status !== 'pago' && p.status !== 'cancelado')
    .reduce((s, p) => s + p.balance, 0);

  const lowStockProducts = dbState.products.filter((p) => {
    if (p.status !== 'ativo') return false;
    const effectiveMinStock = p.companyPrices?.[currentCompany.id]?.minStock ?? p.minStock ?? 0;
    const stock = StockEngine.getTotalProductStock(
      dbState.stockBalances,
      p.id,
      dbState.products,
      currentCompany.id
    );
    return stock.available < effectiveMinStock;
  });

  // Busca inteligente de produto por Código Interno, Código de Barras (EAN), variação sem pontuação ou Descrição
  const findProductByCodeOrBarcode = (query: string): Product | null => {
    const clean = query.trim();
    if (!clean) return null;

    const cleanUpper = clean.toUpperCase();
    const cleanDigits = clean.replace(/\D/g, '');
    const cleanAlphanumeric = clean.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    // Permite buscar todos os produtos ativos do catálogo
    const activeProducts = dbState.products.filter((p) => p.status === 'ativo');

    // 1. Código de barras exato (EAN-13, EAN-8, Code 128)
    let found = activeProducts.find((p) => p.barcode && p.barcode.trim() === clean);
    if (found) return found;

    // 2. Código de barras numérico (sem formatação ou espaços)
    if (cleanDigits.length >= 4) {
      found = activeProducts.find(
        (p) => p.barcode && p.barcode.replace(/\D/g, '') === cleanDigits
      );
      if (found) return found;
    }

    // 3. Código interno do produto exato (case-insensitive) - ex: "PA-301" ou "pa-301"
    found = activeProducts.find((p) => p.code && p.code.trim().toUpperCase() === cleanUpper);
    if (found) return found;

    // 4. Código interno alfanumérico (sem hífens, pontos, espaços) - ex: "PA301" para "PA-301"
    found = activeProducts.find(
      (p) => p.code && p.code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === cleanAlphanumeric
    );
    if (found) return found;

    // 5. Código numérico simplificado - ex: digitou "301" e o produto é "PA-301"
    if (cleanDigits.length >= 2) {
      found = activeProducts.find((p) => {
        const codeDigits = p.code.replace(/\D/g, '');
        return codeDigits === cleanDigits || p.code.toUpperCase().endsWith('-' + cleanDigits);
      });
      if (found) return found;
    }

    // 6. Prefixo comum PA- com número digitado - ex: "301" -> "PA-301"
    found = activeProducts.find((p) => p.code.toUpperCase() === `PA-${cleanUpper}`);
    if (found) return found;

    // 7. Descrição idêntica (case-insensitive)
    found = activeProducts.find(
      (p) => p.description && p.description.trim().toLowerCase() === clean.toLowerCase()
    );
    if (found) return found;

    // 8. Busca parcial no catálogo ativo
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

  // Adicionar produto ao carrinho e contar 1 unidade (ou quantidade especificada)
  const handleAddToCart = (product: Product, quantityToAdd: number = 1, customUnitPriceOverride?: number) => {
    if (quantityToAdd <= 0) quantityToAdd = 1;

    const stockBalance = StockEngine.getBalance(dbState.stockBalances, product.id, selectedLocationId);
    const existingInCart = cart.find((i) => i.productId === product.id);
    const currentCartQty = existingInCart ? existingInCart.quantity : 0;
    const requestedTotal = currentCartQty + quantityToAdd;

    const catalogPrice = StockEngine.getProductPriceForCompany(product, currentCompany.id);
    const effectiveCost = StockEngine.getProductCostForCompany(product, currentCompany.id);
    const hasAuthorizedOverride =
      canAlterUnitPrice &&
      customUnitPriceOverride !== undefined &&
      !isNaN(customUnitPriceOverride) &&
      customUnitPriceOverride > 0 &&
      Math.abs(customUnitPriceOverride - catalogPrice) > 0.004;
    const finalInitialUnitPrice = hasAuthorizedOverride
      ? Math.round(customUnitPriceOverride! * 100) / 100
      : catalogPrice;

    // Avisa se o saldo for menor, mas não bloqueia a venda no balcão da loja física
    if (stockBalance.quantity < requestedTotal) {
      setFeedbackMessage({
        type: 'warning',
        text: `Atenção: Saldo de "${product.description}" no estoque local é de ${stockBalance.quantity} ${product.unit}. Venda liberada no balcão.`,
      });
    }

    let updatedCart: OrderItem[];
    let affectedItem: OrderItem;

    if (existingInCart) {
      if (existingInCart.discountAuthorization?.operationId) {
        revokeDiscountAuthorization(existingInCart.discountAuthorization.operationId);
      }
      const newQty = existingInCart.quantity + quantityToAdd;
      const nextUnitPrice = hasAuthorizedOverride ? finalInitialUnitPrice : existingInCart.unitPrice;
      const newGross = newQty * nextUnitPrice;
      const newDiscPct = hasAuthorizedOverride ? 0 : (existingInCart.discountPercent || 0);
      const newAddPct = hasAuthorizedOverride ? 0 : (existingInCart.additionPercent || 0);
      const newDiscVal = (newGross * newDiscPct) / 100;
      const newAddVal = (newGross * newAddPct) / 100;
      affectedItem = {
        ...existingInCart,
        quantity: newQty,
        unitPrice: nextUnitPrice,
        referenceUnitPrice: hasAuthorizedOverride ? nextUnitPrice : existingInCart.referenceUnitPrice,
        originalUnitPrice: existingInCart.originalUnitPrice ?? catalogPrice,
        priceOverridden: hasAuthorizedOverride ? true : existingInCart.priceOverridden,
        priceOverriddenByRole: hasAuthorizedOverride ? unitPriceOverrideRole : existingInCart.priceOverriddenByRole,
        discountPercent: newDiscPct,
        discountValue: Math.round(newDiscVal * 100) / 100,
        additionPercent: newAddPct,
        additionValue: Math.round(newAddVal * 100) / 100,
        totalPrice: Math.round((newGross + newAddVal - newDiscVal) * 100) / 100,
        discountAuthorization: undefined,
      };
      updatedCart = cart.map((item) => (item.productId === product.id ? affectedItem : item));
    } else {
      affectedItem = {
        id: 'ITEM-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
        productId: product.id,
        productCode: product.code,
        description: product.description,
        unit: product.unit,
        quantity: quantityToAdd,
        unitPrice: finalInitialUnitPrice,
        referenceUnitPrice: finalInitialUnitPrice,
        originalUnitPrice: catalogPrice,
        priceOverridden: hasAuthorizedOverride ? true : undefined,
        priceOverriddenByRole: hasAuthorizedOverride ? unitPriceOverrideRole : undefined,
        discountPercent: 0,
        discountValue: 0,
        additionPercent: 0,
        additionValue: 0,
        totalPrice: Math.round(quantityToAdd * finalInitialUnitPrice * 100) / 100,
        unitCost: effectiveCost,
        locationId: selectedLocationId,
        isMasterPack: product.isMasterPack,
        masterPackUnits: product.masterPackUnits,
        masterPackAssociatedProductId: product.masterPackAssociatedProductId,
        masterPackAssociatedProductCode: product.masterPackAssociatedProductCode,
      };
      updatedCart = [...cart, affectedItem];
    }

    setCart(updatedCart);
    setLastAddedItem(affectedItem);
    setBarcodeInput('');
    setQuantityInput('1');
    setEditingPosPriceId(null);
    setPosPriceDrafts((prev) => {
      if (!(product.id in prev)) return prev;
      const next = { ...prev };
      delete next[product.id];
      return next;
    });

    const prodObsAlert = getProductSaleAlert(product);
    if (prodObsAlert) {
      setSaleObservationAlerts((prev) => upsertSaleAlert(prev, prodObsAlert));
    }

    playBeep('success');

    setFeedbackMessage({
      type: 'success',
      text: `✓ +${quantityToAdd} ${product.unit}: "${product.description}" inserido! (${formatQuantity(affectedItem.quantity, 3)} ${product.unit} no cupom)`,
    });

    setTimeout(() => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    }, 20);
  };

  const handleSelectStagedPosProduct = (product: Product) => {
    setStagedPosProductId(product.id);
    setBarcodeInput('');
    setStagedPosUnitPriceInput('');
    setIsEditingStagedPosPrice(false);
    setQuantityInput('1');
    setTimeout(() => {
      posQtyInputRef.current?.focus();
      posQtyInputRef.current?.select();
    }, 20);
  };

  const handleCommitStagedPosProduct = () => {
    if (!stagedPosProductId) return;
    const prod = dbState.products.find((p) => p.id === stagedPosProductId);
    if (!prod) {
      setStagedPosProductId('');
      return;
    }
    const qty = Math.max(0.001, parseFloat((quantityInput || '1').replace(',', '.')) || 1);
    const parsedPrice = parseFloat(stagedPosUnitPriceInput.replace(',', '.'));
    const customPrice =
      canAlterUnitPrice && stagedPosUnitPriceInput.trim() !== '' && Number.isFinite(parsedPrice) && parsedPrice > 0
        ? parsedPrice
        : undefined;

    handleAddToCart(prod, qty, customPrice);
    setStagedPosProductId('');
    setStagedPosUnitPriceInput('');
    setIsEditingStagedPosPrice(false);
  };

  // Processa leitura de código de barras ou digitação do código do produto
  const handleProcessBarcodeOrCode = (rawQuery: string, forcedQty?: number) => {
    const query = (rawQuery || barcodeInput).trim();
    if (!query) {
      if (stagedPosProductId) {
        handleCommitStagedPosProduct();
      }
      return;
    }

    let qty = 1;
    let cleanCode = query;
    const hasMultiplier = query.includes('*');

    // Suporte para quantidade multiplicadora no formato: "2*PA-301" ou "3*789..."
    if (hasMultiplier) {
      const parts = query.split('*');
      const parsedQty = parseFloat(parts[0].replace(',', '.'));
      if (!isNaN(parsedQty) && parsedQty > 0) {
        qty = parsedQty;
        cleanCode = parts[1].trim();
      }
    } else if (forcedQty !== undefined && forcedQty > 0) {
      qty = forcedQty;
    } else {
      const currentMultiplier = parseFloat((quantityInput || '1').replace(',', '.'));
      if (!isNaN(currentMultiplier) && currentMultiplier > 0) {
        qty = currentMultiplier;
      } else {
        qty = 1;
      }
    }

    const matched = findProductByCodeOrBarcode(cleanCode);

    if (matched) {
      const isExactBarcodeScan = Boolean(matched.barcode && matched.barcode.trim() === cleanCode);
      if (isExactBarcodeScan || hasMultiplier) {
        handleAddToCart(matched, qty);
      } else {
        handleSelectStagedPosProduct(matched);
      }
    } else {
      playBeep('error');
      setFeedbackMessage({
        type: 'error',
        text: `Produto com código ou barras "${cleanCode}" não foi encontrado no cadastro.`,
      });
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
        barcodeInputRef.current.select();
      }
    }
  };

  // Entrada pelo campo de leitor / código ao teclar Enter
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (stagedPosProductId && !barcodeInput.trim()) {
      handleCommitStagedPosProduct();
      return;
    }
    handleProcessBarcodeOrCode(barcodeInput);
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) {
              revokeDiscountAuthorization(item.discountAuthorization?.operationId);
              return null;
            }

            const bal = StockEngine.getBalance(dbState.stockBalances, productId, selectedLocationId);
            if (newQty > bal.quantity) {
              alert(`Quantidade solicitada (${newQty}) excede o saldo disponível (${bal.quantity}).`);
              return item;
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

  const handleSetDirectQuantity = (productId: string, qty: number) => {
    if (isNaN(qty) || qty <= 0) return;
    const bal = StockEngine.getBalance(dbState.stockBalances, productId, selectedLocationId);
    if (qty > bal.quantity) {
      alert(`Quantidade solicitada (${qty}) excede o saldo disponível (${bal.quantity}).`);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          if (item.discountAuthorization?.operationId && Math.abs(item.quantity - qty) > 0.0005) {
            revokeDiscountAuthorization(item.discountAuthorization.operationId);
          }
          const gross = qty * item.unitPrice;
          const discVal = (gross * (item.discountPercent || 0)) / 100;
          const addVal = (gross * (item.additionPercent || 0)) / 100;
          return {
            ...item,
            quantity: qty,
            discountValue: Math.round(discVal * 100) / 100,
            additionValue: Math.round(addVal * 100) / 100,
            totalPrice: Math.round((gross + addVal - discVal) * 100) / 100,
            discountAuthorization:
              Math.abs(item.quantity - qty) > 0.0005 ? undefined : item.discountAuthorization,
          };
        }
        return item;
      })
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    const removed = cart.find((i) => i.productId === productId);
    if (removed?.discountAuthorization?.operationId) {
      revokeDiscountAuthorization(removed.discountAuthorization.operationId);
    }
    setCart(cart.filter((i) => i.productId !== productId));
  };

  const handleClearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm('Deseja realmente limpar todos os itens da venda atual?')) {
      clearSaleSessionAuthorizations(saleSessionIdRef.current);
      saleSessionIdRef.current = generateSaleSessionId('PDV');
      setCart([]);
      setDiscountInput('');
      setReceivedAmount('');
      setLastAddedItem(null);
      setStagedPosProductId('');
      setStagedPosUnitPriceInput('');
      setIsEditingStagedPosPrice(false);
      setSaleObservationAlerts((prev) => clearProductSaleAlerts(prev));
      if (barcodeInputRef.current) barcodeInputRef.current.focus();
    }
  };

  // Cálculos do Carrinho com suporte a Desconto por Produto e Desconto Geral no Pedido [F4]
  const grossSubtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalItemDiscounts = cart.reduce((sum, item) => sum + (item.discountValue || 0), 0);
  const subtotalAfterItemDiscounts = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const subtotal = grossSubtotal;

  const parsedDiscountNum = Math.max(0, parseFloat(discountInput.replace(',', '.')) || 0);
  const maxAllowedDiscountPercent = currentUser.permissions.maxDiscountPercent;
  const maxAllowedDiscountVal = (subtotalAfterItemDiscounts * maxAllowedDiscountPercent) / 100;

  let discountVal = 0;
  if (discountType === 'percent') {
    const safePercent = Math.min(maxAllowedDiscountPercent, parsedDiscountNum);
    discountVal = (subtotalAfterItemDiscounts * safePercent) / 100;
  } else {
    // Modo R$
    discountVal = Math.min(subtotalAfterItemDiscounts, parsedDiscountNum);
  }
  const effectiveDiscountPercent = subtotalAfterItemDiscounts > 0 ? (discountVal / subtotalAfterItemDiscounts) * 100 : 0;
  const total = Math.max(0, subtotalAfterItemDiscounts - discountVal);

  const numericReceived = (() => {
    if (!receivedAmount || receivedAmount.trim() === '') return 0;
    const clean = receivedAmount.trim();
    if (clean.includes(',')) {
      const normalized = clean.replace(/\./g, '').replace(',', '.');
      const n = parseFloat(normalized);
      return isNaN(n) ? 0 : n;
    }
    if (clean.includes('.')) {
      const n = parseFloat(clean);
      return isNaN(n) ? 0 : n;
    }
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
  })();
  const change = paymentMethod === 'dinheiro' && numericReceived > total ? numericReceived - total : 0;

  // Cálculos em tempo real para o Modal de Quantidade Fracionada [F12]
  const previewFractionalParsed = Math.max(0, parseFloat(fractionalQtyInput.replace(',', '.')) || 0);
  const previewFractionalRounded = Math.round(previewFractionalParsed * 1000) / 1000;

  const selectedFractionalItem = cart.find((i) => i.productId === fractionalProductId);
  const selectedFractionalBal = fractionalProductId
    ? StockEngine.getBalance(dbState.stockBalances, fractionalProductId, selectedLocationId)
    : null;
  const itemUnitPrice = selectedFractionalItem?.unitPrice || 0;
  const itemDiscountPercent = selectedFractionalItem?.discountPercent || 0;
  const previewItemNetTotal = previewFractionalRounded * itemUnitPrice * (1 - itemDiscountPercent / 100);

  // Simulação do TOTAL LÍQUIDO da venda inteira recalculado automaticamente
  const simulatedSubtotal = fractionalProductId
    ? cart.reduce((sum, item) => {
        if (item.productId === fractionalProductId) {
          return sum + previewFractionalRounded * item.unitPrice;
        }
        return sum + item.quantity * item.unitPrice;
      }, 0)
    : subtotal;

  let simulatedDiscountVal = 0;
  if (discountType === 'percent') {
    const safePercent = Math.min(maxAllowedDiscountPercent, parsedDiscountNum);
    simulatedDiscountVal = (simulatedSubtotal * safePercent) / 100;
  } else {
    simulatedDiscountVal = Math.min(simulatedSubtotal, parsedDiscountNum);
  }
  const simulatedTotalLiquido = Math.max(0, simulatedSubtotal - simulatedDiscountVal);

  // Foco inicial automático no campo do leitor
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Buffer global para captura de leitor de código de barras físico (HID)
  const barcodeScanBufferRef = useRef<string>('');
  const lastScanKeyTimeRef = useRef<number>(0);

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (discountAuthPrompt || saleObservationAlerts.length > 0 || showPriceLookupModal || showProductLookupModal || showReceiptModal || showOpenRegisterModal || cancellingOrderId || showQuickCustomerModal || showSaleConfirmationModal) {
        return;
      }

      // Captura de leitor de código de barras caso o foco não esteja no input principal
      const activeEl = document.activeElement as HTMLElement | null;
      const isInputFocused =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable);

      if (!isInputFocused) {
        const now = Date.now();
        const diff = now - lastScanKeyTimeRef.current;
        lastScanKeyTimeRef.current = now;

        if (diff > 120) {
          barcodeScanBufferRef.current = '';
        }

        if (e.key === 'Enter') {
          if (barcodeScanBufferRef.current.length >= 2) {
            e.preventDefault();
            const scanned = barcodeScanBufferRef.current.trim();
            barcodeScanBufferRef.current = '';
            handleProcessBarcodeOrCode(scanned, 1);
            return;
          }
        } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          barcodeScanBufferRef.current += e.key;
        }
      }

      // Se o modal de desconto por produto estiver aberto
      if (showItemDiscountModal) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowItemDiscountModal(false);
          barcodeInputRef.current?.focus();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleApplyItemDiscount();
        }
        return;
      }

      // Se o modal de quantidade fracionada estiver aberto
      if (showFractionalQtyModal) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowFractionalQtyModal(false);
          barcodeInputRef.current?.focus();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirmFractionalQty();
        }
        return;
      }

      if (e.key === 'F12') {
        e.preventDefault();
        handleOpenFractionalModal();
      } else if (e.key === 'F2') {
        e.preventDefault();
        setShowProductLookupModal(true);
      } else if (e.key === 'F3') {
        e.preventDefault();
        if (e.shiftKey) {
          setShowQuickCustomerModal(true);
        } else {
          customerSelectRef.current?.focus();
        }
      } else if (e.key === 'F4') {
        e.preventDefault();
        discountInputRef.current?.focus();
        discountInputRef.current?.select();
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (cart.length > 0) {
          handlePreFinalizeSale();
        }
      } else if (e.key === 'Escape') {
        if (barcodeInput) {
          setBarcodeInput('');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    cart,
    discountType,
    discountInput,
    paymentMethod,
    paymentTerm,
    receivedAmount,
    selectedCustomerId,
    showPriceLookupModal,
    showProductLookupModal,
    showReceiptModal,
    showSaleConfirmationModal,
    showQuickCustomerModal,
    showFractionalQtyModal,
    showItemDiscountModal,
    itemDiscountInput,
    fractionalQtyInput,
    fractionalProductId,
    lastAddedItem,
    selectedLocationId,
    dbState,
    quantityInput,
    barcodeInput,
    saleObservationAlerts.length,
    discountAuthPrompt
  ]);

  // Atalhos de teclado para o modal de finalização de venda
  useEffect(() => {
    if (!showSaleConfirmationModal) return;
    const handleModalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSaleConfirmationModal(false);
        barcodeInputRef.current?.focus();
      } else if (e.key === 'Enter') {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
        if (paymentMethod && paymentTerm && !(paymentMethod === 'dinheiro' && numericReceived > 0 && numericReceived < total)) {
          e.preventDefault();
          handleFinalizeSale();
        }
      }
    };
    window.addEventListener('keydown', handleModalKeyDown);
    return () => window.removeEventListener('keydown', handleModalKeyDown);
  }, [showSaleConfirmationModal, paymentMethod, paymentTerm, numericReceived, total]);

  // Seleção da Forma de Pagamento com automação de Prazo de Pagamento conforme regras do PDV
  const handleSelectPaymentMethod = (method: 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito' | 'boleto' | 'crediario') => {
    setPaymentMethod(method);
    // Regra 1: "Caso o usuário selecione 'Pix, Dinheiro ou Débito', o prazo de pagamento 'À Vista / Imediato' será selecionado de forma automática"
    if (method === 'pix' || method === 'dinheiro' || method === 'cartao_debito') {
      setPaymentTerm('a_vista');
      setInstallments(1);
      if (method === 'dinheiro') {
        if (!receivedAmount || numericReceived === 0) {
          setReceivedAmount(total.toFixed(2).replace('.', ','));
        }
      }
    } 
    // Regra 2: "caso seja selecionado a forma de pagamento 'Crédito, Boleto ou Crediário' deverá aparecer de forma automática o prazo de pagamento 'Parcelado (1x)' e permitindo o usuário selecionar outro prazo"
    else if (method === 'cartao_credito' || method === 'boleto' || method === 'crediario') {
      setPaymentTerm('parcelado');
      setInstallments(1);
    }
  };

  const validateCartAndPromptAuthorizations = (
    itemsToCheck: OrderItem[],
    globalDiscountToCheck: number,
    onAllValid: () => void
  ) => {
    const validation = validateOrderDiscounts({
      items: itemsToCheck,
      products: dbState.products,
      companyId: currentCompany.id,
      origin: 'pdv',
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
        validateCartAndPromptAuthorizations(nextCart, globalDiscountToCheck, onAllValid);
      },
      onReduceToLimit: () => {
        const targetItem = itemsToCheck[first.itemIndex];
        const gross = targetItem.quantity * targetItem.unitPrice;
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
                totalPrice: Math.max(0, Math.round((gross - clampedItemDisc) * 100) / 100),
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
          localStorage.setItem('omni_discount_type', 'value');
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

  // Pré-finalizar venda no PDV Balcão (Validação de caixa/carrinho e abertura da tela de finalização de pagamento)
  const handlePreFinalizeSale = () => {
    if (!activeCashRegister) {
      alert('É necessário ter um caixa aberto para registrar vendas.');
      setShowOpenRegisterModal(true);
      return;
    }

    if (cart.length === 0) {
      toast.warning('Adicione pelo menos um produto antes de finalizar o pedido.', 'Carrinho Vazio');
      return;
    }

    if (discountVal > maxAllowedDiscountVal + 0.01) {
      alert(
        `Desconto não autorizado! Seu perfil permite no máximo ${currentUser.permissions.maxDiscountPercent}% (${formatCurrency(maxAllowedDiscountVal)}).`
      );
      return;
    }

    // Valida limite máximo de desconto por produto (incluindo rateio do desconto geral [F4])
    validateCartAndPromptAuthorizations(cart, discountVal, () => {
      // Se Dinheiro já estava selecionado, sugere o valor exato
      if (paymentMethod === 'dinheiro' && (!receivedAmount || numericReceived === 0)) {
        setReceivedAmount(total.toFixed(2).replace('.', ','));
      }
      // Abre a tela de finalização para selecionar forma e prazo de pagamento
      setShowSaleConfirmationModal(true);
    });
  };

  // Finalizar Venda Efetivamente (gravação local + confirmação real no Firebase Firestore)
  const handleFinalizeSale = async () => {
    if (isFinalizingSaleRef.current) {
      return;
    }

    if (!activeCashRegister) {
      setShowSaleConfirmationModal(false);
      toast.warning('É necessário ter um caixa aberto para registrar vendas.', 'Caixa Fechado');
      setShowOpenRegisterModal(true);
      return;
    }

    if (cart.length === 0) {
      setShowSaleConfirmationModal(false);
      toast.warning('Adicione pelo menos um produto antes de finalizar a venda.', 'Carrinho Vazio');
      return;
    }

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

    const validatedCompany = Database.ensureValidCurrentCompanyForUser(currentUser, { skipPersist: true });
    if (validatedCompany.status === 'inativo') {
      setShowSaleConfirmationModal(false);
      toast.error(
        `A empresa "${validatedCompany.tradeName || validatedCompany.name}" está inativa e não pode registrar vendas.`,
        'Empresa Inativa'
      );
      return;
    }

    const submissionId = saleSessionIdRef.current;
    const existingDuplicate = Database.findOrderBySubmissionId(submissionId);
    if (existingDuplicate) {
      isFinalizingSaleRef.current = true;
      setIsFinalizingSale(true);
      try {
        const retryResult = await FirebaseSyncService.commitCriticalOperation({
          operationKey: `order:${existingDuplicate.id}`,
          entityType: 'order',
          entityId: existingDuplicate.id,
          label: `Venda PDV ${existingDuplicate.number}`,
        });
        setShowSaleConfirmationModal(false);
        if (retryResult.syncState === 'confirmed') {
          toast.success(`Venda ${existingDuplicate.number} confirmada no Firebase.`, 'Confirmado na Nuvem');
        } else if (retryResult.syncState === 'pending_offline') {
          toast.warning(retryResult.message, 'Aguardando Sincronização');
        } else {
          toast.error(retryResult.message, 'Falha na Sincronização');
        }
        saleSessionIdRef.current = generateSaleSessionId('PDV');
        setLastFinishedOrder(existingDuplicate);
        setShowReceiptModal(true);
        setCart([]);
      } finally {
        isFinalizingSaleRef.current = false;
        setIsFinalizingSale(false);
      }
      return;
    }

    isFinalizingSaleRef.current = true;
    setIsFinalizingSale(true);

    const orderNumber = Database.generateUniqueOrderNumber('VD', 5);
    const nowIso = new Date().toISOString();
    const uniqueOrderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      const latestState = Database.getState();
      const boletoAccounts = Database.getBoletoAccounts(validatedCompany.id);
      const targetBoletoAccount = paymentMethod === 'boleto'
        ? boletoAccounts.find((a) => a.id === selectedBoletoAccountId) || boletoAccounts[0] || Database.getBoletoAccounts()[0]
        : undefined;

      const termInfo = Database.resolvePaymentTermInfo(paymentTerm, installments);
      const newOrder: Order = {
        id: uniqueOrderId,
        number: orderNumber,
        type: 'venda',
        origin: 'pdv',
        companyId: validatedCompany.id,
        customerId: selectedCustomerId || undefined,
        customerName: selectedCustomer ? selectedCustomer.name : 'Consumidor Final (Não Identificado)',
        customerPhone: selectedCustomer?.phone || selectedCustomer?.whatsapp,
        userId: currentUser.id,
        userName: currentUser.name,
        items: cart,
        subtotal: grossSubtotal,
        discountTotal: totalItemDiscounts + discountVal,
        total,
        paymentMethod,
        paymentTerm,
        bankAccountId: targetBoletoAccount?.id,
        bankAccountName: targetBoletoAccount?.name,
        installmentsCount: installments,
        receivedAmount: paymentMethod === 'dinheiro' && numericReceived > 0 ? numericReceived : total,
        changeAmount: change,
        status: 'concluido',
        stockDeducted: true,
        financialGenerated: true,
        notes: `Prazo de Pagamento: ${termInfo.label}${installments > 1 && !/\d+\s*x/i.test(termInfo.label) ? ` (${installments}x)` : ''}`,
        clientSubmissionId: submissionId,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      // Bloqueio obrigatório na camada de persistência contra burla de desconto máximo por produto
      const validatedDiscountAuths = Database.validateOrderDiscountsForPersistence(newOrder, {
        saleSessionId: submissionId,
        globalOrderDiscountValue: discountVal,
      });

      let currentBalances = [...latestState.stockBalances];
      const movements = [];

      for (const item of cart) {
        const loc = locations.find((l) => l.id === selectedLocationId) ||
          locations.find((l) => l.id === 'loc-comercial') ||
          locations[0] ||
          { id: 'loc-comercial', name: 'Comercial' };

        const { updatedBalances, createdMovement } = StockEngine.applyMovement(
          currentBalances,
          {
            companyId: validatedCompany.id,
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
            originDocId: orderNumber,
            date: nowIso,
            userId: currentUser.id,
            userName: currentUser.name,
            notes: `Venda no PDV Balcão ${orderNumber} (${validatedCompany.tradeName || validatedCompany.name})`,
          },
          { allowNegativeStock: Database.canSellNegativeStock() }
        );

        currentBalances = updatedBalances;
        movements.push(createdMovement);
      }

      const finalizedOrder = Database.finalizeOrderDiscountAuthorizations(newOrder, validatedDiscountAuths, {
        saleSessionId: submissionId,
        skipPersist: true,
      });

      const cashMovementType =
        paymentMethod === 'dinheiro'
          ? 'venda_dinheiro'
          : paymentMethod === 'pix'
          ? 'venda_pix'
          : paymentMethod === 'boleto'
          ? 'venda_outros'
          : 'venda_cartao';

      const updatedCashRegisters = latestState.cashRegisters.map((reg) => {
        if (reg.id === activeCashRegister.id) {
          return {
            ...reg,
            movements: [
              ...reg.movements,
              {
                id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                type: cashMovementType as any,
                amount: total,
                description: `Venda ${orderNumber} - ${finalizedOrder.customerName}`,
                timestamp: nowIso,
                userId: currentUser.id,
                orderId: finalizedOrder.id,
              },
            ],
          };
        }
        return reg;
      });

      let updatedReceivables = [...latestState.accountsReceivable];
      if (paymentMethod === 'crediario' || paymentMethod === 'boleto') {
        const installmentValue = Number((total / installments).toFixed(2));
        for (let i = 1; i <= installments; i++) {
          const daysOffset = termInfo.daysOffsets[i - 1] ?? i * 30;
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + daysOffset);

          updatedReceivables.push({
            id: `REC-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
            companyId: validatedCompany.id,
            orderId: finalizedOrder.id,
            orderNumber: finalizedOrder.number,
            customerId: selectedCustomerId,
            customerName: finalizedOrder.customerName,
            docNumber: `${orderNumber}/${i}`,
            installmentNumber: i,
            totalInstallments: installments,
            issueDate: nowIso.split('T')[0],
            dueDate: dueDate.toISOString().split('T')[0],
            originalValue: installmentValue,
            discount: 0,
            addition: 0,
            paidValue: 0,
            balance: installmentValue,
            paymentMethod: paymentMethod === 'boleto' ? 'Boleto Bancário' : 'Crediário Próprio',
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
      state.cashRegisters = updatedCashRegisters;
      state.accountsReceivable = updatedReceivables;
      Database.persist();

      Database.addAuditLog(
        'FINALIZAR_VENDA_PDV',
        'VENDAS',
        finalizedOrder.id,
        `Venda PDV ${orderNumber} finalizada com sucesso. Total: ${formatCurrency(total)} via ${paymentMethod}`
      );

      const syncResult = await FirebaseSyncService.commitCriticalOperation({
        operationKey: `order:${finalizedOrder.id}`,
        entityType: 'order',
        entityId: finalizedOrder.id,
        label: `Venda PDV ${orderNumber}`,
      });

      // Inicia nova sessão limpa para próxima venda (nenhuma autorização anterior permanece ativa)
      saleSessionIdRef.current = generateSaleSessionId('PDV');
      setShowSaleConfirmationModal(false);

      if (syncResult.syncState === 'confirmed') {
        toast.success(`Venda PDV ${orderNumber} salva e confirmada no Firebase!`, 'Confirmado no Firebase');
      } else if (syncResult.syncState === 'pending_offline') {
        toast.warning(
          `Venda PDV ${orderNumber} salva localmente (sem conexão). Será sincronizada automaticamente com o Firebase.`,
          'Pendente de Sincronização'
        );
      } else {
        toast.error(
          `Venda PDV ${orderNumber} salva localmente, mas falhou ao gravar no Firebase: ${syncResult.message}`,
          'Falha na Sincronização'
        );
      }

      setLastFinishedOrder(finalizedOrder);
      setShowReceiptModal(true);
      setCart([]);
      setDiscountInput('');
      setReceivedAmount('');
      setSelectedCustomerId('');
      setPaymentMethod('');
      setPaymentTerm('');
      setLastAddedItem(null);
      setStagedPosProductId('');
      setStagedPosUnitPriceInput('');
      setIsEditingStagedPosPrice(false);
      setSaleObservationAlerts([]);
      lastObservationCustomerSigRef.current = '';
    } catch (error) {
      setShowSaleConfirmationModal(false);
      toast.error('Erro ao finalizar venda: ' + (error as Error).message, 'Erro');
    } finally {
      isFinalizingSaleRef.current = false;
      setIsFinalizingSale(false);
    }
  };

  // Abrir Caixa
  const handleOpenCashRegister = () => {
    const initBalance = parseFloat(openRegisterAmount.replace(/\D/g, '')) / 100 || 0;
    const newRegister: CashRegister = {
      id: 'CX-' + Date.now(),
      companyId: currentCompany.id,
      userId: currentUser.id,
      userName: currentUser.name,
      openedAt: new Date().toISOString(),
      initialBalance: initBalance,
      status: 'aberto',
      movements: [],
    };
    Database.getState().cashRegisters.unshift(newRegister);
    Database.persist();
    Database.addAuditLog(
      'ABERTURA_CAIXA',
      'FINANCEIRO',
      newRegister.id,
      `Caixa aberto por ${currentUser.name} com fundo de troco de ${formatCurrency(initBalance)}`
    );
    setShowOpenRegisterModal(false);
  };

  // Cancelar Venda
  const handleConfirmCancelSale = (order: Order) => {
    if (!currentUser.permissions.canCancelSales) {
      alert('Acesso negado: Seu perfil não possui permissão para cancelar vendas.');
      return;
    }
    if (!cancelReason.trim()) {
      alert('Informe obrigatoriamente a justificativa para o cancelamento.');
      return;
    }

    try {
      let currentBalances = [...dbState.stockBalances];
      const movements = [];
      const nowIso = new Date().toISOString();

      for (const item of order.items) {
        const { updatedBalances, createdMovement } = StockEngine.applyMovement(currentBalances, {
          companyId: currentCompany.id,
          productId: item.productId,
          productCode: item.productCode,
          productDescription: item.description,
          locationId: item.locationId || 'loc-comercial',
          locationName: 'Comercial',
          type: 'ajuste_inventario',
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: item.unitCost * item.quantity,
          originDocType: 'venda',
          originDocId: order.number,
          date: nowIso,
          userId: currentUser.id,
          userName: currentUser.name,
          notes: `Estorno por cancelamento: ${cancelReason}`,
        });
        currentBalances = updatedBalances;
        movements.push(createdMovement);
      }

      const updatedOrders = dbState.orders.map((o) =>
        o.id === order.id
          ? {
              ...o,
              status: 'cancelado' as const,
              notes: `${o.notes || ''} [Cancelado em ${new Date().toLocaleString('pt-BR')}: ${cancelReason}]`,
            }
          : o
      );

      const updatedReceivables = dbState.accountsReceivable.map((rec) =>
        rec.orderId === order.id ? { ...rec, status: 'cancelado' as const } : rec
      );

      const state = Database.getState();
      state.stockBalances = currentBalances;
      state.stockMovements = [...movements, ...state.stockMovements];
      state.orders = updatedOrders;
      state.accountsReceivable = updatedReceivables;
      Database.persist();

      Database.addAuditLog(
        'CANCELAMENTO_VENDA',
        'VENDAS',
        order.id,
        `Venda ${order.number} cancelada por ${currentUser.name}. Motivo: ${cancelReason}`
      );

      setCancellingOrderId(null);
      setCancelReason('');
      alert(`Venda ${order.number} cancelada com sucesso. Estoque devidamente estornado!`);
    } catch (e) {
      alert('Erro ao cancelar: ' + (e as Error).message);
    }
  };

  const recentOrders = dbState.orders
    .filter((o) => o.companyId === currentCompany.id && o.origin === 'pdv')
    .slice(0, 10);

  const handleQuickBill = (billValue: number) => {
    setReceivedAmount(billValue.toFixed(2).replace('.', ','));
  };

  return (
    <div className="flex flex-col h-full min-h-0 space-y-2 overflow-hidden">
      {/* Alerta de Caixa Fechado */}
      {!activeCashRegister && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2 shadow-xs shrink-0">
          <div className="flex items-center gap-2.5">
            <Lock className="text-amber-600 shrink-0" size={18} />
            <div>
              <span className="font-bold text-amber-900 text-xs mr-2">Caixa PDV Fechado:</span>
              <span className="text-[11px] text-amber-700 hidden sm:inline">
                Abra o caixa informando o fundo de troco inicial para registrar vendas.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowOpenRegisterModal(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3 py-1 rounded-lg transition-colors shadow-xs shrink-0 cursor-pointer"
          >
            Abrir Caixa Agora
          </button>
        </div>
      )}

      {/* Barra de Status e Controles Exclusivos do PDV: GestãoFácil ERP Layout */}
      <div className="bg-white border border-slate-200 px-3 py-2 rounded-xl shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        {/* Lado Esquerdo: Ícone Verde Redondo + Título PDV Balcão + Badge Ativo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <CashRegisterIcon size={20} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-slate-900 leading-tight">
                PDV Balcão
              </span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                Ativo
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              Venda rápida e prática no balcão da sua loja
            </div>
          </div>
        </div>

        {/* Lado Direito: Empresa, Ações Rápidas, Controles de Menu e Dashboard */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Seletor Empresa */}
          <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
            <Warehouse size={15} className="text-slate-400 shrink-0" />
            <div className="text-left">
              <span className="block text-[9px] uppercase font-bold text-slate-400 leading-none">
                Empresa
              </span>
              <span className="text-xs font-semibold text-slate-800 truncate max-w-[160px] block">
                {currentCompany.tradeName || currentCompany.name}
              </span>
            </div>
          </div>

          {/* Botão de Minimizar Menu Lateral */}
          {onToggleSidebarMinimize && (
            <button
              type="button"
              onClick={onToggleSidebarMinimize}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
                isSidebarMinimized
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-2xs font-bold'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
              }`}
              title={isSidebarMinimized ? 'Expandir Menu Completo' : 'Minimizar Menu (Apenas Ícones)'}
            >
              {isSidebarMinimized ? (
                <PanelLeftOpen size={14} className="text-emerald-700" />
              ) : (
                <PanelLeftClose size={14} className="text-slate-500" />
              )}
              <span className="hidden sm:inline">{isSidebarMinimized ? 'Menu: Ícones' : 'Minimizar Menu'}</span>
            </button>
          )}

          {/* Botão para Ocultar/Exibir Dashboard Informativo */}
          <button
            type="button"
            onClick={toggleKpis}
            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
              isKpisHidden
                ? 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold'
            }`}
            title={isKpisHidden ? 'Exibir cards de indicadores no PDV' : 'Ocultar cards de indicadores no PDV'}
          >
            {isKpisHidden ? (
              <Eye size={14} className="text-slate-500" />
            ) : (
              <EyeOff size={14} className="text-emerald-600" />
            )}
            <span className="hidden sm:inline">{isKpisHidden ? 'Mostrar Dashboard' : 'Ocultar Dashboard'}</span>
          </button>

          {/* Botão Busca Preço (Consulta Rápida sem Alterar Venda) */}
          <button
            type="button"
            onClick={() => setShowPriceLookupModal(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-xl border border-blue-200 transition-colors cursor-pointer"
            title="Consultar preço e estoque de produtos sem alterar a venda em andamento"
          >
            <Tag size={14} className="text-blue-600" />
            <span>Busca Preço</span>
          </button>

          {/* Atalhos Rápidos */}
          <button
            type="button"
            onClick={() => setShowRecentSalesModal(true)}
            className="flex items-center gap-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="Ver últimas vendas do turno"
          >
            <Receipt size={14} className="text-slate-500" />
            <span>Últimas ({recentOrders.length})</span>
          </button>
        </div>
      </div>

      {/* DASHBOARD INFORMATIVO NO PDV: Faturamento Vendas, Canais de Venda, Previsões Financeiras e Estoque Crítico */}
      {!isKpisHidden && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 shrink-0">
          {/* 1. Faturamento Vendas */}
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-[10px] font-semibold">
              <span>Faturamento Vendas</span>
              <DollarSign size={13} className="text-emerald-600" />
            </div>
            <div className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">
              {formatCurrency(totalRevenue)}
            </div>
            <div className="text-[10px] text-slate-400 flex justify-between">
              <span>{companyOrders.length} pedidos</span>
              <span className="text-emerald-700 font-bold">Ticket: {formatCurrency(avgTicket)}</span>
            </div>
          </div>

          {/* 2. Canais de Venda */}
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-[10px] font-semibold">
              <span>Canais de Venda</span>
              <Smartphone size={13} className="text-blue-600" />
            </div>
            <div className="text-[11px] font-bold text-slate-800 mt-1">
              Balcão: <strong className="text-emerald-700">{pdvSales.length}</strong> ({formatCurrency(pdvSales.reduce((s, o) => s + o.total, 0))})
            </div>
            <div className="text-[10px] font-bold text-blue-700">
              Mobile: <strong>{externalSales.length}</strong> ({formatCurrency(externalSales.reduce((s, o) => s + o.total, 0))})
            </div>
            <div className="text-[10px] font-bold text-indigo-700">
              Pedidos: <strong>{backofficeSales.length}</strong> ({formatCurrency(backofficeSales.reduce((s, o) => s + o.total, 0))})
            </div>
          </div>

          {/* 3. Previsões Financeiras */}
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-[10px] font-semibold">
              <span>Previsões Financeiras</span>
              <TrendingUp size={13} className="text-blue-600" />
            </div>
            <div className="text-[10px] font-semibold text-emerald-700 mt-1">
              A Receber: <strong className="font-extrabold">{formatCurrency(openReceivables)}</strong>
            </div>
            <div className="text-[10px] font-semibold text-rose-600">
              A Pagar: <strong className="font-extrabold">{formatCurrency(openPayables)}</strong>
            </div>
          </div>

          {/* 4. Estoque Crítico */}
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 text-[10px] font-semibold">
              <span>Estoque Crítico</span>
              <AlertTriangle size={13} className="text-amber-600" />
            </div>
            <div className="text-base sm:text-lg font-extrabold text-amber-600 mt-0.5">
              {lowStockProducts.length} itens
            </div>
            <div className="text-[10px] text-slate-400">
              Abaixo do estoque mínimo
            </div>
          </div>
        </div>
      )}

      {/* Barra de Entrada Rápida de Produtos (Produto | Preço Unit. | Quantidade | + Incluir Item) */}
      <form
        onSubmit={handleBarcodeSubmit}
        className="bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-xs relative shrink-0"
      >
        {(() => {
          const stagedProd = stagedPosProductId
            ? dbState.products.find((p) => p.id === stagedPosProductId)
            : null;
          const stagedCatalogPrice = stagedProd
            ? StockEngine.getProductPriceForCompany(stagedProd, currentCompany.id)
            : 0;
          const parsedStagedPrice = parseFloat(stagedPosUnitPriceInput.replace(',', '.'));
          const displayedStagedPrice = !stagedProd
            ? 0
            : canAlterUnitPrice &&
              stagedPosUnitPriceInput.trim() !== '' &&
              Number.isFinite(parsedStagedPrice) &&
              parsedStagedPrice > 0
            ? parsedStagedPrice
            : stagedCatalogPrice;
          const isStagedPriceOverridden =
            Boolean(stagedProd) && Math.abs(displayedStagedPrice - stagedCatalogPrice) > 0.005;
          const numericQty = Math.max(0.001, parseFloat((quantityInput || '1').replace(',', '.')) || 1);

          return (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
              {/* Produto (Código, Barras ou Nome) — 6 Colunas */}
              <div className="md:col-span-6 space-y-1 relative">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-bold text-slate-700 block truncate">
                    Produto (Código, Barras ou Nome) *:
                  </label>
                  <div className="inline-flex items-center gap-1 bg-emerald-100/90 border border-emerald-300 rounded px-1.5 py-0.2 shrink-0">
                    <span className="text-[10px] font-bold text-emerald-800">Depósito:</span>
                    <select
                      value={selectedLocationId}
                      onChange={(e) => setSelectedLocationId(e.target.value)}
                      className="bg-transparent text-[10px] font-extrabold text-emerald-900 focus:outline-hidden cursor-pointer"
                    >
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {stagedProd ? (
                  <div className="flex items-center justify-between gap-1.5 w-full h-[40px] bg-blue-50/80 border-2 border-blue-400 rounded-xl px-2.5">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="font-mono text-[11px] font-extrabold text-blue-700 bg-white px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                        {stagedProd.code}
                      </span>
                      <span className="text-xs font-extrabold text-slate-900 truncate" title={stagedProd.description}>
                        {stagedProd.description}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setStagedPosProductId('');
                          setStagedPosUnitPriceInput('');
                          setIsEditingStagedPosPrice(false);
                          setTimeout(() => barcodeInputRef.current?.focus(), 20);
                        }}
                        className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                        title="Limpar produto selecionado"
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
                ) : (
                  <div className="relative">
                    <Barcode className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" size={18} />
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      placeholder="Bipar leitor ou digitar código / barras / nome (3+ letras)..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          handleProcessBarcodeOrCode(barcodeInput);
                        }
                      }}
                      className="w-full h-[40px] pl-8 pr-28 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                      autoFocus
                    />

                    <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />

                    <button
                      type="button"
                      onClick={() => setShowProductLookupModal(true)}
                      className="absolute right-1 top-1 bottom-1 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors border border-blue-200 cursor-pointer"
                    >
                      <Search size={12} />
                      <span>Buscar [F2]</span>
                    </button>
                  </div>
                )}

                {/* Autocomplete Dropdown ao digitar (só exibe a lista a partir do 3º caractere digitado) */}
                {!stagedProd && searchResults.length > 0 && barcodeInput.trim().length >= 3 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {searchResults.slice(0, 6).map((prod) => {
                      const stock = StockEngine.getBalance(dbState.stockBalances, prod.id, selectedLocationId);
                      const catalogPrice = StockEngine.getProductPriceForCompany(prod, currentCompany.id);
                      const draftStr = posPriceDrafts[prod.id];
                      const parsedDraft =
                        canAlterUnitPrice && draftStr !== undefined && draftStr.trim() !== ''
                          ? parseFloat(draftStr.replace(',', '.'))
                          : NaN;
                      const effectiveDisplayPrice =
                        !isNaN(parsedDraft) && parsedDraft > 0 ? parsedDraft : catalogPrice;
                      const isPriceAltered =
                        canAlterUnitPrice &&
                        !isNaN(parsedDraft) &&
                        parsedDraft > 0 &&
                        Math.abs(parsedDraft - catalogPrice) > 0.004;
                      const isEditingThisPrice = canAlterUnitPrice && editingPosPriceId === prod.id;

                      return (
                        <div
                          key={prod.id}
                          onClick={() => {
                            if (isPriceAltered) {
                              handleAddToCart(
                                prod,
                                parseFloat((quantityInput || '1').replace(',', '.')) || 1,
                                effectiveDisplayPrice
                              );
                            } else {
                              handleSelectStagedPosProduct(prod);
                            }
                          }}
                          className="p-2.5 hover:bg-blue-50/70 cursor-pointer flex items-center justify-between gap-2 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                              {prod.code}
                            </span>
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-slate-900 truncate">{prod.description}</div>
                              <div className="text-[10px] text-slate-400">
                                {prod.barcode ? `EAN: ${prod.barcode} • ` : ''}
                                Estoque no local: <strong className={stock.quantity <= 0 ? 'text-rose-600' : 'text-emerald-600'}>{formatQuantity(stock.quantity)} {prod.unit}</strong>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                            {isEditingThisPrice ? (
                              <div
                                className="flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="relative flex items-center">
                                  <span className="absolute left-2 text-[10px] font-black text-indigo-500">R$</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    autoFocus
                                    value={draftStr ?? catalogPrice.toFixed(2).replace('.', ',')}
                                    onChange={(e) =>
                                      setPosPriceDrafts((prev) => ({
                                        ...prev,
                                        [prod.id]: e.target.value.replace(/[^0-9.,]/g, ''),
                                      }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const typed = parseFloat((posPriceDrafts[prod.id] || '').replace(',', '.'));
                                        handleAddToCart(
                                          prod,
                                          parseFloat((quantityInput || '1').replace(',', '.')) || 1,
                                          !isNaN(typed) && typed > 0 ? typed : undefined
                                        );
                                      } else if (e.key === 'Escape') {
                                        e.stopPropagation();
                                        setEditingPosPriceId(null);
                                      }
                                    }}
                                    onBlur={() => setEditingPosPriceId(null)}
                                    className="w-24 pl-7 pr-2 py-1 text-right font-mono font-black text-xs text-indigo-900 bg-indigo-50 border-2 border-indigo-400 rounded-lg focus:outline-hidden"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="font-extrabold text-xs sm:text-sm text-slate-900 font-mono">
                                {formatCurrency(effectiveDisplayPrice)}
                              </div>
                            )}
                            <span className="text-[9px] text-blue-600 font-bold">Clique para selecionar</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Preço Unitário — Campo Dedicado Antes da Quantidade (2 Colunas) */}
              <div className="md:col-span-2 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    Preço Unit.:
                  </label>
                  {canAlterUnitPrice && stagedProd && (
                    isStagedPriceOverridden ? (
                      <button
                        type="button"
                        onClick={() => {
                          setStagedPosUnitPriceInput('');
                          setIsEditingStagedPosPrice(false);
                        }}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                        title={`Restaurar preço original (${formatCurrency(stagedCatalogPrice)})`}
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

                {canAlterUnitPrice && stagedProd ? (
                  isEditingStagedPosPrice ? (
                    <div className="flex items-center justify-between gap-1.5 w-full h-[40px] bg-white border-2 border-blue-500 ring-2 ring-blue-500/20 rounded-xl px-2.5 transition-all">
                      <Pencil size={13} className="text-blue-600 shrink-0" />
                      <div className="flex items-center justify-end gap-1 flex-1 min-w-0">
                        <span className="text-xs font-extrabold text-slate-500 font-mono">R$</span>
                        <input
                          ref={stagedPosPriceInputRef}
                          type="text"
                          inputMode="decimal"
                          value={stagedPosUnitPriceInput}
                          onChange={(e) =>
                            setStagedPosUnitPriceInput(e.target.value.replace(/[^0-9.,]/g, ''))
                          }
                          onBlur={() => setIsEditingStagedPosPrice(false)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              setIsEditingStagedPosPrice(false);
                              setTimeout(() => {
                                posQtyInputRef.current?.focus();
                                posQtyInputRef.current?.select();
                              }, 15);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setStagedPosUnitPriceInput('');
                              setIsEditingStagedPosPrice(false);
                            }
                          }}
                          className="w-full text-right font-mono text-xs font-black text-slate-900 bg-transparent focus:outline-hidden"
                          aria-label="Novo preço unitário no PDV"
                        />
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setStagedPosUnitPriceInput(displayedStagedPrice.toFixed(2).replace('.', ','));
                        setIsEditingStagedPosPrice(true);
                        setTimeout(() => {
                          stagedPosPriceInputRef.current?.focus();
                          stagedPosPriceInputRef.current?.select();
                        }, 20);
                      }}
                      className={`flex items-center justify-between gap-1.5 w-full h-[40px] rounded-xl px-3 border transition-all cursor-pointer ${
                        isStagedPriceOverridden
                          ? 'bg-indigo-50/70 border-indigo-400 text-indigo-950 hover:border-indigo-500'
                          : 'bg-white border-slate-300 text-slate-900 hover:border-blue-400'
                      }`}
                      title={`Clique para alterar o preço unitário nesta venda (Original: ${formatCurrency(stagedCatalogPrice)})`}
                    >
                      <Pencil
                        size={13}
                        className={isStagedPriceOverridden ? 'text-indigo-600 shrink-0' : 'text-slate-400 shrink-0'}
                      />
                      <span className="font-mono text-xs font-extrabold truncate">
                        {formatCurrency(displayedStagedPrice)}
                      </span>
                    </button>
                  )
                ) : (
                  <div className="flex items-center justify-between gap-1.5 w-full h-[40px] bg-slate-50 border border-slate-200 rounded-xl px-3 text-slate-500 select-none">
                    {canAlterUnitPrice ? (
                      <Pencil size={13} className="text-slate-300 shrink-0" />
                    ) : (
                      <span />
                    )}
                    <span className="font-mono text-xs font-bold">
                      {formatCurrency(stagedProd ? stagedCatalogPrice : 0)}
                    </span>
                  </div>
                )}
              </div>

              {/* Quantidade — 2 Colunas */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">
                  Quantidade:
                </label>
                <div className="inline-flex items-center w-full h-[40px] bg-white border border-slate-300 rounded-xl focus-within:ring-2 focus-within:ring-blue-500">
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.max(1, numericQty - 1);
                      setQuantityInput(String(next).replace('.', ','));
                    }}
                    className="px-2.5 h-full text-slate-600 hover:bg-slate-100 rounded-l-xl cursor-pointer"
                  >
                    <Minus size={12} />
                  </button>
                  <input
                    ref={posQtyInputRef}
                    type="text"
                    inputMode="decimal"
                    value={quantityInput}
                    onChange={(e) => setQuantityInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                    onBlur={() => {
                      if (!quantityInput.trim() || parseFloat(quantityInput.replace(',', '.')) <= 0) {
                        setQuantityInput('1');
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (stagedProd) {
                          handleCommitStagedPosProduct();
                        } else {
                          barcodeInputRef.current?.focus();
                          barcodeInputRef.current?.select();
                        }
                      }
                    }}
                    className="w-full text-center text-xs font-black text-slate-900 bg-transparent focus:outline-hidden font-mono"
                    title="Quantidade a incluir na venda"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = numericQty + 1;
                      setQuantityInput(String(next).replace('.', ','));
                    }}
                    className="px-2.5 h-full text-slate-600 hover:bg-slate-100 rounded-r-xl cursor-pointer"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              {/* Botão + Incluir Item — 2 Colunas */}
              <div className="md:col-span-2">
                <button
                  type="button"
                  disabled={!stagedProd && !barcodeInput.trim()}
                  onClick={() => {
                    if (stagedProd) {
                      handleCommitStagedPosProduct();
                    } else {
                      handleProcessBarcodeOrCode(barcodeInput);
                    }
                  }}
                  className="w-full h-[40px] px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus size={15} />
                  <span>Incluir Item</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* Feedback Visual de Confirmação da Leitura / Contagem de Unidade */}
        {feedbackMessage && (
          <div
            className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between animate-fadeIn transition-all ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs'
                : feedbackMessage.type === 'error'
                ? 'bg-rose-50 text-rose-800 border border-rose-300 shadow-2xs'
                : 'bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              ) : feedbackMessage.type === 'error' ? (
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
              ) : (
                <AlertTriangle size={16} className="text-amber-600 shrink-0" />
              )}
              <span className="truncate">{feedbackMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer shrink-0 ml-2"
              title="Fechar notificação"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </form>

      {/* Avisos de Observações de Produtos e Cliente (Modal Central Obrigatório) */}
      {saleObservationAlerts.length > 0 && (
        <SaleObservationAlerts
          alerts={saleObservationAlerts}
          onDismiss={(id) => setSaleObservationAlerts((prev) => dismissSaleAlert(prev, id))}
          onDismissAll={() => setSaleObservationAlerts([])}
          onAfterClose={() => barcodeInputRef.current?.focus()}
          variant="compact"
        />
      )}

      {/* Grid Principal do PDV: Cupom/Tabela de Itens (Esquerda) + Cockpit de Pagamento (Direita) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
        {/* Painel Esquerdo: Cupom Eletrônico de Balcão */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col h-full min-h-0 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Cabeçalho da Tabela de Itens */}
          <div className="bg-slate-50/90 px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-blue-600" />
              <span className="font-extrabold text-sm sm:text-base uppercase tracking-wider text-slate-800">
                Itens da Venda ({cart.reduce((s, i) => s + i.quantity, 0)} volumes)
              </span>
            </div>
            <span className="text-xs sm:text-sm font-bold text-slate-600 font-mono">
              {cart.length} produto(s) adicionado(s)
            </span>
          </div>

          {/* Tabela de Itens Tipo Ticket Fiscal / Ledger */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-100/90 text-slate-700 font-extrabold uppercase text-[11px] sm:text-xs sticky top-0 border-b border-slate-200 z-10">
                <tr>
                  <th className="py-2.5 px-2.5 w-10 text-center">#</th>
                  <th className="py-2.5 px-2.5">Código</th>
                  <th className="py-2.5 px-3">Descrição do Produto</th>
                  <th className="py-2.5 px-2.5 text-center">Qtd</th>
                  <th className="py-2.5 px-2 text-center">UN</th>
                  <th className="py-2.5 px-3 text-right">Unitário</th>
                  <th className="py-2.5 px-3 text-right">Total Líquido</th>
                  <th className="py-2.5 px-2 text-center w-20">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <div className="max-w-xs mx-auto space-y-2 text-slate-400">
                        <Barcode size={44} className="mx-auto text-slate-300" />
                        <div className="font-extrabold text-slate-800 text-base">Nenhum item na venda</div>
                        <div className="text-xs text-slate-500">
                          Passe o código de barras no leitor, digite acima ou tecle <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-slate-700 font-bold">F2</kbd> para consultar.
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  cart.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-blue-50/50 transition-colors ${
                        lastAddedItem?.id === item.id ? 'bg-amber-50/70' : ''
                      }`}
                    >
                      <td className="py-2 px-2.5 text-center text-slate-400 font-mono text-xs font-semibold">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="py-2 px-2.5 font-mono font-extrabold text-blue-700 whitespace-nowrap text-xs sm:text-sm">
                        {item.productCode}
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-900 leading-snug text-sm sm:text-base">
                        <div className="flex items-center flex-wrap gap-1">
                          <span>{item.description}</span>
                          {item.isMasterPack && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                              <Boxes size={11} className="text-amber-700" />
                              Master ({item.masterPackUnits} un/{item.unit})
                            </span>
                          )}
                          {item.discountValue > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">
                              <Tag size={10} />
                              Desc: -{formatCurrency(item.discountValue)} {item.discountPercent > 0 ? `(${item.discountPercent.toFixed(1).replace('.0', '')}%)` : ''}
                            </span>
                          )}
                          {(item.additionValue || 0) > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-300">
                              <Tag size={10} />
                              Acrésc: +{formatCurrency(item.additionValue || 0)} {(item.additionPercent || 0) > 0 ? `(${(item.additionPercent || 0).toFixed(1).replace('.0', '')}%)` : ''}
                            </span>
                          )}
                          {item.priceOverridden && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-300">
                              <Pencil size={9} />
                              Preço Alterado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        <div className="inline-flex items-center border border-slate-300 rounded-lg bg-slate-50 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.productId, -1)}
                            className="px-1.5 py-1 hover:bg-slate-200 text-slate-600 rounded-l cursor-pointer"
                            title="Diminuir quantidade (-1)"
                          >
                            <Minus size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenFractionalModal(item.productId)}
                            className="px-2 py-0.5 text-center text-xs sm:text-sm font-black text-slate-900 hover:text-emerald-700 hover:bg-emerald-50 font-mono transition-colors cursor-pointer"
                            title="Clique para alterar quantidade fracionada (até 3 casas decimais)"
                          >
                            {formatQuantity(item.quantity, 3)}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.productId, 1)}
                            className="px-1.5 py-1 hover:bg-slate-200 text-slate-600 rounded-r cursor-pointer"
                            title="Aumentar quantidade (+1)"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center text-slate-600 font-bold font-mono text-xs">
                        {item.unit}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-slate-600 text-xs sm:text-sm">
                        {canAlterUnitPrice ? (
                          <button
                            type="button"
                            onClick={() => handleOpenItemDiscountModal(item, 'alterar_preco')}
                            className={`inline-flex flex-col items-end px-1.5 py-0.5 rounded-md transition-colors cursor-pointer ${
                              item.priceOverridden
                                ? 'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-300 hover:bg-indigo-100'
                                : 'hover:bg-indigo-50 hover:text-indigo-700'
                            }`}
                            title={
                              item.priceOverridden && item.originalUnitPrice !== undefined
                                ? `Preço alterado (original: ${formatCurrency(item.originalUnitPrice)}). Clique para editar`
                                : 'Clique para alterar o preço unitário deste item'
                            }
                          >
                            <span className="inline-flex items-center gap-1">
                              <span>{formatCurrency(item.unitPrice)}</span>
                              <Pencil size={10} className="text-indigo-500" />
                            </span>
                            {item.priceOverridden && item.originalUnitPrice !== undefined && (
                              <span className="text-[9px] text-slate-400 line-through leading-none">
                                {formatCurrency(item.originalUnitPrice)}
                              </span>
                            )}
                          </button>
                        ) : (
                          formatCurrency(item.unitPrice)
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {item.discountValue > 0 ? (
                          <div>
                            <span className="block text-[11px] text-slate-400 line-through">
                              {formatCurrency(item.quantity * item.unitPrice)}
                            </span>
                            <span className="block font-black text-slate-900 text-sm sm:text-base">
                              {formatCurrency(item.totalPrice)}
                            </span>
                          </div>
                        ) : (
                          <span className="font-black text-slate-900 text-sm sm:text-base">
                            {formatCurrency(item.totalPrice)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {/* Botão de Desconto / Acréscimo / Alterar Preço por Produto */}
                          <button
                            type="button"
                            onClick={() => handleOpenItemDiscountModal(item)}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                              item.discountValue > 0 || item.discountPercent > 0
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 ring-1 ring-amber-400 font-bold shadow-2xs'
                                : (item.additionValue || 0) > 0
                                ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 ring-1 ring-blue-400 font-bold shadow-2xs'
                                : item.priceOverridden
                                ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200 ring-1 ring-indigo-400 font-bold shadow-2xs'
                                : 'hover:bg-amber-50 text-slate-400 hover:text-amber-600'
                            }`}
                            title={
                              canAlterUnitPrice
                                ? 'Desconto, Acréscimo ou Alterar Preço Unitário'
                                : 'Aplicar desconto ou acréscimo neste produto (% ou R$)'
                            }
                          >
                            <Tag size={14} />
                          </button>

                          {/* Botão Remover Item */}
                          <button
                            type="button"
                            onClick={() => handleRemoveFromCart(item.productId)}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                            title="Remover Item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Rodapé Informativo do Cupom: Último Item Escaneado */}
          {lastAddedItem && (
            <div className="bg-slate-900 text-white px-3.5 py-2 text-xs sm:text-sm flex items-center justify-between border-t border-slate-800 shrink-0">
              <div className="flex items-center gap-2 truncate">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span className="text-slate-400 text-xs font-bold uppercase">Último Item:</span>
                <span className="font-bold truncate text-sm sm:text-base text-white">{lastAddedItem.description}</span>
                {canAlterUnitPrice ? (
                  <button
                    type="button"
                    onClick={() => handleOpenItemDiscountModal(lastAddedItem, 'alterar_preco')}
                    className="inline-flex items-center gap-1 text-emerald-300 hover:text-indigo-300 font-mono text-xs sm:text-sm underline decoration-dotted cursor-pointer"
                    title="Clique para alterar o preço unitário do último item"
                  >
                    <span>({formatQuantity(lastAddedItem.quantity)} {lastAddedItem.unit} x {formatCurrency(lastAddedItem.unitPrice)})</span>
                    <Pencil size={11} />
                  </button>
                ) : (
                  <span className="text-emerald-300 font-mono text-xs sm:text-sm">({formatQuantity(lastAddedItem.quantity)} {lastAddedItem.unit} x {formatCurrency(lastAddedItem.unitPrice)})</span>
                )}
                {lastAddedItem.discountValue > 0 && (
                  <span className="text-amber-300 text-xs font-bold font-mono">
                    [-{formatCurrency(lastAddedItem.discountValue)}]
                  </span>
                )}
              </div>
              <span className="font-black text-sm sm:text-lg text-emerald-400 font-mono shrink-0 ml-3">
                {formatCurrency(lastAddedItem.totalPrice)}
              </span>
            </div>
          )}
        </div>

        {/* Painel Direito: Cockpit Financeiro & Finalização Fixado na Tela */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col h-full min-h-0 justify-between gap-1.5 overflow-hidden">
          {/* Identificação do Cliente: Somente o seletor e o botão + Novo Cliente */}
          <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-xs shrink-0">
            <div className="flex items-center gap-1.5">
              <CustomerSearchCombobox
                customers={customers}
                selectedCustomerId={selectedCustomerId}
                onSelectCustomer={(id) => setSelectedCustomerId(id)}
                onOpenNewCustomerModal={() => setShowQuickCustomerModal(true)}
                placeholder="Pesquisar cliente [F3]..."
                size="sm"
                allowAnonymous={true}
                anonymousLabel="Consumidor Final (Não Identificado)"
                customInputRef={customerSelectRef}
                className="flex-1 min-w-0"
              />

              <button
                type="button"
                onClick={() => setShowQuickCustomerModal(true)}
                className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg border border-emerald-200 transition-colors cursor-pointer shrink-0 shadow-2xs"
                title="Cadastrar novo cliente no balcão [Shift+F3]"
              >
                <UserPlus size={13} />
                <span className="whitespace-nowrap">+ Novo Cliente</span>
              </button>
            </div>

            {selectedCustomer && selectedCustomerVoucherBalance > 0 && (
              <div className="mt-1.5 bg-amber-50 border border-amber-300 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] text-amber-900">
                <div className="flex items-center gap-1.5 font-bold min-w-0">
                  <Ticket size={14} className="text-amber-600 shrink-0" />
                  <span className="truncate">
                    Cliente possui Vale / Crédito disponível ({selectedCustomerVouchers.map((v) => v.code).join(', ')})
                  </span>
                </div>
                <span className="font-mono font-black text-amber-800 shrink-0 bg-white px-1.5 py-0.5 rounded border border-amber-200">
                  {formatCurrency(selectedCustomerVoucherBalance)}
                </span>
              </div>
            )}
          </div>

          {/* Painel LED de Total a Pagar do PDV */}
          <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white px-3.5 py-2 sm:py-2.5 rounded-xl shadow-md border border-slate-800 shrink-0 space-y-1">
            {/* Subtotal em destaque legível de longe */}
            <div className="flex justify-between items-center font-mono text-xs sm:text-sm">
              <span className="font-bold tracking-wider text-slate-400 uppercase">
                SUBTOTAL ({cart.reduce((s, i) => s + i.quantity, 0)} ITENS):
              </span>
              <span className="text-sm sm:text-base font-black text-slate-100">
                {formatCurrency(grossSubtotal)}
              </span>
            </div>

            {totalItemDiscounts > 0 && (
              <div className="flex justify-between items-center text-amber-400 font-mono text-xs sm:text-sm">
                <span className="font-bold">
                  DESC. PRODUTOS:
                </span>
                <span className="font-extrabold">-{formatCurrency(totalItemDiscounts)}</span>
              </div>
            )}

            {discountVal > 0 && (
              <div className="flex justify-between items-center text-rose-400 font-mono text-xs sm:text-sm">
                <span className="font-bold">
                  DESCONTO PEDIDO [F4] ({discountType === 'percent' ? `${effectiveDiscountPercent.toFixed(1).replace('.0', '')}%` : formatCurrency(discountVal)}):
                </span>
                <span className="font-extrabold">-{formatCurrency(discountVal)}</span>
              </div>
            )}

            {/* Total Líquido Gigante em estilo LED Balcão */}
            <div className="pt-1.5 border-t border-slate-800/90 flex items-baseline justify-between gap-2">
              <div>
                <span className="block text-xs sm:text-sm font-black text-emerald-400 uppercase tracking-widest font-mono">
                  TOTAL LÍQUIDO
                </span>
                <span className="text-[10px] text-slate-400 font-mono hidden sm:block">
                  Cálculo automático
                </span>
              </div>
              <div className="text-2xl sm:text-3xl lg:text-[36px] font-black text-emerald-400 font-mono tracking-tight leading-none drop-shadow-xs">
                {formatCurrency(total)}
              </div>
            </div>
          </div>

          {/* Formas de Pagamento e Desconto com Cockpit do Operador e Botão Finalizar Destacado */}
          <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-xs flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
            <div className="space-y-2 overflow-hidden">
              {/* Desconto com Alternância entre % e R$ */}
              <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-100 gap-1">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-slate-700 text-[11px]">Desconto [F4]:</span>
                  <div className="inline-flex rounded-md bg-slate-100 p-0.5 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleDiscountTypeChange('percent')}
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-all ${
                        discountType === 'percent'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Desconto Percentual (%)"
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDiscountTypeChange('value')}
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-all ${
                        discountType === 'value'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Desconto em Reais (R$)"
                    >
                      R$
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <div className="relative flex items-center">
                    {discountType === 'value' && (
                      <span className="absolute left-1.5 text-[10px] font-bold text-slate-400">R$</span>
                    )}
                    <input
                      ref={discountInputRef}
                      type="text"
                      inputMode="decimal"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                      placeholder={discountType === 'percent' ? '0' : '0,00'}
                      className={`w-14 py-0.5 bg-slate-50 border border-slate-200 rounded-md text-right font-extrabold text-slate-900 text-xs focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-emerald-500 ${
                        discountType === 'value' ? 'pl-5 pr-1' : 'px-1'
                      }`}
                    />
                  </div>
                  <span className="text-slate-400 font-semibold text-[10px] whitespace-nowrap">
                    {discountType === 'percent' ? (
                      <>(Máx: {currentUser.permissions.maxDiscountPercent}%)</>
                    ) : (
                      <>(Máx: {formatCurrency((subtotalAfterItemDiscounts * currentUser.permissions.maxDiscountPercent) / 100)})</>
                    )}
                  </span>
                </div>
              </div>

              {/* Guia Rápido de Teclas & Formas Aceitas no Caixa */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2 space-y-1.5">
                <div className="flex items-center justify-between text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                  <span>Formas Disponíveis:</span>
                  {paymentMethod ? (
                    <span className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 normal-case flex items-center gap-1 text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                      <span>
                        Selecionado: <strong className="font-extrabold uppercase">{
                          paymentMethod === 'dinheiro' ? 'Dinheiro' :
                          paymentMethod === 'pix' ? 'PIX' :
                          paymentMethod === 'cartao_debito' ? 'Débito' :
                          paymentMethod === 'cartao_credito' ? 'Crédito' :
                          paymentMethod === 'boleto' ? 'Boleto' :
                          paymentMethod === 'crediario' ? 'Crediário' : paymentMethod
                        }</strong>
                      </span>
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-bold">PDV Ativo</span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-1 text-center">
                  {/* Dinheiro */}
                  <button
                    type="button"
                    onClick={() => {
                      if (paymentMethod === 'dinheiro') {
                        setPaymentMethod('');
                        setPaymentTerm('');
                      } else {
                        handleSelectPaymentMethod('dinheiro');
                      }
                    }}
                    className={`rounded-lg px-1 py-1.5 shadow-2xs flex flex-col items-center justify-center transition-all cursor-pointer relative border ${
                      paymentMethod === 'dinheiro'
                        ? 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-400 font-black shadow-xs scale-[1.02]'
                        : 'bg-white border-slate-200/90 text-slate-800 hover:bg-amber-50/60 hover:border-amber-300'
                    }`}
                    title="Selecionar pagamento em Dinheiro"
                  >
                    <Coins size={13} className={paymentMethod === 'dinheiro' ? 'text-white mb-0.5' : 'text-amber-600 mb-0.5'} />
                    <span className={`text-[10px] leading-none ${paymentMethod === 'dinheiro' ? 'font-black text-white' : 'font-extrabold text-slate-800'}`}>
                      Dinheiro
                    </span>
                    {paymentMethod === 'dinheiro' && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-600 text-white rounded-full text-[8px] flex items-center justify-center font-black shadow-xs">
                        ✓
                      </span>
                    )}
                  </button>

                  {/* PIX */}
                  <button
                    type="button"
                    onClick={() => {
                      if (paymentMethod === 'pix') {
                        setPaymentMethod('');
                        setPaymentTerm('');
                      } else {
                        handleSelectPaymentMethod('pix');
                      }
                    }}
                    className={`rounded-lg px-1 py-1.5 shadow-2xs flex flex-col items-center justify-center transition-all cursor-pointer relative border ${
                      paymentMethod === 'pix'
                        ? 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-400 font-black shadow-xs scale-[1.02]'
                        : 'bg-white border-slate-200/90 text-slate-800 hover:bg-emerald-50/60 hover:border-emerald-300'
                    }`}
                    title="Selecionar pagamento via PIX"
                  >
                    <QrCode size={13} className={paymentMethod === 'pix' ? 'text-white mb-0.5' : 'text-emerald-600 mb-0.5'} />
                    <span className={`text-[10px] leading-none ${paymentMethod === 'pix' ? 'font-black text-white' : 'font-extrabold text-emerald-800'}`}>
                      PIX
                    </span>
                    {paymentMethod === 'pix' && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-600 text-white rounded-full text-[8px] flex items-center justify-center font-black shadow-xs">
                        ✓
                      </span>
                    )}
                  </button>

                  {/* Cartão */}
                  <button
                    type="button"
                    onClick={() => {
                      if (paymentMethod === 'cartao_debito') {
                        handleSelectPaymentMethod('cartao_credito');
                      } else if (paymentMethod === 'cartao_credito') {
                        setPaymentMethod('');
                        setPaymentTerm('');
                      } else {
                        handleSelectPaymentMethod('cartao_debito');
                      }
                    }}
                    className={`rounded-lg px-1 py-1.5 shadow-2xs flex flex-col items-center justify-center transition-all cursor-pointer relative border ${
                      paymentMethod === 'cartao_debito' || paymentMethod === 'cartao_credito'
                        ? 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-400 font-black shadow-xs scale-[1.02]'
                        : 'bg-white border-slate-200/90 text-slate-800 hover:bg-blue-50/60 hover:border-blue-300'
                    }`}
                    title={`Selecionar Cartão (${paymentMethod === 'cartao_credito' ? 'Crédito' : paymentMethod === 'cartao_debito' ? 'Débito' : 'Débito/Crédito'}). Clique para alternar.`}
                  >
                    <CreditCard size={13} className={paymentMethod === 'cartao_debito' || paymentMethod === 'cartao_credito' ? 'text-white mb-0.5' : 'text-blue-600 mb-0.5'} />
                    <span className={`text-[10px] leading-none ${paymentMethod === 'cartao_debito' || paymentMethod === 'cartao_credito' ? 'font-black text-white' : 'font-extrabold text-blue-800'}`}>
                      {paymentMethod === 'cartao_credito' ? 'Crédito' : paymentMethod === 'cartao_debito' ? 'Débito' : 'Cartão'}
                    </span>
                    {(paymentMethod === 'cartao_debito' || paymentMethod === 'cartao_credito') && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-600 text-white rounded-full text-[8px] flex items-center justify-center font-black shadow-xs">
                        ✓
                      </span>
                    )}
                  </button>

                  {/* A Prazo */}
                  <button
                    type="button"
                    onClick={() => {
                      if (paymentMethod === 'boleto') {
                        handleSelectPaymentMethod('crediario');
                      } else if (paymentMethod === 'crediario') {
                        setPaymentMethod('');
                        setPaymentTerm('');
                      } else {
                        handleSelectPaymentMethod('boleto');
                      }
                    }}
                    className={`rounded-lg px-1 py-1.5 shadow-2xs flex flex-col items-center justify-center transition-all cursor-pointer relative border ${
                      paymentMethod === 'boleto' || paymentMethod === 'crediario'
                        ? 'bg-purple-600 text-white border-purple-700 ring-2 ring-purple-400 font-black shadow-xs scale-[1.02]'
                        : 'bg-white border-slate-200/90 text-slate-800 hover:bg-purple-50/60 hover:border-purple-300'
                    }`}
                    title={`Selecionar A Prazo (${paymentMethod === 'crediario' ? 'Crediário' : paymentMethod === 'boleto' ? 'Boleto' : 'Boleto/Crediário'}). Clique para alternar.`}
                  >
                    <FileText size={13} className={paymentMethod === 'boleto' || paymentMethod === 'crediario' ? 'text-white mb-0.5' : 'text-purple-600 mb-0.5'} />
                    <span className={`text-[10px] leading-none ${paymentMethod === 'boleto' || paymentMethod === 'crediario' ? 'font-black text-white' : 'font-extrabold text-purple-800'}`}>
                      {paymentMethod === 'crediario' ? 'Crediário' : paymentMethod === 'boleto' ? 'Boleto' : 'A Prazo'}
                    </span>
                    {(paymentMethod === 'boleto' || paymentMethod === 'crediario') && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-600 text-white rounded-full text-[8px] flex items-center justify-center font-black shadow-xs">
                        ✓
                      </span>
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/60 font-semibold">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.2 bg-white border border-slate-300 rounded font-mono font-bold text-slate-700 text-[9px]">F2</kbd> Buscar
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.2 bg-white border border-slate-300 rounded font-mono font-bold text-slate-700 text-[9px]">F4</kbd> Desconto
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.2 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-mono font-bold text-[9px]">F9</kbd> Finalizar
                  </span>
                </div>
              </div>
            </div>

            {/* Botão FINALIZAR PEDIDO (F9) - Tom verde padrão do sistema (idêntico ao botão PDV Balcão) */}
            <div className="pt-2 shrink-0">
              <button
                type="button"
                onClick={handlePreFinalizeSale}
                className="w-full relative z-10 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black py-3 sm:py-3.5 px-3.5 rounded-xl shadow-md hover:shadow-lg flex items-center justify-between gap-2 transition-all cursor-pointer active:scale-[0.99] border border-emerald-500"
                title="Concluir venda no PDV e abrir recebimento [F9]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-700/60 flex items-center justify-center shrink-0 border border-emerald-500/50">
                    <CheckCircle2 size={20} className="text-white" />
                  </div>
                  <div className="text-left">
                    <span className="block font-black text-sm sm:text-base uppercase tracking-wider leading-tight text-white">
                      Finalizar Pedido
                    </span>
                    <span className="block text-[11px] font-semibold text-emerald-100 leading-none mt-0.5">
                      {cart.length === 0
                        ? 'Adicione produtos no leitor'
                        : `${cart.reduce((s, i) => s + i.quantity, 0)} ${cart.reduce((s, i) => s + i.quantity, 0) === 1 ? 'item' : 'itens'} no carrinho`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="bg-emerald-700 hover:bg-emerald-800 text-white font-mono font-extrabold text-xs px-2.5 py-1 rounded-lg border border-emerald-500/70 tracking-wider shadow-2xs">
                    F9
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: CONSULTA / BUSCA RÁPIDA DE PRODUTOS [F2] */}
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
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
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
                        handleSelectStagedPosProduct(p);
                        setShowProductLookupModal(false);
                      }}
                      className="p-3 hover:bg-blue-50/60 cursor-pointer flex items-center justify-between transition-colors group"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                            {p.code}
                          </span>
                          <span className="font-bold text-slate-800 text-xs sm:text-sm group-hover:text-blue-600">
                            {p.description}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                          {p.barcode && <span>EAN: {p.barcode} • </span>}
                          <span>Família: {p.family} • </span>
                          <span className={stock.quantity <= 0 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-semibold'}>
                            Estoque Local: {formatQuantity(stock.quantity)} {p.unit} (Total: {formatQuantity(totalStock.physical)})
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-extrabold text-sm text-slate-900">
                          {formatCurrency(StockEngine.getProductPriceForCompany(p, currentCompany.id))}
                        </div>
                        <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                          + Adicionar à Venda
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
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Fechar [ESC]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QUANTIDADE FRACIONADA [F12] (ATÉ 3 CASAS DECIMAIS COM RECÁLCULO AUTOMÁTICO DO TOTAL LÍQUIDO) */}
      {showFractionalQtyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-5 space-y-4 max-h-[90vh] flex flex-col">
            {/* Cabeçalho */}
            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0">
                  <Scale size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base text-slate-900">Quantidade Fracionada</h3>
                    <kbd className="px-2 py-0.5 bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-mono font-bold rounded">
                      F12
                    </kbd>
                  </div>
                  <p className="text-xs text-slate-500">
                    Até 3 casas decimais após a vírgula com cálculo automático do Total Líquido.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowFractionalQtyModal(false);
                  barcodeInputRef.current?.focus();
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Fechar [Esc]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Informações do Produto Selecionado ou Seletor */}
            {selectedFractionalItem ? (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                    Produto Selecionado no Cupom:
                  </span>
                  <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {selectedFractionalItem.productCode}
                  </span>
                </div>
                <div className="font-bold text-slate-900 text-sm sm:text-base leading-snug">
                  {selectedFractionalItem.description}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 pt-1 border-t border-slate-200/70">
                  <span>
                    Preço Unitário:{' '}
                    <strong className="text-slate-900 font-mono">{formatCurrency(selectedFractionalItem.unitPrice)}</strong>
                    {' / '}{selectedFractionalItem.unit}
                  </span>
                  {selectedFractionalBal && (
                    <span className="text-[11px] text-slate-500">
                      Estoque no local:{' '}
                      <strong className={selectedFractionalBal.quantity <= 0 ? 'text-rose-600' : 'text-emerald-700'}>
                        {formatQuantity(selectedFractionalBal.quantity, 3)} {selectedFractionalItem.unit}
                      </strong>
                    </span>
                  )}
                </div>

                {/* Se houver mais de 1 item no carrinho, permitir alternar facilmente */}
                {cart.length > 1 && (
                  <div className="pt-2 border-t border-slate-200/70">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Alternar Item do Cupom:
                    </label>
                    <select
                      value={fractionalProductId}
                      onChange={(e) => handleOpenFractionalModal(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    >
                      {cart.map((it) => (
                        <option key={it.productId} value={it.productId}>
                          {it.productCode} - {it.description} (Atual: {formatQuantity(it.quantity, 3)} {it.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
                <span className="font-bold block">Definir Quantidade Multiplicadora para a Próxima Leitura</span>
                <p className="text-blue-700">
                  Nenhum item adicionado ao carrinho ainda. O valor informado será aplicado automaticamente ao próximo produto escaneado.
                </p>
              </div>
            )}

            {/* Formulário / Campo da Quantidade Fracionada */}
            <form onSubmit={(e) => { e.preventDefault(); handleConfirmFractionalQty(); }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Quantidade Fracionada ({selectedFractionalItem?.unit || 'UN / KG / MT'}):
                </label>
                <div className="relative">
                  <input
                    ref={fractionalInputRef}
                    type="text"
                    inputMode="decimal"
                    placeholder="0,000"
                    value={fractionalQtyInput}
                    onChange={(e) => handleQtyInputChange(e.target.value)}
                    className="w-full pl-4 pr-16 py-3 bg-slate-50 border-2 border-emerald-500/80 rounded-xl text-2xl font-black text-center text-slate-900 font-mono focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-400 focus:border-emerald-600 transition-all shadow-inner"
                    autoFocus
                  />
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-xs text-slate-500 bg-slate-200 px-2 py-1 rounded">
                    {selectedFractionalItem?.unit || 'UN'}
                  </div>
                </div>
                <span className="block text-[11px] text-slate-500 mt-1">
                  Digite com vírgula ou ponto (máx. 3 casas decimais, ex: <strong>0,350</strong> ou <strong>1,275</strong>)
                </span>
              </div>

              {/* Botões Rápidos de Incremento / Atalhos de Peso / Metragem */}
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Adicionar Fracionamento Rápido:
                </span>
                <div className="grid grid-cols-5 gap-1.5">
                  {[0.05, 0.1, 0.25, 0.5, 1.0].map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => handleAddFraction(step)}
                      className="px-2 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg text-xs font-bold font-mono transition-colors cursor-pointer text-slate-700"
                    >
                      +{step.toFixed(3).replace('.', ',')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Botões de Valores Prontos (Presets) */}
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Valores Prontos Comuns:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 5.0].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSetPreset(preset)}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold font-mono text-slate-700 transition-colors cursor-pointer"
                    >
                      {preset.toFixed(3).replace('.', ',')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Painel do Cálculo Automático do Total Líquido em Tempo Real */}
              <div className="p-3.5 bg-slate-900 rounded-xl text-white border border-slate-800 shadow-md space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                    <Calculator size={14} />
                    Cálculo Automático do Total Líquido
                  </span>
                  <span className="font-mono text-[11px] text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                    {previewFractionalRounded.toFixed(3).replace('.', ',')} × {formatCurrency(itemUnitPrice)}
                  </span>
                </div>

                {selectedFractionalItem && (
                  <div className="flex items-center justify-between text-xs text-slate-300 pt-1 border-t border-slate-800">
                    <span>Subtotal deste item:</span>
                    <span className="font-mono font-bold text-white text-sm">
                      {formatCurrency(previewItemNetTotal)}
                    </span>
                  </div>
                )}

                <div className="flex items-baseline justify-between pt-2 border-t border-slate-800">
                  <div>
                    <span className="text-xs font-black tracking-wider text-emerald-400 uppercase font-mono block">
                      TOTAL LÍQUIDO DA VENDA
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Recalculado instantaneamente
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono tracking-tight drop-shadow-xs">
                    {formatCurrency(simulatedTotalLiquido)}
                  </div>
                </div>
              </div>

              {/* Ações / Botões */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowFractionalQtyModal(false);
                    barcodeInputRef.current?.focus();
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar [Esc]
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 size={16} />
                  <span>Confirmar Quantidade [Enter]</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DESCONTO / ACRÉSCIMO / ALTERAR PREÇO POR PRODUTO */}
      {showItemDiscountModal && (() => {
        const itemUnderDiscount = cart.find((i) => i.productId === discountingItemId);
        if (!itemUnderDiscount) return null;
        const catalogProduct = dbState.products.find((p) => p.id === itemUnderDiscount.productId);
        const originalCatalogPrice =
          itemUnderDiscount.originalUnitPrice ??
          (catalogProduct
            ? StockEngine.getProductPriceForCompany(catalogProduct, currentCompany.id)
            : itemUnderDiscount.unitPrice);

        const itemGrossTotal = itemUnderDiscount.quantity * itemUnderDiscount.unitPrice;
        const rawInput = parseFloat(itemDiscountInput.replace(',', '.')) || 0;

        let previewDeltaVal = 0;
        let previewDeltaPct = 0;
        let previewNetTotal = itemGrossTotal;

        if (itemAdjustmentMode === 'alterar_preco') {
          const previewUnit = rawInput > 0 ? rawInput : itemUnderDiscount.unitPrice;
          previewNetTotal = Math.max(0, Math.round(itemUnderDiscount.quantity * previewUnit * 100) / 100);
        } else if (itemAdjustmentMode === 'acrescimo') {
          if (itemDiscountType === 'percent') {
            previewDeltaPct = Math.max(0, rawInput);
            previewDeltaVal = (itemGrossTotal * previewDeltaPct) / 100;
          } else {
            previewDeltaVal = Math.max(0, rawInput);
            previewDeltaPct = itemGrossTotal > 0 ? (previewDeltaVal / itemGrossTotal) * 100 : 0;
          }
          previewNetTotal = Math.max(0, itemGrossTotal + previewDeltaVal);
        } else {
          if (itemDiscountType === 'percent') {
            previewDeltaPct = Math.min(100, Math.max(0, rawInput));
            previewDeltaVal = (itemGrossTotal * previewDeltaPct) / 100;
          } else {
            previewDeltaVal = Math.min(itemGrossTotal, Math.max(0, rawInput));
            previewDeltaPct = itemGrossTotal > 0 ? (previewDeltaVal / itemGrossTotal) * 100 : 0;
          }
          previewNetTotal = Math.max(0, itemGrossTotal - previewDeltaVal);
        }

        const isPriceMode = itemAdjustmentMode === 'alterar_preco';
        const isAddMode = itemAdjustmentMode === 'acrescimo';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
            <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4 max-h-[90vh] flex flex-col">
              {/* Cabeçalho */}
              <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                      isPriceMode
                        ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                        : isAddMode
                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                        : 'bg-amber-100 border-amber-300 text-amber-700'
                    }`}
                  >
                    {isPriceMode ? <Pencil size={19} /> : <Tag size={20} />}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">
                      {isPriceMode
                        ? 'Alterar Preço Unitário'
                        : isAddMode
                        ? 'Acréscimo no Produto'
                        : 'Desconto por Produto'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {isPriceMode
                        ? 'Substitui o valor unitário somente nesta venda (sem alterar o cadastro)'
                        : isAddMode
                        ? 'Aplicar acréscimo exclusivo para este item no cupom'
                        : 'Aplicar desconto exclusivo para este item no cupom'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowItemDiscountModal(false);
                    barcodeInputRef.current?.focus();
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Fechar [Esc]"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Abas: Desconto / Acréscimo / Alterar Preço (RBAC) */}
              <div className={`grid gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 ${canAlterUnitPrice ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <button
                  type="button"
                  onClick={() => {
                    setItemAdjustmentMode('desconto');
                    setItemDiscountType('percent');
                    setItemDiscountInput(
                      itemUnderDiscount.discountPercent > 0
                        ? itemUnderDiscount.discountPercent.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')
                        : ''
                    );
                    setTimeout(() => {
                      itemDiscountInputRef.current?.focus();
                      itemDiscountInputRef.current?.select();
                    }, 30);
                  }}
                  className={`py-1.5 px-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                    itemAdjustmentMode === 'desconto'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Desconto (-)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setItemAdjustmentMode('acrescimo');
                    setItemDiscountType('percent');
                    setItemDiscountInput(
                      (itemUnderDiscount.additionPercent || 0) > 0
                        ? (itemUnderDiscount.additionPercent || 0).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')
                        : ''
                    );
                    setTimeout(() => {
                      itemDiscountInputRef.current?.focus();
                      itemDiscountInputRef.current?.select();
                    }, 30);
                  }}
                  className={`py-1.5 px-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                    itemAdjustmentMode === 'acrescimo'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
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
                      setItemDiscountInput(itemUnderDiscount.unitPrice.toFixed(2).replace('.', ','));
                      setTimeout(() => {
                        itemDiscountInputRef.current?.focus();
                        itemDiscountInputRef.current?.select();
                      }, 30);
                    }}
                    className={`py-1.5 px-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                      itemAdjustmentMode === 'alterar_preco'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Alterar Preço
                  </button>
                )}
              </div>

              {/* Resumo do Produto Selecionado */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {itemUnderDiscount.productCode}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">
                    {formatQuantity(itemUnderDiscount.quantity)} {itemUnderDiscount.unit} x {formatCurrency(itemUnderDiscount.unitPrice)}
                  </span>
                </div>
                <div className="font-bold text-slate-900 text-sm sm:text-base leading-snug">
                  {itemUnderDiscount.description}
                </div>
                <div className="flex justify-between items-center text-xs pt-1.5 border-t border-slate-200/80">
                  <span className="text-slate-500 font-semibold">
                    {isPriceMode ? 'Preço Original Cadastrado:' : 'Valor Bruto do Item:'}
                  </span>
                  <span className="font-extrabold text-slate-800 font-mono text-sm">
                    {isPriceMode ? formatCurrency(originalCatalogPrice) : formatCurrency(itemGrossTotal)}
                  </span>
                </div>
              </div>

              {/* Formulário */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleApplyItemDiscount();
                }}
                className="space-y-3.5"
              >
                <div>
                  {isPriceMode ? (
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">Novo Preço Unitário (R$):</label>
                      {Math.abs(itemUnderDiscount.unitPrice - originalCatalogPrice) > 0.004 && (
                        <button
                          type="button"
                          onClick={() => setItemDiscountInput(originalCatalogPrice.toFixed(2).replace('.', ','))}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                        >
                          <RotateCcw size={11} />
                          Restaurar Original ({formatCurrency(originalCatalogPrice)})
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        {isAddMode ? 'Tipo de Acréscimo:' : 'Tipo de Desconto:'}
                      </label>
                      <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setItemDiscountType('percent')}
                          className={`px-3 py-1 text-xs font-bold rounded-md cursor-pointer transition-all ${
                            itemDiscountType === 'percent'
                              ? isAddMode
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'bg-amber-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          % Percentual
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemDiscountType('value')}
                          className={`px-3 py-1 text-xs font-bold rounded-md cursor-pointer transition-all ${
                            itemDiscountType === 'value'
                              ? isAddMode
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'bg-amber-600 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          R$ Reais
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="relative">
                    {(isPriceMode || itemDiscountType === 'value') && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400 select-none">
                        R$
                      </span>
                    )}
                    <input
                      ref={itemDiscountInputRef}
                      type="text"
                      inputMode="decimal"
                      placeholder={
                        isPriceMode
                          ? originalCatalogPrice.toFixed(2).replace('.', ',')
                          : itemDiscountType === 'percent'
                          ? 'Ex: 10'
                          : 'Ex: 5,00'
                      }
                      value={itemDiscountInput}
                      onChange={(e) => setItemDiscountInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                      className={`w-full py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-right font-black text-slate-900 text-xl font-mono focus:outline-hidden focus:bg-white focus:ring-2 transition-all ${
                        isPriceMode
                          ? 'pl-10 pr-3 focus:border-indigo-500 focus:ring-indigo-400/40'
                          : isAddMode
                          ? `${itemDiscountType === 'value' ? 'pl-10 pr-3' : 'pl-3 pr-10'} focus:border-blue-500 focus:ring-blue-400/40`
                          : `${itemDiscountType === 'value' ? 'pl-10 pr-3' : 'pl-3 pr-10'} focus:border-amber-500 focus:ring-amber-400/40`
                      }`}
                    />
                    {!isPriceMode && itemDiscountType === 'percent' && (
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400 select-none">
                        %
                      </span>
                    )}
                  </div>

                  {!isPriceMode && !isAddMode && (
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                      <span>Limite do operador: <strong>{currentUser.permissions.maxDiscountPercent}%</strong></span>
                      {itemDiscountType === 'value' && (
                        <span className="text-slate-400">
                          (Máx: {formatCurrency((itemGrossTotal * currentUser.permissions.maxDiscountPercent) / 100)})
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Botões de Atalho Rápido de % (Desconto) */}
                {!isPriceMode && !isAddMode && itemDiscountType === 'percent' && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Atalhos:</span>
                    {[5, 10, 15, 20]
                      .filter((p) => p <= currentUser.permissions.maxDiscountPercent)
                      .map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setItemDiscountInput(pct.toString())}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-amber-100 hover:text-amber-900 text-slate-700 font-extrabold text-xs rounded-md border border-slate-200 cursor-pointer transition-colors"
                        >
                          {pct}%
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setItemDiscountInput('0')}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-md border border-slate-200 cursor-pointer transition-colors ml-auto"
                    >
                      Zerar
                    </button>
                  </div>
                )}

                {/* Pré-visualização ao Vivo do Item */}
                <div className="p-3 bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-xl space-y-1 font-mono text-xs border border-slate-800">
                  {isPriceMode ? (
                    <>
                      <div className="flex justify-between text-slate-400">
                        <span>Preço Original Cadastrado:</span>
                        <span>{formatCurrency(originalCatalogPrice)}</span>
                      </div>
                      <div className="flex justify-between text-indigo-300 font-bold">
                        <span>Novo Preço Unitário:</span>
                        <span>{formatCurrency(rawInput > 0 ? rawInput : itemUnderDiscount.unitPrice)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-slate-400">
                        <span>Bruto do Item:</span>
                        <span>{formatCurrency(itemGrossTotal)}</span>
                      </div>
                      <div className={`flex justify-between font-bold ${isAddMode ? 'text-blue-400' : 'text-amber-400'}`}>
                        <span>{isAddMode ? 'Acréscimo a Aplicar:' : 'Desconto a Aplicar:'}</span>
                        <span>
                          {isAddMode ? '+' : '-'}
                          {formatCurrency(previewDeltaVal)}{' '}
                          {previewDeltaPct > 0 ? `(${previewDeltaPct.toFixed(1).replace('.0', '')}%)` : ''}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex items-baseline justify-between pt-1.5 border-t border-slate-800">
                    <span className="text-xs uppercase font-extrabold text-emerald-400">
                      Novo Total do Item:
                    </span>
                    <span className="text-xl font-black text-emerald-400">
                      {formatCurrency(previewNetTotal)}
                    </span>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                  <div>
                    {!isPriceMode && (itemUnderDiscount.discountValue > 0 || (itemUnderDiscount.additionValue || 0) > 0) && (
                      <button
                        type="button"
                        onClick={handleRemoveItemDiscount}
                        className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer border border-rose-200"
                      >
                        {isAddMode ? 'Remover Acréscimo' : 'Remover Desconto'}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowItemDiscountModal(false);
                        barcodeInputRef.current?.focus();
                      }}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      Cancelar [Esc]
                    </button>
                    <button
                      type="submit"
                      className={`px-5 py-2 text-xs font-extrabold text-white rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer ${
                        isPriceMode
                          ? 'bg-indigo-600 hover:bg-indigo-700'
                          : isAddMode
                          ? 'bg-blue-600 hover:bg-blue-700'
                          : 'bg-amber-600 hover:bg-amber-700'
                      }`}
                    >
                      <CheckCircle2 size={15} />
                      <span>
                        {isPriceMode
                          ? 'Confirmar Preço [Enter]'
                          : isAddMode
                          ? 'Aplicar Acréscimo [Enter]'
                          : 'Aplicar Desconto [Enter]'}
                      </span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODAL: ÚLTIMAS VENDAS DO TURNO COM REIMPRESSÃO E CANCELAMENTO */}
      {showRecentSalesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl p-5 space-y-3.5 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Receipt size={18} className="text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Vendas Recentes no Balcão</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRecentSalesModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 text-xs">
              {recentOrders.length === 0 ? (
                <div className="p-8 text-center text-slate-400">Nenhuma venda registrada ainda no balcão hoje.</div>
              ) : (
                recentOrders.map((ord) => (
                  <div key={ord.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span>{ord.number}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold uppercase ${
                          ord.status === 'cancelado'
                            ? 'bg-rose-100 text-rose-700'
                            : ord.status === 'em_romaneio'
                            ? 'bg-indigo-100 text-indigo-700'
                            : ord.status === 'em_transito'
                            ? 'bg-blue-100 text-blue-700'
                            : ord.status === 'nao_entregue'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
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
                            : ord.status === 'cancelado'
                            ? 'Cancelado'
                            : ord.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                        {ord.customerName} • {new Date(ord.createdAt).toLocaleTimeString('pt-BR')} • {ord.items.length} itens ({ord.paymentMethod.toUpperCase()})
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900">{formatCurrency(ord.total)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setLastFinishedOrder(ord);
                          setShowReceiptModal(true);
                        }}
                        className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg"
                        title="Reimprimir Comprovante"
                      >
                        <Printer size={15} />
                      </button>

                      {ord.status !== 'cancelado' && currentUser.permissions.canCancelSales && (
                        <button
                          type="button"
                          onClick={() => setCancellingOrderId(ord.id)}
                          className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg"
                          title="Cancelar Venda e Estornar Estoque"
                        >
                          <RotateCcw size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowRecentSalesModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ABERTURA DE CAIXA PDV */}
      {showOpenRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl space-y-3">
            <h3 className="font-bold text-slate-900 text-base">Abertura de Caixa do Balcão</h3>
            <p className="text-xs text-slate-500">
              Informe o valor de suprimento inicial (fundo de troco em moedas e notas) para abrir o caixa do turno.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fundo de Troco Inicial (R$)</label>
              <input
                type="text"
                value={openRegisterAmount}
                onChange={(e) => setOpenRegisterAmount(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-extrabold text-slate-900 focus:outline-hidden"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowOpenRegisterModal(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleOpenCashRegister}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs"
              >
                Confirmar Abertura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CANCELAMENTO DE VENDA COM JUSTIFICATIVA AUDITADA */}
      {cancellingOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-3">
            <h3 className="font-bold text-slate-900 text-base text-rose-600 flex items-center gap-1.5">
              <RotateCcw size={18} />
              <span>Confirmar Cancelamento de Venda</span>
            </h3>
            <p className="text-xs text-slate-500">
              Esta ação irá estornar automaticamente as quantidades vendidas para o estoque e anular os recebimentos financeiros.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivo do Cancelamento (Obrigatório para Auditoria):
              </label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Cliente desistiu da compra / Erro de digitação na quantidade..."
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCancellingOrderId(null);
                  setCancelReason('');
                }}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => {
                  const ord = dbState.orders.find((o) => o.id === cancellingOrderId);
                  if (ord) handleConfirmCancelSale(ord);
                }}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-xs"
              >
                Confirmar Estorno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CADASTRO RÁPIDO DE CLIENTE NO BALCÃO [F3] */}
      <PosQuickCustomerModal
        isOpen={showQuickCustomerModal}
        onClose={() => setShowQuickCustomerModal(false)}
        onCustomerSelected={(cust) => setSelectedCustomerId(cust.id)}
        currentUserName={currentUser.name}
      />

      {/* MODAL: FINALIZAR PEDIDO NO PDV BALCÃO (FORMA DE PAGAMENTO, PRAZO DE PAGAMENTO E CONFIRMAÇÃO) */}
      {showSaleConfirmationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] flex flex-col my-auto">
            {/* Cabeçalho do Modal */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <h3 className="font-black text-base sm:text-lg text-slate-900 leading-tight">
                    Finalizar Pedido • PDV Balcão
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Selecione a Forma e o Prazo de Pagamento para concluir
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSaleConfirmationModal(false);
                  barcodeInputRef.current?.focus();
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                title="Fechar [ESC]"
              >
                <X size={20} />
              </button>
            </div>

            {/* Conteúdo com Rolagem Interna Segura */}
            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              {/* Card Resumo do Pedido / Total Líquido a Pagar */}
              <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white p-3.5 sm:p-4 rounded-xl border border-slate-800 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300 pb-1.5 border-b border-slate-800/80">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <User size={13} className="text-blue-400" />
                    <span className="truncate max-w-[240px] sm:max-w-[320px]">
                      {selectedCustomer ? selectedCustomer.name : 'Consumidor Final (Não Identificado)'}
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {cart.reduce((s, i) => s + i.quantity, 0)} {cart.reduce((s, i) => s + i.quantity, 0) === 1 ? 'item' : 'itens'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Total Líquido a Pagar
                    </span>
                    {(totalItemDiscounts + discountVal) > 0 && (
                      <span className="text-[10px] text-amber-400 font-medium">
                        (Descontos: -{formatCurrency(totalItemDiscounts + discountVal)})
                      </span>
                    )}
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono tracking-tight">
                    {formatCurrency(total)}
                  </div>
                </div>
              </div>

              {/* 1. SELEÇÃO DA FORMA DE PAGAMENTO */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <span>1. Forma de Pagamento: *</span>
                    {!paymentMethod && (
                      <span className="text-[10px] font-bold text-rose-600 animate-pulse">
                        (Selecione uma opção)
                      </span>
                    )}
                  </span>
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                    paymentMethod
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-rose-50 text-rose-700 border-rose-300'
                  }`}>
                    OBRIGATÓRIO
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { id: 'pix', label: 'Pix', icon: <QrCode size={16} /> },
                    { id: 'dinheiro', label: 'Dinheiro', icon: <DollarSign size={16} /> },
                    { id: 'cartao_debito', label: 'Débito', icon: <CreditCard size={16} /> },
                    { id: 'cartao_credito', label: 'Crédito', icon: <CreditCard size={16} /> },
                    { id: 'boleto', label: 'Boleto', icon: <Barcode size={16} /> },
                    { id: 'crediario', label: 'Crediário', icon: <FileText size={16} /> },
                  ].map((p) => {
                    const isSelected = paymentMethod === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPaymentMethod(p.id as any)}
                        className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl text-xs font-extrabold border-2 transition-all cursor-pointer min-h-[56px] ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        {p.icon}
                        <span className="truncate">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. SELEÇÃO DO PRAZO DE PAGAMENTO COM AUTOMAÇÃO */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Clock size={13} className="text-amber-600" />
                    <span>2. Prazo de Pagamento: *</span>
                    {!paymentTerm && (
                      <span className="text-[10px] font-bold text-rose-600 animate-pulse">
                        (Selecione um prazo)
                      </span>
                    )}
                  </span>
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                    paymentTerm
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-rose-50 text-rose-700 border-rose-300'
                  }`}>
                    OBRIGATÓRIO
                  </span>
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
                  className={`w-full rounded-xl px-3 py-2 text-xs sm:text-sm font-bold cursor-pointer focus:outline-hidden focus:ring-2 shadow-2xs transition-all ${
                    paymentTerm
                      ? 'bg-white border-2 border-slate-300 text-slate-900 focus:ring-blue-500 focus:border-blue-500'
                      : 'bg-rose-50/50 border-2 border-rose-300 text-rose-950 focus:ring-rose-500'
                  }`}
                >
                  <option value="">-- Selecione o Prazo de Pagamento (Obrigatório) --</option>
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
                          {installments > 1 ? `Parcelado (${installments}x de ${formatCurrency(total / installments)})` : 'Parcelado (1x)'}
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

                {/* Mensagem Explicativa da Regra Automática */}
                {paymentMethod && (
                  <p className="text-[11px] text-slate-500 italic">
                    {(paymentMethod === 'pix' || paymentMethod === 'dinheiro' || paymentMethod === 'cartao_debito') ? (
                      <>Prazo <strong>"À Vista / Imediato"</strong> selecionado automaticamente para {paymentMethod === 'pix' ? 'Pix' : paymentMethod === 'dinheiro' ? 'Dinheiro' : 'Débito'}.</>
                    ) : (
                      <>Prazo <strong>"Parcelado (1x)"</strong> selecionado automaticamente. Você pode escolher outro prazo acima ou alterar as parcelas abaixo.</>
                    )}
                  </p>
                )}
              </div>

              {/* SELEÇÃO DE PARCELAS QUANDO FOR PARCELADO OU CRÉDITO / BOLETO / CREDIÁRIO */}
              {(paymentTerm === 'parcelado' || paymentMethod === 'cartao_credito' || paymentMethod === 'boleto' || paymentMethod === 'crediario' || Database.resolvePaymentTermInfo(paymentTerm, installments).installmentsCount > 1 || installments > 1) && (
                <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200 space-y-1.5 animate-fadeIn">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-extrabold text-blue-900 flex items-center gap-1.5">
                      <CreditCard size={14} className="text-blue-600" />
                      <span>Parcelamento da Venda:</span>
                    </span>
                    <span className="text-[11px] font-black text-blue-800 font-mono">
                      {installments}x de {formatCurrency(total / (installments || 1))}
                    </span>
                  </div>
                  <select
                    value={installments}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setInstallments(n);
                      setPaymentTerm('parcelado');
                    }}
                    className="w-full bg-white border border-blue-300 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-extrabold text-slate-900 cursor-pointer focus:ring-2 focus:ring-blue-500 shadow-2xs"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <option key={n} value={n}>
                        {n}x de {formatCurrency(total / n)} {n === 1 ? '(Parcela Única)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* PAINEL ESPECÍFICO: DINHEIRO (VALOR RECEBIDO, TROCO E CÉDULAS RÁPIDAS) */}
              {paymentMethod === 'dinheiro' && (
                <div className="bg-gradient-to-br from-emerald-50/80 via-slate-50 to-emerald-50/40 p-3 rounded-xl border border-emerald-300 shadow-2xs space-y-2 animate-fadeIn">
                  <div className="grid grid-cols-2 gap-2.5 items-stretch">
                    {/* Valor Recebido */}
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200 shadow-2xs flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1">
                        <span className="block text-[11px] font-black text-slate-700 uppercase tracking-wide">
                          Valor Recebido:
                        </span>
                        <span className="text-[10px] font-bold text-emerald-700 font-mono bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">
                          R$
                        </span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400 select-none">
                          R$
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={receivedAmount}
                          onChange={(e) => setReceivedAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                          className="w-full pl-9 pr-2 py-2 bg-slate-50 hover:bg-white focus:bg-white border-2 border-emerald-500 focus:border-emerald-600 rounded-lg text-right font-black text-slate-900 text-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-400 shadow-inner transition-all"
                        />
                      </div>
                    </div>

                    {/* Troco */}
                    <div className={`p-2.5 rounded-xl border-2 flex flex-col justify-between text-right transition-all shadow-2xs ${
                      change > 0
                        ? 'bg-emerald-50 border-emerald-500'
                        : numericReceived > 0 && numericReceived < total
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-white border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        {change > 0 ? (
                          <span className="text-[10px] font-black uppercase text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                            Devolver
                          </span>
                        ) : numericReceived > 0 && numericReceived < total ? (
                          <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md">
                            Pendente
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400">
                            Status
                          </span>
                        )}
                        <span className="block text-[11px] font-black text-slate-700 uppercase tracking-wide">
                          Troco:
                        </span>
                      </div>
                      <div className="flex flex-col items-end justify-center py-0.5">
                        <span className={`text-xl sm:text-2xl font-black font-mono leading-none tracking-tight ${
                          change > 0
                            ? 'text-emerald-600'
                            : numericReceived > 0 && numericReceived < total
                            ? 'text-amber-700'
                            : 'text-slate-400'
                        }`}>
                          {formatCurrency(change)}
                        </span>
                        {numericReceived > 0 && numericReceived < total && (
                          <span className="text-[10px] font-bold text-amber-700 font-mono mt-0.5">
                            Falta {formatCurrency(total - numericReceived)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cédulas Rápidas */}
                  <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-emerald-200/60 text-[10px]">
                    <span className="text-slate-500 font-extrabold text-[10px] hidden sm:inline">Cédulas:</span>
                    <div className="flex items-center gap-1 w-full sm:w-auto justify-between sm:justify-end">
                      {[10, 20, 50, 100].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleQuickBill(val)}
                          className="flex-1 sm:flex-initial px-2 py-1 bg-white hover:bg-emerald-100 hover:text-emerald-900 border border-slate-300 font-black text-slate-700 rounded-lg shadow-2xs transition-colors cursor-pointer text-center text-[11px]"
                        >
                          {formatCurrency(val)}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => handleQuickBill(total)}
                        className="flex-1 sm:flex-initial px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg shadow-2xs transition-colors cursor-pointer text-center text-xs"
                        title="Valor Exato da Venda"
                      >
                        Exato
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* PAINEL ESPECÍFICO: BOLETO BANCÁRIO */}
              {paymentMethod === 'boleto' && (
                <div className="bg-amber-50/90 p-3 rounded-xl border border-amber-300 space-y-1.5 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                      <Barcode size={13} className="text-amber-700" />
                      Conta / Banco Vinculado ao Boleto:
                    </span>
                    <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                      Cobrança
                    </span>
                  </div>
                  <select
                    value={selectedBoletoAccountId}
                    onChange={(e) => setSelectedBoletoAccountId(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-amber-500 shadow-2xs"
                  >
                    {Database.getBoletoAccounts(currentCompany.id).map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} {acc.bankCode ? `(${acc.bankCode})` : ''} - Ag: {acc.agency || '-'} C/C: {acc.accountNumber || '-'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Rodapé / Botões de Ação */}
            <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                disabled={isFinalizingSale}
                onClick={() => {
                  if (!isFinalizingSale) {
                    setShowSaleConfirmationModal(false);
                    barcodeInputRef.current?.focus();
                  }
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer order-2 sm:order-1"
              >
                Voltar ao Carrinho [ESC]
              </button>

              <button
                type="button"
                disabled={isFinalizingSale || !paymentMethod || !paymentTerm || (paymentMethod === 'dinheiro' && numericReceived > 0 && numericReceived < total)}
                onClick={handleFinalizeSale}
                className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-sm rounded-xl shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer order-1 sm:order-2 active:scale-[0.99]"
              >
                {isFinalizingSale ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                <span>{isFinalizingSale ? 'SALVANDO NO FIREBASE...' : 'CONFIRMAR E EMITIR VENDA (Enter)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COMPROVANTE TÉRMICO / WHATSAPP */}
      {lastFinishedOrder && (
        <ReceiptModal
          order={lastFinishedOrder}
          company={currentCompany}
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
        />
      )}

      {/* MODAL: BUSCA PREÇO (EXCLUSIVAMENTE PARA CONSULTA) */}
      <PriceLookupModal
        isOpen={showPriceLookupModal}
        onClose={() => setShowPriceLookupModal(false)}
        companyId={currentCompany.id}
        companyName={currentCompany.tradeName || currentCompany.name}
        selectedLocationId={selectedLocationId}
        selectedLocationName={locations.find((l) => l.id === selectedLocationId)?.name || 'Comercial'}
        onAfterClose={() => barcodeInputRef.current?.focus()}
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
