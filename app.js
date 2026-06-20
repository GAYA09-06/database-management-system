const API_BASE = 'http://localhost:8000';
let currentUser = null;  // { user_id, role, username }
let cart = [];
let localProducts = [];

// ==========================================
// DOM REFERENCES
// ==========================================
const authSection      = document.getElementById('auth-section');
const loginPanel       = document.getElementById('login-panel');
const signupPanel      = document.getElementById('signup-panel');
const customerSection  = document.getElementById('customer-section');
const employeeSection  = document.getElementById('employee-section');
const ordersSection    = document.getElementById('orders-section');
const reportSection    = document.getElementById('report-section');
const navbar           = document.getElementById('navbar');

const loginForm        = document.getElementById('login-form');
const loginError       = document.getElementById('login-error');
const signupForm       = document.getElementById('signup-form');
const signupError      = document.getElementById('signup-error');

const welcomeText      = document.getElementById('welcome-text');
const logoutBtn        = document.getElementById('logout-btn');
const shopBtn          = document.getElementById('shop-btn');
const ordersBtn        = document.getElementById('orders-btn');
const reportBtn        = document.getElementById('report-btn');
const cartBtn          = document.getElementById('cart-btn');
const cartCount        = document.getElementById('cart-count');

const productGrid      = document.getElementById('product-grid');
const inventoryBody    = document.getElementById('inventory-body');
const ordersBody       = document.getElementById('orders-body');
const ordersTitle      = document.getElementById('orders-title');
const reportBody       = document.getElementById('report-body');

const checkoutModal    = document.getElementById('checkout-modal');
const closeModal       = document.getElementById('close-modal');
const cartItemsList    = document.getElementById('cart-items-list');
const checkoutTotalPrice = document.getElementById('checkout-total-price');
const payBtn           = document.getElementById('pay-btn');
const checkoutError    = document.getElementById('checkout-error');

const addItemBtn       = document.getElementById('add-item-btn');
const addItemModal     = document.getElementById('add-item-modal');
const closeAddModal    = document.getElementById('close-add-modal');
const addItemForm      = document.getElementById('add-item-form');

const editItemModal    = document.getElementById('edit-item-modal');
const closeEditModal   = document.getElementById('close-edit-modal');
const editItemForm     = document.getElementById('edit-item-form');

// ==========================================
// SECTION SWITCHER
// ==========================================
function showSection(section) {
    [authSection, customerSection, employeeSection, ordersSection, reportSection]
        .forEach(s => s.classList.add('hidden'));
    section.classList.remove('hidden');
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.background = isError ? 'var(--danger)' : 'var(--success)';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ==========================================
// 1. AUTH — TOGGLE BETWEEN LOGIN & SIGNUP
// ==========================================
document.getElementById('go-to-signup').addEventListener('click', (e) => {
    e.preventDefault();
    loginPanel.classList.add('hidden');
    signupPanel.classList.remove('hidden');
    loginError.textContent = '';
});

document.getElementById('go-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    signupPanel.classList.add('hidden');
    loginPanel.classList.remove('hidden');
    signupError.textContent = '';
});

