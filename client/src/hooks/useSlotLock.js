import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { toast } from 'sonner';

export function useSlotLock() {
  const [lockedSlot, setLockedSlot] = useState(null); // { resourceId, date, startTime, endTime }
  const [lockValue, setLockValue] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const timerRef = useRef(null);

  // Generate or restore persistent unique session token for locks
  const getSessionToken = useCallback(() => {
    let token = sessionStorage.getItem('booking_lock_session');
    if (!token) {
      token = 'sess_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();
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

  // Acquire lock on a slot
  const acquireSlotLock = useCallback(async (resourceId, date, startTime) => {
    try {
      const session = getSessionToken();

      // Release previous lock if any
      if (lockedSlot && lockValue) {
        await api.delete('/slots/lock', {
          data: {
            resourceId: lockedSlot.resourceId,
            date: lockedSlot.date,
            startTime: lockedSlot.startTime,
            lockValue,
          },
        }).catch(() => {});
      }

      const res = await api.post('/slots/lock', {
        resourceId,
        date,
        startTime,
        lockValue: session,
      });

      if (res.data.success) {
        setLockedSlot({
          resourceId,
          date,
          startTime,
          endTime: res.data.endTime,
        });
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

        toast.success(`Slot reserved for 10 minutes.`);
        return { success: true, slot: res.data };
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'This slot is no longer available';
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
