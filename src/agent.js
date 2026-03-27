import { tool } from "@langchain/core/tools";
import * as z from "zod";
import "dotenv/config"; 
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { ChatOpenAI } from "@langchain/openai";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import {
  StateGraph,
  StateSchema,
  MessagesValue,
  ReducedValue,
  START,
  END,
} from "@langchain/langgraph";
import { SystemMessage, AIMessage, HumanMessage } from "@langchain/core/messages";

const model = new ChatOpenAI({
  modelName: "gpt-5.4",
  temperature: 0,
  configuration: {
    // You can delete the baseURL to use the default OpenAI API endpoint if 
    // you're not accessing the LLM through the Grove Gateway.
    baseURL: "https://grove-gateway-prod.azure-api.net/grove-foundry-prod/openai/v1",
    apiKey: "placeholder",
    defaultHeaders: {
      "api-key": process.env.OPENAI_API_KEY,
    },
  },
});

// Define tools
const add = tool(({ a, b }) => a + b, {
  name: "add",
  description: "Add two numbers",
  schema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
});

const multiply = tool(({ a, b }) => a * b, {
  name: "multiply",
  description: "Multiply two numbers",
  schema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
});

// Just to show how to create the tool without using a lambda function
const divideFn = function({ a, b }) {
  return a / b;
};

const divide = tool(divideFn, {
  name: "divide",
  description: "Divide two numbers",
  schema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
});

// Tool wiring
const toolsByName = {
  [add.name]: add,
  [multiply.name]: multiply,
  [divide.name]: divide,
};

const tools = Object.values(toolsByName);
const modelWithTools = model.bindTools(tools);

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function createCheckpointer() {
  const mongoUrl = getRequiredEnv("MONGODB_URL");
  const client = new MongoClient(mongoUrl);

  await client.connect();

  return {
    client,
    checkpointer: new MongoDBSaver({ client }),
  };
}


// ==============================
// Step 2: Define state
// ==============================

const MessagesState = new StateSchema({
  messages: MessagesValue,
  llmCalls: new ReducedValue(
    z.number().default(0),
    { reducer: (x, y) => x + y }
  ),
});

// ==============================
// Step 3: Model node
// ==============================

const llmCall = async (state) => {
  const response = await modelWithTools.invoke([
    new SystemMessage(
      "You are a helpful assistant tasked with performing arithmetic on a set of inputs."
    ),
    ...state.messages,
  ]);

  return {
    messages: [response],
    llmCalls: 1,
  };
};


// ==============================
// Step 4: Tool node
// ==============================

const toolNode = async (state) => {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
    return { messages: [] };
  }

  const result = [];

  for (const toolCall of lastMessage.tool_calls ?? []) {
    const tool = toolsByName[toolCall.name];
    const observation = await tool.invoke(toolCall);
    result.push(observation);
  }

  return { messages: result };
};


// ==============================
// Step 5: Conditional routing
// ==============================

const shouldContinue = (state) => {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
    return END;
  }

  if (lastMessage.tool_calls?.length) {
    return "toolNode";
  }

  return END;
};


// ==============================
// Step 6: Build and run agent
// ==============================

function createAgent(checkpointer) {
  return new StateGraph(MessagesState)
    .addNode("llmCall", llmCall)
    .addNode("toolNode", toolNode)
    .addEdge(START, "llmCall")
    .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
    .addEdge("toolNode", "llmCall")
    .compile({ checkpointer });
}

// Invoke
async function main() {
  const sessionId = process.env.LANGGRAPH_SESSION_ID ?? randomUUID();
  const { client, checkpointer } = await createCheckpointer();

  try {
    const agent = createAgent(checkpointer);
    const config = {
      configurable: {
        thread_id: sessionId,
      },
    };
    const result = await agent.invoke(
      {
        messages: [
          new HumanMessage("If previous value exists, add 5 to it. Otherwise, start with 10.")
          // new HumanMessage("Give the result in French")
        ],
      },
      config
    );

    console.log(`Session ID: ${sessionId}`);

    for (const message of result.messages) {
      console.log(`[${message.getType()}]: ${message.text}`);
    }
  } finally {
    await client.close();
  }
}

main().catch(console.error);
