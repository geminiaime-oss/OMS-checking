# Step 2: Connecting WooCommerce to Supabase

To get your live orders from WooCommerce into Supabase, you need to set up a **Webhook** in WordPress.

### 1. WordPress WooCommerce Setup
1. Go to **WooCommerce > Settings > Advanced > Webhooks**.
2. Click **Add Webhook**.
3. **Name:** Supabase OMS Ingestion.
4. **Status:** Active.
5. **Topic:** Order created.
6. **Delivery URL:** This will be your **Supabase Edge Function URL**.
7. **Secret:** Keep this safe (used for verification).
8. **API Version:** WP REST API Integration v3.

### 2. The Supabase Edge Function (The Bridge)
Since WooCommerce sends data in its own format, a small "Edge Function" in Supabase is the best way to handle it. 

**What the Edge Function does:**
- Receives the WooCommerce JSON.
- Maps fields like `billing.phone` to `phone`.
- Calculates total values.
- Inserts it into your `orders` table.

### 3. Alternate Method (No-Code)
If you don't want to use Edge Functions, you can use **Make.com** (formerly Integromat) or **Zapier**:
1. **Trigger:** WooCommerce "New Order".
2. **Action:** Supabase "Insert Row".
3. Map the fields manually.

*Note: The SQL trigger we created in Step 1 will automatically normalize the phone number as soon as the data hits the database, regardless of which method you use!*
