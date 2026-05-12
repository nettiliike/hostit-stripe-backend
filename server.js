import express from "express";
import Stripe from "stripe";
import cors from "cors";

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

const prices = {
  "hostit-app-laite": "price_1TWEigP74prEchKVbgtrKxdu",
  "hostit-app-2-laitetta": "price_1TWF04P74prEchKVX8VIECbb"
};

app.get("/", (req, res) => {
  res.send("Hostit Stripe backend toimii.");
});

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { paketti } = req.body;
    const priceId = prices[paketti];

    if (!priceId) {
      return res.status(400).json({ error: "Virheellinen paketti" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
     success_url: "https://hostflo.netlify.app/success.html?session_id={CHECKOUT_SESSION_ID}",
cancel_url: "https://hostflo.netlify.app/myynti.html"
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
