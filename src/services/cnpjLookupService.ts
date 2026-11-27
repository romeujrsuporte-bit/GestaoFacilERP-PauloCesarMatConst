import { CityItem, Customer, NeighborhoodItem, StateItem } from '../types';

export type CnpjProviderName = 'BrasilAPI' | 'OpenCNPJ' | 'Minha Receita';

export interface CnpjLookupData {
  cnpj: string;
  normalizedCnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  telefone: string;
  email: string;
  situacaoCadastral: string;
  cnaePrincipal: string;
  source: CnpjProviderName;
  fromCache?: boolean;
}

export type CnpjLookupErrorCode =
  | 'INVALID_FORMAT'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'ABORTED';

export type CnpjLookupResult =
  | { ok: true; data: CnpjLookupData }
  | { ok: false; code: CnpjLookupErrorCode; message: string };

export interface CnpjFieldConflict {
  key: keyof Customer;
  label: string;
  currentValue: string;
  incomingValue: string;
}

export interface CnpjFormMergeResult {
  safeUpdates: Partial<Customer>;
  overwriteUpdates: Partial<Customer>;
  conflicts: CnpjFieldConflict[];
  filledLabels: string[];
  filledAddressCount: number;
  manualAddressFlags: Partial<{
    state: boolean;
    city: boolean;
    neighborhood: boolean;
  }>;
}

