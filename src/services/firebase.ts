// Import the functions you need from the SDKs you need
import { initializeApp, getApps, deleteApp, FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocFromServer,
} from "firebase/firestore";
import firebaseConfigJson from "../../firebase-applet-config.json";
import {
  Database,
  DatabaseState,
  DEFAULT_ROLE_MENU_SECTIONS,
  DEFAULT_ROLE_SUB_ITEMS,
  DEFAULT_ROLE_FINANCIAL_PERMISSIONS,
} from "./db";
import { User, UserRole } from "../types";
import { AuthorizerProfileInfo, canUserAuthorizeProductDiscount } from "./discountControl";

const env = (import.meta as any).env || {};

// Configuração exclusiva do projeto Firebase: gestaofacilerp-paulocesarmc
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || firebaseConfigJson.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJson.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJson.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJson.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJson.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || firebaseConfigJson.appId,
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const configuredDatabaseId = env.VITE_FIREBASE_DATABASE_ID || firebaseConfigJson.firestoreDatabaseId;
export const db =
  configuredDatabaseId && configuredDatabaseId !== "(default)"
    ? getFirestore(app, configuredDatabaseId)
    : getFirestore(app);

// E-mail exclusivo do Administrador Master com acesso geral a todos os recursos
export const MASTER_ADMIN_EMAIL = "romeujr.suporte@gmail.com";
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((p) => ({
        providerId: p.providerId,
        email: p.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Testa a conectividade inicial com o Firestore
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Firebase Firestore: cliente offline ou aguardando conexão.");
    }
    return false;
  }
}

// Executa verificação inicial
if (typeof window !== "undefined") {
  testFirestoreConnection();
}

export interface UserProfileDoc {
  uid: string;
  erpUserId?: string;
  name: string;
  login: string;
  email: string;
  role: UserRole;
  companyId: string;
  status: 'ativo' | 'inativo';
  phone?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Converte senha do sistema para formato válido no Firebase Auth (mínimo de 6 caracteres)
 */
export function formatFirebaseAuthPassword(rawPassword: string): string {
  const clean = rawPassword.trim();
  if (clean.length >= 6) return clean;
  return `${clean}_erp2026!`;
}

const GOOGLE_EMAIL_REGEX = /^[a-z0-9._%+-]+@(gmail|googlemail)\.com$/i;
const SYNTHETIC_EMAIL_DOMAINS = ['@gestaofacil.com.br', '@example.com', '@test.com', '@teste.com', '@localhost'];

/**
 * Valida se o e-mail informado é uma conta Google válida (@gmail.com / @googlemail.com)
 */
export function isValidGoogleAccountEmail(emailInput: string): boolean {
  const clean = (emailInput || '').trim().toLowerCase();
  if (!clean || SYNTHETIC_EMAIL_DOMAINS.some((domain) => clean.endsWith(domain))) {
    return false;
  }
  return GOOGLE_EMAIL_REGEX.test(clean);
}

/**
 * Resolve o e-mail de autenticação Firebase de um usuário ou login
 */
export function resolveUserFirebaseEmail(loginOrEmail: string, matchedUser?: User): string {
  if (matchedUser) {
    if (matchedUser.login === 'admin' || matchedUser.email?.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) {
      return MASTER_ADMIN_EMAIL;
    }
    if (matchedUser.email && matchedUser.email.includes('@')) {
      return matchedUser.email.trim().toLowerCase();
    }
    return `${matchedUser.login.trim().toLowerCase().replace(/^@/, '')}@gestaofacil.com.br`;
  }

  const clean = loginOrEmail.trim().toLowerCase().replace(/^@/, '');
  if (clean === 'admin' || clean === MASTER_ADMIN_EMAIL.toLowerCase()) {
    return MASTER_ADMIN_EMAIL;
  }
  if (clean.includes('@')) {
    return clean;
  }
  return `${clean}@gestaofacil.com.br`;
}

function buildUserProfilePayload(uid: string, user: User, fbEmail: string, existingCreatedAt?: string): UserProfileDoc {
  const nowIso = new Date().toISOString();
  const payload: UserProfileDoc = {
    uid,
    erpUserId: user.id,
    name: user.name,
    login: user.login,
    email: fbEmail,
    role: user.role,
    companyId: user.companyId || 'comp-matriz',
    status: user.status || 'ativo',
    createdAt: existingCreatedAt || nowIso,
    updatedAt: nowIso,
  };
  if (user.phone) {
    payload.phone = user.phone;
  }
  return payload;
}

async function ensureUserProfileDocBeforePull(
  uid: string,
  fbEmail: string,
  localUser?: User
): Promise<{
  profileExists: boolean;
  existingStatus?: 'ativo' | 'inativo';
  existingCreatedAt?: string;
  existingProfile?: Partial<UserProfileDoc>;
}> {
  const docPath = `users/${uid}`;
  const docRef = doc(db, 'users', uid);
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<UserProfileDoc>;
      cachedFirestoreUserProfile = data;
      return {
        profileExists: true,
        existingStatus: data.status,
        existingCreatedAt: data.createdAt,
        existingProfile: data,
      };
    }

