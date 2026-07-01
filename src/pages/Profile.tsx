import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Booking } from '../types';
import { format, parseISO, addDays, setHours, setMinutes, addMinutes, isAfter, subHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { User, Phone, Save, ArrowLeft, Smartphone, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, onSnapshot, updateDoc, setDoc, query, where, orderBy, getDocs, or, writeBatch, getDoc } from 'firebase/firestore';

export default function Profile() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);
  const [hasShared, setHasShared] = useState(false);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);

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
    confirmDisabled?: boolean
  ) => {
    setModal({ 
      isOpen: true, 
      title, 
      message, 
      type: 'confirm', 
      onConfirm,
      onCancel,
      confirmText,
      cancelText,
      children,
      confirmDisabled
    });
  };

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName || '');
      setPhone(profile.phone || '');
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) return;

    const fetchBookings = async () => {
      try {
        const q = query(
          collection(db, 'bookings'),
          or(
            where('userId', '==', profile.uid),
            where('partnerId', '==', profile.uid)
          ),
          orderBy('date', 'desc'),
          orderBy('startTime', 'desc')
        );
        const snap = await getDocs(q);
        setMyBookings(snap.docs.map(d => d.data() as Booking));
        setFirestoreError(null);
      } catch (error: any) {
        console.error('Error fetching user bookings:', error);
        handleFirestoreError(error, OperationType.LIST, 'bookings');
        setFirestoreError(`Erro no banco de dados: ${error.message}`);
      }
    };

    fetchBookings();

    const q = query(
      collection(db, 'bookings'),
      or(
        where('userId', '==', profile.uid),
        where('partnerId', '==', profile.uid)
      )
    );
    const unsub = onSnapshot(q, fetchBookings, (error) => {
      console.error('Error in user bookings snapshot:', error);
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    });

    return () => unsub();
  }, [profile?.uid]);

  const handleCancelBooking = async (booking: Booking) => {
    const isPartnerOfThisBooking = booking.partnerId === profile?.uid;
    if (booking.userId !== profile?.uid && !isPartnerOfThisBooking && profile?.role !== 'admin') return;
    
    const now = new Date();
    let isLate = false;
    if (!booking.isFixed && booking.date) {
      const [h, m] = booking.startTime.split(':').map(Number);
      const bookingDate = new Date(booking.date + 'T00:00:00');
      const bookingStart = setHours(setMinutes(bookingDate, m), h);
      const cancellationDeadline = subHours(bookingStart, 12);
      isLate = isAfter(now, cancellationDeadline);
    }

    const performCancellation = async () => {
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'bookings', booking.id), { status: 'cancelled' });

        // Refund credits if not late or if admin
        if (!isLate || profile?.role === 'admin') {
          if (!booking.isLastMinute) {
            // Refund owner
            const ownerRef = doc(db, 'users', booking.userId);
            const ownerSnap = await getDoc(ownerRef);
            if (ownerSnap.exists()) {
              const ownerData = ownerSnap.data();
              if (ownerData.role !== 'professor') {
                batch.update(ownerRef, { credits: (ownerData.credits || 0) + 1 });
              }
            }

            // Refund partner
            if (booking.partnerId) {
              const partnerRef = doc(db, 'users', booking.partnerId);
              const partnerSnap = await getDoc(partnerRef);
              if (partnerSnap.exists()) {
                const partnerData = partnerSnap.data();
                if (partnerData.role !== 'professor') {
                  batch.update(partnerRef, { credits: (partnerData.credits || 0) + 1 });
                }
              }
            }
          }
        }

        // Notificação de vaga liberada
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 2);

        const notifRef = doc(collection(db, 'slot_notifications'));
        batch.set(notifRef, {
          id: notifRef.id,
          userId: profile?.uid,
          courtId: booking.courtId,
          date: booking.date,
          startTime: booking.startTime,
          created_at: new Date().toISOString(),
          expiresAt: expiresAt.toISOString()
        });

        await batch.commit();
        showAlert("Sucesso", booking.isFixed ? "Aula fixa removida." : "Agendamento cancelado com sucesso.", 'success');
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
        "Voltar"
      );
      return;
    }
    
    const shareMessage = `🎾 TENNIS FFC - AVISO DE VAGA 🎾
Uma quadra acaba de ficar disponível e você pode agendar agora!
📍 Local: ${booking.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}
📅 Data: ${booking.isFixed ? 'Aula Fixa (Semanal)' : (booking.date ? format(parseISO(booking.date), 'dd/MM/yyyy') : 'N/A')}
⏰ Horário: ${booking.startTime}
👉 Agende agora pelo App: ${window.location.origin}
Corra, pois as vagas costumam ser preenchidas rapidamente!`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;

    setHasShared(false); // Reset share state

    if (profile?.role === 'admin' || profile?.role === 'professor') {
      showConfirm(
        "Cancelar Agendamento",
        booking.isFixed ? "Deseja realmente cancelar esta aula fixa permanentemente?" : "Deseja cancelar este agendamento? Os créditos serão devolvidos aos jogadores.",
        performCancellation,
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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), { fullName, phone });
      
      showAlert('Sucesso', 'Perfil atualizado com sucesso!', 'success');
    } catch (error) {
      console.error('Error updating profile:', error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`);
      showAlert('Erro', 'Não foi possível atualizar o perfil.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-zinc-500 hover:text-zinc-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
            <User className="w-6 h-6 text-emerald-600" />
            Meu Perfil
          </h1>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <div className="bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-zinc-900">Informações Pessoais</h3>
                <div className="mt-2 max-w-xl text-sm text-zinc-500">
                  <p>Atualize seu número de telefone para receber notificações via WhatsApp.</p>
                </div>
                <form className="mt-5" onSubmit={handleSaveProfile}>
                  <div className="mb-4">
                    <label htmlFor="name" className="block text-sm font-medium text-zinc-700">Nome Completo</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-4 w-4 text-zinc-400" />
                      </div>
                      <input
                        type="text"
                        name="name"
                        id="name"
                        className="focus:ring-emerald-500 focus:border-emerald-500 block w-full pl-10 sm:text-sm border-zinc-300 rounded-md"
                        placeholder="Seu nome completo"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label htmlFor="phone" className="block text-sm font-medium text-zinc-700">Telefone (WhatsApp)</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone className="h-4 w-4 text-zinc-400" />
                      </div>
                      <input
                        type="tel"
                        name="phone"
                        id="phone"
                        className="focus:ring-emerald-500 focus:border-emerald-500 block w-full pl-10 sm:text-sm border-zinc-300 rounded-md"
                        placeholder="(11) 99999-9999"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full flex justify-center items-center gap-2 py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-zinc-900 mb-4">Meus Agendamentos</h3>
                {myBookings.length === 0 ? (
                  <p className="text-sm text-zinc-500">Você ainda não possui agendamentos.</p>
                ) : (
                  <ul className="divide-y divide-zinc-200">
                    {myBookings.map(booking => (
                      <li key={booking.id} className="py-4 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-zinc-900 truncate">
                            {booking.isFixed
                              ? `Toda ${format(addDays(new Date(2024, 0, 7), booking.dayOfWeek || 0), 'EEEE', { locale: ptBR })}`
                              : format(parseISO(booking.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                          </p>
                          <p className="text-sm text-zinc-500 truncate">
                            Das {booking.startTime} às {booking.endTime} - {booking.courtId === 'court1' ? 'Quadra 1' : 'Quadra 2'}
                          </p>
                          <p className="text-xs text-zinc-400 mt-1 truncate">
                            Tipo: {booking.type === 'double' ? 'Duplas' : booking.type === 'lesson' ? 'Aula Fixa' : 'Simples'}
                            {booking.professorName && ` • Prof: ${booking.professorName}`}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' :
                            booking.status === 'cancelled' ? 'bg-zinc-100 text-zinc-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {booking.status === 'confirmed' ? 'Ativo' : booking.status === 'cancelled' ? 'Cancelado' : 'No-Show'}
                          </span>
                          {booking.status === 'confirmed' && (
                            <button
                              onClick={() => handleCancelBooking(booking)}
                              className="text-xs text-red-600 hover:text-red-800 font-medium bg-red-50 px-2 py-1 rounded-md"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
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
        children={modal.children}
        confirmDisabled={modal.confirmDisabled}
      />
    </div>
  );
}
