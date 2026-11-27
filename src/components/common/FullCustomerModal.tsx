import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  UserPlus,
  Building2,
  MapPin,
  Truck,
  Phone,
  Mail,
  DollarSign,
  CreditCard,
  X,
  Check,
  FileText,
  AlertCircle,
  Sparkles,
  Info,
  Search,
  Loader2,
} from 'lucide-react';
import { Database } from '../../services/db';
import { Customer } from '../../types';
import { toast } from '../../services/toast';
import {
  buildCnpjFormMerge,
  CnpjFieldConflict,
  findExistingCustomerByCnpj,
  isCompleteCnpjCandidate,
  isValidCnpj,
  lookupCnpj,
  normalizeDocument,
} from '../../services/cnpjLookupService';
import { CnpjFeedbackState, CnpjLookupBanner } from './CnpjLookupBanner';

interface FullCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerCreated: (customer: Customer) => void;
  initialName?: string;
}

export const FullCustomerModal: React.FC<FullCustomerModalProps> = ({
  isOpen,
  onClose,
  onCustomerCreated,
  initialName = '',
}) => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  const [activeTab, setActiveTab] = useState<'dados_gerais' | 'endereco_romaneio' | 'comercial'>('dados_gerais');

  // Controle de alternância entre seleção de lista ou digitação manual
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
    name: initialName,
    tradeName: '',
    type: 'PF',
    cpfCnpj: '',
    phone: '',
    whatsapp: '',
    email: '',
    zipCode: '',
    street: '',
    number: '',
    complement: '',
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
    cadastralStatus: '',
    mainCnae: '',
    notes: '',
    showSaleAlert: false,
  });

  // Estado da consulta automática de CNPJ
  const [cnpjFeedback, setCnpjFeedback] = useState<CnpjFeedbackState>({ status: 'idle' });
  const [cnpjConflicts, setCnpjConflicts] = useState<CnpjFieldConflict[]>([]);
  const [pendingOverwriteUpdates, setPendingOverwriteUpdates] = useState<Partial<Customer>>({});
  const [pendingOverwriteManualFlags, setPendingOverwriteManualFlags] = useState<
    Partial<{ state: boolean; city: boolean; neighborhood: boolean }>
  >({});
  const userEditedFieldsRef = useRef<Set<string>>(new Set());
  const lastAutoConsultedCnpjRef = useRef<string>('');
  const cnpjAbortRef = useRef<AbortController | null>(null);
  const autoLookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const custFormRef = useRef(custForm);
  custFormRef.current = custForm;

  const markFieldAsUserEdited = useCallback((field: string, value: unknown) => {
    const text = String(value ?? '').trim();
    if (text.length > 0) {
      userEditedFieldsRef.current.add(field);
    } else {
      userEditedFieldsRef.current.delete(field);
    }
  }, []);

  const updateCustField = useCallback(
    <K extends keyof Customer>(key: K, value: Customer[K]) => {
      markFieldAsUserEdited(String(key), value);
      setCustForm((prev) => ({ ...prev, [key]: value }));
    },
    [markFieldAsUserEdited]
  );

  // Atualizar código e nome inicial ao abrir com campos limpos
  useEffect(() => {
    if (isOpen) {
      if (autoLookupTimerRef.current) {
        clearTimeout(autoLookupTimerRef.current);
        autoLookupTimerRef.current = null;
      }
      if (cnpjAbortRef.current) {
        cnpjAbortRef.current.abort();
        cnpjAbortRef.current = null;
      }
      setCnpjFeedback({ status: 'idle' });
      setCnpjConflicts([]);
      setPendingOverwriteUpdates({});
      setPendingOverwriteManualFlags({});
      lastAutoConsultedCnpjRef.current = '';
      const initialEdited = new Set<string>();
      if (initialName?.trim()) {
        initialEdited.add('name');
      }
      userEditedFieldsRef.current = initialEdited;
      setManualAddressInput({
        state: false,
        city: false,
        neighborhood: false,
        marketArea: false,
      });

      const nextCode = 'CLI-' + String(Database.getState().customers.length + 1).padStart(4, '0');
      setCustForm({
        code: nextCode,
        name: initialName || '',
        tradeName: '',
        type: 'PF',
        cpfCnpj: '',
        phone: '',
        whatsapp: '',
        email: '',
        zipCode: '',
        street: '',
        number: '',
        complement: '',
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
        cadastralStatus: '',
        mainCnae: '',
        notes: '',
        showSaleAlert: false,
      });
      setActiveTab('dados_gerais');
    } else if (cnpjAbortRef.current) {
      cnpjAbortRef.current.abort();
      cnpjAbortRef.current = null;
    }
  }, [isOpen, initialName]);

  const duplicateCnpjCustomer = useMemo(
    () => findExistingCustomerByCnpj(dbState.customers, custForm.cpfCnpj),
    [dbState.customers, custForm.cpfCnpj]
  );

  const handleConsultCnpj = useCallback(
    async (rawOverride?: string, options?: { isAuto?: boolean; forceRefresh?: boolean }) => {
      const rawValue = rawOverride ?? custFormRef.current.cpfCnpj ?? '';
      const clean = normalizeDocument(rawValue);

      if (!isCompleteCnpjCandidate(clean)) {
        if (!options?.isAuto) {
          setCnpjFeedback({
            status: 'error',
            message: 'Informe os 14 caracteres do CNPJ antes de realizar a consulta.',
          });
        }
        return;
      }

      if (!isValidCnpj(clean)) {
        if (!options?.isAuto) {
          setCnpjFeedback({
            status: 'error',
            message: 'CNPJ inválido. Verifique os dígitos informados (suporta formato numérico e alfanumérico).',
          });
        }
        return;
      }

      if (cnpjAbortRef.current) {
        cnpjAbortRef.current.abort();
      }
      const controller = new AbortController();
      cnpjAbortRef.current = controller;
      lastAutoConsultedCnpjRef.current = clean;

      setCnpjFeedback({ status: 'loading' });
      setCnpjConflicts([]);
      setPendingOverwriteUpdates({});
      setPendingOverwriteManualFlags({});

      const result = await lookupCnpj(clean, {
        signal: controller.signal,
        forceRefresh: options?.forceRefresh,
      });

      if (controller.signal.aborted) return;

      if (!result.ok) {
        if (result.code === 'ABORTED') return;
        setCnpjFeedback({
          status: 'error',
          message: result.message,
        });
        if (!options?.isAuto) {
          toast.warning(result.message, 'Consulta de CNPJ');
        }
        return;
      }

      const latestState = Database.getState();
      const merge = buildCnpjFormMerge(
        custFormRef.current,
        result.data,
        userEditedFieldsRef.current,
        {
          states: latestState.states,
          cities: latestState.cities,
          neighborhoods: latestState.neighborhoods,
        }
      );

      setCustForm((prev) => ({
        ...prev,
        ...merge.safeUpdates,
      }));

      setManualAddressInput((prev) => ({
        ...prev,
        state: merge.safeUpdates.state && merge.manualAddressFlags.state ? true : prev.state,
        city: merge.safeUpdates.city && merge.manualAddressFlags.city ? true : prev.city,
        neighborhood:
          merge.safeUpdates.neighborhood && merge.manualAddressFlags.neighborhood
            ? true
            : prev.neighborhood,
      }));

      if (merge.conflicts.length > 0) {
        setCnpjConflicts(merge.conflicts);
        setPendingOverwriteUpdates(merge.overwriteUpdates);
        setPendingOverwriteManualFlags(merge.manualAddressFlags);
      }

      const msg =
        merge.filledLabels.length > 0
          ? `Dados do CNPJ encontrados e ${merge.filledLabels.length} campo(s) preenchido(s) automaticamente.`
          : merge.conflicts.length > 0
          ? 'Dados do CNPJ encontrados. Os campos já preenchidos manualmente foram preservados.'
          : 'Dados do CNPJ conferidos com sucesso.';

      setCnpjFeedback({
        status: 'success',
        message: msg,
        data: result.data,
        filledCount: merge.filledLabels.length,
        filledAddressCount: merge.filledAddressCount,
      });

      toast.success(msg, 'CNPJ Consultado');
    },
    []
  );

  const handleApplyCnpjOverwrite = useCallback(() => {
    if (Object.keys(pendingOverwriteUpdates).length === 0) return;
    setCustForm((prev) => ({
      ...prev,
      ...pendingOverwriteUpdates,
    }));
    setManualAddressInput((prev) => ({
      ...prev,
      state:
        pendingOverwriteUpdates.state && pendingOverwriteManualFlags.state ? true : prev.state,
      city: pendingOverwriteUpdates.city && pendingOverwriteManualFlags.city ? true : prev.city,
      neighborhood:
        pendingOverwriteUpdates.neighborhood && pendingOverwriteManualFlags.neighborhood
          ? true
          : prev.neighborhood,
    }));
    setCnpjConflicts([]);
    setPendingOverwriteUpdates({});
    setPendingOverwriteManualFlags({});
    toast.success('Campos atualizados com os dados da Receita Federal.', 'Dados Aplicados');
  }, [pendingOverwriteUpdates, pendingOverwriteManualFlags]);

  const handleKeepManualCnpjFields = useCallback(() => {
    setCnpjConflicts([]);
    setPendingOverwriteUpdates({});
    setPendingOverwriteManualFlags({});
  }, []);

  // Consulta automática ao completar CNPJ válido de 14 caracteres (com debounce e sem duplicidade)
  useEffect(() => {
    if (!isOpen) return;

    if (autoLookupTimerRef.current) {
      clearTimeout(autoLookupTimerRef.current);
      autoLookupTimerRef.current = null;
    }

    const clean = normalizeDocument(custForm.cpfCnpj);
    if (!isCompleteCnpjCandidate(clean)) return;
    if (!isValidCnpj(clean)) return;
    if (clean === lastAutoConsultedCnpjRef.current) return;
    if (duplicateCnpjCustomer) return;

    autoLookupTimerRef.current = setTimeout(() => {
      handleConsultCnpj(clean, { isAuto: true });
    }, 450);

    return () => {
      if (autoLookupTimerRef.current) {
        clearTimeout(autoLookupTimerRef.current);
        autoLookupTimerRef.current = null;
      }
    };
  }, [custForm.cpfCnpj, isOpen, duplicateCnpjCustomer, handleConsultCnpj]);

  if (!isOpen) return null;

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();

    if (!custForm.name?.trim()) {
      toast.warning('Informe o Nome ou Razão Social do cliente.', 'Nome Obrigatório');
      setActiveTab('dados_gerais');
      return;
    }

    if (!custForm.code?.trim()) {
      toast.warning('Informe o Código do cliente.', 'Código Obrigatório');
      setActiveTab('dados_gerais');
      return;
    }

    const state = Database.getState();

    // Evita criar cadastro duplicado para o mesmo CNPJ
    const existingByCnpj = findExistingCustomerByCnpj(state.customers, custForm.cpfCnpj);
    if (existingByCnpj) {
      toast.error(
        `Já existe um cliente cadastrado com este CNPJ: ${existingByCnpj.name} (${existingByCnpj.code}). Use o botão "Usar este cliente" ou selecione-o no pedido.`,
        'CNPJ Duplicado'
      );
      setActiveTab('dados_gerais');
      return;
    }

    const routeObj = state.deliveryRoutes?.find((r) => r.id === custForm.deliveryRouteId);
    const deliveryRouteName = routeObj ? routeObj.name : custForm.deliveryRouteName;

    const newCust: Customer = {
      id: 'CLI-' + Date.now(),
      companyId: currentCompany.id,
      code: custForm.code!.trim(),
      name: custForm.name!.trim(),
      tradeName: custForm.tradeName?.trim() || custForm.name!.trim(),
      type: custForm.type || 'PF',
      cpfCnpj: custForm.cpfCnpj?.trim() || '',
      phone: custForm.phone?.trim() || '',
      whatsapp: custForm.whatsapp?.trim() || '',
      email: custForm.email?.trim() || '',
      zipCode: custForm.zipCode?.trim(),
      street: custForm.street?.trim() || '',
      number: custForm.number?.trim() || '',
      complement: custForm.complement?.trim() || '',
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
      cadastralStatus: custForm.cadastralStatus?.trim() || '',
      mainCnae: custForm.mainCnae?.trim() || '',
      notes: custForm.notes?.trim() || '',
      showSaleAlert: !!custForm.showSaleAlert,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    state.customers.unshift(newCust);
    Database.persist();
    Database.addAuditLog('CRIAR_CLIENTE', 'CRM', newCust.id, `Cliente ${newCust.name} cadastrado completo para vendas e romaneio`);

    toast.success(`Cliente "${newCust.name}" cadastrado com sucesso e selecionado no pedido!`, 'Cliente Cadastrado');

    onCustomerCreated(newCust);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <form
        onSubmit={handleSaveCustomer}
        className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto flex flex-col justify-between"
      >
        <div>
          {/* Cabeçalho do Modal */}
          <div className="flex justify-between items-start pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl">
                <UserPlus size={22} />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                  <span>Cadastro Completo de Cliente</span>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                    Obrigatório p/ Romaneio & Venda
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Preencha os dados cadastrais, endereço de entrega e rota de expedição para faturamento e emissão do romaneio.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Abas Internas de Navegação */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold mt-3 mb-4">
            <button
              type="button"
              onClick={() => setActiveTab('dados_gerais')}
              className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'dados_gerais'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 size={14} />
              <span>1. Identificação & Contato</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('endereco_romaneio')}
              className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'endereco_romaneio'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck size={14} className="text-emerald-600" />
              <span>2. Endereço & Rota (Romaneio)</span>
              {Boolean(cnpjFeedback.filledAddressCount && cnpjFeedback.filledAddressCount > 0) && (
                <span className="ml-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  CNPJ
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('comercial')}
              className={`flex-1 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'comercial'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <DollarSign size={14} />
              <span>3. Financeiro & Vendedor</span>
            </button>
          </div>

          {/* ABA 1: IDENTIFICAÇÃO E CONTATO */}
          {activeTab === 'dados_gerais' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs animate-in fade-in">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Código do Cliente *</label>
                <input
                  type="text"
                  required
                  value={custForm.code}
                  onChange={(e) => setCustForm({ ...custForm, code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-blue-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  {custForm.type === 'PJ' ? 'CNPJ (Consulta Automática)' : 'CPF ou CNPJ'}
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Ex: 000.000.000-00 ou 00.000.000/0001-00"
                    value={custForm.cpfCnpj}
                    onChange={(e) => {
                      const val = e.target.value;
                      const clean = normalizeDocument(val);
                      setCustForm((prev) => ({
                        ...prev,
                        cpfCnpj: val,
                        type: clean.length === 14 ? 'PJ' : prev.type,
                      }));
                      if (cnpjFeedback.status !== 'idle') {
                        setCnpjFeedback({ status: 'idle' });
                      }
                    }}
                    className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => handleConsultCnpj(custForm.cpfCnpj, { forceRefresh: false })}
                    disabled={cnpjFeedback.status === 'loading' || !isCompleteCnpjCandidate(custForm.cpfCnpj)}
                    title="Consultar dados cadastrais pelo CNPJ"
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {cnpjFeedback.status === 'loading' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Search size={14} />
                    )}
                    <span>Consultar CNPJ</span>
                  </button>
                </div>
              </div>

              {/* Banner de status da consulta de CNPJ, duplicidade e confirmação de sobrescrita */}
              {(duplicateCnpjCustomer || cnpjFeedback.status !== 'idle' || cnpjConflicts.length > 0) && (
                <div className="sm:col-span-3">
                  <CnpjLookupBanner
                    feedback={cnpjFeedback}
                    conflicts={cnpjConflicts}
                    duplicateCustomer={duplicateCnpjCustomer}
                    onApplyOverwrite={handleApplyCnpjOverwrite}
                    onKeepManual={handleKeepManualCnpjFields}
                    onSelectDuplicateCustomer={(existing) => {
                      onCustomerCreated(existing);
                      toast.info(`Cliente existente "${existing.name}" selecionado no pedido.`, 'Cliente Selecionado');
                      onClose();
                    }}
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo de Pessoa *</label>
                <select
                  value={custForm.type}
                  onChange={(e) => setCustForm({ ...custForm, type: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                >
                  <option value="PF">Pessoa Física (PF)</option>
                  <option value="PJ">Pessoa Jurídica (PJ)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  {custForm.type === 'PJ' ? 'Razão Social *' : 'Nome Completo *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Comercial Alvorada Ltda ou João da Silva"
                  value={custForm.name}
                  onChange={(e) => updateCustField('name', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block font-bold text-slate-700 mb-1">Nome Fantasia</label>
                <input
                  type="text"
                  placeholder="Ex: Mercado Alvorada"
                  value={custForm.tradeName}
                  onChange={(e) => updateCustField('tradeName', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Telefone Fixo</label>
                <input
                  type="text"
                  placeholder="Ex: (75) 3622-1000"
                  value={custForm.phone}
                  onChange={(e) => updateCustField('phone', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">WhatsApp (Celular)</label>
                <input
                  type="text"
                  placeholder="Ex: (75) 98765-4321"
                  value={custForm.whatsapp}
                  onChange={(e) => setCustForm({ ...custForm, whatsapp: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-emerald-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">E-mail</label>
                <input
                  type="email"
                  placeholder="Ex: cliente@empresa.com.br"
                  value={custForm.email}
                  onChange={(e) => updateCustField('email', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              {(custForm.type === 'PJ' || custForm.cadastralStatus || custForm.mainCnae) && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Situação Cadastral (Receita)</label>
                    <input
                      type="text"
                      placeholder="Ex: ATIVA"
                      value={custForm.cadastralStatus || ''}
                      onChange={(e) => updateCustField('cadastralStatus', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg font-bold ${
                        custForm.cadastralStatus?.toUpperCase() === 'ATIVA'
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                          : custForm.cadastralStatus
                          ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">CNAE Principal</label>
                    <input
                      type="text"
                      placeholder="Ex: 4744-0/99 - Comércio varejista de materiais de construção"
                      value={custForm.mainCnae || ''}
                      onChange={(e) => updateCustField('mainCnae', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ABA 2: ENDEREÇO COMPLETO & LOGÍSTICA PARA ROMANEIO DE ENTREGA */}
          {activeTab === 'endereco_romaneio' && (
            <div className="space-y-3.5 text-xs animate-in fade-in">
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-950">
                <Truck size={18} className="text-emerald-700 shrink-0" />
                <p className="text-[11px] leading-tight">
                  <strong>Essencial para Expedição:</strong> O endereço e a rota preenchidos aqui alimentam automaticamente a roteirização do <strong>Romaneio de Entrega</strong> e guias de transporte.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-3">
                  <label className="block font-bold text-slate-700 mb-1">CEP</label>
                  <input
                    type="text"
                    placeholder="Ex: 44000-000"
                    value={custForm.zipCode || ''}
                    onChange={(e) => updateCustField('zipCode', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                  />
                </div>

                <div className="sm:col-span-7">
                  <label className="block font-bold text-slate-700 mb-1">Logradouro / Rua / Avenida</label>
                  <input
                    type="text"
                    placeholder="Ex: Av. Getúlio Vargas, Rua Conselheiro Franco"
                    value={custForm.street || ''}
                    onChange={(e) => updateCustField('street', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Número</label>
                  <input
                    type="text"
                    placeholder="Ex: 1000"
                    value={custForm.number || ''}
                    onChange={(e) => updateCustField('number', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block font-bold text-slate-700 mb-1">Complemento / Doca</label>
                  <input
                    type="text"
                    placeholder="Ex: Bloco B, Doca 2, Galpão 4"
                    value={custForm.complement || ''}
                    onChange={(e) => updateCustField('complement', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                {/* ESTADO / UF */}
                <div className="sm:col-span-3">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block font-bold text-slate-700">Estado / UF</label>
                    <button
                      type="button"
                      onClick={() => setManualAddressInput((prev) => ({ ...prev, state: !prev.state }))}
                      className="text-[10px] text-blue-600 hover:underline"
                    >
                      {manualAddressInput.state ? 'Lista' : 'Manual'}
                    </button>
                  </div>
                  {manualAddressInput.state ? (
                    <input
                      type="text"
                      maxLength={2}
                      value={custForm.state || ''}
                      onChange={(e) => updateCustField('state', e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                      placeholder="Ex: SP"
                    />
                  ) : (
                    <select
                      value={custForm.state || ''}
                      onChange={(e) => updateCustField('state', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-800"
                    >
                      <option value="">Selecione UF...</option>
                      {(dbState.states || []).map((st) => (
                        <option key={st.id} value={st.uf}>
                          {st.uf} - {st.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* CIDADE */}
                <div className="sm:col-span-5">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block font-bold text-slate-700">Cidade</label>
                    <button
                      type="button"
                      onClick={() => setManualAddressInput((prev) => ({ ...prev, city: !prev.city }))}
                      className="text-[10px] text-blue-600 hover:underline"
                    >
                      {manualAddressInput.city ? 'Lista' : 'Manual'}
                    </button>
                  </div>
                  {manualAddressInput.city ? (
                    <input
                      type="text"
                      value={custForm.city || ''}
                      onChange={(e) => updateCustField('city', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                      placeholder="Ex: Feira de Santana"
                    />
                  ) : (
                    <select
                      value={custForm.city || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        markFieldAsUserEdited('city', val);
                        const foundCity = (dbState.cities || []).find((c) => c.name.toLowerCase() === val.toLowerCase());
                        setCustForm((prev) => ({
                          ...prev,
                          city: val,
                          state: foundCity?.stateUf || prev.state || '',
                          marketArea: prev.marketArea || foundCity?.marketAreaName || '',
                          deliveryRouteId: prev.deliveryRouteId || foundCity?.defaultRouteId || '',
                        }));
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-800"
                    >
                      <option value="">Selecione a Cidade...</option>
                      {(dbState.cities || [])
                        .filter((c) => !custForm.state || c.stateUf === custForm.state)
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                        .map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name} ({c.stateUf}){typeof c.distanceKm === 'number' ? ` • ~${c.distanceKm}km` : ''}
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                {/* BAIRRO */}
                <div className="sm:col-span-4">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block font-bold text-slate-700">Bairro</label>
                    <button
                      type="button"
                      onClick={() => setManualAddressInput((prev) => ({ ...prev, neighborhood: !prev.neighborhood }))}
                      className="text-[10px] text-blue-600 hover:underline"
                    >
                      {manualAddressInput.neighborhood ? 'Lista' : 'Manual'}
                    </button>
                  </div>
                  {manualAddressInput.neighborhood ? (
                    <input
                      type="text"
                      value={custForm.neighborhood || ''}
                      onChange={(e) => updateCustField('neighborhood', e.target.value)}
                      placeholder="Ex: Kalilândia, Centro"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  ) : (
                    <select
                      value={custForm.neighborhood || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateCustField('neighborhood', val);
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-800"
                    >
                      <option value="">Selecione o Bairro...</option>
                      {(dbState.neighborhoods || [])
                        .filter((n) => !custForm.city || n.cityName.toLowerCase() === (custForm.city || '').toLowerCase())
                        .map((n) => (
                          <option key={n.id} value={n.name}>
                            {n.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                {/* PRAÇA / REGIÃO COMERCIAL */}
                <div className="sm:col-span-4">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block font-bold text-slate-700">Praça Comercial</label>
                    <button
                      type="button"
                      onClick={() => setManualAddressInput((prev) => ({ ...prev, marketArea: !prev.marketArea }))}
                      className="text-[10px] text-blue-600 hover:underline"
                    >
                      {manualAddressInput.marketArea ? 'Lista' : 'Manual'}
                    </button>
                  </div>
                  {manualAddressInput.marketArea ? (
                    <input
                      type="text"
                      value={custForm.marketArea || ''}
                      onChange={(e) => setCustForm({ ...custForm, marketArea: e.target.value })}
                      placeholder="Ex: Feira de Santana - Sede, Recôncavo"
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
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-800"
                    >
                      <option value="">Selecione a Praça...</option>
                      {(dbState.marketAreas || []).map((m) => (
                        <option key={m.id} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* ROTA DE ENTREGA (ROMANEIO) */}
                <div className="sm:col-span-4">
                  <label className="block font-bold text-emerald-900 mb-1 flex items-center gap-1">
                    <Truck size={13} className="text-emerald-600" />
                    <span>Rota de Entrega (Romaneio)</span>
                  </label>
                  <select
                    value={custForm.deliveryRouteId || ''}
                    onChange={(e) => {
                      const routeId = e.target.value;
                      const route = (dbState.deliveryRoutes || []).find((r) => r.id === routeId);
                      setCustForm((prev) => ({
                        ...prev,
                        deliveryRouteId: routeId,
                        deliveryRouteName: route?.name || '',
                      }));
                    }}
                    className="w-full px-3 py-2 bg-emerald-50/60 border border-emerald-300 rounded-lg font-bold text-emerald-950 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Sem rota definida (Avulsa)</option>
                    {(dbState.deliveryRoutes || []).map((rot) => (
                      <option key={rot.id} value={rot.id}>
                        [{rot.code}] {rot.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: FINANCEIRO & VENDEDOR */}
          {activeTab === 'comercial' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs animate-in fade-in">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Vendedor Responsável</label>
                <input
                  type="text"
                  placeholder="Ex: Carlos Oliveira"
                  value={custForm.sellerName || ''}
                  onChange={(e) => setCustForm({ ...custForm, sellerName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Limite de Crédito Disponível (R$)</label>
                <input
                  type="number"
                  step="50"
                  min="0"
                  placeholder="Ex: 1.000,00"
                  value={custForm.creditLimit !== undefined && custForm.creditLimit !== null ? custForm.creditLimit : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustForm({ ...custForm, creditLimit: val === '' ? undefined : parseFloat(val) || 0 });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-blue-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Condição de Pagamento Preferencial</label>
                <input
                  type="text"
                  placeholder="Ex: 30 dias, Boleto 14/28, Pix"
                  value={custForm.preferredPaymentMethod}
                  onChange={(e) => setCustForm({ ...custForm, preferredPaymentMethod: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Status Cadastral</label>
                <select
                  value={custForm.status}
                  onChange={(e) => setCustForm({ ...custForm, status: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                >
                  <option value="ativo">Ativo (Habilitado para Compras)</option>
                  <option value="inativo">Inativo / Bloqueado</option>
                </select>
              </div>

              <div className="sm:col-span-2 space-y-2">
                <label className="block font-bold text-slate-700 mb-1">Observação</label>
                <textarea
                  rows={3}
                  placeholder="Ex: Cliente pagou os últimos boletos com 15 dias de atraso. Horário para descarga das 08h às 11h..."
                  value={custForm.notes || ''}
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
                    <span className="font-bold block">Exibir aviso durante a venda</span>
                    <p className="text-[11px] text-slate-500 font-normal">
                      Quando marcado e houver texto em Observação, um aviso destacado aparecerá automaticamente nas telas de venda ao selecionar este cliente.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Navegação e Gravação */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-slate-100 mt-2">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Info size={14} className="text-blue-600" />
            <span>O cliente será salvo no cadastro central e selecionado de imediato no pedido.</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Check size={16} />
              <span>Salvar e Selecionar no Pedido</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
