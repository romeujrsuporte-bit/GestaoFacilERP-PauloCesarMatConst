import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { Customer } from '../../types';
import { CnpjFieldConflict, CnpjLookupData } from '../../services/cnpjLookupService';

export interface CnpjFeedbackState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
  data?: CnpjLookupData | null;
  filledCount?: number;
  filledAddressCount?: number;
}

interface CnpjLookupBannerProps {
  feedback: CnpjFeedbackState;
  conflicts: CnpjFieldConflict[];
  duplicateCustomer: Customer | null;
  onApplyOverwrite?: () => void;
  onKeepManual?: () => void;
  onSelectDuplicateCustomer?: (customer: Customer) => void;
  compact?: boolean;
}

export const CnpjLookupBanner: React.FC<CnpjLookupBannerProps> = ({
  feedback,
  conflicts,
  duplicateCustomer,
  onApplyOverwrite,
  onKeepManual,
  onSelectDuplicateCustomer,
  compact = false,
}) => {
  const hasAnything =
    Boolean(duplicateCustomer) ||
    feedback.status !== 'idle' ||
    conflicts.length > 0;

  if (!hasAnything) return null;

  const situacao = feedback.data?.situacaoCadastral || '';
  const isSituacaoAtiva = situacao.toUpperCase() === 'ATIVA';

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
      {/* Aviso de CNPJ já cadastrado no sistema */}
      {duplicateCustomer && (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2">
            <ShieldAlert size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="leading-snug">
              <p className="font-bold text-amber-900">
                CNPJ já cadastrado no sistema!
              </p>
              <p className="text-[11px] text-amber-800">
                Cliente existente: <strong className="font-bold">{duplicateCustomer.name}</strong>{' '}
                <span className="font-mono">({duplicateCustomer.code})</span>. Não é permitido criar cadastros duplicados com o mesmo CNPJ.
              </p>
            </div>
          </div>
          {onSelectDuplicateCustomer && (
            <button
              type="button"
              onClick={() => onSelectDuplicateCustomer(duplicateCustomer)}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition-colors cursor-pointer"
            >
              <UserCheck size={14} />
              <span>Usar este cliente</span>
            </button>
          )}
        </div>
      )}

      {/* Indicador de carregamento */}
      {feedback.status === 'loading' && (
        <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-2">
          <Loader2 size={15} className="animate-spin text-blue-600 shrink-0" />
          <span className="font-semibold">
            Consultando dados cadastrais do CNPJ na Receita Federal...
          </span>
        </div>
      )}

      {/* Sucesso na consulta */}
      {feedback.status === 'success' && (
        <div className="p-2.5 rounded-xl bg-emerald-50/90 border border-emerald-200 text-emerald-950 text-xs space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-bold text-emerald-900">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <span>{feedback.message || 'Dados do CNPJ encontrados e preenchidos.'}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {situacao && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isSituacaoAtiva
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                >
                  Receita: {situacao}
                </span>
              )}
              {feedback.data?.source && (
                <span className="text-[10px] font-semibold text-emerald-700 bg-white/80 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Fonte: {feedback.data.source}
                </span>
              )}
            </div>
          </div>
          {!isSituacaoAtiva && situacao && (
            <p className="text-[11px] text-rose-700 font-semibold flex items-center gap-1">
              <AlertTriangle size={13} className="shrink-0" />
              <span>Atenção: este CNPJ consta com situação cadastral "{situacao}" na Receita Federal.</span>
            </p>
          )}
          <p className="text-[11px] text-emerald-800/90">
            Confira, edite ou complemente os dados antes de clicar em salvar.
            {feedback.filledAddressCount && feedback.filledAddressCount > 0
              ? ` (${feedback.filledAddressCount} campo(s) de endereço preenchidos.)`
              : ''}
          </p>
        </div>
      )}

      {/* Erro / Não encontrado / Indisponível */}
      {feedback.status === 'error' && feedback.message && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2">
          <Info size={15} className="text-rose-600 shrink-0 mt-0.5" />
          <span className="font-medium leading-snug">{feedback.message}</span>
        </div>
      )}

      {/* Confirmação explícita para sobrescrever campos preenchidos manualmente */}
      {conflicts.length > 0 && onApplyOverwrite && onKeepManual && (
        <div className="p-3 rounded-xl bg-amber-50/95 border border-amber-300 text-amber-950 text-xs space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-amber-950">
                Campos preenchidos manualmente foram preservados
              </p>
              <p className="text-[11px] text-amber-900 leading-snug">
                Os seguintes campos já continham dados e não foram alterados automaticamente:{' '}
                <strong>{conflicts.map((c) => c.label).join(', ')}</strong>. Deseja substituí-los pelos dados retornados do CNPJ?
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-6">
            <button
              type="button"
              onClick={onApplyOverwrite}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition-colors cursor-pointer"
            >
              <RefreshCw size={12} />
              <span>Sobrescrever campos preenchidos</span>
            </button>
            <button
              type="button"
              onClick={onKeepManual}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-[11px] transition-colors cursor-pointer"
            >
              Manter meus dados
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
