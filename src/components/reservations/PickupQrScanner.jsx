import { useCallback, useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import jsQR from 'jsqr';
import { Camera } from 'lucide-react';

// Decodes frames from the device camera looking for the pickup pass QR the
// mobile app renders (`jezsy-pickup:<token>`). Runs entirely client-side --
// no image ever leaves the browser.
const SCAN_INTERVAL_MS = 350;

const PickupQrScanner = ({ onDecode }) => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const lastValueRef = useRef(null);
  const onDecodeRef = useRef(onDecode);
  const [cameraError, setCameraError] = useState(null);

  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  const scanFrame = useCallback(() => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    const canvas = canvasRef.current;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!canvas || !width || !height) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, width, height);

    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, width, height);
    } catch {
      return;
    }

    const code = jsQR(imageData.data, width, height, { inversionAttempts: 'attemptBoth' });
    if (code?.data && code.data !== lastValueRef.current) {
      lastValueRef.current = code.data;
      onDecodeRef.current(code.data);
      // A decoded value stays "seen" for a couple seconds so the same pass
      // held in front of the camera doesn't re-fire onDecode on every frame.
      setTimeout(() => {
        lastValueRef.current = null;
      }, 2000);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(scanFrame, SCAN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [scanFrame]);

  return (
    <div className="qr-scanner">
      {cameraError ? (
        <div className="qr-scanner-error">
          <Camera size={20} />
          <p>Could not access the camera: {cameraError}</p>
          <p className="text-secondary text-xs">Check that this browser has camera permission, or use manual entry instead.</p>
        </div>
      ) : (
        <div className="qr-scanner-viewport">
          <Webcam
            ref={webcamRef}
            audio={false}
            videoConstraints={{ facingMode: { ideal: 'environment' } }}
            onUserMedia={() => setCameraError(null)}
            onUserMediaError={(err) => setCameraError(err?.message || 'Permission denied')}
            className="qr-scanner-video"
          />
          <div className="qr-scanner-frame" aria-hidden="true" />
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default PickupQrScanner;
