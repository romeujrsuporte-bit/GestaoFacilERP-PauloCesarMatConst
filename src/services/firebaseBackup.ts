import JSZip from 'jszip';
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
} from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';
import {
  auth,
  db,
  FIREBASE_PROJECT_ID,
  MASTER_ADMIN_EMAIL,
} from './firebase';
import { Database, DatabaseState } from './db';

export type BackupStepId =
  | 'preparing'
  | 'exporting'
  | 'compressing'
  | 'downloading'
  | 'completed';

export interface BackupProgressState {
  step: BackupStepId;
  stepLabel: string;
  percent: number;
  detail?: string;
}

export interface BackupCollectionSummary {
  colecao: string;
  arquivo: string;
  quantidadeRegistros: number;
}

export interface BackupInfoMetadata {
  dataHoraBackup: string;
  dataHoraBackupIso: string;
  sistema: string;
  versaoSistema: string;
  empresa: {
    id: string;
    nome: string;
    nomeFantasia: string;
    cnpjCpf: string;
    tipo: string;
  };
  projetoFirebase: {
    projectId: string;
    firestoreDatabaseId: string;
  };
  operadorResponsavel: {
    id: string;
    nome: string;
    login: string;
    role: string;
  };
  colecoesFirestoreConsultadas: string[];
  documentosFirestoreLidos: Array<{
    colecao: string;
    documentoId: string;
    updatedAt?: string;
    version?: number;
  }>;
  colecoesExportadas: BackupCollectionSummary[];
  quantidadesPorColecao: Record<string, number>;
  totalGeralRegistros: number;
}

export interface GeneratedBackupResult {
  fileName: string;
  zipBlob: Blob;
  info: BackupInfoMetadata;
}

const SYSTEM_NAME = 'Gestão Fácil ERP';
const SYSTEM_VERSION = '1.0.0';
const BACKUP_ROOT_FOLDER = 'Backup_GestaoFacil';

const SENSITIVE_KEY_NAMES = new Set([
  'password',
  'senha',
  'pass',
  'passwordhash',
  'salt',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'secret',
  'apikey',
  'privatekey',
  'credential',
  'credentials',
  'ststokenmanager',
  'authtoken',
  'sessiontoken',
]);

