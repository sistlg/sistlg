/**
 * Utilitários para comunicação com a API do Telegram.
 */

export async function sendTelegramMessage(token: string, chatId: number, text: string, replyMarkup?: any) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    }),
  });

  return response.json();
}

/**
 * Configura o Webhook de um bot.
 */
export async function setWebhook(token: string, url: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${url}`);
  return response.json();
}
