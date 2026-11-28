import {
  DiscountAuthorizationRecord,
  Order,
  OrderItem,
  OrderOrigin,
  Product,
  ProductMaxDiscountType,
  User,
} from '../types';
import { StockEngine } from './stockEngine';
import { formatCurrency } from './pricingEngine';

export interface AuthorizerProfileInfo {
  id: string;
  name: string;
  login: string;
  email?: string;
  role: 'admin' | 'gerente';
}

export interface DiscountViolationDetails {
  productId: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  referenceUnitPrice: number;
  appliedUnitPrice: number;
  grossLineValue: number;
  limitType: ProductMaxDiscountType;
  maxDiscountConfigured: number;
  maxDiscountPercentAllowed: number;
  maxDiscountValueAllowed: number;
  requestedDiscountPercent: number;
  requestedDiscountValue: number;
  excessPercent: number;
  excessValue: number;
  reason: 'desconto_item' | 'desconto_global' | 'preco_manual' | 'combinado';
  origin: OrderOrigin | 'edicao_pedido';
}

export interface ItemDiscountEvaluation {
  controlled: boolean;
  allowed: boolean;
  exceeded: boolean;
  authorized: boolean;
  requiresAuthorization: boolean;
  clearAuthorization: boolean;
  maxDiscountPercentAllowed: number;
  maxDiscountValueAllowed: number;
  effectiveDiscountPercent: number;
  effectiveDiscountValue: number;
  violation?: DiscountViolationDetails;
}

export interface EvaluateItemDiscountInput {
  product?: Product | null;
  companyId: string;
  origin: OrderOrigin | 'edicao_pedido';
  quantity: number;
  unitPrice: number;
  referenceUnitPrice?: number;
  priceOverridden?: boolean;
  priceOverriddenByRole?: 'admin' | 'gerente' | 'balconista';
  itemDiscountValue?: number;
  itemDiscountPercent?: number;
  globalDiscountShare?: number;
  explicitPercentRequested?: number;
  existingAuthorization?: DiscountAuthorizationRecord | null;
  saleSessionId?: string;
  persistedBaselineItem?: OrderItem | null;
  users?: User[];
}

interface IssuedSessionAuthorization {
  operationId: string;
  saleSessionId: string;
  productId: string;
  quantity: number;
  referenceUnitPrice: number;
  requestedDiscountValue: number;
  requestedDiscountPercent: number;
  authorizerUserId: string;
  authorizerRole: 'admin' | 'gerente';
  sellerUserId: string;
  issuedAt: number;
  revoked: boolean;
}

const MASTER_ADMIN_EMAIL = 'romeujr.suporte@gmail.com';
const MONETARY_ROUNDING_TOLERANCE = 0.005;
const PERCENT_ROUNDING_TOLERANCE = 0.01;
const QTY_TOLERANCE = 0.0005;

const round2 = (val: number): number => Math.round((Number.isFinite(val) ? val : 0) * 100) / 100;

/**
 * Registro em memória (sessão atual) das autorizações efetivamente autenticadas.
 * Impede forjamento de objetos na interface e garante escopo restrito por operação/item/sessão.
 */
const issuedAuthorizationsRegistry = new Map<string, IssuedSessionAuthorization>();

