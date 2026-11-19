import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  MapPin,
  Calendar,
  Search,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  FileText,
  User,
  Users,
  Building,
  Eye,
  Edit2,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Filter,
  CheckSquare,
  Square,
  Package,
  Layers,
  Sparkles,
  Phone,
  DollarSign,
  FileSpreadsheet,
  Navigation,
  Compass,
  Landmark,
  Globe,
  BarChart3,
  Target,
  TrendingUp,
  CreditCard,
  Car,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { Database } from '../../services/db';
import {
  DeliveryRoute,
  DeliveryManifest,
  DeliveryManifestOrder,
  DeliveryManifestOrderItem,
  DeliveryDriver,
  DeliveryVehicle,
  Customer,
  Order,
  MarketAreaItem,
  CityItem,
  NeighborhoodItem,
  StateItem,
} from '../../types';
import { formatCurrency, formatQuantity } from '../../services/pricingEngine';
import { toast } from '../../services/toast';
import { FirebaseSyncService } from '../../services/firebaseSync';

interface ExpeditionViewProps {
  initialTab?: 'romaneios' | 'rotas' | 'motoristas' | 'veiculos' | 'relatorios';
  initialRouteSubTab?: 'rotas' | 'pracas' | 'bairros' | 'cidades' | 'estados';
}

