import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { DiscountAuthorizationRecord, User } from '../../types';
import {
  DiscountViolationDetails,
  issueDiscountAuthorization,
} from '../../services/discountControl';
import { verifyDiscountAuthorizerCredentials } from '../../services/firebase';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';

export interface DiscountAuthorizationModalProps {
  isOpen: boolean;
  violation: DiscountViolationDetails | null;
  seller: Pick<User, 'id' | 'name' | 'login'>;
  saleSessionId: string;
  queuePosition?: { current: number; total: number };
  onAuthorized: (record: DiscountAuthorizationRecord) => void;
  onReduceToLimit?: () => void;
  onCancel: () => void;
}

export const DiscountAuthorizationModal: React.FC<DiscountAuthorizationModalProps> = ({
  isOpen,
  violation,
  seller,
  saleSessionId,
  queuePosition,
  onAuthorized,
  onReduceToLimit,
  onCancel,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  const identifierInputRef = useRef<HTMLInputElement>(null);

  // Limpa credenciais e foca o campo do autorizador sempre que um novo bloqueio for exibido
  useEffect(() => {
    if (!isOpen || !violation) {
      setIdentifier('');
      setPassword('');
      setShowPassword(false);
      setIsVerifying(false);
      setStatusFeedback(null);
      return;
    }

    setIdentifier('');
    setPassword('');
    setShowPassword(false);
    setIsVerifying(false);
    setStatusFeedback(null);

    const prevOverflow = typeof document !== 'undefined' ? document.body.style.overflow : '';
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }

    const timer = setTimeout(() => {
      identifierInputRef.current?.focus();
    }, 40);

    return () => {
      clearTimeout(timer);
      if (typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow;
      }
      // Garante que nenhuma senha permaneça em memória de estado ao desmontar
      setPassword('');
    };
  }, [isOpen, violation?.productId, violation?.requestedDiscountValue, violation?.quantity]);

  if (!isOpen || !violation) return null;

  const isPercentLimit = violation.limitType === 'percent';
  const maxLimitPrimary = isPercentLimit
    ? `${violation.maxDiscountConfigured.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
    : `${formatCurrency(violation.maxDiscountConfigured)} / un`;

  const maxLimitSecondary = isPercentLimit
    ? `(${formatCurrency(violation.maxDiscountValueAllowed)} na linha)`
    : violation.quantity !== 1
    ? `(${formatCurrency(violation.maxDiscountValueAllowed)} total / ${violation.maxDiscountPercentAllowed.toFixed(2)}%)`
    : `(${violation.maxDiscountPercentAllowed.toFixed(2)}%)`;

  const reasonLabel = (() => {
    switch (violation.reason) {
      case 'preco_manual':
        return 'Alteração manual do preço unitário';
      case 'desconto_global':
        return 'Desconto geral aplicado ao pedido';
      case 'combinado':
        return 'Combinação de descontos / ajuste de preço';
      default:
        return 'Desconto informado no produto';
    }
  })();

  const handleSubmitAuthorization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifying) return;

    const cleanId = identifier.trim();
    const cleanPass = password.trim();

    if (!cleanId || !cleanPass) {
      setStatusFeedback({
        type: 'error',
        text: 'Informe o usuário (ou e-mail) e a senha do autorizador.',
      });
      return;
    }

    setIsVerifying(true);
    setStatusFeedback(null);

    try {
      const result = await verifyDiscountAuthorizerCredentials(cleanId, cleanPass);
      // Limpa imediatamente o campo de senha após a verificação (nunca mantém em estado)
      setPassword('');

      if (!result.ok || !result.authorizer) {
        setStatusFeedback({
          type: 'error',
          text: result.message || 'Falha na autenticação do autorizador.',
        });
        setIsVerifying(false);
        return;
      }

      const authRecord = issueDiscountAuthorization({
        violation,
        seller,
        authorizer: result.authorizer,
        saleSessionId,
      });

      const roleText =
        result.authorizer.role === 'admin' ? 'Administrador (Acesso Total)' : 'Gerente Geral';

      setStatusFeedback({
        type: 'success',
        text: `Autorização concedida por ${result.authorizer.name} (${roleText}). Liberando operação...`,
      });

      setTimeout(() => {
        onAuthorized(authRecord);
      }, 320);
    } catch {
      setPassword('');
      setStatusFeedback({
        type: 'error',
        text: 'Falha na autenticação. Verifique sua conexão e tente novamente.',
      });
      setIsVerifying(false);
    }
  };

  const handleSafeCancel = () => {
    if (isVerifying) return;
    setPassword('');
    onCancel();
  };

  const handleSafeReduce = () => {
    if (isVerifying || !onReduceToLimit) return;
    setPassword('');
    onReduceToLimit();
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="discount-auth-modal-title"
      aria-describedby="discount-auth-modal-desc"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl border-2 border-rose-300 shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Cabeçalho de Alerta */}
        <div className="px-5 py-4 bg-rose-50 border-b border-rose-200 flex items-start gap-3 shrink-0">
          <div className="w-11 h-11 rounded-xl bg-rose-100 border border-rose-300 text-rose-700 flex items-center justify-center shrink-0 shadow-2xs">
            <ShieldAlert size={24} />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white border border-rose-300 text-rose-800">
                <Lock size={11} />
                <span>Proteção de Margem</span>
              </span>
              {queuePosition && queuePosition.total > 1 && (
                <span className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-900 text-white">
                  Item {queuePosition.current} de {queuePosition.total}
                </span>
              )}
            </div>
            <h3
              id="discount-auth-modal-title"
              className="text-base sm:text-lg font-black uppercase tracking-wide text-rose-950 leading-tight"
            >
              DESCONTO MÁXIMO EXCEDIDO
            </h3>
            <p id="discount-auth-modal-desc" className="text-xs sm:text-sm font-semibold text-rose-900">
              O desconto informado ultrapassa o limite máximo permitido para este produto.
            </p>
          </div>
        </div>

        {/* Corpo com Rolagem Responsiva */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {/* Resumo do Produto e Comparativo de Limite */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 space-y-3">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Produto
              </span>
              <p className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug break-words">
                <span className="font-mono text-blue-700 mr-1.5 text-xs sm:text-sm">
                  [{violation.productCode}]
                </span>
                <span>{violation.productDescription}</span>
              </p>
              <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                Origem: {reasonLabel} • Quantidade: <strong className="text-slate-700">{formatQuantity(violation.quantity)}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="bg-white rounded-lg border border-slate-200 p-2.5">
                <span className="block text-[10px] font-bold uppercase text-slate-500">
                  Preço de referência
                </span>
                <strong className="text-sm font-mono font-extrabold text-slate-900 block mt-0.5">
                  {formatCurrency(violation.referenceUnitPrice)}
                </strong>
                {violation.quantity !== 1 && (
                  <span className="text-[10px] text-slate-500 font-mono">
                    Linha: {formatCurrency(violation.grossLineValue)}
                  </span>
                )}
              </div>

              <div className="bg-emerald-50/70 rounded-lg border border-emerald-200 p-2.5">
                <span className="block text-[10px] font-bold uppercase text-emerald-800">
                  Desconto máx. permitido
                </span>
                <strong className="text-sm font-mono font-extrabold text-emerald-900 block mt-0.5">
                  {maxLimitPrimary}
                </strong>
                <span className="text-[10px] text-emerald-700 font-mono">{maxLimitSecondary}</span>
              </div>

              <div className="bg-rose-50/80 rounded-lg border border-rose-200 p-2.5">
                <span className="block text-[10px] font-bold uppercase text-rose-800">
                  Desconto solicitado
                </span>
                <strong className="text-sm font-mono font-black text-rose-700 block mt-0.5">
                  {violation.requestedDiscountPercent.toFixed(2)}% ({formatCurrency(violation.requestedDiscountValue)})
                </strong>
              </div>

              <div className="bg-amber-50/90 rounded-lg border border-amber-300 p-2.5">
                <span className="block text-[10px] font-bold uppercase text-amber-900">
                  Diferença acima do limite
                </span>
                <strong className="text-sm font-mono font-black text-amber-900 block mt-0.5">
                  +{violation.excessPercent.toFixed(2)}% (+{formatCurrency(violation.excessValue)})
                </strong>
              </div>
            </div>
          </div>

          {/* Aviso de Autorização Obrigatória */}
          <div className="rounded-xl bg-amber-50 border border-amber-300 border-l-4 border-l-amber-500 p-3 flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-amber-950 leading-relaxed">
              Para liberar este desconto, é necessária a autorização de um{' '}
              <strong className="underline">Administrador (Acesso Total)</strong> ou{' '}
              <strong className="underline">Gerente Geral</strong>.
            </p>
          </div>

          {/* Formulário de Autenticação do Autorizador */}
          <form onSubmit={handleSubmitAuthorization} className="space-y-3 bg-white rounded-xl border border-slate-200 p-3.5">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <UserCheck size={16} className="text-blue-600" />
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Autorização de Gestor
              </h4>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Usuário ou E-mail do Autorizador *
                </label>
                <input
                  ref={identifierInputRef}
                  type="text"
                  autoComplete="off"
                  disabled={isVerifying}
                  placeholder="Ex: admin, gerente ou e-mail Google"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Senha do Autorizador *
                </label>
                <div className="relative">
                  <KeyRound size={15} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    disabled={isVerifying}
                    placeholder="Digite a senha do Administrador ou Gerente Geral"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPassword ? 'Ocultar senha' : 'Visualizar senha'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Mensagens Claras de Retorno */}
            {statusFeedback && (
              <div
                className={`rounded-xl p-3 text-xs font-bold flex items-start gap-2 border ${
                  statusFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-rose-50 border-rose-300 text-rose-900'
                }`}
              >
                {statusFeedback.type === 'success' ? (
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                )}
                <span>{statusFeedback.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifying}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-400 text-white font-extrabold text-sm shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              {isVerifying ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  <span>Validando credenciais e permissões...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>Autorizar Desconto Excedente</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Rodapé com Opções Alternativas (Sem Permitir Bypass) */}
        <div className="px-4 sm:px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
          {onReduceToLimit ? (
            <button
              type="button"
              disabled={isVerifying}
              onClick={handleSafeReduce}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 font-extrabold text-xs transition-colors cursor-pointer min-h-[42px]"
            >
              <TrendingDown size={15} className="text-emerald-700" />
              <span>
                Reduzir para o Limite ({isPercentLimit ? `${violation.maxDiscountConfigured}%` : formatCurrency(violation.maxDiscountValueAllowed)})
              </span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            disabled={isVerifying}
            onClick={handleSafeCancel}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs transition-colors cursor-pointer min-h-[42px]"
          >
            <XCircle size={15} className="text-slate-500" />
            <span>Cancelar e Voltar à Venda</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