const COLLECTION_EXPORT_MAP: Array<{
  stateKey: keyof DatabaseState;
  fileName: string;
  collectionLabel: string;
}> = [
  { stateKey: 'companies', fileName: 'empresas.json', collectionLabel: 'empresas' },
  { stateKey: 'users', fileName: 'usuarios.json', collectionLabel: 'usuarios' },
  { stateKey: 'deletedUserIds', fileName: 'usuarios_excluidos.json', collectionLabel: 'usuarios_excluidos' },
  { stateKey: 'stockLocations', fileName: 'locais_estoque.json', collectionLabel: 'locais_estoque' },
  { stateKey: 'products', fileName: 'produtos.json', collectionLabel: 'produtos' },
  { stateKey: 'components', fileName: 'componentes_producao.json', collectionLabel: 'componentes_producao' },
  { stateKey: 'stockBalances', fileName: 'estoque.json', collectionLabel: 'estoque' },
  { stateKey: 'stockMovements', fileName: 'movimentacoes_estoque.json', collectionLabel: 'movimentacoes_estoque' },
  { stateKey: 'customers', fileName: 'clientes.json', collectionLabel: 'clientes' },
  { stateKey: 'suppliers', fileName: 'fornecedores.json', collectionLabel: 'fornecedores' },
  { stateKey: 'orders', fileName: 'pedidos_e_vendas.json', collectionLabel: 'pedidos_e_vendas' },
  { stateKey: 'cashRegisters', fileName: 'caixas_pdv.json', collectionLabel: 'caixas_pdv' },
  { stateKey: 'accountsReceivable', fileName: 'contas_a_receber.json', collectionLabel: 'contas_a_receber' },
  { stateKey: 'accountsPayable', fileName: 'contas_a_pagar.json', collectionLabel: 'contas_a_pagar' },
  { stateKey: 'purchaseOrders', fileName: 'pedidos_compra.json', collectionLabel: 'pedidos_compra' },
  { stateKey: 'purchaseReceipts', fileName: 'recebimentos_compra.json', collectionLabel: 'recebimentos_compra' },
  { stateKey: 'productionOrders', fileName: 'ordens_producao.json', collectionLabel: 'ordens_producao' },
  { stateKey: 'transferOrders', fileName: 'transferencias_estoque.json', collectionLabel: 'transferencias_estoque' },
  { stateKey: 'inventoryCounts', fileName: 'inventarios.json', collectionLabel: 'inventarios' },
  { stateKey: 'auditLogs', fileName: 'logs_auditoria.json', collectionLabel: 'logs_auditoria' },
  { stateKey: 'paymentMethods', fileName: 'formas_pagamento.json', collectionLabel: 'formas_pagamento' },
  { stateKey: 'financialAccounts', fileName: 'contas_financeiras.json', collectionLabel: 'contas_financeiras' },
  { stateKey: 'paymentTermsList', fileName: 'prazos_pagamento.json', collectionLabel: 'prazos_pagamento' },
  { stateKey: 'deliveryRoutes', fileName: 'rotas_entrega.json', collectionLabel: 'rotas_entrega' },
  { stateKey: 'deliveryDrivers', fileName: 'motoristas.json', collectionLabel: 'motoristas' },
  { stateKey: 'deliveryVehicles', fileName: 'veiculos.json', collectionLabel: 'veiculos' },
  { stateKey: 'deliveryManifests', fileName: 'romaneios_entrega.json', collectionLabel: 'romaneios_entrega' },
  { stateKey: 'marketAreas', fileName: 'pracas_mercado.json', collectionLabel: 'pracas_mercado' },
  { stateKey: 'states', fileName: 'estados.json', collectionLabel: 'estados' },
  { stateKey: 'cities', fileName: 'cidades.json', collectionLabel: 'cidades' },
  { stateKey: 'neighborhoods', fileName: 'bairros.json', collectionLabel: 'bairros' },
  { stateKey: 'companyStockTransfers', fileName: 'transferencias_empresas.json', collectionLabel: 'transferencias_empresas' },
  { stateKey: 'chartOfAccounts', fileName: 'plano_de_contas.json', collectionLabel: 'plano_de_contas' },
  { stateKey: 'nfeImportHistory', fileName: 'historico_nfe.json', collectionLabel: 'historico_nfe' },
  { stateKey: 'supplierProductMappings', fileName: 'mapeamentos_fornecedor_produto.json', collectionLabel: 'mapeamentos_fornecedor_produto' },
  { stateKey: 'salesReturns', fileName: 'devolucoes_vendas.json', collectionLabel: 'devolucoes_vendas' },
  { stateKey: 'customerVouchers', fileName: 'vales_clientes.json', collectionLabel: 'vales_clientes' },
];

const CONFIG_STATE_KEYS = new Set<string>([
  'currentCompanyId',
  'currentUserId',
  'auditLogsClearedAt',
  'printerConfig',
  'hideOverdueAlert',
  'stockControlConfig',
  'sidebarMenuConfig',
]);

const KNOWN_STATE_KEYS = new Set<string>([
  ...COLLECTION_EXPORT_MAP.map((c) => String(c.stateKey)),
  ...Array.from(CONFIG_STATE_KEYS),
]);

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function formatBackupFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `Backup_GestaoFacil_${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}.zip`;
}

function formatLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Converte valores do Firestore (incluindo Timestamps) e remove recursivamente
 * campos sensíveis de credenciais, senhas ou tokens internos.
 */
function sanitizeBackupValue(value: unknown): any {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === 'object' &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return String(value);
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeBackupValue(item));
  }

  if (typeof value === 'object') {
    const cleanObj: Record<string, any> = {};
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (SENSITIVE_KEY_NAMES.has(key.toLowerCase())) {
        continue;
      }
      const fieldVal = record[key];
      if (fieldVal !== undefined) {
        cleanObj[key] = sanitizeBackupValue(fieldVal);
      }
    }
    return cleanObj;
  }

  return value;
}

function getRootCompanyId(): string {
  const state = Database.getState();
  const matriz = state.companies?.find((c) => c.type === 'matriz') || state.companies?.[0];
  return matriz?.id || 'comp-matriz';
}

