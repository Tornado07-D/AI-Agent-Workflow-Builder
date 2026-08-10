import { Request, Response } from 'express';

export default async function eventNotify(req: Request, res: Response) {
  // Validate Nhost webhook secret to ensure this is an authentic Hasura event trigger
  if (req.headers['nhost-webhook-secret'] !== process.env.NHOST_WEBHOOK_SECRET) {
    return res.status(401).send('Unauthorized');
  }

  const payload = req.body;
  const newRow = payload.event?.data?.new;
  
  if (newRow) {
    // Stub for Slack/Email alert execution as required by the assignment
    console.log(`[NOTIFY] Sending ${newRow.channel} alert to org ${newRow.org_id}: ${newRow.message}`);
  }

  return res.status(200).send('Notification processed');
}
