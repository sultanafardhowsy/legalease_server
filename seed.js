require('dotenv').config();
const { MongoClient } = require('mongodb');

const services = [
  { name: 'Contract Drafting', description: 'Drafting and reviewing legal contracts and agreements.', fee: 150 },
  { name: 'Corporate Law', description: 'Legal advice for business formation, mergers, and compliance.', fee: 200 },
  { name: 'Family Law', description: 'Handling divorce, child custody, and adoption matters.', fee: 120 },
  { name: 'Criminal Defense', description: 'Legal representation for criminal charges and hearings.', fee: 250 },
  { name: 'Immigration Law', description: 'Visa applications, green cards, and citizenship matters.', fee: 180 },
  { name: 'Real Estate Law', description: 'Property transactions, disputes, and title issues.', fee: 160 },
  { name: 'Intellectual Property', description: 'Patents, trademarks, copyrights, and IP disputes.', fee: 220 },
  { name: 'Employment Law', description: 'Workplace disputes, wrongful termination, and HR compliance.', fee: 140 },
  { name: 'Tax Law', description: 'Tax planning, disputes with tax authorities, and compliance.', fee: 190 },
  { name: 'Personal Injury', description: 'Compensation claims for accidents and negligence cases.', fee: 130 },
];

const seed = async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db('legalease_user');
    const serviceCollection = db.collection('services');

    const existing = await serviceCollection.countDocuments();
    if (existing > 0) {
      console.log(`Seed skipped — ${existing} services already exist.`);
      return;
    }

    await serviceCollection.insertMany(services);
    console.log(`✅ Seeded ${services.length} services successfully.`);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  } finally {
    await client.close();
  }
};

seed();