    const isMaster = fbEmail.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();
    if (!isMaster) {
      // Usuários comuns devem ter o perfil /users/{uid} provisionado previamente pelo Administrador Master
      return { profileExists: false };
    }

    const nowIso = new Date().toISOString();
    const initialDoc: UserProfileDoc = {
      uid,
      erpUserId: localUser?.id || 'usr-admin',
      name: localUser?.name || 'Administrador Geral',
      login: localUser?.login || 'admin',
      email: MASTER_ADMIN_EMAIL,
      role: 'admin',
      companyId: localUser?.companyId || 'comp-matriz',
      status: 'ativo',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await setDoc(docRef, initialDoc);
    cachedFirestoreUserProfile = initialDoc;
    return {
      profileExists: true,
      existingStatus: 'ativo',
      existingCreatedAt: nowIso,
      existingProfile: initialDoc,
    };
  } catch (err) {
    console.warn(`Aviso ao verificar perfil ${docPath} no Firestore:`, err);
    return { profileExists: false };
  }
}

let cachedFirestoreUserProfile: Partial<UserProfileDoc> | null = null;

export function getCachedFirestoreUserProfile(uid?: string | null): Partial<UserProfileDoc> | null {
  if (!cachedFirestoreUserProfile) return null;
  if (uid && cachedFirestoreUserProfile.uid && cachedFirestoreUserProfile.uid !== uid) {
    return null;
  }
  return cachedFirestoreUserProfile;
}

export function clearCachedFirestoreUserProfile(): void {
  cachedFirestoreUserProfile = null;
}

export async function fetchFirestoreUserProfile(
  uid: string,
  forceRefresh: boolean = false
): Promise<Partial<UserProfileDoc> | null> {
  if (!uid) return null;
  if (!forceRefresh && cachedFirestoreUserProfile && cachedFirestoreUserProfile.uid === uid && cachedFirestoreUserProfile.role) {
    return cachedFirestoreUserProfile;
  }
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const data = snap.data() as Partial<UserProfileDoc>;
      cachedFirestoreUserProfile = { ...data, uid: data.uid || uid };
      return cachedFirestoreUserProfile;
    }
  } catch (err) {
    console.warn(`Aviso ao consultar perfil users/${uid} no Firestore:`, err);
  }
  return null;
}

type RemotePullObserver = (
  remoteState: DatabaseState,
  remoteRegisteredCompanyIds?: Record<string, boolean> | null
) => void;

let remotePullObserver: RemotePullObserver | null = null;

export function registerRemotePullObserver(observer: RemotePullObserver) {
  remotePullObserver = observer;
}

