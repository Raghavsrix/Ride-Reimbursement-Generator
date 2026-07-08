export interface RideReceipt {
  id: string; // Gmail message ID
  messageId: string; // Unique Gmail message ID
  threadId: string;
  provider: 'Uber' | 'Rapido';
  subject: string;
  dateReceived: string; // ISO date string of email receipt
  timeReceived: string; // Format: "HH:MM" (24h)
  isReimbursable: boolean; // Based on received time > 8:00 PM (or manual toggle)
  
  // Extracted ride details
  fare: number;
  currency: string;
  dateOfRide?: string; // YYYY-MM-DD
  timeOfRide?: string; // HH:MM AM/PM or HH:MM
  pickup?: string;
  dropoff?: string;
  confidence: number; // Gemini extraction confidence 0 to 1
  
  // Custom extra extracted fields
  bookingFee?: number | null;
  promotion?: number | null;
  tax?: number | null;
  driverName?: string | null;
  paymentMethod?: string | null;
  invoiceNumber?: string | null;
  rideId?: string | null;
  receiptUrl?: string | null;
  
  // Status flags
  loading?: boolean;
  error?: string;
  notes?: string;
  edited?: {
    pickup?: boolean;
    dropoff?: boolean;
    fare?: boolean;
    paymentMethod?: boolean;
    notes?: boolean;
  };
}

export interface FilterConfig {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  providers: {
    uber: boolean;
    rapido: boolean;
  };
  reimburseAfterTime: string; // "20:00"
}