// ==========================================
// 2. SIGNUP
// ==========================================
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    signupError.textContent = '';

    const payload = {
        username: document.getElementById('signup-username').value.trim(),
        password: document.getElementById('signup-password').value,
        address:  document.getElementById('signup-address').value.trim(),
        phone:    document.getElementById('signup-phone').value.trim()
    };

    try {
        const res = await fetch(`${API_BASE}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Signup failed');

        // On success: pre-fill login form and switch to login panel
        signupForm.reset();
        document.getElementById('username').value = payload.username;
        signupPanel.classList.add('hidden');
        loginPanel.classList.remove('hidden');
        showToast('Account created! Please sign in.');

    } catch (err) {
        signupError.textContent = err.message;
    }
});

// ==========================================
// 3. LOGIN
// ==========================================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';

    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;

    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Login failed');

        currentUser = data; // { user_id, role, username }
        navbar.classList.remove('hidden');
        welcomeText.innerHTML = `Signed in as <b>${u}</b>`;

        // Show correct nav buttons per role
        if (data.role === 'CUSTOMER') {
            cartBtn.classList.remove('hidden');
            shopBtn.classList.remove('hidden');
            shopBtn.textContent = 'Products';
            ordersBtn.classList.remove('hidden');
            reportBtn.classList.add('hidden');
            loadCustomerStore();
        } else {
            // EMPLOYEE
            cartBtn.classList.add('hidden');
            shopBtn.classList.remove('hidden');
            shopBtn.textContent = 'Inventory';
            ordersBtn.classList.remove('hidden');
            reportBtn.classList.remove('hidden');
            loadEmployeeDashboard();
        }

    } catch (err) {
        loginError.textContent = err.message || 'Server error. Is the backend running?';
    }
});

// ==========================================
// 4. LOGOUT
// ==========================================
logoutBtn.addEventListener('click', () => {
    currentUser = null;
    cart = [];
    localProducts = [];
    updateCartIcon();
    navbar.classList.add('hidden');
    // Hide all nav buttons for clean state
    [shopBtn, ordersBtn, reportBtn, cartBtn].forEach(b => b.classList.add('hidden'));
    loginForm.reset();
    loginError.textContent = '';
    signupPanel.classList.add('hidden');
    loginPanel.classList.remove('hidden');
    showSection(authSection);
});

// Nav button listeners
shopBtn.addEventListener('click', () => {
    if (currentUser.role === 'CUSTOMER') loadCustomerStore();
    else loadEmployeeDashboard();
});
ordersBtn.addEventListener('click', loadOrderHistory);
reportBtn.addEventListener('click', loadSalesReport);

// ==========================================
// 5. CUSTOMER STOREFRONT
// ==========================================
async function loadCustomerStore() {
    showSection(customerSection);
    productGrid.innerHTML = '<p>Loading products...</p>';

    try {
        const res = await fetch(`${API_BASE}/products`);
        if (!res.ok) throw new Error('DB Error');
        localProducts = await res.json();

        // Adjust displayed stock for items already in cart
        cart.forEach(cartItem => {
            const prod = localProducts.find(p => p.product_id === cartItem.product_id);
            if (prod) prod.stock -= cartItem.quantity;
        });

        renderProducts();
    } catch (err) {
        productGrid.innerHTML = '<p class="error-text">Failed to load products. Is the backend running?</p>';
    }
}

function renderProducts() {
    productGrid.innerHTML = '';
    localProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="product-title">${p.name}</div>
            <div class="product-desc">${p.desc || 'No description available.'}</div>
            <div class="product-stock ${p.stock <= 0 ? 'out' : ''}">Stock: ${p.stock} units</div>
            <div class="product-footer">
                <div class="product-price">$${p.price.toFixed(2)}</div>
                <button class="btn-primary" onclick="addToCart(${p.product_id})" ${p.stock <= 0 ? 'disabled' : ''}>
                    ${p.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
                </button>
            </div>
        `;
        productGrid.appendChild(card);
    });
}

function addToCart(productId) {
    const prod = localProducts.find(p => p.product_id === productId);
    if (!prod || prod.stock <= 0) return;

    prod.stock -= 1;

    // Increment quantity if already in cart instead of duplicate entry
    const existing = cart.find(c => c.product_id === productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ ...prod, quantity: 1 });
    }

    updateCartIcon();
    renderProducts();
    showToast(`${prod.name} added to cart!`);
}

// ==========================================
// 6. CART & CHECKOUT
// ==========================================
function updateCartIcon() {
    const total = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = total;
}

cartBtn.addEventListener('click', () => {
    checkoutModal.classList.remove('hidden');
    renderCart();
});
closeModal.addEventListener('click', () => checkoutModal.classList.add('hidden'));

