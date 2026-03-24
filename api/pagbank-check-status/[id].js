// api/check-status/[id].js
// Vercel Serverless Function — consulta status de um pedido no PagBank
// Rota dinâmica: GET /api/check-status/ORDE_xxxx-xxxx

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Método não permitido' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string' || id.trim() === '') {
    return res.status(400).json({ message: 'ID inválido' });
  }

  try {
    const pbRes = await fetch(`https://sandbox.api.pagseguro.com/orders/${id}`, {
      headers: {
        'Authorization': `Bearer ${process.env.PAGBANK_TOKEN}`,
      },
    });

    const data = await pbRes.json();

    if (!pbRes.ok) {
      return res.status(pbRes.status).json({ message: data.error_messages?.[0]?.description || 'Erro ao consultar' });
    }

    // ── Mapeia status PagBank → status esperado pelo checkout.html ──
    // Prioridade: verifica se existe cobrança (charge) criada pelo Pix pago
    const charge = data.charges?.[0];
    let status = 'PENDENTE';

    if (charge) {
      const cs = (charge.status || '').toUpperCase();
      if (cs === 'PAID')                   status = 'PAGO';
      else if (cs === 'DECLINED')          status = 'RECUSADO';
      else if (cs === 'CANCELED')          status = 'CANCELADO';
      else if (cs === 'IN_ANALYSIS')       status = 'PENDENTE';
      else                                 status = 'PENDENTE';
    } else {
      // Sem charge ainda — verifica QR code
      const qrStatus = (data.qr_codes?.[0]?.status || '').toUpperCase();
      if (qrStatus === 'INACTIVE')         status = 'CANCELADO'; // expirou sem pagamento
      else                                 status = 'PENDENTE';
    }

    return res.status(200).json({ status });

  } catch (err) {
    console.error('[check-status] fetch error:', err);
    return res.status(500).json({ message: 'Erro interno.' });
  }
}
