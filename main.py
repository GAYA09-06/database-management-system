# backend/main.py
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import oracledb
import os

app = FastAPI(title="Inventory & Orders API", version="1.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# ORACLE DATABASE CONNECTION
# ==========================================
DB_USER = os.getenv("ORACLE_USER", "system")
DB_PASS = os.getenv("ORACLE_PASS", "puj3008")
DB_DSN  = os.getenv("ORACLE_DSN", "localhost:1521/XE")

def get_db():
    connection = None 
    try:
        connection = oracledb.connect(user=DB_USER, password=DB_PASS, dsn=DB_DSN)
        yield connection
    except Exception as e:
        print("DB CONNECTION ERROR", str(e))
        yield None
    finally:
        if connection:  # FIX: only close if successfully opened
            connection.close()

# ==========================================
# Pydantic Schemas
# ==========================================
class LoginModel(BaseModel):
    username: str
    password: str

class SignupModel(BaseModel):
    username: str
    password: str
    address: str
    phone: str

class CartItemModel(BaseModel):
    product_id: int
    quantity: int
    subtotal: float

class CheckoutModel(BaseModel):
    customer_id: int
    payment_method: str
    items: List[CartItemModel]

class ProductModel(BaseModel):
    name: str
    description: str
    price: float
    stock: int

class ProductUpdateModel(BaseModel):
    price: float
    stock: int

# ==========================================
# AUTH ENDPOINTS
# ==========================================

@app.post("/signup")
def signup(data: SignupModel, db: oracledb.Connection = Depends(get_db)):
    """
    Customer self-registration.
    Inserts into USERS (role=CUSTOMER) then CUSTOMERS in one transaction.
    Uses SEQ_USER_ID.NEXTVAL for the new User_ID.
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database Not Connected")
    with db.cursor() as cursor:
        try:
            # Check if username already exists
            cursor.execute("SELECT COUNT(*) FROM USERS WHERE Username = :1", [data.username])
            if cursor.fetchone()[0] > 0:
                raise HTTPException(status_code=400, detail="Username already taken")

            # Insert into USERS
            cursor.execute("""
                INSERT INTO USERS (User_ID, Username, Password, Role)
                VALUES (SEQ_USER_ID.NEXTVAL, :1, :2, 'CUSTOMER')
            """, [data.username, data.password])

            # Insert into CUSTOMERS using CURRVAL (same sequence value just used)
            cursor.execute("""
                INSERT INTO CUSTOMERS (Customer_ID, Address, Phone)
                VALUES (SEQ_USER_ID.CURRVAL, :1, :2)
            """, [data.address, data.phone])

            db.commit()
            return {"message": "Account created successfully. Please log in."}

        except HTTPException:
            raise
        except oracledb.DatabaseError as e:
            error, = e.args
            db.rollback()
            raise HTTPException(status_code=400, detail=error.message)


@app.post("/login")
def login(creds: LoginModel, db: oracledb.Connection = Depends(get_db)):
    if not db:
        raise HTTPException(status_code=500, detail="Database Not Connected")
    with db.cursor() as cursor:
        cursor.execute(
            "SELECT User_ID, Role FROM USERS WHERE Username = :1 AND Password = :2",
            [creds.username, creds.password]
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return {"user_id": row[0], "role": row[1], "username": creds.username}


# ==========================================
# PRODUCT ENDPOINTS
# ==========================================

@app.get("/products")
def get_products(db: oracledb.Connection = Depends(get_db)):
    if not db:
        raise HTTPException(status_code=500, detail="Database Not Connected")
    products = []
    with db.cursor() as cursor:
        cursor.execute(
            "SELECT Product_ID, Name, Description, Price, Stock_Quantity FROM PRODUCTS ORDER BY Product_ID"
        )
        for row in cursor:
            products.append({
                "product_id": row[0],
                "name": row[1],
                "desc": row[2],
                "price": float(row[3]),
                "stock": row[4]
            })
    return products


@app.post("/products")
def add_product(item: ProductModel, db: oracledb.Connection = Depends(get_db)):
    """Employee: Add a new product. Fires SEQ_PRODUCT_ID sequence."""
    if not db:
        raise HTTPException(status_code=500, detail="Database Not Connected")
    with db.cursor() as cursor:
        try:
            cursor.execute("""
                INSERT INTO PRODUCTS (Product_ID, Name, Description, Image_URL, Price, Stock_Quantity)
                VALUES (SEQ_PRODUCT_ID.NEXTVAL, :1, :2, NULL, :3, :4)
            """, [item.name, item.description, item.price, item.stock])
            db.commit()
            return {"message": "Product added successfully"}
        except oracledb.DatabaseError as e:
            error, = e.args
            db.rollback()
            raise HTTPException(status_code=500, detail=error.message)


@app.put("/products/{product_id}")
def update_product(product_id: int, item: ProductUpdateModel, db: oracledb.Connection = Depends(get_db)):
    """
    Employee: Update product price and/or stock.
    This fires TRG_AUDIT_PRODUCT — the BEFORE UPDATE trigger writes
    old and new values into PRODUCT_AUDIT_LOG automatically.
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database Not Connected")
    with db.cursor() as cursor:
        try:
            cursor.execute("""
                UPDATE PRODUCTS
                SET Price = :1, Stock_Quantity = :2
                WHERE Product_ID = :3
            """, [item.price, item.stock, product_id])
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Product not found")
            db.commit()
            return {"message": "Product updated. Audit log entry written."}
        except HTTPException:
            raise
        except oracledb.DatabaseError as e:
            error, = e.args
            db.rollback()
            raise HTTPException(status_code=500, detail=error.message)


@app.delete("/products/{product_id}")
def delete_product(product_id: int, db: oracledb.Connection = Depends(get_db)):
    """Employee: Delete a product from inventory."""
    if not db:
        raise HTTPException(status_code=500, detail="Database Not Connected")
    with db.cursor() as cursor:
        try:
            cursor.execute("DELETE FROM PRODUCTS WHERE Product_ID = :1", [product_id])
            db.commit()
            return {"message": "Product deleted"}
        except oracledb.DatabaseError as e:
            error, = e.args
            db.rollback()
            raise HTTPException(status_code=500, detail=error.message)


# ==========================================
# CHECKOUT ENDPOINT
# ==========================================

@app.post("/checkout")
def process_checkout(data: CheckoutModel, db: oracledb.Connection = Depends(get_db)):
    """
    Flow:
    1. Python cleans + fills CART_TEMP for this customer.
    2. Python calls PL/SQL package ORDER_MGMT_PKG.Complete_Checkout.
    3. PL/SQL uses explicit cursor over CART_TEMP, checks stock,
       inserts ORDER_DETAILS (fires TRG_CALC_TOTAL_AMOUNT trigger),
       deducts stock, inserts PAYMENT, commits or rolls back.
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database Not Connected")
    if not data.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    with db.cursor() as cursor:
        try:
            cursor.execute("DELETE FROM CART_TEMP WHERE Customer_ID = :1", [data.customer_id])

            rows = [(data.customer_id, i.product_id, i.quantity, i.subtotal) for i in data.items]
            cursor.executemany("""
                INSERT INTO CART_TEMP (Customer_ID, Product_ID, Quantity, Subtotal)
                VALUES (:1, :2, :3, :4)
            """, rows)

            status_out = cursor.var(oracledb.DB_TYPE_VARCHAR)
            cursor.callproc("ORDER_MGMT_PKG.Complete_Checkout", [
                data.customer_id,
                data.payment_method,
                status_out
            ])
            result = status_out.getvalue()

            if result == 'SUCCESS':
                return {"message": "Order placed successfully", "status": result}
            else:
                cursor.execute("DELETE FROM CART_TEMP WHERE Customer_ID = :1", [data.customer_id])
                db.commit()
                raise HTTPException(status_code=400, detail=result)

        except HTTPException:
            raise
        except oracledb.DatabaseError as e:
            error, = e.args
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Oracle DB Error: {error.message}")


# ==========================================
# ORDERS ENDPOINT
# ==========================================

@app.get("/orders")
def get_orders(user_id: int, db: oracledb.Connection = Depends(get_db)):
    """
    FIX: Role is now fetched from the DB using user_id,
    not trusted from a URL parameter the frontend sends.
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database Not Connected")

    # Look up role from DB — never trust the frontend for this
    with db.cursor() as cursor:
        cursor.execute("SELECT Role FROM USERS WHERE User_ID = :1", [user_id])
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        role = row[0]

    query = """
        SELECT
            O.Order_ID,
            O.Order_Date,
            O.Total_Amount,
            O.Status,
            P.Payment_Method,
            U.Username AS Customer_Name
        FROM ORDERS O
        LEFT JOIN PAYMENTS P ON O.Order_ID = P.Order_ID
        JOIN USERS U ON O.Customer_ID = U.User_ID
    """
    params = []
    if role == 'CUSTOMER':
        query += " WHERE O.Customer_ID = :id"
        params.append(user_id)

    query += " ORDER BY O.Order_ID DESC"

    orders = []
    with db.cursor() as cursor:
        cursor.execute(query, params)
        for row in cursor:
            orders.append({
                "order_id": row[0],
                "date": row[1].strftime("%Y-%m-%d %H:%M:%S") if row[1] else "N/A",
                "amount": float(row[2]) if row[2] else 0.0,
                "status": row[3],
                "payment_method": row[4],
                "customer": row[5]
            })
    return orders


# ==========================================
# SALES REPORT ENDPOINT
# ==========================================

@app.get("/report")
def get_sales_report(db: oracledb.Connection = Depends(get_db)):
    """
    Reads from V_SALES_REPORT view (defined in seed.sql).
    Shows total units sold and revenue per product, only for COMPLETED orders.
    """
    if not db:
        raise HTTPException(status_code=500, detail="Database Not Connected")
    report = []
    with db.cursor() as cursor:
        cursor.execute(
            "SELECT Product_ID, Name, Total_Units_Sold, Total_Revenue FROM V_SALES_REPORT ORDER BY Total_Revenue DESC"
        )
        for row in cursor:
            report.append({
                "product_id": row[0],
                "name": row[1],
                "units_sold": row[2],
                "revenue": float(row[3])
            })
    return report


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)