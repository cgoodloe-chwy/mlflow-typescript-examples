import express, { Request, Response } from 'express';
import { OpenAI } from 'openai';
import * as mlflow from 'mlflow-tracing';
import { tracedOpenAI } from 'mlflow-openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Initialize MLflow
mlflow.init({
  trackingUri: process.env.MLFLOW_TRACKING_URI!,
  experimentId: process.env.MLFLOW_EXPERIMENT_ID!,
});

// Create traced OpenAI client
const openai = tracedOpenAI(new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}));

interface ChatRequest {
  message: string;
}

interface ChatHeaders {
  'x-session-id'?: string;
  'x-user-id'?: string;
}

async function processChat(message: string, userId: string, sessionId: string): Promise<string> {
  // Update trace with user and session context
  mlflow.updateCurrentTrace({
    metadata: {
      'mlflow.trace.session': sessionId,
      'mlflow.trace.user': userId,
    }
  });

  // Process chat message using OpenAI API
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: message }
    ],
  });

  return response.choices[0].message.content || '';
}

app.post('/chat', async (req: Request<{}, {}, ChatRequest>, res: Response) => {
  // Extract context from headers
  const headers = req.headers as ChatHeaders;
  const sessionId = headers['x-session-id'] || 'default-session';
  const userId = headers['x-user-id'] || 'default-user';

  try {
    // Process the chat message with OpenAI
    const tracedProcessChat = mlflow.trace(processChat)
    const responseText = await tracedProcessChat(req.body.message, userId, sessionId);
    res.json({ response: responseText });
  } catch (error) {
    console.error('Error processing chat:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Express MLflow Tracing Example' });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
