import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { toast } from 'sonner';

export function useSlotLock() {
  const [lockedSlot, setLockedSlot] = useState(null); // { resourceId, date, startTime, endTime, durationMinutes, slotCount, slotTimes }
  const [lockValue, setLockValue] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const timerRef = useRef(null);

  // Generate or restore persistent unique session token for locks
  const getSessionToken = useCallback(() => {
    let token = sessionStorage.getItem('booking_lock_session');
    if (!token) {
      token = 'sess_' + (typeof window !== 'undefined' && window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36));
      sessionStorage.setItem('booking_lock_session', token);
    }
    return token;
  }, []);

  // Clear countdown interval
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Acquire lock on a slot or continuous multi-slot duration
  const acquireSlotLock = useCallback(async (resourceId, date, startTime, durationMinutes = 60, endTime = null) => {
    try {
      const session = getSessionToken();

      // Release previous lock if any (non-blocking in background)
      if (lockedSlot && lockValue) {
        api.delete('/slots/lock', {
          data: {
            resourceId: lockedSlot.resourceId,
            date: lockedSlot.date,
            startTime: lockedSlot.startTime,
            endTime: lockedSlot.endTime,
            durationMinutes: lockedSlot.durationMinutes,
            lockValue,
          },
        }).catch(() => {});
      }

      const res = await api.post('/slots/lock', {
        resourceId,
        date,
        startTime,
        endTime,
        durationMinutes,
        lockValue: session,
      });

      if (res.data.success) {
        const slotData = {
          resourceId,
          date,
          startTime,
          endTime: res.data.endTime,
          durationMinutes: res.data.durationMinutes || durationMinutes,
          slotCount: res.data.slotCount || 1,
          slotTimes: res.data.slotTimes || [startTime],
        };
        setLockedSlot(slotData);
        setLockValue(session);
        setSecondsRemaining(res.data.expiresInSeconds || 600);

        // Start countdown
        clearTimer();
        timerRef.current = setInterval(() => {
          setSecondsRemaining((prev) => {
            if (prev <= 1) {
              clearTimer();
              setLockedSlot(null);
              toast.error('Slot reservation expired. Please pick another slot.');
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        const durationHours = slotData.durationMinutes / 60;
        const hourLabel = durationHours > 1 ? `${durationHours} hours` : '1 hour';
        toast.success(`Reserved ${hourLabel} for 10 minutes.`);
        return { success: true, slot: slotData };
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Selected slot is no longer available';
      toast.error(msg);
      return { success: false, error: msg };
    }
  }, [lockedSlot, lockValue, getSessionToken, clearTimer]);

  // Release lock voluntarily (e.g. user changes mind or cancels)
  const releaseCurrentLock = useCallback(async () => {
    if (!lockedSlot || !lockValue) return;

    try {
      await api.delete('/slots/lock', {
        data: {
          resourceId: lockedSlot.resourceId,
          date: lockedSlot.date,
          startTime: lockedSlot.startTime,
          endTime: lockedSlot.endTime,
          durationMinutes: lockedSlot.durationMinutes,
          lockValue,
        },
      });
    } catch {
      // Best effort
    } finally {
      clearTimer();
      setLockedSlot(null);
      setLockValue(null);
      setSecondsRemaining(0);
    }
  }, [lockedSlot, lockValue, clearTimer]);

  // Reset without calling API (e.g. after successful confirmed checkout)
  const resetLockLocally = useCallback(() => {
    clearTimer();
    setLockedSlot(null);
    setLockValue(null);
    setSecondsRemaining(0);
  }, [clearTimer]);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  // Format seconds to mm:ss
  const formattedTime = `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}`;

  return {
    lockedSlot,
    lockValue,
    secondsRemaining,
    formattedTime,
    isExpired: secondsRemaining === 0 && lockedSlot !== null,
    acquireSlotLock,
    releaseCurrentLock,
    resetLockLocally,
  };
}
