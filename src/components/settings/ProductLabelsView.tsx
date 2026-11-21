import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Tag,
  Printer,
  Search,
  Plus,
  Minus,
  Trash2,
  Eye,
  CheckSquare,
  Square,
  RotateCcw,
  Layers,
  FolderOpen,
  Package,
  Building2,
  ChevronLeft,
  ChevronRight,
  X,
  Grid3X3,
  AlertCircle,
  Check,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Database } from '../../services/db';
import { Product } from '../../types';
import { formatCurrency } from '../../services/pricingEngine';
import { toast } from '../../services/toast';
import { normalizeValidBarcode } from '../../utils/barcodeGenerator';
import {
  LABEL_MODELS,
  LabelModelId,
  LabelSelectionEntry,
  ProductLabelsPrintDocument,
  ProductLabelsSheetPage,
  buildLabelPages,
} from './ProductLabelsSheet';

type SelectionMode = 'individual' | 'grupo' | 'familia';

function normalizeSearchText(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const ProductLabelsView: React.FC = () => {
  const [dbState, setDbState] = useState(() => Database.getState());
  const currentCompany = Database.getCurrentCompany();

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  // Etapa 1: Modelo de impressão (30, 40 ou 60 etiquetas em A4 retrato)
  const [selectedModel, setSelectedModel] = useState<LabelModelId>('30');

  // Etapa 2: Modo de seleção de produtos
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('individual');
  const [includeInactive, setIncludeInactive] = useState<boolean>(false);

  // Modo A — Produto Individual
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeIndividualProductId, setActiveIndividualProductId] = useState<string | null>(null);
  const [individualQty, setIndividualQty] = useState<number>(1);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const individualQtyInputRef = useRef<HTMLInputElement | null>(null);
  const selectionSectionRef = useRef<HTMLDivElement | null>(null);

  // Modo B — Seleção por Grupo
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [groupCheckedIds, setGroupCheckedIds] = useState<Record<string, boolean>>({});
  const [groupQuantities, setGroupQuantities] = useState<Record<string, number>>({});
  const [groupBulkQty, setGroupBulkQty] = useState<number>(1);

  // Modo C — Seleção por Família
  const [selectedFamily, setSelectedFamily] = useState<string>('');
  const [familyCheckedIds, setFamilyCheckedIds] = useState<Record<string, boolean>>({});
  const [familyQuantities, setFamilyQuantities] = useState<Record<string, number>>({});
  const [familyBulkQty, setFamilyBulkQty] = useState<number>(1);

  // Etapa 3: Lista de produtos selecionados para geração
  const [selectedItems, setSelectedItems] = useState<LabelSelectionEntry[]>([]);

  // Etapa 4: Posição inicial na folha (1-indexed)
  const [startPosition, setStartPosition] = useState<number>(1);

  // Etapa 5: Pré-visualização fiel A4
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [previewPageIndex, setPreviewPageIndex] = useState<number>(0);
  const [previewShowAllPages, setPreviewShowAllPages] = useState<boolean>(false);
  const [previewZoom, setPreviewZoom] = useState<number>(0.78);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  const modelSpec = LABEL_MODELS[selectedModel];

  // Ajusta a posição inicial caso o usuário troque para um modelo com menos etiquetas por folha
  useEffect(() => {
    setStartPosition((prev) => Math.max(1, Math.min(modelSpec.perPage, prev)));
  }, [modelSpec.perPage]);

  // Catálogo elegível (respeita produtos reais cadastrados no sistema)
  const catalogProducts = useMemo(() => {
    const list = dbState.products || [];
    const filtered = includeInactive ? list : list.filter((p) => p.status !== 'inativo');
    return [...filtered].sort((a, b) => (a.description || '').localeCompare(b.description || '', 'pt-BR'));
  }, [dbState.products, includeInactive]);

  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of dbState.products || []) {
      map.set(p.id, p);
    }
    return map;
  }, [dbState.products]);

  // Lista real de Grupos cadastrados nos produtos
  const availableGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of catalogProducts) {
      const grp = (p.group || '').trim();
      if (!grp) continue;
      counts.set(grp, (counts.get(grp) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [catalogProducts]);

  // Lista real de Famílias cadastradas nos produtos
  const availableFamilies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of catalogProducts) {
      const fam = (p.family || '').trim();
      if (!fam) continue;
      counts.set(fam, (counts.get(fam) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [catalogProducts]);

  // Preço de venda atual do produto respeitando estritamente a empresa/filial ativa e regras do ERP
  const getCurrentSalePrice = (product: Product): number => {
    return Database.getProductPriceForCompany(product, currentCompany.id);
  };

  // Resultados da pesquisa individual (por código interno, parte da descrição ou código de barras)
  const individualSearchResults = useMemo(() => {
    const q = normalizeSearchText(searchQuery);
    if (!q) {
      return catalogProducts.slice(0, 30);
    }
    return catalogProducts
      .filter((p) => {
        const codeNorm = normalizeSearchText(p.code || '');
        const descNorm = normalizeSearchText(p.description || '');
        const barcodeNorm = normalizeSearchText(p.barcode || '');
        return codeNorm.includes(q) || descNorm.includes(q) || barcodeNorm.includes(q);
      })
      .slice(0, 50);
  }, [catalogProducts, searchQuery]);

  const activeIndividualProduct = useMemo(() => {
    if (!activeIndividualProductId) return null;
    return productById.get(activeIndividualProductId) || null;
  }, [activeIndividualProductId, productById]);

  // Produtos do Grupo selecionado
  const groupProducts = useMemo(() => {
    if (!selectedGroup) return [];
    return catalogProducts.filter((p) => (p.group || '').trim() === selectedGroup);
  }, [catalogProducts, selectedGroup]);

  // Produtos da Família selecionada
  const familyProducts = useMemo(() => {
    if (!selectedFamily) return [];
    return catalogProducts.filter((p) => (p.family || '').trim() === selectedFamily);
  }, [catalogProducts, selectedFamily]);

  // Ao trocar de grupo, inicializa checkboxes e quantidades
  const handleSelectGroupChange = (groupName: string) => {
    setSelectedGroup(groupName);
    const matching = catalogProducts.filter((p) => (p.group || '').trim() === groupName);
    const nextChecked: Record<string, boolean> = {};
    const nextQty: Record<string, number> = {};
    matching.forEach((p) => {
      nextChecked[p.id] = true;
      nextQty[p.id] = groupBulkQty;
    });
    setGroupCheckedIds(nextChecked);
    setGroupQuantities(nextQty);
  };

  // Ao trocar de família, inicializa checkboxes e quantidades
  const handleSelectFamilyChange = (familyName: string) => {
    setSelectedFamily(familyName);
    const matching = catalogProducts.filter((p) => (p.family || '').trim() === familyName);
    const nextChecked: Record<string, boolean> = {};
    const nextQty: Record<string, number> = {};
    matching.forEach((p) => {
      nextChecked[p.id] = true;
      nextQty[p.id] = familyBulkQty;
    });
    setFamilyCheckedIds(nextChecked);
    setFamilyQuantities(nextQty);
  };

  // Adiciona ou soma quantidades na lista de selecionados
  const addProductsToSelection = (entries: Array<{ productId: string; quantity: number }>) => {
    const validEntries = entries.filter((e) => e.quantity > 0 && productById.has(e.productId));
    if (validEntries.length === 0) {
      toast.warning('Selecione ao menos um produto com quantidade maior que zero.', 'Nenhum produto adicionado');
      return;
    }

    setSelectedItems((prev) => {
      const next = [...prev];
      for (const entry of validEntries) {
        const idx = next.findIndex((item) => item.productId === entry.productId);
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            quantity: Math.min(999, next[idx].quantity + entry.quantity),
          };
        } else {
          next.push({
            productId: entry.productId,
            quantity: Math.min(999, entry.quantity),
          });
        }
      }
      return next;
    });

    const totalAdded = validEntries.reduce((acc, item) => acc + item.quantity, 0);
    toast.success(
      `${validEntries.length} ${validEntries.length === 1 ? 'produto adicionado' : 'produtos adicionados'} (${totalAdded} ${totalAdded === 1 ? 'etiqueta' : 'etiquetas'}).`,
      'Seleção Atualizada'
    );
  };

  const handleAddIndividualProduct = () => {
    if (!activeIndividualProduct) {
      toast.warning('Selecione um produto na lista de pesquisa antes de adicionar.');
      return;
    }
    const safeQty = Math.max(1, Math.min(999, Math.floor(individualQty || 1)));
    addProductsToSelection([{ productId: activeIndividualProduct.id, quantity: safeQty }]);
    setIndividualQty(1);
    setActiveIndividualProductId(null);
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  const handleAddGroupProducts = () => {
    const toAdd = groupProducts
      .filter((p) => groupCheckedIds[p.id])
      .map((p) => ({
        productId: p.id,
        quantity: Math.max(1, Math.min(999, Math.floor(groupQuantities[p.id] || 1))),
      }));
    addProductsToSelection(toAdd);
  };

  const handleAddFamilyProducts = () => {
    const toAdd = familyProducts
      .filter((p) => familyCheckedIds[p.id])
      .map((p) => ({
        productId: p.id,
        quantity: Math.max(1, Math.min(999, Math.floor(familyQuantities[p.id] || 1))),
      }));
    addProductsToSelection(toAdd);
  };

  const handleUpdateSelectedQty = (productId: string, newQty: number) => {
    const safeQty = Math.max(1, Math.min(999, Math.floor(newQty || 1)));
    setSelectedItems((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, quantity: safeQty } : item))
    );
  };

  const handleRemoveSelectedItem = (productId: string) => {
    setSelectedItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleClearSelection = () => {
    if (selectedItems.length === 0) return;
    setSelectedItems([]);
    setPreviewPageIndex(0);
    toast.info('Lista de etiquetas selecionadas limpa.');
  };

  // Resolve itens selecionados com os dados e preços atuais da empresa ativa
  const resolvedSelectedItems = useMemo(() => {
    return selectedItems
      .map((entry) => {
        const product = productById.get(entry.productId);
        if (!product) return null;
        return {
          product,
          quantity: entry.quantity,
          salePrice: Database.getProductPriceForCompany(product, currentCompany.id),
          validBarcode: normalizeValidBarcode(product.barcode),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [selectedItems, productById, currentCompany.id]);

  const totalLabelsCount = useMemo(
    () => resolvedSelectedItems.reduce((sum, item) => sum + item.quantity, 0),
    [resolvedSelectedItems]
  );

  // Páginas A4 geradas em tempo real conforme modelo, produtos e posição inicial
  const labelPages = useMemo(() => {
    return buildLabelPages(
      resolvedSelectedItems.map((i) => ({
        product: i.product,
        salePrice: i.salePrice,
        quantity: i.quantity,
      })),
      selectedModel,
      startPosition
    );
  }, [resolvedSelectedItems, selectedModel, startPosition]);

  // Mantém previewPageIndex dentro dos limites
  useEffect(() => {
    if (labelPages.length === 0) {
      setPreviewPageIndex(0);
    } else if (previewPageIndex >= labelPages.length) {
      setPreviewPageIndex(labelPages.length - 1);
    }
  }, [labelPages.length, previewPageIndex]);

  // Calcula zoom automático confortável ao abrir a pré-visualização conforme largura da tela
  const computeFitZoom = () => {
    if (typeof window === 'undefined') return 0.75;
    const containerWidth = previewContainerRef.current?.clientWidth || window.innerWidth - 48;
    // 210mm ≈ 793.7px em 96dpi
    const a4WidthPx = 794;
    const available = Math.max(280, containerWidth - 40);
    const fit = Math.min(1.05, Math.max(0.36, available / a4WidthPx));
    return Number(fit.toFixed(2));
  };

  const handleOpenPreview = () => {
    if (totalLabelsCount === 0) {
      toast.warning('Adicione ao menos um produto antes de pré-visualizar as etiquetas.');
      return;
    }
    setPreviewPageIndex(0);
    setIsPreviewOpen(true);
    setTimeout(() => {
      setPreviewZoom(computeFitZoom());
    }, 30);
  };

  // Executa impressão A4 Retrato limpa via portal dedicado sem interferir nas demais telas de impressão
  const handlePrintLabels = () => {
    if (totalLabelsCount === 0 || labelPages.length === 0) {
      toast.warning('Selecione ao menos um produto para imprimir as etiquetas.');
      return;
    }

    const styleId = 'erp-product-labels-page-style';
    let pageStyleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!pageStyleEl) {
      pageStyleEl = document.createElement('style');
      pageStyleEl.id = styleId;
      document.head.appendChild(pageStyleEl);
    }
    pageStyleEl.textContent = `@page { size: A4 portrait; margin: 0; }`;

    document.body.classList.add('printing-product-labels');

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      document.body.classList.remove('printing-product-labels');
      const el = document.getElementById(styleId);
      if (el) el.remove();
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        // Fallback de segurança caso algum navegador móvel não dispare afterprint
        setTimeout(() => {
          cleanup();
        }, 1500);
      });
    });
  };

  const scrollToSelection = () => {
    selectionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      if (selectionMode === 'individual') {
        searchInputRef.current?.focus();
      }
    }, 250);
  };

  const groupCheckedCount = useMemo(
    () => groupProducts.filter((p) => groupCheckedIds[p.id]).length,
    [groupProducts, groupCheckedIds]
  );

  const familyCheckedCount = useMemo(
    () => familyProducts.filter((p) => familyCheckedIds[p.id]).length,
    [familyProducts, familyCheckedIds]
  );

  const slotsOccupiedOnFirstPage = Math.max(
    0,
    Math.min(modelSpec.perPage - (startPosition - 1), totalLabelsCount)
  );

  return (
    <div className="space-y-5">
      {/* CABEÇALHO DA FERRAMENTA E AÇÕES PRINCIPAIS */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Tag size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                Etiquetas de Produtos
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                  <Building2 size={12} className="text-slate-500" />
                  {currentCompany.tradeName || currentCompany.name}
                  <span className="text-slate-400">
                    ({currentCompany.type === 'matriz' ? 'Matriz' : 'Filial'})
                  </span>
                </span>
                <span aria-hidden="true">·</span>
                <span>Folha A4 Retrato (210 × 297 mm)</span>
                <span aria-hidden="true">·</span>
                <span>Preto, branco e tons de cinza</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={scrollToSelection}
            className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Search size={14} />
            <span>Selecionar Produtos</span>
          </button>
          <button
            type="button"
            onClick={handleClearSelection}
            disabled={selectedItems.length === 0}
            className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 disabled:opacity-45 disabled:cursor-not-allowed text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw size={14} />
            <span>Limpar Seleção</span>
          </button>
          <button
            type="button"
            onClick={handleOpenPreview}
            disabled={totalLabelsCount === 0}
            className="px-3.5 py-2 rounded-lg border border-slate-800 bg-white hover:bg-slate-100 disabled:opacity-45 disabled:cursor-not-allowed text-slate-900 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Eye size={14} />
            <span>Pré-visualizar</span>
          </button>
          <button
            type="button"
            onClick={handlePrintLabels}
            disabled={totalLabelsCount === 0}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Printer size={14} />
            <span>Imprimir Etiquetas</span>
          </button>
        </div>
      </div>

      {/* ETAPA 1 — SELECIONAR MODELO DE ETIQUETA */}
      <section className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">1. Selecionar Modelo de Etiqueta (A4 Retrato)</h3>
            <p className="text-xs text-slate-500">
              Escolha a densidade por folha conforme o tamanho desejado para gôndola ou produto.
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            Ativo: {modelSpec.code} ({modelSpec.cols}×{modelSpec.rows})
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['30', '40', '60'] as LabelModelId[]).map((modelKey) => {
            const spec = LABEL_MODELS[modelKey];
            const isActive = selectedModel === modelKey;

            return (
              <button
                key={modelKey}
                type="button"
                onClick={() => setSelectedModel(modelKey)}
                className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                  isActive
                    ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                    : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50/50'
                }`}
              >
                {/* Mini diagrama proporcional da folha A4 retrato */}
                <div
                  className={`w-11 h-16 rounded border shrink-0 p-1 flex flex-col justify-between bg-white ${
                    isActive ? 'border-slate-900' : 'border-slate-300'
                  }`}
                  aria-hidden="true"
                >
                  <div
                    className="w-full h-full grid gap-[1px]"
                    style={{
                      gridTemplateColumns: `repeat(${spec.cols}, 1fr)`,
                      gridTemplateRows: `repeat(${spec.rows}, 1fr)`,
                    }}
                  >
                    {Array.from({ length: spec.perPage }).map((_, i) => (
                      <div
                        key={i}
                        className={isActive ? 'bg-slate-800/75 rounded-[0.5px]' : 'bg-slate-300 rounded-[0.5px]'}
                      />
                    ))}
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-500 tracking-wide">
                      {spec.code}
                    </span>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-900">
                        <Check size={13} />
                        Selecionado
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-slate-900">{spec.title}</div>
                  <div className="text-xs font-mono text-slate-600 tabular-nums">
                    {spec.subtitle}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed pt-0.5">
                    {spec.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* GRID PRINCIPAL: SELEÇÃO + LISTA (ESQUERDA) E POSICIONAMENTO NA FOLHA (DIREITA) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* COLUNA ESQUERDA (ETAPAS 2 e 3) */}
        <div className="xl:col-span-7 space-y-5 min-w-0">
          {/* ETAPA 2 — SELECIONAR PRODUTOS */}
          <section
            ref={selectionSectionRef}
            className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">2. Selecionar Produtos</h3>
                <p className="text-xs text-slate-500">
                  Localize itens individualmente ou carregue em lote por grupo ou família cadastrada.
                </p>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-800"
                />
                <span>Exibir inativos</span>
              </label>
            </div>

            {/* Abas dos 3 modos de seleção */}
            <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setSelectionMode('individual')}
                className={`flex-1 min-w-[130px] px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  selectionMode === 'individual'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Package size={14} />
                <span>Produto Individual</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectionMode('grupo')}
                className={`flex-1 min-w-[130px] px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  selectionMode === 'grupo'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FolderOpen size={14} />
                <span>Por Grupo</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectionMode('familia')}
                className={`flex-1 min-w-[130px] px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  selectionMode === 'familia'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers size={14} />
                <span>Por Família</span>
              </button>
            </div>

            {/* MODO A: PRODUTO INDIVIDUAL */}
            {selectionMode === 'individual' && (
              <div className="space-y-3.5">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar por código interno, parte da descrição ou código de barras..."
                    className="w-full pl-9 pr-9 py-2.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Limpar busca"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Produto escolhido + definição de quantidade */}
                {activeIndividualProduct && (
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {activeIndividualProduct.description}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-600 font-mono tabular-nums">
                        <span>Cód: {activeIndividualProduct.code}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {normalizeValidBarcode(activeIndividualProduct.barcode)
                            ? `EAN/Barras: ${normalizeValidBarcode(activeIndividualProduct.barcode)}`
                            : 'Sem código de barras'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-bold text-slate-900">
                          {formatCurrency(getCurrentSalePrice(activeIndividualProduct))}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                        Qtd:
                      </label>
                      <input
                        ref={individualQtyInputRef}
                        type="number"
                        min={1}
                        max={999}
                        value={individualQty}
                        onChange={(e) => setIndividualQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddIndividualProduct();
                          }
                        }}
                        className="w-20 px-2.5 py-1.5 text-sm font-mono font-bold text-center border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:border-slate-900 tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={handleAddIndividualProduct}
                        className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Plus size={14} />
                        <span>Adicionar Produtos</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista de resultados da busca */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {catalogProducts.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        Nenhum produto cadastrado no sistema. Cadastre produtos em Cadastros → Produtos & Insumos.
                      </div>
                    ) : individualSearchResults.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        Nenhum produto encontrado para &ldquo;{searchQuery}&rdquo;.
                      </div>
                    ) : (
                      individualSearchResults.map((prod) => {
                        const isPicked = activeIndividualProductId === prod.id;
                        const price = getCurrentSalePrice(prod);
                        const validBarcode = normalizeValidBarcode(prod.barcode);
                        const hasBranchOverride =
                          currentCompany.type !== 'matriz' &&
                          Boolean(prod.companyPrices?.[currentCompany.id]?.salePrice);

                        return (
                          <div
                            key={prod.id}
                            onClick={() => {
                              setActiveIndividualProductId(prod.id);
                              setIndividualQty(1);
                              setTimeout(() => individualQtyInputRef.current?.select(), 20);
                            }}
                            className={`px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                              isPicked ? 'bg-slate-100' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                {prod.description}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 mt-0.5">
                                <span className="font-mono font-semibold text-slate-700">
                                  Cód: {prod.code}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">
                                  {validBarcode ? validBarcode : 'Sem código de barras'}
                                </span>
                                {(prod.family || prod.group) && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>
                                      {[prod.family, prod.group].filter(Boolean).join(' / ')}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <div className="text-xs font-bold font-mono text-slate-900 tabular-nums">
                                  {formatCurrency(price)}
                                </div>
                                {hasBranchOverride && (
                                  <div className="text-[10px] text-slate-500">Preço filial</div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addProductsToSelection([{ productId: prod.id, quantity: 1 }]);
                                }}
                                title="Adicionar 1 etiqueta rapidamente"
                                className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-900 hover:text-white hover:border-slate-900 text-slate-700 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                              >
                                + 1
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* MODO B: SELEÇÃO POR GRUPO */}
            {selectionMode === 'grupo' && (
              <div className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-7">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Grupo de Produtos Cadastrado
                    </label>
                    <select
                      value={selectedGroup}
                      onChange={(e) => handleSelectGroupChange(e.target.value)}
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-slate-900 cursor-pointer"
                    >
                      <option value="">Selecione um grupo...</option>
                      {availableGroups.map((g) => (
                        <option key={g.name} value={g.name}>
                          {g.name} ({g.count} {g.count === 1 ? 'produto' : 'produtos'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-5 flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Qtd padrão
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={groupBulkQty}
                        onChange={(e) => setGroupBulkQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full px-2.5 py-2 text-xs sm:text-sm font-mono font-bold text-center border border-slate-300 rounded-lg tabular-nums"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={groupProducts.length === 0}
                      onClick={() => {
                        const updated: Record<string, number> = {};
                        groupProducts.forEach((p) => {
                          updated[p.id] = groupBulkQty;
                        });
                        setGroupQuantities(updated);
                      }}
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-45 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                    >
                      Aplicar a todos
                    </button>
                  </div>
                </div>

                {selectedGroup && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const all: Record<string, boolean> = {};
                            groupProducts.forEach((p) => {
                              all[p.id] = true;
                            });
                            setGroupCheckedIds(all);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                        >
                          <CheckSquare size={13} />
                          <span>Marcar todos</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setGroupCheckedIds({})}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                        >
                          <Square size={13} />
                          <span>Desmarcar todos</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 tabular-nums">
                          {groupCheckedCount} de {groupProducts.length} marcados
                        </span>
                        <button
                          type="button"
                          disabled={groupCheckedCount === 0}
                          onClick={handleAddGroupProducts}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-45 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Plus size={14} />
                          <span>Adicionar Produtos</span>
                        </button>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                        {groupProducts.map((prod) => {
                          const checked = Boolean(groupCheckedIds[prod.id]);
                          const qty = groupQuantities[prod.id] ?? 1;
                          return (
                            <div
                              key={prod.id}
                              className={`px-3 py-2 flex items-center justify-between gap-3 ${
                                checked ? 'bg-slate-50/80' : 'bg-white'
                              }`}
                            >
                              <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setGroupCheckedIds((prev) => ({
                                      ...prev,
                                      [prod.id]: e.target.checked,
                                    }))
                                  }
                                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-800 shrink-0"
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-slate-900 truncate">
                                    {prod.description}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                                    Cód: {prod.code} · {formatCurrency(getCurrentSalePrice(prod))}
                                  </div>
                                </div>
                              </label>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[11px] text-slate-500">Qtd:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={999}
                                  value={qty}
                                  onChange={(e) =>
                                    setGroupQuantities((prev) => ({
                                      ...prev,
                                      [prod.id]: Math.max(1, parseInt(e.target.value, 10) || 1),
                                    }))
                                  }
                                  className="w-16 px-2 py-1 text-xs font-mono font-bold text-center border border-slate-300 rounded-md bg-white tabular-nums"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {!selectedGroup && availableGroups.length === 0 && (
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500 text-center">
                    Nenhum grupo encontrado nos produtos cadastrados.
                  </div>
                )}
              </div>
            )}

            {/* MODO C: SELEÇÃO POR FAMÍLIA */}
            {selectionMode === 'familia' && (
              <div className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-7">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Família de Produtos Cadastrada
                    </label>
                    <select
                      value={selectedFamily}
                      onChange={(e) => handleSelectFamilyChange(e.target.value)}
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-slate-900 cursor-pointer"
                    >
                      <option value="">Selecione uma família...</option>
                      {availableFamilies.map((f) => (
                        <option key={f.name} value={f.name}>
                          {f.name} ({f.count} {f.count === 1 ? 'produto' : 'produtos'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-5 flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Qtd padrão
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={familyBulkQty}
                        onChange={(e) => setFamilyBulkQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full px-2.5 py-2 text-xs sm:text-sm font-mono font-bold text-center border border-slate-300 rounded-lg tabular-nums"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={familyProducts.length === 0}
                      onClick={() => {
                        const updated: Record<string, number> = {};
                        familyProducts.forEach((p) => {
                          updated[p.id] = familyBulkQty;
                        });
                        setFamilyQuantities(updated);
                      }}
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-45 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                    >
                      Aplicar a todos
                    </button>
                  </div>
                </div>

                {selectedFamily && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const all: Record<string, boolean> = {};
                            familyProducts.forEach((p) => {
                              all[p.id] = true;
                            });
                            setFamilyCheckedIds(all);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                        >
                          <CheckSquare size={13} />
                          <span>Marcar todos</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFamilyCheckedIds({})}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                        >
                          <Square size={13} />
                          <span>Desmarcar todos</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 tabular-nums">
                          {familyCheckedCount} de {familyProducts.length} marcados
                        </span>
                        <button
                          type="button"
                          disabled={familyCheckedCount === 0}
                          onClick={handleAddFamilyProducts}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-45 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Plus size={14} />
                          <span>Adicionar Produtos</span>
                        </button>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                        {familyProducts.map((prod) => {
                          const checked = Boolean(familyCheckedIds[prod.id]);
                          const qty = familyQuantities[prod.id] ?? 1;
                          return (
                            <div
                              key={prod.id}
                              className={`px-3 py-2 flex items-center justify-between gap-3 ${
                                checked ? 'bg-slate-50/80' : 'bg-white'
                              }`}
                            >
                              <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setFamilyCheckedIds((prev) => ({
                                      ...prev,
                                      [prod.id]: e.target.checked,
                                    }))
                                  }
                                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-800 shrink-0"
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-slate-900 truncate">
                                    {prod.description}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                                    Cód: {prod.code} · {formatCurrency(getCurrentSalePrice(prod))}
                                  </div>
                                </div>
                              </label>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[11px] text-slate-500">Qtd:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={999}
                                  value={qty}
                                  onChange={(e) =>
                                    setFamilyQuantities((prev) => ({
                                      ...prev,
                                      [prod.id]: Math.max(1, parseInt(e.target.value, 10) || 1),
                                    }))
                                  }
                                  className="w-16 px-2 py-1 text-xs font-mono font-bold text-center border border-slate-300 rounded-md bg-white tabular-nums"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {!selectedFamily && availableFamilies.length === 0 && (
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500 text-center">
                    Nenhuma família encontrada nos produtos cadastrados.
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ETAPA 3 — LISTA DE PRODUTOS SELECIONADOS E QUANTIDADES */}
          <section className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  3. Produtos Selecionados e Quantidades
                </h3>
                <p className="text-xs text-slate-500">
                  Edite as quantidades diretamente na tabela. Os preços refletem a empresa ativa ({currentCompany.tradeName || currentCompany.name}).
                </p>
              </div>
              {resolvedSelectedItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Limpar Seleção</span>
                </button>
              )}
            </div>

            {resolvedSelectedItems.length === 0 ? (
              <div className="py-10 px-4 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50 space-y-2">
                <Tag size={24} className="mx-auto text-slate-400" />
                <p className="text-xs font-semibold text-slate-700">
                  Nenhum produto selecionado para gerar etiquetas
                </p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Use a seção acima para pesquisar um produto individual ou carregar itens por grupo ou família.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2.5 px-3">Produto</th>
                        <th className="py-2.5 px-2.5 whitespace-nowrap">Código</th>
                        <th className="py-2.5 px-2.5 whitespace-nowrap">Código de Barras</th>
                        <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Preço</th>
                        <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Quantidade</th>
                        <th className="py-2.5 px-2.5 text-center w-10">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {resolvedSelectedItems.map(({ product, salePrice, quantity, validBarcode }) => (
                        <tr key={product.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-semibold text-slate-900 max-w-[220px]">
                            <div className="truncate" title={product.description}>
                              {product.description}
                            </div>
                          </td>
                          <td className="py-2.5 px-2.5 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                            {product.code}
                          </td>
                          <td className="py-2.5 px-2.5 font-mono text-slate-600 whitespace-nowrap tabular-nums">
                            {validBarcode ? (
                              validBarcode
                            ) : (
                              <span className="text-slate-400 italic font-sans">Sem código de barras</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap tabular-nums">
                            {formatCurrency(salePrice)}
                          </td>
                          <td className="py-2.5 px-2.5">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleUpdateSelectedQty(product.id, quantity - 1)}
                                disabled={quantity <= 1}
                                aria-label="Diminuir quantidade"
                                className="w-6 h-6 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center text-slate-700 cursor-pointer"
                              >
                                <Minus size={11} />
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={999}
                                value={quantity}
                                onChange={(e) =>
                                  handleUpdateSelectedQty(product.id, parseInt(e.target.value, 10) || 1)
                                }
                                className="w-14 py-1 text-center font-mono font-bold text-slate-900 border border-slate-300 rounded bg-white tabular-nums"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateSelectedQty(product.id, quantity + 1)}
                                aria-label="Aumentar quantidade"
                                className="w-6 h-6 rounded border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer"
                              >
                                <Plus size={11} />
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveSelectedItem(product.id)}
                              title="Remover produto"
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totais consolidados */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 tabular-nums">
                    <span>
                      Itens distintos: <strong className="text-slate-900">{resolvedSelectedItems.length}</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Total: <strong className="text-slate-900">{totalLabelsCount} {totalLabelsCount === 1 ? 'etiqueta' : 'etiquetas'}</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Folhas A4 geradas: <strong className="text-slate-900">{labelPages.length}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleOpenPreview}
                      className="px-3.5 py-2 rounded-lg border border-slate-800 bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Eye size={14} />
                      <span>Pré-visualizar</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintLabels}
                      className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Printer size={14} />
                      <span>Imprimir Etiquetas</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        {/* COLUNA DIREITA (ETAPA 4 — POSICIONAMENTO NA FOLHA) */}
        <div className="xl:col-span-5 space-y-5 min-w-0">
          <section className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 space-y-4">
            <div className="pb-2.5 border-b border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Grid3X3 size={15} className="text-slate-700" />
                  <span>4. Posição Inicial na Folha</span>
                </h3>
                {startPosition > 1 && (
                  <button
                    type="button"
                    onClick={() => setStartPosition(1)}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
                  >
                    Voltar para posição 1
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Clique na etiqueta onde a impressão deve começar para reaproveitar folhas parcialmente utilizadas.
              </p>
            </div>

            {/* Controle numérico sincronizado com o grid visual */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                  Posição inicial: etiqueta
                </label>
                <input
                  type="number"
                  min={1}
                  max={modelSpec.perPage}
                  value={startPosition}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (Number.isFinite(val)) {
                      setStartPosition(Math.max(1, Math.min(modelSpec.perPage, val)));
                    }
                  }}
                  className="w-16 px-2 py-1 text-xs font-mono font-bold text-center border border-slate-300 rounded-md bg-white tabular-nums"
                />
              </div>

              <div className="text-[11px] text-slate-600 tabular-nums">
                {startPosition > 1
                  ? `${startPosition - 1} ${startPosition - 1 === 1 ? 'posição inicial em branco' : 'posições iniciais em branco'}`
                  : 'Início no topo da folha'}
              </div>
            </div>

            {/* Grid visual numerado da folha A4 retrato */}
            <div className="bg-slate-100 p-3 sm:p-4 rounded-xl border border-slate-200 flex flex-col items-center">
              <div className="w-full max-w-[330px] aspect-[210/297] bg-white border border-slate-300 shadow-xs p-2.5 flex flex-col">
                <div
                  className="flex-1 grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${modelSpec.cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${modelSpec.rows}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: modelSpec.perPage }).map((_, idx) => {
                    const posNumber = idx + 1;
                    const isSkipped = posNumber < startPosition;
                    const isStart = posNumber === startPosition;
                    const isOccupied =
                      totalLabelsCount > 0 &&
                      posNumber >= startPosition &&
                      posNumber < startPosition + slotsOccupiedOnFirstPage;

                    return (
                      <button
                        key={posNumber}
                        type="button"
                        onClick={() => setStartPosition(posNumber)}
                        title={`Iniciar impressão na etiqueta ${posNumber}`}
                        className={`rounded-[3px] border text-[10px] font-mono font-bold transition-colors flex items-center justify-center cursor-pointer tabular-nums ${
                          isStart
                            ? 'bg-slate-900 text-white border-slate-900 ring-1 ring-slate-900'
                            : isOccupied
                            ? 'bg-slate-200 text-slate-900 border-slate-500 border-dashed'
                            : isSkipped
                            ? 'bg-slate-100/80 text-slate-400 border-slate-200 line-through'
                            : 'bg-white text-slate-600 border-slate-300 hover:border-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        {posNumber}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Legenda limpa sem pills */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[2px] bg-slate-900 inline-block" />
                  Início ({startPosition})
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[2px] bg-slate-200 border border-dashed border-slate-500 inline-block" />
                  Impressas ({slotsOccupiedOnFirstPage})
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[2px] bg-slate-100 border border-slate-300 inline-block" />
                  Em branco ({startPosition - 1})
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
              <AlertCircle size={14} className="text-slate-400 shrink-0 mt-0.5" />
              <span>
                A numeração acima serve apenas para escolher a posição inicial e{' '}
                <strong className="text-slate-700">não será impressa</strong> na folha final.
                {labelPages.length > 1 && (
                  <>
                    {' '}
                    As etiquetas excedentes continuarão automaticamente na folha 2 até a folha{' '}
                    <strong className="text-slate-700">{labelPages.length}</strong>.
                  </>
                )}
              </span>
            </div>

            {/* Resumo rápido e botões de pré-visualizar / imprimir */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleOpenPreview}
                disabled={totalLabelsCount === 0}
                className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-800 bg-white hover:bg-slate-100 disabled:opacity-45 disabled:cursor-not-allowed text-slate-900 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Eye size={14} />
                <span>5. Pré-visualizar ({labelPages.length} {labelPages.length === 1 ? 'folha' : 'folhas'})</span>
              </button>
              <button
                type="button"
                onClick={handlePrintLabels}
                disabled={totalLabelsCount === 0}
                className="flex-1 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Printer size={14} />
                <span>6. Imprimir Etiquetas</span>
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* ETAPA 5 — MODAL DE PRÉ-VISUALIZAÇÃO FIEL EM A4 RETRATO */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex flex-col">
          {/* Barra superior da pré-visualização */}
          <div className="bg-slate-900 text-white px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <Eye size={18} className="text-slate-300 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate">
                  Pré-visualização A4 Retrato — {modelSpec.code} ({modelSpec.title})
                </h3>
                <div className="text-[11px] text-slate-400 tabular-nums">
                  {totalLabelsCount} {totalLabelsCount === 1 ? 'etiqueta' : 'etiquetas'} · Posição inicial: {startPosition} · {labelPages.length}{' '}
                  {labelPages.length === 1 ? 'página' : 'páginas'} · {currentCompany.tradeName || currentCompany.name}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Controle de zoom */}
              <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewZoom((z) => Math.max(0.35, Number((z - 0.1).toFixed(2))))}
                  aria-label="Diminuir zoom"
                  className="p-1.5 text-slate-300 hover:text-white cursor-pointer"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(computeFitZoom())}
                  className="px-2 text-[11px] font-mono text-slate-200 hover:text-white cursor-pointer tabular-nums"
                  title="Ajustar folha à tela"
                >
                  {Math.round(previewZoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
                  aria-label="Aumentar zoom"
                  className="p-1.5 text-slate-300 hover:text-white cursor-pointer"
                >
                  <ZoomIn size={14} />
                </button>
              </div>

              {/* Paginação quando houver mais de uma folha */}
              {labelPages.length > 1 && (
                <div className="flex items-center gap-1 bg-slate-800 rounded-lg border border-slate-700 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewShowAllPages((v) => !v)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                      previewShowAllPages ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {previewShowAllPages ? 'Ver uma por vez' : 'Ver todas'}
                  </button>
                  {!previewShowAllPages && (
                    <>
                      <button
                        type="button"
                        disabled={previewPageIndex <= 0}
                        onClick={() => setPreviewPageIndex((p) => Math.max(0, p - 1))}
                        aria-label="Página anterior"
                        className="p-1 text-slate-300 hover:text-white disabled:opacity-35 cursor-pointer"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="px-1.5 text-[11px] font-mono tabular-nums text-slate-200">
                        {previewPageIndex + 1}/{labelPages.length}
                      </span>
                      <button
                        type="button"
                        disabled={previewPageIndex >= labelPages.length - 1}
                        onClick={() => setPreviewPageIndex((p) => Math.min(labelPages.length - 1, p + 1))}
                        aria-label="Próxima página"
                        className="p-1 text-slate-300 hover:text-white disabled:opacity-35 cursor-pointer"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handlePrintLabels}
                className="px-4 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Printer size={14} />
                <span>Imprimir Etiquetas</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                aria-label="Fechar pré-visualização"
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Palco de visualização das folhas A4 */}
          <div
            ref={previewContainerRef}
            className="flex-1 overflow-auto bg-slate-200/95 p-4 sm:p-6 flex flex-col items-center gap-6"
          >
            {(previewShowAllPages ? labelPages : labelPages.slice(previewPageIndex, previewPageIndex + 1)).map(
              (pageSlots, idx) => {
                const actualPageIdx = previewShowAllPages ? idx : previewPageIndex;
                return (
                  <div key={actualPageIdx} className="flex flex-col items-center gap-2 shrink-0">
                    <div className="text-xs font-semibold text-slate-600 tabular-nums">
                      Folha {actualPageIdx + 1} de {labelPages.length} — A4 Retrato (210 × 297 mm)
                    </div>
                    {/* Wrapper com dimensão escalada exata para não criar scroll fantasma */}
                    <div
                      style={{
                        width: `calc(210mm * ${previewZoom})`,
                        height: `calc(297mm * ${previewZoom})`,
                        position: 'relative',
                      }}
                      className="shadow-xl ring-1 ring-slate-400/60 bg-white overflow-hidden"
                    >
                      <div
                        style={{
                          transform: `scale(${previewZoom})`,
                          transformOrigin: 'top left',
                          width: '210mm',
                          height: '297mm',
                        }}
                      >
                        <ProductLabelsSheetPage
                          pageSlots={pageSlots}
                          modelId={selectedModel}
                          pageIndex={actualPageIdx}
                          totalPages={labelPages.length}
                          isPreview={true}
                          startPosition={startPosition}
                        />
                      </div>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}

      {/* DOCUMENTO DE IMPRESSÃO LIMPO VIA PORTAL (APENAS ETIQUETAS + LINHAS DE CORTE) */}
      {typeof document !== 'undefined' &&
        labelPages.length > 0 &&
        createPortal(
          <ProductLabelsPrintDocument pages={labelPages} modelId={selectedModel} />,
          document.body
        )}
    </div>
  );
};
