import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import JSZip from 'jszip';

const FIRESTORE_DATABASE_ID = 'ai-studio-38b3ce98-6f9b-4ef9-8fb0-2a38a9805d01';

const COLLECTIONS = [
  'users',
  'bookings',
  'championships',
  'rankings',
  'maintenance_reports',
  'admin_alerts',
  'settings',
];

function getAdminApp() {
  const projectId  = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Credenciais do Firebase Admin ausentes (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).');
  }

  return getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export default async (req: Request) => {
  try {
    const app = getAdminApp();

    // Verify Firebase ID token
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return Response.json({ success: false, error: 'Não autenticado.' }, { status: 401 });
    }

    const decoded = await getAuth(app).verifyIdToken(token).catch(() => null);
    if (!decoded) {
      return Response.json({ success: false, error: 'Token inválido ou expirado.' }, { status: 401 });
    }

    // Verify admin role in Firestore
    const db = getFirestore(app, FIRESTORE_DATABASE_ID);
    const requesterSnap = await db.collection('users').doc(decoded.uid).get();
    if (requesterSnap.data()?.role !== 'admin') {
      return Response.json({ success: false, error: 'Acesso restrito a administradores.' }, { status: 403 });
    }

    // Export all collections as JSON files inside a zip
    const zip = new JSZip();
    for (const name of COLLECTIONS) {
      const snap = await db.collection(name).get();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      zip.file(`${name}.json`, JSON.stringify(docs, null, 2));
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const stamp  = new Date().toISOString().slice(0, 10);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="backup-tennis-ffc-${stamp}.zip"`,
      },
    });
  } catch (err) {
    console.error('[export] Erro:', err);
    return Response.json({ success: false, error: 'Erro ao gerar backup.' }, { status: 500 });
  }
};
