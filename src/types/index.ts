/**
 * Definições de Tipos do Sistema GestãoFácil ERP
 */

export type UserRole = 'admin' | 'gerente' | 'balconista' | 'vendedor_externo' | 'financeiro';

export interface UserPermissions {
  canViewCosts: boolean;
  canEditProducts: boolean;
  canDeleteRecords: boolean;
  canCancelSales: boolean;
  canAuthorizeDiscount: boolean;
  maxDiscountPercent: number;
  canAccessFinancial: boolean;
  canAccessProduction: boolean;
  canAccessPurchases: boolean;
  canManageUsers: boolean;
  canAdjustStock: boolean;
  canCloseCashRegister: boolean;

  // VISIBILIDADE DE INFORMAÇÕES & NÚMEROS DA EMPRESA (KPIS FINANCEIROS)
  canViewGrossProfit?: boolean;    // Visualizar Lucro Bruto (R$ e Margem Bruta)
  canViewNetProfit?: boolean;      // Visualizar Lucro Líquido & DRE (R$)
  canViewTotalRevenue?: boolean;   // Visualizar Faturamento / Receita Total da Empresa
  canViewProfitMargin?: boolean;   // Visualizar Margem de Lucro (%) & Markup
  canViewProductCosts?: boolean;   // Visualizar Custos de Aquisição & CMV dos Produtos
  canViewCashBalances?: boolean;   // Visualizar Saldos Bancários, Caixa e Previsões (A Pagar/Receber)

  // CONTROLE GRANULAR DE MENUS E SUBMENUS PERMITIDOS
  allowedMenuSections?: string[];  // IDs das seções/menus principais permitidos para o usuário
  allowedSubItems?: string[];      // IDs dos submódulos permitidos para o usuário
  gerenteSettingsMigrated?: boolean; // Controle interno de migração para liberar Configurações ao Gerente Geral
  customerVouchersMigrated?: boolean; // Controle interno de migração para liberar Vale (Crédito de Cliente)
}

export interface User {
  id: string;
  name: string;
  login: string;
  password?: string;
  role: UserRole;
  companyId: string;
  status: 'ativo' | 'inativo';
  permissions: UserPermissions;
  email?: string;
  phone?: string;
  allowedCompanyIds?: string[]; // IDs das empresas que o usuário possui permissão de acesso
  commissionPercent?: number; // Percentual padrão de comissão de vendas
  firebaseUid?: string; // UID do usuário vinculado no Firebase Authentication
  updatedAt?: string;
}

export interface Company {
  id: string;
  name: string;
  tradeName: string;
  cnpjCpf: string;
  ie?: string;
  type: 'matriz' | 'filial';
  phone: string;
  email: string;
  address: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  status: 'ativo' | 'inativo';
  logoUrl?: string; // URL da imagem ou Base64 data:image
  createdAt?: string;
  updatedAt?: string;
}

export type ProductType = 'revenda' | 'componente';
export type UnitOfMeasure = 'UN' | 'KG' | 'G' | 'L' | 'ML' | 'M' | 'M²' | 'M³' | 'CX' | 'PCT';

export interface ComponentDefinition {
  id: string;
  code: string; // Código próprio e único do componente
  name: string; // Nome / Descrição do componente
  rawMaterialId: string; // ID da matéria-prima ou insumo associado
  rawMaterialCode?: string;
  rawMaterialDescription?: string;
  unit: UnitOfMeasure;
  notes?: string;
  status: 'ativo' | 'inativo';
  createdAt?: string;
}

