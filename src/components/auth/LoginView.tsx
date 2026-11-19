import React, { useState, useEffect } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Mail,
  ArrowLeft,
} from 'lucide-react';
import { GestaoFacilLogo } from '../common/AppLogo';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { toast } from '../../services/toast';
import {
  loginWithSystemCredentials,
  requestFirebasePasswordReset,
  MASTER_ADMIN_EMAIL,
} from '../../services/firebase';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [loginInput, setLoginInput] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Carrega login lembrado se houver
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLogin = localStorage.getItem('gestaofacil_remembered_login');
      if (savedLogin) {
        setLoginInput(savedLogin);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (mode === 'reset') {
      const cleanEmail = resetEmail.trim();
      if (!cleanEmail) {
        setErrorMsg('Por favor, informe o seu e-mail cadastrado para recuperar a senha.');
        return;
      }

      setIsLoading(true);
      try {
        const requestedEmail = await requestFirebasePasswordReset(cleanEmail);
        const msg = `Solicitação de recuperação de senha enviada para ${requestedEmail}. Caso este e-mail esteja cadastrado no Firebase Authentication, você receberá o link oficial para redefinir sua senha (verifique também a caixa de spam).`;
        setSuccessMsg(msg);
        toast.success('E-mail de recuperação solicitado com sucesso!', 'Recuperação de Senha');
      } catch (err: any) {
        setErrorMsg(err?.message || 'Não foi possível solicitar a recuperação de senha.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const cleanLogin = loginInput.trim();
    const cleanPassword = password.trim();

    if (!cleanLogin) {
      setErrorMsg('Por favor, informe seu usuário ou e-mail de acesso.');
      return;
    }

    if (!cleanPassword) {
      setErrorMsg('Por favor, informe sua senha de acesso.');
      return;
    }

    // Autenticação integrada via Firebase Authentication
    setIsLoading(true);
    try {
      const user = await loginWithSystemCredentials(cleanLogin, cleanPassword, rememberMe);
      if (rememberMe && typeof window !== 'undefined') {
        localStorage.setItem('gestaofacil_remembered_login', cleanLogin);
      } else if (typeof window !== 'undefined') {
        localStorage.removeItem('gestaofacil_remembered_login');
      }
      toast.success(
        `Bem-vindo(a), ${user.name}! Perfil ativo: ${user.role.toUpperCase()}.`,
        'Login Realizado'
      );
      onLoginSuccess();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Ocorreu um erro na autenticação.');
    } finally {
      setIsLoading(false);
    }
  };

  const activeIdentifier = (mode === 'reset' ? resetEmail : loginInput).trim().toLowerCase();
  const isCurrentAdmin =
    activeIdentifier === 'admin' ||
    activeIdentifier === '@admin' ||
    activeIdentifier === MASTER_ADMIN_EMAIL.toLowerCase();

  const openPasswordResetMode = () => {
    const trimmedLogin = loginInput.trim();
    setResetEmail(trimmedLogin.includes('@') ? trimmedLogin : '');
    setErrorMsg(null);
    setSuccessMsg(null);
    setMode('reset');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 relative overflow-hidden select-none">
      {/* Elementos visuais decorativos de fundo suaves */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-slate-900/40 rounded-full blur-3xl pointer-events-none" />

      {/* CARD PRINCIPAL CENTRALIZADO DE ACESSO AO SISTEMA */}
      <div className="relative z-10 w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl">
        {/* CABEÇALHO DO CARD */}
        <div className="text-center mb-6">
          <div className="inline-flex justify-center mb-3">
            <GestaoFacilLogo size={46} variant="dark" showSlogan={false} />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {mode === 'login' ? 'Acesso ao Sistema' : 'Recuperar Senha'}
          </h2>
          <p className="text-xs text-slate-400 mt-1.5">
            {mode === 'login'
              ? 'Informe sua conta Google (@gmail.com) e senha para iniciar sua sessão de trabalho'
              : 'Informe seu e-mail para receber o link oficial de redefinição do Firebase Authentication'}
          </p>
        </div>

        {/* ALERTA DE ERRO */}
        {errorMsg && (
          <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-2.5 text-rose-300 text-xs animate-shake">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
            <span className="font-semibold leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* ALERTA DE SUCESSO */}
        {successMsg && (
          <div className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-start gap-2.5 text-emerald-300 text-xs">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-400" />
            <span className="font-semibold leading-relaxed">{successMsg}</span>
          </div>
        )}

        {/* FORMULÁRIO */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'reset' ? (
            <>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider">
                    E-mail de Acesso: *
                  </label>
                  {isCurrentAdmin && (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                      Admin Master
                    </span>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => {
                      setResetEmail(e.target.value);
                      setErrorMsg(null);
                    }}
                    placeholder="romeujr.suporte@gmail.com"
                    className="w-full pl-10 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-white font-medium text-sm placeholder:text-slate-600 focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer mt-3"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Solicitando recuperação...</span>
                  </span>
                ) : (
                  <>
                    <span>Enviar Link de Recuperação</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className="w-full py-2.5 px-4 bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Voltar para o login</span>
              </button>
            </>
          ) : (
            <>
              {/* CAMPO LOGIN / CONTA GOOGLE */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider">
                    Login de Acesso: *
                  </label>
                  {isCurrentAdmin && (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                      Admin Master
                    </span>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <span className="font-mono font-bold text-slate-400 text-sm">@</span>
                  </div>
                  <input
                    type="text"
                    required
                    value={loginInput}
                    onChange={(e) => {
                      setLoginInput(e.target.value);
                      setErrorMsg(null);
                    }}
                    placeholder="seuemail@gmail.com"
                    className="w-full pl-9 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-white font-mono font-semibold text-sm placeholder:text-slate-600 focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>

              {/* CAMPO SENHA */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider">
                    Senha: *
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrorMsg(null);
                    }}
                    placeholder="Digite sua senha"
                    className="w-full pl-10 pr-11 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-white font-medium text-sm placeholder:text-slate-600 focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer"
                    title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* OPÇÃO LEMBRAR DE MIM E ESQUECI MINHA SENHA */}
              <div className="flex items-center justify-between gap-2 text-xs pt-0.5">
                <label className="flex items-center gap-2 cursor-pointer text-slate-400 hover:text-slate-200">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer"
                  />
                  <span>Lembrar meu usuário neste dispositivo</span>
                </label>
                <button
                  type="button"
                  onClick={openPasswordResetMode}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors cursor-pointer shrink-0"
                >
                  Esqueci minha senha
                </button>
              </div>

              {/* BOTÃO ENTRAR */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer mt-3"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Validando acesso...</span>
                  </span>
                ) : (
                  <>
                    <span>Acessar o Sistema</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </>
          )}
        </form>

        {/* RODAPÉ DO CARD */}
        <div className="pt-4 mt-5 border-t border-slate-800/80 text-center">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <ShieldCheck size={13} className="text-emerald-400" />
            <span>Validação integrada e sincronização em nuvem via Firebase</span>
          </div>
          <PWAInstallButton variant="login-button" />
        </div>
      </div>
    </div>
  );
};
