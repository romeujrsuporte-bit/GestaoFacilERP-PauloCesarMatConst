import React from 'react';
import {
  CheckCircle2,
  X,
  User,
  DollarSign,
  CreditCard,
  Clock,
  AlertCircle,
  ArrowLeft,
  ShoppingBag,
  Receipt,
  Warehouse,
  QrCode,
  Coins,
  Barcode,
  FileText,
  Gift
} from 'lucide-react';
import { formatCurrency } from '../../services/pricingEngine';
import { Database } from '../../services/db';

export interface SaleConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  modality: 'PDV Balcão' | 'Pedido de Venda' | 'Venda Mobile';
  customerName: string;
  customerDocument?: string;
  customerPhone?: string;
  totalAmount: number;
  paymentMethod: string;
  paymentTerm: string;
  installments?: number;
  itemsCount?: number;
  receivedAmount?: number;
  changeAmount?: number;
  locationName?: string;
  isSubmitting?: boolean;
  isBonus?: boolean;
  referenceAmount?: number;
}

export const formatPaymentMethodName = (method: string): string => {
  switch (method) {
    case 'pix':
      return 'Pix Cobrança (Instantâneo)';
    case 'dinheiro':
      return 'Dinheiro em Espécie';
    case 'cartao_credito':
      return 'Cartão de Crédito';
    case 'cartao_debito':
      return 'Cartão de Débito';
    case 'boleto':
      return 'Boleto Bancário';
    case 'crediario':
      return 'Crediário Próprio';
    case 'bonificacao':
      return 'Bonificação (Sem Cobrança)';
    default:
      return method ? method.toUpperCase() : 'Não informado';
  }
};

export const formatPaymentTermName = (term: string, installments?: number, total?: number): string => {
  const resolved = Database.resolvePaymentTermInfo(term, installments || 1);
  const label = resolved.label || 'Não informado';

  if (installments && installments > 1 && total && total > 0) {
    const installmentVal = total / installments;
    return `${label} (${installments}x de ${formatCurrency(installmentVal)})`;
  }

  return label;
};