export const ExpeditionView: React.FC<ExpeditionViewProps> = ({
  initialTab = 'romaneios',
  initialRouteSubTab = 'rotas',
}) => {
  const currentCompany = Database.getCurrentCompany();
  const [dbState, setDbState] = useState(Database.getState());

  useEffect(() => {
    return Database.subscribe(() => {
      setDbState({ ...Database.getState() });
    });
  }, []);

  const [activeTab, setActiveTab] = useState<'romaneios' | 'rotas' | 'motoristas' | 'veiculos' | 'relatorios'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Rotas, Romaneios, Motoristas e Veículos da empresa atual
  const routes = useMemo(() => {
    return (dbState.deliveryRoutes || []).filter((r) => r.companyId === currentCompany.id);
  }, [dbState.deliveryRoutes, currentCompany.id]);

  const manifests = useMemo(() => {
    return (dbState.deliveryManifests || []).filter((m) => m.companyId === currentCompany.id);
  }, [dbState.deliveryManifests, currentCompany.id]);

  const drivers = useMemo(() => {
    return (dbState.deliveryDrivers || []).filter((d) => d.companyId === currentCompany.id);
  }, [dbState.deliveryDrivers, currentCompany.id]);

  const vehicles = useMemo(() => {
    return (dbState.deliveryVehicles || []).filter((v) => v.companyId === currentCompany.id);
  }, [dbState.deliveryVehicles, currentCompany.id]);

  const customers = useMemo(() => {
    return dbState.customers || [];
  }, [dbState.customers]);

  const orders = useMemo(() => {
    return (dbState.orders || []).filter(
      (o) => o.companyId === currentCompany.id && o.type === 'venda' && o.status !== 'cancelado'
    );
  }, [dbState.orders, currentCompany.id]);

  // Utilitário de Cálculo de Validade (CNH / Licenciamento / Seguro)
  const getExpirationStatus = (dateStr?: string) => {
    if (!dateStr || !dateStr.trim()) {
      return {
        state: 'missing' as const,
        label: 'Sem data informada',
        shortLabel: 'Sem data',
        days: null as number | null,
      };
    }
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
      return {
        state: 'missing' as const,
        label: 'Data inválida',
        shortLabel: 'Inválida',
        days: null as number | null,
      };
    }
    const [y, m, d] = parts;
    const targetDate = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((targetDate.getTime() - today.getTime()) / 86400000);

    if (diffDays < 0) {
      const overdue = Math.abs(diffDays);
      return {
        state: 'expired' as const,
        label: `Vencido há ${overdue} dia(s)`,
        shortLabel: `Vencido (${overdue}d)`,
        days: diffDays,
      };
    }
    if (diffDays === 0) {
      return {
        state: 'expired' as const,
        label: 'Vence hoje',
        shortLabel: 'Vence hoje',
        days: 0,
      };
    }
    if (diffDays <= 30) {
      return {
        state: 'expiring_soon' as const,
        label: `Vence em ${diffDays} dia(s)`,
        shortLabel: `Vence em ${diffDays}d`,
        days: diffDays,
      };
    }
    return {
      state: 'valid' as const,
      label: 'Em dia',
      shortLabel: 'Em dia',
      days: diffDays,
    };
  };

  const formatDateBr = (dateStr?: string) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Alertas consolidados de vencimento de CNH e Licenciamento de Veículos
  const fleetExpirationAlerts = useMemo(() => {
    const expiredDrivers = drivers.filter(
      (d) => d.status !== 'inativo' && getExpirationStatus(d.cnhExpirationDate).state === 'expired'
    );
    const expiringDrivers = drivers.filter(
      (d) => d.status !== 'inativo' && getExpirationStatus(d.cnhExpirationDate).state === 'expiring_soon'
    );
    const expiredVehicles = vehicles.filter(
      (v) => v.status !== 'inativo' && getExpirationStatus(v.licensingExpirationDate).state === 'expired'
    );
    const expiringVehicles = vehicles.filter(
      (v) => v.status !== 'inativo' && getExpirationStatus(v.licensingExpirationDate).state === 'expiring_soon'
    );
    const totalDriverAlerts = expiredDrivers.length + expiringDrivers.length;
    const totalVehicleAlerts = expiredVehicles.length + expiringVehicles.length;
    return {
      expiredDrivers,
      expiringDrivers,
      expiredVehicles,
      expiringVehicles,
      totalDriverAlerts,
      totalVehicleAlerts,
      totalAlerts: totalDriverAlerts + totalVehicleAlerts,
    };
  }, [drivers, vehicles]);

  // ==========================================
  // ESTADOS - ABA ROMANEIOS DE ENTREGA
  // ==========================================
  const [manifestSearchTerm, setManifestSearchTerm] = useState('');
  const [manifestRouteFilter, setManifestRouteFilter] = useState('todos');
  const [manifestStatusFilter, setManifestStatusFilter] = useState<'todos' | 'planejado' | 'em_transito' | 'entregue' | 'cancelado'>('todos');
  const [manifestPeriodFilter, setManifestPeriodFilter] = useState<'todos' | 'hoje' | 'ultimos_7_dias' | 'este_mes' | 'personalizado'>('todos');
  const [manifestStartDate, setManifestStartDate] = useState('');
  const [manifestEndDate, setManifestEndDate] = useState('');

  // Modais de Romaneio
  const [isNewManifestModalOpen, setIsNewManifestModalOpen] = useState(false);
  const [editingManifest, setEditingManifest] = useState<DeliveryManifest | null>(null);
  const [viewingManifestDetails, setViewingManifestDetails] = useState<DeliveryManifest | null>(null);
  const [manifestToDelete, setManifestToDelete] = useState<DeliveryManifest | null>(null);
  const [printManifest, setPrintManifest] = useState<DeliveryManifest | null>(null);
  const [printManifestScope, setPrintManifestScope] = useState<'all' | 'roteiro' | 'conferencia'>('all');

  // Form de Criação/Edição de Romaneio
  const [formManifestName, setFormManifestName] = useState('');
  const [formDepartureDate, setFormDepartureDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formRouteId, setFormRouteId] = useState('');
  const [formDriverId, setFormDriverId] = useState('');
  const [formDriverName, setFormDriverName] = useState('');
  const [formDriverPhone, setFormDriverPhone] = useState('');
  const [formVehicleId, setFormVehicleId] = useState('');
  const [formVehiclePlate, setFormVehiclePlate] = useState('');
  const [formVehicleModel, setFormVehicleModel] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [selectedOrderIdsForManifest, setSelectedOrderIdsForManifest] = useState<string[]>([]);
  const [manifestOrdersDraft, setManifestOrdersDraft] = useState<DeliveryManifestOrder[]>([]);

  // Filtros internos na seleção de pedidos para novo romaneio
  const [orderSelectionFilterOnlyRoute, setOrderSelectionFilterOnlyRoute] = useState(true);
  const [orderSelectionSearch, setOrderSelectionSearch] = useState('');

  // Painel de Vendas por Rota & Prontidão para Romaneio
  const [showRouteReadinessPanel, setShowRouteReadinessPanel] = useState(true);
  // Controle de exibição do Roteiro de Paradas na lista de romaneios (oculto por padrão)
  const [expandedManifestStops, setExpandedManifestStops] = useState<Record<string, boolean>>({});

  // ==========================================
  // ESTADOS - ABA MOTORISTAS & ABA VEÍCULOS
  // ==========================================
  const [driverSearchTerm, setDriverSearchTerm] = useState('');
  const [driverStatusFilter, setDriverStatusFilter] = useState<'todos' | 'ativo' | 'inativo' | 'alertas'>('todos');
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DeliveryDriver | null>(null);
  const [driverToDelete, setDriverToDelete] = useState<DeliveryDriver | null>(null);
  const [driverFormName, setDriverFormName] = useState('');
  const [driverFormCpf, setDriverFormCpf] = useState('');
  const [driverFormPhone, setDriverFormPhone] = useState('');
  const [driverFormCnhNumber, setDriverFormCnhNumber] = useState('');
  const [driverFormCnhCategory, setDriverFormCnhCategory] = useState('B');
  const [driverFormCnhExpirationDate, setDriverFormCnhExpirationDate] = useState('');
  const [driverFormAdmissionDate, setDriverFormAdmissionDate] = useState('');
  const [driverFormDefaultVehicleId, setDriverFormDefaultVehicleId] = useState('');
  const [driverFormStatus, setDriverFormStatus] = useState<'ativo' | 'inativo'>('ativo');
  const [driverFormNotes, setDriverFormNotes] = useState('');

  const [vehicleSearchTerm, setVehicleSearchTerm] = useState('');
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState<'todos' | 'ativo' | 'manutencao' | 'inativo' | 'alertas'>('todos');
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<DeliveryVehicle | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<DeliveryVehicle | null>(null);
  const [vehicleFormPlate, setVehicleFormPlate] = useState('');
  const [vehicleFormModel, setVehicleFormModel] = useState('');
  const [vehicleFormType, setVehicleFormType] = useState('Utilitário / Fiorino');
  const [vehicleFormYear, setVehicleFormYear] = useState('');
  const [vehicleFormRenavam, setVehicleFormRenavam] = useState('');
  const [vehicleFormCapacityKg, setVehicleFormCapacityKg] = useState('');
  const [vehicleFormLicensingExpirationDate, setVehicleFormLicensingExpirationDate] = useState('');
  const [vehicleFormInsuranceExpirationDate, setVehicleFormInsuranceExpirationDate] = useState('');
  const [vehicleFormStatus, setVehicleFormStatus] = useState<'ativo' | 'manutencao' | 'inativo'>('ativo');
  const [vehicleFormNotes, setVehicleFormNotes] = useState('');

  // ==========================================
  // ESTADOS - ABA ROTAS DE ENTREGA
  // ==========================================
  const [routeSearchTerm, setRouteSearchTerm] = useState('');
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<DeliveryRoute | null>(null);
  const [routeFormCode, setRouteFormCode] = useState('');
  const [routeFormName, setRouteFormName] = useState('');
  const [routeFormDescription, setRouteFormDescription] = useState('');
  const [routeFormColor, setRouteFormColor] = useState('blue');
  const [routeFormDeliveryWindow, setRouteFormDeliveryWindow] = useState('Dia Todo (08h às 17h)');
  const [routeFormVehicleType, setRouteFormVehicleType] = useState('Fiat Fiorino / Van');
  const [routeFormMinimumValue, setRouteFormMinimumValue] = useState('1.500,00');
  const [routeFormCities, setRouteFormCities] = useState('');
  const [routeFormNeighborhoods, setRouteFormNeighborhoods] = useState('');
  const [routeFormMarketAreas, setRouteFormMarketAreas] = useState('');
  const [routeFormSellers, setRouteFormSellers] = useState('');

  // Estados de Associação em Lote de Clientes
  const [batchTargetRouteId, setBatchTargetRouteId] = useState('');
  const [batchCriterionType, setBatchCriterionType] = useState<'city' | 'neighborhood' | 'marketArea' | 'sellerName'>('neighborhood');
  const [batchCriterionValue, setBatchCriterionValue] = useState('');
  const [batchSelectedCustomerIds, setBatchSelectedCustomerIds] = useState<string[]>([]);
  const [customerFilterRoute, setCustomerFilterRoute] = useState('todos');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  // ==========================================
  // ESTADOS - SUB-ABAS DE ROTAS & LOCALIDADES
  // ==========================================
  const [routeSubTab, setRouteSubTab] = useState<'rotas' | 'pracas' | 'bairros' | 'cidades' | 'estados'>(
    initialRouteSubTab
  );

  useEffect(() => {
    if (initialRouteSubTab) {
      setRouteSubTab(initialRouteSubTab);
    }
  }, [initialRouteSubTab]);

  // Praças Comerciais
  const [marketAreaSearchTerm, setMarketAreaSearchTerm] = useState('');
  const [isMarketAreaModalOpen, setIsMarketAreaModalOpen] = useState(false);
  const [editingMarketArea, setEditingMarketArea] = useState<MarketAreaItem | null>(null);
  const [marketAreaFormName, setMarketAreaFormName] = useState('');
  const [marketAreaFormDescription, setMarketAreaFormDescription] = useState('');
  const [marketAreaFormDefaultRouteId, setMarketAreaFormDefaultRouteId] = useState('');
  const [marketAreaFormCities, setMarketAreaFormCities] = useState('');
  const [marketAreaFormActive, setMarketAreaFormActive] = useState(true);

  // Bairros
  const [neighborhoodSearchTerm, setNeighborhoodSearchTerm] = useState('');
  const [neighborhoodCityFilter, setNeighborhoodCityFilter] = useState('todos');
  const [neighborhoodStateFilter, setNeighborhoodStateFilter] = useState('todos');
  const [isNeighborhoodModalOpen, setIsNeighborhoodModalOpen] = useState(false);
  const [editingNeighborhood, setEditingNeighborhood] = useState<NeighborhoodItem | null>(null);
  const [neighborhoodFormName, setNeighborhoodFormName] = useState('');
  const [neighborhoodFormCityName, setNeighborhoodFormCityName] = useState('');
  const [neighborhoodFormStateUf, setNeighborhoodFormStateUf] = useState('BA');
  const [neighborhoodFormMarketAreaName, setNeighborhoodFormMarketAreaName] = useState('');
  const [neighborhoodFormDefaultRouteId, setNeighborhoodFormDefaultRouteId] = useState('');
  const [neighborhoodFormZipCode, setNeighborhoodFormZipCode] = useState('');
  const [neighborhoodFormActive, setNeighborhoodFormActive] = useState(true);

  // Cidades
  const [citySearchTerm, setCitySearchTerm] = useState('');
  const [cityStateFilter, setCityStateFilter] = useState('BA');
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<CityItem | null>(null);
  const [cityFormName, setCityFormName] = useState('');
  const [cityFormStateUf, setCityFormStateUf] = useState('BA');
  const [cityFormMarketAreaName, setCityFormMarketAreaName] = useState('');
  const [cityFormDefaultRouteId, setCityFormDefaultRouteId] = useState('');
  const [cityFormIbgeCode, setCityFormIbgeCode] = useState('');
  const [cityFormDistanceKm, setCityFormDistanceKm] = useState('');
  const [cityFormIsSystemDefault, setCityFormIsSystemDefault] = useState(true);
  const [cityFormActive, setCityFormActive] = useState(true);
  const [cityToDelete, setCityToDelete] = useState<{ id: string; name: string } | null>(null);

  // Estados
  const [stateSearchTerm, setStateSearchTerm] = useState('');
  const [stateRegionFilter, setStateRegionFilter] = useState('todos');
  const [isStateModalOpen, setIsStateModalOpen] = useState(false);
  const [editingState, setEditingState] = useState<StateItem | null>(null);
  const [stateFormUf, setStateFormUf] = useState('');
  const [stateFormName, setStateFormName] = useState('');
  const [stateFormRegion, setStateFormRegion] = useState<'Sudeste' | 'Sul' | 'Centro-Oeste' | 'Nordeste' | 'Norte'>('Nordeste');
  const [stateFormActive, setStateFormActive] = useState(true);

  // Listas de Localidades derivadas do banco
  const marketAreas = useMemo(() => dbState.marketAreas || [], [dbState.marketAreas]);
  const cities = useMemo(
    () => (dbState.cities || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [dbState.cities]
  );
  const neighborhoods = useMemo(() => dbState.neighborhoods || [], [dbState.neighborhoods]);
  const states = useMemo(() => dbState.states || [], [dbState.states]);

  // Listas filtradas para as tabelas de localidades
  const filteredMarketAreas = useMemo(() => {
    return marketAreas.filter((m) => {
      if (!marketAreaSearchTerm.trim()) return true;
      const term = marketAreaSearchTerm.toLowerCase();
      return (
        m.name.toLowerCase().includes(term) ||
        (m.description || '').toLowerCase().includes(term) ||
        (m.defaultRouteName || '').toLowerCase().includes(term) ||
        (m.cities || []).some((c) => c.toLowerCase().includes(term))
      );
    });
  }, [marketAreas, marketAreaSearchTerm]);

  const filteredNeighborhoods = useMemo(() => {
    return neighborhoods.filter((n) => {
      if (neighborhoodStateFilter !== 'todos' && n.stateUf !== neighborhoodStateFilter) return false;
      if (neighborhoodCityFilter !== 'todos' && n.cityName.toLowerCase() !== neighborhoodCityFilter.toLowerCase()) return false;
      if (!neighborhoodSearchTerm.trim()) return true;
      const term = neighborhoodSearchTerm.toLowerCase();
      return (
        n.name.toLowerCase().includes(term) ||
        n.cityName.toLowerCase().includes(term) ||
        (n.marketAreaName || '').toLowerCase().includes(term) ||
        (n.defaultRouteName || '').toLowerCase().includes(term) ||
        (n.zipCodePrefix || '').includes(term)
      );
    });
  }, [neighborhoods, neighborhoodSearchTerm, neighborhoodCityFilter, neighborhoodStateFilter]);

  const filteredCities = useMemo(() => {
    return cities
      .filter((c) => {
        if (cityStateFilter !== 'todos' && c.stateUf !== cityStateFilter) return false;
        if (!citySearchTerm.trim()) return true;
        const term = citySearchTerm.toLowerCase();
        return (
          c.name.toLowerCase().includes(term) ||
          c.stateUf.toLowerCase().includes(term) ||
          (c.marketAreaName || '').toLowerCase().includes(term) ||
          (c.defaultRouteName || '').toLowerCase().includes(term) ||
          (c.ibgeCode || '').includes(term)
        );
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [cities, citySearchTerm, cityStateFilter]);

  const filteredStates = useMemo(() => {
    return states.filter((st) => {
      if (stateRegionFilter !== 'todos' && st.region !== stateRegionFilter) return false;
      if (!stateSearchTerm.trim()) return true;
      const term = stateSearchTerm.toLowerCase();
      return st.uf.toLowerCase().includes(term) || st.name.toLowerCase().includes(term);
    });
  }, [states, stateSearchTerm, stateRegionFilter]);

  // ==========================================
  // ESTADOS - ABA RELATÓRIOS DE EXPEDIÇÃO
  // ==========================================
  const [reportType, setReportType] = useState<'produtos_consolidados' | 'entregas_por_cliente' | 'desempenho_romaneios'>('entregas_por_cliente');
  const [reportRouteFilter, setReportRouteFilter] = useState('todos');
  const [reportManifestFilter, setReportManifestFilter] = useState('todos');
  const [reportPeriodFilter, setReportPeriodFilter] = useState<'todos' | 'hoje' | 'ultimos_7_dias' | 'este_mes' | 'personalizado'>('este_mes');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportSearchTerm, setReportSearchTerm] = useState('');

  // ==========================================
  // FILTRAGEM DE ROMANEIOS
  // ==========================================
  const filteredManifests = useMemo(() => {
    return manifests.filter((m) => {
      if (manifestRouteFilter !== 'todos' && m.routeId !== manifestRouteFilter) {
        return false;
      }
      if (manifestStatusFilter !== 'todos' && m.status !== manifestStatusFilter) {
        return false;
      }

      // Período
      if (manifestPeriodFilter !== 'todos') {
        const manDate = (m.departureDate || m.date || '').split('T')[0];
        const todayIso = new Date().toISOString().split('T')[0];

        if (manifestPeriodFilter === 'hoje' && manDate !== todayIso) {
          return false;
        }
        if (manifestPeriodFilter === 'ultimos_7_dias') {
          const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
          if (manDate < sevenDaysAgo || manDate > todayIso) return false;
        }
        if (manifestPeriodFilter === 'este_mes') {
          const curMonth = todayIso.substring(0, 7);
          if (!manDate.startsWith(curMonth)) return false;
        }
        if (manifestPeriodFilter === 'personalizado') {
          if (manifestStartDate && manDate < manifestStartDate) return false;
          if (manifestEndDate && manDate > manifestEndDate) return false;
        }
      }

      // Busca textual
      if (manifestSearchTerm.trim()) {
        const term = manifestSearchTerm.toLowerCase();
        const matchNum = m.number.toLowerCase().includes(term);
        const matchName = (m.name || '').toLowerCase().includes(term);
        const matchDriver = m.driverName.toLowerCase().includes(term);
        const matchPlate = m.vehiclePlate.toLowerCase().includes(term);
        const matchRoute = (m.routeName || '').toLowerCase().includes(term);
        const matchOrder = m.orders.some(
          (o) =>
            o.orderNumber.toLowerCase().includes(term) ||
            o.customerName.toLowerCase().includes(term) ||
            (o.address.city && o.address.city.toLowerCase().includes(term)) ||
            (o.address.neighborhood && o.address.neighborhood.toLowerCase().includes(term))
        );
        if (!matchNum && !matchName && !matchDriver && !matchPlate && !matchRoute && !matchOrder) {
          return false;
        }
      }

      return true;
    });
  }, [
    manifests,
    manifestRouteFilter,
    manifestStatusFilter,
    manifestPeriodFilter,
    manifestStartDate,
    manifestEndDate,
    manifestSearchTerm,
  ]);

  // Indicadores de Resumo da Expedição
  const summaryMetrics = useMemo(() => {
    const totalRomaneios = manifests.length;
    const emTransito = manifests.filter((m) => m.status === 'em_transito').length;
    const planejados = manifests.filter((m) => m.status === 'planejado').length;
    const entreguesTotal = manifests.reduce((acc, m) => acc + m.totalDelivered, 0);
    const pendentesTotal = manifests.reduce((acc, m) => acc + m.totalPending, 0);
    const valorTotalCarga = manifests.reduce((acc, m) => acc + m.totalValue, 0);
    const valorCobrarNaRota = manifests.reduce((acc, m) => acc + m.totalAmountToCollect, 0);

    return {
      totalRomaneios,
      emTransito,
      planejados,
      entreguesTotal,
      pendentesTotal,
      valorTotalCarga,
      valorCobrarNaRota,
    };
  }, [manifests]);

  // ==========================================
  // PEDIDOS DISPONÍVEIS PARA NOVO ROMANEIO
  // ==========================================
  const availableOrdersForDelivery = useMemo(() => {
    // Pedidos já alocados em romaneios em trânsito ou planejados
    const allocatedOrderIds = new Set<string>();
    manifests.forEach((m) => {
      if (m.status !== 'cancelado') {
        m.orders.forEach((o) => {
          if (editingManifest && m.id === editingManifest.id) {
            // Se estiver editando, não bloqueia os pedidos do próprio romaneio
            return;
          }
          allocatedOrderIds.add(o.orderId);
        });
      }
    });

    return orders.filter((o) => !allocatedOrderIds.has(o.id));
  }, [orders, manifests, editingManifest]);

  // ==========================================
  // VOLUME DE VENDAS POR ROTA & PRONTIDÃO P/ ROMANEIO
  // ==========================================
  const resolvePrimaryRouteForOrder = useMemo(() => {
    return (ord: Order): DeliveryRoute | undefined => {
      const client = customers.find((c) => c.id === ord.customerId || c.name === ord.customerName);
      if (client?.deliveryRouteId) {
        const direct = routes.find((r) => r.id === client.deliveryRouteId);
        if (direct) return direct;
      }
      const neigh = (client?.neighborhood || '').trim().toLowerCase();
      if (neigh) {
        const byNeighborhood = routes.find((r) =>
          r.neighborhoods.some((n) => n.trim().toLowerCase() === neigh)
        );
        if (byNeighborhood) return byNeighborhood;
      }
      const area = (client?.marketArea || '').trim().toLowerCase();
      if (area) {
        const byArea = routes.find((r) =>
          r.marketAreas.some((m) => m.trim().toLowerCase() === area)
        );
        if (byArea) return byArea;
      }
      const city = (client?.city || '').trim().toLowerCase();
      if (city) {
        const byCity = routes.find((r) => r.cities.some((c) => c.trim().toLowerCase() === city));
        if (byCity) return byCity;
      }
      return undefined;
    };
  }, [customers, routes]);

  const routeSalesSummary = useMemo(() => {
    // Pedidos já alocados em qualquer romaneio ativo (não cancelado), independente do modo de edição
    const activeAllocatedIds = new Set<string>();
    manifests.forEach((m) => {
      if (m.status !== 'cancelado') {
        m.orders.forEach((o) => activeAllocatedIds.add(o.orderId));
      }
    });

    const perRouteMap = new Map<
      string,
      {
        route: DeliveryRoute;
        pendingOrders: Order[];
        pendingValue: number;
        pendingCount: number;
        pendingClientsCount: number;
        totalSoldValue: number;
        totalSoldCount: number;
        manifestedValue: number;
        minimumValue: number;
        percentOfMinimum: number;
        remainingToMinimum: number;
        surplusOverMinimum: number;
        isReady: boolean;
      }
    >();

    routes.forEach((route) => {
      perRouteMap.set(route.id, {
        route,
        pendingOrders: [],
        pendingValue: 0,
        pendingCount: 0,
        pendingClientsCount: 0,
        totalSoldValue: 0,
        totalSoldCount: 0,
        manifestedValue: 0,
        minimumValue: Math.max(0, Number(route.minimumOrderValue ?? 0) || 0),
        percentOfMinimum: 0,
        remainingToMinimum: 0,
        surplusOverMinimum: 0,
        isReady: false,
      });
    });

    const routeClientIds = new Map<string, Set<string>>();
    const unassignedPendingOrders: Order[] = [];
    let unassignedPendingValue = 0;

    orders.forEach((ord) => {
      const matchedRoute = resolvePrimaryRouteForOrder(ord);
      const isPendingForManifest = !activeAllocatedIds.has(ord.id);

      if (!matchedRoute) {
        if (isPendingForManifest) {
          unassignedPendingOrders.push(ord);
          unassignedPendingValue += ord.total;
        }
        return;
      }

      const entry = perRouteMap.get(matchedRoute.id);
      if (!entry) return;

      entry.totalSoldValue += ord.total;
      entry.totalSoldCount += 1;

      if (isPendingForManifest) {
        entry.pendingOrders.push(ord);
        entry.pendingValue += ord.total;
        entry.pendingCount += 1;
        if (!routeClientIds.has(matchedRoute.id)) {
          routeClientIds.set(matchedRoute.id, new Set<string>());
        }
        routeClientIds.get(matchedRoute.id)!.add(ord.customerId || ord.customerName);
      } else {
        entry.manifestedValue += ord.total;
      }
    });

    const items = Array.from(perRouteMap.values()).map((entry) => {
      const minVal = entry.minimumValue;
      const pendingClientsCount = routeClientIds.get(entry.route.id)?.size || 0;
      const percentOfMinimum =
        minVal > 0
          ? Math.round((entry.pendingValue / minVal) * 100)
          : entry.pendingValue > 0
            ? 100
            : 0;
      const remainingToMinimum = Math.max(0, minVal - entry.pendingValue);
      const surplusOverMinimum = minVal > 0 ? Math.max(0, entry.pendingValue - minVal) : entry.pendingValue;
      const isReady = minVal > 0 ? entry.pendingValue >= minVal : entry.pendingCount > 0;

      return {
        ...entry,
        pendingClientsCount,
        percentOfMinimum,
        remainingToMinimum,
        surplusOverMinimum,
        isReady,
      };
    });

    const maxScaleValue = Math.max(
      1,
      ...items.map((it) => Math.max(it.pendingValue, it.minimumValue))
    );

    const totalPendingValue = items.reduce((acc, it) => acc + it.pendingValue, 0);
    const totalPendingCount = items.reduce((acc, it) => acc + it.pendingCount, 0);
    const totalSoldAllRoutesValue = items.reduce((acc, it) => acc + it.totalSoldValue, 0);
    const readyRoutesCount = items.filter((it) => it.isReady).length;

    return {
      items,
      maxScaleValue,
      totalPendingValue,
      totalPendingCount,
      totalSoldAllRoutesValue,
      readyRoutesCount,
      unassignedPendingOrders,
      unassignedPendingValue,
    };
  }, [routes, orders, manifests, resolvePrimaryRouteForOrder]);

  const buildDraftOrdersFromOrders = (
    ordersToAdd: Order[],
    startingSequence: number
  ): DeliveryManifestOrder[] => {
    return ordersToAdd.map((ord, idx) => {
      const client = customers.find((c) => c.id === ord.customerId || c.name === ord.customerName);

      const items: DeliveryManifestOrderItem[] = ord.items.map((it) => ({
        productId: it.productId,
        productCode: it.productCode,
        description: it.description,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice,
      }));

      const paymentStatus: 'pago_antecipado' | 'cobrar_na_entrega' =
        ord.paymentMethod === 'dinheiro' || ord.paymentMethod === 'multiplo'
          ? 'cobrar_na_entrega'
          : 'pago_antecipado';

      return {
        orderId: ord.id,
        orderNumber: ord.number,
        orderDate: ord.createdAt,
        customerId: client?.id || ord.customerId || 'cli-generic',
        customerCode: client?.code || 'CLI',
        customerName: ord.customerName,
        customerPhone: client?.phone || ord.customerPhone || '',
        customerCpfCnpj: client?.cpfCnpj || ord.customerCpfCnpj || '',
        address: {
          street: client?.street || 'Endereço Comercial Cadastrado',
          number: client?.number || 'S/N',
          neighborhood: client?.neighborhood || 'Centro',
          city: client?.city || 'Feira de Santana',
          state: client?.state || 'BA',
          zipCode: client?.zipCode || '',
          complement: client?.complement || '',
        },
        marketArea: client?.marketArea || 'Geral',
        sellerName: client?.sellerName || ord.userName || 'Carlos Silva',
        sequence: startingSequence + idx + 1,
        totalValue: ord.total,
        paymentMethod: ord.paymentMethod,
        paymentStatus,
        amountToCollect: paymentStatus === 'cobrar_na_entrega' ? ord.total : 0,
        deliveryStatus: 'pendente',
        previousOrderStatus:
          ord.preManifestStatus ||
          (ord.status === 'em_romaneio' || ord.status === 'em_transito' || ord.status === 'entregue' || ord.status === 'nao_entregue'
            ? 'concluido'
            : ord.status),
        previousDeliveryStatus:
          ord.preManifestDeliveryStatus ??
          (ord.deliveryStatus === 'em_romaneio' || ord.deliveryStatus === 'em_transito' || ord.deliveryStatus === 'entregue' || ord.deliveryStatus === 'nao_entregue'
            ? 'pendente'
            : ord.deliveryStatus || 'pendente'),
        items,
        volumesCount: Math.max(1, Math.ceil(items.reduce((acc, it) => acc + it.quantity, 0) / 10)),
      };
    });
  };

  // ==========================================
  // SELEÇÃO DE MOTORISTA / VEÍCULO & MONTAGEM DE ROMANEIO
  // ==========================================
  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      if (driverStatusFilter === 'ativo' && d.status !== 'ativo') return false;
      if (driverStatusFilter === 'inativo' && d.status !== 'inativo') return false;
      if (driverStatusFilter === 'alertas') {
        const exp = getExpirationStatus(d.cnhExpirationDate).state;
        if (exp !== 'expired' && exp !== 'expiring_soon') return false;
      }
      if (driverSearchTerm.trim()) {
        const term = driverSearchTerm.toLowerCase();
        const matchName = d.name.toLowerCase().includes(term);
        const matchCpf = (d.cpf || '').toLowerCase().includes(term);
        const matchPhone = (d.phone || '').toLowerCase().includes(term);
        const matchCnh = d.cnhNumber.toLowerCase().includes(term);
        const matchCat = d.cnhCategory.toLowerCase().includes(term);
        if (!matchName && !matchCpf && !matchPhone && !matchCnh && !matchCat) return false;
      }
      return true;
    });
  }, [drivers, driverStatusFilter, driverSearchTerm]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (vehicleStatusFilter === 'ativo' && v.status !== 'ativo') return false;
      if (vehicleStatusFilter === 'manutencao' && v.status !== 'manutencao') return false;
      if (vehicleStatusFilter === 'inativo' && v.status !== 'inativo') return false;
      if (vehicleStatusFilter === 'alertas') {
        const lic = getExpirationStatus(v.licensingExpirationDate).state;
        const ins = v.insuranceExpirationDate ? getExpirationStatus(v.insuranceExpirationDate).state : 'valid';
        if (lic !== 'expired' && lic !== 'expiring_soon' && ins !== 'expired' && ins !== 'expiring_soon') {
          return false;
        }
      }
      if (vehicleSearchTerm.trim()) {
        const term = vehicleSearchTerm.toLowerCase();
        const matchPlate = v.plate.toLowerCase().includes(term);
        const matchModel = v.model.toLowerCase().includes(term);
        const matchType = v.type.toLowerCase().includes(term);
        const matchRenavam = (v.renavam || '').toLowerCase().includes(term);
        if (!matchPlate && !matchModel && !matchType && !matchRenavam) return false;
      }
      return true;
    });
  }, [vehicles, vehicleStatusFilter, vehicleSearchTerm]);

  const handleDriverSelectionChange = (selectedId: string) => {
    setFormDriverId(selectedId);
    if (selectedId === '__manual__' || !selectedId) {
      if (selectedId === '__manual__') {
        setFormDriverName('');
        setFormDriverPhone('');
      }
      return;
    }
    const drv = drivers.find((d) => d.id === selectedId);
    if (drv) {
      setFormDriverName(drv.name);
      setFormDriverPhone(drv.phone || '');
      if (drv.defaultVehicleId) {
        const defVeh = vehicles.find((v) => v.id === drv.defaultVehicleId && v.status !== 'inativo');
        if (defVeh) {
          setFormVehicleId(defVeh.id);
          setFormVehiclePlate(defVeh.plate);
          setFormVehicleModel(defVeh.model);
        }
      }
    }
  };

  const handleVehicleSelectionChange = (selectedId: string) => {
    setFormVehicleId(selectedId);
    if (selectedId === '__manual__' || !selectedId) {
      if (selectedId === '__manual__') {
        setFormVehiclePlate('');
        setFormVehicleModel('');
      }
      return;
    }
    const veh = vehicles.find((v) => v.id === selectedId);
    if (veh) {
      setFormVehiclePlate(veh.plate);
      setFormVehicleModel(veh.model);
    }
  };

  const applyDefaultDriverAndVehicle = (fallbackVehicleModel = 'Fiat Fiorino 1.4 EVO') => {
    const activeDrivers = drivers.filter((d) => d.status === 'ativo');
    const firstDriver = activeDrivers[0] || drivers[0];
    const activeVehicles = vehicles.filter((v) => v.status === 'ativo');

    if (firstDriver) {
      setFormDriverId(firstDriver.id);
      setFormDriverName(firstDriver.name);
      setFormDriverPhone(firstDriver.phone || '');
      const linkedVeh =
        (firstDriver.defaultVehicleId &&
          vehicles.find((v) => v.id === firstDriver.defaultVehicleId && v.status !== 'inativo')) ||
        activeVehicles[0] ||
        vehicles[0];
      if (linkedVeh) {
        setFormVehicleId(linkedVeh.id);
        setFormVehiclePlate(linkedVeh.plate);
        setFormVehicleModel(linkedVeh.model);
      } else {
        setFormVehicleId('__manual__');
        setFormVehiclePlate('');
        setFormVehicleModel(fallbackVehicleModel);
      }
    } else {
      setFormDriverId('__manual__');
      setFormDriverName('');
      setFormDriverPhone('');
      const firstVeh = activeVehicles[0] || vehicles[0];
      if (firstVeh) {
        setFormVehicleId(firstVeh.id);
        setFormVehiclePlate(firstVeh.plate);
        setFormVehicleModel(firstVeh.model);
      } else {
        setFormVehicleId('__manual__');
        setFormVehiclePlate('');
        setFormVehicleModel(fallbackVehicleModel);
      }
    }
  };

  const handleOpenNewManifestModal = () => {
    setEditingManifest(null);
    setFormManifestName('');
    setFormDepartureDate(new Date().toISOString().split('T')[0]);
    setFormRouteId(routes[0]?.id || '');
    applyDefaultDriverAndVehicle();
    setFormNotes('');
    setManifestOrdersDraft([]);
    setSelectedOrderIdsForManifest([]);
    setOrderSelectionFilterOnlyRoute(true);
    setOrderSelectionSearch('');
    setIsNewManifestModalOpen(true);
  };

  const handleOpenNewManifestForRoute = (routeId: string, autoLoadPending = true) => {
    const targetRoute = routes.find((r) => r.id === routeId);
    const routeSummary = routeSalesSummary.items.find((it) => it.route.id === routeId);
    const preloadedOrders =
      autoLoadPending && routeSummary && routeSummary.pendingOrders.length > 0
        ? buildDraftOrdersFromOrders(routeSummary.pendingOrders, 0)
        : [];

    setEditingManifest(null);
    setFormManifestName('');
    setFormDepartureDate(new Date().toISOString().split('T')[0]);
    setFormRouteId(routeId);
    applyDefaultDriverAndVehicle(targetRoute?.vehicleTypeRecommendation || 'Fiat Fiorino 1.4 EVO');
    setFormNotes('');
    setManifestOrdersDraft(preloadedOrders);
    setSelectedOrderIdsForManifest([]);
    setOrderSelectionFilterOnlyRoute(true);
    setOrderSelectionSearch('');
    setIsNewManifestModalOpen(true);

    if (preloadedOrders.length > 0) {
      toast.info(
        `${preloadedOrders.length} pedido(s) pendente(s) da rota ${targetRoute?.code || ''} pré-carregados no romaneio.`
      );
    }
  };

  const handleEditManifest = (man: DeliveryManifest) => {
    setEditingManifest(man);
    setFormManifestName(man.name || '');
    setFormDepartureDate(man.departureDate || new Date().toISOString().split('T')[0]);
    setFormRouteId(man.routeId || '');

    const matchedDriver =
      (man.driverId && drivers.find((d) => d.id === man.driverId)) ||
      drivers.find((d) => d.name.toLowerCase() === man.driverName.toLowerCase());
    setFormDriverId(matchedDriver ? matchedDriver.id : '__manual__');
    setFormDriverName(man.driverName);
    setFormDriverPhone(man.driverPhone || '');

    const matchedVehicle =
      (man.vehicleId && vehicles.find((v) => v.id === man.vehicleId)) ||
      vehicles.find((v) => v.plate.toUpperCase() === man.vehiclePlate.toUpperCase());
    setFormVehicleId(matchedVehicle ? matchedVehicle.id : '__manual__');
    setFormVehiclePlate(man.vehiclePlate);
    setFormVehicleModel(man.vehicleModel || '');

    setFormNotes(man.notes || '');
    setManifestOrdersDraft([...man.orders]);
    setSelectedOrderIdsForManifest(man.orders.map((o) => o.orderId));
    setIsNewManifestModalOpen(true);
  };

  // ==========================================
  // HANDLERS - MOTORISTAS DE ENTREGA
  // ==========================================
  const handleOpenNewDriverModal = () => {
    setEditingDriver(null);
    setDriverFormName('');
    setDriverFormCpf('');
    setDriverFormPhone('');
    setDriverFormCnhNumber('');
    setDriverFormCnhCategory('B');
    setDriverFormCnhExpirationDate('');
    setDriverFormAdmissionDate(new Date().toISOString().split('T')[0]);
    setDriverFormDefaultVehicleId('');
    setDriverFormStatus('ativo');
    setDriverFormNotes('');
    setIsDriverModalOpen(true);
  };

  const handleEditDriver = (drv: DeliveryDriver) => {
    setEditingDriver(drv);
    setDriverFormName(drv.name);
    setDriverFormCpf(drv.cpf || '');
    setDriverFormPhone(drv.phone || '');
    setDriverFormCnhNumber(drv.cnhNumber);
    setDriverFormCnhCategory(drv.cnhCategory || 'B');
    setDriverFormCnhExpirationDate(drv.cnhExpirationDate || '');
    setDriverFormAdmissionDate(drv.admissionDate || '');
    setDriverFormDefaultVehicleId(drv.defaultVehicleId || '');
    setDriverFormStatus(drv.status || 'ativo');
    setDriverFormNotes(drv.notes || '');
    setIsDriverModalOpen(true);
  };

  const handleSaveDriver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverFormName.trim()) {
      toast.error('Informe o nome completo do motorista.');
      return;
    }
    if (!driverFormCnhNumber.trim() || !driverFormCnhExpirationDate) {
      toast.error('Informe o número da CNH e a data de validade da habilitação.');
      return;
    }

    const saved = Database.saveDeliveryDriver({
      id: editingDriver?.id,
      companyId: currentCompany.id,
      name: driverFormName.trim(),
      cpf: driverFormCpf.trim(),
      phone: driverFormPhone.trim(),
      cnhNumber: driverFormCnhNumber.trim(),
      cnhCategory: driverFormCnhCategory.trim().toUpperCase() || 'B',
      cnhExpirationDate: driverFormCnhExpirationDate,
      admissionDate: driverFormAdmissionDate,
      defaultVehicleId: driverFormDefaultVehicleId || '',
      status: driverFormStatus,
      notes: driverFormNotes.trim(),
      createdAt: editingDriver?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setDbState({ ...Database.getState() });
    setIsDriverModalOpen(false);

    // Se o modal de romaneio estiver aberto, já vincula o motorista recém-criado
    if (isNewManifestModalOpen && !editingDriver) {
      setFormDriverId(saved.id);
      setFormDriverName(saved.name);
      setFormDriverPhone(saved.phone || '');
      if (saved.defaultVehicleId) {
        const defVeh = vehicles.find((v) => v.id === saved.defaultVehicleId);
        if (defVeh) {
          setFormVehicleId(defVeh.id);
          setFormVehiclePlate(defVeh.plate);
          setFormVehicleModel(defVeh.model);
        }
      }
    }

    toast.success(
      editingDriver
        ? `Motorista "${saved.name}" atualizado com sucesso!`
        : `Motorista "${saved.name}" cadastrado com sucesso!`
    );

    FirebaseSyncService.syncToFirebase(Database.getState()).catch((err) => {
      console.warn('Erro ao sincronizar motorista no Firebase:', err);
    });
  };

  const handleConfirmDeleteDriver = () => {
    if (!driverToDelete) return;
    const drv = driverToDelete;
    Database.deleteDeliveryDriver(drv.id);
    setDbState({ ...Database.getState() });
    setDriverToDelete(null);
    toast.success(`Motorista "${drv.name}" excluído com sucesso.`);
    FirebaseSyncService.syncToFirebase(Database.getState()).catch((err) => {
      console.warn('Erro ao sincronizar exclusão de motorista no Firebase:', err);
    });
  };

  // ==========================================
  // HANDLERS - VEÍCULOS DE ENTREGA
  // ==========================================
  const handleOpenNewVehicleModal = () => {
    setEditingVehicle(null);
    setVehicleFormPlate('');
    setVehicleFormModel('');
    setVehicleFormType('Utilitário / Fiorino');
    setVehicleFormYear('');
    setVehicleFormRenavam('');
    setVehicleFormCapacityKg('');
    setVehicleFormLicensingExpirationDate('');
    setVehicleFormInsuranceExpirationDate('');
    setVehicleFormStatus('ativo');
    setVehicleFormNotes('');
    setIsVehicleModalOpen(true);
  };

  const handleEditVehicle = (veh: DeliveryVehicle) => {
    setEditingVehicle(veh);
    setVehicleFormPlate(veh.plate);
    setVehicleFormModel(veh.model);
    setVehicleFormType(veh.type || 'Utilitário / Fiorino');
    setVehicleFormYear(veh.year || '');
    setVehicleFormRenavam(veh.renavam || '');
    setVehicleFormCapacityKg(veh.capacityKg ? String(veh.capacityKg) : '');
    setVehicleFormLicensingExpirationDate(veh.licensingExpirationDate || '');
    setVehicleFormInsuranceExpirationDate(veh.insuranceExpirationDate || '');
    setVehicleFormStatus(veh.status || 'ativo');
    setVehicleFormNotes(veh.notes || '');
    setIsVehicleModalOpen(true);
  };

  const handleSaveVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleFormPlate.trim() || !vehicleFormModel.trim()) {
      toast.error('Informe a placa e o modelo do veículo.');
      return;
    }
    if (!vehicleFormLicensingExpirationDate) {
      toast.error('Informe a data de validade do licenciamento (CRLV) do veículo.');
      return;
    }

    const parsedCap = Number(vehicleFormCapacityKg.replace(',', '.'));
    const saved = Database.saveDeliveryVehicle({
      id: editingVehicle?.id,
      companyId: currentCompany.id,
      plate: vehicleFormPlate.trim().toUpperCase(),
      model: vehicleFormModel.trim(),
      type: vehicleFormType.trim() || 'Utilitário / Fiorino',
      year: vehicleFormYear.trim(),
      renavam: vehicleFormRenavam.trim(),
      capacityKg: Number.isFinite(parsedCap) && parsedCap > 0 ? parsedCap : undefined,
      licensingExpirationDate: vehicleFormLicensingExpirationDate,
      insuranceExpirationDate: vehicleFormInsuranceExpirationDate || '',
      status: vehicleFormStatus,
      notes: vehicleFormNotes.trim(),
      createdAt: editingVehicle?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setDbState({ ...Database.getState() });
    setIsVehicleModalOpen(false);

    // Se o modal de romaneio estiver aberto, já vincula o veículo recém-criado
    if (isNewManifestModalOpen && !editingVehicle) {
      setFormVehicleId(saved.id);
      setFormVehiclePlate(saved.plate);
      setFormVehicleModel(saved.model);
    }

    toast.success(
      editingVehicle
        ? `Veículo "${saved.plate}" atualizado com sucesso!`
        : `Veículo "${saved.plate} - ${saved.model}" cadastrado com sucesso!`
    );

    FirebaseSyncService.syncToFirebase(Database.getState()).catch((err) => {
      console.warn('Erro ao sincronizar veículo no Firebase:', err);
    });
  };

  const handleConfirmDeleteVehicle = () => {
    if (!vehicleToDelete) return;
    const veh = vehicleToDelete;
    Database.deleteDeliveryVehicle(veh.id);
    setDbState({ ...Database.getState() });
    setVehicleToDelete(null);
    toast.success(`Veículo "${veh.plate} - ${veh.model}" excluído com sucesso.`);
    FirebaseSyncService.syncToFirebase(Database.getState()).catch((err) => {
      console.warn('Erro ao sincronizar exclusão de veículo no Firebase:', err);
    });
  };

  // Pedidos elegíveis filtrados no modal de montagem
  const eligibleOrdersForDraft = useMemo(() => {
    const selectedRoute = routes.find((r) => r.id === formRouteId);

    return availableOrdersForDelivery.filter((ord) => {
      // Se já está no rascunho do romaneio, não lista na seleção de disponíveis
      if (manifestOrdersDraft.some((d) => d.orderId === ord.id)) {
        return false;
      }

      const client = customers.find((c) => c.id === ord.customerId || c.name === ord.customerName);

      // Filtro por rota selecionada
      if (orderSelectionFilterOnlyRoute && selectedRoute) {
        const matchesClientRoute = client?.deliveryRouteId === selectedRoute.id;
        const matchesCity = client?.city && selectedRoute.cities.some((c) => c.toLowerCase() === client.city?.toLowerCase());
        const matchesNeighborhood =
          client?.neighborhood &&
          selectedRoute.neighborhoods.some((n) => n.toLowerCase() === client.neighborhood?.toLowerCase());
        const matchesMarketArea =
          client?.marketArea &&
          selectedRoute.marketAreas.some((m) => m.toLowerCase() === client.marketArea?.toLowerCase());

        if (!matchesClientRoute && !matchesCity && !matchesNeighborhood && !matchesMarketArea) {
          return false;
        }
      }

      // Busca interna
      if (orderSelectionSearch.trim()) {
        const term = orderSelectionSearch.toLowerCase();
        const matchNum = ord.number.toLowerCase().includes(term);
        const matchCust = ord.customerName.toLowerCase().includes(term);
        const matchCity = client?.city?.toLowerCase().includes(term);
        const matchNeigh = client?.neighborhood?.toLowerCase().includes(term);
        if (!matchNum && !matchCust && !matchCity && !matchNeigh) {
          return false;
        }
      }

      return true;
    });
  }, [
    availableOrdersForDelivery,
    manifestOrdersDraft,
    formRouteId,
    routes,
    customers,
    orderSelectionFilterOnlyRoute,
    orderSelectionSearch,
  ]);

  // Adicionar pedidos selecionados ao rascunho do romaneio
  const handleAddOrdersToDraft = (ordersToAdd: Order[]) => {
    if (ordersToAdd.length === 0) return;

    const newDraftItems = buildDraftOrdersFromOrders(ordersToAdd, manifestOrdersDraft.length);
    setManifestOrdersDraft((prev) => [...prev, ...newDraftItems]);
    setSelectedOrderIdsForManifest([]);
    toast.success(`${ordersToAdd.length} pedido(s) adicionado(s) à rota do romaneio.`);
  };

  // Remover pedido do rascunho
  const handleRemoveOrderFromDraft = (orderId: string) => {
    setManifestOrdersDraft((prev) =>
      prev
        .filter((o) => o.orderId !== orderId)
        .map((o, idx) => ({ ...o, sequence: idx + 1 }))
    );
  };

  // Reordenar sequência da rota (subir / descer)
  const handleMoveOrderSequence = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === manifestOrdersDraft.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newItems = [...manifestOrdersDraft];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    // Atualiza sequências
    const updated = newItems.map((item, idx) => ({ ...item, sequence: idx + 1 }));
    setManifestOrdersDraft(updated);
  };

  // Salvar Romaneio
  const handleSaveManifest = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formDriverName.trim()) {
      toast.error('Selecione ou informe o motorista responsável pela entrega.');
      return;
    }

    if (!formVehiclePlate.trim()) {
      toast.error('Selecione ou informe o veículo e a placa para a entrega.');
      return;
    }

    if (manifestOrdersDraft.length === 0) {
      toast.error('Adicione ao menos 1 pedido para criar o romaneio de entrega.');
      return;
    }

    const routeObj = routes.find((r) => r.id === formRouteId);

    const manifestData: Omit<DeliveryManifest, 'id'> & { id?: string } = {
      id: editingManifest ? editingManifest.id : undefined,
      number: editingManifest ? editingManifest.number : '',
      name: formManifestName.trim() || undefined,
      companyId: currentCompany.id,
      date: editingManifest ? editingManifest.date : new Date().toISOString(),
      departureDate: formDepartureDate,
      routeId: formRouteId,
      routeName: routeObj ? routeObj.name : 'Rota Padrão',
      driverId: formDriverId && formDriverId !== '__manual__' ? formDriverId : undefined,
      driverName: formDriverName.trim(),
      driverPhone: formDriverPhone.trim(),
      vehicleId: formVehicleId && formVehicleId !== '__manual__' ? formVehicleId : undefined,
      vehiclePlate: formVehiclePlate.trim().toUpperCase(),
      vehicleModel: formVehicleModel.trim(),
      status: editingManifest ? editingManifest.status : 'planejado',
      notes: formNotes.trim(),
      orders: manifestOrdersDraft,
      totalOrders: manifestOrdersDraft.length,
      totalDelivered: manifestOrdersDraft.filter((o) => o.deliveryStatus === 'entregue').length,
      totalPending: manifestOrdersDraft.filter((o) => o.deliveryStatus === 'pendente').length,
      totalValue: manifestOrdersDraft.reduce((acc, o) => acc + o.totalValue, 0),
      totalAmountToCollect: manifestOrdersDraft
        .filter((o) => o.paymentStatus === 'cobrar_na_entrega')
        .reduce((acc, o) => acc + (o.amountToCollect || o.totalValue), 0),
      totalVolumes: manifestOrdersDraft.reduce((acc, o) => acc + (o.volumesCount || 1), 0),
      createdAt: editingManifest ? editingManifest.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = Database.saveDeliveryManifest(manifestData);
    setDbState({ ...Database.getState() });
    setIsNewManifestModalOpen(false);
    toast.success(
      editingManifest
        ? `Romaneio ${saved.number} atualizado com sucesso.`
        : `Romaneio ${saved.number} criado com sucesso com ${saved.totalOrders} entregas.`
    );
  };

  // Alterar Status do Romaneio
  const handleChangeManifestStatus = (man: DeliveryManifest, newStatus: DeliveryManifest['status']) => {
    Database.updateDeliveryManifestStatus(man.id, newStatus);
    setDbState({ ...Database.getState() });
    toast.success(`Status do Romaneio ${man.number} atualizado para "${newStatus.toUpperCase()}".`);
  };

  // Baixa / Alteração de status de pedido no Romaneio
  const handleUpdateOrderStatus = (
    manifestId: string,
    orderId: string,
    status: 'entregue' | 'nao_entregue',
    failureReason?: string
  ) => {
    Database.updateDeliveryOrderStatus(manifestId, orderId, status, undefined, failureReason);
    setDbState({ ...Database.getState() });

    // Atualiza estado do modal de detalhes se estiver aberto
    const updatedManifests = Database.getDeliveryManifests(currentCompany.id);
    const updated = updatedManifests.find((m) => m.id === manifestId);
    if (updated) {
      setViewingManifestDetails(updated);
    }

    toast.success(
      status === 'entregue'
        ? 'Entrega confirmada com sucesso!'
        : `Ocorrência registrada: ${failureReason || 'Não entregue'}`
    );
  };

  // Excluir Romaneio
  const handleDeleteManifest = (man: DeliveryManifest) => {
    setManifestToDelete(man);
  };

  const handleConfirmDeleteManifest = async () => {
    if (!manifestToDelete) return;
    const man = manifestToDelete;
    Database.deleteDeliveryManifest(man.id);
    setDbState({ ...Database.getState() });
    if (viewingManifestDetails?.id === man.id) {
      setViewingManifestDetails(null);
    }
    setManifestToDelete(null);
    try {
      await FirebaseSyncService.syncToFirebase(Database.getState());
    } catch (e) {
      console.warn('Erro ao sincronizar exclusão do romaneio com Firebase:', e);
    }
    toast.success(`Romaneio "${man.number}" excluído com sucesso e pedidos liberados!`, 'Romaneio Excluído');
  };

  const formatPtBrDecimal = (val: number): string => {
    const safeVal = Number.isFinite(val) && val > 0 ? val : 0;
    return safeVal.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const parsePtBrMoneyInput = (rawValue: string): number => {
    const cleaned = String(rawValue || '').replace(/[^\d.,]/g, '').trim();
    if (!cleaned) return 0;
    if (cleaned.includes(',')) {
      const normalized = cleaned.replace(/\./g, '').replace(',', '.');
      const num = parseFloat(normalized);
      return Number.isNaN(num) || num < 0 ? 0 : num;
    }
    const dotParts = cleaned.split('.');
    if (dotParts.length === 2 && dotParts[1].length <= 2) {
      const num = parseFloat(cleaned);
      return Number.isNaN(num) || num < 0 ? 0 : num;
    }
    const num = parseFloat(cleaned.replace(/\./g, ''));
    return Number.isNaN(num) || num < 0 ? 0 : num;
  };

  // ==========================================
  // GESTÃO DE ROTAS & ASSOCIAÇÃO EM LOTE
  // ==========================================
  const handleOpenNewRouteModal = () => {
    setEditingRoute(null);
    setRouteFormCode(`ROT-${(routes.length + 1).toString().padStart(2, '0')}`);
    setRouteFormName('');
    setRouteFormDescription('');
    setRouteFormColor('blue');
    setRouteFormDeliveryWindow('Dia Todo (08h às 17h)');
    setRouteFormVehicleType('Fiat Fiorino / Van');
    setRouteFormMinimumValue('1.500,00');
    setRouteFormCities('Feira de Santana');
    setRouteFormNeighborhoods('');
    setRouteFormMarketAreas('');
    setRouteFormSellers('');
    setIsRouteModalOpen(true);
  };

  const handleEditRoute = (rot: DeliveryRoute) => {
    setEditingRoute(rot);
    setRouteFormCode(rot.code);
    setRouteFormName(rot.name);
    setRouteFormDescription(rot.description || '');
    setRouteFormColor(rot.color || 'blue');
    setRouteFormDeliveryWindow(rot.estimatedDeliveryWindow || 'Dia Todo');
    setRouteFormVehicleType(rot.vehicleTypeRecommendation || '');
    setRouteFormMinimumValue(
      formatPtBrDecimal(Math.max(0, Number(rot.minimumOrderValue ?? 0) || 0))
    );
    setRouteFormCities(rot.cities.join(', '));
    setRouteFormNeighborhoods(rot.neighborhoods.join(', '));
    setRouteFormMarketAreas(rot.marketAreas.join(', '));
    setRouteFormSellers(rot.sellerNames.join(', '));
    setIsRouteModalOpen(true);
  };

  const handleSaveRoute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeFormCode.trim()) {
      toast.error('Informe o código da rota de entrega.');
      return;
    }
    if (!routeFormName.trim()) {
      toast.error('Informe o nome da rota de entrega.');
      return;
    }

    const parsedMinValue = parsePtBrMoneyInput(routeFormMinimumValue);

    const routeData: Omit<DeliveryRoute, 'id'> & { id?: string } = {
      id: editingRoute ? editingRoute.id : undefined,
      companyId: currentCompany.id,
      code: routeFormCode.trim().toUpperCase(),
      name: routeFormName.trim(),
      description: routeFormDescription.trim(),
      active: true,
      color: routeFormColor,
      cities: routeFormCities.split(',').map((c) => c.trim()).filter(Boolean),
      neighborhoods: routeFormNeighborhoods.split(',').map((n) => n.trim()).filter(Boolean),
      marketAreas: routeFormMarketAreas.split(',').map((m) => m.trim()).filter(Boolean),
      sellerNames: routeFormSellers.split(',').map((s) => s.trim()).filter(Boolean),
      estimatedDeliveryWindow: routeFormDeliveryWindow,
      vehicleTypeRecommendation: routeFormVehicleType,
      minimumOrderValue: parsedMinValue,
      createdAt: editingRoute ? editingRoute.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    Database.saveDeliveryRoute(routeData);
    setDbState({ ...Database.getState() });
    setIsRouteModalOpen(false);
    toast.success(
      editingRoute
        ? `Rota "${routeData.name}" atualizada (Mínimo: ${formatCurrency(parsedMinValue)}).`
        : `Rota "${routeData.name}" cadastrada (Mínimo: ${formatCurrency(parsedMinValue)}).`
    );
    FirebaseSyncService.syncToFirebase(Database.getState()).catch((err) => {
      console.warn('Erro ao sincronizar rota com Firebase:', err);
    });
  };

  const handleDeleteRoute = (rot: DeliveryRoute) => {
    if (confirm(`Deseja excluir a rota "${rot.name}"?`)) {
      Database.deleteDeliveryRoute(rot.id);
      setDbState({ ...Database.getState() });
      toast.info(`Rota "${rot.name}" excluída.`);
    }
  };

  // Associação em Lote por Critério (Cidade, Praça, Bairro ou Vendedor)
  const handleApplyBatchCriterion = () => {
    if (!batchTargetRouteId) {
      toast.error('Selecione a rota de destino para associação.');
      return;
    }
    if (!batchCriterionValue.trim()) {
      toast.error('Informe o valor do critério (cidade, praça, bairro ou vendedor).');
      return;
    }

    const targetRoute = routes.find((r) => r.id === batchTargetRouteId);
    if (!targetRoute) return;

    const filters: { city?: string; neighborhood?: string; marketArea?: string; sellerName?: string } = {};
    filters[batchCriterionType] = batchCriterionValue.trim();

    const count = Database.batchAssignRouteByFilters(targetRoute.id, targetRoute.name, filters);
    setDbState({ ...Database.getState() });

    if (count > 0) {
      toast.success(
        `Sucesso: ${count} cliente(s) associado(s) à rota "${targetRoute.name}" em lote!`
      );
      setBatchCriterionValue('');
    } else {
      toast.warning('Nenhum cliente encontrado com os critérios informados.');
    }
  };

  // Associação em Lote por Seleção Manual de Checkboxes
  const handleApplyBatchSelectedCustomers = () => {
    if (!batchTargetRouteId) {
      toast.error('Selecione a rota de destino para associação.');
      return;
    }
    if (batchSelectedCustomerIds.length === 0) {
      toast.error('Selecione ao menos 1 cliente na tabela para associar.');
      return;
    }

    const targetRoute = routes.find((r) => r.id === batchTargetRouteId);
    if (!targetRoute) return;

    const count = Database.batchAssignRouteToCustomers(
      targetRoute.id,
      targetRoute.name,
      batchSelectedCustomerIds
    );
    setDbState({ ...Database.getState() });
    setBatchSelectedCustomerIds([]);
    toast.success(`${count} cliente(s) vinculado(s) à rota "${targetRoute.name}" com sucesso!`);
  };

  // ==========================================
  // HANDLERS - GESTÃO DE PRAÇAS COMERCIAIS
  // ==========================================
  const handleOpenNewMarketAreaModal = () => {
    setEditingMarketArea(null);
    setMarketAreaFormName('');
    setMarketAreaFormDescription('');
    setMarketAreaFormDefaultRouteId('');
    setMarketAreaFormCities('');
    setMarketAreaFormActive(true);
    setIsMarketAreaModalOpen(true);
  };

  const handleEditMarketArea = (m: MarketAreaItem) => {
    setEditingMarketArea(m);
    setMarketAreaFormName(m.name);
    setMarketAreaFormDescription(m.description || '');
    setMarketAreaFormDefaultRouteId(m.defaultRouteId || '');
    setMarketAreaFormCities(m.cities?.join(', ') || '');
    setMarketAreaFormActive(m.active);
    setIsMarketAreaModalOpen(true);
  };

  const handleSaveMarketArea = (e: React.FormEvent) => {
    e.preventDefault();
    if (!marketAreaFormName.trim()) {
      toast.error('Informe o nome da praça comercial.');
      return;
    }
    const routeObj = routes.find((r) => r.id === marketAreaFormDefaultRouteId);
    const citiesArray = marketAreaFormCities
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    Database.saveMarketArea({
      id: editingMarketArea?.id,
      name: marketAreaFormName.trim(),
      description: marketAreaFormDescription.trim(),
      defaultRouteId: marketAreaFormDefaultRouteId,
      defaultRouteName: routeObj ? routeObj.name : '',
      cities: citiesArray,
      active: marketAreaFormActive,
    });
    setDbState({ ...Database.getState() });
    toast.success(`Praça "${marketAreaFormName}" salva com sucesso!`);
    setIsMarketAreaModalOpen(false);
  };

  const handleDeleteMarketArea = (id: string, name: string) => {
    if (confirm(`Deseja realmente excluir a praça "${name}"?`)) {
      Database.deleteMarketArea(id);
      setDbState({ ...Database.getState() });
      toast.info(`Praça "${name}" excluída.`);
    }
  };

  // ==========================================
  // HANDLERS - GESTÃO DE BAIRROS
  // ==========================================
  const handleOpenNewNeighborhoodModal = () => {
    setEditingNeighborhood(null);
    setNeighborhoodFormName('');
    setNeighborhoodFormCityName(cities[0]?.name || 'Feira de Santana');
    setNeighborhoodFormStateUf(cities[0]?.stateUf || 'BA');
    setNeighborhoodFormMarketAreaName('');
    setNeighborhoodFormDefaultRouteId('');
    setNeighborhoodFormZipCode('');
    setNeighborhoodFormActive(true);
    setIsNeighborhoodModalOpen(true);
  };

  const handleEditNeighborhood = (n: NeighborhoodItem) => {
    setEditingNeighborhood(n);
    setNeighborhoodFormName(n.name);
    setNeighborhoodFormCityName(n.cityName);
    setNeighborhoodFormStateUf(n.stateUf);
    setNeighborhoodFormMarketAreaName(n.marketAreaName || '');
    setNeighborhoodFormDefaultRouteId(n.defaultRouteId || '');
    setNeighborhoodFormZipCode(n.zipCodePrefix || '');
    setNeighborhoodFormActive(n.active);
    setIsNeighborhoodModalOpen(true);
  };

  const handleSaveNeighborhood = (e: React.FormEvent) => {
    e.preventDefault();
    if (!neighborhoodFormName.trim()) {
      toast.error('Informe o nome do bairro.');
      return;
    }
    const routeObj = routes.find((r) => r.id === neighborhoodFormDefaultRouteId);
    const mktObj = marketAreas.find((m) => m.name === neighborhoodFormMarketAreaName);

    Database.saveNeighborhood({
      id: editingNeighborhood?.id,
      name: neighborhoodFormName.trim(),
      cityName: neighborhoodFormCityName.trim(),
      stateUf: neighborhoodFormStateUf.trim().toUpperCase(),
      marketAreaId: mktObj?.id,
      marketAreaName: neighborhoodFormMarketAreaName.trim(),
      defaultRouteId: neighborhoodFormDefaultRouteId,
      defaultRouteName: routeObj ? routeObj.name : '',
      zipCodePrefix: neighborhoodFormZipCode.trim(),
      active: neighborhoodFormActive,
    });
    setDbState({ ...Database.getState() });
    toast.success(`Bairro "${neighborhoodFormName}" salvo com sucesso!`);
    setIsNeighborhoodModalOpen(false);
  };

  const handleDeleteNeighborhood = (id: string, name: string) => {
    if (confirm(`Deseja realmente excluir o bairro "${name}"?`)) {
      Database.deleteNeighborhood(id);
      setDbState({ ...Database.getState() });
      toast.info(`Bairro "${name}" excluído.`);
    }
  };

  // ==========================================
  // HANDLERS - GESTÃO DE CIDADES
  // ==========================================
  const handleOpenNewCityModal = () => {
    setEditingCity(null);
    setCityFormName('');
    setCityFormStateUf('BA');
    setCityFormMarketAreaName('');
    setCityFormDefaultRouteId('');
    setCityFormIbgeCode('');
    setCityFormDistanceKm('');
    setCityFormIsSystemDefault(true);
    setCityFormActive(true);
    setIsCityModalOpen(true);
  };

  const handleEditCity = (c: CityItem) => {
    setEditingCity(c);
    setCityFormName(c.name);
    setCityFormStateUf(c.stateUf);
    setCityFormMarketAreaName(c.marketAreaName || '');
    setCityFormDefaultRouteId(c.defaultRouteId || '');
    setCityFormIbgeCode(c.ibgeCode || '');
    setCityFormDistanceKm(c.distanceKm !== undefined ? String(c.distanceKm) : '');
    setCityFormIsSystemDefault(c.isSystemDefault ?? c.stateUf === 'BA');
    setCityFormActive(c.active);
    setIsCityModalOpen(true);
  };

  const handleSaveCity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityFormName.trim()) {
      toast.error('Informe o nome da cidade.');
      return;
    }
    const routeObj = routes.find((r) => r.id === cityFormDefaultRouteId);
    const mktObj = marketAreas.find((m) => m.name === cityFormMarketAreaName);
    const parsedDistance = cityFormDistanceKm.trim() !== '' ? Number(cityFormDistanceKm.replace(',', '.')) : undefined;

    Database.saveCity({
      id: editingCity?.id,
      name: cityFormName.trim(),
      stateUf: cityFormStateUf.trim().toUpperCase(),
      marketAreaId: mktObj?.id,
      marketAreaName: cityFormMarketAreaName.trim(),
      defaultRouteId: cityFormDefaultRouteId,
      defaultRouteName: routeObj ? routeObj.name : '',
      ibgeCode: cityFormIbgeCode.trim(),
      distanceKm: parsedDistance !== undefined && !Number.isNaN(parsedDistance) ? Math.max(0, parsedDistance) : undefined,
      isSystemDefault: cityFormIsSystemDefault,
      active: cityFormActive,
    });
    setDbState({ ...Database.getState() });
    toast.success(`Cidade "${cityFormName}/${cityFormStateUf.trim().toUpperCase()}" salva com sucesso!`);
    setIsCityModalOpen(false);
  };

  const handleDeleteCity = (id: string, name: string) => {
    setCityToDelete({ id, name });
  };

  const handleConfirmDeleteCity = () => {
    if (!cityToDelete) return;
    Database.deleteCity(cityToDelete.id);
    setDbState({ ...Database.getState() });
    toast.info(`Cidade "${cityToDelete.name}" excluída.`);
    setCityToDelete(null);
  };

  // ==========================================
  // HANDLERS - GESTÃO DE ESTADOS (UF)
  // ==========================================
  const handleOpenNewStateModal = () => {
    setEditingState(null);
    setStateFormUf('');
    setStateFormName('');
    setStateFormRegion('Nordeste');
    setStateFormActive(true);
    setIsStateModalOpen(true);
  };

  const handleEditState = (st: StateItem) => {
    setEditingState(st);
    setStateFormUf(st.uf);
    setStateFormName(st.name);
    setStateFormRegion(st.region);
    setStateFormActive(st.active);
    setIsStateModalOpen(true);
  };

  const handleSaveState = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stateFormUf.trim() || !stateFormName.trim()) {
      toast.error('Informe a sigla (UF) e o nome do estado.');
      return;
    }
    Database.saveStateItem({
      id: editingState?.id,
      uf: stateFormUf.trim().toUpperCase(),
      name: stateFormName.trim(),
      region: stateFormRegion,
      active: stateFormActive,
    });
    setDbState({ ...Database.getState() });
    toast.success(`Estado "${stateFormUf.toUpperCase()}" salvo com sucesso!`);
    setIsStateModalOpen(false);
  };

  // Lista de clientes filtrados na aba de rotas
  const filteredCustomersForRoutes = useMemo(() => {
    return customers.filter((c) => {
      if (customerFilterRoute === 'sem_rota' && c.deliveryRouteId) return false;
      if (customerFilterRoute !== 'todos' && customerFilterRoute !== 'sem_rota' && c.deliveryRouteId !== customerFilterRoute) {
        return false;
      }
      if (customerSearchTerm.trim()) {
        const term = customerSearchTerm.toLowerCase();
        const matchName = c.name.toLowerCase().includes(term);
        const matchCode = c.code.toLowerCase().includes(term);
        const matchCity = (c.city || '').toLowerCase().includes(term);
        const matchNeigh = (c.neighborhood || '').toLowerCase().includes(term);
        const matchMarket = (c.marketArea || '').toLowerCase().includes(term);
        const matchSeller = (c.sellerName || '').toLowerCase().includes(term);
        if (!matchName && !matchCode && !matchCity && !matchNeigh && !matchMarket && !matchSeller) {
          return false;
        }
      }
      return true;
    });
  }, [customers, customerFilterRoute, customerSearchTerm]);

  // ==========================================
  // RELATÓRIOS CONSOLIDADOS
  // ==========================================
  // 1. Produtos consolidados para carregamento do caminhão
  const consolidatedReportProducts = useMemo(() => {
    const productMap = new Map<
      string,
      {
        productId: string;
        productCode: string;
        description: string;
        unit: string;
        quantity: number;
        totalValue: number;
        customerCount: Set<string>;
      }
    >();

    filteredManifests.forEach((m) => {
      if (reportManifestFilter !== 'todos' && m.id !== reportManifestFilter) return;

      m.orders.forEach((o) => {
        o.items.forEach((it) => {
          if (reportSearchTerm.trim()) {
            const term = reportSearchTerm.toLowerCase();
            const matchCode = it.productCode.toLowerCase().includes(term);
            const matchDesc = it.description.toLowerCase().includes(term);
            if (!matchCode && !matchDesc) return;
          }

          const existing = productMap.get(it.productId);
          if (existing) {
            existing.quantity += it.quantity;
            existing.totalValue += it.totalPrice;
            existing.customerCount.add(o.customerName);
          } else {
            productMap.set(it.productId, {
              productId: it.productId,
              productCode: it.productCode,
              description: it.description,
              unit: it.unit,
              quantity: it.quantity,
              totalValue: it.totalPrice,
              customerCount: new Set([o.customerName]),
            });
          }
        });
      });
    });

    return Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity);
  }, [filteredManifests, reportManifestFilter, reportSearchTerm]);

  // 2. Entregas e produtos separados por cliente
  const clientDeliveriesReport = useMemo(() => {
    const list: Array<{
      manifestNumber: string;
      manifestDate: string;
      routeName: string;
      driverName: string;
      vehiclePlate: string;
      order: DeliveryManifestOrder;
    }> = [];

    filteredManifests.forEach((m) => {
      if (reportManifestFilter !== 'todos' && m.id !== reportManifestFilter) return;

      m.orders.forEach((o) => {
        if (reportSearchTerm.trim()) {
          const term = reportSearchTerm.toLowerCase();
          const matchCust = o.customerName.toLowerCase().includes(term);
          const matchOrder = o.orderNumber.toLowerCase().includes(term);
          const matchCity = o.address.city.toLowerCase().includes(term);
          const matchNeigh = o.address.neighborhood.toLowerCase().includes(term);
          const matchMarket = (o.marketArea || '').toLowerCase().includes(term);
          const matchSeller = (o.sellerName || '').toLowerCase().includes(term);
          const matchProduct = o.items.some(
            (it) => it.description.toLowerCase().includes(term) || it.productCode.toLowerCase().includes(term)
          );
          if (!matchCust && !matchOrder && !matchCity && !matchNeigh && !matchMarket && !matchSeller && !matchProduct) {
            return;
          }
        }

        list.push({
          manifestNumber: m.number,
          manifestDate: m.departureDate,
          routeName: m.routeName || 'Rota',
          driverName: m.driverName,
          vehiclePlate: m.vehiclePlate,
          order: o,
        });
      });
    });

    return list;
  }, [filteredManifests, reportManifestFilter, reportSearchTerm]);

  // Helper para impressão rápida
  const handlePrint = () => {
    window.print();
  };

  const isStickyExpeditionList =
    activeTab === 'motoristas' ||
    activeTab === 'veiculos' ||
    (activeTab === 'rotas' && ['pracas', 'bairros', 'cidades', 'estados'].includes(routeSubTab));

  return (
    <div
      className={
        isStickyExpeditionList
          ? 'flex flex-col gap-4 max-w-7xl mx-auto lg:h-[calc(100vh-7rem)]'
          : 'space-y-4 max-w-7xl mx-auto pb-16'
      }
    >
      {/* CABEÇALHO PRINCIPAL DA EXPEDIÇÃO */}
      <div className="shrink-0 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
            <Truck size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                Expedição & Logística de Entregas
              </h1>
              <span className="text-[11px] font-bold bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-200">
                {manifests.length} romaneios cadastrados
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Crie romaneios de entrega por rota, organize pedidos, despache cargas e associe clientes em lote por região.
            </p>
          </div>
        </div>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl text-xs font-bold gap-1 self-start md:self-center">
          <button
            type="button"
            onClick={() => setActiveTab('romaneios')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'romaneios'
                ? 'bg-white text-blue-700 shadow-xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck size={15} />
            <span>Romaneios de Entrega</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rotas')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'rotas'
                ? 'bg-white text-blue-700 shadow-xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Navigation size={15} />
            <span>Rotas de Entrega & Lote</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('motoristas')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'motoristas'
                ? 'bg-white text-blue-700 shadow-xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard size={15} />
            <span>Motoristas</span>
            {fleetExpirationAlerts.totalDriverAlerts > 0 && (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-mono font-extrabold rounded ${
                  fleetExpirationAlerts.expiredDrivers.length > 0
                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}
                title="Motoristas com CNH vencida ou próxima do vencimento"
              >
                {fleetExpirationAlerts.totalDriverAlerts}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('veiculos')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'veiculos'
                ? 'bg-white text-blue-700 shadow-xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Car size={15} />
            <span>Veículos</span>
            {fleetExpirationAlerts.totalVehicleAlerts > 0 && (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-mono font-extrabold rounded ${
                  fleetExpirationAlerts.expiredVehicles.length > 0
                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}
                title="Veículos com licenciamento vencido ou próximo do vencimento"
              >
                {fleetExpirationAlerts.totalVehicleAlerts}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('relatorios')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'relatorios'
                ? 'bg-white text-blue-700 shadow-xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText size={15} />
            <span>Relatórios de Entrega</span>
          </button>
        </div>
      </div>

      {/* BANNER DE ALERTA DE VENCIMENTOS (CNH & LICENCIAMENTO) */}
      {fleetExpirationAlerts.totalAlerts > 0 && (
        <div
          className={`shrink-0 p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            fleetExpirationAlerts.expiredDrivers.length > 0 || fleetExpirationAlerts.expiredVehicles.length > 0
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-start gap-3">
            <ShieldAlert
              size={18}
              className={
                fleetExpirationAlerts.expiredDrivers.length > 0 || fleetExpirationAlerts.expiredVehicles.length > 0
                  ? 'text-rose-600 shrink-0 mt-0.5'
                  : 'text-amber-600 shrink-0 mt-0.5'
              }
            />
            <div className="text-xs space-y-0.5">
              <p className="font-extrabold">
                Alerta de Vencimentos da Frota & Documentação ({fleetExpirationAlerts.totalAlerts} pendência
                {fleetExpirationAlerts.totalAlerts > 1 ? 's' : ''})
              </p>
              <p className="text-[11px] opacity-90">
                {fleetExpirationAlerts.expiredDrivers.length > 0 && (
                  <span className="font-bold mr-2">
                    • {fleetExpirationAlerts.expiredDrivers.length} CNH vencida(s)
                  </span>
                )}
                {fleetExpirationAlerts.expiringDrivers.length > 0 && (
                  <span className="font-semibold mr-2">
                    • {fleetExpirationAlerts.expiringDrivers.length} CNH vencendo em até 30 dias
                  </span>
                )}
                {fleetExpirationAlerts.expiredVehicles.length > 0 && (
                  <span className="font-bold mr-2">
                    • {fleetExpirationAlerts.expiredVehicles.length} Licenciamento vencido(s)
                  </span>
                )}
                {fleetExpirationAlerts.expiringVehicles.length > 0 && (
                  <span className="font-semibold">
                    • {fleetExpirationAlerts.expiringVehicles.length} Licenciamento vencendo em até 30 dias
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {fleetExpirationAlerts.totalDriverAlerts > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDriverStatusFilter('alertas');
                  setActiveTab('motoristas');
                }}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-800 cursor-pointer"
              >
                Ver CNHs ({fleetExpirationAlerts.totalDriverAlerts})
              </button>
            )}
            {fleetExpirationAlerts.totalVehicleAlerts > 0 && (
              <button
                type="button"
                onClick={() => {
                  setVehicleStatusFilter('alertas');
                  setActiveTab('veiculos');
                }}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-800 cursor-pointer"
              >
                Ver Veículos ({fleetExpirationAlerts.totalVehicleAlerts})
              </button>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 1: ROMANEIOS DE ENTREGA */}
      {/* ========================================================================= */}
      {activeTab === 'romaneios' && (
        <div className="space-y-4">
          {/* BARRA DE KPIS RÁPIDOS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <Truck size={13} className="text-blue-600" />
                <span>Em Trânsito / Na Rua</span>
              </span>
              <p className="text-xl font-extrabold text-blue-700 mt-1">
                {summaryMetrics.emTransito} <span className="text-xs font-normal text-slate-500">cargas</span>
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-600" />
                <span>Entregas Realizadas</span>
              </span>
              <p className="text-xl font-extrabold text-emerald-700 mt-1">
                {summaryMetrics.entreguesTotal}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {summaryMetrics.entreguesTotal + summaryMetrics.pendentesTotal}
                </span>
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <DollarSign size={13} className="text-indigo-600" />
                <span>Valor Total Transportado</span>
              </span>
              <p className="text-xl font-extrabold text-slate-900 font-mono mt-1">
                {formatCurrency(summaryMetrics.valorTotalCarga)}
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <DollarSign size={13} className="text-amber-600" />
                <span>A Cobrar na Rota</span>
              </span>
              <p className="text-xl font-extrabold text-amber-700 font-mono mt-1">
                {formatCurrency(summaryMetrics.valorCobrarNaRota)}
              </p>
            </div>
          </div>

          {/* PAINEL: VOLUME DE VENDAS POR ROTA & PRONTIDÃO PARA NOVO ROMANEIO */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <BarChart3 size={18} className="text-blue-600 shrink-0" />
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                    Vendas por Rota & Meta para Novo Romaneio
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  {routeSalesSummary.readyRoutesCount} de {routeSalesSummary.items.length} rota(s) com meta mínima atingida
                  {' · '}
                  Pendente p/ romaneio: <strong className="text-slate-800 font-mono">{formatCurrency(routeSalesSummary.totalPendingValue)}</strong> ({routeSalesSummary.totalPendingCount} pedido{routeSalesSummary.totalPendingCount === 1 ? '' : 's'})
                  {' · '}
                  Já vendido nas rotas: <strong className="text-slate-800 font-mono">{formatCurrency(routeSalesSummary.totalSoldAllRoutesValue)}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('rotas')}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                >
                  <Target size={13} className="text-blue-600" />
                  <span>Ajustar Metas / Rotas</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRouteReadinessPanel((prev) => !prev)}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                >
                  {showRouteReadinessPanel ? (
                    <>
                      <ChevronUp size={14} />
                      <span>Ocultar Painel</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown size={14} />
                      <span>Expandir Gráfico</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {showRouteReadinessPanel && (
              <div>
                {routeSalesSummary.items.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Nenhuma rota de entrega cadastrada ainda. Acesse <strong>Rotas de Entrega & Lote</strong> para configurar suas rotas e valores mínimos.
                  </div>
                ) : (
                  <>
                    {/* GRÁFICO COMPARATIVO COMPACTO POR ROTA */}
                    <div className="px-4 sm:px-5 py-4 bg-slate-50/70 border-b border-slate-100 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-500">
                        <span className="font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                          <TrendingUp size={13} className="text-blue-600" />
                          <span>Comparativo Financeiro: Volume Aguardando Romaneio vs. Valor Mínimo da Rota</span>
                        </span>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
                            <span>Meta atingida</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                            <span>Abaixo do mínimo</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-0.5 h-3 border-l-2 border-dashed border-slate-700 inline-block" />
                            <span>Valor mínimo da rota</span>
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        {routeSalesSummary.items.map((item) => {
                          const barWidthPct = Math.min(
                            100,
                            (item.pendingValue / routeSalesSummary.maxScaleValue) * 100
                          );
                          const minMarkerPct =
                            item.minimumValue > 0
                              ? Math.min(100, (item.minimumValue / routeSalesSummary.maxScaleValue) * 100)
                              : 0;

                          const barColorClass =
                            item.pendingValue === 0
                              ? 'bg-slate-300'
                              : item.isReady
                                ? 'bg-emerald-600'
                                : 'bg-amber-500';

                          return (
                            <div
                              key={item.route.id}
                              className="grid grid-cols-1 md:grid-cols-12 items-center gap-2 text-xs"
                            >
                              <div className="md:col-span-3 flex items-center gap-2 min-w-0">
                                <span className="font-mono font-bold text-blue-700 shrink-0">
                                  {item.route.code}
                                </span>
                                <span className="font-semibold text-slate-800 truncate" title={item.route.name}>
                                  {item.route.name.replace(new RegExp(`^${item.route.code}\\s*-?\\s*`, 'i'), '')}
                                </span>
                              </div>

                              <div className="md:col-span-6 relative h-5 bg-slate-200/80 rounded-md overflow-visible flex items-center">
                                <div
                                  className={`h-full rounded-md transition-all duration-300 ${barColorClass}`}
                                  style={{ width: `${Math.max(barWidthPct, item.pendingValue > 0 ? 2 : 0)}%` }}
                                  title={`Pendente: ${formatCurrency(item.pendingValue)}`}
                                />
                                {item.minimumValue > 0 && (
                                  <div
                                    className="absolute top-0 bottom-0 border-l-2 border-dashed border-slate-800 pointer-events-none"
                                    style={{ left: `${minMarkerPct}%` }}
                                    title={`Valor mínimo: ${formatCurrency(item.minimumValue)}`}
                                  />
                                )}
                              </div>

                              <div className="md:col-span-3 flex items-center justify-between md:justify-end gap-2 font-mono tabular-nums text-[11px]">
                                <span className="font-extrabold text-slate-900">
                                  {formatCurrency(item.pendingValue)}
                                </span>
                                <span className="text-slate-400">/</span>
                                <span className="text-slate-600">
                                  {item.minimumValue > 0
                                    ? `Mín ${formatCurrency(item.minimumValue)}`
                                    : 'Sem mínimo'}
                                </span>
                                <span
                                  className={`font-bold ${
                                    item.pendingCount === 0
                                      ? 'text-slate-400'
                                      : item.isReady
                                        ? 'text-emerald-700'
                                        : 'text-amber-700'
                                  }`}
                                >
                                  {item.minimumValue > 0 ? `${item.percentOfMinimum}%` : '—'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* TABELA DETALHADA POR ROTA PARA DECISÃO DE ROMANEIO */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                          <tr>
                            <th className="py-2.5 px-4">Rota / Janela</th>
                            <th className="py-2.5 px-3 text-right">Já Vendido na Rota</th>
                            <th className="py-2.5 px-3 text-right">Pendente p/ Romaneio</th>
                            <th className="py-2.5 px-3 text-right">Valor Mínimo</th>
                            <th className="py-2.5 px-3">Prontidão / Saldo</th>
                            <th className="py-2.5 px-4 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {routeSalesSummary.items.map((item) => (
                            <tr key={item.route.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-extrabold text-blue-700">
                                    {item.route.code}
                                  </span>
                                  <span className="font-bold text-slate-900">{item.route.name}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {item.route.estimatedDeliveryWindow || 'Dia Todo'}
                                  {item.route.vehicleTypeRecommendation
                                    ? ` · ${item.route.vehicleTypeRecommendation}`
                                    : ''}
                                </div>
                              </td>

                              <td className="py-3 px-3 text-right font-mono tabular-nums">
                                <div className="font-bold text-slate-800">
                                  {formatCurrency(item.totalSoldValue)}
                                </div>
                                <div className="text-[11px] text-slate-500 font-sans">
                                  {item.totalSoldCount} pedido{item.totalSoldCount === 1 ? '' : 's'} no total
                                </div>
                              </td>

                              <td className="py-3 px-3 text-right font-mono tabular-nums">
                                <div className="font-extrabold text-slate-900">
                                  {formatCurrency(item.pendingValue)}
                                </div>
                                <div className="text-[11px] text-slate-500 font-sans">
                                  {item.pendingCount} pedido{item.pendingCount === 1 ? '' : 's'}
                                  {item.pendingClientsCount > 0
                                    ? ` · ${item.pendingClientsCount} cliente${item.pendingClientsCount === 1 ? '' : 's'}`
                                    : ''}
                                </div>
                              </td>

                              <td className="py-3 px-3 text-right font-mono tabular-nums">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <span className="font-semibold text-slate-700">
                                    {item.minimumValue > 0 ? formatCurrency(item.minimumValue) : 'Não definido'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleEditRoute(item.route)}
                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                                    title="Alterar valor mínimo desta rota"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                </div>
                              </td>

                              <td className="py-3 px-3">
                                {item.pendingCount === 0 ? (
                                  <span className="inline-flex items-center gap-1.5 text-slate-500 font-medium">
                                    <Clock size={13} className="text-slate-400 shrink-0" />
                                    <span>Sem pedidos pendentes</span>
                                  </span>
                                ) : item.minimumValue === 0 ? (
                                  <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold">
                                    <CheckCircle2 size={14} className="shrink-0" />
                                    <span>Liberado ({item.pendingCount} ped.)</span>
                                  </span>
                                ) : item.isReady ? (
                                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                                    <CheckCircle2 size={14} className="shrink-0" />
                                    <span className="tabular-nums">
                                      Meta atingida ({item.percentOfMinimum}%
                                      {item.surplusOverMinimum > 0
                                        ? ` · +${formatCurrency(item.surplusOverMinimum)}`
                                        : ''}
                                      )
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-amber-700 font-bold">
                                    <AlertTriangle size={14} className="shrink-0" />
                                    <span className="tabular-nums">
                                      Faltam {formatCurrency(item.remainingToMinimum)} ({item.percentOfMinimum}%)
                                    </span>
                                  </div>
                                )}
                              </td>

                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleOpenNewManifestForRoute(item.route.id, true)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                                    item.isReady
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                      : item.pendingCount > 0
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  <Plus size={13} />
                                  <span>
                                    {item.pendingCount > 0
                                      ? `Criar Romaneio (${item.pendingCount})`
                                      : 'Novo Romaneio'}
                                  </span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {routeSalesSummary.unassignedPendingOrders.length > 0 && (
                      <div className="px-4 sm:px-5 py-2.5 bg-amber-50/70 border-t border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                          <span className="tabular-nums">
                            Existem <strong>{routeSalesSummary.unassignedPendingOrders.length}</strong> pedido(s) pendente(s) totalizando{' '}
                            <strong className="font-mono">{formatCurrency(routeSalesSummary.unassignedPendingValue)}</strong> cujo cliente ainda não está vinculado a nenhuma rota.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('rotas')}
                          className="text-xs font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer shrink-0 self-start sm:self-center"
                        >
                          Vincular Clientes às Rotas
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* PAINEL DE CONTROLE: BOTÃO NOVO ROMANEIO + FILTROS */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-800 flex items-center gap-2">
                  <span>Romaneios Cadastrados</span>
                  <span className="text-[11px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full">
                    {filteredManifests.length} de {manifests.length}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Consulte os despachos emitidos, motoristas, veículos e atualize o status das entregas.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveTab('rotas')}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer shrink-0"
                >
                  <Navigation size={14} className="text-blue-600" />
                  <span>Rotas de Entrega & Lote</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('relatorios')}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer shrink-0"
                >
                  <FileText size={14} className="text-blue-600" />
                  <span>Relatórios de Entrega</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenNewManifestModal}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
                >
                  <Plus size={16} />
                  <span>NOVO ROMANEIO DE ENTREGA</span>
                </button>
              </div>
            </div>

            {/* FILTROS DE PESQUISA */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end text-xs">
              <div className="sm:col-span-4 relative">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Buscar Romaneio:</label>
                <div className="relative flex items-center">
                  <Search size={14} className="absolute left-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Nº ROM, motorista, placa, pedido ou cliente..."
                    value={manifestSearchTerm}
                    onChange={(e) => setManifestSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500"
                  />
                  {manifestSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setManifestSearchTerm('')}
                      className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Filtrar por Rota:</label>
                <select
                  value={manifestRouteFilter}
                  onChange={(e) => setManifestRouteFilter(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                >
                  <option value="todos">Todas as Rotas ({routes.length})</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      [{r.code}] {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Status da Carga:</label>
                <select
                  value={manifestStatusFilter}
                  onChange={(e) => setManifestStatusFilter(e.target.value as any)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                >
                  <option value="todos">Todos os Status</option>
                  <option value="planejado">Planejado</option>
                  <option value="em_transito">Em Trânsito</option>
                  <option value="entregue">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Período de Saída:</label>
                <select
                  value={manifestPeriodFilter}
                  onChange={(e) => setManifestPeriodFilter(e.target.value as any)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                >
                  <option value="todos">Todo o Histórico</option>
                  <option value="hoje">Hoje</option>
                  <option value="ultimos_7_dias">Últimos 7 dias</option>
                  <option value="este_mes">Este Mês</option>
                  <option value="personalizado">Personalizado (De / Até)</option>
                </select>
              </div>
            </div>

            {manifestPeriodFilter === 'personalizado' && (
              <div className="flex items-center gap-3 pt-2 border-t border-slate-100 flex-wrap text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-600">De:</span>
                  <input
                    type="date"
                    value={manifestStartDate}
                    onChange={(e) => setManifestStartDate(e.target.value)}
                    className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-600">Até:</span>
                  <input
                    type="date"
                    value={manifestEndDate}
                    onChange={(e) => setManifestEndDate(e.target.value)}
                    className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>

          {/* LISTA DE ROMANEIOS EM CARDS ELEGANTES */}
          {filteredManifests.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
              <Truck size={40} className="mx-auto text-slate-300" />
              <h4 className="font-bold text-slate-700 text-sm">Nenhum romaneio de entrega encontrado</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Não há romaneios correspondentes aos filtros selecionados. Crie um novo romaneio adicionando os pedidos da rota estabelecida.
              </p>
              <button
                type="button"
                onClick={handleOpenNewManifestModal}
                className="mt-2 px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Criar Primeiro Romaneio
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredManifests.map((man) => {
                const route = routes.find((r) => r.id === man.routeId);
                const progressPct = man.totalOrders > 0 ? Math.round((man.totalDelivered / man.totalOrders) * 100) : 0;

                return (
                  <div
                    key={man.id}
                    className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center font-bold text-sm shrink-0">
                          <Truck size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-sm sm:text-base text-slate-900 font-mono">
                              {man.number}
                            </span>
                            {man.name ? (
                              <span className="font-extrabold text-xs sm:text-sm text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-lg">
                                {man.name}
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-slate-400">
                                (Sem nome definido)
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                                man.status === 'entregue'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : man.status === 'em_transito'
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : man.status === 'cancelado'
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {man.status === 'em_transito'
                                ? 'Em Trânsito'
                                : man.status === 'entregue'
                                ? 'Entregas Concluídas'
                                : man.status === 'planejado'
                                ? 'Planejado'
                                : 'Cancelado'}
                            </span>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Calendar size={12} />
                              <span>Saída: {man.departureDate}</span>
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-700 mt-0.5">
                            Rota: <span className="text-blue-700">{man.routeName || 'Rota Padrão'}</span>
                          </p>
                        </div>
                      </div>

                      {/* BOTÕES DE AÇÃO DO ROMANEIO */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setViewingManifestDetails(man)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                          title="Abrir detalhes e dar baixa nas entregas"
                        >
                          <Eye size={13} />
                          <span>Baixa / Ficha</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPrintManifest(man)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                          title="Imprimir manifesto de carga e fichas de entrega por cliente"
                        >
                          <Printer size={13} />
                          <span>Imprimir Ficha</span>
                        </button>

                        {/* Mudar Status Rápido */}
                        {man.status === 'planejado' && (
                          <button
                            type="button"
                            onClick={() => handleChangeManifestStatus(man, 'em_transito')}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                          >
                            Despachar Veículo
                          </button>
                        )}

                        {man.status === 'em_transito' && (
                          <button
                            type="button"
                            onClick={() => handleChangeManifestStatus(man, 'entregue')}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                          >
                            Concluir Romaneio
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleEditManifest(man)}
                          className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg"
                          title="Editar Romaneio"
                        >
                          <Edit2 size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteManifest(man)}
                          className="p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-lg transition-colors cursor-pointer"
                          title="Excluir Romaneio"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* DADOS LOGÍSTICOS E MÉTRICAS DO ROMANEIO */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                      <div>
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Motorista & Veículo</span>
                        <div className="font-bold text-slate-800 mt-0.5">{man.driverName}</div>
                        <div className="text-slate-500 font-mono text-[11px]">
                          Placa: {man.vehiclePlate} {man.vehicleModel ? `(${man.vehicleModel})` : ''}
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Progresso das Paradas</span>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full transition-all"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="font-extrabold text-slate-800 shrink-0 font-mono text-[11px]">
                            {man.totalDelivered}/{man.totalOrders} ({progressPct}%)
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-between gap-2">
                          <span>{man.totalPending} entrega(s) pendente(s)</span>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedManifestStops((prev) => ({
                                ...prev,
                                [man.id]: !prev[man.id],
                              }))
                            }
                            className="text-[11px] font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-0.5 cursor-pointer"
                            title={
                              expandedManifestStops[man.id]
                                ? 'Ocultar roteiro de paradas'
                                : 'Exibir roteiro de paradas com clientes'
                            }
                          >
                            <span>
                              {expandedManifestStops[man.id]
                                ? 'Ocultar paradas'
                                : `Ver paradas (${man.orders.length})`}
                            </span>
                            {expandedManifestStops[man.id] ? (
                              <ChevronUp size={12} />
                            ) : (
                              <ChevronDown size={12} />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Valor Total da Carga</span>
                        <div className="font-extrabold text-slate-900 text-sm font-mono mt-0.5">
                          {formatCurrency(man.totalValue)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {man.totalVolumes} volumes carregados
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold text-slate-500 uppercase block">Cobrança na Entrega</span>
                        <div className="font-extrabold text-amber-700 text-sm font-mono mt-0.5">
                          {formatCurrency(man.totalAmountToCollect)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {man.orders.filter((o) => o.paymentStatus === 'cobrar_na_entrega').length} pedido(s) a receber
                        </div>
                      </div>
                    </div>

                    {/* MINI LISTA DE PARADAS DO ROMANEIO (OCULTA POR PADRÃO) */}
                    {expandedManifestStops[man.id] && (
                    <div className="pt-1">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                        <span>Roteiro de Paradas ({man.orders.length} clientes na rota):</span>
                        <span className="text-slate-400 font-normal text-[11px]">Ordem das entregas definida</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {man.orders.map((ord) => (
                          <div
                            key={ord.orderId}
                            className={`p-2.5 rounded-xl border text-xs flex items-start justify-between gap-2 ${
                              ord.deliveryStatus === 'entregue'
                                ? 'bg-emerald-50/60 border-emerald-200'
                                : ord.deliveryStatus === 'nao_entregue'
                                ? 'bg-rose-50/60 border-rose-200'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="w-5 h-5 rounded-full bg-slate-900 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                                  {ord.sequence}º
                                </span>
                                <span className="font-extrabold text-slate-800 truncate block">
                                  {ord.customerName}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 truncate pl-6">
                                {ord.address.street}, {ord.address.number} - {ord.address.neighborhood}
                              </div>
                              <div className="text-[11px] font-mono text-slate-700 pl-6 flex items-center gap-2">
                                <span>{ord.orderNumber}</span>
                                <span>•</span>
                                <span className="font-bold">{formatCurrency(ord.totalValue)}</span>
                              </div>
                            </div>

                            <span
                              className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md shrink-0 border ${
                                ord.deliveryStatus === 'entregue'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : ord.deliveryStatus === 'nao_entregue'
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : man.status === 'em_transito'
                                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                                  : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                              }`}
                            >
                              {ord.deliveryStatus === 'entregue'
                                ? 'Entregue'
                                : ord.deliveryStatus === 'nao_entregue'
                                ? 'Não Entregue'
                                : man.status === 'em_transito'
                                ? 'Em Trânsito'
                                : 'Em Romaneio'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: ROTAS DE ENTREGA & ASSOCIAÇÃO EM LOTE */}
      {/* ========================================================================= */}
      {activeTab === 'rotas' && (
        <div
          className={
            ['pracas', 'bairros', 'cidades', 'estados'].includes(routeSubTab)
              ? 'flex-1 min-h-0 flex flex-col gap-4'
              : 'space-y-4'
          }
        >
          {/* BARRA DE NAVEGAÇÃO DE SUBMENUS: ROTAS E LOCALIDADES */}
          <div className="shrink-0 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRouteSubTab('rotas')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  routeSubTab === 'rotas'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Truck size={14} />
                <span>Rotas de Entrega</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    routeSubTab === 'rotas' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {routes.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRouteSubTab('pracas')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  routeSubTab === 'pracas'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Landmark size={14} />
                <span>Praças Comerciais</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    routeSubTab === 'pracas' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {marketAreas.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRouteSubTab('bairros')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  routeSubTab === 'bairros'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Building size={14} />
                <span>Bairros</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    routeSubTab === 'bairros' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {neighborhoods.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRouteSubTab('cidades')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  routeSubTab === 'cidades'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <MapPin size={14} />
                <span>Cidades</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    routeSubTab === 'cidades' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {cities.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRouteSubTab('estados')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  routeSubTab === 'estados'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Globe size={14} />
                <span>Estados (UF)</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    routeSubTab === 'estados' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {states.length}
                </span>
              </button>
            </div>

            {/* BOTÕES DE NOVO CADASTRO DE ACORDO COM A ABA ATIVA */}
            <div className="flex items-center gap-2">
              {routeSubTab === 'rotas' && (
                <button
                  type="button"
                  onClick={handleOpenNewRouteModal}
                  className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Plus size={15} />
                  <span>NOVA ROTA</span>
                </button>
              )}
              {routeSubTab === 'pracas' && (
                <button
                  type="button"
                  onClick={handleOpenNewMarketAreaModal}
                  className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Plus size={15} />
                  <span>NOVA PRAÇA</span>
                </button>
              )}
              {routeSubTab === 'bairros' && (
                <button
                  type="button"
                  onClick={handleOpenNewNeighborhoodModal}
                  className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Plus size={15} />
                  <span>NOVO BAIRRO</span>
                </button>
              )}
              {routeSubTab === 'cidades' && (
                <button
                  type="button"
                  onClick={handleOpenNewCityModal}
                  className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Plus size={15} />
                  <span>NOVA CIDADE</span>
                </button>
              )}
              {routeSubTab === 'estados' && (
                <button
                  type="button"
                  onClick={handleOpenNewStateModal}
                  className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Plus size={15} />
                  <span>NOVO ESTADO</span>
                </button>
              )}
            </div>
          </div>

          {routeSubTab === 'rotas' && (
            <div className="space-y-4">
              {/* BANNER DE ASSOCIAÇÃO EM LOTE (RECURSO CHAVE SOLICITADO) */}
              <div className="bg-gradient-to-br from-blue-900 via-slate-900 to-indigo-950 text-white p-5 sm:p-6 rounded-2xl shadow-lg border border-blue-800/60 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center justify-center shrink-0">
                  <Compass size={24} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg text-white flex items-center gap-2">
                    <span>Associação de Rotas em Lote</span>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full">
                      Roteirização Rápida
                    </span>
                  </h3>
                  <p className="text-xs text-blue-200 max-w-3xl leading-relaxed mt-0.5">
                    Vincule dezenas ou centenas de clientes à rota comercial de uma só vez, sem precisar entrar de um em um no cadastro individual.
                    Selecione por <strong>Cidade</strong>, <strong>Bairro</strong>, <strong>Praça Comercial</strong> ou <strong>Vendedor</strong>.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenNewRouteModal}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <Plus size={16} />
                <span>NOVA ROTA DE ENTREGA</span>
              </button>
            </div>

            {/* FORMULÁRIO DE APLICAÇÃO EM LOTE POR CRITÉRIO */}
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/15 space-y-3 text-xs">
              <span className="font-bold text-white text-xs block">
                1. Aplicar Associação Automática por Região ou Vendedor:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-bold text-blue-200 mb-1">
                    Rota de Entrega Destino:
                  </label>
                  <select
                    value={batchTargetRouteId}
                    onChange={(e) => setBatchTargetRouteId(e.target.value)}
                    className="w-full p-2.5 bg-slate-900 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-hidden focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="">Selecione a rota para vincular...</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        [{r.code}] {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-blue-200 mb-1">
                    Vincular Clientes Por:
                  </label>
                  <select
                    value={batchCriterionType}
                    onChange={(e) => setBatchCriterionType(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-900 border border-white/20 rounded-lg text-xs font-bold text-white focus:outline-hidden focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="neighborhood">Bairro</option>
                    <option value="marketArea">Praça / Região</option>
                    <option value="city">Cidade</option>
                    <option value="sellerName">Vendedor Responsável</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-blue-200 mb-1">
                    Nome do {batchCriterionType === 'neighborhood' ? 'Bairro' : batchCriterionType === 'marketArea' ? 'Praça' : batchCriterionType === 'city' ? 'Cidade' : 'Vendedor'}:
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Kalilândia, Centro, Feira de Santana, Carlos..."
                    value={batchCriterionValue}
                    onChange={(e) => setBatchCriterionValue(e.target.value)}
                    className="w-full p-2.5 bg-slate-900 border border-white/20 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400"
                  />
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={handleApplyBatchCriterion}
                    className="w-full py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-lg shadow-md transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={15} />
                    <span>Vincular em Lote</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* LISTA DE ROTAS CADASTRADAS */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-800">
                  Rotas Comerciais Ativas ({routes.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Rotas cadastradas com abrangência por municípios, bairros e motoristas recomendados.
                </p>
              </div>

              <div className="w-full sm:w-64 relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar rota..."
                  value={routeSearchTerm}
                  onChange={(e) => setRouteSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {routes
                .filter(
                  (r) =>
                    !routeSearchTerm ||
                    r.name.toLowerCase().includes(routeSearchTerm.toLowerCase()) ||
                    r.code.toLowerCase().includes(routeSearchTerm.toLowerCase())
                )
                .map((rot) => {
                  const clientCount = customers.filter((c) => c.deliveryRouteId === rot.id).length;

                  return (
                    <div
                      key={rot.id}
                      className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 bg-white transition-all space-y-3 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 font-black text-xs flex items-center justify-center border border-blue-200 shrink-0">
                            {rot.code}
                          </div>
                          <div>
                            <h4 className="font-extrabold text-sm text-slate-900 leading-snug">
                              {rot.name}
                            </h4>
                            <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                              {rot.description || 'Sem descrição cadastrada.'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditRoute(rot)}
                            className="p-1 hover:bg-slate-100 text-slate-600 rounded"
                            title="Editar Rota"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRoute(rot)}
                            className="p-1 hover:bg-rose-50 text-rose-500 rounded"
                            title="Excluir Rota"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* DETALHES DE ASSOCIAÇÃO DA ROTA */}
                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Cidades</span>
                          <span className="font-semibold text-slate-700 truncate block">
                            {rot.cities.length > 0 ? rot.cities.join(', ') : 'Não informado'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Bairros</span>
                          <span className="font-semibold text-slate-700 truncate block">
                            {rot.neighborhoods.length > 0 ? rot.neighborhoods.join(', ') : 'Não informado'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Praças</span>
                          <span className="font-semibold text-slate-700 truncate block">
                            {rot.marketAreas.length > 0 ? rot.marketAreas.join(', ') : 'Geral'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Vendedores</span>
                          <span className="font-semibold text-slate-700 truncate block">
                            {rot.sellerNames.length > 0 ? rot.sellerNames.join(', ') : 'Equipe geral'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-slate-500 flex-wrap">
                          <span>
                            Horário: <strong>{rot.estimatedDeliveryWindow || 'Dia Todo'}</strong>
                          </span>
                          <span>·</span>
                          <span className="font-mono tabular-nums">
                            Mín. Romaneio:{' '}
                            <strong className="text-slate-800">
                              {(rot.minimumOrderValue || 0) > 0
                                ? formatCurrency(rot.minimumOrderValue || 0)
                                : 'Não definido'}
                            </strong>
                          </span>
                        </div>
                        <span className="font-bold text-blue-700 text-xs">
                          {clientCount} clientes vinculados
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* TABELA DE CLIENTES COM SELEÇÃO MANUAL EM MASSA */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-800 flex items-center gap-2">
                  <span>Clientes e Rota Vinculada</span>
                  <span className="text-xs font-normal text-slate-500">
                    ({filteredCustomersForRoutes.length} clientes listados)
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Marque múltiplos clientes abaixo para vinculá-los à rota de sua escolha simultaneamente.
                </p>
              </div>

              {/* BARRA DE AÇÃO EM LOTE PARA SELEÇÃO */}
              {batchSelectedCustomerIds.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-xl flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-blue-900">
                    {batchSelectedCustomerIds.length} selecionado(s):
                  </span>
                  <select
                    value={batchTargetRouteId}
                    onChange={(e) => setBatchTargetRouteId(e.target.value)}
                    className="p-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                  >
                    <option value="">Vincular à Rota...</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleApplyBatchSelectedCustomers}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    Aplicar aos Selecionados
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchSelectedCustomerIds([])}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Limpar
                  </button>
                </div>
              )}
            </div>

            {/* FILTROS DA TABELA DE CLIENTES */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs items-center">
              <div className="sm:col-span-6 relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar por nome, bairro, cidade, praça ou vendedor..."
                  value={customerSearchTerm}
                  onChange={(e) => setCustomerSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="sm:col-span-4">
                <select
                  value={customerFilterRoute}
                  onChange={(e) => setCustomerFilterRoute(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                >
                  <option value="todos">Todos os Clientes</option>
                  <option value="sem_rota">Apenas Sem Rota Definida</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      Clientes da {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 text-right">
                <button
                  type="button"
                  onClick={() => {
                    if (batchSelectedCustomerIds.length === filteredCustomersForRoutes.length) {
                      setBatchSelectedCustomerIds([]);
                    } else {
                      setBatchSelectedCustomerIds(filteredCustomersForRoutes.map((c) => c.id));
                    }
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                  {batchSelectedCustomerIds.length === filteredCustomersForRoutes.length
                    ? 'Desmarcar Todos'
                    : 'Marcar Todos'}
                </button>
              </div>
            </div>

            {/* TABELA DE CLIENTES */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            filteredCustomersForRoutes.length > 0 &&
                            batchSelectedCustomerIds.length === filteredCustomersForRoutes.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBatchSelectedCustomerIds(filteredCustomersForRoutes.map((c) => c.id));
                            } else {
                              setBatchSelectedCustomerIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="p-3">Código / Cliente</th>
                      <th className="p-3">Bairro</th>
                      <th className="p-3">Cidade / UF</th>
                      <th className="p-3">Praça</th>
                      <th className="p-3">Vendedor</th>
                      <th className="p-3">Rota Atual de Entrega</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCustomersForRoutes.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          Nenhum cliente encontrado.
                        </td>
                      </tr>
                    ) : (
                      filteredCustomersForRoutes.map((c) => {
                        const isSelected = batchSelectedCustomerIds.includes(c.id);

                        return (
                          <tr
                            key={c.id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              isSelected ? 'bg-blue-50/50' : ''
                            }`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setBatchSelectedCustomerIds((prev) => [...prev, c.id]);
                                  } else {
                                    setBatchSelectedCustomerIds((prev) => prev.filter((id) => id !== c.id));
                                  }
                                }}
                              />
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-slate-900">{c.name}</div>
                              <div className="text-[10px] text-blue-700 font-mono">{c.code}</div>
                            </td>
                            <td className="p-3 text-slate-700 font-medium">
                              {c.neighborhood || <span className="text-slate-400 italic">Não informado</span>}
                            </td>
                            <td className="p-3 text-slate-700 font-medium">
                              {c.city ? `${c.city}/${c.state || 'BA'}` : '—'}
                            </td>
                            <td className="p-3 text-slate-700">
                              {c.marketArea ? (
                                <span className="font-semibold text-slate-800">{c.marketArea}</span>
                              ) : (
                                <span className="text-slate-400 italic">—</span>
                              )}
                            </td>
                            <td className="p-3 text-slate-700">
                              {c.sellerName || <span className="text-slate-400 italic">—</span>}
                            </td>
                            <td className="p-3">
                              {c.deliveryRouteName ? (
                                <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 text-[11px]">
                                  <Truck size={11} />
                                  <span>{c.deliveryRouteName}</span>
                                </span>
                              ) : (
                                <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 text-[10px] font-bold">
                                  Sem rota vinculada
                                </span>
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
          </div>
        </div>
      )}

          {/* ========================================================================= */}
          {/* SUB-ABA: PRAÇAS COMERCIAIS */}
          {/* ========================================================================= */}
          {routeSubTab === 'pracas' && (
            <div className="flex-1 min-h-0 flex flex-col gap-4">
              {/* CABEÇALHO E FILTROS DE PRAÇAS */}
              <div className="shrink-0 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-800 flex items-center gap-2">
                      <Landmark className="text-blue-600" size={18} />
                      <span>Praças Comerciais & Regiões de Atendimento</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Cadastre e organize praças comerciais que podem ser selecionadas no cadastro de clientes e vinculadas a rotas de entrega.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative w-full sm:w-64">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar praça ou cidade..."
                        value={marketAreaSearchTerm}
                        onChange={(e) => setMarketAreaSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* CARDS RESUMO DE PRAÇAS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
                  <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl">
                    <span className="text-[11px] font-bold text-blue-700 block">Total de Praças Cadastradas</span>
                    <span className="text-lg font-black text-blue-900">{marketAreas.length}</span>
                  </div>
                  <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl">
                    <span className="text-[11px] font-bold text-emerald-700 block">Praças Ativas</span>
                    <span className="text-lg font-black text-emerald-900">{marketAreas.filter((m) => m.active).length}</span>
                  </div>
                  <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl">
                    <span className="text-[11px] font-bold text-indigo-700 block">Com Rota Padrão Vinculada</span>
                    <span className="text-lg font-black text-indigo-900">{marketAreas.filter((m) => m.defaultRouteId).length}</span>
                  </div>
                </div>
              </div>

              {/* TABELA DE PRAÇAS */}
              <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="flex-1 min-h-[280px] overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                      <tr>
                        <th className="p-3.5">Nome da Praça Comercial</th>
                        <th className="p-3.5">Descrição</th>
                        <th className="p-3.5">Rota Padrão Vinculada</th>
                        <th className="p-3.5">Cidades Atendidas</th>
                        <th className="p-3.5 text-center">Clientes</th>
                        <th className="p-3.5 text-center">Status</th>
                        <th className="p-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMarketAreas.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400">
                            Nenhuma praça comercial encontrada para a busca informada.
                          </td>
                        </tr>
                      ) : (
                        filteredMarketAreas.map((m) => {
                          const clientCount = customers.filter(
                            (c) => (c.marketArea || '').toLowerCase() === m.name.toLowerCase()
                          ).length;
                          return (
                            <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="p-3.5 font-extrabold text-slate-800">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                                    <Landmark size={14} />
                                  </div>
                                  <span>{m.name}</span>
                                </div>
                              </td>
                              <td className="p-3.5 text-slate-600 max-w-xs">
                                {m.description || <span className="text-slate-400 italic">—</span>}
                              </td>
                              <td className="p-3.5">
                                {m.defaultRouteName ? (
                                  <span className="inline-flex items-center gap-1.5 font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 text-[11px]">
                                    <Truck size={12} />
                                    <span>{m.defaultRouteName}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[11px] italic">Nenhuma rota associada</span>
                                )}
                              </td>
                              <td className="p-3.5">
                                {m.cities && m.cities.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {m.cities.map((city, cIdx) => (
                                      <span
                                        key={cIdx}
                                        className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-[10px] font-semibold border border-slate-200"
                                      >
                                        {city}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">—</span>
                                )}
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full text-xs">
                                  {clientCount}
                                </span>
                              </td>
                              <td className="p-3.5 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                    m.active
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                                  }`}
                                >
                                  {m.active ? 'Ativa' : 'Inativa'}
                                </span>
                              </td>
                              <td className="p-3.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleEditMarketArea(m)}
                                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                                    title="Editar praça"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMarketArea(m.id, m.name)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                    title="Excluir praça"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUB-ABA: BAIRROS */}
          {/* ========================================================================= */}
          {routeSubTab === 'bairros' && (
            <div className="flex-1 min-h-0 flex flex-col gap-4">
              {/* CABEÇALHO E FILTROS DE BAIRROS */}
              <div className="shrink-0 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-800 flex items-center gap-2">
                      <Building className="text-blue-600" size={18} />
                      <span>Cadastro de Bairros</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Gerencie bairros com vinculação automática de Cidade, Praça Comercial e Rota de Entrega para agilizar o cadastro de clientes.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-48">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar bairro..."
                        value={neighborhoodSearchTerm}
                        onChange={(e) => setNeighborhoodSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-blue-500"
                      />
                    </div>

                    <select
                      value={neighborhoodStateFilter}
                      onChange={(e) => setNeighborhoodStateFilter(e.target.value)}
                      className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                    >
                      <option value="todos">Todos Estados</option>
                      {states.map((st) => (
                        <option key={st.id} value={st.uf}>
                          {st.uf}
                        </option>
                      ))}
                    </select>

                    <select
                      value={neighborhoodCityFilter}
                      onChange={(e) => setNeighborhoodCityFilter(e.target.value)}
                      className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                    >
                      <option value="todos">Todas Cidades</option>
                      {cities.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name} ({c.stateUf})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* CARDS RESUMO DE BAIRROS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
                  <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl">
                    <span className="text-[11px] font-bold text-blue-700 block">Total de Bairros</span>
                    <span className="text-lg font-black text-blue-900">{neighborhoods.length}</span>
                  </div>
                  <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl">
                    <span className="text-[11px] font-bold text-emerald-700 block">Com Rota de Entrega</span>
                    <span className="text-lg font-black text-emerald-900">
                      {neighborhoods.filter((n) => n.defaultRouteId).length}
                    </span>
                  </div>
                  <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-xl">
                    <span className="text-[11px] font-bold text-purple-700 block">Com Praça Comercial</span>
                    <span className="text-lg font-black text-purple-900">
                      {neighborhoods.filter((n) => n.marketAreaName).length}
                    </span>
                  </div>
                </div>
              </div>

              {/* TABELA DE BAIRROS */}
              <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="flex-1 min-h-[280px] overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                      <tr>
                        <th className="p-3.5">Nome do Bairro</th>
                        <th className="p-3.5">Cidade / UF</th>
                        <th className="p-3.5">Praça Comercial</th>
                        <th className="p-3.5">Rota Padrão</th>
                        <th className="p-3.5 text-center">Prefixo CEP</th>
                        <th className="p-3.5 text-center">Clientes</th>
                        <th className="p-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredNeighborhoods.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400">
                            Nenhum bairro encontrado com os filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        filteredNeighborhoods.map((n) => {
                          const clientCount = customers.filter(
                            (c) =>
                              (c.neighborhood || '').toLowerCase() === n.name.toLowerCase() &&
                              (!c.city || c.city.toLowerCase() === n.cityName.toLowerCase())
                          ).length;
                          return (
                            <tr key={n.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="p-3.5 font-extrabold text-slate-800">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                                    <Building size={14} />
                                  </div>
                                  <span>{n.name}</span>
                                </div>
                              </td>
                              <td className="p-3.5 text-slate-700">
                                <span className="font-semibold">{n.cityName}</span>
                                <span className="text-slate-400 ml-1">/ {n.stateUf}</span>
                              </td>
                              <td className="p-3.5">
                                {n.marketAreaName ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                                    <Landmark size={11} className="text-blue-600" />
                                    <span>{n.marketAreaName}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">—</span>
                                )}
                              </td>
                              <td className="p-3.5">
                                {n.defaultRouteName ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 text-[11px]">
                                    <Truck size={11} />
                                    <span>{n.defaultRouteName}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">—</span>
                                )}
                              </td>
                              <td className="p-3.5 text-center font-mono text-[11px] text-slate-600">
                                {n.zipCodePrefix || '—'}
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full text-xs">
                                  {clientCount}
                                </span>
                              </td>
                              <td className="p-3.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleEditNeighborhood(n)}
                                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                                    title="Editar bairro"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteNeighborhood(n.id, n.name)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                    title="Excluir bairro"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUB-ABA: CIDADES */}
          {/* ========================================================================= */}
          {routeSubTab === 'cidades' && (
            <div className="flex-1 min-h-0 flex flex-col gap-4">
              {/* CABEÇALHO E FILTROS DE CIDADES */}
              <div className="shrink-0 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-800 flex flex-wrap items-center gap-2">
                      <MapPin className="text-blue-600" size={18} />
                      <span>Cadastro de Cidades</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Cidades atendidas pelas operações de vendas e entregas, integradas às Praças Comerciais e Rotas de Entrega.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-56">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar cidade..."
                        value={citySearchTerm}
                        onChange={(e) => setCitySearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-blue-500"
                      />
                    </div>

                    <select
                      value={cityStateFilter}
                      onChange={(e) => setCityStateFilter(e.target.value)}
                      className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                    >
                      <option value="BA">BA - Bahia (Padrão)</option>
                      <option value="todos">Todos Estados</option>
                      {states
                        .filter((st) => st.uf !== 'BA')
                        .map((st) => (
                          <option key={st.id} value={st.uf}>
                            {st.uf} - {st.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* CARDS RESUMO DE CIDADES */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
                  <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-blue-700 block">Cidades Cadastradas</span>
                      <span className="text-lg font-black text-blue-900">{cities.length}</span>
                    </div>
                    <span className="text-[10px] font-bold text-blue-700 bg-white/80 px-2 py-1 rounded-lg border border-blue-200">
                      {cities.filter((c) => c.stateUf === 'BA').length} na Bahia
                    </span>
                  </div>
                  <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl">
                    <span className="text-[11px] font-bold text-emerald-700 block">Com Rota Padrão</span>
                    <span className="text-lg font-black text-emerald-900">
                      {cities.filter((c) => c.defaultRouteId).length}
                    </span>
                  </div>
                  <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl">
                    <span className="text-[11px] font-bold text-amber-700 block">Com Praça Comercial</span>
                    <span className="text-lg font-black text-amber-900">
                      {cities.filter((c) => c.marketAreaName).length}
                    </span>
                  </div>
                </div>
              </div>

              {/* TABELA DE CIDADES */}
              <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="flex-1 min-h-[280px] overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                      <tr>
                        <th className="p-3.5">Nome da Cidade</th>
                        <th className="p-3.5">UF</th>
                        <th className="p-3.5 text-center">Distância (Feira)</th>
                        <th className="p-3.5">Praça Comercial Padrão</th>
                        <th className="p-3.5">Rota de Entrega Padrão</th>
                        <th className="p-3.5 text-center">Bairros</th>
                        <th className="p-3.5 text-center">Cód. IBGE</th>
                        <th className="p-3.5 text-center">Clientes</th>
                        <th className="p-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCities.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400">
                            Nenhuma cidade encontrada com os filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        filteredCities.map((c) => {
                          const neighCount = neighborhoods.filter(
                            (n) => n.cityName.toLowerCase() === c.name.toLowerCase()
                          ).length;
                          const clientCount = customers.filter(
                            (cust) => (cust.city || '').toLowerCase() === c.name.toLowerCase()
                          ).length;
                          return (
                            <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="p-3.5 font-extrabold text-slate-800">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs shrink-0">
                                    <MapPin size={14} />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span>{c.name}</span>
                                    {c.isSystemDefault && (
                                      <span className="text-[9px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
                                        Padrão BA
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="p-3.5">
                                <span className="font-black bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md text-[11px] border border-slate-200">
                                  {c.stateUf}
                                </span>
                              </td>
                              <td className="p-3.5 text-center">
                                {c.distanceKm === 0 ? (
                                  <span className="font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md text-[11px]">
                                    0 km (Sede)
                                  </span>
                                ) : typeof c.distanceKm === 'number' ? (
                                  <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                                    ~{c.distanceKm} km
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">—</span>
                                )}
                              </td>
                              <td className="p-3.5">
                                {c.marketAreaName ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                                    <Landmark size={11} className="text-blue-600" />
                                    <span>{c.marketAreaName}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">—</span>
                                )}
                              </td>
                              <td className="p-3.5">
                                {c.defaultRouteName ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 text-[11px]">
                                    <Truck size={11} />
                                    <span>{c.defaultRouteName}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">—</span>
                                )}
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-xs">
                                  {neighCount}
                                </span>
                              </td>
                              <td className="p-3.5 text-center font-mono text-[11px] text-slate-500">
                                {c.ibgeCode || '—'}
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full text-xs">
                                  {clientCount}
                                </span>
                              </td>
                              <td className="p-3.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleEditCity(c)}
                                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                                    title="Editar cidade"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCity(c.id, c.name)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                    title="Excluir cidade"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUB-ABA: ESTADOS (UF) */}
          {/* ========================================================================= */}
          {routeSubTab === 'estados' && (
            <div className="flex-1 min-h-0 flex flex-col gap-4">
              {/* CABEÇALHO E FILTROS DE ESTADOS */}
              <div className="shrink-0 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-800 flex items-center gap-2">
                      <Globe className="text-blue-600" size={18} />
                      <span>Cadastro de Estados (UFs)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Unidades Federativas cadastradas no sistema que são selecionadas no endereço dos clientes e vinculam cidades e regiões.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-56">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar UF ou estado..."
                        value={stateSearchTerm}
                        onChange={(e) => setStateSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-blue-500"
                      />
                    </div>

                    <select
                      value={stateRegionFilter}
                      onChange={(e) => setStateRegionFilter(e.target.value)}
                      className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                    >
                      <option value="todos">Todas Regiões</option>
                      <option value="Nordeste">Nordeste</option>
                      <option value="Sudeste">Sudeste</option>
                      <option value="Sul">Sul</option>
                      <option value="Centro-Oeste">Centro-Oeste</option>
                      <option value="Norte">Norte</option>
                    </select>
                  </div>
                </div>

                {/* CARDS RESUMO DE ESTADOS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
                  <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl">
                    <span className="text-[11px] font-bold text-blue-700 block">Total de Estados (UFs)</span>
                    <span className="text-lg font-black text-blue-900">{states.length}</span>
                  </div>
                  <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl">
                    <span className="text-[11px] font-bold text-emerald-700 block">Estados Ativos</span>
                    <span className="text-lg font-black text-emerald-900">
                      {states.filter((st) => st.active).length}
                    </span>
                  </div>
                  <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-xl">
                    <span className="text-[11px] font-bold text-purple-700 block">Regiões Cobertas</span>
                    <span className="text-lg font-black text-purple-900">5 Macro-regiões</span>
                  </div>
                </div>
              </div>

              {/* TABELA DE ESTADOS */}
              <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="flex-1 min-h-[280px] overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                      <tr>
                        <th className="p-3.5">Sigla (UF)</th>
                        <th className="p-3.5">Nome do Estado</th>
                        <th className="p-3.5">Região</th>
                        <th className="p-3.5 text-center">Cidades Cadastradas</th>
                        <th className="p-3.5 text-center">Clientes</th>
                        <th className="p-3.5 text-center">Status</th>
                        <th className="p-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredStates.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400">
                            Nenhum estado encontrado com os filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        filteredStates.map((st) => {
                          const cityCount = cities.filter((c) => c.stateUf === st.uf).length;
                          const clientCount = customers.filter(
                            (c) => (c.state || '').toUpperCase() === st.uf
                          ).length;
                          return (
                            <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="p-3.5 font-black text-blue-700">
                                <span className="bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg font-mono text-xs">
                                  {st.uf}
                                </span>
                              </td>
                              <td className="p-3.5 font-extrabold text-slate-800">
                                {st.name}
                              </td>
                              <td className="p-3.5">
                                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                                  {st.region}
                                </span>
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-xs">
                                  {cityCount} cidade(s)
                                </span>
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full text-xs">
                                  {clientCount}
                                </span>
                              </td>
                              <td className="p-3.5 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                    st.active
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                                  }`}
                                >
                                  {st.active ? 'Ativo' : 'Inativo'}
                                </span>
                              </td>
                              <td className="p-3.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleEditState(st)}
                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                                  title="Editar estado"
                                >
                                  <Edit2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: MOTORISTAS & CONTROLE DE HABILITAÇÃO (CNH) */}
      {/* ========================================================================= */}
      {activeTab === 'motoristas' && (
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {/* KPIs */}
          <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <Users size={13} className="text-blue-600" />
                <span>Total de Motoristas</span>
              </span>
              <p className="text-xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
                {drivers.length}
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-600" />
                <span>Ativos na Operação</span>
              </span>
              <p className="text-xl font-extrabold font-mono tabular-nums text-emerald-700 mt-1">
                {drivers.filter((d) => d.status === 'ativo').length}
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <Clock size={13} className="text-amber-600" />
                <span>CNH a Vencer (30d)</span>
              </span>
              <p className="text-xl font-extrabold font-mono tabular-nums text-amber-700 mt-1">
                {fleetExpirationAlerts.expiringDrivers.length}
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-rose-600" />
                <span>CNH Vencida</span>
              </span>
              <p className="text-xl font-extrabold font-mono tabular-nums text-rose-700 mt-1">
                {fleetExpirationAlerts.expiredDrivers.length}
              </p>
            </div>
          </div>

          {/* Barra de Filtros & Ação */}
          <div className="shrink-0 bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={driverSearchTerm}
                  onChange={(e) => setDriverSearchTerm(e.target.value)}
                  placeholder="Buscar por nome, CPF, telefone ou nº CNH..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <select
                value={driverStatusFilter}
                onChange={(e) =>
                  setDriverStatusFilter(e.target.value as 'todos' | 'ativo' | 'inativo' | 'alertas')
                }
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value="todos">Todos os Status</option>
                <option value="ativo">Somente Ativos</option>
                <option value="alertas">CNH Vencida ou a Vencer</option>
                <option value="inativo">Inativos</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleOpenNewDriverModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus size={15} />
              <span>Novo Motorista</span>
            </button>
          </div>

          {/* Tabela de Motoristas */}
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex-1 min-h-[280px] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                  <tr>
                    <th className="p-3.5">Motorista & Contato</th>
                    <th className="p-3.5">CPF</th>
                    <th className="p-3.5">CNH & Categoria</th>
                    <th className="p-3.5">Validade da Habilitação</th>
                    <th className="p-3.5">Veículo Padrão</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDrivers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-400">
                        Nenhum motorista encontrado. Clique em "+ Novo Motorista" para cadastrar.
                      </td>
                    </tr>
                  ) : (
                    filteredDrivers.map((drv) => {
                      const cnhStatus = getExpirationStatus(drv.cnhExpirationDate);
                      const defVehicle = drv.defaultVehicleId
                        ? vehicles.find((v) => v.id === drv.defaultVehicleId)
                        : undefined;
                      const manifestsCount = manifests.filter(
                        (m) => m.driverId === drv.id || m.driverName.toLowerCase() === drv.name.toLowerCase()
                      ).length;

                      return (
                        <tr key={drv.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5">
                            <div className="font-extrabold text-slate-900">{drv.name}</div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                              {drv.phone && (
                                <span className="flex items-center gap-1 font-mono tabular-nums">
                                  <Phone size={11} />
                                  {drv.phone}
                                </span>
                              )}
                              <span>{manifestsCount} romaneio(s)</span>
                            </div>
                          </td>
                          <td className="p-3.5 font-mono tabular-nums text-slate-700">
                            {drv.cpf || '-'}
                          </td>
                          <td className="p-3.5">
                            <div className="font-mono font-bold text-slate-800">{drv.cnhNumber}</div>
                            <span className="inline-block mt-0.5 text-[10px] font-extrabold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                              Cat. {drv.cnhCategory}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <div className="font-mono tabular-nums font-bold text-slate-800">
                              {formatDateBr(drv.cnhExpirationDate)}
                            </div>
                            <div className="mt-1">
                              {cnhStatus.state === 'expired' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                                  <AlertTriangle size={11} />
                                  {cnhStatus.label}
                                </span>
                              ) : cnhStatus.state === 'expiring_soon' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                  <Clock size={11} />
                                  {cnhStatus.label}
                                </span>
                              ) : cnhStatus.state === 'valid' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                  <CheckCircle2 size={11} />
                                  {cnhStatus.label}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">{cnhStatus.label}</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5">
                            {defVehicle ? (
                              <div>
                                <span className="font-mono font-bold text-blue-700">{defVehicle.plate}</span>
                                <div className="text-[11px] text-slate-500">{defVehicle.model}</div>
                              </div>
                            ) : (
                              <span className="text-slate-400">Não vinculado</span>
                            )}
                          </td>
                          <td className="p-3.5 text-center">
                            {drv.status === 'ativo' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded uppercase">
                                <CheckCircle2 size={11} />
                                Ativo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded uppercase">
                                Inativo
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditDriver(drv)}
                                className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Editar Motorista"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDriverToDelete(drv)}
                                className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Excluir Motorista"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 4: VEÍCULOS & CONTROLE DE LICENCIAMENTO (CRLV) */}
      {/* ========================================================================= */}
      {activeTab === 'veiculos' && (
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {/* KPIs */}
          <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <Car size={13} className="text-blue-600" />
                <span>Total da Frota</span>
              </span>
              <p className="text-xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
                {vehicles.length}
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-600" />
                <span>Disponíveis / Ativos</span>
              </span>
              <p className="text-xl font-extrabold font-mono tabular-nums text-emerald-700 mt-1">
                {vehicles.filter((v) => v.status === 'ativo').length}
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <Wrench size={13} className="text-amber-600" />
                <span>Em Manutenção</span>
              </span>
              <p className="text-xl font-extrabold font-mono tabular-nums text-amber-700 mt-1">
                {vehicles.filter((v) => v.status === 'manutencao').length}
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-rose-600" />
                <span>Licenc. Vencido / Alerta</span>
              </span>
              <p className="text-xl font-extrabold font-mono tabular-nums text-rose-700 mt-1">
                {fleetExpirationAlerts.totalVehicleAlerts}
              </p>
            </div>
          </div>

          {/* Barra de Filtros & Ação */}
          <div className="shrink-0 bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={vehicleSearchTerm}
                  onChange={(e) => setVehicleSearchTerm(e.target.value)}
                  placeholder="Buscar por placa, modelo, tipo ou Renavam..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <select
                value={vehicleStatusFilter}
                onChange={(e) =>
                  setVehicleStatusFilter(
                    e.target.value as 'todos' | 'ativo' | 'manutencao' | 'inativo' | 'alertas'
                  )
                }
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value="todos">Todos os Status</option>
                <option value="ativo">Somente Ativos</option>
                <option value="manutencao">Em Manutenção</option>
                <option value="alertas">Licenciamento Vencido ou a Vencer</option>
                <option value="inativo">Inativos</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleOpenNewVehicleModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus size={15} />
              <span>Novo Veículo</span>
            </button>
          </div>

          {/* Tabela de Veículos */}
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex-1 min-h-[280px] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                  <tr>
                    <th className="p-3.5">Placa & Modelo</th>
                    <th className="p-3.5">Tipo / Capacidade</th>
                    <th className="p-3.5">Renavam</th>
                    <th className="p-3.5">Validade Licenciamento (CRLV)</th>
                    <th className="p-3.5">Seguro / Revisão</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVehicles.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-400">
                        Nenhum veículo encontrado. Clique em "+ Novo Veículo" para cadastrar.
                      </td>
                    </tr>
                  ) : (
                    filteredVehicles.map((veh) => {
                      const licStatus = getExpirationStatus(veh.licensingExpirationDate);
                      const insStatus = veh.insuranceExpirationDate
                        ? getExpirationStatus(veh.insuranceExpirationDate)
                        : null;
                      const manifestsCount = manifests.filter(
                        (m) =>
                          m.vehicleId === veh.id ||
                          m.vehiclePlate.toUpperCase() === veh.plate.toUpperCase()
                      ).length;

                      return (
                        <tr key={veh.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                                {veh.plate}
                              </span>
                              <span className="font-extrabold text-slate-900">{veh.model}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {veh.year ? `Ano ${veh.year} • ` : ''}
                              {manifestsCount} romaneio(s)
                            </div>
                          </td>
                          <td className="p-3.5">
                            <div className="font-semibold text-slate-800">{veh.type}</div>
                            {veh.capacityKg ? (
                              <div className="text-[11px] font-mono tabular-nums text-slate-500">
                                Cap. {veh.capacityKg.toLocaleString('pt-BR')} kg
                              </div>
                            ) : null}
                          </td>
                          <td className="p-3.5 font-mono tabular-nums text-slate-600">
                            {veh.renavam || '-'}
                          </td>
                          <td className="p-3.5">
                            <div className="font-mono tabular-nums font-bold text-slate-800">
                              {formatDateBr(veh.licensingExpirationDate)}
                            </div>
                            <div className="mt-1">
                              {licStatus.state === 'expired' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                                  <AlertTriangle size={11} />
                                  {licStatus.label}
                                </span>
                              ) : licStatus.state === 'expiring_soon' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                  <Clock size={11} />
                                  {licStatus.label}
                                </span>
                              ) : licStatus.state === 'valid' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                  <CheckCircle2 size={11} />
                                  {licStatus.label}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">{licStatus.label}</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5">
                            {veh.insuranceExpirationDate ? (
                              <div>
                                <div className="font-mono tabular-nums font-semibold text-slate-700">
                                  {formatDateBr(veh.insuranceExpirationDate)}
                                </div>
                                {insStatus && (insStatus.state === 'expired' || insStatus.state === 'expiring_soon') && (
                                  <span
                                    className={`inline-flex items-center gap-1 text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded border ${
                                      insStatus.state === 'expired'
                                        ? 'text-rose-700 bg-rose-50 border-rose-200'
                                        : 'text-amber-800 bg-amber-50 border-amber-200'
                                    }`}
                                  >
                                    <AlertTriangle size={10} />
                                    {insStatus.shortLabel}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-3.5 text-center">
                            {veh.status === 'ativo' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded uppercase">
                                <CheckCircle2 size={11} />
                                Ativo
                              </span>
                            ) : veh.status === 'manutencao' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded uppercase">
                                <Wrench size={11} />
                                Manutenção
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded uppercase">
                                Inativo
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditVehicle(veh)}
                                className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Editar Veículo"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setVehicleToDelete(veh)}
                                className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Excluir Veículo"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 5: RELATÓRIOS DE EXPEDIÇÃO */}
      {/* ========================================================================= */}
      {activeTab === 'relatorios' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-800 flex items-center gap-2">
                  <FileText className="text-blue-600" size={18} />
                  <span>Relatórios de Expedição e Entregas</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Emita o mapa consolidado de produtos para separação no armazém e a lista detalhada de entregas por cliente.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={15} />
                  <span>Imprimir Relatório</span>
                </button>
              </div>
            </div>

            {/* SELEÇÃO DO TIPO DE RELATÓRIO E FILTROS */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs items-end">
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Tipo de Relatório:</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as any)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-blue-700"
                >
                  <option value="entregas_por_cliente">1. Entregas e Produtos Separados por Cliente</option>
                  <option value="produtos_consolidados">2. Mapa de Carga (Produtos Consolidados para Separação)</option>
                  <option value="desempenho_romaneios">3. Extrato Consolidado de Romaneios</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Filtrar Romaneio:</label>
                <select
                  value={reportManifestFilter}
                  onChange={(e) => setReportManifestFilter(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                >
                  <option value="todos">Todos os Romaneios</option>
                  {manifests.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.number}{m.name ? ` - ${m.name}` : ''} ({m.departureDate} - {m.routeName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Filtrar por Rota:</label>
                <select
                  value={reportRouteFilter}
                  onChange={(e) => setReportRouteFilter(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                >
                  <option value="todos">Todas as Rotas</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar no relatório..."
                    value={reportSearchTerm}
                    onChange={(e) => setReportSearchTerm(e.target.value)}
                    className="w-full pl-7 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* RELATÓRIO 1: MAPA CONSOLIDADO DE PRODUTOS */}
          {reportType === 'produtos_consolidados' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 print:shadow-none print:border-none">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 flex-wrap gap-2">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-800">
                    Mapa de Carga e Separação de Produtos (Caminhão)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Soma consolidada de todos os produtos para retirada no estoque e conferência de carregamento.
                  </p>
                </div>
                <div className="text-right text-xs">
                  <span className="font-bold text-slate-700">Total de Itens Distintos: </span>
                  <span className="font-extrabold text-blue-700">{consolidatedReportProducts.length} produtos</span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl max-h-[65vh] overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                    <tr>
                      <th className="p-3">Código</th>
                      <th className="p-3">Produto / Descrição</th>
                      <th className="p-3 text-center">Unidade</th>
                      <th className="p-3 text-right">Qtd Total para Carregar</th>
                      <th className="p-3 text-center">Clientes Atendidos</th>
                      <th className="p-3 text-right">Valor Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {consolidatedReportProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          Nenhum produto encontrado para os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      consolidatedReportProducts.map((p) => (
                        <tr key={p.productId} className="hover:bg-slate-50/80">
                          <td className="p-3 font-mono font-bold text-blue-700">{p.productCode}</td>
                          <td className="p-3 font-semibold text-slate-800">{p.description}</td>
                          <td className="p-3 text-center font-bold text-slate-600">{p.unit}</td>
                          <td className="p-3 text-right font-black text-slate-900 text-sm">
                            {formatQuantity(p.quantity)} {p.unit}
                          </td>
                          <td className="p-3 text-center">
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                              {p.customerCount.size} cliente(s)
                            </span>
                          </td>
                          <td className="p-3 text-right font-extrabold text-slate-900 font-mono">
                            {formatCurrency(p.totalValue)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* RELATÓRIO 2: ENTREGAS SEPARADAS POR CLIENTE (COM PRODUTOS) */}
          {reportType === 'entregas_por_cliente' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 print:shadow-none print:border-none">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 flex-wrap gap-2">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-800">
                    Relação Detalhada de Entregas e Produtos por Cliente
                  </h4>
                  <p className="text-xs text-slate-500">
                    Lista organizada por cliente com endereço completo, pedidos, insumos entregues e valores a receber.
                  </p>
                </div>
                <div className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                  {clientDeliveriesReport.length} entregas listadas
                </div>
              </div>

              {clientDeliveriesReport.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Nenhuma entrega encontrada para os critérios selecionados.
                </div>
              ) : (
                <div className="space-y-4">
                  {clientDeliveriesReport.map((entry, idx) => {
                    const ord = entry.order;

                    return (
                      <div
                        key={ord.orderId + idx}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                      >
                        {/* CABEÇALHO DO CLIENTE */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-sm text-slate-900">
                                {ord.sequence}º Parada: {ord.customerName}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 font-bold">
                                [{ord.customerCode || 'CLI'}]
                              </span>
                              <span
                                className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                  ord.deliveryStatus === 'entregue'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : ord.deliveryStatus === 'nao_entregue'
                                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                                    : 'bg-amber-100 text-amber-800 border-amber-200'
                                }`}
                              >
                                {ord.deliveryStatus.toUpperCase()}
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 mt-0.5">
                              {ord.address.street}, {ord.address.number} - {ord.address.neighborhood},{' '}
                              {ord.address.city}/{ord.address.state} • Praça: <strong>{ord.marketArea || 'Geral'}</strong>
                            </p>
                          </div>

                          <div className="text-right text-xs">
                            <div className="font-extrabold text-slate-900 font-mono text-sm">
                              {formatCurrency(ord.totalValue)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {ord.paymentStatus === 'cobrar_na_entrega' ? (
                                <span className="text-amber-700 font-bold">
                                  Cobrar na entrega ({formatCurrency(ord.amountToCollect || ord.totalValue)})
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-bold">Pago antecipado</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* TABELA DE PRODUTOS ENTREGUES AO CLIENTE */}
                        <div className="bg-white rounded-lg border border-slate-200/80 overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 font-bold text-[10px] uppercase">
                              <tr>
                                <th className="p-2">Código</th>
                                <th className="p-2">Produto Entregue</th>
                                <th className="p-2 text-center">Unidade</th>
                                <th className="p-2 text-right">Qtd</th>
                                <th className="p-2 text-right">Unitário</th>
                                <th className="p-2 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {ord.items.map((it) => (
                                <tr key={it.productId}>
                                  <td className="p-2 font-mono text-blue-700 font-bold">{it.productCode}</td>
                                  <td className="p-2 font-medium text-slate-800">{it.description}</td>
                                  <td className="p-2 text-center font-bold text-slate-500">{it.unit}</td>
                                  <td className="p-2 text-right font-black text-slate-900">
                                    {formatQuantity(it.quantity)}
                                  </td>
                                  <td className="p-2 text-right text-slate-600">{formatCurrency(it.unitPrice)}</td>
                                  <td className="p-2 text-right font-extrabold text-slate-900 font-mono">
                                    {formatCurrency(it.totalPrice)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* RODAPÉ DO CLIENTE (VENDEDOR, ROMANEIO E MOTORISTA) */}
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                          <div>
                            Romaneio: <strong>{entry.manifestNumber}</strong> • Rota: <strong>{entry.routeName}</strong>
                          </div>
                          <div>
                            Motorista: <strong>{entry.driverName}</strong> ({entry.vehiclePlate}) • Vendedor:{' '}
                            <strong>{ord.sellerName || 'Geral'}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* RELATÓRIO 3: DESEMPENHO DOS ROMANEIOS */}
          {reportType === 'desempenho_romaneios' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h4 className="font-extrabold text-sm text-slate-800">
                Extrato Analítico de Romaneios e Cargas
              </h4>

              <div className="border border-slate-200 rounded-xl max-h-[65vh] overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                    <tr>
                      <th className="p-3">Romaneio</th>
                      <th className="p-3">Data Saída</th>
                      <th className="p-3">Rota</th>
                      <th className="p-3">Motorista / Placa</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">Entregas</th>
                      <th className="p-3 text-right">Valor Total Carga</th>
                      <th className="p-3 text-right">A Cobrar na Rota</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredManifests.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/80">
                        <td className="p-3 font-mono font-bold text-blue-700">{m.number}</td>
                        <td className="p-3 text-slate-700">{m.departureDate}</td>
                        <td className="p-3 font-semibold text-slate-800">{m.routeName}</td>
                        <td className="p-3 text-slate-700">
                          {m.driverName} ({m.vehiclePlate})
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              m.status === 'entregue'
                                ? 'bg-emerald-100 text-emerald-800'
                                : m.status === 'em_transito'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td className="p-3 text-center font-extrabold text-slate-800">
                          {m.totalDelivered} / {m.totalOrders}
                        </td>
                        <td className="p-3 text-right font-extrabold text-slate-900 font-mono">
                          {formatCurrency(m.totalValue)}
                        </td>
                        <td className="p-3 text-right font-bold text-amber-700 font-mono">
                          {formatCurrency(m.totalAmountToCollect)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: NOVO / EDITAR ROMANEIO DE ENTREGA (COM MONTAGEM PRÁTICA) */}
      {/* ========================================================================= */}
      {isNewManifestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveManifest}
            className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                  <Truck size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    {editingManifest ? `Editar Romaneio ${editingManifest.number}` : 'Novo Romaneio de Entrega'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Preencha os dados da viagem e adicione os pedidos para a rota de entrega.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsNewManifestModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* SEÇÃO 1: CABEÇALHO DO ROMANEIO (ROTA, DATA, MOTORISTA, VEÍCULO) */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
              <span className="font-bold text-slate-700 text-xs block uppercase tracking-wide">
                1. Informações da Carga e Transporte:
              </span>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nome do Romaneio de Entrega
                </label>
                <input
                  type="text"
                  value={formManifestName}
                  onChange={(e) => setFormManifestName(e.target.value)}
                  placeholder="Ex: Entrega Manhã Feira Sede, Rota Recôncavo Sexta-feira..."
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Data de Saída Prevista *</label>
                  <input
                    type="date"
                    required
                    value={formDepartureDate}
                    onChange={(e) => setFormDepartureDate(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block font-bold text-slate-700">Rota Comercial de Entrega *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewManifestModalOpen(false);
                        setActiveTab('rotas');
                      }}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                      title="Abrir submenu Rotas de Entrega para associar clientes em lote"
                    >
                      + Configurar Rotas / Lote
                    </button>
                  </div>
                  <select
                    required
                    value={formRouteId}
                    onChange={(e) => setFormRouteId(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-blue-700"
                  >
                    <option value="">Selecione uma Rota...</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        [{r.code}] {r.name}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const selectedSummary = routeSalesSummary.items.find(
                      (it) => it.route.id === formRouteId
                    );
                    if (!selectedSummary) return null;
                    const draftValue = manifestOrdersDraft.reduce((s, o) => s + o.totalValue, 0);
                    const minVal = selectedSummary.minimumValue;
                    const referenceValue = draftValue > 0 ? draftValue : selectedSummary.pendingValue;
                    const pct = minVal > 0 ? Math.round((referenceValue / minVal) * 100) : 100;
                    const reached = minVal === 0 || referenceValue >= minVal;
                    return (
                      <div className="mt-1.5 text-[11px] flex items-center justify-between gap-2 text-slate-600 font-mono tabular-nums">
                        <span>
                          {draftValue > 0 ? 'Carga atual:' : 'Pendente na rota:'}{' '}
                          <strong className="text-slate-900">{formatCurrency(referenceValue)}</strong>
                        </span>
                        {minVal > 0 && (
                          <span className={reached ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                            Meta: {formatCurrency(minVal)} ({pct}%)
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block font-bold text-slate-700">Motorista / Entregador *</label>
                    <button
                      type="button"
                      onClick={handleOpenNewDriverModal}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                    >
                      + Novo Motorista
                    </button>
                  </div>
                  <select
                    value={formDriverId}
                    onChange={(e) => handleDriverSelectionChange(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                  >
                    <option value="">Selecione um Motorista...</option>
                    {drivers
                      .filter((d) => d.status === 'ativo' || d.id === formDriverId)
                      .map((drv) => {
                        const cnh = getExpirationStatus(drv.cnhExpirationDate);
                        const alertSuffix =
                          cnh.state === 'expired'
                            ? ' [CNH VENCIDA]'
                            : cnh.state === 'expiring_soon'
                            ? ` [CNH ${cnh.shortLabel}]`
                            : '';
                        return (
                          <option key={drv.id} value={drv.id}>
                            {drv.name} (CNH {drv.cnhCategory}){alertSuffix}
                          </option>
                        );
                      })}
                    <option value="__manual__">Outro / Digitar manualmente</option>
                  </select>
                  {formDriverId === '__manual__' && (
                    <input
                      type="text"
                      required
                      value={formDriverName}
                      onChange={(e) => setFormDriverName(e.target.value)}
                      placeholder="Nome do motorista"
                      className="w-full p-2 mt-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  )}
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block font-bold text-slate-700">Veículo / Placa *</label>
                    <button
                      type="button"
                      onClick={handleOpenNewVehicleModal}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                    >
                      + Novo Veículo
                    </button>
                  </div>
                  <select
                    value={formVehicleId}
                    onChange={(e) => handleVehicleSelectionChange(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                  >
                    <option value="">Selecione um Veículo...</option>
                    {vehicles
                      .filter((v) => v.status !== 'inativo' || v.id === formVehicleId)
                      .map((veh) => {
                        const lic = getExpirationStatus(veh.licensingExpirationDate);
                        const statusTag =
                          veh.status === 'manutencao'
                            ? ' [MANUTENÇÃO]'
                            : lic.state === 'expired'
                            ? ' [CRLV VENCIDO]'
                            : lic.state === 'expiring_soon'
                            ? ` [CRLV ${lic.shortLabel}]`
                            : '';
                        return (
                          <option key={veh.id} value={veh.id}>
                            {veh.plate} — {veh.model}
                            {statusTag}
                          </option>
                        );
                      })}
                    <option value="__manual__">Outro / Digitar manualmente</option>
                  </select>
                  {formVehicleId === '__manual__' && (
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                      <input
                        type="text"
                        required
                        value={formVehiclePlate}
                        onChange={(e) => setFormVehiclePlate(e.target.value.toUpperCase())}
                        placeholder="Placa (BRA-2E19)"
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                      />
                      <input
                        type="text"
                        value={formVehicleModel}
                        onChange={(e) => setFormVehicleModel(e.target.value)}
                        placeholder="Modelo"
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Alerta de vencimento/manutenção para o motorista ou veículo selecionado */}
              {(() => {
                const selectedDrv = drivers.find((d) => d.id === formDriverId);
                const selectedVeh = vehicles.find((v) => v.id === formVehicleId);
                const drvExp = selectedDrv ? getExpirationStatus(selectedDrv.cnhExpirationDate) : null;
                const vehExp = selectedVeh ? getExpirationStatus(selectedVeh.licensingExpirationDate) : null;
                const hasDrvIssue = drvExp && (drvExp.state === 'expired' || drvExp.state === 'expiring_soon');
                const hasVehIssue =
                  (vehExp && (vehExp.state === 'expired' || vehExp.state === 'expiring_soon')) ||
                  selectedVeh?.status === 'manutencao';

                if (!hasDrvIssue && !hasVehIssue) return null;

                const isCritical = drvExp?.state === 'expired' || vehExp?.state === 'expired';
                return (
                  <div
                    className={`p-2.5 rounded-lg border flex items-start gap-2 text-[11px] ${
                      isCritical
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      {hasDrvIssue && selectedDrv && drvExp && (
                        <div>
                          <strong>Motorista {selectedDrv.name}:</strong> CNH ({selectedDrv.cnhNumber}) com{' '}
                          <strong>{drvExp.label.toLowerCase()}</strong> (venc.{' '}
                          {formatDateBr(selectedDrv.cnhExpirationDate)}).
                        </div>
                      )}
                      {selectedVeh?.status === 'manutencao' && (
                        <div>
                          <strong>Veículo {selectedVeh.plate}:</strong> encontra-se marcado como{' '}
                          <strong>Em Manutenção</strong>.
                        </div>
                      )}
                      {vehExp && (vehExp.state === 'expired' || vehExp.state === 'expiring_soon') && selectedVeh && (
                        <div>
                          <strong>Veículo {selectedVeh.plate}:</strong> Licenciamento (CRLV) com{' '}
                          <strong>{vehExp.label.toLowerCase()}</strong> (venc.{' '}
                          {formatDateBr(selectedVeh.licensingExpirationDate)}).
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Telefone do Motorista (WhatsApp)</label>
                  <input
                    type="text"
                    value={formDriverPhone}
                    onChange={(e) => setFormDriverPhone(e.target.value)}
                    placeholder="(75) 98765-4321"
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Observações da Carga</label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Instruções de entrega, docas ou conferência..."
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>
            </div>

            {/* SEÇÃO 2: SELEÇÃO DE PEDIDOS DISPONÍVEIS DA ROTA */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1 border-b border-slate-100 gap-2">
                <div>
                  <span className="font-extrabold text-xs text-slate-800 uppercase block">
                    2. Selecionar Pedidos Disponíveis para a Rota:
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {eligibleOrdersForDraft.length} pedido(s) apto(s) para entrega
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orderSelectionFilterOnlyRoute}
                      onChange={(e) => setOrderSelectionFilterOnlyRoute(e.target.checked)}
                      className="rounded"
                    />
                    <span className="font-bold">Apenas da Rota Selecionada</span>
                  </label>

                  <input
                    type="text"
                    placeholder="Buscar pedido ou cliente..."
                    value={orderSelectionSearch}
                    onChange={(e) => setOrderSelectionSearch(e.target.value)}
                    className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs w-48"
                  />

                  {eligibleOrdersForDraft.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleAddOrdersToDraft(eligibleOrdersForDraft)}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      + Adicionar Todos ({eligibleOrdersForDraft.length})
                    </button>
                  )}
                </div>
              </div>

              {eligibleOrdersForDraft.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                  Nenhum pedido pendente de entrega encontrado para esta rota no momento. Desmarque o filtro de rota acima para ver pedidos de outras regiões.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] sticky top-0">
                      <tr>
                        <th className="p-2.5 w-8 text-center">
                          <input
                            type="checkbox"
                            checked={
                              selectedOrderIdsForManifest.length === eligibleOrdersForDraft.length &&
                              eligibleOrdersForDraft.length > 0
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedOrderIdsForManifest(eligibleOrdersForDraft.map((o) => o.id));
                              } else {
                                setSelectedOrderIdsForManifest([]);
                              }
                            }}
                          />
                        </th>
                        <th className="p-2.5">Pedido</th>
                        <th className="p-2.5">Cliente</th>
                        <th className="p-2.5">Bairro / Cidade</th>
                        <th className="p-2.5 text-center">Status Atual</th>
                        <th className="p-2.5 text-center">Itens</th>
                        <th className="p-2.5 text-right">Valor</th>
                        <th className="p-2.5 text-center">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {eligibleOrdersForDraft.map((ord) => {
                        const client = customers.find((c) => c.id === ord.customerId || c.name === ord.customerName);
                        const isChecked = selectedOrderIdsForManifest.includes(ord.id);
                        const statusLabel =
                          ord.status === 'concluido'
                            ? 'Concluído'
                            : ord.status === 'aprovado'
                            ? 'Aprovado'
                            : ord.status === 'convertido_em_venda'
                            ? 'Convertido'
                            : ord.status === 'em_romaneio'
                            ? 'Em Romaneio'
                            : ord.status === 'em_transito'
                            ? 'Em Trânsito'
                            : ord.status === 'entregue'
                            ? 'Entregue'
                            : ord.status === 'nao_entregue'
                            ? 'Não Entregue'
                            : ord.status === 'aberto'
                            ? 'Aberto'
                            : ord.status;

                        return (
                          <tr key={ord.id} className="hover:bg-slate-50">
                            <td className="p-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedOrderIdsForManifest((prev) => [...prev, ord.id]);
                                  } else {
                                    setSelectedOrderIdsForManifest((prev) => prev.filter((id) => id !== ord.id));
                                  }
                                }}
                              />
                            </td>
                            <td className="p-2.5 font-mono font-bold text-blue-700">{ord.number}</td>
                            <td className="p-2.5 font-semibold text-slate-800">{ord.customerName}</td>
                            <td className="p-2.5 text-slate-600">
                              {client?.neighborhood || 'Centro'}, {client?.city || 'Feira de Santana'}
                            </td>
                            <td className="p-2.5 text-center">
                              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {statusLabel}
                              </span>
                            </td>
                            <td className="p-2.5 text-center font-bold text-slate-700">
                              {ord.items.reduce((s, it) => s + it.quantity, 0)} un
                            </td>
                            <td className="p-2.5 text-right font-extrabold text-slate-900 font-mono">
                              {formatCurrency(ord.total)}
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleAddOrdersToDraft([ord])}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] rounded cursor-pointer"
                              >
                                + Adicionar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedOrderIdsForManifest.length > 0 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const toAdd = eligibleOrdersForDraft.filter((o) =>
                        selectedOrderIdsForManifest.includes(o.id)
                      );
                      handleAddOrdersToDraft(toAdd);
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs"
                  >
                    Adicionar {selectedOrderIdsForManifest.length} Pedido(s) Selecionado(s)
                  </button>
                </div>
              )}
            </div>

            {/* SEÇÃO 3: PEDIDOS INCLUSOS NO ROMANEIO (SEQUÊNCIA DA ROTA) */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-extrabold text-xs text-slate-900 uppercase block">
                    3. Roteiro e Ordem das Paradas ({manifestOrdersDraft.length} pedidos no romaneio):
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Use os botões de subir e descer para ordenar a sequência que o motorista fará a entrega.
                  </p>
                </div>

                <div className="text-right text-xs">
                  <span className="font-bold text-slate-600">Carga Total: </span>
                  <span className="font-black text-slate-900 font-mono text-sm">
                    {formatCurrency(manifestOrdersDraft.reduce((s, o) => s + o.totalValue, 0))}
                  </span>
                </div>
              </div>

              {manifestOrdersDraft.length === 0 ? (
                <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-center text-xs text-amber-800">
                  Nenhum pedido adicionado ao romaneio ainda. Selecione os pedidos acima para montar a rota.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {manifestOrdersDraft.map((ord, idx) => (
                    <div
                      key={ord.orderId}
                      className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                          {ord.sequence}º
                        </div>
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-slate-900 truncate block">
                              {ord.customerName}
                            </span>
                            <span className="font-mono text-blue-700 font-bold">[{ord.orderNumber}]</span>
                            <span
                              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                                ord.deliveryStatus === 'entregue'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : ord.deliveryStatus === 'nao_entregue'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : editingManifest?.status === 'em_transito'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              }`}
                            >
                              {ord.deliveryStatus === 'entregue'
                                ? 'Entregue'
                                : ord.deliveryStatus === 'nao_entregue'
                                ? 'Não Entregue'
                                : editingManifest?.status === 'em_transito'
                                ? 'Em Trânsito'
                                : 'Em Romaneio'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {ord.address.street}, {ord.address.number} - {ord.address.neighborhood}, {ord.address.city}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="font-extrabold text-slate-900 font-mono">
                            {formatCurrency(ord.totalValue)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {ord.paymentStatus === 'cobrar_na_entrega' ? 'Cobrar na entrega' : 'Pago antecipado'}
                          </div>
                        </div>

                        {/* Controles de Sequência */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveOrderSequence(idx, 'up')}
                            className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded cursor-pointer"
                            title="Subir ordem da entrega"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === manifestOrdersDraft.length - 1}
                            onClick={() => handleMoveOrderSequence(idx, 'down')}
                            className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded cursor-pointer"
                            title="Descer ordem da entrega"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveOrderFromDraft(ord.orderId)}
                            className="p-1 hover:bg-rose-50 text-rose-500 rounded cursor-pointer ml-1"
                            title="Remover deste romaneio"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* BOTÕES DE FINALIZAÇÃO */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-500">
                Total de volumes estimados:{' '}
                <strong>{manifestOrdersDraft.reduce((acc, o) => acc + (o.volumesCount || 1), 0)} caixas/volumes</strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewManifestModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={manifestOrdersDraft.length === 0}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {editingManifest ? 'SALVAR ALTERAÇÕES' : 'CONFIRMAR E GERAR ROMANEIO'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DETALHES DO ROMANEIO & BAIXA DAS ENTREGAS */}
      {/* ========================================================================= */}
      {viewingManifestDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-base text-slate-900">
                    Ficha & Baixa de Entregas: {viewingManifestDetails.number}
                    {viewingManifestDetails.name ? ` — ${viewingManifestDetails.name}` : ''}
                  </h3>
                  <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                    {viewingManifestDetails.routeName}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Motorista: <strong>{viewingManifestDetails.driverName}</strong> • Placa: {viewingManifestDetails.vehiclePlate}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setViewingManifestDetails(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* LISTA DE PARADAS PARA BAIXA */}
            <div className="space-y-3">
              {viewingManifestDetails.orders.map((ord) => (
                <div
                  key={ord.orderId}
                  className={`p-4 rounded-xl border text-xs space-y-2.5 transition-all ${
                    ord.deliveryStatus === 'entregue'
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : ord.deliveryStatus === 'nao_entregue'
                      ? 'bg-rose-50/70 border-rose-200'
                      : 'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0">
                        {ord.sequence}º
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-slate-900">
                          {ord.customerName}{' '}
                          <span className="font-mono text-blue-700 text-xs font-bold">[{ord.orderNumber}]</span>
                        </div>
                        <div className="text-slate-600">
                          {ord.address.street}, {ord.address.number} - {ord.address.neighborhood}, {ord.address.city}/{ord.address.state}
                        </div>
                        {ord.customerPhone && (
                          <div className="text-slate-500 text-[11px] flex items-center gap-1 mt-0.5">
                            <Phone size={11} />
                            <span>{ord.customerPhone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-extrabold text-slate-900 font-mono text-sm">
                        {formatCurrency(ord.totalValue)}
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                          ord.deliveryStatus === 'entregue'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : ord.deliveryStatus === 'nao_entregue'
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        {ord.deliveryStatus === 'entregue'
                          ? 'Entregue com Sucesso'
                          : ord.deliveryStatus === 'nao_entregue'
                          ? `Ocorrência: ${ord.deliveryFailureReason || 'Não entregue'}`
                          : 'Aguardando Entrega'}
                      </span>
                    </div>
                  </div>

                  {/* ITENS DESTE PEDIDO */}
                  <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/80 text-[11px]">
                    <span className="font-bold text-slate-500 uppercase text-[9px] block mb-1">
                      Mercadorias a entregar:
                    </span>
                    <div className="space-y-1">
                      {ord.items.map((it) => (
                        <div key={it.productId} className="flex justify-between items-center text-slate-700">
                          <span>
                            {formatQuantity(it.quantity)} {it.unit} • {it.description}
                          </span>
                          <span className="font-mono font-semibold">{formatCurrency(it.totalPrice)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* BOTÕES DE BAIXA / CONFIRMAÇÃO */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 flex-wrap gap-2">
                    <div className="text-[11px] text-slate-500">
                      {ord.deliveredAt ? (
                        <span>Concluído em: {new Date(ord.deliveredAt).toLocaleTimeString()}</span>
                      ) : (
                        <span>Pendente de baixa</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateOrderStatus(viewingManifestDetails.id, ord.orderId, 'entregue')
                        }
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 size={13} />
                        <span>Confirmar Entrega</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const reason = prompt('Informe o motivo da não entrega:', 'Cliente Ausente');
                          if (reason !== null) {
                            handleUpdateOrderStatus(
                              viewingManifestDetails.id,
                              ord.orderId,
                              'nao_entregue',
                              reason || 'Cliente ausente'
                            );
                          }
                        }}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer"
                      >
                        <AlertTriangle size={13} />
                        <span>Registrar Ocorrência</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleDeleteManifest(viewingManifestDetails)}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Excluir este romaneio e liberar os pedidos"
              >
                <Trash2 size={14} />
                <span>Excluir Romaneio</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrintManifest(viewingManifestDetails)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                  title="Imprimir ficha de expedição deste manifesto"
                >
                  <Printer size={15} />
                  <span>Imprimir Ficha</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingManifestDetails(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer"
                >
                  Fechar Ficha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal In-App de Confirmação de Exclusão de Romaneio */}
      {manifestToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Excluir Romaneio de Carga?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Tem certeza de que deseja excluir o romaneio <strong>{manifestToDelete.number}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Número do Romaneio:</span>
                <span className="font-mono font-bold text-blue-700">{manifestToDelete.number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Rota / Região:</span>
                <span className="font-semibold text-slate-800">{manifestToDelete.routeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Motorista:</span>
                <span className="font-medium text-slate-700">{manifestToDelete.driverName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pedidos Vinculados:</span>
                <span className="font-bold text-indigo-700">{manifestToDelete.orders?.length || 0} pedido(s) serão liberados</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Valor Total:</span>
                <span className="font-extrabold text-slate-900 font-mono">{formatCurrency(manifestToDelete.totalValue)}</span>
              </div>
              {manifestToDelete.status !== 'entregue' && (
                <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                  {manifestToDelete.status === 'planejado'
                    ? 'A carga ainda não saiu da empresa: ao excluir este romaneio, todos os pedidos retornarão ao seu status de origem anterior à inclusão no romaneio.'
                    : 'Este romaneio ainda não foi finalizado: os pedidos ainda não entregues retornarão ao seu status de origem anterior.'}
                </div>
              )}
            </div>

            <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setManifestToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteManifest}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
                <span>Sim, Excluir Romaneio</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: IMPRESSÃO DE ROMANEIO (MANIFESTO + FICHA DE CLIENTES COM CANHOTO) */}
      {/* ========================================================================= */}
      {printManifest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto printable-expedition-modal-root">
          {/* CSS para Impressão com Quebra de Página entre Roteiro e Conferência do Armazém */}
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 10mm 12mm 12mm 12mm;
              }
              html, body {
                height: auto !important;
                min-height: 100% !important;
                overflow: visible !important;
                background: white !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              body * {
                visibility: hidden !important;
              }
              .printable-expedition-modal-root,
              .printable-expedition-modal-root * {
                visibility: visible !important;
              }
              .printable-expedition-modal-root {
                position: static !important;
                padding: 0 !important;
                margin: 0 !important;
                background: white !important;
                overflow: visible !important;
                display: block !important;
                height: auto !important;
                max-height: none !important;
              }
              .printable-expedition-modal-card {
                position: static !important;
                max-width: 100% !important;
                width: 100% !important;
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
                overflow: visible !important;
                max-height: none !important;
                display: block !important;
              }
              .printable-expedition-manifest {
                position: static !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
                display: block !important;
              }
              .print-hidden {
                display: none !important;
              }
              .manifest-page-1 {
                page-break-after: always !important;
                break-after: page !important;
                display: block !important;
              }
              .manifest-page-2 {
                page-break-before: always !important;
                break-before: page !important;
                clear: both !important;
                display: block !important;
                padding-top: 5mm !important;
              }
            }
          `}</style>

          <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6 max-h-[94vh] overflow-y-auto printable-expedition-modal-card">
            {/* AÇÕES DE IMPRESSÃO */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pb-4 border-b border-slate-200 print-hidden">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <Printer size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Ficha de Expedição & Manifesto de Carga
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Página 1: Roteiro por Cliente • Página 2: Conferência Consolidada do Armazém
                  </span>
                </div>
              </div>

              {/* Seletor de Escopo de Impressão */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPrintManifestScope('all')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    printManifestScope === 'all'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Imprime o Roteiro e a Conferência do Armazém em páginas A4 separadas"
                >
                  📄 Ficha Completa (2 Págs)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintManifestScope('roteiro')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    printManifestScope === 'roteiro'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Imprime apenas a Página 1: Roteiro de Entregas por Cliente"
                >
                  📍 Somente Roteiro
                </button>
                <button
                  type="button"
                  onClick={() => setPrintManifestScope('conferencia')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    printManifestScope === 'conferencia'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Imprime apenas a Página 2: Relação Consolidada para Carregamento (Armazém)"
                >
                  📦 Somente Armazém
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                  title="Imprimir com quebra de página automática em folha A4"
                >
                  <Printer size={15} />
                  <span>
                    {printManifestScope === 'all'
                      ? 'Imprimir Ficha Completa'
                      : printManifestScope === 'roteiro'
                      ? 'Imprimir Roteiro'
                      : 'Imprimir Armazém'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintManifest(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* AVISO DE CONFIGURAÇÃO DE QUEBRA DE PÁGINA (NA TELA) */}
            {printManifestScope === 'all' && (
              <div className="print-hidden bg-blue-50/80 border border-blue-200 text-blue-900 p-3 rounded-xl text-xs flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-blue-600 shrink-0" />
                  <span>
                    <strong>Páginas Separadas:</strong> A <em>Relação Consolidada de Produtos para Carregamento (Conferência Armazém)</em> sairá automaticamente em uma página separada após o <em>Roteiro de Entregas por Cliente</em>.
                  </span>
                </div>
                <span className="hidden sm:inline-block text-[11px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md shrink-0">
                  Formato A4 • 2 Páginas
                </span>
              </div>
            )}

            {/* CONTEÚDO PRONTO PARA IMPRESSÃO */}
            <div className="printable-expedition-manifest space-y-6 text-slate-900 font-sans">
              {/* ========================================================================= */}
              {/* PÁGINA 1: CABEÇALHO, TRANSPORTE & ROTEIRO DE ENTREGAS POR CLIENTE         */}
              {/* ========================================================================= */}
              {printManifestScope !== 'conferencia' && (
                <div className={`space-y-5 ${printManifestScope === 'all' ? 'manifest-page-1' : ''}`}>
                  {/* CABEÇALHO DO MANIFESTO */}
                  <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
                    <div>
                      <h2 className="text-lg font-black tracking-tight uppercase">
                        {currentCompany.tradeName || currentCompany.name}
                      </h2>
                      <p className="text-xs text-slate-600">
                        CNPJ: {currentCompany.cnpjCpf} • Telefone: {currentCompany.phone}
                      </p>
                      <p className="text-xs text-slate-600">
                        {currentCompany.address.street}, {currentCompany.address.number} - {currentCompany.address.city}/{currentCompany.address.state}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-mono font-black text-blue-700">
                        {printManifest.number}
                      </div>
                      {printManifest.name && (
                        <div className="text-xs font-extrabold text-slate-900">
                          {printManifest.name}
                        </div>
                      )}
                      <div className="text-xs font-bold uppercase text-slate-700">
                        MANIFESTO DE CARGA & ROTEIRO DE ENTREGAS
                      </div>
                      <div className="text-xs text-slate-500">
                        Data de Saída: {printManifest.departureDate}
                      </div>
                    </div>
                  </div>

                  {/* DADOS DA ROTA E TRANSPORTE */}
                  <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <span className="font-bold text-slate-500 uppercase block text-[10px]">Rota de Entrega:</span>
                      <span className="font-extrabold text-slate-900">{printManifest.routeName}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 uppercase block text-[10px]">Motorista:</span>
                      <span className="font-extrabold text-slate-900">{printManifest.driverName}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 uppercase block text-[10px]">Veículo / Placa:</span>
                      <span className="font-extrabold text-slate-900 font-mono">
                        {printManifest.vehiclePlate} ({printManifest.vehicleModel || 'Veículo Próprio'})
                      </span>
                    </div>
                  </div>

                  {/* 1. ROTEIRO DE ENTREGAS POR CLIENTE (COM CANHOTO DE ASSINATURA) */}
                  <div className="space-y-3 pt-1">
                    <div className="flex justify-between items-center border-b border-slate-300 pb-1">
                      <h4 className="font-extrabold text-xs uppercase text-slate-900">
                        1. Roteiro de Entregas por Cliente (Ordem da Rota):
                      </h4>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        Total: {printManifest.orders.length} paradas
                      </span>
                    </div>

                    <div className="space-y-4">
                      {printManifest.orders.map((ord) => (
                        <div
                          key={ord.orderId}
                          className="border border-slate-300 p-3 rounded-lg space-y-2 text-xs break-inside-avoid"
                        >
                          <div className="flex justify-between items-start border-b border-slate-200 pb-1.5">
                            <div>
                              <div className="font-black text-sm text-slate-900">
                                {ord.sequence}ª PARADA: {ord.customerName}
                              </div>
                              <div className="text-slate-600">
                                {ord.address.street}, {ord.address.number} - {ord.address.neighborhood}, {ord.address.city}/{ord.address.state}
                              </div>
                              <div className="text-slate-500 text-[11px]">
                                Pedido: <strong>{ord.orderNumber}</strong> • Telefone: {ord.customerPhone || '—'} • Vendedor: {ord.sellerName || '—'}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="font-black text-sm font-mono text-slate-900">
                                {formatCurrency(ord.totalValue)}
                              </div>
                              <div className="text-[11px] font-bold text-slate-700">
                                {ord.paymentStatus === 'cobrar_na_entrega' ? (
                                  <span className="text-rose-700">COBRAR NA ENTREGA ({ord.paymentMethod.toUpperCase()})</span>
                                ) : (
                                  <span className="text-emerald-700">PAGO / FATURADO</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* ITENS DESTE CLIENTE */}
                          <div className="text-[11px] text-slate-700">
                            <span className="font-bold">Itens do pedido: </span>
                            {ord.items.map((it, i) => (
                              <span key={it.productId}>
                                {formatQuantity(it.quantity)}x {it.description}
                                {i < ord.items.length - 1 ? '; ' : ''}
                              </span>
                            ))}
                          </div>

                          {/* CANHOTO DE RECEBIMENTO */}
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-[10px] text-slate-600 items-end">
                            <div>
                              <span>Data / Hora Recebimento: ____/____/________ ____:____</span>
                            </div>
                            <div>
                              <span>Nome do Recebedor (Legível): __________________________</span>
                            </div>
                            <div className="text-right">
                              <span>Assinatura: ____________________________________</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* TOTAIS E ASSINATURA DO MOTORISTA */}
                  <div className="pt-4 border-t-2 border-slate-900 flex justify-between items-center text-xs break-inside-avoid">
                    <div>
                      <p>
                        Total de Entregas: <strong>{printManifest.totalOrders} clientes</strong>
                      </p>
                      <p>
                        Total da Carga: <strong>{formatCurrency(printManifest.totalValue)}</strong> • A Receber: <strong>{formatCurrency(printManifest.totalAmountToCollect)}</strong>
                      </p>
                    </div>

                    <div className="text-center">
                      <div className="w-56 border-b border-slate-900 mb-1" />
                      <span className="text-[10px] text-slate-600 font-bold">Assinatura do Motorista / Transportador</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* DIVISOR VISUAL NA TELA + QUEBRA DE PÁGINA PARA IMPRESSÃO                  */}
              {/* ========================================================================= */}
              {printManifestScope === 'all' && (
                <div className="print-hidden py-4">
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2.5 rounded-xl text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-2xs">
                    <span className="flex items-center gap-1.5">
                      <span className="text-amber-600 font-black">📄 [QUEBRA DE PÁGINA]</span>
                      <span>Fim do Roteiro de Entregas — A próxima seção será impressa em uma folha A4 separada</span>
                    </span>
                    <span className="text-[11px] text-amber-800 font-medium">
                      Página 2: Relação Consolidada de Carregamento & Conferência Armazém
                    </span>
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* PÁGINA 2: RELAÇÃO CONSOLIDADA PARA CARREGAMENTO (CONFERÊNCIA ARMAZÉM)      */}
              {/* ========================================================================= */}
              {printManifestScope !== 'roteiro' && (
                <div
                  className={`space-y-5 ${
                    printManifestScope === 'all'
                      ? 'manifest-page-2 pt-6 border-t-2 border-dashed border-slate-300 print:border-none print:pt-0'
                      : ''
                  }`}
                >
                  {/* CABEÇALHO DA PÁGINA DE CARREGAMENTO */}
                  <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start">
                    <div>
                      <h2 className="text-lg font-black tracking-tight uppercase">
                        {currentCompany.tradeName || currentCompany.name}
                      </h2>
                      <p className="text-xs text-slate-600">
                        CNPJ: {currentCompany.cnpjCpf} • Telefone: {currentCompany.phone}
                      </p>
                      <p className="text-xs text-slate-600">
                        {currentCompany.address.street}, {currentCompany.address.number} - {currentCompany.address.city}/{currentCompany.address.state}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-mono font-black text-blue-700">
                        {printManifest.number}
                      </div>
                      {printManifest.name && (
                        <div className="text-xs font-extrabold text-slate-900">
                          {printManifest.name}
                        </div>
                      )}
                      <div className="text-xs font-bold uppercase text-slate-700">
                        MAPA DE SEPARAÇÃO & CARREGAMENTO (ARMAZÉM)
                      </div>
                      <div className="text-xs text-slate-500">
                        Data da Carga: {printManifest.departureDate}
                      </div>
                    </div>
                  </div>

                  {/* DADOS DA ROTA E TRANSPORTE (PARA CONFERÊNCIA DO ALMOXARIFADO) */}
                  <div className="grid grid-cols-4 gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <span className="font-bold text-slate-500 uppercase block text-[10px]">Rota de Destino:</span>
                      <span className="font-extrabold text-slate-900">{printManifest.routeName}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 uppercase block text-[10px]">Motorista Responsável:</span>
                      <span className="font-extrabold text-slate-900">{printManifest.driverName}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 uppercase block text-[10px]">Veículo / Placa:</span>
                      <span className="font-extrabold text-slate-900 font-mono">
                        {printManifest.vehiclePlate} ({printManifest.vehicleModel || 'Veículo Próprio'})
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 uppercase block text-[10px]">Total de Paradas:</span>
                      <span className="font-extrabold text-blue-800 font-mono">
                        {printManifest.totalOrders} clientes
                      </span>
                    </div>
                  </div>

                  {/* RELAÇÃO CONSOLIDADA DE PRODUTOS PARA CARREGAMENTO */}
                  <div className="space-y-2">
                    <div className="border-b border-slate-300 pb-1 flex justify-between items-baseline">
                      <h4 className="font-extrabold text-xs uppercase text-slate-900">
                        2. Relação Consolidada de Produtos para Carregamento (Conferência Armazém):
                      </h4>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        Separação e conferência física no estoque antes da saída do caminhão
                      </span>
                    </div>

                    {(() => {
                      const aggregatedItems = new Map<string, { code: string; desc: string; unit: string; qty: number }>();
                      printManifest.orders.forEach((o) => {
                        o.items.forEach((it) => {
                          const ex = aggregatedItems.get(it.productId);
                          if (ex) {
                            ex.qty += it.quantity;
                          } else {
                            aggregatedItems.set(it.productId, {
                              code: it.productCode,
                              desc: it.description,
                              unit: it.unit,
                              qty: it.quantity,
                            });
                          }
                        });
                      });

                      const itemsList = Array.from(aggregatedItems.values());
                      const totalItemsCount = itemsList.length;
                      const totalUnitsSum = itemsList.reduce((s, it) => s + it.qty, 0);

                      return (
                        <div className="space-y-3">
                          <table className="w-full text-left text-xs border border-slate-300">
                            <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-300">
                              <tr>
                                <th className="p-2 w-12 text-center">#</th>
                                <th className="p-2 w-20">Código</th>
                                <th className="p-2">Descrição da Mercadoria / Produto</th>
                                <th className="p-2 text-center w-16">Unid</th>
                                <th className="p-2 text-right w-28">Qtd a Carregar</th>
                                <th className="p-2 text-center w-24">Conferido [ ✓ ]</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {itemsList.map((p, idx) => (
                                <tr key={p.code} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                                  <td className="p-2 text-center font-mono text-slate-400 text-[10px]">{idx + 1}</td>
                                  <td className="p-2 font-mono font-bold text-slate-800">{p.code}</td>
                                  <td className="p-2 font-medium text-slate-900">{p.desc}</td>
                                  <td className="p-2 text-center text-slate-600 font-semibold">{p.unit}</td>
                                  <td className="p-2 text-right font-black font-mono text-slate-900 text-xs">
                                    {formatQuantity(p.qty)}
                                  </td>
                                  <td className="p-2 text-center">
                                    <span className="inline-block w-4 h-4 border border-slate-400 rounded-sm" />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-slate-100 font-extrabold text-xs border-t-2 border-slate-300">
                                <td colSpan={3} className="p-2 uppercase text-slate-700">
                                  Total Consolidado da Carga ({totalItemsCount} produtos distintos):
                                </td>
                                <td className="p-2 text-center text-slate-500 text-[10px]">VOL</td>
                                <td className="p-2 text-right font-black font-mono text-blue-800 text-xs">
                                  {formatQuantity(totalUnitsSum)}
                                </td>
                                <td className="p-2 text-center font-bold text-[10px] text-slate-600">
                                  100% OK
                                </td>
                              </tr>
                            </tfoot>
                          </table>

                          {/* ASSINATURAS DO CARREGAMENTO E ALMOXARIFADO */}
                          <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs break-inside-avoid">
                            <div>
                              <div className="w-64 mx-auto border-b border-slate-900 mb-1" />
                              <span className="font-bold text-slate-900 block">Conferente / Almoxarife do Estoque</span>
                              <span className="text-[10px] text-slate-500">Declaro que a carga acima foi conferida e liberada do armazém</span>
                            </div>

                            <div>
                              <div className="w-64 mx-auto border-b border-slate-900 mb-1" />
                              <span className="font-bold text-slate-900 block">Motorista Responsável pelo Embarque</span>
                              <span className="text-[10px] text-slate-500">Conferi e recebi a totalidade das mercadorias relacionadas</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: CADASTRO / EDIÇÃO DE ROTA DE ENTREGA */}
      {/* ========================================================================= */}
      {isRouteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            noValidate
            onSubmit={handleSaveRoute}
            className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-extrabold text-base text-slate-800">
                {editingRoute ? 'Editar Rota de Entrega' : 'Nova Rota de Entrega'}
              </h3>
              <button
                type="button"
                onClick={() => setIsRouteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Código da Rota *</label>
                <input
                  type="text"
                  required
                  value={routeFormCode}
                  onChange={(e) => setRouteFormCode(e.target.value.toUpperCase())}
                  placeholder="ROT-01"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome da Rota *</label>
                <input
                  type="text"
                  required
                  value={routeFormName}
                  onChange={(e) => setRouteFormName(e.target.value)}
                  placeholder="Ex: Rota 01 - Feira de Santana (Sede)"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Descrição / Abrangência</label>
                <input
                  type="text"
                  value={routeFormDescription}
                  onChange={(e) => setRouteFormDescription(e.target.value)}
                  placeholder="Ex: Atendimento a comércios e supermercados de Feira de Santana e região"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cidades Atendidas (separar por vírgula)</label>
                <input
                  type="text"
                  value={routeFormCities}
                  onChange={(e) => setRouteFormCities(e.target.value)}
                  placeholder="Ex: Feira de Santana, Alagoinhas"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Bairros Atendidos (separar por vírgula)</label>
                <input
                  type="text"
                  value={routeFormNeighborhoods}
                  onChange={(e) => setRouteFormNeighborhoods(e.target.value)}
                  placeholder="Ex: Kalilândia, Santa Mônica, Centro"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Praças Comerciais</label>
                <input
                  type="text"
                  value={routeFormMarketAreas}
                  onChange={(e) => setRouteFormMarketAreas(e.target.value)}
                  placeholder="Ex: Feira de Santana - Sede, Recôncavo Baiano"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vendedores Atendidos</label>
                <input
                  type="text"
                  value={routeFormSellers}
                  onChange={(e) => setRouteFormSellers(e.target.value)}
                  placeholder="Ex: Carlos Silva, Bruno Lima"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Janela de Horário Recomendada</label>
                <input
                  type="text"
                  value={routeFormDeliveryWindow}
                  onChange={(e) => setRouteFormDeliveryWindow(e.target.value)}
                  placeholder="Ex: Manhã (08h às 12h)"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo de Veículo Recomendado</label>
                <input
                  type="text"
                  value={routeFormVehicleType}
                  onChange={(e) => setRouteFormVehicleType(e.target.value)}
                  placeholder="Ex: Fiorino, Van, Caminhão 3/4"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  Valor Mínimo Financeiro p/ Criar Romaneio (R$)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-500 font-mono font-bold text-xs pointer-events-none">
                    R$
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={routeFormMinimumValue}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '');
                      setRouteFormMinimumValue(val);
                    }}
                    onBlur={() => {
                      const parsed = parsePtBrMoneyInput(routeFormMinimumValue);
                      setRouteFormMinimumValue(formatPtBrDecimal(parsed));
                    }}
                    placeholder="1.500,00"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Informe com casas decimais (ex: 1.500,00 ou 0,00 para sem mínimo obrigatório). Usado no painel e no gráfico de Expedição para indicar quando a rota atingiu o faturamento ideal para montar um novo romaneio.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsRouteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer"
              >
                Salvar Rota
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: CADASTRO / EDIÇÃO DE MOTORISTA */}
      {/* ========================================================================= */}
      {isDriverModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            noValidate
            onSubmit={handleSaveDriver}
            className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    {editingDriver ? 'Editar Motorista' : 'Novo Motorista de Entrega'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Controle de dados pessoais, CNH e alerta de validade da habilitação.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDriverModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={driverFormName}
                  onChange={(e) => setDriverFormName(e.target.value)}
                  placeholder="Ex: Marcos Vinicius Almeida"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">CPF</label>
                <input
                  type="text"
                  value={driverFormCpf}
                  onChange={(e) => setDriverFormCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={driverFormPhone}
                  onChange={(e) => setDriverFormPhone(e.target.value)}
                  placeholder="(75) 98765-4321"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Número da CNH *</label>
                <input
                  type="text"
                  required
                  value={driverFormCnhNumber}
                  onChange={(e) => setDriverFormCnhNumber(e.target.value)}
                  placeholder="04589123400"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Categoria da CNH *</label>
                <select
                  value={driverFormCnhCategory}
                  onChange={(e) => setDriverFormCnhCategory(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="A">A (Moto)</option>
                  <option value="B">B (Carro / Utilitário)</option>
                  <option value="AB">AB (Moto e Carro)</option>
                  <option value="C">C (VUC / Caminhão Leve)</option>
                  <option value="AC">AC</option>
                  <option value="D">D (Van / Micro-ônibus / Pesado)</option>
                  <option value="E">E (Carreta / Articulado)</option>
                  <option value="AE">AE</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Validade da Habilitação (CNH) *</label>
                <input
                  type="date"
                  required
                  value={driverFormCnhExpirationDate}
                  onChange={(e) => setDriverFormCnhExpirationDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                {driverFormCnhExpirationDate && (() => {
                  const st = getExpirationStatus(driverFormCnhExpirationDate);
                  return (
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold mt-1 px-2 py-0.5 rounded border ${
                        st.state === 'expired'
                          ? 'text-rose-700 bg-rose-50 border-rose-200'
                          : st.state === 'expiring_soon'
                          ? 'text-amber-800 bg-amber-50 border-amber-200'
                          : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      }`}
                    >
                      {st.state === 'expired' ? (
                        <AlertTriangle size={10} />
                      ) : st.state === 'expiring_soon' ? (
                        <Clock size={10} />
                      ) : (
                        <CheckCircle2 size={10} />
                      )}
                      {st.label}
                    </span>
                  );
                })()}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Data de Admissão</label>
                <input
                  type="date"
                  value={driverFormAdmissionDate}
                  onChange={(e) => setDriverFormAdmissionDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Veículo Padrão</label>
                <select
                  value={driverFormDefaultVehicleId}
                  onChange={(e) => setDriverFormDefaultVehicleId(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Nenhum veículo fixo</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} — {v.model}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Status</label>
                <select
                  value={driverFormStatus}
                  onChange={(e) => setDriverFormStatus(e.target.value as 'ativo' | 'inativo')}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={driverFormNotes}
                  onChange={(e) => setDriverFormNotes(e.target.value)}
                  placeholder="Ex: Curso MOPP, disponibilidade de rotas, observações contratuais..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDriverModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer"
              >
                Salvar Motorista
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: CADASTRO / EDIÇÃO DE VEÍCULO */}
      {/* ========================================================================= */}
      {isVehicleModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            noValidate
            onSubmit={handleSaveVehicle}
            className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                  <Car size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    {editingVehicle ? 'Editar Veículo' : 'Novo Veículo de Entrega'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Dados da frota, capacidade de carga e validade do licenciamento (CRLV).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsVehicleModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Placa *</label>
                <input
                  type="text"
                  required
                  value={vehicleFormPlate}
                  onChange={(e) => setVehicleFormPlate(e.target.value.toUpperCase())}
                  placeholder="BRA-2E19"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-extrabold uppercase focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Modelo / Marca *</label>
                <input
                  type="text"
                  required
                  value={vehicleFormModel}
                  onChange={(e) => setVehicleFormModel(e.target.value)}
                  placeholder="Ex: Fiat Fiorino 1.4 EVO"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo de Veículo</label>
                <select
                  value={vehicleFormType}
                  onChange={(e) => setVehicleFormType(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Utilitário / Fiorino">Utilitário / Fiorino</option>
                  <option value="Van / Furgão">Van / Furgão</option>
                  <option value="VUC / Caminhão Leve">VUC / Caminhão Leve</option>
                  <option value="Caminhão 3/4">Caminhão 3/4</option>
                  <option value="Caminhão Toco / Truck">Caminhão Toco / Truck</option>
                  <option value="Moto">Moto</option>
                  <option value="Carro Passeio">Carro Passeio</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ano</label>
                  <input
                    type="text"
                    value={vehicleFormYear}
                    onChange={(e) => setVehicleFormYear(e.target.value)}
                    placeholder="2023"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Capacidade (kg)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={vehicleFormCapacityKg}
                    onChange={(e) => setVehicleFormCapacityKg(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="650"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Código Renavam</label>
                <input
                  type="text"
                  value={vehicleFormRenavam}
                  onChange={(e) => setVehicleFormRenavam(e.target.value)}
                  placeholder="01234567890"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Status Operacional *</label>
                <select
                  value={vehicleFormStatus}
                  onChange={(e) => setVehicleFormStatus(e.target.value as 'ativo' | 'manutencao' | 'inativo')}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ativo">Ativo / Disponível</option>
                  <option value="manutencao">Em Manutenção</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Validade Licenciamento (CRLV) *</label>
                <input
                  type="date"
                  required
                  value={vehicleFormLicensingExpirationDate}
                  onChange={(e) => setVehicleFormLicensingExpirationDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                {vehicleFormLicensingExpirationDate && (() => {
                  const st = getExpirationStatus(vehicleFormLicensingExpirationDate);
                  return (
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold mt-1 px-2 py-0.5 rounded border ${
                        st.state === 'expired'
                          ? 'text-rose-700 bg-rose-50 border-rose-200'
                          : st.state === 'expiring_soon'
                          ? 'text-amber-800 bg-amber-50 border-amber-200'
                          : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      }`}
                    >
                      {st.state === 'expired' ? (
                        <AlertTriangle size={10} />
                      ) : st.state === 'expiring_soon' ? (
                        <Clock size={10} />
                      ) : (
                        <CheckCircle2 size={10} />
                      )}
                      {st.label}
                    </span>
                  );
                })()}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Validade Seguro / Revisão</label>
                <input
                  type="date"
                  value={vehicleFormInsuranceExpirationDate}
                  onChange={(e) => setVehicleFormInsuranceExpirationDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={vehicleFormNotes}
                  onChange={(e) => setVehicleFormNotes(e.target.value)}
                  placeholder="Ex: Baú refrigerado, rastreador, última troca de óleo..."
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsVehicleModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer"
              >
                Salvar Veículo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE MOTORISTA */}
      {driverToDelete && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Excluir Motorista?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Tem certeza de que deseja excluir o motorista <strong>{driverToDelete.name}</strong>? Romaneios já
                  emitidos manterão o histórico do nome.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDriverToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteDriver}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                <span>Sim, Excluir Motorista</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE VEÍCULO */}
      {vehicleToDelete && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Excluir Veículo?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Tem certeza de que deseja excluir o veículo{' '}
                  <strong className="font-mono">{vehicleToDelete.plate}</strong> ({vehicleToDelete.model})? Romaneios já
                  emitidos manterão o histórico da placa.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setVehicleToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteVehicle}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                <span>Sim, Excluir Veículo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO DE CIDADE */}
      {isCityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveCity}
            className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4 my-auto"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <MapPin className="text-blue-600" size={20} />
                <h3 className="font-bold text-base text-slate-800">
                  {editingCity ? `Editar Cidade: ${editingCity.name}` : 'Nova Cidade Atendida'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCityModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Nome da Cidade *</label>
                <input
                  type="text"
                  required
                  value={cityFormName}
                  onChange={(e) => setCityFormName(e.target.value)}
                  placeholder="Ex: Conceição do Jacuípe"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Estado (UF) *</label>
                <select
                  value={cityFormStateUf}
                  onChange={(e) => setCityFormStateUf(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="BA">BA - Bahia</option>
                  {states
                    .filter((st) => st.uf !== 'BA')
                    .map((st) => (
                      <option key={st.id} value={st.uf}>
                        {st.uf} - {st.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Distância de Feira (km)</label>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  value={cityFormDistanceKm}
                  onChange={(e) => setCityFormDistanceKm(e.target.value)}
                  placeholder="Ex: 78"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Praça Comercial Padrão</label>
                <select
                  value={cityFormMarketAreaName}
                  onChange={(e) => setCityFormMarketAreaName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sem praça vinculada</option>
                  {marketAreas.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Rota de Entrega Padrão</label>
                <select
                  value={cityFormDefaultRouteId}
                  onChange={(e) => setCityFormDefaultRouteId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione uma rota...</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Código IBGE</label>
                <input
                  type="text"
                  value={cityFormIbgeCode}
                  onChange={(e) => setCityFormIbgeCode(e.target.value)}
                  placeholder="Ex: 2910800"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col justify-end gap-2 pb-1">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cityFormActive}
                    onChange={(e) => setCityFormActive(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Cidade ativa para vendas/rotas</span>
                </label>
                <label className="inline-flex items-center gap-2 font-semibold text-emerald-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cityFormIsSystemDefault}
                    onChange={(e) => setCityFormIsSystemDefault(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Manter como Padrão do Sistema (BA)</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCityModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer"
              >
                Salvar Cidade
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE CIDADE */}
      {cityToDelete && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Excluir Cidade?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Tem certeza de que deseja excluir a cidade <strong>{cityToDelete.name}</strong>? Esta ação removerá o município da listagem de cidades atendidas.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCityToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCity}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                <span>Sim, Excluir Cidade</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
