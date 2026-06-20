# Database Mini-Project: Backend Explanation Guide

To ace your Viva demonstration, you need to understand exactly *why* we wrote every line of SQL in the `/database` folder. The lab evaluator expects to see a strong grasp of 3NF Design, Constraints, Cursors, Exceptions, and Triggers.

Let's break down your 3 oracle scripts.

---

## 1. `schema.sql` (The Architecture)
This file is the skeleton of your application. It strictly adheres to **Third Normal Form (3NF)** rules by ensuring every non-key attribute depends *only* on the primary key, eliminating data redundancy.

### The Auto-Drop Routine
```sql
BEGIN
  FOR t IN (SELECT table_name FROM user_tables WHERE table_name IN (...)) LOOP
    EXECUTE IMMEDIATE 'DROP TABLE ' || t.table_name || ' CASCADE CONSTRAINTS';
  END LOOP;
```
> [!NOTE] 
> Oracle lacks a simple `DROP TABLE IF EXISTS` command. We wrote this PL/SQL block to find your tables and dynamically drop them *along with their dependent foreign keys* (`CASCADE CONSTRAINTS`). This makes your script infinitely re-runnable!

### The Base Tables (Inheritance)
*   **`USERS`:** The parent table holding `User_ID`, `Username`, `Password`, and a `CHECK` constraint restricting the `Role` strictly to `'CUSTOMER'` or `'EMPLOYEE'`.
*   **`CUSTOMERS` & `EMPLOYEES`:** Instead of throwing all attributes into one massive table, we split them. `Customer_ID` and `Employee_ID` act as both their Primary Key *and* a Foreign Key pointing back to `USERS.User_ID`. This is an **IS-A Relationship** mapping in SQL!

### The Relational Tables
*   **`PRODUCTS`:** Holds inventory. Critically, we enforce `CHECK (Stock_Quantity >= 0)` at the database level to mathematically prevent overselling.
*   **`ORDERS` & `ORDER_DETAILS`:** `ORDERS` stores high-level info (Total Amount, Customer ID). `ORDER_DETAILS` bridges the M:N relationship between Orders and Products, capturing the snapshot `Quantity` and `Subtotal` for that specific checkout moment.
*   **`CART_TEMP`:** A bridging table specifically designed to hold a user's items *before* they click pay. We empty this table when an order succeeds.
*   **`PAYMENTS` & `PRODUCT_AUDIT_LOG`:** Operational tracking tables.

### Sequences
```sql
CREATE SEQUENCE SEQ_USER_ID START WITH 1 INCREMENT BY 1;
```
> [!TIP]
> Unlike MySQL's `AUTO_INCREMENT`, older Oracle databases require **Sequences** to generate unique numbers. We call `SEQ_USER_ID.NEXTVAL` whenever we need a brand-new ID.

---

## 2. `logic.sql` (The 6-Mark Brain)
This file satisfies the bulk of the Lab 7-10 requirements (Procedures, Functions, Packages, Cursors, and Triggers) in your rubrics.

### The Triggers (Lab 10)
1.  **`TRG_CALC_TOTAL_AMOUNT` (`AFTER INSERT_ROW`)**: 
    When an item is inserted into `ORDER_DETAILS`, this trigger fires automatically to locate the parent `ORDERS` row and mathematically add the item's subtotal to the grand `Total_Amount`. You never have to manually calculate the total!
2.  **`TRG_AUDIT_PRODUCT` (`BEFORE UPDATE_ROW`)**: 
    If an employee changes the price or stock of a product, this trigger catches the event *before* it commits, and inserts a log containing both `:OLD.Price` and `:NEW.Price` into your `PRODUCT_AUDIT_LOG` table.

### The Package: `ORDER_MGMT_PKG` (Lab 9)
A Package groups related variables, cursors, and procedures into a single unit (like a class in Java). It has a **Specification** (declaring what functions exist) and a **Body** (the actual code).

### The Procedure: `Complete_Checkout` (Atomicity & ACID)
This is the most important block of code in your project. It processes a customer's cart. 

1.  **The Explicit Cursor (Lab 8):**
    ```sql
    CURSOR c_cart_items IS SELECT Product_ID, Quantity, Subtotal FROM CART_TEMP WHERE Customer_ID = p_Customer_ID;
    ```
    We open this cursor and `FETCH` rows one by one. This allows PL/SQL to natively loop over whatever the customer added to their cart.
    
2.  **Row-Level Locking (Isolation):**
    ```sql
    SELECT Stock_Quantity ... FOR UPDATE;
    ```
    By appending `FOR UPDATE`, Oracle physically locks the product row. If two customers try to checkout the last Mouse at the precise exact millisecond, Oracle forces customer 2 to wait until customer 1's transaction finishes.

3.  **User-Defined Exceptions & Rollbacks (Lab 7 / Atomicity):**
    ```sql
    IF v_Remaining_Stock < v_cart_rec.Quantity THEN
        RAISE INSUFFICIENT_STOCK;
    ...
    EXCEPTION WHEN INSUFFICIENT_STOCK THEN
        ROLLBACK TO st_checkout;
    ```
    If during the loop we realize a product is out of stock, we raise a custom error. The exception handler catches it, safely closes the cursor, and executes a `ROLLBACK`. This destroys the half-made order and releases the locks, leaving the database perfectly clean.

---

## 3. `seed.sql` (Initial Testing Data)
This script inserts fake data so the examiner can actually test your app without having to register accounts from scratch.

*   **Users:** We insert `admin1` and `admin2` (Employees) alongside `johndoe` and `janedoe` (Customers) using the `NEXTVAL` sequence.
*   **Products:** We insert a Mouse, Monitor, Keyboard, and Hub. 

### Complex Query View (Lab 4)
```sql
CREATE OR REPLACE VIEW V_SALES_REPORT AS
SELECT p.Product_ID, p.Name, SUM(od.Quantity), SUM(od.Subtotal) ...
```
> [!IMPORTANT]
> The rubric demands **Complex Queries**. A View is a "virtual table" that runs a query on the fly. `V_SALES_REPORT` uses multiple `JOIN`s linking Inventory to Orders, and aggregate functions (`SUM`, `GROUP BY`) to mathematically calculate how many units of each product have been sold historically, and the total revenue generated by it. This is peak Database Analytics!
