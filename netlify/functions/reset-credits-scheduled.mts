import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Must match firebase-applet-config.json — this project uses a non-default Firestore database.
const FIRESTORE_DATABASE_ID = 'ai-studio-38b3ce98-6f9b-4ef9-8fb0-2a38a9805d01';

// America/Sao_Paulo has been fixed at UTC-3 with no DST since Brazil abolished DST in 2019.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 400; // Firestore batch limit is 500; stay well under it

function getDb() {
  const projectId  = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Credenciais do Firebase Admin ausentes (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).');
  }

  const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore(app, FIRESTORE_DATABASE_ID);
}

/**
 * Most recent UTC instant <= `now` that corresponds to "Sunday at brtHour:brtMinute" in Brazil time.
 * Brazil (América/São_Paulo) is fixed UTC-3 with no DST since 2019.
 */
function lastBrtSundayMilestone(now: Date, brtHour: number, brtMinute = 0): Date {
  const wallClock = new Date(now.getTime() - BRT_OFFSET_MS);
  const milestoneWall = new Date(Date.UTC(
    wallClock.getUTCFullYear(),
    wallClock.getUTCMonth(),
    wallClock.getUTCDate() - wallClock.getUTCDay(), // rewind to this BRT-Sunday
    brtHour, brtMinute, 0, 0,
  ));
  const milestoneUtc = new Date(milestoneWall.getTime() + BRT_OFFSET_MS);
  // If that milestone is still in the future, use last week's
  return milestoneUtc > now ? new Date(milestoneUtc.getTime() - WEEK_MS) : milestoneUtc;
}

export default async (_req: Request) => {
  try {
    const db = getDb();
    const now = new Date();

    // Weekly credit cycle (Brazil time):
    //   Sunday 11:00 BRT → zero out all user credits (= 0)
    //   Sunday 11:15 BRT → refill all user credits (= 3)
    //   Admins and professors are always set to 99 (unlimited) and excluded from the cycle.
    const zeroMilestone   = lastBrtSundayMilestone(now, 11,  0); // domingo 11:00 BRT
    const refillMilestone = lastBrtSundayMilestone(now, 11, 15); // domingo 11:15 BRT

    // Whichever milestone is more recent is the one currently in effect
    const [targetMilestone, targetAmount] =
      refillMilestone > zeroMilestone ? [refillMilestone, 3] : [zeroMilestone, 0];

    const settingsRef = db.collection('settings').doc('club_profile');
    const nowIso = now.toISOString();

    // Atomic claim: only one invocation can advance lastCreditsReset past this milestone.
    // Concurrent or retried invocations see the updated value and skip immediately.
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(settingsRef);
      const lastResetStr = snap.exists
        ? (snap.data()?.lastCreditsReset ?? '1970-01-01T00:00:00Z')
        : '1970-01-01T00:00:00Z';

      if (!(new Date(lastResetStr) < targetMilestone)) return false;

      tx.set(settingsRef, { lastCreditsReset: targetMilestone.toISOString(), updated_at: nowIso }, { merge: true });
      return true;
    });

    if (!claimed) {
      return Response.json({ success: true, skipped: true, targetMilestone: targetMilestone.toISOString() });
    }

    // Apply credit reset to all users in chunks to stay within Firestore batch limits
    const usersSnap = await db.collection('users').get();
    let resetCount = 0;
    let unlimitedCount = 0;

    for (let i = 0; i < usersSnap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const userDoc of usersSnap.docs.slice(i, i + BATCH_SIZE)) {
        const data = userDoc.data();
        if (data.role === 'professor' || data.role === 'admin') {
          // Admins/professors are unlimited — only touch if out of sync
          if (data.credits !== 99) {
            batch.update(userDoc.ref, { credits: 99, updated_at: nowIso });
          }
          unlimitedCount++;
        } else {
          batch.update(userDoc.ref, { credits: targetAmount, updated_at: nowIso });
          resetCount++;
        }
      }
      await batch.commit();
    }

    console.log(
      `[reset-credits] Marco ${targetMilestone.toISOString()} aplicado ` +
      `(créditos=${targetAmount}): ${resetCount} usuários resetados, ${unlimitedCount} ilimitados ignorados.`
    );

    return Response.json({
      success: true,
      skipped: false,
      targetMilestone: targetMilestone.toISOString(),
      targetAmount,
      resetCount,
      unlimitedCount,
    });
  } catch (err) {
    console.error('[reset-credits] Erro:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

// Runs every 5 minutes so transitions happen within 5 minutes of the target time.
// The atomic Firestore claim ensures each milestone is applied exactly once.
export const config = { schedule: '*/5 * * * *' };