function appendUniqueItems(
  target: any[],
  seenKeys: Set<string>,
  items: any[],
  sourceDocId: string,
  stateKey: string
) {
  for (let i = 0; i < items.length; i++) {
    const rawItem = items[i];
    const cleanItem = sanitizeBackupValue(rawItem);

    let dedupKey: string | null = null;
    if (cleanItem && typeof cleanItem === 'object' && !Array.isArray(cleanItem)) {
      if (typeof cleanItem.id === 'string' && cleanItem.id.trim() !== '') {
        dedupKey = `${sourceDocId}::${cleanItem.id}`;
      } else if (stateKey === 'stockBalances') {
        dedupKey = `${sourceDocId}::${cleanItem.productId || ''}::${cleanItem.locationId || ''}::${cleanItem.companyId || ''}`;
      }
    } else if (typeof cleanItem === 'string' || typeof cleanItem === 'number') {
      dedupKey = `${sourceDocId}::val::${String(cleanItem)}`;
    }

    if (dedupKey) {
      if (seenKeys.has(dedupKey)) continue;
      seenKeys.add(dedupKey);
    }

    target.push(cleanItem);
  }
}

/**
 * Dispara o download do arquivo ZIP na pasta padrão de downloads do navegador.
 */
export function triggerBackupZipDownload(zipBlob: Blob, fileName: string): void {
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Mantém a URL ativa tempo suficiente para downloads grandes iniciarem sem falhas
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 15000);
}

/**
 * Executa backup SOMENTE LEITURA diretamente do Firebase Firestore,
 * organiza os arquivos JSON por coleção e gera um ZIP padrão válido.
 */
