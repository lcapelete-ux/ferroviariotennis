import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Booking, UserProfile, Championship, ChampionshipRegistration, ChampionshipMatch } from '../types';
import { format, startOfWeek, addDays, isSameDay, parseISO, setHours, setMinutes, isBefore, addMinutes, isAfter, getDay, isWithinInterval, addHours, subHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { isBookingOpen, getAvailableSlots, isDoublesOnly, calculateEndTime, getBookingLimit, isFridayOpenPlay as checkFridayOpenPlay } from '../utils/bookingRules';
import { LogOut, User as UserIcon, Users, Calendar, Info, Clock, AlertCircle, Check, X, CalendarCheck, GraduationCap, Edit2, Trash2, LayoutGrid, List, CalendarDays, UserCheck, Bell, BellRing, Smartphone, Trophy, UserPlus, Shield, Share2, RefreshCw, Menu, ChevronLeft, ChevronRight, Wrench, FileText } from 'lucide-react';
import { logout, auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, query, where, orderBy, limit, getDoc, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import Modal from '../components/Modal';
import { motion, AnimatePresence } from 'motion/react';

import { useSettings } from '../context/SettingsContext';

const TennisCourt = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 150" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="5" y="5" width="90" height="140" stroke="currentColor" strokeWidth="2" />
    <line x1="5" y1="75" x2="95" y2="75" stroke="currentColor" strokeWidth="2" />
    <line x1="15" y1="5" x2="15" y2="145" stroke="currentColor" strokeWidth="2" />
    <line x1="85" y1="5" x2="85" y2="145" stroke="currentColor" strokeWidth="2" />
    <line x1="15" y1="40" x2="85" y2="40" stroke="currentColor" strokeWidth="2" />
    <line x1="15" y1="110" x2="85" y2="110" stroke="currentColor" strokeWidth="2" />
    <line x1="50" y1="40" x2="50" y2="110" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export default function Dashboard() {
  const { user, profile } = useAuth();
  const { settings: globalSettings } = useSettings();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [fixedBookings, setFixedBookings] = useState<Booking[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [myRegistrations, setMyRegistrations] = useState<ChampionshipRegistration[]>([]);
  const [allRegistrations, setAllRegistrations] = useState<ChampionshipRegistration[]>([]);
  const [championshipMatches, setChampionshipMatches] = useState<ChampionshipMatch[]>([]);
  const [viewingBracket, setViewingBracket] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'calendar' | 'ranking' | 'professor' | 'my-bookings' | 'free-slots' | 'profile' | 'admin-professors' | 'championships' | 'maintenance-report' | 'rules'>('calendar');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [maintenanceReportMessage, setMaintenanceReportMessage] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'list'>('day');
  const [userTotalBookings, setUserTotalBookings] = useState(0);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [bookingForUserId, setBookingForUserId] = useState<string | null>(null);
  const [pendingBooking, setPendingBooking] = useState<{
    date: Date;
    startTime: string;
    courtId: 'court1' | 'court2';
    type: 'single' | 'double';
  } | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [hasShared, setHasShared] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isRanking, setIsRanking] = useState(false);
  const [opponentName, setOpponentName] = useState('');
  const [selectedProfessorName, setSelectedProfessorName] = useState('');
  const [observation, setObservation] = useState('');
  const [isBookingLoading, setIsBookingLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState<Championship | null>(null);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    phone: ''
  });

  useEffect(() => {
    if (profile?.uid) {
      setProfileForm({
        fullName: profile.fullName || '',
        phone: profile.phone || ''
      });
      setSelectedProfessorName(profile.fullName || '');
    }
  }, [profile?.uid, profile?.fullName, profile?.phone]);

  const handleSendMaintenanceReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintenanceReportMessage.trim()) return;

    setIsSubmittingReport(true);
    const messageToSend = maintenanceReportMessage;
    
    try {
      const reportId = doc(collection(db, 'maintenance_reports')).id;
      await setDoc(doc(db, 'maintenance_reports', reportId), {
        id: reportId,
        message: messageToSend,
        status: 'pending',
        created_at: new Date().toISOString(),
        read: false
      });
      
      // Trigger email notification via backend
      try {
        // Use the simplified /api route which is redirected to Netlify Functions or handled by local server
        const endpoint = '/api/send-maintenance-report';

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: messageToSend })
        });
        
        if (!response.ok) {
          const errData = await response.json();
          console.error('Erro no servidor ao enviar e-mail:', errData);
        } else {
          console.log('E-mail enviado com sucesso!');
        }
      } catch (e) {
        console.error('Falha ao acionar notificação por e-mail:', e);
      }

      setMaintenanceReportMessage('');
      showAlert("Sucesso", "Sua notificação anônima foi enviada ao administrador. Obrigado!", 'success');
    } catch (error) {
      console.error('Error sending maintenance report:', error);
      handleFirestoreError(error, OperationType.CREATE, 'maintenance_reports');
      showAlert("Erro", "Não foi possível enviar a notificação.", 'error');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        fullName: profileForm.fullName,
        phone: profileForm.phone,
        updated_at: new Date().toISOString()
      });
      
      setIsEditingProfile(false);
      showAlert("Sucesso", "Perfil atualizado com sucesso!", 'success');
    } catch (error) {
      console.error('Error updating profile:', error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`);
      showAlert("Erro", "Não foi possível atualizar o perfil.", "error");
    }
  };

  const handleShareSlot = (day: Date, time: string, court1Free: boolean, court2Free: boolean) => {
    const dateStr = format(day, "dd/MM (EEEE)", { locale: ptBR });
    const courts = [];
    if (court1Free) courts.push("Quadra 1");
    if (court2Free) courts.push("Quadra 2");
    
    const message = `🎾 *Vaga Disponível!*

📅 *Data:* ${dateStr}
⏰ *Horário:* ${time}
🏟️ *${courts.length > 1 ? 'Quadras' : 'Quadra'}:* ${courts.join(' e ')}

Reserve agora pelo app:
${window.location.origin}`;

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  const handleInformPayment = async (registrationId: string) => {
    try {
      await updateDoc(doc(db, 'championship_registrations', registrationId), { paymentStatus: 'informed' });

      setMyRegistrations(prev => prev.map(r => 
        r.id === registrationId ? { ...r, paymentStatus: 'informed' } : r
      ));
      setAllRegistrations(prev => prev.map(r => 
        r.id === registrationId ? { ...r, paymentStatus: 'informed' } : r
      ));
      
      showAlert("Sucesso", "Pagamento informado! O administrador irá validar em breve.", "success");
    } catch (error) {
      console.error('Error informing payment:', error);
      handleFirestoreError(error, OperationType.UPDATE, `championship_registrations/${registrationId}`);
      showAlert("Erro", "Não foi possível informar o pagamento.", "error");
    }
  };

  const handleRegisterChampionship = async (champ: Championship) => {
    if (!profile) return;
    
    if (champ.type === 'doubles' && !champ.isDrawnPairs && !partnerId) {
      showAlert("Erro", "Por favor, selecione um parceiro para duplas.", "error");
      return;
    }

    try {
      const partner = partnerId ? users.find(u => u.uid === partnerId) : null;
      
      const newRegRef = doc(collection(db, 'championship_registrations'));
      await setDoc(newRegRef, {
        id: newRegRef.id,
        championshipId: champ.id,
        userId1: profile.uid,
        userName1: profile.fullName,
        userId2: partnerId || null,
        userName2: partner?.fullName || null,
        status: 'confirmed',
        paymentStatus: 'pending',
        created_at: new Date().toISOString()
      });

      showAlert("Sucesso", "Inscrição realizada com sucesso!", 'success');
      setIsRegistering(null);
      setPartnerId('');
    } catch (error) {
      console.error('Error registering:', error);
      handleFirestoreError(error, OperationType.CREATE, 'championship_registrations');
      showAlert("Erro", "Não foi possível realizar a inscrição.", "error");
    }
  };

  const handleCancelRegistration = async (regId: string) => {
    showConfirm(
      "Cancelar Inscrição",
      "Tem certeza que deseja cancelar sua inscrição neste campeonato?",
      async () => {
        try {
          await deleteDoc(doc(db, 'championship_registrations', regId));
          setMyRegistrations(prev => prev.filter(r => r.id !== regId));
          showAlert("Sucesso", "Inscrição cancelada.", 'success');
        } catch (error) {
          console.error('Error cancelling registration:', error);
          handleFirestoreError(error, OperationType.DELETE, `championship_registrations/${regId}`);
          showAlert("Erro", "Não foi possível cancelar a inscrição.", "error");
        }
      }
    );
  };

  const ranking = React.useMemo(() => {
    const counts: Record<string, { name: string, count: number, hours: number }> = {};
    
    bookings.filter(b => b.status === 'confirmed').forEach(b => {
      if (!counts[b.userId]) {
        counts[b.userId] = { name: b.userName, count: 0, hours: 0 };
      }
      counts[b.userId].count += 1;
      counts[b.userId].hours += 1.25;
    });

    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [bookings]);

  const professors = React.useMemo(() => {
    return users.filter(u => u.role === 'professor' || u.role === 'admin').sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [users]);

  const freeSlotsByDay = React.useMemo(() => {
    const startOfCurrentWeek = startOfWeek(currentDate, { weekStartsOn: 0 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(startOfCurrentWeek, i));
    
    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayOfWeek = day.getDay();
      const slots = getAvailableSlots(day);
      
      const freeSlots = slots.map(startTime => {
        const b1 = bookings.find(b => b.date === dateStr && b.startTime === startTime && b.courtId === 'court1' && b.status === 'confirmed') ||
                   fixedBookings.find(b => b.dayOfWeek === dayOfWeek && b.startTime === startTime && b.courtId === 'court1' && b.status === 'confirmed' && !b.exceptDates?.includes(dateStr));
        const b2 = bookings.find(b => b.date === dateStr && b.startTime === startTime && b.courtId === 'court2' && b.status === 'confirmed') ||
                   fixedBookings.find(b => b.dayOfWeek === dayOfWeek && b.startTime === startTime && b.courtId === 'court2' && b.status === 'confirmed' && !b.exceptDates?.includes(dateStr));
        
        const [h, m] = startTime.split(':').map(Number);
        const slotDateTime = setHours(setMinutes(day, m), h);
        const isPast = isBefore(slotDateTime, new Date());

        return {
          time: startTime,
          court1Free: !b1 && !isPast,
          court2Free: !b2 && !isPast,
          isPast
        };
      }).filter(s => s.court1Free || s.court2Free);

      return {
        day,
        slots: freeSlots
      };
    });
  }, [bookings, fixedBookings, currentDate]);

  // Modal state
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    onConfirm?: () => void;
    onCancel?: () => void;
    onThird?: () => void;
    confirmText?: string;
    cancelText?: string;
    thirdText?: string;
    children?: React.ReactNode;
    confirmDisabled?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  const showAlert = (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setModal({ isOpen: true, title, message, type });
  };

  const showConfirm = (
    title: string, 
    message: string, 
    onConfirm: () => void, 
    onCancel?: () => void,
    confirmText?: string,
    cancelText?: string,
    children?: React.ReactNode,
    confirmDisabled?: boolean,
    onThird?: () => void,
    thirdText?: string
  ) => {
    setModal({ 
      isOpen: true, 
      title, 
      message, 
      type: 'confirm', 
      onConfirm, 
      onCancel,
      onThird,
      confirmText,
      cancelText,
      thirdText,
      children,
      confirmDisabled
    });
  };

  const startOfCurrentWeek = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 0 }), [currentDate]); // Sunday
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfCurrentWeek, i)), [startOfCurrentWeek]);

  const isFetchingRef = useRef(false);
  const lastFetchTimeRef = useRef(0);
  const swipeTouchStartXRef = useRef<number | null>(null);
  const dayTabsRef = useRef<HTMLDivElement>(null);

  const fetchInitialData = useCallback(async (force = false) => {
    if (!profile || (isFetchingRef.current && !force)) return;
    
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < 2000) return;
    
    isFetchingRef.current = true;
    lastFetchTimeRef.current = now;
    if (force) setIsSyncing(true);

    try {
      const [usersSnap, champSnap, matchSnap, allRegsSnap, settingsSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), orderBy('fullName'))),
        getDocs(query(collection(db, 'championships'), where('status', '!=', 'finished'))),
        getDocs(collection(db, 'championship_matches')),
        getDocs(collection(db, 'championship_registrations')),
        getDoc(doc(db, 'settings', 'club_profile'))
      ]);

      setUsers(usersSnap.docs.map(d => d.data() as UserProfile));
      setChampionships(champSnap.docs.map(d => d.data() as Championship));
      setChampionshipMatches(matchSnap.docs.map(d => d.data() as ChampionshipMatch));
      setAllRegistrations(allRegsSnap.docs.map(d => d.data() as ChampionshipRegistration));

      const myRegs = allRegsSnap.docs
        .map(d => d.data() as ChampionshipRegistration)
        .filter(r => r.userId1 === profile.uid || r.userId2 === profile.uid);
      setMyRegistrations(myRegs);
      
      setFirestoreError(null);
    } catch (error: any) {
      console.error('Error fetching initial data:', error);
      setFirestoreError(`Erro no banco de dados: ${error.message || 'Erro desconhecido'}`);
    } finally {
      isFetchingRef.current = false;
      if (force) setIsSyncing(false);
    }
  }, [profile?.uid]);

  const forceSync = async () => {
    await Promise.all([
      fetchInitialData(true),
      fetchBookings()
    ]);
    showAlert("Sincronizado", "Os dados foram atualizados com sucesso!", "success");
  };

  useEffect(() => {
    if (!profile?.uid) return;

    fetchInitialData();

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => d.data() as UserProfile));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'users'));
    const unsubChamps = onSnapshot(collection(db, 'championships'), (snap) => {
      setChampionships(snap.docs.map(d => d.data() as Championship).filter(c => c.status !== 'finished'));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'championships'));
    const unsubMatches = onSnapshot(collection(db, 'championship_matches'), (snap) => {
      setChampionshipMatches(snap.docs.map(d => d.data() as ChampionshipMatch));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'championship_matches'));
    const unsubRegs = onSnapshot(collection(db, 'championship_registrations'), (snap) => {
      const regs = snap.docs.map(d => d.data() as ChampionshipRegistration);
      setAllRegistrations(regs);
      setMyRegistrations(regs.filter(r => r.userId1 === profile.uid || r.userId2 === profile.uid));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'championship_registrations'));

    return () => {
      unsubUsers();
      unsubChamps();
      unsubMatches();
      unsubRegs();
    };
  }, [profile?.uid, fetchInitialData]);

  const fetchBookings = useCallback(async (snapshot?: any) => {
    if (!profile) return;
    
    const startDateStr = format(addDays(startOfCurrentWeek, -14), 'yyyy-MM-dd');
    const endDateStr = format(addDays(startOfCurrentWeek, 30), 'yyyy-MM-dd');

    try {
      let snap;
      if (snapshot) {
        snap = snapshot;
      } else {
        const q = query(collection(db, 'bookings'), where('status', '==', 'confirmed'));
        snap = await getDocs(q);
      }
      
      const all = snap.docs.map((d: any) => d.data() as Booking);
      const confirmedOnly = all.filter((b: any) => b.status === 'confirmed');
      setBookings(confirmedOnly.filter((b: any) => !b.isFixed && b.date && b.date >= startDateStr && b.date <= endDateStr));
      setFixedBookings(confirmedOnly.filter((b: any) => b.isFixed));
      setFirestoreError(null);
    } catch (error: any) {
      console.error('Error fetching bookings:', error);
      handleFirestoreError(error, OperationType.LIST, 'bookings');
      setFirestoreError(`Erro no banco de dados: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [profile?.uid, startOfCurrentWeek]);

  useEffect(() => {
    if (!profile?.uid) return;
    fetchBookings();

    const unsubBookings = onSnapshot(query(collection(db, 'bookings'), where('status', '==', 'confirmed')), (snap) => {
      fetchBookings(snap);
    }, (error) => {
      console.error('Error in bookings snapshot:', error);
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    });

    return () => {
      unsubBookings();
    };
  }, [profile?.uid, fetchBookings]);

  useEffect(() => {
    if (!profile?.uid) return;

    // Calculate user total bookings for the week of the selected date
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 }); // Sunday
    const weekEnd = addDays(weekStart, 6);
    
    const weekBookings = bookings.filter(b => {
      if (b.userId !== profile.uid && b.opponentName !== profile.fullName && b.partnerId !== profile.uid) return false;
      // Fixed bookings SHOULD count towards the weekly limit
      if (b.status === 'cancelled' || b.status === 'no-show') return false;
      
      if (b.isFixed) {
        const fixedDate = addDays(weekStart, b.dayOfWeek!);
        const dateStr = format(fixedDate, 'yyyy-MM-dd');
        return !b.exceptDates?.includes(dateStr);
      }

      const bookingDate = new Date(b.date + 'T00:00:00');
      return bookingDate >= weekStart && bookingDate <= weekEnd;
    });
    
    setUserTotalBookings(weekBookings.length);
  }, [profile?.uid, profile?.fullName, bookings, selectedDate]);

  useEffect(() => {
    if (!profile?.uid) return;

    const fetchNotifications = async () => {
      try {
        const q = query(collection(db, 'slot_notifications'), orderBy('created_at', 'desc'), limit(3));
        const snap = await getDocs(q);
        
        const now = new Date();
        const valid = snap.docs.map(d => d.data() as any).filter((n: any) => {
          if (dismissedNotifications.includes(n.id)) return false;
          if (!n.expiresAt) return true;
          return new Date(n.expiresAt) > now;
        });
        setNotifications(valid);
      } catch (error) {
        console.warn('Notifications error:', error);
      }
    };
    fetchNotifications();

    const unsubNotif = onSnapshot(collection(db, 'slot_notifications'), (snap) => {
      fetchNotifications();
      
      snap.docChanges().forEach((change) => {
        if (change.type === 'added' && Notification.permission === 'granted') {
          const n = change.doc.data() as any;
          const courtName = n.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2';
          const dateStr = n.date ? format(parseISO(n.date), 'dd/MM') : '??';
          
          new Notification('Vaga Liberada! 🎾', {
            body: `${courtName} • ${dateStr} às ${n.startTime}. Toque para ver no app!`,
            icon: '/pwa-192x192.png'
          });
        }
      });
    }, (error) => {
      console.warn('Notifications snapshot error:', error);
    });

    return () => {
      unsubNotif();
    };
  }, [profile?.uid, dismissedNotifications]);

  const handleBooking = async (date: Date, startTime: string, courtId: 'court1' | 'court2', type: 'single' | 'double') => {
    if (!profile) return;

    if (profile.penaltyUntil && new Date(profile.penaltyUntil) > new Date()) {
      showAlert("Agendamento Bloqueado", `Você está bloqueado de agendar até ${format(new Date(profile.penaltyUntil), 'dd/MM/yyyy HH:mm')}`, 'error');
      return;
    }

    const now = new Date();
    const isPrivileged = profile.role === 'admin' || profile.role === 'professor';

    if (profile.role === 'professor' && courtId === 'court1' && !profile.allowedCourt1) {
      showAlert("Acesso Negado", "Professores só podem agendar aulas na Quadra 2, a menos que autorizados pelo Admin para agendar na Quadra 1.", 'warning');
      return;
    }

    if (isDoublesOnly(date, startTime) && date.getDay() === 5 && !isPrivileged) {
      showAlert("Duplas Abertas", "Nas sextas-feiras das 16:30 às 19:30, as quadras são abertas para duplas (Open Play). Não é necessário agendar, basta chegar e jogar!", 'info');
      return;
    }

    const [h, m] = startTime.split(':').map(Number);
    const slotDateTime = setHours(setMinutes(new Date(date), m), h);

    if (!isBookingOpen(slotDateTime, now) && !isPrivileged) {
      showAlert("Agenda Fechada", "Este horário não pertence ao ciclo de agendamento atual. O novo ciclo abre todo domingo às 12:00.", 'warning');
      return;
    }

    if (profile.role === 'professor' && courtId !== 'court2' && !profile.allowedCourt1) {
      showAlert("Restrição de Quadra", "Professores só podem realizar agendamentos na Quadra 2, a menos que autorizados a usar a Quadra 1.", 'warning');
      return;
    }

    // Auto-select professor if user is a professor
    if (profile.role === 'professor') {
      setSelectedProfessorName(profile.fullName);
    } else if (professors.length > 0) {
      setSelectedProfessorName(professors[0].fullName);
    }

    if (editingBooking) {
      setIsRescheduling(true);
    }

    // Dynamic booking limit rule based on user credits
    // Professors and Admins have essentially unlimited credits (99)
    const currentCredits = (profile.role === 'professor' || profile.role === 'admin') ? 99 : (profile.credits || 0);
    const bookingLimit = currentCredits + userTotalBookings;
    
    // Regra da Meia Hora
    const diffInMinutes = (slotDateTime.getTime() - now.getTime()) / (1000 * 60);
    const isLastMinuteBooking = diffInMinutes > 0 && diffInMinutes < 30;

    if ((currentCredits < 1 || currentWeekBookingsCount >= 3) && !isPrivileged && !isLastMinuteBooking) {
      showAlert("Limite Atingido", `Você já utilizou o limite de 3 agendamentos nesta semana (incluindo aulas fixas). Você só pode agendar horários adicionais que iniciam em menos de 30 minutos.`, 'warning');
      return;
    }

    // Check for 48h block
    if (profile.penaltyUntil && isBefore(now, new Date(profile.penaltyUntil))) {
      showAlert("Bloqueio Ativo", `Você está bloqueado para novos agendamentos até ${format(new Date(profile.penaltyUntil), 'dd/MM HH:mm')} devido a um no-show.`, 'error');
      return;
    }

    // Check for suspension
    if (profile.suspensionUntil && isBefore(now, new Date(profile.suspensionUntil))) {
      showAlert("Conta Suspensa", `Sua conta está suspensa até ${format(new Date(profile.suspensionUntil), 'dd/MM/yyyy')} por excesso de faltas.`, 'error');
      return;
    }

    setPendingBooking({ date, startTime, courtId, type });
  };

  const confirmBooking = async (isFixed: boolean = false) => {
    if (!pendingBooking || !profile || isBookingLoading) return;
    const { date, startTime, courtId, type } = pendingBooking;
    const isPrivileged = profile.role === 'admin' || profile.role === 'professor';

    // Partner validation
    const isVisitor = partnerId === 'Visitante' || opponentName.startsWith('Visitante: ');
    const finalOpponentName = isVisitor 
      ? opponentName.replace('Visitante: ', '').trim() 
      : opponentName.replace('Outro: ', '').trim();

    let partner = null;
    if (!isVisitor) {
      partner = users.find(u => u.uid === partnerId);
      if (!partner) {
        partner = users.find(u => u.fullName.toLowerCase() === finalOpponentName.toLowerCase());
      }
    }

    if (!isPrivileged && !partner && !isVisitor) {
      showAlert("Parceiro Obrigatório", "Toda reserva deve ter um parceiro cadastrado no sistema ou ser com um Visitante.", 'warning');
      return;
    }

    if (isVisitor && finalOpponentName === "") {
      showAlert("Nome do Visitante Obrigatório", "Por favor, digite o nome completo do visitante.", 'warning');
      return;
    }

    // Credit check
    const [h_check, m_check] = startTime.split(':').map(Number);
    const slotDateTime_check = setHours(setMinutes(date, m_check), h_check);
    const now_check = new Date();
    const diffInMinutes_check = (slotDateTime_check.getTime() - now_check.getTime()) / (1000 * 60);
    const isLastMinuteBooking_check = diffInMinutes_check > 0 && diffInMinutes_check < 30;

    if (!isPrivileged && !isLastMinuteBooking_check) {
      const actualCredits = (profile.role === 'professor' || profile.role === 'admin') ? 99 : (profile.credits || 0);
      if (actualCredits < 1) {
        showAlert("Créditos Insuficientes", "Você não possui créditos suficientes (1 crédito necessário).", 'error');
        return;
      }
      if (partner && partner.role !== 'professor' && partner.role !== 'admin' && (partner.credits || 0) < 1) {
        showAlert("Créditos Insuficientes", `O parceiro ${partner.fullName} não possui créditos suficientes.`, 'error');
        return;
      }
    }

    const performBooking = async (fixed: boolean) => {
      setIsBookingLoading(true);
      const finalType = fixed ? 'lesson' : type;
      const dateStr = fixed ? null : format(date, 'yyyy-MM-dd');
      const dayOfWeek = date.getDay();
      const endTimeStr = calculateEndTime(startTime);

      const [h, m] = startTime.split(':').map(Number);
      const slotDateTime = setHours(setMinutes(date, m), h);
      const now = new Date();
      
      if (!fixed && isBefore(slotDateTime, now)) {
        showAlert("Horário Inválido", "Não é possível agendar um horário no passado.", 'error');
        setPendingBooking(null);
        setPartnerId('');
        setIsRescheduling(false);
        setEditingBooking(null);
        setIsBookingLoading(false);
        return;
      }

      // Check if user or partner already has a booking at this exact time (simultaneous)
      const checkSimultaneous = (uid: string, name: string) => {
        return bookings.some(b => 
          (b.userId === uid || b.partnerId === uid || b.userName === name || b.partnerName === name || b.opponentName === name) && 
          b.date === dateStr && 
          b.startTime === startTime &&
          b.id !== editingBooking?.id &&
          b.status !== 'cancelled' && b.status !== 'no-show'
        ) || fixedBookings.some(b => 
          (b.userId === uid || b.partnerId === uid || b.userName === name || b.partnerName === name || b.opponentName === name) && 
          b.dayOfWeek === dayOfWeek && 
          b.startTime === startTime &&
          b.id !== editingBooking?.id &&
          b.status !== 'cancelled' && b.status !== 'no-show' &&
          !b.exceptDates?.includes(dateStr || '')
        );
      };

      const userHasSimultaneous = checkSimultaneous(profile.uid, profile.fullName);
      const partnerHasSimultaneous = partner ? checkSimultaneous(partner.uid, partner.fullName) : false;

      if ((userHasSimultaneous || partnerHasSimultaneous) && !isPrivileged) {
        const conflictName = userHasSimultaneous ? "Você" : partner?.fullName;
        showAlert("Conflito de Horário", `${conflictName} já possui um agendamento ou aula neste mesmo horário em outra quadra.`, 'warning');
        setPendingBooking(null);
        setPartnerId('');
        setIsBookingLoading(false);
        return;
      }

      try {
        const batch = writeBatch(db);
        const targetUser = ((profile.role === 'admin' || profile.role === 'professor') && bookingForUserId) ? users.find(u => u.uid === bookingForUserId) : profile;
        const finalUserName = (profile.role === 'admin' || profile.role === 'professor') ? (finalOpponentName || targetUser?.fullName || profile.fullName) : (profile.fullName);

        const bookingId = editingBooking?.id || doc(collection(db, 'bookings')).id;
        const bookingRef = doc(db, 'bookings', bookingId);

        const [h_deduct, m_deduct] = startTime.split(':').map(Number);
        const slotDateTime_deduct = setHours(setMinutes(date, m_deduct), h_deduct);
        const now_deduct = new Date();
        const diffInMinutes_deduct = (slotDateTime_deduct.getTime() - now_deduct.getTime()) / (1000 * 60);
        const isLastMinuteBooking_deduct = diffInMinutes_deduct > 0 && diffInMinutes_deduct < 30;

        const bookingData: any = {
          id: bookingId,
          courtId,
          userId: targetUser?.uid || profile.uid,
          userName: finalUserName + (fixed ? ' (Aula)' : ''),
          userPhone: targetUser?.phone || profile.phone || '',
          date: dateStr,
          dayOfWeek: fixed ? dayOfWeek : null,
          isFixed: fixed,
          professorName: isPrivileged ? (selectedProfessorName || profile.fullName) : (fixed ? profile.fullName : null),
          observation: observation || null,
          isRanking,
          isLastMinute: isLastMinuteBooking_deduct,
          opponentName: isVisitor ? "Visitante: " + finalOpponentName : finalOpponentName,
          partnerId: isVisitor ? "Visitante" : (partner?.uid || null),
          partnerName: isVisitor ? finalOpponentName : (partner?.fullName || null),
          isVisitorGame: isVisitor,
          visitorName: isVisitor ? finalOpponentName : null,
          visitorPixPaid: isVisitor ? (editingBooking?.visitorPixPaid || false) : null,
          startTime: startTime,
          endTime: endTimeStr,
          type: finalType,
          status: 'confirmed',
          updated_at: now.toISOString()
        };

        if (!editingBooking) {
          bookingData.created_at = now.toISOString();
        }

        batch.set(bookingRef, bookingData, { merge: true });

        // Deduct credits
        if (!isPrivileged && !editingBooking && !isLastMinuteBooking_deduct) {
          // Only deduct if not professor/admin
          if (profile.role !== 'professor' && profile.role !== 'admin') {
            const userRef = doc(db, 'users', profile.uid);
            batch.update(userRef, { credits: (profile.credits || 0) - 1 });
          }

          if (partner && partner.role !== 'professor' && partner.role !== 'admin') {
            const partnerRef = doc(db, 'users', partner.uid);
            batch.update(partnerRef, { credits: (partner.credits || 0) - 1 });
          }
        }

        await batch.commit();

        showAlert("Sucesso", fixed ? "Aula fixa agendada!" : "Reserva confirmada!", "success");
        
        // Reset all booking-related states
        setPendingBooking(null);
        setPartnerId('');
        setOpponentName('');
        setObservation('');
        setIsRanking(false);
        setEditingBooking(null);
        setIsRescheduling(false);
        setBookingForUserId(null);

        // Redirect to calendar with a slight delay to ensure smooth transition
        setTimeout(() => {
          setSelectedDate(new Date());
          setCurrentDate(new Date());
          setActiveTab('calendar');
        }, 300);
      } catch (err: any) {
        console.error('Booking error detail:', err);
        handleFirestoreError(err, OperationType.WRITE, 'bookings');
        const errorMessage = err?.message || "Erro desconhecido no banco de dados.";
        showAlert("Erro ao Agendar", errorMessage, "error");
      } finally {
        setIsBookingLoading(false);
      }
    };

    if (isPrivileged && !isFixed) {
      showConfirm(
        "Tipo de Agendamento", 
        "Deseja que este agendamento seja FIXO (toda semana) ou apenas para este DIA?", 
        () => performBooking(true),
        () => performBooking(false),
        "Sim, Fixo",
        "Apenas este dia",
        (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Observação do Professor</label>
              <textarea 
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Ex: Aula começa às 09:00 e termina às 10:15..."
                className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                rows={3}
              />
              <p className="text-[10px] text-zinc-400">Use este campo para informar horários quebrados ou detalhes da aula.</p>
            </div>
          </div>
        )
      );
    } else {
      showConfirm(
        "Confirmar Reserva",
        `Deseja confirmar a reserva para ${format(date, 'dd/MM')} às ${startTime}? 1 crédito será consumido de cada jogador.`,
        () => performBooking(false),
        undefined,
        "Confirmar",
        "Voltar",
        isPrivileged ? (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Observação do Professor</label>
              <textarea 
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Ex: Aula começa às 09:00 e termina às 10:15..."
                className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                rows={3}
              />
              <p className="text-[10px] text-zinc-400">Use este campo para informar horários quebrados ou detalhes da aula.</p>
            </div>
          </div>
        ) : null
      );
    }
  };

  const clearAllBookings = async () => {
    if (profile?.role !== 'admin') return;
    
    showConfirm(
      "Limpar Agenda",
      "Isso excluirá todos os agendamentos normais do sistema. As AULAS FIXAS NÃO serão removidas. Tem certeza?",
      async () => {
        try {
          setIsBookingLoading(true);
          const snap = await getDocs(collection(db, 'bookings'));
          const batch = writeBatch(db);
          let count = 0;
          snap.docs.forEach(d => {
            if (!d.data().isFixed) {
              batch.delete(d.ref);
              count++;
            }
          });
          await batch.commit();
          
          showAlert("Limpeza Concluída", `${count} agendamentos removidos. Aulas fixas mantidas.`, "success");
        } catch (err) {
          console.error('Error clearing bookings:', err);
          handleFirestoreError(err, OperationType.DELETE, 'bookings');
          showAlert("Erro", "Não foi possível limpar os agendamentos.", "error");
        } finally {
          setIsBookingLoading(false);
        }
      },
      undefined,
      "Sim, excluir",
      "Cancelar"
    );
  };

  const manualResetCredits = () => {
    if (profile?.role !== 'admin') return;
    
    showConfirm(
      "RENOVAR CRÉDITOS",
      "Isso irá redefinir os créditos de TODOS os usuários para 3. Deseja continuar?",
      async () => {
        try {
          setIsBookingLoading(true);
          const usersSnap = await getDocs(collection(db, 'users'));

          const batch = writeBatch(db);
          const nowStr = new Date().toISOString();
          let count = 0;

          usersSnap.docs.forEach(uDoc => {
            const data = uDoc.data();
            if (data.role === 'professor' || data.role === 'admin') {
              if (data.credits !== 99) {
                batch.update(uDoc.ref, { credits: 99, updated_at: nowStr });
              }
            } else {
              batch.update(uDoc.ref, { credits: 3, updated_at: nowStr });
              count++;
            }
          });

          const settingsRef = doc(db, 'settings', 'club_profile');
          batch.set(settingsRef, { 
            lastCreditsReset: nowStr,
            updated_at: nowStr 
          }, { merge: true });

          await batch.commit();
          showAlert("Sucesso", `${count} usuários tiveram seus créditos renovados.`, "success");
        } catch (err) {
          console.error('Error resetting credits:', err);
          handleFirestoreError(err, OperationType.UPDATE, 'users');
          showAlert("Erro", "Não foi possível renovar os créditos.", "error");
        } finally {
          setIsBookingLoading(false);
        }
      }
    );
  };

  const handleReportEmptyCourt = (booking: Booking) => {
    if (!profile) return;
    
    showConfirm(
      "Acusar Quadra Vazia",
      "Tem certeza que deseja reportar esta quadra como vazia? O administrador será notificado. Se for um agendamento comum, a vaga será liberada imediatamente.",
      async () => {
        try {
          setIsBookingLoading(true);
          // 1. Enviar Alerta para o Admin (Anônimo Total)
          const newAlertRef = doc(collection(db, 'admin_alerts'));
          await setDoc(newAlertRef, {
            id: newAlertRef.id,
            userId: booking.userId,
            userName: booking.userName,
            userPhone: booking.userPhone || '',
            bookingId: booking.id,
            bookingDate: booking.date || 'Fixo',
            bookingTime: booking.startTime,
            type: 'empty_court_report',
            reporterId: null, 
            reporterName: 'Sócio Anônimo',
            created_at: new Date().toISOString(),
            read: false
          });
          
          // 2. Se não for aula fixa, cancelamos o agendamento atual para liberar a vaga
          if (!booking.isFixed) {
            await updateDoc(doc(db, 'bookings', booking.id), { 
              status: 'no-show', 
              updated_at: new Date().toISOString() 
            });
            
            showAlert("Sucesso", "Quadra reportada! O agendamento foi cancelado e a vaga agora está LIVRE para uso.", "success");
          } else {
            showAlert("Reportado", "O administrador foi notificado sobre a aula fixa vazia. Punições serão aplicadas se confirmado.", "success");
          }
        } catch (err: any) {
          console.error('Error reporting empty court:', err);
          handleFirestoreError(err, OperationType.WRITE, 'admin_alerts');
          showAlert("Erro ao Reportar", err.message || "Não foi possível processar o reporte.", "error");
        } finally {
          setIsBookingLoading(false);
        }
      },
      undefined,
      "Sim, Reportar"
    );
  };

  const handleEditBooking = (booking: Booking) => {
    setEditingBooking(booking);
    setObservation(booking.observation || '');
    setOpponentName(booking.opponentName || '');
    setPartnerId(booking.partnerId || '');
    setSelectedProfessorName(booking.professorName || '');
    setIsRanking(booking.isRanking || false);
    
    // Set pending booking to trigger the confirmation modal flow
    const date = booking.date ? new Date(booking.date + 'T00:00:00') : selectedDate;
    setPendingBooking({
      date,
      startTime: booking.startTime,
      courtId: booking.courtId as 'court1' | 'court2',
      type: booking.type as 'single' | 'double'
    });
  };

  const handleConfirmMaintenance = async (booking: Booking) => {
    try {
      setIsBookingLoading(true);
      await updateDoc(doc(db, 'bookings', booking.id), { 
        maintenanceConfirmed: true,
        updated_at: new Date().toISOString() 
      });
      showAlert("Sucesso", "Manutenção confirmada! Obrigado por cuidar das nossas quadras. 🎾", "success");
    } catch (err: any) {
      console.error('Error confirming maintenance:', err);
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${booking.id}`);
    } finally {
      setIsBookingLoading(false);
    }
  };

  const handleConfirmVisitorPix = async (bookingId: string) => {
    try {
      setIsBookingLoading(true);
      await updateDoc(doc(db, 'bookings', bookingId), {
        visitorPixPaid: true,
        updated_at: new Date().toISOString()
      });
      showAlert("Sucesso", "Pagamento de PIX de visitante informado! O Admin verificará o recebimento.", "success");
    } catch (err: any) {
      console.error('Error confirming visitor PIX:', err);
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${bookingId}`);
      showAlert("Erro", "Não foi possível informar o pagamento do PIX.", "error");
    } finally {
      setIsBookingLoading(false);
    }
  };

  const handleCancelBooking = async (booking: Booking, forDate?: Date) => {
    const isProfessorOfThisBooking = booking.professorName === profile?.fullName;
    const isPartnerOfThisBooking = booking.partnerId === profile?.uid;
    if (booking.userId !== profile?.uid && !isPartnerOfThisBooking && profile?.role !== 'admin' && !(profile?.role === 'professor' && isProfessorOfThisBooking)) return;
    
    const now = new Date();
    let isLate = false;

    const targetDate = forDate || selectedDate || new Date();

    if (!booking.isFixed && booking.date) {
      const [h, m] = booking.startTime.split(':').map(Number);
      const bookingDate = new Date(booking.date + 'T00:00:00');
      const bookingStart = setHours(setMinutes(bookingDate, m), h);
      const cancellationDeadline = subHours(bookingStart, 12);
      isLate = isAfter(now, cancellationDeadline);
    } else if (booking.isFixed) {
      const [h, m] = booking.startTime.split(':').map(Number);
      const bookingStart = setHours(setMinutes(targetDate, m), h);
      const cancellationDeadline = subHours(bookingStart, 12);
      isLate = isAfter(now, cancellationDeadline);
    }

    const shareMessage = `🎾 TENNIS FFC - AVISO DE VAGA 🎾
Uma quadra acaba de ficar disponível e você pode agendar agora!
📍 Local: ${booking.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}
📅 Data: ${booking.isFixed ? format(targetDate, 'dd/MM/yyyy') : format(parseISO(booking.date!), 'dd/MM/yyyy')}
⏰ Horário: ${booking.startTime}
👉 Agende agora pelo App: ${window.location.origin}
Corra, pois as vagas costumam ser preenchidas rapidamente!`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;

    const performCancellation = async (mode: 'permanent' | 'today' = 'permanent') => {
      try {
        const batch = writeBatch(db);
        
        if (booking.isFixed) {
          if (mode === 'permanent') {
            batch.delete(doc(db, 'bookings', booking.id));
          } else {
            const dateStr = format(targetDate, 'yyyy-MM-dd');
            const updatedExceptDates = [...(booking.exceptDates || []), dateStr];
            batch.update(doc(db, 'bookings', booking.id), { 
              exceptDates: updatedExceptDates,
              updated_at: new Date().toISOString()
            });
          }
        } else {
          batch.update(doc(db, 'bookings', booking.id), { status: 'cancelled' });

          // Refund credits if not late or if admin
          // Regra: Somente devolve se falta mais de 12h ou se for Admin
          if (!isLate || profile?.role === 'admin') {
            // Só devolve se NÃO foi uma reserva de última hora (que foi gratuita)
            if (!booking.isLastMinute) {
              const refundAmount = booking.creditsUsed || 1;
              // Refund owner
              const ownerRef = doc(db, 'users', booking.userId);
              const ownerSnap = await getDoc(ownerRef);
              if (ownerSnap.exists()) {
                const ownerData = ownerSnap.data() as UserProfile;
                // Só devolve se o dono NÃO for professor ou admin
                if (ownerData.role !== 'professor' && ownerData.role !== 'admin') {
                  batch.update(ownerRef, { credits: (ownerData.credits || 0) + refundAmount });
                }
              }

              // Refund partner
              if (booking.partnerId) {
                const partnerRef = doc(db, 'users', booking.partnerId);
                const partnerSnap = await getDoc(partnerRef);
                if (partnerSnap.exists()) {
                  const partnerData = partnerSnap.data() as UserProfile;
                  // Só devolve se o parceiro NÃO for professor ou admin
                  if (partnerData.role !== 'professor' && partnerData.role !== 'admin') {
                    batch.update(partnerRef, { credits: (partnerData.credits || 0) + refundAmount });
                  }
                }
              }
            }
          }

          // Notificação de vaga liberada
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 2);

          const newNotifRef = doc(collection(db, 'slot_notifications'));
          batch.set(newNotifRef, {
            id: newNotifRef.id,
            userId: profile?.uid,
            courtId: booking.courtId,
            date: booking.date,
            startTime: booking.startTime,
            created_at: new Date().toISOString(),
            expiresAt: expiresAt.toISOString()
          });
        }

        await batch.commit();
        
        showAlert("Sucesso", booking.isFixed && mode === 'permanent' ? "Aula fixa removida permanentemente." : 
                 booking.isFixed && mode === 'today' ? "Aula cancelada apenas para hoje." :
                 "Agendamento cancelado com sucesso.", 'success');
        fetchBookings();
      } catch (err) {
        console.error('Erro no cancelamento:', err);
        handleFirestoreError(err, OperationType.WRITE, `bookings/${booking.id}`);
        showAlert("Erro", "Não foi possível cancelar o agendamento.", "error");
      }
    };

    if (isLate && profile?.role !== 'admin') {
      showConfirm(
        "Aviso de Crédito",
        "Você irá perder um crédito. Deseja cancelar mesmo assim? (Cancelamento sem perda do crédito até 12 horas antes, após isso o crédito não é devolvido)",
        performCancellation,
        undefined,
        "Sim, cancelar",
        "Manter horário"
      );
      return;
    }

    if (booking.isFixed && (profile?.role === 'admin' || profile?.role === 'professor')) {
      showConfirm(
        "Opções de Cancelamento",
        "Esta é uma aula fixa. Deseja cancelar apenas a ocorrência de HOJE ou remover o agendamento PERMANENTEMENTE?",
        () => performCancellation('permanent'),
        undefined,
        "Excluir Permanente",
        "Voltar",
        undefined,
        false,
        () => performCancellation('today'),
        "Cancelar Apenas Hoje"
      );
      return;
    }

    if (profile?.role === 'admin' || profile?.role === 'professor') {
      showConfirm(
        "Confirmar Cancelamento",
        booking.isFixed ? "Deseja remover esta aula fixa permanentemente?" : "Deseja cancelar este agendamento? Os créditos serão devolvidos aos jogadores.",
        () => performCancellation('permanent'),
        undefined,
        "Confirmar",
        "Voltar"
      );
      return;
    }

    showConfirm(
      "Liberar Vaga",
      "Para cancelar e liberar esta vaga, você deve primeiro compartilhar o aviso no WhatsApp do grupo para que outros sócios saibam da disponibilidade imediata.",
      performCancellation,
      undefined,
      "Confirmar Cancelamento",
      "Voltar",
      (
        <div className="flex flex-col gap-4 mt-2">
          <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
            <p className="text-[10px] font-bold text-zinc-500 uppercase mb-2">Mensagem que será compartilhada:</p>
            <p className="text-xs text-zinc-700 whitespace-pre-wrap italic leading-relaxed">"{shareMessage}"</p>
          </div>
          <a 
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              setHasShared(true);
              setModal(prev => ({ ...prev, confirmDisabled: false }));
            }}
            className="flex items-center justify-center gap-2 w-full py-3 bg-[#25D366] text-white font-bold rounded-xl hover:bg-[#128C7E] transition-all shadow-md active:scale-95"
          >
            <Smartphone className="w-5 h-5" />
            Compartilhar no WhatsApp
          </a>
          <p className="text-[10px] text-zinc-500 text-center">
            O botão de confirmação será liberado após o compartilhamento.
          </p>
        </div>
      ),
      true // confirmDisabled initially
    );
  };

  const renderCourtSlot = (courtId: 'court1' | 'court2', date: Date, startTime: string, isDoubles: boolean) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayOfWeek = date.getDay();

    const slotBooking = bookings.find(b => b.date === dateStr && b.startTime === startTime && b.courtId === courtId) ||
                        fixedBookings.find(b => b.dayOfWeek === dayOfWeek && b.startTime === startTime && b.courtId === courtId && !b.exceptDates?.includes(dateStr));
    
    const [h, m] = startTime.split(':').map(Number);
    const slotDateTime = setHours(setMinutes(date, m), h);
    const isPast = isBefore(slotDateTime, new Date());

    const isFridayOpenPlay = checkFridayOpenPlay(date, startTime);

    // Prioritize showing a booking if it exists, even on Friday Open Play
    if (isFridayOpenPlay && !isPast && !slotBooking) {
      return (
        <div className="flex flex-col justify-center items-center p-3 rounded-xl border-2 border-amber-500 bg-amber-50 text-amber-900 h-full min-h-[100px] text-center shadow-sm relative overflow-hidden group">
          <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center translate-y-4">
            <TennisCourt className="w-24 h-36" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest mb-2 text-amber-700 relative z-10">
            {courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}
          </span>
          <div className="flex flex-col items-center gap-1.5 relative z-10">
            <div className="bg-amber-100 p-2 rounded-full shadow-inner group-hover:scale-110 transition-transform">
              <Users className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black uppercase tracking-tighter text-amber-900">DUPLAS</span>
              <span className="text-[11px] font-bold uppercase tracking-tight text-amber-600">Abertas</span>
            </div>
            <span className="text-[9px] font-black leading-tight text-amber-500 mt-1 uppercase tracking-wider bg-white px-2 py-0.5 rounded-full shadow-sm">
              SÓ CHEGAR E JOGAR! 🎾
            </span>
          </div>
        </div>
      );
    }

    const slotEndDateTime = addMinutes(slotDateTime, 90);
    const reportStartTime = addMinutes(slotDateTime, 20);
    const isCurrentlyHappening = isPast && isBefore(new Date(), slotEndDateTime);
    const canReportEmpty = isAfter(new Date(), reportStartTime) && isBefore(new Date(), slotEndDateTime);

    if (slotBooking) {
      const isProfessorOfThisBooking = slotBooking.professorName === profile?.fullName;
      const isMyBooking = slotBooking.userId === profile?.uid || (profile?.role === 'professor' && isProfessorOfThisBooking);
      return (
        <div className={clsx(
          "flex flex-col justify-between p-3 rounded-xl border-2 transition-all h-full relative",
          isMyBooking ? "bg-emerald-50 border-emerald-500" : "bg-zinc-50 border-zinc-200"
        )}>
          <div>
            <div className="flex justify-between items-start mb-1">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                {courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}
              </span>
              <div className="flex items-center gap-1">
                {slotBooking.isRanking && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-800" title="Jogo de Ranking">
                    🏆 Ranking
                  </span>
                )}
                {slotBooking.isLastMinute && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800" title="Regra dos 30 Minutos (Sem custo)">
                    ⚡ 30min
                  </span>
                )}
                <span className={clsx(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium",
                  slotBooking.type === 'double' ? "bg-amber-100 text-amber-800" : 
                  slotBooking.type === 'lesson' ? "bg-purple-100 text-purple-800" :
                  "bg-blue-100 text-blue-800"
                )}>
                  {slotBooking.type === 'double' ? 'Duplas' : 
                   slotBooking.type === 'lesson' ? 'Aula Fixa' : 'Simples'}
                </span>
              </div>
            </div>
            <div className="font-semibold text-zinc-900 truncate">
              {slotBooking.userName}
              {slotBooking.opponentName && <span className="text-zinc-500 font-normal"> vs {slotBooking.opponentName}</span>}
            </div>
            {slotBooking.professorName && (
              <div className="text-[10px] text-zinc-500 mt-0.5 truncate font-medium">
                Prof: {slotBooking.professorName}
              </div>
            )}
            {slotBooking.observation && (
              <div className="text-[10px] text-amber-700 mt-1.5 font-bold bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 flex items-start gap-1.5 leading-tight">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{slotBooking.observation}</span>
              </div>
            )}
          </div>
          
          <div className="mt-3 flex flex-wrap gap-2">
            {isMyBooking && isPast && !slotBooking.maintenanceConfirmed && (
              <button 
                onClick={() => handleConfirmMaintenance(slotBooking)}
                className="w-full text-[10px] text-white bg-emerald-600 hover:bg-emerald-700 font-bold px-3 py-2 rounded-lg flex items-center justify-center gap-2 shadow-sm"
              >
                <Check className="w-3 h-3" />
                Confirmar Nivelamento
              </button>
            )}
            {(isMyBooking || profile?.role === 'admin') && (!isPast || slotBooking.isFixed) && (
              <>
                {editingBooking?.id === slotBooking.id ? (
                  <button 
                    onClick={() => handleBooking(date, startTime, courtId, slotBooking.type as any)}
                    className="text-xs text-emerald-600 hover:text-emerald-800 font-bold bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200"
                  >
                    Confirmar Aqui
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleCancelBooking(slotBooking, date)}
                      className="text-xs text-red-600 hover:text-red-800 font-medium bg-red-50 px-2 py-1 rounded-md"
                    >
                      Cancelar
                    </button>
                    {(profile?.role === 'admin' || profile?.role === 'professor') && (
                      <button 
                        onClick={() => handleEditBooking(slotBooking)}
                        className="text-xs text-emerald-600 hover:text-emerald-800 font-medium bg-emerald-50 px-2 py-1 rounded-md flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        Editar
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            {canReportEmpty && !isMyBooking && (
              <button 
                onClick={() => handleReportEmptyCourt(slotBooking)}
                className="text-[10px] text-amber-600 hover:text-amber-800 font-medium bg-amber-50 px-2 py-1 rounded-md border border-amber-200"
                title="Reportar que a quadra está vazia"
              >
                Acusar Vazia
              </button>
            )}
          </div>

          {/* Timestamp de criação (Comprovante) */}
          {slotBooking.created_at && (
            <p className="absolute bottom-1 right-2 text-[7px] text-zinc-400 font-medium leading-none">
              Agendado em: {format(new Date(slotBooking.created_at), 'dd/MM HH:mm')}
            </p>
          )}
        </div>
      );
    }

    if (isPast) {
      return (
        <div className="flex flex-col justify-center items-center p-3 rounded-xl border-2 border-zinc-100 bg-zinc-50 text-zinc-400 h-full">
          <span className="text-xs font-bold uppercase tracking-wider mb-1">
            {courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}
          </span>
          <span className="text-xs">Indisponível</span>
        </div>
      );
    }

    return (
      <button
        onClick={() => handleBooking(date, startTime, courtId, isDoubles ? 'double' : 'single')}
        className={clsx(
          "flex flex-col justify-center items-center p-3 rounded-xl border-2 border-dashed transition-all h-full min-h-[80px] group",
          isDoubles 
            ? "border-amber-300 hover:border-amber-500 hover:bg-amber-50" 
            : "border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50"
        )}
      >
        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 group-hover:text-zinc-700">
          {courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}
        </span>
        <span className={clsx(
          "text-sm font-medium",
          isDoubles ? "text-amber-600" : "text-emerald-600"
        )}>
          {isDoubles ? 'Agendar Dupla' : 'Agendar'}
        </span>
      </button>
    );
  };

  const currentWeekBookingsCount = useMemo(() => {
    if (!profile) return 0;
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 0 });
    const weekEnd = addDays(weekStart, 6);
    
    return bookings.filter(b => {
      if (b.userId !== profile.uid && b.partnerId !== profile.uid) return false;
      // Fixed bookings SHOULD count towards the weekly limit
      if (b.isLastMinute) return false;
      if (b.status === 'cancelled' || b.status === 'no-show') return false;
      
      if (b.isFixed) {
        const fixedDate = addDays(weekStart, b.dayOfWeek!);
        const dateStr = format(fixedDate, 'yyyy-MM-dd');
        return !b.exceptDates?.includes(dateStr);
      }
      
      const bookingDate = new Date(b.date + 'T00:00:00');
      return bookingDate >= weekStart && bookingDate <= weekEnd;
    }).length;
  }, [profile, bookings]);

  const getNextOpening = () => {
    const now = new Date();
    let nextSunday = startOfWeek(now, { weekStartsOn: 0 });
    nextSunday = setHours(nextSunday, 12);
    nextSunday = setMinutes(nextSunday, 0);

    if (isAfter(now, nextSunday)) {
      nextSunday = addDays(nextSunday, 7);
    }
    return nextSunday;
  };

  const nextOpening = getNextOpening();

  return (
    <div className="flex min-h-screen bg-zinc-50">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-30 w-[84px] bg-zinc-900 flex flex-col transition-transform duration-300 md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="flex flex-col items-center pt-4 pb-3 border-b border-white/10">
          {globalSettings?.logoUrl ? (
            <img src={globalSettings.logoUrl} alt="Logo" className="w-11 h-11 object-contain rounded-xl" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-11 h-11 bg-emerald-600 rounded-xl flex items-center justify-center">
              <Trophy className="w-6 h-6 text-white" />
            </div>
          )}
        </div>

        {/* Credits badge */}
        <div className="px-3 py-3 border-b border-white/10">
          <div className="bg-emerald-600 rounded-xl flex flex-col items-center py-2">
            <span className="text-[8px] font-black text-white/60 uppercase tracking-widest">Créditos</span>
            <span className="text-xl font-black text-white leading-none">
              {(profile?.role === 'admin' || profile?.role === 'professor') ? '∞' : (profile?.credits || 0)}
            </span>
            {!(profile?.role === 'admin' || profile?.role === 'professor') && (
              <span className="text-[9px] text-white/50 font-bold">/ 3</span>
            )}
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {[
            { tab: 'calendar' as const, icon: <CalendarDays className="w-5 h-5" />, label: 'Agenda', onClick: () => { setActiveTab('calendar'); setSelectedDate(new Date()); setCurrentDate(new Date()); setSidebarOpen(false); }, activeColor: 'bg-emerald-600 text-white' },
            { tab: 'my-bookings' as const, icon: <CalendarCheck className="w-5 h-5" />, label: 'Bookings', onClick: () => { setActiveTab('my-bookings'); setSidebarOpen(false); }, activeColor: 'bg-emerald-600 text-white' },
            { tab: 'championships' as const, icon: <Trophy className="w-5 h-5" />, label: 'Campeon.', onClick: () => { setActiveTab('championships'); setSidebarOpen(false); }, activeColor: 'bg-emerald-600 text-white' },
            { tab: 'free-slots' as const, icon: <LayoutGrid className="w-5 h-5" />, label: 'Vagas', onClick: () => { setActiveTab('free-slots'); setSidebarOpen(false); }, activeColor: 'bg-emerald-600 text-white' },
            { tab: 'maintenance-report' as const, icon: <Wrench className="w-5 h-5" />, label: 'Relatos', onClick: () => { setActiveTab('maintenance-report'); setSidebarOpen(false); }, activeColor: 'bg-amber-500 text-white' },
            { tab: 'rules' as const, icon: <FileText className="w-5 h-5" />, label: 'Regras', onClick: () => { setActiveTab('rules'); setSidebarOpen(false); }, activeColor: 'bg-white/15 text-white' },
          ].map(({ tab, icon, label, onClick, activeColor }) => (
            <button
              key={tab}
              onClick={onClick}
              className={clsx(
                "w-full flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold transition-all text-center",
                activeTab === tab ? activeColor : "text-zinc-400 hover:bg-white/10 hover:text-white"
              )}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}

          {profile?.role === 'admin' && (
            <>
              <div className="pt-3 pb-1 flex items-center justify-center">
                <div className="h-px w-8 bg-white/10" />
              </div>
              {[
                { tab: 'ranking' as const, icon: <List className="w-5 h-5" />, label: 'Ranking', onClick: () => { setActiveTab('ranking'); setSidebarOpen(false); } },
                { tab: 'admin-professors' as const, icon: <UserCheck className="w-5 h-5" />, label: 'Profiss.', onClick: () => { setActiveTab('admin-professors'); setSidebarOpen(false); } },
              ].map(({ tab, icon, label, onClick }) => (
                <button
                  key={tab}
                  onClick={onClick}
                  className={clsx(
                    "w-full flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold transition-all text-center",
                    activeTab === tab ? "bg-white/15 text-white" : "text-zinc-400 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
              <button
                onClick={() => navigate('/admin')}
                className="w-full flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold transition-all text-center text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <Shield className="w-5 h-5" />
                <span>Admin</span>
              </button>
            </>
          )}
          {(profile?.role !== 'admin' && profile?.canManageChampionships) && (
            <button
              onClick={() => navigate('/admin')}
              className="w-full flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold transition-all text-center text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <Shield className="w-5 h-5" />
              <span>Gerenciar</span>
            </button>
          )}
          {profile?.role === 'professor' && (
            <button
              onClick={() => { setActiveTab('professor'); setSidebarOpen(false); }}
              className={clsx(
                "w-full flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold transition-all text-center",
                activeTab === 'professor' ? "bg-emerald-600 text-white" : "text-zinc-400 hover:bg-white/10 hover:text-white"
              )}
            >
              <GraduationCap className="w-5 h-5" />
              <span>Professor</span>
            </button>
          )}
        </nav>

        {/* Bottom: profile + logout */}
        <div className="border-t border-white/10 px-2 py-2 space-y-0.5">
          <button
            onClick={() => { setActiveTab('profile'); setSidebarOpen(false); }}
            className={clsx(
              "w-full flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold transition-all text-center",
              activeTab === 'profile' ? "bg-white/15 text-white" : "text-zinc-400 hover:bg-white/10 hover:text-white"
            )}
          >
            <UserIcon className="w-5 h-5" />
            <span>Perfil</span>
          </button>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold transition-all text-center text-zinc-400 hover:bg-red-500/20 hover:text-red-400"
          >
            <LogOut className="w-5 h-5" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* ── Main content area (offset by sidebar on md+) ── */}
      <div className="flex-1 flex flex-col min-h-screen md:ml-[84px]">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
          <button
            className="md:hidden p-2 text-zinc-400 hover:text-zinc-600 bg-zinc-100 rounded-xl shrink-0"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-black uppercase tracking-tighter text-zinc-900 flex items-center gap-2 italic flex-1">
            {globalSettings?.logoUrl ? (
              <img src={globalSettings.logoUrl} alt="Logo" className="w-10 h-10 object-contain hidden md:block" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 bg-emerald-600 rounded-lg items-center justify-center hidden md:flex">
                <Trophy className="w-5 h-5 text-white" />
              </div>
            )}
            <span className="flex items-baseline gap-1">
              {globalSettings?.clubName ? (
                <span>{globalSettings.clubName.split(' ')[0]} <span className="text-emerald-600">{globalSettings.clubName.split(' ').slice(1).join(' ')}</span></span>
              ) : (
                <>Tennis <span className="text-emerald-600">Hub</span></>
              )}
            </span>
          </h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={forceSync}
              disabled={isSyncing}
              className={clsx(
                "flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 transition-all hover:bg-emerald-100",
                isSyncing && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className={clsx("w-1.5 h-1.5 sm:w-2 sm:h-2 bg-emerald-500 rounded-full", !isSyncing && "animate-pulse")} />
              <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest">
                {isSyncing ? 'Sincronizando...' : 'Sincronizado'}
              </span>
              <RefreshCw className={clsx("w-3 h-3", isSyncing && "animate-spin")} />
            </button>
          </div>
        </div>
        {firestoreError && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 text-amber-800 text-xs font-medium">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-amber-500 mt-0.5" />
                <span className="whitespace-pre-wrap">{firestoreError}</span>
              </div>
              <button 
                onClick={() => {
                  setFirestoreError(null);
                  fetchInitialData();
                  fetchBookings();
                }}
                className="px-3 py-1 bg-amber-200 hover:bg-amber-300 rounded-full transition-colors whitespace-nowrap"
              >
                Tentar Novamente
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        <AnimatePresence>
          {notifications.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 space-y-2"
            >
              {notifications.map(n => (
                <div key={n.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex justify-between items-center shadow-sm">
                  <div className="flex gap-3 items-center">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                      <BellRing className="w-5 h-5 text-amber-600 animate-bounce" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-amber-900 uppercase tracking-tight">Vaga Liberada! 🎾</p>
                      <p className="text-xs text-amber-700">
                        {n.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'} • {format(parseISO(n.date), 'dd/MM')} às {n.startTime}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const date = parseISO(n.date);
                        setSelectedDate(date);
                        setCurrentDate(date);
                        setActiveTab('calendar');
                      }}
                      className="px-3 py-1.5 bg-amber-600 text-white text-[10px] font-black rounded-lg uppercase hover:bg-amber-700 transition-colors"
                    >
                      Ver Agora
                    </button>
                    <button 
                      onClick={() => setDismissedNotifications(prev => [...prev, n.id])}
                      className="p-1.5 text-amber-400 hover:text-amber-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Weekly Status & Next Opening */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="md:col-span-2 bg-emerald-600 rounded-3xl p-6 text-white flex justify-between items-center relative overflow-hidden shadow-lg shadow-emerald-100">
            <div className="relative z-10">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-2">Créditos na Semana</p>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black">{(profile?.role === 'admin' || profile?.role === 'professor') ? '∞' : (profile?.credits || 0)}</span>
                {!(profile?.role === 'admin' || profile?.role === 'professor') && <span className="text-2xl font-bold opacity-60">/ 3</span>}
                {!(profile?.role === 'admin' || profile?.role === 'professor') && (
                  <span className="ml-4 text-sm font-black bg-white/20 px-3 py-1 rounded-full uppercase tracking-widest">
                    {Math.max(0, 3 - (profile?.credits || 0))} Usados
                  </span>
                )}
              </div>
              <p className="text-xs font-medium mt-2 opacity-90">
                {(profile?.role === 'admin' || profile?.role === 'professor') ? 'Agendamentos ilimitados para administradores e professores' : `Você já realizou ${currentWeekBookingsCount} jogos nesta semana`}
              </p>
            </div>
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center relative z-10 backdrop-blur-sm">
              <Trophy className="w-8 h-8 text-white" />
            </div>
            {/* Decorative circles */}
            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute right-12 top-0 w-24 h-24 bg-white/5 rounded-full blur-xl" />
          </div>

          <div className="bg-white rounded-3xl p-6 border border-zinc-100 shadow-sm flex flex-col justify-center">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-4">Próxima Abertura</p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center">
                <Calendar className="w-6 h-6 text-zinc-400" />
              </div>
              <div>
                <p className="font-black text-zinc-900 uppercase">Domingo</p>
                <p className="text-sm text-zinc-500 font-bold">às 12:00</p>
              </div>
            </div>
          </div>
        </div>

        {/* Blocked Banner */}
        {profile?.penaltyUntil && new Date(profile.penaltyUntil) > new Date() && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-bold mb-1">Agendamento Bloqueado</p>
              <p>Você está bloqueado de realizar novos agendamentos até <strong>{format(new Date(profile.penaltyUntil), "dd/MM/yyyy 'às' HH:mm")}</strong> devido a uma infração das regras do clube (ex: não comparecimento).</p>
            </div>
          </div>
        )}

        {/* Info Banner */}




        {activeTab === 'calendar' ? (
          <>
            {/* Reschedule Mode Banner */}
            {editingBooking && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex justify-between items-center shadow-sm">
                <div className="flex gap-3 items-start">
                  <Edit2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-bold mb-1">Modo de Reagendamento</p>
                    <p>Selecione um novo horário para a aula de <strong>{editingBooking.userName}</strong>.</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setEditingBooking(null);
                    setIsRescheduling(false);
                  }}
                  className="px-4 py-2 bg-white border border-amber-200 text-amber-700 text-xs font-bold rounded-xl hover:bg-amber-100 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* Header: date navigation + view toggles */}
            <div className="flex items-center justify-between mb-4 gap-2">
              {/* Date display + prev/next (day view) or week nav (other views) */}
              {calendarView === 'day' ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const prev = addDays(selectedDate, -1);
                      setSelectedDate(prev);
                      if (!weekDays.some(d => isSameDay(d, prev))) setCurrentDate(prev);
                    }}
                    className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="text-center min-w-[160px]">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 capitalize">
                      {format(selectedDate, 'EEEE', { locale: ptBR })}
                    </p>
                    <p className="text-lg font-black text-zinc-900 leading-tight capitalize">
                      {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const next = addDays(selectedDate, 1);
                      const canAdvance = isBookingOpen(next) || profile?.role === 'admin';
                      if (!canAdvance) return;
                      setSelectedDate(next);
                      if (!weekDays.some(d => isSameDay(d, next))) setCurrentDate(next);
                    }}
                    className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  {!isSameDay(selectedDate, new Date()) && (
                    <button
                      onClick={() => { setSelectedDate(new Date()); setCurrentDate(new Date()); }}
                      className="ml-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full hover:bg-emerald-100 transition-all"
                    >
                      Hoje
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-black text-zinc-800 capitalize">
                    {format(startOfCurrentWeek, "MMMM yyyy", { locale: ptBR })}
                  </h2>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentDate(addDays(currentDate, -7))}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setCurrentDate(addDays(currentDate, 7))}
                      disabled={!isBookingOpen(addDays(startOfCurrentWeek, 7)) && profile?.role !== 'admin'}
                      className={clsx("p-1.5 rounded-lg transition-all",
                        (!isBookingOpen(addDays(startOfCurrentWeek, 7)) && profile?.role !== 'admin')
                          ? "text-zinc-200 cursor-not-allowed"
                          : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                      )}>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* View toggles */}
              <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl shrink-0">
                <button onClick={() => setCalendarView('day')}
                  className={clsx("p-2 rounded-lg transition-all", calendarView === 'day' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-400 hover:text-zinc-600")}
                  title="Por Dia"><CalendarDays className="w-4 h-4" /></button>
                <button onClick={() => setCalendarView('week')}
                  className={clsx("p-2 rounded-lg transition-all", calendarView === 'week' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-400 hover:text-zinc-600")}
                  title="Semana"><LayoutGrid className="w-4 h-4" /></button>
                <button onClick={() => setCalendarView('list')}
                  className={clsx("p-2 rounded-lg transition-all", calendarView === 'list' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-400 hover:text-zinc-600")}
                  title="Lista"><List className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Calendar Content based on View */}
            {calendarView === 'day' ? (
              <>
                {/* Day strip */}
                <div ref={dayTabsRef} className="flex gap-1 pb-2 mb-5 hide-scrollbar" style={{overflowX: 'auto', WebkitOverflowScrolling: 'touch'}}>
                  {weekDays.map(day => {
                    const isSelected = isSameDay(selectedDate, day);
                    const isToday = isSameDay(day, new Date());
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        className={clsx(
                          "flex flex-col items-center min-w-[40px] py-2 px-1 rounded-2xl transition-all shrink-0",
                          isSelected
                            ? "bg-emerald-600 text-white shadow-md"
                            : "bg-white text-zinc-500 hover:bg-emerald-50 hover:text-emerald-700"
                        )}
                      >
                        <span className="text-[9px] font-black uppercase tracking-widest">{format(day, 'EEE', { locale: ptBR })}</span>
                        <span className={clsx("text-xl font-black mt-0.5", isSelected ? "text-white" : "text-zinc-800")}>{format(day, 'dd')}</span>
                        <span className={clsx("w-1.5 h-1.5 rounded-full mt-1", isToday ? (isSelected ? "bg-white/70" : "bg-emerald-500") : "bg-transparent")} />
                      </button>
                    );
                  })}
                </div>

                {/* Swipeable slots area */}
                <div
                  className="space-y-3"
                  onTouchStart={(e) => { swipeTouchStartXRef.current = e.touches[0].clientX; }}
                  onTouchEnd={(e) => {
                    if (swipeTouchStartXRef.current === null) return;
                    const delta = e.changedTouches[0].clientX - swipeTouchStartXRef.current;
                    swipeTouchStartXRef.current = null;
                    if (Math.abs(delta) < 50) return;
                    const next = addDays(selectedDate, delta < 0 ? 1 : -1);
                    if (delta < 0 && !isBookingOpen(next) && profile?.role !== 'admin') return;
                    setSelectedDate(next);
                    if (!weekDays.some(d => isSameDay(d, next))) setCurrentDate(next);
                  }}
                >
                  {getAvailableSlots(selectedDate).length === 0 ? (
                    <div className="bg-white rounded-2xl border border-zinc-100 p-8 text-center text-zinc-400">
                      <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="font-bold text-sm">Sem horários disponíveis</p>
                    </div>
                  ) : getAvailableSlots(selectedDate).map(startTime => {
                    const isDoubles = isDoublesOnly(selectedDate, startTime);
                    return (
                      <div key={startTime} className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50 border-b border-zinc-100">
                          <Clock className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-sm font-black text-zinc-800">{startTime}</span>
                          {isDoubles && (
                            <span className="ml-auto text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">
                              Duplas
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-zinc-100">
                          <div className="bg-white p-3">{renderCourtSlot('court1', selectedDate, startTime, isDoubles)}</div>
                          <div className="bg-white p-3">{renderCourtSlot('court2', selectedDate, startTime, isDoubles)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : calendarView === 'week' ? (
              <div className="overflow-x-auto bg-white rounded-2xl border border-zinc-100 shadow-sm">
                <table className="w-full min-w-[800px] border-collapse">
                  <thead>
                    <tr>
                      <th className="p-4 border-b border-zinc-100 bg-zinc-50 text-left text-xs font-bold text-zinc-400 uppercase tracking-wider w-24">Hora</th>
                      {weekDays.map(day => (
                        <th 
                          key={day.toISOString()} 
                          className="p-4 border-b border-zinc-100 bg-zinc-50 text-center cursor-pointer hover:bg-zinc-100 transition-colors"
                          onClick={() => { setSelectedDate(day); setCalendarView('day'); }}
                        >
                          <span className="text-xs font-bold text-zinc-400 uppercase block">{format(day, 'EEE', { locale: ptBR })}</span>
                          <span className="text-lg font-bold text-zinc-800">{format(day, 'dd')}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getAvailableSlots(new Date()).map(startTime => (
                      <tr key={startTime}>
                        <td className="p-4 border-b border-zinc-100 font-bold text-zinc-800 bg-zinc-50/30">{startTime}</td>
                        {weekDays.map(day => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const dayOfWeek = day.getDay();
                          const booking1 = bookings.find(b => b.date === dateStr && b.startTime === startTime && b.courtId === 'court1') ||
                                           fixedBookings.find(b => b.dayOfWeek === dayOfWeek && b.startTime === startTime && b.courtId === 'court1' && !b.exceptDates?.includes(dateStr));
                          const booking2 = bookings.find(b => b.date === dateStr && b.startTime === startTime && b.courtId === 'court2') ||
                                           fixedBookings.find(b => b.dayOfWeek === dayOfWeek && b.startTime === startTime && b.courtId === 'court2' && !b.exceptDates?.includes(dateStr));
                          
                          const [h, m] = startTime.split(':').map(Number);
                          const slotDateTime = setHours(setMinutes(day, m), h);
                          const isPast = isBefore(slotDateTime, new Date());
                          const isDoubles = isDoublesOnly(day, startTime);
                          const isFridayOpenPlay = checkFridayOpenPlay(day, startTime);

                          return (
                            <td key={day.toISOString()} className="p-2 border-b border-zinc-100 border-r last:border-r-0 align-top">
                              <div className="space-y-1">
                                {booking1 ? (
                                  <button 
                                    onClick={() => {
                                      if (booking1.userId === profile?.uid || booking1.partnerId === profile?.uid || profile?.role === 'admin') {
                                        handleCancelBooking(booking1, day);
                                      } else {
                                        setSelectedDate(day);
                                        setCalendarView('day');
                                      }
                                    }}
                                    className={clsx(
                                      "w-full text-left text-[10px] p-1 rounded border truncate font-medium transition-all",
                                      (booking1.userId === profile?.uid || booking1.partnerId === profile?.uid)
                                        ? "bg-emerald-100 border-emerald-200 text-emerald-800 hover:bg-emerald-200" 
                                        : "bg-zinc-100 border-zinc-200 text-zinc-600"
                                    )}
                                  >
                                    Q1: {booking1.userName}
                                  </button>
                                ) : (
                                  <button 
                                    onClick={() => {
                                      if (!isPast) {
                                        handleBooking(day, startTime, 'court1', isDoubles ? 'double' : 'single');
                                      } else {
                                        setSelectedDate(day);
                                        setCalendarView('day');
                                      }
                                    }}
                                    className={clsx(
                                      "w-full text-left text-[10px] p-1 rounded border border-dashed transition-colors",
                                      isPast 
                                        ? "border-zinc-200 text-zinc-300 cursor-not-allowed" 
                                        : isFridayOpenPlay
                                          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                          : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                    )}
                                    disabled={isPast}
                                  >
                                    Q1: {isPast ? 'Passado' : (isFridayOpenPlay ? 'Duplas' : 'Livre')}
                                  </button>
                                )}
                                {booking2 ? (
                                  <button 
                                    onClick={() => {
                                      if (booking2.userId === profile?.uid || booking2.partnerId === profile?.uid || profile?.role === 'admin') {
                                        handleCancelBooking(booking2, day);
                                      } else {
                                        setSelectedDate(day);
                                        setCalendarView('day');
                                      }
                                    }}
                                    className={clsx(
                                      "w-full text-left text-[10px] p-1 rounded border truncate font-medium transition-all",
                                      (booking2.userId === profile?.uid || booking2.partnerId === profile?.uid)
                                        ? "bg-emerald-100 border-emerald-200 text-emerald-800 hover:bg-emerald-200" 
                                        : "bg-zinc-100 border-zinc-200 text-zinc-600"
                                    )}
                                  >
                                    Q2: {booking2.userName}
                                  </button>
                                ) : (
                                  <button 
                                    onClick={() => {
                                      if (!isPast) {
                                        handleBooking(day, startTime, 'court2', isDoubles ? 'double' : 'single');
                                      } else {
                                        setSelectedDate(day);
                                        setCalendarView('day');
                                      }
                                    }}
                                    className={clsx(
                                      "w-full text-left text-[10px] p-1 rounded border border-dashed transition-colors",
                                      isPast 
                                        ? "border-zinc-200 text-zinc-300 cursor-not-allowed" 
                                        : isFridayOpenPlay
                                          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                          : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                    )}
                                    disabled={isPast}
                                  >
                                    Q2: {isPast ? 'Passado' : (isFridayOpenPlay ? 'Duplas' : 'Livre')}
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-4">
                {weekDays.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const dayBookings = bookings.filter(b => b.date === dateStr && b.status === 'confirmed');
                  const dayFixed = fixedBookings.filter(b => b.dayOfWeek === day.getDay() && !b.exceptDates?.includes(dateStr));
                  const allDayBookings = [...dayBookings, ...dayFixed].sort((a, b) => a.startTime.localeCompare(b.startTime));

                  return (
                    <div key={day.toISOString()} className="bg-white rounded-2xl border border-zinc-100 overflow-hidden shadow-sm">
                      <div className="bg-zinc-50 p-4 border-b border-zinc-100 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-zinc-800">{format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
                        </div>
                        <button 
                          onClick={() => { setSelectedDate(day); setCalendarView('day'); }}
                          className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                        >
                          Ver Detalhes
                        </button>
                      </div>
                      <div className="divide-y divide-zinc-50">
                        {allDayBookings.map(booking => (
                          <div key={booking.id} className="p-4 flex items-center justify-between hover:bg-zinc-50/50 transition-colors">
                            <div className="flex items-center gap-4">
                              <span className="text-sm font-black text-zinc-900 w-12">{booking.startTime}</span>
                              <div>
                                <p className="text-sm font-bold text-zinc-800">{booking.userName}</p>
                                <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">
                                  {booking.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'} • {booking.type === 'lesson' ? 'Aula' : booking.type === 'double' ? 'Duplas' : 'Simples'}
                                </p>
                                {booking.observation && (
                                  <p className="text-[10px] text-amber-600 font-medium italic mt-0.5">
                                    Obs: {booking.observation}
                                  </p>
                                )}
                              </div>
                            </div>
                            {(booking.userId === profile?.uid || booking.partnerId === profile?.uid) && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase">Meu</span>
                            )}
                          </div>
                        ))}
                        {allDayBookings.length === 0 && (
                          <div className="p-8 text-center text-zinc-400 text-sm italic">Nenhum agendamento para este dia.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : activeTab === 'my-bookings' ? (
          <div className="space-y-6">
            <div className="bg-emerald-600 rounded-3xl p-8 text-white shadow-xl shadow-emerald-100">
              <h2 className="text-2xl font-black uppercase tracking-tight">Meus Agendamentos</h2>
              <p className="text-emerald-100 mt-1 font-medium">Gerencie seus horários marcados.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
                <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
                  <h3 className="font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                    <CalendarCheck className="w-5 h-5 text-emerald-600" />
                    Agendamentos Ativos
                  </h3>
                </div>
                <div className="divide-y divide-zinc-100">
                  {bookings.filter(b => (b.userId === profile?.uid || b.partnerId === profile?.uid) && b.status === 'confirmed').sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)).map(booking => (
                    <div key={booking.id} className="p-6 hover:bg-zinc-50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">
                            {booking.isFixed ? 'Aula Fixa' : (booking.date ? format(parseISO(booking.date), 'dd/MM/yyyy') : 'N/A')}
                          </span>
                          {booking.isLastMinute && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700 uppercase tracking-tighter">
                              ⚡ 30 Minutos
                            </span>
                          )}
                        </div>
                        <span className="text-lg font-black text-zinc-900">{booking.startTime}</span>
                      </div>
                      <p className="font-bold text-zinc-800 text-lg">
                        {booking.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}
                      </p>
                      <p className="text-sm text-zinc-500">
                        {booking.type === 'lesson' ? 'Aula' : booking.type === 'double' ? 'Duplas' : 'Simples'}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleCancelBooking(booking, booking.isFixed ? new Date() : undefined)}
                          className="flex-1 py-2 px-4 rounded-xl bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                        >
                          <Trash2 className="w-3 h-3" />
                          Cancelar
                        </button>
                        {(profile?.role === 'admin' || profile?.role === 'professor') && (
                          <button
                            onClick={() => handleEditBooking(booking)}
                            className="flex-1 py-2 px-4 rounded-xl bg-emerald-50 text-emerald-600 text-xs font-bold hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2"
                          >
                            <Edit2 className="w-3 h-3" />
                            Editar
                          </button>
                        )}
                      </div>

                      {booking.isVisitorGame && (
                        <div className="mt-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-200">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">Visitante (Não Sócio)</span>
                            <span className="text-sm font-black text-zinc-800">{booking.visitorName}</span>
                          </div>
                          
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">Status do PIX</span>
                            <span className={clsx(
                              "text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest",
                              booking.visitorPixPaid 
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            )}>
                              {booking.visitorPixPaid ? "PIX Pago ✅" : "Pendente de PIX ⏳"}
                            </span>
                          </div>

                          {!booking.visitorPixPaid && (
                            <button
                              onClick={() => handleConfirmVisitorPix(booking.id)}
                              className="w-full py-2 px-3 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-black transition-all flex items-center justify-center gap-2 shadow-md"
                            >
                              <span>Confirmar que realizei o PIX</span>
                            </button>
                          )}
                        </div>
                      )}

                      {(profile?.role === 'admin' || profile?.role === 'professor' || booking.userId === profile?.uid || booking.partnerId === profile?.uid) && booking.observation && (
                        <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 italic">
                          <span className="font-bold not-italic">Obs:</span> {booking.observation}
                        </div>
                      )}
                    </div>
                  ))}
                  {bookings.filter(b => (b.userId === profile?.uid || b.partnerId === profile?.uid) && b.status === 'confirmed').length === 0 && (
                    <div className="p-12 text-center text-zinc-500">
                      Você não possui agendamentos ativos no momento.
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
                <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
                  <h3 className="font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                    <Clock className="w-5 h-5 text-zinc-400" />
                    Histórico Recente
                  </h3>
                </div>
                <div className="divide-y divide-zinc-100">
                  {bookings.filter(b => (b.userId === profile?.uid || b.partnerId === profile?.uid) && b.status !== 'confirmed').slice(0, 5).map(booking => (
                    <div key={booking.id} className="p-6 opacity-60">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                          {booking.date ? format(parseISO(booking.date), 'dd/MM/yyyy') : 'Fixo'}
                        </span>
                        <span className={clsx(
                          "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                          booking.status === 'cancelled' ? "bg-zinc-100 text-zinc-600" : "bg-red-100 text-red-700"
                        )}>
                          {booking.status === 'cancelled' ? 'Cancelado' : 'Falta'}
                        </span>
                      </div>
                      <p className="font-bold text-zinc-800">{booking.startTime} - {booking.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}</p>
                    </div>
                  ))}
                  {bookings.filter(b => (b.userId === profile?.uid || b.partnerId === profile?.uid) && b.status !== 'confirmed').length === 0 && (
                    <div className="p-12 text-center text-zinc-500">
                      Nenhum histórico disponível.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'free-slots' ? (
          <div className="space-y-6">
            <div className="bg-emerald-600 rounded-3xl p-8 text-white shadow-xl shadow-emerald-100">
              <h2 className="text-2xl font-black uppercase tracking-tight">Horários Livres</h2>
              <p className="text-emerald-100 mt-1 font-medium">Encontre as melhores janelas para o seu jogo durante a semana.</p>
            </div>

            <div className="space-y-8">
              {freeSlotsByDay.map(({ day, slots }) => (
                <div key={day.toISOString()} className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
                  <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
                    <h3 className="font-black text-zinc-900 uppercase tracking-tight">
                      {format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </h3>
                    <button 
                      onClick={() => { setSelectedDate(day); setActiveTab('calendar'); }}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                    >
                      Ver na Agenda
                    </button>
                  </div>
                  
                  <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Manhã */}
                    <div>
                      <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Clock className="w-3 h-3" /> Manhã (07:00 - 11:59)
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {slots.filter(s => {
                          const h = parseInt(s.time.split(':')[0]);
                          return h < 12;
                        }).map(s => (
                          <div key={s.time} className="flex items-center justify-between p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                            <div className="flex flex-col">
                              <span className="font-bold text-emerald-900 text-sm">{s.time}</span>
                              <div className="flex gap-0.5 mt-0.5">
                                {s.court1Free && <span className="text-[7px] font-black bg-emerald-600 text-white px-1 rounded uppercase">Q1</span>}
                                {s.court2Free && <span className="text-[7px] font-black bg-emerald-600 text-white px-1 rounded uppercase">Q2</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => handleShareSlot(day, s.time, s.court1Free, s.court2Free)}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                              title="Notificar vaga"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {slots.filter(s => parseInt(s.time.split(':')[0]) < 12).length === 0 && (
                          <p className="text-xs text-zinc-400 italic col-span-2">Nenhum horário livre.</p>
                        )}
                      </div>
                    </div>

                    {/* Tarde */}
                    <div>
                      <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Clock className="w-3 h-3" /> Tarde (12:00 - 17:59)
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {slots.filter(s => {
                          const h = parseInt(s.time.split(':')[0]);
                          return h >= 12 && h < 18;
                        }).map(s => (
                          <div key={s.time} className="flex items-center justify-between p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                            <div className="flex flex-col">
                              <span className="font-bold text-emerald-900 text-sm">{s.time}</span>
                              <div className="flex gap-0.5 mt-0.5">
                                {s.court1Free && <span className="text-[7px] font-black bg-emerald-600 text-white px-1 rounded uppercase">Q1</span>}
                                {s.court2Free && <span className="text-[7px] font-black bg-emerald-600 text-white px-1 rounded uppercase">Q2</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => handleShareSlot(day, s.time, s.court1Free, s.court2Free)}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                              title="Notificar vaga"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {slots.filter(s => {
                          const h = parseInt(s.time.split(':')[0]);
                          return h >= 12 && h < 18;
                        }).length === 0 && (
                          <p className="text-xs text-zinc-400 italic col-span-2">Nenhum horário livre.</p>
                        )}
                      </div>
                    </div>

                    {/* Noite */}
                    <div>
                      <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Clock className="w-3 h-3" /> Noite (18:00 - 22:00)
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {slots.filter(s => {
                          const h = parseInt(s.time.split(':')[0]);
                          return h >= 18;
                        }).map(s => (
                          <div key={s.time} className="flex items-center justify-between p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                            <div className="flex flex-col">
                              <span className="font-bold text-emerald-900 text-sm">{s.time}</span>
                              <div className="flex gap-0.5 mt-0.5">
                                {s.court1Free && <span className="text-[7px] font-black bg-emerald-600 text-white px-1 rounded uppercase">Q1</span>}
                                {s.court2Free && <span className="text-[7px] font-black bg-emerald-600 text-white px-1 rounded uppercase">Q2</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => handleShareSlot(day, s.time, s.court1Free, s.court2Free)}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                              title="Notificar vaga"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {slots.filter(s => parseInt(s.time.split(':')[0]) >= 18).length === 0 && (
                          <p className="text-xs text-zinc-400 italic col-span-2">Nenhum horário livre.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'profile' ? (
          <div className="space-y-6">
            <div className="bg-emerald-600 rounded-3xl p-8 text-white shadow-xl shadow-emerald-100">
              <h2 className="text-2xl font-black uppercase tracking-tight">Meu Perfil</h2>
              <p className="text-emerald-100 mt-1 font-medium">Gerencie suas informações pessoais.</p>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden p-8">
              <div className="flex items-center gap-6 mb-8">
                <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center">
                  <UserIcon className="w-10 h-10 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-zinc-900">{profile?.fullName}</h3>
                  <p className="text-zinc-500">{profile?.email}</p>
                  <div className="mt-2 flex gap-2">
                    <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
                      {profile?.role === 'admin' ? 'Administrador' : profile?.role === 'professor' ? 'Professor' : 'Tenista'}
                    </span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-6 max-w-md">
                <div>
                  <label className="block text-xs font-black text-zinc-400 uppercase tracking-widest mb-2">Nome Completo</label>
                  <input
                    type="text"
                    value={profileForm.fullName}
                    onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                    className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="Seu nome completo"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-zinc-400 uppercase tracking-widest mb-2">Telefone (WhatsApp)</label>
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 px-6 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                >
                  Salvar Alterações
                </button>
              </form>
            </div>
          </div>
        ) : activeTab === 'rules' ? (
          <div className="max-w-2xl">
            <h2 className="text-2xl font-black uppercase tracking-tight text-zinc-900 mb-6">Regras do Clube</h2>
            <div className="space-y-3">
              <div className="flex gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                  <CalendarDays className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="font-black text-sm text-zinc-900 uppercase tracking-tight mb-0.5">Abertura da Agenda</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">Todo domingo às 12:00 liberamos a agenda da semana seguinte.</p>
                </div>
              </div>
              <div className="flex gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                  <Trophy className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="font-black text-sm text-zinc-900 uppercase tracking-tight mb-0.5">Créditos</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">Todos começam com 3 créditos. Cada reserva consome 1 crédito de cada jogador. Administradores são isentos.</p>
                </div>
              </div>
              <div className="flex gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="font-black text-sm text-zinc-900 uppercase tracking-tight mb-0.5">Parceiro Obrigatório</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">É obrigatório ter um parceiro cadastrado para reservar. Um crédito também será consumido do parceiro.</p>
                </div>
              </div>
              <div className="flex gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="font-black text-sm text-zinc-900 uppercase tracking-tight mb-0.5">Cancelamento</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">Cancelamento sem perda de crédito até 12 horas antes. Após esse prazo, o crédito não é devolvido.</p>
                </div>
              </div>
              <div className="flex gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <p className="font-black text-sm text-zinc-900 uppercase tracking-tight mb-0.5">No-Show (Falta)</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">Falta consome 2 créditos e gera bloqueio de 48h. 3 faltas resultam em suspensão da conta.</p>
                </div>
              </div>
              <div className="flex gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                <div className="w-9 h-9 bg-zinc-50 rounded-xl flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4 text-zinc-600" />
                </div>
                <div>
                  <p className="font-black text-sm text-zinc-900 uppercase tracking-tight mb-0.5">Denúncia Anônima</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">Se ver uma quadra reservada mas vazia, denuncie pelo app. O infrator perde créditos e é bloqueado.</p>
                </div>
              </div>
              <div className="flex gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                <div className="w-9 h-9 bg-zinc-50 rounded-xl flex items-center justify-center shrink-0">
                  <Wrench className="w-4 h-4 text-zinc-600" />
                </div>
                <div>
                  <p className="font-black text-sm text-zinc-900 uppercase tracking-tight mb-0.5">Manutenção do Saibro</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">É obrigatório nivelar o saibro após o jogo e confirmar no app.</p>
                </div>
              </div>
              <div className="flex gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                  <LayoutGrid className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="font-black text-sm text-zinc-900 uppercase tracking-tight mb-0.5">Regra dos 30 Minutos</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">Se a quadra estiver livre faltando menos de 30 min para o horário, qualquer sócio pode agendar sem precisar de créditos.</p>
                </div>
              </div>
              <div className="flex gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="font-black text-sm text-zinc-900 uppercase tracking-tight mb-0.5">Sextas — Open Play (17h–19:30)</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">Duplas Abertas toda sexta-feira das 17h às 19:30. Só chegar e jogar! 🎾</p>
                </div>
              </div>
              <div className="flex gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="font-black text-sm text-zinc-900 uppercase tracking-tight mb-0.5">Professores</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">Sem custo de crédito e agendamento livre na Quadra 2.</p>
                </div>
              </div>
              <div className="flex gap-4 p-4 bg-white rounded-2xl border border-zinc-100 shadow-sm">
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                  <Trophy className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="font-black text-sm text-zinc-900 uppercase tracking-tight mb-0.5">Campeonatos</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">Qualquer sócio pode organizar torneios. Solicite liberação de acesso ao administrador.</p>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'maintenance-report' ? (
          <div className="space-y-6">
            <div className="bg-emerald-600 rounded-3xl p-8 text-white shadow-xl shadow-emerald-100">
              <h2 className="text-2xl font-black uppercase tracking-tight">Reportar Problema</h2>
              <p className="text-emerald-100 mt-1 font-medium">Ajude-nos a manter o clube impecável!</p>
            </div>

            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 p-8">
                <div className="flex gap-4 items-start mb-6 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <Shield className="w-6 h-6 text-amber-600 shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-bold">Privacidade Garantida</p>
                    <p>Sua mensagem será enviada de forma **totalmente anônima**. O administrador não saberá quem enviou este alerta.</p>
                  </div>
                </div>

                <form onSubmit={handleSendMaintenanceReport} className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Descreva o problema</label>
                    <textarea
                      value={maintenanceReportMessage}
                      onChange={(e) => setMaintenanceReportMessage(e.target.value)}
                      placeholder="Ex: Lâmpada da Quadra 1 queimada, banheiro sem papel, bomba d'água fazendo barulho..."
                      className="w-full h-40 p-4 rounded-xl border-zinc-200 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                      required
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingReport || !maintenanceReportMessage.trim()}
                    className={clsx(
                      "w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2",
                      isSubmittingReport || !maintenanceReportMessage.trim()
                        ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                        : "bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-emerald-200"
                    )}
                  >
                    {isSubmittingReport ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <Bell className="w-5 h-5" />
                    )}
                    Enviar Notificação Anônima
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : activeTab === 'ranking' ? (
          profile?.role === 'admin' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm h-fit">
                <h2 className="text-xl font-bold text-zinc-800 mb-6 flex items-center gap-2">
                  🏆 Top 10 Tenistas
                </h2>
                <div className="space-y-4">
                  {ranking.map((item, index) => (
                    <div key={index} className={clsx(
                      "flex items-center justify-between p-4 rounded-xl border",
                      index === 0 ? "bg-emerald-50 border-emerald-200" : "bg-zinc-50 border-zinc-100"
                    )}>
                      <div className="flex items-center gap-3">
                        <span className={clsx(
                          "w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px]",
                          index === 0 ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-600"
                        )}>
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-bold text-zinc-900 text-sm">{item.name}</p>
                          <p className="text-[10px] text-zinc-500">{item.hours.toFixed(1)}h</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-emerald-700">{item.count}</p>
                        <p className="text-[8px] uppercase font-bold text-zinc-400">Jogos</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl border border-zinc-100 p-6 shadow-sm">
                  <h2 className="text-xl font-bold text-zinc-800 mb-6 flex items-center gap-2">
                    🎓 Aulas de Professores (Hoje)
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[...fixedBookings, ...bookings].filter(b => {
                      const todayStr = format(new Date(), 'yyyy-MM-dd');
                      if (b.status !== 'confirmed') return false;
                      if (b.isFixed) {
                        return b.dayOfWeek === getDay(new Date()) && !b.exceptDates?.includes(todayStr);
                      }
                      return b.date === todayStr;
                    }).sort((a, b) => a.startTime.localeCompare(b.startTime)).map(booking => (
                      <div key={booking.id} className="p-4 rounded-2xl border border-zinc-100 bg-zinc-50/50">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{booking.startTime}</span>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">{booking.courtId === 'court1' ? 'Q1' : 'Q2'}</span>
                        </div>
                        <p className="font-bold text-zinc-800">{booking.userName.replace(' (Aula)', '')}</p>
                        <p className="text-[10px] text-zinc-500 mt-1">Prof: {booking.professorName || 'Não informado'}</p>
                      </div>
                    ))}
                    {[...fixedBookings, ...bookings].filter(b => {
                      const todayStr = format(new Date(), 'yyyy-MM-dd');
                      if (b.status !== 'confirmed') return false;
                      if (b.isFixed) {
                        return b.dayOfWeek === getDay(new Date()) && !b.exceptDates?.includes(todayStr);
                      }
                      return b.date === todayStr;
                    }).length === 0 && (
                      <p className="col-span-full text-center text-zinc-500 py-8 italic">Nenhuma aula hoje.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-zinc-500">Apenas administradores podem ver o ranking.</div>
          )
        ) : activeTab === 'admin-professors' ? (
          <div className="space-y-6">
            <div className="bg-emerald-600 rounded-3xl p-8 text-white shadow-xl shadow-emerald-100 relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black uppercase tracking-tight">Gestão de Professores</h2>
                <p className="text-emerald-100 mt-1 font-medium">Visualize e gerencie a agenda de todos os professores.</p>
              </div>
              <GraduationCap className="absolute -right-4 -bottom-4 w-32 h-32 text-white/10 rotate-12" />
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="bg-red-50 border border-red-200 rounded-3xl p-6 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                  <h3 className="text-red-800 font-black uppercase tracking-tight">Zona de Perigo (Testes)</h3>
                  <p className="text-red-600 text-sm">Remova todos os agendamentos do sistema para reiniciar os testes.</p>
                </div>
                <button 
                  onClick={clearAllBookings}
                  className="px-6 py-3 bg-red-600 text-white font-black rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-100 active:scale-95 uppercase text-xs tracking-widest"
                >
                  Limpar Todos os Agendamentos
                </button>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                  <h3 className="text-emerald-800 font-black uppercase tracking-tight">Manutenção de Créditos</h3>
                  <p className="text-emerald-600 text-sm">Force a renovação semanal de créditos de todos os usuários (Domingo 12h).</p>
                </div>
                <button 
                  onClick={manualResetCredits}
                  className="px-6 py-3 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 uppercase text-xs tracking-widest"
                >
                  Renovar Créditos Agora
                </button>
              </div>

              {professors.map(prof => (
                <div key={prof.uid} className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
                  <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-black text-zinc-900 uppercase tracking-tight">{prof.fullName}</h3>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{prof.phone || 'Sem telefone'}</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-center">
                        <p className="text-lg font-black text-zinc-900">
                          {fixedBookings.filter(b => b.userId === prof.uid || b.professorName === prof.fullName).length}
                        </p>
                        <p className="text-[10px] uppercase font-bold text-zinc-400">Fixas</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-black text-zinc-900">
                          {bookings.filter(b => (b.userId === prof.uid || b.professorName === prof.fullName) && !b.isFixed && b.status === 'confirmed').length}
                        </p>
                        <p className="text-[10px] uppercase font-bold text-zinc-400">Avulsas</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6">
                    <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Agenda de Aulas</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[...fixedBookings.filter(b => b.userId === prof.uid || b.professorName === prof.fullName), ...bookings.filter(b => (b.userId === prof.uid || b.professorName === prof.fullName) && !b.isFixed && b.status === 'confirmed')]
                        .sort((a, b) => {
                          if (a.isFixed && !b.isFixed) return -1;
                          if (!a.isFixed && b.isFixed) return 1;
                          if (a.isFixed && b.isFixed) return (a.dayOfWeek || 0) - (b.dayOfWeek || 0) || a.startTime.localeCompare(b.startTime);
                          return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
                        })
                        .map(booking => (
                          <div key={booking.id} className="p-4 rounded-2xl border border-zinc-100 bg-zinc-50/30 hover:bg-zinc-50 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <span className={clsx(
                                "px-2 py-0.5 text-[10px] font-black rounded-full uppercase tracking-wider",
                                booking.isFixed ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                              )}>
                                {booking.isFixed ? 'Fixa' : 'Avulsa'}
                              </span>
                              <span className="text-xs font-black text-zinc-900">{booking.startTime}</span>
                            </div>
                            <p className="font-bold text-zinc-800 text-sm truncate">{booking.userName.replace(' (Aula)', '')}</p>
                            <p className="text-[10px] text-zinc-500 mt-1">
                              {booking.isFixed 
                                ? format(addDays(new Date(2024, 0, 7), booking.dayOfWeek || 0), 'EEEE', { locale: ptBR })
                                : (booking.date ? format(parseISO(booking.date), 'dd/MM (EEE)', { locale: ptBR }) : 'Pendente')}
                              {' • '}{booking.courtId === 'court1' ? 'Q1' : 'Q2'}
                            </p>
                            {booking.observation && (
                              <p className="text-[9px] text-amber-600 font-medium italic mt-1 truncate">
                                Obs: {booking.observation}
                              </p>
                            )}
                            {(profile?.role === 'admin' || profile?.role === 'professor') && (
                              <div className="flex gap-2 mt-3">
                                <button 
                                  onClick={() => handleEditBooking(booking)}
                                  className="flex-1 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-[10px] font-bold text-zinc-600 transition-colors flex items-center justify-center gap-1.5"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  Editar
                                </button>
                                <button 
                                  onClick={() => handleCancelBooking(booking, booking.isFixed ? new Date() : undefined)}
                                  className="flex-1 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-[10px] font-bold text-red-600 transition-colors flex items-center justify-center gap-1.5"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Cancelar
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      {[...fixedBookings.filter(b => b.userId === prof.uid || b.professorName === prof.fullName), ...bookings.filter(b => (b.userId === prof.uid || b.professorName === prof.fullName) && !b.isFixed && b.status === 'confirmed')].length === 0 && (
                        <div className="col-span-full py-8 text-center text-zinc-400 text-sm italic">
                          Nenhuma aula agendada para este professor.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'professor' ? (
          <div className="space-y-6">
            <div className="bg-emerald-600 rounded-3xl p-8 text-white shadow-xl shadow-emerald-100 relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black uppercase tracking-tight">Painel do Professor</h2>
                <p className="text-emerald-100 mt-1 font-medium">Gerencie suas aulas e alunos na Quadra 2.</p>
              </div>
              <GraduationCap className="absolute -right-4 -bottom-4 w-32 h-32 text-white/10 rotate-12" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Aulas Fixas</span>
                <span className="text-2xl font-black text-zinc-900">
                  {fixedBookings.filter(b => b.userId === profile?.uid || b.professorName === profile?.fullName).length}
                </span>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Aulas Avulsas</span>
                <span className="text-2xl font-black text-zinc-900">
                  {bookings.filter(b => (b.userId === profile?.uid || b.professorName === profile?.fullName) && !b.isFixed && b.status === 'confirmed').length}
                </span>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Total Horas</span>
                <span className="text-2xl font-black text-zinc-900">
                  {([...fixedBookings, ...bookings].filter(b => (b.userId === profile?.uid || b.professorName === profile?.fullName) && b.status === 'confirmed').length * 1).toFixed(0)}h
                </span>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Quadra Padrão</span>
                <span className="text-base font-black text-emerald-600">Quadra 2</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
                <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
                  <h3 className="font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                    <Clock className="w-5 h-5 text-emerald-600" />
                    Minhas Aulas Fixas
                  </h3>
                  <button 
                    onClick={() => { setSelectedDate(new Date()); setActiveTab('calendar'); }}
                    className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest hover:underline"
                  >
                    + Nova Aula
                  </button>
                </div>
                <div className="divide-y divide-zinc-100 max-h-[500px] overflow-y-auto">
                  {fixedBookings.filter(b => b.userId === profile?.uid || b.professorName === profile?.fullName).sort((a, b) => {
                    const dayDiff = (a.dayOfWeek || 0) - (b.dayOfWeek || 0);
                    if (dayDiff !== 0) return dayDiff;
                    return a.startTime.localeCompare(b.startTime);
                  }).map(booking => (
                    <div key={booking.id} className="p-6 hover:bg-zinc-50 transition-colors group">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                            {format(addDays(new Date(2024, 0, 7), booking.dayOfWeek || 0), 'EEEE', { locale: ptBR })}
                          </span>
                          <span className="text-sm font-black text-zinc-900">{booking.startTime}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingBooking(booking);
                              setOpponentName(booking.opponentName || '');
                              if (booking.date) {
                                setSelectedDate(parseISO(booking.date));
                              } else if (booking.dayOfWeek !== undefined) {
                                const today = new Date();
                                const currentDay = today.getDay();
                                const diff = (booking.dayOfWeek - currentDay + 7) % 7;
                                setSelectedDate(addDays(today, diff));
                              }
                              setActiveTab('calendar');
                            }}
                            className="p-2 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
                            title="Trocar Horário"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleCancelBooking(booking, new Date())}
                            className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            title="Excluir Aula"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <p className="font-bold text-zinc-800 text-lg">{booking.userName.replace(' (Aula)', '')}</p>
                      {booking.observation && (
                        <p className="text-xs text-amber-600 font-medium italic mt-1">
                          Obs: {booking.observation}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                        <LayoutGrid className="w-3 h-3" />
                        {booking.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}
                      </div>
                    </div>
                  ))}
                  {fixedBookings.filter(b => b.userId === profile?.uid || b.professorName === profile?.fullName).length === 0 && (
                    <div className="p-12 text-center text-zinc-500">
                      <GraduationCap className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                      <p className="font-medium">Você ainda não possui aulas fixas cadastradas.</p>
                      <p className="text-xs mt-1">Agende um horário como "Fixo" no calendário.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
                <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
                  <h3 className="font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-600" />
                    Aulas Avulsas (Esta Semana)
                  </h3>
                </div>
                <div className="divide-y divide-zinc-100 max-h-[500px] overflow-y-auto">
                  {bookings.filter(b => (b.userId === profile?.uid || b.professorName === profile?.fullName) && !b.isFixed && b.status === 'confirmed').sort((a, b) => {
                    const dateDiff = a.date.localeCompare(b.date);
                    if (dateDiff !== 0) return dateDiff;
                    return a.startTime.localeCompare(b.startTime);
                  }).map(booking => (
                    <div key={booking.id} className="p-6 hover:bg-zinc-50 transition-colors group">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-[10px] font-black rounded-full uppercase tracking-wider">
                            {booking.date ? format(parseISO(booking.date), 'dd/MM (EEE)', { locale: ptBR }) : 'Desconhecido'}
                          </span>
                          <span className="text-sm font-black text-zinc-900">{booking.startTime}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingBooking(booking);
                              setOpponentName(booking.opponentName || '');
                              setSelectedDate(parseISO(booking.date));
                              setActiveTab('calendar');
                            }}
                            className="p-2 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleCancelBooking(booking, new Date(booking.date + 'T00:00:00'))}
                            className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <p className="font-bold text-zinc-800 text-lg">{booking.userName.replace(' (Aula)', '')}</p>
                      {booking.observation && (
                        <p className="text-xs text-amber-600 font-medium italic mt-1">
                          Obs: {booking.observation}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                        <LayoutGrid className="w-3 h-3" />
                        {booking.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}
                      </div>
                    </div>
                  ))}
                  {bookings.filter(b => (b.userId === profile?.uid || b.professorName === profile?.fullName) && !b.isFixed && b.status === 'confirmed').length === 0 && (
                    <div className="p-12 text-center text-zinc-500">
                      <CalendarDays className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                      <p className="font-medium">Nenhuma aula avulsa agendada para esta semana.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'championships' ? (
          <div className="space-y-6">
            {(profile?.role === 'admin' || profile?.canManageChampionships) && (
              <button 
                onClick={() => navigate('/admin')} 
                className="flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-lg active:scale-95"
              >
                <Trophy className="w-5 h-5 text-amber-500" />
                Gerenciar Campeonatos
              </button>
            )}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100">
              <h2 className="text-2xl font-black text-zinc-900 mb-2 flex items-center gap-3">
                <Trophy className="w-8 h-8 text-amber-500" />
                Campeonatos Internos
              </h2>
              <p className="text-zinc-500 text-sm">Participe dos nossos torneios e suba no ranking!</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {championships.map(champ => {
                const myReg = myRegistrations.find(r => r.championshipId === champ.id);
                const isRegistrationOpen = isAfter(new Date(), parseISO(champ.registrationStartDate)) && isBefore(new Date(), parseISO(champ.registrationDeadline));
                const isDeadlinePast = isAfter(new Date(), parseISO(champ.registrationDeadline));
                const isNotStarted = isBefore(new Date(), parseISO(champ.registrationStartDate));
                const hasBracket = championshipMatches.some(m => m.championshipId === champ.id);

                return (
                  <div key={champ.id} className="bg-white rounded-3xl shadow-sm border border-zinc-100 overflow-hidden flex flex-col">
                    {/* Card header strip */}
                    <div className="bg-zinc-900 px-5 pt-5 pb-4 relative overflow-hidden">
                      <div className="absolute right-4 top-3 opacity-10">
                        <Trophy className="w-16 h-16 text-white" />
                      </div>
                      <div className="flex items-start justify-between gap-2 relative z-10">
                        <div>
                          <span className={clsx(
                            "inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest mb-2",
                            isRegistrationOpen ? "bg-emerald-500 text-white" :
                            isNotStarted ? "bg-blue-500 text-white" : "bg-zinc-600 text-zinc-300"
                          )}>
                            {isRegistrationOpen ? 'Inscrições Abertas' :
                             isNotStarted ? 'Em Breve' : 'Encerrado'}
                          </span>
                          <h3 className="text-base font-black text-white leading-tight">{champ.title}</h3>
                        </div>
                        <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest shrink-0 mt-1">
                          {champ.type === 'singles' ? 'Simples' : champ.isDrawnPairs ? 'Duplas Sorteadas' : 'Duplas'}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 flex-grow flex flex-col gap-4">
                      {champ.description && (
                        <p className="text-sm text-zinc-500 leading-relaxed">{champ.description}</p>
                      )}

                      {/* Dates row */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-100">
                          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-0.5">Início</span>
                          <span className="text-sm font-bold text-zinc-700">{format(parseISO(champ.startDate), 'dd/MM/yyyy')}</span>
                        </div>
                        <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-100">
                          <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-0.5">Fim</span>
                          <span className="text-sm font-bold text-zinc-700">{format(parseISO(champ.endDate), 'dd/MM/yyyy')}</span>
                        </div>
                      </div>

                      {/* Fee + deadlines */}
                      <div className="flex items-center justify-between bg-emerald-50 px-4 py-3 rounded-2xl border border-emerald-100">
                        <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">Inscrição</span>
                        <span className="text-base font-black text-emerald-700">
                          {champ.registrationFee && champ.registrationFee > 0
                            ? `R$ ${champ.registrationFee.toFixed(2)}`
                            : 'Grátis'}
                        </span>
                      </div>

                      <div className="text-xs font-bold text-zinc-400 space-y-1">
                        <div className="flex items-center gap-1.5 text-blue-500">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          Abertura: {format(parseISO(champ.registrationStartDate), "dd/MM 'às' HH:mm")}
                        </div>
                        <div className="flex items-center gap-1.5 text-amber-500">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          Prazo: {format(parseISO(champ.registrationDeadline), "dd/MM 'às' HH:mm")}
                        </div>
                      </div>

                      {/* Ver chaves button — shown inline when bracket exists */}
                      {hasBracket && (
                        <button
                          onClick={() => setViewingBracket(champ.id)}
                          className="w-full py-2.5 rounded-2xl text-sm font-black text-zinc-900 transition-all active:scale-95 flex items-center justify-center gap-2"
                          style={{ background: '#fbbf24' }}
                        >
                          <Trophy className="w-4 h-4" />
                          Ver Chaves
                        </button>
                      )}
                    </div>

                    <div className="px-5 pb-5 flex flex-col gap-3">
                      {myReg ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm bg-emerald-100/50 p-3 rounded-2xl border border-emerald-200">
                            <Check className="w-5 h-5" />
                            Você está inscrito!
                          </div>
                          
                          {champ.registrationFee && champ.registrationFee > 0 && (
                            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Status Pagamento</span>
                                <span className={clsx(
                                  "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                                  myReg.paymentStatus === 'paid' ? "bg-emerald-100 text-emerald-700" : 
                                  myReg.paymentStatus === 'informed' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                                )}>
                                  {myReg.paymentStatus === 'paid' ? 'Confirmado' : 
                                   myReg.paymentStatus === 'informed' ? 'Aguardando Validação' : 'Pendente'}
                                </span>
                              </div>
                              
                              {myReg.paymentStatus === 'pending' && champ.pixKey && (
                                <div className="pt-2 border-t border-zinc-100">
                                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Chave PIX para Pagamento</p>
                                  <div className="flex items-center justify-between bg-zinc-50 p-2 rounded-xl border border-zinc-100">
                                    <code className="text-xs font-bold text-zinc-700">{champ.pixKey}</code>
                                    <button 
                                      onClick={() => {
                                        navigator.clipboard.writeText(champ.pixKey || '');
                                        showAlert("Sucesso", "Chave PIX copiada!", "success");
                                      }}
                                      className="text-[10px] font-black text-emerald-600 uppercase"
                                    >
                                      Copiar
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => handleInformPayment(myReg.id)}
                                    className="w-full mt-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm"
                                  >
                                    Já paguei! Informar Admin
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          <button
                            onClick={() => handleCancelRegistration(myReg.id)}
                            className="w-full py-2 text-xs font-bold text-red-600 hover:text-red-700 transition-colors"
                          >
                            Cancelar Inscrição
                          </button>
                        </div>
                      ) : (
                        <button
                          disabled={champ.status !== 'open' || !isRegistrationOpen}
                          onClick={() => setIsRegistering(champ)}
                          className={clsx(
                            "w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg",
                            champ.status === 'open' && isRegistrationOpen
                              ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-100"
                              : "bg-zinc-200 text-zinc-400 cursor-not-allowed shadow-none"
                          )}
                        >
                          {isNotStarted ? 'Aguarde o Início' : isDeadlinePast ? 'Prazo Encerrado' : champ.status === 'open' ? 'Inscrever-se Agora' : 'Inscrições Fechadas'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {championships.length === 0 && (
                <div className="col-span-full py-20 text-center bg-white rounded-[40px] border-2 border-dashed border-zinc-200">
                  <Trophy className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
                  <h3 className="text-xl font-black text-zinc-400">Nenhum campeonato ativo</h3>
                  <p className="text-zinc-400 text-sm mt-1">Fique de olho nas novidades!</p>
                </div>
              )}
            </div>
          </div>
        ) : null}

      </main>

      {isRegistering && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md p-8 border border-zinc-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-zinc-900">Inscrição</h3>
              <button onClick={() => setIsRegistering(null)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-zinc-500 mb-1">Campeonato</p>
              <p className="text-lg font-bold text-zinc-900">{isRegistering.title}</p>
              <p className="text-xs text-zinc-400 mt-1 uppercase tracking-widest font-bold">
                Modalidade: {isRegistering.type === 'singles' ? 'Simples' : 'Duplas'}
              </p>
            </div>

            {isRegistering.type === 'doubles' && !isRegistering.isDrawnPairs && (
              <div className="mb-8">
                <label className="block text-sm font-black text-zinc-700 uppercase tracking-widest mb-3">Selecione seu Parceiro</label>
                <div className="relative">
                  <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                  <select
                    value={partnerId}
                    onChange={e => setPartnerId(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-emerald-500 focus:ring-0 transition-all text-sm font-bold text-zinc-700 appearance-none"
                  >
                    <option value="">Escolha um sócio...</option>
                    {users.filter(u => u.uid !== profile?.uid).map(u => (
                      <option key={u.uid} value={u.uid}>{u.fullName}</option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-zinc-400 mt-2 italic">
                  * Apenas sócios cadastrados aparecem na lista.
                </p>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={() => setIsRegistering(null)}
                className="flex-1 py-4 px-6 border-2 border-zinc-100 rounded-2xl text-sm font-bold text-zinc-500 hover:bg-zinc-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleRegisterChampionship(isRegistering)}
                className="flex-1 py-4 px-6 bg-emerald-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
        onCancel={modal.onCancel}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
        children={modal.children}
        confirmDisabled={modal.confirmDisabled}
      />

      {viewingBracket && (() => {
        const champ = championships.find(c => c.id === viewingBracket);
        const champRegs = allRegistrations.filter(r => r.championshipId === viewingBracket);
        const totalRounds = Math.max(1, Math.ceil(Math.log2(Math.max(champRegs.length, 2))));

        const getRoundLabel = (round: number) => {
          if (round === totalRounds) return 'Final';
          if (round === totalRounds - 1 && totalRounds > 2) return 'Semi-Final';
          if (round === 1) return '1ª Rodada';
          return `${round}ª Rodada`;
        };

        return (
          <div className="fixed inset-0 z-[120] flex flex-col" style={{ background: '#080e0b' }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
              <button
                onClick={() => setViewingBracket(null)}
                className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0 transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.1)' }}
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Chaves do Torneio</p>
                <h3 className="text-sm font-black text-white truncate">{champ?.title}</h3>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {champRegs.length} jogadores
              </span>
            </div>

            {/* Bracket */}
            <div
              className="flex-1"
              style={{ overflow: 'auto', WebkitOverflowScrolling: 'touch' as any, padding: '20px 16px 32px' }}
            >
              <div style={{ display: 'flex', gap: 12, width: 'max-content', minHeight: '100%', alignItems: 'stretch' }}>
                {Array.from({ length: totalRounds }).map((_, roundIdx) => {
                  const round = roundIdx + 1;
                  const isFinal = round === totalRounds;
                  const matchesInRound = championshipMatches
                    .filter(m => m.championshipId === viewingBracket && m.round === round)
                    .sort((a, b) => a.matchNumber - b.matchNumber);

                  return (
                    <div key={round} style={{ width: 188, display: 'flex', flexDirection: 'column' }}>
                      {/* Round label */}
                      <div className="text-center mb-3">
                        <span
                          className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
                          style={isFinal
                            ? { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
                            : { color: 'rgba(255,255,255,0.28)' }}
                        >
                          {getRoundLabel(round)}
                        </span>
                      </div>

                      {/* Matches */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: 10 }}>
                        {matchesInRound.length > 0 ? matchesInRound.map(match => {
                          const p1Wins = !!(match.winnerId && match.winnerId === match.participant1Id);
                          const p2Wins = !!(match.winnerId && match.winnerId === match.participant2Id);
                          const done = match.status === 'finished';

                          return (
                            <div
                              key={match.id}
                              className="rounded-2xl overflow-hidden"
                              style={{ background: '#141f1a', border: '1px solid rgba(255,255,255,0.07)' }}
                            >
                              {/* Match label */}
                              <div
                                className="px-3 py-1.5 flex items-center justify-between"
                                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                              >
                                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
                                  Jogo {match.matchNumber + 1}
                                </span>
                                {done && (
                                  <span className="text-[9px] font-black uppercase" style={{ color: '#34d399' }}>✓ Fim</span>
                                )}
                              </div>

                              {/* Player rows */}
                              {[
                                { name: match.participant1Name, score: match.score1, wins: p1Wins },
                                { name: match.participant2Name, score: match.score2, wins: p2Wins },
                              ].map((p, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 px-2 py-2 mx-1 my-1 rounded-xl"
                                  style={{ background: p.wins ? 'rgba(52,211,153,0.1)' : 'transparent' }}
                                >
                                  <span
                                    className="text-xs font-bold flex-1 truncate"
                                    style={{ color: p.wins ? '#34d399' : p.name ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.2)', fontStyle: p.name ? 'normal' : 'italic' }}
                                  >
                                    {p.name || 'Aguardando...'}
                                  </span>
                                  <span
                                    className="text-sm font-black w-7 text-center"
                                    style={{ color: p.wins ? '#34d399' : 'rgba(255,255,255,0.35)' }}
                                  >
                                    {p.score || '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        }) : (
                          <div className="rounded-2xl p-4 text-center" style={{ background: '#141f1a', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <p className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.18)' }}>Aguardando</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom hint */}
            <div className="text-center pb-4 shrink-0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
              <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.15)' }}>← Deslize para ver todas as rodadas →</p>
            </div>
          </div>
        );
      })()}

      {/* Animated Booking Confirmation Overlay */}
      <AnimatePresence>
        {pendingBooking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.8, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.8, y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="bg-emerald-600 p-4 text-center text-white shrink-0">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2"
                >
                  {editingBooking ? (
                    <Edit2 className="w-6 h-6 text-white" />
                  ) : (
                    <CalendarCheck className="w-6 h-6 text-white" />
                  )}
                </motion.div>
                <h3 className="text-lg font-black uppercase tracking-tight">
                  {editingBooking ? 'Confirmar Reagendamento?' : 'Confirmar Agendamento?'}
                </h3>
                <p className="text-emerald-100 mt-0.5 font-medium text-xs">
                  {editingBooking ? 'A aula será movida para este novo horário' : 'Verifique os detalhes abaixo'}
                </p>
              </div>

              <div className="p-5 space-y-5 overflow-y-auto flex-1">
                {(profile?.role === 'admin' || profile?.role === 'professor') && !editingBooking && (
                  <div className="bg-amber-50 p-5 rounded-3xl border border-amber-100">
                    <label className="text-[10px] font-bold text-amber-600 uppercase tracking-widest block mb-2">
                      {profile.role === 'professor' ? 'Agendar para Aluno (Opcional)' : 'Agendar para outro Usuário (Opcional)'}
                    </label>
                    <select
                      value={bookingForUserId || ''}
                      onChange={(e) => setBookingForUserId(e.target.value || null)}
                      className="w-full bg-white border-2 border-amber-100 rounded-2xl px-4 py-3 text-zinc-800 font-bold focus:border-amber-500 focus:ring-0 transition-colors"
                    >
                      <option value="">Eu mesmo ({profile.fullName})</option>
                      {users.filter(u => u.uid !== profile.uid).sort((a, b) => a.fullName.localeCompare(b.fullName)).map(u => (
                        <option key={u.uid} value={u.uid}>{u.fullName}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-amber-500 mt-2 italic">O agendamento será registrado no nome deste usuário.</p>
                  </div>
                )}

                {(profile?.role === 'admin' || profile?.role === 'professor') && (
                  <div className="bg-zinc-50 p-5 rounded-3xl border border-zinc-100">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Professor Responsável</label>
                    <select
                      value={selectedProfessorName}
                      onChange={(e) => setSelectedProfessorName(e.target.value)}
                      disabled={profile.role === 'professor' && profile.role !== 'admin'}
                      className="w-full bg-white border-2 border-zinc-100 rounded-2xl px-4 py-3 text-zinc-800 font-bold focus:border-emerald-500 focus:ring-0 transition-colors disabled:opacity-75 disabled:bg-zinc-100"
                    >
                      {professors.map(p => (
                        <option key={p.uid} value={p.fullName}>{p.fullName}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Dia da Semana</span>
                    <span className="text-base font-bold text-zinc-800 capitalize">
                      {pendingBooking?.date && format(pendingBooking.date, 'EEEE', { locale: ptBR })}
                    </span>
                  </div>
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Data</span>
                    <span className="text-base font-bold text-zinc-800">
                      {pendingBooking?.date && format(pendingBooking.date, 'dd/MM/yyyy')}
                    </span>
                  </div>
                </div>

                <div className="bg-zinc-50 p-5 rounded-3xl border border-zinc-100">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">
                    {profile?.role === 'professor' ? 'Nome do Aluno' : 'Com quem você vai jogar?'}
                  </label>
                  
                  {profile?.role === 'admin' || profile?.role === 'professor' ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        list="users-list"
                        value={opponentName}
                        onChange={(e) => setOpponentName(e.target.value)}
                        placeholder="Digite o nome do aluno/oponente"
                        className="w-full bg-white border-2 border-zinc-100 rounded-2xl px-4 py-3 text-zinc-800 font-bold focus:border-emerald-500 focus:ring-0 transition-colors"
                      />
                      <datalist id="users-list">
                        {users.filter(u => u.role !== 'admin').map(u => (
                          <option key={u.uid} value={u.fullName} />
                        ))}
                      </datalist>
                    </div>
                  ) : (
                    <>
                      <select
                        value={
                          partnerId === 'Visitante' || opponentName.startsWith('Visitante:')
                            ? 'Visitante'
                            : partnerId || (users.some(u => u.fullName === opponentName) ? users.find(u => u.fullName === opponentName)?.uid : (opponentName === '' ? '' : 'Outro'))
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'Visitante') {
                            setPartnerId('Visitante');
                            setOpponentName('Visitante: ');
                          } else if (val === 'Outro') {
                            setPartnerId('');
                            setOpponentName('Outro: ');
                          } else if (val === '') {
                            setPartnerId('');
                            setOpponentName('');
                          } else {
                            const u = users.find(user => user.uid === val);
                            if (u) {
                              setPartnerId(u.uid);
                              setOpponentName(u.fullName);
                            }
                          }
                        }}
                        className="w-full bg-white border-2 border-zinc-100 rounded-2xl px-4 py-3 text-zinc-800 font-bold focus:border-emerald-500 focus:ring-0 transition-colors mb-3"
                      >
                        <option value="">Selecione um jogador</option>
                        <option value="Visitante">⚽ Jogar com um Visitante (Não Sócio)</option>
                        {users.filter(u => u.uid !== profile?.uid && u.role !== 'admin').sort((a, b) => a.fullName.localeCompare(b.fullName)).map(u => (
                          <option key={u.uid} value={u.uid}>{u.fullName}</option>
                        ))}
                        {!globalSettings?.requireRegisteredPartner && (
                          <option value="Outro">Outro (Convidado/Não Cadastrado)</option>
                        )}
                      </select>

                      {opponentName.startsWith('Visitante: ') && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-2 mb-3"
                        >
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Nome do Visitante</label>
                          <input
                            type="text"
                            value={opponentName.replace('Visitante: ', '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              setOpponentName('Visitante: ' + val);
                            }}
                            placeholder="Digite o nome do visitante completo"
                            className="w-full bg-white border-2 border-emerald-100 rounded-2xl px-4 py-3 text-zinc-800 font-bold focus:border-emerald-500 focus:ring-0 transition-colors"
                            required
                          />
                        </motion.div>
                      )}

                      {opponentName.startsWith('Outro: ') && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-2"
                        >
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Nome do Oponente</label>
                          <input
                            type="text"
                            value={opponentName.replace('Outro: ', '')}
                            onChange={(e) => setOpponentName('Outro: ' + e.target.value)}
                            placeholder="Digite o nome completo"
                            className="w-full bg-white border-2 border-emerald-100 rounded-2xl px-4 py-3 text-zinc-800 font-bold focus:border-emerald-500 focus:ring-0 transition-colors"
                            required
                          />
                        </motion.div>
                      )}
                    </>
                  )}
                  
                  <label className="flex items-center gap-3 mt-4 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isRanking}
                      onChange={(e) => setIsRanking(e.target.checked)}
                      className="w-5 h-5 text-emerald-600 rounded border-zinc-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-bold text-zinc-700">Jogo de Ranking 🏆</span>
                  </label>
                </div>

                <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Horário e Quadra</span>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      <span className="text-xl font-black text-zinc-900">{pendingBooking?.startTime}</span>
                    </div>
                    <p className="text-[10px] font-bold text-emerald-700 mt-0.5">
                      {pendingBooking?.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Tipo</span>
                    <span className={clsx(
                      "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter",
                      pendingBooking?.type === 'double' ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                    )}>
                      {pendingBooking?.type === 'double' ? 'Duplas' : 'Simples'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex gap-3 shrink-0">
                <button
                  onClick={() => {
                    setPendingBooking(null);
                    setPartnerId('');
                    setOpponentName('');
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl border-2 border-zinc-200 text-zinc-500 font-bold hover:bg-zinc-100 transition-colors flex items-center justify-center gap-2 text-sm"
                  disabled={isBookingLoading}
                >
                  <X className="w-4 h-4" />
                  Sair
                </button>
                <button
                  onClick={() => confirmBooking()}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 text-white font-black shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  disabled={isBookingLoading || (opponentName.startsWith('Outro: ') && opponentName.length < 8)}
                >
                  {isBookingLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {isBookingLoading ? 'Processando...' : 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>{/* end flex-1 main area */}
    </div>
  );
}
