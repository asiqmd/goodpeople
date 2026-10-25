'use client';

import {
  isWeakPin,
  KIOSK_IDLE_SECONDS,
  KIOSK_SESSION_SECONDS,
  type KioskDeviceView,
  type KioskMeView,
} from '@gp/shared';
import { useTranslations, useFormatter } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  endWorkerSession,
  requestPinCode,
  setKioskPin,
  signInWorker,
  type KioskReply,
} from '@/app/actions/kiosk';
import { CardScanner } from './card-scanner';
import { bigButton, bigInput, LanguageSwitch, Notice, PinPad } from './kiosk-controls';
import { WorkerScreen } from './worker-screen';

type Tone = 'red' | 'green' | 'amber';
type Message = { tone: Tone; text: string };
type Screen =
  | { name: 'idle'; message?: Message }
  | { name: 'pin'; code: string; message?: Message }
  | { name: 'newPin'; code: string }
  | { name: 'worker'; me: KioskMeView; endsAt: number };

/** The message for a refused kiosk call, in the worker's words. */
function useRefusal() {
  const t = useTranslations('kiosk');
  const router = useRouter();
  return useCallback(
    (reply: Extract<KioskReply<unknown>, { ok: false }>): string => {
      switch (reply.code) {
        case 'kiosk_unknown':
          router.refresh();
          return t('setup.problems.kiosk_unknown');
        case 'kiosk_sign_in_failed':
          return t('pin.wrong');
        case 'kiosk_locked':
          return t('pin.locked', { minutes: Math.ceil((reply.retryAfterSeconds ?? 900) / 60) });
        case 'kiosk_code_wrong':
          return t('newPin.wrongCode');
        case 'kiosk_session_ended':
          return t('ended');
        case 'kiosk_employee_inactive':
          return t('inactive');
        case 'too_many_attempts':
          return t('tooMany');
        case 'tenant_read_only':
          return t('readOnly');
        default:
          return t('failed');
      }
    },
    [router, t],
  );
}

/**
 * The kiosk: waiting for a card, then a PIN, then the worker's own screen. Anyone who stops
 * touching it for a minute is signed out, and so is a session that has run its course.
 */
