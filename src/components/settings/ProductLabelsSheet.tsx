import React from 'react';
import { Product } from '../../types';
import { encodeProductBarcode } from '../../utils/barcodeGenerator';

export type LabelModelId = '30' | '40' | '60';

export interface LabelModelSpec {
  id: LabelModelId;
  code: string;
  title: string;
  subtitle: string;
  perPage: number;
  cols: number;
  rows: number;
  labelWidthMm: number;
  labelHeightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  description: string;
}

export const LABEL_MODELS: Record<LabelModelId, LabelModelSpec> = {
  '30': {
    id: '30',
    code: 'MODELO 1',
    title: '30 etiquetas por folha',
    subtitle: '3 colunas × 10 linhas · 6,6 × 2,87 cm',
    perPage: 30,
    cols: 3,
    rows: 10,
    labelWidthMm: 66.0,
    labelHeightMm: 28.7,
    marginTopMm: 5.0,
    marginBottomMm: 5.0,
    marginLeftMm: 6.0,
    marginRightMm: 6.0,
    description: 'Etiqueta maior com destaque máximo para preço e leitura rápida em gôndola.',
  },
  '40': {
    id: '40',
    code: 'MODELO 2',
    title: '40 etiquetas por folha',
    subtitle: '4 colunas × 10 linhas · 5,0 × 2,87 cm',
    perPage: 40,
    cols: 4,
    rows: 10,
    labelWidthMm: 50.0,
    labelHeightMm: 28.7,
    marginTopMm: 5.0,
    marginBottomMm: 5.0,
    marginLeftMm: 5.0,
    marginRightMm: 5.0,
    description: 'Tamanho intermediário equilibrado entre economia de papel e visibilidade.',
  },
  '60': {
    id: '60',
    code: 'MODELO 3',
    title: '60 etiquetas por folha',
    subtitle: '5 colunas × 12 linhas · 4,0 × 2,39 cm',
    perPage: 60,
    cols: 5,
    rows: 12,
    labelWidthMm: 40.0,
    labelHeightMm: 23.9,
    marginTopMm: 5.1,
    marginBottomMm: 5.1,
    marginLeftMm: 5.0,
    marginRightMm: 5.0,
    description: 'Modelo compacto de alto rendimento para grande volume de itens na mesma folha.',
  },
};

export interface LabelRenderEntry {
  product: Product;
  salePrice: number;
}

export interface LabelSelectionEntry {
  productId: string;
  quantity: number;
}

/**
 * Expande a lista de produtos selecionados em páginas A4 de acordo com o modelo e posição inicial (1-indexed).
 * As posições anteriores à posição inicial ficam vazias (null) para reaproveitar folhas parcialmente usadas.
 */
export function buildLabelPages(
  entries: Array<{ product: Product; salePrice: number; quantity: number }>,
  modelId: LabelModelId,
  startPosition: number
): Array<Array<LabelRenderEntry | null>> {
  const spec = LABEL_MODELS[modelId];
  const safeStart = Math.max(1, Math.min(spec.perPage, Math.floor(startPosition || 1)));

  const flatSlots: Array<LabelRenderEntry | null> = [];
  for (let i = 0; i < safeStart - 1; i++) {
    flatSlots.push(null);
  }

  for (const item of entries) {
    const qty = Math.max(0, Math.floor(item.quantity || 0));
    for (let q = 0; q < qty; q++) {
      flatSlots.push({
        product: item.product,
        salePrice: item.salePrice,
      });
    }
  }

  if (flatSlots.length === safeStart - 1) {
    return [];
  }

  const totalPages = Math.ceil(flatSlots.length / spec.perPage);
  const pages: Array<Array<LabelRenderEntry | null>> = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const start = pageIdx * spec.perPage;
    const pageSlots: Array<LabelRenderEntry | null> = [];
    for (let s = 0; s < spec.perPage; s++) {
      pageSlots.push(flatSlots[start + s] ?? null);
    }
    pages.push(pageSlots);
  }

  return pages;
}

function splitPriceParts(value: number): { intPart: string; decPart: string } {
  const safe = Number.isFinite(value) && value >= 0 ? value : 0;
  const formatted = safe.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const [intPart, decPart = '00'] = formatted.split(',');
  return { intPart, decPart };
}

function getAdaptiveNameFontMm(name: string, modelId: LabelModelId): number {
  const len = (name || '').trim().length;
  if (modelId === '30') {
    if (len <= 22) return 3.05;
    if (len <= 34) return 2.65;
    if (len <= 48) return 2.3;
    if (len <= 64) return 2.0;
    return 1.78;
  }
  if (modelId === '40') {
    if (len <= 18) return 2.75;
    if (len <= 28) return 2.4;
    if (len <= 42) return 2.05;
    if (len <= 56) return 1.82;
    return 1.65;
  }
  // Modelo 60 (compacto)
  if (len <= 15) return 2.25;
  if (len <= 25) return 1.98;
  if (len <= 38) return 1.72;
  if (len <= 50) return 1.54;
  return 1.38;
}

