import * as XLSX from 'xlsx';
import { RideReceipt } from '../types';
import { getEffectivePickup, getEffectiveDropoff } from './routeHelper';

export function generateReimbursementExcel(
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
): Uint8Array {
  // Create workbook
  const workbook = XLSX.utils.book_new();

  // Create sheet data as an array of arrays
  const data: any[][] = [];

  // 1. HEADER SECTION (Metadata)
  data.push([companyName.toUpperCase()]);
  data.push([reportTitle.toUpperCase()]);
  data.push([]); // spacer
  data.push(['Employee Name:', employeeName || 'N/A']);
  data.push(['Employee ID:', employeeId || 'N/A']);
  data.push(['Department:', department || 'N/A']);
  data.push(['Employee Email:', employeeEmail || 'N/A']);
  data.push(['Claim Cycle Period:', `${startDate} to ${endDate}`]);
  data.push(['Report Date & Time:', new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString()]);
  data.push([]); // spacer

  // Keep track of the header row index (0-indexed)
  // Current length of data array represents the index of the next row
  const headerRowIdx = data.length;

  // 2. ITEMIZED RIDES HEADER
  data.push([
    'Ride Date',
    'Ride Time',
    'Provider',
    'Pickup Location',
    'Dropoff Location',
    'Payment Method',
    'Ride ID',
    'Fare (INR)'
  ]);

  // 3. INSERT ELIGIBLE RIDES DATA
  const startDataRowIdx = data.length;
  rides.forEach((ride) => {
    const dateOfRide = ride.dateOfRide || ride.dateReceived.split('T')[0];
    const timeOfRide = ride.timeOfRide || ride.timeReceived;
    
    // Push primitive values. We will format cell properties afterwards.
    data.push([
      dateOfRide,
      timeOfRide,
      ride.provider,
      getEffectivePickup(ride.pickup),
      getEffectiveDropoff(ride.dropoff),
      ride.paymentMethod || 'N/A',
      ride.rideId || 'N/A',
      ride.fare
    ]);
  });
  const endDataRowIdx = data.length;

  // 4. TOTALS ROW (Immediately under data table)
  data.push([
    'TOTAL ITEMIZED CLAIMS',
    '',
    '',
    '',
    '',
    '',
    '',
    grandTotal
  ]);
  const totalsRowIdx = data.length - 1;

  // 5. SEPARATE SUMMARY BREAKDOWN SECTION
  data.push([]); // spacer
  data.push([]); // spacer
  data.push(['SUMMARY METRICS SECTION']);
  data.push(['Metric Title', 'Sum Value (INR)', 'Ride Count']);
  
  const uberCount = rides.filter(r => r.provider === 'Uber').length;
  const rapidoCount = rides.filter(r => r.provider === 'Rapido').length;
  
  data.push(['Total Uber Rides Amount', uberTotal, uberCount]);
  data.push(['Total Rapido Rides Amount', rapidoTotal, rapidoCount]);
  data.push(['Grand Total Claim Amount', grandTotal, rides.length]);

  // Convert array of arrays (AOA) to a SheetJS worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(data);

  // 6. CELL-LEVEL FORMATTING & COERCION
  // Format the numerical fare cells to currency (Indian Rupee: ₹)
  for (let r = startDataRowIdx; r < endDataRowIdx; r++) {
    const fareCellRef = XLSX.utils.encode_cell({ r: r, c: 7 }); // Column H is 7
    if (worksheet[fareCellRef]) {
      worksheet[fareCellRef].t = 'n';
      worksheet[fareCellRef].z = '"₹"#,##0.00'; // Rupee format
    }
  }

  // Format the Grand Total in itemized table
  const totalsCellRef = XLSX.utils.encode_cell({ r: totalsRowIdx, c: 7 });
  if (worksheet[totalsCellRef]) {
    worksheet[totalsCellRef].t = 'n';
    worksheet[totalsCellRef].z = '"₹"#,##0.00';
  }

  // Format Summary Table numbers
  const summaryStartRow = totalsRowIdx + 4; // summary rows are below spacers & titles
  for (let offset = 0; offset < 3; offset++) {
    const sumValRef = XLSX.utils.encode_cell({ r: summaryStartRow + offset, c: 1 });
    if (worksheet[sumValRef]) {
      worksheet[sumValRef].t = 'n';
      worksheet[sumValRef].z = '"₹"#,##0.00';
    }
    const countValRef = XLSX.utils.encode_cell({ r: summaryStartRow + offset, c: 2 });
    if (worksheet[countValRef]) {
      worksheet[countValRef].t = 'n';
      worksheet[countValRef].z = '#,##0';
    }
  }

  // 7. FREEZE PANES (Freeze all header rows above table data)
  // Lock the first few rows (metadata headers + table header)
  worksheet['!views'] = [
    {
      state: 'frozen',
      xSplit: 0,
      ySplit: headerRowIdx + 1, // Freeze row just below the Table Headers row
      topLeftCell: `A${headerRowIdx + 2}`,
      activePane: 'bottomLeft'
    }
  ];

  // 8. AUTO COLUMN WIDTH CALCULATION
  const wscols = [
    { wch: 14 }, // Ride Date
    { wch: 12 }, // Ride Time
    { wch: 10 }, // Provider
    { wch: 32 }, // Pickup Location
    { wch: 32 }, // Dropoff Location
    { wch: 16 }, // Payment Method
    { wch: 18 }, // Ride ID
    { wch: 16 }  // Fare (INR)
  ];
  worksheet['!cols'] = wscols;

  // Append sheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Reimbursement Invoice');

  // Write workbook as binary array
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(excelBuffer);
}
