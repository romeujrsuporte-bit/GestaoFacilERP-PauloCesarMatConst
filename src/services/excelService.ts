/**
 * Serviço de Importação e Exportação de Planilhas Excel (.xlsx e .xls)
 * Utiliza SheetJS (xlsx) para leitura e escrita nativa nos formatos do Excel.
 */

import * as XLSX from 'xlsx';
import {
  Customer,
  Supplier,
  Product,
  StockLocation,
  UnitOfMeasure,
  Company,
  CompanyPriceOverride,
  CityItem,
  NeighborhoodItem,
  MarketAreaItem,
  DeliveryRoute,
} from '../types';

export interface ValidationIssue {
  rowNumber: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ImportPreview<T> {
  validRows: T[];
  invalidRows: { rowNumber: number; data: any; issues: ValidationIssue[] }[];
  summary: {
    totalRows: number;
    validCount: number;
    invalidCount: number;
    toInsertCount: number;
    toUpdateCount: number;
  };
}

export interface StockImportRow {
  productCode: string;
  productDescription: string;
  productId: string;
  locationCode: string;
  locationName: string;
  locationId: string;
  companyName: string;
  companyId: string;
  quantity: number;
  minStock: number;
  referenceDate?: string;
  notes?: string;
}

export class ExcelService {
  /**
   * Baixa um arquivo Excel (.xlsx) no navegador
   */
  public static downloadExcel(workbook: XLSX.WorkBook, fileName: string) {
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Lê um arquivo Excel (.xlsx ou .xls) enviado pelo usuário
   */
  public static async parseExcelFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          resolve(json);
        } catch (error) {
          reject(new Error('Erro ao processar o arquivo Excel: ' + (error as Error).message));
        }
      };
      reader.onerror = () => reject(new Error('Falha na leitura do arquivo'));
      reader.readAsArrayBuffer(file);
    });
  }

  // ==========================================
  // MODELOS OFICIAIS PARA DOWNLOAD
  // ==========================================

  public static generateCustomerTemplate(companies?: Company[]): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    const matrizCompany = companies?.find(c => c.type === 'matriz') || companies?.[0];
    const filialCompany = companies?.find(c => c.type === 'filial');
    const matrizLabel = matrizCompany ? (matrizCompany.tradeName || matrizCompany.name) : 'Imperial Limpeza - Matriz Feira de Santana';
    const filialLabel = filialCompany ? (filialCompany.tradeName || filialCompany.name) : 'Imperial Limpeza - Filial Alagoinhas';

    const data = [
      {
        'Empresa': matrizLabel,
        'Codigo': 'CLI-001',
        'Nome_RazaoSocial': 'Supermercado Nova Era Ltda',
        'NomeFantasia': 'Nova Era Feira',
        'Tipo': 'PJ',
        'CPF_CNPJ': '12.345.678/0001-90',
        'Telefone': '(75) 3222-1000',
        'WhatsApp': '(75) 98765-4321',
        'Email': 'contato@novaerafeira.com.br',
        'CEP': '44001-000',
        'Logradouro': 'Av. Getúlio Vargas',
        'Numero': '100',
        'Complemento': 'Loja A',
        'Bairro': 'Centro',
        'Cidade': 'Feira de Santana',
        'UF': 'BA',
        'LimiteCredito': 5000.00,
        'CondicaoPagamento': '30 dias',
        'Status': 'Ativo',
        'Observacoes': 'Cliente preferencial atacado - Atendido pela Matriz Feira de Santana'
      },
      {
        'Empresa': filialLabel,
        'Codigo': 'CLI-002',
        'Nome_RazaoSocial': 'João Carlos da Silva',
        'NomeFantasia': '',
        'Tipo': 'PF',
        'CPF_CNPJ': '123.456.789-00',
        'Telefone': '(75) 3422-4455',
        'WhatsApp': '(75) 99887-6655',
        'Email': 'joao.silva@email.com',
        'CEP': '48005-100',
        'Logradouro': 'Av. Dantas Bião',
        'Numero': '500',
        'Complemento': 'Casa',
        'Bairro': 'Alagoinhas Velha',
        'Cidade': 'Alagoinhas',
        'UF': 'BA',
        'LimiteCredito': 1000.00,
        'CondicaoPagamento': 'À Vista',
        'Status': 'Ativo',
        'Observacoes': 'Consumidor final assíduo - Atendido pela Filial Alagoinhas'
      },
      {
        'Empresa': 'Todas',
        'Codigo': 'CLI-003',
        'Nome_RazaoSocial': 'Comercial Distribuição Recôncavo Eireli',
        'NomeFantasia': 'Recôncavo Atacado',
        'Tipo': 'PJ',
        'CPF_CNPJ': '44.555.666/0001-22',
        'Telefone': '(75) 3631-9000',
        'WhatsApp': '(75) 97777-8888',
        'Email': 'compras@reconcavoatacado.com.br',
        'CEP': '44572-000',
        'Logradouro': 'Av. Roberto Santos',
        'Numero': '1800',
        'Complemento': 'Galpão 2',
        'Bairro': 'Centro',
        'Cidade': 'Santo Antônio de Jesus',
        'UF': 'BA',
        'LimiteCredito': 15000.00,
        'CondicaoPagamento': '28 dias',
        'Status': 'Ativo',
        'Observacoes': 'Cliente corporativo com acesso liberado a todas as unidades'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    return wb;
  }

  public static generateSupplierTemplate(companies?: Company[]): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    const matrizCompany = companies?.find(c => c.type === 'matriz') || companies?.[0];
    const matrizLabel = matrizCompany ? (matrizCompany.tradeName || matrizCompany.name) : 'Imperial Limpeza - Matriz Feira de Santana';

    const data = [
      {
        'Empresa': matrizLabel,
        'Codigo': 'FOR-001',
        'Nome_RazaoSocial': 'Distribuidora Química Bahia S.A.',
        'NomeFantasia': 'Química Bahia',
        'Tipo': 'PJ',
        'CPF_CNPJ': '98.765.432/0001-10',
        'Contato': 'Roberto Mendes',
        'Telefone': '(71) 3621-2000',
        'WhatsApp': '(71) 97123-4567',
        'Email': 'vendas@quimicabahia.com.br',
        'CEP': '42810-000',
        'Logradouro': 'Via Atlântica (Polo Petroquímico)',
        'Numero': 'Km 10',
        'Complemento': 'Galpão 3',
        'Bairro': 'Polo Industrial',
        'Cidade': 'Camaçari',
        'UF': 'BA',
        'CondicoesPagamento': '28/56 dias',
        'Status': 'Ativo',
        'Observacoes': 'Fornecedor homologado para compras da Matriz'
      },
      {
        'Empresa': 'Todas',
        'Codigo': 'FOR-002',
        'Nome_RazaoSocial': 'Embalagens PlastFlex Nordeste Ltda',
        'NomeFantasia': 'PlastFlex BA',
        'Tipo': 'PJ',
        'CPF_CNPJ': '11.222.333/0001-44',
        'Contato': 'Camila Silveira',
        'Telefone': '(75) 3344-5566',
        'WhatsApp': '(75) 98888-9999',
        'Email': 'pedidos@plastflexba.com.br',
        'CEP': '44001-490',
        'Logradouro': 'Av. Eduardo Fróes da Mota (Anel de Contorno)',
        'Numero': '450',
        'Complemento': 'CIS Tomba',
        'Bairro': 'Tomba',
        'Cidade': 'Feira de Santana',
        'UF': 'BA',
        'CondicoesPagamento': '30 dias',
        'Status': 'Ativo',
        'Observacoes': 'Fornecedor compartilhado com faturamento direto para todas as unidades'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Fornecedores');
    return wb;
  }

  public static generateProductTemplate(availableLocations: StockLocation[], companies?: Company[]): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    const matrizCompany = companies?.find(c => c.type === 'matriz') || companies?.[0];
    const filialCompany = companies?.find(c => c.type === 'filial');
    const filial2Company = companies?.filter(c => c.type === 'filial')[1];

    const matrizLabel = matrizCompany ? (matrizCompany.tradeName || matrizCompany.name) : 'Imperial Limpeza - Matriz Feira de Santana';
    const filialLabel = filialCompany ? (filialCompany.tradeName || filialCompany.name) : 'Imperial Limpeza - Filial Alagoinhas';
    const filial2Label = filial2Company ? (filial2Company.tradeName || filial2Company.name) : 'Filial 02 - Recôncavo';

    const defaultLoc = availableLocations.find(l => !l.companyId || (matrizCompany && l.companyId === matrizCompany.id))?.code || 'COM-01';
    const filialLoc = (filialCompany && availableLocations.find(l => l.companyId === filialCompany.id)?.code) || 'COM-FIL';

    const data = [
      {
        'Empresa': matrizLabel,
        'Codigo': 'PROD-101',
        'CodigoReferencia': 'FORN-DET-500',
        'Descricao': 'Detergente Neutro 500ml',
        'Unidade': 'UN',
        'Custo': 2.10,
        'PrecoVenda': 4.50,
        'Familia': 'Limpeza',
        'Grupo': 'Detergentes',
        'CodigoBarras': '7891234560012',
        'EstoqueMinimo': 20,
        'Tipo': 'Revenda',
        'PossuiComposicao': 'Nao',
        'CodigoLocalPadrao': defaultLoc,
        'Status': 'Ativo',
        'EmbalagemMaster': 'Nao',
        'CodigoProdutoAssociado': '',
        'DescricaoProdutoAssociado': '',
        'UnidadesPorEmbalagem': '',
        'TipoEmbalagem': '',
        'ImpostosPercent': 6.0,
        'DespesasOperacionaisPercent': 10.0,
        'ComissaoPercent': 3.0,
        'OutrosCustosPercent': 1.0,
        'MargemLucroDesejadaPercent': 20.0,
        'Observacoes': 'Cadastro compartilhado - Preço de venda e estoque mínimo padrão da Matriz'
      },
      {
        'Empresa': filialLabel,
        'Codigo': 'PROD-101',
        'Descricao': 'Detergente Neutro 500ml',
        'Unidade': 'UN',
        'Custo': 2.10,
        'PrecoVenda': 4.90,
        'Familia': 'Limpeza',
        'Grupo': 'Detergentes',
        'CodigoBarras': '7891234560012',
        'EstoqueMinimo': 15,
        'Tipo': 'Revenda',
        'PossuiComposicao': 'Nao',
        'CodigoLocalPadrao': filialLoc,
        'Status': 'Ativo',
        'EmbalagemMaster': 'Nao',
        'CodigoProdutoAssociado': '',
        'DescricaoProdutoAssociado': '',
        'UnidadesPorEmbalagem': '',
        'TipoEmbalagem': '',
        'ImpostosPercent': 6.0,
        'DespesasOperacionaisPercent': 10.0,
        'ComissaoPercent': 3.0,
        'OutrosCustosPercent': 1.0,
        'MargemLucroDesejadaPercent': 25.0,
        'Observacoes': 'Tabela de preços individual da Filial 01 (R$ 4,90) e estoque mínimo da filial (15 UN)'
      },
      {
        'Empresa': filial2Label,
        'Codigo': 'PROD-101',
        'Descricao': 'Detergente Neutro 500ml',
        'Unidade': 'UN',
        'Custo': 2.10,
        'PrecoVenda': 4.75,
        'Familia': 'Limpeza',
        'Grupo': 'Detergentes',
        'CodigoBarras': '7891234560012',
        'EstoqueMinimo': 10,
        'Tipo': 'Revenda',
        'PossuiComposicao': 'Nao',
        'CodigoLocalPadrao': filialLoc,
        'Status': 'Ativo',
        'EmbalagemMaster': 'Nao',
        'CodigoProdutoAssociado': '',
        'DescricaoProdutoAssociado': '',
        'UnidadesPorEmbalagem': '',
        'TipoEmbalagem': '',
        'ImpostosPercent': 6.0,
        'DespesasOperacionaisPercent': 10.0,
        'ComissaoPercent': 3.0,
        'OutrosCustosPercent': 1.0,
        'MargemLucroDesejadaPercent': 22.0,
        'Observacoes': 'Tabela de preços individual da Filial 02 (R$ 4,75) e estoque mínimo da filial (10 UN)'
      },
      {
        'Empresa': matrizLabel,
        'Codigo': 'CX-301-24',
        'Descricao': 'Caixa Detergente Neutro 500ml c/ 24 UN',
        'Unidade': 'CX',
        'Custo': 50.40,
        'PrecoVenda': 102.60,
        'Familia': 'Limpeza',
        'Grupo': 'Embalagens Master',
        'CodigoBarras': '7891234569999',
        'EstoqueMinimo': 5,
        'Tipo': 'Revenda',
        'PossuiComposicao': 'Nao',
        'CodigoLocalPadrao': defaultLoc,
        'Status': 'Ativo',
        'EmbalagemMaster': 'Sim',
        'CodigoProdutoAssociado': 'PROD-101',
        'DescricaoProdutoAssociado': 'Detergente Neutro 500ml',
        'UnidadesPorEmbalagem': 24,
        'TipoEmbalagem': 'Caixa',
        'ImpostosPercent': 6.0,
        'DespesasOperacionaisPercent': 10.0,
        'ComissaoPercent': 3.0,
        'OutrosCustosPercent': 1.0,
        'MargemLucroDesejadaPercent': 20.0,
        'Observacoes': 'Embalagem Master contendo 24 unidades do item PROD-101. Toda venda baixa 24 UN no estoque da empresa da operação.'
      },
      {
        'Empresa': matrizLabel,
        'Codigo': 'COMP-201',
        'Descricao': 'Essência Lavanda Concentrada',
        'Unidade': 'L',
        'Custo': 45.00,
        'PrecoVenda': 0.00,
        'Familia': 'Matéria-Prima',
        'Grupo': 'Essências',
        'CodigoBarras': '7891234560099',
        'EstoqueMinimo': 5,
        'Tipo': 'Componente',
        'PossuiComposicao': 'Nao',
        'CodigoLocalPadrao': availableLocations.find(l => l.type === 'materia_prima')?.code || defaultLoc,
        'Status': 'Ativo',
        'EmbalagemMaster': 'Nao',
        'CodigoProdutoAssociado': '',
        'DescricaoProdutoAssociado': '',
        'UnidadesPorEmbalagem': '',
        'TipoEmbalagem': '',
        'ImpostosPercent': 0,
        'DespesasOperacionaisPercent': 0,
        'ComissaoPercent': 0,
        'OutrosCustosPercent': 0,
        'MargemLucroDesejadaPercent': 0,
        'Observacoes': 'Matéria-prima para fabricação mantida no almoxarifado central da Matriz'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    return wb;
  }

  public static generatePurchaseOrderTemplate(companies?: Company[]): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    const matrizCompany = companies?.find(c => c.type === 'matriz') || companies?.[0];
    const filialCompany = companies?.find(c => c.type === 'filial');
    const matrizLabel = matrizCompany ? (matrizCompany.tradeName || matrizCompany.name) : 'Imperial Limpeza - Matriz Feira de Santana';
    const filialLabel = filialCompany ? (filialCompany.tradeName || filialCompany.name) : 'Imperial Limpeza - Filial Alagoinhas';

    const data = [
      {
        'Empresa': matrizLabel,
        'NumeroPedido': 'PC-2026-001',
        'CodigoFornecedor': 'FOR-001',
        'DataPedido': '2026-10-04',
        'DataEntregaPrevista': '2026-10-10',
        'CondicaoPagamento': '30/60 dias',
        'CodigoProduto': 'PROD-101',
        'DescricaoConferencia': 'Detergente Neutro 500ml',
        'Quantidade': 100,
        'UnidadeCompra': 'CX',
        'FatorEmbalagem': 12,
        'CustoUnitarioCompra': 24.00,
        'Desconto': 10.00,
        'FreteRateado': 25.00,
        'OutrasDespesas': 0.00,
        'CodigoLocalDestino': 'COM-01',
        'Observacoes': 'Remessa destinada ao armazém central da Matriz'
      },
      {
        'Empresa': filialLabel,
        'NumeroPedido': 'PC-2026-002',
        'CodigoFornecedor': 'FOR-001',
        'DataPedido': '2026-10-04',
        'DataEntregaPrevista': '2026-10-11',
        'CondicaoPagamento': '30 dias',
        'CodigoProduto': 'PROD-101',
        'DescricaoConferencia': 'Detergente Neutro 500ml',
        'Quantidade': 40,
        'UnidadeCompra': 'CX',
        'FatorEmbalagem': 12,
        'CustoUnitarioCompra': 24.50,
        'Desconto': 0.00,
        'FreteRateado': 15.00,
        'OutrasDespesas': 0.00,
        'CodigoLocalDestino': 'COM-FIL',
        'Observacoes': 'Entrega direta efetuada pelo fornecedor na Filial'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Pedido_Compra');
    return wb;
  }

  public static generateInitialStockTemplate(availableLocations?: StockLocation[], companies?: Company[]): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    const matrizCompany = companies?.find(c => c.type === 'matriz') || companies?.[0];
    const filialCompany = companies?.find(c => c.type === 'filial');
    const filial2Company = companies?.filter(c => c.type === 'filial')[1];

    const matrizLabel = matrizCompany ? (matrizCompany.tradeName || matrizCompany.name) : 'Imperial Limpeza - Matriz Feira de Santana';
    const filialLabel = filialCompany ? (filialCompany.tradeName || filialCompany.name) : 'Imperial Limpeza - Filial Alagoinhas';
    const filial2Label = filial2Company ? (filial2Company.tradeName || filial2Company.name) : 'Filial 02 - Recôncavo';

    const defaultLoc = availableLocations?.find(l => !l.companyId || (matrizCompany && l.companyId === matrizCompany.id))?.code || 'COM-01';
    const filialLoc = (filialCompany && availableLocations?.find(l => l.companyId === filialCompany.id)?.code) || 'COM-FIL';

    const data = [
      {
        'Empresa': matrizLabel,
        'CodigoProduto': 'PROD-101',
        'CodigoLocal': defaultLoc,
        'QuantidadeInicial': 100,
        'EstoqueMinimo': 25,
        'DataReferencia': '2026-10-04',
        'Observacoes': 'Inventário de implantação - Estoque Matriz (100 UN)'
      },
      {
        'Empresa': filialLabel,
        'CodigoProduto': 'PROD-101',
        'CodigoLocal': filialLoc,
        'QuantidadeInicial': 50,
        'EstoqueMinimo': 15,
        'DataReferencia': '2026-10-04',
        'Observacoes': 'Inventário de implantação - Estoque Filial 01 (50 UN)'
      },
      {
        'Empresa': filial2Label,
        'CodigoProduto': 'PROD-101',
        'CodigoLocal': filialLoc,
        'QuantidadeInicial': 30,
        'EstoqueMinimo': 10,
        'DataReferencia': '2026-10-04',
        'Observacoes': 'Inventário de implantação - Estoque Filial 02 (30 UN)'
      },
      {
        'Empresa': matrizLabel,
        'CodigoProduto': 'COMP-201',
        'CodigoLocal': availableLocations?.find(l => l.type === 'materia_prima')?.code || defaultLoc,
        'QuantidadeInicial': 80,
        'EstoqueMinimo': 10,
        'DataReferencia': '2026-10-04',
        'Observacoes': 'Saldo inicial de insumo químico (Matéria-prima Matriz)'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Carga_Estoque');
    return wb;
  }

  public static generateCitiesTemplate(companies?: Company[]): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    const matrizCompany = companies?.find((c) => c.type === 'matriz') || companies?.[0];
    const filialCompany = companies?.find((c) => c.type === 'filial');
    const matrizLabel = matrizCompany ? matrizCompany.tradeName || matrizCompany.name : 'Imperial Limpeza - Matriz Feira de Santana';
    const filialLabel = filialCompany ? filialCompany.tradeName || filialCompany.name : 'Imperial Limpeza - Filial Alagoinhas';

    const data = [
      {
        Empresa: matrizLabel,
        NomeCidade: 'Feira de Santana',
        UF: 'BA',
        CodigoIBGE: '2910800',
        DistanciaFeiraKm: 0,
        PracaComercial: 'Feira de Santana - Sede',
        RotaPadrao: 'Rota 01 - Feira de Santana (Sede & Entorno)',
        Status: 'Ativo',
      },
      {
        Empresa: filialLabel,
        NomeCidade: 'Alagoinhas',
        UF: 'BA',
        CodigoIBGE: '2900702',
        DistanciaFeiraKm: 78,
        PracaComercial: 'Litoral Norte & Alagoinhas',
        RotaPadrao: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)',
        Status: 'Ativo',
      },
      {
        Empresa: 'Todas',
        NomeCidade: 'Santo Antônio de Jesus',
        UF: 'BA',
        CodigoIBGE: '2928703',
        DistanciaFeiraKm: 94,
        PracaComercial: 'Recôncavo Baiano',
        RotaPadrao: 'Rota 02 - Recôncavo (Cachoeira, Cruz das Almas & SAJ)',
        Status: 'Ativo',
      },
      {
        Empresa: 'Todas',
        NomeCidade: 'Serrinha',
        UF: 'BA',
        CodigoIBGE: '2930501',
        DistanciaFeiraKm: 74,
        PracaComercial: 'Portal do Sertão & Sisal',
        RotaPadrao: 'Rota 04 - Sisal & Portal Norte (Serrinha, Coité & Riachão)',
        Status: 'Ativo',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Cidades');
    return wb;
  }

  public static generateNeighborhoodsTemplate(companies?: Company[]): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    const matrizCompany = companies?.find((c) => c.type === 'matriz') || companies?.[0];
    const filialCompany = companies?.find((c) => c.type === 'filial');
    const matrizLabel = matrizCompany ? matrizCompany.tradeName || matrizCompany.name : 'Imperial Limpeza - Matriz Feira de Santana';
    const filialLabel = filialCompany ? filialCompany.tradeName || filialCompany.name : 'Imperial Limpeza - Filial Alagoinhas';

    const data = [
      {
        Empresa: matrizLabel,
        NomeBairro: 'Centro',
        Cidade: 'Feira de Santana',
        UF: 'BA',
        FaixaCEP: '44001',
        PracaComercial: 'Feira de Santana - Sede',
        RotaPadrao: 'Rota 01 - Feira de Santana (Sede & Entorno)',
        Status: 'Ativo',
      },
      {
        Empresa: matrizLabel,
        NomeBairro: 'Kalilândia',
        Cidade: 'Feira de Santana',
        UF: 'BA',
        FaixaCEP: '44001',
        PracaComercial: 'Feira de Santana - Sede',
        RotaPadrao: 'Rota 01 - Feira de Santana (Sede & Entorno)',
        Status: 'Ativo',
      },
      {
        Empresa: matrizLabel,
        NomeBairro: 'Santa Mônica',
        Cidade: 'Feira de Santana',
        UF: 'BA',
        FaixaCEP: '44077',
        PracaComercial: 'Feira de Santana - Sede',
        RotaPadrao: 'Rota 01 - Feira de Santana (Sede & Entorno)',
        Status: 'Ativo',
      },
      {
        Empresa: filialLabel,
        NomeBairro: 'Alagoinhas Velha',
        Cidade: 'Alagoinhas',
        UF: 'BA',
        FaixaCEP: '48005',
        PracaComercial: 'Litoral Norte & Alagoinhas',
        RotaPadrao: 'Rota 03 - Litoral Norte & Alagoinhas (Alagoinhas, Catu & Camaçari)',
        Status: 'Ativo',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Bairros');
    return wb;
  }

  // ==========================================
  // VALIDAÇÕES DE IMPORTAÇÃO
  // ==========================================

  public static validateProductsImport(
    rows: any[],
    existingProducts: Product[],
    locations: StockLocation[],
    mode: 'insert_only' | 'insert_update',
    companies?: Company[]
  ): ImportPreview<Partial<Product> & { targetCompanyId?: string; targetCompanyName?: string }> {
    const validRows: (Partial<Product> & { targetCompanyId?: string; targetCompanyName?: string })[] = [];
    const invalidRows: { rowNumber: number; data: any; issues: ValidationIssue[] }[] = [];

    const existingCodes = new Set(existingProducts.map((p) => p.code.toUpperCase()));
    const existingBarcodes = new Set(existingProducts.map((p) => p.barcode).filter(Boolean));
    const locationCodes = new Map(locations.map((l) => [l.code.toUpperCase(), l.id]));

    let toInsertCount = 0;
    let toUpdateCount = 0;

    rows.forEach((row, index) => {
      const rowNumber = index + 2; // +1 cabeçalho, 1-based
      const issues: ValidationIssue[] = [];

      const companyRaw = String(row['Empresa'] || row['Filial'] || row['Unidade'] || '').trim();
      const code = String(row['Codigo'] || row['Código'] || '').trim();
      const referenceCode = String(
        row['CodigoReferencia'] || row['Código Referência'] || row['Codigo Referencia'] || row['Referencia'] || ''
      ).trim();
      const description = String(row['Descricao'] || row['Descrição'] || '').trim();
      const unit = String(row['Unidade'] || '').trim().toUpperCase() as UnitOfMeasure;
      const cost = Number(row['Custo'] ?? row['Custo Unitário'] ?? 0);
      const salePrice = Number(row['PrecoVenda'] ?? row['Preço de Venda'] ?? 0);
      const barcode = String(row['CodigoBarras'] || row['Código de Barras'] || '').trim();
      const locCode = String(row['CodigoLocalPadrao'] || row['Local Padrão'] || row['LocalPadrao'] || '').trim().toUpperCase();
      const typeStr = String(row['Tipo'] || '').trim().toLowerCase();

      // Identificar Empresa / Filial alvo (se especificada na planilha)
      let matchedCompany: Company | undefined;
      if (companyRaw && companies && companies.length > 0) {
        matchedCompany = companies.find((c) =>
          c.id.toLowerCase() === companyRaw.toLowerCase() ||
          c.tradeName.toLowerCase() === companyRaw.toLowerCase() ||
          c.name.toLowerCase() === companyRaw.toLowerCase() ||
          (c.type === 'matriz' && companyRaw.toLowerCase().includes('matriz')) ||
          (c.type === 'filial' && (
            companyRaw.toLowerCase().includes(c.tradeName.toLowerCase()) ||
            companyRaw.toLowerCase().includes('filial')
          ))
        );
      }

      // Reconhecimento flexível de colunas de Embalagem Master
      const isMasterRaw = String(
        row['EmbalagemMaster'] ??
        row['Embalagem Master'] ??
        row['É Embalagem Master?'] ??
        row['IsMasterPack'] ??
        ''
      ).trim().toLowerCase();
      const isMasterPack = isMasterRaw.includes('s') || isMasterRaw === 'true' || isMasterRaw === '1';

      const assocCode = String(
        row['CodigoProdutoAssociado'] ??
        row['Código Produto Associado'] ??
        row['CodigoProdutoUnitario'] ??
        row['Código Produto Unitário Associado'] ??
        row['ProdutoAssociado'] ??
        ''
      ).trim();

      const unitsRaw = Number(
        row['UnidadesPorEmbalagem'] ??
        row['Unidades por Embalagem Master'] ??
        row['QuantidadePorEmbalagem'] ??
        row['UnidadesEmbalagemMaster'] ??
        row['masterPackUnits'] ??
        10
      );
      const masterPackUnits = (!isNaN(unitsRaw) && unitsRaw > 0) ? unitsRaw : 10;

      const pkgTypeRaw = String(
        row['TipoEmbalagem'] ??
        row['Tipo de Embalagem Master'] ??
        row['TipoEmbalagemMaster'] ??
        row['masterPackPackagingType'] ??
        'caixa'
      ).trim().toLowerCase();

      const validPkgTypes: ('caixa' | 'pacote' | 'fardo' | 'display' | 'kit' | 'outro')[] = [
        'caixa', 'pacote', 'fardo', 'display', 'kit', 'outro'
      ];
      const masterPackPackagingType = validPkgTypes.includes(pkgTypeRaw as any)
        ? (pkgTypeRaw as 'caixa' | 'pacote' | 'fardo' | 'display' | 'kit' | 'outro')
        : 'caixa';

      if (!code) {
        issues.push({ rowNumber, field: 'Codigo', message: 'Código interno é obrigatório.', severity: 'error' });
      }
      if (!description) {
        issues.push({ rowNumber, field: 'Descricao', message: 'Descrição do produto é obrigatória.', severity: 'error' });
      }

      const validUnits: UnitOfMeasure[] = ['UN', 'KG', 'G', 'L', 'ML', 'M', 'M²', 'M³', 'CX', 'PCT'];
      if (!unit || !validUnits.includes(unit)) {
        issues.push({ rowNumber, field: 'Unidade', message: `Unidade inválida (${unit}). Aceitas: ${validUnits.join(', ')}`, severity: 'error' });
      }

      if (isNaN(cost) || cost < 0) {
        issues.push({ rowNumber, field: 'Custo', message: 'Custo unitário inválido.', severity: 'error' });
      }

      if (isNaN(salePrice) || salePrice < 0) {
        issues.push({ rowNumber, field: 'PrecoVenda', message: 'Preço de venda inválido.', severity: 'error' });
      }

      if (isMasterPack) {
        if (!assocCode) {
          issues.push({
            rowNumber,
            field: 'CodigoProdutoAssociado',
            message: 'O campo "CodigoProdutoAssociado" é obrigatório quando o produto for cadastrado como Embalagem Master.',
            severity: 'error'
          });
        } else if (assocCode.toUpperCase() === code.toUpperCase()) {
          issues.push({
            rowNumber,
            field: 'CodigoProdutoAssociado',
            message: 'A Embalagem Master não pode ser associada a ela mesma.',
            severity: 'error'
          });
        }
      }

      // Procurar produto associado na base ou no próprio lote
      let assocProd = existingProducts.find(
        (p) => p.code.toUpperCase() === assocCode.toUpperCase()
      );
      if (!assocProd && assocCode) {
        const foundInBatch = rows.find(
          (r) => String(r['Codigo'] || r['Código'] || '').trim().toUpperCase() === assocCode.toUpperCase()
        );
        if (foundInBatch) {
          assocProd = {
            id: 'pending-' + assocCode,
            code: assocCode,
            description: String(foundInBatch['Descricao'] || foundInBatch['Descrição'] || assocCode).trim(),
          } as Product;
        }
      }

      if (isMasterPack && assocCode && !assocProd) {
        issues.push({
          rowNumber,
          field: 'CodigoProdutoAssociado',
          message: `Aviso: Produto unitário "${assocCode}" não localizado no sistema. O vínculo será tentado pelo código.`,
          severity: 'warning'
        });
      }

      const isUpdate = existingCodes.has(code.toUpperCase());

      if (isUpdate && mode === 'insert_only' && (!matchedCompany || matchedCompany.type === 'matriz')) {
        issues.push({ rowNumber, field: 'Codigo', message: `Produto com código "${code}" já existe no cadastro.`, severity: 'error' });
      }

      let matchedLocId = locations[0]?.id || '';
      if (locCode && locationCodes.has(locCode)) {
        matchedLocId = locationCodes.get(locCode)!;
      } else if (locCode) {
        issues.push({ rowNumber, field: 'CodigoLocalPadrao', message: `Local de estoque "${locCode}" não encontrado. Usando padrão.`, severity: 'warning' });
      } else if (matchedCompany) {
        const compLoc = locations.find((l) => l.companyId === matchedCompany!.id);
        if (compLoc) matchedLocId = compLoc.id;
      }

      if (barcode && existingBarcodes.has(barcode) && (!isUpdate || mode === 'insert_only')) {
        issues.push({ rowNumber, field: 'CodigoBarras', message: `Código de barras "${barcode}" já cadastrado para outro produto.`, severity: 'warning' });
      }

      if (issues.some((i) => i.severity === 'error')) {
        invalidRows.push({ rowNumber, data: row, issues });
      } else {
        if (isUpdate) toUpdateCount++;
        else toInsertCount++;

        const minStockNum = Number(row['EstoqueMinimo'] || row['Estoque Mínimo'] || 0);

        // Preço e estoque específico para filial se for empresa do tipo filial
        let companyPrices: Record<string, CompanyPriceOverride> | undefined;
        if (matchedCompany && matchedCompany.type === 'filial') {
          companyPrices = {
            [matchedCompany.id]: {
              salePrice,
              costPrice: cost,
              minStock: minStockNum,
              updatedAt: new Date().toISOString(),
              updatedBy: 'Importação Excel',
            },
          };
        }

        const product: Partial<Product> & { targetCompanyId?: string; targetCompanyName?: string } = {
          code,
          referenceCode,
          description,
          unit,
          costPrice: cost,
          salePrice,
          family: String(row['Familia'] || row['Família'] || 'Geral').trim(),
          group: String(row['Grupo'] || (isMasterPack ? 'Embalagens Master' : 'Geral')).trim(),
          barcode,
          minStock: minStockNum,
          productType: typeStr === 'componente' ? 'componente' : 'revenda',
          hasComposition: String(row['PossuiComposicao'] || row['Possui Composição'] || '').toLowerCase().includes('s'),
          defaultLocationId: matchedLocId,
          status: String(row['Status'] || '').toLowerCase().includes('inativ') ? 'inativo' : 'ativo',
          taxPercent: Number(row['ImpostosPercent'] || row['Impostos %'] || 0),
          operatingExpensesPercent: Number(row['DespesasOperacionaisPercent'] || row['Despesas Operacionais %'] || 0),
          salesCommissionPercent: Number(row['ComissaoPercent'] || row['Comissão %'] || 0),
          otherCostsPercent: Number(row['OutrosCustosPercent'] || 0),
          profitMarginPercent: Number(row['MargemLucroDesejadaPercent'] || row['Margem Lucro %'] || 0),
          notes: String(row['Observacoes'] || row['Observações'] || '').trim(),
          isMasterPack,
          masterPackAssociatedProductCode: isMasterPack ? assocCode : undefined,
          masterPackAssociatedProductDescription: isMasterPack ? (assocProd?.description || assocCode) : undefined,
          masterPackAssociatedProductId: isMasterPack && assocProd && !assocProd.id.startsWith('pending-') ? assocProd.id : undefined,
          masterPackUnits: isMasterPack ? masterPackUnits : undefined,
          masterPackPackagingType: isMasterPack ? masterPackPackagingType : undefined,
          companyPrices,
          targetCompanyId: matchedCompany?.id,
          targetCompanyName: matchedCompany?.tradeName || matchedCompany?.name || companyRaw,
        };

        validRows.push(product);
      }
    });

    return {
      validRows,
      invalidRows,
      summary: {
        totalRows: rows.length,
        validCount: validRows.length,
        invalidCount: invalidRows.length,
        toInsertCount,
        toUpdateCount,
      },
    };
  }

  /**
   * Validação para Importação de Carga Inicial de Estoque com suporte a Matriz e Filiais
   */
  public static validateInitialStockImport(
    rows: any[],
    products: Product[],
    locations: StockLocation[],
    companies?: Company[]
  ): ImportPreview<StockImportRow> {
    const validRows: StockImportRow[] = [];
    const invalidRows: { rowNumber: number; data: any; issues: ValidationIssue[] }[] = [];

    const productMap = new Map(products.map((p) => [p.code.toUpperCase(), p]));
    const locationCodeMap = new Map(locations.map((l) => [l.code.toUpperCase(), l]));
    const matrizCompany = companies?.find((c) => c.type === 'matriz') || companies?.[0];

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const issues: ValidationIssue[] = [];

      const companyRaw = String(row['Empresa'] || row['Filial'] || '').trim();
      const productCode = String(row['CodigoProduto'] || row['Código Produto'] || row['Codigo'] || '').trim().toUpperCase();
      const locCode = String(row['CodigoLocal'] || row['Local'] || '').trim().toUpperCase();
      const qty = Number(row['QuantidadeInicial'] ?? row['Quantidade'] ?? 0);
      const minStock = Number(row['EstoqueMinimo'] ?? row['Estoque Mínimo'] ?? 0);
      const referenceDate = String(row['DataReferencia'] || row['Data'] || '').trim();
      const notes = String(row['Observacoes'] || row['Observações'] || '').trim();

      if (!productCode) {
        issues.push({ rowNumber, field: 'CodigoProduto', message: 'Código do produto é obrigatório.', severity: 'error' });
      }

      const matchedProd = productMap.get(productCode);
      if (!matchedProd && productCode) {
        issues.push({ rowNumber, field: 'CodigoProduto', message: `Produto "${productCode}" não encontrado no cadastro central.`, severity: 'error' });
      }

      if (isNaN(qty) || qty < 0) {
        issues.push({ rowNumber, field: 'QuantidadeInicial', message: 'Quantidade inicial inválida.', severity: 'error' });
      }

      // Identificar Empresa
      let matchedComp: Company | undefined;
      if (companyRaw && companies && companies.length > 0) {
        matchedComp = companies.find(
          (c) =>
            c.id.toLowerCase() === companyRaw.toLowerCase() ||
            c.tradeName.toLowerCase() === companyRaw.toLowerCase() ||
            c.name.toLowerCase() === companyRaw.toLowerCase() ||
            (c.type === 'matriz' && companyRaw.toLowerCase().includes('matriz')) ||
            (c.type === 'filial' && (
              companyRaw.toLowerCase().includes(c.tradeName.toLowerCase()) ||
              companyRaw.toLowerCase().includes('filial')
            ))
        );
      }
      if (!matchedComp) {
        matchedComp = matrizCompany;
      }

      // Identificar Local de Estoque
      let matchedLoc: StockLocation | undefined;
      if (locCode && locationCodeMap.has(locCode)) {
        matchedLoc = locationCodeMap.get(locCode);
      } else if (matchedComp) {
        // Encontra o depósito comercial da empresa selecionada
        matchedLoc = locations.find((l) => l.companyId === matchedComp!.id && l.status === 'ativo') || locations[0];
      } else {
        matchedLoc = locations[0];
      }

      if (!matchedLoc) {
        issues.push({ rowNumber, field: 'CodigoLocal', message: 'Nenhum local de estoque compatível encontrado.', severity: 'error' });
      }

      if (issues.some((i) => i.severity === 'error')) {
        invalidRows.push({ rowNumber, data: row, issues });
      } else if (matchedProd && matchedLoc) {
        validRows.push({
          productCode: matchedProd.code,
          productDescription: matchedProd.description,
          productId: matchedProd.id,
          locationCode: matchedLoc.code,
          locationName: matchedLoc.name,
          locationId: matchedLoc.id,
          companyName: matchedComp ? (matchedComp.tradeName || matchedComp.name) : 'Matriz',
          companyId: matchedComp ? matchedComp.id : 'comp-matriz',
          quantity: qty,
          minStock: isNaN(minStock) ? 0 : minStock,
          referenceDate,
          notes,
        });
      }
    });

    return {
      validRows,
      invalidRows,
      summary: {
        totalRows: rows.length,
        validCount: validRows.length,
        invalidCount: invalidRows.length,
        toInsertCount: validRows.length,
        toUpdateCount: 0,
      },
    };
  }

  public static validateCustomersImport(
    rows: any[],
    existingCustomers: Customer[],
    mode: 'insert_only' | 'insert_update'
  ): ImportPreview<Partial<Customer>> {
    const validRows: Partial<Customer>[] = [];
    const invalidRows: { rowNumber: number; data: any; issues: ValidationIssue[] }[] = [];

    const existingCodes = new Set(existingCustomers.map((c) => c.code.toUpperCase()));
    let toInsertCount = 0;
    let toUpdateCount = 0;

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const issues: ValidationIssue[] = [];

      const code = String(row['Codigo'] || '').trim();
      const name = String(row['Nome_RazaoSocial'] || '').trim();
      const typeStr = String(row['Tipo'] || 'PF').trim().toUpperCase();

      if (!code) {
        issues.push({ rowNumber, field: 'Codigo', message: 'Código do cliente é obrigatório.', severity: 'error' });
      }
      if (!name) {
        issues.push({ rowNumber, field: 'Nome_RazaoSocial', message: 'Nome ou Razão Social é obrigatório.', severity: 'error' });
      }

      const isUpdate = existingCodes.has(code.toUpperCase());
      if (isUpdate && mode === 'insert_only') {
        issues.push({ rowNumber, field: 'Codigo', message: `Cliente com código "${code}" já existe.`, severity: 'error' });
      }

      if (issues.some((i) => i.severity === 'error')) {
        invalidRows.push({ rowNumber, data: row, issues });
      } else {
        if (isUpdate) toUpdateCount++;
        else toInsertCount++;

        const customer: Partial<Customer> = {
          code,
          name,
          tradeName: String(row['NomeFantasia'] || '').trim(),
          type: typeStr === 'PJ' ? 'PJ' : 'PF',
          cpfCnpj: String(row['CPF_CNPJ'] || '').trim(),
          phone: String(row['Telefone'] || '').trim(),
          whatsapp: String(row['WhatsApp'] || '').trim(),
          email: String(row['Email'] || '').trim(),
          zipCode: String(row['CEP'] || '').trim(),
          street: String(row['Logradouro'] || '').trim(),
          number: String(row['Numero'] || '').trim(),
          complement: String(row['Complemento'] || '').trim(),
          neighborhood: String(row['Bairro'] || '').trim(),
          city: String(row['Cidade'] || '').trim(),
          state: String(row['UF'] || '').trim(),
          creditLimit: Number(row['LimiteCredito'] || 0),
          preferredPaymentMethod: String(row['CondicaoPagamento'] || '').trim(),
          status: String(row['Status'] || '').toLowerCase().includes('inativ') ? 'inativo' : 'ativo',
          notes: String(row['Observacoes'] || '').trim(),
        };

        validRows.push(customer);
      }
    });

    return {
      validRows,
      invalidRows,
      summary: {
        totalRows: rows.length,
        validCount: validRows.length,
        invalidCount: invalidRows.length,
        toInsertCount,
        toUpdateCount,
      },
    };
  }

  public static validateCitiesImport(
    rows: any[],
    existingCities: CityItem[],
    marketAreas: MarketAreaItem[],
    deliveryRoutes: DeliveryRoute[],
    mode: 'insert_only' | 'insert_update'
  ): ImportPreview<Partial<CityItem> & { targetCompanyName?: string }> {
    const validRows: (Partial<CityItem> & { targetCompanyName?: string })[] = [];
    const invalidRows: { rowNumber: number; data: any; issues: ValidationIssue[] }[] = [];

    const existingKeys = new Set(
      existingCities.map((c) => `${c.name.trim().toLowerCase()}|${c.stateUf.trim().toUpperCase()}`)
    );
    let toInsertCount = 0;
    let toUpdateCount = 0;

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const issues: ValidationIssue[] = [];

      const companyRaw = String(row['Empresa'] || row['Filial'] || '').trim();
      const name = String(row['NomeCidade'] || row['Cidade'] || row['Nome'] || row['Nome da Cidade'] || '').trim();
      const stateUf = String(row['UF'] || row['Estado'] || 'BA').trim().toUpperCase();
      const ibgeCode = String(row['CodigoIBGE'] || row['Código IBGE'] || row['IBGE'] || '').trim();
      const distRaw = String(row['DistanciaFeiraKm'] ?? row['DistanciaKm'] ?? row['Distancia'] ?? '').trim();
      const marketAreaRaw = String(row['PracaComercial'] || row['Praça Comercial'] || row['Praca'] || '').trim();
      const routeRaw = String(row['RotaPadrao'] || row['Rota Padrão'] || row['Rota'] || '').trim();
      const statusRaw = String(row['Status'] || 'Ativo').trim().toLowerCase();

      if (!name) {
        issues.push({ rowNumber, field: 'NomeCidade', message: 'Nome da cidade é obrigatório.', severity: 'error' });
      }
      if (!stateUf || stateUf.length !== 2) {
        issues.push({ rowNumber, field: 'UF', message: 'UF deve conter exatamente 2 letras (ex: BA).', severity: 'error' });
      }

      const key = `${name.toLowerCase()}|${stateUf}`;
      const isUpdate = existingKeys.has(key);
      if (isUpdate && mode === 'insert_only') {
        issues.push({
          rowNumber,
          field: 'NomeCidade',
          message: `Cidade "${name}/${stateUf}" já existe no cadastro.`,
          severity: 'error',
        });
      }

      const parsedDistance = distRaw !== '' ? Number(distRaw.replace(',', '.')) : undefined;
      if (distRaw !== '' && (parsedDistance === undefined || isNaN(parsedDistance) || parsedDistance < 0)) {
        issues.push({ rowNumber, field: 'DistanciaFeiraKm', message: 'Distância em km inválida.', severity: 'error' });
      }

      const matchedMarketArea = marketAreaRaw
        ? marketAreas.find(
            (m) =>
              m.name.toLowerCase() === marketAreaRaw.toLowerCase() ||
              m.name.toLowerCase().includes(marketAreaRaw.toLowerCase())
          )
        : undefined;

      const matchedRoute = routeRaw
        ? deliveryRoutes.find(
            (r) =>
              r.name.toLowerCase() === routeRaw.toLowerCase() ||
              (r.code && r.code.toLowerCase() === routeRaw.toLowerCase()) ||
              r.name.toLowerCase().includes(routeRaw.toLowerCase())
          )
        : undefined;

      if (issues.some((i) => i.severity === 'error')) {
        invalidRows.push({ rowNumber, data: row, issues });
      } else {
        if (isUpdate) toUpdateCount++;
        else toInsertCount++;

        validRows.push({
          name,
          stateUf,
          ibgeCode,
          distanceKm: parsedDistance,
          marketAreaId: matchedMarketArea?.id || '',
          marketAreaName: matchedMarketArea?.name || marketAreaRaw,
          defaultRouteId: matchedRoute?.id || '',
          defaultRouteName: matchedRoute?.name || routeRaw,
          isSystemDefault: stateUf === 'BA',
          active: !statusRaw.includes('inativ'),
          targetCompanyName: companyRaw || 'Todas',
        });
      }
    });

    return {
      validRows,
      invalidRows,
      summary: {
        totalRows: rows.length,
        validCount: validRows.length,
        invalidCount: invalidRows.length,
        toInsertCount,
        toUpdateCount,
      },
    };
  }

  public static validateNeighborhoodsImport(
    rows: any[],
    existingNeighborhoods: NeighborhoodItem[],
    marketAreas: MarketAreaItem[],
    deliveryRoutes: DeliveryRoute[],
    mode: 'insert_only' | 'insert_update'
  ): ImportPreview<Partial<NeighborhoodItem> & { targetCompanyName?: string }> {
    const validRows: (Partial<NeighborhoodItem> & { targetCompanyName?: string })[] = [];
    const invalidRows: { rowNumber: number; data: any; issues: ValidationIssue[] }[] = [];

    const existingKeys = new Set(
      existingNeighborhoods.map(
        (n) => `${n.name.trim().toLowerCase()}|${n.cityName.trim().toLowerCase()}|${n.stateUf.trim().toUpperCase()}`
      )
    );
    let toInsertCount = 0;
    let toUpdateCount = 0;

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const issues: ValidationIssue[] = [];

      const companyRaw = String(row['Empresa'] || row['Filial'] || '').trim();
      const name = String(row['NomeBairro'] || row['Bairro'] || row['Nome'] || row['Nome do Bairro'] || '').trim();
      const cityName = String(row['Cidade'] || row['NomeCidade'] || '').trim();
      const stateUf = String(row['UF'] || row['Estado'] || 'BA').trim().toUpperCase();
      const zipCodePrefix = String(row['FaixaCEP'] || row['PrefixoCEP'] || row['CEP'] || '').trim();
      const marketAreaRaw = String(row['PracaComercial'] || row['Praça Comercial'] || row['Praca'] || '').trim();
      const routeRaw = String(row['RotaPadrao'] || row['Rota Padrão'] || row['Rota'] || '').trim();
      const statusRaw = String(row['Status'] || 'Ativo').trim().toLowerCase();

      if (!name) {
        issues.push({ rowNumber, field: 'NomeBairro', message: 'Nome do bairro é obrigatório.', severity: 'error' });
      }
      if (!cityName) {
        issues.push({ rowNumber, field: 'Cidade', message: 'Cidade do bairro é obrigatória.', severity: 'error' });
      }
      if (!stateUf || stateUf.length !== 2) {
        issues.push({ rowNumber, field: 'UF', message: 'UF deve conter exatamente 2 letras (ex: BA).', severity: 'error' });
      }

      const key = `${name.toLowerCase()}|${cityName.toLowerCase()}|${stateUf}`;
      const isUpdate = existingKeys.has(key);
      if (isUpdate && mode === 'insert_only') {
        issues.push({
          rowNumber,
          field: 'NomeBairro',
          message: `Bairro "${name}" em ${cityName}/${stateUf} já existe no cadastro.`,
          severity: 'error',
        });
      }

      const matchedMarketArea = marketAreaRaw
        ? marketAreas.find(
            (m) =>
              m.name.toLowerCase() === marketAreaRaw.toLowerCase() ||
              m.name.toLowerCase().includes(marketAreaRaw.toLowerCase())
          )
        : undefined;

      const matchedRoute = routeRaw
        ? deliveryRoutes.find(
            (r) =>
              r.name.toLowerCase() === routeRaw.toLowerCase() ||
              (r.code && r.code.toLowerCase() === routeRaw.toLowerCase()) ||
              r.name.toLowerCase().includes(routeRaw.toLowerCase())
          )
        : undefined;

      if (issues.some((i) => i.severity === 'error')) {
        invalidRows.push({ rowNumber, data: row, issues });
      } else {
        if (isUpdate) toUpdateCount++;
        else toInsertCount++;

        validRows.push({
          name,
          cityName,
          stateUf,
          zipCodePrefix,
          marketAreaId: matchedMarketArea?.id || '',
          marketAreaName: matchedMarketArea?.name || marketAreaRaw,
          defaultRouteId: matchedRoute?.id || '',
          defaultRouteName: matchedRoute?.name || routeRaw,
          active: !statusRaw.includes('inativ'),
          targetCompanyName: companyRaw || 'Todas',
        });
      }
    });

    return {
      validRows,
      invalidRows,
      summary: {
        totalRows: rows.length,
        validCount: validRows.length,
        invalidCount: invalidRows.length,
        toInsertCount,
        toUpdateCount,
      },
    };
  }

  // ==========================================
  // EXPORTAÇÕES FORMATADAS
  // ==========================================

  public static exportProducts(
    products: Product[],
    locations: StockLocation[],
    fileName: string,
    companies?: Company[]
  ) {
    const locMap = new Map(locations.map((l) => [l.id, l.name]));
    const locCodeMap = new Map(locations.map((l) => [l.id, l.code]));
    const matrizCompany = companies?.find((c) => c.type === 'matriz') || companies?.[0];
    const defaultCompanyName = matrizCompany ? (matrizCompany.tradeName || matrizCompany.name) : 'Matriz';

    const data: any[] = [];

    products.forEach((p) => {
      // Linha padrão da Matriz / Preço Base
      data.push({
        'Empresa': defaultCompanyName,
        'Codigo': p.code,
        'CodigoReferencia': p.referenceCode || '',
        'Descricao': p.description,
        'Unidade': p.unit,
        'Custo': p.costPrice,
        'PrecoVenda': p.salePrice,
        'Familia': p.family,
        'Grupo': p.group,
        'CodigoBarras': p.barcode,
        'EstoqueMinimo': p.minStock,
        'Tipo': p.productType === 'componente' ? 'Componente' : 'Revenda',
        'CodigoLocalPadrao': locCodeMap.get(p.defaultLocationId) || 'COM-01',
        'LocalPadrao': locMap.get(p.defaultLocationId) || 'Comercial',
        'Status': p.status === 'ativo' ? 'Ativo' : 'Inativo',
        'EmbalagemMaster': p.isMasterPack ? 'Sim' : 'Nao',
        'CodigoProdutoAssociado': p.masterPackAssociatedProductCode || '',
        'DescricaoProdutoAssociado': p.masterPackAssociatedProductDescription || '',
        'UnidadesPorEmbalagem': p.isMasterPack ? (p.masterPackUnits || 10) : '',
        'TipoEmbalagem': p.isMasterPack ? (p.masterPackPackagingType || 'caixa') : '',
        'ImpostosPercent': p.taxPercent || 0,
        'DespesasOperacionaisPercent': p.operatingExpensesPercent || 0,
        'ComissaoPercent': p.salesCommissionPercent || 0,
        'MargemLucroDesejadaPercent': p.profitMarginPercent || 0,
        'Observacoes': p.notes || '',
      });

      // Se houver tabela de preços individual por filial, exporta linhas adicionais da filial
      if (p.companyPrices && companies) {
        Object.entries(p.companyPrices).forEach(([compId, override]) => {
          const comp = companies.find((c) => c.id === compId);
          if (comp && comp.type === 'filial') {
            const compLoc = locations.find((l) => l.companyId === comp.id);
            data.push({
              'Empresa': comp.tradeName || comp.name,
              'Codigo': p.code,
              'CodigoReferencia': p.referenceCode || '',
              'Descricao': p.description,
              'Unidade': p.unit,
              'Custo': override.costPrice ?? p.costPrice,
              'PrecoVenda': override.salePrice,
              'Familia': p.family,
              'Grupo': p.group,
              'CodigoBarras': p.barcode,
              'EstoqueMinimo': override.minStock ?? p.minStock,
              'Tipo': p.productType === 'componente' ? 'Componente' : 'Revenda',
              'CodigoLocalPadrao': compLoc?.code || 'COM-FIL',
              'LocalPadrao': compLoc?.name || `Comercial - ${comp.tradeName}`,
              'Status': p.status === 'ativo' ? 'Ativo' : 'Inativo',
              'EmbalagemMaster': p.isMasterPack ? 'Sim' : 'Nao',
              'CodigoProdutoAssociado': p.masterPackAssociatedProductCode || '',
              'DescricaoProdutoAssociado': p.masterPackAssociatedProductDescription || '',
              'UnidadesPorEmbalagem': p.isMasterPack ? (p.masterPackUnits || 10) : '',
              'TipoEmbalagem': p.isMasterPack ? (p.masterPackPackagingType || 'caixa') : '',
              'ImpostosPercent': p.taxPercent || 0,
              'DespesasOperacionaisPercent': p.operatingExpensesPercent || 0,
              'ComissaoPercent': p.salesCommissionPercent || 0,
              'MargemLucroDesejadaPercent': p.profitMarginPercent || 0,
              'Observacoes': `Tabela de preços e estoque individual da ${comp.tradeName}`,
            });
          }
        });
      }
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    this.downloadExcel(wb, fileName);
  }

  public static exportCustomers(customers: Customer[], fileName: string, companies?: Company[]) {
    const matrizCompany = companies?.find((c) => c.type === 'matriz') || companies?.[0];
    const defaultCompanyName = matrizCompany ? (matrizCompany.tradeName || matrizCompany.name) : 'Todas';

    const data = customers.map((c) => ({
      'Empresa': defaultCompanyName,
      'Código': c.code,
      'Nome / Razão Social': c.name,
      'Nome Fantasia': c.tradeName || '',
      'Tipo': c.type,
      'CPF / CNPJ': c.cpfCnpj,
      'Telefone': c.phone,
      'WhatsApp': c.whatsapp || '',
      'E-mail': c.email || '',
      'Cidade': c.city || '',
      'UF': c.state || '',
      'Limite de Crédito': c.creditLimit,
      'Status': c.status === 'ativo' ? 'Ativo' : 'Inativo',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    this.downloadExcel(wb, fileName);
  }

  public static exportCities(cities: CityItem[], fileName: string, companies?: Company[]) {
    const matrizCompany = companies?.find((c) => c.type === 'matriz') || companies?.[0];
    const defaultCompanyName = matrizCompany ? matrizCompany.tradeName || matrizCompany.name : 'Todas';

    const data = cities
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map((c) => ({
        Empresa: defaultCompanyName,
        NomeCidade: c.name,
        UF: c.stateUf,
        CodigoIBGE: c.ibgeCode || '',
        DistanciaFeiraKm: typeof c.distanceKm === 'number' ? c.distanceKm : '',
        PracaComercial: c.marketAreaName || '',
        RotaPadrao: c.defaultRouteName || '',
        Status: c.active ? 'Ativo' : 'Inativo',
      }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Cidades');
    this.downloadExcel(wb, fileName);
  }

  public static exportNeighborhoods(neighborhoods: NeighborhoodItem[], fileName: string, companies?: Company[]) {
    const matrizCompany = companies?.find((c) => c.type === 'matriz') || companies?.[0];
    const defaultCompanyName = matrizCompany ? matrizCompany.tradeName || matrizCompany.name : 'Todas';

    const data = neighborhoods
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map((n) => ({
        Empresa: defaultCompanyName,
        NomeBairro: n.name,
        Cidade: n.cityName,
        UF: n.stateUf,
        FaixaCEP: n.zipCodePrefix || '',
        PracaComercial: n.marketAreaName || '',
        RotaPadrao: n.defaultRouteName || '',
        Status: n.active ? 'Ativo' : 'Inativo',
      }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Bairros');
    this.downloadExcel(wb, fileName);
  }
}
