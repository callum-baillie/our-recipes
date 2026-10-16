'use client';

import { ZXING_WASM_SHA256 } from 'barcode-detector/ponyfill';
import { Camera, CameraOff, Flashlight, FlashlightOff } from 'lucide-react';
import { useState, useRef } from 'react';
import { useZxing } from 'react-zxing';

import styles from '@/components/food-catalog-picker.module.css';

type ScannerProps = {
  onDetected: (barcode: string) => void;
  rapid?: boolean;
  onRapidChange?: (value: boolean) => void;
  disabled?: boolean;
};
export function BarcodeScanner({
  onDetected,
  rapid = false,
  onRapidChange,
  disabled = false,
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
        <p>Camera scanning needs a trusted HTTPS connection. Enter the barcode instead.</p>
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
            Rapid scan
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
      onStop={() => setActive(false)}
    />
  );
}

function ActiveBarcodeScanner({
  onDetected,
  rapid = false,
  onRapidChange,
  disabled = false,
  onStop,
}: ScannerProps & { onStop: () => void }) {
  const lastAccepted = useRef(-Infinity);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');
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
      lastAccepted.current = performance.now();
      if (!rapid) setPaused(true);
      navigator.vibrate?.(80);
      onDetected(result.rawValue);
    },
    onError(value) {
      setError(value instanceof Error ? value.message : 'The camera could not start.');
    },
  });

  return (
    <div className={styles.cameraPanel}>
      <div className={styles.videoFrame}>
        <video ref={ref} muted playsInline aria-label="Live barcode camera" />
        <span aria-hidden="true" className={styles.scanGuide} />
      </div>
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
            Rapid scan
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
          {error} Enter the barcode manually instead.
        </p>
      ) : null}
    </div>
  );
}
