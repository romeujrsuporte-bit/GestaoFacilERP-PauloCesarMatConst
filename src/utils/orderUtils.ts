import { Order, OrderCommercialKind, StockMovement } from '../types';

/**
 * Identifica se um pedido é do tipo Bonificação (brinde, cortesia ou ação promocional sem cobrança financeira).
 */
export function isBonusOrder(order?: Partial<Order> | null): boolean {
  if (!order) return false;
  return order.orderKind === 'bonificacao';
}

/**
 * Identifica se um pedido compõe vendas faturáveis (exclui orçamentos, cancelados e pedidos de bonificação).
 * Deve ser utilizado em todos os indicadores de faturamento, ticket médio, comissões, DRE e curva ABC de vendas.
 */
export function isBillableSaleOrder(order?: Partial<Order> | null): boolean {
  if (!order) return false;
  if (order.type !== 'venda') return false;
  if (order.status === 'cancelado') return false;
  if (isBonusOrder(order)) return false;
  return true;
}

/**
 * Retorna o subtotal de referência dos itens (útil para consulta e relatórios de bonificação).
 */
export function getOrderReferenceSubtotal(order?: Partial<Order> | null): number {
  if (!order) return 0;
  if (typeof order.referenceSubtotal === 'number' && !Number.isNaN(order.referenceSubtotal)) {
    return order.referenceSubtotal;
  }
  if (isBonusOrder(order)) {
    return (order.items || []).reduce((acc, item) => acc + (item.unitPrice || 0) * (item.quantity || 0), 0);
  }
  return order.subtotal || 0;
}

/**
 * Retorna o valor total de referência dos itens de um pedido de bonificação (sem efeito financeiro).
 */
export function getOrderReferenceTotal(order?: Partial<Order> | null): number {
  if (!order) return 0;
  if (typeof order.referenceTotal === 'number' && !Number.isNaN(order.referenceTotal)) {
    return order.referenceTotal;
  }
  if (isBonusOrder(order)) {
    return (order.items || []).reduce((acc, item) => {
      const lineTotal = typeof item.totalPrice === 'number' ? item.totalPrice : (item.unitPrice || 0) * (item.quantity || 0);
      return acc + lineTotal;
    }, 0);
  }
  return order.total || 0;
}

/**
 * Retorna o rótulo comercial amigável do tipo de pedido.
 */
export function getOrderCommercialKindLabel(kind?: OrderCommercialKind): string {
  return kind === 'bonificacao' ? 'Bonificação' : 'Venda Normal';
}

/**
 * Formata a descrição padronizada da movimentação de saída de estoque por bonificação.
 */
export function formatBonusStockExitNote(orderNumber: string, extraContext?: string): string {
  const base = `Saída de Estoque – Bonificação – Pedido nº ${orderNumber}`;
  return extraContext ? `${base} (${extraContext})` : base;
}

/**
 * Formata a descrição padronizada de estorno de estoque de bonificação (cancelamento ou edição).
 */
export function formatBonusStockReversalNote(
  orderNumber: string,
  extraContext?: string,
  reason?: string
): string {
  const base = `Estorno de Estoque – Bonificação – Pedido nº ${orderNumber}`;
  const withContext = extraContext ? `${base} (${extraContext})` : base;
  return reason ? `${withContext}. Motivo: ${reason}` : withContext;
}

/**
 * Formata o rótulo legível do tipo de movimentação de estoque para exibição no histórico.
 */
export function getStockMovementTypeLabel(type: StockMovement['type']): string {
  switch (type) {
    case 'inicial':
      return 'Saldo Inicial';
    case 'entrada_compra':
      return 'Entrada por Compra';
    case 'saida_venda':
      return 'Saída por Venda';
    case 'saida_bonificacao':
      return 'Saída por Bonificação';
    case 'estorno_bonificacao':
      return 'Estorno de Bonificação';
    case 'consumo_producao':
      return 'Consumo Produção';
    case 'entrada_producao':
      return 'Entrada Produção';
    case 'ajuste_inventario':
      return 'Ajuste Inventário';
    case 'perda_avaria':
      return 'Perda / Avaria';
    case 'devolucao':
      return 'Devolução / Estorno';
    case 'transferencia_saida':
      return 'Transf. Saída';
    case 'transferencia_entrada':
      return 'Transf. Entrada';
    case 'transferencia_empresa_saida':
      return 'Transf. Empresa (Saída)';
    case 'transferencia_empresa_entrada':
      return 'Transf. Empresa (Entrada)';
    default:
      return String(type).replace(/_/g, ' ');
  }
}
