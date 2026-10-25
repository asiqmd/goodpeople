'use client';

import { useEffect, useRef, useState } from 'react';

// The browser's own QR reader (Chrome on Android has one), not in TypeScript's DOM types yet.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

const SCAN_EVERY_MS = 250;

/**
 * The front camera reading the QR code on an ID card. Shows nothing where the browser has no
 * QR reader or no camera may be used; the code can then be typed or read by a USB scanner.
 * The camera runs only while this is on screen.
 */
export function CardScanner({ onCode, label }: { onCode: (code: string) => void; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorClass })
      .BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: number | undefined;

    async function start(Reader: BarcodeDetectorClass) {
      if (!(await Reader.getSupportedFormats()).includes('qr_code')) return;
      const detector = new Reader({ formats: ['qr_code'] });
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      const element = video.current;
      if (stopped || !element) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      element.srcObject = stream;
      await element.play();
      setLive(true);
      const scan = async () => {
        if (stopped) return;
        const [found] = await detector.detect(element).catch(() => []);
        const code = found?.rawValue.trim();
        if (code) onCode(code);
        else timer = window.setTimeout(scan, SCAN_EVERY_MS);
      };
      void scan();
    }

    start(Detector).catch(() => setLive(false));
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, [onCode]);

  return (
    <div className={live ? 'space-y-3' : 'hidden'}>
      {/* Mirrored, as people expect of a camera facing them. */}
      <video
        ref={video}
        muted
        playsInline
        aria-label={label}
        className="aspect-video w-full -scale-x-100 rounded-3xl bg-slate-900 object-cover"
      />
      <p className="text-center text-xl text-slate-600">{label}</p>
    </div>
  );
}
