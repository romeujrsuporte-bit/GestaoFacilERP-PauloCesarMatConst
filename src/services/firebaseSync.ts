import {
  doc,
  getDoc,
  getDocFromServer,
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

export type SyncOperationStatus = 'pending' | 'processing' | 'confirmed' | 'failed';
export type SyncEntityType = 'order' | 'customer' | 'product' | 'stock' | 'financial' | 'general';
export type SyncErrorCode =
  | 'OFFLINE'
  | 'AUTH_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'PROFILE_INACTIVE'
  | 'DOCUMENT_TOO_LARGE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface SyncOperationItem {
  id: string;
  operationKey: string;
  entityType: SyncEntityType;
  entityId?: string;
  label: string;
  status: SyncOperationStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  errorCode?: SyncErrorCode;
}

export interface SyncCommitResult {
  ok: boolean;
  syncState: 'confirmed' | 'pending_offline' | 'failed';
  operationId: string;
  errorCode?: SyncErrorCode;
  message: string;
}

export interface FirebaseSyncStatus {
  status: 'connected' | 'syncing' | 'offline' | 'error' | 'pending';
  lastSyncAt: string | null;
  lastError: string | null;
  lastErrorCode: SyncErrorCode | null;
  activeCompanyId: string;
  pendingCount: number;
  failedCount: number;
  estimatedPayloadBytes: number;
  documentSizePercent: number;
  documentSizeWarning: boolean;
  clientInstanceId: string;
  queue: SyncOperationItem[];
}

