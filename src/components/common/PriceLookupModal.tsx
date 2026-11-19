import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Barcode,
  Boxes,
  CheckCircle2,
  Package,
  Search,
  Tag,
  Warehouse,
  X,
} from 'lucide-react';
import { Database } from '../../services/db';
import { StockEngine } from '../../services/stockEngine';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { Product } from '../../types';

export interface PriceLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  selectedLocationId?: string;
  selectedLocationName?: string;
  /**
   * Quando informado, restringe ou prioriza o escopo de produtos conforme a tela atual.
   * 'all_sellable' (padrão): todos os produtos ativos comercializáveis (exclui componentes sem preço).
   * 'revenda_only': usado caso deseje restringir apenas a revenda; por padrão o Busca Preço consulta todos os ativos comercializáveis.
   */
  productScope?: 'all_sellable' | 'revenda_only';
  /**
   * Callback opcional executado logo após fechar o modal para restaurar o foco no campo adequado da tela de venda.
   */
  onAfterClose?: () => void;
}

function normalizeSearchText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const PriceLookupModal: React.FC<PriceLookupModalProps> = ({
  isOpen,
  onClose,
  companyId,
  companyName,
  selectedLocationId,
  selectedLocationName,
  productScope = 'all_sellable',
  onAfterClose,
}) => {
  const [query, setQuery] = useState<string>('');
  const [dbState, setDbState] = useState(() => Database.getState());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDbState({ ...Database.getState() });
    const unsubscribe = Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
    return unsubscribe;
  }, [isOpen]);

  // Limpa pesquisa anterior ao abrir e foca automaticamente o campo para digitação ou leitor de código de barras
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
    return () => clearTimeout(focusTimer);
  }, [isOpen]);

  // Fecha com ESC (em fase de captura para não vazar para atalhos globais ou da tela de venda)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        if (onAfterClose) {
          setTimeout(onAfterClose, 30);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose, onAfterClose]);

  const handleCloseModal = () => {
    onClose();
    if (onAfterClose) {
      setTimeout(onAfterClose, 30);
    }
  };

  const stockControlConfig = useMemo(() => {
    const cfg = dbState.stockControlConfig;
    return {
      enableStockControl: cfg ? cfg.enableStockControl !== false : true,
      allowNegativeStock: !!cfg?.allowNegativeStock,
    };
  }, [dbState.stockControlConfig]);

  // Base de produtos ativos em memória (sem chamadas remotas ao Firebase)
  const searchableProducts = useMemo(() => {
    return (dbState.products || []).filter((p) => {
      if (p.status !== 'ativo') return false;
      if (productScope === 'revenda_only') {
        return p.productType === 'revenda';
      }
      if (p.productType === 'componente') {
        return StockEngine.getProductPriceForCompany(p, companyId) > 0;
      }
      return true;
    });
  }, [dbState.products, productScope, companyId]);

  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeSearchText(trimmedQuery);
  const queryDigits = trimmedQuery.replace(/\D/g, '');
  const isPureNumericDigits = /^\d+$/.test(trimmedQuery);

  const searchAnalysis = useMemo(() => {
    if (!trimmedQuery) {
      return {
        mode: 'empty' as const,
        results: [] as Array<{ product: Product; matchType: 'barcode' | 'code' | 'description' }>,
      };
    }

    const exactMatches: Array<{ product: Product; matchType: 'barcode' | 'code' }> = [];
    const exactSeenIds = new Set<string>();

    // A) Correspondência exata por código de barras (imediata, independente da quantidade de caracteres)
    for (const p of searchableProducts) {
      const barcodeRaw = (p.barcode || '').trim();
      if (!barcodeRaw) continue;
      const barcodeNorm = normalizeSearchText(barcodeRaw);
      const barcodeDigits = barcodeRaw.replace(/\D/g, '');

      const isExactBarcode =
        barcodeNorm === normalizedQuery ||
        (isPureNumericDigits && queryDigits.length >= 4 && barcodeDigits === queryDigits);

      if (isExactBarcode && !exactSeenIds.has(p.id)) {
        exactSeenIds.add(p.id);
        exactMatches.push({ product: p, matchType: 'barcode' });
      }
    }

    // B) Correspondência exata por código interno (imediata, independente da quantidade de caracteres)
    for (const p of searchableProducts) {
      if (exactSeenIds.has(p.id)) continue;
      const codeNorm = normalizeSearchText(p.code || '');
      if (codeNorm && codeNorm === normalizedQuery) {
        exactSeenIds.add(p.id);
        exactMatches.push({ product: p, matchType: 'code' });
      }
    }

    // Com menos de 3 caracteres: só retorna correspondências exatas de código interno ou código de barras
    if (trimmedQuery.length < 3) {
      if (exactMatches.length > 0) {
        return {
          mode: 'exact_short' as const,
          results: exactMatches,
        };
      }
      return {
        mode: 'need_more_chars' as const,
        results: [] as Array<{ product: Product; matchType: 'barcode' | 'code' | 'description' }>,
      };
    }

    // C) A partir de 3 caracteres: inclui correspondências parciais em descrição, código ou barras
    const partialStartsWith: Array<{ product: Product; matchType: 'description' | 'code' | 'barcode' }> = [];
    const partialContains: Array<{ product: Product; matchType: 'description' | 'code' | 'barcode' }> = [];

    for (const p of searchableProducts) {
      if (exactSeenIds.has(p.id)) continue;

      const descNorm = normalizeSearchText(p.description || '');
      const codeNorm = normalizeSearchText(p.code || '');
      const barcodeNorm = normalizeSearchText(p.barcode || '');

      const matchesDesc = descNorm.includes(normalizedQuery);
      const matchesCode = codeNorm.includes(normalizedQuery);
      const matchesBarcode = barcodeNorm.includes(normalizedQuery);

      if (!matchesDesc && !matchesCode && !matchesBarcode) continue;

      const matchType: 'description' | 'code' | 'barcode' = matchesBarcode
        ? 'barcode'
        : matchesCode
        ? 'code'
        : 'description';

      if (descNorm.startsWith(normalizedQuery) || codeNorm.startsWith(normalizedQuery)) {
        partialStartsWith.push({ product: p, matchType });
      } else {
        partialContains.push({ product: p, matchType });
      }
    }

    partialStartsWith.sort((a, b) => a.product.description.localeCompare(b.product.description, 'pt-BR'));
    partialContains.sort((a, b) => a.product.description.localeCompare(b.product.description, 'pt-BR'));

    const combined = [...exactMatches, ...partialStartsWith, ...partialContains];

    return {
      mode: combined.length > 0 ? ('results' as const) : ('no_results' as const),
      results: combined,
    };
  }, [searchableProducts, trimmedQuery, normalizedQuery, queryDigits, isPureNumericDigits]);

  if (!isOpen) return null;

  const handleClearQuery = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-slate-950/65 backdrop-blur-xs p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCloseModal();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="price-lookup-modal-title"
    >
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[86vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho */}
        <div className="px-4 sm:px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Tag size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="price-lookup-modal-title" className="text-base font-extrabold tracking-tight">
                  Busca Preço
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/25 text-blue-200 border border-blue-400/30">
                  Somente Consulta
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate mt-0.5">
                {companyName}
                {selectedLocationName ? ` • Depósito: ${selectedLocationName}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseModal}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Fechar Busca Preço [ESC]"
            aria-label="Fechar Busca Preço"
          >
            <X size={20} />
          </button>
        </div>

        {/* Barra de Pesquisa */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200 space-y-2 shrink-0">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // Impede envio de formulários pais e preserva foco para leituras consecutivas com leitor de código de barras
                  e.preventDefault();
                  e.stopPropagation();
                  if (trimmedQuery && searchAnalysis.results.length > 0) {
                    inputRef.current?.select();
                  }
                }
              }}
              placeholder="Digite o código, código de barras ou descrição do produto."
              className="w-full pl-10 pr-20 py-3 bg-white border-2 border-blue-300 focus:border-blue-600 rounded-xl text-sm sm:text-base font-semibold text-slate-900 placeholder-slate-400 focus:outline-hidden shadow-2xs transition-colors"
              autoFocus
            />

            {query && (
              <button
                type="button"
                onClick={handleClearQuery}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                title="Limpar pesquisa"
              >
                <X size={14} />
                <span>Limpar</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 px-0.5">
            <span className="flex items-center gap-1.5">
              <Barcode size={13} className="text-slate-400 shrink-0" />
              <span>Código interno ou código de barras: imediato • Descrição: mín. 3 caracteres</span>
            </span>
            {searchAnalysis.results.length > 0 && (
              <span className="font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                {searchAnalysis.results.length}{' '}
                {searchAnalysis.results.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
              </span>
            )}
          </div>
        </div>

        {/* Lista de Resultados */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-2.5 bg-white">
          {searchAnalysis.mode === 'empty' && (
            <div className="py-10 px-4 text-center space-y-2.5">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <Search size={26} />
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-800">
                Consulta Rápida de Preços & Estoque
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                Leia o código de barras com o leitor, informe o código interno do produto ou digite ao menos <strong>3 caracteres</strong> da descrição para consultar preço e estoque sem interromper a venda atual.
              </p>
            </div>
          )}

          {searchAnalysis.mode === 'need_more_chars' && (
            <div className="py-8 px-4 text-center space-y-2 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
              <Search size={24} className="mx-auto text-blue-500" />
              <p className="text-sm font-bold text-slate-700">
                Continue digitando para pesquisar por descrição ({trimmedQuery.length}/3)
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                A pesquisa por descrição inicia com 3 caracteres. Códigos internos e códigos de barras exatos aparecem imediatamente.
              </p>
            </div>
          )}

          {searchAnalysis.mode === 'no_results' && (
            <div className="py-10 px-4 text-center space-y-2.5 bg-slate-50/70 rounded-2xl border border-slate-200">
              <Package size={32} className="mx-auto text-slate-300" />
              <p className="text-sm sm:text-base font-bold text-slate-700">
                Nenhum produto encontrado para esta pesquisa.
              </p>
              <p className="text-xs text-slate-500">
                Verifique o código, código de barras ou termo digitado e tente novamente.
              </p>
            </div>
          )}

          {searchAnalysis.results.map(({ product, matchType }) => {
            const effectivePrice = StockEngine.getProductPriceForCompany(product, companyId);
            const hasCustomCompanyPrice = !!(
              product.companyPrices?.[companyId]?.salePrice &&
              product.companyPrices[companyId].salePrice > 0 &&
              product.companyPrices[companyId].salePrice !== product.salePrice
            );

            const companyStock = StockEngine.getCompanyProductStock(
              dbState.stockBalances,
              product.id,
              companyId,
              dbState.stockLocations,
              dbState.products
            );

            const locationStock = selectedLocationId
              ? StockEngine.getBalance(dbState.stockBalances, product.id, selectedLocationId, dbState.products)
              : null;
            const locationAvailable = locationStock
              ? (locationStock.quantity || 0) - (locationStock.reserved || 0)
              : null;

            // Quando há local selecionado na tela (ex: Comercial no Venda Mobile ou depósito no PDV/Pedido),
            // exibe o saldo do depósito selecionado caso seja o foco da operação ou compara com o total da empresa.
            const primaryAvailable =
              productScope === 'revenda_only' && locationAvailable !== null
                ? locationAvailable
                : companyStock.available;

            const isOutOfStock = primaryAvailable <= 0;
            const displayAvailable = Math.max(0, primaryAvailable);

            return (
              <div
                key={product.id}
                className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/30 transition-colors space-y-3"
              >
                {/* Linha Superior: Identificação e Badges */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                        {product.code}
                      </span>
                      <span className="text-[11px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        Unidade: {product.unit}
                      </span>
                      {matchType !== 'description' && (
                        <span className="text-[10px] font-extrabold uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                          {matchType === 'barcode' ? 'Código de Barras Exato' : 'Código Interno Exato'}
                        </span>
                      )}
                      {product.isMasterPack && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          <Boxes size={12} />
                          Embalagem Master ({product.masterPackUnits} un)
                        </span>
                      )}
                    </div>

                    <h3 className="text-base sm:text-[17px] font-extrabold text-slate-900 leading-snug break-words">
                      {product.description}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {product.barcode ? (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Barcode size={13} className="text-slate-400" />
                          EAN/GTIN: <strong className="text-slate-700">{product.barcode}</strong>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Sem código de barras cadastrado</span>
                      )}
                      {product.family && (
                        <span>
                          Família: <strong className="text-slate-600">{product.family}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Preço de Venda Vigente */}
                  <div className="sm:text-right bg-white sm:bg-transparent px-3 py-2 sm:p-0 rounded-xl border sm:border-0 border-emerald-200 shrink-0">
                    <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      Preço de Venda
                    </span>
                    <div className="text-xl sm:text-2xl font-black text-emerald-700 font-mono leading-tight">
                      {formatCurrency(effectivePrice)}
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500">
                      por {product.unit}
                      {hasCustomCompanyPrice && (
                        <span className="ml-1.5 text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                          Tabela da filial
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Linha Inferior: Estoque Disponível em Destaque */}
                <div
                  className={`rounded-xl px-3.5 py-2.5 border flex flex-wrap items-center justify-between gap-2 ${
                    isOutOfStock
                      ? 'bg-rose-50/90 border-rose-200'
                      : 'bg-emerald-50/80 border-emerald-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isOutOfStock ? (
                      <AlertCircle size={18} className="text-rose-600 shrink-0" />
                    ) : (
                      <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    )}
                    <div className="text-xs sm:text-sm">
                      <span className="font-bold text-slate-700">Estoque disponível: </span>
                      <span
                        className={`font-black font-mono text-sm sm:text-base ${
                          isOutOfStock ? 'text-rose-700' : 'text-emerald-800'
                        }`}
                      >
                        {formatQuantity(displayAvailable)} {product.unit}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {isOutOfStock && (
                      <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-extrabold uppercase tracking-wide shadow-2xs">
                        Sem estoque
                      </span>
                    )}

                    {selectedLocationName && locationAvailable !== null && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-white/90 px-2 py-0.5 rounded-lg border border-slate-200">
                        <Warehouse size={12} className="text-slate-400" />
                        {selectedLocationName}:{' '}
                        <strong className={locationAvailable <= 0 ? 'text-rose-600' : 'text-slate-800'}>
                          {formatQuantity(Math.max(0, locationAvailable))} {product.unit}
                        </strong>
                      </span>
                    )}

                    {!stockControlConfig.enableStockControl && (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">
                        Controle desativado
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-slate-500 font-medium">
            Consulta informativa — não altera itens, cliente ou valores da venda.
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {query && (
              <button
                type="button"
                onClick={handleClearQuery}
                className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Limpar Pesquisa
              </button>
            )}
            <button
              type="button"
              onClick={handleCloseModal}
              className="min-h-[40px] px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Fechar [ESC]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