export async function createDatabaseBackupZip(
  onProgress?: (progress: BackupProgressState) => void
): Promise<GeneratedBackupResult> {
  const emitProgress = (
    step: BackupStepId,
    stepLabel: string,
    percent: number,
    detail?: string
  ) => {
    if (onProgress) {
      onProgress({ step, stepLabel, percent, detail });
    }
  };

  emitProgress('preparing', 'Preparando backup', 5, 'Verificando conexão e autenticação com o Firebase...');

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Sem conexão com a internet para acessar o Firebase Firestore.');
  }

  const fbUser = auth.currentUser;
  if (!fbUser) {
    throw new Error('Sessão do Firebase Authentication não está ativa.');
  }

  await yieldToUi();

  const fbEmail = (fbUser.email || '').trim().toLowerCase();
  const isMasterAdmin = fbEmail === MASTER_ADMIN_EMAIL.toLowerCase();
  const rootCompanyId = getRootCompanyId();

  emitProgress('exporting', 'Exportando dados', 18, 'Consultando coleções no Firebase Firestore (somente leitura)...');

  interface RawErpDoc {
    id: string;
    data: Record<string, any>;
  }

  const erpSyncDocs: RawErpDoc[] = [];
  const firestoreUsersDocs: Array<Record<string, any>> = [];
  const firestoreDocsReadMeta: BackupInfoMetadata['documentosFirestoreLidos'] = [];

  // Leitura SOMENTE LEITURA respeitando as regras de segurança vigentes (firestore.rules)
  if (isMasterAdmin) {
    const [erpSnap, usersSnap] = await Promise.all([
      getDocsFromServer(collection(db, 'erp_sync')),
      getDocsFromServer(collection(db, 'users')),
    ]);

    erpSnap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      erpSyncDocs.push({ id: docSnap.id, data });
      firestoreDocsReadMeta.push({
        colecao: 'erp_sync',
        documentoId: docSnap.id,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
        version: typeof data.version === 'number' ? data.version : undefined,
      });
    });

    const seenUserDocIds = new Set<string>();
    usersSnap.forEach((docSnap) => {
      if (seenUserDocIds.has(docSnap.id)) return;
      seenUserDocIds.add(docSnap.id);
      const cleanProfile = sanitizeBackupValue(docSnap.data());
      firestoreUsersDocs.push({
        _firestoreDocId: docSnap.id,
        ...cleanProfile,
      });
      firestoreDocsReadMeta.push({
        colecao: 'users',
        documentoId: docSnap.id,
        updatedAt: typeof cleanProfile?.updatedAt === 'string' ? cleanProfile.updatedAt : undefined,
      });
    });
  } else {
    // Operadores não-master leem estritamente os documentos permitidos pelas Security Rules
    const [erpDocSnap, ownUserSnap] = await Promise.all([
      getDocFromServer(doc(db, 'erp_sync', rootCompanyId)),
      getDocFromServer(doc(db, 'users', fbUser.uid)),
    ]);

    if (erpDocSnap.exists()) {
      const data = erpDocSnap.data() as Record<string, any>;
      erpSyncDocs.push({ id: erpDocSnap.id, data });
      firestoreDocsReadMeta.push({
        colecao: 'erp_sync',
        documentoId: erpDocSnap.id,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
        version: typeof data.version === 'number' ? data.version : undefined,
      });
    }

    if (ownUserSnap.exists()) {
      const cleanProfile = sanitizeBackupValue(ownUserSnap.data());
      firestoreUsersDocs.push({
        _firestoreDocId: ownUserSnap.id,
        ...cleanProfile,
      });
      firestoreDocsReadMeta.push({
        colecao: 'users',
        documentoId: ownUserSnap.id,
        updatedAt: typeof cleanProfile?.updatedAt === 'string' ? cleanProfile.updatedAt : undefined,
      });
    }
  }

  emitProgress('exporting', 'Exportando dados', 40, 'Organizando registros e preservando IDs...');
  await yieldToUi();

  const zip = new JSZip();
  const rootFolder = zip.folder(BACKUP_ROOT_FOLDER);
  if (!rootFolder) {
    throw new Error('Falha ao inicializar a estrutura interna do arquivo ZIP.');
  }

  const exportedCollections: BackupCollectionSummary[] = [];
  const countsMap: Record<string, number> = {};
  let totalGeralRegistros = 0;

  // 1. Exportar cada coleção lógica real do ERP contida nos documentos /erp_sync
  const totalExportSteps = COLLECTION_EXPORT_MAP.length + 2;
  for (let idx = 0; idx < COLLECTION_EXPORT_MAP.length; idx++) {
    const mapping = COLLECTION_EXPORT_MAP[idx];
    const collectedRecords: any[] = [];
    const seenKeys = new Set<string>();

    for (const erpDoc of erpSyncDocs) {
      const stateObj = erpDoc.data?.state;
      if (!stateObj || typeof stateObj !== 'object') continue;
      const arr = stateObj[mapping.stateKey];
      if (Array.isArray(arr) && arr.length > 0) {
        appendUniqueItems(collectedRecords, seenKeys, arr, erpDoc.id, String(mapping.stateKey));
      }
    }

    rootFolder.file(mapping.fileName, JSON.stringify(collectedRecords, null, 2));

    const count = collectedRecords.length;
    exportedCollections.push({
      colecao: mapping.collectionLabel,
      arquivo: mapping.fileName,
      quantidadeRegistros: count,
    });
    countsMap[mapping.collectionLabel] = count;
    totalGeralRegistros += count;

    if (idx % 6 === 0) {
      const progressPct = 40 + Math.round(((idx + 1) / totalExportSteps) * 20);
      emitProgress('exporting', 'Exportando dados', progressPct, `Exportando ${mapping.collectionLabel}...`);
      await yieldToUi();
    }
  }

  // 2. Exportar perfis da coleção /users/{uid} do Firestore (sem duplicar usuarios.json)
  rootFolder.file('perfis_usuarios_firestore.json', JSON.stringify(firestoreUsersDocs, null, 2));
  exportedCollections.push({
    colecao: 'perfis_usuarios_firestore',
    arquivo: 'perfis_usuarios_firestore.json',
    quantidadeRegistros: firestoreUsersDocs.length,
  });
  countsMap['perfis_usuarios_firestore'] = firestoreUsersDocs.length;
  totalGeralRegistros += firestoreUsersDocs.length;

  // 3. Exportar configurações e metadados dos documentos erp_sync
  const configurationsPayload = erpSyncDocs.map((erpDoc) => {
    const stateObj = (erpDoc.data?.state || {}) as Record<string, any>;
    const configFields: Record<string, any> = {};
    for (const key of CONFIG_STATE_KEYS) {
      if (key in stateObj) {
        configFields[key] = sanitizeBackupValue(stateObj[key]);
      }
    }

    return {
      _firestoreDocId: erpDoc.id,
      companyId: erpDoc.data?.companyId || erpDoc.id,
      updatedAt: erpDoc.data?.updatedAt || null,
      updatedBy: erpDoc.data?.updatedBy || null,
      version: erpDoc.data?.version ?? null,
      registeredCompanyIds: sanitizeBackupValue(erpDoc.data?.registeredCompanyIds || null),
      configuracoes: configFields,
    };
  });

  rootFolder.file('configuracoes.json', JSON.stringify(configurationsPayload, null, 2));
  exportedCollections.push({
    colecao: 'configuracoes',
    arquivo: 'configuracoes.json',
    quantidadeRegistros: configurationsPayload.length,
  });
  countsMap['configuracoes'] = configurationsPayload.length;
  totalGeralRegistros += configurationsPayload.length;

  // 4. Caso existam chaves adicionais não mapeadas dentro de state, inclui sem perder dados
  const extraCollectionsByDoc: Record<string, Record<string, any>> = {};
  let extraCount = 0;
  for (const erpDoc of erpSyncDocs) {
    const stateObj = erpDoc.data?.state;
    if (!stateObj || typeof stateObj !== 'object') continue;
    for (const key of Object.keys(stateObj)) {
      if (!KNOWN_STATE_KEYS.has(key)) {
        if (!extraCollectionsByDoc[erpDoc.id]) {
          extraCollectionsByDoc[erpDoc.id] = {};
        }
        const cleanExtra = sanitizeBackupValue(stateObj[key]);
        extraCollectionsByDoc[erpDoc.id][key] = cleanExtra;
        extraCount += Array.isArray(cleanExtra) ? cleanExtra.length : 1;
      }
    }
  }
  if (extraCount > 0) {
    rootFolder.file('colecoes_adicionais.json', JSON.stringify(extraCollectionsByDoc, null, 2));
    exportedCollections.push({
      colecao: 'colecoes_adicionais',
      arquivo: 'colecoes_adicionais.json',
      quantidadeRegistros: extraCount,
    });
    countsMap['colecoes_adicionais'] = extraCount;
    totalGeralRegistros += extraCount;
  }

  // 5. Gerar arquivo backup_info.json obrigatório
  const now = new Date();
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();

  const backupInfo: BackupInfoMetadata = {
    dataHoraBackup: formatLocalDateTime(now),
    dataHoraBackupIso: now.toISOString(),
    sistema: SYSTEM_NAME,
    versaoSistema: SYSTEM_VERSION,
    empresa: {
      id: currentCompany.id,
      nome: currentCompany.name,
      nomeFantasia: currentCompany.tradeName || currentCompany.name,
      cnpjCpf: currentCompany.cnpjCpf || '',
      tipo: currentCompany.type || 'matriz',
    },
    projetoFirebase: {
      projectId: FIREBASE_PROJECT_ID || firebaseConfigJson.projectId || '',
      firestoreDatabaseId: firebaseConfigJson.firestoreDatabaseId || '(default)',
    },
    operadorResponsavel: {
      id: currentUser.id,
      nome: currentUser.name,
      login: currentUser.login,
      role: currentUser.role,
    },
    colecoesFirestoreConsultadas: ['erp_sync', 'users'],
    documentosFirestoreLidos: firestoreDocsReadMeta,
    colecoesExportadas: exportedCollections,
    quantidadesPorColecao: countsMap,
    totalGeralRegistros,
  };

  rootFolder.file('backup_info.json', JSON.stringify(backupInfo, null, 2));

  emitProgress('compressing', 'Compactando arquivos', 65, 'Gerando arquivo ZIP compatível...');
  await yieldToUi();

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      const pct = 65 + Math.round((metadata.percent / 100) * 28);
      emitProgress(
        'compressing',
        'Compactando arquivos',
        Math.min(93, pct),
        metadata.currentFile ? `Compactando ${metadata.currentFile}...` : 'Compactando arquivos JSON...'
      );
    }
  );

  if (!(zipBlob instanceof Blob) || zipBlob.size <= 0) {
    throw new Error('O arquivo ZIP gerado está vazio ou corrompido.');
  }

  const fileName = formatBackupFileName(now);

  emitProgress('downloading', 'Preparando download', 96, `Iniciando download de ${fileName}...`);
  await yieldToUi();

  triggerBackupZipDownload(zipBlob, fileName);

  emitProgress(
    'completed',
    'Backup concluído',
    100,
    `${totalGeralRegistros} registro(s) exportados em ${exportedCollections.length} arquivo(s).`
  );

  return {
    fileName,
    zipBlob,
    info: backupInfo,
  };
}
