import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package,
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  Boxes,
  Barcode,
  Eye,
  CheckCircle2,
  XCircle,
  Layers,
  ArrowRight,
  Download,
  Upload,
  FileCheck,
  RotateCcw,
  FileSpreadsheet,
  Building2,
  ArrowLeftRight,
  Check,
  X,
  ShieldAlert,
  List,
} from 'lucide-react';
import { Database } from '../../services/db';
import { Product, ProductType, UnitOfMeasure, StockLocation, Company, CompanyPriceOverride, ProductMaxDiscountType } from '../../types';
import { StockEngine } from '../../services/stockEngine';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { ExcelService, ImportPreview } from '../../services/excelService';
import { FirebaseSyncService } from '../../services/firebaseSync';
import { toast } from '../../services/toast';
import { formatProductMaxDiscountLabel } from '../../services/discountControl';
import { SortableTh, SortConfig, toggleSortConfig, compareSortValues, compareSortText } from '../common/SortableHeader';

type ProductSortKey =
  | 'code'
  | 'description'
  | 'productType'
  | 'familyGroup'
  | 'costPrice'
  | 'salePrice'
  | 'stock'
  | 'status';

const formatDecimalPtBr = (value: number): string => {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatEditableDecimalPtBr = (value: number): string => {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(2).replace('.', ',');
};

const sanitizeCurrencyInput = (raw: string): string => {
  let normalized = raw.replace(/[^0-9.,]/g, '');
  if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '');
  } else if (normalized.includes('.')) {
    const lastDot = normalized.lastIndexOf('.');
    normalized =
      normalized.slice(0, lastDot).replace(/\./g, '') +
      ',' +
      normalized.slice(lastDot + 1);
  }
  const commaIdx = normalized.indexOf(',');
  if (commaIdx !== -1) {
    const integerPart = normalized.slice(0, commaIdx);
    const decimalPart = normalized.slice(commaIdx + 1).replace(/,/g, '').slice(0, 2);
    return `${integerPart},${decimalPart}`;
  }
  return normalized;
};

const parseDecimalPtBr = (raw: string): number => {
  const cleaned = raw.replace(/\./g, '').replace(',', '.').trim();
  const parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Number(parsed.toFixed(2));
};

