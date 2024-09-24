import prisma from "@shared/prisma";
import crypto from "crypto";
import moment from "moment";
import { uuid } from "uuidv4";
import hederaService from "./hedera-service";
import RedisClient from "./redis-servie";

const redis = new RedisClient();

const provideAuthChllanageTopicId = async () => {
  try {
    const activeTopic = await prisma.hcsTopics.findFirst({
      where: { purpose: "AUTH_CHALLENGE", status: "ACTIVE" },
    });

    if (activeTopic?.topicId) {
      return activeTopic.topicId;
    }

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

export const generateChallenge = async (ip: string, fingurePrint: string) => {
  try {
    const id = uuid();
    const timestamp = moment.now();
    const payload = { id, url: "hashbuzz.social", timestamp, ip, fingurePrint };
    const hashString = generateHash(payload);
    const topicId = await provideAuthChllanageTopicId();

    if (hashString && topicId) {
      const message = {
        event: "Challenge Created",
        challengeId: id,
        timestamp,
      };
      await Promise.allSettled([
        // storing chalange in metaData in RDS
        await redis.create(
          `authChallenge:${id}`,
          JSON.stringify({
            payload,
            hashString,
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
