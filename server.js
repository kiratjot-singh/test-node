const express = require("express");

const app = express();

app.get("/test-env", (req, res) => {
    res.json({
        message: process.env.TEST_MESSAGE || "Environment variable not found"
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
