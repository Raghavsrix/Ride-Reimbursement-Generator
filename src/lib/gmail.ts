import { RideReceipt } from '../types';

interface GmailMessageHeader {
  name: string;
  value: string;
}

interface GmailPart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers?: GmailMessageHeader[];
  body?: {
    size: number;
    data?: string;
  };
  parts?: GmailPart[];
}

interface GmailMessageResponse {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: {
    partId?: string;
    mimeType: string;
    filename?: string;
    headers: GmailMessageHeader[];
    body?: {
      size: number;
      data?: string;
    };
    parts?: GmailPart[];
  };
}

// Decodes a base64url encoded string safely, supporting UTF-8 characters
function decodeBase64Url(str: string): string {
  // Convert from base64url to standard base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding
  while (base64.length % 4) {
    base64 += '=';
  }
  try {
    const rawData = atob(base64);
    const bytes = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      bytes[i] = rawData.charCodeAt(i);
    }
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
  } catch (e) {
    try {
      return decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    } catch (err) {
      console.error('Failed to decode base64url:', err);
      return '';
    }
  }
}

// Recursively find and extract body text from message parts
function getMessageBody(payload: any): { text: string; html: string } {
  let text = '';
  let html = '';

  const traverse = (part: any) => {
    if (!part) return;

    if (part.mimeType === 'text/plain' && part.body?.data) {
      text += decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      html += decodeBase64Url(part.body.data);
    }

    if (part.parts && part.parts.length > 0) {
      for (const subPart of part.parts) {
        traverse(subPart);
      }
    }
  };

  // If there's a body directly on the payload
  if (payload.body?.data) {
    if (payload.mimeType === 'text/plain') {
      text = decodeBase64Url(payload.body.data);
    } else if (payload.mimeType === 'text/html') {
      html = decodeBase64Url(payload.body.data);
    }
  }

  // Traverses parts
  if (payload.parts) {
    for (const part of payload.parts) {
      traverse(part);
    }
  }

  return { text, html };
}

