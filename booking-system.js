const express = require("express");
const redis = require("redis");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());

// Use REDIS_URL to match your Render Environment Variable name
const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', err => console.error('Redis Client Error', err));

const TOTAL_SEATS = 100;
const LOCK_TIMEOUT = 5; 

// --- ROUTES ---

// 1. Home Route - Fixes the "Cannot GET /" error
app.get('/', (req, res) => {
  res.send(`
    <h1>Booking System is Online</h1>
    <p>Redis status: <b>Connected</b></p>
    <p>To check seats, go to: <a href="/seats">/seats</a></p>
  `);
});

// 2. Check Seats Route - View current count in your browser
app.get("/seats", async (req, res) => {
  try {
    const seats = await client.get("seats");
    res.json({ 
      success: true, 
      current_seats: parseInt(seats),
      message: "Check back after booking to see this number decrease!" 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Booking Logic (POST request)
app.post("/api/book", async (req, res) => {
  const lockKey = "lock:seat";
  const lockId = uuidv4();

  // Try to acquire lock
  const lock = await client.set(lockKey, lockId, { NX: true, EX: LOCK_TIMEOUT });

  if (!lock) {
    return res.status(409).json({ success: false, message: "Seat is being booked. Try again." });
  }

  try {
    const seats = parseInt(await client.get("seats"));
    if (seats <= 0) {
      return res.status(400).json({ success: false, message: "Sold Out" });
    }

    await client.decr("seats");
    return res.json({ success: true, bookingId: Date.now(), remaining: seats - 1 });
  } finally {
    // Release lock only if we own it
    const currentLock = await client.get(lockKey);
    if (currentLock === lockId) {
      await client.del(lockKey);
    }
  }
});

// --- SERVER STARTUP ---

async function initSeats() {
  const exists = await client.exists("seats");
  if (!exists) {
    await client.set("seats", TOTAL_SEATS);
    console.log("Seats initialized to", TOTAL_SEATS);
  }
}

async function startServer() {
  try {
    await client.connect();
    console.log("Connected to Redis");
    
    await initSeats();

    const PORT = process.env.PORT || 10000;
    app.listen(PORT, () => {
      console.log(`Booking system running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
  }
}

startServer();