const SYNC_QUEUE_STORAGE_KEY = 'omni_erp_sync_queue_v1';
const MAX_FIRESTORE_DOC_BYTES = 1048576; // 1 MiB (limite oficial por documento do Cloud Firestore)
const DOC_SIZE_WARNING_THRESHOLD = 0.75; // Alerta preventivo a partir de 75% (~786 KB)
const DOC_SIZE_SAFE_CEILING_BYTES = 1020000; // Margem de segurança abaixo de 1 MiB
const DOC_SIZE_HARD_CEILING_BYTES = 1038000;
const CLIENT_INSTANCE_ID = `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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

// Chaves graváveis em state para cada perfil RBAC (espelho estrito de firestore.rules).
// Nota: currentCompanyId e currentUserId são omitidos de diffs parciais de não-admins para
// evitar sobrescrever a empresa/usuário visualizado em outros dispositivos.
const GERENTE_WRITABLE_KEYS = new Set<keyof DatabaseState>([
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

function estimateUtf8ByteSize(obj: unknown): number {
  try {
    const serialized = JSON.stringify(obj);
    if (!serialized) return 0;
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(serialized).length;
    }
    return serialized.length * 2;
  } catch {
    return 0;
  }
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
 * Garante que a empresa raiz (comp-matriz) permaneça sempre na posição 0 de state.companies,
 * requisito exigido pelas regras de segurança do Firestore para acesso de operadores de filiais.
 */
export function ensureMatrizFirstInCompanies(
  companies: DatabaseState['companies'] | undefined,
  rootCompanyId: string = 'comp-matriz'
): DatabaseState['companies'] {
  if (!Array.isArray(companies) || companies.length <= 1) {
    return Array.isArray(companies) ? [...companies] : [];
  }
  const matrizIndex = companies.findIndex((c) => c?.id === rootCompanyId);
  if (matrizIndex <= 0) {
    return [...companies];
  }
  const next = [...companies];
  const [matriz] = next.splice(matrizIndex, 1);
  next.unshift(matriz);
  return next;
}

/**
 * Verifica se um companyId está devidamente registrado e ativo no mapa registeredCompanyIds
 * gerado para o documento central /erp_sync/comp-matriz.
 */
export function verifyCompanyRegisteredForSync(
  companyId: string | undefined | null,
  companies: DatabaseState['companies'] | undefined,
  rootCompanyId: string = 'comp-matriz'
): boolean {
  if (!companyId || typeof companyId !== 'string') return false;
  const registry = buildRegisteredCompanyIds(companies, rootCompanyId);
  return registry[companyId] === true;
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

function classifyFirestoreError(err: unknown): { code: SyncErrorCode; message: string; isTransient: boolean } {
  const rawCode = String((err as any)?.code || '').toLowerCase();
  const rawMessage = err instanceof Error ? err.message : String(err || '');
  const lowerMsg = rawMessage.toLowerCase();

  if (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    rawCode === 'unavailable' ||
    rawCode === 'failed-precondition' && lowerMsg.includes('offline') ||
    lowerMsg.includes('client is offline') ||
    lowerMsg.includes('network') ||
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('could not reach cloud firestore')
  ) {
    return {
      code: 'OFFLINE',
      message: 'Sem conexão estável com o servidor Firebase. As alterações estão salvas localmente e serão sincronizadas automaticamente.',
      isTransient: true,
    };
  }

  if (rawCode === 'deadline-exceeded' || rawCode === 'aborted' || rawCode === 'resource-exhausted') {
    return {
      code: 'NETWORK_ERROR',
      message: 'Falha temporária de comunicação com o Firebase. Nova tentativa de sincronização foi agendada.',
      isTransient: true,
    };
  }

  if (rawCode === 'unauthenticated' || lowerMsg.includes('unauthenticated')) {
    return {
      code: 'AUTH_REQUIRED',
      message: 'Sessão de autenticação expirada no Firebase. Faça login novamente para sincronizar os dados na nuvem.',
      isTransient: false,
    };
  }

  if (rawCode === 'permission-denied' || lowerMsg.includes('missing or insufficient permissions')) {
    return {
      code: 'PERMISSION_DENIED',
      message:
        'Permissão negada pelo Firebase Firestore. Verifique se o perfil do usuário e o vínculo com a empresa/filial estão ativos.',
      isTransient: false,
    };
  }

  if (
    lowerMsg.includes('maximum size') ||
    lowerMsg.includes('exceeds the maximum') ||
    lowerMsg.includes('1,048,576') ||
    lowerMsg.includes('document_too_large')
  ) {
    return {
      code: 'DOCUMENT_TOO_LARGE',
      message:
        'O volume de dados atingiu o limite máximo de 1 MB por documento no Firestore. Acione o administrador para arquivamento/migração.',
      isTransient: false,
    };
  }

  return {
    code: 'UNKNOWN',
    message: rawMessage || 'Erro inesperado ao sincronizar com o Firebase Firestore.',
    isTransient: false,
  };
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
  version?: number;
  maxAuditLogs?: number;
  maxStockMovements?: number;
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
    version,
    maxAuditLogs = 60,
    maxStockMovements = 150,
  } = params;

  const usersSource =
    !isCurrentAdmin && lastRemoteUsersSnapshot
      ? lastRemoteUsersSnapshot
      : rawState.users;
  const { users: sanitizedUsers } = stripLegacyPasswordsFromUsers(usersSource);

  let finalState: Record<string, any>;
  let hasWritableChanges = true;

  if (isCurrentAdmin || !lastRemoteStateSnapshot) {
    const orderedCompanies = ensureMatrizFirstInCompanies(rawState.companies, companyId);
    const cleanState: Partial<DatabaseState> = {
      ...rawState,
      companies: orderedCompanies,
      users: sanitizedUsers,
      auditLogs: (rawState.auditLogs || []).slice(0, maxAuditLogs),
      stockMovements: (rawState.stockMovements || []).slice(0, maxStockMovements),
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
        nextRawVal = (rawState.auditLogs || []).slice(0, maxAuditLogs);
      } else if (key === 'stockMovements') {
        nextRawVal = (rawState.stockMovements || []).slice(0, maxStockMovements);
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

  const effectiveVersion =
    typeof version === 'number' && Number.isFinite(version)
      ? version
      : Date.now() * 1000 + Math.floor(Math.random() * 1000);

  const payload: Record<string, any> = {
    companyId,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedByUid,
    version: effectiveVersion,
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
    lastErrorCode: null,
    activeCompanyId: 'comp-matriz',
    pendingCount: 0,
    failedCount: 0,
    estimatedPayloadBytes: 0,
    documentSizePercent: 0,
    documentSizeWarning: false,
    clientInstanceId: CLIENT_INSTANCE_ID,
    queue: [],
  };

  private static listeners: Array<(status: FirebaseSyncStatus) => void> = [];
  private static snapshotUnsubscribe: Unsubscribe | null = null;
  private static persistUnsubscribe: (() => void) | null = null;
  private static authUnsubscribe: (() => void) | null = null;
  private static onlineListener: (() => void) | null = null;
  private static offlineListener: (() => void) | null = null;
  private static visibilityListener: (() => void) | null = null;

  private static syncDebounceTimer: any = null;
  private static retryTimer: any = null;
  private static retryAttemptCount = 0;

  private static isSyncingInProgress = false;
  private static inFlightSyncPromise: Promise<boolean> | null = null;
  private static pendingSyncRequested = false;
  private static pendingOverwriteAll = false;
  private static isRemoteApplying = false;

  private static lastRemoteStateSnapshot: Record<string, any> | null = null;
  private static lastRemoteUsersSnapshot: DatabaseState['users'] | null = null;
  private static lastRemoteRegisteredCompanyIds: Record<string, boolean> | null = null;

  // Controle de instância e versão para sincronização confiável entre dispositivos com o mesmo UID
  private static ownWrittenVersions = new Set<number>();
  private static lastKnownRemoteVersion: number | null = null;
  private static lastAppliedSnapshotKey: string | null = null;
  private static lastSyncErrorDetail: { code: SyncErrorCode; message: string } | null = null;

  // Fila persistente de operações aguardando sincronização
  private static queue: SyncOperationItem[] = [];
  private static queueLoaded = false;

  private static loadQueueFromStorage(): void {
    if (this.queueLoaded) return;
    this.queueLoaded = true;
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(SYNC_QUEUE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Qualquer item que ficou 'processing' antes de um reload volta para 'pending'
          this.queue = parsed
            .filter((item) => item && typeof item.id === 'string' && typeof item.operationKey === 'string')
            .map((item) => ({
              ...item,
              status: item.status === 'processing' ? 'pending' : item.status,
            }))
            .slice(-60);
        }
      }
    } catch {
      this.queue = [];
    }
    this.refreshQueueCounters();
  }

  private static saveQueueToStorage(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      // Mantém itens pendentes/falhos + últimos 30 confirmados para rastreabilidade visual recente
      const activeItems = this.queue.filter((i) => i.status !== 'confirmed');
      const confirmedItems = this.queue.filter((i) => i.status === 'confirmed').slice(-30);
      this.queue = [...confirmedItems, ...activeItems];
      localStorage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch {
      // ignore quota issues in queue metadata
    }
  }

  private static refreshQueueCounters(): void {
    const pendingCount = this.queue.filter((i) => i.status === 'pending' || i.status === 'processing').length;
    const failedCount = this.queue.filter((i) => i.status === 'failed').length;
    this.status.pendingCount = pendingCount;
    this.status.failedCount = failedCount;
    this.status.queue = this.queue.map((i) => ({ ...i }));
  }

  private static hasPendingQueueItems(): boolean {
    this.loadQueueFromStorage();
    return this.queue.some((i) => i.status === 'pending' || i.status === 'processing' || i.status === 'failed');
  }

  private static enqueueOperation(params: {
    operationKey: string;
    entityType: SyncEntityType;
    entityId?: string;
    label: string;
  }): SyncOperationItem {
    this.loadQueueFromStorage();
    const nowIso = new Date().toISOString();
    const existing = this.queue.find(
      (i) => i.operationKey === params.operationKey && i.status !== 'confirmed'
    );
    if (existing) {
      existing.status = 'pending';
      existing.label = params.label;
      existing.updatedAt = nowIso;
      existing.lastError = undefined;
      existing.errorCode = undefined;
      this.saveQueueToStorage();
      this.refreshQueueCounters();
      this.notify();
      return existing;
    }

    const item: SyncOperationItem = {
      id: `syncop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      operationKey: params.operationKey,
      entityType: params.entityType,
      entityId: params.entityId,
      label: params.label,
      status: 'pending',
      attempts: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.queue.push(item);
    this.saveQueueToStorage();
    this.refreshQueueCounters();
    this.notify();
    return item;
  }

  private static markActiveQueueItemsProcessing(): void {
    this.loadQueueFromStorage();
    const nowIso = new Date().toISOString();
    let changed = false;
    for (const item of this.queue) {
      if (item.status === 'pending' || item.status === 'failed') {
        item.status = 'processing';
        item.attempts += 1;
        item.updatedAt = nowIso;
        changed = true;
      }
    }
    if (changed) {
      this.saveQueueToStorage();
      this.refreshQueueCounters();
    }
  }

  private static markProcessingItemsConfirmed(): void {
    this.loadQueueFromStorage();
    const nowIso = new Date().toISOString();
    let changed = false;
    for (const item of this.queue) {
      if (item.status === 'processing') {
        item.status = 'confirmed';
        item.updatedAt = nowIso;
        item.lastError = undefined;
        item.errorCode = undefined;
        changed = true;
      }
    }
    if (changed) {
      this.saveQueueToStorage();
      this.refreshQueueCounters();
    }
  }

  private static markProcessingItemsOutcome(
    nextStatus: 'pending' | 'failed',
    errorCode: SyncErrorCode,
    errorMessage: string
  ): void {
    this.loadQueueFromStorage();
    const nowIso = new Date().toISOString();
    let changed = false;
    for (const item of this.queue) {
      if (item.status === 'processing' || (nextStatus === 'failed' && item.status === 'pending')) {
        item.status = nextStatus;
        item.updatedAt = nowIso;
        item.errorCode = errorCode;
        item.lastError = errorMessage;
        changed = true;
      }
    }
    if (changed) {
      this.saveQueueToStorage();
      this.refreshQueueCounters();
    }
  }

  public static getEntitySyncState(
    entityType: SyncEntityType,
    entityId: string
  ): 'confirmed' | 'pending' | 'syncing' | 'failed' {
    this.loadQueueFromStorage();
    const matches = this.queue.filter(
      (item) => item.entityType === entityType && item.entityId === entityId
    );
    if (matches.length === 0) {
      return 'confirmed';
    }
    const latest = matches[matches.length - 1];
    if (latest.status === 'processing') return 'syncing';
    if (latest.status === 'pending') return 'pending';
    if (latest.status === 'failed') return 'failed';
    return 'confirmed';
  }

  public static getEntitySyncError(entityType: SyncEntityType, entityId: string): string | null {
    this.loadQueueFromStorage();
    const matches = this.queue.filter(
      (item) => item.entityType === entityType && item.entityId === entityId && item.status === 'failed'
    );
    if (matches.length === 0) return null;
    return matches[matches.length - 1].lastError || null;
  }

  private static generateNextWriteVersion(): number {
    const candidate = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    const next =
      this.lastKnownRemoteVersion !== null
        ? Math.max(candidate, this.lastKnownRemoteVersion + 1)
        : candidate;
    return next;
  }

  private static recordOwnWrittenVersion(version: number): void {
    this.ownWrittenVersions.add(version);
    if (this.ownWrittenVersions.size > 60) {
      const oldest = this.ownWrittenVersions.values().next().value;
      if (oldest !== undefined) {
        this.ownWrittenVersions.delete(oldest);
      }
    }
  }

  private static updateDocumentSizeMetrics(bytes: number): void {
    const pct = Math.min(100, Math.round((bytes / MAX_FIRESTORE_DOC_BYTES) * 1000) / 10);
    this.status.estimatedPayloadBytes = bytes;
    this.status.documentSizePercent = pct;
    this.status.documentSizeWarning = bytes >= MAX_FIRESTORE_DOC_BYTES * DOC_SIZE_WARNING_THRESHOLD;
  }

  private static scheduleAutoRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (!this.hasPendingQueueItems()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (!auth.currentUser) return;

    const delaysMs = [2000, 5000, 10000, 20000, 30000];
    const delay = delaysMs[Math.min(this.retryAttemptCount, delaysMs.length - 1)];
    this.retryAttemptCount += 1;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.hasPendingQueueItems() && auth.currentUser && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        this.syncToFirebase().catch(console.warn);
      }
    }, delay);
  }

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
    this.loadQueueFromStorage();
    this.refreshQueueCounters();
    return {
      ...this.status,
      queue: this.queue.map((i) => ({ ...i })),
    };
  }

  public static subscribe(listener: (status: FirebaseSyncStatus) => void): () => void {
    this.loadQueueFromStorage();
    this.listeners.push(listener);
    listener(this.getStatus());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private static notify() {
    this.refreshQueueCounters();
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
    this.loadQueueFromStorage();
    testFirestoreConnection();
    registerRemotePullObserver((remoteState, remoteRegisteredCompanyIds) => {
      this.primeRemoteSnapshotCache(remoteState, remoteRegisteredCompanyIds);
    });

    // Escuta estado de autenticação
    this.authUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        this.status.status = this.hasPendingQueueItems() ? 'pending' : 'connected';
        this.status.lastError = null;
        this.status.lastErrorCode = null;
        this.retryAttemptCount = 0;
        this.notify();
        this.startRealtimeSync();
        // Se existirem operações locais pendentes gravadas offline, reenvia automaticamente
        if (this.hasPendingQueueItems() && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
          setTimeout(() => {
            this.syncToFirebase().catch(console.warn);
          }, 500);
        }
      } else {
        this.stopRealtimeSync();
        this.lastRemoteStateSnapshot = null;
        this.lastRemoteUsersSnapshot = null;
        this.lastRemoteRegisteredCompanyIds = null;
        this.lastKnownRemoteVersion = null;
        this.lastAppliedSnapshotKey = null;
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (!isOffline && Database.isSessionAuthenticated()) {
          this.status.status = 'error';
          this.status.lastErrorCode = 'AUTH_REQUIRED';
          this.status.lastError =
            'Sessão do Firebase desconectada ou expirada. Faça login novamente para sincronizar com a nuvem.';
        } else {
          this.status.status = 'offline';
          this.status.lastError = null;
          this.status.lastErrorCode = null;
        }
        this.notify();
      }
    });

    // Escuta recuperação de conectividade e retorno do app PWA do segundo plano
    if (typeof window !== 'undefined') {
      this.onlineListener = () => {
        this.retryAttemptCount = 0;
        if (auth.currentUser) {
          if (this.hasPendingQueueItems()) {
            this.syncToFirebase().catch(console.warn);
          } else {
            this.pullFromFirebase().catch(console.warn);
          }
        }
      };
      this.offlineListener = () => {
        this.status.status = 'offline';
        this.status.lastErrorCode = 'OFFLINE';
        this.status.lastError =
          'Sem conexão com a internet. Alterações serão mantidas localmente para envio automático.';
        this.notify();
      };
      this.visibilityListener = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          if (auth.currentUser && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
            if (this.hasPendingQueueItems()) {
              this.syncToFirebase().catch(console.warn);
            } else {
              this.pullFromFirebase().catch(console.warn);
            }
          }
        }
      };
      window.addEventListener('online', this.onlineListener);
      window.addEventListener('offline', this.offlineListener);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this.visibilityListener);
      }
    }

    // Escuta alterações locais para sincronizar com o Firestore sem descarte
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
    if (typeof window !== 'undefined') {
      if (this.onlineListener) {
        window.removeEventListener('online', this.onlineListener);
        this.onlineListener = null;
      }
      if (this.offlineListener) {
        window.removeEventListener('offline', this.offlineListener);
        this.offlineListener = null;
      }
    }
    if (typeof document !== 'undefined' && this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Inicia a escuta em tempo real da empresa raiz no Firestore.
   * Identifica gravações da própria instância pelo version gerado localmente (e NÃO pelo UID),
   * permitindo que celular, PWA e computador com a mesma conta sincronizem normalmente.
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
        // Ignora ecos otimistas locais ainda não confirmados pelo servidor
        if (snapshot.metadata.hasPendingWrites) {
          return;
        }

        if (!snapshot.exists()) {
          // Somente o Administrador pode criar o documento inicial /erp_sync/comp-matriz no Firestore zerado
          if (this.isCurrentSessionAdminQuick(Database.getState())) {
            this.syncToFirebase().catch(console.warn);
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

        const remoteVersion = typeof remoteData.version === 'number' ? remoteData.version : 0;
        const remoteUpdatedAt = typeof remoteData.updatedAt === 'string' ? remoteData.updatedAt : '';
        const snapshotKey = `${remoteVersion}|${remoteUpdatedAt}`;

        this.updateDocumentSizeMetrics(estimateUtf8ByteSize(remoteData));

        // 1) Se esta versão exata foi gravada por ESTA MESMA ABA/INSTÂNCIA, ignora apenas o eco próprio
        if (remoteVersion > 0 && this.ownWrittenVersions.has(remoteVersion)) {
          this.lastKnownRemoteVersion = Math.max(this.lastKnownRemoteVersion || 0, remoteVersion);
          this.lastAppliedSnapshotKey = snapshotKey;
          this.status.lastSyncAt = remoteUpdatedAt || new Date().toISOString();
          if (!this.isSyncingInProgress && !this.hasPendingQueueItems()) {
            this.status.status = 'connected';
          }
          this.notify();
          return;
        }

        // 2) Evita reprocessamento duplicado do mesmo snapshot já aplicado nesta aba
        if (this.lastAppliedSnapshotKey === snapshotKey && !this.hasPendingQueueItems()) {
          return;
        }

        const prevBaseRemoteSnapshot = this.lastRemoteStateSnapshot
          ? cloneValue(this.lastRemoteStateSnapshot)
          : null;

        const remoteState = remoteData.state as DatabaseState;
        const { users: cleanRemoteUsers, hadLegacyPasswords } = stripLegacyPasswordsFromUsers(remoteState.users);
        const remoteRegistered =
          remoteData.registeredCompanyIds && typeof remoteData.registeredCompanyIds === 'object'
            ? (remoteData.registeredCompanyIds as Record<string, boolean>)
            : null;
        this.primeRemoteSnapshotCache(remoteState, remoteRegistered);
        if (remoteVersion > 0) {
          this.lastKnownRemoteVersion = remoteVersion;
        }
        this.lastAppliedSnapshotKey = snapshotKey;

        const isCurrentAdmin = this.isCurrentSessionAdminQuick(Database.getState());
        const needsCompanyDirectoryBackfill = !this.lastRemoteRegisteredCompanyIds;

        // 3) Reconcilia com segurança preservando operações locais pendentes (inclusive de mesmo UID em outro dispositivo)
        let shouldPushLocalChanges = false;
        let shouldAdminOverwrite = false;
        try {
          this.isRemoteApplying = true;
          const cleanRemoteState: DatabaseState = {
            ...remoteState,
            users: cleanRemoteUsers,
          };
          const recResult = Database.reconcileWithRemote(cleanRemoteState, remoteUpdatedAt, {
            baseRemoteState: prevBaseRemoteSnapshot,
            hasPendingLocalChanges: this.hasPendingQueueItems(),
          });
          this.status.lastSyncAt = remoteUpdatedAt || new Date().toISOString();
          if (!this.isSyncingInProgress) {
            this.status.status = this.hasPendingQueueItems() ? 'pending' : 'connected';
          }
          this.notify();

          if (recResult.localUnsyncedChanges || this.hasPendingQueueItems()) {
            // Reenvio automático habilitado para TODOS os perfis autorizados (respeitando RBAC no payload)
            shouldPushLocalChanges = true;
          }
          if (
            isCurrentAdmin &&
            (recResult.bahiaMigrated || hadLegacyPasswords || needsCompanyDirectoryBackfill)
          ) {
            shouldPushLocalChanges = true;
            shouldAdminOverwrite = true;
          }
        } catch (err) {
          console.error('Erro ao reconciliar estado recebido do Firebase Firestore:', err);
        } finally {
          this.isRemoteApplying = false;
        }

        if (shouldPushLocalChanges && auth.currentUser) {
          setTimeout(() => {
            this.syncToFirebase(Database.getState(), shouldAdminOverwrite).catch(console.warn);
          }, 350);
        }
      },
      (error) => {
        const classified = classifyFirestoreError(error);
        this.status.status = classified.code === 'OFFLINE' ? 'offline' : 'error';
        this.status.lastError = classified.message;
        this.status.lastErrorCode = classified.code;
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
   * Agenda uma sincronização com debounce curto e fila persistente (nunca descarta alterações)
   */
  private static queueSyncToFirebase() {
    this.enqueueOperation({
      operationKey: 'general:state_change',
      entityType: 'general',
      label: 'Alteração de dados do ERP',
    });

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.status.status = 'offline';
      this.status.lastErrorCode = 'OFFLINE';
      this.status.lastError =
        'Sem conexão com a internet. Alteração salva localmente aguardando sincronização.';
      this.notify();
      return;
    }

    if (!auth.currentUser) {
      this.status.status = 'error';
      this.status.lastErrorCode = 'AUTH_REQUIRED';
      this.status.lastError =
        'Sessão do Firebase não autenticada. Faça login novamente para sincronizar na nuvem.';
      this.notify();
      return;
    }

    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }

    this.syncDebounceTimer = setTimeout(() => {
      this.syncDebounceTimer = null;
      this.syncToFirebase().catch(console.warn);
    }, 350);
  }

  /**
   * Confirma uma operação crítica diretamente no Firebase Firestore (sem esperar debounce),
   * aguardando confirmação efetiva do servidor e retornando estado claro para a interface.
   */
  public static async commitCriticalOperation(params: {
    operationKey: string;
    entityType: SyncEntityType;
    entityId?: string;
    label: string;
    forcedState?: DatabaseState;
    overwriteAll?: boolean;
  }): Promise<SyncCommitResult> {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = null;
    }

    const op = this.enqueueOperation({
      operationKey: params.operationKey,
      entityType: params.entityType,
      entityId: params.entityId,
      label: params.label,
    });

    // 1. Verifica conectividade antes de tentar gravar
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.status.status = 'offline';
      this.status.lastErrorCode = 'OFFLINE';
      this.status.lastError =
        'Sem conexão com a internet. Registro salvo localmente e aguardando sincronização automática.';
      this.notify();
      return {
        ok: false,
        syncState: 'pending_offline',
        operationId: op.id,
        errorCode: 'OFFLINE',
        message:
          'Sem conexão com a internet. O registro foi salvo apenas neste dispositivo e será enviado automaticamente ao Firebase quando a conexão voltar.',
      };
    }

    // 2. Verifica autenticação ativa no Firebase Auth
    if (!auth.currentUser) {
      const msg =
        'Sua sessão no Firebase expirou ou não está autenticada. O registro ficou salvo apenas localmente. Faça login novamente e clique em "Sincronizar agora".';
      this.markProcessingItemsOutcome('failed', 'AUTH_REQUIRED', msg);
      op.status = 'failed';
      op.errorCode = 'AUTH_REQUIRED';
      op.lastError = msg;
      this.saveQueueToStorage();
      this.status.status = 'error';
      this.status.lastErrorCode = 'AUTH_REQUIRED';
      this.status.lastError = msg;
      this.notify();
      return {
        ok: false,
        syncState: 'failed',
        operationId: op.id,
        errorCode: 'AUTH_REQUIRED',
        message: msg,
      };
    }

    // 3. Executa gravação efetiva e aguarda confirmação real do servidor
    const ok = await this.syncToFirebase(params.forcedState || Database.getState(), Boolean(params.overwriteAll));
    if (ok) {
      return {
        ok: true,
        syncState: 'confirmed',
        operationId: op.id,
        message: `${params.label} salvo e confirmado na nuvem (Firebase).`,
      };
    }

    const detail = this.lastSyncErrorDetail;
    if (detail?.code === 'OFFLINE' || detail?.code === 'NETWORK_ERROR') {
      return {
        ok: false,
        syncState: 'pending_offline',
        operationId: op.id,
        errorCode: detail.code,
        message: detail.message,
      };
    }

    return {
      ok: false,
      syncState: 'failed',
      operationId: op.id,
      errorCode: detail?.code || 'UNKNOWN',
      message: detail?.message || 'Não foi possível confirmar a gravação no Firebase.',
    };
  }

  /**
   * Reenvia manualmente todas as operações pendentes/falhas na fila
   */
  public static async retryPendingSync(): Promise<boolean> {
    this.retryAttemptCount = 0;
    return this.syncToFirebase(Database.getState(), false);
  }

  /**
   * Sincroniza o estado atual do ERP diretamente para o Firebase Firestore,
   * com proteção contra concorrência (fila pendente), mesclagem pré-escrita do servidor
   * para evitar sobrescrita de alterações simultâneas e validação do limite de 1 MB.
   */
  public static async syncToFirebase(
    forcedState?: DatabaseState,
    overwriteAll: boolean = false
  ): Promise<boolean> {
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = null;
    }

    // Se já houver sincronização em andamento, NÃO descarta: marca como pendente,
    // aguarda a execução em curso e processa o restante imediatamente em seguida.
    if (this.isSyncingInProgress) {
      this.pendingSyncRequested = true;
      if (overwriteAll) {
        this.pendingOverwriteAll = true;
      }
      if (this.inFlightSyncPromise) {
        try {
          await this.inFlightSyncPromise;
        } catch {
          // ignore
        }
      }
      if (this.pendingSyncRequested && !this.isSyncingInProgress) {
        const nextOverwrite = this.pendingOverwriteAll;
        this.pendingSyncRequested = false;
        this.pendingOverwriteAll = false;
        return this.syncToFirebase(forcedState || Database.getState(), nextOverwrite);
      }
      return this.status.status === 'connected' && !this.hasPendingQueueItems();
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.lastSyncErrorDetail = {
        code: 'OFFLINE',
        message: 'Sem conexão com a internet. Alterações salvas localmente aguardando sincronização.',
      };
      this.status.status = 'offline';
      this.status.lastErrorCode = 'OFFLINE';
      this.status.lastError = this.lastSyncErrorDetail.message;
      this.notify();
      return false;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      this.lastSyncErrorDetail = {
        code: 'AUTH_REQUIRED',
        message: 'Sessão do Firebase não autenticada ou expirada. Faça login novamente para sincronizar.',
      };
      this.status.status = 'error';
      this.status.lastErrorCode = 'AUTH_REQUIRED';
      this.status.lastError = this.lastSyncErrorDetail.message;
      this.notify();
      return false;
    }

    const runSync = async (): Promise<boolean> => {
      this.isSyncingInProgress = true;
      this.lastSyncErrorDetail = null;
      this.markActiveQueueItemsProcessing();
      this.status.status = 'syncing';
      this.notify();

      const companyId = getSyncRootCompanyId();
      const docPath = `erp_sync/${companyId}`;
      const docRef = doc(db, 'erp_sync', companyId);
      let writtenVersionForThisAttempt: number | null = null;

      try {
        const initialState = forcedState || Database.getState();
        const actorContext = await this.resolveActorContext(initialState);
        const isCurrentAdmin = actorContext.isCurrentAdmin;

        // Operadores sem perfil ativo aprovado em /users/{uid} não podem gravar em /erp_sync
        if (!isCurrentAdmin && !actorContext.hasFirestoreProfile) {
          const msg = `Perfil /users/${currentUser.uid} não encontrado ou inativo no Firestore.`;
          this.lastSyncErrorDetail = { code: 'PROFILE_INACTIVE', message: msg };
          this.markProcessingItemsOutcome('failed', 'PROFILE_INACTIVE', msg);
          this.status.status = 'error';
          this.status.lastErrorCode = 'PROFILE_INACTIVE';
          this.status.lastError = msg;
          this.notify();
          return false;
        }

        // Mesclagem pré-escrita com o servidor (!overwriteAll):
        // Garante que alterações feitas simultaneamente em outros dispositivos nunca sejam sobrescritas
        // e detecta imediatamente perda real de conectividade (via getDocFromServer).
        if (!overwriteAll) {
          const serverSnap = await getDocFromServer(docRef);
          if (serverSnap.exists()) {
            const serverData = serverSnap.data();
            const serverVersion = typeof serverData?.version === 'number' ? serverData.version : 0;
            const serverUpdatedAt = typeof serverData?.updatedAt === 'string' ? serverData.updatedAt : '';
            const serverState = serverData?.state as DatabaseState | undefined;
            const serverRegistered =
              serverData?.registeredCompanyIds && typeof serverData.registeredCompanyIds === 'object'
                ? (serverData.registeredCompanyIds as Record<string, boolean>)
                : null;

            const serverMovedAhead =
              !this.lastRemoteStateSnapshot ||
              this.lastKnownRemoteVersion === null ||
              (serverVersion > 0 && serverVersion !== this.lastKnownRemoteVersion);

            if (serverState && serverMovedAhead) {
              const prevBase = this.lastRemoteStateSnapshot ? cloneValue(this.lastRemoteStateSnapshot) : null;
              const { users: cleanServerUsers } = stripLegacyPasswordsFromUsers(serverState.users);
              this.primeRemoteSnapshotCache(serverState, serverRegistered);
              if (serverVersion > 0) {
                this.lastKnownRemoteVersion = serverVersion;
              }

              try {
                this.isRemoteApplying = true;
                Database.reconcileWithRemote(
                  { ...serverState, users: cleanServerUsers },
                  serverUpdatedAt,
                  {
                    baseRemoteState: prevBase,
                    hasPendingLocalChanges: true,
                  }
                );
              } finally {
                this.isRemoteApplying = false;
              }
            } else if (serverState && !this.lastRemoteStateSnapshot) {
              this.primeRemoteSnapshotCache(serverState, serverRegistered);
            }
          } else if (!isCurrentAdmin) {
            const msg = 'Documento raiz da empresa ainda não inicializado pelo Administrador no Firestore.';
            this.lastSyncErrorDetail = { code: 'PERMISSION_DENIED', message: msg };
            this.markProcessingItemsOutcome('failed', 'PERMISSION_DENIED', msg);
            this.status.status = 'error';
            this.status.lastErrorCode = 'PERMISSION_DENIED';
            this.status.lastError = msg;
            this.notify();
            return false;
          }
        }

        const effectiveRawState = Database.getState();
        const writeVersion = this.generateNextWriteVersion();

        let prepared = prepareErpSyncPayload({
          rawState: effectiveRawState,
          companyId,
          updatedByUid: currentUser.uid,
          isCurrentAdmin,
          actorRole: actorContext.role,
          actorCompanyId: actorContext.companyId,
          lastRemoteStateSnapshot: this.lastRemoteStateSnapshot,
          lastRemoteUsersSnapshot: this.lastRemoteUsersSnapshot,
          lastRemoteRegisteredCompanyIds: this.lastRemoteRegisteredCompanyIds,
          version: writeVersion,
        });

        // Verifica o tamanho estimado do documento completo no Firestore (limite oficial: 1 MiB)
        const computeEstimatedDocBytes = (candidatePayload: Record<string, any>): number => {
          if (isCurrentAdmin || !this.lastRemoteStateSnapshot) {
            return estimateUtf8ByteSize(candidatePayload);
          }
          const projectedDoc = {
            ...candidatePayload,
            state: {
              ...this.lastRemoteStateSnapshot,
              ...candidatePayload.state,
            },
          };
          return estimateUtf8ByteSize(projectedDoc);
        };

        let estimatedBytes = computeEstimatedDocBytes(prepared.payload);
        if (estimatedBytes > DOC_SIZE_SAFE_CEILING_BYTES) {
          // Compactação segura apenas de logs rotativos (preservando integralmente cadastros, pedidos, estoque e financeiro)
          prepared = prepareErpSyncPayload({
            rawState: effectiveRawState,
            companyId,
            updatedByUid: currentUser.uid,
            isCurrentAdmin,
            actorRole: actorContext.role,
            actorCompanyId: actorContext.companyId,
            lastRemoteStateSnapshot: this.lastRemoteStateSnapshot,
            lastRemoteUsersSnapshot: this.lastRemoteUsersSnapshot,
            lastRemoteRegisteredCompanyIds: this.lastRemoteRegisteredCompanyIds,
            version: writeVersion,
            maxAuditLogs: 25,
            maxStockMovements: 100,
          });
          estimatedBytes = computeEstimatedDocBytes(prepared.payload);
        }

        this.updateDocumentSizeMetrics(estimatedBytes);

        if (estimatedBytes > DOC_SIZE_HARD_CEILING_BYTES) {
          const kb = Math.round(estimatedBytes / 1024);
          const msg = `O documento centralizado do Firestore atingiu ${kb} KB (limite máximo: 1024 KB). Não é possível gravar até arquivar registros antigos ou dividir coleções.`;
          this.lastSyncErrorDetail = { code: 'DOCUMENT_TOO_LARGE', message: msg };
          this.markProcessingItemsOutcome('failed', 'DOCUMENT_TOO_LARGE', msg);
          this.status.status = 'error';
          this.status.lastErrorCode = 'DOCUMENT_TOO_LARGE';
          this.status.lastError = msg;
          this.notify();
          return false;
        }

        const { payload, sanitizedUsers, registeredCompanyIds, hasWritableChanges } = prepared;

        // Se o perfil não-admin não teve alterações reais em módulos permitidos, marca fila como confirmada
        if (!isCurrentAdmin && !hasWritableChanges) {
          this.markProcessingItemsConfirmed();
          this.status.status = 'connected';
          this.status.lastError = null;
          this.status.lastErrorCode = null;
          this.notify();
          return true;
        }

        writtenVersionForThisAttempt = writeVersion;
        this.recordOwnWrittenVersion(writeVersion);

        if (overwriteAll && isCurrentAdmin) {
          await setDoc(docRef, payload);
        } else {
          await setDoc(docRef, payload, { merge: true });
        }

        this.lastKnownRemoteVersion = writeVersion;
        this.lastAppliedSnapshotKey = `${writeVersion}|${payload.updatedAt}`;

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

        this.markProcessingItemsConfirmed();
        this.retryAttemptCount = 0;
        this.status.status = 'connected';
        this.status.lastSyncAt = payload.updatedAt;
        this.status.lastError = null;
        this.status.lastErrorCode = null;
        this.notify();
        return true;
      } catch (err: unknown) {
        if (writtenVersionForThisAttempt !== null) {
          this.ownWrittenVersions.delete(writtenVersionForThisAttempt);
        }
        const classified = classifyFirestoreError(err);
        this.lastSyncErrorDetail = { code: classified.code, message: classified.message };
        this.markProcessingItemsOutcome(
          classified.isTransient ? 'pending' : 'failed',
          classified.code,
          classified.message
        );
        this.status.status = classified.code === 'OFFLINE' ? 'offline' : 'error';
        this.status.lastError = classified.message;
        this.status.lastErrorCode = classified.code;
        this.notify();

        if (classified.isTransient) {
          this.scheduleAutoRetry();
        }

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
    const result = await promise;

    // Se ocorreram novas alterações enquanto esta sincronização estava em andamento, processa o restante imediatamente
    if (this.pendingSyncRequested && !this.isSyncingInProgress) {
      const nextOverwrite = this.pendingOverwriteAll;
      this.pendingSyncRequested = false;
      this.pendingOverwriteAll = false;
      return this.syncToFirebase(Database.getState(), nextOverwrite);
    }

    return result;
  }

  /**
   * Recupera o estado remoto do Firebase Firestore
   */
  public static async pullFromFirebase(companyId?: string): Promise<boolean> {
    const targetCompId = companyId || getSyncRootCompanyId();

    try {
      const docRef = doc(db, 'erp_sync', targetCompId);
      const snap = await getDocFromServer(docRef).catch(() => getDoc(docRef));

      if (snap.exists()) {
        const data = snap.data();
        if (data && data.state) {
          const remoteVersion = typeof data.version === 'number' ? data.version : 0;
          const remoteUpdatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : '';
          const prevBase = this.lastRemoteStateSnapshot ? cloneValue(this.lastRemoteStateSnapshot) : null;

          this.updateDocumentSizeMetrics(estimateUtf8ByteSize(data));

          const remoteState = data.state as DatabaseState;
          const { users: cleanRemoteUsers, hadLegacyPasswords } = stripLegacyPasswordsFromUsers(remoteState.users);
          const remoteRegistered =
            data.registeredCompanyIds && typeof data.registeredCompanyIds === 'object'
              ? (data.registeredCompanyIds as Record<string, boolean>)
              : null;
          this.primeRemoteSnapshotCache(remoteState, remoteRegistered);
          if (remoteVersion > 0) {
            this.lastKnownRemoteVersion = remoteVersion;
            this.lastAppliedSnapshotKey = `${remoteVersion}|${remoteUpdatedAt}`;
          }

          const isCurrentAdmin = this.isCurrentSessionAdminQuick(Database.getState());
          const needsCompanyDirectoryBackfill = !this.lastRemoteRegisteredCompanyIds;

          this.isRemoteApplying = true;
          const cleanRemoteState: DatabaseState = {
            ...remoteState,
            users: cleanRemoteUsers,
          };
          const recResult = Database.reconcileWithRemote(cleanRemoteState, remoteUpdatedAt, {
            baseRemoteState: prevBase,
            hasPendingLocalChanges: this.hasPendingQueueItems(),
          });
          this.status.lastSyncAt = remoteUpdatedAt || new Date().toISOString();
          this.status.status = this.hasPendingQueueItems() ? 'pending' : 'connected';
          this.notify();

          const shouldAdminOverwrite =
            isCurrentAdmin &&
            (recResult.bahiaMigrated || hadLegacyPasswords || needsCompanyDirectoryBackfill);
          const shouldPush =
            shouldAdminOverwrite || recResult.localUnsyncedChanges || this.hasPendingQueueItems();

          if (shouldPush && auth.currentUser) {
            setTimeout(() => {
              this.syncToFirebase(Database.getState(), shouldAdminOverwrite).catch(console.warn);
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
