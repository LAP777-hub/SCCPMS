import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';

const environmentFile = fileURLToPath(new URL('../.env', import.meta.url));

function hiddenKey() {
  return new Promise((resolve, reject) => {
    let value = '';
    const input = process.stdin;
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    process.stdout.write('Live API key (hidden): ');
    const finish = () => {
      input.off('keypress', onKey);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\n');
    };
    const onKey = (text, key) => {
      if (key?.ctrl && key.name === 'c') { finish(); reject(new Error('cancelled')); }
      else if (key?.name === 'return' || key?.name === 'enter') { finish(); resolve(value.trim()); }
      else if (key?.name === 'backspace') value = value.slice(0, -1);
      else if (text && !/[\u0000-\u001f\u007f]/.test(text)) value += text;
    };
    input.on('keypress', onKey);
  });
}
async function ask(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(prompt)).trim(); } finally { rl.close(); }
}
function replaceSetting(content, name, value) {
  // JSON quoting is used for dotenv text, never interpolated into a shell command.
  const line = `${name}=${JSON.stringify(value)}`;
  const expression = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=.*$`, 'gm');
  return expression.test(content) ? content.replace(expression, () => line) : `${content.trimEnd()}\n${line}\n`;
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Run npm run sms:configure --prefix server in your own interactive terminal. Keys are entered without echo and never sent to chat.');
  process.exitCode = 1;
} else {
  try {
    const current = await readFile(environmentFile, 'utf8');
    console.log('Use a LIVE application at https://account.africastalking.com/apps. This setup makes a read-only credential check and sends no SMS.');
    const username = await ask('Live application username: ');
    if (!username || username.toLowerCase() === 'sandbox' || !/^[A-Za-z0-9_-]+$/.test(username)) throw new Error('invalid input');
    const apiKey = await hiddenKey();
    if (!apiKey || /[\r\n"\\]/.test(apiKey)) throw new Error('invalid input');
    const sender = await ask('Approved sender/long code (Enter for activated default route): ');
    if (sender && !/^[+A-Za-z0-9 _-]{1,32}$/.test(sender)) throw new Error('invalid input');
    const response = await fetch(`https://api.africastalking.com/version1/user?username=${encodeURIComponent(username)}`, {
      headers: { apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || typeof data?.UserData?.balance !== 'string') throw new Error('credentials rejected');
    let updated = replaceSetting(current, 'AFRICASTALKING_USERNAME', username);
    updated = replaceSetting(updated, 'AFRICASTALKING_API_KEY', apiKey);
    updated = replaceSetting(updated, 'AFRICASTALKING_SENDER_ID', sender);
    await writeFile(environmentFile, updated, { mode: 0o600 });
    console.log('Live credentials accepted and saved to ignored server/.env. Restart npm run dev, then request an OTP through your login. No SMS sent by this setup.');
    if (Number(data.UserData.balance.replace(/[^0-9.-]/g, '')) <= 0) console.log('The live account still needs funding before it can send SMS.');
  } catch {
    console.error('Live SMS setup did not complete. Check your application credentials and network, then retry. No SMS sent.');
    process.exitCode = 1;
  }
}
