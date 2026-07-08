import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  googleSignIn,
  initAuth,
  logout,
  getAccessToken
} from './lib/firebase';
import {
  buildGmailQuery,
  fetchGmailMessages,
  fetchMessageDetails
} from './lib/gmail';
import {
  extractWithRegex,
  extractWithDOM
} from './lib/parser';
import { generateReimbursementPDF } from './lib/pdfGenerator';
import { generateReimbursementExcel } from './lib/excelGenerator';
import { getEffectivePickup, getEffectiveDropoff } from './lib/routeHelper';
import { RideReceipt, FilterConfig } from './types';
import ClaimReview from './components/ClaimReview';
import ReportGenerator from './components/ReportGenerator';
import {
  LogOut,
  Mail,
  Calendar,
  Filter,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  Clock,
  Trash2,
  Edit2,
  CheckCircle,
  XCircle,
  ChevronRight,
  User as UserIcon,
  Search,
  Check,
  X,
  Plus,
  AlertCircle,
  Grid,
  Settings,
  Terminal,
  Upload,
  History,
  Sparkles
} from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [fetching, setFetching] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number; stage: string }>({
    current: 0,
    total: 0,
    stage: ''
  });

  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'manual'>('dashboard');
  const [showReportGenerator, setShowReportGenerator] = useState<boolean>(false);

  // Manual / Paste Receipt States
  const [pasteText, setPasteText] = useState<string>('');
  const [pasteProvider, setPasteProvider] = useState<'Uber' | 'Rapido'>('Uber');
  const [isExtractingManual, setIsExtractingManual] = useState<boolean>(false);
  const [manualExtractError, setManualExtractError] = useState<string | null>(null);
  const [manualExtractedData, setManualExtractedData] = useState<any | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Employee meta (for reports)
  const [employeeName, setEmployeeName] = useState<string>(() => localStorage.getItem('default_employee_name') || '');
  const [employeeEmail, setEmployeeEmail] = useState<string>(() => localStorage.getItem('reimbursement_employee_email') || localStorage.getItem('default_employee_email') || '');
  const [employeeId, setEmployeeId] = useState<string>(() => localStorage.getItem('reimbursement_employee_id') || localStorage.getItem('default_employee_id') || '');
  const [department, setDepartment] = useState<string>(() => localStorage.getItem('reimbursement_department') || localStorage.getItem('default_department') || '');
  const [companyName, setCompanyName] = useState<string>(() => {
    const saved = localStorage.getItem('reimbursement_company_name') || localStorage.getItem('default_company_name');
    if (!saved || saved === 'Acme Corp') {
      return 'truefan.ai';
    }
    return saved;
  });
  const [reimbursementWindow, setReimbursementWindow] = useState<number>(() => {
    const w = localStorage.getItem('reimbursement_window');
    return w ? parseInt(w, 10) : 12;
  });
  const [preferredFormat, setPreferredFormat] = useState<'PDF' | 'Excel' | 'Both'>(() => {
    return (localStorage.getItem('reimbursement_preferred_format') as any) || 'Both';
  });
  const [showSetupWizard, setShowSetupWizard] = useState<boolean>(false);
  const [smartHistoryMatch, setSmartHistoryMatch] = useState<any | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Filters state
  const [filters, setFilters] = useState<FilterConfig>({
    startDate: '',
    endDate: '',
    providers: {
      uber: true,
      rapido: true
    },
    reimburseAfterTime: '20:00' // 8:00 PM
  });

  // Receipts State
  const [rides, setRides] = useState<RideReceipt[]>([]);
  const [selectedRide, setSelectedRide] = useState<RideReceipt | null>(null);

  // Manual Editing State
  const [editingRideId, setEditingRideId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{
    fare: number;
    pickup: string;
    dropoff: string;
    dateOfRide: string;
    timeOfRide: string;
    isReimbursable: boolean;
  }>({
    fare: 0,
    pickup: '',
    dropoff: '',
    dateOfRide: '',
    timeOfRide: '',
    isReimbursable: true
  });

  // Developer Debug Panel State
  const [debugQuery, setDebugQuery] = useState<string>('');
  const [debugTotalMessages, setDebugTotalMessages] = useState<number>(0);
  const [debugParsedMessages, setDebugParsedMessages] = useState<any[]>([]);
  const [debugRejectedMessages, setDebugRejectedMessages] = useState<any[]>([]);
  const [debugParsingErrors, setDebugParsingErrors] = useState<any[]>([]);
  const [debugTimeDecisions, setDebugTimeDecisions] = useState<any[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false);
  const [debugDiagnostics, setDebugDiagnostics] = useState<{ query: string; count: number | null; error?: string }[]>([]);
  const [debugPipelineLogs, setDebugPipelineLogs] = useState<any[]>([]);

  // Set default dates and parameters on load
  useEffect(() => {
    const today = new Date();
    const firstDayPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    const formatDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const savedTime = localStorage.getItem('default_reimbursement_time') || '20:00';

    setFilters((prev) => ({
      ...prev,
      startDate: formatDate(firstDayPrevMonth),
      endDate: formatDate(lastDayPrevMonth),
      reimburseAfterTime: savedTime
    }));
  }, []);

  // Initialize Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setIsAuthenticated(true);
        setAuthLoading(false);

        // Load persisted values or fallback to Google Profile
        const savedName = localStorage.getItem('default_employee_name');
        const savedEmail = localStorage.getItem('reimbursement_employee_email') || localStorage.getItem('default_employee_email');
        
        if (savedName) {
          setEmployeeName(savedName);
        } else if (currentUser.displayName) {
          setEmployeeName(currentUser.displayName);
          localStorage.setItem('default_employee_name', currentUser.displayName);
        }

        if (savedEmail) {
          setEmployeeEmail(savedEmail);
        } else if (currentUser.email) {
          setEmployeeEmail(currentUser.email);
          localStorage.setItem('reimbursement_employee_email', currentUser.email);
          localStorage.setItem('default_employee_email', currentUser.email);
        }
      },
      () => {
        setUser(null);
        setToken(null);
        setIsAuthenticated(false);
        setAuthLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Check for Setup Wizard completion
  useEffect(() => {
    if (isAuthenticated) {
      const completed = localStorage.getItem('reimbursement_setup_wizard_completed');
      if (completed !== 'true') {
        setShowSetupWizard(true);
      }
    }
  }, [isAuthenticated]);

  const handleLogin = async () => {
    if (loginLoading) return;
    setLoginLoading(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setIsAuthenticated(true);
        if (result.user.displayName) setEmployeeName(result.user.displayName);
        if (result.user.email) setEmployeeEmail(result.user.email);
      }
    } catch (err: any) {
      console.error('Authentication Error:', err);
      const errorCode = err?.code || '';
      const errorMessage = err?.message || '';
      
      if (errorCode === 'auth/popup-closed-by-user' || errorMessage.includes('popup-closed-by-user') || errorMessage.includes('closed by user')) {
        setAuthError('The sign-in popup was closed before completion. Please click "Sign in with Google" again, and keep the popup open until authentication finishes.');
      } else if (errorCode === 'auth/popup-blocked' || errorMessage.includes('popup-blocked') || errorMessage.includes('blocked')) {
        setAuthError('The Google sign-in popup was blocked by your browser. Please allow popups for this site and try again.');
      } else if (errorCode === 'auth/cancelled-popup-request' || errorMessage.includes('cancelled-popup-request')) {
        setAuthError('Another sign-in request is already in progress. Please wait a moment and try again.');
      } else {
        setAuthError(err?.message || 'Failed to authenticate. Please make sure popups and third-party cookies are enabled, or try opening the app in a new tab.');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setRides([]);
    setSelectedRide(null);
  };

  const checkInside12HourWindow = (
    emailDateStrIST: string, // YYYY-MM-DD in IST
    emailTimeStrIST: string, // HH:MM in IST
    selectedTimeStr: string  // HH:MM (Selected Time)
  ) => {
    const [selHour, selMin] = selectedTimeStr.split(':').map(Number);
    const [recHour, recMin] = emailTimeStrIST.split(':').map(Number);

    const selMins = selHour * 60 + selMin;
    const recMins = recHour * 60 + recMin;
    const windowHours = reimbursementWindow; // Dynamic window duration
    const windowMins = windowHours * 60;

    // End hour & min
    const endHour = (selHour + windowHours) % 24;
    const endMin = selMin;

    const windowStartText = `${String(selHour).padStart(2, '0')}:${String(selMin).padStart(2, '0')}`;
    const windowEndText = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')} ${selHour + windowHours >= 24 ? '(next day)' : '(same day)'}`;
    const windowText = `${windowStartText} to ${windowEndText}`;

    // Check same-day window: [selMins, selMins + windowMins]
    if (recMins >= selMins && recMins <= selMins + windowMins) {
      return {
        inside: true,
        reason: `INCLUDED: Received at ${emailTimeStrIST} IST on ${emailDateStrIST}, which is inside the ${windowHours}-hour window [${windowText}] starting on ${emailDateStrIST}.`,
        windowStart: windowStartText,
        windowEnd: windowEndText,
        windowText
      };
    }

    // Check previous-day window: if selMins + windowMins > 1440, it overflows to the next day's morning
    if (selMins + windowMins > 1440) {
      const nextDayEndMins = (selMins + windowMins) - 1440;
      if (recMins <= nextDayEndMins) {
        return {
          inside: true,
          reason: `INCLUDED: Received at ${emailTimeStrIST} IST on ${emailDateStrIST}, which is inside the ${windowHours}-hour window [${windowText}] starting on the previous day.`,
          windowStart: windowStartText,
          windowEnd: windowEndText,
          windowText
        };
      }
    }

    return {
      inside: false,
      reason: `EXCLUDED: Received at ${emailTimeStrIST} IST on ${emailDateStrIST}, which is outside the daily ${windowHours}-hour window [${windowText}].`,
      windowStart: windowStartText,
      windowEnd: windowEndText,
      windowText
    };
  };

  const handleSmartMonthlyClaim = () => {
    const today = new Date();
    const firstDayCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const formatDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const start = formatDate(firstDayCurrentMonth);
    const end = formatDate(lastDayCurrentMonth);

    setFilters(prev => ({
      ...prev,
      startDate: start,
      endDate: end
    }));

    // Trigger fetch receipts with custom month range
    setTimeout(() => {
      fetchAndProcessReceipts({ smartClaimDates: { start, end } });
    }, 50);
  };

  // Perform fetching and parsing
  const fetchAndProcessReceipts = async (options?: { 
    bypassSmartHistory?: boolean; 
    scanOnlyNew?: boolean;
    smartClaimDates?: { start: string; end: string } 
  }) => {
    if (!token) return;

    const startDateVal = options?.smartClaimDates?.start || filters.startDate;
    const endDateVal = options?.smartClaimDates?.end || filters.endDate;
    const periodStr = `${startDateVal} to ${endDateVal}`;

    // Check for existing report in the same period
    if (!options?.bypassSmartHistory) {
      const existingHistoryJson = localStorage.getItem('recent_claims_reports');
      if (existingHistoryJson) {
        try {
          const history = JSON.parse(existingHistoryJson);
          const match = history.find((h: any) => h.claimPeriod === periodStr);
          if (match) {
            setSmartHistoryMatch(match);
            return;
          }
        } catch (e) {
          console.error('Smart history check failed:', e);
        }
      }
    }

    setFetching(true);
    setFetchError(null);
    setSelectedRide(null);

    if (!options?.scanOnlyNew) {
      setRides([]);
    }

    // Reset developer debug states
    setDebugQuery('');
    setDebugTotalMessages(0);
    setDebugParsedMessages([]);
    setDebugRejectedMessages([]);
    setDebugParsingErrors([]);
    setDebugTimeDecisions([]);
    setDebugDiagnostics([]);
    setDebugPipelineLogs([]);

    try {
      setProgress({ current: 0, total: 0, stage: 'Building Gmail search query...' });
      
      const query = buildGmailQuery(startDateVal, endDateVal, filters.providers);
      setDebugQuery(query);

      const messages = await fetchGmailMessages(token, query);
      setDebugTotalMessages(messages.length);

      if (messages.length === 0) {
        setProgress({ current: 0, total: 0, stage: 'No receipts found. Running inbox diagnostic queries...' });
        setShowDebugPanel(true);

        const diagQueries = [
          { label: 'Search A: from:noreply@uber.com', query: 'from:noreply@uber.com' },
          { label: 'Search B: from:uber.com', query: 'from:uber.com' },
          { label: 'Search C: uber', query: 'uber' },
          { label: 'Search D: label:inbox uber', query: 'label:inbox uber' },
          { label: 'Search E: newer_than:5y uber', query: 'newer_than:5y uber' }
        ];

        const diagResults: { query: string; count: number | null; error?: string }[] = [];
        for (const diag of diagQueries) {
          try {
            setProgress({ current: diagResults.length + 1, total: diagQueries.length, stage: `Running diagnostic: ${diag.label}...` });
            const res = await fetchGmailMessages(token, diag.query);
            diagResults.push({
              query: diag.label,
              count: res.length,
            });
          } catch (err: any) {
            console.error(`Diagnostic query failed: ${diag.query}`, err);
            diagResults.push({
              query: diag.label,
              count: null,
              error: err.message || 'Error executing search'
            });
          }
          setDebugDiagnostics([...diagResults]);
        }

        setProgress({ current: diagQueries.length, total: diagQueries.length, stage: 'Diagnostics completed. Check Developer Debug Console below.' });
        setTimeout(() => setFetching(false), 5000);
        return;
      }

      setProgress({
        current: 0,
        total: messages.length,
        stage: `Found ${messages.length} potential receipts. Downloading headers...`
      });

      // Step 1: Download message metadata for all messages sequentially or in small chunks
      const downloadedReceipts: RideReceipt[] = [];
      
      for (let i = 0; i < messages.length; i++) {
        setProgress({
          current: i + 1,
          total: messages.length,
          stage: `Fetching message headers ${i + 1} of ${messages.length}...`
        });
        
        try {
          const detail = await fetchMessageDetails(token, messages[i].id);
          
          // Check if message was rejected by the provider/keyword filter
          if ((detail as any).isRejected) {
            setDebugRejectedMessages(prev => [
              ...prev,
              {
                id: detail.id,
                subject: detail.subject,
                from: (detail as any).from || 'Unknown',
                reason: (detail as any).rejectionReason || 'Filtered'
              }
            ]);

            // Add failure to pipeline logs
            setDebugPipelineLogs(prev => [
              ...prev,
              {
                id: messages[i].id,
                subject: detail.subject,
                from: (detail as any).from || 'Unknown',
                isForwarded: (detail as any).isForwarded ? 'Yes' : 'No',
                matchedByQuery: 'Yes',
                passedBrandValidation: 'No',
                receiptHtmlFound: (detail as any)._rawNestedHtml ? 'Yes' : 'No',
                parsedSuccessfully: 'No',
                geminiCalled: 'No',
                rejectionReason: (detail as any).rejectionReason || 'Filtered',
                failedStage: 'Brand Validation'
              }
            ]);
            continue;
          }

          // Apply time filter using Asia/Kolkata timezone-aware 12-hour window logic
          const dateIST = (detail as any).dateReceivedIST || detail.dateReceived.split('T')[0];
          const timeIST = detail.timeReceived; // HH:MM in IST
          
          const decision = checkInside12HourWindow(dateIST, timeIST, filters.reimburseAfterTime);
          detail.isReimbursable = decision.inside;
          detail.loading = true; // Set loading true for extraction phase

          setDebugTimeDecisions(prev => [
            ...prev,
            {
              id: detail.id,
              subject: detail.subject,
              timeReceived: detail.timeReceived,
              threshold: filters.reimburseAfterTime,
              isReimbursable: decision.inside,
              decision: decision.reason
            }
          ]);
          
          downloadedReceipts.push(detail);
          
          // Update client-side UI immediately so the list begins to populate!
          setRides([...downloadedReceipts]);
        } catch (msgErr: any) {
          console.error(`Error downloading message headers for ${messages[i].id}:`, msgErr);
          setDebugParsingErrors(prev => [
            ...prev,
            {
              id: messages[i].id,
              subject: 'Failed to retrieve details',
              error: msgErr.message || 'Gmail Get Message metadata request failed.'
            }
          ]);

          // Add metadata fetch failure to pipeline logs
          setDebugPipelineLogs(prev => [
            ...prev,
            {
              id: messages[i].id,
              subject: 'Failed to retrieve details',
              from: 'Unknown',
              isForwarded: 'Unknown',
              matchedByQuery: 'Yes',
              passedBrandValidation: 'Unknown',
              receiptHtmlFound: 'No',
              parsedSuccessfully: 'No',
              geminiCalled: 'No',
              rejectionReason: msgErr.message || 'Gmail request failed',
              failedStage: 'Download Message Details'
            }
          ]);
        }
      }

      if (downloadedReceipts.length === 0) {
        setProgress({ current: 0, total: 0, stage: 'No valid ride receipts identified after metadata filtering.' });
        setTimeout(() => setFetching(false), 3000);
        return;
      }

      // Step 2: Use multi-strategy parsing pipeline (Regex -> DOM -> Gemini)
      setProgress({
        current: 0,
        total: downloadedReceipts.length,
        stage: 'Extracting ride details...'
      });

      for (let i = 0; i < downloadedReceipts.length; i++) {
        const ride = downloadedReceipts[i];
        
        setProgress({
          current: i + 1,
          total: downloadedReceipts.length,
          stage: `Parsing: ${ride.provider} receipt ${i + 1} of ${downloadedReceipts.length}...`
        });

        let parsed: any = null;
        let regexSuccess = false;
        let domSuccess = false;
        let geminiSuccess = false;

        const rawHtml = (ride as any)._rawNestedHtml || '';
        const bodyText = (ride as any)._cleanedBody || ride.subject;

        // Priority A: Regex
        try {
          const regexResult = extractWithRegex(rawHtml, bodyText, ride.provider as any);
          if (regexResult.fare !== null && regexResult.fare > 0) {
            parsed = regexResult;
            regexSuccess = true;
          }
        } catch (regexErr) {
          console.error('Regex extraction failed:', regexErr);
        }

        // Priority B: DOM Parsing
        if (!regexSuccess && rawHtml) {
          try {
            const domResult = extractWithDOM(rawHtml, ride.provider as any);
            if (domResult.fare !== null && domResult.fare > 0) {
              parsed = domResult;
              domSuccess = true;
            }
          } catch (domErr) {
            console.error('DOM extraction failed:', domErr);
          }
        }

        // Priority C: Gemini structured extraction
        if (!regexSuccess && !domSuccess) {
          try {
            setProgress({
              current: i + 1,
              total: downloadedReceipts.length,
              stage: `Gemini parsing: ${ride.provider} receipt ${i + 1} of ${downloadedReceipts.length}...`
            });

            const response = await fetch('/api/extract-receipt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: bodyText,
                provider: ride.provider
              })
            });

            const resData = await response.json();
            if (resData.success && resData.data) {
              parsed = resData.data;
              geminiSuccess = true;
            } else {
              throw new Error(resData.error || 'Gemini extraction returned unsuccessful status.');
            }
          } catch (geminiErr: any) {
            console.error(`Gemini extraction failed for message ${ride.id}:`, geminiErr);
          }
        }

        // Log pipeline stats to the Debug Panel
        const pipelineLog = {
          id: ride.id,
          subject: ride.subject,
          from: (ride as any).from || 'Unknown',
          isForwarded: (ride as any).isForwarded ? 'Yes' : 'No',
          matchedByQuery: 'Yes',
          passedBrandValidation: 'Yes',
          receiptHtmlFound: rawHtml ? 'Yes' : 'No',
          parsedSuccessfully: parsed ? 'Yes' : 'No',
          geminiCalled: geminiSuccess ? 'Yes' : 'No',
          rejectionReason: parsed ? '' : 'All extraction strategies (Regex, DOM, Gemini) failed.',
          failedStage: parsed ? '' : (!regexSuccess && !domSuccess && !geminiSuccess ? 'Gemini Extraction' : (!regexSuccess && !domSuccess ? 'DOM Extraction' : 'Regex Extraction')),
          receiptHtmlSize: rawHtml ? rawHtml.length : 0,
          regexExtractionSuccess: regexSuccess ? 'Yes' : 'No',
          domExtractionSuccess: domSuccess ? 'Yes' : 'No',
          geminiExtractionSuccess: geminiSuccess ? 'Yes' : 'No',
          finalExtractedObject: parsed ? {
            provider: parsed.provider || ride.provider,
            fare: parsed.fare || 0,
            currency: parsed.currency || 'INR',
            date: parsed.date || parsed.dateOfRide || '',
            time: parsed.time || parsed.timeOfRide || '',
            pickup: parsed.pickup || '',
            dropoff: parsed.dropoff || '',
            invoiceNumber: parsed.invoiceNumber || '',
            paymentMethod: parsed.paymentMethod || '',
            rideId: parsed.rideId || '',
            receiptUrl: parsed.receiptUrl || '',
            bookingFee: parsed.bookingFee || null,
            promotion: parsed.promotion || null,
            tax: parsed.tax || null,
            driverName: parsed.driverName || null
          } : null
        };
        setDebugPipelineLogs(prev => [...prev, pipelineLog]);

        if (parsed) {
          // Merge extracted data
          const updatedRide: RideReceipt = {
            ...ride,
            fare: parsed.fare || 0,
            currency: parsed.currency || 'INR',
            dateOfRide: parsed.date || parsed.dateOfRide || ride.dateReceived.split('T')[0],
            timeOfRide: parsed.time || parsed.timeOfRide || ride.timeReceived,
            pickup: getEffectivePickup(parsed.pickup),
            dropoff: getEffectiveDropoff(parsed.dropoff),
            confidence: parsed.confidence || (regexSuccess ? 1.0 : domSuccess ? 0.95 : 0.9),
            bookingFee: parsed.bookingFee !== undefined ? parsed.bookingFee : null,
            promotion: parsed.promotion !== undefined ? parsed.promotion : null,
            tax: parsed.tax !== undefined ? parsed.tax : null,
            driverName: parsed.driverName !== undefined ? parsed.driverName : null,
            paymentMethod: parsed.paymentMethod !== undefined ? parsed.paymentMethod : null,
            invoiceNumber: parsed.invoiceNumber !== undefined ? parsed.invoiceNumber : null,
            rideId: parsed.rideId !== undefined ? parsed.rideId : null,
            receiptUrl: parsed.receiptUrl !== undefined ? parsed.receiptUrl : null,
            loading: false
          };

           // Update in array
          downloadedReceipts[i] = updatedRide;
          setRides([...downloadedReceipts]);

          // Log parsed message
          setDebugParsedMessages(prev => [
            ...prev,
            {
              id: ride.id,
              subject: ride.subject,
              provider: ride.provider,
              fare: parsed.fare || 0,
              currency: parsed.currency || 'INR'
            }
          ]);
        } else {
          // Merge with extraction failure indicators
          downloadedReceipts[i] = {
            ...ride,
            loading: false,
            error: 'All extraction strategies (Regex, DOM, Gemini) failed.'
          };
          setRides([...downloadedReceipts]);

          setDebugParsingErrors(prev => [
            ...prev,
            {
              id: ride.id,
              subject: ride.subject,
              error: 'All extraction strategies (Regex, DOM, Gemini) failed.'
            }
          ]);
        }
      }

      // De-duplicate on complete or merge
      let finalRidesList: RideReceipt[] = [];
      if (options?.scanOnlyNew) {
        // Keep existing rides, and add any downloaded ride that doesn't exist by messageId or rideId
        const existingMap = new Map<string, RideReceipt>();
        rides.forEach(r => {
          existingMap.set(r.messageId, r);
          if (r.rideId) existingMap.set(r.rideId, r);
        });

        const mergedRides = [...rides];
        downloadedReceipts.forEach(r => {
          const hasMsgId = existingMap.has(r.messageId);
          const hasRideId = r.rideId ? existingMap.has(r.rideId) : false;
          if (!hasMsgId && !hasRideId) {
            mergedRides.push(r);
          }
        });
        finalRidesList = mergedRides;
      } else {
        finalRidesList = downloadedReceipts;
      }

      // Automatically exclude duplicate rides from eligible list
      const seenRideIds = new Set<string>();
      const seenCombos = new Set<string>();
      
      const deduplicatedRides = finalRidesList.map(ride => {
        let isDuplicate = false;
        if (ride.rideId && ride.rideId.trim() !== '') {
          const key = ride.rideId.trim().toLowerCase();
          if (seenRideIds.has(key)) {
            isDuplicate = true;
          } else {
            seenRideIds.add(key);
          }
        }
        const dateStr = ride.dateOfRide || ride.dateReceived.split('T')[0];
        const timeStr = ride.timeOfRide || ride.timeReceived;
        const comboKey = `${ride.provider.toLowerCase()}_${dateStr}_${timeStr}_${Number(ride.fare).toFixed(2)}`;
        if (seenCombos.has(comboKey)) {
          isDuplicate = true;
        } else {
          seenCombos.add(comboKey);
        }

        if (isDuplicate) {
          return { ...ride, isReimbursable: false };
        }
        return ride;
      });

      setRides(deduplicatedRides);
      setFetching(false);
    } catch (err: any) {
      console.error('Process error:', err);
      setFetching(false);
      
      const errorMsg = err.message || '';
      if (errorMsg.includes('401') || errorMsg.includes('UNAUTHENTICATED') || errorMsg.includes('credentials') || errorMsg.includes('Invalid Credentials')) {
        setFetchError('Your Google Session has expired or requires re-authentication. Please sign out and sign back in to renew your Gmail API permissions.');
      } else {
        setFetchError(errorMsg || 'Failed to fetch receipts. Please check your network and try again.');
      }
    }
  };

  // Calculations for dashboard indicators
  const reimbursableRides = rides.filter((r) => r.isReimbursable);
  
  const uberTotal = reimbursableRides
    .filter((r) => r.provider === 'Uber')
    .reduce((sum, r) => sum + r.fare, 0);

  const rapidoTotal = reimbursableRides
    .filter((r) => r.provider === 'Rapido')
    .reduce((sum, r) => sum + r.fare, 0);

  const grandTotal = uberTotal + rapidoTotal;

  // Manual editing triggers
  const startEditing = (ride: RideReceipt) => {
    setEditingRideId(ride.id);
    setEditFormData({
      fare: ride.fare,
      pickup: ride.pickup || '',
      dropoff: ride.dropoff || '',
      dateOfRide: ride.dateOfRide || ride.dateReceived.split('T')[0],
      timeOfRide: ride.timeOfRide || ride.timeReceived,
      isReimbursable: ride.isReimbursable
    });
  };

  const saveEdit = (id: string) => {
    setRides((prev) =>
      prev.map((ride) => {
        if (ride.id === id) {
          return {
            ...ride,
            fare: Number(editFormData.fare),
            pickup: editFormData.pickup,
            dropoff: editFormData.dropoff,
            dateOfRide: editFormData.dateOfRide,
            timeOfRide: editFormData.timeOfRide,
            isReimbursable: editFormData.isReimbursable
          };
        }
        return ride;
      })
    );
    setEditingRideId(null);
  };

  const deleteRide = (id: string) => {
    if (window.confirm('Are you sure you want to delete this ride from the claim?')) {
      setRides((prev) => prev.filter((r) => r.id !== id));
      if (selectedRide?.id === id) setSelectedRide(null);
    }
  };

  const toggleReimbursable = (id: string) => {
    setRides((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isReimbursable: !r.isReimbursable } : r))
    );
  };

  // Add manual ride function
  const handleAddManualRide = () => {
    const newRide: RideReceipt = {
      id: 'manual_' + Date.now(),
      messageId: 'manual_' + Date.now(),
      threadId: 'manual_thread',
      provider: 'Uber',
      subject: 'Manually added ride',
      dateReceived: new Date().toISOString(),
      timeReceived: new Date().toTimeString().slice(0, 5),
      isReimbursable: true,
      fare: 0,
      currency: 'INR',
      dateOfRide: new Date().toISOString().split('T')[0],
      timeOfRide: new Date().toTimeString().slice(0, 5),
      pickup: 'TrueFan sector 19',
      dropoff: 'UWG 1 sector 47',
      confidence: 1.0,
      loading: false
    };
    setRides((prev) => [newRide, ...prev]);
    startEditing(newRide);
  };

  // Extract from pasted/uploaded content using Gemini API
  const handleExtractManualReceipt = async () => {
    if (!pasteText.trim()) {
      setManualExtractError('Please paste some receipt text/HTML or drag & drop a file first.');
      return;
    }

    setIsExtractingManual(true);
    setManualExtractError(null);
    setManualExtractedData(null);

    try {
      const response = await fetch('/api/extract-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: pasteText,
          provider: pasteProvider,
        }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to extract receipt data using Gemini API.');
      }

      const extData = resData.data;
      if (!extData) {
        throw new Error('No data extracted.');
      }

      let hours = 20;
      try {
        const timeStr = extData.time || '20:00';
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
        console.error('Failed to parse hours:', e);
      }

      const [thresholdH] = filters.reimburseAfterTime.split(':').map(Number);
      const isReimbursable = hours >= (isNaN(thresholdH) ? 20 : thresholdH);

      const manualId = 'manual_ai_' + Date.now();
      const newRide: RideReceipt = {
        id: manualId,
        messageId: manualId,
        threadId: 'manual_ai_thread',
        provider: pasteProvider,
        subject: `Imported ${pasteProvider} receipt`,
        dateReceived: new Date(extData.date ? (extData.date + 'T12:00:00Z') : new Date().toISOString()).toISOString(),
        timeReceived: extData.time || '20:00',
        isReimbursable,
        fare: Number(extData.fare) || 0,
        currency: extData.currency || 'INR',
        dateOfRide: extData.date || new Date().toISOString().split('T')[0],
        timeOfRide: extData.time || '20:00',
        pickup: getEffectivePickup(extData.pickup),
        dropoff: getEffectiveDropoff(extData.dropoff),
        confidence: extData.confidence || 0.95,
        loading: false
      };

      setRides((prev) => [newRide, ...prev]);
      setPasteText('');
      setManualExtractedData(null);
      setActiveTab('dashboard');
    } catch (err: any) {
      console.error(err);
      setManualExtractError(err.message || 'An error occurred during Gemini extraction.');
    } finally {
      setIsExtractingManual(false);
    }
  };

  const handleAddExtractedRide = () => {
    // Left for backward compatibility, unused
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFileContent(file);
  };

  const readFileContent = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setPasteText(text);
        const lowerText = text.toLowerCase();
        if (lowerText.includes('rapido')) {
          setPasteProvider('Rapido');
        } else if (lowerText.includes('uber')) {
          setPasteProvider('Uber');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      readFileContent(e.dataTransfer.files[0]);
    }
  };

  // PDF Export
  const exportPDF = async (customSettings?: {
    employeeId: string;
    department: string;
    companyName: string;
    reportTitle: string;
    employeeName: string;
  }) => {
    try {
      const nameToUse = customSettings?.employeeName || employeeName;
      const pdfBytes = await generateReimbursementPDF(
        reimbursableRides,
        nameToUse,
        employeeEmail,
        filters.startDate,
        filters.endDate,
        uberTotal,
        rapidoTotal,
        grandTotal,
        customSettings?.employeeId,
        customSettings?.department,
        customSettings?.companyName,
        customSettings?.reportTitle
      );
      
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${customSettings?.reportTitle?.toLowerCase().replace(/\s+/g, '_') || 'reimbursement_claim'}_${filters.startDate}_to_${filters.endDate}.pdf`;
      link.click();
    } catch (err) {
      console.error('PDF Generation failed:', err);
      alert('Failed to generate PDF. Check console logs.');
    }
  };

  // Excel Export
  const exportExcel = (customSettings?: {
    employeeId: string;
    department: string;
    companyName: string;
    reportTitle: string;
    employeeName: string;
  }) => {
    try {
      const nameToUse = customSettings?.employeeName || employeeName;
      const excelBytes = generateReimbursementExcel(
        reimbursableRides,
        nameToUse,
        employeeEmail,
        filters.startDate,
        filters.endDate,
        uberTotal,
        rapidoTotal,
        grandTotal,
        customSettings?.employeeId,
        customSettings?.department,
        customSettings?.companyName,
        customSettings?.reportTitle
      );
      
      const blob = new Blob([excelBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${customSettings?.reportTitle?.toLowerCase().replace(/\s+/g, '_') || 'reimbursement_claim'}_${filters.startDate}_to_${filters.endDate}.xlsx`;
      link.click();
    } catch (err) {
      console.error('Excel Generation failed:', err);
      alert('Failed to generate Excel sheet.');
    }
  };

  // Loading indicator for Firebase Init Auth
  if (authLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#F8FAFC] font-sans">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
          <p className="mt-4 text-sm font-semibold text-slate-600">Initializing Secure Google Session...</p>
        </div>
      </div>
    );
  }

  // LOGIN PAGE VIEW (Unauthenticated)
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen w-screen items-center justify-center bg-[#F8FAFC] font-sans p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Mail className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">
              Ride Reimbursement <span className="text-indigo-600">Generator</span>
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Automated ride expense parsing from Gmail receipts
            </p>
          </div>

          <div className="space-y-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600 border border-slate-100">
            <div className="flex gap-2">
              <Clock className="h-4 w-4 shrink-0 text-indigo-500" />
              <span>Only filters emails received after 8:00 PM (or your custom threshold).</span>
            </div>
            <div className="flex gap-2">
              <CheckCircle className="h-4 w-4 shrink-0 text-indigo-500" />
              <span>Supports Uber and Rapido receipts.</span>
            </div>
            <div className="flex gap-2">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-indigo-500" />
              <span>Exports perfect, finance-ready PDF and Excel reports.</span>
            </div>
          </div>

          {authError && (
            <div className="mt-6 flex gap-3 rounded-xl bg-rose-50 border border-rose-100 p-4 text-xs text-rose-800 shadow-xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Sign-In Failed</p>
                <p className="leading-relaxed">{authError}</p>
                <div className="mt-2 text-[11px] text-rose-600/90 leading-relaxed border-t border-rose-100/60 pt-2">
                  <p className="font-medium">Troubleshooting Tip:</p>
                  <ul className="list-disc pl-4 space-y-1 mt-1">
                    <li>If you closed the popup, please try clicking the button below again.</li>
                    <li>If the popup closed automatically, browser third-party cookie restrictions or popups within iframes might be blocking it.</li>
                    <li>Try clicking the <strong className="font-semibold text-rose-700">Open in new tab</strong> button at the top-right of the preview window to run the app outside the iframe.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8">
            <button
              onClick={handleLogin}
              disabled={loginLoading}
              className={`flex w-full items-center justify-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-xs transition-all w-full ${
                loginLoading
                  ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-[0.98] cursor-pointer'
              }`}
            >
              {loginLoading ? (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin text-indigo-500" />
                  <span>Connecting to Google Account Chooser...</span>
                </>
              ) : (
                <>
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                  <span>Sign in with Google</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
              <span>💡</span>
              <span>How to switch/use a different Google account:</span>
            </h3>
            <ol className="text-[11px] text-slate-500 space-y-1.5 list-decimal pl-4 leading-relaxed">
              <li>
                Click <strong className="font-semibold text-slate-700">"Sign in with Google"</strong> above.
              </li>
              <li>
                In the Google accounts chooser that opens, select <strong className="font-semibold text-slate-700">"Use another account"</strong>.
              </li>
              <li>
                Log in using the different email address you want to parse ride receipts from.
              </li>
            </ol>
            
            <div className="mt-4 p-3 rounded-xl bg-indigo-50/50 border border-indigo-100/30 text-[11px] text-indigo-800 leading-normal">
              <span className="font-semibold">⚠️ Troubleshooting Popup Errors:</span>
              <p className="mt-1">
                If the Google Sign-In popup closes instantly or fails to authenticate within the embedded iframe, please click the <strong className="font-semibold">"Open in new tab"</strong> icon in the top-right corner of the browser preview.
              </p>
              <p className="mt-1 font-medium text-indigo-700">
                This bypasses iframe constraints so you can authenticate smoothly.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MAIN DASHBOARD VIEW (Authenticated)
  const userInitials = user?.displayName
    ? user.displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col">
      {/* HEADER */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-xs sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">
            Ride Reimbursement <span className="text-indigo-600">Generator</span>
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Employee</p>
            <p className="text-sm font-semibold">{employeeName || user?.displayName || 'Google User'}</p>
            <p className="text-[11px] text-indigo-600 font-medium leading-none mt-0.5">{user?.email}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white shadow-xs flex items-center justify-center font-bold text-slate-600" title={user?.email || ''}>
            {userInitials}
          </div>

          <button
            onClick={() => setActiveTab('settings')}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-xs'
                : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
            title="Configure Travel Settings & Claimant Details"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* WORKSPACE LAYOUT */}
      <div className="flex flex-1 flex-col md:flex-row min-h-[calc(100vh-4rem)]">
        {/* SIDEBAR */}
        <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col py-6 px-4 gap-6 shrink-0">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all text-left cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Grid className="w-5 h-5 text-indigo-500" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all text-left cursor-pointer ${
                activeTab === 'manual'
                  ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Upload className="w-5 h-5 text-indigo-500" />
              <span>Paste / Upload Receipt</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all text-left cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Settings className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />
              <span>Report Settings</span>
            </button>
          </nav>

          {/* GMAIL CONNECTION WIDGET */}
          <div className="mt-auto p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-1.5">Gmail Connection</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <p className="text-sm text-slate-600 font-semibold">Connected</p>
              </div>
              <div className="mt-1.5 bg-white border border-slate-200/60 rounded px-2.5 py-1.5 select-all truncate text-[11px] text-indigo-600 font-medium" title={user?.email || ''}>
                {user?.email}
              </div>
            </div>

            <button
              onClick={handleLogin}
              disabled={loginLoading}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                loginLoading
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 active:scale-[0.98] cursor-pointer border border-indigo-100'
              }`}
              title="Click to sign in with a different Google account"
            >
              {loginLoading ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin text-slate-400" />
                  <span>Switching Account...</span>
                </>
              ) : (
                <span>Switch Gmail Account</span>
              )}
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100 flex justify-end items-center">
            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="h-3 w-3" />
              <span>Log out</span>
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 p-6 md:p-8 space-y-6 flex flex-col overflow-hidden">
          {fetchError && (
            <div className="flex gap-3 rounded-xl bg-rose-50 border border-rose-100 p-4 text-xs text-rose-800 shadow-xs relative">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
              <div className="space-y-1 pr-8">
                <p className="font-semibold">Fetch Failed</p>
                <p className="leading-relaxed text-slate-700">{fetchError}</p>
                {fetchError.includes('Session') && (
                  <button
                    onClick={handleLogin}
                    className="mt-2.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-[11px] transition-all cursor-pointer shadow-xs active:scale-95 flex items-center gap-1.5"
                  >
                    <RefreshCw className="h-3 w-3 animate-pulse" />
                    <span>Re-Authenticate with Google</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => setFetchError(null)}
                className="absolute top-3.5 right-3 text-rose-400 hover:text-rose-600 cursor-pointer"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {activeTab === 'dashboard' ? (
            <>
              {/* SMART MONTHLY CLAIM CTA BANNER */}
              <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden text-left">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="space-y-2 text-left relative z-10">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5" /> Core Primary Action
                  </div>
                  <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                    <span>Generate Claim Report</span>
                    <span className="text-indigo-400 font-normal">({new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})</span>
                  </h2>
                  <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                    Automate your full expensing pipeline. One click triggers a smart crawl across your inbox for <strong>{employeeName || 'your'}</strong> travel receipts from <strong>{new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong> to <strong>{new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>, applying your policy rules ({filters.reimburseAfterTime === '20:00' ? '8 PM' : filters.reimburseAfterTime} threshold, {reimbursementWindow}-hour window), resolving duplicates, and organizing claims.
                  </p>
                </div>

                <div className="shrink-0 w-full md:w-auto relative z-10">
                  <button
                    onClick={handleSmartMonthlyClaim}
                    disabled={fetching}
                    className="w-full md:w-auto h-14 px-8 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer border border-indigo-500"
                  >
                    <RefreshCw className={`h-5 w-5 ${fetching ? 'animate-spin' : ''}`} />
                    <span>{fetching ? 'Processing Smart Claim...' : 'Generate Claim Report'}</span>
                  </button>
                </div>
              </div>

              {/* COLLAPSIBLE ADVANCED MANUAL SEARCH CONTROLS */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <button
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all text-left"
                >
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-slate-400" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">⚙️ Advanced Manual controls (Custom dates or filters)</span>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">
                    {showAdvancedFilters ? 'Hide manual parameters' : 'Show manual parameters'}
                  </span>
                </button>

                {showAdvancedFilters && (
                  <div className="px-6 pb-6 pt-4 border-t border-slate-150/40 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end text-left">
                      {/* Start Date */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">START DATE</label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                          <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                            className="block w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                          />
                        </div>
                      </div>

                      {/* End Date */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">END DATE</label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                          <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                            className="block w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                          />
                        </div>
                      </div>

                      {/* Time threshold */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">TIME FILTER</label>
                        <div className="relative">
                          <Clock className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                          <input
                            type="time"
                            value={filters.reimburseAfterTime}
                            onChange={(e) => {
                              setFilters({ ...filters, reimburseAfterTime: e.target.value });
                              localStorage.setItem('default_reimbursement_time', e.target.value);
                            }}
                            className="block w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                          />
                        </div>
                      </div>

                      {/* Submit Fetch Button */}
                      <div>
                        <button
                          onClick={() => fetchAndProcessReceipts()}
                          disabled={fetching || (!filters.providers.uber && !filters.providers.rapido)}
                          className="h-12 w-full px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-indigo-100 hover:shadow-indigo-200 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
                          <span>{fetching ? 'Parsing Receipts...' : 'Fetch Receipts'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Secondary Filters line */}
                    <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100 text-left">
                      <div className="flex gap-6 items-center">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Providers:</span>
                        <div className="flex gap-4 items-center">
                          <label className="inline-flex items-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={filters.providers.uber}
                              onChange={(e) =>
                                setFilters({
                                  ...filters,
                                  providers: { ...filters.providers, uber: e.target.checked }
                                })
                              }
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="ml-2 text-sm font-medium text-slate-700">Uber</span>
                          </label>
                          <label className="inline-flex items-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={filters.providers.rapido}
                              onChange={(e) =>
                                setFilters({
                                  ...filters,
                                  providers: { ...filters.providers, rapido: e.target.checked }
                                })
                              }
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="ml-2 text-sm font-medium text-slate-700">Rapido</span>
                          </label>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <p className="text-xs text-slate-400 italic">
                          Crawls emails received after {filters.reimburseAfterTime === '20:00' ? '8:00 PM' : filters.reimburseAfterTime}
                        </p>
                        <button
                          onClick={() => setShowDebugPanel(!showDebugPanel)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                            showDebugPanel
                              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Terminal className="h-3.5 w-3.5" />
                          <span>{showDebugPanel ? 'Hide Debug' : 'Show Debug'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* DEVELOPER DEBUG PANEL */}
              {showDebugPanel && (
                <div className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-5 w-5 text-amber-400" />
                      <div>
                        <h3 className="font-bold text-sm text-white">Developer Debug & Audit Console</h3>
                        <p className="text-xs text-slate-400">Real-time inspection of Gmail API search queries, filtering decisions, and parsing results</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Debug Mode Enabled
                      </span>
                    </div>
                  </div>

                  {/* Summary Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Gmail Query</span>
                      <div className="text-xs font-mono text-amber-300 truncate mt-1" title={debugQuery || 'None generated yet'}>
                        {debugQuery || 'No search executed yet'}
                      </div>
                    </div>
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Messages Found</span>
                      <span className="text-lg font-bold text-white mt-1 block">{debugTotalMessages}</span>
                    </div>
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Successfully Parsed</span>
                      <span className="text-lg font-bold text-green-400 mt-1 block">{debugParsedMessages.length}</span>
                    </div>
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Rejected / Excluded</span>
                      <span className="text-lg font-bold text-rose-400 mt-1 block">{debugRejectedMessages.length}</span>
                    </div>
                  </div>

                  {/* Detailed Logs sections */}
                  <div className="space-y-4">
                    {/* 1. Gmail Query Display */}
                    {debugQuery && (
                      <div className="space-y-1.5">
                        <span className="text-xs font-bold text-slate-400">Generated Gmail API Query:</span>
                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-amber-200 select-all break-all leading-relaxed">
                          {debugQuery}
                        </div>
                      </div>
                    )}

                    {/* Temporary Diagnostic Mode Results */}
                    {debugDiagnostics.length > 0 && (
                      <div className="space-y-2 border border-amber-500/30 bg-amber-500/5 p-4 rounded-xl">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Terminal className="h-4 w-4" />
                            Gmail Search Diagnostics (No results for primary query)
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Identifies which query structure matches your inbox
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-2">
                          {debugDiagnostics.map((res, idx) => (
                            <div key={idx} className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
                              <span className="text-[10px] font-semibold text-slate-400 truncate block" title={res.query}>
                                {res.query}
                              </span>
                              <div className="mt-2 flex items-baseline justify-between">
                                {res.count !== null ? (
                                  <>
                                    <span className={`text-lg font-bold ${res.count > 0 ? 'text-green-400' : 'text-slate-500'}`}>
                                      {res.count}
                                    </span>
                                    <span className="text-[9px] text-slate-500 uppercase ml-1">msgs</span>
                                  </>
                                ) : (
                                  <span className="text-xs text-rose-400 font-medium truncate" title={res.error}>
                                    Error
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Time Decisions Log */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                          <span>Time Filtering Decisions</span>
                          <span className="text-[10px] font-normal text-slate-500 font-mono">({debugTimeDecisions.length})</span>
                        </h4>
                        
                        {debugTimeDecisions.length > 0 && (
                          <div className="bg-slate-950 px-3 py-2.5 rounded-xl border border-slate-800 text-[10px] font-mono grid grid-cols-3 gap-2 text-slate-300">
                            <div><strong>Start Time:</strong> {filters.reimburseAfterTime} IST</div>
                            <div><strong>End Time:</strong> {(() => {
                              const [h, m] = filters.reimburseAfterTime.split(':').map(Number);
                              return `${String((h + 12) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h + 12 >= 24 ? '(next day)' : '(same day)'}`;
                            })()} IST</div>
                            <div><strong>12 Hour Window:</strong> Active</div>
                          </div>
                        )}

                        <div className="bg-slate-950 rounded-xl border border-slate-800 max-h-60 overflow-y-auto p-2 space-y-1.5 font-mono text-[11px]">
                          {debugTimeDecisions.length === 0 ? (
                            <p className="text-slate-500 italic p-3 text-center">No decisions logged. Run "Fetch Receipts" first.</p>
                          ) : (
                            debugTimeDecisions.map((dec, idx) => (
                              <div key={idx} className={`p-2 rounded-lg border ${dec.isReimbursable ? 'bg-green-950/20 border-green-900/30 text-green-300' : 'bg-slate-900/40 border-slate-800 text-slate-400'}`}>
                                <div className="font-semibold truncate text-[12px]">{dec.subject}</div>
                                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                                  <span><strong>Received Time:</strong> {dec.timeReceived} IST</span>
                                  <span><strong>Inside Window?:</strong> {dec.isReimbursable ? 'Yes' : 'No'}</span>
                                </div>
                                <div className="mt-1.5 text-[10px] font-medium border-t border-slate-800/60 pt-1 flex items-center gap-1.5">
                                  <span className={dec.isReimbursable ? 'text-green-400' : 'text-amber-500'}>
                                    {dec.isReimbursable ? '●' : '○'}
                                  </span>
                                  <span><strong>Reason:</strong> {dec.decision}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Rejected Messages Log */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                          <span>Rejected Emails</span>
                          <span className="text-[10px] font-normal text-slate-500 font-mono">({debugRejectedMessages.length})</span>
                        </h4>
                        <div className="bg-slate-950 rounded-xl border border-slate-800 max-h-60 overflow-y-auto p-2 space-y-1.5 font-mono text-[11px]">
                          {debugRejectedMessages.length === 0 ? (
                            <p className="text-slate-500 italic p-3 text-center">No rejected emails logged. Run "Fetch Receipts" first.</p>
                          ) : (
                            debugRejectedMessages.map((rej, idx) => (
                              <div key={idx} className="p-2 rounded-lg bg-rose-950/10 border border-rose-900/20 text-rose-300 font-mono">
                                <div className="font-semibold truncate text-[12px]">{rej.subject}</div>
                                <div className="mt-0.5 text-[10px] text-slate-400 truncate">From: {rej.from}</div>
                                <div className="mt-1.5 text-[10px] bg-rose-950/30 text-rose-200 border border-rose-900/30 rounded px-1.5 py-0.5">
                                  <strong>Reason:</strong> {rej.reason}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                      {/* Parsing Errors Log */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                          <span>Gemini Extraction Errors</span>
                          <span className="text-[10px] font-normal text-slate-500 font-mono">({debugParsingErrors.length})</span>
                        </h4>
                        <div className="bg-slate-950 rounded-xl border border-slate-800 max-h-60 overflow-y-auto p-2 space-y-1.5 font-mono text-[11px]">
                          {debugParsingErrors.length === 0 ? (
                            <p className="text-slate-500 italic p-3 text-center">No extraction errors logged.</p>
                          ) : (
                            debugParsingErrors.map((err, idx) => (
                              <div key={idx} className="p-2 rounded-lg bg-red-950/20 border border-red-900/30 text-red-300">
                                <div className="font-semibold truncate text-[12px]">{err.subject}</div>
                                <div className="mt-1 text-[10px] text-red-200">
                                  <strong>Error:</strong> {err.error}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Successfully Parsed Log */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                          <span>Parsed Receipts List</span>
                          <span className="text-[10px] font-normal text-slate-500 font-mono">({debugParsedMessages.length})</span>
                        </h4>
                        <div className="bg-slate-950 rounded-xl border border-slate-800 max-h-60 overflow-y-auto p-2 space-y-1.5 font-mono text-[11px]">
                          {debugParsedMessages.length === 0 ? (
                            <p className="text-slate-500 italic p-3 text-center">No parsed receipts logged. Run "Fetch Receipts" first.</p>
                          ) : (
                            debugParsedMessages.map((pm, idx) => (
                              <div key={idx} className="p-2 rounded-lg bg-emerald-950/10 border border-emerald-900/20 text-emerald-300 flex justify-between items-center gap-3">
                                <div className="truncate flex-1">
                                  <div className="font-semibold truncate text-[12px]">{pm.subject}</div>
                                  <span className="text-[10px] text-slate-400">Provider: {pm.provider}</span>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-bold text-white text-[12px]">₹{pm.fare}</span>
                                  <span className="text-[9px] text-slate-400 block">{pm.currency}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Receipt Parsing Pipeline */}
                    <div className="space-y-2 border-t border-slate-800 pt-4">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                        <span>Receipt Parsing Pipeline Logs</span>
                        <span className="text-[10px] font-normal text-slate-500 font-mono">({debugPipelineLogs.length})</span>
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto p-1 font-mono text-[11px]">
                        {debugPipelineLogs.length === 0 ? (
                          <div className="col-span-2 text-slate-500 italic p-4 text-center bg-slate-950 rounded-xl border border-slate-800">
                            No pipeline executions logged yet. Run "Fetch Receipts" to see the active pipeline.
                          </div>
                        ) : (
                          debugPipelineLogs.map((log, idx) => (
                            <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                              <div className="font-semibold text-amber-300 truncate text-[12px] pb-1.5 border-b border-slate-800">
                                {log.subject}
                              </div>
                              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-400">
                                <div>Sender:</div>
                                <div className="text-slate-200 text-right truncate" title={log.from}>{log.from || 'Unknown'}</div>

                                <div>Is Forwarded?:</div>
                                <div className={`text-right font-semibold ${log.isForwarded === 'Yes' ? 'text-cyan-400' : 'text-slate-500'}`}>
                                  {log.isForwarded || 'No'}
                                </div>

                                <div>Matched by Gmail Query?:</div>
                                <div className="text-slate-200 text-right">{log.matchedByQuery || 'Yes'}</div>

                                <div>Passed Brand Validation?:</div>
                                <div className={`text-right font-semibold ${log.passedBrandValidation === 'Yes' ? 'text-green-400' : 'text-rose-400'}`}>
                                  {log.passedBrandValidation || 'No'}
                                </div>

                                <div>Receipt HTML Found?:</div>
                                <div className={`text-right ${log.receiptHtmlFound === 'Yes' ? 'text-green-400' : 'text-slate-500'}`}>
                                  {log.receiptHtmlFound || 'No'}
                                </div>

                                <div>Parsed Successfully?:</div>
                                <div className={`text-right font-bold ${log.parsedSuccessfully === 'Yes' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {log.parsedSuccessfully || 'No'}
                                </div>

                                <div>Gemini Called?:</div>
                                <div className={`text-right ${log.geminiCalled === 'Yes' ? 'text-amber-400' : 'text-slate-500'}`}>
                                  {log.geminiCalled || 'No'}
                                </div>

                                {log.rejectionReason && (
                                  <>
                                    <div className="text-rose-400 font-semibold">Rejection Reason:</div>
                                    <div className="text-rose-300 text-right text-[9px] font-medium leading-tight whitespace-pre-wrap">{log.rejectionReason}</div>
                                  </>
                                )}

                                {log.failedStage && (
                                  <>
                                    <div className="text-rose-400 font-semibold">Failed Stage:</div>
                                    <div className="text-rose-300 text-right font-bold">{log.failedStage}</div>
                                  </>
                                )}
                              </div>

                              {log.finalExtractedObject && (
                                <div className="mt-2 pt-2 border-t border-slate-800 text-[9px] text-slate-300">
                                  <span className="text-slate-400 block font-bold uppercase tracking-wider mb-1">Final Extracted Object:</span>
                                  <pre className="bg-slate-900 p-2 rounded border border-slate-800 overflow-x-auto whitespace-pre-wrap leading-tight text-emerald-400">
                                    {JSON.stringify(log.finalExtractedObject, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PROGRESS BAR (While processing) */}
              <AnimatePresence>
                {fetching && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-xs"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-indigo-800">{progress.stage}</span>
                      {progress.total > 0 && (
                        <span className="text-xs font-bold text-indigo-700">
                          {progress.current} / {progress.total}
                        </span>
                      )}
                    </div>
                    <div className="h-2 w-full bg-indigo-100 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-indigo-600"
                        initial={{ width: 0 }}
                        animate={{
                          width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '5%'
                        }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CLAIM REVIEW & MANAGEMENT WORKSPACE */}
              <ClaimReview
                rides={rides}
                setRides={setRides}
                employeeName={employeeName}
                employeeEmail={employeeEmail}
                filters={filters}
                exportPDF={exportPDF}
                exportExcel={exportExcel}
                handleAddManualRide={handleAddManualRide}
                onPreviewReport={() => setShowReportGenerator(true)}
              />

              {/* REPORT GENERATOR MODAL */}
              <AnimatePresence>
                {showReportGenerator && (
                  <ReportGenerator
                    rides={rides}
                    employeeName={employeeName}
                    setEmployeeName={setEmployeeName}
                    employeeEmail={employeeEmail}
                    setEmployeeEmail={setEmployeeEmail}
                    filters={filters}
                    isOpen={showReportGenerator}
                    onClose={() => setShowReportGenerator(false)}
                    onExportPDF={async (settings) => {
                      await exportPDF(settings);
                    }}
                    onExportExcel={(settings) => {
                      exportExcel(settings);
                    }}
                  />
                )}
              </AnimatePresence>

              {/* FIRST-TIME SETUP WIZARD */}
              <AnimatePresence>
                {showSetupWizard && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-sm overflow-hidden select-none">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      className="bg-white rounded-3xl border border-slate-200 p-6 max-w-lg w-full shadow-2xl space-y-6 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                          <Sparkles className="w-5 h-5 text-indigo-500" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-900">Claimant First-Time Setup</h3>
                          <p className="text-xs text-slate-400">Configure your default reimbursement parameters to start</p>
                        </div>
                      </div>

                      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                        {/* Full Name */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Your Full Name</label>
                          <input
                            type="text"
                            value={employeeName}
                            onChange={(e) => setEmployeeName(e.target.value)}
                            placeholder="John Doe"
                            className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                          />
                        </div>

                        {/* Employee ID */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Employee ID (Optional)</label>
                          <input
                            type="text"
                            value={employeeId}
                            onChange={(e) => setEmployeeId(e.target.value)}
                            placeholder="EMP-1234"
                            className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                          />
                        </div>

                        {/* Department */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Department (Optional)</label>
                          <input
                            type="text"
                            value={department}
                            onChange={(e) => setDepartment(e.target.value)}
                            placeholder="Finance / Engineering"
                            className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                          />
                        </div>

                        {/* Company Name */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Company Name</label>
                          <input
                            type="text"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            placeholder="truefan.ai"
                            className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          {/* Reimbursement Time */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Default Policy Start Time</label>
                            <input
                              type="time"
                              value={filters.reimburseAfterTime}
                              onChange={(e) => setFilters(prev => ({ ...prev, reimburseAfterTime: e.target.value }))}
                              className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                            />
                          </div>

                          {/* Reimbursement Window */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Policy Window (Hours)</label>
                            <input
                              type="number"
                              value={reimbursementWindow}
                              onChange={(e) => setReimbursementWindow(Number(e.target.value))}
                              placeholder="12"
                              min="1"
                              max="24"
                              className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                            />
                          </div>
                        </div>

                        {/* Preferred format */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Preferred Export Format</label>
                          <select
                            value={preferredFormat}
                            onChange={(e) => setPreferredFormat(e.target.value as any)}
                            className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                          >
                            <option value="Both">Both formats (PDF & Excel)</option>
                            <option value="PDF">PDF documents only</option>
                            <option value="Excel">Excel spreadsheets only</option>
                          </select>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100">
                        <button
                          onClick={() => {
                            // Save details
                            localStorage.setItem('default_employee_name', employeeName);
                            localStorage.setItem('reimbursement_employee_id', employeeId);
                            localStorage.setItem('default_employee_id', employeeId);
                            localStorage.setItem('reimbursement_department', department);
                            localStorage.setItem('default_department', department);
                            localStorage.setItem('reimbursement_company_name', companyName);
                            localStorage.setItem('default_company_name', companyName);
                            localStorage.setItem('reimbursement_window', String(reimbursementWindow));
                            localStorage.setItem('reimbursement_preferred_format', preferredFormat);
                            localStorage.setItem('reimbursement_setup_wizard_completed', 'true');
                            setShowSetupWizard(false);
                          }}
                          disabled={!employeeName || !companyName}
                          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs transition-all shadow-md active:scale-95 text-center cursor-pointer"
                        >
                          Save Details & Start Expensing
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* SMART HISTORY PROMPT */}
              <AnimatePresence>
                {smartHistoryMatch && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-sm overflow-hidden select-none">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="bg-white rounded-3xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-5 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                          <History className="w-5 h-5 text-indigo-500" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-900">Existing Report Found</h3>
                          <p className="text-xs text-slate-400">For period: {smartHistoryMatch.claimPeriod}</p>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-xs space-y-2 text-slate-600">
                        <p className="font-semibold text-slate-800">Generated Report Details:</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-white p-2.5 rounded-xl border border-slate-200/50">
                          <span className="text-slate-400 font-semibold">Total Rides:</span>
                          <span className="font-bold text-right text-slate-800">{smartHistoryMatch.rides.length}</span>
                          <span className="text-slate-400 font-semibold">Total Amount:</span>
                          <span className="font-bold text-right text-indigo-600 font-mono">₹{smartHistoryMatch.grandTotal.toFixed(2)}</span>
                          <span className="text-slate-400 font-semibold">Exported as:</span>
                          <span className="font-bold text-right text-slate-800">{smartHistoryMatch.exportType}</span>
                        </div>
                        <p className="text-[11px] leading-relaxed mt-2 text-slate-500">
                          Would you like to load and view the existing report details, perform a fresh re-scan of the entire month, or only scan your inbox for any new receipts?
                        </p>
                      </div>

                      <div className="space-y-2">
                        <button
                          onClick={() => {
                            // View existing report
                            setRides(smartHistoryMatch.rides);
                            setSmartHistoryMatch(null);
                            setShowReportGenerator(true);
                          }}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 text-center cursor-pointer font-extrabold"
                        >
                          View Existing Report
                        </button>
                        <button
                          onClick={() => {
                            // Regenerate / clean scan
                            setSmartHistoryMatch(null);
                            fetchAndProcessReceipts({ bypassSmartHistory: true });
                          }}
                          className="w-full py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition-all active:scale-95 text-center cursor-pointer font-extrabold"
                        >
                          Regenerate (Fresh Scan)
                        </button>
                        <button
                          onClick={() => {
                            // Scan only new receipts
                            setSmartHistoryMatch(null);
                            fetchAndProcessReceipts({ bypassSmartHistory: true, scanOnlyNew: true });
                          }}
                          className="w-full py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition-all active:scale-95 text-center cursor-pointer font-extrabold"
                        >
                          Scan Only New Receipts
                        </button>
                        <button
                          onClick={() => setSmartHistoryMatch(null)}
                          className="w-full py-2 bg-slate-50 text-slate-400 font-medium rounded-xl text-xs transition-all hover:text-slate-600 text-center cursor-pointer font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* DETAILS AND ORIGINAL GMAIL HEADERS SECTION */}
              <AnimatePresence>
                {selectedRide && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs"
                  >
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">Receipt Original Gmail Data</h3>
                        <p className="text-[11px] text-slate-400">Headers and parsing status retrieved via API</p>
                      </div>
                      <button
                        onClick={() => setSelectedRide(null)}
                        className="rounded-full p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-4 text-xs">
                      <div>
                        <span className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Subject Header</span>
                        <p className="text-slate-700 bg-slate-50 px-3 py-2 rounded-lg font-medium border border-slate-100">{selectedRide.subject}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Thread ID</span>
                          <p className="text-slate-600 bg-slate-50 px-3 py-2 rounded-lg font-mono border border-slate-100">{selectedRide.threadId}</p>
                        </div>
                        <div>
                          <span className="font-bold text-slate-400 uppercase tracking-wider block mb-1">Received Date (ISO)</span>
                          <p className="text-slate-600 bg-slate-50 px-3 py-2 rounded-lg font-mono border border-slate-100">{selectedRide.dateReceived}</p>
                        </div>
                      </div>

                      {/* Newly Extracted Fields Display */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-indigo-50/20 p-4 rounded-xl border border-indigo-100/30">
                        <div>
                          <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px] mb-1">Driver Name</span>
                          <p className="text-slate-700 font-semibold text-xs truncate">{(selectedRide as any).driverName || '—'}</p>
                        </div>
                        <div>
                          <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px] mb-1">Booking Fee</span>
                          <p className="text-slate-700 font-mono text-xs">{(selectedRide as any).bookingFee !== undefined && (selectedRide as any).bookingFee !== null ? `₹${(selectedRide as any).bookingFee.toFixed(2)}` : '—'}</p>
                        </div>
                        <div>
                          <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px] mb-1">Promotion</span>
                          <p className="text-emerald-600 font-mono text-xs">{(selectedRide as any).promotion !== undefined && (selectedRide as any).promotion !== null ? `-₹${(selectedRide as any).promotion.toFixed(2)}` : '—'}</p>
                        </div>
                        <div>
                          <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px] mb-1">Tax / GST</span>
                          <p className="text-slate-700 font-mono text-xs">{(selectedRide as any).tax !== undefined && (selectedRide as any).tax !== null ? `₹${(selectedRide as any).tax.toFixed(2)}` : '—'}</p>
                        </div>
                      </div>

                      {selectedRide.error && (
                        <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-red-700 flex items-start gap-2.5">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-xs">Gemini Extraction Failure</p>
                            <p className="text-[11px] mt-0.5 text-red-600">{selectedRide.error}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : activeTab === 'manual' ? (
            /* ACTIVE TAB === 'manual' (PASTE / UPLOAD RECEIPT TAB) */
            <div className="space-y-6 text-left max-w-4xl w-full">
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">✨ AI Receipt Text Parser (No Forwarding Required)</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Bypass Google account restrictions entirely. Simply paste the email body text or upload a receipt file from any of your other email accounts, and our AI will instantly extract all details (Fare, Route, Date, Time, etc.) and append it to your active claim.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                  {/* Left Column: Import / Upload inputs */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">1. Select Ride Provider</label>
                      <div className="flex gap-4">
                        <button
                          type="button"
                          onClick={() => setPasteProvider('Uber')}
                          className={`flex-1 py-3 px-4 rounded-xl border font-semibold text-xs transition-all cursor-pointer ${
                            pasteProvider === 'Uber'
                              ? 'bg-slate-900 border-slate-950 text-white shadow-md'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          Uber Receipt
                        </button>
                        <button
                          type="button"
                          onClick={() => setPasteProvider('Rapido')}
                          className={`flex-1 py-3 px-4 rounded-xl border font-semibold text-xs transition-all cursor-pointer ${
                            pasteProvider === 'Rapido'
                              ? 'bg-yellow-400 border-yellow-500 text-slate-900 shadow-md'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          Rapido Receipt
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">2. Paste Raw Receipt Text / HTML</label>
                      <textarea
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        placeholder="Paste the raw text of the Uber or Rapido receipt email here..."
                        rows={8}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
                      />
                    </div>

                    {/* Drag and Drop File Upload Area */}
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer relative ${
                        dragActive
                          ? 'border-indigo-500 bg-indigo-50/50'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <input
                        type="file"
                        id="file-upload"
                        onChange={handleFileUpload}
                        accept=".txt,.html,.eml"
                        className="hidden"
                      />
                      <label htmlFor="file-upload" className="cursor-pointer block">
                        <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                        <p className="text-xs font-bold text-slate-700">Drag & Drop file or Click to upload</p>
                        <p className="text-[10px] text-slate-400 mt-1">Supports Uber/Rapido emails saved as .txt, .html, or .eml</p>
                      </label>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={handleExtractManualReceipt}
                        disabled={isExtractingManual || !pasteText.trim()}
                        className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-100 hover:shadow-indigo-200 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className={`h-4 w-4 ${isExtractingManual ? 'animate-spin' : ''}`} />
                        <span>{isExtractingManual ? 'AI Extracting...' : 'Parse Receipt text with Gemini AI'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Right Column: AI Live Preview & Actions */}
                  <div className="flex flex-col h-full justify-between space-y-4">
                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-6 min-h-[300px] flex flex-col">
                      <div className="border-b border-slate-200 pb-3 mb-4">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">AI Parsing Preview</span>
                        <h3 className="font-bold text-slate-800 text-sm">Extracted Receipt Preview</h3>
                      </div>

                      {isExtractingManual && (
                        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center space-y-3">
                          <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" />
                          <p className="text-xs font-semibold text-slate-600">Gemini is parsing the receipt text...</p>
                          <p className="text-[11px] text-slate-400">Extracting ride details: fare, pickup, destination, dates & times.</p>
                        </div>
                      )}

                      {!isExtractingManual && !manualExtractedData && !manualExtractError && (
                        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-slate-400">
                          <Upload className="h-8 w-8 text-slate-300 mb-3" />
                          <p className="text-xs font-medium">No data parsed yet</p>
                          <p className="text-[10px] text-slate-400 mt-1">Paste receipt text on the left and trigger Gemini AI extraction to see results here.</p>
                        </div>
                      )}

                      {manualExtractError && (
                        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-rose-500 space-y-2">
                          <AlertCircle className="h-8 w-8 shrink-0" />
                          <p className="text-xs font-bold">Extraction Failed</p>
                          <p className="text-[11px] text-rose-600 max-w-xs">{manualExtractError}</p>
                        </div>
                      )}

                      {manualExtractedData && (
                        <div className="flex-1 space-y-4 text-xs">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-3 rounded-xl border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Ride Provider</span>
                              <div>
                                <span className={`px-2 py-0.5 text-[9px] rounded font-bold uppercase tracking-wider ${
                                  pasteProvider === 'Uber' ? 'bg-slate-900 text-white' : 'bg-yellow-400 text-slate-900'
                                }`}>
                                  {pasteProvider}
                                </span>
                              </div>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Extracted Fare</span>
                              <span className="font-bold text-sm text-slate-800 font-mono">
                                ₹{(Number(manualExtractedData.fare) || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-3 rounded-xl border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Date of Ride</span>
                              <input
                                type="date"
                                value={manualExtractedData.date || ''}
                                onChange={(e) => setManualExtractedData({ ...manualExtractedData, date: e.target.value })}
                                className="block w-full bg-slate-50 border border-slate-200 rounded p-1 text-xs outline-none"
                              />
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-slate-100">
                              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Time of Ride</span>
                              <input
                                type="text"
                                value={manualExtractedData.time || ''}
                                onChange={(e) => setManualExtractedData({ ...manualExtractedData, time: e.target.value })}
                                className="block w-full bg-slate-50 border border-slate-200 rounded p-1 text-xs outline-none"
                              />
                            </div>
                          </div>

                          <div className="bg-white p-3 rounded-xl border border-slate-100 space-y-2">
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Pickup Location</span>
                              <input
                                type="text"
                                value={manualExtractedData.pickup || ''}
                                onChange={(e) => setManualExtractedData({ ...manualExtractedData, pickup: e.target.value })}
                                className="block w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs outline-none"
                              />
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Destination (Dropoff)</span>
                              <input
                                type="text"
                                value={manualExtractedData.dropoff || ''}
                                onChange={(e) => setManualExtractedData({ ...manualExtractedData, dropoff: e.target.value })}
                                className="block w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs outline-none"
                              />
                            </div>
                          </div>

                          <div className="bg-white p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase block">Gemini Confidence Score</span>
                              <p className="text-[11px] text-slate-500">AI reliability index</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                              manualExtractedData.confidence > 0.8 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              {((manualExtractedData.confidence || 0.95) * 100).toFixed(0)}% Match
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {manualExtractedData && (
                      <button
                        onClick={handleAddExtractedRide}
                        className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-green-100 hover:shadow-green-200 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
                      >
                        <CheckCircle className="h-4 w-4" />
                        <span>Confirm & Append to Active Report</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ACTIVE TAB === 'settings' (REPORT SETTINGS TAB) */
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-md max-w-2xl w-full space-y-6 text-left">
              <div>
                <h2 className="text-lg font-bold text-slate-950 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-indigo-600" />
                  <span>Claim Report Settings</span>
                </h2>
                <p className="text-xs text-slate-500">Configure corporate reimbursement metadata and policy preferences.</p>
              </div>

              <div className="space-y-4 border-t border-slate-100 pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Claimant Name */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Your Full Name</label>
                    <input
                      type="text"
                      value={employeeName}
                      onChange={(e) => {
                        setEmployeeName(e.target.value);
                        localStorage.setItem('default_employee_name', e.target.value);
                      }}
                      placeholder="John Doe"
                      className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                    />
                  </div>

                  {/* Claimant Email */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Your Email</label>
                    <input
                      type="email"
                      value={employeeEmail}
                      onChange={(e) => {
                        setEmployeeEmail(e.target.value);
                        localStorage.setItem('reimbursement_employee_email', e.target.value);
                        localStorage.setItem('default_employee_email', e.target.value);
                      }}
                      placeholder="john@company.com"
                      className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Employee ID */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Employee ID</label>
                    <input
                      type="text"
                      value={employeeId}
                      onChange={(e) => {
                        setEmployeeId(e.target.value);
                        localStorage.setItem('reimbursement_employee_id', e.target.value);
                        localStorage.setItem('default_employee_id', e.target.value);
                      }}
                      placeholder="EMP-1234"
                      className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                    />
                  </div>

                  {/* Department */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Department</label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => {
                        setDepartment(e.target.value);
                        localStorage.setItem('reimbursement_department', e.target.value);
                        localStorage.setItem('default_department', e.target.value);
                      }}
                      placeholder="Engineering"
                      className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                    />
                  </div>

                  {/* Company Name */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Company Name</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => {
                        setCompanyName(e.target.value);
                        localStorage.setItem('reimbursement_company_name', e.target.value);
                        localStorage.setItem('default_company_name', e.target.value);
                      }}
                      placeholder="truefan.ai"
                      className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Reimbursement Time */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Policy Start Time</label>
                    <input
                      type="time"
                      value={filters.reimburseAfterTime}
                      onChange={(e) => {
                        setFilters(prev => ({ ...prev, reimburseAfterTime: e.target.value }));
                        localStorage.setItem('default_reimbursement_time', e.target.value);
                      }}
                      className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                    />
                  </div>

                  {/* Reimbursement Window */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Policy Window (Hours)</label>
                    <input
                      type="number"
                      value={reimbursementWindow}
                      onChange={(e) => {
                        setReimbursementWindow(Number(e.target.value));
                        localStorage.setItem('reimbursement_window', String(e.target.value));
                      }}
                      placeholder="12"
                      min="1"
                      max="24"
                      className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                    />
                  </div>

                  {/* Preferred Export Format */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Export Format</label>
                    <select
                      value={preferredFormat}
                      onChange={(e) => {
                        setPreferredFormat(e.target.value as any);
                        localStorage.setItem('reimbursement_preferred_format', e.target.value);
                      }}
                      className="block w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs outline-none transition-all font-semibold"
                    >
                      <option value="Both">Both (PDF & Excel)</option>
                      <option value="PDF">PDF Only</option>
                      <option value="Excel">Excel Only</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-150 p-4 rounded-xl text-xs text-indigo-700 space-y-2.5 text-left">
                <p className="font-bold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Policy Rules Active
                </p>
                <p className="leading-relaxed font-normal text-slate-600">
                  Only rides starting after {filters.reimburseAfterTime === '20:00' ? '8:00 PM' : filters.reimburseAfterTime} within a {reimbursementWindow}-hour window are marked as Eligible by default. You can edit any individual ride details or toggle eligibility within the main Claim table.
                </p>
              </div>

              {/* ADVANCED ADMIN CONTROLS */}
              <div className="border-t border-slate-150 pt-6 space-y-4">
                <h4 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest text-left">Advanced Administration</h4>
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Toggle Developer Console */}
                  <button
                    type="button"
                    onClick={() => setShowDebugPanel(!showDebugPanel)}
                    className={`flex-1 py-3 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      showDebugPanel
                        ? 'bg-slate-900 border-slate-950 text-white hover:bg-slate-800'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Terminal className="w-4 h-4" />
                    <span>{showDebugPanel ? 'Hide Developer Console' : 'Show Developer Console'}</span>
                  </button>

                  {/* Reset localStorage / Restart Setup Wizard */}
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to reset all configurations and data? This will clear all settings and restart the Claimant Setup Wizard.')) {
                        localStorage.clear();
                        window.location.reload();
                      }
                    }}
                    className="flex-1 py-3 px-4 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 hover:border-red-300 font-bold rounded-xl text-xs transition-all active:scale-[0.98] text-center cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Reset Data & Restart Setup</span>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-100 hover:shadow-indigo-200 transition-all cursor-pointer font-extrabold"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