interface CacheEntry {
  data: CnpjLookupData;
  cachedAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos em memória
const PROVIDER_TIMEOUT_MS = 8500;

const lookupCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<CnpjLookupResult>>();

/**
 * Remove pontuação/espaços e padroniza caracteres alfanuméricos em maiúsculas.
 */
export function normalizeDocument(value?: string | null): string {
  return String(value || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
}

/**
 * Verifica se o texto normalizado possui exatamente 14 caracteres alfanuméricos (candidato a CNPJ).
 */
export function isCompleteCnpjCandidate(value?: string | null): boolean {
  const clean = normalizeDocument(value);
  return /^[0-9A-Z]{14}$/.test(clean);
}

/**
 * Formata CNPJ numérico ou alfanumérico (14 caracteres) no padrão XX.XXX.XXX/XXXX-XX.
 */
export function formatCnpj(value?: string | null): string {
  const clean = normalizeDocument(value);
  if (clean.length !== 14) return String(value || '').trim();
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
}

/**
 * Valida CNPJ numérico tradicional e CNPJ alfanumérico conforme IN RFB nº 2.229/2024:
 * - 12 posições iniciais alfanuméricas ([0-9A-Z]) + 2 dígitos verificadores numéricos ([0-9]).
 * - Conversão de cada caractere para cálculo: código ASCII - 48.
 * - Módulo 11 com pesos ciclando de 2 a 9 da direita para a esquerda.
 */
export function isValidCnpj(value?: string | null): boolean {
  const clean = normalizeDocument(value);
  if (clean.length !== 14) return false;
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(clean)) return false;

  // Rejeita sequências com todos os caracteres idênticos (ex: 00000000000000)
  if (/^([0-9A-Z])\1{13}$/.test(clean)) return false;

  const charValue = (ch: string): number => ch.charCodeAt(0) - 48;

  const calcDigit = (base: string, weights: number[]): number => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += charValue(base[i]) * weights[i];
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const base12 = clean.slice(0, 12);
  const dv1 = calcDigit(base12, weights1);
  if (dv1 !== Number(clean[12])) return false;

  const dv2 = calcDigit(base12 + String(dv1), weights2);
  return dv2 === Number(clean[13]);
}

/**
 * Procura cliente existente com o mesmo CNPJ (comparação normalizada).
 */
export function findExistingCustomerByCnpj(
  customers: Customer[],
  cpfCnpj?: string | null,
  excludeCustomerId?: string | null
): Customer | null {
  const target = normalizeDocument(cpfCnpj);
  if (target.length !== 14) return null;

  return (
    customers.find((c) => {
      if (excludeCustomerId && c.id === excludeCustomerId) return false;
      return normalizeDocument(c.cpfCnpj) === target;
    }) || null
  );
}

function formatCep(raw?: string | number | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return String(raw || '').trim();
}

function formatPhone(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return String(raw || '').trim();
}

function formatCnaeCode(code?: string | number | null): string {
  const digits = String(code || '').replace(/\D/g, '');
  if (digits.length === 7) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5, 7)}`;
  }
  return digits;
}

function combineCnae(code?: string | number | null, description?: string | null): string {
  const formattedCode = formatCnaeCode(code);
  const desc = cleanText(description);
  if (formattedCode && desc) return `${formattedCode} - ${desc}`;
  return desc || formattedCode || '';
}

function combineStreet(typePrefix?: string | null, street?: string | null): string {
  const prefix = cleanText(typePrefix);
  const base = cleanText(street);
  if (!base) return '';
  if (!prefix) return base;
  const upperBase = base.toUpperCase();
  const upperPrefix = prefix.toUpperCase();
  if (upperBase.startsWith(upperPrefix + ' ') || upperBase === upperPrefix) {
    return base;
  }
  return `${prefix} ${base}`;
}

function cleanText(value?: string | number | null): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function cleanEmail(value?: string | null): string {
  const text = cleanText(value).toLowerCase();
  if (!text || text === 'null' || text === 'undefined' || !text.includes('@')) return '';
  return text;
}

function normalizeLookupText(value?: string | null): string {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseBrasilApiOrMinhaReceita(
  raw: Record<string, any>,
  normalizedCnpj: string,
  source: 'BrasilAPI' | 'Minha Receita'
): CnpjLookupData {
  const phoneRaw = cleanText(raw.ddd_telefone_1) || cleanText(raw.ddd_telefone_2);
  const situacao =
    cleanText(raw.descricao_situacao_cadastral) ||
    (typeof raw.situacao_cadastral === 'string' ? cleanText(raw.situacao_cadastral) : '');

  return {
    cnpj: formatCnpj(raw.cnpj || normalizedCnpj),
    normalizedCnpj,
    razaoSocial: cleanText(raw.razao_social),
    nomeFantasia: cleanText(raw.nome_fantasia),
    cep: formatCep(raw.cep),
    logradouro: combineStreet(raw.descricao_tipo_de_logradouro, raw.logradouro),
    numero: cleanText(raw.numero),
    complemento: cleanText(raw.complemento),
    bairro: cleanText(raw.bairro),
    municipio: cleanText(raw.municipio),
    uf: cleanText(raw.uf).toUpperCase().slice(0, 2),
    telefone: formatPhone(phoneRaw),
    email: cleanEmail(raw.email),
    situacaoCadastral: situacao.toUpperCase(),
    cnaePrincipal: combineCnae(raw.cnae_fiscal, raw.cnae_fiscal_descricao),
    source,
  };
}

function parseOpenCnpj(raw: Record<string, any>, normalizedCnpj: string): CnpjLookupData {
  let phone = '';
  if (Array.isArray(raw.telefones) && raw.telefones.length > 0) {
    const primaryPhone =
      raw.telefones.find((t: any) => !t?.is_fax && t?.numero) || raw.telefones[0];
    if (primaryPhone) {
      phone = formatPhone(`${cleanText(primaryPhone.ddd)}${cleanText(primaryPhone.numero)}`);
    }
  }

  let cnaeDesc = '';
  if (Array.isArray(raw.cnaes)) {
    const principal =
      raw.cnaes.find((c: any) => c?.is_principal) ||
      raw.cnaes.find((c: any) => String(c?.codigo) === String(raw.cnae_principal));
    if (principal) {
      cnaeDesc = cleanText(principal.descricao);
    }
  }

  return {
    cnpj: formatCnpj(raw.cnpj || normalizedCnpj),
    normalizedCnpj,
    razaoSocial: cleanText(raw.razao_social),
    nomeFantasia: cleanText(raw.nome_fantasia),
    cep: formatCep(raw.cep),
    logradouro: combineStreet(raw.tipo_logradouro, raw.logradouro),
    numero: cleanText(raw.numero),
    complemento: cleanText(raw.complemento),
    bairro: cleanText(raw.bairro),
    municipio: cleanText(raw.municipio),
    uf: cleanText(raw.uf).toUpperCase().slice(0, 2),
    telefone: phone,
    email: cleanEmail(raw.email),
    situacaoCadastral: cleanText(raw.situacao_cadastral).toUpperCase(),
    cnaePrincipal: combineCnae(raw.cnae_principal, cnaeDesc),
    source: 'OpenCNPJ',
  };
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<{ status: number; data?: Record<string, any> }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException('Aborted', 'AbortError');
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { status: response.status };
    }

    const data = await response.json();
    return { status: response.status, data };
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

async function executeCnpjLookup(
  normalized: string,
  signal?: AbortSignal
): Promise<CnpjLookupResult> {
  const providers: Array<{
    name: CnpjProviderName;
    url: string;
    parse: (raw: Record<string, any>) => CnpjLookupData;
  }> = [
    {
      name: 'BrasilAPI',
      url: `https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(normalized)}`,
      parse: (raw) => parseBrasilApiOrMinhaReceita(raw, normalized, 'BrasilAPI'),
    },
    {
      name: 'OpenCNPJ',
      url: `https://api.opencnpj.org/${encodeURIComponent(normalized)}`,
      parse: (raw) => parseOpenCnpj(raw, normalized),
    },
    {
      name: 'Minha Receita',
      url: `https://minhareceita.org/${encodeURIComponent(normalized)}`,
      parse: (raw) => parseBrasilApiOrMinhaReceita(raw, normalized, 'Minha Receita'),
    },
  ];

  let notFoundCount = 0;
  let rateLimitedCount = 0;

  for (const provider of providers) {
    if (signal?.aborted) {
      return { ok: false, code: 'ABORTED', message: 'Consulta cancelada.' };
    }

    try {
      const res = await fetchJsonWithTimeout(provider.url, PROVIDER_TIMEOUT_MS, signal);

      if (res.status === 200 && res.data && (res.data.razao_social || res.data.cnpj)) {
        const parsed = provider.parse(res.data);
        lookupCache.set(normalized, { data: parsed, cachedAt: Date.now() });
        return { ok: true, data: parsed };
      }

      if (res.status === 404 || res.status === 400) {
        notFoundCount += 1;
        // Se já confirmou 404 em 2 fontes independentes (BrasilAPI + OpenCNPJ), encerra imediatamente
        if (notFoundCount >= 2) {
          return {
            ok: false,
            code: 'NOT_FOUND',
            message: 'CNPJ não encontrado na base da Receita Federal. Você pode prosseguir com o cadastro manual.',
          };
        }
        continue;
      }

      if (res.status === 429) {
        rateLimitedCount += 1;
        continue;
      }
    } catch (err: any) {
      if (signal?.aborted) {
        return { ok: false, code: 'ABORTED', message: 'Consulta cancelada.' };
      }
      // Falha de rede ou timeout -> tenta o próximo provedor automaticamente
      continue;
    }
  }

  if (notFoundCount > 0 && rateLimitedCount === 0) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'CNPJ não encontrado na base da Receita Federal. Você pode prosseguir com o cadastro manual.',
    };
  }

  if (rateLimitedCount > 0) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Limite temporário de consultas atingido. Aguarde alguns instantes ou preencha os dados manualmente.',
    };
  }

  return {
    ok: false,
    code: 'UNAVAILABLE',
    message: 'Serviço de consulta de CNPJ indisponível no momento. Você pode preencher o cadastro manualmente.',
  };
}

