/**
 * Motor de Gestão de Estoque Multi-Local
 * Controla saldos, reservas, transferências e integridade transacional
 */

import {
  Product,
  StockLocation,
  ProductStockBalance,
  StockMovement,
  MovementType,
  Company,
  CompanyStockTransfer,
} from '../types';
import { Database } from './db';

export class StockEngine {
  /**
   * Obtém o saldo de um produto em um local específico
   * Se o produto for uma Embalagem Master, calcula o saldo correspondente a partir do produto unitário associado
   */
  public static getBalance(
    balances: ProductStockBalance[],
    productId: string,
    locationId: string,
    productsList?: Product[]
  ): ProductStockBalance {
    const products = productsList || Database?.getState?.()?.products || [];
    const prod = products.find((p) => p.id === productId);

    // Se for Embalagem Master vinculada a produto unitário
    if (prod?.isMasterPack && prod.masterPackAssociatedProductId && (prod.masterPackUnits || 1) > 0) {
      const multiplier = prod.masterPackUnits || 1;
      const assocBal = this.getBalance(balances, prod.masterPackAssociatedProductId, locationId, products);
      const directBal = balances.find((b) => b.productId === productId && b.locationId === locationId);
      const directQty = directBal?.quantity || 0;
      const directRes = directBal?.reserved || 0;

      const convertedQty = Math.floor(assocBal.quantity / multiplier);
      const convertedRes = Math.ceil(assocBal.reserved / multiplier);

      return {
        productId,
        locationId,
        quantity: convertedQty + directQty,
        reserved: convertedRes + directRes,
        minStock: prod.minStock || 0,
      };
    }

    const found = balances.find(
      (b) => b.productId === productId && b.locationId === locationId
    );
    if (found) return found;
    return {
      productId,
      locationId,
      quantity: 0,
      reserved: 0,
      minStock: 0,
    };
  }

  /**
   * Obtém a soma total do saldo físico e disponível de um produto em todos os locais (ou filtrado por empresa)
   * Se for Embalagem Master, reflete proporcionalmente a disponibilidade do produto associado
   */
  public static getTotalProductStock(
    balances: ProductStockBalance[],
    productId: string,
    productsListOrCompanyId?: Product[] | string,
    companyIdParam?: string
  ): { physical: number; reserved: number; available: number } {
    let productsList: Product[] | undefined;
    let companyId: string | undefined = companyIdParam;
    if (typeof productsListOrCompanyId === 'string') {
      companyId = productsListOrCompanyId;
      productsList = Database?.getState?.()?.products || [];
    } else {
      productsList = productsListOrCompanyId;
    }
    const products = productsList || Database?.getState?.()?.products || [];
    const prod = products.find((p) => p.id === productId);

    // Se houver filtro de empresa, filtra apenas depósitos dessa empresa
    let effectiveBalances = balances;
    if (companyId) {
      const stateLocs = Database?.getState?.()?.stockLocations || [];
      const companyLocIds = new Set(stateLocs.filter((l) => l.companyId === companyId).map((l) => l.id));
      effectiveBalances = balances.filter(
        (b) => companyLocIds.has(b.locationId) || (b.companyId && b.companyId === companyId)
      );
    }

    // Se for Embalagem Master vinculada a produto unitário
    if (prod?.isMasterPack && prod.masterPackAssociatedProductId && (prod.masterPackUnits || 1) > 0) {
      const multiplier = prod.masterPackUnits || 1;
      const assocStock = this.getTotalProductStock(effectiveBalances, prod.masterPackAssociatedProductId, products, companyId);
      
      const directBalances = effectiveBalances.filter((b) => b.productId === productId);
      const directPhysical = directBalances.reduce((sum, b) => sum + (b.quantity || 0), 0);
      const directReserved = directBalances.reduce((sum, b) => sum + (b.reserved || 0), 0);

      const convertedPhysical = Math.floor(assocStock.physical / multiplier);
      const convertedReserved = Math.ceil(assocStock.reserved / multiplier);
      const convertedAvailable = Math.floor(assocStock.available / multiplier);

      return {
        physical: convertedPhysical + directPhysical,
        reserved: convertedReserved + directReserved,
        available: Math.max(0, convertedAvailable + Math.max(0, directPhysical - directReserved)),
      };
    }

    const productBalances = effectiveBalances.filter((b) => b.productId === productId);
    const physical = productBalances.reduce((sum, b) => sum + (b.quantity || 0), 0);
    const reserved = productBalances.reduce((sum, b) => sum + (b.reserved || 0), 0);
    const available = physical - reserved; // Mantém saldo negativo visível se o estoque estiver negativo
    return { physical, reserved, available };
  }

