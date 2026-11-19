import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  db,
  auth,
  MASTER_ADMIN_EMAIL,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
  registerRemotePullObserver,
  getCachedFirestoreUserProfile,
  fetchFirestoreUserProfile,
} from './firebase';
import { Database, DatabaseState } from './db';
import { UserRole } from '../types';

export interface FirebaseSyncStatus {
  status: 'connected' | 'syncing' | 'offline' | 'error';
  lastSyncAt: string | null;
  lastError: string | null;
  activeCompanyId: string;
}

const VALID_ERP_SYNC_STATE_KEYS = new Set<keyof DatabaseState>([
  'companies',
  'users',
  'deletedUserIds',
  'currentCompanyId',
  'currentUserId',
  'stockLocations',
  'products',
  'components',
  'stockBalances',
  'stockMovements',
  'customers',
  'suppliers',
  'orders',
  'cashRegisters',
  'accountsReceivable',
  'accountsPayable',
  'purchaseOrders',
  'purchaseReceipts',
  'productionOrders',
  'transferOrders',
  'inventoryCounts',
  'auditLogs',
  'auditLogsClearedAt',
  'printerConfig',
  'hideOverdueAlert',
  'stockControlConfig',
  'paymentMethods',
  'financialAccounts',
  'paymentTermsList',
  'sidebarMenuConfig',
  'deliveryRoutes',
  'deliveryDrivers',
  'deliveryVehicles',
  'deliveryManifests',
  'marketAreas',
  'states',
  'cities',
  'neighborhoods',
  'companyStockTransfers',
  'chartOfAccounts',
  'nfeImportHistory',
  'supplierProductMappings',
  'salesReturns',
  'customerVouchers',
]);

// Chaves permitidas em state para cada perfil RBAC (espelho exato de firestore.rules)
const GERENTE_WRITABLE_KEYS = new Set<keyof DatabaseState>([
  'currentCompanyId',
  'currentUserId',
  'stockLocations',
  'products',
  'components',
  'stockBalances',
  'stockMovements',
  'customers',
  'suppliers',
  'orders',
  'cashRegisters',
  'accountsReceivable',
  'accountsPayable',
  'purchaseOrders',
  'purchaseReceipts',
  'productionOrders',
  'transferOrders',
  'inventoryCounts',
  'auditLogs',
  'printerConfig',
  'hideOverdueAlert',
  'stockControlConfig',
  'paymentMethods',
  'financialAccounts',
  'paymentTermsList',
  'deliveryRoutes',
  'deliveryDrivers',
  'deliveryVehicles',
  'deliveryManifests',
  'marketAreas',
  'states',
  'cities',
  'neighborhoods',
  'companyStockTransfers',
  'chartOfAccounts',
  'nfeImportHistory',
  'supplierProductMappings',
  'salesReturns',
  'customerVouchers',
]);

const FINANCEIRO_WRITABLE_KEYS = new Set<keyof DatabaseState>([
  'accountsReceivable',
  'accountsPayable',
  'cashRegisters',
  'financialAccounts',
  'chartOfAccounts',
  'paymentMethods',
  'paymentTermsList',
  'customerVouchers',
  'customers',
  'suppliers',
  'purchaseOrders',
  'purchaseReceipts',
  'nfeImportHistory',
  'supplierProductMappings',
  'products',
  'stockBalances',
  'stockMovements',
  'auditLogs',
  'currentCompanyId',
  'currentUserId',
  'printerConfig',
  'hideOverdueAlert',
]);

const BALCONISTA_WRITABLE_KEYS = new Set<keyof DatabaseState>([
  'orders',
  'customers',
  'stockBalances',
  'stockMovements',
  'cashRegisters',
  'accountsReceivable',
  'salesReturns',
  'auditLogs',
  'currentCompanyId',
  'currentUserId',
  'printerConfig',
  'hideOverdueAlert',
]);

const VENDEDOR_EXTERNO_WRITABLE_KEYS = new Set<keyof DatabaseState>([
  'orders',
  'customers',
  'stockBalances',
  'stockMovements',
  'accountsReceivable',
  'salesReturns',
  'auditLogs',
  'currentCompanyId',
  'currentUserId',
  'printerConfig',
  'hideOverdueAlert',
]);

