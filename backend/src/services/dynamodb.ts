import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { config } from '../config';
import { MeetingRecord } from '../types';

const ddbClient = new DynamoDBClient({ region: config.aws.region });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const TABLE_NAME = config.dynamodb.tableName;

// ---------- In-memory fallback when DynamoDB table is unavailable ----------
const inMemoryStore = new Map<string, MeetingRecord>();
let useInMemory = false;

function warnFallback() {
  if (!useInMemory) {
    console.warn(
      `[DynamoDB] Table "${TABLE_NAME}" not found – using in-memory store. ` +
        'Run "npm run deploy" to create the table.',
    );
    useInMemory = true;
  }
}

// ---------- Public API ----------

export async function saveMeeting(record: MeetingRecord): Promise<void> {
  if (useInMemory) {
    inMemoryStore.set(record.meetingId, record);
    return;
  }
  try {
    // Add a TTL of 24 hours so old records auto-expire
    const ttl = Math.floor(Date.now() / 1000) + 86400;
    await docClient.send(
      new PutCommand({ TableName: TABLE_NAME, Item: { ...record, ttl } }),
    );
  } catch (err: any) {
    if (err.name === 'ResourceNotFoundException') {
      warnFallback();
      inMemoryStore.set(record.meetingId, record);
    } else {
      throw err;
    }
  }
}

export async function getMeetingRecord(
  meetingId: string,
): Promise<MeetingRecord | null> {
  if (useInMemory) {
    return inMemoryStore.get(meetingId) ?? null;
  }
  try {
    const result = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { meetingId } }),
    );
    return (result.Item as MeetingRecord) ?? null;
  } catch (err: any) {
    if (err.name === 'ResourceNotFoundException') {
      warnFallback();
      return inMemoryStore.get(meetingId) ?? null;
    }
    throw err;
  }
}

export async function deleteMeetingRecord(meetingId: string): Promise<void> {
  if (useInMemory) {
    inMemoryStore.delete(meetingId);
    return;
  }
  try {
    await docClient.send(
      new DeleteCommand({ TableName: TABLE_NAME, Key: { meetingId } }),
    );
  } catch (err: any) {
    if (err.name === 'ResourceNotFoundException') {
      warnFallback();
      inMemoryStore.delete(meetingId);
    } else {
      throw err;
    }
  }
}
