-- ======================================================================
-- DBS MINI PROJECT - TRANSACTION PROCESSING LOGIC (PL/SQL)
-- Ensures ACID Properties
-- Contains PL/SQL Packages, Cursors, Exceptions, Triggers
-- ======================================================================

-- 1. TRIGGERS (LAB 10)

-- Trigger to recalculate Total_Amount in ORDERS when ORDER_DETAILS is inserted
CREATE OR REPLACE TRIGGER TRG_CALC_TOTAL_AMOUNT
AFTER INSERT ON ORDER_DETAILS
FOR EACH ROW
BEGIN
    UPDATE ORDERS
    SET Total_Amount = Total_Amount + :NEW.Subtotal
    WHERE Order_ID = :NEW.Order_ID;
END;
/

-- Trigger to Log Product Updates
CREATE OR REPLACE TRIGGER TRG_AUDIT_PRODUCT
BEFORE UPDATE ON PRODUCTS
FOR EACH ROW
BEGIN
    -- Log changes in price or stock into audit table
    INSERT INTO PRODUCT_AUDIT_LOG (
        Audit_ID, Product_ID, Old_Price, New_Price, 
        Old_Stock, New_Stock, Action
    ) VALUES (
        SEQ_AUDIT_ID.NEXTVAL, :NEW.Product_ID, :OLD.Price, :NEW.Price,
        :OLD.Stock_Quantity, :NEW.Stock_Quantity, 'UPDATE'
    );
END;
/

-- 2. PACKAGE SPECIFICATION (LAB 9)
CREATE OR REPLACE PACKAGE ORDER_MGMT_PKG AS
    -- Custom Exception for Lab 7 Requirement
    INSUFFICIENT_STOCK EXCEPTION;
    
    -- Procedure to process checkout seamlessly
    PROCEDURE Complete_Checkout(
        p_Customer_ID IN INT,
        p_Payment_Method IN VARCHAR2,
        p_Status OUT VARCHAR2
    );
END ORDER_MGMT_PKG;
/

-- 3. PACKAGE BODY (Contains Cursors & Exception Handling)
CREATE OR REPLACE PACKAGE BODY ORDER_MGMT_PKG AS

    PROCEDURE Complete_Checkout(
        p_Customer_ID IN INT,
        p_Payment_Method IN VARCHAR2,
        p_Status OUT VARCHAR2
    ) IS
        v_Order_ID INT;
        v_Remaining_Stock INT;
        v_Total_Amount NUMBER;
        v_Cart_Count INT := 0;
        
        -- EXPLICIT CURSOR (Lab 8): Parse the Bridging CART_TEMP Table perfectly
        -- loops through real user selections
        CURSOR c_cart_items IS 
            SELECT Product_ID, Quantity, Subtotal 
            FROM CART_TEMP 
            WHERE Customer_ID = p_Customer_ID;
        
        v_cart_rec c_cart_items%ROWTYPE;
    BEGIN
        -- Check if cart has items first
        SELECT COUNT(*) INTO v_Cart_Count FROM CART_TEMP WHERE Customer_ID = p_Customer_ID;
        IF v_Cart_Count = 0 THEN
            p_Status := 'FAILED: CART EMPTY';
            RETURN;
        END IF;

        -- Start Transaction
        SAVEPOINT st_checkout;

        -- 1. Create Order Record
        v_Order_ID := SEQ_ORDER_ID.NEXTVAL;
        INSERT INTO ORDERS (Order_ID, Customer_ID, Status, Total_Amount) 
        VALUES (v_Order_ID, p_Customer_ID, 'PENDING', 0); -- Total Amount updated by trigger!
        
        -- 2. Parse Cursor (The "Cart")
        OPEN c_cart_items;
        LOOP
            FETCH c_cart_items INTO v_cart_rec;
            EXIT WHEN c_cart_items%NOTFOUND;

            -- Check stock (FOR UPDATE locks the row against concurrent modifications!)
            SELECT Stock_Quantity INTO v_Remaining_Stock 
            FROM PRODUCTS WHERE Product_ID = v_cart_rec.Product_ID FOR UPDATE;

            IF v_Remaining_Stock < v_cart_rec.Quantity THEN
                RAISE INSUFFICIENT_STOCK;
            END IF;

            -- Insert detail (fires the trigger to update running total)
            INSERT INTO ORDER_DETAILS (Order_ID, Product_ID, Quantity, Subtotal) 
            VALUES (v_Order_ID, v_cart_rec.Product_ID, v_cart_rec.Quantity, v_cart_rec.Subtotal);

            -- Deduct stock
            UPDATE PRODUCTS 
            SET Stock_Quantity = Stock_Quantity - v_cart_rec.Quantity
            WHERE Product_ID = v_cart_rec.Product_ID;            
        END LOOP;
        CLOSE c_cart_items;

        -- Fetch newly calculated total amount (Updated via TRG_CALC_TOTAL_AMOUNT)
        SELECT Total_Amount INTO v_Total_Amount FROM ORDERS WHERE Order_ID = v_Order_ID;

        -- 3. Process Payment
        INSERT INTO PAYMENTS (Payment_ID, Order_ID, Amount, Payment_Method, Payment_Status)
        VALUES (SEQ_PAYMENT_ID.NEXTVAL, v_Order_ID, v_Total_Amount, p_Payment_Method, 'SUCCESS');

        -- Finalize Order Status
        UPDATE ORDERS SET Status = 'COMPLETED' WHERE Order_ID = v_Order_ID;

        -- 4. Flush the cart for this customer after success
        DELETE FROM CART_TEMP WHERE Customer_ID = p_Customer_ID;

        COMMIT;
        p_Status := 'SUCCESS';

    EXCEPTION
        WHEN INSUFFICIENT_STOCK THEN
            ROLLBACK TO st_checkout;
            IF c_cart_items%ISOPEN THEN CLOSE c_cart_items; END IF;
            p_Status := 'FAILED: INSUFFICIENT STOCK';
        WHEN OTHERS THEN
            ROLLBACK TO st_checkout;
            IF c_cart_items%ISOPEN THEN CLOSE c_cart_items; END IF;
            p_Status := 'FAILED: SYSTEM ERROR ' || SQLERRM;
    END Complete_Checkout;

END ORDER_MGMT_PKG;
/

-- SHOW ERRORS
SHOW ERRORS PACKAGE BODY ORDER_MGMT_PKG;
