import React, { useState, useEffect } from 'react';
import {
  Trash2,
  ShieldCheck,
  Users,
  Package,
  Building2,
  FileText,
  Truck,
  Check,
  AlertTriangle,
  Lock,
  X,
  Building,
  Wrench,
  Navigation,
  User,
  Car,
  Compass,
  MapPin,
  Landmark,
  CircleDollarSign,
  TrendingDown,
  Vault,
  History,
} from 'lucide-react';
import { Database, SystemCleanupOptions } from '../../services/db';
import { FirebaseSyncService } from '../../services/firebaseSync';
import { toast } from '../../services/toast';

interface DataCleanupViewProps {
  onDataCleared?: () => void;
}

const buildAllSelections = (checked: boolean): Record<keyof SystemCleanupOptions, boolean> => ({
  clients: checked,
  suppliers: checked,
  productsStock: checked,
  productionOrders: checked,
  salesHistory: checked,
  cargoManifests: checked,
  deliveryRoutes: checked,
  deliveryDrivers: checked,
  deliveryVehicles: checked,
  marketAreas: checked,
  neighborhoods: checked,
  cities: checked,
  cashFlow: checked,
  accountsPayable: checked,
  posCashControl: checked,
  auditLogs: checked,
  usersSellers: checked,
  companiesBranches: checked,
});