export interface ComponentItem {
  componentId: string;
  componentCode: string;
  componentDescription: string;
  rawMaterialId?: string;
  rawMaterialCode?: string;
  rawMaterialDescription?: string;
  unit: UnitOfMeasure;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface Product {
  id: string;
  code: string;
  referenceCode?: string; // Código Referência (código do produto na NF-e do fornecedor)
  description: string;
  unit: UnitOfMeasure;
  costPrice: number;
  salePrice: number;
  family: string;
  group: string;
  barcode: string;
  minStock: number;
  productType: ProductType;
  hasComposition: boolean;
  composition?: ComponentItem[];
  defaultLocationId: string;
  status: 'ativo' | 'inativo';
  notes?: string;
  showSaleAlert?: boolean; // Exibir observação como aviso destacado durante a venda
  supplierId?: string;
  supplierCode?: string;
  taxPercent?: number;
  operatingExpensesPercent?: number;
  salesCommissionPercent?: number;
  otherCostsPercent?: number;
  profitMarginPercent?: number;
  enableAdditionalCosts?: boolean;
  indirectCostPerUnit?: number;
  directLaborCostPerUnit?: number;

  // RECURSO SOLICITADO: EMBALAGEM MASTER
  isMasterPack?: boolean;
  masterPackAssociatedProductId?: string;
  masterPackAssociatedProductCode?: string;
  masterPackAssociatedProductDescription?: string;
  masterPackUnits?: number;
  masterPackPackagingType?: 'caixa' | 'pacote' | 'fardo' | 'display' | 'kit' | 'outro';

  // TABELA DE PREÇOS E PARÂMETROS INDIVIDUAIS POR EMPRESA (MATRIZ E FILIAIS)
  companyPrices?: Record<string, CompanyPriceOverride>;
}

export interface CompanyPriceOverride {
  salePrice: number;
  costPrice?: number;
  minStock?: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface StockLocation {
  id: string;
  code: string;
  name: string;
  companyId: string;
  description: string;
  type: 'materia_prima' | 'revenda' | 'acabados' | 'comercial' | 'almoxarifado' | 'embalagens' | 'outros';
  status: 'ativo' | 'inativo';
}

export interface ProductStockBalance {
  productId: string;
  locationId: string;
  quantity: number;
  reserved: number;
  minStock: number;
  companyId?: string;
  updatedAt?: string;
}

export type MovementType = 
  | 'inicial'
  | 'entrada_compra'
  | 'saida_venda'
  | 'consumo_producao'
  | 'entrada_producao'
  | 'ajuste_inventario'
  | 'perda_avaria'
  | 'devolucao'
  | 'transferencia_saida'
  | 'transferencia_entrada'
  | 'transferencia_empresa_saida'
  | 'transferencia_empresa_entrada';

export interface StockMovement {
  id: string;
  companyId: string;
  productId: string;
  productCode: string;
  productDescription: string;
  locationId: string;
  locationName: string;
  toLocationId?: string;
  toLocationName?: string;
  type: MovementType;
  quantity: number;
  unitCost: number;
  totalCost: number;
  originDocType: 'venda' | 'compra' | 'producao' | 'inventario' | 'transferencia' | 'avulso';
  originDocId: string;
  date: string;
  userId: string;
  userName: string;
  notes?: string;
  isMasterPackMovement?: boolean;
  masterPackProductId?: string;
  masterPackProductCode?: string;
  masterPackUnitsMultiplier?: number;
  // Campos de rastreabilidade para transferência entre Matriz e Filiais
  relatedCompanyId?: string;
  relatedCompanyName?: string;
  relatedLocationId?: string;
  relatedLocationName?: string;
  transferId?: string;
}

export interface CompanyStockTransfer {
  id: string;
  transferNumber: string;
  number?: string; // alias para compatibilidade com templates
  date: string;
  fromCompanyId: string;
  fromCompanyName: string;
  fromLocationId: string;
  fromLocationName: string;
  toCompanyId: string;
  toCompanyName: string;
  toLocationId: string;
  toLocationName: string;
  productId: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  userId: string;
  userName: string;
  status: 'concluido' | 'cancelado';
  notes?: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  companyId?: string;
  code: string;
  name: string;
  tradeName?: string;
  type: 'PF' | 'PJ';
  cpfCnpj: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  marketArea?: string; // Praça / Região comercial
  sellerId?: string; // ID do Vendedor
  sellerName?: string; // Nome do Vendedor responsável
  deliveryRouteId?: string; // ID da Rota de Entrega
  deliveryRouteName?: string; // Nome da Rota de Entrega
  creditLimit: number;
  creditBalance?: number; // Saldo de crédito gerado por devoluções para compras futuras
  creditHistory?: CustomerCreditEntry[]; // Histórico detalhado de créditos e débitos
  preferredPaymentMethod?: string;
  status: 'ativo' | 'inativo';
  notes?: string;
  showSaleAlert?: boolean; // Exibir observação como aviso destacado durante a venda
  createdAt?: string;
  updatedAt?: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  tradeName?: string;
  type: 'PF' | 'PJ';
  cpfCnpj: string;
  contactName?: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  paymentTerms?: string;
  status: 'ativo' | 'inativo';
  notes?: string;
}

export type OrderType = 'venda' | 'orcamento';
export type OrderOrigin = 'pdv' | 'externa_celular' | 'balcao' | 'retaguarda_pedido' | 'pedidos_venda';
export type OrderStatus = 
  | 'em_elaboracao'
  | 'aberto'
  | 'aguardando_aprovacao'
  | 'aprovado'
  | 'convertido_em_venda'
  | 'concluido'
  | 'em_romaneio'
  | 'em_transito'
  | 'entregue'
  | 'nao_entregue'
  | 'cancelado';

export interface OrderItem {
  id: string;
  productId: string;
  productCode: string;
  code?: string;
  description: string;
  unit: UnitOfMeasure;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountValue: number;
  additionPercent?: number;
  additionValue?: number;
  totalPrice: number;
  unitCost: number;
  locationId: string;
  isMasterPack?: boolean;
  masterPackUnits?: number;
  masterPackAssociatedProductId?: string;
  masterPackAssociatedProductCode?: string;
  returnedQuantity?: number; // Quantidade deste item já devolvida em devoluções anteriores
}

export interface PaymentInstallment {
  installmentNumber: number;
  dueDate: string;
  value: number;
  status: 'aberto' | 'pago';
}

export interface Order {
  id: string;
  number: string;
  type: OrderType;
  origin: OrderOrigin;
  companyId: string;
  customerId?: string;
  customerName: string;
  customerCpfCnpj?: string;
  customerPhone?: string;
  userId: string;
  userName: string;
  items: OrderItem[];
  subtotal: number;
  discountTotal: number;
  freightTotal?: number;
  additionTotal?: number;
  total: number;
  paymentMethod: 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito' | 'boleto' | 'crediario' | 'multiplo';
  paymentTerm?: string;
  multiplePayments?: {
    method: string;
    amount: number;
  }[];
  bankAccountId?: string;
  bankAccountName?: string;
  installmentsCount: number;
  installments?: PaymentInstallment[];
  receivedAmount: number;
  changeAmount: number;
  status: OrderStatus;
  returnStatus?: 'sem_devolucao' | 'devolucao_parcial' | 'devolucao_total'; // Situação de devolução
  returnedAmount?: number; // Total acumulado devolvido financeiramente
  returnCount?: number; // Quantidade de devoluções registradas para este pedido
  validityDate?: string;
  notes?: string;
  stockDeducted: boolean;
  financialGenerated: boolean;
  convertedFromOrderId?: string;
  deliveryStatus?: 'pendente' | 'em_romaneio' | 'em_transito' | 'entregue' | 'nao_entregue';
  deliveryManifestId?: string;
  deliveryManifestNumber?: string;
  deliveryManifestName?: string;
  preManifestStatus?: OrderStatus;
  preManifestDeliveryStatus?: 'pendente' | 'em_romaneio' | 'em_transito' | 'entregue' | 'nao_entregue';
  createdAt: string;
  updatedAt: string;
}

export interface CashMovement {
  id: string;
  type: 'suprimento' | 'sangria' | 'venda_dinheiro' | 'venda_pix' | 'venda_cartao' | 'venda_outros' | 'devolucao_estorno';
  amount: number;
  description: string;
  timestamp: string;
  userId: string;
  orderId?: string;
  returnId?: string;
}

export interface CashRegister {
  id: string;
  companyId: string;
  userId: string;
  userName: string;
  terminalNumber?: string;
  openedAt: string;
  closedAt?: string;
  initialBalance: number;
  status: 'aberto' | 'fechado';
  movements: CashMovement[];
  reportedBalance?: {
    dinheiro: number;
    pix: number;
    cartao: number;
    outros: number;
  };
  expectedBalance?: {
    dinheiro: number;
    pix: number;
    cartao: number;
    outros: number;
  };
  difference?: number;
  closingNotes?: string;
}

export interface AccountReceivable {
  id: string;
  companyId: string;
  orderId?: string;
  orderNumber?: string;
  customerId?: string;
  customerName: string;
  docNumber: string;
  installmentNumber: number;
  totalInstallments: number;
  issueDate: string;
  dueDate: string;
  originalValue: number;
  discount: number;
  addition: number;
  paidValue: number;
  balance: number;
  paymentMethod: string;
  bankAccountId?: string;
  bankAccountName?: string;
  bankCode?: string;
  status: 'aberto' | 'parcial' | 'recebido' | 'vencido' | 'cancelado';
  receipts: {
    date: string;
    amount: number;
    method: string;
    userId: string;
    notes?: string;
  }[];
  history?: string; // Histórico contábil / descritivo do lançamento
  notes?: string;

