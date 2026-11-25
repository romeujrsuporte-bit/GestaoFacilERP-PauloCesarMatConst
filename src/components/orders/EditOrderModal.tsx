import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Save,
  Plus,
  Trash2,
  AlertTriangle,
  ShoppingCart,
  User,
  CreditCard,
  FileText,
  Package,
  Layers,
  Check,
  Barcode,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import { Order, OrderItem, Product, Customer, DiscountAuthorizationRecord } from '../../types';
import { Database } from '../../services/db';
import { StockEngine } from '../../services/stockEngine';
import { formatCurrency } from '../../services/pricingEngine';
import { toast } from '../../services/toast';
import { CustomerSearchCombobox } from './CustomerSearchCombobox';
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
import {
  isBonusOrder,
  formatBonusStockExitNote,
  formatBonusStockReversalNote,
} from '../../utils/orderUtils';

interface EditOrderModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onSaved: (updatedOrder: Order) => void;
}

export const EditOrderModal: React.FC<EditOrderModalProps> = ({
  isOpen,
  order,
  onClose,
  onSaved,
}) => {
  const dbState = Database.getState();
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();
  const canAlterUnitPrice = Database.canCurrentUserAlterUnitPrice(currentUser);
  const unitPriceOverrideRole: 'admin' | 'gerente' = Database.isAdmin(currentUser) ? 'admin' : 'gerente';

  const [items, setItems] = useState<OrderItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerCpfCnpj, setCustomerCpfCnpj] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<Order['paymentMethod']>('pix');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [installmentsCount, setInstallmentsCount] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');

  // Desconto com suporte a % e R$
  const [discountType, setDiscountType] = useState<'percent' | 'value'>(() => {
    return (localStorage.getItem('omni_discount_type') as 'percent' | 'value') || 'percent';
  });
  const [discountInput, setDiscountInput] = useState<string>('');

  // Adicionar item avulso
  const [addSearch, setAddSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [addQuantity, setAddQuantity] = useState<string>('1');
  const [addUnitPrice, setAddUnitPrice] = useState<string>('0');
  const [saleObservationAlerts, setSaleObservationAlerts] = useState<SaleObservationAlertItem[]>([]);
  const lastAlertedProductIdRef = useRef<string>('');
  const saleSessionIdRef = useRef<string>(generateSaleSessionId('EDIT'));
  const [discountAuthPrompt, setDiscountAuthPrompt] = useState<{
    violation: DiscountViolationDetails;
    queuePosition?: { current: number; total: number };
    onAuthorized: (record: DiscountAuthorizationRecord) => void;
    onReduceToLimit?: () => void;
  } | null>(null);

  const handleCloseSafely = () => {
    clearSaleSessionAuthorizations(saleSessionIdRef.current);
    saleSessionIdRef.current = generateSaleSessionId('EDIT');
    setDiscountAuthPrompt(null);
    onClose();
  };

  useEffect(() => {
    clearSaleSessionAuthorizations(saleSessionIdRef.current);
    saleSessionIdRef.current = generateSaleSessionId('EDIT');
    setDiscountAuthPrompt(null);

    if (order) {
      setItems(order.items.map((it) => ({ ...it })));
      setSelectedCustomerId(order.customerId || '');
      setCustomerName(order.customerName || '');
      setCustomerPhone(order.customerPhone || '');
      setCustomerCpfCnpj(order.customerCpfCnpj || '');
      setPaymentMethod(order.paymentMethod);
      setBankAccountId(order.bankAccountId || Database.getBoletoAccounts()[0]?.id || '');
      setInstallmentsCount(order.installmentsCount || 1);
      setNotes(order.notes || '');

      // Iniciar desconto existente
      if (order.discountTotal > 0) {
        if (discountType === 'percent' && order.subtotal > 0) {
          const calcPercent = ((order.discountTotal / order.subtotal) * 100).toFixed(1);
          setDiscountInput(calcPercent.endsWith('.0') ? calcPercent.replace('.0', '') : calcPercent);
        } else {
          setDiscountInput(order.discountTotal.toFixed(2).replace('.', ','));
        }
      } else {
        setDiscountInput('');
      }

      const initialCust = order.customerId
        ? dbState.customers.find((c) => c.id === order.customerId)
        : undefined;
      setSaleObservationAlerts(syncCustomerSaleAlert([], initialCust));
    } else {
      setSaleObservationAlerts([]);
    }
  }, [order, isOpen]);

  // Seletor de produto para adicionar
  const companyProducts = dbState.products.filter(
    (p) => p.status === 'ativo'
  );

  const targetCompanyId = order?.companyId || Database.getCurrentCompany().id;

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    const prod = companyProducts.find((p) => p.id === productId);
    if (prod) {
      const effPrice = StockEngine.getProductPriceForCompany(prod, targetCompanyId);
      setAddUnitPrice(effPrice.toFixed(2).replace('.', ','));
      setAddQuantity('1');
      const prodObsAlert = getProductSaleAlert(prod);
      if (prodObsAlert) {
        lastAlertedProductIdRef.current = prod.id;
        setSaleObservationAlerts((prev) => upsertSaleAlert(prev, prodObsAlert));
      } else {
        lastAlertedProductIdRef.current = '';
      }
    } else {
      lastAlertedProductIdRef.current = '';
    }
  };

  const handleAddItem = () => {
    if (!selectedProductId) {
      alert('Selecione um produto para adicionar ao pedido.');
      return;
    }

    const prod = companyProducts.find((p) => p.id === selectedProductId);
    if (!prod) return;

    const effPrice = StockEngine.getProductPriceForCompany(prod, targetCompanyId);
    const qty = Math.max(0.001, parseFloat(addQuantity.replace(',', '.')) || 1);
    const parsedPrice = parseFloat(addUnitPrice.replace(',', '.'));
    const requestedPrice =
      canAlterUnitPrice && Number.isFinite(parsedPrice) && parsedPrice > 0
        ? Math.round(parsedPrice * 100) / 100
        : effPrice;
    const isDirectPriceOverride =
      canAlterUnitPrice && Math.abs(requestedPrice - effPrice) > 0.004;

    const existingIndex = items.findIndex((i) => i.productId === prod.id);
    const commitAdd = (finalUnitPrice: number, authorization?: DiscountAuthorizationRecord | null) => {
      const overridden = canAlterUnitPrice && Math.abs(finalUnitPrice - effPrice) > 0.004;
      if (existingIndex >= 0) {
        const updated = items.map((it, idx) => {
          if (idx !== existingIndex) return it;
          if (
            it.discountAuthorization?.operationId &&
            it.discountAuthorization.operationId !== authorization?.operationId
          ) {
            revokeDiscountAuthorization(it.discountAuthorization.operationId);
          }
          const nextQty = it.quantity + qty;
          return {
            ...it,
            quantity: nextQty,
            unitPrice: finalUnitPrice,
            referenceUnitPrice: overridden ? finalUnitPrice : (it.referenceUnitPrice ?? effPrice),
            originalUnitPrice: it.originalUnitPrice ?? effPrice,
            priceOverridden: overridden ? true : it.priceOverridden,
            priceOverriddenByRole: overridden ? unitPriceOverrideRole : it.priceOverriddenByRole,
            discountPercent: overridden ? 0 : it.discountPercent,
            discountValue: overridden ? 0 : it.discountValue,
            additionPercent: overridden ? 0 : it.additionPercent,
            additionValue: overridden ? 0 : it.additionValue,
            totalPrice: Math.round(nextQty * finalUnitPrice * 100) / 100,
            discountAuthorization: overridden ? undefined : (authorization || undefined),
          };
        });
        setItems(updated);
      } else {
        const newItem: OrderItem = {
          id: 'ITEM-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          productId: prod.id,
          productCode: prod.code,
          description: prod.description,
          unit: prod.unit,
          quantity: qty,
          unitPrice: finalUnitPrice,
          referenceUnitPrice: overridden ? finalUnitPrice : effPrice,
          originalUnitPrice: effPrice,
          priceOverridden: overridden ? true : undefined,
          priceOverriddenByRole: overridden ? unitPriceOverrideRole : undefined,
          discountPercent: 0,
          discountValue: 0,
          additionPercent: 0,
          additionValue: 0,
          totalPrice: Math.round(qty * finalUnitPrice * 100) / 100,
          unitCost: prod.costPrice,
          locationId: prod.defaultLocationId || 'loc-comercial',
          discountAuthorization: overridden ? undefined : (authorization || undefined),
        };
        setItems([...items, newItem]);
      }

      const alreadyAlertedOnSelect = lastAlertedProductIdRef.current === prod.id;
      lastAlertedProductIdRef.current = '';
      if (!alreadyAlertedOnSelect) {
        const prodObsAlert = getProductSaleAlert(prod);
        if (prodObsAlert) {
          setSaleObservationAlerts((prev) => upsertSaleAlert(prev, prodObsAlert));
        }
      }

      // Reset campos de inclusão
      setSelectedProductId('');
      setAddQuantity('1');
      setAddUnitPrice('0');
      setAddSearch('');
    };

    // Alteração direta de preço unitário por Administrador Geral / Gerente Geral é independente de desconto
    if (isDirectPriceOverride) {
      commitAdd(requestedPrice, null);
      return;
    }

    const resultQty = existingIndex >= 0 ? items[existingIndex].quantity + qty : qty;
    if (prod.maxDiscountEnabled && requestedPrice < effPrice) {
      const evaluation = evaluateItemMaxDiscount({
        product: prod,
        companyId: targetCompanyId,
        origin: 'edicao_pedido',
        quantity: resultQty,
        unitPrice: requestedPrice,
        referenceUnitPrice: effPrice,
        existingAuthorization: null,
        saleSessionId: saleSessionIdRef.current,
        users: dbState.users,
      });

      if (evaluation.requiresAuthorization && evaluation.violation) {
        setDiscountAuthPrompt({
          violation: evaluation.violation,
          onAuthorized: (record) => {
            setDiscountAuthPrompt(null);
            commitAdd(requestedPrice, record);
            toast.success(
              `Preço reduzido autorizado por ${record.authorizerUserName} para "${prod.description}".`,
              'Autorização Concedida'
            );
          },
          onReduceToLimit: () => {
            setDiscountAuthPrompt(null);
            const maxUnitDiscount = resultQty > 0 ? evaluation.maxDiscountValueAllowed / resultQty : 0;
            const minAllowedUnitPrice = Math.min(
              effPrice,
              Math.ceil(Math.max(0, effPrice - maxUnitDiscount) * 100) / 100
            );
            commitAdd(minAllowedUnitPrice, null);
            toast.info(
              `Preço unitário ajustado para o mínimo permitido (${formatCurrency(minAllowedUnitPrice)}).`,
              'Preço Ajustado ao Limite'
            );
          },
        });
        return;
      }
    }

    commitAdd(requestedPrice, null);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      alert('O pedido não pode ficar sem nenhum produto.');
      return;
    }
    const removed = items[index];
    if (removed?.discountAuthorization?.operationId) {
      revokeDiscountAuthorization(removed.discountAuthorization.operationId);
    }
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleUpdateItemQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) return;
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        if (it.discountAuthorization?.operationId && Math.abs(it.quantity - newQty) > 0.0005) {
          revokeDiscountAuthorization(it.discountAuthorization.operationId);
        }
        return {
          ...it,
          quantity: newQty,
          totalPrice: Math.round(newQty * it.unitPrice * 100) / 100,
          discountAuthorization:
            Math.abs(it.quantity - newQty) > 0.0005 ? undefined : it.discountAuthorization,
        };
      })
    );
  };

  const handleUpdateItemPrice = (index: number, newPriceStr: string) => {
    if (!canAlterUnitPrice) return;
    const rawVal = parseFloat(newPriceStr.replace(',', '.'));
    if (!Number.isFinite(rawVal) || rawVal < 0) return;
    const val = Math.round(rawVal * 100) / 100;
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        const catalogProd = dbState.products.find((p) => p.id === it.productId);
        const catalogPrice = catalogProd
          ? StockEngine.getProductPriceForCompany(catalogProd, targetCompanyId)
          : it.unitPrice;
        const origPrice = it.originalUnitPrice ?? catalogPrice;
        const isOverridden = Math.abs(val - origPrice) > 0.004;
        const priceChanged = Math.abs(it.unitPrice - val) > 0.004;
        if (it.discountAuthorization?.operationId && priceChanged) {
          revokeDiscountAuthorization(it.discountAuthorization.operationId);
        }
        return {
          ...it,
          unitPrice: val,
          referenceUnitPrice: val,
          originalUnitPrice: origPrice,
          priceOverridden: isOverridden,
          priceOverriddenByRole: isOverridden ? unitPriceOverrideRole : undefined,
          discountPercent: priceChanged ? 0 : it.discountPercent,
          discountValue: priceChanged ? 0 : it.discountValue,
          additionPercent: priceChanged ? 0 : it.additionPercent,
          additionValue: priceChanged ? 0 : it.additionValue,
          totalPrice: Math.round(it.quantity * val * 100) / 100,
          discountAuthorization: priceChanged ? undefined : it.discountAuthorization,
        };
      })
    );
  };

  const handleCustomerChange = (custId: string) => {
    setSelectedCustomerId(custId);
    const cust = dbState.customers.find((c) => c.id === custId);
    if (cust) {
      setCustomerName(cust.name);
      setCustomerPhone(cust.phone || cust.whatsapp || '');
      setCustomerCpfCnpj(cust.cpfCnpj || '');
    }
    setSaleObservationAlerts((prev) => syncCustomerSaleAlert(prev, cust));
  };

  const handleDiscountTypeChange = (newType: 'percent' | 'value') => {
    setDiscountType(newType);
    localStorage.setItem('omni_discount_type', newType);
  };

  const isBonus = isBonusOrder(order);

  // Cálculos do Pedido
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const parsedDiscountNum = isBonus ? 0 : Math.max(0, parseFloat(discountInput.replace(',', '.')) || 0);
  const maxAllowedPercent = currentUser.permissions.maxDiscountPercent;
  const maxAllowedVal = (subtotal * maxAllowedPercent) / 100;

  let discountVal = 0;
  if (!isBonus) {
    if (discountType === 'percent') {
      const safePercent = Math.min(maxAllowedPercent, parsedDiscountNum);
      discountVal = (subtotal * safePercent) / 100;
    } else {
      discountVal = Math.min(subtotal, parsedDiscountNum);
    }
  }
  const effectiveDiscountPercent = subtotal > 0 ? (discountVal / subtotal) * 100 : 0;
  const finalTotal = isBonus ? 0 : Math.max(0, subtotal - discountVal);

  const commitSaveOrder = (itemsToSave: OrderItem[], globalDiscountToSave: number) => {
    if (!order) return;

    const nowIso = new Date().toISOString();
    const state = Database.getState();
    const saveSubtotal = itemsToSave.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const saveFinalTotal = isBonus ? 0 : Math.max(0, saveSubtotal - globalDiscountToSave);

    try {
      const targetBoletoAccount = !isBonus && paymentMethod === 'boleto'
        ? Database.getBoletoAccounts().find((a) => a.id === bankAccountId) || Database.getBoletoAccounts()[0]
        : undefined;

      const updatedOrderDraft: Order = {
        ...order,
        orderKind: isBonus ? 'bonificacao' : order.orderKind || 'venda_normal',
        customerId: selectedCustomerId || undefined,
        customerName,
        customerPhone: customerPhone || undefined,
        customerCpfCnpj: customerCpfCnpj || undefined,
        paymentMethod: isBonus ? 'bonificacao' : paymentMethod,
        paymentTerm: isBonus ? 'Sem Cobrança (Bonificação)' : order.paymentTerm,
        bankAccountId: isBonus ? undefined : targetBoletoAccount?.id,
        bankAccountName: isBonus ? undefined : targetBoletoAccount?.name,
        installmentsCount: isBonus ? 0 : installmentsCount,
        items: itemsToSave,
        subtotal: isBonus ? 0 : saveSubtotal,
        discountTotal: isBonus ? 0 : globalDiscountToSave,
        total: saveFinalTotal,
        referenceSubtotal: isBonus ? saveSubtotal : order.referenceSubtotal,
        referenceTotal: isBonus ? saveSubtotal : order.referenceTotal,
        receivedAmount: isBonus ? 0 : order.receivedAmount,
        changeAmount: isBonus ? 0 : order.changeAmount,
        financialGenerated: isBonus ? false : order.financialGenerated,
        notes: `${notes || ''} [Editado por ${currentUser.name} em ${new Date().toLocaleString('pt-BR')}]`,
        updatedAt: nowIso,
      };

      // Validação obrigatória na camada de persistência antes de alterar estoque ou financeiro
      const validatedDiscountAuths = isBonus
        ? []
        : Database.validateOrderDiscountsForPersistence(updatedOrderDraft, {
            saleSessionId: saleSessionIdRef.current,
            existingOrder: order,
            globalOrderDiscountValue: globalDiscountToSave,
          });

      // 1. Reajuste de Estoque (se o pedido original já baixou estoque)
      if (order.stockDeducted) {
        let currentBalances = [...state.stockBalances];
        const movements = [];

        // A: Devolve os itens antigos para estornar a saída anterior
        for (const oldItem of order.items) {
          const locId = oldItem.locationId || 'loc-comercial';
          const loc = state.stockLocations.find((l) => l.id === locId) || state.stockLocations[0];
          const { updatedBalances, createdMovement } = StockEngine.applyMovement(currentBalances, {
            companyId: order.companyId || currentCompany.id,
            productId: oldItem.productId,
            productCode: oldItem.productCode,
            productDescription: oldItem.description,
            locationId: loc.id,
            locationName: loc.name,
            type: isBonus ? 'estorno_bonificacao' : 'ajuste_inventario',
            quantity: oldItem.quantity,
            unitCost: oldItem.unitCost,
            totalCost: oldItem.unitCost * oldItem.quantity,
            originDocType: isBonus ? 'bonificacao' : 'venda',
            originDocId: order.number,
            date: nowIso,
            userId: currentUser.id,
            userName: currentUser.name,
            notes: isBonus
              ? formatBonusStockReversalNote(order.number, 'Reajuste por edição')
              : `Estorno para reajuste/edição do pedido ${order.number}`,
          });
          currentBalances = updatedBalances;
          movements.push(createdMovement);
        }

        // B: Aplica as novas saídas com os itens editados
        for (const newItem of itemsToSave) {
          const locId = newItem.locationId || 'loc-comercial';
          const loc = state.stockLocations.find((l) => l.id === locId) || state.stockLocations[0];
          const { updatedBalances, createdMovement } = StockEngine.applyMovement(currentBalances, {
            companyId: order.companyId || currentCompany.id,
            productId: newItem.productId,
            productCode: newItem.productCode,
            productDescription: newItem.description,
            locationId: loc.id,
            locationName: loc.name,
            type: isBonus ? 'saida_bonificacao' : 'saida_venda',
            quantity: newItem.quantity,
            unitCost: newItem.unitCost,
            totalCost: newItem.unitCost * newItem.quantity,
            originDocType: isBonus ? 'bonificacao' : 'venda',
            originDocId: order.number,
            date: nowIso,
            userId: currentUser.id,
            userName: currentUser.name,
            notes: isBonus
              ? formatBonusStockExitNote(order.number, 'Recalculada por edição')
              : `Saída recalculada por edição do pedido ${order.number}`,
          });
          currentBalances = updatedBalances;
          movements.push(createdMovement);
        }

        state.stockBalances = currentBalances;
        state.stockMovements = [...movements, ...state.stockMovements];
      }

      // 2. Reajuste de Títulos a Receber (NUNCA aplicável para pedidos de bonificação)
      if (!isBonus && state.accountsReceivable) {
        const newInstCount = Math.max(1, installmentsCount);
        const valParcela = Number((saveFinalTotal / newInstCount).toFixed(2));

        state.accountsReceivable = state.accountsReceivable.map((r) => {
          if (r.orderId === order.id) {
            return {
              ...r,
              customerName,
              originalValue: valParcela,
              balance: valParcela,
              totalInstallments: newInstCount,
              paymentMethod: paymentMethod === 'boleto' ? 'Boleto Bancário' : 'Cartão Crédito',
              bankAccountId: paymentMethod === 'boleto' ? targetBoletoAccount?.id : undefined,
              bankAccountName: paymentMethod === 'boleto' ? targetBoletoAccount?.name : undefined,
              bankCode: paymentMethod === 'boleto' ? targetBoletoAccount?.bankCode : undefined,
            };
          }
          return r;
        });
      }

      // 3. Finalizar autorizações e salvar pedido
      const updatedOrder = Database.finalizeOrderDiscountAuthorizations(
        updatedOrderDraft,
        validatedDiscountAuths,
        {
          saleSessionId: saleSessionIdRef.current,
          existingOrder: order,
          skipPersist: true,
        }
      );

      state.orders = state.orders.map((o) => (o.id === order.id ? updatedOrder : o));
      Database.persist();

      Database.addAuditLog(
        'EDITAR_PEDIDO',
        'VENDAS',
        order.id,
        `Pedido/Orçamento ${order.number} editado por ${currentUser.name}. Novo total: ${formatCurrency(saveFinalTotal)}`
      );

      saleSessionIdRef.current = generateSaleSessionId('EDIT');
      onSaved(updatedOrder);
      onClose();
    } catch (err) {
      alert('Erro ao salvar alterações do pedido: ' + (err as Error).message);
    }
  };

  const validateEditOrderAndPromptAuthorizations = (
    itemsToCheck: OrderItem[],
    globalDiscountToCheck: number
  ) => {
    if (!order) return;

    const validation = validateOrderDiscounts({
      items: itemsToCheck,
      products: dbState.products,
      companyId: targetCompanyId,
      origin: 'edicao_pedido',
      globalOrderDiscountValue: globalDiscountToCheck,
      saleSessionId: saleSessionIdRef.current,
      existingOrder: order,
      users: dbState.users,
    });

    if (validation.valid) {
      commitSaveOrder(itemsToCheck, globalDiscountToCheck);
      return;
    }

    const totalViolations = validation.violations.length;
    const first = validation.violations[0];

    setDiscountAuthPrompt({
      violation: first.violation,
      queuePosition: totalViolations > 1 ? { current: 1, total: totalViolations } : undefined,
      onAuthorized: (record) => {
        const nextItems = itemsToCheck.map((it, idx) => {
          if (idx !== first.itemIndex) return it;
          if (it.discountAuthorization?.operationId && it.discountAuthorization.operationId !== record.operationId) {
            revokeDiscountAuthorization(it.discountAuthorization.operationId);
          }
          return { ...it, discountAuthorization: record };
        });
        setItems(nextItems);
        setDiscountAuthPrompt(null);
        toast.success(
          `Desconto autorizado por ${record.authorizerUserName} para "${first.violation.productDescription}".`,
          'Autorização Concedida'
        );
        validateEditOrderAndPromptAuthorizations(nextItems, globalDiscountToCheck);
      },
      onReduceToLimit: () => {
        const targetItem = itemsToCheck[first.itemIndex];
        const refPrice = first.violation.referenceUnitPrice;
        const maxValAllowed = first.violation.maxDiscountValueAllowed;
        const maxPerUnit = targetItem.quantity > 0 ? maxValAllowed / targetItem.quantity : 0;

        if (targetItem.discountAuthorization?.operationId) {
          revokeDiscountAuthorization(targetItem.discountAuthorization.operationId);
        }

        const minUnitPriceAllowed = Math.min(
          refPrice,
          Math.ceil(Math.max(0, refPrice - maxPerUnit) * 100) / 100
        );
        const nextUnitPrice =
          targetItem.unitPrice < minUnitPriceAllowed ? minUnitPriceAllowed : targetItem.unitPrice;
        const manualUsedTotal = Math.max(0, (refPrice - nextUnitPrice) * targetItem.quantity);
        const remainingAfterPrice = Math.max(0, maxValAllowed - manualUsedTotal);
        const clampedItemDisc = Math.min(targetItem.discountValue || 0, remainingAfterPrice);
        const grossLine = targetItem.quantity * nextUnitPrice;
        const clampedItemPct = grossLine > 0 ? (clampedItemDisc / grossLine) * 100 : 0;

        const nextItems = itemsToCheck.map((it, idx) =>
          idx === first.itemIndex
            ? {
                ...it,
                unitPrice: nextUnitPrice,
                referenceUnitPrice: refPrice,
                discountValue: Math.round(clampedItemDisc * 100) / 100,
                discountPercent: Math.round(clampedItemPct * 100) / 100,
                totalPrice: Math.max(0, Math.round((grossLine - clampedItemDisc) * 100) / 100),
                discountAuthorization: undefined,
              }
            : it
        );

        if (first.violation.reason === 'desconto_global' || first.violation.reason === 'combinado') {
          const nextSubtotal = nextItems.reduce((s, it) => s + it.totalPrice, 0);
          const nextLineNet = nextItems[first.itemIndex].totalPrice;
          const remainingForGlobal = Math.max(0, maxValAllowed - manualUsedTotal - clampedItemDisc);
          const maxGlobalAllowed =
            nextLineNet > 0 && nextSubtotal > 0
              ? Math.floor(((remainingForGlobal * nextSubtotal) / nextLineNet) * 100) / 100
              : 0;
          const safeGlobal = Math.max(0, Math.min(globalDiscountToCheck, maxGlobalAllowed));
          setDiscountType('value');
          localStorage.setItem('omni_discount_type', 'value');
          setDiscountInput(safeGlobal > 0 ? safeGlobal.toFixed(2).replace('.', ',') : '');
        }

        setItems(nextItems);
        setDiscountAuthPrompt(null);
        toast.info(
          `Preço/desconto ajustado para o limite permitido de "${first.violation.productDescription}".`,
          'Ajustado ao Limite'
        );
      },
    });
  };

  const handleSave = () => {
    if (!order) return;

    if (items.length === 0) {
      alert('O pedido deve conter pelo menos um item.');
      return;
    }

    if (!customerName.trim()) {
      alert('Informe o nome do cliente.');
      return;
    }

    if (!isBonus && discountVal > maxAllowedVal + 0.01) {
      alert(
        `Desconto não autorizado! Seu perfil permite no máximo ${maxAllowedPercent}% (${formatCurrency(maxAllowedVal)}).`
      );
      return;
    }

    if (isBonus) {
      commitSaveOrder(items, 0);
      return;
    }

    validateEditOrderAndPromptAuthorizations(items, discountVal);
  };

  if (!isOpen || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho do Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center shadow-xs">
              <ShoppingCart size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-base sm:text-lg text-slate-900">
                  Editar {isBonus ? 'Pedido de Bonificação' : order.type === 'orcamento' ? 'Orçamento' : 'Pedido de Venda'}: {order.number}
                </h3>
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    isBonus
                      ? 'bg-sky-100 text-sky-900 border border-sky-300'
                      : order.type === 'orcamento'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {isBonus ? 'BONIFICAÇÃO' : order.type}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {isBonus
                  ? 'Operação sem cobrança financeira — alterações de itens ajustam apenas o estoque de bonificação.'
                  : 'Altere clientes, itens, quantidades, valores e descontos com recálculo automático.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseSafely}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo do Formulário com Rolagem */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Avisos de Observações de Produtos e Cliente */}
          {saleObservationAlerts.length > 0 && (
            <SaleObservationAlerts
              alerts={saleObservationAlerts}
              onDismiss={(id) => setSaleObservationAlerts((prev) => dismissSaleAlert(prev, id))}
              onDismissAll={() => setSaleObservationAlerts([])}
              variant="default"
            />
          )}

          {/* Seção 1: Dados do Cliente e Pagamento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
            {/* Seleção rápida de Cliente Cadastrado */}
            <div>
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                <User size={13} />
                <span>Cliente Vinculado:</span>
              </label>
              <CustomerSearchCombobox
                customers={dbState.customers}
                selectedCustomerId={selectedCustomerId}
                onSelectCustomer={handleCustomerChange}
                placeholder="Digite para buscar cliente..."
              />
            </div>

            {/* Nome do Cliente */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Nome no Pedido:</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome completo do cliente"
                className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Telefone / WhatsApp */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">Telefone / WhatsApp:</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Forma de Pagamento (ou indicador de Bonificação) */}
            <div>
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                <CreditCard size={13} />
                <span>{isBonus ? 'Natureza Financeira:' : 'Forma de Pagamento:'}</span>
              </label>
              {isBonus ? (
                <div className="bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-2 text-[11px] font-black text-sky-900 uppercase">
                  BONIFICAÇÃO — SEM COBRANÇA
                </div>
              ) : (
                <>
                  <div className="flex gap-1.5">
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="pix">Pix</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="cartao_debito">Cartão de Débito</option>
                      <option value="cartao_credito">Cartão de Crédito</option>
                      <option value="boleto">Boleto Bancário</option>
                      <option value="crediario">Crediário Próprio</option>
                    </select>

                    {(paymentMethod === 'cartao_credito' || paymentMethod === 'crediario' || paymentMethod === 'boleto') && (
                      <select
                        value={installmentsCount}
                        onChange={(e) => setInstallmentsCount(Number(e.target.value))}
                        className="w-20 bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-800 focus:outline-hidden"
                        title="Quantidade de Parcelas"
                      >
                        {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
                          <option key={n} value={n}>
                            {n}x
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {paymentMethod === 'boleto' && (
                    <div className="mt-2 bg-amber-50/70 p-2 rounded-lg border border-amber-200">
                      <label className="block text-[11px] text-amber-900 font-bold mb-1 flex items-center gap-1">
                        <Barcode size={12} className="text-amber-700" />
                        Conta / Banco Vinculado:
                      </label>
                      <select
                        value={bankAccountId}
                        onChange={(e) => setBankAccountId(e.target.value)}
                        className="w-full bg-white border border-amber-300 rounded-md p-1.5 text-xs font-bold text-slate-800 cursor-pointer shadow-2xs"
                      >
                        {Database.getBoletoAccounts().map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} {acc.bankCode ? `(${acc.bankCode})` : ''} - Ag: {acc.agency || '-'} C/C: {acc.accountNumber || '-'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Seção 2: Inclusão Rápida de Produtos */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
            <span className="font-extrabold text-slate-800 block text-xs flex items-center gap-1.5">
              <Plus size={14} className="text-emerald-600" />
              <span>Adicionar Produto ao Pedido:</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-6">
                <label className="block text-slate-600 font-semibold mb-1">Selecionar Produto:</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">-- Escolha um produto do catálogo --</option>
                  {companyProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.description} ({formatCurrency(StockEngine.getProductPriceForCompany(p, targetCompanyId))})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-semibold mb-1">Quantidade:</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={addQuantity}
                  onChange={(e) => setAddQuantity(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold text-right text-slate-900 focus:outline-hidden"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-600 font-semibold mb-1">Preço Unit. (R$):</label>
                {canAlterUnitPrice ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={addUnitPrice}
                    onChange={(e) => setAddUnitPrice(e.target.value.replace(/[^0-9.,]/g, ''))}
                    className="w-full bg-white border border-indigo-200 focus:border-indigo-500 rounded-lg p-2 text-xs font-bold text-right text-slate-900 font-mono focus:outline-hidden"
                    title="Alterar preço unitário antes de inserir (Administrador Geral / Gerente Geral)"
                  />
                ) : (
                  <div className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 text-xs font-bold text-right text-slate-600 font-mono select-none">
                    {addUnitPrice || '0,00'}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                >
                  <Plus size={14} />
                  <span>Inserir</span>
                </button>
              </div>
            </div>
          </div>

          {/* Seção 3: Lista de Itens do Pedido */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-extrabold text-slate-800 text-xs">
                Itens no Pedido ({items.length} {items.length === 1 ? 'produto' : 'produtos'}):
              </span>
              <span className="text-[11px] text-slate-500">
                {canAlterUnitPrice
                  ? 'Você pode ajustar quantidades e preços diretamente na tabela abaixo.'
                  : 'Você pode ajustar quantidades diretamente na tabela abaixo.'}
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Código / Descrição</th>
                    <th className="p-2.5 text-center w-28">Quantidade</th>
                    <th className="p-2.5 text-right w-28">Preço Unit.</th>
                    <th className="p-2.5 text-right w-28">Subtotal</th>
                    <th className="p-2.5 text-center w-12">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-2.5">
                        <div className="font-bold text-slate-900">{item.description}</div>
                        <div className="text-[10px] text-slate-400 font-mono">Cód: {item.productCode} • Un: {item.unit}</div>
                      </td>

                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQuantity(idx, Math.max(1, item.quantity - 1))}
                            className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItemQuantity(idx, Math.max(0.01, parseFloat(e.target.value) || 1))}
                            className="w-12 text-center font-bold text-slate-900 border border-slate-200 rounded p-1 bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQuantity(idx, item.quantity + 1)}
                            className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      <td className="p-2.5 text-right">
                        {canAlterUnitPrice ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1">
                              {item.priceOverridden && item.originalUnitPrice !== undefined && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemPrice(idx, item.originalUnitPrice!.toFixed(2))}
                                  className="p-1 text-slate-400 hover:text-indigo-600 rounded cursor-pointer"
                                  title={`Restaurar preço original (${formatCurrency(item.originalUnitPrice)})`}
                                >
                                  <RotateCcw size={12} />
                                </button>
                              )}
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) => handleUpdateItemPrice(idx, e.target.value)}
                                className={`w-22 text-right font-bold border rounded p-1 font-mono ${
                                  item.priceOverridden
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                                    : 'bg-white border-slate-200 text-slate-900'
                                }`}
                              />
                            </div>
                            {item.priceOverridden && item.originalUnitPrice !== undefined && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo-600">
                                <Pencil size={8} />
                                <span>Orig: {formatCurrency(item.originalUnitPrice)}</span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-slate-800 font-mono">
                              {formatCurrency(item.unitPrice)}
                            </span>
                            {item.priceOverridden && (
                              <span className="text-[9px] font-bold text-indigo-600">Preço Alterado</span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="p-2.5 text-right font-black text-slate-900 font-mono">
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </td>

                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                          title="Remover item do pedido"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Seção 4: Desconto & Observações */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            {/* Desconto */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">Desconto Geral do Pedido:</span>

                {/* Seletor % / R$ */}
                <div className="inline-flex rounded-md bg-slate-200/80 p-0.5 border border-slate-300">
                  <button
                    type="button"
                    onClick={() => handleDiscountTypeChange('percent')}
                    className={`px-2 py-0.5 text-xs font-bold rounded cursor-pointer transition-all ${
                      discountType === 'percent'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
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
                  placeholder={discountType === 'percent' ? '0' : '0,00'}
                  className={`w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-right text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 ${
                    discountType === 'value' ? 'pl-8' : ''
                  }`}
                />
              </div>

              <div className="flex justify-between items-center text-[11px] text-slate-500">
                <span>
                  {discountType === 'percent'
                    ? `Máximo permitido: ${maxAllowedPercent}%`
                    : `Máximo permitido: ${formatCurrency(maxAllowedVal)}`}
                </span>
                {discountVal > 0 && (
                  <span className="text-emerald-700 font-bold">
                    {discountType === 'percent'
                      ? `Equiv. -${formatCurrency(discountVal)}`
                      : `Equiv. ${effectiveDiscountPercent.toFixed(1)}%`}
                  </span>
                )}
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                <FileText size={13} />
                <span>Observações do Pedido:</span>
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações internas, prazos ou detalhes da entrega..."
                className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Aviso sobre Estoque se aplicável */}
          {order.stockDeducted && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              <span>
                <strong>Atenção:</strong> Este pedido já possui baixa no estoque. Ao salvar as alterações, o sistema fará o estorno e recalculará as saídas automaticamente no Kardex de estoque.
              </span>
            </div>
          )}
        </div>

        {/* Rodapé com Resumo Financeiro e Ações */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Resumo de Valores */}
          <div className="flex items-center gap-5 sm:gap-8 w-full sm:w-auto justify-between sm:justify-start">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">
                {isBonus ? 'Valor de Referência' : 'Subtotal'}
              </span>
              <span className="text-sm sm:text-base font-extrabold font-mono text-slate-200">
                {formatCurrency(subtotal)}
              </span>
            </div>

            {!isBonus && discountVal > 0 && (
              <div>
                <span className="text-[10px] uppercase font-bold text-rose-400 block font-mono">Desconto</span>
                <span className="text-sm sm:text-base font-extrabold font-mono text-rose-400">
                  -{formatCurrency(discountVal)}
                </span>
              </div>
            )}

            <div>
              <span className={`text-[10px] uppercase font-black block tracking-wider font-mono ${isBonus ? 'text-sky-300' : 'text-emerald-400'}`}>
                {isBonus ? 'TOTAL A COBRAR (BONIFICAÇÃO)' : 'TOTAL DO PEDIDO'}
              </span>
              <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${isBonus ? 'text-sky-300' : 'text-emerald-400'}`}>
                {formatCurrency(finalTotal)}
              </span>
            </div>
          </div>

          {/* Botões */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleCloseSafely}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check size={16} />
              <span>Salvar Alterações do Pedido</span>
            </button>
          </div>
        </div>
      </div>

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
