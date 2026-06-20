-- ======================================================================
-- DBS MINI PROJECT - SEED DATA
-- ======================================================================

-- 1. USERS (2 Employees, 2 Customers)
INSERT INTO USERS (User_ID, Username, Password, Role) VALUES (SEQ_USER_ID.NEXTVAL, 'admin1', 'pass123', 'EMPLOYEE');
INSERT INTO USERS (User_ID, Username, Password, Role) VALUES (SEQ_USER_ID.NEXTVAL, 'admin2', 'pass123', 'EMPLOYEE');
INSERT INTO USERS (User_ID, Username, Password, Role) VALUES (SEQ_USER_ID.NEXTVAL, 'johndoe', 'pass123', 'CUSTOMER');
INSERT INTO USERS (User_ID, Username, Password, Role) VALUES (SEQ_USER_ID.NEXTVAL, 'janedoe', 'pass123', 'CUSTOMER');

-- 2. CUSTOMERS
-- Assuming User_ID 3 and 4 are the customers
INSERT INTO CUSTOMERS (Customer_ID, Address, Phone) VALUES (3, '123 Main St, Block A', '9876543210');
INSERT INTO CUSTOMERS (Customer_ID, Address, Phone) VALUES (4, '456 Elm St, Block B', '9876543211');

-- 3. EMPLOYEES
-- Assuming User_ID 1 and 2 are the employees
INSERT INTO EMPLOYEES (Employee_ID, Designation) VALUES (1, 'Inventory Manager');
INSERT INTO EMPLOYEES (Employee_ID, Designation) VALUES (2, 'Sales Associate');

-- 4. PRODUCTS
INSERT INTO PRODUCTS (Product_ID, Name, Description, Price, Stock_Quantity) 
VALUES (SEQ_PRODUCT_ID.NEXTVAL, 'Wireless Mouse', 'Ergonomic 2.4GHz wireless mouse', 25.50, 50);

INSERT INTO PRODUCTS (Product_ID, Name, Description, Price, Stock_Quantity) 
VALUES (SEQ_PRODUCT_ID.NEXTVAL, 'Mechanical Keyboard', 'RGB Backlit mechanical keyboard', 60.00, 30);

INSERT INTO PRODUCTS (Product_ID, Name, Description, Price, Stock_Quantity) 
VALUES (SEQ_PRODUCT_ID.NEXTVAL, '27-inch Monitor', '144Hz 1ms IPS gaming monitor', 250.00, 15);

INSERT INTO PRODUCTS (Product_ID, Name, Description, Price, Stock_Quantity) 
VALUES (SEQ_PRODUCT_ID.NEXTVAL, 'USB-C Hub', '7-in-1 multi-port adapter', 35.00, 100);

-- V_SALES_REPORT VIEW (DBS Analytics Requirement)
CREATE OR REPLACE VIEW V_SALES_REPORT AS
SELECT 
    p.Product_ID, 
    p.Name,
    SUM(od.Quantity) AS Total_Units_Sold,
    SUM(od.Subtotal) AS Total_Revenue
FROM 
    PRODUCTS p
JOIN 
    ORDER_DETAILS od ON p.Product_ID = od.Product_ID
JOIN 
    ORDERS o ON od.Order_ID = o.Order_ID
WHERE 
    o.Status = 'COMPLETED'
GROUP BY 
    p.Product_ID, p.Name;

COMMIT;
