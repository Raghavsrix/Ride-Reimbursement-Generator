// Receipt extraction engines using Regex and DOM-based techniques

export interface ExtractedData {
  fare: number | null;
  currency: string;
  date: string | null;
  time: string | null;
  pickup: string | null;
  dropoff: string | null;
  invoiceNumber: string | null;
  paymentMethod: string | null;
  rideId: string | null;
  receiptUrl: string | null;
  bookingFee: number | null;
  promotion: number | null;
  tax: number | null;
  driverName: string | null;
}

// Convert common date string representations to YYYY-MM-DD
export function parseDateToYYYYMMDD(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const cleanDate = dateStr.replace(/[\r\n\t]/g, ' ').trim();
    const d = new Date(cleanDate);
    if (isNaN(d.getTime())) {
      // Try manual matching for things like "Wednesday, Jul 7, 2026" or "7 July 2026"
      const parts = cleanDate.split(/[\s,]+/);
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      let monthIdx = -1;
      let day = '';
      let year = '';

      for (const p of parts) {
        const lower = p.toLowerCase();
        const mIdx = months.findIndex(m => lower.startsWith(m));
        if (mIdx !== -1) {
          monthIdx = mIdx;
        } else if (/^\d{1,2}$/.test(p)) {
          day = p;
        } else if (/^\d{4}$/.test(p)) {
          year = p;
        }
      }

      if (monthIdx !== -1 && day && year) {
        const formattedMonth = String(monthIdx + 1).padStart(2, '0');
        const formattedDay = String(parseInt(day, 10)).padStart(2, '0');
        return `${year}-${formattedMonth}-${formattedDay}`;
      }
      return null;
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (e) {
    return null;
  }
}

// Helper to extract fare float from any string containing currency
function cleanFare(str: string | null): number | null {
  if (!str) return null;
  // Look for decimals like 88.10 or 1,234.50
  const match = str.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  if (match) {
    const val = parseFloat(match[1]);
    return isNaN(val) ? null : val;
  }
  return null;
}

// Regex-based extraction strategy
export function extractWithRegex(htmlStr: string, textStr: string, provider: 'Uber' | 'Rapido'): ExtractedData {
  const result: ExtractedData = {
    fare: null,
    currency: 'INR',
    date: null,
    time: null,
    pickup: null,
    dropoff: null,
    invoiceNumber: null,
    paymentMethod: null,
    rideId: null,
    receiptUrl: null,
    bookingFee: null,
    promotion: null,
    tax: null,
    driverName: null,
  };

  // Use raw text and text representation of HTML
  const cleanHtmlText = htmlStr ? htmlStr.replace(/<[^>]+>/g, ' ') : '';
  const searchCorpus = (textStr + ' ' + cleanHtmlText).replace(/\s+/g, ' ');

  // 1. Currency Identification
  if (htmlStr.includes('₹') || htmlStr.includes('INR') || htmlStr.includes('Rs') || searchCorpus.includes('₹')) {
    result.currency = 'INR';
  } else if (htmlStr.includes('$') || searchCorpus.includes('$')) {
    result.currency = 'USD';
  } else if (htmlStr.includes('€') || searchCorpus.includes('€')) {
    result.currency = 'EUR';
  }

  // 2. Fare Extraction
  // Priority patterns e.g., "Total ₹88.10", "Amount Charged: ₹88.10"
  const farePatterns = [
    /(?:total|amount paid|amount charged|total charged|fare|total bill|total paid)[^\w\d\n\r]*(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{1,2})?)/i,
    /(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{1,2})?)[^\w\d\n\r]*(?:total|charged|paid|bill)/i,
    /(?:total|charged|paid|amount)[^\w\d\n\r]*(\d+(?:\.\d{2}))/i,
    /(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{2}))/i
  ];

  for (const pattern of farePatterns) {
    const match = searchCorpus.match(pattern);
    if (match) {
      result.fare = cleanFare(match[1]);
      if (result.fare !== null && result.fare > 0) break;
    }
  }

  // 3. Date Extraction
  const datePatterns = [
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i, // 7 July 2026
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4})/i, // July 7, 2026
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/, // 2026-07-07
    /(\d{1,2}[-/]\d{1,2}[-/]\d{4})/ // 07-07-2026
  ];

  for (const pattern of datePatterns) {
    const match = searchCorpus.match(pattern);
    if (match) {
      const parsed = parseDateToYYYYMMDD(match[1]);
      if (parsed) {
        result.date = parsed;
        break;
      }
    }
  }

  // 4. Time Extraction
  const timePatterns = [
    /(\d{1,2}:\d{2}\s*(?:AM|PM))/i,
    /(\d{2}:\d{2})/
  ];

  for (const pattern of timePatterns) {
    const match = searchCorpus.match(pattern);
    if (match) {
      result.time = match[1].trim();
      break;
    }
  }

  // 5. Pickup & Dropoff Address
  const pickupPatterns = [
    /(?:pickup|from|start|pickup location|source):\s*([^\n\r\|•\t\<\>]{5,100})/i,
    /(?:departed\s+from|picked\s+up\s+at)\s+([^\n\r\|•\t\<\>]{5,100})/i
  ];
  for (const pattern of pickupPatterns) {
    const match = searchCorpus.match(pattern);
    if (match) {
      result.pickup = match[1].trim();
      break;
    }
  }

  const dropoffPatterns = [
    /(?:dropoff|destination|to|drop|dropoff location|drop location):\s*([^\n\r\|•\t\<\>]{5,100})/i,
    /(?:arrived\s+at|dropped\s+off\s+at)\s+([^\n\r\|•\t\<\>]{5,100})/i
  ];
  for (const pattern of dropoffPatterns) {
    const match = searchCorpus.match(pattern);
    if (match) {
      result.dropoff = match[1].trim();
      break;
    }
  }

  // 6. Ride ID & Booking ID
  const rideIdPatterns = [
    /(?:trip id|ride id|booking id|receipt id|id):\s*([a-f0-9-]{10,50}|\d{10,25})/i,
    /trip_id\s*=\s*([a-f0-9-]{10,50})/i
  ];
  for (const pattern of rideIdPatterns) {
    const match = searchCorpus.match(pattern);
    if (match) {
      result.rideId = match[1].trim();
      break;
    }
  }

  // 7. Invoice Number
  const invoicePatterns = [
    /(?:invoice number|invoice no\.?|tax invoice no\.?):\s*([A-Z0-9-]+)/i,
    /invoice\s+no\.\s+([A-Z0-9-]+)/i
  ];
  for (const pattern of invoicePatterns) {
    const match = searchCorpus.match(pattern);
    if (match) {
      result.invoiceNumber = match[1].trim();
      break;
    }
  }

  // 8. Payment Method
  const paymentPatterns = [
    /(?:paid with|payment method|charged to|paid via|payment):\s*([^\n\r\|•\t\<\>]{3,30})/i,
    /using\s+(visa|mastercard|cash|paytm|gpay|google pay|uber cash|personal\s+••••\s*\d{4})/i
  ];
  for (const pattern of paymentPatterns) {
    const match = searchCorpus.match(pattern);
    if (match) {
      result.paymentMethod = match[1].trim();
      break;
    }
  }

  // 9. Receipt URL
  if (htmlStr) {
    const urlMatch = htmlStr.match(/href="([^"]+?\.uber\.com\/receipts\/[^"]+?)"/i) || htmlStr.match(/href="([^"]+?view_receipt[^"]+?)"/i);
    if (urlMatch) {
      result.receiptUrl = urlMatch[1];
    }
  }

  // 10. Booking Fee
  const bookingFeePatterns = [
    /(?:booking fee|access fee|convenience fee|service fee|tolls & fees)[^\w\d\n\r]*(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{1,2})?)/i,
    /(?:booking fee|access fee|convenience fee|service fee|tolls & fees)\s*(\d+(?:\.\d{1,2})?)/i
  ];
  for (const pattern of bookingFeePatterns) {
    const match = searchCorpus.match(pattern);
    if (match) {
      result.bookingFee = cleanFare(match[1]);
      break;
    }
  }

  // 11. Promotion / Discount
  const promotionPatterns = [
    /(?:promotion|discount|promo|saved|benefit)[^\w\d\n\r]*(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{1,2})?)/i,
    /(?:promotion|discount|promo|saved|benefit)\s*(\d+(?:\.\d{1,2})?)/i
  ];
  for (const pattern of promotionPatterns) {
    const match = searchCorpus.match(pattern);
    if (match) {
      result.promotion = cleanFare(match[1]);
      break;
    }
  }

  // 12. Tax
  const taxPatterns = [
    /(?:tax|gst|cgst|sgst|vat|service tax)[^\w\d\n\r]*(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{1,2})?)/i,
    /(?:tax|gst|cgst|sgst|vat|service tax)\s*(\d+(?:\.\d{1,2})?)/i
  ];
  for (const pattern of taxPatterns) {
    const match = searchCorpus.match(pattern);
    if (match) {
      result.tax = cleanFare(match[1]);
      break;
    }
  }

  // 13. Driver Name
  const driverPatterns = [
    /(?:you rode with|your driver,?|driver name|driver):\s*([A-Za-z\s]{2,20})/i
  ];
  for (const pattern of driverPatterns) {
    const match = searchCorpus.match(pattern);
    if (match) {
      result.driverName = match[1].trim();
      break;
    }
  }

  return result;
}

