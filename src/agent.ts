import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";

// Define a simple search tool (placeholder for a real search API)
const searchTool = tool(
  async ({ query }: { query: string }) => {
    // In a real application, this would call a search API such as Tavily
    // For the quickstart, we return a mocked response
    if (query.toLowerCase().includes("weather")) {
      return "The weather is sunny with a high of 72°F (22°C).";
    }
    if (query.toLowerCase().includes("langchain") || query.toLowerCase().includes("langgraph")) {
      return "LangChain is a framework for developing applications powered by language models. LangGraph is a library built on top of LangChain for building stateful, multi-actor applications with LLMs using graph-based workflows.";
    }
    return `Search results for "${query}": No specific information found. Please try a more specific query.`;
  },
  {
    name: "search",
    description:
      "Search for information on the web. Use this tool when you need to look up current information or facts.",
    schema: z.object({
      query: z.string().describe("The search query to look up"),
    }),
  }
);

const tools = [searchTool];

// Initialize the language model with tool binding
const model = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
}).bindTools(tools);

// Define the function that calls the model
async function callModel(state: typeof MessagesAnnotation.State) {
  const response = await model.invoke(state.messages);
  return { messages: [response] };
}

// Define the conditional edge: continue to tools or end
function shouldContinue(state: typeof MessagesAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  // If there are tool calls, route to the tools node
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools";
  }
  // Otherwise, stop (reply to the user)
  return "__end__";
}

// Build the state graph
const toolNode = new ToolNode(tools);

const workflow = new StateGraph(MessagesAnnotation)
  .addNode("agent", callModel)
  .addNode("tools", toolNode)
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldContinue)
  .addEdge("tools", "agent");

// Compile the graph into a runnable
export const app = workflow.compile();

// Main function to run the agent
async function main() {
  console.log("LangGraph Agent Quickstart\n");

  const inputs = [
    "What is the weather like today?",
    "What is LangGraph and how does it relate to LangChain?",
    "What is 2 + 2?",
  ];

  for (const userMessage of inputs) {
    console.log(`User: ${userMessage}`);
    const result = await app.invoke({
      messages: [{ role: "user", content: userMessage }],
    });
    const lastMessage = result.messages[result.messages.length - 1];
    console.log(`Assistant: ${lastMessage.content}\n`);
  }
}

main().catch(console.error);
