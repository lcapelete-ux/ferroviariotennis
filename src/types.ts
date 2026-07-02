export interface UserProfile {
  uid: string;
  fullName: string;
  phone: string;
  role: 'user' | 'admin' | 'professor';
  credits: number;
  noShowCount: number;
  penaltyUntil?: any;
  suspensionUntil?: any;
  canManageChampionships?: boolean;
  allowedCourt1?: boolean;
  created_at: string;
  updated_at?: string;
  fcmToken?: string;
}

export interface AdminAlert {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  bookingId: string;
  bookingDate: string;
  bookingTime: string;
  type: 'late_cancellation_attempt' | 'no_show_report' | 'empty_court_report';
  reporterId?: string;
  reporterName?: string;
  created_at: string;
  read: boolean;
}

export interface Booking {
  id: string;
  courtId: 'court1' | 'court2';
  userId: string;
  userName: string;
  userPhone?: string;
  date: string | null; // YYYY-MM-DD or null if fixed
  dayOfWeek?: number; // 0-6
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  type: 'single' | 'double' | 'lesson';
  status: 'confirmed' | 'cancelled' | 'no-show';
  creditsUsed?: number;
  maintenanceConfirmed?: boolean;
  isFixed?: boolean;
  exceptDates?: string[]; // Array of YYYY-MM-DD for fixed bookings
  professorName?: string;
  isRanking?: boolean;
  isLastMinute?: boolean;
  opponentName?: string;
  partnerId?: string;
  partnerName?: string;
  isVisitorGame?: boolean;
  visitorName?: string;
  visitorPixPaid?: boolean;
  observation?: string;
  created_at: string;
  updated_at: string;
}

export interface Championship {
  id: string;
  title: string;
  description: string;
  type: 'singles' | 'doubles';
  startDate: string;
  endDate: string;
  registrationStartDate: string;
  registrationDeadline: string;
  maxParticipants?: number;
  registrationFee?: number;
  pixKey?: string;
  isDrawnPairs?: boolean;
  status: 'open' | 'closed' | 'finished';
  organizerId?: string;   // member designated by the admin to help organize this championship
  organizerName?: string;
  created_at: string;
  updated_at: string;
}

export interface ChampionshipRegistration {
  id: string;
  championshipId: string;
  userId1: string;
  userId2?: string;
  userName1: string;
  userName2?: string;
  status: 'confirmed' | 'cancelled';
  paymentStatus: 'pending' | 'informed' | 'paid';
  isDrawn?: boolean;
  created_at: string;
}

export interface ChampionshipMatch {
  id: string;
  championshipId: string;
  round: number;
  matchNumber: number;
  participant1Id?: string; // registrationId
  participant2Id?: string; // registrationId
  participant1Name?: string;
  participant2Name?: string;
  score1?: string;
  score2?: string;
  winnerId?: string; // registrationId
  nextMatchId?: string;
  status: 'pending' | 'finished';
  created_at: string;
}

export interface ClubSettings {
  id: string;
  requireRegisteredPartner: boolean;
  updated_at: string;
}

export interface MaintenanceReport {
  id: string;
  message: string;
  status: 'pending' | 'resolved';
  created_at: string;
  read: boolean;
}
