# Python Backend & Frontend Presentation Guide

To round out your Viva presentation, your professor will want to know how you connected the Oracle database to the web. The architecture is a **3-Tier Application**: Oracle DB (Data) ⟷ Python FastAPI (Logic) ⟷ HTML/JS (Presentation).

Here is the line-by-line concept breakdown:

---

## 1. Backend (`main.py` - FastAPI)

Your backend runs on **FastAPI**, a modern, high-performance Python web framework. It acts as the "Middleman" between your website and Oracle.

### The Connection Manager (`get_db`)
```python
def get_db():
    connection = oracledb.connect(user=DB_USER, password=DB_PASS, dsn=DB_DSN)
    yield connection
    connection.close()
```
> [!NOTE]
> **Dependency Injection:** Every time a user requests an API endpoint, FastAPI calls `get_db()`. It opens a connection to Oracle, securely hands that connection off to the route, and then *guarantees* that the connection `closes()` securely when the route finishes.

### Pydantic Schemas (Data Validation)
```python
class CheckoutModel(BaseModel):
    customer_id: int
    payment_method: str
    items: List[CartItemModel]
```
> [!TIP]
> Before Python ever talks to Oracle, `Pydantic` acts as a bouncer. If a hacker sends a request without a `customer_id` or an empty `items` array, Pydantic immediately throws a 400 Bad Request error. It guarantees pure data flows into your DB.

### The Crown Jewel API: `/checkout`
```python
@app.post("/checkout")
def process_checkout(data: CheckoutModel, db: oracledb.Connection = Depends(get_db)):
```
When the user clicks "Place Order" on the website, this Python endpoint wakes up and executes ৩ massive SQL steps perfectly wrapped in a single transaction connection block:
1.  **Cleanup:** `DELETE FROM CART_TEMP` where customer equals current user (wipes any old failed carts).
2.  **Bridge Population:** `executemany("INSERT INTO CART_TEMP...")` - Python loops over the JSON `items` array received from JavaScript and bulk inserts them into your Oracle bridging table.
3.  **PL/SQL Trigger:** `cursor.callproc("ORDER_MGMT_PKG.Complete_Checkout")` - Python calls the advanced PL/SQL package to securely deduct stock. It catches the `'SUCCESS'` or `'FAILED'` status and returns it to your website!

---

## 2. Frontend: The Single Page Architecture

Instead of reloading the webpage every click (like PHP or JSP does), we built a modern **Single Page Application (SPA)** using pure Vanilla JavaScript perfectly.

### `index.html`
*   Instead of multiple HTML files, everything is contained inside distinct `<section>` tags (e.g., `<section id="customer-section">`). 
*   We use a simple design pattern: when a user logs in, we add the CSS class `.hidden` to the Login section, and remove the `.hidden` class from the Customer section! This provides an instant, seamless snap between views.

### `app.js` (The Brain of the Website)

#### 1. Fetching Async Data
```javascript
const res = await fetch(`${API_BASE}/products`);
localProducts = await res.json();
```
> [!IMPORTANT]
> The `fetch()` command tells the browser to asynchronously reach out to the Python `localhost:8000` server over the network. The `await` keyword stops JavaScript from crashing while it waits the 50 milliseconds for Python to talk to Oracle and send the data back.

#### 2. Real-Time Stock Logic (The "Wow" Factor)
Your teacher will definitely be impressed by this local logic:
```javascript
// 1. Finding the item
let prod = localProducts.find(p => p.product_id === productId);

// 2. Local State Decrement
prod.stock -= 1; 

// 3. Fast Re-Render
cart.push({ ...prod }); 
renderProducts();
```
When you click "Add to Cart", we *don't* hit Oracle instantly. That would be slow and expensive. Instead, we have a fast, local JavaScript Array array cache (`localProducts`). We subtract `1` from the array's stock property and immediately re-paint the HTML using `renderProducts()`. 

If the user's clicks drive the local array stock to `0`, our Javascript template literal turns red and disables the button:
```javascript
<button class="btn-primary" ${p.stock <= 0 ? 'disabled' : ''}>
```
If the user clicks the little red `X` in their cart to delete an item, `app.js` catches it, simply adds `+ 1` back to `localProducts` array, and re-paints the screen! **Stock only communicates with Oracle when checkout is finalized!**