  /**
   * Registra uma movimentação e atualiza a matriz de saldos
   * Se o produto for Embalagem Master, a baixa/entrada é convertida e aplicada no produto unitário associado
   */
  public static applyMovement(
    currentBalances: ProductStockBalance[],
    movement: Omit<StockMovement, 'id'>,
    options?: { allowNegativeStock?: boolean; products?: Product[] }
  ): {
    updatedBalances: ProductStockBalance[];
    createdMovement: StockMovement;
  } {
    const products = options?.products || Database?.getState?.()?.products || [];
    const masterProduct = products.find((p) => p.id === movement.productId);
    const isMaster = !!(
      masterProduct?.isMasterPack &&
      masterProduct.masterPackAssociatedProductId &&
      (masterProduct.masterPackUnits || 1) > 0
    );

    const multiplier = isMaster ? (masterProduct!.masterPackUnits || 1) : 1;
    const targetProductId = isMaster ? masterProduct!.masterPackAssociatedProductId! : movement.productId;
    const associatedProduct = isMaster ? products.find((p) => p.id === targetProductId) : null;
    const effectiveQuantity = movement.quantity * multiplier;

    const movementId = 'MOV-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    
    // Anotação clara sobre a Embalagem Master
    let movementNotes = movement.notes || '';
    if (isMaster) {
      const packLabel = masterProduct!.unit || 'CX';
      const unitLabel = associatedProduct?.unit || 'UN';
      const packName = masterProduct!.description;
      const assocName = associatedProduct?.description || masterProduct!.masterPackAssociatedProductDescription || '';
      movementNotes = `${movementNotes ? movementNotes + ' • ' : ''}[Embalagem Master: ${movement.quantity} ${packLabel} de "${packName}" (${multiplier} un/emb = Baixa de ${effectiveQuantity} ${unitLabel} de "${assocName}")]`;
    }

    const createdMovement: StockMovement = {
      id: movementId,
      ...movement,
      productId: isMaster ? targetProductId : movement.productId,
      productCode: isMaster ? (associatedProduct?.code || movement.productCode) : movement.productCode,
      productDescription: isMaster ? (associatedProduct?.description || movement.productDescription) : movement.productDescription,
      quantity: effectiveQuantity,
      unitCost: isMaster ? (associatedProduct?.costPrice || (movement.unitCost / multiplier)) : movement.unitCost,
      totalCost: isMaster ? ((associatedProduct?.costPrice || (movement.unitCost / multiplier)) * effectiveQuantity) : movement.totalCost,
      notes: movementNotes,
      isMasterPackMovement: isMaster,
      masterPackProductId: isMaster ? masterProduct!.id : undefined,
      masterPackProductCode: isMaster ? masterProduct!.code : undefined,
      masterPackUnitsMultiplier: isMaster ? multiplier : undefined,
    };

    let updatedBalances = [...currentBalances];

    // Política de permitir estoque negativo configurada no sistema ou passada nas opções
    const allowNegative =
      options?.allowNegativeStock !== undefined
        ? options.allowNegativeStock
        : Database.canSellNegativeStock();

    const updateItemBalance = (prodId: string, locId: string, deltaQty: number) => {
      const idx = updatedBalances.findIndex(
        (b) => b.productId === prodId && b.locationId === locId
      );
      if (idx >= 0) {
        const current = updatedBalances[idx];
        const newQty = (current.quantity || 0) + deltaQty;
        if (deltaQty < 0 && newQty < 0 && !allowNegative) {
          if (isMaster) {
            const availPacks = Math.floor(current.quantity / multiplier);
            throw new Error(
              `Estoque insuficiente para a Embalagem Master "${masterProduct?.description}". Saldo atual do produto unitário associado "${associatedProduct?.description}": ${current.quantity} ${associatedProduct?.unit || 'UN'} (equivale a ${availPacks} caixas/pacotes), solicitado: ${movement.quantity} (${effectiveQuantity} ${associatedProduct?.unit || 'UN'}).`
            );
          }
          throw new Error(
            `Estoque insuficiente no local selecionado. Saldo atual: ${current.quantity}, solicitado: ${Math.abs(deltaQty)}`
          );
        }
        const balanceUpdatedAt = movement.date || new Date().toISOString();
        updatedBalances[idx] = {
          ...current,
          quantity: newQty,
          companyId: movement.companyId || current.companyId,
          updatedAt: balanceUpdatedAt,
        };
      } else {
        if (deltaQty < 0 && !allowNegative) {
          if (isMaster) {
            throw new Error(
              `Estoque insuficiente. O produto unitário associado "${associatedProduct?.description}" possui saldo 0 no local selecionado.`
            );
          }
          throw new Error(
            `Estoque insuficiente no local. Saldo atual: 0, solicitado: ${Math.abs(deltaQty)}`
          );
        }
        updatedBalances.push({
          productId: prodId,
          locationId: locId,
          quantity: deltaQty,
          reserved: 0,
          minStock: 0,
          companyId: movement.companyId,
          updatedAt: movement.date || new Date().toISOString(),
        });
      }
    };

    switch (movement.type) {
      case 'inicial':
      case 'entrada_compra':
      case 'entrada_producao':
      case 'devolucao':
      case 'transferencia_entrada':
      case 'transferencia_empresa_entrada':
        updateItemBalance(targetProductId, movement.locationId, effectiveQuantity);
        break;

      case 'saida_venda':
      case 'consumo_producao':
      case 'perda_avaria':
      case 'transferencia_saida':
      case 'transferencia_empresa_saida':
        updateItemBalance(targetProductId, movement.locationId, -effectiveQuantity);
        break;

      case 'ajuste_inventario':
        // No ajuste, a quantidade do movimento é a diferença
        updateItemBalance(targetProductId, movement.locationId, effectiveQuantity);
        break;
    }

    return { updatedBalances, createdMovement };
  }

