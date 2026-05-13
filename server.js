const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: [
    'https://hostflo.netlify.app',
    'https://hostitfi.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5500'
  ]
}));

app.use(express.json());

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('VAROITUS: STRIPE_SECRET_KEY puuttuu Environment Variables -asetuksista.');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const BASE_PRICES = {
  'hostit-app': 'price_1TWUuAP74prEchKVyq2EHa3D',
  'hostit-software': 'price_1TWUuAP74prEchKVyq2EHa3D',
  'hostit-app-laite': 'price_1TWUv6P74prEchKV1gFzimWf',
  'hostit-app-2-laitetta': 'price_1TWUvWP74prEchKVaA66XhXw'
};

const BASE_NAMES = {
  'hostit-app': 'Hostit Software',
  'hostit-software': 'Hostit Software',
  'hostit-app-laite': 'Hostit App + laite',
  'hostit-app-2-laitetta': 'Hostit App + 2 laitetta'
};

const ADDON_PRICES = {
  button: 'price_1TWUwaP74prEchKVYp3RLMfd',
  leak: 'price_1TWUwaP74prEchKVYp3RLMfd',
  motion: 'price_1TWUwaP74prEchKVYp3RLMfd',
  wifiThermometer: 'price_1TWUwaP74prEchKVYp3RLMfd',
  smokeWireless: 'price_1TWUx6P74prEchKVTyGZAeI9',
  noise: 'price_1TWUxVP74prEchKVHVnKUCEJ'
};

function cleanQty(value) {
  const qty = Number(value || 0);
  if (!Number.isFinite(qty) || qty < 0) return 0;
  return Math.min(Math.floor(qty), 99);
}

app.get('/', (req, res) => {
  res.send('Hostit Stripe backend OK');
});

app.post('/create-checkout-session', async (req, res) => {
  try {
    const paketti = req.body.paketti || req.body.package || 'hostit-app-laite';
    const addons = req.body.addons || {};

    if (!BASE_PRICES[paketti]) {
      return res.status(400).json({ error: 'Tuntematon paketti: ' + paketti });
    }

    const line_items = [
      {
        price: BASE_PRICES[paketti],
        quantity: 1
      }
    ];

    Object.entries(ADDON_PRICES).forEach(([key, priceId]) => {
      const qty = cleanQty(addons[key]);
      if (qty > 0) {
        line_items.push({
          price: priceId,
          quantity: qty
        });
      }
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items,
      subscription_data: {
        metadata: {
          package: paketti,
          package_name: BASE_NAMES[paketti] || paketti,
          addons: JSON.stringify(addons)
        }
      },
      metadata: {
        package: paketti,
        package_name: BASE_NAMES[paketti] || paketti,
        addons: JSON.stringify(addons)
      },
      success_url: 'https://hostflo.netlify.app/kiitos.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://hostflo.netlify.app/myynti.html'
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe Checkout error:', error);
    res.status(500).json({ error: error.message || 'Stripe Checkoutin luonti epäonnistui.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Hostit Stripe backend käynnissä portissa ${PORT}`);
});
