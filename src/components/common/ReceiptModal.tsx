import React, { useState } from 'react';
import {
  Printer,
  Share2,
  X,
  Check,
  MessageSquare,
  FileText,
  FileCheck,
  Building2,
  MapPin,
  Phone,
  Mail,
  User as UserIcon,
  Calendar,
  CreditCard,
  Truck,
  Scissors,
  Layers,
  Plus,
  Minus,
  Palette,
  Contrast
} from 'lucide-react';
import { Order, Company } from '../../types';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { Database } from '../../services/db';
import { GestaoFacilLogo } from './AppLogo';
import { isBonusOrder, getOrderReferenceSubtotal, getOrderReferenceTotal } from '../../utils/orderUtils';

interface ReceiptModalProps {
  order: Order;
  company: Company;
  isOpen: boolean;
  onClose: () => void;
  initialFormat?: 'a4' | 'thermal';
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  order,
  company,
  isOpen,
  onClose,
  initialFormat,
}) => {
  const [copied, setCopied] = useState(false);
  const printerConfig = Database.getPrinterConfig();

  // Quantidade de vias a imprimir (padrão vindo da configuração de impressão)
  const [copies, setCopies] = useState<number>(() => {
    const c = printerConfig.orderPrintCopies;
    return typeof c === 'number' && c >= 1 ? c : 1;
  });

  // Define formato padrão: se veio como prop, usa ela; senão usa configuração padrão por módulo
  const [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>(() => {
    if (initialFormat) return initialFormat;
    if (order.origin === 'externa_celular') {
      return printerConfig.defaultExternalSalesFormat || 'a4';
    }
    if (order.origin === 'pdv') {
      return printerConfig.defaultPosFormat || 'thermal';
    }
    return printerConfig.defaultSalesOrderFormat || 'a4';
  });

  // Modo de cor padrão vindo da Configuração de Impressão (Colorido vs Preto e Branco)
  const [colorMode, setColorMode] = useState<'colorido' | 'preto_branco'>(
    () => printerConfig.orderColorMode || 'colorido'
  );
  const isBw = colorMode === 'preto_branco';

  if (!isOpen) return null;

  // Obtém o registro atualizado da empresa emitente (com logoUrl atualizada e fallback da Matriz)
  const allCompanies = Database.getState().companies;
  const activeCompany =
    allCompanies.find((c) => c.id === (order.companyId || company?.id)) ||
    company;
  const matrizCompany = allCompanies.find((c) => c.type === 'matriz');
  const companyLogoUrl = activeCompany.logoUrl || matrizCompany?.logoUrl;
  const companyInitials =
    (activeCompany.tradeName || activeCompany.name || 'EM')
      .split(/[\s-]+/)
      .filter((w) => w.length > 2)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'EM';

  const getViaBadge = (index: number, total: number) => {
    if (total <= 1) return { label: 'VIA ÚNICA', badgeClass: 'bg-slate-100 text-slate-800 border-slate-300' };
    switch (index) {
      case 0:
        return { label: '1ª VIA — CLIENTE / COMPRADOR', badgeClass: 'bg-blue-100 text-blue-900 border-blue-300' };
      case 1:
        return { label: '2ª VIA — ESTABELECIMENTO / CONTROLE INTERNO', badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
      case 2:
        return { label: '3ª VIA — EXPEDIÇÃO / ENTREGA / SEPARAÇÃO', badgeClass: 'bg-amber-100 text-amber-900 border-amber-300' };
      case 3:
        return { label: '4ª VIA — CONTABILIDADE / ARQUIVO', badgeClass: 'bg-purple-100 text-purple-900 border-purple-300' };
      default:
        return { label: `${index + 1}ª VIA — CÓPIA ADICIONAL`, badgeClass: 'bg-slate-100 text-slate-800 border-slate-300' };
    }
  };

  // Busca dados adicionais do cliente no banco se houver
  const customerDetails = order.customerId
    ? Database.getState().customers.find((c) => c.id === order.customerId)
    : null;

  const handlePrint = () => {
    window.print();
  };

  const isBonus = isBonusOrder(order);
  const referenceSubtotal = getOrderReferenceSubtotal(order);
  const referenceTotal = getOrderReferenceTotal(order);

  const formatPaymentMethodLabel = (method?: string) => {
    if (isBonus || (method || '').toLowerCase() === 'bonificacao') {
      return 'Bonificação (Sem Cobrança)';
    }
    switch ((method || '').toLowerCase()) {
      case 'pix':
        return 'Pix';
      case 'dinheiro':
        return 'Dinheiro';
      case 'cartao_debito':
        return 'Cartão de Débito';
      case 'cartao_credito':
        return 'Cartão de Crédito';
      case 'boleto':
        return 'Boleto Bancário';
      case 'crediario':
        return 'Crediário Próprio';
      case 'multiplo':
        return 'Pagamento Múltiplo';
      default:
        return (method || 'Não informado').replace(/_/g, ' ');
    }
  };

  const formatPaymentTermLabel = (ord: Order) => {
    if (isBonusOrder(ord)) {
      return 'Sem Cobrança Financeira';
    }
    let rawTerm = ord.paymentTerm || '';
    if (!rawTerm && ord.notes) {
      const match = ord.notes.match(/(?:Prazo de Pagamento|Prazo|Condi[çc][ãa]o)\s*:\s*([^|)\]]+)/i);
      if (match && match[1]) {
        rawTerm = match[1].trim();
      }
    }

    let label = '';
    if (rawTerm.trim()) {
      const resolved = Database.resolvePaymentTermInfo(rawTerm, ord.installmentsCount || 1);
      label = resolved.label;
    } else if (ord.installmentsCount > 1) {
      label = `${ord.installmentsCount}x Parcelado`;
    } else if (ord.paymentMethod === 'boleto' || ord.paymentMethod === 'crediario') {
      label = 'A Prazo';
    } else {
      label = 'À Vista';
    }

    if (ord.installmentsCount > 1 && !/\d+\s*x/i.test(label)) {
      label = `${label} (${ord.installmentsCount}x)`;
    }
    return label;
  };

  const paymentMethodLabel = formatPaymentMethodLabel(order.paymentMethod);
  const paymentTermLabel = formatPaymentTermLabel(order);

  const getWhatsAppText = () => {
    const isQuote = order.type === 'orcamento';
    const printableSubtotal = order.items.reduce((s, itm) => {
      const effUnit =
        itm.additionValue && itm.additionValue > 0
          ? (itm.totalPrice + (itm.discountValue || 0)) / (itm.quantity || 1)
          : itm.unitPrice;
      return s + effUnit * itm.quantity;
    }, 0);

    let text = `*${activeCompany.tradeName || activeCompany.name}*\n`;
    text += `${
      isBonus
        ? '🎁 *PEDIDO DE BONIFICAÇÃO*'
        : isQuote
        ? 'ORÇAMENTO COMERCIAL'
        : 'COMPROVANTE DE VENDA'
    } Nº: ${order.number}\n`;
    if (isBonus) {
      text += `_Operação de Bonificação / Cortesia — Sem Cobrança Financeira_\n`;
    }
    text += `Data: ${new Date(order.createdAt).toLocaleString('pt-BR')}\n`;
    text += `Vendedor: ${order.userName}\n`;
    text += `Cliente: ${order.customerName}\n`;
    text += `--------------------------------\n`;
    text += `ITENS${isBonus ? ' BONIFICADOS' : ''}:\n`;
    order.items.forEach((item, i) => {
      const effectiveUnitPrice =
        item.additionValue && item.additionValue > 0
          ? (item.totalPrice + (item.discountValue || 0)) / (item.quantity || 1)
          : item.unitPrice;
      text += `${i + 1}. ${item.description}\n   ${formatQuantity(item.quantity)} ${item.unit} x ${formatCurrency(
        effectiveUnitPrice
      )}${!isBonus && item.discountValue > 0 ? ` (-${formatCurrency(item.discountValue)})` : ''} = ${formatCurrency(
        item.totalPrice
      )}${isBonus ? ' (Ref.)' : ''}\n`;
    });
    text += `--------------------------------\n`;
    if (isBonus) {
      text += `Valor de Referência dos Itens: ${formatCurrency(referenceTotal || printableSubtotal)}\n`;
      text += `*TOTAL FINANCEIRO A COBRAR: ${formatCurrency(0)}*\n`;
      text += `Natureza: BONIFICAÇÃO — SEM COBRANÇA FINANCEIRA`;
    } else {
      text += `Subtotal: ${formatCurrency(printableSubtotal || order.subtotal)}\n`;
      if (order.discountTotal > 0) {
        text += `Desconto: -${formatCurrency(order.discountTotal)}\n`;
      }
      text += `*TOTAL: ${formatCurrency(order.total)}*\n`;
      text += `Forma de Pagamento: ${paymentMethodLabel}\n`;
      text += `Prazo de Pagamento: ${paymentTermLabel}`;
    }
    text += `\n\n_Documento emitido pelo GestãoFácil ERP_`;
    return encodeURIComponent(text);
  };

  const handleWhatsAppShare = () => {
    const text = getWhatsAppText();
    const phone = (order.customerPhone || customerDetails?.phone || customerDetails?.whatsapp || '').replace(/\D/g, '');
    const url = phone ? `https://wa.me/55${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  const handleCopyText = () => {
    const rawText = decodeURIComponent(getWhatsAppText());
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isQuote = order.type === 'orcamento';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* CSS para Impressão Perfeita em Folha A4 ou Cupom Térmico */}
      <style>{`
        @media print {
          @page {
            size: ${printFormat === 'a4' ? 'A4 portrait' : 'auto'};
            margin: ${printFormat === 'a4' ? '10mm 12mm 12mm 12mm' : '0mm'};
          }
          body * {
            visibility: hidden !important;
          }
          .printable-document-container, .printable-document-container * {
            visibility: visible !important;
          }
          .printable-document-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
          }
          .printable-document-container.bw-print-mode {
            filter: grayscale(100%) contrast(1.06) !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .a4-page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        className={`bg-white rounded-2xl shadow-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh] ${
          printFormat === 'a4' ? 'max-w-4xl' : 'max-w-md'
        }`}
      >
        {/* CABEÇALHO DO MODAL COM SELETOR DE FORMATO E QUANTIDADE DE VIAS */}
        <div className="bg-slate-900 text-white px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 no-print">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Printer size={16} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base leading-tight">
                {isQuote ? 'Orçamento / Proposta Comercial' : 'Pedido de Venda / Comprovante'}
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">
                Nº {order.number} • {new Date(order.createdAt).toLocaleDateString('pt-BR')}
              </span>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Seletor Colorido vs Preto e Branco */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold" title="Alternar modo de impressão Colorido ou Preto e Branco">
              <button
                type="button"
                onClick={() => setColorMode('colorido')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  !isBw
                    ? 'bg-blue-600 text-white shadow-sm font-extrabold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Palette size={13} />
                <span>Colorido</span>
              </button>
              <button
                type="button"
                onClick={() => setColorMode('preto_branco')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  isBw
                    ? 'bg-slate-100 text-slate-950 shadow-sm font-extrabold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Contrast size={13} />
                <span>P&amp;B</span>
              </button>
            </div>

            {/* Seletor de Quantidade de Vias */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold" title="Defina quantas vias serão impressas">
              <span className="text-slate-300 px-2 font-bold text-[11px] flex items-center gap-1">
                <Layers size={13} className="text-amber-400" />
                <span>Vias:</span>
              </span>
              <button
                type="button"
                onClick={() => setCopies((c) => Math.max(1, c - 1))}
                disabled={copies <= 1}
                className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:hover:bg-slate-700 text-white font-bold cursor-pointer transition-colors"
                title="Diminuir vias"
              >
                <Minus size={12} />
              </button>
              <span className="px-2 font-mono font-black text-amber-400 text-xs min-w-[30px] text-center">
                {copies}
              </span>
              <button
                type="button"
                onClick={() => setCopies((c) => Math.min(6, c + 1))}
                disabled={copies >= 6}
                className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:hover:bg-slate-700 text-white font-bold cursor-pointer transition-colors"
                title="Aumentar vias"
              >
                <Plus size={12} />
              </button>
            </div>

            {/* Seletor de Formato: Folha A4 vs Cupom 80mm */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPrintFormat('a4')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  printFormat === 'a4'
                    ? 'bg-blue-600 text-white shadow-sm font-extrabold'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Layout completo em Folha A4 para clientes, contratos e conferência"
              >
                <FileText size={14} />
                <span>Folha A4</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('thermal')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  printFormat === 'thermal'
                    ? 'bg-blue-600 text-white shadow-sm font-extrabold'
                    : 'text-slate-300 hover:text-white'
                }`}
                title={`Layout compacto para impressora térmica de bobina (${printerConfig.paperWidth})`}
              >
                <Printer size={14} />
                <span>Térmica</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Fechar janela"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ÁREA DE VISUALIZAÇÃO E IMPRESSÃO (SUPORTE A MÚLTIPLAS VIAS) */}
        <div className="flex-1 p-3 sm:p-6 bg-slate-100/80 overflow-y-auto flex justify-center">
          {printFormat === 'a4' ? (
            /* ========================================================= */
            /* LAYOUT EXECUTIVO EM FOLHA A4 (MÚLTIPLAS VIAS)             */
            /* ========================================================= */
            <div
              id="printable-a4-order"
              className={`printable-document-container w-full max-w-[794px] space-y-6 ${
                isBw ? 'bw-print-mode grayscale contrast-105' : ''
              }`}
            >
              {Array.from({ length: copies }).map((_, viaIdx) => {
                const badge = getViaBadge(viaIdx, copies);
                return (
                  <div
                    key={viaIdx}
                    className={`w-full max-w-[794px] bg-white p-6 sm:p-8 rounded-xl shadow-md border border-slate-200 text-slate-800 text-xs leading-normal select-text space-y-4 print:shadow-none print:border-none print:p-0 ${
                      viaIdx < copies - 1 ? 'a4-page-break mb-8 print:mb-0' : ''
                    }`}
                  >
                    {/* Identificador da Via no Topo se copies > 1 ou se ativado */}
                    {copies > 1 && printerConfig.orderCopiesLabelMode !== 'nenhum' && (
                      <div className="flex items-center justify-between pb-2 mb-1 border-b-2 border-slate-300 text-[11px] font-bold">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] uppercase font-black tracking-wider border ${badge.badgeClass}`}>
                          <Layers size={12} />
                          {badge.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          VIA {viaIdx + 1} DE {copies} • PEDIDO Nº {order.number}
                        </span>
                      </div>
                    )}

                    {/* 1. CANHOTO DE RECEBIMENTO DESTACÁVEL (SE CONFIGURADO) */}
                    {printerConfig.a4ShowReceiptStub !== false && (
                      <div className="pb-3 border-b-2 border-dashed border-slate-300 text-[10px] space-y-1.5">
                        <div className="flex justify-between items-center text-slate-500 font-semibold">
                          <span className="flex items-center gap-1 uppercase tracking-wider text-blue-900 font-bold">
                            <Scissors size={12} className="text-slate-400" />
                            Canhoto de Recebimento de Mercadorias (Destaque Aqui)
                          </span>
                          <span className="font-mono font-bold text-slate-700">PEDIDO Nº: {order.number}</span>
                        </div>
                        <p className="text-slate-600 text-[10px] leading-tight">
                          Recebi(emos) de <strong>{activeCompany.tradeName || activeCompany.name}</strong> os produtos constantes no presente {isQuote ? 'Orçamento' : 'Pedido de Venda'}, em perfeitas condições e conformidade com as especificações solicitadas.
                        </p>
                        <div className="grid grid-cols-12 gap-3 pt-1">
                          <div className="col-span-3 border-b border-slate-400 pb-0.5">
                            <span className="text-[9px] text-slate-400 block">Data de Recebimento:</span>
                            <span className="font-mono text-slate-700">___/___/______</span>
                          </div>
                          <div className="col-span-5 border-b border-slate-400 pb-0.5">
                            <span className="text-[9px] text-slate-400 block">Nome Legível do Recebedor:</span>
                            <span className="text-slate-400 text-[9px] italic">_________________________________</span>
                          </div>
                          <div className="col-span-4 border-b border-slate-400 pb-0.5">
                            <span className="text-[9px] text-slate-400 block">Assinatura / RG do Recebedor:</span>
                            <span className="text-slate-400 text-[9px] italic">_______________________</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. CABEÇALHO TIMBRADO DA EMPRESA (COM LOGOMARCA OFICIAL) */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-200">
                      <div className="flex items-start gap-3.5">
                        {printerConfig.a4ShowLogo !== false && (
                          companyLogoUrl ? (
                            <img
                              src={companyLogoUrl}
                              alt={activeCompany.tradeName || activeCompany.name}
                              className="w-16 h-16 sm:w-20 sm:h-20 max-w-[130px] max-h-[85px] object-contain rounded-xl p-1 border border-slate-200 bg-white shadow-2xs shrink-0 print:border-none print:shadow-none"
                              style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
                            />
                          ) : (
                            <div
                              className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-700 shrink-0 shadow-2xs print:border-slate-300"
                              title={activeCompany.tradeName || activeCompany.name}
                            >
                              <Building2 size={24} className="text-slate-500 mb-0.5" />
                              <span className="text-[11px] font-black tracking-wider text-slate-700 uppercase">
                                {companyInitials}
                              </span>
                            </div>
                          )
                        )}
                        <div>
                          <h1 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">
                            {activeCompany.tradeName || activeCompany.name}
                          </h1>
                          {activeCompany.name !== activeCompany.tradeName && (
                            <p className="text-[11px] text-slate-600 font-medium">{activeCompany.name}</p>
                          )}
                          <div className="text-[10px] text-slate-500 mt-0.5 space-y-0.5">
                            <p>
                              CNPJ: <strong className="font-mono text-slate-700">{activeCompany.cnpjCpf}</strong>
                              {(activeCompany as any).ie && <span> • IE: <strong className="font-mono text-slate-700">{(activeCompany as any).ie}</strong></span>}
                            </p>
                            <p>
                              {activeCompany.address.street}, {activeCompany.address.number}
                              {activeCompany.address.neighborhood && ` - ${activeCompany.address.neighborhood}`} • {activeCompany.address.city}/{activeCompany.address.state} • CEP {activeCompany.address.zipCode}
                            </p>
                            <p>
                              {activeCompany.phone && <span>Tel: <strong>{activeCompany.phone}</strong></span>}
                              {activeCompany.email && <span> • E-mail: <strong>{activeCompany.email}</strong></span>}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Bloco de Identificação do Documento */}
                      <div className="text-right sm:border-l sm:border-slate-200 sm:pl-4 space-y-0.5 shrink-0">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                            isBonus
                              ? isBw
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-sky-100 text-sky-900 border-sky-300'
                              : 'bg-blue-100 text-blue-900 border-blue-200'
                          }`}
                        >
                          {isBonus ? 'Pedido de Bonificação' : isQuote ? 'Orçamento Comercial' : 'Pedido de Venda'}
                        </span>
                        <div className="text-lg font-black font-mono text-slate-900">
                          Nº {order.number}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Emissão: <strong className="text-slate-700 font-mono">{new Date(order.createdAt).toLocaleString('pt-BR')}</strong>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Status: <strong className="uppercase text-emerald-700">
                            {order.status === 'concluido'
                              ? 'Concluído'
                              : order.status === 'em_romaneio'
                              ? 'Em Romaneio'
                              : order.status === 'em_transito'
                              ? 'Em Trânsito'
                              : order.status === 'entregue'
                              ? 'Entregue'
                              : order.status === 'nao_entregue'
                              ? 'Não Entregue'
                              : order.status === 'aberto'
                              ? 'Aberto'
                              : order.status === 'convertido_em_venda'
                              ? 'Convertido em Venda'
                              : order.status === 'cancelado'
                              ? 'Cancelado'
                              : order.status}
                          </strong>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Vendedor: <strong className="text-slate-800">{order.userName}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Faixa de Identificação de Bonificação */}
                    {isBonus && (
                      <div
                        className={`rounded-xl px-3.5 py-2 text-center text-[11px] font-black uppercase tracking-wider border-2 ${
                          isBw
                            ? 'bg-slate-100 text-slate-950 border-slate-900'
                            : 'bg-sky-50 text-sky-950 border-sky-300'
                        }`}
                        style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
                      >
                        PEDIDO DE BONIFICAÇÃO — SEM COBRANÇA FINANCEIRA • SAÍDA EXCLUSIVA DE ESTOQUE
                      </div>
                    )}

                    {/* 3. DADOS DO CLIENTE & ENTREGA */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                      <div className="text-[11px] font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-200">
                        <UserIcon size={13} className="text-blue-600" />
                        <span>Dados do Cliente & Destinatário</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-[11px]">
                        <div className="sm:col-span-8">
                          <span className="text-slate-400 block text-[10px]">Cliente / Razão Social:</span>
                          <strong className="text-slate-800 text-xs">{order.customerName}</strong>
                        </div>
                        <div className="sm:col-span-4">
                          <span className="text-slate-400 block text-[10px]">CPF / CNPJ:</span>
                          <strong className="font-mono text-slate-700">{order.customerCpfCnpj || customerDetails?.cpfCnpj || 'Não informado'}</strong>
                        </div>

                        <div className="sm:col-span-6">
                          <span className="text-slate-400 block text-[10px]">Endereço de Entrega:</span>
                          <span className="text-slate-700">
                            {customerDetails?.street
                              ? `${customerDetails.street}, ${customerDetails.number || 'S/N'}${customerDetails.neighborhood ? ` - ${customerDetails.neighborhood}` : ''}`
                              : 'Balcão / A retirar'}
                          </span>
                        </div>
                        <div className="sm:col-span-3">
                          <span className="text-slate-400 block text-[10px]">Cidade/UF:</span>
                          <span className="text-slate-700">{customerDetails ? `${customerDetails.city}/${customerDetails.state}` : '-'}</span>
                        </div>
                        <div className="sm:col-span-3">
                          <span className="text-slate-400 block text-[10px]">Telefone / WhatsApp:</span>
                          <span className="font-mono text-slate-700">{order.customerPhone || customerDetails?.phone || customerDetails?.whatsapp || '-'}</span>
                        </div>

                        {customerDetails?.deliveryRouteName && (
                          <div className="sm:col-span-12 flex items-center gap-2 pt-1 text-[10px] text-blue-900 bg-blue-50/60 p-1.5 rounded-lg border border-blue-100">
                            <Truck size={13} className="text-blue-600 shrink-0" />
                            <span>Rota de Entrega: <strong>{customerDetails.deliveryRouteName}</strong> {customerDetails.marketArea && `• Praça: ${customerDetails.marketArea}`}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 4. TABELA DE PRODUTOS / ITENS DO PEDIDO */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr
                            className={`font-extrabold text-[10px] uppercase tracking-wider ${
                              isBw
                                ? 'bg-slate-100 text-slate-950 border-y-2 border-slate-900'
                                : 'bg-slate-900 text-white'
                            }`}
                          >
                            <th className="py-2 px-2.5 text-center w-10">#</th>
                            <th className="py-2 px-2.5 w-20">Código</th>
                            <th className="py-2 px-2.5">Descrição do Produto</th>
                            <th className="py-2 px-2 text-center w-12">UN</th>
                            <th className="py-2 px-2.5 text-right w-16">Qtd</th>
                            <th className="py-2 px-2.5 text-right w-24">{isBonus ? 'Unit. (Ref.)' : 'Unitário'}</th>
                            <th className="py-2 px-2 text-right w-20">Desconto</th>
                            <th className="py-2 px-3 text-right w-24">{isBonus ? 'Total (Ref.)' : 'Total Líquido'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {order.items.map((item, idx) => {
                            const effectiveUnitPrice =
                              item.additionValue && item.additionValue > 0
                                ? (item.totalPrice + (item.discountValue || 0)) / (item.quantity || 1)
                                : item.unitPrice;

                            return (
                              <tr key={item.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                                <td className="py-1.5 px-2.5 text-center text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                                <td className="py-1.5 px-2.5 font-mono font-bold text-slate-600 text-[10px]">{item.productCode || '-'}</td>
                                <td className="py-1.5 px-2.5 font-medium text-slate-800">{item.description}</td>
                                <td className="py-1.5 px-2 text-center text-slate-500 font-semibold">{item.unit}</td>
                                <td className="py-1.5 px-2.5 text-right font-bold text-slate-900 font-mono">{formatQuantity(item.quantity)}</td>
                                <td className="py-1.5 px-2.5 text-right font-mono text-slate-600">{formatCurrency(effectiveUnitPrice)}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-rose-600">
                                  {item.discountValue > 0 ? `-${formatCurrency(item.discountValue)}` : '-'}
                                </td>
                                <td className="py-1.5 px-3 text-right font-bold font-mono text-slate-900">{formatCurrency(item.totalPrice)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* 5. TOTAIS FINANCEIROS & CONDIÇÃO DE PAGAMENTO */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                      {/* Coluna Esquerda: Forma e Prazo de Pagamento em Destaque */}
                      <div className="sm:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5 text-[11px]">
                        <div className="font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                          <CreditCard size={14} className="text-blue-600" />
                          <span>Condições Comerciais & Pagamento</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div
                            className={`rounded-lg px-3 py-2 shadow-2xs ${
                              isBw
                                ? 'bg-white border-2 border-slate-900'
                                : 'bg-blue-50/90 border border-blue-200'
                            }`}
                            style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
                          >
                            <span
                              className={`text-[9px] font-extrabold uppercase tracking-wider block mb-0.5 ${
                                isBw ? 'text-slate-700' : 'text-blue-700'
                              }`}
                            >
                              Forma de Pagamento
                            </span>
                            <strong className="text-sm font-black text-slate-900 uppercase tracking-tight leading-snug block">
                              {paymentMethodLabel}
                            </strong>
                          </div>
                          <div
                            className={`rounded-lg px-3 py-2 shadow-2xs ${
                              isBw
                                ? 'bg-white border-2 border-slate-900'
                                : 'bg-emerald-50/90 border border-emerald-200'
                            }`}
                            style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
                          >
                            <span
                              className={`text-[9px] font-extrabold uppercase tracking-wider block mb-0.5 ${
                                isBw ? 'text-slate-700' : 'text-emerald-700'
                              }`}
                            >
                              Prazo de Pagamento
                            </span>
                            <strong className="text-sm font-black text-slate-900 uppercase tracking-tight leading-snug block">
                              {paymentTermLabel}
                            </strong>
                          </div>
                        </div>

                        {order.notes && (
                          <div className="pt-1.5 border-t border-slate-200">
                            <span className="text-slate-400 text-[10px] block font-semibold">Observações do Pedido:</span>
                            <p className="text-slate-700 text-[10px] italic">{order.notes}</p>
                          </div>
                        )}
                      </div>

                      {/* Coluna Direita: Resumo Financeiro Consolidado */}
                      <div
                        className={`sm:col-span-5 rounded-xl p-3.5 space-y-1.5 text-xs shadow-sm ${
                          isBw
                            ? 'bg-slate-50 text-slate-950 border-2 border-slate-900'
                            : isBonus
                            ? 'bg-sky-950 text-white'
                            : 'bg-slate-900 text-white'
                        }`}
                      >
                        {isBonus ? (
                          <>
                            <div className={`flex justify-between text-[11px] ${isBw ? 'text-slate-700' : 'text-sky-200'}`}>
                              <span>Valor de Referência (Itens):</span>
                              <span className="font-mono">{formatCurrency(referenceTotal || referenceSubtotal)}</span>
                            </div>
                            <div className={`flex justify-between text-[11px] ${isBw ? 'text-slate-700' : 'text-sky-200'}`}>
                              <span>Natureza Financeira:</span>
                              <span className="font-bold uppercase">Bonificação</span>
                            </div>
                            <div className={`pt-2 border-t flex justify-between items-center text-sm font-black ${isBw ? 'border-slate-900' : 'border-sky-700'}`}>
                              <span className={`uppercase ${isBw ? 'text-slate-950' : 'text-sky-200'}`}>Total a Cobrar:</span>
                              <span className={`text-base font-mono ${isBw ? 'text-slate-950' : 'text-emerald-300'}`}>{formatCurrency(0)}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={`flex justify-between text-[11px] ${isBw ? 'text-slate-700' : 'text-slate-300'}`}>
                              <span>Subtotal dos Itens:</span>
                              <span className="font-mono">{formatCurrency(order.subtotal)}</span>
                            </div>
                            {order.discountTotal > 0 && (
                              <div className={`flex justify-between text-[11px] ${isBw ? 'text-slate-800 font-semibold' : 'text-rose-300'}`}>
                                <span>Desconto Total:</span>
                                <span className="font-mono">-{formatCurrency(order.discountTotal)}</span>
                              </div>
                            )}
                            {(order as any).freightTotal > 0 && (
                              <div className={`flex justify-between text-[11px] ${isBw ? 'text-slate-700' : 'text-slate-300'}`}>
                                <span>Frete / Entrega:</span>
                                <span className="font-mono">+{formatCurrency((order as any).freightTotal)}</span>
                              </div>
                            )}
                            <div className={`pt-2 border-t flex justify-between items-center text-sm font-black ${isBw ? 'border-slate-900' : 'border-slate-700'}`}>
                              <span className={`uppercase ${isBw ? 'text-slate-950' : 'text-amber-400'}`}>Total Geral:</span>
                              <span className={`text-base font-mono ${isBw ? 'text-slate-950' : 'text-emerald-400'}`}>{formatCurrency(order.total)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 6. TERMOS E CONDIÇÕES LEGAIS (A4) */}
                    {printerConfig.a4ShowCommercialTerms !== false && (
                      <div className="pt-2 border-t border-slate-200 text-[9px] text-slate-500 space-y-0.5 leading-tight">
                        <p className="font-bold text-slate-700">Termos e Condições Comerciais:</p>
                        <p>
                          {printerConfig.a4CommercialTermsText ||
                            'Orçamento/Pedido válido por 10 dias úteis. As mercadorias devem ser conferidas no ato da entrega. Não aceitamos devoluções de produtos abertos ou avariados após assinatura do canhoto.'}
                        </p>
                      </div>
                    )}

                    {/* 7. ASSINATURA DA EMPRESA E CLIENTE NO RODAPÉ */}
                    {printerConfig.a4ShowSignatures !== false && (
                      <div className="grid grid-cols-2 gap-8 pt-6 pb-2 text-center text-[10px]">
                        <div className="border-t border-slate-400 pt-1">
                          <span className="font-bold text-slate-800 block">{activeCompany.tradeName || activeCompany.name}</span>
                          <span className="text-slate-500">Vendedor: {order.userName}</span>
                        </div>
                        <div className="border-t border-slate-400 pt-1">
                          <span className="font-bold text-slate-800 block">{order.customerName}</span>
                          <span className="text-slate-500">Assinatura do Cliente / Comprador</span>
                        </div>
                      </div>
                    )}

                    {/* 8. RODAPÉ DISCRETO DO SISTEMA */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400">
                      <span>Documento emitido eletronicamente • Pedido Nº {order.number}</span>
                      <div className="flex items-center gap-1.5 opacity-75">
                        <span className="text-[9px] text-slate-400">Sistema:</span>
                        <GestaoFacilLogo size={14} showSlogan={false} compact />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ========================================================= */
            /* LAYOUT CUPOM TÉRMICO (80MM / 58MM - MÚLTIPLAS VIAS)       */
            /* ========================================================= */
            <div
              id="printable-receipt"
              style={{
                '--receipt-width': printerConfig.paperWidth,
                '--receipt-margin-left': `${printerConfig.marginLeft}mm`,
                '--receipt-margin-right': `${printerConfig.marginRight}mm`,
                '--receipt-font-size':
                  printerConfig.fontSize === 'pequena'
                    ? '10px'
                    : printerConfig.fontSize === 'grande'
                    ? '12px'
                    : '11px',
                width: '100%',
                maxWidth: printerConfig.paperWidth === '58mm' ? '255px' : '330px',
                paddingLeft: `${Math.round(printerConfig.marginLeft * 3.8) + 8}px`,
                paddingRight: `${Math.round(printerConfig.marginRight * 3.8) + 8}px`,
                boxSizing: 'border-box',
              } as React.CSSProperties}
              className={`printable-document-container w-full bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-slate-800 font-mono text-xs leading-relaxed space-y-4 ${
                isBw ? 'bw-print-mode grayscale contrast-105' : ''
              }`}
            >
              {Array.from({ length: copies }).map((_, viaIdx) => {
                const badge = getViaBadge(viaIdx, copies);
                return (
                  <div
                    key={viaIdx}
                    className={viaIdx < copies - 1 ? 'pb-4 border-b-2 border-dashed border-slate-400' : ''}
                  >
                    {/* Divisor de destaque entre vias da bobina */}
                    {viaIdx > 0 && (
                      <div className="my-3 py-1.5 border-y border-dashed border-slate-400 text-center text-[10px] font-mono font-bold text-slate-600 space-y-0.5">
                        <div>✂ - - - - - - - - - - - - - - - - ✂</div>
                        <div>DESTACAR / CORTE DA BOBINA</div>
                        <div>- - - - - - - - - - - - - - - - -</div>
                      </div>
                    )}

                    {/* Identificador da Via no topo do cupom */}
                    {copies > 1 && printerConfig.orderCopiesLabelMode !== 'nenhum' && (
                      <div className="text-center font-bold text-[10px] py-1 mb-2.5 bg-slate-100 border border-slate-300 rounded font-mono uppercase tracking-wide">
                        *** {badge.label} ({viaIdx + 1}/{copies}) ***
                      </div>
                    )}

                    {/* Cabeçalho da Empresa Dinâmico (com Logomarca na Bobina 80mm/58mm) */}
                    <div
                      className={`pb-3 border-b border-dashed border-slate-300 ${
                        printerConfig.headerAlignment === 'left' ? 'text-left' : 'text-center'
                      }`}
                    >
                      {/* Logomarca da Empresa no Cupom Térmico (80mm e 58mm) */}
                      {companyLogoUrl && (
                        <div className={`mb-2.5 ${printerConfig.headerAlignment === 'left' ? 'flex justify-start' : 'flex justify-center'}`}>
                          <img
                            src={companyLogoUrl}
                            alt={activeCompany.tradeName || activeCompany.name}
                            className="max-h-14 max-w-[160px] object-contain filter grayscale contrast-125"
                            style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
                          />
                        </div>
                      )}
                      {printerConfig.showTradeName && (
                        <div className="font-bold text-sm tracking-wide">{activeCompany.tradeName || activeCompany.name}</div>
                      )}
                      {printerConfig.headerFormat === 'completo' && activeCompany.name !== activeCompany.tradeName && (
                        <div className="text-[10px] text-slate-600 truncate">{activeCompany.name}</div>
                      )}
                      {printerConfig.showCnpj && (
                        <div className="text-[11px] text-slate-500">CNPJ: {activeCompany.cnpjCpf}</div>
                      )}
                      {printerConfig.showPhone && activeCompany.phone && (
                        <div className="text-[11px] text-slate-500">Tel: {activeCompany.phone}</div>
                      )}
                      {printerConfig.showAddress && printerConfig.headerFormat === 'completo' && (
                        <div className="text-[10px] text-slate-400">
                          {activeCompany.address.street}, {activeCompany.address.number} - {activeCompany.address.city}/{activeCompany.address.state}
                        </div>
                      )}
                      {printerConfig.customHeaderText && (
                        <div className="text-[10px] font-bold text-slate-700 pt-1">{printerConfig.customHeaderText}</div>
                      )}
                    </div>

                    {/* Dados do Pedido */}
                    <div className="py-2.5 border-b border-dashed border-slate-300 space-y-0.5 text-[11px]">
                      {isBonus && (
                        <div className="text-center font-black uppercase text-[10px] py-1 mb-1 bg-slate-900 text-white rounded">
                          *** PEDIDO DE BONIFICAÇÃO ***
                        </div>
                      )}
                      <div className="flex justify-between font-bold">
                        <span>{isBonus ? 'BONIFICAÇÃO' : isQuote ? 'ORÇAMENTO' : 'VENDA'}: {order.number}</span>
                        <span>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>
                          Origem:{' '}
                          {order.origin === 'pdv'
                            ? 'PDV Balcão'
                            : order.origin === 'externa_celular'
                            ? 'Venda Externa Mobile'
                            : 'Balcão'}
                        </span>
                        <span>{new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="text-slate-600">
                        Vendedor: <span className="font-semibold">{order.userName}</span>
                      </div>
                      <div className="text-slate-600 truncate">
                        Cliente: <span className="font-semibold">{order.customerName}</span>
                      </div>
                    </div>

                    {/* Tabela de Itens */}
                    <div className="py-2.5 border-b border-dashed border-slate-300">
                      <div className="text-[10px] font-bold text-slate-500 uppercase flex justify-between mb-1">
                        <span>QTD x ITEM</span>
                        <span>TOTAL</span>
                      </div>
                      <div className="space-y-1.5">
                        {order.items.map((item, idx) => {
                          const effectiveUnitPrice =
                            item.additionValue && item.additionValue > 0
                              ? (item.totalPrice + (item.discountValue || 0)) / (item.quantity || 1)
                              : item.unitPrice;
                          return (
                            <div key={item.id || idx} className="text-[11px]">
                              <div className="font-semibold text-slate-800">{item.description}</div>
                              <div className="flex justify-between text-slate-500">
                                <span>
                                  {formatQuantity(item.quantity)} {item.unit} x {formatCurrency(effectiveUnitPrice)}
                                  {item.discountValue > 0 && ` (-${formatCurrency(item.discountValue)})`}
                                </span>
                                <span className="font-medium text-slate-800">{formatCurrency(item.totalPrice)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Totais */}
                    <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-xs">
                      {isBonus ? (
                        <>
                          <div className="flex justify-between text-slate-600 text-[11px]">
                            <span>Valor Referência:</span>
                            <span>{formatCurrency(referenceTotal || referenceSubtotal)}</span>
                          </div>
                          <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-200">
                            <span>TOTAL A COBRAR:</span>
                            <span>{formatCurrency(0)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between text-slate-600">
                            <span>Subtotal Itens:</span>
                            <span>{formatCurrency(order.subtotal)}</span>
                          </div>
                          {order.discountTotal > 0 && (
                            <div className="flex justify-between text-rose-600 font-medium">
                              <span>Descontos:</span>
                              <span>-{formatCurrency(order.discountTotal)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-200">
                            <span>VALOR TOTAL:</span>
                            <span>{formatCurrency(order.total)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Pagamento */}
                    <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
                      {isBonus ? (
                        <div className="text-center bg-slate-100 px-2 py-1 rounded font-black uppercase text-slate-900 text-[10px]">
                          BONIFICAÇÃO — SEM COBRANÇA FINANCEIRA
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-center bg-slate-100 px-1.5 py-0.5 rounded">
                            <span className="font-semibold text-slate-700">Forma de Pagto:</span>
                            <span className="font-black uppercase text-slate-900">{paymentMethodLabel}</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-100 px-1.5 py-0.5 rounded">
                            <span className="font-semibold text-slate-700">Prazo de Pagto:</span>
                            <span className="font-black uppercase text-slate-900">{paymentTermLabel}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Rodapé Comercial */}
                    <div className="pt-3 text-center text-[10px] text-slate-400 whitespace-pre-line leading-relaxed">
                      {printerConfig.footerMessage || '*** DOCUMENTO NÃO FISCAL ***\nObrigado pela preferência e confiança!'}
                    </div>
                    <div className="pt-2 mt-2 border-t border-dotted border-slate-200 flex items-center justify-center gap-1 opacity-70">
                      <span className="text-[8px] text-slate-400">Emitido via</span>
                      <GestaoFacilLogo size={12} showSlogan={false} compact />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* BARRA INFERIOR DE AÇÕES E BOTÕES DE IMPRESSÃO */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap gap-2 justify-between items-center no-print shrink-0">
          <button
            type="button"
            onClick={handleCopyText}
            className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-900 border border-slate-300 hover:bg-slate-100 px-3.5 py-2 rounded-xl font-bold transition-colors cursor-pointer"
          >
            {copied ? <Check size={15} className="text-emerald-600" /> : <MessageSquare size={15} />}
            <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold shadow-xs transition-colors cursor-pointer"
              title="Compartilhar resumo comercial via WhatsApp"
            >
              <Share2 size={15} />
              <span>Enviar WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-extrabold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
              title={`Imprimir no formato ${printFormat === 'a4' ? 'Folha A4' : 'Cupom Térmico'}`}
            >
              <Printer size={16} />
              <span>
                Imprimir {printFormat === 'a4' ? 'Folha A4' : 'Cupom Térmico'}{' '}
                {copies > 1 && `(${copies} Vias)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