  /**
   * Realiza transferência atômica entre dois locais de estoque
   */
  public static transferBetweenLocations(
    currentBalances: ProductStockBalance[],
    product: Product,
    originLocation: StockLocation,
    destLocation: StockLocation,
    quantity: number,
    userId: string,
    userName: string,
    companyId: string,
    notes?: string
  ): {
    updatedBalances: ProductStockBalance[];
    movements: StockMovement[];
  } {
    const originBal = this.getBalance(currentBalances, product.id, originLocation.id);
    if (originBal.quantity < quantity) {
      throw new Error(
        `Saldo insuficiente no local de origem "${originLocation.name}". Disponível: ${originBal.quantity}, Solicitado: ${quantity}`
      );
    }

    const docId = 'TRANSF-' + Date.now();
    const now = new Date().toISOString();

    // 1. Saída da Origem
    const exitRes = this.applyMovement(currentBalances, {
      companyId,
      productId: product.id,
      productCode: product.code,
      productDescription: product.description,
      locationId: originLocation.id,
      locationName: originLocation.name,
      toLocationId: destLocation.id,
      toLocationName: destLocation.name,
      type: 'transferencia_saida',
      quantity,
      unitCost: product.costPrice,
      totalCost: product.costPrice * quantity,
      originDocType: 'transferencia',
      originDocId: docId,
      date: now,
      userId,
      userName,
      notes: notes || `Transferência para ${destLocation.name}`,
    });

    // 2. Entrada no Destino (utiliza a empresa do local de destino se for transferência inter-empresas)
    const enterRes = this.applyMovement(exitRes.updatedBalances, {
      companyId: destLocation.companyId || companyId,
      productId: product.id,
      productCode: product.code,
      productDescription: product.description,
      locationId: destLocation.id,
      locationName: destLocation.name,
      toLocationId: originLocation.id,
      toLocationName: originLocation.name,
      type: 'transferencia_entrada',
      quantity,
      unitCost: product.costPrice,
      totalCost: product.costPrice * quantity,
      originDocType: 'transferencia',
      originDocId: docId,
      date: now,
      userId,
      userName,
      notes: notes || `Recebido por transferência de ${originLocation.name}`,
    });

    return {
      updatedBalances: enterRes.updatedBalances,
      movements: [exitRes.createdMovement, enterRes.createdMovement],
    };
  }

