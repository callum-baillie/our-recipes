'use client';

import { ZXING_WASM_SHA256 } from 'barcode-detector/ponyfill';
import { Camera, CameraOff, Flashlight, FlashlightOff } from 'lucide-react';
import { useState, useRef } from 'react';
import { useZxing } from 'react-zxing';
import { expandScannedBarcode } from '../../shared/retail-barcode';

import styles from '@/components/food-catalog-picker.module.css';

type ScannerProps = {
  onDetected: (barcode: string) => void;
  rapid?: boolean;
  onRapidChange?: (value: boolean) => void;
  disabled?: boolean;
  onSearchRequest?: () => void;
};
export function BarcodeScanner({
  onDetected,
  rapid = false,
  onRapidChange,
  disabled = false,
  onSearchRequest,
}: ScannerProps) {
  const [active, setActive] = useState(false);
  const [secure] = useState(
    () =>
      typeof window === 'undefined' ||
      (window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia)),
  );

  if (!secure)
    return (
      <div className={styles.cameraFallback} role="status">
        <CameraOff aria-hidden="true" />
        <p>Camera scanning needs a trusted HTTPS connection.</p>
        {onSearchRequest && (
          <button type="button" onClick={onSearchRequest}>
            Search / Enter barcode
          </button>
        )}
      </div>
    );

  if (!active)
    return (
      <div className={styles.cameraStart}>
        <Camera aria-hidden="true" />
        <div>
          <strong>Scan a barcode</strong>
          <p>The camera and barcode decoder start only when you ask.</p>
        </div>
        <button type="button" disabled={disabled} onClick={() => setActive(true)}>
          Start camera
        </button>
        {onRapidChange ? (
          <label className={styles.rapidToggle}>
            <input
              type="checkbox"
              checked={rapid}
              onChange={(event) => onRapidChange(event.target.checked)}
            />{' '}
            <span>
              Scan several items
              <small>
                Queue packages for review. Stock is added only after confirmation; expiry stays
                unknown.
              </small>
            </span>
          </label>
        ) : null}
      </div>
    );

  return (
    <ActiveBarcodeScanner
      onDetected={onDetected}
      rapid={rapid}
      onRapidChange={onRapidChange}
      disabled={disabled}
      onSearchRequest={onSearchRequest}
      onStop={() => setActive(false)}
    />
  );
}

function ActiveBarcodeScanner({
  onDetected,
  rapid = false,
  onRapidChange,
  disabled = false,
  onSearchRequest,
  onStop,
}: ScannerProps & { onStop: () => void }) {
  const lastAccepted = useRef(-Infinity);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [wasmUrl] = useState(() =>
    new URL(
      `/vendor/barcode/zxing_reader.wasm?v=${ZXING_WASM_SHA256}`,
      window.location.origin,
    ).toString(),
  );
  const { ref, torch } = useZxing({
    paused: paused || disabled,
    formats: ['retail_codes'],
    wasmUrl,
    trySkew: true,
    timeBetweenDecodingAttempts: 250,
    constraints: { video: { facingMode: { ideal: 'environment' } }, audio: false },
    onDecodeResult(result) {
      if (paused || disabled || performance.now() - lastAccepted.current < 1500) return;
      let barcode: string;
      try {
        barcode = expandScannedBarcode(result.rawValue, result.format);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Scan the barcode again.');
        return;
      }
      setError('');
      lastAccepted.current = performance.now();
      if (!rapid) setPaused(true);
      navigator.vibrate?.(80);
      onDetected(barcode);
    },
    onError(value) {
      const name = typeof value === 'object' && value !== null && 'name' in value ? value.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Permission denied. Allow camera access in your browser settings.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : value instanceof Error
              ? value.message
              : 'The camera could not start.',
      );
    },
  });

  return (
    <div className={styles.cameraPanel}>
      <div className={styles.videoFrame}>
        <video
          ref={ref}
          muted
          playsInline
          aria-label="Live barcode camera"
          onPlaying={() => {
            setReady(true);
            setError('');
          }}
        />
        <span aria-hidden="true" className={styles.scanGuide} />
      </div>
      {!error && (
        <p role="status">
          {ready
            ? paused
              ? 'Scan captured. Review it or scan another.'
              : 'Camera ready. Hold the barcode inside the frame.'
            : 'Starting camera… Allow camera access when asked.'}
        </p>
      )}
      <div className={styles.cameraActions}>
        {torch.isAvailable ? (
          <button type="button" onClick={() => (torch.isOn ? torch.off() : torch.on())}>
            {torch.isOn ? <FlashlightOff size={16} /> : <Flashlight size={16} />}
            {torch.isOn ? 'Turn light off' : 'Turn light on'}
          </button>
        ) : null}
        {onRapidChange ? (
          <label className={styles.rapidToggle}>
            <input
              type="checkbox"
              checked={rapid}
              disabled={disabled}
              onChange={(event) => {
                setPaused(false);
                lastAccepted.current = -Infinity;
                onRapidChange(event.target.checked);
              }}
            />{' '}
            <span>
              Scan several items
              <small>
                Queue packages for review. Stock is added only after confirmation; expiry stays
                unknown.
              </small>
            </span>
          </label>
        ) : null}
        <button type="button" onClick={onStop}>
          <CameraOff size={16} /> Stop camera
        </button>
        {paused ? (
          <button type="button" onClick={() => setPaused(false)}>
            <Camera size={16} /> Scan another
          </button>
        ) : null}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          Camera unavailable: {error} Retry camera access or enter the barcode manually.
          <button type="button" onClick={onStop}>
            Try camera again
          </button>
          {onSearchRequest && (
            <button type="button" onClick={onSearchRequest}>
              Search / Enter barcode
            </button>
          )}
        </p>
      ) : null}
    </div>
  );
}
