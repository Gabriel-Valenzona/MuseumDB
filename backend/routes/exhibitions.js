const url = require("url");
const db = require("../db"); // Import database connection
// const authMiddleware = require("../middleware/authMiddleware"); // Uncomment if needed

module.exports = (req, res) => { 
    const parsedUrl = url.parse(req.url, true);
    const method = req.method;

    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "https://museum-db-kappa.vercel.app");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }

    // GET /manage-exhibition - Retrieve all active exhibitions
    if (parsedUrl.pathname === "/manage-exhibition" && method === "GET") {
        // Optionally use authMiddleware(["staff", "admin"]) here
        db.query("SELECT * FROM exhibitions WHERE is_active = TRUE", (err, results) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Error retrieving exhibitions", error: err }));
            }
            
            // Convert any binary exhibition_image to a Base64 data URL
            const updatedResults = results.map(row => {
                if (row.exhibition_image && Buffer.isBuffer(row.exhibition_image)) {
                    try {
                        row.exhibition_image = `data:image/jpeg;base64,${row.exhibition_image.toString('base64')}`;
                    } catch (conversionErr) {
                        console.error("Error converting image data", conversionErr);
                        row.exhibition_image = null;
                    }
                }
                return row;
            });

            console.log("Exhibitions with converted image data:", updatedResults);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(updatedResults));
        });
        return;
    }

    // POST /manage-exhibition - Add a new exhibition (with auto-ticket creation if required)
if (parsedUrl.pathname === "/manage-exhibition" && method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
        try {
            const exhibition = JSON.parse(body);

            // Convert the Base64 image data (if provided) to a Buffer.
            const imageBuffer = exhibition.exhibition_image_data
                ? Buffer.from(exhibition.exhibition_image_data, "base64")
                : null;

            const sql = `
              INSERT INTO exhibitions 
              (Name, Start_Date, End_Date, Budget, Location, Num_Tickets_Sold, Themes, Num_Of_Artworks, description, exhibition_image, requires_ticket, is_active) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            `;
            const values = [
                exhibition.Name,
                exhibition.Start_Date,
                exhibition.End_Date,
                exhibition.Budget,
                exhibition.Location,
                exhibition.Num_Tickets_Sold || 0,
                exhibition.Themes,
                exhibition.Num_Of_Artworks,
                exhibition.description,
                imageBuffer,  // Insert the binary data (Buffer) for the image
                exhibition.requires_ticket,
                true  // New exhibitions are active by default
            ];
            // Check for required fields, if desired.
            if (values.some(v => v === undefined)) {
                console.error("Missing exhibition field(s):", values);
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Missing required exhibition fields", values }));
            }
            db.query(sql, values, (err, result) => {
                if (err) {
                    console.error("MySQL Insert Error:", err);
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Error adding exhibition", error: err }));
                }
                const exhibition_ID = result.insertId;

                // If the exhibition requires a ticket, automatically create a corresponding ticket
                if (exhibition.requires_ticket) {
                    const ticketSql = `
                      INSERT INTO tickets 
                      (Ticket_Type, Price, Status, Visit_Date, Exhibition_ID) 
                      VALUES (?, ?, 'Available', ?, ?);
                    `;
                    // Optionally, you could set Visit_Date to a default value (e.g., exhibition.Start_Date)
                    const ticketValues = [
                        exhibition.Name,   // Ticket_Type is set to the exhibition's title
                        30,                // Fixed ticket price
                        exhibition.Start_Date, // Using the exhibition's Start_Date for Visit_Date (or customize as needed)
                        exhibition_ID      // Link ticket to the newly created exhibition
                    ];
                    db.query(ticketSql, ticketValues, (ticketErr) => {
                        if (ticketErr) {
                            // Log the error if ticket creation fails.
                            console.error("Error creating automatic ticket:", ticketErr);
                            // Decide whether to notify the client or simply log the error.
                        }
                        res.writeHead(200, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ 
                            message: "Exhibition added successfully with ticket creation", 
                            Exhibition_ID: exhibition_ID 
                        }));
                    });
                } else {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ message: "Exhibition added successfully", Exhibition_ID: exhibition_ID }));
                }
            });
        } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Invalid JSON", error: err.message }));
        }
    });
    return;
}

    // PUT /manage-exhibition - Update an existing exhibition
    if (parsedUrl.pathname === "/manage-exhibition" && method === "PUT") {
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
            try {
                const exhibition = JSON.parse(body);
                if (!exhibition.Exhibition_ID) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Exhibition_ID is required for update" }));
                }
                // Convert the Base64 image data for update, if provided.
                const imageBuffer = exhibition.exhibition_image_data
                    ? Buffer.from(exhibition.exhibition_image_data, "base64")
                    : null;

                const sql = `
                  UPDATE exhibitions 
                  SET Name = ?, Start_Date = ?, End_Date = ?, Budget = ?, Location = ?, Num_Tickets_Sold = ?, Themes = ?, Num_Of_Artworks = ?, description = ?, exhibition_image = ?, requires_ticket = ?, is_active = ?
                  WHERE Exhibition_ID = ?;
                `;
                const values = [
                    exhibition.Name,
                    exhibition.Start_Date,
                    exhibition.End_Date,
                    exhibition.Budget,
                    exhibition.Location,
                    exhibition.Num_Tickets_Sold,
                    exhibition.Themes,
                    exhibition.Num_Of_Artworks,
                    exhibition.description,
                    imageBuffer,
                    exhibition.requires_ticket,
                    exhibition.is_active,
                    exhibition.Exhibition_ID
                ];
                db.query(sql, values, (err, result) => {
                    if (err) {
                        console.error("MySQL Update Error:", err);
                        res.writeHead(500, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ message: "Error updating exhibition", error: err }));
                    }
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ message: "Exhibition updated successfully" }));
                });
            } catch (err) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Invalid JSON", error: err.message }));
            }
        });
        return;
    }

    // DELETE /manage-exhibition - Delete an exhibition (if implemented)
    if (parsedUrl.pathname === "/manage-exhibition" && method === "DELETE") {
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
            try {
                const exhibition = JSON.parse(body);
                if (!exhibition.Exhibition_ID) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Exhibition_ID is required for deletion" }));
                }
                const sql = "DELETE FROM exhibitions WHERE Exhibition_ID = ?;";
                db.query(sql, [exhibition.Exhibition_ID], (err, result) => {
                    if (err) {
                        console.error("MySQL Delete Error:", err);
                        res.writeHead(500, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ message: "Error deleting exhibition", error: err }));
                    }
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ message: "Exhibition deleted successfully" }));
                });
            } catch (err) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Invalid JSON", error: err.message }));
            }
        });
        return;
    }

    // If no matching route is found, return a 404 response.
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Route not found" }));
};