async function pullRemoteStateDirectly(): Promise<boolean> {
  const state = Database.getState();
  const matriz = state.companies?.find((c) => c.type === 'matriz') || state.companies?.[0];
  const targetCompId = matriz?.id || 'comp-matriz';
  const docPath = `erp_sync/${targetCompId}`;

  try {
    const snap = await getDoc(doc(db, 'erp_sync', targetCompId));
    if (snap.exists()) {
      const data = snap.data();
      if (data && data.state) {
        if (remotePullObserver) {
          remotePullObserver(
            data.state as DatabaseState,
            data.registeredCompanyIds && typeof data.registeredCompanyIds === 'object'
              ? (data.registeredCompanyIds as Record<string, boolean>)
              : null
          );
        }
        Database.reconcileWithRemote(data.state as DatabaseState, data.updatedAt);
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn(`Aviso ao consultar sincronização (${docPath}) no Firestore:`, err);
    return false;
  }
}

/**
 * Provisiona uma conta real no Firebase Authentication e documento /users/{uid} via app secundária
 * sem encerrar a sessão atual do Administrador Master (romeujr.suporte@gmail.com).
 */
export async function provisionFirebaseAuthForUser(
  user: User,
  rawPassword: string
): Promise<string> {
  if (!auth.currentUser) {
    throw new Error('Sessão do Firebase Authentication não encontrada. Faça login novamente com romeujr.suporte@gmail.com.');
  }

  const currentAuthEmail = (auth.currentUser.email || '').trim().toLowerCase();
  if (currentAuthEmail !== MASTER_ADMIN_EMAIL.toLowerCase()) {
    throw new Error(
      `Apenas o Administrador Master (${MASTER_ADMIN_EMAIL}) pode criar novos usuários no Firebase Authentication.`
    );
  }

  const fbEmail = (user.email || '').trim().toLowerCase();
  if (!isValidGoogleAccountEmail(fbEmail)) {
    throw new Error(
      'Informe uma conta Google válida (@gmail.com ou @googlemail.com) para criar o acesso no Firebase Authentication.'
    );
  }

  const fbPassword = (rawPassword || '').trim();
  if (fbPassword.length < 6) {
    throw new Error('A senha inicial deve possuir no mínimo 6 caracteres para criação no Firebase Authentication.');
  }

  const secondaryAppName = 'erp-user-provisioner';
  let secondaryApp: FirebaseApp | null = null;
  let uid = '';

  try {
    const existingApp = getApps().find((a) => a.name === secondaryAppName);
    secondaryApp = existingApp || initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, fbEmail, fbPassword);
      if (!cred.user?.uid) {
        throw new Error('O Firebase Authentication não retornou o UID do novo usuário.');
      }
      await updateProfile(cred.user, { displayName: user.name });
      uid = cred.user.uid;
      await signOut(secondaryAuth);
    } catch (authErr: any) {
      const code = authErr?.code || '';
      if (code === 'auth/email-already-in-use') {
        // Caso a conta Google já exista no Firebase Auth (ex: usuário recriado), tenta vincular com a senha informada
        try {
          const existingCred = await signInWithEmailAndPassword(secondaryAuth, fbEmail, fbPassword);
          if (!existingCred.user?.uid) {
            throw new Error('Não foi possível obter o UID da conta existente.');
          }
          await updateProfile(existingCred.user, { displayName: user.name });
          uid = existingCred.user.uid;
          await signOut(secondaryAuth);
        } catch {
          throw new Error(
            `A conta Google "${fbEmail}" já está cadastrada no Firebase Authentication com outra senha. Informe a senha atual dessa conta ou solicite a redefinição de senha na tela de login.`
          );
        }
      } else if (code === 'auth/invalid-email') {
        throw new Error('O endereço de e-mail Google informado é inválido.');
      } else if (code === 'auth/weak-password') {
        throw new Error('A senha informada é muito fraca. Utilize no mínimo 6 caracteres.');
      } else if (code === 'auth/operation-not-allowed') {
        throw new Error('O provedor E-mail/Senha não está habilitado no Firebase Authentication deste projeto.');
      } else if (code === 'auth/network-request-failed') {
        throw new Error('Falha de conexão com o Firebase Authentication. Verifique sua internet e tente novamente.');
      } else {
        throw new Error(authErr?.message || 'Erro ao criar usuário no Firebase Authentication.');
      }
    }
  } finally {
    if (secondaryApp) {
      try {
        await deleteApp(secondaryApp);
      } catch {
        // ignore
      }
    }
  }

  // Grava o perfil /users/{uid} usando a sessão autenticada do Administrador Master atual
  const profilePayload = buildUserProfilePayload(uid, { ...user, email: fbEmail, firebaseUid: uid }, fbEmail);
  try {
    await setDoc(doc(db, 'users', uid), profilePayload, { merge: true });
  } catch (firestoreErr: any) {
    throw new Error(
      `Usuário criado no Firebase Authentication (${fbEmail}), mas o Firestore recusou a gravação do perfil /users/${uid}. Verifique as regras de segurança publicadas.`
    );
  }

  return uid;
}

/**
 * Atualiza status, nome ou papel RBAC do documento /users/{uid} quando alterado pelo Admin Master em Configurações
 */
