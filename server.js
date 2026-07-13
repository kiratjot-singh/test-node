const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

// Application state used for failure testing
let isHealthy = true;
let temporaryFailuresRemaining = 0;

/*
|--------------------------------------------------------------------------
| 1. Root endpoint
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.status(200).json({
    message: "FlowForge health recovery test server is running with tunnel yesssssssss",
    pid: process.pid,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/*
|--------------------------------------------------------------------------
| 2. Health endpoint
|--------------------------------------------------------------------------
|
| FlowForge should automatically discover this endpoint.
|
| Normal state:
|   HTTP 200
|
| Unhealthy state:
|   HTTP 503
|
*/

app.get("/health", (req, res) => {
  // Used to test transient failures
  if (temporaryFailuresRemaining > 0) {
    temporaryFailuresRemaining--;

    return res.status(503).json({
      status: "temporarily_unhealthy",
      remainingFailures: temporaryFailuresRemaining,
      pid: process.pid,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }

  if (!isHealthy) {
    return res.status(503).json({
      status: "unhealthy",
      pid: process.pid,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(200).json({
    status: "healthy",
    pid: process.pid,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/*
|--------------------------------------------------------------------------
| 3. Hard crash test
|--------------------------------------------------------------------------
|
| Returns the HTTP response first, then crashes the Node.js process
| after 1 second.
|
| Expected FlowForge behavior:
|
| - Container stops
| - Health probe 1 fails
| - Health probe 2 fails
| - Health probe 3 fails
| - FlowForge explicitly restarts container
| - /health returns 200
| - RECOVERY_SUCCEEDED is recorded
|
*/

app.get("/crash", (req, res) => {
  console.log("[TEST] Hard crash requested");

  res.status(200).json({
    message: "Server will crash in 1 second",
    pid: process.pid,
    uptime: process.uptime(),
  });

  setTimeout(() => {
    console.log("[TEST] Executing process.exit(1)");
    process.exit(1);
  }, 1000);
});

/*
|--------------------------------------------------------------------------
| 4. Application-level unhealthy test
|--------------------------------------------------------------------------
|
| The Node.js process remains alive.
| The Docker container remains running.
| But /health starts returning HTTP 503.
|
| Expected FlowForge behavior:
|
| - Detect HTTP 503
| - Increment consecutiveFailures
| - After threshold, restart container
| - In-memory state resets
| - /health returns HTTP 200 again
|
*/

app.get("/make-unhealthy", (req, res) => {
  console.log("[TEST] Application set to unhealthy state");

  isHealthy = false;

  res.status(200).json({
    message: "Application is now unhealthy",
    healthEndpointWillReturn: 503,
    pid: process.pid,
  });
});

/*
|--------------------------------------------------------------------------
| 5. Manual recovery endpoint
|--------------------------------------------------------------------------
|
| Useful for resetting the app without restarting the container.
|
*/

app.get("/make-healthy", (req, res) => {
  console.log("[TEST] Application manually restored to healthy state");

  isHealthy = true;
  temporaryFailuresRemaining = 0;

  res.status(200).json({
    message: "Application is healthy again",
    pid: process.pid,
    uptime: process.uptime(),
  });
});

/*
|--------------------------------------------------------------------------
| 6. Single transient health failure
|--------------------------------------------------------------------------
|
| The next /health request returns 503 exactly once.
|
| If FlowForge uses HEALTH_FAILURE_THRESHOLD=3:
|
| - Failure count becomes 1
| - Next successful check resets it to 0
| - Container must NOT restart
|
*/

app.get("/fail-once", (req, res) => {
  temporaryFailuresRemaining = 1;

  res.status(200).json({
    message: "The next health check will fail exactly once",
    expectedBehavior:
      "FlowForge should NOT restart the container because threshold is 3",
  });
});

/*
|--------------------------------------------------------------------------
| 7. Multiple transient failures
|--------------------------------------------------------------------------
|
| Example:
|
|   /fail-next/2
|
| Causes next 2 health checks to fail.
| Should NOT trigger recovery if threshold = 3.
|
|   /fail-next/3
|
| Causes next 3 health checks to fail.
| Should trigger recovery.
|
*/


app.get("/fail-next/:count", (req, res) => {
  const count = Number.parseInt(req.params.count, 10);

  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return res.status(400).json({
      error: "Count must be an integer between 1 and 100",
    });
  }

  temporaryFailuresRemaining = count;

  res.status(200).json({
    message: `The next ${count} health checks will return HTTP 503`,
    failureThresholdHint:
      "Use 2 to test no recovery and 3+ to test automatic recovery",
  });
});

/*
|--------------------------------------------------------------------------
| 8. Current test state
|--------------------------------------------------------------------------
*/

app.get("/test-state", (req, res) => {
  res.status(200).json({
    isHealthy,
    temporaryFailuresRemaining,
    pid: process.pid,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/*
|--------------------------------------------------------------------------
| Global error handler
|--------------------------------------------------------------------------
*/

app.use((err, req, res, next) => {
  console.error("[ERROR]", err);

  res.status(500).json({
    error: "Internal server error",
  });
});

/*
|--------------------------------------------------------------------------
| Start server
|--------------------------------------------------------------------------
*/

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[STARTUP] FlowForge test server started`);
  console.log(`[STARTUP] PID: ${process.pid}`);
  console.log(`[STARTUP] Port: ${PORT}`);
  console.log(`[STARTUP] Time: ${new Date().toISOString()}`);
});

/*
|--------------------------------------------------------------------------
| Graceful shutdown
|--------------------------------------------------------------------------
*/

process.on("SIGTERM", () => {
  console.log("[SHUTDOWN] SIGTERM received");

  server.close(() => {
    console.log("[SHUTDOWN] HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[SHUTDOWN] SIGINT received");

  server.close(() => {
    console.log("[SHUTDOWN] HTTP server closed");
    process.exit(0);
  });
});
