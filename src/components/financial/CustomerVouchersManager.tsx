import React, { useState, useEffect, useMemo } from 'react';
import {
  Ticket,
  Plus,
  Search,
  Edit2,
  Trash2,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  UserCheck,
  Calendar,
  Ban,
  ArrowDownRight,
  Wallet,
} from 'lucide-react';
import { Database } from '../../services/db';
import { FirebaseSyncService } from '../../services/firebaseSync';
import { CustomerVoucher, CustomerVoucherOrigin } from '../../types';
import { formatCurrency } from '../../services/pricingEngine';
import { toast } from '../../services/toast';
import { CustomerSearchCombobox } from '../orders/CustomerSearchCombobox';

const ORIGIN_LABELS: Record<CustomerVoucherOrigin, string> = {
  credito_comercial: 'Crédito Comercial',
  adiantamento: 'Adiantamento / Sinal',
  devolucao: 'Devolução / Troca',
  bonificacao: 'Bonificação / Acordo',
  outros: 'Outros',
};

const ORIGIN_COLORS: Record<CustomerVoucherOrigin, string> = {
  credito_comercial: 'bg-blue-50 text-blue-700 border-blue-200',
  adiantamento: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  devolucao: 'bg-amber-50 text-amber-800 border-amber-200',
  bonificacao: 'bg-purple-50 text-purple-700 border-purple-200',
  outros: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const CustomerVouchersManager: React.FC = () => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'todos' | 'com_saldo' | 'ativo' | 'utilizado_parcial' | 'utilizado_total' | 'cancelado'
  >('todos');

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  // Modais
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<CustomerVoucher | null>(null);
  const [historyVoucher, setHistoryVoucher] = useState<CustomerVoucher | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CustomerVoucher | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CustomerVoucher | null>(null);

  // Campos do Formulário
  const [customerId, setCustomerId] = useState('');
  const [origin, setOrigin] = useState<CustomerVoucherOrigin>('credito_comercial');
  const [originalAmount, setOriginalAmount] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expirationDate, setExpirationDate] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const activeCustomers = useMemo(
    () => (dbState.customers || []).filter((c) => c.status === 'ativo'),
    [dbState.customers]
  );

  const companyVouchers = useMemo(
    () =>
      Database.getCustomerVouchers(currentCompany.id).sort((a, b) =>
        (b.createdAt || b.issueDate).localeCompare(a.createdAt || a.issueDate)
      ),
    [dbState, currentCompany.id]
  );

  const todayStr = new Date().toISOString().split('T')[0];

  const kpis = useMemo(() => {
    const validAvailable = companyVouchers.filter(
      (v) =>
        (v.status === 'ativo' || v.status === 'utilizado_parcial') &&
        v.remainingBalance > 0.009 &&
        (!v.expirationDate || v.expirationDate >= todayStr)
    );
    const totalAvailableBalance = validAvailable.reduce((s, v) => s + (v.remainingBalance || 0), 0);
    const totalUsedAmount = companyVouchers
      .filter((v) => v.status !== 'cancelado')
      .reduce((s, v) => s + (v.usedAmount || 0), 0);
    const customersWithCredit = new Set(validAvailable.map((v) => v.customerId)).size;
    return {
      totalAvailableBalance,
      totalUsedAmount,
      customersWithCredit,
      activeCount: validAvailable.length,
      totalCount: companyVouchers.length,
    };
  }, [companyVouchers, todayStr]);

  const filteredVouchers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return companyVouchers.filter((v) => {
      if (statusFilter === 'com_saldo') {
        const hasSaldo =
          (v.status === 'ativo' || v.status === 'utilizado_parcial') && v.remainingBalance > 0.009;
        if (!hasSaldo) return false;
      } else if (statusFilter !== 'todos' && v.status !== statusFilter) {
        return false;
      }

      if (!q) return true;
      return (
        v.code.toLowerCase().includes(q) ||
        v.customerName.toLowerCase().includes(q) ||
        (v.customerCpfCnpj || '').toLowerCase().includes(q) ||
        (v.customerCode || '').toLowerCase().includes(q) ||
        v.reason.toLowerCase().includes(q)
      );
    });
  }, [companyVouchers, statusFilter, searchTerm]);

  const handleOpenCreate = () => {
    setEditingVoucher(null);
    setCustomerId('');
    setOrigin('credito_comercial');
    setOriginalAmount('');
    setIssueDate(new Date().toISOString().split('T')[0]);
    setExpirationDate('');
    setReason('');
    setNotes('');
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (v: CustomerVoucher) => {
    setEditingVoucher(v);
    setCustomerId(v.customerId);
    setOrigin(v.origin);
    setOriginalAmount(String(v.originalAmount));
    setIssueDate(v.issueDate);
    setExpirationDate(v.expirationDate || '');
    setReason(v.reason);
    setNotes(v.notes || '');
    setIsFormModalOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      toast.warning('Selecione o cliente titular do Vale.', 'Cliente Obrigatório');
      return;
    }
    const parsedAmount = parseFloat(originalAmount.replace(',', '.'));
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.warning('Informe um valor válido maior que zero para o Vale.', 'Valor Inválido');
      return;
    }
    if (editingVoucher && parsedAmount < editingVoucher.usedAmount) {
      toast.warning(
        `O valor original não pode ser menor que o valor já utilizado (${formatCurrency(editingVoucher.usedAmount)}).`,
        'Valor Inválido'
      );
      return;
    }
    if (!reason.trim()) {
      toast.warning('Informe o motivo ou origem deste crédito.', 'Motivo Obrigatório');
      return;
    }

    const saved = Database.saveCustomerVoucher({
      id: editingVoucher?.id,
      companyId: currentCompany.id,
      customerId,
      origin,
      originalAmount: parsedAmount,
      issueDate,
      expirationDate: expirationDate || undefined,
      reason: reason.trim(),
      notes: notes.trim() || undefined,
    });

    FirebaseSyncService.syncToFirebase(Database.getState()).catch(() => {});
    toast.success(
      editingVoucher
        ? `Vale ${saved.code} atualizado com sucesso!`
        : `Vale ${saved.code} (${formatCurrency(saved.originalAmount)}) cadastrado para ${saved.customerName}!`,
      'Vale de Crédito'
    );
    setIsFormModalOpen(false);
  };

  const handleConfirmCancel = () => {
    if (!cancelTarget) return;
    Database.cancelCustomerVoucher(cancelTarget.id, cancelReason.trim() || undefined);
    FirebaseSyncService.syncToFirebase(Database.getState()).catch(() => {});
    toast.success(`Vale ${cancelTarget.code} cancelado com sucesso.`, 'Vale Cancelado');
    setCancelTarget(null);
    setCancelReason('');
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    Database.deleteCustomerVoucher(deleteTarget.id);
    FirebaseSyncService.syncToFirebase(Database.getState()).catch(() => {});
    toast.success(`Vale ${deleteTarget.code} excluído.`, 'Registro Removido');
    setDeleteTarget(null);
  };

  const formatDateBr = (dateStr?: string) => {
    if (!dateStr) return '-';
    if (dateStr.includes('T')) {
      return new Date(dateStr).toLocaleDateString('pt-BR');
    }
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4">
      {/* Cabeçalho do Submódulo */}
      <div className="shrink-0 bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Ticket className="text-amber-600" size={20} />
            <span>Vale — Controle de Créditos de Clientes</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Cadastre créditos em haver para clientes. Ao selecionar o cliente nas vendas (PDV Balcão, Pedidos de Venda e Vendas Mobile), o sistema alertará o vendedor e permitirá usar o Vale para baixar títulos no Contas a Receber.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0"
        >
          <Plus size={16} />
          <span>Novo Vale / Crédito</span>
        </button>
      </div>

      {/* Cards de Resumo (KPIs) */}
      <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-emerald-200 p-3.5 shadow-2xs">
          <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
            <Wallet size={14} />
            <span>Crédito Disponível em Vales</span>
          </p>
          <p className="text-xl font-black text-emerald-900 font-mono mt-1">
            {formatCurrency(kpis.totalAvailableBalance)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {kpis.activeCount} vale(s) ativo(s) prontos para uso
          </p>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-3.5 shadow-2xs">
          <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
            <UserCheck size={14} />
            <span>Clientes com Crédito</span>
          </p>
          <p className="text-xl font-black text-blue-900 font-mono mt-1">
            {kpis.customersWithCredit}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Alertados automaticamente nas vendas
          </p>
        </div>

        <div className="bg-white rounded-xl border border-purple-200 p-3.5 shadow-2xs">
          <p className="text-[11px] font-bold text-purple-700 uppercase tracking-wide flex items-center gap-1.5">
            <ArrowDownRight size={14} />
            <span>Total Abatido em Recebíveis</span>
          </p>
          <p className="text-xl font-black text-purple-900 font-mono mt-1">
            {formatCurrency(kpis.totalUsedAmount)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Baixas realizadas no Contas a Receber
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
            <Ticket size={14} />
            <span>Total de Vales Registrados</span>
          </p>
          <p className="text-xl font-black text-slate-900 font-mono mt-1">
            {kpis.totalCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Histórico completo da unidade
          </p>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="shrink-0 bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-2xs">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código do vale, cliente, CPF/CNPJ ou motivo..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:bg-white focus:border-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {(
            [
              { id: 'todos', label: 'Todos' },
              { id: 'com_saldo', label: 'Com Saldo' },
              { id: 'ativo', label: 'Ativos' },
              { id: 'utilizado_parcial', label: 'Parciais' },
              { id: 'utilizado_total', label: 'Utilizados' },
              { id: 'cancelado', label: 'Cancelados' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                statusFilter === f.id
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela de Vales */}
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="flex-1 min-h-[280px] overflow-auto">
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase shadow-[0_1px_0_0_rgba(226,232,240,1)]">
              <tr>
                <th className="p-3">Código / Emissão</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Origem & Motivo</th>
                <th className="p-3 text-right">Valor Original</th>
                <th className="p-3 text-right">Utilizado</th>
                <th className="p-3 text-right">Saldo Disponível</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400">
                    <Ticket size={32} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">Nenhum Vale cadastrado ou encontrado.</p>
                    <p className="text-[11px] mt-0.5">
                      Clique em &quot;+ Novo Vale / Crédito&quot; para cadastrar um crédito para o cliente.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredVouchers.map((v) => {
                  const isExpired =
                    Boolean(v.expirationDate) &&
                    v.expirationDate! < todayStr &&
                    v.remainingBalance > 0.009 &&
                    v.status !== 'cancelado';

                  return (
                    <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 whitespace-nowrap">
                        <div className="font-mono font-bold text-amber-700">{v.code}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Calendar size={11} />
                          <span>{formatDateBr(v.issueDate)}</span>
                        </div>
                        {v.expirationDate && (
                          <div
                            className={`text-[10px] font-semibold mt-0.5 ${
                              isExpired ? 'text-rose-600' : 'text-slate-400'
                            }`}
                          >
                            Validade: {formatDateBr(v.expirationDate)}
                            {isExpired ? ' (Expirado)' : ''}
                          </div>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="font-bold text-slate-800">{v.customerName}</div>
                        {v.customerCpfCnpj && (
                          <div className="text-[11px] font-mono text-slate-500">{v.customerCpfCnpj}</div>
                        )}
                      </td>

                      <td className="p-3 max-w-xs">
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border mb-1 ${
                            ORIGIN_COLORS[v.origin] || ORIGIN_COLORS.outros
                          }`}
                        >
                          {ORIGIN_LABELS[v.origin] || v.origin}
                        </span>
                        <p className="text-slate-700 font-medium line-clamp-2">{v.reason}</p>
                        {v.notes && <p className="text-[11px] text-slate-400 truncate mt-0.5">{v.notes}</p>}
                      </td>

                      <td className="p-3 text-right font-mono font-semibold text-slate-700">
                        {formatCurrency(v.originalAmount)}
                      </td>

                      <td className="p-3 text-right font-mono font-semibold text-purple-700">
                        {formatCurrency(v.usedAmount)}
                      </td>

                      <td className="p-3 text-right font-mono font-black text-emerald-700 text-sm">
                        {v.status === 'cancelado' ? (
                          <span className="text-slate-400 line-through">{formatCurrency(v.remainingBalance)}</span>
                        ) : (
                          formatCurrency(v.remainingBalance)
                        )}
                      </td>

                      <td className="p-3 text-center">
                        {v.status === 'ativo' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 uppercase">
                            <CheckCircle2 size={11} />
                            Ativo
                          </span>
                        )}
                        {v.status === 'utilizado_parcial' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 uppercase">
                            Parcial
                          </span>
                        )}
                        {v.status === 'utilizado_total' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 uppercase">
                            Utilizado
                          </span>
                        )}
                        {v.status === 'cancelado' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 uppercase">
                            <XCircle size={11} />
                            Cancelado
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setHistoryVoucher(v)}
                            className="p-1.5 hover:bg-purple-50 text-slate-500 hover:text-purple-700 rounded-lg border border-slate-200 hover:border-purple-200 cursor-pointer transition-colors"
                            title={`Histórico de utilizações (${v.usages?.length || 0})`}
                          >
                            <History size={13} />
                          </button>
                          {v.status !== 'cancelado' && v.status !== 'utilizado_total' && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(v)}
                              className="p-1.5 hover:bg-blue-50 text-slate-500 hover:text-blue-700 rounded-lg border border-slate-200 hover:border-blue-200 cursor-pointer transition-colors"
                              title="Editar Vale"
                            >
                              <Edit2 size={13} />
                            </button>
                          )}
                          {(v.status === 'ativo' || v.status === 'utilizado_parcial') && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancelTarget(v);
                                setCancelReason('');
                              }}
                              className="p-1.5 hover:bg-amber-50 text-slate-500 hover:text-amber-700 rounded-lg border border-slate-200 hover:border-amber-200 cursor-pointer transition-colors"
                              title="Cancelar Vale"
                            >
                              <Ban size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(v)}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg border border-slate-200 hover:border-rose-200 cursor-pointer transition-colors"
                            title="Excluir Vale"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Cadastrar / Editar Vale */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/70">
              <div className="flex items-center gap-2">
                <Ticket className="text-amber-600" size={20} />
                <h3 className="font-bold text-slate-900 text-sm">
                  {editingVoucher ? `Editar Vale ${editingVoucher.code}` : 'Cadastrar Novo Vale (Crédito de Cliente)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Cliente Titular do Vale *</label>
                <CustomerSearchCombobox
                  customers={activeCustomers}
                  selectedCustomerId={customerId}
                  onSelectCustomer={setCustomerId}
                  placeholder="Digite o nome ou CPF/CNPJ do cliente..."
                  size="md"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Origem do Crédito *</label>
                  <select
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value as CustomerVoucherOrigin)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800"
                  >
                    <option value="credito_comercial">Crédito Comercial</option>
                    <option value="adiantamento">Adiantamento / Sinal</option>
                    <option value="devolucao">Devolução / Troca</option>
                    <option value="bonificacao">Bonificação / Acordo</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Valor do Vale (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={originalAmount}
                    onChange={(e) => setOriginalAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-slate-900"
                  />
                  {editingVoucher && editingVoucher.usedAmount > 0 && (
                    <p className="text-[10px] text-amber-700 font-semibold mt-0.5">
                      Mínimo {formatCurrency(editingVoucher.usedAmount)} (valor já utilizado)
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Data de Emissão *</label>
                  <input
                    type="date"
                    required
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Validade (Opcional)</label>
                  <input
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Motivo / Referência do Crédito *</label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex: Crédito referente à devolução de mercadoria / Pagamento antecipado..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observações Internas (Opcional)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalhes adicionais sobre o acordo ou utilização..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs cursor-pointer"
                >
                  {editingVoucher ? 'Salvar Alterações' : 'Emitir Vale de Crédito'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Histórico de Utilizações */}
      {historyVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <History size={16} className="text-purple-600" />
                  <span>Extrato de Utilização — {historyVoucher.code}</span>
                </h3>
                <p className="text-[11px] text-slate-500">{historyVoucher.customerName}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryVoucher(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Valor Original</span>
                  <p className="font-mono font-bold text-slate-800">{formatCurrency(historyVoucher.originalAmount)}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-purple-600 uppercase">Utilizado</span>
                  <p className="font-mono font-bold text-purple-700">{formatCurrency(historyVoucher.usedAmount)}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">Saldo Atual</span>
                  <p className="font-mono font-black text-emerald-700">{formatCurrency(historyVoucher.remainingBalance)}</p>
                </div>
              </div>

              {!historyVoucher.usages || historyVoucher.usages.length === 0 ? (
                <div className="py-6 text-center text-slate-400">
                  Este Vale ainda não foi utilizado em nenhuma baixa de Contas a Receber.
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {historyVoucher.usages.map((u) => (
                    <div key={u.id} className="p-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-800">
                          Título {u.receivableDocNumber}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {new Date(u.date).toLocaleString('pt-BR')} • Por {u.userName}
                        </p>
                        {u.notes && <p className="text-[11px] text-slate-600 mt-0.5">{u.notes}</p>}
                      </div>
                      <span className="font-mono font-bold text-purple-700 shrink-0">
                        -{formatCurrency(u.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setHistoryVoucher(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmação de Cancelamento */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
              <AlertTriangle size={18} />
              <span>Cancelar Vale {cancelTarget.code}?</span>
            </div>
            <p className="text-slate-600">
              O saldo restante de <strong>{formatCurrency(cancelTarget.remainingBalance)}</strong> do cliente{' '}
              <strong>{cancelTarget.customerName}</strong> será invalidado e não poderá mais ser usado em baixas.
            </p>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Motivo do Cancelamento (Opcional)</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Crédito estornado ou lançado em duplicidade..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-4 py-2 font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl cursor-pointer"
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmação de Exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
              <Trash2 size={18} />
              <span>Excluir Vale {deleteTarget.code}?</span>
            </div>
            <p className="text-slate-600">
              Esta ação removerá permanentemente o Vale de{' '}
              <strong>{deleteTarget.customerName}</strong> ({formatCurrency(deleteTarget.originalAmount)}).
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl cursor-pointer"
              >
                Excluir Definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