function getWritableKeysForRole(
  role: UserRole | undefined,
  actorCompanyId: string | undefined,
  rootCompanyId: string
): Set<keyof DatabaseState> {
  if (role === 'gerente') {
    const keys = new Set(GERENTE_WRITABLE_KEYS);
    if (actorCompanyId && actorCompanyId === rootCompanyId) {
      keys.add('companies');
    }
    return keys;
  }
  if (role === 'financeiro') {
    return new Set(FINANCEIRO_WRITABLE_KEYS);
  }
  if (role === 'vendedor_externo') {
    return new Set(VENDEDOR_EXTERNO_WRITABLE_KEYS);
  }
  return new Set(BALCONISTA_WRITABLE_KEYS);
}

/**
 * Remove recursivamente campos 'undefined' para evitar erros na serialização do Firestore
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForFirestore(item));
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        cleaned[key] = sanitizeForFirestore(val);
      }
    }
    return cleaned;
  }
  return obj;
}

function cloneValue<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== 'object') {
    return val;
  }
  return JSON.parse(JSON.stringify(val));
}

function sanitizeStateKeysForFirestore(stateObj: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const key of Object.keys(stateObj)) {
    if (!VALID_ERP_SYNC_STATE_KEYS.has(key as keyof DatabaseState)) continue;
    const val = stateObj[key];
    if (val === undefined || val === null) continue;
    sanitized[key] = sanitizeForFirestore(val);
  }
  return sanitized;
}

/**
 * Retorna sempre o ID raiz da empresa Matriz para centralizar a sincronização
 * mesmo quando o operador alterna a visualização para uma filial.
 */
function getSyncRootCompanyId(): string {
  const state = Database.getState();
  const matriz = state.companies?.find((c) => c.type === 'matriz') || state.companies?.[0];
  return matriz?.id || 'comp-matriz';
}

/**
 * Constrói o mapa de empresas/filiais válidas e únicas (id -> ativo: boolean)
 * para validação direta nas regras de segurança do Firestore.
 */
export function buildRegisteredCompanyIds(
  companies: DatabaseState['companies'] | undefined,
  rootCompanyId: string = 'comp-matriz'
): Record<string, boolean> {
  const registry: Record<string, boolean> = {};
  const validIdPattern = /^comp-[a-zA-Z0-9_-]{1,120}$/;

  if (Array.isArray(companies)) {
    for (const comp of companies) {
      if (comp && typeof comp.id === 'string' && validIdPattern.test(comp.id)) {
        if (!(comp.id in registry)) {
          registry[comp.id] = comp.status !== 'inativo';
        }
      }
    }
  }

  registry[rootCompanyId] = true;
  return registry;
}

/**
 * Remove qualquer campo de senha em texto claro de uma lista de usuários sem alterar os demais dados
 */
export function stripLegacyPasswordsFromUsers(users: DatabaseState['users'] | undefined): {
  users: DatabaseState['users'];
  hadLegacyPasswords: boolean;
} {
  let hadLegacyPasswords = false;
  const cleaned = (users || []).map((userItem) => {
    if (userItem && 'password' in userItem) {
      hadLegacyPasswords = true;
      const { password: _removedPassword, ...userWithoutPassword } = userItem;
      return userWithoutPassword;
    }
    return userItem;
  });
  return { users: cleaned as DatabaseState['users'], hadLegacyPasswords };
}

/**
 * Monta o payload oficial de escrita em /erp_sync/{companyId} garantindo:
 * 1) Remoção de 'password' em qualquer posição de state.users
 * 2) Exclusividade de alteração de state.users e registeredCompanyIds para Administrador
 * 3) Preservação integral dos campos remotos não permitidos ao perfil RBAC atual
 */
