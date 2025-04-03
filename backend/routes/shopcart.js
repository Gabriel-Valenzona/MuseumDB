const url = require("url");
const db = require("../db"); // Import Database Connection
const authMiddleware = require("../middleware/authMiddleware");

module.exports = (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const method = req.method;

        // Handle CORS
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:5183");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }
    //wrap in auth get customers shopcart based off of the customerid
    else if (parsedUrl.pathname === "/cart" && method === "GET") {
        authMiddleware([])(req, res, () => {
        const customer_ID = req.user.id;
        const query = "select S.Cart_Item_ID, S.Product_ID, S.Quantity, P.Price, P.Name, P.Description, P.Image_URL  FROM products AS P, shopping_cart AS S Where S.Product_ID = P.Product_ID AND S.customer_ID = ? ORDER BY S.Cart_Item_ID ASC;";
        //change this query to link the product table
        db.query(query, [customer_ID], (err, results) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Error retrieving categories", error: err }));
            }
            console.log("Shop Cart Query: ", results);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(results));
            console.log("cart product")
            return; 
        });
    });
    }
    //wrap in auth remove products from shopcart based off customerid
    else if (parsedUrl.pathname === "/cart" && method === "DELETE") {
        authMiddleware([])(req, res, () => {
        let body = "";
    
        req.on("data", chunk => {
            body += chunk;
        });
        req.on("end", () => {
            const cartID = JSON.parse(body);
            const cartItemId = cartID.Cart_Item_ID;
            const customer_ID = req.user.id;
    
        const query = "DELETE from shopping_cart where Cart_Item_ID = ? AND customer_ID = ?;";
        //change this query to link the product table
        db.query(query,[cartItemId, customer_ID], (err, results) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Error deleting from cart", error: err }));
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Item deleted successfully" }));
            console.log("cart product removed")
            return; 
        });
        });
    });
    }
    //wrapped in authmiddleware to update transaction with correct customerid
    else if (parsedUrl.pathname === "/cart" && method === "POST") {
        authMiddleware([])(req, res, () => {
        let body = "";

        req.on("data", chunk => {
            body += chunk;
        });
        req.on("end", () => {
            const {payment_Method, total_amount, products} = JSON.parse(body);
        
        const customer_ID = req.user.id;
        const transactionQuery = "INSERT INTO gift_shop_transactions (customer_ID, Total_Amount, Payment_Method) VALUES (?, ?, ?);";
        //change this query to link the product table
        db.query(transactionQuery,[customer_ID,total_amount, payment_Method], (err, results) => {
            if (err) {
                console.error("Transaction insert error:", err);
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Error purchasing", error: err }));
            }

            const transactionID = results.insertId;

            const itemInserts = products.map(p =>[
                transactionID,
                p.Product_ID,
                p.Quantity,
                p.Price,
            ])

            console.log("Prepared item inserts:", itemInserts);

            const itemQuery = "INSERT INTO gift_shop_items (Transaction_ID, Product_ID, Quantity, Price_Per_Unit) VALUES ?"
            db.query(itemQuery,[itemInserts], (err2) => {
                if (err2) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Error inserting items", error: err2 }));
                }
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Thank You For Your Purchase!" }));
                console.log("gift_shop_items table updated")
                return; 
            });
        });
        });
    }
)}
    
    

}