  // =========================================================================
  // GESTÃO MULTI-EMPRESA: TABELA DE PREÇOS & ESTOQUE POR MATRIZ E FILIAIS
  // =========================================================================

  /**
   * Obtém o preço de venda de um produto para a empresa especificada
   * Se a filial tiver preço próprio configurado, utiliza o preço da filial
   * Caso contrário, herda automaticamente o preço base da Matriz (salePrice)
   */
  public static getProductPriceForCompany(product?: Product | null, companyId?: string): number {
    if (!product) return 0;
    if (companyId && product.companyPrices?.[companyId]?.salePrice && product.companyPrices[companyId].salePrice > 0) {
      return product.companyPrices[companyId].salePrice;
    }
    return product.salePrice || 0;
  }

  /**
   * Obtém o preço de custo referencial de um produto para a empresa especificada
   * Se a filial tiver custo próprio, utiliza o da filial; senão herda o custo base da Matriz
   */
  public static getProductCostForCompany(product?: Product | null, companyId?: string): number {
    if (!product) return 0;
    if (companyId && product.companyPrices?.[companyId]?.costPrice && product.companyPrices[companyId].costPrice! > 0) {
      return product.companyPrices[companyId].costPrice!;
    }
    return product.costPrice || 0;
  }

  /**
   * Obtém o saldo físico, reservado e disponível de um produto para uma determinada empresa
   */
  public static getCompanyProductStock(
    balances: ProductStockBalance[],
    productId: string,
    companyId: string,
    _locationsList?: StockLocation[],
    productsList?: Product[]
  ): { physical: number; reserved: number; available: number } {
    return this.getTotalProductStock(balances, productId, productsList, companyId);
  }

  /**
   * Retorna a localização de estoque padrão ativa de uma determinada empresa para vendas/comercialização
   * Prioriza o depósito Comercial/Vendas/Loja da empresa, evitando saídas indevidas de Matéria-Prima
   */
  public static getCompanyDefaultLocation(locations: StockLocation[], companyId: string): StockLocation | undefined {
    const companyLocs = locations.filter((l) => (!l.companyId || l.companyId === companyId) && l.status === 'ativo');

    // Prioridade 1: Depósito Comercial / Loja / Vendas
    const commercial = companyLocs.find(
      (l) =>
        l.type === 'comercial' ||
        l.id === 'loc-comercial' ||
        l.name.toLowerCase().includes('comercial') ||
        l.name.toLowerCase().includes('loja') ||
        l.name.toLowerCase().includes('balc')
    );
    if (commercial) return commercial;

    // Prioridade 2: Depósito de Produto Acabado
    const pa = companyLocs.find((l) => l.type === 'acabados' || l.name.toLowerCase().includes('acabado'));
    if (pa) return pa;

    // Prioridade 3: Qualquer depósito que não seja Matéria-Prima ou Embalagens
    const nonMp = companyLocs.find(
      (l) => l.type !== 'materia_prima' && l.type !== 'embalagens' && !l.name.toLowerCase().includes('matéria')
    );
    if (nonMp) return nonMp;

    return companyLocs[0] || locations.find((l) => l.companyId === companyId);
  }