export function KioskApp({ device }: { device: KioskDeviceView }) {
  const t = useTranslations('kiosk');
  const [screen, setScreen] = useState<Screen>({ name: 'idle' });
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastTouch = useRef(0);
  const payslipWindow = useRef<Window | null>(null);

  const signOut = useCallback(async (message?: Message) => {
    payslipWindow.current?.close();
    payslipWindow.current = null;
    setSecondsLeft(null);
    setScreen({ name: 'idle', message });
    await endWorkerSession();
  }, []);

  useEffect(() => {
    if (screen.name === 'idle') return;
    lastTouch.current = Date.now();
    const touched = () => {
      lastTouch.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    for (const event of events) window.addEventListener(event, touched, { passive: true });
    const timer = window.setInterval(() => {
      const left = KIOSK_IDLE_SECONDS - Math.floor((Date.now() - lastTouch.current) / 1000);
      if (screen.name === 'worker' && Date.now() >= screen.endsAt) {
        void signOut({ tone: 'amber', text: t('ended') });
      } else if (left <= 0) {
        void signOut();
      } else {
        setSecondsLeft(left <= 15 ? left : null);
      }
    }, 1000);
    return () => {
      for (const event of events) window.removeEventListener(event, touched);
      window.clearInterval(timer);
    };
  }, [screen, signOut, t]);

  const openPayslip = useCallback((url: string) => {
    payslipWindow.current?.close();
    payslipWindow.current = window.open(url, 'gp-kiosk-payslip');
  }, []);

  // Stable, so the camera is not restarted whenever this screen renders again.
  const cardRead = useCallback((code: string) => setScreen({ name: 'pin', code }), []);

  const signedIn = (me: KioskMeView) =>
    setScreen({ name: 'worker', me, endsAt: Date.now() + KIOSK_SESSION_SECONDS * 1000 });

  if (screen.name === 'worker') {
    return (
      <WorkerScreen
        me={screen.me}
        secondsLeft={secondsLeft}
        onRefreshed={(me) => setScreen({ ...screen, me })}
        onDone={() => void signOut()}
        onEnded={(text) => void signOut({ tone: 'amber', text })}
        onOpenPayslip={openPayslip}
        onSpeakUp={async () => {
          await signOut();
          window.location.assign(`/speak-up/${device.workspace.slug}?channel=kiosk`);
        }}
      />
    );
  }

  return (
    <main className="flex min-h-screen flex-col gap-8 p-10">
      <header className="flex items-center justify-between gap-6">
        <p className="text-xl text-slate-500">
          {device.workspace.name} · {device.kiosk.name}
        </p>
        <LanguageSwitch />
      </header>
      {screen.name === 'idle' && <IdleScreen message={screen.message} onCode={cardRead} />}
      {screen.name === 'pin' && (
        <PinScreen
          code={screen.code}
          message={screen.message}
          onBack={() => setScreen({ name: 'idle' })}
          onForgot={() => setScreen({ name: 'newPin', code: screen.code })}
          onSignedIn={signedIn}
        />
      )}
      {screen.name === 'newPin' && (
        <NewPinScreen
          code={screen.code}
          readOnly={device.readOnly}
          onBack={() => setScreen({ name: 'pin', code: screen.code })}
          onDone={() =>
            setScreen({
              name: 'pin',
              code: screen.code,
              message: { tone: 'green', text: t('newPin.done') },
            })
          }
        />
      )}
      {screen.name !== 'idle' && secondsLeft !== null && (
        <p className="text-center text-xl text-slate-500">
          {t('worker.signingOut', { seconds: secondsLeft })}
        </p>
      )}
    </main>
  );
}

function IdleScreen({ message, onCode }: { message?: Message; onCode: (code: string) => void }) {
  const t = useTranslations('kiosk.idle');
  const [code, setCode] = useState('');
  const submit = (value: string) => {
    if (value.trim()) onCode(value.trim());
  };

  // A USB card scanner types the code and Enter. Caught here without focusing the field, so
  // the tablet's on-screen keyboard does not cover the screen while it waits.
  useEffect(() => {
    const typed = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === 'Enter') submit(code);
      else if (event.key.length === 1) setCode((c) => c + event.key);
    };
    window.addEventListener('keydown', typed);
    return () => window.removeEventListener('keydown', typed);
  });

  return (
    <div className="grid flex-1 grid-cols-2 items-center gap-12">
      <section className="space-y-6">
        <h1 className="text-5xl font-bold leading-tight">{t('title')}</h1>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <CardScanner onCode={onCode} label={t('camera')} />
      </section>
      <form
        className="space-y-6 rounded-3xl bg-white p-8 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          submit(code);
        }}
      >
        <label className="block space-y-3">
          <span className="text-2xl font-medium">{t('code')}</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={t('placeholder')}
            className={`${bigInput} font-mono uppercase`}
          />
        </label>
        <button type="submit" disabled={!code.trim()} className={`${bigButton.primary} w-full`}>
          {t('next')}
        </button>
      </form>
    </div>
  );
}

function PinScreen({
  code,
  message,
  onBack,
  onForgot,
  onSignedIn,
}: {
  code: string;
  message?: Message;
  onBack: () => void;
  onForgot: () => void;
  onSignedIn: (me: KioskMeView) => void;
}) {
  const t = useTranslations('kiosk.pin');
  const refusal = useRefusal();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const submit = () =>
    start(async () => {
      const reply = await signInWorker(code, pin);
      if (reply.ok) return onSignedIn(reply.data);
      setPin('');
      setError(refusal(reply));
    });
  return (
    <div className="grid flex-1 grid-cols-2 items-center gap-12">
      <section className="space-y-6">
        <h1 className="text-5xl font-bold">{t('title')}</h1>
        <p className="font-mono text-3xl text-slate-600">{t('card', { code })}</p>
        {error ? (
          <Notice tone="red">{error}</Notice>
        ) : (
          message && <Notice tone={message.tone}>{message.text}</Notice>
        )}
        <div className="flex flex-wrap gap-4">
          <button type="button" onClick={onBack} className={bigButton.secondary}>
            {t('back')}
          </button>
          <button type="button" onClick={onForgot} className={bigButton.quiet}>
            {t('forgot')}
          </button>
        </div>
      </section>
      <PinPad
        value={pin}
        min={4}
        max={6}
        masked
        onChange={(value) => {
          setError(null);
          setPin(value);
        }}
        onSubmit={submit}
        submitLabel={t('ok')}
        busy={busy}
      />
    </div>
  );
}