export async function syncUserProfileStatusRoleInFirestore(user: User): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('Sessão Firebase não autenticada para atualizar o perfil no Firestore.');
  }
  const targetUid = user.firebaseUid || (user.id === 'usr-admin' ? auth.currentUser.uid : undefined);
  if (!targetUid) return;

  const fbEmail = resolveUserFirebaseEmail(user.email || user.login, user);
  const docPath = `users/${targetUid}`;
  try {
    const docRef = doc(db, 'users', targetUid);
    const snap = await getDoc(docRef);
    const existingData = snap.exists() ? (snap.data() as Partial<UserProfileDoc>) : undefined;
    const payload = buildUserProfilePayload(targetUid, user, fbEmail, existingData?.createdAt);
    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

/**
 * Atualiza a senha do usuário atualmente logado no Firebase Authentication
 */
export async function updateFirebaseAuthPassword(newRawPassword: string): Promise<boolean> {
  if (!auth.currentUser) return false;
  try {
    await updatePassword(auth.currentUser, formatFirebaseAuthPassword(newRawPassword));
    return true;
  } catch (err: any) {
    console.warn('Firebase Auth: aviso ao atualizar senha na nuvem:', err?.message || err);
    return false;
  }
}

/**
 * Solicita o envio do link oficial de redefinição de senha exclusivamente via Firebase Authentication.
 * Não consulta nem altera senhas em Firestore, localStorage ou state.users, e não cria novos usuários.
 */
export async function requestFirebasePasswordReset(emailInput: string): Promise<string> {
  const cleanEmail = emailInput.trim().toLowerCase();

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Informe um endereço de e-mail válido para solicitar a recuperação de senha.');
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Sem conexão com a internet. Conecte-se para solicitar a redefinição de senha.');
  }

  try {
    auth.languageCode = 'pt';
    await sendPasswordResetEmail(auth, cleanEmail);
    return cleanEmail;
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/user-not-found') {
      // Evita enumeração de contas e não cria usuário automaticamente
      return cleanEmail;
    }
    if (code === 'auth/invalid-email') {
      throw new Error('O endereço de e-mail informado é inválido.');
    }
    if (code === 'auth/too-many-requests') {
      throw new Error('Muitas solicitações seguidas. Aguarde alguns instantes antes de tentar novamente.');
    }
    if (code === 'auth/network-request-failed') {
      throw new Error('Falha de conexão ao contatar o Firebase Authentication. Verifique sua internet e tente novamente.');
    }
    throw new Error(err?.message || 'Não foi possível solicitar o e-mail de recuperação de senha.');
  }
}

/**
 * Autentica o usuário pelo seu Login (@login) ou E-mail e Senha criados.
 * Autentica no Firebase Auth, sincroniza com o Cloud Firestore e valida permissões/status.
 */