export function generateSaleSessionId(prefix: string = 'SALE'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Valida se o usuário possui EFETIVAMENTE permissão de Administrador (Acesso Total)
 * ou Gerente Geral para autorizar descontos acima do limite do produto.
 * Nunca confia no nome/texto exibido; valida role real, status e permissões.
 */
export function canUserAuthorizeProductDiscount(
  user?: User | null,
  firestoreProfile?: { role?: string; status?: string; email?: string } | null,
  authenticatedEmail?: string | null
): boolean {
  const cleanAuthEmail = (authenticatedEmail || '').trim().toLowerCase();
  const isMasterEmail = cleanAuthEmail === MASTER_ADMIN_EMAIL;

  // Se houver perfil do Firestore retornado na autenticação, exige consistência de status e role
  if (firestoreProfile) {
    if (firestoreProfile.status && firestoreProfile.status !== 'ativo') {
      return false;
    }
    if (
      !isMasterEmail &&
      firestoreProfile.role !== 'admin' &&
      firestoreProfile.role !== 'gerente'
    ) {
      return false;
    }
  }

  if (!user) {
    // Somente o Admin Master autenticado no Firebase (com perfil ativo no Firestore) pode prosseguir sem espelho local prévio
    return isMasterEmail && (!firestoreProfile || firestoreProfile.status === 'ativo');
  }

  if (user.status !== 'ativo') {
    return false;
  }

  const isRoleAdmin = user.role === 'admin';
  const isRoleGerente = user.role === 'gerente';

  if (!isRoleAdmin && !isRoleGerente) {
    return false;
  }

  // Valida permissões reais do perfil cadastrado no ERP
  if (isRoleAdmin) {
    const hasAdminEmail = (user.email || '').trim().toLowerCase() === MASTER_ADMIN_EMAIL;
    const hasAdminAccess =
      hasAdminEmail ||
      (user.permissions?.canAuthorizeDiscount !== false && user.permissions?.canManageUsers !== false);
    return hasAdminAccess;
  }

  // Gerente Geral: exige role 'gerente' + permissão efetiva de autorização de desconto
  return user.permissions?.canAuthorizeDiscount === true;
}

/**
 * Emite e registra uma autorização vinculada estritamente a:
 * produto + quantidade + preço de referência + desconto solicitado + sessão da venda.
 */
export function issueDiscountAuthorization(params: {
  violation: DiscountViolationDetails;
  seller: Pick<User, 'id' | 'name' | 'login'>;
  authorizer: AuthorizerProfileInfo;
  saleSessionId: string;
}): DiscountAuthorizationRecord {
  const { violation, seller, authorizer, saleSessionId } = params;
  const nowIso = new Date().toISOString();
  const operationId = `OP-DESC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const record: DiscountAuthorizationRecord = {
    id: `AUTH-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    operationId,
    origin: violation.origin,
    productId: violation.productId,
    productCode: violation.productCode,
    productDescription: violation.productDescription,
    referenceUnitPrice: round2(violation.referenceUnitPrice),
    quantity: Math.round(violation.quantity * 1000) / 1000,
    grossLineValue: round2(violation.grossLineValue),
    limitType: violation.limitType,
    maxDiscountConfigured: round2(violation.maxDiscountConfigured),
    maxDiscountPercentAllowed: round2(violation.maxDiscountPercentAllowed),
    maxDiscountValueAllowed: round2(violation.maxDiscountValueAllowed),
    requestedDiscountPercent: round2(violation.requestedDiscountPercent),
    requestedDiscountValue: round2(violation.requestedDiscountValue),
    appliedDiscountPercent: round2(violation.requestedDiscountPercent),
    appliedDiscountValue: round2(violation.requestedDiscountValue),
    excessPercent: round2(violation.excessPercent),
    excessValue: round2(violation.excessValue),
    reason: violation.reason,
    sellerUserId: seller.id,
    sellerUserName: seller.name,
    sellerUserLogin: seller.login,
    authorizerUserId: authorizer.id,
    authorizerUserName: authorizer.name,
    authorizerUserLogin: authorizer.login,
    authorizerRole: authorizer.role,
    authorizedAt: nowIso,
  };

  issuedAuthorizationsRegistry.set(operationId, {
    operationId,
    saleSessionId,
    productId: record.productId,
    quantity: record.quantity,
    referenceUnitPrice: record.referenceUnitPrice,
    requestedDiscountValue: record.requestedDiscountValue,
    requestedDiscountPercent: record.requestedDiscountPercent,
    authorizerUserId: record.authorizerUserId,
    authorizerRole: record.authorizerRole,
    sellerUserId: record.sellerUserId,
    issuedAt: Date.now(),
    revoked: false,
  });

  return record;
}

/**
 * Revoga uma autorização específica (ex.: quando o produto é removido da venda ou o desconto cai dentro do limite).
 */
export function revokeDiscountAuthorization(operationId?: string | null): void {
  if (!operationId) return;
  const entry = issuedAuthorizationsRegistry.get(operationId);
  if (entry) {
    entry.revoked = true;
    issuedAuthorizationsRegistry.delete(operationId);
  }
}

/**
 * Revoga todas as autorizações vinculadas a uma sessão de venda concluída ou cancelada.
 * Garante que uma autorização nunca libere descontos futuros indiscriminadamente.
 */
export function clearSaleSessionAuthorizations(saleSessionId?: string | null): void {
  if (!saleSessionId) return;
  for (const [opId, entry] of issuedAuthorizationsRegistry.entries()) {
    if (entry.saleSessionId === saleSessionId) {
      entry.revoked = true;
      issuedAuthorizationsRegistry.delete(opId);
    }
  }
}