export function prepareErpSyncPayload(params: {
  rawState: DatabaseState;
  companyId: string;
  updatedByUid: string;
  isCurrentAdmin: boolean;
  actorRole?: UserRole;
  actorCompanyId?: string;
  lastRemoteStateSnapshot?: Record<string, any> | null;
  lastRemoteUsersSnapshot: DatabaseState['users'] | null;
  lastRemoteRegisteredCompanyIds: Record<string, boolean> | null;
}): {
  payload: Record<string, any>;
  sanitizedUsers: DatabaseState['users'];
  registeredCompanyIds: Record<string, boolean> | null;
  hasWritableChanges: boolean;
} {
  const {
    rawState,
    companyId,
    updatedByUid,
    isCurrentAdmin,
    actorRole,
    actorCompanyId,
    lastRemoteStateSnapshot,
    lastRemoteUsersSnapshot,
    lastRemoteRegisteredCompanyIds,
  } = params;

  const usersSource =
    !isCurrentAdmin && lastRemoteUsersSnapshot
      ? lastRemoteUsersSnapshot
      : rawState.users;
  const { users: sanitizedUsers } = stripLegacyPasswordsFromUsers(usersSource);

  let finalState: Record<string, any>;
  let hasWritableChanges = true;

  if (isCurrentAdmin || !lastRemoteStateSnapshot) {
    const cleanState: Partial<DatabaseState> = {
      ...rawState,
      users: sanitizedUsers,
      auditLogs: (rawState.auditLogs || []).slice(0, 60),
      stockMovements: (rawState.stockMovements || []).slice(0, 150),
    };
    finalState = sanitizeStateKeysForFirestore(cleanState);
  } else {
    // Para operadores não-administradores com setDoc(..., { merge: true }),
    // envia SOMENTE as chaves graváveis do perfil RBAC que realmente mudaram,
    // preservando integralmente no servidor users, companies protegidas,
    // deletedUserIds, sidebarMenuConfig, auditLogsClearedAt e registeredCompanyIds.
    const writableKeys = getWritableKeysForRole(actorRole, actorCompanyId, companyId);
    const partialWritableState: Record<string, any> = {};
    let anyWritableDiff = false;

    for (const key of writableKeys) {
      let nextRawVal: any = (rawState as Record<string, any>)[key];
      if (key === 'auditLogs') {
        nextRawVal = (rawState.auditLogs || []).slice(0, 60);
      } else if (key === 'stockMovements') {
        nextRawVal = (rawState.stockMovements || []).slice(0, 150);
      }

      if (key === 'currentCompanyId') {
        if (typeof nextRawVal !== 'string' || !/^comp-[a-zA-Z0-9_-]{1,120}$/.test(nextRawVal)) {
          continue;
        }
      } else if (key === 'currentUserId') {
        if (typeof nextRawVal !== 'string' || nextRawVal.length > 128) {
          continue;
        }
      }

      if (nextRawVal !== undefined && nextRawVal !== null) {
        const sanitizedNext = sanitizeForFirestore(nextRawVal);
        const remoteVal = lastRemoteStateSnapshot[key];
        const prevSerialized = JSON.stringify(
          remoteVal !== undefined && remoteVal !== null ? sanitizeForFirestore(remoteVal) : null
        );
        const nextSerialized = JSON.stringify(sanitizedNext);
        if (prevSerialized !== nextSerialized) {
          anyWritableDiff = true;
          partialWritableState[key] = sanitizedNext;
        }
      }
    }

    hasWritableChanges = anyWritableDiff;
    finalState = partialWritableState;
  }

  const registeredCompanyIds = isCurrentAdmin
    ? buildRegisteredCompanyIds(rawState.companies, companyId)
    : null;

  const payload: Record<string, any> = {
    companyId,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedByUid,
    version: Date.now(),
    ...(isCurrentAdmin && registeredCompanyIds ? { registeredCompanyIds } : {}),
    state: finalState,
  };

  return { payload, sanitizedUsers, registeredCompanyIds, hasWritableChanges };
}

export class FirebaseSyncService {
  private static status: FirebaseSyncStatus = {
    status: 'offline',
    lastSyncAt: null,
    lastError: null,
    activeCompanyId: 'comp-matriz',
  };

