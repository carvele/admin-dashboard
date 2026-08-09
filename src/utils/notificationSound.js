/**
 * notificationSound.js
 * Provides Web Audio API synthesized alert sounds and browser notification wrappers.
 */

// We use Web Audio API so we don't need external audio files
let audioContext = null;

const initAudio = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
};

/**
 * Play a high-priority dual-tone chime (e.g. for new reservations)
 */
export const playReservationAlert = () => {
  try {
    initAudio();
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    osc2.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.15); // E5

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.0);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(audioContext.destination);

    osc1.start(audioContext.currentTime);
    osc2.start(audioContext.currentTime + 0.15);
    
    osc1.stop(audioContext.currentTime + 1.0);
    osc2.stop(audioContext.currentTime + 1.15);
  } catch (err) {
    console.warn('Audio playback failed:', err);
  }
};

/**
 * Play a soft pop tone (e.g. for incoming customer chat messages)
 */
export const playMessageAlert = () => {
  try {
    initAudio();
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);

    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.2);
  } catch (err) {
    console.warn('Audio playback failed:', err);
  }
};

/**
 * Request Web Notification permissions
 */
export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    return false;
  }
  
  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

/**
 * Show a desktop push notification
 */
export const showDesktopNotification = (title, options = {}) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  new Notification(title, {
    icon: '/favicon.ico',
    ...options
  });
};