/**
 * Verifica se uma autorização existente é válida e cobre exatamente o produto, quantidade,
 * preço de referência e valor/percentual de desconto solicitados nesta operação.
 */
export function isAuthorizationValidForOperation(
  auth: DiscountAuthorizationRecord | null | undefined,
  params: {
    productId: string;
    quantity: number;
    referenceUnitPrice: number;
    effectiveDiscountValue: number;
    effectiveDiscountPercent: number;
    saleSessionId?: string;
    persistedBaselineItem?: OrderItem | null;
    users?: User[];
  }
): boolean {
  if (!auth || !auth.operationId) return false;
  if (auth.productId !== params.productId) return false;
  if (auth.authorizerRole !== 'admin' && auth.authorizerRole !== 'gerente') return false;

  // Se a lista de usuários do banco foi informada, confirma que o autorizador existe, está ativo e tem permissão real
  if (params.users && params.users.length > 0) {
    const matchedAuthorizer = params.users.find((u) => u.id === auth.authorizerUserId);
    if (matchedAuthorizer && !canUserAuthorizeProductDiscount(matchedAuthorizer, null, matchedAuthorizer.email)) {
      return false;
    }
  }

  // Verifica vínculo com quantidade e preço de referência
  if (Math.abs(auth.quantity - params.quantity) > QTY_TOLERANCE) return false;
  if (Math.abs(auth.referenceUnitPrice - params.referenceUnitPrice) > 0.01) return false;

  // Se o desconto aumentou após a autorização (em R$ ou %), exige nova autorização
  if (params.effectiveDiscountValue > auth.requestedDiscountValue + MONETARY_ROUNDING_TOLERANCE) {
    return false;
  }
  if (params.effectiveDiscountPercent > auth.requestedDiscountPercent + PERCENT_ROUNDING_TOLERANCE) {
    return false;
  }

  // 1) Verifica se foi emitida nesta sessão ativa (não forjada, não revogada)
  const registered = issuedAuthorizationsRegistry.get(auth.operationId);
  if (registered) {
    if (registered.revoked) return false;
    if (params.saleSessionId && registered.saleSessionId !== params.saleSessionId) return false;
    if (registered.productId !== params.productId) return false;
    if (Math.abs(registered.quantity - params.quantity) > QTY_TOLERANCE) return false;
    if (params.effectiveDiscountValue > registered.requestedDiscountValue + MONETARY_ROUNDING_TOLERANCE) {
      return false;
    }
    if (params.effectiveDiscountPercent > registered.requestedDiscountPercent + PERCENT_ROUNDING_TOLERANCE) {
      return false;
    }
    return true;
  }

  // 2) Caso esteja editando um pedido já salvo anteriormente, aceita a autorização originalmente
  // persistida naquele mesmo item SE a operação/desconto/quantidade não tiverem aumentado
  const baselineAuth = params.persistedBaselineItem?.discountAuthorization;
  if (
    baselineAuth &&
    baselineAuth.operationId === auth.operationId &&
    baselineAuth.productId === params.productId &&
    (baselineAuth.authorizerRole === 'admin' || baselineAuth.authorizerRole === 'gerente') &&
    Math.abs(baselineAuth.quantity - params.quantity) <= QTY_TOLERANCE &&
    params.effectiveDiscountValue <= baselineAuth.requestedDiscountValue + MONETARY_ROUNDING_TOLERANCE &&
    params.effectiveDiscountPercent <= baselineAuth.requestedDiscountPercent + PERCENT_ROUNDING_TOLERANCE
  ) {
    return true;
  }

  return false;
}

/**
 * Avalia matematicamente se o desconto efetivo de um item ultrapassa o limite máximo
 * configurado no cadastro do produto (seja via desconto no item, alteração manual de preço,
 * desconto geral do pedido ou combinação deles).
 */