// Clean HTML into simple, readable text to save Gemini API context token size
export function cleanEmailBody(rawHtml: string, rawText: string): string {
  if (rawText && rawText.trim().length > 100) {
    // If we have plain text body, remove links and long whitespace sequences
    return rawText
      .replace(/https?:\/\/\S+/gi, '[URL]') // Hide URLs to keep it short
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (!rawHtml) return '';

  // Clean HTML if no plain text was available
  let clean = rawHtml;
  // Remove script and style tags and content
  clean = clean.replace(/<style([\s\S]*?)<\/style>/gi, '');
  clean = clean.replace(/<script([\s\S]*?)<\/script>/gi, '');
  // Replace standard block elements with spaces/newlines
  clean = clean.replace(/<\/p>/gi, '\n');
  clean = clean.replace(/<\/div>/gi, '\n');
  clean = clean.replace(/<\/tr>/gi, '\n');
  clean = clean.replace(/<br\s*\/?>/gi, '\n');
  clean = clean.replace(/<td>/gi, '\t');
  // Strip all other HTML tags
  clean = clean.replace(/<[^>]+>/g, ' ');
  // Compress multiple spaces/newlines
  clean = clean.replace(/[ \t]+/g, ' ');
  clean = clean.replace(/\n\s*\n+/g, '\n');
  // Hide long URLs
  clean = clean.replace(/https?:\/\/\S+/gi, '[URL]');

  return clean.trim();
}

// Build Gmail search query
export function buildGmailQuery(
  startDate: string,
  endDate: string,
  providers: { uber: boolean; rapido: boolean }
): string {
  const parts: string[] = [];

  // Date filters
  // Gmail after: and before: expects YYYY/MM/DD
  if (startDate) {
    const formattedStart = startDate.replace(/-/g, '/');
    parts.push(`after:${formattedStart}`);
  }
  if (endDate) {
    // Gmail "before" is exclusive, so we add 1 day to include the end date in standard usage,
    // or keep it simple. Let's add 1 day to endDate so if they pick 2026-07-01, they get rides ON 2026-07-01.
    const dateObj = new Date(endDate);
    dateObj.setDate(dateObj.getDate() + 1);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    parts.push(`before:${year}/${month}/${day}`);
  }

  // Provider filter - broad maximizing of recall as requested in Issue 1
  const providerQueries: string[] = [];
  if (providers.uber) {
    providerQueries.push('uber');
  }
  if (providers.rapido) {
    providerQueries.push('rapido');
  }

  if (providerQueries.length > 0) {
    parts.push(`(${providerQueries.join(' OR ')})`);
  } else {
    // If neither is selected, we won't return anything
    parts.push('subject:nonexistent_ride_receipt_xyz');
  }

  return parts.join(' ');
}

// Fetch matching messages from Gmail
export async function fetchGmailMessages(
  accessToken: string,
  query: string
): Promise<{ id: string; threadId: string }[]> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
    query
  )}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gmail API List failed: ${response.statusText} (${errText})`);
  }

  const data = await response.json();
  return data.messages || [];
}

export function extractOriginalReceiptHtml(html: string): string {
  if (!html) return '';

  const lowerHtml = html.toLowerCase();
  
  // Try to find the start of the forwarded section
  let fwdIndex = -1;
  const indicators = [
    '---------- forwarded message ----------',
    '---------- forwarded message',
    'forwarded message',
    'from: uber',
    'from: rapido',
  ];
  
  for (const indicator of indicators) {
    const idx = lowerHtml.indexOf(indicator);
    if (idx !== -1) {
      fwdIndex = idx;
      break;
    }
  }

  if (fwdIndex === -1) {
    return html;
  }

  const postFwd = html.substring(fwdIndex);
  
  // We want to skip the forwarding headers and find the original content
  const headerCleanText = postFwd.replace(/From:[^\n<]*/gi, '')
                                 .replace(/Date:[^\n<]*/gi, '')
                                 .replace(/Subject:[^\n<]*/gi, '')
                                 .replace(/To:[^\n<]*/gi, '')
                                 .replace(/Cc:[^\n<]*/gi, '');

  const tagIndex = headerCleanText.search(/<(table|div|style|html|body|center|p|section)/i);
  if (tagIndex !== -1) {
    return headerCleanText.substring(tagIndex);
  }

  return postFwd;
}

// Fetch details for a specific message and parse headers
export async function fetchMessageDetails(
  accessToken: string,
  messageId: string
): Promise<RideReceipt> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Gmail API Get Message failed for ${messageId}: ${response.statusText}`);
  }

  const message: GmailMessageResponse = await response.json();
  
  const headers = message.payload.headers;
  const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const subject = getHeader('subject');
  const from = getHeader('from');
  const dateStr = getHeader('date'); // Raw date header e.g., "Mon, 6 Jul 2026 21:14:10 +0530"

  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  // Helper to extract candidates from all MIME parts recursively
  const getHtmlCandidates = (payload: any): { content: string; depth: number }[] => {
    const candidates: { content: string; depth: number }[] = [];
    const traverse = (part: any, depth: number) => {
      if (!part) return;
      if (part.mimeType === 'text/html' && part.body?.data) {
        candidates.push({
          content: decodeBase64Url(part.body.data),
          depth
        });
      }
      if (part.parts && part.parts.length > 0) {
        for (const subPart of part.parts) {
          traverse(subPart, depth + 1);
        }
      }
    };
    traverse(payload, 0);
    if (payload.body?.data && payload.mimeType === 'text/html') {
      candidates.push({
        content: decodeBase64Url(payload.body.data),
        depth: 0
      });
    }
    return candidates;
  };

  const getTextCandidates = (payload: any): { content: string; depth: number }[] => {
    const candidates: { content: string; depth: number }[] = [];
    const traverse = (part: any, depth: number) => {
      if (!part) return;
      if (part.mimeType === 'text/plain' && part.body?.data) {
        candidates.push({
          content: decodeBase64Url(part.body.data),
          depth
        });
      }
      if (part.parts && part.parts.length > 0) {
        for (const subPart of part.parts) {
          traverse(subPart, depth + 1);
        }
      }
    };
    traverse(payload, 0);
    if (payload.body?.data && payload.mimeType === 'text/plain') {
      candidates.push({
        content: decodeBase64Url(payload.body.data),
        depth: 0
      });
    }
    return candidates;
  };

  const htmlCandidates = getHtmlCandidates(message.payload);
  const textCandidates = getTextCandidates(message.payload);

  // Filter HTML candidates containing receipt keywords
  const receiptKeywords = ['thanks for riding', 'uber', 'payments', 'total', 'rapido'];
  const matchingHtmlCandidates = htmlCandidates.filter(c => {
    const lower = c.content.toLowerCase();
    return receiptKeywords.some(keyword => lower.includes(keyword));
  });

  let selectedHtml = '';
  let selectedHtmlDepth = 0;

  if (matchingHtmlCandidates.length > 0) {
    // Select the deepest matching HTML document
    matchingHtmlCandidates.sort((a, b) => b.depth - a.depth);
    selectedHtml = matchingHtmlCandidates[0].content;
    selectedHtmlDepth = matchingHtmlCandidates[0].depth;
  } else if (htmlCandidates.length > 0) {
    htmlCandidates.sort((a, b) => b.depth - a.depth);
    selectedHtml = htmlCandidates[0].content;
    selectedHtmlDepth = htmlCandidates[0].depth;
  }

  textCandidates.sort((a, b) => b.depth - a.depth);
  const selectedText = textCandidates.length > 0 ? textCandidates[0].content : '';

  // 1. Detect if it's a forwarded receipt based on headers or body signatures
  const checkText = (subject + ' ' + from + ' ' + selectedText + ' ' + selectedHtml).toLowerCase();
  const isForwarded = 
    checkText.includes('---------- forwarded message ----------') ||
    checkText.includes('from: uber') ||
    checkText.includes('from: uber receipts') ||
    checkText.includes('from: rapido') ||
    subjectLower.startsWith('fwd:');

  let provider: 'Uber' | 'Rapido' | null = null;
  let isRejected = false;
  let rejectionReason = '';

  // 2. Determine provider
  if (fromLower.includes('uber.com') || fromLower.includes('uber')) {
    provider = 'Uber';
  } else if (
    fromLower.includes('rapido.bike') || 
    fromLower.includes('rapido.com') || 
    fromLower.includes('rapido') || 
    subjectLower.includes('rapido')
  ) {
    provider = 'Rapido';
  } else {
    // If from a personal or user email, but forwarded, identify the inner provider
    if (isForwarded) {
      if (checkText.includes('rapido')) {
        provider = 'Rapido';
      } else if (checkText.includes('uber')) {
        provider = 'Uber';
      }
    }

    if (!provider) {
      if (subjectLower.includes('uber')) {
        provider = 'Uber';
      } else if (subjectLower.includes('rapido')) {
        provider = 'Rapido';
      } else {
        isRejected = true;
        rejectionReason = 'Sender email, subject, and body do not match Uber or Rapido signatures.';
      }
    }
  }

  // 3. Validate receipt relevance (using both subject and body keywords if forwarded)
  if (provider && !isRejected) {
    const isUberReceipt = 
      subjectLower.includes('trip') || 
      subjectLower.includes('receipt') || 
      subjectLower.includes('invoice') || 
      subjectLower.includes('ride') || 
      subjectLower.includes('fare') || 
      subjectLower.includes('order') ||
      subjectLower.includes('charge') ||
      subjectLower.includes('payment') ||
      (isForwarded && (
        checkText.includes('thanks for riding') ||
        checkText.includes('receipt') ||
        checkText.includes('total') ||
        checkText.includes('amount') ||
        checkText.includes('fare')
      ));

    const isRapidoReceipt = 
      subjectLower.includes('ride') || 
      subjectLower.includes('invoice') || 
      subjectLower.includes('receipt') || 
      subjectLower.includes('bill') || 
      subjectLower.includes('fare') || 
      subjectLower.includes('rapido') ||
      (isForwarded && (
        checkText.includes('receipt') ||
        checkText.includes('total') ||
        checkText.includes('bill') ||
        checkText.includes('fare')
      ));

    if (provider === 'Uber' && !isUberReceipt) {
      isRejected = true;
      rejectionReason = 'Email does not contain Uber receipt keywords in subject or body.';
    } else if (provider === 'Rapido' && !isRapidoReceipt) {
      isRejected = true;
      rejectionReason = 'Email does not contain Rapido receipt keywords in subject or body.';
    }
  }

  // Parse email received date & time strictly in user's local timezone (Asia/Kolkata)
  const receivedTimestamp = parseInt(message.internalDate, 10);
  const emailDate = new Date(receivedTimestamp);
  const isoReceived = emailDate.toISOString();
  
  let hours = 0;
  let minutes = 0;
  let formattedTime = '00:00';
  let formattedDateIST = '';

  try {
    const kolkataFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });

    const parts = kolkataFormatter.formatToParts(emailDate);
    const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    
    hours = parseInt(partMap.hour, 10) % 24;
    minutes = parseInt(partMap.minute, 10);
    formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    // Format Date strictly in Asia/Kolkata
    const kolkataDateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dateParts = kolkataDateFormatter.formatToParts(emailDate);
    const datePartMap = Object.fromEntries(dateParts.map((p) => [p.type, p.value]));
    formattedDateIST = `${datePartMap.year}-${datePartMap.month}-${datePartMap.day}`;
  } catch (err) {
    console.error('Failed to parse timezone explicitly, falling back to environment defaults:', err);
    hours = emailDate.getHours();
    minutes = emailDate.getMinutes();
    formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const y = emailDate.getFullYear();
    const m = String(emailDate.getMonth() + 1).padStart(2, '0');
    const d = String(emailDate.getDate()).padStart(2, '0');
    formattedDateIST = `${y}-${m}-${d}`;
  }

  // Check if reimbursable (Default threshold is after 8:00 PM, which is 20:00)
  const isReimbursable = hours >= 20;

  // Isolate the original receipt HTML
  let finalHtml = selectedHtml;
  if (isForwarded && selectedHtml) {
    finalHtml = extractOriginalReceiptHtml(selectedHtml);
  }

  const cleanedBody = cleanEmailBody(finalHtml, selectedText);

  return {
    id: messageId,
    messageId,
    threadId: message.threadId,
    provider: provider || 'Uber',
    subject,
    from,
    dateReceived: isoReceived,
    dateReceivedIST: formattedDateIST,
    timeReceived: formattedTime,
    isReimbursable,
    isRejected,
    rejectionReason,
    fare: 0, // extracted later
    currency: 'INR', // default
    pickup: '',
    dropoff: '',
    confidence: 0,
    isForwarded,
    _cleanedBody: cleanedBody,
    _rawNestedHtml: finalHtml, // original nested html without forwarded wrappers
    _outerHtml: selectedHtml, // the raw html with forwarded wrappers
    _nestedHtmlSize: finalHtml ? finalHtml.length : 0
  } as any;
}
