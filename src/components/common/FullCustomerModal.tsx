import React, { useState, useEffect } from 'react';
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
  Info
} from 'lucide-react';
import { Database } from '../../services/db';
import { Customer } from '../../types';
import { toast } from '../../services/toast';

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
    notes: '',
  });

  // Atualizar código e nome inicial ao abrir com campos limpos
  useEffect(() => {
    if (isOpen) {
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
        notes: '',
      });
      setActiveTab('dados_gerais');
    }
  }, [isOpen, initialName]);

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
      notes: custForm.notes?.trim() || '',
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

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {custForm.type === 'PJ' ? 'CNPJ' : 'CPF'}
                </label>
                <input
                  type="text"
                  placeholder={custForm.type === 'PJ' ? 'Ex: 00.000.000/0001-00' : 'Ex: 000.000.000-00'}
                  value={custForm.cpfCnpj}
                  onChange={(e) => setCustForm({ ...custForm, cpfCnpj: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                />
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
                  onChange={(e) => setCustForm({ ...custForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome Fantasia</label>
                <input
                  type="text"
                  placeholder="Ex: Mercado Alvorada"
                  value={custForm.tradeName}
                  onChange={(e) => setCustForm({ ...custForm, tradeName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Telefone Fixo</label>
                <input
                  type="text"
                  placeholder="Ex: (75) 3622-1000"
                  value={custForm.phone}
                  onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
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
                  onChange={(e) => setCustForm({ ...custForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
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
                    onChange={(e) => setCustForm({ ...custForm, zipCode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                  />
                </div>

                <div className="sm:col-span-7">
                  <label className="block font-bold text-slate-700 mb-1">Logradouro / Rua / Avenida</label>
                  <input
                    type="text"
                    placeholder="Ex: Av. Getúlio Vargas, Rua Conselheiro Franco"
                    value={custForm.street || ''}
                    onChange={(e) => setCustForm({ ...custForm, street: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Número</label>
                  <input
                    type="text"
                    placeholder="Ex: 1000"
                    value={custForm.number || ''}
                    onChange={(e) => setCustForm({ ...custForm, number: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block font-bold text-slate-700 mb-1">Complemento / Doca</label>
                  <input
                    type="text"
                    placeholder="Ex: Bloco B, Doca 2, Galpão 4"
                    value={custForm.complement || ''}
                    onChange={(e) => setCustForm({ ...custForm, complement: e.target.value })}
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
                      onChange={(e) => setCustForm({ ...custForm, state: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                      placeholder="Ex: SP"
                    />
                  ) : (
                    <select
                      value={custForm.state || ''}
                      onChange={(e) => setCustForm({ ...custForm, state: e.target.value })}
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
                      onChange={(e) => setCustForm({ ...custForm, city: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                      placeholder="Ex: Feira de Santana"
                    />
                  ) : (
                    <select
                      value={custForm.city || ''}
                      onChange={(e) => {
                        const val = e.target.value;
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
                      onChange={(e) => setCustForm({ ...custForm, neighborhood: e.target.value })}
                      placeholder="Ex: Kalilândia, Centro"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                    />
                  ) : (
                    <select
                      value={custForm.neighborhood || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustForm((prev) => ({ ...prev, neighborhood: val }));
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

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Observações & Instruções de Entrega</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Horário para descarga das 08h às 11h, procurar Sr. Marcos no estoque."
                  value={custForm.notes}
                  onChange={(e) => setCustForm({ ...custForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
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