function getAdaptivePriceSizesMm(
  intPart: string,
  modelId: LabelModelId
): { currencyMm: number; integerMm: number; centsMm: number } {
  const digits = intPart.replace(/\./g, '').length;
  if (modelId === '30') {
    if (digits <= 2) return { currencyMm: 3.1, integerMm: 9.0, centsMm: 4.8 };
    if (digits === 3) return { currencyMm: 2.7, integerMm: 7.5, centsMm: 4.0 };
    if (digits === 4) return { currencyMm: 2.35, integerMm: 6.0, centsMm: 3.3 };
    return { currencyMm: 2.0, integerMm: 4.9, centsMm: 2.75 };
  }
  if (modelId === '40') {
    if (digits <= 2) return { currencyMm: 2.55, integerMm: 6.4, centsMm: 3.5 };
    if (digits === 3) return { currencyMm: 2.3, integerMm: 5.6, centsMm: 3.1 };
    if (digits === 4) return { currencyMm: 2.0, integerMm: 4.7, centsMm: 2.65 };
    return { currencyMm: 1.8, integerMm: 3.9, centsMm: 2.25 };
  }
  // Modelo 60
  if (digits <= 2) return { currencyMm: 2.15, integerMm: 5.0, centsMm: 2.8 };
  if (digits === 3) return { currencyMm: 1.95, integerMm: 4.4, centsMm: 2.5 };
  if (digits === 4) return { currencyMm: 1.75, integerMm: 3.7, centsMm: 2.15 };
  return { currencyMm: 1.55, integerMm: 3.1, centsMm: 1.85 };
}

interface BarcodeBlockProps {
  rawBarcode?: string;
  modelId: LabelModelId;
}

