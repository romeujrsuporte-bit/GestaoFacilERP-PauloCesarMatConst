import React, { useState, useMemo } from 'react';
import {
  ListTree,
  Search,
  Plus,
  Filter,
  Download,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Tag,
  Hash,
  Layers,
  ChevronRight,
  ChevronDown,
  Info,
  Building2,
  FileSpreadsheet,
  X,
  Check,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Database } from '../../services/db';
import { ChartOfAccount, AccountNature, AccountType, DreGroup, DreLineKey } from '../../types';
import { toast } from '../../services/toast';
import { FirebaseSyncService } from '../../services/firebaseSync';

export const ChartOfAccountsView: React.FC = () => {
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();
  const [dbState, setDbState] = useState(Database.getState());

  React.useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  const accounts = useMemo(() => {
    return Database.getChartOfAccounts(currentCompany.id);
  }, [dbState, currentCompany.id]);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('todos');
  const [selectedType, setSelectedType] = useState<'todos' | 'analitica' | 'sintetica'>('todos');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [showMetricsSummary, setShowMetricsSummary] = useState(false);

  // Modais de Criação e Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [formData, setFormData] = useState<{
    parentCode: string;
    hierarchicalCode: string;
    launchCode: string;
    name: string;
    nature: AccountNature;
    dreGroup: DreGroup;
    dreLine: DreLineKey;
    status: 'ativo' | 'inativo';
    companyScope: 'todos' | string;
    description: string;
  }>({
    parentCode: '4.2',
    hierarchicalCode: '',
    launchCode: '',
    name: '',
    nature: 'despesa',
    dreGroup: '4_DESPESAS_COMERCIAIS_LOGISTICA',
    dreLine: 'despesas_logistica',
    status: 'ativo',
    companyScope: 'todos',
    description: '',
  });

  // Modal de Exclusão
  const [accountToDelete, setAccountToDelete] = useState<ChartOfAccount | null>(null);

  // Alternar colapso de grupos
  const toggleGroupCollapse = (code: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  const expandAll = () => setCollapsedGroups({});
  const collapseAll = () => {
    const collapsed: Record<string, boolean> = {};
    accounts.forEach((a) => {
      if (a.type === 'sintetica') collapsed[a.hierarchicalCode] = true;
    });
    setCollapsedGroups(collapsed);
  };

  // Contas filtradas
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      // Filtro de Grupo
      if (selectedGroup !== 'todos') {
        if (!acc.hierarchicalCode.startsWith(selectedGroup)) {
          return false;
        }
      }

      // Filtro de Tipo
      if (selectedType !== 'todos' && acc.type !== selectedType) {
        return false;
      }

      // Busca por código curto, código hierárquico ou nome
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchesName = acc.name.toLowerCase().includes(term);
        const matchesHierarchical = acc.hierarchicalCode.toLowerCase().includes(term);
        const matchesLaunch = acc.launchCode ? acc.launchCode.includes(term) : false;
        if (!matchesName && !matchesHierarchical && !matchesLaunch) {
          return false;
        }
      }

      return true;
    });
  }, [accounts, selectedGroup, selectedType, searchTerm]);

  // Estatísticas
  const stats = useMemo(() => {
    const total = accounts.length;
    const analytics = accounts.filter((a) => a.type === 'analitica');
    const launchCodes = accounts.filter((a) => a.launchCode).map((a) => a.launchCode!);
    return {
      total,
      analyticsCount: analytics.length,
      launchCodesCount: launchCodes.length,
      activeCount: accounts.filter((a) => a.status === 'ativo').length,
    };
  }, [accounts]);

  // Abertura do Modal para Nova Conta Analítica
  const handleOpenNewAccountModal = (defaultParent?: ChartOfAccount) => {
    const parent = defaultParent || accounts.find((a) => a.hierarchicalCode === '4.2') || accounts[0];
    
    // Sugerir próximo código de lançamento livre (3 dígitos)
    const usedLaunchCodes = new Set(accounts.filter((a) => a.launchCode).map((a) => parseInt(a.launchCode!, 10)));
    let nextCodeNum = 101;
    while (usedLaunchCodes.has(nextCodeNum) && nextCodeNum < 999) {
      nextCodeNum++;
    }
    const suggestedLaunchCode = String(nextCodeNum).padStart(3, '0');

    // Sugerir próximo código hierárquico
    let suggestedHierarchical = '';
    if (parent) {
      const siblings = accounts.filter((a) => a.parentCode === parent.hierarchicalCode);
      const nextSubIndex = siblings.length + 1;
      suggestedHierarchical = `${parent.hierarchicalCode}.${String(nextSubIndex).padStart(2, '0')}`;
    }

    setEditingAccount(null);
    setFormData({
      parentCode: parent?.hierarchicalCode || '',
      hierarchicalCode: suggestedHierarchical,
      launchCode: suggestedLaunchCode,
      name: '',
      nature: parent?.nature || 'despesa',
      dreGroup: parent?.dreGroup || '4_DESPESAS_COMERCIAIS_LOGISTICA',
      dreLine: parent?.dreLine || 'despesas_logistica',
      status: 'ativo',
      companyScope: 'todos',
      description: '',
    });
    setIsModalOpen(true);
  };

  // Abertura do Modal para Edição
  const handleOpenEditAccountModal = (acc: ChartOfAccount) => {
    setEditingAccount(acc);
    setFormData({
      parentCode: acc.parentCode || '',
      hierarchicalCode: acc.hierarchicalCode,
      launchCode: acc.launchCode || '',
      name: acc.name,
      nature: acc.nature,
      dreGroup: acc.dreGroup,
      dreLine: acc.dreLine,
      status: acc.status,
      companyScope: acc.companyId || 'todos',
      description: acc.description || '',
    });
    setIsModalOpen(true);
  };

  // Salvar Conta
  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.warning('Informe o nome da conta.');
      return;
    }

    if (!formData.hierarchicalCode.trim()) {
      toast.warning('Informe o código hierárquico.');
      return;
    }

    // Se analítica, validar 3 dígitos
    const cleanLaunchCode = formData.launchCode.trim();
    if (!/^\d{3}$/.test(cleanLaunchCode)) {
      toast.warning('O Código de Lançamento deve conter exatamente 3 dígitos numéricos (ex: 101).');
      return;
    }

    const accountToSave: ChartOfAccount = {
      id: editingAccount ? editingAccount.id : 'acc-' + Date.now(),
      companyId: formData.companyScope === 'todos' ? undefined : formData.companyScope,
      hierarchicalCode: formData.hierarchicalCode.trim(),
      launchCode: cleanLaunchCode,
      name: formData.name.trim(),
      type: 'analitica',
      level: 3,
      parentCode: formData.parentCode,
      nature: formData.nature,
      dreGroup: formData.dreGroup,
      dreLine: formData.dreLine,
      status: formData.status,
      isSystem: editingAccount?.isSystem || false,
      description: formData.description.trim(),
      order: editingAccount?.order || (accounts.length + 1) * 10,
    };

    const res = Database.saveChartOfAccount(accountToSave);
    if (!res.success) {
      toast.error(res.error || 'Erro ao salvar conta.');
      return;
    }

    toast.success(`Conta "${accountToSave.hierarchicalCode} - ${accountToSave.name}" salva com sucesso!`);
    FirebaseSyncService.syncToFirebase(Database.getState()).catch(console.error);
    setIsModalOpen(false);
  };

  // Excluir Conta
  const handleConfirmDelete = () => {
    if (!accountToDelete) return;
    const res = Database.deleteChartOfAccount(accountToDelete.id);
    if (!res.success) {
      toast.error(res.error || 'Não foi possível excluir a conta.');
      return;
    }

    toast.success(`Conta "${accountToDelete.hierarchicalCode} - ${accountToDelete.name}" removida com sucesso!`);
    FirebaseSyncService.syncToFirebase(Database.getState()).catch(console.error);
    setAccountToDelete(null);
  };

  // Exportar Plano de Contas para CSV / Excel
  const handleExportCSV = () => {
    const headers = [
      'Código Hierárquico',
      'Código Lançamento (3 Dígitos)',
      'Nome da Conta',
      'Tipo',
      'Nível',
      'Natureza',
      'Grupo DRE',
      'Status',
    ];
    const rows = accounts.map((a) => [
      `"${a.hierarchicalCode}"`,
      `"${a.launchCode || ''}"`,
      `"${a.name.replace(/"/g, '""')}"`,
      a.type === 'analitica' ? 'Analítica (Recebe Lançamento)' : 'Sintética (Totalizador)',
      a.level,
      a.nature,
      a.dreGroup,
      a.status.toUpperCase(),
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Plano_de_Contas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Plano de Contas exportado com sucesso!');
  };

  // Retorna cor e badge de natureza
  const getNatureBadge = (nature: AccountNature) => {
    switch (nature) {
      case 'receita':
      case 'receita_financeira':
        return <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Receita</span>;
      case 'deducao':
        return <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">Dedução</span>;
      case 'custo':
        return <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">Custo (CMV/CPV)</span>;
      case 'despesa':
      case 'despesa_financeira':
        return <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">Despesa</span>;
      case 'nao_dre':
      default:
        return <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">Patrimonial / Não DRE</span>;
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* Top Banner de Apresentação */}
      <div className="shrink-0 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <ListTree size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800">Plano de Contas Industrial & Comercial</h2>
              <p className="text-xs text-slate-500">
                Estrutura hierárquica oficial para classificação de vendas, custos de produção (CPV), mercadorias (CMV) e despesas com códigos de lançamento exclusivos de 3 dígitos.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowMetricsSummary((prev) => !prev)}
            className="px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            title={showMetricsSummary ? 'Ocultar informativo de totais' : 'Exibir informativo de totais'}
          >
            {showMetricsSummary ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>{showMetricsSummary ? 'Ocultar Totais' : 'Exibir Totais'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Exportar Plano de Contas para Excel / CSV"
          >
            <Download size={14} />
            <span>Exportar CSV</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenNewAccountModal()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={15} />
            <span>Nova Conta Analítica</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas (mantidos ocultos por padrão) */}
      {showMetricsSummary && (
        <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 block uppercase">Total de Contas</span>
            <div className="text-xl font-black text-slate-900 mt-1 font-mono">{stats.total}</div>
            <span className="text-[10px] text-slate-500">9 Grupos Principais</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 block uppercase">Contas Analíticas</span>
            <div className="text-xl font-black text-blue-600 mt-1 font-mono">{stats.analyticsCount}</div>
            <span className="text-[10px] text-blue-600 font-medium">Aptas para lançamentos</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 block uppercase">Códigos de Lançamento</span>
            <div className="text-xl font-black text-emerald-600 mt-1 font-mono">{stats.launchCodesCount}</div>
            <span className="text-[10px] text-emerald-700 font-medium">3 dígitos (101, 102...)</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-400 block uppercase">Escopo de Aplicação</span>
            <div className="text-sm font-black text-slate-800 mt-1">Matriz & Filiais</div>
            <span className="text-[10px] text-slate-500">Estrutura Compartilhada</span>
          </div>
        </div>
      )}

      {/* Barra de Filtros e Busca Rápida */}
      <div className="shrink-0 bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por código (101, 4.2.01) ou descrição..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Filtro de Grupo */}
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 cursor-pointer"
            >
              <option value="todos">Todos os 9 Grupos</option>
              <option value="1">1 – Receitas Operacionais</option>
              <option value="2">2 – Deduções da Receita</option>
              <option value="3">3 – Custos (CMV / CPV)</option>
              <option value="4">4 – Despesas Comerciais e Logística</option>
              <option value="5">5 – Despesas Administrativas</option>
              <option value="6">6 – Despesas Financeiras</option>
              <option value="7">7 – Receitas Financeiras</option>
              <option value="8">8 – Outras Despesas</option>
              <option value="9">9 – Movimentações Não DRE (Estoque/Ativo)</option>
            </select>

            {/* Filtro de Tipo */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 cursor-pointer"
            >
              <option value="todos">Sintéticas & Analíticas</option>
              <option value="analitica">Apenas Analíticas (Lançamento)</option>
              <option value="sintetica">Apenas Grupos/Subgrupos</option>
            </select>

            <button
              type="button"
              onClick={expandAll}
              className="px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Expandir
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Recolher
            </button>
          </div>
        </div>
      </div>

      {/* Tabela Hierárquica do Plano de Contas */}
      <div className="flex-1 min-h-[420px] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 uppercase font-bold text-[10px] border-b border-slate-200 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
              <tr>
                <th className="py-3 px-4 w-44">Cód. Hierárquico</th>
                <th className="py-3 px-3 w-32 text-center">Cód. Lançamento</th>
                <th className="py-3 px-4">Nome da Conta Contábil / Gerencial</th>
                <th className="py-3 px-3 w-36">Natureza</th>
                <th className="py-3 px-3 w-48">Grupo DRE</th>
                <th className="py-3 px-3 w-24 text-center">Status</th>
                <th className="py-3 px-4 w-28 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Nenhuma conta encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  const isLevel1 = acc.level === 1;
                  const isLevel2 = acc.level === 2;
                  const isAnalytic = acc.type === 'analitica';

                  return (
                    <tr
                      key={acc.id}
                      className={`transition-colors ${
                        isLevel1
                          ? 'bg-slate-900 text-white font-bold hover:bg-slate-950'
                          : isLevel2
                          ? 'bg-slate-100/80 font-bold text-slate-900 hover:bg-slate-200/70'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Código Hierárquico */}
                      <td className="py-2.5 px-4 font-mono">
                        <div
                          className="flex items-center gap-1.5"
                          style={{ paddingLeft: `${(acc.level - 1) * 16}px` }}
                        >
                          {!isAnalytic ? (
                            <button
                              type="button"
                              onClick={() => toggleGroupCollapse(acc.hierarchicalCode)}
                              className="p-0.5 rounded hover:bg-white/20 transition-colors"
                            >
                              {collapsedGroups[acc.hierarchicalCode] ? (
                                <ChevronRight size={13} className={isLevel1 ? 'text-slate-300' : 'text-slate-600'} />
                              ) : (
                                <ChevronDown size={13} className={isLevel1 ? 'text-slate-300' : 'text-slate-600'} />
                              )}
                            </button>
                          ) : (
                            <span className="w-3 inline-block" />
                          )}
                          <span className={isLevel1 ? 'text-amber-400 font-black' : isLevel2 ? 'text-blue-700' : 'text-slate-700 font-bold'}>
                            {acc.hierarchicalCode}
                          </span>
                        </div>
                      </td>

                      {/* Código de Lançamento (3 dígitos) */}
                      <td className="py-2.5 px-3 text-center">
                        {acc.launchCode ? (
                          <span className="inline-flex items-center gap-1 font-mono font-black text-xs px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                            <Hash size={11} className="text-blue-500" />
                            {acc.launchCode}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono">—</span>
                        )}
                      </td>

                      {/* Nome da Conta */}
                      <td className="py-2.5 px-4">
                        <div
                          className="flex items-center gap-2"
                          style={{ paddingLeft: `${(acc.level - 1) * 12}px` }}
                        >
                          <span
                            className={`${
                              isLevel1
                                ? 'text-sm uppercase tracking-wide text-white'
                                : isLevel2
                                ? 'text-xs text-slate-900'
                                : 'text-xs text-slate-800'
                            }`}
                          >
                            {acc.name}
                          </span>
                          {acc.isSystem && (
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                                isLevel1 ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600'
                              }`}
                              title="Conta estrutural do sistema"
                            >
                              Padrão
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Natureza */}
                      <td className="py-2.5 px-3">
                        {isLevel1 ? (
                          <span className="text-[10px] text-slate-300 uppercase font-semibold">Grupo Nível 1</span>
                        ) : (
                          getNatureBadge(acc.nature)
                        )}
                      </td>

                      {/* Grupo DRE */}
                      <td className="py-2.5 px-3 text-[11px] text-slate-600 truncate max-w-xs" title={acc.dreGroup}>
                        <span className={isLevel1 ? 'text-slate-300' : 'text-slate-600'}>
                          {acc.dreGroup.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            acc.status === 'ativo'
                              ? isLevel1
                                ? 'bg-emerald-900/60 text-emerald-300'
                                : 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {acc.status}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isLevel2 && (
                            <button
                              type="button"
                              onClick={() => handleOpenNewAccountModal(acc)}
                              className="p-1 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                              title="Adicionar subconta analítica neste grupo"
                            >
                              <Plus size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEditAccountModal(acc)}
                            className={`p-1 rounded transition-colors ${
                              isLevel1 ? 'hover:bg-white/20 text-slate-200' : 'hover:bg-blue-50 text-slate-500 hover:text-blue-700'
                            }`}
                            title="Editar Conta"
                          >
                            <Edit2 size={13} />
                          </button>
                          {!acc.isSystem && isAnalytic && (
                            <button
                              type="button"
                              onClick={() => setAccountToDelete(acc)}
                              className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              title="Excluir Conta"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
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

      {/* ========================================================================= */}
      {/* MODAL: CRIAR OU EDITAR CONTA ANALÍTICA                                    */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveAccount}
            className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4 my-6"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <ListTree size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {editingAccount ? 'Editar Conta do Plano' : 'Cadastrar Nova Conta Analítica'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Contas analíticas recebem lançamentos e possuem o código de 3 dígitos.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Código de Lançamento (3 dígitos obrigatórios) */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
                <label className="block font-bold text-blue-900 text-xs">
                  Código de Lançamento (Exclusivo • 3 Dígitos) *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    maxLength={3}
                    placeholder="Ex: 101"
                    value={formData.launchCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 3);
                      setFormData((p) => ({ ...p, launchCode: val }));
                    }}
                    className="w-28 px-3 py-2 bg-white border border-blue-300 rounded-lg font-mono font-black text-sm text-blue-700 tracking-wider text-center focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[11px] text-blue-700 leading-tight">
                    Utilizado no Contas a Pagar e rotinas rápidas para classificação instantânea de despesas.
                  </span>
                </div>
              </div>

              {/* Código Hierárquico e Grupo Pai */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Grupo Superior (Pai) *</label>
                  <select
                    value={formData.parentCode}
                    onChange={(e) => {
                      const pCode = e.target.value;
                      const parent = accounts.find((a) => a.hierarchicalCode === pCode);
                      const siblings = accounts.filter((a) => a.parentCode === pCode);
                      const nextSub = `${pCode}.${String(siblings.length + 1).padStart(2, '0')}`;
                      setFormData((prev) => ({
                        ...prev,
                        parentCode: pCode,
                        hierarchicalCode: nextSub,
                        nature: parent?.nature || prev.nature,
                        dreGroup: parent?.dreGroup || prev.dreGroup,
                        dreLine: parent?.dreLine || prev.dreLine,
                      }));
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    {accounts
                      .filter((a) => a.type === 'sintetica' && a.level === 2)
                      .map((p) => (
                        <option key={p.id} value={p.hierarchicalCode}>
                          {p.hierarchicalCode} – {p.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Código Hierárquico *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 4.2.12"
                    value={formData.hierarchicalCode}
                    onChange={(e) => setFormData((p) => ({ ...p, hierarchicalCode: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
                  />
                </div>
              </div>

              {/* Nome da Conta */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Descrição / Nome da Conta *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Combustível de veículos de entrega"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold"
                />
              </div>

              {/* Natureza e Grupo DRE */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Natureza Contábil</label>
                  <select
                    value={formData.nature}
                    onChange={(e) => setFormData((p) => ({ ...p, nature: e.target.value as any }))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    <option value="receita">Receita Operacional</option>
                    <option value="deducao">Dedução de Receita</option>
                    <option value="custo">Custo (CMV / CPV)</option>
                    <option value="despesa">Despesa Operacional</option>
                    <option value="despesa_financeira">Despesa Financeira</option>
                    <option value="receita_financeira">Receita Financeira</option>
                    <option value="outras">Outras Despesas</option>
                    <option value="nao_dre">Movimentação Não DRE</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Grupo da DRE</label>
                  <select
                    value={formData.dreGroup}
                    onChange={(e) => setFormData((p) => ({ ...p, dreGroup: e.target.value as any }))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    <option value="1_RECEITAS">1 – Receitas Operacionais</option>
                    <option value="2_DEDUCOES">2 – Deduções da Receita</option>
                    <option value="3_CUSTOS">3 – Custos (CMV / CPV)</option>
                    <option value="4_DESPESAS_COMERCIAIS_LOGISTICA">4 – Despesas Comerciais & Logística</option>
                    <option value="5_DESPESAS_ADMINISTRATIVAS">5 – Despesas Administrativas</option>
                    <option value="6_DESPESAS_FINANCEIRAS">6 – Despesas Financeiras</option>
                    <option value="7_RECEITAS_FINANCEIRAS">7 – Receitas Financeiras</option>
                    <option value="8_OUTRAS_DESPESAS">8 – Outras Despesas</option>
                    <option value="9_NAO_DRE">9 – Não Entra na DRE (Estoque/Ativo)</option>
                  </select>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Status da Conta</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData((p) => ({ ...p, status: e.target.value as any }))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium"
                >
                  <option value="ativo">Ativa (Permite Lançamentos)</option>
                  <option value="inativo">Inativa (Bloqueada para Novos Lançamentos)</option>
                </select>
              </div>

              {/* Descrição Adicional */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Observações / Critério de Uso</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Utilizar em notas fiscais e comprovantes de postos de gasolina da frota..."
                  value={formData.description}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs"
              >
                Salvar Conta Analítica
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONFIRMAÇÃO DE EXCLUSÃO DE CONTA                                   */}
      {/* ========================================================================= */}
      {accountToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-3.5">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl w-fit">
              <AlertTriangle size={24} />
            </div>
            <h3 className="font-bold text-base text-slate-900">Excluir Conta do Plano?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Deseja realmente remover a conta <strong>{accountToDelete.hierarchicalCode} – {accountToDelete.name}</strong>?
              <br /><br />
              <span className="text-[11px] text-slate-500">
                O sistema valida se a conta possui subcontas ou lançamentos vinculados no Contas a Pagar antes de permitir a exclusão.
              </span>
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAccountToDelete(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-xs"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
