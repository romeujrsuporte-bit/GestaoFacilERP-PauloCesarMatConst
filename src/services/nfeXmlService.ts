/**
 * Serviço de Leitura e Parsing de NF-e (XML da SEFAZ - Layout 4.00)
 * Extrai emitente, itens, totais, impostos, duplicatas/parcelas e chave de acesso.
 */

import { NfeParsedData, NfeParsedProduct, NfeParsedInstallment } from '../types';

function getTagText(parent: Element | Document, tagName: string, defaultValue = ''): string {
  const el = parent.getElementsByTagName(tagName)[0];
  return el && el.textContent ? el.textContent.trim() : defaultValue;
}

function getTagFloat(parent: Element | Document, tagName: string, defaultValue = 0): number {
  const text = getTagText(parent, tagName);
  if (!text) return defaultValue;
  const num = parseFloat(text.replace(',', '.'));
  return isNaN(num) ? defaultValue : num;
}

export class NfeXmlService {
  /**
   * Realiza o parsing do conteúdo XML em texto para o objeto estruturado NfeParsedData
   */
  public static parseXml(xmlContent: string): { success: boolean; data?: NfeParsedData; error?: string } {
    try {
      if (!xmlContent || !xmlContent.trim()) {
        return { success: false, error: 'Arquivo XML vazio ou não informado.' };
      }

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

      // Verificar erro de parsing do navegador
      const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
      if (parserError) {
        return { success: false, error: 'O arquivo informado não é um XML válido: ' + parserError.textContent };
      }

      // Localizar o nó principal infNFe
      const infNFe = xmlDoc.getElementsByTagName('infNFe')[0];
      if (!infNFe) {
        return { success: false, error: 'Estrutura de NF-e inválida: tag <infNFe> não encontrada no arquivo XML.' };
      }

      // 1. Chave de Acesso (44 dígitos)
      let accessKey = infNFe.getAttribute('Id') || '';
      if (accessKey.startsWith('NFe')) {
        accessKey = accessKey.substring(3);
      }
      accessKey = accessKey.replace(/\D/g, '');
      if (!accessKey) {
        const chNFeTag = getTagText(xmlDoc, 'chNFe');
        if (chNFeTag) {
          accessKey = chNFeTag.replace(/\D/g, '');
        }
      }

      // 2. Identificação da Nota (<ide>)
      const ide = infNFe.getElementsByTagName('ide')[0] || infNFe;
      const nfeNumber = getTagText(ide, 'nNF', '0');
      const series = getTagText(ide, 'serie', '1');
      let issueDate = getTagText(ide, 'dhEmi') || getTagText(ide, 'dEmi');
      if (issueDate && issueDate.includes('T')) {
        issueDate = issueDate.split('T')[0];
      } else if (!issueDate) {
        issueDate = new Date().toISOString().split('T')[0];
      }
      const operationNature = getTagText(ide, 'natOp', 'Compra de Mercadorias');

      // 3. Emitente / Fornecedor (<emit>)
      const emit = infNFe.getElementsByTagName('emit')[0];
      if (!emit) {
        return { success: false, error: 'Dados do fornecedor emitente (<emit>) não localizados no XML.' };
      }

      const supplierCpfCnpj = getTagText(emit, 'CNPJ') || getTagText(emit, 'CPF');
      const supplierName = getTagText(emit, 'xNome', 'Fornecedor sem Razão Social');
      const supplierTradeName = getTagText(emit, 'xFant', supplierName);
      const supplierIe = getTagText(emit, 'IE');

      const enderEmit = emit.getElementsByTagName('enderEmit')[0];
      let supplierAddress;
      let supplierPhone = '';
      if (enderEmit) {
        supplierAddress = {
          street: getTagText(enderEmit, 'xLgr'),
          number: getTagText(enderEmit, 'nro'),
          complement: getTagText(enderEmit, 'xCpl'),
          neighborhood: getTagText(enderEmit, 'xBairro'),
          city: getTagText(enderEmit, 'xMun'),
          state: getTagText(enderEmit, 'UF'),
          zipCode: getTagText(enderEmit, 'CEP'),
        };
        supplierPhone = getTagText(enderEmit, 'fone');
      }

      // 4. Destinatário (<dest>)
      const dest = infNFe.getElementsByTagName('dest')[0];
      const destCpfCnpj = dest ? (getTagText(dest, 'CNPJ') || getTagText(dest, 'CPF')) : '';
      const destName = dest ? getTagText(dest, 'xNome') : '';
      const destIe = dest ? getTagText(dest, 'IE') : '';

      // 5. Totais da Nota (<total><ICMSTot>)
      const totalNode = infNFe.getElementsByTagName('total')[0];
      const icmsTot = totalNode ? (totalNode.getElementsByTagName('ICMSTot')[0] || totalNode) : infNFe;

      const productsTotal = getTagFloat(icmsTot, 'vProd', 0);
      const freightTotal = getTagFloat(icmsTot, 'vFrete', 0);
      const insuranceTotal = getTagFloat(icmsTot, 'vSeg', 0);
      const discountTotal = getTagFloat(icmsTot, 'vDesc', 0);
      const otherExpensesTotal = getTagFloat(icmsTot, 'vOutro', 0);
      const icmsTotal = getTagFloat(icmsTot, 'vICMS', 0);
      const ipiTotal = getTagFloat(icmsTot, 'vIPI', 0);
      const pisTotal = getTagFloat(icmsTot, 'vPIS', 0);
      const cofinsTotal = getTagFloat(icmsTot, 'vCOFINS', 0);
      let invoiceTotal = getTagFloat(icmsTot, 'vNF', 0);

      // 6. Itens / Produtos (<det>)
      const detList = infNFe.getElementsByTagName('det');
      if (!detList || detList.length === 0) {
        return { success: false, error: 'Nenhum item ou produto (<det>) encontrado na NF-e.' };
      }

      const items: NfeParsedProduct[] = [];
      let calculatedSumOfProducts = 0;

      for (let i = 0; i < detList.length; i++) {
        const det = detList[i];
        const itemNumber = parseInt(det.getAttribute('nItem') || String(i + 1), 10);
        const prod = det.getElementsByTagName('prod')[0];
        if (!prod) continue;

        const code = getTagText(prod, 'cProd', `ITEM-${i + 1}`).trim();
        const rawEan = getTagText(prod, 'cEAN', '') || getTagText(prod, 'cBarra', '') || getTagText(prod, 'cEANTrib', '');
        const barcode = (rawEan && rawEan !== 'SEM GTIN' && rawEan !== '0') ? rawEan.trim() : '';
        const description = getTagText(prod, 'xProd', 'Item sem descrição').trim();
        const ncm = getTagText(prod, 'NCM', '');
        const cfop = getTagText(prod, 'CFOP', '');
        const unit = (getTagText(prod, 'uCom', 'UN')).toUpperCase();
        const quantity = getTagFloat(prod, 'qCom', 1);
        const unitPrice = getTagFloat(prod, 'vUnCom', 0);
        const totalPrice = getTagFloat(prod, 'vProd', quantity * unitPrice);
        const discount = getTagFloat(prod, 'vDesc', 0);
        const freight = getTagFloat(prod, 'vFrete', 0);
        const insurance = getTagFloat(prod, 'vSeg', 0);
        const otherExpenses = getTagFloat(prod, 'vOutro', 0);

        // Impostos do item
        const imposto = det.getElementsByTagName('imposto')[0];
        let icmsAmount = 0;
        let ipiAmount = 0;
        let pisAmount = 0;
        let cofinsAmount = 0;

        if (imposto) {
          icmsAmount = getTagFloat(imposto, 'vICMS', 0);
          ipiAmount = getTagFloat(imposto, 'vIPI', 0);
          pisAmount = getTagFloat(imposto, 'vPIS', 0);
          cofinsAmount = getTagFloat(imposto, 'vCOFINS', 0);
        }

        calculatedSumOfProducts += totalPrice;

        items.push({
          itemNumber,
          code,
          barcode,
          description,
          ncm,
          cfop,
          unit,
          quantity,
          unitPrice,
          totalPrice,
          discount,
          freight,
          insurance,
          otherExpenses,
          icmsAmount,
          ipiAmount,
          pisAmount,
          cofinsAmount,
        });
      }

      if (invoiceTotal <= 0) {
        invoiceTotal = Math.max(0, calculatedSumOfProducts + freightTotal + otherExpensesTotal - discountTotal);
      }

      // 7. Cobrança e Parcelas (<cobr><dup>)
      const installments: NfeParsedInstallment[] = [];
      const dupList = infNFe.getElementsByTagName('dup');

      if (dupList && dupList.length > 0) {
        for (let j = 0; j < dupList.length; j++) {
          const dup = dupList[j];
          const nDup = getTagText(dup, 'nDup', String(j + 1));
          let dVenc = getTagText(dup, 'dVenc');
          if (dVenc && dVenc.includes('T')) {
            dVenc = dVenc.split('T')[0];
          }
          if (!dVenc) {
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + (j + 1) * 30);
            dVenc = nextDate.toISOString().split('T')[0];
          }
          const vDup = getTagFloat(dup, 'vDup', 0);

          installments.push({
            number: nDup,
            installmentNumber: j + 1,
            dueDate: dVenc,
            value: vDup > 0 ? vDup : Number((invoiceTotal / dupList.length).toFixed(2)),
          });
        }
      } else {
        // Se a nota não tiver tags de duplicata (à vista ou não informada), gera 1 parcela com total da NF
        const today = new Date().toISOString().split('T')[0];
        installments.push({
          number: '1',
          installmentNumber: 1,
          dueDate: today,
          value: invoiceTotal,
        });
      }

      const parsedData: NfeParsedData = {
        accessKey: accessKey || `CHAVE-${Date.now()}`,
        number: nfeNumber,
        series,
        issueDate,
        operationNature,
        supplierCpfCnpj: supplierCpfCnpj || '00.000.000/0000-00',
        supplierName,
        supplierTradeName,
        supplierIe,
        supplierPhone,
        supplierAddress,
        destCpfCnpj,
        destName,
        destIe,
        productsTotal: productsTotal || calculatedSumOfProducts,
        freightTotal,
        insuranceTotal,
        discountTotal,
        otherExpensesTotal,
        icmsTotal,
        ipiTotal,
        pisTotal,
        cofinsTotal,
        invoiceTotal,
        items,
        installments,
      };

      return { success: true, data: parsedData };
    } catch (err: any) {
      console.error('Erro ao processar XML de NF-e:', err);
      return { success: false, error: 'Falha no processamento do XML: ' + (err.message || 'Erro desconhecido') };
    }
  }

  /**
   * Gera um XML de NF-e de demonstração completo (SEFAZ Layout 4.00)
   * com produtos heterogêneos (matéria-prima química, embalagem e revenda)
   * exatamente como citado na especificação do usuário.
   */
  public static generateSampleNfeXml(): string {
    const today = new Date().toISOString().split('T')[0];
    const due30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const due60 = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0];
    const fakeKey = `292611${Math.floor(10000000000000 + Math.random() * 90000000000000)}550010000492111000049218`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe${fakeKey}" versao="4.00">
      <ide>
        <cUF>29</cUF>
        <cNF>049211</cNF>
        <natOp>COMPRA PARA INDUSTRIALIZACAO E REVENDA</natOp>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>4921</nNF>
        <dhEmi>${today}T10:30:00-03:00</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>3550308</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <tpAmb>1</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>0</indFinal>
        <indPres>9</indPres>
        <procEmi>0</procEmi>
        <verProc>4.0.0</verProc>
      </ide>
      <emit>
        <CNPJ>12345678000195</CNPJ>
        <xNome>QUIMICA &amp; EMBALAGENS BRASIL LTDA</xNome>
        <xFant>QUIMICA BRASIL FORNECEDORA</xFant>
        <enderEmit>
          <xLgr>Via Atlântica - Polo Industrial</xLgr>
          <nro>1250</nro>
          <xCpl>Galpão B</xCpl>
          <xBairro>Polo Industrial</xBairro>
          <cMun>2905701</cMun>
          <xMun>Camaçari</xMun>
          <UF>BA</UF>
          <CEP>42810000</CEP>
          <cPais>1058</cPais>
          <xPais>BRASIL</xPais>
          <fone>7136324444</fone>
        </enderEmit>
        <IE>112233445566</IE>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>00000000000191</CNPJ>
        <xNome>GESTAO FACIL MATRIZ E FILIAIS LTDA</xNome>
        <enderDest>
          <xLgr>Av. Eduardo Fróes da Mota</xLgr>
          <nro>1500</nro>
          <xBairro>CIS</xBairro>
          <cMun>2910800</cMun>
          <xMun>Feira de Santana</xMun>
          <UF>BA</UF>
          <CEP>44000000</CEP>
          <cPais>1058</cPais>
          <xPais>BRASIL</xPais>
        </enderDest>
        <indIEDest>1</indIEDest>
        <IE>998877665544</IE>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>MP-QUI-01</cProd>
          <cEAN>7891000100015</cEAN>
          <xProd>Matéria-prima química para formulação industrial (Solução A)</xProd>
          <NCM>28042100</NCM>
          <CFOP>5101</CFOP>
          <uCom>KG</uCom>
          <qCom>100.0000</qCom>
          <vUnCom>10.0000</vUnCom>
          <vProd>1000.00</vProd>
          <cEANTrib>7891000100015</cEANTrib>
          <uTrib>KG</uTrib>
          <qTrib>100.0000</qTrib>
          <vUnTrib>10.0000</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <modBC>3</modBC>
              <vBC>1000.00</vBC>
              <pICMS>18.00</pICMS>
              <vICMS>180.00</vICMS>
            </ICMS00>
          </ICMS>
          <PIS>
            <PISAliq>
              <CST>01</CST>
              <vBC>1000.00</vBC>
              <pPIS>1.65</pPIS>
              <vPIS>16.50</vPIS>
            </PISAliq>
          </PIS>
          <COFINS>
            <COFINSAliq>
              <CST>01</CST>
              <vBC>1000.00</vBC>
              <pCOFINS>7.60</pCOFINS>
              <vCOFINS>76.00</vCOFINS>
            </COFINSAliq>
          </COFINS>
        </imposto>
      </det>
      <det nItem="2">
        <prod>
          <cProd>EMB-PLAS-500</cProd>
          <cEAN>7892000200025</cEAN>
          <xProd>Embalagens plásticas reforçadas 500ml c/ tampa rosca</xProd>
          <NCM>39233000</NCM>
          <CFOP>5101</CFOP>
          <uCom>UN</uCom>
          <qCom>500.0000</qCom>
          <vUnCom>1.0000</vUnCom>
          <vProd>500.00</vProd>
          <cEANTrib>7892000200025</cEANTrib>
          <uTrib>UN</uTrib>
          <qTrib>500.0000</qTrib>
          <vUnTrib>1.0000</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <modBC>3</modBC>
              <vBC>500.00</vBC>
              <pICMS>18.00</pICMS>
              <vICMS>90.00</vICMS>
            </ICMS00>
          </ICMS>
          <PIS>
            <PISAliq>
              <CST>01</CST>
              <vBC>500.00</vBC>
              <pPIS>1.65</pPIS>
              <vPIS>8.25</vPIS>
            </PISAliq>
          </PIS>
          <COFINS>
            <COFINSAliq>
              <CST>01</CST>
              <vBC>500.00</vBC>
              <pCOFINS>7.60</pCOFINS>
              <vCOFINS>38.00</vCOFINS>
            </COFINSAliq>
          </COFINS>
        </imposto>
      </det>
      <det nItem="3">
        <prod>
          <cProd>REV-LIMP-MULTI</cProd>
          <cEAN>7893000300035</cEAN>
          <xProd>Produto de limpeza multiuso pronto para revenda (Frasco 1L)</xProd>
          <NCM>34022000</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>100.0000</qCom>
          <vUnCom>8.0000</vUnCom>
          <vProd>800.00</vProd>
          <cEANTrib>7893000300035</cEANTrib>
          <uTrib>UN</uTrib>
          <qTrib>100.0000</qTrib>
          <vUnTrib>8.0000</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <modBC>3</modBC>
              <vBC>800.00</vBC>
              <pICMS>18.00</pICMS>
              <vICMS>144.00</vICMS>
            </ICMS00>
          </ICMS>
          <PIS>
            <PISAliq>
              <CST>01</CST>
              <vBC>800.00</vBC>
              <pPIS>1.65</pPIS>
              <vPIS>13.20</vPIS>
            </PISAliq>
          </PIS>
          <COFINS>
            <COFINSAliq>
              <CST>01</CST>
              <vBC>800.00</vBC>
              <pCOFINS>7.60</pCOFINS>
              <vCOFINS>60.80</vCOFINS>
            </COFINSAliq>
          </COFINS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vBC>2300.00</vBC>
          <vICMS>414.00</vICMS>
          <vICMSDeson>0.00</vICMSDeson>
          <vFCP>0.00</vFCP>
          <vBCST>0.00</vBCST>
          <vST>0.00</vST>
          <vFCPST>0.00</vFCPST>
          <vFCPSTRet>0.00</vFCPSTRet>
          <vProd>2300.00</vProd>
          <vFrete>0.00</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>0.00</vDesc>
          <vII>0.00</vII>
          <vIPI>0.00</vIPI>
          <vIPIDevol>0.00</vIPIDevol>
          <vPIS>37.95</vPIS>
          <vCOFINS>174.80</vCOFINS>
          <vOutro>0.00</vOutro>
          <vNF>2300.00</vNF>
        </ICMSTot>
      </total>
      <transp>
        <modFrete>9</modFrete>
      </transp>
      <cobr>
        <fat>
          <nFat>4921</nFat>
          <vOrig>2300.00</vOrig>
          <vDesc>0.00</vDesc>
          <vLiq>2300.00</vLiq>
        </fat>
        <dup>
          <nDup>001</nDup>
          <dVenc>${due30}</dVenc>
          <vDup>1150.00</vDup>
        </dup>
        <dup>
          <nDup>002</nDup>
          <dVenc>${due60}</dVenc>
          <vDup>1150.00</vDup>
        </dup>
      </cobr>
      <pag>
        <detPag>
          <indPag>1</indPag>
          <tPag>15</tPag>
          <vPag>2300.00</vPag>
        </detPag>
      </pag>
    </infNFe>
  </NFe>
</nfeProc>`;
  }
}