export const ProductsView: React.FC = () => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  const canViewCosts = Database.canCurrentUserView('productCosts');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFamily, setSelectedFamily] = useState('todos');
  const [selectedType, setSelectedType] = useState('todos');
  const [selectedStatus, setSelectedStatus] = useState('todos');
  const [selectedMasterPackFilter, setSelectedMasterPackFilter] = useState<'todos' | 'master_only' | 'unit_only'>('todos');
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig<ProductSortKey>>({ key: 'code', direction: 'desc' });
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const handleSort = (key: ProductSortKey) => {
    setSortConfig((prev) => toggleSortConfig(prev, key));
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTop = 0;
    }
  };

  const handleToggleShowAllProducts = () => {
    if (!showAllProducts) {
      setShowAllProducts(true);
      setSearchTerm('');
      setSelectedFamily('todos');
      setSelectedType('todos');
      setSelectedStatus('todos');
      setSelectedMasterPackFilter('todos');
      setSortConfig({ key: 'description', direction: 'asc' });
    } else {
      setShowAllProducts(false);
      setSortConfig({ key: 'code', direction: 'desc' });
    }
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTop = 0;
    }
  };

  // Modal de Cadastro / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Modal de Detalhes de Estoque por Local
  const [viewStockProduct, setViewStockProduct] = useState<Product | null>(null);

  // Modal de Importação Excel e Modelos
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'insert_update' | 'insert_only'>('insert_update');
  const [importPreview, setImportPreview] = useState<ImportPreview<Partial<Product>> | null>(null);
  const [isLoadingImport, setIsLoadingImport] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const [importErrorMsg, setImportErrorMsg] = useState<string | null>(null);

  // Modais de Alerta e Confirmação de Exclusão / Inativação (sem window.confirm)
  const [alertWarningModal, setAlertWarningModal] = useState<string | null>(null);
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<Product | null>(null);
  const [confirmInactivateProduct, setConfirmInactivateProduct] = useState<Product | null>(null);

  // Formulário
  const [formData, setFormData] = useState<Partial<Product>>({
    code: '',
    referenceCode: '',
    description: '',
    unit: 'UN',
    costPrice: 0,
    salePrice: 0,
    family: 'Geral',
    group: 'Geral',
    barcode: '',
    minStock: 10,
    productType: 'revenda',
    hasComposition: false,
    defaultLocationId: 'loc-comercial',
    status: 'ativo',
    notes: '',
    showSaleAlert: false,
    isMasterPack: false,
    masterPackAssociatedProductId: '',
    masterPackAssociatedProductCode: '',
    masterPackAssociatedProductDescription: '',
    masterPackUnits: 10,
    masterPackPackagingType: 'caixa',
    maxDiscountEnabled: false,
    maxDiscountType: 'percent',
    maxDiscountValue: 0,
  });
  const [costPriceInput, setCostPriceInput] = useState('0,00');
  const [salePriceInput, setSalePriceInput] = useState('0,00');
  const [maxDiscountInput, setMaxDiscountInput] = useState('0,00');

  const locations = dbState.stockLocations.filter((l) => l.companyId === currentCompany.id);

  const families = ['todos', ...Array.from(new Set(dbState.products.map((p) => p.family).filter(Boolean)))];

  // Produtos unitários disponíveis para vincular à Embalagem Master
  const availableUnitProducts = dbState.products.filter(
    (p) => p.status === 'ativo' && !p.isMasterPack && p.id !== editingProduct?.id
  );

  const trimmedSearch = searchTerm.trim();
  const isSearching = trimmedSearch.length > 0;
  const isSearchTooShort = isSearching && trimmedSearch.length < 3;

  const baseFilteredProducts = useMemo(() => {
    return dbState.products.filter((p) => {
      const matchesFamily = selectedFamily === 'todos' || p.family === selectedFamily;
      const matchesType = selectedType === 'todos' || p.productType === selectedType;
      const matchesStatus = selectedStatus === 'todos' || p.status === selectedStatus;
      const matchesMaster =
        selectedMasterPackFilter === 'todos' ||
        (selectedMasterPackFilter === 'master_only' && p.isMasterPack) ||
        (selectedMasterPackFilter === 'unit_only' && !p.isMasterPack);
      return matchesFamily && matchesType && matchesStatus && matchesMaster;
    });
  }, [dbState.products, selectedFamily, selectedType, selectedStatus, selectedMasterPackFilter]);

  const filteredProducts = useMemo(() => {
    if (isSearchTooShort) return [];

    if (isSearching) {
      const normalizedSearch = trimmedSearch.toLowerCase();
      return baseFilteredProducts.filter((p) => {
        const description = String(p.description ?? '').toLowerCase();
        const code = String(p.code ?? '').toLowerCase();
        const barcode = String(p.barcode ?? '').toLowerCase();
        const refCode = String(p.referenceCode ?? '').toLowerCase();
        return (
          description.includes(normalizedSearch) ||
          code.includes(normalizedSearch) ||
          barcode.includes(normalizedSearch) ||
          (refCode.length > 0 && refCode.includes(normalizedSearch))
        );
      });
    }

    if (showAllProducts) {
      return baseFilteredProducts;
    }

    // Sem busca ativa: exibe inicialmente apenas os últimos 20 produtos cadastrados em ordem decrescente de código
    return [...baseFilteredProducts]
      .sort(
        (a, b) =>
          compareSortText(a.code, b.code, 'desc') ||
          compareSortText(a.description, b.description, 'desc') ||
          compareSortText(a.id, b.id, 'desc')
      )
      .slice(0, 20);
  }, [baseFilteredProducts, isSearching, isSearchTooShort, trimmedSearch, showAllProducts]);

  const sortProductList = (list: Product[]): Product[] => {
    if (!sortConfig.key) return list;
    const key = sortConfig.key;
    const dir = sortConfig.direction;

    const priceCache =
      key === 'salePrice'
        ? new Map(list.map((p) => [p, StockEngine.getProductPriceForCompany(p, currentCompany.id)]))
        : null;
    const stockCache =
      key === 'stock'
        ? new Map(
            list.map((p) => [
              p,
              StockEngine.getCompanyProductStock(dbState.stockBalances, p.id, currentCompany.id, dbState.stockLocations)
                .available,
            ])
          )
        : null;

    return [...list].sort((a, b) => {
      let primary = 0;
      switch (key) {
        case 'code':
          primary = compareSortText(a.code, b.code, dir);
          return primary || compareSortText(a.description, b.description, dir) || compareSortText(a.id, b.id, dir);
        case 'description':
          primary = compareSortText(a.description, b.description, dir);
          return primary || compareSortText(a.code, b.code, dir) || compareSortText(a.id, b.id, dir);
        case 'productType':
          primary = compareSortText(a.productType, b.productType, dir);
          break;
        case 'familyGroup':
          primary = compareSortText(`${a.family || ''} / ${a.group || ''}`, `${b.family || ''} / ${b.group || ''}`, dir);
          break;
        case 'costPrice':
          primary = compareSortValues(canViewCosts ? Number(a.costPrice || 0) : 0, canViewCosts ? Number(b.costPrice || 0) : 0, dir);
          break;
        case 'salePrice':
          primary = compareSortValues(priceCache?.get(a) ?? 0, priceCache?.get(b) ?? 0, dir);
          break;
        case 'stock':
          primary = compareSortValues(stockCache?.get(a) ?? 0, stockCache?.get(b) ?? 0, dir);
          break;
        case 'status':
          primary = compareSortText(a.status, b.status, dir);
          break;
        default:
          return 0;
      }

      return primary || compareSortText(a.description, b.description, 'asc') || compareSortText(a.code, b.code, 'asc');
    });
  };

  const sortedProducts = useMemo(() => {
    return sortProductList(filteredProducts);
  }, [filteredProducts, sortConfig, canViewCosts, currentCompany.id, dbState.stockBalances, dbState.stockLocations]);

  const handleOpenNew = () => {
    const newCode = 'PROD-' + String(dbState.products.length + 101);
    setEditingProduct(null);
    setFormData({
      code: newCode,
      referenceCode: '',
      description: '',
      unit: 'UN',
      costPrice: 0,
      salePrice: 0,
      family: 'Geral',
      group: 'Geral',
      barcode: '',
      minStock: 10,
      productType: 'revenda',
      hasComposition: false,
      defaultLocationId: locations.find((l) => l.name.toLowerCase() === 'comercial' || l.id === 'loc-comercial')?.id || locations[0]?.id || 'loc-comercial',
      status: 'ativo',
      notes: '',
      showSaleAlert: false,
      isMasterPack: false,
      masterPackAssociatedProductId: '',
      masterPackAssociatedProductCode: '',
      masterPackAssociatedProductDescription: '',
      masterPackUnits: 10,
      masterPackPackagingType: 'caixa',
      maxDiscountEnabled: false,
      maxDiscountType: 'percent',
      maxDiscountValue: 0,
    });
    setCostPriceInput(formatDecimalPtBr(0));
    setSalePriceInput(formatDecimalPtBr(0));
    setMaxDiscountInput(formatDecimalPtBr(0));
    setIsModalOpen(true);
  };

  const handleOpenNewMasterPack = () => {
    const newCode = 'CX-' + String(dbState.products.length + 101);
    const defaultAssoc = availableUnitProducts[0];
    const initialCost = defaultAssoc ? Number((defaultAssoc.costPrice * 10).toFixed(2)) : 0;
    const initialSale = defaultAssoc ? Number((defaultAssoc.salePrice * 10).toFixed(2)) : 0;
    setEditingProduct(null);
    setFormData({
      code: newCode,
      referenceCode: '',
      description: defaultAssoc ? `Caixa ${defaultAssoc.description} c/ 10 UN` : 'Caixa c/ 10 UN',
      unit: 'CX',
      costPrice: initialCost,
      salePrice: initialSale,
      family: defaultAssoc?.family || 'Geral',
      group: 'Embalagens Master',
      barcode: '',
      minStock: 5,
      productType: 'revenda',
      hasComposition: false,
      defaultLocationId: defaultAssoc?.defaultLocationId || locations[0]?.id || 'loc-comercial',
      status: 'ativo',
      notes: defaultAssoc
        ? `Embalagem Master contendo 10 unidades de ${defaultAssoc.code} - ${defaultAssoc.description}. O estoque é controlado automaticamente no produto associado.`
        : 'Embalagem Master. O estoque é controlado automaticamente no produto unitário associado.',
      showSaleAlert: false,
      isMasterPack: true,
      masterPackAssociatedProductId: defaultAssoc?.id || '',
      masterPackAssociatedProductCode: defaultAssoc?.code || '',
      masterPackAssociatedProductDescription: defaultAssoc?.description || '',
      masterPackUnits: 10,
      masterPackPackagingType: 'caixa',
      maxDiscountEnabled: false,
      maxDiscountType: 'percent',
      maxDiscountValue: 0,
    });
    setCostPriceInput(formatDecimalPtBr(initialCost));
    setSalePriceInput(formatDecimalPtBr(initialSale));
    setMaxDiscountInput(formatDecimalPtBr(0));
    setIsModalOpen(true);
  };

  const handleCreateMasterPackFromProduct = (product: Product, units: number = 10) => {
    const cleanCode = product.code.replace(/[^A-Za-z0-9]/g, '');
    const newCode = `CX-${cleanCode}-${units}`;
    const initialCost = Number((product.costPrice * units).toFixed(2));
    const initialSale = Number((product.salePrice * units).toFixed(2));
    setEditingProduct(null);
    setFormData({
      code: newCode,
      referenceCode: '',
      description: `Caixa ${product.description} c/ ${units} UN`,
      unit: 'CX',
      costPrice: initialCost,
      salePrice: initialSale,
      family: product.family || 'Geral',
      group: 'Embalagens Master',
      barcode: '',
      minStock: 5,
      productType: 'revenda',
      hasComposition: false,
      defaultLocationId: product.defaultLocationId || locations[0]?.id || 'loc-comercial',
      status: 'ativo',
      notes: `Embalagem Master contendo ${units} unidades do produto ${product.code} - ${product.description}. Toda venda desta caixa baixa automaticamente ${units} unidades do produto unitário no estoque.`,
      showSaleAlert: false,
      isMasterPack: true,
      masterPackAssociatedProductId: product.id,
      masterPackAssociatedProductCode: product.code,
      masterPackAssociatedProductDescription: product.description,
      masterPackUnits: units,
      masterPackPackagingType: 'caixa',
      maxDiscountEnabled: false,
      maxDiscountType: 'percent',
      maxDiscountValue: 0,
    });
    setCostPriceInput(formatDecimalPtBr(initialCost));
    setSalePriceInput(formatDecimalPtBr(initialSale));
    setMaxDiscountInput(formatDecimalPtBr(0));
    setIsModalOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    const savedMaxDiscVal = Number(product.maxDiscountValue ?? 0);
    setFormData({
      ...product,
      referenceCode: product.referenceCode || '',
      notes: product.notes || '',
      showSaleAlert: !!product.showSaleAlert,
      isMasterPack: !!product.isMasterPack,
      masterPackAssociatedProductId: product.masterPackAssociatedProductId || '',
      masterPackAssociatedProductCode: product.masterPackAssociatedProductCode || '',
      masterPackAssociatedProductDescription: product.masterPackAssociatedProductDescription || '',
      masterPackUnits: product.masterPackUnits || 10,
      masterPackPackagingType: product.masterPackPackagingType || 'caixa',
      maxDiscountEnabled: !!product.maxDiscountEnabled,
      maxDiscountType: product.maxDiscountType === 'value' ? 'value' : 'percent',
      maxDiscountValue: Number.isFinite(savedMaxDiscVal) && savedMaxDiscVal >= 0 ? savedMaxDiscVal : 0,
    });
    setCostPriceInput(formatDecimalPtBr(Number(product.costPrice || 0)));
    setSalePriceInput(formatDecimalPtBr(Number(product.salePrice || 0)));
    setMaxDiscountInput(formatDecimalPtBr(Number.isFinite(savedMaxDiscVal) && savedMaxDiscVal >= 0 ? savedMaxDiscVal : 0));
    setIsModalOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code?.trim() || !formData.description?.trim()) {
      alert('Código e Descrição são campos obrigatórios.');
      return;
    }

    // Validações do recurso Embalagem Master
    if (formData.isMasterPack) {
      if (!formData.masterPackAssociatedProductId) {
        alert('Por favor, selecione o Produto Unitário Associado que será vendido nesta Embalagem Master.');
        return;
      }
      if (!formData.masterPackUnits || Number(formData.masterPackUnits) <= 0) {
        alert('A quantidade de unidades por Embalagem Master deve ser maior que zero (ex: 10, 20 ou 30 unidades).');
        return;
      }
      if (formData.masterPackAssociatedProductId === editingProduct?.id) {
        alert('A Embalagem Master não pode ser associada a ela mesma.');
        return;
      }
    }

    // Validações do controle de desconto máximo por produto
    const maxDiscEnabled = !!formData.maxDiscountEnabled;
    const maxDiscType: ProductMaxDiscountType = formData.maxDiscountType === 'value' ? 'value' : 'percent';
    const rawMaxDiscVal = Number(formData.maxDiscountValue ?? 0);
    if (maxDiscEnabled) {
      if (!Number.isFinite(rawMaxDiscVal) || rawMaxDiscVal < 0) {
        alert('O Desconto Máximo Permitido deve ser um valor numérico maior ou igual a zero.');
        return;
      }
      if (maxDiscType === 'percent' && rawMaxDiscVal > 100) {
        alert('O Desconto Máximo Percentual não pode ultrapassar 100%.');
        return;
      }
    }

    const maxDiscountData = maxDiscEnabled
      ? {
          maxDiscountEnabled: true,
          maxDiscountType: maxDiscType,
          maxDiscountValue: Number(rawMaxDiscVal.toFixed(2)),
        }
      : {
          maxDiscountEnabled: false,
          maxDiscountType: maxDiscType,
          maxDiscountValue: Number(Math.max(0, rawMaxDiscVal).toFixed(2)),
        };

    // Verificar unicidade do código
    const existingWithCode = dbState.products.find(
      (p) => p.code.toUpperCase() === formData.code?.toUpperCase() && p.id !== editingProduct?.id
    );
    if (existingWithCode) {
      alert(`Já existe um produto com o código "${formData.code}". Utilize outro código.`);
      return;
    }

    const state = Database.getState();
    const assocProd = formData.isMasterPack
      ? state.products.find((p) => p.id === formData.masterPackAssociatedProductId)
      : null;

    const masterPackData = {
      isMasterPack: !!formData.isMasterPack,
      masterPackAssociatedProductId: formData.isMasterPack ? formData.masterPackAssociatedProductId : undefined,
      masterPackAssociatedProductCode: formData.isMasterPack ? (assocProd?.code || formData.masterPackAssociatedProductCode) : undefined,
      masterPackAssociatedProductDescription: formData.isMasterPack ? (assocProd?.description || formData.masterPackAssociatedProductDescription) : undefined,
      masterPackUnits: formData.isMasterPack ? Number(formData.masterPackUnits || 10) : undefined,
      masterPackPackagingType: formData.isMasterPack ? (formData.masterPackPackagingType || 'caixa') : undefined,
    };

    if (editingProduct) {
      // Atualizar existente
      state.products = state.products.map((p) =>
        p.id === editingProduct.id
          ? ({
              ...p,
              ...formData,
              ...masterPackData,
              ...maxDiscountData,
              referenceCode: (formData.referenceCode || '').trim(),
              costPrice: Number(formData.costPrice || 0),
              salePrice: Number(formData.salePrice || 0),
              minStock: Number(formData.minStock || 0),
              notes: (formData.notes || '').trim(),
              showSaleAlert: !!formData.showSaleAlert,
            } as Product)
          : p
      );
      Database.addAuditLog('ATUALIZAR_PRODUTO', 'CADASTROS', editingProduct.id, `Produto ${formData.description} atualizado ${formData.isMasterPack ? '(Embalagem Master)' : ''}`);
    } else {
      // Criar novo produto
      const newProd: Product = {
        id: 'PROD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
        code: formData.code!.trim(),
        referenceCode: (formData.referenceCode || '').trim(),
        description: formData.description!.trim(),
        unit: formData.unit || 'UN',
        costPrice: Number(formData.costPrice || 0),
        salePrice: Number(formData.salePrice || 0),
        family: formData.family || 'Geral',
        group: formData.group || 'Geral',
        barcode: formData.barcode || '',
        minStock: Number(formData.minStock || 0),
        productType: formData.productType || 'revenda',
        hasComposition: !!formData.hasComposition,
        defaultLocationId: formData.defaultLocationId || locations[0]?.id || 'loc-comercial',
        status: formData.status || 'ativo',
        notes: (formData.notes || '').trim(),
        showSaleAlert: !!formData.showSaleAlert,
        companyPrices: formData.companyPrices || {},
        ...masterPackData,
        ...maxDiscountData,
      };
      state.products.unshift(newProd);

      // Criar registros de saldo inicial zerado para cada empresa cadastrada
      dbState.companies.forEach((comp) => {
        const compLoc = StockEngine.getCompanyDefaultLocation(dbState.stockLocations, comp.id);
        const locId = compLoc?.id || newProd.defaultLocationId;
        const exists = state.stockBalances.some((b) => b.productId === newProd.id && b.locationId === locId);
        if (!exists) {
          state.stockBalances.push({
            productId: newProd.id,
            locationId: locId,
            companyId: comp.id,
            quantity: 0,
            reserved: 0,
            minStock: newProd.minStock,
          });
        }
      });

      Database.addAuditLog('CRIAR_PRODUTO', 'CADASTROS', newProd.id, `Produto ${newProd.description} cadastrado ${newProd.isMasterPack ? '(Embalagem Master)' : ''}`);
    }

    Database.persist();
    setIsModalOpen(false);
  };

  // Excluir ou Inativar respeitando integridade histórica com modais seguros (sem window.confirm)
  const handleDeleteOrInactivate = (product: Product) => {
    // 1. Checar se este produto é base associada de alguma Embalagem Master ativa
    const masterPacksUsingThis = dbState.products.filter(
      (p) => p.isMasterPack && p.masterPackAssociatedProductId === product.id && p.status === 'ativo'
    );
    if (masterPacksUsingThis.length > 0) {
      const names = masterPacksUsingThis.map((m) => `${m.code} - ${m.description}`).join('; ');
      setAlertWarningModal(
        `Este produto NÃO pode ser excluído ou inativado pois está associado como produto unitário base para as seguintes Embalagens Master ativas: ${names}. Desvincule ou inative as Embalagens Master antes de prosseguir.`
      );
      return;
    }

    // 2. Checar se o produto tem vendas ou compras
    const hasOrders = dbState.orders.some((o) => o.items.some((i) => i.productId === product.id));
    const hasMovements = dbState.stockMovements.some((m) => m.productId === product.id);

    if (hasOrders || hasMovements) {
      setConfirmInactivateProduct(product);
      return;
    }

    setConfirmDeleteProduct(product);
  };

  const executeInactivate = (product: Product) => {
    const state = Database.getState();
    state.products = state.products.map((p) =>
      p.id === product.id ? { ...p, status: 'inativo' as const } : p
    );
    Database.persist();
    FirebaseSyncService.syncToFirebase().catch(console.error);
    Database.addAuditLog('INATIVAR_PRODUTO', 'CADASTROS', product.id, `Produto ${product.code} inativado`);
    setConfirmInactivateProduct(null);
    setDbState({ ...Database.getState() });
  };

  const executeDelete = (product: Product) => {
    const state = Database.getState();
    state.products = state.products.filter((p) => p.id !== product.id);
    state.stockBalances = state.stockBalances.filter((b) => b.productId !== product.id);
    Database.persist();
    FirebaseSyncService.syncToFirebase().catch(console.error);
    Database.addAuditLog('EXCLUIR_PRODUTO', 'CADASTROS', product.id, `Produto ${product.code} excluído`);
    setConfirmDeleteProduct(null);
    setDbState({ ...Database.getState() });
  };

  const handleExportToExcel = () => {
    const productsToExport =
      isSearching && !isSearchTooShort ? sortedProducts : sortProductList(baseFilteredProducts);
    ExcelService.exportProducts(productsToExport, locations, `Produtos_${currentCompany.tradeName || 'Catalogo'}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    ExcelService.downloadExcel(
      ExcelService.generateProductTemplate(locations),
      'Modelo_Oficial_Importacao_Produtos.xlsx'
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingImport(true);
    setImportSuccessMsg(null);
    setImportErrorMsg(null);

    try {
      const rawData = await ExcelService.parseExcelFile(file);
      if (!rawData || rawData.length === 0) {
        setImportErrorMsg('A planilha selecionada está vazia ou não contém dados válidos.');
        setIsLoadingImport(false);
        return;
      }

      const preview = ExcelService.validateProductsImport(
        rawData,
        dbState.products,
        locations,
        importMode
      );
      setImportPreview(preview);
    } catch (err) {
      setImportErrorMsg((err as Error).message || 'Erro ao processar planilha Excel.');
    } finally {
      setIsLoadingImport(false);
      e.target.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (!importPreview || importPreview.validRows.length === 0) return;

    const state = Database.getState();
    const validProds = importPreview.validRows;

    validProds.forEach((prodData, importIdx) => {
      const existingIdx = state.products.findIndex((p) => p.code.toUpperCase() === prodData.code?.toUpperCase());

      if (existingIdx >= 0 && importMode === 'insert_update') {
        state.products[existingIdx] = {
          ...state.products[existingIdx],
          ...prodData,
          isMasterPack: !!prodData.isMasterPack,
          masterPackAssociatedProductId: prodData.masterPackAssociatedProductId,
          masterPackAssociatedProductCode: prodData.masterPackAssociatedProductCode,
          masterPackAssociatedProductDescription: prodData.masterPackAssociatedProductDescription,
          masterPackUnits: prodData.masterPackUnits,
          masterPackPackagingType: prodData.masterPackPackagingType,
        } as Product;
      } else if (existingIdx < 0) {
        const newProd: Product = {
          id: 'PROD-' + Date.now() + '-' + importIdx + '-' + Math.random().toString(36).substring(2, 10),
          code: prodData.code!,
          referenceCode: prodData.referenceCode || '',
          description: prodData.description!,
          unit: prodData.unit || 'UN',
          costPrice: prodData.costPrice || 0,
          salePrice: prodData.salePrice || 0,
          family: prodData.family || 'Geral',
          group: prodData.group || (prodData.isMasterPack ? 'Embalagens Master' : 'Geral'),
          barcode: prodData.barcode || '',
          minStock: prodData.minStock || 0,
          productType: prodData.productType || 'revenda',
          hasComposition: !!prodData.hasComposition,
          defaultLocationId: prodData.defaultLocationId || locations[0]?.id || 'loc-comercial',
          status: prodData.status || 'ativo',
          taxPercent: prodData.taxPercent || 0,
          operatingExpensesPercent: prodData.operatingExpensesPercent || 0,
          salesCommissionPercent: prodData.salesCommissionPercent || 0,
          otherCostsPercent: prodData.otherCostsPercent || 0,
          profitMarginPercent: prodData.profitMarginPercent || 0,
          notes: prodData.notes || '',
          isMasterPack: !!prodData.isMasterPack,
          masterPackAssociatedProductId: prodData.masterPackAssociatedProductId,
          masterPackAssociatedProductCode: prodData.masterPackAssociatedProductCode,
          masterPackAssociatedProductDescription: prodData.masterPackAssociatedProductDescription,
          masterPackUnits: prodData.masterPackUnits,
          masterPackPackagingType: prodData.masterPackPackagingType,
        };
        state.products.unshift(newProd);

        state.stockBalances.push({
          productId: newProd.id,
          locationId: newProd.defaultLocationId,
          quantity: 0,
          reserved: 0,
          minStock: newProd.minStock,
        });
      }
    });

    // Segunda passagem: Vincular Embalagens Master cujos produtos base foram importados juntos no mesmo arquivo
    state.products.forEach((prod) => {
      if (prod.isMasterPack && !prod.masterPackAssociatedProductId && prod.masterPackAssociatedProductCode) {
        const matched = state.products.find(
          (p) => p.code.toUpperCase() === prod.masterPackAssociatedProductCode?.toUpperCase() && p.id !== prod.id
        );
        if (matched) {
          prod.masterPackAssociatedProductId = matched.id;
          if (!prod.masterPackAssociatedProductDescription) {
            prod.masterPackAssociatedProductDescription = matched.description;
          }
        }
      }
    });

    Database.addAuditLog(
      'IMPORTACAO_PLANILHA_PRODUTOS',
      'IMPORTACAO',
      'PRODUTOS',
      `Importação de ${validProds.length} produtos via tela de Produtos por ${currentUser.name} (Modo: ${importMode})`
    );

    Database.persist();
    FirebaseSyncService.syncToFirebase().catch(console.error);
    setDbState({ ...Database.getState() });

    setImportSuccessMsg(
      `Importação concluída com êxito! ${importPreview.summary.validCount} produtos processados (${importPreview.summary.toInsertCount} inseridos, ${importPreview.summary.toUpdateCount} atualizados).`
    );
    setImportPreview(null);
  };

  // Detecção de produtos duplicados no catálogo
  const duplicateProductsGroups = useMemo(() => {
    return Database.findDuplicateProducts();
  }, [dbState.products]);
  const [isMergingDuplicates, setIsMergingDuplicates] = useState(false);

  const handleMergeDuplicates = async () => {
    setIsMergingDuplicates(true);
    try {
      const res = Database.mergeDuplicateProducts();
      if (res.mergedCount > 0) {
        toast.success(
          `${res.mergedCount} produto(s) duplicado(s) foram unificados com sucesso! Os saldos de estoque e histórico foram consolidados no cadastro principal.`,
          'Produtos Unificados'
        );
        try {
          await FirebaseSyncService.syncToFirebase(Database.getState());
        } catch (e) {
          console.warn('Sync agendado:', e);
        }
      } else {
        toast.info('Nenhum produto duplicado foi encontrado no catálogo.', 'Tudo Certo');
      }
    } catch (err: any) {
      toast.error('Erro ao unificar produtos: ' + err.message, 'Erro');
    } finally {
      setIsMergingDuplicates(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-7rem)]">
      {/* Alerta de Produtos Duplicados com Ação de Unificação Automática */}
      {duplicateProductsGroups.length > 0 && (
        <div className="shrink-0 p-4 bg-amber-50 border border-amber-300 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0 mt-0.5">
              <AlertTriangle size={18} />
            </span>
            <div>
              <h4 className="font-bold text-xs text-amber-950 flex items-center gap-2">
                <span>Atenção: Detectamos {duplicateProductsGroups.length} grupo(s) de produtos com cadastros duplicados</span>
                <span className="bg-amber-200 text-amber-900 text-[10px] px-2 py-0.5 rounded-full font-extrabold">
                  {duplicateProductsGroups.reduce((acc, g) => acc + g.duplicates.length, 0)} itens duplicados
                </span>
              </h4>
              <p className="text-[11px] text-amber-800 mt-1">
                {duplicateProductsGroups
                  .map((g) => `${g.primary.code} - ${g.primary.description} (${g.duplicates.length + 1}x: ${g.reason})`)
                  .slice(0, 3)
                  .join(' • ')}
                {duplicateProductsGroups.length > 3 ? ` e mais ${duplicateProductsGroups.length - 3} grupo(s)...` : ''}
              </p>
              <p className="text-[10px] text-amber-700 mt-0.5">
                A unificação consolida os saldos de estoque de todos os depósitos no produto principal e preserva o histórico de movimentações, compras e vendas.
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={handleMergeDuplicates}
              disabled={isMergingDuplicates}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-400 text-white font-bold text-xs rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={14} className={isMergingDuplicates ? 'animate-spin' : ''} />
              <span>{isMergingDuplicates ? 'Unificando...' : 'Unificar & Consolidar Estoque'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Topo / Barra de Ações */}
      <div className="shrink-0 bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-blue-600" size={20} />
            <span>Cadastro Geral de Produtos & Insumos</span>
          </h2>
          <p className="text-xs text-slate-500">
            Gerencie mercadorias para revenda, matérias-primas e embalagens master com controle automático de estoque.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão Baixar Planilha Modelo */}
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs rounded-lg border border-emerald-200 transition-colors cursor-pointer shadow-2xs"
            title="Baixar planilha oficial com exemplo preenchido de Embalagem Master e produtos unitários (.xlsx)"
          >
            <Download size={15} className="text-emerald-700" />
            <span>Planilha Modelo (.xlsx)</span>
          </button>

          {/* Botão Exportar Excel */}
          <button
            onClick={handleExportToExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
            title="Exportar catálogo filtrado para Excel (.xlsx)"
          >
            <FileSpreadsheet size={15} className="text-emerald-600" />
            <span>Exportar Excel</span>
          </button>

          {/* Botão Importar Excel */}
          <button
            onClick={() => {
              setImportSuccessMsg(null);
              setImportErrorMsg(null);
              setImportPreview(null);
              setIsImportModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 font-semibold text-xs rounded-lg border border-blue-200 transition-colors cursor-pointer shadow-2xs"
            title="Importar produtos e embalagens master a partir de planilha Excel preenchida"
          >
            <Upload size={15} className="text-blue-700" />
            <span>Importar Excel</span>
          </button>

          {/* Botão Nova Embalagem Master */}
          <button
            onClick={handleOpenNewMasterPack}
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs rounded-lg shadow-xs transition-all cursor-pointer"
            title="Cadastrar uma nova Embalagem Master (Caixa ou Pacote com 10, 20 ou 30 unidades vinculada a um produto unitário)"
          >
            <Boxes size={15} />
            <span>Nova Embalagem Master</span>
          </button>

          {/* Botão Novo Produto */}
          <button
            onClick={handleOpenNew}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus size={15} />
            <span>Novo Produto</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="shrink-0 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={16} />
            <input
              type="text"
              placeholder="Buscar por descrição, código ou código de barras (mín. 3 caracteres)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-blue-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                title="Limpar busca"
                aria-label="Limpar busca"
                className="absolute right-2 top-1.5 p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div>
            <select
              value={selectedFamily}
              onChange={(e) => setSelectedFamily(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-medium"
            >
              {families.map((f) => (
                <option key={f} value={f}>
                  Família: {f === 'todos' ? 'Todas' : f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-medium"
            >
              <option value="todos">Tipo: Todos</option>
              <option value="revenda">Revenda / Acabado</option>
              <option value="componente">Componente / Matéria-Prima</option>
            </select>
          </div>

          <div>
            <select
              value={selectedMasterPackFilter}
              onChange={(e) => setSelectedMasterPackFilter(e.target.value as any)}
              className="w-full bg-slate-50 border border-amber-200 text-slate-800 rounded-lg p-2 text-xs font-semibold"
            >
              <option value="todos">Embalagem: Todas</option>
              <option value="master_only">📦 Apenas Embalagens Master</option>
              <option value="unit_only">Produtos Unitários / Simples</option>
            </select>
          </div>

          <div>
            <button
              type="button"
              onClick={handleToggleShowAllProducts}
              title={
                showAllProducts
                  ? 'Clique para voltar à exibição inicial dos últimos 20 produtos'
                  : 'Listar todos os produtos cadastrados em ordem crescente de descrição'
              }
              className={`w-full h-full min-h-[34px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer shadow-2xs ${
                showAllProducts
                  ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                  : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200'
              }`}
            >
              <List size={15} />
              <span>Exibir Todos</span>
            </button>
          </div>
        </div>

        {/* Barra de contexto da listagem / busca */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
          {isSearchTooShort ? (
            <span className="font-semibold text-blue-700">
              Digite pelo menos 3 caracteres em sequência na descrição, código ou código de barras ({trimmedSearch.length}/3 digitados).
            </span>
          ) : isSearching ? (
            <span>
              Resultados da busca por <strong className="text-slate-800">"{trimmedSearch}"</strong>:{' '}
              <strong className="text-blue-700">{sortedProducts.length}</strong> produto(s) encontrado(s)
              {baseFilteredProducts.length > 0 ? ` (de ${baseFilteredProducts.length} no filtro atual)` : ''}.
            </span>
          ) : showAllProducts ? (
            <span>
              Exibindo <strong className="text-blue-700">todos os {sortedProducts.length} produto(s) cadastrados</strong>
              {sortConfig.key === 'description' && sortConfig.direction === 'asc'
                ? ' (ordem crescente de descrição)'
                : ''}
              .
            </span>
          ) : (
            <span>
              Exibindo os <strong className="text-slate-800">últimos {sortedProducts.length} produtos cadastrados</strong>
              {sortConfig.key === 'code' && sortConfig.direction === 'desc' ? ' (ordem decrescente de código)' : ''} de{' '}
              <strong className="text-slate-700">{baseFilteredProducts.length}</strong> produto(s) — digite ao menos <strong className="text-slate-700">3 caracteres</strong> para pesquisar ou clique em <strong className="text-blue-700">Exibir Todos</strong>.
            </span>
          )}

          {isSearching ? (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
            >
              {showAllProducts ? 'Limpar busca e exibir todos' : 'Limpar busca e voltar aos últimos 20'}
            </button>
          ) : showAllProducts ? (
            <button
              type="button"
              onClick={handleToggleShowAllProducts}
              className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
            >
              Voltar aos últimos 20 cadastrados
            </button>
          ) : null}
        </div>
      </div>

      {/* Tabela de Produtos */}
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div ref={tableScrollRef} className="flex-1 min-h-[300px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider shadow-[0_1px_0_0_rgba(226,232,240,1)]">
              <tr>
                <SortableTh label="Código" sortKey="code" sortConfig={sortConfig} onSort={handleSort} />
                <SortableTh label="Descrição do Produto" sortKey="description" sortConfig={sortConfig} onSort={handleSort} />
                <SortableTh label="Tipo" sortKey="productType" sortConfig={sortConfig} onSort={handleSort} />
                <SortableTh label="Família / Grupo" sortKey="familyGroup" sortConfig={sortConfig} onSort={handleSort} />
                <SortableTh label="Custo Unit." sortKey="costPrice" sortConfig={sortConfig} onSort={handleSort} align="right" />
                <SortableTh
                  label="Preço Venda"
                  sortKey="salePrice"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  align="right"
                  subtitle={`(${currentCompany.tradeName || currentCompany.name})`}
                />
                <SortableTh
                  label="Saldo"
                  sortKey="stock"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  align="center"
                  subtitle={`(${currentCompany.tradeName || currentCompany.name})`}
                />
                <SortableTh label="Status" sortKey="status" sortConfig={sortConfig} onSort={handleSort} align="center" />
                <th className="p-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isSearchTooShort ? (
                <tr>
                  <td colSpan={9} className="p-10 text-center">
                    <div className="inline-flex flex-col items-center gap-1.5 max-w-md">
                      <Search size={26} className="text-blue-500" />
                      <p className="text-sm font-bold text-slate-800">Digite pelo menos 3 caracteres</p>
                      <p className="text-xs text-slate-500">
                        A lista de produtos pesquisados aparecerá a partir do 3º caractere em sequência na descrição, código ou código de barras ({trimmedSearch.length}/3 digitados).
                      </p>
                    </div>
                  </td>
                </tr>
              ) : sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    {isSearching
                      ? `Nenhum produto encontrado para "${trimmedSearch}" com os critérios selecionados.`
                      : 'Nenhum produto cadastrado com os critérios selecionados.'}
                  </td>
                </tr>
              ) : (
                (() => {
                  const seenRowKeys = new Map<string, number>();
                  return sortedProducts.map((p) => {
                    const baseRowKey = `${p.id || 'no-id'}::${p.code || 'no-code'}`;
                    const occurrence = seenRowKeys.get(baseRowKey) ?? 0;
                    seenRowKeys.set(baseRowKey, occurrence + 1);
                    const rowKey = occurrence === 0 ? baseRowKey : `${baseRowKey}::${occurrence}`;

                    const companyStock = StockEngine.getCompanyProductStock(
                      dbState.stockBalances,
                      p.id,
                      currentCompany.id,
                      dbState.stockLocations
                    );
                    const totalConsolidated = StockEngine.getTotalProductStock(dbState.stockBalances, p.id);
                    const isLow = companyStock.available <= p.minStock;

                    const companyPrice = StockEngine.getProductPriceForCompany(p, currentCompany.id);
                    const isMatriz = currentCompany.type === 'matriz';
                    const hasCustomPrice = !isMatriz && !!(p.companyPrices && p.companyPrices[currentCompany.id]?.salePrice);

                    return (
                      <tr key={rowKey} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-mono font-bold text-blue-700">{p.code}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">{p.description}</span>
                          {p.showSaleAlert && p.notes?.trim() && (
                            <span
                              title={`Aviso de venda ativo: ${p.notes.trim()}`}
                              className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-800 font-bold px-1.5 py-0.5 rounded-full border border-amber-300"
                            >
                              <AlertTriangle size={11} className="text-amber-600" />
                              Aviso na venda
                            </span>
                          )}
                          {p.maxDiscountEnabled && (
                            <span
                              title={`Controle de desconto máximo ativo: ${formatProductMaxDiscountLabel(p)} (acima disso exige autorização de Administrador ou Gerente Geral)`}
                              className="inline-flex items-center gap-1 text-[10px] bg-rose-50 text-rose-800 font-bold px-1.5 py-0.5 rounded-full border border-rose-300"
                            >
                              <ShieldAlert size={11} className="text-rose-600" />
                              Desc. máx: {formatProductMaxDiscountLabel(p)}
                            </span>
                          )}
                          {p.isMasterPack && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded-full border border-amber-300 shadow-2xs">
                              <Boxes size={12} className="text-amber-700" />
                              Embalagem Master ({p.masterPackUnits} un/{p.unit})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                          <span>Unidade: {p.unit}</span>
                          {p.referenceCode && (
                            <span title="Código do produto na NF-e do fornecedor">
                              • Ref. NF-e: <strong className="font-mono text-slate-600">{p.referenceCode}</strong>
                            </span>
                          )}
                          {p.barcode && <span>• EAN: {p.barcode}</span>}
                          {p.hasComposition && (
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded-sm border border-blue-200 font-semibold">
                              Fabricação Própria
                            </span>
                          )}
                          {p.isMasterPack && p.masterPackAssociatedProductId && (
                            <span className="text-[11px] text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                              Vinculado ao unitário: <strong className="font-mono text-amber-800">{p.masterPackAssociatedProductCode}</strong> {p.masterPackAssociatedProductDescription ? `- ${p.masterPackAssociatedProductDescription}` : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            p.productType === 'componente'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {p.productType}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">
                        {p.family} <span className="text-slate-400">/ {p.group}</span>
                      </td>
                      <td className="p-3 text-right font-medium text-slate-600">
                        {canViewCosts ? formatCurrency(p.costPrice) : '••••'}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900">
                        <div>{companyPrice > 0 ? formatCurrency(companyPrice) : '—'}</div>
                        {dbState.companies.length > 1 && (
                          <div className="text-[10px] mt-0.5">
                            {isMatriz ? (
                              <span className="text-slate-400 font-normal">Preço Matriz</span>
                            ) : hasCustomPrice ? (
                              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-bold border border-emerald-200 inline-block">
                                Preço Filial
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">Herda Matriz</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setViewStockProduct(p)}
                          className={`px-2 py-0.5 rounded-md font-bold text-[11px] hover:ring-2 hover:ring-blue-300 transition-all cursor-pointer ${
                            companyStock.available === 0
                              ? 'bg-rose-100 text-rose-700'
                              : isLow
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                          title="Clique para ver detalhe por empresa e locais"
                        >
                          {formatQuantity(companyStock.available)} {p.unit}
                        </button>
                        {dbState.companies.length > 1 && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Rede: {formatQuantity(totalConsolidated.available)} {p.unit}
                          </div>
                        )}
                        {p.isMasterPack && p.masterPackUnits && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            ({formatQuantity(companyStock.available * p.masterPackUnits)} un unitárias)
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            p.status === 'ativo' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setViewStockProduct(p)}
                            className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-md transition-colors cursor-pointer"
                            title="Ver Grade de Estoque e Preços por Empresa (Matriz & Filiais)"
                          >
                            <Building2 size={15} />
                          </button>
                          {!p.isMasterPack && p.status === 'ativo' && (
                            <button
                              onClick={() => handleCreateMasterPackFromProduct(p, 10)}
                              className="p-1.5 hover:bg-amber-100/80 bg-amber-50/60 rounded-md text-amber-800 hover:text-amber-950 transition-colors cursor-pointer border border-amber-200"
                              title={`Criar Embalagem Master para "${p.description}" (Vender Caixa/Pacote c/ 10, 20 ou 30 unidades)`}
                            >
                              <Boxes size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 hover:bg-slate-100 rounded-md text-slate-600 hover:text-slate-900 cursor-pointer"
                            title="Editar Dados do Produto"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteOrInactivate(p)}
                            className="p-1.5 hover:bg-rose-50 rounded-md text-rose-500 hover:text-rose-700 cursor-pointer"
                            title="Excluir ou Inativar"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                });
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Cadastro / Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveProduct}
            className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-800">
                {editingProduct ? 'Editar Produto' : 'Novo Produto'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Código Interno *</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Código Referência</label>
                <input
                  type="text"
                  value={formData.referenceCode || ''}
                  onChange={(e) => setFormData({ ...formData, referenceCode: e.target.value })}
                  placeholder="Código na NF-e do fornecedor"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-semibold"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Código do produto que vem na Nota Fiscal do fornecedor
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Código de Barras (EAN)</label>
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  placeholder="789..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Descrição do Produto *</label>
                <input
                  type="text"
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ex: Detergente Líquido 500ml"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Unidade de Medida</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value as UnitOfMeasure })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                >
                  <option value="UN">UN - Unidade</option>
                  <option value="KG">KG - Quilograma</option>
                  <option value="G">G - Grama</option>
                  <option value="L">L - Litro</option>
                  <option value="ML">ML - Mililitro</option>
                  <option value="M">M - Metro</option>
                  <option value="M²">M² - Metro Quadrado</option>
                  <option value="M³">M³ - Metro Cúbico</option>
                  <option value="CX">CX - Caixa</option>
                  <option value="PCT">PCT - Pacote</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo de Produto</label>
                <select
                  value={formData.productType}
                  onChange={(e) => setFormData({ ...formData, productType: e.target.value as ProductType })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                >
                  <option value="revenda">Revenda Comercial</option>
                  <option value="componente">Componente / Matéria-Prima</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Família</label>
                <input
                  type="text"
                  value={formData.family}
                  onChange={(e) => setFormData({ ...formData, family: e.target.value })}
                  placeholder="Ex: Limpeza"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Grupo</label>
                <input
                  type="text"
                  value={formData.group}
                  onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                  placeholder="Ex: Detergentes"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Local Padrão</label>
                  <select
                    value={formData.defaultLocationId}
                    onChange={(e) => setFormData({ ...formData, defaultLocationId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Custo Unitário (R$)</label>
                  {canViewCosts ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={costPriceInput}
                      onFocus={(e) => {
                        setCostPriceInput(formatEditableDecimalPtBr(Number(formData.costPrice || 0)));
                        const input = e.currentTarget;
                        requestAnimationFrame(() => input.select());
                      }}
                      onChange={(e) => {
                        const sanitized = sanitizeCurrencyInput(e.target.value);
                        setCostPriceInput(sanitized);
                        setFormData({ ...formData, costPrice: parseDecimalPtBr(sanitized) });
                      }}
                      onBlur={() => {
                        const numeric = parseDecimalPtBr(costPriceInput);
                        setFormData({ ...formData, costPrice: numeric });
                        setCostPriceInput(formatDecimalPtBr(numeric));
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                    />
                  ) : (
                    <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg font-mono text-slate-400 font-bold select-none cursor-not-allowed">
                      •••• (Acesso Restrito)
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Preço de Venda Matriz (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={salePriceInput}
                    onFocus={(e) => {
                      setSalePriceInput(formatEditableDecimalPtBr(Number(formData.salePrice || 0)));
                      const input = e.currentTarget;
                      requestAnimationFrame(() => input.select());
                    }}
                    onChange={(e) => {
                      const sanitized = sanitizeCurrencyInput(e.target.value);
                      setSalePriceInput(sanitized);
                      setFormData({ ...formData, salePrice: parseDecimalPtBr(sanitized) });
                    }}
                    onBlur={() => {
                      const numeric = parseDecimalPtBr(salePriceInput);
                      setFormData({ ...formData, salePrice: numeric });
                      setSalePriceInput(formatDecimalPtBr(numeric));
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-blue-700"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Preço base compartilhado c/ filiais
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Estoque Mínimo</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.minStock}
                    onChange={(e) => setFormData({ ...formData, minStock: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                  />
                </div>
              </div>

              {/* SEÇÃO ESPECIAL: TABELA DE PREÇOS INDIVIDUAL POR EMPRESA (MATRIZ E FILIAIS) */}
              <div className="sm:col-span-3 bg-gradient-to-br from-indigo-50/60 via-slate-50 to-indigo-50/40 border border-indigo-200 rounded-xl p-4 space-y-3 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Building2 size={18} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <span>Tabela de Preços e Estoque por Empresa (Matriz e Filiais)</span>
                        <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                          Catálogo Único Compartilhado
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        O produto é compartilhado entre todas as empresas. As filiais herdam o preço da Matriz por padrão ou podem praticar preços próprios.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Empresa</th>
                        <th className="p-2.5">Tipo</th>
                        <th className="p-2.5 text-right">Preço de Venda</th>
                        <th className="p-2.5 text-center">Situação da Tabela</th>
                        <th className="p-2.5 text-center">Estoque Atual</th>
                        <th className="p-2.5 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dbState.companies.map((comp) => {
                        const isMatriz = comp.type === 'matriz';
                        const override = formData.companyPrices?.[comp.id];
                        const customPrice = override?.salePrice;
                        const hasCustom = typeof customPrice === 'number' && customPrice > 0;

                        const compStock = editingProduct
                          ? StockEngine.getCompanyProductStock(
                              dbState.stockBalances,
                              editingProduct.id,
                              comp.id,
                              dbState.stockLocations
                            ).available
                          : 0;

                        return (
                          <tr key={comp.id} className="hover:bg-slate-50/50">
                            <td className="p-2.5 font-bold text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <Building2 size={14} className={isMatriz ? 'text-indigo-600' : 'text-slate-400'} />
                                <span>{comp.tradeName || comp.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block">
                                {comp.cnpjCpf || 'Sem CNPJ'} • {comp.address?.city || 'Brasil'}
                              </span>
                            </td>
                            <td className="p-2.5">
                              <span
                                className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                  isMatriz ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {isMatriz ? 'Matriz' : 'Filial'}
                              </span>
                            </td>
                            <td className="p-2.5 text-right">
                              {isMatriz ? (
                                <div className="font-extrabold text-indigo-700 font-mono text-xs">
                                  {formatCurrency(formData.salePrice || 0)}
                                  <span className="block text-[9px] text-slate-400 font-normal">(Base Matriz)</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 justify-end">
                                  <span className="text-slate-400 font-mono text-xs">R$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder={formatCurrency(formData.salePrice || 0).replace('R$', '').trim()}
                                    value={customPrice !== undefined ? customPrice : ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                      const nextCompanyPrices = { ...(formData.companyPrices || {}) };
                                      if (val === undefined || isNaN(val) || val <= 0) {
                                        delete nextCompanyPrices[comp.id];
                                      } else {
                                        nextCompanyPrices[comp.id] = {
                                          salePrice: val,
                                          updatedAt: new Date().toISOString(),
                                          updatedBy: currentUser.name,
                                        };
                                      }
                                      setFormData({ ...formData, companyPrices: nextCompanyPrices });
                                    }}
                                    className="w-24 px-2 py-1 bg-white border border-slate-300 rounded font-bold font-mono text-xs text-right text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                                  />
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 text-center">
                              {isMatriz ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                                  Tabela Base Principal
                                </span>
                              ) : hasCustom ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  <Check size={11} /> Preço Próprio da Filial
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                  Herdando Preço da Matriz
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-center font-bold text-slate-800">
                              {editingProduct ? (
                                <span>{formatQuantity(compStock)} {formData.unit || 'UN'}</span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </td>
                            <td className="p-2.5 text-center">
                              {!isMatriz && hasCustom && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextCompanyPrices = { ...(formData.companyPrices || {}) };
                                    delete nextCompanyPrices[comp.id];
                                    setFormData({ ...formData, companyPrices: nextCompanyPrices });
                                  }}
                                  className="text-[10px] text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer"
                                  title="Remover preço próprio e voltar a herdar o preço da Matriz"
                                >
                                  Restaurar da Matriz
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SEÇÃO ESPECIAL: CONTROLE DE DESCONTO MÁXIMO POR PRODUTO */}
              <div className="sm:col-span-3 bg-gradient-to-br from-rose-50/70 via-white to-rose-50/40 border border-rose-200 rounded-xl p-4 space-y-3 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-rose-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <ShieldAlert size={18} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-rose-950 uppercase tracking-wide">
                        Controlar Desconto Máximo
                      </h4>
                      <p className="text-[11px] text-slate-600">
                        Proteja a margem deste produto exigindo autorização de Administrador (Acesso Total) ou Gerente Geral quando o desconto ultrapassar o limite.
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-rose-300 shadow-2xs hover:bg-rose-50 transition-colors shrink-0">
                    <input
                      type="checkbox"
                      checked={!!formData.maxDiscountEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData({
                          ...formData,
                          maxDiscountEnabled: checked,
                          maxDiscountType: formData.maxDiscountType || 'percent',
                          maxDiscountValue: formData.maxDiscountValue ?? 0,
                        });
                      }}
                      className="w-4 h-4 text-rose-600 rounded accent-rose-600 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-rose-950 select-none">
                      {formData.maxDiscountEnabled ? '✓ Controle Ativado' : 'Ativar Controle'}
                    </span>
                  </label>
                </div>

                {formData.maxDiscountEnabled ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Tipo de limite *
                        </label>
                        <select
                          value={formData.maxDiscountType || 'percent'}
                          onChange={(e) => {
                            const nextType = e.target.value as ProductMaxDiscountType;
                            const currentVal = Number(formData.maxDiscountValue ?? 0);
                            const adjustedVal = nextType === 'percent' && currentVal > 100 ? 100 : currentVal;
                            setFormData({
                              ...formData,
                              maxDiscountType: nextType,
                              maxDiscountValue: adjustedVal,
                            });
                            setMaxDiscountInput(formatDecimalPtBr(adjustedVal));
                          }}
                          className="w-full px-3 py-2 bg-white border border-rose-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                        >
                          <option value="percent">Percentual (%)</option>
                          <option value="value">Valor monetário (R$)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Desconto máximo permitido ({formData.maxDiscountType === 'value' ? 'R$ por unidade' : '%'}) *
                        </label>
                        <div className="relative">
                          {formData.maxDiscountType === 'value' && (
                            <span className="absolute left-3 top-2 text-xs font-bold text-slate-500">R$</span>
                          )}
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0,00"
                            value={maxDiscountInput}
                            onFocus={(e) => {
                              setMaxDiscountInput(formatEditableDecimalPtBr(Number(formData.maxDiscountValue ?? 0)));
                              const input = e.currentTarget;
                              requestAnimationFrame(() => input.select());
                            }}
                            onChange={(e) => {
                              const sanitized = sanitizeCurrencyInput(e.target.value);
                              const numeric = parseDecimalPtBr(sanitized);
                              const capped = formData.maxDiscountType === 'percent' ? Math.min(100, numeric) : numeric;
                              setMaxDiscountInput(sanitized);
                              setFormData({ ...formData, maxDiscountValue: capped });
                            }}
                            onBlur={() => {
                              const numeric = parseDecimalPtBr(maxDiscountInput);
                              const capped = formData.maxDiscountType === 'percent' ? Math.min(100, numeric) : numeric;
                              setFormData({ ...formData, maxDiscountValue: capped });
                              setMaxDiscountInput(formatDecimalPtBr(capped));
                            }}
                            className={`w-full py-2 bg-white border border-rose-300 rounded-lg font-mono font-extrabold text-rose-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500 ${
                              formData.maxDiscountType === 'value' ? 'pl-9 pr-3' : 'pl-3 pr-8'
                            }`}
                          />
                          {formData.maxDiscountType !== 'value' && (
                            <span className="absolute right-3 top-2 text-xs font-bold text-slate-500">%</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Prévia explicativa do limite configurado */}
                    {(() => {
                      const salePrice = Number(formData.salePrice || 0);
                      const limVal = Number(formData.maxDiscountValue ?? 0);
                      if (limVal <= 0) {
                        return (
                          <div className="text-[11px] font-bold text-rose-900 bg-rose-100/70 border border-rose-200 rounded-lg px-3 py-2">
                            Limite definido em 0{formData.maxDiscountType === 'value' ? ' (R$ 0,00)' : '%'}: nenhum desconto poderá ser concedido neste produto sem autorização de Administrador ou Gerente Geral.
                          </div>
                        );
                      }
                      if (formData.maxDiscountType === 'value') {
                        const eqPct = salePrice > 0 ? (limVal / salePrice) * 100 : 0;
                        return (
                          <div className="text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2">
                            Descontos até <strong className="text-emerald-700">{formatCurrency(limVal)}</strong> por {formData.unit || 'UN'}
                            {salePrice > 0 ? ` (equivalente a ${eqPct.toFixed(2)}% sobre ${formatCurrency(salePrice)})` : ''} serão liberados normalmente. Acima disso exigirá autorização.
                          </div>
                        );
                      }
                      const eqVal = (salePrice * limVal) / 100;
                      return (
                        <div className="text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2">
                          Descontos até <strong className="text-emerald-700">{limVal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</strong>
                          {salePrice > 0 ? ` (equivalente a ${formatCurrency(eqVal)} sobre ${formatCurrency(salePrice)})` : ''} serão liberados normalmente. Acima disso exigirá autorização.
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Controle desativado: este produto seguirá o comportamento padrão do sistema, sem limite individual de desconto.
                  </p>
                )}
              </div>

              {/* SEÇÃO ESPECIAL: RECURSO EMBALAGEM MASTER */}
              <div className="sm:col-span-3 bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-amber-50/80 border border-amber-300 rounded-xl p-4 space-y-3 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Boxes size={18} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
                        <span>Recurso: Embalagem Master</span>
                        <span className="text-[10px] font-bold bg-amber-200/80 text-amber-900 px-1.5 py-0.2 rounded">
                          Atacado / Caixas / Fardos
                        </span>
                      </h4>
                      <p className="text-[11px] text-amber-800">
                        Venda caixas ou pacotes com 10, 20 ou 30 unidades vinculadas diretamente ao produto unitário.
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-amber-300 shadow-2xs hover:bg-amber-100/60 transition-colors shrink-0">
                    <input
                      type="checkbox"
                      checked={!!formData.isMasterPack}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        const defaultAssoc = availableUnitProducts[0];
                        setFormData({
                          ...formData,
                          isMasterPack: isChecked,
                          unit: isChecked && (formData.unit === 'UN' || !formData.unit) ? 'CX' : formData.unit,
                          masterPackUnits: formData.masterPackUnits || 10,
                          masterPackPackagingType: formData.masterPackPackagingType || 'caixa',
                          masterPackAssociatedProductId: isChecked
                            ? formData.masterPackAssociatedProductId || defaultAssoc?.id || ''
                            : '',
                          masterPackAssociatedProductCode: isChecked
                            ? formData.masterPackAssociatedProductCode || defaultAssoc?.code || ''
                            : '',
                          masterPackAssociatedProductDescription: isChecked
                            ? formData.masterPackAssociatedProductDescription || defaultAssoc?.description || ''
                            : '',
                          description: isChecked && (!formData.description || formData.description.trim() === '') && defaultAssoc
                            ? `Caixa ${defaultAssoc.description} c/ 10 UN`
                            : formData.description,
                        });
                      }}
                      className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-amber-950 select-none">
                      {formData.isMasterPack ? '✓ Embalagem Master Habilitada' : 'Habilitar Embalagem Master'}
                    </span>
                  </label>
                </div>

                {formData.isMasterPack && (
                  <div className="space-y-3 pt-1 animate-fadeIn">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      {/* 1. Produto Unitário Associado */}
                      <div className="sm:col-span-2">
                        <label className="block font-bold text-amber-950 text-xs mb-1">
                          Produto Unitário Associado (Vende apenas 1 unidade) *
                        </label>
                        <select
                          value={formData.masterPackAssociatedProductId || ''}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            const target = dbState.products.find((p) => p.id === selectedId);
                            const units = formData.masterPackUnits || 10;
                            const packTypeLabel = formData.masterPackPackagingType === 'pacote' ? 'Pacote' : formData.masterPackPackagingType === 'fardo' ? 'Fardo' : 'Caixa';
                            setFormData({
                              ...formData,
                              masterPackAssociatedProductId: selectedId,
                              masterPackAssociatedProductCode: target?.code || '',
                              masterPackAssociatedProductDescription: target?.description || '',
                              description: target
                                ? `${packTypeLabel} ${target.description} c/ ${units} UN`
                                : formData.description,
                            });
                          }}
                          className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">Selecione o produto unitário associado...</option>
                          {availableUnitProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              [{p.code}] {p.description} • Unidade: {p.unit} (Custo: {formatCurrency(p.costPrice)} | Venda: {formatCurrency(p.salePrice)})
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-amber-900/80 mt-0.5 block">
                          Toda venda desta Embalagem Master deduzirá automaticamente o estoque do produto unitário selecionado acima.
                        </span>
                      </div>

                      {/* 2. Tipo de Embalagem */}
                      <div>
                        <label className="block font-bold text-amber-950 text-xs mb-1">
                          Tipo de Embalagem
                        </label>
                        <select
                          value={formData.masterPackPackagingType || 'caixa'}
                          onChange={(e) => {
                            const newPackType = e.target.value as any;
                            const assoc = dbState.products.find((p) => p.id === formData.masterPackAssociatedProductId);
                            const units = formData.masterPackUnits || 10;
                            const packPrefix = newPackType === 'pacote' ? 'Pacote' : newPackType === 'fardo' ? 'Fardo' : newPackType === 'display' ? 'Display' : newPackType === 'kit' ? 'Kit' : 'Caixa';
                            const newUnit: UnitOfMeasure = newPackType === 'pacote' ? 'PCT' : 'CX';
                            setFormData({
                              ...formData,
                              masterPackPackagingType: newPackType,
                              unit: newUnit,
                              description: assoc
                                ? `${packPrefix} ${assoc.description} c/ ${units} UN`
                                : formData.description,
                            });
                          }}
                          className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="caixa">Caixa (CX)</option>
                          <option value="pacote">Pacote (PCT)</option>
                          <option value="fardo">Fardo (FARDO)</option>
                          <option value="display">Display</option>
                          <option value="kit">Kit / Conjunto</option>
                          <option value="outro">Outro</option>
                        </select>
                      </div>

                      {/* 3. Quantidade de Unidades por Embalagem Master */}
                      <div>
                        <label className="block font-bold text-amber-950 text-xs mb-1">
                          Unidades p/ Embalagem *
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          required={formData.isMasterPack}
                          value={formData.masterPackUnits || 10}
                          onChange={(e) => {
                            const units = Math.max(1, parseInt(e.target.value) || 1);
                            const assoc = dbState.products.find((p) => p.id === formData.masterPackAssociatedProductId);
                            const packPrefix = formData.masterPackPackagingType === 'pacote' ? 'Pacote' : formData.masterPackPackagingType === 'fardo' ? 'Fardo' : 'Caixa';
                            setFormData({
                              ...formData,
                              masterPackUnits: units,
                              description: assoc
                                ? `${packPrefix} ${assoc.description} c/ ${units} UN`
                                : formData.description,
                            });
                          }}
                          className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                        />
                        {/* Botões de atalho rápido */}
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className="text-[10px] text-amber-900 font-bold mr-0.5">Sugestões:</span>
                          {[10, 12, 20, 24, 30, 50].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                const assoc = dbState.products.find((p) => p.id === formData.masterPackAssociatedProductId);
                                const packPrefix = formData.masterPackPackagingType === 'pacote' ? 'Pacote' : formData.masterPackPackagingType === 'fardo' ? 'Fardo' : 'Caixa';
                                setFormData({
                                  ...formData,
                                  masterPackUnits: preset,
                                  description: assoc
                                    ? `${packPrefix} ${assoc.description} c/ ${preset} UN`
                                    : formData.description,
                                });
                              }}
                              className={`px-1.5 py-0.5 text-[10px] rounded font-bold border transition-colors cursor-pointer ${
                                formData.masterPackUnits === preset
                                  ? 'bg-amber-600 text-white border-amber-700'
                                  : 'bg-white text-amber-950 border-amber-300 hover:bg-amber-100'
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Resumo Dinâmico com Estoque do Associado e Sugestões de Preço */}
                    {(() => {
                      const assoc = dbState.products.find((p) => p.id === formData.masterPackAssociatedProductId);
                      if (!assoc) return null;
                      const units = formData.masterPackUnits || 10;
                      const calculatedCost = Number((assoc.costPrice * units).toFixed(2));
                      const calculatedSale = Number((assoc.salePrice * units).toFixed(2));
                      const assocStock = StockEngine.getTotalProductStock(dbState.stockBalances, assoc.id);
                      const availablePacks = Math.floor(assocStock.available / units);

                      return (
                        <div className="bg-white/95 border border-amber-300 rounded-xl p-3 text-xs space-y-2 shadow-2xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-slate-800 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              Produto associado: <span className="text-blue-700 font-mono font-extrabold">{assoc.code}</span> - {assoc.description}
                            </span>
                            <span className="text-[11px] font-black bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded-full border border-emerald-300">
                              Estoque Disponível da Caixa: {availablePacks} {formData.unit || 'CX'} ({assocStock.available} {assoc.unit} no unitário)
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-[11px]">
                            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200">
                              <span>
                                Custo Sugerido ({formatCurrency(assoc.costPrice)} x {units}): <strong className="text-slate-800">{formatCurrency(calculatedCost)}</strong>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData({ ...formData, costPrice: calculatedCost });
                                  setCostPriceInput(formatDecimalPtBr(calculatedCost));
                                }}
                                className="text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 cursor-pointer transition-colors"
                              >
                                Aplicar Custo
                              </button>
                            </div>
                            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200">
                              <span>
                                Venda Sugerida ({formatCurrency(assoc.salePrice)} x {units}): <strong className="text-slate-800">{formatCurrency(calculatedSale)}</strong>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData({ ...formData, salePrice: calculatedSale });
                                  setSalePriceInput(formatDecimalPtBr(calculatedSale));
                                }}
                                className="text-[10px] font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 cursor-pointer transition-colors"
                              >
                                Aplicar Venda
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="sm:col-span-3 flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.hasComposition}
                    onChange={(e) => setFormData({ ...formData, hasComposition: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded-sm"
                  />
                  <span>Produto de Fabricação Própria (Possui Composição)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.status === 'ativo'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.checked ? 'ativo' : 'inativo' })}
                    className="w-4 h-4 text-blue-600 rounded-sm"
                  />
                  <span>Cadastro Ativo</span>
                </label>
              </div>

              <div className="sm:col-span-3 space-y-2">
                <label className="block font-bold text-slate-700 mb-1">Observação</label>
                <textarea
                  rows={3}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Ex: Desconto máximo permitido de 5%. Informações comerciais, técnicas ou instruções importantes sobre o produto..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />

                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    formData.showSaleAlert
                      ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/70'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!formData.showSaleAlert}
                    onChange={(e) => setFormData({ ...formData, showSaleAlert: e.target.checked })}
                    className="w-4 h-4 mt-0.5 text-amber-600 rounded-sm accent-amber-600 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <span className="font-bold flex items-center gap-1.5">
                      <AlertTriangle size={14} className={formData.showSaleAlert ? 'text-amber-600' : 'text-slate-400'} />
                      <span>Exibir aviso durante a venda</span>
                    </span>
                    <p className="text-[11px] text-slate-500 font-normal">
                      Quando marcado e houver texto em Observação, um aviso destacado aparecerá automaticamente no PDV Balcão, Pedido de Venda e Venda Mobile ao selecionar este produto.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs"
              >
                Salvar Produto
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Detalhamento de Estoque e Tabela de Preços por Empresa (Matriz e Filiais) */}
      {viewStockProduct && (() => {
        const grid = StockEngine.getMultiCompanyStockGrid(
          dbState.stockBalances,
          viewStockProduct,
          dbState.companies,
          dbState.products
        );
        const totalConsolidated = StockEngine.getTotalProductStock(dbState.stockBalances, viewStockProduct.id);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 my-8">
              <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Building2 size={22} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-800">
                      Grade Multiemprego: Estoque e Preços por Empresa
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      <strong className="text-blue-700 font-mono">[{viewStockProduct.code}]</strong> {viewStockProduct.description} • Unidade: <strong>{viewStockProduct.unit}</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setViewStockProduct(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {viewStockProduct.isMasterPack && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-950 flex items-start gap-2.5 shadow-2xs">
                  <Boxes size={18} className="text-amber-700 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-extrabold text-amber-900">
                      Embalagem Master ({viewStockProduct.masterPackUnits} unidades por {viewStockProduct.unit})
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      O estoque desta embalagem é controlado e sincronizado diretamente através do produto unitário <strong className="font-mono text-amber-950">[{viewStockProduct.masterPackAssociatedProductCode}]</strong> ({viewStockProduct.masterPackAssociatedProductDescription}). Cada venda baixa {viewStockProduct.masterPackUnits} unidades no estoque da respectiva empresa da operação.
                    </p>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200 tracking-wider">
                    <tr>
                      <th className="p-3">Empresa</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Depósitos</th>
                      <th className="p-3 text-right">Tabela de Preço</th>
                      <th className="p-3 text-center">Situação do Preço</th>
                      <th className="p-3 text-right">Físico</th>
                      <th className="p-3 text-right">Reservado</th>
                      <th className="p-3 text-right">Disponível</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {grid.map((row) => {
                      const isMatriz = row.companyType === 'matriz';
                      return (
                        <tr key={row.companyId} className="hover:bg-slate-50/70">
                          <td className="p-3 font-bold text-slate-800">
                            <div className="flex items-center gap-1.5">
                              <Building2 size={15} className={isMatriz ? 'text-indigo-600' : 'text-slate-400'} />
                              <span>{row.companyTradeName || row.companyName}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono block">
                              {dbState.companies.find((c) => c.id === row.companyId)?.cnpjCpf || 'Sem CNPJ'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                isMatriz ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {isMatriz ? 'Matriz' : 'Filial'}
                            </span>
                          </td>
                          <td className="p-3 text-[11px] text-slate-600">
                            {row.locations.length === 0 ? (
                              <span className="text-slate-400 italic">Sem locais</span>
                            ) : (
                              row.locations.map((loc) => (
                                <div key={loc.locationId} className="text-[11px]">
                                  <span className="font-semibold text-slate-700">{loc.locationName}:</span>{' '}
                                  <span className="font-mono font-bold text-slate-900">{formatQuantity(loc.quantity)}</span>
                                </div>
                              ))
                            )}
                          </td>
                          <td className="p-3 text-right font-extrabold font-mono text-xs text-slate-900">
                            {formatCurrency(row.price)}
                          </td>
                          <td className="p-3 text-center">
                            {isMatriz ? (
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                                Preço Base (Matriz)
                              </span>
                            ) : !row.isInheritedPrice ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                Preço Filial Próprio
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                Herda da Matriz
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-600">
                            {formatQuantity(row.physicalStock)}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-400">
                            {formatQuantity(row.reservedStock)}
                          </td>
                          <td className="p-3 text-right font-mono font-extrabold text-sm text-blue-700">
                            {formatQuantity(row.availableStock)} {viewStockProduct.unit}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Linha de Consolidação Total da Rede */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-slate-700">Estoque Consolidado de Toda a Rede:</span>
                  <span className="text-slate-500 text-[11px] block">
                    Soma de todas as empresas cadastradas ({dbState.companies.length} empresas vinculadas ao catálogo compartilhado)
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-black text-blue-700 text-base font-mono">
                    {formatQuantity(totalConsolidated.available)} {viewStockProduct.unit}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Físico Total: {formatQuantity(totalConsolidated.physical)} • Reservado: {formatQuantity(totalConsolidated.reserved)}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const prodToEdit = viewStockProduct;
                    setViewStockProduct(null);
                    handleOpenEdit(prodToEdit);
                  }}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border border-indigo-200"
                >
                  <Edit2 size={14} />
                  <span>Editar Preços por Empresa</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewStockProduct(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de Importação Excel em Massa */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 my-8">
            <div className="flex justify-between items-start pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                  <FileSpreadsheet className="text-emerald-600" size={20} />
                  <span>Importação de Produtos & Embalagens Master via Excel</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Importe mercadorias, componentes e caixas master configuradas com deduções automáticas de estoque.
                </p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Banner de Ajuda e Download do Modelo */}
            <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
                  <Boxes size={16} className="text-emerald-700" />
                  <span>Precisa da Planilha Modelo Oficial com campos de Embalagem Master?</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  A planilha modelo contém as colunas necessárias (<code className="font-mono bg-white/70 px-1 rounded">EmbalagemMaster</code>, <code className="font-mono bg-white/70 px-1 rounded">CodigoProdutoAssociado</code>, <code className="font-mono bg-white/70 px-1 rounded">UnidadesPorEmbalagem</code>, <code className="font-mono bg-white/70 px-1 rounded">TipoEmbalagem</code>) e inclui um exemplo prático já preenchido.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Download size={14} />
                <span>Baixar Modelo (.xlsx)</span>
              </button>
            </div>

            {/* Opções de Importação */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Modo de Gravação:</label>
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-semibold text-slate-800"
                >
                  <option value="insert_update">Incluir Novos e Atualizar Existentes (Recomendado)</option>
                  <option value="insert_only">Somente Novos (Rejeitar Códigos Duplicados)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Local Padrão de Estoque:</label>
                <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg font-semibold text-slate-700">
                  {locations[0]?.name || 'Local Comercial'} ({locations[0]?.code || 'REV-01'})
                </div>
              </div>
            </div>

            {/* Input de Upload do Arquivo */}
            <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 text-center bg-slate-50 hover:bg-blue-50/20 transition-all cursor-pointer">
              <input
                type="file"
                id="modal-excel-product-input"
                accept=".xlsx, .xls"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label htmlFor="modal-excel-product-input" className="cursor-pointer block">
                <Upload size={32} className="mx-auto text-blue-600 mb-2" />
                <span className="font-bold text-sm text-slate-800 block">
                  {isLoadingImport ? 'Processando e validando planilha...' : 'Clique para selecionar o arquivo Excel (.xlsx ou .xls)'}
                </span>
                <span className="text-xs text-slate-400 mt-1 block">
                  O sistema fará a validação completa antes de aplicar qualquer alteração aos cadastros.
                </span>
              </label>
            </div>

            {/* Mensagem de Erro Geral */}
            {importErrorMsg && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl flex items-center gap-2 text-xs font-semibold">
                <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                <span>{importErrorMsg}</span>
              </div>
            )}

            {/* Mensagem de Sucesso */}
            {importSuccessMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl flex items-center gap-2 text-xs font-semibold">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <span>{importSuccessMsg}</span>
              </div>
            )}

            {/* Relatório de Validação e Prévia */}
            {importPreview && (
              <div className="space-y-3.5 pt-2 border-t border-slate-100">
                {/* Resumo */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                  <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[10px]">Total de Linhas</span>
                    <span className="font-extrabold text-slate-900 text-base">{importPreview.summary.totalRows}</span>
                  </div>
                  <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                    <span className="text-emerald-700 block text-[10px]">Produtos Válidos</span>
                    <span className="font-extrabold text-emerald-800 text-base">{importPreview.summary.validCount}</span>
                  </div>
                  <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-200">
                    <span className="text-blue-700 block text-[10px]">Novos / Atualizações</span>
                    <span className="font-extrabold text-blue-800 text-base">
                      {importPreview.summary.toInsertCount} novos / {importPreview.summary.toUpdateCount} atualiz.
                    </span>
                  </div>
                  <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                    <span className="text-rose-700 block text-[10px]">Linhas Inconsistentes</span>
                    <span className="font-extrabold text-rose-800 text-base">{importPreview.summary.invalidCount}</span>
                  </div>
                </div>

                {/* Relatório de Inconsistências se houver */}
                {importPreview.invalidRows.length > 0 && (
                  <div className="bg-rose-50/90 border border-rose-200 rounded-xl p-3.5 space-y-1.5 text-xs">
                    <div className="font-bold text-rose-800 flex items-center gap-1.5">
                      <AlertTriangle size={15} />
                      <span>Linhas com Inconsistências Detectadas na Planilha:</span>
                    </div>
                    <div className="max-h-32 overflow-y-auto divide-y divide-rose-200/60 text-[11px]">
                      {importPreview.invalidRows.map((inv, idx) => (
                        <div key={idx} className="py-1 text-rose-900">
                          <strong>Linha {inv.rowNumber}:</strong>{' '}
                          {inv.issues.map((iss) => `${iss.field}: ${iss.message}`).join(' | ')}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tabela de Prévia dos Dados */}
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs max-h-56 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] sticky top-0">
                      <tr>
                        <th className="p-2.5">Código</th>
                        <th className="p-2.5">Descrição</th>
                        <th className="p-2.5">Unidade</th>
                        <th className="p-2.5 text-right">Custo</th>
                        <th className="p-2.5 text-right">Preço Venda</th>
                        <th className="p-2.5">Embalagem Master</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importPreview.validRows.slice(0, 20).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-bold text-slate-700">{row.code}</td>
                          <td className="p-2.5 font-semibold text-slate-800">{row.description}</td>
                          <td className="p-2.5 text-slate-600">{row.unit}</td>
                          <td className="p-2.5 text-right font-mono text-slate-600">{formatCurrency(row.costPrice || 0)}</td>
                          <td className="p-2.5 text-right font-bold text-blue-700">{formatCurrency(row.salePrice || 0)}</td>
                          <td className="p-2.5">
                            {row.isMasterPack ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-900 font-bold">
                                  <Boxes size={11} />
                                  Master ({row.masterPackUnits} UN)
                                </span>
                                {row.masterPackAssociatedProductCode && (
                                  <div className="text-[10px] text-amber-700 font-mono">
                                    ↳ {row.masterPackAssociatedProductCode}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400">Unitário</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Botões de Ação da Importação */}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setImportPreview(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Descartar Prévia
                  </button>
                  <button
                    type="button"
                    disabled={importPreview.validRows.length === 0}
                    onClick={handleConfirmImport}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileCheck size={16} />
                    <span>Confirmar Importação ({importPreview.summary.validCount} Produtos)</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Seguro de Aviso / Impedimento (sem alert nativo) */}
      {alertWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
              <AlertTriangle size={20} />
              <span>Operação Não Permitida</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {alertWarningModal}
            </p>
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setAlertWarningModal(null)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg cursor-pointer"
              >
                Compreendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Seguro de Inativação (sem window.confirm) */}
      {confirmInactivateProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
              <AlertTriangle size={20} className="text-amber-600" />
              <span>Inativar Produto com Histórico</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              O produto <strong>{confirmInactivateProduct.code} - {confirmInactivateProduct.description}</strong> possui movimentações ou pedidos registrados e não pode ser excluído permanentemente para preservar a consistência fiscal e contábil.
            </p>
            <p className="text-xs text-amber-800 font-medium">
              Deseja alterar a situação deste produto para <strong>INATIVO</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setConfirmInactivateProduct(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => executeInactivate(confirmInactivateProduct)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
              >
                Sim, Inativar Produto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Seguro de Exclusão Física (sem window.confirm) */}
      {confirmDeleteProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
              <Trash2 size={20} />
              <span>Excluir Produto Permanentemente</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Tem certeza que deseja remover o produto <strong>{confirmDeleteProduct.code} - {confirmDeleteProduct.description}</strong>? Esta ação é definitiva e removerá os saldos associados.
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setConfirmDeleteProduct(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => executeDelete(confirmDeleteProduct)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
