/**
 * Utility for tracking user activity and triggering a callback after a period of inactivity.
 */

export function createInactivityTracker(onInactivity, timeoutMs = 5 * 60 * 1000) {
    let timeoutId;

    const resetTimer = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            onInactivity();
        }, timeoutMs);
    };

    const handleActivity = () => {
        resetTimer();
    };

    const start = () => {
        window.addEventListener('mousemove', handleActivity);
        window.addEventListener('keydown', handleActivity);
        window.addEventListener('touchstart', handleActivity);
        window.addEventListener('scroll', handleActivity);
        resetTimer();
    };

    const stop = () => {
        window.removeEventListener('mousemove', handleActivity);
        window.removeEventListener('keydown', handleActivity);
        window.removeEventListener('touchstart', handleActivity);
        window.removeEventListener('scroll', handleActivity);
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    };

    return {
        start,
        stop,
        reset: resetTimer
    };
}
