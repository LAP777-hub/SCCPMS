import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from './api';
import { requestMessage } from './dashboardTime';

export type AvailabilitySlot = {
  id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
};

export function useDoctorAvailability(doctorId: string, date: string, enabled = true) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    if (!enabled || !doctorId || !date) return;
    const sequence = ++request.current;
    setLoading(true);
    try {
      const { data } = await apiRequest<{ data: AvailabilitySlot[] }>(
        `/api/doctors/${encodeURIComponent(doctorId)}/availability?date=${encodeURIComponent(date)}`
      );
      if (mounted.current && sequence === request.current) {
        setSlots(data.filter(slot => new Date(slot.starts_at).getTime() > Date.now()));
        setError('');
      }
    } catch (error) {
      if (mounted.current && sequence === request.current) {
        setSlots([]);
        setError(requestMessage(error, 'Unable to load available times.'));
      }
    } finally {
      if (mounted.current && sequence === request.current) setLoading(false);
    }
  }, [doctorId, date, enabled]);

  useEffect(() => {
    mounted.current = true;
    request.current += 1;
    setSlots([]);
    setError('');
    setLoading(false);
    void refresh();
    const update = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const interval = window.setInterval(update, 15000);
    let changedTimer: number | undefined;
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string; path?: string }>).detail;
      if (
        detail?.table &&
        ![
          'doctor_availability_slots',
          'appointments',
          'doctor_leave_requests',
          'clinic_settings',
          'clinic_holidays',
          'clinic_doctors',
        ].includes(detail.table)
      )
        return;
      if (
        detail?.path &&
        !/^\/api\/(availability-slots|appointments|leave-requests|clinic\/settings|clinic\/holidays|doctors)(\/|$)/.test(
          detail.path
        )
      )
        return;
      window.clearTimeout(changedTimer);
      changedTimer = window.setTimeout(update, 250);
    };
    window.addEventListener('focus', update);
    window.addEventListener('clinic:data-changed', onChanged);
    document.addEventListener('visibilitychange', update);
    return () => {
      mounted.current = false;
      request.current += 1;
      window.clearInterval(interval);
      window.clearTimeout(changedTimer);
      window.removeEventListener('focus', update);
      window.removeEventListener('clinic:data-changed', onChanged);
      document.removeEventListener('visibilitychange', update);
    };
  }, [refresh]);

  return { slots, loading, error, refresh };
}
