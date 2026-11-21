import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Truck,
  Plus,
  Search,
  Edit2,
  Trash2,
  Phone,
  Mail,
  MapPin,
  FileSpreadsheet,
  MessageSquare,
  DollarSign,
  Power,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Database } from '../../services/db';
import { Customer, Supplier } from '../../types';
import { formatCurrency } from '../../services/pricingEngine';
import { ExcelService } from '../../services/excelService';
import { toast } from '../../services/toast';
import { FirebaseSyncService } from '../../services/firebaseSync';
import { SortableTh, SortConfig, toggleSortConfig, compareSortValues } from '../common/SortableHeader';

type CustomerSortKey =
  | 'code'
  | 'name'
  | 'type'
  | 'cpfCnpj'
  | 'contact'
  | 'cityState'
  | 'creditLimit'
  | 'status';

type SupplierSortKey =
  | 'code'
  | 'name'
  | 'contactName'
  | 'cpfCnpj'
  | 'phoneEmail'
  | 'cityState'
  | 'paymentTerms'
  | 'status';

export const CrmView: React.FC<{ initialSubTab?: 'clientes' | 'fornecedores' }> = ({
  initialSubTab = 'clientes',
}) => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  const [activeTab, setActiveTab] = useState<'clientes' | 'fornecedores'>(initialSubTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSortConfig, setCustomerSortConfig] = useState<SortConfig<CustomerSortKey>>({
    key: null,
    direction: 'asc',
  });
  const [supplierSortConfig, setSupplierSortConfig] = useState<SortConfig<SupplierSortKey>>({
    key: null,
    direction: 'asc',
  });

  useEffect(() => {
    setActiveTab(initialSubTab);
  }, [initialSubTab]);

  const handleCustomerSort = (key: CustomerSortKey) => {
    setCustomerSortConfig((prev) => toggleSortConfig(prev, key));
  };

  const handleSupplierSort = (key: SupplierSortKey) => {
    setSupplierSortConfig((prev) => toggleSortConfig(prev, key));
  };

  // Modais
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Form Clientes
  const [manualAddressInput, setManualAddressInput] = useState<{
    state: boolean;
    city: boolean;
    neighborhood: boolean;
    marketArea: boolean;
  }>({
    state: false,
    city: false,
    neighborhood: false,
    marketArea: false,
  });

  const [custForm, setCustForm] = useState<Partial<Customer>>({
    code: '',
    name: '',
    tradeName: '',
    type: 'PF',
    cpfCnpj: '',
    phone: '',
    whatsapp: '',
    email: '',
    zipCode: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: 'BA',
    marketArea: '',
    sellerName: '',
    deliveryRouteId: '',
    deliveryRouteName: '',
    creditLimit: undefined,
    preferredPaymentMethod: '',
    status: 'ativo',
    notes: '',
    showSaleAlert: false,
  });

  // Form Fornecedores
  const [suppForm, setSuppForm] = useState<Partial<Supplier>>({
    code: '',
    name: '',
    tradeName: '',
    type: 'PJ',
    cpfCnpj: '',
    contactName: '',
    phone: '',
    whatsapp: '',
    email: '',
    zipCode: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
    paymentTerms: '',
    status: 'ativo',
    notes: '',
  });

  // Salvar Cliente
  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custForm.name?.trim() || !custForm.code?.trim()) {
      alert('Código e Nome do cliente são obrigatórios.');
      return;
    }

    const state = Database.getState();
    const routeObj = state.deliveryRoutes?.find((r) => r.id === custForm.deliveryRouteId);
    const deliveryRouteName = routeObj ? routeObj.name : custForm.deliveryRouteName;

    if (editingCustomer) {
      state.customers = state.customers.map((c) =>
        c.id === editingCustomer.id
          ? ({
              ...c,
              ...custForm,
              city: custForm.city?.trim() || '',
              state: custForm.state?.trim() || '',
              creditLimit: custForm.creditLimit !== undefined && custForm.creditLimit !== null && !isNaN(Number(custForm.creditLimit)) ? Number(custForm.creditLimit) : 0,
              deliveryRouteName,
              notes: custForm.notes?.trim() || '',
              showSaleAlert: !!custForm.showSaleAlert,
              updatedAt: new Date().toISOString(),
            } as Customer)
          : c
      );
      Database.addAuditLog('ATUALIZAR_CLIENTE', 'CRM', editingCustomer.id, `Cliente ${custForm.name} atualizado`);
    } else {
      const newCust: Customer = {
        id: 'CLI-' + Date.now(),
        code: custForm.code!.trim(),
        name: custForm.name!.trim(),
        tradeName: custForm.tradeName?.trim() || '',
        type: custForm.type || 'PF',
        cpfCnpj: custForm.cpfCnpj?.trim() || '',
        phone: custForm.phone?.trim() || '',
        whatsapp: custForm.whatsapp?.trim() || '',
        email: custForm.email?.trim() || '',
        zipCode: custForm.zipCode?.trim() || '',
        street: custForm.street?.trim() || '',
        number: custForm.number?.trim() || '',
        neighborhood: custForm.neighborhood?.trim() || '',
        city: custForm.city?.trim() || '',
        state: custForm.state?.trim() || '',
        marketArea: custForm.marketArea?.trim() || '',
        sellerName: custForm.sellerName?.trim() || '',
        deliveryRouteId: custForm.deliveryRouteId || '',
        deliveryRouteName: deliveryRouteName || '',
        creditLimit: custForm.creditLimit !== undefined && custForm.creditLimit !== null && !isNaN(Number(custForm.creditLimit)) ? Number(custForm.creditLimit) : 0,
        preferredPaymentMethod: custForm.preferredPaymentMethod?.trim() || 'À Vista',
        status: custForm.status || 'ativo',
        notes: custForm.notes?.trim() || '',
        showSaleAlert: !!custForm.showSaleAlert,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.customers.unshift(newCust);
      Database.addAuditLog('CRIAR_CLIENTE', 'CRM', newCust.id, `Cliente ${newCust.name} cadastrado`);
    }

    Database.persist();
    setIsCustomerModalOpen(false);
  };

  // Salvar Fornecedor
  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suppForm.name?.trim() || !suppForm.code?.trim()) {
      alert('Código e Nome do fornecedor são obrigatórios.');
      return;
    }

    const state = Database.getState();
    if (editingSupplier) {
      state.suppliers = state.suppliers.map((s) =>
        s.id === editingSupplier.id ? ({ ...s, ...suppForm } as Supplier) : s
      );
      Database.addAuditLog('ATUALIZAR_FORNECEDOR', 'CRM', editingSupplier.id, `Fornecedor ${suppForm.name} atualizado`);
    } else {
      const newSupp: Supplier = {
        id: 'FOR-' + Date.now(),
        code: suppForm.code!.trim(),
        name: suppForm.name!.trim(),
        tradeName: suppForm.tradeName?.trim(),
        type: suppForm.type || 'PJ',
        cpfCnpj: suppForm.cpfCnpj?.trim() || '',
        contactName: suppForm.contactName?.trim(),
        phone: suppForm.phone?.trim() || '',
        whatsapp: suppForm.whatsapp?.trim() || '',
        email: suppForm.email?.trim() || '',
        zipCode: suppForm.zipCode?.trim(),
        street: suppForm.street?.trim(),
        number: suppForm.number?.trim(),
        neighborhood: suppForm.neighborhood?.trim(),
        city: suppForm.city?.trim() || '',
        state: suppForm.state || 'BA',
        paymentTerms: suppForm.paymentTerms || '30 dias',
        status: suppForm.status || 'ativo',
        notes: suppForm.notes?.trim() || '',
      };
      state.suppliers.unshift(newSupp);
      Database.addAuditLog('CRIAR_FORNECEDOR', 'CRM', newSupp.id, `Fornecedor ${newSupp.name} cadastrado`);
    }

    Database.persist();
    setIsSupplierModalOpen(false);
  };

  // Alternar status Ativo / Inativo de Cliente
  const handleToggleCustomerStatus = async (customer: Customer) => {
    const nextStatus = customer.status === 'ativo' ? 'inativo' : 'ativo';
    const state = Database.getState();
    state.customers = state.customers.map((c) =>
      c.id === customer.id ? { ...c, status: nextStatus } : c
    );
    Database.addAuditLog(
      nextStatus === 'ativo' ? 'ATIVAR_CLIENTE' : 'DESATIVAR_CLIENTE',
      'CADASTROS',
      customer.id,
      `Status do cliente ${customer.name} (${customer.code}) alterado para ${nextStatus.toUpperCase()}.`
    );
    Database.persist();
    try {
      await FirebaseSyncService.syncToFirebase(Database.getState());
    } catch (e) {
      console.warn('Erro ao sincronizar status do cliente com o Firebase:', e);
    }
    toast.success(
      `Cliente "${customer.name}" foi ${nextStatus === 'ativo' ? 'ativado' : 'desativado'} com sucesso.`,
      nextStatus === 'ativo' ? 'Cliente Ativado' : 'Cliente Desativado'
    );
  };

  // Alternar status Ativo / Inativo de Fornecedor
  const handleToggleSupplierStatus = async (supplier: Supplier) => {
    const nextStatus = supplier.status === 'ativo' ? 'inativo' : 'ativo';
    const state = Database.getState();
    state.suppliers = state.suppliers.map((s) =>
      s.id === supplier.id ? { ...s, status: nextStatus } : s
    );
    Database.addAuditLog(
      nextStatus === 'ativo' ? 'ATIVAR_FORNECEDOR' : 'DESATIVAR_FORNECEDOR',
      'CADASTROS',
      supplier.id,
      `Status do fornecedor ${supplier.name} (${supplier.code}) alterado para ${nextStatus.toUpperCase()}.`
    );
    Database.persist();
    try {
      await FirebaseSyncService.syncToFirebase(Database.getState());
    } catch (e) {
      console.warn('Erro ao sincronizar status do fornecedor com o Firebase:', e);
    }
    toast.success(
      `Fornecedor "${supplier.name}" foi ${nextStatus === 'ativo' ? 'ativado' : 'desativado'} com sucesso.`,
      nextStatus === 'ativo' ? 'Fornecedor Ativado' : 'Fornecedor Desativado'
    );
  };

  const filteredCustomers = dbState.customers.filter((c) => {
    return (
      searchTerm === '' ||
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.cpfCnpj.includes(searchTerm)
    );
  });

  const filteredSuppliers = dbState.suppliers.filter((s) => {
    return (
      searchTerm === '' ||
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.cpfCnpj.includes(searchTerm)
    );
  });

  const sortedCustomers = useMemo(() => {
    if (!customerSortConfig.key) return filteredCustomers;
    const key = customerSortConfig.key;
    const dir = customerSortConfig.direction;

    return [...filteredCustomers].sort((a, b) => {
      switch (key) {
        case 'code':
          return compareSortValues(a.code, b.code, dir);
        case 'name':
          return compareSortValues(a.name, b.name, dir);
        case 'type':
          return compareSortValues(a.type, b.type, dir);
        case 'cpfCnpj':
          return compareSortValues(a.cpfCnpj, b.cpfCnpj, dir);
        case 'contact':
          return compareSortValues(a.phone || a.whatsapp || a.email || '', b.phone || b.whatsapp || b.email || '', dir);
        case 'cityState':
          return compareSortValues(
            a.city ? `${a.city}/${a.state || ''}` : '',
            b.city ? `${b.city}/${b.state || ''}` : '',
            dir
          );
        case 'creditLimit':
          return compareSortValues(a.creditLimit || 0, b.creditLimit || 0, dir);
        case 'status':
          return compareSortValues(a.status, b.status, dir);
        default:
          return 0;
      }
    });
  }, [filteredCustomers, customerSortConfig]);

  const sortedSuppliers = useMemo(() => {
    if (!supplierSortConfig.key) return filteredSuppliers;
    const key = supplierSortConfig.key;
    const dir = supplierSortConfig.direction;

    return [...filteredSuppliers].sort((a, b) => {
      switch (key) {
        case 'code':
          return compareSortValues(a.code, b.code, dir);
        case 'name':
          return compareSortValues(a.name, b.name, dir);
        case 'contactName':
          return compareSortValues(a.contactName || '', b.contactName || '', dir);
        case 'cpfCnpj':
          return compareSortValues(a.cpfCnpj, b.cpfCnpj, dir);
        case 'phoneEmail':
          return compareSortValues(a.phone || a.email || '', b.phone || b.email || '', dir);
        case 'cityState':
          return compareSortValues(
            a.city ? `${a.city}/${a.state || ''}` : '',
            b.city ? `${b.city}/${b.state || ''}` : '',
            dir
          );
        case 'paymentTerms':
          return compareSortValues(a.paymentTerms || '', b.paymentTerms || '', dir);
        case 'status':
          return compareSortValues(a.status, b.status, dir);
        default:
          return 0;
      }
    });
  }, [filteredSuppliers, supplierSortConfig]);

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-7rem)]">
      {/* Topo / Sub-Abas */}
      <div className="shrink-0 bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            {activeTab === 'clientes' ? <Users className="text-blue-600" size={20} /> : <Truck className="text-blue-600" size={20} />}
            <span>{activeTab === 'clientes' ? 'Cadastro de Clientes' : 'Cadastro de Fornecedores'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            Controle de limites de crédito, histórico comercial, endereços e contatos por WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setActiveTab('clientes')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'clientes' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users size={14} />
              <span>Clientes ({dbState.customers.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('fornecedores')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'fornecedores' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck size={14} />
              <span>Fornecedores ({dbState.suppliers.length})</span>
            </button>
          </div>

          <button
            onClick={() => {
              if (activeTab === 'clientes') {
                setEditingCustomer(null);
                setCustForm({
                  code: 'CLI-' + String(dbState.customers.length + 1).padStart(3, '0'),
                  name: '',
                  tradeName: '',
                  type: 'PF',
                  cpfCnpj: '',
                  phone: '',
                  whatsapp: '',
                  email: '',
                  street: '',
                  number: '',
                  neighborhood: '',
                  city: '',
                  state: 'BA',
                  marketArea: '',
                  sellerName: '',
                  deliveryRouteId: '',
                  deliveryRouteName: '',
                  creditLimit: undefined,
                  preferredPaymentMethod: '',
                  status: 'ativo',
                  notes: '',
                  showSaleAlert: false,
                });
                setIsCustomerModalOpen(true);
              } else {
                setEditingSupplier(null);
                setSuppForm({
                  code: 'FOR-' + String(dbState.suppliers.length + 1).padStart(3, '0'),
                  name: '',
                  tradeName: '',
                  type: 'PJ',
                  cpfCnpj: '',
                  contactName: '',
                  phone: '',
                  whatsapp: '',
                  email: '',
                  city: 'Feira de Santana',
                  state: 'BA',
                  paymentTerms: '30 dias',
                  status: 'ativo',
                });
                setIsSupplierModalOpen(true);
              }
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors whitespace-nowrap"
          >
            <Plus size={15} />
            <span>Novo {activeTab === 'clientes' ? 'Cliente' : 'Fornecedor'}</span>
          </button>
        </div>
      </div>

      {/* Busca */}
      <div className="shrink-0 bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex justify-between items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder={`Buscar ${activeTab} por nome, código ou documento...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
          />
        </div>

        {activeTab === 'clientes' && (
          <button
            onClick={() => ExcelService.exportCustomers(sortedCustomers, 'Clientes_Cadastrados.xlsx')}
            className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg font-semibold"
          >
            <FileSpreadsheet size={15} className="text-emerald-600" />
            <span>Exportar Clientes (.xlsx)</span>
          </button>
        )}
      </div>

      {/* ABA 1: CLIENTES */}
      {activeTab === 'clientes' && (
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="flex-1 min-h-[300px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                <tr>
                  <SortableTh label="Código" sortKey="code" sortConfig={customerSortConfig} onSort={handleCustomerSort} />
                  <SortableTh label="Cliente / Razão Social" sortKey="name" sortConfig={customerSortConfig} onSort={handleCustomerSort} />
                  <SortableTh label="Tipo" sortKey="type" sortConfig={customerSortConfig} onSort={handleCustomerSort} />
                  <SortableTh label="CPF / CNPJ" sortKey="cpfCnpj" sortConfig={customerSortConfig} onSort={handleCustomerSort} />
                  <SortableTh label="Contatos" sortKey="contact" sortConfig={customerSortConfig} onSort={handleCustomerSort} />
                  <SortableTh label="Cidade / UF" sortKey="cityState" sortConfig={customerSortConfig} onSort={handleCustomerSort} />
                  <SortableTh label="Limite Crédito" sortKey="creditLimit" sortConfig={customerSortConfig} onSort={handleCustomerSort} align="right" />
                  <SortableTh label="Status" sortKey="status" sortConfig={customerSortConfig} onSort={handleCustomerSort} align="center" />
                  <th className="p-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                ) : (
                  sortedCustomers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-mono font-bold text-blue-700">{c.code}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-800">{c.name}</span>
                          {c.showSaleAlert && c.notes?.trim() && (
                            <span
                              title={`Aviso de venda ativo: ${c.notes.trim()}`}
                              className="inline-flex items-center gap-1 text-[10px] bg-orange-50 text-orange-800 font-bold px-1.5 py-0.5 rounded-full border border-orange-300"
                            >
                              <AlertTriangle size={11} className="text-orange-600" />
                              Aviso na venda
                            </span>
                          )}
                        </div>
                        {c.tradeName && <div className="text-[11px] text-slate-400">{c.tradeName}</div>}
                      </td>
                      <td className="p-3 font-bold text-slate-600">{c.type}</td>
                      <td className="p-3 font-mono text-slate-600">{c.cpfCnpj || '—'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <span>{c.phone}</span>
                          {c.whatsapp && (
                            <a
                              href={`https://wa.me/55${c.whatsapp.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-600 hover:text-emerald-700 p-0.5"
                              title="Abrir WhatsApp"
                            >
                              <MessageSquare size={13} />
                            </a>
                          )}
                        </div>
                        {c.email && <div className="text-[10px] text-slate-400">{c.email}</div>}
                      </td>
                      <td className="p-3 text-slate-600">
                        <div className="font-semibold text-slate-800">{c.city ? `${c.city}/${c.state}` : '—'}</div>
                        {(c.neighborhood || c.marketArea) && (
                          <div className="text-[11px] text-slate-500">
                            {c.neighborhood || ''}{c.neighborhood && c.marketArea ? ' • ' : ''}{c.marketArea ? `Praça ${c.marketArea}` : ''}
                          </div>
                        )}
                        {c.deliveryRouteName ? (
                          <div className="text-[10px] text-blue-700 font-bold mt-0.5">
                            Rota: {c.deliveryRouteName}
                          </div>
                        ) : (
                          <div className="text-[10px] text-amber-600 italic mt-0.5">
                            Sem rota vinculada
                          </div>
                        )}
                        {c.sellerName && (
                          <div className="text-[10px] text-slate-500">
                            Vend: {c.sellerName}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900">
                        {formatCurrency(c.creditLimit)}
                        {Boolean(c.creditBalance && c.creditBalance > 0) && (
                          <div className="text-[10px] text-indigo-600 font-bold mt-0.5" title="Saldo de crédito acumulado por devoluções para compras futuras">
                            Crédito: {formatCurrency(c.creditBalance || 0)}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleCustomerStatus(c)}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full cursor-pointer transition-all hover:scale-105 border ${
                            c.status === 'ativo'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                          title={`Clique para ${c.status === 'ativo' ? 'Desativar' : 'Ativar'} este cliente`}
                        >
                          {c.status === 'ativo' ? '● Ativo' : '○ Inativo'}
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleCustomerStatus(c)}
                            className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border ${
                              c.status === 'ativo'
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                            }`}
                            title={c.status === 'ativo' ? 'Desativar Cliente' : 'Ativar Cliente'}
                          >
                            <Power size={13} />
                            <span>{c.status === 'ativo' ? 'Desativar' : 'Ativar'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCustomer(c);
                              setCustForm({ ...c, notes: c.notes || '', showSaleAlert: !!c.showSaleAlert });
                              setIsCustomerModalOpen(true);
                            }}
                            className="p-1.5 hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded-lg border border-slate-200 hover:border-blue-200 cursor-pointer"
                            title="Editar Cliente"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 2: FORNECEDORES */}
      {activeTab === 'fornecedores' && (
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="flex-1 min-h-[300px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                <tr>
                  <SortableTh label="Código" sortKey="code" sortConfig={supplierSortConfig} onSort={handleSupplierSort} />
                  <SortableTh label="Fornecedor / Razão Social" sortKey="name" sortConfig={supplierSortConfig} onSort={handleSupplierSort} />
                  <SortableTh label="Contato" sortKey="contactName" sortConfig={supplierSortConfig} onSort={handleSupplierSort} />
                  <SortableTh label="CNPJ / CPF" sortKey="cpfCnpj" sortConfig={supplierSortConfig} onSort={handleSupplierSort} />
                  <SortableTh label="Telefone / E-mail" sortKey="phoneEmail" sortConfig={supplierSortConfig} onSort={handleSupplierSort} />
                  <SortableTh label="Cidade / UF" sortKey="cityState" sortConfig={supplierSortConfig} onSort={handleSupplierSort} />
                  <SortableTh label="Condições Pagto" sortKey="paymentTerms" sortConfig={supplierSortConfig} onSort={handleSupplierSort} />
                  <SortableTh label="Status" sortKey="status" sortConfig={supplierSortConfig} onSort={handleSupplierSort} align="center" />
                  <th className="p-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      Nenhum fornecedor cadastrado.
                    </td>
                  </tr>
                ) : (
                  sortedSuppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-mono font-bold text-blue-700">{s.code}</td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{s.name}</div>
                        {s.tradeName && <div className="text-[11px] text-slate-400">{s.tradeName}</div>}
                      </td>
                      <td className="p-3 font-medium text-slate-700">{s.contactName || '—'}</td>
                      <td className="p-3 font-mono text-slate-600">{s.cpfCnpj || '—'}</td>
                      <td className="p-3 text-slate-600">
                        <div>{s.phone}</div>
                        {s.email && <div className="text-[10px] text-slate-400">{s.email}</div>}
                      </td>
                      <td className="p-3 text-slate-600">{s.city ? `${s.city}/${s.state}` : '—'}</td>
                      <td className="p-3 font-medium text-slate-800">{s.paymentTerms || '—'}</td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSupplierStatus(s)}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full cursor-pointer transition-all hover:scale-105 border ${
                            s.status === 'ativo'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                          title={`Clique para ${s.status === 'ativo' ? 'Desativar' : 'Ativar'} este fornecedor`}
                        >
                          {s.status === 'ativo' ? '● Ativo' : '○ Inativo'}
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleSupplierStatus(s)}
                            className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border ${
                              s.status === 'ativo'
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                            }`}
                            title={s.status === 'ativo' ? 'Desativar Fornecedor' : 'Ativar Fornecedor'}
                          >
                            <Power size={13} />
                            <span>{s.status === 'ativo' ? 'Desativar' : 'Ativar'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSupplier(s);
                              setSuppForm({ ...s });
                              setIsSupplierModalOpen(true);
                            }}
                            className="p-1.5 hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded-lg border border-slate-200 hover:border-blue-200 cursor-pointer"
                            title="Editar Fornecedor"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Cliente */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveCustomer}
            className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-800">
                {editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button type="button" onClick={() => setIsCustomerModalOpen(false)} className="text-slate-400">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Código *</label>
                <input
                  type="text"
                  required
                  value={custForm.code}
                  onChange={(e) => setCustForm({ ...custForm, code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Nome ou Razão Social *</label>
                <input
                  type="text"
                  required
                  value={custForm.name || ''}
                  onChange={(e) => setCustForm({ ...custForm, name: e.target.value })}
                  placeholder="Ex: Mercado Central Ltda ou João da Silva"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo de Pessoa</label>
                <select
                  value={custForm.type || 'PF'}
                  onChange={(e) => setCustForm({ ...custForm, type: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="PF">Pessoa Física (PF)</option>
                  <option value="PJ">Pessoa Jurídica (PJ)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">CPF ou CNPJ</label>
                <input
                  type="text"
                  value={custForm.cpfCnpj || ''}
                  onChange={(e) => setCustForm({ ...custForm, cpfCnpj: e.target.value })}
                  placeholder="Ex: 000.000.000-00 ou 00.000.000/0001-00"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Telefone Principal</label>
                <input
                  type="text"
                  value={custForm.phone || ''}
                  onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
                  placeholder="Ex: (75) 3622-7890"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">WhatsApp</label>
                <input
                  type="text"
                  value={custForm.whatsapp || ''}
                  onChange={(e) => setCustForm({ ...custForm, whatsapp: e.target.value })}
                  placeholder="Ex: (75) 98765-4321"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">E-mail</label>
                <input
                  type="email"
                  value={custForm.email || ''}
                  onChange={(e) => setCustForm({ ...custForm, email: e.target.value })}
                  placeholder="Ex: contato@cliente.com.br"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Limite de Crédito (R$)</label>
                <input
                  type="number"
                  step="50"
                  min="0"
                  value={custForm.creditLimit !== undefined && custForm.creditLimit !== null ? custForm.creditLimit : ''}
                  onChange={(e) => setCustForm({ ...custForm, creditLimit: e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0) })}
                  placeholder="Ex: 1.000,00"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Rua / Logradouro</label>
                <input
                  type="text"
                  value={custForm.street || ''}
                  onChange={(e) => setCustForm({ ...custForm, street: e.target.value })}
                  placeholder="Ex: Av. Getúlio Vargas"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Número</label>
                <input
                  type="text"
                  value={custForm.number || ''}
                  onChange={(e) => setCustForm({ ...custForm, number: e.target.value })}
                  placeholder="Ex: 1000"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              {/* ESTADO / UF */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-bold text-slate-700">Estado / UF</label>
                  <button
                    type="button"
                    onClick={() => setManualAddressInput((prev) => ({ ...prev, state: !prev.state }))}
                    className="text-[10px] text-blue-600 hover:underline font-semibold"
                  >
                    {manualAddressInput.state ? 'Selecionar da Lista' : 'Digitar Manual'}
                  </button>
                </div>
                {manualAddressInput.state ? (
                  <input
                    type="text"
                    maxLength={2}
                    value={custForm.state || ''}
                    onChange={(e) => setCustForm({ ...custForm, state: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                    placeholder="Ex: SP"
                  />
                ) : (
                  <select
                    value={custForm.state || ''}
                    onChange={(e) => {
                      const newUf = e.target.value;
                      setCustForm({ ...custForm, state: newUf });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-800"
                  >
                    <option value="">Selecione o Estado (UF)...</option>
                    {(dbState.states || []).map((st) => (
                      <option key={st.id} value={st.uf}>
                        {st.uf} - {st.name} ({st.region})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* CIDADE */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-bold text-slate-700">Cidade</label>
                  <button
                    type="button"
                    onClick={() => setManualAddressInput((prev) => ({ ...prev, city: !prev.city }))}
                    className="text-[10px] text-blue-600 hover:underline font-semibold"
                  >
                    {manualAddressInput.city ? 'Selecionar da Lista' : 'Digitar Manual'}
                  </button>
                </div>
                {manualAddressInput.city ? (
                  <input
                    type="text"
                    value={custForm.city || ''}
                    onChange={(e) => setCustForm({ ...custForm, city: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                    placeholder="Ex: Feira de Santana"
                  />
                ) : (
                  <select
                    value={custForm.city || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setCustForm({ ...custForm, city: '' });
                        return;
                      }
                      const foundCity = (dbState.cities || []).find((c) => c.name.toLowerCase() === val.toLowerCase());
                      setCustForm((prev) => ({
                        ...prev,
                        city: val,
                        state: foundCity?.stateUf || prev.state || '',
                        marketArea: prev.marketArea || foundCity?.marketAreaName || '',
                        deliveryRouteId: prev.deliveryRouteId || foundCity?.defaultRouteId || '',
                      }));
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-800"
                  >
                    <option value="">Selecione a Cidade...</option>
                    {(dbState.cities || [])
                      .filter((c) => !custForm.state || c.stateUf === custForm.state)
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                      .map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name} ({c.stateUf}){typeof c.distanceKm === 'number' ? ` • ~${c.distanceKm}km` : ''}{c.marketAreaName ? ` • ${c.marketAreaName}` : ''}
                        </option>
                      ))}
                  </select>
                )}
              </div>

              {/* BAIRRO */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-bold text-slate-700">Bairro</label>
                  <button
                    type="button"
                    onClick={() => setManualAddressInput((prev) => ({ ...prev, neighborhood: !prev.neighborhood }))}
                    className="text-[10px] text-blue-600 hover:underline font-semibold"
                  >
                    {manualAddressInput.neighborhood ? 'Selecionar da Lista' : 'Digitar Manual'}
                  </button>
                </div>
                {manualAddressInput.neighborhood ? (
                  <input
                    type="text"
                    value={custForm.neighborhood || ''}
                    onChange={(e) => setCustForm({ ...custForm, neighborhood: e.target.value })}
                    placeholder="Ex: Kalilândia, Santa Mônica"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                ) : (
                  <select
                    value={custForm.neighborhood || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setCustForm({ ...custForm, neighborhood: '' });
                        return;
                      }
                      const foundNeigh = (dbState.neighborhoods || []).find((n) => n.name.toLowerCase() === val.toLowerCase());
                      setCustForm((prev) => ({
                        ...prev,
                        neighborhood: val,
                        city: prev.city || foundNeigh?.cityName || '',
                        state: prev.state || foundNeigh?.stateUf || '',
                        marketArea: prev.marketArea || foundNeigh?.marketAreaName || '',
                        deliveryRouteId: prev.deliveryRouteId || foundNeigh?.defaultRouteId || '',
                      }));
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-800"
                  >
                    <option value="">Selecione o Bairro...</option>
                    {(dbState.neighborhoods || [])
                      .filter((n) => !custForm.city || n.cityName.toLowerCase() === custForm.city.toLowerCase())
                      .map((n) => (
                        <option key={n.id} value={n.name}>
                          {n.name} ({n.cityName})
                        </option>
                      ))}
                  </select>
                )}
              </div>

              {/* PRAÇA / REGIÃO COMERCIAL */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-bold text-slate-700">Praça / Região Comercial</label>
                  <button
                    type="button"
                    onClick={() => setManualAddressInput((prev) => ({ ...prev, marketArea: !prev.marketArea }))}
                    className="text-[10px] text-blue-600 hover:underline font-semibold"
                  >
                    {manualAddressInput.marketArea ? 'Selecionar da Lista' : 'Digitar Manual'}
                  </button>
                </div>
                {manualAddressInput.marketArea ? (
                  <input
                    type="text"
                    value={custForm.marketArea || ''}
                    onChange={(e) => setCustForm({ ...custForm, marketArea: e.target.value })}
                    placeholder="Ex: Feira de Santana - Sede, Recôncavo Baiano"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                ) : (
                  <select
                    value={custForm.marketArea || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const foundPra = (dbState.marketAreas || []).find((m) => m.name === val);
                      setCustForm((prev) => ({
                        ...prev,
                        marketArea: val,
                        deliveryRouteId: prev.deliveryRouteId || foundPra?.defaultRouteId || '',
                      }));
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-800"
                  >
                    <option value="">Selecione a Praça Comercial...</option>
                    {(dbState.marketAreas || []).map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name} {m.description ? `(${m.description})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vendedor Responsável</label>
                <input
                  type="text"
                  value={custForm.sellerName || ''}
                  onChange={(e) => setCustForm({ ...custForm, sellerName: e.target.value })}
                  placeholder="Ex: Carlos Silva, Bruno Lima"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Rota de Entrega (Expedição)</label>
                <select
                  value={custForm.deliveryRouteId || ''}
                  onChange={(e) => setCustForm({ ...custForm, deliveryRouteId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800"
                >
                  <option value="">Sem rota definida (Não associada)</option>
                  {(dbState.deliveryRoutes || []).map((rot) => (
                    <option key={rot.id} value={rot.id}>
                      [{rot.code}] {rot.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Condição Preferencial</label>
                <input
                  type="text"
                  value={custForm.preferredPaymentMethod}
                  onChange={(e) => setCustForm({ ...custForm, preferredPaymentMethod: e.target.value })}
                  placeholder="Ex: 30 dias, Boleto, Pix"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Situação / Status</label>
                <select
                  value={custForm.status || 'ativo'}
                  onChange={(e) => setCustForm({ ...custForm, status: e.target.value as 'ativo' | 'inativo' })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800"
                >
                  <option value="ativo">● Ativo</option>
                  <option value="inativo">○ Inativo</option>
                </select>
              </div>

              <div className="sm:col-span-3 space-y-2">
                <label className="block font-bold text-slate-700 mb-1">Observação</label>
                <textarea
                  rows={3}
                  value={custForm.notes || ''}
                  placeholder="Ex: Cliente pagou os últimos boletos com 15 dias de atraso. Entregar somente no período da manhã..."
                  onChange={(e) => setCustForm({ ...custForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />

                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    custForm.showSaleAlert
                      ? 'bg-orange-50/90 border-orange-300 text-orange-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/70'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!custForm.showSaleAlert}
                    onChange={(e) => setCustForm({ ...custForm, showSaleAlert: e.target.checked })}
                    className="w-4 h-4 mt-0.5 text-orange-600 rounded-sm accent-orange-600 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <span className="font-bold flex items-center gap-1.5">
                      <AlertTriangle size={14} className={custForm.showSaleAlert ? 'text-orange-600' : 'text-slate-400'} />
                      <span>Exibir aviso durante a venda</span>
                    </span>
                    <p className="text-[11px] text-slate-500 font-normal">
                      Quando marcado e houver texto em Observação, um aviso destacado aparecerá automaticamente no PDV Balcão, Pedido de Venda e Venda Mobile sempre que este cliente for selecionado.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs"
              >
                Salvar Cliente
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Fornecedor */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveSupplier}
            className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-800">
                {editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </h3>
              <button type="button" onClick={() => setIsSupplierModalOpen(false)} className="text-slate-400">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Código *</label>
                <input
                  type="text"
                  required
                  value={suppForm.code}
                  onChange={(e) => setSuppForm({ ...suppForm, code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Razão Social / Nome *</label>
                <input
                  type="text"
                  required
                  value={suppForm.name}
                  onChange={(e) => setSuppForm({ ...suppForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">CNPJ / CPF</label>
                <input
                  type="text"
                  value={suppForm.cpfCnpj}
                  onChange={(e) => setSuppForm({ ...suppForm, cpfCnpj: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome do Contato</label>
                <input
                  type="text"
                  value={suppForm.contactName}
                  onChange={(e) => setSuppForm({ ...suppForm, contactName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Telefone Comercial</label>
                <input
                  type="text"
                  value={suppForm.phone}
                  onChange={(e) => setSuppForm({ ...suppForm, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">E-mail de Compras</label>
                <input
                  type="email"
                  value={suppForm.email}
                  onChange={(e) => setSuppForm({ ...suppForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cidade</label>
                <input
                  type="text"
                  value={suppForm.city}
                  onChange={(e) => setSuppForm({ ...suppForm, city: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Condições de Pagamento</label>
                <input
                  type="text"
                  value={suppForm.paymentTerms}
                  onChange={(e) => setSuppForm({ ...suppForm, paymentTerms: e.target.value })}
                  placeholder="Ex: 28/56 dias"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Situação / Status</label>
                <select
                  value={suppForm.status || 'ativo'}
                  onChange={(e) => setSuppForm({ ...suppForm, status: e.target.value as 'ativo' | 'inativo' })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800"
                >
                  <option value="ativo">● Ativo</option>
                  <option value="inativo">○ Inativo</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block font-bold text-slate-700 mb-1">Observações do Fornecedor</label>
                <textarea
                  rows={2}
                  value={suppForm.notes}
                  onChange={(e) => setSuppForm({ ...suppForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs"
              >
                Salvar Fornecedor
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
