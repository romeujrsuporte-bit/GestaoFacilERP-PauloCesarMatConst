import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { CheckCircle2, Loader2, Search, UserPlus, X } from 'lucide-react';
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
import { CnpjFeedbackState, CnpjLookupBanner } from '../common/CnpjLookupBanner';

interface PosQuickCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerSelected: (customer: Customer) => void;
  currentUserName: string;
}

export const PosQuickCustomerModal: React.FC<PosQuickCustomerModalProps> = ({
  isOpen,
  onClose,
  onCustomerSelected,
  currentUserName,
}) => {
  const [customers, setCustomers] = useState<Customer[]>(Database.getState().customers);

  useEffect(() => {
    return Database.subscribe(() => {
      setCustomers([...Database.getState().customers]);
    });
  }, []);

  const [form, setForm] = useState<Partial<Customer>>({
    type: 'PF',
    name: '',
    tradeName: '',
    cpfCnpj: '',
    phone: '',
    email: '',
    zipCode: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    creditLimit: undefined,
    cadastralStatus: '',
    mainCnae: '',
  });
  const [creditLimitInput, setCreditLimitInput] = useState('');

  const [cnpjFeedback, setCnpjFeedback] = useState<CnpjFeedbackState>({ status: 'idle' });
  const [cnpjConflicts, setCnpjConflicts] = useState<CnpjFieldConflict[]>([]);
  const [pendingOverwriteUpdates, setPendingOverwriteUpdates] = useState<Partial<Customer>>({});
  const userEditedFieldsRef = useRef<Set<string>>(new Set());
  const lastAutoConsultedCnpjRef = useRef<string>('');
  const cnpjAbortRef = useRef<AbortController | null>(null);
  const autoLookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);
  formRef.current = form;

  const updateField = useCallback(<K extends keyof Customer>(key: K, value: Customer[K]) => {
    const text = String(value ?? '').trim();
    if (text.length > 0) {
      userEditedFieldsRef.current.add(String(key));
    } else {
      userEditedFieldsRef.current.delete(String(key));
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

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
      setForm({
        type: 'PF',
        name: '',
        tradeName: '',
        cpfCnpj: '',
        phone: '',
        email: '',
        zipCode: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        creditLimit: undefined,
        cadastralStatus: '',
        mainCnae: '',
      });
      setCreditLimitInput('');
      setCnpjFeedback({ status: 'idle' });
      setCnpjConflicts([]);
      setPendingOverwriteUpdates({});
      userEditedFieldsRef.current = new Set();
      lastAutoConsultedCnpjRef.current = '';
    } else if (cnpjAbortRef.current) {
      cnpjAbortRef.current.abort();
      cnpjAbortRef.current = null;
    }
  }, [isOpen]);

  const duplicateCnpjCustomer = useMemo(
    () => findExistingCustomerByCnpj(customers, form.cpfCnpj),
    [customers, form.cpfCnpj]
  );

  const handleConsultCnpj = useCallback(
    async (rawOverride?: string, options?: { isAuto?: boolean; forceRefresh?: boolean }) => {
      const rawValue = rawOverride ?? formRef.current.cpfCnpj ?? '';
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

      const result = await lookupCnpj(clean, {
        signal: controller.signal,
        forceRefresh: options?.forceRefresh,
      });

      if (controller.signal.aborted) return;

      if (!result.ok) {
        if (result.code === 'ABORTED') return;
        setCnpjFeedback({ status: 'error', message: result.message });
        if (!options?.isAuto) {
          toast.warning(result.message, 'Consulta de CNPJ');
        }
        return;
      }

      const merge = buildCnpjFormMerge(
        formRef.current,
        result.data,
        userEditedFieldsRef.current
      );

      setForm((prev) => ({
        ...prev,
        ...merge.safeUpdates,
      }));

      if (merge.conflicts.length > 0) {
        setCnpjConflicts(merge.conflicts);
        setPendingOverwriteUpdates(merge.overwriteUpdates);
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

  const handleApplyOverwrite = useCallback(() => {
    if (Object.keys(pendingOverwriteUpdates).length === 0) return;
    setForm((prev) => ({ ...prev, ...pendingOverwriteUpdates }));
    setCnpjConflicts([]);
    setPendingOverwriteUpdates({});
    toast.success('Campos atualizados com os dados da Receita Federal.', 'Dados Aplicados');
  }, [pendingOverwriteUpdates]);

  const handleKeepManual = useCallback(() => {
    setCnpjConflicts([]);
    setPendingOverwriteUpdates({});
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (autoLookupTimerRef.current) {
      clearTimeout(autoLookupTimerRef.current);
      autoLookupTimerRef.current = null;
    }

    const clean = normalizeDocument(form.cpfCnpj);
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
  }, [form.cpfCnpj, isOpen, duplicateCnpjCustomer, handleConsultCnpj]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) {
      toast.warning('Informe obrigatoriamente o Nome ou Razão Social do Cliente.', 'Nome Obrigatório');
      return;
    }

    const state = Database.getState();

    // Impede cadastro duplicado para o mesmo CNPJ
    const existingByCnpj = findExistingCustomerByCnpj(state.customers, form.cpfCnpj);
    if (existingByCnpj) {
      toast.error(
        `Já existe um cliente cadastrado com este CNPJ: ${existingByCnpj.name} (${existingByCnpj.code}). Clique em "Usar este cliente" para selecioná-lo.`,
        'CNPJ Duplicado'
      );
      return;
    }

    const nextNum = state.customers.length + 1;
    const autoCode = `CLI-${String(nextNum).padStart(4, '0')}`;

    const newCust: Customer = {
      id: 'CLI-' + Date.now(),
      code: autoCode,
      name: form.name.trim(),
      tradeName: form.tradeName?.trim() || '',
      type: form.type || 'PF',
      cpfCnpj: form.cpfCnpj?.trim() || '',
      phone: form.phone?.trim() || '',
      email: form.email?.trim() || undefined,
      zipCode: form.zipCode?.trim() || '',
      street: form.street?.trim() || '',
      number: form.number?.trim() || '',
      complement: form.complement?.trim() || '',
      neighborhood: form.neighborhood?.trim() || '',
      city: form.city?.trim() || '',
      state: form.state?.trim() || '',
      creditLimit: parseFloat(creditLimitInput) || 0,
      status: 'ativo',
      cadastralStatus: form.cadastralStatus?.trim() || '',
      mainCnae: form.mainCnae?.trim() || '',
      notes: 'Cadastrado no balcão do PDV',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    state.customers.unshift(newCust);
    Database.persist();

    Database.addAuditLog(
      'CRIAR_CLIENTE_PDV',
      'PDV',
      newCust.id,
      `Cliente ${newCust.name} (${newCust.code}) cadastrado no PDV Balcão por ${currentUserName}`
    );

    onCustomerSelected(newCust);
    toast.success(`Cliente "${newCust.name}" cadastrado e selecionado com sucesso no PDV!`, 'Cliente Cadastrado');
    onClose();
  };

  const showExtendedPjFields =
    form.type === 'PJ' ||
    Boolean(
      form.tradeName ||
        form.zipCode ||
        form.street ||
        form.neighborhood ||
        form.cadastralStatus ||
        form.mainCnae
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl p-5 space-y-4 max-h-[92vh] flex flex-col">
        <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <UserPlus size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">Novo Cliente no Balcão</h3>
              <p className="text-[11px] text-slate-500">Cadastre e vincule imediatamente à venda em andamento</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 flex-1 overflow-y-auto pr-1">
          {/* Tipo de Pessoa */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Tipo de Cliente</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, type: 'PF' }))}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  form.type === 'PF'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Pessoa Física (CPF)
              </button>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, type: 'PJ' }))}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  form.type === 'PJ'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Pessoa Jurídica (CNPJ)
              </button>
            </div>
          </div>

          {/* CPF / CNPJ com Consulta Automática */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {form.type === 'PF' ? 'CPF ou CNPJ' : 'CNPJ (Consulta Automática)'}
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder={form.type === 'PF' ? 'Ex: 000.000.000-00 ou CNPJ' : 'Ex: 00.000.000/0001-00'}
                value={form.cpfCnpj || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const clean = normalizeDocument(val);
                  setForm((prev) => ({
                    ...prev,
                    cpfCnpj: val,
                    type: clean.length === 14 ? 'PJ' : prev.type,
                  }));
                  if (cnpjFeedback.status !== 'idle') {
                    setCnpjFeedback({ status: 'idle' });
                  }
                }}
                className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => handleConsultCnpj(form.cpfCnpj, { forceRefresh: false })}
                disabled={cnpjFeedback.status === 'loading' || !isCompleteCnpjCandidate(form.cpfCnpj)}
                title="Consultar dados cadastrais pelo CNPJ"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
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

          {/* Feedback da Consulta / Duplicidade / Sobrescrita */}
          <CnpjLookupBanner
            feedback={cnpjFeedback}
            conflicts={cnpjConflicts}
            duplicateCustomer={duplicateCnpjCustomer}
            onApplyOverwrite={handleApplyOverwrite}
            onKeepManual={handleKeepManual}
            onSelectDuplicateCustomer={(existing) => {
              onCustomerSelected(existing);
              toast.info(`Cliente existente "${existing.name}" selecionado no PDV.`, 'Cliente Selecionado');
              onClose();
            }}
            compact
          />

          {/* Nome / Razão Social */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              {form.type === 'PJ' ? 'Razão Social' : 'Nome Completo / Razão Social'}{' '}
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder={form.type === 'PF' ? 'Ex: João da Silva Sauro' : 'Ex: GestãoFácil Comércio e Serviços Ltda'}
              value={form.name || ''}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
          </div>

          {showExtendedPjFields && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome Fantasia</label>
              <input
                type="text"
                placeholder="Ex: Mercado Central"
                value={form.tradeName || ''}
                onChange={(e) => updateField('tradeName', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          {/* Telefone e E-mail */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
              <input
                type="text"
                placeholder="Ex: (00) 00000-0000"
                value={form.phone || ''}
                onChange={(e) => updateField('phone', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">E-mail (Opcional)</label>
              <input
                type="email"
                placeholder="Ex: cliente@exemplo.com"
                value={form.email || ''}
                onChange={(e) => updateField('email', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Endereço completo (exibido para PJ ou após consulta de CNPJ) */}
          {showExtendedPjFields && (
            <div className="space-y-2.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">CEP</label>
                  <input
                    type="text"
                    placeholder="00000-000"
                    value={form.zipCode || ''}
                    onChange={(e) => updateField('zipCode', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
                <div className="sm:col-span-6">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Logradouro</label>
                  <input
                    type="text"
                    placeholder="Rua / Avenida"
                    value={form.street || ''}
                    onChange={(e) => updateField('street', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Nº</label>
                  <input
                    type="text"
                    placeholder="100"
                    value={form.number || ''}
                    onChange={(e) => updateField('number', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-6">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Complemento</label>
                  <input
                    type="text"
                    placeholder="Sala / Galpão"
                    value={form.complement || ''}
                    onChange={(e) => updateField('complement', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-6">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Bairro</label>
                  <input
                    type="text"
                    placeholder="Bairro"
                    value={form.neighborhood || ''}
                    onChange={(e) => updateField('neighborhood', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              {(form.cadastralStatus || form.mainCnae) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-200/80">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Situação Cadastral</label>
                    <input
                      type="text"
                      value={form.cadastralStatus || ''}
                      onChange={(e) => updateField('cadastralStatus', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-emerald-800"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">CNAE Principal</label>
                    <input
                      type="text"
                      value={form.mainCnae || ''}
                      onChange={(e) => updateField('mainCnae', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cidade / UF e Limite de Crédito */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Cidade / UF</label>
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  type="text"
                  placeholder="Ex: Feira de Santana"
                  value={form.city || ''}
                  onChange={(e) => updateField('city', e.target.value)}
                  className="col-span-2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:bg-white"
                />
                <input
                  type="text"
                  placeholder="Ex: BA"
                  maxLength={2}
                  value={form.state || ''}
                  onChange={(e) => updateField('state', e.target.value.toUpperCase())}
                  className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 text-center uppercase focus:outline-hidden focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Limite Crédito (R$)</label>
              <input
                type="number"
                step="50"
                min="0"
                placeholder="Ex: 1.000,00"
                value={creditLimitInput}
                onChange={(e) => setCreditLimitInput(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 text-right focus:outline-hidden focus:bg-white"
              />
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 size={15} />
              <span>Cadastrar e Selecionar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