export async function loginWithSystemCredentials(
  loginOrEmail: string,
  passwordInput: string,
  rememberMe: boolean = true
): Promise<User> {
  const cleanIdentifier = loginOrEmail.trim().toLowerCase().replace(/^@/, '');
  const cleanPassword = passwordInput.trim();

  if (!cleanIdentifier) {
    throw new Error('Informe seu usuário ou e-mail de acesso.');
  }
  if (!cleanPassword) {
    throw new Error('Informe sua senha de acesso.');
  }

  // Carrega o estado local do Database
  const state = Database.getState();
  if (!state.users || state.users.length === 0) {
    Database.load();
  }

  const localUsers = Database.getState().users;
  let localMatchedUser = localUsers.find((u) => {
    const userLogin = (u.login || '').trim().toLowerCase().replace(/^@/, '');
    const userEmail = (u.email || '').trim().toLowerCase();
    return userLogin === cleanIdentifier || userEmail === cleanIdentifier;
  });

  const isMasterIdentifier =
    cleanIdentifier === 'admin' || cleanIdentifier === MASTER_ADMIN_EMAIL.toLowerCase();

  // Se o usuário existe localmente com status inativo, bloqueia antes mesmo da rede
  if (localMatchedUser && localMatchedUser.status === 'inativo') {
    throw new Error(`O usuário @${localMatchedUser.login} está desativado pelo administrador.`);
  }

  const fbEmail = resolveUserFirebaseEmail(cleanIdentifier, localMatchedUser);
  const fbPassword = formatFirebaseAuthPassword(cleanPassword);

  let firebaseSignedIn = false;
  let isNetworkOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (!isNetworkOffline) {
    try {
      await signInWithEmailAndPassword(auth, fbEmail, fbPassword);
      firebaseSignedIn = true;
    } catch (authErr: any) {
      const code = authErr?.code || '';

      if (code === 'auth/network-request-failed') {
        isNetworkOffline = true;
      } else if (
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password'
      ) {
        throw new Error('Usuário ou senha incorretos.');
      } else if (code === 'auth/too-many-requests') {
        throw new Error('Muitas tentativas de login. Aguarde alguns instantes e tente novamente.');
      } else {
        throw new Error(authErr?.message || 'Falha ao autenticar no Firebase Authentication.');
      }
    }
  }

  // Sem conexão com a internet: não há armazenamento local de senhas em texto claro
  if (!firebaseSignedIn && isNetworkOffline) {
    throw new Error('Sem conexão com a internet. Conecte-se para validar suas credenciais no Firebase Authentication.');
  }

  // Após autenticar no Firebase Auth, garante documento /users/{uid} e puxa dados do Cloud Firestore
  const currentFbUser = auth.currentUser;
  let existingProfileCreatedAt: string | undefined;
  let existingFirestoreProfile: Partial<UserProfileDoc> | undefined;

  if (currentFbUser) {
    const profileCheck = await ensureUserProfileDocBeforePull(currentFbUser.uid, fbEmail, localMatchedUser);
    existingProfileCreatedAt = profileCheck.existingCreatedAt;
    existingFirestoreProfile = profileCheck.existingProfile;

    if (profileCheck.existingStatus === 'inativo') {
      await signOut(auth);
      throw new Error('Este usuário está desativado pelo administrador.');
    }

    if (!profileCheck.profileExists && !isMasterIdentifier) {
      await signOut(auth);
      throw new Error('Perfil de usuário não provisionado no Firestore. Solicite ao Administrador Master o cadastro do seu acesso.');
    }

    // Puxa o estado oficial mais recente do Firestore para suportar troca de computador/celular
    await pullRemoteStateDirectly();
  }

  // Reconsulta os usuários após reconciliação com o Firestore
  const syncedUsers = Database.getState().users;
  let targetUser = syncedUsers.find((u) => {
    const userLogin = (u.login || '').trim().toLowerCase().replace(/^@/, '');
    const userEmail = (u.email || '').trim().toLowerCase();
    return (
      (currentFbUser?.uid && u.firebaseUid === currentFbUser.uid) ||
      userEmail === fbEmail.toLowerCase() ||
      userLogin === cleanIdentifier ||
      userEmail === cleanIdentifier
    );
  });

  // Garante o usuário Admin Master caso o banco esteja zerado inicialmente
  if (!targetUser && isMasterIdentifier) {
    targetUser = {
      id: 'usr-admin',
      name: 'Administrador Geral',
      login: 'admin',
      role: 'admin',
      companyId: Database.getCurrentCompany().id,
      status: 'ativo',
      email: MASTER_ADMIN_EMAIL,
      firebaseUid: currentFbUser?.uid,
      permissions: {
        canViewCosts: true,
        canEditProducts: true,
        canDeleteRecords: true,
        canCancelSales: true,
        canAuthorizeDiscount: true,
        maxDiscountPercent: 100,
        canAccessFinancial: true,
        canAccessProduction: true,
        canAccessPurchases: true,
        canManageUsers: true,
        canAdjustStock: true,
        canCloseCashRegister: true,
        canViewGrossProfit: true,
        canViewNetProfit: true,
        canViewTotalRevenue: true,
        canViewProfitMargin: true,
        canViewProductCosts: true,
        canViewCashBalances: true,
      },
    };
    Database.getState().users.unshift(targetUser);
    Database.persist();
  }

  // Caso o usuário já possua perfil aprovado em /users/{uid} no Firestore, mas ainda não conste no espelho erp_sync local
  if (!targetUser && currentFbUser && existingFirestoreProfile && existingFirestoreProfile.status === 'ativo') {
    const profileRole: UserRole = existingFirestoreProfile.role || 'balconista';
    const fallbackLogin =
      existingFirestoreProfile.login ||
      (cleanIdentifier.includes('@') ? cleanIdentifier.split('@')[0] : cleanIdentifier);
    const finDefaults = DEFAULT_ROLE_FINANCIAL_PERMISSIONS[profileRole] || DEFAULT_ROLE_FINANCIAL_PERMISSIONS.balconista;
    const menuDefaults = DEFAULT_ROLE_MENU_SECTIONS[profileRole] || DEFAULT_ROLE_MENU_SECTIONS.balconista;
    const subDefaults = DEFAULT_ROLE_SUB_ITEMS[profileRole] || DEFAULT_ROLE_SUB_ITEMS.balconista;
    const isBalconistaRole = profileRole === 'balconista';

    targetUser = {
      id: existingFirestoreProfile.erpUserId || `usr-${currentFbUser.uid.slice(0, 12)}`,
      name: existingFirestoreProfile.name || currentFbUser.displayName || fallbackLogin,
      login: fallbackLogin,
      email: existingFirestoreProfile.email || fbEmail,
      role: profileRole,
      companyId: existingFirestoreProfile.companyId || Database.getCurrentCompany().id,
      status: 'ativo',
      firebaseUid: currentFbUser.uid,
      updatedAt: new Date().toISOString(),
      permissions: {
        canViewCosts: profileRole === 'admin' || profileRole === 'gerente' || profileRole === 'financeiro',
        canEditProducts: profileRole === 'admin' || profileRole === 'gerente',
        canDeleteRecords: profileRole === 'admin',
        canCancelSales: profileRole !== 'vendedor_externo',
        canAuthorizeDiscount: profileRole === 'admin' || profileRole === 'gerente' || profileRole === 'financeiro',
        maxDiscountPercent: profileRole === 'admin' ? 30 : profileRole === 'gerente' ? 20 : profileRole === 'financeiro' ? 15 : 10,
        canAccessFinancial: profileRole === 'admin' || profileRole === 'gerente' || profileRole === 'financeiro',
        canAccessProduction: profileRole === 'admin' || profileRole === 'gerente',
        canAccessPurchases: profileRole === 'admin' || profileRole === 'gerente' || profileRole === 'financeiro',
        canManageUsers: profileRole === 'admin',
        canAdjustStock: profileRole === 'admin' || profileRole === 'gerente',
        canCloseCashRegister: profileRole !== 'vendedor_externo',
        canViewGrossProfit: isBalconistaRole ? false : finDefaults.canViewGrossProfit,
        canViewNetProfit: isBalconistaRole ? false : finDefaults.canViewNetProfit,
        canViewTotalRevenue: isBalconistaRole ? false : finDefaults.canViewTotalRevenue,
        canViewProfitMargin: isBalconistaRole ? false : finDefaults.canViewProfitMargin,
        canViewProductCosts: isBalconistaRole ? false : finDefaults.canViewProductCosts,
        canViewCashBalances: isBalconistaRole ? false : finDefaults.canViewCashBalances,
        allowedMenuSections: [...menuDefaults],
        allowedSubItems: isBalconistaRole
          ? subDefaults.filter((s) => s !== 'dashboard')
          : [...subDefaults],
      },
    };
    Database.getState().users.push(targetUser);
  }

  if (!targetUser) {
    await signOut(auth);
    throw new Error(`Usuário "@${cleanIdentifier}" não encontrado no cadastro do sistema.`);
  }

  if (targetUser.status === 'inativo') {
    await signOut(auth);
    throw new Error(`O usuário @${targetUser.login} está desativado pelo administrador.`);
  }

  // Sincroniza documento /users/{uid} no Firestore com o papel/status atualizado
  if (currentFbUser) {
    try {
      const userDocRef = doc(db, 'users', currentFbUser.uid);
      const profilePayload = buildUserProfilePayload(
        currentFbUser.uid,
        targetUser,
        fbEmail,
        existingProfileCreatedAt
      );
      if (fbEmail.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) {
        await setDoc(userDocRef, profilePayload, { merge: true });
      } else if (existingProfileCreatedAt) {
        const safeName = (targetUser.name || fbEmail || 'Usuário').trim().slice(0, 128);
        const safePhone = targetUser.phone ? targetUser.phone.trim().slice(0, 64) : '';
        await updateDoc(userDocRef, {
          name: safeName,
          updatedAt: new Date().toISOString(),
          ...(safePhone ? { phone: safePhone } : {}),
        });
      }
    } catch (err) {
      console.warn('Aviso ao sincronizar perfil no Firestore:', err);
    }
  }

  // Garante normalização apenas para Administrador sem mutar state.users para demais perfis
  const normalizedResult = Database.normalizeUsersList(Database.getState().users);
  if (normalizedResult.changed && targetUser.role === 'admin') {
    Database.getState().users = normalizedResult.users;
    targetUser = normalizedResult.users.find((u) => u.id === targetUser!.id) || targetUser;
  }

  // Vincula firebaseUid apenas se for admin para respeitar exclusividade de alteração em state.users
  if (currentFbUser && !targetUser.firebaseUid && targetUser.role === 'admin') {
    targetUser.firebaseUid = currentFbUser.uid;
    targetUser.updatedAt = new Date().toISOString();
  }

  // Define a sessão ativa no Database e garante que a empresa selecionada corresponda às empresas autorizadas do usuário
  Database.setCurrentUser(targetUser.id);
  Database.ensureValidCurrentCompanyForUser(targetUser, {
    preferUserLinkedCompany: true,
    skipPersist: true,
  });
  Database.setSessionAuthenticated(true, rememberMe);
  Database.persist();

  Database.addAuditLog(
    'LOGIN_SISTEMA',
    'AUTENTICACAO',
    targetUser.id,
    `Usuário ${targetUser.name} (@${targetUser.login}) autenticado com sucesso no sistema (Perfil: ${targetUser.role.toUpperCase()}).`
  );

  return targetUser;
}

