import { getSupabaseClient } from './db/supabase';
import { CitationAuditAgent } from './index';
import { SourceOfTruthNAP } from './types/nap';
import { CONFIG } from './config/env';
import { canExecuteWrite } from './writeback/rateLimiter';
import { decrypt } from './writeback/crypto';
import { encrypt } from './writeback/crypto';

class ReconnectRequiredError extends Error {}
async function accessToken(connection: { id: string; encrypted_tokens: string }, supabase: NonNullable<ReturnType<typeof getSupabaseClient>>): Promise<string> {
  const tokens = decrypt<{ access_token: string; refresh_token?: string; expires_at?: number }>(connection.encrypted_tokens);
  if (tokens.access_token && (!tokens.expires_at || tokens.expires_at > Date.now() + 60000)) return tokens.access_token;
  if (!tokens.refresh_token) throw new ReconnectRequiredError('Reconnect your Google account: no refresh token is available.');
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CONFIG.GOOGLE_OAUTH_CLIENT_ID, client_secret: CONFIG.GOOGLE_OAUTH_CLIENT_SECRET, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' }) });
  if (!response.ok) throw new ReconnectRequiredError('Reconnect your Google account: refresh token was revoked or rejected.');
  const refreshed = await response.json() as { access_token: string; expires_in?: number; refresh_token?: string };
  const updated = { ...tokens, ...refreshed, refresh_token: refreshed.refresh_token || tokens.refresh_token, expires_at: Date.now() + Math.max(0, (refreshed.expires_in || 3600) - 60) * 1000 };
  const { error } = await supabase.from('gbp_connections').update({ encrypted_tokens: encrypt(updated) }).eq('id', connection.id); if (error) throw error;
  return updated.access_token;
}

async function processWriteJob(supabase: NonNullable<ReturnType<typeof getSupabaseClient>>) {
  const { data: jobs, error } = await supabase.from('write_jobs').select('*').eq('status', 'PENDING').eq('directory', 'google_business').limit(1);
  if (error || !jobs?.length) return;
  const job = jobs[0]; if (!await canExecuteWrite(job.audit_report_ref, job.directory)) return;
  await supabase.from('write_jobs').update({ status: 'IN_PROGRESS', updated_at: new Date().toISOString() }).eq('id', job.id);
  try {
    const { data: report, error: reportError } = await supabase.from('dashboard_audit_reports').select('client_id').eq('id', job.audit_report_ref).single(); if (reportError) throw reportError;
    const { data: connection, error: connectionError } = await supabase.from('gbp_connections').select('*').eq('client_id', report.client_id).limit(1).single(); if (connectionError) throw new Error('GBP connection is required before writing.');
    const token = await accessToken(connection, supabase);
    const fieldMap: Record<string, string> = { phone: 'phoneNumbers', address: 'storefrontAddress', category: 'primaryCategory', website: 'websiteUri' };
    const apiField = fieldMap[job.field]; if (!apiField) throw new Error(`GBP does not support this field: ${job.field}`);
    const body: Record<string, unknown> = apiField === 'phoneNumbers' ? { phoneNumbers: { primaryPhone: job.proposed_value } } : { [apiField]: job.proposed_value };
    const response = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${connection.location_name}?updateMask=${apiField}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`GBP update failed: ${response.status}`);
    await supabase.from('write_jobs').update({ status: 'SUCCESS', updated_at: new Date().toISOString() }).eq('id', job.id);
    await supabase.from('writeback_audit_log').insert({ write_job_id: job.id, directory: job.directory, field: job.field, before_value: job.current_value, after_value: job.proposed_value, executed_by_system: CONFIG.INTERNAL_OPERATOR_NAME, outcome: 'SUCCESS' });
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const status = error instanceof ReconnectRequiredError ? 'NEEDS_USER_INPUT' : 'FAILED';
    await supabase.from('write_jobs').update({ status, error_message: errorMessage, updated_at: new Date().toISOString() }).eq('id', job.id);
    await supabase.from('writeback_audit_log').insert({ write_job_id: job.id, directory: job.directory, field: job.field, before_value: job.current_value, after_value: job.proposed_value, executed_by_system: CONFIG.INTERNAL_OPERATOR_NAME, outcome: status, error_message: errorMessage });
  }
}

async function startWorker() {
  console.log(`\n======================================================`);
  console.log(`☁️ Starting Citation Audit Agent Cloud Worker`);
  console.log(`📡 Cloud Mode: ${CONFIG.IS_CLOUD_MODE ? 'ENABLED (CDP / Browserless)' : 'LOCAL FALLBACK'}`);
  console.log(`======================================================\n`);

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn(`⚠️ Supabase credentials missing in env. Worker running in dry-run mode.`);
    return;
  }

  const agent = new CitationAuditAgent();

  while (true) {
    try {
      await processWriteJob(supabase);
      // 1. Poll for PENDING audit jobs in Supabase audit_jobs table
      const { data: jobs, error } = await supabase
        .from('audit_jobs')
        .select('*')
        .eq('status', 'PENDING')
        .limit(1);

      if (error) {
        console.error('Error fetching jobs from Supabase:', error.message);
      } else if (jobs && jobs.length > 0) {
        const job = jobs[0];
        console.log(`⚙️ Processing Job ID: ${job.id} for Clinic: ${job.business_name}`);

        // Update status to PROCESSING
        await supabase
          .from('audit_jobs')
          .update({ status: 'PROCESSING', started_at: new Date().toISOString() })
          .eq('id', job.id);

        try {
          const sourceNAP: SourceOfTruthNAP = {
            businessName: job.business_name,
            address: job.address,
            city: job.city || 'Bengaluru',
            pincode: job.pincode,
            phone: job.phone,
            category: job.category || 'Dental Clinic',
            website: job.website
          };

          // 2. Execute Audit
          const report = await agent.runAudit(sourceNAP);

          // 3. Store Results in Supabase
          const { error: resultError } = await supabase.from('audit_results').insert({
            job_id: job.id,
            business_name: job.business_name,
            score: report.auditScore,
            report_json: report,
            completed_at: new Date().toISOString()
          });
          if (resultError) throw new Error(`Failed to store audit result: ${resultError.message}`);

          // 4. Mark Job as COMPLETED
          const { error: completionError } = await supabase
            .from('audit_jobs')
            .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
            .eq('id', job.id);
          if (completionError) throw new Error(`Failed to complete audit job: ${completionError.message}`);

          console.log(`✅ Job ID ${job.id} COMPLETED. Score: ${report.auditScore}%\n`);
        } catch (error: any) {
          const errorMessage = error.message || String(error);
          console.error(`❌ Job ID ${job.id} FAILED: ${errorMessage}`);
          const { error: failureUpdateError } = await supabase
            .from('audit_jobs')
            .update({ status: 'FAILED', error_message: errorMessage, completed_at: new Date().toISOString() })
            .eq('id', job.id);
          if (failureUpdateError) console.error(`Unable to mark Job ID ${job.id} as FAILED: ${failureUpdateError.message}`);
        }
      }
    } catch (err: any) {
      console.error('Worker loop exception:', err.message);
    }

    // Wait before next poll iteration
    await new Promise((resolve) => setTimeout(resolve, CONFIG.POLL_INTERVAL_MS));
  }
}

if (require.main === module) {
  startWorker();
}
