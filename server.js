const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

// Health-check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "healthy",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Intentionally crash the server for testing
app.get("/crash", (req, res) => {
    res.status(200).json({
        message: "Server will crash in 1 second"
    });

    setTimeout(() => {
        console.log("Intentional crash triggered for recovery testing");
        process.exit(1);
    }, 1000);
});

app.get("/", (req, res) => {
    res.json({
        message: "Demo server is running",
        uptime: process.uptime()
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