export function evaluateItemMaxDiscount(input: EvaluateItemDiscountInput): ItemDiscountEvaluation {
  const {
    product,
    companyId,
    origin,
    quantity,
    unitPrice,
    itemDiscountValue = 0,
    itemDiscountPercent = 0,
    globalDiscountShare = 0,
    explicitPercentRequested,
    existingAuthorization,
    saleSessionId,
    persistedBaselineItem,
    users,
  } = input;

  // Produtos sem o controle ativado (inclusive cadastros antigos) seguem comportamento padrão sem bloqueio
  if (!product || !product.maxDiscountEnabled) {
    return {
      controlled: false,
      allowed: true,
      exceeded: false,
      authorized: false,
      requiresAuthorization: false,
      clearAuthorization: false,
      maxDiscountPercentAllowed: 100,
      maxDiscountValueAllowed: Number.POSITIVE_INFINITY,
      effectiveDiscountPercent: Math.max(0, itemDiscountPercent),
      effectiveDiscountValue: Math.max(0, itemDiscountValue),
    };
  }

  const safeQty = Math.max(0, Number.isFinite(quantity) ? quantity : 0);
  const tablePrice = StockEngine.getProductPriceForCompany(product, companyId);
  const isAuthorizedDirectPriceOverride =
    input.priceOverridden === true &&
    (input.priceOverriddenByRole === 'admin' ||
      input.priceOverriddenByRole === 'gerente' ||
      (input.priceOverriddenByRole === 'balconista' && input.origin === 'pdv'));
  const effectiveRefUnitPrice = isAuthorizedDirectPriceOverride
    ? Math.max(0, unitPrice)
    : input.referenceUnitPrice !== undefined && input.referenceUnitPrice > 0
    ? input.referenceUnitPrice
    : tablePrice > 0
    ? tablePrice
    : Math.max(0, unitPrice);

  const grossLineValue = effectiveRefUnitPrice * safeQty;
  const manualPriceDiscountTotal = Math.max(0, (effectiveRefUnitPrice - unitPrice) * safeQty);
  const directItemDiscountVal = Math.max(0, Number.isFinite(itemDiscountValue) ? itemDiscountValue : 0);
  const globalShareVal = Math.max(0, Number.isFinite(globalDiscountShare) ? globalDiscountShare : 0);

  const effectiveDiscountValue = manualPriceDiscountTotal + directItemDiscountVal + globalShareVal;
  const effectiveDiscountPercent =
    grossLineValue > 0 ? (effectiveDiscountValue / grossLineValue) * 100 : 0;

  const limitType: ProductMaxDiscountType = product.maxDiscountType === 'value' ? 'value' : 'percent';
  const configuredRaw = Number(product.maxDiscountValue ?? 0);
  const maxDiscountConfigured = Number.isFinite(configuredRaw) && configuredRaw >= 0 ? configuredRaw : 0;

  let maxDiscountPercentAllowed = 0;
  let maxDiscountValueAllowed = 0;

  if (limitType === 'percent') {
    maxDiscountPercentAllowed = Math.min(100, maxDiscountConfigured);
    maxDiscountValueAllowed = grossLineValue * (maxDiscountPercentAllowed / 100);
  } else {
    // Limite monetário (R$ por unidade * quantidade da linha)
    maxDiscountValueAllowed = Math.min(grossLineValue, maxDiscountConfigured * safeQty);
    maxDiscountPercentAllowed = grossLineValue > 0 ? (maxDiscountValueAllowed / grossLineValue) * 100 : 0;
  }

  // Verifica se ultrapassou o limite (descontos iguais ao limite são permitidos; superiores exigem autorização)
  let exceeded = false;
  if (maxDiscountConfigured <= 0) {
    // Limite 0% ou R$ 0,00: qualquer desconto > 0 exige autorização
    exceeded =
      effectiveDiscountValue > 0.0001 ||
      effectiveDiscountPercent > 0.0001 ||
      (explicitPercentRequested !== undefined && explicitPercentRequested > 0.0001);
  } else if (limitType === 'percent') {
    const explicitExceeds =
      explicitPercentRequested !== undefined &&
      explicitPercentRequested > maxDiscountPercentAllowed + 1e-6;
    const monetaryExceeds = effectiveDiscountValue > maxDiscountValueAllowed + MONETARY_ROUNDING_TOLERANCE;
    exceeded = explicitExceeds || monetaryExceeds;
  } else {
    // Limite monetário: compara valor efetivo contra máximo permitido em R$ (impede burla por conversão em %)
    const monetaryExceeds = effectiveDiscountValue > maxDiscountValueAllowed + MONETARY_ROUNDING_TOLERANCE;
    const explicitPercentExceeds =
      explicitPercentRequested !== undefined &&
      grossLineValue > 0 &&
      (grossLineValue * explicitPercentRequested) / 100 > maxDiscountValueAllowed + MONETARY_ROUNDING_TOLERANCE;
    exceeded = monetaryExceeds || explicitPercentExceeds;
  }

  if (!exceeded) {
    return {
      controlled: true,
      allowed: true,
      exceeded: false,
      authorized: false,
      requiresAuthorization: false,
      clearAuthorization: Boolean(existingAuthorization),
      maxDiscountPercentAllowed: round2(maxDiscountPercentAllowed),
      maxDiscountValueAllowed: round2(maxDiscountValueAllowed),
      effectiveDiscountPercent: round2(effectiveDiscountPercent),
      effectiveDiscountValue: round2(effectiveDiscountValue),
    };
  }

  // Ultrapassou o limite: verifica se existe autorização válida cobrindo exatamente esta operação
  const isAuthorized = isAuthorizationValidForOperation(existingAuthorization, {
    productId: product.id,
    quantity: safeQty,
    referenceUnitPrice: effectiveRefUnitPrice,
    effectiveDiscountValue,
    effectiveDiscountPercent,
    saleSessionId,
    persistedBaselineItem,
    users,
  });

  const activeSources = [
    directItemDiscountVal > 0.001 ? 'desconto_item' : null,
    globalShareVal > 0.001 ? 'desconto_global' : null,
    manualPriceDiscountTotal > 0.001 ? 'preco_manual' : null,
  ].filter(Boolean) as ('desconto_item' | 'desconto_global' | 'preco_manual')[];

  const reason: DiscountViolationDetails['reason'] =
    activeSources.length > 1
      ? 'combinado'
      : activeSources[0] || (explicitPercentRequested && explicitPercentRequested > 0 ? 'desconto_item' : 'desconto_item');

  const displayRequestedPercent =
    explicitPercentRequested !== undefined &&
    manualPriceDiscountTotal <= 0.001 &&
    globalShareVal <= 0.001
      ? Math.max(explicitPercentRequested, effectiveDiscountPercent)
      : effectiveDiscountPercent;

  const violation: DiscountViolationDetails = {
    productId: product.id,
    productCode: product.code,
    productDescription: product.description,
    quantity: safeQty,
    referenceUnitPrice: round2(effectiveRefUnitPrice),
    appliedUnitPrice: round2(unitPrice),
    grossLineValue: round2(grossLineValue),
    limitType,
    maxDiscountConfigured: round2(maxDiscountConfigured),
    maxDiscountPercentAllowed: round2(maxDiscountPercentAllowed),
    maxDiscountValueAllowed: round2(maxDiscountValueAllowed),
    requestedDiscountPercent: round2(displayRequestedPercent),
    requestedDiscountValue: round2(effectiveDiscountValue),
    excessPercent: round2(Math.max(0, displayRequestedPercent - maxDiscountPercentAllowed)),
    excessValue: round2(Math.max(0, effectiveDiscountValue - maxDiscountValueAllowed)),
    reason,
    origin,
  };

  return {
    controlled: true,
    allowed: isAuthorized,
    exceeded: true,
    authorized: isAuthorized,
    requiresAuthorization: !isAuthorized,
    clearAuthorization: false,
    maxDiscountPercentAllowed: round2(maxDiscountPercentAllowed),
    maxDiscountValueAllowed: round2(maxDiscountValueAllowed),
    effectiveDiscountPercent: round2(displayRequestedPercent),
    effectiveDiscountValue: round2(effectiveDiscountValue),
    violation,
  };
}