/**
 * Consulta dados cadastrais do CNPJ utilizando BrasilAPI como provedor principal
 * com fallback automático para OpenCNPJ e Minha Receita (sem chaves expostas, CORS nativo).
 */
export async function lookupCnpj(
  rawCnpj: string,
  options?: { signal?: AbortSignal; forceRefresh?: boolean }
): Promise<CnpjLookupResult> {
  const normalized = normalizeDocument(rawCnpj);

  if (!isValidCnpj(normalized)) {
    return {
      ok: false,
      code: 'INVALID_FORMAT',
      message: 'CNPJ inválido. Informe os 14 caracteres válidos (numérico ou alfanumérico) antes de consultar.',
    };
  }

  if (!options?.forceRefresh) {
    const cached = lookupCache.get(normalized);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return {
        ok: true,
        data: { ...cached.data, fromCache: true },
      };
    }
  }

  if (!options?.signal && inFlightRequests.has(normalized)) {
    return inFlightRequests.get(normalized)!;
  }

  const promise = executeCnpjLookup(normalized, options?.signal);

  if (!options?.signal) {
    inFlightRequests.set(normalized, promise);
    promise.finally(() => {
      inFlightRequests.delete(normalized);
    });
  }

  return promise;
}

/**
 * Monta o preenchimento seguro dos campos do cliente a partir da consulta de CNPJ,
 * preservando campos já preenchidos manualmente pelo usuário até autorização explícita.
 */