export interface DiscountAuthorizerVerificationResult {
  ok: boolean;
  errorCode?: 'INVALID_CREDENTIALS' | 'UNAUTHORIZED_ROLE' | 'AUTH_FAILED';
  message: string;
  authorizer?: AuthorizerProfileInfo;
}

/**
 * Autentica um usuário autorizador (Administrador Acesso Total ou Gerente Geral)
 * utilizando uma instância secundária e temporária do Firebase Authentication + Firestore,
 * sem encerrar nem alterar a sessão do vendedor/caixa atualmente logado e sem armazenar senhas.
 */
export async function verifyDiscountAuthorizerCredentials(
  loginOrEmail: string,
  passwordInput: string
): Promise<DiscountAuthorizerVerificationResult> {
  const cleanIdentifier = (loginOrEmail || '').trim().toLowerCase().replace(/^@/, '');
  const cleanPassword = (passwordInput || '').trim();

  if (!cleanIdentifier || !cleanPassword) {
    return {
      ok: false,
      errorCode: 'INVALID_CREDENTIALS',
      message: 'Informe usuário (ou e-mail) e senha do autorizador.',
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      errorCode: 'AUTH_FAILED',
      message: 'Falha na autenticação: sem conexão com a internet para validar as credenciais no Firebase Authentication.',
    };
  }

  const localUsers = Database.getState().users || [];
  const localMatchedUser = localUsers.find((u) => {
    const uLogin = (u.login || '').trim().toLowerCase().replace(/^@/, '');
    const uEmail = (u.email || '').trim().toLowerCase();
    return uLogin === cleanIdentifier || uEmail === cleanIdentifier;
  });

  const fbEmail = resolveUserFirebaseEmail(cleanIdentifier, localMatchedUser);
  const fbPassword = formatFirebaseAuthPassword(cleanPassword);

  const secondaryAppName = `erp-discount-auth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let secondaryApp: FirebaseApp | null = null;
  let authedUid = '';
  let authedEmail = fbEmail;
  let authedDisplayName = '';
  let firestoreProfile: Partial<UserProfileDoc> | null = null;

  try {
    secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);
    const secondaryDb =
      configuredDatabaseId && configuredDatabaseId !== '(default)'
        ? getFirestore(secondaryApp, configuredDatabaseId)
        : getFirestore(secondaryApp);

    try {
      const cred = await signInWithEmailAndPassword(secondaryAuth, fbEmail, fbPassword);
      if (!cred.user?.uid) {
        return {
          ok: false,
          errorCode: 'AUTH_FAILED',
          message: 'Falha na autenticação: não foi possível confirmar a identidade do autorizador.',
        };
      }
      authedUid = cred.user.uid;
      authedEmail = (cred.user.email || fbEmail).trim().toLowerCase();
      authedDisplayName = cred.user.displayName || '';

      try {
        const snap = await getDoc(doc(secondaryDb, 'users', authedUid));
        if (snap.exists()) {
          firestoreProfile = snap.data() as Partial<UserProfileDoc>;
        }
      } catch (profileErr) {
        console.warn('Aviso ao consultar perfil /users/{uid} do autorizador:', profileErr);
      }

      await signOut(secondaryAuth);
    } catch (authErr: any) {
      const code = authErr?.code || '';
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-email'
      ) {
        return {
          ok: false,
          errorCode: 'INVALID_CREDENTIALS',
          message: 'Usuário ou senha inválidos.',
        };
      }
      if (code === 'auth/too-many-requests') {
        return {
          ok: false,
          errorCode: 'AUTH_FAILED',
          message: 'Falha na autenticação: muitas tentativas consecutivas. Aguarde alguns instantes e tente novamente.',
        };
      }
      if (code === 'auth/network-request-failed') {
        return {
          ok: false,
          errorCode: 'AUTH_FAILED',
          message: 'Falha na autenticação: erro de rede ao contatar o Firebase Authentication.',
        };
      }
      return {
        ok: false,
        errorCode: 'AUTH_FAILED',
        message: 'Falha na autenticação. Verifique a conexão e tente novamente.',
      };
    }
  } catch {
    return {
      ok: false,
      errorCode: 'AUTH_FAILED',
      message: 'Falha na autenticação ao inicializar a verificação segura.',
    };
  } finally {
    if (secondaryApp) {
      try {
        await deleteApp(secondaryApp);
      } catch {
        // ignore cleanup error
      }
    }
  }

  // Localiza o cadastro completo no ERP pelo UID, e-mail autenticado ou login
  const matchedErpUser =
    localUsers.find((u) => u.firebaseUid && u.firebaseUid === authedUid) ||
    localUsers.find((u) => (u.email || '').trim().toLowerCase() === authedEmail) ||
    localMatchedUser ||
    null;

  // Validação estrita de perfil e permissões reais (nunca confia no nome/texto exibido)
  const isPermitted = canUserAuthorizeProductDiscount(
    matchedErpUser,
    firestoreProfile,
    authedEmail
  );

  if (!isPermitted) {
    return {
      ok: false,
      errorCode: 'UNAUTHORIZED_ROLE',
      message:
        'Usuário sem permissão para autorizar. Somente Administrador (Acesso Total) ou Gerente Geral ativos podem liberar descontos acima do limite.',
    };
  }

  const effectiveRole: 'admin' | 'gerente' =
    authedEmail === MASTER_ADMIN_EMAIL.toLowerCase() ||
    matchedErpUser?.role === 'admin' ||
    firestoreProfile?.role === 'admin'
      ? 'admin'
      : 'gerente';

  return {
    ok: true,
    message: 'Autorização concedida.',
    authorizer: {
      id: matchedErpUser?.id || firestoreProfile?.erpUserId || authedUid,
      name: matchedErpUser?.name || firestoreProfile?.name || authedDisplayName || cleanIdentifier,
      login: matchedErpUser?.login || firestoreProfile?.login || cleanIdentifier,
      email: authedEmail,
      role: effectiveRole,
    },
  };
}

/**
 * Remove o documento de perfil do usuário na coleção /users do Firestore (apenas Admin Master)
 */
export async function deleteUserProfileInFirestore(targetUserId: string, firebaseUid?: string): Promise<void> {
  if (!auth.currentUser) return;
  const docId = firebaseUid || targetUserId;
  if (!docId || auth.currentUser.uid === docId) return;

  const docPath = `users/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', docId));
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    } catch (loggedErr) {
      console.warn('Firestore: aviso ao excluir perfil do usuário:', loggedErr);
    }
  }
}

