type TelegramParams = { botToken: string; chatId: string; text: string };

type QueueItem = {
  params: TelegramParams;
  attempt: number;
  scheduledAt: number;
  resolve: () => void;
  reject: (err: unknown) => void;
};

const queue: QueueItem[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let isProcessing = false;

// Conservative limits
const GLOBAL_MIN_INTERVAL_MS = 300; // ~3 msgs/sec globally
const CHAT_MIN_INTERVAL_MS = 1000;  // 1 msg/sec per chat (safe)
const MAX_RETRY = 3;

let globalNextAllowedAt = 0;
const chatNextAllowedAt = new Map<string, number>();

function schedule() {
  if (timer) return;
  if (queue.length === 0) return;
  queue.sort((a, b) => a.scheduledAt - b.scheduledAt);
  const next = queue[0];
  const delay = Math.max(0, next.scheduledAt - Date.now());
  timer = setTimeout(() => {
    timer = null;
    void tick();
  }, delay);
}

async function tick() {
  if (isProcessing) return;
  if (queue.length === 0) return;
  isProcessing = true;
  try {
    queue.sort((a, b) => a.scheduledAt - b.scheduledAt);
    const now = Date.now();
    const item = queue[0];
    if (!item) return;

    const chatGate = chatNextAllowedAt.get(item.params.chatId) ?? 0;
    const releaseAt = Math.max(item.scheduledAt, globalNextAllowedAt, chatGate);

    if (now < releaseAt) {
      // Not ready yet; reschedule this item and run later
      item.scheduledAt = releaseAt;
      isProcessing = false;
      schedule();
      return;
    }

    // Ready to send: dequeue first
    queue.shift();
    const result = await doSend(item.params);

    if (result.ok) {
      const after = Date.now();
      globalNextAllowedAt = after + GLOBAL_MIN_INTERVAL_MS;
      chatNextAllowedAt.set(item.params.chatId, after + CHAT_MIN_INTERVAL_MS);
      item.resolve();
    } else if (typeof result.retryAfterSec === 'number') {
      // 429 backoff
      item.attempt += 1;
      if (item.attempt <= MAX_RETRY) {
        item.scheduledAt = Date.now() + result.retryAfterSec * 1000;
        queue.push(item);
      } else {
        item.reject(new Error(`Telegram rate limit exceeded. Gave up after ${MAX_RETRY} retries.`));
      }
    } else {
      // Other errors: simple exponential backoff
      item.attempt += 1;
      if (item.attempt <= MAX_RETRY) {
        const backoffMs = Math.min(10_000, 1000 * Math.pow(2, item.attempt - 1));
        item.scheduledAt = Date.now() + backoffMs;
        queue.push(item);
      } else {
        item.reject(new Error('Telegram send failed. Max retries reached.'));
      }
    }
  } finally {
    isProcessing = false;
    schedule();
  }
}

async function doSend(params: TelegramParams): Promise<{ ok: true } | { ok: false; retryAfterSec?: number }> {
  try {
    const { botToken, chatId, text } = params;
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (res.ok) return { ok: true };

    let info: any = undefined;
    try {
      info = await res.json();
    } catch {
      // ignore json parse error
    }

    if (res.status === 429) {
      const retry = info?.parameters?.retry_after;
      const retryAfterSec = typeof retry === 'number' ? retry : 1;
      return { ok: false, retryAfterSec };
    }

    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function sendTelegramMessage(params: TelegramParams): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const item: QueueItem = {
      params,
      attempt: 0,
      scheduledAt: Date.now(),
      resolve,
      reject,
    };
    queue.push(item);
    schedule();
  });
}