const BarcodeBlock: React.FC<BarcodeBlockProps> = ({ rawBarcode, modelId }) => {
  const encoded = React.useMemo(() => encodeProductBarcode(rawBarcode), [rawBarcode]);

  const svgHeightMm = modelId === '30' ? 10.2 : modelId === '40' ? 8.2 : 6.3;
  const textFontMm = modelId === '30' ? 2.05 : modelId === '40' ? 1.95 : 1.65;
  const emptyHeightMm = modelId === '30' ? 12.6 : modelId === '40' ? 10.5 : 8.25;

  if (!encoded) {
    return (
      <div
        aria-hidden="true"
        style={{
          width: '100%',
          height: `${emptyHeightMm}mm`,
          backgroundColor: 'transparent',
          boxSizing: 'border-box',
        }}
      />
    );
  }

  const viewHeight = 40;
  const regularBarHeight = encoded.format === 'CODE128' ? 39 : 36;
  const guardBarHeight = 40;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        backgroundColor: '#ffffff',
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox={`0 0 ${encoded.totalModules} ${viewHeight}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        aria-label={`Código de barras ${encoded.value}`}
        style={{
          width: '100%',
          height: `${svgHeightMm}mm`,
          display: 'block',
          backgroundColor: '#ffffff',
        }}
      >
        <rect x="0" y="0" width={encoded.totalModules} height={viewHeight} fill="#ffffff" />
        {encoded.bars.map((bar, idx) => (
          <rect
            key={idx}
            x={bar.x}
            y={0}
            width={bar.width}
            height={bar.isGuard ? guardBarHeight : regularBarHeight}
            fill="#000000"
          />
        ))}
      </svg>
      <div
        style={{
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontSize: `${textFontMm}mm`,
          lineHeight: 1.05,
          fontWeight: 700,
          color: '#000000',
          letterSpacing: modelId === '60' ? '0.04em' : '0.08em',
          marginTop: '0.25mm',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}
      >
        {encoded.value}
      </div>
    </div>
  );
};

interface SingleLabelCardProps {
  entry: LabelRenderEntry;
  modelId: LabelModelId;
}

const SingleLabelCard: React.FC<SingleLabelCardProps> = ({ entry, modelId }) => {
  const { product, salePrice } = entry;
  const displayName = (product.description || 'PRODUTO SEM DESCRIÇÃO').trim().toUpperCase();
  const displayCode = (product.code || '-').trim();
  const { intPart, decPart } = splitPriceParts(salePrice);

  const nameFontMm = getAdaptiveNameFontMm(displayName, modelId);
  const priceSizes = getAdaptivePriceSizesMm(intPart, modelId);

  if (modelId === '30') {
    // MODELO 1 — 66mm × 28.7mm: Barra preta com nome em branco no topo; esquerda Código + Código de Barras; direita Preço grande
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          border: '0.22mm solid #1a1a1a',
          backgroundColor: '#ffffff',
          color: '#000000',
          padding: 0,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        {/* Barra de título preta com descrição do produto em branco */}
        <div
          style={{
            backgroundColor: '#000000',
            color: '#ffffff',
            padding: '1.05mm 1.6mm',
            minHeight: '6.6mm',
            display: 'flex',
            alignItems: 'center',
            boxSizing: 'border-box',
            flexShrink: 0,
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <div
            style={{
              fontSize: `${nameFontMm}mm`,
              fontWeight: 800,
              lineHeight: 1.1,
              color: '#ffffff',
              textTransform: 'uppercase',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
              width: '100%',
            }}
          >
            {displayName}
          </div>
        </div>

        {/* Corpo: Código + Barras à esquerda | Preço em destaque à direita */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '1.2mm',
            flex: 1,
            padding: '0.75mm 1.4mm 0.85mm 1.4mm',
            boxSizing: 'border-box',
            minHeight: 0,
          }}
        >
          <div
            style={{
              width: '34.2mm',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
              minWidth: 0,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '1.9mm',
                fontWeight: 700,
                color: '#262626',
                lineHeight: 1.05,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              CÓD: {displayCode}
            </div>
            <BarcodeBlock rawBarcode={product.barcode} modelId="30" />
          </div>

          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              minWidth: 0,
              paddingBottom: '0.45mm',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'flex-end',
                color: '#000000',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 0.92,
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  fontSize: `${priceSizes.currencyMm}mm`,
                  fontWeight: 800,
                  marginRight: '0.5mm',
                  color: '#171717',
                }}
              >
                R$
              </span>
              <span
                style={{
                  fontSize: `${priceSizes.integerMm}mm`,
                  fontWeight: 900,
                  letterSpacing: '-0.03em',
                }}
              >
                {intPart}
              </span>
              <span
                style={{
                  fontSize: `${priceSizes.centsMm}mm`,
                  fontWeight: 900,
                }}
              >
                ,{decPart}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MODELO 2 (50mm × 28.7mm) e MODELO 3 (40mm × 23.9mm):
  // Barra preta com nome em branco no topo | Linha central com Código à esquerda e Preço em destaque à direita | Código de barras em largura total na base
  const isCompact = modelId === '60';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        border: '0.22mm solid #1a1a1a',
        backgroundColor: '#ffffff',
        color: '#000000',
        padding: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
    >
      {/* Barra de título preta com descrição do produto em branco */}
      <div
        style={{
          backgroundColor: '#000000',
          color: '#ffffff',
          padding: isCompact ? '0.65mm 1.0mm' : '0.85mm 1.25mm',
          minHeight: isCompact ? '4.6mm' : '5.8mm',
          display: 'flex',
          alignItems: 'center',
          boxSizing: 'border-box',
          flexShrink: 0,
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        <div
          style={{
            fontSize: `${nameFontMm}mm`,
            fontWeight: 800,
            lineHeight: 1.08,
            color: '#ffffff',
            textTransform: 'uppercase',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
            width: '100%',
          }}
        >
          {displayName}
        </div>
      </div>

      {/* Corpo da etiqueta */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: isCompact ? '0.35mm 1.0mm 0.55mm 1.0mm' : '0.45mm 1.25mm 0.7mm 1.25mm',
          boxSizing: 'border-box',
          minHeight: 0,
        }}
      >
        {/* Linha intermediária: Código interno + Preço */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '0.8mm',
            padding: isCompact ? '0.2mm 0' : '0.3mm 0',
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: isCompact ? '1.5mm' : '1.75mm',
              fontWeight: 700,
              color: '#262626',
              lineHeight: 1.05,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: isCompact ? '12.5mm' : '15.5mm',
            }}
          >
            {isCompact ? `Cód:${displayCode}` : `CÓD: ${displayCode}`}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'flex-end',
              color: '#000000',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 0.92,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: `${priceSizes.currencyMm}mm`,
                fontWeight: 800,
                marginRight: '0.4mm',
                color: '#171717',
              }}
            >
              R$
            </span>
            <span
              style={{
                fontSize: `${priceSizes.integerMm}mm`,
                fontWeight: 900,
                letterSpacing: '-0.03em',
              }}
            >
              {intPart}
            </span>
            <span
              style={{
                fontSize: `${priceSizes.centsMm}mm`,
                fontWeight: 900,
              }}
            >
              ,{decPart}
            </span>
          </div>
        </div>

        {/* Base: Código de barras com largura total para máxima legibilidade pelo leitor */}
        <BarcodeBlock rawBarcode={product.barcode} modelId={modelId} />
      </div>
    </div>
  );
};

interface ProductLabelsSheetPageProps {
  pageSlots: Array<LabelRenderEntry | null>;
  modelId: LabelModelId;
  pageIndex: number;
  totalPages: number;
  isPreview?: boolean;
  startPosition?: number;
}

export const ProductLabelsSheetPage: React.FC<ProductLabelsSheetPageProps> = ({
  pageSlots,
  modelId,
  pageIndex,
  totalPages,
  isPreview = false,
  startPosition = 1,
}) => {
  const spec = LABEL_MODELS[modelId];
  const cellPaddingMm = modelId === '60' ? 0.85 : 1.1;

  return (
    <div
      className="label-a4-page"
      style={{
        width: '210mm',
        height: '297mm',
        paddingTop: `${spec.marginTopMm}mm`,
        paddingBottom: `${spec.marginBottomMm}mm`,
        paddingLeft: `${spec.marginLeftMm}mm`,
        paddingRight: `${spec.marginRightMm}mm`,
        backgroundColor: '#ffffff',
        boxSizing: 'border-box',
        pageBreakAfter: pageIndex < totalPages - 1 ? 'always' : 'auto',
        breakAfter: pageIndex < totalPages - 1 ? 'page' : 'auto',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${spec.cols}, ${spec.labelWidthMm}mm)`,
          gridTemplateRows: `repeat(${spec.rows}, ${spec.labelHeightMm}mm)`,
          width: `${spec.cols * spec.labelWidthMm}mm`,
          height: `${spec.rows * spec.labelHeightMm}mm`,
          boxSizing: 'border-box',
        }}
      >
        {pageSlots.map((slot, idx) => {
          const row = Math.floor(idx / spec.cols);
          const col = idx % spec.cols;
          const isSkippedSlotOnFirstPage = pageIndex === 0 && idx < startPosition - 1;

          // Determina linhas de corte tracejadas sem duplicação entre etiquetas adjacentes:
          // Cada etiqueta preenchida exibe borda direita/inferior tracejada e borda superior/esquerda
          // quando está na extremidade ou quando a célula vizinha acima/à esquerda está vazia.
          const hasLabel = slot !== null;
          const topHasLabel = row > 0 && pageSlots[(row - 1) * spec.cols + col] !== null;
          const leftHasLabel = col > 0 && pageSlots[row * spec.cols + (col - 1)] !== null;

          const cutLine = '0.28mm dashed #555555';
          const previewEmptyLine = isPreview ? '0.2mm dotted #d4d4d4' : 'none';

          const borderTop = hasLabel ? (topHasLabel ? 'none' : cutLine) : previewEmptyLine;
          const borderLeft = hasLabel ? (leftHasLabel ? 'none' : cutLine) : previewEmptyLine;
          const borderRight = hasLabel ? cutLine : previewEmptyLine;
          const borderBottom = hasLabel ? cutLine : previewEmptyLine;

          return (
            <div
              key={idx}
              style={{
                width: `${spec.labelWidthMm}mm`,
                height: `${spec.labelHeightMm}mm`,
                boxSizing: 'border-box',
                padding: `${cellPaddingMm}mm`,
                borderTop,
                borderLeft,
                borderRight,
                borderBottom,
                backgroundColor: isPreview && isSkippedSlotOnFirstPage ? '#fafafa' : '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {slot ? (
                <SingleLabelCard entry={slot} modelId={modelId} />
              ) : isPreview && isSkippedSlotOnFirstPage ? (
                <span
                  style={{
                    fontSize: '2mm',
                    color: '#a3a3a3',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 600,
                    textAlign: 'center',
                    userSelect: 'none',
                  }}
                >
                  Em branco
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface ProductLabelsPrintDocumentProps {
  pages: Array<Array<LabelRenderEntry | null>>;
  modelId: LabelModelId;
}

/**
 * Documento de impressão limpo montado via portal em document.body.
 * Contém exclusivamente as folhas A4 com etiquetas e linhas de corte tracejadas.
 */
export const ProductLabelsPrintDocument: React.FC<ProductLabelsPrintDocumentProps> = ({
  pages,
  modelId,
}) => {
  return (
    <div id="printable-product-labels" aria-hidden="true">
      <style>{`
        #printable-product-labels {
          display: none;
        }
        @media print {
          body.printing-product-labels {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body.printing-product-labels #root {
            display: none !important;
          }
          body.printing-product-labels #printable-product-labels {
            display: block !important;
            visibility: visible !important;
            position: static !important;
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          body.printing-product-labels #printable-product-labels * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body.printing-product-labels .label-a4-page {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
          }
        }
      `}</style>
      {pages.map((pageSlots, idx) => (
        <ProductLabelsSheetPage
          key={idx}
          pageSlots={pageSlots}
          modelId={modelId}
          pageIndex={idx}
          totalPages={pages.length}
          isPreview={false}
        />
      ))}
    </div>
  );
};
