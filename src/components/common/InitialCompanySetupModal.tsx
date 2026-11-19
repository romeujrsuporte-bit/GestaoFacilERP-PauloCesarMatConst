import React, { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  FileText,
  Phone,
  Mail,
  MapPin,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Upload,
  X,
  Camera,
} from 'lucide-react';
import { Database } from '../../services/db';
import { FirebaseSyncService } from '../../services/firebaseSync';
import { toast } from '../../services/toast';
import { GestaoFacilLogo } from './AppLogo';
import { processLogoFile } from '../../services/imageUtils';

interface InitialCompanySetupModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

export const InitialCompanySetupModal: React.FC<InitialCompanySetupModalProps> = ({
  isOpen,
  onSuccess,
}) => {
  const currentComp = Database.getCurrentCompany();

  const [name, setName] = useState(
    currentComp?.name && currentComp.name !== 'Empresa Matriz' && currentComp.name !== 'Minha Empresa Matriz'
      ? currentComp.name
      : ''
  );
  const [tradeName, setTradeName] = useState(
    currentComp?.tradeName && currentComp.tradeName !== 'Empresa Matriz' && currentComp.tradeName !== 'Matriz'
      ? currentComp.tradeName
      : ''
  );
  const [cnpjCpf, setCnpjCpf] = useState(currentComp?.cnpjCpf || '');
  const [ie, setIe] = useState('');
  const [phone, setPhone] = useState(currentComp?.phone || '');
  const [email, setEmail] = useState(currentComp?.email || '');
  const [zipCode, setZipCode] = useState(currentComp?.address?.zipCode || '');
  const [street, setStreet] = useState(currentComp?.address?.street || '');
  const [number, setNumber] = useState(currentComp?.address?.number || '');
  const [neighborhood, setNeighborhood] = useState(currentComp?.address?.neighborhood || '');
  const [city, setCity] = useState(currentComp?.address?.city || '');
  const [state, setState] = useState(currentComp?.address?.state || 'BA');
  const [logoUrl, setLogoUrl] = useState(currentComp?.logoUrl || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Formatação de CNPJ / CPF
  const handleCnpjChange = (value: string) => {
    const raw = value.replace(/\D/g, '');
    let formatted = raw;
    if (raw.length <= 11) {
      // CPF: 000.000.000-00
      formatted = raw
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
      // CNPJ: 00.000.000/0000-00
      formatted = raw
        .slice(0, 14)
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    setCnpjCpf(formatted);
    setErrorMessage(null);
  };

  // Formatação de CEP
  const handleZipCodeChange = async (value: string) => {
    const raw = value.replace(/\D/g, '').slice(0, 8);
    const formatted = raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
    setZipCode(formatted);

    // Auto-busca via CEP se completou 8 dígitos
    if (raw.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
        const data = await res.json();
        if (data && !data.erro) {
          if (data.logradouro) setStreet(data.logradouro);
          if (data.bairro) setNeighborhood(data.bairro);
          if (data.localidade) setCity(data.localidade);
          if (data.uf) setState(data.uf);
          toast.info(`Endereço preenchido: ${data.localidade} - ${data.uf}`, 'CEP Localizado');
        }
      } catch {
        // ignora se offline
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = name.trim();
    const cleanTrade = tradeName.trim() || cleanName;
    const cleanCnpj = cnpjCpf.trim();

    if (!cleanName) {
      setErrorMessage('Por favor, informe a Razão Social da Empresa Matriz.');
      return;
    }

    if (!cleanCnpj) {
      setErrorMessage('Por favor, informe o CNPJ ou CPF da Empresa Matriz.');
      return;
    }

    setIsSubmitting(true);
    try {
      Database.completeMatrizSetup({
        name: cleanName,
        tradeName: cleanTrade,
        cnpjCpf: cleanCnpj,
        ie: ie.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
        address: {
          street: street.trim(),
          number: number.trim(),
          neighborhood: neighborhood.trim(),
          city: city.trim(),
          state: state.trim() || 'BA',
          zipCode: zipCode.trim(),
        },
      });

      // Sincroniza o estado atualizado da matriz com o Firebase Firestore
      try {
        await FirebaseSyncService.syncToFirebase(Database.getState());
      } catch (syncErr) {
        console.warn('Aviso ao sincronizar cadastro da Matriz com o Firebase:', syncErr);
      }

      toast.success(
        `Empresa Matriz "${cleanTrade}" configurada com sucesso! O sistema está pronto para cadastros.`,
        'Sistema Inicializado!'
      );

      onSuccess();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao registrar os dados da Empresa Matriz.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden my-auto">
        {/* CABEÇALHO DO MODAL */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 text-white relative">
          <div className="flex items-center justify-between mb-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold tracking-wide">
              <Sparkles size={13} className="text-emerald-400" />
              <span>Início do Zero • Padrões de Fábrica</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>Acesso: Administrador Master</span>
            </div>
          </div>

          <div className="flex items-start gap-3 mt-3">
            <div className="p-3 bg-emerald-600/30 border border-emerald-500/40 rounded-2xl shrink-0">
              <Building2 size={28} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Cadastrar Empresa Matriz
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
                O sistema foi inicializado do zero. Cadastre agora os dados oficiais da sua Matriz para abrir o sistema e começar os demais cadastros de produtos, estoques e clientes.
              </p>
            </div>
          </div>
        </div>

        {/* ALERTA DE ERRO */}
        {errorMessage && (
          <div className="m-5 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-rose-700 text-xs">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
        )}

        {/* FORMULÁRIO DE CADASTRO */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* SEÇÃO 1: IDENTIFICAÇÃO FISCAL */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <FileText size={14} className="text-emerald-600" />
              <span>Identificação & Razão Social</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Razão Social da Empresa: *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!tradeName) setTradeName(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="Ex: Minha Empresa Comércio e Distribuição Ltda"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-sm focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome Fantasia: *
                </label>
                <input
                  type="text"
                  required
                  value={tradeName}
                  onChange={(e) => {
                    setTradeName(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="Ex: Minha Loja & Distribuidora"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-sm focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  CNPJ ou CPF da Matriz: *
                </label>
                <input
                  type="text"
                  required
                  value={cnpjCpf}
                  onChange={(e) => handleCnpjChange(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold text-sm focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              {/* Logomarca da Empresa */}
              <div className="sm:col-span-2 p-3.5 bg-slate-50/80 border border-slate-200 rounded-2xl">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Logomarca da Empresa (Opcional)
                </label>
                <div className="flex items-center gap-3">
                  {logoUrl ? (
                    <div className="relative group w-16 h-16 rounded-xl border border-slate-300 bg-white p-1 flex items-center justify-center shadow-xs shrink-0">
                      <img
                        src={logoUrl}
                        alt="Logomarca"
                        className="w-full h-full object-contain rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setLogoUrl('')}
                        className="absolute -top-1.5 -right-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-1 shadow-xs cursor-pointer transition-transform group-hover:scale-110"
                        title="Remover Logomarca"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 shrink-0">
                      <Building2 size={22} className="mb-0.5 text-slate-300" />
                      <span className="text-[9px] font-semibold">Sem logo</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 shadow-2xs cursor-pointer transition-colors">
                      <Upload size={14} className="text-emerald-600" />
                      <span>{logoUrl ? 'Alterar Logo...' : 'Carregar Imagem da Logo...'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const optimized = await processLogoFile(file);
                            setLogoUrl(optimized);
                            toast.success('Logomarca carregada!', 'Imagem da Matriz');
                          } catch (err: any) {
                            toast.error(err.message || 'Erro ao carregar a imagem.');
                          }
                        }}
                      />
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Formatos aceitos: PNG, JPG, WebP ou SVG. A logo aparecerá no cabeçalho e na tela inicial.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Inscrição Estadual (IE):
                </label>
                <input
                  type="text"
                  value={ie}
                  onChange={(e) => setIe(e.target.value)}
                  placeholder="Opcional ou Isento"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-sm focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Telefone / WhatsApp Comercial:
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-sm focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  E-mail de Contato Comercial:
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contato@minhaempresa.com.br"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-sm focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* SEÇÃO 2: ENDEREÇO DA MATRIZ */}
          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <MapPin size={14} className="text-emerald-600" />
              <span>Endereço da Loja Matriz</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  CEP:
                </label>
                <input
                  type="text"
                  value={zipCode}
                  onChange={(e) => handleZipCodeChange(e.target.value)}
                  placeholder="00000-000"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-sm focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Logradouro / Rua:
                </label>
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Rua, Avenida, Praça..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-sm focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Número:
                </label>
                <input
                  type="text"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="123 ou S/N"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-sm focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Bairro:
                </label>
                <input
                  type="text"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder="Bairro"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-sm focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cidade / UF:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Cidade"
                    className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium text-sm focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  />
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-20 px-2 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold text-sm focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  >
                    {[
                      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
                      'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
                      'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
                    ].map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* RODAPÉ COM AÇÃO DE SUBMISSÃO */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Configurando Sistema...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  <span>Salvar Matriz e Abrir o Sistema</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
