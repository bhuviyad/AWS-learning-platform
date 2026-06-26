const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

function makeFakeCredentials() {
  return {
    accessKeyId: `AKIA${Math.random().toString(36).slice(2,12).toUpperCase()}`,
    secretAccessKey: Math.random().toString(36).slice(2,40),
    sessionToken: Math.random().toString(36).repeat(4).slice(0,200),
    expiration: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

app.post('/start-lab', (req, res) => {
  const sessionId = `local-mock-${Date.now()}`;
  const credentials = makeFakeCredentials();
  const response = {
    sessionId,
    credentials,
    consoleUrl: `https://d-9067e65f63.awsapps.com/start/#/?tab=accounts`,
  };
  console.log('[mock] start-lab ->', sessionId);
  res.json(response);
});

app.post('/stop-lab', (req, res) => {
  const { sessionId } = req.body || {};
  console.log('[mock] stop-lab ->', sessionId);
  res.json({ success: true });
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`[mock] Local lab mock running on http://localhost:${port}`));
