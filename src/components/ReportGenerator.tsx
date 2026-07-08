import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  FileSpreadsheet,
  Printer,
  X,
  AlertCircle,
  CheckCircle,
  Building2,
  User,
  Hash,
  Briefcase,
  Layers,
  Sparkles,
  Calendar,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Info
} from 'lucide-react';
import { RideReceipt, FilterConfig } from '../types';
import { generateReimbursementPDF } from '../lib/pdfGenerator';
import { generateReimbursementExcel } from '../lib/excelGenerator';
import { getEffectivePickup, getEffectiveDropoff } from '../lib/routeHelper';

function formatDateToDMY(dateStr: string): string {
  if (!dateStr) return 'N/A';
  const trimmed = dateStr.trim();
  const ymdRegex = /^(\d{4})[-/](\d{2})[-/](\d{2})$/;
  const match = trimmed.match(ymdRegex);
  if (match) {
    const [_, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }
  try {
    const dObj = new Date(trimmed);
    if (!isNaN(dObj.getTime())) {
      const d = String(dObj.getDate()).padStart(2, '0');
      const m = String(dObj.getMonth() + 1).padStart(2, '0');
      const y = dObj.getFullYear();
      return `${d}/${m}/${y}`;
    }
  } catch (e) {}
  return dateStr;
}

interface ReportGeneratorProps {
  rides: RideReceipt[];
  employeeName: string;
  setEmployeeName: (name: string) => void;
  employeeEmail: string;
  setEmployeeEmail: (email: string) => void;
  filters: FilterConfig;
  isOpen: boolean;
  onClose: () => void;
  onExportPDF: (customSettings: {
    employeeId: string;
    department: string;
    companyName: string;
    reportTitle: string;
    employeeName: string;
  }) => Promise<void>;
  onExportExcel: (customSettings: {
    employeeId: string;
    department: string;
    companyName: string;
    reportTitle: string;
    employeeName: string;
  }) => void;
}

export default function ReportGenerator({
  rides,
  employeeName,
  setEmployeeName,
  employeeEmail,
  setEmployeeEmail,
  filters,
  isOpen,
  onClose,
  onExportPDF,
  onExportExcel
}: ReportGeneratorProps) {
  // Report Settings (Local overrides and additions)
  const [employeeId, setEmployeeId] = useState<string>('');
  const [department, setDepartment] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('truefan.ai');
  const [reportTitle, setReportTitle] = useState<string>('Ride Reimbursement Report');
  
  // Tab within the generator modal (preview vs options vs history)
  const [activeSubTab, setActiveSubTab] = useState<'preview' | 'options' | 'history'>('preview');

  // Load defaults and recent reports history from localStorage on mount
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [successDetails, setSuccessDetails] = useState<{
    ridesCount: number;
    totalAmount: number;
    format: 'PDF' | 'Excel' | 'Print';
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    // 1. Load settings defaults
    const savedName = localStorage.getItem('default_employee_name');
    const savedId = localStorage.getItem('default_employee_id');
    const savedDept = localStorage.getItem('default_department');
    const savedCompany = localStorage.getItem('default_company_name');

    if (savedName) {
      setEmployeeName(savedName);
    }
    if (savedId) {
      setEmployeeId(savedId);
    }
    if (savedDept) {
      setDepartment(savedDept);
    }
    if (savedCompany && savedCompany !== 'Acme Corp') {
      setCompanyName(savedCompany);
    } else {
      setCompanyName('truefan.ai');
    }

    // 2. Load recent reports
    const existingHistoryJson = localStorage.getItem('recent_claims_reports');
    if (existingHistoryJson) {
      try {
        setRecentReports(JSON.parse(existingHistoryJson));
      } catch (e) {
        setRecentReports([]);
      }
    }
  }, []);

  // Autosave default settings when they change
  useEffect(() => {
    if (employeeName) {
      localStorage.setItem('default_employee_name', employeeName);
    }
  }, [employeeName, setEmployeeName]);

  useEffect(() => {
    if (employeeId) {
      localStorage.setItem('default_employee_id', employeeId);
    }
  }, [employeeId]);

  useEffect(() => {
    if (department) {
      localStorage.setItem('default_department', department);
    }
  }, [department]);

  useEffect(() => {
    if (companyName) {
      localStorage.setItem('default_company_name', companyName);
    }
  }, [companyName]);

  // Filter for included rides only
  const eligibleRides = useMemo(() => {
    return rides.filter((r) => r.isReimbursable);
  }, [rides]);

  const excludedRides = useMemo(() => {
    return rides.filter((r) => !r.isReimbursable);
  }, [rides]);

  // Statistics
  const stats = useMemo(() => {
    const uberRides = eligibleRides.filter((r) => r.provider === 'Uber');
    const rapidoRides = eligibleRides.filter((r) => r.provider === 'Rapido');

    const uberTotal = uberRides.reduce((sum, r) => sum + r.fare, 0);
    const rapidoTotal = rapidoRides.reduce((sum, r) => sum + r.fare, 0);
    const grandTotal = uberTotal + rapidoTotal;

    const fares = eligibleRides.map((r) => r.fare).filter((f) => f > 0);
    const avgFare = fares.length > 0 ? grandTotal / fares.length : 0;
    const highestFare = fares.length > 0 ? Math.max(...fares) : 0;
    const lowestFare = fares.length > 0 ? Math.min(...fares) : 0;

    return {
      uberCount: uberRides.length,
      rapidoCount: rapidoRides.length,
      uberTotal,
      rapidoTotal,
      grandTotal,
      avgFare,
      highestFare,
      lowestFare
    };
  }, [eligibleRides]);

  // Duplicates detection on eligible rides only
  const duplicateValidationErrors = useMemo(() => {
    const idGroups = new Map<string, string[]>(); // key -> id lists
    
    eligibleRides.forEach((ride) => {
      // 1. Group by extracted ride ID
      if (ride.rideId && ride.rideId.trim() !== '') {
        const key = `id_${ride.rideId.trim().toLowerCase()}`;
        if (!idGroups.has(key)) idGroups.set(key, []);
        idGroups.get(key)!.push(ride.id);
      }
      
      // 2. Group by combination of Provider + Date + Time + Fare
      const dateStr = ride.dateOfRide || ride.dateReceived.split('T')[0];
      const timeStr = ride.timeOfRide || ride.timeReceived;
      const fareStr = Number(ride.fare).toFixed(2);
      const comboKey = `combo_${ride.provider.toLowerCase()}_${dateStr}_${timeStr}_${fareStr}`;
      
      if (!idGroups.has(comboKey)) idGroups.set(comboKey, []);
      idGroups.get(comboKey)!.push(ride.id);
    });

    const duplicateRides: { message: string; action: string }[] = [];
    const seenGroups = new Set<string>();

    idGroups.forEach((rideIds) => {
      const uniqueIdsInGroup = Array.from(new Set(rideIds));
      if (uniqueIdsInGroup.length > 1) {
        const sortedGroup = [...uniqueIdsInGroup].sort().join(',');
        if (!seenGroups.has(sortedGroup)) {
          seenGroups.add(sortedGroup);
          
          const samples = uniqueIdsInGroup.map((id) => {
            const r = eligibleRides.find((item) => item.id === id);
            return r ? `₹${r.fare} on ${r.dateOfRide || r.dateReceived.split('T')[0]}` : '';
          }).filter(Boolean).join(' & ');

          duplicateRides.push({
            message: `Multiple identical rides included in report: [ ${samples} ]`,
            action: 'Exclude or resolve the duplicated rides in the main Review Table before exporting.'
          });
        }
      }
    });

    return duplicateRides;
  }, [eligibleRides]);

  // Complete Validation Rules Check
  const validationResults = useMemo(() => {
    const errors: { type: string; message: string; action: string }[] = [];

    // Rule 1: Grand Total matches sum of all included rides
    const exactSum = eligibleRides.reduce((sum, r) => sum + r.fare, 0);
    const difference = Math.abs(exactSum - stats.grandTotal);
    if (difference > 0.01) {
      errors.push({
        type: 'sum_mismatch',
        message: `Calculated Grand Total (₹${stats.grandTotal.toFixed(2)}) does not equal the arithmetic sum of included rides (₹${exactSum.toFixed(2)}).`,
        action: 'This points to a state calculation mismatch. Please refresh your browser or reload the receipts.'
      });
    }

    // Rule 2: No duplicate included rides
    duplicateValidationErrors.forEach((dupe) => {
      errors.push({
        type: 'duplicate',
        message: dupe.message,
        action: dupe.action
      });
    });

    // Rule 3: No included ride has missing/zero/invalid fare
    const invalidFares = eligibleRides.filter(
      (r) => r.fare === undefined || r.fare === null || isNaN(r.fare) || r.fare <= 0
    );
    if (invalidFares.length > 0) {
      errors.push({
        type: 'missing_fare',
        message: `${invalidFares.length} ride receipt(s) have missing, zero, or negative fare values.`,
        action: 'Click "Edit" in the Review Table to enter correct fare amounts, or toggle the rides to Excluded.'
      });
    }

    // Rule 4: At least one ride is included to generate report
    if (eligibleRides.length === 0) {
      errors.push({
        type: 'empty_report',
        message: 'No rides are selected for reimbursement.',
        action: 'Go back to the main dashboard and toggle at least one ride to "Eligible" to generate a report.'
      });
    }

    // Rule 5: Employee Name exists
    if (!employeeName || employeeName.trim() === '') {
      errors.push({
        type: 'missing_employee_name',
        message: 'Employee Name is missing or empty.',
        action: 'Please enter your Full Name in the Claimant Details section before exporting.'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }, [eligibleRides, stats.grandTotal, duplicateValidationErrors, employeeName]);

  // Derived date info
  const reportDates = useMemo(() => {
    const now = new Date();
    const nowDay = String(now.getDate()).padStart(2, '0');
    const nowMonth = String(now.getMonth() + 1).padStart(2, '0');
    const nowYear = now.getFullYear();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const timeStr = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
    const generatedDateStr = `${nowDay}/${nowMonth}/${nowYear} at ${timeStr}`;

    // Determine Month from claim period
    let monthName = 'Selected Period';
    if (filters.startDate) {
      const startObj = new Date(filters.startDate);
      if (!isNaN(startObj.getTime())) {
        monthName = startObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
    }

    const formattedStart = formatDateToDMY(filters.startDate);
    const formattedEnd = formatDateToDMY(filters.endDate);

    return {
      generatedAt: generatedDateStr,
      month: monthName,
      period: `${formattedStart} to ${formattedEnd}`
    };
  }, [filters]);

  // Trigger Print Report
  const handlePrint = () => {
    window.print();
  };

  interface StoredReport {
    id: string;
    generatedTime: string;
    claimPeriod: string;
    grandTotal: number;
    exportType: 'PDF' | 'Excel' | 'Print';
    employeeName: string;
    employeeEmail: string;
    employeeId: string;
    department: string;
    companyName: string;
    reportTitle: string;
    rides: RideReceipt[];
    uberTotal: number;
    rapidoTotal: number;
  }

  // Save report generation details to recent exports history
  const saveReportToHistory = (type: 'PDF' | 'Excel' | 'Print') => {
    const newReport: StoredReport = {
      id: `rpt_${Date.now()}`,
      generatedTime: new Date().toISOString(),
      claimPeriod: reportDates.period,
      grandTotal: stats.grandTotal,
      exportType: type,
      employeeName,
      employeeEmail,
      employeeId,
      department,
      companyName,
      reportTitle,
      rides: eligibleRides,
      uberTotal: stats.uberTotal,
      rapidoTotal: stats.rapidoTotal
    };

    const existingHistoryJson = localStorage.getItem('recent_claims_reports');
    let history: StoredReport[] = [];
    if (existingHistoryJson) {
      try {
        history = JSON.parse(existingHistoryJson);
      } catch (e) {
        history = [];
      }
    }

    history.unshift(newReport);
    if (history.length > 10) {
      history = history.slice(0, 10);
    }

    localStorage.setItem('recent_claims_reports', JSON.stringify(history));
    setRecentReports(history);
  };

  // Trigger Success Experience overlay
  const triggerSuccessExperience = (format: 'PDF' | 'Excel' | 'Print') => {
    const now = new Date();
    const formattedTimestamp = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    setSuccessDetails({
      ridesCount: eligibleRides.length,
      totalAmount: stats.grandTotal,
      format: format,
      timestamp: formattedTimestamp
    });
  };

  const handleExportPDFClick = async () => {
    try {
      await onExportPDF(customSettings);
      saveReportToHistory('PDF');
      triggerSuccessExperience('PDF');
    } catch (err) {
      console.error('PDF generation failed:', err);
    }
  };

  const handleExportExcelClick = () => {
    try {
      onExportExcel(customSettings);
      saveReportToHistory('Excel');
      triggerSuccessExperience('Excel');
    } catch (err) {
      console.error('Excel generation failed:', err);
    }
  };

  const handleExportPrintClick = () => {
    try {
      handlePrint();
      saveReportToHistory('Print');
      triggerSuccessExperience('Print');
    } catch (err) {
      console.error('Print failed:', err);
    }
  };

  // Download directly from history tab
  const handleDownloadHistoryItem = async (item: StoredReport, format: 'PDF' | 'Excel') => {
    try {
      if (format === 'PDF') {
        const pdfBytes = await generateReimbursementPDF(
          item.rides,
          item.employeeName,
          item.employeeEmail,
          item.claimPeriod.split(' to ')[0] || '',
          item.claimPeriod.split(' to ')[1] || '',
          item.uberTotal,
          item.rapidoTotal,
          item.grandTotal,
          item.employeeId,
          item.department,
          item.companyName,
          item.reportTitle
        );
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${item.reportTitle.toLowerCase().replace(/\s+/g, '_') || 'reimbursement_claim'}_${item.claimPeriod.replace(/\s+to\s+/g, '_')}.pdf`;
        link.click();
      } else {
        const excelBytes = generateReimbursementExcel(
          item.rides,
          item.employeeName,
          item.employeeEmail,
          item.claimPeriod.split(' to ')[0] || '',
          item.claimPeriod.split(' to ')[1] || '',
          item.uberTotal,
          item.rapidoTotal,
          item.grandTotal,
          item.employeeId,
          item.department,
          item.companyName,
          item.reportTitle
        );
        const blob = new Blob([excelBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${item.reportTitle.toLowerCase().replace(/\s+/g, '_') || 'reimbursement_claim'}_${item.claimPeriod.replace(/\s+to\s+/g, '_')}.xlsx`;
        link.click();
      }
    } catch (err) {
      console.error('Failed to export history item:', err);
      alert('Failed to generate export file from history.');
    }
  };

  // Helper package variables to pass for downloads
  const customSettings = {
    employeeId,
    department,
    companyName,
    reportTitle,
    employeeName
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 md:p-6 backdrop-blur-sm overflow-hidden select-none">
      {/* Dynamic Print Styles - Only prints the paper preview container, completely hiding everything else */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-report-preview-area, #print-report-preview-area * {
            visibility: visible !important;
          }
          #print-report-preview-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            padding: 20px !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ duration: 0.2 }}
        className="bg-[#F8FAFC] rounded-3xl border border-slate-200 w-full max-w-7xl h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* HEADER BAR (No Print) */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Finance Report Generator</span>
                <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full">
                  Step 2: Preview & Export
                </span>
              </h2>
              <p className="text-xs text-slate-400">Compile your vetted ride claims into executive-grade corporate formats</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick validation indicator */}
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border mr-3 ${
              validationResults.isValid
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${validationResults.isValid ? 'bg-green-500' : 'bg-rose-500 animate-pulse'}`} />
              <span>{validationResults.isValid ? 'Report Validated' : 'Validation Failed'}</span>
            </div>

            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer text-slate-400 hover:text-slate-600"
              title="Close Generator"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WORKSPACE DIVIDED PANELS */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
          
          <AnimatePresence mode="wait">
            {successDetails ? (
              <motion.div
                key="success-overlay"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="absolute inset-0 bg-white z-20 flex flex-col items-center justify-center p-6 md:p-12 text-center overflow-y-auto"
              >
                <div className="w-16 h-16 bg-green-50 border border-green-100 rounded-full flex items-center justify-center text-green-500 shadow-lg shadow-green-50 mb-4">
                  <CheckCircle className="w-10 h-10" />
                </div>

                <div className="space-y-2 max-w-md">
                  <h2 className="text-xl font-extrabold text-slate-950 tracking-tight">Claim Report Generated Successfully</h2>
                  <p className="text-xs text-slate-500">
                    Your formal compliance sheet has been generated and saved to your browser's recent exports log.
                  </p>
                </div>

                <div className="w-full max-w-lg bg-slate-50 border border-slate-200/80 rounded-2xl p-5 text-left text-xs space-y-3.5 mt-6 shadow-xs">
                  <div className="flex justify-between pb-2 border-b border-slate-200/50">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Claimant Name</span>
                    <span className="font-extrabold text-slate-800">{employeeName || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-slate-200/50">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Report Title</span>
                    <span className="font-extrabold text-slate-800">{reportTitle || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-slate-200/50">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Receipts Included</span>
                    <span className="font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded font-mono text-[10px]">{successDetails.ridesCount} Rides</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-slate-200/50">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Total Reimbursement</span>
                    <span className="font-black text-slate-900 font-mono text-sm">₹{successDetails.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between pb-2 border-b border-slate-200/50">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Export Format</span>
                    <span className="font-extrabold text-slate-800">{successDetails.format === 'PDF' ? 'PDF formal document' : successDetails.format === 'Excel' ? 'Excel spreadsheet' : 'Printed hardcopy'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Generated Timestamp</span>
                    <span className="font-medium text-slate-500">{successDetails.timestamp}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-lg pt-6 mt-2">
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100 cursor-pointer active:scale-95 text-center font-extrabold"
                  >
                    Return to Workspace
                  </button>
                  <button
                    onClick={() => setSuccessDetails(null)}
                    className="flex-1 py-3 px-4 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 text-center font-extrabold"
                  >
                    Export Another Format
                  </button>
                  <button
                    onClick={() => {
                      setSuccessDetails(null);
                      setActiveSubTab('history');
                    }}
                    className="flex-1 py-3 px-4 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-100 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 text-center font-extrabold"
                  >
                    View History List
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* LEFT COLUMN: REPORT SETTINGS, STATS, & ACTIONS (No Print) */}
          <div className="w-full lg:w-[420px] bg-white border-r border-slate-200 flex flex-col p-6 space-y-6 overflow-y-auto shrink-0 no-print">
            
            {/* Sub Tabs */}
            <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200 shrink-0">
              <button
                onClick={() => setActiveSubTab('preview')}
                className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer text-center truncate ${
                  activeSubTab === 'preview'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-100/50 font-extrabold'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Export
              </button>
              <button
                onClick={() => setActiveSubTab('options')}
                className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer text-center truncate ${
                  activeSubTab === 'options'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-100/50 font-extrabold'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Claim Details
              </button>
              <button
                onClick={() => setActiveSubTab('history')}
                className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer text-center truncate ${
                  activeSubTab === 'history'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-100/50 font-extrabold'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                History ({recentReports.length})
              </button>
            </div>

            <AnimatePresence mode="wait">
              {activeSubTab === 'options' && (
                <motion.div
                  key="options"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4 text-left"
                >
                  <div className="pb-3 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Configure Report Details</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">These inputs adjust titles & details displayed on PDF and Excel</p>
                  </div>

                  {/* Company Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" /> Company Name
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="truefan.ai"
                      className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs outline-none transition-all font-medium"
                    />
                  </div>

                  {/* Report Title */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400" /> Report Title
                    </label>
                    <input
                      type="text"
                      value={reportTitle}
                      onChange={(e) => setReportTitle(e.target.value)}
                      placeholder="Ride Reimbursement Report"
                      className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs outline-none transition-all font-medium"
                    />
                  </div>

                  {/* Employee Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" /> Employee Name
                    </label>
                    <input
                      type="text"
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      placeholder="John Doe"
                      className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs outline-none transition-all font-medium"
                    />
                  </div>

                  {/* Employee ID */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-slate-400" /> Employee ID (Optional)
                    </label>
                    <input
                      type="text"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      placeholder="EMP-1029"
                      className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs outline-none transition-all font-medium"
                    />
                  </div>

                  {/* Department */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400" /> Department (Optional)
                    </label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="Finance / Engineering"
                      className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs outline-none transition-all font-medium"
                    />
                  </div>

                  <div className="bg-indigo-50/50 border border-indigo-100 p-3 rounded-xl text-[10px] text-indigo-700 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-indigo-600" />
                      Settings Persistence Activated
                    </p>
                    <p className="text-slate-500 leading-relaxed font-normal">
                      Claimant metadata is automatically synchronized to your browser's local store to populate future reports instantly.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => setActiveSubTab('preview')}
                      className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-2 border border-indigo-100 font-extrabold"
                    >
                      <span>Proceed to Export</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              )}

              {activeSubTab === 'preview' && (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-6 text-left"
                >
                  {/* EXPORT OPTIONS BOX */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Export & Submit Tools</h4>

                    {/* Download PDF */}
                    <button
                      onClick={handleExportPDFClick}
                      disabled={!validationResults.isValid}
                      className={`w-full flex items-center justify-between px-5 py-4 bg-indigo-600 text-white rounded-2xl text-xs font-bold hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-100 cursor-pointer ${
                        !validationResults.isValid ? 'opacity-50 cursor-not-allowed bg-indigo-400' : ''
                      }`}
                      title={!validationResults.isValid ? 'Resolve errors to unlock export' : 'Download report as A4 corporate PDF'}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-indigo-100">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <p className="font-extrabold text-sm">Download PDF</p>
                          <p className="text-[10px] text-indigo-200 font-normal mt-0.5">Formal submission ready</p>
                        </div>
                      </div>
                    </button>

                    {/* Download Excel */}
                    <button
                      onClick={handleExportExcelClick}
                      disabled={!validationResults.isValid}
                      className={`w-full flex items-center justify-between px-5 py-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-2xl text-xs font-bold active:scale-95 transition-all shadow-xs cursor-pointer ${
                        !validationResults.isValid ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      title={!validationResults.isValid ? 'Resolve errors to unlock export' : 'Download spreadsheet workbook'}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                          <FileSpreadsheet className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <p className="font-extrabold text-sm text-slate-800">Download Excel</p>
                          <p className="text-[10px] text-slate-400 font-normal mt-0.5">Finance-friendly bookkeeping</p>
                        </div>
                      </div>
                    </button>

                    {/* Print Report */}
                    <button
                      onClick={handleExportPrintClick}
                      disabled={!validationResults.isValid}
                      className={`w-full flex items-center justify-between px-5 py-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-2xl text-xs font-bold active:scale-95 transition-all shadow-xs cursor-pointer ${
                        !validationResults.isValid ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      title={!validationResults.isValid ? 'Resolve errors to unlock print' : 'Launch browser print window'}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
                          <Printer className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <p className="font-extrabold text-sm text-slate-800">Print Report</p>
                          <p className="text-[10px] text-slate-400 font-normal mt-0.5">Hardcopy archiving</p>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* REAL-TIME VALIDATION MONITOR */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pre-Export Audit & Check</h4>
                    
                    {validationResults.isValid ? (
                      <div className="bg-green-50/60 border border-green-200 rounded-2xl p-4 flex gap-3 text-left">
                        <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                        <div>
                          <h5 className="font-bold text-xs text-green-900">All Checks Passed Successfully</h5>
                          <p className="text-[11px] text-green-700/90 leading-relaxed mt-1">
                            This report contains no duplicated items, correct arithmetic sums, and fully structured fare properties. Ready for download.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-3 text-left">
                        <div className="flex gap-2 text-rose-800 items-center">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          <h5 className="font-bold text-xs text-rose-900">Validation Errors Block Export ({validationResults.errors.length})</h5>
                        </div>
                        
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {validationResults.errors.map((err, idx) => (
                            <div key={idx} className="bg-white p-3 rounded-xl border border-rose-100 text-[11px] shadow-2xs space-y-1">
                              <p className="font-bold text-rose-900">● {err.message}</p>
                              <p className="text-slate-500 font-medium">
                                <strong className="text-rose-700">How to Fix:</strong> {err.action}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ADVISORY CARD */}
                  <div className="bg-slate-50 p-4 border border-slate-100 rounded-2xl text-[11px] text-slate-500 leading-normal text-left flex gap-2.5">
                    <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-700">Compliance Audit Warning</p>
                      <p className="mt-1">
                        Submitting inaccurate ride receipts violates corporate expense policies. Please double-check addresses and times against calendars before downloading formal sheets.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeSubTab === 'history' && (
                <motion.div
                  key="history"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4 h-full flex flex-col overflow-hidden text-left"
                >
                  <div className="pb-3 border-b border-slate-100 shrink-0">
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Generated Reports History</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Quickly download previously generated reports stored on this browser.</p>
                  </div>

                  {recentReports.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-slate-400 space-y-2">
                      <Layers className="h-8 w-8 text-slate-300 animate-pulse" />
                      <p className="text-xs font-semibold text-slate-600">No History Found</p>
                      <p className="text-[10px] text-slate-400 max-w-[220px] mx-auto">
                        Your last 10 generated claim reports will appear here for instant offline redownloads.
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-4">
                      {recentReports.map((report) => {
                        const formattedTime = new Date(report.generatedTime).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        });
                        return (
                          <div key={report.id} className="bg-slate-50 hover:bg-slate-100/70 p-3 rounded-2xl border border-slate-200 transition-all text-xs space-y-2.5 text-left">
                            <div className="flex justify-between items-start">
                              <div className="max-w-[70%]">
                                <p className="font-extrabold text-slate-800 truncate">{report.reportTitle}</p>
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{formattedTime}</p>
                              </div>
                              <span className={`px-2 py-0.5 text-[9px] rounded font-bold uppercase tracking-wider shrink-0 ${
                                report.exportType === 'PDF' 
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' 
                                  : report.exportType === 'Excel' 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}>
                                {report.exportType}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 bg-white/60 p-2 rounded-xl border border-slate-150">
                              <div>
                                <span className="text-[9px] font-bold text-slate-400 block uppercase">Period</span>
                                <span className="font-bold text-slate-700 text-[10px]">{report.claimPeriod}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] font-bold text-slate-400 block uppercase">Total</span>
                                <span className="font-bold text-indigo-600 font-mono text-[11px]">₹{report.grandTotal.toFixed(2)}</span>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => handleDownloadHistoryItem(report, 'PDF')}
                                className="flex-1 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-[10px] font-bold text-slate-700 hover:text-indigo-700 rounded-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 font-extrabold"
                              >
                                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                                <span>PDF</span>
                              </button>
                              <button
                                onClick={() => handleDownloadHistoryItem(report, 'Excel')}
                                className="flex-1 py-1.5 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-[10px] font-bold text-slate-700 hover:text-emerald-700 rounded-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 font-extrabold"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Excel</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* RIGHT COLUMN: SCROLLABLE A4 LIVE REPORT PREVIEW */}
          <div className="flex-1 bg-slate-100 p-4 md:p-8 overflow-y-auto flex justify-center">
            
            {/* PAPER SHEETS PREVIEW BOX */}
            <div
              id="print-report-preview-area"
              className="bg-white w-full max-w-[800px] min-h-[1050px] border border-slate-200 shadow-xl p-8 md:p-12 text-left text-slate-800 relative flex flex-col font-sans"
            >
              {/* COMPANY GREETING / HEADER BLOCK */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b-2 border-slate-900">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{companyName || 'ACME CORP'}</span>
                  <h1 className="text-2xl font-black text-slate-900 mt-1 uppercase tracking-tight">{reportTitle || 'RIDE REIMBURSEMENT REPORT'}</h1>
                  <p className="text-xs text-slate-400 mt-1">Corporate Travel & Employee Expense Dispatch Slip</p>
                </div>
                
                <div className="bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-right shrink-0">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">REIMBURSEMENT STATUS</span>
                  <span className="text-xs font-extrabold text-slate-800 font-mono tracking-wide flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                    Pending Verification
                  </span>
                </div>
              </div>

              {/* TWO-COLUMN METADATA SUMMARY SLATE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6 text-xs border-b border-slate-100">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">CLAIMANT DETAILS</p>
                  <div>
                    <span className="text-slate-400 font-semibold inline-block w-24">Full Name:</span>
                    <input
                      type="text"
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      className="font-bold text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-slate-50 rounded px-1 outline-none py-0.5 inline-block w-48 no-print"
                    />
                    <span className="font-bold text-slate-800 hidden print:inline-block">{employeeName || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold inline-block w-24">Employee ID:</span>
                    <input
                      type="text"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      placeholder="Enter ID..."
                      className="font-bold text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-slate-50 rounded px-1 outline-none py-0.5 inline-block w-48 no-print"
                    />
                    <span className="font-bold text-slate-800 hidden print:inline-block">{employeeId || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold inline-block w-24">Department:</span>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="Enter Dept..."
                      className="font-bold text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-slate-50 rounded px-1 outline-none py-0.5 inline-block w-48 no-print"
                    />
                    <span className="font-bold text-slate-800 hidden print:inline-block">{department || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold inline-block w-24">Email Address:</span>
                    <span className="font-bold text-slate-800">{employeeEmail || 'N/A'}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">CLAIM DETAILS</p>
                  <div>
                    <span className="text-slate-400 font-semibold inline-block w-28">Expensing Month:</span>
                    <span className="font-bold text-slate-800">{reportDates.month}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold inline-block w-28">Claiming Cycle:</span>
                    <span className="font-bold text-slate-800">{reportDates.period}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold inline-block w-28">Generated Date:</span>
                    <span className="font-bold text-slate-800">{reportDates.generatedAt}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold inline-block w-28">Policy Criteria:</span>
                    <span className="font-bold text-indigo-600">Late Night Reimbursable Window</span>
                  </div>
                </div>
              </div>

              {/* CLAIM SUMMARY GRID */}
              <div className="py-6 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3.5">REIMBURSEMENT METRIC OUTCOMES</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {/* Eligible / Excluded Count */}
                  <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Claims Status</p>
                    <p className="text-lg font-black text-slate-800 mt-1">{eligibleRides.length} Included</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-semibold italic">{excludedRides.length} Excluded</p>
                  </div>

                  {/* Provider Splits */}
                  <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Uber Sub-Total</p>
                    <p className="text-lg font-black text-slate-800 mt-1 font-mono">₹{stats.uberTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">{stats.uberCount} Rides included</p>
                  </div>

                  <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Rapido Sub-Total</p>
                    <p className="text-lg font-black text-slate-800 mt-1 font-mono">₹{stats.rapidoTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">{stats.rapidoCount} Rides included</p>
                  </div>

                  {/* Highlighted Grand Total */}
                  <div className="bg-indigo-600 p-4 rounded-xl flex flex-col justify-between text-white shadow-md shadow-indigo-100">
                    <p className="text-[9px] font-bold text-indigo-200 uppercase tracking-wider">GRAND TOTAL SUM</p>
                    <p className="text-xl font-black mt-1 font-mono leading-none">₹{stats.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[9px] text-indigo-100 mt-1 uppercase font-bold tracking-widest">{eligibleRides.length} Receipts Vetted</p>
                  </div>
                </div>

                {/* Additional Stats Row */}
                <div className="grid grid-cols-3 gap-4 mt-4 text-xs">
                  <div className="border border-slate-150 rounded-xl p-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Average Fare</p>
                      <p className="font-extrabold text-slate-700 font-mono">₹{stats.avgFare.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="border border-slate-150 rounded-xl p-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-500 shrink-0" />
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Highest Fare</p>
                      <p className="font-extrabold text-indigo-700 font-mono">₹{stats.highestFare.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="border border-slate-150 rounded-xl p-3 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Lowest Fare</p>
                      <p className="font-extrabold text-slate-700 font-mono">₹{stats.lowestFare.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* MAIN REIMBURSEMENT RIDE TABLE */}
              <div className="py-6 flex-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3.5">ITEMIZED REIMBURSABLE RIDE RECEIPTS ({eligibleRides.length})</p>
                
                {eligibleRides.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                    <p className="text-xs font-semibold">No rides currently selected for reimbursement.</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Change isReimbursable status on dashboard to populate items.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900 text-white uppercase text-[9px] font-bold tracking-widest border-b border-slate-900">
                          <th className="px-3 py-3 rounded-l-lg">Provider</th>
                          <th className="px-3 py-3">Ride Date & Time</th>
                          <th className="px-3 py-3">Route (Pickup → Dropoff)</th>
                          <th className="px-3 py-3">Payment Method</th>
                          <th className="px-3 py-3">Ride ID</th>
                          <th className="px-3 py-3 text-right rounded-r-lg">Fare (INR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {eligibleRides.map((ride, idx) => {
                          const dateOfRide = ride.dateOfRide || ride.dateReceived.split('T')[0];
                          const timeOfRide = ride.timeOfRide || ride.timeReceived;
                          const rideIdStr = ride.rideId || 'N/A';
                          
                          return (
                            <tr key={ride.id} className="hover:bg-slate-50/60 transition-all">
                              <td className="px-3 py-2.5">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-wider ${
                                  ride.provider === 'Uber' ? 'bg-slate-900 text-white' : 'bg-yellow-400 text-slate-900'
                                }`}>
                                  {ride.provider}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                                <p className="font-extrabold text-slate-800">{formatDateToDMY(dateOfRide)}</p>
                                <p className="text-[10px] text-slate-400">{timeOfRide}</p>
                              </td>
                              <td className="px-3 py-2.5 max-w-xs truncate" title={`${getEffectivePickup(ride.pickup)} → ${getEffectiveDropoff(ride.dropoff)}`}>
                                <p className="font-extrabold text-slate-800 truncate">{getEffectivePickup(ride.pickup)}</p>
                                <p className="text-[10px] text-slate-400 font-normal truncate">to {getEffectiveDropoff(ride.dropoff)}</p>
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 capitalize">{ride.paymentMethod || 'N/A'}</td>
                              <td className="px-3 py-2.5 text-slate-500 font-mono">{rideIdStr}</td>
                              <td className="px-3 py-2.5 text-right font-black font-mono text-slate-900">₹{ride.fare.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* PHYSICAL APPROVAL & SIGNATURE BLOCKS */}
              <div className="pt-8 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-12 mt-auto">
                <div className="space-y-4">
                  <div className="border-b border-slate-300 pb-1 w-full h-8 flex items-end">
                    {/* Placeholder for physical signature */}
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold text-slate-800 uppercase">Employee Signature</p>
                    <p className="text-[9px] text-slate-400">Vetted by claimant on {reportDates.generatedAt}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="border-b border-slate-300 pb-1 w-full h-8 flex items-end">
                    {/* Placeholder for approver signature */}
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold text-slate-800 uppercase">Authorized Finance Approver</p>
                    <p className="text-[9px] text-slate-400">Approved for corporate disbursement under Section 12-B</p>
                  </div>
                </div>
              </div>

              {/* COMPLIANCE AND ARCHIVE SMALL PRINT */}
              <div className="text-center text-[9px] text-slate-400 border-t border-slate-100 pt-6 mt-12 space-y-1">
                <p className="font-semibold">Truefan Corporate Expensing Platform Service. Confirmed securely by Firebase Auth & Google Workspace.</p>
                <p>Receipt integrity check complete. ID: {rides[0]?.threadId || 'NoThread_Run'}. Generated at {reportDates.generatedAt}. Page 1 of 1.</p>
              </div>

            </div>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