export const SaleConfirmationModal: React.FC<SaleConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  modality,
  customerName,
  customerDocument,
  customerPhone,
  totalAmount,
  paymentMethod,
  paymentTerm,
  installments = 1,
  itemsCount,
  receivedAmount,
  changeAmount,
  locationName,
  isSubmitting = false,
  isBonus = false,
  referenceAmount,
}) => {
  if (!isOpen) return null;

  const formattedMethod = isBonus ? 'Sem Cobrança (Bonificação)' : formatPaymentMethodName(paymentMethod);
  const formattedTerm = isBonus
    ? 'Não gera Contas a Receber'
    : formatPaymentTermName(paymentTerm, installments, totalAmount);

  const getMethodIcon = () => {
    switch (paymentMethod) {
      case 'pix':
        return <QrCode size={20} className="text-emerald-600" />;
      case 'dinheiro':
        return <DollarSign size={20} className="text-emerald-600" />;
      case 'cartao_credito':
      case 'cartao_debito':
        return <CreditCard size={20} className="text-blue-600" />;
      case 'boleto':
        return <Barcode size={20} className="text-amber-600" />;
      case 'crediario':
        return <FileText size={20} className="text-purple-600" />;
      default:
        return <CreditCard size={20} className="text-slate-600" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-confirmation-title"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col my-auto transition-all">
        {/* Top Header */}
        <div
          className={`text-white p-4 sm:p-5 flex items-center justify-between border-b ${
            isBonus
              ? 'bg-gradient-to-r from-sky-950 via-blue-950 to-sky-950 border-sky-700'
              : 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-slate-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                isBonus
                  ? 'bg-sky-500/25 text-sky-200 border-sky-400/50'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              }`}
            >
              {isBonus ? <Gift size={24} /> : <CheckCircle2 size={24} />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    isBonus
                      ? 'text-sky-100 bg-sky-600/80 border-sky-400/60'
                      : 'text-emerald-400 bg-emerald-950/70 border-emerald-700/60'
                  }`}
                >
                  {isBonus ? `BONIFICAÇÃO • ${modality}` : modality}
                </span>
                <span className="text-[11px] font-bold text-slate-300">Conferência Final</span>
              </div>
              <h2 id="sale-confirmation-title" className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5">
                {isBonus ? 'Confirmar Pedido de Bonificação' : 'Confirmar e Finalizar Venda'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            title="Voltar / Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-4 text-slate-800 overflow-y-auto max-h-[75vh]">
          {/* Instrução de Conferência */}
          {isBonus ? (
            <div className="bg-sky-50 border-2 border-sky-200 rounded-2xl p-3 flex items-start gap-2.5">
              <Gift size={18} className="text-sky-700 shrink-0 mt-0.5" />
              <p className="text-xs text-sky-950 leading-relaxed font-medium">
                Operação identificada como <strong>PEDIDO DE BONIFICAÇÃO</strong>. Este pedido realizará a <strong>saída efetiva do estoque</strong>, porém <strong>não gerará faturamento, cobrança nem Contas a Receber</strong>.
              </p>
            </div>
          ) : (
            <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-3 flex items-start gap-2.5">
              <AlertCircle size={18} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-900 leading-relaxed font-medium">
                Por favor, confira atentamente os dados da venda abaixo, <strong>principalmente a Forma e o Prazo de Pagamento</strong>, antes de confirmar a emissão.
              </p>
            </div>
          )}

          {/* Card 1: Nome do Cliente */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <User size={14} className="text-slate-600" />
                {isBonus ? 'Cliente Beneficiado' : 'Nome do Cliente'}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                Obrigatório
              </span>
            </div>
            <div className="text-sm sm:text-base font-black text-slate-900 leading-snug">
              {customerName || 'Consumidor Final (Não Identificado)'}
            </div>
            {(customerDocument || customerPhone) && (
              <div className="text-xs text-slate-500 font-medium flex items-center gap-2 flex-wrap">
                {customerDocument && <span>Doc: <strong>{customerDocument}</strong></span>}
                {customerDocument && customerPhone && <span>•</span>}
                {customerPhone && <span>Tel: <strong>{customerPhone}</strong></span>}
              </div>
            )}
          </div>

          {/* Card 2: Valor Total do Pedido */}
          {isBonus ? (
            <div className="bg-gradient-to-br from-sky-50 via-white to-blue-50/50 border-2 border-sky-400 rounded-2xl p-4 shadow-xs text-center space-y-1.5">
              <span className="text-[11px] font-black text-sky-900 uppercase tracking-wider block">
                Total Financeiro a Cobrar (Bonificação)
              </span>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-black font-mono text-sky-700 tracking-tight">
                {formatCurrency(0)}
              </div>
              {referenceAmount !== undefined && referenceAmount > 0 && (
                <div className="text-xs font-bold text-slate-600 bg-white/90 border border-sky-200 rounded-xl px-3 py-1.5 inline-flex items-center gap-1.5">
                  <span>Valor de Referência dos Produtos:</span>
                  <span className="font-mono text-slate-800">{formatCurrency(referenceAmount)}</span>
                </div>
              )}
              {itemsCount !== undefined && itemsCount > 0 && (
                <div className="text-[11px] text-sky-800/80 font-semibold flex items-center justify-center gap-1">
                  <ShoppingBag size={12} />
                  <span>{itemsCount} produto{itemsCount === 1 ? '' : 's'} para saída de estoque por bonificação</span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 border-2 border-emerald-400 rounded-2xl p-4 shadow-xs text-center space-y-1">
              <span className="text-[11px] font-black text-emerald-800 uppercase tracking-wider block">
                Valor Total do Pedido
              </span>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-black font-mono text-emerald-700 tracking-tight">
                {formatCurrency(totalAmount)}
              </div>
              {itemsCount !== undefined && itemsCount > 0 && (
                <div className="text-[11px] text-emerald-800/80 font-semibold flex items-center justify-center gap-1">
                  <ShoppingBag size={12} />
                  <span>{itemsCount} produto{itemsCount === 1 ? '' : 's'} no pedido</span>
                </div>
              )}
            </div>
          )}

          {/* Grid Cards 3 e 4: Forma de Pagamento e Prazo de Pagamento (ou Resumo de Bonificação) */}
          {isBonus ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-3.5 space-y-1">
                <span className="text-[10px] font-black text-sky-700 uppercase tracking-wider block">
                  Natureza da Operação
                </span>
                <div className="text-xs sm:text-sm font-black text-sky-950">
                  Bonificação / Cortesia
                </div>
                <div className="text-[10px] text-sky-700 font-medium">
                  Sem impacto no faturamento ou comissões
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                  Financeiro & Estoque
                </span>
                <div className="text-xs sm:text-sm font-black text-slate-900">
                  Baixa de Estoque • Sem Cobrança
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                  Registra movimentação de saída por bonificação
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Forma de Pagamento */}
              <div className="bg-slate-50 border-2 border-slate-200 hover:border-blue-400 transition-colors rounded-2xl p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard size={14} className="text-blue-600" />
                    Forma de Pagto
                  </span>
                  <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 border border-blue-200">
                    OBRIGATÓRIO
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
                    {getMethodIcon()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-black text-slate-900 leading-snug truncate">
                      {formattedMethod}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      Meio selecionado
                    </div>
                  </div>
                </div>
              </div>

              {/* Prazo de Pagamento */}
              <div className="bg-slate-50 border-2 border-slate-200 hover:border-amber-400 transition-colors rounded-2xl p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={14} className="text-amber-600" />
                    Prazo de Pagto
                  </span>
                  <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                    OBRIGATÓRIO
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs text-amber-600 font-bold">
                    <Clock size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-black text-slate-900 leading-snug">
                      {formattedTerm}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      Condição de vencimento
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Troco no PDV (se dinheiro em espécie com valor recebido informado) */}
          {paymentMethod === 'dinheiro' && receivedAmount !== undefined && receivedAmount > 0 && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <span className="text-[11px] font-bold text-slate-600 block">Dinheiro Recebido:</span>
                <span className="text-sm font-black text-slate-900 font-mono">{formatCurrency(receivedAmount)}</span>
              </div>
              <div className="text-right space-y-0.5">
                <span className="text-[11px] font-extrabold text-emerald-800 block uppercase">Troco a Devolver:</span>
                <span className="text-base font-black text-emerald-700 font-mono">
                  {formatCurrency(changeAmount || 0)}
                </span>
              </div>
            </div>
          )}

          {/* Local de Estoque (se informado) */}
          {locationName && (
            <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
              <span className="flex items-center gap-1 font-medium">
                <Warehouse size={13} className="text-slate-400" />
                Estoque / Depósito de Saída:
              </span>
              <strong className="text-slate-700 font-bold">{locationName}</strong>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-1/2 py-3 px-4 rounded-xl border-2 border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-100 text-slate-700 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
          >
            <ArrowLeft size={16} />
            <span>Voltar e Corrigir</span>
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={`w-full sm:w-1/2 py-3 px-4 rounded-xl text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md hover:shadow-lg disabled:opacity-50 ${
              isBonus ? 'bg-sky-600 hover:bg-sky-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isBonus ? <Gift size={18} /> : <CheckCircle2 size={18} />}
            <span>
              {isSubmitting
                ? 'Finalizando...'
                : isBonus
                ? 'Confirmar Bonificação'
                : 'Confirmar e Finalizar'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