function renderCart() {
    cartItemsList.innerHTML = '';
    let total = 0;

    if (cart.length === 0) {
        cartItemsList.innerHTML = '<p style="color:var(--text-secondary)">Your cart is empty.</p>';
        checkoutTotalPrice.textContent = '0.00';
        payBtn.disabled = true;
        return;
    }

    payBtn.disabled = false;
    cart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        cartItemsList.innerHTML += `
            <div class="cart-item">
                <span class="cart-item-name">${item.name} &times; ${item.quantity}</span>
                <span class="cart-item-price">
                    $${itemTotal.toFixed(2)}
                    <a href="#" style="color:var(--danger);margin-left:10px;text-decoration:none;"
                       onclick="removeFromCart(${index}); return false;">&times;</a>
                </span>
            </div>
        `;
    });
    checkoutTotalPrice.textContent = total.toFixed(2);
}

window.removeFromCart = function(index) {
    const item = cart[index];
    const prod = localProducts.find(p => p.product_id === item.product_id);

    if (item.quantity > 1) {
        item.quantity -= 1;
        if (prod) prod.stock += 1;
    } else {
        cart.splice(index, 1);
        if (prod) prod.stock += 1;
    }

    updateCartIcon();
    renderCart();
    if (!customerSection.classList.contains('hidden')) renderProducts();
};

// Payment card selection
document.querySelectorAll('.payment-card').forEach(card => {
    card.addEventListener('click', function () {
        document.querySelectorAll('.payment-card').forEach(c => c.classList.remove('active-payment'));
        this.classList.add('active-payment');
        this.querySelector('input[type="radio"]').checked = true;
    });
});

