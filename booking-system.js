const express = require("express");
const redis = require("redis");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());

// 1. Fallback URL so it works on your PC AND Render
const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', err => console.error('Redis Client Error', err));

const TOTAL_SEATS = 100;
const LOCK_TIMEOUT = 5; 

async function initSeats() {
  const exists = await client.exists("seats");
  if (!exists) {
    await client.set("seats", TOTAL_SEATS);
    console.log("Seats initialized to", TOTAL_SEATS);
  }
}

// 2. Wrap startup in an async function
async function startServer() {
  try {
    await client.connect();
    console.log("Connected to Redis");
    
    await initSeats();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Booking system running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
  }
}

// THE BOOKING LOGIC (Stays the same, it's good!)
app.post("/api/book", async (req, res) => {
  const lockKey = "lock:seat";
  const lockId = uuidv4();

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
    const currentLock = await client.get(lockKey);
    if (currentLock === lockId) {
      await client.del(lockKey);
    }
  }
});

// Start the app
startServer();