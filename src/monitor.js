import "dotenv/config";
import { inspect } from "node:util";
import { MongoClient } from "mongodb";

const useColor = Boolean(process.stdout.isTTY);

const colors = {
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  magenta: "\u001b[35m",
  red: "\u001b[31m",
  gray: "\u001b[90m",
  reset: "\u001b[0m",
};

function colorize(text, color) {
  if (!useColor) {
    return text;
  }

  return `${colors[color]}${text}${colors.reset}`;
}

function formatDocument(value) {
  return inspect(value, {
    colors: useColor,
    depth: null,
    compact: false,
    breakLength: 100,
    sorted: false,
  });
}

function getBinaryData(value) {
  if (!value) {
    return null;
  }

  if (value.buffer instanceof Uint8Array) {
    return value.buffer;
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  return null;
}

function decodeTypedValue(type, value) {
  const binary = getBinaryData(value);

  if (!binary) {
    return value;
  }

  if (type === "json") {
    const json = new TextDecoder().decode(binary);
    return JSON.parse(json);
  }

  if (type === "bytes") {
    return Buffer.from(binary).toString("base64");
  }

  return value;
}

function decodeCheckpointDocument(document) {
  if (!document) {
    return document;
  }

  return {
    ...document,
    checkpoint: decodeTypedValue(document.type, document.checkpoint),
    metadata: decodeTypedValue(document.type, document.metadata),
  };
}

async function monitorCheckpoints() {
  const mongoUrl = process.env.MONGODB_URL || "mongodb://localhost:27017/LangChainQS";
  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection("checkpoints");
    const changeStream = collection.watch([], { fullDocument: "updateLookup" });

    console.log(
      `${colorize("Listening for checkpoint changes in database", "cyan")} ${colorize(`"${db.databaseName}"`, "yellow")}...\n`
    );

    changeStream.on("change", (change) => {
      console.log(colorize("-".repeat(60), "gray"));
      console.log(`${colorize("📍 Operation:", "cyan")} ${colorize(change.operationType.toUpperCase(), "green")}`);
      console.log(`${colorize("⏰ Timestamp:", "cyan")} ${colorize(new Date().toISOString(), "yellow")}`);

      if (change.fullDocument) {
        const decodedDocument = decodeCheckpointDocument(change.fullDocument);
        console.log(`\n${colorize("📄 Document:", "magenta")}`);
        console.log(formatDocument(decodedDocument));
      }

      if (change.documentKey) {
        console.log(`\n${colorize("🔑 ID:", "cyan")} ${colorize(String(change.documentKey._id), "yellow")}`);
      }
      console.log(`${colorize("-".repeat(60), "gray")}\n`);
    });

    changeStream.on("error", (error) => {
      console.error(colorize("Change stream error:", "red"), error);
    });

    process.on("SIGINT", async () => {
      await changeStream.close();
      await client.close();
      process.exit(0);
    });
  } catch (error) {
    console.error(colorize("Connection error:", "red"), error);
    process.exit(1);
  }
}

monitorCheckpoints();