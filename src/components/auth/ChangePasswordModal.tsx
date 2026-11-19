import React, { useState } from 'react';
import { X, Lock, KeyRound, Check, AlertCircle, ShieldCheck } from 'lucide-react';
import { Database as DbService } from '../../services/db';
import { User } from '../../types';
import { toast } from '../../services/toast';
import { auth, updateFirebaseAuthPassword, resolveUserFirebaseEmail } from '../../services/firebase';
import { FirebaseSyncService } from '../../services/firebaseSync';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser?: User;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  targetUser,
}) => {
  const currentUser = DbService.getCurrentUser();
  const userToChange = targetUser || currentUser;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const isTargetAdmin = userToChange.login === 'admin' || userToChange.id === 'usr-admin';
  const isCurrentAdmin = DbService.isMasterAdmin(currentUser);

  // Regra crítica: apenas os usuários "romeujr.suporte@gmail.com" e "admin" podem alterar senhas de usuários no sistema
  const canChange = isCurrentAdmin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isCurrentAdmin) {
      setErrorMsg('Apenas os usuários "romeujr.suporte@gmail.com" e "admin" têm autorização para alterar senhas de usuários no sistema.');
      return;
    }

    if (!canChange) {
      setErrorMsg('Apenas os usuários "romeujr.suporte@gmail.com" e "admin" têm autorização para alterar a senha do administrador.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('A confirmação da nova senha não confere com a nova senha digitada.');
      return;
    }

    if (newPassword.trim().length < 3) {
      setErrorMsg('A nova senha deve possuir no mínimo 3 caracteres.');
      return;
    }

    setIsLoading(true);

    const result = DbService.changePassword(
      userToChange.id,
      currentPassword,
      newPassword,
      currentUser.id
    );

    if (result.success) {
      const targetFbEmail = resolveUserFirebaseEmail(userToChange.email || userToChange.login, userToChange);
      if (
        auth.currentUser &&
        (auth.currentUser.uid === userToChange.firebaseUid ||
          auth.currentUser.email?.toLowerCase() === targetFbEmail.toLowerCase())
      ) {
        await updateFirebaseAuthPassword(newPassword);
      }
      await FirebaseSyncService.syncToFirebase(DbService.getState(), true).catch(console.warn);
      setIsLoading(false);
      toast.success(`Senha de ${userToChange.name} alterada com sucesso!`);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } else {
      setIsLoading(false);
      setErrorMsg(result.error || 'Erro ao alterar a senha.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <KeyRound size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                Alterar Senha de Acesso
              </h3>
              <span className="text-[11px] text-slate-500">
                Usuário: <strong className="text-slate-700 font-mono">{userToChange.login}</strong> ({userToChange.name})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo / Formulário */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!isCurrentAdmin && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-900">
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Acesso Restrito:</strong> Apenas o usuário <strong>Admin</strong> tem autorização para alterar senhas de usuários no sistema.
              </div>
            </div>
          )}

          {isTargetAdmin && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2 text-xs text-blue-900">
              <ShieldCheck size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Conta de Administrador:</strong> Conforme política de segurança, a senha do usuário <code className="bg-blue-100 px-1 rounded font-bold">admin</code> só pode ser alterada pelo próprio usuário administrador.
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-semibold">{errorMsg}</div>
            </div>
          )}

          {isTargetAdmin && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Senha Atual:
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  autoFocus
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Informe a senha atual"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nova Senha:
            </label>
            <input
              type="password"
              required
              autoFocus={!isTargetAdmin}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Digite a nova senha (mínimo 3 caracteres)"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Confirmar Nova Senha:
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a nova senha"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !canChange}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Check size={14} />
              <span>{isLoading ? 'Salvando...' : 'Salvar Nova Senha'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
