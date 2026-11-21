import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  RotateCcw,
  Sparkles,
  Info,
  Layers,
  ArrowRight,
  Boxes,
  FileCode,
} from 'lucide-react';
import { Database } from '../../services/db';
import { ExcelService, ImportPreview, StockImportRow } from '../../services/excelService';
import { Product, Customer, CityItem, NeighborhoodItem } from '../../types';
import { formatCurrency } from '../../services/pricingEngine';
import { FirebaseSyncService } from '../../services/firebaseSync';
import { toast } from '../../services/toast';
import { NfeXmlImportModal } from '../purchases/NfeXmlImportModal';

export const ExcelToolsView: React.FC<{ onNavigateHome?: () => void }> = ({ onNavigateHome }) => {
  const [dbState, setDbState] = useState(Database.getState());
  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);
  const currentCompany = Database.getCurrentCompany();
  const currentUser = Database.getCurrentUser();

  const [importType, setImportType] = useState<'produtos' | 'clientes' | 'estoque' | 'cidades' | 'bairros'>('produtos');
  const [importMode, setImportMode] = useState<'insert_only' | 'insert_update'>('insert_update');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<ImportPreview<any> | null>(null);
  const [importedSuccessMsg, setImportedSuccessMsg] = useState<string | null>(null);
  const [isNfeModalOpen, setIsNfeModalOpen] = useState(false);

  // Downloads dos Modelos Oficiais em Excel (.xlsx) com a coluna Empresa (Matriz e Filiais)
  const handleDownloadTemplate = (
    type: 'produtos' | 'clientes' | 'fornecedores' | 'compras' | 'estoque' | 'bairros' | 'cidades'
  ) => {
    switch (type) {
      case 'produtos':
        ExcelService.downloadExcel(
          ExcelService.generateProductTemplate(dbState.stockLocations, dbState.companies),
          'Modelo_Oficial_Importacao_Produtos.xlsx'
        );
        break;
      case 'clientes':
        ExcelService.downloadExcel(
          ExcelService.generateCustomerTemplate(dbState.companies),
          'Modelo_Oficial_Importacao_Clientes.xlsx'
        );
        break;
      case 'fornecedores':
        ExcelService.downloadExcel(
          ExcelService.generateSupplierTemplate(dbState.companies),
          'Modelo_Oficial_Importacao_Fornecedores.xlsx'
        );
        break;
      case 'compras':
        ExcelService.downloadExcel(
          ExcelService.generatePurchaseOrderTemplate(dbState.companies),
          'Modelo_Oficial_Importacao_Pedidos_Compra.xlsx'
        );
        break;
      case 'estoque':
        ExcelService.downloadExcel(
          ExcelService.generateInitialStockTemplate(dbState.stockLocations, dbState.companies),
          'Modelo_Oficial_Carga_Inicial_Estoque.xlsx'
        );
        break;
      case 'bairros':
        ExcelService.downloadExcel(
          ExcelService.generateNeighborhoodsTemplate(dbState.companies),
          'Modelo_Oficial_Importacao_Bairros.xlsx'
        );
        break;
      case 'cidades':
        ExcelService.downloadExcel(
          ExcelService.generateCitiesTemplate(dbState.companies),
          'Modelo_Oficial_Importacao_Cidades.xlsx'
        );
        break;
    }
  };

  // Exportações com a coluna Empresa
  const handleExportData = (type: 'produtos' | 'clientes' | 'bairros' | 'cidades') => {
    const dateSuffix = new Date().toISOString().split('T')[0];
    if (type === 'produtos') {
      ExcelService.exportProducts(
        dbState.products,
        dbState.stockLocations,
        `Exportacao_Produtos_Empresas_${dateSuffix}.xlsx`,
        dbState.companies
      );
    } else if (type === 'clientes') {
      ExcelService.exportCustomers(
        dbState.customers,
        `Exportacao_Clientes_Empresas_${dateSuffix}.xlsx`,
        dbState.companies
      );
    } else if (type === 'bairros') {
      ExcelService.exportNeighborhoods(
        dbState.neighborhoods || [],
        `Exportacao_Bairros_${dateSuffix}.xlsx`,
        dbState.companies
      );
    } else {
      ExcelService.exportCities(
        dbState.cities || [],
        `Exportacao_Cidades_${dateSuffix}.xlsx`,
        dbState.companies
      );
    }
  };

  // Leitura do Arquivo Excel Enviado
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingFile(true);
    setImportedSuccessMsg(null);

    try {
      const rows = await ExcelService.parseExcelFile(file);

      if (rows.length === 0) {
        toast.error('A planilha enviada está vazia ou não possui linhas de dados.');
        setIsLoadingFile(false);
        return;
      }

      if (importType === 'produtos') {
        const preview = ExcelService.validateProductsImport(
          rows,
          dbState.products,
          dbState.stockLocations,
          importMode,
          dbState.companies
        );
        setParsedPreview(preview);
      } else if (importType === 'clientes') {
        const preview = ExcelService.validateCustomersImport(
          rows,
          dbState.customers,
          importMode
        );
        setParsedPreview(preview);
      } else if (importType === 'estoque') {
        const preview = ExcelService.validateInitialStockImport(
          rows,
          dbState.products,
          dbState.stockLocations,
          dbState.companies
        );
        setParsedPreview(preview);
      } else if (importType === 'cidades') {
        const preview = ExcelService.validateCitiesImport(
          rows,
          dbState.cities || [],
          dbState.marketAreas || [],
          dbState.deliveryRoutes || [],
          importMode
        );
        setParsedPreview(preview);
      } else if (importType === 'bairros') {
        const preview = ExcelService.validateNeighborhoodsImport(
          rows,
          dbState.neighborhoods || [],
          dbState.marketAreas || [],
          dbState.deliveryRoutes || [],
          importMode
        );
        setParsedPreview(preview);
      }
    } catch (err) {
      toast.error('Erro ao carregar arquivo Excel: ' + (err as Error).message);
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Efetivar Importação
  const handleConfirmImport = () => {
    if (!parsedPreview || parsedPreview.validRows.length === 0) {
      toast.error('Não há registros válidos para importar.');
      return;
    }

    const state = Database.getState();

    if (importType === 'produtos') {
      const validProds = parsedPreview.validRows as (Partial<Product> & { targetCompanyId?: string; targetCompanyName?: string })[];

      validProds.forEach((prodData, importIdx) => {
        const existingIdx = state.products.findIndex((p) => p.code.toUpperCase() === prodData.code?.toUpperCase());

        if (existingIdx >= 0) {
          const currentProd = state.products[existingIdx];

          // Se a linha importada trouxer tabela de preço para uma filial específica
          let mergedCompanyPrices = { ...(currentProd.companyPrices || {}) };
          if (prodData.companyPrices) {
            mergedCompanyPrices = { ...mergedCompanyPrices, ...prodData.companyPrices };
          }

          // Se for filial, não sobrescreve o preço base da matriz; apenas atualiza a filial
          const isFilialSpecificRow = !!prodData.targetCompanyId && prodData.targetCompanyId !== 'comp-matriz';

          state.products[existingIdx] = {
            ...currentProd,
            referenceCode: prodData.referenceCode !== undefined ? prodData.referenceCode : currentProd.referenceCode,
            description: prodData.description || currentProd.description,
            unit: prodData.unit || currentProd.unit,
            family: prodData.family || currentProd.family,
            group: prodData.group || currentProd.group,
            barcode: prodData.barcode || currentProd.barcode,
            costPrice: isFilialSpecificRow ? currentProd.costPrice : (prodData.costPrice ?? currentProd.costPrice),
            salePrice: isFilialSpecificRow ? currentProd.salePrice : (prodData.salePrice ?? currentProd.salePrice),
            minStock: isFilialSpecificRow ? currentProd.minStock : (prodData.minStock ?? currentProd.minStock),
            companyPrices: mergedCompanyPrices,
            isMasterPack: !!prodData.isMasterPack,
            masterPackAssociatedProductId: prodData.masterPackAssociatedProductId || currentProd.masterPackAssociatedProductId,
            masterPackAssociatedProductCode: prodData.masterPackAssociatedProductCode || currentProd.masterPackAssociatedProductCode,
            masterPackAssociatedProductDescription: prodData.masterPackAssociatedProductDescription || currentProd.masterPackAssociatedProductDescription,
            masterPackUnits: prodData.masterPackUnits || currentProd.masterPackUnits,
            masterPackPackagingType: prodData.masterPackPackagingType || currentProd.masterPackPackagingType,
          };
        } else {
          // Inserir novo produto centralizado
          const newProd: Product = {
            id: 'PROD-' + Date.now() + '-' + importIdx + '-' + Math.random().toString(36).substring(2, 10),
            code: prodData.code!,
            referenceCode: prodData.referenceCode || '',
            description: prodData.description!,
            unit: prodData.unit || 'UN',
            costPrice: prodData.costPrice || 0,
            salePrice: prodData.salePrice || 0,
            family: prodData.family || 'Geral',
            group: prodData.group || 'Geral',
            barcode: prodData.barcode || '',
            minStock: prodData.minStock || 0,
            productType: prodData.productType || 'revenda',
            hasComposition: !!prodData.hasComposition,
            defaultLocationId: prodData.defaultLocationId || dbState.stockLocations[0]?.id || 'loc-comercial',
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
            companyPrices: prodData.companyPrices || {},
          };
          state.products.unshift(newProd);

          // Saldo inicial no local
          state.stockBalances.push({
            productId: newProd.id,
            locationId: newProd.defaultLocationId,
            quantity: 0,
            reserved: 0,
            minStock: newProd.minStock,
          });
        }
      });

      // Segunda passagem: Resolver ID de produtos unitários para Embalagens Master importadas no mesmo arquivo
      state.products.forEach((prod) => {
        if (prod.isMasterPack && !prod.masterPackAssociatedProductId && prod.masterPackAssociatedProductCode) {
          const matchedTarget = state.products.find(
            (p) => p.code.toUpperCase() === prod.masterPackAssociatedProductCode?.toUpperCase() && p.id !== prod.id
          );
          if (matchedTarget) {
            prod.masterPackAssociatedProductId = matchedTarget.id;
            if (!prod.masterPackAssociatedProductDescription) {
              prod.masterPackAssociatedProductDescription = matchedTarget.description;
            }
          }
        }
      });

      Database.addAuditLog(
        'IMPORTACAO_PLANILHA_PRODUTOS',
        'IMPORTACAO',
        'PRODUTOS',
        `Importação de ${validProds.length} produtos (com preços por empresa Matriz/Filial) concluída por ${currentUser.name}`
      );
    } else if (importType === 'clientes') {
      const validCusts = parsedPreview.validRows as Partial<Customer>[];

      validCusts.forEach((custData) => {
        const existingIdx = state.customers.findIndex((c) => c.code.toUpperCase() === custData.code?.toUpperCase());

        if (existingIdx >= 0 && importMode === 'insert_update') {
          state.customers[existingIdx] = {
            ...state.customers[existingIdx],
            ...custData,
          } as Customer;
        } else if (existingIdx < 0) {
          const newCust: Customer = {
            id: 'CLI-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
            code: custData.code!,
            name: custData.name!,
            tradeName: custData.tradeName || '',
            type: custData.type || 'PF',
            cpfCnpj: custData.cpfCnpj || '',
            phone: custData.phone || '',
            whatsapp: custData.whatsapp || '',
            email: custData.email || '',
            zipCode: custData.zipCode || '',
            street: custData.street || '',
            number: custData.number || '',
            neighborhood: custData.neighborhood || '',
            city: custData.city || 'Feira de Santana',
            state: custData.state || 'BA',
            creditLimit: custData.creditLimit || 0,
            preferredPaymentMethod: custData.preferredPaymentMethod || 'À Vista',
            status: custData.status || 'ativo',
            notes: custData.notes || '',
          };
          state.customers.unshift(newCust);
        }
      });

      Database.addAuditLog(
        'IMPORTACAO_PLANILHA_CLIENTES',
        'IMPORTACAO',
        'CLIENTES',
        `Importação de ${validCusts.length} clientes concluída por ${currentUser.name}`
      );
    } else if (importType === 'estoque') {
      const validStock = parsedPreview.validRows as StockImportRow[];

      validStock.forEach((stk) => {
        const existingBal = state.stockBalances.find(
          (b) => b.productId === stk.productId && b.locationId === stk.locationId
        );

        const oldQty = existingBal ? existingBal.quantity : 0;
        const diff = stk.quantity - oldQty;

        if (existingBal) {
          existingBal.quantity = stk.quantity;
          if (stk.minStock !== undefined) existingBal.minStock = stk.minStock;
        } else {
          state.stockBalances.push({
            productId: stk.productId,
            locationId: stk.locationId,
            quantity: stk.quantity,
            reserved: 0,
            minStock: stk.minStock,
          });
        }

        // Registrar movimentação de ajuste no histórico
        if (diff !== 0) {
          const matchedProd = state.products.find((p) => p.id === stk.productId);
          const unitCost = matchedProd?.costPrice || 0;
          state.stockMovements.unshift({
            id: 'mov-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            companyId: stk.companyId,
            productId: stk.productId,
            productCode: stk.productCode,
            productDescription: stk.productDescription,
            locationId: stk.locationId,
            locationName: stk.locationName,
            type: diff > 0 ? 'inicial' : 'ajuste_inventario',
            quantity: Math.abs(diff),
            unitCost,
            totalCost: Math.abs(diff) * unitCost,
            originDocType: 'inventario',
            originDocId: 'CARGA-EXCEL-' + Date.now(),
            date: stk.referenceDate || new Date().toISOString(),
            userId: currentUser.id,
            userName: currentUser.name,
            notes: `Carga de Estoque por Planilha (${stk.companyName}) - ${stk.notes || 'Implantação'}`,
          });
        }
      });

      Database.addAuditLog(
        'IMPORTACAO_CARGA_ESTOQUE_EMPRESAS',
        'ESTOQUE',
        'INVENTARIO',
        `Carga inicial de estoque aplicada para ${validStock.length} itens entre Matriz e Filiais por ${currentUser.name}`
      );
    } else if (importType === 'cidades') {
      const validCities = parsedPreview.validRows as Partial<CityItem>[];
      if (!state.cities) state.cities = [];
      const nowIso = new Date().toISOString();

      validCities.forEach((cityData) => {
        const key = `${(cityData.name || '').trim().toLowerCase()}|${(cityData.stateUf || 'BA').trim().toUpperCase()}`;
        const existingIdx = state.cities!.findIndex(
          (c) => `${c.name.trim().toLowerCase()}|${c.stateUf.trim().toUpperCase()}` === key
        );

        if (existingIdx >= 0 && importMode === 'insert_update') {
          const prev = state.cities![existingIdx];
          state.cities![existingIdx] = {
            ...prev,
            ibgeCode: cityData.ibgeCode || prev.ibgeCode,
            distanceKm: cityData.distanceKm !== undefined ? cityData.distanceKm : prev.distanceKm,
            marketAreaId: cityData.marketAreaId || prev.marketAreaId,
            marketAreaName: cityData.marketAreaName || prev.marketAreaName,
            defaultRouteId: cityData.defaultRouteId || prev.defaultRouteId,
            defaultRouteName: cityData.defaultRouteName || prev.defaultRouteName,
            active: cityData.active ?? prev.active,
            updatedAt: nowIso,
          };
        } else if (existingIdx < 0 && cityData.name) {
          const newCity: CityItem = {
            id: 'cid-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
            name: cityData.name.trim(),
            stateUf: (cityData.stateUf || 'BA').trim().toUpperCase(),
            marketAreaId: cityData.marketAreaId || '',
            marketAreaName: cityData.marketAreaName || '',
            defaultRouteId: cityData.defaultRouteId || '',
            defaultRouteName: cityData.defaultRouteName || '',
            ibgeCode: cityData.ibgeCode || '',
            distanceKm: cityData.distanceKm,
            isSystemDefault: cityData.isSystemDefault ?? ((cityData.stateUf || 'BA').toUpperCase() === 'BA'),
            active: cityData.active ?? true,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          state.cities!.push(newCity);
        }
      });

      state.cities.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      try {
        localStorage.removeItem('gestaofacil_erp_cities_cleared');
      } catch {}

      Database.addAuditLog(
        'IMPORTACAO_PLANILHA_CIDADES',
        'IMPORTACAO',
        'CIDADES',
        `Importação de ${validCities.length} cidade(s) concluída por ${currentUser.name}`
      );
    } else if (importType === 'bairros') {
      const validNeighborhoods = parsedPreview.validRows as Partial<NeighborhoodItem>[];
      if (!state.neighborhoods) state.neighborhoods = [];
      const nowIso = new Date().toISOString();

      validNeighborhoods.forEach((nbData) => {
        const key = `${(nbData.name || '').trim().toLowerCase()}|${(nbData.cityName || '').trim().toLowerCase()}|${(nbData.stateUf || 'BA').trim().toUpperCase()}`;
        const existingIdx = state.neighborhoods!.findIndex(
          (n) =>
            `${n.name.trim().toLowerCase()}|${n.cityName.trim().toLowerCase()}|${n.stateUf.trim().toUpperCase()}` ===
            key
        );

        if (existingIdx >= 0 && importMode === 'insert_update') {
          const prev = state.neighborhoods![existingIdx];
          state.neighborhoods![existingIdx] = {
            ...prev,
            zipCodePrefix: nbData.zipCodePrefix || prev.zipCodePrefix,
            marketAreaId: nbData.marketAreaId || prev.marketAreaId,
            marketAreaName: nbData.marketAreaName || prev.marketAreaName,
            defaultRouteId: nbData.defaultRouteId || prev.defaultRouteId,
            defaultRouteName: nbData.defaultRouteName || prev.defaultRouteName,
            active: nbData.active ?? prev.active,
            updatedAt: nowIso,
          };
        } else if (existingIdx < 0 && nbData.name && nbData.cityName) {
          const newNb: NeighborhoodItem = {
            id: 'bai-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
            name: nbData.name.trim(),
            cityName: nbData.cityName.trim(),
            stateUf: (nbData.stateUf || 'BA').trim().toUpperCase(),
            zipCodePrefix: nbData.zipCodePrefix || '',
            marketAreaId: nbData.marketAreaId || '',
            marketAreaName: nbData.marketAreaName || '',
            defaultRouteId: nbData.defaultRouteId || '',
            defaultRouteName: nbData.defaultRouteName || '',
            active: nbData.active ?? true,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          state.neighborhoods!.unshift(newNb);
        }
      });

      try {
        localStorage.removeItem('gestaofacil_erp_neighborhoods_cleared');
      } catch {}

      Database.addAuditLog(
        'IMPORTACAO_PLANILHA_BAIRROS',
        'IMPORTACAO',
        'BAIRROS',
        `Importação de ${validNeighborhoods.length} bairro(s) concluída por ${currentUser.name}`
      );
    }

    Database.persist();
    FirebaseSyncService.syncToFirebase().catch(console.error);

    setImportedSuccessMsg(
      `Importação concluída com êxito! ${parsedPreview.summary.validCount} registro(s) processados (${parsedPreview.summary.toInsertCount} inseridos, ${parsedPreview.summary.toUpdateCount} atualizados).`
    );
    setParsedPreview(null);
  };

  return (
    <div className="space-y-4">
      {/* Topo com Ações de Exportação */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="text-emerald-600" size={20} />
            <span>Central de Importação e Exportação por Planilhas Excel (.xlsx / .xls)</span>
          </h2>
          <p className="text-xs text-slate-500">
            Modelos oficiais com a coluna <strong>Empresa</strong> para gestão independente de estoque e tabelas de preços entre Matriz e Filiais.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExportData('produtos')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Exporta catálogo completo com preços de Matriz e Filiais"
          >
            <Download size={14} className="text-emerald-600" />
            <span>Exportar Produtos (com Empresa)</span>
          </button>
          <button
            onClick={() => handleExportData('clientes')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Exporta clientes cadastrados com a coluna Empresa"
          >
            <Download size={14} className="text-blue-600" />
            <span>Exportar Clientes</span>
          </button>
          <button
            onClick={() => handleExportData('bairros')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Exporta bairros cadastrados com cidades e rotas"
          >
            <Download size={14} className="text-indigo-600" />
            <span>Exportar Bairros</span>
          </button>
          <button
            onClick={() => handleExportData('cidades')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Exporta cidades cadastradas com IBGE, praças e rotas"
          >
            <Download size={14} className="text-amber-600" />
            <span>Exportar Cidades</span>
          </button>
        </div>
      </div>

      {/* Destaque: Importação de NF-e (XML da SEFAZ) */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-indigo-500/5 to-transparent p-5 rounded-2xl border border-emerald-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-xs">
            <FileCode size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-800">
                Importação Direta de NF-e (XML SEFAZ Layout 4.00)
              </h3>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full uppercase">
                Integrado ao Plano de Contas
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl">
              Alimente o estoque individual da empresa (Matriz ou Filial), classifique os itens individualmente ou em lote com o código de 3 dígitos do Plano de Contas e gere automaticamente o Contas a Pagar com rateio contábil.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsNfeModalOpen(true)}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer shrink-0"
        >
          <FileCode size={15} />
          <span>Importar Arquivo XML</span>
        </button>
      </div>

      {/* Modelos Oficiais para Download */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Download size={15} className="text-blue-600" />
              <span>Modelos Oficiais de Planilha para Preenchimento</span>
            </h3>
            <p className="text-xs text-slate-500">
              Todos os modelos oficiais incluem a coluna <strong className="text-blue-600">"Empresa"</strong> para permitir saldos de estoque e tabelas de preço individualizados por unidade.
            </p>
          </div>
          <span className="self-start sm:self-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
            <CheckCircle2 size={12} />
            Coluna "Empresa" Ativa
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1">
          <button
            onClick={() => handleDownloadTemplate('produtos')}
            className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition-all group relative cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <FileSpreadsheet size={20} className="text-emerald-600 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Coluna Empresa</span>
            </div>
            <div className="font-bold text-xs text-slate-800">Modelo Produtos</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Preços e estoques da Matriz e Filiais</div>
          </button>

          <button
            onClick={() => handleDownloadTemplate('clientes')}
            className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition-all group relative cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <FileSpreadsheet size={20} className="text-emerald-600 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Coluna Empresa</span>
            </div>
            <div className="font-bold text-xs text-slate-800">Modelo Clientes</div>
            <div className="text-[10px] text-slate-500 mt-0.5">PF/PJ, limites e coluna Empresa</div>
          </button>

          <button
            onClick={() => handleDownloadTemplate('fornecedores')}
            className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition-all group relative cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <FileSpreadsheet size={20} className="text-emerald-600 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Coluna Empresa</span>
            </div>
            <div className="font-bold text-xs text-slate-800">Modelo Fornecedores</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Prazos, bancos e coluna Empresa</div>
          </button>

          <button
            onClick={() => handleDownloadTemplate('compras')}
            className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition-all group relative cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <FileSpreadsheet size={20} className="text-emerald-600 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Coluna Empresa</span>
            </div>
            <div className="font-bold text-xs text-slate-800">Modelo Ped. Compra</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Linhas e Empresa destinatária</div>
          </button>

          <button
            onClick={() => handleDownloadTemplate('estoque')}
            className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition-all group relative cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <FileSpreadsheet size={20} className="text-emerald-600 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Coluna Empresa</span>
            </div>
            <div className="font-bold text-xs text-slate-800">Carga Inicial Estoque</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Saldos por Empresa (Matriz/Filiais)</div>
          </button>

          <button
            onClick={() => handleDownloadTemplate('bairros')}
            className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition-all group relative cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <FileSpreadsheet size={20} className="text-emerald-600 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Coluna Empresa</span>
            </div>
            <div className="font-bold text-xs text-slate-800">Modelo Bairros</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Bairros, Cidades, faixa CEP e Rotas</div>
          </button>

          <button
            onClick={() => handleDownloadTemplate('cidades')}
            className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition-all group relative cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <FileSpreadsheet size={20} className="text-emerald-600 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Coluna Empresa</span>
            </div>
            <div className="font-bold text-xs text-slate-800">Modelo Cidades</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Municípios, UF, IBGE, Praças e Rotas</div>
          </button>
        </div>
      </div>

      {/* Área de Importação e Envio de Arquivo */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Upload size={15} className="text-blue-600" />
          <span>Importar Planilha Preenchida</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Tipo de Cadastro a Importar:</label>
            <select
              value={importType}
              onChange={(e) => {
                setImportType(e.target.value as any);
                setParsedPreview(null);
                setImportedSuccessMsg(null);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-semibold"
            >
              <option value="produtos">Cadastro de Produtos & Insumos (com Preços Matriz/Filial)</option>
              <option value="clientes">Cadastro de Clientes</option>
              <option value="estoque">Carga Inicial de Estoque (Saldos por Empresa e Local)</option>
              <option value="bairros">Cadastro de Bairros (Expedição & Rotas)</option>
              <option value="cidades">Cadastro de Cidades (Expedição & Rotas)</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Modo de Importação:</label>
            <select
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-semibold"
            >
              <option value="insert_update">Incluir Novos e Atualizar Existentes (Recomendado)</option>
              <option value="insert_only">Somente Incluir (Rejeitar Códigos Duplicados)</option>
            </select>
          </div>
        </div>

        {/* Input de Arquivo */}
        <div className="border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl p-6 text-center bg-slate-50 hover:bg-blue-50/20 transition-all cursor-pointer">
          <input
            type="file"
            id="excel-file-input"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <label htmlFor="excel-file-input" className="cursor-pointer block">
            <Upload size={32} className="mx-auto text-blue-600 mb-2" />
            <span className="font-bold text-sm text-slate-800 block">
              {isLoadingFile ? 'Processando e Validando Planilha...' : 'Clique para selecionar o arquivo Excel (.xlsx ou .xls)'}
            </span>
            <span className="text-xs text-slate-400 mt-1 block">
              O sistema irá ler as linhas e apresentar a prévia de validação respeitando as empresas Matriz e Filial antes de qualquer alteração.
            </span>
          </label>
        </div>

        {/* Mensagem de Sucesso */}
        {importedSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center gap-2 text-xs font-semibold">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{importedSuccessMsg}</span>
          </div>
        )}

        {/* Prévia e Relatório de Validação Linha por Linha */}
        {parsedPreview && (
          <div className="space-y-4 pt-3 border-t border-slate-200">
            {/* Resumo da Validação */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
              <div className="bg-slate-100 p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block text-[10px]">Total de Linhas</span>
                <span className="font-extrabold text-slate-900 text-base">{parsedPreview.summary.totalRows}</span>
              </div>
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                <span className="text-emerald-700 block text-[10px]">Registros Válidos</span>
                <span className="font-extrabold text-emerald-800 text-base">{parsedPreview.summary.validCount}</span>
              </div>
              <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                <span className="text-blue-700 block text-[10px]">Inclusões / Atualizações</span>
                <span className="font-extrabold text-blue-800 text-base">
                  {parsedPreview.summary.toInsertCount} novos / {parsedPreview.summary.toUpdateCount} atualiz.
                </span>
              </div>
              <div className="bg-rose-50 p-3 rounded-xl border border-rose-200">
                <span className="text-rose-700 block text-[10px]">Linhas com Erro / Rejeitadas</span>
                <span className="font-extrabold text-rose-800 text-base">{parsedPreview.summary.invalidCount}</span>
              </div>
            </div>

            {/* Relatório de Erros Linha a Linha (se houver) */}
            {parsedPreview.invalidRows.length > 0 && (
              <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-4 space-y-2 text-xs">
                <div className="font-bold text-rose-800 flex items-center gap-1.5">
                  <AlertTriangle size={16} />
                  <span>Relatório de Inconsistências na Planilha (Corrija antes ou prossiga com os válidos):</span>
                </div>

                <div className="max-h-40 overflow-y-auto divide-y divide-rose-200/60">
                  {parsedPreview.invalidRows.map((inv, idx) => (
                    <div key={idx} className="py-1.5 text-rose-900">
                      <strong>Linha {inv.rowNumber}:</strong>{' '}
                      {inv.issues.map((iss) => `${iss.field} - ${iss.message}`).join(' | ')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prévia dos Dados Válidos */}
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs max-h-64 overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] sticky top-0">
                  {importType === 'estoque' ? (
                    <tr>
                      <th className="p-2.5">Empresa</th>
                      <th className="p-2.5">Código</th>
                      <th className="p-2.5">Produto</th>
                      <th className="p-2.5">Local Estoque</th>
                      <th className="p-2.5 text-right">Saldo Inicial</th>
                      <th className="p-2.5 text-right">Estoque Mínimo</th>
                    </tr>
                  ) : importType === 'cidades' ? (
                    <tr>
                      <th className="p-2.5">Empresa</th>
                      <th className="p-2.5">Cidade</th>
                      <th className="p-2.5">UF</th>
                      <th className="p-2.5">Cód. IBGE</th>
                      <th className="p-2.5">Praça Comercial</th>
                      <th className="p-2.5">Rota Padrão</th>
                    </tr>
                  ) : importType === 'bairros' ? (
                    <tr>
                      <th className="p-2.5">Empresa</th>
                      <th className="p-2.5">Bairro</th>
                      <th className="p-2.5">Cidade / UF</th>
                      <th className="p-2.5">Faixa CEP</th>
                      <th className="p-2.5">Praça Comercial</th>
                      <th className="p-2.5">Rota Padrão</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="p-2.5">Empresa</th>
                      <th className="p-2.5">Código</th>
                      <th className="p-2.5">Descrição / Nome</th>
                      <th className="p-2.5">Unidade / Tipo</th>
                      <th className="p-2.5 text-right">Custo / Limite</th>
                      <th className="p-2.5 text-right">Preço Venda</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importType === 'estoque' ? (
                    (parsedPreview.validRows as StockImportRow[]).slice(0, 15).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="p-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {row.companyName}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono font-bold text-slate-700">{row.productCode}</td>
                        <td className="p-2.5 font-semibold text-slate-800">{row.productDescription}</td>
                        <td className="p-2.5 text-slate-600">{row.locationName} ({row.locationCode})</td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-700">{row.quantity}</td>
                        <td className="p-2.5 text-right font-mono text-slate-600">{row.minStock}</td>
                      </tr>
                    ))
                  ) : importType === 'cidades' ? (
                    parsedPreview.validRows.slice(0, 15).map((row: Partial<CityItem> & { targetCompanyName?: string }, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="p-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {row.targetCompanyName || 'Todas'}
                          </span>
                        </td>
                        <td className="p-2.5 font-bold text-slate-800">{row.name}</td>
                        <td className="p-2.5 font-mono font-bold text-slate-700">{row.stateUf}</td>
                        <td className="p-2.5 font-mono text-slate-600">{row.ibgeCode || '—'}</td>
                        <td className="p-2.5 text-slate-700">{row.marketAreaName || '—'}</td>
                        <td className="p-2.5 text-blue-700 font-semibold">{row.defaultRouteName || '—'}</td>
                      </tr>
                    ))
                  ) : importType === 'bairros' ? (
                    parsedPreview.validRows.slice(0, 15).map((row: Partial<NeighborhoodItem> & { targetCompanyName?: string }, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80">
                        <td className="p-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {row.targetCompanyName || 'Todas'}
                          </span>
                        </td>
                        <td className="p-2.5 font-bold text-slate-800">{row.name}</td>
                        <td className="p-2.5 text-slate-700 font-semibold">
                          {row.cityName}/{row.stateUf}
                        </td>
                        <td className="p-2.5 font-mono text-slate-600">{row.zipCodePrefix || '—'}</td>
                        <td className="p-2.5 text-slate-700">{row.marketAreaName || '—'}</td>
                        <td className="p-2.5 text-blue-700 font-semibold">{row.defaultRouteName || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    parsedPreview.validRows.slice(0, 15).map((row, idx) => {
                      const companyDisplay =
                        row.targetCompanyName ||
                        (row.companyPrices && Object.keys(row.companyPrices).length > 0
                          ? dbState.companies.find((c) => c.id === Object.keys(row.companyPrices!)[0])?.tradeName
                          : undefined) ||
                        currentCompany?.tradeName ||
                        'Matriz';

                      return (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="p-2.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {companyDisplay}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono font-bold text-slate-600">
                            {row.code}
                            {row.isMasterPack && (
                              <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 font-semibold">
                                <Boxes size={10} />
                                Master ({row.masterPackUnits} UN)
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 font-semibold text-slate-800">
                            <div>{row.description || row.name}</div>
                            {row.isMasterPack && row.masterPackAssociatedProductCode && (
                              <div className="text-[10px] text-amber-700 font-normal">
                                ↳ Vinculado ao produto unitário: <strong>{row.masterPackAssociatedProductCode}</strong> ({row.masterPackPackagingType || 'caixa'})
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-600">{row.unit || row.type}</td>
                          <td className="p-2.5 text-right font-mono text-slate-600">
                            {formatCurrency(row.costPrice || row.creditLimit || 0)}
                          </td>
                          <td className="p-2.5 text-right font-bold text-blue-700">
                            {formatCurrency(row.salePrice || 0)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Botão de Confirmação */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setParsedPreview(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Descartar Prévia
              </button>
              <button
                disabled={parsedPreview.validRows.length === 0}
                onClick={handleConfirmImport}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <FileCheck size={16} />
                <span>Confirmar Importação de {parsedPreview.summary.validCount} Registro(s)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Importação de NF-e (XML) */}
      <NfeXmlImportModal
        isOpen={isNfeModalOpen}
        onClose={() => setIsNfeModalOpen(false)}
        onCancel={() => {
          setIsNfeModalOpen(false);
          if (onNavigateHome) {
            onNavigateHome();
          }
        }}
      />
    </div>
  );
};