type Step = 'send' | 'code' | 'choose' | 'confirm';

/** First time, or a forgotten PIN: a code by SMS, then a new PIN typed twice. */
function NewPinScreen({
  code,
  readOnly,
  onBack,
  onDone,
}: {
  code: string;
  readOnly: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('kiosk.newPin');
  const format = useFormatter();
  const refusal = useRefusal();
  const [step, setStep] = useState<Step>('send');
  const [sent, setSent] = useState<{ ending: string; minutes: number } | null>(null);
  const [smsCode, setSmsCode] = useState('');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, start] = useTransition();

  const send = () =>
    start(async () => {
      const reply = await requestPinCode(code);
      if (!reply.ok) return setMessage({ tone: 'red', text: refusal(reply) });
      setSent({ ending: reply.data.phoneEnding, minutes: reply.data.expiresInSeconds / 60 });
      setSmsCode('');
      setMessage(null);
      setStep('code');
    });

  const choose = () => {
    if (isWeakPin(pin)) {
      setPin('');
      return setMessage({ tone: 'red', text: t('weak') });
    }
    setMessage(null);
    setStep('confirm');
  };

  const confirm = () => {
    if (again !== pin) {
      setPin('');
      setAgain('');
      setStep('choose');
      return setMessage({ tone: 'red', text: t('mismatch') });
    }
    start(async () => {
      const reply = await setKioskPin(code, smsCode, pin);
      if (reply.ok) return onDone();
      setPin('');
      setAgain('');
      setMessage({ tone: 'red', text: refusal(reply) });
      setStep(reply.code === 'kiosk_code_wrong' ? 'send' : 'choose');
    });
  };

  const pad = {
    code: (
      <PinPad
        value={smsCode}
        max={6}
        masked={false}
        onChange={setSmsCode}
        onSubmit={() => setStep('choose')}
        submitLabel={t('next')}
        busy={busy}
      />
    ),
    choose: (
      <PinPad
        value={pin}
        min={4}
        max={6}
        masked
        onChange={setPin}
        onSubmit={choose}
        submitLabel={t('next')}
        busy={busy}
      />
    ),
    confirm: (
      <PinPad
        value={again}
        min={pin.length}
        max={pin.length}
        masked
        onChange={setAgain}
        onSubmit={confirm}
        submitLabel={t('save')}
        busy={busy}
      />
    ),
  };

  return (
    <div className="grid flex-1 grid-cols-2 items-center gap-12">
      <section className="space-y-6">
        <h1 className="text-5xl font-bold">{t('title')}</h1>
        <p className="font-mono text-3xl text-slate-600">{t('card', { code })}</p>
        <p className="text-2xl text-slate-700">
          {step === 'send'
            ? t('sendIntro')
            : step === 'code'
              ? t('sent', {
                  // "05" in the reader's digits, keeping the leading zero.
                  ending: sent!.ending.replace(/\d/g, (d) => format.number(Number(d))),
                  minutes: sent!.minutes,
                })
              : step === 'choose'
                ? t('choose')
                : t('confirm')}
        </p>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {readOnly && <Notice tone="amber">{t('readOnly')}</Notice>}
        <div className="flex flex-wrap gap-4">
          <button type="button" onClick={onBack} className={bigButton.secondary}>
            {t('back')}
          </button>
          {step === 'code' && (
            <button type="button" onClick={send} disabled={busy} className={bigButton.quiet}>
              {t('again')}
            </button>
          )}
        </div>
      </section>
      {step === 'send' ? (
        <button
          type="button"
          onClick={send}
          disabled={busy || readOnly}
          className={`${bigButton.primary} min-h-28 w-full text-3xl`}
        >
          {busy ? '…' : t('send')}
        </button>
      ) : (
        pad[step]
      )}
    </div>
  );
}
