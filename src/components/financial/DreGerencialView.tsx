import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Building2,
  Calendar,
  Filter,
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  Info,
  ExternalLink,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { Database } from '../../services/db';
import { Company, Order, AccountPayable, StockMovement, Product } from '../../types';
import { formatCurrency } from '../../services/pricingEngine';
import { isBillableSaleOrder } from '../../utils/orderUtils';
import { toast } from '../../services/toast';

export interface DreItemDetail {
  id: string;
  date: string;
  companyName: string;
  docRef: string;
  description: string;
  categoryOrAccount: string;
  launchCode?: string;
  amount: number;
  type: 'receita' | 'deducao' | 'custo' | 'despesa';
}

export const DreGerencialView: React.FC = () => {
  const [dbState, setDbState] = useState(Database.getState());
  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);
  const companies = dbState.companies || [];
  const currentCompany = Database.getCurrentCompany();

  // Filtros
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all'); // 'all' = Consolidado
  const [viewMode, setViewMode] = useState<'hierarquica' | 'comparativa'>('hierarquica');
  const [accountingRegime, setAccountingRegime] = useState<'competencia' | 'caixa'>('competencia');

  // Período
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  const [periodPreset, setPeriodPreset] = useState<'mes_atual' | 'mes_anterior' | 'trimestre' | 'ano' | 'custom'>('mes_atual');
  const [startDate, setStartDate] = useState<string>(firstDayOfMonth);
  const [endDate, setEndDate] = useState<string>(lastDayOfMonth);

  // Drill-down Modal State
  const [drillDownModal, setDrillDownModal] = useState<{
    title: string;
    code: string;
    subtitle: string;
    items: DreItemDetail[];
    total: number;
  } | null>(null);

  // Seções recolhidas/expandidas na DRE
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    '1': true,
    '2': true,
    '3': true,
    '4': true,
    '5': true,
    '6': true,
    '7': false,
    '8': false,
  });

  const toggleSection = (sec: string) => {
    setExpandedSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  // Alterar preset de período
  const handlePeriodPreset = (preset: 'mes_atual' | 'mes_anterior' | 'trimestre' | 'ano') => {
    setPeriodPreset(preset);
    const now = new Date();
    if (preset === 'mes_atual') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      setStartDate(s);
      setEndDate(e);
    } else if (preset === 'mes_anterior') {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const e = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      setStartDate(s);
      setEndDate(e);
    } else if (preset === 'trimestre') {
      const s = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0];
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      setStartDate(s);
      setEndDate(e);
    } else if (preset === 'ano') {
      const s = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      const e = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];
      setStartDate(s);
      setEndDate(e);
    }
  };

  // Motor de Cálculo da DRE
  const dreData = useMemo(() => {
    const productsMap = new Map<string, Product>();
    dbState.products.forEach((p) => productsMap.set(p.id, p));

    const companyMap = new Map<string, string>();
    companies.forEach((c) => companyMap.set(c.id, c.name));

    // Filtrar pedidos no período
    // Apenas pedidos de VENDA faturáveis confirmados (não cancelados, não orçamentos, não bonificações)
    const validOrders = dbState.orders.filter((ord) => {
      if (!isBillableSaleOrder(ord)) return false;
      const orderDate = (ord.createdAt || '').slice(0, 10);
      if (orderDate < startDate || orderDate > endDate) return false;
      return true;
    });

    // Função para calcular DRE para um conjunto de empresas ou individual
    const computeForCompany = (compFilter: string) => {
      const filteredOrders = compFilter === 'all'
        ? validOrders
        : validOrders.filter((o) => o.companyId === compFilter);

      // 1. RECEITA OPERACIONAL BRUTA
      let receitaRevenda = 0;
      let receitaFabricados = 0;
      let custoRevendaCMV = 0;
      let custoFabricadosCPV = 0;
      let descontosVendas = 0;

      const drillDownReceitaRevenda: DreItemDetail[] = [];
      const drillDownReceitaFabricados: DreItemDetail[] = [];
      const drillDownCmv: DreItemDetail[] = [];
      const drillDownCpv: DreItemDetail[] = [];
      const drillDownDescontos: DreItemDetail[] = [];

      filteredOrders.forEach((ord) => {
        const compName = companyMap.get(ord.companyId) || 'Empresa';
        const ordDate = (ord.createdAt || '').slice(0, 10);

        // Descontos concedidos
        if (ord.discountTotal && ord.discountTotal > 0) {
          descontosVendas += ord.discountTotal;
          drillDownDescontos.push({
            id: `DESC-${ord.id}`,
            date: ordDate,
            companyName: compName,
            docRef: ord.number || ord.id,
            description: `Desconto concedido no pedido de ${ord.customerName || 'Consumidor'}`,
            categoryOrAccount: '2.1.02 Descontos Comerciais',
            amount: ord.discountTotal,
            type: 'deducao',
          });
        }

        // Itens
        (ord.items || []).forEach((item) => {
          const prod = productsMap.get(item.productId);
          const isManufactured = Boolean(
            prod?.hasComposition ||
            (prod?.composition && prod.composition.length > 0)
          );

          const itemTotal = item.totalPrice || (item.quantity * item.unitPrice);
          const itemCost = item.quantity * (item.unitCost || prod?.costPrice || 0);

          if (isManufactured) {
            receitaFabricados += itemTotal;
            custoFabricadosCPV += itemCost;

            drillDownReceitaFabricados.push({
              id: `${ord.id}-${item.productId}`,
              date: ordDate,
              companyName: compName,
              docRef: ord.number || ord.id,
              description: `${item.description} (x${item.quantity}) - ${ord.customerName || 'Balcão'}`,
              categoryOrAccount: '1.2.01 Produtos Saneantes Fabricados',
              amount: itemTotal,
              type: 'receita',
            });

            if (itemCost > 0) {
              drillDownCpv.push({
                id: `CPV-${ord.id}-${item.productId}`,
                date: ordDate,
                companyName: compName,
                docRef: ord.number || ord.id,
                description: `CPV: ${item.description} (x${item.quantity} @ ${formatCurrency(item.unitCost || prod?.costPrice || 0)})`,
                categoryOrAccount: '3.2 CPV Indústria Química',
                amount: itemCost,
                type: 'custo',
              });
            }
          } else {
            receitaRevenda += itemTotal;
            custoRevendaCMV += itemCost;

            drillDownReceitaRevenda.push({
              id: `${ord.id}-${item.productId}`,
              date: ordDate,
              companyName: compName,
              docRef: ord.number || ord.id,
              description: `${item.description} (x${item.quantity}) - ${ord.customerName || 'Balcão'}`,
              categoryOrAccount: '1.1.01 Mercadorias para Revenda',
              amount: itemTotal,
              type: 'receita',
            });

            if (itemCost > 0) {
              drillDownCmv.push({
                id: `CMV-${ord.id}-${item.productId}`,
                date: ordDate,
                companyName: compName,
                docRef: ord.number || ord.id,
                description: `CMV: ${item.description} (x${item.quantity} @ ${formatCurrency(item.unitCost || prod?.costPrice || 0)})`,
                categoryOrAccount: '3.1 CMV Revenda Comercial',
                amount: itemCost,
                type: 'custo',
              });
            }
          }
        });
      });

      const receitaBrutaTotal = receitaRevenda + receitaFabricados;

      // 2. DEDUÇÕES
      // Devoluções de Vendas oficiais (pedidos cancelados NÃO constam no DRE nem em devoluções)
      let devolucoesTotal = 0;
      let devolucoesCmvReversed = 0;
      const drillDownDevolucoes: DreItemDetail[] = [];

      const ordersMap = new Map<string, Order>();
      dbState.orders.forEach((o) => ordersMap.set(o.id, o));

      // Apenas Devoluções de Vendas oficiais do módulo (pedidos cancelados não devem constar)
      const activeSalesReturns = (dbState.salesReturns || []).filter((r) => {
        if (compFilter !== 'all' && r.companyId !== compFilter) return false;
        if (r.status === 'cancelada') return false;
        const linkedOrder = ordersMap.get(r.orderId);
        if (linkedOrder && linkedOrder.status === 'cancelado') return false;
        const d = (r.date || r.createdAt || '').slice(0, 10);
        return d >= startDate && d <= endDate;
      });

      activeSalesReturns.forEach((ret) => {
        const comp = companyMap.get(ret.companyId) || ret.companyName || 'Empresa';
        devolucoesTotal += ret.totalReturned;
        devolucoesCmvReversed += ret.totalCmvReversed || 0;

        drillDownDevolucoes.push({
          id: ret.id,
          date: (ret.date || ret.createdAt || '').slice(0, 10),
          companyName: comp,
          docRef: ret.number,
          description: `Devolução ${ret.number} - Pedido ${ret.orderNumber} (${ret.customerName}) - Canal: ${ret.channelLabel} [${ret.returnType === 'total' ? 'Total' : 'Parcial'}]`,
          categoryOrAccount: '2.1.01 Devoluções de Vendas',
          amount: ret.totalReturned,
          type: 'deducao',
        });
      });

      // Tributos estimados Simples Nacional (padrão 6% sobre faturamento líquido de saneantes/comércio no Simples)
      const aliquotaSimples = 0.06;
      const impostosVendas = (receitaBrutaTotal - devolucoesTotal - descontosVendas) * aliquotaSimples;
      const drillDownImpostos: DreItemDetail[] = [
        {
          id: 'IMP-SIMPLES',
          date: endDate,
          companyName: compFilter === 'all' ? 'Consolidado' : (companyMap.get(compFilter) || 'Empresa'),
          docRef: 'DAS-SIMPLES',
          description: `Provisão Simples Nacional (~6,00% sobre ${formatCurrency(receitaBrutaTotal - devolucoesTotal - descontosVendas)})`,
          categoryOrAccount: '2.2.01 Simples Nacional',
          amount: Math.max(0, impostosVendas),
          type: 'deducao',
        },
      ];

      const deducoesTotal = devolucoesTotal + descontosVendas + Math.max(0, impostosVendas);
      const receitaLiquida = Math.max(0, receitaBrutaTotal - deducoesTotal);

      // 3. CUSTOS (CMV + CPV)
      // Mercadorias devolvidas em condições de revenda têm o custo estornado do CMV
      const adjustedCmvRevenda = Math.max(0, custoRevendaCMV - devolucoesCmvReversed);
      if (devolucoesCmvReversed > 0) {
        drillDownCmv.push({
          id: `CMV-ESTORNO-DEV`,
          date: endDate,
          companyName: compFilter === 'all' ? 'Consolidado' : (companyMap.get(compFilter) || 'Empresa'),
          docRef: 'ESTORNO-DEV',
          description: `(-) Estorno de CMV de mercadorias devolvidas em condições de revenda`,
          categoryOrAccount: '3.1 CMV Revenda Comercial',
          amount: -devolucoesCmvReversed,
          type: 'custo',
        });
      }
      const custosTotal = adjustedCmvRevenda + custoFabricadosCPV;
      const lucroBruto = receitaLiquida - custosTotal;
      const margemBruta = receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0;
      const margemContribuicao = lucroBruto; // Margem de Contribuição = Receita Líquida - Custos das Vendas (CMV/CPV)
      const margemContribuicaoPercent = receitaLiquida > 0 ? (margemContribuicao / receitaLiquida) * 100 : 0;

      // 4, 5, 6, 7, 8: DESPESAS E RECEITAS OPERACIONAIS E NÃO OPERACIONAIS
      // Filtrar Contas a Pagar
      const payablesFiltered = dbState.accountsPayable.filter((p) => {
        if (compFilter !== 'all' && p.companyId !== compFilter) return false;
        if (p.status === 'cancelado') return false;

        if (accountingRegime === 'caixa') {
          // Regime de Caixa: considerar apenas pagamentos efetivados no período
          return (p.payments || []).some((pay) => {
            const payDate = (pay.date || '').slice(0, 10);
            return payDate >= startDate && payDate <= endDate;
          });
        } else {
          // Regime de Competência: considerar títulos com emissão/vencimento no período
          const docDate = (p.issueDate || p.dueDate || '').slice(0, 10);
          return docDate >= startDate && docDate <= endDate;
        }
      });

      // Mapeamento por Grupo DRE
      // Grupo 4: Despesas Comerciais e Logística
      // Grupo 5: Despesas Administrativas
      // Grupo 6: Despesas Financeiras
      // Grupo 7: Receitas Financeiras
      // Grupo 8: Outras Despesas
      // Grupo 9: Movimentações Não DRE (excluídas da DRE!)
      let despesasComerciais = 0;
      let despesasAdministrativas = 0;
      let despesasFinanceiras = 0;
      let receitasFinanceiras = 0;
      let outrasDespesas = 0;

      // Subdivisões para detalhes e drill-down
      const drillDownComercial: DreItemDetail[] = [];
      const drillDownAdmin: DreItemDetail[] = [];
      const drillDownFinanceiro: DreItemDetail[] = [];
      const drillDownReceitaFin: DreItemDetail[] = [];
      const drillDownOutras: DreItemDetail[] = [];

      payablesFiltered.forEach((p) => {
        const comp = companyMap.get(p.companyId) || 'Empresa';
        const docDate = (p.issueDate || p.dueDate || '').slice(0, 10);

        // Valor a computar
        let val = p.originalValue;
        if (accountingRegime === 'caixa') {
          val = (p.payments || []).reduce((sum, pay) => {
            const d = (pay.date || '').slice(0, 10);
            return d >= startDate && d <= endDate ? sum + pay.amount : sum;
          }, 0);
        }

        if (val <= 0) return;

        const code = p.chartAccountCode || '';
        const launch = p.launchCode || '';
        const accountName = p.chartAccountName || p.category || 'Despesa Geral';

        const itemDetail: DreItemDetail = {
          id: p.id,
          date: docDate,
          companyName: comp,
          docRef: p.docNumber || p.id,
          description: `${p.description} (Favorecido: ${p.supplierName})`,
          categoryOrAccount: `${launch ? `[${launch}] ` : ''}${accountName}`,
          launchCode: launch,
          amount: val,
          type: 'despesa',
        };

        // Identificação por código de grupo ou categoria legada
        if (code.startsWith('4.') || ['101', '102', '103'].includes(launch)) {
          despesasComerciais += val;
          drillDownComercial.push(itemDetail);
        } else if (code.startsWith('5.') || ['aluguel', 'energia', 'agua', 'internet_telefone', 'salarios', 'administrativo'].includes(p.category)) {
          despesasAdministrativas += val;
          drillDownAdmin.push(itemDetail);
        } else if (code.startsWith('6.') || ['104', '105'].includes(launch)) {
          despesasFinanceiras += val;
          drillDownFinanceiro.push(itemDetail);
        } else if (code.startsWith('7.')) {
          receitasFinanceiras += val;
          itemDetail.type = 'receita';
          drillDownReceitaFin.push(itemDetail);
        } else if (code.startsWith('8.')) {
          outrasDespesas += val;
          drillDownOutras.push(itemDetail);
        } else if (code.startsWith('9.')) {
          // Grupo 9: Movimentações Não DRE (Estoque e Ativo).
          // CORRETO: NÃO entra no resultado da DRE para não duplicar compras com CMV/CPV!
        } else {
          // Despesas não classificadas no plano: alocar como Despesas Gerais (Grupo 5 Administrativas)
          despesasAdministrativas += val;
          drillDownAdmin.push({
            ...itemDetail,
            categoryOrAccount: `[Pendente] ${accountName}`,
          });
        }
      });

      // Resultado Operacional (EBITDA / LAIDA)
      const despesasOperacionais = despesasComerciais + despesasAdministrativas;
      const resultadoOperacional = lucroBruto - despesasOperacionais;
      const margemOperacional = receitaLiquida > 0 ? (resultadoOperacional / receitaLiquida) * 100 : 0;

      // Resultado Líquido Gerencial
      const resultadoFinanceiro = receitasFinanceiras - despesasFinanceiras;
      const resultadoLiquido = resultadoOperacional + resultadoFinanceiro - outrasDespesas;
      const margemLiquida = receitaLiquida > 0 ? (resultadoLiquido / receitaLiquida) * 100 : 0;

      return {
        companyId: compFilter,
        companyName: compFilter === 'all' ? 'Consolidado Geral (Matriz + Filiais)' : (companyMap.get(compFilter) || 'Empresa'),
        receitaBrutaTotal,
        receitaRevenda,
        receitaFabricados,
        deducoesTotal,
        devolucoesTotal,
        descontosVendas,
        impostosVendas,
        receitaLiquida,
        custosTotal,
        custoRevendaCMV,
        custoFabricadosCPV,
        lucroBruto,
        margemBruta,
        margemContribuicao,
        margemContribuicaoPercent,
        despesasComerciais,
        despesasAdministrativas,
        despesasOperacionais,
        resultadoOperacional,
        margemOperacional,
        despesasFinanceiras,
        receitasFinanceiras,
        resultadoFinanceiro,
        outrasDespesas,
        resultadoLiquido,
        margemLiquida,
        // Drill-downs
        drillDowns: {
          receitaRevenda: drillDownReceitaRevenda,
          receitaFabricados: drillDownReceitaFabricados,
          cmv: drillDownCmv,
          cpv: drillDownCpv,
          descontos: drillDownDescontos,
          devolucoes: drillDownDevolucoes,
          impostos: drillDownImpostos,
          comercial: drillDownComercial,
          admin: drillDownAdmin,
          financeiro: drillDownFinanceiro,
          receitaFin: drillDownReceitaFin,
          outras: drillDownOutras,
        },
      };
    };

    // Calcular para a empresa selecionada ou consolidado
    const mainResult = computeForCompany(selectedCompanyId);

    // Calcular também por empresa individual para a visão comparativa
    const companyResults = companies.map((c) => computeForCompany(c.id));

    return {
      main: mainResult,
      companies: companyResults,
      consolidated: computeForCompany('all'),
    };
  }, [dbState, companies, selectedCompanyId, startDate, endDate, accountingRegime]);

  // Abrir Drill-Down Modal
  const openDrillDown = (
    title: string,
    code: string,
    subtitle: string,
    items: DreItemDetail[],
    total: number
  ) => {
    setDrillDownModal({
      title,
      code,
      subtitle,
      items,
      total,
    });
  };

  // Exportar DRE para CSV / Excel
  const handleExportCsv = () => {
    const m = dreData.main;
    const lines = [
      `DRE GERENCIAL - GESTÃO FÁCIL ERP`,
      `Empresa: ${m.companyName}`,
      `Período: ${new Date(startDate).toLocaleDateString('pt-BR')} até ${new Date(endDate).toLocaleDateString('pt-BR')}`,
      `Regime: ${accountingRegime === 'competencia' ? 'Competência' : 'Caixa'}`,
      ``,
      `CÓDIGO;DESCRIÇÃO DA LINHA DRE;VALOR (R$);% ANÁLISE VERTICAL`,
      `1;RECEITA OPERACIONAL BRUTA;${m.receitaBrutaTotal.toFixed(2)};${m.receitaLiquida > 0 ? ((m.receitaBrutaTotal / m.receitaLiquida) * 100).toFixed(2) : '100'}%`,
      `1.1;  Venda de Mercadorias para Revenda (Comércio);${m.receitaRevenda.toFixed(2)};${m.receitaLiquida > 0 ? ((m.receitaRevenda / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `1.2;  Venda de Produtos Fabricados (Indústria Saneantes);${m.receitaFabricados.toFixed(2)};${m.receitaLiquida > 0 ? ((m.receitaFabricados / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `2;(-) DEDUÇÕES DA RECEITA BRUTA;${m.deducoesTotal.toFixed(2)};${m.receitaLiquida > 0 ? ((m.deducoesTotal / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `2.1;  (-) Devoluções de Vendas;${m.devolucoesTotal.toFixed(2)};${m.receitaLiquida > 0 ? ((m.devolucoesTotal / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `2.2;  (-) Descontos Concedidos;${m.descontosVendas.toFixed(2)};${m.receitaLiquida > 0 ? ((m.descontosVendas / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `2.3;  (-) Tributos sobre Faturamento (Simples Nacional);${m.impostosVendas.toFixed(2)};${m.receitaLiquida > 0 ? ((m.impostosVendas / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `(=);RECEITA OPERACIONAL LÍQUIDA;${m.receitaLiquida.toFixed(2)};100.00%`,
      `3;(-) CUSTOS DAS VENDAS (CMV / CPV);${m.custosTotal.toFixed(2)};${m.receitaLiquida > 0 ? ((m.custosTotal / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `3.1;  (-) CMV - Custo das Mercadorias Revendidas;${m.custoRevendaCMV.toFixed(2)};${m.receitaLiquida > 0 ? ((m.custoRevendaCMV / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `3.2;  (-) CPV - Custo dos Produtos Fabricados Vendidos;${m.custoFabricadosCPV.toFixed(2)};${m.receitaLiquida > 0 ? ((m.custoFabricadosCPV / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `(=);MARGEM DE CONTRIBUIÇÃO (LUCRO BRUTO);${m.margemContribuicao.toFixed(2)};${m.margemContribuicaoPercent.toFixed(2)}%`,
      `4;(-) DESPESAS OPERACIONAIS;${m.despesasOperacionais.toFixed(2)};${m.receitaLiquida > 0 ? ((m.despesasOperacionais / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `4.1;  (-) Despesas Comerciais e Logística (101, 102, 103...);${m.despesasComerciais.toFixed(2)};${m.receitaLiquida > 0 ? ((m.despesasComerciais / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `5;    (-) Despesas Administrativas Gerais (Aluguel, Luz, MOD...);${m.despesasAdministrativas.toFixed(2)};${m.receitaLiquida > 0 ? ((m.despesasAdministrativas / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `(=);RESULTADO OPERACIONAL (EBITDA);${m.resultadoOperacional.toFixed(2)};${m.margemOperacional.toFixed(2)}%`,
      `6;(+/-) RESULTADO FINANCEIRO;${m.resultadoFinanceiro.toFixed(2)};${m.receitaLiquida > 0 ? ((m.resultadoFinanceiro / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `6.1;  (+) Receitas Financeiras;${m.receitasFinanceiras.toFixed(2)};${m.receitaLiquida > 0 ? ((m.receitasFinanceiras / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `6.2;  (-) Despesas Financeiras e Tarifas (104, 105...);${m.despesasFinanceiras.toFixed(2)};${m.receitaLiquida > 0 ? ((m.despesasFinanceiras / m.receitaLiquida) * 100).toFixed(2) : '0'}%`,
      `(=);RESULTADO LÍQUIDO DO EXERCÍCIO (LUCRO / PREJUÍZO);${m.resultadoLiquido.toFixed(2)};${m.margemLiquida.toFixed(2)}%`,
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DRE_Gerencial_${m.companyName.replace(/\s+/g, '_')}_${startDate}_a_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('DRE Gerencial exportada com sucesso em formato CSV/Excel!');
  };

  const handlePrint = () => {
    window.print();
  };

  const main = dreData.main;

  return (
    <div className="space-y-4">
      {/* CABEÇALHO DA DRE GERENCIAL */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-700 rounded-xl border border-blue-200">
              <TrendingUp size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                DRE Gerencial – Demonstração do Resultado do Exercício
              </h2>
              <p className="text-xs text-slate-500">
                Visão econômico-financeira de rentabilidade operacional, custos industriais (CPV/CMV) e margens de contribuição.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Regime */}
          <div className="bg-slate-100 p-1 rounded-xl flex text-xs font-semibold">
            <button
              onClick={() => setAccountingRegime('competencia')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                accountingRegime === 'competencia'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Competência (Oficial DRE)
            </button>
            <button
              onClick={() => setAccountingRegime('caixa')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                accountingRegime === 'caixa'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Caixa (Liquidações)
            </button>
          </div>

          {/* Alternar Visão: Hierárquica vs Comparativa */}
          <div className="bg-slate-100 p-1 rounded-xl flex text-xs font-semibold">
            <button
              onClick={() => setViewMode('hierarquica')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                viewMode === 'hierarquica'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Visão Cascata
            </button>
            <button
              onClick={() => setViewMode('comparativa')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                viewMode === 'comparativa'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Comparativo Empresas
            </button>
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-colors cursor-pointer"
            title="Exportar para Excel / CSV"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Excel</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-colors cursor-pointer"
            title="Imprimir Relatório A4"
          >
            <Printer size={14} />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
        </div>
      </div>

      {/* FILTROS DE EMPRESA E PERÍODO */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Building2 size={15} className="text-blue-600" />
            <span className="font-bold text-slate-700">Empresa:</span>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="bg-transparent font-bold text-blue-700 focus:outline-hidden cursor-pointer"
            >
              <option value="all">🏢 Consolidado Geral (Matriz + Todas as Filiais)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.type === 'matriz' ? '⭐ Matriz: ' : '📍 Filial: '}
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Atalhos de Período */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold gap-1">
            <button
              onClick={() => handlePeriodPreset('mes_atual')}
              className={`px-2.5 py-1 rounded-lg ${periodPreset === 'mes_atual' ? 'bg-white text-blue-700 shadow-xs font-bold' : 'text-slate-600'}`}
            >
              Mês Atual
            </button>
            <button
              onClick={() => handlePeriodPreset('mes_anterior')}
              className={`px-2.5 py-1 rounded-lg ${periodPreset === 'mes_anterior' ? 'bg-white text-blue-700 shadow-xs font-bold' : 'text-slate-600'}`}
            >
              Mês Anterior
            </button>
            <button
              onClick={() => handlePeriodPreset('trimestre')}
              className={`px-2.5 py-1 rounded-lg ${periodPreset === 'trimestre' ? 'bg-white text-blue-700 shadow-xs font-bold' : 'text-slate-600'}`}
            >
              Trimestre
            </button>
            <button
              onClick={() => handlePeriodPreset('ano')}
              className={`px-2.5 py-1 rounded-lg ${periodPreset === 'ano' ? 'bg-white text-blue-700 shadow-xs font-bold' : 'text-slate-600'}`}
            >
              Ano Atual
            </button>
          </div>
        </div>

        {/* Seleção de Datas Customizadas */}
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-slate-400" />
          <span className="text-slate-500 font-semibold">De:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPeriodPreset('custom');
            }}
            className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
          />
          <span className="text-slate-500 font-semibold">Até:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPeriodPreset('custom');
            }}
            className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
          />
        </div>
      </div>

      {/* CARDS DE MARGENS E INDICADORES-CHAVE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Receita Líquida */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Receita Líquida (Base 100%)
            </span>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800 mt-1">
            {formatCurrency(main.receitaLiquida)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Bruta: {formatCurrency(main.receitaBrutaTotal)} • Deduções: -{formatCurrency(main.deducoesTotal)}
          </div>
        </div>

        {/* Margem de Contribuição & Lucro Bruto */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Margem de Contribuição (Lucro Bruto)
            </span>
            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
              main.margemContribuicaoPercent >= 40
                ? 'bg-emerald-100 text-emerald-800'
                : main.margemContribuicaoPercent >= 25
                ? 'bg-blue-100 text-blue-800'
                : 'bg-amber-100 text-amber-800'
            }`}>
              {main.margemContribuicaoPercent.toFixed(1)}% MC
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            {formatCurrency(main.margemContribuicao)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            CMV: {formatCurrency(main.custoRevendaCMV)} • CPV: {formatCurrency(main.custoFabricadosCPV)}
          </div>
        </div>

        {/* Resultado Operacional (EBITDA) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Resultado Operacional (EBITDA)
            </span>
            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
              main.margemOperacional >= 15
                ? 'bg-emerald-100 text-emerald-800'
                : main.margemOperacional >= 0
                ? 'bg-blue-100 text-blue-800'
                : 'bg-rose-100 text-rose-800'
            }`}>
              {main.margemOperacional.toFixed(1)}% MO
            </span>
          </div>
          <div className={`text-2xl font-black mt-1 ${main.resultadoOperacional >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
            {formatCurrency(main.resultadoOperacional)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Desp. Operacionais: -{formatCurrency(main.despesasOperacionais)}
          </div>
        </div>

        {/* Lucro Líquido Gerencial */}
        <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-md border border-slate-800">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Lucro Líquido do Exercício
            </span>
            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
              main.resultadoLiquido >= 0
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {main.margemLiquida.toFixed(1)}% ML
            </span>
          </div>
          <div className={`text-2xl font-black mt-1 ${main.resultadoLiquido >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrency(main.resultadoLiquido)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Resultado Financeiro: {main.resultadoFinanceiro >= 0 ? '+' : ''}{formatCurrency(main.resultadoFinanceiro)}
          </div>
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL: VISÃO HIERÁRQUICA CASCATA VS COMPARATIVA */}
      {viewMode === 'hierarquica' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                Cascata de Resultados – {main.companyName}
              </h3>
              <p className="text-[11px] text-slate-500">
                Clique sobre qualquer linha para abrir o <strong>Drill-Down</strong> e auditar todas as vendas, notas e lançamentos contábeis correspondentes.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-600">Base 100%: </span>
              <span className="text-xs font-black text-blue-700">{formatCurrency(main.receitaLiquida)}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3 w-16 text-center">Cód.</th>
                  <th className="p-3">Estrutura do DRE Gerencial</th>
                  <th className="p-3 text-right w-44">Valor no Período</th>
                  <th className="p-3 text-right w-24">% AV</th>
                  <th className="p-3 text-center w-28">Auditoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* 1. RECEITA OPERACIONAL BRUTA */}
                <tr className="bg-slate-50/80 font-bold text-slate-900">
                  <td className="p-3 text-center font-mono">1</td>
                  <td className="p-3 flex items-center gap-2">
                    <button onClick={() => toggleSection('1')} className="text-slate-500 hover:text-slate-800 cursor-pointer">
                      {expandedSections['1'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <span>RECEITA OPERACIONAL BRUTA</span>
                  </td>
                  <td className="p-3 text-right text-emerald-700 font-black">
                    {formatCurrency(main.receitaBrutaTotal)}
                  </td>
                  <td className="p-3 text-right text-slate-600 font-mono">
                    {main.receitaLiquida > 0 ? ((main.receitaBrutaTotal / main.receitaLiquida) * 100).toFixed(1) : '100'}%
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-[10px] text-slate-400">Totalizador</span>
                  </td>
                </tr>

                {expandedSections['1'] && (
                  <>
                    <tr
                      onClick={() => openDrillDown('Venda de Mercadorias para Revenda (Comércio)', '1.1', 'Produtos comercializados sem processo fabril interno', main.drillDowns.receitaRevenda, main.receitaRevenda)}
                      className="hover:bg-blue-50/40 cursor-pointer group transition-colors"
                    >
                      <td className="p-3 text-center font-mono text-slate-400">1.1</td>
                      <td className="p-3 pl-8 text-slate-700 flex items-center justify-between">
                        <span className="group-hover:text-blue-700 group-hover:font-semibold">
                          (+) Venda de Mercadorias para Revenda (Comércio)
                        </span>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-blue-600 transition-opacity" />
                      </td>
                      <td className="p-3 text-right font-semibold text-slate-800">
                        {formatCurrency(main.receitaRevenda)}
                      </td>
                      <td className="p-3 text-right text-slate-500 font-mono">
                        {main.receitaLiquida > 0 ? ((main.receitaRevenda / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          {main.drillDowns.receitaRevenda.length} vendas
                        </span>
                      </td>
                    </tr>

                    <tr
                      onClick={() => openDrillDown('Venda de Produtos Fabricados (Indústria Saneantes)', '1.2', 'Produtos saneantes e químicos formulados na indústria', main.drillDowns.receitaFabricados, main.receitaFabricados)}
                      className="hover:bg-blue-50/40 cursor-pointer group transition-colors"
                    >
                      <td className="p-3 text-center font-mono text-slate-400">1.2</td>
                      <td className="p-3 pl-8 text-slate-700 flex items-center justify-between">
                        <span className="group-hover:text-blue-700 group-hover:font-semibold">
                          (+) Venda de Produtos Fabricados (Indústria Química / Saneantes)
                        </span>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-blue-600 transition-opacity" />
                      </td>
                      <td className="p-3 text-right font-semibold text-slate-800">
                        {formatCurrency(main.receitaFabricados)}
                      </td>
                      <td className="p-3 text-right text-slate-500 font-mono">
                        {main.receitaLiquida > 0 ? ((main.receitaFabricados / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          {main.drillDowns.receitaFabricados.length} vendas
                        </span>
                      </td>
                    </tr>
                  </>
                )}

                {/* 2. DEDUÇÕES DA RECEITA BRUTA */}
                <tr className="bg-slate-50/80 font-bold text-slate-900">
                  <td className="p-3 text-center font-mono">2</td>
                  <td className="p-3 flex items-center gap-2">
                    <button onClick={() => toggleSection('2')} className="text-slate-500 hover:text-slate-800 cursor-pointer">
                      {expandedSections['2'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <span>(-) DEDUÇÕES DA RECEITA BRUTA</span>
                  </td>
                  <td className="p-3 text-right text-rose-600 font-bold">
                    -{formatCurrency(main.deducoesTotal)}
                  </td>
                  <td className="p-3 text-right text-rose-600 font-mono">
                    {main.receitaLiquida > 0 ? ((main.deducoesTotal / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-[10px] text-slate-400">Totalizador</span>
                  </td>
                </tr>

                {expandedSections['2'] && (
                  <>
                    <tr
                      onClick={() => openDrillDown('Devoluções de Vendas', '2.1', 'Mercadorias e produtos devolvidos por clientes', main.drillDowns.devolucoes, main.devolucoesTotal)}
                      className="hover:bg-rose-50/40 cursor-pointer group transition-colors"
                    >
                      <td className="p-3 text-center font-mono text-slate-400">2.1</td>
                      <td className="p-3 pl-8 text-slate-700 flex items-center justify-between">
                        <span className="group-hover:text-rose-700 group-hover:font-semibold">
                          (-) Devoluções de Vendas
                        </span>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-rose-600 transition-opacity" />
                      </td>
                      <td className="p-3 text-right text-rose-600">
                        -{formatCurrency(main.devolucoesTotal)}
                      </td>
                      <td className="p-3 text-right text-slate-500 font-mono">
                        {main.receitaLiquida > 0 ? ((main.devolucoesTotal / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          {main.drillDowns.devolucoes.length} devoluções
                        </span>
                      </td>
                    </tr>

                    <tr
                      onClick={() => openDrillDown('Descontos Concedidos em Vendas', '2.2', 'Descontos comerciais negociados nos pedidos e no PDV', main.drillDowns.descontos, main.descontosVendas)}
                      className="hover:bg-rose-50/40 cursor-pointer group transition-colors"
                    >
                      <td className="p-3 text-center font-mono text-slate-400">2.2</td>
                      <td className="p-3 pl-8 text-slate-700 flex items-center justify-between">
                        <span className="group-hover:text-rose-700 group-hover:font-semibold">
                          (-) Descontos Concedidos em Vendas
                        </span>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-rose-600 transition-opacity" />
                      </td>
                      <td className="p-3 text-right text-rose-600">
                        -{formatCurrency(main.descontosVendas)}
                      </td>
                      <td className="p-3 text-right text-slate-500 font-mono">
                        {main.receitaLiquida > 0 ? ((main.descontosVendas / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          {main.drillDowns.descontos.length} pedidos
                        </span>
                      </td>
                    </tr>

                    <tr
                      onClick={() => openDrillDown('Tributos sobre Faturamento (Simples Nacional)', '2.3', 'Impostos incidentes diretamente sobre a venda (DAS Simples Nacional)', main.drillDowns.impostos, main.impostosVendas)}
                      className="hover:bg-rose-50/40 cursor-pointer group transition-colors"
                    >
                      <td className="p-3 text-center font-mono text-slate-400">2.3</td>
                      <td className="p-3 pl-8 text-slate-700 flex items-center justify-between">
                        <span className="group-hover:text-rose-700 group-hover:font-semibold">
                          (-) Tributos e Impostos sobre Vendas (Simples Nacional ~6%)
                        </span>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-rose-600 transition-opacity" />
                      </td>
                      <td className="p-3 text-right text-rose-600">
                        -{formatCurrency(main.impostosVendas)}
                      </td>
                      <td className="p-3 text-right text-slate-500 font-mono">
                        {main.receitaLiquida > 0 ? ((main.impostosVendas / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          DAS Simples
                        </span>
                      </td>
                    </tr>
                  </>
                )}

                {/* RECEITA OPERACIONAL LÍQUIDA */}
                <tr className="bg-blue-50/60 font-black text-blue-900 border-y border-blue-200">
                  <td className="p-3 text-center font-mono">(=)</td>
                  <td className="p-3 pl-6 font-bold tracking-wide">
                    RECEITA OPERACIONAL LÍQUIDA (1 - 2)
                  </td>
                  <td className="p-3 text-right text-blue-800 text-sm">
                    {formatCurrency(main.receitaLiquida)}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-blue-800">
                    100.0%
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-[10px] font-black text-blue-700 bg-white px-2 py-0.5 rounded-md border border-blue-200">
                      Base 100%
                    </span>
                  </td>
                </tr>

                {/* 3. CUSTOS DAS VENDAS (CMV E CPV) */}
                <tr className="bg-slate-50/80 font-bold text-slate-900">
                  <td className="p-3 text-center font-mono">3</td>
                  <td className="p-3 flex items-center gap-2">
                    <button onClick={() => toggleSection('3')} className="text-slate-500 hover:text-slate-800 cursor-pointer">
                      {expandedSections['3'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <span>(-) CUSTO DAS MERCADORIAS E PRODUTOS VENDIDOS</span>
                  </td>
                  <td className="p-3 text-right text-rose-600 font-bold">
                    -{formatCurrency(main.custosTotal)}
                  </td>
                  <td className="p-3 text-right text-rose-600 font-mono">
                    {main.receitaLiquida > 0 ? ((main.custosTotal / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-[10px] text-slate-400">Totalizador</span>
                  </td>
                </tr>

                {expandedSections['3'] && (
                  <>
                    <tr
                      onClick={() => openDrillDown('CMV - Custo das Mercadorias Revendidas', '3.1', 'Custo direto de aquisição dos itens de revenda comercializados', main.drillDowns.cmv, main.custoRevendaCMV)}
                      className="hover:bg-amber-50/40 cursor-pointer group transition-colors"
                    >
                      <td className="p-3 text-center font-mono text-slate-400">3.1</td>
                      <td className="p-3 pl-8 text-slate-700 flex items-center justify-between">
                        <span className="group-hover:text-amber-700 group-hover:font-semibold">
                          (-) CMV – Custo das Mercadorias Revendidas (Revenda Comercial)
                        </span>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-amber-600 transition-opacity" />
                      </td>
                      <td className="p-3 text-right text-rose-600">
                        -{formatCurrency(main.custoRevendaCMV)}
                      </td>
                      <td className="p-3 text-right text-slate-500 font-mono">
                        {main.receitaLiquida > 0 ? ((main.custoRevendaCMV / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          {main.drillDowns.cmv.length} itens
                        </span>
                      </td>
                    </tr>

                    <tr
                      onClick={() => openDrillDown('CPV - Custo dos Produtos Fabricados Vendidos', '3.2', 'Custo de produção (matéria-prima química, frascos/tampas e mão de obra fabril) reconhecido na venda', main.drillDowns.cpv, main.custoFabricadosCPV)}
                      className="hover:bg-amber-50/40 cursor-pointer group transition-colors"
                    >
                      <td className="p-3 text-center font-mono text-slate-400">3.2</td>
                      <td className="p-3 pl-8 text-slate-700 flex items-center justify-between">
                        <div>
                          <span className="group-hover:text-amber-700 group-hover:font-semibold">
                            (-) CPV – Custo dos Produtos Fabricados Vendidos (Indústria Saneantes)
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            Reconhecido na competência da venda (compras para estoque Grupo 9.1 não incidem diretamente na DRE)
                          </span>
                        </div>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-amber-600 transition-opacity" />
                      </td>
                      <td className="p-3 text-right text-rose-600">
                        -{formatCurrency(main.custoFabricadosCPV)}
                      </td>
                      <td className="p-3 text-right text-slate-500 font-mono">
                        {main.receitaLiquida > 0 ? ((main.custoFabricadosCPV / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          {main.drillDowns.cpv.length} lotes
                        </span>
                      </td>
                    </tr>
                  </>
                )}

                {/* MARGEM DE CONTRIBUIÇÃO (LUCRO BRUTO) */}
                <tr className="bg-emerald-50/80 font-black text-emerald-950 border-y-2 border-emerald-300">
                  <td className="p-3 text-center font-mono text-emerald-900">(=)</td>
                  <td className="p-3 pl-6 font-bold tracking-wide">
                    <div>
                      <span className="text-emerald-950 font-black text-sm">
                        (=) MARGEM DE CONTRIBUIÇÃO (LUCRO BRUTO)
                      </span>
                      <span className="block text-[10px] text-emerald-700 font-normal">
                        Receita Líquida (-) Custos das Vendas (CMV e CPV) • Sobra para cobrir Despesas Operacionais e formar o Lucro
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-right text-emerald-800 text-sm font-black">
                    {formatCurrency(main.margemContribuicao)}
                  </td>
                  <td className="p-3 text-right font-mono font-black text-emerald-800">
                    {main.margemContribuicaoPercent.toFixed(1)}%
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-[10px] font-black text-emerald-800 bg-white px-2.5 py-1 rounded-md border border-emerald-300 shadow-2xs">
                      Margem de Contribuição
                    </span>
                  </td>
                </tr>

                {/* 4. DESPESAS OPERACIONAIS */}
                <tr className="bg-slate-50/80 font-bold text-slate-900">
                  <td className="p-3 text-center font-mono">4</td>
                  <td className="p-3 flex items-center gap-2">
                    <button onClick={() => toggleSection('4')} className="text-slate-500 hover:text-slate-800 cursor-pointer">
                      {expandedSections['4'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <span>(-) DESPESAS OPERACIONAIS</span>
                  </td>
                  <td className="p-3 text-right text-rose-600 font-bold">
                    -{formatCurrency(main.despesasOperacionais)}
                  </td>
                  <td className="p-3 text-right text-rose-600 font-mono">
                    {main.receitaLiquida > 0 ? ((main.despesasOperacionais / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-[10px] text-slate-400">Totalizador</span>
                  </td>
                </tr>

                {expandedSections['4'] && (
                  <>
                    <tr
                      onClick={() => openDrillDown('Despesas Comerciais e Logística', '4.1', 'Combustíveis (101), Manutenção da Frota (102), Fretes (103), Comissões e Marketing', main.drillDowns.comercial, main.despesasComerciais)}
                      className="hover:bg-rose-50/40 cursor-pointer group transition-colors"
                    >
                      <td className="p-3 text-center font-mono text-slate-400">4.1</td>
                      <td className="p-3 pl-8 text-slate-700 flex items-center justify-between">
                        <div>
                          <span className="group-hover:text-rose-700 group-hover:font-semibold">
                            (-) Despesas Comerciais e Logística
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            Combustível (101), Manutenção de Frota (102), Fretes (103), Comissões e Marketing
                          </span>
                        </div>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-rose-600 transition-opacity" />
                      </td>
                      <td className="p-3 text-right text-rose-600">
                        -{formatCurrency(main.despesasComerciais)}
                      </td>
                      <td className="p-3 text-right text-slate-500 font-mono">
                        {main.receitaLiquida > 0 ? ((main.despesasComerciais / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                          {main.drillDowns.comercial.length} lançamentos
                        </span>
                      </td>
                    </tr>

                    <tr
                      onClick={() => openDrillDown('Despesas Administrativas Gerais', '4.2', 'Aluguel, Água, Energia Elétrica, Telefonia, Salários e Pró-Labore, Limpeza e Consultorias', main.drillDowns.admin, main.despesasAdministrativas)}
                      className="hover:bg-rose-50/40 cursor-pointer group transition-colors"
                    >
                      <td className="p-3 text-center font-mono text-slate-400">4.2</td>
                      <td className="p-3 pl-8 text-slate-700 flex items-center justify-between">
                        <div>
                          <span className="group-hover:text-rose-700 group-hover:font-semibold">
                            (-) Despesas Administrativas Gerais
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            Aluguel de Galpão/Loja, Energia Elétrica, Água, Salários, Contabilidade e Softwares
                          </span>
                        </div>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-rose-600 transition-opacity" />
                      </td>
                      <td className="p-3 text-right text-rose-600">
                        -{formatCurrency(main.despesasAdministrativas)}
                      </td>
                      <td className="p-3 text-right text-slate-500 font-mono">
                        {main.receitaLiquida > 0 ? ((main.despesasAdministrativas / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                          {main.drillDowns.admin.length} lançamentos
                        </span>
                      </td>
                    </tr>
                  </>
                )}

                {/* RESULTADO OPERACIONAL (EBITDA / LAIDA) */}
                <tr className="bg-slate-100/90 font-black text-slate-900 border-y border-slate-300">
                  <td className="p-3 text-center font-mono">(=)</td>
                  <td className="p-3 pl-6 font-bold tracking-wide">
                    RESULTADO OPERACIONAL ANTES DO RESULTADO FINANCEIRO (EBITDA / LAIDA)
                  </td>
                  <td className={`p-3 text-right text-sm ${main.resultadoOperacional >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                    {formatCurrency(main.resultadoOperacional)}
                  </td>
                  <td className="p-3 text-right font-mono font-black text-slate-800">
                    {main.margemOperacional.toFixed(1)}%
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-[10px] font-black text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-300">
                      Margem Operac.
                    </span>
                  </td>
                </tr>

                {/* 5. RESULTADO FINANCEIRO */}
                <tr className="bg-slate-50/80 font-bold text-slate-900">
                  <td className="p-3 text-center font-mono">5</td>
                  <td className="p-3 flex items-center gap-2">
                    <button onClick={() => toggleSection('5')} className="text-slate-500 hover:text-slate-800 cursor-pointer">
                      {expandedSections['5'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <span>(+/-) RESULTADO FINANCEIRO LÍQUIDO</span>
                  </td>
                  <td className={`p-3 text-right font-bold ${main.resultadoFinanceiro >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {main.resultadoFinanceiro >= 0 ? '+' : ''}{formatCurrency(main.resultadoFinanceiro)}
                  </td>
                  <td className="p-3 text-right text-slate-600 font-mono">
                    {main.receitaLiquida > 0 ? ((main.resultadoFinanceiro / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                  </td>
                  <td className="p-3 text-center">
                    <span className="text-[10px] text-slate-400">Totalizador</span>
                  </td>
                </tr>

                {expandedSections['5'] && (
                  <>
                    <tr
                      onClick={() => openDrillDown('Receitas Financeiras', '5.1', 'Rendimentos de aplicações e descontos financeiros obtidos', main.drillDowns.receitaFin, main.receitasFinanceiras)}
                      className="hover:bg-emerald-50/40 cursor-pointer group transition-colors"
                    >
                      <td className="p-3 text-center font-mono text-slate-400">5.1</td>
                      <td className="p-3 pl-8 text-slate-700 flex items-center justify-between">
                        <span className="group-hover:text-emerald-700 group-hover:font-semibold">
                          (+) Receitas Financeiras (Rendimentos e Descontos Obtidos)
                        </span>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-emerald-600 transition-opacity" />
                      </td>
                      <td className="p-3 text-right text-emerald-700 font-semibold">
                        +{formatCurrency(main.receitasFinanceiras)}
                      </td>
                      <td className="p-3 text-right text-slate-500 font-mono">
                        {main.receitaLiquida > 0 ? ((main.receitasFinanceiras / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          {main.drillDowns.receitaFin.length} lançamentos
                        </span>
                      </td>
                    </tr>

                    <tr
                      onClick={() => openDrillDown('Despesas Financeiras', '5.2', 'Tarifas Bancárias (104), Taxas de Cartões (105) e Juros', main.drillDowns.financeiro, main.despesasFinanceiras)}
                      className="hover:bg-rose-50/40 cursor-pointer group transition-colors"
                    >
                      <td className="p-3 text-center font-mono text-slate-400">5.2</td>
                      <td className="p-3 pl-8 text-slate-700 flex items-center justify-between">
                        <div>
                          <span className="group-hover:text-rose-700 group-hover:font-semibold">
                            (-) Despesas Financeiras e Taxas de Meios de Pagamento
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            Tarifas Bancárias (104), Taxas de Cartão/Maquininha/Antecipação (105) e Juros
                          </span>
                        </div>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-rose-600 transition-opacity" />
                      </td>
                      <td className="p-3 text-right text-rose-600">
                        -{formatCurrency(main.despesasFinanceiras)}
                      </td>
                      <td className="p-3 text-right text-slate-500 font-mono">
                        {main.receitaLiquida > 0 ? ((main.despesasFinanceiras / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                          {main.drillDowns.financeiro.length} taxas
                        </span>
                      </td>
                    </tr>
                  </>
                )}

                {/* 6. OUTRAS RECEITAS / DESPESAS NÃO OPERACIONAIS */}
                {main.outrasDespesas > 0 && (
                  <tr
                    onClick={() => openDrillDown('Outras Despesas Não Operacionais', '6.0', 'Eventos extraordinários e não recorrentes', main.drillDowns.outras, main.outrasDespesas)}
                    className="hover:bg-rose-50/40 cursor-pointer group transition-colors"
                  >
                    <td className="p-3 text-center font-mono text-slate-400">6</td>
                    <td className="p-3 pl-8 text-slate-700 flex items-center justify-between">
                      <span className="group-hover:text-rose-700 group-hover:font-semibold">
                        (-) Outras Despesas Não Operacionais / Eventuais
                      </span>
                      <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 text-rose-600 transition-opacity" />
                    </td>
                    <td className="p-3 text-right text-rose-600">
                      -{formatCurrency(main.outrasDespesas)}
                    </td>
                    <td className="p-3 text-right text-slate-500 font-mono">
                      {main.receitaLiquida > 0 ? ((main.outrasDespesas / main.receitaLiquida) * 100).toFixed(1) : '0'}%
                    </td>
                    <td className="p-3 text-center">
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        {main.drillDowns.outras.length} itens
                      </span>
                    </td>
                  </tr>
                )}

                {/* RESULTADO LÍQUIDO DO EXERCÍCIO */}
                <tr className={`border-t-2 ${main.resultadoLiquido >= 0 ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-rose-600 text-white border-rose-700'}`}>
                  <td className="p-4 text-center font-mono font-black text-sm">(=)</td>
                  <td className="p-4 pl-6 font-black text-sm tracking-wide">
                    RESULTADO LÍQUIDO DO EXERCÍCIO (LUCRO / PREJUÍZO LÍQUIDO)
                  </td>
                  <td className="p-4 text-right font-black text-base">
                    {formatCurrency(main.resultadoLiquido)}
                  </td>
                  <td className="p-4 text-right font-mono font-black text-sm">
                    {main.margemLiquida.toFixed(1)}%
                  </td>
                  <td className="p-4 text-center">
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-md bg-white/20 border border-white/30">
                      Margem Líquida
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VISÃO COMPARATIVA ENTRE EMPRESAS LADO A LADO */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                Comparativo Econômico Multi-Empresas (Lado a Lado)
              </h3>
              <p className="text-[11px] text-slate-500">
                Comparação de desempenho de vendas, CPV/CMV, despesas operacionais e resultado líquido entre a Matriz e todas as Filiais.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3 w-48">Linha DRE</th>
                  {dreData.companies.map((c) => (
                    <th key={c.companyId} className="p-3 text-right">
                      {c.companyName}
                    </th>
                  ))}
                  <th className="p-3 text-right bg-blue-50/80 text-blue-900 font-black border-l border-blue-200">
                    🏢 Total Consolidado
                  </th>
                  <th className="p-3 text-right w-20 bg-blue-50/80 text-blue-900 font-black">
                    % AV
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50 font-semibold text-slate-800">
                  <td className="p-3">1. Receita Bruta Total</td>
                  {dreData.companies.map((c) => (
                    <td key={c.companyId} className="p-3 text-right font-medium">
                      {formatCurrency(c.receitaBrutaTotal)}
                    </td>
                  ))}
                  <td className="p-3 text-right font-black text-slate-900 bg-blue-50/30 border-l border-blue-100">
                    {formatCurrency(dreData.consolidated.receitaBrutaTotal)}
                  </td>
                  <td className="p-3 text-right font-mono text-slate-500 bg-blue-50/30">
                    -
                  </td>
                </tr>

                <tr className="hover:bg-slate-50 text-slate-600 pl-4">
                  <td className="p-3 pl-6 text-slate-500">1.1 Revenda Comercial</td>
                  {dreData.companies.map((c) => (
                    <td key={c.companyId} className="p-3 text-right">
                      {formatCurrency(c.receitaRevenda)}
                    </td>
                  ))}
                  <td className="p-3 text-right font-semibold text-slate-800 bg-blue-50/30 border-l border-blue-100">
                    {formatCurrency(dreData.consolidated.receitaRevenda)}
                  </td>
                  <td className="p-3 text-right font-mono text-slate-500 bg-blue-50/30">
                    {dreData.consolidated.receitaLiquida > 0 ? ((dreData.consolidated.receitaRevenda / dreData.consolidated.receitaLiquida) * 100).toFixed(1) : 0}%
                  </td>
                </tr>

                <tr className="hover:bg-slate-50 text-slate-600">
                  <td className="p-3 pl-6 text-slate-500">1.2 Indústria Saneantes</td>
                  {dreData.companies.map((c) => (
                    <td key={c.companyId} className="p-3 text-right">
                      {formatCurrency(c.receitaFabricados)}
                    </td>
                  ))}
                  <td className="p-3 text-right font-semibold text-slate-800 bg-blue-50/30 border-l border-blue-100">
                    {formatCurrency(dreData.consolidated.receitaFabricados)}
                  </td>
                  <td className="p-3 text-right font-mono text-slate-500 bg-blue-50/30">
                    {dreData.consolidated.receitaLiquida > 0 ? ((dreData.consolidated.receitaFabricados / dreData.consolidated.receitaLiquida) * 100).toFixed(1) : 0}%
                  </td>
                </tr>

                <tr className="hover:bg-slate-50 text-rose-600">
                  <td className="p-3">2. (-) Deduções da Receita</td>
                  {dreData.companies.map((c) => (
                    <td key={c.companyId} className="p-3 text-right">
                      -{formatCurrency(c.deducoesTotal)}
                    </td>
                  ))}
                  <td className="p-3 text-right font-semibold text-rose-700 bg-blue-50/30 border-l border-blue-100">
                    -{formatCurrency(dreData.consolidated.deducoesTotal)}
                  </td>
                  <td className="p-3 text-right font-mono text-rose-600 bg-blue-50/30">
                    {dreData.consolidated.receitaLiquida > 0 ? ((dreData.consolidated.deducoesTotal / dreData.consolidated.receitaLiquida) * 100).toFixed(1) : 0}%
                  </td>
                </tr>

                <tr className="bg-blue-50/60 font-bold text-blue-900">
                  <td className="p-3">(=) Receita Líquida</td>
                  {dreData.companies.map((c) => (
                    <td key={c.companyId} className="p-3 text-right font-bold">
                      {formatCurrency(c.receitaLiquida)}
                    </td>
                  ))}
                  <td className="p-3 text-right font-black text-blue-900 bg-blue-100/60 border-l border-blue-200">
                    {formatCurrency(dreData.consolidated.receitaLiquida)}
                  </td>
                  <td className="p-3 text-right font-mono font-black text-blue-900 bg-blue-100/60">
                    100.0%
                  </td>
                </tr>

                <tr className="hover:bg-slate-50 text-rose-600">
                  <td className="p-3">3. (-) Custos das Vendas (CMV/CPV)</td>
                  {dreData.companies.map((c) => (
                    <td key={c.companyId} className="p-3 text-right">
                      -{formatCurrency(c.custosTotal)}
                    </td>
                  ))}
                  <td className="p-3 text-right font-semibold text-rose-700 bg-blue-50/30 border-l border-blue-100">
                    -{formatCurrency(dreData.consolidated.custosTotal)}
                  </td>
                  <td className="p-3 text-right font-mono text-rose-600 bg-blue-50/30">
                    {dreData.consolidated.receitaLiquida > 0 ? ((dreData.consolidated.custosTotal / dreData.consolidated.receitaLiquida) * 100).toFixed(1) : 0}%
                  </td>
                </tr>

                <tr className="bg-emerald-50/60 font-bold text-emerald-900 border-y border-emerald-200">
                  <td className="p-3">(=) Margem de Contribuição (Lucro Bruto)</td>
                  {dreData.companies.map((c) => (
                    <td key={c.companyId} className="p-3 text-right font-bold text-emerald-700">
                      {formatCurrency(c.margemContribuicao)}
                      <span className="block text-[10px] text-emerald-600 font-mono">({c.margemContribuicaoPercent.toFixed(1)}% MC)</span>
                    </td>
                  ))}
                  <td className="p-3 text-right font-black text-emerald-800 bg-emerald-100/60 border-l border-emerald-200">
                    {formatCurrency(dreData.consolidated.margemContribuicao)}
                    <span className="block text-[10px] text-emerald-700 font-mono">({dreData.consolidated.margemContribuicaoPercent.toFixed(1)}% MC)</span>
                  </td>
                  <td className="p-3 text-right font-mono font-black text-emerald-800 bg-emerald-100/60">
                    {dreData.consolidated.margemContribuicaoPercent.toFixed(1)}%
                  </td>
                </tr>

                <tr className="hover:bg-slate-50 text-rose-600">
                  <td className="p-3">4. (-) Despesas Operacionais</td>
                  {dreData.companies.map((c) => (
                    <td key={c.companyId} className="p-3 text-right">
                      -{formatCurrency(c.despesasOperacionais)}
                    </td>
                  ))}
                  <td className="p-3 text-right font-semibold text-rose-700 bg-blue-50/30 border-l border-blue-100">
                    -{formatCurrency(dreData.consolidated.despesasOperacionais)}
                  </td>
                  <td className="p-3 text-right font-mono text-rose-600 bg-blue-50/30">
                    {dreData.consolidated.receitaLiquida > 0 ? ((dreData.consolidated.despesasOperacionais / dreData.consolidated.receitaLiquida) * 100).toFixed(1) : 0}%
                  </td>
                </tr>

                <tr className="bg-slate-100/80 font-bold text-slate-800">
                  <td className="p-3">(=) Resultado Operacional (EBITDA)</td>
                  {dreData.companies.map((c) => (
                    <td key={c.companyId} className="p-3 text-right font-bold">
                      {formatCurrency(c.resultadoOperacional)}
                      <span className="block text-[10px] text-slate-500 font-mono">({c.margemOperacional.toFixed(1)}%)</span>
                    </td>
                  ))}
                  <td className="p-3 text-right font-black text-slate-900 bg-slate-200/60 border-l border-slate-300">
                    {formatCurrency(dreData.consolidated.resultadoOperacional)}
                    <span className="block text-[10px] text-slate-600 font-mono">({dreData.consolidated.margemOperacional.toFixed(1)}%)</span>
                  </td>
                  <td className="p-3 text-right font-mono font-black text-slate-900 bg-slate-200/60">
                    {dreData.consolidated.margemOperacional.toFixed(1)}%
                  </td>
                </tr>

                <tr className="hover:bg-slate-50 text-slate-600">
                  <td className="p-3">5. (+/-) Resultado Financeiro</td>
                  {dreData.companies.map((c) => (
                    <td key={c.companyId} className="p-3 text-right">
                      {c.resultadoFinanceiro >= 0 ? '+' : ''}{formatCurrency(c.resultadoFinanceiro)}
                    </td>
                  ))}
                  <td className="p-3 text-right font-semibold text-slate-800 bg-blue-50/30 border-l border-blue-100">
                    {dreData.consolidated.resultadoFinanceiro >= 0 ? '+' : ''}{formatCurrency(dreData.consolidated.resultadoFinanceiro)}
                  </td>
                  <td className="p-3 text-right font-mono text-slate-500 bg-blue-50/30">
                    {dreData.consolidated.receitaLiquida > 0 ? ((dreData.consolidated.resultadoFinanceiro / dreData.consolidated.receitaLiquida) * 100).toFixed(1) : 0}%
                  </td>
                </tr>

                <tr className="bg-slate-900 text-white font-black text-sm">
                  <td className="p-3">(=) Resultado Líquido Gerencial</td>
                  {dreData.companies.map((c) => (
                    <td key={c.companyId} className="p-3 text-right font-black">
                      <span className={c.resultadoLiquido >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {formatCurrency(c.resultadoLiquido)}
                      </span>
                      <span className="block text-[10px] text-slate-400 font-mono font-normal">({c.margemLiquida.toFixed(1)}%)</span>
                    </td>
                  ))}
                  <td className="p-3 text-right font-black bg-black border-l border-slate-800">
                    <span className={dreData.consolidated.resultadoLiquido >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {formatCurrency(dreData.consolidated.resultadoLiquido)}
                    </span>
                    <span className="block text-[10px] text-slate-400 font-mono font-normal">({dreData.consolidated.margemLiquida.toFixed(1)}%)</span>
                  </td>
                  <td className="p-3 text-right font-mono font-black text-emerald-400 bg-black">
                    {dreData.consolidated.margemLiquida.toFixed(1)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CARD METODOLÓGICO E REGULATÓRIO */}
      <div className="bg-gradient-to-r from-blue-50 via-slate-50 to-indigo-50 p-5 rounded-2xl border border-blue-200 text-xs text-slate-700 space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
          <Info size={18} className="text-blue-600" />
          <span>Diretrizes e Metodologia Contábil Gerencial Aplicada (Indústria & Comércio)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 text-slate-600">
          <div className="bg-white/80 p-3 rounded-xl border border-blue-100">
            <strong className="text-slate-800 block mb-1">1. Não Duplicação de Compras (CPV/CMV):</strong>
            Compras de matéria-prima e insumos de embalagem (Grupo 9.1) entram no <strong>Ativo Circulante / Estoque</strong>. O custo só transita na DRE quando o produto é vendido.
          </div>
          <div className="bg-white/80 p-3 rounded-xl border border-blue-100">
            <strong className="text-slate-800 block mb-1">2. Segregação Fabril vs Revenda:</strong>
            Fórmula química vai para <strong>1.2 Fabricados</strong> e gera <strong>3.2 CPV</strong>. Terceirizados vão para <strong>1.1 Revenda</strong> e geram <strong>3.1 CMV</strong>.
          </div>
          <div className="bg-white/80 p-3 rounded-xl border border-blue-100">
            <strong className="text-slate-800 block mb-1">3. Margem de Contribuição (IMC):</strong>
            Calculada por <strong>Receita Líquida (-) Custos das Vendas (CMV/CPV)</strong>. Indica a capacidade financeira gerada pelas vendas para cobrir as despesas operacionais fixas e gerar lucro líquido.
          </div>
          <div className="bg-white/80 p-3 rounded-xl border border-blue-100">
            <strong className="text-slate-800 block mb-1">4. Neutralidade Multi-Empresas:</strong>
            Transferências internas entre Matriz e Filiais não alteram o resultado econômico consolidado, garantindo apuração sem faturamento fictício.
          </div>
        </div>
      </div>

      {/* DRILL-DOWN MODAL INTERATIVO */}
      {drillDownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-start pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">
                    {drillDownModal.code}
                  </span>
                  <h3 className="font-bold text-base text-slate-900">
                    {drillDownModal.title}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {drillDownModal.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrillDownModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex justify-between items-center text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="font-semibold text-slate-600">
                Total de Registros Encontrados: <strong>{drillDownModal.items.length}</strong>
              </span>
              <span className="font-bold text-slate-800">
                Soma Total da Linha:{' '}
                <strong className="text-sm font-black text-blue-700">
                  {formatCurrency(drillDownModal.total)}
                </strong>
              </span>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] sticky top-0">
                  <tr>
                    <th className="p-2.5">Data</th>
                    <th className="p-2.5">Empresa</th>
                    <th className="p-2.5">Doc / Ref</th>
                    <th className="p-2.5">Descrição do Registro</th>
                    <th className="p-2.5">Conta / Código</th>
                    <th className="p-2.5 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drillDownModal.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        Nenhum registro individual encontrado nesta linha para o período e empresa selecionados.
                      </td>
                    </tr>
                  ) : (
                    drillDownModal.items.map((it, idx) => (
                      <tr key={it.id || idx} className="hover:bg-slate-50/80">
                        <td className="p-2.5 text-slate-600 whitespace-nowrap">
                          {it.date ? new Date(it.date).toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="p-2.5 text-slate-700 font-semibold whitespace-nowrap">
                          {it.companyName}
                        </td>
                        <td className="p-2.5 font-mono text-[11px] font-bold text-slate-600">
                          {it.docRef}
                        </td>
                        <td className="p-2.5 text-slate-800 font-medium">
                          {it.description}
                        </td>
                        <td className="p-2.5 text-slate-600">
                          <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-md font-mono">
                            {it.categoryOrAccount}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(it.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDrillDownModal(null)}
                className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-black text-white rounded-xl shadow-xs cursor-pointer"
              >
                Fechar Drill-Down
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
