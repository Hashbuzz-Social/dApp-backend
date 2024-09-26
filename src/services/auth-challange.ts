import prisma from "@shared/prisma";
import crypto from "crypto";
import moment from "moment";
import { uuid } from "uuidv4";
import hederaService from "./hedera-service";
import RedisClient from "./redis-servie";

const redis = new RedisClient();

type privatePlayload = {
  id: string;
  url: string;
  timestamp: number;
  ip: string;
  fingurePrint: string;
};

const provideAuthChllanageTopicId = async () => {
  try {
    // first check id redis
    const localtopicId = await redis.read("TOPIC_ID:AUTH_CHALLENGE:ACTIVE");
    if (localtopicId) {
      return localtopicId;
    }

    // not found check in DB
    const activeDBTopicRecord = await prisma.hcsTopics.findFirst({
      where: { purpose: "AUTH_CHALLENGE", status: "ACTIVE" },
    });

    if (activeDBTopicRecord?.topicId) {
      await redis.create("TOPIC_ID:AUTH_CHALLENGE:ACTIVE", activeDBTopicRecord.topicId);
      return activeDBTopicRecord.topicId;
    }

    // No record found in DB create a new topic
    const { topicId, transaction, adminKey } = await hederaService.createHcsTopic();
    if (topicId && adminKey) {
      await prisma.hcsTopics.create({
        data: {
          topicId,
          tcTransaction: transaction,
          purpose: "AUTH_CHALLENGE",
          adminKey,
        },
      });
      return topicId;
    }
  } catch (err) {
    throw new Error("Error while getiong active topic id");
  }
};

const generateHash = (payload: object): string => {
  // Create a sorted string representation of the payload
  const payloadString = JSON.stringify(payload, Object.keys(payload).sort());

  // Generate a SHA-256 hash of the payload string
  const hash = crypto.createHash("sha256").update(payloadString).digest("hex");

  return hash;
};

const verifyHash = (payload: object, hash: string): boolean => {
  // Create a sorted string representation of the payload
  const payloadString = JSON.stringify(payload, Object.keys(payload).sort());

  // Generate a SHA-256 hash of the payload string
  const generatedHash = crypto.createHash("sha256").update(payloadString).digest("hex");

  // Compare the generated hash to the provided hash
  return hash === generatedHash;
};

export const generateChallenge = async (ip: string, fingurePrint: string) => {
  try {
    const id = uuid();
    const timestamp = moment.now();
    const payload = { id, url: "hashbuzz.social", timestamp, ip, fingurePrint };
    const hashString = generateHash(payload);
    const topicId = await provideAuthChllanageTopicId();

    if (hashString && topicId) {
      const message = {
        event: "HASHBUZZ_AUTH_CHALLENGE",
        challengeId: id,
        timestamp,
      };
      await Promise.allSettled([
        // storing chalange  metaData in RDS
        await redis.create(
          `AUTH_CHALLENGE:${id}`,
          JSON.stringify({
            payload,
            topicId,
          }),
          300
        ),
        // Log the event in hsc
        await hederaService.submiHcstMessageToTopic({ topicId, message: JSON.stringify(message) }),
      ]);
      return { id: id, message: hashString, timestamp };
    }
  } catch (err) {
    throw new Error("Error while generating auth chalange");
  }
};

export const verifyPayloadChlange = async ({ id, message }: { id: string; message: string; timestamp: number }) => {
  try {
    const chalangeData = await redis.read(`AUTH_CHALLENGE:${id}`);
    if (!chalangeData) {
      throw new Error("Invalid challenge id");
    }
    const { payload, topicId } = JSON.parse(chalangeData) as { payload: privatePlayload; topicId: string };
    const isValid = verifyHash(payload, message);
    if (!isValid) {
      throw new Error("Invalid challenge message");
    }

    return { payload, topicId };
  } catch (err) {
    throw new Error("Error while verifying auth chalange");
  }
};
