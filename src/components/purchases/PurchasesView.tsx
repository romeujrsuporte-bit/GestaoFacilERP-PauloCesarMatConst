import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Truck,
  DollarSign,
  Warehouse,
  AlertCircle,
  FileCheck,
  PackageCheck,
  Calendar,
  X,
  Building2,
  Filter,
  FileCode,
  Upload,
  FileCheck2,
} from 'lucide-react';
import { Database } from '../../services/db';
import { PurchaseOrder, PurchaseOrderItem, Product, Supplier, StockLocation, AccountPayable, StockMovement, NfeImportRecord } from '../../types';
import { StockEngine } from '../../services/stockEngine';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { toast } from '../../services/toast';
import { NfeXmlImportModal } from './NfeXmlImportModal';

export const PurchasesView: React.FC<{
  initialOpenNfeModal?: boolean;
  onNavigateHome?: () => void;
}> = ({
  initialOpenNfeModal = false,
  onNavigateHome,
}) => {
  const [dbState, setDbState] = useState(Database.getState());
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilterCompanyId, setSelectedFilterCompanyId] = useState<string>('todas');
  const [activePurchasesTab, setActivePurchasesTab] = useState<'pedidos' | 'nfe_xml'>('pedidos');
  const [isNfeModalOpen, setIsNfeModalOpen] = useState(initialOpenNfeModal);

  useEffect(() => {
    setIsNfeModalOpen(initialOpenNfeModal);
  }, [initialOpenNfeModal]);

  // Modal de Novo Pedido de Compra (Alimentação de Estoque por Empresa)
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [orderCompanyId, setOrderCompanyId] = useState<string>(currentCompany.id);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('30 dias');
  const [installmentsCount, setInstallmentsCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>([]);

  // Item sendo adicionado ao pedido
  const [itemProductId, setItemProductId] = useState('');
  const [itemBuyQty, setItemBuyQty] = useState('');
  const [itemPackageFactor, setItemPackageFactor] = useState('1');
  const [itemCost, setItemCost] = useState('');
  const [itemDiscount, setItemDiscount] = useState('0');
  const [itemFreight, setItemFreight] = useState('0');
  const [itemDestLocId, setItemDestLocId] = useState('');

  // Modal de Recebimento de Mercadorias ("Receber Mercadorias")
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const [receivingCompanyId, setReceivingCompanyId] = useState<string>(currentCompany.id);
  const [receivedQuantities, setReceivedQuantities] = useState<{ [productId: string]: number }>({});
  const [receivingLocOverrides, setReceivingLocOverrides] = useState<{ [productId: string]: string }>({});
  const [generateFinancialTitles, setGenerateFinancialTitles] = useState(true);

  const suppliers = dbState.suppliers.filter((s) => s.status === 'ativo');
  const orderCompanyLocations = dbState.stockLocations.filter(
    (l) => l.companyId === orderCompanyId && l.status === 'ativo'
  );
  const locations = dbState.stockLocations.filter((l) => l.companyId === currentCompany.id);

  // Adicionar item ao pedido de compra
  const handleAddItemToOrder = () => {
    if (!itemProductId || !itemBuyQty || !itemCost) {
      alert('Selecione o produto, informe a quantidade e o custo unitário de compra.');
      return;
    }

    const prod = dbState.products.find((p) => p.id === itemProductId);
    if (!prod) return;

    const buyQty = parseFloat(itemBuyQty) || 0;
    const factor = parseFloat(itemPackageFactor) || 1;
    const cost = parseFloat(itemCost) || 0;
    const discount = parseFloat(itemDiscount) || 0;
    const freight = parseFloat(itemFreight) || 0;

    const totalItemUnits = buyQty * factor;
    const totalItemCost = Math.max(0, buyQty * cost - discount + freight);

    const newItem: PurchaseOrderItem = {
      productId: prod.id,
      productCode: prod.code,
      description: prod.description,
      buyUnit: factor > 1 ? 'CX' : prod.unit,
      saleUnit: prod.unit,
      packageFactor: factor,
      buyQuantity: buyQty,
      unitCost: cost,
      discount,
      freightApportioned: freight,
      otherExpensesApportioned: 0,
      totalCost: totalItemCost,
      receivedQuantity: 0,
      pendingQuantity: totalItemUnits,
      destinationLocationId: itemDestLocId || orderCompanyLocations[0]?.id || locations[0]?.id || 'loc-comercial',
    };

    setOrderItems([...orderItems, newItem]);
    setItemProductId('');
    setItemBuyQty('');
    setItemCost('');
    setItemDiscount('0');
    setItemFreight('0');
  };

  // Salvar Pedido de Compra (vinculado à empresa selecionada para alimentação do estoque)
  const handleSavePurchaseOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || orderItems.length === 0) {
      alert('Selecione o fornecedor e adicione itens ao pedido de compra.');
      return;
    }

    const supplier = suppliers.find((s) => s.id === selectedSupplierId);
    const subtotal = orderItems.reduce((s, i) => s + i.buyQuantity * i.unitCost, 0);
    const discountTotal = orderItems.reduce((s, i) => s + i.discount, 0);
    const freightTotal = orderItems.reduce((s, i) => s + i.freightApportioned, 0);
    const total = orderItems.reduce((s, i) => s + i.totalCost, 0);

    const pcNumber = `PC-${new Date().getFullYear()}-${String(dbState.purchaseOrders.length + 1).padStart(4, '0')}`;
    const nowIso = new Date().toISOString();

    const targetCompany = dbState.companies.find((c) => c.id === orderCompanyId) || currentCompany;

    const newOrder: PurchaseOrder = {
      id: 'PC-' + Date.now(),
      number: pcNumber,
      companyId: orderCompanyId,
      supplierId: selectedSupplierId,
      supplierName: supplier?.name || 'Fornecedor',
      orderDate: nowIso.split('T')[0],
      expectedDeliveryDate: expectedDate || nowIso.split('T')[0],
      paymentTerms,
      installmentsCount,
      status: 'aguardando_entrega',
      items: orderItems,
      subtotal,
      discountTotal,
      freightTotal,
      otherExpensesTotal: 0,
      total,
      notes,
      userId: currentUser.id,
      userName: currentUser.name,
      createdAt: nowIso,
    };

    Database.getState().purchaseOrders.unshift(newOrder);
    Database.persist();

    Database.addAuditLog(
      'CRIAR_PEDIDO_COMPRA',
      'COMPRAS',
      newOrder.id,
      `Pedido de compra ${pcNumber} criado para ${newOrder.supplierName}. Total: ${formatCurrency(total)} (Aguardando Entrega - Estoque Não Alterado)`
    );

    alert(`Pedido de compra ${pcNumber} emitido com sucesso!\nStatus: Aguardando Entrega. O estoque só será atualizado quando a mercadoria for conferida e recebida.`);
    setIsNewOrderModalOpen(false);
    setOrderItems([]);
    setSelectedSupplierId('');
    setNotes('');
  };

  // Abrir Modal de Recebimento de Mercadorias
  const handleOpenReceiving = (order: PurchaseOrder) => {
    setReceivingOrder(order);
    const chosenCompId = order.companyId || currentCompany.id;
    setReceivingCompanyId(chosenCompId);
    const initialRec: { [productId: string]: number } = {};
    const initialLocs: { [productId: string]: string } = {};
    order.items.forEach((item) => {
      initialRec[item.productId] = item.pendingQuantity;
      initialLocs[item.productId] = item.destinationLocationId || '';
    });
    setReceivedQuantities(initialRec);
    setReceivingLocOverrides(initialLocs);
  };

  // Confirmar Entrada no Estoque da Empresa Selecionada ("Receber Mercadorias")
  const handleConfirmReceiving = () => {
    if (!receivingOrder) return;

    try {
      let currentBalances = [...dbState.stockBalances];
      const movements: StockMovement[] = [];
      const nowIso = new Date().toISOString();
      let allItemsCompleted = true;
      let totalReceivedValue = 0;

      const targetCompanyId = receivingCompanyId || receivingOrder.companyId || currentCompany.id;
      const targetCompany = dbState.companies.find((c) => c.id === targetCompanyId) || currentCompany;
      const targetCompanyLocs = dbState.stockLocations.filter(
        (l) => l.companyId === targetCompanyId && l.status === 'ativo'
      );

      // 1. Atualizar estoque de cada item recebido na empresa selecionada
      const updatedItems = receivingOrder.items.map((item) => {
        const qtyToReceive = receivedQuantities[item.productId] || 0;
        if (qtyToReceive <= 0) {
          if (item.pendingQuantity > 0) allItemsCompleted = false;
          return item;
        }

        const chosenLocId = receivingLocOverrides[item.productId] || item.destinationLocationId;
        const destLoc =
          targetCompanyLocs.find((l) => l.id === chosenLocId) ||
          targetCompanyLocs[0] ||
          locations[0] || { id: 'loc-comercial', name: 'Comercial' };

        const effectiveUnitCost = item.totalCost / (item.buyQuantity * (item.packageFactor || 1));
        const itemReceivedCost = effectiveUnitCost * qtyToReceive;
        totalReceivedValue += itemReceivedCost;

        // Atualizar estoque atômico na empresa selecionada
        const { updatedBalances, createdMovement } = StockEngine.applyMovement(currentBalances, {
          companyId: targetCompanyId,
          productId: item.productId,
          productCode: item.productCode,
          productDescription: item.description,
          locationId: destLoc.id,
          locationName: destLoc.name,
          type: 'entrada_compra',
          quantity: qtyToReceive,
          unitCost: effectiveUnitCost,
          totalCost: itemReceivedCost,
          originDocType: 'compra',
          originDocId: receivingOrder.number,
          date: nowIso,
          userId: currentUser.id,
          userName: currentUser.name,
          notes: `Recebimento de mercadoria para ${targetCompany.tradeName || targetCompany.name} (Pedido ${receivingOrder.number})`,
        });

        currentBalances = updatedBalances;
        movements.push(createdMovement);

        // Atualizar custo médio do produto no cadastro
        const state = Database.getState();
        state.products = state.products.map((p) => {
          if (p.id === item.productId) {
            const newCost = Number(effectiveUnitCost.toFixed(2));
            return {
              ...p,
              costPrice: newCost,
            };
          }
          return p;
        });

        const newReceivedQty = item.receivedQuantity + qtyToReceive;
        const newPendingQty = Math.max(0, item.pendingQuantity - qtyToReceive);
        if (newPendingQty > 0) allItemsCompleted = false;

        return {
          ...item,
          receivedQuantity: newReceivedQty,
          pendingQuantity: newPendingQty,
          destinationLocationId: destLoc.id,
        };
      });

      // 2. Atualizar Status do Pedido de Compra
      const updatedStatus = allItemsCompleted ? 'concluido' : 'parcialmente_recebido';
      const updatedOrders = dbState.purchaseOrders.map((o) =>
        o.id === receivingOrder.id
          ? {
              ...o,
              companyId: targetCompanyId,
              status: updatedStatus as any,
              items: updatedItems,
            }
          : o
      );

      // 3. Integrar com Contas a Pagar vinculado à empresa compradora
      let updatedPayables = [...dbState.accountsPayable];
      if (generateFinancialTitles) {
        const installments = receivingOrder.installmentsCount || 1;
        const installmentValue = Number((totalReceivedValue / installments).toFixed(2));

        for (let i = 1; i <= installments; i++) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + i * 30);

          updatedPayables.push({
            id: 'PAG-' + Date.now() + '-' + i,
            companyId: targetCompanyId,
            purchaseOrderId: receivingOrder.id,
            purchaseOrderNumber: receivingOrder.number,
            supplierId: receivingOrder.supplierId,
            supplierName: receivingOrder.supplierName,
            description: `Compra Mercadorias ${receivingOrder.number} - ${receivingOrder.supplierName} (${targetCompany.tradeName || targetCompany.name})`,
            category: 'fornecedores',
            docNumber: `${receivingOrder.number}/${i}`,
            installmentNumber: i,
            totalInstallments: installments,
            issueDate: nowIso.split('T')[0],
            dueDate: dueDate.toISOString().split('T')[0],
            originalValue: installmentValue,
            discount: 0,
            addition: 0,
            paidValue: 0,
            balance: installmentValue,
            status: 'aberto',
            payments: [],
            notes: `Gerado na entrada física do pedido ${receivingOrder.number} p/ ${targetCompany.tradeName || targetCompany.name}`,
          });
        }
      }

      const state = Database.getState();
      state.stockBalances = currentBalances;
      state.stockMovements = [...movements, ...state.stockMovements];
      state.purchaseOrders = updatedOrders;
      state.accountsPayable = updatedPayables;
      Database.persist();

      Database.addAuditLog(
        'RECEBIMENTO_MERCADORIA',
        'COMPRAS',
        receivingOrder.id,
        `Mercadorias do pedido ${receivingOrder.number} recebidas por ${currentUser.name} para a empresa "${targetCompany.tradeName || targetCompany.name}". Estoque alimentado com sucesso.`
      );

      toast.success(
        `Recebimento do pedido ${receivingOrder.number} confirmado! O estoque da empresa "${targetCompany.tradeName || targetCompany.name}" foi devidamente alimentado.`,
        'Estoque Alimentado com Sucesso'
      );
      setReceivingOrder(null);
    } catch (e) {
      toast.error('Erro no recebimento: ' + (e as Error).message, 'Erro de Recebimento');
    }
  };

  const filteredOrders = dbState.purchaseOrders.filter((o) => {
    if (selectedFilterCompanyId !== 'todas' && o.companyId !== selectedFilterCompanyId) return false;
    return (
      searchTerm === '' ||
      o.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.supplierName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const nfeImports = Database.getNfeImportHistory(selectedFilterCompanyId);
  const filteredNfeImports = nfeImports.filter((imp) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (
      imp.nfeNumber.includes(q) ||
      imp.supplierName.toLowerCase().includes(q) ||
      imp.accessKey.includes(q) ||
      (imp.classificationsSummary && imp.classificationsSummary.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-7rem)]">
      {/* Topo */}
      <div className="shrink-0 bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <ShoppingBag className="text-indigo-600" size={20} />
            <span>Compras, Importação de NF-e (XML) & Entrada de Estoque</span>
          </h2>
          <p className="text-xs text-slate-500">
            Conecte compras aos fornecedores, importe XMLs SEFAZ com classificação no Plano de Contas e alimente o estoque individual por empresa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsNfeModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Importar nota fiscal eletrônica XML com classificação contábil no Plano de Contas"
          >
            <FileCode size={15} />
            <span>Importar NF-e (XML)</span>
          </button>

          <button
            onClick={() => {
              setIsNewOrderModalOpen(true);
              setOrderItems([]);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus size={15} />
            <span>Novo Pedido Manual</span>
          </button>
        </div>
      </div>

      {/* Sub-Abas do Módulo de Compras */}
      <div className="shrink-0 flex bg-slate-100 p-1 rounded-xl text-xs font-bold w-fit gap-1">
        <button
          onClick={() => setActivePurchasesTab('pedidos')}
          className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
            activePurchasesTab === 'pedidos'
              ? 'bg-white text-indigo-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingBag size={14} />
          <span>Pedidos de Compra ({filteredOrders.length})</span>
        </button>

        <button
          onClick={() => setActivePurchasesTab('nfe_xml')}
          className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
            activePurchasesTab === 'nfe_xml'
              ? 'bg-white text-emerald-700 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileCode size={14} />
          <span>Notas Fiscais (NF-e XML) ({filteredNfeImports.length})</span>
        </button>
      </div>

      {/* ABA 1: LISTA DE PEDIDOS DE COMPRA */}
      {activePurchasesTab === 'pedidos' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden p-4">
          <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Buscar por número do pedido ou fornecedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1 shrink-0">
                <Building2 size={14} className="text-indigo-600" />
                <span>Empresa:</span>
              </span>
              <select
                value={selectedFilterCompanyId}
                onChange={(e) => setSelectedFilterCompanyId(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
              >
                <option value="todas">Todas as Empresas</option>
                {dbState.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName || c.name} ({c.type === 'matriz' ? 'Matriz' : 'Filial'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 min-h-[300px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                <tr>
                  <th className="p-3">Nº Pedido</th>
                  <th className="p-3">Empresa Destino</th>
                  <th className="p-3">Data</th>
                  <th className="p-3">Fornecedor</th>
                  <th className="p-3">Previsão Entrega</th>
                  <th className="p-3 text-right">Itens</th>
                  <th className="p-3 text-right">Valor Total</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      Nenhum pedido de compra encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((pc) => {
                    const comp = dbState.companies.find((c) => c.id === pc.companyId) || currentCompany;
                    return (
                      <tr key={pc.id} className="hover:bg-slate-50/80">
                        <td className="p-3 font-mono font-bold text-indigo-700">{pc.number}</td>
                        <td className="p-3">
                          <span className="font-bold text-slate-800 text-xs block">{comp.tradeName || comp.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{comp.type === 'matriz' ? 'Matriz' : 'Filial'}</span>
                        </td>
                        <td className="p-3 text-slate-500">{new Date(pc.orderDate).toLocaleDateString('pt-BR')}</td>
                        <td className="p-3 font-semibold text-slate-800">{pc.supplierName}</td>
                        <td className="p-3 text-slate-600">
                          {pc.expectedDeliveryDate ? new Date(pc.expectedDeliveryDate).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="p-3 text-right font-mono">{pc.items.length} itens</td>
                        <td className="p-3 text-right font-bold text-slate-900">{formatCurrency(pc.total)}</td>
                        <td className="p-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            pc.status === 'concluido'
                              ? 'bg-emerald-100 text-emerald-800'
                              : pc.status === 'parcialmente_recebido'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {pc.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {pc.status !== 'concluido' ? (
                            <button
                              onClick={() => handleOpenReceiving(pc)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md text-[11px] shadow-xs flex items-center gap-1 mx-auto cursor-pointer"
                            >
                              <PackageCheck size={13} />
                              <span>Receber Mercadorias</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Mercadorias Entregues</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 2: NOTAS FISCAIS (NF-e XML) IMPORTADAS */}
      {activePurchasesTab === 'nfe_xml' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden p-4">
          <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Buscar por número da NF-e, fornecedor ou chave..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1 shrink-0">
                <Building2 size={14} className="text-emerald-600" />
                <span>Empresa:</span>
              </span>
              <select
                value={selectedFilterCompanyId}
                onChange={(e) => setSelectedFilterCompanyId(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
              >
                <option value="todas">Todas as Empresas</option>
                {dbState.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName || c.name} ({c.type === 'matriz' ? 'Matriz' : 'Filial'})
                  </option>
                ))}
              </select>

              <button
                onClick={() => setIsNfeModalOpen(true)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center gap-1 cursor-pointer ml-1"
              >
                <FileCode size={14} />
                <span>+ Importar XML</span>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-[300px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                <tr>
                  <th className="p-3">Nº NF-e / Chave</th>
                  <th className="p-3">Empresa Destino</th>
                  <th className="p-3">Data Emissão</th>
                  <th className="p-3">Importado em</th>
                  <th className="p-3">Fornecedor</th>
                  <th className="p-3">Classificação Contábil</th>
                  <th className="p-3 text-right">Itens</th>
                  <th className="p-3 text-right">Valor Total</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredNfeImports.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      Nenhuma NF-e importada ainda.{' '}
                      <button
                        onClick={() => setIsNfeModalOpen(true)}
                        className="text-emerald-700 font-bold underline hover:text-emerald-900 cursor-pointer"
                      >
                        Clique aqui para importar o primeiro arquivo XML.
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredNfeImports.map((imp) => (
                    <tr key={imp.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-mono">
                        <span className="font-bold text-emerald-800 text-xs block">NF-e {imp.nfeNumber}</span>
                        <span className="text-[10px] text-slate-400 truncate max-w-[120px] block" title={imp.accessKey}>
                          {imp.accessKey.substring(0, 15)}...
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-slate-800 block">{imp.companyName}</span>
                      </td>
                      <td className="p-3 text-slate-600">
                        {new Date(imp.issueDate).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="p-3 text-slate-500">
                        {new Date(imp.importDate).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-800 block">{imp.supplierName}</span>
                        <span className="font-mono text-[10px] text-slate-400">{imp.supplierCnpj}</span>
                      </td>
                      <td className="p-3">
                        <span className="text-[11px] text-slate-600 line-clamp-2 max-w-xs" title={imp.classificationsSummary}>
                          {imp.classificationsSummary || 'Classificado'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-slate-700">{imp.itemsCount} itens</td>
                      <td className="p-3 text-right font-extrabold text-slate-900">{formatCurrency(imp.totalValue)}</td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 size={11} className="text-emerald-600" />
                          <span>Estoque Alimentado</span>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Novo Pedido de Compra */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleSavePurchaseOrder}
            className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <ShoppingBag size={18} className="text-indigo-600" />
                <span>Novo Pedido de Compra</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsNewOrderModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {/* Seleção Obrigatória da Empresa para Alimentação do Estoque */}
            <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1.5">
              <label className="block font-bold text-indigo-900 text-xs flex items-center gap-1.5">
                <Building2 size={15} className="text-indigo-600" />
                <span>Empresa Selecionada para Alimentação do Estoque *</span>
              </label>
              <select
                required
                value={orderCompanyId}
                onChange={(e) => {
                  const newCompId = e.target.value;
                  setOrderCompanyId(newCompId);
                  const compLocs = dbState.stockLocations.filter(
                    (l) => l.companyId === newCompId && l.status === 'ativo'
                  );
                  setItemDestLocId(compLocs[0]?.id || '');
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
                Selecione a empresa responsável pela compra. Os produtos alimentarão exclusivamente os depósitos de estoque desta empresa.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Fornecedor *</label>
                <select
                  required
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold"
                >
                  <option value="">Selecione o fornecedor...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.contactName || s.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Previsão de Entrega</label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Condição de Pagamento</label>
                <input
                  type="text"
                  placeholder="Ex: 28/56 dias, 30 dias"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Número de Parcelas</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={installmentsCount}
                  onChange={(e) => setInstallmentsCount(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                />
              </div>
            </div>

            {/* Adicionar Itens ao Pedido */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Adicionar Produto ao Pedido
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                <div className="sm:col-span-5">
                  <label className="block font-semibold text-slate-600 mb-1">Produto *</label>
                  <select
                    value={itemProductId}
                    onChange={(e) => {
                      setItemProductId(e.target.value);
                      const p = dbState.products.find((prod) => prod.id === e.target.value);
                      if (p) {
                        setItemCost(String(p.costPrice));
                        setItemDestLocId(p.defaultLocationId || orderCompanyLocations[0]?.id || locations[0]?.id || '');
                      }
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium"
                  >
                    <option value="">Selecione o produto...</option>
                    {dbState.products
                      .filter((p) => p.status === 'ativo')
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} - {p.description} ({p.unit})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-600 mb-1">Qtd Compra *</label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    placeholder="Ex: 10"
                    value={itemBuyQty}
                    onChange={(e) => setItemBuyQty(e.target.value)}
                    className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg font-bold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-600 mb-1">Fator Embalagem</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1 un/cx"
                    value={itemPackageFactor}
                    onChange={(e) => setItemPackageFactor(e.target.value)}
                    className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-600 mb-1">Custo Compra (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={itemCost}
                    onChange={(e) => setItemCost(e.target.value)}
                    className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg font-bold"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block font-semibold text-slate-600 mb-1">Local Destino na Empresa</label>
                  <select
                    value={itemDestLocId}
                    onChange={(e) => setItemDestLocId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 font-medium"
                  >
                    {orderCompanyLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-600 mb-1">Desconto (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={itemDiscount}
                    onChange={(e) => setItemDiscount(e.target.value)}
                    className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-600 mb-1">Frete Rateado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={itemFreight}
                    onChange={(e) => setItemFreight(e.target.value)}
                    className="w-full px-2 py-2 bg-white border border-slate-200 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-2 flex items-end">
                  <button
                    type="button"
                    onClick={handleAddItemToOrder}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg"
                  >
                    + Adicionar
                  </button>
                </div>
              </div>
            </div>

            {/* Grade de Itens Adicionados */}
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Código</th>
                    <th className="p-2.5">Descrição</th>
                    <th className="p-2.5 text-right">Qtd</th>
                    <th className="p-2.5 text-right">Custo Unit.</th>
                    <th className="p-2.5 text-right">Total Item</th>
                    <th className="p-2.5 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orderItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">
                        Nenhum item adicionado ao pedido de compra ainda.
                      </td>
                    </tr>
                  ) : (
                    orderItems.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-mono font-bold text-slate-600">{item.productCode}</td>
                        <td className="p-2.5 font-semibold text-slate-800">{item.description}</td>
                        <td className="p-2.5 text-right font-bold">
                          {formatQuantity(item.buyQuantity)} {item.buyUnit} ({formatQuantity(item.buyQuantity * (item.packageFactor || 1))} {item.saleUnit})
                        </td>
                        <td className="p-2.5 text-right text-slate-600">{formatCurrency(item.unitCost)}</td>
                        <td className="p-2.5 text-right font-bold text-indigo-700">{formatCurrency(item.totalCost)}</td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Total */}
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-500 italic">
                * Importante: O estoque físico NÃO será alterado até o recebimento efetivo das mercadorias.
              </span>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Total do Pedido:</span>
                <span className="text-base font-extrabold text-slate-900">
                  {formatCurrency(orderItems.reduce((s, i) => s + i.totalCost, 0))}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewOrderModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={orderItems.length === 0}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg shadow-xs"
              >
                Emitir Pedido de Compra
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Receber Mercadorias (Conferência Física e Entrada no Estoque) */}
      {receivingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                  <PackageCheck size={18} className="text-emerald-600" />
                  <span>Receber Mercadorias: Pedido {receivingOrder.number}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Fornecedor: <strong className="text-slate-700">{receivingOrder.supplierName}</strong>
                </p>
              </div>
              <button
                onClick={() => setReceivingOrder(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Seleção Obrigatória da Empresa para Alimentação do Estoque Físico */}
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl space-y-1">
                <label className="block font-bold text-emerald-950 text-xs flex items-center gap-1.5">
                  <Building2 size={14} className="text-emerald-700" />
                  <span>Empresa Selecionada para Alimentação do Estoque *</span>
                </label>
                <select
                  value={receivingCompanyId}
                  onChange={(e) => {
                    const newCompId = e.target.value;
                    setReceivingCompanyId(newCompId);
                    const compLocs = dbState.stockLocations.filter(
                      (l) => l.companyId === newCompId && l.status === 'ativo'
                    );
                    const updatedLocs: { [productId: string]: string } = {};
                    receivingOrder.items.forEach((item) => {
                      updatedLocs[item.productId] = compLocs[0]?.id || 'loc-comercial';
                    });
                    setReceivingLocOverrides(updatedLocs);
                  }}
                  className="w-full bg-white border border-emerald-300 rounded-lg p-2 font-bold text-slate-800 text-xs shadow-xs focus:ring-2 focus:ring-emerald-500"
                >
                  {dbState.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.tradeName || c.name} ({c.type === 'matriz' ? 'Matriz' : 'Filial'}) • CNPJ: {c.cnpjCpf}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-emerald-800">
                  O estoque físico e os saldos dos depósitos serão alimentados exclusivamente na empresa selecionada acima.
                </p>
              </div>

              <span className="font-bold text-slate-700 uppercase block">
                Conferência de Quantidades Entregues
              </span>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden p-2">
                {receivingOrder.items.map((item) => {
                  const compLocs = dbState.stockLocations.filter(
                    (l) => l.companyId === receivingCompanyId && l.status === 'ativo'
                  );
                  const selectedLocId = receivingLocOverrides[item.productId] || item.destinationLocationId || compLocs[0]?.id || 'loc-comercial';
                  return (
                    <div key={item.productId} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-bold text-slate-800">{item.description}</div>
                        <div className="text-[11px] text-slate-400">
                          Total Comprado: {formatQuantity(item.buyQuantity * (item.packageFactor || 1))} {item.saleUnit} • Já recebido: {formatQuantity(item.receivedQuantity)} • Pendente: {formatQuantity(item.pendingQuantity)}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-500">Depósito Destino:</span>
                          <select
                            value={selectedLocId}
                            onChange={(e) =>
                              setReceivingLocOverrides({
                                ...receivingLocOverrides,
                                [item.productId]: e.target.value,
                              })
                            }
                            className="bg-slate-50 border border-slate-300 rounded px-2 py-0.5 text-[11px] font-bold text-indigo-700"
                          >
                            {compLocs.map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.name} ({loc.code})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 font-medium">Qtd Entregue Agora:</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max={item.pendingQuantity}
                          value={receivedQuantities[item.productId] ?? item.pendingQuantity}
                          onChange={(e) =>
                            setReceivedQuantities({
                              ...receivedQuantities,
                              [item.productId]: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-24 px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-center font-bold text-slate-900"
                        />
                        <span className="font-semibold text-slate-600">{item.saleUnit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Opção de Geração Financeira */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={generateFinancialTitles}
                    onChange={(e) => setGenerateFinancialTitles(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded-sm"
                  />
                  <span>Gerar Contas a Pagar automaticamente vinculado a esta compra ({receivingOrder.paymentTerms})</span>
                </label>
                <p className="text-[11px] text-slate-500 pl-6">
                  Cria o título financeiro no Contas a Pagar para pagamento ao fornecedor conforme parcelamento negociado.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReceivingOrder(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmReceiving}
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs flex items-center gap-1.5"
              >
                <PackageCheck size={16} />
                <span>Confirmar Entrada Física e Atualizar Estoque</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Importação de NF-e (XML) Integrado */}
      <NfeXmlImportModal
        isOpen={isNfeModalOpen}
        onClose={() => setIsNfeModalOpen(false)}
        onCancel={() => {
          setIsNfeModalOpen(false);
          if (onNavigateHome) {
            onNavigateHome();
          }
        }}
        onSuccess={() => {
          setDbState({ ...Database.getState() });
          setActivePurchasesTab('nfe_xml');
        }}
      />
    </div>
  );
};
