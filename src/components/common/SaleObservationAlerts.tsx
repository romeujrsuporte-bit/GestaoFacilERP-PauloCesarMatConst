import React from 'react';
import { AlertTriangle, Package, User, X } from 'lucide-react';
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
 * Insere ou atualiza um aviso na pilha ativa da venda sem sobrescrever
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
  variant?: 'compact' | 'default' | 'mobile';
  className?: string;
}

export const SaleObservationAlerts: React.FC<SaleObservationAlertsProps> = ({
  alerts,
  onDismiss,
  onDismissAll,
  variant = 'default',
  className = '',
}) => {
  if (!alerts || alerts.length === 0) return null;

  const isMobile = variant === 'mobile';
  const isCompact = variant === 'compact';

  return (
    <div
      role="region"
      aria-label="Avisos importantes da venda"
      aria-live="polite"
      className={`space-y-2 ${className}`}
    >
      {alerts.length > 1 && (
        <div
          className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-amber-100/90 border border-amber-300 text-amber-950 ${
            isMobile ? 'text-xs' : 'text-[11px]'
          }`}
        >
          <span className="font-extrabold flex items-center gap-1.5">
            <AlertTriangle size={isMobile ? 15 : 13} className="text-amber-700 shrink-0" />
            <span>{alerts.length} avisos importantes ativos nesta venda</span>
          </span>
          {onDismissAll && (
            <button
              type="button"
              onClick={onDismissAll}
              className={`font-bold text-amber-900 hover:text-amber-950 underline underline-offset-2 cursor-pointer shrink-0 ${
                isMobile ? 'px-2 py-1 text-xs' : 'text-[11px]'
              }`}
            >
              Fechar todos
            </button>
          )}
        </div>
      )}

      <div
        className={`space-y-2 ${
          alerts.length > 2
            ? isCompact
              ? 'max-h-40 overflow-y-auto pr-1'
              : isMobile
              ? 'max-h-64 overflow-y-auto pr-0.5'
              : 'max-h-56 overflow-y-auto pr-1'
            : ''
        }`}
      >
        {alerts.map((alert) => {
          const isCustomer = alert.source === 'customer';
          const containerTone = isCustomer
            ? 'bg-orange-50 border-orange-300 border-l-orange-500 text-orange-950'
            : 'bg-amber-50 border-amber-300 border-l-amber-500 text-amber-950';
          const iconBoxTone = isCustomer
            ? 'bg-orange-100 text-orange-700 border-orange-200'
            : 'bg-amber-100 text-amber-700 border-amber-200';
          const titleTone = isCustomer ? 'text-orange-900' : 'text-amber-900';
          const closeBtnTone = isCustomer
            ? 'text-orange-700 hover:bg-orange-100 hover:text-orange-950'
            : 'text-amber-700 hover:bg-amber-100 hover:text-amber-950';

          return (
            <div
              key={alert.id}
              role="alert"
              className={`rounded-xl border border-l-4 shadow-xs transition-all ${containerTone} ${
                isMobile ? 'p-3.5' : isCompact ? 'px-3 py-2' : 'p-3'
              }`}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div
                    className={`rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${iconBoxTone} ${
                      isMobile ? 'w-9 h-9' : isCompact ? 'w-7 h-7' : 'w-8 h-8'
                    }`}
                  >
                    <AlertTriangle size={isMobile ? 19 : isCompact ? 15 : 17} />
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`font-black uppercase tracking-wide ${titleTone} ${
                          isMobile ? 'text-xs' : isCompact ? 'text-[10px]' : 'text-[11px]'
                        }`}
                      >
                        {isCustomer ? 'ATENÇÃO – OBSERVAÇÃO DO CLIENTE' : 'ATENÇÃO – OBSERVAÇÃO DO PRODUTO'}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 font-bold rounded px-1.5 py-0.5 border ${
                          isCustomer
                            ? 'bg-white/80 border-orange-200 text-orange-800'
                            : 'bg-white/80 border-amber-200 text-amber-800'
                        } ${isMobile ? 'text-[11px]' : 'text-[10px]'}`}
                      >
                        {isCustomer ? <User size={11} /> : <Package size={11} />}
                        <span>{isCustomer ? 'Cliente' : 'Produto'}</span>
                      </span>
                    </div>

                    <div
                      className={`font-extrabold text-slate-900 break-words ${
                        isMobile ? 'text-sm leading-snug' : isCompact ? 'text-xs' : 'text-xs sm:text-sm'
                      }`}
                    >
                      {alert.entityCode && (
                        <span className="font-mono text-slate-600 mr-1.5">[{alert.entityCode}]</span>
                      )}
                      <span>{alert.entityName}</span>
                    </div>

                    <p
                      className={`font-semibold text-slate-800 whitespace-pre-wrap break-words leading-relaxed ${
                        isMobile ? 'text-sm pt-0.5' : isCompact ? 'text-xs' : 'text-xs sm:text-[13px]'
                      }`}
                    >
                      {alert.message}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDismiss(alert.id)}
                  title="Fechar aviso"
                  aria-label={`Fechar aviso de ${alert.entityName}`}
                  className={`rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center ${closeBtnTone} ${
                    isMobile ? 'min-w-[36px] min-h-[36px] p-2' : 'p-1.5'
                  }`}
                >
                  <X size={isMobile ? 18 : 15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
