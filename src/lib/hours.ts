import { isWithinInterval, setHours, setMinutes, getDay, parse } from 'date-fns';

export type Turno = 'MANHA_TARDE' | 'TARDE_NOITE' | 'SABADO' | 'DOMINGO' | 'FECHADO';

/**
 * Define em qual turno o horário atual se encaixa com base nas regras do PRD:
 * Seg-Sex: 08:00-15:30 e 15:30-23:00
 * Sab: 18:00-23:00
 * Dom: 18:00-23:00
 */
export function getTurnoAtual(date: Date = new Date()): Turno {
  const diaSemana = getDay(date); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

  const currentHour = date.getHours();
  const currentMinute = date.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  // Seg-Sex (1-5)
  if (diaSemana >= 1 && diaSemana <= 5) {
    // 08:00 às 15:30
    if (currentTime >= 8 * 60 && currentTime < 15 * 60 + 30) {
      return 'MANHA_TARDE';
    }
    // 15:30 às 23:00
    if (currentTime >= 15 * 60 + 30 && currentTime < 23 * 60) {
      return 'TARDE_NOITE';
    }
  }

  // Sábado (6)
  if (diaSemana === 6) {
    // 18:00 às 23:00
    if (currentTime >= 18 * 60 && currentTime < 23 * 60) {
      return 'SABADO';
    }
  }

  // Domingo (0)
  if (diaSemana === 0) {
    // 18:00 às 23:00
    if (currentTime >= 18 * 60 && currentTime < 23 * 60) {
      return 'DOMINGO';
    }
  }

  return 'FECHADO';
}

/**
 * Verifica se o sistema está aberto para atendimento agora.
 */
export function isOperational(date: Date = new Date()): boolean {
  return getTurnoAtual(date) !== 'FECHADO';
}