  private static listeners: Array<(status: FirebaseSyncStatus) => void> = [];
  private static snapshotUnsubscribe: Unsubscribe | null = null;
  private static persistUnsubscribe: (() => void) | null = null;
  private static authUnsubscribe: (() => void) | null = null;
  private static syncDebounceTimer: any = null;
  private static isSyncingInProgress = false;
  private static inFlightSyncPromise: Promise<boolean> | null = null;
  private static isRemoteApplying = false;
  private static lastRemoteStateSnapshot: Record<string, any> | null = null;
  private static lastRemoteUsersSnapshot: DatabaseState['users'] | null = null;
  private static lastRemoteRegisteredCompanyIds: Record<string, boolean> | null = null;

  public static primeRemoteSnapshotCache(
    remoteState: DatabaseState | undefined,
    remoteRegisteredCompanyIds?: Record<string, boolean> | null
  ) {
    if (remoteState && typeof remoteState === 'object') {
      const clonedState = cloneValue(remoteState as Record<string, any>);
      if (Array.isArray(clonedState.users)) {
        const { users: cleanUsers } = stripLegacyPasswordsFromUsers(clonedState.users);
        clonedState.users = cleanUsers;
        this.lastRemoteUsersSnapshot = cloneValue(cleanUsers);
      }
      this.lastRemoteStateSnapshot = clonedState;
    }
    if (remoteRegisteredCompanyIds && typeof remoteRegisteredCompanyIds === 'object') {
      this.lastRemoteRegisteredCompanyIds = { ...remoteRegisteredCompanyIds };
    }
  }

  private static async resolveActorContext(rawState: DatabaseState): Promise<{
    isCurrentAdmin: boolean;
    hasFirestoreProfile: boolean;
    role: UserRole;
    companyId: string;
  }> {
    const fbUser = auth.currentUser;
    const fbEmail = (fbUser?.email || '').trim().toLowerCase();
    const isMasterEmail = fbEmail === MASTER_ADMIN_EMAIL.toLowerCase();

    if (isMasterEmail) {
      return {
        isCurrentAdmin: true,
        hasFirestoreProfile: true,
        role: 'admin',
        companyId: getSyncRootCompanyId(),
      };
    }

    let cachedProfile = fbUser?.uid ? getCachedFirestoreUserProfile(fbUser.uid) : null;
    if (
      fbUser?.uid &&
      (!cachedProfile || !cachedProfile.role || !cachedProfile.companyId || cachedProfile.status !== 'ativo')
    ) {
      cachedProfile = await fetchFirestoreUserProfile(fbUser.uid, true);
    }

    const matchedLocalUser = (rawState.users || []).find((u) => {
      if (fbUser?.uid && u.firebaseUid === fbUser.uid) return true;
      if (fbEmail && (u.email || '').trim().toLowerCase() === fbEmail) return true;
      return false;
    });

    const hasFirestoreProfile = Boolean(cachedProfile && cachedProfile.status === 'ativo');
    const role: UserRole =
      cachedProfile?.role || matchedLocalUser?.role || 'balconista';
    const companyId =
      cachedProfile?.companyId || matchedLocalUser?.companyId || '';

    return {
      isCurrentAdmin: hasFirestoreProfile && cachedProfile?.role === 'admin',
      hasFirestoreProfile,
      role,
      companyId,
    };
  }

  private static isCurrentSessionAdminQuick(_rawState: DatabaseState): boolean {
    const fbUser = auth.currentUser;
    const fbEmail = (fbUser?.email || '').trim().toLowerCase();
    if (fbEmail === MASTER_ADMIN_EMAIL.toLowerCase()) return true;

    const cachedProfile = fbUser?.uid ? getCachedFirestoreUserProfile(fbUser.uid) : null;
    if (cachedProfile?.role && cachedProfile?.status === 'ativo') {
      return cachedProfile.role === 'admin';
    }

    return false;
  }

  public static getStatus(): FirebaseSyncStatus {
    return { ...this.status };
  }