export interface OrderDiscountValidationResult {
  valid: boolean;
  violations: Array<{
    itemIndex: number;
    item: OrderItem;
    violation: DiscountViolationDetails;
  }>;
  validAuthorizations: DiscountAuthorizationRecord[];
}

/**
 * Valida TODOS os itens de um pedido/venda (incluindo descontos por item, alterações manuais
 * de preço unitário e rateio proporcional do desconto geral do pedido).
 * Utilizada tanto na UI (antes da confirmação) quanto na camada de persistência (Database).
 */
export function validateOrderDiscounts(params: {
  items: OrderItem[];
  products: Product[];
  companyId: string;
  origin: OrderOrigin | 'edicao_pedido';
  globalOrderDiscountValue?: number;
  saleSessionId?: string;
  existingOrder?: Order | null;
  users?: User[];
}): OrderDiscountValidationResult {
  const {
    items,
    products,
    companyId,
    origin,
    globalOrderDiscountValue = 0,
    saleSessionId,
    existingOrder,
    users,
  } = params;

  const subtotalAfterItems = items.reduce((sum, item) => {
    const lineNet =
      Number.isFinite(item.totalPrice) && item.totalPrice >= 0
        ? item.totalPrice
        : Math.max(0, item.quantity * item.unitPrice - (item.discountValue || 0));
    return sum + lineNet;
  }, 0);

  const safeGlobalDiscount = Math.max(0, Number.isFinite(globalOrderDiscountValue) ? globalOrderDiscountValue : 0);

  const violations: OrderDiscountValidationResult['violations'] = [];
  const validAuthorizations: DiscountAuthorizationRecord[] = [];

  items.forEach((item, idx) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product || !product.maxDiscountEnabled) {
      return;
    }

    const lineNet =
      Number.isFinite(item.totalPrice) && item.totalPrice >= 0
        ? item.totalPrice
        : Math.max(0, item.quantity * item.unitPrice - (item.discountValue || 0));

    const globalDiscountShare =
      safeGlobalDiscount > 0 && subtotalAfterItems > 0
        ? (lineNet / subtotalAfterItems) * safeGlobalDiscount
        : 0;

    const baselineItem = existingOrder?.items?.find((bi) => bi.productId === item.productId) || null;

    const evaluation = evaluateItemMaxDiscount({
      product,
      companyId,
      origin,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      referenceUnitPrice: item.referenceUnitPrice,
      priceOverridden: item.priceOverridden,
      priceOverriddenByRole: item.priceOverriddenByRole,
      itemDiscountValue: item.discountValue || 0,
      itemDiscountPercent: item.discountPercent || 0,
      globalDiscountShare,
      existingAuthorization: item.discountAuthorization || null,
      saleSessionId,
      persistedBaselineItem: baselineItem,
      users,
    });

    if (evaluation.requiresAuthorization && evaluation.violation) {
      violations.push({
        itemIndex: idx,
        item,
        violation: evaluation.violation,
      });
    } else if (evaluation.exceeded && evaluation.authorized && item.discountAuthorization) {
      validAuthorizations.push({
        ...item.discountAuthorization,
        appliedDiscountPercent: evaluation.effectiveDiscountPercent,
        appliedDiscountValue: evaluation.effectiveDiscountValue,
      });
    }
  });

  return {
    valid: violations.length === 0,
    violations,
    validAuthorizations,
  };
}

