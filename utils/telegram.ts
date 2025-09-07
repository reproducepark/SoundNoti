export async function sendTelegramMessage(params: { botToken: string; chatId: string; text: string }) {
  const { botToken, chatId, text } = params;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    let info: any;
    try {
      info = await res.json();
    } catch {
      // ignore
    }
    throw new Error(`Telegram API error: ${res.status} ${info?.description ?? ''}`);
  }
}