  /**
   * Monta a grade comparativa de saldos e preços de um produto em todas as empresas da rede
   * Utilizado para exibição rápida e relatórios consolidados (Matriz + Filiais)
   */
  public static getMultiCompanyStockGrid(
    balances: ProductStockBalance[],
    product: Product,
    companies: Company[],
    productsList?: Product[]
  ): Array<{
    company: Company;
    companyId: string;
    companyName: string;
    companyTradeName: string;
    companyType: 'matriz' | 'filial';
    locations: Array<{ locationId: string; locationName: string; quantity: number }>;
    price: number;
    salePrice: number;
    isCustomPrice: boolean;
    isInheritedPrice: boolean;
    physical: number;
    physicalStock: number;
    reserved: number;
    reservedStock: number;
    available: number;
    availableStock: number;
  }> {
    const allLocations = Database?.getState?.()?.stockLocations || [];
    return companies.map((comp) => {
      const stock = this.getTotalProductStock(balances, product.id, productsList, comp.id);
      const isCustomPrice = !!(
        product.companyPrices?.[comp.id]?.salePrice &&
        product.companyPrices[comp.id].salePrice > 0 &&
        product.companyPrices[comp.id].salePrice !== product.salePrice
      );
      const salePrice = this.getProductPriceForCompany(product, comp.id);
      const isInheritedPrice = !isCustomPrice;

      const compLocations = allLocations.filter((l) => l.companyId === comp.id);
      const locationsData = compLocations.map((loc) => {
        const bal = this.getBalance(balances, product.id, loc.id, productsList);
        return {
          locationId: loc.id,
          locationName: loc.name,
          quantity: bal.quantity,
        };
      });

      return {
        company: comp,
        companyId: comp.id,
        companyName: comp.name,
        companyTradeName: comp.tradeName || comp.name,
        companyType: comp.type,
        locations: locationsData,
        price: salePrice,
        salePrice,
        isCustomPrice,
        isInheritedPrice,
        physical: stock.physical,
        physicalStock: stock.physical,
        reserved: stock.reserved,
        reservedStock: stock.reserved,
        available: stock.available,
        availableStock: stock.available,
      };
    });
  }