/**
 * Formata descrição legível do limite cadastrado no produto para badges, modais e auditoria.
 */
export function formatProductMaxDiscountLabel(product?: Product | null): string {
  if (!product || !product.maxDiscountEnabled) return 'Sem limite individual';
  const val = Number(product.maxDiscountValue ?? 0);
  if (product.maxDiscountType === 'value') {
    return val <= 0 ? 'R$ 0,00 (sem desconto livre)' : `${formatCurrency(val)} / ${product.unit || 'UN'}`;
  }
  return val <= 0 ? '0% (sem desconto livre)' : `${val.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

export function formatDiscountAuthorizationAuditDetails(record: DiscountAuthorizationRecord): string {
  const limitLabel =
    record.limitType === 'value'
      ? `${formatCurrency(record.maxDiscountConfigured)}/un (máx. linha: ${formatCurrency(record.maxDiscountValueAllowed)})`
      : `${record.maxDiscountConfigured.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% (máx. linha: ${formatCurrency(record.maxDiscountValueAllowed)})`;

  const roleLabel = record.authorizerRole === 'admin' ? 'Administrador (Acesso Total)' : 'Gerente Geral';

  return [
    `Op: ${record.operationId}`,
    `Documento: ${record.orderNumber || record.orderId || 'Venda'}`,
    `Produto: [${record.productCode}] ${record.productDescription} (Qtd: ${record.quantity})`,
    `Limite Cadastrado: ${limitLabel}`,
    `Solicitado: ${record.requestedDiscountPercent.toFixed(2)}% (${formatCurrency(record.requestedDiscountValue)})`,
    `Aplicado: ${record.appliedDiscountPercent.toFixed(2)}% (${formatCurrency(record.appliedDiscountValue)})`,
    `Vendedor: ${record.sellerUserName}`,
    `Autorizador: ${record.authorizerUserName} (@${record.authorizerUserLogin} - ${roleLabel})`,
    `Data/Hora: ${new Date(record.authorizedAt).toLocaleString('pt-BR')}`,
  ].join(' | ');
}