export function buildCnpjFormMerge(
  currentForm: Partial<Customer>,
  lookup: CnpjLookupData,
  userEditedFields: Set<string>,
  catalog?: {
    states?: StateItem[];
    cities?: CityItem[];
    neighborhoods?: NeighborhoodItem[];
  }
): CnpjFormMergeResult {
  const manualAddressFlags: Partial<{
    state: boolean;
    city: boolean;
    neighborhood: boolean;
  }> = {};

  // Harmoniza UF, Cidade e Bairro com as listas cadastradas no ERP (sem acento / case-insensitive)
  let resolvedState = lookup.uf;
  if (resolvedState && catalog?.states && catalog.states.length > 0) {
    const matchedState = catalog.states.find(
      (s) => s.uf.toUpperCase() === resolvedState.toUpperCase()
    );
    if (matchedState) {
      resolvedState = matchedState.uf;
    } else {
      manualAddressFlags.state = true;
    }
  }

  let resolvedCity = lookup.municipio;
  let matchedCityObj: CityItem | undefined;
  if (resolvedCity && catalog?.cities && catalog.cities.length > 0) {
    const normCity = normalizeLookupText(resolvedCity);
    matchedCityObj = catalog.cities.find(
      (c) =>
        normalizeLookupText(c.name) === normCity &&
        (!resolvedState || c.stateUf.toUpperCase() === resolvedState.toUpperCase())
    );
    if (matchedCityObj) {
      resolvedCity = matchedCityObj.name;
    } else {
      manualAddressFlags.city = true;
    }
  }

  let resolvedNeighborhood = lookup.bairro;
  if (resolvedNeighborhood && catalog?.neighborhoods && catalog.neighborhoods.length > 0) {
    const normNeigh = normalizeLookupText(resolvedNeighborhood);
    const matchedNeigh = catalog.neighborhoods.find(
      (n) =>
        normalizeLookupText(n.name) === normNeigh &&
        (!resolvedCity || normalizeLookupText(n.cityName) === normalizeLookupText(resolvedCity))
    );
    if (matchedNeigh) {
      resolvedNeighborhood = matchedNeigh.name;
    } else {
      manualAddressFlags.neighborhood = true;
    }
  }

  const candidateFields: Array<{
    key: keyof Customer;
    label: string;
    value: string;
    isAddress?: boolean;
  }> = [
    { key: 'name', label: 'Razão Social', value: lookup.razaoSocial },
    { key: 'tradeName', label: 'Nome Fantasia', value: lookup.nomeFantasia },
    { key: 'zipCode', label: 'CEP', value: lookup.cep, isAddress: true },
    { key: 'street', label: 'Logradouro', value: lookup.logradouro, isAddress: true },
    { key: 'number', label: 'Número', value: lookup.numero, isAddress: true },
    { key: 'complement', label: 'Complemento', value: lookup.complemento, isAddress: true },
    { key: 'neighborhood', label: 'Bairro', value: resolvedNeighborhood, isAddress: true },
    { key: 'city', label: 'Município', value: resolvedCity, isAddress: true },
    { key: 'state', label: 'UF', value: resolvedState, isAddress: true },
    { key: 'phone', label: 'Telefone', value: lookup.telefone },
    { key: 'email', label: 'E-mail', value: lookup.email },
    { key: 'cadastralStatus', label: 'Situação Cadastral', value: lookup.situacaoCadastral },
    { key: 'mainCnae', label: 'CNAE Principal', value: lookup.cnaePrincipal },
  ];

  const safeUpdates: Partial<Customer> = {
    type: 'PJ',
    cpfCnpj: lookup.cnpj,
  };
  const overwriteUpdates: Partial<Customer> = {};
  const conflicts: CnpjFieldConflict[] = [];
  const filledLabels: string[] = [];
  let filledAddressCount = 0;

  for (const field of candidateFields) {
    if (!field.value) continue;

    const currentRaw = String((currentForm as Record<string, any>)[field.key] ?? '').trim();
    const isSame =
      normalizeLookupText(currentRaw) === normalizeLookupText(field.value);

    // Se o campo está vazio OU não foi editado manualmente pelo usuário (ex: UF padrão 'BA' em novo cadastro)
    const isUserProtected = currentRaw.length > 0 && userEditedFields.has(String(field.key));

    if (!isUserProtected || isSame) {
      (safeUpdates as Record<string, any>)[field.key] = field.value;
      if (!isSame) {
        filledLabels.push(field.label);
        if (field.isAddress) filledAddressCount += 1;
      }
    } else {
      (overwriteUpdates as Record<string, any>)[field.key] = field.value;
      conflicts.push({
        key: field.key,
        label: field.label,
        currentValue: currentRaw,
        incomingValue: field.value,
      });
    }
  }

  // Se o município retornou uma cidade cadastrada no ERP, sugere praça e rota padrão apenas se estiverem vazios
  if (matchedCityObj) {
    if (!cleanText(currentForm.marketArea) && matchedCityObj.marketAreaName) {
      safeUpdates.marketArea = matchedCityObj.marketAreaName;
    }
    if (!cleanText(currentForm.deliveryRouteId) && matchedCityObj.defaultRouteId) {
      safeUpdates.deliveryRouteId = matchedCityObj.defaultRouteId;
    }
  }

  return {
    safeUpdates,
    overwriteUpdates,
    conflicts,
    filledLabels,
    filledAddressCount,
    manualAddressFlags,
  };
}

/**
 * Limpa cache em memória (útil para testes).
 */
export function clearCnpjLookupCache(): void {
  lookupCache.clear();
}
