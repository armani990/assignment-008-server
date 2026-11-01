
import express from 'express';
import { MongoClient } from 'mongodb';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = 8000;

app.use(cors());

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

// Get all events
app.get('/events', async (req, res) => {
  const events = await eventsCollection.find().toArray();

  res.send(events);
});

connectToMongoDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running at ${PORT}`);
  });
});