  // CLASSIFICAÇÃO PELO PLANO DE CONTAS (CÓDIGO DE LANÇAMENTO DE 3 DÍGITOS)
  chartAccountId?: string;
  chartAccountCode?: string; // Código hierárquico (ex: "1.1.01")
  launchCode?: string; // Código curto de 3 dígitos (ex: "101")
  chartAccountName?: string; // Nome da conta analítica
  classificationStatus?: 'classificado' | 'pendente';
  classifiedAt?: string;
  classifiedBy?: string;
}

export interface AccountPayable {
  id: string;
  companyId: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  supplierId?: string;
  supplierName: string;
  description: string;
  category: 'fornecedores' | 'aluguel' | 'energia' | 'agua' | 'internet_telefone' | 'salarios' | 'impostos' | 'administrativo' | 'outros';
  docNumber: string;
  paymentMethod?: string; // Forma de Pagamento (ex: Boleto, Pix, Transferência)
  history?: string; // Histórico contábil / detalhado do lançamento
  installmentNumber: number;
  totalInstallments: number;
  issueDate: string;
  dueDate: string;
  originalValue: number;
  discount: number;
  addition: number;
  paidValue: number;
  balance: number;
  status: 'aberto' | 'parcial' | 'pago' | 'vencido' | 'cancelado';
  payments: {
    date: string;
    amount: number;
    method: string;
    userId: string;
    notes?: string;
  }[];
  notes?: string;

