import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserProfile, Booking, Championship, ChampionshipRegistration, ChampionshipMatch } from '../types';
import { format, addDays, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Shield, Users, Calendar as CalendarIcon, AlertTriangle, Download, Trophy, ArrowRight, ArrowLeft, Trash2, FileText, Bell, CheckCircle, Plus, X, ShieldAlert, AlertCircle, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, query, where, orderBy, limit, getDoc, writeBatch } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AdminAlert, MaintenanceReport } from '../types';
import clsx from 'clsx';

import { useSettings } from '../context/SettingsContext';

export default function Admin() {
  const { profile, user } = useAuth();
  const { settings: globalSettings } = useSettings();
  const navigate = useNavigate();
  const isSystemAdmin = profile?.role === 'admin' || user?.email === 'tennisffc2@gmail.com';
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [maintenanceReports, setMaintenanceReports] = useState<MaintenanceReport[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [championshipMatches, setChampionshipMatches] = useState<ChampionshipMatch[]>([]);
  const [championshipRegistrations, setChampionshipRegistrations] = useState<ChampionshipRegistration[]>([]);
  const [viewingBracket, setViewingBracket] = useState<string | null>(null); // championshipId
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'bookings' | 'ranking' | 'penalties' | 'championships' | 'settings' | 'maintenance' | 'visitors'>('users');
  const [logoInput, setLogoInput] = useState('');
  const [clubNameInput, setClubNameInput] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [observationEdit, setObservationEdit] = useState('');

  useEffect(() => {
    if (profile?.canManageChampionships && !isSystemAdmin) {
      setActiveTab('championships');
    }
  }, [profile?.canManageChampionships, isSystemAdmin]);

  useEffect(() => {
    if (globalSettings) {
      setLogoInput(globalSettings.logoUrl || '');
      setClubNameInput(globalSettings.clubName || '');
    }
  }, [globalSettings?.logoUrl, globalSettings?.clubName]);
  const [bookingFilter, setBookingFilter] = useState<'all' | 'week' | 'month'>('all');
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [blockingUser, setBlockingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Championship Form State
  const [isCreatingChampionship, setIsCreatingChampionship] = useState(false);
  const [newChampionship, setNewChampionship] = useState<Partial<Championship>>({
    title: '',
    description: '',
    type: 'singles',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
    registrationStartDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    registrationDeadline: format(addDays(new Date(), 3), "yyyy-MM-dd'T'HH:mm"),
    maxParticipants: 32,
    registrationFee: 0,
    pixKey: '',
    isDrawnPairs: false,
    status: 'open'
  });

  const [viewingPayments, setViewingPayments] = useState<string | null>(null);
  const [viewingRegistrants, setViewingRegistrants] = useState<string | null>(null);
  const [bracketSimulation, setBracketSimulation] = useState<{
    championshipId: string;
    drawnPairsToCreate: any[];
    shuffledParticipants: any[];
    simulatedMatchesRound1: {
      matchNumber: number;
      p1Name: string;
      p2Name: string;
    }[];
  } | null>(null);
  const [isResettingBookings, setIsResettingBookings] = useState(false);
  const [isResettingCredits, setIsResettingCredits] = useState(false);
  const [resetPassword, setResetPassword] = useState('');

  const handleResetBookings = async () => {
    if (resetPassword !== '1234') {
      showAlert("Erro", "Senha incorreta!", "error");
      return;
    }

    showConfirm(
      "Confirmar Limpeza de Agenda",
      "Isso excluirá todos os agendamentos normais do sistema. As AULAS FIXAS NÃO serão removidas. Tem certeza?",
      async () => {
        try {
          setLoading(true);
          // Delete all bookings except fixed ones
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

          // Refresh bookings list excluding deleted ones
          setBookings(prev => prev.filter(b => b.isFixed));
          setIsResettingBookings(false);
          setResetPassword('');
          showAlert("Sucesso", `${count} agendamentos foram removidos. Aulas fixas mantidas.`, "success");
        } catch (error) {
          console.error('Error resetting bookings:', error);
          handleFirestoreError(error, OperationType.DELETE, 'bookings');
          showAlert("Erro", "Não foi possível resetar os agendamentos.", "error");
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleResetCredits = async () => {
    if (resetPassword !== '1234') {
      showAlert("Erro", "Senha incorreta!", "error");
      return;
    }

    showConfirm(
      "Resetar Todos os Créditos",
      "Isso definirá os créditos de TODOS os usuários para 3. Deseja continuar?",
      async () => {
        try {
          setLoading(true);
          const usersSnap = await getDocs(collection(db, 'users'));
          const batch = writeBatch(db);
          const nowStr = new Date().toISOString();
          
          usersSnap.docs.forEach(d => {
            const userData = d.data();
            // Important: Professor and Admin should stay at 99
            if (userData.role === 'professor' || userData.role === 'admin') {
              batch.update(d.ref, { credits: 99, lastCreditsReset: nowStr });
            } else {
              batch.update(d.ref, { credits: 3, lastCreditsReset: nowStr });
            }
          });
          await batch.commit();

          setIsResettingCredits(false);
          setResetPassword('');
          showAlert("Sucesso", "Créditos renovados com sucesso!", "success");
        } catch (error) {
          console.error('Error resetting credits:', error);
          handleFirestoreError(error, OperationType.UPDATE, 'users');
          showAlert("Erro", "Não foi possível resetar os créditos.", "error");
        } finally {
          setLoading(false);
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
      // Cada agendamento agora é 1h15 (1.25 horas)
      counts[b.userId].hours += 1.25;
    });

    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [bookings]);

  // Modal state
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
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
    cancelText?: string
  ) => {
    setModal({ 
      isOpen: true, 
      title, 
      message, 
      type: 'confirm', 
      onConfirm,
      onCancel,
      confirmText,
      cancelText
    });
  };

  useEffect(() => {
    if (profile?.role !== 'admin' && !profile?.canManageChampionships) return;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const fetchCollection = async (collName: string, queryOrColl: any) => {
          try {
            return await getDocs(queryOrColl);
          } catch (err) {
            console.error(`Error fetching ${collName}:`, err);
            handleFirestoreError(err, OperationType.LIST, collName);
            return { docs: [] };
          }
        };

        const [usersSnap, bookingsSnap, alertsSnap, maintenanceSnap, champSnap, regSnap, matchSnap] = await Promise.all([
          fetchCollection('users', collection(db, 'users')),
          fetchCollection('bookings', query(collection(db, 'bookings'), orderBy('date', 'desc'), orderBy('startTime', 'desc'))),
          isSystemAdmin ? fetchCollection('admin_alerts', query(collection(db, 'admin_alerts'), orderBy('created_at', 'desc'))) : Promise.resolve({ docs: [] }),
          isSystemAdmin ? fetchCollection('maintenance_reports', query(collection(db, 'maintenance_reports'), orderBy('created_at', 'desc'))) : Promise.resolve({ docs: [] }),
          fetchCollection('championships', query(collection(db, 'championships'), orderBy('created_at', 'desc'))),
          fetchCollection('championship_registrations', query(collection(db, 'championship_registrations'), where('status', '==', 'confirmed'))),
          fetchCollection('championship_matches', query(collection(db, 'championship_matches'), orderBy('round', 'asc'), orderBy('matchNumber', 'asc')))
        ]);

        let settingsSnap;
        try {
          settingsSnap = await getDoc(doc(db, 'settings', 'club_profile'));
        } catch (err) {
          console.error("Error fetching settings:", err);
          handleFirestoreError(err, OperationType.GET, 'settings/club_profile');
        }

        setUsers(usersSnap.docs.map(d => d.data() as UserProfile));
        setBookings(bookingsSnap.docs.map(d => d.data() as Booking));
        setAlerts(alertsSnap.docs.map(d => d.data() as AdminAlert));
        setMaintenanceReports(maintenanceSnap.docs.map(d => d.data() as MaintenanceReport));
        setChampionships(champSnap.docs.map(d => d.data() as Championship));
        setChampionshipRegistrations(regSnap.docs.map(d => d.data() as ChampionshipRegistration));
        setChampionshipMatches(matchSnap.docs.map(d => d.data() as ChampionshipMatch));

        setFirestoreError(null);
      } catch (error: any) {
        console.error('Error fetching admin data:', error);
        setFirestoreError(`Erro no banco de dados: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => d.data() as UserProfile));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'users'));
    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snap) => {
      setBookings(snap.docs.map(d => d.data() as Booking));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'bookings'));
    const unsubAlerts = isSystemAdmin ? onSnapshot(collection(db, 'admin_alerts'), (snap) => {
      setAlerts(snap.docs.map(d => d.data() as AdminAlert));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'admin_alerts')) : () => {};

    const unsubMaintenance = isSystemAdmin ? onSnapshot(collection(db, 'maintenance_reports'), (snap) => {
      setMaintenanceReports(snap.docs.map(d => d.data() as MaintenanceReport));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'maintenance_reports')) : () => {};
    const unsubChamps = onSnapshot(collection(db, 'championships'), (snap) => {
      setChampionships(snap.docs.map(d => d.data() as Championship));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'championships'));
    const unsubRegs = onSnapshot(collection(db, 'championship_registrations'), (snap) => {
      setChampionshipRegistrations(snap.docs.map(d => d.data() as ChampionshipRegistration));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'championship_registrations'));
    const unsubMatches = onSnapshot(collection(db, 'championship_matches'), (snap) => {
      setChampionshipMatches(snap.docs.map(d => d.data() as ChampionshipMatch));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'championship_matches'));

    return () => {
      unsubUsers();
      unsubBookings();
      unsubAlerts();
      unsubMaintenance();
      unsubChamps();
      unsubRegs();
      unsubMatches();
    };
  }, [profile?.uid, profile?.role, profile?.canManageChampionships]);

  const filteredBookings = React.useMemo(() => {
    if (bookingFilter === 'all') return bookings;
    
    const now = new Date();
    let start: Date, end: Date;

    if (bookingFilter === 'week') {
      start = startOfWeek(now, { weekStartsOn: 0 });
      end = endOfWeek(now, { weekStartsOn: 0 });
    } else {
      start = startOfMonth(now);
      end = endOfMonth(now);
    }

    return bookings.filter(b => {
      if (b.isFixed) return true; // Keep fixed lessons
      try {
        const bDate = parseISO(b.date);
        return isWithinInterval(bDate, { start, end });
      } catch {
        return false;
      }
    });
  }, [bookings, bookingFilter]);

  const handleApplyPenalty = async (userId: string, days: number) => {
    const penaltyDate = addDays(new Date(), days);
    
    try {
      await updateDoc(doc(db, 'users', userId), { penaltyUntil: penaltyDate.toISOString() });
      setBlockingUser(null);
      showAlert("Sucesso", `Bloqueio aplicado até ${format(penaltyDate, 'dd/MM/yyyy HH:mm')}`, 'success');
    } catch (error) {
      console.error('Error applying penalty:', error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      showAlert("Erro", "Não foi possível aplicar o bloqueio.", "error");
    }
  };

  const handleRemovePenalty = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { penaltyUntil: null });
      showAlert("Sucesso", "Bloqueio removido.", 'success');
    } catch (error) {
      console.error('Error removing penalty:', error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      showAlert("Erro", "Não foi possível remover o bloqueio.", "error");
    }
  };

  const handleMarkNoShow = async (booking: Booking) => {
    showConfirm(
      "Marcar No-Show",
      `Marcar ${booking.userName} como não compareceu?`,
      async () => {
        try {
          await updateDoc(doc(db, 'bookings', booking.id), { status: 'no-show' });
          
          showConfirm(
            "Aplicar Bloqueio?",
            "Deseja aplicar um bloqueio de 7 dias a este usuário?",
            async () => {
              const penaltyDate = addDays(new Date(), 7);
              await updateDoc(doc(db, 'users', booking.userId), { penaltyUntil: penaltyDate.toISOString() });
              showAlert("Sucesso", "No-show registrado e bloqueio aplicado.", 'success');
            }
          );
        } catch (error) {
          console.error('Error marking no-show:', error);
          handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.id}`);
          showAlert("Erro", "Não foi possível registrar o no-show.", "error");
        }
      }
    );
  };

  const handleCancelBooking = async (bookingId: string) => {
    showConfirm(
      "Cancelar Agendamento",
      "Cancelar este agendamento?",
      async () => {
        try {
          await updateDoc(doc(db, 'bookings', bookingId), { status: 'cancelled' });
          showAlert("Sucesso", "Agendamento cancelado.", 'success');
        } catch (error) {
          console.error('Error cancelling booking:', error);
          handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
          showAlert("Erro", "Não foi possível cancelar o agendamento.", "error");
        }
      }
    );
  };

  const handleOpenEditBooking = (booking: Booking) => {
    setEditingBooking(booking);
    setObservationEdit(booking.observation || '');
  };

  const handleUpdateBooking = async () => {
    if (!editingBooking) return;
    try {
      setLoading(true);
      await updateDoc(doc(db, 'bookings', editingBooking.id), {
        observation: observationEdit,
        updated_at: new Date().toISOString()
      });
      showAlert("Sucesso", "Agendamento atualizado com sucesso!", "success");
      setEditingBooking(null);
    } catch (error) {
      console.error('Error updating booking:', error);
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${editingBooking.id}`);
      showAlert("Erro", "Não foi possível atualizar o agendamento.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'user' | 'admin' | 'professor') => {
    showConfirm(
      "Alterar Papel",
      `Tem certeza que deseja alterar o papel deste usuário para ${newRole}?`,
      async () => {
        try {
          await updateDoc(doc(db, 'users', userId), { role: newRole });
          setUsers(prev => prev.map(u => u.uid === userId ? { ...u, role: newRole } : u));
          showAlert("Sucesso", "Papel alterado com sucesso.", 'success');
        } catch (error) {
          console.error('Error changing role:', error);
          handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
          showAlert("Erro", "Não foi possível alterar o papel.", "error");
        }
      }
    );
  };

  const handleToggleChampionshipPermission = async (userId: string, canManage: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), { canManageChampionships: canManage });
      setUsers(prev => prev.map(u => u.uid === userId ? { ...u, canManageChampionships: canManage } : u));
      showAlert("Sucesso", "Permissão de campeonatos atualizada.", 'success');
    } catch (error) {
      console.error('Error updating permission:', error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      showAlert("Erro", "Não foi possível atualizar a permissão.", "error");
    }
  };

  const handleToggleCourt1Permission = async (userId: string, allowed: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), { allowedCourt1: allowed });
      setUsers(prev => prev.map(u => u.uid === userId ? { ...u, allowedCourt1: allowed } : u));
      showAlert("Sucesso", "Permissão de agendamento na Quadra 1 atualizada.", 'success');
    } catch (error) {
      console.error('Error updating Court 1 permission:', error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      showAlert("Erro", "Não foi possível atualizar a permissão da Quadra 1.", "error");
    }
  };

  const handleUpdateVisitorPix = async (bookingId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        visitorPixPaid: !currentStatus,
        updated_at: new Date().toISOString()
      });
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, visitorPixPaid: !currentStatus } : b));
      showAlert("Sucesso", "Status de pagamento do PIX do visitante atualizado!", "success");
    } catch (error) {
      console.error('Error updating visitor PIX status:', error);
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
      showAlert("Erro", "Não foi possível atualizar o status de PIX.", "error");
    }
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    showConfirm(
      "Excluir Usuário",
      `Tem certeza que deseja excluir permanentemente o sócio ${name}? Esta ação não pode ser desfeita.`,
      async () => {
        try {
          await deleteDoc(doc(db, 'users', userId));
          showAlert("Sucesso", "Usuário excluído com sucesso.", 'success');
        } catch (error) {
          console.error('Error deleting user:', error);
          handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
          showAlert("Erro", "Não foi possível excluir o usuário.", "error");
        }
      }
    );
  };

  const handleMarkReportRead = async (reportId: string) => {
    try {
      await updateDoc(doc(db, 'maintenance_reports', reportId), { read: true });
    } catch (error) {
      console.error('Error marking report read:', error);
      handleFirestoreError(error, OperationType.UPDATE, `maintenance_reports/${reportId}`);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    showConfirm(
      "Excluir Relato",
      "Deseja excluir permanentemente esta notificação?",
      async () => {
        try {
          await deleteDoc(doc(db, 'maintenance_reports', reportId));
          showAlert("Sucesso", "Notificação excluída.", 'success');
        } catch (error) {
          console.error('Error deleting report:', error);
          handleFirestoreError(error, OperationType.DELETE, `maintenance_reports/${reportId}`);
        }
      }
    );
  };

  const handleMarkAlertRead = async (alertId: string) => {
    try {
      await updateDoc(doc(db, 'admin_alerts', alertId), { read: true });
    } catch (error) {
      console.error('Error marking alert read:', error);
      handleFirestoreError(error, OperationType.UPDATE, `admin_alerts/${alertId}`);
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    showConfirm(
      "Excluir Alerta",
      "Deseja excluir permanentemente este registro de denúncia/alerta?",
      async () => {
        try {
          await deleteDoc(doc(db, 'admin_alerts', alertId));
          showAlert("Sucesso", "Alerta excluído com sucesso.", 'success');
        } catch (error) {
          console.error('Error deleting alert:', error);
          handleFirestoreError(error, OperationType.DELETE, `admin_alerts/${alertId}`);
          showAlert("Erro", "Não foi possível excluir o alerta.", "error");
        }
      }
    );
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Use a slightly smaller limit for Base64 to be safe with Firestore 1MB document limit
    if (file.size > 600 * 1024) {
      alert("A imagem deve ter no máximo 600KB para garantir o carregamento rápido.");
      return;
    }

    setUploadingLogo(true);
    try {
      let downloadURL = '';
      
      try {
        const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
        const { storage } = await import('../firebase');
        
        const storageRef = ref(storage, `club_assets/logo_${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        downloadURL = await getDownloadURL(snapshot.ref);
        console.log("Uploaded to Storage successfully");
      } catch (storageError: any) {
        console.warn("Storage upload failed or not configured, using Base64 fallback:", storageError);
        
        // Base64 Fallback
        const reader = new FileReader();
        downloadURL = await new Promise((resolve, reject) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(file);
        });
      }
      
      if (downloadURL) {
        setLogoInput(downloadURL);
        
        await setDoc(doc(db, 'settings', 'club_profile'), {
          logoUrl: downloadURL,
          clubName: "Ferroviário Futebol Clube",
          updated_at: new Date().toISOString()
        }, { merge: true });
        
        showAlert("Sucesso", "Logo salva com sucesso!", "success");
      }
    } catch (error: any) {
      console.error("Error saving logo:", error);
      showAlert("Erro", `Falha ao salvar logo: ${error.message}`, "error");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleUpdateSettings = async () => {
    try {
      await setDoc(doc(db, 'settings', 'club_profile'), {
        logoUrl: logoInput,
        clubName: clubNameInput,
        updated_at: new Date().toISOString()
      }, { merge: true });
      showAlert("Sucesso", "Configurações do clube atualizadas!", "success");
    } catch (error) {
      console.error('Error updating settings:', error);
      handleFirestoreError(error, OperationType.UPDATE, 'settings/club_profile');
      showAlert("Erro", "Não foi possível atualizar as configurações.", "error");
    }
  };

  const handleToggleRequirePartner = async () => {
    if (!globalSettings) return;
    try {
      const newStatus = !globalSettings.requireRegisteredPartner;
      await updateDoc(doc(db, 'settings', 'club_profile'), {
        requireRegisteredPartner: newStatus,
        updated_at: new Date().toISOString()
      });
      showAlert("Sucesso", `Configuração atualizada: ${newStatus ? 'Parceiro obrigatório cadastrado' : 'Convidado permitido'}`, "success");
    } catch (error) {
      console.error('Error updating settings:', error);
      handleFirestoreError(error, OperationType.UPDATE, 'settings/club_profile');
    }
  };

  const generatePDF = (type: 'week' | 'month') => {
    const doc = new jsPDF();
    const now = new Date();
    const title = type === 'week' ? 'Relatório Semanal de Agendamentos' : 'Relatório Mensal de Agendamentos';
    
    let start: Date, end: Date;
    if (type === 'week') {
      start = startOfWeek(now, { weekStartsOn: 0 });
      end = endOfWeek(now, { weekStartsOn: 0 });
    } else {
      start = startOfMonth(now);
      end = endOfMonth(now);
    }

    const period = type === 'week' 
      ? `${format(start, 'dd/MM')} a ${format(end, 'dd/MM')}`
      : format(now, 'MMMM yyyy', { locale: ptBR });

    doc.setFontSize(18);
    doc.text('Tennis FFC', 14, 20);
    doc.setFontSize(14);
    doc.text(title, 14, 30);
    doc.setFontSize(10);
    doc.text(`Período: ${period}`, 14, 38);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 44);

    const reportBookings = bookings.filter(b => {
      if (b.isFixed) return true;
      try {
        const bDate = parseISO(b.date);
        return isWithinInterval(bDate, { start, end });
      } catch {
        return false;
      }
    });

    const tableData = reportBookings.map(b => [
      b.isFixed ? 'Aula Fixa' : format(parseISO(b.date), 'dd/MM/yyyy'),
      b.startTime,
      b.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2',
      b.isLastMinute ? `${b.userName} (⚡ 30min)` : b.userName,
      b.status === 'confirmed' ? 'Ativo' : b.status === 'cancelled' ? 'Cancelado' : 'No-Show'
    ]);

    autoTable(doc, {
      startY: 50,
      head: [['Data', 'Hora', 'Quadra', 'Sócio', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }
    });

    doc.save(`relatorio_${type}_${format(new Date(), 'yyyyMMdd')}.pdf`);
    showAlert("Sucesso", "PDF gerado com sucesso!", 'success');
  };

  const handleGenerateUserReport = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Tennis FFC', 14, 20);
    doc.setFontSize(14);
    doc.text('Relatório de Usuários Cadastrados', 14, 30);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 38);

    const tableData = users.map(u => [
      u.fullName,
      u.phone || 'N/A',
      u.role === 'admin' ? 'Administrador' : u.role === 'professor' ? 'Professor' : 'Sócio',
      u.credits || 0,
      u.created_at ? format(parseISO(u.created_at), 'dd/MM/yyyy') : 'N/A'
    ]);

    autoTable(doc, {
      startY: 45,
      head: [['Nome Completo', 'Telefone', 'Papel', 'Créditos', 'Cadastro']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }
    });

    doc.save(`relatorio_usuarios_${format(new Date(), 'yyyyMMdd')}.pdf`);
    showAlert("Sucesso", "Relatório de usuários gerado com sucesso!", 'success');
  };

  const handleUpdateCredits = async (userId: string, newCredits: number) => {
    const password = prompt("Digite a senha para alterar créditos:");
    if (password !== "1234") {
      showAlert("Erro", "Senha incorreta.", "error");
      return;
    }
    try {
      await updateDoc(doc(db, 'users', userId), { credits: newCredits });
      setUsers(prev => prev.map(u => u.uid === userId ? { ...u, credits: newCredits } : u));
      showAlert("Sucesso", "Créditos atualizados.", "success");
    } catch (error) {
      console.error('Error updating credits:', error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      showAlert("Erro", "Não foi possível atualizar os créditos.", "error");
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      await updateDoc(doc(db, 'users', editingUser.uid), {
        fullName: editName,
        phone: editPhone
      });
      showAlert("Sucesso", "Dados do sócio atualizados.", 'success');
      setEditingUser(null);
    } catch (error) {
      console.error('Error updating user:', error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingUser.uid}`);
      showAlert("Erro", "Não foi possível atualizar o usuário.", "error");
    }
  };

  const handleDownloadProject = async () => {
    try {
      showAlert("Iniciando Backup", "Exportando dados do clube. Por favor, aguarde...", 'info');
      const token = await user?.getIdToken();
      const response = await fetch('/api/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Falha ao gerar o arquivo ZIP');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-tennis-ffc-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showAlert("Sucesso", "Backup de dados exportado com sucesso!", 'success');
    } catch (error) {
      console.error('Erro ao exportar backup:', error);
      showAlert("Erro", "Não foi possível exportar os dados. Tente novamente.", 'error');
    }
  };

  const handleCreateChampionship = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newChampRef = doc(collection(db, 'championships'));
      await setDoc(newChampRef, {
        ...newChampionship,
        id: newChampRef.id,
        created_at: new Date().toISOString()
      });
      showAlert("Sucesso", "Campeonato criado com sucesso!", 'success');
      setIsCreatingChampionship(false);
      setNewChampionship({
        title: '',
        description: '',
        type: 'singles',
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
        registrationStartDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        registrationDeadline: format(addDays(new Date(), 3), "yyyy-MM-dd'T'HH:mm"),
        maxParticipants: 32,
        registrationFee: 0,
        pixKey: '',
        isDrawnPairs: false,
        status: 'open'
      });
    } catch (error) {
      console.error('Error creating championship:', error);
      handleFirestoreError(error, OperationType.CREATE, 'championships');
      showAlert("Erro", "Não foi possível criar o campeonato.", "error");
    }
  };

  const handleDeleteChampionship = async (id: string) => {
    showConfirm(
      "Excluir Campeonato",
      "Tem certeza que deseja excluir este campeonato? Todas as inscrições serão perdidas.",
      async () => {
        try {
          await deleteDoc(doc(db, 'championships', id));
          setChampionships(prev => prev.filter(c => c.id !== id));
          showAlert("Sucesso", "Campeonato excluído.", 'success');
        } catch (error) {
          console.error('Error deleting championship:', error);
          handleFirestoreError(error, OperationType.DELETE, `championships/${id}`);
          showAlert("Erro", "Não foi possível excluir o campeonato.", "error");
        }
      }
    );
  };

  const handleUpdateChampionshipStatus = async (id: string, status: Championship['status']) => {
    try {
      await updateDoc(doc(db, 'championships', id), { status });
      setChampionships(prev => prev.map(c => c.id === id ? { ...c, status } : c));
      showAlert("Sucesso", `Status atualizado para ${status}.`, 'success');
    } catch (error) {
      console.error('Error updating status:', error);
      handleFirestoreError(error, OperationType.UPDATE, `championships/${id}`);
      showAlert("Erro", "Não foi possível atualizar o status.", "error");
    }
  };

  const handleGenerateBracketPreview = (championshipId: string) => {
    const champ = championships.find(c => c.id === championshipId);
    if (!champ) return;

    // Filter out any previously drawn registrations to avoid duplicates
    let regs = championshipRegistrations.filter(r => r.championshipId === championshipId && !r.isDrawn);
    
    if (champ.type === 'doubles' && champ.isDrawnPairs) {
      if (regs.length < 4) {
        showAlert("Erro", "É necessário pelo menos 4 inscritos para sortear duplas.", "error");
        return;
      }
    } else {
      if (regs.length < 2) {
        showAlert("Erro", "É necessário pelo menos 2 participantes (ou duplas) para gerar as chaves.", "error");
        return;
      }
    }

    try {
      let drawnPairsToCreate: any[] = [];
      let participants: any[] = [];

      if (champ.type === 'doubles' && champ.isDrawnPairs) {
        // Shuffle individuals
        const shuffledIndividuals = [...regs].sort(() => Math.random() - 0.5);
        
        for (let i = 0; i < shuffledIndividuals.length; i += 2) {
          const p1 = shuffledIndividuals[i];
          const p2 = shuffledIndividuals[i + 1];
          
          if (p1 && p2) {
            const newRegId = doc(collection(db, 'championship_registrations')).id;
            const newRegData = {
              id: newRegId,
              championshipId,
              userId1: p1.userId1,
              userName1: p1.userName1,
              userId2: p2.userId1,
              userName2: p2.userName1,
              status: 'confirmed',
              isDrawn: true,
              created_at: new Date().toISOString()
            };
            drawnPairsToCreate.push(newRegData);
            participants.push(newRegData);
          } else if (p1) {
            const newRegId = doc(collection(db, 'championship_registrations')).id;
            const newRegData = {
              id: newRegId,
              championshipId,
              userId1: p1.userId1,
              userName1: p1.userName1,
              status: 'confirmed',
              isDrawn: true,
              created_at: new Date().toISOString()
            };
            drawnPairsToCreate.push(newRegData);
            participants.push(newRegData);
          }
        }
      } else {
        participants = [...regs];
      }

      // 1. Shuffle participants (the pairs or individuals)
      const shuffled = [...participants].sort(() => Math.random() - 0.5);
      
      // 2. Determine number of rounds
      const numParticipants = shuffled.length;
      const numRounds = Math.ceil(Math.log2(numParticipants));
      
      // 3. Create simulated matches for Round 1
      const matchesInFirstRound = Math.pow(2, numRounds - 1);
      let simulatedMatchesRound1: any[] = [];
      
      for (let m = 0; m < matchesInFirstRound; m++) {
        const p1 = shuffled[m * 2];
        const p2 = shuffled[m * 2 + 1];
        
        let p1Name = "Não definido";
        let p2Name = "Não definido";
        
        if (p1) {
          p1Name = champ.type === 'singles' ? p1.userName1 : `${p1.userName1} / ${p1.userName2 || '?'}`;
        }
        if (p2) {
          p2Name = champ.type === 'singles' ? p2.userName1 : `${p2.userName1} / ${p2.userName2 || '?'}`;
        } else if (p1) {
          p2Name = "BYE";
        }
        
        simulatedMatchesRound1.push({
          matchNumber: m,
          p1Name,
          p2Name
        });
      }

      setBracketSimulation({
        championshipId,
        drawnPairsToCreate,
        shuffledParticipants: shuffled,
        simulatedMatchesRound1
      });
    } catch (err) {
      console.error(err);
      showAlert("Erro", "Erro ao simular as chaves de campeonato.", "error");
    }
  };

  const handleConfirmAndWriteBracket = async () => {
    if (!bracketSimulation) return;
    const { championshipId, drawnPairsToCreate, shuffledParticipants } = bracketSimulation;
    
    const champ = championships.find(c => c.id === championshipId);
    if (!champ) return;

    setLoading(true);
    try {
      // 1. Save Drawn Pairs (if any)
      if (drawnPairsToCreate.length > 0) {
        const batchRegs = writeBatch(db);
        drawnPairsToCreate.forEach(reg => {
          batchRegs.set(doc(db, 'championship_registrations', reg.id), reg);
        });
        await batchRegs.commit();
      }

      // 2. Determine number of rounds
      const numParticipants = shuffledParticipants.length;
      const numRounds = Math.ceil(Math.log2(numParticipants));
      
      // 3. Create matches round by round (from final to first)
      let nextRoundMatchIds: string[] = [];
      
      for (let r = numRounds; r >= 1; r--) {
        const matchesInRound = Math.pow(2, numRounds - r);
        const batch = writeBatch(db);
        const roundMatches: any[] = [];

        for (let m = 0; m < matchesInRound; m++) {
          const matchRef = doc(collection(db, 'championship_matches'));
          const matchData = {
            id: matchRef.id,
            championshipId,
            round: r,
            matchNumber: m,
            nextMatchId: r < numRounds ? nextRoundMatchIds[Math.floor(m / 2)] : null,
            status: 'pending',
            created_at: new Date().toISOString()
          };
          batch.set(matchRef, matchData);
          roundMatches.push(matchData);
        }
        
        await batch.commit();
        const sortedInserted = roundMatches.sort((a, b) => a.matchNumber - b.matchNumber);
        nextRoundMatchIds = sortedInserted.map(m => m.id);
        
        // If this is round 1, assign participants
        if (r === 1) {
          for (let i = 0; i < sortedInserted.length; i++) {
            const match = sortedInserted[i];
            const p1 = shuffledParticipants[i * 2];
            const p2 = shuffledParticipants[i * 2 + 1];
            
            const update: any = {};
            if (p1) {
              update.participant1Id = p1.id;
              update.participant1Name = champ.type === 'singles' ? p1.userName1 : `${p1.userName1} / ${p1.userName2 || '?'}`;
            }
            if (p2) {
              update.participant2Id = p2.id;
              update.participant2Name = champ.type === 'singles' ? p2.userName1 : `${p2.userName1} / ${p2.userName2 || '?'}`;
            } else if (p1) {
              // Bye! Advance p1 automatically
              update.winnerId = p1.id;
              update.status = 'finished';
              update.score1 = 'W';
              update.score2 = 'O';
            }
            
            await updateDoc(doc(db, 'championship_matches', match.id), update);
            
            // If winner advanced, update next match
            if (update.winnerId && match.nextMatchId) {
              const isP1 = match.matchNumber % 2 === 0;
              await updateDoc(doc(db, 'championship_matches', match.nextMatchId), {
                [isP1 ? 'participant1Id' : 'participant2Id']: update.winnerId,
                [isP1 ? 'participant1Name' : 'participant2Name']: update.participant1Name
              });
            }
          }
        }
      }
      
      showAlert("Sucesso", "Chaves gravadas e confirmadas com sucesso!", "success");
      setBracketSimulation(null);
      setViewingBracket(championshipId);
    } catch (error) {
      console.error('Error confirming and writing bracket:', error);
      handleFirestoreError(error, OperationType.WRITE, 'championship_matches');
      showAlert("Erro", "Falha ao gravar chaves geradas.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMatchScore = async (match: ChampionshipMatch, s1: string, s2: string, winnerId?: string) => {
    try {
      // If winnerId is not provided, try to infer it from scores if they are numbers
      let finalWinnerId = winnerId;
      if (!finalWinnerId) {
        const score1 = parseInt(s1);
        const score2 = parseInt(s2);
        if (!isNaN(score1) && !isNaN(score2)) {
          finalWinnerId = score1 > score2 ? match.participant1Id : match.participant2Id;
        }
      }

      if (!finalWinnerId) {
        showAlert("Erro", "Por favor, selecione o vencedor da partida.", "error");
        return;
      }

      const winnerName = finalWinnerId === match.participant1Id ? match.participant1Name : match.participant2Name;
      
      await updateDoc(doc(db, 'championship_matches', match.id), {
        score1: s1,
        score2: s2,
        winnerId: finalWinnerId,
        status: 'finished'
      });
      
      // Advance to next match
      if (match.nextMatchId && finalWinnerId) {
        const isP1 = match.matchNumber % 2 === 0;
        await updateDoc(doc(db, 'championship_matches', match.nextMatchId), {
          [isP1 ? 'participant1Id' : 'participant2Id']: finalWinnerId,
          [isP1 ? 'participant1Name' : 'participant2Name']: winnerName
        });
      }
      
      showAlert("Sucesso", "Placar atualizado!", "success");
    } catch (error) {
      console.error('Error updating score:', error);
      handleFirestoreError(error, OperationType.UPDATE, `championship_matches/${match.id}`);
      showAlert("Erro", "Falha ao atualizar placar.", "error");
    }
  };

  const handleResetBracket = async (championshipId: string) => {
    showConfirm(
      "Resetar Chaves",
      "Isso excluirá todas as chaves, placares e sorteios de duplas deste campeonato. Deseja continuar?",
      async () => {
        try {
          // Delete matches
          const matchSnap = await getDocs(query(collection(db, 'championship_matches'), where('championshipId', '==', championshipId)));
          const batch = writeBatch(db);
          matchSnap.docs.forEach(d => batch.delete(d.ref));
          
          // Delete drawn registrations
          const regSnap = await getDocs(query(collection(db, 'championship_registrations'), where('championshipId', '==', championshipId), where('isDrawn', '==', true)));
          regSnap.docs.forEach(d => batch.delete(d.ref));
          
          await batch.commit();

          showAlert("Sucesso", "Chaves e sorteios resetados.", "success");
        } catch (error) {
          console.error('Error resetting bracket:', error);
          handleFirestoreError(error, OperationType.DELETE, 'championship_matches');
          showAlert("Erro", "Falha ao resetar chaves.", "error");
        }
      }
    );
  };

  const handleUpdatePaymentStatus = async (registrationId: string, newStatus: 'pending' | 'informed' | 'paid') => {
    try {
      await updateDoc(doc(db, 'championship_registrations', registrationId), { paymentStatus: newStatus });

      setChampionshipRegistrations(prev => 
        prev.map(r => r.id === registrationId ? { ...r, paymentStatus: newStatus } : r)
      );
      
      if (newStatus === 'paid') {
        showAlert("Sucesso", "Pagamento confirmado!", "success");
      }
    } catch (error) {
      console.error('Error updating payment status:', error);
      handleFirestoreError(error, OperationType.UPDATE, `championship_registrations/${registrationId}`);
      showAlert("Erro", "Falha ao atualizar status de pagamento.", "error");
    }
  };

  const handleGenerateFinancialReport = (championshipId: string) => {
    const champ = championships.find(c => c.id === championshipId);
    if (!champ) return;

    const regs = championshipRegistrations.filter(r => r.championshipId === championshipId && !r.isDrawn);
    const paidRegs = regs.filter(r => r.paymentStatus === 'paid');
    const pendingRegs = regs.filter(r => r.paymentStatus === 'pending');
    
    const fee = champ.registrationFee || 0;
    const totalCollected = paidRegs.length * fee;
    const totalPending = pendingRegs.length * fee;
    const totalExpected = regs.length * fee;

    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text(`Relatório Financeiro: ${champ.title}`, 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Data do Relatório: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 32);
    doc.text(`Valor da Inscrição: R$ ${fee.toFixed(2)}`, 14, 40);
    
    autoTable(doc, {
      startY: 50,
      head: [['Status', 'Quantidade', 'Total (R$)']],
      body: [
        ['Confirmados (Pagos)', paidRegs.length, `R$ ${totalCollected.toFixed(2)}`],
        ['Pendentes', pendingRegs.length, `R$ ${totalPending.toFixed(2)}`],
        ['Total Geral', regs.length, `R$ ${totalExpected.toFixed(2)}`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] }
    });

    doc.text('Detalhamento por Inscrito:', 14, (doc as any).lastAutoTable.finalY + 15);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Inscrito(s)', 'Status']],
      body: regs.map(r => [
        r.userName2 ? `${r.userName1} / ${r.userName2}` : r.userName1,
        r.paymentStatus === 'paid' ? 'PAGO' : 'PENDENTE'
      ]),
    });

    doc.save(`financeiro_${champ.title.toLowerCase().replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center gap-2">
          <h1 className="text-lg sm:text-xl font-bold text-zinc-900 flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            {globalSettings?.logoUrl ? (
              <img src={globalSettings.logoUrl} alt="Logo" className="w-9 h-9 sm:w-10 sm:h-10 object-contain shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 shrink-0" />
            )}
            <span className="flex flex-col min-w-0">
              <span className="text-[9px] sm:text-xs text-zinc-400 uppercase tracking-widest font-black leading-none mb-1">
                {isSystemAdmin ? 'Administração' : 'Gestão'}
              </span>
              <span className="leading-none truncate">
                {globalSettings?.clubName || 'Tennis FFC'}
              </span>
            </span>
          </h1>
          <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
            {isSystemAdmin && (
              <button
                onClick={handleDownloadProject}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="hidden sm:inline">Exportar Dados (ZIP)</span>
                <span className="sm:hidden">ZIP</span>
              </button>
            )}
            <button onClick={() => navigate('/')} className="flex items-center gap-1 text-xs sm:text-sm font-medium text-emerald-600 hover:text-emerald-700 whitespace-nowrap">
              <ArrowLeft className="w-3.5 h-3.5 sm:hidden shrink-0" />
              <span className="hidden sm:inline">Voltar ao Dashboard</span>
              <span className="sm:hidden">Voltar</span>
            </button>
          </div>
        </div>
        {firestoreError && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
            <div className="max-w-7xl mx-auto flex items-center gap-2 text-amber-800 text-xs font-medium">
              <Shield className="w-4 h-4 text-amber-500" />
              <span>{firestoreError}</span>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-4 mb-6 border-b border-zinc-200 pb-4 overflow-x-auto">
          {isSystemAdmin && (
            <>
              <button
                onClick={() => setActiveTab('users')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium whitespace-nowrap ${
                  activeTab === 'users' ? 'bg-emerald-100 text-emerald-700' : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <Users className="w-5 h-5" />
                Usuários
              </button>
              <button
                onClick={() => setActiveTab('bookings')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium whitespace-nowrap ${
                  activeTab === 'bookings' ? 'bg-emerald-100 text-emerald-700' : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <CalendarIcon className="w-5 h-5" />
                Agendamentos
              </button>
              <button
                onClick={() => setActiveTab('penalties')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium whitespace-nowrap relative ${
                  activeTab === 'penalties' ? 'bg-emerald-100 text-emerald-700' : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <AlertCircle className="w-5 h-5" />
                Penalidades
                {alerts.filter(a => !a.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full">
                    {alerts.filter(a => !a.read).length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('maintenance')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium whitespace-nowrap relative ${
                  activeTab === 'maintenance' ? 'bg-emerald-100 text-emerald-700' : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <Bell className="w-5 h-5" />
                Manutenção
                {maintenanceReports.filter(r => !r.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[10px] flex items-center justify-center rounded-full">
                    {maintenanceReports.filter(r => !r.read).length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('visitors')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium whitespace-nowrap relative ${
                  activeTab === 'visitors' ? 'bg-emerald-100 text-emerald-700' : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <Users className="w-5 h-5" />
                Não Sócios / Visitantes
              </button>
            </>
          )}
          <button
            onClick={() => setActiveTab('ranking')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium whitespace-nowrap ${
              activeTab === 'ranking' ? 'bg-emerald-100 text-emerald-700' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <Trophy className="w-5 h-5" />
            Ranking
          </button>
          <button
            onClick={() => setActiveTab('championships')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium whitespace-nowrap ${
              activeTab === 'championships' ? 'bg-emerald-100 text-emerald-700' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <Trophy className="w-5 h-5" />
            Campeonatos
          </button>
          {profile?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium whitespace-nowrap ${
                activeTab === 'settings' ? 'bg-emerald-100 text-emerald-700' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Settings className="w-5 h-5" />
              Ajustes
            </button>
          )}
        </div>

        {/* Ajuda para Login do Google */}
        {profile?.role === 'admin' && (
          <div className="mb-8 bg-amber-50 border border-amber-100 rounded-2xl p-5 shadow-sm">
            <div className="flex gap-4">
              <div className="bg-amber-100 p-2 rounded-full h-fit">
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
              </div>
              <div>
                <h4 className="text-base font-bold text-amber-900">Configuração do Login do Google</h4>
                <p className="text-sm text-amber-800 mt-1">
                  Para remover o link técnico <strong>"gen-lang-client..."</strong> e colocar o nome <strong>"Tennis FFC"</strong> no login:
                </p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/50 p-3 rounded-xl border border-amber-200">
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Passo 1</span>
                  <p className="text-xs text-amber-900 mt-1">
                    Clique aqui para abrir a página correta: <br />
                    <a 
                      href="https://console.firebase.google.com/project/gen-lang-client-0593089986/authentication/settings" 
                      target="_blank" 
                      rel="noreferrer" 
                      className="inline-flex items-center gap-1 text-emerald-700 font-bold hover:underline mt-1"
                    >
                      Abrir Configurações do Firebase
                      <ArrowRight className="w-3 h-3" />
                    </a>
                  </p>
                </div>
                <div className="bg-white/50 p-3 rounded-xl border border-amber-200">
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Passo 2</span>
                  <p className="text-xs text-amber-900 mt-1">
                    Vá em <strong>Authorized Domains</strong> (Domínios Autorizados) e adicione este link: <br />
                    <code className="bg-zinc-100 px-1 rounded text-[10px]">{window.location.hostname}</code>
                  </p>
                </div>
                <div className="bg-white/50 p-3 rounded-xl border border-amber-200">
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Passo 3</span>
                  <p className="text-xs text-amber-900 mt-1">
                    Vá em <strong>User facing info</strong>, clique em <strong>Edit</strong>, coloque o nome <strong>"Tennis FFC"</strong> e salve.
                  </p>
                </div>
                <div className="bg-white/50 p-3 rounded-xl border border-amber-200">
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Passo 4</span>
                  <p className="text-xs text-amber-900 mt-1">
                    Salve as alterações. O Google atualizará o nome na tela de login em alguns minutos.
                  </p>
                </div>
              </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-zinc-100">
              <div>
                <h2 className="text-lg font-bold text-zinc-900">Gestão de Usuários</h2>
                <p className="text-sm text-zinc-500">{users.length} usuários cadastrados</p>
              </div>
              <button
                onClick={handleGenerateUserReport}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-md active:scale-95"
              >
                <FileText className="w-4 h-4" />
                Gerar Relatório de Usuários
              </button>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
            {loading ? (
              <div className="p-8 text-center text-zinc-500">Carregando usuários...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">Nenhum usuário cadastrado.</div>
            ) : (
              <ul className="divide-y divide-zinc-200">
                {users.map(user => (
                  <li key={user.uid} className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-zinc-900">{user.fullName}</h3>
                      <p className="text-sm text-zinc-500">{user.phone || 'Sem telefone'}</p>
                      <div className="mt-2 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500">Papel:</span>
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.uid, e.target.value as any)}
                            className="text-xs border-zinc-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 py-1 pl-2 pr-6"
                          >
                            <option value="user">Usuário</option>
                            <option value="professor">Professor</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500">Créditos:</span>
                          <input
                            type="number"
                            value={user.credits || 0}
                            onChange={(e) => handleUpdateCredits(user.uid, parseInt(e.target.value) || 0)}
                            className="text-xs border-zinc-300 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 py-1 px-2 w-16"
                          />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={user.canManageChampionships || false}
                            onChange={(e) => handleToggleChampionshipPermission(user.uid, e.target.checked)}
                            className="w-4 h-4 text-emerald-600 border-zinc-300 rounded focus:ring-emerald-500"
                          />
                          <span className="text-xs font-medium text-zinc-600">Gerenciar Campeonatos</span>
                        </label>
                        {user.role === 'professor' && (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={user.allowedCourt1 || false}
                              onChange={(e) => handleToggleCourt1Permission(user.uid, e.target.checked)}
                              className="w-4 h-4 text-emerald-600 border-zinc-300 rounded focus:ring-emerald-500"
                            />
                            <span className="text-xs font-medium text-zinc-600">Autorizado na Quadra 1</span>
                          </label>
                        )}
                      </div>
                      {user.penaltyUntil && new Date(user.penaltyUntil) > new Date() && (
                        <p className="text-xs text-red-600 flex items-center gap-1 mt-2">
                          <AlertTriangle className="w-3 h-3" />
                          Bloqueado até {format(new Date(user.penaltyUntil), 'dd/MM/yyyy HH:mm')}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingUser(user);
                          setEditName(user.fullName);
                          setEditPhone(user.phone || '');
                        }}
                        className="px-3 py-1 text-xs font-medium text-zinc-700 bg-zinc-100 rounded hover:bg-zinc-200"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.uid, user.fullName)}
                        className="px-3 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100"
                        title="Excluir Usuário"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {user.penaltyUntil && new Date(user.penaltyUntil) > new Date() ? (
                        <button
                          onClick={() => handleRemovePenalty(user.uid)}
                          className="px-3 py-1 text-xs font-medium text-emerald-700 bg-emerald-100 rounded hover:bg-emerald-200"
                        >
                          Remover Bloqueio
                        </button>
                      ) : (
                        <button
                          onClick={() => setBlockingUser(user)}
                          className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200"
                        >
                          Bloquear
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === 'bookings' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-zinc-100">
              <div className="flex gap-2">
                <button
                  onClick={() => setBookingFilter('all')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${bookingFilter === 'all' ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setBookingFilter('week')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${bookingFilter === 'week' ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                >
                  Esta Semana
                </button>
                <button
                  onClick={() => setBookingFilter('month')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${bookingFilter === 'month' ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                >
                  Este Mês
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => generatePDF('week')}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-100"
                >
                  <FileText className="w-4 h-4" />
                  PDF Semanal
                </button>
                <button
                  onClick={() => generatePDF('month')}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-100"
                >
                  <FileText className="w-4 h-4" />
                  PDF Mensal
                </button>
                <button
                  onClick={() => setIsResettingCredits(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 border border-blue-100"
                >
                  <Users className="w-4 h-4" />
                  Resetar Créditos (3)
                </button>
                <button
                  onClick={() => setIsResettingBookings(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 rounded-lg hover:bg-red-100 border border-red-100"
                >
                  <Trash2 className="w-4 h-4" />
                  Resetar Tudo
                </button>
              </div>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-zinc-200">
                {filteredBookings.map(booking => (
                <li key={booking.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-900">
                      {booking.userName} - {booking.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}
                      {booking.professorName && <span className="ml-2 text-xs text-zinc-500 font-normal">(Prof: {booking.professorName})</span>}
                      {booking.isLastMinute && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700 uppercase tracking-tighter">
                          ⚡ 30 Min
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-zinc-500">
                      {booking.isFixed 
                        ? `Toda ${format(addDays(new Date(2024, 0, 7), booking.dayOfWeek || 0), 'EEEE', { locale: ptBR })}`
                        : format(parseISO(booking.date), 'dd/MM/yyyy')} das {booking.startTime} às {booking.endTime}
                    </p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                      booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' :
                      booking.status === 'cancelled' ? 'bg-zinc-100 text-zinc-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {booking.status === 'confirmed' ? 'Ativo' : booking.status === 'cancelled' ? 'Cancelado' : 'No-Show'}
                    </span>
                    {booking.observation && (
                      <p className="text-xs text-amber-600 font-medium italic mt-1">
                        Obs: {booking.observation}
                      </p>
                    )}
                  </div>
                  {booking.status === 'confirmed' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCancelBooking(booking.id)}
                        className="px-3 py-1 text-xs font-medium text-zinc-700 bg-zinc-100 rounded hover:bg-zinc-200"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleOpenEditBooking(booking)}
                        className="px-3 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleMarkNoShow(booking)}
                        className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200"
                      >
                        Marcar No-Show
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

        {activeTab === 'penalties' && (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
              <h3 className="text-sm font-bold text-zinc-800">Gestão de Penalidades e Denúncias</h3>
              <p className="text-xs text-zinc-500 mt-1">Tentativas de cancelamento tardio e denúncias anônimas de quadra vazia</p>
            </div>
            <ul className="divide-y divide-zinc-200">
              {alerts.length === 0 ? (
                <li className="px-6 py-12 text-center text-zinc-500 text-sm">Nenhuma denúncia ou alerta registrado.</li>
              ) : (
                alerts.map(alert => (
                  <li key={alert.id} className={`px-6 py-4 flex items-center justify-between ${!alert.read ? 'bg-amber-50/50' : ''}`}>
                    <div className="flex gap-4 items-start">
                      <div className={`p-2 rounded-full ${!alert.read ? 'bg-amber-100 text-amber-600' : 'bg-zinc-100 text-zinc-400'}`}>
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        {alert.type === 'late_cancellation_attempt' ? (
                          <>
                            <h4 className="text-sm font-bold text-zinc-900">{alert.userName}</h4>
                            <p className="text-xs text-zinc-500">Tentou cancelar o agendamento de {format(parseISO(alert.bookingDate), 'dd/MM')} às {alert.bookingTime}</p>
                          </>
                        ) : (
                          <>
                            <h4 className="text-sm font-bold text-red-700">Quadra Vazia Reportada</h4>
                            <p className="text-xs text-zinc-700">
                              <span className="font-bold">{alert.reporterName}</span> reportou que a quadra estava vazia no horário de <span className="font-bold">{alert.userName}</span> ({format(parseISO(alert.bookingDate), 'dd/MM')} às {alert.bookingTime}).
                            </p>
                          </>
                        )}
                        <p className="text-[10px] text-zinc-400 mt-1">Registrado em: {format(alert.created_at ? new Date(alert.created_at) : new Date(), 'dd/MM HH:mm')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!alert.read && (
                        <button
                          onClick={() => handleMarkAlertRead(alert.id)}
                          className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Marcar Lido
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const user = users.find(u => u.uid === alert.userId);
                          if (user) setBlockingUser(user);
                        }}
                        className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
                      >
                        <ShieldAlert className="w-4 h-4" />
                        Punir Sócio
                      </button>
                      <button
                        onClick={() => handleDeleteAlert(alert.id)}
                        className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir Alerta"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        {activeTab === 'maintenance' && (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
              <h3 className="text-sm font-bold text-zinc-800">Relatos de Manutenção (Anônimos)</h3>
              <p className="text-xs text-zinc-500 mt-1">Alertas enviados pelos sócios sobre a infraestrutura do clube</p>
            </div>
            <ul className="divide-y divide-zinc-200">
              {maintenanceReports.length === 0 ? (
                <li className="px-6 py-12 text-center text-zinc-500 text-sm">Nenhum relato de manutenção registrado.</li>
              ) : (
                maintenanceReports.map(report => (
                  <li key={report.id} className={`px-6 py-4 flex items-center justify-between ${!report.read ? 'bg-blue-50/50' : ''}`}>
                    <div className="flex gap-4 items-start flex-1 mr-4">
                      <div className={`p-2 rounded-full ${!report.read ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 text-zinc-400'}`}>
                        <Bell className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm text-zinc-900 font-medium leading-relaxed">{report.message}</p>
                        <p className="text-[10px] text-zinc-400 mt-1">Enviado em: {format(new Date(report.created_at), 'dd/MM/yyyy HH:mm')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!report.read && (
                        <button
                          onClick={() => handleMarkReportRead(report.id)}
                          className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Marcar Lido
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteReport(report.id)}
                        className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir Relato"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        {activeTab === 'ranking' && (
          <div className="bg-white shadow overflow-hidden sm:rounded-md p-6">
            <h2 className="text-lg font-bold text-zinc-800 mb-6 flex items-center gap-2">
              🏆 Tenistas que Mais Jogam
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Posição</th>
                    <th className="px-6 py-3 bg-zinc-50 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Tenista</th>
                    <th className="px-6 py-3 bg-zinc-50 text-center text-xs font-medium text-zinc-500 uppercase tracking-wider">Agendamentos</th>
                    <th className="px-6 py-3 bg-zinc-50 text-center text-xs font-medium text-zinc-500 uppercase tracking-wider">Total de Horas</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-zinc-200">
                  {ranking.map((item, index) => (
                    <tr key={index} className={index < 3 ? "bg-emerald-50/30" : ""}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-900">
                        {index + 1}º
                        {index === 0 && " 🥇"}
                        {index === 1 && " 🥈"}
                        {index === 2 && " 🥉"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900">{item.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 text-center font-bold">{item.count}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 text-center">{item.hours.toFixed(2)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && isSystemAdmin && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 p-6">
              <h2 className="text-xl font-bold text-zinc-900 mb-6 flex items-center gap-2">
                <Settings className="w-6 h-6 text-emerald-600" />
                Configurações do Clube
              </h2>
              
              <div className="space-y-6">
                <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                  <h4 className="font-bold text-zinc-900 mb-3 flex items-center gap-2">
                    Visual do Clube
                  </h4>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-zinc-500 block mb-2">Nome do Clube</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={clubNameInput}
                            onChange={(e) => setClubNameInput(e.target.value)}
                            placeholder="Ex: Ferroviário Futebol Clube"
                            className="flex-grow text-xs border-zinc-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 px-3 py-2"
                          />
                          <button
                            onClick={handleUpdateSettings}
                            className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-sm"
                          >
                            Salvar Nome
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-zinc-500 block mb-2">Upload de Logo (PNG ou SVG)</label>
                        <div className="flex flex-col gap-3">
                          <p className="text-[10px] text-zinc-400 bg-zinc-100 p-2 rounded border border-zinc-200">
                            <strong>Dica:</strong> Se o upload falhar, verifique se o "Storage" está ativado no seu Console do Firebase. Caso contrário, o sistema usará uma versão interna automática (Base64).
                          </p>
                          <div className="relative group">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleLogoUpload}
                              disabled={uploadingLogo}
                              className="absolute inset-0 opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                            />
                            <div className={clsx(
                              "w-full py-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition-all",
                              "border-zinc-200 group-hover:border-emerald-500 group-hover:bg-emerald-50/50",
                              uploadingLogo && "opacity-50 bg-zinc-50"
                            )}>
                              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-full">
                                <Plus size={20} />
                              </div>
                              <div className="text-center">
                                <p className="text-xs font-bold text-zinc-700">
                                  {uploadingLogo ? 'Enviando...' : 'Clique para selecionar ou arraste'}
                                </p>
                                <p className="text-[10px] text-zinc-400">Máximo 2MB</p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="h-[1px] flex-grow bg-zinc-200"></div>
                            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">ou use uma URL</span>
                            <div className="h-[1px] flex-grow bg-zinc-200"></div>
                          </div>

                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={logoInput}
                              onChange={(e) => setLogoInput(e.target.value)}
                              placeholder="https://exemplo.com/logo.png"
                              className="flex-grow text-xs border-zinc-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 px-3 py-2"
                            />
                            <button
                              onClick={handleUpdateSettings}
                              className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-sm"
                            >
                              Salvar URL
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {logoInput && (
                        <div className="mt-4 p-4 bg-white border border-zinc-200 rounded-lg flex flex-col items-center gap-2 shadow-inner">
                          <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Pré-visualização</p>
                          <img src={logoInput} alt="Preview" className="h-16 object-contain" referrerPolicy="no-referrer" />
                        </div>
                      )}
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                  <div>
                    <h4 className="font-bold text-zinc-900">Exigir Parceiro Cadastrado</h4>
                    <p className="text-xs text-zinc-500 mt-1">
                      Se ativado, sócios só poderão agendar com outros sócios cadastrados no sistema.
                    </p>
                  </div>
                  <button
                    onClick={handleToggleRequirePartner}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      globalSettings?.requireRegisteredPartner ? 'bg-emerald-600' : 'bg-zinc-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        globalSettings?.requireRegisteredPartner ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                  <h4 className="font-bold text-red-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Zona de Perigo
                  </h4>
                  <p className="text-xs text-red-700 mt-1 mb-4">
                    Ações irreversíveis que afetam todos os dados do clube.
                  </p>
                  
                    <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => setIsResettingBookings(true)}
                      className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-all"
                    >
                      Limpar Agenda (Exceto Fixas)
                    </button>
                    <button
                      onClick={() => setIsResettingCredits(true)}
                      className="flex-1 px-4 py-3 bg-zinc-900 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-black transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      Forçar Reset de Créditos (Manual)
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-3 text-center">
                    Use o botão acima caso o reset automático de Domingo 12h não tenha funcionado.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        {(isSystemAdmin || profile?.canManageChampionships) && activeTab === 'championships' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-zinc-800">Gerenciar Campeonatos Internos</h2>
              <button
                onClick={() => setIsCreatingChampionship(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-sm"
              >
                <Plus className="w-5 h-5" />
                Novo Campeonato
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {championships.map(champ => (
                <div key={champ.id} className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden flex flex-col">
                  <div className="p-5 flex-grow">
                    <div className="flex justify-between items-start mb-3">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        champ.status === 'open' ? 'bg-emerald-100 text-emerald-700' :
                        champ.status === 'closed' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-700'
                      }`}>
                        {champ.status === 'open' ? 'Inscrições Abertas' :
                         champ.status === 'closed' ? 'Inscrições Encerradas' : 'Finalizado'}
                      </span>
                      <span className="text-xs font-medium text-zinc-500">
                        {champ.type === 'singles' ? 'Simples' : 'Duplas'}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-zinc-900 mb-2">{champ.title}</h3>
                    <p className="text-sm text-zinc-600 line-clamp-2 mb-4">{champ.description}</p>
                    
                    <div className="space-y-2 text-xs text-zinc-500">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-zinc-400" />
                        <span>Início Inscrição: {format(parseISO(champ.registrationStartDate), 'dd/MM/yyyy HH:mm')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span>Fim Inscrição: {format(parseISO(champ.registrationDeadline), 'dd/MM/yyyy HH:mm')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-zinc-400" />
                        <span>Torneio: {format(parseISO(champ.startDate), 'dd/MM/yyyy')} - {format(parseISO(champ.endDate), 'dd/MM/yyyy')}</span>
                      </div>
                      {champ.isDrawnPairs && (
                        <div className="flex items-center gap-2 text-emerald-600 font-bold">
                          <Users className="w-4 h-4" />
                          <span>Duplas Sorteadas</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex gap-2">
                    <select
                      value={champ.status}
                      onChange={(e) => handleUpdateChampionshipStatus(champ.id, e.target.value as any)}
                      className="flex-grow text-xs border-zinc-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 py-1.5"
                    >
                      <option value="open">Abrir Inscrições</option>
                      <option value="closed">Fechar Inscrições</option>
                      <option value="finished">Finalizar</option>
                    </select>
                    {championshipMatches.some(m => m.championshipId === champ.id) ? (
                      <button
                        onClick={() => setViewingBracket(champ.id)}
                        className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 border border-emerald-100"
                      >
                        Ver Chaves
                      </button>
                    ) : (
                      <button
                        onClick={() => handleGenerateBracketPreview(champ.id)}
                        className="px-3 py-1.5 text-xs font-bold text-zinc-700 bg-zinc-100 rounded-lg hover:bg-zinc-200 border border-zinc-200"
                      >
                        Gerar Chaves
                      </button>
                    )}
                    <button
                      onClick={() => setViewingRegistrants(champ.id)}
                      className="px-3 py-1.5 text-xs font-bold text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100 border border-violet-100 flex items-center gap-1 font-black uppercase tracking-wider"
                      title="Visualizar Inscritos"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Inscritos
                    </button>
                    <button
                      onClick={() => setViewingPayments(champ.id)}
                      className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 border border-blue-100 flex items-center gap-1"
                      title="Gerenciar Pagamentos"
                    >
                      <FileText className="w-4 h-4" />
                      Pagamentos
                    </button>
                    <button
                      onClick={() => handleDeleteChampionship(champ.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {championships.length === 0 && (
              <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-zinc-300">
                <Trophy className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                <p className="text-zinc-500">Nenhum campeonato criado ainda.</p>
              </div>
            )}
          </div>
        )}
      </main>

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
      />

      <Modal
        isOpen={editingBooking !== null}
        onClose={() => setEditingBooking(null)}
        title="Editar Agendamento"
        message="Ajuste os detalhes da aula ou reserva."
        type="info"
        onConfirm={handleUpdateBooking}
        confirmText="Salvar Alterações"
        cancelText="Cancelar"
      >
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Observação</label>
            <textarea 
              value={observationEdit}
              onChange={(e) => setObservationEdit(e.target.value)}
              placeholder="Ex: Aula termina às 10:15..."
              className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
              rows={4}
            />
          </div>
        </div>
      </Modal>

      {blockingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-zinc-100 my-8 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <h3 className="text-xl font-bold text-zinc-900 mb-4">Bloquear {blockingUser.fullName}</h3>
            <p className="text-sm text-zinc-600 mb-6">
              Selecione o período de bloqueio para este sócio. Durante este tempo, ele não poderá realizar novos agendamentos.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[1, 3, 7, 15, 30].map(days => (
                <button
                  key={days}
                  onClick={() => handleApplyPenalty(blockingUser.uid, days)}
                  className="px-4 py-3 text-sm font-bold text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-all border border-zinc-200"
                >
                  {days} {days === 1 ? 'dia' : 'dias'}
                  {days === 7 && <span className="block text-[10px] font-normal text-zinc-500 mt-0.5">(Regra No-Show)</span>}
                </button>
              ))}
            </div>
            <div className="mt-6">
              <button
                onClick={() => setBlockingUser(null)}
                className="w-full py-2 px-4 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-zinc-100 my-8 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <h3 className="text-xl font-bold text-zinc-900 mb-4">Editar Sócio</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Telefone</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setEditingUser(null)}
                  className="flex-1 py-2 px-4 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateUser}
                  className="flex-1 py-2 px-4 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreatingChampionship && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 border border-zinc-100 my-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-zinc-900">Novo Campeonato Interno</h3>
              <button onClick={() => setIsCreatingChampionship(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleCreateChampionship} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Título do Campeonato</label>
                <input
                  type="text"
                  required
                  value={newChampionship.title}
                  onChange={e => setNewChampionship(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Ex: Torneio de Verão 2024"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Descrição</label>
                <textarea
                  rows={3}
                  value={newChampionship.description}
                  onChange={e => setNewChampionship(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Regras, premiação, etc..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Tipo</label>
                  <select
                    value={newChampionship.type}
                    onChange={e => setNewChampionship(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="singles">Simples</option>
                    <option value="doubles">Duplas</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Máx. Participantes</label>
                  <input
                    type="number"
                    value={newChampionship.maxParticipants}
                    onChange={e => setNewChampionship(prev => ({ ...prev, maxParticipants: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Valor Inscrição (R$)</label>
                  <input
                    type="number"
                    value={newChampionship.registrationFee}
                    onChange={e => setNewChampionship(prev => ({ ...prev, registrationFee: parseFloat(e.target.value) }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Chave PIX para Pagamento</label>
                  <input
                    type="text"
                    value={newChampionship.pixKey}
                    onChange={e => setNewChampionship(prev => ({ ...prev, pixKey: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="E-mail, CPF, Celular ou Aleatória"
                  />
                </div>
              </div>

              {newChampionship.type === 'doubles' && (
                <label className="flex items-center gap-2 cursor-pointer bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                  <input
                    type="checkbox"
                    checked={newChampionship.isDrawnPairs}
                    onChange={e => setNewChampionship(prev => ({ ...prev, isDrawnPairs: e.target.checked }))}
                    className="w-4 h-4 text-emerald-600 border-zinc-300 rounded focus:ring-emerald-500"
                  />
                  <span className="text-sm font-medium text-zinc-700">Duplas Sorteadas (Inscrição Individual)</span>
                </label>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Início Inscrições</label>
                  <input
                    type="datetime-local"
                    required
                    value={newChampionship.registrationStartDate}
                    onChange={e => setNewChampionship(prev => ({ ...prev, registrationStartDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Fim Inscrições</label>
                  <input
                    type="datetime-local"
                    required
                    value={newChampionship.registrationDeadline}
                    onChange={e => setNewChampionship(prev => ({ ...prev, registrationDeadline: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Data Início</label>
                  <input
                    type="date"
                    required
                    value={newChampionship.startDate}
                    onChange={e => setNewChampionship(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Data Fim</label>
                  <input
                    type="date"
                    required
                    value={newChampionship.endDate}
                    onChange={e => setNewChampionship(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreatingChampionship(false)}
                  className="flex-1 py-3 px-4 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200"
                >
                  Criar Campeonato
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isResettingCredits && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-zinc-100 my-8 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <h3 className="text-xl font-bold text-zinc-900 mb-4">Resetar Todos os Créditos</h3>
            <p className="text-sm text-zinc-600 mb-6">
              Esta ação definirá os créditos de TODOS os sócios para 3. Digite a senha de segurança para continuar.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Senha de Segurança</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Digite a senha..."
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setIsResettingCredits(false); setResetPassword(''); }}
                  className="flex-1 py-2 px-4 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleResetCredits}
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700"
                >
                  Confirmar Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isResettingBookings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-zinc-100 my-8 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <h3 className="text-xl font-bold text-zinc-900 mb-4">Resetar Todos os Agendamentos</h3>
            <p className="text-sm text-zinc-600 mb-6">
              Esta ação removerá permanentemente todos os agendamentos do sistema. Digite a senha de segurança para continuar.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Senha de Segurança</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-red-500 focus:border-red-500"
                  placeholder="Digite a senha..."
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setIsResettingBookings(false); setResetPassword(''); }}
                  className="flex-1 py-2 px-4 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleResetBookings}
                  className="flex-1 py-2 px-4 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700"
                >
                  Confirmar Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingBracket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl p-8 border border-zinc-100 my-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-black text-zinc-900">
                  Chaves do Campeonato: {championships.find(c => c.id === viewingBracket)?.title}
                </h3>
                <p className="text-sm text-zinc-500 mt-1">Gerencie os placares e acompanhe o progresso do torneio.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleResetBracket(viewingBracket)}
                  className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-all"
                >
                  Resetar Chaves
                </button>
                <button onClick={() => setViewingBracket(null)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-8 h-8" />
                </button>
              </div>
            </div>

            <div className="flex gap-12 overflow-x-auto pb-8 min-h-[600px]">
              {Array.from({ length: Math.ceil(Math.log2(championshipRegistrations.filter(r => r.championshipId === viewingBracket).length)) }).map((_, roundIdx) => {
                const round = roundIdx + 1;
                const matchesInRound = championshipMatches
                  .filter(m => m.championshipId === viewingBracket && m.round === round)
                  .sort((a, b) => a.matchNumber - b.matchNumber);
                
                return (
                  <div key={round} className="flex flex-col gap-8 min-w-[250px]">
                    <h4 className="text-center font-black text-zinc-400 uppercase tracking-widest text-xs mb-4">
                      {round === 1 ? 'Primeira Rodada' : 
                       round === Math.ceil(Math.log2(championshipRegistrations.filter(r => r.championshipId === viewingBracket).length)) ? 'Final' : 
                       `Rodada ${round}`}
                    </h4>
                    <div className="flex flex-col justify-around flex-grow gap-8">
                      {matchesInRound.map(match => (
                        <div key={match.id} className="bg-zinc-50 border-2 border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                          <div className="p-3 border-b border-zinc-200 flex justify-between items-center bg-white">
                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Jogo {match.matchNumber + 1}</span>
                            {match.status === 'finished' && (
                              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-full">Finalizado</span>
                            )}
                          </div>
                          
                          <div className="p-4 space-y-4">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 flex-grow">
                                <input
                                  type="radio"
                                  name={`winner-${match.id}`}
                                  checked={match.winnerId === match.participant1Id && match.status === 'finished'}
                                  onChange={() => {
                                    const newMatches = [...championshipMatches];
                                    const idx = newMatches.findIndex(m => m.id === match.id);
                                    newMatches[idx].winnerId = match.participant1Id;
                                    setChampionshipMatches(newMatches);
                                  }}
                                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                                  disabled={match.status === 'finished' || !match.participant1Id || !match.participant2Id}
                                />
                                <span className={clsx(
                                  "text-sm font-bold truncate",
                                  match.winnerId === match.participant1Id && match.winnerId ? "text-emerald-600" : "text-zinc-700",
                                  !match.participant1Name && "text-zinc-300 italic"
                                )}>
                                  {match.participant1Name || 'Aguardando...'}
                                </span>
                              </div>
                              <input
                                type="text"
                                value={match.score1 || ''}
                                onChange={(e) => {
                                  const newMatches = [...championshipMatches];
                                  const idx = newMatches.findIndex(m => m.id === match.id);
                                  newMatches[idx].score1 = e.target.value;
                                  setChampionshipMatches(newMatches);
                                }}
                                className="w-20 h-10 text-center font-black text-zinc-900 bg-white border-2 border-zinc-200 rounded-xl focus:border-emerald-500 focus:ring-0"
                                placeholder="Placar"
                                disabled={!match.participant1Id || !match.participant2Id}
                              />
                            </div>
                            
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 flex-grow">
                                <input
                                  type="radio"
                                  name={`winner-${match.id}`}
                                  checked={match.winnerId === match.participant2Id && match.status === 'finished'}
                                  onChange={() => {
                                    const newMatches = [...championshipMatches];
                                    const idx = newMatches.findIndex(m => m.id === match.id);
                                    newMatches[idx].winnerId = match.participant2Id;
                                    setChampionshipMatches(newMatches);
                                  }}
                                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                                  disabled={match.status === 'finished' || !match.participant1Id || !match.participant2Id}
                                />
                                <span className={clsx(
                                  "text-sm font-bold truncate",
                                  match.winnerId === match.participant2Id && match.winnerId ? "text-emerald-600" : "text-zinc-700",
                                  !match.participant2Name && "text-zinc-300 italic"
                                )}>
                                  {match.participant2Name || 'Aguardando...'}
                                </span>
                              </div>
                              <input
                                type="text"
                                value={match.score2 || ''}
                                onChange={(e) => {
                                  const newMatches = [...championshipMatches];
                                  const idx = newMatches.findIndex(m => m.id === match.id);
                                  newMatches[idx].score2 = e.target.value;
                                  setChampionshipMatches(newMatches);
                                }}
                                className="w-20 h-10 text-center font-black text-zinc-900 bg-white border-2 border-zinc-200 rounded-xl focus:border-emerald-500 focus:ring-0"
                                placeholder="Placar"
                                disabled={!match.participant1Id || !match.participant2Id}
                              />
                            </div>

                            {match.participant1Id && match.participant2Id && match.status === 'pending' && (
                              <button
                                onClick={() => handleUpdateMatchScore(match, match.score1 || '0', match.score2 || '0', match.winnerId)}
                                className="w-full py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all mt-2"
                              >
                                Salvar Resultado
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'visitors' && (
        <div className="space-y-6">
          <div className="bg-zinc-900 rounded-3xl p-8 text-white shadow-xl shadow-zinc-200">
            <h2 className="text-2xl font-black uppercase tracking-tight">Não Sócios e Visitantes</h2>
            <p className="text-zinc-400 mt-1 font-medium">Controle os jogos agendados com visitantes e o status dos pagamentos de taxas (PIX).</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
              <span className="text-xs font-black text-zinc-400 uppercase tracking-widest block mb-1">Total de Agendamentos</span>
              <span className="text-4xl font-black text-zinc-900">
                {bookings.filter(b => b.isVisitorGame && b.status === 'confirmed').length}
              </span>
              <p className="text-xs text-zinc-500 mt-1">Jogos agendados usando a opção 'Visitante'</p>
            </div>
            
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
              <span className="text-xs font-black text-emerald-600 uppercase tracking-widest block mb-1">PIX Confirmados</span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-emerald-600">
                  {bookings.filter(b => b.isVisitorGame && b.visitorPixPaid && b.status === 'confirmed').length}
                </span>
                <span className="text-sm font-bold text-emerald-600">recebidos</span>
              </div>
              <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">Pagamentos validados e dados baixa</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
              <span className="text-xs font-black text-amber-600 uppercase tracking-widest block mb-1">PIX Pendentes</span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-amber-600">
                  {bookings.filter(b => b.isVisitorGame && !b.visitorPixPaid && b.status === 'confirmed').length}
                </span>
                <span className="text-sm font-bold text-amber-600">pendentes</span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">Necessitam confirmação de pagamento do sócio</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
            <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
              <h3 className="font-black text-zinc-900 uppercase tracking-tight">Lista de Visitantes</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Relatório detalhado para conferência financeira de convidados e visitantes.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-zinc-100 border-b border-zinc-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Sócio (Quem Agendou)</th>
                    <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Nome do Visitante</th>
                    <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Data / Horário</th>
                    <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Quadra</th>
                    <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest text-center">Status do PIX</th>
                    <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {bookings
                    .filter(b => b.isVisitorGame && b.status === 'confirmed')
                    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.startTime.localeCompare(a.startTime))
                    .map(b => (
                      <tr key={b.id} className="bg-white hover:bg-zinc-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-zinc-900">{b.userName}</div>
                          {b.userPhone && <div className="text-xs text-zinc-500 font-mono">{b.userPhone}</div>}
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-zinc-800">{b.visitorName || b.opponentName?.replace('Visitante: ', '') || 'Não informado'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-zinc-800">
                            {b.date ? format(parseISO(b.date), 'dd/MM/yyyy') : 'N/A'}
                          </div>
                          <div className="text-xs text-zinc-500 font-bold">{b.startTime} - {b.endTime}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={clsx(
                            "px-2.5 py-1 rounded-lg text-xs font-black uppercase",
                            b.courtId === 'court1' ? "bg-blue-50 text-blue-700" : "bg-teal-50 text-teal-700"
                          )}>
                            {b.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={clsx(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                            b.visitorPixPaid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                          )}>
                            {b.visitorPixPaid ? 'PIX Pago ✅' : 'PIX Pendente ⏳'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleUpdateVisitorPix(b.id, b.visitorPixPaid || false)}
                            className={clsx(
                              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md",
                              b.visitorPixPaid 
                                ? "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"
                                : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100"
                            )}
                          >
                            {b.visitorPixPaid ? 'Marcar como Pendente' : 'Confirmar Recebimento'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  {bookings.filter(b => b.isVisitorGame && b.status === 'confirmed').length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-zinc-500 italic">
                        Nenhum registro de jogo com visitante encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {viewingPayments && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-8 border border-zinc-100 my-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-black text-zinc-900">
                  Gestão de Pagamentos: {championships.find(c => c.id === viewingPayments)?.title}
                </h3>
                <p className="text-sm text-zinc-500 mt-1">Confirme os pagamentos e gere relatórios financeiros.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleGenerateFinancialReport(viewingPayments)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-sm"
                >
                  <Download className="w-5 h-5" />
                  Relatório Financeiro
                </button>
                <button onClick={() => setViewingPayments(null)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-8 h-8" />
                </button>
              </div>
            </div>

            <div className="bg-zinc-50 rounded-2xl border border-zinc-200 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-zinc-100 border-b border-zinc-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Inscrito(s)</th>
                    <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest text-center">Status</th>
                    <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {championshipRegistrations
                    .filter(r => r.championshipId === viewingPayments && !r.isDrawn)
                    .map(reg => (
                      <tr key={reg.id} className="bg-white hover:bg-zinc-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-zinc-900">
                            {reg.userName2 ? `${reg.userName1} / ${reg.userName2}` : reg.userName1}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={clsx(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                            reg.paymentStatus === 'paid' ? "bg-emerald-100 text-emerald-700" : 
                            reg.paymentStatus === 'informed' ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600"
                          )}>
                            {reg.paymentStatus === 'paid' ? 'Pago' : 
                             reg.paymentStatus === 'informed' ? 'Pagamento Informado' : 'Pendente'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {reg.paymentStatus !== 'paid' && (
                              <button
                                onClick={() => handleUpdatePaymentStatus(reg.id, 'paid')}
                                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all"
                              >
                                Confirmar OK
                              </button>
                            )}
                            {reg.paymentStatus === 'paid' && (
                              <button
                                onClick={() => handleUpdatePaymentStatus(reg.id, 'pending')}
                                className="px-4 py-2 bg-zinc-100 text-zinc-600 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-all"
                              >
                                Estornar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {championshipRegistrations.filter(r => r.championshipId === viewingPayments && !r.isDrawn).length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-zinc-500 italic">
                        Nenhuma inscrição encontrada para este campeonato.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {viewingRegistrants && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-8 border border-zinc-100 my-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">
                  Inscritos no Campeonato
                </h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Campeonato: <span className="font-bold text-zinc-800">{championships.find(c => c.id === viewingRegistrants)?.title}</span>
                </p>
              </div>
              <button onClick={() => setViewingRegistrants(null)} className="text-zinc-400 hover:text-zinc-650">
                <X className="w-8 h-8" />
              </button>
            </div>

            <div className="bg-zinc-50 rounded-2xl border border-zinc-200 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-zinc-100 border-b border-zinc-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Jogador 1 / Sócio</th>
                    <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest">Jogador 2 / Parceiro</th>
                    <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest text-center">Tipo</th>
                    <th className="px-6 py-4 text-xs font-black text-zinc-500 uppercase tracking-widest text-center">Data Inscrição</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {championshipRegistrations
                    .filter(r => r.championshipId === viewingRegistrants && !r.isDrawn && r.status !== 'cancelled')
                    .map(reg => (
                      <tr key={reg.id} className="bg-white hover:bg-zinc-50 transition-colors">
                        <td className="px-6 py-4 font-bold text-zinc-900">
                          {reg.userName1}
                        </td>
                        <td className="px-6 py-4 text-zinc-700 font-medium">
                          {reg.userName2 || <span className="text-zinc-400 italic font-normal">Nenhum (Individual)</span>}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-xs font-bold text-zinc-650 bg-zinc-100 px-2.5 py-1 rounded-md">
                            {reg.userName2 ? 'Dupla' : 'Simples'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-xs font-mono text-zinc-500">
                          {reg.created_at ? format(parseISO(reg.created_at), 'dd/MM/yyyy HH:mm') : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  {championshipRegistrations.filter(r => r.championshipId === viewingRegistrants && !r.isDrawn && r.status !== 'cancelled').length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-zinc-500 italic">
                        Nenhum inscrito confirmado neste campeonato ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setViewingRegistrants(null)}
                className="px-5 py-2.5 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {bracketSimulation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto w-full">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl p-8 border border-zinc-100 my-8 animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">
                  Simulação de Chaves do Campeonato
                </h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Confira como ficarão os confrontos iniciais antes de confirmar e salvar de fato.
                </p>
              </div>
              <button onClick={() => setBracketSimulation(null)} className="text-zinc-400 hover:text-zinc-605">
                <X className="w-8 h-8" />
              </button>
            </div>

            {bracketSimulation.drawnPairsToCreate.length > 0 && (
              <div className="mb-6 bg-zinc-50 p-5 rounded-2xl border border-zinc-200">
                <h4 className="font-bold text-sm text-zinc-800 uppercase tracking-wider mb-3 flex items-center gap-1.5 font-black">
                  <Users className="w-4 h-4 text-emerald-600" />
                  Duplas Sorteadas Simuladas
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {bracketSimulation.drawnPairsToCreate.map((reg, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-xl border border-zinc-200 text-xs shadow-xs font-medium text-zinc-700">
                      Dupla {idx + 1}: <span className="font-bold text-zinc-900">{reg.userName1}</span> e <span className="font-bold text-zinc-900">{reg.userName2 || 'Sem Sócio'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h4 className="font-bold text-sm text-zinc-800 uppercase tracking-wider flex items-center gap-1.5 font-black">
                <Trophy className="w-4 h-4 text-emerald-600" />
                Confrontos Iniciais (Rodada 1)
              </h4>
              <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {bracketSimulation.simulatedMatchesRound1.map((match, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-zinc-100 shadow-xs flex flex-col justify-center min-h-[90px]">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Jogo #{match.matchNumber + 1}</span>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center bg-zinc-50/50 p-2 rounded-lg">
                          <span className="font-bold text-xs text-zinc-805 truncate">{match.p1Name}</span>
                          <span className="text-[10px] font-bold text-zinc-400">P1</span>
                        </div>
                        <div className="text-[10px] font-black text-zinc-300 text-center uppercase tracking-widest">vs</div>
                        <div className="flex justify-between items-center bg-zinc-50/50 p-2 rounded-lg">
                          <span className="font-bold text-xs text-zinc-805 truncate">{match.p2Name}</span>
                          <span className="text-[10px] font-bold text-zinc-400">P2</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-zinc-100 flex justify-end gap-3 col-span-2">
              <button
                onClick={() => setBracketSimulation(null)}
                className="px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-750 rounded-xl text-xs font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmAndWriteBracket}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-100 flex items-center gap-1.5"
              >
                <CheckCircle className="w-4 h-4" />
                Confirmar Chaves Geradas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