  public static subscribe(listener: (status: FirebaseSyncStatus) => void): () => void {
    this.listeners.push(listener);
    listener(this.getStatus());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private static notify() {
    const s = this.getStatus();
    this.listeners.forEach((fn) => {
      try {
        fn(s);
      } catch (err) {
        console.error('Erro em listener do FirebaseSyncService:', err);
      }
    });
  }

  /**
   * Inicializa o serviço de sincronização em tempo real com o Firestore
   */
  public static init(): () => void {
    testFirestoreConnection();
    registerRemotePullObserver((remoteState, remoteRegisteredCompanyIds) => {
      this.primeRemoteSnapshotCache(remoteState, remoteRegisteredCompanyIds);
    });

    // Escuta estado de autenticação
    this.authUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        this.status.status = 'connected';
        this.status.lastError = null;
        this.notify();
        this.startRealtimeSync();
      } else {
        this.stopRealtimeSync();
        this.lastRemoteStateSnapshot = null;
        this.lastRemoteUsersSnapshot = null;
        this.lastRemoteRegisteredCompanyIds = null;
        this.status.status = 'offline';
        this.notify();
      }
    });

    // Escuta alterações locais para sincronizar com o Firestore
    this.persistUnsubscribe = Database.onPersist(() => {
      if (this.isRemoteApplying) return;
      this.queueSyncToFirebase();
    });

    return () => {
      this.stop();
    };
  }

  /**
   * Encerra todos os listeners ativos
   */
  public static stop() {
    this.stopRealtimeSync();
    if (this.persistUnsubscribe) {
      this.persistUnsubscribe();
      this.persistUnsubscribe = null;
    }
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
      this.authUnsubscribe = null;
    }
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = null;
    }
  }

  /**
   * Inicia a escuta em tempo real da empresa raiz no Firestore
   */
  private static startRealtimeSync() {
    this.stopRealtimeSync();

    const companyId = getSyncRootCompanyId();
    this.status.activeCompanyId = companyId;

    const docPath = `erp_sync/${companyId}`;
    const docRef = doc(db, 'erp_sync', companyId);

    // Garante cache antecipado do perfil /users/{uid} em recarregamentos de página
    if (auth.currentUser?.uid) {
      fetchFirestoreUserProfile(auth.currentUser.uid).catch(() => {});
    }

    // Conecta o listener em tempo real (onSnapshot)
    this.snapshotUnsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          // Somente o Administrador pode criar o documento inicial /erp_sync/comp-matriz no Firestore zerado
          if (this.isCurrentSessionAdminQuick(Database.getState())) {
            this.syncToFirebase();
          }
          return;
        }

        const remoteData = snapshot.data();
        if (!remoteData || !remoteData.state) return;

        // Se houver reset de fábrica local pendente (apenas admin), garante envio antes de reconciliar
        if (Database.hasPendingFactoryReset() && this.isCurrentSessionAdminQuick(Database.getState())) {
          this.syncToFirebase(Database.getState(), true).catch(console.error);
          return;
        }

        const remoteState = remoteData.state as DatabaseState;
        const { users: cleanRemoteUsers, hadLegacyPasswords } = stripLegacyPasswordsFromUsers(remoteState.users);
        const remoteRegistered =
          remoteData.registeredCompanyIds && typeof remoteData.registeredCompanyIds === 'object'
            ? (remoteData.registeredCompanyIds as Record<string, boolean>)
            : null;
        this.primeRemoteSnapshotCache(remoteState, remoteRegistered);

        const isCurrentAdmin = this.isCurrentSessionAdminQuick(Database.getState());
        const needsCompanyDirectoryBackfill = !this.lastRemoteRegisteredCompanyIds;

        // Se a alteração remota foi gerada pelo próprio usuário atual nesta sessão e já temos cache remoto, ignora eco
        // (exceto se o Admin detectar senhas legadas ou índice de filiais ausente para higienização automática)
        const currentUid = auth.currentUser?.uid;
        if (
          remoteData.updatedBy &&
          currentUid &&
          remoteData.updatedBy === currentUid &&
          Database.hasRemoteSyncCache() &&
          !(isCurrentAdmin && (hadLegacyPasswords || needsCompanyDirectoryBackfill))
        ) {
          this.status.lastSyncAt = remoteData.updatedAt || new Date().toISOString();
          this.status.status = 'connected';
          this.notify();
          return;
        }

        // Aplica a reconciliação segura dos dados (já com state.users livre de senhas em texto claro)
        let shouldPushLocalChanges = false;
        try {
          this.isRemoteApplying = true;
          const cleanRemoteState: DatabaseState = {
            ...remoteState,
            users: cleanRemoteUsers,
          };
          const recResult = Database.reconcileWithRemote(cleanRemoteState, remoteData.updatedAt);
          this.status.lastSyncAt = remoteData.updatedAt || new Date().toISOString();
          this.status.status = 'connected';
          this.notify();
          // Somente Administrador executa reenvios automáticos de migração/backfill após reconciliação
          if (
            isCurrentAdmin &&
            (recResult.bahiaMigrated ||
              recResult.localUnsyncedChanges ||
              hadLegacyPasswords ||
              needsCompanyDirectoryBackfill)
          ) {
            shouldPushLocalChanges = true;
          }
        } catch (err) {
          console.error('Erro ao reconciliar estado recebido do Firebase Firestore:', err);
        } finally {
          this.isRemoteApplying = false;
        }
        if (shouldPushLocalChanges && auth.currentUser) {
          setTimeout(() => {
            this.syncToFirebase(Database.getState(), true).catch(console.error);
          }, 350);
        }
      },
      (error) => {
        this.status.status = 'error';
        this.status.lastError = error.message;
        this.notify();
        try {
          handleFirestoreError(error, OperationType.GET, docPath);
        } catch (e) {
          console.warn('Erro reportado pelo listener do Firestore:', e);
        }
      }
    );
  }

  private static stopRealtimeSync() {
    if (this.snapshotUnsubscribe) {
      this.snapshotUnsubscribe();
      this.snapshotUnsubscribe = null;
    }
  }

  /**
   * Agenda uma sincronização com debounce para evitar gravações excessivas
   */
  private static queueSyncToFirebase() {
    if (!auth.currentUser) return;

    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }

    this.syncDebounceTimer = setTimeout(() => {
      this.syncToFirebase();
    }, 700);
  }

  /**
   * Sincroniza o estado atual do ERP diretamente para o Firebase Firestore
   */
  public static async syncToFirebase(forcedState?: DatabaseState, overwriteAll: boolean = false): Promise<boolean> {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = null;
    }
    if (this.isSyncingInProgress) {
      if (!overwriteAll) return false;
      if (this.inFlightSyncPromise) {
        try {
          await this.inFlightSyncPromise;
        } catch {
          // ignore
        }
      }
      if (this.isSyncingInProgress) return false;
    }
    const currentUser = auth.currentUser;
    if (!currentUser) return false;

    const runSync = async (): Promise<boolean> => {
      this.isSyncingInProgress = true;
      this.status.status = 'syncing';
      this.notify();

      const companyId = getSyncRootCompanyId();
      const docPath = `erp_sync/${companyId}`;

      try {
        const rawState = forcedState || Database.getState();
        const actorContext = await this.resolveActorContext(rawState);
        const isCurrentAdmin = actorContext.isCurrentAdmin;

        // Operadores sem perfil ativo aprovado em /users/{uid} não podem gravar em /erp_sync
        if (!isCurrentAdmin && !actorContext.hasFirestoreProfile) {
          this.status.status = 'error';
          this.status.lastError = `Perfil /users/${currentUser.uid} não encontrado ou inativo no Firestore.`;
          this.notify();
          return false;
        }

        // Operadores não-admin precisam do snapshot remoto base para calcular o diff apenas de chaves permitidas
        if (!isCurrentAdmin && !this.lastRemoteStateSnapshot) {
          await this.pullFromFirebase(companyId);
          if (!this.lastRemoteStateSnapshot) {
            this.status.status = 'connected';
            this.notify();
            return false;
          }
        }

        const effectiveRawState = forcedState || Database.getState();
        const { payload, sanitizedUsers, registeredCompanyIds, hasWritableChanges } = prepareErpSyncPayload({
          rawState: effectiveRawState,
          companyId,
          updatedByUid: currentUser.uid,
          isCurrentAdmin,
          actorRole: actorContext.role,
          actorCompanyId: actorContext.companyId,
          lastRemoteStateSnapshot: this.lastRemoteStateSnapshot,
          lastRemoteUsersSnapshot: this.lastRemoteUsersSnapshot,
          lastRemoteRegisteredCompanyIds: this.lastRemoteRegisteredCompanyIds,
        });

        // Se o perfil não-admin não teve alterações reais em módulos permitidos, evita escrita redundante
        if (!isCurrentAdmin && !hasWritableChanges) {
          this.status.status = 'connected';
          this.notify();
          return true;
        }

        if (overwriteAll && isCurrentAdmin) {
          await setDoc(doc(db, 'erp_sync', companyId), payload);
        } else {
          await setDoc(doc(db, 'erp_sync', companyId), payload, { merge: true });
        }

        if (registeredCompanyIds) {
          this.lastRemoteRegisteredCompanyIds = registeredCompanyIds;
        }
        if (isCurrentAdmin) {
          this.lastRemoteUsersSnapshot = sanitizedUsers;
          this.lastRemoteStateSnapshot = cloneValue(payload.state);
        } else {
          this.lastRemoteStateSnapshot = {
            ...(this.lastRemoteStateSnapshot || {}),
            ...cloneValue(payload.state),
          };
        }

        Database.clearPendingFactoryReset();
        Database.markRemoteSynced(payload.updatedAt);

        this.status.status = 'connected';
        this.status.lastSyncAt = payload.updatedAt;
        this.status.lastError = null;
        this.notify();
        return true;
      } catch (err: unknown) {
        this.status.status = 'error';
        this.status.lastError = err instanceof Error ? err.message : String(err);
        this.notify();
        try {
          handleFirestoreError(err, OperationType.WRITE, docPath);
        } catch (e) {
          console.warn('Erro ao sincronizar com o Firestore:', e);
        }
        return false;
      } finally {
        this.isSyncingInProgress = false;
        this.inFlightSyncPromise = null;
      }
    };

    const promise = runSync();
    this.inFlightSyncPromise = promise;
    return promise;
  }

  /**
   * Recupera o estado remoto do Firebase Firestore
   */
  public static async pullFromFirebase(companyId?: string): Promise<boolean> {
    const targetCompId = companyId || getSyncRootCompanyId();

    try {
      const docRef = doc(db, 'erp_sync', targetCompId);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data();
        if (data && data.state) {
          const remoteState = data.state as DatabaseState;
          const { users: cleanRemoteUsers, hadLegacyPasswords } = stripLegacyPasswordsFromUsers(remoteState.users);
          const remoteRegistered =
            data.registeredCompanyIds && typeof data.registeredCompanyIds === 'object'
              ? (data.registeredCompanyIds as Record<string, boolean>)
              : null;
          this.primeRemoteSnapshotCache(remoteState, remoteRegistered);

          const isCurrentAdmin = this.isCurrentSessionAdminQuick(Database.getState());
          const needsCompanyDirectoryBackfill = !this.lastRemoteRegisteredCompanyIds;

          this.isRemoteApplying = true;
          const cleanRemoteState: DatabaseState = {
            ...remoteState,
            users: cleanRemoteUsers,
          };
          const recResult = Database.reconcileWithRemote(cleanRemoteState, data.updatedAt);
          this.status.lastSyncAt = data.updatedAt || new Date().toISOString();
          this.status.status = 'connected';
          this.notify();
          if (
            isCurrentAdmin &&
            (recResult.bahiaMigrated ||
              recResult.localUnsyncedChanges ||
              hadLegacyPasswords ||
              needsCompanyDirectoryBackfill) &&
            auth.currentUser
          ) {
            setTimeout(() => {
              this.syncToFirebase(Database.getState(), true).catch(console.error);
            }, 400);
          }
          return true;
        }
      }
      return false;
    } catch (err) {
      console.warn('Aviso ao consultar dados no Firestore:', err);
      return false;
    } finally {
      this.isRemoteApplying = false;
    }
  }
}
