import { Resend } from 'resend';

const MAX_MESSAGE_LENGTH = 4000;

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Método não permitido.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => null);
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!message) {
      return Response.json({ success: false, error: 'Mensagem vazia.' }, { status: 400 });
    }

    const apiKey    = process.env.RESEND_API_KEY;
    const adminEmail = process.env.ADMIN_EMAIL;

    if (!apiKey || !adminEmail) {
      console.error('[send-maintenance-report] RESEND_API_KEY ou ADMIN_EMAIL não configurados.');
      return Response.json({ success: false, error: 'Serviço de e-mail não configurado.' }, { status: 503 });
    }

    const resend = new Resend(apiKey);
    const fromAddress = process.env.RESEND_FROM_EMAIL || 'Tennis FFC <onboarding@resend.dev>';

    const { error } = await resend.emails.send({
      from: fromAddress,
      to:   adminEmail,
      subject: 'Novo relato de manutenção — Tennis FFC',
      text: message.slice(0, MAX_MESSAGE_LENGTH),
    });

    if (error) {
      console.error('[send-maintenance-report] Erro do Resend:', error);
      return Response.json({ success: false, error: 'Falha ao enviar e-mail.' }, { status: 502 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('[send-maintenance-report] Erro:', err);
    return Response.json({ success: false, error: 'Erro interno.' }, { status: 500 });
  }
};
