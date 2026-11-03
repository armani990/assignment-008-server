
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';
import 'dotenv/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const app = express();
const PORT = 8000;

const client = new MongoClient(process.env.MONGODB_URI);

app.use(cors());
app.use(express.json());

// MongoDB connection
await client.connect();
console.log('You successfully connected to MongoDB!');

const db = client.db('test');
const eventsCollection = db.collection('events');
const joinedEventsCollection = db.collection('joinedEvents');

// Prevent duplicate joining
await joinedEventsCollection.createIndex(
  { eventId: 1, userEmail: 1 },
  { unique: true }
);

// Bangladesh date
const getTodayDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
  }).format(new Date());

// Convert event date to YYYY-MM-DD
const getEventDate = (value) => {
  if (!value) return null;

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !isNaN(date) && date.toISOString().slice(0, 10) === value
      ? value
      : null;
  }

  const date = new Date(value);

  return isNaN(date)
    ? null
    : new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Dhaka',
      }).format(date);
};

// Validate event data
const validateEvent = (data) => {
  const fields = ['title', 'description', 'category', 'image', 'location', 'eventDate'];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 'Invalid event data!';
  }

  for (const field of fields) {
    if (typeof data[field] !== 'string' || !data[field].trim()) {
      return `${field} is required!`;
    }
  }

  const eventDate = getEventDate(data.eventDate);

  if (!eventDate) return 'Please provide a valid event date!';
  if (eventDate <= getTodayDate()) return 'Event date must be in the future!';

  return null;
};

// Reusable event fields
const getEventData = (data) => ({
  title: data.title.trim(),
  description: data.description.trim(),
  category: data.category.trim(),
  image: data.image.trim(),
  location: data.location.trim(),
  eventDate: new Date(data.eventDate),
});

// JWT verification
// JWT verification
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'Unauthorized!' });
  }

  try {
    const token = authHeader.slice(7).trim();

    if (!token) {
      return res.status(401).send({ message: 'Unauthorized!' });
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.CLIENT_URL,
      audience: process.env.CLIENT_URL,
    });

    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).send({
      message: 'Invalid or expired token!',
    });
  }
};

// Server status
app.get('/', (req, res) => {
  res.send({ message: 'Server is running' });
});

// Get upcoming events
app.get('/events', async (req, res) => {
  const result = await eventsCollection
    .find({
      eventDate: { $gte: new Date(`${getTodayDate()}T00:00:00+06:00`) },
    })
    .sort({ eventDate: 1 })
    .toArray();

  res.send(result);
});

// Get 6 recent upcoming events
app.get('/events/recent', async (req, res) => {
  const result = await eventsCollection
    .find({
      eventDate: { $gte: new Date(`${getTodayDate()}T00:00:00+06:00`) },
    })
    .sort({ eventDate: 1 })
    .limit(6)
    .toArray();

  res.send(result);
});

// Create event
app.post('/events', verifyToken, async (req, res) => {
  const data = req.body;
  const error = validateEvent(data);

  if (error) return res.status(400).send({ message: error });

  const result = await eventsCollection.insertOne({
    ...getEventData(data),
    creatorId: req.user.sub,
    creatorEmail: req.user.email,
    createdAt: new Date(),
  });

  res.send({
    message: 'Event created successfully!',
    insertedId: result.insertedId,
  });
});

// Get events created by logged-in user
app.get('/events/my-events/:email', verifyToken, async (req, res) => {
  if (req.params.email !== req.user.email) {
    return res.status(403).send({ message: 'Forbidden access!' });
  }

  const result = await eventsCollection
    .find({ creatorId: req.user.sub })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(result);
});

// Update event
app.patch('/events/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const error = validateEvent(req.body);

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: 'Invalid event ID!' });
  }

  if (error) return res.status(400).send({ message: error });

  const result = await eventsCollection.updateOne(
    { _id: new ObjectId(id), creatorId: req.user.sub },
    { $set: getEventData(req.body) }
  );

  if (!result.matchedCount) {
    return res.status(404).send({ message: 'Event not found!' });
  }

  res.send({ message: 'Event updated successfully!' });
});

// Delete event
app.delete('/events/:id', verifyToken, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: 'Invalid event ID!' });
  }

  const result = await eventsCollection.deleteOne({
    _id: new ObjectId(id),
    creatorId: req.user.sub,
  });

  if (!result.deletedCount) {
    return res.status(404).send({ message: 'Event not found!' });
  }

  res.send({ message: 'Event deleted successfully!' });
});

// Join event
app.post('/events/:id/join', verifyToken, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: 'Invalid event ID!' });
  }

  const event = await eventsCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!event) {
    return res.status(404).send({ message: 'Event not found!' });
  }

  const eventDate = getEventDate(event.eventDate);

  if (!eventDate || eventDate < getTodayDate()) {
    return res.status(400).send({
      message: 'You cannot join a past event!',
    });
  }

  try {
    const result = await joinedEventsCollection.insertOne({
      eventId: new ObjectId(id),
      userEmail: req.user.email,
      userId: req.user.sub,
      joinedAt: new Date(),
    });

    res.send({
      message: 'Event joined successfully!',
      insertedId: result.insertedId,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).send({
        message: 'You have already joined this event!',
      });
    }

    res.status(500).send({ message: 'Something went wrong!' });
  }
});

// Get joined events of logged-in user
app.get('/joined-events/:email', verifyToken, async (req, res) => {
  if (req.params.email !== req.user.email) {
    return res.status(403).send({ message: 'Forbidden access!' });
  }

  const joinedEvents = await joinedEventsCollection
    .find({ userEmail: req.user.email })
    .toArray();

  const eventIds = joinedEvents.map((item) => item.eventId);

  const result = await eventsCollection
    .find({ _id: { $in: eventIds } })
    .sort({ eventDate: 1 })
    .toArray();

  res.send(result);
});

// Get single event
app.get('/events/:id', async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: 'Invalid event ID!' });
  }

  const result = await eventsCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!result) {
    return res.status(404).send({ message: 'Event not found!' });
  }

  res.send(result);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});
export default app;