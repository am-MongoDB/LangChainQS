# LangChainQS

LangGraph.js demo project with MongoDB-backed checkpoint persistence.

The project includes:

1. A small arithmetic agent built with LangGraph and OpenAI-compatible chat completions.
2. MongoDB checkpoint persistence via `MongoDBSaver`.
3. A terminal monitor that watches the `checkpoints` collection and prints decoded, colorized change events.

## What It Demonstrates

This project is set up to show how LangGraph state persists across repeated runs when the same `thread_id` is reused.

The graph maintains two state channels:

1. `messages` via `MessagesValue`
2. `llmCalls` via `ReducedValue`

The current demo prompt in [src/agent.js](src/agent.js) asks:

```text
If previous value exists, add 5 to it. Otherwise, start with 10.
```

If you run the agent multiple times with the same `LANGGRAPH_SESSION_ID`, the prior conversation history is available in the same LangGraph thread and the result continues from the previously stored state.

## How It Works

The graph has two nodes:

1. `llmCall` calls the model with the accumulated message history.
2. `toolNode` executes arithmetic tool calls if the model requested any.

Flow:

```text
__start__ -> llmCall -> toolNode -> llmCall -> ... -> __end__
```

The graph is compiled with a MongoDB checkpointer, so each execution step is written to MongoDB.

## Persistence Model

The MongoDB saver creates two collections:

1. `checkpoints`
Stores full checkpoint snapshots for each `thread_id` and `checkpoint_id`.

2. `checkpoint_writes`
Stores intermediate per-task writes associated with each checkpoint.

This means you can inspect both the full thread state and the incremental writes that produced it.

## Monitor

The monitor script in [src/monitor.js](src/monitor.js) watches the `checkpoints` collection using a MongoDB change stream and prints:

1. the operation type
2. the timestamp
3. the document ID
4. the decoded `checkpoint` object
5. the decoded `metadata` object

The output is colorized when running in a normal terminal.

Use it with:

```bash
npm run monitor
```

Note: MongoDB change streams require a replica set or MongoDB Atlas deployment.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy [/.env.example](.env.example) to `.env` and update the values.

```bash
cp .env.example .env
```

Minimum required settings:

```env
OPENAI_API_KEY=your-openai-api-key-here
MONGODB_URL=mongodb://localhost:27017/langchainqs
LANGGRAPH_SESSION_ID=demo-session
```

Environment variables:

1. `OPENAI_API_KEY`
Used by the chat model client.

2. `MONGODB_URL`
Connection string for the MongoDB database that stores checkpoints.

3. `LANGGRAPH_SESSION_ID`
Optional but important for demos. Reuse the same value to continue the same LangGraph thread across runs.

## Run

Start the agent:

```bash
npm start
```

Start the checkpoint monitor:

```bash
npm run monitor
```

Recommended workflow:

1. Run `npm run monitor` in one terminal.
2. Run `npm start` in another terminal.
3. Re-run `npm start` with the same `LANGGRAPH_SESSION_ID` to watch the thread continue.

## Project Structure

```text
src/
  agent.js      LangGraph agent with MongoDB-backed checkpoint persistence
  monitor.js    Change-stream monitor for decoded checkpoint events
.env.example    Example environment variables
package.json    Project scripts and dependencies
```

## Scripts

```bash
npm start
npm run monitor
```

## Notes

1. The project uses GPT-5.4 through an OpenAI-compatible endpoint configured in [src/agent.js](src/agent.js).
2. The monitor decodes the BSON binary `checkpoint` and `metadata` payloads into readable JSON-like objects before printing them.
3. If you omit `LANGGRAPH_SESSION_ID`, the agent generates a fresh UUID and starts a new thread each run.
