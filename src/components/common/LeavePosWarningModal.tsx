import React from 'react';
import { AlertTriangle, ShoppingCart, ArrowLeft, LogOut } from 'lucide-react';
import { OrderItem } from '../../types';
import { formatCurrency } from '../../services/pricingEngine';

export type LeaveWarningMode = 'active_sale' | 'back_navigation';

interface LeavePosWarningModalProps {
  isOpen: boolean;
  mode?: LeaveWarningMode;
  cart: OrderItem[];
  sourceModule?: string;
  targetModuleName?: string | null;
  onConfirmLeave: () => void;
  onCancelLeave: () => void;
}

export const LeavePosWarningModal: React.FC<LeavePosWarningModalProps> = ({
  isOpen,
  mode = 'active_sale',
  cart,
  sourceModule = 'pos',
  targetModuleName,
  onConfirmLeave,
  onCancelLeave,
}) => {
  if (!isOpen) return null;

  const isBackNavigationMode = mode === 'back_navigation';
  const isExitingSystem = targetModuleName === '__browser_back__';

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = cart.reduce((sum, item) => sum + (item.totalPrice ?? item.quantity * item.unitPrice), 0);

  const isOrdersSource =
    sourceModule === 'orders' ||
    sourceModule === 'orders_quotes' ||
    sourceModule === 'orders_history' ||
    sourceModule === 'orders_history_profit';
  const isExternalSalesSource = sourceModule === 'external_sales';

  const getTargetModuleLabel = (mod?: string | null) => {
    switch (mod) {
      case 'dashboard':
        return 'Início / Dashboard';
      case 'pos':
        return 'PDV Balcão';
      case 'orders':
        return 'Pedido de Venda';
      case 'orders_quotes':
        return 'Orçamentos';
      case 'orders_history':
      case 'orders_history_profit':
        return 'Histórico de Pedidos';
      case 'sales_returns':
        return 'Devoluções & Trocas';
      case 'sales_reports':
        return 'Relatórios de Vendas';
      case 'external_sales':
        return 'Vendas Mobile';
      case 'products':
        return 'Produtos & Insumos';
      case 'customers':
        return 'Clientes & CRM';
      case 'suppliers':
        return 'Fornecedores';
      case 'stock_locations':
        return 'Locais de Estoque';
      case 'stock_transfers':
        return 'Transferências de Estoque';
      case 'inventory':
        return 'Inventário';
      case 'stock_movements':
        return 'Movimentações de Estoque';
      case 'bom_composition':
      case 'components_catalog':
      case 'production_orders':
        return 'Produção';
      case 'pricing_calculator':
      case 'batch_pricing':
        return 'Precificação';
      case 'purchases':
      case 'purchases_nfe':
        return 'Compras';
      case 'financial':
      case 'cash_flow':
      case 'accounts_receivable':
      case 'accounts_payable':
      case 'customer_vouchers':
      case 'chart_of_accounts':
      case 'dre_gerencial':
      case 'cash_register':
      case 'payment_methods':
      case 'financial_accounts':
      case 'payment_terms':
      case 'financial_reports':
        return 'Financeiro';
      case 'delivery_manifests':
      case 'delivery_routes':
      case 'delivery_drivers':
      case 'delivery_vehicles':
      case 'delivery_market_areas':
      case 'delivery_neighborhoods':
      case 'delivery_cities':
      case 'delivery_states':
      case 'expedition_reports':
      case 'expedicao':
        return 'Expedição';
      case 'excel_tools':
        return 'Ferramentas Excel';
      case 'reports':
        return 'Relatórios';
      case 'settings':
      case 'settings_menus':
      case 'settings_printer':
      case 'settings_preferences':
      case 'settings_cleanup':
      case 'settings_supabase':
        return 'Configurações';
      case '__browser_back__':
        return isBackNavigationMode ? 'Sair do aplicativo / Navegador' : 'Voltar (Tela anterior / Sair)';
      default:
        return 'outro menu';
    }
  };

  const currentModuleLabel = getTargetModuleLabel(sourceModule);

  const sourceTitle = isBackNavigationMode
    ? isExitingSystem
      ? 'Deseja realmente sair do sistema?'
      : `Deseja realmente sair de ${currentModuleLabel}?`
    : isExternalSalesSource
    ? 'Deseja realmente sair de Vendas Mobile?'
    : isOrdersSource
    ? 'Deseja realmente sair do Pedido de Venda?'
    : 'Deseja realmente sair do PDV Balcão?';

  const stayHint = isExternalSalesSource || isOrdersSource
    ? 'finalize o pedido'
    : 'finalize o cupom';

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full border border-amber-200/80 shadow-2xl overflow-hidden flex flex-col">
        {/* Faixa Superior de Alerta */}
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>
            {isBackNavigationMode ? 'Atenção: Confirmação de Saída' : 'Atenção: Venda em Andamento'}
          </span>
        </div>

        <div className="p-5 space-y-4">
          {/* Cabeçalho */}
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200 shadow-2xs">
              {isBackNavigationMode ? (
                isExitingSystem ? <LogOut size={24} /> : <ArrowLeft size={24} />
              ) : (
                <ShoppingCart size={24} />
              )}
            </div>

            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-base leading-snug">
                {sourceTitle}
              </h3>
              <p className={`text-xs font-bold ${isBackNavigationMode ? 'text-amber-700' : 'text-rose-600'}`}>
                {isBackNavigationMode
                  ? isExitingSystem
                    ? 'Você clicou no botão Voltar na tela inicial. Confirme se deseja sair do Gestão Fácil ERP ou permanecer conectado.'
                    : 'Você clicou no botão Voltar do aparelho. Caso confirme, você sairá desta tela e retornará para a tela anterior.'
                  : 'Se você mudar de tela agora, você perderá todos os dados e produtos que já foram adicionados a esta venda!'}
              </p>
            </div>
          </div>

          {/* Card Resumo */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            {isBackNavigationMode ? (
              <div className="flex justify-between items-center text-xs text-slate-600">
                <span className="font-semibold">Tela atual:</span>
                <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {currentModuleLabel}
                </span>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center text-xs text-slate-600">
                  <span className="font-semibold">Itens no carrinho:</span>
                  <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                    {totalItems} {totalItems === 1 ? 'item' : 'itens'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs text-slate-600">
                  <span className="font-semibold">Subtotal acumulado:</span>
                  <span className="font-black text-slate-900 text-sm font-mono text-emerald-700">
                    {formatCurrency(totalValue)}
                  </span>
                </div>
              </>
            )}

            {targetModuleName && (
              <div
                className={`text-[11px] text-slate-500 flex items-center justify-between ${
                  isBackNavigationMode ? 'pt-1.5 border-t border-slate-200' : 'pt-1.5 border-t border-slate-200'
                }`}
              >
                <span>Destino solicitado:</span>
                <span className="font-bold text-slate-700 bg-slate-200/70 px-2 py-0.5 rounded">
                  {getTargetModuleLabel(targetModuleName)}
                </span>
              </div>
            )}
          </div>

          {/* Pergunta de Confirmação */}
          <p className="text-xs text-slate-600 text-center font-medium">
            {isBackNavigationMode ? (
              <>
                Para continuar usando esta tela normalmente, clique em <strong>Permanecer na Tela</strong>.
              </>
            ) : (
              <>
                Para não perder os dados, clique em <strong>Permanecer na Venda</strong> e {stayHint}.
              </>
            )}
          </p>

          {/* Botões de Ação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onCancelLeave}
              autoFocus
              className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer order-2 sm:order-1"
            >
              <span>{isBackNavigationMode ? 'Permanecer na Tela' : 'Permanecer na Venda'}</span>
            </button>

            <button
              type="button"
              onClick={onConfirmLeave}
              className="w-full px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 font-bold text-xs rounded-xl border border-rose-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer order-1 sm:order-2"
            >
              <span>
                {isBackNavigationMode
                  ? isExitingSystem
                    ? 'Sair do Sistema'
                    : 'Voltar à Tela Anterior'
                  : 'Descartar e Sair'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