// DOM-based extraction strategy (runs in browser/server context)
export function extractWithDOM(htmlStr: string, provider: 'Uber' | 'Rapido'): ExtractedData {
  const result: ExtractedData = {
    fare: null,
    currency: 'INR',
    date: null,
    time: null,
    pickup: null,
    dropoff: null,
    invoiceNumber: null,
    paymentMethod: null,
    rideId: null,
    receiptUrl: null,
    bookingFee: null,
    promotion: null,
    tax: null,
    driverName: null,
  };

  if (!htmlStr) return result;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlStr, 'text/html');

    // Helper to find node containing text
    const findElementByText = (selector: string, regex: RegExp): HTMLElement | null => {
      const elements = doc.querySelectorAll(selector);
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as HTMLElement;
        if (regex.test(el.textContent || '')) {
          return el;
        }
      }
      return null;
    };

    // 1. Currency Identification
    const fullText = doc.body?.textContent || '';
    if (fullText.includes('₹') || fullText.includes('INR') || fullText.includes('Rs')) {
      result.currency = 'INR';
    } else if (fullText.includes('$')) {
      result.currency = 'USD';
    } else if (fullText.includes('€')) {
      result.currency = 'EUR';
    }

    // 2. Fare Extraction
    const fareElements = [
      ...Array.from(doc.querySelectorAll('.total, .total-fare, .total-price, .amount, .price, .fare')),
      findElementByText('td, div, span, p, h1, h2', /Total|Charged|Paid|Bill/i),
    ].filter(Boolean) as HTMLElement[];

    for (const el of fareElements) {
      const text = el.textContent || '';
      const parentText = el.parentElement?.textContent || '';
      
      const match = text.match(/(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{1,2})?)/i) || 
                    parentText.match(/(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{1,2})?)/i);
      
      if (match) {
        result.fare = cleanFare(match[1]);
        if (result.fare !== null && result.fare > 0) break;
      }
    }

    // Fallback: search for any cell styled uniquely or containing large money sums
    if (result.fare === null) {
      const allTextNodes = Array.from(doc.querySelectorAll('td, div, span'));
      for (const node of allTextNodes) {
        const text = node.textContent || '';
        const match = text.match(/^(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{2}))$/i);
        if (match) {
          result.fare = cleanFare(match[1]);
          if (result.fare !== null) break;
        }
      }
    }

    // 3. Date Extraction
    const dateEl = findElementByText('td, div, span, p', /January|February|March|April|May|June|July|August|September|October|November|December/i);
    if (dateEl) {
      const match = dateEl.textContent?.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4})/i) ||
                    dateEl.textContent?.match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
      if (match) {
        const parsed = parseDateToYYYYMMDD(match[1]);
        if (parsed) result.date = parsed;
      }
    }

    // 4. Time Extraction
    const timeEl = findElementByText('td, div, span, p', /\d{1,2}:\d{2}\s*(?:AM|PM)/i) ||
                   findElementByText('td, div, span, p', /\d{2}:\d{2}/i);
    if (timeEl) {
      const match = timeEl.textContent?.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i) ||
                    timeEl.textContent?.match(/(\d{2}:\d{2})/);
      if (match) {
        result.time = match[1].trim();
      }
    }

    // 5. Pickup & Dropoff Addresses (Map link anchors are most specific)
    const mapAnchors = Array.from(doc.querySelectorAll('a[href*="maps"]'));
    if (mapAnchors.length >= 2) {
      result.pickup = mapAnchors[0].textContent?.trim() || null;
      result.dropoff = mapAnchors[1].textContent?.trim() || null;
    }

    // Fallbacks
    if (!result.pickup) {
      const pEl = findElementByText('td, div, p, span', /Pickup|Start|From/i);
      if (pEl) {
        result.pickup = pEl.textContent?.replace(/Pickup|Start|From/gi, '').replace(/[:\-\|]/g, '').trim() || null;
      }
    }
    if (!result.dropoff) {
      const dEl = findElementByText('td, div, p, span', /Dropoff|Destination|To|Drop/i);
      if (dEl) {
        result.dropoff = dEl.textContent?.replace(/Dropoff|Destination|To|Drop/gi, '').replace(/[:\-\|]/g, '').trim() || null;
      }
    }

    // 6. Ride ID & Booking ID
    const rideIdEl = findElementByText('td, div, p, span', /Trip ID|Ride ID|Booking ID/i);
    if (rideIdEl) {
      const match = rideIdEl.textContent?.match(/(?:Trip ID|Ride ID|Booking ID):\s*([a-f0-9-]+|\d+)/i);
      if (match) {
        result.rideId = match[1].trim();
      }
    }

    // 7. Invoice Number
    const invoiceEl = findElementByText('td, div, p, span', /Invoice Number|Invoice No/i);
    if (invoiceEl) {
      const match = invoiceEl.textContent?.match(/(?:Invoice Number|Invoice No\.?):\s*([A-Z0-9-]+)/i);
      if (match) {
        result.invoiceNumber = match[1].trim();
      }
    }

    // 8. Payment Method
    const payEl = findElementByText('td, div, p, span', /Paid with|Payment Method|Charged to/i);
    if (payEl) {
      result.paymentMethod = payEl.textContent?.replace(/Paid with|Payment Method|Charged to/gi, '').replace(/[:\-\|]/g, '').trim() || null;
    }

    // 9. Receipt URL
    const receiptAnchor = doc.querySelector('a[href*="receipts"], a[href*="view_receipt"]') as HTMLAnchorElement | null;
    if (receiptAnchor) {
      result.receiptUrl = receiptAnchor.href;
    }

    // 10. Booking Fee
    const feeEl = findElementByText('td, div, span, p', /Booking Fee|Access Fee|Convenience Fee|Service Fee|Tolls/i);
    if (feeEl) {
      const match = feeEl.textContent?.match(/(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{1,2})?)/i) ||
                    feeEl.parentElement?.textContent?.match(/(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{1,2})?)/i);
      if (match) result.bookingFee = cleanFare(match[1]);
    }

    // 11. Promotion / Discount
    const promoEl = findElementByText('td, div, span, p', /Promotion|Discount|Promo|Saved|Benefit/i);
    if (promoEl) {
      const match = promoEl.textContent?.match(/(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{1,2})?)/i) ||
                    promoEl.parentElement?.textContent?.match(/(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{1,2})?)/i);
      if (match) result.promotion = cleanFare(match[1]);
    }

    // 12. Tax
    const taxEl = findElementByText('td, div, span, p', /Tax|GST|CGST|SGST|VAT/i);
    if (taxEl) {
      const match = taxEl.textContent?.match(/(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{1,2})?)/i) ||
                    taxEl.parentElement?.textContent?.match(/(?:₹|rs\.?|inr|\$)\s*(\d+(?:\.\d{1,2})?)/i);
      if (match) result.tax = cleanFare(match[1]);
    }

    // 13. Driver Name
    const driverEl = findElementByText('td, div, span, p', /You rode with|Your driver|Driver/i);
    if (driverEl) {
      const match = driverEl.textContent?.match(/(?:rode with|your driver,?|driver):\s*([A-Za-z\s]{2,20})/i);
      if (match) result.driverName = match[1].trim();
    }

  } catch (e) {
    console.error('DOM Parser failed:', e);
  }

  return result;
}