  // CLASSIFICAÇÃO PELO PLANO DE CONTAS (CÓDIGO DE LANÇAMENTO DE 3 DÍGITOS)
  chartAccountId?: string;
  chartAccountCode?: string; // Código hierárquico (ex: "4.2.01")
  launchCode?: string; // Código curto de 3 dígitos (ex: "101")
  chartAccountName?: string; // Nome da conta analítica (ex: "Combustível de veículos de entrega")
  classificationStatus?: 'classificado' | 'pendente';
  classifiedAt?: string;
  classifiedBy?: string;

  // INTEGRAÇÃO COM NF-e XML & RATEIO MULTI-CONTAS
  nfeAccessKey?: string; // Chave de acesso SEFAZ de 44 dígitos
  nfeNumber?: string;
  itemClassifications?: NfeItemClassification[];
}

export interface PurchaseOrderItem {
  productId: string;
  productCode: string;
  description: string;
  buyUnit: UnitOfMeasure;
  saleUnit: UnitOfMeasure;
  packageFactor: number;
  buyQuantity: number;
  unitCost: number;
  discount: number;
  freightApportioned: number;
  otherExpensesApportioned: number;
  totalCost: number;
  receivedQuantity: number;
  pendingQuantity: number;
  destinationLocationId: string;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  companyId: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  expectedDeliveryDate: string;
  paymentTerms: string;
  installmentsCount: number;
  status: 'rascunho' | 'aguardando_entrega' | 'parcialmente_recebido' | 'concluido' | 'cancelado';
  items: PurchaseOrderItem[];
  subtotal: number;
  discountTotal: number;
  freightTotal: number;
  otherExpensesTotal: number;
  total: number;
  notes?: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface PurchaseReceipt {
  id: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  companyId: string;
  receiptDate: string;
  invoiceNumber?: string;
  userId: string;
  userName: string;
  items: {
    productId: string;
    productCode: string;
    description: string;
    receivedQuantity: number;
    locationId: string;
    effectiveUnitCost: number;
  }[];
  notes?: string;
  accountsPayableGenerated: boolean;
}

export interface ProductionOrderItem {
  productId: string;
  productCode: string;
  productDescription: string;
  plannedQuantity: number;
  producedQuantity: number;
  destinationLocationId?: string;
  unitCost: number;
  totalCost: number;
  componentsConsumed?: {
    componentId: string;
    componentCode: string;
    description: string;
    unit: UnitOfMeasure;
    plannedQty: number;
    actualQty: number;
    locationId: string;
    unitCost: number;
    totalCost: number;
  }[];
}

export interface ProductionOrder {
  id: string;
  number: string;
  companyId: string;
  productId: string;
  productCode: string;
  productDescription: string;
  unit?: string;
  startDate?: string;
  dueDate?: string;
  plannedQuantity: number;
  producedQuantity: number;
  destinationLocationId: string;
  items?: ProductionOrderItem[];
  componentsConsumed: {
    componentId: string;
    componentCode: string;
    description: string;
    unit: UnitOfMeasure;
    plannedQty: number;
    actualQty: number;
    locationId: string;
    unitCost: number;
    totalCost: number;
  }[];
  totalCost: number;
  unitCost: number;
  status: 'aberta' | 'concluida' | 'cancelada';
  orderDate: string;
  completionDate?: string;
  userId: string;
  userName: string;
  notes?: string;
}

export interface TransferOrder {
  id: string;
  number: string;
  companyId: string;
  date: string;
  originLocationId: string;
  destinationLocationId: string;
  productId: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  userId: string;
  userName: string;
  notes?: string;
  status: 'concluida' | 'cancelada';
}

export interface InventoryCount {
  id: string;
  companyId: string;
  date: string;
  locationId: string;
  locationName: string;
  userId: string;
  userName: string;
  status: 'rascunho' | 'concluido';
  items: {
    productId: string;
    productCode: string;
    description: string;
    systemQuantity: number;
    countedQuantity: number;
    difference: number;
    reason?: string;
  }[];
  notes?: string;
}

export interface AuditLog {
  id: string;
  companyId: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  recordId: string;
  details: string;
  timestamp: string;
}

export type ThermalPaperWidth = '58mm' | '80mm';
export type HeaderFormatType = 'completo' | 'simplificado' | 'compacto' | 'personalizado';
export type PrintDocumentFormat = 'a4' | 'thermal';
export type A4HeaderStyle = 'classico_timbrado' | 'moderno_minimalista' | 'corporativo';
export type A4MarginType = 'compacta' | 'padrao' | 'ampla';

export interface ThermalPrinterConfig {
  // Configurações de Impressora Térmica
  paperWidth: ThermalPaperWidth;
  headerFormat: HeaderFormatType;
  headerAlignment: 'center' | 'left';
  showTradeName: boolean;
  showCnpj: boolean;
  showPhone: boolean;
  showAddress: boolean;
  customHeaderText?: string;
  footerMessage?: string;
  marginLeft: number; // in mm
  marginRight: number; // in mm
  fontSize: 'pequena' | 'normal' | 'grande';
  autoCut: boolean;

