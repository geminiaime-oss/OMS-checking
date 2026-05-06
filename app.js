
let db; // This will hold our Supabase client instance
let currentUser = null;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const ordersList = document.getElementById('orders-list');
const userDisplay = document.getElementById('user-display');
const btnLogout = document.getElementById('btn-logout');
const manualOrderForm = document.getElementById('manual-order-form');
const historyContent = document.getElementById('history-content');
const reliabilityContent = document.getElementById('reliability-content');

// --- INITIALIZATION ---
async function initApp() {
    try {
        const configResp = await fetch('/api/config');
        if (!configResp.ok) throw new Error("Server config fetch failed");
        const config = await configResp.json();
        
        if (!config.supabaseUrl || !config.supabaseKey) {
            console.error("Supabase config missing");
            alert("Configuration Error: Please set SUPABASE_URL and SUPABASE_ANON_KEY in environment variables.");
            return;
        }

        // Initialize Supabase using global 'supabase' object from CDN
        db = supabase.createClient(config.supabaseUrl, config.supabaseKey);
        
        // Initial Auth Check
        const { data: { user } } = await db.auth.getUser();
        if (user) {
            handleLoginSuccess(user);
        }
        
        lucide.createIcons();
    } catch (err) {
        console.error("Init error:", err);
    }
}

// --- AUTH LOGIC ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = document.getElementById('btn-login');

    btn.disabled = true;
    btn.textContent = "Authenticating...";

    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        handleLoginSuccess(data.user);
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "Sign In";
    }
});

function handleLoginSuccess(user) {
    currentUser = user;
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    userDisplay.textContent = user.email;
    userDisplay.classList.remove('hidden');
    loadOrders();
}

btnLogout.addEventListener('click', async () => {
    await db.auth.signOut();
    location.reload();
});

// --- ORDER MANAGEMENT ---
async function loadOrders() {
    if (!db) return;
    
    ordersList.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-slate-400">Loading orders...</td></tr>';

    try {
        const { data: orders, error } = await db
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        
        renderOrders(orders);
        updateMetrics(orders);
    } catch (err) {
        console.error("Fetch error:", err);
    }
}