export const DataCleanupView: React.FC<DataCleanupViewProps> = ({ onDataCleared }) => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentUser = Database.getCurrentUser();
  const isAdmin = Database.isAdmin(currentUser);

  // Seleção de módulos a limpar (todos marcados por padrão)
  const [selections, setSelections] = useState<Record<keyof SystemCleanupOptions, boolean>>(() =>
    buildAllSelections(true)
  );

  // Modal de confirmação
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  // Contagens dinâmicas
  const clientCount = dbState.customers?.length || 0;
  const supplierCount = dbState.suppliers?.length || 0;
  const productCount = dbState.products?.length || 0;
  const productionOrderCount = dbState.productionOrders?.length || 0;
  const removableUserCount = (dbState.users || []).filter((u) => u.login !== 'admin').length;
  const companyCount = dbState.companies?.length || 0;
  const orderCount = dbState.orders?.length || 0;
  const manifestCount = dbState.deliveryManifests?.length || 0;
  const routeCount = dbState.deliveryRoutes?.length || 0;
  const driverCount = dbState.deliveryDrivers?.length || 0;
  const vehicleCount = dbState.deliveryVehicles?.length || 0;
  const marketAreaCount = dbState.marketAreas?.length || 0;
  const neighborhoodCount = dbState.neighborhoods?.length || 0;
  const cityCount = dbState.cities?.length || 0;
  const cashFlowCount = dbState.accountsReceivable?.length || 0;
  const accountPayableCount = dbState.accountsPayable?.length || 0;
  const posCashCount = dbState.cashRegisters?.length || 0;
  const auditLogCount = dbState.auditLogs?.length || 0;

  const selectedCount = Object.values(selections).filter(Boolean).length;

  const handleSelectAll = () => {
    setSelections(buildAllSelections(true));
  };

  const handleDeselectAll = () => {
    setSelections(buildAllSelections(false));
  };

  const toggleSelection = (key: keyof SystemCleanupOptions) => {
    setSelections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleExecuteCleanup = async () => {
    if (!isAdmin) {
      toast.error('Apenas o usuário "Admin" possui autorização para executar esta ação.', 'Acesso Negado');
      setIsConfirmModalOpen(false);
      return;
    }

    if (selectedCount === 0) {
      toast.warning('Selecione pelo menos uma categoria para efetuar a limpeza.', 'Nenhuma Categoria');
      return;
    }

    setIsProcessing(true);

    try {
      const res = Database.executeSystemCleanup(selections);
      if (res.success) {
        // Sincroniza estado zerado com o Firebase Firestore se configurado
        try {
          await FirebaseSyncService.syncToFirebase(Database.getState(), true);
        } catch (syncErr) {
          console.warn('Aviso: Falha ao sincronizar limpeza com Firebase:', syncErr);
        }

        toast.success(
          'Limpeza e zeramento de dados executados com sucesso!',
          'Dados do Sistema Zerados'
        );
        setIsConfirmModalOpen(false);
        setConfirmText('');
        if (onDataCleared) {
          onDataCleared();
        }
      } else {
        toast.error(res.error || 'Falha ao executar limpeza de dados.', 'Erro de Limpeza');
      }
    } catch (err) {
      console.error('Erro na limpeza de dados:', err);
      toast.error('Ocorreu um erro inesperado ao limpar os dados do sistema.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Se o usuário não for admin, bloqueia o acesso à tela
  if (!isAdmin) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3 max-w-xl mx-auto shadow-xs mt-6">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
          <Lock size={26} />
        </div>
        <h3 className="font-bold text-base text-slate-800">Acesso Restrito ao Administrador</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Apenas o usuário <strong className="text-slate-700">"Admin"</strong> (login: <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded">admin</code>) possui permissão de segurança para acessar o recurso de limpeza e zeramento de dados do sistema.
        </p>
      </div>
    );
  }

  const modulesList = [
    {
      key: 'clients' as keyof SystemCleanupOptions,
      title: 'Clientes',
      icon: <Users size={18} className="text-slate-600 shrink-0" />,
      badge: `${clientCount} ${clientCount === 1 ? 'cliente' : 'clientes'}`,
      description: 'Exclui todos os clientes cadastrados (nomes, contatos, CNPJ/CPF e endereços).',
    },
    {
      key: 'suppliers' as keyof SystemCleanupOptions,
      title: 'Fornecedores',
      icon: <Building size={18} className="text-slate-600 shrink-0" />,
      badge: `${supplierCount} ${supplierCount === 1 ? 'fornecedor' : 'fornecedores'}`,
      description: 'Exclui todos os fornecedores cadastrados, contatos comerciais e dados fiscais.',
    },
    {
      key: 'productsStock' as keyof SystemCleanupOptions,
      title: 'Produtos & Estoque',
      icon: <Package size={18} className="text-slate-600 shrink-0" />,
      badge: `${productCount} ${productCount === 1 ? 'item' : 'itens'}`,
      description: 'Exclui todo o catálogo de produtos, códigos de barras, unidades e saldos de estoque.',
    },
    {
      key: 'productionOrders' as keyof SystemCleanupOptions,
      title: 'Ordens de Produção',
      icon: <Wrench size={18} className="text-slate-600 shrink-0" />,
      badge: `${productionOrderCount} ${productionOrderCount === 1 ? 'ordem' : 'ordens'}`,
      description: 'Exclui todas as ordens de produção (OPs), histórico de lotes e consumo de insumos.',
    },
    {
      key: 'salesHistory' as keyof SystemCleanupOptions,
      title: 'Pedidos de Venda & Histórico',
      icon: <FileText size={18} className="text-slate-600 shrink-0" />,
      badge: `${orderCount} ${orderCount === 1 ? 'pedido' : 'pedidos'}`,
      description: 'Exclui o histórico de pedidos de venda, devoluções, itens faturados e títulos vinculados.',
    },
    {
      key: 'cargoManifests' as keyof SystemCleanupOptions,
      title: 'Romaneios de Carga',
      icon: <Truck size={18} className="text-slate-600 shrink-0" />,
      badge: `${manifestCount} ${manifestCount === 1 ? 'romaneio' : 'romaneios'}`,
      description: 'Exclui todos os romaneios de entrega e restaura os pedidos vinculados à expedição.',
    },
    {
      key: 'deliveryRoutes' as keyof SystemCleanupOptions,
      title: 'Rotas de Entrega',
      icon: <Navigation size={18} className="text-slate-600 shrink-0" />,
      badge: `${routeCount} ${routeCount === 1 ? 'rota' : 'rotas'}`,
      description: 'Exclui todas as rotas logísticas, regiões atendidas e valores mínimos configurados.',
    },
    {
      key: 'deliveryDrivers' as keyof SystemCleanupOptions,
      title: 'Motoristas',
      icon: <User size={18} className="text-slate-600 shrink-0" />,
      badge: `${driverCount} ${driverCount === 1 ? 'motorista' : 'motoristas'}`,
      description: 'Exclui todos os motoristas cadastrados (CNH, validades e contatos da expedição).',
    },
    {
      key: 'deliveryVehicles' as keyof SystemCleanupOptions,
      title: 'Veículos',
      icon: <Car size={18} className="text-slate-600 shrink-0" />,
      badge: `${vehicleCount} ${vehicleCount === 1 ? 'veículo' : 'veículos'}`,
      description: 'Exclui todos os veículos da frota, placas, capacidades de carga e licenciamentos.',
    },
    {
      key: 'marketAreas' as keyof SystemCleanupOptions,
      title: 'Praças Comerciais',
      icon: <Compass size={18} className="text-slate-600 shrink-0" />,
      badge: `${marketAreaCount} ${marketAreaCount === 1 ? 'praça' : 'praças'}`,
      description: 'Exclui todas as praças comerciais cadastradas para setorização de vendas e rotas.',
    },
    {
      key: 'neighborhoods' as keyof SystemCleanupOptions,
      title: 'Bairros',
      icon: <MapPin size={18} className="text-slate-600 shrink-0" />,
      badge: `${neighborhoodCount} ${neighborhoodCount === 1 ? 'bairro' : 'bairros'}`,
      description: 'Exclui todos os bairros vinculados às cidades e rotas padrão de entrega.',
    },
    {
      key: 'cities' as keyof SystemCleanupOptions,
      title: 'Cidades',
      icon: <Landmark size={18} className="text-slate-600 shrink-0" />,
      badge: `${cityCount} ${cityCount === 1 ? 'cidade' : 'cidades'}`,
      description: 'Exclui todas as cidades atendidas cadastradas no roteirizador comercial.',
    },
    {
      key: 'cashFlow' as keyof SystemCleanupOptions,
      title: 'Fluxo de Caixa',
      icon: <CircleDollarSign size={18} className="text-slate-600 shrink-0" />,
      badge: `${cashFlowCount} ${cashFlowCount === 1 ? 'lançamento' : 'lançamentos'}`,
      description: 'Exclui títulos a receber, histórico de recebimentos e zera os saldos das contas financeiras.',
    },
    {
      key: 'accountsPayable' as keyof SystemCleanupOptions,
      title: 'Contas a Pagar',
      icon: <TrendingDown size={18} className="text-slate-600 shrink-0" />,
      badge: `${accountPayableCount} ${accountPayableCount === 1 ? 'conta' : 'contas'}`,
      description: 'Exclui todas as contas a pagar, despesas pendentes, liquidações e boletos de fornecedores.',
    },
    {
      key: 'posCashControl' as keyof SystemCleanupOptions,
      title: 'Controle de Caixa PDV',
      icon: <Vault size={18} className="text-slate-600 shrink-0" />,
      badge: `${posCashCount} ${posCashCount === 1 ? 'caixa' : 'caixas'}`,
      description: 'Exclui todas as sessões de abertura/fechamento de caixa PDV, suprimentos e sangrias.',
    },
    {
      key: 'auditLogs' as keyof SystemCleanupOptions,
      title: 'Logs de Auditoria',
      icon: <History size={18} className="text-slate-600 shrink-0" />,
      badge: `${auditLogCount} ${auditLogCount === 1 ? 'registro' : 'registros'}`,
      description: 'Exclui todo o histórico de auditoria e rastreabilidade das ações registradas no sistema.',
    },
    {
      key: 'usersSellers' as keyof SystemCleanupOptions,
      title: 'Usuários & Vendedores',
      icon: <ShieldCheck size={18} className="text-slate-600 shrink-0" />,
      badge: `${removableUserCount} removíveis • 1 Admin fixo`,
      description: (
        <>
          Exclui todos os operadores e vendedores. <strong className="text-slate-700 font-semibold">O usuário "Admin" padrão é mantido intacto.</strong>
        </>
      ),
    },
    {
      key: 'companiesBranches' as keyof SystemCleanupOptions,
      title: 'Empresas & Filiais',
      icon: <Building2 size={18} className="text-slate-600 shrink-0" />,
      badge: `${companyCount} ${companyCount === 1 ? 'unidade' : 'unidades'}`,
      description: (
        <>
          Redefine as empresas/lojas para a <strong className="text-slate-700 font-semibold">Loja Matriz padrão</strong> do sistema.
        </>
      ),
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-7 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Trash2 size={20} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
              Limpeza e Zeramento dos Dados do Sistema
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Utilize este recurso quando desejar zerar a base de dados para iniciar novos cadastros ou limpar registros de testes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer"
          >
            Marcar Todos
          </button>
          <span className="text-slate-300">•</span>
          <button
            type="button"
            onClick={handleDeselectAll}
            className="text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer"
          >
            Desmarcar Todos
          </button>
        </div>
      </div>

      {/* Cartão de Proteção do Usuário Padrão (Admin) */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ShieldCheck className="text-blue-600 shrink-0" size={20} />
          <h3 className="font-bold text-sm text-slate-900">
            Proteção do Usuário Padrão (Admin)
          </h3>
          <span className="bg-blue-600 text-white text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full ml-1 shadow-2xs">
            INVIOLÁVEL
          </span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed pl-7">
          O usuário <strong className="text-slate-900">"Admin"</strong> (Login:{' '}
          <code className="bg-white/90 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium">
            admin
          </code>{' '}
          ) é o usuário Padrão e de Suporte do sistema e{' '}
          <strong className="text-slate-900">não pode ser excluído sob nenhuma circunstância</strong>. Ao limpar o
          cadastro de usuários, todos os outros operadores e vendedores são removidos, preservando o usuário
          Administrador para que você nunca perca o acesso. Os{' '}
          <strong className="text-slate-900">Prazos &amp; Condições de Pagamento padrão do sistema</strong> também são mantidos intactos.
        </p>
      </div>

      {/* Seção de Seleção dos Módulos */}
      <div className="space-y-3">
        <div className="text-[11px] sm:text-xs font-black tracking-wider text-slate-800 uppercase">
          SELECIONE QUAIS CADASTROS E MÓDULOS DESEJA LIMPAR:
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {modulesList.map((mod) => {
            const isChecked = selections[mod.key];
            return (
              <div
                key={mod.key}
                onClick={() => toggleSelection(mod.key)}
                className={`p-4 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between ${
                  isChecked
                    ? 'border-rose-300 ring-1 ring-rose-200/60 bg-white shadow-xs'
                    : 'border-slate-200 bg-white/70 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                          isChecked
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'border-2 border-slate-300 bg-white'
                        }`}
                      >
                        {isChecked && <Check size={13} strokeWidth={3} />}
                      </div>
                      <div className="flex items-center gap-2">
                        {mod.icon}
                        <span className="font-bold text-sm text-slate-900">{mod.title}</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 shrink-0">
                      {mod.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 pl-7.5 leading-relaxed">
                    {mod.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rodapé com Contador e Botão de Ação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 border-t border-slate-100 gap-3">
        <div className="text-xs font-semibold text-slate-600">
          <strong className="text-slate-800">{selectedCount}</strong> categoria(s) selecionada(s) para limpeza.
        </div>

        <button
          type="button"
          onClick={() => setIsConfirmModalOpen(true)}
          disabled={selectedCount === 0}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer self-stretch sm:self-auto"
        >
          <Trash2 size={16} />
          <span>Limpar Dados Selecionados...</span>
        </button>
      </div>

      {/* Modal de Confirmação Segura */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Confirmar Limpeza e Zeramento
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ação irreversível de exclusão de dados
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3.5 space-y-1.5 text-xs text-rose-900 max-h-60 overflow-y-auto">
              <p className="font-bold">
                Atenção: Os dados das seguintes categorias selecionadas serão apagados definitivamente:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-[11px] text-rose-800 font-medium">
                {selections.clients && <li>Clientes ({clientCount} registros)</li>}
                {selections.suppliers && <li>Fornecedores ({supplierCount} registros)</li>}
                {selections.productsStock && <li>Produtos & Estoque ({productCount} itens cadastrados)</li>}
                {selections.productionOrders && <li>Ordens de Produção ({productionOrderCount} ordens)</li>}
                {selections.salesHistory && (
                  <li>Pedidos de Venda & Histórico ({orderCount} pedidos e títulos a receber)</li>
                )}
                {selections.cargoManifests && (
                  <li>Romaneios de Carga ({manifestCount} romaneios de entrega)</li>
                )}
                {selections.deliveryRoutes && <li>Rotas de Entrega ({routeCount} rotas)</li>}
                {selections.deliveryDrivers && <li>Motoristas ({driverCount} motoristas)</li>}
                {selections.deliveryVehicles && <li>Veículos ({vehicleCount} veículos)</li>}
                {selections.marketAreas && <li>Praças Comerciais ({marketAreaCount} praças)</li>}
                {selections.neighborhoods && <li>Bairros ({neighborhoodCount} bairros)</li>}
                {selections.cities && <li>Cidades ({cityCount} cidades)</li>}
                {selections.cashFlow && (
                  <li>Fluxo de Caixa ({cashFlowCount} títulos a receber e saldos zerados)</li>
                )}
                {selections.accountsPayable && <li>Contas a Pagar ({accountPayableCount} contas)</li>}
                {selections.posCashControl && (
                  <li>Controle de Caixa PDV ({posCashCount} sessões de caixa)</li>
                )}
                {selections.auditLogs && (
                  <li>Logs de Auditoria ({auditLogCount} registros)</li>
                )}
                {selections.usersSellers && (
                  <li>
                    Usuários & Vendedores ({removableUserCount} operadores removidos • Admin protegido)
                  </li>
                )}
                {selections.companiesBranches && (
                  <li>Empresas & Filiais (Redefinição para Loja Matriz padrão)</li>
                )}
              </ul>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
              <ShieldCheck size={18} className="text-blue-600 shrink-0" />
              <span>
                O usuário <strong>Admin</strong> (login: admin), a <strong>Loja Matriz</strong> e os <strong>Prazos &amp; Condições de Pagamento padrão</strong> serão rigorosamente mantidos.
              </span>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-bold text-slate-700">
                Para confirmar a exclusão definitiva, digite <span className="font-mono text-rose-700 font-black">ZERAR</span> abaixo:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder="Digite ZERAR para confirmar"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold uppercase focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setConfirmText('');
                }}
                disabled={isProcessing}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteCleanup}
                disabled={confirmText.trim() !== 'ZERAR' || isProcessing}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
                <span>{isProcessing ? 'Limpando...' : 'Confirmar e Zerar Dados'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
