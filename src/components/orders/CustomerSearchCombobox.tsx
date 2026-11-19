import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Check, User, ChevronDown, UserPlus, MapPin, Truck, ShoppingBag, History, Info } from 'lucide-react';
import { Customer } from '../../types';
import { formatCurrency } from '../../services/pricingEngine';
import { Database } from '../../services/db';

interface CustomerSearchComboboxProps {
  customers: Customer[];
  selectedCustomerId: string;
  onSelectCustomer: (customerId: string) => void;
  onOpenNewCustomerModal?: () => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  showInlineDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
  largeDropdown?: boolean;
  allowAnonymous?: boolean;
  anonymousLabel?: string;
  customInputRef?: React.RefObject<HTMLInputElement | null> | React.MutableRefObject<HTMLInputElement | null>;
}

export const CustomerSearchCombobox: React.FC<CustomerSearchComboboxProps> = ({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  onOpenNewCustomerModal,
  placeholder = 'Digite o nome ou CPF/CNPJ para buscar o cliente...',
  className = '',
  inputClassName = '',
  showInlineDetails = true,
  size = 'sm',
  largeDropdown = false,
  allowAnonymous = false,
  anonymousLabel = 'Consumidor Final (Não Identificado)',
  customInputRef,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Associa a referência interna com customInputRef fornecida pelo pai (ex: PDV Balcão para foco via atalho F3)
  const setRefs = (el: HTMLInputElement | null) => {
    (inputRef as any).current = el;
    if (customInputRef) {
      if (typeof customInputRef === 'function') {
        (customInputRef as any)(el);
      } else {
        (customInputRef as any).current = el;
      }
    }
  };

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  const isAnonymousSelected = allowAnonymous && (!selectedCustomerId || selectedCustomerId === 'consumidor_final');

  // Últimos 5 clientes únicos que compraram
  const last5PurchasingCustomers = useMemo(() => {
    return Database.getLastPurchasingCustomers(undefined, 5);
  }, [customers]);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Helper para normalização e remoção de acentos/pontuação
  const normalize = (text: string) =>
    (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const term = normalize(searchTerm);
  const isSearchMode = term.length >= 3;

  // Lista de clientes exibidos no dropdown
  // Regra:
  // - Menos de 3 caracteres digitados: EXIBE APENAS OS ÚLTIMOS 5 CLIENTES QUE COMPRARAM
  // - A partir de 3 caracteres digitados: EXIBE A LISTA DE TODOS OS CLIENTES FILTRADOS
  const displayedCustomers = useMemo(() => {
    if (!isSearchMode) {
      return last5PurchasingCustomers;
    }

    const rawNumbers = term.replace(/\D/g, '');

    return customers.filter((c) => {
      const nameMatch = normalize(c.name).includes(term);
      const tradeNameMatch = c.tradeName ? normalize(c.tradeName).includes(term) : false;
      const codeMatch = normalize(c.code).includes(term);
      const cityMatch = c.city ? normalize(c.city).includes(term) : false;
      const phoneMatch = c.phone ? normalize(c.phone).includes(term) : false;

      const docRaw = (c.cpfCnpj || '').replace(/\D/g, '');
      const docMatch = rawNumbers.length > 0 && docRaw.includes(rawNumbers);

      return nameMatch || tradeNameMatch || codeMatch || cityMatch || phoneMatch || docMatch;
    });
  }, [customers, last5PurchasingCustomers, isSearchMode, term]);

  // Reseta índice de destaque ao alterar o termo
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm]);

  // Garante que o item destacado esteja visível na rolagem
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (customer: Customer) => {
    onSelectCustomer(customer.id);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleSelectAnonymous = () => {
    onSelectCustomer('');
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectCustomer('');
    setSearchTerm('');
    setIsOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    const totalItems = displayedCustomers.length + (allowAnonymous ? 1 : 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allowAnonymous && highlightedIndex === 0) {
        handleSelectAnonymous();
      } else {
        const custIdx = allowAnonymous ? highlightedIndex - 1 : highlightedIndex;
        if (custIdx >= 0 && custIdx < displayedCustomers.length) {
          handleSelect(displayedCustomers[custIdx]);
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const isLarge = size === 'lg' || size === 'md';

  const containerPaddingClass = largeDropdown
    ? 'p-3.5 text-[17px] sm:text-lg font-extrabold'
    : isLarge
    ? 'p-3 text-sm sm:text-base font-bold'
    : 'py-1.5 px-2.5 text-xs font-bold';

  const inputPaddingClass = largeDropdown
    ? 'p-3.5 pl-11 pr-16 text-[17px] sm:text-lg font-bold'
    : isLarge
    ? 'p-3 pl-10 pr-16 text-sm sm:text-base font-bold'
    : 'py-1.5 pl-8 pr-16 text-xs font-bold';

  const searchIconClass = largeDropdown ? 'left-3.5' : isLarge ? 'left-3' : 'left-2.5';
  const searchIconSize = largeDropdown ? 20 : isLarge ? 17 : 14;

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* 1. Cliente Cadastrado Selecionado */}
      {selectedCustomer && !isOpen ? (
        <div
          onClick={() => {
            setIsOpen(true);
            setSearchTerm('');
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className={`w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 hover:border-blue-400 rounded-xl ${containerPaddingClass} text-slate-800 transition-all cursor-pointer flex items-center justify-between gap-2 shadow-2xs group ${inputClassName}`}
          title="Clique para pesquisar ou alterar o cliente selecionado [F3]"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className={`${largeDropdown ? 'w-7 h-7' : isLarge ? 'w-6 h-6' : 'w-5 h-5'} rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0`}>
              <User size={largeDropdown ? 16 : isLarge ? 14 : 12} />
            </div>
            <span className={`truncate text-slate-900 font-extrabold ${largeDropdown ? 'text-[17px] sm:text-lg' : isLarge ? 'text-sm sm:text-base' : 'text-xs'}`}>
              {selectedCustomer.name}
            </span>
            {selectedCustomer.cpfCnpj && (
              <span className={`${largeDropdown ? 'text-xs' : 'text-[11px]'} font-mono text-slate-500 font-semibold shrink-0 hidden sm:inline`}>
                • {selectedCustomer.cpfCnpj}
              </span>
            )}
            {selectedCustomer.city && (
              <span className={`${largeDropdown ? 'text-xs' : 'text-[11px]'} text-slate-400 font-normal shrink-0 hidden md:inline`}>
                ({selectedCustomer.city})
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {showInlineDetails && selectedCustomer.deliveryRouteName && (
              <span className="text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.2 rounded-md hidden lg:inline-flex items-center gap-1">
                <Truck size={10} className="text-blue-600" />
                <span className="truncate max-w-[90px]">{selectedCustomer.deliveryRouteName}</span>
              </span>
            )}

            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Trocar cliente"
            >
              <X size={isLarge ? 16 : 13} />
            </button>
            <ChevronDown size={isLarge ? 16 : 13} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
          </div>
        </div>
      ) : isAnonymousSelected && !isOpen ? (
        /* 2. Modo Consumidor Final (Não Identificado) Selecionado */
        <div
          onClick={() => {
            setIsOpen(true);
            setSearchTerm('');
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className={`w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 hover:border-emerald-400 rounded-xl ${containerPaddingClass} text-slate-800 transition-all cursor-pointer flex items-center justify-between gap-2 shadow-2xs group ${inputClassName}`}
          title="Clique ou pressione F3 para selecionar ou buscar cliente cadastrado"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={`${isLarge ? 'w-6 h-6' : 'w-5 h-5'} rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0`}>
              <ShoppingBag size={isLarge ? 14 : 12} />
            </div>
            <span className={`truncate text-slate-700 font-bold ${isLarge ? 'text-sm sm:text-base' : 'text-xs'}`}>
              {anonymousLabel}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">[F3]</span>
            <ChevronDown size={isLarge ? 16 : 13} className="text-slate-400 group-hover:text-emerald-600 transition-colors" />
          </div>
        </div>
      ) : (
        /* 3. Campo de Entrada para Digitação e Busca */
        <div className="relative flex items-center">
          <Search size={searchIconSize} className={`absolute ${searchIconClass} text-slate-400 pointer-events-none`} />
          <input
            ref={setRefs}
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedCustomer
                ? `Atual: ${selectedCustomer.name} (digite 3+ letras para trocar...)`
                : placeholder
            }
            className={`w-full bg-slate-50 border border-slate-200 rounded-xl ${inputPaddingClass} text-slate-800 focus:outline-hidden focus:bg-white focus:ring-1 focus:ring-blue-500 transition-all ${inputClassName}`}
          />
          <div className="absolute right-2 flex items-center gap-1">
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  inputRef.current?.focus();
                }}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                title="Limpar texto"
              >
                <X size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setIsOpen((prev) => !prev);
                if (!isOpen) setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
            >
              <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Popover / Lista Flutuante com Resultados Filtrados */}
      {isOpen && (
        <div
          ref={listRef}
          className={`absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl ${
            largeDropdown ? 'max-h-[420px]' : 'max-h-80'
          } overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100`}
        >
          {/* Cabeçalho do Dropdown com Informações e Atalho de Novo Cliente */}
          <div
            className={`${
              largeDropdown ? 'px-4 py-3 text-sm font-extrabold' : 'px-3 py-1.5 text-[10px]'
            } bg-slate-50 font-bold text-slate-600 flex items-center justify-between sticky top-0 z-10 border-b border-slate-200/80`}
          >
            <div className="flex items-center gap-1.5">
              {isSearchMode ? (
                <span>
                  Resultados para "<strong className="text-slate-900">{searchTerm}</strong>": {displayedCustomers.length} encontrado(s)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-blue-700">
                  <History size={largeDropdown ? 16 : 11} className="text-blue-600 shrink-0" />
                  <strong>Últimos 05 clientes que compraram</strong>
                </span>
              )}
            </div>

            {onOpenNewCustomerModal && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenNewCustomerModal();
                }}
                className="text-emerald-700 hover:text-emerald-900 font-extrabold flex items-center gap-1 hover:underline cursor-pointer ml-2 shrink-0"
              >
                <UserPlus size={largeDropdown ? 16 : 11} />
                <span>+ Novo</span>
              </button>
            )}
          </div>

          {/* Dica para digitar ao menos 3 caracteres quando menos de 3 foram digitados */}
          {!isSearchMode && (
            <div
              className={`${
                largeDropdown ? 'px-4 py-2.5 text-[13px]' : 'px-3 py-1 text-[10px]'
              } bg-blue-50/60 text-blue-700 font-medium flex items-center gap-2 border-b border-blue-100/60`}
            >
              <Info size={largeDropdown ? 15 : 11} className="shrink-0 text-blue-600" />
              <span>
                {searchTerm.trim().length > 0
                  ? `Digite mais ${3 - searchTerm.trim().length} caracter(es) para listar todos os clientes cadastrados.`
                  : 'Digite pelo menos 3 caracteres do nome ou documento para pesquisar outros clientes.'}
              </span>
            </div>
          )}

          {/* Opção Consumidor Final (Não Identificado) se allowAnonymous for true */}
          {allowAnonymous && (
            <div
              data-index={0}
              onClick={handleSelectAnonymous}
              onMouseEnter={() => setHighlightedIndex(0)}
              className={`${
                largeDropdown ? 'px-3.5 py-3 text-sm' : 'px-3 py-2 text-xs'
              } cursor-pointer transition-colors flex items-center justify-between gap-2 border-b border-slate-100 ${
                isAnonymousSelected
                  ? 'bg-emerald-50 text-emerald-900 font-black'
                  : highlightedIndex === 0
                  ? 'bg-slate-100 text-slate-900 font-bold'
                  : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <ShoppingBag size={11} />
                </div>
                <div className="truncate">
                  <strong className={`text-slate-800 ${largeDropdown ? 'text-sm sm:text-base' : 'text-xs'}`}>{anonymousLabel}</strong>
                  <p className={`${largeDropdown ? 'text-xs' : 'text-[10px]'} text-slate-400`}>Venda avulsa sem cadastro prévio</p>
                </div>
              </div>
              {isAnonymousSelected && (
                <span className={`inline-flex items-center gap-0.5 ${largeDropdown ? 'text-xs' : 'text-[10px]'} text-emerald-700 font-bold shrink-0`}>
                  <Check size={largeDropdown ? 13 : 11} /> Selecionado
                </span>
              )}
            </div>
          )}

          {/* Lista de Clientes */}
          {displayedCustomers.length === 0 ? (
            <div className="p-5 text-center space-y-2.5">
              <p className={`${largeDropdown ? 'text-base' : 'text-xs'} text-slate-600 font-bold`}>
                {isSearchMode
                  ? `Nenhum cliente encontrado com "${searchTerm}".`
                  : 'Nenhum histórico recente de clientes encontrado.'}
              </p>
              {onOpenNewCustomerModal && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenNewCustomerModal();
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg ${
                    largeDropdown ? 'text-sm' : 'text-xs'
                  } font-bold transition-colors cursor-pointer`}
                >
                  <UserPlus size={largeDropdown ? 16 : 13} />
                  <span>Cadastrar Cliente Agora</span>
                </button>
              )}
            </div>
          ) : (
            displayedCustomers.map((cust, idx) => {
              const actualIdx = allowAnonymous ? idx + 1 : idx;
              const isSelected = cust.id === selectedCustomerId;
              const isHighlighted = actualIdx === highlightedIndex;

              return (
                <div
                  key={cust.id}
                  data-index={actualIdx}
                  onClick={() => handleSelect(cust)}
                  onMouseEnter={() => setHighlightedIndex(actualIdx)}
                  className={`${
                    largeDropdown ? 'px-4 py-3.5 text-base' : 'px-3 py-2 text-xs'
                  } cursor-pointer transition-colors flex items-center justify-between gap-2.5 ${
                    isSelected
                      ? 'bg-blue-50 text-blue-900 font-black'
                      : isHighlighted
                      ? 'bg-slate-100 text-slate-900 font-bold'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className={`min-w-0 flex-1 ${largeDropdown ? 'space-y-1.5' : 'space-y-0.5'}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`font-mono ${
                          largeDropdown ? 'text-[13px]' : 'text-[10px]'
                        } text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200`}
                      >
                        {cust.code || 'CLI'}
                      </span>
                      <strong className={`text-slate-900 ${largeDropdown ? 'text-[17px] sm:text-lg font-extrabold leading-snug' : 'text-xs truncate'}`}>
                        {cust.name}
                      </strong>
                      {cust.tradeName && cust.tradeName !== cust.name && (
                        <span className={`${largeDropdown ? 'text-sm' : 'text-[10px]'} text-slate-500 italic truncate`}>
                          ({cust.tradeName})
                        </span>
                      )}
                      <span className={`${largeDropdown ? 'text-xs px-2 py-0.5' : 'text-[9px] px-1 py-0.2'} font-bold uppercase rounded bg-slate-200 text-slate-700`}>
                        {cust.type}
                      </span>
                    </div>

                    <div className={`${largeDropdown ? 'text-sm' : 'text-[11px]'} text-slate-500 flex items-center gap-2 flex-wrap`}>
                      {cust.cpfCnpj && <span>Doc: <strong className="text-slate-700">{cust.cpfCnpj}</strong></span>}
                      {cust.phone && <span>Tel: {cust.phone}</span>}
                      {cust.city && (
                        <span className="flex items-center gap-0.5">
                          <MapPin size={largeDropdown ? 14 : 10} className="text-slate-400" />
                          {cust.city}/{cust.state || 'BA'}
                        </span>
                      )}
                      {cust.deliveryRouteName && (
                        <span className={`${largeDropdown ? 'text-[13px]' : 'text-[10px]'} text-blue-700 font-bold bg-blue-50 px-1.5 rounded`}>
                          🚚 {cust.deliveryRouteName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 space-y-1">
                    <span
                      className={`${
                        largeDropdown ? 'text-[13px] px-2 py-0.5 font-bold' : 'text-[10px] px-1.5 py-0.5'
                      } text-emerald-800 bg-emerald-50 rounded border border-emerald-200 font-mono block`}
                    >
                      Limite: {formatCurrency(cust.creditLimit)}
                    </span>
                    {isSelected && (
                      <span className={`inline-flex items-center gap-0.5 ${largeDropdown ? 'text-[13px]' : 'text-[10px]'} text-blue-700 font-bold`}>
                        <Check size={largeDropdown ? 14 : 11} /> Selecionado
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
