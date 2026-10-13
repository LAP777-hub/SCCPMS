import 'dotenv/config';

// Read-only provider check: never sends SMS, prints a key, phone or OTP.
const username = process.env.AFRICASTALKING_USERNAME?.trim();
const apiKey = process.env.AFRICASTALKING_API_KEY?.trim();
const sandbox = username === 'sandbox';
console.log(`SMS mode: ${sandbox ? 'sandbox (simulator only)' : 'live'}`);
if (!username || !apiKey) {
  console.error('Set AFRICASTALKING_USERNAME and AFRICASTALKING_API_KEY in server/.env or hosting secrets.');
  process.exitCode = 1;
} else {
  try {
    const origin = sandbox ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
    const response = await fetch(`${origin}/version1/user?username=${encodeURIComponent(username)}`, {
      headers: { apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => null);
    const accepted = response.ok && typeof data?.UserData?.balance === 'string';
    console.log(`Provider credentials: ${accepted ? 'accepted' : `rejected (HTTP ${response.status})`}`);
    if (!accepted) process.exitCode = 1;
    if (accepted && !sandbox) {
      const funded = Number(data.UserData.balance.replace(/[^0-9.-]/g, '')) > 0;
      console.log(`Account funded: ${funded ? 'yes' : 'no'}`);
      if (!funded) process.exitCode = 1;
      console.log(`Sender override: ${process.env.AFRICASTALKING_SENDER_ID?.trim() ? 'configured; route approval must be confirmed' : 'none; provider default route must be activated'}`);
      console.log('This read-only check does not prove handset delivery. Verify an OTP using the application on an authorized phone.');
    }
    if (sandbox && (process.argv.includes('--live') || process.env.NODE_ENV === 'production')) {
      console.error('Real phones require a live application username/key and an activated, funded SMS route. Sandbox cannot deliver to a handset.');
      process.exitCode = 2;
    }
  } catch {
    console.error('Provider check unavailable: network error or timeout. No messages sent.');
    process.exitCode = 1;
  }
}
