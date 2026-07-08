import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { RideReceipt } from '../types';
import { getEffectivePickup, getEffectiveDropoff } from './routeHelper';

function formatDateToDMY(dateStr: string): string {
  if (!dateStr) return 'N/A';
  const trimmed = dateStr.trim();
  // Match YYYY-MM-DD or YYYY/MM/DD
  const ymdRegex = /^(\d{4})[-/](\d{2})[-/](\d{2})$/;
  const match = trimmed.match(ymdRegex);
  if (match) {
    const [_, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }
  
  // Try parsing with Date object as fallback
  try {
    const dObj = new Date(trimmed);
    if (!isNaN(dObj.getTime())) {
      const day = String(dObj.getDate()).padStart(2, '0');
      const month = String(dObj.getMonth() + 1).padStart(2, '0');
      const year = dObj.getFullYear();
      return `${day}/${month}/${year}`;
    }
  } catch (e) {
    // ignore
  }
  return dateStr;
}

export async function generateReimbursementPDF(
  rides: RideReceipt[],
  employeeName: string,
  employeeEmail: string,
  startDate: string,
  endDate: string,
  uberTotal: number,
  rapidoTotal: number,
  grandTotal: number,
  employeeId: string = 'N/A',
  department: string = 'N/A',
  companyName: string = 'truefan.ai',
  reportTitle: string = 'RIDE REIMBURSEMENT REPORT'
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  
  // Use Helvetica standard fonts
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
  
  // Page size: A4 (595 x 842 points)
  const pageWidth = 595;
  const pageHeight = 842;
  
  // Calculate paging
  const rowsPerPageFirst = 12; // first page has the metadata headers
  const rowsPerPageSubsequent = 22;
  
  const pages: { rides: RideReceipt[]; isFirst: boolean; pageIndex: number }[] = [];
  let remainingRides = [...rides];
  let pageIndex = 0;
  
  while (remainingRides.length > 0 || pageIndex === 0) {
    const isFirst = pageIndex === 0;
    const count = isFirst ? rowsPerPageFirst : rowsPerPageSubsequent;
    const chunk = remainingRides.splice(0, count);
    pages.push({ rides: chunk, isFirst, pageIndex });
    pageIndex++;
    if (remainingRides.length === 0) break;
  }
  
  const totalPages = pages.length;
  
  const now = new Date();
  const nowDay = String(now.getDate()).padStart(2, '0');
  const nowMonth = String(now.getMonth() + 1).padStart(2, '0');
  const nowYear = now.getFullYear();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const timeStr = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  const generatedAtTimestamp = `${nowDay}/${nowMonth}/${nowYear} at ${timeStr}`;
  
  for (const pageData of pages) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const { width, height } = page.getSize();
    
    let y = height - 50; // Start with margin
    
    if (pageData.isFirst) {
      // Draw Corporate Accent Bar at the very top
      page.drawRectangle({
        x: 40,
        y: y,
        width: width - 80,
        height: 4,
        color: rgb(0.31, 0.27, 0.9), // Indigo accent
      });
      y -= 25;
      
      // Draw Company Ready Header
      page.drawText(companyName.toUpperCase(), {
        x: 40,
        y: y + 10,
        size: 9,
        font: fontBold,
        color: rgb(0.47, 0.55, 0.64), // Cool grey
      });
      
      page.drawText(reportTitle.toUpperCase(), {
        x: 40,
        y: y - 10,
        size: 18,
        font: fontBold,
        color: rgb(0.06, 0.09, 0.16), // Dark slate
      });
      
      // Right side Pending Indicator box
      page.drawRectangle({
        x: width - 200,
        y: y - 10,
        width: 160,
        height: 20,
        color: rgb(0.95, 0.95, 0.98),
        borderColor: rgb(0.88, 0.9, 0.94),
        borderWidth: 1,
      });
      page.drawText('Pending Verification', {
        x: width - 170,
        y: y - 4,
        size: 8,
        font: fontBold,
        color: rgb(0.31, 0.27, 0.9),
      });
      
      y -= 35;
      
      // Subtitle detail
      page.drawText('Employee Travel Expenses Reimbursement Manifest', {
        x: 40,
        y: y + 5,
        size: 9,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4),
      });
      y -= 15;
      
      // Horizontal separation line
      page.drawRectangle({
        x: 40,
        y: y,
        width: width - 80,
        height: 1,
        color: rgb(0.88, 0.9, 0.94),
      });
      y -= 20;
      
      // Metadata Details Columns
      // Left Column: Claimant Details
      page.drawText('CLAIMANT DETAILS', { x: 40, y, size: 8, font: fontBold, color: rgb(0.47, 0.55, 0.64) });
      // Right Column: Claim Details
      page.drawText('CLAIM REPORT DETAILS', { x: 320, y, size: 8, font: fontBold, color: rgb(0.47, 0.55, 0.64) });
      y -= 15;
      
      // Row 1
      page.drawText('Full Name:', { x: 40, y, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(employeeName || 'N/A', { x: 110, y, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      
      page.drawText('Claim Period:', { x: 320, y, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(`${formatDateToDMY(startDate)} to ${formatDateToDMY(endDate)}`, { x: 400, y, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      y -= 13;
      
      // Row 2
      page.drawText('Employee ID:', { x: 40, y, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(employeeId || 'N/A', { x: 110, y, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      
      page.drawText('Generated On:', { x: 320, y, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(generatedAtTimestamp, { x: 400, y, size: 9, font: fontRegular });
      y -= 13;
      
      // Row 3
      page.drawText('Department:', { x: 40, y, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(department || 'N/A', { x: 110, y, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      
      page.drawText('Email Address:', { x: 320, y, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(employeeEmail || 'N/A', { x: 400, y, size: 9, font: fontRegular });
      y -= 25;
      
      // Draw Metrics Grid (4 cards)
      const cardW = (width - 80 - 15) / 4; // width of each card with spacing
      const cardH = 50;
      const cardY = y - cardH;
      
      // 1. Included Count
      page.drawRectangle({ x: 40, y: cardY, width: cardW, height: cardH, color: rgb(0.97, 0.98, 0.99), borderColor: rgb(0.88, 0.9, 0.94), borderWidth: 0.5 });
      page.drawText('ELIGIBLE RIDES', { x: 46, y: cardY + 36, size: 7, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(`${rides.length} Receipts`, { x: 46, y: cardY + 14, size: 12, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      
      // 2. Uber Total
      page.drawRectangle({ x: 40 + cardW + 5, y: cardY, width: cardW, height: cardH, color: rgb(0.97, 0.98, 0.99), borderColor: rgb(0.88, 0.9, 0.94), borderWidth: 0.5 });
      page.drawText('UBER TOTAL', { x: 40 + cardW + 11, y: cardY + 36, size: 7, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(`INR ${uberTotal.toLocaleString('en-IN', { minimumFractionDigits: 1 })}`, { x: 40 + cardW + 11, y: cardY + 14, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      
      // 3. Rapido Total
      page.drawRectangle({ x: 40 + 2 * (cardW + 5), y: cardY, width: cardW, height: cardH, color: rgb(0.97, 0.98, 0.99), borderColor: rgb(0.88, 0.9, 0.94), borderWidth: 0.5 });
      page.drawText('RAPIDO TOTAL', { x: 40 + 2 * (cardW + 5) + 6, y: cardY + 36, size: 7, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(`INR ${rapidoTotal.toLocaleString('en-IN', { minimumFractionDigits: 1 })}`, { x: 40 + 2 * (cardW + 5) + 6, y: cardY + 14, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      
      // 4. Highlighted Grand Total
      page.drawRectangle({ x: 40 + 3 * (cardW + 5), y: cardY, width: cardW, height: cardH, color: rgb(0.31, 0.27, 0.9) }); // Solid Indigo
      page.drawText('GRAND TOTAL', { x: 40 + 3 * (cardW + 5) + 6, y: cardY + 36, size: 7, font: fontBold, color: rgb(0.8, 0.8, 1) });
      page.drawText(`INR ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, { x: 40 + 3 * (cardW + 5) + 6, y: cardY + 14, size: 11, font: fontBold, color: rgb(1, 1, 1) });
      
      y -= 70;
    } else {
      // Subsequent page short running header
      page.drawText(reportTitle.toUpperCase() + ' (CONTINUED)', {
        x: 40,
        y: y,
        size: 10,
        font: fontBold,
        color: rgb(0.47, 0.55, 0.64),
      });
      page.drawText(`Employee: ${employeeName}`, {
        x: width - 200,
        y: y,
        size: 8,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.5),
      });
      page.drawRectangle({
        x: 40,
        y: y - 5,
        width: width - 80,
        height: 1,
        color: rgb(0.88, 0.9, 0.94),
      });
      y -= 25;
    }
    
    // Draw repeated Table Headers
    const colX = {
      provider: 40,
      date: 82,
      time: 134,
      route: 186,
      payment: 398,
      rideId: 450,
      fare: 505,
    };
    
    const tableRightBoundary = width - 40; // 555
    const rightMarginText = tableRightBoundary - 6; // 549
    
    // Table Header Row Background
    page.drawRectangle({
      x: 40,
      y: y - 4,
      width: width - 80,
      height: 18,
      color: rgb(0.09, 0.11, 0.18), // Deep Corporate Midnight Indigo
    });
    
    page.drawText('Provider', { x: colX.provider + 4, y, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText('Date', { x: colX.date + 4, y, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText('Billing Time', { x: colX.time + 4, y, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText('Route detail (Pickup -> Dropoff)', { x: colX.route + 4, y, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText('Payment', { x: colX.payment + 4, y, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText('Ride ID', { x: colX.rideId + 4, y, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    
    // Right-align 'Amount' header text
    const amountHeaderStr = 'Amount';
    const amountHeaderWidth = fontBold.widthOfTextAtSize(amountHeaderStr, 8);
    page.drawText(amountHeaderStr, { x: rightMarginText - amountHeaderWidth, y, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    
    y -= 18;
    
    // Draw Rows
    if (pageData.rides.length === 0) {
      page.drawText('No eligible ride receipts found for this period.', {
        x: width / 2 - 100,
        y: y - 20,
        size: 9,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.5),
      });
    } else {
      let alternate = false;
      for (const ride of pageData.rides) {
        // Row background striping
        if (alternate) {
          page.drawRectangle({
            x: 40,
            y: y - 3,
            width: width - 80,
            height: 20,
            color: rgb(0.97, 0.98, 0.99),
          });
        }
        
        // Bottom cell border
        page.drawRectangle({
          x: 40,
          y: y - 3,
          width: width - 80,
          height: 0.5,
          color: rgb(0.9, 0.92, 0.94),
        });
        
        // Format date and time
        const dateStr = ride.dateOfRide || ride.dateReceived.split('T')[0];
        const formattedDateStr = formatDateToDMY(dateStr);
        const timeStr = ride.timeOfRide || ride.timeReceived;
        
        // Route (truncate if too long to prevent overflowing PDF cells)
        const pickup = getEffectivePickup(ride.pickup);
        const dropoff = getEffectiveDropoff(ride.dropoff);
        let route = `${pickup} -> ${dropoff}`;
        if (route.length > 44) {
          route = route.substring(0, 42) + '...';
        }
        
        // Draw details
        page.drawText(ride.provider, {
          x: colX.provider + 4,
          y: y + 2,
          size: 8,
          font: fontBold,
          color: ride.provider === 'Uber' ? rgb(0.08, 0.08, 0.08) : rgb(0.75, 0.55, 0.0)
        });
        
        page.drawText(formattedDateStr, { x: colX.date + 4, y: y + 2, size: 8, font: fontRegular, color: rgb(0.15, 0.15, 0.15) });
        page.drawText(timeStr || 'N/A', { x: colX.time + 4, y: y + 2, size: 8, font: fontRegular, color: rgb(0.15, 0.15, 0.15) });
        page.drawText(route, { x: colX.route + 4, y: y + 2, size: 7.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
        const displayPaymentMethod = !ride.paymentMethod || ride.paymentMethod === 'N/A' ? 'Cash/UPI' : ride.paymentMethod;
        page.drawText(displayPaymentMethod, { x: colX.payment + 4, y: y + 2, size: 8, font: fontRegular, color: rgb(0.35, 0.35, 0.35) });
        
        const rId = ride.rideId || 'N/A';
        const displayRideId = rId.length > 10 ? rId.substring(0, 8) + '..' : rId;
        page.drawText(displayRideId, { x: colX.rideId + 4, y: y + 2, size: 7.5, font: fontMono, color: rgb(0.4, 0.4, 0.4) });
        
        // Align fare rightwards
        const fareStr = `INR ${ride.fare.toFixed(2)}`;
        const fareWidth = fontBold.widthOfTextAtSize(fareStr, 8);
        page.drawText(fareStr, { x: rightMarginText - fareWidth, y: y + 2, size: 8, font: fontBold, color: rgb(0.06, 0.09, 0.16) });
        
        y -= 20;
        alternate = !alternate;
      }
    }
    
    // Bottom grid boundary line
    page.drawRectangle({
      x: 40,
      y: y + 17,
      width: width - 80,
      height: 1,
      color: rgb(0.8, 0.84, 0.88),
    });
    
    // Check if it is the last page to draw Approval blocks & breakdown
    const isLastPage = pageData.pageIndex === totalPages - 1;
    if (isLastPage) {
      y -= 15;
      
      // Summary line
      page.drawRectangle({
        x: 40,
        y: y,
        width: width - 80,
        height: 1,
        color: rgb(0.8, 0.84, 0.88),
      });
      y -= 20;
      
      // Breakdown of Provider Totals
      page.drawText('PROVIDER BREAKDOWNS', { x: 40, y, size: 8, font: fontBold, color: rgb(0.47, 0.55, 0.64) });
      page.drawText('GRAND TOTAL REIMBURSEMENT', { x: 340, y, size: 8, font: fontBold, color: rgb(0.06, 0.09, 0.16) });
      y -= 15;
      
      page.drawText(`Uber Reimbursement Sum: INR ${uberTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, { x: 40, y, size: 8.5, font: fontRegular });
      page.drawText(`INR ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, { x: 340, y, size: 14, font: fontBold, color: rgb(0.31, 0.27, 0.9) }); // Highlighted grand sum
      y -= 14;
      
      page.drawText(`Rapido Reimbursement Sum: INR ${rapidoTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, { x: 40, y, size: 8.5, font: fontRegular });
      y -= 45;
      
      // Physical signatures placeholder blocks
      page.drawRectangle({ x: 40, y, width: 180, height: 0.5, color: rgb(0.5, 0.5, 0.5) });
      page.drawRectangle({ x: 375, y, width: 180, height: 0.5, color: rgb(0.5, 0.5, 0.5) });
      y -= 12;
      
      page.drawText('Claimant Employee Signature & Date', { x: 40, y, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });
      page.drawText('Authorized Finance Reviewer Signature', { x: 375, y, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });
    }
    
    // Draw Footer Page Numbers
    page.drawText(`Page ${pageData.pageIndex + 1} of ${totalPages}`, {
      x: width / 2 - 20,
      y: 20,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    // Timestamp on footer
    page.drawText(`Generated on ${generatedAtTimestamp}`, {
      x: 40,
      y: 20,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
  
  return await pdfDoc.save();
}
