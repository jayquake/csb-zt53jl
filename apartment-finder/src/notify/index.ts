/**
 * Notification channels.
 *
 * Everything goes through the `Notifier` interface so the delivery mechanism is
 * a config change rather than a code change. Three are implemented:
 *
 *  - whatsapp (Twilio) — the default. Costs roughly $0.005/message in Twilio
 *    fees plus Meta's per-template fee. At one digest a day that is cents a
 *    month.
 *  - telegram — free, no per-message cost, useful if the Twilio bill or the
 *    template approval process becomes annoying.
 *  - console — prints to stdout. Used by `--dry-run` and as the safe default
 *    when no credentials are configured.
 */

import { config } from '../config';
import { log } from '../logger';

export interface Notifier {
  readonly channel: string;
  send(message: string): Promise<void>;
}

class ConsoleNotifier implements Notifier {
  readonly channel = 'console';

  async send(message: string): Promise<void> {
    console.log('\n───── notification ─────\n' + message + '\n────────────────────────\n');
  }
}

class TwilioWhatsAppNotifier implements Notifier {
  readonly channel = 'whatsapp';

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
    private readonly to: string
  ) {}

  async send(message: string): Promise<void> {
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

    const body = new URLSearchParams({
      From: this.from.startsWith('whatsapp:') ? this.from : `whatsapp:${this.from}`,
      To: this.to.startsWith('whatsapp:') ? this.to : `whatsapp:${this.to}`,
      Body: message,
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // 63016 is Twilio's "outside the 24-hour session window, use a template"
      // error — by far the most likely failure for a scheduled morning message,
      // so name the fix rather than just echoing the code.
      const hint = detail.includes('63016')
        ? ' — the 24h WhatsApp session has expired. Either reply to the bot from your phone to reopen it, or configure an approved message template.'
        : '';
      throw new Error(`Twilio responded ${response.status}: ${detail}${hint}`);
    }
  }
}

class TelegramNotifier implements Notifier {
  readonly channel = 'telegram';

  constructor(
    private readonly botToken: string,
    private readonly chatId: string
  ) {}

  async send(message: string): Promise<void> {
    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        // The formatter emits WhatsApp-style *bold*, which Telegram's legacy
        // Markdown parser understands too.
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
        text: message,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Telegram responded ${response.status}: ${detail}`);
    }
  }
}

/**
 * Builds the configured notifiers. A channel whose credentials are missing is
 * skipped with a warning rather than throwing — a misconfigured WhatsApp
 * account should not stop the scan from running and recording its results.
 */
export function buildNotifiers(channels: string[] = config.notify.channels): Notifier[] {
  const notifiers: Notifier[] = [];

  for (const channel of channels) {
    switch (channel.trim().toLowerCase()) {
      case 'whatsapp': {
        const { accountSid, authToken, from, to } = config.notify.twilio;
        if (!accountSid || !authToken || !to) {
          log.warn('whatsapp channel requested but TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_TO are not all set — skipping');
          break;
        }
        notifiers.push(new TwilioWhatsAppNotifier(accountSid, authToken, from, to));
        break;
      }
      case 'telegram': {
        const { botToken, chatId } = config.notify.telegram;
        if (!botToken || !chatId) {
          log.warn('telegram channel requested but TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set — skipping');
          break;
        }
        notifiers.push(new TelegramNotifier(botToken, chatId));
        break;
      }
      case 'console':
        notifiers.push(new ConsoleNotifier());
        break;
      default:
        log.warn(`unknown notification channel: ${channel}`);
    }
  }

  if (notifiers.length === 0) {
    log.warn('no usable notification channel configured — falling back to console');
    notifiers.push(new ConsoleNotifier());
  }

  return notifiers;
}

export { ConsoleNotifier };
