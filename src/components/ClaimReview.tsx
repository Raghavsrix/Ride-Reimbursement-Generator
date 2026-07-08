import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  X,
  Calendar,
  Clock,
  MapPin,
  CreditCard,
  MessageSquare,
  Eye,
  Copy,
  ArrowUpDown,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Info
} from 'lucide-react';
import { RideReceipt, FilterConfig } from '../types';
import { getEffectivePickup, getEffectiveDropoff } from '../lib/routeHelper';

interface ClaimReviewProps {
  rides: RideReceipt[];
  setRides: React.Dispatch<React.SetStateAction<RideReceipt[]>>;
  employeeName: string;
  employeeEmail: string;
  filters: FilterConfig;
  exportPDF: () => Promise<void>;
  exportExcel: () => void;
  handleAddManualRide: () => void;
  onPreviewReport?: () => void;
}

export default function ClaimReview({
  rides,
  setRides,
  employeeName,
  employeeEmail,
  filters,
  exportPDF,
  exportExcel,
  handleAddManualRide,
  onPreviewReport
}: ClaimReviewProps) {
  // Simplified search and filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'All' | 'Eligible' | 'Excluded' | 'Uber' | 'Rapido'>('All');

  // Sorting state
  const [sortField, setSortField] = useState<keyof RideReceipt>('dateOfRide');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // View Details Modal State
  const [isViewOpen, setIsViewOpen] = useState<boolean>(false);
  const [viewingRide, setViewingRide] = useState<RideReceipt | null>(null);

  // Edit / Add Modal States
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editorMode, setEditorMode] = useState<'add' | 'edit'>('add');
  const [editingRide, setEditingRide] = useState<RideReceipt | null>(null);
  const [editorForm, setEditorForm] = useState({
    provider: 'Uber' as 'Uber' | 'Rapido',
    dateOfRide: '',
    timeOfRide: '',
    pickup: '',
    dropoff: '',
    fare: '',
    paymentMethod: 'UPI',
    notes: '',
    isReimbursable: true,
    rideId: ''
  });

  // Duplicate detection logic (runs automatically on rides state)
  const duplicatesMap = useMemo(() => {
    const idGroups = new Map<string, string[]>(); // key -> rideIds
    
    rides.forEach(ride => {
      // 1. Group by extracted ride ID
      if (ride.rideId && ride.rideId.trim() !== '') {
        const key = `id_${ride.rideId.trim().toLowerCase()}`;
        if (!idGroups.has(key)) idGroups.set(key, []);
        idGroups.get(key)!.push(ride.id);
      }
      
      // 2. Group by Provider + Date + Time + Fare
      const dateStr = ride.dateOfRide || ride.dateReceived.split('T')[0];
      const timeStr = ride.timeOfRide || ride.timeReceived;
      const fareStr = Number(ride.fare).toFixed(2);
      const comboKey = `combo_${ride.provider.toLowerCase()}_${dateStr}_${timeStr}_${fareStr}`;
      if (!idGroups.has(comboKey)) idGroups.set(comboKey, []);
      idGroups.get(comboKey)!.push(ride.id);
    });

    const rideDupeIds = new Set<string>();
    const dupeGroups: string[][] = [];

    idGroups.forEach((rideIds) => {
      if (rideIds.length > 1) {
        // Filter out single group duplicates and keep unique list
        const uniqueIdsInGroup = Array.from(new Set(rideIds));
        if (uniqueIdsInGroup.length > 1) {
          uniqueIdsInGroup.forEach(id => rideDupeIds.add(id));
          const groupSorted = [...uniqueIdsInGroup].sort().join(',');
          if (!dupeGroups.some(g => g.sort().join(',') === groupSorted)) {
            dupeGroups.push(uniqueIdsInGroup);
          }
        }
      }
    });

    return {
      isDuplicate: (id: string) => rideDupeIds.has(id),
      dupeGroups,
      rideDupeIds
    };
  }, [rides]);

  // Keep chosen ride, exclude duplicates
  const resolveDuplicate = (rideIdToKeep: string) => {
    const group = duplicatesMap.dupeGroups.find(g => g.includes(rideIdToKeep));
    if (!group) return;

    setRides(prev =>
      prev.map(ride => {
        if (group.includes(ride.id)) {
          return {
            ...ride,
            isReimbursable: ride.id === rideIdToKeep
          };
        }
        return ride;
      })
    );
  };

  // Toggle single ride isReimbursable
  const toggleReimbursable = (id: string) => {
    setRides(prev =>
      prev.map(r => (r.id === id ? { ...r, isReimbursable: !r.isReimbursable } : r))
    );
  };

  // Duplicate a ride
  const handleDuplicateRide = (ride: RideReceipt) => {
    const manualId = 'manual_dup_' + Date.now();
    const duplicated: RideReceipt = {
      ...ride,
      id: manualId,
      messageId: manualId,
      threadId: 'manual_thread',
      subject: `Duplicated: ${ride.subject || 'Ride'}`,
      dateReceived: new Date().toISOString(),
      timeReceived: ride.timeOfRide || ride.timeReceived || '20:00',
      isReimbursable: ride.isReimbursable,
      fare: ride.fare,
      currency: ride.currency || 'INR',
      dateOfRide: ride.dateOfRide || ride.dateReceived.split('T')[0],
      timeOfRide: ride.timeOfRide || ride.timeReceived,
      pickup: getEffectivePickup(ride.pickup),
      dropoff: getEffectiveDropoff(ride.dropoff),
      paymentMethod: ride.paymentMethod || 'UPI',
      rideId: ride.rideId ? `${ride.rideId} (Copy)` : null,
      notes: ride.notes || 'Duplicated entry',
      confidence: 1.0,
      loading: false
    };
    setRides(prev => [duplicated, ...prev]);
  };

  // Delete a ride (manual only)
  const deleteRideRow = (id: string) => {
    if (window.confirm('Are you sure you want to delete this manual ride?')) {
      setRides(prev => prev.filter(r => r.id !== id));
    }
  };

  // Check if ride is a manual ride
  const isManualRide = (ride: RideReceipt) => {
    return (
      ride.id.startsWith('manual_') ||
      ride.id.startsWith('manual_dup_') ||
      ride.id.startsWith('manual_ai_') ||
      ride.threadId === 'manual_thread' ||
      ride.threadId === 'manual_ai_thread'
    );
  };

  // Open View Details Modal
  const handleOpenViewModal = (ride: RideReceipt) => {
    setViewingRide(ride);
    setIsViewOpen(true);
  };

  // Open Add Ride Modal
  const handleOpenAddModal = () => {
    setEditorMode('add');
    setEditingRide(null);
    setEditorForm({
      provider: 'Uber',
      dateOfRide: new Date().toISOString().split('T')[0],
      timeOfRide: new Date().toTimeString().slice(0, 5),
      pickup: 'TrueFan sector 19',
      dropoff: 'UWG 1 sector 47',
      fare: '',
      paymentMethod: 'UPI',
      notes: '',
      isReimbursable: true,
      rideId: ''
    });
    setIsEditorOpen(true);
  };

  // Open Edit Ride Modal
  const handleOpenEditModal = (ride: RideReceipt) => {
    setEditorMode('edit');
    setEditingRide(ride);
    setEditorForm({
      provider: ride.provider,
      dateOfRide: ride.dateOfRide || ride.dateReceived.split('T')[0],
      timeOfRide: ride.timeOfRide || ride.timeReceived || '20:00',
      pickup: ride.pickup || '',
      dropoff: ride.dropoff || '',
      fare: String(ride.fare || ''),
      paymentMethod: ride.paymentMethod || 'UPI',
      notes: ride.notes || '',
      isReimbursable: ride.isReimbursable,
      rideId: ride.rideId || ''
    });
    setIsEditorOpen(true);
  };

  // Save Modal Editor Form
  const handleSaveEditor = (e: React.FormEvent) => {
    e.preventDefault();
    const fareVal = parseFloat(editorForm.fare) || 0;

    if (editorMode === 'add') {
      const manualId = 'manual_' + Date.now();
      const newRide: RideReceipt = {
        id: manualId,
        messageId: manualId,
        threadId: 'manual_thread',
        provider: editorForm.provider,
        subject: 'Manually Entered Ride',
        dateReceived: new Date(editorForm.dateOfRide + 'T12:00:00Z').toISOString(),
        timeReceived: editorForm.timeOfRide || '20:00',
        isReimbursable: editorForm.isReimbursable,
        fare: fareVal,
        currency: 'INR',
        dateOfRide: editorForm.dateOfRide,
        timeOfRide: editorForm.timeOfRide,
        pickup: getEffectivePickup(editorForm.pickup),
        dropoff: getEffectiveDropoff(editorForm.dropoff),
        paymentMethod: editorForm.paymentMethod,
        rideId: editorForm.rideId || null,
        notes: editorForm.notes || '',
        confidence: 1.0,
        loading: false
      };
      setRides(prev => [newRide, ...prev]);
    } else {
      setRides(prev =>
        prev.map(r =>
          r.id === editingRide?.id
            ? {
                ...r,
                provider: editorForm.provider,
                dateOfRide: editorForm.dateOfRide,
                timeOfRide: editorForm.timeOfRide,
                pickup: editorForm.pickup,
                dropoff: editorForm.dropoff,
                fare: fareVal,
                paymentMethod: editorForm.paymentMethod,
                isReimbursable: editorForm.isReimbursable,
                rideId: editorForm.rideId || null,
                notes: editorForm.notes,
                edited: {
                  pickup: r.pickup !== editorForm.pickup,
                  dropoff: r.dropoff !== editorForm.dropoff,
                  fare: r.fare !== fareVal,
                  paymentMethod: r.paymentMethod !== editorForm.paymentMethod,
                  notes: r.notes !== editorForm.notes
                }
              }
            : r
        )
      );
    }
    setIsEditorOpen(false);
  };

  // Filtering Logic
  const filteredRidesList = useMemo(() => {
    return rides.filter(ride => {
      // 1. Unified Universal Search Query
      const dateOfRide = ride.dateOfRide || ride.dateReceived.split('T')[0];
      const timeOfRide = ride.timeOfRide || ride.timeReceived || '';
      const rideIdStr = ride.rideId || '';
      const notesStr = ride.notes || '';
      const paymentMethodStr = ride.paymentMethod || '';
      const combinedText = `${ride.provider} ${dateOfRide} ${timeOfRide} ${ride.pickup || ''} ${ride.dropoff || ''} ${rideIdStr} ${ride.fare} ${notesStr} ${paymentMethodStr}`.toLowerCase();

      if (searchQuery && !combinedText.includes(searchQuery.toLowerCase())) {
        return false;
      }

      // 2. Simplified Filters
      if (filterType === 'Eligible' && !ride.isReimbursable) return false;
      if (filterType === 'Excluded' && ride.isReimbursable) return false;
      if (filterType === 'Uber' && ride.provider !== 'Uber') return false;
      if (filterType === 'Rapido' && ride.provider !== 'Rapido') return false;

      return true;
    });
  }, [rides, searchQuery, filterType, filters.startDate, filters.endDate]);

  // Sorting logic
  const sortedRides = useMemo(() => {
    const sorted = [...filteredRidesList];
    sorted.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'dateOfRide') {
        aVal = a.dateOfRide || a.dateReceived.split('T')[0];
        bVal = b.dateOfRide || b.dateReceived.split('T')[0];
      } else if (sortField === 'timeOfRide') {
        aVal = a.timeOfRide || a.timeReceived || '';
        bVal = b.timeOfRide || b.timeReceived || '';
      }

      if (aVal === undefined || aVal === null) return sortDirection === 'asc' ? 1 : -1;
      if (bVal === undefined || bVal === null) return sortDirection === 'asc' ? -1 : 1;

      if (typeof aVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else {
        return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
      }
    });
    return sorted;
  }, [filteredRidesList, sortField, sortDirection]);

  // Pagination slicing
  const paginatedRides = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return sortedRides.slice(startIdx, startIdx + pageSize);
  }, [sortedRides, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedRides.length / pageSize) || 1;

  // Real-time KPI Statistics Calculations
  const totals = useMemo(() => {
    const eligibleRides = rides.filter(r => r.isReimbursable);
    const excludedRides = rides.filter(r => !r.isReimbursable);

    const uberRides = eligibleRides.filter(r => r.provider === 'Uber');
    const rapidoRides = eligibleRides.filter(r => r.provider === 'Rapido');

    const uberSum = uberRides.reduce((sum, r) => sum + r.fare, 0);
    const rapidoSum = rapidoRides.reduce((sum, r) => sum + r.fare, 0);
    const grandSum = uberSum + rapidoSum;

    return {
      eligibleCount: eligibleRides.length,
      excludedCount: excludedRides.length,
      uberSum,
      rapidoSum,
      grandSum
    };
  }, [rides]);

  // Request sort toggler
  const requestSort = (field: keyof RideReceipt) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortField === field && sortDirection === 'desc') {
      direction = 'asc';
    }
    setSortField(field);
    setSortDirection(direction);
    setCurrentPage(1);
  };

  // Exclusion reason generator
  const getExclusionReason = (ride: RideReceipt) => {
    if (ride.isReimbursable) return null;

    if (duplicatesMap.isDuplicate(ride.id)) {
      return 'Duplicate receipt';
    }

    let hours = 20;
    try {
      const timeStr = ride.timeOfRide || ride.timeReceived || '20:00';
      if (timeStr.toLowerCase().includes('pm')) {
        const h = parseInt(timeStr.split(':')[0], 10);
        hours = h === 12 ? 12 : h + 12;
      } else if (timeStr.toLowerCase().includes('am')) {
        const h = parseInt(timeStr.split(':')[0], 10);
        hours = h === 12 ? 0 : h;
      } else {
        const h = parseInt(timeStr.split(':')[0], 10);
        if (!isNaN(h)) hours = h;
      }
    } catch (e) {
      console.error(e);
    }
    const [thresholdH] = filters.reimburseAfterTime.split(':').map(Number);
    if (hours < (isNaN(thresholdH) ? 20 : thresholdH)) {
      return `Outside policy (before ${filters.reimburseAfterTime === '20:00' ? '8:00 PM' : filters.reimburseAfterTime})`;
    }

    return 'Manually excluded';
  };

  // Validation compliance checker
  const { isValid, validationErrors } = useMemo(() => {
    const errors: { message: string; action: string }[] = [];
    const reimbursable = rides.filter(r => r.isReimbursable);

    // 1. Duplicate check
    const hasIncludedDuplicates = reimbursable.some(r => {
      const group = duplicatesMap.dupeGroups.find(g => g.includes(r.id));
      if (!group) return false;
      return rides.filter(ride => group.includes(ride.id) && ride.isReimbursable).length > 1;
    });

    if (hasIncludedDuplicates) {
      errors.push({
        message: 'Duplicate Receipts Active',
        action: 'Look for "Duplicate" warning badges. Click "Exclude" on the identical redundant receipts.'
      });
    }

    // 2. Zero fare check
    const hasZeroFares = reimbursable.some(r => Number(r.fare) <= 0);
    if (hasZeroFares) {
      errors.push({
        message: 'Active Reimbursements with ₹0.00 Fare',
        action: 'Locate ₹0.00 items. Click "Edit" to configure the actual fare amount.'
      });
    }

    return {
      isValid: errors.length === 0,
      validationErrors: errors
    };
  }, [rides, duplicatesMap]);

  return (
    <div className="space-y-6">
      {/* 1. SUMMARY STATS PANEL - STRIPE STYLE */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Stat 1: Eligible Count */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between text-left">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Eligible Rides</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-black text-slate-900">{totals.eligibleCount}</span>
            <span className="text-xs text-slate-400 font-semibold">claims</span>
          </div>
          <div className="mt-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-emerald-600 font-bold">Active in report</span>
          </div>
        </div>

        {/* Stat 2: Excluded Count */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between text-left">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Excluded Rides</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-black text-slate-500">{totals.excludedCount}</span>
            <span className="text-xs text-slate-400 font-semibold">items</span>
          </div>
          <div className="mt-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
            <span className="text-[10px] text-slate-400 font-bold">Bypassed totals</span>
          </div>
        </div>

        {/* Stat 3: Uber Total */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between text-left">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Uber Total</span>
            <span className="text-[9px] bg-slate-950 text-white font-extrabold px-1.5 py-0.5 rounded uppercase">Uber</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900 font-mono">₹{totals.uberSum.toFixed(2)}</span>
          </div>
          <div className="mt-2 text-[10px] text-slate-400 font-semibold">Eligible Uber spend</div>
        </div>

        {/* Stat 4: Rapido Total */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between text-left">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rapido Total</span>
            <span className="text-[9px] bg-yellow-400 text-slate-900 font-extrabold px-1.5 py-0.5 rounded uppercase">Rapido</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900 font-mono">₹{totals.rapidoSum.toFixed(2)}</span>
          </div>
          <div className="mt-2 text-[10px] text-slate-400 font-semibold">Eligible Rapido spend</div>
        </div>

        {/* Stat 5: Grand Total - Prominent Stripe style Card */}
        <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100 shadow-sm flex flex-col justify-between text-left col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Grand Total</span>
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-indigo-700 font-mono">₹{totals.grandSum.toFixed(2)}</span>
          </div>
          <div className="mt-2 text-[10px] text-indigo-600 font-bold">Total reimbursement</div>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE BLOCK - SEARCH, FILTERS, ADD MANUAL BUTTON */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden text-left">
        
        {/* Universal Controller Area */}
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Universal Single Search Bar */}
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by pickup, destination, provider, fare or ride ID..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="block w-full bg-slate-50 border border-slate-200/60 focus:bg-white focus:border-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-xs outline-none transition-all font-semibold"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filters & Actions Group */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Segmented Filter Pills */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/20">
              {(['All', 'Eligible', 'Excluded', 'Uber', 'Rapido'] as const).map((type) => {
                const isActive = filterType === type;
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setFilterType(type);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>

            {/* Elegant Add Manual Ride Button */}
            <button
              id="add-manual-ride-trigger"
              onClick={handleOpenAddModal}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 text-xs font-bold cursor-pointer shadow-xs transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Manual Ride</span>
            </button>
          </div>
        </div>

        {/* 3. TABLE/LIST WORKSPACE VIEW */}
        {sortedRides.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center p-6 bg-slate-50/20">
            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200/50 flex items-center justify-center mb-4">
              <Search className="w-5 h-5 text-slate-400" />
            </div>
            <h4 className="font-bold text-slate-700 text-sm">No matching rides found</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              No receipts matched your search query or active filters. Try clearing your keywords or selection.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop and Tablet Wide Table (hidden on mobile) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50/55 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
                    {/* Checkbox Column */}
                    <th className="px-5 py-3.5 w-12 text-center">
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          disabled
                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 opacity-40 cursor-not-allowed"
                        />
                      </div>
                    </th>
                    {/* Columns matching specifications */}
                    <th className="px-4 py-3.5 w-24">Provider</th>
                    <th className="px-4 py-3.5 w-28 cursor-pointer group" onClick={() => requestSort('dateOfRide')}>
                      <div className="flex items-center gap-1">
                        <span>Date</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                    </th>
                    <th className="px-4 py-3.5 w-24 cursor-pointer group" onClick={() => requestSort('timeOfRide')}>
                      <div className="flex items-center gap-1">
                        <span>Time</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                    </th>
                    <th className="px-4 py-3.5 min-w-[150px]">Pickup Location</th>
                    <th className="px-4 py-3.5 min-w-[150px]">Destination</th>
                    <th className="px-4 py-3.5 w-28 text-right cursor-pointer group" onClick={() => requestSort('fare')}>
                      <div className="flex items-center gap-1 justify-end">
                        <span>Fare</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                    </th>
                    <th className="px-4 py-3.5 w-36">Status</th>
                    <th className="px-5 py-3.5 w-56 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                  {paginatedRides.map((ride) => {
                    const isEligible = ride.isReimbursable;
                    const isDupe = duplicatesMap.isDuplicate(ride.id);
                    const rideDate = ride.dateOfRide || ride.dateReceived.split('T')[0];
                    const rideTime = ride.timeOfRide || ride.timeReceived || '20:00';
                    const isManual = isManualRide(ride);
                    const exclusionReason = getExclusionReason(ride);

                    // Duplicate resolution conflict check
                    const isDupeGroupConflict = isDupe && isEligible && (() => {
                      const group = duplicatesMap.dupeGroups.find(g => g.includes(ride.id));
                      if (!group) return false;
                      return rides.filter(r => group.includes(r.id) && r.isReimbursable).length > 1;
                    })();

                    return (
                      <tr
                        key={ride.id}
                        className={`hover:bg-slate-50/50 transition-colors ${
                          !isEligible ? 'bg-slate-50/20 text-slate-400 opacity-70' : ''
                        }`}
                      >
                        {/* Checkbox Column */}
                        <td className="px-5 py-3 align-middle text-center">
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={isEligible}
                              disabled={!isEligible}
                              onChange={() => {
                                if (isEligible) toggleReimbursable(ride.id);
                              }}
                              className={`h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer ${
                                !isEligible ? 'opacity-40 cursor-not-allowed' : ''
                              }`}
                              title={isEligible ? 'Click Exclude in actions to uncheck' : 'Click Include in actions to check'}
                            />
                          </div>
                        </td>

                        {/* Provider */}
                        <td className="px-4 py-3 align-middle truncate">
                          <span
                            className={`px-2 py-0.5 text-[9px] rounded font-bold uppercase tracking-wider ${
                              ride.provider === 'Uber'
                                ? 'bg-slate-900 text-white shadow-3xs'
                                : 'bg-yellow-400 text-slate-900 shadow-3xs'
                            }`}
                          >
                            {ride.provider}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 align-middle truncate text-slate-800">
                          {rideDate}
                        </td>

                        {/* Time */}
                        <td className="px-4 py-3 align-middle truncate font-mono text-slate-500">
                          {rideTime}
                        </td>

                        {/* Pickup Location */}
                        <td className="px-4 py-3 align-middle max-w-[200px] truncate" title={getEffectivePickup(ride.pickup)}>
                          <div className="flex items-center gap-1.5 truncate">
                            {ride.edited?.pickup && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Custom edited pickup" />
                            )}
                            <span className="truncate">{getEffectivePickup(ride.pickup)}</span>
                          </div>
                        </td>

                        {/* Destination */}
                        <td className="px-4 py-3 align-middle max-w-[200px] truncate" title={getEffectiveDropoff(ride.dropoff)}>
                          <div className="flex items-center gap-1.5 truncate">
                            {ride.edited?.dropoff && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Custom edited dropoff" />
                            )}
                            <span className="truncate">{getEffectiveDropoff(ride.dropoff)}</span>
                          </div>
                        </td>

                        {/* Fare */}
                        <td className="px-4 py-3 text-right font-black align-middle font-mono text-slate-900">
                          <div className="flex items-center justify-end gap-1">
                            {ride.edited?.fare && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Custom edited fare" />
                            )}
                            <span>₹{Number(ride.fare || 0).toFixed(2)}</span>
                          </div>
                        </td>

                        {/* Status (Eligibility) */}
                        <td className="px-4 py-3 align-middle">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {isEligible ? (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] rounded-lg font-bold flex items-center gap-1 border border-emerald-100 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  <span>Eligible</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded-lg font-bold flex items-center gap-1 border border-slate-200/50 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  <span>Excluded</span>
                                </span>
                              )}

                              {isDupe && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-md flex items-center gap-0.5 shrink-0">
                                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> Duplicate
                                </span>
                              )}
                            </div>

                            {/* Show Dynamic Exclusion reason */}
                            {!isEligible && exclusionReason && (
                              <p className="text-[10px] text-slate-400 font-medium italic truncate max-w-[160px]" title={exclusionReason}>
                                {exclusionReason}
                              </p>
                            )}

                            {/* Show duplicate group resolver link */}
                            {isEligible && isDupeGroupConflict && (
                              <button
                                onClick={() => resolveDuplicate(ride.id)}
                                className="text-[9px] text-indigo-600 hover:text-indigo-800 font-bold block underline cursor-pointer"
                                title="Exclude other identical duplicates and keep only this one active"
                              >
                                Keep Only This
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Actions (View, Edit, Duplicate, Delete, Include/Exclude) */}
                        <td className="px-5 py-3 text-right align-middle">
                          <div className="flex items-center justify-end gap-2.5">
                            {/* Primary Include / Exclude Quick Toggle Text Button */}
                            {isEligible ? (
                              <button
                                onClick={() => toggleReimbursable(ride.id)}
                                className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer transition-all"
                                title="Exclude this ride from reimbursement totals"
                              >
                                Exclude
                              </button>
                            ) : (
                              <button
                                onClick={() => toggleReimbursable(ride.id)}
                                className="text-xs font-bold text-emerald-600 hover:text-emerald-800 hover:underline cursor-pointer transition-all"
                                title="Include this ride in reimbursement totals"
                              >
                                Include
                              </button>
                            )}

                            {/* Vertical Spacer Line */}
                            <span className="h-4 w-px bg-slate-200" />

                            {/* View Button */}
                            <button
                              onClick={() => handleOpenViewModal(ride)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                              title="View Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {/* Edit Button */}
                            <button
                              onClick={() => handleOpenEditModal(ride)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                              title="Edit Ride"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Duplicate Button */}
                            <button
                              onClick={() => handleDuplicateRide(ride)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                              title="Duplicate Ride"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Button (manual rides only) */}
                            {isManual && (
                              <button
                                onClick={() => deleteRideRow(ride.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                title="Delete Manual Ride"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Adaptive Cards View (hidden on large screens) */}
            <div className="block md:hidden divide-y divide-slate-100 p-4 space-y-4">
              {paginatedRides.map((ride) => {
                const isEligible = ride.isReimbursable;
                const isDupe = duplicatesMap.isDuplicate(ride.id);
                const rideDate = ride.dateOfRide || ride.dateReceived.split('T')[0];
                const rideTime = ride.timeOfRide || ride.timeReceived || '20:00';
                const isManual = isManualRide(ride);
                const exclusionReason = getExclusionReason(ride);

                return (
                  <div
                    key={ride.id}
                    className={`pt-4 first:pt-0 flex flex-col space-y-3 ${
                      !isEligible ? 'opacity-65 text-slate-400' : ''
                    }`}
                  >
                    {/* Header Row: Provider, Status and Fare */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 text-[8px] rounded font-extrabold uppercase tracking-wider ${
                            ride.provider === 'Uber' ? 'bg-slate-900 text-white' : 'bg-yellow-400 text-slate-900'
                          }`}
                        >
                          {ride.provider}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {rideDate} at {rideTime}
                        </span>
                      </div>
                      <span className="font-extrabold text-sm text-slate-900 font-mono">
                        ₹{Number(ride.fare || 0).toFixed(2)}
                      </span>
                    </div>

                    {/* Locations Grid */}
                    <div className="space-y-1 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100/50 text-left">
                      <div className="flex gap-1.5 text-[11px]">
                        <span className="text-slate-400 uppercase font-black text-[8px] tracking-wider w-8 pt-0.5">Pick</span>
                        <span className="font-semibold text-slate-700 truncate">{ride.pickup || '—'}</span>
                      </div>
                      <div className="flex gap-1.5 text-[11px]">
                        <span className="text-slate-400 uppercase font-black text-[8px] tracking-wider w-8 pt-0.5">Drop</span>
                        <span className="font-semibold text-slate-700 truncate">{ride.dropoff || '—'}</span>
                      </div>
                    </div>

                    {/* Badge flags */}
                    <div className="flex flex-wrap items-center gap-1.5 text-left">
                      {isEligible ? (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] rounded-md font-bold border border-emerald-100 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Eligible
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] rounded-md font-bold border border-slate-200/50 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          Excluded
                        </span>
                      )}

                      {isDupe && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-md">
                          Duplicate
                        </span>
                      )}

                      {!isEligible && exclusionReason && (
                        <span className="text-[10px] text-slate-400 font-medium italic block">
                          ({exclusionReason})
                        </span>
                      )}
                    </div>

                    {/* Bottom row: Quick action + secondary triggers */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                      {/* Left: Quick Include/Exclude */}
                      {isEligible ? (
                        <button
                          onClick={() => toggleReimbursable(ride.id)}
                          className="text-xs font-extrabold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                        >
                          Exclude Ride
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleReimbursable(ride.id)}
                          className="text-xs font-extrabold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                        >
                          Include Ride
                        </button>
                      )}

                      {/* Right: View, Edit, Duplicate, Delete */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenViewModal(ride)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(ride)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDuplicateRide(ride)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="Duplicate"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        {isManual && (
                          <button
                            onClick={() => deleteRideRow(ride.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 4. WORKSPACE PAGINATION FOOTER */}
        {sortedRides.length > 0 && (
          <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4 select-none text-left">
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 font-medium">
                Showing {Math.min(sortedRides.length, (currentPage - 1) * pageSize + 1)}-{Math.min(sortedRides.length, currentPage * pageSize)} of <span className="font-bold text-slate-800">{sortedRides.length}</span> matching rides
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none font-semibold cursor-pointer"
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>

            <div className="flex gap-1.5">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              {Array.from({ length: totalPages }).map((_, idx) => {
                const pageNum = idx + 1;
                if (totalPages > 6 && Math.abs(currentPage - pageNum) > 2 && pageNum !== 1 && pageNum !== totalPages) {
                  if (pageNum === 2 || pageNum === totalPages - 1) {
                    return <span key={idx} className="px-1 text-xs text-slate-400 select-none self-center">...</span>;
                  }
                  return null;
                }
                return (
                  <button
                    key={idx}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`min-w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      currentPage === pageNum
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. COMPLIANCE AUDIT WARNING ALERTS */}
      {!isValid && (
        <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-5 space-y-3 text-left">
          <div className="flex items-center gap-2 text-rose-800">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <h4 className="font-bold text-sm">Policy & Compliance Audits Detected Warnings</h4>
          </div>
          <p className="text-xs text-slate-600">
            Please resolve the validation warnings in the workspace before generating the final report for corporate reimbursement.
          </p>
          <ul className="space-y-2 mt-2">
            {validationErrors.map((err, idx) => (
              <li key={idx} className="bg-white p-3 rounded-xl border border-rose-100/50 text-xs text-rose-900 shadow-3xs">
                <p className="font-bold flex items-center gap-1 text-rose-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <span>{err.message}</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  <strong>Resolution:</strong> {err.action}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 6. OVERVIEW & GENERATION PANEL CARD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 text-left md:col-span-2">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">📋 Reimbursement Report Metadata</h3>
            <p className="text-xs text-slate-400">Review information gathered for Accounts Payable dispatch</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-100 pt-4 text-xs font-semibold">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">Claim Period:</span>
              <span className="text-slate-800 font-bold">
                {filters.startDate ? filters.startDate : '—'} to {filters.endDate ? filters.endDate : '—'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">Policy Hours Window:</span>
              <span className="text-slate-800 font-bold">
                After {filters.reimburseAfterTime === '20:00' ? '8:00 PM' : filters.reimburseAfterTime} IST
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">Claimant Employee:</span>
              <span className="text-slate-800 font-bold">{employeeName || '—'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">Claimant Email:</span>
              <span className="text-slate-800 font-bold truncate max-w-[180px]">{employeeEmail || '—'}</span>
            </div>
          </div>
        </div>

        {/* Generate Report Primary Submission Trigger */}
        <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-6 flex flex-col justify-center space-y-4">
          <div className="text-center md:text-left space-y-1">
            <h4 className="font-bold text-slate-800 text-xs">Reimbursement Submission</h4>
            <p className="text-[11px] text-slate-400">Generate compliance Sheets and PDFs instantly for finance dispatch.</p>
          </div>

          <div className="space-y-3">
            {onPreviewReport && (
              <button
                id="generate-claim-report-cta"
                onClick={onPreviewReport}
                disabled={totals.eligibleCount === 0}
                className={`w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 active:scale-98 transition-all shadow-lg shadow-indigo-100 cursor-pointer ${
                  totals.eligibleCount === 0 ? 'opacity-50 cursor-not-allowed bg-indigo-400 shadow-none' : ''
                }`}
                title="Preview and generate formal reimbursement reports"
              >
                <Sparkles className="w-4 h-4 text-indigo-100 shrink-0" />
                <span>GENERATE CLAIM REPORT</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* VIEW DETAILS MODAL */}
      <AnimatePresence>
        {isViewOpen && viewingRide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs select-none">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-100 p-6 max-w-lg w-full shadow-2xl space-y-5 text-left"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    <Info className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900">Receipt Details</h3>
                    <p className="text-[10px] text-slate-400">Full parameters for audit reference</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsViewOpen(false);
                    setViewingRide(null);
                  }}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Grid content */}
              <div className="space-y-4 text-xs font-semibold text-slate-700">
                
                {/* Provider, Date, Time & Fare Row */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Ride Provider</span>
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 text-[9px] rounded font-extrabold uppercase tracking-wider ${
                        viewingRide.provider === 'Uber' ? 'bg-slate-900 text-white' : 'bg-yellow-400 text-slate-900'
                      }`}
                    >
                      {viewingRide.provider}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Receipt Fare</span>
                    <span className="block mt-1 font-black text-sm text-slate-900 font-mono">
                      ₹{Number(viewingRide.fare || 0).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Ride Date</span>
                    <span className="block mt-0.5 text-slate-800 font-bold">
                      {viewingRide.dateOfRide || viewingRide.dateReceived.split('T')[0]}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Ride Time</span>
                    <span className="block mt-0.5 text-slate-800 font-mono">
                      {viewingRide.timeOfRide || viewingRide.timeReceived || '—'}
                    </span>
                  </div>
                </div>

                {/* Locations */}
                <div className="space-y-2 bg-indigo-50/20 p-3.5 rounded-2xl border border-indigo-100/30">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Pickup point</span>
                      <p className="text-slate-800 font-bold mt-0.5">{viewingRide.pickup || '—'}</p>
                    </div>
                  </div>
                  <div className="h-px bg-slate-100/50" />
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Destination Dropoff</span>
                      <p className="text-slate-800 font-bold mt-0.5">{viewingRide.dropoff || '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Secondary attributes hidden from main table */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Payment Method</span>
                    <div className="flex items-center gap-1.5 mt-1 text-slate-800 font-bold">
                      <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                      <span>{viewingRide.paymentMethod || 'UPI / GPay'}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Ride Booking ID</span>
                    <span className="block mt-1 font-mono text-slate-800 font-bold">
                      {viewingRide.rideId || '—'}
                    </span>
                  </div>
                </div>

                {/* Notes and Confidence */}
                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">AI Confidence Score</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                        viewingRide.confidence > 0.8 ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}>
                        {((viewingRide.confidence || 0.95) * 100).toFixed(0)}% Match
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Exclusion Status</span>
                    <div className="mt-1">
                      {viewingRide.isReimbursable ? (
                        <span className="text-emerald-700 font-bold">Eligible (Counted)</span>
                      ) : (
                        <span className="text-slate-500 font-bold">Excluded (Bypassed)</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notes Memo box if any */}
                {viewingRide.notes && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Notes / Custom Memo</span>
                    <p className="text-slate-600 font-medium italic mt-1 font-sans">"{viewingRide.notes}"</p>
                  </div>
                )}

                {/* Extra extracted parameters displays */}
                {((viewingRide as any).driverName || (viewingRide as any).tax !== undefined) && (
                  <div className="grid grid-cols-3 gap-2 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100/50 text-[10px]">
                    {/* Driver */}
                    <div>
                      <span className="text-slate-400 block font-bold">Driver Name</span>
                      <span className="font-semibold text-slate-700">{(viewingRide as any).driverName || '—'}</span>
                    </div>
                    {/* Tax */}
                    <div>
                      <span className="text-slate-400 block font-bold">GST / Tax</span>
                      <span className="font-semibold text-slate-700 font-mono">
                        {(viewingRide as any).tax !== undefined && (viewingRide as any).tax !== null ? `₹${(viewingRide as any).tax.toFixed(2)}` : '—'}
                      </span>
                    </div>
                    {/* Booking Fee */}
                    <div>
                      <span className="text-slate-400 block font-bold">Booking Fee</span>
                      <span className="font-semibold text-slate-700 font-mono">
                        {(viewingRide as any).bookingFee !== undefined && (viewingRide as any).bookingFee !== null ? `₹${(viewingRide as any).bookingFee.toFixed(2)}` : '—'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Subject & Gmail metadata */}
                <div className="border-t border-slate-100 pt-3 text-[10px] text-slate-400 space-y-1">
                  <div className="truncate">
                    <strong>Message Subject:</strong> {viewingRide.subject || 'Manually logged receipt'}
                  </div>
                  <div>
                    <strong>Thread Reference ID:</strong> <span className="font-mono text-[9px] bg-slate-50 px-1 py-0.5 rounded border border-slate-100">{viewingRide.threadId || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  onClick={() => {
                    setIsViewOpen(false);
                    setViewingRide(null);
                  }}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-800 transition-all active:scale-95 shadow-xs"
                >
                  Close Reference
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* UNIFIED ADD & EDIT MODAL (FOR BOTH MANUAL ADD & DETAILED EDIT) */}
      <AnimatePresence>
        {isEditorOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs select-none">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-100 p-6 max-w-lg w-full shadow-2xl space-y-5 text-left"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    {editorMode === 'add' ? <Plus className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900">
                      {editorMode === 'add' ? 'Add Manual Ride Receipt' : 'Edit Ride Receipt Details'}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      Configure corporate reimbursement parameters and live values
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditorOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEditor} className="space-y-4 text-xs font-semibold">
                {/* Provider Selector Tab */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ride Provider</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setEditorForm({ ...editorForm, provider: 'Uber' })}
                      className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-black transition-all cursor-pointer ${
                        editorForm.provider === 'Uber'
                          ? 'bg-slate-900 border-slate-950 text-white shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Uber
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorForm({ ...editorForm, provider: 'Rapido' })}
                      className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-black transition-all cursor-pointer ${
                        editorForm.provider === 'Rapido'
                          ? 'bg-yellow-400 border-yellow-500 text-slate-900 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Rapido
                    </button>
                  </div>
                </div>

                {/* Date & Time Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ride Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="date"
                        required
                        value={editorForm.dateOfRide}
                        onChange={(e) => setEditorForm({ ...editorForm, dateOfRide: e.target.value })}
                        className="block w-full bg-slate-50 border border-slate-200/60 focus:bg-white focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-xs outline-none transition-all font-semibold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ride Time</label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. 20:30"
                        value={editorForm.timeOfRide}
                        onChange={(e) => setEditorForm({ ...editorForm, timeOfRide: e.target.value })}
                        className="block w-full bg-slate-50 border border-slate-200/60 focus:bg-white focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-xs outline-none transition-all font-semibold font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Pickup and Dropoff Locations */}
                <div className="space-y-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pickup Location</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="Enter pickup address"
                        value={editorForm.pickup}
                        onChange={(e) => setEditorForm({ ...editorForm, pickup: e.target.value })}
                        className="block w-full bg-white border border-slate-200/60 focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-xs outline-none transition-all font-semibold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Destination Dropoff</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="Enter dropoff destination"
                        value={editorForm.dropoff}
                        onChange={(e) => setEditorForm({ ...editorForm, dropoff: e.target.value })}
                        className="block w-full bg-white border border-slate-200/60 focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-xs outline-none transition-all font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Financials: Fare & Payment Method */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Fare Amount (INR)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2 font-black text-indigo-500">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={editorForm.fare}
                        onChange={(e) => setEditorForm({ ...editorForm, fare: e.target.value })}
                        className="block w-full bg-slate-50 border border-indigo-200/50 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 rounded-xl pl-7 pr-3 py-2 text-xs outline-none transition-all font-extrabold font-mono text-indigo-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment Method</label>
                    <div className="relative">
                      <CreditCard className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <select
                        value={editorForm.paymentMethod}
                        onChange={(e) => setEditorForm({ ...editorForm, paymentMethod: e.target.value })}
                        className="block w-full bg-slate-50 border border-slate-200/60 focus:bg-white focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-xs outline-none transition-all font-semibold cursor-pointer"
                      >
                        <option value="UPI">UPI / GPay</option>
                        <option value="Corporate Card">Corporate Card</option>
                        <option value="Personal Card">Personal Card</option>
                        <option value="Paytm">Paytm Wallet</option>
                        <option value="Cash">Cash</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Ride ID & Notes Memo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ride Booking ID</label>
                    <input
                      type="text"
                      placeholder="e.g. CRN-12345"
                      value={editorForm.rideId}
                      onChange={(e) => setEditorForm({ ...editorForm, rideId: e.target.value })}
                      className="block w-full bg-slate-50 border border-slate-200/60 focus:bg-white focus:border-indigo-500 rounded-xl px-3 py-2 text-xs outline-none transition-all font-semibold font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notes / Memo (Optional)</label>
                    <div className="relative">
                      <MessageSquare className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 shadow-3xs" />
                      <input
                        type="text"
                        placeholder="Project ID, client name..."
                        value={editorForm.notes}
                        onChange={(e) => setEditorForm({ ...editorForm, notes: e.target.value })}
                        className="block w-full bg-slate-50 border border-slate-200/60 focus:bg-white focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2 text-xs outline-none transition-all font-semibold italic"
                      />
                    </div>
                  </div>
                </div>

                {/* Eligibility / Reimbursement Toggle status (Requested) */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Eligibility Status</span>
                    <p className="text-[10px] text-slate-400 font-medium">Reimburse this ride in reports</p>
                  </div>
                  <div className="flex bg-white p-0.5 rounded-lg border border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => setEditorForm({ ...editorForm, isReimbursable: true })}
                      className={`px-3 py-1 text-[10px] font-black rounded-md transition-all cursor-pointer ${
                        editorForm.isReimbursable ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500'
                      }`}
                    >
                      Eligible
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorForm({ ...editorForm, isReimbursable: false })}
                      className={`px-3 py-1 text-[10px] font-black rounded-md transition-all cursor-pointer ${
                        !editorForm.isReimbursable ? 'bg-slate-500 text-white shadow-xs' : 'text-slate-500'
                      }`}
                    >
                      Excluded
                    </button>
                  </div>
                </div>

                {/* Controls Footer */}
                <div className="flex gap-3 pt-3 border-t border-slate-100 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsEditorOpen(false)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold cursor-pointer transition-all active:scale-95 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black cursor-pointer transition-all active:scale-95 text-xs shadow-md shadow-indigo-100"
                  >
                    {editorMode === 'add' ? 'Add Ride Receipt' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
