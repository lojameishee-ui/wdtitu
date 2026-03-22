// api/create-pix.js
// Vercel Serverless Function — cria cobrança PIX no ImperiumPay

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido' });
  }

  const { guia, customer, address, utm } = req.body;

  // ── Catálogo de produtos (valor em centavos) ──────────────────
  const products = {
    TIRAR:       { title: 'Título de Eleitor — Primeira Via',  amount: 3684 },
    REGULARIZAR: { title: 'Título de Eleitor — Regularização', amount: 3684 },
  };
  const prod = products[(guia || 'TIRAR').toUpperCase()] || products.TIRAR;

  // ── Extrai estado do campo "Cidade / UF" ─────────────────────
  const cityRaw  = address?.city || '';
  const parts    = cityRaw.split('/');
  const cityName = parts[0].trim();
  const stateUF  = (parts[1] || '').trim().toUpperCase().slice(0, 2);

  // ── Monta shipping apenas se tiver CEP e estado válido ────────
  const hasShipping = address?.cep && stateUF.length === 2;
  const shipping = hasShipping ? {
    street:       address.street       || '',
    streetNumber: address.number       || '',
    complement:   address.complement   || '',
    zipCode:      address.cep,
    neighborhood: address.neighborhood || '',
    city:         cityName             || '',
    state:        stateUF,
    country:      'br',
  } : undefined;

  // ── Monta body ────────────────────────────────────────────────
  const body = {
    amount:        prod.amount,
    paymentMethod: 'PIX',
    customer: {
      name:  customer.name,
      email: customer.email,
      phone: customer.phone,
      document: {
        type:   'cpf',
        number: customer.cpf,
      },
    },
    items: [
      {
        title:     prod.title,
        unitPrice: prod.amount,
        quantity:  1,
        tangible:  false,
      },
    ],
    ...(shipping ? { shipping } : {}),
    ...(process.env.POSTBACK_URL ? { postbackUrl: process.env.POSTBACK_URL } : {}),
    ...(utm?.utmSource   ? { utmSource:   utm.utmSource   } : {}),
    ...(utm?.utmMedium   ? { utmMedium:   utm.utmMedium   } : {}),
    ...(utm?.utmCampaign ? { utmCampaign: utm.utmCampaign } : {}),
    ...(utm?.src         ? { src:         utm.src         } : {}),
    ...(utm?.sck         ? { sck:         utm.sck         } : {}),
    metadata: {
      guia:   guia               || '',
      mother: customer.mother    || '',
      birth:  customer.birthdate || '',
    },
  };

  // ── Chama ImperiumPay ─────────────────────────────────────────
  try {
    const ipRes = await fetch('https://api.imperiumpay.com.br/api/sales', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'X-Api-Public-Key':  process.env.IMPERIUM_PUBLIC_KEY,
        'X-Api-Private-Key': process.env.IMPERIUM_PRIVATE_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await ipRes.json();

    if (!ipRes.ok) {
      console.error('[create-pix] ImperiumPay error:', JSON.stringify(data));
      return res.status(400).json({ message: data.message || 'Erro ao gerar PIX' });
    }

    const pix = data.sale?.payment?.pix;
    if (!pix?.key) {
      return res.status(500).json({ message: 'PIX não retornado pelo gateway' });
    }

    return res.status(200).json({
      saleId: String(data.sale.id),
      pix: {
        key:          pix.key,
        qrCodeBase64: pix.qrCodeBase64,
      },
    });

  } catch (err) {
    console.error('[create-pix] fetch error:', err);
    return res.status(500).json({ message: 'Erro interno. Tente novamente.' });
  }
}