  /**
   * Realiza a transferência de produtos entre Matriz e Filiais
   * Gera saída na empresa/depósito de origem e entrada na empresa/depósito de destino
   * com histórico compartilhado e rastreabilidade total
   */
  public static transferBetweenCompanies(
    currentBalances: ProductStockBalance[],
    paramsOrProduct:
      | {
          fromCompany: Company;
          fromLocation: StockLocation;
          toCompany: Company;
          toLocation: StockLocation;
          product: Product;
          quantity: number;
          unitCost?: number;
          userId: string;
          userName: string;
          notes?: string;
        }
      | Product,
    posFromCompany?: Company,
    posFromLocation?: StockLocation,
    posToCompany?: Company,
    posToLocation?: StockLocation,
    posQuantity?: number,
    posUserId?: string,
    posUserName?: string,
    posNotes?: string,
    posUnitCost?: number
  ): {
    updatedBalances: ProductStockBalance[];
    transferRecord: CompanyStockTransfer;
    transfer: CompanyStockTransfer;
    movements: StockMovement[];
  } {
    let fromCompany: Company;
    let fromLocation: StockLocation;
    let toCompany: Company;
    let toLocation: StockLocation;
    let product: Product;
    let quantity: number;
    let unitCost: number;
    let userId: string;
    let userName: string;
    let notes: string;

    if ('fromCompany' in (paramsOrProduct as any)) {
      const p = paramsOrProduct as any;
      fromCompany = p.fromCompany;
      fromLocation = p.fromLocation;
      toCompany = p.toCompany;
      toLocation = p.toLocation;
      product = p.product;
      quantity = p.quantity;
      unitCost = p.unitCost ?? (product?.costPrice || 0);
      userId = p.userId;
      userName = p.userName;
      notes = p.notes || '';
    } else {
      product = paramsOrProduct as Product;
      fromCompany = posFromCompany!;
      fromLocation = posFromLocation!;
      toCompany = posToCompany!;
      toLocation = posToLocation!;
      quantity = posQuantity || 1;
      userId = posUserId || 'USR-SYSTEM';
      userName = posUserName || 'Sistema';
      notes = posNotes || '';
      unitCost = posUnitCost ?? (product?.costPrice || 0);
    }

    const now = new Date().toISOString();
    const transferId = 'TRF-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const transferNumber = 'TRF-' + String(Date.now()).slice(-6);

    // 1. Saída na Empresa de Origem
    const exitRes = this.applyMovement(currentBalances, {
      companyId: fromCompany.id,
      productId: product.id,
      productCode: product.code,
      productDescription: product.description,
      locationId: fromLocation.id,
      locationName: fromLocation.name,
      toLocationId: toLocation.id,
      toLocationName: `${toCompany.tradeName || toCompany.name} - ${toLocation.name}`,
      type: 'transferencia_empresa_saida',
      quantity,
      unitCost,
      totalCost: unitCost * quantity,
      originDocType: 'transferencia',
      originDocId: transferId,
      date: now,
      userId,
      userName,
      notes: notes || `Transferência enviada para ${toCompany.tradeName || toCompany.name} (${toLocation.name})`,
      relatedCompanyId: toCompany.id,
      relatedCompanyName: toCompany.tradeName || toCompany.name,
      relatedLocationId: toLocation.id,
      relatedLocationName: toLocation.name,
      transferId,
    });

    // 2. Entrada na Empresa de Destino
    const enterRes = this.applyMovement(exitRes.updatedBalances, {
      companyId: toCompany.id,
      productId: product.id,
      productCode: product.code,
      productDescription: product.description,
      locationId: toLocation.id,
      locationName: toLocation.name,
      toLocationId: fromLocation.id,
      toLocationName: `${fromCompany.tradeName || fromCompany.name} - ${fromLocation.name}`,
      type: 'transferencia_empresa_entrada',
      quantity,
      unitCost,
      totalCost: unitCost * quantity,
      originDocType: 'transferencia',
      originDocId: transferId,
      date: now,
      userId,
      userName,
      notes: notes || `Transferência recebida de ${fromCompany.tradeName || fromCompany.name} (${fromLocation.name})`,
      relatedCompanyId: fromCompany.id,
      relatedCompanyName: fromCompany.tradeName || fromCompany.name,
      relatedLocationId: fromLocation.id,
      relatedLocationName: fromLocation.name,
      transferId,
    });

    const transferRecord: CompanyStockTransfer = {
      id: transferId,
      transferNumber,
      number: transferNumber,
      date: now,
      fromCompanyId: fromCompany.id,
      fromCompanyName: fromCompany.tradeName || fromCompany.name,
      fromLocationId: fromLocation.id,
      fromLocationName: fromLocation.name,
      toCompanyId: toCompany.id,
      toCompanyName: toCompany.tradeName || toCompany.name,
      toLocationId: toLocation.id,
      toLocationName: toLocation.name,
      productId: product.id,
      productCode: product.code,
      productDescription: product.description,
      quantity,
      unit: product.unit || 'UN',
      unitCost,
      totalCost: unitCost * quantity,
      userId,
      userName,
      status: 'concluido',
      notes,
      createdAt: now,
    };

    return {
      updatedBalances: enterRes.updatedBalances,
      transferRecord,
      transfer: transferRecord,
      movements: [exitRes.createdMovement, enterRes.createdMovement],
    };
  }
}
