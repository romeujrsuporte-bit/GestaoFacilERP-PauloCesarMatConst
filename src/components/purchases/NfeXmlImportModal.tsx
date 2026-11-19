import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileCode,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Package,
  Layers,
  ArrowRight,
  ArrowLeft,
  DollarSign,
  Calendar,
  Sparkles,
  Info,
  Check,
  Search,
  Plus,
  ShieldCheck,
  FileCheck2,
  X,
  Boxes,
  Loader2,
  Barcode,
} from 'lucide-react';
import { Database } from '../../services/db';
import { NfeXmlService } from '../../services/nfeXmlService';
import {
  NfeParsedData,
  NfeParsedProduct,
  NfeItemClassification,
  Product,
  StockLocation,
  Supplier,
  AccountPayable,
  StockMovement,
  PurchaseOrder,
  PurchaseOrderItem,
  ChartOfAccount,
} from '../../types';
import { StockEngine } from '../../services/stockEngine';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { toast } from '../../services/toast';
import { FirebaseSyncService } from '../../services/firebaseSync';

// Normalização para comparação inteligente de descrições
function normalizeProdStr(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Algoritmo refinado de busca e associação de produtos para prevenir duplicidades
function findMatchingProduct(
  xmlItem: NfeParsedProduct,
  products: Product[],
  supplierCnpj: string
): { product?: Product; matchReason?: string } {
  // 1. Mapeamento inteligente de fornecedor previamente memorizado
  const memorized = Database.getSupplierProductMapping(supplierCnpj, xmlItem.code);
  if (memorized) {
    const p = products.find((prod) => prod.id === memorized.systemProductId && prod.status === 'ativo');
    if (p) return { product: p, matchReason: 'Mapeamento Memorizado' };
  }

  // 2. Código de barras EAN exato do XML
  if (xmlItem.barcode) {
    const p = products.find(
      (prod) => prod.status === 'ativo' && prod.barcode && prod.barcode.trim() === xmlItem.barcode!.trim()
    );
    if (p) return { product: p, matchReason: `Código de Barras (${xmlItem.barcode})` };
  }

  // Se xmlItem.code for numérico com 8 a 14 dígitos (EAN-8, EAN-13, EAN-14)
  if (/^\d{8,14}$/.test(xmlItem.code.trim())) {
    const p = products.find(
      (prod) => prod.status === 'ativo' && prod.barcode && prod.barcode.trim() === xmlItem.code.trim()
    );
    if (p) return { product: p, matchReason: `Código de Barras GTIN (${xmlItem.code})` };
  }

  // 3. Código Referência do produto (código na NF-e do fornecedor)
  const cleanCode = xmlItem.code.trim().toLowerCase();
  const strippedCode = cleanCode.replace(/^0+/, '');
  if (cleanCode) {
    const pRef = products.find((prod) => {
      if (prod.status !== 'ativo' || !prod.referenceCode) return false;
      const refTokens = prod.referenceCode
        .split(/[;,]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      return refTokens.some(
        (r) => r === cleanCode || (strippedCode && r.replace(/^0+/, '') === strippedCode)
      );
    });
    if (pRef) return { product: pRef, matchReason: `Código Referência (${pRef.referenceCode})` };
  }

  // 4. Código do produto no catálogo do ERP (exato ou sem zeros à esquerda)
  const pCode = products.find((prod) => {
    if (prod.status !== 'ativo') return false;
    const c = prod.code.trim().toLowerCase();
    return c === cleanCode || (strippedCode && c.replace(/^0+/, '') === strippedCode);
  });
  if (pCode) return { product: pCode, matchReason: `Código no ERP (${pCode.code})` };

  // 4. Descrição exata (case-insensitive)
  const cleanDesc = xmlItem.description.trim().toLowerCase();
  const pDescExact = products.find(
    (prod) => prod.status === 'ativo' && prod.description.trim().toLowerCase() === cleanDesc
  );
  if (pDescExact) return { product: pDescExact, matchReason: 'Descrição Idêntica' };

  // 5. Descrição normalizada (sem acentos e caracteres especiais)
  const normDesc = normalizeProdStr(xmlItem.description);
  if (normDesc.length >= 4) {
    const pDescNorm = products.find(
      (prod) => prod.status === 'ativo' && normalizeProdStr(prod.description) === normDesc
    );
    if (pDescNorm) return { product: pDescNorm, matchReason: 'Descrição Semelhante' };
  }

  return {};
}

interface NfeXmlImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel?: () => void;
  onSuccess?: () => void;
}

export const NfeXmlImportModal: React.FC<NfeXmlImportModalProps> = ({
  isOpen,
  onClose,
  onCancel,
  onSuccess,
}) => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  // Wizard Step: 1 = Upload, 2 = Mapeamento & Estoque, 3 = Classificação Contábil, 4 = Financeiro & Confirmação
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Trava de submissão e processamento concorrente
  const [isImporting, setIsImporting] = useState(false);
  const isImportingRef = useRef(false);

  // Dados do XML
  const [rawXml, setRawXml] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedData, setParsedData] = useState<NfeParsedData | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Etapa 2: Empresa e Estoque
  const [targetCompanyId, setTargetCompanyId] = useState<string>(currentCompany.id);
  const [matchedSupplier, setMatchedSupplier] = useState<Supplier | null>(null);
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);

  // Mapeamento de itens
  const [itemsMapping, setItemsMapping] = useState<
    Array<{
      itemNumber: number;
      xmlProduct: NfeParsedProduct;
      selectedProductId: string;
      selectedLocationId: string;
      createAsNew: boolean;
      autoMatched?: boolean;
      matchReason?: string;
    }>
  >([]);

  // Etapa 3: Classificação Contábil
  const [itemsClassification, setItemsClassification] = useState<
    Array<{
      itemNumber: number;
      description: string;
      totalPrice: number;
      chartAccountId: string;
      launchCode: string;
      chartAccountName: string;
      chartAccountCode: string;
    }>
  >([]);

  // Seleção de itens para aplicação em lote
  const [selectedItemIndices, setSelectedItemIndices] = useState<number[]>([]);
  const [batchLaunchCode, setBatchLaunchCode] = useState('');
  const [batchAccountId, setBatchAccountId] = useState('');
  const [rememberMapping, setRememberMapping] = useState(true);

  // Contas analíticas do plano de contas
  const analyticalAccounts = useMemo(() => {
    return Database.getChartOfAccounts().filter((a) => a.type === 'analitica' && a.status === 'ativo');
  }, [dbState]);

  // Contas recomendadas para compras / estoque / imobilizado (Grupo 9 e despesas)
  const purchaseRecommendedAccounts = useMemo(() => {
    return analyticalAccounts.filter(
      (a) =>
        a.hierarchicalCode.startsWith('9.') ||
        a.hierarchicalCode.startsWith('4.') ||
        a.hierarchicalCode.startsWith('5.')
    );
  }, [analyticalAccounts]);

  // Resumo do rateio da classificação contábil (mantido antes de qualquer return condicional para respeitar as Rules of Hooks)
  const classificationSummary = useMemo(() => {
    const summaryMap: Record<
      string,
      {
        chartAccountId: string;
        launchCode: string;
        chartAccountName: string;
        chartAccountCode: string;
        amount: number;
        itemsCount: number;
      }
    > = {};

    let totalAmount = 0;
    let pendingCount = 0;

    itemsClassification.forEach((item) => {
      totalAmount += item.totalPrice;
      if (!item.chartAccountId || !item.launchCode) {
        pendingCount++;
        return;
      }

      const key = item.chartAccountId;
      if (!summaryMap[key]) {
        summaryMap[key] = {
          chartAccountId: item.chartAccountId,
          launchCode: item.launchCode,
          chartAccountName: item.chartAccountName,
          chartAccountCode: item.chartAccountCode,
          amount: 0,
          itemsCount: 0,
        };
      }
      summaryMap[key].amount += item.totalPrice;
      summaryMap[key].itemsCount++;
    });

    const groups = Object.values(summaryMap);
    return {
      groups,
      totalAmount,
      pendingCount,
      isFullyClassified: pendingCount === 0 && itemsClassification.length > 0,
      isSingleClassification: groups.length === 1 && pendingCount === 0,
    };
  }, [itemsClassification]);

  const targetCompany = dbState.companies.find((c) => c.id === targetCompanyId) || currentCompany;
  const targetCompanyLocations = dbState.stockLocations.filter(
    (l) => l.companyId === targetCompanyId && l.status === 'ativo'
  );

  // Resetar modal
  const handleReset = () => {
    setStep(1);
    setIsImporting(false);
    isImportingRef.current = false;
    setRawXml('');
    setFileName('');
    setParsedData(null);
    setDuplicateWarning(null);
    setMatchedSupplier(null);
    setIsCreatingSupplier(false);
    setItemsMapping([]);
    setItemsClassification([]);
    setSelectedItemIndices([]);
    setBatchLaunchCode('');
    setBatchAccountId('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleCancel = () => {
    handleReset();
    if (onCancel) {
      onCancel();
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  // 1. Processar arquivo XML carregado
  const handleProcessXmlString = (xmlString: string, name = 'arquivo.xml') => {
    setRawXml(xmlString);
    setFileName(name);

    const result = NfeXmlService.parseXml(xmlString);
    if (!result.success || !result.data) {
      toast.error(result.error || 'Erro ao ler arquivo XML.', 'Falha de Leitura');
      return;
    }

    const nfe = result.data;
    setParsedData(nfe);

    // Verificar duplicidade pela chave de acesso (44 dígitos)
    const existing = Database.findNfeByAccessKey(nfe.accessKey);
    if (existing) {
      setDuplicateWarning(
        `Atenção: A chave de acesso desta NF-e (${nfe.accessKey}) já foi importada anteriormente para a empresa "${existing.companyName}" em ${new Date(existing.importDate).toLocaleDateString('pt-BR')}. Reimportar pode duplicar o estoque e títulos financeiros.`
      );
    } else {
      setDuplicateWarning(null);
    }

    // Identificar fornecedor pelo CNPJ
    const cleanCnpj = nfe.supplierCpfCnpj.replace(/\D/g, '');
    const foundSupplier = dbState.suppliers.find(
      (s) => s.cpfCnpj.replace(/\D/g, '') === cleanCnpj
    );
    setMatchedSupplier(foundSupplier || null);

    // Mapear produtos com algoritmo refinado e prevenção estrita de duplicidades intra-XML
    const intraXmlResolved = new Map<string, { productId: string; locationId: string; reason: string }>();

    const initialMapping = nfe.items.map((xmlItem) => {
      const codeKey = xmlItem.code.trim().toLowerCase();
      const normDesc = normalizeProdStr(xmlItem.description);
      const barcodeKey = xmlItem.barcode ? xmlItem.barcode.trim() : '';

      let matchedProd: Product | undefined;
      let reason: string | undefined;

      // Verificar se item anterior nesta MESMA nota fiscal já unificou este produto
      const previousMatch =
        (codeKey ? intraXmlResolved.get('code:' + codeKey) : undefined) ||
        (barcodeKey ? intraXmlResolved.get('ean:' + barcodeKey) : undefined) ||
        (normDesc ? intraXmlResolved.get('desc:' + normDesc) : undefined);

      if (previousMatch) {
        matchedProd = dbState.products.find((p) => p.id === previousMatch.productId);
        reason = 'Item correlato unificado na mesma NF-e';
      } else {
        const matchRes = findMatchingProduct(xmlItem, dbState.products, nfe.supplierCpfCnpj);
        matchedProd = matchRes.product;
        reason = matchRes.matchReason;
      }

      const defaultLoc =
        targetCompanyLocations[0]?.id || dbState.stockLocations[0]?.id || 'loc-comercial';
      const locId = matchedProd?.defaultLocationId || defaultLoc;

      if (matchedProd) {
        if (codeKey) intraXmlResolved.set('code:' + codeKey, { productId: matchedProd.id, locationId: locId, reason: reason || '' });
        if (barcodeKey) intraXmlResolved.set('ean:' + barcodeKey, { productId: matchedProd.id, locationId: locId, reason: reason || '' });
        if (normDesc) intraXmlResolved.set('desc:' + normDesc, { productId: matchedProd.id, locationId: locId, reason: reason || '' });
      }

      return {
        itemNumber: xmlItem.itemNumber,
        xmlProduct: xmlItem,
        selectedProductId: matchedProd ? matchedProd.id : '',
        selectedLocationId: locId,
        createAsNew: !matchedProd,
        autoMatched: Boolean(matchedProd),
        matchReason: reason,
      };
    });

    setItemsMapping(initialMapping);

    // Preparar classificação inicial inteligente
    const initialClassifications = nfe.items.map((xmlItem) => {
      const memorized = Database.getSupplierProductMapping(nfe.supplierCpfCnpj, xmlItem.code);
      let defAccount: ChartOfAccount | undefined;

      if (memorized && memorized.defaultChartAccountId) {
        defAccount = analyticalAccounts.find((a) => a.id === memorized.defaultChartAccountId);
      }

      // Se não memorizado, sugerir por regras de negócio conhecidas
      if (!defAccount) {
        const descLower = xmlItem.description.toLowerCase();
        if (descLower.includes('matéria-prima') || descLower.includes('materia prima') || descLower.includes('quimic') || descLower.includes('químic') || descLower.includes('insumo')) {
          defAccount = analyticalAccounts.find((a) => a.launchCode === '202' || a.hierarchicalCode === '9.1.02');
        } else if (descLower.includes('embalag') || descLower.includes('frasco') || descLower.includes('caixa') || descLower.includes('pote') || descLower.includes('tampa')) {
          defAccount = analyticalAccounts.find((a) => a.launchCode === '204' || a.hierarchicalCode === '9.1.04');
        } else if (descLower.includes('máquina') || descLower.includes('maquina') || descLower.includes('equipamento')) {
          defAccount = analyticalAccounts.find((a) => a.launchCode === '210' || a.hierarchicalCode === '9.2.01');
        } else {
          // Padrão: Compra de mercadorias para revenda (201 - 9.1.01)
          defAccount = analyticalAccounts.find((a) => a.launchCode === '201' || a.hierarchicalCode === '9.1.01');
        }
      }

      return {
        itemNumber: xmlItem.itemNumber,
        description: xmlItem.description,
        totalPrice: xmlItem.totalPrice,
        chartAccountId: defAccount ? defAccount.id : '',
        launchCode: defAccount?.launchCode || '',
        chartAccountName: defAccount ? defAccount.name : '',
        chartAccountCode: defAccount ? defAccount.hierarchicalCode : '',
      };
    });

    setItemsClassification(initialClassifications);
    setSelectedItemIndices(nfe.items.map((_, idx) => idx));
    toast.success(`NF-e nº ${nfe.number} lida com sucesso! ${nfe.items.length} itens identificados.`, 'XML Válido');
    setStep(2);
  };

  // Upload via input file
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xml')) {
      toast.error('Selecione um arquivo com formato .xml da NF-e.', 'Formato Inválido');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleProcessXmlString(content, file.name);
    };
    reader.onerror = () => {
      toast.error('Erro ao ler o arquivo selecionado.', 'Erro de Leitura');
    };
    reader.readAsText(file);
  };

  // Carregar XML de demonstração oficial (com itens heterogêneos)
  const handleLoadSampleXml = () => {
    const sample = NfeXmlService.generateSampleNfeXml();
    handleProcessXmlString(sample, 'NFe_Exemplo_Heterogeneo_SEFAZ.xml');
  };

  // Cadastrar fornecedor automaticamente a partir do XML
  const handleAutoCreateSupplier = () => {
    if (!parsedData) return;
    setIsCreatingSupplier(true);

    try {
      const newSupplier: Supplier = {
        id: 'SUP-' + Date.now(),
        code: 'FORN-' + String(dbState.suppliers.length + 1).padStart(4, '0'),
        name: parsedData.supplierName,
        tradeName: parsedData.supplierTradeName || parsedData.supplierName,
        type: parsedData.supplierCpfCnpj.length > 14 ? 'PJ' : 'PF',
        cpfCnpj: parsedData.supplierCpfCnpj,
        phone: parsedData.supplierPhone || '(75) 3600-0000',
        contactName: 'Contato Comercial',
        zipCode: parsedData.supplierAddress?.zipCode || '',
        street: parsedData.supplierAddress?.street || '',
        number: parsedData.supplierAddress?.number || '',
        complement: parsedData.supplierAddress?.complement || '',
        neighborhood: parsedData.supplierAddress?.neighborhood || '',
        city: parsedData.supplierAddress?.city || 'Feira de Santana',
        state: parsedData.supplierAddress?.state || 'BA',
        paymentTerms: `${parsedData.installments.length}x (${parsedData.installments.map((i) => i.dueDate).join(', ')})`,
        status: 'ativo',
        notes: `Cadastrado automaticamente via importação do XML NF-e nº ${parsedData.number}`,
      };

      Database.getState().suppliers.push(newSupplier);
      Database.persist();
      setMatchedSupplier(newSupplier);
      toast.success(`Fornecedor "${newSupplier.name}" cadastrado com sucesso!`, 'Fornecedor Cadastrado');
    } catch (err: any) {
      toast.error('Erro ao cadastrar fornecedor: ' + err.message, 'Erro');
    } finally {
      setIsCreatingSupplier(false);
    }
  };

  // Aplicar classificação em lote
  const handleApplyBatchClassification = () => {
    let targetAccount: ChartOfAccount | undefined;

    if (batchLaunchCode.trim()) {
      const cleanLaunch = batchLaunchCode.trim().padStart(3, '0');
      targetAccount = analyticalAccounts.find((a) => a.launchCode === cleanLaunch);
    } else if (batchAccountId) {
      targetAccount = analyticalAccounts.find((a) => a.id === batchAccountId);
    }

    if (!targetAccount) {
      toast.warning('Informe um código de 3 dígitos válido ou selecione uma conta do Plano de Contas.', 'Classificação Não Localizada');
      return;
    }

    if (selectedItemIndices.length === 0) {
      toast.warning('Selecione pelo menos um item para aplicar a classificação em lote.', 'Nenhum Item Selecionado');
      return;
    }

    const updated = itemsClassification.map((item, idx) => {
      if (selectedItemIndices.includes(idx)) {
        return {
          ...item,
          chartAccountId: targetAccount!.id,
          launchCode: targetAccount!.launchCode || '',
          chartAccountName: targetAccount!.name,
          chartAccountCode: targetAccount!.hierarchicalCode,
        };
      }
      return item;
    });

    setItemsClassification(updated);
    toast.success(
      `Classificação [${targetAccount.launchCode} - ${targetAccount.name}] aplicada a ${selectedItemIndices.length} item(ns)!`,
      'Classificação em Lote Aplicada'
    );
    setBatchLaunchCode('');
    setBatchAccountId('');
  };

  // Alterar classificação individual de um item
  const handleItemAccountChange = (idx: number, accountIdOrLaunch: string) => {
    const clean = accountIdOrLaunch.trim();
    const targetAccount = analyticalAccounts.find(
      (a) => a.id === clean || a.launchCode === clean.padStart(3, '0')
    );

    const updated = [...itemsClassification];
    if (targetAccount) {
      updated[idx] = {
        ...updated[idx],
        chartAccountId: targetAccount.id,
        launchCode: targetAccount.launchCode || '',
        chartAccountName: targetAccount.name,
        chartAccountCode: targetAccount.hierarchicalCode,
      };
    } else {
      updated[idx] = {
        ...updated[idx],
        chartAccountId: '',
        launchCode: '',
        chartAccountName: '',
        chartAccountCode: '',
      };
    }
    setItemsClassification(updated);
  };

  // Alteração de produto mapeado com sincronização automática intra-XML
  const handleProductMappingChange = (idx: number, newProdId: string) => {
    const currentItem = itemsMapping[idx];
    const targetProd = dbState.products.find((p) => p.id === newProdId);
    const updated = [...itemsMapping];

    updated[idx] = {
      ...updated[idx],
      selectedProductId: newProdId,
      selectedLocationId: targetProd?.defaultLocationId || updated[idx].selectedLocationId,
      createAsNew: !newProdId,
      autoMatched: false,
      matchReason: newProdId ? 'Vinculado Manualmente pelo Usuário' : undefined,
    };

    // Sincronizar automaticamente outras linhas da mesma nota que tenham o mesmo código do fornecedor ou mesma descrição
    const currCode = currentItem.xmlProduct.code.trim().toLowerCase();
    const currDesc = normalizeProdStr(currentItem.xmlProduct.description);

    updated.forEach((other, otherIdx) => {
      if (otherIdx !== idx) {
        const matchCode = currCode && other.xmlProduct.code.trim().toLowerCase() === currCode;
        const matchDesc = currDesc && normalizeProdStr(other.xmlProduct.description) === currDesc;
        if (matchCode || matchDesc) {
          updated[otherIdx] = {
            ...updated[otherIdx],
            selectedProductId: newProdId,
            selectedLocationId: targetProd?.defaultLocationId || updated[otherIdx].selectedLocationId,
            createAsNew: !newProdId,
            autoMatched: false,
            matchReason: newProdId ? 'Sincronizado com item correlato da nota' : undefined,
          };
        }
      }
    });

    setItemsMapping(updated);
  };

  // CONFIRMAÇÃO FINAL: Executar importação completa integrada com proteção estrita contra duplicidades
  const handleConfirmFinalImport = async () => {
    if (!parsedData) return;
    if (isImportingRef.current) return;

    // 1. Bloqueio estrito de reimportação duplicada pela chave de acesso SEFAZ
    const existing = Database.findNfeByAccessKey(parsedData.accessKey);
    if (existing) {
      toast.error(
        `A NF-e nº ${parsedData.number} (Chave: ${parsedData.accessKey.substring(0, 18)}...) já foi importada anteriormente para a empresa "${existing.companyName}" em ${new Date(existing.importDate).toLocaleDateString('pt-BR')}. Reimportação bloqueada para evitar duplicidade de itens, saldos e títulos.`,
        'NF-e Já Importada'
      );
      return;
    }

    try {
      isImportingRef.current = true;
      setIsImporting(true);

      const nowIso = new Date().toISOString();
      const state = Database.getState();

      // 1. Garantir fornecedor cadastrado
      let supplierId = matchedSupplier?.id;
      if (!supplierId) {
        const cleanCnpj = parsedData.supplierCpfCnpj.replace(/\D/g, '');
        const autoSupp: Supplier = {
          id: 'SUP-' + Date.now(),
          code: 'FORN-' + String(state.suppliers.length + 1).padStart(4, '0'),
          name: parsedData.supplierName,
          tradeName: parsedData.supplierTradeName || parsedData.supplierName,
          type: cleanCnpj.length > 11 ? 'PJ' : 'PF',
          cpfCnpj: parsedData.supplierCpfCnpj,
          phone: parsedData.supplierPhone || '(75) 3600-0000',
          contactName: 'Contato Fiscal',
          zipCode: parsedData.supplierAddress?.zipCode || '',
          street: parsedData.supplierAddress?.street || '',
          number: parsedData.supplierAddress?.number || '',
          complement: parsedData.supplierAddress?.complement || '',
          neighborhood: parsedData.supplierAddress?.neighborhood || '',
          city: parsedData.supplierAddress?.city || 'Feira de Santana',
          state: parsedData.supplierAddress?.state || 'BA',
          paymentTerms: `${parsedData.installments.length}x`,
          status: 'ativo',
          notes: `Cadastrado na importação do XML NF-e nº ${parsedData.number}`,
        };
        state.suppliers.push(autoSupp);
        supplierId = autoSupp.id;
      }

      // 2. Criar ou associar produtos do catálogo compartilhado com proteção contra duplicidades intra-lote
      let currentBalances = [...state.stockBalances];
      const movements: StockMovement[] = [];
      const purchaseOrderItems: PurchaseOrderItem[] = [];
      const itemClassificationsList: NfeItemClassification[] = [];
      const batchResolvedProducts = new Map<string, Product>();

      for (let i = 0; i < parsedData.items.length; i++) {
        const xmlItem = parsedData.items[i];
        const mapInfo = itemsMapping[i];
        const classInfo = itemsClassification[i];

        let targetProduct: Product | undefined;

        // A. Se usuário selecionou ou foi mapeado a um ID existente
        if (mapInfo.selectedProductId) {
          targetProduct =
            state.products.find((p) => p.id === mapInfo.selectedProductId) ||
            batchResolvedProducts.get(mapInfo.selectedProductId);
        }

        // B. Se não selecionou explicitamente um ID, verificar se um item anterior deste mesmo XML já criou ou resolveu este produto
        const normDesc = normalizeProdStr(xmlItem.description);
        const codeKey = xmlItem.code ? xmlItem.code.trim().toLowerCase() : '';
        const eanKey = xmlItem.barcode ? xmlItem.barcode.trim() : '';

        if (!targetProduct) {
          if (codeKey && batchResolvedProducts.has('code:' + codeKey)) {
            targetProduct = batchResolvedProducts.get('code:' + codeKey);
          } else if (eanKey && batchResolvedProducts.has('ean:' + eanKey)) {
            targetProduct = batchResolvedProducts.get('ean:' + eanKey);
          } else if (normDesc && batchResolvedProducts.has('desc:' + normDesc)) {
            targetProduct = batchResolvedProducts.get('desc:' + normDesc);
          }
        }

        // C. Se ainda não encontrado, busca profunda no catálogo do ERP antes de criar novo produto
        if (!targetProduct) {
          const deepMatch = findMatchingProduct(xmlItem, state.products, parsedData.supplierCpfCnpj);
          if (deepMatch.product) {
            targetProduct = deepMatch.product;
          }
        }

        // D. Somente se REALMENTE NÃO EXISTIR no catálogo do ERP e não foi criado neste lote:
        if (!targetProduct) {
          // Gerar código único garantindo que não colida com nenhum produto existente no catálogo
          let candidateCode = xmlItem.code ? xmlItem.code.trim() : '';
          const codeExists = candidateCode && state.products.some((p) => p.code.toLowerCase().trim() === candidateCode.toLowerCase());
          if (!candidateCode || codeExists) {
            let seq = state.products.length + 1;
            candidateCode = 'PROD-' + String(seq).padStart(4, '0');
            while (state.products.some((p) => p.code.toLowerCase().trim() === candidateCode.toLowerCase())) {
              seq++;
              candidateCode = 'PROD-' + String(seq).padStart(4, '0');
            }
          }

          const isRawMaterial = classInfo.launchCode === '202' || classInfo.launchCode === '203';
          const isPackaging = classInfo.launchCode === '204';

          const newProduct: Product = {
            id: 'PROD-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substring(2, 6),
            code: candidateCode,
            referenceCode: xmlItem.code ? xmlItem.code.trim() : '',
            description: xmlItem.description.trim(),
            unit: (xmlItem.unit as any) || 'UN',
            costPrice: xmlItem.unitPrice,
            salePrice: Number((xmlItem.unitPrice * 1.5).toFixed(2)),
            family: isRawMaterial ? 'Insumos' : isPackaging ? 'Embalagens' : 'Mercadorias',
            group: isRawMaterial ? 'Matéria-Prima' : isPackaging ? 'Embalagem' : 'Geral',
            barcode: xmlItem.barcode || (/^\d{8,14}$/.test(xmlItem.code.trim()) ? xmlItem.code.trim() : ''),
            minStock: 10,
            productType: isRawMaterial ? 'componente' : 'revenda',
            hasComposition: false,
            defaultLocationId: mapInfo.selectedLocationId || targetCompanyLocations[0]?.id || 'loc-comercial',
            status: 'ativo',
            supplierId,
            notes: `NCM: ${xmlItem.ncm} • CFOP: ${xmlItem.cfop} • Importado via NF-e XML ${parsedData.number}`,
          };

          state.products.push(newProduct);
          targetProduct = newProduct;
        } else {
          // Atualizar preço de custo médio do produto existente e dados complementares sem duplicar produto
          targetProduct.costPrice = xmlItem.unitPrice;
          if (!targetProduct.referenceCode && xmlItem.code) {
            targetProduct.referenceCode = xmlItem.code.trim();
          }
          if (!targetProduct.supplierId && supplierId) {
            targetProduct.supplierId = supplierId;
          }
          if (!targetProduct.barcode && xmlItem.barcode) {
            targetProduct.barcode = xmlItem.barcode;
          }
        }

        // Registrar no lote para evitar que outro item do mesmo XML crie duplicado
        batchResolvedProducts.set(targetProduct.id, targetProduct);
        if (codeKey) batchResolvedProducts.set('code:' + codeKey, targetProduct);
        if (eanKey) batchResolvedProducts.set('ean:' + eanKey, targetProduct);
        if (normDesc) batchResolvedProducts.set('desc:' + normDesc, targetProduct);

        // Salvar memória de classificação de fornecedor/produto se solicitado
        if (rememberMapping) {
          Database.saveSupplierProductMapping({
            supplierCnpj: parsedData.supplierCpfCnpj,
            supplierProdCode: xmlItem.code,
            systemProductId: targetProduct.id,
            defaultChartAccountId: classInfo.chartAccountId || undefined,
            defaultLaunchCode: classInfo.launchCode || undefined,
            lastUsedAt: nowIso,
          });
        }

        // Destino do estoque na empresa selecionada
        const destLoc =
          targetCompanyLocations.find((l) => l.id === mapInfo.selectedLocationId) ||
          targetCompanyLocations[0] || { id: 'loc-comercial', name: 'Comercial' };

        // 3. Registrar entrada no estoque da empresa selecionada (Matriz ou Filial)
        const { updatedBalances, createdMovement } = StockEngine.applyMovement(currentBalances, {
          companyId: targetCompanyId,
          productId: targetProduct.id,
          productCode: targetProduct.code,
          productDescription: targetProduct.description,
          locationId: destLoc.id,
          locationName: destLoc.name,
          type: 'entrada_compra',
          quantity: xmlItem.quantity,
          unitCost: xmlItem.unitPrice,
          totalCost: xmlItem.totalPrice,
          originDocType: 'compra',
          originDocId: `NF-${parsedData.number}`,
          date: nowIso,
          userId: currentUser.id,
          userName: currentUser.name,
          notes: `Entrada física NF-e ${parsedData.number} (Chave: ${parsedData.accessKey.substring(0, 10)}...) p/ ${targetCompany.tradeName || targetCompany.name}`,
        });

        currentBalances = updatedBalances;
        movements.push(createdMovement);

        // Item para o pedido de compra concluído
        purchaseOrderItems.push({
          productId: targetProduct.id,
          productCode: targetProduct.code,
          description: targetProduct.description,
          buyUnit: xmlItem.unit as any,
          saleUnit: targetProduct.unit,
          packageFactor: 1,
          buyQuantity: xmlItem.quantity,
          unitCost: xmlItem.unitPrice,
          discount: xmlItem.discount,
          freightApportioned: xmlItem.freight,
          otherExpensesApportioned: xmlItem.otherExpenses,
          totalCost: xmlItem.totalPrice,
          receivedQuantity: xmlItem.quantity,
          pendingQuantity: 0,
          destinationLocationId: destLoc.id,
        });

        // Desdobramento contábil analítico por item
        const percentage = Number(((xmlItem.totalPrice / parsedData.invoiceTotal) * 100).toFixed(2));
        itemClassificationsList.push({
          productId: targetProduct.id,
          productCode: targetProduct.code,
          description: xmlItem.description,
          amount: xmlItem.totalPrice,
          quantity: xmlItem.quantity,
          unit: xmlItem.unit,
          chartAccountId: classInfo.chartAccountId || undefined,
          chartAccountCode: classInfo.chartAccountCode || undefined,
          launchCode: classInfo.launchCode || undefined,
          chartAccountName: classInfo.chartAccountName || undefined,
          percentage,
        });
      }

      state.stockBalances = currentBalances;
      state.stockMovements = [...movements, ...state.stockMovements];

      // 4. Criar registro de Pedido de Compra Oficial (concluído)
      const pcNumber = `NF-${parsedData.number}`;
      const poDeterministicId = 'PC-NFE-' + (parsedData.accessKey ? parsedData.accessKey.substring(25, 34) : String(Date.now()));
      let newPurchaseOrder = state.purchaseOrders.find((p) => p.id === poDeterministicId || p.number === pcNumber);
      if (!newPurchaseOrder) {
        newPurchaseOrder = {
          id: poDeterministicId,
          number: pcNumber,
          companyId: targetCompanyId,
          supplierId,
          supplierName: parsedData.supplierName,
          orderDate: parsedData.issueDate,
          expectedDeliveryDate: parsedData.issueDate,
          paymentTerms: `${parsedData.installments.length}x (${parsedData.installments.map((i) => i.dueDate).join(', ')})`,
          installmentsCount: parsedData.installments.length,
          status: 'concluido',
          items: purchaseOrderItems,
          subtotal: parsedData.productsTotal,
          discountTotal: parsedData.discountTotal,
          freightTotal: parsedData.freightTotal,
          otherExpensesTotal: parsedData.otherExpensesTotal,
          total: parsedData.invoiceTotal,
          notes: `Importado de NF-e XML (Chave: ${parsedData.accessKey}) para a empresa ${targetCompany.tradeName || targetCompany.name}`,
          userId: currentUser.id,
          userName: currentUser.name,
          createdAt: nowIso,
        };
        state.purchaseOrders.unshift(newPurchaseOrder);
      }

      // 5. Gerar Títulos no Contas a Pagar (com vínculo das parcelas e rateio contábil exato)
      const payablesList: AccountPayable[] = [];
      const isSingleClass = classificationSummary.isSingleClassification;
      const primaryGroup = classificationSummary.groups[0];

      parsedData.installments.forEach((inst, idx) => {
        const isClassified = classificationSummary.isFullyClassified;
        const payableId = 'PAG-NFE-' + (parsedData.accessKey ? parsedData.accessKey.substring(25, 34) : String(Date.now())) + '-' + (idx + 1);

        // Se já existir título com este ID, ignora para prevenir duplicidade financeira
        if (state.accountsPayable.some((p) => p.id === payableId)) {
          return;
        }

        // Se houver múltiplas contas, descreve no título o rateio para fácil leitura
        let displayDescription = `NF-e ${parsedData.number} Parcela ${inst.installmentNumber}/${parsedData.installments.length} - ${parsedData.supplierName}`;
        if (!isSingleClass && classificationSummary.groups.length > 1) {
          const breakdownStr = classificationSummary.groups
            .map((g) => `${g.launchCode}: ${formatCurrency(g.amount)}`)
            .join(' | ');
          displayDescription += ` [Múltiplas: ${breakdownStr}]`;
        }

        const payable: AccountPayable = {
          id: payableId,
          companyId: targetCompanyId,
          purchaseOrderId: newPurchaseOrder.id,
          purchaseOrderNumber: pcNumber,
          supplierId,
          supplierName: parsedData.supplierName,
          description: displayDescription,
          category: 'fornecedores',
          docNumber: `NF-${parsedData.number}/${inst.installmentNumber}`,
          installmentNumber: inst.installmentNumber,
          totalInstallments: parsedData.installments.length,
          issueDate: parsedData.issueDate,
          dueDate: inst.dueDate,
          originalValue: inst.value,
          discount: 0,
          addition: 0,
          paidValue: 0,
          balance: inst.value,
          status: 'aberto',
          payments: [],
          notes: `Importado de NF-e XML. Chave: ${parsedData.accessKey}`,
          // Classificação contábil
          chartAccountId: isSingleClass ? primaryGroup?.chartAccountId : undefined,
          chartAccountCode: isSingleClass ? primaryGroup?.chartAccountCode : undefined,
          launchCode: isSingleClass ? primaryGroup?.launchCode : undefined,
          chartAccountName: isSingleClass
            ? primaryGroup?.chartAccountName
            : `Múltiplas Contas (${classificationSummary.groups.length} contas)`,
          classificationStatus: isClassified ? 'classificado' : 'pendente',
          classifiedAt: isClassified ? nowIso : undefined,
          classifiedBy: isClassified ? currentUser.name : undefined,
          // Rastreabilidade SEFAZ & Rateio dos Itens
          nfeAccessKey: parsedData.accessKey,
          nfeNumber: parsedData.number,
          itemClassifications: itemClassificationsList,
        };

        payablesList.push(payable);
        state.accountsPayable.unshift(payable);
      });

      // 6. Gravar Histórico de Importação de NF-e (Prevenção de duplicidade e auditoria)
      const summaryAccountsText = classificationSummary.groups
        .map((g) => `[${g.launchCode}] ${g.chartAccountName} (${formatCurrency(g.amount)})`)
        .join('; ');

      Database.addNfeImportRecord({
        id: 'IMP-' + Date.now(),
        accessKey: parsedData.accessKey,
        nfeNumber: parsedData.number,
        series: parsedData.series,
        companyId: targetCompanyId,
        companyName: targetCompany.tradeName || targetCompany.name,
        supplierId,
        supplierName: parsedData.supplierName,
        supplierCnpj: parsedData.supplierCpfCnpj,
        issueDate: parsedData.issueDate,
        importDate: nowIso,
        totalValue: parsedData.invoiceTotal,
        itemsCount: parsedData.items.length,
        userId: currentUser.id,
        userName: currentUser.name,
        purchaseOrderId: newPurchaseOrder.id,
        payablesCount: payablesList.length,
        classificationsSummary: summaryAccountsText || 'Pendente de classificação',
      });

      // Persistir no LocalStorage e sincronizar com Firebase Firestore
      Database.persist();
      Database.addAuditLog(
        'IMPORTACAO_NFE_XML',
        'COMPRAS',
        parsedData.accessKey,
        `NF-e nº ${parsedData.number} (Total: ${formatCurrency(parsedData.invoiceTotal)}) importada com sucesso para "${targetCompany.tradeName || targetCompany.name}". ${parsedData.items.length} itens alimentados no estoque e ${payablesList.length} títulos gerados no Contas a Pagar.`
      );

      try {
        await FirebaseSyncService.syncToFirebase(Database.getState());
      } catch (e) {
        console.warn('Sincronização em segundo plano agendada:', e);
      }

      toast.success(
        `NF-e nº ${parsedData.number} importada com sucesso! O estoque de ${parsedData.items.length} produtos foi alimentado e ${payablesList.length} parcela(s) foram lançadas no Contas a Pagar sem duplicidades.`,
        'Importação Concluída com Sucesso'
      );

      if (onSuccess) onSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Erro na importação da NF-e:', err);
      toast.error('Erro ao concluir importação: ' + err.message, 'Falha de Processamento');
    } finally {
      isImportingRef.current = false;
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl p-5 md:p-6 space-y-4 max-h-[92vh] overflow-y-auto flex flex-col">
        {/* Topo do Modal */}
        <div className="flex justify-between items-start pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200">
                <FileCode size={20} />
              </span>
              <div>
                <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                  <span>Importação de NF-e (XML) – Gestão Fácil ERP</span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full uppercase">
                    SEFAZ Layout 4.00
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Estoque individualizado por empresa, classificação no Plano de Contas e geração automática no Contas a Pagar.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Fechar"
            title="Fechar e voltar para a tela inicial"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stepper Visual de 4 Etapas */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div
            className={`p-2.5 rounded-xl border text-center transition-all ${
              step === 1
                ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold shadow-xs'
                : step > 1
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            <span className="text-[10px] block opacity-70">Passo 1</span>
            <span className="truncate block">Arquivo XML</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border text-center transition-all ${
              step === 2
                ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold shadow-xs'
                : step > 2
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            <span className="text-[10px] block opacity-70">Passo 2</span>
            <span className="truncate block">Empresa & Produtos</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border text-center transition-all ${
              step === 3
                ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold shadow-xs'
                : step > 3
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            <span className="text-[10px] block opacity-70">Passo 3</span>
            <span className="truncate block">Plano de Contas</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border text-center transition-all ${
              step === 4
                ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold shadow-xs'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            <span className="text-[10px] block opacity-70">Passo 4</span>
            <span className="truncate block">Contas a Pagar</span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PASSO 1: UPLOAD DO XML & VALIDAÇÃO */}
        {/* ========================================================================= */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 rounded-2xl p-6 text-center transition-colors">
              <Upload className="mx-auto text-indigo-600 mb-2" size={32} />
              <h4 className="font-bold text-sm text-slate-800">
                Selecione ou Arraste o arquivo XML da NF-e
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                Suporta notas fiscais eletrônicas de compra padrão SEFAZ Layout 4.00 com cálculo de impostos, produtos e duplicatas.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2">
                  <Upload size={14} />
                  <span>Selecionar Arquivo .XML</span>
                  <input
                    type="file"
                    accept=".xml,text/xml"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleLoadSampleXml}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Carrega um XML de exemplo com itens de MP química, embalagem e revenda"
                >
                  <Sparkles size={14} className="text-amber-500" />
                  <span>Carregar XML Exemplo (MP, Embalagem e Revenda)</span>
                </button>
              </div>
            </div>

            {/* Dica Gerencial */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
              <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong>Como funciona o processo de importação:</strong>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  1. O sistema lê os dados do emitente e dos itens da nota sem necessidade de digitação manual.<br />
                  2. Você escolhe se os itens entrarão no estoque da <strong>Matriz</strong> ou de uma <strong>Filial</strong>.<br />
                  3. Classifica cada produto individualmente ou em lote com o código de 3 dígitos do <strong>Plano de Contas</strong>.<br />
                  4. Os títulos no <strong>Contas a Pagar</strong> são gerados com o valor total exato e o rateio detalhado, alimentando a DRE Gerencial na competência correta.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASSO 2: EMPRESA, FORNECEDOR & MAPEAMENTO DE ESTOQUE */}
        {/* ========================================================================= */}
        {step === 2 && parsedData && (
          <div className="space-y-4 py-1">
            {/* Aviso de Duplicidade se detectado */}
            {duplicateWarning && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <span>{duplicateWarning}</span>
              </div>
            )}

            {/* Resumo da Nota & Seleção Obrigatória da Empresa */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* Card da NF-e */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-700">Dados da NF-e Importada</span>
                  <span className="font-mono text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-700 font-bold">
                    NF nº {parsedData.number} (Série {parsedData.series})
                  </span>
                </div>
                <div className="text-slate-600">
                  <strong>Emissão:</strong> {new Date(parsedData.issueDate).toLocaleDateString('pt-BR')} • <strong>Total:</strong> <span className="font-bold text-slate-900">{formatCurrency(parsedData.invoiceTotal)}</span>
                </div>
                <div className="text-slate-500 truncate" title={parsedData.accessKey}>
                  <strong>Chave SEFAZ:</strong> <span className="font-mono text-[11px]">{parsedData.accessKey}</span>
                </div>
              </div>

              {/* Seleção da Empresa de Destino do Estoque */}
              <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1.5">
                <label className="block font-bold text-indigo-900 text-xs flex items-center gap-1.5">
                  <Building2 size={15} className="text-indigo-600" />
                  <span>Empresa Responsável / Destino do Estoque *</span>
                </label>
                <select
                  value={targetCompanyId}
                  onChange={(e) => {
                    const newCompId = e.target.value;
                    setTargetCompanyId(newCompId);
                    const compLocs = dbState.stockLocations.filter(
                      (l) => l.companyId === newCompId && l.status === 'ativo'
                    );
                    const defaultLoc = compLocs[0]?.id || 'loc-comercial';
                    setItemsMapping(
                      itemsMapping.map((m) => ({
                        ...m,
                        selectedLocationId: defaultLoc,
                      }))
                    );
                  }}
                  className="w-full bg-white border border-indigo-300 rounded-lg p-2 font-bold text-slate-800 text-xs shadow-xs focus:ring-2 focus:ring-indigo-500"
                >
                  {dbState.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.tradeName || c.name} ({c.type === 'matriz' ? 'Matriz' : 'Filial'}) • CNPJ: {c.cnpjCpf}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-indigo-700">
                  Os produtos darão entrada exclusivamente nos depósitos da empresa selecionada acima.
                </p>
              </div>
            </div>

            {/* Identificação e Auto-Cadastro do Fornecedor */}
            <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-slate-700 uppercase tracking-wider block text-[11px]">
                    Fornecedor Emitente (XML)
                  </span>
                  <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                    {parsedData.supplierName}
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    CNPJ: <span className="font-mono font-semibold">{parsedData.supplierCpfCnpj}</span> • IE: {parsedData.supplierIe || 'Isento'} • {parsedData.supplierAddress?.city}/{parsedData.supplierAddress?.state}
                  </div>
                </div>

                <div>
                  {matchedSupplier ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg font-bold text-xs">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <span>Fornecedor Vinculado no ERP</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAutoCreateSupplier}
                      disabled={isCreatingSupplier}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Cadastrar Fornecedor Automaticamente</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Tabela de Vínculo de Produtos com Estoque da Empresa */}
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <div className="bg-slate-50 p-2.5 border-b border-slate-200 font-bold text-slate-700 flex justify-between items-center">
                <span>Vínculo de Produtos & Depósito Destino ({itemsMapping.length} itens)</span>
                <span className="text-[11px] text-slate-500 font-normal">
                  Associe com produto existente ou cadastre diretamente
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="p-2.5">Item / Cód. XML</th>
                      <th className="p-2.5">Descrição na NF-e</th>
                      <th className="p-2.5 text-right">Qtd / Unit</th>
                      <th className="p-2.5">Produto no ERP</th>
                      <th className="p-2.5">Depósito Destino</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemsMapping.map((map, idx) => {
                      const matchedItem = dbState.products.find((p) => p.id === map.selectedProductId);

                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono text-slate-600 font-semibold align-top">
                            <div>#{map.itemNumber} • {map.xmlProduct.code}</div>
                            {map.xmlProduct.barcode && (
                              <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                                <Barcode size={11} className="text-slate-400" />
                                <span>EAN: {map.xmlProduct.barcode}</span>
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 font-medium text-slate-800 max-w-xs align-top">
                            <div className="truncate font-semibold" title={map.xmlProduct.description}>
                              {map.xmlProduct.description}
                            </div>
                            {map.matchReason && (
                              <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-semibold border border-emerald-200 w-fit">
                                <Check size={11} />
                                <span>{map.matchReason}</span>
                              </div>
                            )}
                            {map.createAsNew && !map.selectedProductId && (
                              <div className="mt-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-semibold border border-amber-200 w-fit">
                                + Novo cadastro no catálogo
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-700 align-top">
                            {formatQuantity(map.xmlProduct.quantity)} {map.xmlProduct.unit}
                          </td>
                          <td className="p-2.5 align-top">
                            <select
                              value={map.selectedProductId}
                              onChange={(e) => handleProductMappingChange(idx, e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded p-1 text-xs font-semibold text-slate-800"
                            >
                              <option value="">+ Criar como novo produto no catálogo</option>
                              {dbState.products
                                .filter((p) => p.status === 'ativo')
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.code}{p.referenceCode ? ` (Ref: ${p.referenceCode})` : ''} - {p.description} ({p.unit})
                                  </option>
                                ))}
                            </select>
                            {matchedItem && (
                              <div className="text-[10px] text-indigo-700 font-semibold mt-1">
                                Código ERP: <span className="font-mono">{matchedItem.code}</span>
                                {matchedItem.referenceCode ? ` • Ref. NF-e: ${matchedItem.referenceCode}` : ''}
                                {` • Custo atual: ${formatCurrency(matchedItem.costPrice)}`}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 align-top">
                            <select
                              value={map.selectedLocationId}
                              onChange={(e) => {
                                const updated = [...itemsMapping];
                                updated[idx].selectedLocationId = e.target.value;
                                setItemsMapping(updated);
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded p-1 text-xs font-semibold text-indigo-700"
                            >
                              {targetCompanyLocations.map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                  {loc.name} ({loc.code})
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASSO 3: CLASSIFICAÇÃO DA NOTA FISCAL – PLANO DE CONTAS */}
        {/* ========================================================================= */}
        {step === 3 && parsedData && (
          <div className="space-y-3.5 py-1">
            {/* Banner de instrução e aplicação em lote */}
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-xs text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={15} className="text-blue-600" />
                    <span>Classificação da Nota Fiscal – Plano de Contas</span>
                  </h4>
                  <p className="text-[11px] text-blue-700">
                    Classifique cada item ou aplique em lote usando o <strong>Código de Lançamento de 3 dígitos</strong> (ex: 201 Revenda, 202 Matéria-prima, 204 Embalagens, 210 Máquinas).
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-semibold text-blue-900 flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMapping}
                      onChange={(e) => setRememberMapping(e.target.checked)}
                      className="w-3.5 h-3.5 text-blue-600 rounded"
                    />
                    <span>Memorizar para próximas compras</span>
                  </label>
                </div>
              </div>

              {/* Barra de Ação em Lote */}
              <div className="bg-white p-2.5 rounded-lg border border-blue-200 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-700 shrink-0">Classificar em Lote:</span>
                <div className="w-24">
                  <input
                    type="text"
                    maxLength={3}
                    placeholder="Ex: 202"
                    value={batchLaunchCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setBatchLaunchCode(val);
                      if (val.length === 3) {
                        const acc = analyticalAccounts.find((a) => a.launchCode === val);
                        if (acc) setBatchAccountId(acc.id);
                      }
                    }}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded font-mono font-bold text-center text-blue-700"
                    title="Digite o código de 3 dígitos"
                  />
                </div>

                <div className="flex-1 min-w-[200px]">
                  <select
                    value={batchAccountId}
                    onChange={(e) => {
                      setBatchAccountId(e.target.value);
                      const acc = analyticalAccounts.find((a) => a.id === e.target.value);
                      if (acc?.launchCode) setBatchLaunchCode(acc.launchCode);
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-xs font-semibold text-slate-800"
                  >
                    <option value="">Selecione ou busque a conta do Plano...</option>
                    {purchaseRecommendedAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        [{acc.launchCode}] {acc.hierarchicalCode} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleApplyBatchClassification}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-md shadow-xs transition-colors cursor-pointer"
                >
                  Aplicar aos Selecionados ({selectedItemIndices.length})
                </button>
              </div>
            </div>

            {/* Tabela de Classificação Individual por Item */}
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <div className="bg-slate-50 p-2 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={
                      selectedItemIndices.length === itemsClassification.length &&
                      itemsClassification.length > 0
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItemIndices(itemsClassification.map((_, i) => i));
                      } else {
                        setSelectedItemIndices([]);
                      }
                    }}
                    className="w-3.5 h-3.5 text-blue-600 rounded ml-1"
                  />
                  <span className="font-bold text-slate-700 text-[11px] uppercase">
                    Itens da NF-e & Classificação Contábil
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  {selectedItemIndices.length} de {itemsClassification.length} itens marcados
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="p-2 w-8 text-center">Sel.</th>
                      <th className="p-2">Item / Descrição</th>
                      <th className="p-2 text-right">Valor Item</th>
                      <th className="p-2">Cód. 3 Dígitos</th>
                      <th className="p-2">Conta do Plano de Contas</th>
                      <th className="p-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemsClassification.map((item, idx) => {
                      const isSelected = selectedItemIndices.includes(idx);
                      const isClassified = Boolean(item.chartAccountId && item.launchCode);

                      return (
                        <tr key={idx} className={isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50'}>
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedItemIndices([...selectedItemIndices, idx]);
                                } else {
                                  setSelectedItemIndices(selectedItemIndices.filter((i) => i !== idx));
                                }
                              }}
                              className="w-3.5 h-3.5 text-blue-600 rounded"
                            />
                          </td>
                          <td className="p-2 font-medium text-slate-800 max-w-xs truncate" title={item.description}>
                            <span className="font-mono text-slate-500 font-bold mr-1">#{item.itemNumber}</span>
                            {item.description}
                          </td>
                          <td className="p-2 text-right font-bold text-slate-900">
                            {formatCurrency(item.totalPrice)}
                          </td>
                          <td className="p-2 w-28">
                            <input
                              type="text"
                              maxLength={3}
                              placeholder="3 díg."
                              value={item.launchCode}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                handleItemAccountChange(idx, val);
                              }}
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono font-bold text-center text-blue-700 text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={item.chartAccountId}
                              onChange={(e) => handleItemAccountChange(idx, e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded p-1 text-xs font-semibold text-slate-800"
                            >
                              <option value="">Selecione a conta analítica...</option>
                              {purchaseRecommendedAccounts.map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  [{acc.launchCode}] {acc.hierarchicalCode} - {acc.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 text-center">
                            {isClassified ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                <Check size={11} />
                                <span>OK</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                <AlertTriangle size={10} />
                                <span>Pendente</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Painel de Resumo do Rateio Contábil da NF-e */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between items-center font-bold text-slate-700">
                <span>Resumo da Classificação da Nota Fiscal</span>
                <span className="text-slate-900 font-extrabold">{formatCurrency(classificationSummary.totalAmount)}</span>
              </div>

              {classificationSummary.groups.length === 0 ? (
                <div className="text-amber-700 text-[11px] italic">
                  Nenhum item classificado ainda. Informe os códigos de 3 dígitos acima.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                  {classificationSummary.groups.map((grp) => {
                    const pct = ((grp.amount / classificationSummary.totalAmount) * 100).toFixed(1);
                    return (
                      <div key={grp.chartAccountId} className="p-2 bg-white rounded-lg border border-slate-200 shadow-2xs">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1 rounded">
                            Cód {grp.launchCode}
                          </span>
                          <span className="font-bold text-slate-800">{formatCurrency(grp.amount)} ({pct}%)</span>
                        </div>
                        <div className="text-[10px] text-slate-600 truncate mt-0.5" title={grp.chartAccountName}>
                          {grp.chartAccountName}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {classificationSummary.pendingCount > 0 && (
                <div className="text-[11px] text-amber-800 font-semibold pt-1">
                  * Existem {classificationSummary.pendingCount} item(ns) pendente(s) de classificação. Se prosseguir sem classificar, o título no Contas a Pagar será bloqueado para baixa até a definição da conta.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASSO 4: CONTAS A PAGAR & CONFIRMAÇÃO FINAL */}
        {/* ========================================================================= */}
        {step === 4 && parsedData && (
          <div className="space-y-4 py-1 text-xs">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <h4 className="font-bold text-emerald-950 text-sm flex items-center gap-1.5">
                <ShieldCheck size={18} className="text-emerald-700" />
                <span>Revisão e Geração do Contas a Pagar</span>
              </h4>
              <p className="text-emerald-800 text-xs">
                A obrigação financeira será gerada com os vencimentos e parcelas extraídos do XML. O valor total corresponde exatamente ao valor devido ao fornecedor, sem duplicações, contendo o rateio analítico anexado.
              </p>
            </div>

            {/* Resumo da Operação */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] font-bold text-slate-500 uppercase block">Empresa Compradora</span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">{targetCompany.tradeName || targetCompany.name}</span>
                <span className="text-[11px] text-slate-500">{targetCompany.type === 'matriz' ? 'Empresa Matriz' : 'Empresa Filial'}</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] font-bold text-slate-500 uppercase block">Fornecedor</span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">{parsedData.supplierName}</span>
                <span className="text-[11px] font-mono text-slate-500">CNPJ: {parsedData.supplierCpfCnpj}</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] font-bold text-slate-500 uppercase block">Total da Nota Fiscal</span>
                <span className="text-base font-extrabold text-emerald-700 block mt-0.5">{formatCurrency(parsedData.invoiceTotal)}</span>
                <span className="text-[11px] text-slate-500">{parsedData.items.length} itens ({parsedData.installments.length} parcelas)</span>
              </div>
            </div>

            {/* Grade de Parcelas / Duplicatas Extraídas do XML */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 p-2.5 border-b border-slate-200 font-bold text-slate-700 flex justify-between items-center">
                <span>Duplicatas / Parcelas a Serem Lançadas no Contas a Pagar</span>
                <span className="text-xs font-mono font-bold text-slate-800">
                  Total: {formatCurrency(parsedData.installments.reduce((s, i) => s + i.value, 0))}
                </span>
              </div>

              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Parcela</th>
                    <th className="p-2.5">Documento</th>
                    <th className="p-2.5">Vencimento</th>
                    <th className="p-2.5 text-right">Valor da Parcela</th>
                    <th className="p-2.5">Classificação Vinculada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedData.installments.map((inst, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-700">
                        {inst.installmentNumber}ª Parcela ({inst.installmentNumber}/{parsedData.installments.length})
                      </td>
                      <td className="p-2.5 font-mono text-slate-600">NF-{parsedData.number}/{inst.number}</td>
                      <td className="p-2.5 font-semibold text-slate-900">
                        {new Date(inst.dueDate).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="p-2.5 text-right font-extrabold text-emerald-700">
                        {formatCurrency(inst.value)}
                      </td>
                      <td className="p-2.5">
                        {classificationSummary.isSingleClassification ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            Cód {classificationSummary.groups[0]?.launchCode} - {classificationSummary.groups[0]?.chartAccountName}
                          </span>
                        ) : classificationSummary.groups.length > 1 ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            Múltiplas Contas ({classificationSummary.groups.length} contas rateadas)
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Pendente de Classificação
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Aviso sobre DRE Gerencial */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1">
              <strong>Impacto Contábil na DRE Gerencial:</strong>
              <p>
                Os itens classificados no <strong>Grupo 9.1 (Matérias-Primas, Embalagens e Revenda)</strong> entram no ativo de estoque e <strong>não distorcem a DRE no momento da compra</strong>. O custo de mercadorias vendidas (CMV) e de produtos fabricados (CPV) será apropriado no confronto das vendas faturadas.
              </p>
            </div>
          </div>
        )}

        {/* Rodapé e Botões de Navegação */}
        <div className="flex justify-between items-center pt-3 border-t border-slate-100">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev - 1) as any)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Voltar</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Avançar para Classificação Contábil</span>
                <ArrowRight size={14} />
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Avançar para Contas a Pagar</span>
                <ArrowRight size={14} />
              </button>
            )}

            {step === 4 && (
              <button
                type="button"
                onClick={handleConfirmFinalImport}
                disabled={isImporting || Boolean(duplicateWarning)}
                className={`px-6 py-2.5 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer ${
                  isImporting || duplicateWarning
                    ? 'bg-slate-400 cursor-not-allowed opacity-75'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isImporting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Processando Importação e Alimentando Estoque...</span>
                  </>
                ) : duplicateWarning ? (
                  <>
                    <AlertTriangle size={16} />
                    <span>Importação Bloqueada (Chave Já Importada)</span>
                  </>
                ) : (
                  <>
                    <FileCheck2 size={16} />
                    <span>Confirmar Entrada no Estoque & Gerar Contas a Pagar</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