function renderOrders(orders) {
    ordersList.innerHTML = '';
    orders.forEach(order => {
        const row = document.createElement('tr');
        row.className = "border-b border-slate-100 hover:bg-slate-50/50 transition-all";
        
        // Check for repeat customer (phone exists in other rows)
        const isRepeat = orders.filter(o => o.phone === order.phone).length > 1;
        
        row.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold ${isRepeat ? 'text-red-600 bg-red-50 px-1 rounded' : 'text-slate-900'}">${order.customer_name || 'N/A'}</div>
                <div class="flex items-center gap-1.5 mt-1">
                    <span class="text-xs font-mono text-slate-500">${order.phone}</span>
                    <button onclick="checkHistory('${order.phone}')" class="p-1 hover:bg-indigo-50 rounded text-indigo-600 transition-all" title="View History">
                        <i data-lucide="history" class="w-3.5 h-3.5"></i>
                    </button>
                    ${isRepeat ? '<span class="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold uppercase">Repeat</span>' : ''}
                </div>
            </td>
            <td class="px-6 py-4 max-w-xs">
                <div class="text-sm text-slate-600 line-clamp-2">${order.product_summary || 'No details'}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-xs font-bold text-slate-500 uppercase">Total: ৳${order.total_amount}</div>
                <div class="text-xs text-emerald-600 font-bold mt-0.5">COD: ৳${order.cod_amount || order.total_amount}</div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusColor(order.status)}">
                    ${order.status}
                </span>
            </td>
            <td class="px-6 py-4">
                <textarea 
                    onchange="updateOrderNote('${order.id}', this.value)"
                    class="text-[11px] bg-slate-50 border border-slate-200 rounded p-1.5 focus:ring-1 focus:ring-indigo-500 outline-none w-full h-12 resize-none"
                    placeholder="Add customer note..."
                >${order.internal_note || ''}</textarea>
            </td>
            <td class="px-6 py-4">
                <button onclick="checkReliability('${order.phone}')" class="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-all">
                    <i data-lucide="shield-check" class="w-3.5 h-3.5"></i>
                    Check Reliability
                </button>
            </td>
            <td class="px-6 py-4 text-right">
                 <button class="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all">
                    <i data-lucide="more-vertical" class="w-5 h-5"></i>
                </button>
            </td>
        `;
        ordersList.appendChild(row);
    });
    lucide.createIcons();
}

// Global update function for notes
window.updateOrderNote = async (orderId, newNote) => {
    try {
        const { error } = await db
            .from('orders')
            .update({ internal_note: newNote })
            .eq('id', orderId);
        
        if (error) throw error;
        console.log("Note updated successfully");
    } catch (err) {
        console.error("Update error:", err);
    }
};

function getStatusColor(status) {
    status = (status || '').toLowerCase();
    if (['completed', 'delivered'].includes(status)) return 'bg-emerald-100 text-emerald-700';
    if (['processing', 'pending'].includes(status)) return 'bg-indigo-100 text-indigo-700';
    if (['cancelled', 'failed', 'returned'].includes(status)) return 'bg-red-100 text-red-700';
    return 'bg-slate-100 text-slate-600';
}

function updateMetrics(orders) {
    const today = new Date().toDateString();
    const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === today);
    
    document.getElementById('stat-parcels').textContent = todayOrders.length;
    document.getElementById('stat-sales').textContent = todayOrders.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
    document.getElementById('stat-advance').textContent = todayOrders.reduce((acc, o) => acc + (Number(o.advance_amount) || 0), 0);
    document.getElementById('stat-cod').textContent = todayOrders.reduce((acc, o) => acc + (Number(o.cod_amount) || 0), 0);
}

// --- MANUAL ORDER ---
const btnAddOrder = document.getElementById('btn-add-order');
const modalOrder = document.getElementById('modal-order');

btnAddOrder.addEventListener('click', () => {
    modalOrder.classList.remove('hidden');
});

window.closeOrderModal = () => {
    modalOrder.classList.add('hidden');
    manualOrderForm.reset();
};

manualOrderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = manualOrderForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Saving...";

    const orderData = {
        customer_name: document.getElementById('m-name').value,
        phone: document.getElementById('m-phone').value,
        address: document.getElementById('m-address').value,
        product_summary: document.getElementById('m-products').value,
        total_amount: Number(document.getElementById('m-total').value),
        cod_amount: Number(document.getElementById('m-total').value),
        internal_note: document.getElementById('m-note').value,
        source: 'Manual Entry'
    };

    try {
        const { error } = await db.from('orders').insert([orderData]);
        if (error) throw error;
        
        closeOrderModal();
        loadOrders();
    } catch (err) {
        alert("Error saving order: " + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "Save Order";
    }
});

// --- HISTORY & RELIABILITY ---
window.checkHistory = async (phone) => {
    document.getElementById('modal-history').classList.remove('hidden');
    document.getElementById('modal-phone').textContent = "Checking history for " + phone + "...";
    historyContent.innerHTML = '<div class="p-8 text-center text-slate-400">Loading history...</div>';

    try {
        // Query Supabase for this phone number
        const { data: history, error } = await db
            .from('orders')
            .select('*')
            .or(`phone.eq.${phone},phone.ilike.%${phone.slice(-10)}`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        document.getElementById('modal-phone').textContent = phone;
        
        if (!history || history.length === 0) {
            historyContent.innerHTML = `
                <div class="p-12 text-center text-slate-400">
                    <p>No previous orders found for ${phone}.</p>
                </div>`;
            return;
        }

        historyContent.innerHTML = history.map(h => `
            <div class="bg-white border border-slate-100 rounded-xl p-4 hover:shadow-md transition-all">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <div class="bg-indigo-50 p-1.5 rounded-lg">
                            <i data-lucide="package" class="w-4 h-4 text-indigo-600"></i>
                        </div>
                        <span class="text-sm font-bold text-slate-900">${new Date(h.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusColor(h.status)}">
                        ${h.status}
                    </span>
                </div>
                <div class="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 mb-3 ml-1">
                    ${h.product_summary || 'No product details recorded'}
                </div>
                <div class="flex items-center justify-between text-xs text-slate-500 ml-1">
                    <span>Amount: <b class="text-slate-900">৳${h.total_amount}</b></span>
                    <span>Src: ${h.source || 'Manual'}</span>
                </div>
                
                ${h.internal_note ? `
                    <div class="mt-4 p-3 bg-amber-50 rounded-lg border-l-4 border-amber-400 flex gap-3">
                        <i data-lucide="sticky-note" class="w-4 h-4 text-amber-600 shrink-0 mt-0.5"></i>
                        <div>
                            <p class="text-[10px] font-bold text-amber-700 uppercase mb-0.5">Team Note</p>
                            <p class="text-xs text-slate-700 leading-relaxed font-medium">"${h.internal_note}"</p>
                        </div>
                    </div>
                ` : ''}
            </div>
        `).join('');
        lucide.createIcons();
    } catch (err) {
        historyContent.innerHTML = '<div class="p-8 text-red-500 text-center">Error: ' + err.message + '</div>';
    }
};

window.closeModal = () => document.getElementById('modal-history').classList.add('hidden');

window.checkReliability = async (phone) => {
    document.getElementById('modal-reliability').classList.remove('hidden');
    reliabilityContent.innerHTML = '<div class="p-4 text-center">Checking Steadfast courier records...</div>';

    try {
        const resp = await fetch(`/api/check-steadfast/${phone}`);
        const data = await resp.json();

        if (data.error) throw new Error(data.message);

        reliabilityContent.innerHTML = `
            <div class="space-y-6">
                <!-- Delivery Ratio -->
                <div class="bg-indigo-50 p-6 rounded-2xl text-center">
                    <p class="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">Steadfast Ratio</p>
                    <h4 class="text-5xl font-black text-indigo-900">${data.delivery_ratio || 'N/A'}%</h4>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                        <p class="text-[10px] font-bold text-emerald-600 uppercase mb-1">Success</p>
                        <p class="text-2xl font-bold text-emerald-700">${data.success || 0}</p>
                    </div>
                    <div class="bg-red-50 p-4 rounded-xl border border-red-100">
                        <p class="text-[10px] font-bold text-red-600 uppercase mb-1">Failed</p>
                        <p class="text-2xl font-bold text-red-700">${data.failure || 0}</p>
                    </div>
                </div>

                <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div class="flex items-center gap-2 mb-2">
                        <i data-lucide="info" class="w-4 h-4 text-slate-400"></i>
                        <span class="text-xs font-bold text-slate-500 uppercase">Insights</span>
                    </div>
                    <p class="text-xs text-slate-600 leading-relaxed">
                        This customer has a <b>${data.delivery_ratio}%</b> success rate across the Steadfast network. 
                        ${data.delivery_ratio > 80 ? 'Safe to ship.' : 'Consider taking partial advance to avoid RTO loss.'}
                    </p>
                </div>
            </div>
        `;
        lucide.createIcons();
    } catch (err) {
        reliabilityContent.innerHTML = '<div class="p-4 text-red-500 text-center">Courier connection timed out. Please try again.</div>';
    }
};

window.closeReliabilityModal = () => document.getElementById('modal-reliability').classList.add('hidden');

// --- REFRESH & EXPORT ---
document.getElementById('btn-refresh').addEventListener('click', loadOrders);

document.getElementById('btn-export').addEventListener('click', () => {
    const rows = document.querySelectorAll('#orders-list tr');
    if (rows.length === 0 || rows[0].innerText.includes('Loading')) return;
    
    let csv = "Customer,Phone,Products,Total,Status,Date\n";
    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length < 5) return;
        const name = cols[0].querySelector('.font-bold').innerText;
        const phone = cols[0].querySelector('.text-xs').innerText;
        const products = cols[1].innerText.replace(/,/g, '|');
        const total = cols[2].innerText.split('\n')[0].replace('TOTAL: ৳', '');
        const status = cols[3].innerText.trim();
        const date = new Date().toISOString().split('T')[0];
        
        csv += `"${name}","${phone}","${products}","${total}","${status}","${date}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `OMS_Orders_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
});

// Start the app
initApp();
