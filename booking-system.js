const express = require("express");
const redis = require("redis");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());

const client = redis.createClient({
  url: process.env.REDIS_URL
});

client.connect().catch(console.error);;

const TOTAL_SEATS = 100;
const LOCK_TIMEOUT = 5; // seconds

// Initialize seats
async function initSeats() {
  const exists = await client.exists("seats");
  if (!exists) {
    await client.set("seats", TOTAL_SEATS);
  }
}
initSeats();

app.post("/api/book", async (req, res) => {

  const lockKey = "lock:seat";
  const lockId = uuidv4();

  // Try acquiring lock
  const lock = await client.set(
    lockKey,
    lockId,
    { NX: true, EX: LOCK_TIMEOUT }
  );

  if (!lock) {
    return res.status(409).json({
      success: false,
      message: "Seat is being booked. Try again."
    });
  }

  try {
    const seats = parseInt(await client.get("seats"));

    if (seats <= 0) {
      return res.status(400).json({
        success: false,
        message: "Sold Out"
      });
    }

    await client.decr("seats");

    return res.json({
      success: true,
      bookingId: Date.now(),
      remaining: seats - 1
    });

  } finally {
    const currentLock = await client.get(lockKey);
    if (currentLock === lockId) {
      await client.del(lockKey);
    }
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Booking system running on port ${PORT}`);
});