/**
 * Realiza o encerramento da sessão (Logout)
 */
export async function logoutFirebase(): Promise<void> {
  clearCachedFirestoreUserProfile();
  try {
    await signOut(auth);
  } catch (err) {
    console.warn("Erro ao fazer signOut no Firebase:", err);
  }
  Database.logout();
}

/**
 * Observa alterações de autenticação do Firebase
 */
export function onFirebaseAuthStateChanged(callback: (user: User | null, loading: boolean) => void): () => void {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const state = Database.getState();
      const fbEmail = (firebaseUser.email || '').trim().toLowerCase();
      const matchedUser =
        state.users.find((u) => u.firebaseUid === firebaseUser.uid) ||
        state.users.find((u) => (u.email || '').trim().toLowerCase() === fbEmail && fbEmail !== '') ||
        (fbEmail === MASTER_ADMIN_EMAIL.toLowerCase()
          ? state.users.find((u) => u.login === 'admin' || u.id === 'usr-admin')
          : undefined);

      if (matchedUser && matchedUser.status === 'inativo') {
        clearCachedFirestoreUserProfile();
        await signOut(auth);
        Database.logout();
        callback(null, false);
        return;
      }

      if (matchedUser) {
        if (state.currentUserId !== matchedUser.id) {
          Database.setCurrentUser(matchedUser.id);
        }
        Database.ensureValidCurrentCompanyForUser(matchedUser, { skipPersist: true });
        Database.setSessionAuthenticated(true);
        callback(matchedUser, false);
      } else {
        // Aguarda pullRemoteStateDirectly/ensureUserProfileDocBeforePull resolver o usuário real sem assumir usr-admin
        callback(null, false);
      }
    } else {
      clearCachedFirestoreUserProfile();
      // Se offline, mantém sessão local autenticada somente se já ativa na sessão
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (isOffline && Database.isSessionAuthenticated()) {
        callback(Database.getCurrentUser(), false);
      } else if (Database.isSessionAuthenticated()) {
        callback(Database.getCurrentUser(), false);
      } else {
        callback(null, false);
      }
    }
  });
}
