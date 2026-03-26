# LangChainQS

A LangGraph agent quickstart built with [LangGraph.js](https://github.com/langchain-ai/langgraphjs) — a library for building stateful, multi-actor applications with LLMs.

This project follows the [LangGraph Quickstart](https://langchain-ai.github.io/langgraphjs/tutorials/quickstart/) and implements a simple ReAct-style agent that can use tools to answer questions.

## How It Works

The agent is built as a state graph with two nodes:

1. **agent** – calls the LLM (Claude Sonnet 4.6) with the current conversation and any bound tools
2. **tools** – executes any tool calls requested by the LLM

The graph loops between these nodes until the LLM produces a response with no tool calls, at which point it returns the final answer to the user.

```
__start__ → agent ──(tool calls?)──→ tools → agent → ...
                 └──(no tool calls)──→ __end__
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and add your Anthropic API key:

```bash
cp .env.example .env
```

Then edit `.env`:

```
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

### 3. Run the agent

```bash
npm start
```

## Project Structure

```
src/
  agent.js   – defines tools, the LLM, the state graph, and a main() demo
.env.example – template for required environment variables
package.json
```

## Extending the Agent

- **Add more tools**: Define additional `tool(...)` functions and include them in the `tools` array.
- **Add memory / persistence**: Pass a `checkpointer` (e.g. `MemorySaver`) to `workflow.compile()` to give the agent conversation memory across turns.
- **Add more tools**: Define additional `tool(...)` functions and include them in the `tools` array.
