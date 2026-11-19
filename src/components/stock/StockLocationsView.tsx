import React, { useState, useEffect, useMemo } from 'react';
import {
  Warehouse,
  ArrowLeftRight,
  ClipboardCheck,
  History,
  Plus,
  Search,
  Filter,
  AlertCircle,
  CheckCircle,
  FileSpreadsheet,
  Edit2,
  Trash2,
  Boxes,
  RotateCw,
  Building2,
  ArrowDownLeft,
  Package,
  Layers,
  Sparkles,
  Check,
  Copy,
  X,
  RotateCcw,
  Calendar
} from 'lucide-react';
import { Database } from '../../services/db';
import { FirebaseSyncService } from '../../services/firebaseSync';
import { StockLocation, Product, StockMovement, ProductStockBalance, Company, CompanyStockTransfer } from '../../types';
import { StockEngine } from '../../services/stockEngine';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { toast } from '../../services/toast';

export const StockLocationsView: React.FC<{
  initialSubTab?: 'locais' | 'transferencias' | 'inventario' | 'movimentacoes';
  initialOnlyCriticalStock?: boolean;
  initialCompanyFilter?: string;
  criticalTriggerKey?: number;
}> = ({
  initialSubTab = 'locais',
  initialOnlyCriticalStock = false,
  initialCompanyFilter,
  criticalTriggerKey = 0,
}) => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();
  const companies: Company[] = dbState.companies || [];

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  const [activeTab, setActiveTab] = useState<'locais' | 'transferencias' | 'inventario' | 'movimentacoes'>(initialSubTab);

  useEffect(() => {
    setActiveTab(initialSubTab);
  }, [initialSubTab]);

  // Filtro geral de visualização por empresa
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('todos');

  // Estados de Locais
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<StockLocation | null>(null);
  const [locCompanyId, setLocCompanyId] = useState<string>(currentCompany.id);
  const [locName, setLocName] = useState('');
  const [locCode, setLocCode] = useState('');
  const [locType, setLocType] = useState<StockLocation['type']>('outros');
  const [locDesc, setLocDesc] = useState('');

  // Estados de Transferência entre Locais / Empresas
  const [transferOriginCompanyId, setTransferOriginCompanyId] = useState<string>(currentCompany.id);
  const [transferDestCompanyId, setTransferDestCompanyId] = useState<string>(currentCompany.id);
  const [transferOriginLocId, setTransferOriginLocId] = useState('');
  const [transferDestLocId, setTransferDestLocId] = useState('');
  const [transferProductId, setTransferProductId] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferNotes, setTransferNotes] = useState('');

  // Estados de Inventário
  const [inventoryCompanyId, setInventoryCompanyId] = useState<string>(currentCompany.id);
  const [inventoryLocId, setInventoryLocId] = useState<string>(() => {
    const locs = Database.getState().stockLocations.filter((l) => l.companyId === Database.getCurrentCompany().id && l.status === 'ativo');
    return locs[0]?.id || 'loc-comercial';
  });
  const [inventoryCounts, setInventoryCounts] = useState<{ [productId: string]: string }>({});
  const [inventoryReasons, setInventoryReasons] = useState<{ [productId: string]: string }>({});
  const [inventorySearchTerm, setInventorySearchTerm] = useState<string>('');
  const [showInventoryConfirmModal, setShowInventoryConfirmModal] = useState<boolean>(false);
  const [isApplyingInventory, setIsApplyingInventory] = useState<boolean>(false);

  // Estados de Movimentações / Extrato de Estoque
  const [movCompanyFilter, setMovCompanyFilter] = useState<string>(initialCompanyFilter || 'todos');
  const [movFilterType, setMovFilterType] = useState('todos');
  const [movProductFilter, setMovProductFilter] = useState<string>('todos');
  const [movStartDate, setMovStartDate] = useState<string>('');
  const [movEndDate, setMovEndDate] = useState<string>('');
  const [movLimit, setMovLimit] = useState<'10' | '25' | '50' | 'todos'>('10');
  const [movSearchProd, setMovSearchProd] = useState('');
  const [movOnlyCritical, setMovOnlyCritical] = useState<boolean>(initialOnlyCriticalStock);

  useEffect(() => {
    setMovOnlyCritical(initialOnlyCriticalStock);
    if (initialCompanyFilter) {
      setMovCompanyFilter(initialCompanyFilter);
    } else if (criticalTriggerKey > 0) {
      setMovCompanyFilter('todos');
    }
  }, [initialOnlyCriticalStock, initialCompanyFilter, criticalTriggerKey]);

  // Estados do Modal de Alimentação Manual de Estoque (Entrada Avulsa)
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);
  const [manualCompanyId, setManualCompanyId] = useState<string>(currentCompany.id);
  const [manualLocationId, setManualLocationId] = useState<string>('');
  const [manualProductId, setManualProductId] = useState<string>('');
  const [manualType, setManualType] = useState<StockMovement['type']>('entrada_compra');
  const [manualQty, setManualQty] = useState<string>('1');
  const [manualUnitCost, setManualUnitCost] = useState<string>('0');
  const [manualNotes, setManualNotes] = useState<string>('');

  // Atualizar locais padrão da alimentação manual quando a empresa selecionada muda ou o modal é aberto
  useEffect(() => {
    if (!manualCompanyId) return;
    const locs = dbState.stockLocations.filter((l) => l.companyId === manualCompanyId && l.status === 'ativo');
    if (locs.length > 0) {
      if (!manualLocationId || !locs.some((l) => l.id === manualLocationId)) {
        setManualLocationId(locs[0].id);
      }
    } else if (isManualModalOpen) {
      const createdLoc = Database.ensureCompanyStockLocation(manualCompanyId);
      if (createdLoc) {
        setManualLocationId(createdLoc.id);
      }
    }
  }, [manualCompanyId, dbState.stockLocations, isManualModalOpen]);

  // Atualizar locais padrão do inventário quando a empresa selecionada muda
  useEffect(() => {
    const locs = dbState.stockLocations.filter((l) => l.companyId === inventoryCompanyId && l.status === 'ativo');
    if (locs.length > 0) {
      if (!inventoryLocId || !locs.some((l) => l.id === inventoryLocId)) {
        setInventoryLocId(locs[0].id);
      }
    } else {
      // Garante que toda empresa (Matriz ou Filial) tenha pelo menos um local de estoque comercial ativo
      const createdLoc = Database.ensureCompanyStockLocation(inventoryCompanyId);
      if (createdLoc) {
        setInventoryLocId(createdLoc.id);
      }
    }
  }, [inventoryCompanyId, dbState.stockLocations]);

  // Lista de locais filtrados por empresa
  const filteredLocations = dbState.stockLocations.filter((l) => {
    if (selectedCompanyFilter !== 'todos' && l.companyId !== selectedCompanyFilter) return false;
    return true;
  });

  // Locais para a empresa de origem na transferência
  const originLocations = dbState.stockLocations.filter(
    (l) => l.companyId === transferOriginCompanyId && l.status === 'ativo'
  );

  // Locais para a empresa de destino na transferência
  const destLocations = dbState.stockLocations.filter(
    (l) => l.companyId === transferDestCompanyId && l.status === 'ativo'
  );

  // Locais para a empresa selecionada no inventário
  const inventoryLocations = dbState.stockLocations.filter(
    (l) => l.companyId === inventoryCompanyId && l.status === 'ativo'
  );

  // Salvar Local de Estoque
  const handleSaveLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!locName.trim() || !locCode.trim()) {
      toast.warning('Preencha Código e Nome do Local.', 'Campos Obrigatórios');
      return;
    }

    const state = Database.getState();
    const targetComp = companies.find((c) => c.id === locCompanyId) || currentCompany;

    if (editingLocation) {
      state.stockLocations = state.stockLocations.map((l) =>
        l.id === editingLocation.id
          ? {
              ...l,
              companyId: locCompanyId,
              name: locName.trim(),
              code: locCode.trim().toUpperCase(),
              type: locType,
              description: locDesc.trim(),
            }
          : l
      );
      Database.addAuditLog('ATUALIZAR_LOCAL', 'ESTOQUE', editingLocation.id, `Local ${locName} da empresa ${targetComp.name} atualizado`);
      toast.success(`Local "${locName}" atualizado com sucesso!`, 'Local Atualizado');
    } else {
      const newLoc: StockLocation = {
        id: 'LOC-' + Date.now(),
        code: locCode.trim().toUpperCase(),
        name: locName.trim(),
        companyId: locCompanyId,
        description: locDesc.trim(),
        type: locType,
        status: 'ativo',
      };
      state.stockLocations.push(newLoc);
      Database.addAuditLog('CRIAR_LOCAL', 'ESTOQUE', newLoc.id, `Local ${newLoc.name} (${newLoc.code}) cadastrado para ${targetComp.name}`);
      toast.success(`Local "${newLoc.name}" cadastrado com sucesso para ${targetComp.name}!`, 'Local Cadastrado');
    }

    Database.persist();
    setIsLocationModalOpen(false);
    setEditingLocation(null);
  };

  const handleInactivateLocation = (loc: StockLocation) => {
    const hasMovements = dbState.stockMovements.some((m) => m.locationId === loc.id || m.toLocationId === loc.id);
    if (hasMovements) {
      const ok = window.confirm(
        `O local "${loc.name}" possui movimentações históricas e não pode ser deletado. Deseja inativá-lo?`
      );
      if (ok) {
        Database.getState().stockLocations = Database.getState().stockLocations.map((l) =>
          l.id === loc.id ? { ...l, status: 'inativo' as const } : l
        );
        Database.persist();
        toast.info('Local inativado.', 'Status do Local');
      }
      return;
    }

    if (window.confirm(`Excluir o local "${loc.name}"?`)) {
      Database.getState().stockLocations = Database.getState().stockLocations.filter((l) => l.id !== loc.id);
      Database.persist();
      toast.success('Local excluído com sucesso.', 'Local Removido');
    }
  };

  // Executar Transferência Entre Locais / Empresas
  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferOriginLocId || !transferDestLocId || !transferProductId || !transferQty) {
      toast.warning('Selecione Origem, Destino, Produto e Quantidade.', 'Preencha os Campos');
      return;
    }
    if (transferOriginCompanyId === transferDestCompanyId && transferOriginLocId === transferDestLocId) {
      toast.warning('O local de origem não pode ser idêntico ao local de destino na mesma empresa.', 'Destino Inválido');
      return;
    }

    const qty = parseFloat(transferQty);
    if (isNaN(qty) || qty <= 0) {
      toast.warning('Informe uma quantidade válida maior que zero.', 'Quantidade Inválida');
      return;
    }

    const product = dbState.products.find((p) => p.id === transferProductId);
    const originLoc = dbState.stockLocations.find((l) => l.id === transferOriginLocId);
    const destLoc = dbState.stockLocations.find((l) => l.id === transferDestLocId);
    const originComp = companies.find((c) => c.id === transferOriginCompanyId) || currentCompany;
    const destComp = companies.find((c) => c.id === transferDestCompanyId) || currentCompany;

    if (!product || !originLoc || !destLoc) {
      toast.error('Dados de produto ou locais não encontrados.', 'Erro');
      return;
    }

    try {
      let updatedBalances: ProductStockBalance[];
      let movements: StockMovement[];
      let compTransfer: CompanyStockTransfer | undefined;

      if (transferOriginCompanyId !== transferDestCompanyId) {
        const res = StockEngine.transferBetweenCompanies(
          dbState.stockBalances,
          product,
          originComp,
          originLoc,
          destComp,
          destLoc,
          qty,
          currentUser.id,
          currentUser.name,
          transferNotes
        );
        updatedBalances = res.updatedBalances;
        movements = res.movements;
        compTransfer = res.transfer;
      } else {
        const res = StockEngine.transferBetweenLocations(
          dbState.stockBalances,
          product,
          originLoc,
          destLoc,
          qty,
          currentUser.id,
          currentUser.name,
          transferOriginCompanyId,
          transferNotes ? `${transferNotes} (De: ${originComp.tradeName || originComp.name} ➔ Para: ${destComp.tradeName || destComp.name})` : `Transferência interna em ${originComp.tradeName || originComp.name}`
        );
        updatedBalances = res.updatedBalances;
        movements = res.movements;
      }

      const state = Database.getState();
      state.stockBalances = updatedBalances;
      state.stockMovements = [...movements, ...state.stockMovements];
      if (compTransfer) {
        if (!state.companyStockTransfers) state.companyStockTransfers = [];
        state.companyStockTransfers.unshift(compTransfer);
      }
      Database.persist();

      Database.addAuditLog(
        'TRANSFERENCIA_ESTOQUE',
        'ESTOQUE',
        movements[0].originDocId,
        `Transferência de ${qty} ${product.unit} de ${product.description} de [${originComp.name}] ${originLoc.name} para [${destComp.name}] ${destLoc.name}`
      );

      toast.success(
        `Transferência concluída! ${qty} ${product.unit} de ${product.description} transferidos de ${originComp.tradeName || originComp.name} (${originLoc.name}) para ${destComp.tradeName || destComp.name} (${destLoc.name}).`,
        'Transferência Realizada'
      );
      setTransferProductId('');
      setTransferQty('');
      setTransferNotes('');
    } catch (err) {
      toast.error('Erro na transferência: ' + (err as Error).message, 'Erro de Transferência');
    }
  };

  // Obtém lista de divergências preenchidas pelo usuário para a empresa e local selecionados
  const getDivergencesToAdjust = () => {
    return Object.entries(inventoryCounts)
      .map(([prodId, countStr]) => {
        if (countStr === undefined || countStr === null || String(countStr).trim() === '') return null;
        const countedQty = parseFloat(String(countStr).replace(',', '.'));
        if (isNaN(countedQty) || countedQty < 0) return null;

        const prod = dbState.products.find((p) => p.id === prodId);
        if (!prod) return null;

        const currentBal = StockEngine.getBalance(dbState.stockBalances, prodId, inventoryLocId);
        const difference = countedQty - currentBal.quantity;

        return {
          product: prod,
          countedQty,
          currentQty: currentBal.quantity,
          difference,
          reason: inventoryReasons[prodId] || 'Ajuste de inventário físico periódico',
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null && item.difference !== 0);
  };

  // Preencher todos os produtos com o saldo atual do sistema para facilitar a contagem
  const handlePreencherTodosSaldos = () => {
    const nextCounts: { [productId: string]: string } = {};
    dbState.products.forEach((p) => {
      if (p.status === 'ativo') {
        const bal = StockEngine.getBalance(dbState.stockBalances, p.id, inventoryLocId);
        nextCounts[p.id] = String(bal.quantity);
      }
    });
    setInventoryCounts(nextCounts);
    toast.info('Saldos atuais preenchidos nos campos de contagem. Altere apenas os produtos que apresentarem divergência.', 'Saldos Carregados');
  };

  // Limpar todas as contagens inseridas
  const handleLimparContagens = () => {
    setInventoryCounts({});
    setInventoryReasons({});
    toast.info('Campos de contagem limpos.', 'Contagens Limpas');
  };

  // Abrir confirmação de inventário (sem window.confirm para funcionar perfeitamente em iframes)
  const handleOpenInventoryConfirmation = () => {
    const canAdjust =
      Database.isAdmin(currentUser) ||
      Database.isGerente(currentUser) ||
      !!currentUser?.permissions?.canAdjustStock;
    if (!canAdjust) {
      toast.error('Acesso negado: Seu usuário não possui permissão para aplicar ajustes de estoque.', 'Acesso Negado');
      return;
    }
    if (!inventoryCompanyId) {
      toast.warning('Selecione a empresa a ser inventariada.', 'Empresa Obrigatória');
      return;
    }
    if (!inventoryLocId) {
      toast.warning('Selecione o local de estoque inventariado.', 'Local Obrigatório');
      return;
    }

    const enteredValuesCount = Object.values(inventoryCounts).filter(
      (v) => v !== undefined && v !== null && String(v).trim() !== ''
    ).length;

    if (enteredValuesCount === 0) {
      toast.warning('Informe a contagem física no campo numérico de pelo menos um produto para aplicar o inventário.', 'Nenhuma Contagem Informada');
      return;
    }

    const divergences = getDivergencesToAdjust();
    if (divergences.length === 0) {
      toast.info('Todas as contagens informadas conferem 100% com os saldos registrados no sistema. Nenhuma divergência a ajustar.', 'Contagem Confere');
      return;
    }

    setShowInventoryConfirmModal(true);
  };

  // Executar os ajustes confirmados para a empresa e local selecionados
  const handleExecuteInventoryAdjustments = () => {
    setIsApplyingInventory(true);
    try {
      let selectedLoc = dbState.stockLocations.find((l) => l.id === inventoryLocId);
      if (!selectedLoc) {
        selectedLoc = StockEngine.getCompanyDefaultLocation(dbState.stockLocations, inventoryCompanyId) ||
          Database.ensureCompanyStockLocation(inventoryCompanyId);
      }
      const selectedComp = companies.find((c) => c.id === inventoryCompanyId) || currentCompany;

      const divergences = getDivergencesToAdjust();
      if (divergences.length === 0) {
        setShowInventoryConfirmModal(false);
        setIsApplyingInventory(false);
        return;
      }

      let currentBalances = [...dbState.stockBalances];
      const movements: StockMovement[] = [];
      const nowIso = new Date().toISOString();
      const docId = 'INV-' + Date.now();

      for (const item of divergences) {
        const { updatedBalances, createdMovement } = StockEngine.applyMovement(
          currentBalances,
          {
            companyId: inventoryCompanyId,
            productId: item.product.id,
            productCode: item.product.code,
            productDescription: item.product.description,
            locationId: selectedLoc.id,
            locationName: selectedLoc.name,
            type: 'ajuste_inventario',
            quantity: item.difference,
            unitCost: item.product.costPrice,
            totalCost: Math.abs(item.product.costPrice * item.difference),
            originDocType: 'inventario',
            originDocId: docId,
            date: nowIso,
            userId: currentUser.id,
            userName: currentUser.name,
            notes: `${item.reason} - Empresa: ${selectedComp.tradeName || selectedComp.name} (Anterior: ${item.currentQty}, Contado: ${item.countedQty}, Dif: ${item.difference > 0 ? '+' : ''}${item.difference})`,
          },
          { allowNegativeStock: true }
        );

        currentBalances = updatedBalances;
        movements.push(createdMovement);
      }

      const state = Database.getState();
      state.stockBalances = currentBalances;
      state.stockMovements = [...movements, ...state.stockMovements];
      Database.persist();

      Database.addAuditLog(
        'AJUSTE_INVENTARIO',
        'ESTOQUE',
        docId,
        `Inventário aplicado em ${selectedComp.tradeName || selectedComp.name} (${selectedLoc.name}) por ${currentUser.name} (${movements.length} produto(s) sincronizados)`
      );

      toast.success(
        `Inventário processado com sucesso! ${movements.length} produto(s) atualizados na empresa ${selectedComp.tradeName || selectedComp.name} (${selectedLoc.name}).`,
        'Inventário Aplicado'
      );
      setInventoryCounts({});
      setInventoryReasons({});
      setShowInventoryConfirmModal(false);
    } catch (e: any) {
      toast.error('Erro ao processar inventário: ' + (e?.message || e), 'Erro no Inventário');
    } finally {
      setIsApplyingInventory(false);
    }
  };

  // Ajuste pontual imediato de um único produto direto da linha da tabela
  const handleApplySingleProductAdjustment = (product: Product) => {
    const canAdjust =
      Database.isAdmin(currentUser) ||
      Database.isGerente(currentUser) ||
      !!currentUser?.permissions?.canAdjustStock;
    if (!canAdjust) {
      toast.error('Acesso negado: Seu usuário não possui autorização para ajustar estoque.', 'Acesso Negado');
      return;
    }
    const countStr = inventoryCounts[product.id];
    if (countStr === undefined || countStr === null || String(countStr).trim() === '') {
      toast.warning(`Informe a contagem física de "${product.description}" no campo numérico para aplicar o ajuste.`, 'Informe a Contagem');
      return;
    }
    const countedQty = parseFloat(String(countStr).replace(',', '.'));
    if (isNaN(countedQty) || countedQty < 0) {
      toast.warning('A contagem física deve ser um número válido maior ou igual a zero.', 'Valor Inválido');
      return;
    }

    let selectedLoc = dbState.stockLocations.find((l) => l.id === inventoryLocId);
    if (!selectedLoc) {
      selectedLoc = StockEngine.getCompanyDefaultLocation(dbState.stockLocations, inventoryCompanyId) ||
        Database.ensureCompanyStockLocation(inventoryCompanyId);
    }
    const selectedComp = companies.find((c) => c.id === inventoryCompanyId) || currentCompany;

    const currentBal = StockEngine.getBalance(dbState.stockBalances, product.id, selectedLoc.id);
    const diff = countedQty - currentBal.quantity;

    if (diff === 0) {
      toast.info(`O saldo de "${product.description}" já é exatamente ${countedQty} ${product.unit}.`, 'Saldo Inalterado');
      return;
    }

    try {
      const docId = 'INV-' + Date.now();
      const nowIso = new Date().toISOString();
      const reason = inventoryReasons[product.id] || 'Ajuste pontual de inventário físico';

      const { updatedBalances, createdMovement } = StockEngine.applyMovement(
        dbState.stockBalances,
        {
          companyId: inventoryCompanyId,
          productId: product.id,
          productCode: product.code,
          productDescription: product.description,
          locationId: selectedLoc.id,
          locationName: selectedLoc.name,
          type: 'ajuste_inventario',
          quantity: diff,
          unitCost: product.costPrice,
          totalCost: Math.abs(product.costPrice * diff),
          originDocType: 'inventario',
          originDocId: docId,
          date: nowIso,
          userId: currentUser.id,
          userName: currentUser.name,
          notes: `${reason} - Empresa: ${selectedComp.tradeName || selectedComp.name} (Anterior: ${currentBal.quantity}, Contado: ${countedQty}, Dif: ${diff > 0 ? '+' : ''}${diff})`,
        },
        { allowNegativeStock: true }
      );

      const state = Database.getState();
      state.stockBalances = updatedBalances;
      state.stockMovements = [createdMovement, ...state.stockMovements];
      Database.persist();

      Database.addAuditLog(
        'AJUSTE_INVENTARIO',
        'ESTOQUE',
        docId,
        `Ajuste pontual em ${product.code} (${selectedComp.tradeName || selectedComp.name}): de ${currentBal.quantity} para ${countedQty} ${product.unit}`
      );

      toast.success(
        `Estoque de "${product.description}" ajustado para ${countedQty} ${product.unit} na empresa ${selectedComp.tradeName || selectedComp.name} (${selectedLoc.name})!`,
        'Estoque Atualizado'
      );

      // Limpa contagem apenas desse item
      setInventoryCounts((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      setInventoryReasons((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    } catch (e: any) {
      toast.error('Erro ao ajustar produto: ' + (e?.message || e), 'Erro');
    }
  };

  // Helper para abrir o modal de Alimentação Manual garantindo empresa, produto e local válidos
  const handleOpenManualFeedingModal = (opts?: {
    companyId?: string;
    productId?: string;
    qty?: string;
    unitCost?: string;
    notes?: string;
  }) => {
    const latestState = Database.getState();
    const targetCompanyId =
      opts?.companyId ||
      (movCompanyFilter !== 'todos' ? movCompanyFilter : currentCompany.id) ||
      latestState.companies?.[0]?.id ||
      'comp-matriz';

    const targetProduct =
      (opts?.productId ? latestState.products.find((p) => p.id === opts.productId) : undefined) ||
      latestState.products.find((p) => p.status === 'ativo') ||
      latestState.products[0];

    let companyLocs = (latestState.stockLocations || []).filter(
      (l) => l.companyId === targetCompanyId && l.status === 'ativo'
    );
    if (companyLocs.length === 0) {
      const createdLoc = Database.ensureCompanyStockLocation(targetCompanyId);
      if (createdLoc) {
        companyLocs = [createdLoc];
      }
    }

    const preferredLoc =
      (targetProduct?.defaultLocationId
        ? companyLocs.find((l) => l.id === targetProduct.defaultLocationId)
        : undefined) ||
      StockEngine.getCompanyDefaultLocation(companyLocs, targetCompanyId) ||
      companyLocs[0];

    setManualCompanyId(targetCompanyId);
    setManualLocationId(preferredLoc?.id || '');
    setManualType('entrada_compra');
    setManualProductId(targetProduct?.id || '');
    setManualQty(opts?.qty ?? '1');
    setManualUnitCost(opts?.unitCost ?? String(targetProduct?.costPrice ?? 0));
    setManualNotes(opts?.notes ?? '');
    setIsManualModalOpen(true);
  };

  // Executar Alimentação Manual de Estoque (Entrada Avulsa por Empresa)
  const handleExecuteManualFeeding = (e: React.FormEvent) => {
    e.preventDefault();
    const activeUser = Database.getCurrentUser();
    const canAdjust =
      Database.isAdmin(activeUser) ||
      Database.isGerente(activeUser) ||
      !!activeUser?.permissions?.canAdjustStock;

    if (!canAdjust) {
      toast.error('Seu usuário não possui autorização para alimentar estoque manualmente.', 'Acesso Negado');
      return;
    }

    const state = Database.getState();

    if (!manualCompanyId) {
      toast.warning('Selecione a empresa para a qual o estoque será alimentado.', 'Empresa Obrigatória');
      return;
    }
    if (!manualProductId) {
      toast.warning('Selecione o produto a ser alimentado no estoque.', 'Produto Obrigatório');
      return;
    }

    const normalizedQtyStr = String(manualQty || '').trim().replace(/\s+/g, '').replace(',', '.');
    const qty = parseFloat(normalizedQtyStr);
    if (isNaN(qty) || qty <= 0) {
      toast.warning('Informe uma quantidade válida maior que zero.', 'Quantidade Inválida');
      return;
    }

    const normalizedCostStr = String(manualUnitCost || '').trim().replace(/\s+/g, '').replace(',', '.');
    const parsedUnitCost = parseFloat(normalizedCostStr);
    const unitCost = isNaN(parsedUnitCost) || parsedUnitCost < 0 ? 0 : parsedUnitCost;

    const prod = state.products.find((p) => p.id === manualProductId);
    if (!prod) {
      toast.error('Produto selecionado não encontrado no catálogo.', 'Erro');
      return;
    }

    let loc = state.stockLocations.find((l) => l.id === manualLocationId && l.companyId === manualCompanyId);
    if (!loc) {
      loc =
        StockEngine.getCompanyDefaultLocation(state.stockLocations, manualCompanyId) ||
        Database.ensureCompanyStockLocation(manualCompanyId);
    }

    if (!loc) {
      toast.warning('Selecione o local de estoque de destino.', 'Local Obrigatório');
      return;
    }

    const comp = (state.companies || companies).find((c) => c.id === manualCompanyId) || currentCompany;
    const docId = 'ENT-' + Date.now();
    const nowIso = new Date().toISOString();
    const actorId = activeUser?.id || 'usr-system';
    const actorName = activeUser?.name || 'Operador';

    try {
      const { updatedBalances, createdMovement } = StockEngine.applyMovement(
        state.stockBalances || [],
        {
          companyId: manualCompanyId,
          productId: prod.id,
          productCode: prod.code,
          productDescription: prod.description,
          locationId: loc.id,
          locationName: loc.name,
          type: manualType,
          quantity: qty,
          unitCost: unitCost,
          totalCost: unitCost * qty,
          originDocType: 'avulso',
          originDocId: docId,
          date: nowIso,
          userId: actorId,
          userName: actorName,
          notes: manualNotes.trim()
            ? `${manualNotes.trim()} [Alimentação direta na empresa ${comp.name}]`
            : `Alimentação manual de estoque para a empresa ${comp.name} realizada por ${actorName}`,
        },
        { allowNegativeStock: true, products: state.products }
      );

      state.stockBalances = updatedBalances;
      state.stockMovements = [createdMovement, ...(state.stockMovements || [])];

      Database.addAuditLog(
        'ALIMENTACAO_ESTOQUE_MANUAL',
        'ESTOQUE',
        docId,
        `Entrada manual de ${qty} ${prod.unit} do produto ${prod.description} para a empresa ${comp.name} no local ${loc.name}`,
        true
      );
      Database.persist();
      setDbState({ ...Database.getState() });
      FirebaseSyncService.syncToFirebase(Database.getState()).catch((syncErr) => {
        console.warn('Aviso ao sincronizar alimentação de estoque com a nuvem:', syncErr);
      });

      toast.success(
        `Estoque alimentado com sucesso! +${formatQuantity(qty)} ${prod.unit} de "${prod.description}" adicionados à empresa ${comp.tradeName || comp.name} no local ${loc.name}.`,
        'Estoque Alimentado'
      );

      setIsManualModalOpen(false);
      setManualQty('1');
      setManualNotes('');
    } catch (err: any) {
      toast.error('Erro ao alimentar estoque: ' + (err?.message || String(err)), 'Erro');
    }
  };

  // Atalhos rápidos para o filtro de período
  const setQuickPeriod = (preset: 'today' | '7days' | 'month' | 'clear') => {
    const today = new Date();
    const toIso = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    if (preset === 'clear') {
      setMovStartDate('');
      setMovEndDate('');
      return;
    }
    if (preset === 'today') {
      const todayStr = toIso(today);
      setMovStartDate(todayStr);
      setMovEndDate(todayStr);
      return;
    }
    if (preset === '7days') {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      setMovStartDate(toIso(past));
      setMovEndDate(toIso(today));
      return;
    }
    if (preset === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setMovStartDate(toIso(start));
      setMovEndDate(toIso(end));
      return;
    }
  };

  // Movimentações ordenadas da mais recente para a mais antiga
  const sortedStockMovements = useMemo(() => {
    return [...dbState.stockMovements].sort((a, b) => {
      const timeA = new Date(a.date).getTime() || 0;
      const timeB = new Date(b.date).getTime() || 0;
      return timeB - timeA;
    });
  }, [dbState.stockMovements]);

  // Movimentações filtradas por Empresa, Tipo, Produto, Período e Busca Textual
  const allFilteredMovements = useMemo(() => {
    return sortedStockMovements.filter((m) => {
      if (movCompanyFilter !== 'todos' && m.companyId !== movCompanyFilter) return false;
      if (movFilterType !== 'todos' && m.type !== movFilterType) return false;

      // Filtro por produto específico do catálogo
      if (movProductFilter !== 'todos') {
        if (m.productId !== movProductFilter && m.masterPackProductId !== movProductFilter) {
          return false;
        }
      }

      // Filtro por período (Data Inicial e Data Final)
      const movDate = (m.date || '').slice(0, 10);
      if (movStartDate && movDate < movStartDate) return false;
      if (movEndDate && movDate > movEndDate) return false;

      // Busca textual por código, descrição, documento de origem ou notas
      if (movSearchProd) {
        const query = movSearchProd.toLowerCase().trim();
        const matchesDesc = m.productDescription?.toLowerCase().includes(query);
        const matchesCode = m.productCode?.toLowerCase().includes(query);
        const matchesMaster = m.masterPackProductCode?.toLowerCase().includes(query);
        const matchesNotes = m.notes?.toLowerCase().includes(query);
        const matchesDoc = m.originDocId?.toLowerCase().includes(query);
        if (!matchesDesc && !matchesCode && !matchesMaster && !matchesNotes && !matchesDoc) {
          return false;
        }
      }

      return true;
    });
  }, [sortedStockMovements, movCompanyFilter, movFilterType, movProductFilter, movStartDate, movEndDate, movSearchProd]);

  // Por padrão, lista apenas as últimas 10 movimentações (ou limite configurado pelo usuário)
  const filteredMovements = useMemo(() => {
    if (movLimit === 'todos') return allFilteredMovements;
    const limitNum = Number(movLimit) || 10;
    return allFilteredMovements.slice(0, limitNum);
  }, [allFilteredMovements, movLimit]);

  // Produtos com estoque disponível estritamente abaixo do Estoque Mínimo
  const criticalStockProducts = useMemo(() => {
    const isSpecificCompany = movCompanyFilter !== 'todos';
    const query = movSearchProd.toLowerCase().trim();

    return dbState.products
      .filter((p) => {
        if (p.status !== 'ativo') return false;
        if (movProductFilter !== 'todos' && p.id !== movProductFilter) return false;

        if (query) {
          const matchesDesc = p.description?.toLowerCase().includes(query);
          const matchesCode = p.code?.toLowerCase().includes(query);
          const matchesBarcode = p.barcode?.toLowerCase().includes(query);
          if (!matchesDesc && !matchesCode && !matchesBarcode) return false;
        }

        const effectiveMinStock = isSpecificCompany
          ? (p.companyPrices?.[movCompanyFilter]?.minStock ?? p.minStock ?? 0)
          : (p.minStock ?? 0);

        const stock = isSpecificCompany
          ? StockEngine.getTotalProductStock(dbState.stockBalances, p.id, dbState.products, movCompanyFilter)
          : StockEngine.getTotalProductStock(dbState.stockBalances, p.id, dbState.products);

        return stock.available < effectiveMinStock;
      })
      .map((p) => {
        const effectiveMinStock = isSpecificCompany
          ? (p.companyPrices?.[movCompanyFilter]?.minStock ?? p.minStock ?? 0)
          : (p.minStock ?? 0);

        const stock = isSpecificCompany
          ? StockEngine.getTotalProductStock(dbState.stockBalances, p.id, dbState.products, movCompanyFilter)
          : StockEngine.getTotalProductStock(dbState.stockBalances, p.id, dbState.products);

        const deficit = Math.max(0, effectiveMinStock - stock.available);

        return {
          product: p,
          companyId: isSpecificCompany ? movCompanyFilter : currentCompany.id,
          minStock: effectiveMinStock,
          physical: stock.physical,
          reserved: stock.reserved,
          available: stock.available,
          deficit,
        };
      })
      .sort((a, b) => b.deficit - a.deficit);
  }, [dbState.products, dbState.stockBalances, movCompanyFilter, currentCompany.id, movProductFilter, movSearchProd]);

  // Saldo do produto selecionado na origem para a transferência
  const selectedOriginBalance = transferProductId && transferOriginLocId
    ? StockEngine.getBalance(dbState.stockBalances, transferProductId, transferOriginLocId).quantity
    : null;

  return (
    <div
      className={
        activeTab === 'inventario' || activeTab === 'movimentacoes'
          ? 'flex flex-col gap-4 lg:h-[calc(100vh-7rem)]'
          : 'space-y-4'
      }
    >
      {/* Topo com Abas do Módulo e Filtro Geral */}
      <div className="shrink-0 bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Warehouse className="text-indigo-600" size={20} />
            <span>Controle de Estoque & Locais por Empresa</span>
          </h2>
          <p className="text-xs text-slate-500">
            Alimentação de estoque setorizada por empresa, transferências entre filiais, inventário físico e extrato completo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor Rápido de Empresa para visualização */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
            <Building2 size={14} className="text-indigo-600 shrink-0" />
            <span className="font-semibold text-slate-600">Empresa:</span>
            <select
              value={selectedCompanyFilter}
              onChange={(e) => setSelectedCompanyFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-800 text-xs border-none focus:outline-hidden cursor-pointer"
            >
              <option value="todos">Todas as Empresas ({companies.length})</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.tradeName || c.name} {c.type === 'matriz' ? '(Matriz)' : '(Filial)'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setActiveTab('locais')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'locais' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Locais Cadastrados
            </button>
            <button
              onClick={() => setActiveTab('transferencias')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'transferencias' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Transferência Interna
            </button>
            <button
              onClick={() => setActiveTab('inventario')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'inventario' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inventário & Ajustes
            </button>
            <button
              onClick={() => setActiveTab('movimentacoes')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'movimentacoes' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Extrato & Alimentação
            </button>
          </div>
        </div>
      </div>

      {/* ABA 1: LOCAIS CADASTRADOS */}
      {activeTab === 'locais' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 uppercase">
                Locais de Armazenamento Cadastrados ({filteredLocations.length})
              </span>
              {selectedCompanyFilter !== 'todos' && (
                <span className="text-[11px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                  {companies.find((c) => c.id === selectedCompanyFilter)?.tradeName || 'Filtrado'}
                </span>
              )}
            </div>

            <button
              onClick={() => {
                setEditingLocation(null);
                setLocCompanyId(selectedCompanyFilter !== 'todos' ? selectedCompanyFilter : currentCompany.id);
                setLocName('');
                setLocCode('LOC-0' + (dbState.stockLocations.length + 1));
                setLocType('outros');
                setLocDesc('');
                setIsLocationModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors"
            >
              <Plus size={15} />
              <span>Novo Local de Estoque</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredLocations.map((loc) => {
              const comp = companies.find((c) => c.id === loc.companyId) || currentCompany;
              const itemsInLoc = dbState.stockBalances.filter((b) => b.locationId === loc.id && b.quantity > 0);
              const totalItemsCount = itemsInLoc.reduce((s, i) => s + i.quantity, 0);

              return (
                <div
                  key={loc.id}
                  className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2 flex flex-col justify-between hover:border-indigo-300 transition-colors"
                >
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                        {loc.code}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 flex items-center gap-1">
                          <Building2 size={11} className="text-indigo-600" />
                          <span>{comp.tradeName || comp.name}</span>
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          loc.status === 'ativo' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {loc.status}
                        </span>
                      </div>
                    </div>

                    <h4 className="font-bold text-sm text-slate-800 mt-2">{loc.name}</h4>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{loc.description || 'Sem descrição informada.'}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Saldo Físico</span>
                      <span className="font-bold text-slate-800">{itemsInLoc.length} produtos ({formatQuantity(totalItemsCount)} un)</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingLocation(loc);
                          setLocCompanyId(loc.companyId || currentCompany.id);
                          setLocName(loc.name);
                          setLocCode(loc.code);
                          setLocType(loc.type);
                          setLocDesc(loc.description);
                          setIsLocationModalOpen(true);
                        }}
                        className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 hover:text-slate-800"
                        title="Editar Local"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleInactivateLocation(loc)}
                        className="p-1.5 hover:bg-rose-50 rounded-md text-rose-500"
                        title="Inativar ou Excluir"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ABA 2: TRANSFERÊNCIA ENTRE LOCAIS / EMPRESAS */}
      {activeTab === 'transferencias' && (
        <div className="space-y-6">
        <form onSubmit={handleExecuteTransfer} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs max-w-2xl mx-auto space-y-4">
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowLeftRight size={18} className="text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-800">Transferência de Estoque entre Empresas / Locais</h3>
            </div>
            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
              Movimentação Atômica
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bloco de Origem */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
              <div className="font-bold text-xs text-rose-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span>ORIGEM DA MERCADORIA (SAÍDA)</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Empresa de Origem *</label>
                <select
                  value={transferOriginCompanyId}
                  onChange={(e) => {
                    setTransferOriginCompanyId(e.target.value);
                    setTransferOriginLocId('');
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.tradeName || c.name} {c.type === 'matriz' ? '(Matriz)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Local de Estoque Origem *</label>
                <select
                  required
                  value={transferOriginLocId}
                  onChange={(e) => setTransferOriginLocId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  <option value="">Selecione o local de saída...</option>
                  {originLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} - {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Bloco de Destino */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
              <div className="font-bold text-xs text-emerald-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>DESTINO DA MERCADORIA (ENTRADA)</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Empresa de Destino *</label>
                <select
                  value={transferDestCompanyId}
                  onChange={(e) => {
                    setTransferDestCompanyId(e.target.value);
                    setTransferDestLocId('');
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.tradeName || c.name} {c.type === 'matriz' ? '(Matriz)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Local de Estoque Destino *</label>
                <select
                  required
                  value={transferDestLocId}
                  onChange={(e) => setTransferDestLocId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  <option value="">Selecione o local de entrada...</option>
                  {destLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} - {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Dados do Produto e Quantidade */}
          <div className="space-y-3 pt-2">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-700">Produto a Transferir *</label>
                {selectedOriginBalance !== null && (
                  <span className={`text-[11px] font-bold ${selectedOriginBalance > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    Saldo na Origem: {formatQuantity(selectedOriginBalance)}
                  </span>
                )}
              </div>
              <select
                required
                value={transferProductId}
                onChange={(e) => setTransferProductId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
              >
                <option value="">Selecione o produto...</option>
                {dbState.products.map((p) => {
                  const bal = transferOriginLocId
                    ? StockEngine.getBalance(dbState.stockBalances, p.id, transferOriginLocId).quantity
                    : StockEngine.getTotalProductStock(dbState.stockBalances, p.id, transferOriginCompanyId).available;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.description} (Disp: {formatQuantity(bal)} {p.unit})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Quantidade a Transferir *</label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  placeholder="Ex: 50"
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Motivo / Documento</label>
                <input
                  type="text"
                  placeholder="Ex: Abastecimento de filial, NF-e Remessa"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 mt-2 cursor-pointer"
          >
            <ArrowLeftRight size={16} />
            <span>Confirmar Transferência Atômica</span>
          </button>
        </form>

        {/* Histórico Auditado de Transferências Entre Empresas (Matriz & Filiais) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs max-w-4xl mx-auto space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <History size={17} className="text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-800">
                Histórico de Transferências entre Empresas (Matriz & Filiais)
              </h3>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              Rastreabilidade completa de saídas na origem e entradas no destino
            </span>
          </div>

          {(!dbState.companyStockTransfers || dbState.companyStockTransfers.length === 0) ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Nenhuma transferência entre empresas registrada até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Código / Data</th>
                    <th className="p-2.5">Produto</th>
                    <th className="p-2.5 text-right">Qtd</th>
                    <th className="p-2.5">Origem (Saída)</th>
                    <th className="p-2.5">Destino (Entrada)</th>
                    <th className="p-2.5">Responsável</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {dbState.companyStockTransfers.map((tr) => (
                    <tr key={tr.id} className="hover:bg-slate-50">
                      <td className="p-2.5">
                        <span className="font-mono font-bold text-indigo-700 block text-xs">{tr.transferNumber || tr.number || tr.id}</span>
                        <span className="text-[10px] text-slate-400">{new Date(tr.date).toLocaleDateString('pt-BR')} {new Date(tr.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="p-2.5">
                        <span className="font-bold text-slate-800 block text-xs">{tr.productDescription}</span>
                        <span className="text-[10px] text-slate-400 font-mono">[{tr.productCode}]</span>
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900 text-xs">
                        {formatQuantity(tr.quantity)} {tr.unit}
                      </td>
                      <td className="p-2.5">
                        <span className="font-bold text-rose-700 block text-xs">{tr.fromCompanyName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{tr.fromLocationName}</span>
                      </td>
                      <td className="p-2.5">
                        <span className="font-bold text-emerald-700 block text-xs">{tr.toCompanyName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{tr.toLocationName}</span>
                      </td>
                      <td className="p-2.5 text-slate-600 text-xs">
                        {tr.userName}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          Concluída
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      )}

      {/* ABA 3: INVENTÁRIO FÍSICO & AJUSTES */}
      {activeTab === 'inventario' && (() => {
        const selectedComp = companies.find((c) => c.id === inventoryCompanyId) || currentCompany;
        const selectedLoc = dbState.stockLocations.find((l) => l.id === inventoryLocId) ||
          StockEngine.getCompanyDefaultLocation(dbState.stockLocations, inventoryCompanyId);

        const filteredInventoryProducts = dbState.products.filter((p) => {
          if (p.status !== 'ativo') return false;
          if (!inventorySearchTerm.trim()) return true;
          const term = inventorySearchTerm.toLowerCase();
          return (
            p.description.toLowerCase().includes(term) ||
            p.code.toLowerCase().includes(term) ||
            (p.barcode && p.barcode.includes(term))
          );
        });

        const divergences = getDivergencesToAdjust();
        const isMatriz = selectedComp.type === 'matriz';

        return (
          <div className="flex-1 min-h-0 flex flex-col gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                  <ClipboardCheck size={18} className="text-emerald-600" />
                  <span>Contagem Física & Ajuste de Inventário por Empresa</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Ajuste o estoque dos produtos tanto da empresa matriz quanto de qualquer empresa filial de forma isolada e auditada.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Seletor de Empresa */}
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                  <Building2 size={14} className="text-indigo-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-700">Empresa:</span>
                  <select
                    value={inventoryCompanyId}
                    onChange={(e) => {
                      const newCompId = e.target.value;
                      setInventoryCompanyId(newCompId);
                      setInventoryCounts({});
                      setInventoryReasons({});
                      const compLocs = dbState.stockLocations.filter((l) => l.companyId === newCompId && l.status === 'ativo');
                      if (compLocs.length > 0) {
                        setInventoryLocId(compLocs[0].id);
                      } else {
                        const created = Database.ensureCompanyStockLocation(newCompId);
                        setInventoryLocId(created.id);
                      }
                    }}
                    className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.tradeName || c.name} ({c.type === 'matriz' ? 'Matriz' : 'Filial'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Seletor de Depósito da Empresa */}
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                  <Warehouse size={14} className="text-indigo-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-700">Local:</span>
                  <select
                    value={inventoryLocId}
                    onChange={(e) => {
                      setInventoryLocId(e.target.value);
                      setInventoryCounts({});
                      setInventoryReasons({});
                    }}
                    className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                  >
                    {inventoryLocations.length === 0 ? (
                      <option value="">Nenhum local cadastrado</option>
                    ) : (
                      inventoryLocations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.code} - {l.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* Banner Informativo da Empresa & Local Selecionados */}
            <div className="shrink-0 bg-gradient-to-r from-indigo-50/70 via-slate-50 to-emerald-50/50 p-3.5 rounded-xl border border-indigo-100 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-2xs shrink-0">
                  <Building2 size={16} />
                </div>
                <div>
                  <div className="font-extrabold text-slate-800 flex items-center gap-1.5 flex-wrap">
                    <span>Ajustando Estoque de:</span>
                    <span className="text-indigo-700 font-bold">{selectedComp.tradeName || selectedComp.name}</span>
                    <span
                      className={`text-[10px] px-2 py-0.2 rounded-full font-bold uppercase ${
                        isMatriz ? 'bg-indigo-100 text-indigo-800' : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {isMatriz ? 'Empresa Matriz' : 'Empresa Filial'}
                    </span>
                    <span className="text-slate-400">• Depósito: <strong>{selectedLoc?.name || 'Comercial'}</strong></span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Os ajustes realizados afetarão exclusivamente o estoque da empresa selecionada acima.
                  </p>
                </div>
              </div>

              {/* Botões de Ação Rápida */}
              <div className="flex items-center flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handlePreencherTodosSaldos}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg font-bold text-xs shadow-2xs flex items-center gap-1 transition-colors cursor-pointer"
                  title="Preenche o campo de contagem com os saldos atuais para alterar apenas as divergências"
                >
                  <Copy size={13} className="text-indigo-600" />
                  <span>Copiar Saldos Atuais</span>
                </button>

                <button
                  type="button"
                  onClick={handleLimparContagens}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg font-bold text-xs shadow-2xs flex items-center gap-1 transition-colors cursor-pointer"
                  title="Limpa todas as contagens inseridas na tela"
                >
                  <RotateCcw size={13} className="text-slate-400" />
                  <span>Limpar</span>
                </button>

                {divergences.length > 0 && (
                  <span className="bg-amber-100 text-amber-900 border border-amber-300 font-black px-2.5 py-1 rounded-lg text-xs animate-pulse">
                    {divergences.length} divergência(s) detectada(s)
                  </span>
                )}
              </div>
            </div>

            {/* Barra de Busca de Produtos no Inventário */}
            <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar produto por código, descrição ou código de barras..."
                  value={inventorySearchTerm}
                  onChange={(e) => setInventorySearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
                {inventorySearchTerm && (
                  <button
                    type="button"
                    onClick={() => setInventorySearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="text-[11px] text-slate-500 font-medium text-right whitespace-nowrap self-center">
                Listando <strong>{filteredInventoryProducts.length}</strong> de {dbState.products.length} produtos
              </div>
            </div>

            {!inventoryLocId ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Selecione a Empresa e o Local de estoque acima para listar os produtos e iniciar a contagem física.
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col gap-3">
                <div className="flex-1 min-h-[280px] overflow-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                      <tr>
                        <th className="p-3">Código</th>
                        <th className="p-3">Descrição do Produto</th>
                        <th className="p-3 text-right">Saldo Atual Sistema</th>
                        <th className="p-3 text-center">Contagem Física</th>
                        <th className="p-3 text-right">Divergência</th>
                        <th className="p-3">Justificativa do Acerto</th>
                        <th className="p-3 text-center">Ação Rápida</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredInventoryProducts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400">
                            Nenhum produto encontrado com o termo buscado.
                          </td>
                        </tr>
                      ) : (
                        filteredInventoryProducts.map((p) => {
                          const bal = StockEngine.getBalance(dbState.stockBalances, p.id, inventoryLocId);
                          const countedStr = inventoryCounts[p.id] ?? '';
                          const countedNum = countedStr !== '' ? parseFloat(countedStr.replace(',', '.')) : null;
                          const hasEnteredCount = countedNum !== null && !isNaN(countedNum);
                          const diff = hasEnteredCount ? countedNum - bal.quantity : 0;

                          return (
                            <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="p-3 font-mono font-bold text-blue-700">{p.code}</td>
                              <td className="p-3">
                                <div className="font-semibold text-slate-800">{p.description}</div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                                  <span>Unidade: {p.unit}</span>
                                  {p.barcode && <span>• EAN: {p.barcode}</span>}
                                  {p.isMasterPack && (
                                    <span className="text-amber-800 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                      Emb. Master ({p.masterPackUnits} un)
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-700">
                                {formatQuantity(bal.quantity)} {p.unit}
                              </td>
                              <td className="p-3 text-center">
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  placeholder={String(bal.quantity)}
                                  value={countedStr}
                                  onChange={(e) =>
                                    setInventoryCounts({ ...inventoryCounts, [p.id]: e.target.value })
                                  }
                                  className={`w-24 px-2 py-1.5 border rounded-lg text-center font-mono font-bold text-xs focus:outline-hidden focus:ring-2 ${
                                    hasEnteredCount && diff !== 0
                                      ? 'bg-amber-50 border-amber-400 text-amber-950 focus:ring-amber-500'
                                      : 'bg-white border-slate-300 text-slate-900 focus:ring-indigo-500'
                                  }`}
                                />
                              </td>
                              <td className="p-3 text-right font-mono font-extrabold">
                                {hasEnteredCount ? (
                                  <span
                                    className={
                                      diff === 0
                                        ? 'text-slate-400 font-medium'
                                        : diff > 0
                                        ? 'text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 inline-block'
                                        : 'text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 inline-block'
                                    }
                                  >
                                    {diff > 0 ? `+${formatQuantity(diff)}` : formatQuantity(diff)} {p.unit}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                              <td className="p-3">
                                <input
                                  type="text"
                                  placeholder="Motivo (ex: avaria, sobra física, erro de contagem...)"
                                  value={inventoryReasons[p.id] || ''}
                                  onChange={(e) =>
                                    setInventoryReasons({ ...inventoryReasons, [p.id]: e.target.value })
                                  }
                                  disabled={!hasEnteredCount || diff === 0}
                                  className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 disabled:opacity-40 disabled:bg-slate-50 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                                />
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  disabled={!hasEnteredCount || diff === 0}
                                  onClick={() => handleApplySingleProductAdjustment(p)}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 mx-auto cursor-pointer ${
                                    hasEnteredCount && diff !== 0
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                      : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                                  }`}
                                  title={
                                    hasEnteredCount && diff !== 0
                                      ? `Ajustar imediatamente o estoque deste produto para ${countedNum} ${p.unit}`
                                      : 'Digite uma contagem com divergência para ajustar'
                                  }
                                >
                                  <Check size={13} />
                                  <span>Ajustar Item</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Rodapé de Ações de Inventário */}
                <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-600">
                    <span className="font-bold">Resumo:</span>{' '}
                    <span>
                      {divergences.length === 0
                        ? 'Nenhuma divergência registrada nos campos.'
                        : `${divergences.length} produto(s) com divergência prontos para sincronização.`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleOpenInventoryConfirmation}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <CheckCircle size={17} />
                      <span>
                        Aplicar Ajustes e Registrar Inventário da Empresa
                        {divergences.length > 0 ? ` (${divergences.length})` : ''}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* MODAL DE CONFIRMAÇÃO DE INVENTÁRIO (SUBSTITUI WINDOW.CONFIRM PARA FUNCIONAR 100% EM IFRAMES) */}
            {showInventoryConfirmModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
                <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 my-8">
                  <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                        <ClipboardCheck size={22} />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-base text-slate-800">
                          Confirmar Ajuste de Inventário Físico
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">
                          Empresa: <strong className="text-indigo-700">{selectedComp.tradeName || selectedComp.name}</strong> ({selectedComp.type === 'matriz' ? 'Matriz' : 'Filial'}) • Local: <strong>{selectedLoc?.name}</strong>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowInventoryConfirmModal(false)}
                      className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 text-sm cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2">
                    <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">
                        Atenção: Os saldos físicos de {divergences.length} produto(s) serão atualizados imediatamente no estoque da empresa selecionada.
                      </p>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Esta operação gerará movimentações do tipo "Ajuste de Inventário" auditadas com data, hora e responsável.
                      </p>
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Produto</th>
                          <th className="p-2.5 text-right">Saldo Atual</th>
                          <th className="p-2.5 text-right">Nova Contagem</th>
                          <th className="p-2.5 text-right">Ajuste (+/-)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {divergences.map((item) => (
                          <tr key={item.product.id} className="hover:bg-slate-50">
                            <td className="p-2.5">
                              <span className="font-mono font-bold text-blue-700 mr-1">[{item.product.code}]</span>
                              <span className="font-semibold text-slate-800">{item.product.description}</span>
                              <span className="text-[10px] text-slate-400 block">{item.reason}</span>
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-600">
                              {formatQuantity(item.currentQty)} {item.product.unit}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                              {formatQuantity(item.countedQty)} {item.product.unit}
                            </td>
                            <td className="p-2.5 text-right font-mono font-extrabold">
                              <span
                                className={
                                  item.difference > 0
                                    ? 'text-emerald-700'
                                    : 'text-rose-700'
                                }
                              >
                                {item.difference > 0 ? `+${formatQuantity(item.difference)}` : formatQuantity(item.difference)} {item.product.unit}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={isApplyingInventory}
                      onClick={() => setShowInventoryConfirmModal(false)}
                      className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      disabled={isApplyingInventory}
                      onClick={handleExecuteInventoryAdjustments}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isApplyingInventory ? (
                        <>
                          <RotateCw size={15} className="animate-spin" />
                          <span>Sincronizando Estoque...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle size={15} />
                          <span>Confirmar e Sincronizar Estoque</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ABA 4: EXTRATO DE MOVIMENTAÇÕES & ALIMENTAÇÃO DIRETA */}
      {activeTab === 'movimentacoes' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden p-4">
          {/* BARRA SUPERIOR DE FILTROS & AÇÕES */}
          <div className="shrink-0 space-y-2.5">
            {/* Linha 1: Empresa, Produto, Tipo e Botão de Alimentação */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-2.5">
              <div className="flex flex-wrap items-center gap-2 flex-1 w-full">
                {/* Filtro por Empresa */}
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
                  <Building2 size={13} className="text-indigo-600 shrink-0" />
                  <span className="font-bold text-slate-600 shrink-0">Empresa:</span>
                  <select
                    value={movCompanyFilter}
                    onChange={(e) => setMovCompanyFilter(e.target.value)}
                    className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                  >
                    <option value="todos">Todas as Empresas</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.tradeName || c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtro por Produto Específico */}
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs flex-1 min-w-[220px]">
                  <Package size={13} className="text-indigo-600 shrink-0" />
                  <span className="font-bold text-slate-600 shrink-0">Produto:</span>
                  <select
                    value={movProductFilter}
                    onChange={(e) => setMovProductFilter(e.target.value)}
                    className="bg-transparent font-semibold text-slate-800 focus:outline-hidden w-full cursor-pointer truncate"
                  >
                    <option value="todos">Todos os Produtos do Catálogo</option>
                    {dbState.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} - {p.description}
                      </option>
                    ))}
                  </select>
                  {movProductFilter !== 'todos' && (
                    <button
                      type="button"
                      onClick={() => setMovProductFilter('todos')}
                      className="text-slate-400 hover:text-slate-600 shrink-0 cursor-pointer"
                      title="Limpar seleção de produto"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Filtro por Tipo (apenas quando listando movimentações) */}
                {!movOnlyCritical && (
                  <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
                    <Filter size={13} className="text-indigo-600 shrink-0" />
                    <span className="font-bold text-slate-600 shrink-0">Tipo:</span>
                    <select
                      value={movFilterType}
                      onChange={(e) => setMovFilterType(e.target.value)}
                      className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                    >
                      <option value="todos">Todos os Tipos</option>
                      <option value="saida_venda">Saída por Venda</option>
                      <option value="entrada_compra">Entrada por Compra</option>
                      <option value="consumo_producao">Consumo de Insumos (Produção)</option>
                      <option value="entrada_producao">Entrada de Produto Acabado</option>
                      <option value="transferencia_saida">Transferência (Saída)</option>
                      <option value="transferencia_entrada">Transferência (Entrada)</option>
                      <option value="ajuste_inventario">Ajuste de Inventário</option>
                      <option value="devolucao">Devolução / Estorno</option>
                    </select>
                  </div>
                )}

                {/* Alternador: Apenas Produtos em Estoque Crítico (Abaixo do Estoque Mínimo) */}
                <button
                  type="button"
                  onClick={() => setMovOnlyCritical((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                    movOnlyCritical
                      ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-amber-50 hover:border-amber-300'
                  }`}
                  title="Listar apenas produtos com estoque disponível abaixo do Estoque Mínimo"
                >
                  <AlertCircle size={13} className={movOnlyCritical ? 'text-amber-700' : 'text-amber-500'} />
                  <span>Abaixo do Mínimo ({criticalStockProducts.length})</span>
                </button>
              </div>

              {/* BOTÃO DE ALIMENTAÇÃO MANUAL DE ESTOQUE */}
              <button
                type="button"
                onClick={() => handleOpenManualFeedingModal()}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 self-end lg:self-auto cursor-pointer"
              >
                <ArrowDownLeft size={16} />
                <span>Nova Alimentação de Estoque</span>
              </button>
            </div>

            {/* Linha 2: Filtro de Período, Busca Textual e Controle de Quantidade */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
              {!movOnlyCritical ? (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Período (Data Inicial e Data Final) */}
                  <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
                    <Calendar size={13} className="text-indigo-600 shrink-0" />
                    <span className="font-bold text-slate-600 shrink-0">Período:</span>
                    <input
                      type="date"
                      value={movStartDate}
                      onChange={(e) => setMovStartDate(e.target.value)}
                      className="bg-transparent font-semibold text-slate-800 focus:outline-hidden text-xs"
                      title="Data Inicial"
                    />
                    <span className="text-slate-400 font-bold">até</span>
                    <input
                      type="date"
                      value={movEndDate}
                      onChange={(e) => setMovEndDate(e.target.value)}
                      className="bg-transparent font-semibold text-slate-800 focus:outline-hidden text-xs"
                      title="Data Final"
                    />
                    {(movStartDate || movEndDate) && (
                      <button
                        type="button"
                        onClick={() => setQuickPeriod('clear')}
                        className="text-[10px] text-rose-600 hover:text-rose-800 font-bold ml-1 hover:underline cursor-pointer"
                        title="Limpar datas"
                      >
                        ✕ Limpar
                      </button>
                    )}
                  </div>

                  {/* Atalhos rápidos de data */}
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setQuickPeriod('today')}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-md transition-colors cursor-pointer"
                    >
                      Hoje
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickPeriod('7days')}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-md transition-colors cursor-pointer"
                    >
                      Últimos 7 dias
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickPeriod('month')}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-md transition-colors cursor-pointer"
                    >
                      Mês Atual
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-lg text-xs font-semibold">
                  <AlertCircle size={14} className="text-amber-600 shrink-0" />
                  <span>
                    Exibindo apenas produtos com estoque disponível abaixo do <strong>Estoque Mínimo</strong>
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 flex-1 justify-end min-w-[260px]">
                {/* Busca Textual */}
                <div className="relative min-w-[180px] max-w-xs flex-1">
                  <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
                  <input
                    type="text"
                    placeholder={movOnlyCritical ? 'Buscar código ou produto...' : 'Buscar código, nome ou doc...'}
                    value={movSearchProd}
                    onChange={(e) => setMovSearchProd(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:border-indigo-400"
                  />
                  {movSearchProd && (
                    <button
                      type="button"
                      onClick={() => setMovSearchProd('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Seletor de Quantidade a Listar (Padrão: Últimas 10) */}
                {!movOnlyCritical && (
                  <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs shrink-0">
                    <History size={13} className="text-indigo-600 shrink-0" />
                    <span className="font-bold text-slate-600 shrink-0">Exibir:</span>
                    <select
                      value={movLimit}
                      onChange={(e) => setMovLimit(e.target.value as any)}
                      className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                    >
                      <option value="10">Últimas 10 (Padrão)</option>
                      <option value="25">Últimas 25</option>
                      <option value="50">Últimas 50</option>
                      <option value="todos">Todas as Movimentações</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Linha 3: Resumo Informativo e Botão de Redefinição */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500 pt-0.5">
              {movOnlyCritical ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-700">
                    Mostrando <strong className="font-bold text-amber-700 font-mono">{criticalStockProducts.length}</strong> {criticalStockProducts.length === 1 ? 'produto' : 'produtos'} abaixo do estoque mínimo
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-700">
                    Mostrando <strong className="font-bold text-indigo-700 font-mono">{filteredMovements.length}</strong> de <strong className="font-bold text-slate-900 font-mono">{allFilteredMovements.length}</strong> movimentações encontradas
                  </span>
                  {movLimit === '10' && allFilteredMovements.length > 10 && (
                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200/80 px-2 py-0.5 rounded-md text-[10.5px] font-semibold">
                      <History size={11} className="text-amber-600" />
                      <span>Exibindo as 10 mais recentes</span>
                    </span>
                  )}
                  {movProductFilter !== 'todos' && (
                    <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-800 border border-indigo-200/80 px-2 py-0.5 rounded-md text-[10.5px] font-semibold">
                      <Package size={11} className="text-indigo-600" />
                      <span>Produto filtrado</span>
                    </span>
                  )}
                  {(movStartDate || movEndDate) && (
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200/80 px-2 py-0.5 rounded-md text-[10.5px] font-semibold">
                      <Calendar size={11} className="text-blue-600" />
                      <span>Período ativo</span>
                    </span>
                  )}
                </div>
              )}

              {(movOnlyCritical ||
                movCompanyFilter !== 'todos' ||
                movFilterType !== 'todos' ||
                movProductFilter !== 'todos' ||
                movStartDate ||
                movEndDate ||
                movSearchProd ||
                movLimit !== '10') && (
                <button
                  type="button"
                  onClick={() => {
                    setMovOnlyCritical(false);
                    setMovCompanyFilter('todos');
                    setMovFilterType('todos');
                    setMovProductFilter('todos');
                    setMovStartDate('');
                    setMovEndDate('');
                    setMovSearchProd('');
                    setMovLimit('10');
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw size={12} />
                  <span>{movOnlyCritical ? 'Mostrar Extrato Completo' : 'Limpar Todos os Filtros'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-[300px] overflow-auto">
            {movOnlyCritical ? (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-amber-50/90 border-b border-amber-200 text-amber-900 font-bold uppercase text-[10px] shadow-[0_1px_0_0_rgba(253,230,138,1)]">
                  <tr>
                    <th className="p-3">Código</th>
                    <th className="p-3">Produto</th>
                    <th className="p-3">Empresa</th>
                    <th className="p-3 text-right">Estoque Mínimo</th>
                    <th className="p-3 text-right">Saldo Físico</th>
                    <th className="p-3 text-right">Reservado</th>
                    <th className="p-3 text-right">Disponível</th>
                    <th className="p-3 text-right">A Repor</th>
                    <th className="p-3 text-center">Situação</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {criticalStockProducts.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-10 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2">
                          <CheckCircle size={28} className="text-emerald-500" />
                          <p className="font-bold text-slate-700">
                            Nenhum produto está abaixo do Estoque Mínimo para os filtros selecionados.
                          </p>
                          <button
                            type="button"
                            onClick={() => setMovOnlyCritical(false)}
                            className="mt-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            Ver Extrato de Movimentações
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    criticalStockProducts.map((item) => {
                      const comp = movCompanyFilter !== 'todos'
                        ? companies.find((c) => c.id === movCompanyFilter) || currentCompany
                        : null;
                      return (
                        <tr key={item.product.id} className="hover:bg-amber-50/40">
                          <td className="p-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                            {item.product.code}
                          </td>
                          <td className="p-3 font-semibold text-slate-800">
                            <div>{item.product.description}</div>
                            <span className="text-[10px] text-slate-400 uppercase font-medium">
                              {item.product.unit} • {item.product.productType}
                            </span>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 font-bold text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                              <Building2 size={11} className="text-indigo-600" />
                              <span>{comp ? (comp.tradeName || comp.name) : 'Todas as Empresas'}</span>
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-semibold text-slate-700 whitespace-nowrap">
                            {formatQuantity(item.minStock)} {item.product.unit}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-600 whitespace-nowrap">
                            {formatQuantity(item.physical)} {item.product.unit}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-500 whitespace-nowrap">
                            {formatQuantity(item.reserved)} {item.product.unit}
                          </td>
                          <td className="p-3 text-right font-mono font-extrabold text-rose-600 whitespace-nowrap">
                            {formatQuantity(item.available)} {item.product.unit}
                          </td>
                          <td className="p-3 text-right font-mono font-extrabold text-indigo-700 whitespace-nowrap">
                            +{formatQuantity(item.deficit)} {item.product.unit}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                item.available <= 0
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.available <= 0 ? 'Zerado' : 'Abaixo do Mínimo'}
                            </span>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenManualFeedingModal({
                                    companyId: item.companyId,
                                    productId: item.product.id,
                                    qty: String(Math.max(1, Math.ceil(item.deficit))),
                                    unitCost: String(item.product.costPrice ?? 0),
                                    notes: 'Reposição de estoque mínimo',
                                  })
                                }
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer"
                                title="Dar entrada manual de reposição para este produto"
                              >
                                Alimentar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMovProductFilter(item.product.id);
                                  setMovOnlyCritical(false);
                                }}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition-colors cursor-pointer"
                                title="Ver movimentações deste produto"
                              >
                                Movimentação
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                  <tr>
                    <th className="p-3">Data / Hora</th>
                    <th className="p-3">Empresa</th>
                    <th className="p-3">Produto</th>
                    <th className="p-3">Tipo de Movimento</th>
                    <th className="p-3">Local Estoque</th>
                    <th className="p-3 text-right">Quantidade</th>
                    <th className="p-3 text-right">Custo Total</th>
                    <th className="p-3">Documento Origem</th>
                    <th className="p-3">Usuário</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400">
                        Nenhuma movimentação de estoque registrada com os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((m) => {
                      const comp = companies.find((c) => c.id === m.companyId) || currentCompany;
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/80">
                          <td className="p-3 text-slate-500 whitespace-nowrap">
                            {new Date(m.date).toLocaleString('pt-BR')}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 font-bold text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                              <Building2 size={11} className="text-indigo-600" />
                              <span>{comp.tradeName || comp.name}</span>
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-slate-800">
                            <div>{m.productCode} - {m.productDescription}</div>
                            {m.isMasterPackMovement && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-300 mt-0.5">
                                Embalagem Master ({m.masterPackUnitsMultiplier} un/cx)
                              </span>
                            )}
                            {m.notes && (
                              <div className="text-[10px] text-slate-500 font-normal mt-0.5 max-w-md line-clamp-2">
                                {m.notes}
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                              m.type.includes('entrada')
                                ? 'bg-emerald-100 text-emerald-800'
                                : m.type.includes('saida') || m.type.includes('consumo')
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {m.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600 font-medium">
                            {m.locationName}
                            {m.toLocationName && ` ➔ ${m.toLocationName}`}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-900">
                            {formatQuantity(m.quantity)}
                          </td>
                          <td className="p-3 text-right font-medium text-slate-600">
                            {currentUser.permissions.canViewCosts ? formatCurrency(m.totalCost) : '••••'}
                          </td>
                          <td className="p-3 font-mono text-slate-600">{m.originDocId}</td>
                          <td className="p-3 text-slate-500">{m.userName}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modal de Criação / Edição de Local com Seleção de Empresa */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveLocation}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-800">
                {editingLocation ? 'Editar Local de Estoque' : 'Novo Local de Estoque'}
              </h3>
              <button
                type="button"
                onClick={() => setIsLocationModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Seleção de Empresa Obrigatória */}
              <div className="p-2.5 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-1">
                <label className="block font-bold text-indigo-900">Empresa Proprietária do Local *</label>
                <div className="relative">
                  <Building2 size={14} className="absolute left-2.5 top-2.5 text-indigo-600 pointer-events-none" />
                  <select
                    value={locCompanyId}
                    onChange={(e) => setLocCompanyId(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-white border border-indigo-300 rounded-lg font-bold text-indigo-950"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.tradeName || c.name} {c.type === 'matriz' ? '(Matriz)' : '(Filial)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Código do Local *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: MP-02, EXP-01"
                  value={locCode}
                  onChange={(e) => setLocCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome do Local *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Almoxarifado Central"
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo de Finalidade</label>
                <select
                  value={locType}
                  onChange={(e) => setLocType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                >
                  <option value="materia_prima">Matéria-Prima</option>
                  <option value="comercial">Comercial</option>
                  <option value="almoxarifado">Almoxarifado & Insumos</option>
                  <option value="embalagens">Embalagens & Frascos</option>
                  <option value="outros">Outros / Expedição</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Descrição / Localização Física</label>
                <textarea
                  rows={2}
                  value={locDesc}
                  onChange={(e) => setLocDesc(e.target.value)}
                  placeholder="Ex: Galpão A, Corredor 3"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsLocationModalOpen(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs"
              >
                Salvar Local
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL CRUCIAL: NOVA ALIMENTAÇÃO MANUAL DE ESTOQUE COM SELEÇÃO OBRIGATÓRIA DE EMPRESA */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleExecuteManualFeeding}
            noValidate
            className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto border border-slate-200 shadow-2xl p-6 space-y-4"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <ArrowDownLeft size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Alimentação Manual de Estoque</h3>
                  <p className="text-xs text-slate-500">Selecione a empresa para dar entrada física de mercadorias no estoque.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Campo Primordial: Empresa Selecionada para a Alimentação */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-1.5">
                <label className="block font-bold text-indigo-950 flex items-center gap-1.5">
                  <Building2 size={15} className="text-indigo-600" />
                  <span>EMPRESA BENEFICIÁRIA DA ALIMENTAÇÃO DE ESTOQUE *</span>
                </label>
                <select
                  required
                  value={manualCompanyId}
                  onChange={(e) => setManualCompanyId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg font-bold text-indigo-900 text-xs shadow-xs focus:ring-2 focus:ring-indigo-500"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.tradeName || c.name} {c.type === 'matriz' ? '(Matriz)' : '(Filial)'} - CNPJ: {c.cnpjCpf}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-indigo-700">
                  O saldo físico será creditado exclusivamente no estoque desta empresa selecionada.
                </p>
              </div>

              {/* Local de Estoque Destino */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Local de Armazenamento de Destino *</label>
                <select
                  required
                  value={manualLocationId}
                  onChange={(e) => setManualLocationId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-xs"
                >
                  <option value="">Selecione o local...</option>
                  {dbState.stockLocations
                    .filter((l) => l.companyId === manualCompanyId && l.status === 'ativo')
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} - {l.name} ({l.type})
                      </option>
                    ))}
                </select>
              </div>

              {/* Tipo de Entrada / Movimentação */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo de Entrada</label>
                  <select
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-xs"
                  >
                    <option value="entrada_compra">Entrada por Compra / Fornecedor</option>
                    <option value="devolucao">Devolução de Cliente / Estorno</option>
                    <option value="ajuste_inventario">Ajuste / Saldo Inicial Positivo</option>
                    <option value="entrada_producao">Entrada de Fabricação Própria</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Produto a Alimentar *</label>
                  <select
                    required
                    value={manualProductId}
                    onChange={(e) => {
                      setManualProductId(e.target.value);
                      const p = dbState.products.find((prod) => prod.id === e.target.value);
                      if (p) setManualUnitCost(String(p.costPrice ?? 0));
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-xs"
                  >
                    <option value="">Selecione o produto...</option>
                    {dbState.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} - {p.description} ({p.unit})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quantidade e Custo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Quantidade a Inserir *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={manualQty}
                    onChange={(e) => setManualQty(e.target.value)}
                    placeholder="Ex: 100"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Custo Unitário (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={manualUnitCost}
                    onChange={(e) => setManualUnitCost(e.target.value)}
                    placeholder="Ex: 15,50"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nota Fiscal / Motivo / Observações</label>
                <input
                  type="text"
                  placeholder="Ex: NF-e 45892 Fornecedor Químico, Bonificação inicial"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <CheckCircle size={15} />
                <span>Alimentar Estoque da Empresa</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
