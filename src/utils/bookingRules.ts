import { isAfter, isBefore, setHours, setMinutes, startOfWeek, addDays, isSameDay } from 'date-fns';

export const getBookingLimit = (_now: Date = new Date()) => {
  // Nova regra: Limite fixo de 3 reservas ativas por semana
  return 3;
};

export const isBookingOpen = (date: Date, now: Date = new Date()) => {
  // O ciclo de agendamento é sempre de Domingo 12:00 até o próximo Domingo 11:59.
  // Não se pode agendar para a "próxima semana" antes do meio-dia de domingo.
  
  const cycleStart = getPreviousSunday12PM(now);
  const cycleEnd = addDays(cycleStart, 7);
  
  // O slot 'date' deve estar dentro deste ciclo de 7 dias
  return (isAfter(date, cycleStart) || isSameDay(date, cycleStart)) && isBefore(date, cycleEnd);
};

export const getAvailableSlots = (date: Date) => {
  const day = date.getDay();
  const baseSlots = [
    "07:00", "08:15", "09:30", "10:45", "12:00", "13:15", "14:30", "15:45", 
    "17:00", "18:15", "19:30", "20:45"
  ];

  let slots = baseSlots;

  // Manutenção: Segunda-feira das 08h às 10h
  if (day === 1) {
    slots = slots.filter(s => {
      const [h, m] = s.split(':').map(Number);
      const timeInMinutes = h * 60 + m;
      return timeInMinutes < 480 || timeInMinutes >= 600;
    });
  }

  // Sextas-feiras das 17:00 às 19:30: Duplas Abertas (Open Play)
  // O Dashboard renderiza um bloco especial nesses horários, por isso não filtramos mais aqui para que eles apareçam
  if (day >= 1 && day <= 5) {
    return slots;
  } else {
    return slots.filter(s => {
      const [h] = s.split(':').map(Number);
      return h <= 17;
    });
  }
};

export const isFridayOpenPlay = (date: Date, startTime: string) => {
  const day = date.getDay();
  const [h, m] = startTime.split(':').map(Number);
  // Sextas entre 17:00 e 19:30 (slots 17:00 e 18:15)
  return day === 5 && (
    (h === 17) || 
    (h === 18)
  );
};

export const isDoublesOnly = (date: Date, startTime: string) => {
  // Mantemos a lógica de duplas se necessário, mas a regra de sexta agora é Open Play (bloqueado)
  return false; 
};

export const calculateEndTime = (start: string) => {
  const [h, m] = start.split(':').map(Number);
  let endM = m + 15;
  let endH = h + 1;
  
  if (endM >= 60) {
    endM -= 60;
    endH += 1;
  }
  
  return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
};

export const getPreviousSunday12PM = (now: Date = new Date()) => {
  let sun = startOfWeek(now, { weekStartsOn: 0 }); // This week's Sunday
  sun = setHours(setMinutes(sun, 0), 12);
  
  if (isBefore(now, sun)) {
    // If it's before this Sunday 12pm, the previous one was 7 days ago
    sun = addDays(sun, -7);
  }
  return sun;
};