  // Configurações de Impressão em Folha A4
  a4HeaderStyle?: A4HeaderStyle;
  a4ShowLogo?: boolean;
  a4ShowReceiptStub?: boolean; // Canhoto de recebimento/entrega para assinatura
  a4ShowFinancialSummary?: boolean; // Quadro de resumo financeiro e condições
  a4ShowCommercialTerms?: boolean; // Termos de garantia e validade da proposta
  a4CommercialTermsText?: string;
  a4ShowSignatures?: boolean;
  a4Margin?: A4MarginType;
  a4Orientation?: 'portrait' | 'landscape';

  // Padrão de Impressão por Módulo do ERP (A4 vs Térmico 80mm)
  defaultSalesOrderFormat?: PrintDocumentFormat;
  defaultExternalSalesFormat?: PrintDocumentFormat;
  defaultProductionOrderFormat?: PrintDocumentFormat;
  defaultManifestFormat?: PrintDocumentFormat;
  defaultPosFormat?: PrintDocumentFormat;

  // Quantidade de Vias de Impressão do Pedido de Venda e Orçamento
  orderPrintCopies?: number; // Quantidade de vias a imprimir (1, 2, 3, etc.) - Padrão 1
  orderCopiesLabelMode?: 'padrao' | 'nenhum'; // Se exibe identificação da via (ex: '1ª VIA - CLIENTE', '2ª VIA - ESTABELECIMENTO')
  orderColorMode?: 'colorido' | 'preto_branco'; // Modo de cor na impressão do Pedido de Venda (Colorido ou Preto e Branco)
}

export type PaymentMethodType = 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto' | 'crediario' | 'outro';

export interface PaymentMethodRecord {
  id: string;
  companyId?: string;
  code: string;
  name: string;
  type: PaymentMethodType;
  feePercent: number;
  daysToReceive: number;
  defaultAccountId?: string;
  allowInstallments: boolean;
  maxInstallments?: number;
  status: 'ativo' | 'inativo';
  notes?: string;
  createdAt: string;
}

export type FinancialAccountType = 'caixa' | 'corrente' | 'poupanca' | 'investimento' | 'outra';

export interface FinancialAccountRecord {
  id: string;
  companyId: string;
  code: string;
  name: string;
  type: FinancialAccountType;
  bankCode?: string;
  bankName?: string;
  agency?: string;
  accountNumber?: string;
  initialBalance: number;
  currentBalance: number;
  isDefault: boolean;
  status: 'ativo' | 'inativo';
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PaymentTermRecord {
  id: string;
  companyId: string;
  code: string;
  name: string;
  installmentsCount: number;
  daysIntervals: string;
  percentAdditionOrDiscount: number;
  minOrderValue?: number;
  isSystemDefault?: boolean;
  status: 'ativo' | 'inativo';
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SidebarMenuConfig {
  hiddenSections: string[];
  hiddenSubItems: string[];
}

// ==========================================
// MÓDULO DE EXPEDIÇÃO & ROTAS DE ENTREGA
// ==========================================

export interface DeliveryRoute {
  id: string;
  companyId: string;
  code: string;
  name: string;
  description?: string;
  active: boolean;
  color?: string; // Cor visual (ex: blue, emerald, amber, purple, rose)
  cities: string[]; // Cidades associadas
  neighborhoods: string[]; // Bairros associados
  marketAreas: string[]; // Praças associadas
  sellerNames: string[]; // Vendedores associados
  estimatedDeliveryWindow?: string; // Ex: "Manhã (08h às 12h)", "Tarde (13h às 18h)"
  vehicleTypeRecommendation?: string; // Ex: "Fiorino / Van", "Caminhão 3/4"
  minimumOrderValue?: number; // Valor financeiro mínimo acumulado na rota para abertura de romaneio (R$)
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryManifestOrderItem {
  productId: string;
  productCode: string;
  description: string;
  unit: UnitOfMeasure;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface DeliveryManifestOrder {
  orderId: string;
  orderNumber: string;
  orderDate?: string;
  customerId: string;
  customerCode?: string;
  customerName: string;
  customerPhone?: string;
  customerCpfCnpj?: string;
  address: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode?: string;
    complement?: string;
  };
  marketArea?: string; // Praça
  sellerName?: string; // Vendedor
  sequence: number; // Ordem da entrega (1ª, 2ª, 3ª...)
  totalValue: number;
  paymentMethod: string;
  paymentStatus: 'pago_antecipado' | 'cobrar_na_entrega';
  amountToCollect?: number; // Valor em aberto para cobrar na entrega
  deliveryStatus: 'pendente' | 'entregue' | 'nao_entregue';
  deliveryFailureReason?: string; // Motivo da não entrega
  deliveredAt?: string;
  deliveryNotes?: string;
  previousOrderStatus?: OrderStatus; // Status de origem antes de entrar no romaneio
  previousDeliveryStatus?: 'pendente' | 'em_romaneio' | 'em_transito' | 'entregue' | 'nao_entregue';
  items: DeliveryManifestOrderItem[];
  volumesCount?: number;
}

export interface DeliveryDriver {
  id: string;
  companyId: string;
  name: string;
  cpf?: string;
  phone?: string;
  cnhNumber: string;
  cnhCategory: string; // Ex: A, B, AB, C, D, E
  cnhExpirationDate: string; // YYYY-MM-DD
  admissionDate?: string; // YYYY-MM-DD
  defaultVehicleId?: string;
  status: 'ativo' | 'inativo';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryVehicle {
  id: string;
  companyId: string;
  plate: string;
  model: string;
  type: string; // Ex: Utilitário / Fiorino, Van, Caminhão 3/4, Moto, Carro
  year?: string;
  renavam?: string;
  capacityKg?: number;
  licensingExpirationDate: string; // YYYY-MM-DD (Licenciamento / CRLV)
  insuranceExpirationDate?: string; // YYYY-MM-DD (Opcional: Seguro / Revisão)
  status: 'ativo' | 'manutencao' | 'inativo';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryManifest {
  id: string;
  number: string; // Ex: ROM-2026-0001
  name?: string; // Nome personalizado do romaneio de entrega
  companyId: string;
  date: string; // Data de criação
  departureDate: string; // Data de saída prevista
  routeId?: string;
  routeName?: string;
  driverId?: string; // Referência ao motorista cadastrado
  driverName: string; // Motorista / Entregador
  driverPhone?: string;
  vehicleId?: string; // Referência ao veículo cadastrado
  vehiclePlate: string; // Placa do veículo
  vehicleModel?: string; // Modelo (ex: Fiat Fiorino, VW Delivery)
  status: 'planejado' | 'em_transito' | 'entregue' | 'cancelado';
  notes?: string;
  orders: DeliveryManifestOrder[];
  // Totais consolidados
  totalOrders: number;
  totalDelivered: number;
  totalPending: number;
  totalValue: number;
  totalAmountToCollect: number;
  totalVolumes: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ==========================================
// CADASTRO DE LOCALIDADES (PRAÇA, BAIRRO, CIDADE, ESTADO)
// ==========================================

export interface MarketAreaItem {
  id: string;
  name: string; // Ex: "Zona Norte", "Centro Expandido", "Zona Sul / ABC"
  description?: string;
  defaultRouteId?: string; // ID da Rota de Entrega vinculada
  defaultRouteName?: string; // Nome da Rota vinculada
  cities?: string[]; // Nomes de cidades atendidas
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface StateItem {
  id: string;
  uf: string; // Ex: "SP", "RJ", "MG"
  name: string; // Ex: "São Paulo", "Rio de Janeiro"
  region: 'Sudeste' | 'Sul' | 'Centro-Oeste' | 'Nordeste' | 'Norte';
  active: boolean;
  createdAt: string;
}

export interface CityItem {
  id: string;
  name: string; // Ex: "Feira de Santana", "Alagoinhas"
  stateUf: string; // Ex: "BA"
  marketAreaId?: string; // ID da Praça vinculada
  marketAreaName?: string; // Nome da Praça vinculada (ex: "Feira de Santana - Sede")
  defaultRouteId?: string; // Rota padrão de entrega
  defaultRouteName?: string;
  ibgeCode?: string;
  distanceKm?: number; // Distância aproximada de Feira de Santana (km)
  isSystemDefault?: boolean; // Cidade padrão do sistema (Bahia)
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface NeighborhoodItem {
  id: string;
  name: string; // Ex: "Santana", "Pinheiros", "Moema"
  cityName: string; // Ex: "São Paulo"
  stateUf: string; // Ex: "SP"
  marketAreaId?: string; // ID da Praça vinculada
  marketAreaName?: string; // Nome da Praça vinculada
  defaultRouteId?: string; // Rota padrão de entrega
  defaultRouteName?: string;
  zipCodePrefix?: string; // Prefixo CEP (ex: "020", "014")
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface StockControlConfig {
  enableStockControl: boolean; // Se ativado, o sistema gerencia o estoque; se desativado, permite vender livremente
  allowNegativeStock: boolean; // Se ativado, permite concluir vendas no PDV, Pedido e Mobile mesmo com estoque negativo/zerado
}

// =========================================================================
// PLANO DE CONTAS INDUSTRIAL E COMERCIAL + DRE GERENCIAL
// =========================================================================

export type AccountNature =
  | 'receita'
  | 'deducao'
  | 'custo'
  | 'despesa'
  | 'receita_financeira'
  | 'despesa_financeira'
  | 'outras'
  | 'nao_dre';

export type AccountType = 'sintetica' | 'analitica';

export type DreGroup =
  | '1_RECEITAS'
  | '2_DEDUCOES'
  | '3_CUSTOS'
  | '4_DESPESAS_COMERCIAIS_LOGISTICA'
  | '5_DESPESAS_ADMINISTRATIVAS'
  | '6_DESPESAS_FINANCEIRAS'
  | '7_RECEITAS_FINANCEIRAS'
  | '8_OUTRAS_DESPESAS'
  | '9_NAO_DRE';

export type DreLineKey =
  | 'venda_revenda'
  | 'venda_fabricados'
  | 'outras_receitas'
  | 'devolucoes'
  | 'descontos'
  | 'cancelamentos'
  | 'impostos'
  | 'cmv'
  | 'cpv'
  | 'despesas_vendas'
  | 'despesas_logistica'
  | 'despesas_estrutura'
  | 'despesas_gerais'
  | 'despesas_pessoal'
  | 'despesas_financeiras'
  | 'receitas_financeiras'
  | 'outras_despesas'
  | 'nao_dre';

export interface ChartOfAccount {
  id: string;
  companyId?: string; // Se omitido ou 'todos', compartilhado entre matriz e filiais
  hierarchicalCode: string; // Ex: "4.2.01" ou "1.1"
  code?: string; // Alias para hierarchicalCode para compatibilidade
  launchCode?: string; // Código exclusivo de 3 dígitos (apenas para analíticas, ex: "101")
  name: string; // Ex: "Combustível de veículos de entrega"
  type: AccountType; // "sintetica" (totalizador) ou "analitica" (recebe lançamentos)
  level: number; // 1 (Grupo principal), 2 (Subgrupo), 3 (Conta analítica)
  parentCode?: string; // Ex: "4.2"
  nature: AccountNature;
  dreGroup: DreGroup;
  dreLine: DreLineKey;
  status: 'ativo' | 'inativo';
  isSystem?: boolean; // Contas padrão do sistema
  description?: string;
  order: number;
}

// =========================================================================
// INTEGRAÇÃO DE IMPORTAÇÃO DE NF-e XML COM PLANO DE CONTAS & ESTOQUE
// =========================================================================

export interface NfeItemClassification {
  productId?: string;
  productCode?: string;
  description: string;
  amount: number;
  quantity?: number;
  unit?: string;
  chartAccountId?: string;
  chartAccountCode?: string; // ex: "9.1.02"
  launchCode?: string;       // ex: "202"
  chartAccountName?: string; // ex: "Compra de matérias-primas"
  percentage?: number;
}

export interface NfeParsedProduct {
  itemNumber: number;
  code: string;
  barcode?: string;
  description: string;
  ncm: string;
  cfop: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discount: number;
  freight: number;
  insurance: number;
  otherExpenses: number;
  icmsAmount: number;
  ipiAmount: number;
  pisAmount: number;
  cofinsAmount: number;

  // Associação com produto do catálogo
  matchedProductId?: string;
  matchedProductCode?: string;
  matchedProductDescription?: string;
  autoMatched?: boolean;
  destinationLocationId?: string;

  // Classificação contábil individual no Plano de Contas
  chartAccountId?: string;
  chartAccountCode?: string;
  launchCode?: string;
  chartAccountName?: string;
}

export interface NfeParsedInstallment {
  number: string;
  installmentNumber: number;
  dueDate: string;
  value: number;
}

export interface NfeParsedData {
  accessKey: string; // 44 dígitos
  number: string;
  series: string;
  issueDate: string;
  operationNature: string;

  // Emitente (Fornecedor)
  supplierCpfCnpj: string;
  supplierName: string;
  supplierTradeName?: string;
  supplierIe?: string;
  supplierPhone?: string;
  supplierAddress?: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };

  // Destinatário
  destCpfCnpj?: string;
  destName?: string;
  destIe?: string;

  // Totais
  productsTotal: number;
  freightTotal: number;
  insuranceTotal: number;
  discountTotal: number;
  otherExpensesTotal: number;
  icmsTotal: number;
  ipiTotal: number;
  pisTotal: number;
  cofinsTotal: number;
  invoiceTotal: number;

  // Itens e Duplicatas
  items: NfeParsedProduct[];
  installments: NfeParsedInstallment[];
}

export interface NfeImportRecord {
  id: string;
  accessKey: string;
  nfeNumber: string;
  series?: string;
  companyId: string;
  companyName: string;
  supplierId: string;
  supplierName: string;
  supplierCnpj: string;
  issueDate: string;
  importDate: string;
  totalValue: number;
  itemsCount: number;
  userId: string;
  userName: string;
  purchaseOrderId?: string;
  payablesCount?: number;
  classificationsSummary?: string;
}

export interface SupplierProductMapping {
  supplierCnpj: string;
  supplierProdCode: string;
  systemProductId: string;
  defaultChartAccountId?: string;
  defaultLaunchCode?: string;
  lastUsedAt: string;
}

// ==========================================
// MÓDULO DE DEVOLUÇÃO DE VENDAS
// ==========================================

export type SalesReturnReason =
  | 'produto_defeito'
  | 'produto_danificado'
  | 'produto_incorreto'
  | 'desistencia_cliente'
  | 'divergencia_pedido'
  | 'outros';

export type SalesReturnCondition =
  | 'revenda'             // Em condições de revenda (retorna ao saldo disponível para venda)
  | 'avaria_quarentena'   // Com avaria ou em quarentena (estoque de avaria, não vendável)
  | 'sem_aproveitamento'; // Sem condições de aproveitamento / perda total (não retorna ao estoque)

export type SalesReturnResolution =
  | 'estorno_restituicao' // Restituição/estorno imediato ao cliente (dinheiro, pix, conta bancária)
  | 'credito_cliente'     // Crédito na conta corrente do cliente para compras futuras
  | 'abatimento_receber'; // Abatimento proporcional em títulos a receber em aberto

export type SalesReturnStatus = 'concluida' | 'cancelada';
export type SalesReturnType = 'parcial' | 'total';

export interface CustomerCreditEntry {
  id: string;
  date: string;
  amount: number;
  type: 'devolucao' | 'utilizacao' | 'ajuste' | 'estorno';
  returnId?: string;
  orderId?: string;
  description: string;
  createdAt: string;
}

export interface SalesReturnItem {
  id: string;
  orderItemId: string;
  productId: string;
  productCode: string;
  description: string;
  unit: string;
  originalQuantity: number;
  previouslyReturnedQuantity: number;
  availableQuantity: number;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  unitDiscount: number;
  totalPrice: number;       // quantity * unitPrice
  totalDiscount: number;    // quantity * unitDiscount
  totalNet: number;         // totalPrice - totalDiscount
  condition: SalesReturnCondition;
  locationId: string;
  locationName?: string;
  notes?: string;
}

export interface SalesReturn {
  id: string;
  number: string; // Ex: DEV-2026-0001
  orderId: string;
  orderNumber: string;
  companyId: string;
  companyName?: string;
  customerId?: string;
  customerName: string;
  customerCpfCnpj?: string;
  sellerId?: string;
  sellerName?: string;
  sellerCommissionRate?: number;
  reversedCommissionAmount?: number;
  origin: OrderOrigin;
  channelLabel: string;
  date: string;
  status: SalesReturnStatus;
  returnType: SalesReturnType;
  reason: SalesReturnReason;
  reasonDetails?: string;
  items: SalesReturnItem[];
  subtotalReturned: number;
  discountProportional: number;
  totalReturned: number;
  totalCmvReversed: number; // Custo das mercadorias retornadas em condição de revenda
  totalCmvLost: number;     // Custo das mercadorias avariadas ou sem aproveitamento
  financialResolution: SalesReturnResolution;
  refundMethod?: string;
  refundCashRegisterMovementId?: string;
  refundBankAccountId?: string;
  refundBankAccountName?: string;
  creditGeneratedAmount?: number;
  receivableAdjustedId?: string;
  receivableAdjustedDocNumber?: string;
  receivableAdjustedAmount?: number;
  fiscalDocNumber?: string;
  fiscalAccessKey?: string;
  fiscalNotes?: string;
  userId: string;
  userName: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledByName?: string;
  cancelledReason?: string;
}

// ==========================================
// MÓDULO FINANCEIRO: VALE (CRÉDITO DE CLIENTE)
// ==========================================

export type CustomerVoucherOrigin =
  | 'adiantamento'
  | 'devolucao'
  | 'bonificacao'
  | 'credito_comercial'
  | 'outros';

export interface CustomerVoucherUsage {
  id: string;
  date: string;
  amount: number;
  receivableId: string;
  receivableDocNumber: string;
  userId: string;
  userName: string;
  notes?: string;
}

export interface CustomerVoucher {
  id: string;
  code: string; // Ex: VALE-2026-0001
  companyId: string;
  companyName?: string;
  customerId: string;
  customerCode?: string;
  customerName: string;
  customerCpfCnpj?: string;
  origin: CustomerVoucherOrigin;
  reason: string;
  issueDate: string; // YYYY-MM-DD
  expirationDate?: string; // YYYY-MM-DD (opcional)
  originalAmount: number;
  usedAmount: number;
  remainingBalance: number;
  status: 'ativo' | 'utilizado_parcial' | 'utilizado_total' | 'cancelado';
  notes?: string;
  usages: CustomerVoucherUsage[];
  userId: string;
  userName: string;
  createdAt: string;
  updatedAt: string;
}
