
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

let eventsCollection;

async function connectToMongoDB() {
  await client.connect();

  const db = client.db('test');
  eventsCollection = db.collection('events');

  console.log('You successfully connected to MongoDB!');
}

app.get('/', (req, res) => {
  res.send({ message: 'Server is running' });
});

// Get all upcoming events
app.get('/events', async (req, res) => {
  const events = await eventsCollection
    .find({ eventDate: { $gte: new Date() } })
    .sort({ eventDate: 1 })
    .toArray();

  res.send(events);
});

// Get 6 recent upcoming events
app.get('/events/recent', async (req, res) => {
  const events = await eventsCollection
    .find({ eventDate: { $gte: new Date() } })
    .sort({ eventDate: 1 })
    .limit(6)
    .toArray();

  res.send(events);
});

// Create new event
app.post('/events', async (req, res) => {
  const {
    title,
    description,
    category,
    image,
    location,
    eventDate,
    creatorEmail,
    creatorId,
  } = req.body;

  const newEvent = {
    title,
    description,
    category,
    image,
    location,
    eventDate: new Date(eventDate),
    creatorEmail,
    creatorId,
    createdAt: new Date(),
  };

  const result = await eventsCollection.insertOne(newEvent);

  res.send({
    message: 'Event created successfully',
    insertedId: result.insertedId,
  });
});

// Get events created by a user
app.get('/events/my-events/:email', async (req, res) => {
  const events = await eventsCollection
    .find({ creatorEmail: req.params.email })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(events);
});

// Update event
app.patch('/events/:id', async (req, res) => {
  const {
    title,
    description,
    category,
    image,
    location,
    eventDate,
    creatorEmail,
  } = req.body;

  const result = await eventsCollection.updateOne(
    {
      _id: new ObjectId(req.params.id),
      creatorEmail,
    },
    {
      $set: {
        title,
        description,
        category,
        image,
        location,
        eventDate: new Date(eventDate),
      },
    }
  );

  if (result.matchedCount === 0) {
    return res.status(404).send({
      message: 'Event not found!',
    });
  }

  res.send({
    message: 'Event updated successfully!',
  });
});

// Delete event
app.delete('/events/:id', async (req, res) => {
  const { creatorEmail } = req.body;

  const result = await eventsCollection.deleteOne({
    _id: new ObjectId(req.params.id),
    creatorEmail,
  });

  if (result.deletedCount === 0) {
    return res.status(404).send({
      message: 'Event not found!',
    });
  }

  res.send({
    message: 'Event deleted successfully!',
  });
});

connectToMongoDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running at ${PORT}`);
  });
});
