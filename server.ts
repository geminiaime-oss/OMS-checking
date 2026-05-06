import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

// --- SUPABASE CONFIGURATION ---
// These should be set in your Environment Variables (Settings -> Secrets)
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "";
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

async function startServer() {
  console.log("------------------------------------------");
  console.log("APP STARTING AT:", new Date().toISOString());
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("CWD:", process.cwd());
  console.log("Files in CWD:", fs.readdirSync(process.cwd()));
  console.log("PORT ENV:", process.env.PORT);
  console.log("------------------------------------------");

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Webhook for WordPress/WooCommerce
  app.post("/api/webhook/order", async (req, res) => {
    const orderData = req.body;
    
    // Normalize Data
    const phone = (orderData.billing?.phone || orderData.phone || "").replace(/\D/g, '');
    const status = orderData.status || 'unknown';
    const email = orderData.billing?.email || "";
    const name = `${orderData.billing?.first_name || ""} ${orderData.billing?.last_name || ""}`.trim();

    if (!phone) {
      return res.status(400).json({ error: "No phone number found" });
    }

    console.log(`[Webhook] Processing order for ${phone} (Status: ${status})`);

    if (supabase) {
      try {
        const { error } = await supabase
          .from('orders')
          .insert([
            { 
              phone: phone, 
              status: status, 
              customer_name: name,
              customer_email: email,
              internal_note: orderData.customer_note || "",
              source: "WooCommerce Webhook"
            }
          ]);
        
        if (error) throw error;
        res.status(200).json({ success: true, message: "Saved to Supabase" });
      } catch (err) {
        console.error("Supabase Storage Error:", err.message);
        res.status(500).json({ error: "Failed to save to Supabase" });
      }
    } else {
      console.warn("Supabase not configured. Data not saved permanently.");
      res.status(200).json({ success: true, warning: "Local mode only" });
    }
  });

  // API to search in Supabase
  app.get("/api/internal-check/:phone", async (req, res) => {
    const { phone } = req.params;
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (!supabase) {
      return res.json({ total: 0, success: 0, failed: 0, message: "Internal DB not connected" });
    }

    try {
      // Query Supabase for this phone number
      const { data: matches, error } = await supabase
        .from('orders')
        .select('*')
        .or(`phone.eq.${cleanPhone},phone.ilike.%${cleanPhone.slice(-10)}`);

      if (error) throw error;

      const success = (matches || []).filter(m => 
        ['completed', 'processing', 'delivered'].includes(m.status.toLowerCase())
      ).length;
      
      const failed = (matches || []).filter(m => 
        ['cancelled', 'refunded', 'failed', 'returned'].includes(m.status.toLowerCase())
      ).length;

      res.json({
        total: matches?.length || 0,
        success: success,
        failed: failed
      });
    } catch (err) {
      console.error("Supabase Fetch Error:", err.message);
      res.status(500).json({ error: "Internal Search Failed" });
    }
  });

  // API Route to proxy Steadfast Request
  app.get("/api/check-steadfast/:phone", async (req, res) => {
    const { phone: rawPhone } = req.params;
    let cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.startsWith('88')) cleanPhone = cleanPhone.slice(2);
    const formattedPhone = cleanPhone.length === 10 ? '0' + cleanPhone : cleanPhone;

    const apiKey = process.env.STEADFAST_API_KEY;
    const secretKey = process.env.STEADFAST_SECRET_KEY;

    try {
      const response = await axios.get(`https://portal.steadfast.com.bd/api/v1/check-customer/${formattedPhone}`, {
        headers: { 'api-key': apiKey, 'secret-key': secretKey, 'Content-Type': 'application/json' },
        timeout: 8000
      });
      res.json(response.data);
    } catch (error) {
      try {
          const fallback = await axios.get(`https://steadfast.com.bd/api/v1/check-customer/${formattedPhone}`, {
            headers: { 'api-key': apiKey, 'secret-key': secretKey },
            timeout: 5000
          });
          return res.json(fallback.data);
      } catch (e) {
          res.json({ error: true, message: "Courier Server Sync Error", status: 502 });
      }
    }
  });

  // Health Check Route
  app.get("/health", (req, res) => {
    res.json({ 
      status: "running", 
      time: new Date().toISOString(),
      node_env: process.env.NODE_ENV,
      supabase: !!supabase
    });
  });

  app.get("/api/config", (req, res) => {
    res.json({
      supabaseUrl: process.env.SUPABASE_URL || "",
      supabaseKey: process.env.SUPABASE_ANON_KEY || ""
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Running in DEVELOPMENT mode");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server] Running in PRODUCTION mode");
    const distPath = path.join(process.cwd(), 'dist');
    
    // Serve static files
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        const indexPath = path.join(distPath, 'index.html');
        res.sendFile(indexPath, (err) => {
          if (err) {
            console.error("[Error] index.html not found in dist.");
            res.status(500).send("Build assets found but index.html missing.");
          }
        });
      });
    } else {
      app.get('*', (req, res) => {
        console.warn("[Warning] Running in production but 'dist' folder NOT found. Serving dynamic mode fallback.");
        res.status(200).send(`
          <html>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h1>App is Running!</h1>
              <p>The server is active, but the frontend assets (dist folder) are missing.</p>
              <p>Please make sure you have run <b>npm run build</b> on the server.</p>
              <hr/>
              <p>Current Port: ${PORT}</p>
              <p>Status: Healthy</p>
            </body>
          </html>
        `);
      });
    }
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server is now listening on port ${PORT}`);
  });
}

startServer();
