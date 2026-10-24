import { createSign } from 'node:crypto';
import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../../config.js';

// The ways a message leaves the API. Each channel has a `log` driver, which only records the
// message (development and tests), and a real one chosen in the environment.

export interface SendResult {
  /** The provider's id for the message, when it gives one. */
  providerRef?: string;
}

/** A failure the sender says is not worth retrying (bad address, unregistered device). */
export class PermanentSendError extends Error {}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface SmsMessage {
  /** E.164, e.g. +8801712345678. */
  to: string;
  text: string;
  /** Our id for the message, sent to providers that accept one. */
  reference: string;
}

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface Sender<M> {
  readonly driver: string;
  send(message: M): Promise<SendResult>;
}

/** Keeps the last messages in memory and logs them; tests read `sent`. */
export class LogSender<M> implements Sender<M> {
  readonly driver = 'log';
  readonly sent: M[] = [];
  private readonly logger: Logger;

  constructor(channel: string) {
    this.logger = new Logger(`${channel}:log`);
  }

  async send(message: M): Promise<SendResult> {
    this.sent.push(message);
    if (this.sent.length > 200) this.sent.shift();
    this.logger.log(JSON.stringify(message));
    return {};
  }
}

// ── Email ────────────────────────────────────────────────────────────────────

export class SmtpSender implements Sender<EmailMessage> {
  readonly driver = 'smtp';
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const info = await this.transport.sendMail({ from: this.from, ...message });
      return { providerRef: info.messageId };
    } catch (error) {
      const code = (error as { responseCode?: number }).responseCode;
      // 5xx from the server: the address or message is refused, not a passing fault.
      if (code && code >= 500 && code < 600) throw new PermanentSendError((error as Error).message);
      throw error;
    }
  }
}

// ── SMS ──────────────────────────────────────────────────────────────────────

/**
 * SSL Wireless SMS Plus, a common Bangladeshi gateway (API v3). Check field names against the
 * account's current API document before go-live; other gateways (Alpha SMS, BulkSMSBD) fit
 * the same Sender interface.
 */
export class SslWirelessSender implements Sender<SmsMessage> {
  readonly driver = 'sslwireless';

  constructor(
    private readonly url: string,
    private readonly apiToken: string,
    private readonly sid: string,
  ) {}

  async send(message: SmsMessage): Promise<SendResult> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        api_token: this.apiToken,
        sid: this.sid,
        msisdn: message.to.replace(/^\+/, ''),
        sms: message.text,
        csms_id: message.reference.replace(/-/g, '').slice(0, 20),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => ({}))) as {
      status?: string;
      error_message?: string;
      smsinfo?: { reference_id?: string }[];
    };
    if (!response.ok || body.status !== 'SUCCESS') {
      const reason = body.error_message || `HTTP ${response.status}`;
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new PermanentSendError(reason);
      }
      throw new Error(reason);
    }
    return { providerRef: body.smsinfo?.[0]?.reference_id };
  }
}

// ── Push ─────────────────────────────────────────────────────────────────────

const encodeJwtPart = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');

/** Firebase Cloud Messaging HTTP v1, signed in with a service account. Android and iOS. */
export class FcmSender implements Sender<PushMessage> {
  readonly driver = 'fcm';
  private token: { value: string; expiresAt: number } | undefined;

  constructor(
    private readonly projectId: string,
    private readonly clientEmail: string,
    private readonly privateKey: string,
  ) {}

  async send(message: PushMessage): Promise<SendResult> {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await this.accessToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: message.token,
            notification: { title: message.title, body: message.body },
            data: message.data,
            android: { priority: 'high' },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const body = (await response.json().catch(() => ({}))) as {
      name?: string;
      error?: { status?: string; message?: string };
    };
    if (!response.ok) {
      const status = body.error?.status;
      const reason = body.error?.message ?? `HTTP ${response.status}`;
      // The app was uninstalled or the token rotated: forget this device.
      if (status === 'NOT_FOUND' || status === 'UNREGISTERED' || status === 'INVALID_ARGUMENT') {
        throw new PermanentSendError(reason);
      }
      throw new Error(reason);
    }
    return { providerRef: body.name };
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encodeJwtPart({ alg: 'RS256', typ: 'JWT' })}.${encodeJwtPart({
      iss: this.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(this.privateKey, 'base64url');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!response.ok || !body.access_token) throw new Error('FCM sign-in failed');
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
    return this.token.value;
  }
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
export const SMS_SENDER = Symbol('SMS_SENDER');
export const PUSH_SENDER = Symbol('PUSH_SENDER');

export function createSenders(config: AppConfig) {
  return {
    email:
      config.EMAIL_DRIVER === 'smtp'
        ? new SmtpSender(config.SMTP_URL!, config.EMAIL_FROM)
        : new LogSender<EmailMessage>('email'),
    sms:
      config.SMS_DRIVER === 'sslwireless'
        ? new SslWirelessSender(
            config.SSLWIRELESS_URL,
            config.SSLWIRELESS_API_TOKEN!,
            config.SSLWIRELESS_SID!,
          )
        : new LogSender<SmsMessage>('sms'),
    push:
      config.PUSH_DRIVER === 'fcm'
        ? new FcmSender(
            config.FCM_PROJECT_ID!,
            config.FCM_CLIENT_EMAIL!,
            config.FCM_PRIVATE_KEY!.replace(/\\n/g, '\n'),
          )
        : new LogSender<PushMessage>('push'),
  };
}
