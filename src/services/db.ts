/**
 * Banco de Dados Persistente Local (Local Storage + In-Memory Reactive Cache)
 * Fornece persistência imediata, integridade relacional e carga inicial completa.
 */

import {
  Company,
  User,
  UserRole,
  UserPermissions,
  Product,
  StockLocation,
  ProductStockBalance,
  StockMovement,
  Customer,
  Supplier,
  Order,
  OrderStatus,
  CashRegister,
  AccountReceivable,
  AccountPayable,
  PurchaseOrder,
  PurchaseReceipt,
  ProductionOrder,
  TransferOrder,
  InventoryCount,
  AuditLog,
  ThermalPrinterConfig,
  ComponentDefinition,
  PaymentMethodRecord,
  FinancialAccountRecord,
  PaymentTermRecord,
  SidebarMenuConfig,
  DeliveryRoute,
  DeliveryDriver,
  DeliveryVehicle,
  DeliveryManifest,
  DeliveryManifestOrder,
  DeliveryManifestOrderItem,
  MarketAreaItem,
  StateItem,
  CityItem,
  NeighborhoodItem,
  StockControlConfig,
  CompanyPriceOverride,
  CompanyStockTransfer,
  ChartOfAccount,
  NfeImportRecord,
  SupplierProductMapping,
  SalesReturn,
  SalesReturnItem,
  SalesReturnReason,
  SalesReturnCondition,
  SalesReturnResolution,
  CustomerCreditEntry,
  CustomerVoucher,
  CustomerVoucherOrigin,
  CustomerVoucherUsage,
  DiscountAuthorizationRecord,
} from '../types';
import { DEFAULT_CHART_OF_ACCOUNTS } from './defaultChartOfAccounts';
import {
  clearSaleSessionAuthorizations,
  formatDiscountAuthorizationAuditDetails,
  validateOrderDiscounts,
} from './discountControl';

export const DEFAULT_STOCK_CONTROL_CONFIG: StockControlConfig = {
  enableStockControl: true,
  allowNegativeStock: false,
};

export const DEFAULT_PRINTER_CONFIG: ThermalPrinterConfig = {
  paperWidth: '80mm',
  headerFormat: 'completo',
  headerAlignment: 'center',
  showTradeName: true,
  showCnpj: true,
  showPhone: true,
  showAddress: true,
  customHeaderText: '',
  footerMessage: '*** DOCUMENTO NÃO FISCAL ***\nObrigado pela preferência e confiança!',
  marginLeft: 2,
  marginRight: 2,
  fontSize: 'normal',
  autoCut: true,
  a4HeaderStyle: 'classico_timbrado',
  a4ShowLogo: true,
  a4ShowReceiptStub: true,
  a4ShowFinancialSummary: true,
  a4ShowCommercialTerms: true,
  a4CommercialTermsText: 'Orçamento/Pedido válido por 10 dias úteis. As mercadorias devem ser conferidas no ato da entrega. Garantia legal de 90 dias conforme CDC.',
  a4ShowSignatures: true,
  a4Margin: 'padrao',
  a4Orientation: 'portrait',
  defaultSalesOrderFormat: 'a4',
  defaultExternalSalesFormat: 'a4',
  defaultProductionOrderFormat: 'a4',
  defaultManifestFormat: 'a4',
  defaultPosFormat: 'thermal',
  orderPrintCopies: 1,
  orderCopiesLabelMode: 'padrao',
  orderColorMode: 'colorido',
};

const DB_KEY_PREFIX = 'omnicomercio_v1_';
const ACTIVE_FIREBASE_PROJECT_ID = 'gestaofacilerp-paulocesarmc';

export interface DatabaseState {
  companies: Company[];
  users: User[];
  deletedUserIds?: string[];
  currentCompanyId: string;
  currentUserId: string;
  stockLocations: StockLocation[];
  products: Product[];
  components?: ComponentDefinition[];
  stockBalances: ProductStockBalance[];
  stockMovements: StockMovement[];
  customers: Customer[];
  suppliers: Supplier[];
  orders: Order[];
  cashRegisters: CashRegister[];
  accountsReceivable: AccountReceivable[];
  accountsPayable: AccountPayable[];
  purchaseOrders: PurchaseOrder[];
  purchaseReceipts: PurchaseReceipt[];
  productionOrders: ProductionOrder[];
  transferOrders: TransferOrder[];
  inventoryCounts: InventoryCount[];
  auditLogs: AuditLog[];
  auditLogsClearedAt?: string;
  printerConfig?: ThermalPrinterConfig;
  hideOverdueAlert?: boolean;
  stockControlConfig?: StockControlConfig;
  paymentMethods?: PaymentMethodRecord[];
  financialAccounts?: FinancialAccountRecord[];
  paymentTermsList?: PaymentTermRecord[];
  sidebarMenuConfig?: SidebarMenuConfig;
  deliveryRoutes?: DeliveryRoute[];
  deliveryDrivers?: DeliveryDriver[];
  deliveryVehicles?: DeliveryVehicle[];
  deliveryManifests?: DeliveryManifest[];
  marketAreas?: MarketAreaItem[];
  states?: StateItem[];
  cities?: CityItem[];
  neighborhoods?: NeighborhoodItem[];
  companyStockTransfers?: CompanyStockTransfer[];
  chartOfAccounts?: ChartOfAccount[];
  nfeImportHistory?: NfeImportRecord[];
  supplierProductMappings?: SupplierProductMapping[];
  salesReturns?: SalesReturn[];
  customerVouchers?: CustomerVoucher[];
}

export const DEFAULT_PAYMENT_METHODS: PaymentMethodRecord[] = [
  {
    id: 'pay-boleto',
    code: 'BOLETO',
    name: 'Boleto Bancário',
    type: 'boleto',
    feePercent: 2.49,
    daysToReceive: 1,
    defaultAccountId: 'acc-itau',
    allowInstallments: true,
    maxInstallments: 12,
    status: 'ativo',
    notes: 'Boleto registrado emitido com código de barras e QR Code Pix',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'pay-pix',
    code: 'PIX',
    name: 'Pix Cobrança Instantâneo',
    type: 'pix',
    feePercent: 0,
    daysToReceive: 0,
    defaultAccountId: 'acc-bb',
    allowInstallments: false,
    maxInstallments: 1,
    status: 'ativo',
    notes: 'Recebimento instantâneo em conta corrente',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'pay-dinheiro',
    code: 'DINHEIRO',
    name: 'Dinheiro em Espécie',
    type: 'dinheiro',
    feePercent: 0,
    daysToReceive: 0,
    defaultAccountId: 'acc-caixa',
    allowInstallments: false,
    maxInstallments: 1,
    status: 'ativo',
    notes: 'Recebimento direto no caixa físico',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'pay-credito',
    code: 'CARTAO_CREDITO',
    name: 'Cartão de Crédito',
    type: 'cartao_credito',
    feePercent: 3.49,
    daysToReceive: 30,
    defaultAccountId: 'acc-bb',
    allowInstallments: true,
    maxInstallments: 12,
    status: 'ativo',
    notes: 'Transações via maquineta / POS ou TEF',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'pay-debito',
    code: 'CARTAO_DEBITO',
    name: 'Cartão de Débito',
    type: 'cartao_debito',
    feePercent: 1.49,
    daysToReceive: 1,
    defaultAccountId: 'acc-bb',
    allowInstallments: false,
    maxInstallments: 1,
    status: 'ativo',
    notes: 'Débito na conta bancária vinculada à maquininha',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'pay-crediario',
    code: 'CREDIARIO',
    name: 'Crediário Próprio',
    type: 'crediario',
    feePercent: 0,
    daysToReceive: 30,
    defaultAccountId: 'acc-caixa',
    allowInstallments: true,
    maxInstallments: 6,
    status: 'ativo',
    notes: 'Financiamento próprio emitido com carnê da loja',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
];

export const DEFAULT_FINANCIAL_ACCOUNTS: FinancialAccountRecord[] = [
  {
    id: 'acc-caixa',
    companyId: 'comp-matriz',
    code: 'CX-01',
    name: 'Caixa Geral Balcão',
    type: 'caixa',
    bankName: 'Caixa Físico Interno',
    initialBalance: 1500.0,
    currentBalance: 1500.0,
    isDefault: true,
    status: 'ativo',
    notes: 'Caixa operacional diário da frente de loja',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'acc-bb',
    companyId: 'comp-matriz',
    code: 'BB-01',
    name: 'Banco do Brasil - C/C Principal',
    type: 'corrente',
    bankCode: '001',
    bankName: 'Banco do Brasil S.A.',
    agency: '3456-7',
    accountNumber: '12345-6',
    initialBalance: 14850.0,
    currentBalance: 14850.0,
    isDefault: false,
    status: 'ativo',
    notes: 'Conta de movimentação comercial e recebimento Pix',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'acc-itau',
    companyId: 'comp-matriz',
    code: 'ITAU-01',
    name: 'Itaú Unibanco - Cobrança & Boleto',
    type: 'corrente',
    bankCode: '341',
    bankName: 'Banco Itaú S.A.',
    agency: '0987',
    accountNumber: '54321-0',
    initialBalance: 8920.0,
    currentBalance: 8920.0,
    isDefault: false,
    status: 'ativo',
    notes: 'Conta convênio para emissão e liquidação de boletos',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
];

export const DEFAULT_PAYMENT_TERMS: PaymentTermRecord[] = [
  {
    id: 'term-avista',
    companyId: '',
    code: 'A_VISTA',
    name: 'À Vista (Imediato)',
    installmentsCount: 1,
    daysIntervals: '0',
    percentAdditionOrDiscount: -3,
    isSystemDefault: true,
    status: 'ativo',
    notes: '3% de desconto para liquidação à vista',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'term-14d',
    companyId: '',
    code: '14D',
    name: '14 Dias Direto',
    installmentsCount: 1,
    daysIntervals: '14',
    percentAdditionOrDiscount: 0,
    isSystemDefault: true,
    status: 'ativo',
    notes: 'Prazo curto faturado em 14 dias',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'term-28d',
    companyId: '',
    code: '28D',
    name: '28 Dias Direto',
    installmentsCount: 1,
    daysIntervals: '28',
    percentAdditionOrDiscount: 0,
    isSystemDefault: true,
    status: 'ativo',
    notes: 'Prazo padrão faturado 28 dias',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'term-30d',
    companyId: '',
    code: '30D',
    name: '30 Dias',
    installmentsCount: 1,
    daysIntervals: '30',
    percentAdditionOrDiscount: 0,
    isSystemDefault: true,
    status: 'ativo',
    notes: 'Vencimento direto em 30 dias',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'term-30-60',
    companyId: '',
    code: '30_60D',
    name: '30 / 60 Dias (2x)',
    installmentsCount: 2,
    daysIntervals: '30, 60',
    percentAdditionOrDiscount: 0,
    isSystemDefault: true,
    status: 'ativo',
    notes: 'Duas parcelas iguais em 30 e 60 dias',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'term-30-60-90',
    companyId: '',
    code: '30_60_90D',
    name: '30 / 60 / 90 Dias (3x)',
    installmentsCount: 3,
    daysIntervals: '30, 60, 90',
    percentAdditionOrDiscount: 2,
    isSystemDefault: true,
    status: 'ativo',
    notes: 'Três parcelas com acréscimo de 2%',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'term-entrada-30-60',
    companyId: '',
    code: 'ENTRADA_30_60D',
    name: 'Entrada + 30 / 60 Dias (3x)',
    installmentsCount: 3,
    daysIntervals: '0, 30, 60',
    percentAdditionOrDiscount: 0,
    isSystemDefault: true,
    status: 'ativo',
    notes: '1ª parcela à vista e as demais em 30 e 60 dias',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
];

export const DEFAULT_COMPONENTS: ComponentDefinition[] = [
  {
    id: 'cmp-001',
    code: 'CMP-001',
    name: 'Base Concentrada Tensoativa',
    rawMaterialId: 'prod-comp-base',
    rawMaterialCode: 'MP-101',
    rawMaterialDescription: 'Base Detergente Tensoativa Concentrada',
    unit: 'L',
    notes: 'Insumo químico para diluição e preparo de formulação líquida',
    status: 'ativo',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'cmp-002',
    code: 'CMP-002',
    name: 'Pigmento Anil Industrial',
    rawMaterialId: 'prod-comp-corante-azul',
    rawMaterialCode: 'MP-103',
    rawMaterialDescription: 'Corante Líquido Azul Anil Industrial',
    unit: 'L',
    notes: 'Corante industrial para ajuste de tonalidade',
    status: 'ativo',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'cmp-003',
    code: 'CMP-003',
    name: 'Frasco PET 500ml Transparente',
    rawMaterialId: 'prod-emb-frasco-500',
    rawMaterialCode: 'EMB-201',
    rawMaterialDescription: 'Frasco PET 500ml Transparente',
    unit: 'UN',
    notes: 'Embalagem plástica transparente linha 500ml',
    status: 'ativo',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'cmp-004',
    code: 'CMP-004',
    name: 'Tampa Flip-Top Rosca 28mm',
    rawMaterialId: 'prod-emb-tampa-flip',
    rawMaterialCode: 'EMB-202',
    rawMaterialDescription: 'Tampa Flip-Top Rosca 28mm Vermelha',
    unit: 'UN',
    notes: 'Tampa com vedação e bico dosador padrão 28mm',
    status: 'ativo',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'cmp-005',
    code: 'CMP-005',
    name: 'Fragrância Floral Lavanda Francesa',
    rawMaterialId: 'prod-comp-essencia-lavanda',
    rawMaterialCode: 'MP-102',
    rawMaterialDescription: 'Essência Concentrada Lavanda Francesa',
    unit: 'L',
    notes: 'Fragrância hidrossolúvel para aromatização',
    status: 'ativo',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'cmp-006',
    code: 'CMP-006',
    name: 'Galão PEAD 5L com Tampa e Lacre',
    rawMaterialId: 'prod-emb-galao-5l',
    rawMaterialCode: 'EMB-203',
    rawMaterialDescription: 'Galão PEAD 5L Branco com Tampa e Lacre',
    unit: 'UN',
    notes: 'Embalagem resistente para produtos químicos 5 litros',
    status: 'ativo',
    createdAt: '2026-10-01T10:00:00.000Z',
  },
];

export const DEFAULT_DELIVERY_ROUTES: DeliveryRoute[] = [
  {
    id: 'rot-01',
    companyId: 'comp-matriz',
    code: 'ROT-01',
    name: 'Rota 01 - Feira de Santana (Sede & Entorno)',
    description: 'Atendimento comercial em Feira de Santana e municípios vizinhos do Portal do Sertão (Conceição do Jacuípe e Amélia Rodrigues)',
    active: true,
    color: 'blue',
    cities: ['Feira de Santana', 'Conceição do Jacuípe', 'Amélia Rodrigues'],
    neighborhoods: ['Centro', 'Kalilândia', 'Santa Mônica', 'Tomba', 'Cidade Nova', 'Capuchinhos', 'Sobradinho', 'Muchila'],
    marketAreas: ['Feira de Santana - Sede'],
    sellerNames: ['Carlos Silva', 'Bruno Lima'],
    estimatedDeliveryWindow: 'Manhã (08h às 12h)',
    vehicleTypeRecommendation: 'Fiat Fiorino / Van',
    minimumOrderValue: 1500,
    notes: 'Priorizar entregas no Centro, Kalilândia e CIS no primeiro horário',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'rot-02',
    companyId: 'comp-matriz',
    code: 'ROT-02',
    name: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)',
    description: 'Supermercados, restaurantes, pousadas e comércios do Recôncavo Baiano pela BR-101',
    active: true,
    color: 'emerald',
    cities: ['Cachoeira', 'Cruz das Almas', 'Santo Antônio de Jesus', 'Muritiba', 'São Félix'],
    neighborhoods: ['Centro', 'Coplan', 'Andaia', 'São Benedito', 'Tabela'],
    marketAreas: ['Recôncavo Baiano'],
    sellerNames: ['Carlos Silva', 'Mariana Oliveira'],
    estimatedDeliveryWindow: 'Dia Todo (08h às 17h)',
    vehicleTypeRecommendation: 'Van de Carga / VUC',
    minimumOrderValue: 1800,
    notes: 'Saída pela BR-116 Sul / BR-101 atendendo Cachoeira, Cruz das Almas e Santo Antônio de Jesus',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'rot-03',
    companyId: 'comp-matriz',
    code: 'ROT-03',
    name: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)',
    description: 'Condomínios, hospitais, postos e indústrias no eixo Alagoinhas, Catu, Pojuca e RMS',
    active: true,
    color: 'amber',
    cities: ['Alagoinhas', 'Catu', 'Pojuca', 'Camaçari', 'Salvador'],
    neighborhoods: ['Alagoinhas Velha', 'Kennedy', 'Centro', 'Pioneiro', 'Polo Industrial'],
    marketAreas: ['Litoral Norte & Alagoinhas', 'Região Metropolitana de Salvador'],
    sellerNames: ['Roberto Vendas', 'Mariana Oliveira'],
    estimatedDeliveryWindow: 'Dia Todo (08h às 17h)',
    vehicleTypeRecommendation: 'Caminhão 3/4',
    minimumOrderValue: 2000,
    notes: 'Descarga de volumes pesados (galões de 5L e caixas master) e apoio à Filial Alagoinhas',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'rot-04',
    companyId: 'comp-matriz',
    code: 'ROT-04',
    name: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)',
    description: 'Atendimento regional à Região do Sisal pela BR-116 Norte (Serrinha, Conceição do Coité, Riachão do Jacuípe e Ipirá)',
    active: true,
    color: 'purple',
    cities: ['Serrinha', 'Conceição do Coité', 'Riachão do Jacuípe', 'Ipirá', 'Coração de Maria'],
    neighborhoods: ['Centro', 'Cidade Nova', 'Ginásio', 'Vaquejada', 'Alto do Cruzeiro'],
    marketAreas: ['Portal do Sertão & Sisal'],
    sellerNames: ['Bruno Lima', 'Roberto Vendas'],
    estimatedDeliveryWindow: 'Dia Todo (07h às 18h)',
    vehicleTypeRecommendation: 'Caminhão Toco / 3/4',
    minimumOrderValue: 2200,
    notes: 'Saída antecipada da expedição em Feira de Santana às 06h30 pela BR-116 Norte',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
];

export const DEFAULT_DELIVERY_VEHICLES: DeliveryVehicle[] = [
  {
    id: 'veh-01',
    companyId: 'comp-matriz',
    plate: 'BRA-2E19',
    model: 'Fiat Fiorino 1.4 EVO',
    type: 'Utilitário / Fiorino',
    year: '2023',
    renavam: '01245879630',
    capacityKg: 650,
    licensingExpirationDate: '2027-07-31',
    insuranceExpirationDate: '2027-03-15',
    status: 'ativo',
    notes: 'Veículo ágil para entregas urbanas em Feira de Santana e Conceição do Jacuípe',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'veh-02',
    companyId: 'comp-matriz',
    plate: 'GFC-8A42',
    model: 'Mercedes-Benz Sprinter 416',
    type: 'Van / Furgão',
    year: '2022',
    renavam: '01198745210',
    capacityKg: 1800,
    licensingExpirationDate: '2026-11-28',
    insuranceExpirationDate: '2027-01-10',
    status: 'ativo',
    notes: 'Baú seco para rotas do Recôncavo (Cachoeira, Cruz das Almas e SAJ)',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'veh-03',
    companyId: 'comp-matriz',
    plate: 'BAX-4J90',
    model: 'VW Delivery 9.170',
    type: 'Caminhão 3/4',
    year: '2021',
    renavam: '01036521478',
    capacityKg: 4500,
    licensingExpirationDate: '2027-04-30',
    insuranceExpirationDate: '2027-06-20',
    status: 'ativo',
    notes: 'Indicado para grandes volumes (Alagoinhas, Litoral Norte e Região do Sisal)',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'veh-04',
    companyId: 'comp-matriz',
    plate: 'RDT-7M15',
    model: 'Renault Master L2H2 Baú',
    type: 'Van / Furgão',
    year: '2020',
    renavam: '00984512360',
    capacityKg: 1550,
    licensingExpirationDate: '2026-10-30',
    insuranceExpirationDate: '2026-11-22',
    status: 'manutencao',
    notes: 'Revisão preventiva de freios e regularização do licenciamento anual (Detran-BA)',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
];

export const DEFAULT_DELIVERY_DRIVERS: DeliveryDriver[] = [
  {
    id: 'drv-01',
    companyId: 'comp-matriz',
    name: 'Marcos Vinicius Almeida',
    cpf: '384.219.850-12',
    phone: '(75) 98765-4321',
    cnhNumber: '04589213044',
    cnhCategory: 'C',
    cnhExpirationDate: '2028-05-20',
    admissionDate: '2024-02-10',
    defaultVehicleId: 'veh-01',
    status: 'ativo',
    notes: 'Motorista sênior responsável por Feira de Santana e entorno',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'drv-02',
    companyId: 'comp-matriz',
    name: 'Rafael Almeida Santos',
    cpf: '412.690.338-05',
    phone: '(75) 99412-8830',
    cnhNumber: '07129845120',
    cnhCategory: 'D',
    cnhExpirationDate: '2026-11-25',
    admissionDate: '2025-04-01',
    defaultVehicleId: 'veh-02',
    status: 'ativo',
    notes: 'Habilitado para vans e caminhões 3/4 na rota do Recôncavo (CNH vence em breve)',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'drv-03',
    companyId: 'comp-matriz',
    name: 'Lucas Ferreira Costa',
    cpf: '295.841.770-44',
    phone: '(75) 99124-5509',
    cnhNumber: '06391428511',
    cnhCategory: 'C',
    cnhExpirationDate: '2027-09-12',
    admissionDate: '2023-08-15',
    defaultVehicleId: 'veh-03',
    status: 'ativo',
    notes: 'Especialista em rotas regionais (Alagoinhas, Serrinha e Coité)',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'drv-04',
    companyId: 'comp-matriz',
    name: 'Tiago Nascimento Oliveira',
    cpf: '519.302.618-90',
    phone: '(75) 98840-1127',
    cnhNumber: '03214598702',
    cnhCategory: 'B',
    cnhExpirationDate: '2026-10-18',
    admissionDate: '2025-01-20',
    defaultVehicleId: 'veh-04',
    status: 'ativo',
    notes: 'Aguardando renovação da CNH no Detran-BA',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
];

export const DEFAULT_STATES: StateItem[] = [
  { id: 'uf-ba', uf: 'BA', name: 'Bahia', region: 'Nordeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-se', uf: 'SE', name: 'Sergipe', region: 'Nordeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-al', uf: 'AL', name: 'Alagoas', region: 'Nordeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-pe', uf: 'PE', name: 'Pernambuco', region: 'Nordeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-ce', uf: 'CE', name: 'Ceará', region: 'Nordeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-rn', uf: 'RN', name: 'Rio Grande do Norte', region: 'Nordeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-pb', uf: 'PB', name: 'Paraíba', region: 'Nordeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-ma', uf: 'MA', name: 'Maranhão', region: 'Nordeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-pi', uf: 'PI', name: 'Piauí', region: 'Nordeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-sp', uf: 'SP', name: 'São Paulo', region: 'Sudeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-rj', uf: 'RJ', name: 'Rio de Janeiro', region: 'Sudeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-mg', uf: 'MG', name: 'Minas Gerais', region: 'Sudeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-es', uf: 'ES', name: 'Espírito Santo', region: 'Sudeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-pr', uf: 'PR', name: 'Paraná', region: 'Sul', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-sc', uf: 'SC', name: 'Santa Catarina', region: 'Sul', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-rs', uf: 'RS', name: 'Rio Grande do Sul', region: 'Sul', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-df', uf: 'DF', name: 'Distrito Federal', region: 'Centro-Oeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-go', uf: 'GO', name: 'Goiás', region: 'Centro-Oeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-mt', uf: 'MT', name: 'Mato Grosso', region: 'Centro-Oeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-ms', uf: 'MS', name: 'Mato Grosso do Sul', region: 'Centro-Oeste', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-pa', uf: 'PA', name: 'Pará', region: 'Norte', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-am', uf: 'AM', name: 'Amazonas', region: 'Norte', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-ro', uf: 'RO', name: 'Rondônia', region: 'Norte', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-to', uf: 'TO', name: 'Tocantins', region: 'Norte', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-ac', uf: 'AC', name: 'Acre', region: 'Norte', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-ap', uf: 'AP', name: 'Amapá', region: 'Norte', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'uf-rr', uf: 'RR', name: 'Roraima', region: 'Norte', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
];

export const DEFAULT_MARKET_AREAS: MarketAreaItem[] = [
  {
    id: 'pra-01',
    name: 'Feira de Santana - Sede',
    description: 'Bairros de Feira de Santana e entorno imediato (Conceição do Jacuípe e Amélia Rodrigues)',
    defaultRouteId: 'rot-01',
    defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)',
    cities: ['Feira de Santana', 'Conceição do Jacuípe', 'Amélia Rodrigues'],
    active: true,
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'pra-02',
    name: 'Recôncavo Baiano',
    description: 'Cidades do Recôncavo em raio de até 120km de Feira de Santana (Cachoeira, Cruz das Almas e SAJ)',
    defaultRouteId: 'rot-02',
    defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)',
    cities: ['Cachoeira', 'Cruz das Almas', 'Santo Antônio de Jesus', 'Muritiba', 'São Félix'],
    active: true,
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'pra-03',
    name: 'Litoral Norte & Alagoinhas',
    description: 'Polo de Alagoinhas (Filial), Catu, Pojuca e eixo da BR-101 Norte',
    defaultRouteId: 'rot-03',
    defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)',
    cities: ['Alagoinhas', 'Catu', 'Pojuca'],
    active: true,
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'pra-04',
    name: 'Portal do Sertão & Sisal',
    description: 'Eixo BR-116 Norte e Bacia do Jacuípe (Serrinha, Conceição do Coité, Riachão do Jacuípe e Ipirá)',
    defaultRouteId: 'rot-04',
    defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)',
    cities: ['Serrinha', 'Conceição do Coité', 'Riachão do Jacuípe', 'Ipirá'],
    active: true,
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'pra-05',
    name: 'Região Metropolitana de Salvador',
    description: 'Polo Petroquímico de Camaçari, Salvador, Lauro de Freitas e Simões Filho',
    defaultRouteId: 'rot-03',
    defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)',
    cities: ['Camaçari', 'Salvador', 'Lauro de Freitas', 'Simões Filho'],
    active: true,
    createdAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'pra-06',
    name: 'Eixo BR-324 & Subaé',
    description: 'Municípios industriais entre Feira de Santana e Salvador pela BR-324',
    defaultRouteId: 'rot-01',
    defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)',
    cities: ['Amélia Rodrigues', 'São Sebastião do Passé', 'Candeias'],
    active: true,
    createdAt: '2026-10-01T10:00:00.000Z',
  },
];

export const DEFAULT_CITIES: CityItem[] = [
  // Polos principais (Matriz & Filial)
  { id: 'cid-01', name: 'Feira de Santana', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2910800', distanceKm: 0, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-02', name: 'Alagoinhas', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2900702', distanceKm: 78, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },

  // Portal do Sertão & Entorno Imediato de Feira de Santana (0–65 km)
  { id: 'cid-16', name: 'São Gonçalo dos Campos', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2929305', distanceKm: 20, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-17', name: 'Conceição da Feira', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2908200', distanceKm: 24, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-08', name: 'Conceição do Jacuípe', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2908507', distanceKm: 27, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-18', name: 'Tanquinho', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2931103', distanceKm: 34, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-19', name: 'Santa Bárbara', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2927507', distanceKm: 35, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-20', name: 'Antônio Cardoso', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2901700', distanceKm: 36, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-15', name: 'Amélia Rodrigues', stateUf: 'BA', marketAreaId: 'pra-06', marketAreaName: 'Eixo BR-324 & Subaé', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2901106', distanceKm: 38, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-21', name: 'Anguera', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2901502', distanceKm: 38, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-22', name: 'Coração de Maria', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2908903', distanceKm: 40, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-23', name: 'Santo Estêvão', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2928802', distanceKm: 41, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-24', name: 'Santanópolis', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2928307', distanceKm: 42, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-25', name: 'Teodoro Sampaio', stateUf: 'BA', marketAreaId: 'pra-06', marketAreaName: 'Eixo BR-324 & Subaé', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2931400', distanceKm: 50, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-26', name: 'Serra Preta', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2930402', distanceKm: 52, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-27', name: 'Terra Nova', stateUf: 'BA', marketAreaId: 'pra-06', marketAreaName: 'Eixo BR-324 & Subaé', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2931707', distanceKm: 55, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-28', name: 'Ipecaetá', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2913804', distanceKm: 56, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-29', name: 'Água Fria', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2900405', distanceKm: 58, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-30', name: 'Irará', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2914505', distanceKm: 58, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-31', name: 'Rafael Jambeiro', stateUf: 'BA', marketAreaId: 'pra-01', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', distanceKm: 68, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },

  // Recôncavo Baiano, Vale do Jiquiriçá & Baixo Sul (45–195 km)
  { id: 'cid-32', name: 'Santo Amaro', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2928604', distanceKm: 45, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-05', name: 'Cachoeira', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2904902', distanceKm: 46, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-33', name: 'São Félix', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2929008', distanceKm: 47, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-34', name: 'Muritiba', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2922300', distanceKm: 52, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-35', name: 'Governador Mangabeira', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2911600', distanceKm: 56, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-04', name: 'Cruz das Almas', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2909802', distanceKm: 64, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-36', name: 'São Felipe', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2929107', distanceKm: 70, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-37', name: 'Sapeaçu', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2929602', distanceKm: 72, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-38', name: 'Maragogipe', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2920601', distanceKm: 76, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-39', name: 'Conceição do Almeida', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2908309', distanceKm: 80, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-40', name: 'Castro Alves', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2907301', distanceKm: 85, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-41', name: 'Dom Macedo Costa', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', distanceKm: 88, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-03', name: 'Santo Antônio de Jesus', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2928703', distanceKm: 94, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-42', name: 'Itatim', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', distanceKm: 98, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-43', name: 'Nazaré', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2922508', distanceKm: 105, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-44', name: 'Santa Teresinha', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', distanceKm: 105, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-45', name: 'Varzedo', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', distanceKm: 105, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-46', name: 'Elísio Medrado', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', distanceKm: 112, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-47', name: 'Salinas da Margarida', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', distanceKm: 112, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-48', name: 'São Miguel das Matas', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', distanceKm: 118, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-49', name: 'Amargosa', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2901007', distanceKm: 122, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-50', name: 'Laje', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2918803', distanceKm: 122, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-51', name: 'Milagres', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2921302', distanceKm: 122, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-52', name: 'Mutuípe', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2922409', distanceKm: 130, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-53', name: 'Jiquiriçá', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', distanceKm: 136, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-54', name: 'Ubaíra', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2932101', distanceKm: 145, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-55', name: 'Brejões', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', distanceKm: 148, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-56', name: 'Valença', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2932903', distanceKm: 155, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-57', name: 'Gandu', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2911204', distanceKm: 180, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-58', name: 'Jaguaquara', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2917607', distanceKm: 182, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-59', name: 'Jequié', stateUf: 'BA', marketAreaId: 'pra-02', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2918001', distanceKm: 195, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },

  // Litoral Norte, Alagoinhas & Agreste Baiano (65–195 km)
  { id: 'cid-60', name: 'Pedrão', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', distanceKm: 65, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-61', name: 'Ouriçangas', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', distanceKm: 72, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-11', name: 'Catu', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2907509', distanceKm: 78, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-12', name: 'Pojuca', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2925204', distanceKm: 82, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-62', name: 'Aramari', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', distanceKm: 86, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-63', name: 'Araçás', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', distanceKm: 96, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-64', name: 'Inhambupe', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2913705', distanceKm: 118, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-65', name: 'Entre Rios', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2910503', distanceKm: 122, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-66', name: 'Sátiro Dias', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', distanceKm: 126, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-67', name: 'Esplanada', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2910602', distanceKm: 142, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-68', name: 'Cardeal da Silva', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', distanceKm: 145, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-69', name: 'Acajutiba', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', distanceKm: 146, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-70', name: 'Olindina', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', distanceKm: 155, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-71', name: 'Conde', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', distanceKm: 175, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-72', name: 'Cipó', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2907505', distanceKm: 182, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-73', name: 'Rio Real', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', distanceKm: 185, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-74', name: 'Ribeira do Pombal', stateUf: 'BA', marketAreaId: 'pra-03', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2926608', distanceKm: 192, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },

  // Região Metropolitana de Salvador & Eixo BR-324 (55–120 km)
  { id: 'cid-75', name: 'São Sebastião do Passé', stateUf: 'BA', marketAreaId: 'pra-06', marketAreaName: 'Eixo BR-324 & Subaé', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2929503', distanceKm: 56, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-76', name: 'São Francisco do Conde', stateUf: 'BA', marketAreaId: 'pra-06', marketAreaName: 'Eixo BR-324 & Subaé', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', distanceKm: 68, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-77', name: 'Candeias', stateUf: 'BA', marketAreaId: 'pra-06', marketAreaName: 'Eixo BR-324 & Subaé', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', ibgeCode: '2906501', distanceKm: 72, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-78', name: 'Simões Filho', stateUf: 'BA', marketAreaId: 'pra-05', marketAreaName: 'Região Metropolitana de Salvador', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2930709', distanceKm: 88, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-79', name: "Dias d'Ávila", stateUf: 'BA', marketAreaId: 'pra-05', marketAreaName: 'Região Metropolitana de Salvador', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2910057', distanceKm: 90, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-80', name: 'Mata de São João', stateUf: 'BA', marketAreaId: 'pra-05', marketAreaName: 'Região Metropolitana de Salvador', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2921005', distanceKm: 96, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-13', name: 'Camaçari', stateUf: 'BA', marketAreaId: 'pra-05', marketAreaName: 'Região Metropolitana de Salvador', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2905701', distanceKm: 98, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-81', name: 'Lauro de Freitas', stateUf: 'BA', marketAreaId: 'pra-05', marketAreaName: 'Região Metropolitana de Salvador', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2919207', distanceKm: 108, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-82', name: 'Itaparica', stateUf: 'BA', marketAreaId: 'pra-05', marketAreaName: 'Região Metropolitana de Salvador', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2916104', distanceKm: 112, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-14', name: 'Salvador', stateUf: 'BA', marketAreaId: 'pra-05', marketAreaName: 'Região Metropolitana de Salvador', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', ibgeCode: '2927408', distanceKm: 115, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-83', name: 'Vera Cruz', stateUf: 'BA', marketAreaId: 'pra-05', marketAreaName: 'Região Metropolitana de Salvador', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', ibgeCode: '2933208', distanceKm: 115, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },

  // Portal do Sertão Norte, Sisal & Piemonte / Chapada Oriental (65–198 km)
  { id: 'cid-84', name: 'Candeal', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', distanceKm: 68, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-85', name: 'Ichu', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', distanceKm: 72, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-06', name: 'Serrinha', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2930501', distanceKm: 74, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-09', name: 'Riachão do Jacuípe', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2926301', distanceKm: 78, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-86', name: 'Barrocas', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2903276', distanceKm: 85, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-87', name: 'Biritinga', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', distanceKm: 92, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-88', name: 'Pé de Serra', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', distanceKm: 95, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-89', name: 'Teofilândia', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2931509', distanceKm: 98, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-10', name: 'Ipirá', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2914000', distanceKm: 102, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-07', name: 'Conceição do Coité', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2908408', distanceKm: 105, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-90', name: 'Pintadas', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', distanceKm: 116, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-91', name: 'Retirolândia', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', distanceKm: 118, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-92', name: 'Valente', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2933000', distanceKm: 126, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-93', name: 'Araci', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2902104', distanceKm: 128, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-94', name: 'Baixa Grande', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2902609', distanceKm: 132, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-95', name: 'Iaçu', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2911907', distanceKm: 135, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-96', name: 'Mairi', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2920106', distanceKm: 142, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-97', name: 'Itaberaba', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2914703', distanceKm: 148, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-98', name: 'Santaluz', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', distanceKm: 148, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-99', name: 'Queimadas', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', distanceKm: 150, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-100', name: 'Capim Grosso', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2906873', distanceKm: 155, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-101', name: 'Tucano', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2931905', distanceKm: 158, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-102', name: 'Ruy Barbosa', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2927200', distanceKm: 168, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-103', name: 'Mundo Novo', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', distanceKm: 172, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-104', name: 'Jacobina', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2917508', distanceKm: 192, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-105', name: 'Euclides da Cunha', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2910701', distanceKm: 195, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-106', name: 'Senhor do Bonfim', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2930105', distanceKm: 198, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-107', name: 'Nova Fátima', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2922730', distanceKm: 95, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-108', name: 'Capela do Alto Alegre', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2906857', distanceKm: 116, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'cid-109', name: 'Macajuba', stateUf: 'BA', marketAreaId: 'pra-04', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', ibgeCode: '2919603', distanceKm: 140, isSystemDefault: true, active: true, createdAt: '2026-10-01T10:00:00.000Z' },
].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

export const DEFAULT_NEIGHBORHOODS: NeighborhoodItem[] = [
  { id: 'bai-01', name: 'Centro', cityName: 'Feira de Santana', stateUf: 'BA', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-02', name: 'Kalilândia', cityName: 'Feira de Santana', stateUf: 'BA', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-03', name: 'Santa Mônica', cityName: 'Feira de Santana', stateUf: 'BA', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-04', name: 'Tomba', cityName: 'Feira de Santana', stateUf: 'BA', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-05', name: 'Cidade Nova', cityName: 'Feira de Santana', stateUf: 'BA', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-06', name: 'Capuchinhos', cityName: 'Feira de Santana', stateUf: 'BA', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-07', name: 'Sobradinho', cityName: 'Feira de Santana', stateUf: 'BA', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-08', name: 'Muchila', cityName: 'Feira de Santana', stateUf: 'BA', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-09', name: 'Centro', cityName: 'Conceição do Jacuípe', stateUf: 'BA', marketAreaName: 'Feira de Santana - Sede', defaultRouteId: 'rot-01', defaultRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-10', name: 'Centro', cityName: 'Cachoeira', stateUf: 'BA', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-11', name: 'Coplan', cityName: 'Cruz das Almas', stateUf: 'BA', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-12', name: 'Centro', cityName: 'Santo Antônio de Jesus', stateUf: 'BA', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-13', name: 'Andaia', cityName: 'Santo Antônio de Jesus', stateUf: 'BA', marketAreaName: 'Recôncavo Baiano', defaultRouteId: 'rot-02', defaultRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-14', name: 'Alagoinhas Velha', cityName: 'Alagoinhas', stateUf: 'BA', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-15', name: 'Kennedy', cityName: 'Alagoinhas', stateUf: 'BA', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-16', name: 'Centro', cityName: 'Alagoinhas', stateUf: 'BA', marketAreaName: 'Litoral Norte & Alagoinhas', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-17', name: 'Polo Industrial', cityName: 'Camaçari', stateUf: 'BA', marketAreaName: 'Região Metropolitana de Salvador', defaultRouteId: 'rot-03', defaultRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-18', name: 'Cidade Nova', cityName: 'Serrinha', stateUf: 'BA', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-19', name: 'Centro', cityName: 'Serrinha', stateUf: 'BA', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
  { id: 'bai-20', name: 'Centro', cityName: 'Conceição do Coité', stateUf: 'BA', marketAreaName: 'Portal do Sertão & Sisal', defaultRouteId: 'rot-04', defaultRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)', active: true, createdAt: '2026-10-01T10:00:00.000Z' },
];

export const DEFAULT_DELIVERY_MANIFESTS: DeliveryManifest[] = [
  {
    id: 'rom-001',
    number: 'ROM-2026-0001',
    name: 'Entrega Feira Sede & Berimbau',
    companyId: 'comp-matriz',
    date: '2026-10-12T08:00:00.000Z',
    departureDate: '2026-10-12',
    routeId: 'rot-01',
    routeName: 'Rota 01 - Feira de Santana (Sede & Entorno)',
    driverName: 'Marcos Vinicius Almeida',
    driverPhone: '(75) 98765-4321',
    vehiclePlate: 'BRA-2E19',
    vehicleModel: 'Fiat Fiorino 1.4 EVO',
    status: 'em_transito',
    notes: 'Carga conferida no armazém em Feira de Santana. Entregar prioritariamente o Supermercado Subaé.',
    orders: [
      {
        orderId: 'ped-rom-1',
        orderNumber: 'PED-2026-0008',
        orderDate: '2026-10-11T14:20:00.000Z',
        customerId: 'cli-001',
        customerCode: 'CLI-001',
        customerName: 'Supermercado Subaé Ltda',
        customerPhone: '(75) 3622-2200',
        customerCpfCnpj: '23.456.789/0001-11',
        address: {
          street: 'Rua Conselheiro Franco',
          number: '450',
          neighborhood: 'Kalilândia',
          city: 'Feira de Santana',
          state: 'BA',
          zipCode: '44001-200',
        },
        marketArea: 'Feira de Santana - Sede',
        sellerName: 'Carlos Silva',
        sequence: 1,
        totalValue: 840.0,
        paymentMethod: 'boleto',
        paymentStatus: 'pago_antecipado',
        amountToCollect: 0,
        deliveryStatus: 'entregue',
        deliveredAt: '2026-10-12T09:45:00.000Z',
        deliveryNotes: 'Recebido na doca 02 pelo encarregado Pedro.',
        items: [
          {
            productId: 'prod-detergente-500',
            productCode: 'PA-301',
            description: 'Detergente Líquido Neutro Concentrado 500ml',
            unit: 'UN',
            quantity: 120,
            unitPrice: 3.5,
            totalPrice: 420.0,
          },
          {
            productId: 'prod-desinfetante-5l',
            productCode: 'PA-302',
            description: 'Desinfetante Floral Imperial Profissional 5L',
            unit: 'UN',
            quantity: 20,
            unitPrice: 21.0,
            totalPrice: 420.0,
          },
        ],
        volumesCount: 14,
      },
      {
        orderId: 'ped-rom-2',
        orderNumber: 'PED-2026-0012',
        orderDate: '2026-10-11T16:40:00.000Z',
        customerId: 'cli-003',
        customerCode: 'CLI-003',
        customerName: 'Lava Rápido & Auto Posto Jacuípe',
        customerPhone: '(75) 3243-6543',
        customerCpfCnpj: '34.567.890/0001-33',
        address: {
          street: 'Av. Sérgio Carneiro',
          number: '210',
          neighborhood: 'Centro',
          city: 'Conceição do Jacuípe',
          state: 'BA',
          zipCode: '44245-000',
        },
        marketArea: 'Feira de Santana - Sede',
        sellerName: 'Bruno Lima',
        sequence: 2,
        totalValue: 560.0,
        paymentMethod: 'dinheiro',
        paymentStatus: 'cobrar_na_entrega',
        amountToCollect: 560.0,
        deliveryStatus: 'pendente',
        items: [
          {
            productId: 'prod-detergente-500',
            productCode: 'PA-301',
            description: 'Detergente Líquido Neutro Concentrado 500ml',
            unit: 'UN',
            quantity: 80,
            unitPrice: 3.5,
            totalPrice: 280.0,
          },
          {
            productId: 'prod-pano-microfibra',
            productCode: 'REV-404',
            description: 'Pano Microfibra Multiuso 40x40cm (Pacote com 5 unid)',
            unit: 'PCT',
            quantity: 14,
            unitPrice: 20.0,
            totalPrice: 280.0,
          },
        ],
        volumesCount: 8,
      },
      {
        orderId: 'ped-rom-3',
        orderNumber: 'PED-2026-0015',
        orderDate: '2026-10-12T07:15:00.000Z',
        customerId: 'cli-004',
        customerCode: 'CLI-004',
        customerName: 'Maria Helena dos Santos',
        customerPhone: '(75) 3625-1122',
        customerCpfCnpj: '234.567.890-12',
        address: {
          street: 'Av. Getúlio Vargas',
          number: '890',
          neighborhood: 'Santa Mônica',
          city: 'Feira de Santana',
          state: 'BA',
          zipCode: '44077-000',
        },
        marketArea: 'Feira de Santana - Sede',
        sellerName: 'Carlos Silva',
        sequence: 3,
        totalValue: 280.0,
        paymentMethod: 'pix',
        paymentStatus: 'cobrar_na_entrega',
        amountToCollect: 280.0,
        deliveryStatus: 'pendente',
        items: [
          {
            productId: 'prod-desinfetante-5l',
            productCode: 'PA-302',
            description: 'Desinfetante Floral Imperial Profissional 5L',
            unit: 'UN',
            quantity: 10,
            unitPrice: 21.0,
            totalPrice: 210.0,
          },
          {
            productId: 'prod-pano-microfibra',
            productCode: 'REV-404',
            description: 'Pano Microfibra Multiuso 40x40cm (Pacote com 5 unid)',
            unit: 'PCT',
            quantity: 3,
            unitPrice: 23.33,
            totalPrice: 70.0,
          },
        ],
        volumesCount: 2,
      },
    ],
    totalOrders: 3,
    totalDelivered: 1,
    totalPending: 2,
    totalValue: 1680.0,
    totalAmountToCollect: 840.0,
    totalVolumes: 24,
    createdAt: '2026-10-12T08:00:00.000Z',
    updatedAt: '2026-10-12T09:45:00.000Z',
  },
];

export const DEFAULT_ROLE_MENU_SECTIONS: Record<UserRole, string[]> = {
  admin: [
    'inicio',
    'vendas',
    'cadastros',
    'compras',
    'estoque',
    'producao',
    'expedicao',
    'precificacao',
    'financeiro',
    'relatorios',
    'importacao',
    'configuracoes',
  ],
  gerente: [
    'inicio',
    'vendas',
    'cadastros',
    'compras',
    'estoque',
    'producao',
    'expedicao',
    'precificacao',
    'financeiro',
    'relatorios',
    'importacao',
    'configuracoes',
  ],
  balconista: ['inicio', 'vendas', 'cadastros'],
  vendedor_externo: ['inicio', 'vendas', 'cadastros'],
  financeiro: ['inicio', 'financeiro', 'cadastros', 'compras', 'relatorios'],
};

export const DEFAULT_ROLE_SUB_ITEMS: Record<UserRole, string[]> = {
  admin: [
    'dashboard',
    'pos',
    'orders',
    'orders_quotes',
    'external_sales',
    'orders_history',
    'sales_reports',
    'products',
    'customers',
    'suppliers',
    'stock_locations',
    'purchases',
    'stock_transfers',
    'inventory',
    'stock_movements',
    'bom_composition',
    'components_catalog',
    'production_orders',
    'delivery_manifests',
    'delivery_routes',
    'delivery_drivers',
    'delivery_vehicles',
    'delivery_market_areas',
    'delivery_neighborhoods',
    'delivery_cities',
    'delivery_states',
    'expedition_reports',
    'pricing_calculator',
    'batch_pricing',
    'cash_flow',
    'accounts_receivable',
    'accounts_payable',
    'customer_vouchers',
    'cash_register',
    'payment_methods',
    'financial_accounts',
    'payment_terms',
    'financial_reports',
    'reports',
    'excel_tools',
    'settings',
    'settings_supabase',
    'settings_menus',
    'settings_preferences',
    'settings_printer',
    'settings_cleanup',
  ],
  gerente: [
    'dashboard',
    'pos',
    'orders',
    'orders_quotes',
    'external_sales',
    'orders_history',
    'sales_reports',
    'products',
    'customers',
    'suppliers',
    'stock_locations',
    'purchases',
    'stock_transfers',
    'inventory',
    'stock_movements',
    'bom_composition',
    'components_catalog',
    'production_orders',
    'delivery_manifests',
    'delivery_routes',
    'delivery_drivers',
    'delivery_vehicles',
    'delivery_market_areas',
    'delivery_neighborhoods',
    'delivery_cities',
    'delivery_states',
    'expedition_reports',
    'pricing_calculator',
    'batch_pricing',
    'cash_flow',
    'accounts_receivable',
    'accounts_payable',
    'customer_vouchers',
    'cash_register',
    'payment_methods',
    'financial_accounts',
    'payment_terms',
    'financial_reports',
    'reports',
    'excel_tools',
    'settings',
    'settings_preferences',
    'settings_printer',
  ],
  balconista: [
    'pos',
    'orders',
    'orders_quotes',
    'orders_history',
    'products',
    'customers',
  ],
  vendedor_externo: [
    'dashboard',
    'orders',
    'orders_quotes',
    'external_sales',
    'products',
    'customers',
  ],
  financeiro: [
    'dashboard',
    'cash_flow',
    'accounts_receivable',
    'accounts_payable',
    'customer_vouchers',
    'cash_register',
    'payment_methods',
    'financial_accounts',
    'payment_terms',
    'financial_reports',
    'customers',
    'suppliers',
    'purchases',
    'reports',
  ],
};

export const DEFAULT_ROLE_FINANCIAL_PERMISSIONS: Record<
  UserRole,
  {
    canViewGrossProfit: boolean;
    canViewNetProfit: boolean;
    canViewTotalRevenue: boolean;
    canViewProfitMargin: boolean;
    canViewProductCosts: boolean;
    canViewCashBalances: boolean;
  }
> = {
  admin: {
    canViewGrossProfit: true,
    canViewNetProfit: true,
    canViewTotalRevenue: true,
    canViewProfitMargin: true,
    canViewProductCosts: true,
    canViewCashBalances: true,
  },
  gerente: {
    canViewGrossProfit: true,
    canViewNetProfit: false,
    canViewTotalRevenue: true,
    canViewProfitMargin: true,
    canViewProductCosts: true,
    canViewCashBalances: true,
  },
  balconista: {
    canViewGrossProfit: false,
    canViewNetProfit: false,
    canViewTotalRevenue: false,
    canViewProfitMargin: false,
    canViewProductCosts: false,
    canViewCashBalances: false,
  },
  vendedor_externo: {
    canViewGrossProfit: false,
    canViewNetProfit: false,
    canViewTotalRevenue: false,
    canViewProfitMargin: false,
    canViewProductCosts: false,
    canViewCashBalances: false,
  },
  financeiro: {
    canViewGrossProfit: false,
    canViewNetProfit: false,
    canViewTotalRevenue: true,
    canViewProfitMargin: false,
    canViewProductCosts: false,
    canViewCashBalances: true,
  },
};

export interface SystemCleanupOptions {
  clients?: boolean;
  productsStock?: boolean;
  usersSellers?: boolean;
  companiesBranches?: boolean;
  salesHistory?: boolean;
  cargoManifests?: boolean;
  suppliers?: boolean;
  productionOrders?: boolean;
  deliveryRoutes?: boolean;
  deliveryDrivers?: boolean;
  deliveryVehicles?: boolean;
  marketAreas?: boolean;
  neighborhoods?: boolean;
  cities?: boolean;
  cashFlow?: boolean;
  accountsPayable?: boolean;
  posCashControl?: boolean;
  auditLogs?: boolean;
}

export interface SystemCleanupResult {
  success: boolean;
  cleared: {
    clients: number;
    productsStock: number;
    usersSellers: number;
    companiesBranches: number;
    salesHistory: number;
    cargoManifests: number;
    suppliers: number;
    productionOrders: number;
    deliveryRoutes: number;
    deliveryDrivers: number;
    deliveryVehicles: number;
    marketAreas: number;
    neighborhoods: number;
    cities: number;
    cashFlow: number;
    accountsPayable: number;
    posCashControl: number;
    auditLogs: number;
  };
  error?: string;
}

export class Database {
  private static state: DatabaseState | null = null;
  private static listeners: Array<() => void> = [];
  private static onPersistListeners: Array<() => void> = [];

  public static subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public static onPersist(listener: () => void): () => void {
    this.onPersistListeners.push(listener);
    return () => {
      this.onPersistListeners = this.onPersistListeners.filter((l) => l !== listener);
    };
  }

  private static refreshStateReferences() {
    if (!this.state) return;
    const s = this.state;
    s.companies = [...(s.companies || [])];
    s.users = [...(s.users || [])];
    if (s.deletedUserIds) s.deletedUserIds = [...s.deletedUserIds];
    s.stockLocations = [...(s.stockLocations || [])];
    s.products = [...(s.products || [])];
    if (s.components) s.components = [...s.components];
    s.stockBalances = [...(s.stockBalances || [])];
    s.stockMovements = [...(s.stockMovements || [])];
    s.customers = [...(s.customers || [])];
    s.suppliers = [...(s.suppliers || [])];
    s.orders = [...(s.orders || [])];
    s.cashRegisters = [...(s.cashRegisters || [])];
    s.accountsReceivable = [...(s.accountsReceivable || [])];
    s.accountsPayable = [...(s.accountsPayable || [])];
    s.purchaseOrders = [...(s.purchaseOrders || [])];
    s.purchaseReceipts = [...(s.purchaseReceipts || [])];
    s.productionOrders = [...(s.productionOrders || [])];
    s.transferOrders = [...(s.transferOrders || [])];
    s.inventoryCounts = [...(s.inventoryCounts || [])];
    s.auditLogs = [...(s.auditLogs || [])];
    if (s.paymentMethods) s.paymentMethods = [...s.paymentMethods];
    if (s.financialAccounts) s.financialAccounts = [...s.financialAccounts];
    if (s.paymentTermsList) s.paymentTermsList = [...s.paymentTermsList];
    if (s.deliveryRoutes) s.deliveryRoutes = [...s.deliveryRoutes];
    if (s.deliveryDrivers) s.deliveryDrivers = [...s.deliveryDrivers];
    if (s.deliveryVehicles) s.deliveryVehicles = [...s.deliveryVehicles];
    if (s.deliveryManifests) s.deliveryManifests = [...s.deliveryManifests];
    if (s.marketAreas) s.marketAreas = [...s.marketAreas];
    if (s.states) s.states = [...s.states];
    if (s.cities) s.cities = [...s.cities];
    if (s.neighborhoods) s.neighborhoods = [...s.neighborhoods];
    if (s.companyStockTransfers) s.companyStockTransfers = [...s.companyStockTransfers];
    if (s.chartOfAccounts) s.chartOfAccounts = [...s.chartOfAccounts];
    if (s.nfeImportHistory) s.nfeImportHistory = [...s.nfeImportHistory];
    if (s.supplierProductMappings) s.supplierProductMappings = [...s.supplierProductMappings];
    if (s.salesReturns) s.salesReturns = [...s.salesReturns];
    if (s.customerVouchers) s.customerVouchers = [...s.customerVouchers];
  }

  private static notify() {
    this.refreshStateReferences();
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Erro em listener do Database:', err);
      }
    });
  }

  public static getState(): DatabaseState {
    if (!this.state) {
      this.load();
    }
    return this.state!;
  }

  public static hasPendingFactoryReset(): boolean {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
    return localStorage.getItem(DB_KEY_PREFIX + 'pending_factory_reset') === 'true';
  }

  public static clearPendingFactoryReset(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(DB_KEY_PREFIX + 'pending_factory_reset');
    } catch {}
  }

  public static hasRemoteSyncCache(): boolean {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
    return Boolean(localStorage.getItem(DB_KEY_PREFIX + 'last_remote_sync'));
  }

  public static markRemoteSynced(syncTime?: string): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(DB_KEY_PREFIX + 'last_remote_sync', syncTime || new Date().toISOString());
    } catch {}
  }

  public static load(): DatabaseState {
    try {
      // Ao migrar ou iniciar no projeto exclusivo gestaofacilerp-paulocesarmc, garante base local zerada sem resíduos do ambiente de testes anterior
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const storedProject = localStorage.getItem(DB_KEY_PREFIX + 'firebase_project');
        if (storedProject !== ACTIVE_FIREBASE_PROJECT_ID) {
          const keysToReset = [
            DB_KEY_PREFIX + 'state',
            DB_KEY_PREFIX + 'last_remote_sync',
            DB_KEY_PREFIX + 'bahia_demo_v2',
            DB_KEY_PREFIX + 'fleet_examples_v2',
            DB_KEY_PREFIX + 'pending_factory_reset',
            DB_KEY_PREFIX + 'orders_cleared',
            DB_KEY_PREFIX + 'receivables_cleared',
            DB_KEY_PREFIX + 'manifests_cleared',
            DB_KEY_PREFIX + 'clients_cleared',
            DB_KEY_PREFIX + 'products_cleared',
            DB_KEY_PREFIX + 'suppliers_cleared',
            DB_KEY_PREFIX + 'production_cleared',
            DB_KEY_PREFIX + 'routes_cleared',
            DB_KEY_PREFIX + 'drivers_cleared',
            DB_KEY_PREFIX + 'vehicles_cleared',
            DB_KEY_PREFIX + 'market_areas_cleared',
            DB_KEY_PREFIX + 'neighborhoods_cleared',
            DB_KEY_PREFIX + 'cashflow_cleared',
            DB_KEY_PREFIX + 'payables_cleared',
            DB_KEY_PREFIX + 'cash_registers_cleared',
            DB_KEY_PREFIX + 'audit_logs_cleared',
            this.AUTH_SESSION_KEY,
            'gestaofacil_remembered_login',
          ];
          keysToReset.forEach((k) => {
            try {
              localStorage.removeItem(k);
            } catch {}
          });
          if (typeof sessionStorage !== 'undefined') {
            try {
              sessionStorage.removeItem(this.AUTH_SESSION_KEY);
            } catch {}
          }
          localStorage.setItem(DB_KEY_PREFIX + 'firebase_project', ACTIVE_FIREBASE_PROJECT_ID);
          localStorage.setItem(DB_KEY_PREFIX + 'clean_start', 'true');
          localStorage.setItem('gestaofacil_needs_matriz_setup', 'true');
        }
      }

      const stored = localStorage.getItem(DB_KEY_PREFIX + 'state');
      const isCleanStart =
        typeof window === 'undefined' ||
        localStorage.getItem(DB_KEY_PREFIX + 'clean_start') === 'true' ||
        !stored;

      if (stored) {
        this.state = JSON.parse(stored);
        // Higienização preventiva contra esgotamento de cota do localStorage
        if (this.state) {
          if (this.state.auditLogs && this.state.auditLogs.length > 60) {
            this.state.auditLogs = this.state.auditLogs.slice(0, 60);
          }
          if (this.state.stockMovements && this.state.stockMovements.length > 150) {
            this.state.stockMovements = this.state.stockMovements.slice(0, 150);
          }
        }
        // Garante que existam contas a receber com amostra de parcela vencida para teste (apenas em modo demonstração)
        if (!isCleanStart && this.state && !localStorage.getItem(DB_KEY_PREFIX + 'receivables_cleared') && (!this.state.accountsReceivable || this.state.accountsReceivable.length <= 1)) {
          const companyMatrizId = 'comp-matriz';
          const overdueSample: AccountReceivable[] = [
            {
              id: 'rec-overdue-001',
              companyId: companyMatrizId,
              orderId: 'ord-atrasada-01',
              orderNumber: 'VD-2026-0034',
              customerId: 'cli-001',
              customerName: 'Supermercado Subaé Ltda',
              docNumber: 'DUP-1048/1',
              installmentNumber: 1,
              totalInstallments: 2,
              issueDate: '2026-08-25',
              dueDate: '2026-09-25',
              originalValue: 540.0,
              discount: 0,
              addition: 0,
              paidValue: 0,
              balance: 540.0,
              paymentMethod: 'Boleto Bancário',
              status: 'aberto',
              receipts: [],
            },
            {
              id: 'rec-overdue-002',
              companyId: companyMatrizId,
              orderId: 'ord-atrasada-02',
              orderNumber: 'VD-2026-0029',
              customerId: 'cli-003',
              customerName: 'Lava Rápido & Auto Posto Jacuípe',
              docNumber: 'DUP-1033/2',
              installmentNumber: 2,
              totalInstallments: 3,
              issueDate: '2026-08-15',
              dueDate: '2026-09-15',
              originalValue: 380.0,
              discount: 0,
              addition: 0,
              paidValue: 0,
              balance: 380.0,
              paymentMethod: 'Boleto Bancário',
              status: 'aberto',
              receipts: [],
            },
          ];
          this.state.accountsReceivable = [...(this.state.accountsReceivable || []), ...overdueSample];
          this.persist();
        }

        // Garante que existam pedidos de venda com origem 'externa_celular' para testes do módulo mobile (apenas modo demonstração)
        if (!isCleanStart && this.state && !localStorage.getItem(DB_KEY_PREFIX + 'orders_cleared') && (!this.state.orders || !this.state.orders.some((o) => o.origin === 'externa_celular' && o.type === 'venda'))) {
          const companyMatrizId = 'comp-matriz';
          const todayIso = new Date().toISOString().split('T')[0];
          const currentMonthIso = todayIso.slice(0, 7);
          const sampleExternalSales: Order[] = [
            {
              id: 'ord-venda-ext-hoje',
              number: 'PED-EXT-2026-0001',
              type: 'venda',
              origin: 'externa_celular',
              companyId: companyMatrizId,
              customerId: 'cli-004',
              customerName: 'Maria Helena dos Santos',
              userId: 'usr-vendedor-externo',
              userName: 'Bruno Lima',
              items: [
                {
                  id: 'item-ext-1',
                  productId: 'prod-detergente-500',
                  productCode: 'PA-301',
                  description: 'Detergente Líquido Neutro Imperial 500ml',
                  unit: 'UN',
                  quantity: 20,
                  unitPrice: 3.99,
                  discountPercent: 0,
                  discountValue: 0,
                  totalPrice: 79.80,
                  unitCost: 1.84,
                  locationId: 'loc-comercial',
                },
                {
                  id: 'item-ext-2',
                  productId: 'prod-desinfetante-5l',
                  productCode: 'PA-302',
                  description: 'Desinfetante Floral Imperial Profissional 5L',
                  unit: 'UN',
                  quantity: 4,
                  unitPrice: 21.50,
                  discountPercent: 0,
                  discountValue: 0,
                  totalPrice: 86.00,
                  unitCost: 9.85,
                  locationId: 'loc-comercial',
                },
              ],
              subtotal: 165.80,
              discountTotal: 0,
              total: 165.80,
              paymentMethod: 'pix',
              installmentsCount: 1,
              receivedAmount: 165.80,
              changeAmount: 0,
              status: 'concluido',
              stockDeducted: true,
              financialGenerated: true,
              createdAt: `${todayIso}T09:30:00.000Z`,
              updatedAt: `${todayIso}T09:30:00.000Z`,
            },
            {
              id: 'ord-venda-ext-mes',
              number: 'PED-EXT-2026-0002',
              type: 'venda',
              origin: 'externa_celular',
              companyId: companyMatrizId,
              customerId: 'cli-001',
              customerName: 'Supermercado Subaé Ltda',
              userId: 'usr-vendedor-externo',
              userName: 'Bruno Lima',
              items: [
                {
                  id: 'item-ext-3',
                  productId: 'prod-desinfetante-5l',
                  productCode: 'PA-302',
                  description: 'Desinfetante Floral Imperial Profissional 5L',
                  unit: 'UN',
                  quantity: 25,
                  unitPrice: 21.50,
                  discountPercent: 5,
                  discountValue: 26.88,
                  totalPrice: 510.62,
                  unitCost: 9.85,
                  locationId: 'loc-comercial',
                },
              ],
              subtotal: 537.50,
              discountTotal: 26.88,
              total: 510.62,
              paymentMethod: 'boleto',
              installmentsCount: 2,
              receivedAmount: 0,
              changeAmount: 0,
              status: 'concluido',
              stockDeducted: true,
              financialGenerated: true,
              createdAt: `${currentMonthIso}-01T14:15:00.000Z`,
              updatedAt: `${currentMonthIso}-01T14:15:00.000Z`,
            },
          ];
          const existingExtIds = new Set((this.state.orders || []).map((o) => o.id));
          const uniqueExtToAdd = sampleExternalSales.filter((o) => !existingExtIds.has(o.id));
          if (uniqueExtToAdd.length > 0) {
            this.state.orders = [...uniqueExtToAdd, ...(this.state.orders || [])];
            this.persist();
          }
        }

        // Garante que existam pedidos de venda com origem 'pedidos_venda' (Retaguarda / Venda Corporativa)
        if (!isCleanStart && this.state && !localStorage.getItem(DB_KEY_PREFIX + 'orders_cleared') && (!this.state.orders || !this.state.orders.some((o) => o.origin === 'pedidos_venda' && o.type === 'venda'))) {
          const companyMatrizId = 'comp-matriz';
          const todayIso = new Date().toISOString().split('T')[0];
          const currentMonthIso = todayIso.slice(0, 7);
          const sampleBackofficeSales: Order[] = [
            {
              id: 'ped-rom-1',
              number: 'PED-2026-0008',
              type: 'venda',
              origin: 'pedidos_venda',
              companyId: companyMatrizId,
              customerId: 'cli-001',
              customerName: 'Supermercado Subaé Ltda',
              userId: 'usr-admin',
              userName: 'Carlos Silva',
              items: [
                {
                  id: 'item-bo-1',
                  productId: 'prod-detergente-500',
                  productCode: 'PA-301',
                  description: 'Detergente Líquido Neutro Imperial 500ml',
                  unit: 'UN',
                  quantity: 120,
                  unitPrice: 3.5,
                  discountPercent: 0,
                  discountValue: 0,
                  totalPrice: 420.0,
                  unitCost: 1.84,
                  locationId: 'loc-comercial',
                },
                {
                  id: 'item-bo-2',
                  productId: 'prod-desinfetante-5l',
                  productCode: 'PA-302',
                  description: 'Desinfetante Floral Imperial Profissional 5L',
                  unit: 'UN',
                  quantity: 20,
                  unitPrice: 21.0,
                  discountPercent: 0,
                  discountValue: 0,
                  totalPrice: 420.0,
                  unitCost: 9.85,
                  locationId: 'loc-comercial',
                },
              ],
              subtotal: 840.0,
              discountTotal: 0,
              total: 840.0,
              paymentMethod: 'boleto',
              installmentsCount: 2,
              receivedAmount: 0,
              changeAmount: 0,
              status: 'entregue',
              stockDeducted: true,
              financialGenerated: true,
              deliveryStatus: 'entregue',
              deliveryManifestId: 'rom-001',
              deliveryManifestNumber: 'ROM-2026-0001',
              preManifestStatus: 'concluido',
              preManifestDeliveryStatus: 'pendente',
              createdAt: `${currentMonthIso}-04T14:20:00.000Z`,
              updatedAt: `${currentMonthIso}-04T14:20:00.000Z`,
            },
            {
              id: 'ped-rom-2',
              number: 'PED-2026-0012',
              type: 'venda',
              origin: 'pedidos_venda',
              companyId: companyMatrizId,
              customerId: 'cli-003',
              customerName: 'Lava Rápido & Auto Posto Jacuípe',
              userId: 'usr-vendedor-externo',
              userName: 'Bruno Lima',
              items: [
                {
                  id: 'item-bo-3',
                  productId: 'prod-detergente-500',
                  productCode: 'PA-301',
                  description: 'Detergente Líquido Neutro Imperial 500ml',
                  unit: 'UN',
                  quantity: 80,
                  unitPrice: 3.5,
                  discountPercent: 0,
                  discountValue: 0,
                  totalPrice: 280.0,
                  unitCost: 1.84,
                  locationId: 'loc-comercial',
                },
                {
                  id: 'item-bo-4',
                  productId: 'prod-pano-microfibra',
                  productCode: 'REV-404',
                  description: 'Pano Microfibra Multiuso 40x40cm (Pacote com 5 unid)',
                  unit: 'PCT',
                  quantity: 14,
                  unitPrice: 20.0,
                  discountPercent: 0,
                  discountValue: 0,
                  totalPrice: 280.0,
                  unitCost: 9.0,
                  locationId: 'loc-comercial',
                },
              ],
              subtotal: 560.0,
              discountTotal: 0,
              total: 560.0,
              paymentMethod: 'dinheiro',
              installmentsCount: 1,
              receivedAmount: 560.0,
              changeAmount: 0,
              status: 'em_transito',
              stockDeducted: true,
              financialGenerated: true,
              deliveryStatus: 'em_transito',
              deliveryManifestId: 'rom-001',
              deliveryManifestNumber: 'ROM-2026-0001',
              preManifestStatus: 'concluido',
              preManifestDeliveryStatus: 'pendente',
              createdAt: `${currentMonthIso}-05T16:40:00.000Z`,
              updatedAt: `${currentMonthIso}-05T16:40:00.000Z`,
            },
            {
              id: 'ped-rom-3',
              number: 'PED-2026-0015',
              type: 'venda',
              origin: 'pedidos_venda',
              companyId: companyMatrizId,
              customerId: 'cli-004',
              customerName: 'Maria Helena dos Santos',
              userId: 'usr-admin',
              userName: 'Carlos Silva',
              items: [
                {
                  id: 'item-bo-5',
                  productId: 'prod-desinfetante-5l',
                  productCode: 'PA-302',
                  description: 'Desinfetante Floral Imperial Profissional 5L',
                  unit: 'UN',
                  quantity: 10,
                  unitPrice: 21.0,
                  discountPercent: 0,
                  discountValue: 0,
                  totalPrice: 210.0,
                  unitCost: 9.85,
                  locationId: 'loc-comercial',
                },
                {
                  id: 'item-bo-6',
                  productId: 'prod-pano-microfibra',
                  productCode: 'REV-404',
                  description: 'Pano Microfibra Multiuso 40x40cm (Pacote com 5 unid)',
                  unit: 'PCT',
                  quantity: 3,
                  unitPrice: 23.33,
                  discountPercent: 0,
                  discountValue: 0,
                  totalPrice: 70.0,
                  unitCost: 9.0,
                  locationId: 'loc-comercial',
                },
              ],
              subtotal: 280.0,
              discountTotal: 0,
              total: 280.0,
              paymentMethod: 'pix',
              installmentsCount: 1,
              receivedAmount: 280.0,
              changeAmount: 0,
              status: 'em_transito',
              stockDeducted: true,
              financialGenerated: true,
              deliveryStatus: 'em_transito',
              deliveryManifestId: 'rom-001',
              deliveryManifestNumber: 'ROM-2026-0001',
              preManifestStatus: 'concluido',
              preManifestDeliveryStatus: 'pendente',
              createdAt: `${todayIso}T07:15:00.000Z`,
              updatedAt: `${todayIso}T07:15:00.000Z`,
            },
          ];
          const existingBoIds = new Set((this.state.orders || []).map((o) => o.id));
          const uniqueBoToAdd = sampleBackofficeSales.filter((o) => !existingBoIds.has(o.id));
          if (uniqueBoToAdd.length > 0) {
            this.state.orders = [...uniqueBoToAdd, ...(this.state.orders || [])];
            this.persist();
          }
        }

        // Garante que existam ordens de produção de amostra para testes dos filtros e histórico (apenas modo demonstração)
        if (!isCleanStart && this.state && !localStorage.getItem(DB_KEY_PREFIX + 'production_cleared') && (!this.state.productionOrders || this.state.productionOrders.length === 0)) {
          this.state.productionOrders = [
            {
              id: 'op-001',
              number: 'OP-2026-0001',
              companyId: 'comp-matriz',
              productId: 'prod-detergente-500',
              productCode: 'PA-301',
              productDescription: 'Detergente Líquido Neutro Imperial 500ml',
              plannedQuantity: 100,
              producedQuantity: 100,
              destinationLocationId: 'loc-comercial',
              componentsConsumed: [
                {
                  componentId: 'comp-lauril-27',
                  componentCode: 'MP-001',
                  description: 'Lauril Éter Sulfato de Sódio 27%',
                  unit: 'L',
                  plannedQty: 15,
                  actualQty: 15,
                  locationId: 'loc-quimicos',
                  unitCost: 4.80,
                  totalCost: 72.00,
                },
                {
                  componentId: 'comp-amida-60',
                  componentCode: 'MP-002',
                  description: 'Amida 60 Espessante Estabilizador',
                  unit: 'L',
                  plannedQty: 0.5,
                  actualQty: 0.5,
                  locationId: 'loc-quimicos',
                  unitCost: 28.00,
                  totalCost: 14.00,
                },
                {
                  componentId: 'comp-frasco-500',
                  componentCode: 'EMB-001',
                  description: 'Frasco Plástico PET Transparente 500ml',
                  unit: 'UN',
                  plannedQty: 100,
                  actualQty: 100,
                  locationId: 'loc-embalagens',
                  unitCost: 0.65,
                  totalCost: 65.00,
                },
                {
                  componentId: 'comp-tampa-flip',
                  componentCode: 'EMB-002',
                  description: 'Tampa Flip-Top Rosca 28mm Vermelha',
                  unit: 'UN',
                  plannedQty: 100,
                  actualQty: 100,
                  locationId: 'loc-embalagens',
                  unitCost: 0.22,
                  totalCost: 22.00,
                },
              ],
              totalCost: 173.00,
              unitCost: 1.73,
              status: 'concluida',
              orderDate: new Date(Date.now() - 1 * 86400000).toISOString(),
              completionDate: new Date(Date.now() - 1 * 86400000).toISOString(),
              userId: 'usr-admin',
              userName: 'Carlos Silva (Gestor)',
              notes: 'Lote 01-A26 - Reposição de estoque comercial',
            },
            {
              id: 'op-002',
              number: 'OP-2026-0002',
              companyId: 'comp-matriz',
              productId: 'prod-desinfetante-5l',
              productCode: 'PA-302',
              productDescription: 'Desinfetante Floral Imperial Profissional 5L',
              plannedQuantity: 40,
              producedQuantity: 40,
              destinationLocationId: 'loc-comercial',
              componentsConsumed: [
                {
                  componentId: 'comp-quaternario-amonia',
                  componentCode: 'MP-003',
                  description: 'Cloreto de Benzalcônio 50% (Quaternário)',
                  unit: 'L',
                  plannedQty: 4,
                  actualQty: 4,
                  locationId: 'loc-quimicos',
                  unitCost: 22.50,
                  totalCost: 90.00,
                },
                {
                  componentId: 'comp-galao-5l',
                  componentCode: 'EMB-003',
                  description: 'Galão Bombona PEAD 5 Litros com Tampa Lacre',
                  unit: 'UN',
                  plannedQty: 40,
                  actualQty: 40,
                  locationId: 'loc-embalagens',
                  unitCost: 3.20,
                  totalCost: 128.00,
                },
              ],
              totalCost: 218.00,
              unitCost: 5.45,
              status: 'concluida',
              orderDate: new Date(Date.now() - 4 * 86400000).toISOString(),
              completionDate: new Date(Date.now() - 4 * 86400000).toISOString(),
              userId: 'usr-admin',
              userName: 'Carlos Silva (Gestor)',
              notes: 'Lote 02-B26 - Atendimento a pedidos da semana',
            },
            {
              id: 'op-003',
              number: 'OP-2026-0003',
              companyId: 'comp-matriz',
              productId: 'prod-detergente-500',
              productCode: 'PA-301',
              productDescription: 'Detergente Líquido Neutro Imperial 500ml',
              plannedQuantity: 150,
              producedQuantity: 150,
              destinationLocationId: 'loc-comercial',
              componentsConsumed: [
                {
                  componentId: 'comp-lauril-27',
                  componentCode: 'MP-001',
                  description: 'Lauril Éter Sulfato de Sódio 27%',
                  unit: 'L',
                  plannedQty: 22.5,
                  actualQty: 22.5,
                  locationId: 'loc-quimicos',
                  unitCost: 4.80,
                  totalCost: 108.00,
                },
                {
                  componentId: 'comp-frasco-500',
                  componentCode: 'EMB-001',
                  description: 'Frasco Plástico PET Transparente 500ml',
                  unit: 'UN',
                  plannedQty: 150,
                  actualQty: 150,
                  locationId: 'loc-embalagens',
                  unitCost: 0.65,
                  totalCost: 97.50,
                },
              ],
              totalCost: 205.50,
              unitCost: 1.37,
              status: 'concluida',
              orderDate: new Date(Date.now() - 15 * 86400000).toISOString(),
              completionDate: new Date(Date.now() - 15 * 86400000).toISOString(),
              userId: 'usr-admin',
              userName: 'Carlos Silva (Gestor)',
              notes: 'Lote 03-C26 - Produção quinzenal',
            },
          ];
          this.persist();
        }

        // Garante que a lista de componentes com código próprio e matérias-primas associadas exista (apenas modo demonstração)
        if (!isCleanStart && this.state && (!this.state.components || this.state.components.length === 0)) {
          this.state.components = [...DEFAULT_COMPONENTS];
          this.persist();
        }

        // Harmoniza composições de produtos com os componentes cadastrados
        if (this.state && this.state.components && this.state.products) {
          const comps = this.state.components;
          let changed = false;
          this.state.products.forEach((p) => {
            if (p.composition && Array.isArray(p.composition)) {
              p.composition.forEach((ci) => {
                const match = comps.find(
                  (c) =>
                    c.id === ci.componentId ||
                    c.code === ci.componentCode ||
                    c.rawMaterialId === ci.componentId ||
                    c.rawMaterialId === ci.rawMaterialId
                );
                if (match) {
                  if (ci.componentId !== match.id || ci.componentCode !== match.code || ci.rawMaterialId !== match.rawMaterialId) {
                    ci.componentId = match.id;
                    ci.componentCode = match.code;
                    ci.componentDescription = match.name;
                    ci.rawMaterialId = match.rawMaterialId;
                    ci.rawMaterialCode = match.rawMaterialCode;
                    ci.rawMaterialDescription = match.rawMaterialDescription;
                    changed = true;
                  }
                }
              });
            }
          });
          if (changed) {
            this.persist();
          }
        }

        // Garante que existam formas de pagamento, contas bancárias e prazos de pagamento
        if (this.state && (!this.state.paymentMethods || this.state.paymentMethods.length === 0)) {
          this.state.paymentMethods = [...DEFAULT_PAYMENT_METHODS];
          this.persist();
        }
        if (this.state && (!this.state.financialAccounts || this.state.financialAccounts.length === 0)) {
          this.state.financialAccounts = [...DEFAULT_FINANCIAL_ACCOUNTS];
          this.persist();
        }
        if (this.state && (!this.state.paymentTermsList || this.state.paymentTermsList.length === 0)) {
          this.state.paymentTermsList = [...DEFAULT_PAYMENT_TERMS];
          this.persist();
        } else if (this.state && this.state.paymentTermsList && this.state.paymentTermsList.length > 0) {
          const defaultTermIds = new Set(DEFAULT_PAYMENT_TERMS.map((d) => d.id));
          let termsUpdated = false;
          this.state.paymentTermsList = this.state.paymentTermsList.map((t) => {
            if (t.isSystemDefault === undefined && (defaultTermIds.has(t.id) || t.companyId === 'comp-matriz' || !t.companyId)) {
              termsUpdated = true;
              return { ...t, isSystemDefault: true };
            }
            return t;
          });
          if (termsUpdated) {
            this.persist();
          }
        }

        // Unifica "Revenda" e "Produtos Acabados" em um único depósito padrão chamado "Comercial"
        if (this.state && this.state.stockLocations) {
          const locs = this.state.stockLocations;
          const oldLocIds = new Set(['loc-revenda', 'loc-acabados']);
          const hasOldLocs = locs.some(
            (l) => oldLocIds.has(l.id) || l.name === 'Revenda' || l.name === 'Revenda Balcão' || l.name === 'Produtos Acabados'
          );

          if (hasOldLocs || !locs.some((l) => l.id === 'loc-comercial' || l.name === 'Comercial')) {
            const compId = this.state.companies?.[0]?.id || 'comp-matriz';
            const filteredLocs = locs.filter(
              (l) => !oldLocIds.has(l.id) && l.name !== 'Revenda' && l.name !== 'Revenda Balcão' && l.name !== 'Produtos Acabados'
            );

            let comercialLoc = locs.find((l) => l.id === 'loc-comercial' || l.name === 'Comercial');
            if (!comercialLoc) {
              comercialLoc = {
                id: 'loc-comercial',
                code: 'COM-01',
                name: 'Comercial',
                companyId: compId,
                description: 'Estoque Comercial unificado para expedição, balcão e vendas',
                type: 'comercial',
                status: 'ativo',
              };
            } else {
              comercialLoc = {
                ...comercialLoc,
                id: 'loc-comercial',
                name: 'Comercial',
                type: 'comercial',
                status: 'ativo',
              };
            }

            this.state.stockLocations = [comercialLoc, ...filteredLocs.filter((l) => l.id !== 'loc-comercial')];

            // Migrar saldos agrupando no depósito Comercial
            if (this.state.stockBalances) {
              const balanceMap: Record<string, ProductStockBalance> = {};
              for (const bal of this.state.stockBalances) {
                const targetLocId = (bal.locationId === 'loc-revenda' || bal.locationId === 'loc-acabados')
                  ? 'loc-comercial'
                  : bal.locationId;
                const key = `${bal.productId}__${targetLocId}`;
                if (!balanceMap[key]) {
                  balanceMap[key] = {
                    ...bal,
                    locationId: targetLocId,
                  };
                } else {
                  balanceMap[key].quantity += bal.quantity;
                  balanceMap[key].reserved += bal.reserved || 0;
                  balanceMap[key].minStock = Math.max(balanceMap[key].minStock || 0, bal.minStock || 0);
                }
              }
              this.state.stockBalances = Object.values(balanceMap);
            }

            // Migrar defaultLocationId dos produtos
            if (this.state.products) {
              this.state.products = this.state.products.map((p) => {
                if (p.defaultLocationId === 'loc-revenda' || p.defaultLocationId === 'loc-acabados') {
                  return { ...p, defaultLocationId: 'loc-comercial' };
                }
                return p;
              });
            }

            // Migrar itens dos pedidos
            if (this.state.orders) {
              this.state.orders = this.state.orders.map((o) => ({
                ...o,
                items: o.items.map((it) => {
                  if (it.locationId === 'loc-revenda' || it.locationId === 'loc-acabados') {
                    return { ...it, locationId: 'loc-comercial' };
                  }
                  return it;
                }),
              }));
            }

            // Migrar movimentações de estoque
            if (this.state.stockMovements) {
              this.state.stockMovements = this.state.stockMovements.map((m) => {
                let updated = { ...m };
                if (m.locationId === 'loc-revenda' || m.locationId === 'loc-acabados') {
                  updated.locationId = 'loc-comercial';
                  updated.locationName = 'Comercial';
                }
                if (m.toLocationId === 'loc-revenda' || m.toLocationId === 'loc-acabados') {
                  updated.toLocationId = 'loc-comercial';
                  updated.toLocationName = 'Comercial';
                }
                return updated;
              });
            }

            this.persist();
          }
        }

        if (this.state) {
          let stateNeedsPersist = false;

          // Garante a existência do depósito comercial para a matriz
          if (this.state.stockLocations && !this.state.stockLocations.some((l) => l.id === 'loc-comercial' || l.name.toLowerCase() === 'comercial')) {
            this.state.stockLocations.unshift({
              id: 'loc-comercial',
              code: 'COM-01',
              name: 'Comercial',
              companyId: 'comp-matriz',
              description: 'Estoque Comercial unificado e compartilhado para todas as empresas (Matriz e Filiais)',
              type: 'comercial',
              status: 'ativo',
            });
            stateNeedsPersist = true;
          }

          // Garante que cada empresa cadastrada (matriz ou filial) tenha ao menos um depósito comercial ativo
          if (this.state.companies && this.state.stockLocations) {
            for (const comp of this.state.companies) {
              const hasCompLoc = this.state.stockLocations.some(
                (l) => l.companyId === comp.id && l.status === 'ativo'
              );
              if (!hasCompLoc) {
                this.state.stockLocations.push({
                  id: `loc-comercial-${comp.id}`,
                  code: `COM-${comp.type === 'matriz' ? 'MTZ' : 'FIL'}`,
                  name: `Comercial - ${comp.tradeName || comp.name}`,
                  companyId: comp.id,
                  description: `Estoque comercial próprio de ${comp.tradeName || comp.name}`,
                  type: 'comercial',
                  status: 'ativo',
                });
                stateNeedsPersist = true;
              }
            }
          }

          if (!this.state.companyStockTransfers) {
            this.state.companyStockTransfers = [];
          }

          if (!isCleanStart) {
            if (!localStorage.getItem(DB_KEY_PREFIX + 'routes_cleared') && (!this.state.deliveryRoutes || this.state.deliveryRoutes.length === 0)) {
              this.state.deliveryRoutes = [...DEFAULT_DELIVERY_ROUTES];
              stateNeedsPersist = true;
            }
            if (!localStorage.getItem(DB_KEY_PREFIX + 'manifests_cleared') && (!this.state.deliveryManifests || this.state.deliveryManifests.length === 0)) {
              this.state.deliveryManifests = [...DEFAULT_DELIVERY_MANIFESTS];
              stateNeedsPersist = true;
            }
            if (!localStorage.getItem(DB_KEY_PREFIX + 'market_areas_cleared') && (!this.state.marketAreas || this.state.marketAreas.length === 0)) {
              this.state.marketAreas = [...DEFAULT_MARKET_AREAS];
              stateNeedsPersist = true;
            }
            if (!localStorage.getItem(DB_KEY_PREFIX + 'neighborhoods_cleared') && (!this.state.neighborhoods || this.state.neighborhoods.length === 0)) {
              this.state.neighborhoods = [...DEFAULT_NEIGHBORHOODS];
              stateNeedsPersist = true;
            }
          }

          // Mantém as cidades da Bahia (raio de 200km de Feira de Santana) como padrão global do sistema em ordem alfabética
          if (!localStorage.getItem(DB_KEY_PREFIX + 'cities_cleared')) {
            if (!this.state.cities || this.state.cities.length === 0) {
              this.state.cities = [...DEFAULT_CITIES];
              stateNeedsPersist = true;
            } else {
              const hasCities200km = localStorage.getItem(DB_KEY_PREFIX + 'bahia_cities_200km_v2') === 'true';
              const defaultById = new Map(DEFAULT_CITIES.map((c) => [c.id, c]));
              const existingKeys = new Set(
                this.state.cities.map((c) => `${c.name.trim().toLowerCase()}|${c.stateUf.trim().toUpperCase()}`)
              );
              const existingIds = new Set(this.state.cities.map((c) => c.id));
              let enriched = false;
              this.state.cities = this.state.cities.map((c) => {
                const def = defaultById.get(c.id);
                if (def && (c.isSystemDefault === undefined || c.distanceKm === undefined)) {
                  enriched = true;
                  return {
                    ...c,
                    isSystemDefault: c.isSystemDefault ?? true,
                    distanceKm: c.distanceKm ?? def.distanceKm,
                  };
                }
                return c;
              });
              if (!hasCities200km) {
                const additions = DEFAULT_CITIES.filter(
                  (d) =>
                    !existingIds.has(d.id) &&
                    !existingKeys.has(`${d.name.trim().toLowerCase()}|${d.stateUf.trim().toUpperCase()}`)
                );
                if (additions.length > 0) {
                  this.state.cities = [...this.state.cities, ...additions].sort((a, b) =>
                    a.name.localeCompare(b.name, 'pt-BR')
                  );
                  enriched = true;
                }
                try {
                  localStorage.setItem(DB_KEY_PREFIX + 'bahia_cities_200km_v2', 'true');
                } catch {}
              }
              if (enriched) {
                stateNeedsPersist = true;
              }
            }
          }

          // Garante exemplos iniciais de Motoristas e Veículos na empresa ativa (exceto após reset/limpeza)
          const hasFleetExamplesV2 =
            typeof window !== 'undefined' &&
            localStorage.getItem(DB_KEY_PREFIX + 'fleet_examples_v2') === 'true';
          const vehiclesCleared =
            typeof window !== 'undefined' &&
            localStorage.getItem(DB_KEY_PREFIX + 'vehicles_cleared') === 'true';
          const driversCleared =
            typeof window !== 'undefined' &&
            localStorage.getItem(DB_KEY_PREFIX + 'drivers_cleared') === 'true';
          const fleetCompId =
            this.state.currentCompanyId || this.state.companies?.[0]?.id || 'comp-matriz';

          if (!isCleanStart && !hasFleetExamplesV2) {
            if (!vehiclesCleared) {
              const currentVehicles = this.state.deliveryVehicles || [];
              const hasVehForComp = currentVehicles.some((v) => v.companyId === fleetCompId);
              if (!hasVehForComp || currentVehicles.length < DEFAULT_DELIVERY_VEHICLES.length) {
                const existingIds = new Set(currentVehicles.map((v) => v.id));
                const additions = DEFAULT_DELIVERY_VEHICLES.filter((v) => !existingIds.has(v.id)).map(
                  (v) => ({ ...v, companyId: fleetCompId })
                );
                if (additions.length > 0) {
                  this.state.deliveryVehicles = [...currentVehicles, ...additions];
                  stateNeedsPersist = true;
                }
              }
            }

            if (!driversCleared) {
              const currentDrivers = this.state.deliveryDrivers || [];
              const hasDrvForComp = currentDrivers.some((d) => d.companyId === fleetCompId);
              if (!hasDrvForComp || currentDrivers.length < DEFAULT_DELIVERY_DRIVERS.length) {
                const existingIds = new Set(currentDrivers.map((d) => d.id));
                const additions = DEFAULT_DELIVERY_DRIVERS.filter((d) => !existingIds.has(d.id)).map(
                  (d) => ({ ...d, companyId: fleetCompId })
                );
                if (additions.length > 0) {
                  this.state.deliveryDrivers = [...currentDrivers, ...additions];
                  stateNeedsPersist = true;
                }
              }
            }

            if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
              try {
                localStorage.setItem(DB_KEY_PREFIX + 'fleet_examples_v2', 'true');
              } catch {
                // ignore
              }
            }
          }
          if (!this.state.states || this.state.states.length === 0) {
            this.state.states = [...DEFAULT_STATES];
            stateNeedsPersist = true;
          }
          if (!this.state.stockControlConfig) {
            this.state.stockControlConfig = { ...DEFAULT_STOCK_CONTROL_CONFIG };
            stateNeedsPersist = true;
          }
          if (this.state.customers && this.state.customers.length > 0) {
            this.state.customers = this.state.customers.map((c) => {
              if (!c.deliveryRouteId || !c.marketArea || !c.sellerName) {
                stateNeedsPersist = true;
                if (c.city === 'Alagoinhas' || c.city === 'Catu' || c.city === 'Pojuca' || c.city === 'Camaçari' || c.city === 'Salvador') {
                  return {
                    ...c,
                    marketArea: c.marketArea || 'Litoral Norte & Alagoinhas',
                    sellerName: c.sellerName || 'Roberto Vendas',
                    deliveryRouteId: c.deliveryRouteId || 'rot-03',
                    deliveryRouteName: c.deliveryRouteName || 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)',
                  };
                } else if (c.city === 'Santo Antônio de Jesus' || c.city === 'Cachoeira' || c.city === 'Cruz das Almas') {
                  return {
                    ...c,
                    marketArea: c.marketArea || 'Recôncavo Baiano',
                    sellerName: c.sellerName || 'Mariana Oliveira',
                    deliveryRouteId: c.deliveryRouteId || 'rot-02',
                    deliveryRouteName: c.deliveryRouteName || 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)',
                  };
                } else if (c.city === 'Serrinha' || c.city === 'Conceição do Coité' || c.city === 'Riachão do Jacuípe' || c.city === 'Ipirá') {
                  return {
                    ...c,
                    marketArea: c.marketArea || 'Portal do Sertão & Sisal',
                    sellerName: c.sellerName || 'Bruno Lima',
                    deliveryRouteId: c.deliveryRouteId || 'rot-04',
                    deliveryRouteName: c.deliveryRouteName || 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)',
                  };
                } else {
                  return {
                    ...c,
                    marketArea: c.marketArea || 'Feira de Santana - Sede',
                    sellerName: c.sellerName || 'Carlos Silva',
                    deliveryRouteId: c.deliveryRouteId || 'rot-01',
                    deliveryRouteName: c.deliveryRouteName || 'Rota 01 - Feira de Santana (Sede & Entorno)',
                  };
                }
              }
              return c;
            });
          }

          // Higienização de segurança: remove eventuais senhas legadas em texto claro armazenadas no localStorage
          if (this.state.users && this.state.users.some((u) => 'password' in u)) {
            this.state.users = this.stripPasswordsFromUsers(this.state.users);
            stateNeedsPersist = true;
          }

          // Migração e garantia de permissões de menus/números dos usuários
          if (this.state.users && this.state.users.length > 0) {
            const normalized = this.normalizeUsersList(this.state.users);
            if (normalized.changed) {
              this.state.users = normalized.users;
              stateNeedsPersist = true;
            }
          }

          // Garante a existência do usuário Lizi se ainda não existir e não tiver sido excluído pelo admin (apenas modo demonstração)
          const deletedUsers = this.state.deletedUserIds || [];
          if (!isCleanStart && this.state.users && !deletedUsers.includes('usr-lizi') && !this.state.users.some((u) => u.login === 'lizi')) {
            const compId = this.state.companies?.[0]?.id || 'comp-matriz';
            this.state.users.push({
              id: 'usr-lizi',
              name: 'Lizi',
              login: 'lizi',
              role: 'balconista',
              companyId: compId,
              status: 'ativo',
              email: 'lizi.balcao@imperiallimpeza.com.br',
              phone: '(75) 98888-0006',
              permissions: {
                canViewCosts: false,
                canEditProducts: false,
                canDeleteRecords: false,
                canCancelSales: true,
                canAuthorizeDiscount: false,
                maxDiscountPercent: 10,
                canAccessFinancial: false,
                canAccessProduction: false,
                canAccessPurchases: false,
                canManageUsers: false,
                canAdjustStock: false,
                canCloseCashRegister: true,
                canViewGrossProfit: false,
                canViewNetProfit: false,
                canViewTotalRevenue: false,
                canViewProfitMargin: false,
                canViewProductCosts: false,
                canViewCashBalances: false,
                allowedMenuSections: ['inicio', 'vendas', 'cadastros'],
                allowedSubItems: ['pos', 'orders', 'orders_quotes'],
              },
            });
            stateNeedsPersist = true;
          }

          // Garante a existência do produto demonstrativo de Embalagem Master (apenas modo demonstração)
          if (!isCleanStart && this.state.products && !this.state.products.some((p) => p.isMasterPack)) {
            const baseProd = this.state.products.find((p) => p.id === 'prod-detergente-500' || p.code === 'PA-301') || this.state.products[0];
            if (baseProd) {
              const masterPackSample: Product = {
                id: 'prod-master-detergente-cx24',
                code: 'CX-301-24',
                description: `Caixa ${baseProd.description} c/ 24 UN`,
                unit: 'CX',
                costPrice: Number((baseProd.costPrice * 24).toFixed(2)),
                salePrice: Number((baseProd.salePrice * 24 * 0.95).toFixed(2)),
                family: baseProd.family || 'Produtos Próprios',
                group: 'Embalagens Master',
                barcode: '7891112223240',
                minStock: 5,
                productType: 'revenda',
                hasComposition: false,
                defaultLocationId: baseProd.defaultLocationId || 'loc-comercial',
                status: 'ativo',
                notes: `Embalagem Master contendo 24 unidades do item ${baseProd.code} - ${baseProd.description}. Controle de estoque integrado automaticamente ao item unitário.`,
                isMasterPack: true,
                masterPackAssociatedProductId: baseProd.id,
                masterPackAssociatedProductCode: baseProd.code,
                masterPackAssociatedProductDescription: baseProd.description,
                masterPackUnits: 24,
                masterPackPackagingType: 'caixa',
              };
              this.state.products.push(masterPackSample);
              stateNeedsPersist = true;
            }
          }

          // Garante a existência do Plano de Contas padrão caso ainda não exista no estado local
          if (!this.state.chartOfAccounts || this.state.chartOfAccounts.length === 0) {
            this.state.chartOfAccounts = [...DEFAULT_CHART_OF_ACCOUNTS];
            stateNeedsPersist = true;
          }

          // Normaliza o status de classificação de Contas a Pagar antigas
          if (this.state.accountsPayable && Array.isArray(this.state.accountsPayable)) {
            this.state.accountsPayable.forEach((p) => {
              if (!p.classificationStatus) {
                p.classificationStatus = p.chartAccountId || p.launchCode ? 'classificado' : 'pendente';
                stateNeedsPersist = true;
              }
            });
          }

          if (!this.state.salesReturns) {
            this.state.salesReturns = [];
          }

          // Migração automática de quaisquer dados residuais do Sudeste/SP/Curitiba -> Bahia (Feira de Santana / Alagoinhas e raio de 150km)
          if (this.applyBahiaRegionalMigration(this.state, true, isCleanStart)) {
            stateNeedsPersist = true;
          }
          try {
            if (!isCleanStart && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
              localStorage.setItem(DB_KEY_PREFIX + 'bahia_demo_v2', 'true');
            }
          } catch {
            // ignore
          }

          // Reconcilia status de pedidos já vinculados a romaneios ativos
          if (this.state.deliveryManifests && this.state.orders) {
            for (const man of this.state.deliveryManifests) {
              if (man.status !== 'cancelado' && man.orders && man.orders.length > 0) {
                const changed = this.syncOrdersWithManifest(this.state, man, []);
                if (changed) {
                  stateNeedsPersist = true;
                }
              }
            }
          }

          if (stateNeedsPersist) {
            this.persist();
          }
        }

        if (this.state && !this.state.salesReturns) {
          this.state.salesReturns = [];
        }

        return this.state!;
      }
    } catch (e) {
      console.warn('Falha ao ler dados locais, restaurando sementes:', e);
    }

    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'firebase_project', ACTIVE_FIREBASE_PROJECT_ID);
        localStorage.setItem(DB_KEY_PREFIX + 'clean_start', 'true');
      } catch {}
    }
    this.state = this.getCleanZeroState(false);
    this.persist();
    return this.state!;
  }

  private static stripPasswordsFromUsers(users: User[] | undefined): User[] {
    return (users || []).map((u) => {
      if (u && 'password' in u) {
        const { password: _removedPassword, ...rest } = u;
        return rest;
      }
      return u;
    });
  }

  private static writeStateToLocalStorage(): boolean {
    if (!this.state || typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return false;
    }
    // Higienização prévia de coleções que crescem indefinidamente e remoção de senhas em texto claro
    if (this.state.auditLogs && this.state.auditLogs.length > 60) {
      this.state.auditLogs = this.state.auditLogs.slice(0, 60);
    }
    if (this.state.stockMovements && this.state.stockMovements.length > 150) {
      this.state.stockMovements = this.state.stockMovements.slice(0, 150);
    }
    if (this.state.users && this.state.users.some((u) => 'password' in u)) {
      this.state.users = this.stripPasswordsFromUsers(this.state.users);
    }

    const safeStateToStore: DatabaseState = {
      ...this.state,
      users: this.stripPasswordsFromUsers(this.state.users),
    };

    try {
      localStorage.setItem(DB_KEY_PREFIX + 'state', JSON.stringify(safeStateToStore));
      return true;
    } catch (e: any) {
      const isQuotaErr =
        e?.name === 'QuotaExceededError' ||
        e?.code === 22 ||
        e?.number === -2147024882 ||
        String(e?.message || e).includes('quota');

      if (isQuotaErr) {
        console.warn('Cota de armazenamento local (localStorage) atingida. Executando compactação de emergência...');
        try {
          // 1. Remover chaves órfãs ou temporárias do localStorage
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (
              key &&
              key !== (DB_KEY_PREFIX + 'state') &&
              key !== (DB_KEY_PREFIX + 'last_remote_sync') &&
              key !== this.AUTH_SESSION_KEY &&
              key !== this.AUTH_REMEMBER_LOGIN_KEY
            ) {
              if (
                key.includes('backup') ||
                key.includes('temp') ||
                key.includes('cache') ||
                key.startsWith('debug_')
              ) {
                localStorage.removeItem(key);
              }
            }
          }

          // 2. Compactação agressiva de logs e histórico
          if (this.state.auditLogs) {
            this.state.auditLogs = this.state.auditLogs.slice(0, 25);
          }
          if (this.state.stockMovements) {
            this.state.stockMovements = this.state.stockMovements.slice(0, 50);
          }

          const compactSafeState: DatabaseState = {
            ...this.state,
            users: this.stripPasswordsFromUsers(this.state.users),
          };
          localStorage.setItem(DB_KEY_PREFIX + 'state', JSON.stringify(compactSafeState));
          console.log('Compactação de emergência concluída com sucesso. Banco local salvo.');
          return true;
        } catch (retryErr) {
          console.warn('Aviso: Armazenamento local do navegador cheio. O sistema continua operando em memória e na nuvem.');
          return false;
        }
      } else {
        console.error('Erro ao persistir banco no localStorage:', e);
        return false;
      }
    }
  }

  public static persist() {
    this.refreshStateReferences();
    this.writeStateToLocalStorage();
    this.notify();
    this.onPersistListeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Erro ao acionar listener de persistência:', err);
      }
    });
  }

  public static resetToFactoryDefaults(): boolean {
    if (this.isSessionAuthenticated() && !this.isMasterAdmin()) {
      return false;
    }
    const preservedTerms = (this.state?.paymentTermsList || []).filter(
      (t) => t.isSystemDefault !== false
    );
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem(DB_KEY_PREFIX + 'clean_start', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'pending_factory_reset', 'true');
      localStorage.setItem('gestaofacil_needs_matriz_setup', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'orders_cleared', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'receivables_cleared', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'manifests_cleared', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'fleet_examples_v2', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'clients_cleared', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'products_cleared', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'suppliers_cleared', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'production_cleared', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'routes_cleared', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'drivers_cleared', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'vehicles_cleared', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'market_areas_cleared', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'neighborhoods_cleared', 'true');
      localStorage.removeItem(DB_KEY_PREFIX + 'cities_cleared');
      localStorage.setItem(DB_KEY_PREFIX + 'cashflow_cleared', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'payables_cleared', 'true');
      localStorage.setItem(DB_KEY_PREFIX + 'cash_registers_cleared', 'true');
      localStorage.removeItem(DB_KEY_PREFIX + 'last_remote_sync');
      localStorage.removeItem('gestaofacil_remembered_login');
    }
    const preservedCities = (this.state?.cities || []).filter(
      (c) => c.isSystemDefault === true
    );
    const cleanState = this.getCleanZeroState(true);
    if (preservedTerms.length > 0) {
      const preservedIds = new Set(preservedTerms.map((t) => t.id));
      const missingDefaults = DEFAULT_PAYMENT_TERMS.filter((d) => !preservedIds.has(d.id));
      cleanState.paymentTermsList = [...preservedTerms, ...missingDefaults];
    }
    if (preservedCities.length > 0) {
      const preservedCityKeys = new Set(
        preservedCities.map((c) => `${c.name.trim().toLowerCase()}|${c.stateUf.trim().toUpperCase()}`)
      );
      const missingDefaultCities = DEFAULT_CITIES.filter(
        (d) => !preservedCityKeys.has(`${d.name.trim().toLowerCase()}|${d.stateUf.trim().toUpperCase()}`)
      );
      cleanState.cities = [...preservedCities, ...missingDefaultCities];
    }
    this.state = cleanState;
    this.persist();
    this.logout();
    return true;
  }

  /**
   * Executa a limpeza e zeramento seletivo de módulos e dados do sistema.
   * Apenas o usuário "Admin" (login: 'admin') pode invocar este método.
   * O usuário "Admin" padrão e a empresa matriz padrão são rigorosamente preservados.
   */
  public static executeSystemCleanup(options: SystemCleanupOptions): SystemCleanupResult {
    const emptyCleared = {
      clients: 0,
      productsStock: 0,
      usersSellers: 0,
      companiesBranches: 0,
      salesHistory: 0,
      cargoManifests: 0,
      suppliers: 0,
      productionOrders: 0,
      deliveryRoutes: 0,
      deliveryDrivers: 0,
      deliveryVehicles: 0,
      marketAreas: 0,
      neighborhoods: 0,
      cities: 0,
      cashFlow: 0,
      accountsPayable: 0,
      posCashControl: 0,
      auditLogs: 0,
    };

    const user = this.getCurrentUser();
    if (!this.isAdmin(user)) {
      return {
        success: false,
        cleared: { ...emptyCleared },
        error: 'Acesso negado: apenas o usuário "Admin" possui autorização para executar a limpeza de dados do sistema.',
      };
    }

    const state = this.getState();
    const result: SystemCleanupResult = {
      success: true,
      cleared: { ...emptyCleared },
    };
    const logCleanup = (mod: string, details: string) => {
      if (!options.auditLogs) {
        this.addAuditLog('LIMPEZA_DADOS', mod, 'SISTEMA', details, true);
      }
    };

    // 1. Clientes
    if (options.clients) {
      const count = state.customers ? state.customers.length : 0;
      result.cleared.clients = count;
      state.customers = [];
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'clients_cleared', 'true');
      } catch {}
      logCleanup('CADASTROS', `Limpeza de sistema: exclusão de todos os ${count} clientes cadastrados.`);
    }

    // 2. Produtos & Estoque
    if (options.productsStock) {
      const count = state.products ? state.products.length : 0;
      result.cleared.productsStock = count;
      state.products = [];
      state.stockBalances = [];
      state.stockMovements = [];
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'products_cleared', 'true');
      } catch {}
      logCleanup('ESTOQUE', `Limpeza de sistema: exclusão de ${count} produtos e zeramento de estoque.`);
    }

    // 3. Usuários & Vendedores (Protege Admin rigorosamente)
    if (options.usersSellers) {
      const removable = (state.users || []).filter((u) => u.login !== 'admin');
      const count = removable.length;
      result.cleared.usersSellers = count;
      const adminUsers = (state.users || []).filter((u) => u.login === 'admin');
      if (adminUsers.length > 0) {
        state.users = adminUsers;
      } else {
        // Garantia de segurança absoluta: se não houver admin, recria o Admin padrão
        state.users = [
          {
            id: 'usr-admin',
            name: 'Romeu Júnior',
            login: 'admin',
            email: 'romeujr.suporte@gmail.com',
            role: 'admin',
            companyId: state.companies[0]?.id || 'comp-matriz',
            status: 'ativo',
            permissions: {
              canViewCosts: true,
              canEditProducts: true,
              canDeleteRecords: true,
              canCancelSales: true,
              canAuthorizeDiscount: true,
              maxDiscountPercent: 30,
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
          },
        ];
      }
      state.currentUserId = state.users[0].id;
      logCleanup('CONFIGURACOES', `Limpeza de sistema: exclusão de ${count} operadores e vendedores. O usuário "Admin" padrão foi preservado.`);
    }

    // 4. Empresas & Filiais (Redefine para a Loja Matriz padrão)
    if (options.companiesBranches) {
      const count = state.companies ? state.companies.length : 0;
      result.cleared.companiesBranches = count;
      let matriz = state.companies.find((c) => c.type === 'matriz') || state.companies[0];
      if (!matriz) {
        matriz = {
          id: 'comp-matriz',
          name: 'Química & Limpeza Imperial Ltda',
          tradeName: 'Imperial Limpeza - Matriz Feira de Santana',
          cnpjCpf: '12.345.678/0001-90',
          type: 'matriz',
          phone: '(75) 3600-7890',
          email: 'contato@imperiallimpeza.com.br',
          address: {
            street: 'Av. Eduardo Fróes da Mota',
            number: '1500',
            neighborhood: 'CIS - Distrito Industrial do Subaé',
            city: 'Feira de Santana',
            state: 'BA',
            zipCode: '44000-000',
          },
          status: 'ativo',
        };
      } else {
        matriz = {
          ...matriz,
          type: 'matriz',
          status: 'ativo',
        };
      }
      state.companies = [matriz];
      state.currentCompanyId = matriz.id;
      if (state.users) {
        state.users.forEach((u) => {
          u.companyId = matriz.id;
        });
      }
      logCleanup('CONFIGURACOES', 'Limpeza de sistema: filiais redefinidas para a Loja Matriz padrão.');
    }

    // 5. Pedidos de Venda & Histórico
    if (options.salesHistory) {
      const count = state.orders ? state.orders.length : 0;
      result.cleared.salesHistory = count;
      state.orders = [];
      state.accountsReceivable = [];
      state.salesReturns = [];
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'orders_cleared', 'true');
        localStorage.setItem(DB_KEY_PREFIX + 'receivables_cleared', 'true');
      } catch {}
      logCleanup('VENDAS', `Limpeza de sistema: exclusão de ${count} pedidos de venda e lançamentos financeiros.`);
    }

    // 6. Romaneios de Carga
    if (options.cargoManifests) {
      const count = state.deliveryManifests ? state.deliveryManifests.length : 0;
      result.cleared.cargoManifests = count;
      state.deliveryManifests = [];
      if (state.orders && state.orders.length > 0) {
        state.orders = state.orders.map((ord) =>
          ord.deliveryManifestId || ord.deliveryManifestNumber
            ? {
                ...ord,
                deliveryManifestId: undefined,
                deliveryManifestNumber: undefined,
                ...(ord.preManifestStatus ? { status: ord.preManifestStatus } : {}),
                ...(ord.preManifestDeliveryStatus ? { deliveryStatus: ord.preManifestDeliveryStatus } : {}),
              }
            : ord
        );
      }
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'manifests_cleared', 'true');
      } catch {}
      logCleanup('EXPEDICAO', `Limpeza de sistema: exclusão de ${count} romaneios de entrega e status de expedição.`);
    }

    // 7. Fornecedores
    if (options.suppliers) {
      const count = state.suppliers ? state.suppliers.length : 0;
      result.cleared.suppliers = count;
      state.suppliers = [];
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'suppliers_cleared', 'true');
      } catch {}
      logCleanup('CADASTROS', `Limpeza de sistema: exclusão de ${count} fornecedores cadastrados.`);
    }

    // 8. Ordens de Produção
    if (options.productionOrders) {
      const count = state.productionOrders ? state.productionOrders.length : 0;
      result.cleared.productionOrders = count;
      state.productionOrders = [];
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'production_cleared', 'true');
      } catch {}
      logCleanup('PRODUCAO', `Limpeza de sistema: exclusão de ${count} ordens de produção.`);
    }

    // 9. Rotas de Entrega
    if (options.deliveryRoutes) {
      const count = state.deliveryRoutes ? state.deliveryRoutes.length : 0;
      result.cleared.deliveryRoutes = count;
      state.deliveryRoutes = [];
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'routes_cleared', 'true');
      } catch {}
      logCleanup('EXPEDICAO', `Limpeza de sistema: exclusão de ${count} rotas de entrega.`);
    }

    // 10. Motoristas
    if (options.deliveryDrivers) {
      const count = state.deliveryDrivers ? state.deliveryDrivers.length : 0;
      result.cleared.deliveryDrivers = count;
      state.deliveryDrivers = [];
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'drivers_cleared', 'true');
        localStorage.setItem(DB_KEY_PREFIX + 'fleet_examples_v2', 'true');
      } catch {}
      logCleanup('EXPEDICAO', `Limpeza de sistema: exclusão de ${count} motoristas cadastrados.`);
    }

    // 11. Veículos
    if (options.deliveryVehicles) {
      const count = state.deliveryVehicles ? state.deliveryVehicles.length : 0;
      result.cleared.deliveryVehicles = count;
      state.deliveryVehicles = [];
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'vehicles_cleared', 'true');
        localStorage.setItem(DB_KEY_PREFIX + 'fleet_examples_v2', 'true');
      } catch {}
      logCleanup('EXPEDICAO', `Limpeza de sistema: exclusão de ${count} veículos da frota.`);
    }

    // 12. Praças Comerciais
    if (options.marketAreas) {
      const count = state.marketAreas ? state.marketAreas.length : 0;
      result.cleared.marketAreas = count;
      state.marketAreas = [];
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'market_areas_cleared', 'true');
      } catch {}
      logCleanup('CADASTROS', `Limpeza de sistema: exclusão de ${count} praças comerciais.`);
    }

    // 13. Bairros
    if (options.neighborhoods) {
      const count = state.neighborhoods ? state.neighborhoods.length : 0;
      result.cleared.neighborhoods = count;
      state.neighborhoods = [];
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'neighborhoods_cleared', 'true');
      } catch {}
      logCleanup('CADASTROS', `Limpeza de sistema: exclusão de ${count} bairros cadastrados.`);
    }

    // 14. Cidades
    if (options.cities) {
      const count = state.cities ? state.cities.length : 0;
      result.cleared.cities = count;
      state.cities = [];
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'cities_cleared', 'true');
      } catch {}
      logCleanup('CADASTROS', `Limpeza de sistema: exclusão de ${count} cidades cadastradas.`);
    }

    // 15. Fluxo de Caixa (Títulos a Receber / Recebimentos e Saldos de Contas Financeiras)
    if (options.cashFlow) {
      const count = state.accountsReceivable ? state.accountsReceivable.length : 0;
      result.cleared.cashFlow = count;
      state.accountsReceivable = [];
      if (state.financialAccounts && state.financialAccounts.length > 0) {
        state.financialAccounts = state.financialAccounts.map((acc) => ({
          ...acc,
          initialBalance: 0,
          currentBalance: 0,
        }));
      }
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'receivables_cleared', 'true');
        localStorage.setItem(DB_KEY_PREFIX + 'cashflow_cleared', 'true');
      } catch {}
      logCleanup('FINANCEIRO', `Limpeza de sistema: zeramento do fluxo de caixa (${count} títulos a receber e saldos das contas).`);
    }

    // 16. Contas a Pagar
    if (options.accountsPayable) {
      const count = state.accountsPayable ? state.accountsPayable.length : 0;
      result.cleared.accountsPayable = count;
      state.accountsPayable = [];
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'payables_cleared', 'true');
      } catch {}
      logCleanup('FINANCEIRO', `Limpeza de sistema: exclusão de ${count} títulos de contas a pagar.`);
    }

    // 17. Controle de Caixa PDV
    if (options.posCashControl) {
      const count = state.cashRegisters ? state.cashRegisters.length : 0;
      result.cleared.posCashControl = count;
      state.cashRegisters = [];
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'cash_registers_cleared', 'true');
      } catch {}
      logCleanup('FINANCEIRO', `Limpeza de sistema: exclusão de ${count} registros de controle de caixa PDV.`);
    }

    // 18. Logs de Auditoria (Executado por último para zerar todo o histórico sem recriar logs)
    if (options.auditLogs) {
      const count = state.auditLogs ? state.auditLogs.length : 0;
      result.cleared.auditLogs = count;
      state.auditLogs = [];
      state.auditLogsClearedAt = new Date().toISOString();
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'audit_logs_cleared', 'true');
      } catch {}
    }

    this.persist();
    return result;
  }

  public static exportDatabaseJSON(): string {
    return JSON.stringify(this.getState(), null, 2);
  }

  public static normalizeUsersList(users: User[]): { users: User[]; changed: boolean } {
    let anyChanged = false;
    const normalized = users.map((u) => {
      let updated = false;
      const { password: legacyPassword, ...userWithoutPassword } = u;
      if (legacyPassword !== undefined || 'password' in u) {
        updated = true;
      }

      const isMasterRecord =
        u.id === 'usr-admin' ||
        (u.login || '').trim().toLowerCase() === 'admin' ||
        (u.email || '').trim().toLowerCase() === 'romeujr.suporte@gmail.com';
      if (isMasterRecord && (!userWithoutPassword.email || !userWithoutPassword.email.includes('@'))) {
        userWithoutPassword.email = 'romeujr.suporte@gmail.com';
        updated = true;
      }

      const role = u.role || 'balconista';
      const rawPerms = (u.permissions || {}) as Partial<UserPermissions>;
      const finDefaults = DEFAULT_ROLE_FINANCIAL_PERMISSIONS[role] || DEFAULT_ROLE_FINANCIAL_PERMISSIONS.balconista;
      const menuDefaults = DEFAULT_ROLE_MENU_SECTIONS[role] || DEFAULT_ROLE_MENU_SECTIONS.balconista;
      const subItemDefaults = DEFAULT_ROLE_SUB_ITEMS[role] || DEFAULT_ROLE_SUB_ITEMS.balconista;

      let allowedMenuSections =
        rawPerms.allowedMenuSections ? [...rawPerms.allowedMenuSections] : (u.login === 'admin' ? undefined : [...menuDefaults]);
      let allowedSubs = rawPerms.allowedSubItems ? [...rawPerms.allowedSubItems] : (u.login === 'admin' ? undefined : [...subItemDefaults]);

      if (role === 'balconista' && allowedSubs) {
        if (allowedSubs.includes('dashboard')) {
          allowedSubs = allowedSubs.filter((item) => item !== 'dashboard');
          updated = true;
        }
        if (!allowedSubs.includes('pos')) {
          allowedSubs.unshift('pos');
          updated = true;
        }
      }

      // Garantia de segurança: usuários não-admin nunca possuem acesso a Menus do Sistema ou Limpeza de Dados
      if (role !== 'admin' && allowedSubs) {
        const hadRestrictedSubs =
          allowedSubs.includes('settings_menus') ||
          allowedSubs.includes('settings_cleanup') ||
          allowedSubs.includes('settings_supabase');
        if (hadRestrictedSubs) {
          allowedSubs = allowedSubs.filter(
            (item) => item !== 'settings_menus' && item !== 'settings_cleanup' && item !== 'settings_supabase'
          );
          updated = true;
        }
      }

      // Migração única para liberar o menu Configurações (sem Menus do Sistema / Limpeza de Dados) ao Gerente Geral
      let gerenteSettingsMigrated = rawPerms.gerenteSettingsMigrated;
      if (role === 'gerente' && !gerenteSettingsMigrated) {
        if (allowedMenuSections && !allowedMenuSections.includes('configuracoes')) {
          allowedMenuSections = [...allowedMenuSections, 'configuracoes'];
        }
        if (allowedSubs) {
          if (!allowedSubs.includes('settings')) {
            allowedSubs = [...allowedSubs, 'settings'];
          }
          if (!allowedSubs.includes('settings_preferences')) {
            allowedSubs = [...allowedSubs, 'settings_preferences'];
          }
          if (!allowedSubs.includes('settings_printer')) {
            allowedSubs = [...allowedSubs, 'settings_printer'];
          }
        }
        gerenteSettingsMigrated = true;
        updated = true;
      }

      // Migração única para liberar o submódulo Financeiro > Vale aos usuários com acesso ao Financeiro / Contas a Receber
      let customerVouchersMigrated = rawPerms.customerVouchersMigrated;
      if (!customerVouchersMigrated) {
        if (
          allowedSubs &&
          (allowedSubs.includes('accounts_receivable') || allowedSubs.includes('cash_flow')) &&
          !allowedSubs.includes('customer_vouchers')
        ) {
          allowedSubs = [...allowedSubs, 'customer_vouchers'];
          updated = true;
        }
        customerVouchersMigrated = true;
      }

      const isBalconista = role === 'balconista';

      const perms: UserPermissions = {
        canViewCosts: rawPerms.canViewCosts ?? (role === 'admin' || role === 'gerente' || role === 'financeiro'),
        canEditProducts: rawPerms.canEditProducts ?? (role === 'admin' || role === 'gerente'),
        canDeleteRecords: rawPerms.canDeleteRecords ?? (role === 'admin'),
        canCancelSales: rawPerms.canCancelSales ?? (role !== 'vendedor_externo'),
        canAuthorizeDiscount: rawPerms.canAuthorizeDiscount ?? (role === 'admin' || role === 'gerente' || role === 'financeiro'),
        maxDiscountPercent: rawPerms.maxDiscountPercent ?? (role === 'admin' ? 30 : role === 'gerente' ? 20 : role === 'financeiro' ? 15 : 10),
        canAccessFinancial: rawPerms.canAccessFinancial ?? (role === 'admin' || role === 'gerente' || role === 'financeiro'),
        canAccessProduction: rawPerms.canAccessProduction ?? (role === 'admin' || role === 'gerente'),
        canAccessPurchases: rawPerms.canAccessPurchases ?? (role === 'admin' || role === 'gerente' || role === 'financeiro'),
        canManageUsers: rawPerms.canManageUsers ?? (role === 'admin'),
        canAdjustStock: rawPerms.canAdjustStock ?? (role === 'admin' || role === 'gerente'),
        canCloseCashRegister: rawPerms.canCloseCashRegister ?? (role !== 'vendedor_externo'),
        ...rawPerms,
        canViewGrossProfit: isBalconista ? false : (
          rawPerms.canViewGrossProfit !== undefined
            ? rawPerms.canViewGrossProfit
            : finDefaults.canViewGrossProfit
        ),
        canViewNetProfit: isBalconista ? false : (
          rawPerms.canViewNetProfit !== undefined
            ? rawPerms.canViewNetProfit
            : finDefaults.canViewNetProfit
        ),
        canViewTotalRevenue: isBalconista ? false : (
          rawPerms.canViewTotalRevenue !== undefined
            ? rawPerms.canViewTotalRevenue
            : finDefaults.canViewTotalRevenue
        ),
        canViewProfitMargin: isBalconista ? false : (
          rawPerms.canViewProfitMargin !== undefined
            ? rawPerms.canViewProfitMargin
            : finDefaults.canViewProfitMargin
        ),
        canViewProductCosts: isBalconista ? false : (
          rawPerms.canViewProductCosts !== undefined
            ? rawPerms.canViewProductCosts
            : (rawPerms.canViewCosts ?? finDefaults.canViewProductCosts)
        ),
        canViewCashBalances: isBalconista ? false : (
          rawPerms.canViewCashBalances !== undefined
            ? rawPerms.canViewCashBalances
            : finDefaults.canViewCashBalances
        ),
        allowedMenuSections,
        allowedSubItems: allowedSubs,
        ...(gerenteSettingsMigrated ? { gerenteSettingsMigrated: true } : {}),
        ...(customerVouchersMigrated ? { customerVouchersMigrated: true } : {}),
      };

      if (
        rawPerms.canViewGrossProfit === undefined ||
        rawPerms.canViewNetProfit === undefined ||
        (!rawPerms.allowedMenuSections && u.login !== 'admin') ||
        (isBalconista && rawPerms.allowedSubItems?.includes('dashboard'))
      ) {
        updated = true;
      }

      if (updated) {
        anyChanged = true;
        return {
          ...userWithoutPassword,
          permissions: perms,
        };
      }
      return userWithoutPassword;
    });

    return { users: normalized, changed: anyChanged };
  }

  public static importDatabaseJSON(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString) as DatabaseState;
      if (!parsed.companies || !parsed.products || !parsed.users) {
        throw new Error('Estrutura de dados inválida');
      }
      const normalized = this.normalizeUsersList(parsed.users);
      this.state = {
        ...parsed,
        users: normalized.users,
      };
      this.persist();
      return true;
    } catch (e) {
      console.error('Falha ao restaurar banco:', e);
      return false;
    }
  }

  public static getLastRemoteSyncTime(): string | null {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        return localStorage.getItem(DB_KEY_PREFIX + 'last_remote_sync');
      }
      return null;
    } catch {
      return null;
    }
  }

  public static setLastRemoteSyncTime(timeIso: string): void {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.setItem(DB_KEY_PREFIX + 'last_remote_sync', timeIso);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Aplica um estado remoto diretamente recebido do Firebase Firestore sem disparar onPersist
   * (evitando loop recursivo de sincronização).
   */
  public static applyRemoteState(remoteState: DatabaseState, remoteSyncTime?: string): boolean {
    try {
      if (!remoteState || !Array.isArray(remoteState.companies) || !Array.isArray(remoteState.products)) {
        return false;
      }
      const normalized = Array.isArray(remoteState.users)
        ? this.normalizeUsersList(remoteState.users)
        : { users: [], changed: false };
      this.state = {
        ...remoteState,
        users: normalized.users,
      };
      this.writeStateToLocalStorage();
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && remoteSyncTime) {
        try {
          localStorage.setItem(DB_KEY_PREFIX + 'last_remote_sync', remoteSyncTime);
        } catch {
          // ignore
        }
      }
      this.notify();
      return true;
    } catch (e) {
      console.error('Falha ao aplicar estado remoto do Firebase:', e);
      return false;
    }
  }

  /**
   * Converte de forma idempotente quaisquer dados residuais de demonstração do Sudeste/Sul (SP, Curitiba, etc.)
   * para a operação regional da Bahia (Matriz em Feira de Santana, Filial em Alagoinhas e raio de 150km).
   * Também é invocada após reconciliação remota do Firestore para impedir que registros antigos da nuvem retornem.
   */
  private static applyBahiaRegionalMigration(
    targetState: DatabaseState,
    stampUpdatedAt: boolean = false,
    isCleanStart: boolean = false
  ): boolean {
    if (!targetState) return false;
    let changed = false;
    const nowIso = new Date().toISOString();

    // Garante Bahia como primeiro estado da lista
    if (targetState.states && targetState.states.length > 0 && targetState.states[0]?.uf !== 'BA') {
      const baFirst = targetState.states.find((s) => s.uf === 'BA');
      if (baFirst) {
        targetState.states = [baFirst, ...targetState.states.filter((s) => s.uf !== 'BA')];
        changed = true;
      }
    }

    if (isCleanStart) {
      return changed;
    }

    const legacyCitiesSet = new Set([
      'são paulo',
      'sao paulo',
      'guarulhos',
      'campinas',
      'santo andré',
      'santo andre',
      'são bernardo do campo',
      'sao bernardo do campo',
      'sao bernardo',
      'osasco',
      'barueri',
      'jundiaí',
      'jundiai',
      'sorocaba',
      'ribeirão preto',
      'ribeirao preto',
      'santos',
      'curitiba',
      'florianópolis',
      'florianopolis',
      'joinville',
      'belo horizonte',
      'rio de janeiro',
    ]);
    const isLegacyCity = (city?: string) => !!city && legacyCitiesSet.has(city.trim().toLowerCase());
    const isLegacyState = (uf?: string) => !!uf && ['SP', 'PR', 'SC', 'RJ', 'MG', 'ES'].includes(uf.trim().toUpperCase());
    const isLegacyRouteText = (txt?: string) =>
      !!txt &&
      /zona norte|zona sul|zona leste|zona oeste|centro expandido|interior\s*&?\s*campinas|grande sp|\babc\b|paulista|santana|pinheiros|moema|vila mariana|itaim bibi|cumbica|são paulo|guarulhos|campinas|osasco|santo andré|curitiba/i.test(
        txt
      );
    const legacyCustomerNames = new Set([
      'Supermercado Vila Bela Ltda',
      'Condomínio Edifício Mirante do Vale',
      'Lava Rápido Brilho Estelar',
      'Auto Posto & Conveniência Estrela do Norte',
      'Restaurante & Churrascaria Fogão Gaúcho',
      'Supermercado Nova Era Ltda',
      'Comercial Distribuição Paulista Eireli',
    ]);
    const isLegacyCustomerName = (name?: string) =>
      !!name &&
      (legacyCustomerNames.has(name.trim()) ||
        /vila bela|mirante do vale|brilho estelar|estrela do norte|fogão gaúcho|paulista/i.test(name));
    const isLegacyNeighborhoodName = (name?: string) =>
      !!name &&
      /^(santana|tucuruvi|vila guilherme|moema|pinheiros|vila mariana|itaim bibi|cumbica|sé|tatuapé|paulista|berrini|parque novo mundo)$/i.test(
        name.trim()
      );

    const routeDefaultsById = new Map(DEFAULT_DELIVERY_ROUTES.map((r) => [r.id, r]));

    // 1. Empresas exemplo legadas (Matriz SP -> Feira de Santana/BA, Filial Curitiba/SP -> Alagoinhas/BA)
    if (targetState.companies && targetState.companies.length > 0) {
      targetState.companies = targetState.companies.map((comp) => {
        const isLegacyMatrizSeed =
          comp.id === 'comp-matriz' &&
          (comp.tradeName?.includes('Matriz SP') ||
            (comp.cnpjCpf === '12.345.678/0001-90' &&
              (isLegacyCity(comp.address?.city) || comp.address?.state === 'SP')));

        if (isLegacyMatrizSeed) {
          changed = true;
          return {
            ...comp,
            tradeName: 'Imperial Limpeza - Matriz Feira de Santana',
            phone: '(75) 3600-7890',
            address: {
              street: 'Av. Eduardo Fróes da Mota',
              number: '1500',
              neighborhood: 'CIS - Distrito Industrial do Subaé',
              city: 'Feira de Santana',
              state: 'BA',
              zipCode: '44000-000',
            },
            ...(stampUpdatedAt ? { updatedAt: nowIso } : {}),
          } as Company;
        }

        const isLegacyFilialSeed =
          comp.id === 'comp-filial' &&
          (comp.tradeName?.includes('Curitiba') ||
            comp.tradeName?.includes('Filial SP') ||
            (comp.cnpjCpf === '12.345.678/0002-71' &&
              (isLegacyCity(comp.address?.city) ||
                comp.address?.state === 'PR' ||
                comp.address?.state === 'SP')));

        if (isLegacyFilialSeed) {
          changed = true;
          return {
            ...comp,
            name: 'Química & Limpeza Imperial - Filial Alagoinhas Ltda',
            tradeName: 'Imperial Limpeza - Filial Alagoinhas',
            phone: '(75) 3422-5566',
            email: 'alagoinhas@imperiallimpeza.com.br',
            address: {
              street: 'Av. Juracy Magalhães',
              number: '820',
              neighborhood: 'Alagoinhas Velha',
              city: 'Alagoinhas',
              state: 'BA',
              zipCode: '48000-000',
            },
            ...(stampUpdatedAt ? { updatedAt: nowIso } : {}),
          } as Company;
        }
        return comp;
      });
    }

    // 2. Rotas de entrega -> Bahia
    if (targetState.deliveryRoutes && targetState.deliveryRoutes.length > 0) {
      targetState.deliveryRoutes = targetState.deliveryRoutes.map((route) => {
        const baRoute = routeDefaultsById.get(route.id);
        const hasLegacy =
          isLegacyRouteText(route.name) ||
          isLegacyRouteText(route.description) ||
          isLegacyRouteText(route.notes) ||
          route.cities?.some((c) => isLegacyCity(c)) ||
          route.neighborhoods?.some((n) => isLegacyNeighborhoodName(n)) ||
          route.marketAreas?.some((m) => isLegacyRouteText(m));

        if (baRoute && hasLegacy) {
          changed = true;
          return {
            ...route,
            name: baRoute.name,
            description: baRoute.description,
            cities: [...baRoute.cities],
            neighborhoods: [...baRoute.neighborhoods],
            marketAreas: [...baRoute.marketAreas],
            notes: baRoute.notes,
            minimumOrderValue:
              route.minimumOrderValue && route.minimumOrderValue > 0
                ? route.minimumOrderValue
                : baRoute.minimumOrderValue,
            updatedAt: nowIso,
          };
        }
        if (hasLegacy) {
          changed = true;
          return {
            ...route,
            name: isLegacyRouteText(route.name)
              ? route.name
                  .replace(/Zona Norte\s*&?\s*Santana/gi, 'Feira de Santana (Sede & Entorno)')
                  .replace(/Centro Expandido/gi, 'Recôncavo Baiano')
                  .replace(/Zona Sul\s*\/?\s*ABC/gi, 'Litoral Norte & Alagoinhas')
                  .replace(/Interior\s*&?\s*Campinas/gi, 'Sisal & Portal Norte')
                  .replace(/São Paulo/gi, 'Feira de Santana')
                  .replace(/Campinas/gi, 'Serrinha')
                  .replace(/Guarulhos/gi, 'Alagoinhas')
              : route.name,
            cities: (route.cities || [])
              .map((c) => (isLegacyCity(c) ? 'Feira de Santana' : c))
              .filter((v, i, arr) => arr.indexOf(v) === i),
            neighborhoods: (route.neighborhoods || []).filter((n) => !isLegacyNeighborhoodName(n)),
            marketAreas: (route.marketAreas || [])
              .map((m) => (isLegacyRouteText(m) ? 'Feira de Santana - Sede' : m))
              .filter((v, i, arr) => arr.indexOf(v) === i),
            updatedAt: nowIso,
          };
        }
        return route;
      });
    }

    // 3. Praças, Cidades e Bairros -> Bahia
    if (
      targetState.marketAreas?.some(
        (m) =>
          isLegacyRouteText(m.name) ||
          m.cities?.some((c) => isLegacyCity(c)) ||
          isLegacyRouteText(m.defaultRouteName)
      )
    ) {
      const legacyIds = new Set(['pra-01', 'pra-02', 'pra-03', 'pra-04', 'pra-05', 'pra-06']);
      const customAreas = (targetState.marketAreas || []).filter(
        (m) =>
          !legacyIds.has(m.id) &&
          !isLegacyRouteText(m.name) &&
          !m.cities?.some((c) => isLegacyCity(c))
      );
      targetState.marketAreas = [
        ...DEFAULT_MARKET_AREAS.map((m) => ({ ...m, ...(stampUpdatedAt ? { updatedAt: nowIso } : {}) })),
        ...customAreas,
      ];
      changed = true;
    }

    if (
      targetState.cities?.some(
        (c) => isLegacyState(c.stateUf) || isLegacyCity(c.name) || isLegacyRouteText(c.defaultRouteName)
      )
    ) {
      const legacyCityIds = new Set(DEFAULT_CITIES.map((c) => c.id));
      const customCities = (targetState.cities || []).filter(
        (c) => !legacyCityIds.has(c.id) && !isLegacyState(c.stateUf) && !isLegacyCity(c.name)
      );
      targetState.cities = [
        ...DEFAULT_CITIES.map((c) => ({ ...c, ...(stampUpdatedAt ? { updatedAt: nowIso } : {}) })),
        ...customCities,
      ];
      changed = true;
    } else if (
      typeof window !== 'undefined' &&
      typeof localStorage !== 'undefined' &&
      !localStorage.getItem(DB_KEY_PREFIX + 'cities_cleared') &&
      localStorage.getItem(DB_KEY_PREFIX + 'bahia_cities_200km_v2') !== 'true'
    ) {
      const currentCities = targetState.cities || [];
      const existingIds = new Set(currentCities.map((c) => c.id));
      const existingKeys = new Set(
        currentCities.map((c) => `${c.name.trim().toLowerCase()}|${c.stateUf.trim().toUpperCase()}`)
      );
      const missingBaCities = DEFAULT_CITIES.filter(
        (d) =>
          !existingIds.has(d.id) &&
          !existingKeys.has(`${d.name.trim().toLowerCase()}|${d.stateUf.trim().toUpperCase()}`)
      ).map((c) => ({ ...c, ...(stampUpdatedAt ? { updatedAt: nowIso } : {}) }));
      if (missingBaCities.length > 0) {
        targetState.cities = [...currentCities, ...missingBaCities].sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR')
        );
        changed = true;
      }
      try {
        localStorage.setItem(DB_KEY_PREFIX + 'bahia_cities_200km_v2', 'true');
      } catch {}
    }

    if (
      targetState.neighborhoods?.some(
        (n) =>
          isLegacyState(n.stateUf) ||
          isLegacyCity(n.cityName) ||
          isLegacyNeighborhoodName(n.name) ||
          isLegacyRouteText(n.defaultRouteName)
      )
    ) {
      const legacyNbIds = new Set(DEFAULT_NEIGHBORHOODS.map((n) => n.id));
      const customNb = (targetState.neighborhoods || []).filter(
        (n) =>
          !legacyNbIds.has(n.id) &&
          !isLegacyState(n.stateUf) &&
          !isLegacyCity(n.cityName) &&
          !isLegacyNeighborhoodName(n.name)
      );
      targetState.neighborhoods = [
        ...DEFAULT_NEIGHBORHOODS.map((n) => ({ ...n, ...(stampUpdatedAt ? { updatedAt: nowIso } : {}) })),
        ...customNb,
      ];
      changed = true;
    }

    // 4. Motoristas, Veículos e Usuários -> Bahia (DDD 75)
    const driverDefaultsById = new Map(DEFAULT_DELIVERY_DRIVERS.map((d) => [d.id, d]));
    if (targetState.deliveryDrivers) {
      targetState.deliveryDrivers = targetState.deliveryDrivers.map((d) => {
        const def = driverDefaultsById.get(d.id);
        const needsFix =
          d.phone?.startsWith('(11)') ||
          d.phone?.startsWith('(19)') ||
          isLegacyRouteText(d.notes) ||
          d.notes?.includes('Detran-SP');
        if (def && needsFix) {
          changed = true;
          return { ...d, phone: def.phone, notes: def.notes, updatedAt: nowIso };
        }
        if (needsFix) {
          changed = true;
          return {
            ...d,
            phone: d.phone ? d.phone.replace(/^\((11|19)\)/, '(75)') : '(75) 98765-4321',
            notes: d.notes ? d.notes.replace(/Detran-SP/gi, 'Detran-BA') : d.notes,
            updatedAt: nowIso,
          };
        }
        return d;
      });
    }

    const vehicleDefaultsById = new Map(DEFAULT_DELIVERY_VEHICLES.map((v) => [v.id, v]));
    if (targetState.deliveryVehicles) {
      targetState.deliveryVehicles = targetState.deliveryVehicles.map((v) => {
        const def = vehicleDefaultsById.get(v.id);
        const needsFix =
          v.plate === 'SPX-4J90' ||
          isLegacyRouteText(v.notes) ||
          v.notes?.includes('Detran-SP');
        if (def && needsFix) {
          changed = true;
          return { ...v, plate: def.plate, notes: def.notes, updatedAt: nowIso };
        }
        return v;
      });
    }

    if (targetState.users) {
      targetState.users = targetState.users.map((u) => {
        if (u.phone && /^\((11|19|41)\)/.test(u.phone)) {
          changed = true;
          return {
            ...u,
            phone: u.phone.replace(/^\((11|19|41)\)/, '(75)'),
            updatedAt: nowIso,
          };
        }
        return u;
      });
    }

    // 5. Clientes e Fornecedores -> Bahia (Feira de Santana / Alagoinhas / raio de 150km)
    const baCustomersMap: Record<string, Partial<Customer>> = {
      'cli-001': {
        name: 'Supermercado Subaé Ltda',
        tradeName: 'Super Subaé',
        phone: '(75) 3622-2200',
        whatsapp: '(75) 99711-2233',
        email: 'compras@supersubae.com.br',
        zipCode: '44001-200',
        street: 'Rua Conselheiro Franco',
        number: '450',
        neighborhood: 'Kalilândia',
        city: 'Feira de Santana',
        state: 'BA',
        marketArea: 'Feira de Santana - Sede',
        sellerName: 'Carlos Silva',
        deliveryRouteId: 'rot-01',
        deliveryRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)',
      },
      'cli-002': {
        name: 'Condomínio Residencial Portal de Alagoinhas',
        tradeName: 'Condomínio Portal Alagoinhas',
        phone: '(75) 3421-8800',
        whatsapp: '(75) 99122-3344',
        email: 'administracao@portalalagoinhas.com.br',
        zipCode: '48030-000',
        street: 'Av. Juracy Magalhães',
        number: '1800',
        neighborhood: 'Alagoinhas Velha',
        city: 'Alagoinhas',
        state: 'BA',
        marketArea: 'Litoral Norte & Alagoinhas',
        sellerName: 'Roberto Vendas',
        deliveryRouteId: 'rot-03',
        deliveryRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)',
      },
      'cli-003': {
        name: 'Lava Rápido & Auto Posto Jacuípe',
        tradeName: 'Auto Care Jacuípe',
        phone: '(75) 3243-6543',
        whatsapp: '(75) 99344-5566',
        email: 'contato@postojacuipe.com.br',
        zipCode: '44245-000',
        street: 'Av. Sérgio Carneiro',
        number: '210',
        neighborhood: 'Centro',
        city: 'Conceição do Jacuípe',
        state: 'BA',
        marketArea: 'Feira de Santana - Sede',
        sellerName: 'Bruno Lima',
        deliveryRouteId: 'rot-01',
        deliveryRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)',
      },
      'cli-004': {
        phone: '(75) 3625-1122',
        whatsapp: '(75) 98765-1122',
        zipCode: '44077-000',
        street: 'Av. Getúlio Vargas',
        number: '890',
        neighborhood: 'Santa Mônica',
        city: 'Feira de Santana',
        state: 'BA',
        marketArea: 'Feira de Santana - Sede',
        sellerName: 'Carlos Silva',
        deliveryRouteId: 'rot-01',
        deliveryRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)',
      },
    };

    const clientsCleared =
      typeof window !== 'undefined' &&
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(DB_KEY_PREFIX + 'clients_cleared') === 'true';

    if (targetState.customers) {
      targetState.customers = targetState.customers.map((c) => {
        const patch = baCustomersMap[c.id];
        const hasLegacyCust =
          isLegacyState(c.state) ||
          isLegacyCity(c.city) ||
          isLegacyRouteText(c.deliveryRouteName) ||
          isLegacyRouteText(c.marketArea) ||
          isLegacyCustomerName(c.name) ||
          !!c.phone?.match(/^\((11|19|41)\)/) ||
          !!c.whatsapp?.match(/^\((11|19|41)\)/);

        if (patch && (hasLegacyCust || c.state !== 'BA')) {
          changed = true;
          return { ...c, ...patch, ...(stampUpdatedAt ? { updatedAt: nowIso } : {}) };
        }
        if (hasLegacyCust) {
          changed = true;
          const mappedRoute =
            c.deliveryRouteId && routeDefaultsById.get(c.deliveryRouteId)
              ? routeDefaultsById.get(c.deliveryRouteId)!
              : routeDefaultsById.get('rot-01')!;
          const targetCity =
            mappedRoute.id === 'rot-03'
              ? 'Alagoinhas'
              : mappedRoute.id === 'rot-02'
              ? 'Santo Antônio de Jesus'
              : mappedRoute.id === 'rot-04'
              ? 'Serrinha'
              : 'Feira de Santana';
          return {
            ...c,
            phone: c.phone ? c.phone.replace(/^\((11|19|41)\)/, '(75)') : c.phone,
            whatsapp: c.whatsapp ? c.whatsapp.replace(/^\((11|19|41)\)/, '(75)') : c.whatsapp,
            city: isLegacyCity(c.city) || isLegacyState(c.state) ? targetCity : c.city,
            state: isLegacyState(c.state) ? 'BA' : c.state,
            neighborhood: isLegacyNeighborhoodName(c.neighborhood) ? 'Centro' : c.neighborhood,
            zipCode: c.zipCode && /^(0|1|8)/.test(c.zipCode) ? (targetCity === 'Alagoinhas' ? '48000-000' : '44001-000') : c.zipCode,
            marketArea: isLegacyRouteText(c.marketArea)
              ? mappedRoute.marketAreas?.[0] || 'Feira de Santana - Sede'
              : c.marketArea,
            deliveryRouteId: mappedRoute.id,
            deliveryRouteName: mappedRoute.name,
            ...(stampUpdatedAt ? { updatedAt: nowIso } : {}),
          };
        }
        return c;
      });

      if (!clientsCleared) {
        const extraBaCustomers: Customer[] = [
          {
            id: 'cli-005',
            code: 'CLI-005',
            name: 'Mercado Recôncavo Sul Ltda',
            tradeName: 'Mercado Recôncavo',
            type: 'PJ',
            cpfCnpj: '56.789.123/0001-44',
            phone: '(75) 3631-4100',
            whatsapp: '(75) 99811-4100',
            email: 'compras@mercadoreconcavo.com.br',
            zipCode: '44430-000',
            street: 'Av. Ursicino Pinto de Queiroz',
            number: '310',
            neighborhood: 'Centro',
            city: 'Santo Antônio de Jesus',
            state: 'BA',
            marketArea: 'Recôncavo Baiano',
            sellerName: 'Mariana Oliveira',
            deliveryRouteId: 'rot-02',
            deliveryRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)',
            creditLimit: 9000.0,
            preferredPaymentMethod: 'Boleto 30 dias',
            status: 'ativo',
            notes: 'Atendimento semanal na rota do Recôncavo (112km de Feira de Santana)',
          },
          {
            id: 'cli-006',
            code: 'CLI-006',
            name: 'Atacadão Portal do Sisal Ltda',
            tradeName: 'Atacadão do Sisal',
            type: 'PJ',
            cpfCnpj: '67.890.234/0001-55',
            phone: '(75) 3261-4400',
            whatsapp: '(75) 99220-4400',
            email: 'pedidos@atacadaosisal.com.br',
            zipCode: '48700-000',
            street: 'Av. Manoel Novais',
            number: '520',
            neighborhood: 'Cidade Nova',
            city: 'Serrinha',
            state: 'BA',
            marketArea: 'Portal do Sertão & Sisal',
            sellerName: 'Bruno Lima',
            deliveryRouteId: 'rot-04',
            deliveryRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)',
            creditLimit: 12000.0,
            preferredPaymentMethod: 'Boleto 28 dias',
            status: 'ativo',
            notes: 'Cliente atacadista em Serrinha (72km de Feira de Santana)',
          },
          {
            id: 'cli-007',
            code: 'CLI-007',
            name: 'Restaurante & Pousada Cachoeira Histórica',
            tradeName: 'Pousada Cachoeira',
            type: 'PJ',
            cpfCnpj: '78.901.345/0001-66',
            phone: '(75) 3425-1980',
            whatsapp: '(75) 98845-1980',
            email: 'suprimentos@pousadacachoeira.com.br',
            zipCode: '44300-000',
            street: 'Praça da Aclamação',
            number: '145',
            neighborhood: 'Centro',
            city: 'Cachoeira',
            state: 'BA',
            marketArea: 'Recôncavo Baiano',
            sellerName: 'Carlos Silva',
            deliveryRouteId: 'rot-02',
            deliveryRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)',
            creditLimit: 4500.0,
            preferredPaymentMethod: 'Pix',
            status: 'ativo',
            notes: 'Compras quinzenais para hotelaria e restaurante (55km de Feira de Santana)',
          },
          {
            id: 'cli-008',
            code: 'CLI-008',
            name: 'Distribuidora Cruz das Almas Comércio Ltda',
            tradeName: 'Distribuidora Cruzense',
            type: 'PJ',
            cpfCnpj: '89.012.456/0001-77',
            phone: '(75) 3621-3390',
            whatsapp: '(75) 99931-3390',
            email: 'compras@distribuidoracruzense.com.br',
            zipCode: '44380-000',
            street: 'Rua Rui Barbosa',
            number: '610',
            neighborhood: 'Coplan',
            city: 'Cruz das Almas',
            state: 'BA',
            marketArea: 'Recôncavo Baiano',
            sellerName: 'Mariana Oliveira',
            deliveryRouteId: 'rot-02',
            deliveryRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)',
            creditLimit: 7000.0,
            preferredPaymentMethod: 'Boleto 30 dias',
            status: 'ativo',
            notes: 'Atendido na rota do Recôncavo (65km de Feira de Santana)',
          },
        ];
        const existingCustIds = new Set(targetState.customers.map((c) => c.id));
        const newBaCusts = extraBaCustomers.filter((c) => !existingCustIds.has(c.id));
        if (newBaCusts.length > 0) {
          targetState.customers = [...targetState.customers, ...newBaCusts];
          changed = true;
        }
      }
    }

    if (targetState.suppliers) {
      targetState.suppliers = targetState.suppliers.map((sup) => {
        if (
          sup.id === 'for-001' &&
          (isLegacyState(sup.state) || isLegacyCity(sup.city) || sup.name?.includes('Brasil S.A.'))
        ) {
          changed = true;
          return {
            ...sup,
            name: 'Polo Petroquímico Química Bahia S.A.',
            tradeName: 'Química Bahia',
            phone: '(71) 3632-2000',
            whatsapp: '(71) 99123-4567',
            email: 'vendas@quimicabahia.com.br',
            zipCode: '42810-000',
            street: 'Via Atlântica - Polo Industrial',
            number: 'Km 12',
            neighborhood: 'Polo Industrial',
            city: 'Camaçari',
            state: 'BA',
            ...(stampUpdatedAt ? { updatedAt: nowIso } : {}),
          };
        }
        if (
          sup.id === 'for-002' &&
          (isLegacyState(sup.state) || isLegacyCity(sup.city) || sup.name?.includes('PlastFlex') || sup.name?.includes('Paulista'))
        ) {
          changed = true;
          return {
            ...sup,
            name: 'Plásticos & Embalagens Recôncavo Ltda',
            tradeName: 'Embalagens Recôncavo',
            phone: '(75) 3614-8900',
            whatsapp: '(75) 99543-2100',
            email: 'pedidos@embalagensreconcavo.com.br',
            zipCode: '44090-000',
            street: 'Av. Sérgio Carneiro',
            number: '3400',
            neighborhood: 'Tomba',
            city: 'Feira de Santana',
            state: 'BA',
            ...(stampUpdatedAt ? { updatedAt: nowIso } : {}),
          };
        }
        if (
          sup.id === 'for-003' &&
          (isLegacyState(sup.state) || isLegacyCity(sup.city) || sup.state === 'SC')
        ) {
          changed = true;
          return {
            ...sup,
            name: 'Indústria de Artefatos de Piaçava Baiana Ltda',
            tradeName: 'Piaçava do Litoral Norte',
            phone: '(75) 3422-1122',
            whatsapp: '(75) 98877-6655',
            email: 'contato@piacavabaiana.com.br',
            zipCode: '48010-000',
            street: 'Av. Dantas Bião',
            number: '1200',
            neighborhood: 'Centro',
            city: 'Alagoinhas',
            state: 'BA',
            ...(stampUpdatedAt ? { updatedAt: nowIso } : {}),
          };
        }
        if (isLegacyState(sup.state) || isLegacyCity(sup.city)) {
          changed = true;
          return {
            ...sup,
            phone: sup.phone ? sup.phone.replace(/^\((11|19|41|47|48)\)/, '(75)') : sup.phone,
            whatsapp: sup.whatsapp ? sup.whatsapp.replace(/^\((11|19|41|47|48)\)/, '(75)') : sup.whatsapp,
            city: 'Feira de Santana',
            state: 'BA',
            ...(stampUpdatedAt ? { updatedAt: nowIso } : {}),
          };
        }
        return sup;
      });
    }

    // 6. Romaneios existentes com endereços SP/Sudeste -> Bahia
    if (targetState.deliveryManifests) {
      const custById = new Map((targetState.customers || []).map((c) => [c.id, c]));
      targetState.deliveryManifests = targetState.deliveryManifests.map((man) => {
        const updatedRoute = man.routeId ? routeDefaultsById.get(man.routeId) : undefined;
        const routeNeedsUpdate =
          (updatedRoute && man.routeName !== updatedRoute.name) || isLegacyRouteText(man.routeName);
        const hasLegacyOrderAddr = man.orders?.some(
          (o) =>
            isLegacyCity(o.address?.city) ||
            isLegacyState(o.address?.state) ||
            isLegacyCustomerName(o.customerName) ||
            isLegacyRouteText(o.marketArea)
        );
        const hasLegacyPhone = !!man.driverPhone?.match(/^\((11|19|41)\)/);
        const hasLegacyNotes = !!man.notes?.includes('Vila Bela');

        if (routeNeedsUpdate || hasLegacyOrderAddr || hasLegacyPhone || hasLegacyNotes) {
          changed = true;
          return {
            ...man,
            name: man.id === 'rom-001' && !man.name ? 'Entrega Feira Sede & Berimbau' : man.name,
            routeName: updatedRoute
              ? updatedRoute.name
              : isLegacyRouteText(man.routeName)
              ? 'Rota 01 - Feira de Santana (Sede & Entorno)'
              : man.routeName,
            driverPhone: hasLegacyPhone
              ? man.driverPhone!.replace(/^\((11|19|41)\)/, '(75)')
              : man.driverPhone,
            notes: hasLegacyNotes
              ? 'Carga conferida no armazém em Feira de Santana. Entregar prioritariamente o Supermercado Subaé.'
              : man.notes,
            orders: (man.orders || []).map((mo) => {
              const c = custById.get(mo.customerId);
              const needsOrderFix =
                isLegacyCity(mo.address?.city) ||
                isLegacyState(mo.address?.state) ||
                isLegacyCustomerName(mo.customerName) ||
                isLegacyRouteText(mo.marketArea);
              if (needsOrderFix) {
                return {
                  ...mo,
                  customerName: c?.name || (isLegacyCustomerName(mo.customerName) ? 'Supermercado Subaé Ltda' : mo.customerName),
                  customerPhone: c?.phone || mo.customerPhone,
                  address: {
                    street: c?.street || mo.address?.street || 'Av. Getúlio Vargas',
                    number: c?.number || mo.address?.number || 'S/N',
                    neighborhood:
                      c?.neighborhood ||
                      (isLegacyNeighborhoodName(mo.address?.neighborhood) ? 'Centro' : mo.address?.neighborhood) ||
                      'Centro',
                    city:
                      c?.city && !isLegacyCity(c.city)
                        ? c.city
                        : isLegacyCity(mo.address?.city)
                        ? 'Feira de Santana'
                        : mo.address?.city || 'Feira de Santana',
                    state:
                      c?.state && !isLegacyState(c.state)
                        ? c.state
                        : isLegacyState(mo.address?.state)
                        ? 'BA'
                        : mo.address?.state || 'BA',
                    zipCode: c?.zipCode || mo.address?.zipCode || '44001-000',
                  },
                  marketArea:
                    c?.marketArea ||
                    (isLegacyRouteText(mo.marketArea) ? 'Feira de Santana - Sede' : mo.marketArea) ||
                    'Feira de Santana - Sede',
                };
              }
              return mo;
            }),
            updatedAt: nowIso,
          };
        }
        return man;
      });
    }

    // 7. Pedidos de venda & Financeiro com nomes antigos -> Bahia + pedidos regionais prontos para romaneio
    const custNameById = new Map((targetState.customers || []).map((c) => [c.id, c.name]));
    const ordersCleared =
      typeof window !== 'undefined' &&
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(DB_KEY_PREFIX + 'orders_cleared') === 'true';

    if (targetState.orders) {
      targetState.orders = targetState.orders.map((ord) => {
        const newName = ord.customerId ? custNameById.get(ord.customerId) : undefined;
        const needsRename = !!newName && isLegacyCustomerName(ord.customerName);
        const needsManifestIdFix = ord.deliveryManifestId === 'rom-sample-01';
        if (needsRename || needsManifestIdFix) {
          changed = true;
          return {
            ...ord,
            ...(needsRename ? { customerName: newName } : {}),
            ...(needsManifestIdFix ? { deliveryManifestId: 'rom-001' } : {}),
            updatedAt: nowIso,
          };
        }
        return ord;
      });

      if (!ordersCleared) {
        const todayIso = new Date().toISOString().split('T')[0];
        const currentMonthIso = todayIso.slice(0, 7);
        const regionalOrders: Order[] = [
          {
            id: 'ord-ba-alagoinhas-01',
            number: 'PED-2026-0018',
            type: 'venda',
            origin: 'pedidos_venda',
            companyId: 'comp-matriz',
            customerId: 'cli-002',
            customerName: 'Condomínio Residencial Portal de Alagoinhas',
            userId: 'usr-admin',
            userName: 'Roberto Vendas',
            items: [
              {
                id: 'item-ba-1',
                productId: 'prod-desinfetante-5l',
                productCode: 'PA-302',
                description: 'Desinfetante Floral Imperial Profissional 5L',
                unit: 'UN',
                quantity: 40,
                unitPrice: 21.50,
                discountPercent: 0,
                discountValue: 0,
                totalPrice: 860.00,
                unitCost: 9.85,
                locationId: 'loc-comercial',
              },
              {
                id: 'item-ba-2',
                productId: 'prod-detergente-500',
                productCode: 'PA-301',
                description: 'Detergente Líquido Neutro Imperial 500ml',
                unit: 'UN',
                quantity: 130,
                unitPrice: 4.00,
                discountPercent: 0,
                discountValue: 0,
                totalPrice: 520.00,
                unitCost: 1.84,
                locationId: 'loc-comercial',
              },
            ],
            subtotal: 1380.00,
            discountTotal: 0,
            total: 1380.00,
            paymentMethod: 'boleto',
            installmentsCount: 2,
            receivedAmount: 0,
            changeAmount: 0,
            status: 'concluido',
            stockDeducted: true,
            financialGenerated: true,
            createdAt: `${currentMonthIso}-08T10:20:00.000Z`,
            updatedAt: `${currentMonthIso}-08T10:20:00.000Z`,
          },
          {
            id: 'ord-ba-saj-01',
            number: 'PED-2026-0019',
            type: 'venda',
            origin: 'pedidos_venda',
            companyId: 'comp-matriz',
            customerId: 'cli-005',
            customerName: 'Mercado Recôncavo Sul Ltda',
            userId: 'usr-admin',
            userName: 'Mariana Oliveira',
            items: [
              {
                id: 'item-ba-3',
                productId: 'prod-desinfetante-5l',
                productCode: 'PA-302',
                description: 'Desinfetante Floral Imperial Profissional 5L',
                unit: 'UN',
                quantity: 30,
                unitPrice: 22.00,
                discountPercent: 0,
                discountValue: 0,
                totalPrice: 660.00,
                unitCost: 9.85,
                locationId: 'loc-comercial',
              },
              {
                id: 'item-ba-4',
                productId: 'prod-pano-microfibra',
                productCode: 'REV-404',
                description: 'Pano Microfibra Multiuso 40x40cm (Pacote com 5 unid)',
                unit: 'PCT',
                quantity: 14,
                unitPrice: 20.00,
                discountPercent: 0,
                discountValue: 0,
                totalPrice: 280.00,
                unitCost: 9.00,
                locationId: 'loc-comercial',
              },
            ],
            subtotal: 940.00,
            discountTotal: 0,
            total: 940.00,
            paymentMethod: 'boleto',
            installmentsCount: 2,
            receivedAmount: 0,
            changeAmount: 0,
            status: 'concluido',
            stockDeducted: true,
            financialGenerated: true,
            createdAt: `${currentMonthIso}-09T11:10:00.000Z`,
            updatedAt: `${currentMonthIso}-09T11:10:00.000Z`,
          },
          {
            id: 'ord-ba-cachoeira-01',
            number: 'PED-2026-0020',
            type: 'venda',
            origin: 'externa_celular',
            companyId: 'comp-matriz',
            customerId: 'cli-007',
            customerName: 'Restaurante & Pousada Cachoeira Histórica',
            userId: 'usr-vendedor-externo',
            userName: 'Carlos Silva',
            items: [
              {
                id: 'item-ba-5',
                productId: 'prod-desinfetante-5l',
                productCode: 'PA-302',
                description: 'Desinfetante Floral Imperial Profissional 5L',
                unit: 'UN',
                quantity: 20,
                unitPrice: 21.00,
                discountPercent: 0,
                discountValue: 0,
                totalPrice: 420.00,
                unitCost: 9.85,
                locationId: 'loc-comercial',
              },
              {
                id: 'item-ba-6',
                productId: 'prod-vassoura-piacava',
                productCode: 'REV-401',
                description: 'Vassoura de Piaçava Natural Cabo Madeira 1,20m',
                unit: 'UN',
                quantity: 10,
                unitPrice: 20.00,
                discountPercent: 0,
                discountValue: 0,
                totalPrice: 200.00,
                unitCost: 9.20,
                locationId: 'loc-comercial',
              },
            ],
            subtotal: 620.00,
            discountTotal: 0,
            total: 620.00,
            paymentMethod: 'pix',
            installmentsCount: 1,
            receivedAmount: 620.00,
            changeAmount: 0,
            status: 'concluido',
            stockDeducted: true,
            financialGenerated: true,
            createdAt: `${currentMonthIso}-10T15:00:00.000Z`,
            updatedAt: `${currentMonthIso}-10T15:00:00.000Z`,
          },
          {
            id: 'ord-ba-serrinha-01',
            number: 'PED-2026-0021',
            type: 'venda',
            origin: 'pedidos_venda',
            companyId: 'comp-matriz',
            customerId: 'cli-006',
            customerName: 'Atacadão Portal do Sisal Ltda',
            userId: 'usr-vendedor-externo',
            userName: 'Bruno Lima',
            items: [
              {
                id: 'item-ba-7',
                productId: 'prod-detergente-500',
                productCode: 'PA-301',
                description: 'Detergente Líquido Neutro Imperial 500ml',
                unit: 'UN',
                quantity: 250,
                unitPrice: 3.80,
                discountPercent: 0,
                discountValue: 0,
                totalPrice: 950.00,
                unitCost: 1.84,
                locationId: 'loc-comercial',
              },
              {
                id: 'item-ba-8',
                productId: 'prod-desinfetante-5l',
                productCode: 'PA-302',
                description: 'Desinfetante Floral Imperial Profissional 5L',
                unit: 'UN',
                quantity: 35,
                unitPrice: 20.00,
                discountPercent: 0,
                discountValue: 0,
                totalPrice: 700.00,
                unitCost: 9.85,
                locationId: 'loc-comercial',
              },
            ],
            subtotal: 1650.00,
            discountTotal: 0,
            total: 1650.00,
            paymentMethod: 'boleto',
            installmentsCount: 2,
            receivedAmount: 0,
            changeAmount: 0,
            status: 'concluido',
            stockDeducted: true,
            financialGenerated: true,
            createdAt: `${todayIso}T08:40:00.000Z`,
            updatedAt: `${todayIso}T08:40:00.000Z`,
          },
          {
            id: 'ord-ba-cruz-01',
            number: 'PED-2026-0022',
            type: 'venda',
            origin: 'pedidos_venda',
            companyId: 'comp-matriz',
            customerId: 'cli-008',
            customerName: 'Distribuidora Cruz das Almas Comércio Ltda',
            userId: 'usr-admin',
            userName: 'Mariana Oliveira',
            items: [
              {
                id: 'item-ba-9',
                productId: 'prod-desinfetante-5l',
                productCode: 'PA-302',
                description: 'Desinfetante Floral Imperial Profissional 5L',
                unit: 'UN',
                quantity: 20,
                unitPrice: 21.50,
                discountPercent: 0,
                discountValue: 0,
                totalPrice: 430.00,
                unitCost: 9.85,
                locationId: 'loc-comercial',
              },
              {
                id: 'item-ba-10',
                productId: 'prod-rodo-duplo',
                productCode: 'REV-402',
                description: 'Rodo Alumínio Profissional 40cm Dupla Borracha',
                unit: 'UN',
                quantity: 6,
                unitPrice: 25.00,
                discountPercent: 0,
                discountValue: 0,
                totalPrice: 150.00,
                unitCost: 11.40,
                locationId: 'loc-comercial',
              },
            ],
            subtotal: 580.00,
            discountTotal: 0,
            total: 580.00,
            paymentMethod: 'boleto',
            installmentsCount: 1,
            receivedAmount: 0,
            changeAmount: 0,
            status: 'concluido',
            stockDeducted: true,
            financialGenerated: true,
            createdAt: `${todayIso}T09:10:00.000Z`,
            updatedAt: `${todayIso}T09:10:00.000Z`,
          },
        ];
        const existingOrdIds = new Set(targetState.orders.map((o) => o.id));
        const missingBaOrders = regionalOrders.filter((o) => !existingOrdIds.has(o.id));
        if (missingBaOrders.length > 0) {
          targetState.orders = [...missingBaOrders, ...targetState.orders];
          changed = true;
        }
      }
    }

    if (targetState.accountsReceivable) {
      targetState.accountsReceivable = targetState.accountsReceivable.map((ar) => {
        const newName = ar.customerId ? custNameById.get(ar.customerId) : undefined;
        if (newName && isLegacyCustomerName(ar.customerName)) {
          changed = true;
          return { ...ar, customerName: newName, ...(stampUpdatedAt ? { updatedAt: nowIso } : {}) };
        }
        return ar;
      });
    }

    if (targetState.accountsPayable) {
      targetState.accountsPayable = targetState.accountsPayable.map((ap) => {
        if (ap.id === 'pag-001' && ap.supplierName?.includes('Brasil S.A.')) {
          changed = true;
          return {
            ...ap,
            supplierName: 'Polo Petroquímico Química Bahia S.A.',
            ...(stampUpdatedAt ? { updatedAt: nowIso } : {}),
          };
        }
        if (
          (ap.id === 'pag-002' && (ap.description?.includes('SP') || ap.description?.includes('São Paulo'))) ||
          ap.description?.includes('São Paulo')
        ) {
          changed = true;
          return {
            ...ap,
            supplierName: 'Imobiliária Subaé Feira Ltda',
            description: 'Aluguel do Galpão Industrial CIS - Feira de Santana/BA',
            ...(stampUpdatedAt ? { updatedAt: nowIso } : {}),
          };
        }
        return ap;
      });
    }

    if (targetState.purchaseOrders) {
      targetState.purchaseOrders = targetState.purchaseOrders.map((po) => {
        if (
          (po.id === 'pc-001' && po.supplierName?.includes('Paulista')) ||
          po.supplierName?.includes('PlastFlex') ||
          po.supplierName?.includes('Paulista')
        ) {
          changed = true;
          return {
            ...po,
            supplierName: 'Plásticos & Embalagens Recôncavo Ltda',
            ...(stampUpdatedAt ? { updatedAt: nowIso } : {}),
          };
        }
        return po;
      });
    }

    return changed;
  }

  /**
   * Reconcilia com segurança os dados locais com os dados do Firebase Firestore.
   * Preserva quaisquer registros criados localmente enquanto offline e
   * atualiza os registros existentes com as alterações da nuvem sem sobrescrever
   * operações simultâneas nem perder cadastros existentes.
   */
  public static reconcileWithRemote(
    remoteState: DatabaseState,
    remoteSyncTime?: string,
    options?: {
      baseRemoteState?: Record<string, any> | null;
      hasPendingLocalChanges?: boolean;
    }
  ): { merged: boolean; localUnsyncedChanges: boolean; bahiaMigrated?: boolean } {
    try {
      if (!remoteState || !Array.isArray(remoteState.companies)) {
        return { merged: false, localUnsyncedChanges: false, bahiaMigrated: false };
      }

      const local = this.getState();
      let hasLocalUnsynced = false;
      const baseRemote = options?.baseRemoteState || null;

      // Somente durante um reset de fábrica pendente de envio à nuvem evita-se restaurar registros remotos antes da substituição
      const isPendingReset = this.hasPendingFactoryReset();
      if (isPendingReset && (local.products || []).length === 0 && (remoteState.products || []).length > 0) {
        return { merged: false, localUnsyncedChanges: true, bahiaMigrated: false };
      }

      const isClean = typeof window !== 'undefined' && localStorage.getItem(DB_KEY_PREFIX + 'clean_start') === 'true';
      const hasPriorRemoteSync = this.hasRemoteSyncCache();

      // Se o navegador ainda não sincronizou anteriormente (estado local é apenas semente de fábrica / sessão anterior)
      // e não possui operações pendentes na fila local, adota diretamente o estado oficial da nuvem.
      if (!hasPriorRemoteSync && !options?.hasPendingLocalChanges) {
        const cleanRemoteUsers = this.stripPasswordsFromUsers(remoteState.users);
        const adoptedState: DatabaseState = {
          ...remoteState,
          users: cleanRemoteUsers,
          currentCompanyId:
            local.currentCompanyId || remoteState.currentCompanyId || remoteState.companies[0]?.id || 'comp-matriz',
          currentUserId: local.currentUserId || remoteState.currentUserId,
        };
        const remoteMatriz =
          adoptedState.companies?.find((c) => c.type === 'matriz') || adoptedState.companies?.[0];
        if (remoteMatriz && remoteMatriz.cnpjCpf && remoteMatriz.cnpjCpf.trim() !== '') {
          try {
            if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
              localStorage.removeItem('gestaofacil_needs_matriz_setup');
            }
          } catch {}
        }
        this.state = adoptedState;
        this.ensureValidCurrentCompanyForUser(undefined, { skipPersist: true });
        this.writeStateToLocalStorage();
        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && remoteSyncTime) {
          try {
            localStorage.setItem(DB_KEY_PREFIX + 'last_remote_sync', remoteSyncTime);
          } catch {
            // ignore
          }
        }
        this.notify();
        return { merged: true, localUnsyncedChanges: false, bahiaMigrated: false };
      }

      // Mescla coleções preservando itens locais não sincronizados por ID e alterações mais recentes.
      // Quando temos baseRemote (snapshot anterior conhecido do servidor), distingue exclusões remotas
      // intencionais de novos registros criados localmente neste dispositivo.
      const mergeArrays = <T extends { id: string }>(
        localArr: T[] | undefined,
        remoteArr: T[] | undefined,
        collectionKey?: keyof DatabaseState
      ): T[] => {
        const localList = localArr || [];
        const remoteList = remoteArr || [];
        const baseList =
          collectionKey && baseRemote && Array.isArray(baseRemote[collectionKey])
            ? (baseRemote[collectionKey] as T[])
            : null;
        const baseMap = new Map<string, T>();
        if (baseList) {
          baseList.forEach((bItem) => {
            if (bItem && bItem.id) baseMap.set(bItem.id, bItem);
          });
        }

        const localMap = new Map<string, T>();
        localList.forEach((item) => {
          if (item && item.id) localMap.set(item.id, item);
        });

        const merged: T[] = [];
        const seenIds = new Set<string>();

        remoteList.forEach((rItem) => {
          if (!rItem || !rItem.id) return;
          seenIds.add(rItem.id);
          const lItem = localMap.get(rItem.id);
          if (!lItem) {
            merged.push(rItem);
          } else {
            const rUpdated = (rItem as any).updatedAt || (rItem as any).createdAt || '';
            const lUpdated = (lItem as any).updatedAt || (lItem as any).createdAt || '';
            if (lUpdated && (!rUpdated || lUpdated > rUpdated)) {
              merged.push(lItem);
              hasLocalUnsynced = true;
            } else {
              merged.push(rItem);
            }
          }
        });

        localList.forEach((lItem) => {
          if (!lItem || !lItem.id) return;
          if (!seenIds.has(lItem.id)) {
            const baseItem = baseMap.get(lItem.id);
            if (baseItem) {
              // O item já existia no último snapshot remoto conhecido e foi removido remotamente por outro dispositivo.
              // Só preserva se houve alteração local mais recente após o baseItem.
              const bUpdated = (baseItem as any).updatedAt || (baseItem as any).createdAt || '';
              const lUpdated = (lItem as any).updatedAt || (lItem as any).createdAt || '';
              if (lUpdated && bUpdated && lUpdated > bUpdated) {
                merged.push(lItem);
                hasLocalUnsynced = true;
              }
            } else {
              // Item criado localmente neste dispositivo ainda não presente no servidor -> preserva integralmente!
              merged.push(lItem);
              hasLocalUnsynced = true;
            }
          }
        });

        return merged;
      };

      const mergedDeletedUserIds = Array.from(
        new Set([...(local.deletedUserIds || []), ...(remoteState.deletedUserIds || [])])
      );

      const mergedUsersRaw = this.stripPasswordsFromUsers(
        mergeArrays(local.users, remoteState.users, 'users').filter((u) => !mergedDeletedUserIds.includes(u.id))
      );
      const normalizedUsers = this.normalizeUsersList(mergedUsersRaw);

      const effectiveAuditClearedAt = [local.auditLogsClearedAt, remoteState.auditLogsClearedAt]
        .filter((v): v is string => Boolean(v))
        .sort()
        .pop();
      const filterClearedLogs = (logs: AuditLog[] | undefined) => {
        const list = logs || [];
        if (!effectiveAuditClearedAt) return list;
        return list.filter((log) => (log.timestamp || '') > effectiveAuditClearedAt);
      };
      if (
        local.auditLogsClearedAt &&
        (!remoteState.auditLogsClearedAt || local.auditLogsClearedAt > remoteState.auditLogsClearedAt)
      ) {
        hasLocalUnsynced = true;
      }

      const mergeStockBalances = (): ProductStockBalance[] => {
        const localBals = local.stockBalances || [];
        const remoteBals = remoteState.stockBalances || [];
        const keyOf = (b: ProductStockBalance) => `${b.productId}::${b.locationId}`;
        const localMap = new Map<string, ProductStockBalance>();
        localBals.forEach((b) => localMap.set(keyOf(b), b));

        const merged: ProductStockBalance[] = [];
        const seen = new Set<string>();

        remoteBals.forEach((rBal) => {
          const k = keyOf(rBal);
          seen.add(k);
          const lBal = localMap.get(k);
          if (!lBal) {
            merged.push(rBal);
          } else {
            const rUpdated = rBal.updatedAt || '';
            const lUpdated = lBal.updatedAt || '';
            if (lUpdated && (!rUpdated || lUpdated > rUpdated)) {
              merged.push(lBal);
              hasLocalUnsynced = true;
            } else {
              merged.push(rBal);
            }
          }
        });

        localBals.forEach((lBal) => {
          const k = keyOf(lBal);
          if (!seen.has(k)) {
            if (lBal.updatedAt || lBal.quantity !== 0 || lBal.reserved !== 0) {
              merged.push(lBal);
              hasLocalUnsynced = true;
            }
          }
        });

        return merged;
      };
      const mergedStockBalances = mergeStockBalances();

      const mergedState: DatabaseState = {
        ...remoteState,
        currentCompanyId: local.currentCompanyId || remoteState.currentCompanyId,
        currentUserId: local.currentUserId || remoteState.currentUserId,
        ...(remoteState.deletedUserIds !== undefined || mergedDeletedUserIds.length > 0
          ? { deletedUserIds: mergedDeletedUserIds }
          : {}),
        companies: mergeArrays(local.companies, remoteState.companies, 'companies'),
        users: normalizedUsers.users,
        customers: mergeArrays(local.customers, remoteState.customers, 'customers'),
        suppliers: mergeArrays(local.suppliers, remoteState.suppliers, 'suppliers'),
        products: mergeArrays(local.products, remoteState.products, 'products'),
        components: mergeArrays(local.components, remoteState.components, 'components'),
        orders: mergeArrays(local.orders, remoteState.orders, 'orders'),
        deliveryRoutes: mergeArrays(local.deliveryRoutes, remoteState.deliveryRoutes, 'deliveryRoutes'),
        deliveryDrivers: mergeArrays(local.deliveryDrivers, remoteState.deliveryDrivers, 'deliveryDrivers'),
        deliveryVehicles: mergeArrays(local.deliveryVehicles, remoteState.deliveryVehicles, 'deliveryVehicles'),
        ...(remoteState.deliveryManifests !== undefined || (local.deliveryManifests?.length ?? 0) > 0
          ? { deliveryManifests: mergeArrays(local.deliveryManifests, remoteState.deliveryManifests, 'deliveryManifests') }
          : {}),
        stockLocations: mergeArrays(local.stockLocations, remoteState.stockLocations, 'stockLocations'),
        productionOrders: mergeArrays(local.productionOrders, remoteState.productionOrders, 'productionOrders'),
        purchaseOrders: mergeArrays(local.purchaseOrders, remoteState.purchaseOrders, 'purchaseOrders'),
        purchaseReceipts: mergeArrays(local.purchaseReceipts, remoteState.purchaseReceipts, 'purchaseReceipts'),
        transferOrders: mergeArrays(local.transferOrders, remoteState.transferOrders, 'transferOrders'),
        inventoryCounts: mergeArrays(local.inventoryCounts, remoteState.inventoryCounts, 'inventoryCounts'),
        accountsReceivable: mergeArrays(local.accountsReceivable, remoteState.accountsReceivable, 'accountsReceivable'),
        accountsPayable: mergeArrays(local.accountsPayable, remoteState.accountsPayable, 'accountsPayable'),
        cashRegisters: mergeArrays(local.cashRegisters, remoteState.cashRegisters, 'cashRegisters'),
        auditLogs: mergeArrays(filterClearedLogs(local.auditLogs), filterClearedLogs(remoteState.auditLogs), 'auditLogs'),
        ...(effectiveAuditClearedAt ? { auditLogsClearedAt: effectiveAuditClearedAt } : {}),
        stockBalances: mergedStockBalances,
        stockMovements: mergeArrays(local.stockMovements, remoteState.stockMovements, 'stockMovements'),
        paymentMethods: remoteState.paymentMethods || local.paymentMethods,
        financialAccounts: mergeArrays(local.financialAccounts, remoteState.financialAccounts, 'financialAccounts'),
        paymentTermsList: mergeArrays(local.paymentTermsList, remoteState.paymentTermsList, 'paymentTermsList'),
        marketAreas: mergeArrays(local.marketAreas, remoteState.marketAreas, 'marketAreas'),
        states: mergeArrays(local.states, remoteState.states, 'states'),
        cities: mergeArrays(local.cities, remoteState.cities, 'cities'),
        neighborhoods: mergeArrays(local.neighborhoods, remoteState.neighborhoods, 'neighborhoods'),
        ...(remoteState.printerConfig || local.printerConfig
          ? { printerConfig: remoteState.printerConfig || local.printerConfig }
          : {}),
        ...(remoteState.sidebarMenuConfig || local.sidebarMenuConfig
          ? { sidebarMenuConfig: remoteState.sidebarMenuConfig || local.sidebarMenuConfig }
          : {}),
        ...(remoteState.companyStockTransfers !== undefined || (local.companyStockTransfers?.length ?? 0) > 0
          ? { companyStockTransfers: mergeArrays(local.companyStockTransfers, remoteState.companyStockTransfers, 'companyStockTransfers') }
          : {}),
        chartOfAccounts: mergeArrays(local.chartOfAccounts, remoteState.chartOfAccounts, 'chartOfAccounts'),
        salesReturns: mergeArrays(local.salesReturns, remoteState.salesReturns, 'salesReturns'),
        ...(remoteState.customerVouchers !== undefined || (local.customerVouchers?.length ?? 0) > 0
          ? { customerVouchers: mergeArrays(local.customerVouchers, remoteState.customerVouchers, 'customerVouchers') }
          : {}),
      };

      // Impede que dados legados de SP/Sudeste vindos do Firestore reapareçam após a migração para Bahia
      const bahiaMigrated = this.applyBahiaRegionalMigration(mergedState, true, isClean);
      if (bahiaMigrated) {
        hasLocalUnsynced = true;
      }

      // Se a Matriz já foi configurada no banco remoto, desmarca a pendência local de setup inicial
      const remoteMatriz = mergedState.companies?.find((c) => c.type === 'matriz') || mergedState.companies?.[0];
      if (remoteMatriz && remoteMatriz.cnpjCpf && remoteMatriz.cnpjCpf.trim() !== '') {
        try {
          if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
            localStorage.removeItem('gestaofacil_needs_matriz_setup');
          }
        } catch {}
      }

      this.state = mergedState;
      this.ensureValidCurrentCompanyForUser(undefined, { skipPersist: true });
      this.writeStateToLocalStorage();
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined' && remoteSyncTime) {
        try {
          localStorage.setItem(DB_KEY_PREFIX + 'last_remote_sync', remoteSyncTime);
        } catch {
          // ignore
        }
      }
      this.notify();
      return { merged: true, localUnsyncedChanges: hasLocalUnsynced, bahiaMigrated };
    } catch (e) {
      console.error('Erro na reconciliação de dados com Firebase:', e);
      return { merged: false, localUnsyncedChanges: false, bahiaMigrated: false };
    }
  }

  /**
   * Resolve a empresa autorizada mais adequada para o usuário atual,
   * respeitando o vínculo cadastrado e as empresas permitidas.
   */
  public static resolveAuthorizedCompanyForUser(
    user?: User | null,
    preferredCompanyId?: string,
    options?: { preferUserLinkedCompany?: boolean }
  ): Company {
    const s = this.getState();
    const u = user || this.getCurrentUser();
    const available = this.getAvailableCompaniesForUser(u);
    const pool = available.length > 0 ? available : (s.companies || []);

    const fallbackCompany: Company = pool[0] || {
      id: 'comp-matriz',
      name: 'Química & Limpeza Imperial Ltda',
      tradeName: 'Imperial Limpeza - Matriz Feira de Santana',
      cnpjCpf: '12.345.678/0001-90',
      type: 'matriz',
      phone: '(75) 3600-7890',
      email: 'contato@imperiallimpeza.com.br',
      address: {
        street: 'Av. Eduardo Fróes da Mota',
        number: '1500',
        neighborhood: 'CIS - Distrito Industrial do Subaé',
        city: 'Feira de Santana',
        state: 'BA',
        zipCode: '44000-000',
      },
      status: 'ativo',
    };

    if (options?.preferUserLinkedCompany && u?.companyId) {
      const linked = pool.find((c) => c.id === u.companyId && c.status !== 'inativo') ||
        pool.find((c) => c.id === u.companyId);
      if (linked) return linked;
    }

    const candidateId = preferredCompanyId || s.currentCompanyId;
    if (candidateId) {
      const matched = pool.find((c) => c.id === candidateId);
      if (matched) return matched;
    }

    if (u?.companyId) {
      const linked = pool.find((c) => c.id === u.companyId && c.status !== 'inativo') ||
        pool.find((c) => c.id === u.companyId);
      if (linked) return linked;
    }

    return pool.find((c) => c.status !== 'inativo') || fallbackCompany;
  }

  /**
   * Garante que state.currentCompanyId sempre corresponda a uma empresa autorizada para o usuário ativo.
   * Evita divergência entre o seletor visual e o companyId efetivamente gravado nos pedidos.
   */
  public static ensureValidCurrentCompanyForUser(
    user?: User | null,
    options?: { preferUserLinkedCompany?: boolean; skipPersist?: boolean }
  ): Company {
    const s = this.getState();
    const u = user || this.getCurrentUser();
    const resolved = this.resolveAuthorizedCompanyForUser(u, s.currentCompanyId, {
      preferUserLinkedCompany: options?.preferUserLinkedCompany,
    });

    if (s.currentCompanyId !== resolved.id) {
      s.currentCompanyId = resolved.id;
      if (!options?.skipPersist) {
        this.writeStateToLocalStorage();
        this.notify();
      }
    }

    return resolved;
  }

  /**
   * Gera número sequencial único de pedido verificando os registros já existentes
   * para evitar colisões entre múltiplos dispositivos.
   */
  public static generateUniqueOrderNumber(prefix: string, padLength: number = 4): string {
    const s = this.getState();
    const year = new Date().getFullYear();
    const fullPrefix = `${prefix}-${year}-`;
    let maxSeq = 0;

    for (const ord of s.orders || []) {
      if (ord?.number && ord.number.startsWith(fullPrefix)) {
        const suffix = ord.number.slice(fullPrefix.length).replace(/\D/g, '');
        const parsed = parseInt(suffix, 10);
        if (!isNaN(parsed) && parsed > maxSeq) {
          maxSeq = parsed;
        }
      }
    }

    let nextSeq = Math.max(maxSeq + 1, (s.orders?.length || 0) + 1);
    const existingNumbers = new Set((s.orders || []).map((o) => o.number));
    let candidate = `${fullPrefix}${String(nextSeq).padStart(padLength, '0')}`;
    while (existingNumbers.has(candidate)) {
      nextSeq += 1;
      candidate = `${fullPrefix}${String(nextSeq).padStart(padLength, '0')}`;
    }
    return candidate;
  }

  /**
   * Verifica se já existe um pedido gravado com a mesma chave de submissão (proteção anti-duplicidade).
   */
  public static findOrderBySubmissionId(submissionId: string): Order | undefined {
    if (!submissionId) return undefined;
    const s = this.getState();
    return (s.orders || []).find((o) => o.clientSubmissionId === submissionId);
  }

  public static setCurrentCompany(companyId: string): boolean {
    if (!this.state) return false;
    const available = this.getAvailableCompaniesForUser();
    const isAuthorized = available.some((c) => c.id === companyId);
    if (!isAuthorized) {
      const resolved = this.ensureValidCurrentCompanyForUser(undefined, { skipPersist: false });
      return resolved.id === companyId;
    }
    if (this.state.currentCompanyId !== companyId) {
      this.state.currentCompanyId = companyId;
      // Atualiza localmente o contexto de visualização sem disparar escrita remota desnecessária
      // que interferiria na empresa selecionada em outros dispositivos.
      this.writeStateToLocalStorage();
      this.notify();
    }
    return true;
  }

  public static setCurrentUser(userId: string) {
    if (this.state) {
      this.state.currentUserId = userId;
      const targetUser = this.state.users.find((u) => u.id === userId) || null;
      this.ensureValidCurrentCompanyForUser(targetUser, {
        preferUserLinkedCompany: true,
        skipPersist: true,
      });
      this.writeStateToLocalStorage();
      this.notify();
    }
  }

  public static getCurrentCompany(): Company {
    const s = this.getState();
    if (this.isSessionAuthenticated()) {
      const resolved = this.resolveAuthorizedCompanyForUser(this.getCurrentUser(), s.currentCompanyId);
      if (s.currentCompanyId !== resolved.id) {
        s.currentCompanyId = resolved.id;
      }
      return resolved;
    }
    return (
      s.companies.find((c) => c.id === s.currentCompanyId) ||
      s.companies[0] || {
        id: 'comp-matriz',
        name: 'Química & Limpeza Imperial Ltda',
        tradeName: 'Imperial Limpeza - Matriz Feira de Santana',
        cnpjCpf: '12.345.678/0001-90',
        type: 'matriz',
        phone: '(75) 3600-7890',
        email: 'contato@imperiallimpeza.com.br',
        address: {
          street: 'Av. Eduardo Fróes da Mota',
          number: '1500',
          neighborhood: 'CIS - Distrito Industrial do Subaé',
          city: 'Feira de Santana',
          state: 'BA',
          zipCode: '44000-000',
        },
        status: 'ativo',
      }
    );
  }

  public static getCurrentUser(): User {
    const s = this.getState();
    return s.users.find((u) => u.id === s.currentUserId) || s.users[0];
  }

  /**
   * Retorna as empresas às quais o usuário possui permissão de acesso
   * - Administrador: visualiza e gerencia todas as empresas
   * - Gerente: visualiza conforme permissões
   * - Vendedor e balconista: operam apenas na empresa à qual possuem acesso
   */
  public static getAvailableCompaniesForUser(user?: User | null): Company[] {
    const s = this.getState();
    const u = user || this.getCurrentUser();
    if (!u) return s.companies || [];

    // Administrador tem visão global irrestrita de todas as empresas
    if (u.role === 'admin') {
      return s.companies || [];
    }

    // Se possui lista de empresas permitidas explicitamente
    if (u.allowedCompanyIds && u.allowedCompanyIds.length > 0) {
      const allowedSet = new Set(u.allowedCompanyIds);
      const filtered = s.companies.filter((c) => allowedSet.has(c.id));
      if (filtered.length > 0) return filtered;
    }

    // Gerente: acesso amplo padrão a não ser que haja restrição expressa
    if (u.role === 'gerente') {
      return s.companies || [];
    }

    // Vendedor e Balconista: operam exclusivamente na empresa vinculada
    if (u.companyId) {
      const single = s.companies.filter((c) => c.id === u.companyId);
      if (single.length > 0) return single;
    }

    return s.companies || [];
  }

  public static readonly AUTH_SESSION_KEY = 'omni_erp_auth_active';
  public static readonly AUTH_REMEMBER_LOGIN_KEY = 'omni_erp_remembered_login';

  public static isSessionAuthenticated(): boolean {
    if (typeof window === 'undefined') return true;
    return sessionStorage.getItem(this.AUTH_SESSION_KEY) === 'true';
  }

  public static setSessionAuthenticated(authenticated: boolean, rememberMe: boolean = false) {
    if (typeof window === 'undefined') return;
    if (authenticated) {
      sessionStorage.setItem(this.AUTH_SESSION_KEY, 'true');
      if (rememberMe) {
        localStorage.setItem(this.AUTH_SESSION_KEY, 'true');
      } else {
        localStorage.removeItem(this.AUTH_SESSION_KEY);
      }
    } else {
      sessionStorage.removeItem(this.AUTH_SESSION_KEY);
      localStorage.removeItem(this.AUTH_SESSION_KEY);
    }
  }

  public static authenticate(
    _login: string,
    _password: string,
    _rememberMe: boolean = false
  ): {
    success: boolean;
    user?: User;
    error?: string;
  } {
    return {
      success: false,
      error: 'Autenticação local desabilitada por segurança. Utilize o login integrado ao Firebase Authentication.',
    };
  }

  public static changePassword(
    targetUserId: string,
    _currentPassword: string,
    newPassword: string,
    requestingUserId: string
  ): { success: boolean; error?: string } {
    const state = this.getState();
    const targetUser = state.users.find((u) => u.id === targetUserId);
    if (!targetUser) {
      return { success: false, error: 'Usuário alvo não encontrado.' };
    }

    const requestingUser = state.users.find((u) => u.id === requestingUserId) || this.getCurrentUser();

    if (!this.isMasterAdmin(requestingUser)) {
      return {
        success: false,
        error: 'Apenas o Administrador Master (romeujr.suporte@gmail.com) tem autorização para alterar senhas de usuários no sistema.',
      };
    }

    const isTargetAdmin =
      targetUser.login === 'admin' ||
      targetUser.id === 'usr-admin' ||
      targetUser.email?.toLowerCase() === 'romeujr.suporte@gmail.com';

    if (isTargetAdmin) {
      if (requestingUser.email?.toLowerCase() !== 'romeujr.suporte@gmail.com' && requestingUser.login?.toLowerCase() !== 'romeujr.suporte@gmail.com') {
        return {
          success: false,
          error: 'Apenas o Administrador Master (romeujr.suporte@gmail.com) tem autorização para alterar a senha do administrador.',
        };
      }
    }

    const cleanNewPass = (newPassword || '').trim();
    if (!cleanNewPass || cleanNewPass.length < 3) {
      return { success: false, error: 'A nova senha deve possuir no mínimo 3 caracteres.' };
    }

    // Não armazena senha em texto claro em memória, localStorage ou Firestore (Firebase Auth é a fonte oficial)
    if ('password' in targetUser) {
      delete targetUser.password;
    }
    targetUser.updatedAt = new Date().toISOString();
    this.persist();

    this.addAuditLog(
      'SENHA_ALTERADA',
      'SEGURANCA',
      targetUser.id,
      `Solicitação de alteração de senha registrada para ${targetUser.name} (${targetUser.login}) via Firebase Authentication.`
    );

    return { success: true };
  }

  public static verifyAdminPassword(
    _passwordInput: string,
    requestingUserId?: string
  ): { valid: boolean; error?: string } {
    const state = this.getState();
    const requestingUser = state.users.find((u) => u.id === requestingUserId) || this.getCurrentUser();

    if (!this.isMasterAdmin(requestingUser)) {
      return {
        valid: false,
        error: 'Apenas o Administrador Master (romeujr.suporte@gmail.com) tem autorização para visualizar informações de acesso.',
      };
    }

    return {
      valid: false,
      error: 'Por segurança, senhas em texto claro não são armazenadas no Firestore ou localStorage. A autenticação é gerenciada exclusivamente pelo Firebase Authentication.',
    };
  }

  public static resetPasswordToDefault(
    targetUserId: string,
    requestingUserId: string
  ): { success: boolean; error?: string } {
    const state = this.getState();
    const targetUser = state.users.find((u) => u.id === targetUserId);
    if (!targetUser) {
      return { success: false, error: 'Usuário alvo não encontrado.' };
    }

    const requestingUser = state.users.find((u) => u.id === requestingUserId) || this.getCurrentUser();

    if (!this.isMasterAdmin(requestingUser)) {
      return {
        success: false,
        error: 'Apenas o Administrador Master (romeujr.suporte@gmail.com) tem autorização para redefinir senhas de usuários no sistema.',
      };
    }

    if (targetUser.login === 'admin' || targetUser.id === 'usr-admin') {
      if (requestingUser.email?.toLowerCase() !== 'romeujr.suporte@gmail.com' && requestingUser.login?.toLowerCase() !== 'romeujr.suporte@gmail.com') {
        return {
          success: false,
          error: 'Apenas o Administrador Master (romeujr.suporte@gmail.com) tem autorização para alterar ou redefinir a senha do administrador.',
        };
      }
    }

    // Remove eventual senha legada em texto claro sem gravar senha padrão em localStorage/Firestore
    if ('password' in targetUser) {
      delete targetUser.password;
    }
    targetUser.updatedAt = new Date().toISOString();
    this.persist();
    this.addAuditLog(
      'SENHA_REDEFINIDA_PADRAO',
      'SEGURANCA',
      targetUser.id,
      `Registro de senha legada removido para ${targetUser.name} (${targetUser.login}). Redefinição definitiva deve ocorrer no Firebase Authentication.`
    );

    return { success: true };
  }

  public static deleteUser(
    targetUserId: string,
    requestingUserId?: string
  ): { success: boolean; deletedUser?: User; error?: string } {
    const state = this.getState();
    const requestingUser = state.users.find((u) => u.id === requestingUserId) || this.getCurrentUser();

    if (!this.isMasterAdmin(requestingUser)) {
      return {
        success: false,
        error: 'Apenas o Administrador Master (romeujr.suporte@gmail.com) tem autorização para excluir usuários do sistema.',
      };
    }

    const targetUser = state.users.find((u) => u.id === targetUserId);
    if (!targetUser) {
      return { success: false, error: 'Usuário não encontrado no sistema.' };
    }

    if (
      targetUser.login === 'admin' ||
      targetUser.id === 'usr-admin' ||
      targetUser.email?.toLowerCase() === 'romeujr.suporte@gmail.com'
    ) {
      return {
        success: false,
        error: 'O usuário Administrador Master (@admin) não pode ser excluído.',
      };
    }

    if (targetUser.id === requestingUser.id || targetUser.id === state.currentUserId) {
      return {
        success: false,
        error: 'Não é permitido excluir o usuário que está atualmente conectado.',
      };
    }

    if (state.users.length <= 1) {
      return {
        success: false,
        error: 'Não é possível excluir o único usuário restante do sistema.',
      };
    }

    state.users = state.users.filter((u) => u.id !== targetUserId);
    state.deletedUserIds = Array.from(new Set([...(state.deletedUserIds || []), targetUserId]));

    this.addAuditLog(
      'EXCLUIR_USUARIO',
      'USUARIOS',
      targetUser.id,
      `Usuário ${targetUser.name} (@${targetUser.login}, perfil ${targetUser.role}) excluído do sistema pelo administrador ${requestingUser.name}.`
    );

    this.persist();
    return { success: true, deletedUser: targetUser };
  }

  public static logout() {
    const user = this.getCurrentUser();
    if (user) {
      this.addAuditLog('LOGOUT_EFETUADO', 'SEGURANCA', user.id, `Usuário ${user.name} desconectou do sistema.`);
    }
    this.setSessionAuthenticated(false);
    this.notify();
  }

  public static isMasterAdmin(user?: User): boolean {
    const u = user || this.getCurrentUser();
    if (!u) return false;
    const email = (u.email || '').trim().toLowerCase();
    const login = (u.login || '').trim().toLowerCase();
    return (
      email === 'romeujr.suporte@gmail.com' ||
      login === 'romeujr.suporte@gmail.com'
    );
  }

  public static isAdmin(user?: User): boolean {
    const u = user || this.getCurrentUser();
    if (!u) return false;
    const email = (u.email || u.login || '').trim().toLowerCase();
    return email === 'romeujr.suporte@gmail.com' || u.role === 'admin' || u.login === 'admin';
  }

  public static isGerente(user?: User): boolean {
    const u = user || this.getCurrentUser();
    if (!u) return false;
    if (this.isAdmin(u)) return false;
    return u.role === 'gerente';
  }

  public static isManagerOrAdminUser(user?: User): boolean {
    const u = user || this.getCurrentUser();
    return this.isAdmin(u) || this.isGerente(u);
  }

  /**
   * Somente usuários ativos com perfil Administrador Geral (admin) ou Gerente Geral (gerente)
   * têm permissão para alterar diretamente o preço unitário de produtos durante a venda.
   */
  public static canCurrentUserAlterUnitPrice(user?: User): boolean {
    const u = user || this.getCurrentUser();
    if (!u || u.status === 'inativo') return false;
    return this.isAdmin(u) || this.isGerente(u);
  }

  public static isBalconista(user?: User): boolean {
    const u = user || this.getCurrentUser();
    if (!u) return false;
    if (this.isAdmin(u)) return false;
    return u.role === 'balconista';
  }

  public static isExternalSeller(user?: User): boolean {
    const u = user || this.getCurrentUser();
    if (!u) return false;
    if (this.isAdmin(u)) return false;
    return u.role === 'vendedor_externo';
  }

  public static getDefaultModuleForCurrentUser(user?: User): string {
    const u = user || this.getCurrentUser();
    if (this.isExternalSeller(u)) {
      return 'external_sales';
    }
    if (this.isBalconista(u)) {
      return 'pos';
    }
    return 'dashboard';
  }

  public static canCurrentUserView(
    metric: 'grossProfit' | 'netProfit' | 'totalRevenue' | 'profitMargin' | 'productCosts' | 'cashBalances'
  ): boolean {
    const user = this.getCurrentUser();
    if (this.isAdmin(user)) return true;

    // Regra solicitada: Balconista de PDV não deve ter acesso a números de vendas totais, lucros ou custos da empresa
    if (this.isBalconista(user)) {
      return false;
    }

    const perms = user.permissions;
    const role = user.role || 'balconista';
    const finDefaults = DEFAULT_ROLE_FINANCIAL_PERMISSIONS[role] || DEFAULT_ROLE_FINANCIAL_PERMISSIONS.balconista;

    switch (metric) {
      case 'grossProfit':
        return perms.canViewGrossProfit !== undefined ? perms.canViewGrossProfit : finDefaults.canViewGrossProfit;
      case 'netProfit':
        return perms.canViewNetProfit !== undefined ? perms.canViewNetProfit : finDefaults.canViewNetProfit;
      case 'totalRevenue':
        return perms.canViewTotalRevenue !== undefined ? perms.canViewTotalRevenue : finDefaults.canViewTotalRevenue;
      case 'profitMargin':
        return perms.canViewProfitMargin !== undefined ? perms.canViewProfitMargin : finDefaults.canViewProfitMargin;
      case 'productCosts':
        return perms.canViewProductCosts !== undefined ? perms.canViewProductCosts : (perms.canViewCosts ?? finDefaults.canViewProductCosts);
      case 'cashBalances':
        return perms.canViewCashBalances !== undefined ? perms.canViewCashBalances : finDefaults.canViewCashBalances;
      default:
        return false;
    }
  }

  public static isMenuSectionAllowedForCurrentUser(sectionId: string): boolean {
    const user = this.getCurrentUser();
    if (this.isAdmin(user)) return true;
    if (sectionId === 'configuracoes' && !this.isGerente(user)) return false; // Configurações apenas para Admin e Gerente Geral

    if (Array.isArray(user.permissions.allowedMenuSections)) {
      return user.permissions.allowedMenuSections.includes(sectionId);
    }
    const role = user.role || 'balconista';
    const roleDefaults = DEFAULT_ROLE_MENU_SECTIONS[role];
    if (roleDefaults) {
      return roleDefaults.includes(sectionId);
    }
    return true;
  }

  public static isSubItemAllowedForCurrentUser(subItemId: string): boolean {
    const user = this.getCurrentUser();
    if (this.isAdmin(user)) return true;
    if (subItemId === 'settings_menus' || subItemId === 'settings_cleanup' || subItemId === 'settings_supabase') {
      return false; // Menus do Sistema e Limpeza de Dados são exclusivos do Admin
    }
    if (subItemId === 'settings' && !this.isGerente(user)) {
      return false; // Empresas, Usuários & Auditoria apenas para Admin e Gerente Geral
    }

    // Regra: Balconista de PDV tem como tela inicial o PDV Balcão e NÃO pode visualizar/acessar o Dashboard com indicadores
    if (subItemId === 'dashboard' && this.isBalconista(user)) {
      return false;
    }

    if (Array.isArray(user.permissions.allowedSubItems)) {
      return user.permissions.allowedSubItems.includes(subItemId);
    }
    const role = user.role || 'balconista';
    const roleDefaults = DEFAULT_ROLE_SUB_ITEMS[role];
    if (roleDefaults) {
      return roleDefaults.includes(subItemId);
    }
    return true;
  }

  public static updateUserPermissions(
    targetUserId: string,
    newPermissions: Partial<UserPermissions>,
    requestingUserId: string
  ): { success: boolean; error?: string } {
    const state = this.getState();
    const requestingUser = state.users.find((u) => u.id === requestingUserId) || this.getCurrentUser();
    if (!this.isMasterAdmin(requestingUser)) {
      return {
        success: false,
        error: 'Apenas o Administrador Master (romeujr.suporte@gmail.com) tem autorização para configurar permissões de menus e números da empresa.',
      };
    }

    const targetUser = state.users.find((u) => u.id === targetUserId);
    if (!targetUser) {
      return { success: false, error: 'Usuário não encontrado.' };
    }

    targetUser.permissions = {
      ...targetUser.permissions,
      ...newPermissions,
      ...(targetUser.role === 'gerente' ? { gerenteSettingsMigrated: true } : {}),
    };
    targetUser.updatedAt = new Date().toISOString();

    this.addAuditLog(
      'PERMISSOES_CONFIGURADAS',
      'USUARIOS',
      targetUser.id,
      `Permissões de menus e números da empresa atualizadas pelo administrador para o usuário ${targetUser.name} (@${targetUser.login})`
    );

    this.persist();
    return { success: true };
  }

  public static addAuditLog(action: string, module: string, recordId: string, details: string, skipPersist: boolean = false) {
    const user = this.getCurrentUser();
    const company = this.getCurrentCompany();
    const newLog: AuditLog = {
      id: 'LOG-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      companyId: company?.id || 'comp-matriz',
      userId: user?.id || 'usr-admin',
      userName: user?.name || 'Administrador',
      action,
      module,
      recordId,
      details,
      timestamp: new Date().toISOString(),
    };
    const s = this.getState();
    if (!s.auditLogs) {
      s.auditLogs = [];
    }
    s.auditLogs.unshift(newLog);
    // Limita o histórico de auditoria local aos 60 registros mais recentes para proteger a cota do localStorage
    if (s.auditLogs.length > 60) {
      s.auditLogs = s.auditLogs.slice(0, 60);
    }
    if (!skipPersist) {
      this.persist();
    }
  }

  /**
   * Validação obrigatória na camada de persistência para garantir que nenhum pedido/venda
   * seja salvo com desconto (no item, geral ou por alteração manual de preço) acima do limite
   * configurado no cadastro do produto sem autorização válida de Administrador ou Gerente Geral.
   */
  public static validateOrderDiscountsForPersistence(
    order: Order,
    options?: {
      saleSessionId?: string;
      existingOrder?: Order | null;
      globalOrderDiscountValue?: number;
    }
  ): DiscountAuthorizationRecord[] {
    // Pedidos de Bonificação não geram cobrança nem faturamento comercial
    if (order.orderKind === 'bonificacao') {
      return [];
    }
    const s = this.getState();

    // Validação de perfil para alteração direta de preço unitário (exclusivo Administrador Geral ou Gerente Geral)
    const canAlterPrice = this.canCurrentUserAlterUnitPrice();
    if (!canAlterPrice) {
      for (const item of order.items || []) {
        const baselineItem = options?.existingOrder?.items?.find((bi) => bi.productId === item.productId);
        const isExistingSameOverride =
          baselineItem &&
          baselineItem.priceOverridden === true &&
          Math.abs((baselineItem.unitPrice || 0) - (item.unitPrice || 0)) <= 0.005;

        if (item.priceOverridden && !isExistingSameOverride) {
          throw new Error(
            `Alteração direta de preço unitário no produto [${item.productCode}] ${item.description} permitida apenas para Administrador Geral ou Gerente Geral.`
          );
        }
      }
    }

    const itemDiscountsSum = (order.items || []).reduce((sum, i) => sum + (i.discountValue || 0), 0);
    const inferredGlobalDiscount =
      options?.globalOrderDiscountValue !== undefined
        ? Math.max(0, options.globalOrderDiscountValue)
        : Math.max(0, (order.discountTotal || 0) - itemDiscountsSum);

    const validation = validateOrderDiscounts({
      items: order.items || [],
      products: s.products || [],
      companyId: order.companyId || this.getCurrentCompany()?.id || 'comp-matriz',
      origin: options?.existingOrder ? 'edicao_pedido' : order.origin,
      globalOrderDiscountValue: inferredGlobalDiscount,
      saleSessionId: options?.saleSessionId,
      existingOrder: options?.existingOrder || null,
      users: s.users || [],
    });

    if (!validation.valid) {
      const first = validation.violations[0]?.violation;
      throw new Error(
        first
          ? `Desconto acima do limite permitido para o produto [${first.productCode}] ${first.productDescription} sem autorização válida de Administrador (Acesso Total) ou Gerente Geral.`
          : 'Existem itens com desconto acima do limite máximo permitido sem autorização válida.'
      );
    }

    return validation.validAuthorizations.map((auth) => ({
      ...auth,
      orderId: order.id,
      orderNumber: order.number,
    }));
  }

  /**
   * Vincula as autorizações validadas ao pedido persistido, grava os registros de auditoria
   * (sem senhas ou dados sensíveis) e encerra o escopo da sessão para impedir reutilização.
   */
  public static finalizeOrderDiscountAuthorizations(
    order: Order,
    validatedAuthorizations: DiscountAuthorizationRecord[],
    options?: {
      saleSessionId?: string;
      existingOrder?: Order | null;
      skipPersist?: boolean;
    }
  ): Order {
    const byProductId = new Map<string, DiscountAuthorizationRecord>();
    validatedAuthorizations.forEach((auth) => {
      byProductId.set(auth.productId, {
        ...auth,
        orderId: order.id,
        orderNumber: order.number,
      });
    });

    const enrichedItems = (order.items || []).map((item) => {
      const matched = byProductId.get(item.productId);
      if (matched) {
        return { ...item, discountAuthorization: matched };
      }
      // Se o desconto do item foi reduzido para dentro do limite, remove autorização obsoleta
      if (item.discountAuthorization) {
        const { discountAuthorization: _removed, ...rest } = item;
        return rest;
      }
      return item;
    });

    const finalAuthorizations = Array.from(byProductId.values());
    const enrichedOrder: Order = {
      ...order,
      items: enrichedItems,
      ...(finalAuthorizations.length > 0 ? { discountAuthorizations: finalAuthorizations } : { discountAuthorizations: undefined }),
    };

    const alreadyLoggedOpIds = new Set(
      (options?.existingOrder?.discountAuthorizations || []).map((a) => a.operationId)
    );

    finalAuthorizations.forEach((auth) => {
      if (!alreadyLoggedOpIds.has(auth.operationId)) {
        this.addAuditLog(
          'AUTORIZACAO_DESCONTO_MAXIMO',
          'VENDAS',
          order.id,
          formatDiscountAuthorizationAuditDetails(auth),
          true
        );
      }
    });

    if (options?.saleSessionId) {
      clearSaleSessionAuthorizations(options.saleSessionId);
    }

    if (!options?.skipPersist) {
      this.persist();
    }

    return enrichedOrder;
  }

  /**
   * Retorna todo o histórico consolidado de autorizações de desconto excedente
   * registradas nas vendas e pedidos para consulta administrativa e auditoria.
   */
  public static getAllDiscountAuthorizations(): DiscountAuthorizationRecord[] {
    const s = this.getState();
    const list: DiscountAuthorizationRecord[] = [];
    const seen = new Set<string>();

    (s.orders || []).forEach((ord) => {
      const fromOrder = ord.discountAuthorizations || [];
      fromOrder.forEach((rec) => {
        if (!rec || !rec.operationId || seen.has(rec.operationId)) return;
        seen.add(rec.operationId);
        list.push({
          ...rec,
          orderId: rec.orderId || ord.id,
          orderNumber: rec.orderNumber || ord.number,
        });
      });

      (ord.items || []).forEach((it) => {
        const rec = it.discountAuthorization;
        if (!rec || !rec.operationId || seen.has(rec.operationId)) return;
        seen.add(rec.operationId);
        list.push({
          ...rec,
          orderId: rec.orderId || ord.id,
          orderNumber: rec.orderNumber || ord.number,
        });
      });
    });

    return list.sort((a, b) => Date.parse(b.authorizedAt || '') - Date.parse(a.authorizedAt || ''));
  }

  public static getPrinterConfig(): ThermalPrinterConfig {
    const s = this.getState();
    if (!s.printerConfig) {
      s.printerConfig = { ...DEFAULT_PRINTER_CONFIG };
    } else {
      s.printerConfig = { ...DEFAULT_PRINTER_CONFIG, ...s.printerConfig };
    }
    return s.printerConfig;
  }

  public static updatePrinterConfig(config: Partial<ThermalPrinterConfig>): ThermalPrinterConfig {
    const s = this.getState();
    s.printerConfig = {
      ...(s.printerConfig || DEFAULT_PRINTER_CONFIG),
      ...config,
    };
    this.persist();
    return s.printerConfig;
  }

  // ==========================================
  // RECURSO DE COMPONENTES (COMPOSIÇÃO / BOM)
  // Cada Componente tem seu próprio código e
  // associa-se obrigatoriamente a uma Matéria-Prima / Insumo
  // ==========================================
  public static getComponents(): ComponentDefinition[] {
    const s = this.getState();
    if (!s.components || s.components.length === 0) {
      s.components = [...DEFAULT_COMPONENTS];
      this.persist();
    }
    return s.components;
  }

  public static saveComponent(compData: Omit<ComponentDefinition, 'id'> & { id?: string }): ComponentDefinition {
    const s = this.getState();
    if (!s.components) {
      s.components = [...DEFAULT_COMPONENTS];
    }

    const rawMaterial = s.products.find((p) => p.id === compData.rawMaterialId);
    const rawMaterialCode = rawMaterial?.code || compData.rawMaterialCode || '';
    const rawMaterialDescription = rawMaterial?.description || compData.rawMaterialDescription || '';

    let savedComp: ComponentDefinition;
    if (compData.id) {
      const index = s.components.findIndex((c) => c.id === compData.id);
      if (index >= 0) {
        savedComp = {
          ...s.components[index],
          ...compData,
          id: compData.id,
          rawMaterialCode,
          rawMaterialDescription,
        };
        s.components[index] = savedComp;
        this.addAuditLog(
          'EDITAR_COMPONENTE',
          'PRODUCAO',
          savedComp.id,
          `Componente ${savedComp.code} - ${savedComp.name} atualizado (MP Vinculada: ${rawMaterialCode} - ${rawMaterialDescription})`
        );
      } else {
        savedComp = {
          id: compData.id,
          ...compData,
          rawMaterialCode,
          rawMaterialDescription,
          createdAt: new Date().toISOString(),
        };
        s.components.push(savedComp);
        this.addAuditLog(
          'CRIAR_COMPONENTE',
          'PRODUCAO',
          savedComp.id,
          `Componente ${savedComp.code} - ${savedComp.name} cadastrado (MP Vinculada: ${rawMaterialCode} - ${rawMaterialDescription})`
        );
      }
    } else {
      const newId = 'cmp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      savedComp = {
        id: newId,
        ...compData,
        rawMaterialCode,
        rawMaterialDescription,
        createdAt: new Date().toISOString(),
      };
      s.components.push(savedComp);
      this.addAuditLog(
        'CRIAR_COMPONENTE',
        'PRODUCAO',
        savedComp.id,
        `Componente ${savedComp.code} - ${savedComp.name} cadastrado com sucesso (MP Vinculada: ${rawMaterialCode} - ${rawMaterialDescription})`
      );
    }

    // ATUALIZAÇÃO AUTOMÁTICA DE TODOS OS PRODUTOS ACABADOS:
    // Caso a matéria-prima ou insumo do componente seja alterada, todos os produtos acabados
    // que possuem este componente em sua composição têm a matéria-prima e custos atualizados automaticamente.
    let affectedProductsCount = 0;
    const affectedProductNames: string[] = [];
    s.products.forEach((prod) => {
      if (prod.composition && Array.isArray(prod.composition)) {
        let wasProductModified = false;
        prod.composition = prod.composition.map((item) => {
          const isTarget =
            item.componentId === savedComp.id ||
            item.componentCode === savedComp.code ||
            (compData.id && item.componentId === compData.id);

          if (isTarget) {
            wasProductModified = true;
            const newUnitCost = rawMaterial ? rawMaterial.costPrice : item.unitCost;
            return {
              ...item,
              componentId: savedComp.id,
              componentCode: savedComp.code,
              componentDescription: savedComp.name,
              rawMaterialId: savedComp.rawMaterialId,
              rawMaterialCode,
              rawMaterialDescription,
              unit: savedComp.unit,
              unitCost: newUnitCost,
              totalCost: Number((newUnitCost * item.quantity).toFixed(4)),
            };
          }
          return item;
        });

        if (wasProductModified) {
          affectedProductsCount++;
          affectedProductNames.push(prod.description);
          // Recalcular o custo de fabricação do produto acabado
          prod.costPrice = Number(
            prod.composition.reduce((sum, ci) => sum + (ci.totalCost || ci.unitCost * ci.quantity), 0).toFixed(2)
          );
        }
      }
    });

    if (affectedProductsCount > 0) {
      this.addAuditLog(
        'ATUALIZAR_PRODUTOS_COMPONENTE',
        'PRODUCAO',
        savedComp.id,
        `${affectedProductsCount} produto(s) acabado(s) (${affectedProductNames.join(', ')}) atualizados automaticamente com a nova MP e custos do componente ${savedComp.code}.`
      );
    }

    this.persist();
    return savedComp;
  }

  public static deleteComponent(id: string): boolean {
    const s = this.getState();
    if (!s.components) return false;
    const target = s.components.find((c) => c.id === id);
    if (!target) return false;

    // Verificar se algum produto ativo utiliza este componente na composição
    const usedInProduct = s.products.find(
      (p) => p.composition && p.composition.some((item) => item.componentId === id || item.componentCode === target.code)
    );
    if (usedInProduct) {
      throw new Error(`Não é possível excluir: o componente ${target.code} está sendo utilizado na ficha do produto "${usedInProduct.description}".`);
    }

    s.components = s.components.filter((c) => c.id !== id);
    this.addAuditLog(
      'EXCLUIR_COMPONENTE',
      'PRODUCAO',
      id,
      `Componente ${target.code} - ${target.name} removido do sistema`
    );
    this.persist();
    return true;
  }

  // ==========================================
  // FORMAS DE PAGAMENTO (CRUD)
  // ==========================================
  public static getPaymentMethods(): PaymentMethodRecord[] {
    const s = this.getState();
    if (!s.paymentMethods || s.paymentMethods.length === 0) {
      s.paymentMethods = [...DEFAULT_PAYMENT_METHODS];
      this.persist();
    }
    return s.paymentMethods;
  }

  public static savePaymentMethod(
    methodData: Omit<PaymentMethodRecord, 'id' | 'createdAt'> & { id?: string }
  ): PaymentMethodRecord {
    const s = this.getState();
    if (!s.paymentMethods) {
      s.paymentMethods = [...DEFAULT_PAYMENT_METHODS];
    }

    let saved: PaymentMethodRecord;
    if (methodData.id) {
      const idx = s.paymentMethods.findIndex((m) => m.id === methodData.id);
      if (idx >= 0) {
        saved = {
          ...s.paymentMethods[idx],
          ...methodData,
          id: methodData.id,
        };
        s.paymentMethods[idx] = saved;
        this.addAuditLog(
          'EDITAR_FORMA_PAGTO',
          'FINANCEIRO',
          saved.id,
          `Forma de Pagamento ${saved.code} - ${saved.name} atualizada`
        );
      } else {
        saved = {
          ...methodData,
          id: methodData.id,
          createdAt: new Date().toISOString(),
        };
        s.paymentMethods.push(saved);
        this.addAuditLog(
          'CRIAR_FORMA_PAGTO',
          'FINANCEIRO',
          saved.id,
          `Forma de Pagamento ${saved.code} - ${saved.name} cadastrada`
        );
      }
    } else {
      saved = {
        ...methodData,
        id: 'pay-' + Date.now(),
        createdAt: new Date().toISOString(),
      };
      s.paymentMethods.push(saved);
      this.addAuditLog(
        'CRIAR_FORMA_PAGTO',
        'FINANCEIRO',
        saved.id,
        `Forma de Pagamento ${saved.code} - ${saved.name} cadastrada`
      );
    }
    this.persist();
    this.notify();
    return saved;
  }

  public static deletePaymentMethod(id: string): boolean {
    const s = this.getState();
    if (!s.paymentMethods) return false;
    const target = s.paymentMethods.find((m) => m.id === id);
    if (!target) return false;

    s.paymentMethods = s.paymentMethods.filter((m) => m.id !== id);
    this.addAuditLog(
      'EXCLUIR_FORMA_PAGTO',
      'FINANCEIRO',
      id,
      `Forma de Pagamento ${target.code} - ${target.name} removida do sistema`
    );
    this.persist();
    this.notify();
    return true;
  }

  // ==========================================
  // CONTAS FINANCEIRAS / BANCÁRIAS (CRUD)
  // ==========================================
  public static getFinancialAccounts(companyId?: string): FinancialAccountRecord[] {
    const s = this.getState();
    if (!s.financialAccounts || s.financialAccounts.length === 0) {
      s.financialAccounts = [...DEFAULT_FINANCIAL_ACCOUNTS];
      this.persist();
    }
    if (!companyId || companyId === 'todas') {
      return s.financialAccounts;
    }
    const filtered = s.financialAccounts.filter(
      (a) => !a.companyId || a.companyId === 'todas' || a.companyId === companyId
    );
    if (filtered.length > 0) return filtered;
    return s.financialAccounts;
  }

  public static getStockLocations(companyId?: string): StockLocation[] {
    const s = this.getState();
    const locs = (s.stockLocations || []).filter((l) => l.status === 'ativo');
    if (!companyId) return locs;
    return locs.filter((l) => l.companyId === companyId);
  }

  public static getBoletoAccounts(companyId?: string): FinancialAccountRecord[] {
    const accounts = this.getFinancialAccounts(companyId);
    const bankAccounts = accounts.filter(
      (a) => a.status === 'ativo' && (a.type !== 'caixa' || Boolean(a.bankName && a.bankName !== 'Caixa Físico Interno'))
    );
    if (bankAccounts.length > 0) return bankAccounts;
    return accounts.filter((a) => a.status === 'ativo');
  }

  public static saveFinancialAccount(
    accData: Omit<FinancialAccountRecord, 'id' | 'createdAt'> & {
      id?: string;
      createdAt?: string;
      updatedAt?: string;
    }
  ): FinancialAccountRecord {
    const s = this.getState();
    if (!s.financialAccounts) {
      s.financialAccounts = [...DEFAULT_FINANCIAL_ACCOUNTS];
    }

    if (accData.isDefault) {
      s.financialAccounts.forEach((a) => {
        if (!accData.companyId || accData.companyId === 'todas' || !a.companyId || a.companyId === accData.companyId) {
          a.isDefault = false;
        }
      });
    }

    const nowIso = new Date().toISOString();
    let saved: FinancialAccountRecord;
    if (accData.id) {
      const idx = s.financialAccounts.findIndex((a) => a.id === accData.id);
      if (idx >= 0) {
        saved = {
          ...s.financialAccounts[idx],
          ...accData,
          id: accData.id,
          updatedAt: nowIso,
        };
        s.financialAccounts[idx] = saved;
        this.addAuditLog(
          'EDITAR_CONTA_FINANCEIRA',
          'FINANCEIRO',
          saved.id,
          `Conta Financeira ${saved.code} - ${saved.name} atualizada`
        );
      } else {
        saved = {
          ...accData,
          id: accData.id,
          createdAt: accData.createdAt || nowIso,
          updatedAt: nowIso,
        };
        s.financialAccounts.push(saved);
        this.addAuditLog(
          'CRIAR_CONTA_FINANCEIRA',
          'FINANCEIRO',
          saved.id,
          `Conta Financeira ${saved.code} - ${saved.name} cadastrada`
        );
      }
    } else {
      saved = {
        ...accData,
        id: 'acc-' + Date.now(),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      s.financialAccounts.push(saved);
      this.addAuditLog(
        'CRIAR_CONTA_FINANCEIRA',
        'FINANCEIRO',
        saved.id,
        `Conta Financeira ${saved.code} - ${saved.name} cadastrada`
      );
    }
    this.persist();
    this.notify();
    return saved;
  }

  public static deleteFinancialAccount(id: string): boolean {
    const s = this.getState();
    if (!s.financialAccounts) return false;
    const target = s.financialAccounts.find((a) => a.id === id);
    if (!target) return false;

    s.financialAccounts = s.financialAccounts.filter((a) => a.id !== id);
    this.addAuditLog(
      'EXCLUIR_CONTA_FINANCEIRA',
      'FINANCEIRO',
      id,
      `Conta Financeira ${target.code} - ${target.name} removida`
    );
    this.persist();
    this.notify();
    return true;
  }

  // ==========================================
  // PLANO DE CONTAS INDUSTRIAL E COMERCIAL (CRUD & CONSULTA)
  // ==========================================
  public static getChartOfAccounts(companyId?: string): ChartOfAccount[] {
    const s = this.getState();
    if (!s.chartOfAccounts || s.chartOfAccounts.length === 0) {
      s.chartOfAccounts = [...DEFAULT_CHART_OF_ACCOUNTS];
      this.persist();
    }
    const accounts = [...s.chartOfAccounts].sort((a, b) => a.order - b.order || a.hierarchicalCode.localeCompare(b.hierarchicalCode));
    if (!companyId || companyId === 'todos') {
      return accounts;
    }
    return accounts.filter((a) => !a.companyId || a.companyId === 'todos' || a.companyId === companyId);
  }

  public static findAccountByLaunchCode(launchCode: string, companyId?: string): ChartOfAccount | undefined {
    if (!launchCode || !launchCode.trim()) return undefined;
    const cleanCode = launchCode.trim().padStart(3, '0');
    const accounts = this.getChartOfAccounts(companyId);
    return accounts.find((a) => a.type === 'analitica' && a.status === 'ativo' && a.launchCode === cleanCode);
  }

  public static findAccountByHierarchicalCode(code: string): ChartOfAccount | undefined {
    if (!code) return undefined;
    const accounts = this.getChartOfAccounts();
    return accounts.find((a) => a.hierarchicalCode === code.trim());
  }

  public static saveChartOfAccount(account: ChartOfAccount): { success: boolean; error?: string } {
    const s = this.getState();
    if (!s.chartOfAccounts) {
      s.chartOfAccounts = [...DEFAULT_CHART_OF_ACCOUNTS];
    }

    // Validação de código de lançamento para analíticas
    if (account.type === 'analitica') {
      if (!account.launchCode || !/^\d{3}$/.test(account.launchCode.trim())) {
        return { success: false, error: 'O código de lançamento deve conter exatamente 3 dígitos numéricos (ex: 101).' };
      }
      account.launchCode = account.launchCode.trim();

      // Verificar duplicidade de código de lançamento
      const duplicateLaunch = s.chartOfAccounts.find(
        (a) => a.id !== account.id && a.type === 'analitica' && a.launchCode === account.launchCode
      );
      if (duplicateLaunch) {
        return { success: false, error: `O código de lançamento "${account.launchCode}" já está em uso pela conta "${duplicateLaunch.name}".` };
      }
    } else {
      account.launchCode = undefined;
    }

    // Verificar duplicidade de código hierárquico
    const duplicateHierarchical = s.chartOfAccounts.find(
      (a) => a.id !== account.id && a.hierarchicalCode === account.hierarchicalCode.trim()
    );
    if (duplicateHierarchical) {
      return { success: false, error: `O código hierárquico "${account.hierarchicalCode}" já está cadastrado.` };
    }

    const idx = s.chartOfAccounts.findIndex((a) => a.id === account.id);
    if (idx >= 0) {
      s.chartOfAccounts[idx] = { ...account };
      this.addAuditLog('EDITAR_PLANO_CONTAS', 'FINANCEIRO', account.id, `Conta ${account.hierarchicalCode} - ${account.name} atualizada`);
    } else {
      s.chartOfAccounts.push({ ...account });
      this.addAuditLog('CRIAR_PLANO_CONTAS', 'FINANCEIRO', account.id, `Conta ${account.hierarchicalCode} - ${account.name} cadastrada`);
    }

    this.persist();
    this.notify();
    return { success: true };
  }

  public static deleteChartOfAccount(id: string): { success: boolean; error?: string } {
    const s = this.getState();
    if (!s.chartOfAccounts) return { success: false, error: 'Plano de contas vazio.' };

    const target = s.chartOfAccounts.find((a) => a.id === id);
    if (!target) return { success: false, error: 'Conta não encontrada.' };

    // Verificar se possui subcontas dependentes
    const hasChildren = s.chartOfAccounts.some((a) => a.parentCode === target.hierarchicalCode);
    if (hasChildren) {
      return { success: false, error: 'Não é possível excluir uma conta que possui subcontas vinculadas.' };
    }

    // Verificar se existem despesas no Contas a Pagar utilizando esta conta
    const isInUse = (s.accountsPayable || []).some((p) => p.chartAccountId === id || p.launchCode === target.launchCode);
    if (isInUse) {
      return { success: false, error: 'Esta conta possui lançamentos financeiros vinculados e não pode ser excluída. Recomendamos inativá-la.' };
    }

    s.chartOfAccounts = s.chartOfAccounts.filter((a) => a.id !== id);
    this.addAuditLog('EXCLUIR_PLANO_CONTAS', 'FINANCEIRO', id, `Conta ${target.hierarchicalCode} - ${target.name} removida`);
    this.persist();
    this.notify();
    return { success: true };
  }

  // ==========================================
  // HISTÓRICO DE IMPORTAÇÃO DE NF-e & DE-PARA INTELIGENTE
  // ==========================================
  public static getNfeImportHistory(companyId?: string): NfeImportRecord[] {
    const s = this.getState();
    const list = s.nfeImportHistory || [];
    if (!companyId || companyId === 'todas') {
      return [...list].sort((a, b) => new Date(b.importDate).getTime() - new Date(a.importDate).getTime());
    }
    return list
      .filter((r) => r.companyId === companyId)
      .sort((a, b) => new Date(b.importDate).getTime() - new Date(a.importDate).getTime());
  }

  public static addNfeImportRecord(record: NfeImportRecord): void {
    const s = this.getState();
    if (!s.nfeImportHistory) {
      s.nfeImportHistory = [];
    }
    s.nfeImportHistory.unshift(record);
    this.persist();
    this.notify();
  }

  public static findNfeByAccessKey(accessKey: string, companyId?: string): NfeImportRecord | undefined {
    if (!accessKey) return undefined;
    const cleanKey = accessKey.replace(/\D/g, '');
    const s = this.getState();
    const list = s.nfeImportHistory || [];
    return list.find((r) => {
      const matchKey = r.accessKey.replace(/\D/g, '') === cleanKey;
      if (!matchKey) return false;
      if (companyId && companyId !== 'todas') {
        return r.companyId === companyId;
      }
      return true;
    });
  }

  public static getSupplierProductMappings(supplierCnpj?: string): SupplierProductMapping[] {
    const s = this.getState();
    const list = s.supplierProductMappings || [];
    if (!supplierCnpj) return list;
    const cleanCnpj = supplierCnpj.replace(/\D/g, '');
    return list.filter((m) => m.supplierCnpj.replace(/\D/g, '') === cleanCnpj);
  }

  public static getSupplierProductMapping(supplierCnpj: string, supplierProdCode: string): SupplierProductMapping | undefined {
    if (!supplierCnpj || !supplierProdCode) return undefined;
    const cleanCnpj = supplierCnpj.replace(/\D/g, '');
    const cleanCode = supplierProdCode.trim();
    const s = this.getState();
    const list = s.supplierProductMappings || [];
    return list.find((m) => m.supplierCnpj.replace(/\D/g, '') === cleanCnpj && m.supplierProdCode === cleanCode);
  }

  public static saveSupplierProductMapping(mapping: SupplierProductMapping): void {
    const s = this.getState();
    if (!s.supplierProductMappings) {
      s.supplierProductMappings = [];
    }
    const cleanCnpj = mapping.supplierCnpj.replace(/\D/g, '');
    const cleanCode = mapping.supplierProdCode.trim();
    const idx = s.supplierProductMappings.findIndex(
      (m) => m.supplierCnpj.replace(/\D/g, '') === cleanCnpj && m.supplierProdCode === cleanCode
    );
    if (idx >= 0) {
      s.supplierProductMappings[idx] = { ...mapping, lastUsedAt: new Date().toISOString() };
    } else {
      s.supplierProductMappings.push({ ...mapping, lastUsedAt: new Date().toISOString() });
    }
    this.persist();
  }

  // ==========================================
  // DETECÇÃO & UNIFICAÇÃO DE PRODUTOS DUPLICADOS
  // ==========================================
  public static findDuplicateProducts(): { primary: Product; duplicates: Product[]; reason: string }[] {
    const s = this.getState();
    const products = s.products || [];
    const results: { primary: Product; duplicates: Product[]; reason: string }[] = [];
    const processedIds = new Set<string>();

    const norm = (str?: string) => {
      if (!str) return '';
      return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    for (let i = 0; i < products.length; i++) {
      const p1 = products[i];
      if (processedIds.has(p1.id)) continue;

      const duplicates = products.filter((p2) => {
        if (p2.id === p1.id || processedIds.has(p2.id)) return false;

        // Mesmo código (não vazio)
        const code1 = p1.code.trim().toLowerCase();
        const code2 = p2.code.trim().toLowerCase();
        const sameCode = code1 && code2 && code1 === code2;

        // Mesmo código de barras (não vazio)
        const bar1 = p1.barcode ? p1.barcode.trim() : '';
        const bar2 = p2.barcode ? p2.barcode.trim() : '';
        const sameBarcode = bar1 && bar2 && bar1 === bar2;

        // Mesma descrição normalizada e mesma unidade
        const norm1 = norm(p1.description);
        const norm2 = norm(p2.description);
        const sameDesc = norm1.length >= 3 && norm1 === norm2 && p1.unit === p2.unit;

        return sameCode || sameBarcode || sameDesc;
      });

      if (duplicates.length > 0) {
        duplicates.forEach((d) => processedIds.add(d.id));
        processedIds.add(p1.id);

        let reason = 'Cadastro duplicado';
        if (duplicates.some((d) => d.code.trim().toLowerCase() === p1.code.trim().toLowerCase())) {
          reason = `Código em duplicidade (${p1.code})`;
        } else if (duplicates.some((d) => d.barcode && d.barcode.trim() === p1.barcode?.trim())) {
          reason = `Código de barras duplicado (${p1.barcode})`;
        } else {
          reason = `Descrição idêntica (${p1.description} - ${p1.unit})`;
        }

        results.push({
          primary: p1,
          duplicates,
          reason,
        });
      }
    }

    return results;
  }

  public static mergeDuplicateProducts(): { mergedCount: number; affectedCount: number; affectedNames: string[] } {
    const groups = this.findDuplicateProducts();
    if (groups.length === 0) {
      return { mergedCount: 0, affectedCount: 0, affectedNames: [] };
    }

    const s = this.getState();
    let totalDuplicatesRemoved = 0;
    const affectedNames: string[] = [];

    groups.forEach(({ primary, duplicates }) => {
      const duplicateIds = new Set(duplicates.map((d) => d.id));
      totalDuplicatesRemoved += duplicates.length;
      affectedNames.push(`${primary.code} - ${primary.description}`);

      // 1. Unificar saldos de estoque por local
      duplicates.forEach((dup) => {
        const dupBalances = s.stockBalances.filter((b) => b.productId === dup.id);
        dupBalances.forEach((dupBal) => {
          const primBal = s.stockBalances.find(
            (b) => b.productId === primary.id && b.locationId === dupBal.locationId
          );
          if (primBal) {
            primBal.quantity += dupBal.quantity;
            primBal.reserved += dupBal.reserved;
          } else {
            s.stockBalances.push({
              ...dupBal,
              productId: primary.id,
            });
          }
        });
      });
      // Remover os saldos dos duplicados
      s.stockBalances = s.stockBalances.filter((b) => !duplicateIds.has(b.productId));

      // 2. Atualizar movimentações de estoque
      s.stockMovements.forEach((mov) => {
        if (duplicateIds.has(mov.productId)) {
          mov.productId = primary.id;
          mov.productCode = primary.code;
          mov.productDescription = primary.description;
        }
      });

      // 3. Atualizar itens de pedidos de venda
      s.orders.forEach((ord) => {
        ord.items.forEach((item) => {
          if (duplicateIds.has(item.productId)) {
            item.productId = primary.id;
            item.productCode = primary.code;
            item.description = primary.description;
          }
        });
      });

      // 4. Atualizar itens de pedidos de compra
      s.purchaseOrders.forEach((po) => {
        po.items.forEach((item) => {
          if (duplicateIds.has(item.productId)) {
            item.productId = primary.id;
            item.productCode = primary.code;
            item.description = primary.description;
          }
        });
      });

      // 5. Atualizar vínculos de fornecedor/produto
      if (s.supplierProductMappings) {
        s.supplierProductMappings.forEach((m) => {
          if (duplicateIds.has(m.systemProductId)) {
            m.systemProductId = primary.id;
          }
        });
      }

      // 6. Remover os produtos duplicados
      s.products = s.products.filter((p) => !duplicateIds.has(p.id));
    });

    this.addAuditLog(
      'MESCLAR_PRODUTOS_DUPLICADOS',
      'ESTOQUE',
      'CATALOGO',
      `Unificação de ${totalDuplicatesRemoved} produto(s) duplicado(s) concluída com sucesso. Itens unificados: ${affectedNames.slice(0, 5).join(', ')}`
    );

    this.persist();
    this.notify();
    return {
      mergedCount: totalDuplicatesRemoved,
      affectedCount: groups.length,
      affectedNames,
    };
  }

  // ==========================================
  // CONTAS A RECEBER & CONTAS A PAGAR (EXCLUSÃO)
  // ==========================================
  public static deleteAccountReceivable(id: string): boolean {
    const s = this.getState();
    if (!s.accountsReceivable) return false;
    const exists = s.accountsReceivable.find((r) => r.id === id);
    if (!exists) return false;
    s.accountsReceivable = s.accountsReceivable.filter((r) => r.id !== id);
    this.addAuditLog(
      'EXCLUIR_CONTAS_RECEBER',
      'FINANCEIRO',
      id,
      `Título a receber ${exists.docNumber} (${exists.customerName}) removido.`
    );
    this.persist();
    this.notify();
    return true;
  }

  public static deleteAccountPayable(id: string): boolean {
    const s = this.getState();
    if (!s.accountsPayable) return false;
    const exists = s.accountsPayable.find((p) => p.id === id);
    if (!exists) return false;
    s.accountsPayable = s.accountsPayable.filter((p) => p.id !== id);
    this.addAuditLog(
      'EXCLUIR_CONTAS_PAGAR',
      'FINANCEIRO',
      id,
      `Conta a pagar ${exists.docNumber} (${exists.description}) removida.`
    );
    this.persist();
    this.notify();
    return true;
  }

  // ==========================================
  // FINANCEIRO: VALE (CRÉDITOS DE CLIENTES)
  // ==========================================
  public static getCustomerVouchers(companyId?: string): CustomerVoucher[] {
    const s = this.getState();
    const list = s.customerVouchers || [];
    if (!companyId) return list;
    return list.filter((v) => !v.companyId || v.companyId === companyId);
  }

  public static getAvailableVouchersByCustomer(customerId: string, companyId?: string): CustomerVoucher[] {
    if (!customerId) return [];
    const todayStr = new Date().toISOString().split('T')[0];
    return this.getCustomerVouchers(companyId)
      .filter(
        (v) =>
          v.customerId === customerId &&
          (v.status === 'ativo' || v.status === 'utilizado_parcial') &&
          v.remainingBalance > 0.009 &&
          (!v.expirationDate || v.expirationDate >= todayStr)
      )
      .sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  }

  public static getCustomerAvailableVoucherBalance(customerId: string, companyId?: string): number {
    if (!customerId) return 0;
    const total = this.getAvailableVouchersByCustomer(customerId, companyId).reduce(
      (sum, v) => sum + (Number(v.remainingBalance) || 0),
      0
    );
    return Math.round(total * 100) / 100;
  }

  public static generateNextVoucherCode(): string {
    const s = this.getState();
    const year = new Date().getFullYear();
    const existing = s.customerVouchers || [];
    let maxSeq = 0;
    existing.forEach((v) => {
      const m = v.code.match(/VALE-\d{4}-(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
      }
    });
    const nextNum = String(maxSeq + 1).padStart(4, '0');
    return `VALE-${year}-${nextNum}`;
  }

  /**
   * Gera o próximo código sequencial de produto baseado no maior número já cadastrado
   * para o prefixo informado (ex.: PROD-539 -> PROD-540, CX-005 -> CX-006).
   */
  public static generateNextProductCode(
    prefix: string = 'PROD',
    productsList?: Product[]
  ): string {
    const cleanPrefix = prefix.trim().toUpperCase();
    const products = productsList ?? this.getState().products ?? [];
    const existingCodes = new Set(
      products.map((p) => String(p.code ?? '').trim().toUpperCase())
    );

    const escapedPrefix = cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escapedPrefix}-(\\d+)$`, 'i');

    let maxSeq = 0;
    let padWidth = 3;

    products.forEach((p) => {
      const code = String(p.code ?? '').trim();
      const match = code.match(pattern);
      if (match) {
        const digits = match[1];
        const parsed = parseInt(digits, 10);
        if (!Number.isNaN(parsed) && parsed > maxSeq) {
          maxSeq = parsed;
          padWidth = Math.max(3, digits.length);
        }
      }
    });

    let nextSeq = maxSeq + 1;
    let candidate = `${cleanPrefix}-${String(nextSeq).padStart(padWidth, '0')}`;
    while (existingCodes.has(candidate.toUpperCase())) {
      nextSeq++;
      candidate = `${cleanPrefix}-${String(nextSeq).padStart(padWidth, '0')}`;
    }

    return candidate;
  }

  public static saveCustomerVoucher(
    data: Partial<CustomerVoucher> & {
      customerId: string;
      originalAmount: number;
      reason: string;
      origin?: CustomerVoucherOrigin;
      issueDate?: string;
      expirationDate?: string;
      notes?: string;
      companyId?: string;
    }
  ): CustomerVoucher {
    const s = this.getState();
    if (!s.customerVouchers) s.customerVouchers = [];

    const nowIso = new Date().toISOString();
    const company =
      s.companies.find((c) => c.id === (data.companyId || s.currentCompanyId)) || s.companies[0];
    const customer = s.customers.find((c) => c.id === data.customerId);
    const currentUser = this.getCurrentUser();

    const originalAmount = Math.round((Number(data.originalAmount) || 0) * 100) / 100;

    if (data.id) {
      const idx = s.customerVouchers.findIndex((v) => v.id === data.id);
      if (idx >= 0) {
        const prev = s.customerVouchers[idx];
        const usedAmount = Math.round((Number(prev.usedAmount) || 0) * 100) / 100;
        const nextOriginal = Math.max(usedAmount, originalAmount);
        const nextRemaining = Math.max(0, Math.round((nextOriginal - usedAmount) * 100) / 100);
        const nextStatus: CustomerVoucher['status'] =
          prev.status === 'cancelado'
            ? 'cancelado'
            : nextRemaining <= 0.009
            ? 'utilizado_total'
            : usedAmount > 0
            ? 'utilizado_parcial'
            : 'ativo';

        const updated: CustomerVoucher = {
          ...prev,
          customerId: customer?.id || prev.customerId,
          customerCode: customer?.code || prev.customerCode,
          customerName: customer?.name || data.customerName || prev.customerName,
          customerCpfCnpj: customer?.cpfCnpj || prev.customerCpfCnpj,
          origin: data.origin || prev.origin,
          reason: data.reason.trim(),
          issueDate: data.issueDate || prev.issueDate,
          expirationDate: data.expirationDate || undefined,
          originalAmount: nextOriginal,
          remainingBalance: nextRemaining,
          status: nextStatus,
          notes: data.notes !== undefined ? data.notes : prev.notes,
          updatedAt: nowIso,
        };
        s.customerVouchers[idx] = updated;
        this.addAuditLog(
          'EDITAR_VALE_CLIENTE',
          'FINANCEIRO',
          updated.id,
          `Vale ${updated.code} (${updated.customerName}) atualizado. Valor: R$ ${updated.originalAmount.toFixed(2)}, Saldo: R$ ${updated.remainingBalance.toFixed(2)}.`
        );
        this.persist();
        this.notify();
        return updated;
      }
    }

    const newVoucher: CustomerVoucher = {
      id: 'VALE-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      code: this.generateNextVoucherCode(),
      companyId: company?.id || s.currentCompanyId,
      companyName: company?.tradeName || company?.name,
      customerId: data.customerId,
      customerCode: customer?.code,
      customerName: customer?.name || data.customerName || 'Cliente',
      customerCpfCnpj: customer?.cpfCnpj,
      origin: data.origin || 'credito_comercial',
      reason: data.reason.trim(),
      issueDate: data.issueDate || nowIso.split('T')[0],
      expirationDate: data.expirationDate || undefined,
      originalAmount,
      usedAmount: 0,
      remainingBalance: originalAmount,
      status: 'ativo',
      notes: data.notes?.trim() || undefined,
      usages: [],
      userId: currentUser.id,
      userName: currentUser.name,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    s.customerVouchers = [newVoucher, ...s.customerVouchers];
    this.addAuditLog(
      'CADASTRAR_VALE_CLIENTE',
      'FINANCEIRO',
      newVoucher.id,
      `Vale ${newVoucher.code} emitido para ${newVoucher.customerName} no valor de R$ ${newVoucher.originalAmount.toFixed(2)} (${newVoucher.reason}).`
    );
    this.persist();
    this.notify();
    return newVoucher;
  }

  public static cancelCustomerVoucher(voucherId: string, cancelReason?: string): CustomerVoucher | null {
    const s = this.getState();
    if (!s.customerVouchers) return null;
    const idx = s.customerVouchers.findIndex((v) => v.id === voucherId);
    if (idx < 0) return null;

    const prev = s.customerVouchers[idx];
    const nowIso = new Date().toISOString();
    const updated: CustomerVoucher = {
      ...prev,
      status: 'cancelado',
      notes: cancelReason
        ? `${prev.notes ? prev.notes + ' | ' : ''}Cancelado: ${cancelReason}`
        : prev.notes,
      updatedAt: nowIso,
    };
    s.customerVouchers[idx] = updated;
    this.addAuditLog(
      'CANCELAR_VALE_CLIENTE',
      'FINANCEIRO',
      updated.id,
      `Vale ${updated.code} (${updated.customerName}) cancelado.${cancelReason ? ' Motivo: ' + cancelReason : ''}`
    );
    this.persist();
    this.notify();
    return updated;
  }

  public static deleteCustomerVoucher(voucherId: string): boolean {
    const s = this.getState();
    if (!s.customerVouchers) return false;
    const target = s.customerVouchers.find((v) => v.id === voucherId);
    if (!target) return false;
    s.customerVouchers = s.customerVouchers.filter((v) => v.id !== voucherId);
    this.addAuditLog(
      'EXCLUIR_VALE_CLIENTE',
      'FINANCEIRO',
      voucherId,
      `Vale ${target.code} (${target.customerName}) excluído.`
    );
    this.persist();
    this.notify();
    return true;
  }

  public static applyVoucherToReceivable(
    receivableId: string,
    voucherId: string,
    amountToApply: number,
    notes?: string
  ): { success: boolean; message: string; voucher?: CustomerVoucher; receivable?: AccountReceivable } {
    const s = this.getState();
    const recIdx = (s.accountsReceivable || []).findIndex((r) => r.id === receivableId);
    if (recIdx < 0) {
      return { success: false, message: 'Título a receber não encontrado.' };
    }
    const rec = s.accountsReceivable[recIdx];
    if (rec.status === 'recebido' || rec.balance <= 0.009) {
      return { success: false, message: 'Este título já foi totalmente liquidado.' };
    }

    const vIdx = (s.customerVouchers || []).findIndex((v) => v.id === voucherId);
    if (vIdx < 0 || !s.customerVouchers) {
      return { success: false, message: 'Vale selecionado não encontrado.' };
    }
    const voucher = s.customerVouchers[vIdx];
    if (voucher.status === 'cancelado' || voucher.remainingBalance <= 0.009) {
      return { success: false, message: 'Este Vale não possui saldo disponível para utilização.' };
    }

    const requested = Math.round((Number(amountToApply) || 0) * 100) / 100;
    const maxAllowed = Math.min(rec.balance, voucher.remainingBalance);
    if (requested <= 0 || requested > maxAllowed + 0.009) {
      return {
        success: false,
        message: `Valor inválido. O máximo permitido para este Vale e título é R$ ${maxAllowed.toFixed(2)}.`,
      };
    }

    const effectiveAmount = Math.min(requested, maxAllowed);
    const nowIso = new Date().toISOString();
    const currentUser = this.getCurrentUser();

    const usageEntry: CustomerVoucherUsage = {
      id: 'VUSE-' + Date.now(),
      date: nowIso,
      amount: effectiveAmount,
      receivableId: rec.id,
      receivableDocNumber: rec.docNumber,
      userId: currentUser.id,
      userName: currentUser.name,
      notes: notes?.trim() || `Baixa no título ${rec.docNumber}`,
    };

    const nextUsed = Math.round((voucher.usedAmount + effectiveAmount) * 100) / 100;
    const nextRemaining = Math.max(0, Math.round((voucher.originalAmount - nextUsed) * 100) / 100);
    const nextVoucherStatus: CustomerVoucher['status'] =
      nextRemaining <= 0.009 ? 'utilizado_total' : 'utilizado_parcial';

    const updatedVoucher: CustomerVoucher = {
      ...voucher,
      usedAmount: nextUsed,
      remainingBalance: nextRemaining,
      status: nextVoucherStatus,
      usages: [usageEntry, ...(voucher.usages || [])],
      updatedAt: nowIso,
    };
    s.customerVouchers[vIdx] = updatedVoucher;

    const newPaidVal = Math.round((rec.paidValue + effectiveAmount) * 100) / 100;
    const newBalance = Math.max(0, Math.round((rec.originalValue - newPaidVal) * 100) / 100);
    const newRecStatus: AccountReceivable['status'] = newBalance <= 0.009 ? 'recebido' : 'parcial';

    const updatedRec: AccountReceivable = {
      ...rec,
      paidValue: newPaidVal,
      balance: newBalance,
      status: newRecStatus,
      receipts: [
        ...(rec.receipts || []),
        {
          date: nowIso,
          amount: effectiveAmount,
          method: `Vale (${voucher.code})`,
          userId: currentUser.id,
          notes: `Baixa por Vale ${voucher.code} realizada por ${currentUser.name}${notes ? ' - ' + notes : ''}`,
        },
      ],
    };
    s.accountsReceivable[recIdx] = updatedRec;

    this.addAuditLog(
      'BAIXA_RECEBER_COM_VALE',
      'FINANCEIRO',
      rec.id,
      `Baixa de R$ ${effectiveAmount.toFixed(2)} no título ${rec.docNumber} (${rec.customerName}) utilizando Vale ${voucher.code}. Saldo restante do Vale: R$ ${nextRemaining.toFixed(2)}.`
    );

    this.persist();
    this.notify();
    return {
      success: true,
      message: 'Baixa realizada com Vale de Cliente com sucesso.',
      voucher: updatedVoucher,
      receivable: updatedRec,
    };
  }

  // ==========================================
  // PRAZOS DE PAGAMENTO (CRUD)
  // ==========================================
  public static getPaymentTermsList(companyId?: string): PaymentTermRecord[] {
    const s = this.getState();
    if (!s.paymentTermsList || s.paymentTermsList.length === 0) {
      s.paymentTermsList = [...DEFAULT_PAYMENT_TERMS];
      this.persist();
    }
    if (companyId) {
      return s.paymentTermsList.filter(
        (t) => t.isSystemDefault || !t.companyId || t.companyId === companyId
      );
    }
    return s.paymentTermsList;
  }

  public static savePaymentTerm(
    termData: Omit<PaymentTermRecord, 'id' | 'createdAt'> & { id?: string }
  ): PaymentTermRecord {
    const s = this.getState();
    if (!s.paymentTermsList) {
      s.paymentTermsList = [...DEFAULT_PAYMENT_TERMS];
    }

    const nowIso = new Date().toISOString();
    let saved: PaymentTermRecord;
    if (termData.id) {
      const idx = s.paymentTermsList.findIndex((t) => t.id === termData.id);
      if (idx >= 0) {
        saved = {
          ...s.paymentTermsList[idx],
          ...termData,
          id: termData.id,
          updatedAt: nowIso,
        };
        s.paymentTermsList[idx] = saved;
        this.addAuditLog(
          'EDITAR_PRAZO_PAGTO',
          'FINANCEIRO',
          saved.id,
          `Prazo de Pagamento ${saved.code} - ${saved.name} atualizado`
        );
      } else {
        saved = {
          ...termData,
          id: termData.id,
          isSystemDefault: termData.isSystemDefault ?? false,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        s.paymentTermsList.push(saved);
        this.addAuditLog(
          'CRIAR_PRAZO_PAGTO',
          'FINANCEIRO',
          saved.id,
          `Prazo de Pagamento ${saved.code} - ${saved.name} cadastrado`
        );
      }
    } else {
      saved = {
        ...termData,
        id: 'term-' + Date.now(),
        isSystemDefault: termData.isSystemDefault ?? true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      s.paymentTermsList.push(saved);
      this.addAuditLog(
        'CRIAR_PRAZO_PAGTO',
        'FINANCEIRO',
        saved.id,
        `Prazo de Pagamento ${saved.code} - ${saved.name} cadastrado`
      );
    }
    this.persist();
    this.notify();
    return saved;
  }

  public static setPaymentTermAsSystemDefault(id: string, isSystemDefault: boolean): boolean {
    const s = this.getState();
    if (!s.paymentTermsList) return false;
    const idx = s.paymentTermsList.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    s.paymentTermsList[idx] = {
      ...s.paymentTermsList[idx],
      isSystemDefault,
      updatedAt: new Date().toISOString(),
    };
    this.addAuditLog(
      'PADRAO_PRAZO_PAGTO',
      'FINANCEIRO',
      id,
      `Prazo "${s.paymentTermsList[idx].name}" ${isSystemDefault ? 'definido como Padrão do Sistema' : 'removido dos padrões globais'}`
    );
    this.persist();
    this.notify();
    return true;
  }

  public static restoreDefaultPaymentTerms(): number {
    const s = this.getState();
    if (!s.paymentTermsList) {
      s.paymentTermsList = [];
    }
    const existingIds = new Set(s.paymentTermsList.map((t) => t.id));
    const missing = DEFAULT_PAYMENT_TERMS.filter((d) => !existingIds.has(d.id));
    if (missing.length > 0) {
      s.paymentTermsList = [...missing, ...s.paymentTermsList];
      this.addAuditLog(
        'RESTAURAR_PRAZOS_PADRAO',
        'FINANCEIRO',
        'SISTEMA',
        `${missing.length} prazo(s) padrão do sistema restaurado(s)`
      );
      this.persist();
      this.notify();
    }
    return missing.length;
  }

  public static resolvePaymentTermInfo(
    termValue: string,
    fallbackInstallments: number = 1
  ): {
    label: string;
    installmentsCount: number;
    daysOffsets: number[];
    termRecord?: PaymentTermRecord;
  } {
    const raw = (termValue || '').trim();
    const norm = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');

    const list = this.getPaymentTermsList();
    const matched = list.find(
      (t) =>
        t.id.toLowerCase() === raw.toLowerCase() ||
        t.code.toLowerCase() === raw.toLowerCase() ||
        t.id.toLowerCase() === norm ||
        t.code.toLowerCase() === norm ||
        (norm === 'a_vista' && (t.code === 'A_VISTA' || t.id === 'term-avista')) ||
        (norm === '14_dias' && (t.code === '14D' || t.id === 'term-14d')) ||
        (norm === '28_dias' && (t.code === '28D' || t.id === 'term-28d')) ||
        (norm === '30_dias' && (t.code === '30D' || t.id === 'term-30d')) ||
        (norm === '30_60_dias' && (t.code === '30_60D' || t.id === 'term-30-60')) ||
        (norm === '30_60_90_dias' && (t.code === '30_60_90D' || t.id === 'term-30-60-90'))
    );

    if (matched) {
      const parsedDays = (matched.daysIntervals || '0')
        .split(/[,;/]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 0);
      const count = Math.max(1, matched.installmentsCount || parsedDays.length || fallbackInstallments || 1);
      const offsets: number[] = [];
      for (let i = 0; i < count; i++) {
        offsets.push(parsedDays[i] !== undefined ? parsedDays[i] : (i + 1) * 30);
      }
      return {
        label: matched.name,
        installmentsCount: count,
        daysOffsets: offsets,
        termRecord: matched,
      };
    }

    const legacyCount = Math.max(1, fallbackInstallments || 1);
    const defaultOffsets = Array.from({ length: legacyCount }, (_, idx) => (idx + 1) * 30);
    if (norm === '15_dias' || norm === '15dias') {
      return { label: '15 Dias Direto', installmentsCount: 1, daysOffsets: [15] };
    }
    if (norm === 'a_vista' || norm === 'avista' || norm === 'vista') {
      return { label: 'À Vista / Imediato', installmentsCount: 1, daysOffsets: [0] };
    }
    if (norm === 'parcelado') {
      return { label: 'Parcelado', installmentsCount: legacyCount, daysOffsets: defaultOffsets };
    }
    if (norm === 'personalizado') {
      return { label: 'Personalizado / A Combinar', installmentsCount: legacyCount, daysOffsets: defaultOffsets };
    }
    return {
      label: raw ? raw.replace(/_/g, ' ') : 'Não informado',
      installmentsCount: legacyCount,
      daysOffsets: defaultOffsets,
    };
  }

  public static deletePaymentTerm(id: string): boolean {
    const s = this.getState();
    if (!s.paymentTermsList) return false;
    const target = s.paymentTermsList.find((t) => t.id === id);
    if (!target) return false;

    s.paymentTermsList = s.paymentTermsList.filter((t) => t.id !== id);
    this.addAuditLog(
      'EXCLUIR_PRAZO_PAGTO',
      'FINANCEIRO',
      id,
      `Prazo de Pagamento ${target.code} - ${target.name} removido`
    );
    this.persist();
    this.notify();
    return true;
  }


  public static isOverdueAlertHidden(): boolean {
    const s = this.getState();
    if (typeof s.hideOverdueAlert === 'boolean') {
      return s.hideOverdueAlert;
    }
    const stored = localStorage.getItem('gestaofacil_hide_overdue_alert');
    return stored === 'true';
  }

  public static setHideOverdueAlert(hidden: boolean): boolean {
    const s = this.getState();
    s.hideOverdueAlert = hidden;
    localStorage.setItem('gestaofacil_hide_overdue_alert', String(hidden));
    this.persist();
    this.notify();
    return hidden;
  }

  // ==========================================
  // CONFIGURAÇÃO DE CONTROLE DE ESTOQUE POR EMPRESA
  // Permite ativar/desativar controle e vender com saldo negativo
  // ==========================================
  public static getStockControlConfig(): StockControlConfig {
    const s = this.getState();
    if (!s.stockControlConfig) {
      s.stockControlConfig = { ...DEFAULT_STOCK_CONTROL_CONFIG };
      this.persist();
    }
    return {
      enableStockControl: s.stockControlConfig.enableStockControl !== false,
      allowNegativeStock: !!s.stockControlConfig.allowNegativeStock,
    };
  }

  public static updateStockControlConfig(config: Partial<StockControlConfig>): StockControlConfig {
    const s = this.getState();
    const current = this.getStockControlConfig();
    const updated: StockControlConfig = {
      ...current,
      ...config,
    };
    s.stockControlConfig = updated;
    this.addAuditLog(
      'CONFIG_ESTOQUE_ATUALIZADA',
      'ESTOQUE',
      'CONFIG',
      `Parâmetros de estoque: Controle ${updated.enableStockControl ? 'ATIVO' : 'DESATIVADO'}, Venda com estoque negativo ${updated.allowNegativeStock ? 'PERMITIDA' : 'BLOQUEADA'}`
    );
    this.persist();
    this.notify();
    return updated;
  }

  public static isStockControlEnabled(): boolean {
    return this.getStockControlConfig().enableStockControl;
  }

  public static canSellNegativeStock(): boolean {
    const cfg = this.getStockControlConfig();
    return !cfg.enableStockControl || cfg.allowNegativeStock;
  }

  public static getStockBalances(companyId?: string): ProductStockBalance[] {
    const s = this.getState();
    const balances = s.stockBalances || [];
    if (!companyId) return balances;
    const companyLocIds = new Set(
      (s.stockLocations || []).filter((l) => l.companyId === companyId).map((l) => l.id)
    );
    return balances.filter((b) => companyLocIds.has(b.locationId) || b.companyId === companyId);
  }

  /**
   * Obtém o preço de venda do produto para a empresa indicada (ou empresa atual).
   * Se a filial não tiver preço individual customizado, herda automaticamente o preço base da Matriz (salePrice).
   */
  public static getProductPriceForCompany(product: Product, companyId?: string): number {
    if (!product) return 0;
    const targetCompId = companyId || this.getCurrentCompany()?.id;
    if (targetCompId && product.companyPrices && product.companyPrices[targetCompId]) {
      const override = product.companyPrices[targetCompId];
      if (typeof override.salePrice === 'number' && override.salePrice > 0) {
        return override.salePrice;
      }
    }
    return product.salePrice ?? 0;
  }

  /**
   * Obtém o preço de custo do produto para a empresa indicada (ou empresa atual).
   * Se a filial não tiver custo individual customizado, herda o custo base da Matriz (costPrice).
   */
  public static getProductCostForCompany(product: Product, companyId?: string): number {
    if (!product) return 0;
    const targetCompId = companyId || this.getCurrentCompany()?.id;
    if (targetCompId && product.companyPrices && product.companyPrices[targetCompId]) {
      const override = product.companyPrices[targetCompId];
      if (typeof override.costPrice === 'number' && override.costPrice > 0) {
        return override.costPrice;
      }
    }
    return product.costPrice ?? 0;
  }

  /**
   * Salva ou atualiza a tabela de preços individual do produto para uma filial específica.
   */
  public static saveCompanyProductPrice(
    productId: string,
    companyId: string,
    override: { salePrice: number; costPrice?: number; minStock?: number }
  ): void {
    const s = this.getState();
    const prod = s.products.find((p) => p.id === productId);
    if (!prod) return;
    if (!prod.companyPrices) prod.companyPrices = {};
    const user = this.getCurrentUser();
    prod.companyPrices[companyId] = {
      salePrice: Number(override.salePrice),
      costPrice: override.costPrice !== undefined ? Number(override.costPrice) : undefined,
      minStock: override.minStock !== undefined ? Number(override.minStock) : undefined,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.name || 'Administrador',
    };
    this.persist();
    this.notify();
  }

  /**
   * Remove a tabela individual de uma filial, fazendo-a voltar a herdar o preço da Matriz.
   */
  public static removeCompanyProductPrice(productId: string, companyId: string): void {
    const s = this.getState();
    const prod = s.products.find((p) => p.id === productId);
    if (!prod || !prod.companyPrices) return;
    delete prod.companyPrices[companyId];
    this.persist();
    this.notify();
  }

  /**
   * Retorna a lista de transferências de estoque realizadas entre empresas.
   */
  public static getCompanyStockTransfers(): CompanyStockTransfer[] {
    const s = this.getState();
    return s.companyStockTransfers || [];
  }

  /**
   * Registra uma nova transferência de estoque entre empresas no histórico.
   */
  public static recordCompanyStockTransfer(transfer: CompanyStockTransfer): void {
    const s = this.getState();
    if (!s.companyStockTransfers) s.companyStockTransfers = [];
    s.companyStockTransfers.unshift(transfer);
    this.persist();
    this.notify();
  }

  /**
   * Garante que uma empresa (matriz ou filial) tenha ao menos um depósito comercial ativo para movimentações.
   */
  public static ensureCompanyStockLocation(companyId: string): StockLocation {
    const s = this.getState();
    if (!s.stockLocations) s.stockLocations = [];
    const existing = s.stockLocations.find((l) => l.companyId === companyId && l.status === 'ativo');
    if (existing) return existing;
    const comp = s.companies.find((c) => c.id === companyId);
    const newLoc: StockLocation = {
      id: `loc-comercial-${companyId}`,
      code: `COM-${comp?.type === 'matriz' ? 'MTZ' : 'FIL'}`,
      name: `Comercial - ${comp?.tradeName || comp?.name || 'Filial'}`,
      companyId: companyId,
      description: `Estoque comercial próprio de ${comp?.tradeName || comp?.name || 'Filial'}`,
      type: 'comercial',
      status: 'ativo',
    };
    s.stockLocations.push(newLoc);
    this.persist();
    this.notify();
    return newLoc;
  }

  public static getSidebarMenuConfig(): SidebarMenuConfig {
    const s = this.getState();
    if (s.sidebarMenuConfig && Array.isArray(s.sidebarMenuConfig.hiddenSections)) {
      return s.sidebarMenuConfig;
    }
    try {
      const stored = localStorage.getItem('gestaofacil_sidebar_menu_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.hiddenSections)) {
          s.sidebarMenuConfig = parsed;
          return parsed;
        }
      }
    } catch (e) {
      // ignore
    }
    return { hiddenSections: [], hiddenSubItems: [] };
  }

  public static setSidebarMenuConfig(config: SidebarMenuConfig): void {
    const s = this.getState();
    s.sidebarMenuConfig = config;
    try {
      localStorage.setItem('gestaofacil_sidebar_menu_config', JSON.stringify(config));
    } catch (e) {
      // ignore
    }
    this.persist();
    this.notify();
  }

  public static resetSidebarMenuConfig(): void {
    const s = this.getState();
    s.sidebarMenuConfig = { hiddenSections: [], hiddenSubItems: [] };
    try {
      localStorage.removeItem('gestaofacil_sidebar_menu_config');
    } catch (e) {
      // ignore
    }
    this.persist();
    this.notify();
  }

  // ==========================================
  // EXPEDIÇÃO, ROTAS & ROMANEIOS DE ENTREGA
  // ==========================================

  public static getDeliveryRoutes(companyId?: string): DeliveryRoute[] {
    const s = this.getState();
    const list = s.deliveryRoutes || DEFAULT_DELIVERY_ROUTES;
    if (!companyId) return list;
    return list.filter((r) => r.companyId === companyId);
  }

  public static saveDeliveryRoute(routeData: Omit<DeliveryRoute, 'id'> & { id?: string }): DeliveryRoute {
    const s = this.getState();
    if (!s.deliveryRoutes) s.deliveryRoutes = [...DEFAULT_DELIVERY_ROUTES];

    const currentCompany = this.getCurrentCompany();
    const nowIso = new Date().toISOString();

    const normalizedMinOrderValue = Math.max(0, Number(routeData.minimumOrderValue ?? 0) || 0);

    if (routeData.id) {
      const idx = s.deliveryRoutes.findIndex((r) => r.id === routeData.id);
      if (idx >= 0) {
        const updated: DeliveryRoute = {
          ...s.deliveryRoutes[idx],
          ...routeData,
          id: routeData.id,
          minimumOrderValue:
            routeData.minimumOrderValue !== undefined
              ? normalizedMinOrderValue
              : Math.max(0, Number(s.deliveryRoutes[idx].minimumOrderValue ?? 0) || 0),
          updatedAt: nowIso,
        };
        s.deliveryRoutes[idx] = updated;
        this.addAuditLog('ATUALIZAR_ROTA', 'EXPEDICAO', updated.id, `Rota ${updated.name} atualizada`);
        this.persist();
        return updated;
      }
    }

    const newRoute: DeliveryRoute = {
      id: routeData.id || `rot-${Date.now().toString(36)}`,
      companyId: routeData.companyId || currentCompany.id,
      code: routeData.code || `ROT-${(s.deliveryRoutes.length + 1).toString().padStart(2, '0')}`,
      name: routeData.name,
      description: routeData.description || '',
      active: routeData.active !== undefined ? routeData.active : true,
      color: routeData.color || 'blue',
      cities: routeData.cities || [],
      neighborhoods: routeData.neighborhoods || [],
      marketAreas: routeData.marketAreas || [],
      sellerNames: routeData.sellerNames || [],
      estimatedDeliveryWindow: routeData.estimatedDeliveryWindow || 'Dia Todo',
      vehicleTypeRecommendation: routeData.vehicleTypeRecommendation || '',
      minimumOrderValue: normalizedMinOrderValue,
      notes: routeData.notes || '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    s.deliveryRoutes.unshift(newRoute);
    this.addAuditLog('CRIAR_ROTA', 'EXPEDICAO', newRoute.id, `Rota ${newRoute.name} criada`);
    this.persist();
    return newRoute;
  }

  public static deleteDeliveryRoute(id: string): boolean {
    const s = this.getState();
    if (!s.deliveryRoutes) return false;
    const exists = s.deliveryRoutes.find((r) => r.id === id);
    if (!exists) return false;
    s.deliveryRoutes = s.deliveryRoutes.filter((r) => r.id !== id);
    this.addAuditLog('EXCLUIR_ROTA', 'EXPEDICAO', id, `Rota ${exists.name} excluída`);
    this.persist();
    return true;
  }

  // MOTORISTAS DE ENTREGA
  public static getDeliveryDrivers(companyId?: string): DeliveryDriver[] {
    const s = this.getState();
    const list = s.deliveryDrivers || DEFAULT_DELIVERY_DRIVERS;
    if (!companyId) return list;
    return list.filter((d) => d.companyId === companyId);
  }

  public static saveDeliveryDriver(driverData: Omit<DeliveryDriver, 'id'> & { id?: string }): DeliveryDriver {
    const s = this.getState();
    if (!s.deliveryDrivers) s.deliveryDrivers = [...DEFAULT_DELIVERY_DRIVERS];

    const currentCompany = this.getCurrentCompany();
    const nowIso = new Date().toISOString();

    if (driverData.id) {
      const idx = s.deliveryDrivers.findIndex((d) => d.id === driverData.id);
      if (idx >= 0) {
        const updated: DeliveryDriver = {
          ...s.deliveryDrivers[idx],
          ...driverData,
          id: driverData.id,
          updatedAt: nowIso,
        };
        s.deliveryDrivers[idx] = updated;
        this.addAuditLog('ATUALIZAR_MOTORISTA', 'EXPEDICAO', updated.id, `Motorista ${updated.name} atualizado`);
        this.persist();
        return updated;
      }
    }

    const newDriver: DeliveryDriver = {
      id: driverData.id || `drv-${Date.now().toString(36)}`,
      companyId: driverData.companyId || currentCompany.id,
      name: driverData.name.trim(),
      cpf: driverData.cpf?.trim() || '',
      phone: driverData.phone?.trim() || '',
      cnhNumber: driverData.cnhNumber.trim(),
      cnhCategory: driverData.cnhCategory.trim().toUpperCase(),
      cnhExpirationDate: driverData.cnhExpirationDate,
      admissionDate: driverData.admissionDate || '',
      defaultVehicleId: driverData.defaultVehicleId || '',
      status: driverData.status || 'ativo',
      notes: driverData.notes?.trim() || '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    s.deliveryDrivers.unshift(newDriver);
    this.addAuditLog('CRIAR_MOTORISTA', 'EXPEDICAO', newDriver.id, `Motorista ${newDriver.name} cadastrado`);
    this.persist();
    return newDriver;
  }

  public static deleteDeliveryDriver(id: string): boolean {
    const s = this.getState();
    if (!s.deliveryDrivers) return false;
    const exists = s.deliveryDrivers.find((d) => d.id === id);
    if (!exists) return false;
    s.deliveryDrivers = s.deliveryDrivers.filter((d) => d.id !== id);
    this.addAuditLog('EXCLUIR_MOTORISTA', 'EXPEDICAO', id, `Motorista ${exists.name} excluído`);
    this.persist();
    return true;
  }

  // VEÍCULOS DE ENTREGA
  public static getDeliveryVehicles(companyId?: string): DeliveryVehicle[] {
    const s = this.getState();
    const list = s.deliveryVehicles || DEFAULT_DELIVERY_VEHICLES;
    if (!companyId) return list;
    return list.filter((v) => v.companyId === companyId);
  }

  public static saveDeliveryVehicle(vehicleData: Omit<DeliveryVehicle, 'id'> & { id?: string }): DeliveryVehicle {
    const s = this.getState();
    if (!s.deliveryVehicles) s.deliveryVehicles = [...DEFAULT_DELIVERY_VEHICLES];

    const currentCompany = this.getCurrentCompany();
    const nowIso = new Date().toISOString();

    if (vehicleData.id) {
      const idx = s.deliveryVehicles.findIndex((v) => v.id === vehicleData.id);
      if (idx >= 0) {
        const updated: DeliveryVehicle = {
          ...s.deliveryVehicles[idx],
          ...vehicleData,
          id: vehicleData.id,
          plate: vehicleData.plate.trim().toUpperCase(),
          updatedAt: nowIso,
        };
        s.deliveryVehicles[idx] = updated;
        this.addAuditLog('ATUALIZAR_VEICULO', 'EXPEDICAO', updated.id, `Veículo ${updated.plate} (${updated.model}) atualizado`);
        this.persist();
        return updated;
      }
    }

    const newVehicle: DeliveryVehicle = {
      id: vehicleData.id || `veh-${Date.now().toString(36)}`,
      companyId: vehicleData.companyId || currentCompany.id,
      plate: vehicleData.plate.trim().toUpperCase(),
      model: vehicleData.model.trim(),
      type: vehicleData.type.trim() || 'Utilitário / Fiorino',
      year: vehicleData.year?.trim() || '',
      renavam: vehicleData.renavam?.trim() || '',
      capacityKg: vehicleData.capacityKg !== undefined ? Number(vehicleData.capacityKg) || 0 : undefined,
      licensingExpirationDate: vehicleData.licensingExpirationDate,
      insuranceExpirationDate: vehicleData.insuranceExpirationDate || '',
      status: vehicleData.status || 'ativo',
      notes: vehicleData.notes?.trim() || '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    s.deliveryVehicles.unshift(newVehicle);
    this.addAuditLog('CRIAR_VEICULO', 'EXPEDICAO', newVehicle.id, `Veículo ${newVehicle.plate} (${newVehicle.model}) cadastrado`);
    this.persist();
    return newVehicle;
  }

  public static deleteDeliveryVehicle(id: string): boolean {
    const s = this.getState();
    if (!s.deliveryVehicles) return false;
    const exists = s.deliveryVehicles.find((v) => v.id === id);
    if (!exists) return false;
    s.deliveryVehicles = s.deliveryVehicles.filter((v) => v.id !== id);
    this.addAuditLog('EXCLUIR_VEICULO', 'EXPEDICAO', id, `Veículo ${exists.plate} excluído`);
    this.persist();
    return true;
  }

  public static getDeliveryManifests(companyId?: string): DeliveryManifest[] {
    const s = this.getState();
    const list = s.deliveryManifests || DEFAULT_DELIVERY_MANIFESTS;
    if (!companyId) return list;
    return list.filter((m) => m.companyId === companyId);
  }

  private static isManifestLogisticsOrderStatus(status?: string): boolean {
    return (
      status === 'em_romaneio' ||
      status === 'em_transito' ||
      status === 'entregue' ||
      status === 'nao_entregue'
    );
  }

  private static restoreOrderFromManifest(
    order: Order,
    manifestOrder?: DeliveryManifestOrder,
    nowIso: string = new Date().toISOString()
  ): Order {
    if (order.status === 'cancelado') return order;
    const originStatus: OrderStatus =
      order.preManifestStatus ||
      manifestOrder?.previousOrderStatus ||
      (this.isManifestLogisticsOrderStatus(order.status) ? 'concluido' : order.status);
    const originDeliveryStatus =
      order.preManifestDeliveryStatus ??
      manifestOrder?.previousDeliveryStatus ??
      'pendente';

    const updatedOrder: Order = {
      ...order,
      status: originStatus,
      deliveryStatus: originDeliveryStatus,
      updatedAt: nowIso,
    };
    delete updatedOrder.deliveryManifestId;
    delete updatedOrder.deliveryManifestNumber;
    delete updatedOrder.deliveryManifestName;
    delete updatedOrder.preManifestStatus;
    delete updatedOrder.preManifestDeliveryStatus;
    return updatedOrder;
  }

  private static syncOrdersWithManifest(
    s: DatabaseState,
    manifest: DeliveryManifest,
    removedItems: DeliveryManifestOrder[] = []
  ): boolean {
    if (!s.orders || !Array.isArray(s.orders)) return false;
    const nowIso = new Date().toISOString();
    let anyChanged = false;

    // 1. Restaurar status de origem para pedidos removidos do romaneio (se ainda não entregues)
    if (removedItems.length > 0) {
      const removedIds = new Set(removedItems.map((r) => r.orderId));
      const removedNumbers = new Set(removedItems.map((r) => r.orderNumber));
      s.orders = s.orders.map((order) => {
        if (!removedIds.has(order.id) && !removedNumbers.has(order.number)) {
          return order;
        }
        const remItem = removedItems.find((r) => r.orderId === order.id || r.orderNumber === order.number);
        if (order.status === 'cancelado' || remItem?.deliveryStatus === 'entregue') {
          return order;
        }
        anyChanged = true;
        return this.restoreOrderFromManifest(order, remItem, nowIso);
      });
    }

    // 2. Atualizar status dos pedidos vinculados ao romaneio
    const manifestOrders = manifest.orders || [];
    if (manifestOrders.length === 0) return anyChanged;

    s.orders = s.orders.map((order) => {
      const mOrder = manifestOrders.find((mo) => mo.orderId === order.id || mo.orderNumber === order.number);
      if (!mOrder || order.status === 'cancelado') return order;

      // Garante captura do status de origem antes da inserção em qualquer romaneio
      if (!mOrder.previousOrderStatus) {
        mOrder.previousOrderStatus =
          order.preManifestStatus ||
          (this.isManifestLogisticsOrderStatus(order.status) ? 'concluido' : order.status);
      }
      if (!mOrder.previousDeliveryStatus) {
        mOrder.previousDeliveryStatus =
          order.preManifestDeliveryStatus ??
          (this.isManifestLogisticsOrderStatus(order.deliveryStatus)
            ? 'pendente'
            : order.deliveryStatus || 'pendente');
      }

      if (manifest.status === 'cancelado') {
        if (mOrder.deliveryStatus !== 'entregue') {
          anyChanged = true;
          return this.restoreOrderFromManifest(order, mOrder, nowIso);
        }
        return order;
      }

      let targetStatus: 'em_romaneio' | 'em_transito' | 'entregue' | 'nao_entregue';
      if (mOrder.deliveryStatus === 'entregue') {
        targetStatus = 'entregue';
      } else if (mOrder.deliveryStatus === 'nao_entregue') {
        targetStatus = 'nao_entregue';
      } else if (manifest.status === 'entregue') {
        targetStatus = 'entregue';
      } else if (manifest.status === 'em_transito') {
        targetStatus = 'em_transito';
      } else {
        targetStatus = 'em_romaneio';
      }

      const preStatus = order.preManifestStatus || mOrder.previousOrderStatus || 'concluido';
      const preDeliv = order.preManifestDeliveryStatus ?? mOrder.previousDeliveryStatus ?? 'pendente';

      if (
        order.status === targetStatus &&
        order.deliveryStatus === targetStatus &&
        order.deliveryManifestId === manifest.id &&
        order.deliveryManifestNumber === manifest.number &&
        order.deliveryManifestName === manifest.name &&
        order.preManifestStatus === preStatus
      ) {
        return order;
      }

      anyChanged = true;
      return {
        ...order,
        status: targetStatus,
        deliveryStatus: targetStatus,
        deliveryManifestId: manifest.id,
        deliveryManifestNumber: manifest.number,
        deliveryManifestName: manifest.name,
        preManifestStatus: preStatus,
        preManifestDeliveryStatus: preDeliv,
        updatedAt: nowIso,
      };
    });

    return anyChanged;
  }

  public static saveDeliveryManifest(manifestData: Omit<DeliveryManifest, 'id'> & { id?: string }): DeliveryManifest {
    const s = this.getState();
    if (!s.deliveryManifests) s.deliveryManifests = [...DEFAULT_DELIVERY_MANIFESTS];

    const currentCompany = this.getCurrentCompany();
    const nowIso = new Date().toISOString();

    const totalOrders = manifestData.orders.length;
    const totalDelivered = manifestData.orders.filter((o) => o.deliveryStatus === 'entregue').length;
    const totalPending = manifestData.orders.filter((o) => o.deliveryStatus === 'pendente').length;
    const totalValue = manifestData.orders.reduce((acc, o) => acc + (o.totalValue || 0), 0);
    const totalAmountToCollect = manifestData.orders
      .filter((o) => o.paymentStatus === 'cobrar_na_entrega')
      .reduce((acc, o) => acc + (o.amountToCollect || o.totalValue || 0), 0);
    const totalVolumes = manifestData.orders.reduce((acc, o) => acc + (o.volumesCount || 1), 0);

    if (manifestData.id) {
      const idx = s.deliveryManifests.findIndex((m) => m.id === manifestData.id);
      if (idx >= 0) {
        const prevManifest = s.deliveryManifests[idx];
        const prevOrders = prevManifest.orders || [];
        const nextOrderIds = new Set(manifestData.orders.map((o) => o.orderId));
        const removedItems = prevOrders.filter((po) => !nextOrderIds.has(po.orderId));

        const enrichedOrders = manifestData.orders.map((mo) => {
          const prevItem = prevOrders.find((po) => po.orderId === mo.orderId);
          const origOrder = s.orders?.find((o) => o.id === mo.orderId || o.number === mo.orderNumber);
          const previousOrderStatus: OrderStatus | undefined =
            mo.previousOrderStatus ||
            prevItem?.previousOrderStatus ||
            origOrder?.preManifestStatus ||
            (origOrder && !this.isManifestLogisticsOrderStatus(origOrder.status) ? origOrder.status : undefined);
          const previousDeliveryStatus =
            mo.previousDeliveryStatus ??
            prevItem?.previousDeliveryStatus ??
            origOrder?.preManifestDeliveryStatus ??
            (origOrder && !this.isManifestLogisticsOrderStatus(origOrder.deliveryStatus)
              ? origOrder.deliveryStatus || 'pendente'
              : 'pendente');

          return {
            ...mo,
            previousOrderStatus,
            previousDeliveryStatus,
          };
        });

        const updated: DeliveryManifest = {
          ...prevManifest,
          ...manifestData,
          id: manifestData.id,
          name: manifestData.name?.trim() || undefined,
          orders: enrichedOrders,
          totalOrders,
          totalDelivered,
          totalPending,
          totalValue,
          totalAmountToCollect,
          totalVolumes,
          updatedAt: nowIso,
        };
        s.deliveryManifests[idx] = updated;
        this.syncOrdersWithManifest(s, updated, removedItems);
        this.addAuditLog('ATUALIZAR_ROMANEIO', 'EXPEDICAO', updated.id, `Romaneio ${updated.number} atualizado`);
        this.persist();
        return updated;
      }
    }

    const nextNum = (s.deliveryManifests.length + 1).toString().padStart(4, '0');
    const enrichedNewOrders = manifestData.orders.map((mo) => {
      const origOrder = s.orders?.find((o) => o.id === mo.orderId || o.number === mo.orderNumber);
      const previousOrderStatus: OrderStatus | undefined =
        mo.previousOrderStatus ||
        origOrder?.preManifestStatus ||
        (origOrder && !this.isManifestLogisticsOrderStatus(origOrder.status) ? origOrder.status : 'concluido');
      const previousDeliveryStatus =
        mo.previousDeliveryStatus ??
        origOrder?.preManifestDeliveryStatus ??
        (origOrder && !this.isManifestLogisticsOrderStatus(origOrder.deliveryStatus)
          ? origOrder.deliveryStatus || 'pendente'
          : 'pendente');

      return {
        ...mo,
        previousOrderStatus,
        previousDeliveryStatus,
      };
    });

    const newManifest: DeliveryManifest = {
      id: manifestData.id || `rom-${Date.now().toString(36)}`,
      number: manifestData.number || `ROM-2026-${nextNum}`,
      name: manifestData.name?.trim() || undefined,
      companyId: manifestData.companyId || currentCompany.id,
      date: manifestData.date || nowIso,
      departureDate: manifestData.departureDate || nowIso.split('T')[0],
      routeId: manifestData.routeId,
      routeName: manifestData.routeName,
      driverId: manifestData.driverId,
      driverName: manifestData.driverName,
      driverPhone: manifestData.driverPhone,
      vehicleId: manifestData.vehicleId,
      vehiclePlate: manifestData.vehiclePlate,
      vehicleModel: manifestData.vehicleModel,
      status: manifestData.status || 'planejado',
      notes: manifestData.notes,
      orders: enrichedNewOrders,
      totalOrders,
      totalDelivered,
      totalPending,
      totalValue,
      totalAmountToCollect,
      totalVolumes,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    s.deliveryManifests.unshift(newManifest);
    this.syncOrdersWithManifest(s, newManifest, []);
    this.addAuditLog('CRIAR_ROMANEIO', 'EXPEDICAO', newManifest.id, `Romaneio ${newManifest.number} criado com ${totalOrders} pedidos`);
    this.persist();
    return newManifest;
  }

  public static deleteDeliveryManifest(id: string): boolean {
    const s = this.getState();
    if (!s.deliveryManifests) return false;
    const exists = s.deliveryManifests.find((m) => m.id === id);
    if (!exists) return false;

    const nowIso = new Date().toISOString();

    // Se o romaneio for excluído antes de ser finalizado (ex: carga não saiu / planejado ou pendente em trânsito),
    // retorna os pedidos ao status de origem anterior à inclusão no romaneio.
    if (exists.orders && s.orders) {
      const orderIdsInManifest = new Set(exists.orders.map((o) => o.orderId));
      const orderNumbersInManifest = new Set(exists.orders.map((o) => o.orderNumber));
      const manifestNotFinalized = exists.status !== 'entregue';

      s.orders = s.orders.map((o) => {
        const isLinked =
          orderIdsInManifest.has(o.id) ||
          orderNumbersInManifest.has(o.number) ||
          o.deliveryManifestId === exists.id;

        if (!isLinked) return o;
        if (o.status === 'cancelado') return o;

        const mOrd = exists.orders.find((mo) => mo.orderId === o.id || mo.orderNumber === o.number);

        if (exists.status === 'planejado' || (manifestNotFinalized && mOrd?.deliveryStatus !== 'entregue' && o.deliveryStatus !== 'entregue')) {
          return this.restoreOrderFromManifest(o, mOrd, nowIso);
        }

        // Caso já tenha sido entregue/finalizado, preserva o status entregue, apenas limpando referência de ID do romaneio excluído
        const cleaned = { ...o, updatedAt: nowIso };
        delete cleaned.deliveryManifestId;
        return cleaned;
      });
    }

    s.deliveryManifests = s.deliveryManifests.filter((m) => m.id !== id);
    this.addAuditLog('EXCLUIR_ROMANEIO', 'EXPEDICAO', id, `Romaneio ${exists.number} excluído`);
    this.persist();
    return true;
  }

  public static updateDeliveryManifestStatus(manifestId: string, status: DeliveryManifest['status']): void {
    const s = this.getState();
    if (!s.deliveryManifests) return;
    const man = s.deliveryManifests.find((m) => m.id === manifestId);
    if (!man) return;

    const nowIso = new Date().toISOString();
    man.status = status;
    man.updatedAt = nowIso;

    if (status === 'entregue') {
      man.completedAt = nowIso;
      if (man.orders) {
        man.orders.forEach((ord) => {
          if (ord.deliveryStatus === 'pendente') {
            ord.deliveryStatus = 'entregue';
            ord.deliveredAt = nowIso;
          }
        });
        man.totalDelivered = man.orders.filter((o) => o.deliveryStatus === 'entregue').length;
        man.totalPending = man.orders.filter((o) => o.deliveryStatus === 'pendente').length;
      }
    }

    this.syncOrdersWithManifest(s, man, []);
    this.addAuditLog('STATUS_ROMANEIO', 'EXPEDICAO', manifestId, `Status do romaneio ${man.number} alterado para ${status}`);
    this.persist();
  }

  public static updateDeliveryOrderStatus(
    manifestId: string,
    orderId: string,
    status: 'entregue' | 'nao_entregue',
    notes?: string,
    failureReason?: string
  ): void {
    const s = this.getState();
    if (!s.deliveryManifests) return;
    const man = s.deliveryManifests.find((m) => m.id === manifestId);
    if (!man) return;
    const ord = man.orders.find((o) => o.orderId === orderId);
    if (!ord) return;

    const nowIso = new Date().toISOString();
    ord.deliveryStatus = status;
    if (status === 'entregue') {
      ord.deliveredAt = nowIso;
      ord.deliveryFailureReason = undefined;
    } else {
      ord.deliveryFailureReason = failureReason || 'Ocorrência na entrega';
    }
    if (notes) ord.deliveryNotes = notes;

    man.totalDelivered = man.orders.filter((o) => o.deliveryStatus === 'entregue').length;
    man.totalPending = man.orders.filter((o) => o.deliveryStatus === 'pendente').length;
    man.updatedAt = nowIso;

    if (man.totalPending === 0 && man.orders.length > 0) {
      man.status = 'entregue';
      man.completedAt = nowIso;
    }

    this.syncOrdersWithManifest(s, man, []);
    this.addAuditLog('BAIXA_ENTREGA', 'EXPEDICAO', orderId, `Pedido ${ord.orderNumber} marcado como ${status} no romaneio ${man.number}`);
    this.persist();
  }

  public static batchAssignRouteToCustomers(routeId: string, routeName: string, customerIds: string[]): number {
    const s = this.getState();
    let updatedCount = 0;
    s.customers = s.customers.map((c) => {
      if (customerIds.includes(c.id)) {
        updatedCount++;
        return {
          ...c,
          deliveryRouteId: routeId,
          deliveryRouteName: routeName,
          updatedAt: new Date().toISOString(),
        };
      }
      return c;
    });

    if (updatedCount > 0) {
      this.addAuditLog(
        'ASSOCIAR_ROTA_LOTE',
        'EXPEDICAO',
        routeId,
        `${updatedCount} clientes vinculados à rota ${routeName}`
      );
      this.persist();
    }
    return updatedCount;
  }

  public static batchAssignRouteByFilters(
    routeId: string,
    routeName: string,
    filters: { city?: string; neighborhood?: string; marketArea?: string; sellerName?: string }
  ): number {
    const s = this.getState();
    let updatedCount = 0;

    s.customers = s.customers.map((c) => {
      let matches = false;

      if (filters.city && c.city && c.city.toLowerCase() === filters.city.toLowerCase()) {
        matches = true;
      }
      if (filters.neighborhood && c.neighborhood && c.neighborhood.toLowerCase() === filters.neighborhood.toLowerCase()) {
        matches = true;
      }
      if (filters.marketArea && c.marketArea && c.marketArea.toLowerCase() === filters.marketArea.toLowerCase()) {
        matches = true;
      }
      if (filters.sellerName && c.sellerName && c.sellerName.toLowerCase() === filters.sellerName.toLowerCase()) {
        matches = true;
      }

      if (matches) {
        updatedCount++;
        return {
          ...c,
          deliveryRouteId: routeId,
          deliveryRouteName: routeName,
          updatedAt: new Date().toISOString(),
        };
      }
      return c;
    });

    if (updatedCount > 0) {
      this.addAuditLog(
        'ASSOCIAR_ROTA_CRITERIO',
        'EXPEDICAO',
        routeId,
        `${updatedCount} clientes associados à rota ${routeName} por critério regional`
      );
      this.persist();
    }
    return updatedCount;
  }

  /**
   * Retorna os últimos N clientes únicos que realizaram compras finalizadas (pedidos de venda).
   * Caso o histórico contenha menos que N clientes, complementa com os primeiros clientes ativos cadastrados.
   */
  public static getLastPurchasingCustomers(companyId?: string, limit: number = 5): Customer[] {
    const s = this.getState();
    const activeCustomersMap = new Map<string, Customer>();
    (s.customers || []).forEach((c) => {
      if (c.status === 'ativo') {
        activeCustomersMap.set(c.id, c);
      }
    });

    // Filtra pedidos de venda (não orçamentos, não cancelados), ordenados por data decrescente
    const validOrders = [...(s.orders || [])]
      .filter((o) => {
        if (companyId && o.companyId && o.companyId !== companyId) return false;
        if (o.type !== 'venda') return false;
        if (o.status === 'cancelado') return false;
        if (!o.customerId || o.customerId === 'consumidor_final' || o.customerId === '__CONSUMIDOR_FINAL__') return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());

    const result: Customer[] = [];
    const seenCustomerIds = new Set<string>();

    for (const order of validOrders) {
      if (order.customerId && !seenCustomerIds.has(order.customerId)) {
        seenCustomerIds.add(order.customerId);
        const cust = activeCustomersMap.get(order.customerId);
        if (cust) {
          result.push(cust);
          if (result.length >= limit) break;
        }
      }
    }

    // Se ainda não atingiu o limite de clientes com compras recentes, completa com os primeiros clientes ativos
    if (result.length < limit) {
      for (const cust of (s.customers || [])) {
        if (cust.status === 'ativo' && !seenCustomerIds.has(cust.id)) {
          seenCustomerIds.add(cust.id);
          result.push(cust);
          if (result.length >= limit) break;
        }
      }
    }

    return result;
  }

  // ==========================================
  // GESTÃO DE LOCALIDADES (PRAÇAS, BAIRROS, CIDADES, ESTADOS)
  // ==========================================

  public static getStates(): StateItem[] {
    const s = this.getState();
    return s.states || DEFAULT_STATES;
  }

  public static saveStateItem(stateData: Partial<StateItem> & { uf: string; name: string }): StateItem {
    const s = this.getState();
    if (!s.states) s.states = [...DEFAULT_STATES];

    const cleanUf = stateData.uf.trim().toUpperCase();
    const existingIdx = s.states.findIndex((st) => st.uf === cleanUf || st.id === stateData.id);

    if (existingIdx >= 0) {
      const updated: StateItem = {
        ...s.states[existingIdx],
        ...stateData,
        uf: cleanUf,
      };
      s.states[existingIdx] = updated;
      this.persist();
      return updated;
    }

    const newItem: StateItem = {
      id: stateData.id || `uf-${cleanUf.toLowerCase()}`,
      uf: cleanUf,
      name: stateData.name.trim(),
      region: stateData.region || 'Nordeste',
      active: stateData.active !== undefined ? stateData.active : true,
      createdAt: new Date().toISOString(),
    };
    s.states.push(newItem);
    this.persist();
    return newItem;
  }

  public static getMarketAreas(): MarketAreaItem[] {
    const s = this.getState();
    return s.marketAreas || DEFAULT_MARKET_AREAS;
  }

  public static saveMarketArea(data: Partial<MarketAreaItem> & { name: string }): MarketAreaItem {
    const s = this.getState();
    if (!s.marketAreas) s.marketAreas = [...DEFAULT_MARKET_AREAS];
    const nowIso = new Date().toISOString();

    if (data.id) {
      const idx = s.marketAreas.findIndex((m) => m.id === data.id);
      if (idx >= 0) {
        const updated: MarketAreaItem = {
          ...s.marketAreas[idx],
          ...data,
          name: data.name.trim(),
          updatedAt: nowIso,
        };
        s.marketAreas[idx] = updated;
        this.addAuditLog('ATUALIZAR_PRACA', 'EXPEDICAO', updated.id, `Praça ${updated.name} atualizada`);
        this.persist();
        return updated;
      }
    }

    const newItem: MarketAreaItem = {
      id: data.id || `pra-${Date.now().toString(36)}`,
      name: data.name.trim(),
      description: data.description || '',
      defaultRouteId: data.defaultRouteId || '',
      defaultRouteName: data.defaultRouteName || '',
      cities: data.cities || [],
      active: data.active !== undefined ? data.active : true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    s.marketAreas.unshift(newItem);
    this.addAuditLog('CRIAR_PRACA', 'EXPEDICAO', newItem.id, `Praça ${newItem.name} cadastrada`);
    this.persist();
    return newItem;
  }

  public static deleteMarketArea(id: string): boolean {
    const s = this.getState();
    if (!s.marketAreas) return false;
    const exists = s.marketAreas.find((m) => m.id === id);
    if (!exists) return false;
    s.marketAreas = s.marketAreas.filter((m) => m.id !== id);
    this.addAuditLog('EXCLUIR_PRACA', 'EXPEDICAO', id, `Praça ${exists.name} excluída`);
    this.persist();
    return true;
  }

  public static getCities(): CityItem[] {
    const s = this.getState();
    return s.cities || DEFAULT_CITIES;
  }

  public static saveCity(data: Partial<CityItem> & { name: string; stateUf: string }): CityItem {
    const s = this.getState();
    if (!s.cities) s.cities = [...DEFAULT_CITIES];
    const nowIso = new Date().toISOString();

    if (data.id) {
      const idx = s.cities.findIndex((c) => c.id === data.id);
      if (idx >= 0) {
        const updated: CityItem = {
          ...s.cities[idx],
          ...data,
          name: data.name.trim(),
          stateUf: data.stateUf.trim().toUpperCase(),
          distanceKm: data.distanceKm !== undefined ? data.distanceKm : s.cities[idx].distanceKm,
          isSystemDefault:
            data.isSystemDefault !== undefined ? data.isSystemDefault : s.cities[idx].isSystemDefault,
          updatedAt: nowIso,
        };
        s.cities[idx] = updated;
        this.addAuditLog('ATUALIZAR_CIDADE', 'EXPEDICAO', updated.id, `Cidade ${updated.name}/${updated.stateUf} atualizada`);
        this.persist();
        this.notify();
        return updated;
      }
    }

    const newItem: CityItem = {
      id: data.id || `cid-${Date.now().toString(36)}`,
      name: data.name.trim(),
      stateUf: data.stateUf.trim().toUpperCase(),
      marketAreaId: data.marketAreaId || '',
      marketAreaName: data.marketAreaName || '',
      defaultRouteId: data.defaultRouteId || '',
      defaultRouteName: data.defaultRouteName || '',
      ibgeCode: data.ibgeCode || '',
      distanceKm: data.distanceKm,
      isSystemDefault: data.isSystemDefault ?? false,
      active: data.active !== undefined ? data.active : true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    s.cities.push(newItem);
    s.cities.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    this.addAuditLog('CRIAR_CIDADE', 'EXPEDICAO', newItem.id, `Cidade ${newItem.name}/${newItem.stateUf} cadastrada`);
    this.persist();
    this.notify();
    return newItem;
  }

  public static deleteCity(id: string): boolean {
    const s = this.getState();
    if (!s.cities) return false;
    const exists = s.cities.find((c) => c.id === id);
    if (!exists) return false;
    s.cities = s.cities.filter((c) => c.id !== id);
    this.addAuditLog('EXCLUIR_CIDADE', 'EXPEDICAO', id, `Cidade ${exists.name} excluída`);
    this.persist();
    this.notify();
    return true;
  }

  public static restoreDefaultCities(): number {
    const s = this.getState();
    if (!s.cities) s.cities = [];
    const nowIso = new Date().toISOString();
    const existingIds = new Set(s.cities.map((c) => c.id));
    const existingKeys = new Set(
      s.cities.map((c) => `${c.name.trim().toLowerCase()}|${c.stateUf.trim().toUpperCase()}`)
    );
    const missing = DEFAULT_CITIES.filter(
      (d) =>
        !existingIds.has(d.id) &&
        !existingKeys.has(`${d.name.trim().toLowerCase()}|${d.stateUf.trim().toUpperCase()}`)
    ).map((c) => ({ ...c, updatedAt: nowIso }));

    if (missing.length > 0) {
      s.cities = [...s.cities, ...missing].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      try {
        localStorage.removeItem(DB_KEY_PREFIX + 'cities_cleared');
        localStorage.setItem(DB_KEY_PREFIX + 'bahia_cities_200km_v2', 'true');
      } catch {}
      this.addAuditLog(
        'RESTAURAR_CIDADES_PADRAO',
        'EXPEDICAO',
        'SISTEMA',
        `${missing.length} cidade(s) padrão da Bahia (raio 200km de Feira de Santana) restaurada(s)`
      );
      this.persist();
      this.notify();
    }
    return missing.length;
  }

  public static getNeighborhoods(): NeighborhoodItem[] {
    const s = this.getState();
    return s.neighborhoods || DEFAULT_NEIGHBORHOODS;
  }

  public static saveNeighborhood(data: Partial<NeighborhoodItem> & { name: string; cityName: string; stateUf: string }): NeighborhoodItem {
    const s = this.getState();
    if (!s.neighborhoods) s.neighborhoods = [...DEFAULT_NEIGHBORHOODS];
    const nowIso = new Date().toISOString();

    if (data.id) {
      const idx = s.neighborhoods.findIndex((n) => n.id === data.id);
      if (idx >= 0) {
        const updated: NeighborhoodItem = {
          ...s.neighborhoods[idx],
          ...data,
          name: data.name.trim(),
          cityName: data.cityName.trim(),
          stateUf: data.stateUf.trim().toUpperCase(),
          updatedAt: nowIso,
        };
        s.neighborhoods[idx] = updated;
        this.addAuditLog('ATUALIZAR_BAIRRO', 'EXPEDICAO', updated.id, `Bairro ${updated.name} atualizado`);
        this.persist();
        return updated;
      }
    }

    const newItem: NeighborhoodItem = {
      id: data.id || `bai-${Date.now().toString(36)}`,
      name: data.name.trim(),
      cityName: data.cityName.trim(),
      stateUf: data.stateUf.trim().toUpperCase(),
      marketAreaId: data.marketAreaId || '',
      marketAreaName: data.marketAreaName || '',
      defaultRouteId: data.defaultRouteId || '',
      defaultRouteName: data.defaultRouteName || '',
      zipCodePrefix: data.zipCodePrefix || '',
      active: data.active !== undefined ? data.active : true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    s.neighborhoods.unshift(newItem);
    this.addAuditLog('CRIAR_BAIRRO', 'EXPEDICAO', newItem.id, `Bairro ${newItem.name} cadastrado`);
    this.persist();
    return newItem;
  }

  public static deleteNeighborhood(id: string): boolean {
    const s = this.getState();
    if (!s.neighborhoods) return false;
    const exists = s.neighborhoods.find((n) => n.id === id);
    if (!exists) return false;
    s.neighborhoods = s.neighborhoods.filter((n) => n.id !== id);
    this.addAuditLog('EXCLUIR_BAIRRO', 'EXPEDICAO', id, `Bairro ${exists.name} excluído`);
    this.persist();
    return true;
  }

  // ==========================================
  // MÓDULO DE DEVOLUÇÃO DE VENDAS
  // ==========================================

  public static getSalesReturns(companyId?: string): SalesReturn[] {
    const s = this.getState();
    const list = s.salesReturns || [];
    const filtered = companyId && companyId !== 'all'
      ? list.filter((r) => r.companyId === companyId)
      : list;
    return [...filtered].sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
  }

  public static getSalesReturnById(id: string): SalesReturn | undefined {
    const s = this.getState();
    return (s.salesReturns || []).find((r) => r.id === id);
  }

  public static getSalesReturnsByOrderId(orderId: string): SalesReturn[] {
    const s = this.getState();
    return (s.salesReturns || []).filter((r) => r.orderId === orderId);
  }

  public static getNextSalesReturnNumber(companyId?: string): string {
    const s = this.getState();
    const currentYear = new Date().getFullYear();
    const yearPrefix = `DEV-${currentYear}-`;
    const returnsThisYear = (s.salesReturns || []).filter((r) => (r.number || '').startsWith(yearPrefix));
    let maxSeq = 0;
    returnsThisYear.forEach((r) => {
      const parts = r.number.split('-');
      if (parts.length >= 3) {
        const seq = parseInt(parts[2], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    });
    const nextSeq = maxSeq + 1;
    return `${yearPrefix}${String(nextSeq).padStart(4, '0')}`;
  }

  public static createSalesReturn(data: {
    orderId: string;
    reason: SalesReturnReason;
    reasonDetails?: string;
    financialResolution: SalesReturnResolution;
    refundMethod?: string;
    refundBankAccountId?: string;
    items: Array<{
      orderItemId: string;
      quantity: number;
      condition: SalesReturnCondition;
      locationId: string;
      notes?: string;
    }>;
    fiscalDocNumber?: string;
    fiscalAccessKey?: string;
    fiscalNotes?: string;
  }): SalesReturn {
    const s = this.getState();
    const order = (s.orders || []).find((o) => o.id === data.orderId);
    if (!order) {
      throw new Error(`Pedido com ID ${data.orderId} não encontrado no sistema.`);
    }

    if (order.status === 'cancelado') {
      throw new Error('Não é possível realizar devolução de um pedido que já se encontra cancelado.');
    }

    const currentUser = this.getCurrentUser();
    const currentCompany = (s.companies || []).find((c) => c.id === order.companyId) || this.getCurrentCompany();
    const nowIso = new Date().toISOString();
    const returnNumber = this.getNextSalesReturnNumber(order.companyId);

    // Mapeamento de rótulo amigável do canal
    let channelLabel = 'PDV Balcão';
    if (order.origin === 'externa_celular') channelLabel = 'Venda Mobile (Celular)';
    else if (order.origin === 'pedidos_venda' || order.origin === 'retaguarda_pedido') channelLabel = 'Pedido de Venda (Retaguarda)';

    // Valida e processa itens
    let subtotalReturned = 0;
    let discountProportional = 0;
    let totalCmvReversed = 0;
    let totalCmvLost = 0;

    const returnItems: SalesReturnItem[] = [];

    data.items.forEach((reqItem) => {
      if (reqItem.quantity <= 0) return;

      const orderItem = order.items.find((oi) => oi.id === reqItem.orderItemId);
      if (!orderItem) {
        throw new Error(`Item do pedido ${reqItem.orderItemId} não encontrado.`);
      }

      const prevReturned = orderItem.returnedQuantity || 0;
      const availableToReturn = Math.max(0, orderItem.quantity - prevReturned);

      if (reqItem.quantity > availableToReturn) {
        throw new Error(
          `Quantidade solicitada para devolução (${reqItem.quantity}) excede o saldo disponível (${availableToReturn}) do produto ${orderItem.description}.`
        );
      }

      // Proporção de desconto original
      const unitDiscount = orderItem.quantity > 0 ? (orderItem.discountValue || 0) / orderItem.quantity : 0;
      const itemTotalPrice = reqItem.quantity * orderItem.unitPrice;
      const itemTotalDiscount = reqItem.quantity * unitDiscount;
      const itemTotalNet = Math.max(0, itemTotalPrice - itemTotalDiscount);

      const unitCost = orderItem.unitCost || 0;
      const itemTotalCost = reqItem.quantity * unitCost;

      if (reqItem.condition === 'revenda') {
        totalCmvReversed += itemTotalCost;
      } else {
        totalCmvLost += itemTotalCost;
      }

      subtotalReturned += itemTotalPrice;
      discountProportional += itemTotalDiscount;

      const loc = (s.stockLocations || []).find((l) => l.id === reqItem.locationId);

      returnItems.push({
        id: `reti-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        orderItemId: orderItem.id,
        productId: orderItem.productId,
        productCode: orderItem.productCode || orderItem.code || '',
        description: orderItem.description,
        unit: String(orderItem.unit || 'UN'),
        originalQuantity: orderItem.quantity,
        previouslyReturnedQuantity: prevReturned,
        availableQuantity: availableToReturn,
        quantity: reqItem.quantity,
        unitPrice: orderItem.unitPrice,
        unitCost: unitCost,
        unitDiscount: unitDiscount,
        totalPrice: itemTotalPrice,
        totalDiscount: itemTotalDiscount,
        totalNet: itemTotalNet,
        condition: reqItem.condition,
        locationId: reqItem.locationId,
        locationName: loc?.name || 'Comercial',
        notes: reqItem.notes,
      });

      // Atualiza quantidade devolvida no item do pedido original
      orderItem.returnedQuantity = prevReturned + reqItem.quantity;

      // Movimentação de estoque:
      // Se "revenda": retorna ao estoque vendável
      if (reqItem.condition === 'revenda') {
        // Atualiza saldo por local
        if (!s.stockBalances) s.stockBalances = [];
        let balance = s.stockBalances.find(
          (b) => b.productId === orderItem.productId && b.locationId === reqItem.locationId
        );
        if (!balance) {
          balance = {
            productId: orderItem.productId,
            locationId: reqItem.locationId,
            quantity: 0,
            reserved: 0,
            minStock: 0,
            companyId: order.companyId,
          };
          s.stockBalances.push(balance);
        }
        balance.quantity += reqItem.quantity;

        // Registra movimentação de estoque tipo 'devolucao'
        if (!s.stockMovements) s.stockMovements = [];
        s.stockMovements.unshift({
          id: `mov-dev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          companyId: order.companyId,
          productId: orderItem.productId,
          productCode: orderItem.productCode || orderItem.code || '',
          productDescription: orderItem.description,
          locationId: reqItem.locationId,
          locationName: loc?.name || 'Comercial',
          type: 'devolucao',
          quantity: reqItem.quantity,
          unitCost: unitCost,
          totalCost: itemTotalCost,
          originDocType: 'venda',
          originDocId: returnNumber,
          date: nowIso,
          userId: currentUser.id,
          userName: currentUser.name,
          notes: `Devolução ${returnNumber} - Condição: Em condições de revenda (Pedido ${order.number})`,
        });
      } else {
        // Avaria, Quarentena ou Sem Aproveitamento: NÃO incrementa estoque vendável
        const condLabel = reqItem.condition === 'avaria_quarentena' ? 'Avaria/Quarentena' : 'Sem Aproveitamento/Perda';
        if (!s.stockMovements) s.stockMovements = [];
        s.stockMovements.unshift({
          id: `mov-dev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          companyId: order.companyId,
          productId: orderItem.productId,
          productCode: orderItem.productCode || orderItem.code || '',
          productDescription: orderItem.description,
          locationId: reqItem.locationId,
          locationName: loc?.name || 'Comercial',
          type: 'perda_avaria',
          quantity: reqItem.quantity,
          unitCost: unitCost,
          totalCost: itemTotalCost,
          originDocType: 'venda',
          originDocId: returnNumber,
          date: nowIso,
          userId: currentUser.id,
          userName: currentUser.name,
          notes: `Devolução ${returnNumber} - Condição: ${condLabel} (Não retorna ao estoque vendável)`,
        });
      }
    });

    if (returnItems.length === 0) {
      throw new Error('Nenhum item com quantidade válida para devolução foi informado.');
    }

    const totalReturned = Math.max(0, subtotalReturned - discountProportional);

    // Trata resolução financeira
    let refundCashRegisterMovementId: string | undefined;
    let creditGeneratedAmount: number | undefined;
    let receivableAdjustedId: string | undefined;
    let receivableAdjustedDocNumber: string | undefined;
    let receivableAdjustedAmount: number | undefined;

    if (data.financialResolution === 'estorno_restituicao') {
      // 1. Estorno / Restituição imediata
      // Se houver caixa aberto no PDV para esta empresa/usuário, lança sangria/saída de estorno
      const openCash = (s.cashRegisters || []).find(
        (cr) => cr.companyId === order.companyId && cr.status === 'aberto'
      );
      if (openCash) {
        refundCashRegisterMovementId = `csh-mov-dev-${Date.now().toString(36)}`;
        if (!openCash.movements) openCash.movements = [];
        openCash.movements.push({
          id: refundCashRegisterMovementId,
          type: 'devolucao_estorno',
          amount: totalReturned,
          description: `Estorno/Restituição Devolução ${returnNumber} - Pedido ${order.number} (${data.refundMethod || 'Dinheiro'})`,
          timestamp: nowIso,
          userId: currentUser.id,
          orderId: order.id,
          returnId: returnNumber,
        });
      }
    } else if (data.financialResolution === 'credito_cliente') {
      // 2. Crédito para o cliente em compras futuras
      creditGeneratedAmount = totalReturned;
      if (order.customerId) {
        const customer = (s.customers || []).find((c) => c.id === order.customerId);
        if (customer) {
          customer.creditBalance = (customer.creditBalance || 0) + totalReturned;
          if (!customer.creditHistory) customer.creditHistory = [];
          customer.creditHistory.unshift({
            id: `crd-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
            date: nowIso,
            amount: totalReturned,
            type: 'devolucao',
            returnId: returnNumber,
            orderId: order.id,
            description: `Crédito gerado pela Devolução ${returnNumber} do Pedido ${order.number}`,
            createdAt: nowIso,
          });
        }
      }
    } else if (data.financialResolution === 'abatimento_receber') {
      // 3. Abatimento proporcional em contas a receber em aberto
      let amountToDeduct = totalReturned;
      const receivables = (s.accountsReceivable || []).filter(
        (ar) => ar.orderId === order.id && (ar.status === 'aberto' || ar.status === 'parcial' || ar.status === 'vencido')
      );

      const adjustedDocs: string[] = [];
      let totalDeducted = 0;

      for (const rec of receivables) {
        if (amountToDeduct <= 0) break;
        const currentBal = rec.balance > 0 ? rec.balance : rec.originalValue;
        const deduction = Math.min(amountToDeduct, currentBal);

        rec.balance = Math.max(0, currentBal - deduction);
        if (rec.balance === 0) {
          rec.status = 'recebido';
        } else {
          rec.status = 'parcial';
        }

        if (!rec.receipts) rec.receipts = [];
        rec.receipts.push({
          date: nowIso,
          amount: deduction,
          method: 'Abatimento Devolução',
          userId: currentUser.id,
          notes: `Abatimento proporcional pela Devolução ${returnNumber}`,
        });

        adjustedDocs.push(rec.docNumber);
        totalDeducted += deduction;
        amountToDeduct -= deduction;
        if (!receivableAdjustedId) receivableAdjustedId = rec.id;
      }

      receivableAdjustedDocNumber = adjustedDocs.join(', ');
      receivableAdjustedAmount = totalDeducted;
    }

    // Calcula estorno proporcional de comissão do vendedor
    let sellerCommissionRate = 0;
    let reversedCommissionAmount = 0;
    const sellerUser = (s.users || []).find((u) => u.id === order.userId || u.name === order.userName);
    if (sellerUser?.commissionPercent) {
      sellerCommissionRate = sellerUser.commissionPercent;
      reversedCommissionAmount = Number((totalReturned * (sellerCommissionRate / 100)).toFixed(2));
    }

    // Atualiza status do pedido original
    let totalItemsOriginalQty = 0;
    let totalItemsReturnedQty = 0;
    order.items.forEach((item) => {
      totalItemsOriginalQty += item.quantity;
      totalItemsReturnedQty += item.returnedQuantity || 0;
    });

    const isTotalReturn = totalItemsReturnedQty >= totalItemsOriginalQty;
    order.returnStatus = isTotalReturn ? 'devolucao_total' : 'devolucao_parcial';
    order.returnedAmount = (order.returnedAmount || 0) + totalReturned;
    order.returnCount = (order.returnCount || 0) + 1;
    order.updatedAt = nowIso;

    // Constrói objeto da devolução
    const salesReturn: SalesReturn = {
      id: `dev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      number: returnNumber,
      orderId: order.id,
      orderNumber: order.number,
      companyId: order.companyId,
      companyName: currentCompany.tradeName || currentCompany.name,
      customerId: order.customerId,
      customerName: order.customerName,
      customerCpfCnpj: order.customerCpfCnpj,
      sellerId: order.userId,
      sellerName: order.userName,
      sellerCommissionRate: sellerCommissionRate,
      reversedCommissionAmount: reversedCommissionAmount,
      origin: order.origin,
      channelLabel: channelLabel,
      date: nowIso,
      status: 'concluida',
      returnType: isTotalReturn ? 'total' : 'parcial',
      reason: data.reason,
      reasonDetails: data.reasonDetails,
      items: returnItems,
      subtotalReturned: subtotalReturned,
      discountProportional: discountProportional,
      totalReturned: totalReturned,
      totalCmvReversed: totalCmvReversed,
      totalCmvLost: totalCmvLost,
      financialResolution: data.financialResolution,
      refundMethod: data.refundMethod,
      refundCashRegisterMovementId: refundCashRegisterMovementId,
      refundBankAccountId: data.refundBankAccountId,
      creditGeneratedAmount: creditGeneratedAmount,
      receivableAdjustedId: receivableAdjustedId,
      receivableAdjustedDocNumber: receivableAdjustedDocNumber,
      receivableAdjustedAmount: receivableAdjustedAmount,
      fiscalDocNumber: data.fiscalDocNumber,
      fiscalAccessKey: data.fiscalAccessKey,
      fiscalNotes: data.fiscalNotes,
      userId: currentUser.id,
      userName: currentUser.name,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (!s.salesReturns) s.salesReturns = [];
    s.salesReturns.unshift(salesReturn);

    this.addAuditLog(
      'DEVOLUCAO_VENDA',
      'VENDAS',
      salesReturn.id,
      `Devolução ${returnNumber} registrada para o pedido ${order.number} no valor de R$ ${totalReturned.toFixed(2)} (${isTotalReturn ? 'Total' : 'Parcial'})`
    );

    this.persist();
    this.notify();
    return salesReturn;
  }

  public static cancelSalesReturn(returnId: string, cancelledReason: string): boolean {
    const s = this.getState();
    const ret = (s.salesReturns || []).find((r) => r.id === returnId);
    if (!ret) return false;
    if (ret.status === 'cancelada') return false;

    const currentUser = this.getCurrentUser();
    const nowIso = new Date().toISOString();

    // 1. Reverter estoque dos itens que foram recebidos em revenda
    ret.items.forEach((item) => {
      if (item.condition === 'revenda') {
        // Reduz saldo do depósito
        if (s.stockBalances) {
          const balance = s.stockBalances.find(
            (b) => b.productId === item.productId && b.locationId === item.locationId
          );
          if (balance) {
            balance.quantity = Math.max(0, balance.quantity - item.quantity);
          }
        }

        // Lança movimentação compensatória de cancelamento de devolução
        if (!s.stockMovements) s.stockMovements = [];
        s.stockMovements.unshift({
          id: `mov-cdev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          companyId: ret.companyId,
          productId: item.productId,
          productCode: item.productCode,
          productDescription: item.description,
          locationId: item.locationId,
          locationName: item.locationName || 'Comercial',
          type: 'saida_venda',
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: item.quantity * item.unitCost,
          originDocType: 'venda',
          originDocId: ret.number,
          date: nowIso,
          userId: currentUser.id,
          userName: currentUser.name,
          notes: `Cancelamento de Devolução ${ret.number} - Estorno de entrada em estoque`,
        });
      }
    });

    // 2. Reverter resolução financeira
    if (ret.financialResolution === 'credito_cliente' && ret.customerId && ret.totalReturned) {
      const customer = (s.customers || []).find((c) => c.id === ret.customerId);
      if (customer) {
        customer.creditBalance = Math.max(0, (customer.creditBalance || 0) - ret.totalReturned);
        if (!customer.creditHistory) customer.creditHistory = [];
        customer.creditHistory.unshift({
          id: `crd-est-${Date.now().toString(36)}`,
          date: nowIso,
          amount: -ret.totalReturned,
          type: 'estorno',
          returnId: ret.number,
          orderId: ret.orderId,
          description: `Estorno do crédito por cancelamento da Devolução ${ret.number}`,
          createdAt: nowIso,
        });
      }
    } else if (ret.financialResolution === 'abatimento_receber' && ret.receivableAdjustedAmount) {
      // Restaura o saldo do título
      const receivables = (s.accountsReceivable || []).filter((ar) => ar.orderId === ret.orderId);
      if (receivables.length > 0) {
        receivables[0].balance = (receivables[0].balance || 0) + ret.receivableAdjustedAmount;
        if (receivables[0].status === 'recebido') {
          receivables[0].status = 'aberto';
        }
      }
    }

    // 3. Restaurar quantidades devolvidas no pedido original
    const order = (s.orders || []).find((o) => o.id === ret.orderId);
    if (order) {
      ret.items.forEach((retItem) => {
        const orderItem = order.items.find((oi) => oi.id === retItem.orderItemId);
        if (orderItem && orderItem.returnedQuantity) {
          orderItem.returnedQuantity = Math.max(0, orderItem.returnedQuantity - retItem.quantity);
        }
      });

      let remainingReturnedQty = 0;
      order.items.forEach((oi) => {
        remainingReturnedQty += oi.returnedQuantity || 0;
      });

      order.returnedAmount = Math.max(0, (order.returnedAmount || 0) - ret.totalReturned);
      order.returnCount = Math.max(0, (order.returnCount || 1) - 1);

      if (remainingReturnedQty === 0) {
        order.returnStatus = 'sem_devolucao';
      } else {
        order.returnStatus = 'devolucao_parcial';
      }
      order.updatedAt = nowIso;
    }

    // 4. Atualizar registro da devolução para cancelada
    ret.status = 'cancelada';
    ret.cancelledAt = nowIso;
    ret.cancelledBy = currentUser.id;
    ret.cancelledByName = currentUser.name;
    ret.cancelledReason = cancelledReason;
    ret.updatedAt = nowIso;

    this.addAuditLog(
      'CANCELAR_DEVOLUCAO_VENDA',
      'VENDAS',
      ret.id,
      `Devolução ${ret.number} cancelada. Motivo: ${cancelledReason}`
    );

    this.persist();
    this.notify();
    return true;
  }

  // ==========================================
  // DADOS INICIAIS REALISTAS E COMPLETOS (SEED)
  // ==========================================
  private static getSeedData(): DatabaseState {
    const companyMatrizId = 'comp-matriz';
    const companyFilialId = 'comp-filial';

    const companies: Company[] = [
      {
        id: companyMatrizId,
        name: 'Química & Limpeza Imperial Ltda',
        tradeName: 'Imperial Limpeza - Matriz Feira de Santana',
        cnpjCpf: '12.345.678/0001-90',
        type: 'matriz',
        phone: '(75) 3600-7890',
        email: 'contato@imperiallimpeza.com.br',
        address: {
          street: 'Av. Eduardo Fróes da Mota',
          number: '1500',
          neighborhood: 'CIS - Distrito Industrial do Subaé',
          city: 'Feira de Santana',
          state: 'BA',
          zipCode: '44000-000',
        },
        status: 'ativo',
      },
      {
        id: companyFilialId,
        name: 'Química & Limpeza Imperial - Filial Alagoinhas Ltda',
        tradeName: 'Imperial Limpeza - Filial Alagoinhas',
        cnpjCpf: '12.345.678/0002-71',
        type: 'filial',
        phone: '(75) 3422-5566',
        email: 'alagoinhas@imperiallimpeza.com.br',
        address: {
          street: 'Av. Juracy Magalhães',
          number: '820',
          neighborhood: 'Alagoinhas Velha',
          city: 'Alagoinhas',
          state: 'BA',
          zipCode: '48000-000',
        },
        status: 'ativo',
      },
    ];

    const users: User[] = [
      {
        id: 'usr-admin',
        name: 'Romeu Júnior',
        login: 'admin',
        role: 'admin',
        companyId: companyMatrizId,
        status: 'ativo',
        email: 'romeujr.suporte@gmail.com',
        phone: '(75) 98888-0001',
        permissions: {
          canViewCosts: true,
          canEditProducts: true,
          canDeleteRecords: true,
          canCancelSales: true,
          canAuthorizeDiscount: true,
          maxDiscountPercent: 30,
          canAccessFinancial: true,
          canAccessProduction: true,
          canAccessPurchases: true,
          canManageUsers: true,
          canAdjustStock: true,
          canCloseCashRegister: true,
        },
      },
      {
        id: 'usr-gerente',
        name: 'Carlos Eduardo Mendes',
        login: 'gerente',
        role: 'gerente',
        companyId: companyMatrizId,
        status: 'ativo',
        email: 'carlos.gerencia@imperiallimpeza.com.br',
        phone: '(75) 98888-0002',
        permissions: {
          canViewCosts: true,
          canEditProducts: true,
          canDeleteRecords: false,
          canCancelSales: true,
          canAuthorizeDiscount: true,
          maxDiscountPercent: 20,
          canAccessFinancial: true,
          canAccessProduction: true,
          canAccessPurchases: true,
          canManageUsers: false,
          canAdjustStock: true,
          canCloseCashRegister: true,
          canViewGrossProfit: true,
          canViewNetProfit: false,
          canViewTotalRevenue: true,
          canViewProfitMargin: true,
          canViewProductCosts: true,
          canViewCashBalances: true,
          allowedMenuSections: [...DEFAULT_ROLE_MENU_SECTIONS.gerente],
          allowedSubItems: [...DEFAULT_ROLE_SUB_ITEMS.gerente],
          gerenteSettingsMigrated: true,
        },
      },
      {
        id: 'usr-balconista',
        name: 'Mariana Souza',
        login: 'balcao',
        role: 'balconista',
        companyId: companyMatrizId,
        status: 'ativo',
        email: 'mariana.balcao@imperiallimpeza.com.br',
        phone: '(75) 98888-0003',
        permissions: {
          canViewCosts: false,
          canEditProducts: false,
          canDeleteRecords: false,
          canCancelSales: false,
          canAuthorizeDiscount: false,
          maxDiscountPercent: 5,
          canAccessFinancial: false,
          canAccessProduction: false,
          canAccessPurchases: false,
          canManageUsers: false,
          canAdjustStock: false,
          canCloseCashRegister: true,
        },
      },
      {
        id: 'usr-vendedor-externo',
        name: 'Bruno Lima',
        login: 'externo',
        role: 'vendedor_externo',
        companyId: companyMatrizId,
        status: 'ativo',
        email: 'bruno.vendas@imperiallimpeza.com.br',
        phone: '(75) 98888-0004',
        permissions: {
          canViewCosts: false,
          canEditProducts: false,
          canDeleteRecords: false,
          canCancelSales: false,
          canAuthorizeDiscount: false,
          maxDiscountPercent: 10,
          canAccessFinancial: false,
          canAccessProduction: false,
          canAccessPurchases: false,
          canManageUsers: false,
          canAdjustStock: false,
          canCloseCashRegister: false,
        },
      },
      {
        id: 'usr-financeiro',
        name: 'Patrícia Alves',
        login: 'financeiro',
        role: 'financeiro',
        companyId: companyMatrizId,
        status: 'ativo',
        email: 'patricia.fin@imperiallimpeza.com.br',
        phone: '(75) 98888-0005',
        permissions: {
          canViewCosts: true,
          canEditProducts: false,
          canDeleteRecords: false,
          canCancelSales: true,
          canAuthorizeDiscount: true,
          maxDiscountPercent: 15,
          canAccessFinancial: true,
          canAccessProduction: false,
          canAccessPurchases: true,
          canManageUsers: false,
          canAdjustStock: false,
          canCloseCashRegister: true,
        },
      },
      {
        id: 'usr-lizi',
        name: 'Lizi',
        login: 'lizi',
        role: 'balconista',
        companyId: companyMatrizId,
        status: 'ativo',
        email: 'lizi.balcao@imperiallimpeza.com.br',
        phone: '(75) 98888-0006',
        permissions: {
          canViewCosts: false,
          canEditProducts: false,
          canDeleteRecords: false,
          canCancelSales: true,
          canAuthorizeDiscount: false,
          maxDiscountPercent: 10,
          canAccessFinancial: false,
          canAccessProduction: false,
          canAccessPurchases: false,
          canManageUsers: false,
          canAdjustStock: false,
          canCloseCashRegister: true,
        },
      },
    ];

    const stockLocations: StockLocation[] = [
      {
        id: 'loc-comercial',
        code: 'COM-01',
        name: 'Comercial',
        companyId: companyMatrizId,
        description: 'Estoque Comercial unificado para vendas (balcão, externas e pedidos)',
        type: 'comercial',
        status: 'ativo',
      },
      {
        id: 'loc-mp',
        code: 'MP-01',
        name: 'Matéria-Prima',
        companyId: companyMatrizId,
        description: 'Armazenamento de essências, bases químicas, corantes e insumos brutos',
        type: 'materia_prima',
        status: 'ativo',
      },
      {
        id: 'loc-almoxarifado',
        code: 'ALM-01',
        name: 'Almoxarifado & Insumos',
        companyId: companyMatrizId,
        description: 'Ferramentas, EPIs, caixas de papelão e materiais de consumo',
        type: 'almoxarifado',
        status: 'ativo',
      },
      {
        id: 'loc-embalagens',
        code: 'EMB-01',
        name: 'Embalagens & Frascos',
        companyId: companyMatrizId,
        description: 'Frascos PET 500ml, galões 5L, tampas e rótulos adesivos',
        type: 'embalagens',
        status: 'ativo',
      },
    ];

    // Produtos: Matérias-Primas, Embalagens, Produtos Fabricados e Revenda
    const products: Product[] = [
      // 1. Matérias-Primas (Componentes)
      {
        id: 'prod-comp-base',
        code: 'MP-101',
        description: 'Base Detergente Tensoativa Concentrada',
        unit: 'L',
        costPrice: 4.80,
        salePrice: 0,
        family: 'Matéria-Prima',
        group: 'Bases Tensoativas',
        barcode: '7890001001015',
        minStock: 50,
        productType: 'componente',
        hasComposition: false,
        defaultLocationId: 'loc-mp',
        status: 'ativo',
        notes: 'Insumo químico para diluição e preparo de detergente e sabão líquido',
      },
      {
        id: 'prod-comp-essencia-lavanda',
        code: 'MP-102',
        description: 'Essência Concentrada Lavanda Francesa',
        unit: 'L',
        costPrice: 65.00,
        salePrice: 0,
        family: 'Matéria-Prima',
        group: 'Essências',
        barcode: '7890001001022',
        minStock: 5,
        productType: 'componente',
        hasComposition: false,
        defaultLocationId: 'loc-mp',
        status: 'ativo',
        notes: 'Fragrância para desinfetantes e limpadores perfumados',
      },
      {
        id: 'prod-comp-corante-azul',
        code: 'MP-103',
        description: 'Corante Líquido Azul Anil Industrial',
        unit: 'L',
        costPrice: 28.00,
        salePrice: 0,
        family: 'Matéria-Prima',
        group: 'Corantes',
        barcode: '7890001001039',
        minStock: 2,
        productType: 'componente',
        hasComposition: false,
        defaultLocationId: 'loc-mp',
        status: 'ativo',
        notes: 'Alto rendimento: 1ml para cada 20 litros',
      },
      // 2. Embalagens (Componentes)
      {
        id: 'prod-emb-frasco-500',
        code: 'EMB-201',
        description: 'Frasco PET 500ml Transparente',
        unit: 'UN',
        costPrice: 0.65,
        salePrice: 0,
        family: 'Embalagens',
        group: 'Frascos PET',
        barcode: '7890001002012',
        minStock: 200,
        productType: 'componente',
        hasComposition: false,
        defaultLocationId: 'loc-embalagens',
        status: 'ativo',
        notes: 'Frasco padrão para detergente de pratos',
      },
      {
        id: 'prod-emb-tampa-flip',
        code: 'EMB-202',
        description: 'Tampa Flip-Top Rosca 28mm Vermelha',
        unit: 'UN',
        costPrice: 0.22,
        salePrice: 0,
        family: 'Embalagens',
        group: 'Tampas',
        barcode: '7890001002029',
        minStock: 200,
        productType: 'componente',
        hasComposition: false,
        defaultLocationId: 'loc-embalagens',
        status: 'ativo',
        notes: 'Tampa dosadora com lacre',
      },
      {
        id: 'prod-emb-galao-5l',
        code: 'EMB-203',
        description: 'Galão PEAD 5L Branco com Tampa e Lacre',
        unit: 'UN',
        costPrice: 3.50,
        salePrice: 0,
        family: 'Embalagens',
        group: 'Galões',
        barcode: '7890001002036',
        minStock: 40,
        productType: 'componente',
        hasComposition: false,
        defaultLocationId: 'loc-embalagens',
        status: 'ativo',
        notes: 'Para embalar desinfetante profissional de 5L',
      },
      // 3. Produtos Prontos de Fabricação Própria (com composição)
      {
        id: 'prod-detergente-500',
        code: 'PA-301',
        description: 'Detergente Líquido Neutro Imperial 500ml',
        unit: 'UN',
        costPrice: 1.84, // Custo calculado da composição (0.15L * 4.80 = 0.72 + 0.005L * 28 = 0.14 + 0.11 essência + 0.65 frasco + 0.22 tampa = 1.84)
        salePrice: 3.99,
        family: 'Produtos Próprios',
        group: 'Detergentes',
        barcode: '7891112223011',
        minStock: 60,
        productType: 'revenda',
        hasComposition: true,
        composition: [
          {
            componentId: 'prod-comp-base',
            componentCode: 'MP-101',
            componentDescription: 'Base Detergente Tensoativa Concentrada',
            unit: 'L',
            quantity: 0.15,
            unitCost: 4.80,
            totalCost: 0.72,
          },
          {
            componentId: 'prod-comp-corante-azul',
            componentCode: 'MP-103',
            componentDescription: 'Corante Líquido Azul Anil Industrial',
            unit: 'L',
            quantity: 0.005,
            unitCost: 28.00,
            totalCost: 0.14,
          },
          {
            componentId: 'prod-emb-frasco-500',
            componentCode: 'EMB-201',
            componentDescription: 'Frasco PET 500ml Transparente',
            unit: 'UN',
            quantity: 1,
            unitCost: 0.65,
            totalCost: 0.65,
          },
          {
            componentId: 'prod-emb-tampa-flip',
            componentCode: 'EMB-202',
            componentDescription: 'Tampa Flip-Top Rosca 28mm Vermelha',
            unit: 'UN',
            quantity: 1,
            unitCost: 0.22,
            totalCost: 0.22,
          },
          {
            componentId: 'prod-comp-essencia-lavanda',
            componentCode: 'MP-102',
            componentDescription: 'Essência Concentrada Lavanda Francesa',
            unit: 'L',
            quantity: 0.0017,
            unitCost: 65.00,
            totalCost: 0.11,
          },
        ],
        defaultLocationId: 'loc-comercial',
        status: 'ativo',
        taxPercent: 6.0,
        operatingExpensesPercent: 12.0,
        salesCommissionPercent: 3.0,
        otherCostsPercent: 2.0,
        profitMarginPercent: 25.0,
        notes: 'Nosso produto carro-chefe de fabricação própria',
      },
      {
        id: 'prod-desinfetante-5l',
        code: 'PA-302',
        description: 'Desinfetante Floral Imperial Profissional 5L',
        unit: 'UN',
        costPrice: 9.85,
        salePrice: 22.90,
        family: 'Produtos Próprios',
        group: 'Desinfetantes',
        barcode: '7891112223028',
        minStock: 25,
        productType: 'revenda',
        hasComposition: true,
        composition: [
          {
            componentId: 'prod-comp-base',
            componentCode: 'MP-101',
            componentDescription: 'Base Detergente Tensoativa Concentrada',
            unit: 'L',
            quantity: 0.6,
            unitCost: 4.80,
            totalCost: 2.88,
          },
          {
            componentId: 'prod-comp-essencia-lavanda',
            componentCode: 'MP-102',
            componentDescription: 'Essência Concentrada Lavanda Francesa',
            unit: 'L',
            quantity: 0.05,
            unitCost: 65.00,
            totalCost: 3.25,
          },
          {
            componentId: 'prod-comp-corante-azul',
            componentCode: 'MP-103',
            componentDescription: 'Corante Líquido Azul Anil Industrial',
            unit: 'L',
            quantity: 0.008,
            unitCost: 28.00,
            totalCost: 0.22,
          },
          {
            componentId: 'prod-emb-galao-5l',
            componentCode: 'EMB-203',
            componentDescription: 'Galão PEAD 5L Branco com Tampa e Lacre',
            unit: 'UN',
            quantity: 1,
            unitCost: 3.50,
            totalCost: 3.50,
          },
        ],
        defaultLocationId: 'loc-comercial',
        status: 'ativo',
        taxPercent: 6.0,
        operatingExpensesPercent: 12.0,
        salesCommissionPercent: 4.0,
        otherCostsPercent: 2.0,
        profitMarginPercent: 28.0,
        notes: 'Galão para condomínios, clínicas e comércios',
      },
      // 4. Produtos de Revenda Direta
      {
        id: 'prod-vassoura-piacava',
        code: 'REV-401',
        description: 'Vassoura Piaçava Master com Cabo Madeira 1,20m',
        unit: 'UN',
        costPrice: 8.50,
        salePrice: 17.50,
        family: 'Revenda',
        group: 'Vassouras e Rodos',
        barcode: '7892223334015',
        minStock: 15,
        productType: 'revenda',
        hasComposition: false,
        defaultLocationId: 'loc-comercial',
        status: 'ativo',
        taxPercent: 6.0,
        operatingExpensesPercent: 10.0,
        salesCommissionPercent: 3.0,
        otherCostsPercent: 1.0,
        profitMarginPercent: 25.0,
        notes: 'Revenda de acessórios para limpeza pesada',
      },
      {
        id: 'prod-rodo-duplo',
        code: 'REV-402',
        description: 'Rodo Alumínio Duplo 40cm com Cabo Reforçado',
        unit: 'UN',
        costPrice: 11.20,
        salePrice: 24.00,
        family: 'Revenda',
        group: 'Vassouras e Rodos',
        barcode: '7892223334022',
        minStock: 10,
        productType: 'revenda',
        hasComposition: false,
        defaultLocationId: 'loc-comercial',
        status: 'ativo',
        taxPercent: 6.0,
        operatingExpensesPercent: 10.0,
        salesCommissionPercent: 3.0,
        otherCostsPercent: 1.0,
        profitMarginPercent: 25.0,
        notes: 'Borracha dupla flexível de alta durabilidade',
      },
      {
        id: 'prod-luva-latex',
        code: 'REV-403',
        description: 'Luva de Látex Amarela Multiuso Tamanho M (Par)',
        unit: 'PAR' as any,
        costPrice: 3.20,
        salePrice: 7.90,
        family: 'Revenda',
        group: 'EPIs e Acessórios',
        barcode: '7892223334039',
        minStock: 20,
        productType: 'revenda',
        hasComposition: false,
        defaultLocationId: 'loc-comercial',
        status: 'ativo',
        taxPercent: 6.0,
        operatingExpensesPercent: 10.0,
        salesCommissionPercent: 3.0,
        otherCostsPercent: 1.0,
        profitMarginPercent: 25.0,
        notes: 'Proteção para lavagem e faxina em geral',
      },
      {
        id: 'prod-pano-microfibra',
        code: 'REV-404',
        description: 'Pano Microfibra Multiuso 40x40cm (Pacote com 5 unid)',
        unit: 'PCT',
        costPrice: 9.00,
        salePrice: 19.90,
        family: 'Revenda',
        group: 'Panos e Fibras',
        barcode: '7892223334046',
        minStock: 15,
        productType: 'revenda',
        hasComposition: false,
        defaultLocationId: 'loc-comercial',
        status: 'ativo',
        taxPercent: 6.0,
        operatingExpensesPercent: 10.0,
        salesCommissionPercent: 3.0,
        otherCostsPercent: 1.0,
        profitMarginPercent: 25.0,
        notes: 'Não solta fiapos, ideal para vidros e bancadas',
      },
      // 5. Exemplo de Embalagem Master (Venda por Atacado / Caixa com 24 unidades)
      {
        id: 'prod-master-detergente-cx24',
        code: 'CX-301-24',
        description: 'Caixa Detergente Líquido Neutro 500ml c/ 24 UN',
        unit: 'CX',
        costPrice: 44.16, // 1.84 * 24
        salePrice: 89.90, // Desconto atacado (unidade avulsa sai a 3.75)
        family: 'Produtos Próprios',
        group: 'Embalagens Master',
        barcode: '7891112223240',
        minStock: 5,
        productType: 'revenda',
        hasComposition: false,
        defaultLocationId: 'loc-comercial',
        status: 'ativo',
        taxPercent: 6.0,
        operatingExpensesPercent: 12.0,
        salesCommissionPercent: 3.0,
        otherCostsPercent: 2.0,
        profitMarginPercent: 25.0,
        notes: 'Embalagem Master contendo 24 frascos de Detergente Neutro 500ml. A baixa de estoque é realizada diretamente nas unidades do produto associado PA-301.',
        isMasterPack: true,
        masterPackAssociatedProductId: 'prod-detergente-500',
        masterPackAssociatedProductCode: 'PA-301',
        masterPackAssociatedProductDescription: 'Detergente Líquido Neutro Imperial 500ml',
        masterPackUnits: 24,
        masterPackPackagingType: 'caixa',
      },
    ];

    // Saldos por Local de Estoque (com vinculação explícita por empresa)
    const stockBalances: ProductStockBalance[] = [
      // Matérias-Primas no galpão MP
      { productId: 'prod-comp-base', locationId: 'loc-mp', quantity: 240, reserved: 0, minStock: 50, companyId: companyMatrizId },
      { productId: 'prod-comp-essencia-lavanda', locationId: 'loc-mp', quantity: 18.5, reserved: 0, minStock: 5, companyId: companyMatrizId },
      { productId: 'prod-comp-corante-azul', locationId: 'loc-mp', quantity: 8.2, reserved: 0, minStock: 2, companyId: companyMatrizId },
      // Embalagens no estoque de embalagens
      { productId: 'prod-emb-frasco-500', locationId: 'loc-embalagens', quantity: 850, reserved: 0, minStock: 200, companyId: companyMatrizId },
      { productId: 'prod-emb-tampa-flip', locationId: 'loc-embalagens', quantity: 920, reserved: 0, minStock: 200, companyId: companyMatrizId },
      { productId: 'prod-emb-galao-5l', locationId: 'loc-embalagens', quantity: 110, reserved: 0, minStock: 40, companyId: companyMatrizId },
      // Produtos Fabricados e Revenda no Estoque Comercial unificado
      { productId: 'prod-detergente-500', locationId: 'loc-comercial', quantity: 245, reserved: 0, minStock: 60, companyId: companyMatrizId },
      { productId: 'prod-desinfetante-5l', locationId: 'loc-comercial', quantity: 57, reserved: 0, minStock: 20, companyId: companyMatrizId },
      { productId: 'prod-vassoura-piacava', locationId: 'loc-comercial', quantity: 38, reserved: 0, minStock: 15, companyId: companyMatrizId },
      { productId: 'prod-rodo-duplo', locationId: 'loc-comercial', quantity: 24, reserved: 0, minStock: 10, companyId: companyMatrizId },
      { productId: 'prod-luva-latex', locationId: 'loc-comercial', quantity: 72, reserved: 0, minStock: 20, companyId: companyMatrizId },
      { productId: 'prod-pano-microfibra', locationId: 'loc-comercial', quantity: 44, reserved: 0, minStock: 15, companyId: companyMatrizId },
    ];

    // Clientes (Bahia - Feira de Santana e municípios em raio de até 150km)
    const customers: Customer[] = [
      {
        id: 'cli-001',
        code: 'CLI-001',
        name: 'Supermercado Subaé Ltda',
        tradeName: 'Super Subaé',
        type: 'PJ',
        cpfCnpj: '23.456.789/0001-11',
        phone: '(75) 3622-2200',
        whatsapp: '(75) 99711-2233',
        email: 'compras@supersubae.com.br',
        zipCode: '44001-200',
        street: 'Rua Conselheiro Franco',
        number: '450',
        neighborhood: 'Kalilândia',
        city: 'Feira de Santana',
        state: 'BA',
        marketArea: 'Feira de Santana - Sede',
        sellerName: 'Carlos Silva',
        deliveryRouteId: 'rot-01',
        deliveryRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)',
        creditLimit: 8000.0,
        preferredPaymentMethod: 'Boleto 30 dias',
        status: 'ativo',
        notes: 'Cliente corporativo com compras quinzenais em Feira de Santana',
      },
      {
        id: 'cli-002',
        code: 'CLI-002',
        name: 'Condomínio Residencial Portal de Alagoinhas',
        tradeName: 'Condomínio Portal Alagoinhas',
        type: 'PJ',
        cpfCnpj: '45.678.910/0001-22',
        phone: '(75) 3421-8800',
        whatsapp: '(75) 99122-3344',
        email: 'administracao@portalalagoinhas.com.br',
        zipCode: '48030-000',
        street: 'Av. Juracy Magalhães',
        number: '1800',
        neighborhood: 'Alagoinhas Velha',
        city: 'Alagoinhas',
        state: 'BA',
        marketArea: 'Litoral Norte & Alagoinhas',
        sellerName: 'Roberto Vendas',
        deliveryRouteId: 'rot-03',
        deliveryRouteName: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)',
        creditLimit: 5000.0,
        preferredPaymentMethod: 'Pix',
        status: 'ativo',
        notes: 'Compra galões de 5L e material de limpeza pesada (108km de Feira de Santana)',
      },
      {
        id: 'cli-003',
        code: 'CLI-003',
        name: 'Lava Rápido & Auto Posto Jacuípe',
        tradeName: 'Auto Care Jacuípe',
        type: 'PJ',
        cpfCnpj: '34.567.890/0001-33',
        phone: '(75) 3243-6543',
        whatsapp: '(75) 99344-5566',
        email: 'contato@postojacuipe.com.br',
        zipCode: '44245-000',
        street: 'Av. Sérgio Carneiro',
        number: '210',
        neighborhood: 'Centro',
        city: 'Conceição do Jacuípe',
        state: 'BA',
        marketArea: 'Feira de Santana - Sede',
        sellerName: 'Bruno Lima',
        deliveryRouteId: 'rot-01',
        deliveryRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)',
        creditLimit: 3000.0,
        preferredPaymentMethod: 'Cartão de Crédito',
        status: 'ativo',
        notes: 'Consumo constante de detergente e panos microfibra (28km de Feira de Santana)',
      },
      {
        id: 'cli-004',
        code: 'CLI-004',
        name: 'Maria Helena dos Santos',
        tradeName: '',
        type: 'PF',
        cpfCnpj: '234.567.890-12',
        phone: '(75) 3625-1122',
        whatsapp: '(75) 98765-1122',
        email: 'maria.helena@gmail.com',
        zipCode: '44077-000',
        street: 'Av. Getúlio Vargas',
        number: '890',
        neighborhood: 'Santa Mônica',
        city: 'Feira de Santana',
        state: 'BA',
        marketArea: 'Feira de Santana - Sede',
        sellerName: 'Carlos Silva',
        deliveryRouteId: 'rot-01',
        deliveryRouteName: 'Rota 01 - Feira de Santana (Sede & Entorno)',
        creditLimit: 500.0,
        preferredPaymentMethod: 'Dinheiro',
        status: 'ativo',
        notes: 'Cliente do balcão em Feira de Santana, compra produtos de uso doméstico',
      },
      {
        id: 'cli-005',
        code: 'CLI-005',
        name: 'Mercado Recôncavo Sul Ltda',
        tradeName: 'Mercado Recôncavo',
        type: 'PJ',
        cpfCnpj: '56.789.123/0001-44',
        phone: '(75) 3631-4100',
        whatsapp: '(75) 99811-4100',
        email: 'compras@mercadoreconcavo.com.br',
        zipCode: '44430-000',
        street: 'Av. Ursicino Pinto de Queiroz',
        number: '310',
        neighborhood: 'Centro',
        city: 'Santo Antônio de Jesus',
        state: 'BA',
        marketArea: 'Recôncavo Baiano',
        sellerName: 'Mariana Oliveira',
        deliveryRouteId: 'rot-02',
        deliveryRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)',
        creditLimit: 9000.0,
        preferredPaymentMethod: 'Boleto 30 dias',
        status: 'ativo',
        notes: 'Atendimento semanal na rota do Recôncavo (112km de Feira de Santana)',
      },
      {
        id: 'cli-006',
        code: 'CLI-006',
        name: 'Atacadão Portal do Sisal Ltda',
        tradeName: 'Atacadão do Sisal',
        type: 'PJ',
        cpfCnpj: '67.890.234/0001-55',
        phone: '(75) 3261-4400',
        whatsapp: '(75) 99220-4400',
        email: 'pedidos@atacadaosisal.com.br',
        zipCode: '48700-000',
        street: 'Av. Manoel Novais',
        number: '520',
        neighborhood: 'Cidade Nova',
        city: 'Serrinha',
        state: 'BA',
        marketArea: 'Portal do Sertão & Sisal',
        sellerName: 'Bruno Lima',
        deliveryRouteId: 'rot-04',
        deliveryRouteName: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)',
        creditLimit: 12000.0,
        preferredPaymentMethod: 'Boleto 28 dias',
        status: 'ativo',
        notes: 'Cliente atacadista em Serrinha (72km de Feira de Santana)',
      },
      {
        id: 'cli-007',
        code: 'CLI-007',
        name: 'Restaurante & Pousada Cachoeira Histórica',
        tradeName: 'Pousada Cachoeira',
        type: 'PJ',
        cpfCnpj: '78.901.345/0001-66',
        phone: '(75) 3425-1980',
        whatsapp: '(75) 98845-1980',
        email: 'suprimentos@pousadacachoeira.com.br',
        zipCode: '44300-000',
        street: 'Praça da Aclamação',
        number: '145',
        neighborhood: 'Centro',
        city: 'Cachoeira',
        state: 'BA',
        marketArea: 'Recôncavo Baiano',
        sellerName: 'Carlos Silva',
        deliveryRouteId: 'rot-02',
        deliveryRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)',
        creditLimit: 4500.0,
        preferredPaymentMethod: 'Pix',
        status: 'ativo',
        notes: 'Compras quinzenais para hotelaria e restaurante (55km de Feira de Santana)',
      },
      {
        id: 'cli-008',
        code: 'CLI-008',
        name: 'Distribuidora Cruz das Almas Comércio Ltda',
        tradeName: 'Distribuidora Cruzense',
        type: 'PJ',
        cpfCnpj: '89.012.456/0001-77',
        phone: '(75) 3621-3390',
        whatsapp: '(75) 99931-3390',
        email: 'compras@distribuidoracruzense.com.br',
        zipCode: '44380-000',
        street: 'Rua Rui Barbosa',
        number: '610',
        neighborhood: 'Coplan',
        city: 'Cruz das Almas',
        state: 'BA',
        marketArea: 'Recôncavo Baiano',
        sellerName: 'Mariana Oliveira',
        deliveryRouteId: 'rot-02',
        deliveryRouteName: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)',
        creditLimit: 7000.0,
        preferredPaymentMethod: 'Boleto 30 dias',
        status: 'ativo',
        notes: 'Atendido na rota do Recôncavo (65km de Feira de Santana)',
      },
    ];

    // Fornecedores (Bahia)
    const suppliers: Supplier[] = [
      {
        id: 'for-001',
        code: 'FOR-001',
        name: 'Polo Petroquímico Química Bahia S.A.',
        tradeName: 'Química Bahia',
        type: 'PJ',
        cpfCnpj: '98.765.432/0001-10',
        contactName: 'Engenheiro Fernando Costa',
        phone: '(71) 3632-2000',
        whatsapp: '(71) 99123-4567',
        email: 'vendas@quimicabahia.com.br',
        zipCode: '42810-000',
        street: 'Via Atlântica - Polo Industrial',
        number: 'Km 12',
        neighborhood: 'Polo Industrial',
        city: 'Camaçari',
        state: 'BA',
        paymentTerms: '28/56 dias',
        status: 'ativo',
        notes: 'Fornecedor de matérias-primas e bases tensoativas',
      },
      {
        id: 'for-002',
        code: 'FOR-002',
        name: 'Plásticos & Embalagens Recôncavo Ltda',
        tradeName: 'Embalagens Recôncavo',
        type: 'PJ',
        cpfCnpj: '87.654.321/0001-20',
        contactName: 'Juliana Prado',
        phone: '(75) 3614-8900',
        whatsapp: '(75) 99543-2100',
        email: 'pedidos@embalagensreconcavo.com.br',
        zipCode: '44090-000',
        street: 'Av. Sérgio Carneiro',
        number: '3400',
        neighborhood: 'Tomba',
        city: 'Feira de Santana',
        state: 'BA',
        paymentTerms: '30 dias',
        status: 'ativo',
        notes: 'Fornecedor de frascos PET, galões e tampas em Feira de Santana',
      },
      {
        id: 'for-003',
        code: 'FOR-003',
        name: 'Indústria de Artefatos de Piaçava Baiana Ltda',
        tradeName: 'Piaçava do Litoral Norte',
        type: 'PJ',
        cpfCnpj: '76.543.210/0001-30',
        contactName: 'Marcos Vinícius',
        phone: '(75) 3422-1122',
        whatsapp: '(75) 98877-6655',
        email: 'contato@piacavabaiana.com.br',
        zipCode: '48010-000',
        street: 'Av. Dantas Bião',
        number: '1200',
        neighborhood: 'Centro',
        city: 'Alagoinhas',
        state: 'BA',
        paymentTerms: '15/30/45 dias',
        status: 'ativo',
        notes: 'Fornecedor de vassouras, rodos e cabos para revenda',
      },
    ];

    const todayStr = new Date().toISOString().split('T')[0];

    // Caixa PDV Aberto
    const cashRegisters: CashRegister[] = [
      {
        id: 'cx-hoje',
        companyId: companyMatrizId,
        userId: 'usr-balconista',
        userName: 'Mariana Souza',
        openedAt: `${todayStr}T08:00:00.000Z`,
        initialBalance: 200.0,
        status: 'aberto',
        movements: [
          {
            id: 'mov-suprimento-01',
            type: 'suprimento',
            amount: 50.0,
            description: 'Reforço de troco para notas de 2 e 5',
            timestamp: `${todayStr}T08:30:00.000Z`,
            userId: 'usr-balconista',
          },
          {
            id: 'mov-venda-din-01',
            type: 'venda_dinheiro',
            amount: 78.50,
            description: 'Venda Balcão VD-2026-0005 (Dinheiro em Espécie)',
            timestamp: `${todayStr}T09:10:00.000Z`,
            userId: 'usr-balconista',
          },
          {
            id: 'mov-venda-pix-01',
            type: 'venda_pix',
            amount: 142.00,
            description: 'Venda Balcão VD-2026-0006 (PIX Instantâneo)',
            timestamp: `${todayStr}T09:45:00.000Z`,
            userId: 'usr-balconista',
          },
          {
            id: 'mov-venda-cred-01',
            type: 'venda_cartao',
            amount: 195.90,
            description: 'Venda Balcão VD-2026-0007 (Cartão de Crédito 2x)',
            timestamp: `${todayStr}T10:20:00.000Z`,
            userId: 'usr-balconista',
          },
          {
            id: 'mov-venda-deb-01',
            type: 'venda_cartao',
            amount: 64.00,
            description: 'Venda Balcão VD-2026-0008 (Cartão de Débito)',
            timestamp: `${todayStr}T11:05:00.000Z`,
            userId: 'usr-balconista',
          },
        ],
      },
    ];

    // Pedidos e Vendas de Exemplo
    const orders: Order[] = [
      {
        id: 'ord-venda-001',
        number: 'VD-2026-0001',
        type: 'venda',
        origin: 'pdv',
        companyId: companyMatrizId,
        customerId: 'cli-004',
        customerName: 'Maria Helena dos Santos',
        userId: 'usr-balconista',
        userName: 'Mariana Souza',
        items: [
          {
            id: 'item-1',
            productId: 'prod-detergente-500',
            productCode: 'PA-301',
            description: 'Detergente Líquido Neutro Imperial 500ml',
            unit: 'UN',
            quantity: 3,
            unitPrice: 3.99,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 11.97,
            unitCost: 1.84,
            locationId: 'loc-comercial',
          },
          {
            id: 'item-2',
            productId: 'prod-pano-microfibra',
            productCode: 'REV-404',
            description: 'Pano Microfibra Multiuso 40x40cm (Pacote com 5 unid)',
            unit: 'PCT',
            quantity: 1,
            unitPrice: 19.90,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 19.90,
            unitCost: 9.00,
            locationId: 'loc-comercial',
          },
        ],
        subtotal: 31.87,
        discountTotal: 0,
        total: 31.87,
        paymentMethod: 'pix',
        installmentsCount: 1,
        receivedAmount: 31.87,
        changeAmount: 0,
        status: 'concluido',
        stockDeducted: true,
        financialGenerated: true,
        createdAt: `${todayStr}T09:15:00.000Z`,
        updatedAt: `${todayStr}T09:15:00.000Z`,
      },
      {
        id: 'ord-orcamento-002',
        number: 'ORC-2026-0002',
        type: 'orcamento',
        origin: 'externa_celular',
        companyId: companyMatrizId,
        customerId: 'cli-001',
        customerName: 'Supermercado Subaé Ltda',
        userId: 'usr-vendedor-externo',
        userName: 'Bruno Lima',
        items: [
          {
            id: 'item-3',
            productId: 'prod-detergente-500',
            productCode: 'PA-301',
            description: 'Detergente Líquido Neutro Imperial 500ml',
            unit: 'UN',
            quantity: 120,
            unitPrice: 3.80,
            discountPercent: 4.76,
            discountValue: 22.80,
            totalPrice: 456.00,
            unitCost: 1.84,
            locationId: 'loc-comercial',
          },
          {
            id: 'item-4',
            productId: 'prod-desinfetante-5l',
            productCode: 'PA-302',
            description: 'Desinfetante Floral Imperial Profissional 5L',
            unit: 'UN',
            quantity: 20,
            unitPrice: 21.50,
            discountPercent: 6.11,
            discountValue: 28.00,
            totalPrice: 430.00,
            unitCost: 9.85,
            locationId: 'loc-comercial',
          },
        ],
        subtotal: 908.00,
        discountTotal: 50.80,
        total: 886.00,
        paymentMethod: 'boleto',
        installmentsCount: 2,
        receivedAmount: 0,
        changeAmount: 0,
        status: 'aberto',
        validityDate: '2026-10-15',
        notes: 'Orçamento com condição especial de atacado para 28 dias',
        stockDeducted: false,
        financialGenerated: false,
        createdAt: `${todayStr}T10:00:00.000Z`,
        updatedAt: `${todayStr}T10:00:00.000Z`,
      },
      {
        id: 'ord-venda-ext-hoje',
        number: 'PED-EXT-2026-0001',
        type: 'venda',
        origin: 'externa_celular',
        companyId: companyMatrizId,
        customerId: 'cli-004',
        customerName: 'Maria Helena dos Santos',
        userId: 'usr-vendedor-externo',
        userName: 'Bruno Lima',
        items: [
          {
            id: 'item-ext-1',
            productId: 'prod-detergente-500',
            productCode: 'PA-301',
            description: 'Detergente Líquido Neutro Imperial 500ml',
            unit: 'UN',
            quantity: 20,
            unitPrice: 3.99,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 79.80,
            unitCost: 1.84,
            locationId: 'loc-comercial',
          },
          {
            id: 'item-ext-2',
            productId: 'prod-desinfetante-5l',
            productCode: 'PA-302',
            description: 'Desinfetante Floral Imperial Profissional 5L',
            unit: 'UN',
            quantity: 4,
            unitPrice: 21.50,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 86.00,
            unitCost: 9.85,
            locationId: 'loc-comercial',
          },
        ],
        subtotal: 165.80,
        discountTotal: 0,
        total: 165.80,
        paymentMethod: 'pix',
        installmentsCount: 1,
        receivedAmount: 165.80,
        changeAmount: 0,
        status: 'concluido',
        stockDeducted: true,
        financialGenerated: true,
        createdAt: `${todayStr}T09:30:00.000Z`,
        updatedAt: `${todayStr}T09:30:00.000Z`,
      },
      {
        id: 'ord-venda-ext-mes',
        number: 'PED-EXT-2026-0002',
        type: 'venda',
        origin: 'externa_celular',
        companyId: companyMatrizId,
        customerId: 'cli-001',
        customerName: 'Supermercado Subaé Ltda',
        userId: 'usr-vendedor-externo',
        userName: 'Bruno Lima',
        items: [
          {
            id: 'item-ext-3',
            productId: 'prod-desinfetante-5l',
            productCode: 'PA-302',
            description: 'Desinfetante Floral Imperial Profissional 5L',
            unit: 'UN',
            quantity: 25,
            unitPrice: 21.50,
            discountPercent: 5,
            discountValue: 26.88,
            totalPrice: 510.62,
            unitCost: 9.85,
            locationId: 'loc-comercial',
          },
        ],
        subtotal: 537.50,
        discountTotal: 26.88,
        total: 510.62,
        paymentMethod: 'boleto',
        installmentsCount: 2,
        receivedAmount: 0,
        changeAmount: 0,
        status: 'concluido',
        stockDeducted: true,
        financialGenerated: true,
        createdAt: `${todayStr.slice(0, 7)}-01T14:15:00.000Z`,
        updatedAt: `${todayStr.slice(0, 7)}-01T14:15:00.000Z`,
      },
      {
        id: 'ped-rom-1',
        number: 'PED-2026-0008',
        type: 'venda',
        origin: 'pedidos_venda',
        companyId: companyMatrizId,
        customerId: 'cli-001',
        customerName: 'Supermercado Subaé Ltda',
        userId: 'usr-admin',
        userName: 'Carlos Silva',
        items: [
          {
            id: 'item-bo-1',
            productId: 'prod-detergente-500',
            productCode: 'PA-301',
            description: 'Detergente Líquido Neutro Imperial 500ml',
            unit: 'UN',
            quantity: 120,
            unitPrice: 3.5,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 420.0,
            unitCost: 1.84,
            locationId: 'loc-comercial',
          },
          {
            id: 'item-bo-2',
            productId: 'prod-desinfetante-5l',
            productCode: 'PA-302',
            description: 'Desinfetante Floral Imperial Profissional 5L',
            unit: 'UN',
            quantity: 20,
            unitPrice: 21.0,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 420.0,
            unitCost: 9.85,
            locationId: 'loc-comercial',
          },
        ],
        subtotal: 840.0,
        discountTotal: 0,
        total: 840.0,
        paymentMethod: 'boleto',
        installmentsCount: 2,
        receivedAmount: 0,
        changeAmount: 0,
        status: 'entregue',
        stockDeducted: true,
        financialGenerated: true,
        deliveryStatus: 'entregue',
        deliveryManifestId: 'rom-001',
        deliveryManifestNumber: 'ROM-2026-0001',
        preManifestStatus: 'concluido',
        preManifestDeliveryStatus: 'pendente',
        createdAt: `${todayStr.slice(0, 7)}-04T14:20:00.000Z`,
        updatedAt: `${todayStr.slice(0, 7)}-04T14:20:00.000Z`,
      },
      {
        id: 'ped-rom-2',
        number: 'PED-2026-0012',
        type: 'venda',
        origin: 'pedidos_venda',
        companyId: companyMatrizId,
        customerId: 'cli-003',
        customerName: 'Lava Rápido & Auto Posto Jacuípe',
        userId: 'usr-vendedor-externo',
        userName: 'Bruno Lima',
        items: [
          {
            id: 'item-bo-3',
            productId: 'prod-detergente-500',
            productCode: 'PA-301',
            description: 'Detergente Líquido Neutro Imperial 500ml',
            unit: 'UN',
            quantity: 80,
            unitPrice: 3.5,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 280.0,
            unitCost: 1.84,
            locationId: 'loc-comercial',
          },
          {
            id: 'item-bo-4',
            productId: 'prod-pano-microfibra',
            productCode: 'REV-404',
            description: 'Pano Microfibra Multiuso 40x40cm (Pacote com 5 unid)',
            unit: 'PCT',
            quantity: 14,
            unitPrice: 20.0,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 280.0,
            unitCost: 9.0,
            locationId: 'loc-comercial',
          },
        ],
        subtotal: 560.0,
        discountTotal: 0,
        total: 560.0,
        paymentMethod: 'dinheiro',
        installmentsCount: 1,
        receivedAmount: 560.0,
        changeAmount: 0,
        status: 'em_transito',
        stockDeducted: true,
        financialGenerated: true,
        deliveryStatus: 'em_transito',
        deliveryManifestId: 'rom-001',
        deliveryManifestNumber: 'ROM-2026-0001',
        preManifestStatus: 'concluido',
        preManifestDeliveryStatus: 'pendente',
        createdAt: `${todayStr.slice(0, 7)}-05T16:40:00.000Z`,
        updatedAt: `${todayStr.slice(0, 7)}-05T16:40:00.000Z`,
      },
      {
        id: 'ped-rom-3',
        number: 'PED-2026-0015',
        type: 'venda',
        origin: 'pedidos_venda',
        companyId: companyMatrizId,
        customerId: 'cli-004',
        customerName: 'Maria Helena dos Santos',
        userId: 'usr-admin',
        userName: 'Carlos Silva',
        items: [
          {
            id: 'item-bo-5',
            productId: 'prod-desinfetante-5l',
            productCode: 'PA-302',
            description: 'Desinfetante Floral Imperial Profissional 5L',
            unit: 'UN',
            quantity: 10,
            unitPrice: 21.0,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 210.0,
            unitCost: 9.85,
            locationId: 'loc-comercial',
          },
          {
            id: 'item-bo-6',
            productId: 'prod-pano-microfibra',
            productCode: 'REV-404',
            description: 'Pano Microfibra Multiuso 40x40cm (Pacote com 5 unid)',
            unit: 'PCT',
            quantity: 3,
            unitPrice: 23.33,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 70.0,
            unitCost: 9.0,
            locationId: 'loc-comercial',
          },
        ],
        subtotal: 280.0,
        discountTotal: 0,
        total: 280.0,
        paymentMethod: 'pix',
        installmentsCount: 1,
        receivedAmount: 280.0,
        changeAmount: 0,
        status: 'em_transito',
        stockDeducted: true,
        financialGenerated: true,
        deliveryStatus: 'em_transito',
        deliveryManifestId: 'rom-001',
        deliveryManifestNumber: 'ROM-2026-0001',
        preManifestStatus: 'concluido',
        preManifestDeliveryStatus: 'pendente',
        createdAt: `${todayStr}T07:15:00.000Z`,
        updatedAt: `${todayStr}T07:15:00.000Z`,
      },
      {
        id: 'ord-ba-alagoinhas-01',
        number: 'PED-2026-0018',
        type: 'venda',
        origin: 'pedidos_venda',
        companyId: companyMatrizId,
        customerId: 'cli-002',
        customerName: 'Condomínio Residencial Portal de Alagoinhas',
        userId: 'usr-admin',
        userName: 'Roberto Vendas',
        items: [
          {
            id: 'item-ba-1',
            productId: 'prod-desinfetante-5l',
            productCode: 'PA-302',
            description: 'Desinfetante Floral Imperial Profissional 5L',
            unit: 'UN',
            quantity: 40,
            unitPrice: 21.50,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 860.00,
            unitCost: 9.85,
            locationId: 'loc-comercial',
          },
          {
            id: 'item-ba-2',
            productId: 'prod-detergente-500',
            productCode: 'PA-301',
            description: 'Detergente Líquido Neutro Imperial 500ml',
            unit: 'UN',
            quantity: 130,
            unitPrice: 4.00,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 520.00,
            unitCost: 1.84,
            locationId: 'loc-comercial',
          },
        ],
        subtotal: 1380.00,
        discountTotal: 0,
        total: 1380.00,
        paymentMethod: 'boleto',
        installmentsCount: 2,
        receivedAmount: 0,
        changeAmount: 0,
        status: 'concluido',
        stockDeducted: true,
        financialGenerated: true,
        createdAt: `${todayStr.slice(0, 7)}-08T10:20:00.000Z`,
        updatedAt: `${todayStr.slice(0, 7)}-08T10:20:00.000Z`,
      },
      {
        id: 'ord-ba-saj-01',
        number: 'PED-2026-0019',
        type: 'venda',
        origin: 'pedidos_venda',
        companyId: companyMatrizId,
        customerId: 'cli-005',
        customerName: 'Mercado Recôncavo Sul Ltda',
        userId: 'usr-admin',
        userName: 'Mariana Oliveira',
        items: [
          {
            id: 'item-ba-3',
            productId: 'prod-desinfetante-5l',
            productCode: 'PA-302',
            description: 'Desinfetante Floral Imperial Profissional 5L',
            unit: 'UN',
            quantity: 30,
            unitPrice: 22.00,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 660.00,
            unitCost: 9.85,
            locationId: 'loc-comercial',
          },
          {
            id: 'item-ba-4',
            productId: 'prod-pano-microfibra',
            productCode: 'REV-404',
            description: 'Pano Microfibra Multiuso 40x40cm (Pacote com 5 unid)',
            unit: 'PCT',
            quantity: 14,
            unitPrice: 20.00,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 280.00,
            unitCost: 9.00,
            locationId: 'loc-comercial',
          },
        ],
        subtotal: 940.00,
        discountTotal: 0,
        total: 940.00,
        paymentMethod: 'boleto',
        installmentsCount: 2,
        receivedAmount: 0,
        changeAmount: 0,
        status: 'concluido',
        stockDeducted: true,
        financialGenerated: true,
        createdAt: `${todayStr.slice(0, 7)}-09T11:10:00.000Z`,
        updatedAt: `${todayStr.slice(0, 7)}-09T11:10:00.000Z`,
      },
      {
        id: 'ord-ba-cachoeira-01',
        number: 'PED-2026-0020',
        type: 'venda',
        origin: 'externa_celular',
        companyId: companyMatrizId,
        customerId: 'cli-007',
        customerName: 'Restaurante & Pousada Cachoeira Histórica',
        userId: 'usr-vendedor-externo',
        userName: 'Carlos Silva',
        items: [
          {
            id: 'item-ba-5',
            productId: 'prod-desinfetante-5l',
            productCode: 'PA-302',
            description: 'Desinfetante Floral Imperial Profissional 5L',
            unit: 'UN',
            quantity: 20,
            unitPrice: 21.00,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 420.00,
            unitCost: 9.85,
            locationId: 'loc-comercial',
          },
          {
            id: 'item-ba-6',
            productId: 'prod-vassoura-piacava',
            productCode: 'REV-401',
            description: 'Vassoura de Piaçava Natural Cabo Madeira 1,20m',
            unit: 'UN',
            quantity: 10,
            unitPrice: 20.00,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 200.00,
            unitCost: 9.20,
            locationId: 'loc-comercial',
          },
        ],
        subtotal: 620.00,
        discountTotal: 0,
        total: 620.00,
        paymentMethod: 'pix',
        installmentsCount: 1,
        receivedAmount: 620.00,
        changeAmount: 0,
        status: 'concluido',
        stockDeducted: true,
        financialGenerated: true,
        createdAt: `${todayStr.slice(0, 7)}-10T15:00:00.000Z`,
        updatedAt: `${todayStr.slice(0, 7)}-10T15:00:00.000Z`,
      },
      {
        id: 'ord-ba-serrinha-01',
        number: 'PED-2026-0021',
        type: 'venda',
        origin: 'pedidos_venda',
        companyId: companyMatrizId,
        customerId: 'cli-006',
        customerName: 'Atacadão Portal do Sisal Ltda',
        userId: 'usr-vendedor-externo',
        userName: 'Bruno Lima',
        items: [
          {
            id: 'item-ba-7',
            productId: 'prod-detergente-500',
            productCode: 'PA-301',
            description: 'Detergente Líquido Neutro Imperial 500ml',
            unit: 'UN',
            quantity: 250,
            unitPrice: 3.80,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 950.00,
            unitCost: 1.84,
            locationId: 'loc-comercial',
          },
          {
            id: 'item-ba-8',
            productId: 'prod-desinfetante-5l',
            productCode: 'PA-302',
            description: 'Desinfetante Floral Imperial Profissional 5L',
            unit: 'UN',
            quantity: 35,
            unitPrice: 20.00,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 700.00,
            unitCost: 9.85,
            locationId: 'loc-comercial',
          },
        ],
        subtotal: 1650.00,
        discountTotal: 0,
        total: 1650.00,
        paymentMethod: 'boleto',
        installmentsCount: 2,
        receivedAmount: 0,
        changeAmount: 0,
        status: 'concluido',
        stockDeducted: true,
        financialGenerated: true,
        createdAt: `${todayStr}T08:40:00.000Z`,
        updatedAt: `${todayStr}T08:40:00.000Z`,
      },
      {
        id: 'ord-ba-cruz-01',
        number: 'PED-2026-0022',
        type: 'venda',
        origin: 'pedidos_venda',
        companyId: companyMatrizId,
        customerId: 'cli-008',
        customerName: 'Distribuidora Cruz das Almas Comércio Ltda',
        userId: 'usr-admin',
        userName: 'Mariana Oliveira',
        items: [
          {
            id: 'item-ba-9',
            productId: 'prod-desinfetante-5l',
            productCode: 'PA-302',
            description: 'Desinfetante Floral Imperial Profissional 5L',
            unit: 'UN',
            quantity: 20,
            unitPrice: 21.50,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 430.00,
            unitCost: 9.85,
            locationId: 'loc-comercial',
          },
          {
            id: 'item-ba-10',
            productId: 'prod-rodo-duplo',
            productCode: 'REV-402',
            description: 'Rodo Alumínio Profissional 40cm Dupla Borracha',
            unit: 'UN',
            quantity: 6,
            unitPrice: 25.00,
            discountPercent: 0,
            discountValue: 0,
            totalPrice: 150.00,
            unitCost: 11.40,
            locationId: 'loc-comercial',
          },
        ],
        subtotal: 580.00,
        discountTotal: 0,
        total: 580.00,
        paymentMethod: 'boleto',
        installmentsCount: 1,
        receivedAmount: 0,
        changeAmount: 0,
        status: 'concluido',
        stockDeducted: true,
        financialGenerated: true,
        createdAt: `${todayStr}T09:10:00.000Z`,
        updatedAt: `${todayStr}T09:10:00.000Z`,
      },
    ];

    // Contas a Receber
    const accountsReceivable: AccountReceivable[] = [
      {
        id: 'rec-001',
        companyId: companyMatrizId,
        orderId: 'ord-venda-antiga',
        orderNumber: 'VD-2026-0000',
        customerId: 'cli-002',
        customerName: 'Condomínio Residencial Portal de Alagoinhas',
        docNumber: 'DUP-1042',
        installmentNumber: 1,
        totalInstallments: 1,
        issueDate: '2026-09-20',
        dueDate: '2026-10-20',
        originalValue: 640.0,
        discount: 0,
        addition: 0,
        paidValue: 0,
        balance: 640.0,
        paymentMethod: 'Boleto',
        status: 'aberto',
        receipts: [],
      },
      {
        id: 'rec-overdue-001',
        companyId: companyMatrizId,
        orderId: 'ord-atrasada-01',
        orderNumber: 'VD-2026-0034',
        customerId: 'cli-001',
        customerName: 'Supermercado Subaé Ltda',
        docNumber: 'DUP-1048/1',
        installmentNumber: 1,
        totalInstallments: 2,
        issueDate: '2026-08-25',
        dueDate: '2026-09-25',
        originalValue: 540.0,
        discount: 0,
        addition: 0,
        paidValue: 0,
        balance: 540.0,
        paymentMethod: 'Boleto Bancário',
        status: 'aberto',
        receipts: [],
      },
      {
        id: 'rec-overdue-002',
        companyId: companyMatrizId,
        orderId: 'ord-atrasada-02',
        orderNumber: 'VD-2026-0029',
        customerId: 'cli-003',
        customerName: 'Lava Rápido & Auto Posto Jacuípe',
        docNumber: 'DUP-1033/2',
        installmentNumber: 2,
        totalInstallments: 3,
        issueDate: '2026-08-15',
        dueDate: '2026-09-15',
        originalValue: 380.0,
        discount: 0,
        addition: 0,
        paidValue: 0,
        balance: 380.0,
        paymentMethod: 'Boleto Bancário',
        status: 'aberto',
        receipts: [],
      },
    ];

    // Contas a Pagar
    const accountsPayable: AccountPayable[] = [
      {
        id: 'pag-001',
        companyId: companyMatrizId,
        supplierId: 'for-001',
        supplierName: 'Polo Petroquímico Química Bahia S.A.',
        description: 'Compra de Base Tensoativa Lote 24',
        category: 'fornecedores',
        docNumber: 'NF-89210',
        installmentNumber: 1,
        totalInstallments: 2,
        issueDate: '2026-09-15',
        dueDate: '2026-10-15',
        originalValue: 1200.0,
        discount: 0,
        addition: 0,
        paidValue: 0,
        balance: 1200.0,
        status: 'aberto',
        payments: [],
        notes: 'Primeira parcela da compra de insumos',
      },
      {
        id: 'pag-002',
        companyId: companyMatrizId,
        supplierName: 'Imobiliária Subaé Feira Ltda',
        description: 'Aluguel do Galpão Industrial CIS - Feira de Santana/BA',
        category: 'aluguel',
        docNumber: 'ALUG-10/26',
        installmentNumber: 1,
        totalInstallments: 1,
        issueDate: '2026-10-01',
        dueDate: '2026-10-10',
        originalValue: 2800.0,
        discount: 0,
        addition: 0,
        paidValue: 0,
        balance: 2800.0,
        status: 'aberto',
        payments: [],
      },
    ];

    // Pedidos de Compra de Exemplo
    const purchaseOrders: PurchaseOrder[] = [
      {
        id: 'pc-001',
        number: 'PC-2026-0001',
        companyId: companyMatrizId,
        supplierId: 'for-002',
        supplierName: 'Plásticos & Embalagens Recôncavo Ltda',
        orderDate: '2026-10-02',
        expectedDeliveryDate: '2026-10-08',
        paymentTerms: '30 dias',
        installmentsCount: 1,
        status: 'aguardando_entrega',
        items: [
          {
            productId: 'prod-emb-frasco-500',
            productCode: 'EMB-201',
            description: 'Frasco PET 500ml Transparente',
            buyUnit: 'CX',
            saleUnit: 'UN',
            packageFactor: 100,
            buyQuantity: 10, // 10 caixas x 100 = 1000 un
            unitCost: 65.0, // R$ 65 por caixa (R$ 0,65 por un)
            discount: 20.0,
            freightApportioned: 30.0,
            otherExpensesApportioned: 0,
            totalCost: 660.0,
            receivedQuantity: 0,
            pendingQuantity: 1000,
            destinationLocationId: 'loc-embalagens',
          },
        ],
        subtotal: 650.0,
        discountTotal: 20.0,
        freightTotal: 30.0,
        otherExpensesTotal: 0,
        total: 660.0,
        userId: 'usr-admin',
        userName: 'Romeu Júnior',
        createdAt: '2026-10-02T14:30:00.000Z',
      },
    ];

    // Auditoria Inicial
    const auditLogs: AuditLog[] = [
      {
        id: 'log-init-1',
        companyId: companyMatrizId,
        userId: 'usr-admin',
        userName: 'Romeu Júnior',
        action: 'INICIALIZACAO_SISTEMA',
        module: 'SISTEMA',
        recordId: 'SISTEMA',
        details: 'Implantação inicial do GestãoFácil ERP com banco integrado e multi-local',
        timestamp: new Date().toISOString(),
      },
    ];

    return {
      companies,
      users,
      currentCompanyId: companyMatrizId,
      currentUserId: 'usr-admin',
      stockLocations,
      products,
      stockBalances,
      stockMovements: [],
      customers,
      suppliers,
      orders,
      cashRegisters,
      accountsReceivable,
      accountsPayable,
      purchaseOrders,
      purchaseReceipts: [],
      productionOrders: [],
      transferOrders: [],
      inventoryCounts: [],
      auditLogs,
      components: [...DEFAULT_COMPONENTS],
      paymentMethods: [...DEFAULT_PAYMENT_METHODS],
      financialAccounts: [...DEFAULT_FINANCIAL_ACCOUNTS],
      paymentTermsList: [...DEFAULT_PAYMENT_TERMS],
      deliveryRoutes: [...DEFAULT_DELIVERY_ROUTES],
      deliveryDrivers: [...DEFAULT_DELIVERY_DRIVERS],
      deliveryVehicles: [...DEFAULT_DELIVERY_VEHICLES],
      deliveryManifests: [...DEFAULT_DELIVERY_MANIFESTS],
      states: [...DEFAULT_STATES],
      marketAreas: [...DEFAULT_MARKET_AREAS],
      cities: [...DEFAULT_CITIES],
      neighborhoods: [...DEFAULT_NEIGHBORHOODS],
      stockControlConfig: { ...DEFAULT_STOCK_CONTROL_CONFIG },
      chartOfAccounts: [...DEFAULT_CHART_OF_ACCOUNTS],
      salesReturns: [],
      customerVouchers: [],
    };
  }

  /**
   * Verifica se a Empresa Matriz precisa de configuração inicial.
   * Retorna verdadeiro se o sistema foi restaurado de fábrica e a Matriz ainda não foi cadastrada.
   */
  public static isNeedsMatrizSetup(): boolean {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        if (localStorage.getItem('gestaofacil_needs_matriz_setup') === 'true') {
          return true;
        }
      }
      const st = this.getState();
      const matriz = st.companies?.find((c) => c.type === 'matriz') || st.companies?.[0];
      if (!matriz || !matriz.cnpjCpf || matriz.cnpjCpf.trim() === '') {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Conclui a configuração inicial da Empresa Matriz após restauração de fábrica.
   */
  public static completeMatrizSetup(data: {
    name: string;
    tradeName: string;
    cnpjCpf: string;
    ie?: string;
    phone?: string;
    email?: string;
    logoUrl?: string;
    address: {
      street: string;
      number: string;
      neighborhood: string;
      city: string;
      state: string;
      zipCode: string;
    };
  }): void {
    const st = this.getState();
    const nowIso = new Date().toISOString();
    let matriz = st.companies?.find((c) => c.type === 'matriz') || st.companies?.[0];
    if (!matriz) {
      matriz = {
        id: 'comp-matriz',
        name: data.name.trim(),
        tradeName: (data.tradeName || data.name).trim(),
        cnpjCpf: data.cnpjCpf.trim(),
        type: 'matriz',
        phone: (data.phone || '').trim(),
        email: (data.email || '').trim(),
        address: data.address,
        status: 'ativo',
        logoUrl: data.logoUrl?.trim() || undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      st.companies = [matriz];
    } else {
      matriz.name = data.name.trim();
      matriz.tradeName = (data.tradeName || data.name).trim();
      matriz.cnpjCpf = data.cnpjCpf.trim();
      matriz.phone = (data.phone || '').trim();
      matriz.email = (data.email || '').trim();
      matriz.address = data.address;
      matriz.status = 'ativo';
      matriz.updatedAt = nowIso;
      if (data.logoUrl !== undefined) {
        matriz.logoUrl = data.logoUrl?.trim() || undefined;
      }
    }

    st.currentCompanyId = matriz.id;

    // Atualiza empresa nos estoques e caixas
    if (st.stockLocations && st.stockLocations.length > 0) {
      st.stockLocations[0].companyId = matriz.id;
    }
    if (st.financialAccounts && st.financialAccounts.length > 0) {
      st.financialAccounts.forEach((acc) => {
        acc.companyId = matriz.id;
      });
    }

    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.removeItem('gestaofacil_needs_matriz_setup');
      }
    } catch {}

    this.addAuditLog(
      'CADASTRO_EMPRESA_MATRIZ',
      'CONFIGURACOES',
      matriz.id,
      `Configuração inicial da Empresa Matriz concluída: ${matriz.name} (${matriz.cnpjCpf}). Sistema pronto para operações.`
    );

    this.persist();
  }

  /**
   * Atualiza ou remove a logomarca de uma empresa/filial específica.
   */
  public static updateCompanyLogo(companyId: string, logoUrl?: string): boolean {
    const st = this.getState();
    const comp = st.companies?.find((c) => c.id === companyId);
    if (!comp) return false;

    comp.logoUrl = logoUrl?.trim() || undefined;
    comp.updatedAt = new Date().toISOString();
    this.addAuditLog(
      'ATUALIZAR_LOGO_EMPRESA',
      'CONFIGURACOES',
      companyId,
      `Logomarca da empresa "${comp.tradeName || comp.name}" ${logoUrl ? 'atualizada' : 'removida'}.`
    );
    this.persist();
    return true;
  }

  /**
   * Gera o estado inicial 100% limpo (zerado) para o sistema começar do zero.
   * Contém estritamente o usuário Admin padrão e uma Matriz vazia para preenchimento.
   */
  public static getCleanZeroState(includeResetLog: boolean = true): DatabaseState {
    const companyMatrizId = 'comp-matriz';
    const companies: Company[] = [
      {
        id: companyMatrizId,
        name: 'Minha Empresa Matriz',
        tradeName: 'Empresa Matriz',
        cnpjCpf: '',
        type: 'matriz',
        phone: '',
        email: '',
        address: {
          street: '',
          number: '',
          neighborhood: '',
          city: '',
          state: 'BA',
          zipCode: '',
        },
        status: 'ativo',
      },
    ];

    // Preserva rigorosamente apenas o Admin mestre
    const users: User[] = [
      {
        id: 'usr-admin',
        name: 'Administrador Geral',
        login: 'admin',
        role: 'admin',
        email: 'romeujr.suporte@gmail.com',
        companyId: companyMatrizId,
        status: 'ativo',
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
      },
    ];

    const stockLocations: StockLocation[] = [
      {
        id: 'loc-comercial',
        code: 'COM-01',
        name: 'Comercial',
        companyId: companyMatrizId,
        description: 'Estoque Comercial padrão para vendas e expedição',
        type: 'comercial',
        status: 'ativo',
      },
    ];

    const cashRegisters: CashRegister[] = [
      {
        id: 'cx-01',
        companyId: companyMatrizId,
        userId: 'usr-admin',
        userName: 'Administrador Geral',
        openedAt: new Date().toISOString(),
        closedAt: new Date().toISOString(),
        initialBalance: 0,
        status: 'fechado',
        movements: [],
      },
    ];

    const auditLogs: AuditLog[] = includeResetLog
      ? [
          {
            id: 'log-clean-1',
            companyId: companyMatrizId,
            userId: 'usr-admin',
            userName: 'Administrador Geral',
            action: 'RESTAURACAO_PADROES_FABRICA',
            module: 'SISTEMA',
            recordId: 'SISTEMA',
            details: 'Sistema restaurado para padrões de fábrica. Iniciando do zero para configuração da Matriz.',
            timestamp: new Date().toISOString(),
          },
        ]
      : [];

    return {
      companies,
      users,
      currentCompanyId: companyMatrizId,
      currentUserId: 'usr-admin',
      stockLocations,
      products: [],
      stockBalances: [],
      stockMovements: [],
      customers: [],
      suppliers: [],
      orders: [],
      cashRegisters,
      accountsReceivable: [],
      accountsPayable: [],
      purchaseOrders: [],
      purchaseReceipts: [],
      productionOrders: [],
      transferOrders: [],
      inventoryCounts: [],
      auditLogs,
      components: [],
      paymentMethods: [...DEFAULT_PAYMENT_METHODS],
      financialAccounts: [
        {
          id: 'acc-caixa',
          companyId: companyMatrizId,
          code: 'CX-01',
          name: 'Caixa Geral Balcão',
          type: 'caixa',
          bankName: 'Caixa Físico Interno',
          initialBalance: 0,
          currentBalance: 0,
          isDefault: true,
          status: 'ativo',
          notes: 'Caixa operacional diário',
          createdAt: new Date().toISOString(),
        },
      ],
      paymentTermsList: [...DEFAULT_PAYMENT_TERMS],
      deliveryRoutes: [],
      deliveryDrivers: [],
      deliveryVehicles: [],
      deliveryManifests: [],
      states: [...DEFAULT_STATES],
      marketAreas: [],
      cities: [...DEFAULT_CITIES],
      neighborhoods: [],
      stockControlConfig: { ...DEFAULT_STOCK_CONTROL_CONFIG },
      chartOfAccounts: [...DEFAULT_CHART_OF_ACCOUNTS],
      salesReturns: [],
      customerVouchers: [],
    };
  }
}
