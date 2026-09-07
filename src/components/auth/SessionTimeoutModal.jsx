import { Clock, AlertCircle } from 'lucide-react';
import './SessionTimeoutModal.css';

const formatTime = (seconds) => {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const SessionTimeoutModal = ({
  isOpen,
  mode = 'idle',
  countdownSeconds = 60,
  onStayLoggedIn,
  onSignOut,
}) => {
  if (!isOpen) return null;

  const isIdle = mode === 'idle';
  const title = isIdle ? "You've been inactive for a while" : "You've been away — still there?";
  const message = isIdle
    ? 'For your security, your session will expire soon due to inactivity. Would you like to stay signed in?'
    : 'Your tab was in the background. Please confirm that you want to keep your session active.';

  return (
    <div
      className="session-timeout-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
    >
      <div className="session-timeout-card">
        <div className="session-timeout-icon-wrap">
          {isIdle ? <Clock size={28} /> : <AlertCircle size={28} />}
        </div>

        <h2 id="session-timeout-title" className="session-timeout-title">
          {title}
        </h2>

        <p className="session-timeout-message">{message}</p>

        <div className="session-timeout-countdown">
          <span>Auto sign-out in</span>
          <strong>{formatTime(countdownSeconds)}</strong>
        </div>

        <div className="session-timeout-actions">
          <button
            type="button"
            className="session-timeout-btn-stay"
            onClick={onStayLoggedIn}
          >
            Stay logged in
          </button>
          {onSignOut && (
            <button
              type="button"
              className="session-timeout-btn-logout"
              onClick={onSignOut}
            >
              Sign out now
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SessionTimeoutModal;