payBtn.addEventListener('click', async () => {
    const method = document.querySelector('input[name="payment"]:checked').value;

    // Cart is already grouped by product_id with quantities
    const checkoutItems = cart.map(c => ({
        product_id: c.product_id,
        quantity: c.quantity,
        subtotal: parseFloat((c.price * c.quantity).toFixed(2))
    }));

    try {
        payBtn.disabled = true;
        checkoutError.textContent = 'Processing Oracle transaction...';

        const res = await fetch(`${API_BASE}/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customer_id: currentUser.user_id,
                payment_method: method,
                items: checkoutItems
            })
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.detail || 'Server Error');

        checkoutModal.classList.add('hidden');
        cart = [];
        updateCartIcon();
        checkoutError.textContent = '';
        showToast('Order placed successfully!');
        loadOrderHistory();

    } catch (err) {
        checkoutError.textContent = err.message;
    } finally {
        payBtn.disabled = false;
    }
});

// ==========================================
// 7. ORDER HISTORY
// ==========================================
async function loadOrderHistory() {
    showSection(ordersSection);
    ordersTitle.textContent = currentUser.role === 'EMPLOYEE' ? 'Global Order Registry' : 'My Order History';
    ordersBody.innerHTML = '<tr><td colspan="6">Fetching orders...</td></tr>';

    try {
        // FIX: only send user_id — backend looks up role from DB
        const res = await fetch(`${API_BASE}/orders?user_id=${currentUser.user_id}`);
        if (!res.ok) throw new Error('DB Error');
        const orders = await res.json();

        ordersBody.innerHTML = '';
        if (orders.length === 0) {
            ordersBody.innerHTML = '<tr><td colspan="6">No orders found.</td></tr>';
            return;
        }

        orders.forEach(o => {
            const statusClass = o.status === 'COMPLETED' ? 'status-completed' : 'status-pending';
            ordersBody.innerHTML += `
                <tr>
                    <td><strong>#${o.order_id}</strong></td>
                    <td><small>${o.date}</small></td>
                    <td><strong>${o.customer}</strong></td>
                    <td><strong>$${o.amount.toFixed(2)}</strong></td>
                    <td>${o.payment_method || '—'}</td>
                    <td><span class="status-pill ${statusClass}">${o.status}</span></td>
                </tr>
            `;
        });
    } catch (err) {
        ordersBody.innerHTML = `<tr><td colspan="6" class="error-text">Failed to load orders.</td></tr>`;
    }
}

// ==========================================
// 8. SALES REPORT (Employee — reads V_SALES_REPORT)
// ==========================================
async function loadSalesReport() {
    showSection(reportSection);
    reportBody.innerHTML = '<tr><td colspan="4">Loading report from V_SALES_REPORT...</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/report`);
        if (!res.ok) throw new Error('DB Error');
        const data = await res.json();

        reportBody.innerHTML = '';
        if (data.length === 0) {
            reportBody.innerHTML = '<tr><td colspan="4">No completed orders yet. Place some orders first.</td></tr>';
            return;
        }

        data.forEach(r => {
            reportBody.innerHTML += `
                <tr>
                    <td>#${r.product_id}</td>
                    <td><strong>${r.name}</strong></td>
                    <td>${r.units_sold} units</td>
                    <td><strong style="color:var(--success)">$${r.revenue.toFixed(2)}</strong></td>
                </tr>
            `;
        });
    } catch (err) {
        reportBody.innerHTML = `<tr><td colspan="4" class="error-text">Failed to load report.</td></tr>`;
    }
}

// ==========================================
// 9. EMPLOYEE — INVENTORY MANAGEMENT
// ==========================================
async function loadEmployeeDashboard() {
    showSection(employeeSection);
    inventoryBody.innerHTML = '<tr><td colspan="5">Loading inventory...</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/products`);
        const products = await res.json();

        inventoryBody.innerHTML = '';
        products.forEach(p => {
            inventoryBody.innerHTML += `
                <tr>
                    <td>#${p.product_id}</td>
                    <td>
                        <strong>${p.name}</strong>
                        <small>${p.desc || 'No description'}</small>
                    </td>
                    <td>$${p.price.toFixed(2)}</td>
                    <td><strong>${p.stock}</strong> units</td>
                    <td>
                        <button class="btn-primary"
                            style="padding:6px 12px;font-size:0.85rem;margin-right:6px;"
                            onclick="openEditModal(${p.product_id}, '${p.name.replace(/'/g, "\\'")}', ${p.price}, ${p.stock})">
                            Edit
                        </button>
                        <button class="btn-danger"
                            style="padding:6px 12px;font-size:0.85rem;"
                            onclick="deleteProduct(${p.product_id})">
                            Delete
                        </button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        inventoryBody.innerHTML = '<tr><td colspan="5" class="error-text">Failed to load inventory.</td></tr>';
    }
}

// ADD PRODUCT
addItemBtn.addEventListener('click', () => addItemModal.classList.remove('hidden'));
closeAddModal.addEventListener('click', () => addItemModal.classList.add('hidden'));

addItemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        name:        document.getElementById('new-name').value,
        description: document.getElementById('new-desc').value,
        price:       parseFloat(document.getElementById('new-price').value),
        stock:       parseInt(document.getElementById('new-stock').value)
    };
    try {
        const res = await fetch(`${API_BASE}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Failed to add product');
        addItemModal.classList.add('hidden');
        addItemForm.reset();
        showToast('Product added to database!');
        loadEmployeeDashboard();
    } catch (err) {
        showToast('Connection failed', true);
    }
});

// DELETE PRODUCT
window.deleteProduct = async function(id) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
        await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
        showToast('Product deleted', true);
        loadEmployeeDashboard();
    } catch (e) {
        showToast('Server error', true);
    }
};

// EDIT PRODUCT — opens modal pre-filled, fires TRG_AUDIT_PRODUCT on save
window.openEditModal = function(id, name, price, stock) {
    document.getElementById('edit-product-id').value = id;
    document.getElementById('edit-product-name').value = name;
    document.getElementById('edit-price').value = price;
    document.getElementById('edit-stock').value = stock;
    document.getElementById('edit-error').textContent = '';
    editItemModal.classList.remove('hidden');
};

closeEditModal.addEventListener('click', () => editItemModal.classList.add('hidden'));

editItemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id    = document.getElementById('edit-product-id').value;
    const price = parseFloat(document.getElementById('edit-price').value);
    const stock = parseInt(document.getElementById('edit-stock').value);

    try {
        const res = await fetch(`${API_BASE}/products/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ price, stock })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Update failed');

        editItemModal.classList.add('hidden');
        editItemForm.reset();
        showToast('Product updated. Audit log entry written!');
        loadEmployeeDashboard();
    } catch (err) {
        document.getElementById('edit-error').textContent = err.message;
    }
});