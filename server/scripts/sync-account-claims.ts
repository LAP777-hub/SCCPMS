import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data, error } = await client.from('profiles').select('id,role,phone');
if (error) throw new Error(error.message);
let count = 0;
for (const profile of data || []) {
  const { data: { user }, error: userError } = await client.auth.admin.getUserById(profile.id);
  if (userError || !user) throw new Error('Unable to read an existing auth account.');
  if (user.app_metadata.clinic_role) continue;
  const { error: updateError } = await client.auth.admin.updateUserById(profile.id, { app_metadata: {
    ...user.app_metadata, clinic_role: profile.role, clinic_phone: profile.phone,
  } });
  if (updateError) throw new Error(updateError.message);
  count++;
}
console.log(`Initialized trusted clinic claims for ${count} existing accounts.`);
