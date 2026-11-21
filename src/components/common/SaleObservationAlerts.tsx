import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Package, User, X } from 'lucide-react';
import { Customer, Product } from '../../types';

export type SaleObservationAlertSource = 'product' | 'customer';

export interface SaleObservationAlertItem {
  id: string;
  entityKey: string;
  source: SaleObservationAlertSource;
  entityId: string;
  entityName: string;
  entityCode?: string;
  message: string;
  createdAt: number;
}

/**
 * Gera um aviso de venda para o produto somente quando a opção
 * `showSaleAlert` estiver habilitada e houver texto válido em `notes`.
 */
export function getProductSaleAlert(product?: Product | null): SaleObservationAlertItem | null {
  if (!product || !product.showSaleAlert) return null;
  const message = String(product.notes ?? '').trim();
  if (!message) return null;

  return {
    id: `alert-product-${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    entityKey: `product:${product.id}`,
    source: 'product',
    entityId: product.id,
    entityName: product.description || product.code || 'Produto',
    entityCode: product.code || undefined,
    message,
    createdAt: Date.now(),
  };
}

/**
 * Gera um aviso de venda para o cliente somente quando a opção
 * `showSaleAlert` estiver habilitada e houver texto válido em `notes`.
 */
export function getCustomerSaleAlert(customer?: Customer | null): SaleObservationAlertItem | null {
  if (!customer || !customer.showSaleAlert) return null;
  const message = String(customer.notes ?? '').trim();
  if (!message) return null;

  return {
    id: `alert-customer-${customer.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    entityKey: `customer:${customer.id}`,
    source: 'customer',
    entityId: customer.id,
    entityName: customer.name || customer.code || 'Cliente',
    entityCode: customer.code || undefined,
    message,
    createdAt: Date.now(),
  };
}

/**
 * Insere ou atualiza um aviso na fila ativa da venda sem sobrescrever
 * silenciosamente avisos de outros produtos ou do cliente.
 */
export function upsertSaleAlert(
  current: SaleObservationAlertItem[],
  incoming: SaleObservationAlertItem | null
): SaleObservationAlertItem[] {
  if (!incoming) return current;
  const withoutSameEntity = current.filter((item) => item.entityKey !== incoming.entityKey);
  return [incoming, ...withoutSameEntity];
}

/**
 * Sincroniza o aviso do cliente ativo na venda:
 * - Substitui apenas eventual aviso de um cliente anterior;
 * - Mantém intactos todos os avisos de produtos ainda não dispensados.
 */
export function syncCustomerSaleAlert(
  current: SaleObservationAlertItem[],
  customer?: Customer | null
): SaleObservationAlertItem[] {
  const withoutCustomers = current.filter((item) => item.source !== 'customer');
  const nextAlert = getCustomerSaleAlert(customer);
  if (!nextAlert) return withoutCustomers;
  return [nextAlert, ...withoutCustomers];
}

/**
 * Remove um aviso específico pelo `id` ou `entityKey`.
 */
export function dismissSaleAlert(
  current: SaleObservationAlertItem[],
  idOrKey: string
): SaleObservationAlertItem[] {
  return current.filter((item) => item.id !== idOrKey && item.entityKey !== idOrKey);
}

/**
 * Remove apenas os avisos de produtos (útil ao limpar o carrinho mantendo o cliente).
 */
export function clearProductSaleAlerts(
  current: SaleObservationAlertItem[]
): SaleObservationAlertItem[] {
  return current.filter((item) => item.source !== 'product');
}

interface SaleObservationAlertsProps {
  alerts: SaleObservationAlertItem[];
  onDismiss: (id: string) => void;
  onDismissAll?: () => void;
  onAfterClose?: () => void;
  variant?: 'compact' | 'default' | 'mobile';
  className?: string;
}

export const SaleObservationAlerts: React.FC<SaleObservationAlertsProps> = ({
  alerts,
  onDismiss,
  onAfterClose,
  variant = 'default',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const activeAlert = alerts && alerts.length > 0 ? alerts[0] : null;
  const activeAlertId = activeAlert?.id ?? null;

  // Retira o foco de inputs de fundo (busca/leitor) e bloqueia rolagem da página
  // enquanto o modal central estiver aberto, forçando o usuário a fechar o aviso.
  useEffect(() => {
    if (!activeAlertId) return;

    const prevOverflow = typeof document !== 'undefined' ? document.body.style.overflow : '';
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl && activeEl !== dialogRef.current && typeof activeEl.blur === 'function') {
        activeEl.blur();
      }
    }
    dialogRef.current?.focus();

    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow;
      }
    };
  }, [activeAlertId]);

  if (!activeAlert) return null;

  const remainingCount = alerts.length - 1;
  const isCustomer = activeAlert.source === 'customer';
  const isMobile = variant === 'mobile';

  const handleCloseCurrent = () => {
    onDismiss(activeAlert.id);
    if (remainingCount === 0 && onAfterClose) {
      setTimeout(() => onAfterClose(), 20);
    }
  };

  const headerTone = isCustomer
    ? 'bg-orange-50 border-orange-200 text-orange-950'
    : 'bg-amber-50 border-amber-200 text-amber-950';
  const iconBoxTone = isCustomer
    ? 'bg-orange-100 text-orange-700 border-orange-300'
    : 'bg-amber-100 text-amber-700 border-amber-300';
  const badgeTone = isCustomer
    ? 'bg-white text-orange-800 border-orange-300'
    : 'bg-white text-amber-800 border-amber-300';
  const messageBoxTone = isCustomer
    ? 'bg-orange-50/85 border-orange-300 border-l-orange-500 text-orange-950'
    : 'bg-amber-50/85 border-amber-300 border-l-amber-500 text-amber-950';
  const buttonTone = isCustomer
    ? 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white'
    : 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white';

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-obs-alert-title"
      aria-describedby="sale-obs-alert-message"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`w-full bg-white rounded-2xl border-2 shadow-2xl overflow-hidden outline-hidden ${
          isCustomer ? 'border-orange-300' : 'border-amber-300'
        } ${isMobile ? 'max-w-md' : 'max-w-lg'}`}
      >
        {/* Cabeçalho de Alerta */}
        <div className={`px-5 py-4 border-b flex items-start justify-between gap-3 ${headerTone}`}>
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs ${iconBoxTone}`}
            >
              <AlertTriangle size={24} />
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-md border ${badgeTone}`}
                >
                  {isCustomer ? <User size={12} /> : <Package size={12} />}
                  <span>{isCustomer ? 'Cliente' : 'Produto'}</span>
                </span>
                {alerts.length > 1 && (
                  <span className="inline-flex items-center text-[11px] font-black px-2 py-0.5 rounded-md bg-slate-900 text-white">
                    Aviso 1 de {alerts.length}
                  </span>
                )}
              </div>

              <h3
                id="sale-obs-alert-title"
                className="text-sm sm:text-base font-black uppercase tracking-wide leading-tight"
              >
                {isCustomer ? 'ATENÇÃO – OBSERVAÇÃO DO CLIENTE' : 'ATENÇÃO – OBSERVAÇÃO DO PRODUTO'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseCurrent}
            title="Fechar aviso e continuar"
            aria-label={`Fechar aviso de ${activeAlert.entityName}`}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white/80 transition-colors cursor-pointer shrink-0 min-w-[38px] min-h-[38px] flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo com Identificação e Texto da Observação */}
        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {isCustomer ? 'Cliente selecionado' : 'Produto selecionado'}
            </span>
            <p className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug break-words">
              {activeAlert.entityCode && (
                <span className="font-mono text-slate-600 mr-2 text-sm sm:text-base">
                  [{activeAlert.entityCode}]
                </span>
              )}
              <span>{activeAlert.entityName}</span>
            </p>
          </div>

          <div
            id="sale-obs-alert-message"
            className={`rounded-xl border border-l-4 p-4 max-h-60 overflow-y-auto ${messageBoxTone}`}
          >
            <p className="text-sm sm:text-base font-bold leading-relaxed whitespace-pre-wrap break-words">
              {activeAlert.message}
            </p>
          </div>

          <p className="text-xs text-slate-500 font-medium">
            Leia a observação acima e clique no botão abaixo para fechar este aviso e prosseguir com o pedido.
          </p>
        </div>

        {/* Rodapé com Ação Obrigatória de Fechamento */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCloseCurrent}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-extrabold text-sm shadow-sm transition-colors cursor-pointer min-h-[44px] ${buttonTone}`}
          >
            <CheckCircle2 size={18} />
            <span>
              {remainingCount > 0
                ? `Ciente — Próximo Aviso (${remainingCount} restante${remainingCount === 1 ? '' : 's'})`
                : 'Ciente — Fechar e Continuar'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
