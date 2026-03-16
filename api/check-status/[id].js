// api/check-status/[id].js
// Vercel Serverless Function — consulta status de uma venda no ImperiumPay
// Rota dinâmica: GET /api/check-status/12345

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Método não permitido' });
  }

  const { id } = req.query;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  try {
    const ipRes = await fetch(`https://api.imperiumpay.com.br/api/transactions/${id}`, {
      headers: {
        'X-Api-Public-Key':  process.env.IMPERIUM_PUBLIC_KEY,
        'X-Api-Private-Key': process.env.IMPERIUM_PRIVATE_KEY,
      },
    });

    const data = await ipRes.json();

    if (!ipRes.ok) {
      return res.status(ipRes.status).json({ message: data.message || 'Erro ao consultar' });
    }

    // Retorna apenas o status — o checkout.html espera: PAGO, PENDENTE, CANCELADO, RECUSADO, FALHA
    return res.status(200).json({ status: data.status || 'PENDENTE' });

  } catch (err) {
    console.error('[check-status] fetch error:', err);
    return res.status(500).json({ message: 'Erro interno.' });
  }
}
